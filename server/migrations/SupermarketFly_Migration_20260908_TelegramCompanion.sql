/* Telegram companion P1: liên kết ChatId ↔ nhân viên + chống spam push.
   Idempotent. Không ALTER CongNoPhaiTra / HoaDon / CaLamViec / TonKho / NhatKy.
   Không tạo TelegramNhatKy — audit dùng NhatKy + logAudit. */
USE SupermarketFlyDB;
GO

IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TelegramDangKy (
        MaNV            VARCHAR(20)  NOT NULL,
        ChatId          VARCHAR(32)  NULL,
        MaTK            INT          NULL,
        Bat             BIT          NOT NULL CONSTRAINT DF_TelegramDangKy_Bat DEFAULT (1),
        NgayDangKy      DATETIME     NOT NULL CONSTRAINT DF_TelegramDangKy_NgayDangKy DEFAULT (GETDATE()),
        NgayXacThuc     DATETIME     NULL,
        LanHoatDongCuoi DATETIME     NULL,
        MaOTP           VARCHAR(6)   NULL,
        HetHanOTP       DATETIME     NULL,
        SoLanSai        INT          NOT NULL CONSTRAINT DF_TelegramDangKy_SoLanSai DEFAULT (0),
        NgoonNgu        NVARCHAR(8)  NULL CONSTRAINT DF_TelegramDangKy_NgoonNgu DEFAULT (N'vi'),
        CONSTRAINT PK_TelegramDangKy PRIMARY KEY (MaNV)
    );
END
GO

IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_TelegramDangKy_ChatId'
          AND object_id = OBJECT_ID(N'dbo.TelegramDangKy')
    )
    CREATE UNIQUE INDEX UX_TelegramDangKy_ChatId
        ON dbo.TelegramDangKy (ChatId)
        WHERE ChatId IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.TelegramDangKy')
          AND name = N'MaOTP'
          AND system_type_id = TYPE_ID(N'char')
    )
    ALTER TABLE dbo.TelegramDangKy ALTER COLUMN MaOTP VARCHAR(6) NULL;
GO

IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NOT NULL
   AND COL_LENGTH('TelegramDangKy','NgoonNgu') IS NULL
    ALTER TABLE dbo.TelegramDangKy ADD NgoonNgu NVARCHAR(8) NULL
        CONSTRAINT DF_TelegramDangKy_NgoonNgu DEFAULT (N'vi');
GO

IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NOT NULL
   AND COL_LENGTH('TelegramDangKy','NgoonNgu') IS NOT NULL
    UPDATE dbo.TelegramDangKy SET NgoonNgu = N'vi' WHERE NgoonNgu IS NULL;
GO

IF OBJECT_ID(N'dbo.TelegramPushLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TelegramPushLog (
        LoaiSuKien  NVARCHAR(50) NOT NULL,
        MaChungTu   VARCHAR(50)  NOT NULL,
        LanGuiCuoi  DATETIME     NOT NULL CONSTRAINT DF_TelegramPushLog_LanGuiCuoi DEFAULT (GETDATE()),
        CONSTRAINT PK_TelegramPushLog PRIMARY KEY (LoaiSuKien, MaChungTu)
    );
END
GO
