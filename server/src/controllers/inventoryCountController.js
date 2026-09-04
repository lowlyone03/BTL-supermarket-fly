const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { scrapLinesFromRows } = require('../services/countScrap');

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const conditionValues = new Set(['Bình thường', 'Hỏng', 'Hết hạn']);

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
    logAudit(transaction, { user, action, table: 'KiemKe', recordId, content, uc: 'UC20', severity: 'Quan trọng' });

const getWarehouse = async request => {
    const result = await request.query(`SELECT TOP 1 MaKho,TenKho,DiaChi
                                        FROM Kho WHERE TrangThai=1 ORDER BY MaKho`);
    if (!result.recordset.length) throw new Error('Chưa cấu hình kho đang hoạt động.');
    return result.recordset[0];
};

const normalizeLines = (lines, requireReason = false) => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('Đợt kiểm kê phải có ít nhất một mặt hàng.');
    const seen = new Set();
    return lines.map((line, index) => {
        const MaSP = clean(line.MaSP, 20);
        const SLThucTe = Number(line.SLThucTe);
        const NguyenNhan = clean(line.NguyenNhan, 200) || null;
        const TinhTrangHang = clean(line.TinhTrangHang, 30) || 'Bình thường';
        if (!MaSP) throw new Error(`Dòng ${index + 1} chưa có mã sản phẩm.`);
        if (seen.has(MaSP)) throw new Error(`Sản phẩm ${MaSP} bị lặp trong đợt kiểm kê.`);
        if (!Number.isInteger(SLThucTe) || SLThucTe < 0) throw new Error(`Số lượng thực tế của ${MaSP} phải là số nguyên không âm.`);
        if (!conditionValues.has(TinhTrangHang)) throw new Error(`Tình trạng hàng của ${MaSP} không hợp lệ.`);
        const SLHeThong = Number(line.SLHeThong);
        if (requireReason && Number.isInteger(SLHeThong) && SLThucTe !== SLHeThong && !NguyenNhan) {
            throw new Error(`Sản phẩm ${MaSP} có chênh lệch nhưng chưa ghi nguyên nhân.`);
        }
        seen.add(MaSP);
        return { MaSP, SLThucTe, NguyenNhan, TinhTrangHang };
    });
};

const listCounts = async (req, res) => {
    try {
        const pool = await poolPromise;
        const status = clean(req.query.status, 30);
        const keyword = clean(req.query.search, 100);
        const result = await pool.request()
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TrangThai', sql.NVarChar, status)
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .query(`SELECT kk.MaKK,kk.MaKho,k.TenKho,kk.NgayKiemKe,kk.TrangThai,
                           kk.GhiChu,kk.LyDoTuChoi,kk.NgayDuyet,nvd.TenNV NguoiDuyet,
                           COUNT(ct.MaSP) SoMatHang,
                           SUM(CASE WHEN ct.ChenhLech<>0 THEN 1 ELSE 0 END) SoMatHangChenhLech,
                           SUM(CASE WHEN ct.ChenhLech>0 THEN ct.ChenhLech ELSE 0 END) TongThua,
                           SUM(CASE WHEN ct.ChenhLech<0 THEN -ct.ChenhLech ELSE 0 END) TongThieu
                    FROM KiemKe kk JOIN Kho k ON k.MaKho=kk.MaKho
                    LEFT JOIN ChiTietKiemKe ct ON ct.MaKK=kk.MaKK
                    LEFT JOIN NhanVien nvd ON nvd.MaNV=kk.MaNV_Duyet
                    WHERE kk.MaNV=@MaNV
                      AND (@TrangThai=N'' OR kk.TrangThai=@TrangThai)
                      AND (@TuKhoa=N'' OR kk.MaKK LIKE @Mau COLLATE Latin1_General_100_CI_AI OR k.TenKho LIKE @Mau COLLATE Latin1_General_100_CI_AI OR kk.GhiChu LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                    GROUP BY kk.MaKK,kk.MaKho,k.TenKho,kk.NgayKiemKe,kk.TrangThai,
                             kk.GhiChu,kk.LyDoTuChoi,kk.NgayDuyet,nvd.TenNV
                    ORDER BY kk.NgayKiemKe DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách kiểm kê.' });
    }
};

const getCountDetail = ownerOnly => async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request()
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('KiemTraChuSoHuu', sql.Bit, ownerOnly ? 1 : 0)
            .query(`SELECT kk.*,k.TenKho,k.DiaChi,nv.TenNV NguoiKiemKe,nvd.TenNV NguoiDuyet
                    FROM KiemKe kk JOIN Kho k ON k.MaKho=kk.MaKho
                    JOIN NhanVien nv ON nv.MaNV=kk.MaNV
                    LEFT JOIN NhanVien nvd ON nvd.MaNV=kk.MaNV_Duyet
                    WHERE kk.MaKK=@MaKK AND (@KiemTraChuSoHuu=0 OR kk.MaNV=@MaNV)`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy đợt kiểm kê.' });
        const lines = await pool.request()
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaKho', sql.VarChar, header.recordset[0].MaKho)
            .query(`SELECT ct.*,sp.TenSP,sp.MaVach,sp.DonViTinh,sp.TonKhoToiThieu,dm.TenDM,
                           ISNULL(tk.SLTon,0) SLTonHienTai, ISNULL(tk.SLDatMua,0) SLDatMua
                    FROM ChiTietKiemKe ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
                    JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                    LEFT JOIN TonKho tk ON tk.MaKho=@MaKho AND tk.MaSP=ct.MaSP
                    WHERE ct.MaKK=@MaKK ORDER BY dm.TenDM,sp.TenSP`);
        const audit = await pool.request().input('MaBanGhi', sql.VarChar, req.params.id).query(`
            SELECT nk.ThoiGian, nk.HanhDong, nk.NoiDung, n.TenNV
            FROM NhatKy nk
            LEFT JOIN TaiKhoan t ON t.MaTK=nk.MaTK
            LEFT JOIN NhanVien n ON n.MaNV=t.MaNV
            WHERE nk.BangLienQuan=N'KiemKe' AND nk.MaBanGhi=@MaBanGhi
            ORDER BY nk.ThoiGian`);
        res.json({ count: header.recordset[0], lines: lines.recordset, audit: audit.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết kiểm kê.' });
    }
};

const createCount = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const warehouse = await getWarehouse(new sql.Request(transaction));
        const MaKK = await generateId(transaction, 'KiemKe', 'MaKK', datePrefix('KK'));
        const scoped = Object.prototype.hasOwnProperty.call(req.body || {}, 'products');
        const productIds = scoped
            ? [...new Set((Array.isArray(req.body.products) ? req.body.products : [])
                .map(id => clean(id, 20)).filter(Boolean))]
            : [];
        if (scoped && !productIds.length) throw new Error('Hãy chọn ít nhất một mặt hàng để kiểm tra số lượng thực tế.');
        const note = clean(req.body.GhiChu, 500)
            || (scoped ? 'Kiểm tra số lượng thực tế trước khi lập đề nghị mua hàng.' : null);
        await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, MaKK)
            .input('MaKho', sql.VarChar, warehouse.MaKho)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('GhiChu', sql.NVarChar, note)
            .query(`INSERT KiemKe(MaKK,MaKho,MaNV,NgayKiemKe,TrangThai,GhiChu)
                    VALUES(@MaKK,@MaKho,@MaNV,GETDATE(),N'Đang kiểm',@GhiChu)`);
        if (scoped) {
            for (const MaSP of productIds) {
                const inserted = await new sql.Request(transaction)
                    .input('MaKK', sql.VarChar, MaKK)
                    .input('MaKho', sql.VarChar, warehouse.MaKho)
                    .input('MaSP', sql.VarChar, MaSP)
                    .query(`INSERT ChiTietKiemKe(MaKK,MaSP,SLHeThong,SLThucTe,ChenhLech,NguyenNhan,KetQuaDoiChieu,TinhTrangHang)
                            SELECT @MaKK,sp.MaSP,ISNULL(tk.SLTon,0),ISNULL(tk.SLTon,0),0,NULL,N'Khớp',N'Bình thường'
                            FROM SanPham sp
                            LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP AND tk.MaKho=@MaKho
                            WHERE sp.MaSP=@MaSP AND sp.TrangThai=N'Đang bán';
                            SELECT @@ROWCOUNT affected;`);
                if (!Number(inserted.recordset[0]?.affected) && !Number(inserted.rowsAffected?.[0])) {
                    const exists = await new sql.Request(transaction)
                        .input('MaKK', sql.VarChar, MaKK)
                        .input('MaSP', sql.VarChar, MaSP)
                        .query('SELECT 1 ok FROM ChiTietKiemKe WHERE MaKK=@MaKK AND MaSP=@MaSP');
                    if (!exists.recordset.length) throw new Error(`Sản phẩm ${MaSP} không tồn tại hoặc đã ngừng bán.`);
                }
            }
        } else {
            await new sql.Request(transaction)
                .input('MaKK', sql.VarChar, MaKK)
                .input('MaKho', sql.VarChar, warehouse.MaKho)
                .query(`INSERT ChiTietKiemKe(MaKK,MaSP,SLHeThong,SLThucTe,ChenhLech,NguyenNhan,KetQuaDoiChieu,TinhTrangHang)
                        SELECT @MaKK,tk.MaSP,tk.SLTon,tk.SLTon,0,NULL,N'Khớp',N'Bình thường'
                        FROM TonKho tk JOIN SanPham sp ON sp.MaSP=tk.MaSP
                        WHERE tk.MaKho=@MaKho AND sp.TrangThai=N'Đang bán'`);
        }
        const lineCount = await new sql.Request(transaction).input('MaKK', sql.VarChar, MaKK)
            .query('SELECT COUNT(*) SoDong FROM ChiTietKiemKe WHERE MaKK=@MaKK');
        if (!Number(lineCount.recordset[0].SoDong)) throw new Error('Kho chưa có sản phẩm để kiểm kê.');
        await writeAudit(transaction, req.user, 'Tạo đợt kiểm kê', MaKK,
            scoped
                ? `Kiểm tra số lượng thực tế ${lineCount.recordset[0].SoDong} mặt hàng trước khi lập đề nghị`
                : `Chụp số tồn hệ thống của ${lineCount.recordset[0].SoDong} mặt hàng`);
        await transaction.commit();
        res.status(201).json({
            message: scoped
                ? 'Đã lập đợt kiểm kê để kiểm tra số lượng thực tế và phẩm chất hàng.'
                : 'Đã tạo đợt kiểm kê và lấy số tồn hệ thống.',
            MaKK,
            scoped: Boolean(scoped)
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể tạo đợt kiểm kê.' });
    }
};

const saveCount = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const lines = normalizeLines(req.body.lines);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT TrangThai FROM KiemKe WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaKK=@MaKK AND MaNV=@MaNV`);
        if (!current.recordset.length) throw new Error('Không tìm thấy đợt kiểm kê.');
        if (current.recordset[0].TrangThai !== 'Đang kiểm') throw new Error('Chỉ được cập nhật đợt đang kiểm.');
        const expected = await new sql.Request(transaction).input('MaKK', sql.VarChar, req.params.id)
            .query('SELECT COUNT(*) SoDong FROM ChiTietKiemKe WHERE MaKK=@MaKK');
        if (Number(expected.recordset[0].SoDong) !== lines.length) throw new Error('Phải ghi nhận đủ toàn bộ mặt hàng trong đợt kiểm kê.');
        for (const line of lines) {
            const result = await new sql.Request(transaction)
                .input('MaKK', sql.VarChar, req.params.id)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('SLThucTe', sql.Int, line.SLThucTe)
                .input('NguyenNhan', sql.NVarChar, line.NguyenNhan)
                .input('TinhTrangHang', sql.NVarChar, line.TinhTrangHang)
                .query(`UPDATE ChiTietKiemKe
                        SET SLThucTe=@SLThucTe,ChenhLech=@SLThucTe-SLHeThong,
                            KetQuaDoiChieu=CASE WHEN @SLThucTe>SLHeThong THEN N'Thừa'
                                              WHEN @SLThucTe<SLHeThong THEN N'Thiếu' ELSE N'Khớp' END,
                            NguyenNhan=@NguyenNhan,TinhTrangHang=@TinhTrangHang
                        WHERE MaKK=@MaKK AND MaSP=@MaSP;
                        SELECT @@ROWCOUNT affected;`);
            if (!Number(result.recordset[0].affected)) throw new Error(`Sản phẩm ${line.MaSP} không thuộc đợt kiểm kê.`);
        }
        await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('GhiChu', sql.NVarChar, clean(req.body.GhiChu, 500) || null)
            .query('UPDATE KiemKe SET GhiChu=@GhiChu WHERE MaKK=@MaKK');
        await writeAudit(transaction, req.user, 'Cập nhật kiểm kê', req.params.id, `Ghi nhận số đếm thực tế của ${lines.length} mặt hàng`);
        await transaction.commit();
        res.json({ message: 'Đã lưu kết quả kiểm đếm.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lưu kết quả kiểm kê.' });
    }
};

const submitCount = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT TrangThai FROM KiemKe WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaKK=@MaKK AND MaNV=@MaNV`);
        if (!current.recordset.length) throw new Error('Không tìm thấy đợt kiểm kê.');
        if (current.recordset[0].TrangThai !== 'Đang kiểm') throw new Error('Chỉ được hoàn tất đợt đang kiểm.');
        const summary = await new sql.Request(transaction).input('MaKK', sql.VarChar, req.params.id).query(`
            UPDATE ChiTietKiemKe
            SET ChenhLech=SLThucTe-SLHeThong,
                KetQuaDoiChieu=CASE WHEN SLThucTe>SLHeThong THEN N'Thừa'
                                    WHEN SLThucTe<SLHeThong THEN N'Thiếu' ELSE N'Khớp' END
            WHERE MaKK=@MaKK;
            SELECT COUNT(*) SoDong,
                   SUM(CASE WHEN ChenhLech<>0 THEN 1 ELSE 0 END) SoChenhLech,
                   SUM(CASE WHEN ChenhLech<>0 AND NULLIF(LTRIM(RTRIM(NguyenNhan)),N'') IS NULL THEN 1 ELSE 0 END) ThieuNguyenNhan
            FROM ChiTietKiemKe WHERE MaKK=@MaKK;`);
        const info = summary.recordset[0];
        if (!Number(info.SoDong)) throw new Error('Đợt kiểm kê chưa có chi tiết.');
        if (Number(info.ThieuNguyenNhan)) throw new Error('Mọi mặt hàng chênh lệch phải ghi nguyên nhân trước khi gửi duyệt.');
        const hasDifference = Number(info.SoChenhLech) > 0;
        const nextStatus = hasDifference ? 'Chờ duyệt điều chỉnh' : 'Hoàn thành không chênh lệch';
        await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('TrangThai', sql.NVarChar, nextStatus)
            .query('UPDATE KiemKe SET TrangThai=@TrangThai WHERE MaKK=@MaKK');
        const scrapRows = await new sql.Request(transaction).input('MaKK', sql.VarChar, req.params.id).query(`
            SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SLThucTe, ct.TinhTrangHang, ct.NguyenNhan
            FROM ChiTietKiemKe ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaKK=@MaKK AND ct.TinhTrangHang IN (N'Hỏng', N'Hết hạn') AND ct.SLThucTe>0
            ORDER BY sp.TenSP`);
        const scrapLines = scrapLinesFromRows(scrapRows.recordset);
        let existingScrap = null;
        try {
            const linked = await new sql.Request(transaction).input('MaKK', sql.VarChar, req.params.id).query(`
                SELECT TOP 1 MaPX, TrangThai FROM PhieuXuat
                WHERE MaKK=@MaKK AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận')
                ORDER BY NgayXuat DESC`);
            existingScrap = linked.recordset[0] || null;
        } catch (error) {
            if (!/Invalid column name|MaKK/i.test(error.message || '')) throw error;
        }
        await writeAudit(transaction, req.user, hasDifference ? 'Gửi duyệt điều chỉnh tồn' : 'Hoàn thành kiểm kê', req.params.id,
            hasDifference ? `${info.SoChenhLech} mặt hàng chênh lệch, chờ Quản lý duyệt` : 'Không phát sinh chênh lệch, không cập nhật tồn');
        await transaction.commit();
        res.json({
            message: hasDifference ? 'Đã chuyển đợt kiểm kê sang Chờ duyệt điều chỉnh.' : 'Đã hoàn thành kiểm kê, không phát sinh chênh lệch.',
            TrangThai: nextStatus,
            scrapLines,
            existingScrap
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể hoàn tất đợt kiểm kê.' });
    }
};

const approveCount = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const header = await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .query(`SELECT * FROM KiemKe WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaKK=@MaKK AND TrangThai=N'Chờ duyệt điều chỉnh'`);
        if (!header.recordset.length) throw new Error('Đợt kiểm kê không còn ở trạng thái chờ duyệt điều chỉnh.');
        const count = header.recordset[0];
        const details = await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaKho', sql.VarChar, count.MaKho)
            .query(`SELECT ct.*,tk.SLTon SLTonHienTai,tk.DonGiaBinhQuan
                    FROM ChiTietKiemKe ct
                    JOIN TonKho tk WITH(UPDLOCK,HOLDLOCK) ON tk.MaKho=@MaKho AND tk.MaSP=ct.MaSP
                    WHERE ct.MaKK=@MaKK ORDER BY ct.MaSP`);
        if (!details.recordset.length) throw new Error('Đợt kiểm kê chưa có chi tiết.');
        const changedStock = details.recordset.find(line => Number(line.SLTonHienTai) !== Number(line.SLHeThong));
        if (changedStock) throw new Error(`Tồn của ${changedStock.MaSP} đã thay đổi sau lúc kiểm đếm. Không thể duyệt trên số liệu cũ.`);
        const adjusted = details.recordset.filter(line => Number(line.ChenhLech) !== 0);
        if (!adjusted.length) throw new Error('Đợt kiểm kê không có chênh lệch để điều chỉnh.');
        // Hàng hỏng/hết hạn: chỉ đưa tồn về SLThucTe (chênh lệch số lượng). Xuất hủy trừ SLThucTe lúc xác nhận phiếu xuất — không trừ thêm ở đây.
        for (const line of adjusted) {
            const delta = Number(line.ChenhLech);
            const cost = Number(line.DonGiaBinhQuan || 0);
            await new sql.Request(transaction)
                .input('MaKho', sql.VarChar, count.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('SLThucTe', sql.Int, Number(line.SLThucTe))
                .query(`UPDATE TonKho SET SLTon=@SLThucTe,
                            GiaTriTon=@SLThucTe*DonGiaBinhQuan,NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP`);
            const MaGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', datePrefix('GD'), 4);
            await new sql.Request(transaction)
                .input('MaGD', sql.VarChar, MaGD)
                .input('MaKho', sql.VarChar, count.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .input('SoLuong', sql.Int, delta)
                .input('DonGiaVon', sql.Decimal(18, 2), cost)
                .input('ThanhTienVon', sql.Decimal(18, 2), Math.abs(delta) * cost)
                .input('MaKK', sql.VarChar, req.params.id)
                .input('GhiChu', sql.NVarChar, `Điều chỉnh ${line.KetQuaDoiChieu.toLowerCase()} sau kiểm kê; ${line.NguyenNhan || 'không ghi nguyên nhân'}`)
                .query(`INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                        VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Điều chỉnh',@SoLuong,@DonGiaVon,@ThanhTienVon,N'Kiểm kê',@MaKK,GETDATE(),@GhiChu)`);
        }
        await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE KiemKe SET TrangThai=N'Đã duyệt',MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=NULL
                    WHERE MaKK=@MaKK`);
        await writeAudit(transaction, req.user, 'Phê duyệt điều chỉnh tồn', req.params.id, `Đã cập nhật tồn và tạo ${adjusted.length} giao dịch kho Điều chỉnh`);
        await transaction.commit();
        res.json({ message: `Đã duyệt và điều chỉnh tồn cho ${adjusted.length} mặt hàng.` });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể duyệt điều chỉnh tồn.' });
    }
};

const rejectCount = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const reason = clean(req.body.LyDo, 500);
        if (!reason) throw new Error('Vui lòng nhập lý do từ chối.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const result = await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, reason)
            .query(`UPDATE KiemKe SET TrangThai=N'Từ chối',MaNV_Duyet=@MaNV,
                        NgayDuyet=GETDATE(),LyDoTuChoi=@LyDo
                    WHERE MaKK=@MaKK AND TrangThai=N'Chờ duyệt điều chỉnh';
                    SELECT @@ROWCOUNT affected;`);
        if (!Number(result.recordset[0].affected)) throw new Error('Đợt kiểm kê không còn ở trạng thái chờ duyệt điều chỉnh.');
        await writeAudit(transaction, req.user, 'Từ chối điều chỉnh tồn', req.params.id, reason);
        await transaction.commit();
        res.json({ message: 'Đã từ chối điều chỉnh; tồn kho được giữ nguyên.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể từ chối điều chỉnh tồn.' });
    }
};

module.exports = {
    listCounts,
    getWarehouseCountDetail: getCountDetail(true),
    getApprovalCountDetail: getCountDetail(false),
    createCount,
    saveCount,
    submitCount,
    approveCount,
    rejectCount
};
