const { sql } = require('../config/db');

const requestOf = (connection) => (
    typeof connection.request === 'function' ? connection.request() : new sql.Request(connection)
);

let ready = false;
let pending = null;

const ensureReturnRefundSchema = async (connection) => {
    if (ready) return;
    if (pending) return pending;
    pending = (async () => {
        await requestOf(connection).query(`
            IF COL_LENGTH(N'dbo.CaLamViec', N'TongTienHoanQR') IS NULL
                ALTER TABLE dbo.CaLamViec ADD TongTienHoanQR DECIMAL(18,2) NULL;
            IF COL_LENGTH(N'dbo.PhieuDoiTra', N'SoTienThuThem') IS NULL
                ALTER TABLE dbo.PhieuDoiTra ADD SoTienThuThem DECIMAL(18,2) NOT NULL
                    CONSTRAINT DF_PhieuDoiTra_SoTienThuThem DEFAULT 0;
            IF COL_LENGTH(N'dbo.PhieuDoiTra', N'PhuongThucThuThem') IS NULL
                ALTER TABLE dbo.PhieuDoiTra ADD PhuongThucThuThem NVARCHAR(30) NULL;
            IF COL_LENGTH(N'dbo.PhieuDoiTra', N'MaThamChieuThuThem') IS NULL
                ALTER TABLE dbo.PhieuDoiTra ADD MaThamChieuThuThem VARCHAR(50) NULL;
            IF OBJECT_ID(N'dbo.GiaoDichHoan', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.GiaoDichHoan (
                    MaGiaoDichHoan VARCHAR(20) NOT NULL,
                    MaPhieuTra VARCHAR(20) NOT NULL,
                    MaHD VARCHAR(20) NULL,
                    PhuongThuc NVARCHAR(30) NULL,
                    ZpTransIdGoc VARCHAR(50) NULL,
                    MRefundId VARCHAR(45) NULL,
                    RefundId VARCHAR(50) NULL,
                    SoTienHoan DECIMAL(18,2) NOT NULL,
                    TrangThaiHoan VARCHAR(20) NOT NULL,
                    MaLoi NVARCHAR(50) NULL,
                    NoiDungLoi NVARCHAR(500) NULL,
                    NgayYeuCau DATETIME NOT NULL CONSTRAINT DF_GiaoDichHoan_NgayYeuCau DEFAULT GETDATE(),
                    NgayHoanThanh DATETIME NULL,
                    CONSTRAINT PK_GiaoDichHoan PRIMARY KEY (MaGiaoDichHoan)
                );
            END
            IF COL_LENGTH(N'dbo.GiaoDichHoan', N'MaHD') IS NULL
                ALTER TABLE dbo.GiaoDichHoan ADD MaHD VARCHAR(20) NULL;
            IF COL_LENGTH(N'dbo.GiaoDichHoan', N'PhuongThuc') IS NULL
                ALTER TABLE dbo.GiaoDichHoan ADD PhuongThuc NVARCHAR(30) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GiaoDichHoan_MaPhieuTra'
                           AND object_id = OBJECT_ID(N'dbo.GiaoDichHoan'))
                CREATE INDEX IX_GiaoDichHoan_MaPhieuTra ON dbo.GiaoDichHoan (MaPhieuTra);
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GiaoDichHoan_MaHD'
                           AND object_id = OBJECT_ID(N'dbo.GiaoDichHoan'))
                CREATE INDEX IX_GiaoDichHoan_MaHD ON dbo.GiaoDichHoan (MaHD);`);
        await requestOf(connection).query(`
            IF COL_LENGTH(N'dbo.GiaoDichHoan', N'ZpTransIdGoc') IS NOT NULL
                ALTER TABLE dbo.GiaoDichHoan ALTER COLUMN ZpTransIdGoc VARCHAR(50) NULL;
            IF COL_LENGTH(N'dbo.GiaoDichHoan', N'MRefundId') IS NOT NULL
                ALTER TABLE dbo.GiaoDichHoan ALTER COLUMN MRefundId VARCHAR(45) NULL;`);
        await requestOf(connection).query(`
            IF EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'UX_GiaoDichHoan_MRefundId'
                  AND object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
                  AND is_unique = 1
            )
            BEGIN
                DROP INDEX UX_GiaoDichHoan_MRefundId ON dbo.GiaoDichHoan;
            END
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'UX_GiaoDichHoan_MRefundId'
                  AND object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
            )
            BEGIN
                CREATE UNIQUE INDEX UX_GiaoDichHoan_MRefundId
                    ON dbo.GiaoDichHoan (MRefundId)
                    WHERE MRefundId IS NOT NULL;
            END
            UPDATE gd SET
                gd.PhuongThuc = COALESCE(gd.PhuongThuc, N'QR'),
                gd.MaHD = COALESCE(gd.MaHD, dt.MaHD)
            FROM dbo.GiaoDichHoan gd
            JOIN dbo.PhieuDoiTra dt ON dt.MaDT = gd.MaPhieuTra
            WHERE gd.PhuongThuc IS NULL OR gd.MaHD IS NULL;`);
        ready = true;
    })().catch((error) => {
        pending = null;
        throw error;
    });
    return pending;
};

module.exports = { ensureReturnRefundSchema };
