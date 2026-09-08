const { sql } = require('../config/db');
const { isRestockAccepted } = require('./financialRules');
const {
    scrapLinesFromRows,
    countStockImpact,
    returnStockImpact,
    countScrapNote,
    returnDiscardNote,
    returnIssueMarker,
    ACTIVE_ISSUE_STATUSES
} = require('./countScrap');

const requestOf = (db) => (db && typeof db.request === 'function' ? db.request() : new sql.Request(db));

const alignExistingCountIssue = async (db, existing, scrap, impact, maKK) => {
    if (!existing?.MaPX || !scrap?.length) return existing;
    if (!['Nháp', 'Chờ duyệt', 'Đã duyệt', 'Đã xác nhận'].includes(existing.TrangThai)) return existing;
    const current = await requestOf(db).input('MaPX', sql.VarChar, existing.MaPX).query(`
        SELECT MaSP, SoLuong, DonGia FROM ChiTietPhieuXuat WHERE MaPX=@MaPX`);
    const same = scrap.length === current.recordset.length
        && scrap.every(line => current.recordset.some(row => row.MaSP === line.MaSP && Number(row.SoLuong) === Number(line.SoLuong)));
    if (same) return existing;
    if (existing.TrangThai === 'Đã xác nhận' && !existing.KhongTruTon && !impact.KhongTruTon) return existing;
    await requestOf(db).input('MaPX', sql.VarChar, existing.MaPX).query('DELETE FROM ChiTietPhieuXuat WHERE MaPX=@MaPX');
    for (const line of scrap) {
        await requestOf(db)
            .input('MaPX', sql.VarChar, existing.MaPX)
            .input('MaSP', sql.VarChar, line.MaSP)
            .input('SoLuong', sql.Int, line.SoLuong)
            .input('DonGia', sql.Decimal(18, 2), Number(line.DonGia || 0))
            .input('GhiChu', sql.NVarChar, `${line.TinhTrangHang}${line.NguyenNhan ? `: ${line.NguyenNhan}` : ''}`.slice(0, 200))
            .query(`INSERT ChiTietPhieuXuat(MaPX,MaSP,SoLuong,DonGia,GhiChu)
                    VALUES(@MaPX,@MaSP,@SoLuong,@DonGia,@GhiChu)`);
    }
    await requestOf(db)
        .input('MaPX', sql.VarChar, existing.MaPX)
        .input('GhiChu', sql.NVarChar, countScrapNote(maKK, scrap, impact))
        .input('KhongTruTon', sql.Bit, impact.KhongTruTon ? 1 : 0)
        .query(`UPDATE PhieuXuat SET GhiChu=@GhiChu, KhongTruTon=@KhongTruTon WHERE MaPX=@MaPX`);
    return existing;
};

const activeStatusSql = ACTIVE_ISSUE_STATUSES.map(status => `N'${status}'`).join(', ');

const findActiveIssue = async (db, { maKK = null, maDT = null, lock = false } = {}) => {
    if (!maKK && !maDT) return null;
    const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    try {
        const request = requestOf(db);
        if (maKK) request.input('MaKK', sql.VarChar, maKK);
        if (maDT) request.input('MaDT', sql.VarChar, maDT);
        const marker = maDT ? returnIssueMarker(maDT) : '';
        if (maDT) request.input('Mau', sql.NVarChar, `%${marker}%`);
        const result = await request.query(`
            SELECT TOP 1 MaPX, TrangThai, MaKK, MaDT, KhongTruTon, GhiChu
            FROM PhieuXuat ${lockHint}
            WHERE TrangThai IN (${activeStatusSql})
              AND (
                    ${maKK ? 'MaKK=@MaKK' : '1=0'}
                 OR ${maDT ? '(MaDT=@MaDT OR GhiChu LIKE @Mau)' : '1=0'}
              )
            ORDER BY CASE TrangThai
                WHEN N'Nháp' THEN 1 WHEN N'Chờ duyệt' THEN 2 WHEN N'Đã duyệt' THEN 3 ELSE 4 END,
                NgayXuat DESC`);
        return result.recordset[0] || null;
    } catch (error) {
        if (!/Invalid column name|MaKK|MaDT|KhongTruTon/i.test(error.message || '')) throw error;
        if (maKK) {
            try {
                const fallbackKK = await requestOf(db)
                    .input('MaKK', sql.VarChar, maKK)
                    .query(`SELECT TOP 1 MaPX, TrangThai, MaKK, GhiChu
                            FROM PhieuXuat ${lockHint}
                            WHERE MaKK=@MaKK AND TrangThai IN (${activeStatusSql})
                            ORDER BY CASE TrangThai
                                WHEN N'Nháp' THEN 1 WHEN N'Chờ duyệt' THEN 2 WHEN N'Đã duyệt' THEN 3 ELSE 4 END,
                                NgayXuat DESC`);
                if (fallbackKK.recordset[0]) return fallbackKK.recordset[0];
            } catch (inner) {
                if (!/Invalid column name|MaKK/i.test(inner.message || '')) throw inner;
            }
        }
        if (!maDT) return null;
        const fallback = await requestOf(db)
            .input('Mau', sql.NVarChar, `%${returnIssueMarker(maDT)}%`)
            .query(`SELECT TOP 1 MaPX, TrangThai, GhiChu
                    FROM PhieuXuat ${lockHint}
                    WHERE GhiChu LIKE @Mau AND TrangThai IN (${activeStatusSql})
                    ORDER BY CASE TrangThai
                        WHEN N'Nháp' THEN 1 WHEN N'Chờ duyệt' THEN 2 WHEN N'Đã duyệt' THEN 3 ELSE 4 END,
                        NgayXuat DESC`);
        return fallback.recordset[0] || null;
    }
};

const loadCountScrapSource = async (db, { maKK, maNV, lock = false }) => {
    const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const header = await requestOf(db)
        .input('MaKK', sql.VarChar, maKK)
        .input('MaNV', sql.VarChar, maNV)
        .query(`SELECT kk.MaKK, kk.MaKho, kk.MaNV, kk.TrangThai, kk.GhiChu, k.TenKho
                FROM KiemKe kk ${lockHint}
                JOIN Kho k ON k.MaKho=kk.MaKho
                WHERE kk.MaKK=@MaKK AND kk.MaNV=@MaNV`);
    if (!header.recordset.length) throw new Error('Không tìm thấy đợt kiểm kê của bạn.');
    const count = header.recordset[0];
    if (count.TrangThai === 'Đang kiểm') throw new Error('Hãy gửi đợt kiểm kê trước khi lập phiếu xuất hủy.');
    if (count.TrangThai === 'Từ chối' || count.TrangThai === 'Đã đếm lại') {
        throw new Error('Đợt kiểm kê đã bị từ chối hoặc đã đếm lại, không lập phiếu xuất hủy từ đợt này.');
    }
    const lineRows = await requestOf(db).input('MaKK', sql.VarChar, maKK).input('MaKho', sql.VarChar, count.MaKho).query(`
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SLHeThong, ct.SLThucTe, ct.TinhTrangHang, ct.NguyenNhan,
               ISNULL(tk.SLTon,0) SLTonHienTai, ISNULL(tk.DonGiaBinhQuan,0) DonGiaBinhQuan
        FROM ChiTietKiemKe ct
        JOIN SanPham sp ON sp.MaSP=ct.MaSP
        LEFT JOIN TonKho tk ON tk.MaKho=@MaKho AND tk.MaSP=ct.MaSP
        WHERE ct.MaKK=@MaKK AND ct.TinhTrangHang IN (N'Hỏng', N'Hết hạn')
          AND (ct.SLThucTe < ct.SLHeThong OR ct.SLThucTe>0)
        ORDER BY sp.TenSP`);
    const scrap = scrapLinesFromRows(lineRows.recordset);
    if (!scrap.length) throw new Error('Đợt kiểm kê không có hàng hỏng/hết hạn còn số lượng thực tế để xuất hủy.');
    const impact = countStockImpact(scrap);
    let existing = await findActiveIssue(db, { maKK, lock });
    if (existing) existing = await alignExistingCountIssue(db, existing, scrap, impact, maKK);
    const prefill = {
        LoaiXuat: 'Hủy hàng',
        MaKK: maKK,
        MaDT: null,
        KhongTruTon: impact.KhongTruTon,
        stockImpact: impact,
        sourceKind: 'kiem-ke',
        sourceLabel: `Kiểm kê ${maKK} · ${count.TenKho}`,
        GhiChu: countScrapNote(maKK, scrap, impact),
        lines: scrap.map(line => ({
            MaSP: line.MaSP,
            TenSP: line.TenSP,
            DonViTinh: line.DonViTinh,
            SoLuong: line.SoLuong,
            DonGia: line.DonGia,
            ThanhTien: line.ThanhTien,
            SLTon: line.SLTonHienTai,
            GhiChu: `${line.TinhTrangHang}${line.NguyenNhan ? `: ${line.NguyenNhan}` : ''}`
        }))
    };
    return { count, scrap, existing, impact, prefill };
};

const loadReturnDiscardSource = async (db, { maDT, maNV, lock = false }) => {
    const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const header = await requestOf(db)
        .input('MaDT', sql.VarChar, maDT)
        .query(`SELECT dt.MaDT, dt.MaHD, dt.MaNV_KiemTra, dt.TrangThai, dt.KetQuaKiemTra, dt.LyDo
                FROM PhieuDoiTra dt ${lockHint}
                WHERE dt.MaDT=@MaDT`);
    if (!header.recordset.length) throw new Error('Không tìm thấy phiếu đổi trả.');
    const ticket = header.recordset[0];
    if (ticket.MaNV_KiemTra !== maNV) {
        throw new Error('Chỉ thủ kho đã kiểm phiếu này mới lập phiếu xuất hủy từ đổi trả.');
    }
    if (!['Chờ duyệt', 'Đã duyệt', 'Hoàn thành'].includes(ticket.TrangThai)) {
        throw new Error('Hãy ghi kết quả kiểm (loại bỏ/vứt) trước khi lập phiếu xuất hủy.');
    }
    if (isRestockAccepted(ticket.KetQuaKiemTra)) {
        throw new Error('Hàng đã nhập lại kho. Nếu tích nhầm, dùng “Tôi đã tích nhầm” trên lịch sử kho. Phiếu xuất hủy dùng cho hàng loại bỏ/vứt.');
    }
    if (!/không nhập lại/i.test(String(ticket.KetQuaKiemTra || ''))) {
        throw new Error('Phiếu này chưa ghi loại bỏ/vứt nên chưa lập phiếu xuất hủy.');
    }
    const lineRows = await requestOf(db).input('MaDT', sql.VarChar, maDT).query(`
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.DonGiaVon, ct.LyDo
        FROM ChiTietDoiTra ct
        JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaDT=@MaDT AND ct.LoaiDong=N'Hàng khách trả' AND ct.SoLuong>0
        ORDER BY sp.TenSP`);
    if (!lineRows.recordset.length) throw new Error('Phiếu đổi trả không có hàng khách trả để ghi xuất hủy.');
    const lines = lineRows.recordset.map(line => ({
        MaSP: line.MaSP,
        TenSP: line.TenSP,
        DonViTinh: line.DonViTinh,
        SoLuong: Number(line.SoLuong),
        DonGia: Number(line.DonGia || line.DonGiaVon || 0),
        ThanhTien: Number(line.ThanhTien || 0),
        GhiChu: `Từ ${maDT}${line.LyDo ? `: ${line.LyDo}` : ''}`
    }));
    const impact = returnStockImpact();
    const existing = await findActiveIssue(db, { maDT, lock });
    const prefill = {
        LoaiXuat: 'Hủy hàng',
        MaKK: null,
        MaDT: maDT,
        KhongTruTon: true,
        stockImpact: impact,
        sourceKind: 'doi-tra',
        sourceLabel: `Đổi trả ${maDT} · hóa đơn ${ticket.MaHD}`,
        GhiChu: returnDiscardNote({ maDT, maHD: ticket.MaHD, lyDo: ticket.LyDo, lines }),
        lines
    };
    return { ticket, scrap: lines, existing, impact, prefill };
};

const listPendingSources = async (db, { maNV }) => {
    const counts = [];
    const returns = [];
    try {
        const countRows = await requestOf(db).input('MaNV', sql.VarChar, maNV).query(`
            SELECT kk.MaKK, kk.TrangThai, k.TenKho,
                   COUNT(ct.MaSP) SoMatHang,
                   SUM(CASE WHEN ct.SLThucTe < ct.SLHeThong THEN ct.SLHeThong - ct.SLThucTe ELSE ct.SLThucTe END) TongSoLuong,
                   SUM(CASE WHEN ct.SLThucTe < ct.SLHeThong THEN ct.SLHeThong - ct.SLThucTe ELSE ct.SLThucTe END * ISNULL(tk.DonGiaBinhQuan,0)) TongGiaTri,
                   px.MaPX, px.TrangThai TrangThaiPX
            FROM KiemKe kk
            JOIN Kho k ON k.MaKho=kk.MaKho
            JOIN ChiTietKiemKe ct ON ct.MaKK=kk.MaKK
            LEFT JOIN TonKho tk ON tk.MaKho=kk.MaKho AND tk.MaSP=ct.MaSP
            LEFT JOIN PhieuXuat px ON px.MaKK=kk.MaKK AND px.TrangThai IN (${activeStatusSql})
            WHERE kk.MaNV=@MaNV
              AND kk.TrangThai IN (N'Chờ duyệt điều chỉnh', N'Đã duyệt', N'Hoàn thành không chênh lệch')
              AND ct.TinhTrangHang IN (N'Hỏng', N'Hết hạn') AND ct.SLThucTe>0
            GROUP BY kk.MaKK, kk.TrangThai, k.TenKho, px.MaPX, px.TrangThai
            ORDER BY kk.MaKK DESC`);
        for (const row of countRows.recordset) {
            counts.push({
                kind: 'kiem-ke',
                id: row.MaKK,
                title: `Kiểm kê ${row.MaKK}`,
                subtitle: `${row.TenKho} · ${row.SoMatHang} mặt hàng hỏng/hết hạn`,
                qty: Number(row.TongSoLuong || 0),
                value: Number(row.TongGiaTri || 0),
                status: row.TrangThai,
                existing: row.MaPX ? { MaPX: row.MaPX, TrangThai: row.TrangThaiPX } : null
            });
        }
    } catch (error) {
        if (!/Invalid column name|MaKK/i.test(error.message || '')) throw error;
    }
    try {
        const returnRows = await requestOf(db).input('MaNV', sql.VarChar, maNV).query(`
            SELECT dt.MaDT, dt.MaHD, dt.TrangThai, dt.LyDo, dt.KetQuaKiemTra,
                   COUNT(ct.MaSP) SoMatHang, SUM(ct.SoLuong) TongSoLuong, SUM(ct.ThanhTien) TongGiaTri,
                   px.MaPX, px.TrangThai TrangThaiPX
            FROM PhieuDoiTra dt
            JOIN ChiTietDoiTra ct ON ct.MaDT=dt.MaDT AND ct.LoaiDong=N'Hàng khách trả'
            LEFT JOIN PhieuXuat px ON (px.MaDT=dt.MaDT OR px.GhiChu LIKE N'%Nguồn đổi trả ' + dt.MaDT + '.%')
              AND px.TrangThai IN (${activeStatusSql})
            WHERE dt.MaNV_KiemTra=@MaNV
              AND dt.TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Hoàn thành')
              AND dt.KetQuaKiemTra LIKE N'%không nhập lại%'
            GROUP BY dt.MaDT, dt.MaHD, dt.TrangThai, dt.LyDo, dt.KetQuaKiemTra, px.MaPX, px.TrangThai
            ORDER BY dt.MaDT DESC`);
        for (const row of returnRows.recordset) {
            if (isRestockAccepted(row.KetQuaKiemTra)) continue;
            returns.push({
                kind: 'doi-tra',
                id: row.MaDT,
                title: `Đổi trả ${row.MaDT}`,
                subtitle: `Hóa đơn ${row.MaHD} · loại bỏ/vứt · ${row.SoMatHang} mặt hàng`,
                qty: Number(row.TongSoLuong || 0),
                value: Number(row.TongGiaTri || 0),
                status: row.TrangThai,
                lyDo: row.LyDo,
                existing: row.MaPX ? { MaPX: row.MaPX, TrangThai: row.TrangThaiPX } : null
            });
        }
    } catch (error) {
        if (!/Invalid column name|MaDT/i.test(error.message || '')) throw error;
    }
    return { counts, returns };
};

module.exports = {
    findActiveIssue,
    loadCountScrapSource,
    loadReturnDiscardSource,
    listPendingSources
};
