'use strict';

const { sql } = require('../config/db');

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => new sql.Request(connection).query(text);

const ACTIVE_VOUCHER_APPLY = `
    OUTER APPLY (
        SELECT TOP 1 pc.*
        FROM dbo.PhieuChi pc
        WHERE pc.MaCongNo = cn.MaCNPTra
        ORDER BY CASE
            WHEN pc.TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Thanh toán thất bại') THEN 0
            WHEN pc.TrangThai = N'Từ chối' THEN 1
            ELSE 2 END,
            pc.NgayChungTu DESC, pc.MaPhieu DESC
    ) pc`;

const EXTENSION_APPLY = `
    OUTER APPLY (
        SELECT TOP 1 g.TrangThai AS TrangThaiGiaHan, g.HanMoi AS HanMoiGiaHan, g.HanCu AS HanCuGiaHan
        FROM dbo.CongNoGiaHan g
        WHERE g.MaCNPTra = cn.MaCNPTra
        ORDER BY g.MaGiaHan DESC
    ) gh`;

const DEBT_STATUS_SQL = `
    CASE
        WHEN cn.SoTienConLai = 0 THEN N'Đã thanh toán'
        WHEN DATEDIFF(day, cn.HanThanhToan, CONVERT(date, GETDATE())) >= 45 THEN N'Quá hạn'
        WHEN cn.HanThanhToan < CONVERT(date, GETDATE()) THEN N'Quá hạn'
        WHEN cn.SoTienDaTra > 0 THEN N'Thanh toán một phần'
        ELSE N'Chưa thanh toán'
    END`;

const dropUniqueOnCongNo = async (connection) => {
    await run(connection, `
        DECLARE @sql NVARCHAR(MAX) = N'';
        SELECT @sql = @sql + N'ALTER TABLE dbo.PhieuChi DROP CONSTRAINT [' + kc.name + N'];'
        FROM sys.key_constraints kc
        WHERE kc.parent_object_id = OBJECT_ID(N'dbo.PhieuChi')
          AND kc.[type] = 'UQ'
          AND EXISTS (
              SELECT 1
              FROM sys.index_columns ic
              JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = kc.parent_object_id
                AND ic.index_id = kc.unique_index_id
                AND c.name = N'MaCongNo'
          );
        IF @sql <> N'' EXEC sp_executesql @sql;`);
    await run(connection, `
        DECLARE @sql NVARCHAR(MAX) = N'';
        SELECT @sql = @sql + N'DROP INDEX [' + i.name + N'] ON dbo.PhieuChi;'
        FROM sys.indexes i
        WHERE i.object_id = OBJECT_ID(N'dbo.PhieuChi')
          AND i.is_unique = 1
          AND i.is_primary_key = 0
          AND i.is_unique_constraint = 0
          AND EXISTS (
              SELECT 1
              FROM sys.index_columns ic
              JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id
                AND ic.index_id = i.index_id
                AND c.name = N'MaCongNo'
          );
        IF @sql <> N'' EXEC sp_executesql @sql;`);
};

const ensurePayablePaymentSchema = async (connection) => {
    if (!connection) return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await dropUniqueOnCongNo(connection);
        await run(connection, `
            IF COL_LENGTH(N'dbo.PhieuChi', N'LoaiThanhToan') IS NULL
                ALTER TABLE dbo.PhieuChi ADD LoaiThanhToan NVARCHAR(20) NULL;
            IF COL_LENGTH(N'dbo.PhieuChi', N'PhanTram') IS NULL
                ALTER TABLE dbo.PhieuChi ADD PhanTram DECIMAL(9, 4) NULL;`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.PhieuChi', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_PhieuChi_MaCongNo' AND object_id = OBJECT_ID(N'dbo.PhieuChi')
               )
                CREATE INDEX IX_PhieuChi_MaCongNo ON dbo.PhieuChi (MaCongNo, TrangThai, NgayChungTu DESC);`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.CongNoGiaHan', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.CongNoGiaHan (
                    MaGiaHan     INT IDENTITY(1,1) NOT NULL,
                    MaCNPTra     VARCHAR(20)   NOT NULL,
                    MaNCC        VARCHAR(20)   NULL,
                    MaNV_YeuCau  VARCHAR(20)   NOT NULL,
                    MaNV_XuLy    VARCHAR(20)   NULL,
                    NgayYeuCau   DATETIME      NOT NULL CONSTRAINT DF_CNGH_YeuCau DEFAULT GETDATE(),
                    HanCu        DATE          NULL,
                    HanMoi       DATE          NULL,
                    SoNgayThem   INT           NULL,
                    TrangThai    NVARCHAR(30)  NOT NULL CONSTRAINT DF_CNGH_TT DEFAULT N'ChoLienHe',
                    GhiChu       NVARCHAR(500) NULL,
                    MaPhongChat  VARCHAR(40)   NULL,
                    MaTin        BIGINT        NULL,
                    CONSTRAINT PK_CongNoGiaHan PRIMARY KEY (MaGiaHan)
                );
            END`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

module.exports = {
    ensurePayablePaymentSchema,
    ACTIVE_VOUCHER_APPLY,
    EXTENSION_APPLY,
    DEBT_STATUS_SQL
};
