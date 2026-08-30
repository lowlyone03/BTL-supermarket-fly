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

  window.loadPromotions = async () => {
    try {
      const search = document.getElementById('promoSearch')?.value || '';
      const data = await api(`/promotions?search=${encodeURIComponent(search)}`);
      items = data.items || [];
      document.getElementById('promoCount').textContent = `${items.length} chương trình`;
      document.getElementById('promoTableBody').innerHTML = items.length ? items.map(item => `<tr>
        <td><strong>${esc(item.TenKM)}</strong><small>${esc(item.MaKM)}</small></td>
        <td>${esc(item.LoaiKM)} · ${item.LoaiKM === 'Phần trăm' ? `${item.GiaTri}%` : money(item.GiaTri)}</td>
        <td>${dateOnly(item.NgayBatDau)} → ${dateOnly(item.NgayKetThuc)}</td>
        <td><span class="status-badge ${Number(item.DangApDung) === 1 ? 'active' : 'locked'}"><i></i>${esc(item.TrangThai)}${Number(item.DangApDung) === 1 ? ' · đang áp dụng' : ''}</span></td>
        <td class="align-right"><div class="action-group"><button class="btn-outline" data-edit-promo="${esc(item.MaKM)}">Cập nhật</button><button class="btn-outline ${item.TrangThai === 'Hiệu lực' ? 'danger-text' : ''}" data-toggle-promo="${esc(item.MaKM)}">${item.TrangThai === 'Hiệu lực' ? 'Ngừng' : 'Kích hoạt'}</button></div></td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty-state">Chưa có chương trình. Tạo mới để thu ngân chọn trên POS.</td></tr>';
    } catch (error) { window.showToast(error.message, 'error'); }
  };

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
    document.getElementById('promoStatus').value = item?.TrangThai || 'Hiệu lực';
    document.getElementById('promoModal').style.display = 'flex';
  };
  window.closePromoModal = () => { document.getElementById('promoModal').style.display = 'none'; document.getElementById('promoForm').reset(); editingCode = null; };

  document.getElementById('promoSearch')?.addEventListener('input', () => { window.loadPromotions(); });
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
  document.getElementById('promoForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      MaKM: document.getElementById('promoCode').value,
      TenKM: document.getElementById('promoName').value,
      LoaiKM: document.getElementById('promoType').value,
      GiaTri: document.getElementById('promoValue').value,
      NgayBatDau: document.getElementById('promoStart').value,
      NgayKetThuc: document.getElementById('promoEnd').value,
      TrangThai: document.getElementById('promoStatus').value
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
