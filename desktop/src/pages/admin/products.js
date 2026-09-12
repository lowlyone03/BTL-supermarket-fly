(() => {
  const API = `${window.FLY_API_BASE || 'http://localhost:3000/api'}/admin/catalog`;
  const token = localStorage.getItem('fly_token');
  let products = [];
  let allProducts = [];
  let categories = [];
  let editingCode = null;
  let editingCategoryCode = null;
  let imagePreviewUrl = null;
  let loadSeq = 0;

  window.__flyProductsAbort?.abort();
  const pageAbort = new AbortController();
  window.__flyProductsAbort = pageAbort;
  const navSeq = Number(window.FLY_NAV_SEQ || 0);
  const onPageLeave = () => pageAbort.abort();
  window.addEventListener('fly:pageleave', onPageLeave, { once: true });

  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const productPhoto = (item, className = '') => window.FLY_PRODUCT_IMAGES?.markup(item, { className }) || '';
  const normalizeCode = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isAbort = error => error?.name === 'AbortError' || /aborted|AbortError/i.test(String(error?.message || ''));
  const stillOnPage = () => Number(window.FLY_NAV_SEQ || 0) === navSeq && Boolean(document.getElementById('productTableBody'));
  const el = id => document.getElementById(id);
  const setText = (id, value) => {
    const node = el(id);
    if (node) node.textContent = value;
    return node;
  };
  const setHtml = (id, html) => {
    const node = el(id);
    if (node) node.innerHTML = html;
    return node;
  };
  const toastError = error => {
    if (!stillOnPage() || isAbort(error)) return;
    window.showToast(error?.message || error, 'error');
  };
  const api = async (path, options = {}) => {
    const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API}${path}`, { ...options, headers, signal: options.signal || pageAbort.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };

  const clearImagePreviewUrl = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl = null;
  };

  const renderImagePreview = (source = '', label = '', product = null) => {
    const preview = document.getElementById('productImagePreview');
    if (!preview) return;
    preview.classList.toggle('is-empty', !source);
    const fallback = product && window.FLY_PRODUCT_IMAGES?.hasBundledImage?.(product.MaSP || product)
      ? window.FLY_PRODUCT_IMAGES.url(product.MaSP || product)
      : '';
    const onerror = fallback && fallback !== source
      ? `this.onerror=null;this.src='${esc(fallback)}'`
      : '';
    preview.innerHTML = source
      ? `<img src="${esc(source)}" alt="Xem trước ảnh sản phẩm"${onerror ? ` onerror="${onerror}"` : ''}>`
      : '<span>Ảnh</span>';
    setText('productImageName', label || 'JPG, PNG hoặc WebP · tối đa 5 MB');
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
    const filter = el('productCategory');
    const input = el('productCategoryInput');
    if (!filter && !input) return;
    const currentFilter = filter?.value;
    const currentInput = input?.value;
    if (filter) {
      filter.innerHTML = '<option value="">Tất cả danh mục</option>' + categories.map(item => `<option value="${esc(item.MaDM)}">${esc(item.TenDM)}</option>`).join('');
      filter.value = categories.some(item => item.MaDM === currentFilter) ? currentFilter : '';
    }
    if (input) {
      input.innerHTML = categories.filter(item => Number(item.TrangThai) === 1 || item.MaDM === currentInput)
        .map(item => `<option value="${esc(item.MaDM)}">${esc(item.TenDM)} · ${esc(item.MaDM)}</option>`).join('');
      if ([...input.options].some(option => option.value === currentInput)) input.value = currentInput;
    }
  };

  const renderCategories = () => {
    const list = el('categoryList');
    if (!list) return;
    const normalizeSearch = window.FLY_SEARCH?.normalize || (value => String(value ?? '').trim().toLocaleLowerCase('vi'));
    const keyword = normalizeSearch(el('categorySearch')?.value || '');
    const visible = categories.filter(item => !keyword || normalizeSearch(`${item.MaDM} ${item.TenDM} ${item.MoTa || ''}`).includes(keyword));
    setText('categoryTotalCount', categories.length);
    setText('categoryActiveCount', categories.filter(item => Number(item.TrangThai) === 1).length);
    list.innerHTML = visible.length ? visible.map(item => {
      const active = Number(item.TrangThai) === 1;
      return `<article class="category-row">
        <div class="category-main"><div class="category-title-line"><strong>${esc(item.TenDM)}</strong><code>${esc(item.MaDM)}</code></div><p>${esc(item.MoTa || 'Chưa có mô tả')}</p><small>${Number(item.SoSanPham || 0)} sản phẩm đang thuộc danh mục</small></div>
        <div class="category-row-actions"><span class="status-badge ${active ? 'active' : 'locked'}"><i></i>${active ? 'Đang sử dụng' : 'Đã ngừng'}</span><div class="action-group"><button class="btn-outline" type="button" data-edit-category="${esc(item.MaDM)}">Chỉnh sửa</button><button class="btn-outline ${active ? 'danger-text' : ''}" type="button" data-toggle-category="${esc(item.MaDM)}">${active ? 'Ngừng dùng' : 'Kích hoạt'}</button></div></div>
      </article>`;
    }).join('') : '<div class="category-empty">Không có danh mục phù hợp.</div>';
  };

  const loadCategories = async () => {
    if (!stillOnPage()) return;
    const data = await api('/categories');
    if (!stillOnPage()) return;
    categories = data.items || [];
    fillCategoryOptions();
    renderCategories();
  };

  const loadAllProducts = async () => {
    if (!stillOnPage()) return;
    const data = await api('/products');
    if (!stillOnPage()) return;
    allProducts = data.items || [];
  };

  window.loadProducts = async () => {
    if (!stillOnPage()) return;
    const req = ++loadSeq;
    try {
      const search = el('productSearch')?.value || '';
      const category = el('productCategory')?.value || '';
      const status = el('productStatus')?.value || '';
      const taxFilter = el('productTaxFilter')?.value || '';
      const data = await api(`/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`);
      if (!stillOnPage() || req !== loadSeq) return;
      const fetched = data.items || [];
      if (!search && !category && !status) allProducts = [...fetched];
      const missingTax = (allProducts.length ? allProducts : fetched).filter(item => item.ThueSuat == null).length;
      const taxAlert = el('productTaxAlert');
      if (taxAlert) {
        taxAlert.hidden = missingTax === 0;
        taxAlert.innerHTML = `Có <strong>${missingTax}</strong> sản phẩm chưa chọn thuế suất. Gán 0 / 5 / 8 / 10 — nếu để trống (NULL) thì POS chặn bán.`;
      }
      products = taxFilter === 'missing'
        ? fetched.filter(item => item.ThueSuat == null)
        : taxFilter === ''
          ? fetched
          : fetched.filter(item => Number(item.ThueSuat) === Number(taxFilter));
      const summary = data.summary || {};
      setText('productCount', `${summary.total ?? products.length} sản phẩm`);
      setText('productActiveCount', summary.active ?? 0);
      setText('productUnopenedCount', summary.unopened ?? 0);
      setText('productInactiveCount', summary.inactive ?? 0);
      const rows = products.length ? products.map(item => `<tr>
        <td><div class="product-table-main">${productPhoto(item, 'table-product-photo')}<div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.DonViTinh)} · ${esc(item.MaVach || 'Chưa có mã vạch')}</small></div></div></td>
        <td>${esc(item.TenDM)}<small>${esc(item.MaDM)}</small></td><td><strong>${money(item.GiaNhap)}</strong><small>Giá bán ${money(item.GiaBan)}</small></td><td>${item.ThueSuat == null ? '<span class="product-tax-badge is-missing">Chưa chọn</span>' : `<span class="product-tax-badge">${esc(item.ThueSuat)}%</span>`}</td><td>${item.TonKhoToiThieu}</td>
        <td><strong>${item.SLTon}</strong><small>${Number(item.ChuaNhapLanDau) === 1 ? 'Chưa nhập lần đầu' : `Đang đặt ${item.SLDatMua}`}</small></td>
        <td><span class="status-badge ${item.TrangThai === 'Đang bán' ? 'active' : 'locked'}"><i></i>${esc(item.TrangThai)}</span></td>
        <td class="align-right"><div class="action-group"><button class="btn-outline" data-edit-product="${esc(item.MaSP)}">Chỉnh sửa</button><button class="btn-outline ${item.TrangThai === 'Đang bán' ? 'danger-text' : ''}" data-toggle-product="${esc(item.MaSP)}">${item.TrangThai === 'Đang bán' ? 'Ngừng bán' : 'Kích hoạt'}</button></div></td></tr>`).join('') : `<tr><td colspan="8" class="empty-state">${esc(window.FLY_SEARCH?.emptyMessage?.(search, 'sản phẩm', 'Không có sản phẩm phù hợp.') || 'Không có sản phẩm phù hợp.')}</td></tr>`;
      if (!setHtml('productTableBody', rows)) return;
    } catch (error) { toastError(error); }
  };

  window.suggestProductCode = async () => {
    try {
      if (!allProducts.length) await loadAllProducts();
      if (!stillOnPage()) return;
      const categoryInput = el('productCategoryInput');
      const codeInput = el('productCode');
      if (!categoryInput || !codeInput) return;
      const categoryCode = categoryInput.value;
      const category = categories.find(item => item.MaDM === categoryCode);
      if (!category) throw new Error('Hãy chọn danh mục trước khi gợi ý mã sản phẩm.');
      const categoryCodes = allProducts.filter(item => item.MaDM === categoryCode).map(item => item.MaSP);
      const suggestion = nextCode(categoryCodes, fallbackProductPrefix(category), allProducts.map(item => item.MaSP));
      codeInput.value = suggestion;
      setText('productCodeHelp', `Mã gợi ý theo danh mục ${category.TenDM}; bạn có thể sửa trước khi lưu.`);
    } catch (error) { toastError(error); }
  };

  window.suggestProductBarcode = async () => {
    try {
      if (!allProducts.length) await loadAllProducts();
      if (!stillOnPage()) return;
      const barcodeInput = el('productBarcode');
      if (!barcodeInput) return;
      const used = new Set(allProducts.map(item => String(item.MaVach || '')));
      const sequences = [...used].filter(code => /^893\d{10}$/.test(code)).map(code => Number(code.slice(3, 12)));
      let sequence = Math.max(0, ...sequences) + 1;
      let candidate;
      do {
        const base = `893${String(sequence).padStart(9, '0')}`;
        candidate = `${base}${ean13Checksum(base)}`;
        sequence += 1;
      } while (used.has(candidate));
      barcodeInput.value = candidate;
    } catch (error) { toastError(error); }
  };

  window.openProductModal = async code => {
    if (!stillOnPage() || !el('productModal') || !el('productForm')) return;
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
    const taxSelect = document.getElementById('productTaxRate');
    if (taxSelect) taxSelect.value = item?.ThueSuat == null || item?.ThueSuat === '' ? '' : String(Number(item.ThueSuat));
    document.getElementById('productMinimum').value = item?.TonKhoToiThieu ?? 0;
    document.getElementById('productStatusInput').value = item?.TrangThai || 'Đang bán';
    document.getElementById('productCodeHelp').textContent = isEditing ? 'Mã sản phẩm không thể đổi sau khi tạo.' : 'Mã duy nhất, không thể đổi sau khi tạo.';
    const imageInput = el('productImage');
    if (imageInput) {
      imageInput.value = '';
      imageInput.required = false;
    }
    document.getElementById('productImageRequiredMark').hidden = isEditing;
    document.getElementById('productImageTitle').textContent = isEditing ? 'Thay ảnh sản phẩm' : 'Chọn ảnh sản phẩm';
    document.getElementById('productImageHelp').textContent = isEditing
      ? 'Không chọn tệp nếu muốn giữ ảnh hiện tại. Ảnh mới sẽ thay ảnh đã tải trước đó.'
      : 'Bắt buộc khi thêm mới; ảnh được dùng tại quản lý sản phẩm, kho và POS.';
    clearImagePreviewUrl();
    const currentImage = isEditing ? window.FLY_PRODUCT_IMAGES?.resolve(item) || '' : '';
    renderImagePreview(currentImage, currentImage ? `Ảnh hiện tại của ${item.MaSP}` : 'JPG, PNG hoặc WebP · tối đa 5 MB', item);
    el('productModal').style.display = 'flex';
    if (!isEditing) await window.suggestProductCode();
    if (!stillOnPage()) return;
    el(isEditing ? 'productName' : 'productCode')?.focus();
  };

  window.closeProductModal = () => {
    const modal = el('productModal');
    if (!modal) return;
    modal.style.display = 'none';
    el('productForm')?.reset();
    clearImagePreviewUrl();
    renderImagePreview();
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

  window.previewProduct = () => {
    const name = document.getElementById('productName').value || 'Chưa nhập tên';
    const code = document.getElementById('productCode').value || '—';
    const category = document.getElementById('productCategoryInput');
    const categoryName = category?.options[category.selectedIndex]?.textContent || '—';
    const unit = document.getElementById('productUnit').value || '—';
    const barcode = document.getElementById('productBarcode').value || 'Không có';
    const cost = money(document.getElementById('productCost').value);
    const price = money(document.getElementById('productPrice').value);
    const minimum = document.getElementById('productMinimum').value || 0;
    const status = document.getElementById('productStatusInput').value;
    const taxRaw = document.getElementById('productTaxRate')?.value;
    const taxLabel = taxRaw === '' || taxRaw == null ? 'Chưa chọn' : `${taxRaw}%`;
    const imgSrc = imagePreviewUrl || (editingCode ? window.FLY_PRODUCT_IMAGES?.resolve(allProducts.find(p => p.MaSP === editingCode) || {}) : '') || '';
    const imgTag = imgSrc ? `<img src="${esc(imgSrc)}" style="max-width:120px;max-height:120px;border-radius:12px;object-fit:contain;border:1px solid #dce7e0">` : '<span style="display:inline-block;width:100px;height:80px;background:#eef3f0;border-radius:12px;text-align:center;line-height:80px;color:#7a8a82;font-size:11px">Chưa có ảnh</span>';
    const previewHtml = `
      <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:18px">
        ${imgTag}
        <div><h2 style="margin:0;font-size:18px;color:#17231d">${esc(name)}</h2><p style="margin:6px 0 0;color:#68766e;font-size:12px">${esc(code)} · ${esc(unit)} · ${esc(barcode)}</p></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px">
        <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Danh mục</small><p style="margin:4px 0 0;font-size:13px">${esc(categoryName)}</p></div>
        <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Trạng thái</small><p style="margin:4px 0 0"><span class="status-badge ${status === 'Đang bán' ? 'active' : 'locked'}" style="font-size:10px"><i></i>${esc(status)}</span></p></div>
        <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Giá nhập</small><p style="margin:4px 0 0;font-size:14px;font-weight:600">${cost}</p></div>
        <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Giá bán</small><p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#26704f">${price}</p></div>
        <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Tồn tối thiểu</small><p style="margin:4px 0 0;font-size:13px">${minimum}</p></div>
        <div><small style="color:#839087;font-size:9px;font-weight:800;text-transform:uppercase">Thuế suất</small><p style="margin:4px 0 0;font-size:13px">${esc(taxLabel)}</p></div>
      </div>`;
    const modal = document.getElementById('productPreviewModal');
    if (!modal) {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'productPreviewModal';
      backdrop.style.display = 'flex';
      backdrop.innerHTML = `<div class="modal" style="max-width:560px"><div class="modal-header"><div><p class="module-kicker">XEM TRƯỚC SẢN PHẨM</p><h3>Kiểm tra thông tin trước khi lưu</h3></div><button type="button" class="close-btn" onclick="document.getElementById('productPreviewModal').style.display='none'">×</button></div><div class="modal-body" id="productPreviewContent">${previewHtml}</div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('productPreviewModal').style.display='none'">Đóng</button></div></div>`;
      document.body.appendChild(backdrop);
    } else {
      if (!setHtml('productPreviewContent', previewHtml)) return;
      modal.style.display = 'flex';
    }
  };

  window.previewCategory = () => {
    const code = document.getElementById('categoryCode').value || '—';
    const name = document.getElementById('categoryName').value || 'Chưa nhập tên';
    const desc = document.getElementById('categoryDescription').value || 'Chưa có mô tả';
    const isEditing = Boolean(editingCategoryCode);
    const previewHtml = `
      <div style="padding:16px 0">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><strong style="font-size:17px">${esc(name)}</strong><code style="padding:3px 8px;background:#eef3f0;border-radius:7px;font-size:10px;font-weight:800;color:#517064">${esc(code)}</code></div>
        <p style="color:#65746c;font-size:13px;line-height:1.6">${esc(desc)}</p>
        <p style="margin-top:12px;color:#839087;font-size:11px">${isEditing ? 'Chỉnh sửa danh mục hiện có' : 'Danh mục mới sẽ được tạo'}</p>
      </div>`;
    const modal = document.getElementById('categoryPreviewModal');
    if (!modal) {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'categoryPreviewModal';
      backdrop.style.display = 'flex';
      backdrop.innerHTML = `<div class="modal" style="max-width:480px"><div class="modal-header"><div><p class="module-kicker">XEM TRƯỚC DANH MỤC</p><h3>Kiểm tra trước khi lưu</h3></div><button type="button" class="close-btn" onclick="document.getElementById('categoryPreviewModal').style.display='none'">×</button></div><div class="modal-body" id="categoryPreviewContent">${previewHtml}</div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('categoryPreviewModal').style.display='none'">Đóng</button></div></div>`;
      document.body.appendChild(backdrop);
    } else {
      if (!setHtml('categoryPreviewContent', previewHtml)) return;
      modal.style.display = 'flex';
    }
  };

  document.getElementById('productForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = window.FLY_FIELDS;
    const show = (id, result) => fields?.setFieldError ? fields.setFieldError(id, result.ok, result.message) : result.ok;
    const codeResult = fields ? fields.validateRequiredCode(document.getElementById('productCode').value, 'Mã sản phẩm') : { ok: Boolean(document.getElementById('productCode').value.trim()), message: 'Mã sản phẩm là bắt buộc.' };
    const nameResult = fields ? fields.validateRequiredText(document.getElementById('productName').value, 'Tên sản phẩm', { min: 2, max: 150 }) : { ok: Boolean(document.getElementById('productName').value.trim()), message: 'Tên sản phẩm là bắt buộc.' };
    const unitResult = fields ? fields.validateRequiredText(document.getElementById('productUnit').value, 'Đơn vị tính', { min: 1, max: 30 }) : { ok: Boolean(document.getElementById('productUnit').value.trim()), message: 'Đơn vị tính là bắt buộc.' };
    const barcodeResult = fields ? fields.validateOptionalBarcode(document.getElementById('productBarcode').value) : { ok: true, value: document.getElementById('productBarcode').value };
    const costResult = fields ? fields.validateRequiredNonNegativeNumber(document.getElementById('productCost').value, 'Giá nhập') : { ok: Number.isFinite(Number(document.getElementById('productCost').value)), message: 'Giá nhập không hợp lệ.' };
    const priceResult = fields ? fields.validateRequiredNonNegativeNumber(document.getElementById('productPrice').value, 'Giá bán') : { ok: Number.isFinite(Number(document.getElementById('productPrice').value)), message: 'Giá bán không hợp lệ.' };
    const minResult = fields ? fields.validateRequiredNonNegativeInteger(document.getElementById('productMinimum').value, 'Tồn kho tối thiểu') : { ok: Number.isInteger(Number(document.getElementById('productMinimum').value)), message: 'Tồn kho tối thiểu không hợp lệ.' };
    const valid = [
      show('productCode', codeResult),
      show('productName', nameResult),
      show('productUnit', unitResult),
      show('productBarcode', barcodeResult),
      show('productCost', costResult),
      show('productPrice', priceResult),
      show('productMinimum', minResult)
    ].every(Boolean);
    if (!valid) return window.showToast('Vui lòng kiểm tra lại thông tin sản phẩm.', 'error');
    const imageInput = document.getElementById('productImage');
    if (!editingCode && !imageInput?.files?.length) {
      return window.showToast('Ảnh sản phẩm là bắt buộc khi thêm mới.', 'error');
    }
    const wasEditing = Boolean(editingCode);
    const productCode = editingCode;
    const payload = {
      MaSP: codeResult.value || document.getElementById('productCode').value,
      MaDM: document.getElementById('productCategoryInput').value,
      TenSP: nameResult.value || document.getElementById('productName').value,
      DonViTinh: unitResult.value || document.getElementById('productUnit').value,
      MaVach: barcodeResult.value ?? document.getElementById('productBarcode').value,
      GiaNhap: costResult.value ?? Number(document.getElementById('productCost').value),
      GiaBan: priceResult.value ?? Number(document.getElementById('productPrice').value),
      TonKhoToiThieu: minResult.value ?? Number(document.getElementById('productMinimum').value),
      TrangThai: document.getElementById('productStatusInput').value,
      ThueSuat: document.getElementById('productTaxRate')?.value === '' ? null : Number(document.getElementById('productTaxRate')?.value)
    };
    if (payload.ThueSuat == null) return window.showToast('Chọn thuế suất 0 / 5 / 8 / 10. 0% là mức hợp lệ.', 'error');
    if (payload.ThueSuat === 0 && !window.confirm('Xác nhận thuế suất 0% theo cấu hình sản phẩm?')) return;
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => formData.append(key, String(value ?? '')));
    if (imageInput?.files?.[0]) formData.append('AnhSanPham', imageInput.files[0]);
    const submitButton = document.getElementById('productSubmitButton');
    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = wasEditing ? 'Đang lưu...' : 'Đang thêm...';
      }
      const data = await api(`/products${productCode ? `/${encodeURIComponent(productCode)}` : ''}`, { method: wasEditing ? 'PUT' : 'POST', body: formData });
      if (!stillOnPage()) return;
      window.showToast(data.message, 'success');
      window.closeProductModal();
      await Promise.all([window.loadProducts(), loadAllProducts()]);
    } catch (error) { toastError(error); }
    finally {
      if (submitButton && stillOnPage()) {
        submitButton.disabled = false;
        submitButton.textContent = wasEditing ? 'Lưu thay đổi' : 'Thêm sản phẩm';
      }
    }
  });

  document.getElementById('categoryForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = window.FLY_FIELDS;
    const show = (id, result) => fields?.setFieldError ? fields.setFieldError(id, result.ok, result.message) : result.ok;
    const codeResult = fields ? fields.validateRequiredCode(document.getElementById('categoryCode').value, 'Mã danh mục') : { ok: Boolean(document.getElementById('categoryCode').value.trim()), message: 'Mã danh mục là bắt buộc.' };
    const nameResult = fields ? fields.validateRequiredText(document.getElementById('categoryName').value, 'Tên danh mục', { min: 2, max: 100 }) : { ok: Boolean(document.getElementById('categoryName').value.trim()), message: 'Tên danh mục là bắt buộc.' };
    if (!show('categoryCode', codeResult) || !show('categoryName', nameResult)) {
      return window.showToast('Vui lòng kiểm tra lại thông tin danh mục.', 'error');
    }
    const payload = {
      MaDM: codeResult.value || document.getElementById('categoryCode').value,
      TenDM: nameResult.value || document.getElementById('categoryName').value,
      MoTa: document.getElementById('categoryDescription').value
    };
    try {
      const path = editingCategoryCode ? `/categories/${encodeURIComponent(editingCategoryCode)}` : '/categories';
      const data = await api(path, { method: editingCategoryCode ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      window.showToast(data.message, 'success');
      await loadCategories();
      window.resetCategoryForm();
    } catch (error) { toastError(error); }
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
    } catch (error) { toastError(error); }
  });

  document.getElementById('categorySearch')?.addEventListener('input', renderCategories);
  document.getElementById('productCategoryInput')?.addEventListener('change', () => {
    if (!editingCode) window.suggestProductCode();
  });
  document.getElementById('productImage')?.addEventListener('change', event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    clearImagePreviewUrl();
    if (!file) {
      const item = allProducts.find(product => product.MaSP === editingCode) || products.find(product => product.MaSP === editingCode);
      const currentImage = item ? window.FLY_PRODUCT_IMAGES?.resolve(item) || '' : '';
      return renderImagePreview(currentImage, currentImage ? `Ảnh hiện tại của ${item.MaSP}` : 'JPG, PNG hoặc WebP · tối đa 5 MB', item);
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      input.value = '';
      renderImagePreview();
      return window.showToast('Ảnh sản phẩm chỉ chấp nhận JPG, PNG hoặc WebP.', 'error');
    }
    if (file.size > 5 * 1024 * 1024) {
      input.value = '';
      renderImagePreview();
      return window.showToast('Ảnh sản phẩm không được lớn hơn 5 MB.', 'error');
    }
    imagePreviewUrl = URL.createObjectURL(file);
    renderImagePreview(imagePreviewUrl, `${file.name} · ${(file.size / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} KB`);
  });
  document.getElementById('productSearch')?.addEventListener('input', (() => { let timer; return () => { clearTimeout(timer); timer = setTimeout(window.loadProducts, 250); }; })());
  document.getElementById('productCategory')?.addEventListener('change', window.loadProducts);
  document.getElementById('productStatus')?.addEventListener('change', window.loadProducts);
  document.getElementById('productTaxFilter')?.addEventListener('change', window.loadProducts);
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
    } catch (error) { toastError(error); }
  });

  const pendingProductSearch = window.FLY_SEARCH?.takePendingQuery?.('../admin/products.html');
  if (pendingProductSearch && el('productSearch')) el('productSearch').value = pendingProductSearch;

  Promise.all([loadCategories(), window.loadProducts()]).catch(error => toastError(error));
})();
