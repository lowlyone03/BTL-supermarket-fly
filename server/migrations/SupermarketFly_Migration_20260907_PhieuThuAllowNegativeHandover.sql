/* Phiếu thu: TM hệ thống / thực nộp có thể âm khi hoàn TM > thu TM trong ca
   (đổi trả hóa đơn ca trước, ca tồn đọng chỉ hoàn tiền). Idempotent.
   Giữ CK_PhieuThu_1 (lệch phải có lý do). */
USE SupermarketFlyDB;
GO

DECLARE @sql nvarchar(max) = N'';
SELECT @sql = @sql + N'ALTER TABLE dbo.PhieuThu DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';'
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID(N'dbo.PhieuThu')
  AND cc.name <> N'CK_PhieuThu_1'
  AND (
        cc.definition LIKE N'%SoTienTheoHeThong%'
     OR cc.definition LIKE N'%SoTienThucNop%'
  )
  AND (
        cc.definition LIKE N'%(0)%'
     OR cc.definition LIKE N'%>%='
  );

IF @sql <> N'' EXEC sp_executesql @sql;
GO
