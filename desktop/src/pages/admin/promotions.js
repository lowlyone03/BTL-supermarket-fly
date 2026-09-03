(() => {
  const API = 'http://localhost:3000/api/admin/catalog';
  const token = localStorage.getItem('fly_token');
  let items = [];
  let editingCode = null;
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const dateOnly = value => value ? String(value).slice(0, 10) : '';
  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };

  const getPromoStatus = (item) => {
    const today = new Date().toISOString().slice(0, 10);
    const end = dateOnly(item.NgayKetThuc);
    if (end && end < today) return 'expired';
    if (item.TrangThai === 'Ngừng') return 'paused';
    return 'active';
  };

  const getCountdown = (item) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = item.NgayKetThuc ? new Date(dateOnly(item.NgayKetThuc)) : null;
    if (!end) return '';
    const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return '<span class="promo-countdown expired">Đã hết hạn</span>';
    if (diff === 0) return '<span class="promo-countdown expiring">Hết hạn hôm nay</span>';
    if (diff <= 7) return `<span class="promo-countdown expiring">Còn ${diff} ngày</span>`;
    return `<span class="promo-countdown">Còn ${diff} ngày</span>`;
  };

  const statusBadgeClass = (status) => {
    if (status === 'active') return 'badge badge-success';
    if (status === 'expired') return 'badge badge-secondary';
    return 'badge badge-warning';
  };

  const statusLabel = (status) => {
    if (status === 'active') return 'Hiệu lực';
    if (status === 'expired') return 'Hết hạn';
    return 'Tạm ngừng';
  };

  window.loadPromotions = async () => {
    try {
      const search = document.getElementById('promoSearch')?.value || '';
      const data = await api(`/promotions?search=${encodeURIComponent(search)}`);
      items = data.items || [];

      const statusFilter = document.getElementById('promoStatusFilter')?.value || '';
      let filtered = items;
      if (statusFilter) filtered = items.filter(i => getPromoStatus(i) === statusFilter);

      const activeCount = items.filter(i => getPromoStatus(i) === 'active').length;
      const pausedCount = items.filter(i => getPromoStatus(i) === 'paused').length;
      const expiredCount = items.filter(i => getPromoStatus(i) === 'expired').length;

      const el = id => document.getElementById(id);
      el('promoCount').textContent = `${items.length} chương trình`;
      if (el('promoActiveCount')) el('promoActiveCount').textContent = activeCount;
      if (el('promoPausedCount')) el('promoPausedCount').textContent = pausedCount;
      if (el('promoExpiredCount')) el('promoExpiredCount').textContent = expiredCount;

      el('promoTableBody').innerHTML = filtered.length ? filtered.map(item => {
        const status = getPromoStatus(item);
        const countdown = getCountdown(item);
        return `<tr>
        <td><strong>${esc(item.TenKM)}</strong><small>${esc(item.MaKM)}</small></td>
        <td>${esc(item.LoaiKM)} · ${item.LoaiKM === 'Phần trăm' ? `${item.GiaTri}%` : money(item.GiaTri)}</td>
        <td><span>${dateOnly(item.NgayBatDau)} → ${dateOnly(item.NgayKetThuc)}</span>${countdown}</td>
        <td><span class="${statusBadgeClass(status)}">${statusLabel(status)}</span></td>
        <td class="align-right"><div class="action-group"><button class="btn-outline" data-edit-promo="${esc(item.MaKM)}">Cập nhật</button><button class="btn-outline ${item.TrangThai === 'Hiệu lực' ? 'danger-text' : ''}" data-toggle-promo="${esc(item.MaKM)}">${item.TrangThai === 'Hiệu lực' ? 'Ngừng' : 'Kích hoạt'}</button></div></td>
      </tr>`;
      }).join('') : `<tr><td colspan="5" class="empty-state"><div class="promo-empty-state"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#d3e1d8" stroke-width="2"/><path d="M16 24l6 6 10-12" stroke="#40916c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><strong>Chưa có chương trình khuyến mãi</strong><span>Tạo chương trình mới để thu ngân có thể chọn trên POS.</span></div></td></tr>`;
    } catch (error) { window.showToast(error.message, 'error'); }
  };

  window.suggestPromoCode = () => {
    const now = new Date();
    const code = `KM${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 900) + 100)}`;
    document.getElementById('promoCode').value = code;
    validateField('promoCode');
  };

  // Validation
  const showError = (id, msg) => {
    const el = document.getElementById(id);
    const errEl = document.getElementById(id + 'Error');
    if (el) el.classList.toggle('input-error', !!msg);
    if (errEl) { errEl.textContent = msg || ''; errEl.style.display = msg ? 'block' : 'none'; }
  };

  const validateField = (fieldId) => {
    const val = document.getElementById(fieldId)?.value?.trim() || '';
    switch (fieldId) {
      case 'promoCode':
        showError('promoCode', val.length < 1 ? 'Vui lòng nhập mã khuyến mãi.' : '');
        break;
      case 'promoName':
        showError('promoName', val.length < 3 ? 'Tên chương trình phải có ít nhất 3 ký tự.' : '');
        break;
      case 'promoValue': {
        const type = document.getElementById('promoType')?.value;
        const num = Number(val);
        if (type === 'Phần trăm') {
          showError('promoValue', (num < 0 || num > 100) ? 'Phần trăm phải từ 0 đến 100.' : '');
        } else {
          showError('promoValue', num <= 0 ? 'Giá trị phải lớn hơn 0.' : '');
        }
        break;
      }
      case 'promoStart':
      case 'promoEnd': {
        const start = document.getElementById('promoStart')?.value;
        const end = document.getElementById('promoEnd')?.value;
        showError('promoStart', !start ? 'Vui lòng chọn ngày bắt đầu.' : '');
        if (start && end && end < start) {
          showError('promoEnd', 'Ngày kết thúc phải >= ngày bắt đầu.');
        } else {
          showError('promoEnd', !end ? 'Vui lòng chọn ngày kết thúc.' : '');
        }
        break;
      }
    }
    updateSubmitState();
  };

  const validateAll = () => {
    ['promoCode', 'promoName', 'promoValue', 'promoStart', 'promoEnd'].forEach(validateField);
    return !document.querySelectorAll('#promoForm .input-error').length;
  };

  const updateSubmitState = () => {
    const btn = document.getElementById('promoSubmitBtn');
    if (!btn) return;
    const code = document.getElementById('promoCode')?.value?.trim();
    const name = document.getElementById('promoName')?.value?.trim();
    const value = document.getElementById('promoValue')?.value?.trim();
    const start = document.getElementById('promoStart')?.value;
    const end = document.getElementById('promoEnd')?.value;
    const hasErrors = document.querySelectorAll('#promoForm .input-error').length > 0;
    const allFilled = code && name && value && start && end;
    btn.disabled = hasErrors || !allFilled;
  };

  // Blur validation listeners
  ['promoCode', 'promoName', 'promoValue', 'promoStart', 'promoEnd'].forEach(id => {
    document.getElementById(id)?.addEventListener('blur', () => validateField(id));
    document.getElementById(id)?.addEventListener('input', () => {
      if (document.getElementById(id)?.classList.contains('input-error')) validateField(id);
      updateSubmitState();
    });
  });

  // Toggle switch for status
  document.getElementById('promoStatusToggle')?.addEventListener('change', function () {
    const label = document.getElementById('promoStatusLabel');
    if (label) label.textContent = this.checked ? 'Hiệu lực' : 'Ngừng';
  });

  // Update suffix when type changes
  document.getElementById('promoType')?.addEventListener('change', function () {
    const suffix = document.getElementById('promoValueSuffix');
    const help = document.getElementById('promoValueHelp');
    if (suffix) suffix.textContent = this.value === 'Phần trăm' ? '%' : 'đ';
    if (help) help.textContent = this.value === 'Phần trăm' ? 'Phần trăm: 0–100' : 'Số tiền: > 0';
    validateField('promoValue');
  });

  // Status filter
  document.getElementById('promoStatusFilter')?.addEventListener('change', () => window.loadPromotions());

  window.openPromoModal = code => {
    editingCode = code || null;
    const item = items.find(row => row.MaKM === code);
    document.getElementById('promoModalTitle').textContent = item ? 'Cập nhật khuyến mãi' : 'Thêm khuyến mãi';
    document.getElementById('promoCode').disabled = Boolean(item);
    document.getElementById('promoCode').value = item?.MaKM || '';
    document.getElementById('promoName').value = item?.TenKM || '';
    document.getElementById('promoType').value = item?.LoaiKM || 'Phần trăm';
    document.getElementById('promoValue').value = item?.GiaTri ?? 10;
    document.getElementById('promoStart').value = dateOnly(item?.NgayBatDau) || new Date().toISOString().slice(0, 10);
    document.getElementById('promoEnd').value = dateOnly(item?.NgayKetThuc) || '';
    window.FLY_VI_DATE?.refresh(document.getElementById('promoStart'));
    window.FLY_VI_DATE?.refresh(document.getElementById('promoEnd'));

    const isActive = item ? item.TrangThai === 'Hiệu lực' : true;
    const toggle = document.getElementById('promoStatusToggle');
    const label = document.getElementById('promoStatusLabel');
    if (toggle) toggle.checked = isActive;
    if (label) label.textContent = isActive ? 'Hiệu lực' : 'Ngừng';

    const suffix = document.getElementById('promoValueSuffix');
    if (suffix) suffix.textContent = (item?.LoaiKM || 'Phần trăm') === 'Phần trăm' ? '%' : 'đ';

    // Clear errors
    document.querySelectorAll('#promoForm .input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('#promoForm .field-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
    const btn = document.getElementById('promoSubmitBtn');
    if (btn) btn.disabled = false;

    document.getElementById('promoModal').style.display = 'flex';
  };

  window.closePromoModal = () => { document.getElementById('promoModal').style.display = 'none'; document.getElementById('promoForm').reset(); editingCode = null; };

  const searchPromotions = window.FLY_SEARCH?.debounce
    ? window.FLY_SEARCH.debounce(window.loadPromotions, 250)
    : (() => { let timer; return () => { clearTimeout(timer); timer = setTimeout(window.loadPromotions, 250); }; })();
  document.getElementById('promoSearch')?.addEventListener('input', searchPromotions);

  document.getElementById('promoTableBody')?.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-promo]');
    if (edit) return window.openPromoModal(edit.dataset.editPromo);
    const toggle = event.target.closest('[data-toggle-promo]');
    if (!toggle) return;
    const row = items.find(item => item.MaKM === toggle.dataset.togglePromo);
    try {
      await api(`/promotions/${toggle.dataset.togglePromo}/status`, { method: 'PATCH', body: JSON.stringify({ TrangThai: row?.TrangThai === 'Hiệu lực' ? 'Ngừng' : 'Hiệu lực' }) });
      window.showToast('Đã cập nhật trạng thái khuyến mãi.', 'success');
      await window.loadPromotions();
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  window.previewPromotion = () => {
    const code = document.getElementById('promoCode').value || '—';
    const name = document.getElementById('promoName').value || 'Chưa nhập tên';
    const type = document.getElementById('promoType').value;
    const value = document.getElementById('promoValue').value || 0;
    const start = document.getElementById('promoStart').value || '—';
    const end = document.getElementById('promoEnd').value || '—';
    const isActive = document.getElementById('promoStatusToggle')?.checked;
    const status = isActive ? 'Hiệu lực' : 'Ngừng';
    const display = type === 'Phần trăm' ? `${value}%` : money(value);

    const today = new Date().toISOString().slice(0, 10);
    let countdownHtml = '';
    if (end !== '—') {
      const diff = Math.ceil((new Date(end) - new Date(today)) / (1000 * 60 * 60 * 24));
      if (diff < 0) countdownHtml = '<span class="promo-countdown expired">Đã hết hạn</span>';
      else if (diff === 0) countdownHtml = '<span class="promo-countdown expiring">Hết hạn hôm nay</span>';
      else countdownHtml = `<span class="promo-countdown">Còn ${diff} ngày</span>`;
    }

    const previewHtml = `
      <div class="promo-preview-card">
        <div class="promo-preview-header">
          <div class="promo-preview-title"><strong>${esc(name)}</strong><code>${esc(code)}</code></div>
          <span class="${isActive ? 'badge badge-success' : 'badge badge-warning'}">${esc(status)}</span>
        </div>
        <div class="promo-preview-value"><span class="promo-preview-big-value">${display}</span><small>${esc(type)}</small></div>
        <div class="promo-preview-grid">
          <div><small>BẮT ĐẦU</small><p>${esc(start)}</p></div>
          <div><small>KẾT THÚC</small><p>${esc(end)}</p>${countdownHtml}</div>
        </div>
      </div>`;

    const modal = document.getElementById('promoPreviewModal');
    if (!modal) {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'promoPreviewModal';
      backdrop.style.display = 'flex';
      backdrop.innerHTML = `<div class="modal" style="max-width:480px"><div class="modal-header"><div><p class="module-kicker">XEM TRƯỚC KHUYẾN MÃI</p><h3>Kiểm tra trước khi lưu</h3></div><button type="button" class="close-btn" onclick="document.getElementById('promoPreviewModal').style.display='none'">×</button></div><div class="modal-body" id="promoPreviewContent">${previewHtml}</div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('promoPreviewModal').style.display='none'">Đóng</button></div></div>`;
      document.body.appendChild(backdrop);
    } else {
      document.getElementById('promoPreviewContent').innerHTML = previewHtml;
      modal.style.display = 'flex';
    }
  };

  document.getElementById('promoForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateAll()) return;
    const payload = {
      MaKM: document.getElementById('promoCode').value,
      TenKM: document.getElementById('promoName').value,
      LoaiKM: document.getElementById('promoType').value,
      GiaTri: document.getElementById('promoValue').value,
      NgayBatDau: document.getElementById('promoStart').value,
      NgayKetThuc: document.getElementById('promoEnd').value,
      TrangThai: document.getElementById('promoStatusToggle')?.checked ? 'Hiệu lực' : 'Ngừng'
    };
    try {
      const result = editingCode
        ? await api(`/promotions/${editingCode}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api('/promotions', { method: 'POST', body: JSON.stringify(payload) });
      window.showToast(result.message, 'success');
      window.closePromoModal();
      await window.loadPromotions();
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  window.loadPromotions();
})();
