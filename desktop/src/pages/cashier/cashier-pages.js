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
    'Thất bại': 'cancelled', 'Chờ kiểm tra': 'sent', 'Chờ duyệt': 'sent', 'Đã duyệt': 'ok', 'Từ chối': 'cancelled'
  }[status] || 'draft');
  const printInvoice = detail => window.FLY_PRINT?.show({
    title: 'HÓA ĐƠN BÁN HÀNG', number: detail.invoice.MaHD, documentDate: detail.invoice.NgayLap,
    status: detail.invoice.TrangThai,
    fields: [
      { label: 'Thu ngân', value: detail.invoice.TenNV },
      { label: 'Khách hàng', value: detail.invoice.TenKH || 'Khách vãng lai' }
    ],
    columns: [
      { key: 'TenSP', label: 'Sản phẩm' },
      { key: 'SoLuong', label: 'SL', align: 'right' },
      { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
      { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
    ],
    rows: detail.lines,
    totals: [
      { label: 'Tiền hàng', value: detail.invoice.TongTienHang, format: 'money' },
      { label: 'Giảm giá', value: detail.invoice.TienGiamGia, format: 'money' },
      { label: 'Điểm quy đổi', value: detail.invoice.TienDiemQuyDoi, format: 'money' },
      { label: 'Tổng thanh toán', value: detail.invoice.TongThanhToan, format: 'money' }
    ],
    signatures: ['Thu ngân', 'Khách hàng']
  });

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
        const live = current ? await api(context, '/cashier/shifts/current/summary').catch(() => current) : null;
        const s = live || current;
        root.innerHTML = `${heading('THU NGÂN / CA BÁN HÀNG', 'Mở ca và sẵn sàng tại quầy', 'Phải chấm công vào theo lịch đã công bố, rồi mở ca cá nhân trước khi lập hóa đơn.')}${current ? `<article class="cashier-active-shift"><div class="cashier-shift-copy"><span class="cashier-live"><i></i> CA ĐANG MỞ</span><h2>${esc(current.MaCa)}</h2><p>Ca của <strong>${esc(current.TenNV)}</strong> bắt đầu lúc ${fmtTime(current.ThoiGianBatDau)}.</p><div class="cashier-shift-metrics"><div><span>QUỸ ĐẦU CA</span><strong>${money(s.TienDauCa)}</strong></div><div><span>TIỀN MẶT THU</span><strong>${money(s.TongTienMat)}</strong></div><div><span>CHUYỂN KHOẢN</span><strong>${money(s.TongTienChuyenKhoan)}</strong></div><div><span>QR / THẺ</span><strong>${money(Number(s.TongTienQR || 0) + Number(s.TongTienThe || 0))}</strong></div><div><span>KÉT DỰ KIẾN</span><strong>${money(s.TienMatTrongKet)}</strong></div><div><span>DOANH THU</span><strong>${money(s.DoanhThu)}</strong></div><div><span>GIÁ VỐN</span><strong>${money(s.GiaVon)}</strong></div><div><span>LÃI GỘP CA</span><strong>${money(s.LoiNhuanGop)}</strong></div></div></div><div class="cashier-next-step"><strong>Đã sẵn sàng bán hàng</strong><p>Tiền mặt cộng vào két (quỹ đầu ca + thu TM − hoàn TM). CK/QR/thẻ không vào két. Hóa đơn nháp phải hoàn thành hoặc hủy trước khi đóng ca.</p><button type="button" class="warehouse-primary" id="goPos">Vào màn hình bán hàng</button><button type="button" class="warehouse-secondary" id="closeShift">Đóng ca &amp; bàn giao</button></div></article>` : `<article class="cashier-open-shift"><div><p class="warehouse-kicker">BƯỚC 1 · TRƯỚC KHI BÁN HÀNG</p><h2>Chưa có ca bán hàng đang mở</h2><p>Nếu không mở được ca: kiểm tra Lịch làm việc — hôm nay phải có ca chính 8 giờ và đã chấm công vào.</p><button type="button" class="warehouse-primary" id="openShift">Mở ca bán hàng</button></div></article>`}<article class="warehouse-table-card cashier-history"><div class="warehouse-panel-title"><div><p>LỊCH SỬ CÁ NHÂN</p><h2>Các ca gần đây</h2></div><button type="button" class="warehouse-secondary" id="refreshShifts">Làm mới</button></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>MÃ CA</th><th>BẮT ĐẦU</th><th>KẾT THÚC</th><th>QUỸ ĐẦU CA</th><th>HÓA ĐƠN</th><th>DOANH THU</th><th>TRẠNG THÁI</th></tr></thead><tbody>${data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaCa)}</strong></td><td>${fmtTime(item.ThoiGianBatDau)}</td><td>${fmtTime(item.ThoiGianKetThuc)}</td><td class="num">${money(item.TienDauCa)}</td><td class="num">${item.SoHoaDon}</td><td class="num"><strong>${money(item.DoanhThu)}</strong></td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Chưa có lịch sử ca bán hàng.</td></tr>'}</tbody></table></div></article>`;
        root.querySelector('#openShift')?.addEventListener('click', () => openShiftModal(context, load));
        root.querySelector('#goPos')?.addEventListener('click', () => context.navigate('cashier-pos'));
        root.querySelector('#closeShift')?.addEventListener('click', () => closeShiftModal(context, load));
        root.querySelector('#refreshShifts').addEventListener('click', load);
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
  };

  const initPos = async (root, context) => {
    let catalog; let currentShift = null; let customer = null; let cart = new Map(); let maKM = ''; let diemSuDung = 0; let quote = null; let draftId = null; let searchQuery = '';
    try {
      const [catalogData, shiftData] = await Promise.all([api(context, '/cashier/pos/catalog'), api(context, '/cashier/shifts')]);
      if (!shiftData.current) throw new Error('Bạn phải mở ca bán hàng trước khi vào POS.');
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
        overlay.querySelector('#customerResults').innerHTML = items.length ? items.map(item => `<button type="button" class="cashier-customer-hit" data-id="${esc(item.MaKH)}"><strong>${esc(item.TenKH)}</strong><small>${esc(item.SDT || '—')} · ${esc(item.HangThanhVien)} · ${item.DiemTichLuy} điểm</small></button>`).join('') : '<div class="warehouse-empty">Không tìm thấy. Có thể tạo thành viên mới.</div>';
      };
      overlay.querySelector('#customerSearch').addEventListener('input', async event => {
        const query = event.target.value.trim();
        if (!query) return renderList([]);
        try { renderList((await api(context, `/cashier/customers?search=${encodeURIComponent(query)}`)).items); } catch (error) { context.showToast(error.message, 'error'); }
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
      root.innerHTML = `${heading('BÁN HÀNG TẠI QUẦY', 'Lập hóa đơn và thanh toán', 'Hóa đơn chỉ hoàn thành và trừ tồn sau khi thanh toán đủ. Không mua chịu.', '<button class="warehouse-secondary" id="backShift">Quay lại ca</button>')}
        <section class="cashier-pos-layout">
          <article class="warehouse-table-card cashier-product-panel">
            <div class="warehouse-panel-title"><div><p>SẢN PHẨM</p><h2>Quét mã hoặc tìm kiếm</h2></div><input id="posSearch" type="search" value="${esc(searchQuery)}" placeholder="Mã vạch, mã hoặc tên sản phẩm"></div>
            <div class="cashier-product-grid">${products.map(item => `<button type="button" class="cashier-product" data-id="${esc(item.MaSP)}" data-search="${esc(unaccent(`${item.MaSP} ${item.MaVach || ''} ${item.TenSP}`))}" ${Number(item.SLTon) <= 0 ? 'disabled' : ''}><strong>${esc(item.TenSP)}</strong><span>${money(item.GiaBan)}</span><small>${esc(item.MaSP)} · Còn ${item.SLTon} ${esc(item.DonViTinh)}</small></button>`).join('')}</div>
            <p class="cashier-search-empty" id="posEmpty" hidden>Không tìm thấy sản phẩm khớp. Thử mã vạch, mã SP hoặc một phần tên (không cần dấu).</p>
          </article>
          <article class="warehouse-table-card cashier-cart-panel">
            <div class="warehouse-panel-title"><div><p>${draftId ? `NHÁP ${esc(draftId)}` : 'HÓA ĐƠN NHÁP'}</p><h2>Giỏ hàng</h2></div><span class="status-pill draft">${cart.size} mặt hàng</span></div>
            <div class="cashier-customer-row"><div><strong>${customer ? esc(customer.TenKH) : 'Khách vãng lai'}</strong><small>${customer ? `${esc(customer.SDT || '')} · ${esc(customer.HangThanhVien)} · ${customer.DiemTichLuy} điểm` : 'Không tích điểm'}</small></div><button class="warehouse-secondary" id="selectCustomer">Chọn khách</button></div>
            <div class="cashier-pos-extras"><label>Khuyến mãi<select id="promoSelect"><option value="">Không áp dụng</option>${(catalog.promotions || []).map(item => `<option value="${esc(item.MaKM)}" ${maKM === item.MaKM ? 'selected' : ''}>${esc(item.TenKM)}</option>`).join('')}</select></label>${customer ? `<label>Dùng điểm<input id="pointInput" type="number" min="0" max="${customer.DiemTichLuy}" value="${diemSuDung}"></label>` : ''}</div>
            ${(catalog.promotions || []).length ? '' : '<small class="cashier-quote-break">Chưa có KM hiệu lực. Quản lý tạo/ngừng chương trình ở menu Khuyến mãi (UC04).</small>'}
            <div class="cashier-cart-lines">${cart.size ? [...cart.values()].map(line => `<div class="cashier-cart-line"><div><strong>${esc(line.TenSP)}</strong><small>${money(line.GiaBan)} × ${line.SoLuong}</small></div><div class="cashier-cart-qty"><button data-action="minus" data-id="${line.MaSP}">−</button><span>${line.SoLuong}</span><button data-action="plus" data-id="${line.MaSP}">+</button></div><strong>${money(Number(line.GiaBan) * line.SoLuong)}</strong></div>`).join('') : '<div class="warehouse-empty">Quét hoặc chọn sản phẩm để bắt đầu.</div>'}</div>
            <div class="cashier-cart-total"><span>PHẢI THANH TOÁN</span><strong>${money(payable)}</strong></div>
            ${quote ? `<small class="cashier-quote-break">Tiền hàng ${money(quote.TongTienHang)} · Giảm ${money(quote.TienGiamGia)} · Điểm ${money(quote.TienDiemQuyDoi)}</small>` : ''}
            <div class="cashier-pos-actions"><button type="button" class="warehouse-secondary" id="saveDraft" ${cart.size ? '' : 'disabled'}>Lưu nháp</button>${draftId ? '<button type="button" class="warehouse-danger" id="cancelDraft">Hủy nháp</button>' : ''}<button type="button" class="warehouse-primary cashier-checkout" id="checkout" ${cart.size ? '' : 'disabled'}>Thanh toán</button></div>
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
          const show = !query || button.dataset.search.includes(query);
          button.hidden = !show;
          if (show) visible += 1;
        });
        const empty = root.querySelector('#posEmpty');
        if (empty) empty.hidden = !query || visible > 0;
      };
      root.querySelector('#backShift').addEventListener('click', () => context.navigate('cashier-shifts'));
      root.querySelectorAll('.cashier-product').forEach(button => button.addEventListener('click', () => addProduct(products.find(item => item.MaSP === button.dataset.id))));
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
      overlay.innerHTML = `<div class="warehouse-modal cashier-payment-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">THANH TOÁN ĐỦ · NHIỀU PHƯƠNG THỨC</p><h2>${money(payable)}</h2></div><button type="button" class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="cashier-payment-head"><span>Phương thức</span><span>Số tiền</span><span>Mã giao dịch điện tử</span><span>Kết quả</span><span></span></div><div id="paymentRows"></div><button type="button" class="warehouse-secondary" id="addPaymentRow">+ Thêm phương thức (tiền mặt + CK/QR/thẻ)</button><p id="paymentRemain" class="cashier-payment-help"></p></div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close">Hủy</button><button type="button" class="warehouse-primary" id="confirmPayment">Hoàn thành &amp; in hóa đơn</button></div></div>`;
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
        root.querySelector('#customerBody').innerHTML = data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.TenKH)}</strong><small>${esc(item.MaKH)}</small></td><td>${esc(item.SDT || '—')}<small>${esc(item.Email || '')}</small></td><td class="num">${item.DiemTichLuy}</td><td>${esc(item.HangThanhVien)}</td><td><button class="warehouse-secondary" data-edit="${esc(item.MaKH)}" data-name="${esc(item.TenKH)}" data-phone="${esc(item.SDT || '')}" data-points="${item.DiemTichLuy}" data-rank="${esc(item.HangThanhVien)}">Cập nhật</button></td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Chưa có khách hàng phù hợp.</td></tr>';
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
          root.innerHTML = `${heading('THU NGÂN / HÓA ĐƠN', 'Hóa đơn ca của bạn', 'Nháp: tiếp tục lập/thanh toán hoặc hủy. Hoàn thành: in lại.')}<article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><input id="invoiceQuery" placeholder="Mã hóa đơn, tên hoặc SĐT khách..."></label><select id="invoiceStatus"><option value="">Tất cả</option><option>Nháp</option><option>Hoàn thành</option><option>Đã hủy</option></select></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÓA ĐƠN</th><th>KHÁCH</th><th>TỔNG TIỀN</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody id="invoiceBody"></tbody></table></div></article>`;
          let timer;
          root.querySelector('#invoiceQuery').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
          root.querySelector('#invoiceStatus').addEventListener('change', load);
          root.addEventListener('click', async event => {
            const continueBtn = event.target.closest('[data-continue]');
            if (continueBtn) {
              sessionStorage.setItem('fly_pos_draft', continueBtn.dataset.continue);
              return context.navigate('cashier-pos');
            }
            const printBtn = event.target.closest('[data-print]');
            if (printBtn) {
              try { printInvoice(await api(context, `/cashier/invoices/${printBtn.dataset.print}`)); } catch (error) { context.showToast(error.message, 'error'); }
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
        root.querySelector('#invoiceBody').innerHTML = data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaHD)}</strong><small>${fmtTime(item.NgayLap)}</small></td><td>${esc(item.TenKH || 'Khách vãng lai')}</td><td class="num">${money(item.TongThanhToan)}</td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td><td>${item.TrangThai === 'Hoàn thành' ? `<button type="button" class="warehouse-secondary" data-print="${esc(item.MaHD)}">In lại</button>` : item.TrangThai === 'Nháp' ? `<button type="button" class="warehouse-primary" data-continue="${esc(item.MaHD)}">Tiếp tục thanh toán</button><button type="button" class="warehouse-danger" data-cancel="${esc(item.MaHD)}">Hủy nháp</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Chưa có hóa đơn.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
  };

  const initReturns = async (root, context) => {
    const openCreate = async () => {
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐỔI TRẢ</p><h2>Lập yêu cầu từ hóa đơn gốc</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-field"><label>Tìm hóa đơn đã hoàn thành</label><input id="returnSearch" placeholder="Mã HĐ, tên hoặc SĐT..."></div><div id="returnInvoiceHits"></div><div id="returnForm"></div></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove(); overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('#returnSearch').addEventListener('input', async event => {
        const query = event.target.value.trim();
        if (query.length < 2) return;
        try {
          const data = await api(context, `/cashier/returns/search-invoices?search=${encodeURIComponent(query)}`);
          overlay.querySelector('#returnInvoiceHits').innerHTML = data.items.map(item => `<button type="button" class="cashier-customer-hit" data-hd="${esc(item.MaHD)}"><strong>${esc(item.MaHD)}</strong><small>${esc(item.TenKH || 'Khách vãng lai')} · ${money(item.TongThanhToan)}</small></button>`).join('');
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.addEventListener('click', async event => {
        const hit = event.target.closest('[data-hd]');
        if (!hit) return;
        try {
          const data = await api(context, `/cashier/returns/source/${hit.dataset.hd}`);
          overlay.querySelector('#returnForm').innerHTML = `<div class="warehouse-field"><label>Lý do *</label><input id="returnReason" maxlength="500"></div><div class="warehouse-field"><label>Hình thức</label><select id="returnFormType"><option>Hoàn tiền</option><option>Đổi hàng</option></select></div><div class="warehouse-form-lines">${data.lines.map(line => `<label class="cashier-return-line"><input type="checkbox" data-sp="${esc(line.MaSP)}" ${line.SLConDoiTra > 0 ? '' : 'disabled'}><span>${esc(line.TenSP)} · còn ${line.SLConDoiTra}/${line.SoLuong}</span><input type="number" min="1" max="${line.SLConDoiTra}" value="${Math.max(1, line.SLConDoiTra)}" ${line.SLConDoiTra > 0 ? '' : 'disabled'}></label>`).join('')}</div><button class="warehouse-primary" id="saveReturn">Lưu nháp và gửi Thủ kho</button>`;
          overlay.querySelector('#saveReturn').addEventListener('click', async () => {
            const lines = [...overlay.querySelectorAll('.cashier-return-line')].filter(row => row.querySelector('input[type=checkbox]').checked).map(row => ({ MaSP: row.querySelector('input[type=checkbox]').dataset.sp, SoLuong: Number(row.querySelector('input[type=number]').value) }));
            try {
              const created = await api(context, '/cashier/returns', { method: 'POST', body: JSON.stringify({ MaHD: data.invoice.MaHD, LyDo: overlay.querySelector('#returnReason').value, HinhThucXuLy: overlay.querySelector('#returnFormType').value, lines }) });
              await api(context, `/cashier/returns/${created.MaDT}/submit`, { method: 'POST' });
              context.showToast('Đã gửi hàng cho Thủ kho kiểm tra.', 'success'); close(); await load();
            } catch (error) { context.showToast(error.message, 'error'); }
          });
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    };
    const completeModal = async (id) => {
      const detail = await api(context, `/cashier/returns/${id}`);
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      const refund = detail.ticket.HinhThucXuLy === 'Hoàn tiền';
      overlay.innerHTML = `<div class="warehouse-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HOÀN TẤT ĐỔI TRẢ</p><h2>${esc(id)}</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body">${refund ? `<div class="warehouse-field"><label>Phương thức hoàn *</label><select id="refundMethod"><option>Tiền mặt</option><option>QR</option><option>Thẻ</option><option>Chuyển khoản</option></select></div><div class="warehouse-field"><label>Mã giao dịch hoàn</label><input id="refundCode"></div><p class="cashier-payment-help">Hoàn tiền mặt được trừ khi tính tiền bàn giao cuối ca. Phải đang mở ca.</p>` : `<p>Chọn sản phẩm giao đổi cho khách (sẽ trừ tồn khi hoàn tất).</p><div id="exchangeLines"></div><button class="warehouse-secondary" id="addExchange">+ Thêm hàng giao đổi</button>`}<p class="cashier-payment-help">${esc(detail.ticket.KetQuaKiemTra || '')}</p></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary confirm">Hoàn thành</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove(); overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('#addExchange')?.addEventListener('click', () => {
        overlay.querySelector('#exchangeLines').insertAdjacentHTML('beforeend', '<div class="cashier-payment-row"><input class="ex-sp" placeholder="Mã SP"><input class="ex-qty" type="number" min="1" value="1"></div>');
      });
      overlay.querySelector('.confirm').addEventListener('click', async () => {
        const payload = refund
          ? { PhuongThucHoan: overlay.querySelector('#refundMethod').value, MaGiaoDichHoan: overlay.querySelector('#refundCode').value }
          : { exchange: [...overlay.querySelectorAll('#exchangeLines .cashier-payment-row')].map(row => ({ MaSP: row.querySelector('.ex-sp').value.trim(), SoLuong: Number(row.querySelector('.ex-qty').value) })) };
        try {
          const result = await api(context, `/cashier/returns/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) });
          context.showToast(result.message, 'success'); close(); await load();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    };
    const load = async () => {
      try {
        const data = await api(context, '/cashier/returns?scope=mine');
        root.innerHTML = `${heading('THU NGÂN / ĐỔI TRẢ', 'Yêu cầu đổi hàng hoặc hoàn tiền', 'Lập từ hóa đơn gốc, gửi Thủ kho kiểm tra, Quản lý duyệt, rồi hoàn tất tại quầy.', '<button class="warehouse-primary" id="newReturn">Lập yêu cầu</button>')}<article class="warehouse-table-card"><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU</th><th>HÓA ĐƠN</th><th>HÌNH THỨC</th><th>SỐ TIỀN HOÀN</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>${data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaDT)}</strong></td><td>${esc(item.MaHD)}</td><td>${esc(item.HinhThucXuLy)}</td><td class="num">${money(item.SoTienHoan)}</td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td><td>${item.TrangThai === 'Đã duyệt' ? `<button class="warehouse-primary" data-complete="${esc(item.MaDT)}">Hoàn tất</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa có yêu cầu đổi trả.</td></tr>'}</tbody></table></div></article>`;
        root.querySelector('#newReturn').addEventListener('click', openCreate);
        root.querySelectorAll('[data-complete]').forEach(button => button.addEventListener('click', () => completeModal(button.dataset.complete)));
      } catch (error) { context.showToast(error.message, 'error'); }
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
