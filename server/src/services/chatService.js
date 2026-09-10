'use strict';

const { sql } = require('../config/db');
const { ensureChatSchema } = require('./chatSchema');
const chatHub = require('./chatHub');
const {
    ROOM_SEED,
    canRoleEnter,
    roomsForRole,
    scanMessage,
    isActiveActor,
    clipText,
    previewText
} = require('./chatPolicy');
const { listVouchers, getVoucher } = require('./chatVouchers');

const MINUTE_LIMIT = 20;
const DAY_LIMIT = 400;
const rateBuckets = new Map();

const httpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const dayKey = (maNV) => {
    const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return `${maNV || 'anon'}|${day}`;
};

const consumeChatRate = (maNV) => {
    const now = Date.now();
    const key = String(maNV || '');
    const current = rateBuckets.get(key) || { hits: [], dayKey: dayKey(key), dayCount: 0 };
    if (current.dayKey !== dayKey(key)) {
        current.dayKey = dayKey(key);
        current.dayCount = 0;
        current.hits = [];
    }
    current.hits = current.hits.filter((at) => now - at < 60000);
    if (current.hits.length >= MINUTE_LIMIT) {
        throw httpError(429, 'Gửi chậm lại, tối đa 20 tin mỗi phút.');
    }
    if (current.dayCount >= DAY_LIMIT) {
        throw httpError(429, 'Đã gửi tối đa 400 tin trong ngày.');
    }
    current.hits.push(now);
    current.dayCount += 1;
    rateBuckets.set(key, current);
};

const resetChatRateForTests = () => rateBuckets.clear();

const withSchema = async (pool) => {
    await ensureChatSchema(pool);
    return pool;
};

const loadActor = async (pool, maNV) => {
    const result = await pool.request()
        .input('MaNV', sql.VarChar, String(maNV || ''))
        .query(`SELECT TOP 1 n.MaNV, n.TenNV, n.TrangThai AS TrangThaiNV,
                       t.TrangThai AS TrangThaiTK, t.MaTK, v.TenVaiTro, v.MaVaiTro
                FROM dbo.NhanVien n
                LEFT JOIN dbo.TaiKhoan t ON t.MaNV = n.MaNV
                LEFT JOIN dbo.VaiTro v ON v.MaVaiTro = t.MaVaiTro
                WHERE n.MaNV = @MaNV
                ORDER BY t.TrangThai DESC`);
    return result.recordset[0] || null;
};

const loadRoom = async (pool, maPhong) => {
    const result = await pool.request()
        .input('MaPhong', sql.VarChar, String(maPhong || ''))
        .query(`SELECT MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, TrangThai
                FROM dbo.PhongChat WHERE MaPhong = @MaPhong`);
    return result.recordset[0] || null;
};

const assertMember = async (pool, user, maPhong) => {
    const actor = await loadActor(pool, user?.MaNV);
    if (!actor || !isActiveActor(actor)) {
        throw httpError(403, 'Tài khoản không còn dùng chat nội bộ.');
    }
    const room = await loadRoom(pool, maPhong);
    if (!room || room.TrangThai !== 'DangMo') {
        throw httpError(403, 'Bạn không thuộc phòng chat này.');
    }
    if (!canRoleEnter(actor.TenVaiTro || user?.TenVaiTro, room.Khoa)) {
        throw httpError(403, 'Bạn không thuộc phòng chat này.');
    }
    const member = await pool.request()
        .input('MaPhong', sql.VarChar, room.MaPhong)
        .input('MaNV', sql.VarChar, actor.MaNV)
        .query(`SELECT AnKhoiPhong FROM dbo.ThanhVienPhongChat
                WHERE MaPhong = @MaPhong AND MaNV = @MaNV`);
    if (!member.recordset.length || Number(member.recordset[0].AnKhoiPhong) === 1) {
        throw httpError(403, 'Bạn không thuộc phòng chat này.');
    }
    return { actor, room };
};

const upsertMember = async (pool, maPhong, maNV, hidden) => {
    await pool.request()
        .input('MaPhong', sql.VarChar, maPhong)
        .input('MaNV', sql.VarChar, maNV)
        .input('An', sql.Bit, hidden ? 1 : 0)
        .query(`
            MERGE dbo.ThanhVienPhongChat AS t
            USING (SELECT @MaPhong AS MaPhong, @MaNV AS MaNV) AS s
            ON t.MaPhong = s.MaPhong AND t.MaNV = s.MaNV
            WHEN MATCHED THEN UPDATE SET AnKhoiPhong = @An
            WHEN NOT MATCHED THEN
                INSERT (MaPhong, MaNV, AnKhoiPhong) VALUES (s.MaPhong, s.MaNV, @An);`);
};

const syncMembership = async (pool, { MaNV } = {}) => {
    await withSchema(pool);
    const actor = await loadActor(pool, MaNV);
    if (!actor) return { ok: false };
    const allowed = new Set(roomsForRole(actor.TenVaiTro).map((room) => room.Khoa));
    const active = isActiveActor(actor);
    for (const room of ROOM_SEED) {
        const join = active && allowed.has(room.Khoa);
        await upsertMember(pool, room.MaPhong, actor.MaNV, !join);
    }
    try { chatHub.notifyRoomsChanged([actor.MaNV]); } catch { /* ignore */ }
    return { ok: true, active, rooms: [...allowed] };
};

const syncMembershipSafe = async (pool, maNV) => {
    try {
        if (!pool || !maNV) return;
        await syncMembership(pool, { MaNV: maNV });
    } catch (error) {
        console.error('Chat nội bộ: không đồng bộ thành viên', error.message);
    }
};

const syncAllMemberships = async (pool) => {
    await withSchema(pool);
    const result = await pool.request().query(`
        SELECT n.MaNV
        FROM dbo.NhanVien n
        JOIN dbo.TaiKhoan t ON t.MaNV = n.MaNV`);
    for (const row of result.recordset) {
        await syncMembership(pool, { MaNV: row.MaNV });
    }
    return { count: result.recordset.length };
};

const lastMessagePreview = (row) => {
    if (!row) return '';
    if (row.LoaiTin === 'Anh' || row.LoaiTin === 'File') return row.TenFile || 'Đã gửi tệp';
    if (row.LoaiTin === 'ChungTu') return row.MaChungTu ? `Chứng từ ${row.MaChungTu}` : 'Chứng từ hệ thống';
    return previewText(row.NoiDung);
};

const listRooms = async (pool, user) => {
    await withSchema(pool);
    await syncMembershipSafe(pool, user?.MaNV);
    const actor = await loadActor(pool, user?.MaNV);
    if (!actor || !isActiveActor(actor)) return [];
    const result = await pool.request()
        .input('MaNV', sql.VarChar, actor.MaNV)
        .query(`
            SELECT p.MaPhong, p.Khoa, p.TenPhong, p.LoaiPhong, p.MoTa,
                   ISNULL(d.MaTinCuoi, 0) AS MaTinCuoi,
                   (
                        SELECT COUNT(*) FROM dbo.TinNhan t
                        WHERE t.MaPhong = p.MaPhong AND t.DaXoa = 0
                          AND t.MaNV_Gui <> @MaNV
                          AND t.MaTin > ISNULL(d.MaTinCuoi, 0)
                   ) AS ChuaDoc,
                   last.MaTin AS TinCuoiMa, last.NoiDung AS TinCuoiNoiDung,
                   last.LoaiTin AS TinCuoiLoai, last.TenFile AS TinCuoiFile,
                   last.MaChungTu AS TinCuoiChungTu, last.NgayGui AS TinCuoiAt,
                   last.TenNV_Gui AS TinCuoiNguoi
            FROM dbo.PhongChat p
            JOIN dbo.ThanhVienPhongChat v
              ON v.MaPhong = p.MaPhong AND v.MaNV = @MaNV AND v.AnKhoiPhong = 0
            LEFT JOIN dbo.TinNhanDaDoc d
              ON d.MaPhong = p.MaPhong AND d.MaNV = @MaNV
            OUTER APPLY (
                SELECT TOP 1 MaTin, NoiDung, LoaiTin, TenFile, MaChungTu, NgayGui, TenNV_Gui
                FROM dbo.TinNhan
                WHERE MaPhong = p.MaPhong AND DaXoa = 0
                ORDER BY MaTin DESC
            ) last
            WHERE p.TrangThai = N'DangMo'`);
    return result.recordset
        .filter((row) => canRoleEnter(actor.TenVaiTro, row.Khoa))
        .map((row) => ({
            maPhong: row.MaPhong,
            khoa: row.Khoa,
            tenPhong: row.TenPhong,
            loaiPhong: row.LoaiPhong,
            moTa: row.MoTa,
            chuaDoc: Number(row.ChuaDoc || 0),
            tinCuoiAt: row.TinCuoiAt || null,
            preview: lastMessagePreview({
                LoaiTin: row.TinCuoiLoai,
                NoiDung: row.TinCuoiNoiDung,
                TenFile: row.TinCuoiFile,
                MaChungTu: row.TinCuoiChungTu
            }),
            nguoiCuoi: row.TinCuoiNguoi || ''
        }))
        .sort((a, b) => {
            if (b.chuaDoc !== a.chuaDoc) return b.chuaDoc - a.chuaDoc;
            const ta = a.tinCuoiAt ? new Date(a.tinCuoiAt).getTime() : 0;
            const tb = b.tinCuoiAt ? new Date(b.tinCuoiAt).getTime() : 0;
            return tb - ta;
        });
};

const unreadSummary = async (pool, user) => {
    const rooms = await listRooms(pool, user);
    return {
        tongChuaDoc: rooms.reduce((sum, room) => sum + Number(room.chuaDoc || 0), 0),
        phong: rooms.map((room) => ({
            maPhong: room.maPhong,
            khoa: room.khoa,
            tenPhong: room.tenPhong,
            chuaDoc: room.chuaDoc,
            tinCuoiAt: room.tinCuoiAt
        }))
    };
};

const mapMessage = (row) => ({
    maTin: Number(row.MaTin),
    maPhong: row.MaPhong,
    maNVGui: row.MaNV_Gui,
    tenNVGui: row.TenNV_Gui,
    tenVaiTroGui: row.TenVaiTro_Gui,
    noiDung: row.NoiDung,
    loaiTin: row.LoaiTin,
    tenFile: row.TenFile,
    mimeFile: row.MimeFile,
    dungLuong: row.DungLuong,
    loaiChungTu: row.LoaiChungTu,
    maChungTu: row.MaChungTu,
    ngayGui: row.NgayGui,
    cuaToi: false
});

const listMessages = async (pool, user, maPhong, query = {}) => {
    await withSchema(pool);
    const { actor, room } = await assertMember(pool, user, maPhong);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const before = Number(query.before) || 0;
    const after = Number(query.after) || 0;
    const request = pool.request()
        .input('MaPhong', sql.VarChar, room.MaPhong)
        .input('Limit', sql.Int, limit);
    let filter = 't.MaPhong = @MaPhong AND t.DaXoa = 0';
    if (after > 0) {
        request.input('After', sql.BigInt, after);
        filter += ' AND t.MaTin > @After';
    } else if (before > 0) {
        request.input('Before', sql.BigInt, before);
        filter += ' AND t.MaTin < @Before';
    }
    const result = await request.query(`
        SELECT TOP (@Limit) t.MaTin, t.MaPhong, t.MaNV_Gui, t.TenNV_Gui, t.TenVaiTro_Gui,
               t.NoiDung, t.LoaiTin, t.DuongDanFile, t.TenFile, t.MimeFile, t.DungLuong,
               t.LoaiChungTu, t.MaChungTu, t.NgayGui
        FROM dbo.TinNhan t
        WHERE ${filter}
        ORDER BY t.MaTin ${after > 0 ? 'ASC' : 'DESC'}`);
    const items = result.recordset
        .map((row) => ({ ...mapMessage(row), cuaToi: row.MaNV_Gui === actor.MaNV }))
        .sort((a, b) => a.maTin - b.maTin);
    return { phong: room.MaPhong, tenPhong: room.TenPhong, items };
};

const insertMessage = async (pool, { room, actor, noiDung, loaiTin, file, voucher }) => {
    const result = await pool.request()
        .input('MaPhong', sql.VarChar, room.MaPhong)
        .input('MaNV', sql.VarChar, actor.MaNV)
        .input('TenNV', sql.NVarChar, actor.TenNV || actor.MaNV)
        .input('TenVaiTro', sql.NVarChar, actor.TenVaiTro || '')
        .input('NoiDung', sql.NVarChar, noiDung)
        .input('LoaiTin', sql.NVarChar, loaiTin)
        .input('DuongDanFile', sql.NVarChar, file?.filename || null)
        .input('TenFile', sql.NVarChar, file?.originalname || null)
        .input('MimeFile', sql.VarChar, file?.mimetype || null)
        .input('DungLuong', sql.Int, file?.size || null)
        .input('LoaiChungTu', sql.NVarChar, voucher?.loai || null)
        .input('MaChungTu', sql.VarChar, voucher?.ma || null)
        .query(`
            INSERT INTO dbo.TinNhan
                (MaPhong, MaNV_Gui, TenNV_Gui, TenVaiTro_Gui, NoiDung, LoaiTin,
                 DuongDanFile, TenFile, MimeFile, DungLuong, LoaiChungTu, MaChungTu)
            OUTPUT INSERTED.MaTin, INSERTED.NgayGui
            VALUES (@MaPhong, @MaNV, @TenNV, @TenVaiTro, @NoiDung, @LoaiTin,
                    @DuongDanFile, @TenFile, @MimeFile, @DungLuong, @LoaiChungTu, @MaChungTu)`);
    return result.recordset[0];
};

const logChatAudit = async (pool, { user, room, maTin }) => {
    try {
        await pool.request()
            .input('MaTK', sql.Int, user?.MaTK || null)
            .input('MaPhong', sql.VarChar, String(room.MaPhong).slice(0, 50))
            .input('NoiDung', sql.NVarChar, `${room.TenPhong} · MaTin=${maTin}`.slice(0, 200))
            .query(`INSERT INTO dbo.NhatKy (MaTK, HanhDong, BangLienQuan, MaBanGhi, NoiDung, ThoiGian)
                    VALUES (@MaTK, N'Gửi tin nội bộ', N'TinNhan', @MaPhong, @NoiDung, GETDATE())`);
    } catch { /* audit nhẹ, không chặn gửi — và không gọi notifyInboxChanged */ }
};

const sendMessage = async (pool, user, maPhong, body = {}) => {
    await withSchema(pool);
    const { actor, room } = await assertMember(pool, user, maPhong);
    consumeChatRate(actor.MaNV);
    const text = clipText(body.NoiDung, 1000);
    const loaiChungTu = String(body.LoaiChungTu || '').trim();
    const maChungTu = String(body.MaChungTu || '').trim();
    let voucher = null;
    if (loaiChungTu || maChungTu) {
        if (!loaiChungTu || !maChungTu) throw httpError(400, 'Cần loại và mã chứng từ.');
        voucher = await getVoucher(pool, actor, loaiChungTu, maChungTu);
    }
    if (!text && !voucher) throw httpError(400, 'Nhập nội dung tin nhắn.');
    if (text.length > 1000) throw httpError(400, 'Tin nhắn tối đa 1000 ký tự.');
    const scan = scanMessage(text);
    if (scan.block) throw httpError(scan.status, scan.message);
    const noiDung = text || voucher.ten;
    const inserted = await insertMessage(pool, {
        room,
        actor,
        noiDung,
        loaiTin: voucher ? 'ChungTu' : 'VanBan',
        voucher
    });
    await logChatAudit(pool, { user, room, maTin: inserted.MaTin });
    await chatHub.notifyChat({ pool, maPhong: room.MaPhong, maTin: inserted.MaTin });
    return {
        maTin: Number(inserted.MaTin),
        ngayGui: inserted.NgayGui,
        phong: room.MaPhong,
        loaiTin: voucher ? 'ChungTu' : 'VanBan',
        canhBao: scan.warning || null,
        voucher
    };
};

const sendFile = async (pool, user, maPhong, { file, noiDung } = {}) => {
    await withSchema(pool);
    const { actor, room } = await assertMember(pool, user, maPhong);
    if (!file) throw httpError(400, 'Chưa chọn tệp.');
    consumeChatRate(actor.MaNV);
    const text = clipText(noiDung, 1000);
    const scan = scanMessage(text);
    if (scan.block) throw httpError(scan.status, scan.message);
    const isImage = String(file.mimetype || '').startsWith('image/');
    const inserted = await insertMessage(pool, {
        room,
        actor,
        noiDung: text || file.originalname || 'Tệp đính kèm',
        loaiTin: isImage ? 'Anh' : 'File',
        file
    });
    await logChatAudit(pool, { user, room, maTin: inserted.MaTin });
    await chatHub.notifyChat({ pool, maPhong: room.MaPhong, maTin: inserted.MaTin });
    return {
        maTin: Number(inserted.MaTin),
        ngayGui: inserted.NgayGui,
        phong: room.MaPhong,
        loaiTin: isImage ? 'Anh' : 'File',
        tenFile: file.originalname,
        canhBao: scan.warning || null
    };
};

const markRead = async (pool, user, maPhong, maTinCuoi) => {
    await withSchema(pool);
    const { actor, room } = await assertMember(pool, user, maPhong);
    const maxRow = await pool.request()
        .input('MaPhong', sql.VarChar, room.MaPhong)
        .query('SELECT ISNULL(MAX(MaTin), 0) AS MaxTin FROM dbo.TinNhan WHERE MaPhong = @MaPhong');
    const ceiling = Number(maxRow.recordset[0]?.MaxTin || 0);
    const watermark = Math.max(0, Math.min(Number(maTinCuoi) || ceiling, ceiling));
    await pool.request()
        .input('MaPhong', sql.VarChar, room.MaPhong)
        .input('MaNV', sql.VarChar, actor.MaNV)
        .input('MaTinCuoi', sql.BigInt, watermark)
        .query(`
            MERGE dbo.TinNhanDaDoc AS t
            USING (SELECT @MaPhong AS MaPhong, @MaNV AS MaNV) AS s
            ON t.MaPhong = s.MaPhong AND t.MaNV = s.MaNV
            WHEN MATCHED THEN UPDATE SET MaTinCuoi = @MaTinCuoi, NgayDoc = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (MaPhong, MaNV, MaTinCuoi) VALUES (s.MaPhong, s.MaNV, @MaTinCuoi);`);
    return { maPhong: room.MaPhong, maTinCuoi: watermark };
};

const getFileMessage = async (pool, user, maTin) => {
    await withSchema(pool);
    const row = await pool.request()
        .input('MaTin', sql.BigInt, Number(maTin) || 0)
        .query(`SELECT MaTin, MaPhong, DuongDanFile, TenFile, MimeFile, DaXoa
                FROM dbo.TinNhan WHERE MaTin = @MaTin`);
    if (!row.recordset.length || Number(row.recordset[0].DaXoa) === 1 || !row.recordset[0].DuongDanFile) {
        throw httpError(404, 'Không tìm thấy tệp.');
    }
    await assertMember(pool, user, row.recordset[0].MaPhong);
    return row.recordset[0];
};

module.exports = {
    assertMember,
    listRooms,
    listMessages,
    sendMessage,
    sendFile,
    markRead,
    unreadSummary,
    syncMembership,
    syncMembershipSafe,
    syncAllMemberships,
    getFileMessage,
    listVouchers,
    getVoucher,
    consumeChatRate,
    resetChatRateForTests,
    loadActor
};
