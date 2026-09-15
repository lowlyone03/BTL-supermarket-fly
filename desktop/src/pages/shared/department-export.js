(() => {
  const COMPANY = window.FLY_WAREHOUSE_EXPORT?.COMPANY || {
    country: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    motto: 'Độc lập - Tự do - Hạnh phúc',
    name: 'SUPERMARKET FLY',
    branch: 'Cửa hàng Hà Nội',
    address: 'Hà Nội, Việt Nam',
    software: 'Hệ thống quản lý nội bộ SuperMarket FLY'
  };
  const xmlText = value => {
    let clean = '';
    for (const char of String(value ?? '')) {
      const code = char.codePointAt(0);
      const allowed = code === 0x09 || code === 0x0A || code === 0x0D
        || (code >= 0x20 && code <= 0xD7FF)
        || (code >= 0xE000 && code <= 0xFFFD)
        || (code >= 0x10000 && code <= 0x10FFFF);
      if (allowed && (code & 0xFFFF) !== 0xFFFE && (code & 0xFFFF) !== 0xFFFF) clean += char;
    }
    return clean;
  };
  const excelCellText = value => {
    const clean = xmlText(value);
    if (clean.length <= 32767) return clean;
    return clean.slice(0, 32767).replace(/[\uD800-\uDBFF]$/, '');
  };
  const escXml = value => xmlText(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const safeFile = value => String(value || 'bao-cao')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'bao-cao';
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const date = value => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return window.FLY_WAREHOUSE_EXPORT?.fmtDate?.(value)
      || new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed);
  };
  const dateTime = value => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return window.FLY_WAREHOUSE_EXPORT?.fmtDateTime?.(value)
      || new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed);
  };
  const periodLabel = period => window.FLY_WAREHOUSE_EXPORT?.formatPeriodLabel?.(period?.periodType, period?.period, period?.label)
    || period?.label || period?.period || 'Không xác định';
  const downloadBlob = (filename, content, mime) => {
    if (window.FLY_WAREHOUSE_EXPORT?.downloadBlob) {
      return window.FLY_WAREHOUSE_EXPORT.downloadBlob(filename, content, mime);
    }
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const C = (label, type = 'text', width = 18) => ({ label, type, width });
  const section = (name, title, columns, rows, total = null, note = '') => ({ name, title, columns, rows, total, note });
  const valueAt = (row, key, fallback = '') => row?.[key] ?? fallback;
  const mapped = (items, columns) => (items || []).map(item => columns.map(column => {
    if (typeof column.value === 'function') return column.value(item);
    return valueAt(item, column.key);
  }));
  const returnSections = report => {
    const returns = report?.doiTra || {};
    return [
      section('Doi tra', 'Phiếu đổi trả khách hàng',
        [C('Mã phiếu', 'text', 16), C('Hóa đơn', 'text', 14), C('Khách hàng', 'text', 22), C('Hình thức', 'text', 16), C('Lý do', 'text', 30), C('Tiền hoàn', 'money', 16), C('Trạng thái', 'text', 16), C('Trách nhiệm', 'text', 24), C('Hàng đi đâu', 'text', 38)],
        mapped(returns.tickets, [
          { key: 'MaDT' }, { key: 'MaHD' }, { value: row => row.TenKH || 'Khách vãng lai' }, { key: 'HinhThucXuLy' },
          { key: 'LyDo' }, { key: 'SoTienHoan' }, { key: 'TrangThai' }, { key: 'BuocCanXuLy' },
          { value: row => row.HangDiDau || window.FLY_WAREHOUSE_EXPORT?.hangDiDauText?.(row) || '' }
        ])),
      section('Hang khach tra', 'Sản phẩm khách trả',
        [C('Mã SP', 'text', 14), C('Sản phẩm', 'text', 32), C('SL trả', 'number', 12), C('Nhập lại', 'number', 12), C('Loại bỏ', 'number', 12), C('Hàng đi đâu', 'text', 38), C('Lý do', 'text', 26)],
        mapped(returns.products, [
          { key: 'MaSP' }, { key: 'TenSP' }, { key: 'SLTra' }, { key: 'SLNhapLai' },
          { value: row => row.SLLoaiBo ?? row.SLKhongNhapLai ?? 0 },
          { value: row => row.HangDiDau || window.FLY_WAREHOUSE_EXPORT?.hangDiDauText?.(row) || '' }, { key: 'LyDoMau' }
        ]))
    ].filter(item => item.rows.length);
  };

  const base = (kind, report, meta, title, actor, prefix) => ({
    kind, report, meta, title, actor, prefix,
    period: report?.period || {},
    number: meta.number || report?.submittedNumber || `${prefix}-${report?.period?.period || new Date().toISOString().slice(0, 10)}`,
    summary: [],
    sections: [],
    charts: [],
    signatures: [actor, 'Quản lý cửa hàng']
  });

  const purchasingModel = (report, meta) => {
    const s = report.summary || {};
    const model = base('MH_DON_MUA', report, meta, 'BÁO CÁO ĐƠN MUA VÀ GIAO HÀNG', 'Nhân viên mua hàng', 'BCM');
    model.summary = [
      ['Đơn mua hợp lệ', s.SoDonMua, 'number'], ['Giá trị đơn mua', s.GiaTriDonMua, 'money'],
      ['Phiếu nhập', s.SoPhieuNhap, 'number'], ['Giá trị nhập', s.GiaTriNhap, 'money'],
      ['Đơn chờ duyệt', s.SoDonChoDuyet, 'number'], ['Đơn giao trễ', s.SoDonTre, 'number'],
      ['Số lượng còn thiếu', s.SLConThieu, 'number'], ['Tỷ lệ giao đúng hạn', s.SoDonDaHoanTat ? number(s.SoDonDungHan) / number(s.SoDonDaHoanTat) * 100 : 0, 'percent']
    ];
    model.sections = [
      section('Nha cung cap', 'Giá trị mua theo nhà cung cấp',
        [C('Mã NCC', 'text', 14), C('Nhà cung cấp', 'text', 32), C('Số đơn', 'number', 12), C('Giá trị', 'money', 18)],
        mapped(report.suppliers, [{ key: 'MaNCC' }, { key: 'TenNCC' }, { key: 'SoDon' }, { key: 'GiaTri' }]),
        ['', 'TỔNG CỘNG', number(s.SoDonMua), number(s.GiaTriDonMua)]),
      section('Trang thai don', 'Cơ cấu trạng thái đơn mua',
        [C('Trạng thái', 'text', 24), C('Số đơn', 'number', 12), C('Giá trị', 'money', 18)],
        mapped(report.byStatus, [{ key: 'TrangThai' }, { key: 'SoDon' }, { key: 'GiaTri' }])),
      section('Theo ngay', 'Giá trị mua hàng theo ngày',
        [C('Ngày', 'date', 14), C('Số đơn', 'number', 12), C('Giá trị', 'money', 18)],
        mapped(report.daily, [{ key: 'Ngay' }, { key: 'SoDon' }, { key: 'GiaTri' }])),
      section('Danh muc', 'Giá trị mua theo danh mục',
        [C('Mã DM', 'text', 14), C('Danh mục', 'text', 30), C('Số lượng', 'number', 14), C('Giá trị', 'money', 18)],
        mapped(report.byCategory, [{ key: 'MaDM' }, { key: 'TenDM' }, { value: row => row.SoLuong ?? row.SoLuongMua ?? 0 }, { key: 'GiaTri' }])),
      section('Can xu ly', 'Đơn mua cần xử lý',
        [C('Mã PO', 'text', 18), C('Nhà cung cấp', 'text', 30), C('Ngày giao', 'date', 14), C('SL còn thiếu', 'number', 15), C('Ưu tiên', 'text', 18)],
        mapped(report.actionOrders, [{ key: 'MaPO' }, { key: 'TenNCC' }, { key: 'NgayGiaoDuKien' }, { key: 'SLConThieu' }, { key: 'UuTien' }])),
      ...returnSections(report)
    ];
    model.charts = [
      { type: 'line', title: 'Giá trị mua hàng theo ngày', source: 'Theo ngay', category: 0, series: [{ column: 2, name: 'Giá trị đơn mua' }], format: '#,##0" đ"', maxRows: 31 },
      { type: 'bar', title: 'Giá trị mua theo Nhà cung cấp', source: 'Nha cung cap', category: 1, series: [{ column: 3, name: 'Giá trị mua' }], format: '#,##0" đ"', maxRows: 10 },
      { type: 'doughnut', title: 'Cơ cấu giá trị mua theo danh mục', source: 'Danh muc', category: 1, series: [{ column: 3, name: 'Giá trị mua' }], format: '#,##0" đ"', maxRows: 8 }
    ];
    return model;
  };

  const salesModel = (report, meta) => {
    const s = report.sales || {}; const m = report.methods || {};
    const model = base('TN_BAN_HANG', report, meta, 'BÁO CÁO CA VÀ BÁN HÀNG CÁ NHÂN', 'Thu ngân lập báo cáo', 'BCTN');
    model.summary = [
      ['Hóa đơn hoàn thành', s.SoHoaDon, 'number'], ['Doanh thu hóa đơn', s.DoanhThuHoaDon, 'money'],
      ['Tiền hoàn', s.TienHoan, 'money'], ['Doanh thu thuần', s.DoanhThuThuan ?? number(s.DoanhThuHoaDon) - number(s.TienHoan), 'money'],
      ['Tiền mặt', m.TienMat, 'money'], ['QR', m.QR, 'money'], ['Thẻ', m.The, 'money'], ['Chuyển khoản', m.ChuyenKhoan, 'money']
    ];
    model.sections = [
      section('Ca ban hang', 'Doanh thu và đổi trả theo ca',
        [C('Mã ca', 'text', 18), C('Mở ca', 'datetime', 20), C('Đóng ca', 'datetime', 20), C('Hóa đơn', 'number', 12), C('Doanh thu', 'money', 18), C('Đổi trả', 'number', 12), C('Tiền hoàn', 'money', 16), C('Trạng thái', 'text', 16)],
        mapped(report.shifts, [{ key: 'MaCa' }, { key: 'ThoiGianBatDau' }, { key: 'ThoiGianKetThuc' }, { key: 'SoHoaDon' }, { key: 'DoanhThu' }, { key: 'SoDoiTra' }, { key: 'TienHoan' }, { key: 'TrangThai' }]),
        ['TỔNG CỘNG', '', '', number(s.SoHoaDon), number(s.DoanhThuHoaDon), number(s.SoPhieu), number(s.TienHoan), '']),
      section('Theo ngay', 'Doanh thu bán hàng theo ngày',
        [C('Ngày', 'date', 14), C('Hóa đơn', 'number', 12), C('Doanh thu HĐ', 'money', 18), C('Tiền hoàn', 'money', 16), C('Doanh thu thuần', 'money', 18)],
        mapped(report.daily, [{ key: 'Ngay' }, { key: 'SoHoaDon' }, { key: 'DoanhThuHoaDon' }, { key: 'TienHoan' }, { value: row => row.DoanhThuThuan ?? number(row.DoanhThuHoaDon) - number(row.TienHoan) }]),
        ['TỔNG CỘNG', number(s.SoHoaDon), number(s.DoanhThuHoaDon), number(s.TienHoan), number(s.DoanhThuThuan ?? number(s.DoanhThuHoaDon) - number(s.TienHoan))]),
      section('Phuong thuc', 'Cơ cấu phương thức thu tiền',
        [C('Phương thức', 'text', 24), C('Số tiền', 'money', 18)],
        [['Tiền mặt', m.TienMat], ['QR', m.QR], ['Thẻ', m.The], ['Chuyển khoản', m.ChuyenKhoan]].filter(row => number(row[1]) !== 0)),
      section('Top san pham', 'Top sản phẩm bán chạy',
        [C('Mã SP', 'text', 14), C('Sản phẩm', 'text', 34), C('Số lượng', 'number', 12), C('Doanh thu', 'money', 18)],
        mapped(report.topProducts, [{ key: 'MaSP' }, { key: 'TenSP' }, { value: row => row.SoLuongBan ?? row.SoLuong ?? 0 }, { key: 'DoanhThu' }])),
      section('Hoa don', 'Hóa đơn gần đây',
        [C('Mã HĐ', 'text', 18), C('Khách hàng', 'text', 26), C('Thời gian', 'datetime', 20), C('Thanh toán', 'text', 18), C('Tổng thanh toán', 'money', 18)],
        mapped(report.recentInvoices, [{ key: 'MaHD' }, { key: 'TenKhachHang' }, { key: 'NgayLap' }, { key: 'PhuongThuc' }, { key: 'TongThanhToan' }])),
      ...returnSections(report)
    ];
    model.charts = [
      { type: 'line', title: 'Doanh thu hóa đơn và doanh thu thuần', source: 'Theo ngay', category: 0, series: [{ column: 2, name: 'Doanh thu hóa đơn' }, { column: 4, name: 'Doanh thu thuần' }], format: '#,##0" đ"', maxRows: 31 },
      { type: 'doughnut', title: 'Cơ cấu phương thức thu tiền', source: 'Phuong thuc', category: 0, series: [{ column: 1, name: 'Số tiền' }], format: '#,##0" đ"', maxRows: 4 },
      { type: 'bar', title: 'Top sản phẩm theo doanh thu', source: 'Top san pham', category: 1, series: [{ column: 3, name: 'Doanh thu' }], format: '#,##0" đ"', maxRows: 10 }
    ];
    return model;
  };

  const financialModel = (kind, report, meta, store = false) => {
    const s = report.sales || {}; const p = report.purchases || {}; const inv = report.inventory || {}; const f = report.finance || {};
    const model = base(kind, report, meta, store ? 'BÁO CÁO HOẠT ĐỘNG CỬA HÀNG' : 'BÁO CÁO TÀI CHÍNH NỘI BỘ', store ? 'Quản lý cửa hàng' : 'Kế toán lập báo cáo', store ? 'BCHD' : 'BCKT');
    if (store) model.signatures = ['Kế toán tổng hợp', 'Quản lý cửa hàng'];
    model.summary = [
      ['Doanh thu hóa đơn', s.DoanhThuHoaDon, 'money'], ['Tiền hoàn', s.TienHoan, 'money'],
      ['Doanh thu thuần', s.DoanhThuThuan, 'money'], ['Giá vốn thuần', s.GiaVonHangBanThuan, 'money'],
      ['Lợi nhuận gộp', s.LoiNhuanGop, 'money'], ['Phiếu thu thực nộp', f.PhieuThuThucNop, 'money'],
      ['Đã chi nhà cung cấp', f.DaThanhToanNCC, 'money'], ['Công nợ còn lại', f.CongNoConLai, 'money'],
      ['Công nợ quá hạn', f.CongNoQuaHan, 'money'], ['Chênh lệch bàn giao', f.ChenhLechPhieuThu, 'money'],
      ['Giá trị tồn cuối kỳ', inv.GiaTriCuoiKy ?? inv.GiaTriTon, 'money'], ['Phiếu nhập', p.SoPhieuNhap, 'number']
    ];
    model.sections = [
      section('Tai chinh ngay', 'Doanh thu, giá vốn và lãi gộp theo ngày',
        [C('Ngày', 'date', 14), C('Hóa đơn', 'number', 12), C('Doanh thu HĐ', 'money', 18), C('Tiền hoàn', 'money', 16), C('Doanh thu thuần', 'money', 18), C('Giá vốn thuần', 'money', 18), C('Lãi gộp', 'money', 18)],
        mapped(report.daily, [{ key: 'Ngay' }, { key: 'SoHoaDon' }, { key: 'DoanhThuHoaDon' }, { key: 'TienHoan' }, { key: 'DoanhThuThuan' }, { key: 'GiaVonHangBanThuan' }, { key: 'LoiNhuanGop' }]),
        ['TỔNG CỘNG', number(s.SoHoaDon), number(s.DoanhThuHoaDon), number(s.TienHoan), number(s.DoanhThuThuan), number(s.GiaVonHangBanThuan), number(s.LoiNhuanGop)]),
      section('Dong tien ngay', 'Phiếu thu và khoản chi theo ngày',
        [C('Ngày', 'date', 14), C('Theo hệ thống', 'money', 18), C('Thực nộp', 'money', 18), C('Đã chi NCC', 'money', 18), C('Chênh lệch', 'money', 16)],
        mapped(report.cashflowDaily, [{ key: 'Ngay' }, { value: row => row.HeThong ?? row.TheoHeThong ?? 0 }, { key: 'ThucNop' }, { key: 'DaChi' }, { key: 'ChenhLech' }])),
      section('Cong no', 'Công nợ nhà cung cấp',
        [C('Mã công nợ', 'text', 18), C('Nhà cung cấp', 'text', 30), C('Số hóa đơn', 'text', 18), C('Hạn thanh toán', 'date', 16), C('Còn lại', 'money', 18), C('Trạng thái', 'text', 18)],
        mapped(report.payables, [{ key: 'MaCNPTra' }, { key: 'TenNCC' }, { key: 'SoHoaDon' }, { key: 'HanThanhToan' }, { key: 'SoTienConLai' }, { key: 'TrangThaiHienTai' }])),
      section('Tuoi cong no', 'Phân nhóm tuổi công nợ',
        [C('Nhóm hạn', 'text', 24), C('Số khoản', 'number', 14), C('Giá trị', 'money', 18)],
        mapped(report.debtAging, [{ key: 'NhomHan' }, { key: 'SoKhoan' }, { key: 'GiaTri' }])),
      section('Doi chieu', 'Đối chiếu hóa đơn mua hàng',
        [C('Trạng thái', 'text', 24), C('Số hóa đơn', 'number', 14), C('Tổng giá trị', 'money', 18)],
        mapped(report.reconciliation, [{ key: 'TrangThaiDoiChieu' }, { key: 'SoHoaDon' }, { key: 'TongCong' }])),
      section('Thu ngan', 'Đóng góp doanh thu theo thu ngân',
        [C('Mã NV', 'text', 14), C('Thu ngân', 'text', 28), C('Hóa đơn', 'number', 12), C('Doanh thu HĐ', 'money', 18)],
        mapped(report.cashiers, [{ key: 'MaNV' }, { key: 'TenNV' }, { key: 'SoHoaDon' }, { key: 'DoanhThuHoaDon' }])),
      section('Danh muc ban', 'Doanh thu bán hàng theo danh mục',
        [C('Mã DM', 'text', 14), C('Danh mục', 'text', 30), C('Doanh thu HĐ', 'money', 18)],
        mapped(report.salesByCategory, [{ key: 'MaDM' }, { key: 'TenDM' }, { key: 'DoanhThuHoaDon' }])),
      section('San pham', 'Sản phẩm bán chạy trong kỳ',
        [C('Mã SP', 'text', 14), C('Sản phẩm', 'text', 32), C('Danh mục', 'text', 24), C('Đã bán', 'number', 12), C('Doanh thu', 'money', 18), C('Lãi gộp HĐ', 'money', 18)],
        mapped(report.topProducts, [{ key: 'MaSP' }, { key: 'TenSP' }, { key: 'TenDM' }, { key: 'SoLuongBan' }, { key: 'DoanhThuHoaDon' }, { key: 'LaiGopHoaDon' }])),
      ...returnSections(report)
    ].filter(item => item.rows.length || item.name === 'Tai chinh ngay');
    model.charts = store ? [
      { type: 'line', title: 'Doanh thu thuần và lãi gộp theo ngày', source: 'Tai chinh ngay', category: 0, series: [{ column: 4, name: 'Doanh thu thuần' }, { column: 6, name: 'Lãi gộp' }], format: '#,##0" đ"', maxRows: 31 },
      { type: 'column', title: 'Doanh thu theo danh mục', source: 'Danh muc ban', category: 1, series: [{ column: 2, name: 'Doanh thu hóa đơn' }], format: '#,##0" đ"', maxRows: 10 },
      { type: 'bar', title: 'Doanh thu theo Thu ngân', source: 'Thu ngan', category: 1, series: [{ column: 3, name: 'Doanh thu hóa đơn' }], format: '#,##0" đ"', maxRows: 10 }
    ] : [
      { type: 'line', title: 'Doanh thu, giá vốn và lãi gộp theo ngày', source: 'Tai chinh ngay', category: 0, series: [{ column: 4, name: 'Doanh thu thuần' }, { column: 5, name: 'Giá vốn thuần' }, { column: 6, name: 'Lãi gộp' }], format: '#,##0" đ"', maxRows: 31 },
      { type: 'column', title: 'Phiếu thu thực nộp và khoản đã chi', source: 'Dong tien ngay', category: 0, series: [{ column: 2, name: 'Thực nộp' }, { column: 3, name: 'Đã chi NCC' }], format: '#,##0" đ"', maxRows: 31 },
      { type: 'doughnut', title: 'Cơ cấu công nợ phải trả', source: 'Tuoi cong no', category: 0, series: [{ column: 2, name: 'Giá trị' }], format: '#,##0" đ"', maxRows: 8 }
    ];
    return model;
  };

  const pnlModel = (report, meta) => {
    const op = report.hoatDong || {}; const sale = op.banHang || {}; const cost = op.giaVon || {};
    const third = op.benThu3 || {}; const staff = op.nhanVien || {}; const cash = report.tienMat || {}; const kqkd = report.kqkd || {};
    const model = base('STORE_PNL', report, meta, 'BÁO CÁO LÃI / LỖ CỬA HÀNG', 'Quản lý cửa hàng', 'BCLL');
    model.signatures = ['Kế toán tổng hợp', 'Quản lý cửa hàng'];
    model.summary = [
      ['Doanh thu hóa đơn', sale.doanhThuHoaDon, 'money'], ['Tiền hoàn', sale.tienHoan, 'money'],
      ['Doanh thu thuần', sale.doanhThuThuan, 'money'], ['Giá vốn thuần', cost.giaVonThuan, 'money'],
      ['Lãi gộp', op.laiGop?.soTien, 'money'], ['Chi NCC đã trả', third.tongChiNcc, 'money'],
      ['Cước vận chuyển', third.cuocVanChuyen, 'money'], ['Lương đã khóa', staff.tongLuongKhoa, 'money'],
      ['Lãi / lỗ KQKD', kqkd.loiNhuan ?? op.kqkdLoiNhuan, 'money'], ['Tổng tiền thu', cash.tongTienThu, 'money']
    ];
    model.sections = [
      section('Chi phi NCC', 'Chi phí theo nhà cung cấp',
        [C('Mã NCC', 'text', 14), C('Nhà cung cấp', 'text', 32), C('Số phiếu', 'number', 12), C('Số tiền', 'money', 18)],
        mapped(third.nhaCungCap, [{ key: 'MaNCC' }, { key: 'TenNCC' }, { key: 'SoPhieu' }, { key: 'SoTien' }]),
        ['', 'TỔNG CỘNG', number(third.nhaCungCap?.reduce((sum, row) => sum + number(row.SoPhieu), 0)), number(third.tongChiNcc)]),
      section('Luong khoa', 'Lương nhân viên đã khóa',
        [C('Mã NV', 'text', 14), C('Nhân viên', 'text', 30), C('Chức vụ', 'text', 22), C('Tổng lương', 'money', 18)],
        mapped(staff.top, [{ key: 'MaNV' }, { key: 'TenNV' }, { key: 'ChucVu' }, { key: 'TongLuong' }])),
      section('Ke hoach', 'Kế hoạch điều chỉnh đã gửi',
        [C('Ngày gửi', 'datetime', 20), C('Người gửi', 'text', 26), C('Trạng thái', 'text', 16), C('Số tiền lãi/lỗ', 'money', 18), C('Kế hoạch', 'text', 48), C('Hạn xem lại', 'date', 16)],
        mapped(report.keHoach, [{ key: 'NgayGui' }, { key: 'TenNV_Gui' }, { key: 'TrangThaiLaiLo' }, { key: 'SoTienLaiLo' }, { key: 'KeHoach' }, { key: 'HanXemLai' }]))
    ];
    model.charts = [
      { type: 'line', title: 'Lãi / lỗ trong kế hoạch điều chỉnh', source: 'Ke hoach', category: 0, series: [{ column: 3, name: 'Số tiền lãi/lỗ' }], format: '#,##0" đ"', maxRows: 20 },
      { type: 'bar', title: 'Chi phí theo nhà cung cấp', source: 'Chi phi NCC', category: 1, series: [{ column: 3, name: 'Số tiền' }], format: '#,##0" đ"', maxRows: 10 },
      { type: 'bar', title: 'Lương nhân viên đã khóa', source: 'Luong khoa', category: 1, series: [{ column: 3, name: 'Tổng lương' }], format: '#,##0" đ"', maxRows: 10 }
    ];
    return model;
  };

  const ledgerModel = (kind, report, meta) => {
    const labels = { KT_KQKD: 'KẾT QUẢ KINH DOANH', KT_LCTT: 'LƯU CHUYỂN TIỀN TỆ', KT_BCDKT: 'BẢNG CÂN ĐỐI KẾ TOÁN' };
    const model = base(kind, report, meta, labels[kind] || meta.title || 'BÁO CÁO KẾ TOÁN', 'Kế toán lập báo cáo', 'BCKT');
    model.summary = [['Tổng / lợi nhuận', report.loiNhuanKeToan ?? report.tong ?? 0, 'money']];
    model.sections = [section('Chi tiet', labels[kind] || 'Chi tiết báo cáo',
      [C('#', 'text', 10), C('Chỉ tiêu', 'text', 48), C('Số tiền', 'money', 20)],
      mapped(report.lines, [{ key: 'id' }, { key: 'label' }, { key: 'amount' }]),
      ['', 'TỔNG / LỢI NHUẬN', number(report.loiNhuanKeToan ?? report.tong ?? 0)])];
    model.charts = [{ type: 'bar', title: labels[kind] || 'So sánh chỉ tiêu kế toán', source: 'Chi tiet', category: 1, series: [{ column: 2, name: 'Số tiền' }], format: '#,##0" đ"', maxRows: 12 }];
    return model;
  };

  const configColumnType = item => {
    if (item.format === 'money') return 'money';
    if (item.format === 'date') return 'date';
    if (item.format === 'datetime') return 'datetime';
    if (item.format === 'percent') return 'percent';
    if (item.format === 'number' || item.align === 'right') return 'number';
    return 'text';
  };
  const addConfigCharts = (model, config) => {
    const normalizedTitle = String(config.title || '').toLocaleUpperCase('vi-VN');
    const detail = model.sections[0];
    const extra = model.sections[1];
    const chartSourceRows = config.chart?.rows || config.rows || [];
    if (chartSourceRows.length && config.chart?.series?.length) {
      const chartColumns = [C('Nhãn', 'text', 20), ...config.chart.series.map(item => C(item.name, 'money', 18))];
      const chartRows = chartSourceRows.map(row => [
        typeof config.chart.label === 'function' ? config.chart.label(row) : row[config.chart.labelKey],
        ...config.chart.series.map(item => typeof item.value === 'function' ? item.value(row) : row[item.key])
      ]);
      model.sections.push(section('Du lieu bieu do', config.chart.title || 'Dữ liệu biểu đồ', chartColumns, chartRows));
      model.charts.push({
        type: config.chart.type === 'column' ? 'column' : 'line',
        title: config.chart.title || 'Xu hướng trong kỳ',
        source: 'Du lieu bieu do',
        category: 0,
        series: config.chart.series.map((item, index) => ({ column: index + 1, name: item.name })),
        format: '#,##0" đ"',
        maxRows: 31
      });
      return;
    }
    if (/SỔ CÁI/.test(normalizedTitle)) {
      model.charts.push({ type: 'line', title: 'Phát sinh Nợ, Có và số dư chạy', source: detail.name, category: 0, series: [{ column: 2, name: 'Nợ' }, { column: 3, name: 'Có' }, { column: 4, name: 'Dư chạy' }], format: '#,##0" đ"', maxRows: 31 });
    } else if (/CÂN ĐỐI PHÁT SINH/.test(normalizedTitle)) {
      model.charts.push({ type: 'column', title: 'Phát sinh Nợ và Có theo tài khoản', source: detail.name, category: 0, series: [{ column: 4, name: 'Phát sinh Nợ' }, { column: 5, name: 'Phát sinh Có' }], format: '#,##0" đ"', maxRows: 12 });
    } else if (/KẾT QUẢ KINH DOANH/.test(normalizedTitle)) {
      model.charts.push({ type: 'bar', title: 'So sánh các chỉ tiêu kết quả kinh doanh', source: detail.name, category: 1, series: [{ column: 2, name: 'Số tiền' }], format: '#,##0" đ"', maxRows: 12 });
    } else if (/LƯU CHUYỂN TIỀN TỆ/.test(normalizedTitle)) {
      model.charts.push({ type: 'bar', title: 'Dòng tiền theo hoạt động', source: detail.name, category: 1, series: [{ column: 2, name: 'Số tiền' }], format: '#,##0" đ"', maxRows: 12 });
    } else if (/BẢNG CÂN ĐỐI KẾ TOÁN/.test(normalizedTitle)) {
      model.charts.push({ type: 'bar', title: 'Cơ cấu tài sản', source: detail.name, category: 1, series: [{ column: 2, name: 'Số tiền' }], format: '#,##0" đ"', maxRows: 8 });
      if (extra) model.charts.push({ type: 'bar', title: 'Cơ cấu nguồn vốn', source: extra.name, category: 1, series: [{ column: 2, name: 'Số tiền' }], format: '#,##0" đ"', maxRows: 8 });
    } else if (/BẢNG KÊ VAT/.test(normalizedTitle)) {
      model.charts.push({ type: 'column', title: 'VAT đầu ra theo hóa đơn', source: detail.name, category: 0, series: [{ column: 4, name: 'VAT đầu ra' }], format: '#,##0" đ"', maxRows: 12 });
      if (extra) model.charts.push({ type: 'column', title: 'VAT đầu vào theo chứng từ', source: extra.name, category: 1, series: [{ column: 4, name: 'VAT đầu vào' }], format: '#,##0" đ"', maxRows: 12 });
    }
  };
  const configModel = (config, meta = {}) => {
    const report = { period: meta.period || { period: config.number, label: config.status } };
    const model = base('PRINT_CONFIG', report, meta, config.title || 'BÁO CÁO', meta.preparedBy || 'Người lập báo cáo', 'BC');
    model.number = config.number || model.number;
    model.summary = (config.summary || config.totals || []).map(item => [item.label, item.value, item.format === 'money' ? 'money' : 'text']);
    const cols = (config.columns || []).map(item => C(item.label || item.header, configColumnType(item), item.format === 'money' ? 18 : 24));
    model.sections = [section('Chi tiet', 'Chi tiết số liệu', cols, (config.rows || []).map(row => (config.columns || []).map(col => typeof col.value === 'function' ? col.value(row) : row[col.key])))];
    (config.extraTables || []).forEach((table, index) => {
      const columns = (table.columns || []).map(item => C(item.label || item.header, configColumnType(item), item.format === 'money' ? 18 : 24));
      model.sections.push(section(`Chi tiet ${index + 2}`, table.title || `Chi tiết ${index + 2}`, columns, (table.rows || []).map(row => (table.columns || []).map(col => typeof col.value === 'function' ? col.value(row) : row[col.key]))));
    });
    model.signatures = config.signatures || model.signatures;
    model.note = config.note || '';
    addConfigCharts(model, config);
    return model;
  };

  const auditModel = (report, meta) => {
    const model = base('AUDIT', report, meta, 'BÁO CÁO NHẬT KÝ HỆ THỐNG', 'Quản lý / Quản trị hệ thống', 'BCNK');
    const items = report.items || [];
    model.period = { label: meta.periodLabel || 'Theo bộ lọc đang áp dụng', from: meta.from, to: meta.to, period: `${meta.from || ''}_${meta.to || ''}` };
    model.summary = [['Tổng bản ghi xuất', items.length, 'number'], ['Phạm vi', meta.filterLabel || 'Theo bộ lọc màn hình', 'text']];
    model.sections = [section('Nhat ky', 'Chi tiết nhật ký hệ thống',
      [C('Thời gian', 'datetime', 21), C('Người làm', 'text', 25), C('Vai trò', 'text', 18), C('Việc làm', 'text', 30), C('Chứng từ', 'text', 18), C('Kết quả', 'text', 16), C('Giải thích', 'text', 42), C('Chi tiết', 'text', 42), C('Mã UC', 'text', 12), C('Địa chỉ IP', 'text', 18)],
      items.map(row => [row.ThoiGian, row.TenNV || row.TenDangNhap, row.TenVaiTro, row.viecLam || row.HanhDong, row.doiTuongMa, row.ketQuaHienThi, row.giaiThich, row.NoiDung, row.MaUC, row.DiaChiIP]))];
    model.note = 'Nhật ký hệ thống không thể sửa hoặc xóa; file dùng để đối chiếu và giải trình nội bộ.';
    return model;
  };

  const modelOf = (kind, report = {}, meta = {}) => {
    if (kind === 'MH_DON_MUA') return purchasingModel(report, meta);
    if (kind === 'TN_BAN_HANG') return salesModel(report, meta);
    if (kind === 'KT_NOI_BO') return financialModel(kind, report, meta);
    if (kind === 'STORE_OPS') return financialModel(kind, report, meta, true);
    if (kind === 'STORE_PNL') return pnlModel(report, meta);
    if (kind === 'AUDIT') return auditModel(report, meta);
    return ledgerModel(kind, report, meta);
  };

  const displayValue = (value, type) => {
    if (type === 'date') return date(value);
    if (type === 'datetime') return dateTime(value);
    if (type === 'percent') return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(number(value))}%`;
    return value ?? '';
  };
  const csvRows = model => {
    const p = model.period || {};
    const rows = [
      [COMPANY.country], [COMPANY.motto], [], [COMPANY.name], [COMPANY.branch], [COMPANY.address],
      [], [model.title], ['Số báo cáo', model.number], ['Kỳ báo cáo', periodLabel(p)],
      ['Từ ngày', date(p.from) || p.from || '—'], ['Đến ngày', date(p.to) || p.to || '—'],
      ['Người lập', model.meta.preparedBy || model.actor], ['Mã nhân viên', model.meta.staffId || ''],
      ['Ngày lập', dateTime(model.meta.issuedAt || new Date())], ['Trạng thái', model.meta.status || 'Bản làm việc'],
      ['Ghi chú', model.meta.note || model.note || ''], [], ['TÓM TẮT ĐIỀU HÀNH'], ['Chỉ tiêu', 'Giá trị']
    ];
    model.summary.forEach(([label, value, type]) => rows.push([label, displayValue(value, type)]));
    model.sections.forEach((part, index) => {
      rows.push([], [`${index + 1}. ${part.title.toUpperCase()}`], part.columns.map(col => col.label));
      if (!part.rows.length) rows.push(['Không có dữ liệu trong kỳ.']);
      part.rows.forEach(row => rows.push(row.map((value, col) => displayValue(value, part.columns[col]?.type))));
      if (part.total) rows.push(part.total.map((value, col) => displayValue(value, part.columns[col]?.type)));
      if (part.note) rows.push(['Ghi chú', part.note]);
    });
    rows.push([], ['XÁC NHẬN'], ['Bộ phận', 'Họ và tên', 'Chức danh', 'Chữ ký', 'Ngày ký']);
    model.signatures.forEach((signature, index) => rows.push([signature, index ? '' : (model.meta.preparedBy || ''), signature, '', '']));
    return rows;
  };
  const buildCsv = (kind, report, meta = {}) => `\uFEFF${csvRows(modelOf(kind, report, meta)).map(row => row.map(csvCell).join(',')).join('\r\n')}`;

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let crc = i;
      for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
      table[i] = crc >>> 0;
    }
    return table;
  })();
  const crc32 = bytes => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const utf8 = text => new TextEncoder().encode(text);
  const u16 = (view, offset, value) => view.setUint16(offset, value, true);
  const u32 = (view, offset, value) => view.setUint32(offset, value, true);
  const zipStore = files => {
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | (Math.floor(now.getSeconds() / 2) & 31);
    const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
    const locals = []; const centrals = []; let offset = 0;
    files.forEach(file => {
      const name = utf8(file.name); const data = typeof file.data === 'string' ? utf8(file.data) : file.data; const crc = crc32(data);
      const local = new Uint8Array(30 + name.length); const lv = new DataView(local.buffer);
      u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, dosTime); u16(lv, 12, dosDate);
      u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); u16(lv, 28, 0); local.set(name, 30);
      locals.push(local, data);
      const central = new Uint8Array(46 + name.length); const cv = new DataView(central.buffer);
      u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, dosTime); u16(cv, 14, dosDate);
      u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, name.length); u32(cv, 42, offset); central.set(name, 46);
      centrals.push(central); offset += local.length + data.length;
    });
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, centralSize); u32(ev, 16, offset);
    const out = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
    [...locals, ...centrals, end].forEach(part => { out.set(part, cursor); cursor += part.length; });
    return out;
  };
  const colName = index => {
    let value = index + 1; let name = '';
    while (value) { const rem = (value - 1) % 26; name = String.fromCharCode(65 + rem) + name; value = Math.floor((value - 1) / 26); }
    return name;
  };
  const ST = { title: 1, sub: 2, section: 3, head: 4, text: 5, num: 6, money: 7, total: 8, totalMoney: 9, label: 10, note: 11, alt: 12, altNum: 13, altMoney: 14, center: 15, warn: 16, percent: 17 };
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0&quot; đ&quot;"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="7"><font><sz val="11"/><color rgb="FF1A2B24"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF174A37"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF5B6F66"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1A2B24"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF5B6F66"/><name val="Calibri"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D7656"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF174A37"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3EE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F8F6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAF9"/></patternFill></fill></fills>
<borders count="3"><border/><border><left style="thin"><color rgb="FFE1E8E4"/></left><right style="thin"><color rgb="FFE1E8E4"/></right><top style="thin"><color rgb="FFE1E8E4"/></top><bottom style="thin"><color rgb="FFE1E8E4"/></bottom></border><border><left style="thin"><color rgb="FF146047"/></left><right style="thin"><color rgb="FF146047"/></right><top style="thin"><color rgb="FF146047"/></top><bottom style="thin"><color rgb="FF146047"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="18">
<xf xfId="0" fontId="0"/><xf xfId="0" fontId="1" applyFont="1"/><xf xfId="0" fontId="2" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf>
<xf xfId="0" fontId="3" fillId="3" applyFont="1" applyFill="1"/><xf xfId="0" fontId="4" fillId="2" borderId="2" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf xfId="0" fontId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf xfId="0" fontId="0" borderId="1" numFmtId="164" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf xfId="0" fontId="0" borderId="1" numFmtId="165" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf xfId="0" fontId="5" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/><xf xfId="0" fontId="5" fillId="4" borderId="1" numFmtId="165" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf xfId="0" fontId="5" fillId="5" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf xfId="0" fontId="6" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf xfId="0" fontId="0" fillId="6" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf xfId="0" fontId="0" fillId="6" borderId="1" numFmtId="164" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf xfId="0" fontId="0" fillId="6" borderId="1" numFmtId="165" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf xfId="0" fontId="5" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf xfId="0" fontId="6" applyFont="1"/><xf xfId="0" fontId="0" borderId="1" numFmtId="166" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const cellXml = (r, c, value, style = ST.text, type = 'text') => {
    const ref = `${colName(c)}${r}`;
    if (value == null || value === '') return `<c r="${ref}" s="${style}"/>`;
    if (['number', 'money', 'percent'].includes(type)) {
      const numeric = type === 'percent' ? number(value) / 100 : number(value);
      return `<c r="${ref}" s="${style}"><v>${numeric}</v></c>`;
    }
    const shown = type === 'date' ? date(value) : type === 'datetime' ? dateTime(value) : value;
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escXml(excelCellText(shown))}</t></is></c>`;
  };
  const rowXml = (r, cells, height = 19) => `<row r="${r}" ht="${height}" customHeight="1">${cells.join('')}</row>`;
  const worksheet = (rows, widths, merges = [], freeze = 6, title = 'Báo cáo', filter = true, drawing = '') => {
    const safeWidths = widths.length ? widths : [18];
    const lastRow = rows.at(-1)?.r || 1; const lastCol = safeWidths.length;
    const filterXml = filter ? `<autoFilter ref="A6:${colName(lastCol - 1)}${Math.max(6, lastRow)}"/>` : '';
    const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${colName(lastCol - 1)}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${safeWidths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${number(width) || 18}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map(row => rowXml(row.r, row.cells, row.h)).join('')}</sheetData>${filterXml}${mergeXml}<pageMargins left="0.35" right="0.35" top="0.55" bottom="0.55" header="0.25" footer="0.25"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddHeader>&amp;L${escXml(COMPANY.name)}&amp;C${escXml(title)}&amp;R&amp;D</oddHeader><oddFooter>&amp;LNội bộ — không phát hành ra ngoài&amp;CTrang &amp;P / &amp;N&amp;R${escXml(COMPANY.software)}</oddFooter></headerFooter>${drawing}</worksheet>`;
  };
  const titleRows = (model, title, span) => {
    const last = colName(Math.max(0, span - 1)); const p = model.period || {};
    const line = `Số ${model.number} · ${periodLabel(p)} · Từ ${date(p.from) || p.from || '—'} đến ${date(p.to) || p.to || '—'} · Lập bởi ${model.meta.preparedBy || model.actor}`;
    return {
      rows: [
        { r: 1, h: 24, cells: [cellXml(1, 0, COMPANY.name, ST.title)] },
        { r: 2, h: 17, cells: [cellXml(2, 0, `${COMPANY.branch} · ${COMPANY.address}`, ST.sub)] },
        { r: 3, h: 22, cells: [cellXml(3, 0, title, ST.section)] },
        { r: 4, h: 18, cells: [cellXml(4, 0, line, ST.sub)] }
      ],
      merges: span > 1 ? [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`, `A4:${last}4`] : []
    };
  };
  const sectionSheet = (model, part) => {
    const head = titleRows(model, part.title, part.columns.length);
    const rows = [...head.rows, { r: 5, h: 8, cells: [] }, { r: 6, h: 26, cells: part.columns.map((col, i) => cellXml(6, i, col.label, ST.head)) }];
    part.rows.forEach((values, index) => {
      const r = index + 7; const alt = index % 2 === 1;
      rows.push({ r, h: 24, cells: part.columns.map((col, i) => {
        const style = col.type === 'money' ? (alt ? ST.altMoney : ST.money)
          : col.type === 'number' ? (alt ? ST.altNum : ST.num)
            : col.type === 'percent' ? ST.percent : (alt ? ST.alt : ST.text);
        return cellXml(r, i, values[i], style, col.type);
      }) });
    });
    if (!part.rows.length) rows.push({ r: 7, h: 22, cells: [cellXml(7, 0, 'Không có dữ liệu trong kỳ.', ST.note)] });
    if (part.total) {
      const r = 7 + Math.max(1, part.rows.length);
      rows.push({ r, h: 22, cells: part.columns.map((col, i) => cellXml(r, i, part.total[i], col.type === 'money' ? ST.totalMoney : ST.total, col.type)) });
    }
    if (part.note) {
      const r = 8 + Math.max(1, part.rows.length) + (part.total ? 1 : 0);
      rows.push({ r, h: 32, cells: [cellXml(r, 0, part.note, ST.note)] });
      head.merges.push(`A${r}:${colName(part.columns.length - 1)}${r}`);
    }
    return worksheet(rows, part.columns.map(col => col.width), head.merges, 6, part.title, part.columns.length > 0);
  };
  const coverSheet = (model, drawing = '') => {
    const p = model.period || {}; const rows = [
      { r: 1, h: 20, cells: [cellXml(1, 0, COMPANY.country, ST.center)] },
      { r: 2, h: 18, cells: [cellXml(2, 0, COMPANY.motto, ST.center)] },
      { r: 4, h: 30, cells: [cellXml(4, 0, COMPANY.name, ST.title)] },
      { r: 5, h: 18, cells: [cellXml(5, 0, `${COMPANY.branch} · ${COMPANY.address}`, ST.sub)] },
      { r: 7, h: 28, cells: [cellXml(7, 0, model.title, ST.title)] },
      { r: 8, h: 18, cells: [cellXml(8, 0, 'BÁO CÁO QUẢN TRỊ NỘI BỘ · DỮ LIỆU HỆ THỐNG', ST.warn)] },
      { r: 10, h: 24, cells: [cellXml(10, 0, 'THÔNG TIN BÁO CÁO', ST.section)] },
      { r: 11, h: 22, cells: [cellXml(11, 0, 'Chỉ tiêu', ST.head), cellXml(11, 1, 'Nội dung', ST.head)] }
    ];
    [
      ['Số báo cáo', model.number], ['Kỳ báo cáo', periodLabel(p)], ['Từ ngày', date(p.from) || p.from || '—'],
      ['Đến ngày', date(p.to) || p.to || '—'], ['Người lập', model.meta.preparedBy || model.actor],
      ['Mã nhân viên', model.meta.staffId || '—'], ['Ngày lập', dateTime(model.meta.issuedAt || new Date())],
      ['Trạng thái', model.meta.status || 'Bản làm việc'], ['Ghi chú', model.meta.note || model.note || '—']
    ].forEach((pair, index) => {
      const r = 12 + index; rows.push({ r, h: pair[0] === 'Ghi chú' ? 30 : 20, cells: [cellXml(r, 0, pair[0], ST.label), cellXml(r, 1, pair[1], ST.text)] });
    });
    rows.push({ r: 22, h: 24, cells: [cellXml(22, 0, 'TÓM TẮT ĐIỀU HÀNH', ST.section)] });
    rows.push({ r: 23, h: 22, cells: [cellXml(23, 0, 'Chỉ tiêu', ST.head), cellXml(23, 1, 'Giá trị', ST.head)] });
    model.summary.forEach(([label, value, type], index) => {
      const r = 24 + index; const style = type === 'money' ? ST.money : type === 'number' ? ST.num : type === 'percent' ? ST.percent : ST.text;
      rows.push({ r, h: 20, cells: [cellXml(r, 0, label, ST.text), cellXml(r, 1, value, style, type)] });
    });
    const sig = 25 + model.summary.length;
    rows.push({ r: sig, h: 24, cells: [cellXml(sig, 0, 'XÁC NHẬN', ST.section)] });
    rows.push({ r: sig + 1, h: 22, cells: ['Bộ phận', 'Họ và tên', 'Chức danh', 'Chữ ký', 'Ngày ký'].map((label, i) => cellXml(sig + 1, i, label, ST.head)) });
    model.signatures.forEach((label, index) => {
      const r = sig + 2 + index;
      rows.push({ r, h: 32, cells: [cellXml(r, 0, label, ST.text), cellXml(r, 1, index ? '' : model.meta.preparedBy, ST.text), cellXml(r, 2, label, ST.text), cellXml(r, 3, '', ST.text), cellXml(r, 4, '', ST.text)] });
    });
    return worksheet(rows, [34, 42, 28, 22, 18], [`A1:E1`, `A2:E2`, `A4:E4`, `A5:E5`, `A7:E7`, `A8:E8`, `A10:E10`, `A22:E22`, `A${sig}:E${sig}`], 10, model.title, false, drawing);
  };
  const uniqueSheetNames = model => {
    const used = new Set();
    return ['01-Bia', ...model.sections.map((part, index) => {
      let name = `${String(index + 2).padStart(2, '0')}-${part.name}`.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
      while (used.has(name)) name = `${name.slice(0, 28)}-${index + 2}`;
      used.add(name); return name;
    })];
  };
  const CHART_COLORS = ['267B5B', '4F72BB', 'D89F32', 'B76045', '7B61B8', '197678'];
  const chartTextProperties = (size = 1000, rotation = 0) => `<c:txPr><a:bodyPr${rotation ? ` rot="${rotation}"` : ''}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}"/></a:pPr><a:endParaRPr lang="vi-VN" sz="${size}"/></a:p></c:txPr>`;
  const chartTitleXml = (title, size = 1500) => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="${size}" b="1"/><a:t>${escXml(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  const chartNumberFormat = chart => String(chart.format || '').includes('đ')
    ? '[>=1000000]0.0,," triệu";[<=-1000000]-0.0,," triệu";#,##0" đ"'
    : chart.format || '#,##0';
  const seriesDataLabelsXml = (chart, seriesIndex) => {
    const format = chartNumberFormat(chart);
    const positions = chart.type === 'line' ? ['t', 'b', 'r'] : ['outEnd'];
    const position = positions[seriesIndex % positions.length];
    const common = `<c:numFmt formatCode="${escXml(format)}" sourceLinked="0"/>${chartTextProperties(900)}<c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>`;
    if (chart.type !== 'line' || chart.rows.length <= 10) return `<c:dLbls>${common}</c:dLbls>`;
    const step = Math.max(1, Math.ceil(chart.rows.length / 8));
    const indexes = chart.rows.map((_, index) => index).filter(index => index % step === 0 || index === chart.rows.length - 1);
    const labels = indexes.map(index => `<c:dLbl><c:idx val="${index}"/><c:numFmt formatCode="${escXml(format)}" sourceLinked="0"/>${chartTextProperties(900)}<c:dLblPos val="${position}"/><c:showVal val="1"/></c:dLbl>`).join('');
    return `<c:dLbls>${labels}<c:numFmt formatCode="${escXml(format)}" sourceLinked="0"/>${chartTextProperties(900)}<c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  };
  const doughnutDataLabelsXml = chart => `<c:dLbls><c:numFmt formatCode="${escXml(chartNumberFormat(chart))}" sourceLinked="0"/>${chartTextProperties(950)}<c:dLblPos val="bestFit"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator> · </c:separator><c:showLeaderLines val="1"/></c:dLbls>`;
  const chartLegendXml = position => `<c:legend><c:legendPos val="${position}"/><c:overlay val="0"/>${chartTextProperties(1000)}</c:legend>`;
  const chartCacheXml = (values, numeric = false, format = 'General') => {
    const tag = numeric ? 'numCache' : 'strCache';
    const points = values.map((value, index) => `<c:pt idx="${index}"><c:v>${escXml(numeric ? number(value) : displayValue(value, 'text'))}</c:v></c:pt>`).join('');
    return `<c:${tag}>${numeric ? `<c:formatCode>${escXml(format)}</c:formatCode>` : ''}<c:ptCount val="${values.length}"/>${points}</c:${tag}>`;
  };
  const prepareCharts = (model, names) => (model.charts || []).flatMap(config => {
    const sectionIndex = model.sections.findIndex(part => part.name === config.source);
    if (sectionIndex < 0) return [];
    const part = model.sections[sectionIndex];
    const doughnutLimit = Math.max(1, Number(config.maxRows || 8));
    if (config.type === 'doughnut' && part.rows.length > doughnutLimit) return [];
    const rows = part.rows.slice();
    const series = (config.series || []).filter(item => Number.isInteger(item.column) && item.column >= 0 && item.column < part.columns.length);
    const values = series.flatMap(item => rows.map(row => number(row[item.column])));
    if (!rows.length || !series.length || !values.some(value => value !== 0)) return [];
    if (config.type === 'doughnut' && values.some(value => value < 0)) return [];
    return [{
      ...config,
      type: config.type === 'column' && rows.length > 10 ? 'bar' : config.type,
      part,
      rows,
      series,
      sheetName: names[sectionIndex + 1],
      firstRow: 7,
      lastRow: 6 + rows.length
    }];
  }).slice(0, 3);
  const chartSeriesXml = (chart, item, index) => {
    const categoryCol = colName(chart.category);
    const valueCol = colName(item.column);
    const sheet = `'${String(chart.sheetName).replaceAll("'", "''")}'`;
    const categories = chart.rows.map(row => displayValue(row[chart.category], chart.part.columns[chart.category]?.type));
    const values = chart.rows.map(row => number(row[item.column]));
    const color = CHART_COLORS[index % CHART_COLORS.length];
    const marker = chart.type === 'line' ? '<c:marker><c:symbol val="circle"/><c:size val="7"/></c:marker>' : '';
    const labels = chart.type === 'doughnut' ? '' : seriesDataLabelsXml(chart, index);
    return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:strRef><c:f>${sheet}!$${valueCol}$6</c:f>${chartCacheXml([item.name || chart.part.columns[item.column].label])}</c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="28575"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>${marker}${labels}<c:cat><c:strRef><c:f>${sheet}!$${categoryCol}$${chart.firstRow}:$${categoryCol}$${chart.lastRow}</c:f>${chartCacheXml(categories)}</c:strRef></c:cat><c:val><c:numRef><c:f>${sheet}!$${valueCol}$${chart.firstRow}:$${valueCol}$${chart.lastRow}</c:f>${chartCacheXml(values, true, chart.format || '#,##0')}</c:numRef></c:val>${chart.type === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  };
  const chartXml = (chart, chartIndex) => {
    const series = chart.series.map((item, index) => chartSeriesXml(chart, item, index)).join('');
    if (chart.type === 'doughnut') {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart>${chartTitleXml(chart.title)}<c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/>${series}${doughnutDataLabelsXml(chart)}<c:firstSliceAng val="0"/><c:holeSize val="54"/></c:doughnutChart></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
    }
    const catAx = chartIndex * 2 + 1001; const valAx = catAx + 1;
    const horizontal = chart.type === 'bar';
    const chartBody = chart.type === 'line'
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="${catAx}"/><c:axId val="${valAx}"/></c:lineChart>`
      : `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="${horizontal ? 45 : 60}"/><c:overlap val="0"/><c:axId val="${catAx}"/><c:axId val="${valAx}"/></c:barChart>`;
    const unit = String(chart.format || '').includes('đ') ? 'Giá trị (VND)' : 'Giá trị';
    const skip = horizontal ? 1 : Math.max(1, Math.ceil(chart.rows.length / 10));
    const rotation = !horizontal && chart.rows.length > 8 ? -2700000 : 0;
    const categoryTitle = chart.part.columns[chart.category]?.label || 'Danh mục';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart>${chartTitleXml(chart.title)}<c:plotArea><c:layout/>${chartBody}<c:catAx><c:axId val="${catAx}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${horizontal ? 'l' : 'b'}"/>${chartTitleXml(categoryTitle, 1100)}<c:tickLblPos val="nextTo"/>${chartTextProperties(1000, rotation)}<c:crossAx val="${valAx}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:tickLblSkip val="${skip}"/></c:catAx><c:valAx><c:axId val="${valAx}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${horizontal ? 'b' : 'l'}"/><c:majorGridlines/>${chartTitleXml(unit, 1100)}<c:numFmt formatCode="${escXml(chartNumberFormat(chart))}" sourceLinked="0"/><c:tickLblPos val="nextTo"/>${chartTextProperties(1000)}<c:crossAx val="${catAx}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea>${chart.series.length > 1 ? chartLegendXml('b') : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart></c:chartSpace>`;
  };
  const chartPositions = charts => {
    const height = chart => chart.type === 'bar' ? Math.max(23, chart.rows.length * 2 + 7) : 23;
    if (charts.length === 1) return [{ fromCol: 6, fromRow: 1, toCol: 26, toRow: 1 + Math.max(27, height(charts[0])) }];
    if (charts.length === 2) {
      const firstTo = 1 + height(charts[0]);
      const secondFrom = firstTo + 2;
      return [
        { fromCol: 6, fromRow: 1, toCol: 26, toRow: firstTo },
        { fromCol: 6, fromRow: secondFrom, toCol: 26, toRow: secondFrom + height(charts[1]) }
      ];
    }
    const denseSecondary = charts.slice(1).some(chart => chart.type === 'bar' && chart.rows.length > 6);
    if (denseSecondary) {
      const secondFrom = 24; const secondTo = secondFrom + height(charts[1]);
      const thirdFrom = secondTo + 2;
      return [
        { fromCol: 6, fromRow: 1, toCol: 26, toRow: 22 },
        { fromCol: 6, fromRow: secondFrom, toCol: 26, toRow: secondTo },
        { fromCol: 6, fromRow: thirdFrom, toCol: 26, toRow: thirdFrom + height(charts[2]) }
      ];
    }
    const secondaryTo = 24 + Math.max(height(charts[1]), height(charts[2]));
    return [
      { fromCol: 6, fromRow: 1, toCol: 26, toRow: 22 },
      { fromCol: 6, fromRow: 24, toCol: 16, toRow: secondaryTo },
      { fromCol: 16, fromRow: 24, toCol: 26, toRow: secondaryTo }
    ];
  };
  const drawingXml = charts => {
    const positions = chartPositions(charts);
    const anchors = charts.map((chart, index) => {
      const pos = positions[index];
      return `<xdr:twoCellAnchor><xdr:from><xdr:col>${pos.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${pos.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${pos.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${pos.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="${escXml(chart.title)}"/><xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${index + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`;
  };
  const buildXlsxFromModel = model => {
    const names = uniqueSheetNames(model);
    const charts = prepareCharts(model, names);
    const drawing = charts.length ? '<drawing r:id="rId1"/>' : '';
    const sheets = [coverSheet(model, drawing), ...model.sections.map(part => sectionSheet(model, part))];
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets>${names.map((name, i) => `<sheet name="${escXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${charts.length ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}${charts.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escXml(model.title)} — ${escXml(periodLabel(model.period))}</dc:title><dc:creator>${escXml(model.meta.preparedBy || model.actor)}</dc:creator><cp:lastModifiedBy>${escXml(model.meta.preparedBy || model.actor)}</cp:lastModifiedBy></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>SuperMarket FLY</Application><Company>${escXml(COMPANY.name)}</Company></Properties>`;
    const files = [
      { name: '[Content_Types].xml', data: contentTypes }, { name: '_rels/.rels', data: rootRels },
      { name: 'docProps/core.xml', data: core }, { name: 'docProps/app.xml', data: app },
      { name: 'xl/workbook.xml', data: workbook }, { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
      { name: 'xl/styles.xml', data: stylesXml },
      ...sheets.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data }))
    ];
    if (charts.length) {
      files.push(
        { name: 'xl/worksheets/_rels/sheet1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` },
        { name: 'xl/drawings/drawing1.xml', data: drawingXml(charts) },
        { name: 'xl/drawings/_rels/drawing1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${charts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('')}</Relationships>` },
        ...charts.map((chart, i) => ({ name: `xl/charts/chart${i + 1}.xml`, data: chartXml(chart, i) }))
      );
    }
    return zipStore(files);
  };
  const buildXlsx = (kind, report, meta = {}) => buildXlsxFromModel(modelOf(kind, report, meta));
  const fileName = (kind, report, meta, extension) => {
    const model = modelOf(kind, report, meta);
    return `${safeFile(`${model.prefix}_${model.title}_${model.period?.period || ''}_${model.number}`)}${extension}`;
  };
  const downloadCsv = (kind, report, meta = {}) => downloadBlob(fileName(kind, report, meta, '.csv'), buildCsv(kind, report, meta), 'text/csv;charset=utf-8');
  const downloadExcel = (kind, report, meta = {}) => downloadBlob(fileName(kind, report, meta, '.xlsx'), buildXlsx(kind, report, meta), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const downloadConfigExcel = (config, meta = {}) => {
    const model = configModel(config, meta);
    const bytes = buildXlsxFromModel(model);
    downloadBlob(`${safeFile(`${model.prefix}_${model.title}_${model.number}`)}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };
  window.FLY_DEPARTMENT_EXPORT = {
    buildCsv, buildXlsx, downloadCsv, downloadExcel, modelOf, csvRows,
    buildConfigXlsx: (config, meta = {}) => buildXlsxFromModel(configModel(config, meta)),
    downloadConfigExcel,
    downloadConfigCsv: (config, meta = {}) => {
      const model = configModel(config, meta);
      downloadBlob(`${safeFile(`${model.prefix}_${model.title}_${model.number}`)}.csv`, `\uFEFF${csvRows(model).map(row => row.map(csvCell).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
    }
  };
})();
