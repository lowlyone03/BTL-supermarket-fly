const { sql, poolPromise } = require('../config/db');

const generateShiftId = async transaction => {
    const now = new Date();
    const prefix = `CA${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 MaCa FROM CaLamViec WITH (UPDLOCK,HOLDLOCK)
                WHERE MaCa LIKE @Prefix ORDER BY MaCa DESC`);
    const last = result.recordset[0]?.MaCa;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const shiftQuery = `
    SELECT ca.MaCa,ca.MaNV,nv.TenNV,ca.ThoiGianBatDau,ca.ThoiGianKetThuc,
           ca.TienDauCa,ca.TienCuoiCa,ca.TrangThai,
           COUNT(hd.MaHD) AS SoHoaDon,
           COALESCE(SUM(CASE WHEN hd.TrangThai=N'Hoàn thành' THEN hd.TongThanhToan ELSE 0 END),0) AS DoanhThu
    FROM CaLamViec ca
    JOIN NhanVien nv ON nv.MaNV=ca.MaNV
    LEFT JOIN HoaDon hd ON hd.MaCa=ca.MaCa
`;

const getShifts = async (req, res) => {
    try {
        const pool = await poolPromise;
        const [current, history] = await Promise.all([
            pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`${shiftQuery}
                WHERE ca.MaNV=@MaNV AND ca.ThoiGianKetThuc IS NULL AND ca.TrangThai=N'Đang mở'
                GROUP BY ca.MaCa,ca.MaNV,nv.TenNV,ca.ThoiGianBatDau,ca.ThoiGianKetThuc,ca.TienDauCa,ca.TienCuoiCa,ca.TrangThai`),
            pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`${shiftQuery}
                WHERE ca.MaNV=@MaNV
                GROUP BY ca.MaCa,ca.MaNV,nv.TenNV,ca.ThoiGianBatDau,ca.ThoiGianKetThuc,ca.TienDauCa,ca.TienCuoiCa,ca.TrangThai
                ORDER BY ca.ThoiGianBatDau DESC`)
        ]);
        res.json({ current: current.recordset[0] || null, items: history.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải thông tin ca bán hàng.' });
    }
};

const openShift = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const TienDauCa = Number(req.body.TienDauCa);
        if (!Number.isFinite(TienDauCa) || TienDauCa < 0) {
            throw new Error('Tiền đầu ca phải là số không âm.');
        }
        if (TienDauCa > 1000000000) throw new Error('Tiền đầu ca vượt quá giới hạn cho phép.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const employee = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaNV,TenNV,ChucVu,TrangThai FROM NhanVien WITH (UPDLOCK,HOLDLOCK) WHERE MaNV=@MaNV`);
        if (!employee.recordset.length || employee.recordset[0].TrangThai !== 'Đang làm việc') {
            throw new Error('Nhân viên không ở trạng thái làm việc.');
        }
        if (employee.recordset[0].ChucVu !== 'Thu ngân') {
            throw new Error('Chỉ Thu ngân mới được mở ca bán hàng cá nhân.');
        }
        const active = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaCa FROM CaLamViec WITH (UPDLOCK,HOLDLOCK)
                    WHERE MaNV=@MaNV AND ThoiGianKetThuc IS NULL AND TrangThai=N'Đang mở'`);
        if (active.recordset.length) throw new Error(`Bạn đang có ca ${active.recordset[0].MaCa} chưa đóng.`);
        const MaCa = await generateShiftId(transaction);
        await new sql.Request(transaction)
            .input('MaCa', sql.VarChar, MaCa)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TienDauCa', sql.Decimal(18, 2), TienDauCa)
            .query(`INSERT INTO CaLamViec (MaCa,MaNV,ThoiGianBatDau,TienDauCa,TrangThai)
                    VALUES (@MaCa,@MaNV,GETDATE(),@TienDauCa,N'Đang mở')`);
        await new sql.Request(transaction)
            .input('MaTK', sql.Int, req.user.MaTK)
            .input('MaCa', sql.VarChar, MaCa)
            .input('NoiDung', sql.NVarChar, `Thu ngân mở ca với tiền đầu ca ${TienDauCa.toLocaleString('vi-VN')} đồng`)
            .query(`INSERT INTO NhatKy (MaTK,HanhDong,BangLienQuan,MaBanGhi,NoiDung,ThoiGian)
                    VALUES (@MaTK,N'Mở ca bán hàng',N'CaLamViec',@MaCa,@NoiDung,GETDATE())`);
        await transaction.commit();
        res.status(201).json({ message: `Đã mở ca ${MaCa}. Bạn có thể bắt đầu bán hàng.`, MaCa });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

module.exports = { getShifts, openShift };
