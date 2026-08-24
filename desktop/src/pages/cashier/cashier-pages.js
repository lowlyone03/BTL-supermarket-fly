(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'cashier-shifts': '<section class="warehouse-page cashier-page"><div class="overview-loading">Đang tải ca bán hàng...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const fmtTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const api = async (context, path, options = {}) => {
    const response = await fetch(`${context.apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };

  const openShiftModal = (context, onDone) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal warehouse-confirm-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">UC22 · CA BÁN HÀNG CÁ NHÂN</p><h2>Mở ca làm việc</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="cashier-opening-rule"><svg><use href="#i-lock"/></svg><div><strong>Mỗi Thu ngân chỉ có một ca đang mở</strong><p>Tiền đầu ca là tiền mặt thực tế được bàn giao tại quầy. Hóa đơn bán hàng phát sinh sau đó sẽ gắn với chính ca này.</p></div></div><div class="warehouse-field"><label>Tiền mặt đầu ca *</label><div class="cashier-money-input"><input id="openingCash" type="number" min="0" step="1000" value="1000000"><span>đ</span></div><small>Hãy kiểm đếm tiền thực tế trước khi xác nhận.</small></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary confirm-open"><svg><use href="#i-clock"/></svg>Xác nhận mở ca</button></div></div>`;
    overlay.innerHTML = overlay.innerHTML.replace('UC22 · ', '');
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('.confirm-open').addEventListener('click', async () => {
      const TienDauCa = Number(overlay.querySelector('#openingCash').value);
      try {
        const result = await api(context, '/cashier/shifts/open', { method: 'POST', body: JSON.stringify({ TienDauCa }) });
        context.showToast(result.message, 'success');
        close();
        await onDone();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
    overlay.querySelector('#openingCash').focus();
    overlay.querySelector('#openingCash').select();
  };

  const initShifts = async (root, context) => {
    const load = async () => {
      try {
        const data = await api(context, '/cashier/shifts');
        const current = data.current;
        root.innerHTML = `<header class="warehouse-heading"><div><p class="warehouse-kicker">THU NGÂN / CA BÁN HÀNG</p><h1>Mở ca và sẵn sàng tại quầy</h1><p>Kiểm đếm tiền đầu ca trước khi thực hiện giao dịch bán hàng.</p></div><span class="warehouse-chip">Supermarket Fly · Hà Nội</span></header>${current ? `<article class="cashier-active-shift"><div class="cashier-shift-copy"><span class="cashier-live"><i></i> CA ĐANG MỞ</span><h2>${esc(current.MaCa)}</h2><p>Ca cá nhân của <strong>${esc(current.TenNV)}</strong> bắt đầu lúc ${fmtTime(current.ThoiGianBatDau)}.</p><div class="cashier-shift-metrics"><div><span>TIỀN ĐẦU CA</span><strong>${money(current.TienDauCa)}</strong></div><div><span>HÓA ĐƠN</span><strong>${current.SoHoaDon}</strong></div><div><span>DOANH THU CA</span><strong>${money(current.DoanhThu)}</strong></div></div></div><div class="cashier-next-step"><svg><use href="#i-approve"/></svg><strong>Đã sẵn sàng bán hàng</strong><p>Bước nghiệp vụ kế tiếp là quét hàng, lập hóa đơn và thanh toán. Phần này chưa được phép chạy nếu chưa mở ca.</p><button class="warehouse-primary" type="button" disabled>Vào màn hình bán hàng</button><small>Sẽ được mở ở UC24 sau khi UC22 được kiểm thử đạt.</small></div></article>` : `<article class="cashier-open-shift"><div class="cashier-open-visual"><span><svg><use href="#i-clock"/></svg></span><i></i><span><svg><use href="#i-report"/></svg></span><i></i><span><svg><use href="#i-approve"/></svg></span></div><div><p class="warehouse-kicker">BƯỚC 1 · TRƯỚC KHI BÁN HÀNG</p><h2>Chưa có ca bán hàng đang mở</h2><p>Thu ngân cần nhận quầy, kiểm đếm tiền mặt và mở ca cá nhân. Hệ thống chỉ cho phép lập hóa đơn sau khi ca đã mở thành công.</p><button class="warehouse-primary" id="openShift"><svg><use href="#i-plus"/></svg>Mở ca bán hàng</button></div></article>`}<article class="warehouse-table-card cashier-history"><div class="warehouse-panel-title"><div><p>LỊCH SỬ CÁ NHÂN</p><h2>Các ca gần đây</h2></div><button class="warehouse-secondary" id="refreshShifts"><svg><use href="#i-refresh"/></svg>Làm mới</button></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>MÃ CA</th><th>BẮT ĐẦU</th><th>KẾT THÚC</th><th>TIỀN ĐẦU CA</th><th>HÓA ĐƠN</th><th>DOANH THU</th><th>TRẠNG THÁI</th></tr></thead><tbody>${data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaCa)}</strong></td><td>${fmtTime(item.ThoiGianBatDau)}</td><td>${fmtTime(item.ThoiGianKetThuc)}</td><td class="num">${money(item.TienDauCa)}</td><td class="num">${item.SoHoaDon}</td><td class="num"><strong>${money(item.DoanhThu)}</strong></td><td><span class="status-pill ${item.TrangThai === 'Đang mở' ? 'ok' : 'draft'}">${esc(item.TrangThai)}</span></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Chưa có lịch sử ca bán hàng.</td></tr>'}</tbody></table></div></article>`;
        root.innerHTML = root.innerHTML.replace('Sẽ được mở ở UC24 sau khi UC22 được kiểm thử đạt.', 'Màn hình bán hàng sẽ được mở sau khi bước mở ca được kiểm thử đạt.');
        root.querySelector('#openShift')?.addEventListener('click', () => openShiftModal(context, load));
        root.querySelector('#refreshShifts').addEventListener('click', load);
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'cashier-shifts') return initShifts(document.querySelector('.cashier-page'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
