const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { storedStockImpact } = require('../services/countScrap');
const { ensureCountScrapSchema } = require('../services/countScrapSchema');
const {
    findActiveIssue,
    loadCountScrapSource,
    loadReturnDiscardSource,
    listPendingSources
} = require('../services/stockIssueSources');

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const issueTypes = new Set(['Trả NCC', 'Hủy hàng', 'Sử dụng nội bộ']);

const generateId = async (transaction, table, column, prefix, digits = 3) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} Id FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Id;
    const sequence = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(sequence).padStart(digits, '0')}`;
};

const datePrefix = prefix => {
    const now = new Date();
    return `${prefix}${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
};

const writeAudit = (transaction, user, action, recordId, content) =>
    logAudit(transaction, { user, action, table: 'PhieuXuat', recordId, content, uc: 'UC19', severity: 'Quan trọng' });

const getWarehouse = async request => {
    const result = await request.query(`SELECT TOP 1 MaKho,TenKho,DiaChi
                                        FROM Kho WHERE TrangThai=1 ORDER BY MaKho`);
    if (!result.recordset.length) throw new Error('Chưa cấu hình kho đang hoạt động.');
    return result.recordset[0];
};

const normalizeHeader = body => {
    const LoaiXuat = clean(body.LoaiXuat, 30);
    if (!issueTypes.has(LoaiXuat)) throw new Error('Loại xuất chỉ được là Trả NCC, Hủy hàng hoặc Sử dụng nội bộ.');
    const MaPN = clean(body.MaPN, 20) || null;
    if (LoaiXuat === 'Trả NCC' && !MaPN) throw new Error('Xuất trả Nhà cung cấp bắt buộc phải chọn Phiếu nhập nguồn.');
    return {
        LoaiXuat,
        MaPN: LoaiXuat === 'Trả NCC' ? MaPN : null,
        GhiChu: clean(body.GhiChu, 500) || null
    };
};

const normalizeLines = lines => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('Phiếu xuất phải có ít nhất một mặt hàng.');
    const seen = new Set();
    return lines.map((line, index) => {
        const MaSP = clean(line.MaSP, 20);
        const SoLuong = Number(line.SoLuong);
        if (!MaSP) throw new Error(`Dòng ${index + 1} chưa chọn sản phẩm.`);
        if (seen.has(MaSP)) throw new Error(`Sản phẩm ${MaSP} bị lặp trong Phiếu xuất.`);
        if (!Number.isInteger(SoLuong) || SoLuong <= 0) throw new Error(`Số lượng xuất của ${MaSP} phải là số nguyên lớn hơn 0.`);
        seen.add(MaSP);
        const DonGia = line.DonGia == null || line.DonGia === '' ? null : Number(line.DonGia);
        if (DonGia != null && (!Number.isFinite(DonGia) || DonGia < 0)) {
            throw new Error(`Đơn giá tham chiếu của ${MaSP} không hợp lệ.`);
        }
        return { MaSP, SoLuong, GhiChu: clean(line.GhiChu, 200) || null, DonGia };
    });
};

const assertLinesMatchSource = (lines, allowed, label) => {
    const allowedMap = new Map((allowed || []).map(line => [line.MaSP, line]));
    for (const line of lines) {
        const source = allowedMap.get(line.MaSP);
        if (!source) throw new Error(`Sản phẩm ${line.MaSP} không thuộc ${label}.`);
        const maxQty = Number(source.SoLuong || source.SLThucTe || 0);
        if (line.SoLuong > maxQty) throw new Error(`Sản phẩm ${line.MaSP} chỉ được xuất tối đa ${maxQty} theo ${label}.`);
        if (line.DonGia == null && source.DonGia != null) line.DonGia = Number(source.DonGia);
    }
};

const insertIssueHeader = async (transaction, { maPX, warehouse, user, header, status }) => {
    const base = () => new sql.Request(transaction)
        .input('MaPX', sql.VarChar, maPX)
        .input('MaKho', sql.VarChar, warehouse.MaKho)
        .input('MaNV', sql.VarChar, user.MaNV)
        .input('LoaiXuat', sql.NVarChar, header.LoaiXuat)
        .input('MaNCC', sql.VarChar, header.MaNCC || null)
        .input('MaPN', sql.VarChar, header.MaPN)
        .input('GhiChu', sql.NVarChar, header.GhiChu)
        .input('TrangThai', sql.NVarChar, status);
    const attempts = [
        req => req
            .input('MaKK', sql.VarChar, header.MaKK || null)
            .input('MaDT', sql.VarChar, header.MaDT || null)
            .input('KhongTruTon', sql.Bit, header.KhongTruTon ? 1 : 0)
            .query(`INSERT PhieuXuat(MaPX,MaKho,MaNV,LoaiXuat,MaNCC,MaPN,MaKK,MaDT,KhongTruTon,NgayXuat,TrangThai,GhiChu)
                    VALUES(@MaPX,@MaKho,@MaNV,@LoaiXuat,@MaNCC,@MaPN,@MaKK,@MaDT,@KhongTruTon,GETDATE(),@TrangThai,@GhiChu)`),
        req => req
            .input('MaKK', sql.VarChar, header.MaKK || null)
            .input('KhongTruTon', sql.Bit, header.KhongTruTon ? 1 : 0)
            .query(`INSERT PhieuXuat(MaPX,MaKho,MaNV,LoaiXuat,MaNCC,MaPN,MaKK,KhongTruTon,NgayXuat,TrangThai,GhiChu)
                    VALUES(@MaPX,@MaKho,@MaNV,@LoaiXuat,@MaNCC,@MaPN,@MaKK,@KhongTruTon,GETDATE(),@TrangThai,@GhiChu)`),
        req => req
            .input('MaKK', sql.VarChar, header.MaKK || null)
            .query(`INSERT PhieuXuat(MaPX,MaKho,MaNV,LoaiXuat,MaNCC,MaPN,MaKK,NgayXuat,TrangThai,GhiChu)
                    VALUES(@MaPX,@MaKho,@MaNV,@LoaiXuat,@MaNCC,@MaPN,@MaKK,GETDATE(),@TrangThai,@GhiChu)`),
        req => req.query(`INSERT PhieuXuat(MaPX,MaKho,MaNV,LoaiXuat,MaNCC,MaPN,NgayXuat,TrangThai,GhiChu)
                    VALUES(@MaPX,@MaKho,@MaNV,@LoaiXuat,@MaNCC,@MaPN,GETDATE(),@TrangThai,@GhiChu)`)
    ];
    let lastError;
    for (const attempt of attempts) {
        try {
            await attempt(base());
            return;
        } catch (error) {
            lastError = error;
            if (!/Invalid column name/i.test(error.message || '')) throw error;
        }
    }
    throw lastError;
};

const validateIssue = async (transaction, header, lines) => {
    let supplier = null;
    if (header.LoaiXuat === 'Trả NCC') {
        const source = await new sql.Request(transaction)
            .input('MaPN', sql.VarChar, header.MaPN)
            .query(`SELECT pn.MaPN,pn.MaKho,pn.MaNCC,ncc.TenNCC,pn.NgayXacNhan
                    FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
                    WHERE pn.MaPN=@MaPN AND pn.TrangThai=N'Đã xác nhận'`);
        if (!source.recordset.length) throw new Error('Phiếu nhập nguồn không tồn tại hoặc chưa được xác nhận nhập kho.');
        supplier = source.recordset[0];
        if (supplier.MaKho !== header.MaKho) throw new Error('Phiếu nhập nguồn không thuộc kho đang xuất.');

        const sourceLines = await new sql.Request(transaction)
            .input('MaPN', sql.VarChar, header.MaPN)
            .query(`SELECT ctpn.MaSP,ctpn.SoLuongChapNhan,
                           ISNULL((SELECT SUM(ctx.SoLuong)
                                   FROM PhieuXuat px JOIN ChiTietPhieuXuat ctx ON ctx.MaPX=px.MaPX
                                   WHERE px.MaPN=@MaPN AND px.TrangThai=N'Đã xác nhận' AND ctx.MaSP=ctpn.MaSP),0) AS SoLuongDaTra
                    FROM ChiTietPhieuNhap ctpn WHERE ctpn.MaPN=@MaPN`);
        const sourceMap = new Map(sourceLines.recordset.map(line => [line.MaSP, line]));
        for (const line of lines) {
            const sourceLine = sourceMap.get(line.MaSP);
            if (!sourceLine) throw new Error(`Sản phẩm ${line.MaSP} không thuộc Phiếu nhập nguồn ${header.MaPN}.`);
            const remaining = Number(sourceLine.SoLuongChapNhan) - Number(sourceLine.SoLuongDaTra);
            if (line.SoLuong > remaining) throw new Error(`Sản phẩm ${line.MaSP} chỉ còn tối đa ${remaining} đơn vị có thể trả theo Phiếu nhập ${header.MaPN}.`);
        }
    }

    const productResult = await new sql.Request(transaction)
        .input('MaKho', sql.VarChar, header.MaKho)
        .query(`SELECT sp.MaSP,sp.TenSP,ISNULL(tk.SLTon,0) SLTon,ISNULL(tk.DonGiaBinhQuan,0) DonGiaBinhQuan
                FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP AND tk.MaKho=@MaKho`);
    const productMap = new Map(productResult.recordset.map(product => [product.MaSP, product]));
    for (const line of lines) {
        if (!productMap.has(line.MaSP)) throw new Error(`Không tìm thấy sản phẩm ${line.MaSP}.`);
    }
    return { supplier, productMap };
};

const replaceLines = async (transaction, maPX, lines, productMap) => {
    await new sql.Request(transaction).input('MaPX', sql.VarChar, maPX)
        .query('DELETE FROM ChiTietPhieuXuat WHERE MaPX=@MaPX');
    for (const line of lines) {
        const cost = line.DonGia != null && Number.isFinite(Number(line.DonGia))
            ? Number(line.DonGia)
            : Number(productMap.get(line.MaSP)?.DonGiaBinhQuan || 0);
        await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, maPX)
            .input('MaSP', sql.VarChar, line.MaSP)
            .input('SoLuong', sql.Int, line.SoLuong)
            .input('DonGia', sql.Decimal(18, 2), cost)
            .input('GhiChu', sql.NVarChar, line.GhiChu)
            .query(`INSERT ChiTietPhieuXuat(MaPX,MaSP,SoLuong,DonGia,GhiChu)
                    VALUES(@MaPX,@MaSP,@SoLuong,@DonGia,@GhiChu)`);
    }
};

const listIssues = async (req, res) => {
    try {
        const keyword = clean(req.query.search, 100);
        const status = clean(req.query.status, 30);
        const pool = await poolPromise;
        await ensureCountScrapSchema(pool);
        const bind = () => pool.request()
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('TrangThai', sql.NVarChar, status);
        const listSql = (cols) => `
                    SELECT px.MaPX,px.LoaiXuat,px.MaPN,${cols}px.NgayXuat,px.TrangThai,px.GhiChu,px.LyDoTuChoi,
                           k.TenKho,ncc.TenNCC,COUNT(ct.MaSP) SoMatHang,SUM(ct.SoLuong) TongSoLuong,
                           SUM(ct.SoLuong*ct.DonGia) TongGiaTriThamChieu
                    FROM PhieuXuat px JOIN Kho k ON k.MaKho=px.MaKho
                    LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=px.MaNCC
                    LEFT JOIN ChiTietPhieuXuat ct ON ct.MaPX=px.MaPX
                    WHERE px.MaNV=@MaNV AND (@TrangThai=N'' OR px.TrangThai=@TrangThai)
                      AND (@TuKhoa=N'' OR px.MaPX LIKE @Mau COLLATE Latin1_General_100_CI_AI OR px.LoaiXuat LIKE @Mau COLLATE Latin1_General_100_CI_AI
                           OR px.MaPN LIKE @Mau COLLATE Latin1_General_100_CI_AI OR px.GhiChu LIKE @Mau COLLATE Latin1_General_100_CI_AI OR ncc.TenNCC LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                    GROUP BY px.MaPX,px.LoaiXuat,px.MaPN,${cols}px.NgayXuat,px.TrangThai,px.GhiChu,
                             px.LyDoTuChoi,k.TenKho,ncc.TenNCC
                    ORDER BY px.NgayXuat DESC`;
        let result;
        try {
            result = await bind().query(listSql('px.MaKK,px.MaDT,px.KhongTruTon,'));
        } catch (columnError) {
            if (!/Invalid column name|MaKK|MaDT|KhongTruTon/i.test(columnError.message || '')) throw columnError;
            try {
                result = await bind().query(listSql('px.MaKK,'));
            } catch (innerError) {
                if (!/Invalid column name|MaKK/i.test(innerError.message || '')) throw innerError;
                result = await bind().query(listSql(''));
            }
        }
        const items = result.recordset.map(item => {
            const note = String(item.GhiChu || '');
            const maDT = item.MaDT || (note.match(/Nguồn đổi trả\s+(DT[A-Z0-9]+)/i) || [])[1] || null;
            return { ...item, MaDT: maDT, KhongTruTon: Boolean(item.KhongTruTon) || Boolean(maDT) };
        });
        res.json({ items });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách Phiếu xuất kho.' });
    }
};

const getIssueDetail = async (req, res, ownerOnly) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request()
            .input('MaPX', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('ChiCuaToi', sql.Bit, ownerOnly ? 1 : 0)
            .query(`SELECT px.*,k.TenKho,k.DiaChi,nv.TenNV NguoiLap,ncc.TenNCC,
                           nvd.TenNV NguoiDuyet,pn.NgayXacNhan NgayXacNhanPhieuNhap
                    FROM PhieuXuat px JOIN Kho k ON k.MaKho=px.MaKho
                    JOIN NhanVien nv ON nv.MaNV=px.MaNV
                    LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=px.MaNCC
                    LEFT JOIN NhanVien nvd ON nvd.MaNV=px.MaNV_Duyet
                    LEFT JOIN PhieuNhap pn ON pn.MaPN=px.MaPN
                    WHERE px.MaPX=@MaPX AND (@ChiCuaToi=0 OR px.MaNV=@MaNV)`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Phiếu xuất kho.' });
        const issue = header.recordset[0];
        const relatedMatch = String(issue.GhiChu || '').match(/Nguồn đổi trả\s+(DT[A-Z0-9]+)/i)
            || String(issue.GhiChu || '').match(/\b(DT\d{8,})\b/);
        const maDT = issue.MaDT || (relatedMatch ? relatedMatch[1] : null);
        const cashierReason = (String(issue.GhiChu || '').match(/Lý do thu ngân:\s*(.+?)(?:\.|$)/i) || [])[1] || null;
        const [lines, audit, stockMoves, related] = await Promise.all([
            pool.request()
                .input('MaPX', sql.VarChar, req.params.id)
                .query(`SELECT ct.*,sp.TenSP,sp.DonViTinh,sp.MaVach,dm.TenDM,ISNULL(tk.SLTon,0) SLTonHienTai
                        FROM ChiTietPhieuXuat ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
                        JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                        JOIN PhieuXuat px ON px.MaPX=ct.MaPX
                        LEFT JOIN TonKho tk ON tk.MaKho=px.MaKho AND tk.MaSP=ct.MaSP
                        WHERE ct.MaPX=@MaPX ORDER BY sp.TenSP`),
            pool.request()
                .input('MaBanGhi', sql.VarChar, req.params.id)
                .query(`SELECT nk.ThoiGian, nk.HanhDong, nk.NoiDung, n.TenNV
                        FROM NhatKy nk
                        LEFT JOIN TaiKhoan t ON t.MaTK=nk.MaTK
                        LEFT JOIN NhanVien n ON n.MaNV=t.MaNV
                        WHERE nk.BangLienQuan=N'PhieuXuat' AND nk.MaBanGhi=@MaBanGhi
                        ORDER BY nk.ThoiGian`),
            pool.request()
                .input('MaPX', sql.VarChar, req.params.id)
                .query(`SELECT gd.LoaiGD, gd.SoLuong, gd.NgayGD, gd.GhiChu, sp.MaSP, sp.TenSP, nv.TenNV NguoiGhiSo
                        FROM GiaoDichKho gd
                        JOIN SanPham sp ON sp.MaSP=gd.MaSP
                        JOIN NhanVien nv ON nv.MaNV=gd.MaNV
                        WHERE gd.LoaiChungTu=N'PhieuXuat' AND gd.MaChungTu=@MaPX
                        ORDER BY gd.NgayGD`),
            maDT
                ? pool.request().input('MaDT', sql.VarChar, maDT).query(`
                    SELECT dt.MaDT, dt.LyDo, dt.TrangThai, dt.KetQuaKiemTra, dt.MaHD
                    FROM PhieuDoiTra dt WHERE dt.MaDT=@MaDT`)
                : Promise.resolve({ recordset: [] })
        ]);
        const confirmLog = audit.recordset.find(row => /xác nhận xuất/i.test(row.HanhDong || ''));
        const relatedTicket = related.recordset[0] || null;
        const tongGiaTri = lines.recordset.reduce((sum, line) => sum + Number(line.SoLuong || 0) * Number(line.DonGia || 0), 0);
        res.json({
            issue: {
                ...issue,
                TongGiaTriThamChieu: tongGiaTri,
                MaDT: relatedTicket?.MaDT || maDT,
                KhongTruTon: Boolean(issue.KhongTruTon) || Boolean(relatedTicket?.MaDT || maDT),
                stockImpact: storedStockImpact({
                    ...issue,
                    MaDT: relatedTicket?.MaDT || maDT,
                    KhongTruTon: Boolean(issue.KhongTruTon) || Boolean(relatedTicket?.MaDT || maDT)
                }),
                LyDoThuNgan: cashierReason || relatedTicket?.LyDo || null,
                NguoiXacNhan: confirmLog?.TenNV || (issue.TrangThai === 'Đã xác nhận' ? issue.NguoiLap : null),
                NgayXacNhan: confirmLog?.ThoiGian || stockMoves.recordset[0]?.NgayGD || null
            },
            lines: lines.recordset,
            audit: audit.recordset,
            stockMoves: stockMoves.recordset,
            relatedReturn: relatedTicket
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết Phiếu xuất kho.' });
    }
};

const getOptions = async (req, res) => {
    try {
        const pool = await poolPromise;
        const warehouse = await getWarehouse(pool.request());
        const [products, receipts] = await Promise.all([
            pool.request().input('MaKho', sql.VarChar, warehouse.MaKho).query(`
                SELECT sp.MaSP,sp.TenSP,sp.DonViTinh,sp.MaVach,dm.TenDM,
                       ISNULL(tk.SLTon,0) SLTon,ISNULL(tk.DonGiaBinhQuan,0) DonGiaBinhQuan
                FROM SanPham sp JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                LEFT JOIN TonKho tk ON tk.MaKho=@MaKho AND tk.MaSP=sp.MaSP
                WHERE sp.TrangThai=N'Đang bán' ORDER BY sp.TenSP`),
            pool.request().input('MaKho', sql.VarChar, warehouse.MaKho).query(`
                SELECT pn.MaPN,pn.NgayNhap,pn.NgayXacNhan,pn.MaNCC,ncc.TenNCC,
                       COUNT(ct.MaSP) SoMatHang,SUM(ct.SoLuongChapNhan) TongChapNhan
                FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
                JOIN ChiTietPhieuNhap ct ON ct.MaPN=pn.MaPN
                WHERE pn.MaKho=@MaKho AND pn.TrangThai=N'Đã xác nhận'
                GROUP BY pn.MaPN,pn.NgayNhap,pn.NgayXacNhan,pn.MaNCC,ncc.TenNCC
                ORDER BY pn.NgayXacNhan DESC`)
        ]);
        res.json({ warehouse, products: products.recordset, receipts: receipts.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải dữ liệu lập Phiếu xuất.' });
    }
};

const getSourceReceipt = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaPN', sql.VarChar, req.params.id).query(`
            SELECT pn.MaPN,pn.MaKho,pn.MaNCC,ncc.TenNCC,pn.NgayXacNhan
            FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
            WHERE pn.MaPN=@MaPN AND pn.TrangThai=N'Đã xác nhận'`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Phiếu nhập nguồn không tồn tại hoặc chưa xác nhận.' });
        const lines = await pool.request().input('MaPN', sql.VarChar, req.params.id).query(`
            SELECT ct.MaSP,sp.TenSP,sp.DonViTinh,sp.MaVach,dm.TenDM,ct.SoLuongChapNhan,
                   ISNULL((SELECT SUM(ctx.SoLuong)
                           FROM PhieuXuat px JOIN ChiTietPhieuXuat ctx ON ctx.MaPX=px.MaPX
                           WHERE px.MaPN=@MaPN AND px.TrangThai=N'Đã xác nhận' AND ctx.MaSP=ct.MaSP),0) SoLuongDaTra,
                   ISNULL(tk.SLTon,0) SLTon
            FROM ChiTietPhieuNhap ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
            LEFT JOIN TonKho tk ON tk.MaKho=(SELECT MaKho FROM PhieuNhap WHERE MaPN=@MaPN) AND tk.MaSP=ct.MaSP
            WHERE ct.MaPN=@MaPN AND ct.SoLuongChapNhan>0 ORDER BY sp.TenSP`);
        res.json({ receipt: header.recordset[0], lines: lines.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải sản phẩm từ Phiếu nhập nguồn.' });
    }
};

const existingIssueResponse = (existing, sourceLabel) => {
    const confirmed = existing.TrangThai === 'Đã xác nhận';
    return {
        MaPX: existing.MaPX,
        existed: true,
        submitted: existing.TrangThai !== 'Nháp',
        confirmed,
        message: confirmed
            ? `Đã có phiếu xuất ${existing.MaPX} cho ${sourceLabel}.`
            : `Đã có phiếu xuất ${existing.MaPX} (${existing.TrangThai}) từ ${sourceLabel}. Mở để xem nội dung hoặc tiếp tục gửi duyệt.`
    };
};

const persistLinkedIssue = async ({ transaction, user, header, lines, submitNow, sourceLabel, impact }) => {
    const warehouse = await getWarehouse(new sql.Request(transaction));
    header.MaKho = warehouse.MaKho;
    header.MaNCC = null;
    const validation = await validateIssue(transaction, header, lines);
    const maPX = await generateId(transaction, 'PhieuXuat', 'MaPX', datePrefix('PX'));
    const nextStatus = submitNow ? 'Chờ duyệt' : 'Nháp';
    try {
        await insertIssueHeader(transaction, {
            maPX, warehouse, user, header, status: nextStatus
        });
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) {
            const again = await findActiveIssue(transaction, { maKK: header.MaKK, maDT: header.MaDT, lock: true });
            return { duplicate: true, existing: again };
        }
        throw error;
    }
    await replaceLines(transaction, maPX, lines, validation.productMap);
    const stockNote = impact?.KhongTruTon
        ? 'phiếu thông tin, xác nhận không trừ tồn'
        : 'tồn kho chưa thay đổi cho tới khi xác nhận xuất';
    await writeAudit(transaction, user, submitNow ? 'Lập và gửi duyệt Phiếu xuất kho' : 'Lập Phiếu xuất kho', maPX,
        `Hủy hàng từ ${sourceLabel}; ${nextStatus}; ${stockNote}`);
    return { maPX, nextStatus };
};

const createIssue = async (req, res) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        const header = normalizeHeader(req.body);
        const lines = normalizeLines(req.body.lines);
        const maKK = clean(req.body.MaKK, 20) || null;
        const maDT = clean(req.body.MaDT, 20) || null;
        if (maKK && maDT) throw new Error('Phiếu xuất chỉ liên kết một nguồn: kiểm kê hoặc đổi trả.');
        await ensureCountScrapSchema(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        header.MaKK = maKK;
        header.MaDT = maDT;
        header.KhongTruTon = false;
        if (maKK || maDT) {
            if (header.LoaiXuat !== 'Hủy hàng') throw new Error('Phiếu xuất từ hàng hỏng phải là loại Hủy hàng.');
            const source = maKK
                ? await loadCountScrapSource(transaction, { maKK, maNV: req.user.MaNV, lock: true })
                : await loadReturnDiscardSource(transaction, { maDT, maNV: req.user.MaNV, lock: true });
            if (source.existing) {
                await transaction.commit();
                return res.json(existingIssueResponse(source.existing, maKK || maDT));
            }
            assertLinesMatchSource(lines, source.prefill.lines, maKK ? `kiểm kê ${maKK}` : `đổi trả ${maDT}`);
            header.KhongTruTon = source.impact.KhongTruTon;
            if (!header.GhiChu) header.GhiChu = source.prefill.GhiChu;
        }
        const warehouse = await getWarehouse(new sql.Request(transaction));
        header.MaKho = warehouse.MaKho;
        const validation = await validateIssue(transaction, header, lines);
        header.MaNCC = validation.supplier?.MaNCC || null;
        const maPX = await generateId(transaction, 'PhieuXuat', 'MaPX', datePrefix('PX'));
        try {
            await insertIssueHeader(transaction, {
                maPX, warehouse, user: req.user, header, status: 'Nháp'
            });
        } catch (error) {
            if (error.number === 2601 || error.number === 2627) {
                const again = await findActiveIssue(transaction, { maKK, maDT, lock: true });
                await transaction.commit();
                return res.json(existingIssueResponse(again || { MaPX: maPX, TrangThai: 'Nháp' }, maKK || maDT));
            }
            throw error;
        }
        await replaceLines(transaction, maPX, lines, validation.productMap);
        await writeAudit(transaction, req.user, 'Lập Phiếu xuất kho', maPX,
            `${header.LoaiXuat}${maKK ? `; nguồn ${maKK}` : ''}${maDT ? `; nguồn ${maDT}` : ''}; lưu Nháp; ${header.KhongTruTon ? 'không trừ tồn khi xác nhận' : 'tồn kho chưa thay đổi'}`);
        await transaction.commit();
        res.status(201).json({
            message: `Đã lưu Phiếu xuất ${maPX} ở trạng thái Nháp.`,
            MaPX: maPX,
            KhongTruTon: header.KhongTruTon
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập Phiếu xuất kho.' });
    }
};

const previewFromCount = async (req, res) => {
    try {
        const maKK = clean(req.params.id, 20);
        if (!maKK) throw new Error('Thiếu mã đợt kiểm kê.');
        const pool = await poolPromise;
        await ensureCountScrapSchema(pool);
        const source = await loadCountScrapSource(pool, { maKK, maNV: req.user.MaNV });
        res.json({
            existing: source.existing,
            prefill: source.prefill,
            stockImpact: source.impact,
            message: source.existing
                ? `Đã có phiếu xuất ${source.existing.MaPX} (${source.existing.TrangThai}) từ ${maKK}.`
                : `Đã điền ${source.scrap.length} mặt hàng hỏng từ ${maKK}.`
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể tải hàng hỏng từ kiểm kê.' });
    }
};

const previewFromReturn = async (req, res) => {
    try {
        const maDT = clean(req.params.id, 20);
        if (!maDT) throw new Error('Thiếu mã phiếu đổi trả.');
        const pool = await poolPromise;
        await ensureCountScrapSchema(pool);
        const source = await loadReturnDiscardSource(pool, { maDT, maNV: req.user.MaNV });
        res.json({
            existing: source.existing,
            prefill: source.prefill,
            stockImpact: source.impact,
            message: source.existing
                ? `Đã có phiếu xuất ${source.existing.MaPX} (${source.existing.TrangThai}) từ ${maDT}.`
                : `Đã điền hàng khách trả hỏng từ ${maDT}.`
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể tải hàng đổi trả loại bỏ.' });
    }
};

const getPendingSources = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureCountScrapSchema(pool);
        const pending = await listPendingSources(pool, { maNV: req.user.MaNV });
        res.json(pending);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải hàng hỏng chờ lập phiếu xuất.' });
    }
};

const createIssueFromReturn = async (req, res) => {
    const maDT = clean(req.params.id, 20);
    const submitNow = Boolean(req.body?.submit);
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        if (!maDT) throw new Error('Thiếu mã phiếu đổi trả.');
        await ensureCountScrapSchema(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const source = await loadReturnDiscardSource(transaction, { maDT, maNV: req.user.MaNV, lock: true });
        if (source.existing) {
            await transaction.commit();
            return res.json(existingIssueResponse(source.existing, maDT));
        }
        const header = {
            LoaiXuat: 'Hủy hàng',
            MaPN: null,
            MaKK: null,
            MaDT: maDT,
            KhongTruTon: true,
            GhiChu: source.prefill.GhiChu
        };
        const lines = normalizeLines(source.prefill.lines);
        const saved = await persistLinkedIssue({
            transaction, user: req.user, header, lines, submitNow,
            sourceLabel: `đổi trả ${maDT}`, impact: source.impact
        });
        if (saved.duplicate) {
            await transaction.commit();
            return res.json(existingIssueResponse(saved.existing || { MaPX: null, TrangThai: 'Nháp' }, maDT));
        }
        await transaction.commit();
        res.status(201).json({
            MaPX: saved.maPX,
            existed: false,
            submitted: submitNow,
            KhongTruTon: true,
            message: submitNow
                ? `Đã lập phiếu xuất hủy ${saved.maPX} từ ${maDT} và gửi Quản lý duyệt. Xác nhận không trừ tồn (đã trừ lúc bán).`
                : `Đã lập phiếu xuất hủy ${saved.maPX} (Nháp) từ ${maDT}. Phiếu ghi SL/tiền/hàng; xác nhận không trừ tồn lần nữa.`
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập phiếu xuất hỏng từ đổi trả.' });
    }
};

const createIssueFromCount = async (req, res) => {
    const maKK = clean(req.params.id, 20);
    const submitNow = Boolean(req.body?.submit);
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        if (!maKK) throw new Error('Thiếu mã đợt kiểm kê.');
        await ensureCountScrapSchema(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const source = await loadCountScrapSource(transaction, { maKK, maNV: req.user.MaNV, lock: true });
        if (source.existing) {
            if (submitNow && source.existing.TrangThai === 'Nháp') {
                await new sql.Request(transaction).input('MaPX', sql.VarChar, source.existing.MaPX)
                    .query(`UPDATE PhieuXuat SET TrangThai=N'Chờ duyệt',MaNV_Duyet=NULL,NgayDuyet=NULL,LyDoTuChoi=NULL
                            WHERE MaPX=@MaPX`);
                await writeAudit(transaction, req.user, 'Gửi duyệt Phiếu xuất kho', source.existing.MaPX,
                    `Hủy hàng từ kiểm kê ${maKK}; tồn kho chưa thay đổi`);
                await transaction.commit();
                return res.json({
                    MaPX: source.existing.MaPX,
                    existed: true,
                    submitted: true,
                    message: `Đã gửi phiếu xuất hủy ${source.existing.MaPX} (từ ${maKK}) sang Quản lý duyệt.`
                });
            }
            await transaction.commit();
            return res.json(existingIssueResponse(source.existing, `kiểm kê ${maKK}`));
        }
        const header = {
            LoaiXuat: 'Hủy hàng',
            MaPN: null,
            MaKK: maKK,
            MaDT: null,
            KhongTruTon: source.impact.KhongTruTon,
            GhiChu: source.prefill.GhiChu
        };
        const lines = normalizeLines(source.prefill.lines);
        const saved = await persistLinkedIssue({
            transaction, user: req.user, header, lines, submitNow,
            sourceLabel: `kiểm kê ${maKK}`, impact: source.impact
        });
        if (saved.duplicate) {
            await transaction.commit();
            return res.json(existingIssueResponse(saved.existing || { MaPX: null, TrangThai: 'Nháp' }, `kiểm kê ${maKK}`));
        }
        await transaction.commit();
        const stockHint = source.impact.KhongTruTon
            ? 'Xác nhận không trừ trùng tồn.'
            : 'Thủ kho xác nhận xuất mới trừ tồn hàng hỏng còn trên kệ.';
        res.status(201).json({
            MaPX: saved.maPX,
            existed: false,
            submitted: submitNow,
            KhongTruTon: source.impact.KhongTruTon,
            message: submitNow
                ? `Đã lập phiếu xuất hủy ${saved.maPX} từ ${maKK} và gửi Quản lý duyệt. ${stockHint}`
                : `Đã lập phiếu xuất hủy ${saved.maPX} (Nháp) từ ${maKK}. ${stockHint}`
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập phiếu xuất hủy từ kiểm kê.' });
    }
};

const updateIssue = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const header = normalizeHeader(req.body);
        const lines = normalizeLines(req.body.lines);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        let current;
        try {
            current = await new sql.Request(transaction)
                .input('MaPX', sql.VarChar, req.params.id)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .query(`SELECT MaKho,TrangThai,MaKK,MaDT,KhongTruTon FROM PhieuXuat WITH(UPDLOCK,HOLDLOCK)
                        WHERE MaPX=@MaPX AND MaNV=@MaNV`);
        } catch (columnError) {
            if (!/Invalid column name|MaKK|MaDT|KhongTruTon/i.test(columnError.message || '')) throw columnError;
            current = await new sql.Request(transaction)
                .input('MaPX', sql.VarChar, req.params.id)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .query(`SELECT MaKho,TrangThai FROM PhieuXuat WITH(UPDLOCK,HOLDLOCK)
                        WHERE MaPX=@MaPX AND MaNV=@MaNV`);
        }
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu xuất kho.');
        const row = current.recordset[0];
        if (row.TrangThai !== 'Nháp') throw new Error('Chỉ được sửa Phiếu xuất đang ở trạng thái Nháp.');
        if ((row.MaKK || row.MaDT) && header.LoaiXuat !== 'Hủy hàng') {
            throw new Error('Phiếu xuất liên kết kiểm kê/đổi trả phải giữ loại Hủy hàng.');
        }
        if (row.MaKK || row.MaDT) {
            const source = row.MaKK
                ? await loadCountScrapSource(transaction, { maKK: row.MaKK, maNV: req.user.MaNV, lock: true })
                : await loadReturnDiscardSource(transaction, { maDT: row.MaDT, maNV: req.user.MaNV, lock: true });
            assertLinesMatchSource(lines, source.prefill.lines, row.MaKK ? `kiểm kê ${row.MaKK}` : `đổi trả ${row.MaDT}`);
            header.MaKK = row.MaKK || null;
            header.MaDT = row.MaDT || null;
            header.KhongTruTon = Boolean(row.KhongTruTon) || Boolean(row.MaDT);
        }
        header.MaKho = row.MaKho;
        const validation = await validateIssue(transaction, header, lines);
        await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, req.params.id)
            .input('LoaiXuat', sql.NVarChar, header.LoaiXuat)
            .input('MaNCC', sql.VarChar, validation.supplier?.MaNCC || null)
            .input('MaPN', sql.VarChar, header.MaPN)
            .input('GhiChu', sql.NVarChar, header.GhiChu)
            .query(`UPDATE PhieuXuat SET LoaiXuat=@LoaiXuat,MaNCC=@MaNCC,MaPN=@MaPN,GhiChu=@GhiChu,
                           LyDoTuChoi=NULL WHERE MaPX=@MaPX`);
        await replaceLines(transaction, req.params.id, lines, validation.productMap);
        await writeAudit(transaction, req.user, 'Cập nhật Phiếu xuất kho', req.params.id, `${header.LoaiXuat}; vẫn ở trạng thái Nháp`);
        await transaction.commit();
        res.json({ message: 'Đã lưu thay đổi Phiếu xuất kho.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể cập nhật Phiếu xuất kho.' });
    }
};

const submitIssue = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT * FROM PhieuXuat WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaPX=@MaPX AND MaNV=@MaNV`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu xuất kho.');
        const header = current.recordset[0];
        if (header.TrangThai !== 'Nháp') throw new Error('Chỉ được gửi duyệt Phiếu xuất đang ở trạng thái Nháp.');
        if (!clean(header.GhiChu, 500)) throw new Error('Vui lòng ghi rõ lý do xuất kho trước khi gửi duyệt.');
        const result = await new sql.Request(transaction).input('MaPX', sql.VarChar, req.params.id)
            .query('SELECT MaSP,SoLuong,GhiChu FROM ChiTietPhieuXuat WHERE MaPX=@MaPX');
        const lines = normalizeLines(result.recordset);
        await validateIssue(transaction, header, lines);
        await new sql.Request(transaction).input('MaPX', sql.VarChar, req.params.id)
            .query(`UPDATE PhieuXuat SET TrangThai=N'Chờ duyệt',MaNV_Duyet=NULL,NgayDuyet=NULL,LyDoTuChoi=NULL
                    WHERE MaPX=@MaPX`);
        await writeAudit(transaction, req.user, 'Gửi duyệt Phiếu xuất kho', req.params.id, `${header.LoaiXuat}; tồn kho chưa thay đổi`);
        await transaction.commit();
        res.json({ message: 'Đã gửi Phiếu xuất cho Quản lý phê duyệt.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể gửi duyệt Phiếu xuất kho.' });
    }
};

const decideIssue = approved => async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const reason = clean(req.body.LyDo, 300);
        if (!approved && !reason) throw new Error('Vui lòng nhập lý do từ chối Phiếu xuất.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, req.params.id)
            .query(`SELECT * FROM PhieuXuat WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaPX=@MaPX AND TrangThai=N'Chờ duyệt'`);
        if (!current.recordset.length) throw new Error('Phiếu xuất không còn ở trạng thái Chờ duyệt.');
        const header = current.recordset[0];
        const details = await new sql.Request(transaction).input('MaPX', sql.VarChar, req.params.id)
            .query('SELECT MaSP,SoLuong,GhiChu FROM ChiTietPhieuXuat WHERE MaPX=@MaPX');
        if (approved) await validateIssue(transaction, header, normalizeLines(details.recordset));
        await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TrangThai', sql.NVarChar, approved ? 'Đã duyệt' : 'Từ chối')
            .input('LyDo', sql.NVarChar, approved ? null : reason)
            .query(`UPDATE PhieuXuat SET TrangThai=@TrangThai,MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=@LyDo
                    WHERE MaPX=@MaPX`);
        const infoOnly = Boolean(header.KhongTruTon) || Boolean(header.MaDT);
        await writeAudit(transaction, req.user, approved ? 'Phê duyệt Phiếu xuất kho' : 'Từ chối Phiếu xuất kho',
            req.params.id, approved
                ? (infoOnly ? 'Cho phép Thủ kho xác nhận phiếu thông tin; tồn kho không đổi' : 'Cho phép Thủ kho thực hiện xuất; tồn kho chưa thay đổi')
                : reason);
        await transaction.commit();
        res.json({
            message: approved
                ? (infoOnly
                    ? 'Đã phê duyệt Phiếu xuất thông tin. Thủ kho xác nhận để khóa hồ sơ; tồn kho không đổi.'
                    : 'Đã phê duyệt Phiếu xuất. Tồn kho chưa thay đổi cho tới khi Thủ kho xác nhận xuất.')
                : 'Đã từ chối Phiếu xuất; tồn kho được giữ nguyên.'
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể xử lý quyết định Phiếu xuất.' });
    }
};

const confirmIssue = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT * FROM PhieuXuat WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaPX=@MaPX AND MaNV=@MaNV`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu xuất kho.');
        const header = current.recordset[0];
        if (header.TrangThai !== 'Đã duyệt') throw new Error('Chỉ được xác nhận xuất đối với Phiếu xuất đã được Quản lý duyệt.');
        const details = await new sql.Request(transaction).input('MaPX', sql.VarChar, req.params.id)
            .query('SELECT MaSP,SoLuong,GhiChu FROM ChiTietPhieuXuat WHERE MaPX=@MaPX');
        const lines = normalizeLines(details.recordset);
        await validateIssue(transaction, header, lines);

        const skipAllStock = Boolean(header.KhongTruTon) || Boolean(header.MaDT);
        let decreased = 0;
        let documented = 0;
        for (const line of lines) {
            const stockResult = await new sql.Request(transaction)
                .input('MaKho', sql.VarChar, header.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .query(`SELECT SLTon,DonGiaBinhQuan FROM TonKho WITH(UPDLOCK,HOLDLOCK)
                        WHERE MaKho=@MaKho AND MaSP=@MaSP`);
            const available = Number(stockResult.recordset[0]?.SLTon || 0);
            const cost = Number(stockResult.recordset[0]?.DonGiaBinhQuan || line.DonGia || 0);
            const documentary = skipAllStock || (header.MaKK && available < line.SoLuong);
            if (!documentary && available < line.SoLuong) {
                throw new Error(`Tồn kho sản phẩm ${line.MaSP} chỉ còn ${available}, không đủ xác nhận xuất ${line.SoLuong}.`);
            }
            await new sql.Request(transaction)
                .input('MaPX', sql.VarChar, req.params.id)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('DonGia', sql.Decimal(18, 2), cost)
                .query('UPDATE ChiTietPhieuXuat SET DonGia=@DonGia WHERE MaPX=@MaPX AND MaSP=@MaSP');
            if (!documentary) {
                await new sql.Request(transaction)
                    .input('MaKho', sql.VarChar, header.MaKho)
                    .input('MaSP', sql.VarChar, line.MaSP)
                    .input('SoLuong', sql.Int, line.SoLuong)
                    .query(`UPDATE TonKho SET SLTon=SLTon-@SoLuong,
                                GiaTriTon=(SLTon-@SoLuong)*DonGiaBinhQuan,NgayCapNhat=GETDATE()
                            WHERE MaKho=@MaKho AND MaSP=@MaSP AND SLTon>=@SoLuong`);
                decreased += 1;
            } else {
                documented += 1;
            }
            const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', datePrefix('GD'), 4);
            await new sql.Request(transaction)
                .input('MaGD', sql.VarChar, maGD)
                .input('MaKho', sql.VarChar, header.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .input('SoLuong', sql.Int, documentary ? 0 : -line.SoLuong)
                .input('DonGiaVon', sql.Decimal(18, 2), cost)
                .input('ThanhTienVon', sql.Decimal(18, 2), documentary ? 0 : cost * line.SoLuong)
                .input('MaPX', sql.VarChar, req.params.id)
                .input('LoaiGD', sql.NVarChar, documentary ? 'Điều chỉnh' : 'Xuất')
                .input('GhiChu', sql.NVarChar, documentary
                    ? `Xuất hủy thông tin — không trừ tồn${line.GhiChu ? `; ${line.GhiChu}` : ''}`
                    : `${header.LoaiXuat}${line.GhiChu ? `; ${line.GhiChu}` : ''}`)
                .query(`INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                        VALUES(@MaGD,@MaKho,@MaSP,@MaNV,@LoaiGD,@SoLuong,@DonGiaVon,@ThanhTienVon,N'PhieuXuat',@MaPX,GETDATE(),@GhiChu)`);
        }
        await new sql.Request(transaction).input('MaPX', sql.VarChar, req.params.id)
            .query(`UPDATE PhieuXuat SET TrangThai=N'Đã xác nhận' WHERE MaPX=@MaPX`);
        const auditParts = [
            header.LoaiXuat,
            decreased ? `đã giảm tồn ${decreased} mặt hàng` : '',
            documented ? `ghi nhận ${documented} mặt hàng không trừ tồn` : ''
        ].filter(Boolean).join('; ');
        await writeAudit(transaction, req.user, 'Xác nhận xuất kho', req.params.id, auditParts);
        await transaction.commit();
        const message = decreased
            ? `Đã xác nhận xuất. Giảm tồn ${decreased} mặt hàng.${documented ? ` ${documented} mã ghi nhận thông tin, không trừ trùng.` : ''}`
            : `Đã xác nhận phiếu xuất thông tin ${req.params.id}. Tồn kho không đổi (đã trừ lúc bán hoặc đã điều chỉnh kiểm kê).`;
        res.json({ message });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể xác nhận xuất kho.' });
    }
};

module.exports = {
    listIssues,
    getWarehouseIssueDetail: (req, res) => getIssueDetail(req, res, true),
    getApprovalIssueDetail: (req, res) => getIssueDetail(req, res, false),
    getOptions,
    getSourceReceipt,
    getPendingSources,
    previewFromCount,
    previewFromReturn,
    createIssue,
    createIssueFromReturn,
    createIssueFromCount,
    updateIssue,
    submitIssue,
    approveIssue: decideIssue(true),
    rejectIssue: decideIssue(false),
    confirmIssue
};
