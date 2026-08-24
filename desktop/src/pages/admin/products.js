(() => {
  const API = 'http://localhost:3000/api/admin/catalog';
  const token = localStorage.getItem('fly_token');
  let products = [];
  let categories = [];
  let editingCode = null;

  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };

  const fillCategoryOptions = () => {
    const filter = document.getElementById('productCategory');
    const input = document.getElementById('productCategoryInput');
    if (!filter || !input) return;
    const currentFilter = filter.value;
    filter.innerHTML = '<option value="">Tất cả danh mục</option>' + categories.map(item => `<option value="${esc(item.MaDM)}">${esc(item.TenDM)}</option>`).join('');
    input.innerHTML = categories.filter(item => Number(item.TrangThai) === 1).map(item => `<option value="${esc(item.MaDM)}">${esc(item.TenDM)}</option>`).join('');
    filter.value = currentFilter;
  };

  const renderCategories = () => {
    const list = document.getElementById('categoryList');
    if (!list) return;
    list.innerHTML = categories.map(item => `<div class="category-row"><div><strong>${esc(item.TenDM)}</strong><small>${esc(item.MaDM)} · ${item.SoSanPham} sản phẩm</small><p>${esc(item.MoTa || 'Chưa có mô tả')}</p></div><span class="status-badge ${Number(item.TrangThai) === 1 ? 'active' : 'locked'}"><i></i>${Number(item.TrangThai) === 1 ? 'Đang sử dụng' : 'Đã ngừng'}</span></div>`).join('');
  };

  const loadCategories = async () => {
    const data = await api('/categories');
    categories = data.items;
    fillCategoryOptions();
    renderCategories();
  };

  window.loadProducts = async () => {
    try {
      const search = document.getElementById('productSearch')?.value || '';
      const category = document.getElementById('productCategory')?.value || '';
      const status = document.getElementById('productStatus')?.value || '';
      const data = await api(`/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`);
      products = data.items;
      document.getElementById('productCount').textContent = `${data.summary.total} sản phẩm`;
      document.getElementById('productActiveCount').textContent = data.summary.active;
      document.getElementById('productUnopenedCount').textContent = data.summary.unopened;
      document.getElementById('productInactiveCount').textContent = data.summary.inactive;
      document.getElementById('productTableBody').innerHTML = products.length ? products.map(item => `<tr>
        <td><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.DonViTinh)} · ${esc(item.MaVach || 'Chưa có mã vạch')}</small></td>
        <td>${esc(item.TenDM)}</td><td><strong>${money(item.GiaNhap)}</strong><small>Giá bán ${money(item.GiaBan)}</small></td><td>${item.TonKhoToiThieu}</td>
        <td><strong>${item.SLTon}</strong><small>${Number(item.ChuaNhapLanDau) === 1 ? 'Chưa nhập lần đầu' : `Đang đặt ${item.SLDatMua}`}</small></td>
        <td><span class="status-badge ${item.TrangThai === 'Đang bán' ? 'active' : 'locked'}"><i></i>${esc(item.TrangThai)}</span></td>
        <td class="align-right"><div class="action-group"><button class="btn-outline" data-edit-product="${esc(item.MaSP)}">Chỉnh sửa</button><button class="btn-outline ${item.TrangThai === 'Đang bán' ? 'danger-text' : ''}" data-toggle-product="${esc(item.MaSP)}">${item.TrangThai === 'Đang bán' ? 'Ngừng bán' : 'Kích hoạt'}</button></div></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">Không có sản phẩm phù hợp.</td></tr>';
    } catch (error) { window.showToast(error.message, 'error'); }
  };

  window.openProductModal = code => {
    editingCode = code || null;
    const item = products.find(product => product.MaSP === code);
    document.getElementById('productModalTitle').textContent = item ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm';
    document.getElementById('productCode').disabled = Boolean(item);
    document.getElementById('productCode').value = item?.MaSP || '';
    document.getElementById('productCategoryInput').value = item?.MaDM || categories.find(category => Number(category.TrangThai) === 1)?.MaDM || '';
    document.getElementById('productName').value = item?.TenSP || '';
    document.getElementById('productUnit').value = item?.DonViTinh || '';
    document.getElementById('productBarcode').value = item?.MaVach || '';
    document.getElementById('productCost').value = item?.GiaNhap ?? 0;
    document.getElementById('productPrice').value = item?.GiaBan ?? 0;
    document.getElementById('productMinimum').value = item?.TonKhoToiThieu ?? 0;
    document.getElementById('productStatusInput').value = item?.TrangThai || 'Đang bán';
    document.getElementById('productModal').style.display = 'flex';
    document.getElementById('productName').focus();
  };
  window.closeProductModal = () => { document.getElementById('productModal').style.display = 'none'; document.getElementById('productForm').reset(); editingCode = null; };
  window.openCategoryModal = () => { document.getElementById('categoryModal').style.display = 'flex'; document.getElementById('categoryName').focus(); };
  window.closeCategoryModal = () => { document.getElementById('categoryModal').style.display = 'none'; document.getElementById('categoryForm').reset(); };

  document.getElementById('productForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      MaSP: document.getElementById('productCode').value,
      MaDM: document.getElementById('productCategoryInput').value,
      TenSP: document.getElementById('productName').value,
      DonViTinh: document.getElementById('productUnit').value,
      MaVach: document.getElementById('productBarcode').value,
      GiaNhap: Number(document.getElementById('productCost').value),
      GiaBan: Number(document.getElementById('productPrice').value),
      TonKhoToiThieu: Number(document.getElementById('productMinimum').value),
      TrangThai: document.getElementById('productStatusInput').value
    };
    try {
      const data = await api(`/products${editingCode ? `/${encodeURIComponent(editingCode)}` : ''}`, { method: editingCode ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      window.showToast(data.message, 'success'); closeProductModal(); await window.loadProducts();
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  document.getElementById('categoryForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/categories', { method: 'POST', body: JSON.stringify({ MaDM: document.getElementById('categoryCode').value, TenDM: document.getElementById('categoryName').value, MoTa: document.getElementById('categoryDescription').value }) });
      window.showToast(data.message, 'success'); document.getElementById('categoryForm').reset(); await loadCategories();
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  document.getElementById('productSearch')?.addEventListener('input', (() => { let timer; return () => { clearTimeout(timer); timer = setTimeout(window.loadProducts, 250); }; })());
  document.getElementById('productCategory')?.addEventListener('change', window.loadProducts);
  document.getElementById('productStatus')?.addEventListener('change', window.loadProducts);
  document.getElementById('productTableBody')?.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-product]');
    if (edit) return openProductModal(edit.dataset.editProduct);
    const toggle = event.target.closest('[data-toggle-product]');
    if (!toggle) return;
    const item = products.find(product => product.MaSP === toggle.dataset.toggleProduct);
    try {
      const data = await api(`/products/${encodeURIComponent(item.MaSP)}/status`, { method: 'PATCH', body: JSON.stringify({ TrangThai: item.TrangThai === 'Đang bán' ? 'Ngừng bán' : 'Đang bán' }) });
      window.showToast(data.message, 'success'); await window.loadProducts();
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  Promise.all([loadCategories(), window.loadProducts()]).catch(error => window.showToast(error.message, 'error'));
})();
