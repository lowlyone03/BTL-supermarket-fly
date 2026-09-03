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
    const status = document.getElementById('promoStatus').value;
    const display = type === 'Phần trăm' ? `${value}%` : money(value);
    const previewHtml = `
      <div style="padding:12px 0">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><strong style="font-size:17px">${esc(name)}</strong><code style="padding:3px 8px;background:#eef3f0;border-radius:7px;font-size:10px;font-weight:800;color:#517064">${esc(code)}</code></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px">
          <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Loại</small><p style="margin:4px 0 0;font-size:13px">${esc(type)}</p></div>
          <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Giá trị</small><p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#26704f">${display}</p></div>
          <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Bắt đầu</small><p style="margin:4px 0 0;font-size:13px">${esc(start)}</p></div>
          <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Kết thúc</small><p style="margin:4px 0 0;font-size:13px">${esc(end)}</p></div>
          <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Trạng thái</small><p style="margin:4px 0 0"><span class="status-badge ${status === 'Hiệu lực' ? 'active' : 'locked'}" style="font-size:10px"><i></i>${esc(status)}</span></p></div>
        </div>
      </div>`;
    const modal = document.getElementById('promoPreviewModal');
    if (!modal) {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'promoPreviewModal';
      backdrop.style.display = 'flex';
      backdrop.innerHTML = `<div class="modal" style="max-width:500px"><div class="modal-header"><div><p class="module-kicker">XEM TRƯỚC KHUYẾN MÃI</p><h3>Kiểm tra trước khi lưu</h3></div><button type="button" class="close-btn" onclick="document.getElementById('promoPreviewModal').style.display='none'">×</button></div><div class="modal-body" id="promoPreviewContent">${previewHtml}</div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('promoPreviewModal').style.display='none'">Đóng</button></div></div>`;
      document.body.appendChild(backdrop);
    } else {
      document.getElementById('promoPreviewContent').innerHTML = previewHtml;
      modal.style.display = 'flex';
    }
  };

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
