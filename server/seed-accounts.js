require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');
const bcrypt = require('bcrypt');
const { purgeExtraCashier } = require('./purge-extra-cashier');
const { ensureEmployeeProfileSchema } = require('./src/services/employeeProfileSchema');
const { backfillSeedHoSo } = require('./src/services/employeeHoSo');

const employees = [
    { MaNV: 'NV_QL01', TenNV: 'Nguyễn Minh Anh', ChucVu: 'Quản lý', CCCD: '001200000001', NgaySinh: '1988-03-12', GioiTinh: 'Nữ', SDT: '0901000001', Email: 'quanly@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-01-08', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_MH01', TenNV: 'Trần Thu Hà', ChucVu: 'Nhân viên mua hàng', CCCD: '001200000002', NgaySinh: '1994-07-21', GioiTinh: 'Nữ', SDT: '0901000002', Email: 'muahang@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-01-10', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TK01', TenNV: 'Lê Đức Long', ChucVu: 'Thủ kho', CCCD: '001200000003', NgaySinh: '1991-11-05', GioiTinh: 'Nam', SDT: '0901000003', Email: 'thukho@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-01-10', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN01', TenNV: 'Phạm Thảo Vy', ChucVu: 'Thu ngân', CCCD: '001200000004', NgaySinh: '1998-02-18', GioiTinh: 'Nữ', SDT: '0901000004', Email: 'thungan@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-01-12', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN02', TenNV: 'Nguyễn Hoàng Nam', ChucVu: 'Thu ngân', CCCD: '001200000005', NgaySinh: '1999-09-03', GioiTinh: 'Nam', SDT: '0901000012', Email: 'nam.nguyen@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-02-01', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN03', TenNV: 'Đỗ Khánh Linh', ChucVu: 'Thu ngân', CCCD: '001200000006', NgaySinh: '1999-05-26', GioiTinh: 'Nữ', SDT: '0901000013', Email: 'linh.do@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-02-01', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN04', TenNV: 'Vũ Minh Quân', ChucVu: 'Thu ngân', CCCD: '001200000007', NgaySinh: '2001-12-14', GioiTinh: 'Nam', SDT: '0901000014', Email: 'quan.vu@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-03-01', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN05', TenNV: 'Bùi Ngọc Mai', ChucVu: 'Thu ngân', CCCD: '001200000008', NgaySinh: '2000-04-09', GioiTinh: 'Nữ', SDT: '0901000015', Email: 'mai.bui@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-03-15', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN06', TenNV: 'Phan Tuấn Kiệt', ChucVu: 'Thu ngân', CCCD: '001200000009', NgaySinh: '1998-08-30', GioiTinh: 'Nam', SDT: '0901000016', Email: 'kiet.phan@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-04-01', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN07', TenNV: 'Tạ Thu Trang', ChucVu: 'Thu ngân', CCCD: '001200000010', NgaySinh: '2001-01-22', GioiTinh: 'Nữ', SDT: '0901000017', Email: 'trang.ta@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-05-02', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_TN08', TenNV: 'Đặng Gia Huy', ChucVu: 'Thu ngân', CCCD: '001200000011', NgaySinh: '2002-06-17', GioiTinh: 'Nam', SDT: '0901000018', Email: 'huy.dang@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-06-01', TrangThai: 'Đang làm việc' },
    { MaNV: 'NV_KT01', TenNV: 'Hoàng Minh Châu', ChucVu: 'Kế toán', CCCD: '001200000012', NgaySinh: '1993-10-08', GioiTinh: 'Nữ', SDT: '0901000005', Email: 'ketoan@supermarket.fly', DiaChi: 'Hà Nội', NgayVaoLam: '2024-01-10', TrangThai: 'Đang làm việc' }
];

const defaultPassword = '123';

async function seedData() {
    try {
        const pool = await poolPromise;
        await ensureEmployeeProfileSchema(pool);
        console.log('--- BẮT ĐẦU TẠO DỮ LIỆU MẪU ---');

        // Chuẩn hóa đúng 5 vai trò trong tài liệu. Không xóa tài khoản/chứng từ đã có.
        const canonicalRoles = [
            { id: 1, name: 'Quản lý', description: 'Quản trị hệ thống, phê duyệt nghiệp vụ và xem báo cáo tổng hợp' },
            { id: 2, name: 'Nhân viên mua hàng', description: 'Quản lý nhà cung cấp, lập đơn mua hàng và theo dõi giao hàng' },
            { id: 3, name: 'Thủ kho', description: 'Quản lý tồn kho, nhập xuất kho, kiểm kê và kiểm tra hàng' },
            { id: 4, name: 'Thu ngân', description: 'Mở đóng ca, bán hàng tại quầy, thanh toán và tiếp nhận đổi trả' },
            { id: 5, name: 'Kế toán', description: 'Đối chiếu chứng từ, công nợ phải trả, phiếu thu chi và báo cáo nội bộ' }
        ];

        for (const role of canonicalRoles) {
            await pool.request()
                .input('MaVaiTro', sql.Int, role.id)
                .input('TenVaiTro', sql.NVarChar, role.name)
                .input('MoTa', sql.NVarChar, role.description)
                .query(`UPDATE VaiTro
                        SET TenVaiTro = @TenVaiTro, MoTa = @MoTa
                        WHERE MaVaiTro = @MaVaiTro`);
        }

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
                    .input('CCCD', sql.VarChar, e.CCCD)
                    .input('NgaySinh', sql.Date, e.NgaySinh)
                    .input('GioiTinh', sql.NVarChar, e.GioiTinh)
                    .input('SDT', sql.VarChar, e.SDT)
                    .input('Email', sql.VarChar, e.Email)
                    .input('DiaChi', sql.NVarChar, e.DiaChi)
                    .input('NgayVaoLam', sql.Date, e.NgayVaoLam)
                    .input('TrangThai', sql.NVarChar, e.TrangThai)
                    .query(`INSERT INTO NhanVien
                            (MaNV, TenNV, ChucVu, CCCD, NgaySinh, GioiTinh, SDT, Email, DiaChi, NgayVaoLam, TrangThai)
                            VALUES (@MaNV, @TenNV, @ChucVu, @CCCD, @NgaySinh, @GioiTinh, @SDT, @Email, @DiaChi, @NgayVaoLam, @TrangThai)`);
                console.log(`+ Đã thêm nhân viên: ${e.TenNV}`);
            } else {
                await pool.request()
                    .input('MaNV', sql.VarChar, e.MaNV)
                    .input('TenNV', sql.NVarChar, e.TenNV)
                    .input('ChucVu', sql.NVarChar, e.ChucVu)
                    .input('CCCD', sql.VarChar, e.CCCD)
                    .input('NgaySinh', sql.Date, e.NgaySinh)
                    .input('GioiTinh', sql.NVarChar, e.GioiTinh)
                    .input('SDT', sql.VarChar, e.SDT)
                    .input('Email', sql.VarChar, e.Email)
                    .input('DiaChi', sql.NVarChar, e.DiaChi)
                    .input('NgayVaoLam', sql.Date, e.NgayVaoLam)
                    .input('TrangThai', sql.NVarChar, e.TrangThai)
                    .query(`UPDATE NhanVien
                            SET TenNV = @TenNV, ChucVu = @ChucVu, SDT = @SDT,
                                Email = @Email, DiaChi = @DiaChi, TrangThai = @TrangThai,
                                CCCD = COALESCE(CCCD, @CCCD),
                                NgaySinh = COALESCE(NgaySinh, @NgaySinh),
                                GioiTinh = COALESCE(GioiTinh, @GioiTinh),
                                NgayVaoLam = COALESCE(NgayVaoLam, @NgayVaoLam)
                            WHERE MaNV = @MaNV`);
                console.log(`~ Đã chuẩn hóa nhân viên: ${e.TenNV}`);
            }
        }

        const cashierBirthdays = employees.filter((row) => /^NV_TN0[1-8]$/.test(row.MaNV));
        for (const cashier of cashierBirthdays) {
            await pool.request()
                .input('MaNV', sql.VarChar, cashier.MaNV)
                .input('NgaySinh', sql.Date, cashier.NgaySinh)
                .query(`UPDATE NhanVien
                        SET NgaySinh = @NgaySinh
                        WHERE MaNV = @MaNV AND ChucVu = N'Thu ngân'`);
        }
        console.log(`~ Đã ghi đè ngày sinh ${cashierBirthdays.length} thu ngân NV_TN01–NV_TN08 (1998–2002).`);

        const hoSoCount = await backfillSeedHoSo(pool);
        console.log(`~ Đã điền/giữ hồ sơ chi tiết cho ${hoSoCount} nhân viên (COALESCE, không ghi đè giá trị đã sửa).`);

        // Hash mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(defaultPassword, salt);

        // Map tên vai trò khớp với trong CSDL của bạn
        const accounts = [
            { TenDangNhap: 'admin', MaNV: 'NV_QL01', MaVaiTro: roleMap['quản lý'] },
            { TenDangNhap: 'muahang', MaNV: 'NV_MH01', MaVaiTro: roleMap['nhân viên mua hàng'] },
            { TenDangNhap: 'thukho', MaNV: 'NV_TK01', MaVaiTro: roleMap['thủ kho'] },
            { TenDangNhap: 'thungan', MaNV: 'NV_TN01', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'thungan02', MaNV: 'NV_TN02', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'thungan03', MaNV: 'NV_TN03', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'thungan04', MaNV: 'NV_TN04', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'thungan05', MaNV: 'NV_TN05', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'thungan06', MaNV: 'NV_TN06', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'thungan07', MaNV: 'NV_TN07', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'thungan08', MaNV: 'NV_TN08', MaVaiTro: roleMap['thu ngân'] },
            { TenDangNhap: 'ketoan', MaNV: 'NV_KT01', MaVaiTro: roleMap['kế toán'] }
        ];

        for (let i = 0; i < accounts.length; i++) {
            const a = accounts[i];
            
            if (!a.MaVaiTro) {
                throw new Error(`Không tìm thấy vai trò cho tài khoản ${a.TenDangNhap}`);
            }

            const existing = await pool.request()
                .input('TenDangNhap', sql.VarChar, a.TenDangNhap)
                .query('SELECT MaTK FROM TaiKhoan WHERE TenDangNhap = @TenDangNhap');

            if (existing.recordset.length === 0) {
                await pool.request()
                    .input('TenDangNhap', sql.VarChar, a.TenDangNhap)
                    .input('MatKhauHash', sql.VarChar, hashedPassword)
                    .input('MaNV', sql.VarChar, a.MaNV)
                    .input('MaVaiTro', sql.Int, a.MaVaiTro)
                    .input('TrangThai', sql.TinyInt, 1)
                    .input('NgayTao', sql.DateTime, new Date())
                    .query('INSERT INTO TaiKhoan (TenDangNhap, MatKhauHash, MaNV, MaVaiTro, TrangThai, NgayTao) VALUES (@TenDangNhap, @MatKhauHash, @MaNV, @MaVaiTro, @TrangThai, @NgayTao)');
                console.log(`+ Đã tạo tài khoản: ${a.TenDangNhap} (Mật khẩu: ${defaultPassword})`);
            } else {
                // Giữ nguyên mật khẩu và khóa chính để không làm hỏng lịch sử nhật ký.
                await pool.request()
                    .input('TenDangNhap', sql.VarChar, a.TenDangNhap)
                    .input('MaNV', sql.VarChar, a.MaNV)
                    .input('MaVaiTro', sql.Int, a.MaVaiTro)
                    .query(`UPDATE TaiKhoan
                            SET MaNV = @MaNV, MaVaiTro = @MaVaiTro
                            WHERE TenDangNhap = @TenDangNhap`);
                console.log(`~ Đã chuẩn hóa tài khoản: ${a.TenDangNhap}`);
            }
        }

        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM KhuyenMai WHERE MaKM='KM001')
                INSERT INTO KhuyenMai (MaKM,TenKM,LoaiKM,GiaTri,NgayBatDau,NgayKetThuc,TrangThai)
                VALUES ('KM001', N'Khai trương giảm 10%', N'Phần trăm', 10,
                        CONVERT(date, GETDATE()), DATEADD(day, 90, CONVERT(date, GETDATE())), N'Hiệu lực');
        `);

        await purgeExtraCashier(pool);
        console.log('--- HOÀN TẤT TẠO DỮ LIỆU ---');
        process.exit(0);

    } catch (err) {
        console.error('❌ Lỗi: ', err);
        process.exit(1);
    }
}

seedData();
