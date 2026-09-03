(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'cashier-shifts': '<section class="warehouse-page cashier-page"><div class="overview-loading">Đang tải ca bán hàng...</div></section>',
    'cashier-pos': '<section class="warehouse-page cashier-page cashier-pos-page"><div class="overview-loading">Đang mở quầy bán hàng...</div></section>',
    'cashier-customers': '<section class="warehouse-page cashier-page"><div class="overview-loading">Đang tải khách hàng...</div></section>',
    'cashier-invoices': '<section class="warehouse-page cashier-page"><div class="overview-loading">Đang tải hóa đơn...</div></section>',
    'cashier-returns': '<section class="warehouse-page cashier-page"><div class="overview-loading">Đang tải đổi trả...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const unaccent = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const fmtTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const heading = (kicker, title, subtitle, action = '') => `<header class="warehouse-heading"><div><p class="warehouse-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</header>`;
  const avatar = text => window.FLY_UI?.avatar(text) || '';
  const productPhoto = (item, className = '') => window.FLY_PRODUCT_IMAGES?.markup(item, { className }) || avatar(item?.TenSP || item?.MaSP || 'SP');
  const person = (name, sub = '') => window.FLY_UI?.person(name, sub) || `<strong>${esc(name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  const api = async (context, path, options = {}) => {
    const response = await fetch(`${context.apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) }
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) {
      const fallback = response.status === 404
        ? 'Máy chủ chưa có chức năng này. Hãy đóng hẳn ứng dụng rồi chạy lại npm start.'
        : `Không thể xử lý yêu cầu (${response.status}).`;
      throw new Error(data.message || fallback);
    }
    return data;
  };
  const statusClass = status => ({
    'Đang mở': 'ok', 'Hoàn thành': 'ok', 'Nháp': 'draft', 'Đã hủy': 'cancelled', 'Thành công': 'ok',
    'Thất bại': 'cancelled', 'Chờ kiểm tra': 'sent', 'Chờ duyệt': 'sent', 'Đã duyệt': 'ok', 'Từ chối': 'cancelled',
    'Đang đổi trả': 'sent', 'Hoàn một phần': 'returned', 'Đã hoàn hết': 'cancelled', 'Đã đổi hàng': 'returned',
    'Đổi và hoàn': 'returned', 'Có đổi trả': 'returned'
  }[status] || 'draft');
  const invoiceReturnView = item => {
    const tickets = Number(item?.SoPhieuDoiTra || 0);
    if (!tickets) return null;
    const pending = Number(item.SoPhieuDangXuLy || 0);
    const refunded = Number(item.TienDaHoan || 0);
    const exchanged = Number(item.SoPhieuDoiHang || 0);
    const soldQty = Number(item.SLBan || 0);
    const returnedQty = Number(item.SLDaTra || 0);
    const paid = Number(item.TongThanhToan || 0);
    const remaining = Math.max(0, paid - refunded);
    const fullRefund = soldQty > 0 && returnedQty >= soldQty && refunded > 0 && remaining <= 0;
    let label = 'Có đổi trả';
    let tone = 'returned';
    if (pending) { label = 'Đang đổi trả'; tone = 'sent'; }
    else if (fullRefund) { label = 'Đã hoàn hết'; tone = 'cancelled'; }
    else if (exchanged && refunded > 0) { label = 'Đổi và hoàn'; tone = 'returned'; }
    else if (exchanged) { label = 'Đã đổi hàng'; tone = 'returned'; }
    else if (refunded > 0) { label = 'Hoàn một phần'; tone = 'returned'; }
    return { label, tone, tickets, pending, refunded, exchanged, soldQty, returnedQty, paid, remaining, fullRefund };
  };
  const invoiceStatusHtml = item => {
    const view = invoiceReturnView(item);
    const pills = [`<span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span>`];
    if (view) pills.push(`<span class="status-pill ${view.tone}">${esc(view.label)}</span>`);
    return `<div class="cashier-invoice-status">${pills.join('')}</div>`;
  };
  const invoiceAmountCell = item => {
    const view = invoiceReturnView(item);
    if (!view) return `<td class="num">${money(item.TongThanhToan)}</td>`;
    const extra = view.fullRefund
      ? `Đã hoàn hết ${money(view.refunded)}`
      : view.refunded > 0
        ? `Đã hoàn ${money(view.refunded)} · Còn ${money(view.remaining)}`
        : view.exchanged
          ? 'Đã đổi hàng · không hoàn tiền'
          : view.pending
            ? `${view.pending} phiếu đang xử lý`
            : `${view.tickets} phiếu đổi trả`;
    return `<td class="num cashier-invoice-amount${view.fullRefund ? ' is-fully-refunded' : ''}"><strong>${money(item.TongThanhToan)}</strong><small>${esc(extra)}</small></td>`;
  };
  const printInvoice = detail => {
    const inv = detail.invoice || {};
    const paid = (detail.payments || []).filter(item => item.TrangThai === 'Thành công');
    const fields = [
      { label: 'Thu ngân', value: inv.TenNV },
      { label: 'Ca bán', value: inv.MaCa || '—' },
      { label: 'Khách hàng', value: inv.TenKH || 'Khách vãng lai' },
      { label: 'Điện thoại', value: inv.SDT || 'Không SĐT' }
    ];
    if (paid.length) {
      fields.push({ label: 'Thanh toán', value: paid.map(item => `${item.PhuongThuc} ${money(item.SoTien)}`).join(', ') });
    }
    window.FLY_PRINT?.show({
      title: 'HÓA ĐƠN BÁN HÀNG',
      number: inv.MaHD,
      documentDate: inv.NgayLap,
      status: inv.TrangThai,
      fields,
      columns: [
        { key: 'TenSP', label: 'Sản phẩm' },
        { key: 'SoLuong', label: 'SL', align: 'right' },
        { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
        { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
      ],
      rows: detail.lines,
      totals: [
        { label: 'Tiền hàng', value: inv.TongTienHang, format: 'money' },
        { label: 'Giảm giá', value: inv.TienGiamGia, format: 'money' },
        { label: 'Điểm quy đổi', value: inv.TienDiemQuyDoi, format: 'money' },
        { label: 'Tổng thanh toán', value: inv.TongThanhToan, format: 'money' }
      ],
      note: 'Bản in hóa đơn gốc lúc bán. Đổi trả sau này in trên phiếu DT riêng, không sửa chứng từ này.',
      signatures: ['Thu ngân', 'Khách hàng']
    });
  };
  const printableReturns = detail => (detail.returns || []).filter(item => !['Đã hủy', 'Từ chối'].includes(item.TrangThai));
  const chooseSaleDocument = detail => new Promise(resolve => {
    const tickets = printableReturns(detail);
    const inv = detail.invoice || {};
    if (!tickets.length) return resolve('invoice');
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal warehouse-confirm-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">IN / LƯU PDF</p><h2>Chọn đúng 1 chứng từ</h2></div><button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><p class="cashier-payment-help">Hóa đơn gốc và phiếu đổi trả là hai chứng từ riêng. Một lần chỉ in hoặc lưu một bản; trên bản xem trước còn chọn mẫu hệ thống hoặc giấy trắng mực đen.</p><div class="print-doc-choices">${[`<label class="print-doc-choice"><input type="radio" name="printDocKind" value="invoice" checked><span><strong>Hóa đơn gốc ${esc(inv.MaHD)}</strong><small>Lúc bán · ${money(inv.TongThanhToan)}</small></span></label>`, ...tickets.map(ticket => `<label class="print-doc-choice"><input type="radio" name="printDocKind" value="${esc(ticket.MaDT)}"><span><strong>${esc(ticket.HinhThucXuLy)} ${esc(ticket.MaDT)}</strong><small>${esc(ticket.TrangThai)} · hoàn ${money(ticket.SoTienHoan)}</small></span></label>`)].join('')}</div></div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Hủy</button><button type="button" class="warehouse-primary confirm-print">Xem bản in</button></div></div>`;
    document.body.appendChild(overlay);
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => finish(null)));
    overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
    overlay.querySelector('.confirm-print').addEventListener('click', () => {
      finish(overlay.querySelector('input[name="printDocKind"]:checked')?.value || 'invoice');
    });
  });
  const printSaleDocument = async (context, detail) => {
    const choice = await chooseSaleDocument(detail);
    if (!choice) return;
    if (choice === 'invoice') return printInvoice(detail);
    printReturnTicket(await api(context, `/cashier/returns/${choice}`));
  };
  const printReturnTicket = detail => {
    const ticket = detail.ticket || {};
    const restocked = /ược nhập lại kho/i.test(ticket.KetQuaKiemTra || '') && !/không nhập lại/i.test(ticket.KetQuaKiemTra || '');
    const hangDiDau = restocked
      ? 'Nhập lại kho bán (cộng tồn)'
      : /không nhập lại/i.test(ticket.KetQuaKiemTra || '')
        ? 'Loại bỏ / vứt — không cộng tồn (đã trừ lúc bán)'
        : (ticket.KetQuaKiemTra || 'Chưa kiểm kho');
    const rows = (detail.lines || []).map(line => ({
      ...line,
      Nhom: line.LoaiDong || 'Hàng khách trả'
    }));
    window.FLY_PRINT?.show({
      title: ticket.HinhThucXuLy === 'Hoàn tiền' ? 'PHIẾU HOÀN TIỀN' : 'PHIẾU ĐỔI HÀNG',
      number: ticket.MaDT,
      documentDate: ticket.NgayHoan || ticket.NgayLap,
      status: ticket.TrangThai,
      fields: [
        { label: 'Hóa đơn gốc', value: ticket.MaHD },
        { label: 'Ngày bán gốc', value: ticket.NgayHoaDon ? fmtTime(ticket.NgayHoaDon) : '—' },
        { label: 'Khách hàng', value: ticket.TenKH || 'Khách vãng lai' },
        { label: 'Thu ngân lập phiếu', value: ticket.NguoiLap },
        { label: 'Thu ngân bán gốc', value: ticket.ThuNganGoc || '—' },
        { label: 'Hình thức', value: ticket.HinhThucXuLy },
        { label: 'Lý do', value: ticket.LyDo || '—' },
        { label: 'Thủ kho kiểm', value: ticket.NguoiKiemTra || '—' },
        { label: 'Quản lý duyệt', value: ticket.NguoiDuyet || '—' },
        { label: 'Hàng đi đâu', value: hangDiDau }
      ],
      columns: [
        { key: 'Nhom', label: 'Loại dòng' },
        { key: 'TenSP', label: 'Sản phẩm' },
        { key: 'SoLuong', label: 'SL', align: 'right' },
        { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
        { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
      ],
      rows,
      totals: [
        { label: 'Số tiền hoàn', value: ticket.SoTienHoan, format: 'money' }
      ],
      note: `Phiếu ${ticket.MaDT} độc lập với hóa đơn bán ${ticket.MaHD}. ${hangDiDau}. In hóa đơn gốc để xem bản lúc thanh toán.`,
      signatures: ['Thu ngân', 'Khách hàng']
    });
  };
  const openInvoiceDetail = async (context, maHD) => {
    const detail = await api(context, `/cashier/invoices/${maHD}`);
    const inv = detail.invoice;
    const view = invoiceReturnView(inv);
    const returns = detail.returns || [];
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HÓA ĐƠN GỐC LÚC BÁN</p><h2>${esc(inv.MaHD)}</h2></div><button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body">${view ? `<p class="cashier-invoice-reprint-note"><strong>Hóa đơn gốc không bị thay.</strong> ${esc(inv.MaHD)} vẫn ${esc(inv.TrangThai)}, tổng lúc bán ${money(inv.TongThanhToan)}. Nhãn ${esc(view.label)} và tiền hoàn nằm trên phiếu đổi trả in riêng.</p>` : ''}<div class="return-source-card"><div><span>KHÁCH</span><strong>${esc(inv.TenKH || 'Khách vãng lai')}</strong><small>${esc(inv.SDT || 'Không SĐT')}</small></div><div><span>NGÀY BÁN</span><strong>${fmtTime(inv.NgayLap)}</strong></div><div><span>TỔNG LÚC BÁN</span><strong>${money(inv.TongThanhToan)}</strong></div><div><span>ĐỔI TRẢ SAU BÁN</span><strong>${view ? esc(view.label) : 'Không'}</strong>${view && view.refunded ? `<small>Đã hoàn ${money(view.refunded)} · còn ${money(view.remaining)}</small>` : ''}</div></div><p class="warehouse-kicker">DÒNG HÀNG LÚC THANH TOÁN</p><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>SL BÁN</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${(detail.lines || []).map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('')}</tbody></table></div>${returns.length ? `<div class="cashier-invoice-detail-returns"><p class="warehouse-kicker">PHIẾU ĐỔI TRẢ — IN RIÊNG, KHÔNG THAY HÓA ĐƠN GỐC</p><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU</th><th>HÌNH THỨC</th><th>SỐ TIỀN HOÀN</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>${returns.map(ticket => `<tr><td><strong>${esc(ticket.MaDT)}</strong><small>${fmtTime(ticket.NgayLap)}</small></td><td>${esc(ticket.HinhThucXuLy)}</td><td class="num">${money(ticket.SoTienHoan)}</td><td><span class="status-pill ${statusClass(ticket.TrangThai)}">${esc(ticket.TrangThai)}</span></td><td><button type="button" class="warehouse-secondary" data-print-return="${esc(ticket.MaDT)}">In phiếu</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}</div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Đóng</button>${inv.TrangThai === 'Hoàn thành' ? `<button type="button" class="warehouse-primary" data-print-original>In / lưu PDF</button><button type="button" class="warehouse-secondary" data-open-returns="${esc(inv.MaHD)}">Mở đổi trả</button>` : ''}</div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('[data-print-original]')?.addEventListener('click', () => printSaleDocument(context, detail));
    overlay.querySelectorAll('[data-print-return]').forEach(button => button.addEventListener('click', async () => {
      try { printReturnTicket(await api(context, `/cashier/returns/${button.dataset.printReturn}`)); }
      catch (error) { context.showToast(error.message, 'error'); }
    }));
    overlay.querySelector('[data-open-returns]')?.addEventListener('click', () => {
      sessionStorage.setItem('fly_return_invoice', inv.MaHD);
      close();
      context.navigate('cashier-returns');
    });
  };

  const customerEditor = (context, existing, onDone) => {
    const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HỒ SƠ THÀNH VIÊN</p><h2>${existing ? esc(existing.TenKH) : 'Thêm khách hàng'}</h2></div><button type="button" class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-form-grid"><div class="warehouse-field"><label>Tên khách *</label><input id="khName" value="${esc(existing?.TenKH || '')}"></div><div class="warehouse-field"><label>Số điện thoại</label><input id="khPhone" value="${esc(existing?.SDT || '')}"></div><div class="warehouse-field"><label>Email</label><input id="khEmail" value="${esc(existing?.Email || '')}"></div><div class="warehouse-field"><label>Địa chỉ</label><input id="khAddress" value="${esc(existing?.DiaChi || '')}"></div></div>${existing ? `<p class="cashier-payment-help">Điểm ${existing.DiemTichLuy} · Hạng ${esc(existing.HangThanhVien)}. Thu ngân không được sửa điểm.</p>` : ''}</div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Hủy</button><button type="button" class="warehouse-primary save">Lưu</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('.save').addEventListener('click', async () => {
      const payload = { TenKH: overlay.querySelector('#khName').value, SDT: overlay.querySelector('#khPhone').value, Email: overlay.querySelector('#khEmail').value, DiaChi: overlay.querySelector('#khAddress').value };
      try {
        const result = existing
          ? await api(context, `/cashier/customers/${existing.MaKH}`, { method: 'PUT', body: JSON.stringify(payload) })
          : await api(context, '/cashier/customers', { method: 'POST', body: JSON.stringify(payload) });
        context.showToast(result.message, 'success'); close(); await onDone(result);
      } catch (error) { context.showToast(error.message, 'error'); }
    });
  };

  const openShiftModal = (context, onDone) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal warehouse-confirm-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CA BÁN HÀNG CÁ NHÂN</p><h2>Mở ca làm việc</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="cashier-opening-rule"><svg><use href="#i-lock"/></svg><div><strong>Chấm công vào trước, rồi mới mở ca</strong><p>Chỉ thu ngân ca chính 8 giờ được mở quầy. Tăng cường 4 giờ không mở ca POS.</p></div></div><div class="warehouse-field"><label>Tiền mặt đầu ca *</label><div class="cashier-money-input"><input id="openingCash" type="number" min="0" step="1000" value="1000000"><span>đ</span></div></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary confirm-open">Xác nhận mở ca</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('.confirm-open').addEventListener('click', async () => {
      try {
        const result = await api(context, '/cashier/shifts/open', { method: 'POST', body: JSON.stringify({ TienDauCa: Number(overlay.querySelector('#openingCash').value) }) });
        context.showToast(result.message, 'success'); close(); await onDone();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
  };

  const closeShiftModal = async (context, onDone) => {
    try {
      const summary = await api(context, '/cashier/shifts/current/summary');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐÓNG CA &amp; BÀN GIAO</p><h2>${esc(summary.MaCa)}</h2></div><button type="button" class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-stats"><article><span>QUỸ ĐẦU CA</span><strong>${money(summary.TienDauCa)}</strong></article><article><span>TIỀN MẶT THU</span><strong>${money(summary.TongTienMat)}</strong></article><article><span>CHUYỂN KHOẢN</span><strong>${money(summary.TongTienChuyenKhoan)}</strong></article><article><span>QR</span><strong>${money(summary.TongTienQR)}</strong></article><article><span>THẺ</span><strong>${money(summary.TongTienThe)}</strong></article><article><span>HOÀN TIỀN MẶT</span><strong>${money(summary.TongTienHoanMat)}</strong></article></div><p class="cashier-payment-help">Tiền mặt vào két = quỹ đầu ca + tiền mặt thu − hoàn tiền mặt = <strong>${money(summary.TienMatTrongKet)}</strong>. Số bàn giao Kế toán (không gồm quỹ đầu ca) = <strong>${money(summary.TienMatHeThong)}</strong>. QR/thẻ/chuyển khoản không đưa vào két.</p><div class="warehouse-field"><label>Tổng tiền mặt thực tế trong két cuối ca *</label><div class="cashier-money-input"><input id="closingCash" type="number" min="0" step="1000" value="${Number(summary.TienMatTrongKet || 0)}"><span>đ</span></div><small>Phải ≥ quỹ đầu ca ${money(summary.TienDauCa)}.</small></div></div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Hủy</button><button type="button" class="warehouse-primary confirm-close">Đóng ca</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.confirm-close').addEventListener('click', async () => {
        try {
          const result = await api(context, '/cashier/shifts/close', { method: 'POST', body: JSON.stringify({ TienCuoiCa: Number(overlay.querySelector('#closingCash').value) }) });
          context.showToast(`${result.message} Chênh lệch ${money(result.ChenhLech)}.`, Number(result.ChenhLech) ? 'error' : 'success');
          close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initShifts = async (root, context) => {
    const load = async () => {
      try {
        const data = await api(context, '/cashier/shifts');
        const current = data.current;
        const duty = data.duty || {};
        const live = current ? await api(context, '/cashier/shifts/current/summary').catch(() => current) : null;
        const s = live || current;
        const dutyNote = duty.message
          ? `<div class="cashier-duty-note"><svg><use href="#i-clock"/></svg><div><strong>Khung giờ ca đã công bố</strong><p>${esc(duty.message)}</p></div></div>`
          : '';
        const openDisabled = duty.canOpenShift === false && !current;
        root.innerHTML = `${heading('THU NGÂN / CA BÁN HÀNG', 'Mở ca và sẵn sàng tại quầy', 'Phải đúng lịch đã công bố, trong khung giờ ca (sớm tối đa 10 phút). Hết giờ ca thì không vào lại, không bán tiếp.')}${dutyNote}${current ? `<article class="cashier-active-shift"><div class="cashier-shift-copy"><span class="cashier-live"><i></i> CA ĐANG MỞ</span><h2>${esc(current.MaCa)}</h2><p>Ca của <strong>${esc(current.TenNV)}</strong> bắt đầu lúc ${fmtTime(current.ThoiGianBatDau)}.</p><div class="cashier-shift-metrics"><div><span>QUỸ ĐẦU CA</span><strong>${money(s.TienDauCa)}</strong></div><div><span>TIỀN MẶT THU</span><strong>${money(s.TongTienMat)}</strong></div><div><span>CHUYỂN KHOẢN</span><strong>${money(s.TongTienChuyenKhoan)}</strong></div><div><span>QR / THẺ</span><strong>${money(Number(s.TongTienQR || 0) + Number(s.TongTienThe || 0))}</strong></div><div><span>KÉT DỰ KIẾN</span><strong>${money(s.TienMatTrongKet)}</strong></div><div><span>DOANH THU HÓA ĐƠN</span><strong>${money(s.DoanhThuHoaDon)}</strong></div><div><span>TIỀN HOÀN</span><strong>${money(s.TienHoan)}</strong></div><div><span>LÃI GỘP CA</span><strong>${money(s.LoiNhuanGop)}</strong></div></div><div class="gross-profit-steps"><div class="step"><div><span>DOANH THU HÓA ĐƠN</span><strong>${money(s.DoanhThuHoaDon)}</strong></div><b>−</b><div><span>TIỀN HOÀN</span><strong>${money(s.TienHoan)}</strong></div><b>=</b><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div></div><div class="step"><div><span>GIÁ VỐN HÓA ĐƠN</span><strong>${money(s.GiaVonHoaDon)}</strong></div><b>−</b><div><span>GV HÀNG TRẢ NHẬP LẠI</span><strong>${money(s.GiaVonHangTraNhapLai)}</strong></div><b>+</b><div><span>GV HÀNG GIAO ĐỔI</span><strong>${money(s.GiaVonHangGiaoDoi)}</strong></div><b>=</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div></div><div class="step"><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div><b>−</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div><b>=</b><div class="result"><span>LỢI NHUẬN GỘP</span><strong>${money(s.LoiNhuanGop)}</strong></div></div></div></div><div class="cashier-next-step"><strong>${duty.canSell ? 'Đã sẵn sàng bán hàng' : 'Không bán ngoài giờ ca'}</strong><p>${duty.canSell ? 'Tiền mặt cộng vào két (quỹ đầu ca + thu TM − hoàn TM). CK/QR/thẻ không vào két. Hóa đơn nháp phải hoàn thành hoặc hủy trước khi đóng ca.' : esc(duty.message || 'Hết giờ ca — không lập hóa đơn thêm. Hãy đóng ca.')}</p>${duty.canSell ? '<button type="button" class="warehouse-primary" id="goPos">Vào màn hình bán hàng</button>' : ''}<button type="button" class="warehouse-secondary" id="closeShift">Đóng ca &amp; bàn giao</button></div></article>` : `<article class="cashier-open-shift"><div><p class="warehouse-kicker">BƯỚC 1 · TRƯỚC KHI BÁN HÀNG</p><h2>Chưa có ca bán hàng đang mở</h2><p>${esc(duty.message || 'Nếu không mở được ca: kiểm tra Lịch làm việc — hôm nay phải có ca chính đã công bố, đúng khung giờ, và đã chấm công vào.')}</p><button type="button" class="warehouse-primary" id="openShift" ${openDisabled ? 'disabled' : ''}>Mở ca bán hàng</button></div></article>`}<article class="warehouse-table-card cashier-history"><div class="warehouse-panel-title"><div><p>LỊCH SỬ CÁ NHÂN</p><h2>Các ca gần đây</h2></div><button type="button" class="warehouse-secondary" id="refreshShifts">Làm mới</button></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>MÃ CA</th><th>BẮT ĐẦU</th><th>KẾT THÚC</th><th>QUỸ ĐẦU CA</th><th>HÓA ĐƠN</th><th>DOANH THU</th><th>TRẠNG THÁI</th></tr></thead><tbody>${data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaCa)}</strong></td><td>${fmtTime(item.ThoiGianBatDau)}</td><td>${fmtTime(item.ThoiGianKetThuc)}</td><td class="num">${money(item.TienDauCa)}</td><td class="num">${item.SoHoaDon}</td><td class="num"><strong>${money(item.DoanhThu)}</strong></td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Chưa có lịch sử ca bán hàng.</td></tr>'}</tbody></table></div></article>`;
        root.querySelector('#openShift')?.addEventListener('click', () => openShiftModal(context, load));
        root.querySelector('#goPos')?.addEventListener('click', () => context.navigate('cashier-pos'));
        root.querySelector('#closeShift')?.addEventListener('click', () => closeShiftModal(context, load));
        root.querySelector('#refreshShifts').addEventListener('click', load);
      } catch (error) { context.showToast(error.message, 'error'); root.innerHTML = `<div class="welcome-card"><h2>Không tải được ca bán hàng</h2><p>${esc(error.message)}</p></div>`; }
    };
    await load();
  };

  const initPos = async (root, context) => {
    let catalog; let currentShift = null; let customer = null; let cart = new Map(); let maKM = ''; let diemSuDung = 0; let quote = null; let draftId = null; let searchQuery = ''; let categoryFilter = '';
    try {
      const [catalogData, shiftData] = await Promise.all([api(context, '/cashier/pos/catalog'), api(context, '/cashier/shifts')]);
      const duty = shiftData.duty || {};
      if (!shiftData.current || duty.canSell === false) {
        throw new Error(duty.message || 'Bạn phải mở ca bán hàng trong khung giờ ca đã công bố trước khi vào POS.');
      }
      catalog = catalogData;
      currentShift = shiftData.current;
    } catch (error) {
      root.innerHTML = `<div class="welcome-card"><h2>Chưa thể mở POS</h2><p>${esc(error.message)}</p><button class="warehouse-primary" id="goShift">Mở ca bán hàng</button></div>`;
      root.querySelector('#goShift')?.addEventListener('click', () => context.navigate('cashier-shifts'));
      return;
    }
    const linesPayload = () => [...cart.values()].map(item => ({ MaSP: item.MaSP, SoLuong: Number(item.SoLuong) }));
    const cartTotal = () => [...cart.values()].reduce((sum, line) => sum + Number(line.GiaBan) * Number(line.SoLuong), 0);
    const payableAmount = () => Math.round(Number(quote?.TongThanhToan ?? cartTotal()));
    const refreshQuote = async (showError = false) => {
      if (!cart.size) { quote = null; return; }
      try {
        quote = await api(context, '/cashier/invoices/quote', { method: 'POST', body: JSON.stringify({ MaKH: customer?.MaKH || null, MaKM: maKM || null, DiemSuDung: Number(diemSuDung) || 0, lines: linesPayload() }) });
      } catch (error) {
        quote = null;
        if (showError) context.showToast(error.message, 'error');
      }
    };
    const pickCustomer = () => {
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">KHÁCH HÀNG THÀNH VIÊN</p><h2>Chọn vào hóa đơn</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-field"><input id="customerSearch" placeholder="Tìm tên hoặc số điện thoại..."></div><div id="customerResults" class="cashier-customer-results"></div><p class="cashier-payment-help">Khách vãng lai không bắt buộc có hồ sơ. Thu ngân không được sửa điểm.</p></div><div class="warehouse-modal-actions"><button class="warehouse-secondary walk-in">Khách vãng lai</button><button class="warehouse-primary create-member">Tạo thành viên mới</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      const renderList = items => {
        overlay.querySelector('#customerResults').innerHTML = items.length ? items.map(item => `<button type="button" class="cashier-customer-hit" data-id="${esc(item.MaKH)}">${avatar(item.TenKH)}<span><strong>${esc(item.TenKH)}</strong><small>${esc(item.SDT || '—')} · ${esc(item.HangThanhVien)} · ${item.DiemTichLuy} điểm</small></span></button>`).join('') : '<div class="warehouse-empty">Không tìm thấy. Có thể tạo thành viên mới.</div>';
      };
      let customerSearchVersion = 0;
      const runCustomerSearch = (window.FLY_SEARCH?.debounce || ((handler, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => handler(...args), delay); }; }))(async (query, version) => {
        try {
          const items = (await api(context, `/cashier/customers?search=${encodeURIComponent(query)}`)).items;
          if (version === customerSearchVersion && overlay.isConnected) renderList(items);
        } catch (error) {
          if (version === customerSearchVersion) context.showToast(error.message, 'error');
        }
      }, 250);
      overlay.querySelector('#customerSearch').addEventListener('input', event => {
        const query = event.target.value.trim();
        const version = ++customerSearchVersion;
        if (!query) return renderList([]);
        runCustomerSearch(query, version);
      });
      overlay.addEventListener('click', async event => {
        const hit = event.target.closest('[data-id]');
        if (!hit) return;
        const result = await api(context, `/cashier/customers?search=${encodeURIComponent(hit.dataset.id)}`);
        customer = result.items[0] || null; diemSuDung = 0; close(); await refreshQuote(); render();
      });
      overlay.querySelector('.walk-in').addEventListener('click', async () => { customer = null; diemSuDung = 0; close(); await refreshQuote(); render(); });
      overlay.querySelector('.create-member').addEventListener('click', () => {
        close();
        customerEditor(context, null, async created => {
          const refreshed = await api(context, `/cashier/customers?search=${encodeURIComponent(created.MaKH)}`);
          customer = refreshed.items[0] || null; diemSuDung = 0; await refreshQuote(); render();
        });
      });
    };
    const render = () => {
      const products = catalog.products;
      const payable = payableAmount();
      root.innerHTML = `${heading('BÁN HÀNG TẠI QUẦY', 'Lập hóa đơn và thanh toán', 'Chọn danh mục, quét mã hoặc bấm sản phẩm. Hóa đơn chỉ hoàn thành sau khi thanh toán đủ.', '<button class="warehouse-secondary" id="backShift">Quay lại ca</button>')}
        <section class="cashier-pos-layout">
          <article class="warehouse-table-card cashier-product-panel">
            <div class="warehouse-panel-title"><div><p>SẢN PHẨM</p><h2>Quét mã hoặc tìm kiếm</h2></div><input id="posSearch" type="search" value="${esc(searchQuery)}" placeholder="Mã vạch, mã hoặc tên sản phẩm"></div>
            <div class="pos-category-bar"><button type="button" class="pos-chip ${categoryFilter ? '' : 'active'}" data-cat="">Tất cả</button>${[...new Set(products.map(item => item.TenDM).filter(Boolean))].map(name => `<button type="button" class="pos-chip ${categoryFilter === name ? 'active' : ''}" data-cat="${esc(name)}">${esc(name)}</button>`).join('')}</div>
            <div class="cashier-product-grid">${products.map(item => `<button type="button" class="cashier-product" data-id="${esc(item.MaSP)}" data-cat="${esc(item.TenDM || '')}" data-search="${esc(unaccent(`${item.MaSP} ${item.MaVach || ''} ${item.TenSP} ${item.TenDM || ''}`))}" ${Number(item.SLTon) <= 0 ? 'disabled' : ''}>${productPhoto(item, 'pos-product-photo')}<div class="cashier-product-copy"><strong>${esc(item.TenSP)}</strong><span>${money(item.GiaBan)}</span><small>${esc(item.TenDM || item.MaSP)} · còn ${item.SLTon} ${esc(item.DonViTinh)}</small><div class="pos-stock ${Number(item.SLTon) <= 5 ? 'low' : ''}"><i style="width:${Math.max(8, Math.min(100, Number(item.SLTon) * 5))}%"></i></div></div></button>`).join('')}</div>
            <p class="cashier-search-empty" id="posEmpty" hidden>Không tìm thấy sản phẩm khớp. Thử mã vạch, mã SP hoặc một phần tên (không cần dấu).</p>
          </article>
          <article class="warehouse-table-card cashier-cart-panel">
            <div class="warehouse-panel-title"><div><p>${draftId ? `NHÁP ${esc(draftId)}` : 'HÓA ĐƠN NHÁP'}</p><h2>Giỏ hàng</h2></div><span class="status-pill draft">${cart.size} mặt hàng</span></div>
            <div class="cashier-customer-row"><div class="cashier-customer-who">${avatar(customer?.TenKH || 'K')}<div><strong>${customer ? esc(customer.TenKH) : 'Khách vãng lai'}</strong><small>${customer ? `${esc(customer.SDT || '')} · ${esc(customer.HangThanhVien)} · ${customer.DiemTichLuy} điểm` : 'Không tích điểm'}</small></div></div><button class="warehouse-secondary" id="selectCustomer">Chọn khách</button></div>
            <div class="cashier-pos-extras"><label>Khuyến mãi<select id="promoSelect"><option value="">Không áp dụng</option>${(catalog.promotions || []).map(item => `<option value="${esc(item.MaKM)}" ${maKM === item.MaKM ? 'selected' : ''}>${esc(item.TenKM)}</option>`).join('')}</select></label>${customer ? `<label>Dùng điểm<input id="pointInput" type="number" min="0" max="${customer.DiemTichLuy}" value="${diemSuDung}"></label>` : ''}</div>
            ${(catalog.promotions || []).length ? '' : '<small class="cashier-quote-break">Chưa có KM hiệu lực. Quản lý tạo/ngừng chương trình ở menu Khuyến mãi (UC04).</small>'}
            <div class="cashier-cart-lines">${cart.size ? [...cart.values()].map(line => `<div class="cashier-cart-line">${productPhoto(line, 'cart-product-photo')}<div><strong>${esc(line.TenSP)}</strong><small>${money(line.GiaBan)} × ${line.SoLuong}</small></div><div class="cashier-cart-qty"><button data-action="minus" data-id="${line.MaSP}">−</button><span>${line.SoLuong}</span><button data-action="plus" data-id="${line.MaSP}">+</button></div><strong>${money(Number(line.GiaBan) * line.SoLuong)}</strong></div>`).join('') : '<div class="warehouse-empty">Quét hoặc chọn sản phẩm để bắt đầu.</div>'}</div>
            <div class="cashier-cart-total"><span>PHẢI THANH TOÁN</span><strong>${money(payable)}</strong></div>
            ${quote ? `<small class="cashier-quote-break">Tiền hàng ${money(quote.TongTienHang)} · Giảm ${money(quote.TienGiamGia)} · Điểm ${money(quote.TienDiemQuyDoi)}</small>` : ''}
            <div class="cashier-pos-actions"><button type="button" class="warehouse-secondary" id="saveDraft" ${cart.size ? '' : 'disabled'}>Lưu nháp</button>${draftId ? '<button type="button" class="warehouse-danger" id="cancelDraft">Hủy nháp</button>' : ''}<button type="button" class="warehouse-primary cashier-checkout" id="checkout" ${cart.size ? '' : 'disabled'}><svg><use href="#i-cash"/></svg>Thanh toán</button></div>
          </article>
        </section>`;
      const addProduct = async product => {
        if (!product) return;
        const next = (cart.get(product.MaSP)?.SoLuong || 0) + 1;
        if (next > Number(product.SLTon)) return context.showToast('Số lượng vượt tồn khả dụng.', 'error');
        cart.set(product.MaSP, { ...product, SoLuong: next }); await refreshQuote(); render();
      };
      const applySearch = () => {
        const query = unaccent(searchQuery);
        let visible = 0;
        root.querySelectorAll('.cashier-product').forEach(button => {
          const show = (!query || button.dataset.search.includes(query)) && (!categoryFilter || button.dataset.cat === categoryFilter);
          button.hidden = !show;
          if (show) visible += 1;
        });
        const empty = root.querySelector('#posEmpty');
        if (empty) empty.hidden = !query || visible > 0;
      };
      root.querySelector('#backShift').addEventListener('click', () => context.navigate('cashier-shifts'));
      root.querySelectorAll('.cashier-product').forEach(button => button.addEventListener('click', () => addProduct(products.find(item => item.MaSP === button.dataset.id))));
      root.querySelectorAll('.pos-chip').forEach(chip => chip.addEventListener('click', () => {
        categoryFilter = chip.dataset.cat || '';
        root.querySelectorAll('.pos-chip').forEach(item => item.classList.toggle('active', item === chip));
        applySearch();
      }));
      const searchBox = root.querySelector('#posSearch');
      searchBox.addEventListener('input', event => { searchQuery = event.target.value; applySearch(); });
      searchBox.addEventListener('keydown', async event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const raw = searchQuery.trim();
        if (!raw) return;
        const needle = unaccent(raw);
        const exact = products.find(item => item.MaVach === raw || item.MaSP === raw || unaccent(item.MaVach || '') === needle || unaccent(item.MaSP) === needle);
        if (exact) { searchQuery = ''; await addProduct(exact); }
        else applySearch();
      });
      applySearch();
      if (!cart.size) searchBox.focus();
      root.querySelectorAll('.cashier-cart-qty button').forEach(button => button.addEventListener('click', async () => {
        const line = cart.get(button.dataset.id);
        if (button.dataset.action === 'minus') line.SoLuong -= 1;
        else if (line.SoLuong < Number(line.SLTon)) line.SoLuong += 1;
        if (line.SoLuong <= 0) cart.delete(line.MaSP); else cart.set(line.MaSP, line);
        await refreshQuote(); render();
      }));
      root.querySelector('#selectCustomer').addEventListener('click', pickCustomer);
      root.querySelector('#promoSelect')?.addEventListener('change', async event => { maKM = event.target.value; await refreshQuote(); render(); });
      root.querySelector('#pointInput')?.addEventListener('change', async event => {
        diemSuDung = Math.max(0, Number(event.target.value) || 0);
        await refreshQuote(); render();
      });
      root.querySelector('#saveDraft')?.addEventListener('click', async () => {
        try {
          if (draftId) return context.showToast(`Hóa đơn nháp ${draftId} đã được lưu.`, 'success');
          const invoice = await api(context, '/cashier/invoices', { method: 'POST', body: JSON.stringify({ MaKH: customer?.MaKH || null, MaKM: maKM || null, DiemSuDung: Number(diemSuDung) || 0, lines: linesPayload() }) });
          draftId = invoice.MaHD; context.showToast(invoice.message, 'success'); render();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      root.querySelector('#cancelDraft')?.addEventListener('click', async () => {
        try {
          await api(context, `/cashier/invoices/${draftId}/cancel`, { method: 'POST', body: JSON.stringify({ LyDo: 'Hủy hóa đơn nháp tại quầy' }) });
          draftId = null; context.showToast('Đã hủy hóa đơn nháp.', 'success'); render();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      root.querySelector('#checkout')?.addEventListener('click', () => openPayment());
    };
    const openPayment = async () => {
      if (!cart.size) return context.showToast('Chưa có sản phẩm trong giỏ.', 'error');
      if (draftId) {
        try {
          const detail = await api(context, `/cashier/invoices/${draftId}`);
          const invoiceTotal = Math.round(Number(detail.invoice.TongThanhToan));
          if (invoiceTotal !== Math.round(cartTotal()) || detail.invoice.TrangThai !== 'Nháp') {
            await api(context, `/cashier/invoices/${draftId}/cancel`, { method: 'POST', body: JSON.stringify({ LyDo: 'Làm lại hóa đơn trước khi thanh toán' }) });
            draftId = null; quote = null;
          } else {
            quote = {
              TongTienHang: Number(detail.invoice.TongTienHang),
              TienGiamGia: Number(detail.invoice.TienGiamGia),
              TienDiemQuyDoi: Number(detail.invoice.TienDiemQuyDoi),
              TongThanhToan: invoiceTotal
            };
          }
        } catch { draftId = null; quote = null; }
      }
      if (!quote) await refreshQuote(false);
      const payable = payableAmount();
      if (payable <= 0) return context.showToast('Số tiền phải thanh toán không hợp lệ.', 'error');
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal cashier-payment-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">THANH TOÁN ĐỦ · NHIỀU PHƯƠNG THỨC</p><h2>${money(payable)}</h2></div><button type="button" class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="pay-method-grid"><button type="button" class="pay-method active" data-method="Tiền mặt"><svg><use href="#i-cash"/></svg><small>Tiền mặt</small></button><button type="button" class="pay-method" data-method="QR"><svg><use href="#i-qr"/></svg><small>QR</small></button><button type="button" class="pay-method" data-method="Thẻ"><svg><use href="#i-card"/></svg><small>Thẻ</small></button><button type="button" class="pay-method" data-method="Chuyển khoản"><svg><use href="#i-bank"/></svg><small>Chuyển khoản</small></button></div><div class="cashier-payment-head"><span>Phương thức</span><span>Số tiền</span><span>Mã giao dịch điện tử</span><span>Kết quả</span><span></span></div><div id="paymentRows"></div><button type="button" class="warehouse-secondary" id="addPaymentRow">+ Thêm phương thức (tiền mặt + CK/QR/thẻ)</button><p id="paymentRemain" class="cashier-payment-help"></p></div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Hủy</button><button type="button" class="warehouse-primary" id="confirmPayment">Hoàn thành &amp; in hóa đơn</button></div></div>`;
      document.body.appendChild(overlay);
      const rows = overlay.querySelector('#paymentRows');
      const syncRemain = () => {
        const successTotal = [...rows.querySelectorAll('.cashier-payment-row')].reduce((sum, row) => {
          if (row.querySelector('.pay-status').value !== 'Thành công') return sum;
          return sum + (Number(row.querySelector('.amount').value) || 0);
        }, 0);
        const remain = Math.round(payable - successTotal);
        overlay.querySelector('#paymentRemain').innerHTML = remain === 0
          ? `Đã đủ ${money(payable)}. Tiền mặt vào két ca; CK/QR/thẻ không vào két.`
          : remain > 0
            ? `Còn phải thu <strong>${money(remain)}</strong>. Có thể thêm dòng chuyển khoản hoặc tiền mặt.`
            : `Tổng thành công đang vượt ${money(-remain)}.`;
      };
      const addRow = (amount = '', method = 'Tiền mặt') => {
        const row = document.createElement('div'); row.className = 'cashier-payment-row cashier-payment-row-full';
        row.innerHTML = `<select class="method"><option${method === 'Tiền mặt' ? ' selected' : ''}>Tiền mặt</option><option${method === 'QR' ? ' selected' : ''}>QR</option><option${method === 'Thẻ' ? ' selected' : ''}>Thẻ</option><option${method === 'Chuyển khoản' ? ' selected' : ''}>Chuyển khoản</option></select><input class="amount" type="number" min="1" step="1000" value="${amount}"><input class="code" placeholder="Bắt buộc nếu không phải tiền mặt"><select class="pay-status"><option>Thành công</option><option>Thất bại</option></select><button type="button" class="warehouse-icon-button remove">×</button>`;
        rows.appendChild(row);
        row.querySelector('.remove').addEventListener('click', () => { row.remove(); syncRemain(); });
        row.querySelector('.amount').addEventListener('input', syncRemain);
        row.querySelector('.pay-status').addEventListener('change', syncRemain);
      };
      addRow(payable, 'Tiền mặt');
      overlay.querySelectorAll('.pay-method').forEach(button => button.addEventListener('click', () => {
        overlay.querySelectorAll('.pay-method').forEach(item => item.classList.toggle('active', item === button));
        const row = rows.querySelector('.cashier-payment-row');
        if (row) row.querySelector('.method').value = button.dataset.method;
      }));
      overlay.querySelector('#addPaymentRow').addEventListener('click', () => {
        const successTotal = [...rows.querySelectorAll('.cashier-payment-row')].reduce((sum, row) => row.querySelector('.pay-status').value === 'Thành công' ? sum + (Number(row.querySelector('.amount').value) || 0) : sum, 0);
        addRow(Math.max(0, Math.round(payable - successTotal)) || '', 'Chuyển khoản');
        syncRemain();
      });
      syncRemain();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => overlay.remove()));
      overlay.querySelector('#confirmPayment').addEventListener('click', async () => {
        const confirmBtn = overlay.querySelector('#confirmPayment');
        if (confirmBtn.disabled) return;
        const payments = [...rows.querySelectorAll('.cashier-payment-row')].map(row => ({
          PhuongThuc: row.querySelector('.method').value,
          SoTien: Number(row.querySelector('.amount').value),
          MaGiaoDich: row.querySelector('.code').value.trim() || null,
          TrangThai: row.querySelector('.pay-status').value
        })).filter(item => Number.isFinite(item.SoTien) && item.SoTien > 0);
        const successTotal = Math.round(payments.filter(item => item.TrangThai === 'Thành công').reduce((sum, item) => sum + item.SoTien, 0));
        if (successTotal !== payable) return context.showToast('Tổng thanh toán thành công chưa bằng tiền hóa đơn.', 'error');
        if (payments.some(item => item.TrangThai === 'Thành công' && item.PhuongThuc !== 'Tiền mặt' && !item.MaGiaoDich)) {
          return context.showToast('Thanh toán điện tử thành công phải có mã giao dịch.', 'error');
        }
        let invoiceId = draftId;
        confirmBtn.disabled = true;
        try {
          if (!invoiceId) {
            const invoice = await api(context, '/cashier/invoices', { method: 'POST', body: JSON.stringify({ MaKH: customer?.MaKH || null, MaKM: maKM || null, DiemSuDung: Number(diemSuDung) || 0, lines: linesPayload() }) });
            invoiceId = invoice.MaHD;
          }
          const existing = await api(context, `/cashier/invoices/${invoiceId}`);
          const alreadyPaid = (existing.payments || []).some(item => item.TrangThai === 'Thành công');
          if (!alreadyPaid) {
            for (const payment of payments) await api(context, `/cashier/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(payment) });
          }
          await api(context, `/cashier/invoices/${invoiceId}/complete`, { method: 'POST' });
          const detail = await api(context, `/cashier/invoices/${invoiceId}`);
          printInvoice(detail);
          cart = new Map(); customer = null; maKM = ''; diemSuDung = 0; quote = null; draftId = null;
          overlay.remove(); render();
          context.showToast(`Đã hoàn thành hóa đơn ${invoiceId}.`, 'success');
        } catch (error) {
          draftId = invoiceId || draftId;
          confirmBtn.disabled = false;
          context.showToast(`${error.message}${invoiceId ? ` Hóa đơn nháp: ${invoiceId}.` : ''}`, 'error');
        }
      });
    };
    try {
      const resumeId = sessionStorage.getItem('fly_pos_draft');
      if (resumeId) sessionStorage.removeItem('fly_pos_draft');
      const drafts = await api(context, `/cashier/invoices?status=${encodeURIComponent('Nháp')}`);
      const openDraft = (drafts.items || []).find(item => item.MaHD === resumeId)
        || (drafts.items || []).find(item => item.MaCa === currentShift?.MaCa)
        || (drafts.items || [])[0];
      if (openDraft) {
        const detail = await api(context, `/cashier/invoices/${openDraft.MaHD}`);
        draftId = detail.invoice.MaHD;
        maKM = detail.invoice.MaKM || '';
        diemSuDung = Number(detail.invoice.DiemSuDung || 0);
        if (detail.invoice.MaKH) {
          const found = await api(context, `/cashier/customers?search=${encodeURIComponent(detail.invoice.MaKH)}`);
          customer = (found.items || []).find(item => item.MaKH === detail.invoice.MaKH) || null;
        }
        for (const line of detail.lines || []) {
          const product = catalog.products.find(item => item.MaSP === line.MaSP);
          if (product) cart.set(line.MaSP, { ...product, SoLuong: Number(line.SoLuong) });
        }
        quote = {
          TongTienHang: Number(detail.invoice.TongTienHang),
          TienGiamGia: Number(detail.invoice.TienGiamGia),
          DiemSuDung: diemSuDung,
          TienDiemQuyDoi: Number(detail.invoice.TienDiemQuyDoi),
          TongThanhToan: Number(detail.invoice.TongThanhToan)
        };
      }
    } catch {
      /* POS vẫn bán được nếu không khôi phục được hóa đơn nháp. */
    }
    render();
  };

  const initCustomers = async (root, context) => {
    const load = async () => {
      try {
        const search = root.querySelector('#customerQuery')?.value || '';
        const data = await api(context, `/cashier/customers?search=${encodeURIComponent(search)}`);
        if (!root.querySelector('#customerBody')) {
          root.innerHTML = `${heading('THU NGÂN / KHÁCH HÀNG', 'Thành viên cửa hàng', 'Tìm theo tên hoặc số điện thoại, xem điểm và hạng. Không được tự sửa điểm.', '<button class="warehouse-primary" id="newCustomer">Thêm thành viên</button>')}<article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><input id="customerQuery" placeholder="Tên hoặc số điện thoại..."></label><button class="warehouse-icon-button" id="refreshCustomers">↻</button></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>KHÁCH HÀNG</th><th>LIÊN HỆ</th><th>ĐIỂM</th><th>HẠNG</th><th></th></tr></thead><tbody id="customerBody"></tbody></table></div></article>`;
          let timer;
          root.querySelector('#customerQuery').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
          root.querySelector('#refreshCustomers').addEventListener('click', load);
          root.querySelector('#newCustomer').addEventListener('click', () => customerEditor(context, null, load));
          root.addEventListener('click', event => {
            const button = event.target.closest('[data-edit]');
            if (!button) return;
            customerEditor(context, {
              MaKH: button.dataset.edit, TenKH: button.dataset.name, SDT: button.dataset.phone,
              Email: '', DiaChi: '', DiemTichLuy: button.dataset.points, HangThanhVien: button.dataset.rank
            }, load);
          });
        }
        root.querySelector('#customerBody').innerHTML = data.items.length ? data.items.map(item => `<tr><td>${person(item.TenKH, item.MaKH)}</td><td>${esc(item.SDT || '—')}<small>${esc(item.Email || '')}</small></td><td class="num">${item.DiemTichLuy}</td><td>${esc(item.HangThanhVien)}</td><td><button class="warehouse-secondary" data-edit="${esc(item.MaKH)}" data-name="${esc(item.TenKH)}" data-phone="${esc(item.SDT || '')}" data-points="${item.DiemTichLuy}" data-rank="${esc(item.HangThanhVien)}">Cập nhật</button></td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Chưa có khách hàng phù hợp.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
  };

  const initInvoices = async (root, context) => {
    const load = async () => {
      try {
        const search = root.querySelector('#invoiceQuery')?.value || '';
        const status = root.querySelector('#invoiceStatus')?.value || '';
        const data = await api(context, `/cashier/invoices?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        if (!root.querySelector('#invoiceBody')) {
          root.innerHTML = `${heading('THU NGÂN / HÓA ĐƠN', 'Hóa đơn ca của bạn', 'Nháp: tiếp tục lập/thanh toán hoặc hủy. Hoàn thành: In hóa đơn gốc = bản lúc bán (tổng tiền chưa trừ hoàn). Đổi trả in phiếu DT riêng trong Chi tiết hoặc menu Đổi trả.')}<article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><input id="invoiceQuery" placeholder="Mã hóa đơn, tên hoặc SĐT khách..."></label><select id="invoiceStatus"><option value="">Tất cả</option><option>Nháp</option><option>Hoàn thành</option><option value="Có đổi trả">Có đổi trả</option><option>Đã hủy</option></select></div><div class="warehouse-table-wrap"><table class="warehouse-table cashier-invoice-table"><thead><tr><th>HÓA ĐƠN</th><th>KHÁCH</th><th>TỔNG TIỀN</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody id="invoiceBody"></tbody></table></div></article>`;
          let timer;
          root.querySelector('#invoiceQuery').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
          root.querySelector('#invoiceStatus').addEventListener('change', load);
          root.addEventListener('click', async event => {
            const continueBtn = event.target.closest('[data-continue]');
            if (continueBtn) {
              sessionStorage.setItem('fly_pos_draft', continueBtn.dataset.continue);
              return context.navigate('cashier-pos');
            }
            const detailBtn = event.target.closest('[data-detail]');
            if (detailBtn) {
              try { await openInvoiceDetail(context, detailBtn.dataset.detail); } catch (error) { context.showToast(error.message, 'error'); }
              return;
            }
            const printBtn = event.target.closest('[data-print]');
            if (printBtn) {
              try { await printSaleDocument(context, await api(context, `/cashier/invoices/${printBtn.dataset.print}`)); } catch (error) { context.showToast(error.message, 'error'); }
              return;
            }
            const cancelBtn = event.target.closest('[data-cancel]');
            if (cancelBtn) {
              try {
                const result = await api(context, `/cashier/invoices/${cancelBtn.dataset.cancel}/cancel`, { method: 'POST', body: JSON.stringify({ LyDo: 'Hủy nháp từ danh sách hóa đơn' }) });
                context.showToast(result.message, 'success'); await load();
              } catch (error) { context.showToast(error.message, 'error'); }
            }
          });
        }
        root.querySelector('#invoiceBody').innerHTML = data.items.length ? data.items.map(item => {
          const view = invoiceReturnView(item);
          const actions = item.TrangThai === 'Hoàn thành'
            ? `<button type="button" class="warehouse-secondary" data-detail="${esc(item.MaHD)}">Chi tiết</button><button type="button" class="warehouse-secondary" data-print="${esc(item.MaHD)}">${view ? 'In / lưu PDF' : 'In hóa đơn gốc'}</button>`
            : item.TrangThai === 'Nháp'
              ? `<button type="button" class="warehouse-primary" data-continue="${esc(item.MaHD)}">Tiếp tục thanh toán</button><button type="button" class="warehouse-danger" data-cancel="${esc(item.MaHD)}">Hủy nháp</button>`
              : `<button type="button" class="warehouse-secondary" data-detail="${esc(item.MaHD)}">Chi tiết</button>`;
          return `<tr class="${view ? 'cashier-invoice-has-return' : ''}"><td><strong>${esc(item.MaHD)}</strong><small>${fmtTime(item.NgayLap)}</small></td><td>${person(item.TenKH || 'Khách vãng lai', item.SDT || '')}</td>${invoiceAmountCell(item)}<td>${invoiceStatusHtml(item)}</td><td><div class="warehouse-row-actions">${actions}</div></td></tr>`;
        }).join('') : '<tr><td colspan="5" class="warehouse-empty">Chưa có hóa đơn.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
  };

  const initReturns = async (root, context) => {
    const reasons = [
      { label: 'Hàng hỏng / lỗi cửa hàng', form: 'Hoàn tiền', hint: 'Hàng hỏng thường hoàn tiền. Thủ kho bỏ tick nhập lại kho; không mở lại ca cũ.' },
      { label: 'Hết hạn / kém chất lượng', form: 'Hoàn tiền', hint: 'Không nhập lại kho nếu hàng không bán được.' },
      { label: 'Giao nhầm / sai sản phẩm', form: 'Đổi hàng', hint: 'Có thể đổi sang đúng hàng nếu còn tồn.' },
      { label: 'Khách đổi ý (còn nguyên tem)', form: 'Hoàn tiền', hint: 'Chỉ hoàn khi hàng còn nguyên; Thủ kho kiểm tra bao bì.' },
      { label: 'Lý do khác', form: '', hint: 'Ghi rõ tình trạng hàng và mong muốn của khách.' }
    ];
    const invoiceHitHtml = item => {
      const view = invoiceReturnView(item);
      return `<button type="button" class="cashier-invoice-hit${view ? ' has-return' : ''}" data-hd="${esc(item.MaHD)}">${avatar(item.TenKH || 'K')}<div><strong>${esc(item.MaHD)}</strong><small>${esc(item.TenKH || 'Khách vãng lai')}${item.SDT ? ` · ${esc(item.SDT)}` : ''}</small>${view ? `<span class="status-pill ${view.tone}">${esc(view.label)}</span>` : ''}</div><div class="cashier-invoice-hit-meta"><span>${fmtTime(item.NgayLap)}</span><span>Ca ${esc(item.MaCa || '—')} · ${esc(item.TenNV)}</span><strong>${money(item.TongThanhToan)}</strong>${view && view.refunded ? `<small>Đã hoàn ${money(view.refunded)}</small>` : ''}</div></button>`;
    };
    const renderInvoiceForm = (overlay, data) => {
      const inv = data.invoice;
      const view = invoiceReturnView(inv);
      overlay.querySelector('#returnInvoiceHits').innerHTML = '';
      overlay.querySelector('#returnForm').innerHTML = `<div class="return-source-card"><div><span>HÓA ĐƠN GỐC</span><strong>${esc(inv.MaHD)}</strong></div><div><span>NGÀY BÁN</span><strong>${fmtTime(inv.NgayLap)}</strong></div><div><span>CA / THU NGÂN GỐC</span><strong>${esc(inv.MaCa || '—')}</strong><small>${esc(inv.TenNV)}</small></div><div><span>KHÁCH HÀNG</span><strong>${esc(inv.TenKH || 'Khách vãng lai')}</strong><small>${esc(inv.SDT || 'Không SĐT')}</small></div><div><span>TỔNG HĐ</span><strong>${money(inv.TongThanhToan)}</strong></div>${view ? `<div><span>ĐỔI TRẢ</span><strong>${esc(view.label)}</strong><small>${view.refunded ? `Đã hoàn ${money(view.refunded)}` : `${view.tickets} phiếu`}</small></div>` : ''}</div>
        <p class="cashier-return-shift-note">Hóa đơn gắn với ca đã bán (có thể là ca trước hoặc thu ngân khác). Hoàn tiền / giao đổi ghi vào <strong>ca bạn đang mở</strong>, không mở lại ca cũ và không sửa Phiếu thu ca đã đối soát.</p>
        <div class="warehouse-field"><label>Lý do đổi trả *</label><div class="cashier-reason-chips">${reasons.map(item => `<button type="button" class="cashier-reason-chip" data-reason="${esc(item.label)}" data-form="${esc(item.form)}">${esc(item.label)}</button>`).join('')}</div><textarea id="returnReason" maxlength="500" placeholder="Chọn lý do nhanh hoặc ghi rõ tình trạng hàng..."></textarea><small id="returnReasonHint" class="cashier-payment-help"></small></div>
        <div class="warehouse-field"><label>Hình thức xử lý *</label><div class="cashier-return-forms"><label><input type="radio" name="returnFormType" value="Hoàn tiền" checked> Hoàn tiền<span>Trả tiền từ két ca đang mở</span></label><label><input type="radio" name="returnFormType" value="Đổi hàng"> Đổi hàng<span>Giao sản phẩm khác sau khi Quản lý duyệt</span></label></div></div>
        <div class="warehouse-table-wrap"><table class="warehouse-table cashier-return-table"><thead><tr><th></th><th>SẢN PHẨM</th><th>ĐÃ BÁN</th><th>CÒN ĐỔI TRẢ</th><th>SL TRẢ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${data.lines.map(line => {
          const left = Number(line.SLConDoiTra || 0);
          return `<tr class="cashier-return-line" data-sp="${esc(line.MaSP)}" data-price="${Number(line.DonGia)}" data-left="${left}"><td><input type="checkbox" ${left > 0 ? '' : 'disabled'}></td><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${left}</td><td><input type="number" min="1" max="${Math.max(left, 0)}" value="${Math.max(left, 0)}" ${left > 0 ? '' : 'disabled'}></td><td class="num return-line-amount">${money(0)}</td></tr>`;
        }).join('')}</tbody></table></div>
        <div class="cashier-return-total">Tạm tính tiền hàng trả: <strong id="returnRefundPreview">${money(0)}</strong></div>
        <div class="warehouse-modal-actions return-form-actions"><button type="button" class="warehouse-secondary close">Hủy</button><button type="button" class="warehouse-primary" id="saveReturn">Lưu nháp và gửi Thủ kho</button></div>`;
      const updatePreview = () => {
        let total = 0;
        overlay.querySelectorAll('.cashier-return-line').forEach(row => {
          const qty = Number(row.querySelector('input[type=number]').value) || 0;
          const amount = row.querySelector('input[type=checkbox]').checked ? qty * Number(row.dataset.price) : 0;
          total += amount;
          row.querySelector('.return-line-amount').textContent = money(amount);
        });
        overlay.querySelector('#returnRefundPreview').textContent = money(total);
      };
      overlay.querySelectorAll('.cashier-return-line input').forEach(input => input.addEventListener('input', updatePreview));
      overlay.querySelectorAll('.cashier-return-line input[type=checkbox]').forEach(input => input.addEventListener('change', updatePreview));
      overlay.querySelectorAll('.cashier-reason-chip').forEach(chip => chip.addEventListener('click', () => {
        overlay.querySelectorAll('.cashier-reason-chip').forEach(item => item.classList.toggle('active', item === chip));
        overlay.querySelector('#returnReason').value = chip.dataset.reason;
        overlay.querySelector('#returnReasonHint').textContent = reasons.find(item => item.label === chip.dataset.reason)?.hint || '';
        if (chip.dataset.form) overlay.querySelector(`input[name=returnFormType][value="${chip.dataset.form}"]`).checked = true;
      }));
      overlay.querySelector('#saveReturn').addEventListener('click', async () => {
        const lines = [...overlay.querySelectorAll('.cashier-return-line')].filter(row => row.querySelector('input[type=checkbox]').checked).map(row => ({ MaSP: row.dataset.sp, SoLuong: Number(row.querySelector('input[type=number]').value) }));
        try {
          const created = await api(context, '/cashier/returns', { method: 'POST', body: JSON.stringify({ MaHD: inv.MaHD, LyDo: overlay.querySelector('#returnReason').value, HinhThucXuLy: overlay.querySelector('input[name=returnFormType]:checked').value, lines }) });
          await api(context, `/cashier/returns/${created.MaDT}/submit`, { method: 'POST' });
          context.showToast('Đã gửi hàng cho Thủ kho kiểm tra.', 'success'); overlay.remove(); await load();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => overlay.remove()));
    };
    const openCreate = async (presetHd = '') => {
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal return-create-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐỔI TRẢ</p><h2>Lập yêu cầu từ hóa đơn gốc</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="return-workflow-hint"><svg><use href="#i-refresh"/></svg><div><strong>Khách mua ca trước / nhân viên khác vẫn đổi trả được</strong><p>Tìm hóa đơn đã hoàn thành → chọn hàng → Thủ kho kiểm tra → Quản lý duyệt → hoàn tất trên ca đang mở của bạn.</p></div></div><div class="warehouse-field"><label>Tìm hóa đơn đã hoàn thành</label><input id="returnSearch" placeholder="Mã HĐ, tên khách, SĐT, mã ca hoặc tên thu ngân gốc..."></div><div id="returnInvoiceHits" class="cashier-invoice-hits"></div><div id="returnForm"></div></div></div>`;
      document.body.appendChild(overlay);
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => overlay.remove()));
      const showHits = items => {
        overlay.querySelector('#returnInvoiceHits').innerHTML = items.length
          ? `<p class="cashier-payment-help">${items.length} hóa đơn gần đây hoặc khớp tìm kiếm. Chọn một hóa đơn để lập phiếu.</p>${items.map(invoiceHitHtml).join('')}`
          : '<p class="cashier-payment-help">Không tìm thấy hóa đơn hoàn thành.</p>';
      };
      try { showHits((await api(context, '/cashier/returns/recent-invoices')).items); }
      catch (error) { context.showToast(error.message, 'error'); }
      let returnSearchVersion = 0;
      const runReturnSearch = (window.FLY_SEARCH?.debounce || ((handler, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => handler(...args), delay); }; }))(async (query, version) => {
        try {
          const path = query.length < 2 ? '/cashier/returns/recent-invoices' : `/cashier/returns/search-invoices?search=${encodeURIComponent(query)}`;
          const items = (await api(context, path)).items;
          if (version === returnSearchVersion && overlay.isConnected) showHits(items);
        } catch (error) {
          if (version === returnSearchVersion) context.showToast(error.message, 'error');
        }
      }, 250);
      overlay.querySelector('#returnSearch').addEventListener('input', event => {
        const query = event.target.value.trim();
        runReturnSearch(query, ++returnSearchVersion);
      });
      overlay.addEventListener('click', async event => {
        const hit = event.target.closest('[data-hd]');
        if (!hit) return;
        try { renderInvoiceForm(overlay, await api(context, `/cashier/returns/source/${hit.dataset.hd}`)); }
        catch (error) { context.showToast(error.message, 'error'); }
      });
      if (presetHd) {
        try { renderInvoiceForm(overlay, await api(context, `/cashier/returns/source/${presetHd}`)); }
        catch (error) { context.showToast(error.message, 'error'); }
      }
    };
    const returnActionHtml = item => {
      if (item.TrangThai === 'Đã duyệt') {
        const label = item.HinhThucXuLy === 'Hoàn tiền' ? 'Xác nhận hoàn' : 'Xác nhận đổi';
        return `<button type="button" class="warehouse-primary" data-complete="${esc(item.MaDT)}">${label}</button>`;
      }
      if (item.TrangThai === 'Chờ duyệt') return '<span class="cashier-return-wait">Chờ duyệt</span>';
      if (item.TrangThai === 'Chờ kiểm tra') return '<span class="cashier-return-wait">Chờ Thủ kho</span>';
      if (item.TrangThai === 'Nháp') return '<span class="cashier-return-wait">Nháp</span>';
      if (item.TrangThai === 'Hoàn thành') return `<div class="warehouse-row-actions"><span class="cashier-return-done">Đã xác nhận</span><button type="button" class="warehouse-secondary" data-print-return="${esc(item.MaDT)}">In phiếu</button></div>`;
      if (item.TrangThai === 'Từ chối') return '<span class="cashier-return-wait is-rejected">Từ chối</span>';
      return '—';
    };
    const completeModal = async (id) => {
      const detail = await api(context, `/cashier/returns/${id}`);
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      const refund = detail.ticket.HinhThucXuLy === 'Hoàn tiền';
      const returned = detail.lines.filter(item => item.LoaiDong === 'Hàng khách trả');
      const returnedValue = returned.reduce((sum, item) => sum + Number(item.ThanhTien || 0), 0);
      const restocked = /ược nhập lại kho/i.test(detail.ticket.KetQuaKiemTra || '') && !/không nhập lại/i.test(detail.ticket.KetQuaKiemTra || '');
      const hangDiDau = restocked
        ? 'Nhập lại kho bán (cộng tồn)'
        : /không nhập lại/i.test(detail.ticket.KetQuaKiemTra || '')
          ? 'Loại bỏ / vứt — không cộng tồn (đã trừ lúc bán)'
          : 'Chưa rõ xử lý kho';
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">${refund ? 'XÁC NHẬN HOÀN TIỀN' : 'XÁC NHẬN ĐỔI HÀNG'}</p><h2>${esc(id)}</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="return-source-card"><div><span>HÓA ĐƠN GỐC</span><strong>${esc(detail.ticket.MaHD)}</strong><small>Ca gốc ${esc(detail.ticket.MaCaGoc || '—')} · ${esc(detail.ticket.ThuNganGoc || '')}</small></div><div><span>HÌNH THỨC</span><strong>${esc(detail.ticket.HinhThucXuLy)}</strong></div><div><span>TIỀN HÀNG TRẢ</span><strong>${money(returnedValue)}</strong></div><div><span>HÀNG ĐI ĐÂU</span><strong>${esc(hangDiDau)}</strong><small>${esc(detail.ticket.KetQuaKiemTra || '—')}</small></div></div><p class="cashier-return-shift-note">Phải đang mở ca của bạn. Tiền hoàn tiền mặt trừ két ca hiện tại, không đụng ca đã đóng. Hàng loại bỏ/vứt không trừ kho lần nữa vì đã trừ lúc bán.</p><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÀNG KHÁCH TRẢ</th><th>SL</th><th>THÀNH TIỀN</th><th>HÀNG ĐI ĐÂU</th></tr></thead><tbody>${returned.map(item => `<tr><td>${esc(item.TenSP)}</td><td class="num">${item.SoLuong}</td><td class="num">${money(item.ThanhTien)}</td><td>${esc(hangDiDau)}</td></tr>`).join('')}</tbody></table></div>${refund ? `<div class="warehouse-field"><label>Phương thức hoàn *</label><select id="refundMethod"><option>Tiền mặt</option><option>QR</option><option>Thẻ</option><option>Chuyển khoản</option></select></div><div class="warehouse-field" id="refundCodeField" hidden><label>Mã giao dịch hoàn *</label><input id="refundCode" placeholder="Mã QR / thẻ / chuyển khoản"></div><p class="cashier-payment-help">Hoàn tiền mặt được trừ khi tính tiền bàn giao cuối ca đang mở.</p>` : `<p>Đổi trực tiếp chỉ áp dụng sản phẩm ngang giá. Hệ thống trừ tồn khi hoàn tất.</p><div class="warehouse-field"><label>Tìm hàng giao đổi</label><input id="exchangeSearch" placeholder="Mã, tên hoặc mã vạch..."></div><div id="exchangeHits" class="cashier-invoice-hits"></div><div id="exchangeLines" class="cashier-exchange-lines"></div><div class="cashier-return-total">Giá trị giao đổi: <strong id="exchangeValue">${money(0)}</strong> · Chênh lệch: <strong id="exchangeDiff">${money(0)}</strong></div><p class="cashier-payment-help" id="exchangeDiffHelp">Chọn hàng giao đổi có tổng giá trị đúng bằng tiền hàng trả.</p>`}</div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary confirm">${refund ? 'Xác nhận hoàn' : 'Xác nhận đổi'}</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('#refundMethod')?.addEventListener('change', () => {
        overlay.querySelector('#refundCodeField').hidden = overlay.querySelector('#refundMethod').value === 'Tiền mặt';
      });
      const updateExchangeTotals = () => {
        const valueEl = overlay.querySelector('#exchangeValue');
        if (!valueEl) return;
        const rows = [...overlay.querySelectorAll('.cashier-exchange-row')];
        const value = rows.reduce((sum, row) => sum + Number(row.dataset.price) * Number(row.querySelector('.ex-qty').value || 0), 0);
        const diff = value - returnedValue;
        valueEl.textContent = money(value);
        overlay.querySelector('#exchangeDiff').textContent = money(diff);
        overlay.querySelector('.confirm').disabled = !rows.length || Math.abs(diff) > 0.01;
        overlay.querySelector('#exchangeDiffHelp').textContent = diff > 0
          ? `Hàng mới cao hơn ${money(diff)}. Hãy hoàn hàng cũ và lập hóa đơn bán mới; không giao qua phiếu này.`
          : diff < 0
            ? `Hàng mới thấp hơn ${money(Math.abs(diff))}. Hãy hoàn hàng cũ và lập hóa đơn bán mới; không giao qua phiếu này.`
            : 'Đã ngang giá, có thể hoàn tất giao đổi.';
      };
      let exchangeSearchVersion = 0;
      const runExchangeSearch = (window.FLY_SEARCH?.debounce || ((handler, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => handler(...args), delay); }; }))(async (query, version) => {
        try {
          const catalog = await api(context, `/cashier/returns/catalog?search=${encodeURIComponent(query)}`);
          if (version !== exchangeSearchVersion || !overlay.isConnected) return;
          overlay.querySelector('#exchangeHits').innerHTML = (catalog.products || []).slice(0, 12).map(item => `<button type="button" class="cashier-invoice-hit" data-ex="${esc(item.MaSP)}" data-name="${esc(item.TenSP)}" data-price="${Number(item.GiaBan)}" data-stock="${Number(item.SLTon)}"><div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · tồn ${item.SLTon} · ${money(item.GiaBan)}</small></div></button>`).join('') || '<p class="cashier-payment-help">Không có sản phẩm phù hợp.</p>';
        } catch (error) {
          if (version === exchangeSearchVersion) context.showToast(error.message, 'error');
        }
      }, 250);
      overlay.querySelector('#exchangeSearch')?.addEventListener('input', event => {
        const query = event.target.value.trim();
        const version = ++exchangeSearchVersion;
        if (query.length < 2) { overlay.querySelector('#exchangeHits').innerHTML = ''; return; }
        runExchangeSearch(query, version);
      });
      overlay.addEventListener('click', event => {
        const hit = event.target.closest('[data-ex]');
        if (hit && overlay.contains(hit) && !overlay.querySelector(`.cashier-exchange-row[data-sp="${hit.dataset.ex}"]`)) {
          overlay.querySelector('#exchangeLines').insertAdjacentHTML('beforeend', `<div class="cashier-exchange-row" data-sp="${esc(hit.dataset.ex)}" data-price="${hit.dataset.price}"><div><strong>${esc(hit.dataset.name)}</strong><small>${esc(hit.dataset.ex)} · ${money(Number(hit.dataset.price))}</small></div><input class="ex-qty" type="number" min="1" max="${hit.dataset.stock}" value="1"><button type="button" class="warehouse-icon-button" data-remove-ex>×</button></div>`);
          overlay.querySelector('#exchangeHits').innerHTML = '';
          overlay.querySelector('#exchangeSearch').value = '';
          overlay.querySelectorAll('.ex-qty').forEach(input => { input.oninput = updateExchangeTotals; });
          updateExchangeTotals();
        }
        const remove = event.target.closest('[data-remove-ex]');
        if (remove) { remove.closest('.cashier-exchange-row').remove(); updateExchangeTotals(); }
      });
      overlay.querySelector('.confirm').addEventListener('click', async () => {
        const payload = refund
          ? { PhuongThucHoan: overlay.querySelector('#refundMethod').value, MaGiaoDichHoan: overlay.querySelector('#refundCode')?.value }
          : { exchange: [...overlay.querySelectorAll('.cashier-exchange-row')].map(row => ({ MaSP: row.dataset.sp, SoLuong: Number(row.querySelector('.ex-qty').value) })) };
        try {
          const result = await api(context, `/cashier/returns/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) });
          context.showToast(result.message, 'success');
          try { printReturnTicket(await api(context, `/cashier/returns/${id}`)); } catch { /* in phiếu không chặn hoàn tất */ }
          close(); await load();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      if (!refund) updateExchangeTotals();
    };
    const load = async () => {
      try {
        const data = await api(context, '/cashier/returns?scope=mine');
        root.innerHTML = `${heading('THU NGÂN / UC26', 'Yêu cầu đổi hàng hoặc hoàn tiền', 'Lập phiếu → Thủ kho kiểm → Quản lý duyệt → bạn xác nhận hoàn/đổi trên ca đang mở. Cột thao tác hiện Chờ duyệt cho đến khi Quản lý duyệt xong.', '<button class="warehouse-primary" id="newReturn">Lập yêu cầu</button>')}<article class="warehouse-table-card"><div class="warehouse-table-wrap"><table class="warehouse-table cashier-return-table"><thead><tr><th>PHIẾU</th><th>HÓA ĐƠN / KHÁCH</th><th>CA GỐC</th><th>HÌNH THỨC</th><th>SỐ TIỀN HOÀN</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>${data.items.length ? data.items.map(item => `<tr class="${item.TrangThai === 'Đã duyệt' ? 'cashier-return-ready' : ''}"><td><strong>${esc(item.MaDT)}</strong><small>${fmtTime(item.NgayLap)}</small></td><td>${esc(item.MaHD)}<small>${esc(item.TenKH || 'Khách vãng lai')}</small></td><td>${esc(item.MaCaGoc || '—')}<small>${esc(item.ThuNganGoc || '')}${item.MaCaHoan ? `<br>Hoàn ca ${esc(item.MaCaHoan)}` : ''}</small></td><td>${esc(item.HinhThucXuLy)}</td><td class="num">${money(item.SoTienHoan)}</td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td><td>${returnActionHtml(item)}</td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Chưa có yêu cầu đổi trả.</td></tr>'}</tbody></table></div></article>`;
        root.querySelector('#newReturn').addEventListener('click', () => openCreate());
        root.querySelectorAll('[data-complete]').forEach(button => button.addEventListener('click', () => completeModal(button.dataset.complete)));
        root.querySelectorAll('[data-print-return]').forEach(button => button.addEventListener('click', async () => {
          try { printReturnTicket(await api(context, `/cashier/returns/${button.dataset.printReturn}`)); }
          catch (error) { context.showToast(error.message, 'error'); }
        }));
        const presetHd = sessionStorage.getItem('fly_return_invoice');
        if (presetHd) {
          sessionStorage.removeItem('fly_return_invoice');
          await openCreate(presetHd);
        }
      } catch (error) { context.showToast(error.message, 'error'); root.innerHTML = `<div class="welcome-card"><h2>Không tải được đổi trả</h2><p>${esc(error.message)}</p></div>`; }
    };
    await load();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'cashier-shifts') return initShifts(document.querySelector('.cashier-page'), context);
      if (pageName === 'cashier-pos') return initPos(document.querySelector('.cashier-pos-page'), context);
      if (pageName === 'cashier-customers') return initCustomers(document.querySelector('.cashier-page'), context);
      if (pageName === 'cashier-invoices') return initInvoices(document.querySelector('.cashier-page'), context);
      if (pageName === 'cashier-returns') return initReturns(document.querySelector('.cashier-page'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
