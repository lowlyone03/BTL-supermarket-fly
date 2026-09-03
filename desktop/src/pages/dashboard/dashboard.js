const API_BASE = 'http://localhost:3000/api';
window.FLY_API_BASE = API_BASE;
const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('fly_token');
  const userStr = localStorage.getItem('fly_user');
  const contentArea = document.getElementById('contentArea');
  const toast = document.getElementById('appToast');
  let toastTimer;
  let pendingTotal = 0;
  let navigationVersion = 0;
  let currentNav = null;
  let inboxStamp = '';
  let inboxItems = [];
  let inboxTimer = 0;

  window.showToast = (message, type = 'success') => {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast visible ${type}`;
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  };

  const selectMenu = document.createElement('div');
  selectMenu.className = 'select-menu';
  selectMenu.hidden = true;
  document.body.appendChild(selectMenu);
  let activeSelect = null;

  const closeSelectMenu = () => {
    selectMenu.hidden = true;
    selectMenu.replaceChildren();
    document.querySelectorAll('.custom-select-trigger[aria-expanded="true"]').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
    activeSelect = null;
  };

  const syncSelectControl = select => {
    const trigger = select.closest('.custom-select-control')?.querySelector('.custom-select-trigger');
    if (!trigger) return;
    const selected = select.options[select.selectedIndex];
    trigger.querySelector('span').textContent = selected?.textContent || 'Chọn giá trị';
    trigger.disabled = select.disabled;
  };

  const openSelectMenu = (select, trigger) => {
    if (select.disabled) return;
    if (activeSelect === select && !selectMenu.hidden) return closeSelectMenu();
    closeSelectMenu();
    activeSelect = select;
    Array.from(select.options).forEach(option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'select-menu-option';
      item.textContent = option.textContent;
      item.disabled = option.disabled;
      if (option.selected) item.classList.add('selected');
      item.addEventListener('click', event => {
        event.stopPropagation();
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSelectControl(select);
        closeSelectMenu();
      });
      selectMenu.appendChild(item);
    });
    const rect = trigger.getBoundingClientRect();
    selectMenu.style.width = `${Math.max(rect.width, 190)}px`;
    selectMenu.style.left = `${Math.min(rect.left, window.innerWidth - Math.max(rect.width, 190) - 12)}px`;
    selectMenu.hidden = false;
    const menuHeight = selectMenu.offsetHeight;
    const top = rect.bottom + 7 + menuHeight > window.innerHeight ? rect.top - menuHeight - 7 : rect.bottom + 7;
    selectMenu.style.top = `${Math.max(10, top)}px`;
    trigger.setAttribute('aria-expanded', 'true');
  };

  const enhanceSelect = select => {
    if (!(select instanceof HTMLSelectElement) || select.dataset.uiEnhanced === 'true') return;
    if (select.closest('.cashier-payment-modal') || select.closest('.fly-vi-date') || select.closest('[data-keep-native]') || select.closest('.payroll-period-picker') || select.closest('.accounting-payroll') || select.closest('.workforce-payroll-filter') || select.closest('.manager-holidays') || select.closest('.accounting-history') || select.closest('.payroll-fund-queue') || select.closest('.financial-report-filter') || select.closest('.store-pnl-filter')) return;
    select.dataset.uiEnhanced = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-control';
    if (select.classList.contains('role-select')) wrapper.classList.add('role-select-control');
    if (select.closest('.filter-actions')) wrapper.classList.add('filter-select-control');
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.classList.add('ui-native-select');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span></span><svg aria-hidden="true"><use href="#i-chevron"></use></svg>';
    wrapper.appendChild(trigger);
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      openSelectMenu(select, trigger);
    });
    select.addEventListener('change', () => syncSelectControl(select));
    syncSelectControl(select);
  };

  const enhanceSelects = root => root.querySelectorAll('select').forEach(enhanceSelect);
  const selectObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLSelectElement) syncSelectControl(mutation.target);
      const changedSelect = mutation.target instanceof HTMLSelectElement ? mutation.target : mutation.target.closest?.('select');
      if (changedSelect) syncSelectControl(changedSelect);
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches('select')) enhanceSelect(node);
        enhanceSelects(node);
      });
    });
  });
  selectObserver.observe(contentArea, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  document.addEventListener('click', closeSelectMenu);
  document.addEventListener('scroll', closeSelectMenu, true);
  window.addEventListener('resize', closeSelectMenu);

  if (!token || !userStr) {
    window.location.href = '../login/login.html';
    return;
  }

  const user = JSON.parse(userStr);
  const roleName = String(user.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
  const isManager = roleName === 'quản lý';
  const isWarehouse = roleName === 'thủ kho';
  const isPurchasing = roleName === 'nhân viên mua hàng';
  const isAccounting = roleName === 'kế toán';
  const isCashier = roleName === 'thu ngân';
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const initials = String(user.TenNV || 'Quản lý').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();

  document.getElementById('userName').textContent = user.TenNV;
  document.getElementById('userRole').textContent = user.TenVaiTro === 'Quản lý' ? 'Quản lý cửa hàng' : user.TenVaiTro;
  document.getElementById('sidebarRole').textContent = user.TenVaiTro === 'Quản lý' ? 'Quản lý cửa hàng' : user.TenVaiTro;
  document.getElementById('userInitials').textContent = initials || 'QL';
  document.getElementById('managerHomeNav').style.display = isManager ? '' : 'none';
  document.getElementById('managerApprovalNav').style.display = isManager ? '' : 'none';
  document.getElementById('managerPayablesNav').style.display = isManager ? '' : 'none';
  document.getElementById('managerWorkforceNav').style.display = isManager ? '' : 'none';
  const holidaysNav = document.getElementById('managerHolidaysNav');
  if (holidaysNav) holidaysNav.style.display = isManager ? '' : 'none';
  document.getElementById('managerReportNav').style.display = isManager ? '' : 'none';
  if (isManager) document.getElementById('navGroupSystem').style.display = 'block';
  if (isWarehouse) document.getElementById('navGroupWarehouse').style.display = 'block';
  if (isPurchasing) document.getElementById('navGroupPurchasing').style.display = 'block';
  if (isAccounting) document.getElementById('navGroupAccounting').style.display = 'block';
  if (isCashier) document.getElementById('navGroupCashier').style.display = 'block';

  if (isWarehouse) document.getElementById('globalSearch').placeholder = 'Tìm mã, tên sản phẩm hoặc mã vạch...';
  if (isPurchasing) document.getElementById('globalSearch').placeholder = 'Tìm mã đề nghị hoặc người lập...';
  if (isAccounting) document.getElementById('globalSearch').placeholder = 'Tìm hóa đơn, Nhà cung cấp hoặc công nợ...';
  if (isCashier) document.getElementById('globalSearch').placeholder = 'Tìm mã ca hoặc hóa đơn bán hàng...';

  const pageNavItems = Array.from(document.querySelectorAll('.nav-item[data-target]'));
  const setActiveNav = target => pageNavItems.forEach(item => item.classList.toggle('active', item.dataset.target === target));
  const setPageTitle = title => {
    document.getElementById('pageTitle').textContent = title;
    document.title = `${title} - Supermarket Fly`;
  };

  const apiGet = async path => {
    const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (response.status === 401) {
      localStorage.removeItem('fly_token');
      localStorage.removeItem('fly_user');
      window.location.href = '../login/login.html';
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }
    if (!response.ok) throw new Error(data.message || 'Không thể tải dữ liệu.');
    return data;
  };

  const formatToday = () => new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: HANOI_TIME_ZONE
  }).format(new Date()).replace(',', '');
  const formatMoney = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));

  const seenKey = () => `fly_inbox_seen_${user.MaNV || 'nv'}`;
  const readSeen = () => {
    try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || '[]')); }
    catch { return new Set(); }
  };
  const writeSeen = ids => localStorage.setItem(seenKey(), JSON.stringify([...ids].slice(-200)));
  const fmtInboxTime = value => value
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: HANOI_TIME_ZONE }).format(new Date(value))
    : '';
  const workspaceBusy = () => Boolean(
    document.querySelector('.warehouse-modal-backdrop')
    || document.querySelector('#pwdModal[style*="flex"]')
    || contentArea.querySelector('input:focus, textarea:focus')
  );
  const pageContext = () => ({
    token,
    user,
    apiBase: API_BASE,
    showToast: window.showToast,
    navigate: nextTarget => {
      const nextNav = pageNavItems.find(item => item.dataset.target === nextTarget);
      if (nextNav) openPage(nextNav);
    }
  });
  const setNavBadge = (target, count) => {
    const nav = pageNavItems.find(item => item.dataset.target === target);
    if (!nav) return;
    let badge = nav.querySelector('.nav-badge');
    if (!badge && count) {
      badge = document.createElement('b');
      badge.className = 'nav-badge';
      nav.appendChild(badge);
    }
    if (!badge) return;
    badge.textContent = String(count).padStart(2, '0');
    badge.style.display = count ? '' : (badge.id ? '' : 'none');
  };
  const renderInboxPanel = () => {
    const list = document.getElementById('notificationList');
    const hint = document.getElementById('notificationHint');
    const heading = document.getElementById('notificationHeading');
    if (!list) return;
    hint.textContent = window._flyInboxHint || 'Việc liên quan đến vai trò của bạn.';
    heading.textContent = inboxItems.length ? `${inboxItems.length} việc đang chờ bạn` : 'Không có việc tồn';
    list.innerHTML = inboxItems.length
      ? inboxItems.map(item => `<li><button class="notification-item ${escapeHtml(item.tone || 'info')}" type="button" data-inbox-target="${escapeHtml(item.target)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span>${item.at ? `<time>${fmtInboxTime(item.at)}</time>` : ''}</button></li>`).join('')
      : '<li class="notification-empty">Hiện không có việc mới. Khi người trước xong bước của họ, việc sẽ hiện ở đây.</li>';
  };
  const applyInbox = (data, { announce = false } = {}) => {
    const items = data.items || [];
    const previous = new Set(inboxItems.map(item => item.id));
    const seen = readSeen();
    const fresh = items.filter(item => !previous.has(item.id) && !seen.has(item.id) && inboxStamp);
    inboxItems = items;
    inboxStamp = data.stamp || items.map(item => item.id).join('|');
    window._flyInboxHint = data.hint;
    pendingTotal = Number(data.urgent || items.filter(item => item.tone === 'urgent').length);
    const unread = items.filter(item => !seen.has(item.id)).length;
    const countEl = document.getElementById('notificationCount');
    const dot = document.getElementById('notificationDot');
    countEl.textContent = String(unread);
    countEl.classList.toggle('visible', unread > 0);
    dot.classList.toggle('visible', unread > 0);
    const byTarget = items.reduce((map, item) => {
      map[item.target] = (map[item.target] || 0) + 1;
      return map;
    }, {});
    setNavBadge('manager-purchase-approvals', byTarget['manager-purchase-approvals'] || 0);
    setNavBadge('purchasing-inbox', byTarget['purchasing-inbox'] || 0);
    setNavBadge('warehouse-returns', byTarget['warehouse-returns'] || 0);
    setNavBadge('warehouse-receiving', byTarget['warehouse-receiving'] || 0);
    setNavBadge('accounting-settlements', byTarget['accounting-settlements'] || 0);
    setNavBadge('cashier-returns', byTarget['cashier-returns'] || 0);
    if (!document.getElementById('notificationPanel').hidden) renderInboxPanel();
    if (announce && fresh.length) {
      const extra = fresh.length > 1 ? ` và ${fresh.length - 1} việc khác` : '';
      window.showToast(`Việc mới: ${fresh[0].title}${extra}`, 'success');
      const currentTarget = currentNav?.dataset.target;
      const shouldReload = fresh.some(item => item.target === currentTarget || (currentTarget === 'home' && item.target === 'manager-purchase-approvals'));
      if (shouldReload && !workspaceBusy()) refreshCurrentPage();
    }
  };
  const refreshCurrentPage = async () => {
    if (!currentNav) return;
    const target = currentNav.dataset.target;
    const pageName = target.split('/').pop();
    if (target === 'home') return loadOverview();
    if (window.FLY_ROLE_PAGES?.templates?.[pageName]) {
      try { await window.FLY_ROLE_PAGES.init(pageName, pageContext()); }
      catch (error) { console.warn(error); }
    }
  };
  const loadInbox = async ({ announce = false } = {}) => {
    try {
      const data = await apiGet('/notifications');
      applyInbox(data, { announce });
    } catch { /* giữ inbox cũ nếu API tạm lỗi */ }
  };
  const updatePendingIndicators = total => {
    pendingTotal = Number(total || 0);
    document.getElementById('approvalNavBadge').textContent = String(pendingTotal).padStart(2, '0');
    document.getElementById('notificationDot').classList.toggle('visible', pendingTotal > 0);
  };

  const loadOverview = async () => {
    const loadVersion = ++navigationVersion;
    closeSelectMenu();
    contentArea.scrollTop = 0;
    setPageTitle('Tổng quan');
    if (!isManager) {
      contentArea.innerHTML = `<div class="welcome-card"><h2>Chào mừng ${escapeHtml(user.TenNV)}</h2><p>Các chức năng của ${escapeHtml(user.TenVaiTro)} sẽ được hiển thị theo quyền đã cấp.</p></div>`;
      return;
    }

    contentArea.innerHTML = '<div class="overview-loading">Đang tổng hợp dữ liệu điều hành...</div>';
    try {
      const [data, catalog] = await Promise.all([
        apiGet('/admin/dashboard'),
        apiGet('/admin/catalog/products').catch(() => ({ items: [], summary: {} }))
      ]);
      if (loadVersion !== navigationVersion) return;
      const summary = data.summary;
      const pending = data.pendingApprovals;
      document.getElementById('approvalNavBadge').textContent = String(pending.TongChoDuyet || 0).padStart(2, '0');

      const warehousePending = Number(pending.PhieuXuat || 0) + Number(pending.KiemKe || 0);
      const financePending = Number(pending.DoiTra || 0) + Number(pending.PhieuChi || 0);
      const totalStaff = data.roleDistribution.reduce((s, r) => s + Number(r.SoNhanVien || 0), 0) || 1;
      const maxRole = Math.max(1, ...data.roleDistribution.map(role => Number(role.SoNhanVien || 0)));
      const roleGradients = ['#2d6a4f,#40916c', '#1b7fa3,#34b3d5', '#7c5cbf,#a78bfa', '#c97a0a,#eab308', '#c4553d,#f87171'];
      const roleBars = data.roleDistribution.map((role, i) => {
        const pct = (Number(role.SoNhanVien || 0) / totalStaff * 100).toFixed(1);
        const grad = roleGradients[i % roleGradients.length];
        return `
        <div class="role-bar-row" style="cursor:pointer" data-open-target="../admin/employees.html" title="Xem nhân viên ${escapeHtml(role.TenVaiTro)}">
          <span>${escapeHtml(role.TenVaiTro)}</span>
          <div class="role-bar-track"><div class="role-bar-fill" style="width:${Math.max(4, Number(role.SoNhanVien || 0) / maxRole * 100)}%;background:linear-gradient(90deg,${grad})"></div></div>
          <b>${role.SoNhanVien}<small class="role-pct">${pct}%</small></b>
        </div>`;
      }).join('');

      const logIconMap = { 'Đăng nhập': '🔐', 'Đăng xuất': '🔐', 'Phê duyệt': '📋', 'Từ chối': '📋', 'Thanh toán': '💰', 'Nhập kho': '📦', 'Xuất kho': '📦', 'Đổi trả': '🔄', 'Cập nhật': '⚙️', 'Tạo mới': '✨', 'Xóa': '🗑️' };
      const getLogIcon = action => {
        for (const [key, icon] of Object.entries(logIconMap)) {
          if (String(action).includes(key)) return icon;
        }
        return '📝';
      };
      const timeAgo = dateStr => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Vừa xong';
        if (mins < 60) return `${mins} phút trước`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} giờ trước`;
        return `${Math.floor(hrs / 24)} ngày trước`;
      };
      const logRows = data.recentLogs.length ? data.recentLogs.slice(0, 8).map(log => {
        const icon = getLogIcon(log.HanhDong);
        const absTime = new Date(log.ThoiGian).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: HANOI_TIME_ZONE });
        const isLogin = String(log.HanhDong).includes('Đăng nhập') || String(log.HanhDong).includes('Đăng xuất');
        return `
        <li class="activity-item" title="${escapeHtml(absTime + ' · ' + (log.NoiDung || ''))}">
          <span class="activity-icon">${icon}</span>
          <div class="activity-body">
            <strong>${escapeHtml(log.HanhDong)}</strong>
            <p>${escapeHtml(log.NoiDung || log.NguoiThaoTac || 'Hoạt động hệ thống')}</p>
          </div>
          <div class="activity-meta">
            <time>${timeAgo(log.ThoiGian)}</time>
            <span class="activity-status-badge ${isLogin ? 'login' : 'success'}">Thành công</span>
          </div>
        </li>`;
      }).join('') : '<li class="empty-row">Chưa có hoạt động gần đây.</li>';
      const priorityTitle = pending.TongChoDuyet > 0 ? `${String(pending.TongChoDuyet).padStart(2, '0')} nghiệp vụ đang chờ quyết định` : 'Hệ thống chưa có nghiệp vụ tồn đọng';
      const priorityText = pending.TongChoDuyet > 0
        ? 'Đơn mua hàng, chứng từ kho, đề nghị đổi trả và thanh toán đang chờ Quản lý xem xét.'
        : 'Các công việc chờ phê duyệt đã được xử lý. Hãy tiếp tục kiểm tra nhân sự, tài khoản và hoạt động hệ thống.';
      const featuredProducts = (catalog.items || [])
        .filter(item => item.TrangThai === 'Đang bán' && window.FLY_PRODUCT_IMAGES?.hasImage(item))
        .sort((left, right) => {
          const leftRisk = Number(left.SLTon || 0) - Number(left.TonKhoToiThieu || 0);
          const rightRisk = Number(right.SLTon || 0) - Number(right.TonKhoToiThieu || 0);
          return leftRisk - rightRisk || String(left.MaSP).localeCompare(String(right.MaSP));
        })
        .slice(0, 6);
      const productCards = featuredProducts.map((item, index) => {
        const low = Number(item.SLTon || 0) <= Number(item.TonKhoToiThieu || 0);
        return `<article class="overview-product-card ${low ? 'low' : ''}">
          <div class="overview-product-visual">${window.FLY_PRODUCT_IMAGES.markup(item, { className: 'overview-product-photo', eager: index < 3 })}<span>${escapeHtml(item.TenDM || item.MaDM || 'Hàng hóa')}</span></div>
          <div class="overview-product-copy"><small>${escapeHtml(item.MaSP)}</small><h3>${escapeHtml(item.TenSP)}</h3><strong>${formatMoney(item.GiaBan)}</strong><div><span>Còn ${Number(item.SLTon || 0).toLocaleString('vi-VN')} ${escapeHtml(item.DonViTinh || '')}</span><b>${low ? 'Cần bổ sung' : 'Sẵn sàng'}</b></div></div>
        </article>`;
      }).join('');

      contentArea.innerHTML = `
        <section class="overview-page">
          <header class="overview-heading">
            <div><p class="eyebrow">TỔNG QUAN / CỬA HÀNG CHÍNH</p><h1>Nhịp điều hành hôm nay</h1><p>Theo dõi ưu tiên cần quyết định, tình trạng nhân sự và kiểm soát hệ thống tại một nơi.</p></div>
            <div class="date-chip"><svg><use href="#i-calendar"/></svg><span>Hôm nay, ${formatToday()}</span></div>
          </header>

          <article class="priority-banner">
            <div class="priority-copy"><span class="priority-label"><svg><use href="#i-clock"/></svg> ƯU TIÊN ĐẦU NGÀY</span><h2>${priorityTitle}</h2><p>${priorityText}</p><button type="button" data-action="approval">Mở danh sách phê duyệt <svg><use href="#i-chevron"/></svg></button></div>
            <div class="priority-number"><span>Trong đó</span><strong>${String(financePending).padStart(2, '0')}</strong><small>liên quan tài chính</small></div>
          </article>

          <div class="section-heading"><div><p>CẦN XỬ LÝ</p><h2>Công việc chờ phê duyệt</h2></div><button type="button" data-action="approval">Xem tất cả <svg><use href="#i-chevron"/></svg></button></div>
          <div class="decision-grid">
            <article class="decision-card amber"><div class="card-top"><span class="decision-icon"><svg><use href="#i-approve"/></svg></span><strong>${String(pending.DonMuaHang || 0).padStart(2,'0')}</strong></div><h3>Đơn mua hàng chờ phê duyệt</h3><p>Kiểm tra nhà cung cấp, số lượng và điều khoản thanh toán</p><button type="button" data-action="approval">Xem đơn mua hàng <svg><use href="#i-chevron"/></svg></button></article>
            <article class="decision-card red"><div class="card-top"><span class="decision-icon"><svg><use href="#i-box"/></svg></span><strong>${String(warehousePending).padStart(2,'0')}</strong></div><h3>Chứng từ kho chờ phê duyệt</h3><p>Phiếu xuất kho và đề nghị điều chỉnh sau kiểm kê</p><button type="button" data-action="approval">Xem chứng từ <svg><use href="#i-chevron"/></svg></button></article>
            <article class="decision-card blue"><div class="card-top"><span class="decision-icon"><svg><use href="#i-report"/></svg></span><strong>${String(financePending).padStart(2,'0')}</strong></div><h3>Đề nghị thanh toán và đổi trả</h3><p>Hồ sơ đã có kết quả kiểm tra hoặc chứng từ liên quan</p><button type="button" data-action="approval">Xem đề nghị <svg><use href="#i-chevron"/></svg></button></article>
          </div>

          <div class="stat-grid">
            <article class="stat-card"><div><span>DOANH THU HÔM NAY</span><i><svg><use href="#i-trend"/></svg></i></div><strong>${formatMoney(data.revenue?.DoanhThuHomNay || 0)}</strong><small>Lãi gộp: ${formatMoney(data.revenue?.LaiGopHomNay || 0)}</small></article>
            <article class="stat-card"><div><span>DOANH THU 7 NGÀY</span><i><svg><use href="#i-report"/></svg></i></div><strong>${formatMoney(data.revenue?.DoanhThu7Ngay || 0)}</strong><small>Tổng doanh thu tuần gần nhất</small></article>
            <article class="stat-card"><div><span>CA POS ĐANG MỞ</span><i><svg><use href="#i-clock"/></svg></i></div><strong>${summary.CaDangMo || 0}</strong><small>Thu ngân chưa đóng ca bán hàng</small></article>
            <article class="stat-card"><div><span>HỒ SƠ NHÂN SỰ</span><i><svg><use href="#i-users"/></svg></i></div><strong>${summary.NhanVienDangLam}</strong><small>Đang làm việc tại cửa hàng</small></article>
            <article class="stat-card ${summary.ChuaCoTaiKhoan ? 'attention' : ''}"><div><span>CHƯA CÓ TÀI KHOẢN</span><i><svg><use href="#i-user-plus"/></svg></i></div><strong>${summary.ChuaCoTaiKhoan}</strong><small><b>${summary.ChuaCoTaiKhoan}</b> nhân viên chưa được cấp tài khoản</small></article>
            <article class="stat-card ${summary.TaiKhoanBiKhoa ? 'attention' : ''}"><div><span>TÀI KHOẢN BỊ KHÓA</span><i><svg><use href="#i-lock"/></svg></i></div><strong>${summary.TaiKhoanBiKhoa}</strong><small><b>${summary.ThaoTacHomNay}</b> thao tác hôm nay</small></article>
          </div>

          ${(data.lowStock || []).length > 0 ? `<div class="section-heading"><div><p>CẢNH BÁO TỒN KHO</p><h2>Sản phẩm cần bổ sung</h2></div><button type="button" data-open-target="../admin/products.html">Xem tất cả <svg><use href="#i-chevron"/></svg></button></div>
          <div class="decision-grid">${data.lowStock.slice(0, 6).map(item => `<article class="decision-card red" style="cursor:default"><div class="card-top"><span class="decision-icon"><svg><use href="#i-warning"/></svg></span><strong>${item.SLTon}</strong></div><h3>${escapeHtml(item.TenSP)}</h3><p>${escapeHtml(item.MaSP)} · Tối thiểu: ${item.TonKhoToiThieu} ${escapeHtml(item.DonViTinh)}</p></article>`).join('')}</div>` : ''}

          <section class="overview-product-showcase">
            <div class="section-heading"><div><p>HÀNG HÓA TRỰC QUAN</p><h2>Sản phẩm cần theo dõi</h2><span>Ưu tiên những mặt hàng gần hoặc dưới mức tồn tối thiểu.</span></div><button type="button" data-open-target="../admin/products.html">Quản lý sản phẩm <svg><use href="#i-chevron"/></svg></button></div>
            <div class="overview-product-grid">${productCards || '<div class="overview-product-empty">Chưa có ảnh sản phẩm phù hợp với dữ liệu hiện tại.</div>'}</div>
          </section>

          <div class="overview-columns">
            <article class="overview-panel">
              <div class="panel-title"><div><p class="module-kicker">TÌNH HÌNH NHÂN SỰ</p><h3>Cơ cấu nhân sự theo chức vụ</h3><p>Tổng hợp từ hồ sơ nhân viên đang làm việc tại cửa hàng.</p></div><button class="quick-link" data-open-target="../admin/employees.html" aria-label="Mở danh sách nhân viên"><svg><use href="#i-chevron"/></svg></button></div>
              <div class="role-chart"><div class="role-chart-summary"><div><span>Đang làm việc</span><strong>${summary.NhanVienDangLam}</strong></div><div><span>Nhóm chức vụ</span><strong>${data.roleDistribution.length} nhóm</strong></div></div><div class="role-bars">${roleBars}</div></div>
            </article>
            <article class="overview-panel">
              <div class="panel-title"><div><p class="module-kicker">NHẬT KÝ HOẠT ĐỘNG</p><h3>Hoạt động gần đây</h3></div><button class="quick-link" data-open-target="../admin/audit-log.html" aria-label="Mở nhật ký hệ thống"><svg><use href="#i-chevron"/></svg></button></div>
              <ul class="activity-list">${logRows}</ul>
            </article>
          </div>
        </section>`;
    } catch (error) {
      if (loadVersion !== navigationVersion) return;
      contentArea.innerHTML = `<div class="welcome-card"><h2>Không thể tải dữ liệu điều hành</h2><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" id="retryOverview">Thử lại</button></div>`;
      document.getElementById('retryOverview')?.addEventListener('click', loadOverview);
    }
  };

  const resolvePageHtml = async pageName => {
    if (window.FLY_ROLE_PAGES?.templates?.[pageName]) return window.FLY_ROLE_PAGES.templates[pageName];
    if (window.FLY_ADMIN_TEMPLATES?.[pageName]) return window.FLY_ADMIN_TEMPLATES[pageName];
    const isAdminPage = String(pageName || '').endsWith('.html');
    if (isAdminPage && window.flyDesktop?.loadAdminPage) {
      try { return await window.flyDesktop.loadAdminPage(pageName); }
      catch (error) { console.warn('IPC page loader unavailable, using HTTP fallback:', error.message); }
    }
    if (isAdminPage) {
      const response = await fetch(`../admin/${pageName}`);
      if (!response.ok) throw new Error('Không thể tải nội dung trang quản trị.');
      return response.text();
    }
    throw new Error('Không tải được màn hình này. Hãy đóng ứng dụng rồi chạy lại npm start.');
  };

  const executeFragmentScripts = async () => {
    const scripts = Array.from(contentArea.querySelectorAll('script'));
    for (const script of scripts) {
      await new Promise((resolve, reject) => {
        const executable = document.createElement('script');
        if (script.getAttribute('src')) {
          executable.src = new URL(script.getAttribute('src'), window.location.href).href;
          executable.onload = () => { executable.remove(); resolve(); };
          executable.onerror = () => { executable.remove(); reject(new Error('Không thể tải mã xử lý của trang.')); };
        } else {
          executable.textContent = script.textContent;
          document.body.appendChild(executable);
          executable.remove();
          resolve();
          return;
        }
        document.body.appendChild(executable);
      });
    }
  };

  const openPage = async navItem => {
    closeSelectMenu();
    currentNav = navItem;
    const target = navItem.dataset.target;
    setActiveNav(target);
    if (target === 'home') return loadOverview();
    const pageVersion = ++navigationVersion;
    contentArea.scrollTop = 0;
    setPageTitle(navItem.querySelector('span')?.textContent.trim() || 'Quản trị');
    contentArea.innerHTML = '<div class="overview-loading">Đang tải nội dung...</div>';
    try {
      const pageName = target.split('/').pop();
      const pageHtml = await resolvePageHtml(pageName);
      if (pageVersion !== navigationVersion) return;
      contentArea.innerHTML = pageHtml;
      await executeFragmentScripts();
      if (window.FLY_ROLE_PAGES?.templates?.[pageName]) {
        await window.FLY_ROLE_PAGES.init(pageName, pageContext());
      }
    } catch (error) {
      if (pageVersion !== navigationVersion) return;
      contentArea.innerHTML = `<div class="welcome-card"><h2>Không thể mở trang</h2><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" id="retryPage">Thử lại</button></div>`;
      document.getElementById('retryPage')?.addEventListener('click', () => openPage(navItem));
    }
  };

  pageNavItems.forEach(item => item.addEventListener('click', event => {
    event.preventDefault();
    openPage(item);
  }));
  document.querySelectorAll('[data-coming-soon]').forEach(item => item.addEventListener('click', event => {
    event.preventDefault();
    window.showToast(`${item.dataset.comingSoon} đang nằm trong lộ trình tiếp theo.`, 'success');
  }));

  contentArea.addEventListener('click', event => {
    const quickLink = event.target.closest('[data-open-target]');
    if (quickLink) {
      const nav = pageNavItems.find(item => item.dataset.target === quickLink.dataset.openTarget);
      if (nav) openPage(nav);
      return;
    }
    if (event.target.closest('[data-action="approval"]')) {
      const approvalNav = pageNavItems.find(item => item.dataset.target === 'manager-purchase-approvals');
      if (approvalNav) openPage(approvalNav);
    }
  });

  const logout = () => {
    localStorage.removeItem('fly_token');
    localStorage.removeItem('fly_user');
    window.location.href = '../login/login.html';
  };
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('menuLogout').addEventListener('click', logout);

  const pwdModal = document.getElementById('pwdModal');
  const openPasswordModal = event => { event?.preventDefault(); pwdModal.style.display = 'flex'; document.getElementById('oldPwd').focus(); };
  const closePasswordModal = () => { pwdModal.style.display = 'none'; document.getElementById('pwdForm').reset(); };
  document.getElementById('btnChangePassword').addEventListener('click', openPasswordModal);
  document.getElementById('menuChangePassword').addEventListener('click', openPasswordModal);
  document.getElementById('closePwdModal').addEventListener('click', closePasswordModal);
  document.getElementById('cancelPwdModal').addEventListener('click', closePasswordModal);

  const profileMenu = document.getElementById('profileMenu');
  document.getElementById('profileButton').addEventListener('click', event => {
    event.stopPropagation();
    profileMenu.hidden = !profileMenu.hidden;
  });
  document.addEventListener('click', () => { profileMenu.hidden = true; });
  const notificationPanel = document.getElementById('notificationPanel');
  const notificationButton = document.getElementById('notificationButton');
  const closeInboxPanel = () => {
    notificationPanel.hidden = true;
    notificationButton.setAttribute('aria-expanded', 'false');
  };
  const openInboxPanel = () => {
    profileMenu.hidden = true;
    renderInboxPanel();
    notificationPanel.hidden = false;
    notificationButton.setAttribute('aria-expanded', 'true');
    writeSeen(new Set([...readSeen(), ...inboxItems.map(item => item.id)]));
    document.getElementById('notificationCount').classList.remove('visible');
    document.getElementById('notificationDot').classList.remove('visible');
  };
  notificationButton.addEventListener('click', event => {
    event.stopPropagation();
    if (notificationPanel.hidden) openInboxPanel();
    else closeInboxPanel();
  });
  document.getElementById('notificationClose').addEventListener('click', event => {
    event.stopPropagation();
    closeInboxPanel();
  });
  notificationPanel.addEventListener('click', event => {
    event.stopPropagation();
    const button = event.target.closest('[data-inbox-target]');
    if (!button) return;
    closeInboxPanel();
    const nav = pageNavItems.find(item => item.dataset.target === button.dataset.inboxTarget);
    if (nav) openPage(nav);
  });
  document.addEventListener('click', closeInboxPanel);

  document.getElementById('globalSearchForm').addEventListener('submit', async event => {
    event.preventDefault();
    const query = document.getElementById('globalSearch').value.trim();
    if (!query) return;
    const normalizeSearch = window.FLY_SEARCH?.normalize || (value => String(value ?? '').trim().toLocaleLowerCase('vi-VN'));
    const normalizedQuery = normalizeSearch(query);
    const matchingNavigation = pageNavItems.find(item => {
      if (item.offsetParent === null) return false;
      const label = normalizeSearch(item.textContent);
      return label && (label.includes(normalizedQuery) || normalizedQuery.includes(label));
    });
    if (matchingNavigation) {
      await openPage(matchingNavigation);
      window.showToast(`Đã mở ${matchingNavigation.textContent.trim()}.`, 'success');
      return;
    }
    const destination = isWarehouse ? 'warehouse-inventory'
      : isPurchasing ? 'purchasing-inbox'
      : isCashier ? 'cashier-invoices'
      : isAccounting ? 'accounting-invoices'
      : '../admin/employees.html';
    const destinationNav = pageNavItems.find(item => item.dataset.target === destination);
    if (!destinationNav) return;
    await openPage(destinationNav);
    const search = document.getElementById(isWarehouse ? 'inventorySearch' : isPurchasing ? 'purchasingSearch' : isCashier ? 'invoiceQuery' : isAccounting ? 'invoiceSearch' : 'empSearch');
    if (search) {
      search.value = query;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.focus();
    }
  });

  document.getElementById('pwdForm').addEventListener('submit', async event => {
    event.preventDefault();
    const oldPwd = document.getElementById('oldPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirmPwd = document.getElementById('confirmPwd').value;
    if (newPwd !== confirmPwd) return window.showToast('Mật khẩu xác nhận không khớp.', 'error');
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ MatKhauCu: oldPwd, MatKhauMoi: newPwd })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể đổi mật khẩu.');
      closePasswordModal();
      window.showToast(data.message, 'success');
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  loadInbox();
  clearInterval(inboxTimer);
  inboxTimer = setInterval(() => loadInbox({ announce: true }), 12000);

  if (isManager) {
    loadOverview();
  } else {
    const firstTarget = isWarehouse ? 'warehouse-home'
      : isPurchasing ? 'purchasing-inbox'
        : isAccounting ? 'accounting-invoices'
          : isCashier ? 'cashier-schedule' : null;
    const firstNav = pageNavItems.find(item => item.dataset.target === firstTarget);
    if (firstNav) openPage(firstNav);
    else loadOverview();
  }
});
