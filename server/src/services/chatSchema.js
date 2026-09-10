'use strict';

const { ROOM_SEED } = require('./chatPolicy');

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => {
    if (!connection || typeof connection.request !== 'function') {
        throw new Error('Chat schema: thiếu connection');
    }
    return connection.request().query(text);
};

const resetChatSchemaCache = () => {
    schemaReady = false;
    schemaPromise = null;
};

const seedRoomsSql = () => ROOM_SEED.map((room) => `
    IF NOT EXISTS (SELECT 1 FROM dbo.PhongChat WHERE MaPhong = N'${room.MaPhong}')
    BEGIN
        INSERT INTO dbo.PhongChat (MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, MoTa)
        SELECT N'${room.MaPhong}', N'${room.Khoa}', N'${room.TenPhong}', N'${room.LoaiPhong}',
               ${room.VaiTroNeo ? `(SELECT TOP 1 MaVaiTro FROM dbo.VaiTro WHERE TenVaiTro = N'${room.VaiTroNeo}')` : 'NULL'},
               N'Kênh nội bộ ${room.TenPhong}';
    END`).join('\n');

const ensureChatSchema = async (connection) => {
    if (!connection) return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF OBJECT_ID(N'dbo.PhongChat', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.PhongChat (
                    MaPhong      VARCHAR(40)   NOT NULL,
                    Khoa         VARCHAR(40)   NOT NULL,
                    TenPhong     NVARCHAR(100) NOT NULL,
                    LoaiPhong    NVARCHAR(20)  NOT NULL,
                    MaVaiTro     INT           NULL,
                    MoTa         NVARCHAR(200) NULL,
                    NgayTao      DATETIME      NOT NULL CONSTRAINT DF_PhongChat_NgayTao DEFAULT GETDATE(),
                    TrangThai    NVARCHAR(20)  NOT NULL CONSTRAINT DF_PhongChat_TT DEFAULT N'DangMo',
                    CONSTRAINT PK_PhongChat PRIMARY KEY (MaPhong),
                    CONSTRAINT CK_PhongChat_Loai CHECK (LoaiPhong IN (N'KenhChung', N'KenhVaiTro', N'DM', N'Nhom')),
                    CONSTRAINT CK_PhongChat_TT CHECK (TrangThai IN (N'DangMo', N'Dong'))
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.PhongChat', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.VaiTro', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhongChat_VaiTro')
                ALTER TABLE dbo.PhongChat ADD CONSTRAINT FK_PhongChat_VaiTro
                    FOREIGN KEY (MaVaiTro) REFERENCES dbo.VaiTro (MaVaiTro);`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.PhongChat', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_PhongChat_Khoa' AND object_id = OBJECT_ID(N'dbo.PhongChat')
               )
                CREATE UNIQUE INDEX UX_PhongChat_Khoa ON dbo.PhongChat (Khoa);`);

        await run(connection, `
            IF OBJECT_ID(N'dbo.ThanhVienPhongChat', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ThanhVienPhongChat (
                    MaPhong      VARCHAR(40) NOT NULL,
                    MaNV         VARCHAR(20) NOT NULL,
                    NgayVao      DATETIME    NOT NULL CONSTRAINT DF_TVPC_NgayVao DEFAULT GETDATE(),
                    AnKhoiPhong  BIT         NOT NULL CONSTRAINT DF_TVPC_An DEFAULT (0),
                    CONSTRAINT PK_ThanhVienPhongChat PRIMARY KEY (MaPhong, MaNV),
                    CONSTRAINT FK_TVPC_Phong FOREIGN KEY (MaPhong) REFERENCES dbo.PhongChat (MaPhong),
                    CONSTRAINT FK_TVPC_NV    FOREIGN KEY (MaNV)    REFERENCES dbo.NhanVien (MaNV)
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.ThanhVienPhongChat', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_TVPC_NV' AND object_id = OBJECT_ID(N'dbo.ThanhVienPhongChat')
               )
                CREATE INDEX IX_TVPC_NV ON dbo.ThanhVienPhongChat (MaNV, AnKhoiPhong) INCLUDE (MaPhong);`);

        await run(connection, `
            IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.TinNhan (
                    MaTin         BIGINT IDENTITY(1,1) NOT NULL,
                    MaPhong       VARCHAR(40)    NOT NULL,
                    MaNV_Gui      VARCHAR(20)    NOT NULL,
                    TenNV_Gui     NVARCHAR(100)  NOT NULL,
                    TenVaiTro_Gui NVARCHAR(50)   NOT NULL,
                    NoiDung       NVARCHAR(1000) NOT NULL,
                    LoaiTin       NVARCHAR(20)   NOT NULL CONSTRAINT DF_TinNhan_Loai DEFAULT N'VanBan',
                    DuongDanFile  NVARCHAR(260)  NULL,
                    TenFile       NVARCHAR(200)  NULL,
                    MimeFile      VARCHAR(80)    NULL,
                    DungLuong     INT            NULL,
                    LoaiChungTu   NVARCHAR(40)   NULL,
                    MaChungTu     VARCHAR(40)    NULL,
                    NgayGui       DATETIME       NOT NULL CONSTRAINT DF_TinNhan_NgayGui DEFAULT GETDATE(),
                    DaXoa         BIT            NOT NULL CONSTRAINT DF_TinNhan_Xoa DEFAULT (0),
                    CONSTRAINT PK_TinNhan PRIMARY KEY (MaTin),
                    CONSTRAINT CK_TinNhan_Loai CHECK (LoaiTin IN (N'VanBan', N'HeThong', N'Anh', N'File', N'ChungTu')),
                    CONSTRAINT FK_TinNhan_Phong FOREIGN KEY (MaPhong) REFERENCES dbo.PhongChat (MaPhong),
                    CONSTRAINT FK_TinNhan_Gui   FOREIGN KEY (MaNV_Gui) REFERENCES dbo.NhanVien (MaNV)
                );
            END`);
        await run(connection, `
            IF COL_LENGTH(N'dbo.TinNhan', N'DuongDanFile') IS NULL
                ALTER TABLE dbo.TinNhan ADD DuongDanFile NVARCHAR(260) NULL;`);
        await run(connection, `
            IF COL_LENGTH(N'dbo.TinNhan', N'TenFile') IS NULL
                ALTER TABLE dbo.TinNhan ADD TenFile NVARCHAR(200) NULL;`);
        await run(connection, `
            IF COL_LENGTH(N'dbo.TinNhan', N'MimeFile') IS NULL
                ALTER TABLE dbo.TinNhan ADD MimeFile VARCHAR(80) NULL;`);
        await run(connection, `
            IF COL_LENGTH(N'dbo.TinNhan', N'DungLuong') IS NULL
                ALTER TABLE dbo.TinNhan ADD DungLuong INT NULL;`);
        await run(connection, `
            IF COL_LENGTH(N'dbo.TinNhan', N'LoaiChungTu') IS NULL
                ALTER TABLE dbo.TinNhan ADD LoaiChungTu NVARCHAR(40) NULL;`);
        await run(connection, `
            IF COL_LENGTH(N'dbo.TinNhan', N'MaChungTu') IS NULL
                ALTER TABLE dbo.TinNhan ADD MaChungTu VARCHAR(40) NULL;`);
        await run(connection, `
            IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_TinNhan_Loai')
                ALTER TABLE dbo.TinNhan DROP CONSTRAINT CK_TinNhan_Loai;
            ALTER TABLE dbo.TinNhan ADD CONSTRAINT CK_TinNhan_Loai
                CHECK (LoaiTin IN (N'VanBan', N'HeThong', N'Anh', N'File', N'ChungTu'));`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_TinNhan_PhongNgay' AND object_id = OBJECT_ID(N'dbo.TinNhan')
               )
                CREATE INDEX IX_TinNhan_PhongNgay ON dbo.TinNhan (MaPhong, NgayGui DESC) INCLUDE (MaTin, DaXoa);`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_TinNhan_PhongTin' AND object_id = OBJECT_ID(N'dbo.TinNhan')
               )
                CREATE INDEX IX_TinNhan_PhongTin ON dbo.TinNhan (MaPhong, MaTin);`);

        await run(connection, `
            IF OBJECT_ID(N'dbo.TinNhanDaDoc', N'U') IS NULL
            BEGIN
                -- MaTinCuoi = watermark đã đọc, KHÔNG phải FK tới TinNhan còn sống.
                -- Cleanup 90 ngày xóa tin cũ; watermark < MIN(MaTin) vẫn đúng unread (MaTin > MaTinCuoi).
                CREATE TABLE dbo.TinNhanDaDoc (
                    MaPhong      VARCHAR(40) NOT NULL,
                    MaNV         VARCHAR(20) NOT NULL,
                    MaTinCuoi    BIGINT      NOT NULL CONSTRAINT DF_TNDD_Tin DEFAULT (0),
                    NgayDoc      DATETIME    NOT NULL CONSTRAINT DF_TNDD_Ngay DEFAULT GETDATE(),
                    CONSTRAINT PK_TinNhanDaDoc PRIMARY KEY (MaPhong, MaNV),
                    CONSTRAINT FK_TNDD_Phong FOREIGN KEY (MaPhong) REFERENCES dbo.PhongChat (MaPhong),
                    CONSTRAINT FK_TNDD_NV    FOREIGN KEY (MaNV)    REFERENCES dbo.NhanVien (MaNV)
                );
            END`);

        await run(connection, seedRoomsSql());
        await purgeOldMessages(connection);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

const purgeOldMessages = async (connection) => {
    if (!connection) return { deleted: 0 };
    const result = await run(connection, `
        IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NULL
            SELECT 0 AS Deleted;
        ELSE
        BEGIN
            DELETE FROM dbo.TinNhan
            WHERE NgayGui < DATEADD(DAY, -90, GETDATE())
              AND LoaiTin <> N'HeThong';
            SELECT @@ROWCOUNT AS Deleted;
        END`);
    const rows = result.recordset || [];
    return { deleted: Number(rows[rows.length - 1]?.Deleted || 0) };
};

module.exports = {
    ensureChatSchema,
    resetChatSchemaCache,
    purgeOldMessages
};
