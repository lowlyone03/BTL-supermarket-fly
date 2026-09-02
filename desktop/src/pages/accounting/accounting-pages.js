(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'accounting-invoices': '<section class="warehouse-page"><div class="overview-loading">Đang tải hồ sơ hóa đơn...</div></section>',
    'accounting-payables': '<section class="warehouse-page"><div class="overview-loading">Đang tải công nợ phải trả...</div></section>',
    'accounting-settlements': '<section class="warehouse-page accounting-settlements"><div class="overview-loading">Đang tải ca chờ đối soát...</div></section>',
    'accounting-reports': '<section class="warehouse-page financial-reports report-accounting"><div class="overview-loading">Đang lập báo cáo nội bộ...</div></section>',
    'accounting-payroll': '<section class="warehouse-page accounting-payroll"><div class="overview-loading">Đang tải bảng lương...</div></section>',
    'manager-payables': '<section class="warehouse-page"><div class="overview-loading">Đang tổng hợp công nợ toàn hệ thống...</div></section>',
    'manager-reports': '<section class="warehouse-page financial-reports report-manager"><div class="overview-loading">Đang lập báo cáo quản trị...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const fmtDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const reportDefaults = () => window.FLY_REPORT_PERIOD?.defaults?.() || (() => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    const year = get('year'); const month = get('month'); const day = get('day');
    return { day: `${year}-${month}-${day}`, month: `${year}-${month}`, quarter: `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`, year };
  })();
  const settlementFlow = (current = '') => {
    const steps = [
      { key: 'lap', label: 'Kế toán lập Phiếu chi', match: /chưa lập|phiếu chi bị từ chối/i },
      { key: 'giao', label: 'Quản lý duyệt và giao tiền', match: /chờ quản lý|chờ giao/i },
      { key: 'chi', label: 'Kế toán thanh toán NCC', match: /đã giao tiền|thất bại|chờ kế toán chi|chờ chi/i },
      { key: 'tat', label: 'Công nợ tất toán', match: /đã tất toán|đã thanh toán/i }
    ];
    const active = steps.findIndex(step => step.match.test(current || '')) ;
    const index = active < 0 ? (current ? 1 : 0) : active;
    return `<div class="settlement-flow">${steps.map((step, stepIndex) => `<span class="${stepIndex < index ? 'done' : stepIndex === index ? 'active' : ''}">${esc(step.label)}</span>${stepIndex < steps.length - 1 ? '<i>→</i>' : ''}`).join('')}</div>`;
  };
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const downloadCsv = (filename, rows) => {
    const content = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const hangDiDauText = row => {
    if (row.HangDiDau) return row.HangDiDau;
    const restock = Number(row.SLNhapLai || 0);
    const scrap = Number(row.SLLoaiBo || row.SLKhongNhapLai || 0);
    const pending = Math.max(0, Number(row.SLTra || 0) - restock - scrap);
    const parts = [];
    if (restock) parts.push(`Nhập lại kho bán ${restock}`);
    if (scrap) parts.push(`Loại bỏ / vứt ${scrap} — không cộng tồn (đã trừ lúc bán)`);
    if (pending) parts.push(`Chưa xử lý kho ${pending}`);
    return parts.join(' · ') || '—';
  };
  const returnCsvRows = data => {
    const summary = data?.summary || {};
    const tickets = data?.tickets || [];
    const products = data?.products || [];
    return [
      [],
      ['ĐỔI TRẢ KHÁCH HÀNG'],
      ['Số phiếu', summary.SoPhieu || 0],
      ['Hoàn tiền / Đổi hàng', `${summary.SoHoanTien || 0} / ${summary.SoDoiHang || 0}`],
      ['Tiền đã hoàn', summary.TienHoan || 0],
      ['Chờ Thủ kho kiểm', summary.ChoKiemTra || 0],
      ['Chờ Quản lý duyệt', summary.ChoDuyet || 0],
      ['Chờ thu ngân xác nhận', summary.ChoThuNganXacNhan || 0],
      ['Nhập lại kho bán (phiếu)', summary.NhapLaiKho || 0],
      ['Loại bỏ / vứt (phiếu)', summary.KhongNhapLai || 0],
      [],
      ['Phiếu', 'Hóa đơn', 'Khách', 'Hình thức', 'Lý do', 'Tiền hoàn', 'Trạng thái', 'Trách nhiệm', 'Hàng đi đâu', 'Thu ngân lập', 'Thủ kho', 'Quản lý'],
      ...tickets.map(row => [row.MaDT, row.MaHD, row.TenKH || 'Khách vãng lai', row.HinhThucXuLy, row.LyDo, row.SoTienHoan, row.TrangThai, row.BuocCanXuLy, hangDiDauText(row), row.NguoiLap, row.NguoiKiemTra, row.NguoiDuyet]),
      [],
      ['Sản phẩm', 'Mã SP', 'SL trả', 'Nhập lại kho', 'Loại bỏ / vứt', 'Hàng đi đâu', 'Lý do'],
      ...products.map(row => [row.TenSP, row.MaSP, row.SLTra, row.SLNhapLai || 0, row.SLLoaiBo || row.SLKhongNhapLai || 0, hangDiDauText(row), row.LyDoMau])
    ];
  };
  const payrollPeriodLabel = value => {
    const [year, month] = String(value || '').split('-');
    return year && month ? `tháng ${month}/${year}` : String(value || '');
  };
  const payrollDayLabel = value => {
    const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : (value ? fmtDate(value) : '—');
  };
  const payrollPeriodPicker = value => `<div class="payroll-period-picker" data-keep-native aria-label="Chọn kỳ lương">
      <label class="payroll-period-field payroll-month-field"><span>Kỳ lương</span>
        <input type="month" id="payrollMonthInput" data-keep-native min="2020-01" max="2100-12" value="${esc(value)}">
      </label>
    </div>`;
  const api = async (context, path, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${context.apiBase}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Máy chủ phản hồi quá lâu. Hãy bấm Lập báo cáo để thử lại.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  const heading = (kicker, title, subtitle, action = '') => `<header class="warehouse-heading"><div><p class="warehouse-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</header>`;
  const matchClass = status => status === 'Đã khớp' ? 'ok' : status === 'Chênh lệch' ? 'cancelled' : 'draft';
  const debtClass = status => status === 'Đã thanh toán' ? 'ok' : status === 'Quá hạn' ? 'cancelled' : 'sent';
  const voucherClass = status => status === 'Thanh toán thành công' ? 'ok'
    : status === 'Từ chối' || status === 'Thanh toán thất bại' ? 'cancelled'
      : status === 'Đã duyệt' ? 'ok' : status === 'Chờ duyệt' ? 'sent' : 'draft';
  const alertList = items => `<div class="report-alert-list">${items.map(item => `<article class="${esc(item.tone || '')}"><span class="report-alert-icon"><svg><use href="#${esc(item.icon)}"/></svg></span><div><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></div>${item.value != null ? `<b>${esc(item.value)}</b>` : ''}</article>`).join('')}</div>`;
  const stepClass = value => /chưa|chờ|kẹt/i.test(value || '') ? 'sent' : /từ chối|không nhập lại|nhầm|loại bỏ|vứt/i.test(value || '') ? 'cancelled' : /xong|nhập lại kho/i.test(value || '') ? 'ok' : 'draft';
  const doiTraPanel = (data, options = {}) => {
    const summary = data?.summary || {};
    const tickets = data?.tickets || [];
    const products = data?.products || [];
    if (!Number(summary.SoPhieu || 0) && !tickets.length && !products.length) return '';
    const ticketRows = tickets.length
      ? tickets.map(row => `<tr class="${row.TrangThai === 'Đã duyệt' ? 'cashier-return-ready' : ''}"><td><strong>${esc(row.MaDT)}</strong><small>${esc(row.MaHD)} · ${esc(row.TenKH || 'Khách vãng lai')}</small></td><td>${esc(row.HinhThucXuLy)}<small>${esc(row.TrangThai)}</small></td><td class="report-return-reason">${esc(row.LyDo || '—')}</td><td class="num">${money(row.SoTienHoan)}</td><td class="report-return-duty"><span class="status-pill ${stepClass(row.BuocCanXuLy)}">${esc(row.BuocCanXuLy)}</span><small class="report-return-fate">Hàng: ${esc(hangDiDauText(row))}</small><div class="report-return-people"><span>Lập <b>${esc(row.NguoiLap || '—')}</b></span><span>Kho <b>${esc(row.NguoiKiemTra || '—')}</b></span><span>Duyệt <b>${esc(row.NguoiDuyet || '—')}</b></span></div></td></tr>`).join('')
      : '<tr><td colspan="5" class="warehouse-empty">Kỳ này chưa có phiếu đổi trả.</td></tr>';
    const productCard = options.showProducts === false ? '' : `<article class="warehouse-table-card report-return-products"><div class="warehouse-panel-title"><div><p>HÀNG KHÁCH TRẢ</p><h2>${esc(options.productTitle || 'Sản phẩm bị đổi trả nhiều')}</h2></div><span class="report-card-count">${products.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>SL TRẢ</th><th>NHẬP LẠI</th><th>LOẠI BỎ / VỨT</th><th>HÀNG ĐI ĐÂU</th></tr></thead><tbody>${products.length ? products.map(row => `<tr><td><strong>${esc(row.TenSP)}</strong><small>${esc(row.MaSP)}${row.LyDoMau ? ` · ${esc(row.LyDoMau)}` : ''}</small></td><td class="num">${row.SLTra}</td><td class="num">${row.SLNhapLai || 0}</td><td class="num">${row.SLLoaiBo || row.SLKhongNhapLai || 0}</td><td class="report-return-fate">${esc(hangDiDauText(row))}</td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Kỳ này chưa có hàng khách trả.</td></tr>'}</tbody></table></div></article>`;
    return `<section class="report-return-block">
      <div class="report-return-heading"><div><p>ĐỔI TRẢ VÀ TRÁCH NHIỆM</p><h2>${esc(options.title || 'Phiếu đổi trả trong kỳ')}</h2><span>${esc(options.subtitle || 'Cột trách nhiệm cho biết việc đang nằm ở bước nào. Hàng đi đâu: nhập lại kho bán (cộng tồn) hoặc loại bỏ/vứt (không cộng, đã trừ lúc bán).')}</span></div><b>${tickets.length} phiếu</b></div>
      <div class="report-return-kpis">
        <article><span>PHIẾU ĐỔI TRẢ</span><strong>${summary.SoPhieu || 0}</strong><small>${summary.SoHoanTien || 0} hoàn tiền · ${summary.SoDoiHang || 0} đổi hàng</small></article>
        <article><span>TIỀN ĐÃ HOÀN</span><strong>${money(summary.TienHoan)}</strong><small>${summary.ChoThuNganXacNhan || 0} chờ thu ngân xác nhận</small></article>
        <article><span>ĐANG KẸT BƯỚC</span><strong>${Number(summary.ChoKiemTra || 0) + Number(summary.ChoDuyet || 0) + Number(summary.ChoThuNganXacNhan || 0)}</strong><small>Thủ kho ${summary.ChoKiemTra || 0} · Quản lý ${summary.ChoDuyet || 0}</small></article>
        <article><span>HÀNG ĐI ĐÂU</span><strong>${summary.NhapLaiKho || 0} · ${summary.KhongNhapLai || 0}</strong><small>Nhập lại kho bán · Loại bỏ/vứt (không cộng tồn)</small></article>
      </div>
      <div class="report-return-grid">
        <article class="warehouse-table-card report-return-tickets"><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU / HĐ</th><th>HÌNH THỨC</th><th>LÝ DO</th><th>TIỀN HOÀN</th><th>TRÁCH NHIỆM / NGƯỜI XỬ LÝ</th></tr></thead><tbody>${ticketRows}</tbody></table></div></article>
        ${productCard}
      </div>
    </section>`;
  };

  const managerPayableDetail = async (context, id, onDone) => {
    try {
      const data = await api(context, `/admin/finance/payables/${id}`);
      const debt = data.payable;
      const rows = data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${line.ThueSuat}%</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const fundNote = debt.MaPhieu ? `<div class="manager-readonly-note"><svg><use href="#i-cash"/></svg><div><strong>Phiếu chi ${esc(debt.MaPhieu)} · ${esc(debt.BuocTatToan || debt.TrangThaiPhieuChi)}</strong><span>${debt.HinhThucCapQuy ? `Quản lý đã giao: ${esc(debt.HinhThucCapQuy)}${debt.NguoiDuyet ? ` · ${esc(debt.NguoiDuyet)}` : ''}${debt.NgayCapQuy ? ` · ${fmtDateTime(debt.NgayCapQuy)}` : ''}.` : 'Chưa giao tiền. Duyệt Phiếu chi đồng thời là bước giao quỹ cho Kế toán.'}${debt.GhiChuCapQuy ? ` ${esc(debt.GhiChuCapQuy)}` : ''}</span></div></div>` : '<div class="manager-readonly-note"><svg><use href="#i-report"/></svg><div><strong>Kế toán chưa lập Phiếu chi</strong><span>Công nợ chỉ giảm sau khi bạn giao tiền và Kế toán thanh toán thành công cho Nhà cung cấp.</span></div></div>';
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal manager-payable-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐIỀU HÀNH / HỒ SƠ CÔNG NỢ</p><h2>${esc(debt.MaCNPTra)}</h2></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body">${settlementFlow(debt.BuocTatToan)}${fundNote}<div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(debt.TenNCC)}</strong></div><div><span>HÓA ĐƠN</span><strong>${esc(debt.SoHoaDon)}</strong></div><div><span>ĐƠN MUA</span><strong>${esc(debt.MaPO)}</strong></div><div><span>PHIẾU NHẬP</span><strong>${esc(debt.MaPN || '—')}</strong></div><div><span>NGÀY PHÁT SINH</span><strong>${fmtDate(debt.NgayPhatSinh)}</strong></div><div><span>HẠN THANH TOÁN</span><strong>${fmtDate(debt.HanThanhToan)}</strong></div></div><div class="manager-debt-amounts"><div><span>GIÁ TRỊ GHI NHẬN</span><strong>${money(debt.SoTienNo)}</strong></div><div><span>ĐÃ THANH TOÁN</span><strong>${money(debt.SoTienDaTra)}</strong></div><div><span>CÒN PHẢI TRẢ</span><strong>${money(debt.SoTienConLai)}</strong></div><div><span>TIẾN ĐỘ</span><strong><i class="status-pill ${debtClass(debt.TrangThaiHienTai)}">${esc(debt.BuocTatToan || debt.TrangThaiHienTai)}</i></strong></div></div><div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THUẾ SUẤT</th><th>TIỀN HÀNG</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng</button>${debt.TrangThaiPhieuChi === 'Chờ duyệt' ? `<button class="warehouse-primary fund-payable" type="button">Duyệt và giao tiền</button>` : ''}<button class="warehouse-primary print-payable-detail"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.querySelector('.fund-payable')?.addEventListener('click', () => {
        close();
        window.FLY_PAYMENT_VOUCHER?.openApproval(context, debt.MaPhieu, onDone);
      });
      overlay.querySelector('.print-payable-detail').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'BẢNG CHI TIẾT CÔNG NỢ NHÀ CUNG CẤP', number: debt.MaCNPTra,
        documentDate: new Date(), status: debt.TrangThaiHienTai,
        fields: [
          { label: 'Nhà cung cấp', value: debt.TenNCC }, { label: 'Hóa đơn', value: debt.SoHoaDon },
          { label: 'Đơn mua', value: debt.MaPO }, { label: 'Phiếu nhập', value: debt.MaPN || '—' },
          { label: 'Ngày phát sinh', value: debt.NgayPhatSinh, format: 'date' }, { label: 'Hạn thanh toán', value: debt.HanThanhToan, format: 'date' }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
          { label: 'ĐVT', key: 'DonViTinh' }, { label: 'Số lượng', key: 'SoLuong', align: 'right' },
          { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
          { label: 'Thuế suất', key: 'ThueSuat', format: 'percent', align: 'right' },
          { label: 'Tiền hàng', key: 'ThanhTien', format: 'money', align: 'right' }
        ], rows: data.lines,
        totals: [
          { label: 'Giá trị ghi nhận', value: debt.SoTienNo, format: 'money' },
          { label: 'Đã thanh toán', value: debt.SoTienDaTra, format: 'money' },
          { label: 'CÒN PHẢI TRẢ', value: debt.SoTienConLai, format: 'money' }
        ],
        note: 'Bảng chi tiết phục vụ Quản lý cửa hàng theo dõi. Không thay thế Hóa đơn Nhà cung cấp hoặc Phiếu chi.',
        signatures: ['Kế toán theo dõi', 'Quản lý cửa hàng']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const invoiceDetail = async (context, id) => {
    try {
      const data = await api(context, `/accounting/purchase-invoices/${id}`);
      const invoice = data.invoice;
      const rows = data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${line.ThueSuat}%</td><td class="num">${money(line.TienThue)}</td><td class="num"><strong>${money(line.ThanhTien)}</strong></td></tr>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const statusNote = invoice.GhiChuChenhLech
        ? `<p class="warehouse-modal-note"><strong>Chênh lệch cần phối hợp xử lý:</strong> ${esc(invoice.GhiChuChenhLech)}</p>`
        : invoice.TrangThaiDoiChieu === 'Đã khớp'
          ? '<p class="receipt-rule">Đơn mua – Phiếu nhập – Hóa đơn đã được Kế toán xác nhận khớp. Công nợ phải trả đã được ghi nhận.</p>'
          : invoice.TrangThaiDoiChieu === 'Chờ đối chiếu'
            ? '<p class="receipt-rule">Hóa đơn đã được lưu nhưng chưa đối chiếu. Chưa phát sinh công nợ; hãy đóng cửa sổ này và chọn “Đối chiếu”.</p>'
            : '<p class="receipt-rule">Hóa đơn đang chờ Thủ kho xác nhận Phiếu nhập. Chưa phát sinh công nợ.</p>';
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HÓA ĐƠN NHÀ CUNG CẤP</p><h2>${esc(invoice.SoHoaDon)}</h2></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(invoice.TenNCC)}</strong></div><div><span>ĐƠN MUA</span><strong>${esc(invoice.MaPO || '—')}</strong></div><div><span>PHIẾU NHẬP</span><strong>${esc(invoice.MaPN || 'Chưa có')}</strong></div><div><span>KẾT QUẢ ĐỐI CHIẾU</span><strong><span class="status-pill ${matchClass(invoice.TrangThaiDoiChieu)}">${esc(invoice.TrangThaiDoiChieu)}</span></strong></div><div><span>TỔNG CỘNG</span><strong>${money(invoice.TongCong)}</strong></div><div><span>CÔNG NỢ</span><strong>${esc(invoice.MaCNPTra || 'Chưa phát sinh')}</strong></div></div>${statusNote}<div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THUẾ SUẤT</th><th>TIỀN THUẾ</th><th>TIỀN HÀNG</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng</button><button class="warehouse-primary print-invoice-record"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.querySelector('.print-invoice-record').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'PHIẾU TIẾP NHẬN HÓA ĐƠN NHÀ CUNG CẤP', number: invoice.MaHDMH,
        documentDate: invoice.NgayTiepNhan, status: invoice.TrangThaiDoiChieu,
        fields: [
          { label: 'Số hóa đơn Nhà cung cấp', value: invoice.SoHoaDon }, { label: 'Nhà cung cấp', value: invoice.TenNCC },
          { label: 'Đơn mua', value: invoice.MaPO }, { label: 'Phiếu nhập', value: invoice.MaPN || 'Chưa có' },
          { label: 'Ngày hóa đơn', value: invoice.NgayHoaDon, format: 'date' }, { label: 'Người tiếp nhận', value: invoice.NguoiTiepNhan }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' }, { label: 'ĐVT', key: 'DonViTinh' },
          { label: 'Số lượng', key: 'SoLuong', align: 'right' }, { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
          { label: 'Thuế suất', key: 'ThueSuat', format: 'percent', align: 'right' }, { label: 'Tiền hàng', key: 'ThanhTien', format: 'money', align: 'right' }
        ], rows: data.lines, totals: [
          { label: 'Tổng tiền hàng', value: invoice.TongTienHang, format: 'money' },
          { label: 'Tiền thuế', value: invoice.TienThue, format: 'money' }, { label: 'TỔNG CỘNG', value: invoice.TongCong, format: 'money' }
        ], note: 'Đây là phiếu ghi nhận hóa đơn do Nhà cung cấp giao, không thay thế hóa đơn điện tử hoặc hóa đơn GTGT gốc.',
        signatures: ['Người giao hóa đơn', 'Kế toán tiếp nhận']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const lineMarkup = lines => `<div class="accounting-invoice-line heading"><span>MẶT HÀNG</span><span>THAM CHIẾU</span><span>SL HÓA ĐƠN</span><span>GIÁ THAM CHIẾU</span><span>GIÁ HÓA ĐƠN</span><span>THUẾ (%)</span><span>THÀNH TIỀN</span></div>${lines.map(line => {
    const quantity = Number(line.SoLuongChapNhan ?? line.SoLuong);
    const price = Number(line.DonGiaNhap ?? line.DonGiaDonMua ?? line.DonGia);
    return `<div class="accounting-invoice-line" data-product="${esc(line.MaSP)}"><div><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></div><span>${quantity}</span><input class="invoice-qty" type="number" min="1" value="${quantity}"><span>${money(price)}</span><input class="invoice-price" type="number" min="0" step="100" value="${price}"><input class="invoice-tax" type="number" min="0" max="100" step="1" value="8"><strong class="invoice-total"></strong></div>`;
  }).join('')}`;

  const bindLineTotals = overlay => {
    const calculate = row => {
      const quantity = Number(row.querySelector('.invoice-qty').value || 0);
      const price = Number(row.querySelector('.invoice-price').value || 0);
      const tax = Number(row.querySelector('.invoice-tax').value || 0);
      row.querySelector('.invoice-total').textContent = money(quantity * price * (1 + tax / 100));
    };
    overlay.querySelectorAll('.accounting-invoice-line[data-product]').forEach(row => {
      row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => calculate(row)));
      calculate(row);
    });
  };

  const createInvoiceModal = async (context, onDone) => {
    try {
      const [receiptsData, ordersData] = await Promise.all([
        api(context, '/accounting/receipt-files'),
        api(context, '/accounting/purchase-order-files')
      ]);
      const receipts = receiptsData.items.filter(item => !item.DaTiepNhanHoaDon);
      const orders = ordersData.items;
      if (!receipts.length && !orders.length) return context.showToast('Chưa có Đơn mua hợp lệ để tiếp nhận hóa đơn.', 'error');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">TIẾP NHẬN HÓA ĐƠN NHÀ CUNG CẤP</p><h2>Lưu chứng từ để Kế toán kiểm tra</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="accounting-intake-choice"><label><input type="radio" name="invoiceMode" value="receipt" ${receipts.length ? 'checked' : ''}><span><strong>Đã có Phiếu nhập</strong><small>Lưu hồ sơ ở trạng thái Chờ đối chiếu</small></span></label><label><input type="radio" name="invoiceMode" value="order" ${receipts.length ? '' : 'checked'}><span><strong>Hóa đơn đến trước</strong><small>Lưu chờ Phiếu nhập, chưa tạo công nợ</small></span></label></div><div class="warehouse-form-grid accounting-invoice-header"><div class="warehouse-field"><label>Hồ sơ tham chiếu *</label><select id="invoiceSource"></select></div><div class="warehouse-field"><label>Số hóa đơn Nhà cung cấp *</label><input id="supplierInvoiceNo" maxlength="50" placeholder="Ví dụ: 00001234"></div><div class="warehouse-field"><label>Ngày hóa đơn *</label>${window.FLY_VI_DATE.dateField('invoiceDate', today)}</div><div class="warehouse-field"><label>Điều khoản thanh toán</label><input id="paymentTerm" disabled></div></div><div class="receipt-rule"><svg><use href="#i-approve"></use></svg><span>Nút “Lưu hóa đơn” chỉ tiếp nhận chứng từ. Sau đó Kế toán phải mở bảng đối chiếu Đơn mua – Phiếu nhập – Hóa đơn và xác nhận riêng thì công nợ mới được ghi nhận.</span></div><div id="invoiceLines" class="warehouse-receipt-lines"></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary save-invoice">Lưu hồ sơ hóa đơn</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      const currentMode = () => overlay.querySelector('input[name="invoiceMode"]:checked').value;
      const fillSources = async () => {
        const mode = currentMode();
        const source = overlay.querySelector('#invoiceSource');
        const items = mode === 'receipt' ? receipts : orders;
        source.innerHTML = items.length ? items.map(item => `<option value="${esc(mode === 'receipt' ? item.MaPN : item.MaPO)}">${esc(mode === 'receipt' ? `${item.MaPN} · ${item.TenNCC}` : `${item.MaPO} · ${item.TenNCC}`)}</option>`).join('') : '<option value="">Chưa có hồ sơ phù hợp</option>';
        source.disabled = !items.length;
        overlay.querySelector('.save-invoice').disabled = !items.length;
        if (items.length) await loadLines(); else overlay.querySelector('#invoiceLines').innerHTML = '<div class="warehouse-empty">Chưa có hồ sơ phù hợp với lựa chọn này.</div>';
      };
      const loadLines = async () => {
        const mode = currentMode();
        const id = overlay.querySelector('#invoiceSource').value;
        if (!id) return;
        const data = await api(context, mode === 'receipt' ? `/accounting/receipt-files/${id}` : `/accounting/purchase-order-files/${id}`);
        overlay.querySelector('#paymentTerm').value = `${data.file.SoNgayThanhToan} ngày theo Đơn mua ${data.file.MaPO}`;
        overlay.querySelector('#invoiceLines').innerHTML = lineMarkup(data.lines);
        bindLineTotals(overlay);
      };
      overlay.querySelectorAll('input[name="invoiceMode"]').forEach(input => input.addEventListener('change', fillSources));
      overlay.querySelector('#invoiceSource').addEventListener('change', loadLines);
      overlay.querySelector('.save-invoice').addEventListener('click', async () => {
        const SoHoaDon = overlay.querySelector('#supplierInvoiceNo').value.trim();
        if (!SoHoaDon) return context.showToast('Vui lòng nhập số hóa đơn Nhà cung cấp.', 'error');
        const mode = currentMode();
        const sourceId = overlay.querySelector('#invoiceSource').value;
        const lines = Array.from(overlay.querySelectorAll('.accounting-invoice-line[data-product]')).map(row => ({
          MaSP: row.dataset.product,
          SoLuong: Number(row.querySelector('.invoice-qty').value),
          DonGia: Number(row.querySelector('.invoice-price').value),
          ThueSuat: Number(row.querySelector('.invoice-tax').value)
        }));
        try {
          const result = await api(context, '/accounting/purchase-invoices', {
            method: 'POST',
            body: JSON.stringify({
              [mode === 'receipt' ? 'MaPN' : 'MaPO']: sourceId,
              SoHoaDon,
              NgayHoaDon: overlay.querySelector('#invoiceDate').value,
              lines
            })
          });
          context.showToast(result.message, result.TrangThaiDoiChieu === 'Chênh lệch' ? 'error' : 'success');
          close();
          await onDone();
          invoiceDetail(context, result.MaHDMH);
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      await fillSources();
      overlay.querySelector('#supplierInvoiceNo').focus();
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const reconcileModal = async (context, invoice, onDone) => {
    try {
      const data = await api(context, '/accounting/receipt-files');
      const candidates = data.items.filter(item => (!item.DaTiepNhanHoaDon || item.MaPN === invoice.MaPN) && item.MaPO === invoice.MaPO && item.MaNCC === invoice.MaNCC);
      if (!candidates.length) return context.showToast('Chưa có Phiếu nhập đã xác nhận phù hợp với hóa đơn này.', 'error');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal accounting-reconcile-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">KẾ TOÁN / ĐỐI CHIẾU BA CHỨNG TỪ</p><h2>Kiểm tra hóa đơn ${esc(invoice.SoHoaDon)}</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-field accounting-receipt-picker"><label>Phiếu nhập dùng để đối chiếu *</label><select id="matchReceipt">${candidates.map(item => `<option value="${esc(item.MaPN)}" ${item.MaPN === invoice.MaPN ? 'selected' : ''}>${esc(item.MaPN)} · ${item.TongSoLuong} đơn vị · ${esc(item.TenNCC)}</option>`).join('')}</select></div><div id="reconciliationPreview"><div class="overview-loading">Đang lập bảng so sánh ba chứng từ...</div></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng, chưa đối chiếu</button><button class="warehouse-secondary print-reconciliation" disabled>Xem bản in đối chiếu</button><button class="warehouse-primary reconcile" disabled>Xác nhận đối chiếu và ghi nhận công nợ</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      let currentPreview = null;
      const loadPreview = async () => {
        const MaPN = overlay.querySelector('#matchReceipt').value;
        const preview = await api(context, `/accounting/purchase-invoices/${invoice.MaHDMH}/reconciliation-preview?MaPN=${encodeURIComponent(MaPN)}`);
        currentPreview = preview;
        const matched = !preview.differences.length;
        overlay.querySelector('#reconciliationPreview').innerHTML = `<div class="accounting-document-strip"><article><span>ĐƠN MUA</span><strong>${esc(preview.purchaseOrder.MaPO)}</strong><small>Toàn đơn ${money(preview.purchaseOrder.TongTien)}</small></article><article><span>PHIẾU NHẬP</span><strong>${esc(preview.receipt.MaPN)}</strong><small>Trước thuế ${money(preview.totals.PhieuNhapTruocThue)}</small></article><article><span>HÓA ĐƠN NHÀ CUNG CẤP</span><strong>${esc(preview.invoice.SoHoaDon)}</strong><small>Tổng cộng ${money(preview.invoice.TongCong)}</small></article></div><div class="warehouse-table-wrap accounting-reconcile-table"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SL ĐẶT / NHẬN / HĐ</th><th>GIÁ ĐƠN MUA</th><th>GIÁ PHIẾU NHẬP</th><th>GIÁ HÓA ĐƠN</th><th>THUẾ HĐ</th><th>TIỀN HÀNG HĐ</th><th>KẾT QUẢ</th></tr></thead><tbody>${preview.rows.map(row => `<tr><td><strong>${esc(row.TenSP)}</strong><small>${esc(row.MaSP)} · ${esc(row.DonViTinh)}</small></td><td class="num">${row.SoLuongDat} / ${row.SoLuongThucNhan} / ${row.SoLuongHoaDon}</td><td class="num">${money(row.DonGiaDonMua)}</td><td class="num">${money(row.DonGiaPhieuNhap)}</td><td class="num">${money(row.DonGiaHoaDon)}</td><td class="num"><strong>${row.ThueSuat}%</strong><small>${money(row.TienThueHoaDon)} / tính lại ${money(row.TienThueTinhLai)}</small></td><td class="num">${money(row.TienHangHoaDon)}</td><td><span class="status-pill ${row.KetQua === 'Khớp' ? 'ok' : 'cancelled'}">${esc(row.KetQua)}</span><small>SL ${esc(row.KetQuaSoLuong)} · Giá ${esc(row.KetQuaDonGia)} · Thuế ${esc(row.KetQuaThue)} · Tổng ${esc(row.KetQuaTongTien)}</small></td></tr>`).join('')}</tbody></table></div><div class="accounting-reconcile-totals"><div><span>TIỀN HÀNG PHIẾU NHẬP</span><strong>${money(preview.totals.PhieuNhapTruocThue)}</strong></div><div><span>TIỀN HÀNG HÓA ĐƠN</span><strong>${money(preview.totals.HoaDonTienHang)}</strong></div><div><span>THUẾ HÓA ĐƠN</span><strong>${money(preview.totals.HoaDonTienThue)}</strong><small>Tính lại ${money(preview.totals.TienThueTinhLai)}</small></div><div><span>TỔNG CỘNG HÓA ĐƠN</span><strong>${money(preview.totals.HoaDonTongCong)}</strong><small>Tính lại ${money(preview.totals.TongCongTinhLai)}</small></div></div><div class="accounting-reconcile-result ${matched ? 'matched' : 'different'}"><strong>${matched ? 'Ba chứng từ, thuế và tổng tiền đều khớp' : 'Hồ sơ đang có chênh lệch'}</strong><p>${matched ? 'Kế toán kiểm tra lại lần cuối rồi bấm xác nhận. Chỉ thao tác xác nhận này mới phát sinh công nợ phải trả.' : esc(preview.differences.join('; '))}</p></div>`;
        const button = overlay.querySelector('.reconcile');
        button.disabled = !matched;
        button.dataset.ready = matched ? 'true' : 'false';
        overlay.querySelector('.print-reconciliation').disabled = false;
      };
      overlay.querySelector('#matchReceipt').addEventListener('change', () => loadPreview().catch(error => context.showToast(error.message, 'error')));
      overlay.querySelector('.print-reconciliation').addEventListener('click', () => {
        if (!currentPreview) return;
        window.FLY_PRINT.show({
          title: 'BIÊN BẢN ĐỐI CHIẾU BA CHỨNG TỪ', number: invoice.MaHDMH,
          documentDate: new Date(), status: currentPreview.result,
          fields: [
            { label: 'Đơn mua', value: currentPreview.purchaseOrder.MaPO }, { label: 'Phiếu nhập', value: currentPreview.receipt.MaPN },
            { label: 'Số hóa đơn Nhà cung cấp', value: currentPreview.invoice.SoHoaDon }, { label: 'Nhà cung cấp', value: currentPreview.invoice.TenNCC }
          ],
          columns: [
            { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
            { label: 'SL đặt', key: 'SoLuongDat', align: 'right' }, { label: 'SL thực nhận', key: 'SoLuongThucNhan', align: 'right' },
            { label: 'SL hóa đơn', key: 'SoLuongHoaDon', align: 'right' }, { label: 'Giá Đơn mua', key: 'DonGiaDonMua', format: 'money', align: 'right' },
            { label: 'Giá Phiếu nhập', key: 'DonGiaPhieuNhap', format: 'money', align: 'right' },
            { label: 'Giá hóa đơn', key: 'DonGiaHoaDon', format: 'money', align: 'right' },
            { label: 'Thuế suất', key: 'ThueSuat', format: 'percent', align: 'right' },
            { label: 'Tiền thuế', key: 'TienThueHoaDon', format: 'money', align: 'right' }, { label: 'Kết quả', key: 'KetQua' }
          ], rows: currentPreview.rows,
          totals: [
            { label: 'Tiền hàng Phiếu nhập', value: currentPreview.totals.PhieuNhapTruocThue, format: 'money' },
            { label: 'Tiền hàng hóa đơn', value: currentPreview.totals.HoaDonTienHang, format: 'money' },
            { label: 'Tiền thuế hóa đơn', value: currentPreview.totals.HoaDonTienThue, format: 'money' },
            { label: 'Tổng cộng hóa đơn', value: currentPreview.totals.HoaDonTongCong, format: 'money' }
          ],
          note: currentPreview.differences.length ? currentPreview.differences.join('; ') : 'Sản phẩm, số lượng, đơn giá, thuế và tổng tiền đều khớp theo quy tắc đối chiếu.',
          signatures: ['Nhân viên mua hàng', 'Thủ kho', 'Kế toán đối chiếu']
        });
      });
      overlay.querySelector('.reconcile').addEventListener('click', async () => {
        try {
          const result = await api(context, `/accounting/purchase-invoices/${invoice.MaHDMH}/reconcile`, { method: 'POST', body: JSON.stringify({ MaPN: overlay.querySelector('#matchReceipt').value, XacNhanDoiChieu: true }) });
          context.showToast(result.message, result.TrangThaiDoiChieu === 'Đã khớp' ? 'success' : 'error');
          close();
          await onDone();
          invoiceDetail(context, invoice.MaHDMH);
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      await loadPreview();
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initInvoices = async (root, context) => {
    let items = [];
    const load = async () => {
      try {
        const search = root.querySelector('#invoiceSearch').value;
        const match = root.querySelector('#invoiceMatch').value;
        const data = await api(context, `/accounting/purchase-invoices?search=${encodeURIComponent(search)}&match=${encodeURIComponent(match)}`);
        items = data.items;
        root.querySelector('#invoiceBody').innerHTML = items.length ? items.map(item => `<tr><td><strong>${esc(item.SoHoaDon)}</strong><small>${esc(item.MaHDMH)}</small></td><td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)}</small></td><td><strong>${esc(item.MaPO || '—')}</strong><small>${item.MaPN ? `Nhập ${esc(item.MaPN)}` : 'Chờ Phiếu nhập'}</small></td><td>${fmtDate(item.NgayHoaDon)}</td><td class="num"><strong>${money(item.TongCong)}</strong><small>Thuế ${money(item.TienThue)}</small></td><td><span class="status-pill ${matchClass(item.TrangThaiDoiChieu)}">${esc(item.TrangThaiDoiChieu)}</span></td><td>${item.MaCNPTra ? `<strong>${esc(item.MaCNPTra)}</strong><small>Hạn ${fmtDate(item.HanThanhToan)}</small>` : '<span class="status-pill cancelled">Chưa phát sinh</span>'}</td><td><div class="warehouse-row-actions"><button data-invoice="${esc(item.MaHDMH)}">Chi tiết</button>${item.TrangThaiDoiChieu !== 'Đã khớp' ? `<button class="send" data-reconcile="${esc(item.MaHDMH)}">Đối chiếu</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="8" class="warehouse-empty">Chưa có hóa đơn mua hàng phù hợp.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('KẾ TOÁN / MUA HÀNG', 'Đối chiếu hóa đơn Nhà cung cấp', 'Tiếp nhận hóa đơn trước hoặc sau Phiếu nhập; chỉ hồ sơ được Kế toán xác nhận khớp ba bên mới ghi nhận công nợ.', '<button class="warehouse-primary" id="newInvoice"><svg><use href="#i-plus"></use></svg>Tiếp nhận hóa đơn</button>')}<div class="accounting-flow"><span>Đơn mua đã duyệt</span><i>→</i><span>Phiếu nhập đã xác nhận</span><i>→</i><span>Hóa đơn Nhà cung cấp</span><i>→</i><strong>Kế toán xác nhận đối chiếu</strong><i>→</i><strong>Công nợ phải trả</strong></div><article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"></use></svg><input id="invoiceSearch" placeholder="Tìm số hóa đơn, Đơn mua hoặc Nhà cung cấp..."></label><div class="warehouse-toolbar-actions"><select id="invoiceMatch"><option value="">Tất cả kết quả</option><option>Chờ Phiếu nhập</option><option>Chờ đối chiếu</option><option>Đã khớp</option><option>Chênh lệch</option></select><button class="warehouse-icon-button" id="refreshInvoices"><svg><use href="#i-refresh"></use></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÓA ĐƠN</th><th>NHÀ CUNG CẤP</th><th>HỒ SƠ NGUỒN</th><th>NGÀY HÓA ĐƠN</th><th>TỔNG CỘNG</th><th>ĐỐI CHIẾU</th><th>CÔNG NỢ</th><th>THAO TÁC</th></tr></thead><tbody id="invoiceBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#invoiceSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#invoiceMatch').addEventListener('change', load);
    root.querySelector('#refreshInvoices').addEventListener('click', load);
    root.querySelector('#newInvoice').addEventListener('click', () => createInvoiceModal(context, load));
    root.addEventListener('click', event => {
      const detail = event.target.closest('[data-invoice]');
      if (detail) return invoiceDetail(context, detail.dataset.invoice);
      const reconcile = event.target.closest('[data-reconcile]');
      if (reconcile) {
        const invoice = items.find(item => item.MaHDMH === reconcile.dataset.reconcile);
        if (invoice) reconcileModal(context, invoice, load);
      }
    });
    await load();
  };

  const paymentVoucherForm = async (context, debtId, onDone, resubmit = false) => {
    try {
      const data = await api(context, `/accounting/payables/${debtId}`);
      const debt = data.payable;
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const defaultContent = debt.NoiDung || `Thanh toán toàn bộ công nợ ${debt.MaCNPTra} theo Hóa đơn ${debt.SoHoaDon}`;
      overlay.innerHTML = `<div class="warehouse-modal payment-voucher-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">UC28 · PHIẾU CHI NHÀ CUNG CẤP</p><h2>${resubmit ? `Chỉnh sửa ${esc(debt.MaPhieu)}` : `Lập Phiếu chi cho ${esc(debt.MaCNPTra)}`}</h2><span>${esc(debt.TenNCC)} · Hạn ${fmtDate(debt.HanThanhToan)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body">${settlementFlow('Chờ Quản lý giao tiền')}<div class="payment-voucher-source"><div><span>ĐƠN MUA</span><strong>${esc(debt.MaPO)}</strong></div><div><span>PHIẾU NHẬP</span><strong>${esc(debt.MaPN)}</strong></div><div><span>HÓA ĐƠN NCC</span><strong>${esc(debt.SoHoaDon)}</strong></div><div><span>ĐỐI CHIẾU</span><strong><i class="status-pill ${matchClass(debt.TrangThaiDoiChieu)}">${esc(debt.TrangThaiDoiChieu)}</i></strong></div></div><div class="manager-readonly-note"><svg><use href="#i-shield"></use></svg><div><strong>Số tiền khóa theo toàn bộ công nợ còn lại</strong><span>Không trả trước, không thanh toán từng phần. Sau khi gửi, Quản lý duyệt và giao tiền; bạn mới được chi cho Nhà cung cấp. Công nợ chưa giảm ở bước này.</span></div></div><div class="payment-voucher-amount"><span>SỐ TIỀN CHI</span><strong>${money(debt.SoTienConLai)}</strong><small>${esc(debt.MaCNPTra)} · ${esc(debt.TrangThaiCongNo)}</small></div><div class="warehouse-form-grid payment-voucher-fields"><div class="warehouse-field"><label>Phương thức *</label><select id="voucherMethod"><option ${debt.PhuongThuc === 'Tiền mặt' ? 'selected' : ''}>Tiền mặt</option><option ${debt.PhuongThuc === 'Chuyển khoản' || !debt.PhuongThuc ? 'selected' : ''}>Chuyển khoản</option></select></div><div class="warehouse-field"><label>Nội dung chi *</label><input id="voucherContent" maxlength="500" value="${esc(defaultContent)}"></div><div class="warehouse-field full"><label>Ghi chú</label><textarea id="voucherNote" maxlength="500" rows="3" placeholder="Thông tin bổ sung cho Quản lý kiểm tra">${esc(debt.GhiChu || '')}</textarea></div></div>${resubmit ? `<p class="payment-voucher-rejection"><strong>Lý do bị từ chối:</strong> ${esc(debt.LyDoTuChoi || '—')}</p>` : ''}</div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-primary submit-voucher" type="button">${resubmit ? 'Chỉnh sửa và gửi lại' : 'Lập và gửi Quản lý duyệt'}</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.querySelector('.submit-voucher').addEventListener('click', async event => {
        const payload = {
          PhuongThuc: overlay.querySelector('#voucherMethod').value,
          NoiDung: overlay.querySelector('#voucherContent').value.trim(),
          GhiChu: overlay.querySelector('#voucherNote').value.trim()
        };
        if (!payload.NoiDung) return context.showToast('Vui lòng nhập nội dung chi.', 'error');
        event.currentTarget.disabled = true;
        try {
          const result = await api(context, resubmit ? `/accounting/payment-vouchers/${debt.MaPhieu}/resubmit` : `/accounting/payables/${debt.MaCNPTra}/payment-voucher`, {
            method: 'POST', body: JSON.stringify(payload)
          });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); event.currentTarget.disabled = false; }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const paymentResultForm = async (context, debtId, onDone) => {
    try {
      const data = await api(context, `/accounting/payables/${debtId}`);
      const debt = data.payable;
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal payment-result-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">THỰC HIỆN THANH TOÁN PHIẾU CHI</p><h2>${esc(debt.MaPhieu)}</h2><span>${esc(debt.TenNCC)} · ${money(debt.SoTienPhieuChi)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body">${settlementFlow(debt.BuocTatToan || 'đã giao tiền')}<div class="manager-readonly-note"><svg><use href="#i-cash"></use></svg><div><strong>Quản lý đã giao tiền, bạn chi cho Nhà cung cấp</strong><span>${debt.HinhThucCapQuy ? `${esc(debt.HinhThucCapQuy)}${debt.NguoiDuyet ? ` · ${esc(debt.NguoiDuyet)}` : ''}${debt.NgayCapQuy ? ` · ${fmtDateTime(debt.NgayCapQuy)}` : ''}. ` : ''}${debt.PhuongThuc === 'Tiền mặt' ? 'Đưa đủ tiền mặt đã nhận cho Nhà cung cấp rồi ghi nhận thành công.' : 'Chuyển khoản từ tài khoản cửa hàng, nhập mã giao dịch ngân hàng.'} Thất bại thì công nợ giữ nguyên để thực hiện lại.</span>${debt.GhiChuCapQuy ? `<small>${esc(debt.GhiChuCapQuy)}</small>` : ''}</div></div><div class="payment-voucher-source"><div><span>PHƯƠNG THỨC CHI NCC</span><strong>${esc(debt.PhuongThuc)}</strong></div><div><span>CÔNG NỢ</span><strong>${esc(debt.MaCNPTra)}</strong></div><div><span>CÒN PHẢI TRẢ</span><strong>${money(debt.SoTienConLai)}</strong></div><div><span>QUỸ ĐÃ NHẬN</span><strong>${esc(debt.HinhThucCapQuy || debt.NguoiDuyet || '—')}</strong></div></div><div class="warehouse-form-grid payment-voucher-fields"><div class="warehouse-field"><label>Kết quả giao dịch *</label><select id="paymentResult"><option value="success">Thanh toán thành công</option><option value="failed">Thanh toán thất bại</option></select></div><div class="warehouse-field bank-code-field"><label>Mã giao dịch/ủy nhiệm chi *</label><input id="paymentBankCode" maxlength="50" value="${esc(debt.MaGiaoDichNganHang || '')}" placeholder="Nhập mã giao dịch ngân hàng"></div><div class="warehouse-field full"><label id="paymentNoteLabel">Ghi chú thanh toán</label><textarea id="paymentNote" maxlength="500" rows="3" placeholder="Khi thất bại, bắt buộc ghi nguyên nhân để thực hiện lại"></textarea></div></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-primary submit-payment-result" type="button">Ghi nhận kết quả</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      const resultSelect = overlay.querySelector('#paymentResult');
      const bankField = overlay.querySelector('.bank-code-field');
      const sync = () => {
        const failed = resultSelect.value === 'failed';
        bankField.hidden = debt.PhuongThuc !== 'Chuyển khoản';
        overlay.querySelector('#paymentNoteLabel').textContent = failed ? 'Nguyên nhân thất bại *' : 'Ghi chú thanh toán';
      };
      resultSelect.addEventListener('change', sync); sync();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.submit-payment-result').addEventListener('click', async event => {
        const success = resultSelect.value === 'success';
        const bankCode = overlay.querySelector('#paymentBankCode').value.trim();
        const note = overlay.querySelector('#paymentNote').value.trim();
        if (success && debt.PhuongThuc === 'Chuyển khoản' && !bankCode) return context.showToast('Vui lòng nhập mã giao dịch ngân hàng.', 'error');
        if (!success && !note) return context.showToast('Thanh toán thất bại phải ghi nguyên nhân.', 'error');
        if (success && !window.confirm(`Xác nhận đã thanh toán thành công ${money(debt.SoTienPhieuChi)}? Công nợ sẽ chuyển sang Đã tất toán.`)) return;
        event.currentTarget.disabled = true;
        try {
          const result = await api(context, `/accounting/payment-vouchers/${debt.MaPhieu}/pay`, {
            method: 'POST', body: JSON.stringify({ ThanhCong: success, MaGiaoDichNganHang: bankCode, GhiChuThanhToan: note })
          });
          context.showToast(result.message, success ? 'success' : 'error'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); event.currentTarget.disabled = false; }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initPayables = async (root, context) => {
    let items = [];
    const render = () => {
      root.querySelector('#accountingPayableBody').innerHTML = items.length ? items.map(item => {
        const due = Number(item.SoNgayConLai) <= 0;
        let action = `<span class="payment-voucher-wait">Còn ${item.SoNgayConLai} ngày</span>`;
        if (!item.MaPhieu && Number(item.SoTienConLai) > 0) {
          action = `<button class="warehouse-primary" data-create-voucher="${esc(item.MaCNPTra)}">${due ? 'Lập Phiếu chi' : 'Lập Phiếu chi sớm'}</button>`;
        }
        else if (item.TrangThaiPhieuChi === 'Từ chối') action = `<button class="warehouse-secondary" data-resubmit-voucher="${esc(item.MaCNPTra)}">Sửa &amp; gửi lại</button>`;
        else if (['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThaiPhieuChi)) action = `<button class="warehouse-primary" data-pay-voucher="${esc(item.MaCNPTra)}">${item.TrangThaiPhieuChi === 'Thanh toán thất bại' ? 'Thực hiện lại' : 'Thanh toán'}</button>`;
        else if (item.TrangThaiPhieuChi === 'Chờ duyệt') action = '<span class="payment-voucher-wait">Chờ Quản lý giao tiền</span>';
        else if (item.TrangThaiPhieuChi === 'Thanh toán thành công') action = '<span class="status-pill ok">Đã tất toán</span>';
        return `<tr><td><strong>${esc(item.MaCNPTra)}</strong><small>Phát sinh ${fmtDate(item.NgayPhatSinh)}</small></td><td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)}</small></td><td><button class="warehouse-link" data-invoice="${esc(item.MaHDMH)}">HĐ ${esc(item.SoHoaDon)}</button><small>${esc(item.MaPO)} · ${esc(item.MaPN)}</small></td><td><strong>${fmtDate(item.HanThanhToan)}</strong><small>${Number(item.SoNgayConLai) < 0 ? `Quá ${Math.abs(item.SoNgayConLai)} ngày` : Number(item.SoNgayConLai) === 0 ? 'Đến hạn hôm nay' : `Còn ${item.SoNgayConLai} ngày`}</small></td><td class="num"><strong>${money(item.SoTienConLai)}</strong><small>Gốc ${money(item.SoTienNo)}</small></td><td>${item.MaPhieu ? `<strong>${esc(item.MaPhieu)}</strong><small>${esc(item.PhuongThuc)}</small><span class="status-pill ${voucherClass(item.TrangThaiPhieuChi)}">${esc(item.TrangThaiPhieuChi)}</span>` : '<span class="status-pill draft">Chưa lập Phiếu chi</span>'}</td><td>${action}</td></tr>`;
      }).join('') : '<tr><td colspan="7" class="warehouse-empty">Chưa có công nợ phù hợp.</td></tr>';
    };
    const load = async () => {
      try {
        const search = root.querySelector('#accountingPayableSearch').value;
        const status = root.querySelector('#accountingVoucherStatus').value;
        const data = await api(context, `/accounting/payables?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        items = data.items; render();
        root.querySelector('#payableRemaining').textContent = money(data.summary.TongConLai);
        root.querySelector('#payableCount').textContent = `${data.summary.TongKhoan} khoản`;
        root.querySelector('#voucherWaiting').textContent = data.summary.ChoDuyet;
        root.querySelector('#voucherReady').textContent = data.summary.ChoThanhToan;
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('KẾ TOÁN / UC28', 'Công nợ và Phiếu chi Nhà cung cấp', 'Lập đúng một Phiếu chi cho toàn bộ công nợ đến hạn. Sau khi Quản lý giao tiền, bạn thanh toán cho Nhà cung cấp; chỉ thành công mới giảm công nợ.', '<button class="warehouse-secondary" id="backInvoices">Mở hồ sơ đối chiếu</button>')}${settlementFlow()}<div class="warehouse-stats payment-voucher-stats"><article><span>CÒN PHẢI TRẢ</span><strong id="payableRemaining">0 đ</strong><small id="payableCount">0 khoản</small></article><article><span>CHỜ QUẢN LÝ GIAO TIỀN</span><strong id="voucherWaiting">0</strong><small>Duyệt Phiếu chi = giao quỹ</small></article><article><span>ĐÃ NHẬN TIỀN, CẦN CHI NCC</span><strong id="voucherReady">0</strong><small>Đã duyệt hoặc thanh toán thất bại</small></article></div><article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"></use></svg><input id="accountingPayableSearch" placeholder="Tìm công nợ, Nhà cung cấp, hóa đơn hoặc Phiếu chi..."></label><div class="warehouse-toolbar-actions"><select id="accountingVoucherStatus"><option value="">Tất cả Phiếu chi</option><option>Chưa lập Phiếu chi</option><option>Chờ duyệt</option><option>Đã duyệt</option><option>Thanh toán thất bại</option><option>Thanh toán thành công</option><option>Từ chối</option></select><button class="warehouse-icon-button" id="refreshPayables"><svg><use href="#i-refresh"></use></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table payment-voucher-table"><thead><tr><th>CÔNG NỢ</th><th>NHÀ CUNG CẤP</th><th>BỘ CHỨNG TỪ</th><th>HẠN THANH TOÁN</th><th>CÒN LẠI</th><th>PHIẾU CHI</th><th>THAO TÁC</th></tr></thead><tbody id="accountingPayableBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#accountingPayableSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#accountingVoucherStatus').addEventListener('change', load);
    root.querySelector('#refreshPayables').addEventListener('click', load);
    root.querySelector('#backInvoices').addEventListener('click', () => context.navigate('accounting-invoices'));
    root.addEventListener('click', event => {
      const invoice = event.target.closest('[data-invoice]');
      if (invoice) return invoiceDetail(context, invoice.dataset.invoice);
      const create = event.target.closest('[data-create-voucher]');
      if (create) return paymentVoucherForm(context, create.dataset.createVoucher, load);
      const resubmit = event.target.closest('[data-resubmit-voucher]');
      if (resubmit) return paymentVoucherForm(context, resubmit.dataset.resubmitVoucher, load, true);
      const pay = event.target.closest('[data-pay-voucher]');
      if (pay) return paymentResultForm(context, pay.dataset.payVoucher, load);
    });
    await load();
  };

  const initManagerPayables = async (root, context) => {
    let items = [];
    let summary = {};
    const render = () => {
      root.querySelector('#managerDebtBody').innerHTML = items.length ? items.map(item => `
        <tr>
          <td><strong>${esc(item.MaCNPTra)}</strong><small>Phát sinh ${fmtDate(item.NgayPhatSinh)}</small></td>
          <td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)}</small></td>
          <td><strong>HĐ ${esc(item.SoHoaDon)}</strong><small>${esc(item.MaPO)} · ${esc(item.MaPN || 'Chưa có Phiếu nhập')}</small></td>
          <td><strong>${fmtDate(item.HanThanhToan)}</strong><small>${item.TrangThaiHienTai === 'Đã thanh toán' ? 'Đã hoàn tất' : item.SoNgayConLai < 0 ? `Quá ${Math.abs(item.SoNgayConLai)} ngày` : `Còn ${item.SoNgayConLai} ngày`}</small></td>
          <td class="num"><strong>${money(item.SoTienNo)}</strong><small>Đã trả ${money(item.SoTienDaTra)}</small></td>
          <td class="num"><strong>${money(item.SoTienConLai)}</strong></td>
          <td><span class="status-pill ${debtClass(item.TrangThaiHienTai)}">${esc(item.TrangThaiHienTai)}</span><small>${esc(item.BuocTatToan || (item.MaPhieu ? item.TrangThaiPhieuChi : 'Chưa lập Phiếu chi'))}</small></td>
          <td>${item.TrangThaiPhieuChi === 'Chờ duyệt'
            ? `<button class="warehouse-primary manager-debt-detail" data-fund-voucher="${esc(item.MaPhieu)}">Giao tiền</button>`
            : `<button class="warehouse-secondary manager-debt-detail" data-manager-debt="${esc(item.MaCNPTra)}">Xem</button>`}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="warehouse-empty">Chưa phát sinh công nợ phải trả phù hợp với bộ lọc.</td></tr>';
      root.querySelector('#managerDebtCount').textContent = `${items.length} khoản hiển thị`;
    };
    const load = async () => {
      try {
        const search = root.querySelector('#managerDebtSearch').value;
        const status = root.querySelector('#managerDebtStatus').value;
        const data = await api(context, `/admin/finance/payables?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        items = data.items;
        summary = data.summary;
        root.querySelector('#managerDebtTotal').textContent = money(summary.TongPhatSinh);
        root.querySelector('#managerDebtPaid').textContent = money(summary.TongDaTra);
        root.querySelector('#managerDebtRemaining').textContent = money(summary.TongConLai);
        root.querySelector('#managerDebtOverdue').textContent = money(summary.TongQuaHan);
        root.querySelector('#managerDebtTotalNote').textContent = `${summary.TongKhoan || 0} khoản đã ghi nhận`;
        root.querySelector('#managerDebtOverdueNote').textContent = `${summary.SoKhoanQuaHan || 0} khoản quá hạn`;
        const fundHint = root.querySelector('#managerFundHint');
        if (fundHint) fundHint.textContent = `${summary.ChoGiaoTien || 0} phiếu chờ giao tiền · ${summary.ChoKeToanChi || 0} phiếu chờ Kế toán chi NCC`;
        render();
      } catch (error) { context.showToast(error.message, 'error'); }
    };

    root.innerHTML = `${heading('ĐIỀU HÀNH / TÀI CHÍNH', 'Theo dõi công nợ Nhà cung cấp', 'Giám sát nghĩa vụ phải trả; khi Kế toán lập Phiếu chi, Quản lý duyệt đồng thời giao tiền để Kế toán tất toán với Nhà cung cấp.', '<button class="warehouse-primary" id="printManagerPayables"><svg><use href="#i-report"/></svg>In báo cáo công nợ</button>')}${settlementFlow()}<div class="manager-readonly-note"><svg><use href="#i-shield"/></svg><div><strong>Việc của Quản lý</strong><span>Đối chiếu hóa đơn do Kế toán làm. Khi Phiếu chi chờ duyệt, bạn giao tiền mặt hoặc ủy quyền chuyển khoản. Công nợ chỉ giảm sau khi Kế toán thanh toán thành công.</span><small id="managerFundHint">0 phiếu chờ giao tiền</small></div></div><div class="warehouse-stats manager-debt-stats"><article><span>TỔNG GIÁ TRỊ GHI NHẬN</span><strong id="managerDebtTotal">0 đ</strong><small id="managerDebtTotalNote">0 khoản đã ghi nhận</small></article><article><span>ĐÃ THANH TOÁN</span><strong id="managerDebtPaid">0 đ</strong><small>Lũy kế thanh toán Nhà cung cấp</small></article><article><span>CÒN PHẢI TRẢ</span><strong id="managerDebtRemaining">0 đ</strong><small>Nghĩa vụ chưa hoàn tất</small></article><article class="attention"><span>ĐÃ QUÁ HẠN</span><strong id="managerDebtOverdue">0 đ</strong><small id="managerDebtOverdueNote">0 khoản quá hạn</small></article></div><article class="warehouse-table-card manager-debt-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="managerDebtSearch" placeholder="Tìm mã công nợ, Nhà cung cấp, hóa đơn hoặc Đơn mua..."></label><div class="warehouse-toolbar-actions"><span class="manager-debt-count" id="managerDebtCount">0 khoản hiển thị</span><select id="managerDebtStatus"><option value="">Tất cả trạng thái</option><option>Đang nợ</option><option>Quá hạn</option><option>Đã thanh toán</option></select><button class="warehouse-icon-button" id="refreshManagerDebt" title="Làm mới"><svg><use href="#i-refresh"/></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table manager-debt-table"><thead><tr><th>MÃ CÔNG NỢ</th><th>NHÀ CUNG CẤP</th><th>HỒ SƠ NGUỒN</th><th>HẠN THANH TOÁN</th><th>GIÁ TRỊ / ĐÃ TRẢ</th><th>CÒN LẠI</th><th>TIẾN ĐỘ</th><th>THAO TÁC</th></tr></thead><tbody id="managerDebtBody"></tbody></table></div></article>`;

    let timer;
    root.querySelector('#managerDebtSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#managerDebtStatus').addEventListener('change', load);
    root.querySelector('#refreshManagerDebt').addEventListener('click', load);
    root.addEventListener('click', event => {
      const fund = event.target.closest('[data-fund-voucher]');
      if (fund) return window.FLY_PAYMENT_VOUCHER?.openApproval(context, fund.dataset.fundVoucher, load);
      const detail = event.target.closest('[data-manager-debt]');
      if (detail) managerPayableDetail(context, detail.dataset.managerDebt, load);
    });
    root.querySelector('#printManagerPayables').addEventListener('click', () => window.FLY_PRINT.show({
      title: 'BÁO CÁO TỔNG HỢP CÔNG NỢ NHÀ CUNG CẤP', number: `BC-CN-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).replaceAll('-', '')}`,
      documentDate: new Date(), status: 'Báo cáo quản trị',
      fields: [
        { label: 'Phạm vi', value: 'Toàn bộ cửa hàng Hà Nội' }, { label: 'Số khoản đang hiển thị', value: items.length },
        { label: 'Tổng giá trị ghi nhận', value: summary.TongPhatSinh, format: 'money' }, { label: 'Tổng còn phải trả', value: summary.TongConLai, format: 'money' }
      ],
      columns: [
        { label: 'Mã công nợ', key: 'MaCNPTra' }, { label: 'Nhà cung cấp', key: 'TenNCC' },
        { label: 'Hóa đơn', key: 'SoHoaDon' }, { label: 'Hạn thanh toán', key: 'HanThanhToan', format: 'date' },
        { label: 'Giá trị', key: 'SoTienNo', format: 'money', align: 'right' },
        { label: 'Đã trả', key: 'SoTienDaTra', format: 'money', align: 'right' },
        { label: 'Còn lại', key: 'SoTienConLai', format: 'money', align: 'right' },
        { label: 'Trạng thái', key: 'TrangThaiHienTai' }
      ], rows: items,
      totals: [
        { label: 'Tổng đã thanh toán', value: summary.TongDaTra, format: 'money' },
        { label: 'Tổng còn phải trả', value: summary.TongConLai, format: 'money' },
        { label: 'Trong đó quá hạn', value: summary.TongQuaHan, format: 'money' }
      ],
      note: 'Báo cáo quản trị được lập từ các khoản công nợ đã phát sinh sau đối chiếu Đơn mua – Phiếu nhập – Hóa đơn.',
      signatures: ['Kế toán lập báo cáo', 'Quản lý cửa hàng']
    }));
    await load();
  };

  const printShiftReceipt = (detail, receiptId, status) => window.FLY_PRINT?.show({
    title: 'PHIẾU THU TIỀN MẶT BÀN GIAO CA', number: receiptId,
    documentDate: new Date(), status,
    fields: [
      { label: 'Mã ca', value: detail.shift.MaCa }, { label: 'Thu ngân', value: detail.shift.TenNV },
      { label: 'Quầy', value: detail.shift.TenQuay || '—' }, { label: 'Kết thúc', value: detail.shift.ThoiGianKetThuc, format: 'date' }
    ],
    columns: [
      { label: 'Phương thức', key: 'PhuongThuc' }, { label: 'Mã giao dịch', key: 'MaGiaoDich' },
      { label: 'Số tiền', key: 'SoTien', format: 'money', align: 'right' }, { label: 'Trạng thái', key: 'TrangThai' }
    ], rows: detail.payments,
    totals: [
      { label: 'Doanh thu / thực thu ca', value: detail.invoices.filter(row => row.TrangThai === 'Hoàn thành').reduce((sum, row) => sum + Number(row.TongThanhToan || 0), 0), format: 'money' },
      { label: 'Tiền mặt theo hệ thống', value: detail.shift.TienMatHeThong, format: 'money' },
      { label: 'Tiền thực nộp', value: detail.shift.TienThucNop, format: 'money' },
      { label: 'Chênh lệch', value: Number(detail.shift.TienThucNop) - Number(detail.shift.TienMatHeThong), format: 'money' }
    ], signatures: ['Thu ngân bàn giao', 'Kế toán nhận']
  });

  const askDifferenceReason = difference => new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal" style="width:min(560px,95vw)"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHÊNH LỆCH TIỀN MẶT</p><h2>${money(difference)}</h2></div><button type="button" class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><p class="receipt-rule">Theo bài trình / Chương 6: lệch phải ghi lý do trực tiếp trên Phiếu thu, không lập biên bản riêng. Chỉ xác nhận sau khi Thu ngân giải trình.</p><div class="warehouse-field"><label>Lý do chênh lệch *</label><textarea id="settlementReason" maxlength="500" rows="4"></textarea></div></div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Hủy</button><button type="button" class="warehouse-primary save">Lưu lý do</button></div></div>`;
    document.body.appendChild(overlay);
    const close = value => { overlay.remove(); resolve(value); };
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => close(null)));
    overlay.querySelector('.save').addEventListener('click', () => {
      const reason = overlay.querySelector('#settlementReason').value.trim();
      if (!reason) return;
      close(reason);
    });
  });

  const openSettlementDetail = async (context, maCa, onDone) => {
    const detail = await api(context, `/accounting/shift-settlements/${maCa}`);
    const shift = detail.shift;
    const revenue = detail.invoices.filter(row => row.TrangThai === 'Hoàn thành').reduce((sum, row) => sum + Number(row.TongThanhToan || 0), 0);
    const difference = Number(shift.TienThucNop) - Number(shift.TienMatHeThong);
    const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐỐI SOÁT DOANH THU THEO CA</p><h2>${esc(shift.MaCa)}</h2></div><button type="button" class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body">
      <div class="warehouse-stats"><article><span>THỰC THU / DOANH THU CA</span><strong>${money(revenue)}</strong><small>${detail.invoices.filter(row => row.TrangThai === 'Hoàn thành').length} hóa đơn hoàn thành</small></article><article><span>TIỀN MẶT THU</span><strong>${money(shift.TongTienMat)}</strong></article><article><span>CHUYỂN KHOẢN</span><strong>${money(shift.TongTienChuyenKhoan)}</strong></article><article><span>QR</span><strong>${money(shift.TongTienQR)}</strong></article><article><span>THẺ</span><strong>${money(shift.TongTienThe)}</strong></article><article><span>HOÀN TIỀN MẶT</span><strong>${money(shift.TongTienHoanMat)}</strong></article></div>
      <p class="receipt-rule">Thực thu = tổng hóa đơn Hoàn thành. Tiền mặt phải bàn giao = TM thành công − hoàn TM (không gồm quỹ đầu ca, QR/thẻ/CK). Phiếu thu không ghi doanh thu lần hai.</p>
      <div class="warehouse-detail-grid"><div><span>THU NGÂN</span><strong>${esc(shift.TenNV)}</strong></div><div><span>QUẦY</span><strong>${esc(shift.TenQuay || '—')}</strong></div><div><span>BẮT ĐẦU</span><strong>${fmtDateTime(shift.ThoiGianBatDau)}</strong></div><div><span>KẾT THÚC</span><strong>${fmtDateTime(shift.ThoiGianKetThuc)}</strong></div><div><span>TM HỆ THỐNG</span><strong>${money(shift.TienMatHeThong)}</strong></div><div><span>THỰC NỘP</span><strong>${money(shift.TienThucNop)}</strong></div><div><span>CHÊNH LỆCH</span><strong>${money(difference)}</strong></div><div><span>PHIẾU THU</span><strong>${esc(shift.MaPT || 'Chưa lập')}</strong></div></div>
      <div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>HÓA ĐƠN</th><th>THỜI ĐIỂM</th><th>TỔNG THANH TOÁN</th><th>TRẠNG THÁI</th></tr></thead><tbody>${detail.invoices.length ? detail.invoices.map(row => `<tr><td><strong>${esc(row.MaHD)}</strong></td><td>${fmtDateTime(row.NgayLap)}</td><td class="num">${money(row.TongThanhToan)}</td><td>${esc(row.TrangThai)}</td></tr>`).join('') : '<tr><td colspan="4" class="warehouse-empty">Không có hóa đơn.</td></tr>'}</tbody></table></div>
    </div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Đóng</button>${shift.TrangThaiPhieuThu === 'Đã xác nhận' ? '<button type="button" class="warehouse-primary print-receipt">In Phiếu thu</button>' : shift.MaPT ? '<button type="button" class="warehouse-primary confirm-receipt">Xác nhận Phiếu thu</button>' : '<button type="button" class="warehouse-primary create-receipt">Lập Phiếu thu</button>'}</div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('.print-receipt')?.addEventListener('click', () => printShiftReceipt(detail, shift.MaPT, 'Đã xác nhận'));
    overlay.querySelector('.create-receipt')?.addEventListener('click', async () => {
      try {
        let reason = '';
        if (difference) {
          reason = await askDifferenceReason(difference);
          if (!reason) return;
        }
        const created = await api(context, `/accounting/shift-settlements/${maCa}/receipt`, { method: 'POST', body: JSON.stringify({ LyDoChenhLech: reason }) });
        context.showToast(created.message, 'success'); close(); await onDone();
        await openSettlementDetail(context, maCa, onDone);
      } catch (error) { context.showToast(error.message, 'error'); }
    });
    overlay.querySelector('.confirm-receipt')?.addEventListener('click', async () => {
      try {
        const result = await api(context, `/accounting/shift-receipts/${shift.MaPT}/confirm`, { method: 'POST' });
        context.showToast(result.message, 'success');
        printShiftReceipt(detail, shift.MaPT, 'Đã xác nhận');
        close(); await onDone();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
  };

  const initSettlements = async (root, context) => {
    const load = async () => {
      try {
        const data = await api(context, '/accounting/shift-settlements');
        const items = data.items || [];
        const summary = data.summary || {};
        root.innerHTML = `${heading('KẾ TOÁN / ĐỐI SOÁT BÁN LẺ', 'Doanh thu theo ca và Phiếu thu', 'Thực thu = tổng hóa đơn hoàn thành của ca. Phiếu thu chỉ đối soát tiền mặt bàn giao, không ghi doanh thu lần hai.')}
          <div class="warehouse-stats"><article><span>THỰC THU CÁC CA ĐÃ CHỐT</span><strong>${money(summary.DoanhThu)}</strong><small>${items.length} ca đã đóng</small></article><article><span>TIỀN MẶT HỆ THỐNG</span><strong>${money(summary.TienMatHeThong)}</strong><small>TM thành công − hoàn TM</small></article><article><span>THỰC NỘP</span><strong>${money(summary.TienThucNop)}</strong><small>Tiền mặt thu ngân bàn giao</small></article><article><span>ĐIỆN TỬ (CK + QR + THẺ)</span><strong>${money(Number(summary.TongTienChuyenKhoan || 0) + Number(summary.TongTienQR || 0) + Number(summary.TongTienThe || 0))}</strong><small>Đối chiếu sao kê, không vào két</small></article></div>
          <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CA ĐÃ ĐÓNG</p><h2>Hàng đợi đối soát doanh thu và tiền mặt</h2></div><button class="warehouse-secondary" id="refreshSettlements"><svg><use href="#i-refresh"/></svg>Làm mới</button></div>
          <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>CA / THU NGÂN</th><th>KẾT THÚC</th><th>THỰC THU</th><th>TM / CK / QR / THẺ</th><th>TM HỆ THỐNG</th><th>THỰC NỘP</th><th>CHÊNH LỆCH</th><th>ĐỐI SOÁT</th><th>THAO TÁC</th></tr></thead><tbody>${items.length ? items.map(item => `<tr><td><strong>${esc(item.MaCa)}</strong><small>${esc(item.TenNV)} · ${esc(item.TenQuay || '—')}</small></td><td>${fmtDateTime(item.ThoiGianKetThuc)}</td><td class="num"><strong>${money(item.DoanhThu)}</strong><small>${item.SoHoaDon || 0} HĐ</small></td><td class="num"><small>TM ${money(item.TongTienMat)}<br>CK ${money(item.TongTienChuyenKhoan)}<br>QR ${money(item.TongTienQR)} · Thẻ ${money(item.TongTienThe)}</small></td><td class="num">${money(item.TienMatHeThong)}</td><td class="num">${money(item.TienThucNop)}</td><td class="num"><strong>${money(item.ChenhLech)}</strong></td><td><span class="status-pill ${item.TrangThaiDoiSoat === 'Đã đối soát' ? 'ok' : 'sent'}">${esc(item.TrangThaiDoiSoat)}</span></td><td><button class="warehouse-primary settlement-action" data-ca="${item.MaCa}">Xem thực thu</button></td></tr>`).join('') : '<tr><td colspan="9" class="warehouse-empty">Chưa có ca đã đóng. Thu ngân phải đóng ca bán hàng trước.</td></tr>'}</tbody></table></div></article>`;
        root.querySelector('#refreshSettlements').addEventListener('click', load);
        root.querySelectorAll('.settlement-action').forEach(button => button.addEventListener('click', async () => {
          try { await openSettlementDetail(context, button.dataset.ca, load); }
          catch (error) { context.showToast(error.message, 'error'); }
        }));
      } catch (error) {
        root.innerHTML = `<div class="welcome-card"><h2>Không thể tải đối soát ca</h2><p>${esc(error.message)}</p></div>`;
      }
    };
    await load();
  };

  const ui = () => window.FLY_UI || { kpiGrid: () => '', bars: () => '', person: (name, sub) => `${name}${sub ? `<small>${sub}</small>` : ''}` };
  const chartUi = () => window.FLY_CHARTS || { card: () => '', line: () => '', columns: () => '', horizontal: () => '', donut: () => '', metricBars: () => '', compact: value => value, money };
  const periodFilterCard = extraButtons => `${window.FLY_VI_DATE.periodToolbar(reportDefaults(), extraButtons)}<div id="financialReportBody"><div class="overview-loading">Đang tải báo cáo...</div></div>`;
  const bindPeriodUi = (root, load) => {
    const selectedPeriod = () => {
      const type = root.querySelector('#reportPeriodType')?.value;
      const inputs = { day: '#reportDay', month: '#reportMonth', quarter: '#reportQuarter', year: '#reportYear' };
      const period = root.querySelector(inputs[type] || '#reportMonth')?.value;
      if (!type || !period) throw new Error('Chưa chọn kỳ báo cáo.');
      return { type, period };
    };
    root.querySelector('#reportPeriodType')?.addEventListener('change', () => {
      const type = root.querySelector('#reportPeriodType').value;
      root.querySelectorAll('[data-period-field]').forEach(field => field.classList.toggle('active', field.dataset.periodField === type));
    });
    root.querySelector('#loadFinancialReport')?.addEventListener('click', load);
    return selectedPeriod;
  };

  const initStoreOperationsReports = async (root, context) => {
    let currentReport = null;
    root.innerHTML = `${heading('QUẢN LÝ / UC10', 'Báo cáo hoạt động cửa hàng', 'Tổng hợp doanh thu, thu–chi, ca bán, đổi trả, tồn thấp và công nợ quá hạn. Chi tiết lãi gộp 3 bước nằm ở báo cáo Kế toán.')}${periodFilterCard('<button class="warehouse-secondary" id="exportReportCsv" disabled>Xuất CSV</button><button class="warehouse-secondary" id="printFinancialReport" disabled>Xem bản in / PDF</button>')}`;
    const selectedPeriod = bindPeriodUi(root, () => { load(); });
    const load = async () => {
      const button = root.querySelector('#loadFinancialReport');
      if (button) button.disabled = true;
      try {
        const { type, period } = selectedPeriod();
        currentReport = await api(context, `/admin/reports/store-operations?periodType=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}${root.dataset.reportLock === '1' ? '&lockPeriod=1' : ''}`);
        window.FLY_REPORT_PERIOD?.syncFromReport(root, currentReport);
        root.dataset.reportLock = '1';
        const s = currentReport.sales || {}; const f = currentReport.finance || {}; const a = currentReport.activity || {}; const alerts = currentReport.alerts || {};
        const p = currentReport.purchases || {}; const inv = currentReport.inventory || {};
        const cashiers = currentReport.cashiers || []; const daily = currentReport.daily || [];
        const categorySales = currentReport.salesByCategory || [];
        const topProducts = currentReport.topProducts || [];
        const inventoryCategories = currentReport.inventoryByCategory || [];
        const qty = value => Number(value || 0).toLocaleString('vi-VN');
        const visuals = ui();
        const charts = chartUi();
        const grossMargin = Number(s.DoanhThuThuan || 0) ? Number(s.LoiNhuanGop || 0) / Number(s.DoanhThuThuan) * 100 : 0;
        root.querySelector('#financialReportBody').innerHTML = `${window.FLY_REPORT_PERIOD?.activeFallbackBanner(root, currentReport) || ''}<div class="financial-report-title"><div><p>KỲ BÁO CÁO</p><h2>${esc(currentReport.period.label)}</h2><span>${esc(currentReport.period.from)} đến ${esc(currentReport.period.to)}</span></div><span class="status-pill ok">Hoạt động cửa hàng</span></div>
          ${visuals.kpiGrid([
            { icon: 'i-trend', label: 'DOANH THU THUẦN', value: money(s.DoanhThuThuan), hint: `${s.SoHoaDon || 0} hóa đơn − ${money(s.TienHoan)} hoàn` },
            { icon: 'i-report', label: 'LỢI NHUẬN GỘP', value: money(s.LoiNhuanGop), hint: 'Chưa gồm lương, điện nước, thuê mặt bằng' },
            { icon: 'i-cart', label: 'HÓA ĐƠN HOÀN THÀNH', value: String(s.SoHoaDon || 0), hint: `${a.SoCaMo || 0} ca bán hàng trong kỳ` },
            { icon: 'i-box', label: 'GIÁ TRỊ TỒN KHO', value: money(inv.GiaTriCuoiKy), hint: `${qty(inv.SoLuongCuoiKy)} đơn vị cuối kỳ` },
            { icon: 'i-bank', label: 'CÔNG NỢ PHẢI TRẢ', value: money(f.CongNoConLai), hint: `Quá hạn ${money(f.CongNoQuaHan)}`, tone: Number(f.CongNoQuaHan) ? 'attention' : '' },
            { icon: 'i-warning', label: 'CẢNH BÁO TỒN KHO', value: `${alerts.TonThap || 0} mặt hàng`, hint: `${alerts.DoiTraDangXuLy || 0} đổi trả đang xử lý`, tone: Number(alerts.TonThap) ? 'attention' : '' }
          ], 'primary')}
          <div class="fly-dashboard-grid report-chart-trio">
            ${charts.card({ kicker: 'XU HƯỚNG DOANH THU', title: 'Doanh thu và lãi gộp theo ngày', subtitle: 'Đã trừ hoàn tiền và điều chỉnh giá vốn đổi trả', badge: `Biên lãi ${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(grossMargin)}%`, className: 'executive', chart: charts.line({ labels: daily.map(row => fmtDate(row.Ngay)), series: [{ name: 'Doanh thu thuần', values: daily.map(row => row.DoanhThuThuan), color: '#2c8b66' }, { name: 'Lãi gộp', values: daily.map(row => row.LoiNhuanGop), color: '#5376c6' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có hóa đơn hoặc đổi trả hoàn thành.' }) })}
            ${charts.card({ kicker: 'DANH MỤC BÁN HÀNG', title: 'Doanh thu theo danh mục', subtitle: 'Doanh thu hóa đơn trước phân bổ hoàn tiền', badge: `${categorySales.length} danh mục`, className: 'operations', chart: charts.columns({ labels: categorySales.map(row => row.TenDM), series: [{ name: 'Doanh thu hóa đơn', values: categorySales.map(row => row.DoanhThuHoaDon), color: '#2c8b66' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có doanh thu theo danh mục.' }) })}
            ${charts.card({ kicker: 'CƠ CẤU DOANH THU', title: 'Tỷ trọng theo danh mục hàng', subtitle: 'Phân bổ doanh thu hóa đơn theo nhóm sản phẩm', badge: money(s.DoanhThuHoaDon), className: 'summary', chart: charts.donut({ items: categorySales.map((row, index) => ({ label: row.TenDM, value: row.DoanhThuHoaDon, color: charts.palette?.[index % charts.palette.length] })), centerLabel: 'Doanh thu HĐ', centerValue: money(s.DoanhThuHoaDon), formatter: money, emptyText: 'Kỳ này chưa có doanh thu.' }) })}
          </div>
          <div class="report-bottom-grid">
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>TOP SẢN PHẨM</p><h2>Sản phẩm bán chạy trong kỳ</h2></div><span class="report-card-count">${topProducts.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>ĐÃ BÁN</th><th>DOANH THU</th><th>LÃI GỘP HĐ</th></tr></thead><tbody>${topProducts.length ? topProducts.slice(0, 6).map(row => `<tr><td>${visuals.person(row.TenSP, `${row.MaSP} · ${row.TenDM}`)}</td><td class="num">${qty(row.SoLuongBan)}</td><td class="num"><strong>${money(row.DoanhThuHoaDon)}</strong></td><td class="num">${money(row.LaiGopHoaDon)}</td></tr>`).join('') : '<tr><td colspan="4" class="warehouse-empty">Kỳ này chưa có sản phẩm bán ra.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>NHẬP – XUẤT – TỒN</p><h2>Giá trị tồn theo danh mục</h2></div><span class="report-card-count">${inventoryCategories.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>DANH MỤC</th><th>SỐ LƯỢNG TỒN</th><th>GIÁ TRỊ TỒN</th></tr></thead><tbody>${inventoryCategories.length ? inventoryCategories.slice(0, 6).map(row => `<tr><td><strong>${esc(row.TenDM)}</strong><small>${esc(row.MaDM)}</small></td><td class="num">${qty(row.SoLuongTon)}</td><td class="num"><strong>${money(row.GiaTriTon)}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Chưa có tồn kho theo danh mục.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Ưu tiên điều hành</h2></div></div>${alertList([
              { icon: 'i-warning', tone: Number(alerts.TonThap) ? 'warning' : 'ok', title: `${alerts.TonThap || 0} mặt hàng dưới tồn tối thiểu`, detail: 'Cần xem đề nghị mua và tồn thực tế', value: 'Kho' },
              { icon: 'i-bank', tone: Number(alerts.CongNoQuaHan) ? 'danger' : 'ok', title: `${alerts.CongNoQuaHan || 0} khoản công nợ quá hạn`, detail: `Tổng quá hạn ${money(f.CongNoQuaHan)}`, value: 'Công nợ' },
              { icon: 'i-cash', tone: Number(alerts.CaChoDoiSoat) ? 'warning' : 'ok', title: `${alerts.CaChoDoiSoat || 0} ca chờ Kế toán đối soát`, detail: `Chênh lệch Phiếu thu ${money(f.ChenhLechPhieuThu)}`, value: 'Bàn giao' },
              { icon: 'i-refresh', tone: Number(alerts.DoiTraDangXuLy) ? 'warning' : 'ok', title: `${alerts.DoiTraDangXuLy || 0} đổi trả đang xử lý`, detail: 'Theo dõi kiểm tra kho và phê duyệt', value: 'Đổi trả' }
            ])}</article>
          </div>
          ${doiTraPanel(currentReport.doiTra, { title: 'Đổi trả toàn cửa hàng', subtitle: 'Hàng đi đâu: nhập lại kho bán (cộng tồn) hoặc loại bỏ/vứt (không cộng, đã trừ lúc bán). Không trừ kho lần nữa.', productTitle: 'SKU khách trả nhiều' })}
          <details class="report-detail-disclosure"><summary>Xem phân tích vận hành mở rộng</summary><div class="fly-dashboard-grid equal report-supporting-charts">
            ${charts.card({ kicker: 'ĐÓNG GÓP NHÂN SỰ', title: 'Doanh thu theo Thu ngân', subtitle: 'Doanh thu hóa đơn theo các ca mở trong kỳ', badge: `${cashiers.length} nhân viên`, className: 'ranking', chart: charts.horizontal({ items: cashiers.map(row => ({ label: row.TenNV, value: row.DoanhThuHoaDon, display: money(row.DoanhThuHoaDon) })), formatter: money, emptyText: 'Kỳ này chưa có ca bán hàng.' }) })}
            ${charts.card({ kicker: 'CƯỜNG ĐỘ VẬN HÀNH', title: 'Khối lượng chứng từ', subtitle: 'Bán hàng, mua hàng và kho trong cùng kỳ', badge: `${Number(a.SoHoaDon || 0) + Number(a.SoDonMua || 0) + Number(a.SoPhieuNhap || 0) + Number(a.SoPhieuXuat || 0)} hồ sơ`, className: 'operations', chart: charts.columns({ labels: ['Ca', 'Hóa đơn', 'Đổi trả', 'Đơn mua', 'Phiếu nhập', 'Phiếu xuất', 'Kiểm kê'], series: [{ name: 'Số lượng', values: [a.SoCaMo, a.SoHoaDon, a.SoDoiTra, a.SoDonMua, a.SoPhieuNhap, a.SoPhieuXuat, a.SoKiemKe], color: '#5376c6' }], formatter: qty, emptyText: 'Kỳ này chưa phát sinh hoạt động.' }) })}
          </div><div class="financial-report-sections"><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>MUA HÀNG</p><h2>Đơn mua và nhập kho</h2></div></div><div class="report-metric-list"><div><span>Đơn mua hợp lệ</span><strong>${p.SoDonMua || 0} · ${money(p.GiaTriDonMua)}</strong></div><div><span>Phiếu nhập xác nhận</span><strong>${p.SoPhieuNhap || 0} · ${money(p.GiaTriNhap)}</strong></div></div></article><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>THU – CHI</p><h2>Dòng tiền chứng từ</h2></div></div><div class="report-metric-list"><div><span>Phiếu thu thực nộp</span><strong>${money(f.PhieuThuThucNop)}</strong></div><div><span>Đã thanh toán NCC</span><strong>${money(f.DaThanhToanNCC)}</strong></div></div></article><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>BIẾN ĐỘNG KHO</p><h2>Nhập, xuất và điều chỉnh</h2></div></div><div class="report-metric-list"><div><span>Nhập / xuất</span><strong>${qty(inv.SoLuongNhap)} / ${qty(inv.SoLuongXuat)}</strong></div><div><span>Điều chỉnh ròng</span><strong>${qty(inv.DieuChinhRong)}</strong></div></div></article></div></details>`;
        try { window.FLY_REPORT_LAYOUT?.enhance(root.querySelector('#financialReportBody'), { actor: 'Quản lý', analysisTitle: 'Hiệu quả kinh doanh và vận hành cửa hàng' }); } catch (error) { console.warn(error); }
        const printBtn = root.querySelector('#printFinancialReport');
        const exportBtn = root.querySelector('#exportReportCsv');
        if (printBtn) printBtn.disabled = false;
        if (exportBtn) exportBtn.disabled = false;
      } catch (error) {
        context.showToast(error.message, 'error');
        const body = root.querySelector('#financialReportBody');
        if (body) body.innerHTML = `<div class="welcome-card"><h2>Không lập được báo cáo</h2><p>${esc(error.message)}</p></div>`;
      }
      finally { const live = root.querySelector('#loadFinancialReport'); if (live) live.disabled = false; }
    };
    root.querySelector('#printFinancialReport').addEventListener('click', () => {
      if (!currentReport) return;
      window.FLY_PRINT.show({
        variant: 'report',
        title: 'BÁO CÁO HOẠT ĐỘNG CỬA HÀNG', number: currentReport.period.period,
        documentDate: new Date(), status: currentReport.period.label,
        fields: [{ label: 'Từ ngày', value: currentReport.period.from }, { label: 'Đến ngày', value: currentReport.period.to }],
        columns: [{ label: 'Ngày', key: 'Ngay', format: 'date' }, { label: 'Số HĐ', key: 'SoHoaDon', align: 'right' }, { label: 'Doanh thu thuần', key: 'DoanhThuThuan', format: 'money', align: 'right' }, { label: 'Lãi gộp', key: 'LoiNhuanGop', format: 'money', align: 'right' }],
        rows: currentReport.daily,
        chart: { title: 'Doanh thu thuần và lãi gộp theo ngày', labelKey: 'Ngay', labelFormat: 'date', series: [{ name: 'Doanh thu thuần', key: 'DoanhThuThuan', color: '#267b5b' }, { name: 'Lãi gộp', key: 'LoiNhuanGop', color: '#4f72bb' }] },
        totals: [{ label: 'Doanh thu thuần', value: currentReport.sales.DoanhThuThuan, format: 'money' }, { label: 'LỢI NHUẬN GỘP', value: currentReport.sales.LoiNhuanGop, format: 'money' }, { label: 'Phiếu thu thực nộp', value: currentReport.finance.PhieuThuThucNop, format: 'money' }, { label: 'Phiếu chi', value: currentReport.finance.TongPhieuChi, format: 'money' }],
        note: 'Báo cáo quản trị tổng hợp hoạt động cửa hàng. Chi tiết công thức lãi gộp 3 bước do Kế toán lập (UC29).',
        signatures: ['Kế toán', 'Quản lý cửa hàng']
      });
    });
    root.querySelector('#exportReportCsv').addEventListener('click', () => {
      if (!currentReport) return;
      const rows = [['BÁO CÁO HOẠT ĐỘNG CỬA HÀNG', currentReport.period.label], ['Doanh thu thuần', currentReport.sales.DoanhThuThuan], ['Lợi nhuận gộp', currentReport.sales.LoiNhuanGop], ['Phiếu thu thực nộp', currentReport.finance.PhieuThuThucNop], ['Phiếu chi', currentReport.finance.TongPhieuChi], [], ['Ngày', 'Số hóa đơn', 'Doanh thu thuần', 'Lãi gộp'], ...currentReport.daily.map(row => [fmtDate(row.Ngay), row.SoHoaDon, row.DoanhThuThuan, row.LoiNhuanGop]), ...returnCsvRows(currentReport.doiTra)];
      downloadCsv(`hoat-dong-cua-hang-${currentReport.period.period}.csv`, rows);
    });
    await load();
  };

  const initFinancialReports = async (root, context) => {
    let currentReport = null;
    const endpoint = '/accounting/reports/financial-summary';
    const roleLabel = 'KẾ TOÁN / UC29';
    root.innerHTML = `${heading(roleLabel, 'Báo cáo tài chính nội bộ', 'Doanh thu thuần, giá vốn, lãi gộp 3 bước, thuế đầu vào, nhập–xuất–tồn giá trị, công nợ và chứng từ thu/chi.')}${periodFilterCard('<button class="warehouse-secondary" id="exportReportCsv" disabled>Xuất CSV</button><button class="warehouse-secondary" id="printFinancialReport" disabled>Xem bản in / PDF</button>')}`;

    const selectedPeriod = () => {
      const type = root.querySelector('#reportPeriodType')?.value;
      const inputs = { day: '#reportDay', month: '#reportMonth', quarter: '#reportQuarter', year: '#reportYear' };
      const period = root.querySelector(inputs[type] || '#reportMonth')?.value;
      if (!type || !period) throw new Error('Chưa chọn kỳ báo cáo.');
      return { type, period };
    };
    const syncPeriodFields = () => {
      const type = root.querySelector('#reportPeriodType').value;
      root.querySelectorAll('[data-period-field]').forEach(field => field.classList.toggle('active', field.dataset.periodField === type));
    };
    const render = data => {
      const s = data.sales || {}; const p = data.purchases || {}; const inv = data.inventory || {}; const f = data.finance || {};
      const daily = data.daily || [];
      const cashflowDaily = data.cashflowDaily || [];
      const debtAging = data.debtAging || [];
      const payables = data.payables || [];
      const reconciliation = data.reconciliation || [];
      const visuals = ui();
      const charts = chartUi();
      const grossMargin = Number(s.DoanhThuThuan || 0) ? Number(s.LoiNhuanGop || 0) / Number(s.DoanhThuThuan) * 100 : 0;
      const reconciliationMatched = reconciliation.find(row => row.TrangThaiDoiChieu === 'Đã khớp') || {};
      const reconciliationPending = reconciliation.reduce((sum, row) => sum + (row.TrangThaiDoiChieu === 'Đã khớp' ? 0 : Number(row.SoHoaDon || 0)), 0);
      root.querySelector('#financialReportBody').innerHTML = `${window.FLY_REPORT_PERIOD?.activeFallbackBanner(root, data) || ''}<div class="financial-report-title"><div><p>KỲ BÁO CÁO</p><h2>${esc(data.period.label)}</h2><span>${esc(data.period.from)} đến ${esc(data.period.to)}</span></div><span class="status-pill ok">Đã tổng hợp</span></div>
        ${visuals.kpiGrid([
          { icon: 'i-trend', label: 'DOANH THU THUẦN', value: money(s.DoanhThuThuan), hint: `${s.SoHoaDon || 0} hóa đơn − ${money(s.TienHoan)} hoàn tiền` },
          { icon: 'i-cash', label: 'PHIẾU THU THỰC NỘP', value: money(f.PhieuThuThucNop), hint: `${f.SoPhieuThu || 0} Phiếu thu bàn giao ca` },
          { icon: 'i-report', label: 'ĐÃ CHI NHÀ CUNG CẤP', value: money(f.DaThanhToanNCC), hint: `${f.SoPhieuChi || 0} Phiếu chi lập trong kỳ` },
          { icon: 'i-bank', label: 'CÔNG NỢ PHẢI TRẢ', value: money(f.CongNoConLai), hint: `${f.SoKhoanNoPhatSinh || 0} khoản phát sinh trong kỳ` },
          { icon: 'i-clock', label: 'CÔNG NỢ QUÁ HẠN', value: money(f.CongNoQuaHan), hint: 'Theo hạn thanh toán 30–45 ngày', tone: Number(f.CongNoQuaHan) ? 'attention' : '' },
          { icon: 'i-warning', label: 'CHÊNH LỆCH BÀN GIAO', value: money(f.ChenhLechPhieuThu), hint: 'Thực nộp − số tiền theo hệ thống', tone: Number(f.ChenhLechPhieuThu) ? 'attention' : '' }
        ], 'primary')}
        <div class="fly-dashboard-grid report-chart-trio">
          ${charts.card({ kicker: 'DOANH THU ĐÃ ĐỐI SOÁT', title: 'Doanh thu, giá vốn và lãi gộp', subtitle: 'Số liệu bán hàng sau hoàn tiền và đổi trả', badge: `Biên lãi ${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(grossMargin)}%`, className: 'executive', chart: charts.line({ labels: daily.map(row => fmtDate(row.Ngay)), series: [{ name: 'Doanh thu thuần', values: daily.map(row => row.DoanhThuThuan), color: '#2c8b66' }, { name: 'Giá vốn thuần', values: daily.map(row => row.GiaVonHangBanThuan), color: '#e1a536' }, { name: 'Lãi gộp', values: daily.map(row => row.LoiNhuanGop), color: '#5376c6' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có hóa đơn hoặc đổi trả hoàn thành.' }) })}
          ${charts.card({ kicker: 'DÒNG TIỀN CHỨNG TỪ', title: 'Phiếu thu và khoản đã chi', subtitle: 'Thực nộp theo ca so với thanh toán NCC thành công', badge: `${Number(f.SoPhieuThu || 0) + Number(f.SoPhieuChi || 0)} phiếu`, className: 'operations', chart: charts.columns({ labels: cashflowDaily.map(row => fmtDate(row.Ngay)), series: [{ name: 'Phiếu thu thực nộp', values: cashflowDaily.map(row => row.ThucNop), color: '#2c8b66' }, { name: 'Đã chi NCC', values: cashflowDaily.map(row => row.DaChi), color: '#e17a52' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có Phiếu thu hoặc khoản chi thành công.' }) })}
          ${charts.card({ kicker: 'TUỔI CÔNG NỢ', title: 'Cơ cấu công nợ phải trả', subtitle: 'Phân nhóm theo số ngày tới hạn hoặc quá hạn', badge: money(f.CongNoConLai), className: 'summary', chart: charts.donut({ items: debtAging.map((row, index) => ({ label: `${row.NhomHan} · ${row.SoKhoan} khoản`, value: row.GiaTri, color: charts.palette?.[index % charts.palette.length] })), centerLabel: 'Còn phải trả', centerValue: money(f.CongNoConLai), formatter: money, emptyText: 'Không có công nợ phải trả.' }) })}
        </div>
        <div class="report-bottom-grid">
          <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CÔNG NỢ NHÀ CUNG CẤP</p><h2>Các khoản cần theo dõi hạn</h2></div><span class="report-card-count">${payables.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÀ CUNG CẤP</th><th>HẠN</th><th>CÒN LẠI</th><th>TRẠNG THÁI</th></tr></thead><tbody>${payables.length ? payables.slice(0, 6).map(row => `<tr><td><strong>${esc(row.TenNCC)}</strong><small>${esc(row.MaCNPTra)} · HĐ ${esc(row.SoHoaDon)}</small></td><td>${fmtDate(row.HanThanhToan)}</td><td class="num"><strong>${money(row.SoTienConLai)}</strong></td><td><span class="status-pill ${debtClass(row.TrangThaiHienTai)}">${esc(row.TrangThaiHienTai)}</span></td></tr>`).join('') : '<tr><td colspan="4" class="warehouse-empty">Không có công nợ phải trả.</td></tr>'}</tbody></table></div></article>
          <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>ĐỐI CHIẾU BA CHỨNG TỪ</p><h2>Trạng thái hóa đơn mua hàng</h2></div><span class="report-card-count">${reconciliation.reduce((sum, row) => sum + Number(row.SoHoaDon || 0), 0)}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>TRẠNG THÁI</th><th>HÓA ĐƠN</th><th>TỔNG GIÁ TRỊ</th></tr></thead><tbody>${reconciliation.length ? reconciliation.map(row => `<tr><td><span class="status-pill ${matchClass(row.TrangThaiDoiChieu)}">${esc(row.TrangThaiDoiChieu)}</span></td><td class="num">${row.SoHoaDon}</td><td class="num"><strong>${money(row.TongCong)}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Kỳ này chưa có hóa đơn mua hàng.</td></tr>'}</tbody></table></div></article>
          <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Ưu tiên kế toán</h2></div></div>${alertList([
            { icon: 'i-report', tone: reconciliationPending ? 'warning' : 'ok', title: `${reconciliationPending} hóa đơn chưa đối chiếu khớp`, detail: `${reconciliationMatched.SoHoaDon || 0} hóa đơn đã khớp trong kỳ`, value: 'UC27' },
            { icon: 'i-bank', tone: Number(f.CongNoQuaHan) ? 'danger' : 'ok', title: `Công nợ quá hạn ${money(f.CongNoQuaHan)}`, detail: 'Thanh toán toàn bộ một lần sau phê duyệt', value: 'UC28' },
            { icon: 'i-cash', tone: Number(f.ChenhLechPhieuThu) ? 'warning' : 'ok', title: `Chênh lệch bàn giao ${money(f.ChenhLechPhieuThu)}`, detail: 'Ghi lý do trực tiếp trên Phiếu thu', value: 'UC29' },
            { icon: 'i-trend', tone: Number(s.DoanhThuThuan) ? 'ok' : '', title: `Lợi nhuận gộp ${money(s.LoiNhuanGop)}`, detail: `Biên lãi gộp ${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(grossMargin)}%`, value: 'Báo cáo' }
          ])}</article>
        </div>
        ${doiTraPanel(data.doiTra, { title: 'Hoàn tiền ảnh hưởng doanh thu thuần', subtitle: 'Tiền hoàn đã trừ khỏi doanh thu thuần. Hàng loại bỏ/vứt không hoàn giá vốn vào tồn; hàng nhập lại mới cộng tồn bán.', productTitle: 'Hàng trả làm giảm doanh thu' })}
        <details class="report-detail-disclosure accounting-detail"><summary>Xem công thức lãi gộp và dữ liệu đối soát chi tiết</summary>
          <div class="gross-profit-steps"><div class="step"><div><span>DOANH THU HÓA ĐƠN</span><strong>${money(s.DoanhThuHoaDon)}</strong></div><b>−</b><div><span>TIỀN HOÀN</span><strong>${money(s.TienHoan)}</strong></div><b>=</b><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div></div><div class="step"><div><span>GIÁ VỐN HÓA ĐƠN</span><strong>${money(s.GiaVonHoaDon)}</strong></div><b>−</b><div><span>GV HÀNG TRẢ NHẬP LẠI</span><strong>${money(s.GiaVonHangTraNhapLai)}</strong></div><b>+</b><div><span>GV HÀNG GIAO ĐỔI</span><strong>${money(s.GiaVonHangGiaoDoi)}</strong></div><b>=</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div></div><div class="step"><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div><b>−</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div><b>=</b><div class="result"><span>LỢI NHUẬN GỘP</span><strong>${money(s.LoiNhuanGop)}</strong></div></div></div>
          <div class="financial-report-sections"><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>MUA HÀNG &amp; THUẾ</p><h2>Chứng từ đầu vào</h2></div></div><div class="report-metric-list"><div><span>Đơn mua / Phiếu nhập</span><strong>${p.SoDonMua || 0} / ${p.SoPhieuNhap || 0}</strong></div><div><span>Tiền hàng / Thuế đầu vào</span><strong>${money(p.TienHangMua)} / ${money(p.ThueDauVao)}</strong></div></div></article><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>NHẬP – XUẤT – TỒN</p><h2>Biến động hàng hóa</h2></div></div><div class="report-metric-list"><div><span>Tồn đầu / cuối kỳ</span><strong>${Number(inv.SoLuongDauKy || 0).toLocaleString('vi-VN')} / ${Number(inv.SoLuongCuoiKy || 0).toLocaleString('vi-VN')}</strong></div><div><span>Nhập / xuất</span><strong>${Number(inv.SoLuongNhap || 0).toLocaleString('vi-VN')} / ${Number(inv.SoLuongXuat || 0).toLocaleString('vi-VN')}</strong></div></div></article><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>THU – CHI</p><h2>Tổng hợp chứng từ</h2></div></div><div class="report-metric-list"><div><span>Phiếu thu hệ thống / thực nộp</span><strong>${money(f.PhieuThuTheoHeThong)} / ${money(f.PhieuThuThucNop)}</strong></div><div><span>Phiếu chi / đã thanh toán</span><strong>${money(f.TongPhieuChi)} / ${money(f.DaThanhToanNCC)}</strong></div></div></article></div>
          <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CHI TIẾT BÁN HÀNG</p><h2>Doanh thu, giá vốn và lãi gộp theo ngày</h2></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY</th><th>HÓA ĐƠN</th><th>DOANH THU HĐ</th><th>TIỀN HOÀN</th><th>DOANH THU THUẦN</th><th>GIÁ VỐN THUẦN</th><th>LÃI GỘP</th></tr></thead><tbody>${daily.length ? daily.map(row => `<tr><td>${fmtDate(row.Ngay)}</td><td class="num">${row.SoHoaDon}</td><td class="num">${money(row.DoanhThuHoaDon)}</td><td class="num">${money(row.TienHoan)}</td><td class="num"><strong>${money(row.DoanhThuThuan)}</strong></td><td class="num">${money(row.GiaVonHangBanThuan)}</td><td class="num"><strong>${money(row.LoiNhuanGop)}</strong></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Kỳ này chưa có hóa đơn hoàn thành hoặc đổi trả hoàn thành.</td></tr>'}</tbody></table></div></article>
        </details>`;
      window.FLY_REPORT_LAYOUT?.enhance(root.querySelector('#financialReportBody'), { actor: 'Kế toán', analysisTitle: 'Xu hướng tài chính và chất lượng doanh thu', detailTitle: 'Công thức, chứng từ và số liệu theo ngày' });
      root.querySelector('#printFinancialReport').disabled = false;
      root.querySelector('#exportReportCsv').disabled = false;
    };
    const load = async () => {
      const button = root.querySelector('#loadFinancialReport');
      if (button) button.disabled = true;
      try {
        const { type, period } = selectedPeriod();
        currentReport = await api(context, `${endpoint}?periodType=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}${root.dataset.reportLock === '1' ? '&lockPeriod=1' : ''}`);
        window.FLY_REPORT_PERIOD?.syncFromReport(root, currentReport);
        root.dataset.reportLock = '1';
        render(currentReport);
      } catch (error) {
        context.showToast(error.message, 'error');
        const body = root.querySelector('#financialReportBody');
        if (body) body.innerHTML = `<div class="welcome-card"><h2>Không lập được báo cáo</h2><p>${esc(error.message)}</p></div>`;
      }
      finally { const button = root.querySelector('#loadFinancialReport'); if (button) button.disabled = false; }
    };
    root.querySelector('#reportPeriodType').addEventListener('change', syncPeriodFields);
    root.querySelector('#loadFinancialReport').addEventListener('click', load);
    root.querySelector('#printFinancialReport').addEventListener('click', () => {
      if (!currentReport) return;
      window.FLY_PRINT.show({
        variant: 'report',
        title: 'BÁO CÁO TÀI CHÍNH NỘI BỘ', number: currentReport.period.period,
        documentDate: new Date(), status: currentReport.period.label,
        fields: [{ label: 'Từ ngày', value: currentReport.period.from }, { label: 'Đến ngày', value: currentReport.period.to }],
        columns: [{ label: 'Ngày', key: 'Ngay', format: 'date' }, { label: 'Số HĐ', key: 'SoHoaDon', align: 'right' }, { label: 'Doanh thu thuần', key: 'DoanhThuThuan', format: 'money', align: 'right' }, { label: 'Giá vốn thuần', key: 'GiaVonHangBanThuan', format: 'money', align: 'right' }, { label: 'Lãi gộp', key: 'LoiNhuanGop', format: 'money', align: 'right' }],
        rows: currentReport.daily,
        chart: { title: 'Doanh thu, giá vốn và lãi gộp theo ngày', labelKey: 'Ngay', labelFormat: 'date', series: [{ name: 'Doanh thu thuần', key: 'DoanhThuThuan', color: '#267b5b' }, { name: 'Giá vốn thuần', key: 'GiaVonHangBanThuan', color: '#d89f32' }, { name: 'Lãi gộp', key: 'LoiNhuanGop', color: '#4f72bb' }] },
        totals: [{ label: 'Doanh thu thuần', value: currentReport.sales.DoanhThuThuan, format: 'money' }, { label: 'Giá vốn thuần', value: currentReport.sales.GiaVonHangBanThuan, format: 'money' }, { label: 'LỢI NHUẬN GỘP', value: currentReport.sales.LoiNhuanGop, format: 'money' }, { label: 'Công nợ còn lại', value: currentReport.finance.CongNoConLai, format: 'money' }],
        note: 'Lãi gộp = (doanh thu hóa đơn − tiền hoàn) − (giá vốn hóa đơn − giá vốn hàng trả nhập lại + giá vốn hàng giao đổi).',
        signatures: ['Kế toán lập báo cáo', 'Quản lý cửa hàng']
      });
    });
    root.querySelector('#exportReportCsv').addEventListener('click', () => {
      if (!currentReport) return;
      const rows = [['BÁO CÁO', currentReport.period.label], ['Chỉ tiêu', 'Giá trị'], ['Doanh thu hóa đơn', currentReport.sales.DoanhThuHoaDon], ['Tiền hoàn', currentReport.sales.TienHoan], ['Doanh thu thuần', currentReport.sales.DoanhThuThuan], ['Giá vốn hóa đơn', currentReport.sales.GiaVonHoaDon], ['Giá vốn hàng trả nhập lại', currentReport.sales.GiaVonHangTraNhapLai], ['Giá vốn hàng giao đổi', currentReport.sales.GiaVonHangGiaoDoi], ['Giá vốn thuần', currentReport.sales.GiaVonHangBanThuan], ['Lợi nhuận gộp', currentReport.sales.LoiNhuanGop], [], ['Ngày', 'Số hóa đơn', 'Doanh thu hóa đơn', 'Tiền hoàn', 'Doanh thu thuần', 'Giá vốn thuần', 'Lợi nhuận gộp'], ...currentReport.daily.map(row => [fmtDate(row.Ngay), row.SoHoaDon, row.DoanhThuHoaDon, row.TienHoan, row.DoanhThuThuan, row.GiaVonHangBanThuan, row.LoiNhuanGop]), ...returnCsvRows(currentReport.doiTra)];
      downloadCsv(`bao-cao-${currentReport.period.period}.csv`, rows);
    });
    await load();
  };

  const payrollAction = (item, canWrite) => {
    if (!canWrite) return '<span class="payroll-muted">Chỉ Kế toán thao tác</span>';
    if (item.TrangThai === 'Đã thanh toán') return item.MaGiaoDichNganHang || item.MaGiaoDich ? esc(item.MaGiaoDichNganHang || item.MaGiaoDich) : '<span class="status-pill ok">Đã chi</span>';
    if (item.TrangThaiPhieu === 'Chờ duyệt') return '<span class="payment-voucher-wait">Chờ Quản lý giao quỹ</span>';
    if (item.TrangThaiPhieu === 'Từ chối') return `<button class="warehouse-secondary" data-resubmit-payroll="${esc(item.MaPhieu)}" data-employee="${esc(item.MaNV)}">Sửa &amp; gửi lại</button>`;
    if (['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThaiPhieu)) {
      return `<button class="warehouse-primary" data-pay-payroll="${esc(item.MaPhieu)}" data-method="${esc(item.PhuongThucPhieu || '')}">${item.TrangThaiPhieu === 'Thanh toán thất bại' ? 'Thực hiện lại' : 'Chi lương'}</button>`;
    }
    if (item.TrangThai === 'Đã khóa') {
      return `<label class="payroll-method"><input type="radio" name="pay-${esc(item.MaNV)}" value="Tiền mặt"> TM</label>
        <label class="payroll-method"><input type="radio" name="pay-${esc(item.MaNV)}" value="Chuyển khoản" checked> CK</label>
        <button class="warehouse-secondary" data-create-payroll="${esc(item.MaNV)}">Lập phiếu</button>`;
    }
    return '<span class="payroll-muted">Khóa kỳ rồi mới lập phiếu</span>';
  };

  const payrollRowStatus = item => {
    if (item.TrangThai === 'Đã thanh toán' || item.TrangThaiPhieu === 'Thanh toán thành công') {
      return `<span class="status-pill ok">Đã thanh toán</span><small>Phiếu đã chi</small>`;
    }
    if (item.TrangThaiPhieu === 'Chờ duyệt') {
      return `<span class="status-pill sent">Phiếu chờ QL</span><small>Kỳ đã khóa · chờ giao quỹ</small>`;
    }
    if (item.TrangThaiPhieu === 'Từ chối') {
      return `<span class="status-pill cancelled">Phiếu bị từ chối</span><small>Sửa trên cùng phiếu</small>`;
    }
    if (item.TrangThaiPhieu === 'Thanh toán thất bại') {
      return `<span class="status-pill cancelled">Chi thất bại</span><small>Thực hiện lại cùng phiếu</small>`;
    }
    if (item.TrangThaiPhieu === 'Đã duyệt') {
      return `<span class="status-pill sent">QL đã giao quỹ</span><small>Kế toán chi lương</small>`;
    }
    if (item.TrangThai === 'Đã khóa') {
      return `<span class="status-pill draft">Kỳ đã khóa</span><small>Chưa lập phiếu chi</small>`;
    }
    return `<span class="status-pill draft">Bảng chờ khóa</span><small>Kỳ chưa khóa — chưa phải phiếu</small>`;
  };

  const payrollNextStep = (data, dueLabel) => {
    const status = data.period?.TrangThai || '';
    const items = data.items || [];
    const vouchers = data.vouchers || [];
    const warn = data.warning || {};
    if (!status) {
      return { title: 'Bước tiếp theo: lập bảng lương', text: 'Kế toán bấm “Lập / tính lại”. Quản lý không lập kỳ. Cần duyệt hết chấm công chờ và đủ lịch lễ năm.' };
    }
    if (status === 'Kế toán đã lập') {
      return { title: 'Bước tiếp theo: khóa kỳ lương', text: 'Kiểm tra giờ công và lương ngày lễ, rồi bấm “Khóa kỳ lương” (chỉ Kế toán). Sau khóa không tính lại.' };
    }
    if (status === 'Đã khóa') {
      const missing = items.filter(item => item.TrangThai === 'Đã khóa' && !item.MaPhieu).length;
      if (missing) {
        return { title: 'Bước tiếp theo: lập phiếu chi', text: `Kỳ đã khóa. Lập phiếu cho ${missing} nhân viên còn thiếu — mỗi người một kênh Tiền mặt hoặc Chuyển khoản, không tách hai kênh.` };
      }
      const waitingQl = vouchers.filter(item => item.TrangThai === 'Chờ duyệt').length;
      if (waitingQl) {
        return { title: 'Bước tiếp theo: chờ Quản lý giao quỹ', text: `${waitingQl} phiếu đang chờ duyệt. Kế toán chưa chi. Quản lý mở Trung tâm phê duyệt → Phiếu chi lương.` };
      }
      const waitingPay = vouchers.filter(item => ['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThai)).length;
      if (waitingPay) {
        return { title: 'Bước tiếp theo: Kế toán chi lương', text: `Quản lý đã giao quỹ. Chi ${waitingPay} phiếu. CK bắt buộc mã giao dịch. Thất bại thì làm lại trên cùng phiếu.` };
      }
    }
    if (status === 'Đã thanh toán') {
      return { title: 'Kỳ đã thanh toán', text: `Tất toán dự kiến ${dueLabel}. Không trừ lãi gộp, không BHXH.` };
    }
    if (warn.late) {
      return { title: 'Chi trễ sau mùng 10', text: `Hạn ${dueLabel}. Vẫn chi được; bắt buộc ghi lý do chi trễ.` };
    }
    if (warn.warn) {
      return { title: 'Sắp đến hạn tất toán mùng 10', text: `Hạn ${dueLabel}. Cảnh báo từ ngày 8. Lập phiếu → QL giao quỹ → Kế toán chi.` };
    }
    return { title: 'Bảng lương tháng', text: `Tất toán dự kiến ${dueLabel}.` };
  };

  const payrollDetailModal = async (context, month, maNV) => {
    try {
      const data = await api(context, `/accounting/payroll/${month}/${maNV}/details`);
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal" style="width:min(920px,96vw)"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHI TIẾT BẢNG LƯƠNG</p><h2>${esc(data.item.TenNV)}</h2><span>${esc(month)} · nghỉ lễ ${money(data.item.LuongNgayLe)} · tăng ca ${money(data.item.LuongTangCa)} · tổng ${money(data.item.TongLuong)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY</th><th>LOẠI NGÀY</th><th>LOẠI GIỜ</th><th>HỆ SỐ</th><th>PHÚT NGÀY</th><th>PHÚT ĐÊM</th><th>THÀNH TIỀN</th></tr></thead><tbody>${(data.lines || []).length ? data.lines.map(line => `<tr><td>${esc(line.NgayCong || '')}</td><td>${esc(line.LoaiNgay || '')}</td><td>${esc(line.LoaiGio || '')}</td><td class="num">${Number(line.HeSoApDung || line.HeSoBanDem || 0).toFixed(2)}</td><td class="num">${line.PhutNgay}</td><td class="num">${line.PhutDem}</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Không có dòng chi tiết.</td></tr>'}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button></div></div>`;
      document.body.appendChild(overlay);
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => overlay.remove()));
    } catch (error) {
      context.showToast(error.message, 'error');
    }
  };

  const payrollPayModal = async (context, maPhieu, method, onDone, warnLate) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal payment-result-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHI LƯƠNG</p><h2>${esc(maPhieu)}</h2><span>${esc(method)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="manager-readonly-note"><svg><use href="#i-cash"></use></svg><div><strong>Quản lý đã giao quỹ, bạn mới được chi</strong><span>${method === 'Tiền mặt' ? 'Đưa đủ tiền mặt đã nhận. Không bắt buộc mã giao dịch.' : 'Chuyển khoản từ tài khoản cửa hàng, bắt buộc mã giao dịch ngân hàng.'} Thất bại thì dùng lại cùng phiếu, không lập phiếu 2. Chỉ chi thành công mới chuyển bảng lương Đã thanh toán.</span></div></div>${warnLate ? '<p class="warehouse-modal-note"><strong>Cảnh báo tất toán:</strong> từ ngày 8 của tháng chi; sau mùng 10 vẫn chi được nhưng phải ghi lý do chi trễ.</p>' : ''}<div class="warehouse-form-grid payment-voucher-fields"><div class="warehouse-field"><label>Kết quả *</label><select id="payrollPayResult"><option value="success">Chi thành công</option><option value="failed">Chi thất bại</option></select></div><div class="warehouse-field bank-code-field"><label>Mã giao dịch ngân hàng *</label><input id="payrollBankCode" maxlength="50" placeholder="Bắt buộc khi chuyển khoản thành công"></div><div class="warehouse-field full late-reason-field" ${warnLate ? '' : 'hidden'}><label>Lý do chi trễ *</label><textarea id="payrollLateNote" maxlength="500" rows="2" placeholder="Bắt buộc nếu chi sau mùng 10"></textarea></div><div class="warehouse-field full"><label id="payrollPayNoteLabel">Ghi chú</label><textarea id="payrollPayNote" maxlength="500" rows="2"></textarea></div></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-primary submit-payroll-pay" type="button">Ghi nhận kết quả</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const resultSelect = overlay.querySelector('#payrollPayResult');
    const bankField = overlay.querySelector('.bank-code-field');
    const sync = () => {
      const failed = resultSelect.value === 'failed';
      bankField.hidden = method !== 'Chuyển khoản';
      overlay.querySelector('#payrollPayNoteLabel').textContent = failed ? 'Nguyên nhân thất bại *' : 'Ghi chú';
    };
    resultSelect.addEventListener('change', sync); sync();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('.submit-payroll-pay').addEventListener('click', async event => {
      const success = resultSelect.value === 'success';
      const bankCode = overlay.querySelector('#payrollBankCode').value.trim();
      const note = overlay.querySelector('#payrollPayNote').value.trim();
      const lateNote = overlay.querySelector('#payrollLateNote').value.trim();
      if (success && method === 'Chuyển khoản' && !bankCode) return context.showToast('Vui lòng nhập mã giao dịch ngân hàng.', 'error');
      if (!success && !note) return context.showToast('Chi thất bại phải ghi nguyên nhân.', 'error');
      event.currentTarget.disabled = true;
      try {
        const result = await api(context, `/accounting/payroll-vouchers/${maPhieu}/pay`, {
          method: 'POST', body: JSON.stringify({ ThanhCong: success, MaGiaoDichNganHang: bankCode, GhiChuThanhToan: note, GhiChuTreHan: lateNote })
        });
        context.showToast(result.message, success ? 'success' : 'error'); close(); await onDone();
      } catch (error) { context.showToast(error.message, 'error'); event.currentTarget.disabled = false; }
    });
  };

  const initPayroll = async (root, context) => {
    const canWrite = String(context.user?.TenVaiTro || '').trim() === 'Kế toán';
    let month = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    let loadSeq = 0;
    let latest = { items: [], warning: {}, period: null };

    const ensureShell = () => {
      if (root.dataset.payrollShell === '1') return;
      root.dataset.payrollShell = '1';
      root.innerHTML = `${heading('KẾ TOÁN / LƯƠNG', `Bảng lương ${payrollPeriodLabel(month)}`, 'Công đã duyệt · hệ số BLLĐ (150/200/300/330/390) · 8 giờ nghỉ lễ hưởng lương. Tất toán mùng 10 tháng sau. Không BHXH, không trừ lãi gộp.')}
        <p class="payroll-role-help">Kế toán lập và khóa bảng lương. Quản lý không lập kỳ — sau khi khóa, Kế toán lập phiếu chi rồi Quản lý duyệt và giao quỹ. Kế toán mới chi lương cho nhân viên.</p>
        <div id="payrollStepBanner"></div>
        <article class="warehouse-table-card"><div class="warehouse-toolbar">${payrollPeriodPicker(month)}<div class="warehouse-toolbar-actions" id="payrollToolbarActions"></div></div>
        <div id="payrollPeriodStatus"></div>
        <div class="warehouse-table-wrap"><table class="warehouse-table payroll-table"><thead><tr>
          <th>Nhân viên<small>Bấm hàng để xem hệ số</small></th>
          <th title="Giờ làm trong ca, ban ngày (không gồm 8 giờ nghỉ lễ)">Giờ ngày<small>Trong ca</small></th>
          <th title="Giờ làm 22h–6h, hệ số 130% ngày thường">Giờ đêm<small>22h–6h</small></th>
          <th title="Mỗi ngày lễ trong kỳ: 8 × lương giờ, kể cả không đi làm">Lương ngày lễ<small>8 giờ/ngày lễ</small></th>
          <th title="Giờ ngoài ca đã được Quản lý duyệt">Tăng ca<small>QL đã duyệt</small></th>
          <th>Tổng lương</th>
          <th title="Mỗi nhân viên / kỳ chỉ một kênh: tiền mặt hoặc chuyển khoản">Kênh / phiếu<small>TM hoặc CK</small></th>
          <th title="Trạng thái kỳ khác trạng thái phiếu chi từng người">Trạng thái<small>Kỳ vs phiếu</small></th>
          <th>Thao tác</th>
        </tr></thead><tbody id="payrollTableBody"><tr><td colspan="9" class="warehouse-empty">Đang tải bảng lương...</td></tr></tbody></table></div></article>`;
      const title = root.querySelector('.warehouse-heading h1');
      if (title) title.id = 'payrollPageTitle';
      root.querySelector('#payrollMonthInput').addEventListener('change', event => {
        const next = event.currentTarget.value;
        if (!/^\d{4}-\d{2}$/.test(next) || next === month) return;
        month = next;
        load();
      });
      root.addEventListener('click', async event => {
        const build = event.target.closest('#buildPayroll');
        if (build) {
          if (!canWrite) return context.showToast('Chỉ Kế toán được lập / tính lại bảng lương.', 'error');
          try { const result = await api(context, `/accounting/payroll/${month}/build`, { method: 'POST' }); context.showToast(result.message, 'success'); await load(); }
          catch (error) { context.showToast(error.message, 'error'); }
          return;
        }
        const lock = event.target.closest('#lockPayroll');
        if (lock) {
          if (!canWrite) return context.showToast('Chỉ Kế toán được khóa kỳ lương.', 'error');
          if (!window.confirm(`Khóa kỳ lương ${month}? Sau khi khóa không tính lại; lịch lễ các ngày trong kỳ bị khóa.`)) return;
          try { const result = await api(context, `/accounting/payroll/${month}/lock`, { method: 'POST' }); context.showToast(result.message, 'success'); await load(); }
          catch (error) { context.showToast(error.message, 'error'); }
          return;
        }
        const batch = event.target.closest('#batchPayrollVouchers');
        if (batch) {
          if (!canWrite) return context.showToast('Chỉ Kế toán được lập phiếu chi lương.', 'error');
          const pending = (latest.items || []).filter(item => item.TrangThai === 'Đã khóa' && !item.MaPhieu);
          if (!pending.length) return context.showToast('Không còn nhân viên khóa chưa có phiếu.', 'error');
          const method = window.prompt('Phương thức hàng loạt cho mọi người chưa có phiếu: nhập "Tiền mặt" hoặc "Chuyển khoản"', 'Chuyển khoản');
          if (!method || !['Tiền mặt', 'Chuyển khoản'].includes(method.trim())) return;
          try {
            const result = await api(context, `/accounting/payroll/${month}/payment-vouchers`, {
              method: 'POST', body: JSON.stringify({ items: pending.map(item => ({ MaNV: item.MaNV, PhuongThuc: method.trim() })) })
            });
            context.showToast(result.message, 'success'); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
          return;
        }
        const create = event.target.closest('[data-create-payroll]');
        if (create) {
          const method = root.querySelector(`input[name="pay-${create.dataset.createPayroll}"]:checked`)?.value;
          if (!method) return context.showToast('Chọn Tiền mặt hoặc Chuyển khoản. Không tách hai kênh.', 'error');
          try {
            const result = await api(context, `/accounting/payroll/${month}/payment-vouchers`, {
              method: 'POST', body: JSON.stringify({ items: [{ MaNV: create.dataset.createPayroll, PhuongThuc: method }] })
            });
            context.showToast(result.message, 'success'); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
          return;
        }
        const resubmit = event.target.closest('[data-resubmit-payroll]');
        if (resubmit) {
          const method = window.prompt('Phương thức gửi lại (Tiền mặt hoặc Chuyển khoản):', 'Chuyển khoản');
          if (!method || !['Tiền mặt', 'Chuyển khoản'].includes(method.trim())) return;
          try {
            const result = await api(context, `/accounting/payroll-vouchers/${resubmit.dataset.resubmitPayroll}/resubmit`, {
              method: 'POST', body: JSON.stringify({ PhuongThuc: method.trim() })
            });
            context.showToast(result.message, 'success'); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
          return;
        }
        const pay = event.target.closest('[data-pay-payroll]');
        if (pay) {
          const warn = latest.warning || {};
          return payrollPayModal(context, pay.dataset.payPayroll, pay.dataset.method, load, Boolean(warn.late || warn.warn));
        }
        if (event.target.closest('button, input, label, select, textarea, a')) return;
        const row = event.target.closest('tr[data-employee]');
        const detail = event.target.closest('[data-payroll-detail]');
        const maNV = detail?.dataset.payrollDetail || row?.dataset.employee;
        if (maNV) payrollDetailModal(context, month, maNV);
      });
    };

    const load = async () => {
      const seq = ++loadSeq;
      try {
        ensureShell();
        const title = root.querySelector('#payrollPageTitle');
        if (title) title.textContent = `Bảng lương ${payrollPeriodLabel(month)}`;
        const monthInput = root.querySelector('#payrollMonthInput');
        if (monthInput && monthInput.value !== month) monthInput.value = month;
        const data = await api(context, `/accounting/payroll/${month}`);
        if (seq !== loadSeq) return;
        latest = data;
        const due = data.summary?.NgayTraDuKien || data.period?.NgayTraDuKien;
        const dueLabel = payrollDayLabel(due);
        const write = canWrite && data.canWrite !== false;
        const step = payrollNextStep(data, dueLabel);
        const warn = data.warning || {};
        root.querySelector('#payrollStepBanner').innerHTML = `<div class="approval-center-note payroll-next-step"><strong>${esc(step.title)}</strong><span>${esc(step.text)}${warn.late ? ` Chi sau ${dueLabel} phải ghi lý do trễ.` : warn.warn ? ` Cảnh báo từ ngày 8.` : ''}</span></div>`;
        const actions = root.querySelector('#payrollToolbarActions');
        if (!write) {
          actions.innerHTML = '<span class="payroll-muted">Chỉ Kế toán được lập / khóa kỳ. Quản lý duyệt công và giao quỹ trên phiếu chi lương.</span>';
        } else {
          const periodStatus = data.period?.TrangThai || '';
          const canBuild = periodStatus !== 'Đã khóa' && periodStatus !== 'Đã thanh toán';
          const canLock = periodStatus === 'Kế toán đã lập';
          const canVoucher = periodStatus === 'Đã khóa';
          actions.innerHTML = `<button class="warehouse-secondary" id="buildPayroll" ${canBuild ? '' : 'disabled'} title="Chỉ kế toán">Lập / tính lại · chỉ kế toán</button>
            <button class="warehouse-primary" id="lockPayroll" ${canLock ? '' : 'disabled'} title="Chỉ kế toán">Khóa kỳ lương · chỉ kế toán</button>
            <button class="warehouse-primary" id="batchPayrollVouchers" ${canVoucher ? '' : 'disabled'} title="Chỉ kế toán">Lập phiếu chi hàng loạt</button>`;
        }
        const periodStatus = data.period?.TrangThai || 'Chưa lập';
        root.querySelector('#payrollPeriodStatus').innerHTML = `<div class="warehouse-panel-title"><div><p>TRẠNG THÁI KỲ (cả bảng)</p><h2>${esc(periodStatus)}</h2><small>Ngày tất toán dự kiến: ${dueLabel} (mùng 10 tháng sau) · ${data.summary?.SoNgayLe || 0} ngày lễ · lương lễ ${money(data.summary?.TongLuongNgayLe)}</small></div><span class="status-pill ${periodStatus === 'Đã thanh toán' ? 'ok' : 'sent'}">${data.items.length} nhân viên</span></div>`;
        const body = root.querySelector('#payrollTableBody');
        body.innerHTML = data.items.length
          ? data.items.map(item => `<tr data-employee="${esc(item.MaNV)}"><td><button class="warehouse-link" data-payroll-detail="${esc(item.MaNV)}"><strong>${esc(item.TenNV)}</strong></button><small>${esc(item.MaNV)}</small></td><td class="num">${(item.PhutNgay / 60).toFixed(2)}</td><td class="num">${(item.PhutDem / 60).toFixed(2)}</td><td class="num">${money(item.LuongNgayLe)}</td><td class="num">${money(item.LuongTangCa)}</td><td class="num"><strong>${money(item.TongLuong)}</strong></td><td>${item.MaPhieu ? `<strong>${esc(item.MaPhieu)}</strong><small>${esc(item.PhuongThucPhieu || item.PhuongThucChi || '')}</small>` : 'Chưa lập phiếu'}</td><td>${payrollRowStatus(item)}</td><td>${payrollAction(item, write)}</td></tr>`).join('')
          : '<tr><td colspan="9" class="warehouse-empty">Chưa có bảng lương. Duyệt hết công chờ, khai báo đủ Tết âm / Giỗ Tổ, rồi chọn “Lập / tính lại”.</td></tr>';
      } catch (error) {
        if (seq !== loadSeq) return;
        try { ensureShell(); } catch { /* ignore */ }
        const banner = root.querySelector('#payrollStepBanner');
        const message = error.message || 'Không thể tải bảng lương.';
        const denied = /quyền/i.test(message);
        if (banner) {
          banner.innerHTML = `<div class="approval-center-note"><strong>${denied ? 'Không đủ quyền' : 'Không tải được kỳ này'}</strong><span>${esc(message)} Chỉ Kế toán lập và khóa kỳ. Quản lý duyệt công và giao quỹ.</span></div>`;
          const body = root.querySelector('#payrollTableBody');
          if (body) body.innerHTML = `<tr><td colspan="9" class="warehouse-empty">${esc(message)}</td></tr>`;
        } else {
          root.innerHTML = `<div class="welcome-card"><h2>${denied ? 'Không đủ quyền xem bảng lương' : 'Không thể tải bảng lương'}</h2><p>${esc(message)}</p><p>Chỉ Kế toán (UC33) lập và khóa kỳ. Quản lý duyệt công và duyệt phiếu chi/giao quỹ.</p></div>`;
        }
      }
    };
    await load();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'accounting-invoices') return initInvoices(document.querySelector('.warehouse-page'), context);
      if (pageName === 'accounting-payables') return initPayables(document.querySelector('.warehouse-page'), context);
      if (pageName === 'accounting-settlements') return initSettlements(document.querySelector('.accounting-settlements'), context);
      if (pageName === 'accounting-reports') return initFinancialReports(document.querySelector('.financial-reports'), context);
      if (pageName === 'accounting-payroll') return initPayroll(document.querySelector('.accounting-payroll'), context);
      if (pageName === 'manager-payables') return initManagerPayables(document.querySelector('.warehouse-page'), context);
      if (pageName === 'manager-reports') return initStoreOperationsReports(document.querySelector('.financial-reports'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
