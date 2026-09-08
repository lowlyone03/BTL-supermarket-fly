const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { scrapLinesFromRows, countStockImpact } = require('../services/countScrap');
const { ensureCountScrapSchema } = require('../services/countScrapSchema');
const {
    qty,
    scrapConfirmed,
    expectedAfterScrap,
    loadChangeContext,
    staleApproveMessage,
    alreadyReducedMessage,
    buildStockWarnings,
    suggestedRejectReason
} = require('../services/countApprove');
const { ensureStoreProfitLossSchema } = require('../services/storeProfitLoss');
const { notifyInboxChanged } = require('../services/notificationHub');
const { ensureCountSuccessorSchema } = require('../services/countSuccessorSchema');
const {
    decorateCount,
    isPreRequestNote,
    syncRejectedCountSuccessors,
    linkOpenRejections,
    markRejectedRecounted
} = require('../services/countLifecycle');

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
        const SLHong = Number(line.SLHong);
        return {
            MaSP,
            SLThucTe,
            NguyenNhan,
            TinhTrangHang,
            SLHong: Number.isInteger(SLHong) && SLHong >= 0 ? SLHong : null
        };
    });
};

const listCounts = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureCountSuccessorSchema(pool);
        try { await syncRejectedCountSuccessors(pool); } catch (error) { console.error(error); }
        const status = clean(req.query.status, 30);
        const keyword = clean(req.query.search, 100);
        const result = await pool.request()
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TrangThai', sql.NVarChar, status)
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .query(`SELECT kk.MaKK,kk.MaKho,k.TenKho,kk.NgayKiemKe,kk.TrangThai,
                           kk.GhiChu,kk.LyDoTuChoi,kk.NgayDuyet,nvd.TenNV NguoiDuyet,
                           kk.MaKKGoc,kk.MaKKThayThe,thay.TrangThai TrangThaiThayThe,
                           COUNT(ct.MaSP) SoMatHang,
                           SUM(CASE WHEN ct.ChenhLech<>0 THEN 1 ELSE 0 END) SoMatHangChenhLech,
                           SUM(CASE WHEN ct.ChenhLech>0 THEN ct.ChenhLech ELSE 0 END) TongThua,
                           SUM(CASE WHEN ct.ChenhLech<0 THEN -ct.ChenhLech ELSE 0 END) TongThieu
                    FROM KiemKe kk JOIN Kho k ON k.MaKho=kk.MaKho
                    LEFT JOIN ChiTietKiemKe ct ON ct.MaKK=kk.MaKK
                    LEFT JOIN NhanVien nvd ON nvd.MaNV=kk.MaNV_Duyet
                    LEFT JOIN KiemKe thay ON thay.MaKK=kk.MaKKThayThe
                    WHERE kk.MaNV=@MaNV
                      AND (@TrangThai=N'' OR kk.TrangThai=@TrangThai)
                      AND (@TuKhoa=N'' OR kk.MaKK LIKE @Mau COLLATE Latin1_General_100_CI_AI OR k.TenKho LIKE @Mau COLLATE Latin1_General_100_CI_AI OR kk.GhiChu LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                    GROUP BY kk.MaKK,kk.MaKho,k.TenKho,kk.NgayKiemKe,kk.TrangThai,
                             kk.GhiChu,kk.LyDoTuChoi,kk.NgayDuyet,nvd.TenNV,
                             kk.MaKKGoc,kk.MaKKThayThe,thay.TrangThai
                    ORDER BY CASE kk.TrangThai
                                WHEN N'Đang kiểm' THEN 0
                                WHEN N'Từ chối' THEN 1
                                WHEN N'Chờ duyệt điều chỉnh' THEN 2
                                ELSE 3
                             END, kk.NgayKiemKe DESC`);
        res.json({ items: result.recordset.map(decorateCount) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách kiểm kê.' });
    }
};

const getCountDetail = ownerOnly => async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureCountSuccessorSchema(pool);
        try { await syncRejectedCountSuccessors(pool); } catch (error) { console.error(error); }
        const header = await pool.request()
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('KiemTraChuSoHuu', sql.Bit, ownerOnly ? 1 : 0)
            .query(`SELECT kk.*,k.TenKho,k.DiaChi,nv.TenNV NguoiKiemKe,nvd.TenNV NguoiDuyet,
                           thay.TrangThai TrangThaiThayThe
                    FROM KiemKe kk JOIN Kho k ON k.MaKho=kk.MaKho
                    JOIN NhanVien nv ON nv.MaNV=kk.MaNV
                    LEFT JOIN NhanVien nvd ON nvd.MaNV=kk.MaNV_Duyet
                    LEFT JOIN KiemKe thay ON thay.MaKK=kk.MaKKThayThe
                    WHERE kk.MaKK=@MaKK AND (@KiemTraChuSoHuu=0 OR kk.MaNV=@MaNV)`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy đợt kiểm kê.' });
        const lines = await pool.request()
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaKho', sql.VarChar, header.recordset[0].MaKho)
            .query(`SELECT ct.*,sp.TenSP,sp.MaVach,sp.DonViTinh,sp.TonKhoToiThieu,dm.TenDM,
                           ISNULL(tk.SLTon,0) SLTonHienTai, ISNULL(tk.SLDatMua,0) SLDatMua,
                           ISNULL(tk.DonGiaBinhQuan,0) DonGiaBinhQuan
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
        const count = decorateCount(header.recordset[0]);
        let stockWarnings = [];
        try {
            const discrepancyIds = lines.recordset.filter(line => qty(line.ChenhLech) !== 0).map(line => line.MaSP);
            const changeContext = await loadChangeContext(sql, pool, {
                MaKho: count.MaKho,
                MaKK: req.params.id,
                MaSPList: discrepancyIds,
                since: count.NgayKiemKe
            });
            stockWarnings = buildStockWarnings(lines.recordset, changeContext);
        } catch (error) {
            console.error(error);
        }
        const scrapLines = scrapLinesFromRows(lines.recordset);
        let existingScrap = null;
        try {
            await ensureCountScrapSchema(pool);
            const linked = await pool.request().input('MaKK', sql.VarChar, req.params.id).query(`
                SELECT TOP 1 MaPX, TrangThai, KhongTruTon FROM PhieuXuat
                WHERE MaKK=@MaKK AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận')
                ORDER BY NgayXuat DESC`);
            existingScrap = linked.recordset[0] || null;
        } catch (error) {
            if (!/Invalid column name|MaKK|KhongTruTon/i.test(error.message || '')) throw error;
        }
        res.json({
            count,
            lines: lines.recordset,
            audit: audit.recordset,
            stockWarnings,
            suggestedRejectReason: suggestedRejectReason(stockWarnings),
            scrapLines,
            existingScrap,
            stockImpact: countStockImpact(scrapLines)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết kiểm kê.' });
    }
};

const createCount = async (req, res) => {
    const pool = await poolPromise;
    await ensureCountSuccessorSchema(pool);
    const maKKGoc = clean(req.body?.MaKKGoc, 20) || null;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const warehouse = await getWarehouse(new sql.Request(transaction));
        const scoped = Object.prototype.hasOwnProperty.call(req.body || {}, 'products');
        const productIds = scoped
            ? [...new Set((Array.isArray(req.body.products) ? req.body.products : [])
                .map(id => clean(id, 20)).filter(Boolean))]
            : [];
        if (scoped && !productIds.length) throw new Error('Hãy chọn ít nhất một mặt hàng để kiểm tra số lượng thực tế.');
        if (maKKGoc) {
            const origin = await new sql.Request(transaction)
                .input('MaKK', sql.VarChar, maKKGoc)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .query(`SELECT MaKK, MaKho, TrangThai, MaKKThayThe FROM KiemKe WITH(UPDLOCK,HOLDLOCK)
                        WHERE MaKK=@MaKK AND MaNV=@MaNV`);
            const source = origin.recordset[0];
            if (!source) throw new Error('Không tìm thấy đợt kiểm kê cần đếm lại.');
            if (source.MaKho !== warehouse.MaKho) throw new Error('Đợt kiểm kê không thuộc kho đang làm việc.');
            if (source.TrangThai === 'Đã đếm lại') throw new Error('Đợt này đã được đếm lại. Mở đợt thay thế để xem kết quả.');
            if (source.TrangThai !== 'Từ chối') throw new Error('Chỉ đếm lại đợt bị từ chối.');
            const existing = await new sql.Request(transaction)
                .input('MaKKGoc', sql.VarChar, maKKGoc)
                .input('MaKKThayThe', sql.VarChar, source.MaKKThayThe || '')
                .query(`SELECT TOP 1 MaKK FROM KiemKe WITH(UPDLOCK,HOLDLOCK)
                        WHERE TrangThai=N'Đang kiểm'
                          AND (MaKKGoc=@MaKKGoc OR (@MaKKThayThe<>'' AND MaKK=@MaKKThayThe))
                        ORDER BY NgayKiemKe DESC`);
            if (existing.recordset[0]) {
                await transaction.commit();
                return res.json({
                    message: 'Đã có đợt đang đếm lại, mở tiếp để hoàn thành.',
                    MaKK: existing.recordset[0].MaKK,
                    reused: true
                });
            }
        }
        const MaKK = await generateId(transaction, 'KiemKe', 'MaKK', datePrefix('KK'));
        const note = clean(req.body.GhiChu, 500)
            || (scoped ? 'Kiểm tra số lượng thực tế trước khi lập đề nghị mua hàng.' : null);
        await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, MaKK)
            .input('MaKho', sql.VarChar, warehouse.MaKho)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('GhiChu', sql.NVarChar, note)
            .input('MaKKGoc', sql.VarChar, maKKGoc)
            .query(`INSERT KiemKe(MaKK,MaKho,MaNV,NgayKiemKe,TrangThai,GhiChu,MaKKGoc)
                    VALUES(@MaKK,@MaKho,@MaNV,GETDATE(),N'Đang kiểm',@GhiChu,@MaKKGoc)`);
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
                : maKKGoc
                    ? `Đếm lại sau từ chối ${maKKGoc}; chụp ${lineCount.recordset[0].SoDong} mặt hàng`
                    : `Chụp số tồn hệ thống của ${lineCount.recordset[0].SoDong} mặt hàng`);
        if (!scoped) {
            await linkOpenRejections(transaction, { MaKho: warehouse.MaKho, MaKK, MaKKGoc: maKKGoc });
            if (maKKGoc) {
                await writeAudit(transaction, req.user, 'Tạo đợt đếm lại', maKKGoc, `Thay bằng ${MaKK}`);
            }
        }
        await transaction.commit();
        if (!scoped) notifyInboxChanged({ action: 'Tạo đợt kiểm kê', table: 'KiemKe', recordId: MaKK });
        res.status(201).json({
            message: scoped
                ? 'Đã lập đợt kiểm kê để kiểm tra số lượng thực tế và phẩm chất hàng.'
                : maKKGoc
                    ? 'Đã tạo đợt kiểm kê mới để đếm lại trên số tồn hiện tại.'
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
    const pool = await poolPromise;
    await ensureCountScrapSchema(pool);
    const transaction = new sql.Transaction(pool);
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
            const bind = (includeScrap) => {
                const request = new sql.Request(transaction)
                    .input('MaKK', sql.VarChar, req.params.id)
                    .input('MaSP', sql.VarChar, line.MaSP)
                    .input('SLThucTe', sql.Int, line.SLThucTe)
                    .input('NguyenNhan', sql.NVarChar, line.NguyenNhan)
                    .input('TinhTrangHang', sql.NVarChar, line.TinhTrangHang);
                if (includeScrap) request.input('SLHong', sql.Int, line.SLHong);
                return request.query(`UPDATE ChiTietKiemKe
                        SET SLThucTe=@SLThucTe,ChenhLech=@SLThucTe-SLHeThong,
                            KetQuaDoiChieu=CASE WHEN @SLThucTe>SLHeThong THEN N'Thừa'
                                              WHEN @SLThucTe<SLHeThong THEN N'Thiếu' ELSE N'Khớp' END,
                            NguyenNhan=@NguyenNhan,TinhTrangHang=@TinhTrangHang
                            ${includeScrap ? ',SLHong=@SLHong' : ''}
                        WHERE MaKK=@MaKK AND MaSP=@MaSP;
                        SELECT @@ROWCOUNT affected;`);
            };
            let result;
            try {
                result = await bind(true);
            } catch (error) {
                if (!/Invalid column name|SLHong/i.test(error.message || '')) throw error;
                result = await bind(false);
            }
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
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        await ensureCountScrapSchema(pool);
        await ensureCountSuccessorSchema(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT TrangThai, MaKho, MaKKGoc, GhiChu FROM KiemKe WITH(UPDLOCK,HOLDLOCK)
                    WHERE MaKK=@MaKK AND MaNV=@MaNV`);
        if (!current.recordset.length) throw new Error('Không tìm thấy đợt kiểm kê.');
        const header = current.recordset[0];
        if (header.TrangThai !== 'Đang kiểm') throw new Error('Chỉ được hoàn tất đợt đang kiểm.');
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
            SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SLHeThong, ct.SLThucTe, ct.TinhTrangHang, ct.NguyenNhan,
                   ISNULL(tk.SLTon,0) SLTonHienTai, ISNULL(tk.DonGiaBinhQuan,0) DonGiaBinhQuan
            FROM ChiTietKiemKe ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            LEFT JOIN TonKho tk ON tk.MaKho=(SELECT MaKho FROM KiemKe WHERE MaKK=@MaKK) AND tk.MaSP=ct.MaSP
            WHERE ct.MaKK=@MaKK AND ct.TinhTrangHang IN (N'Hỏng', N'Hết hạn')
              AND (ct.SLThucTe < ct.SLHeThong OR ct.SLThucTe>0)
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
        const closed = await markRejectedRecounted(transaction, {
            MaKK: req.params.id,
            MaKho: header.MaKho,
            MaKKGoc: header.MaKKGoc,
            heuristic: !isPreRequestNote(header.GhiChu) || Boolean(header.MaKKGoc)
        });
        for (const oldId of closed) {
            await writeAudit(transaction, req.user, 'Đã đếm lại sau từ chối', oldId, `Thay bằng ${req.params.id}`);
        }
        await transaction.commit();
        notifyInboxChanged({
            action: hasDifference ? 'Gửi duyệt điều chỉnh tồn' : 'Hoàn thành kiểm kê',
            table: 'KiemKe',
            recordId: req.params.id
        });
        res.json({
            message: hasDifference ? 'Đã chuyển đợt kiểm kê sang Chờ duyệt điều chỉnh.' : 'Đã hoàn thành kiểm kê, không phát sinh chênh lệch.',
            TrangThai: nextStatus,
            scrapLines,
            existingScrap,
            stockImpact: countStockImpact(scrapLines)
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể hoàn tất đợt kiểm kê.' });
    }
};

const approveCount = async (req, res) => {
    const pool = await poolPromise;
    await ensureCountSuccessorSchema(pool);
    const transaction = new sql.Transaction(pool);
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
            .query(`SELECT ct.*, ISNULL(tk.SLTon,0) SLTonHienTai, ISNULL(tk.DonGiaBinhQuan,0) DonGiaBinhQuan
                    FROM ChiTietKiemKe ct
                    LEFT JOIN TonKho tk WITH(UPDLOCK,HOLDLOCK) ON tk.MaKho=@MaKho AND tk.MaSP=ct.MaSP
                    WHERE ct.MaKK=@MaKK ORDER BY ct.MaSP`);
        if (!details.recordset.length) throw new Error('Đợt kiểm kê chưa có chi tiết.');
        const adjusted = details.recordset.filter(line => qty(line.ChenhLech) !== 0);
        if (!adjusted.length) throw new Error('Đợt kiểm kê không có chênh lệch để điều chỉnh.');
        const changeContext = await loadChangeContext(sql, transaction, {
            MaKho: count.MaKho,
            MaKK: req.params.id,
            MaSPList: adjusted.map(line => line.MaSP),
            since: count.NgayKiemKe
        });
        const written = [];
        const skipped = [];
        // Chỉ khóa dòng chênh lệch. Dòng khớp (như BK001 = 0/0) có thể đã bán/nhập sau lúc đếm — không chặn duyệt.
        // Hàng hỏng/hết hạn: điều chỉnh về SLThucTe. Xuất hủy trừ SLThucTe lúc xác nhận phiếu xuất — không trừ trùng.
        for (const line of adjusted) {
            const current = qty(line.SLTonHienTai);
            const snapshot = qty(line.SLHeThong);
            const target = qty(line.SLThucTe);
            const scrap = changeContext.scraps.get(line.MaSP) || null;
            const finalTarget = expectedAfterScrap(line, scrap);
            const cost = Number(line.DonGiaBinhQuan || 0);
            const alreadyAtTarget = current === finalTarget || current === target;
            const scrapThenGap = scrapConfirmed(scrap) && current === snapshot - qty(scrap.SoLuong);
            let nextStock = target;
            let delta = qty(line.ChenhLech);
            if (current !== snapshot && !alreadyAtTarget && !scrapThenGap) {
                throw new Error(staleApproveMessage(line, current, changeContext));
            }
            if (alreadyAtTarget) {
                skipped.push(alreadyReducedMessage(line, current, changeContext));
                continue;
            }
            if (scrapThenGap) {
                nextStock = finalTarget;
                delta = finalTarget - current;
                if (!delta) {
                    skipped.push(alreadyReducedMessage(line, current, changeContext));
                    continue;
                }
            }
            const stockUpdate = await new sql.Request(transaction)
                .input('MaKho', sql.VarChar, count.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP)
                .input('SLMoi', sql.Int, nextStock)
                .query(`UPDATE TonKho SET SLTon=@SLMoi,
                            GiaTriTon=@SLMoi*DonGiaBinhQuan,NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP;
                        SELECT @@ROWCOUNT affected;`);
            if (!Number(stockUpdate.recordset[0]?.affected)) {
                await new sql.Request(transaction)
                    .input('MaKho', sql.VarChar, count.MaKho)
                    .input('MaSP', sql.VarChar, line.MaSP)
                    .input('SLMoi', sql.Int, nextStock)
                    .input('DonGia', sql.Decimal(18, 2), cost)
                    .query(`INSERT INTO TonKho (MaKho,MaSP,SLTon,SLDatMua,DonGiaBinhQuan,GiaTriTon,NgayCapNhat)
                            VALUES(@MaKho,@MaSP,@SLMoi,0,@DonGia,@SLMoi*@DonGia,GETDATE())`);
            }
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
                .input('GhiChu', sql.NVarChar, `Điều chỉnh ${String(line.KetQuaDoiChieu || '').toLowerCase()} sau kiểm kê; ${line.NguyenNhan || 'không ghi nguyên nhân'}`)
                .query(`INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                        VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Điều chỉnh',@SoLuong,@DonGiaVon,@ThanhTienVon,N'Kiểm kê',@MaKK,GETDATE(),@GhiChu)`);
            written.push(line.MaSP);
        }
        await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE KiemKe SET TrangThai=N'Đã duyệt',MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=NULL
                    WHERE MaKK=@MaKK`);
        const auditNote = [
            written.length ? `Điều chỉnh ${written.length} mặt hàng (${written.join(', ')})` : 'Không ghi thêm điều chỉnh tồn',
            skipped.length ? skipped.join('; ') : ''
        ].filter(Boolean).join('. ');
        await writeAudit(transaction, req.user, 'Phê duyệt điều chỉnh tồn', req.params.id, auditNote);
        const closed = await markRejectedRecounted(transaction, {
            MaKK: req.params.id,
            MaKho: count.MaKho,
            MaKKGoc: count.MaKKGoc,
            heuristic: !isPreRequestNote(count.GhiChu) || Boolean(count.MaKKGoc)
        });
        for (const oldId of closed) {
            await writeAudit(transaction, req.user, 'Đã đếm lại sau từ chối', oldId, `Thay bằng ${req.params.id}`);
        }
        await transaction.commit();
        const message = written.length
            ? `Đã duyệt và điều chỉnh tồn cho ${written.length} mặt hàng.${skipped.length ? ` ${skipped.join('. ')}.` : ''}`
            : `Đã duyệt đợt kiểm kê. ${skipped.join('. ')}.`;
        res.json({ message });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể duyệt điều chỉnh tồn.' });
    }
};

const notifyWarehouseRecount = async (db, { user, MaKK, MaNVKho, reason }) => {
    await ensureStoreProfitLossSchema(db);
    const sender = await new sql.Request(db)
        .input('MaNV', sql.VarChar, user.MaNV)
        .query('SELECT TenNV FROM NhanVien WHERE MaNV=@MaNV');
    const recipients = await new sql.Request(db)
        .input('MaNVKho', sql.VarChar, MaNVKho)
        .query(`
            SELECT DISTINCT nv.MaNV, nv.TenNV
            FROM NhanVien nv
            WHERE ISNULL(nv.TrangThai, N'Đang làm việc') = N'Đang làm việc'
              AND (
                    nv.MaNV=@MaNVKho
                 OR nv.ChucVu=N'Thủ kho'
                 OR EXISTS (
                        SELECT 1 FROM TaiKhoan tk
                        JOIN VaiTro vt ON vt.MaVaiTro=tk.MaVaiTro
                        WHERE tk.MaNV=nv.MaNV AND vt.TenVaiTro=N'Thủ kho' AND tk.TrangThai=1
                    )
              )`);
    const title = `Kiểm kê ${MaKK} bị từ chối — đếm lại vì nhập hàng`;
    const detail = String(reason || 'Tồn đã đổi sau lúc đếm (thường do nhập hàng). Hãy tạo đợt kiểm kê mới.').slice(0, 1000);
    const tenGui = user.TenNV || sender.recordset[0]?.TenNV || 'Quản lý';
    for (const person of recipients.recordset) {
        await new sql.Request(db)
            .input('MaNVNhan', sql.VarChar, person.MaNV)
            .input('TieuDe', sql.NVarChar, title)
            .input('NoiDung', sql.NVarChar, detail)
            .input('MaNVGui', sql.VarChar, user.MaNV)
            .input('TenGui', sql.NVarChar, tenGui)
            .input('DichDen', sql.NVarChar, 'warehouse-inventory-counts')
            .query(`
                INSERT ThongBaoCuaHang (MaNV_Nhan, TieuDe, NoiDung, MaNV_Gui, TenNV_Gui, DichDen, MucDo)
                VALUES (@MaNVNhan, @TieuDe, @NoiDung, @MaNVGui, @TenGui, @DichDen, N'Cảnh báo')`);
    }
    return recipients.recordset.length;
};

const rejectCount = async (req, res) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        const reason = clean(req.body.LyDo, 500);
        if (!reason) throw new Error('Vui lòng nhập lý do từ chối.');
        await ensureStoreProfitLossSchema(pool).catch(() => {});
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const result = await new sql.Request(transaction)
            .input('MaKK', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, reason)
            .query(`UPDATE KiemKe SET TrangThai=N'Từ chối',MaNV_Duyet=@MaNV,
                        NgayDuyet=GETDATE(),LyDoTuChoi=@LyDo
                    OUTPUT inserted.MaKK, inserted.MaNV
                    WHERE MaKK=@MaKK AND TrangThai=N'Chờ duyệt điều chỉnh'`);
        const updated = result.recordset[0];
        if (!updated) throw new Error('Đợt kiểm kê không còn ở trạng thái chờ duyệt điều chỉnh.');
        await writeAudit(transaction, req.user, 'Từ chối điều chỉnh tồn', req.params.id, reason);
        await transaction.commit();
        let notified = 0;
        try {
            notified = await notifyWarehouseRecount(pool, {
                user: req.user, MaKK: updated.MaKK, MaNVKho: updated.MaNV, reason
            });
        } catch (error) {
            console.error(error);
        }
        notifyInboxChanged({ action: 'Từ chối điều chỉnh tồn', table: 'KiemKe', recordId: updated.MaKK });
        res.json({
            message: notified
                ? `Đã từ chối điều chỉnh; tồn giữ nguyên. Đã báo ${notified} Thủ kho đếm lại.`
                : 'Đã từ chối điều chỉnh; tồn kho được giữ nguyên. Thủ kho hãy tạo đợt kiểm kê mới.'
        });
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
