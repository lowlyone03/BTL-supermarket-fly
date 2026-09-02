const { sql, poolPromise } = require('../config/db');
const { isRestockAccepted, looksUnsellable } = require('../services/financialRules');
const { logAudit } = require('../services/auditLog');

const editableStatuses = new Set(['Nháp', 'Yêu cầu bổ sung']);

const normalizeLines = lines => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('Đề nghị phải có ít nhất một mặt hàng.');
    const seen = new Set();
    return lines.map((line, index) => {
        const MaSP = String(line.MaSP || '').trim();
        const SLDeNghi = Number(line.SLDeNghi);
        if (!MaSP) throw new Error(`Dòng ${index + 1} chưa có mã sản phẩm.`);
        if (seen.has(MaSP)) throw new Error(`Sản phẩm ${MaSP} bị lặp trong đề nghị.`);
        if (!Number.isInteger(SLDeNghi) || SLDeNghi <= 0) throw new Error(`Số lượng đề nghị của ${MaSP} phải là số nguyên dương.`);
        seen.add(MaSP);
        return { MaSP, SLDeNghi, GhiChu: String(line.GhiChu || '').trim().slice(0, 200) || null };
    });
};

const writeAudit = (request, user, action, recordId, content) =>
    logAudit(request, { user, action, table: 'DeNghiMuaHang', recordId, content, uc: 'UC16' });

const getWarehouse = async pool => {
    const result = await pool.request().query(`SELECT TOP 1 MaKho, TenKho, DiaChi
                                                FROM Kho WHERE TrangThai = 1 ORDER BY MaKho`);
    if (!result.recordset.length) throw new Error('Chưa cấu hình kho đang hoạt động.');
    return result.recordset[0];
};

const inventoryQuery = `
    SELECT sp.MaSP, sp.TenSP, sp.MaVach, sp.DonViTinh, sp.DuongDanAnh, dm.TenDM,
           sp.TonKhoToiThieu, ISNULL(tk.SLTon, 0) AS SLTon,
           ISNULL(tk.SLDatMua, 0) AS SLDatMua, tk.NgayCapNhat,
           CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM GiaoDichKho gd
               WHERE gd.MaKho = @MaKho AND gd.MaSP = sp.MaSP AND gd.LoaiGD = N'Nhập'
             ) THEN N'Chưa nhập lần đầu'
             WHEN ISNULL(tk.SLTon, 0) <= 0 THEN N'Hết hàng'
             WHEN ISNULL(tk.SLTon, 0) <= sp.TonKhoToiThieu THEN N'Cần bổ sung'
             WHEN ISNULL(tk.SLTon, 0) <= CEILING(sp.TonKhoToiThieu * 1.5) THEN N'Sắp chạm định mức'
             ELSE N'Đủ hàng'
           END AS MucTon,
           CASE WHEN ISNULL(tk.SLTon, 0) < sp.TonKhoToiThieu
                THEN sp.TonKhoToiThieu - ISNULL(tk.SLTon, 0) ELSE 0 END AS ThieuSoVoiDinhMuc
    FROM SanPham sp
    JOIN DanhMuc dm ON dm.MaDM = sp.MaDM
    LEFT JOIN TonKho tk ON tk.MaSP = sp.MaSP AND tk.MaKho = @MaKho
    WHERE sp.TrangThai = N'Đang bán'
      AND (@TuKhoa = N'' OR sp.MaSP LIKE @Mau COLLATE Latin1_General_100_CI_AI OR sp.TenSP LIKE @Mau COLLATE Latin1_General_100_CI_AI OR sp.MaVach LIKE @Mau COLLATE Latin1_General_100_CI_AI)
      AND (@CanBoSung = 0 OR ISNULL(tk.SLTon, 0) <= sp.TonKhoToiThieu)
    ORDER BY CASE WHEN ISNULL(tk.SLTon, 0) <= sp.TonKhoToiThieu THEN 0 ELSE 1 END,
             ThieuSoVoiDinhMuc DESC, sp.TenSP`;

const getInventory = async (req, res) => {
    try {
        const pool = await poolPromise;
        const warehouse = await getWarehouse(pool);
        const keyword = String(req.query.search || '').trim();
        const lowOnly = String(req.query.lowOnly || '') === 'true';
        const result = await pool.request()
            .input('MaKho', sql.VarChar, warehouse.MaKho)
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('CanBoSung', sql.Bit, lowOnly ? 1 : 0)
            .query(inventoryQuery);
        res.json({ warehouse, items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không thể tải dữ liệu tồn kho.' });
    }
};

const getDashboard = async (req, res) => {
    try {
        const pool = await poolPromise;
        const warehouse = await getWarehouse(pool);
        const [summary, lowStock, requests, logs] = await Promise.all([
            pool.request().input('MaKho', sql.VarChar, warehouse.MaKho).query(`
                SELECT COUNT(sp.MaSP) AS TongMatHang,
                       SUM(CASE WHEN ISNULL(tk.SLTon,0) <= sp.TonKhoToiThieu THEN 1 ELSE 0 END) AS CanBoSung,
                       SUM(CASE WHEN ISNULL(tk.SLTon,0)=0 AND ISNULL(gd.DaNhap,0)=1 THEN 1 ELSE 0 END) AS HetHang,
                       SUM(CASE WHEN ISNULL(gd.DaNhap,0)=0 THEN 1 ELSE 0 END) AS ChuaNhapLanDau,
                       SUM(ISNULL(tk.SLDatMua,0)) AS DangDatMua
                FROM SanPham sp
                LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP AND tk.MaKho=@MaKho
                LEFT JOIN (
                    SELECT MaKho, MaSP, CAST(1 AS tinyint) AS DaNhap
                    FROM GiaoDichKho WHERE LoaiGD=N'Nhập'
                    GROUP BY MaKho, MaSP
                ) gd ON gd.MaKho=@MaKho AND gd.MaSP=sp.MaSP
                WHERE sp.TrangThai=N'Đang bán'`),
            pool.request().input('MaKho', sql.VarChar, warehouse.MaKho).query(`
                SELECT TOP 6 sp.MaSP, sp.TenSP, sp.DonViTinh, sp.DuongDanAnh, sp.TonKhoToiThieu,
                       ISNULL(tk.SLTon,0) SLTon, ISNULL(tk.SLDatMua,0) SLDatMua,
                       CASE WHEN NOT EXISTS (
                           SELECT 1 FROM GiaoDichKho gd
                           WHERE gd.MaKho=@MaKho AND gd.MaSP=sp.MaSP AND gd.LoaiGD=N'Nhập'
                       ) THEN N'Chưa nhập lần đầu'
                       WHEN ISNULL(tk.SLTon,0)=0 THEN N'Hết hàng'
                       ELSE N'Cần bổ sung' END AS MucTon
                FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP AND tk.MaKho=@MaKho
                WHERE sp.TrangThai=N'Đang bán' AND ISNULL(tk.SLTon,0) <= sp.TonKhoToiThieu
                ORDER BY (sp.TonKhoToiThieu-ISNULL(tk.SLTon,0)) DESC, sp.TenSP`),
            pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT TOP 5 dn.MaDN, dn.NgayLap, dn.NgayGui, dn.TrangThai, dn.LyDo,
                       COUNT(ct.MaSP) AS SoMatHang, SUM(ct.SLDeNghi) AS TongSoLuong
                FROM DeNghiMuaHang dn JOIN ChiTietDeNghi ct ON ct.MaDN=dn.MaDN
                WHERE dn.MaNV_Lap=@MaNV
                GROUP BY dn.MaDN,dn.NgayLap,dn.NgayGui,dn.TrangThai,dn.LyDo
                ORDER BY dn.NgayLap DESC`),
            pool.request().input('MaTK', sql.Int, req.user.MaTK).query(`
                SELECT TOP 5 HanhDong, NoiDung, ThoiGian FROM NhatKy
                WHERE MaTK=@MaTK AND BangLienQuan=N'DeNghiMuaHang'
                ORDER BY ThoiGian DESC`)
        ]);
        res.json({ warehouse, summary: summary.recordset[0], lowStock: lowStock.recordset, recentRequests: requests.recordset, recentActivity: logs.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không thể tải tổng quan kho.' });
    }
};

const requestListQuery = `
    SELECT dn.MaDN, dn.MaNV_Lap, nv.TenNV AS NguoiLap, dn.NgayLap, dn.NgayGui,
           dn.LyDo, dn.TrangThai, dn.GhiChu, dn.MaNV_TiepNhan,
           COUNT(ct.MaSP) AS SoMatHang, SUM(ct.SLDeNghi) AS TongSoLuong
    FROM DeNghiMuaHang dn
    JOIN NhanVien nv ON nv.MaNV=dn.MaNV_Lap
    JOIN ChiTietDeNghi ct ON ct.MaDN=dn.MaDN
    WHERE (@ChiCuaToi=0 OR dn.MaNV_Lap=@MaNV)
      AND (@AnNhap=0 OR dn.TrangThai<>N'Nháp')
      AND (@TrangThai=N'' OR dn.TrangThai=@TrangThai)
      AND (@TuKhoa=N'' OR dn.MaDN LIKE @Mau COLLATE Latin1_General_100_CI_AI OR nv.TenNV LIKE @Mau COLLATE Latin1_General_100_CI_AI OR dn.LyDo LIKE @Mau COLLATE Latin1_General_100_CI_AI)
    GROUP BY dn.MaDN,dn.MaNV_Lap,nv.TenNV,dn.NgayLap,dn.NgayGui,dn.LyDo,dn.TrangThai,dn.GhiChu,dn.MaNV_TiepNhan
    ORDER BY dn.NgayLap DESC`;

const listRequests = (purchasing = false) => async (req, res) => {
    try {
        const pool = await poolPromise;
        const keyword = String(req.query.search || '').trim();
        const status = String(req.query.status || '').trim();
        const result = await pool.request()
            .input('ChiCuaToi', sql.Bit, purchasing ? 0 : 1)
            .input('AnNhap', sql.Bit, purchasing ? 1 : 0)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TrangThai', sql.NVarChar, status)
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .query(requestListQuery);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách đề nghị mua hàng.' });
    }
};

const getRequestDetail = (purchasing = false) => async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request()
            .input('MaDN', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('ChiCuaToi', sql.Bit, purchasing ? 0 : 1)
            .query(`SELECT dn.*, nv.TenNV AS NguoiLap
                    FROM DeNghiMuaHang dn JOIN NhanVien nv ON nv.MaNV=dn.MaNV_Lap
                    WHERE dn.MaDN=@MaDN AND (@ChiCuaToi=0 OR dn.MaNV_Lap=@MaNV)`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy đề nghị mua hàng.' });
        if (purchasing && header.recordset[0].TrangThai === 'Nháp') return res.status(404).json({ message: 'Không tìm thấy đề nghị mua hàng.' });
        const details = await pool.request().input('MaDN', sql.VarChar, req.params.id).query(`
            SELECT ct.*, sp.TenSP, sp.MaVach, sp.DonViTinh, sp.GiaNhap
            FROM ChiTietDeNghi ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaDN=@MaDN ORDER BY sp.TenSP`);
        res.json({ request: header.recordset[0], lines: details.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết đề nghị.' });
    }
};

const generateRequestId = async transaction => {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const prefix = `DN${ymd}`;
    const result = await new sql.Request(transaction).input('Prefix', sql.VarChar, `${prefix}%`).query(`
        SELECT TOP 1 MaDN FROM DeNghiMuaHang WITH (UPDLOCK, HOLDLOCK)
        WHERE MaDN LIKE @Prefix ORDER BY MaDN DESC`);
    const last = result.recordset[0]?.MaDN;
    const sequence = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(sequence).padStart(3, '0')}`;
};

const replaceLines = async (transaction, MaDN, lines) => {
    const warehouseResult = await new sql.Request(transaction).query(`SELECT TOP 1 MaKho FROM Kho WHERE TrangThai=1 ORDER BY MaKho`);
    const MaKho = warehouseResult.recordset[0]?.MaKho;
    for (const line of lines) {
        const stockResult = await new sql.Request(transaction)
            .input('MaSP', sql.VarChar, line.MaSP)
            .input('MaKho', sql.VarChar, MaKho)
            .query(`SELECT sp.TonKhoToiThieu, ISNULL(tk.SLTon,0) AS SLTon
                    FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP AND tk.MaKho=@MaKho
                    WHERE sp.MaSP=@MaSP AND sp.TrangThai=N'Đang bán'`);
        if (!stockResult.recordset.length) throw new Error(`Sản phẩm ${line.MaSP} không tồn tại hoặc đã ngừng kinh doanh.`);
        const stock = stockResult.recordset[0];
        await new sql.Request(transaction)
            .input('MaDN', sql.VarChar, MaDN)
            .input('MaSP', sql.VarChar, line.MaSP)
            .input('SLTonHienTai', sql.Int, stock.SLTon)
            .input('SLTonToiThieu', sql.Int, stock.TonKhoToiThieu)
            .input('SLDeNghi', sql.Int, line.SLDeNghi)
            .input('GhiChu', sql.NVarChar, line.GhiChu)
            .query(`INSERT INTO ChiTietDeNghi
                    (MaDN,MaSP,SLTonHienTai,SLTonToiThieu,SLDeNghi,GhiChu)
                    VALUES (@MaDN,@MaSP,@SLTonHienTai,@SLTonToiThieu,@SLDeNghi,@GhiChu)`);
    }
};

const createRequest = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const lines = normalizeLines(req.body.lines);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const MaDN = await generateRequestId(transaction);
        await new sql.Request(transaction)
            .input('MaDN', sql.VarChar, MaDN)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, String(req.body.LyDo || '').trim().slice(0, 500) || null)
            .input('GhiChu', sql.NVarChar, String(req.body.GhiChu || '').trim().slice(0, 500) || null)
            .query(`INSERT INTO DeNghiMuaHang (MaDN,MaNV_Lap,NgayLap,LyDo,TrangThai,GhiChu)
                    VALUES (@MaDN,@MaNV,GETDATE(),@LyDo,N'Nháp',@GhiChu)`);
        await replaceLines(transaction, MaDN, lines);
        await writeAudit(new sql.Request(transaction), req.user, 'Tạo đề nghị mua hàng', MaDN, `Lưu nháp đề nghị gồm ${lines.length} mặt hàng`);
        await transaction.commit();
        res.status(201).json({ message: 'Đã lưu bản nháp đề nghị mua hàng.', MaDN });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể tạo đề nghị mua hàng.' });
    }
};

const updateRequest = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const lines = normalizeLines(req.body.lines);
        await transaction.begin();
        const current = await new sql.Request(transaction)
            .input('MaDN', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query('SELECT TrangThai FROM DeNghiMuaHang WITH (UPDLOCK) WHERE MaDN=@MaDN AND MaNV_Lap=@MaNV');
        if (!current.recordset.length) throw new Error('Không tìm thấy đề nghị mua hàng.');
        if (!editableStatuses.has(current.recordset[0].TrangThai)) throw new Error('Chỉ được sửa đề nghị ở trạng thái Nháp hoặc Yêu cầu bổ sung.');
        await new sql.Request(transaction)
            .input('MaDN', sql.VarChar, req.params.id)
            .input('LyDo', sql.NVarChar, String(req.body.LyDo || '').trim().slice(0, 500) || null)
            .input('GhiChu', sql.NVarChar, String(req.body.GhiChu || '').trim().slice(0, 500) || null)
            .query('UPDATE DeNghiMuaHang SET LyDo=@LyDo,GhiChu=@GhiChu WHERE MaDN=@MaDN; DELETE FROM ChiTietDeNghi WHERE MaDN=@MaDN;');
        await replaceLines(transaction, req.params.id, lines);
        await writeAudit(new sql.Request(transaction), req.user, 'Cập nhật đề nghị mua hàng', req.params.id, `Cập nhật ${lines.length} mặt hàng trong bản nháp`);
        await transaction.commit();
        res.json({ message: 'Đã cập nhật đề nghị mua hàng.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể cập nhật đề nghị.' });
    }
};

const submitRequest = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('MaDN', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE DeNghiMuaHang SET TrangThai=N'Đã gửi',NgayGui=GETDATE(),MaNV_TiepNhan=NULL
                    OUTPUT inserted.MaDN
                    WHERE MaDN=@MaDN AND MaNV_Lap=@MaNV AND TrangThai IN (N'Nháp',N'Yêu cầu bổ sung')
                      AND EXISTS (SELECT 1 FROM ChiTietDeNghi WHERE MaDN=@MaDN)`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Đề nghị không còn ở trạng thái có thể gửi.' });
        await writeAudit(pool.request(), req.user, 'Gửi đề nghị mua hàng', req.params.id, 'Chuyển đề nghị trực tiếp tới bộ phận mua hàng');
        res.json({ message: 'Đã gửi đề nghị tới Nhân viên mua hàng.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể gửi đề nghị mua hàng.' });
    }
};

const cancelRequest = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('MaDN', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE DeNghiMuaHang SET TrangThai=N'Đã hủy'
                    OUTPUT inserted.MaDN WHERE MaDN=@MaDN AND MaNV_Lap=@MaNV
                    AND TrangThai IN (N'Nháp',N'Yêu cầu bổ sung')`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Chỉ có thể hủy bản nháp hoặc đề nghị cần bổ sung.' });
        await writeAudit(pool.request(), req.user, 'Hủy đề nghị mua hàng', req.params.id, 'Thủ kho hủy đề nghị chưa gửi');
        res.json({ message: 'Đã hủy đề nghị mua hàng.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể hủy đề nghị.' });
    }
};

const acceptPurchasingRequest = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('MaDN', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE DeNghiMuaHang
                    SET TrangThai=N'Đang xử lý',MaNV_TiepNhan=@MaNV
                    OUTPUT inserted.MaDN
                    WHERE MaDN=@MaDN AND TrangThai=N'Đã gửi'`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Đề nghị không còn ở trạng thái có thể tiếp nhận.' });
        await writeAudit(pool.request(), req.user, 'Tiếp nhận đề nghị mua hàng', req.params.id, 'Nhân viên mua hàng bắt đầu xử lý đề nghị từ kho');
        res.json({ message: 'Đã tiếp nhận đề nghị mua hàng.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tiếp nhận đề nghị mua hàng.' });
    }
};

const requestPurchasingChanges = async (req, res) => {
    try {
        const reason = String(req.body.LyDo || '').trim().slice(0, 500);
        if (!reason) return res.status(400).json({ message: 'Vui lòng nhập nội dung cần Thủ kho bổ sung.' });
        const pool = await poolPromise;
        const result = await pool.request()
            .input('MaDN', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, reason)
            .query(`UPDATE DeNghiMuaHang
                    SET TrangThai=N'Yêu cầu bổ sung',MaNV_TiepNhan=@MaNV,
                        GhiChu=CONCAT(CASE WHEN NULLIF(GhiChu,N'') IS NULL THEN N'' ELSE GhiChu+CHAR(13)+CHAR(10) END,
                                       N'Phản hồi bộ phận mua hàng: ',@LyDo)
                    OUTPUT inserted.MaDN
                    WHERE MaDN=@MaDN
                      AND (
                        TrangThai IN (N'Đã gửi',N'Đang xử lý')
                        OR (
                          TrangThai=N'Đã lập đơn'
                          AND EXISTS (
                            SELECT 1 FROM DonMuaHang po
                            WHERE po.MaDN=DeNghiMuaHang.MaDN AND po.MaNV_Lap=@MaNV
                              AND po.TrangThai=N'Yêu cầu chỉnh sửa'
                          )
                        )
                      )`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Chỉ có thể chuyển về kho khi đề nghị đang xử lý hoặc Đơn mua đang được Quản lý yêu cầu chỉnh sửa.' });
        await writeAudit(pool.request(), req.user, 'Yêu cầu bổ sung đề nghị mua hàng', req.params.id, reason);
        res.json({ message: 'Đã trả đề nghị cho Thủ kho bổ sung thông tin.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể yêu cầu bổ sung đề nghị.' });
    }
};

const isoDay = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
};

const addIsoDays = (value, days) => {
    const [year, month, day] = String(value).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const getHistory = async (req, res) => {
    try {
        const today = isoDay(new Date());
        const from = String(req.query.from || `${today.slice(0, 8)}01`).trim();
        const to = String(req.query.to || today).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            throw new Error('Ngày lịch sử phải có dạng YYYY-MM-DD.');
        }
        if (from > to) throw new Error('Từ ngày không được sau đến ngày.');
        const toExclusive = addIsoDays(to, 1);
        const kind = String(req.query.kind || 'all').trim();
        const search = String(req.query.search || '').trim();
        const pool = await poolPromise;
        const bind = () => pool.request()
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('MaTK', sql.Int, req.user.MaTK)
            .input('From', sql.Date, from)
            .input('ToExclusive', sql.Date, toExclusive);

        const [inspections, lines, stockMoves, receipts, issues, counts, requests, audit] = await Promise.all([
            bind().query(`
                SELECT dt.MaDT, dt.MaHD, dt.NgayLap, dt.NgayKiemTra, dt.KetQuaKiemTra, dt.LyDo,
                       dt.HinhThucXuLy, dt.TrangThai, dt.SoTienHoan, dt.GhiChu, dt.NgayDuyet, dt.NgayHoan,
                       kh.TenKH, lap.TenNV NguoiLap, duyet.TenNV NguoiDuyet, hd.MaCa MaCaGoc
                FROM PhieuDoiTra dt
                JOIN HoaDon hd ON hd.MaHD=dt.MaHD
                JOIN NhanVien lap ON lap.MaNV=dt.MaNV_Lap
                LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
                LEFT JOIN NhanVien duyet ON duyet.MaNV=dt.MaNV_Duyet
                WHERE dt.MaNV_KiemTra=@MaNV
                  AND dt.NgayKiemTra>=@From AND dt.NgayKiemTra<@ToExclusive
                ORDER BY dt.NgayKiemTra DESC`),
            bind().query(`
                SELECT ct.MaDT, ct.MaSP, sp.TenSP, ct.SoLuong, ct.ThanhTien, ct.LoaiDong, ct.LyDo
                FROM ChiTietDoiTra ct
                JOIN PhieuDoiTra dt ON dt.MaDT=ct.MaDT
                JOIN SanPham sp ON sp.MaSP=ct.MaSP
                WHERE dt.MaNV_KiemTra=@MaNV
                  AND dt.NgayKiemTra>=@From AND dt.NgayKiemTra<@ToExclusive
                ORDER BY sp.TenSP`),
            bind().query(`
                SELECT gd.MaGD, gd.MaChungTu, gd.MaSP, sp.TenSP, gd.LoaiGD, gd.SoLuong,
                       gd.NgayGD, gd.GhiChu, nv.TenNV NguoiGhiSo
                FROM GiaoDichKho gd
                JOIN SanPham sp ON sp.MaSP=gd.MaSP
                JOIN NhanVien nv ON nv.MaNV=gd.MaNV
                JOIN PhieuDoiTra dt ON dt.MaDT=gd.MaChungTu AND dt.MaNV_KiemTra=@MaNV
                WHERE gd.LoaiChungTu=N'DoiTra'
                  AND dt.NgayKiemTra>=@From AND dt.NgayKiemTra<@ToExclusive
                ORDER BY gd.NgayGD DESC`),
            bind().query(`
                SELECT pn.MaPN, pn.NgayNhap, pn.NgayXacNhan, pn.TrangThai, pn.TongTien, pn.GhiChu, ncc.TenNCC
                FROM PhieuNhap pn
                LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
                WHERE pn.MaNV=@MaNV AND pn.NgayNhap>=@From AND pn.NgayNhap<@ToExclusive
                ORDER BY pn.NgayNhap DESC`),
            bind().query(`
                SELECT px.MaPX, px.NgayXuat, px.LoaiXuat, px.TrangThai, px.GhiChu, px.NgayDuyet
                FROM PhieuXuat px
                WHERE px.MaNV=@MaNV AND px.NgayXuat>=@From AND px.NgayXuat<@ToExclusive
                ORDER BY px.NgayXuat DESC`),
            bind().query(`
                SELECT kk.MaKK, kk.NgayKiemKe, kk.TrangThai, kk.GhiChu, kk.NgayDuyet, kk.LyDoTuChoi
                FROM KiemKe kk
                WHERE kk.MaNV=@MaNV AND kk.NgayKiemKe>=@From AND kk.NgayKiemKe<@ToExclusive
                ORDER BY kk.NgayKiemKe DESC`),
            bind().query(`
                SELECT dn.MaDN, dn.NgayLap, dn.NgayGui, dn.TrangThai, dn.LyDo,
                       COUNT(ct.MaSP) SoMatHang, SUM(ct.SLDeNghi) TongSoLuong
                FROM DeNghiMuaHang dn
                JOIN ChiTietDeNghi ct ON ct.MaDN=dn.MaDN
                WHERE dn.MaNV_Lap=@MaNV AND dn.NgayLap>=@From AND dn.NgayLap<@ToExclusive
                GROUP BY dn.MaDN, dn.NgayLap, dn.NgayGui, dn.TrangThai, dn.LyDo
                ORDER BY dn.NgayLap DESC`),
            bind().query(`
                SELECT nk.MaNK, nk.ThoiGian, nk.HanhDong, nk.BangLienQuan, nk.MaBanGhi, nk.NoiDung
                FROM NhatKy nk
                WHERE nk.MaTK=@MaTK
                  AND nk.BangLienQuan IN (N'DeNghiMuaHang', N'PhieuDoiTra', N'PhieuNhap', N'PhieuXuat', N'KiemKe')
                  AND nk.ThoiGian>=@From AND nk.ThoiGian<@ToExclusive
                ORDER BY nk.ThoiGian DESC`)
        ]);

        const linesByTicket = new Map();
        for (const line of lines.recordset) {
            if (!linesByTicket.has(line.MaDT)) linesByTicket.set(line.MaDT, []);
            linesByTicket.get(line.MaDT).push(line);
        }
        const movesByTicket = new Map();
        for (const move of stockMoves.recordset) {
            if (!movesByTicket.has(move.MaChungTu)) movesByTicket.set(move.MaChungTu, []);
            movesByTicket.get(move.MaChungTu).push(move);
        }
        const auditByRecord = new Map();
        for (const row of audit.recordset) {
            const key = `${row.BangLienQuan}:${row.MaBanGhi}`;
            if (!auditByRecord.has(key)) auditByRecord.set(key, []);
            auditByRecord.get(key).push(row);
        }

        const inspectionCards = inspections.recordset.map(ticket => {
            const restock = isRestockAccepted(ticket.KetQuaKiemTra);
            const scrap = /không nhập lại/i.test(String(ticket.KetQuaKiemTra || ''));
            const corrected = /Sửa tích nhầm|Đã trừ tồn tích nhầm|Đã sửa tích nhầm/i.test(`${ticket.KetQuaKiemTra || ''} ${ticket.GhiChu || ''}`);
            const mistaken = restock && looksUnsellable(ticket.LyDo);
            const products = (linesByTicket.get(ticket.MaDT) || []).filter(line => line.LoaiDong === 'Hàng khách trả');
            return {
                kind: 'doi-tra',
                at: ticket.NgayKiemTra,
                recordId: ticket.MaDT,
                title: corrected
                    ? 'Kiểm đổi trả — đã sửa tích nhầm'
                    : restock ? 'Kiểm đổi trả — nhập lại kho bán' : scrap ? 'Kiểm đổi trả — loại bỏ / vứt' : 'Kiểm đổi trả',
                subtitle: `${ticket.MaHD} · ${ticket.TenKH || 'Khách vãng lai'} · ${ticket.HinhThucXuLy}`,
                tone: corrected ? 'ok' : mistaken ? 'danger' : restock ? 'ok' : scrap ? 'warn' : 'info',
                status: ticket.TrangThai,
                hangDiDau: corrected
                    ? (ticket.TrangThai === 'Hoàn thành'
                        ? 'Đã trừ tồn hàng hỏng nhập nhầm'
                        : 'Đã sửa: không nhập lại kho khi thu ngân xác nhận')
                    : restock
                        ? 'Nhập lại kho bán (cộng tồn khi thu ngân xác nhận)'
                        : scrap
                            ? 'Loại bỏ / vứt — không cộng tồn (đã trừ lúc bán)'
                            : 'Chưa rõ xử lý kho',
                restock,
                mistaken,
                corrected,
                canRevise: ticket.TrangThai === 'Chờ duyệt',
                canFlagMistake: restock && !corrected && ['Đã duyệt', 'Hoàn thành'].includes(ticket.TrangThai),
                ticket,
                products,
                stockMoves: movesByTicket.get(ticket.MaDT) || [],
                audit: auditByRecord.get(`PhieuDoiTra:${ticket.MaDT}`) || []
            };
        });

        const timeline = [
            ...inspectionCards,
            ...receipts.recordset.map(row => ({
                kind: 'phieu-nhap',
                at: row.NgayXacNhan || row.NgayNhap,
                recordId: row.MaPN,
                title: `Phiếu nhập ${row.MaPN}`,
                subtitle: `${row.TenNCC || 'NCC'} · ${row.TrangThai}`,
                tone: row.TrangThai === 'Đã xác nhận' ? 'ok' : 'info',
                status: row.TrangThai,
                detail: row.GhiChu || null,
                amount: row.TongTien
            })),
            ...issues.recordset.map(row => ({
                kind: 'phieu-xuat',
                at: row.NgayXuat,
                recordId: row.MaPX,
                title: `Phiếu xuất ${row.MaPX}`,
                subtitle: `${row.LoaiXuat} · ${row.TrangThai}`,
                tone: /hủy|hỏng|trả/i.test(row.LoaiXuat || '') ? 'warn' : 'info',
                status: row.TrangThai,
                detail: row.GhiChu || null
            })),
            ...counts.recordset.map(row => ({
                kind: 'kiem-ke',
                at: row.NgayKiemKe,
                recordId: row.MaKK,
                title: `Kiểm kê ${row.MaKK}`,
                subtitle: row.TrangThai,
                tone: row.TrangThai === 'Từ chối' ? 'danger' : /duyệt|hoàn thành/i.test(row.TrangThai || '') ? 'ok' : 'info',
                status: row.TrangThai,
                detail: row.LyDoTuChoi || row.GhiChu || null
            })),
            ...requests.recordset.map(row => ({
                kind: 'de-nghi',
                at: row.NgayGui || row.NgayLap,
                recordId: row.MaDN,
                title: `Đề nghị mua ${row.MaDN}`,
                subtitle: `${row.SoMatHang} mặt hàng · ${row.TrangThai}`,
                tone: 'info',
                status: row.TrangThai,
                detail: row.LyDo || null
            }))
        ].sort((left, right) => new Date(right.at) - new Date(left.at));

        const match = value => !search || String(value || '').toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'));
        const filtered = timeline.filter(item => {
            if (kind !== 'all' && item.kind !== kind) return false;
            if (!search) return true;
            const blob = [
                item.title, item.subtitle, item.status, item.detail, item.hangDiDau, item.recordId,
                item.ticket?.LyDo, item.ticket?.KetQuaKiemTra, item.ticket?.GhiChu,
                ...(item.products || []).map(line => `${line.TenSP} ${line.MaSP}`)
            ].join(' ');
            return match(blob);
        });

        const actor = await pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT MaNV, TenNV FROM NhanVien WHERE MaNV=@MaNV`);
        res.json({
            actor: actor.recordset[0] || { MaNV: req.user.MaNV, TenNV: req.user.TenNV },
            period: { from, to },
            summary: {
                SoKiemDoiTra: inspectionCards.length,
                SoNhapLai: inspectionCards.filter(item => item.restock).length,
                SoLoaiBo: inspectionCards.filter(item => !item.restock).length,
                SoTichNham: inspectionCards.filter(item => item.mistaken).length,
                SoPhieuNhap: receipts.recordset.length,
                SoPhieuXuat: issues.recordset.length,
                SoKiemKe: counts.recordset.length,
                SoDeNghi: requests.recordset.length
            },
            timeline: filtered,
            audit: audit.recordset
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể tải lịch sử kho.' });
    }
};

module.exports = {
    getDashboard, getInventory, getHistory,
    listWarehouseRequests: listRequests(false),
    listPurchasingRequests: listRequests(true),
    getWarehouseRequestDetail: getRequestDetail(false),
    getPurchasingRequestDetail: getRequestDetail(true),
    createRequest, updateRequest, submitRequest, cancelRequest,
    acceptPurchasingRequest, requestPurchasingChanges
};
