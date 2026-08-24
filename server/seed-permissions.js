require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const functions = [
    { MaChucNang: 'UC01', TenChucNang: 'Đăng nhập và sử dụng tài khoản', Nhom: 'Hệ thống' },
    { MaChucNang: 'UC02', TenChucNang: 'Quản lý tài khoản và phân quyền', Nhom: 'Hệ thống' },
    { MaChucNang: 'UC03', TenChucNang: 'Xem nhật ký hệ thống', Nhom: 'Hệ thống' },
    { MaChucNang: 'UC04', TenChucNang: 'Quản lý nhân viên, sản phẩm, khuyến mãi', Nhom: 'Dữ liệu chung' },
    { MaChucNang: 'UC05', TenChucNang: 'Phê duyệt Đơn mua hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC06', TenChucNang: 'Phê duyệt Phiếu xuất kho thủ công', Nhom: 'Kho' },
    { MaChucNang: 'UC07', TenChucNang: 'Phê duyệt điều chỉnh tồn kho', Nhom: 'Kho' },
    { MaChucNang: 'UC08', TenChucNang: 'Phê duyệt đổi trả và hoàn tiền', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC09', TenChucNang: 'Phê duyệt Phiếu chi thanh toán NCC', Nhom: 'Kế toán' },
    { MaChucNang: 'UC10', TenChucNang: 'Xem báo cáo và thống kê tổng hợp', Nhom: 'Báo cáo' },
    { MaChucNang: 'UC11', TenChucNang: 'Quản lý Nhà cung cấp', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC12', TenChucNang: 'Tiếp nhận Phiếu đề nghị mua hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC13', TenChucNang: 'Lập và quản lý Đơn mua hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC14', TenChucNang: 'Theo dõi Đơn mua hàng và giao hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC15', TenChucNang: 'Tra cứu tồn kho và cảnh báo', Nhom: 'Kho' },
    { MaChucNang: 'UC16', TenChucNang: 'Lập Phiếu đề nghị mua hàng', Nhom: 'Kho' },
    { MaChucNang: 'UC17', TenChucNang: 'Tiếp nhận và kiểm tra hàng', Nhom: 'Kho' },
    { MaChucNang: 'UC18', TenChucNang: 'Lập và xác nhận Phiếu nhập kho', Nhom: 'Kho' },
    { MaChucNang: 'UC19', TenChucNang: 'Lập và thực hiện Phiếu xuất kho', Nhom: 'Kho' },
    { MaChucNang: 'UC20', TenChucNang: 'Kiểm kê và xử lý chênh lệch tồn kho', Nhom: 'Kho' },
    { MaChucNang: 'UC21', TenChucNang: 'Kiểm tra hàng khách đổi trả', Nhom: 'Kho' },
    { MaChucNang: 'UC22', TenChucNang: 'Mở và đóng ca bán hàng', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC23', TenChucNang: 'Quản lý thông tin khách hàng', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC24', TenChucNang: 'Lập Hóa đơn bán hàng', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC25', TenChucNang: 'Ghi nhận thanh toán và hoàn thành HĐ', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC26', TenChucNang: 'Tiếp nhận và xử lý yêu cầu đổi trả', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC27', TenChucNang: 'Quản lý HĐ mua hàng và đối chiếu', Nhom: 'Kế toán' },
    { MaChucNang: 'UC28', TenChucNang: 'Theo dõi và thanh toán công nợ NCC', Nhom: 'Kế toán' },
    { MaChucNang: 'UC29', TenChucNang: 'Đối soát doanh thu, lập Phiếu thu', Nhom: 'Kế toán' }
];

async function seedPermissions() {
    try {
        const pool = await poolPromise;
        console.log('--- BẮT ĐẦU SEED CHỨC NĂNG & PHÂN QUYỀN ---');

        // Lấy danh sách Vai trò
        const rolesDb = await pool.request().query('SELECT MaVaiTro, TenVaiTro FROM VaiTro');
        const roleMap = {};
        rolesDb.recordset.forEach(r => {
            roleMap[r.TenVaiTro.toLowerCase().trim()] = r.MaVaiTro;
        });

        // Xóa bộ mã CN_* cũ vì tài liệu đã chốt duy nhất 29 use case UC01-UC29.
        await pool.request().query(`
            DELETE FROM VaiTro_ChucNang WHERE MaChucNang LIKE 'CN[_]%';
            DELETE FROM ChucNang WHERE MaChucNang LIKE 'CN[_]%';
        `);

        // Seed/chuẩn hóa ChucNang
        for (const fn of functions) {
            const check = await pool.request()
                .input('MaChucNang', sql.VarChar, fn.MaChucNang)
                .query('SELECT MaChucNang FROM ChucNang WHERE MaChucNang = @MaChucNang');
            if (check.recordset.length === 0) {
                await pool.request()
                    .input('MaChucNang', sql.VarChar, fn.MaChucNang)
                    .input('TenChucNang', sql.NVarChar, fn.TenChucNang)
                    .input('Nhom', sql.NVarChar, fn.Nhom)
                    .query('INSERT INTO ChucNang (MaChucNang, TenChucNang, Nhom) VALUES (@MaChucNang, @TenChucNang, @Nhom)');
            } else {
                await pool.request()
                    .input('MaChucNang', sql.VarChar, fn.MaChucNang)
                    .input('TenChucNang', sql.NVarChar, fn.TenChucNang)
                    .input('Nhom', sql.NVarChar, fn.Nhom)
                    .query(`UPDATE ChucNang
                            SET TenChucNang = @TenChucNang, Nhom = @Nhom
                            WHERE MaChucNang = @MaChucNang`);
            }
        }
        console.log('+ Đã seed bảng ChucNang (29 Use Cases)');

        // Map VaiTro -> Array of MaChucNang
        const permissions = {
            'quản lý': ['UC01', 'UC02', 'UC03', 'UC04', 'UC05', 'UC06', 'UC07', 'UC08', 'UC09', 'UC10'],
            'nhân viên mua hàng': ['UC01', 'UC11', 'UC12', 'UC13', 'UC14'],
            'thủ kho': ['UC01', 'UC15', 'UC16', 'UC17', 'UC18', 'UC19', 'UC20', 'UC21'],
            'thu ngân': ['UC01', 'UC22', 'UC23', 'UC24', 'UC25', 'UC26'],
            'kế toán': ['UC01', 'UC27', 'UC28', 'UC29']
        };

        // Clear VaiTro_ChucNang
        await pool.request().query('DELETE FROM VaiTro_ChucNang');

        // Insert VaiTro_ChucNang
        for (const [roleName, ucs] of Object.entries(permissions)) {
            const roleId = roleMap[roleName];
            if (roleId) {
                for (const uc of ucs) {
                    await pool.request()
                        .input('MaVaiTro', sql.Int, roleId)
                        .input('MaChucNang', sql.VarChar, uc)
                        .input('DuocPhep', sql.Bit, 1)
                        .query('INSERT INTO VaiTro_ChucNang (MaVaiTro, MaChucNang, DuocPhep) VALUES (@MaVaiTro, @MaChucNang, @DuocPhep)');
                }
            }
        }
        console.log('+ Đã seed bảng VaiTro_ChucNang');

        console.log('--- HOÀN TẤT SEED DỮ LIỆU ---');
        process.exit(0);

    } catch (err) {
        console.error('❌ Lỗi: ', err);
        process.exit(1);
    }
}

seedPermissions();
