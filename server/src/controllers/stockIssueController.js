const { sql, poolPromise } = require('../config/db');
const { isRestockAccepted } = require('../services/financialRules');
const { logAudit } = require('../services/auditLog');

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const issueTypes = new Set(['Trả NCC', 'Hủy hàng', 'Sử dụng nội bộ']);
const returnIssueMarker = maDT => `Nguồn đổi trả ${maDT}.`;

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
        return { MaSP, SoLuong, GhiChu: clean(line.GhiChu, 200) || null };
    });
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
        const cost = Number(productMap.get(line.MaSP)?.DonGiaBinhQuan || 0);
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
        const result = await pool.request()
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('TrangThai', sql.NVarChar, status)
            .query(`SELECT px.MaPX,px.LoaiXuat,px.MaPN,px.NgayXuat,px.TrangThai,px.GhiChu,px.LyDoTuChoi,
                           k.TenKho,ncc.TenNCC,COUNT(ct.MaSP) SoMatHang,SUM(ct.SoLuong) TongSoLuong,
                           SUM(ct.SoLuong*ct.DonGia) TongGiaTriThamChieu
                    FROM PhieuXuat px JOIN Kho k ON k.MaKho=px.MaKho
                    LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=px.MaNCC
                    LEFT JOIN ChiTietPhieuXuat ct ON ct.MaPX=px.MaPX
                    WHERE px.MaNV=@MaNV AND (@TrangThai=N'' OR px.TrangThai=@TrangThai)
                      AND (@TuKhoa=N'' OR px.MaPX LIKE @Mau COLLATE Latin1_General_100_CI_AI OR px.LoaiXuat LIKE @Mau COLLATE Latin1_General_100_CI_AI
                           OR px.MaPN LIKE @Mau COLLATE Latin1_General_100_CI_AI OR px.GhiChu LIKE @Mau COLLATE Latin1_General_100_CI_AI OR ncc.TenNCC LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                    GROUP BY px.MaPX,px.LoaiXuat,px.MaPN,px.NgayXuat,px.TrangThai,px.GhiChu,
                             px.LyDoTuChoi,k.TenKho,ncc.TenNCC
                    ORDER BY px.NgayXuat DESC`);
        res.json({ items: result.recordset });
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
        const maDT = relatedMatch ? relatedMatch[1] : null;
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
        res.json({
            issue: {
                ...issue,
                MaDT: relatedTicket?.MaDT || maDT,
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

const createIssue = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const header = normalizeHeader(req.body);
        const lines = normalizeLines(req.body.lines);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const warehouse = await getWarehouse(new sql.Request(transaction));
        header.MaKho = warehouse.MaKho;
        const validation = await validateIssue(transaction, header, lines);
        const maPX = await generateId(transaction, 'PhieuXuat', 'MaPX', datePrefix('PX'));
        await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, maPX)
            .input('MaKho', sql.VarChar, warehouse.MaKho)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LoaiXuat', sql.NVarChar, header.LoaiXuat)
            .input('MaNCC', sql.VarChar, validation.supplier?.MaNCC || null)
            .input('MaPN', sql.VarChar, header.MaPN)
            .input('GhiChu', sql.NVarChar, header.GhiChu)
            .query(`INSERT PhieuXuat(MaPX,MaKho,MaNV,LoaiXuat,MaNCC,MaPN,NgayXuat,TrangThai,GhiChu)
                    VALUES(@MaPX,@MaKho,@MaNV,@LoaiXuat,@MaNCC,@MaPN,GETDATE(),N'Nháp',@GhiChu)`);
        await replaceLines(transaction, maPX, lines, validation.productMap);
        await writeAudit(transaction, req.user, 'Lập Phiếu xuất kho', maPX, `${header.LoaiXuat}; lưu Nháp; tồn kho chưa thay đổi`);
        await transaction.commit();
        res.status(201).json({ message: `Đã lưu Phiếu xuất ${maPX} ở trạng thái Nháp.`, MaPX: maPX });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập Phiếu xuất kho.' });
    }
};

const createIssueFromReturn = async (req, res) => {
    const maDT = clean(req.params.id, 20);
    const transaction = new sql.Transaction(await poolPromise);
    try {
        if (!maDT) throw new Error('Thiếu mã phiếu đổi trả.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const ticketResult = await new sql.Request(transaction)
            .input('MaDT', sql.VarChar, maDT)
            .query(`SELECT MaDT, MaNV_KiemTra, TrangThai, KetQuaKiemTra, LyDo
                    FROM PhieuDoiTra WITH (UPDLOCK, HOLDLOCK)
                    WHERE MaDT=@MaDT`);
        if (!ticketResult.recordset.length) throw new Error('Không tìm thấy phiếu đổi trả.');
        const ticket = ticketResult.recordset[0];
        if (ticket.MaNV_KiemTra !== req.user.MaNV) {
            throw new Error('Chỉ thủ kho đã kiểm phiếu này mới lập phiếu xuất hỏng từ lịch sử kho.');
        }
        if (ticket.TrangThai !== 'Hoàn thành') {
            throw new Error('Chỉ lập phiếu xuất hỏng sau khi phiếu đổi trả đã hoàn thành và hàng đã nhập lại kho.');
        }
        if (!isRestockAccepted(ticket.KetQuaKiemTra)) {
            throw new Error('Phiếu này không nhập lại kho nên không cần xuất hủy. Hàng đã loại bỏ lúc kiểm.');
        }
        const reversed = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT TOP 1 MaGD FROM GiaoDichKho
            WHERE LoaiChungTu=N'DoiTra' AND MaChungTu=@MaDT AND LoaiGD=N'Xuất' AND GhiChu LIKE N'%tích nhầm%'`);
        if (reversed.recordset.length) {
            throw new Error('Đã trừ tồn khi xác nhận tích nhầm. Không lập thêm phiếu xuất hủy.');
        }

        const marker = returnIssueMarker(maDT);
        const existing = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('Mau', sql.NVarChar, `%${marker}%`)
            .query(`SELECT TOP 1 MaPX, TrangThai FROM PhieuXuat WITH (UPDLOCK, HOLDLOCK)
                    WHERE MaNV=@MaNV AND GhiChu LIKE @Mau
                      AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận')
                    ORDER BY CASE TrangThai
                        WHEN N'Nháp' THEN 1 WHEN N'Chờ duyệt' THEN 2 WHEN N'Đã duyệt' THEN 3 ELSE 4 END,
                        NgayXuat DESC`);
        if (existing.recordset.length) {
            const row = existing.recordset[0];
            await transaction.commit();
            const confirmed = row.TrangThai === 'Đã xác nhận';
            return res.json({
                MaPX: row.MaPX,
                existed: true,
                confirmed,
                message: confirmed
                    ? `Đã có phiếu xuất ${row.MaPX} xác nhận trừ tồn cho ${maDT}.`
                    : `Đã có phiếu xuất ${row.MaPX} (${row.TrangThai}) từ ${maDT}. Mở để tiếp tục gửi duyệt/xác nhận.`
            });
        }

        const lineRows = await new sql.Request(transaction)
            .input('MaDT', sql.VarChar, maDT)
            .query(`SELECT MaSP, SoLuong, LyDo FROM ChiTietDoiTra
                    WHERE MaDT=@MaDT AND LoaiDong=N'Hàng khách trả' AND SoLuong>0`);
        if (!lineRows.recordset.length) throw new Error('Phiếu đổi trả không có hàng khách trả để xuất hủy.');

        const warehouse = await getWarehouse(new sql.Request(transaction));
        const header = {
            LoaiXuat: 'Hủy hàng',
            MaPN: null,
            GhiChu: clean(`${marker} Tích nhầm nhập lại kho bán — xuất hủy hàng hỏng/hết hạn. Lý do thu ngân: ${ticket.LyDo || 'không ghi'}.`, 500)
        };
        const lines = normalizeLines(lineRows.recordset.map(line => ({
            MaSP: line.MaSP,
            SoLuong: line.SoLuong,
            GhiChu: `Từ ${maDT}${line.LyDo ? `: ${line.LyDo}` : ''}`
        })));
        const validation = await validateIssue(transaction, header, lines);
        const maPX = await generateId(transaction, 'PhieuXuat', 'MaPX', datePrefix('PX'));
        await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, maPX)
            .input('MaKho', sql.VarChar, warehouse.MaKho)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LoaiXuat', sql.NVarChar, header.LoaiXuat)
            .input('GhiChu', sql.NVarChar, header.GhiChu)
            .query(`INSERT PhieuXuat(MaPX,MaKho,MaNV,LoaiXuat,MaNCC,MaPN,NgayXuat,TrangThai,GhiChu)
                    VALUES(@MaPX,@MaKho,@MaNV,@LoaiXuat,NULL,NULL,GETDATE(),N'Nháp',@GhiChu)`);
        await replaceLines(transaction, maPX, lines, validation.productMap);
        await writeAudit(transaction, req.user, 'Lập Phiếu xuất kho', maPX,
            `Hủy hàng từ đổi trả ${maDT}; lưu Nháp; tồn kho chưa thay đổi`);
        await transaction.commit();
        res.status(201).json({
            MaPX: maPX,
            existed: false,
            message: `Đã lập phiếu xuất hủy ${maPX} (Nháp) từ ${maDT}. Gửi duyệt rồi Thủ kho xác nhận xuất mới trừ tồn.`
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập phiếu xuất hỏng từ đổi trả.' });
    }
};

const updateIssue = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const header = normalizeHeader(req.body);
        const lines = normalizeLines(req.body.lines);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction)
            .input('MaPX', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaKho,TrangThai FROM PhieuXuat WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaPX=@MaPX AND MaNV=@MaNV`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu xuất kho.');
        if (current.recordset[0].TrangThai !== 'Nháp') throw new Error('Chỉ được sửa Phiếu xuất đang ở trạng thái Nháp.');
        header.MaKho = current.recordset[0].MaKho;
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
        await writeAudit(transaction, req.user, approved ? 'Phê duyệt Phiếu xuất kho' : 'Từ chối Phiếu xuất kho',
            req.params.id, approved ? 'Cho phép Thủ kho thực hiện xuất; tồn kho chưa thay đổi' : reason);
        await transaction.commit();
        res.json({ message: approved ? 'Đã phê duyệt Phiếu xuất. Tồn kho chưa thay đổi cho tới khi Thủ kho xác nhận xuất.' : 'Đã từ chối Phiếu xuất; tồn kho được giữ nguyên.' });
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

        for (const line of lines) {
            const stockResult = await new sql.Request(transaction)
                .input('MaKho', sql.VarChar, header.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .query(`SELECT SLTon,DonGiaBinhQuan FROM TonKho WITH(UPDLOCK,HOLDLOCK)
                        WHERE MaKho=@MaKho AND MaSP=@MaSP`);
            if (!stockResult.recordset.length || Number(stockResult.recordset[0].SLTon) < line.SoLuong) {
                const available = Number(stockResult.recordset[0]?.SLTon || 0);
                throw new Error(`Tồn kho sản phẩm ${line.MaSP} chỉ còn ${available}, không đủ xác nhận xuất ${line.SoLuong}.`);
            }
            const cost = Number(stockResult.recordset[0].DonGiaBinhQuan || 0);
            await new sql.Request(transaction)
                .input('MaKho', sql.VarChar, header.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('SoLuong', sql.Int, line.SoLuong)
                .query(`UPDATE TonKho SET SLTon=SLTon-@SoLuong,
                            GiaTriTon=(SLTon-@SoLuong)*DonGiaBinhQuan,NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP AND SLTon>=@SoLuong`);
            await new sql.Request(transaction)
                .input('MaPX', sql.VarChar, req.params.id)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('DonGia', sql.Decimal(18, 2), cost)
                .query('UPDATE ChiTietPhieuXuat SET DonGia=@DonGia WHERE MaPX=@MaPX AND MaSP=@MaSP');
            const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', datePrefix('GD'), 4);
            await new sql.Request(transaction)
                .input('MaGD', sql.VarChar, maGD)
                .input('MaKho', sql.VarChar, header.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .input('SoLuong', sql.Int, -line.SoLuong)
                .input('DonGiaVon', sql.Decimal(18, 2), cost)
                .input('ThanhTienVon', sql.Decimal(18, 2), cost * line.SoLuong)
                .input('MaPX', sql.VarChar, req.params.id)
                .input('GhiChu', sql.NVarChar, `${header.LoaiXuat}${line.GhiChu ? `; ${line.GhiChu}` : ''}`)
                .query(`INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                        VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Xuất',@SoLuong,@DonGiaVon,@ThanhTienVon,N'PhieuXuat',@MaPX,GETDATE(),@GhiChu)`);
        }
        await new sql.Request(transaction).input('MaPX', sql.VarChar, req.params.id)
            .query(`UPDATE PhieuXuat SET TrangThai=N'Đã xác nhận' WHERE MaPX=@MaPX`);
        await writeAudit(transaction, req.user, 'Xác nhận xuất kho', req.params.id,
            `${header.LoaiXuat}; đã giảm tồn ${lines.length} mặt hàng và ghi Giao dịch kho loại Xuất`);
        await transaction.commit();
        res.json({ message: `Đã xác nhận xuất ${lines.length} mặt hàng. Tồn kho và thẻ kho đã được cập nhật.` });
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
    createIssue,
    createIssueFromReturn,
    updateIssue,
    submitIssue,
    approveIssue: decideIssue(true),
    rejectIssue: decideIssue(false),
    confirmIssue
};
