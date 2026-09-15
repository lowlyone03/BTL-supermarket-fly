'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

global.window = {};
require('../desktop/src/pages/shared/department-export.js');

const exporter = window.FLY_DEPARTMENT_EXPORT;
const period = { periodType: 'month', period: '2026-09', label: 'Tháng 09/2026', from: '2026-09-01', to: '2026-09-30' };
const meta = { number: 'BC202609001', preparedBy: 'Nguyễn An', staffId: 'NV001', status: 'Đã gửi', note: 'Đã đối chiếu' };

const storedZipEntries = bytes => {
  const buffer = Buffer.from(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.equal(method, 0, 'Regression reader expects stored ZIP entries');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    assert.ok(!entries.has(name), `Duplicate ZIP entry ${name}`);
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
};

const validatePackageShape = (bytes, expectedSheets) => {
  const entries = storedZipEntries(bytes);
  const required = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml'];
  required.forEach(name => assert.ok(entries.has(name), `Missing package part ${name}`));
  expectedSheets.forEach((_, index) => assert.ok(entries.has(`xl/worksheets/sheet${index + 1}.xml`)));
  assert.equal([...entries.keys()].filter(name => name.startsWith('xl/worksheets/sheet')).length, expectedSheets.length);

  const workbook = entries.get('xl/workbook.xml').toString('utf8');
  const relationships = entries.get('xl/_rels/workbook.xml.rels').toString('utf8');
  const contentTypes = entries.get('[Content_Types].xml').toString('utf8');
  const relationshipIds = [...relationships.matchAll(/<Relationship Id="([^"]+)"/g)].map(match => match[1]);
  const partNames = [...contentTypes.matchAll(/<Override PartName="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(relationshipIds).size, relationshipIds.length, 'Duplicate workbook relationship Id');
  assert.equal(new Set(partNames).size, partNames.length, 'Duplicate content-type override');
  expectedSheets.forEach((name, index) => {
    assert.match(workbook, new RegExp(`sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"`));
    assert.match(relationships, new RegExp(`Id="rId${index + 1}"[^>]+Target="worksheets/sheet${index + 1}\\.xml"`));
    assert.match(contentTypes, new RegExp(`PartName="/xl/worksheets/sheet${index + 1}\\.xml"`));
  });

  const forbiddenXmlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
  for (const [name, data] of entries) {
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    const xml = data.toString('utf8');
    assert.doesNotMatch(xml, forbiddenXmlChars, `${name} contains an XML 1.0 forbidden character`);
  }

  for (let index = 1; index <= expectedSheets.length; index += 1) {
    const xml = entries.get(`xl/worksheets/sheet${index}.xml`).toString('utf8');
    const autoFilter = xml.indexOf('<autoFilter');
    const mergeCells = xml.indexOf('<mergeCells');
    assert.ok(autoFilter < 0 || mergeCells < 0 || autoFilter < mergeCells,
      `sheet${index}.xml violates SpreadsheetML order: autoFilter must precede mergeCells`);
    const rowIds = [...xml.matchAll(/<row r="(\d+)"/g)].map(match => Number(match[1]));
    assert.equal(new Set(rowIds).size, rowIds.length, `sheet${index}.xml has duplicate row numbers`);
    assert.deepEqual(rowIds, [...rowIds].sort((a, b) => a - b), `sheet${index}.xml rows are out of order`);
    if (index > 1) assert.match(xml, /<row r="7"/, `sheet${index}.xml is a blank detail sheet`);
  }
  const styles = entries.get('xl/styles.xml').toString('utf8');
  const cellXfs = styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  assert.ok(cellXfs, 'Missing cellXfs style table');
  const styleCount = Number(cellXfs[1]);
  assert.equal((cellXfs[2].match(/<xf\b/g) || []).length, styleCount, 'cellXfs count does not match styles');
  for (let index = 1; index <= expectedSheets.length; index += 1) {
    const xml = entries.get(`xl/worksheets/sheet${index}.xml`).toString('utf8');
    [...xml.matchAll(/<c\b[^>]*\bs="(\d+)"/g)].forEach(match => {
      assert.ok(Number(match[1]) < styleCount, `sheet${index}.xml references missing style ${match[1]}`);
    });
  }
  return entries;
};
const drawingAnchors = entries => {
  const drawing = entries.get('xl/drawings/drawing1.xml')?.toString('utf8') || '';
  return [...drawing.matchAll(/<xdr:twoCellAnchor>([\s\S]*?)<\/xdr:twoCellAnchor>/g)].map(match => {
    const block = match[1];
    const point = tag => {
      const part = block.match(new RegExp(`<xdr:${tag}>([\\s\\S]*?)<\\/xdr:${tag}>`))?.[1] || '';
      return {
        col: Number(part.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]),
        row: Number(part.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1])
      };
    };
    const from = point('from'); const to = point('to');
    return { fromCol: from.col, fromRow: from.row, toCol: to.col, toRow: to.row };
  });
};
const validateNativeCharts = (entries, expected) => {
  const chartParts = [...entries.keys()].filter(name => /^xl\/charts\/chart\d+\.xml$/.test(name)).sort();
  assert.equal(chartParts.length, expected.length, 'Unexpected native Excel chart count');
  if (!expected.length) {
    assert.ok(!entries.has('xl/drawings/drawing1.xml'), 'Workbook without chart data must not contain a drawing');
    return;
  }
  assert.ok(entries.has('xl/worksheets/_rels/sheet1.xml.rels'), 'Cover sheet drawing relationship is missing');
  assert.ok(entries.has('xl/drawings/drawing1.xml'), 'Dashboard drawing is missing');
  assert.ok(entries.has('xl/drawings/_rels/drawing1.xml.rels'), 'Chart relationships are missing');
  const cover = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.match(cover, /<drawing r:id="rId1"\/><\/worksheet>$/, 'Cover drawing must follow header/footer in worksheet schema order');
  const contentTypes = entries.get('[Content_Types].xml').toString('utf8');
  assert.match(contentTypes, /drawing1\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.drawing\+xml"/);
  const anchors = drawingAnchors(entries);
  assert.equal(anchors.length, expected.length, 'Every chart must have one drawing anchor');
  assert.ok(anchors[0].toCol - anchors[0].fromCol >= 20 && anchors[0].toRow - anchors[0].fromRow >= 20,
    'Primary chart must use a wide dashboard area');
  anchors.slice(1).forEach(anchor => {
    assert.ok(anchor.toCol - anchor.fromCol >= 10 && anchor.toRow - anchor.fromRow >= 20,
      'Secondary charts must remain materially readable');
  });
  anchors.forEach((first, index) => anchors.slice(index + 1).forEach(second => {
    const separated = first.toCol <= second.fromCol || second.toCol <= first.fromCol
      || first.toRow <= second.fromRow || second.toRow <= first.fromRow;
    assert.ok(separated, `Chart anchors ${index + 1} and ${index + 2} overlap`);
  }));
  expected.forEach((spec, index) => {
    const name = `xl/charts/chart${index + 1}.xml`;
    const xml = entries.get(name).toString('utf8');
    assert.match(xml, new RegExp(spec.title));
    assert.match(xml, spec.type === 'line' ? /<c:lineChart>/ : spec.type === 'doughnut' ? /<c:doughnutChart>/ : /<c:barChart>/);
    assert.match(xml, spec.range);
    assert.match(xml, /<c:(?:strCache|numCache)>[\s\S]*<c:ptCount val="[1-9]\d*"/);
    assert.match(xml, /<a:defRPr sz="1500" b="1"\/>/, 'Chart title must be readable');
    assert.doesNotMatch(xml, /Series\s*\d/i);
    const seriesCount = (xml.match(/<c:ser>/g) || []).length;
    if (seriesCount > 1) {
      assert.match(xml, /<c:legend>/);
      assert.match(xml, /<c:legendPos val="b"\/>/);
    }
    if (spec.type === 'doughnut') {
      assert.match(xml, /<c:dLbls>[\s\S]*<c:showCatName val="1"\/>/);
      assert.match(xml, /<c:showPercent val="1"\/>/);
      assert.match(xml, /<c:showLeaderLines val="1"\/>/);
    } else {
      assert.match(xml, /<c:dLbls>[\s\S]*<c:showVal val="1"\/>/);
      assert.match(xml, /<a:t>Giá trị \(VND\)<\/a:t>/);
      assert.match(xml, /\[&gt;=1000000\]0\.0,,&quot; triệu&quot;/);
      if (spec.type === 'line') assert.match(xml, /<c:size val="7"\/>/);
      else assert.match(xml, /<c:gapWidth val="(?:45|60)"\/>/);
    }
    assert.match(contentTypes, new RegExp(`chart${index + 1}\\.xml" ContentType="application/vnd\\.openxmlformats-officedocument\\.drawingml\\.chart\\+xml"`));
  });
};

const strictPythonValidation = (bytes, expectedSheets, label, expectedChartCount = 0) => {
  const file = path.join(os.tmpdir(), `fly-${label}-${process.pid}.xlsx`);
  const resaved = path.join(os.tmpdir(), `fly-${label}-${process.pid}-resaved.xlsx`);
  fs.writeFileSync(file, Buffer.from(bytes));
  const script = String.raw`
import math, sys, zipfile, xml.etree.ElementTree as ET
from openpyxl import load_workbook
p, out, expected, expected_charts = sys.argv[1], sys.argv[2], sys.argv[3].split('|'), int(sys.argv[4])
with zipfile.ZipFile(p) as z:
    assert z.testzip() is None
    for name in z.namelist():
        if name.endswith('.xml') or name.endswith('.rels'):
            try:
                ET.fromstring(z.read(name))
            except Exception as error:
                raise AssertionError(f'{name}: {error}') from error
    order = {'sheetPr': 0, 'dimension': 1, 'sheetViews': 2, 'sheetFormatPr': 3,
             'cols': 4, 'sheetData': 5, 'sheetCalcPr': 6, 'sheetProtection': 7,
             'protectedRanges': 8, 'scenarios': 9, 'autoFilter': 10, 'sortState': 11,
             'dataConsolidate': 12, 'customSheetViews': 13, 'mergeCells': 14,
             'phoneticPr': 15, 'conditionalFormatting': 16, 'dataValidations': 17,
             'hyperlinks': 18, 'printOptions': 19, 'pageMargins': 20, 'pageSetup': 21,
             'headerFooter': 22, 'rowBreaks': 23, 'colBreaks': 24, 'customProperties': 25,
             'cellWatches': 26, 'ignoredErrors': 27, 'smartTags': 28, 'drawing': 29,
             'legacyDrawing': 30, 'legacyDrawingHF': 31, 'picture': 32, 'oleObjects': 33,
             'controls': 34, 'webPublishItems': 35, 'tableParts': 36, 'extLst': 37}
    for name in [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]:
        root = ET.fromstring(z.read(name))
        tags = [child.tag.rsplit('}', 1)[-1] for child in root]
        ranks = [order[tag] for tag in tags]
        assert ranks == sorted(ranks), (name, tags)
        sheet_data = root.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData')
        rows = [int(row.attrib['r']) for row in sheet_data]
        assert len(rows) == len(set(rows)) and rows == sorted(rows), (name, rows)
wb = load_workbook(p, read_only=False, data_only=False)
assert wb.sheetnames == expected, (wb.sheetnames, expected)
charts = [chart for ws in wb.worksheets for chart in ws._charts]
assert len(charts) == expected_charts
for index, chart in enumerate(charts):
    assert chart.anchor.to.col - chart.anchor._from.col >= (20 if index == 0 else 10)
    assert chart.anchor.to.row - chart.anchor._from.row >= 20
    if chart.__class__.__name__ == 'DoughnutChart':
        assert chart.dLbls.showCatName and chart.dLbls.showPercent and chart.dLbls.showLeaderLines
    else:
        for series in chart.ser:
            labels = series.dLbls
            assert labels is not None
            assert labels.showVal or any(label.showVal for label in labels.dLbl)
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            assert not isinstance(cell.value, str) or len(cell.value) <= 32767
            assert not isinstance(cell.value, float) or math.isfinite(cell.value)
wb.save(out)
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
resaved = load_workbook(out, read_only=False, data_only=False)
assert sum(len(ws._charts) for ws in resaved.worksheets) == expected_charts
`;
  try {
    const result = spawnSync('python', ['-c', script, file, resaved, expectedSheets.join('|'), String(expectedChartCount)], { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') {
      console.log('SKIP strict XLSX open/resave: Python is unavailable.');
      return;
    }
    assert.equal(result.status, 0, `Strict XLSX ${label} validation failed:\n${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, /warning/i, `Strict XLSX ${label} validation emitted a warning`);
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(resaved, { force: true });
  }
};

const reports = {
  MH_DON_MUA: {
    period,
    summary: { SoDonMua: 3, GiaTriDonMua: 1200000, SoPhieuNhap: 2, GiaTriNhap: 900000, SoDonChoDuyet: 1, SoDonTre: 1, SLConThieu: 4, SoDonDaHoanTat: 2, SoDonDungHan: 1 },
    suppliers: [{ MaNCC: 'NCC01', TenNCC: 'Công ty Thực phẩm Việt', SoDon: 3, GiaTri: 1200000 }],
    byStatus: [{ TrangThai: 'Đang giao', SoDon: 1, GiaTri: 400000 }],
    daily: [{ Ngay: '2026-09-12', SoDon: 2, GiaTri: 800000 }],
    byCategory: [{ MaDM: 'DM01', TenDM: 'Thực phẩm', SoLuong: 50, GiaTri: 1200000 }],
    actionOrders: [{ MaPO: 'PO001', TenNCC: 'Công ty Thực phẩm Việt', NgayGiaoDuKien: '2026-09-15', SLConThieu: 4, UuTien: 'Giao trễ' }]
  },
  TN_BAN_HANG: {
    period,
    sales: { SoHoaDon: 8, DoanhThuHoaDon: 2400000, TienHoan: 100000, DoanhThuThuan: 2300000 },
    methods: { TienMat: 800000, QR: 900000, The: 300000, ChuyenKhoan: 300000 },
    shifts: [{ MaCa: 'CA001', ThoiGianBatDau: '2026-09-12T08:00:00+07:00', ThoiGianKetThuc: '2026-09-12T16:00:00+07:00', SoHoaDon: 8, DoanhThu: 2400000, SoDoiTra: 1, TienHoan: 100000, TrangThai: 'Đã đóng' }],
    daily: [{ Ngay: '2026-09-12', SoHoaDon: 8, DoanhThuHoaDon: 2400000, TienHoan: 100000, DoanhThuThuan: 2300000 }],
    topProducts: [{ MaSP: 'SP01', TenSP: 'Sữa tươi', SoLuongBan: 12, DoanhThu: 360000 }],
    recentInvoices: [{ MaHD: 'HD001', TenKhachHang: 'Khách lẻ', NgayLap: '2026-09-12T10:00:00+07:00', PhuongThuc: 'QR', TongThanhToan: 300000 }]
  },
  KT_NOI_BO: {
    period,
    sales: { SoHoaDon: 8, DoanhThuHoaDon: 2400000, TienHoan: 100000, DoanhThuThuan: 2300000, GiaVonHangBanThuan: 1500000, LoiNhuanGop: 800000 },
    purchases: { SoPhieuNhap: 2 },
    inventory: { GiaTriTon: 5000000 },
    finance: { PhieuThuThucNop: 800000, DaThanhToanNCC: 500000, CongNoConLai: 700000, CongNoQuaHan: 100000, ChenhLechPhieuThu: 0 },
    daily: [{ Ngay: '2026-09-12', SoHoaDon: 8, DoanhThuHoaDon: 2400000, TienHoan: 100000, DoanhThuThuan: 2300000, GiaVonHangBanThuan: 1500000, LoiNhuanGop: 800000 }],
    cashflowDaily: [{ Ngay: '2026-09-12', ThucNop: 800000, DaChi: 500000 }],
    payables: [{ MaCNPTra: 'CN01', TenNCC: 'Công ty Thực phẩm Việt', SoHoaDon: 'NCC-01', HanThanhToan: '2026-10-15', SoTienConLai: 700000, TrangThaiHienTai: 'Còn hạn' }],
    debtAging: [{ NhomHan: 'Còn 1–30 ngày', SoKhoan: 1, GiaTri: 700000 }],
    reconciliation: [{ TrangThaiDoiChieu: 'Đã khớp', SoHoaDon: 2, TongCong: 900000 }]
  }
};
const expectedDepartmentSheets = {
  MH_DON_MUA: ['01-Bia', '02-Nha cung cap', '03-Trang thai don', '04-Theo ngay', '05-Danh muc', '06-Can xu ly'],
  TN_BAN_HANG: ['01-Bia', '02-Ca ban hang', '03-Theo ngay', '04-Phuong thuc', '05-Top san pham', '06-Hoa don'],
  KT_NOI_BO: ['01-Bia', '02-Tai chinh ngay', '03-Dong tien ngay', '04-Cong no', '05-Tuoi cong no', '06-Doi chieu']
};

for (const [kind, report] of Object.entries(reports)) {
  const csv = exporter.buildCsv(kind, report, meta);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
  assert.match(csv, /TÓM TẮT ĐIỀU HÀNH/);
  assert.match(csv, /XÁC NHẬN/);
  assert.match(csv, /Nguyễn An/);
  assert.doesNotMatch(csv, /undefined|NaN/);

  const bytes = exporter.buildXlsx(kind, report, meta);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = Buffer.from(bytes).toString('utf8');
  assert.match(text, /01-Bia/);
  assert.match(text, /mergeCells/);
  assert.match(text, /state="frozen"/);
  assert.match(text, /fitToWidth/);
  assert.match(text, /Nội bộ — không phát hành ra ngoài/);
  assert.match(text, /#,##0/);
  assert.match(text, /Nguyễn An/);
  assert.doesNotMatch(text, /undefined|NaN/);
  const entries = validatePackageShape(bytes, expectedDepartmentSheets[kind]);
  validateNativeCharts(entries, kind === 'MH_DON_MUA' ? [
    { title: 'Giá trị mua hàng theo ngày', type: 'line', range: /'04-Theo ngay'!\$C\$7:\$C\$7/ },
    { title: 'Giá trị mua theo Nhà cung cấp', type: 'bar', range: /'02-Nha cung cap'!\$D\$7:\$D\$7/ },
    { title: 'Cơ cấu giá trị mua theo danh mục', type: 'doughnut', range: /'05-Danh muc'!\$D\$7:\$D\$7/ }
  ] : kind === 'TN_BAN_HANG' ? [
    { title: 'Doanh thu hóa đơn và doanh thu thuần', type: 'line', range: /'03-Theo ngay'!\$C\$7:\$C\$7/ },
    { title: 'Cơ cấu phương thức thu tiền', type: 'doughnut', range: /'04-Phuong thuc'!\$B\$7:\$B\$10/ },
    { title: 'Top sản phẩm theo doanh thu', type: 'bar', range: /'05-Top san pham'!\$D\$7:\$D\$7/ }
  ] : [
    { title: 'Doanh thu, giá vốn và lãi gộp theo ngày', type: 'line', range: /'02-Tai chinh ngay'!\$E\$7:\$E\$7/ },
    { title: 'Phiếu thu thực nộp và khoản đã chi', type: 'column', range: /'03-Dong tien ngay'!\$C\$7:\$C\$7/ },
    { title: 'Cơ cấu công nợ phải trả', type: 'doughnut', range: /'05-Tuoi cong no'!\$C\$7:\$C\$7/ }
  ]);
  strictPythonValidation(bytes, expectedDepartmentSheets[kind], kind.toLowerCase(), 3);
}

const storePnl = {
  period,
  hoatDong: {
    banHang: { doanhThuHoaDon: 3000000, tienHoan: 100000, doanhThuThuan: 2900000 },
    giaVon: { giaVonThuan: 1800000 },
    laiGop: { soTien: 1100000 },
    benThu3: { tongChiNcc: 400000, cuocVanChuyen: 50000, nhaCungCap: [{ MaNCC: 'N1', TenNCC: 'NCC Một', SoPhieu: 1, SoTien: 400000 }] },
    nhanVien: { tongLuongKhoa: 300000, top: [{ MaNV: 'NV1', TenNV: 'Nhân viên Một', ChucVu: 'Thu ngân', TongLuong: 300000 }] }
  },
  kqkd: { loiNhuan: 750000 },
  tienMat: { tongTienThu: 2900000 },
  keHoach: [{
    NgayGui: '2026-09-15T15:56:00+07:00',
    TenNV_Gui: 'Quản lý & Điều hành',
    TrangThaiLaiLo: 'Lỗ',
    SoTienLaiLo: -750000,
    KeHoach: `Giảm hao hụt\u0000\u000B${'A'.repeat(33000)}`,
    HanXemLai: '2026-09-30'
  }]
};
const pnlBytes = exporter.buildXlsx('STORE_PNL', storePnl, { ...meta, note: 'Đã kiểm\u0000tra' });
assert.match(Buffer.from(pnlBytes).toString('utf8'), /BÁO CÁO LÃI \/ LỖ CỬA HÀNG/);
const pnlSheetNames = ['01-Bia', '02-Chi phi NCC', '03-Luong khoa', '04-Ke hoach'];
const pnlEntries = validatePackageShape(pnlBytes, pnlSheetNames);
assert.doesNotMatch(pnlEntries.get('xl/worksheets/sheet4.xml').toString('utf8'), /\u0000|\u000B/);
validateNativeCharts(pnlEntries, [
  { title: 'Lãi \/ lỗ trong kế hoạch điều chỉnh', type: 'line', range: /'04-Ke hoach'!\$D\$7:\$D\$7/ },
  { title: 'Chi phí theo nhà cung cấp', type: 'bar', range: /'02-Chi phi NCC'!\$D\$7:\$D\$7/ },
  { title: 'Lương nhân viên đã khóa', type: 'bar', range: /'03-Luong khoa'!\$D\$7:\$D\$7/ }
]);
strictPythonValidation(pnlBytes, pnlSheetNames, 'store-pnl', 3);

const storeOps = {
  period,
  sales: { SoHoaDon: 9, DoanhThuHoaDon: 3600000, TienHoan: 100000, DoanhThuThuan: 3500000, GiaVonHangBanThuan: 2100000, LoiNhuanGop: 1400000 },
  purchases: { SoPhieuNhap: 2 },
  inventory: { GiaTriCuoiKy: 6200000 },
  finance: { PhieuThuThucNop: 1800000, DaThanhToanNCC: 700000, CongNoConLai: 900000 },
  daily: [
    { Ngay: '2026-09-14', SoHoaDon: 4, DoanhThuHoaDon: 1600000, TienHoan: 0, DoanhThuThuan: 1600000, GiaVonHangBanThuan: 950000, LoiNhuanGop: 650000 },
    { Ngay: '2026-09-15', SoHoaDon: 5, DoanhThuHoaDon: 2000000, TienHoan: 100000, DoanhThuThuan: 1900000, GiaVonHangBanThuan: 1150000, LoiNhuanGop: 750000 }
  ],
  cashflowDaily: [{ Ngay: '2026-09-15', ThucNop: 1800000, DaChi: 700000 }],
  cashiers: [{ MaNV: 'NV01', TenNV: 'Thu ngân A', SoHoaDon: 9, DoanhThuHoaDon: 3600000 }],
  salesByCategory: [{ MaDM: 'DM01', TenDM: 'Thực phẩm', DoanhThuHoaDon: 2400000 }, { MaDM: 'DM02', TenDM: 'Đồ uống', DoanhThuHoaDon: 1200000 }]
};
const storeOpsBytes = exporter.buildXlsx('STORE_OPS', storeOps, meta);
const storeOpsSheets = ['01-Bia', '02-Tai chinh ngay', '03-Dong tien ngay', '04-Thu ngan', '05-Danh muc ban'];
const storeOpsEntries = validatePackageShape(storeOpsBytes, storeOpsSheets);
validateNativeCharts(storeOpsEntries, [
  { title: 'Doanh thu thuần và lãi gộp theo ngày', type: 'line', range: /'02-Tai chinh ngay'!\$E\$7:\$E\$8/ },
  { title: 'Doanh thu theo danh mục', type: 'column', range: /'05-Danh muc ban'!\$C\$7:\$C\$8/ },
  { title: 'Doanh thu theo Thu ngân', type: 'bar', range: /'04-Thu ngan'!\$D\$7:\$D\$7/ }
]);
assert.deepEqual(drawingAnchors(storeOpsEntries), [
  { fromCol: 6, fromRow: 1, toCol: 26, toRow: 22 },
  { fromCol: 6, fromRow: 24, toCol: 16, toRow: 47 },
  { fromCol: 16, fromRow: 24, toCol: 26, toRow: 47 }
], 'Admin/store cover must use one wide primary chart plus two large secondary charts');
const denseStoreOpsBytes = exporter.buildXlsx('STORE_OPS', {
  ...storeOps,
  cashiers: Array.from({ length: 14 }, (_, index) => ({
    MaNV: `NV${index + 1}`,
    TenNV: `Thu ngân ${index + 1}`,
    SoHoaDon: index + 1,
    DoanhThuHoaDon: (index + 1) * 300000
  }))
}, meta);
const denseStoreOpsEntries = validatePackageShape(denseStoreOpsBytes, storeOpsSheets);
validateNativeCharts(denseStoreOpsEntries, [
  { title: 'Doanh thu thuần và lãi gộp theo ngày', type: 'line', range: /'02-Tai chinh ngay'!\$E\$7:\$E\$8/ },
  { title: 'Doanh thu theo danh mục', type: 'column', range: /'05-Danh muc ban'!\$C\$7:\$C\$8/ },
  { title: 'Doanh thu theo Thu ngân', type: 'bar', range: /'04-Thu ngan'!\$D\$7:\$D\$20/ }
]);
assert.deepEqual(drawingAnchors(denseStoreOpsEntries), [
  { fromCol: 6, fromRow: 1, toCol: 26, toRow: 22 },
  { fromCol: 6, fromRow: 24, toCol: 26, toRow: 47 },
  { fromCol: 6, fromRow: 49, toCol: 26, toRow: 84 }
], 'Dense category bars must switch to stacked full-width anchors');

const audit = {
  items: [{ ThoiGian: '2026-09-12T09:00:00+07:00', TenNV: 'Quản lý', TenVaiTro: 'Quản lý', viecLam: 'Phê duyệt', doiTuongMa: 'PO001', ketQuaHienThi: 'Thành công', giaiThich: 'Đã duyệt đơn mua', NoiDung: 'Hợp lệ', MaUC: 'UC03', DiaChiIP: '127.0.0.1' }]
};
const auditBytes = exporter.buildXlsx('AUDIT', audit, { ...meta, from: '2026-09-01', to: '2026-09-30', filterLabel: 'Phê duyệt' });
assert.match(Buffer.from(auditBytes).toString('utf8'), /BÁO CÁO NHẬT KÝ HỆ THỐNG/);
assert.match(Buffer.from(auditBytes).toString('utf8'), /PO001/);
validateNativeCharts(validatePackageShape(auditBytes, ['01-Bia', '02-Nhat ky']), []);

const configBytes = exporter.buildConfigXlsx({
  title: 'BẢNG CÂN ĐỐI PHÁT SINH',
  number: '2026-09',
  status: 'Kỳ đã khóa',
  columns: [
    { label: 'Tài khoản', key: 'MaTK' },
    { label: 'Tên', key: 'TenTK' },
    { label: 'Dư đầu Nợ', key: 'DuDauNo', format: 'money' },
    { label: 'Dư đầu Có', key: 'DuDauCo', format: 'money' },
    { label: 'Phát sinh Nợ', key: 'PsNo', format: 'money' },
    { label: 'Phát sinh Có', key: 'PsCo', format: 'money' }
  ],
  rows: [{ MaTK: '111', TenTK: 'Tiền mặt', DuDauNo: 100000, DuDauCo: 0, PsNo: 900000, PsCo: 300000 }],
  summary: [{ label: 'Tổng Nợ', value: 900000, format: 'money' }],
  signatures: ['Kế toán', 'Quản lý']
}, { ...meta, period });
assert.match(Buffer.from(configBytes).toString('utf8'), /BẢNG CÂN ĐỐI PHÁT SINH/);
assert.doesNotMatch(Buffer.from(configBytes).toString('utf8'), /undefined|NaN/);
const configSheetNames = ['01-Bia', '02-Chi tiet'];
const configEntries = validatePackageShape(configBytes, configSheetNames);
validateNativeCharts(configEntries, [{ title: 'Phát sinh Nợ và Có theo tài khoản', type: 'column', range: /'02-Chi tiet'!\$E\$7:\$E\$7/ }]);
strictPythonValidation(configBytes, configSheetNames, 'ledger-config', 1);

const accountingChartCases = [
  {
    label: 'income-statement',
    config: {
      title: 'KẾT QUẢ KINH DOANH',
      columns: [{ key: 'id', label: '#' }, { key: 'label', label: 'Chỉ tiêu' }, { key: 'amount', label: 'Số tiền', format: 'money' }],
      rows: [{ id: 1, label: 'Doanh thu thuần', amount: 2500000 }, { id: 2, label: 'Giá vốn', amount: -1500000 }]
    },
    sheets: ['01-Bia', '02-Chi tiet'],
    charts: [{ title: 'So sánh các chỉ tiêu kết quả kinh doanh', type: 'bar', range: /'02-Chi tiet'!\$C\$7:\$C\$8/ }]
  },
  {
    label: 'cash-flow',
    config: {
      title: 'LƯU CHUYỂN TIỀN TỆ',
      columns: [{ key: 'nhom', label: 'Nhóm' }, { key: 'chiTieu', label: 'Chỉ tiêu' }, { key: 'soTien', label: 'Số tiền', format: 'money' }],
      rows: [{ nhom: 'I', chiTieu: 'Thu bán hàng', soTien: 2500000 }, { nhom: 'I', chiTieu: 'Trả NCC', soTien: -900000 }]
    },
    sheets: ['01-Bia', '02-Chi tiet'],
    charts: [{ title: 'Dòng tiền theo hoạt động', type: 'bar', range: /'02-Chi tiet'!\$C\$7:\$C\$8/ }]
  },
  {
    label: 'balance-sheet',
    config: {
      title: 'BẢNG CÂN ĐỐI KẾ TOÁN',
      columns: [{ key: 'id', label: '' }, { key: 'name', label: 'Chỉ tiêu tài sản' }, { key: 'amount', label: 'Số tiền', format: 'money' }],
      rows: [{ id: 'A', name: 'Tiền', amount: 1000000 }, { id: 'C', name: 'Hàng tồn kho', amount: 1500000 }],
      extraTables: [{
        title: 'Nguồn vốn',
        columns: [{ key: 'id', label: '' }, { key: 'name', label: 'Chỉ tiêu' }, { key: 'amount', label: 'Số tiền', format: 'money' }],
        rows: [{ id: 'F', name: 'Phải trả NCC', amount: 700000 }, { id: 'I', name: 'Vốn chủ sở hữu', amount: 1800000 }]
      }]
    },
    sheets: ['01-Bia', '02-Chi tiet', '03-Chi tiet 2'],
    charts: [
      { title: 'Cơ cấu tài sản', type: 'bar', range: /'02-Chi tiet'!\$C\$7:\$C\$8/ },
      { title: 'Cơ cấu nguồn vốn', type: 'bar', range: /'03-Chi tiet 2'!\$C\$7:\$C\$8/ }
    ]
  },
  {
    label: 'general-ledger',
    config: {
      title: 'SỔ CÁI 111 — TIỀN MẶT',
      columns: [{ key: 'Ngay', label: 'Ngày', format: 'date' }, { key: 'MaBT', label: 'Bút toán' }, { key: 'No', label: 'Nợ', format: 'money' }, { key: 'Co', label: 'Có', format: 'money' }, { key: 'Du', label: 'Dư chạy', format: 'money' }],
      rows: [{ Ngay: '2026-09-01', MaBT: 'BT1', No: 500000, Co: 0, Du: 500000 }, { Ngay: '2026-09-02', MaBT: 'BT2', No: 0, Co: 200000, Du: 300000 }]
    },
    sheets: ['01-Bia', '02-Chi tiet'],
    charts: [{ title: 'Phát sinh Nợ, Có và số dư chạy', type: 'line', range: /'02-Chi tiet'!\$C\$7:\$C\$8/ }]
  },
  {
    label: 'vat',
    config: {
      title: 'BẢNG KÊ VAT',
      columns: [{ key: 'MaHD', label: 'Hóa đơn' }, { key: 'Ngay', label: 'Ngày', format: 'date' }, { key: 'MaSP', label: 'Mã SP' }, { key: 'Thue', label: 'Thuế suất' }, { key: 'VAT', label: 'VAT', format: 'money' }],
      rows: [{ MaHD: 'HD1', Ngay: '2026-09-01', MaSP: 'SP1', Thue: '10%', VAT: 100000 }],
      extraTables: [{
        title: 'VAT đầu vào',
        columns: [{ key: 'Nguon', label: 'Nguồn' }, { key: 'Ma', label: 'Mã' }, { key: 'Ngay', label: 'Ngày', format: 'date' }, { key: 'TienHang', label: 'Tiền hàng', format: 'money' }, { key: 'VAT', label: 'VAT', format: 'money' }],
        rows: [{ Nguon: 'Hóa đơn mua', Ma: 'M1', Ngay: '2026-09-02', TienHang: 500000, VAT: 50000 }]
      }]
    },
    sheets: ['01-Bia', '02-Chi tiet', '03-Chi tiet 2'],
    charts: [
      { title: 'VAT đầu ra theo hóa đơn', type: 'column', range: /'02-Chi tiet'!\$E\$7:\$E\$7/ },
      { title: 'VAT đầu vào theo chứng từ', type: 'column', range: /'03-Chi tiet 2'!\$E\$7:\$E\$7/ }
    ]
  }
];
accountingChartCases.forEach(item => {
  const bytes = exporter.buildConfigXlsx(item.config, { ...meta, period });
  const entries = validatePackageShape(bytes, item.sheets);
  validateNativeCharts(entries, item.charts);
});

const noDataBytes = exporter.buildXlsx('MH_DON_MUA', { period, summary: {} }, meta);
const noDataEntries = validatePackageShape(noDataBytes, expectedDepartmentSheets.MH_DON_MUA);
validateNativeCharts(noDataEntries, []);
assert.match(noDataEntries.get('xl/worksheets/sheet2.xml').toString('utf8'), /Không có dữ liệu trong kỳ/);

console.log('POLISHED REPORT EXPORT PASS: department, store and accounting XLSX files have validated native charts; audit/no-data exports remain clean.');
