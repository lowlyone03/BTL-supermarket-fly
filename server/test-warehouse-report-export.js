const assert = require('node:assert/strict');

global.window = {};
global.document = {
  createElement: () => ({ click() {}, style: {} }),
  body: { appendChild() {} }
};

require('../desktop/src/pages/shared/print-documents.js');
require('../desktop/src/pages/shared/warehouse-export.js');
require('../desktop/src/pages/shared/warehouse-xlsx.js');
require('../desktop/src/pages/shared/warehouse-report-ui.js');

const { compactSnapshot } = require('./src/services/warehouseReportSnapshot');

const report = {
  period: { periodType: 'month', period: '2026-09', label: 'Tháng 09/2026', from: '2026-09-01', to: '2026-09-30' },
  movement: { SoLuongDauKy: 100, SoLuongNhap: 20, SoLuongXuat: 8, DieuChinhRong: 0, SoLuongCuoiKy: 112 },
  stock: { TongTon: 112, GiaTriTon: 2500000, TonThap: 2, HetHang: 0 },
  documents: { SoPhieuNhap: 1, SoPhieuXuat: 6, SoKiemKe: 1 },
  hangRoiKhoBan: {
    summary: { SLHuy: 10, GiaTriHuy: 200000, SLTanDung: 2, GiaTriTanDung: 40000, SLDoiTraLoaiBo: 4, GiaTriDoiTraLoaiBo: 80000, TongSoLuong: 12, TongGiaTri: 240000, SoPhieu: 3, SoMatHang: 2 },
    lines: [
      { MaPX: 'PX20260908001', NgayXuat: '2026-09-08', LoaiXuat: 'Hủy hàng', MaKK: 'KK20260908001', MaSP: 'BK002', TenSP: 'Bánh', DonViTinh: 'gói', SoLuong: 6, DonGia: 20000, GiaTri: 120000, PhanLoai: 'Hủy từ kiểm kê', Nguon: 'Kiểm kê', AnhHuongTon: 'Đã giảm tồn' },
      { MaPX: 'PX20260908002', NgayXuat: '2026-09-08', LoaiXuat: 'Sử dụng nội bộ', MaSP: 'BK002', TenSP: 'Bánh', SoLuong: 2, DonGia: 20000, GiaTri: 40000 },
      { MaPX: 'PX20260908003', NgayXuat: '2026-09-08', LoaiXuat: 'Hủy hàng', MaDT: 'DT20260908001', MaSP: 'BK002', TenSP: 'Bánh', SoLuong: 4, DonGia: 20000, GiaTri: 80000 }
    ]
  },
  lowStock: [{ MaSP: 'SP1', TenSP: 'Sữa', DonViTinh: 'hộp', SLTon: 1, TonKhoToiThieu: 5 }],
  daily: [{ Ngay: '2026-09-08', SoLuongNhap: 20, SoLuongXuat: 8, DieuChinhRong: 0, TonCuoiNgay: 112, SoChungTuNhap: 1, SoChungTuXuat: 3 }],
  recentDocuments: [{ MaChungTu: 'PX20260908001', LoaiChungTu: 'Phiếu xuất', NgayChungTu: '2026-09-08', NguoiLap: 'Long', TrangThai: 'Đã xác nhận', GiaTri: 120000 }],
  doiTra: {
    summary: { SoPhieu: 1, SoHoanTien: 1, SoDoiHang: 0, TienHoan: 15000, KhongNhapLai: 1 },
    tickets: [{ MaDT: 'DT20260908001', MaHD: 'HD1', TenKH: 'A', HinhThucXuLy: 'Hoàn tiền', LyDo: 'Hỏng', SoTienHoan: 15000, TrangThai: 'Hoàn thành', BuocCanXuLy: 'Loại bỏ / vứt', NguoiLap: 'TN', NguoiKiemTra: 'TK', NguoiDuyet: 'QL' }],
    products: [{ MaSP: 'BK002', TenSP: 'Bánh', SLTra: 4, SLNhapLai: 0, SLLoaiBo: 4, LyDoMau: 'Hỏng' }]
  }
};

const test = (name, run) => {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
};

const exp = window.FLY_WAREHOUSE_EXPORT;
const ui = window.FLY_WAREHOUSE_REPORT;

test('Phân loại hủy / tận dụng / đổi trả trên giao diện', () => {
  assert.equal(exp.writeoffKind({ LoaiXuat: 'Sử dụng nội bộ' }), 'reuse');
  assert.equal(exp.writeoffKind({ LoaiXuat: 'Hủy hàng', MaDT: 'DT1' }), 'return');
  assert.equal(exp.writeoffKind({ LoaiXuat: 'Hủy hàng', MaKK: 'KK1' }), 'scrap');
  const split = exp.writeoffSplit(report.hangRoiKhoBan.summary);
  assert.equal(split.slScrap, 6);
  assert.equal(split.gtScrap, 120000);
  assert.equal(split.slReturn, 4);
});

test('CSV chuẩn DN có quốc hiệu, kỳ, mục và chữ ký', () => {
  const csv = exp.buildEnterpriseCsv(report, { number: 'BCK20260909001', preparedBy: 'Lê Đức Long' });
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
  assert.match(csv, /Báo cáo Thủ kho/);
  assert.match(csv, /BCK20260909001/);
  assert.match(csv, /Tháng 09\/2026/);
  assert.match(csv, /I\. TỔNG HỢP NHẬP – XUẤT – TỒN/);
  assert.match(csv, /III\. CHI TIẾT HÀNG ĐÃ XUẤT/);
  assert.match(csv, /PX20260908001/);
  assert.match(csv, /BIỂU ĐỒ CƠ CẤU/);
  assert.match(csv, /CHI TIẾT THEO NGÀY CÓ PHÁT SINH/);
  assert.match(csv, /VIII\. XÁC NHẬN/);
  assert.match(csv, /Lê Đức Long/);
  assert.doesNotMatch(csv, /undefined|NaN/);
});

test('Nhãn kỳ không bị vỡ chữ Tháng', () => {
  assert.equal(exp.formatPeriodLabel('month', '2026-09', 'Thng 09/2026'), 'Tháng 09/2026');
  assert.equal(exp.formatPeriodLabel('day', '2026-09-08'), 'Ngày 08/09/2026');
});

test('Excel .xlsx có biểu đồ tròn, biểu đồ cột và định dạng số', () => {
  const bytes = exp.buildXlsx(report, { number: 'BCK20260909001', preparedBy: 'Lê Đức Long' });
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = Buffer.from(bytes).toString('utf8');
  assert.match(text, /09-Bieu do/);
  assert.match(text, /c:pieChart/);
  assert.match(text, /c:barChart/);
  assert.match(text, /PX20260908001/);
  assert.match(text, /BÁO CÁO TỔNG HỢP KHO/);
  assert.doesNotMatch(text, /undefined|NaN/);
});

test('Excel SpreadsheetML có sheet biểu đồ, cột rộng và định dạng số', () => {
  const xml = exp.buildWorkbookXml(report, { number: 'BCK20260909001', preparedBy: 'Lê Đức Long' });
  assert.match(xml, /Excel\.Sheet/);
  assert.match(xml, /ss:Name="01-Bia"/);
  assert.match(xml, /ss:Name="03-Hang da xuat"/);
  assert.match(xml, /ss:Name="08-Chung tu"/);
  assert.match(xml, /ss:Name="09-Bieu do"/);
  assert.match(xml, /ss:Width="36"/);
  assert.match(xml, /sBarScrap/);
  assert.match(xml, /ss:Format="#,##0"/);
  assert.match(xml, /BÁO CÁO TỔNG HỢP KHO/);
  assert.match(xml, /PX20260908001/);
  assert.doesNotMatch(xml, /undefined|NaN/);
});

test('Bản in tổng kho có NXT, hàng đã xuất và hai chữ ký', () => {
  const config = ui.buildPrintConfig(report, { number: 'BCK20260909001', preparedBy: 'Lê Đức Long' });
  assert.equal(config.orientation, 'landscape');
  assert.match(config.title, /TỔNG HỢP KHO/);
  const html = window.FLY_PRINT.build(config);
  assert.match(html, /BÁO CÁO TỔNG HỢP KHO/);
  assert.match(html, /Hàng đã xuất — không còn bán/);
  assert.match(html, /Tồn thấp — ưu tiên bổ sung/);
  assert.match(html, /Thủ kho lập báo cáo/);
  const official = window.FLY_PRINT.build({ ...config, skin: 'official' });
  assert.match(official, /Times New Roman/);
  assert.match(official, /Giấy trắng mực đen|CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('Telegram gửi Quản lý đủ nội dung báo cáo kho', () => {
  const tg = require('./src/services/warehouseReportTelegram');
  const header = {
    MaBC: 'BCK20260909001', LoaiKy: 'month', GiaTriKy: '2026-09', NhanKy: 'Tháng 09/2026',
    TenNV_Lap: 'Lê Đức Long', NgayNop: '2026-09-09T04:21:00+07:00', GhiChu: 'Đã xuất hàng hủy kiểm kê'
  };
  const text = tg.buildWarehouseReportText(header, report, { mode: 'push', lang: 'vi' });
  assert.match(text, /THỦ KHO VỪA GỬI BÁO CÁO KHO/);
  assert.match(text, /BCK20260909001/);
  assert.match(text, /Tháng 09\/2026/);
  assert.match(text, /NHẬP – XUẤT – TỒN/);
  assert.match(text, /HÀNG ĐÃ XUẤT/);
  assert.match(text, /Hủy hàng/);
  assert.match(text, /PX20260908001/);
  assert.match(text, /TỒN THẤP/);
  assert.match(text, /ĐỔI TRẢ/);
  assert.doesNotMatch(text, /undefined|NaN/);
  assert.equal(tg.writeoffSplit(report.hangRoiKhoBan.summary).slScrap, 6);
});

test('Ảnh chụp gửi Quản lý không kèm trường thừa', () => {
  const snap = compactSnapshot({ ...report, latestActivity: { month: '2026-09' }, inventoryByCategory: [{ MaDM: 'x' }] });
  assert.ok(snap.period);
  assert.ok(snap.hangRoiKhoBan.lines.length);
  assert.equal(snap.latestActivity, undefined);
  assert.equal(snap.inventoryByCategory, undefined);
});

console.log('warehouse-report-export: ok');
