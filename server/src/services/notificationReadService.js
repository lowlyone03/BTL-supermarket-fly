'use strict';

const MAX_KEY_LENGTH = 220;
const MAX_READ_KEYS = 2000;

const ENTITY_BY_PREFIX = Object.freeze({
    po: 'DonMuaHang',
    'po-fix': 'DonMuaHang',
    px: 'PhieuXuat',
    kk: 'KiemKe',
    'kk-reject': 'KiemKe',
    'kk-drift': 'KiemKe',
    dt: 'PhieuDoiTra',
    'dt-cash': 'PhieuDoiTra',
    'dt-left': 'PhieuDoiTra',
    'dt-rf': 'PhieuDoiTra',
    'dt-ok': 'PhieuDoiTra',
    'dt-wait': 'PhieuDoiTra',
    'dt-no': 'PhieuDoiTra',
    pc: 'PhieuChi',
    'pc-pay': 'PhieuChi',
    'pc-no': 'PhieuChi',
    cc: 'ChamCong',
    dn: 'DeNghiMuaHang',
    lich: 'LichLamViec',
    gh: 'ThongBaoGiaoHang',
    pn: 'PhieuNhap',
    hdmh: 'HoaDonMuaHang',
    ca: 'CaLamViec',
    pt: 'PhieuThu',
    pcl: 'PhieuChiLuong',
    'pcl-pay': 'PhieuChiLuong',
    'pcl-no': 'PhieuChiLuong',
    giahan: 'CongNoGiaHan',
    bc: 'BaoCaoNop',
    acct: 'TaiKhoan'
});

const PREFIX_BY_ENTITY = Object.freeze({
    DonMuaHang: 'po',
    PhieuXuat: 'px',
    KiemKe: 'kk',
    PhieuDoiTra: 'dt',
    PhieuChi: 'pc',
    ChamCong: 'cc',
    DeNghiMuaHang: 'dn',
    LichLamViec: 'lich',
    ThongBaoGiaoHang: 'gh',
    PhieuNhap: 'pn',
    HoaDonMuaHang: 'hdmh',
    CaLamViec: 'ca',
    PhieuThu: 'pt',
    PhieuChiLuong: 'pcl',
    CongNoGiaHan: 'giahan',
    BaoCaoNop: 'bc',
    TaiKhoan: 'acct'
});

const sqlTypes = (dependencies = {}) => dependencies.sql || require('../config/db').sql;

const normalizeNotificationKey = value => String(value ?? '')
    .normalize('NFKC')
    .trim()
    .slice(0, MAX_KEY_LENGTH);

const normalizeNotificationKeys = values => [...new Set(
    (Array.isArray(values) ? values : [])
        .map(normalizeNotificationKey)
        .filter(Boolean)
)].slice(0, MAX_READ_KEYS);

const parseMaNhan = value => {
    const key = normalizeNotificationKey(value);
    return /^\d+$/.test(key) ? Number(key) : null;
};

const parseInboxIdentity = value => {
    const key = normalizeNotificationKey(value);
    const splitAt = key.indexOf(':');
    if (splitAt <= 0) {
        return {
            key,
            prefix: '',
            entityId: key,
            entityType: null,
            maNhan: parseMaNhan(key)
        };
    }
    const prefix = key.slice(0, splitAt);
    const entityId = key.slice(splitAt + 1);
    return {
        key,
        prefix,
        entityId,
        entityType: ENTITY_BY_PREFIX[prefix] || null,
        maNhan: prefix === 'nhan' ? parseMaNhan(entityId) : parseMaNhan(key)
    };
};

const derivedInboxKey = (entityType, entityId) => {
    const prefix = PREFIX_BY_ENTITY[entityType];
    const id = normalizeNotificationKey(entityId);
    if (!prefix || !id) return '';
    return normalizeNotificationKey(`${prefix}:${id}`);
};

const requestFor = (connection, dependencies = {}) => {
    if (dependencies.requestFactory) return dependencies.requestFactory(connection);
    if (!connection || typeof connection.request !== 'function') {
        throw new Error('Thiếu kết nối CSDL trạng thái thông báo.');
    }
    return connection.request();
};

const ensureReady = async (connection, dependencies = {}) => {
    const ensureSchema = dependencies.ensureSchema || require('./notifySchema').ensureNotifySchema;
    await ensureSchema(connection);
};

const loadReadKeys = async (connection, maNV, dependencies = {}) => {
    const employee = String(maNV || '').trim();
    if (!employee) return new Set();
    await ensureReady(connection, dependencies);
    const sql = sqlTypes(dependencies);
    const result = await requestFor(connection, dependencies)
        .input('MaNV', sql.VarChar, employee)
        .query(`
            SELECT TOP (${MAX_READ_KEYS}) NotificationKey
            FROM dbo.ThongBaoDaDoc
            WHERE MaNV=@MaNV
            ORDER BY NgayDoc DESC`);
    return new Set((result.recordset || [])
        .map(row => normalizeNotificationKey(row.NotificationKey))
        .filter(Boolean));
};

const loadRecipientById = async (connection, maNhan, dependencies = {}) => {
    const id = parseMaNhan(maNhan);
    if (!id) return null;
    await ensureReady(connection, dependencies);
    const sql = sqlTypes(dependencies);
    const result = await requestFor(connection, dependencies)
        .input('MaNhan', sql.BigInt, id)
        .query(`
            SELECT TOP 1
                n.MaNhan, n.MaNV, n.DaDoc, n.DaAn,
                e.EntityType, e.EntityId
            FROM dbo.ThongBaoNguoiNhan n
            LEFT JOIN dbo.ThongBaoSuKien e ON e.MaSuKien=n.MaSuKien
            WHERE n.MaNhan=@MaNhan`);
    return result.recordset?.[0] || null;
};

const persistReadKeys = async (connection, maNV, notificationKeys, dependencies = {}) => {
    const employee = String(maNV || '').trim();
    const keys = normalizeNotificationKeys(notificationKeys);
    if (!employee || !keys.length) return [];
    await ensureReady(connection, dependencies);
    const sql = sqlTypes(dependencies);
    try {
        await requestFor(connection, dependencies)
            .input('MaNV', sql.VarChar, employee)
            .input('KeysJson', sql.NVarChar, JSON.stringify(keys))
            .query(`
                DECLARE @Keys TABLE (
                    NotificationKey VARCHAR(220) NOT NULL PRIMARY KEY
                );

                INSERT @Keys(NotificationKey)
                SELECT DISTINCT LEFT(LTRIM(RTRIM(CONVERT(VARCHAR(220), [value]))), 220)
                FROM OPENJSON(@KeysJson)
                WHERE NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(220), [value]))), '') IS NOT NULL;

                INSERT dbo.ThongBaoDaDoc(MaNV, NotificationKey)
                SELECT @MaNV, src.NotificationKey
                FROM @Keys src
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM dbo.ThongBaoDaDoc saved WITH (UPDLOCK,HOLDLOCK)
                    WHERE saved.MaNV=@MaNV
                      AND saved.NotificationKey=src.NotificationKey
                );`);
    } catch (error) {
        if (![2601, 2627].includes(Number(error?.number))) throw error;
    }
    return keys;
};

const persistMatchingRecipients = async (connection, maNV, options = {}, dependencies = {}) => {
    const employee = String(maNV || '').trim();
    if (!employee) return;
    await ensureReady(connection, dependencies);
    const sql = sqlTypes(dependencies);
    const request = requestFor(connection, dependencies).input('MaNV', sql.VarChar, employee);
    if (options.all) {
        await request.query(`
            UPDATE dbo.ThongBaoNguoiNhan
            SET DaDoc=1, NgayDoc=SYSUTCDATETIME()
            WHERE MaNV=@MaNV AND DaDoc=0 AND DaAn=0;`);
        return;
    }
    if (options.maNhan) {
        await request
            .input('MaNhan', sql.BigInt, options.maNhan)
            .query(`
                UPDATE dbo.ThongBaoNguoiNhan
                SET DaDoc=1, NgayDoc=SYSUTCDATETIME()
                WHERE MaNhan=@MaNhan AND MaNV=@MaNV AND DaAn=0;`);
        return;
    }
    if (options.entityType && options.entityId) {
        await request
            .input('EntityType', sql.VarChar, options.entityType)
            .input('EntityId', sql.VarChar, options.entityId)
            .query(`
                UPDATE n
                SET n.DaDoc=1, n.NgayDoc=SYSUTCDATETIME()
                FROM dbo.ThongBaoNguoiNhan n
                JOIN dbo.ThongBaoSuKien e ON e.MaSuKien=n.MaSuKien
                WHERE n.MaNV=@MaNV AND n.DaAn=0
                  AND e.EntityType=@EntityType
                  AND e.EntityId=@EntityId;`);
    }
};

const markRead = async (connection, maNV, notificationKey, options = {}, dependencies = {}) => {
    const employee = String(maNV || '').trim();
    const identity = parseInboxIdentity(notificationKey);
    if (!employee || !identity.key) throw new Error('Thông báo không hợp lệ.');
    const extraKey = derivedInboxKey(options.entityType, options.entityId);
    const keys = normalizeNotificationKeys([
        identity.key,
        extraKey,
        options.derivedKey
    ]);
    await persistReadKeys(connection, employee, keys, dependencies);
    await persistMatchingRecipients(connection, employee, {
        maNhan: options.maNhan || identity.maNhan,
        entityType: options.entityType || identity.entityType,
        entityId: options.entityId || identity.entityId
    }, dependencies);
    return identity.key;
};

const markAllRead = async (connection, maNV, notificationKeys, dependencies = {}) => {
    const employee = String(maNV || '').trim();
    if (!employee) return [];
    const keys = normalizeNotificationKeys(notificationKeys);
    await ensureReady(connection, dependencies);
    const sql = sqlTypes(dependencies);
    const request = requestFor(connection, dependencies).input('MaNV', sql.VarChar, employee);
    if (keys.length) request.input('KeysJson', sql.NVarChar, JSON.stringify(keys));
    try {
        await request.query(`
            BEGIN TRAN;
            BEGIN TRY
            ${keys.length ? `
            DECLARE @Keys TABLE (
                NotificationKey VARCHAR(220) NOT NULL PRIMARY KEY
            );

            INSERT @Keys(NotificationKey)
            SELECT DISTINCT LEFT(LTRIM(RTRIM(CONVERT(VARCHAR(220), [value]))), 220)
            FROM OPENJSON(@KeysJson)
            WHERE NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(220), [value]))), '') IS NOT NULL;

            INSERT dbo.ThongBaoDaDoc(MaNV, NotificationKey)
            SELECT @MaNV, src.NotificationKey
            FROM @Keys src
            WHERE NOT EXISTS (
                SELECT 1
                FROM dbo.ThongBaoDaDoc saved WITH (UPDLOCK,HOLDLOCK)
                WHERE saved.MaNV=@MaNV
                  AND saved.NotificationKey=src.NotificationKey
            );
            ` : ''}
            UPDATE dbo.ThongBaoNguoiNhan
            SET DaDoc=1, NgayDoc=SYSUTCDATETIME()
            WHERE MaNV=@MaNV AND DaDoc=0 AND DaAn=0;
            COMMIT;
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0 ROLLBACK;
                THROW;
            END CATCH`);
    } catch (error) {
        if (![2601, 2627].includes(Number(error?.number))) throw error;
    }
    return keys;
};

const sameEmployee = (left, right) => String(left || '').trim().toUpperCase() === String(right || '').trim().toUpperCase();

const resolveOwnedNotification = async (connection, maNV, rawId, inboxItems = [], dependencies = {}) => {
    const identity = parseInboxIdentity(rawId);
    if (!identity.key) return { error: 400, message: 'Thông báo không hợp lệ.' };
    const inInbox = (inboxItems || []).some(item => normalizeNotificationKey(item?.id) === identity.key);
    if (inInbox) {
        return {
            key: identity.key,
            source: 'inbox',
            entityType: identity.entityType,
            entityId: identity.entityId
        };
    }
    if (identity.maNhan) {
        const row = await loadRecipientById(connection, identity.maNhan, dependencies);
        if (!row) return { error: 404, message: 'Thông báo không còn tồn tại hoặc không thuộc tài khoản này.' };
        if (!sameEmployee(row.MaNV, maNV)) {
            return { error: 403, message: 'Bạn không thể đánh dấu thông báo của nhân viên khác.' };
        }
        return {
            key: identity.key,
            source: 'recipient',
            maNhan: Number(row.MaNhan),
            entityType: row.EntityType || null,
            entityId: row.EntityId || null,
            derivedKey: derivedInboxKey(row.EntityType, row.EntityId)
        };
    }
    return { error: 404, message: 'Thông báo không còn tồn tại hoặc không thuộc tài khoản này.' };
};

const decorateWithReadState = (items, readKeys) => {
    const known = readKeys instanceof Set ? readKeys : new Set(normalizeNotificationKeys(readKeys));
    return (items || []).map(item => ({
        ...item,
        read: Boolean(item?.read) || known.has(normalizeNotificationKey(item?.id))
    }));
};

const countUnread = items => (items || []).filter(item => !item.read).length;

module.exports = {
    MAX_KEY_LENGTH,
    ENTITY_BY_PREFIX,
    normalizeNotificationKey,
    normalizeNotificationKeys,
    parseInboxIdentity,
    parseMaNhan,
    derivedInboxKey,
    loadReadKeys,
    loadRecipientById,
    markRead,
    markAllRead,
    resolveOwnedNotification,
    decorateWithReadState,
    countUnread
};
