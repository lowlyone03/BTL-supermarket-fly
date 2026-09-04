const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const listShifts = async (req, res) => {
    try {
        const pool = await poolPromise;
        const status = clean(req.query.status, 30);
        const result = await pool.request().input('Status', sql.NVarChar, status).query(`
            SELECT ca.MaCa,ca.MaNV,nv.TenNV,ca.MaQuay,q.TenQuay,ca.ThoiGianBatDau,ca.ThoiGianKetThuc,
                   ca.TienDauCa,ca.TienCuoiCa,ca.TongTienMat,ca.TongTienQR,ca.TongTienThe,
                   ca.TongTienChuyenKhoan,ca.TongTienHoanMat,ca.TienMatHeThong,ca.TienThucNop,
                   ca.TienThucNop-ca.TienMatHeThong ChenhLech,ca.TrangThaiDoiSoat,ca.TrangThai,
                   pt.MaPT,pt.TrangThai TrangThaiPhieuThu,
                   (SELECT COUNT(*) FROM HoaDon hd WHERE hd.MaCa=ca.MaCa AND hd.TrangThai=N'Hoàn thành') SoHoaDon,
                   (SELECT COALESCE(SUM(hd.TongThanhToan),0) FROM HoaDon hd
                    WHERE hd.MaCa=ca.MaCa AND hd.TrangThai=N'Hoàn thành') DoanhThu
            FROM CaLamViec ca
            JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            LEFT JOIN QuayBanHang q ON q.MaQuay=ca.MaQuay
            LEFT JOIN PhieuThu pt ON pt.MaCa=ca.MaCa
            WHERE ca.TrangThai=N'Đã chốt'
              AND (@Status='' OR ca.TrangThaiDoiSoat=@Status)
            ORDER BY ca.ThoiGianKetThuc DESC`);
        const items = result.recordset;
        const summary = items.reduce((acc, row) => {
            acc.DoanhThu += Number(row.DoanhThu || 0);
            acc.TienMatHeThong += Number(row.TienMatHeThong || 0);
            acc.TienThucNop += Number(row.TienThucNop || 0);
            acc.TongTienQR += Number(row.TongTienQR || 0);
            acc.TongTienThe += Number(row.TongTienThe || 0);
            acc.TongTienChuyenKhoan += Number(row.TongTienChuyenKhoan || 0);
            return acc;
        }, { DoanhThu: 0, TienMatHeThong: 0, TienThucNop: 0, TongTienQR: 0, TongTienThe: 0, TongTienChuyenKhoan: 0 });
        res.json({ items, summary });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách ca chờ đối soát.' });
    }
};

const getShift = async (req, res) => {
    try {
        const pool = await poolPromise;
        let maCa = clean(req.params.id, 20);
        if (/^PT/i.test(maCa)) {
            const found = await pool.request().input('Id', sql.VarChar, maCa)
                .query('SELECT MaCa FROM PhieuThu WHERE MaPT=@Id');
            if (!found.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Phiếu thu.' });
            maCa = found.recordset[0].MaCa;
        }
        const header = await pool.request().input('MaCa', sql.VarChar, maCa).query(`
            SELECT ca.*,nv.TenNV,q.TenQuay,pt.MaPT,pt.LyDoChenhLech,pt.TrangThai TrangThaiPhieuThu
            FROM CaLamViec ca JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            LEFT JOIN QuayBanHang q ON q.MaQuay=ca.MaQuay
            LEFT JOIN PhieuThu pt ON pt.MaCa=ca.MaCa
            WHERE ca.MaCa=@MaCa`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy ca bán hàng.' });
        const [invoices, payments] = await Promise.all([
            pool.request().input('MaCa', sql.VarChar, maCa).query(`
                SELECT MaHD,NgayLap,TongThanhToan,TrangThai FROM HoaDon WHERE MaCa=@MaCa ORDER BY NgayLap`),
            pool.request().input('MaCa', sql.VarChar, maCa).query(`
                SELECT tt.MaTT,tt.MaHD,tt.PhuongThuc,tt.MaGiaoDich,tt.SoTien,tt.TrangThai,tt.NgayTT
                FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
                WHERE hd.MaCa=@MaCa ORDER BY tt.NgayTT`)
        ]);
        res.json({ shift: header.recordset[0], invoices: invoices.recordset, payments: payments.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải hồ sơ đối soát ca.' });
    }
};

const createReceipt = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maCa = clean(req.params.id, 20);
        const reason = clean(req.body.LyDoChenhLech, 500) || null;
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const shift = await new sql.Request(transaction).input('MaCa', sql.VarChar, maCa).query(`
            SELECT * FROM CaLamViec WITH(UPDLOCK,HOLDLOCK)
            WHERE MaCa=@MaCa AND TrangThai=N'Đã chốt'`);
        if (!shift.recordset.length) throw new Error('Ca chưa đóng hoặc không tồn tại.');
        const row = shift.recordset[0];
        if (row.TienMatHeThong == null || row.TienThucNop == null) throw new Error('Ca chưa có snapshot tiền bàn giao.');
        const difference = Number(row.TienThucNop) - Number(row.TienMatHeThong);
        if (difference !== 0 && !reason) throw new Error('Ca có chênh lệch nên Kế toán phải nhập lý do.');
        const exists = await new sql.Request(transaction).input('MaCa', sql.VarChar, maCa)
            .query('SELECT MaPT FROM PhieuThu WITH(UPDLOCK,HOLDLOCK) WHERE MaCa=@MaCa');
        if (exists.recordset.length) throw new Error(`Ca đã có Phiếu thu ${exists.recordset[0].MaPT}.`);
        const prefix = `PT${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`;
        const last = await new sql.Request(transaction).input('Prefix', sql.VarChar, `${prefix}%`)
            .query(`SELECT TOP 1 MaPT FROM PhieuThu WITH(UPDLOCK,HOLDLOCK) WHERE MaPT LIKE @Prefix ORDER BY MaPT DESC`);
        const lastId = last.recordset[0]?.MaPT;
        const maPT = `${prefix}${String(lastId ? Number(lastId.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
        await new sql.Request(transaction).input('MaPT', sql.VarChar, maPT)
            .input('MaCa', sql.VarChar, maCa).input('MaNV', sql.VarChar, req.user.MaNV)
            .input('HeThong', sql.Decimal(18, 2), row.TienMatHeThong)
            .input('ThucNop', sql.Decimal(18, 2), row.TienThucNop)
            .input('LyDo', sql.NVarChar, reason)
            .query(`INSERT PhieuThu(MaPT,MaCa,MaNV_Lap,NgayLap,SoTienTheoHeThong,SoTienThucNop,
                        LyDoChenhLech,NoiDung,TrangThai)
                    VALUES(@MaPT,@MaCa,@MaNV,GETDATE(),@HeThong,@ThucNop,@LyDo,
                        N'Bàn giao tiền mặt cuối ca',N'Nháp')`);
        await logAudit(transaction, {
            user: req.user, req, action: 'Lập Phiếu thu cuối ca', table: 'PhieuThu', recordId: maPT, uc: 'UC29',
            severity: 'Quan trọng',
            content: `Ca ${maCa}; hệ thống ${Number(row.TienMatHeThong).toLocaleString('vi-VN')}đ; thực nộp ${Number(row.TienThucNop).toLocaleString('vi-VN')}đ`
        });
        await transaction.commit();
        res.status(201).json({ message: `Đã lập Phiếu thu ${maPT}.`, MaPT: maPT });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const confirmReceipt = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maPT = clean(req.params.id, 20);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const receipt = await new sql.Request(transaction).input('MaPT', sql.VarChar, maPT).query(`
            SELECT * FROM PhieuThu WITH(UPDLOCK,HOLDLOCK) WHERE MaPT=@MaPT`);
        if (!receipt.recordset.length) throw new Error('Không tìm thấy Phiếu thu.');
        if (receipt.recordset[0].TrangThai === 'Đã xác nhận') {
            await transaction.rollback();
            return res.json({ message: 'Phiếu thu đã được xác nhận trước đó.', alreadyConfirmed: true });
        }
        if (Number(receipt.recordset[0].SoTienThucNop) !== Number(receipt.recordset[0].SoTienTheoHeThong)
            && !clean(receipt.recordset[0].LyDoChenhLech)) {
            throw new Error('Phiếu có chênh lệch nhưng chưa ghi lý do.');
        }
        await new sql.Request(transaction).input('MaPT', sql.VarChar, maPT)
            .query(`UPDATE PhieuThu SET TrangThai=N'Đã xác nhận',NgayXacNhan=GETDATE() WHERE MaPT=@MaPT`);
        await new sql.Request(transaction).input('MaCa', sql.VarChar, receipt.recordset[0].MaCa)
            .query(`UPDATE CaLamViec SET TrangThaiDoiSoat=N'Đã đối soát' WHERE MaCa=@MaCa`);
        await logAudit(transaction, {
            user: req.user, req, action: 'Xác nhận Phiếu thu', table: 'PhieuThu', recordId: maPT, uc: 'UC29',
            severity: 'Quan trọng',
            content: `Đã đối soát tiền mặt cuối ca ${receipt.recordset[0].MaCa}`
        });
        await transaction.commit();
        res.json({ message: `Đã xác nhận Phiếu thu ${maPT}.` });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

module.exports = { listShifts, getShift, createReceipt, confirmReceipt };
