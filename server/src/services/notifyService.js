'use strict';

const { EVENTS, getWorkflowEvent } = require('./notifyCatalog');
const { getSocketServer } = require('./socketServer');

const normalizeRooms = rooms => {
    const list = Array.isArray(rooms) ? rooms : rooms ? [rooms] : ['store:default'];
    return [...new Set(list.map(room => String(room || '').trim()).filter(Boolean))];
};

const emitToRooms = (eventName, payload = {}, rooms) => {
    try {
        const io = getSocketServer();
        const targets = normalizeRooms(rooms);
        if (!io || !targets.length) return false;
        io.to(targets).emit(eventName, payload);
        return true;
    } catch (error) {
        console.warn(`Socket notification skipped: ${error.message}`);
        return false;
    }
};

const emitInboxRefresh = (meta = {}) => {
    const payload = {
        seq: Number(meta.seq || 0),
        at: meta.at || new Date().toISOString(),
        action: String(meta.action || ''),
        table: String(meta.table || '')
    };
    return emitToRooms(EVENTS.INBOX_REFRESH, payload, meta.rooms || meta.room);
};

const emitProbe = (payload = {}, rooms) => emitToRooms(EVENTS.PROBE, {
    at: new Date().toISOString(),
    ...payload
}, rooms);

const emitReadUpdated = (maNV, payload = {}) => {
    const employee = clean(maNV, 20);
    if (!employee) return false;
    return emitToRooms(EVENTS.READ_UPDATED, {
        at: new Date().toISOString(),
        ...payload
    }, userRoom(employee));
};

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const userRoom = maNV => `user:${clean(maNV, 20).toUpperCase()}`;
const permissionRoom = code => `perm:${clean(code, 20).toUpperCase()}`;

const buildWorkflowNotification = (eventKey, context = {}) => {
    const definition = getWorkflowEvent(eventKey);
    if (!definition) throw new Error(`Sự kiện thông báo chưa được khai báo: ${eventKey}`);
    const entityId = clean(context.entityId, 100);
    if (!entityId) throw new Error('Thiếu mã chứng từ cho thông báo.');
    const status = clean(context.status || definition.status, 80);
    return {
        eventKey,
        entityType: clean(definition.entityType, 80),
        entityId,
        status,
        idempotencyKey: clean(`${eventKey}:${entityId}:${status}`, 200),
        title: clean(definition.title({ ...context, entityId }), 200),
        detail: clean(definition.detail({ ...context, entityId }), 1000),
        tone: clean(context.tone || (status === 'Từ chối' ? 'warning' : 'info'), 20),
        target: clean(context.target || definition.target, 200),
        actorMaNV: clean(context.actor?.MaNV || context.actorMaNV, 20) || null,
        permission: clean(context.permission || definition.permission, 20) || null,
        recipientUsers: [...new Set((context.recipientUsers || []).map(value => clean(value, 20)).filter(Boolean))]
    };
};

const loadActiveAccounts = async connection => {
    const { sql } = require('../config/db');
    return new sql.Request(connection).query(`
        SELECT DISTINCT nv.MaNV, tk.MaVaiTro, vt.TenVaiTro
        FROM dbo.NhanVien nv
        JOIN dbo.TaiKhoan tk ON tk.MaNV=nv.MaNV
        LEFT JOIN dbo.VaiTro vt ON vt.MaVaiTro=tk.MaVaiTro
        WHERE tk.TrangThai=1 AND ISNULL(nv.TrangThai,N'Đang làm việc')=N'Đang làm việc'`);
};

const resolveRecipients = async (connection, notification, dependencies = {}) => {
    const accountsResult = dependencies.accountLoader
        ? await dependencies.accountLoader(connection)
        : await loadActiveAccounts(connection);
    const accounts = accountsResult.recordset || accountsResult || [];
    const wanted = new Set((notification.recipientUsers || []).map(value => clean(value, 20).toUpperCase()));
    const actor = clean(notification.actorMaNV, 20).toUpperCase();
    const permissionLoader = dependencies.permissionLoader
        || require('./effectivePermissions').loadEffectiveCodes;
    const resolved = [];
    for (const account of accounts) {
        const maNV = clean(account.MaNV, 20);
        if (!maNV || maNV.toUpperCase() === actor) continue;
        if (wanted.has(maNV.toUpperCase())) {
            resolved.push(maNV);
            continue;
        }
        if (notification.permission) {
            const permissions = await permissionLoader(connection, account);
            if (permissions.includes(notification.permission)) resolved.push(maNV);
        }
    }
    return [...new Set(resolved)];
};

const persistNotification = async (connection, notification, recipients, dependencies = {}) => {
    const { sql } = require('../config/db');
    const ensureSchema = dependencies.ensureSchema || require('./notifySchema').ensureNotifySchema;
    await ensureSchema(connection);
    const transaction = dependencies.transactionFactory
        ? dependencies.transactionFactory(connection)
        : new sql.Transaction(connection);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const existing = await new sql.Request(transaction)
            .input('IdempotencyKey', sql.VarChar, notification.idempotencyKey)
            .query(`SELECT MaSuKien FROM dbo.ThongBaoSuKien WITH(UPDLOCK,HOLDLOCK)
                    WHERE IdempotencyKey=@IdempotencyKey`);
        if (existing.recordset.length) {
            await transaction.commit();
            return { created: false, duplicate: true, eventId: existing.recordset[0].MaSuKien };
        }
        const inserted = await new sql.Request(transaction)
            .input('EventKey', sql.VarChar, notification.eventKey)
            .input('EntityType', sql.VarChar, notification.entityType)
            .input('EntityId', sql.VarChar, notification.entityId)
            .input('IdempotencyKey', sql.VarChar, notification.idempotencyKey)
            .input('Title', sql.NVarChar, notification.title)
            .input('Detail', sql.NVarChar, notification.detail)
            .input('Tone', sql.VarChar, notification.tone)
            .input('Target', sql.VarChar, notification.target)
            .input('ActorMaNV', sql.VarChar, notification.actorMaNV)
            .input('PayloadJson', sql.NVarChar, JSON.stringify({ status: notification.status }))
            .query(`INSERT dbo.ThongBaoSuKien
                    (EventKey,EntityType,EntityId,IdempotencyKey,Title,Detail,Tone,Target,ActorMaNV,PayloadJson)
                    OUTPUT inserted.MaSuKien
                    VALUES(@EventKey,@EntityType,@EntityId,@IdempotencyKey,@Title,@Detail,@Tone,@Target,@ActorMaNV,@PayloadJson)`);
        const eventId = inserted.recordset[0].MaSuKien;
        for (const maNV of recipients) {
            await new sql.Request(transaction)
                .input('MaSuKien', sql.BigInt, eventId)
                .input('MaNV', sql.VarChar, maNV)
                .query(`INSERT dbo.ThongBaoNguoiNhan(MaSuKien,MaNV)
                        VALUES(@MaSuKien,@MaNV)`);
        }
        await transaction.commit();
        return { created: true, duplicate: false, eventId };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

const routeRooms = (notification, recipients = []) => {
    const rooms = recipients.map(userRoom);
    if (!rooms.length && notification.permission) rooms.push(permissionRoom(notification.permission));
    if (!rooms.length) rooms.push(...notification.recipientUsers.map(userRoom));
    return normalizeRooms(rooms).filter(room => room !== 'store:default');
};

const notifyTargetedRefresh = (notification, recipients, dependencies = {}) => {
    const rooms = routeRooms(notification, recipients);
    if (!rooms.length) return false;
    const notify = dependencies.notify || (meta => require('./notificationHub').notifyInboxChanged(meta));
    notify({
        action: notification.eventKey,
        table: notification.entityType,
        recordId: notification.entityId,
        rooms
    });
    return true;
};

const publishWorkflowNotification = async (connection, eventKey, context = {}, dependencies = {}) => {
    const notification = buildWorkflowNotification(eventKey, context);
    const recipientResolver = dependencies.resolveRecipients || resolveRecipients;
    const recipients = await recipientResolver(connection, notification, dependencies);
    if (!recipients.length) return { created: false, duplicate: false, recipients, notification, skipped: 'no-recipients' };
    const persist = dependencies.persist || persistNotification;
    const persisted = await persist(connection, notification, recipients, dependencies);
    if (persisted.created) notifyTargetedRefresh(notification, recipients, dependencies);
    return { ...persisted, recipients, notification };
};

const publishAfterCommit = async (connection, eventKey, context = {}, dependencies = {}) => {
    let notification;
    try {
        notification = buildWorkflowNotification(eventKey, context);
        return await publishWorkflowNotification(connection, eventKey, context, dependencies);
    } catch (error) {
        console.error(`Notification ${eventKey}:`, error.message);
        if (notification) notifyTargetedRefresh(notification, [], dependencies);
        return { created: false, duplicate: false, error: error.message, notification };
    }
};

module.exports = {
    normalizeRooms,
    emitToRooms,
    emitInboxRefresh,
    emitProbe,
    emitReadUpdated,
    userRoom,
    permissionRoom,
    buildWorkflowNotification,
    resolveRecipients,
    persistNotification,
    routeRooms,
    notifyTargetedRefresh,
    publishWorkflowNotification,
    publishAfterCommit
};
