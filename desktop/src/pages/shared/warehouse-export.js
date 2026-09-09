(() => {
  const COMPANY = {
    country: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    motto: 'Độc lập - Tự do - Hạnh phúc',
    name: 'SUPERMARKET FLY',
    branch: 'Cửa hàng Hà Nội',
    address: 'Hà Nội, Việt Nam',
    software: 'Hệ thống quản lý nội bộ SuperMarket FLY',
    kind: 'Báo cáo Thủ kho — không phải báo cáo tổng cửa hàng'
  };

  const pad2 = value => String(value).padStart(2, '0');
  const moneyPlain = value => Math.round(Number(value || 0));
  const qtyPlain = value => Number(value || 0);
  const vnParts = value => {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-');
      return { year, month, day };
    }
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value;
    return { year: get('year'), month: get('month'), day: get('day') };
  };
  const vnYmd = value => {
    const part = vnParts(value);
    return part ? `${part.year}-${part.month}-${part.day}` : '';
  };
  const fmtDate = value => {
    const part = vnParts(value);
    return part ? `${part.day}/${part.month}/${part.year}` : '';
  };
  const fmtDateTime = value => value
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
    : '';
  const periodTypeLabel = type => ({ day: 'Ngày', month: 'Tháng', quarter: 'Quý', year: 'Năm' }[type] || 'Kỳ');
  const formatPeriodLabel = (type, value, fallback = '') => {
    const raw = String(value || '').trim();
    if ((type === 'month' || type === 'tháng' || !type) && /^\d{4}-\d{2}$/.test(raw)) {
      return `Tháng ${raw.slice(5, 7)}/${raw.slice(0, 4)}`;
    }
    if ((type === 'day' || type === 'ngày') && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return `Ngày ${raw.slice(8, 10)}/${raw.slice(5, 7)}/${raw.slice(0, 4)}`;
    }
    const quarter = raw.match(/^(\d{4})-Q([1-4])$/i);
    if (quarter) return `Quý ${quarter[2]}/${quarter[1]}`;
    if ((type === 'year' || type === 'năm') && /^\d{4}$/.test(raw)) return `Năm ${raw}`;
    const text = String(fallback || raw).trim();
    if (!text || /[\uFFFD]/.test(text) || /^Th.ng\s/i.test(text) || /Thng\s/i.test(text)) return raw || text;
    return text;
  };
  const writeoffKind = row => {
    if (String(row?.LoaiXuat || '').trim() === 'Sử dụng nội bộ') return 'reuse';
    if (row?.MaDT) return 'return';
    return 'scrap';
  };
  const writeoffKindLabel = kind => ({ scrap: 'Hủy hàng', reuse: 'Tận dụng NV', return: 'Đổi trả loại bỏ' }[kind] || 'Khác');
  const writeoffSplit = (summary = {}) => {
    const slReturn = Number(summary.SLDoiTraLoaiBo || 0);
    const gtReturn = Number(summary.GiaTriDoiTraLoaiBo || 0);
    return {
      slScrap: Math.max(0, Number(summary.SLHuy || 0) - slReturn),
      gtScrap: Math.max(0, Number(summary.GiaTriHuy || 0) - gtReturn),
      slReuse: Number(summary.SLTanDung || 0),
      gtReuse: Number(summary.GiaTriTanDung || 0),
      slReturn,
      gtReturn,
      slTotal: Number(summary.TongSoLuong || 0),
      gtTotal: Number(summary.TongGiaTri || 0),
      tickets: Number(summary.SoPhieu || 0),
      products: Number(summary.SoMatHang || 0)
    };
  };
  const fileStamp = (value = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}${get('month')}${get('day')}`;
  };
  const reportNumber = (report = {}, meta = {}) => {
    if (meta.number) return meta.number;
    const period = report.period || {};
    return `KHO-${String(period.periodType || 'ky').toUpperCase()}-${String(period.period || fileStamp()).replace(/[^A-Za-z0-9-]/g, '')}`;
  };
  const safeFile = value => String(value || 'bao-cao-kho').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const exportFileName = (report, meta, ext) => {
    const period = report.period || {};
    const kind = { day: 'Ngay', month: 'Thang', quarter: 'Quy', year: 'Nam' }[period.periodType] || 'Ky';
    return safeFile(`BCK_BaoCaoKho_${kind}_${period.period || fileStamp()}_${meta.number || fileStamp()}`) + ext;
  };
  const preparedBy = (meta = {}) => meta.preparedBy || 'Thủ kho';
  const issuedAt = (meta = {}) => meta.issuedAt || new Date();
  const hangDiDauText = row => {
    if (row?.HangDiDau) return row.HangDiDau;
    const restock = Number(row?.SLNhapLai || 0);
    const scrap = Number(row?.SLLoaiBo || row?.SLKhongNhapLai || 0);
    const pending = Math.max(0, Number(row?.SLTra || 0) - restock - scrap);
    const parts = [];
    if (restock) parts.push(`Nhập lại kho bán ${restock}`);
    if (scrap) parts.push(`Loại bỏ / vứt ${scrap} — không cộng tồn (đã trừ lúc bán)`);
    if (pending) parts.push(`Chưa xử lý kho ${pending}`);
    return parts.join(' · ') || '';
  };
  const writeoffDoc = row => [row?.MaPX, row?.MaKK, row?.MaDT].filter(Boolean).join(' · ');
  const lowShortage = row => Math.max(0, Number(row?.TonKhoToiThieu || 0) - Number(row?.SLTon || 0));
  const writeoffByDay = (report) => {
    const map = new Map();
    (report?.hangRoiKhoBan?.lines || []).forEach(row => {
      const key = vnYmd(row.NgayXuat) || fmtDate(row.NgayXuat) || '—';
      if (!map.has(key)) map.set(key, { key, label: fmtDate(row.NgayXuat) || key, scrap: 0, reuse: 0, ret: 0, value: 0 });
      const bucket = map.get(key);
      const sl = Number(row.SoLuong || 0);
      const kind = writeoffKind(row);
      if (kind === 'reuse') bucket.reuse += sl;
      else if (kind === 'return') bucket.ret += sl;
      else bucket.scrap += sl;
      bucket.value += Number(row.GiaTri || 0);
    });
    return [...map.values()];
  };
  const writeoffByProduct = (report) => {
    const map = new Map();
    (report?.hangRoiKhoBan?.lines || []).forEach(row => {
      const key = row.MaSP || row.TenSP || '—';
      if (!map.has(key)) map.set(key, { ma: row.MaSP || '', label: row.TenSP || key, scrap: 0, reuse: 0, ret: 0, sl: 0, value: 0 });
      const bucket = map.get(key);
      const sl = Number(row.SoLuong || 0);
      const kind = writeoffKind(row);
      if (kind === 'reuse') bucket.reuse += sl;
      else if (kind === 'return') bucket.ret += sl;
      else bucket.scrap += sl;
      bucket.sl += sl;
      bucket.value += Number(row.GiaTri || 0);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  };

  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const downloadBlob = (filename, content, mime) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const headerRows = (report, meta) => {
    const period = report.period || {};
    const m = report.movement || {};
    const stock = report.stock || {};
    const writeoff = writeoffSplit(report.hangRoiKhoBan?.summary || {});
    const issued = issuedAt(meta);
    return [
      [COMPANY.country],
      [COMPANY.motto],
      [''],
      [COMPANY.name],
      [COMPANY.branch],
      [COMPANY.address],
      [COMPANY.kind],
      [''],
      ['BÁO CÁO TỔNG HỢP KHO'],
      ['Số báo cáo', reportNumber(report, meta)],
      ['Loại kỳ', periodTypeLabel(period.periodType)],
      ['Kỳ báo cáo', formatPeriodLabel(period.periodType, period.period, period.label)],
      ['Từ ngày', fmtDate(period.from) || period.from || ''],
      ['Đến ngày', fmtDate(period.to) || period.to || ''],
      ['Người lập', preparedBy(meta)],
      ['Ngày lập', fmtDateTime(issued)],
      ['Phần mềm', COMPANY.software],
      ['Ghi chú nộp', meta.note || ''],
      [''],
      ['I. TỔNG HỢP NHẬP – XUẤT – TỒN'],
      ['Chỉ tiêu', 'Số lượng / giá trị', 'Diễn giải'],
      ['Tồn đầu kỳ', qtyPlain(m.SoLuongDauKy), 'Đơn vị hàng đầu kỳ'],
      ['Nhập trong kỳ', qtyPlain(m.SoLuongNhap), 'Tổng đơn vị nhập'],
      ['Xuất trong kỳ', qtyPlain(m.SoLuongXuat), 'Tổng đơn vị xuất'],
      ['Điều chỉnh ròng', qtyPlain(m.DieuChinhRong), 'Kiểm kê / điều chỉnh'],
      ['Tồn cuối kỳ', qtyPlain(m.SoLuongCuoiKy), 'Đơn vị hàng cuối kỳ'],
      ['Tồn hiện tại (sổ)', qtyPlain(stock.TongTon), 'Đơn vị đang tồn lúc lập'],
      ['Giá trị tồn (giá vốn)', moneyPlain(stock.GiaTriTon), 'VND'],
      ['Mặt hàng dưới tồn tối thiểu', qtyPlain(stock.TonThap), 'Số mã SP'],
      ['Mặt hàng hết hàng', qtyPlain(stock.HetHang), 'Số mã SP'],
      [''],
      ['II. HÀNG ĐÃ XUẤT — KHÔNG CÒN BÁN'],
      ['Chỉ tiêu', 'Số lượng', 'Giá trị vốn (VND)'],
      ['Hủy hàng', writeoff.slScrap, writeoff.gtScrap],
      ['Tận dụng nhân viên', writeoff.slReuse, writeoff.gtReuse],
      ['Đổi trả loại bỏ', writeoff.slReturn, writeoff.gtReturn],
      ['Tổng cộng', writeoff.slTotal, writeoff.gtTotal],
      ['Số phiếu / số mặt hàng', writeoff.tickets, writeoff.products],
      [''],
      ['BIỂU ĐỒ CƠ CẤU (số lượng)'],
      ['Nhóm', 'Số lượng', 'Giá trị (VND)', 'Thanh tỷ lệ'],
      ['Hủy hàng', writeoff.slScrap, writeoff.gtScrap, '█'.repeat(Math.max(0, Math.round((writeoff.slTotal ? writeoff.slScrap / writeoff.slTotal : 0) * 20)))],
      ['Tận dụng NV', writeoff.slReuse, writeoff.gtReuse, '█'.repeat(Math.max(0, Math.round((writeoff.slTotal ? writeoff.slReuse / writeoff.slTotal : 0) * 20)))],
      ['Đổi trả loại bỏ', writeoff.slReturn, writeoff.gtReturn, '█'.repeat(Math.max(0, Math.round((writeoff.slTotal ? writeoff.slReturn / writeoff.slTotal : 0) * 20)))],
      [''],
      ['CHI TIẾT THEO NGÀY CÓ PHÁT SINH'],
      ['Ngày', 'Hủy hàng', 'Tận dụng NV', 'Đổi trả loại bỏ', 'Tổng SL', 'Giá trị vốn (VND)'],
      ...writeoffByDay(report).map(row => [row.label, row.scrap, row.reuse, row.ret, row.scrap + row.reuse + row.ret, moneyPlain(row.value)])
    ];
  };

  const writeoffDetailRows = (report) => {
    const lines = report.hangRoiKhoBan?.lines || [];
    return [
      [''],
      ['III. CHI TIẾT HÀNG ĐÃ XUẤT — KHÔNG CÒN BÁN'],
      ['STT', 'Mã PX', 'Ngày xuất', 'Loại xuất', 'Mã KK', 'Mã DT', 'Mã SP', 'Sản phẩm', 'ĐVT', 'Số lượng', 'Đơn giá vốn (VND)', 'Thành tiền (VND)', 'Nhóm', 'Nguồn', 'Ảnh hưởng tồn', 'Ghi chú'],
      ...lines.map((row, index) => [
        index + 1, row.MaPX, fmtDate(row.NgayXuat), row.LoaiXuat, row.MaKK, row.MaDT, row.MaSP, row.TenSP, row.DonViTinh,
        qtyPlain(row.SoLuong), moneyPlain(row.DonGia), moneyPlain(row.GiaTri), row.PhanLoai, row.Nguon, row.AnhHuongTon, row.GhiChu
      ]),
      ['', '', '', '', '', '', '', 'TỔNG CỘNG', '', qtyPlain(report.hangRoiKhoBan?.summary?.TongSoLuong), '', moneyPlain(report.hangRoiKhoBan?.summary?.TongGiaTri), '', '', '', '']
    ];
  };

  const lowStockRows = (report) => {
    const rows = report.lowStock || [];
    return [
      [''],
      ['IV. TỒN THẤP — ƯU TIÊN BỔ SUNG'],
      ['STT', 'Mã SP', 'Sản phẩm', 'ĐVT', 'Tồn hiện tại', 'Tồn tối thiểu', 'Thiếu'],
      ...rows.map((row, index) => [index + 1, row.MaSP, row.TenSP, row.DonViTinh, qtyPlain(row.SLTon), qtyPlain(row.TonKhoToiThieu), lowShortage(row)])
    ];
  };

  const returnRows = (report) => {
    const tickets = report.doiTra?.tickets || [];
    const products = report.doiTra?.products || [];
    const summary = report.doiTra?.summary || {};
    return [
      [''],
      ['V. ĐỔI TRẢ KHÁCH HÀNG'],
      ['Số phiếu', summary.SoPhieu || 0, 'Hoàn tiền / Đổi hàng', `${summary.SoHoanTien || 0} / ${summary.SoDoiHang || 0}`, 'Tiền đã hoàn (VND)', moneyPlain(summary.TienHoan)],
      [''],
      ['STT', 'Mã DT', 'Hóa đơn', 'Khách', 'Hình thức', 'Lý do', 'Tiền hoàn (VND)', 'Trạng thái', 'Trách nhiệm', 'Hàng đi đâu', 'Thu ngân lập', 'Thủ kho', 'Quản lý'],
      ...tickets.map((row, index) => [
        index + 1, row.MaDT, row.MaHD, row.TenKH || 'Khách vãng lai', row.HinhThucXuLy, row.LyDo, moneyPlain(row.SoTienHoan),
        row.TrangThai, row.BuocCanXuLy, hangDiDauText(row), row.NguoiLap, row.NguoiKiemTra, row.NguoiDuyet
      ]),
      [''],
      ['Sản phẩm đổi trả'],
      ['STT', 'Mã SP', 'Sản phẩm', 'SL trả', 'Nhập lại kho', 'Loại bỏ / vứt', 'Hàng đi đâu', 'Lý do'],
      ...products.map((row, index) => [
        index + 1, row.MaSP, row.TenSP, qtyPlain(row.SLTra), qtyPlain(row.SLNhapLai), qtyPlain(row.SLLoaiBo || row.SLKhongNhapLai),
        hangDiDauText(row), row.LyDoMau
      ])
    ];
  };

  const dailyRows = (report) => {
    const rows = report.daily || [];
    return [
      [''],
      ['VI. BIẾN ĐỘNG KHO THEO NGÀY'],
      ['STT', 'Ngày', 'Nhập', 'Xuất', 'Điều chỉnh ròng', 'Tồn cuối ngày', 'Số chứng từ nhập', 'Số chứng từ xuất'],
      ...rows.map((row, index) => [
        index + 1, fmtDate(row.Ngay), qtyPlain(row.SoLuongNhap), qtyPlain(row.SoLuongXuat), qtyPlain(row.DieuChinhRong),
        qtyPlain(row.TonCuoiNgay), qtyPlain(row.SoChungTuNhap), qtyPlain(row.SoChungTuXuat)
      ])
    ];
  };

  const documentRows = (report) => {
    const rows = report.recentDocuments || [];
    return [
      [''],
      ['VII. CHỨNG TỪ TRONG KỲ'],
      ['STT', 'Mã chứng từ', 'Loại', 'Ngày', 'Người lập', 'Trạng thái', 'Giá trị (VND)'],
      ...rows.map((row, index) => [
        index + 1, row.MaChungTu, row.LoaiChungTu, fmtDateTime(row.NgayChungTu), row.NguoiLap, row.TrangThai, moneyPlain(row.GiaTri)
      ])
    ];
  };

  const signatureRows = (meta) => [
    [''],
    ['VIII. XÁC NHẬN'],
    ['Bộ phận', 'Họ và tên', 'Chức danh', 'Chữ ký', 'Ngày ký'],
    ['Thủ kho lập báo cáo', preparedBy(meta), 'Thủ kho', '', ''],
    ['Quản lý cửa hàng', '', 'Quản lý / Admin', '', ''],
    [''],
    ['Ghi chú in ấn', 'Bản CSV/Excel này là chứng từ nội bộ. In kèm bản giấy trắng mực đen khi nộp lưu. Chi tiết đầy đủ từng dòng nằm ở các mục III–VII.']
  ];

  const allCsvRows = (report, meta) => [
    ...headerRows(report, meta),
    ...writeoffDetailRows(report),
    ...lowStockRows(report),
    ...returnRows(report),
    ...dailyRows(report),
    ...documentRows(report),
    ...signatureRows(meta)
  ];

  const buildEnterpriseCsv = (report, meta = {}) => `\uFEFF${allCsvRows(report, meta).map(row => row.map(csvCell).join(',')).join('\r\n')}`;

  const xml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  const sheetName = value => xml(String(value || 'Sheet').replace(/[:\\/?*[\]]/g, '-').slice(0, 31));
  const cellXml = (value, type = 'auto', style = '') => {
    if (value == null || value === '') return `<Cell${style ? ` ss:StyleID="${style}"` : ''}/>`;
    const numeric = type === 'number' || (type === 'auto' && typeof value === 'number' && Number.isFinite(value));
    const styleId = style || (numeric ? 'sNum' : 'sText');
    if (numeric) {
      return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${Number(value)}</Data></Cell>`;
    }
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${xml(value)}</Data></Cell>`;
  };
  const rowXml = (cells, height = 0) => `<Row${height ? ` ss:Height="${height}"` : ''}>${cells.join('')}</Row>`;
  const colXml = widths => widths.map((width, index) => `<Column ss:Index="${index + 1}" ss:AutoFitWidth="0" ss:Width="${width}"/>`).join('');
  const sheetTitleRows = (title, report, meta) => {
    const period = report.period || {};
    return [
      rowXml([cellXml(COMPANY.name, 's', 'sTitle')], 22),
      rowXml([cellXml(`${COMPANY.branch} · ${COMPANY.kind}`, 's', 'sSub')], 16),
      rowXml([cellXml(title, 's', 'sSheetTitle')], 20),
      rowXml([cellXml(`Số ${reportNumber(report, meta)} · ${formatPeriodLabel(period.periodType, period.period, period.label)} · Từ ${fmtDate(period.from) || period.from || '—'} đến ${fmtDate(period.to) || period.to || '—'} · Lập bởi ${preparedBy(meta)}`, 's', 'sSub')], 16),
      rowXml([cellXml('')], 8)
    ];
  };
  const sheetXml = (name, rows, widths, freezeRow = 6) => {
    const cols = colXml(widths);
    return `<Worksheet ss:Name="${sheetName(name)}"><Table ss:DefaultRowHeight="18">${cols}${rows.join('')}</Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup>
        <Layout x:Orientation="Landscape"/>
        <Header x:Margin="0.28" x:Data="&amp;L${xml(COMPANY.name)}&amp;C${xml(name)}&amp;R&amp;D"/>
        <Footer x:Margin="0.28" x:Data="&amp;LNội bộ — không phát hành ra ngoài&amp;CTrang &amp;P / &amp;N&amp;R${xml(COMPANY.software)}"/>
      </PageSetup><FitToPage/><Print><ValidPrinterInfo/><PaperSizeIndex>9</PaperSizeIndex><FitWidth>1</FitWidth><FitHeight>0</FitHeight></Print>
      <FreezePanes/><FrozenNoSplit/><SplitHorizontal>${freezeRow}</SplitHorizontal><TopRowBottomPane>${freezeRow}</TopRowBottomPane></WorksheetOptions>
    </Worksheet>`;
  };

  const coverSheet = (report, meta) => {
    const period = report.period || {};
    const rows = [
      rowXml([cellXml(COMPANY.country, 's', 'sCenter')], 20),
      rowXml([cellXml(COMPANY.motto, 's', 'sItalic')], 18),
      rowXml([cellXml(COMPANY.name, 's', 'sTitle')], 28),
      rowXml([cellXml(`${COMPANY.branch} · ${COMPANY.address}`, 's', 'sSub')]),
      rowXml([cellXml('BÁO CÁO TỔNG HỢP KHO', 's', 'sTitle')], 26),
      rowXml([cellXml(COMPANY.kind, 's', 'sWarn')]),
      rowXml([cellXml('')]),
      rowXml([cellXml('Chỉ tiêu', 's', 'sHead'), cellXml('Nội dung', 's', 'sHead')]),
      ...[
        ['Số báo cáo', reportNumber(report, meta)],
        ['Loại kỳ', periodTypeLabel(period.periodType)],
        ['Kỳ báo cáo', formatPeriodLabel(period.periodType, period.period, period.label)],
        ['Từ ngày', fmtDate(period.from) || period.from || ''],
        ['Đến ngày', fmtDate(period.to) || period.to || ''],
        ['Người lập', preparedBy(meta)],
        ['Mã nhân viên lập', meta.staffId || ''],
        ['Ngày lập', fmtDateTime(issuedAt(meta))],
        ['Trạng thái', meta.status || 'Bản làm việc'],
        ['Ghi chú nộp', meta.note || '']
      ].map(([label, value]) => rowXml([cellXml(label, 's', 'sLabel'), cellXml(value)])),
      rowXml([cellXml('')]),
      rowXml([cellXml('TÓM TẮT ĐIỀU HÀNH', 's', 'sSection')]),
      rowXml([cellXml('Chỉ tiêu', 's', 'sHead'), cellXml('Giá trị', 's', 'sHead'), cellXml('Đơn vị', 's', 'sHead')])
    ];
    const m = report.movement || {};
    const stock = report.stock || {};
    const writeoff = writeoffSplit(report.hangRoiKhoBan?.summary || {});
    const summary = [
      ['Tồn đầu kỳ', qtyPlain(m.SoLuongDauKy), 'Đơn vị'],
      ['Nhập trong kỳ', qtyPlain(m.SoLuongNhap), 'Đơn vị'],
      ['Xuất trong kỳ', qtyPlain(m.SoLuongXuat), 'Đơn vị'],
      ['Tồn cuối kỳ', qtyPlain(m.SoLuongCuoiKy), 'Đơn vị'],
      ['Giá trị tồn', moneyPlain(stock.GiaTriTon), 'VND'],
      ['Hàng đã xuất — không còn bán', moneyPlain(writeoff.gtTotal), 'VND'],
      ['  Trong đó hủy hàng', moneyPlain(writeoff.gtScrap), 'VND'],
      ['  Trong đó tận dụng NV', moneyPlain(writeoff.gtReuse), 'VND'],
      ['  Trong đó đổi trả loại bỏ', moneyPlain(writeoff.gtReturn), 'VND'],
      ['Mặt hàng dưới tồn tối thiểu', qtyPlain(stock.TonThap), 'Mã SP']
    ];
    summary.forEach(([label, value, unit]) => {
      rows.push(rowXml([cellXml(label), cellXml(value, 'number', unit === 'VND' ? 'sMoney' : 'sNum'), cellXml(unit)]));
    });
    rows.push(rowXml([cellXml('')]));
    rows.push(rowXml([cellXml('XÁC NHẬN', 's', 'sSection')]));
    rows.push(rowXml([cellXml('Bộ phận', 's', 'sHead'), cellXml('Họ và tên', 's', 'sHead'), cellXml('Chức danh', 's', 'sHead'), cellXml('Chữ ký', 's', 'sHead'), cellXml('Ngày ký', 's', 'sHead')]));
    rows.push(rowXml([cellXml('Thủ kho lập báo cáo'), cellXml(preparedBy(meta)), cellXml('Thủ kho'), cellXml(''), cellXml('')]));
    rows.push(rowXml([cellXml('Quản lý cửa hàng'), cellXml(''), cellXml('Quản lý / Admin'), cellXml(''), cellXml('')]));
    rows.push(rowXml([cellXml('')]));
    rows.push(rowXml([cellXml('File Excel chuẩn nội bộ: có bìa, tổng hợp, chi tiết, tồn thấp, đổi trả, biến động ngày, biểu đồ và chữ ký. In khổ A4 ngang khi nộp lưu.', 's', 'sNote')]));
    return sheetXml('01-Bia', rows, [42, 88, 36, 28, 28], 2);
  };

  const tableSheet = (name, title, report, meta, headers, dataRows, { moneyCols = [], numberCols = [], totalRow = null, widths = null, wrapCols = [] } = {}) => {
    const colWidths = widths || headers.map((label, index) => {
      if (index === 0) return 28;
      if (moneyCols.includes(index) || numberCols.includes(index)) return 16;
      return Math.max(18, Math.min(42, String(label).length * 1.6 + 8));
    });
    const head = rowXml(headers.map(label => cellXml(label, 's', 'sHead')), 22);
    const body = dataRows.map(row => rowXml(row.map((value, index) => {
      if (moneyCols.includes(index)) return cellXml(moneyPlain(value), 'number', 'sMoney');
      if (numberCols.includes(index)) return cellXml(qtyPlain(value), 'number', 'sNum');
      return cellXml(value, 's', wrapCols.includes(index) ? 'sWrap' : 'sText');
    }), 18));
    const total = totalRow
      ? [rowXml(totalRow.map((value, index) => {
        if (value === '' || value == null) return cellXml('', 's', 'sTotal');
        if (moneyCols.includes(index) && typeof value !== 'string') return cellXml(moneyPlain(value), 'number', 'sTotalMoney');
        if (numberCols.includes(index) && typeof value !== 'string') return cellXml(qtyPlain(value), 'number', 'sTotal');
        return cellXml(value, 's', 'sTotal');
      }), 20)]
      : [];
    const empty = dataRows.length ? [] : [rowXml([cellXml('Không có dữ liệu trong kỳ.', 's', 'sNote')])];
    return sheetXml(name, [...sheetTitleRows(title, report, meta), head, ...body, ...empty, ...total], colWidths);
  };

  const barCells = (value, max, color, slots = 18) => {
    const filled = max ? Math.round(Math.max(0, Number(value) || 0) / max * slots) : 0;
    return Array.from({ length: slots }, (_, index) => cellXml('', 's', index < filled ? color : 'sBarEmpty'));
  };

  const chartSheet = (report, meta) => {
    const writeoff = writeoffSplit(report.hangRoiKhoBan?.summary || {});
    const days = writeoffByDay(report);
    const maxQty = Math.max(1, writeoff.slScrap, writeoff.slReuse, writeoff.slReturn, ...days.map(row => row.scrap + row.reuse + row.ret));
    const rows = [
      ...sheetTitleRows('Biểu đồ hàng đã xuất — không còn bán', report, meta),
      rowXml([cellXml('1. Cơ cấu số lượng và giá trị vốn', 's', 'sSection')]),
      rowXml([cellXml('Nhóm', 's', 'sHead'), cellXml('Số lượng', 's', 'sHead'), cellXml('Giá trị (VND)', 's', 'sHead'), cellXml('Tỷ trọng SL', 's', 'sHead'), cellXml('Biểu đồ số lượng (mỗi ô ≈ tỷ lệ)', 's', 'sHead')]),
      ...[
        ['Hủy hàng', writeoff.slScrap, writeoff.gtScrap, 'sBarScrap'],
        ['Tận dụng NV', writeoff.slReuse, writeoff.gtReuse, 'sBarReuse'],
        ['Đổi trả loại bỏ', writeoff.slReturn, writeoff.gtReturn, 'sBarReturn']
      ].map(([label, sl, gt, color]) => rowXml([
        cellXml(label, 's', 'sText'),
        cellXml(sl, 'number', 'sNum'),
        cellXml(gt, 'number', 'sMoney'),
        cellXml(writeoff.slTotal ? `${Math.round(sl / writeoff.slTotal * 1000) / 10}%` : '0%', 's', 'sText'),
        ...barCells(sl, maxQty, color)
      ], 20)),
      rowXml([cellXml('TỔNG', 's', 'sTotal'), cellXml(writeoff.slTotal, 'number', 'sTotal'), cellXml(writeoff.gtTotal, 'number', 'sTotalMoney'), cellXml('100%', 's', 'sTotal')]),
      rowXml([cellXml('')]),
      rowXml([cellXml('2. Số lượng theo ngày có phát sinh — dùng cột này để Excel vẽ biểu đồ Insert → Chart', 's', 'sSection')]),
      rowXml([cellXml('Ngày', 's', 'sHead'), cellXml('Hủy hàng', 's', 'sHead'), cellXml('Tận dụng NV', 's', 'sHead'), cellXml('Đổi trả loại bỏ', 's', 'sHead'), cellXml('Tổng SL', 's', 'sHead'), cellXml('Giá trị vốn (VND)', 's', 'sHead')]),
      ...(days.length ? days.map(row => rowXml([
        cellXml(row.label, 's', 'sText'),
        cellXml(row.scrap, 'number', 'sNum'),
        cellXml(row.reuse, 'number', 'sNum'),
        cellXml(row.ret, 'number', 'sNum'),
        cellXml(row.scrap + row.reuse + row.ret, 'number', 'sNum'),
        cellXml(row.value, 'number', 'sMoney')
      ])) : [rowXml([cellXml('Kỳ này chưa có ngày phát sinh.', 's', 'sNote')])]),
      rowXml([cellXml('')]),
      rowXml([cellXml('Ghi chú: thanh màu ở mục 1 là biểu đồ tỷ lệ ngay trong file. Mục 2 là số liệu nguồn — bôi đen 6 cột rồi chèn biểu đồ cột chồng nếu cần bản vẽ Excel gốc.', 's', 'sNote')])
    ];
    return sheetXml('09-Bieu do', rows, [28, 16, 18, 16, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8], 6);
  };

  const buildWorkbookXml = (report, meta = {}) => {
    const writeoffLines = report.hangRoiKhoBan?.lines || [];
    const writeoff = writeoffSplit(report.hangRoiKhoBan?.summary || {});
    const nxt = [
      ['Tồn đầu kỳ', qtyPlain(report.movement?.SoLuongDauKy), '', 'Đơn vị hàng'],
      ['Nhập trong kỳ', qtyPlain(report.movement?.SoLuongNhap), '', 'Đơn vị hàng'],
      ['Xuất trong kỳ', qtyPlain(report.movement?.SoLuongXuat), '', 'Đơn vị hàng'],
      ['Điều chỉnh ròng', qtyPlain(report.movement?.DieuChinhRong), '', 'Đơn vị hàng'],
      ['Tồn cuối kỳ', qtyPlain(report.movement?.SoLuongCuoiKy), '', 'Đơn vị hàng'],
      ['Giá trị tồn hiện tại', '', moneyPlain(report.stock?.GiaTriTon), 'VND']
    ];
    const writeoffRows = writeoffLines.map((row, index) => [
      index + 1, row.MaPX, fmtDate(row.NgayXuat), row.LoaiXuat, row.MaKK, row.MaDT, row.MaSP, row.TenSP, row.DonViTinh,
      row.SoLuong, row.DonGia, row.GiaTri, row.PhanLoai, row.Nguon, row.AnhHuongTon, row.GhiChu
    ]);
    const sheets = [
      coverSheet(report, meta),
      tableSheet('02-Tong hop NXT', 'Tổng hợp nhập – xuất – tồn', report, meta, ['Chỉ tiêu', 'Số lượng', 'Giá trị (VND)', 'Đơn vị'], nxt, { numberCols: [1], moneyCols: [2], widths: [42, 16, 20, 18] }),
      tableSheet('03-Hang da xuat', 'Chi tiết hàng đã xuất — không còn bán', report, meta, ['STT', 'Mã PX', 'Ngày', 'Loại xuất', 'Mã KK', 'Mã DT', 'Mã SP', 'Sản phẩm', 'ĐVT', 'SL', 'Đơn giá vốn', 'Thành tiền', 'Nhóm', 'Nguồn', 'Ảnh hưởng tồn', 'Ghi chú'], writeoffRows, {
        numberCols: [0, 9], moneyCols: [10, 11], wrapCols: [7, 12, 14, 15],
        widths: [8, 18, 12, 16, 16, 16, 12, 36, 8, 10, 14, 14, 28, 16, 36, 28],
        totalRow: ['', 'TỔNG CỘNG', `${writeoff.tickets} phiếu`, '', '', '', '', `${writeoff.products} mặt hàng`, '', writeoff.slTotal, '', writeoff.gtTotal, '', '', '', '']
      }),
      tableSheet('04-Ton thap', 'Tồn thấp — ưu tiên bổ sung', report, meta, ['STT', 'Mã SP', 'Sản phẩm', 'ĐVT', 'Tồn', 'Tối thiểu', 'Thiếu'], (report.lowStock || []).map((row, index) => [index + 1, row.MaSP, row.TenSP, row.DonViTinh, row.SLTon, row.TonKhoToiThieu, lowShortage(row)]), { numberCols: [0, 4, 5, 6], widths: [8, 14, 36, 10, 12, 12, 12], wrapCols: [2] }),
      tableSheet('05-Doi tra phieu', 'Phiếu đổi trả trong kỳ', report, meta, ['STT', 'Mã DT', 'Hóa đơn', 'Khách', 'Hình thức', 'Lý do', 'Tiền hoàn', 'Trạng thái', 'Trách nhiệm', 'Hàng đi đâu', 'Thu ngân', 'Thủ kho', 'Quản lý'], (report.doiTra?.tickets || []).map((row, index) => [index + 1, row.MaDT, row.MaHD, row.TenKH || 'Khách vãng lai', row.HinhThucXuLy, row.LyDo, row.SoTienHoan, row.TrangThai, row.BuocCanXuLy, hangDiDauText(row), row.NguoiLap, row.NguoiKiemTra, row.NguoiDuyet]), { numberCols: [0], moneyCols: [6], widths: [8, 16, 14, 22, 16, 32, 14, 16, 28, 36, 16, 16, 16], wrapCols: [5, 8, 9] }),
      tableSheet('06-Doi tra hang', 'Hàng khách trả', report, meta, ['STT', 'Mã SP', 'Sản phẩm', 'SL trả', 'Nhập lại', 'Loại bỏ', 'Hàng đi đâu', 'Lý do'], (report.doiTra?.products || []).map((row, index) => [index + 1, row.MaSP, row.TenSP, row.SLTra, row.SLNhapLai, row.SLLoaiBo || row.SLKhongNhapLai, hangDiDauText(row), row.LyDoMau]), { numberCols: [0, 3, 4, 5], widths: [8, 14, 36, 12, 12, 12, 40, 24], wrapCols: [2, 6, 7] }),
      tableSheet('07-Bien dong ngay', 'Biến động kho theo ngày', report, meta, ['STT', 'Ngày', 'Nhập', 'Xuất', 'Điều chỉnh', 'Tồn cuối', 'CT nhập', 'CT xuất'], (report.daily || []).map((row, index) => [index + 1, fmtDate(row.Ngay), row.SoLuongNhap, row.SoLuongXuat, row.DieuChinhRong, row.TonCuoiNgay, row.SoChungTuNhap, row.SoChungTuXuat]), { numberCols: [0, 2, 3, 4, 5, 6, 7], widths: [8, 14, 12, 12, 14, 14, 12, 12] }),
      tableSheet('08-Chung tu', 'Chứng từ trong kỳ', report, meta, ['STT', 'Mã chứng từ', 'Loại', 'Ngày', 'Người lập', 'Trạng thái', 'Giá trị'], (report.recentDocuments || []).map((row, index) => [index + 1, row.MaChungTu, row.LoaiChungTu, fmtDateTime(row.NgayChungTu), row.NguoiLap, row.TrangThai, row.GiaTri]), { numberCols: [0], moneyCols: [6], widths: [8, 18, 16, 18, 22, 16, 16] }),
      chartSheet(report, meta)
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>${xml(`Báo cáo tổng hợp kho ${report.period?.label || ''}`)}</Title>
    <Author>${xml(preparedBy(meta))}</Author>
    <Company>${xml(COMPANY.name)}</Company>
    <Version>16.00</Version>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1A2B24"/></Style>
    <Style ss:ID="sTitle"><Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#174A37"/><Alignment ss:Vertical="Center"/></Style>
    <Style ss:ID="sSheetTitle"><Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#174A37"/></Style>
    <Style ss:ID="sSub"><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#5B6F66"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
    <Style ss:ID="sCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1"/></Style>
    <Style ss:ID="sItalic"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Italic="1"/></Style>
    <Style ss:ID="sWarn"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#8A4B2B" ss:Italic="1"/></Style>
    <Style ss:ID="sSection"><Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1D7656" ss:Pattern="Solid"/></Style>
    <Style ss:ID="sHead"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1D7656" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#146047"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#146047"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#146047"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#146047"/></Borders></Style>
    <Style ss:ID="sLabel"><Font ss:Bold="1"/><Interior ss:Color="#F4F8F6" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0DA"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0DA"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0DA"/></Borders></Style>
    <Style ss:ID="sText"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/></Borders></Style>
    <Style ss:ID="sWrap"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/></Borders></Style>
    <Style ss:ID="sNum"><NumberFormat ss:Format="#,##0"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/></Borders></Style>
    <Style ss:ID="sMoney"><NumberFormat ss:Format="#,##0&quot; đ&quot;"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E1E8E4"/></Borders></Style>
    <Style ss:ID="sTotal"><Font ss:Bold="1"/><Interior ss:Color="#EAF3EE" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C5D5CC"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C5D5CC"/></Borders></Style>
    <Style ss:ID="sTotalMoney"><Font ss:Bold="1"/><Interior ss:Color="#EAF3EE" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0&quot; đ&quot;"/><Alignment ss:Horizontal="Right"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C5D5CC"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C5D5CC"/></Borders></Style>
    <Style ss:ID="sNote"><Font ss:Italic="1" ss:Color="#5B6F66"/><Alignment ss:WrapText="1"/></Style>
    <Style ss:ID="sBarScrap"><Interior ss:Color="#B05B43" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B05B43"/></Borders></Style>
    <Style ss:ID="sBarReuse"><Interior ss:Color="#197678" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#197678"/></Borders></Style>
    <Style ss:ID="sBarReturn"><Interior ss:Color="#8A5A2B" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#8A5A2B"/></Borders></Style>
    <Style ss:ID="sBarEmpty"><Interior ss:Color="#F3F6F4" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7EEEA"/></Borders></Style>
  </Styles>
  ${sheets.join('\n')}
</Workbook>`;
  };

  const downloadCsv = (report, meta = {}) => {
    downloadBlob(exportFileName(report, meta, '.csv'), buildEnterpriseCsv(report, meta), 'text/csv;charset=utf-8');
  };
  const downloadExcel = (report, meta = {}) => {
    downloadBlob(exportFileName(report, meta, '.xls'), buildWorkbookXml(report, meta), 'application/vnd.ms-excel');
  };

  window.FLY_WAREHOUSE_EXPORT = {
    COMPANY,
    periodTypeLabel,
    formatPeriodLabel,
    writeoffKind,
    writeoffKindLabel,
    writeoffSplit,
    writeoffDoc,
    writeoffByDay,
    writeoffByProduct,
    reportNumber,
    fileStamp,
    fmtDate,
    fmtDateTime,
    vnYmd,
    moneyPlain,
    qtyPlain,
    hangDiDauText,
    exportFileName,
    buildEnterpriseCsv,
    buildWorkbookXml,
    downloadBlob,
    downloadCsv,
    downloadExcel
  };
})();
