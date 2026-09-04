(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'accounting-invoices': '<section class="warehouse-page"><div class="overview-loading">Đang tải hồ sơ hóa đơn...</div></section>',
    'accounting-payables': '<section class="warehouse-page"><div class="overview-loading">Đang tải công nợ phải trả...</div></section>',
    'accounting-settlements': '<section class="warehouse-page accounting-settlements"><div class="overview-loading">Đang tải ca chờ đối soát...</div></section>',
    'accounting-reports': '<section class="warehouse-page financial-reports report-accounting"><div class="overview-loading">Đang mở bộ lọc báo cáo...</div></section>',
    'accounting-payroll': '<section class="warehouse-page accounting-payroll"><div class="overview-loading">Đang tải bảng lương...</div></section>',
    'accounting-history': '<section class="warehouse-page accounting-history"><div class="overview-loading">Đang tải lịch sử kế toán...</div></section>',
    'manager-payables': '<section class="warehouse-page"><div class="overview-loading">Đang tổng hợp công nợ toàn hệ thống...</div></section>',
    'manager-reports': '<section class="warehouse-page financial-reports report-manager"><div class="overview-loading">Đang mở bộ lọc báo cáo...</div></section>'
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
    const fateHtml = text => {
      if (!text || text === '—') return '<span class="fate-badge pending">Chưa xử lý</span>';
      const parts = [];
      if (/nhập lại/i.test(text)) parts.push(`<span class="fate-badge restock">${esc(text.match(/nhập lại[^·]*/i)?.[0]?.trim() || 'Nhập lại kho')}</span>`);
      if (/loại bỏ|vứt/i.test(text)) parts.push(`<span class="fate-badge scrap">${esc(text.match(/loại bỏ[^·]*/i)?.[0]?.trim() || 'Loại bỏ / vứt')}</span>`);
      if (/chưa xử lý/i.test(text)) parts.push(`<span class="fate-badge pending">${esc(text.match(/chưa xử lý[^·]*/i)?.[0]?.trim() || 'Chưa xử lý')}</span>`);
      return parts.length ? parts.join(' ') : esc(text);
    };
    const ticketRows = tickets.length
      ? tickets.map(row => {
        const typeBadge = /hoàn tiền/i.test(row.HinhThucXuLy) ? '<span class="return-type-badge refund">Hoàn tiền</span>' : '<span class="return-type-badge exchange">Đổi hàng</span>';
        return `<tr class="report-flow-row ${row.TrangThai === 'Đã duyệt' ? 'cashier-return-ready' : ''}" data-return-id="${esc(row.MaDT)}" tabindex="0" role="button" aria-label="Xem lịch sử phiếu ${esc(row.MaDT)}"><td><strong>${esc(row.MaDT)}</strong><small>${esc(row.MaHD)} · ${esc(row.TenKH || 'Khách vãng lai')}</small></td><td>${typeBadge}<small>${esc(row.TrangThai)}</small></td><td class="report-return-reason">${esc(row.LyDo || '—')}</td><td class="num">${money(row.SoTienHoan)}</td><td class="report-return-duty"><span class="status-pill ${stepClass(row.BuocCanXuLy)}">${esc(row.BuocCanXuLy)}</span><small class="report-return-fate">${fateHtml(hangDiDauText(row))}</small><div class="report-return-people"><span>Lập <b>${esc(row.NguoiLap || '—')}</b></span><span>Kho <b>${esc(row.NguoiKiemTra || '—')}</b></span><span>Duyệt <b>${esc(row.NguoiDuyet || '—')}</b></span></div></td></tr>`;
      }).join('')
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

  const docChip = (kind, id, label) => id
    ? `<button type="button" class="warehouse-link doc-chip" data-open-doc="${esc(kind)}" data-open-id="${esc(id)}">${esc(label)}</button>`
    : '<span>—</span>';
  const wireDocLinks = (root, context, onDone) => {
    root.addEventListener('click', event => {
      const chip = event.target.closest('[data-open-doc]');
      if (!chip || !root.contains(chip)) return;
      event.preventDefault();
      event.stopPropagation();
      openAccountingDoc(context, chip.dataset.openDoc, chip.dataset.openId, onDone);
    });
  };
  const printInvoiceRecord = (invoice, lines) => window.FLY_PRINT.show({
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
    ], rows: lines, totals: [
      { label: 'Tổng tiền hàng', value: invoice.TongTienHang, format: 'money' },
      { label: 'Tiền thuế', value: invoice.TienThue, format: 'money' }, { label: 'TỔNG CỘNG', value: invoice.TongCong, format: 'money' }
    ], note: 'Đây là phiếu ghi nhận hóa đơn do Nhà cung cấp giao, không thay thế hóa đơn điện tử hoặc hóa đơn GTGT gốc.',
    signatures: ['Người giao hóa đơn', 'Kế toán tiếp nhận']
  });
  const printReconciliationPreview = (invoice, preview) => window.FLY_PRINT.show({
    title: 'BIÊN BẢN ĐỐI CHIẾU BA CHỨNG TỪ', number: invoice.MaHDMH,
    documentDate: new Date(), status: preview.result,
    fields: [
      { label: 'Đơn mua', value: preview.purchaseOrder.MaPO }, { label: 'Phiếu nhập', value: preview.receipt.MaPN },
      { label: 'Số hóa đơn Nhà cung cấp', value: preview.invoice.SoHoaDon }, { label: 'Nhà cung cấp', value: preview.invoice.TenNCC }
    ],
    columns: [
      { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
      { label: 'SL đặt', key: 'SoLuongDat', align: 'right' }, { label: 'SL thực nhận', key: 'SoLuongThucNhan', align: 'right' },
      { label: 'SL hóa đơn', key: 'SoLuongHoaDon', align: 'right' }, { label: 'Giá Đơn mua', key: 'DonGiaDonMua', format: 'money', align: 'right' },
      { label: 'Giá Phiếu nhập', key: 'DonGiaPhieuNhap', format: 'money', align: 'right' },
      { label: 'Giá hóa đơn', key: 'DonGiaHoaDon', format: 'money', align: 'right' },
      { label: 'Thuế suất', key: 'ThueSuat', format: 'percent', align: 'right' },
      { label: 'Tiền thuế', key: 'TienThueHoaDon', format: 'money', align: 'right' }, { label: 'Kết quả', key: 'KetQua' }
    ], rows: preview.rows,
    totals: [
      { label: 'Tiền hàng Phiếu nhập', value: preview.totals.PhieuNhapTruocThue, format: 'money' },
      { label: 'Tiền hàng hóa đơn', value: preview.totals.HoaDonTienHang, format: 'money' },
      { label: 'Tiền thuế hóa đơn', value: preview.totals.HoaDonTienThue, format: 'money' },
      { label: 'Tổng cộng hóa đơn', value: preview.totals.HoaDonTongCong, format: 'money' }
    ],
    note: preview.differences.length ? preview.differences.join('; ') : 'Sản phẩm, số lượng, đơn giá, thuế và tổng tiền đều khớp theo quy tắc đối chiếu.',
    signatures: ['Nhân viên mua hàng', 'Thủ kho', 'Kế toán đối chiếu']
  });

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
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HÓA ĐƠN NHÀ CUNG CẤP</p><h2>${esc(invoice.SoHoaDon)}</h2><span>${esc(invoice.MaHDMH)}</span></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(invoice.TenNCC)}</strong></div><div><span>ĐƠN MUA</span><strong>${docChip('po', invoice.MaPO, invoice.MaPO || '—')}</strong></div><div><span>PHIẾU NHẬP</span><strong>${docChip('pn', invoice.MaPN, invoice.MaPN || 'Chưa có')}</strong></div><div><span>KẾT QUẢ ĐỐI CHIẾU</span><strong><span class="status-pill ${matchClass(invoice.TrangThaiDoiChieu)}">${esc(invoice.TrangThaiDoiChieu)}</span></strong></div><div><span>TỔNG CỘNG</span><strong>${money(invoice.TongCong)}</strong></div><div><span>CÔNG NỢ</span><strong>${docChip('cn', invoice.MaCNPTra, invoice.MaCNPTra || 'Chưa phát sinh')}</strong></div></div>${statusNote}<div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THUẾ SUẤT</th><th>TIỀN THUẾ</th><th>TIỀN HÀNG</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng</button>${invoice.MaPN ? '<button type="button" class="warehouse-secondary print-invoice-match">In đối chiếu</button>' : ''}<button class="warehouse-primary print-invoice-record"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      wireDocLinks(overlay, context);
      overlay.querySelector('.print-invoice-record').addEventListener('click', () => printInvoiceRecord(invoice, data.lines));
      overlay.querySelector('.print-invoice-match')?.addEventListener('click', async () => {
        try {
          const preview = await api(context, `/accounting/purchase-invoices/${invoice.MaHDMH}/reconciliation-preview?MaPN=${encodeURIComponent(invoice.MaPN)}`);
          printReconciliationPreview(invoice, preview);
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const purchaseOrderFileDetail = async (context, id) => {
    try {
      const data = await api(context, `/accounting/purchase-order-files/${id}`);
      const file = data.file;
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const rows = (data.lines || []).map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num"><strong>${money(line.ThanhTien)}</strong></td></tr>`).join('');
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐƠN MUA HÀNG</p><h2>${esc(file.MaPO)}</h2></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(file.TenNCC)}</strong></div><div><span>TRẠNG THÁI</span><strong>${esc(file.TrangThai)}</strong></div><div><span>NGÀY LẬP</span><strong>${fmtDate(file.NgayLap)}</strong></div><div><span>NGÀY GIAO DỰ KIẾN</span><strong>${fmtDate(file.NgayGiaoDuKien)}</strong></div><div><span>THANH TOÁN</span><strong>${file.SoNgayThanhToan} ngày</strong></div><div><span>TỔNG TIỀN</span><strong>${money(file.TongTien)}</strong></div></div><p><strong>Điều khoản:</strong> ${esc(file.DieuKhoanThanhToan || '—')}</p><div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="warehouse-empty">Không có dòng hàng.</td></tr>'}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-primary print-po-file" type="button"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.querySelector('.print-po-file').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'ĐƠN MUA HÀNG', number: file.MaPO, documentDate: file.NgayLap, status: file.TrangThai,
        fields: [
          { label: 'Nhà cung cấp', value: file.TenNCC }, { label: 'Điều khoản thanh toán', value: file.DieuKhoanThanhToan },
          { label: 'Ngày giao dự kiến', value: file.NgayGiaoDuKien, format: 'date' }, { label: 'Thời hạn thanh toán', value: `${file.SoNgayThanhToan} ngày` }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' }, { label: 'ĐVT', key: 'DonViTinh' },
          { label: 'Số lượng', key: 'SoLuong', align: 'right' }, { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
          { label: 'Thành tiền', key: 'ThanhTien', format: 'money', align: 'right' }
        ], rows: data.lines, totals: [{ label: 'TỔNG GIÁ TRỊ ĐƠN MUA', value: file.TongTien, format: 'money' }],
        signatures: ['Nhân viên mua hàng', 'Quản lý cửa hàng', 'Kế toán theo dõi']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const receiptFileDetail = async (context, id) => {
    try {
      const data = await api(context, `/accounting/receipt-files/${id}`);
      const file = data.file;
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const rows = (data.lines || []).map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuongDat}</td><td class="num"><strong>${line.SoLuongChapNhan}</strong></td><td class="num">${money(line.DonGiaNhap)}</td><td class="num">${money(line.ThanhTienPhieuNhap)}</td></tr>`).join('');
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHIẾU NHẬP KHO</p><h2>${esc(file.MaPN)}</h2></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(file.TenNCC)}</strong></div><div><span>ĐƠN MUA</span><strong>${docChip('po', file.MaPO, file.MaPO)}</strong></div><div><span>NGÀY XÁC NHẬN</span><strong>${fmtDate(file.NgayXacNhan)}</strong></div><div><span>GIÁ TRỊ NHẬP</span><strong>${money(file.TongTien)}</strong></div></div><div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SL ĐẶT</th><th>SL NHẬP</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="warehouse-empty">Không có dòng hàng.</td></tr>'}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-primary print-pn-file" type="button"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      wireDocLinks(overlay, context);
      overlay.querySelector('.print-pn-file').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'PHIẾU NHẬP KHO', number: file.MaPN, documentDate: file.NgayXacNhan, status: 'Đã xác nhận',
        fields: [
          { label: 'Đơn mua', value: file.MaPO }, { label: 'Nhà cung cấp', value: file.TenNCC },
          { label: 'Ngày xác nhận', value: file.NgayXacNhan, format: 'date' }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' }, { label: 'ĐVT', key: 'DonViTinh' },
          { label: 'SL đặt', key: 'SoLuongDat', align: 'right' }, { label: 'SL nhập', key: 'SoLuongChapNhan', align: 'right' },
          { label: 'Đơn giá', key: 'DonGiaNhap', format: 'money', align: 'right' },
          { label: 'Thành tiền', key: 'ThanhTienPhieuNhap', format: 'money', align: 'right' }
        ], rows: data.lines, totals: [{ label: 'Tổng giá trị nhập', value: file.TongTien, format: 'money' }],
        signatures: ['Thủ kho kiểm nhận', 'Kế toán']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const printPayableDossier = (debt, lines) => window.FLY_PRINT.show({
    title: debt.MaPhieu ? 'PHIẾU CHI NHÀ CUNG CẤP' : 'BẢNG CHI TIẾT CÔNG NỢ NHÀ CUNG CẤP',
    number: debt.MaPhieu || debt.MaCNPTra,
    documentDate: debt.NgayChungTu || debt.NgayPhatSinh || new Date(),
    status: debt.TrangThaiPhieuChi || debt.TrangThaiCongNo,
    fields: [
      { label: 'Công nợ', value: debt.MaCNPTra }, { label: 'Nhà cung cấp', value: debt.TenNCC },
      { label: 'Hóa đơn', value: debt.SoHoaDon }, { label: 'Đơn mua', value: debt.MaPO },
      { label: 'Phiếu nhập', value: debt.MaPN || '—' }, { label: 'Hạn thanh toán', value: debt.HanThanhToan, format: 'date' },
      { label: 'Phương thức', value: debt.PhuongThuc || '—' }, { label: 'Mã giao dịch', value: debt.MaGiaoDichNganHang || '—' }
    ],
    columns: [
      { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
      { label: 'ĐVT', key: 'DonViTinh' }, { label: 'Số lượng', key: 'SoLuong', align: 'right' },
      { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
      { label: 'Thuế suất', key: 'ThueSuat', format: 'percent', align: 'right' },
      { label: 'Tiền hàng', key: 'ThanhTien', format: 'money', align: 'right' }
    ], rows: lines,
    totals: [
      { label: 'Giá trị ghi nhận', value: debt.SoTienNo, format: 'money' },
      { label: 'Đã thanh toán', value: debt.SoTienDaTra, format: 'money' },
      { label: 'CÒN PHẢI TRẢ', value: debt.SoTienConLai, format: 'money' }
    ],
    note: debt.NoiDung || debt.GhiChu || 'Hồ sơ công nợ và phiếu chi theo đối chiếu Đơn mua – Phiếu nhập – Hóa đơn.',
    signatures: ['Kế toán', 'Quản lý cửa hàng']
  });

  const payableDetail = async (context, id, onDone = async () => {}) => {
    try {
      const data = await api(context, `/accounting/payables/${id}`);
      const debt = data.payable;
      const rows = data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${line.ThueSuat}%</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const fundNote = debt.MaPhieu
        ? `<div class="manager-readonly-note"><svg><use href="#i-cash"/></svg><div><strong>Phiếu chi ${esc(debt.MaPhieu)} · ${esc(debt.BuocTatToan || debt.TrangThaiPhieuChi)}</strong><span>${debt.HinhThucCapQuy ? `Quản lý đã giao: ${esc(debt.HinhThucCapQuy)}${debt.NguoiDuyet ? ` · ${esc(debt.NguoiDuyet)}` : ''}${debt.NgayCapQuy ? ` · ${fmtDateTime(debt.NgayCapQuy)}` : ''}.` : 'Chưa giao tiền. Duyệt Phiếu chi đồng thời là bước giao quỹ cho Kế toán.'}${debt.MaGiaoDichNganHang ? ` Mã giao dịch ${esc(debt.MaGiaoDichNganHang)}.` : ''}${debt.GhiChuCapQuy ? ` ${esc(debt.GhiChuCapQuy)}` : ''}</span></div></div>`
        : '<div class="manager-readonly-note"><svg><use href="#i-report"/></svg><div><strong>Kế toán chưa lập Phiếu chi</strong><span>Công nợ chỉ giảm sau khi Quản lý giao tiền và bạn thanh toán thành công cho Nhà cung cấp.</span></div></div>';
      const timeline = [
        debt.NgayHoaDon && { label: 'Hóa đơn Nhà cung cấp', at: debt.NgayHoaDon },
        debt.NgayPhatSinh && { label: 'Ghi nhận công nợ', at: debt.NgayPhatSinh },
        debt.NgayChungTu && { label: `Lập phiếu chi ${debt.MaPhieu || ''}`.trim(), at: debt.NgayChungTu },
        debt.NgayDuyet && { label: 'Quản lý duyệt / giao tiền', at: debt.NgayDuyet },
        debt.NgayCapQuy && { label: 'Giao quỹ', at: debt.NgayCapQuy }
      ].filter(Boolean);
      const timelineHtml = timeline.length
        ? `<ul class="acc-dossier-timeline">${timeline.map(step => `<li><strong>${esc(step.label)}</strong><small>${fmtDateTime(step.at)}</small></li>`).join('')}</ul>`
        : '';
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal manager-payable-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">KẾ TOÁN / HỒ SƠ CÔNG NỢ</p><h2>${esc(debt.MaCNPTra)}</h2><span>${esc(debt.TenNCC)}</span></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body">${settlementFlow(debt.BuocTatToan)}${fundNote}<div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(debt.TenNCC)}</strong><small>${esc(debt.MaNCC)}</small></div><div><span>HÓA ĐƠN</span><strong>${docChip('invoice', debt.MaHDMH, `HĐ ${debt.SoHoaDon}`)}</strong></div><div><span>ĐƠN MUA</span><strong>${docChip('po', debt.MaPO, debt.MaPO)}</strong></div><div><span>PHIẾU NHẬP</span><strong>${docChip('pn', debt.MaPN, debt.MaPN || '—')}</strong></div><div><span>NGÀY PHÁT SINH</span><strong>${fmtDate(debt.NgayPhatSinh)}</strong></div><div><span>HẠN THANH TOÁN</span><strong>${fmtDate(debt.HanThanhToan)}</strong></div><div><span>PHIẾU CHI</span><strong>${debt.MaPhieu ? esc(debt.MaPhieu) : 'Chưa lập'}</strong><small>${esc(debt.PhuongThuc || '')}${debt.MaGiaoDichNganHang ? ` · ${esc(debt.MaGiaoDichNganHang)}` : ''}</small></div><div><span>TRẠNG THÁI PHIẾU</span><strong><i class="status-pill ${voucherClass(debt.TrangThaiPhieuChi || '')}">${esc(debt.TrangThaiPhieuChi || 'Chưa lập Phiếu chi')}</i></strong></div></div><div class="manager-debt-amounts"><div><span>GIÁ TRỊ GHI NHẬN</span><strong>${money(debt.SoTienNo)}</strong></div><div><span>ĐÃ THANH TOÁN</span><strong>${money(debt.SoTienDaTra)}</strong></div><div><span>CÒN PHẢI TRẢ</span><strong>${money(debt.SoTienConLai)}</strong></div><div><span>TIẾN ĐỘ</span><strong><i class="status-pill ${debtClass(debt.TrangThaiCongNo)}">${esc(debt.BuocTatToan || debt.TrangThaiCongNo)}</i></strong></div></div>${timelineHtml}<div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THUẾ SUẤT</th><th>TIỀN HÀNG</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng</button><button class="warehouse-primary print-payable-detail"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      wireDocLinks(overlay, context, onDone);
      overlay.querySelector('.print-payable-detail').addEventListener('click', () => printPayableDossier(debt, data.lines));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const payrollVoucherDetail = async (context, id) => {
    try {
      const data = await api(context, `/accounting/payroll-vouchers/${id}`);
      const voucher = data.voucher;
      const fund = data.fund?.fund || {};
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal payment-voucher-approval-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHIẾU CHI LƯƠNG</p><h2>${esc(voucher.MaPhieu)}</h2><span>${esc(voucher.TenNV || '')} · kỳ ${esc(voucher.MaKy)} · ${money(voucher.SoTien)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="payment-voucher-source"><div><span>NHÂN VIÊN</span><strong>${esc(voucher.TenNV || voucher.MaNV)}</strong></div><div><span>KỲ LƯƠNG</span><strong>${docChip('payroll', voucher.MaKy, voucher.MaKy)}</strong></div><div><span>KÊNH CHI</span><strong>${esc(voucher.PhuongThuc)}</strong></div><div><span>TRẠNG THÁI</span><strong><i class="status-pill ${voucherClass(voucher.TrangThai)}">${esc(voucher.TrangThai)}</i></strong></div><div><span>NGƯỜI LẬP</span><strong>${esc(voucher.NguoiLap || '—')}</strong><small>${fmtDateTime(voucher.NgayLap)}</small></div><div><span>DUYỆT / GIAO QUỸ</span><strong>${esc(voucher.NguoiDuyet || '—')}</strong><small>${voucher.NgayDuyet ? fmtDateTime(voucher.NgayDuyet) : 'Chưa duyệt'}</small></div><div><span>MÃ GIAO DỊCH</span><strong>${esc(voucher.MaGiaoDichNganHang || '—')}</strong></div><div><span>QUỸ CÒN</span><strong>TM ${money(fund.SoTienMatCon)} · CK ${money(fund.SoTienCKCon)}</strong></div></div>${voucher.NoiDung ? `<p>${esc(voucher.NoiDung)}</p>` : ''}${voucher.GhiChu || voucher.GhiChuTreHan ? `<p class="warehouse-modal-note">${esc(voucher.GhiChu || '')}${voucher.GhiChuTreHan ? ` ${esc(voucher.GhiChuTreHan)}` : ''}</p>` : ''}</div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-secondary open-payroll-lines" type="button">Chi tiết bảng lương</button><button class="warehouse-primary print-payroll-voucher" type="button"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      wireDocLinks(overlay, context);
      overlay.querySelector('.open-payroll-lines')?.addEventListener('click', () => payrollDetailModal(context, voucher.MaKy, voucher.MaNV));
      overlay.querySelector('.print-payroll-voucher').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'PHIẾU CHI LƯƠNG', number: voucher.MaPhieu,
        documentDate: voucher.NgayThanhToan || voucher.NgayLap, status: voucher.TrangThai,
        fields: [
          { label: 'Nhân viên', value: voucher.TenNV || voucher.MaNV }, { label: 'Kỳ lương', value: voucher.MaKy },
          { label: 'Kênh chi', value: voucher.PhuongThuc }, { label: 'Mã giao dịch', value: voucher.MaGiaoDichNganHang || '—' },
          { label: 'Người lập', value: voucher.NguoiLap }, { label: 'Người duyệt', value: voucher.NguoiDuyet || '—' }
        ],
        columns: [
          { label: 'Chỉ tiêu', key: 'label' }, { label: 'Giá trị', key: 'value' }
        ],
        rows: [
          { label: 'Số tiền chi', value: money(voucher.SoTien) },
          { label: 'Quỹ TM còn', value: money(fund.SoTienMatCon) },
          { label: 'Quỹ CK còn', value: money(fund.SoTienCKCon) }
        ],
        totals: [{ label: 'SỐ TIỀN CHI', value: voucher.SoTien, format: 'money' }],
        note: voucher.NoiDung || 'Chi từ quỹ lương chung đã được Quản lý giao.',
        signatures: ['Kế toán chi', 'Người nhận']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const payrollPeriodDetail = async (context, month) => {
    try {
      const data = await api(context, `/accounting/payroll/${month}`);
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const rows = (data.items || []).map(item => `<tr><td><button type="button" class="warehouse-link" data-payroll-nv="${esc(item.MaNV)}">${esc(item.TenNV)}</button><small>${esc(item.MaNV)}</small></td><td>${item.MaPhieu ? docChip('pcl', item.MaPhieu, item.MaPhieu) : 'Chưa lập phiếu'}</td><td class="num"><strong>${money(item.TongLuong)}</strong></td><td>${esc(item.TrangThai)}</td></tr>`).join('');
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">BẢNG LƯƠNG</p><h2>${esc(payrollPeriodLabel(month))}</h2><span>${esc(data.period?.TrangThai || '—')}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid"><div><span>TRẠNG THÁI KỲ</span><strong>${esc(data.period?.TrangThai || 'Chưa lập')}</strong></div><div><span>TẤT TOÁN DỰ KIẾN</span><strong>${payrollDayLabel(data.summary?.NgayTraDuKien || data.period?.NgayTraDuKien)}</strong></div><div><span>QUỸ TM CÒN</span><strong>${money(data.fund?.fund?.SoTienMatCon)}</strong></div><div><span>QUỸ CK CÒN</span><strong>${money(data.fund?.fund?.SoTienCKCon)}</strong></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÂN VIÊN</th><th>PHIẾU CHI</th><th>TỔNG LƯƠNG</th><th>TRẠNG THÁI</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="warehouse-empty">Kỳ này chưa có bảng lương.</td></tr>'}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-primary print-payroll-period" type="button"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      wireDocLinks(overlay, context);
      overlay.querySelectorAll('[data-payroll-nv]').forEach(button => button.addEventListener('click', () => payrollDetailModal(context, month, button.dataset.payrollNv)));
      overlay.querySelector('.print-payroll-period').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'BẢNG LƯƠNG', number: month, documentDate: new Date(), status: data.period?.TrangThai,
        fields: [
          { label: 'Kỳ lương', value: payrollPeriodLabel(month) },
          { label: 'Tất toán dự kiến', value: payrollDayLabel(data.summary?.NgayTraDuKien || data.period?.NgayTraDuKien) }
        ],
        columns: [
          { label: 'Mã NV', key: 'MaNV' }, { label: 'Họ tên', key: 'TenNV' },
          { label: 'Phiếu chi', key: 'MaPhieu' }, { label: 'Tổng lương', key: 'TongLuong', format: 'money', align: 'right' },
          { label: 'Trạng thái', key: 'TrangThai' }
        ],
        rows: data.items || [],
        signatures: ['Kế toán', 'Quản lý cửa hàng']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const inferDocKind = item => {
    const table = item?.BangLienQuan || '';
    const ma = String(item?.lienKet?.openId || item?.doiTuongMa || item?.MaBanGhi || '');
    const map = {
      HoaDonMuaHang: 'invoice', CongNoNCC: 'cn', PhieuChi: 'pc', PhieuNhap: 'pn', DonMuaHang: 'po',
      PhieuThu: 'pt', CaLamViec: 'ca', PhieuChiLuong: 'pcl', LichSuChiLuong: 'pcl',
      KyLuong: 'payroll', BangLuong: 'payroll', QuyLuongKy: 'payroll'
    };
    if (map[table]) return map[table];
    if (/^PCL/i.test(ma)) return 'pcl';
    if (/^PC\d/i.test(ma)) return 'pc';
    if (/^CN/i.test(ma)) return 'cn';
    if (/^HDM/i.test(ma)) return 'invoice';
    if (/^PO/i.test(ma)) return 'po';
    if (/^PN/i.test(ma)) return 'pn';
    if (/^PT/i.test(ma)) return 'pt';
    if (/^\d{4}-\d{2}$/.test(ma)) return 'payroll';
    return '';
  };
  const activityOpenId = item => {
    const kind = inferDocKind(item);
    const link = item?.lienKet || {};
    if (kind === 'invoice') return link.MaHDMH || item.MaBanGhi;
    if (kind === 'cn') return link.MaCNPTra || item.MaBanGhi;
    if (kind === 'pc') return link.MaPhieu || item.MaBanGhi;
    if (kind === 'pt' || kind === 'ca') return link.MaCa || link.MaPT || item.MaBanGhi;
    if (kind === 'pcl') return link.MaPhieu || item.MaBanGhi;
    if (kind === 'payroll') return link.MaKy || item.MaBanGhi;
    if (kind === 'po') return link.MaPO || item.MaBanGhi;
    if (kind === 'pn') return link.MaPN || item.MaBanGhi;
    return item.doiTuongMa || item.MaBanGhi;
  };
  function openAccountingDoc(context, kind, id, onDone) {
    const key = String(kind || '').trim();
    const ma = String(id || '').trim();
    if (!ma) return context.showToast('Chưa có mã chứng từ để mở.', 'error');
    if (/^(invoice|hd|hoadonmuahang)$/i.test(key)) return invoiceDetail(context, ma);
    if (/^(po|donmuahang)$/i.test(key)) return purchaseOrderFileDetail(context, ma);
    if (/^(pn|phieunhap)$/i.test(key)) return receiptFileDetail(context, ma);
    if (/^(cn|congno|congnoncc)$/i.test(key)) return payableDetail(context, ma, onDone);
    if (/^(pc|phieuchi)$/i.test(key)) return payableDetail(context, ma, onDone);
    if (/^(pt|phieuthu|ca|calamviec)$/i.test(key)) return openSettlementDetail(context, ma, onDone || (async () => {}));
    if (/^(pcl|phieuchiluong|lichsuchiluong)$/i.test(key)) return payrollVoucherDetail(context, ma);
    if (/^(kyluong|bangluong|quyluongky|payroll)$/i.test(key)) return payrollPeriodDetail(context, ma);
    return context.showToast('Chưa có hồ sơ chi tiết cho loại chứng từ này.', 'error');
  }

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
        printReconciliationPreview(invoice, currentPreview);
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
      overlay.innerHTML = `<div class="warehouse-modal payment-voucher-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHIẾU CHI NHÀ CUNG CẤP</p><h2>${resubmit ? `Chỉnh sửa ${esc(debt.MaPhieu)}` : `Lập Phiếu chi cho ${esc(debt.MaCNPTra)}`}</h2><span>${esc(debt.TenNCC)} · Hạn ${fmtDate(debt.HanThanhToan)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body">${settlementFlow('Chờ Quản lý giao tiền')}<div class="payment-voucher-source"><div><span>ĐƠN MUA</span><strong>${esc(debt.MaPO)}</strong></div><div><span>PHIẾU NHẬP</span><strong>${esc(debt.MaPN)}</strong></div><div><span>HÓA ĐƠN NCC</span><strong>${esc(debt.SoHoaDon)}</strong></div><div><span>ĐỐI CHIẾU</span><strong><i class="status-pill ${matchClass(debt.TrangThaiDoiChieu)}">${esc(debt.TrangThaiDoiChieu)}</i></strong></div></div><div class="manager-readonly-note"><svg><use href="#i-shield"></use></svg><div><strong>Số tiền khóa theo toàn bộ công nợ còn lại</strong><span>Không trả trước, không thanh toán từng phần. Sau khi gửi, Quản lý duyệt và giao tiền; bạn mới được chi cho Nhà cung cấp. Công nợ chưa giảm ở bước này.</span></div></div><div class="payment-voucher-amount"><span>SỐ TIỀN CHI</span><strong>${money(debt.SoTienConLai)}</strong><small>${esc(debt.MaCNPTra)} · ${esc(debt.TrangThaiCongNo)}</small></div><div class="warehouse-form-grid payment-voucher-fields"><div class="warehouse-field"><label>Phương thức *</label><select id="voucherMethod"><option ${debt.PhuongThuc === 'Tiền mặt' ? 'selected' : ''}>Tiền mặt</option><option ${debt.PhuongThuc === 'Chuyển khoản' || !debt.PhuongThuc ? 'selected' : ''}>Chuyển khoản</option></select></div><div class="warehouse-field"><label>Nội dung chi *</label><input id="voucherContent" maxlength="500" value="${esc(defaultContent)}"></div><div class="warehouse-field full"><label>Ghi chú</label><textarea id="voucherNote" maxlength="500" rows="3" placeholder="Thông tin bổ sung cho Quản lý kiểm tra">${esc(debt.GhiChu || '')}</textarea></div></div>${resubmit ? `<p class="payment-voucher-rejection"><strong>Lý do bị từ chối:</strong> ${esc(debt.LyDoTuChoi || '—')}</p>` : ''}</div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-primary submit-voucher" type="button">${resubmit ? 'Chỉnh sửa và gửi lại' : 'Lập và gửi Quản lý duyệt'}</button></div></div>`;
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
        const daysLeft = Number(item.SoNgayConLai);
        const rowClass = item.TrangThaiPhieuChi === 'Thanh toán thành công' ? '' : daysLeft < 0 ? 'overdue-row' : daysLeft <= 3 ? 'due-soon-row' : '';
        const daysBadgeClass = daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'due-today' : daysLeft <= 5 ? 'due-soon' : 'safe';
        const daysText = daysLeft < 0 ? `Quá ${Math.abs(daysLeft)} ngày` : daysLeft === 0 ? 'Đến hạn hôm nay' : `Còn ${daysLeft} ngày`;
        return `<tr class="${rowClass}" data-debt="${esc(item.MaCNPTra)}" tabindex="0" role="button" aria-label="Mở hồ sơ công nợ ${esc(item.MaCNPTra)}"><td>${docChip('cn', item.MaCNPTra, item.MaCNPTra)}<small>Phát sinh ${fmtDate(item.NgayPhatSinh)}</small></td><td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)}</small></td><td><div class="doc-chip-set">${docChip('invoice', item.MaHDMH, `HĐ ${item.SoHoaDon}`)}<small>${docChip('po', item.MaPO, item.MaPO)} · ${docChip('pn', item.MaPN, item.MaPN || '—')}</small></div></td><td><strong>${fmtDate(item.HanThanhToan)}</strong><small><span class="days-badge ${daysBadgeClass}">${daysText}</span></small></td><td class="num"><strong>${money(item.SoTienConLai)}</strong><small>Gốc ${money(item.SoTienNo)}</small></td><td>${item.MaPhieu ? `${docChip('pc', item.MaPhieu, item.MaPhieu)}<small>${esc(item.PhuongThuc)}</small><span class="status-pill ${voucherClass(item.TrangThaiPhieuChi)}">${esc(item.TrangThaiPhieuChi)}</span>` : '<span class="status-pill draft">Chưa lập Phiếu chi</span>'}</td><td>${action}</td></tr>`;
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
    root.innerHTML = `${heading('KẾ TOÁN / CÔNG NỢ', 'Công nợ và Phiếu chi Nhà cung cấp', 'Lập đúng một Phiếu chi cho toàn bộ công nợ đến hạn. Sau khi Quản lý giao tiền, bạn thanh toán cho Nhà cung cấp; chỉ thành công mới giảm công nợ.', '<button class="warehouse-secondary" id="backInvoices">Mở hồ sơ đối chiếu</button>')}${settlementFlow()}<div class="warehouse-stats payment-voucher-stats"><article><span>CÒN PHẢI TRẢ</span><strong id="payableRemaining">0 đ</strong><small id="payableCount">0 khoản</small></article><article><span>CHỜ QUẢN LÝ GIAO TIỀN</span><strong id="voucherWaiting">0</strong><small>Duyệt Phiếu chi = giao quỹ</small></article><article><span>ĐÃ NHẬN TIỀN, CẦN CHI NCC</span><strong id="voucherReady">0</strong><small>Đã duyệt hoặc thanh toán thất bại</small></article></div><article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"></use></svg><input id="accountingPayableSearch" placeholder="Tìm công nợ, Nhà cung cấp, hóa đơn hoặc Phiếu chi..."></label><div class="warehouse-toolbar-actions"><select id="accountingVoucherStatus"><option value="">Tất cả Phiếu chi</option><option>Chưa lập Phiếu chi</option><option>Chờ duyệt</option><option>Đã duyệt</option><option>Thanh toán thất bại</option><option>Thanh toán thành công</option><option>Từ chối</option></select><button class="warehouse-icon-button" id="refreshPayables"><svg><use href="#i-refresh"></use></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table payment-voucher-table"><thead><tr><th>CÔNG NỢ</th><th>NHÀ CUNG CẤP</th><th>BỘ CHỨNG TỪ</th><th>HẠN THANH TOÁN</th><th>CÒN LẠI</th><th>PHIẾU CHI</th><th>THAO TÁC</th></tr></thead><tbody id="accountingPayableBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#accountingPayableSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#accountingVoucherStatus').addEventListener('change', load);
    root.querySelector('#refreshPayables').addEventListener('click', load);
    root.querySelector('#backInvoices').addEventListener('click', () => context.navigate('accounting-invoices'));
    root.addEventListener('click', event => {
      const chip = event.target.closest('[data-open-doc]');
      if (chip) {
        event.preventDefault();
        return openAccountingDoc(context, chip.dataset.openDoc, chip.dataset.openId, load);
      }
      const create = event.target.closest('[data-create-voucher]');
      if (create) return paymentVoucherForm(context, create.dataset.createVoucher, load);
      const resubmit = event.target.closest('[data-resubmit-voucher]');
      if (resubmit) return paymentVoucherForm(context, resubmit.dataset.resubmitVoucher, load, true);
      const pay = event.target.closest('[data-pay-voucher]');
      if (pay) return paymentResultForm(context, pay.dataset.payVoucher, load);
      if (event.target.closest('button, a, input, select, textarea, label')) return;
      const row = event.target.closest('tr[data-debt]');
      if (row) return payableDetail(context, row.dataset.debt, load);
    });
    root.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('tr[data-debt]');
      if (!row || event.target !== row) return;
      event.preventDefault();
      payableDetail(context, row.dataset.debt, load);
    });
    await load();
  };

  const initManagerPayables = async (root, context) => {
    let items = [];
    let summary = {};
    const render = () => {
      root.querySelector('#managerDebtBody').innerHTML = items.length ? items.map(item => {
        const dLeft = Number(item.SoNgayConLai);
        const rCls = item.TrangThaiHienTai === 'Đã thanh toán' ? '' : dLeft < 0 ? 'overdue-row' : dLeft <= 3 ? 'due-soon-row' : '';
        const dBadge = item.TrangThaiHienTai === 'Đã thanh toán' ? 'Đã hoàn tất' : dLeft < 0 ? `Quá ${Math.abs(dLeft)} ngày` : `Còn ${dLeft} ngày`;
        const dCls = item.TrangThaiHienTai === 'Đã thanh toán' ? 'safe' : dLeft < 0 ? 'overdue' : dLeft === 0 ? 'due-today' : dLeft <= 5 ? 'due-soon' : 'safe';
        return `
        <tr class="${rCls}">
          <td><strong>${esc(item.MaCNPTra)}</strong><small>Phát sinh ${fmtDate(item.NgayPhatSinh)}</small></td>
          <td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)}</small></td>
          <td><strong>HĐ ${esc(item.SoHoaDon)}</strong><small>${esc(item.MaPO)} · ${esc(item.MaPN || 'Chưa có Phiếu nhập')}</small></td>
          <td><strong>${fmtDate(item.HanThanhToan)}</strong><small><span class="days-badge ${dCls}">${dBadge}</span></small></td>
          <td class="num"><strong>${money(item.SoTienNo)}</strong><small>Đã trả ${money(item.SoTienDaTra)}</small></td>
          <td class="num"><strong>${money(item.SoTienConLai)}</strong></td>
          <td><span class="status-pill ${debtClass(item.TrangThaiHienTai)}">${esc(item.TrangThaiHienTai)}</span><small>${esc(item.BuocTatToan || (item.MaPhieu ? item.TrangThaiPhieuChi : 'Chưa lập Phiếu chi'))}</small></td>
          <td>${item.TrangThaiPhieuChi === 'Chờ duyệt'
            ? `<button class="warehouse-primary manager-debt-detail" data-fund-voucher="${esc(item.MaPhieu)}">Giao tiền</button>`
            : `<button class="warehouse-secondary manager-debt-detail" data-manager-debt="${esc(item.MaCNPTra)}">Xem</button>`}</td>
        </tr>`; }).join('') : '<tr><td colspan="8" class="warehouse-empty">Chưa phát sinh công nợ phải trả phù hợp với bộ lọc.</td></tr>';
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
  const reportIdleHtml = '<div class="welcome-card report-idle"><h2>Chưa lập báo cáo</h2><p>Chọn kỳ rồi bấm <strong>Lập báo cáo</strong> để tổng hợp số liệu. Trang này không tự chạy truy vấn nặng khi vừa mở.</p></div>';
  const periodFilterCard = (extraButtons, hint = '') => `${window.FLY_VI_DATE.periodToolbar(reportDefaults(), extraButtons)}${hint}<div id="financialReportBody">${reportIdleHtml}</div>`;
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
    let currentPnl = null;
    let activeTab = 'pnl';
    const extraButtons = '<button class="warehouse-secondary" id="exportReportCsv" hidden disabled>Xuất CSV</button><button class="warehouse-secondary" id="printFinancialReport" hidden disabled>Xem bản in / PDF</button>';
    root.innerHTML = `${heading('QUẢN LÝ / BÁO CÁO', 'Báo cáo cửa hàng', 'Xem cửa hàng đang lãi hay lỗ sau chi phí nhà cung cấp và lương đã khóa. Lãi gộp kế toán không bị trừ lương.')}${window.FLY_STORE_PNL?.nativeToolbar(reportDefaults(), extraButtons) || periodFilterCard(extraButtons)}<div id="financialReportBody">${reportIdleHtml}</div>`;
    const selectedPeriod = bindPeriodUi(root, () => { load(); });
    const syncTabButtons = () => {
      root.querySelectorAll('[data-store-tab]').forEach(button => button.classList.toggle('active', button.dataset.storeTab === activeTab));
      root.querySelectorAll('#exportReportCsv, #printFinancialReport').forEach(button => { button.hidden = activeTab === 'pnl'; });
    };
    const renderPnl = () => {
      const body = root.querySelector('#financialReportBody');
      if (!body || !currentPnl || !window.FLY_STORE_PNL?.render) return;
      window.FLY_STORE_PNL.render(body, currentPnl, {
        onSavePlan: async payload => {
          const result = await api(context, `/admin/reports/store-profit-loss/plan?_=${Date.now()}`, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          context.showToast(result.message, 'success');
          currentPnl = await api(context, `/admin/reports/store-profit-loss?periodType=${encodeURIComponent(payload.periodType)}&period=${encodeURIComponent(payload.period)}&lockPeriod=1&_=${Date.now()}`);
          renderPnl();
        }
      });
    };
    const showActive = () => {
      syncTabButtons();
      if (activeTab === 'pnl') return renderPnl();
      if (currentReport) return renderOps();
    };
    root.querySelectorAll('[data-store-tab]').forEach(button => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.storeTab;
        showActive();
      });
    });
    const load = async () => {
      const button = root.querySelector('#loadFinancialReport');
      if (button) button.disabled = true;
      try {
        const { type, period } = selectedPeriod();
        const lock = root.dataset.reportLock === '1' ? '&lockPeriod=1' : '';
        const bust = `&_=${Date.now()}`;
        const [pnl, ops] = await Promise.all([
          api(context, `/admin/reports/store-profit-loss?periodType=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}${lock}${bust}`),
          api(context, `/admin/reports/store-operations?periodType=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}${lock}${bust}`)
        ]);
        currentPnl = pnl;
        currentReport = ops;
        window.FLY_REPORT_PERIOD?.syncFromReport(root, currentPnl || currentReport);
        root.dataset.reportLock = '1';
        showActive();
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
    const renderOps = () => {
      if (!currentReport) return;
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
          </div><div class="financial-report-sections"><article class="warehouse-table-card report-flow-card" data-report-flow="purchases" tabindex="0" role="button" aria-label="Xem đơn mua và phiếu nhập trong kỳ"><div class="warehouse-panel-title"><div><p>MUA HÀNG</p><h2>Đơn mua và nhập kho</h2></div></div><div class="report-metric-list"><div><span>Đơn mua hợp lệ</span><strong>${p.SoDonMua || 0} · ${money(p.GiaTriDonMua)}</strong></div><div><span>Phiếu nhập xác nhận</span><strong>${p.SoPhieuNhap || 0} · ${money(p.GiaTriNhap)}</strong></div></div></article><article class="warehouse-table-card report-flow-card" data-report-flow="cash" tabindex="0" role="button" aria-label="Xem phiếu thu và phiếu chi trong kỳ"><div class="warehouse-panel-title"><div><p>THU – CHI</p><h2>Dòng tiền chứng từ</h2></div></div><div class="report-metric-list"><div><span>Phiếu thu thực nộp</span><strong>${money(f.PhieuThuThucNop)}</strong></div><div><span>Đã thanh toán NCC</span><strong>${money(f.DaThanhToanNCC)}</strong></div></div></article><article class="warehouse-table-card report-flow-card" data-report-flow="inventory" tabindex="0" role="button" aria-label="Xem nhập xuất tồn trong kỳ"><div class="warehouse-panel-title"><div><p>BIẾN ĐỘNG KHO</p><h2>Nhập, xuất và điều chỉnh</h2></div></div><div class="report-metric-list"><div><span>Nhập / xuất</span><strong>${qty(inv.SoLuongNhap)} / ${qty(inv.SoLuongXuat)}</strong></div><div><span>Điều chỉnh ròng</span><strong>${qty(inv.DieuChinhRong)}</strong></div></div></article></div></details>`;
        try {
          const body = root.querySelector('#financialReportBody');
          window.FLY_REPORT_LAYOUT?.enhance(body, { actor: 'Quản lý', analysisTitle: 'Hiệu quả kinh doanh và vận hành cửa hàng' });
          window.FLY_REPORT_LAYOUT?.bindDrills(body, {
            context,
            doiTra: currentReport.doiTra,
            period: currentReport.period,
            documentsPath: '/admin/reports/financial-documents',
            pages: { cashPay: 'manager-payables' }
          });
        } catch (error) { console.warn(error); }
        const printBtn = root.querySelector('#printFinancialReport');
        const exportBtn = root.querySelector('#exportReportCsv');
        if (printBtn) printBtn.disabled = false;
        if (exportBtn) exportBtn.disabled = false;
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
        note: 'Báo cáo quản trị tổng hợp hoạt động cửa hàng. Chi tiết công thức lãi gộp 3 bước do Kế toán lập.',
        signatures: ['Kế toán', 'Quản lý cửa hàng']
      });
    });
    root.querySelector('#exportReportCsv').addEventListener('click', () => {
      if (!currentReport) return;
      const rows = [['BÁO CÁO HOẠT ĐỘNG CỬA HÀNG', currentReport.period.label], ['Doanh thu thuần', currentReport.sales.DoanhThuThuan], ['Lợi nhuận gộp', currentReport.sales.LoiNhuanGop], ['Phiếu thu thực nộp', currentReport.finance.PhieuThuThucNop], ['Phiếu chi', currentReport.finance.TongPhieuChi], [], ['Ngày', 'Số hóa đơn', 'Doanh thu thuần', 'Lãi gộp'], ...currentReport.daily.map(row => [fmtDate(row.Ngay), row.SoHoaDon, row.DoanhThuThuan, row.LoiNhuanGop]), ...returnCsvRows(currentReport.doiTra)];
      downloadCsv(`hoat-dong-cua-hang-${currentReport.period.period}.csv`, rows);
    });
  };

  const initFinancialReports = async (root, context) => {
    let currentReport = null;
    const endpoint = '/accounting/reports/financial-summary';
    const roleLabel = 'KẾ TOÁN / BÁO CÁO';
    root.innerHTML = `${heading(roleLabel, 'Báo cáo tài chính nội bộ', 'Doanh thu thuần, giá vốn, lãi gộp 3 bước, thuế đầu vào, nhập–xuất–tồn giá trị, công nợ và chứng từ thu/chi.')}${periodFilterCard('<button class="warehouse-secondary" id="exportReportCsv" disabled>Xuất CSV</button><button class="warehouse-secondary" id="printFinancialReport" disabled>Xem bản in / PDF</button>', '<p class="report-compile-hint">Nút <strong>Lập báo cáo</strong> gửi kỳ (ngày/tháng/quý/năm) lên hệ thống để tổng hợp doanh thu thuần, phiếu thu, chi nhà cung cấp, công nợ và chênh lệch ca. Không khóa sổ cái, không chi tiền. Kỳ không có chứng từ hoàn thành sẽ hiện 0đ.</p>')}`;

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
            { icon: 'i-report', tone: reconciliationPending ? 'warning' : 'ok', title: `${reconciliationPending} hóa đơn chưa đối chiếu khớp`, detail: `${reconciliationMatched.SoHoaDon || 0} hóa đơn đã khớp trong kỳ`, value: 'Đối chiếu' },
            { icon: 'i-bank', tone: Number(f.CongNoQuaHan) ? 'danger' : 'ok', title: `Công nợ quá hạn ${money(f.CongNoQuaHan)}`, detail: 'Thanh toán toàn bộ một lần sau phê duyệt', value: 'Công nợ' },
            { icon: 'i-cash', tone: Number(f.ChenhLechPhieuThu) ? 'warning' : 'ok', title: `Chênh lệch bàn giao ${money(f.ChenhLechPhieuThu)}`, detail: 'Ghi lý do trực tiếp trên Phiếu thu', value: 'Bàn giao' },
            { icon: 'i-trend', tone: Number(s.DoanhThuThuan) ? 'ok' : '', title: `Lợi nhuận gộp ${money(s.LoiNhuanGop)}`, detail: `Biên lãi gộp ${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(grossMargin)}%`, value: 'Báo cáo' }
          ])}</article>
        </div>
        ${doiTraPanel(data.doiTra, { title: 'Hoàn tiền ảnh hưởng doanh thu thuần', subtitle: 'Tiền hoàn đã trừ khỏi doanh thu thuần. Hàng loại bỏ/vứt không hoàn giá vốn vào tồn; hàng nhập lại mới cộng tồn bán.', productTitle: 'Hàng trả làm giảm doanh thu' })}
        <details class="report-detail-disclosure accounting-detail" open><summary>Xem công thức lãi gộp và dữ liệu đối soát chi tiết</summary>
          <div class="gross-profit-steps"><div class="step"><div><span>DOANH THU HÓA ĐƠN</span><strong>${money(s.DoanhThuHoaDon)}</strong></div><b>−</b><div><span>TIỀN HOÀN</span><strong>${money(s.TienHoan)}</strong></div><b>=</b><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div></div><div class="step"><div><span>GIÁ VỐN HÓA ĐƠN</span><strong>${money(s.GiaVonHoaDon)}</strong></div><b>−</b><div><span>GV HÀNG TRẢ NHẬP LẠI</span><strong>${money(s.GiaVonHangTraNhapLai)}</strong></div><b>+</b><div><span>GV HÀNG GIAO ĐỔI</span><strong>${money(s.GiaVonHangGiaoDoi)}</strong></div><b>=</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div></div><div class="step"><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div><b>−</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div><b>=</b><div class="result"><span>LÃI GỘP</span><strong>${money(s.LoiNhuanGop ?? (Number(s.DoanhThuThuan || 0) - Number(s.GiaVonHangBanThuan || 0)))}</strong></div></div></div>
          <div class="financial-report-sections"><article class="warehouse-table-card report-flow-card" data-report-flow="purchases" tabindex="0" role="button" aria-label="Xem đơn mua, phiếu nhập và thuế đầu vào"><div class="warehouse-panel-title"><div><p>MUA HÀNG &amp; THUẾ</p><h2>Chứng từ đầu vào</h2></div></div><div class="report-metric-list"><div><span>Đơn mua / Phiếu nhập</span><strong>${p.SoDonMua || 0} / ${p.SoPhieuNhap || 0}</strong></div><div><span>Tiền hàng / Thuế đầu vào</span><strong>${money(p.TienHangMua)} / ${money(p.ThueDauVao)}</strong></div></div></article><article class="warehouse-table-card report-flow-card" data-report-flow="inventory" tabindex="0" role="button" aria-label="Xem nhập xuất tồn trong kỳ"><div class="warehouse-panel-title"><div><p>NHẬP – XUẤT – TỒN</p><h2>Biến động hàng hóa</h2></div></div><div class="report-metric-list"><div><span>Tồn đầu / cuối kỳ</span><strong>${Number(inv.SoLuongDauKy || 0).toLocaleString('vi-VN')} / ${Number(inv.SoLuongCuoiKy || 0).toLocaleString('vi-VN')}</strong></div><div><span>Nhập / xuất</span><strong>${Number(inv.SoLuongNhap || 0).toLocaleString('vi-VN')} / ${Number(inv.SoLuongXuat || 0).toLocaleString('vi-VN')}</strong></div></div></article><article class="warehouse-table-card report-flow-card" data-report-flow="cash" tabindex="0" role="button" aria-label="Xem phiếu thu và phiếu chi trong kỳ"><div class="warehouse-panel-title"><div><p>THU – CHI</p><h2>Tổng hợp chứng từ</h2></div></div><div class="report-metric-list"><div><span>Phiếu thu hệ thống / thực nộp</span><strong>${money(f.PhieuThuTheoHeThong)} / ${money(f.PhieuThuThucNop)}</strong></div><div><span>Phiếu chi / đã thanh toán</span><strong>${money(f.TongPhieuChi)} / ${money(f.DaThanhToanNCC)}</strong></div></div></article></div>
          <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CHI TIẾT BÁN HÀNG</p><h2>Doanh thu, giá vốn và lãi gộp theo ngày</h2></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY</th><th>HÓA ĐƠN</th><th>DOANH THU HĐ</th><th>TIỀN HOÀN</th><th>DOANH THU THUẦN</th><th>GIÁ VỐN THUẦN</th><th>LÃI GỘP</th></tr></thead><tbody>${daily.length ? (() => { const avgMargin = daily.reduce((sum, r) => sum + Number(r.LoiNhuanGop || 0), 0) / daily.length; return daily.map(row => { const margin = Number(row.LoiNhuanGop || 0); const cls = margin > avgMargin * 1.3 ? 'high-margin' : margin < avgMargin * 0.5 && margin >= 0 ? 'low-margin' : ''; return `<tr class="${cls}"><td>${fmtDate(row.Ngay)}</td><td class="num">${row.SoHoaDon}</td><td class="num">${money(row.DoanhThuHoaDon)}</td><td class="num">${money(row.TienHoan)}</td><td class="num"><strong>${money(row.DoanhThuThuan)}</strong></td><td class="num">${money(row.GiaVonHangBanThuan)}</td><td class="num"><strong>${money(row.LoiNhuanGop)}</strong></td></tr>`; }).join(''); })() : '<tr><td colspan="7" class="warehouse-empty">Kỳ này chưa có hóa đơn hoàn thành hoặc đổi trả hoàn thành.</td></tr>'}</tbody>${daily.length ? `<tfoot><tr><td><strong>TỔNG</strong></td><td class="num">${daily.reduce((s, r) => s + Number(r.SoHoaDon || 0), 0)}</td><td class="num">${money(daily.reduce((s, r) => s + Number(r.DoanhThuHoaDon || 0), 0))}</td><td class="num">${money(daily.reduce((s, r) => s + Number(r.TienHoan || 0), 0))}</td><td class="num"><strong>${money(s.DoanhThuThuan)}</strong></td><td class="num">${money(s.GiaVonHangBanThuan)}</td><td class="num"><strong>${money(s.LoiNhuanGop)}</strong></td></tr></tfoot>` : ''}</table></div></article>
        </details>`;
      const body = root.querySelector('#financialReportBody');
      window.FLY_REPORT_LAYOUT?.enhance(body, { actor: 'Kế toán', analysisTitle: 'Xu hướng tài chính và chất lượng doanh thu', detailTitle: 'Công thức, chứng từ và số liệu theo ngày' });
      window.FLY_REPORT_LAYOUT?.bindDrills(body, {
        context,
        doiTra: data.doiTra,
        period: data.period,
        documentsPath: '/accounting/reports/financial-documents',
        pages: { purchases: 'accounting-invoices', cashReceipts: 'accounting-settlements', cashPay: 'accounting-payables' }
      });
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
  };

  const payrollFundReady = (item, fund) => {
    const amount = Number(item.TongLuong || item.SoTien || 0);
    const method = item.PhuongThucPhieu || item.PhuongThuc || '';
    if (method === 'Tiền mặt') return Number(fund?.fund?.SoTienMatCon || 0) >= amount;
    if (method === 'Chuyển khoản') return Number(fund?.fund?.SoTienCKCon || 0) >= amount;
    return false;
  };

  const payrollAction = (item, canWrite, fund) => {
    if (!canWrite) return '<span class="payroll-muted">Chỉ Kế toán thao tác</span>';
    if (item.TrangThai === 'Đã thanh toán') return item.MaGiaoDichNganHang || item.MaGiaoDich ? esc(item.MaGiaoDichNganHang || item.MaGiaoDich) : '<span class="status-pill ok">Đã chi</span>';
    if (item.TrangThaiPhieu === 'Chờ duyệt') return '<span class="payment-voucher-wait">Chờ Quản lý duyệt</span>';
    if (item.TrangThaiPhieu === 'Từ chối') return `<button class="warehouse-secondary" data-resubmit-payroll="${esc(item.MaPhieu)}" data-employee="${esc(item.MaNV)}">Sửa &amp; gửi lại</button>`;
    if (['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThaiPhieu)) {
      if (!payrollFundReady(item, fund)) {
        return item.PhuongThucPhieu === 'Tiền mặt'
          ? '<span class="payment-voucher-wait">Chờ QL giao quỹ chung TM</span>'
          : '<span class="payment-voucher-wait">Chờ QL ủy quyền CK chung</span>';
      }
      return `<button class="warehouse-primary" data-pay-payroll="${esc(item.MaPhieu)}" data-method="${esc(item.PhuongThucPhieu || '')}">${item.TrangThaiPhieu === 'Thanh toán thất bại' ? 'Thực hiện lại' : 'Chi từ quỹ chung'}</button>`;
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
      return `<span class="status-pill sent">Phiếu chờ QL duyệt</span><small>Kỳ đã khóa · chưa giao quỹ chung</small>`;
    }
    if (item.TrangThaiPhieu === 'Từ chối') {
      return `<span class="status-pill cancelled">Phiếu bị từ chối</span><small>Sửa trên cùng phiếu</small>`;
    }
    if (item.TrangThaiPhieu === 'Thanh toán thất bại') {
      return `<span class="status-pill cancelled">Chi thất bại</span><small>Thực hiện lại cùng phiếu</small>`;
    }
    if (item.TrangThaiPhieu === 'Đã duyệt') {
      return `<span class="status-pill sent">QL đã duyệt</span><small>Chi khi đã có quỹ chung</small>`;
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
      return { title: 'Bước tiếp theo: lập bảng lương', text: 'Chưa bấm Lập thì chưa có số. Chỉ nhân viên đã chấm công (đã duyệt) trong tháng mới có mặt. Lương lễ 8 giờ chỉ cộng cho người đã đi làm — không đưa cả cửa hàng vào vì ngày lễ.' };
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
        return { title: 'Bước tiếp theo: chờ Quản lý duyệt', text: `${waitingQl} phiếu đang chờ duyệt. Sau khi duyệt, Quản lý giao quỹ chung một lần — không giao từng người.` };
      }
      const waitingPay = vouchers.filter(item => ['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThai));
      if (waitingPay.length) {
        const fund = data.fund || {};
        const needTm = waitingPay.filter(item => item.PhuongThuc === 'Tiền mặt' && Number(fund.fund?.SoTienMatCon || 0) < Number(item.SoTien));
        const needCk = waitingPay.filter(item => item.PhuongThuc === 'Chuyển khoản' && Number(fund.fund?.SoTienCKCon || 0) < Number(item.SoTien));
        if (needTm.length || needCk.length || !fund.handed) {
          return { title: 'Bước tiếp theo: chờ Quản lý giao quỹ cho kế toán', text: 'Phiếu đã duyệt. Quản lý mở Trung tâm phê duyệt → Giao quỹ cho kế toán (tiền mặt và/hoặc ủy quyền CK).' };
        }
        return { title: 'Bước tiếp theo: chi từ quỹ chung', text: `Quỹ còn TM ${money(fund.fund?.SoTienMatCon)} · CK ${money(fund.fund?.SoTienCKCon)}. Chi từng nhân viên; mỗi lần ghi lịch sử.` };
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
      overlay.innerHTML = `<div class="warehouse-modal" style="width:min(920px,96vw)"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHI TIẾT BẢNG LƯƠNG</p><h2>${esc(data.item.TenNV)}</h2><span>${esc(month)} · nghỉ lễ ${money(data.item.LuongNgayLe)} · tăng ca ${money(data.item.LuongTangCa)} · tổng ${money(data.item.TongLuong)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY</th><th>LOẠI NGÀY</th><th>LOẠI GIỜ</th><th>HỆ SỐ</th><th>PHÚT NGÀY</th><th>PHÚT ĐÊM</th><th>THÀNH TIỀN</th></tr></thead><tbody>${(data.lines || []).length ? data.lines.map(line => `<tr><td>${esc(line.NgayCong || '')}</td><td>${esc(line.LoaiNgay || '')}</td><td>${esc(line.LoaiGio || '')}</td><td class="num">${Number(line.HeSoApDung || line.HeSoBanDem || 0).toFixed(2)}</td><td class="num">${line.PhutNgay}</td><td class="num">${line.PhutDem}</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Không có dòng chi tiết.</td></tr>'}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-primary print-payroll-lines" type="button"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => overlay.remove()));
      overlay.querySelector('.print-payroll-lines')?.addEventListener('click', () => window.FLY_PRINT.show({
        title: 'CHI TIẾT BẢNG LƯƠNG', number: `${month}-${data.item.MaNV}`,
        documentDate: new Date(), status: data.item.TrangThai,
        fields: [
          { label: 'Nhân viên', value: data.item.TenNV }, { label: 'Kỳ lương', value: month },
          { label: 'Lương ngày lễ', value: data.item.LuongNgayLe, format: 'money' },
          { label: 'Lương tăng ca', value: data.item.LuongTangCa, format: 'money' }
        ],
        columns: [
          { label: 'Ngày', key: 'NgayCong' }, { label: 'Loại ngày', key: 'LoaiNgay' },
          { label: 'Loại giờ', key: 'LoaiGio' }, { label: 'Phút ngày', key: 'PhutNgay', align: 'right' },
          { label: 'Phút đêm', key: 'PhutDem', align: 'right' }, { label: 'Thành tiền', key: 'ThanhTien', format: 'money', align: 'right' }
        ],
        rows: data.lines || [],
        totals: [{ label: 'TỔNG LƯƠNG', value: data.item.TongLuong, format: 'money' }],
        signatures: ['Kế toán', 'Nhân viên']
      }));
    } catch (error) {
      context.showToast(error.message, 'error');
    }
  };

  const payrollPayModal = async (context, maPhieu, method, onDone, warnLate) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal payment-result-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHI TỪ QUỸ CHUNG</p><h2>${esc(maPhieu)}</h2><span>${esc(method)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="manager-readonly-note"><svg><use href="#i-cash"></use></svg><div><strong>Chích một khoản từ quỹ chung kỳ này</strong><span>${method === 'Tiền mặt' ? 'Lấy tiền mặt trong quỹ chung đã nhận. Số quỹ còn giảm khi chi thành công.' : 'Chuyển khoản theo ủy quyền chung, bắt buộc mã giao dịch ngân hàng. Hạn mức CK còn giảm khi thành công.'} Thất bại thì quỹ không trừ; dùng lại cùng phiếu.</span></div></div>${warnLate ? '<p class="warehouse-modal-note"><strong>Cảnh báo tất toán:</strong> từ ngày 8 của tháng chi; sau mùng 10 vẫn chi được nhưng phải ghi lý do chi trễ.</p>' : ''}<div class="warehouse-form-grid payment-voucher-fields"><div class="warehouse-field"><label>Kết quả *</label><select id="payrollPayResult"><option value="success">Chi thành công</option><option value="failed">Chi thất bại</option></select></div><div class="warehouse-field bank-code-field"><label>Mã giao dịch ngân hàng *</label><input id="payrollBankCode" maxlength="50" placeholder="Bắt buộc khi chuyển khoản thành công"></div><div class="warehouse-field full late-reason-field" ${warnLate ? '' : 'hidden'}><label>Lý do chi trễ *</label><textarea id="payrollLateNote" maxlength="500" rows="2" placeholder="Bắt buộc nếu chi sau mùng 10"></textarea></div><div class="warehouse-field full"><label id="payrollPayNoteLabel">Ghi chú</label><textarea id="payrollPayNote" maxlength="500" rows="2"></textarea></div></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-primary submit-payroll-pay" type="button">Ghi nhận kết quả</button></div></div>`;
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
      root.innerHTML = `${heading('KẾ TOÁN / LƯƠNG', `Bảng lương ${payrollPeriodLabel(month)}`, 'Chưa bấm Lập thì chưa có số. Chỉ nhân viên đã chấm công (đã duyệt) trong tháng mới có mặt. Lương lễ 8 giờ chỉ cộng khi đã đi làm thật. Tất toán mùng 10 tháng sau.')}
        <p class="payroll-role-help">Kế toán lập và khóa bảng lương, rồi lập phiếu chi. Quản lý duyệt từng người (hoặc Duyệt tất cả), sau đó <strong>giao quỹ cho kế toán</strong>. Bạn chi từng nhân viên từ quỹ đó — không chi khi chưa duyệt hoặc chưa được giao quỹ.</p>
        <div id="payrollStepBanner"></div>
        <div id="payrollFundBanner"></div>
        <article class="warehouse-table-card"><div class="warehouse-toolbar">${payrollPeriodPicker(month)}<div class="warehouse-toolbar-actions" id="payrollToolbarActions"></div></div>
        <div id="payrollPeriodStatus"></div>
        <div class="warehouse-table-wrap"><table class="warehouse-table payroll-table"><thead><tr>
          <th>Nhân viên<small>Bấm hàng để xem hệ số</small></th>
          <th title="Giờ làm trong ca, ban ngày (không gồm 8 giờ nghỉ lễ)">Giờ ngày<small>Trong ca</small></th>
          <th title="Giờ làm 22h–6h, hệ số 130% ngày thường">Giờ đêm<small>22h–6h</small></th>
          <th title="Mỗi ngày lễ trong kỳ: 8 × lương giờ, chỉ cộng cho NV đã có công đã duyệt trong kỳ">Lương ngày lễ<small>8 giờ · đã đi làm</small></th>
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
        const periodStatus = data.period?.TrangThai || 'Chưa lập';
        const canBuild = write && data.canBuild !== false && periodStatus !== 'Đã khóa' && periodStatus !== 'Đã thanh toán';
        const canLock = write && periodStatus === 'Kế toán đã lập';
        const canVoucher = write && periodStatus === 'Đã khóa';
        if (!write) {
          actions.innerHTML = '<span class="payroll-muted">Chỉ Kế toán được lập / khóa kỳ. Quản lý duyệt phiếu rồi giao quỹ cho kế toán.</span>';
        } else {
          actions.innerHTML = `<button class="warehouse-secondary" id="buildPayroll" ${canBuild ? '' : 'disabled'} title="${data.canBuild === false ? 'Không lập kỳ tương lai' : 'Chỉ kế toán'}">Lập / tính lại · chỉ kế toán</button>
            <button class="warehouse-primary" id="lockPayroll" ${canLock ? '' : 'disabled'} title="Chỉ kế toán">Khóa kỳ lương · chỉ kế toán</button>
            <button class="warehouse-primary" id="batchPayrollVouchers" ${canVoucher ? '' : 'disabled'} title="Chỉ kế toán">Lập phiếu chi hàng loạt</button>`;
        }
        const fund = data.fund || {};
        const fundBanner = root.querySelector('#payrollFundBanner');
        if (fundBanner) {
          const ktName = fund.accountant?.TenNV || 'bạn';
          if (fund.fund) {
            fundBanner.innerHTML = `<div class="payroll-fund-banner"><div><p>QUỸ QUẢN LÝ ĐÃ GIAO CHO BẠN</p><strong>TM còn ${money(fund.fund.SoTienMatCon)} · CK còn ${money(fund.fund.SoTienCKCon)}</strong><small>Đã giao TM ${money(fund.fund.SoTienMatGiao)} · ủy quyền CK ${money(fund.fund.SoTienCKGiao)}${fund.fund.TenQL ? ` · ${esc(fund.fund.TenQL)}` : ''}${fund.fund.NgayGiao ? ` · ${fmtDateTime(fund.fund.NgayGiao)}` : ''} — chi từng NV từ quỹ này</small></div></div>`;
          } else {
            fundBanner.innerHTML = `<div class="payroll-fund-banner empty"><div><p>QUỸ QUẢN LÝ GIAO CHO BẠN</p><strong>Chưa giao</strong><small>Sau khi Quản lý duyệt phiếu và bấm “Giao quỹ cho kế toán” (${esc(ktName)}), bạn mới chi từng nhân viên từ quỹ đó.</small></div></div>`;
          }
        }
        root.querySelector('#payrollPeriodStatus').innerHTML = `<div class="warehouse-panel-title"><div><p>TRẠNG THÁI KỲ (cả bảng)</p><h2>${esc(periodStatus)}</h2><small>Ngày tất toán dự kiến: ${dueLabel} (mùng 10 tháng sau) · ${data.summary?.SoNgayLe || 0} ngày lễ · lương lễ ${money(data.summary?.TongLuongNgayLe)}</small><p class="payroll-build-hint">Chưa bấm Lập thì chưa có số. Chỉ nhân viên đã chấm công (đã duyệt) trong tháng mới có mặt.</p></div><span class="status-pill ${periodStatus === 'Đã thanh toán' ? 'ok' : periodStatus === 'Chưa lập' ? 'draft' : 'sent'}">${data.items.length} nhân viên</span></div>`;
        const body = root.querySelector('#payrollTableBody');
        body.innerHTML = data.items.length
          ? data.items.map(item => `<tr data-employee="${esc(item.MaNV)}"><td><button class="warehouse-link" data-payroll-detail="${esc(item.MaNV)}"><strong>${esc(item.TenNV)}</strong></button><small>${esc(item.MaNV)}</small></td><td class="num">${(item.PhutNgay / 60).toFixed(2)}</td><td class="num">${(item.PhutDem / 60).toFixed(2)}</td><td class="num">${money(item.LuongNgayLe)}</td><td class="num">${money(item.LuongTangCa)}</td><td class="num"><strong>${money(item.TongLuong)}</strong></td><td>${item.MaPhieu ? `<strong>${esc(item.MaPhieu)}</strong><small>${esc(item.PhuongThucPhieu || item.PhuongThucChi || '')}</small>` : 'Chưa lập phiếu'}</td><td>${payrollRowStatus(item)}</td><td>${payrollAction(item, write, fund)}</td></tr>`).join('')
          : `<tr><td colspan="9" class="warehouse-empty">${periodStatus === 'Chưa lập' ? 'Chưa bấm Lập / tính lại — bảng trống. Chỉ nhân viên đã chấm công (đã duyệt) trong tháng mới có mặt.' : 'Đã lập kỳ nhưng không có nhân viên nào có công đã duyệt. Không cộng lương lễ cho cả cửa hàng.'}</td></tr>`;
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
          root.innerHTML = `<div class="welcome-card"><h2>${denied ? 'Không đủ quyền xem bảng lương' : 'Không thể tải bảng lương'}</h2><p>${esc(message)}</p><p>Chỉ Kế toán lập và khóa kỳ. Quản lý duyệt công và duyệt phiếu chi/giao quỹ.</p></div>`;
        }
      }
    };
    await load();
  };

  const ACCOUNTING_DRILL = {
    HoaDonMuaHang: 'accounting-invoices',
    CongNoNCC: 'accounting-payables',
    PhieuChi: 'accounting-payables',
    PhieuThu: 'accounting-settlements',
    CaLamViec: 'accounting-settlements',
    KyLuong: 'accounting-payroll',
    BangLuong: 'accounting-payroll',
    PhieuChiLuong: 'accounting-payroll',
    QuyLuongKy: 'accounting-payroll',
    LichSuChiLuong: 'accounting-payroll'
  };

  /* ── Activity icon & color helpers ── */
  const ACTIVITY_ICONS = {
    'Lập phiếu chi': 'i-expense', 'Phiếu chi NCC': 'i-expense', 'Duyệt': 'i-approve',
    'Thanh toán': 'i-pay', 'Đối chiếu': 'i-reconcile', 'Giao quỹ': 'i-fund',
    'Lập phiếu thu': 'i-income', 'Phiếu thu': 'i-income', 'Lập phiếu chi lương': 'i-payroll',
    'Khóa lương': 'i-lock', 'Lập bảng lương': 'i-payroll', 'Chi từ quỹ': 'i-fund',
    'Nhập kho': 'i-warehouse', 'Xuất kho': 'i-warehouse'
  };
  const activityIcon = label => {
    for (const [key, icon] of Object.entries(ACTIVITY_ICONS)) { if ((label || '').includes(key)) return icon; }
    return 'i-log';
  };
  const ACTIVITY_EMOJI = {
    'Lập phiếu chi': '📋', 'Phiếu chi NCC': '📋', 'Lập phiếu thu': '📋', 'Phiếu thu': '📋',
    'Lập phiếu chi lương': '📋', 'Lập bảng lương': '📋',
    'Duyệt': '✅', 'Đã duyệt': '✅',
    'Thanh toán': '💰', 'Chi từ quỹ': '💰',
    'Giao quỹ': '🔄', 'Khóa lương': '🔒',
    'Đối chiếu': '📊', 'Nhập kho': '📦', 'Xuất kho': '📦'
  };
  const activityEmoji = label => {
    for (const [key, emoji] of Object.entries(ACTIVITY_EMOJI)) { if ((label || '').includes(key)) return emoji; }
    return '📝';
  };
  const ACTIVITY_COLOR = {
    'Lập phiếu chi': 'blue', 'Phiếu chi NCC': 'blue', 'Lập phiếu thu': 'blue', 'Phiếu thu': 'blue',
    'Lập phiếu chi lương': 'purple', 'Lập bảng lương': 'purple',
    'Duyệt': 'green', 'Đã duyệt': 'green',
    'Thanh toán': 'emerald', 'Chi từ quỹ': 'emerald',
    'Giao quỹ': 'amber', 'Khóa lương': 'slate',
    'Đối chiếu': 'teal', 'Nhập kho': 'brown', 'Xuất kho': 'brown'
  };
  const activityColor = label => {
    for (const [key, color] of Object.entries(ACTIVITY_COLOR)) { if ((label || '').includes(key)) return color; }
    return 'default';
  };
  const statusClass = item => {
    const s = (item.ketQuaHienThi || item.TrangThai || '').toLowerCase();
    if (s.includes('thành công') || s.includes('đã duyệt') || s.includes('đã thanh toán') || s.includes('hoàn tất')) return 'ok';
    if (s.includes('chờ') || s.includes('đang')) return 'warning';
    if (s.includes('thất bại') || s.includes('từ chối') || s.includes('hủy')) return 'cancelled';
    return '';
  };
  const statusLabel = item => {
    const s = item.ketQuaHienThi || item.TrangThai || '';
    return s || '—';
  };

  const initAccountingHistory = async (root, context) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const fromDefault = new Date();
    fromDefault.setDate(fromDefault.getDate() - 30);
    const fromKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(fromDefault);
    let currentPage = 1;
    const PAGE_SIZE = 40;
    let lastLogData = null;

    root.innerHTML = `${heading('KẾ TOÁN / NHẬT KÝ', 'Lịch sử hoạt động', 'Mọi việc bạn đã làm: đối chiếu hóa đơn, phiếu chi NCC, phiếu thu, lập/khóa lương, lập phiếu lương, chi từ quỹ chung. Không xóa được nhật ký.')}
      <article class="warehouse-table-card"><div class="warehouse-toolbar accounting-history-filters" data-keep-native>
        <label class="warehouse-field"><span>Từ ngày</span><input type="date" id="accHistFrom" data-keep-native value="${esc(fromKey)}"></label>
        <label class="warehouse-field"><span>Đến ngày</span><input type="date" id="accHistTo" data-keep-native value="${esc(today)}"></label>
        <label class="warehouse-field"><span>Loại việc</span><select id="accHistKind">
          <option value="nghiep-vu">Việc nghiệp vụ</option>
          <option value="">Tất cả</option>
          <option value="quy-luong" selected>Chi lương / quỹ chung</option>
          <option value="luong">Lương, công, ca</option>
          <option value="cong-no">Công nợ / phiếu chi NCC</option>
          <option value="tien-ton">Tiền và tồn</option>
        </select></label>
        <label class="warehouse-field"><span>Tìm</span><input id="accHistSearch" placeholder="Chứng từ, nội dung..."></label>
        <div class="warehouse-toolbar-actions"><button class="warehouse-primary" id="accHistLoad" type="button">Xem lịch sử</button></div>
      </div>

      <!-- Timeline -->
      <div class="acc-timeline" id="accTimeline"></div>
      <div class="acc-timeline-pager" id="accTimelinePager"></div>

      <!-- Activity log table -->
      <div class="warehouse-table-wrap"><table class="warehouse-table acc-history-table" id="accHistTable"><thead><tr>
        <th class="sortable" data-sort="ThoiGian">THỜI GIAN <span class="sort-arrow"></span></th>
        <th class="sortable" data-sort="viecLam">VIỆC LÀM <span class="sort-arrow"></span></th>
        <th>ĐỐI TƯỢNG</th>
        <th class="sortable num" data-sort="SoTien">SỐ TIỀN <span class="sort-arrow"></span></th>
        <th>TRẠNG THÁI</th>
        <th>GIẢI THÍCH</th>
        <th></th>
      </tr></thead><tbody id="accHistBody"><tr><td colspan="7" class="warehouse-empty">Đang tải...</td></tr></tbody></table></div></article>

      <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>QUỸ CHUNG</p><h2>Lịch sử chi lương từ quỹ chung</h2></div><span class="warehouse-chip">Không xóa</span></div>
      <div class="warehouse-table-wrap"><table class="warehouse-table acc-payout-table"><thead><tr>
        <th>LÚC CHI</th><th>NHÂN VIÊN</th><th>PHIẾU</th><th>KÊNH</th>
        <th class="num">SỐ TIỀN</th><th>MÃ GD</th><th class="num">QUỸ CÒN SAU CHI</th><th>KẾT QUẢ</th>
      </tr></thead><tbody id="accPayoutBody"><tr><td colspan="8" class="warehouse-empty">Đang tải...</td></tr></tbody>
      <tfoot id="accPayoutFoot"></tfoot></table></div></article>`;

    const openActivityFallback = item => {
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const kind = inferDocKind(item);
      const openId = activityOpenId(item);
      const link = item.lienKet || {};
      const sc = statusClass(item);
      const actor = item.TenNV || item.TenNguoiDung || item.TenDangNhap || '—';
      const chips = [
        link.MaHDMH && docChip('invoice', link.MaHDMH, `HĐ ${link.SoHoaDon || link.MaHDMH}`),
        link.MaPO && docChip('po', link.MaPO, link.MaPO),
        link.MaPN && docChip('pn', link.MaPN, link.MaPN),
        link.MaCNPTra && docChip('cn', link.MaCNPTra, link.MaCNPTra),
        link.MaPhieu && docChip(item.BangLienQuan === 'PhieuChi' ? 'pc' : 'pcl', link.MaPhieu, link.MaPhieu),
        link.MaPT && docChip('pt', link.MaPT, link.MaPT),
        link.MaKy && docChip('payroll', link.MaKy, `Kỳ ${link.MaKy}`)
      ].filter(Boolean).join(' ');
      overlay.innerHTML = `<div class="warehouse-modal acc-detail-modal acc-detail-modal-wide">
        <div class="warehouse-modal-heading"><div>
          <p class="warehouse-kicker">CHI TIẾT VIỆC LÀM</p>
          <h2><svg class="acc-detail-icon"><use href="#${activityIcon(item.viecLam || item.HanhDong)}"></use></svg> ${esc(item.viecLam || item.HanhDong)}</h2>
          <span>${fmtDateTime(item.ThoiGian)}</span>
        </div><button class="warehouse-icon-button close" type="button">×</button></div>
        <div class="warehouse-modal-body">
          <div class="acc-detail-grid">
            <div class="acc-detail-field"><span class="acc-detail-label">Người thực hiện</span><strong>${esc(actor)}</strong></div>
            <div class="acc-detail-field"><span class="acc-detail-label">Loại chứng từ</span><strong>${esc(item.doiTuong || item.BangLienQuan || '—')}</strong></div>
            <div class="acc-detail-field"><span class="acc-detail-label">Mã chứng từ</span><strong>${esc(item.doiTuongMa || '—')}</strong></div>
            <div class="acc-detail-field"><span class="acc-detail-label">Số tiền</span><strong>${item.SoTien ? money(item.SoTien) : '—'}</strong></div>
            <div class="acc-detail-field"><span class="acc-detail-label">Trạng thái</span><span class="status-pill ${sc}">${esc(statusLabel(item))}</span></div>
            <div class="acc-detail-field"><span class="acc-detail-label">Mã giao dịch</span><strong>${esc(link.MaGiaoDichNganHang || '—')}</strong></div>
            <div class="acc-detail-field"><span class="acc-detail-label">Quỹ còn</span><strong>${link.SoTienMatCon != null || link.SoTienCKCon != null ? `TM ${money(link.SoTienMatCon)} · CK ${money(link.SoTienCKCon)}` : '—'}</strong></div>
            <div class="acc-detail-field"><span class="acc-detail-label">Nhân viên liên quan</span><strong>${esc(link.TenNV || '—')}</strong></div>
          </div>
          <div class="manager-readonly-note"><svg><use href="#${activityIcon(item.viecLam || item.HanhDong)}"></use></svg><div><strong>${esc(item.doiTuong || '')} ${esc(item.doiTuongMa || '')}</strong><span>${esc(item.giaiThich || '')}</span></div></div>
          <p>${esc(item.NoiDung || item.tieuDe || '')}</p>
          ${chips ? `<div class="doc-chip-set"><span class="acc-detail-label">Chứng từ liên quan</span><div class="doc-links">${chips}</div></div>` : ''}
        </div>
        <div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button>${kind && openId ? '<button class="warehouse-primary open-doc" type="button">Mở hồ sơ</button>' : ''}</div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => overlay.remove()));
      overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
      wireDocLinks(overlay, context);
      overlay.querySelector('.open-doc')?.addEventListener('click', () => {
        overlay.remove();
        openAccountingDoc(context, kind, openId);
      });
    };
    const openActivity = item => {
      const kind = inferDocKind(item);
      const openId = activityOpenId(item);
      if (kind && openId) return openAccountingDoc(context, kind, openId);
      return openActivityFallback(item);
    };
    const historyRowHtml = item => {
      const sc = statusClass(item);
      return `<tr data-nk="${esc(item.MaNK)}" tabindex="0" role="button" aria-label="Mở ${esc(item.viecLam || item.HanhDong)}">
        <td>${fmtDateTime(item.ThoiGian)}</td>
        <td><div class="acc-cell-flex"><svg class="acc-row-icon"><use href="#${activityIcon(item.viecLam || item.HanhDong)}"></use></svg><div><strong>${esc(item.viecLam || item.HanhDong)}</strong></div></div></td>
        <td>${esc(item.doiTuong || '')}<small>${esc(item.doiTuongMa || '')}</small></td>
        <td class="num">${item.SoTien ? money(item.SoTien) : '—'}</td>
        <td><span class="status-pill ${sc}">${esc(statusLabel(item))}</span></td>
        <td>${esc(item.giaiThich || item.NoiDung || '')}</td>
        <td><button class="warehouse-secondary" data-hist-detail="${esc(item.MaNK)}" type="button">Chi tiết</button></td>
      </tr>`;
    };
    const bindHistoryRows = (body, items) => {
      body.querySelectorAll('[data-hist-detail]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const item = items.find(row => String(row.MaNK) === button.dataset.histDetail);
          if (item) openActivity(item);
        });
      });
      body.querySelectorAll('tr[data-nk]').forEach(row => {
        row.addEventListener('click', event => {
          if (event.target.closest('button, a')) return;
          const item = items.find(entry => String(entry.MaNK) === row.dataset.nk);
          if (item) openActivity(item);
        });
        row.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          if (event.target !== row) return;
          event.preventDefault();
          const item = items.find(entry => String(entry.MaNK) === row.dataset.nk);
          if (item) openActivity(item);
        });
      });
    };

    /* ── Timeline renderer (card-based, grouped by date) ── */
    const renderTimeline = items => {
      const timeline = root.querySelector('#accTimeline');
      if (!items.length) { timeline.innerHTML = '<div class="acc-timeline-empty"><svg><use href="#i-log"></use></svg><p>Chưa có hoạt động nào trong khoảng ngày này.</p></div>'; return; }

      /* Group by date */
      const groups = {};
      items.forEach(item => {
        const d = item.ThoiGian ? new Date(item.ThoiGian) : null;
        const dateKey = d ? new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(d) : 'Không rõ ngày';
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(item);
      });

      const fmtTime = t => { const d = t ? new Date(t) : null; return d ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(d) : ''; };

      let html = '';
      for (const [dateLabel, dateItems] of Object.entries(groups)) {
        html += `<div class="acc-tl-date-group"><div class="acc-tl-date-header"><span>${esc(dateLabel)}</span><span class="acc-tl-date-count">${dateItems.length} hoạt động</span></div>`;
        html += dateItems.map(item => {
          const sc = statusClass(item);
          const emoji = activityEmoji(item.viecLam || item.HanhDong);
          const color = activityColor(item.viecLam || item.HanhDong);
          return `<div class="acc-tl-card ${sc}" data-color="${color}" data-nk="${esc(item.MaNK)}" tabindex="0" role="button" aria-label="Mở ${esc(item.viecLam || item.HanhDong)}">
            <div class="acc-tl-card-icon" data-color="${color}"><span>${emoji}</span></div>
            <div class="acc-tl-card-body">
              <div class="acc-tl-card-top">
                <strong class="acc-tl-card-title">${esc(item.viecLam || item.HanhDong)}</strong>
                <span class="acc-tl-card-status ${sc}">${esc(statusLabel(item))}</span>
              </div>
              <div class="acc-tl-card-meta">
                <span class="acc-tl-card-time">${fmtTime(item.ThoiGian)}</span>
                ${item.doiTuong ? `<span class="acc-tl-card-subject">${esc(item.doiTuong)} ${esc(item.doiTuongMa || '')}</span>` : ''}
              </div>
              <p class="acc-tl-card-desc">${esc(item.giaiThich || item.NoiDung || '')}</p>
            </div>
            ${item.SoTien ? `<div class="acc-tl-card-amount">${money(item.SoTien)}</div>` : ''}
          </div>`;
        }).join('');
        html += '</div>';
      }

      timeline.innerHTML = html;
      timeline.querySelectorAll('.acc-tl-card').forEach(card => {
        const open = () => {
          const item = items.find(row => String(row.MaNK) === card.dataset.nk);
          if (item) openActivity(item);
        };
        card.addEventListener('click', open);
        card.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          open();
        });
      });
    };

    /* ── Sort state ── */
    let sortCol = 'ThoiGian', sortAsc = false;
    const sortItems = items => {
      const arr = [...items];
      arr.sort((a, b) => {
        let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
        if (sortCol === 'ThoiGian') { va = new Date(va); vb = new Date(vb); }
        if (sortCol === 'SoTien') { va = Number(va || 0); vb = Number(vb || 0); }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      });
      return arr;
    };

    /* ── Main load ── */
    const load = async () => {
      const from = root.querySelector('#accHistFrom').value;
      const to = root.querySelector('#accHistTo').value;
      const kind = root.querySelector('#accHistKind').value;
      const search = root.querySelector('#accHistSearch').value.trim();
      const params = new URLSearchParams({ from, to, kind, search, page: String(currentPage), pageSize: String(PAGE_SIZE) });
      try {
        const [log, payouts] = await Promise.all([
          api(context, `/accounting/activity-log?${params}`),
          api(context, '/accounting/payroll-payouts')
        ]);
        lastLogData = log;

        /* Timeline (top 10 most recent) */
        renderTimeline((log.items || []).slice(0, 10));

        /* Pager */
        const totalPages = Math.ceil((log.total || (log.items || []).length) / PAGE_SIZE) || 1;
        const pager = root.querySelector('#accTimelinePager');
        if (totalPages > 1) {
          pager.innerHTML = `<div class="acc-pager"><button class="warehouse-secondary" id="accPrev" ${currentPage <= 1 ? 'disabled' : ''}>← Trước</button><span>Trang ${currentPage} / ${totalPages}</span><button class="warehouse-secondary" id="accNext" ${currentPage >= totalPages ? 'disabled' : ''}>Sau →</button></div>`;
          pager.querySelector('#accPrev')?.addEventListener('click', () => { currentPage--; load(); });
          pager.querySelector('#accNext')?.addEventListener('click', () => { currentPage++; load(); });
        } else { pager.innerHTML = ''; }

        /* Table */
        const sorted = sortItems(log.items || []);
        const body = root.querySelector('#accHistBody');
        body.innerHTML = sorted.length
          ? sorted.map(historyRowHtml).join('')
          : '<tr><td colspan="7" class="warehouse-empty"><svg class="acc-empty-icon"><use href="#i-log"></use></svg> Chưa có việc nào trong khoảng ngày này.</td></tr>';
        bindHistoryRows(body, log.items || []);

        /* Payout table */
        const payBody = root.querySelector('#accPayoutBody');
        const payItems = payouts.items || [];
        payBody.innerHTML = payItems.length
          ? payItems.map(item => `<tr data-phieu="${esc(item.MaPhieu)}" tabindex="0" role="button" aria-label="Mở phiếu ${esc(item.MaPhieu)}"><td>${fmtDateTime(item.NgayChi)}</td><td><strong>${esc(item.TenNV)}</strong><small>${esc(item.MaNV)}</small></td><td>${esc(item.MaPhieu)}<small>Kỳ ${esc(item.MaKy)}</small></td><td>${esc(item.PhuongThuc)}</td><td class="num"><strong>${money(item.SoTien)}</strong></td><td>${esc(item.MaGiaoDichNganHang || '—')}</td><td class="num">TM ${money(item.SoTienMatCon)}<small>CK ${money(item.SoTienCKCon)}</small></td><td><span class="status-pill ${item.ThanhCong ? 'ok' : 'cancelled'}">${item.ThanhCong ? 'Thành công' : 'Thất bại'}</span>${item.GhiChu ? `<small>${esc(item.GhiChu)}</small>` : ''}</td></tr>`).join('')
          : '<tr><td colspan="8" class="warehouse-empty"><svg class="acc-empty-icon"><use href="#i-log"></use></svg> Chưa chi khoản nào từ quỹ chung.</td></tr>';
        payBody.querySelectorAll('tr[data-phieu]').forEach(row => {
          const open = () => payrollVoucherDetail(context, row.dataset.phieu);
          row.addEventListener('click', open);
          row.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            open();
          });
        });
        /* Payout totals footer */
        const payFoot = root.querySelector('#accPayoutFoot');
        if (payItems.length) {
          const totalPaid = payItems.reduce((s, i) => s + Number(i.SoTien || 0), 0);
          payFoot.innerHTML = `<tr class="acc-table-footer"><td colspan="4" style="text-align:right"><strong>TỔNG CỘNG</strong></td><td class="num"><strong>${money(totalPaid)}</strong></td><td colspan="3"></td></tr>`;
        } else { payFoot.innerHTML = ''; }
      } catch (error) {
        context.showToast(error.message, 'error');
      }
    };

    /* Sort headers */
    root.querySelectorAll('.sortable').forEach(th => th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) { sortAsc = !sortAsc; } else { sortCol = col; sortAsc = true; }
      root.querySelectorAll('.sortable').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
      if (lastLogData) {
        const sorted = sortItems(lastLogData.items || []);
        const body = root.querySelector('#accHistBody');
        body.innerHTML = sorted.map(historyRowHtml).join('');
        bindHistoryRows(body, lastLogData.items || []);
      }
    }));

    root.querySelector('#accHistLoad').addEventListener('click', () => { currentPage = 1; load(); });
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
      if (pageName === 'accounting-history') return initAccountingHistory(document.querySelector('.accounting-history'), context);
      if (pageName === 'manager-payables') return initManagerPayables(document.querySelector('.warehouse-page'), context);
      if (pageName === 'manager-reports') return initStoreOperationsReports(document.querySelector('.financial-reports'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
