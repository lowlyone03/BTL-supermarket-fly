const qty = (value) => Math.round(Number(value) || 0);

const createRequest = (sql, db) => (db && typeof db.request === 'function' ? db.request() : new sql.Request(db));

const formatWhen = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const documentLabel = (move) => {
    if (!move) return '';
    const labels = {
        HoaDon: 'hóa đơn',
        'Kiểm kê': 'phiếu kiểm kê',
        KiemKe: 'phiếu kiểm kê',
        PhieuXuat: 'phiếu xuất',
        PhieuNhap: 'phiếu nhập',
        DoiTra: 'phiếu đổi trả'
    };
    const kind = labels[move.LoaiChungTu] || String(move.LoaiChungTu || move.LoaiGD || 'chứng từ').toLowerCase();
    return move.MaChungTu ? `${kind} ${move.MaChungTu}` : kind;
};

const movementVerb = (move) => {
    const amount = Math.abs(qty(move?.SoLuong));
    if (!move) return '';
    if (move.LoaiGD === 'Nhập' || (move.LoaiGD === 'Điều chỉnh' && qty(move.SoLuong) > 0)) {
        return `tăng ${amount}`;
    }
    if (move.LoaiGD === 'Xuất' || (move.LoaiGD === 'Điều chỉnh' && qty(move.SoLuong) < 0)) {
        return `giảm ${amount}`;
    }
    return `đổi ${amount}`;
};

const scrapConfirmed = (scrap) => scrap && scrap.TrangThai === 'Đã xác nhận';

const expectedAfterScrap = (line, scrap) => {
    const target = qty(line.SLThucTe);
    if (!scrapConfirmed(scrap)) return target;
    return Math.max(0, target - qty(scrap.SoLuong));
};

const describeStockChange = ({ MaSP, counted, current, move, scrap }) => {
    const parts = [`Tồn ${MaSP} lúc đếm là ${counted}, hiện tại còn ${current}.`];
    if (scrapConfirmed(scrap)) {
        const who = scrap.NguoiXacNhan || scrap.NguoiDuyet || scrap.NguoiLap || 'thủ kho';
        const when = formatWhen(scrap.NgayXacNhan || scrap.NgayDuyet || scrap.NgayXuat);
        parts.push(`Phiếu xuất hủy ${scrap.MaPX} từ đợt kiểm kê này đã được ${who} xác nhận${when ? ` lúc ${when}` : ''}, đã trừ ${qty(scrap.SoLuong)} hàng hỏng/hết hạn.`);
        return parts.join(' ');
    }
    if (scrap && ['Đã duyệt', 'Chờ duyệt'].includes(scrap.TrangThai)) {
        const who = scrap.NguoiDuyet || scrap.NguoiLap || 'quản lý';
        parts.push(`Phiếu xuất hủy ${scrap.MaPX} đang ${String(scrap.TrangThai).toLowerCase()} (người liên quan: ${who}) nhưng chưa xác nhận xuất nên tồn chưa trừ hàng hỏng.`);
    }
    if (move) {
        const who = move.TenNV || move.MaNV || 'một nhân viên';
        const when = formatWhen(move.NgayGD);
        const doc = documentLabel(move);
        parts.push(`Đã ${movementVerb(move)} do ${who} xác nhận ${String(move.LoaiGD || 'giao dịch').toLowerCase()}${doc ? ` trên ${doc}` : ''}${when ? ` lúc ${when}` : ''}.`);
        return `${parts.join(' ')} Không thể duyệt điều chỉnh trên số liệu cũ — từ chối để Thủ kho đếm lại.`;
    }
    parts.push('Tồn đã đổi sau lúc kiểm đếm nhưng sổ kho chưa ghi rõ người xác nhận.');
    return `${parts.join(' ')} Không thể duyệt trên số liệu cũ — từ chối để Thủ kho đếm lại.`;
};

const loadLatestMoves = async (sql, db, { MaKho, MaSPList, since }) => {
    const ids = [...new Set((MaSPList || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const map = new Map();
    if (!ids.length) return map;
    const request = createRequest(sql, db)
        .input('MaKho', sql.VarChar, MaKho)
        .input('Since', sql.DateTime, since || new Date(0));
    const placeholders = ids.map((id, index) => {
        const name = `SP${index}`;
        request.input(name, sql.VarChar, id);
        return `@${name}`;
    });
    const result = await request.query(`
        SELECT gd.MaSP, gd.LoaiGD, gd.LoaiChungTu, gd.MaChungTu, gd.SoLuong, gd.NgayGD, gd.GhiChu,
               nv.TenNV, nv.MaNV
        FROM GiaoDichKho gd
        JOIN NhanVien nv ON nv.MaNV=gd.MaNV
        WHERE gd.MaKho=@MaKho AND gd.MaSP IN (${placeholders.join(',')}) AND gd.NgayGD>=@Since
        ORDER BY gd.NgayGD DESC, gd.MaGD DESC`);
    for (const row of result.recordset) {
        if (!map.has(row.MaSP)) map.set(row.MaSP, row);
    }
    return map;
};

const loadCountScrapByProduct = async (sql, db, { MaKK, MaSPList }) => {
    const ids = [...new Set((MaSPList || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const map = new Map();
    if (!ids.length) return map;
    try {
        const request = createRequest(sql, db).input('MaKK', sql.VarChar, MaKK);
        const placeholders = ids.map((id, index) => {
            const name = `SP${index}`;
            request.input(name, sql.VarChar, id);
            return `@${name}`;
        });
        const result = await request.query(`
            SELECT px.MaPX, px.TrangThai, px.NgayXuat, px.NgayDuyet, ct.MaSP, ct.SoLuong,
                   nv.TenNV NguoiLap, nvd.TenNV NguoiDuyet,
                   COALESCE(nk.TenNV, nvd.TenNV, nv.TenNV) NguoiXacNhan,
                   COALESCE(nk.ThoiGian, gd.NgayGD, px.NgayDuyet) NgayXacNhan
            FROM PhieuXuat px
            JOIN ChiTietPhieuXuat ct ON ct.MaPX=px.MaPX
            JOIN NhanVien nv ON nv.MaNV=px.MaNV
            LEFT JOIN NhanVien nvd ON nvd.MaNV=px.MaNV_Duyet
            OUTER APPLY (
                SELECT TOP 1 n.TenNV, nky.ThoiGian
                FROM NhatKy nky
                LEFT JOIN TaiKhoan tk ON tk.MaTK=nky.MaTK
                LEFT JOIN NhanVien n ON n.MaNV=tk.MaNV
                WHERE nky.BangLienQuan=N'PhieuXuat' AND nky.MaBanGhi=px.MaPX
                  AND nky.HanhDong LIKE N'%Xác nhận%'
                ORDER BY nky.ThoiGian DESC
            ) nk
            OUTER APPLY (
                SELECT TOP 1 g.NgayGD
                FROM GiaoDichKho g
                WHERE g.LoaiChungTu=N'PhieuXuat' AND g.MaChungTu=px.MaPX AND g.MaSP=ct.MaSP
                ORDER BY g.NgayGD DESC
            ) gd
            WHERE px.MaKK=@MaKK AND ct.MaSP IN (${placeholders.join(',')})
            ORDER BY CASE px.TrangThai
                        WHEN N'Đã xác nhận' THEN 0
                        WHEN N'Đã duyệt' THEN 1
                        WHEN N'Chờ duyệt' THEN 2
                        ELSE 3 END, px.NgayXuat DESC`);
        for (const row of result.recordset) {
            if (!map.has(row.MaSP)) map.set(row.MaSP, row);
        }
    } catch (error) {
        if (!/Invalid column name|MaKK/i.test(error.message || '')) throw error;
    }
    return map;
};

const loadChangeContext = async (sql, db, { MaKho, MaKK, MaSPList, since }) => {
    const moves = await loadLatestMoves(sql, db, { MaKho, MaSPList, since });
    const scraps = await loadCountScrapByProduct(sql, db, { MaKK, MaSPList });
    return { moves, scraps };
};

const staleApproveMessage = (line, current, context) => describeStockChange({
    MaSP: line.MaSP,
    counted: qty(line.SLHeThong),
    current,
    move: context.moves.get(line.MaSP) || null,
    scrap: context.scraps.get(line.MaSP) || null
});

const alreadyReducedMessage = (line, current, context) => {
    const scrap = context.scraps.get(line.MaSP) || null;
    const move = context.moves.get(line.MaSP) || null;
    const whoScrap = scrap?.NguoiXacNhan || scrap?.NguoiDuyet || scrap?.NguoiLap;
    if (scrapConfirmed(scrap) && whoScrap) {
        return `${line.MaSP} đã giảm do ${whoScrap} xác nhận xuất hủy ${scrap.MaPX}, tồn hiện tại ${current}`;
    }
    if (move?.TenNV) {
        return `${line.MaSP} đã ${movementVerb(move)} do ${move.TenNV} xác nhận${documentLabel(move) ? ` trên ${documentLabel(move)}` : ''}, tồn hiện tại ${current} — không điều chỉnh trùng`;
    }
    return `${line.MaSP} đã đúng số ${current}, không ghi thêm điều chỉnh`;
};

const canApproveDespiteDrift = (line, context) => {
    const scrap = context.scraps.get(line.MaSP) || null;
    const current = qty(line.SLTonHienTai);
    const snapshot = qty(line.SLHeThong);
    return current === expectedAfterScrap(line, scrap)
        || current === qty(line.SLThucTe)
        || (scrapConfirmed(scrap) && current === snapshot - qty(scrap.SoLuong));
};

const buildStockWarnings = (lines, context) => (lines || [])
    .filter((line) => qty(line.ChenhLech) !== 0 && qty(line.SLTonHienTai) !== qty(line.SLHeThong))
    .map((line) => ({
        MaSP: line.MaSP,
        TenSP: line.TenSP || line.MaSP,
        SLHeThong: qty(line.SLHeThong),
        SLTonHienTai: qty(line.SLTonHienTai),
        SLThucTe: qty(line.SLThucTe),
        alreadyReduced: canApproveDespiteDrift(line, context),
        message: canApproveDespiteDrift(line, context)
            ? alreadyReducedMessage(line, qty(line.SLTonHienTai), context)
            : staleApproveMessage(line, qty(line.SLTonHienTai), context)
    }));

const suggestedRejectReason = (warnings) => {
    const blocking = (warnings || []).filter((item) => !item.alreadyReduced);
    if (!blocking.length) return 'Từ chối điều chỉnh tồn. Thủ kho cần đếm lại.';
    const detail = blocking.map((item) => item.message).join(' ');
    return `Không duyệt trên số liệu cũ — Thủ kho đếm lại. ${detail}`.slice(0, 500);
};

module.exports = {
    qty,
    scrapConfirmed,
    expectedAfterScrap,
    describeStockChange,
    loadChangeContext,
    staleApproveMessage,
    alreadyReducedMessage,
    buildStockWarnings,
    suggestedRejectReason
};
