(() => {
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const statusClass = status => ({
    'Nháp': 'draft', 'Đã gửi': 'sent', 'Đang xử lý': 'processing', 'Yêu cầu bổ sung': 'returned',
    'Đã hủy': 'cancelled', 'Hoàn thành': 'ok', 'Đã lập đơn': 'ok'
  }[status] || 'draft');
  const stockStatus = item => item.MucTon === 'Hết hàng' ? 'out' : ['Cần bổ sung', 'Chưa nhập lần đầu'].includes(item.MucTon) ? 'low' : 'ok';

  const templates = {
    'warehouse-home': '<section class="warehouse-page" id="warehouseHome"><div class="overview-loading">Đang tổng hợp tình hình kho...</div></section>',
    'warehouse-inventory': '<section class="warehouse-page" id="warehouseInventory"><div class="overview-loading">Đang tải tồn kho...</div></section>',
    'warehouse-requests': '<section class="warehouse-page" id="warehouseRequests"><div class="overview-loading">Đang tải đề nghị mua hàng...</div></section>',
    'purchasing-inbox': '<section class="warehouse-page" id="purchasingInbox"><div class="overview-loading">Đang tải đề nghị từ kho...</div></section>'
  };

  const api = async (context, path, options = {}) => {
    const response = await fetch(`${context.apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };

  const heading = (kicker, title, subtitle, action = '') => `
    <header class="warehouse-heading">
      <div><p class="warehouse-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}
    </header>`;

  const showError = (root, error) => {
    root.innerHTML = `<div class="welcome-card"><h2>Không thể tải dữ liệu</h2><p>${esc(error.message)}</p></div>`;
  };

  const initHome = async (root, context) => {
    try {
      const data = await api(context, '/warehouse/dashboard');
      const s = data.summary;
      const lowRows = data.lowStock.length ? data.lowStock.map(item => `
        <li><div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · Định mức ${item.TonKhoToiThieu} ${esc(item.DonViTinh)}</small></div><div class="warehouse-stock-number"><b>${item.SLTon}</b><small>Đang đặt: ${item.SLDatMua}</small></div></li>`).join('') : '<li><div><strong>Không có mặt hàng dưới định mức</strong><small>Tồn kho đang ở mức ổn định.</small></div></li>';
      const requestRows = data.recentRequests.length ? data.recentRequests.map(item => `
        <li><div><strong>${esc(item.MaDN)}</strong><small>${item.SoMatHang} mặt hàng · ${fmtDate(item.NgayLap)}</small></div><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></li>`).join('') : '<li><div><strong>Chưa có đề nghị mua hàng</strong><small>Bắt đầu từ danh sách mặt hàng cần bổ sung.</small></div></li>';
      root.innerHTML = `
        ${heading('KHO HÀNG / TỔNG QUAN', 'Nhịp vận hành kho hôm nay', `${data.warehouse.TenKho} · ${data.warehouse.DiaChi}`, '<span class="warehouse-chip">Dữ liệu tồn kho hiện tại</span>')}
        <article class="warehouse-hero"><div class="warehouse-hero-copy"><span><svg><use href="#i-warning"/></svg> CHUẨN BỊ KHAI TRƯƠNG</span><h2>${Number(s.ChuaNhapLanDau || 0)} mặt hàng chưa nhập lần đầu</h2><p>Danh mục hàng hóa đã được Quản lý chốt. Thủ kho lập đề nghị nhập khai trương để bộ phận mua hàng lựa chọn Nhà cung cấp và lập Đơn mua.</p><button class="warehouse-primary" data-go="warehouse-inventory"><svg><use href="#i-inventory"/></svg>Mở danh sách hàng khai trương</button></div></article>
        <div class="warehouse-stats">
          <article class="warehouse-stat"><span>MẶT HÀNG ĐANG QUẢN LÝ</span><strong>${s.TongMatHang || 0}</strong><small>Đang kinh doanh tại cửa hàng</small></article>
          <article class="warehouse-stat warn"><span>CHƯA NHẬP LẦN ĐẦU</span><strong>${s.ChuaNhapLanDau || 0}</strong><small>Danh mục đã có, kho chưa nhận hàng</small></article>
          <article class="warehouse-stat danger"><span>ĐÃ HẾT HÀNG</span><strong>${s.HetHang || 0}</strong><small>Cần kiểm tra ngay tại kệ/kho</small></article>
          <article class="warehouse-stat"><span>ĐÃ ĐẶT, CHƯA NHẬN</span><strong>${s.DangDatMua || 0}</strong><small>Tổng số lượng đang chờ giao</small></article>
        </div>
        <div class="warehouse-columns">
          <article class="warehouse-panel"><div class="warehouse-panel-title"><div><p>NHU CẦU NHẬP HÀNG</p><h2>Mặt hàng cần lập đề nghị</h2></div><button class="warehouse-link" data-go="warehouse-inventory">Xem tất cả ›</button></div><ul class="warehouse-list">${lowRows}</ul></article>
          <article class="warehouse-panel"><div class="warehouse-panel-title"><div><p>ĐỀ NGHỊ GẦN ĐÂY</p><h2>Trạng thái xử lý</h2></div><button class="warehouse-link" data-go="warehouse-requests">Mở danh sách ›</button></div><ul class="warehouse-list">${requestRows}</ul></article>
        </div>`;
      root.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => context.navigate(button.dataset.go)));
    } catch (error) { showError(root, error); }
  };

  const requestModal = (context, items, existing = null) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'warehouse-modal-backdrop';
    const lineHtml = items.map(item => {
      const current = item.SLTonHienTai ?? item.SLTon ?? 0;
      const suggested = item.SLDeNghi ?? Math.max(1, Number(item.TonKhoToiThieu || 0) - Number(current) - Number(item.SLDatMua || 0));
      return `<div class="warehouse-form-line" data-product="${esc(item.MaSP)}">
        <div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.DonViTinh)}</small></div>
        <span>${current}</span><span>${item.TonKhoToiThieu ?? item.SLTonToiThieu ?? 0}</span><span>${item.SLDatMua ?? 0}</span>
        <input class="request-qty" type="number" min="1" step="1" value="${suggested}" aria-label="Số lượng đề nghị ${esc(item.TenSP)}">
        <button class="remove-line" type="button" title="Bỏ mặt hàng">×</button></div>`;
    }).join('');
    backdrop.innerHTML = `<div class="warehouse-modal" role="dialog" aria-modal="true">
      <div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐỀ NGHỊ MUA HÀNG</p><h2>${existing ? `Cập nhật ${esc(existing.MaDN)}` : 'Lập đề nghị nhập hàng khai trương'}</h2></div><button class="warehouse-icon-button modal-close" aria-label="Đóng">×</button></div>
      <div class="warehouse-modal-body">
        <div class="warehouse-form-grid"><div class="warehouse-field"><label>Lý do đề nghị</label><input id="requestReason" maxlength="500" value="${esc(existing?.LyDo || 'Nhập hàng khai trương')}"></div><div class="warehouse-field"><label>Ghi chú chung</label><input id="requestNote" maxlength="500" value="${esc(existing?.GhiChu || '')}" placeholder="Thông tin cần bộ phận mua hàng lưu ý"></div></div>
        <div class="warehouse-modal-note">Phiếu đề nghị chỉ ghi nhận nhu cầu mua. Tồn kho và số lượng đang đặt chưa thay đổi cho đến khi Đơn mua được gửi Nhà cung cấp và Phiếu nhập được xác nhận.</div>
        <div class="warehouse-form-lines"><div class="warehouse-form-line heading"><span>Mặt hàng</span><span>Tồn hiện tại</span><span>Định mức</span><span>Đã đặt</span><span>SL đề nghị</span><span></span></div>${lineHtml}</div>
      </div>
      <div class="warehouse-modal-actions"><button class="warehouse-secondary modal-close" type="button">Đóng</button><button class="warehouse-secondary save-draft" type="button">Lưu bản nháp</button><button class="warehouse-primary save-submit" type="button">Lưu và gửi mua hàng</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    backdrop.querySelectorAll('.remove-line').forEach(button => button.addEventListener('click', () => button.closest('.warehouse-form-line').remove()));

    const save = async submit => {
      const rows = Array.from(backdrop.querySelectorAll('.warehouse-form-line[data-product]'));
      if (!rows.length) return context.showToast('Đề nghị phải còn ít nhất một mặt hàng.', 'error');
      const lines = rows.map(row => ({
        MaSP: row.dataset.product,
        SLDeNghi: Number(row.querySelector('.request-qty').value)
      }));
      const payload = { LyDo: backdrop.querySelector('#requestReason').value, GhiChu: backdrop.querySelector('#requestNote').value, lines };
      try {
        const saved = existing
          ? await api(context, `/warehouse/purchase-requests/${existing.MaDN}`, { method: 'PUT', body: JSON.stringify(payload) })
          : await api(context, '/warehouse/purchase-requests', { method: 'POST', body: JSON.stringify(payload) });
        const id = existing?.MaDN || saved.MaDN;
        if (submit) await api(context, `/warehouse/purchase-requests/${id}/submit`, { method: 'POST' });
        context.showToast(submit ? 'Đã gửi đề nghị tới Nhân viên mua hàng.' : saved.message, 'success');
        close();
        context.navigate('warehouse-requests');
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    backdrop.querySelector('.save-draft').addEventListener('click', () => save(false));
    backdrop.querySelector('.save-submit').addEventListener('click', () => save(true));
  };

  const detailModal = async (context, id, purchasing = false) => {
    try {
      const data = await api(context, `/${purchasing ? 'purchasing' : 'warehouse'}/purchase-requests/${id}`);
      const request = data.request;
      const backdrop = document.createElement('div');
      backdrop.className = 'warehouse-modal-backdrop';
      const rows = data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)}</small></td><td class="num">${line.SLTonHienTai}</td><td class="num">${line.SLTonToiThieu}</td><td class="num">${line.SLDeNghi}</td><td>${esc(line.GhiChu || '—')}</td></tr>`).join('');
      backdrop.innerHTML = `<div class="warehouse-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHI TIẾT ĐỀ NGHỊ</p><h2>${esc(request.MaDN)}</h2></div><button class="warehouse-icon-button modal-close">×</button></div><div class="warehouse-modal-body">
        <div class="warehouse-detail-grid"><div><span>NGƯỜI LẬP</span><strong>${esc(request.NguoiLap)}</strong></div><div><span>THỜI GIAN</span><strong>${fmtDate(request.NgayGui || request.NgayLap)}</strong></div><div><span>TRẠNG THÁI</span><strong><span class="status-pill ${statusClass(request.TrangThai)}">${esc(request.TrangThai)}</span></strong></div></div>
        <p><strong>Lý do:</strong> ${esc(request.LyDo || 'Không ghi')}</p><p><strong>Ghi chú:</strong> ${esc(request.GhiChu || 'Không có')}</p>
        <div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>TỒN HIỆN TẠI</th><th>ĐỊNH MỨC</th><th>ĐỀ NGHỊ</th><th>GHI CHÚ</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div><div class="warehouse-modal-actions"><button class="warehouse-secondary modal-close">Đóng</button><button class="warehouse-primary print-request"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', () => backdrop.remove()));
      backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
      backdrop.querySelector('.print-request').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'PHIẾU ĐỀ NGHỊ MUA HÀNG', number: request.MaDN,
        documentDate: request.NgayLap, status: request.TrangThai,
        fields: [
          { label: 'Người đề nghị', value: request.NguoiLap }, { label: 'Bộ phận', value: 'Kho hàng' },
          { label: 'Lý do đề nghị', value: request.LyDo || 'Bổ sung hàng hóa' },
          { label: 'Thời điểm gửi', value: request.NgayGui || request.NgayLap, format: 'date' }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
          { label: 'Tồn hiện tại', key: 'SLTonHienTai', align: 'right' },
          { label: 'Tồn tối thiểu', key: 'SLTonToiThieu', align: 'right' },
          { label: 'SL đề nghị', key: 'SLDeNghi', align: 'right' }, { label: 'Ghi chú', key: 'GhiChu' }
        ], rows: data.lines,
        totals: [{ label: 'Tổng số lượng đề nghị', value: data.lines.reduce((sum, line) => sum + Number(line.SLDeNghi || 0), 0) }],
        note: request.GhiChu || 'Phiếu được chuyển đến Nhân viên mua hàng để tiếp nhận và lập Đơn mua.',
        signatures: ['Thủ kho lập phiếu', 'Nhân viên mua hàng tiếp nhận']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const purchasingFeedbackModal = (context, id, onDone) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'warehouse-modal-backdrop';
    backdrop.innerHTML = `<div class="warehouse-modal" style="width:min(620px,95vw)"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHẢN HỒI ĐỀ NGHỊ</p><h2>Yêu cầu Thủ kho bổ sung</h2></div><button class="warehouse-icon-button modal-close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-field"><label>Nội dung cần bổ sung *</label><textarea id="purchasingFeedback" maxlength="500" placeholder="Nêu rõ mặt hàng hoặc số lượng cần kiểm tra lại..."></textarea></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary modal-close">Hủy</button><button class="warehouse-primary send-feedback">Gửi phản hồi</button></div></div>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', close));
    backdrop.querySelector('.send-feedback').addEventListener('click', async () => {
      const LyDo = backdrop.querySelector('#purchasingFeedback').value.trim();
      if (!LyDo) return context.showToast('Vui lòng nhập nội dung cần bổ sung.', 'error');
      try {
        const data = await api(context, `/purchasing/purchase-requests/${id}/request-changes`, { method: 'POST', body: JSON.stringify({ LyDo }) });
        context.showToast(data.message, 'success'); close(); await onDone();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
    backdrop.querySelector('textarea').focus();
  };

  const initInventory = async (root, context) => {
    let currentItems = [];
    const load = async () => {
      const search = root.querySelector('#inventorySearch')?.value || '';
      const lowOnly = root.querySelector('#lowOnly')?.checked ?? true;
      try {
        const data = await api(context, `/warehouse/inventory?search=${encodeURIComponent(search)}&lowOnly=${lowOnly}`);
        currentItems = data.items;
        const rows = data.items.length ? data.items.map(item => `<tr>
          <td><input type="checkbox" class="inventory-select" value="${esc(item.MaSP)}" ${item.MucTon === 'Đủ hàng' ? '' : 'checked'}></td>
          <td><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.MaVach || 'Chưa có mã vạch')}</small></td><td>${esc(item.TenDM)}</td>
          <td class="num">${item.SLTon}</td><td class="num">${item.TonKhoToiThieu}</td><td class="num">${item.SLDatMua}</td>
          <td><span class="status-pill ${stockStatus(item)}">${esc(item.MucTon)}</span></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Không có mặt hàng phù hợp bộ lọc.</td></tr>';
        root.querySelector('#inventoryBody').innerHTML = rows;
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('KHO HÀNG / TỒN KHO', 'Danh mục hàng và nhu cầu nhập', 'Theo dõi hàng chưa nhập lần đầu, số tồn hiện tại và lượng đang đặt mua.', '<span class="warehouse-chip">Kho cửa hàng Hà Nội</span>')}
      <article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="inventorySearch" placeholder="Tìm mã, tên sản phẩm hoặc mã vạch..."></label><div class="warehouse-toolbar-actions"><label class="warehouse-check"><input id="lowOnly" type="checkbox" checked> Chỉ hiện hàng cần nhập</label><button class="warehouse-secondary" id="refreshInventory"><svg><use href="#i-refresh"/></svg>Làm mới</button><button class="warehouse-primary" id="createRequest"><svg><use href="#i-plus"/></svg>Lập đề nghị khai trương</button></div></div>
      <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>CHỌN</th><th>MẶT HÀNG</th><th>NHÓM HÀNG</th><th>TỒN HIỆN TẠI</th><th>TỒN TỐI THIỂU</th><th>ĐÃ ĐẶT</th><th>MỨC TỒN</th></tr></thead><tbody id="inventoryBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#inventorySearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#lowOnly').addEventListener('change', load);
    root.querySelector('#refreshInventory').addEventListener('click', load);
    root.querySelector('#createRequest').addEventListener('click', () => {
      const selected = Array.from(root.querySelectorAll('.inventory-select:checked')).map(box => currentItems.find(item => item.MaSP === box.value)).filter(Boolean);
      if (!selected.length) return context.showToast('Hãy chọn ít nhất một mặt hàng.', 'error');
      requestModal(context, selected);
    });
    await load();
  };

  const initRequests = async (root, context) => {
    const load = async () => {
      const search = root.querySelector('#requestSearch').value;
      const status = root.querySelector('#requestStatus').value;
      try {
        const data = await api(context, `/warehouse/purchase-requests?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        root.querySelector('#requestBody').innerHTML = data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaDN)}</strong><small>${fmtDate(item.NgayLap)}</small></td><td>${item.SoMatHang}</td><td class="num">${item.TongSoLuong}</td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td><td>${fmtDate(item.NgayGui)}</td><td><div class="warehouse-row-actions warehouse-request-actions"><button data-view="${esc(item.MaDN)}"><svg><use href="#i-report"/></svg>Xem</button>${['Nháp','Yêu cầu bổ sung'].includes(item.TrangThai) ? `<button data-edit="${esc(item.MaDN)}"><svg><use href="#i-settings"/></svg>Chỉnh sửa</button><button class="send" data-submit="${esc(item.MaDN)}"><svg><use href="#i-approve"/></svg>Gửi mua hàng</button><button class="cancel" data-cancel="${esc(item.MaDN)}"><svg><use href="#i-warning"/></svg>Hủy</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa có đề nghị mua hàng phù hợp.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('KHO HÀNG / ĐỀ NGHỊ MUA', 'Đề nghị mua hàng', 'Lưu bản nháp, kiểm tra lại số lượng và gửi trực tiếp tới Nhân viên mua hàng.', '<button class="warehouse-primary" id="newRequestFromLow"><svg><use href="#i-plus"/></svg>Lập từ cảnh báo tồn</button>')}
      <article class="warehouse-table-card warehouse-request-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="requestSearch" placeholder="Tìm mã đề nghị hoặc lý do..."></label><div class="warehouse-toolbar-actions"><select id="requestStatus"><option value="">Tất cả trạng thái</option><option>Nháp</option><option>Đã gửi</option><option>Đang xử lý</option><option>Yêu cầu bổ sung</option><option>Đã lập đơn</option><option>Hoàn thành</option><option>Đã hủy</option></select><button class="warehouse-icon-button" id="refreshRequests" title="Làm mới danh sách"><svg><use href="#i-refresh"/></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table warehouse-request-table"><colgroup><col style="width:17%"><col style="width:11%"><col style="width:11%"><col style="width:16%"><col style="width:15%"><col style="width:30%"></colgroup><thead><tr><th>MÃ ĐỀ NGHỊ</th><th>MẶT HÀNG</th><th>TỔNG SL</th><th>TRẠNG THÁI</th><th>NGÀY GỬI</th><th>THAO TÁC</th></tr></thead><tbody id="requestBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#requestSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#requestStatus').addEventListener('change', load);
    root.querySelector('#refreshRequests').addEventListener('click', load);
    root.querySelector('#newRequestFromLow').addEventListener('click', () => context.navigate('warehouse-inventory'));
    root.addEventListener('click', async event => {
      const view = event.target.closest('[data-view]'); if (view) return detailModal(context, view.dataset.view);
      const submit = event.target.closest('[data-submit]');
      if (submit) { try { const data = await api(context, `/warehouse/purchase-requests/${submit.dataset.submit}/submit`, { method: 'POST' }); context.showToast(data.message); await load(); } catch (error) { context.showToast(error.message, 'error'); } return; }
      const cancel = event.target.closest('[data-cancel]');
      if (cancel) { try { const data = await api(context, `/warehouse/purchase-requests/${cancel.dataset.cancel}/cancel`, { method: 'POST' }); context.showToast(data.message); await load(); } catch (error) { context.showToast(error.message, 'error'); } return; }
      const edit = event.target.closest('[data-edit]');
      if (edit) { try { const data = await api(context, `/warehouse/purchase-requests/${edit.dataset.edit}`); requestModal(context, data.lines.map(line => ({ ...line, TonKhoToiThieu: line.SLTonToiThieu })), data.request); } catch (error) { context.showToast(error.message, 'error'); } }
    });
    await load();
  };

  const initPurchasing = async (root, context) => {
    const load = async () => {
      const search = root.querySelector('#purchasingSearch').value;
      const status = root.querySelector('#purchasingStatus').value;
      try {
        const data = await api(context, `/purchasing/purchase-requests?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        const totals = search || status ? await api(context, '/purchasing/purchase-requests') : data;
        const newCount = totals.items.filter(item => item.TrangThai === 'Đã gửi').length;
        const processingCount = totals.items.filter(item => item.TrangThai === 'Đang xử lý').length;
        const orderedCount = totals.items.filter(item => ['Đã lập đơn', 'Hoàn thành'].includes(item.TrangThai)).length;
        const badge = document.getElementById('purchasingNavBadge'); if (badge) badge.textContent = String(newCount).padStart(2, '0');
        root.querySelector('#purchasingHeaderCount').textContent = String(newCount).padStart(2, '0');
        root.querySelector('#purchasingWaitingCount').textContent = String(newCount).padStart(2, '0');
        root.querySelector('#purchasingProcessingCount').textContent = String(processingCount).padStart(2, '0');
        root.querySelector('#purchasingOrderedCount').textContent = String(orderedCount).padStart(2, '0');
        root.querySelector('#purchasingBody').innerHTML = data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaDN)}</strong><small>Gửi lúc ${fmtDate(item.NgayGui)}</small></td><td><strong>${esc(item.NguoiLap)}</strong><small>Bộ phận kho</small></td><td><strong>${item.SoMatHang}</strong><small>mặt hàng</small></td><td class="num"><strong>${item.TongSoLuong}</strong><small>đơn vị đề nghị</small></td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td><td><div class="warehouse-row-actions purchasing-actions"><button data-view="${esc(item.MaDN)}"><svg><use href="#i-report"/></svg>Mở hồ sơ</button>${item.TrangThai === 'Đã gửi' ? `<button class="send" data-accept="${esc(item.MaDN)}"><svg><use href="#i-approve"/></svg>Tiếp nhận</button><button class="cancel" data-return="${esc(item.MaDN)}"><svg><use href="#i-warning"/></svg>Trả bổ sung</button>` : ''}${item.TrangThai === 'Đang xử lý' ? `<button class="send" data-create-order="${esc(item.MaDN)}"><svg><use href="#i-plus"/></svg>Lập Đơn mua</button><button class="cancel" data-return="${esc(item.MaDN)}"><svg><use href="#i-warning"/></svg>Trả bổ sung</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="6" class="warehouse-empty"><strong>Chưa có đề nghị cần xử lý</strong><small>Đề nghị do Thủ kho gửi sẽ xuất hiện tại đây.</small></td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('MUA HÀNG / TIẾP NHẬN', 'Đề nghị từ kho', 'Kiểm tra nhu cầu do bộ phận kho chuyển sang trước khi lập Đơn mua.', '<span class="warehouse-chip purchasing-heading-chip"><b id="purchasingHeaderCount">00</b> hồ sơ chờ tiếp nhận</span>')}
      <article class="warehouse-hero purchasing-inbox-hero"><div class="warehouse-hero-copy"><span><svg><use href="#i-request"/></svg> BÀN GIAO NHU CẦU MUA HÀNG</span><h2>Kiểm tra đúng mặt hàng, số lượng và lý do đề nghị</h2><p>Tiếp nhận hồ sơ hợp lệ để chọn Nhà cung cấp và lập Đơn mua. Nếu thông tin chưa rõ, trả lại bộ phận kho kèm nội dung cần bổ sung.</p></div><div class="purchasing-flow"><div class="active"><i>1</i><span><b>Đề nghị từ kho</b><small>Kiểm tra hồ sơ</small></span></div><em></em><div><i>2</i><span><b>Lập Đơn mua</b><small>Chọn Nhà cung cấp</small></span></div><em></em><div><i>3</i><span><b>Trình phê duyệt</b><small>Quản lý quyết định</small></span></div></div></article>
      <div class="warehouse-queue-stats"><article class="waiting"><span>CHỜ TIẾP NHẬN</span><strong id="purchasingWaitingCount">00</strong><small>Hồ sơ mới từ bộ phận kho</small></article><article class="processing"><span>ĐANG XỬ LÝ</span><strong id="purchasingProcessingCount">00</strong><small>Đã tiếp nhận, chưa lập Đơn mua</small></article><article class="complete"><span>ĐÃ CHUYỂN ĐƠN MUA</span><strong id="purchasingOrderedCount">00</strong><small>Hồ sơ đã hoàn tất bàn giao</small></article></div>
      <article class="warehouse-table-card purchasing-request-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="purchasingSearch" placeholder="Tìm mã đề nghị, người lập hoặc lý do..."></label><div class="warehouse-toolbar-actions"><select id="purchasingStatus"><option value="">Tất cả trạng thái</option><option>Đã gửi</option><option>Đang xử lý</option><option>Yêu cầu bổ sung</option><option>Đã lập đơn</option><option>Hoàn thành</option></select><button class="warehouse-icon-button" id="refreshPurchasing" title="Làm mới danh sách"><svg><use href="#i-refresh"/></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table purchasing-request-table"><colgroup><col style="width:17%"><col style="width:17%"><col style="width:11%"><col style="width:13%"><col style="width:14%"><col style="width:28%"></colgroup><thead><tr><th>MÃ ĐỀ NGHỊ</th><th>NGƯỜI LẬP</th><th>MẶT HÀNG</th><th>TỔNG SỐ LƯỢNG</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody id="purchasingBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#purchasingSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#purchasingStatus').addEventListener('change', load);
    root.querySelector('#refreshPurchasing').addEventListener('click', load);
    root.addEventListener('click', async event => {
      const view = event.target.closest('[data-view]'); if (view) return detailModal(context, view.dataset.view, true);
      const accept = event.target.closest('[data-accept]');
      if (accept) { try { const data = await api(context, `/purchasing/purchase-requests/${accept.dataset.accept}/accept`, { method: 'POST' }); context.showToast(data.message, 'success'); await load(); } catch (error) { context.showToast(error.message, 'error'); } return; }
      const returned = event.target.closest('[data-return]'); if (returned) return purchasingFeedbackModal(context, returned.dataset.return, load);
      const createOrder = event.target.closest('[data-create-order]');
      if (createOrder) { sessionStorage.setItem('fly_order_source_request', createOrder.dataset.createOrder); context.navigate('purchasing-orders'); }
    });
    await load();
  };

  const init = async (pageName, context) => {
    const root = document.querySelector('.warehouse-page');
    if (!root) return;
    if (pageName === 'warehouse-home') return initHome(root, context);
    if (pageName === 'warehouse-inventory') return initInventory(root, context);
    if (pageName === 'warehouse-requests') return initRequests(root, context);
    if (pageName === 'purchasing-inbox') return initPurchasing(root, context);
  };

  window.FLY_ROLE_PAGES = { templates, init };
})();
