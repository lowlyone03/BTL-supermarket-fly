(() => {
  const API = 'http://localhost:3000/api/admin/catalog';
  const token = localStorage.getItem('fly_token');
  let products = [];
  let allProducts = [];
  let categories = [];
  let editingCode = null;
  let editingCategoryCode = null;

  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const productPhoto = (item, className = '') => window.FLY_PRODUCT_IMAGES?.markup(item, { className }) || '';
  const normalizeCode = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };

  const fallbackProductPrefix = category => {
    const words = String(category?.TenDM || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[A-Za-z0-9]+/g) || [];
    if (words.length > 1) return words.slice(0, 3).map(word => word[0]).join('').toUpperCase();
    const namePrefix = normalizeCode(words[0] || '').slice(0, 3);
    if (namePrefix) return namePrefix;
    const categoryCode = normalizeCode(category?.MaDM || '').replace(/^DM\d*$/, '');
    return categoryCode.slice(0, 3) || 'SP';
  };

  const nextCode = (codes, fallbackPrefix, allCodes = codes) => {
    const parsed = codes.map(code => normalizeCode(code).match(/^([A-Z]+)(\d+)$/)).filter(Boolean);
    const counts = new Map();
    parsed.forEach(match => counts.set(match[1], (counts.get(match[1]) || 0) + 1));
    const prefix = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || normalizeCode(fallbackPrefix).replace(/\d/g, '').slice(0, 4) || 'SP';
    const matching = parsed.filter(match => match[1] === prefix);
    const width = Math.max(3, ...matching.map(match => match[2].length));
    let sequence = Math.max(0, ...matching.map(match => Number(match[2]))) + 1;
    const used = new Set(allCodes.map(normalizeCode));
    let candidate = `${prefix}${String(sequence).padStart(width, '0')}`;
    while (used.has(candidate)) {
      sequence += 1;
      candidate = `${prefix}${String(sequence).padStart(width, '0')}`;
    }
    return candidate;
  };

  const ean13Checksum = base => {
    const sum = [...base].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return String((10 - (sum % 10)) % 10);
  };

  const fillCategoryOptions = () => {
    const filter = document.getElementById('productCategory');
    const input = document.getElementById('productCategoryInput');
    if (!filter || !input) return;
    const currentFilter = filter.value;
    const currentInput = input.value;
    filter.innerHTML = '<option value="">Tất cả danh mục</option>' + categories.map(item => `<option value="${esc(item.MaDM)}">${esc(item.TenDM)}</option>`).join('');
    input.innerHTML = categories.filter(item => Number(item.TrangThai) === 1 || item.MaDM === currentInput)
      .map(item => `<option value="${esc(item.MaDM)}">${esc(item.TenDM)} · ${esc(item.MaDM)}</option>`).join('');
    filter.value = categories.some(item => item.MaDM === currentFilter) ? currentFilter : '';
    if ([...input.options].some(option => option.value === currentInput)) input.value = currentInput;
  };

  const renderCategories = () => {
    const list = document.getElementById('categoryList');
    if (!list) return;
    const keyword = String(document.getElementById('categorySearch')?.value || '').trim().toLocaleLowerCase('vi');
    const visible = categories.filter(item => !keyword || `${item.MaDM} ${item.TenDM} ${item.MoTa || ''}`.toLocaleLowerCase('vi').includes(keyword));
    document.getElementById('categoryTotalCount').textContent = categories.length;
    document.getElementById('categoryActiveCount').textContent = categories.filter(item => Number(item.TrangThai) === 1).length;
    list.innerHTML = visible.length ? visible.map(item => {
      const active = Number(item.TrangThai) === 1;
      return `<article class="category-row">
        <div class="category-main"><div class="category-title-line"><strong>${esc(item.TenDM)}</strong><code>${esc(item.MaDM)}</code></div><p>${esc(item.MoTa || 'Chưa có mô tả')}</p><small>${Number(item.SoSanPham || 0)} sản phẩm đang thuộc danh mục</small></div>
        <div class="category-row-actions"><span class="status-badge ${active ? 'active' : 'locked'}"><i></i>${active ? 'Đang sử dụng' : 'Đã ngừng'}</span><div class="action-group"><button class="btn-outline" type="button" data-edit-category="${esc(item.MaDM)}">Chỉnh sửa</button><button class="btn-outline ${active ? 'danger-text' : ''}" type="button" data-toggle-category="${esc(item.MaDM)}">${active ? 'Ngừng dùng' : 'Kích hoạt'}</button></div></div>
      </article>`;
    }).join('') : '<div class="category-empty">Không có danh mục phù hợp.</div>';
  };

  const loadCategories = async () => {
    const data = await api('/categories');
    categories = data.items || [];
    fillCategoryOptions();
    renderCategories();
  };

  const loadAllProducts = async () => {
    const data = await api('/products');
    allProducts = data.items || [];
  };

  window.loadProducts = async () => {
    try {
      const search = document.getElementById('productSearch')?.value || '';
      const category = document.getElementById('productCategory')?.value || '';
      const status = document.getElementById('productStatus')?.value || '';
      const data = await api(`/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`);
      products = data.items || [];
      if (!search && !category && !status) allProducts = [...products];
      document.getElementById('productCount').textContent = `${data.summary.total} sản phẩm`;
      document.getElementById('productActiveCount').textContent = data.summary.active;
      document.getElementById('productUnopenedCount').textContent = data.summary.unopened;
      document.getElementById('productInactiveCount').textContent = data.summary.inactive;
      document.getElementById('productTableBody').innerHTML = products.length ? products.map(item => `<tr>
        <td><div class="product-table-main">${productPhoto(item, 'table-product-photo')}<div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.DonViTinh)} · ${esc(item.MaVach || 'Chưa có mã vạch')}</small></div></div></td>
        <td>${esc(item.TenDM)}<small>${esc(item.MaDM)}</small></td><td><strong>${money(item.GiaNhap)}</strong><small>Giá bán ${money(item.GiaBan)}</small></td><td>${item.TonKhoToiThieu}</td>
        <td><strong>${item.SLTon}</strong><small>${Number(item.ChuaNhapLanDau) === 1 ? 'Chưa nhập lần đầu' : `Đang đặt ${item.SLDatMua}`}</small></td>
        <td><span class="status-badge ${item.TrangThai === 'Đang bán' ? 'active' : 'locked'}"><i></i>${esc(item.TrangThai)}</span></td>
        <td class="align-right"><div class="action-group"><button class="btn-outline" data-edit-product="${esc(item.MaSP)}">Chỉnh sửa</button><button class="btn-outline ${item.TrangThai === 'Đang bán' ? 'danger-text' : ''}" data-toggle-product="${esc(item.MaSP)}">${item.TrangThai === 'Đang bán' ? 'Ngừng bán' : 'Kích hoạt'}</button></div></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">Không có sản phẩm phù hợp.</td></tr>';
    } catch (error) { window.showToast(error.message, 'error'); }
  };

  window.suggestProductCode = async () => {
    try {
      if (!allProducts.length) await loadAllProducts();
      const categoryCode = document.getElementById('productCategoryInput').value;
      const category = categories.find(item => item.MaDM === categoryCode);
      if (!category) throw new Error('Hãy chọn danh mục trước khi gợi ý mã sản phẩm.');
      const categoryCodes = allProducts.filter(item => item.MaDM === categoryCode).map(item => item.MaSP);
      const suggestion = nextCode(categoryCodes, fallbackProductPrefix(category), allProducts.map(item => item.MaSP));
      document.getElementById('productCode').value = suggestion;
      document.getElementById('productCodeHelp').textContent = `Mã gợi ý theo danh mục ${category.TenDM}; bạn có thể sửa trước khi lưu.`;
    } catch (error) { window.showToast(error.message, 'error'); }
  };

  window.suggestProductBarcode = async () => {
    try {
      if (!allProducts.length) await loadAllProducts();
      const used = new Set(allProducts.map(item => String(item.MaVach || '')));
      const sequences = [...used].filter(code => /^893\d{10}$/.test(code)).map(code => Number(code.slice(3, 12)));
      let sequence = Math.max(0, ...sequences) + 1;
      let candidate;
      do {
        const base = `893${String(sequence).padStart(9, '0')}`;
        candidate = `${base}${ean13Checksum(base)}`;
        sequence += 1;
      } while (used.has(candidate));
      document.getElementById('productBarcode').value = candidate;
    } catch (error) { window.showToast(error.message, 'error'); }
  };

  window.openProductModal = async code => {
    editingCode = code || null;
    const item = allProducts.find(product => product.MaSP === code) || products.find(product => product.MaSP === code);
    const isEditing = Boolean(item);
    document.getElementById('productModalTitle').textContent = isEditing ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm mới';
    document.getElementById('productModeNote').textContent = isEditing ? `Đang chỉnh sửa hồ sơ ${item.MaSP}. Mã sản phẩm được khóa để bảo toàn dữ liệu liên quan.` : 'Khai báo mã, danh mục, giá và mức tồn tối thiểu trước khi nhập hàng.';
    document.getElementById('productSubmitButton').textContent = isEditing ? 'Lưu thay đổi' : 'Thêm sản phẩm';
    document.getElementById('productCode').disabled = isEditing;
    document.getElementById('productCodeSuggestionButton').hidden = isEditing;
    document.getElementById('productCode').value = item?.MaSP || '';
    document.getElementById('productCategoryInput').value = item?.MaDM || categories.find(category => Number(category.TrangThai) === 1)?.MaDM || '';
    document.getElementById('productName').value = item?.TenSP || '';
    document.getElementById('productUnit').value = item?.DonViTinh || '';
    document.getElementById('productBarcode').value = item?.MaVach || '';
    document.getElementById('productCost').value = item?.GiaNhap ?? 0;
    document.getElementById('productPrice').value = item?.GiaBan ?? 0;
    document.getElementById('productMinimum').value = item?.TonKhoToiThieu ?? 0;
    document.getElementById('productStatusInput').value = item?.TrangThai || 'Đang bán';
    document.getElementById('productCodeHelp').textContent = isEditing ? 'Mã sản phẩm không thể đổi sau khi tạo.' : 'Mã duy nhất, không thể đổi sau khi tạo.';
    document.getElementById('productModal').style.display = 'flex';
    if (!isEditing) await window.suggestProductCode();
    document.getElementById(isEditing ? 'productName' : 'productCode').focus();
  };

  window.closeProductModal = () => {
    document.getElementById('productModal').style.display = 'none';
    document.getElementById('productForm').reset();
    editingCode = null;
  };

  window.suggestCategoryCode = () => {
    document.getElementById('categoryCode').value = nextCode(categories.map(item => item.MaDM), 'DM');
  };

  window.resetCategoryForm = () => {
    editingCategoryCode = null;
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryCode').disabled = false;
    document.getElementById('categoryCodeSuggestionButton').hidden = false;
    document.getElementById('categoryFormTitle').textContent = 'Thêm danh mục mới';
    document.getElementById('categorySubmitButton').textContent = 'Thêm danh mục';
    document.getElementById('categoryCancelEdit').hidden = true;
    window.suggestCategoryCode();
  };

  const editCategory = code => {
    const item = categories.find(category => category.MaDM === code);
    if (!item) return;
    editingCategoryCode = code;
    document.getElementById('categoryCode').value = item.MaDM;
    document.getElementById('categoryCode').disabled = true;
    document.getElementById('categoryCodeSuggestionButton').hidden = true;
    document.getElementById('categoryName').value = item.TenDM || '';
    document.getElementById('categoryDescription').value = item.MoTa || '';
    document.getElementById('categoryFormTitle').textContent = `Chỉnh sửa ${item.MaDM}`;
    document.getElementById('categorySubmitButton').textContent = 'Lưu thay đổi';
    document.getElementById('categoryCancelEdit').hidden = false;
    document.getElementById('categoryName').focus();
  };

  window.openCategoryModal = () => {
    document.getElementById('categoryModal').style.display = 'flex';
    document.getElementById('categorySearch').value = '';
    renderCategories();
    window.resetCategoryForm();
    document.getElementById('categoryName').focus();
  };

  window.closeCategoryModal = () => {
    document.getElementById('categoryModal').style.display = 'none';
    window.resetCategoryForm();
  };

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
      window.showToast(data.message, 'success');
      window.closeProductModal();
      await Promise.all([window.loadProducts(), loadAllProducts()]);
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  document.getElementById('categoryForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = { MaDM: document.getElementById('categoryCode').value, TenDM: document.getElementById('categoryName').value, MoTa: document.getElementById('categoryDescription').value };
    try {
      const path = editingCategoryCode ? `/categories/${encodeURIComponent(editingCategoryCode)}` : '/categories';
      const data = await api(path, { method: editingCategoryCode ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      window.showToast(data.message, 'success');
      await loadCategories();
      window.resetCategoryForm();
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  document.getElementById('categoryList')?.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-category]');
    if (edit) return editCategory(edit.dataset.editCategory);
    const toggle = event.target.closest('[data-toggle-category]');
    if (!toggle) return;
    const item = categories.find(category => category.MaDM === toggle.dataset.toggleCategory);
    if (!item) return;
    const active = Number(item.TrangThai) === 1;
    try {
      const data = await api(`/categories/${encodeURIComponent(item.MaDM)}/status`, { method: 'PATCH', body: JSON.stringify({ TrangThai: active ? 0 : 1 }) });
      window.showToast(data.message, 'success');
      await Promise.all([loadCategories(), window.loadProducts()]);
      if (editingCategoryCode === item.MaDM) window.resetCategoryForm();
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  document.getElementById('categorySearch')?.addEventListener('input', renderCategories);
  document.getElementById('productCategoryInput')?.addEventListener('change', () => {
    if (!editingCode) window.suggestProductCode();
  });
  document.getElementById('productSearch')?.addEventListener('input', (() => { let timer; return () => { clearTimeout(timer); timer = setTimeout(window.loadProducts, 250); }; })());
  document.getElementById('productCategory')?.addEventListener('change', window.loadProducts);
  document.getElementById('productStatus')?.addEventListener('change', window.loadProducts);
  document.getElementById('productTableBody')?.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-product]');
    if (edit) return window.openProductModal(edit.dataset.editProduct);
    const toggle = event.target.closest('[data-toggle-product]');
    if (!toggle) return;
    const item = products.find(product => product.MaSP === toggle.dataset.toggleProduct);
    if (!item) return;
    try {
      const data = await api(`/products/${encodeURIComponent(item.MaSP)}/status`, { method: 'PATCH', body: JSON.stringify({ TrangThai: item.TrangThai === 'Đang bán' ? 'Ngừng bán' : 'Đang bán' }) });
      window.showToast(data.message, 'success');
      await Promise.all([window.loadProducts(), loadAllProducts()]);
    } catch (error) { window.showToast(error.message, 'error'); }
  });

  Promise.all([loadCategories(), window.loadProducts(), loadAllProducts()]).catch(error => window.showToast(error.message, 'error'));
})();
