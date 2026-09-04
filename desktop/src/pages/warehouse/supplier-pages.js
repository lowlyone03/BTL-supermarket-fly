(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'purchasing-suppliers': '<section class="warehouse-page" id="purchasingSuppliers"><div class="overview-loading">Đang tải Nhà cung cấp...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : 'Chưa phát sinh';
  const api = async (context, path, options = {}) => {
    const response = await fetch(`${context.apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };
  const heading = (title, subtitle, action) => `<header class="warehouse-heading"><div><p class="warehouse-kicker">MUA HÀNG / DỮ LIỆU NHÀ CUNG CẤP</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</header>`;

  const supplierModal = (context, existing, refresh) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HỒ SƠ NHÀ CUNG CẤP</p><h2>${existing ? 'Cập nhật Nhà cung cấp' : 'Thêm Nhà cung cấp'}</h2></div><button class="warehouse-icon-button close-modal">×</button></div><form><div class="warehouse-modal-body"><div class="warehouse-form-grid">
      <div class="warehouse-field"><label>Mã Nhà cung cấp *</label><input id="supplierCode" maxlength="20" required value="${esc(existing?.MaNCC || '')}" ${existing ? 'disabled' : ''}></div>
      <div class="warehouse-field"><label>Tên Nhà cung cấp *</label><input id="supplierName" maxlength="150" required value="${esc(existing?.TenNCC || '')}"></div>
      <div class="warehouse-field"><label>Mã số thuế *</label><input id="supplierTax" maxlength="20" required value="${esc(existing?.MaSoThue || '')}"></div>
      <div class="warehouse-field"><label>Người liên hệ</label><input id="supplierContact" maxlength="100" value="${esc(existing?.NguoiLienHe || '')}"></div>
      <div class="warehouse-field"><label>Số điện thoại</label><input id="supplierPhone" maxlength="20" value="${esc(existing?.SDT || '')}"></div>
      <div class="warehouse-field"><label>Email</label><input id="supplierEmail" type="email" maxlength="100" value="${esc(existing?.Email || '')}"></div>
      <div class="warehouse-field"><label>Trạng thái</label><select id="supplierStatus"><option>Đang hợp tác</option><option>Ngừng hợp tác</option></select></div>
      <div class="warehouse-field"><label>Địa chỉ</label><input id="supplierAddress" maxlength="300" value="${esc(existing?.DiaChi || '')}"></div>
    </div></div><div class="warehouse-modal-actions"><button type="button" class="warehouse-secondary close-modal">Hủy</button><button class="warehouse-primary" type="submit">Lưu Nhà cung cấp</button></div></form></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#supplierStatus').value = existing?.TrangThai || 'Đang hợp tác';
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const payload = { MaNCC: overlay.querySelector('#supplierCode').value, TenNCC: overlay.querySelector('#supplierName').value, MaSoThue: overlay.querySelector('#supplierTax').value, NguoiLienHe: overlay.querySelector('#supplierContact').value, SDT: overlay.querySelector('#supplierPhone').value, Email: overlay.querySelector('#supplierEmail').value, DiaChi: overlay.querySelector('#supplierAddress').value, TrangThai: overlay.querySelector('#supplierStatus').value };
      const fields = window.FLY_FIELDS;
      if (fields) {
        const invalid = fields.firstError(
          fields.validateRequiredCode(payload.MaNCC, 'Mã Nhà cung cấp'),
          fields.validateRequiredName(payload.TenNCC, 'Tên Nhà cung cấp'),
          fields.validateRequiredVnTaxId(payload.MaSoThue),
          fields.validateOptionalName(payload.NguoiLienHe, 'Người liên hệ'),
          fields.validateOptionalVnPhone(payload.SDT),
          fields.validateOptionalEmail(payload.Email),
          fields.validateOptionalNote(payload.DiaChi, 300)
        );
        if (invalid) return context.showToast(invalid.message.replace('Ghi chú', 'Địa chỉ'), 'error');
        payload.MaNCC = fields.validateRequiredCode(payload.MaNCC, 'Mã Nhà cung cấp').value;
        payload.TenNCC = fields.validateRequiredName(payload.TenNCC, 'Tên Nhà cung cấp').value;
        payload.MaSoThue = fields.validateRequiredVnTaxId(payload.MaSoThue).value;
        payload.NguoiLienHe = fields.validateOptionalName(payload.NguoiLienHe, 'Người liên hệ').value;
        payload.SDT = fields.validateOptionalVnPhone(payload.SDT).value;
        payload.Email = fields.validateOptionalEmail(payload.Email).value;
        payload.DiaChi = fields.validateOptionalNote(payload.DiaChi, 300).value;
      }
      try {
        const data = await api(context, `/suppliers${existing ? `/${encodeURIComponent(existing.MaNCC)}` : ''}`, { method: existing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        context.showToast(data.message, 'success'); close(); await refresh();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
  };

  const initSuppliers = async (root, context) => {
    let items = [];
    const load = async () => {
      try {
        const search = root.querySelector('#supplierSearch').value;
        const status = root.querySelector('#supplierStatusFilter').value;
        const data = await api(context, `/suppliers?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        items = data.items;
        root.querySelector('#supplierTotal').textContent = data.summary.total;
        root.querySelector('#supplierActive').textContent = data.summary.active;
        root.querySelector('#supplierInactive').textContent = data.summary.inactive;
        root.querySelector('#supplierBody').innerHTML = items.length ? items.map(item => `<tr><td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)} · MST ${esc(item.MaSoThue)}</small></td><td><strong>${esc(item.NguoiLienHe || 'Chưa cập nhật')}</strong><small>${esc(item.SDT || '—')} · ${esc(item.Email || '—')}</small></td><td>${esc(item.DiaChi || '—')}</td><td class="num">${item.SoDonMua}<small>${fmtDate(item.LanMuaGanNhat)}</small></td><td><span class="status-pill ${item.TrangThai === 'Đang hợp tác' ? 'ok' : 'cancelled'}">${esc(item.TrangThai)}</span></td><td><div class="warehouse-row-actions"><button data-edit-supplier="${esc(item.MaNCC)}">Chỉnh sửa</button><button class="${item.TrangThai === 'Đang hợp tác' ? 'cancel' : 'send'}" data-toggle-supplier="${esc(item.MaNCC)}">${item.TrangThai === 'Đang hợp tác' ? 'Ngừng hợp tác' : 'Kích hoạt'}</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa có Nhà cung cấp phù hợp.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('Nhà cung cấp', 'Quản lý hồ sơ, thông tin liên hệ và trạng thái hợp tác trước khi lập Đơn mua.', '<button class="warehouse-primary" id="newSupplier"><svg><use href="#i-plus"/></svg>Thêm Nhà cung cấp</button>')}
      <div class="warehouse-stats"><article class="warehouse-stat"><span>TỔNG NHÀ CUNG CẤP</span><strong id="supplierTotal">0</strong><small>Hồ sơ đã khai báo</small></article><article class="warehouse-stat"><span>ĐANG HỢP TÁC</span><strong id="supplierActive">0</strong><small>Có thể chọn vào Đơn mua</small></article><article class="warehouse-stat danger"><span>NGỪNG HỢP TÁC</span><strong id="supplierInactive">0</strong><small>Chỉ giữ để tra cứu lịch sử</small></article></div>
      <article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="supplierSearch" placeholder="Tìm mã, tên, mã số thuế hoặc số điện thoại..."></label><div class="warehouse-toolbar-actions"><select id="supplierStatusFilter"><option value="">Tất cả trạng thái</option><option>Đang hợp tác</option><option>Ngừng hợp tác</option></select><button class="warehouse-icon-button" id="refreshSuppliers"><svg><use href="#i-refresh"/></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÀ CUNG CẤP</th><th>LIÊN HỆ</th><th>ĐỊA CHỈ</th><th>ĐƠN MUA</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody id="supplierBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#supplierSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#supplierStatusFilter').addEventListener('change', load);
    root.querySelector('#refreshSuppliers').addEventListener('click', load);
    root.querySelector('#newSupplier').addEventListener('click', () => supplierModal(context, null, load));
    root.addEventListener('click', async event => {
      const edit = event.target.closest('[data-edit-supplier]');
      if (edit) return supplierModal(context, items.find(item => item.MaNCC === edit.dataset.editSupplier), load);
      const toggle = event.target.closest('[data-toggle-supplier]');
      if (!toggle) return;
      const item = items.find(supplier => supplier.MaNCC === toggle.dataset.toggleSupplier);
      try {
        const data = await api(context, `/suppliers/${encodeURIComponent(item.MaNCC)}/status`, { method: 'PATCH', body: JSON.stringify({ TrangThai: item.TrangThai === 'Đang hợp tác' ? 'Ngừng hợp tác' : 'Đang hợp tác' }) });
        context.showToast(data.message, 'success'); await load();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
    await load();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'purchasing-suppliers') return initSuppliers(document.querySelector('.warehouse-page'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
