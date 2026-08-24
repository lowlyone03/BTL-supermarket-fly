require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const categories = [
    ['DM01', 'Thực phẩm khô', 'Gạo, mì, đồ hộp và thực phẩm đóng gói'],
    ['DM02', 'Đồ uống', 'Nước uống và đồ uống đóng chai'],
    ['DM03', 'Hóa phẩm', 'Sản phẩm giặt rửa và chăm sóc gia đình'],
    ['DM04', 'Chăm sóc cá nhân', 'Sản phẩm vệ sinh và chăm sóc cá nhân']
];

const products = [
    ['SP001', 'DM01', 'Gạo ST25 túi 5 kg', 'Túi', '8938505974192', 145000, 169000, 30, 12, 18],
    ['SP002', 'DM03', 'Nước giặt Ariel 3.2 kg', 'Túi', '8934868162948', 168000, 205000, 18, 4, 14],
    ['SP003', 'DM03', 'Dầu ăn Simply 5 L', 'Can', '8934988010018', 238000, 279000, 20, 9, 0],
    ['SP004', 'DM01', 'Mì Hảo Hảo tôm chua cay thùng 30 gói', 'Thùng', '8934563138169', 98000, 118000, 15, 22, 0],
    ['SP005', 'DM02', 'Nước khoáng Lavie 500 ml thùng 24 chai', 'Thùng', '8935049500184', 72000, 89000, 12, 12, 0],
    ['SP006', 'DM04', 'Dầu gội Clear bạc hà 630 g', 'Chai', '8934868171148', 142000, 179000, 10, 16, 0],
    ['SP007', 'DM04', 'Kem đánh răng P/S 180 g', 'Tuýp', '8934868011222', 32000, 42000, 25, 31, 0],
    ['SP008', 'DM01', 'Sữa đặc Ông Thọ 380 g', 'Lon', '8934673101033', 24500, 31500, 20, 0, 24]
];

async function prepare() {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        await new sql.Request(transaction).query(`
            IF COL_LENGTH('ChiTietDeNghi', 'SLTonThucTe') IS NULL
                ALTER TABLE ChiTietDeNghi ADD SLTonThucTe int NULL;

            IF NOT EXISTS (SELECT 1 FROM Kho WHERE MaKho='KHO_HN01')
                INSERT INTO Kho (MaKho,TenKho,DiaChi,TrangThai)
                VALUES ('KHO_HN01',N'Kho cửa hàng Hà Nội',N'Supermarket Fly · Hà Nội',1);
            ELSE
                UPDATE Kho SET TenKho=N'Kho cửa hàng Hà Nội',DiaChi=N'Supermarket Fly · Hà Nội',TrangThai=1
                WHERE MaKho='KHO_HN01';
        `);

        for (const [id, name, description] of categories) {
            await new sql.Request(transaction)
                .input('MaDM', sql.VarChar, id)
                .input('TenDM', sql.NVarChar, name)
                .input('MoTa', sql.NVarChar, description)
                .query(`IF NOT EXISTS (SELECT 1 FROM DanhMuc WHERE MaDM=@MaDM)
                            INSERT INTO DanhMuc(MaDM,TenDM,MoTa,TrangThai) VALUES(@MaDM,@TenDM,@MoTa,1);
                        ELSE UPDATE DanhMuc SET TenDM=@TenDM,MoTa=@MoTa,TrangThai=1 WHERE MaDM=@MaDM;`);
        }

        for (const [id, category, name, unit, barcode, cost, price, minimum, stock, ordered] of products) {
            await new sql.Request(transaction)
                .input('MaSP', sql.VarChar, id)
                .input('MaDM', sql.VarChar, category)
                .input('TenSP', sql.NVarChar, name)
                .input('DonViTinh', sql.NVarChar, unit)
                .input('MaVach', sql.VarChar, barcode)
                .input('GiaNhap', sql.Decimal(18, 2), cost)
                .input('GiaBan', sql.Decimal(18, 2), price)
                .input('TonKhoToiThieu', sql.Int, minimum)
                .query(`IF NOT EXISTS (SELECT 1 FROM SanPham WHERE MaSP=@MaSP)
                            INSERT INTO SanPham(MaSP,MaDM,TenSP,DonViTinh,MaVach,GiaNhap,GiaBan,TonKhoToiThieu,TrangThai)
                            VALUES(@MaSP,@MaDM,@TenSP,@DonViTinh,@MaVach,@GiaNhap,@GiaBan,@TonKhoToiThieu,N'Đang kinh doanh');
                        ELSE UPDATE SanPham SET MaDM=@MaDM,TenSP=@TenSP,DonViTinh=@DonViTinh,MaVach=@MaVach,
                            GiaNhap=@GiaNhap,GiaBan=@GiaBan,TonKhoToiThieu=@TonKhoToiThieu,TrangThai=N'Đang kinh doanh'
                            WHERE MaSP=@MaSP;`);
            await new sql.Request(transaction)
                .input('MaSP', sql.VarChar, id)
                .input('SLTon', sql.Int, stock)
                .input('SLDatMua', sql.Int, ordered)
                .input('DonGia', sql.Decimal(18, 2), cost)
                .query(`IF NOT EXISTS (SELECT 1 FROM TonKho WHERE MaKho='KHO_HN01' AND MaSP=@MaSP)
                            INSERT INTO TonKho(MaKho,MaSP,SLTon,SLDatMua,DonGiaBinhQuan,GiaTriTon,NgayCapNhat)
                            VALUES('KHO_HN01',@MaSP,@SLTon,@SLDatMua,@DonGia,@SLTon*@DonGia,GETDATE());`);
        }

        await transaction.commit();
        console.log(`Đã chuẩn bị Kho Hà Nội và ${products.length} mặt hàng cho giai đoạn UC15–UC16.`);
        await pool.close();
    } catch (error) {
        await transaction.rollback().catch(() => {});
        console.error(error);
        process.exitCode = 1;
    }
}

prepare();
