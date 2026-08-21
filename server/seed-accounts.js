require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');
const bcrypt = require('bcrypt');

const employees = [
    { MaNV: 'NV_QL01', TenNV: 'Nguyễn Văn Quản Lý', ChucVu: 'Quản lý', SDT: '0901000001', Email: 'quanly@supermarket.fly', DiaChi: 'Hà Nội', TrangThai: 'Hoạt động' },
    { MaNV: 'NV_MH01', TenNV: 'Trần Thị Mua Hàng', ChucVu: 'NV Mua hàng', SDT: '0901000002', Email: 'muahang@supermarket.fly', DiaChi: 'Hà Nội', TrangThai: 'Hoạt động' },
    { MaNV: 'NV_TK01', TenNV: 'Lê Văn Thủ Kho', ChucVu: 'Thủ kho', SDT: '0901000003', Email: 'thukho@supermarket.fly', DiaChi: 'Hà Nội', TrangThai: 'Hoạt động' },
    { MaNV: 'NV_TN01', TenNV: 'Phạm Thị Thu Ngân', ChucVu: 'Thu ngân', SDT: '0901000004', Email: 'thungan@supermarket.fly', DiaChi: 'Hà Nội', TrangThai: 'Hoạt động' },
    { MaNV: 'NV_KT01', TenNV: 'Hoàng Văn Kế Toán', ChucVu: 'Kế toán', SDT: '0901000005', Email: 'ketoan@supermarket.fly', DiaChi: 'Hà Nội', TrangThai: 'Hoạt động' }
];

const defaultPassword = '123';

async function seedData() {
    try {
        const pool = await poolPromise;
        console.log('--- BẮT ĐẦU TẠO DỮ LIỆU MẪU ---');

        // Xóa tài khoản tham chiếu trước
        await pool.request().query("DELETE FROM TaiKhoan WHERE MaVaiTro IN (6, 7)");
        // Sau đó xóa role bị thêm thừa trước đó (nếu có)
        await pool.request().query("DELETE FROM VaiTro WHERE MaVaiTro IN (6, 7)");

        // Lấy danh sách Vai trò hiện có trong máy bạn (đã được tạo sẵn)
        const rolesDb = await pool.request().query('SELECT MaVaiTro, TenVaiTro FROM VaiTro');
        const roleMap = {};
        rolesDb.recordset.forEach(r => {
            // Chuẩn hóa tên về viết thường để dễ tìm
            roleMap[r.TenVaiTro.toLowerCase().trim()] = r.MaVaiTro; 
        });

        // Thêm Nhân Viên
        for (let i = 0; i < employees.length; i++) {
            const e = employees[i];
            const checkEmp = await pool.request()
                .input('MaNV', sql.VarChar, e.MaNV)
                .query('SELECT MaNV FROM NhanVien WHERE MaNV = @MaNV');
            
            if (checkEmp.recordset.length === 0) {
                await pool.request()
                    .input('MaNV', sql.VarChar, e.MaNV)
                    .input('TenNV', sql.NVarChar, e.TenNV)
                    .input('ChucVu', sql.NVarChar, e.ChucVu)
                    .input('SDT', sql.VarChar, e.SDT)
                    .input('Email', sql.VarChar, e.Email)
                    .input('DiaChi', sql.NVarChar, e.DiaChi)
                    .input('TrangThai', sql.NVarChar, e.TrangThai)
                    .query('INSERT INTO NhanVien (MaNV, TenNV, ChucVu, SDT, Email, DiaChi, TrangThai) VALUES (@MaNV, @TenNV, @ChucVu, @SDT, @Email, @DiaChi, @TrangThai)');
                console.log(`+ Đã thêm nhân viên: ${e.TenNV}`);
            } else {
                console.log(`- Nhân viên đã tồn tại: ${e.TenNV}`);
            }
        }

        // Hash mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(defaultPassword, salt);

        // Map tên vai trò khớp với trong CSDL của bạn
        const accounts = [
            { TenDangNhap: 'admin', MaNV: 'NV_QL01', MaVaiTro: roleMap['quản lý'] },
            { TenDangNhap: 'muahang', MaNV: 'NV_MH01', MaVaiTro: roleMap['nhân viên mua hàng'] },
            { TenDangNhap: 'thukho', MaNV: 'NV_TK01', MaVaiTro: roleMap['thủ kho'] },
            { TenDangNhap: 'thungan', MaNV: 'NV_TN01', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'ketoan', MaNV: 'NV_KT01', MaVaiTro: roleMap['kế toán'] }
        ];

        for (let i = 0; i < accounts.length; i++) {
            const a = accounts[i];
            
            // Xóa tài khoản bị lỗi cũ (nếu có)
            await pool.request()
                .input('TenDangNhap', sql.VarChar, a.TenDangNhap)
                .query('DELETE FROM TaiKhoan WHERE TenDangNhap = @TenDangNhap');

            await pool.request()
                .input('TenDangNhap', sql.VarChar, a.TenDangNhap)
                .input('MatKhau', sql.VarChar, hashedPassword)
                .input('MaNV', sql.VarChar, a.MaNV)
                .input('MaVaiTro', sql.Int, a.MaVaiTro)
                .input('TrangThai', sql.TinyInt, 1) 
                .input('NgayTao', sql.DateTime, new Date())
                .query('INSERT INTO TaiKhoan (TenDangNhap, MatKhau, MaNV, MaVaiTro, TrangThai, NgayTao) VALUES (@TenDangNhap, @MatKhau, @MaNV, @MaVaiTro, @TrangThai, @NgayTao)');
            console.log(`+ Đã tạo tài khoản: ${a.TenDangNhap} (Mật khẩu: ${defaultPassword})`);
        }

        console.log('--- HOÀN TẤT TẠO DỮ LIỆU ---');
        process.exit(0);

    } catch (err) {
        console.error('❌ Lỗi: ', err);
        process.exit(1);
    }
}

seedData();
