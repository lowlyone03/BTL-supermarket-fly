const API_BASE = 'http://localhost:3000/api';
const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('fly_token');
  const userStr = localStorage.getItem('fly_user');
  const contentArea = document.getElementById('contentArea');
  const toast = document.getElementById('appToast');
  let toastTimer;
  let pendingTotal = 0;
  let navigationVersion = 0;

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
      const data = await apiGet('/admin/dashboard');
      if (loadVersion !== navigationVersion) return;
      const summary = data.summary;
      const pending = data.pendingApprovals;
      updatePendingIndicators(pending.TongChoDuyet);

      const warehousePending = Number(pending.PhieuXuat || 0) + Number(pending.KiemKe || 0);
      const financePending = Number(pending.DoiTra || 0) + Number(pending.PhieuChi || 0);
      const maxRole = Math.max(1, ...data.roleDistribution.map(role => Number(role.SoNhanVien || 0)));
      const roleBars = data.roleDistribution.map(role => `
        <div class="role-bar-row">
          <span>${escapeHtml(role.TenVaiTro)}</span>
          <div class="role-bar-track"><div class="role-bar-fill" style="width:${Math.max(2, Number(role.SoNhanVien || 0) / maxRole * 100)}%"></div></div>
          <b>${role.SoNhanVien}</b>
        </div>`).join('');
      const logRows = data.recentLogs.length ? data.recentLogs.map(log => `
        <li><span class="activity-dot"></span><div><strong>${escapeHtml(log.HanhDong)}</strong><p>${escapeHtml(log.NoiDung || log.NguoiThaoTac || 'Hoạt động hệ thống')}</p></div><time>${new Date(log.ThoiGian).toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit',timeZone:HANOI_TIME_ZONE})}</time></li>`).join('') : '<li class="empty-row">Chưa có hoạt động gần đây.</li>';
      const priorityTitle = pending.TongChoDuyet > 0 ? `${String(pending.TongChoDuyet).padStart(2, '0')} nghiệp vụ đang chờ quyết định` : 'Hệ thống chưa có nghiệp vụ tồn đọng';
      const priorityText = pending.TongChoDuyet > 0
        ? 'Đơn mua hàng, chứng từ kho, đề nghị đổi trả và thanh toán đang chờ Quản lý xem xét.'
        : 'Các công việc chờ phê duyệt đã được xử lý. Hãy tiếp tục kiểm tra nhân sự, tài khoản và hoạt động hệ thống.';

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
            <article class="stat-card"><div><span>NHÂN VIÊN ĐANG LÀM VIỆC</span><i><svg><use href="#i-users"/></svg></i></div><strong>${summary.NhanVienDangLam}</strong><small><b>${summary.TongNhanVien}</b> hồ sơ nhân sự</small></article>
            <article class="stat-card"><div><span>TÀI KHOẢN HỆ THỐNG</span><i><svg><use href="#i-key"/></svg></i></div><strong>${summary.TongTaiKhoan}</strong><small><b>${summary.TongTaiKhoan - summary.TaiKhoanBiKhoa}</b> tài khoản hoạt động</small></article>
            <article class="stat-card ${summary.ChuaCoTaiKhoan ? 'attention' : ''}"><div><span>CHƯA CÓ TÀI KHOẢN</span><i><svg><use href="#i-user-plus"/></svg></i></div><strong>${summary.ChuaCoTaiKhoan}</strong><small><b>${summary.ChuaCoTaiKhoan}</b> nhân viên chưa được cấp tài khoản</small></article>
            <article class="stat-card ${summary.TaiKhoanBiKhoa ? 'attention' : ''}"><div><span>TÀI KHOẢN BỊ KHÓA</span><i><svg><use href="#i-lock"/></svg></i></div><strong>${summary.TaiKhoanBiKhoa}</strong><small><b>${summary.ThaoTacHomNay}</b> thao tác hôm nay</small></article>
          </div>

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
    if (window.flyDesktop?.loadAdminPage) {
      try { return await window.flyDesktop.loadAdminPage(pageName); }
      catch (error) { console.warn('IPC page loader unavailable, using HTTP fallback:', error.message); }
    }
    const response = await fetch(`../admin/${pageName}`);
    if (!response.ok) throw new Error('Không thể tải nội dung trang quản trị.');
    return response.text();
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
        await window.FLY_ROLE_PAGES.init(pageName, {
          token,
          apiBase: API_BASE,
          showToast: window.showToast,
          navigate: nextTarget => {
            const nextNav = pageNavItems.find(item => item.dataset.target === nextTarget);
            if (nextNav) openPage(nextNav);
          }
        });
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
  document.getElementById('notificationButton').addEventListener('click', () => {
    if (isWarehouse) return window.showToast('Cảnh báo kho được tổng hợp theo tồn tối thiểu của từng mặt hàng.', 'success');
    if (isPurchasing) return window.showToast('Đề nghị mới từ kho được hiển thị trong mục Đề nghị từ kho.', 'success');
    window.showToast(pendingTotal ? `Có ${pendingTotal} nghiệp vụ đang chờ Quản lý quyết định.` : 'Hiện không có nghiệp vụ chờ duyệt.', 'success');
  });

  document.getElementById('globalSearchForm').addEventListener('submit', async event => {
    event.preventDefault();
    const query = document.getElementById('globalSearch').value.trim();
    if (!query) return;
    const destination = isWarehouse ? 'warehouse-inventory' : isPurchasing ? 'purchasing-inbox' : '../admin/employees.html';
    const destinationNav = pageNavItems.find(item => item.dataset.target === destination);
    if (!destinationNav) return;
    await openPage(destinationNav);
    const search = document.getElementById(isWarehouse ? 'inventorySearch' : isPurchasing ? 'purchasingSearch' : 'empSearch');
    if (search) {
      search.value = query;
      search.dispatchEvent(new Event('input'));
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

  if (isManager) {
    loadOverview();
  } else {
    const firstTarget = isWarehouse ? 'warehouse-home'
      : isPurchasing ? 'purchasing-inbox'
        : isAccounting ? 'accounting-invoices'
          : isCashier ? 'cashier-shifts' : null;
    const firstNav = pageNavItems.find(item => item.dataset.target === firstTarget);
    if (firstNav) openPage(firstNav);
    else loadOverview();
  }
});
