(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'purchasing-orders': '<section class="warehouse-page" id="purchasingOrders"><div class="overview-loading">Đang tải Đơn mua hàng...</div></section>',
    'manager-purchase-approvals': '<section class="warehouse-page" id="managerPurchaseApprovals"><div class="overview-loading">Đang tải hồ sơ chờ duyệt...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const statusClass = status => ({ 'Nháp': 'draft', 'Chờ duyệt': 'sent', 'Đã duyệt': 'ok', 'Yêu cầu chỉnh sửa': 'returned', 'Từ chối': 'cancelled', 'Đã gửi Nhà cung cấp': 'processing', 'Nhà cung cấp xác nhận': 'ok', 'Đang giao': 'processing', 'Giao một phần': 'returned', 'Hoàn thành': 'ok' }[status] || 'draft');
  const api = async (context, path, options = {}) => {
    const response = await fetch(`${context.apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };
  const heading = (kicker, title, subtitle, action = '') => `<header class="warehouse-heading"><div><p class="warehouse-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</header>`;

  const decisionModal = (context, id, action, title, onDone) => {
    const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal" style="width:min(620px,95vw)"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">QUYẾT ĐỊNH PHÊ DUYỆT</p><h2>${esc(title)}</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-field"><label>Lý do *</label><textarea id="decisionReason" maxlength="500" placeholder="Nêu rõ nội dung cần chỉnh sửa hoặc lý do từ chối..."></textarea></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary submit-decision">Xác nhận</button></div></div>`;
    document.body.appendChild(overlay); const close = () => overlay.remove(); overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('.submit-decision').addEventListener('click', async () => { const LyDo = overlay.querySelector('#decisionReason').value.trim(); if (!LyDo) return context.showToast('Vui lòng nhập lý do.', 'error'); try { const data = await api(context, `/admin/approvals/purchase-orders/${id}/${action}`, { method: 'POST', body: JSON.stringify({ LyDo }) }); context.showToast(data.message, 'success'); close(); await onDone(); } catch (error) { context.showToast(error.message, 'error'); } });
    overlay.querySelector('textarea').focus();
  };

  const returnSourceRequestModal = (context, order, onDone) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal warehouse-confirm-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHỐI HỢP VỚI BỘ PHẬN KHO</p><h2>Yêu cầu cập nhật Phiếu đề nghị</h2></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="source-return-summary"><svg><use href="#i-warning"/></svg><div><strong>Đơn mua không được vượt số lượng đã đề nghị</strong><p>Phiếu ${esc(order.MaDN)} sẽ được chuyển về Thủ kho để kiểm tra và cập nhật. Sau khi Thủ kho gửi lại, Nhân viên mua hàng cần tiếp nhận trước khi sửa Đơn mua.</p></div></div><div class="warehouse-field"><label>Nội dung cần Thủ kho cập nhật *</label><textarea id="sourceReturnReason" maxlength="500" placeholder="Ví dụ: Quản lý yêu cầu tăng BK003 từ 30 lên 35 đơn vị.">${esc(order.LyDoTuChoi || '')}</textarea></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary submit-source-return"><svg><use href="#i-request"/></svg>Chuyển về Thủ kho</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('.submit-source-return').addEventListener('click', async () => {
      const LyDo = overlay.querySelector('#sourceReturnReason').value.trim();
      if (!LyDo) return context.showToast('Vui lòng nêu rõ mặt hàng và số lượng cần cập nhật.', 'error');
      try {
        const result = await api(context, `/purchasing/purchase-requests/${order.MaDN}/request-changes`, { method: 'POST', body: JSON.stringify({ LyDo }) });
        context.showToast(result.message, 'success'); close(); await onDone();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
    overlay.querySelector('textarea').focus();
  };

  const orderDetailModal = async (context, id, manager = false, onDone = async () => {}) => {
    try {
      const base = manager ? '/admin/approvals/purchase-orders' : '/purchasing/purchase-orders';
      const data = await api(context, `${base}/${id}`); const order = data.order;
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      const rows = data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SLTheoDeNghi ?? '—'}</td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${Number(line.ChietKhau)}%</td><td class="num"><strong>${money(line.ThanhTien)}</strong></td><td class="num">${line.SLDaGiao}</td><td class="num">${line.SLConThieu}</td></tr>`).join('');
      const shipmentHistory = data.shipments?.length ? `<section class="shipment-history"><div class="shipment-history-heading"><span>THEO DÕI GIAO HÀNG</span><strong>${data.shipments.length} chuyến</strong></div>${data.shipments.map(item => `<article><div><span>${esc(item.MaTBGH)}</span><strong>Phiếu giao ${esc(item.SoPhieuGiao)}</strong></div><div><span>VẬN CHUYỂN</span><strong>${esc(item.BienSoXe || 'Chưa có biển số')}</strong><small>${esc(item.TenTaiXe || 'Chưa ghi tài xế')}</small></div><div><span>DỰ KIẾN ĐẾN</span><strong>${fmtDate(item.NgayGioDuKienDen)}</strong><small>${item.NgayDen ? `Đã đến ${fmtDate(item.NgayDen)}` : 'Chưa ghi nhận đến kho'}</small></div><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></article>`).join('')}</section>` : '';
      const managerActions = manager && order.TrangThai === 'Chờ duyệt' ? `<button class="warehouse-danger reject-order">Từ chối</button><button class="warehouse-secondary revise-order">Yêu cầu chỉnh sửa</button><button class="warehouse-primary approve-order">Phê duyệt Đơn mua</button>` : '';
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐƠN MUA HÀNG</p><h2>${esc(order.MaPO)}</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(order.TenNCC)}</strong></div><div><span>PHIẾU ĐỀ NGHỊ</span><strong>${esc(order.MaDN)}</strong></div><div><span>TRẠNG THÁI</span><strong><span class="status-pill ${statusClass(order.TrangThai)}">${esc(order.TrangThai)}</span></strong></div><div><span>NGÀY GIAO DỰ KIẾN</span><strong>${fmtDate(order.NgayGiaoDuKien)}</strong></div><div><span>THANH TOÁN</span><strong>${order.SoNgayThanhToan} ngày</strong></div><div><span>TỔNG TIỀN</span><strong>${money(order.TongTien)}</strong></div></div><p><strong>Điều khoản:</strong> ${esc(order.DieuKhoanThanhToan)}</p>${order.LyDoTuChoi ? `<p class="warehouse-modal-note"><strong>Phản hồi phê duyệt:</strong> ${esc(order.LyDoTuChoi)}</p>` : ''}${manager ? '<p class="order-source-rule"><svg><use href="#i-warning"/></svg>Nếu cần tăng số lượng vượt Phiếu đề nghị, hãy ghi rõ để bộ phận mua hàng chuyển hồ sơ về Thủ kho cập nhật.</p>' : ''}${shipmentHistory}<div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SL ĐỀ NGHỊ</th><th>SL ĐẶT</th><th>ĐƠN GIÁ</th><th>CHIẾT KHẤU</th><th>THÀNH TIỀN</th><th>ĐÃ NHẬN</th><th>CÒN THIẾU</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng</button><button class="warehouse-secondary print-order"><svg><use href="#i-report"/></svg>Xem bản in</button>${managerActions}</div></div>`;
      document.body.appendChild(overlay); const close = () => overlay.remove(); overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.print-order').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'ĐƠN MUA HÀNG', number: order.MaPO, documentDate: order.NgayLap, status: order.TrangThai,
        fields: [
          { label: 'Nhà cung cấp', value: order.TenNCC }, { label: 'Phiếu đề nghị nguồn', value: order.MaDN },
          { label: 'Người lập', value: order.NguoiLap }, { label: 'Người phê duyệt', value: order.NguoiDuyet || 'Chưa phê duyệt' },
          { label: 'Ngày giao dự kiến', value: order.NgayGiaoDuKien, format: 'date' }, { label: 'Điều khoản thanh toán', value: order.DieuKhoanThanhToan }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' }, { label: 'ĐVT', key: 'DonViTinh' },
          { label: 'Số lượng', key: 'SoLuong', align: 'right' }, { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
          { label: 'CK', key: 'ChietKhau', format: 'percent', align: 'right' }, { label: 'Thành tiền', key: 'ThanhTien', format: 'money', align: 'right' }
        ], rows: data.lines, totals: [{ label: 'TỔNG GIÁ TRỊ ĐƠN MUA', value: order.TongTien, format: 'money' }],
        note: order.GhiChu || `Thanh toán trong ${order.SoNgayThanhToan} ngày theo điều khoản trên Đơn mua.`,
        signatures: ['Nhân viên mua hàng', 'Quản lý cửa hàng', 'Đại diện Nhà cung cấp']
      }));
      overlay.querySelector('.approve-order')?.addEventListener('click', async () => { try { const result = await api(context, `/admin/approvals/purchase-orders/${id}/approve`, { method: 'POST' }); context.showToast(result.message, 'success'); close(); await onDone(); } catch (error) { context.showToast(error.message, 'error'); } });
      overlay.querySelector('.revise-order')?.addEventListener('click', () => { close(); decisionModal(context, id, 'request-changes', 'Yêu cầu chỉnh sửa Đơn mua', onDone); });
      overlay.querySelector('.reject-order')?.addEventListener('click', () => { close(); decisionModal(context, id, 'reject', 'Từ chối Đơn mua hàng', onDone); });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const createOrderModal = async (context, onDone) => {
    try {
      const [requestsData, suppliersData] = await Promise.all([api(context, '/purchasing/purchase-requests?status=Đang xử lý'), api(context, '/suppliers?status=Đang hợp tác')]);
      if (!requestsData.items.length) return context.showToast('Chưa có Phiếu đề nghị ở trạng thái Đang xử lý.', 'error');
      if (!suppliersData.items.length) return context.showToast('Hãy khai báo Nhà cung cấp đang hợp tác trước.', 'error');
      const preferred = sessionStorage.getItem('fly_order_source_request'); sessionStorage.removeItem('fly_order_source_request');
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      const delivery = new Date(); delivery.setDate(delivery.getDate() + 7);
      overlay.innerHTML = `<div class="warehouse-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">LẬP ĐƠN MUA HÀNG</p><h2>Từ Phiếu đề nghị đã tiếp nhận</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-form-grid"><div class="warehouse-field"><label>Phiếu đề nghị *</label><select id="orderRequest">${requestsData.items.map(item => `<option value="${esc(item.MaDN)}">${esc(item.MaDN)} · ${item.SoMatHang} mặt hàng</option>`).join('')}</select></div><div class="warehouse-field"><label>Nhà cung cấp *</label><select id="orderSupplier">${suppliersData.items.map(item => `<option value="${esc(item.MaNCC)}">${esc(item.TenNCC)}</option>`).join('')}</select></div><div class="warehouse-field"><label>Ngày giao dự kiến *</label>${window.FLY_VI_DATE.dateField('orderDelivery', delivery.toISOString().slice(0, 10))}</div><div class="warehouse-field"><label>Thời hạn thanh toán *</label><input id="orderPaymentDays" type="number" min="30" max="45" value="30"></div><div class="warehouse-field form-span-2"><label>Điều khoản thanh toán</label><input id="orderTerms" maxlength="500" value="Thanh toán toàn bộ một lần sau 30 ngày"></div></div><div class="warehouse-form-lines" id="orderLines"></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-secondary save-order">Lưu bản nháp</button><button class="warehouse-primary submit-order">Lưu và gửi duyệt</button></div></div>`;
      document.body.appendChild(overlay); const close = () => overlay.remove(); overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      if (preferred && requestsData.items.some(item => item.MaDN === preferred)) overlay.querySelector('#orderRequest').value = preferred;
      const loadLines = async () => { const data = await api(context, `/purchasing/purchase-requests/${overlay.querySelector('#orderRequest').value}`); overlay.querySelector('#orderLines').innerHTML = `<div class="warehouse-order-line heading"><span>CHỌN</span><span>MẶT HÀNG</span><span>ĐỀ NGHỊ</span><span>SL ĐẶT</span><span>ĐƠN GIÁ</span><span>CHIẾT KHẤU (%)</span></div>${data.lines.map(line => `<div class="warehouse-order-line" data-product="${esc(line.MaSP)}"><input class="include-line" type="checkbox" checked><div><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></div><span>${line.SLDeNghi}</span><input class="order-qty" type="number" min="1" max="${line.SLDeNghi}" value="${line.SLDeNghi}"><input class="order-price" type="number" min="0" step="100" value="${Number(line.GiaNhap || 0)}"><input class="order-discount" type="number" min="0" max="100" step="0.5" value="0"></div>`).join('')}`; };
      overlay.querySelector('#orderRequest').addEventListener('change', loadLines);
      overlay.querySelector('#orderPaymentDays').addEventListener('input', event => { overlay.querySelector('#orderTerms').value = `Thanh toán toàn bộ một lần sau ${event.target.value || 30} ngày`; });
      const save = async submit => { const lines = Array.from(overlay.querySelectorAll('.warehouse-order-line[data-product]')).filter(row => row.querySelector('.include-line').checked).map(row => ({ MaSP: row.dataset.product, SoLuong: Number(row.querySelector('.order-qty').value), DonGia: Number(row.querySelector('.order-price').value), ChietKhau: Number(row.querySelector('.order-discount').value) })); if (!lines.length) return context.showToast('Hãy chọn ít nhất một mặt hàng.', 'error'); try { const result = await api(context, '/purchasing/purchase-orders', { method: 'POST', body: JSON.stringify({ MaDN: overlay.querySelector('#orderRequest').value, MaNCC: overlay.querySelector('#orderSupplier').value, NgayGiaoDuKien: overlay.querySelector('#orderDelivery').value, SoNgayThanhToan: Number(overlay.querySelector('#orderPaymentDays').value), DieuKhoanThanhToan: overlay.querySelector('#orderTerms').value, lines }) }); if (submit) await api(context, `/purchasing/purchase-orders/${result.MaPO}/submit`, { method: 'POST' }); context.showToast(submit ? 'Đã gửi Đơn mua cho Quản lý phê duyệt.' : result.message, 'success'); close(); await onDone(); } catch (error) { context.showToast(error.message, 'error'); } };
      overlay.querySelector('.save-order').addEventListener('click', () => save(false)); overlay.querySelector('.submit-order').addEventListener('click', () => save(true));
      await loadLines();
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const editOrderModal = async (context, id, onDone) => {
    try {
      const [data, suppliers] = await Promise.all([api(context, `/purchasing/purchase-orders/${id}`), api(context, '/suppliers?status=Đang hợp tác')]);
      const order = data.order;
      if (!['Nháp', 'Yêu cầu chỉnh sửa'].includes(order.TrangThai)) return context.showToast('Đơn mua không còn ở trạng thái có thể chỉnh sửa.', 'error');
      const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
      const sourceReady = ['Đang xử lý', 'Đã lập đơn'].includes(order.TrangThaiDeNghi);
      const sourceState = order.TrangThaiDeNghi === 'Yêu cầu bổ sung'
        ? '<div class="source-state waiting"><svg><use href="#i-clock"/></svg><div><strong>Đang chờ Thủ kho cập nhật Phiếu đề nghị</strong><small>Sau khi Thủ kho gửi lại, hãy vào “Đề nghị từ kho” để tiếp nhận hồ sơ.</small></div></div>'
        : order.TrangThaiDeNghi === 'Đã gửi'
          ? '<div class="source-state ready"><svg><use href="#i-approve"/></svg><div><strong>Thủ kho đã gửi lại Phiếu đề nghị</strong><small>Hãy tiếp nhận lại hồ sơ tại mục “Đề nghị từ kho” trước khi sửa Đơn mua.</small></div></div>'
          : '';
      const lineRows = data.lines.map(line => {
        const max = Number(line.SLToiDaChoDon ?? line.SLTheoDeNghi ?? line.SoLuong);
        return `<div class="warehouse-order-line" data-product="${esc(line.MaSP)}" data-max="${max}"><input class="include-line" type="checkbox" checked><div><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></div><div class="source-limit"><strong>${max}</strong><small>Theo Phiếu ${esc(order.MaDN)}</small></div><div class="qty-field"><input class="order-qty" type="number" min="1" max="${max}" value="${line.SoLuong}"><small class="qty-error">Không vượt quá ${max}</small></div><input class="order-price" type="number" min="0" step="100" value="${Number(line.DonGia)}"><input class="order-discount" type="number" min="0" max="100" step="0.5" value="${Number(line.ChietKhau)}"></div>`;
      }).join('');
      const sourceAction = order.TrangThai === 'Yêu cầu chỉnh sửa' && order.TrangThaiDeNghi === 'Đã lập đơn'
        ? '<button class="warehouse-secondary return-source"><svg><use href="#i-request"/></svg>Yêu cầu kho cập nhật đề nghị</button>'
        : order.TrangThaiDeNghi === 'Đã gửi'
          ? '<button class="warehouse-secondary open-source-inbox"><svg><use href="#i-approve"/></svg>Mở Đề nghị từ kho</button>'
          : '';
      overlay.innerHTML = `<div class="warehouse-modal order-edit-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHỈNH SỬA ĐƠN MUA</p><h2>${esc(order.MaPO)}</h2></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body">${order.LyDoTuChoi ? `<p class="warehouse-modal-note"><strong>Ý kiến của Quản lý:</strong> ${esc(order.LyDoTuChoi)}</p>` : ''}${sourceState}<div class="order-source-rule"><svg><use href="#i-warning"/></svg><div><strong>Giới hạn theo Phiếu đề nghị nguồn</strong><span>Nhân viên mua hàng chỉ được đặt trong số lượng Thủ kho đã đề nghị. Nếu Quản lý yêu cầu tăng thêm, hãy chuyển hồ sơ về kho cập nhật trước.</span></div></div><div class="warehouse-form-grid"><div class="warehouse-field"><label>Phiếu đề nghị nguồn</label><input id="editRequest" value="${esc(order.MaDN)} · ${esc(order.TrangThaiDeNghi || 'Không xác định')}" disabled></div><div class="warehouse-field"><label>Nhà cung cấp *</label><select id="editSupplier" ${sourceReady ? '' : 'disabled'}>${suppliers.items.map(item => `<option value="${esc(item.MaNCC)}" ${item.MaNCC === order.MaNCC ? 'selected' : ''}>${esc(item.TenNCC)}</option>`).join('')}</select></div><div class="warehouse-field"><label>Ngày giao dự kiến *</label>${window.FLY_VI_DATE.dateField('editDelivery', String(order.NgayGiaoDuKien).slice(0,10))}</div><div class="warehouse-field"><label>Thời hạn thanh toán *</label><input id="editPaymentDays" type="number" min="30" max="45" value="${order.SoNgayThanhToan}" ${sourceReady ? '' : 'disabled'}></div><div class="warehouse-field form-span-2"><label>Điều khoản thanh toán</label><input id="editTerms" maxlength="500" value="${esc(order.DieuKhoanThanhToan || '')}" ${sourceReady ? '' : 'disabled'}></div></div><div class="warehouse-form-lines order-edit-lines"><div class="warehouse-order-line heading"><span>CHỌN</span><span>MẶT HÀNG</span><span>TỐI ĐA THEO ĐỀ NGHỊ</span><span>SL ĐẶT</span><span>ĐƠN GIÁ</span><span>CHIẾT KHẤU (%)</span></div>${lineRows}</div></div><div class="warehouse-modal-actions order-edit-actions"><div class="order-edit-actions-left">${sourceAction}</div><div><button class="warehouse-secondary close">Đóng</button><button class="warehouse-secondary save-edit" ${sourceReady ? '' : 'disabled'}>Lưu chỉnh sửa</button><button class="warehouse-primary resubmit-edit" ${sourceReady ? '' : 'disabled'}>Lưu và gửi lại duyệt</button></div></div></div>`;
      document.body.appendChild(overlay); const close = () => overlay.remove(); overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      if (!sourceReady) overlay.querySelector('#editDelivery')?.closest('.fly-vi-date')?.querySelectorAll('select').forEach(select => { select.disabled = true; });
      const validateQuantity = row => {
        const input = row.querySelector('.order-qty');
        const quantity = Number(input.value); const max = Number(row.dataset.max);
        const invalid = !Number.isInteger(quantity) || quantity < 1 || quantity > max;
        row.classList.toggle('line-invalid', invalid); input.setAttribute('aria-invalid', String(invalid));
        return !invalid;
      };
      overlay.querySelectorAll('.warehouse-order-line[data-product]').forEach(row => row.querySelector('.order-qty').addEventListener('input', () => validateQuantity(row)));
      const save = async submit => {
        if (!sourceReady) return context.showToast('Phiếu đề nghị nguồn chưa được tiếp nhận lại nên chưa thể sửa Đơn mua.', 'error');
        const selectedRows = Array.from(overlay.querySelectorAll('.warehouse-order-line[data-product]')).filter(row => row.querySelector('.include-line').checked);
        if (!selectedRows.length) return context.showToast('Đơn mua phải có ít nhất một mặt hàng.', 'error');
        const invalidRow = selectedRows.find(row => !validateQuantity(row));
        if (invalidRow) {
          invalidRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return context.showToast(`${invalidRow.dataset.product} vượt số lượng tối đa của Phiếu đề nghị. Hãy chuyển hồ sơ về Thủ kho nếu cần tăng thêm.`, 'error');
        }
        const lines = selectedRows.map(row => ({ MaSP: row.dataset.product, SoLuong: Number(row.querySelector('.order-qty').value), DonGia: Number(row.querySelector('.order-price').value), ChietKhau: Number(row.querySelector('.order-discount').value) }));
        try {
          const result = await api(context, `/purchasing/purchase-orders/${id}`, { method: 'PUT', body: JSON.stringify({ MaDN: order.MaDN, MaNCC: overlay.querySelector('#editSupplier').value, NgayGiaoDuKien: overlay.querySelector('#editDelivery').value, SoNgayThanhToan: Number(overlay.querySelector('#editPaymentDays').value), DieuKhoanThanhToan: overlay.querySelector('#editTerms').value, lines }) });
          if (submit) await api(context, `/purchasing/purchase-orders/${id}/submit`, { method: 'POST' });
          context.showToast(submit ? 'Đã cập nhật và gửi lại Quản lý phê duyệt.' : result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      };
      overlay.querySelector('.save-edit').addEventListener('click', () => save(false)); overlay.querySelector('.resubmit-edit').addEventListener('click', () => save(true));
      overlay.querySelector('.return-source')?.addEventListener('click', () => returnSourceRequestModal(context, order, async () => { close(); await onDone(); }));
      overlay.querySelector('.open-source-inbox')?.addEventListener('click', () => { close(); context.navigate('purchasing-inbox'); });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const shipmentModal = (context, order, onDone) => {
    const now = new Date();
    const expected = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const localValue = value => {
      const date = new Date(value);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal shipment-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">THEO DÕI NHÀ CUNG CẤP</p><h2>Ghi nhận chuyến giao hàng</h2><p>${esc(order.MaPO)} · ${esc(order.TenNCC)}</p></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="shipment-rule"><svg><use href="#i-truck"></use></svg><div><strong>Ghi nhận theo thông báo của Nhà cung cấp</strong><span>Bước này chuyển hàng sang trạng thái đang vận chuyển. Hàng chưa được tính vào tồn kho cho tới khi Thủ kho kiểm nhận và xác nhận nhập.</span></div></div><div class="warehouse-form-grid"><div class="warehouse-field"><label>Số phiếu giao / vận đơn *</label><input id="shipmentDocument" maxlength="50" placeholder="Ví dụ: PGH-240826-01"></div><div class="warehouse-field"><label>Số kiện dự kiến</label><input id="shipmentPackages" type="number" min="0" step="1" placeholder="Ví dụ: 42"></div><div class="warehouse-field"><label>Thời gian xuất phát *</label>${window.FLY_VI_DATE.datetimeField('shipmentDeparture', localValue(now))}</div><div class="warehouse-field"><label>Dự kiến đến kho *</label>${window.FLY_VI_DATE.datetimeField('shipmentArrival', localValue(expected))}</div><div class="warehouse-field"><label>Biển số xe</label><input id="shipmentPlate" maxlength="20" placeholder="Ví dụ: 29H-123.45"></div><div class="warehouse-field"><label>Tài xế</label><input id="shipmentDriver" maxlength="100" placeholder="Họ tên người giao"></div><div class="warehouse-field"><label>Số điện thoại tài xế</label><input id="shipmentPhone" maxlength="20" placeholder="Số liên hệ khi xe đến"></div><div class="warehouse-field"><label>Ghi chú vận chuyển</label><input id="shipmentNote" maxlength="500" placeholder="Niêm phong, bảo quản lạnh..."></div></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary save-shipment"><svg><use href="#i-truck"></use></svg>Ghi nhận đang giao</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.save-shipment').addEventListener('click', async () => {
      const button = overlay.querySelector('.save-shipment');
      const body = {
        SoPhieuGiao: overlay.querySelector('#shipmentDocument').value,
        SoKien: overlay.querySelector('#shipmentPackages').value,
        NgayXuatPhat: overlay.querySelector('#shipmentDeparture').value,
        NgayGioDuKienDen: overlay.querySelector('#shipmentArrival').value,
        BienSoXe: overlay.querySelector('#shipmentPlate').value,
        TenTaiXe: overlay.querySelector('#shipmentDriver').value,
        SDTTaiXe: overlay.querySelector('#shipmentPhone').value,
        GhiChu: overlay.querySelector('#shipmentNote').value
      };
      if (!body.SoPhieuGiao.trim() || !body.NgayXuatPhat || !body.NgayGioDuKienDen) return context.showToast('Vui lòng nhập số phiếu giao và đủ thời gian vận chuyển.', 'error');
      button.disabled = true;
      try {
        const result = await api(context, `/purchasing/purchase-orders/${order.MaPO}/shipments`, { method: 'POST', body: JSON.stringify(body) });
        context.showToast(result.message, 'success'); close(); await onDone();
      } catch (error) { button.disabled = false; context.showToast(error.message, 'error'); }
    });
    overlay.querySelector('#shipmentDocument').focus();
  };

  const initOrders = async (root, context) => {
    const load = async () => {
      try {
        const search = root.querySelector('#orderSearch').value; const status = root.querySelector('#orderStatus').value;
        const data = await api(context, `/purchasing/purchase-orders?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        root.querySelector('#orderBody').innerHTML = data.items.length ? data.items.map(item => {
          const editable = ['Nháp', 'Yêu cầu chỉnh sửa'].includes(item.TrangThai);
          const sourceReady = ['Đang xử lý', 'Đã lập đơn'].includes(item.TrangThaiDeNghi);
          const editActions = editable
            ? `<button data-edit-order="${esc(item.MaPO)}"><svg><use href="#i-settings"/></svg>${sourceReady ? 'Chỉnh sửa' : 'Theo dõi'}</button>${sourceReady ? `<button class="send" data-submit-order="${esc(item.MaPO)}"><svg><use href="#i-approve"/></svg>Gửi duyệt</button>` : '<span class="order-source-wait"><svg><use href="#i-clock"/></svg>Chờ kho bổ sung</span>'}`
            : '';
          const shipmentAction = ['Nhà cung cấp xác nhận', 'Giao một phần'].includes(item.TrangThai)
            ? `<button class="send wide-action" data-record-shipment="${esc(item.MaPO)}"><svg><use href="#i-truck"/></svg>Ghi nhận giao hàng</button>` : '';
          return `<tr><td><strong>${esc(item.MaPO)}</strong><small>Nguồn ${esc(item.MaDN)}</small></td><td><strong>${esc(item.TenNCC)}</strong><small>${item.SoMatHang} mặt hàng · ${item.TongSoLuong} đơn vị</small></td><td>${fmtDate(item.NgayGiaoDuKien)}</td><td class="num"><strong>${money(item.TongTien)}</strong><small>${item.SoNgayThanhToan} ngày</small></td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td><td><div class="warehouse-row-actions purchase-order-actions"><button data-view-order="${esc(item.MaPO)}"><svg><use href="#i-report"/></svg>Xem</button>${editActions}${item.TrangThai === 'Đã duyệt' ? `<button class="send wide-action" data-send-supplier="${esc(item.MaPO)}"><svg><use href="#i-truck"/></svg>Gửi Nhà cung cấp</button>` : ''}${item.TrangThai === 'Đã gửi Nhà cung cấp' ? `<button class="send wide-action" data-confirm-supplier="${esc(item.MaPO)}"><svg><use href="#i-approve"/></svg>Xác nhận từ NCC</button>` : ''}${shipmentAction}</div></td></tr>`;
        }).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa có Đơn mua hàng phù hợp.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('MUA HÀNG / ĐƠN MUA', 'Đơn mua hàng', 'Lập Đơn mua từ Phiếu đề nghị, gửi Quản lý phê duyệt và theo dõi Nhà cung cấp.', '<button class="warehouse-primary" id="newOrder"><svg><use href="#i-plus"/></svg>Lập Đơn mua</button>')}<article class="warehouse-table-card purchase-order-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="orderSearch" placeholder="Tìm mã đơn, Phiếu đề nghị hoặc Nhà cung cấp..."></label><div class="warehouse-toolbar-actions"><select id="orderStatus"><option value="">Tất cả trạng thái</option><option>Nháp</option><option>Chờ duyệt</option><option>Đã duyệt</option><option>Yêu cầu chỉnh sửa</option><option>Từ chối</option><option>Đã gửi Nhà cung cấp</option><option>Nhà cung cấp xác nhận</option><option>Đang giao</option><option>Giao một phần</option><option>Hoàn thành</option></select><button class="warehouse-icon-button" id="refreshOrders" title="Làm mới danh sách"><svg><use href="#i-refresh"/></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table purchase-order-table"><colgroup><col style="width:15%"><col style="width:22%"><col style="width:10%"><col style="width:13%"><col style="width:16%"><col style="width:24%"></colgroup><thead><tr><th>ĐƠN MUA</th><th>NHÀ CUNG CẤP</th><th>NGÀY GIAO</th><th>GIÁ TRỊ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody id="orderBody"></tbody></table></div></article>`;
    let timer; root.querySelector('#orderSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); }); root.querySelector('#orderStatus').addEventListener('change', load); root.querySelector('#refreshOrders').addEventListener('click', load); root.querySelector('#newOrder').addEventListener('click', () => createOrderModal(context, load));
    root.addEventListener('click', async event => { const view = event.target.closest('[data-view-order]'); if (view) return orderDetailModal(context, view.dataset.viewOrder, false, load); const edit = event.target.closest('[data-edit-order]'); if (edit) return editOrderModal(context, edit.dataset.editOrder, load); const shipment = event.target.closest('[data-record-shipment]'); if (shipment) { try { const item = (await api(context, `/purchasing/purchase-orders/${shipment.dataset.recordShipment}`)).order; return shipmentModal(context, item, load); } catch (error) { context.showToast(error.message, 'error'); return; } } const submit = event.target.closest('[data-submit-order]'); if (submit) { try { const data = await api(context, `/purchasing/purchase-orders/${submit.dataset.submitOrder}/submit`, { method: 'POST' }); context.showToast(data.message, 'success'); await load(); } catch (error) { context.showToast(error.message, 'error'); } return; } const send = event.target.closest('[data-send-supplier]'); if (send) { try { const data = await api(context, `/purchasing/purchase-orders/${send.dataset.sendSupplier}/send-supplier`, { method: 'POST' }); context.showToast(data.message, 'success'); await load(); } catch (error) { context.showToast(error.message, 'error'); } return; } const confirm = event.target.closest('[data-confirm-supplier]'); if (confirm) { try { const data = await api(context, `/purchasing/purchase-orders/${confirm.dataset.confirmSupplier}/supplier-confirm`, { method: 'POST' }); context.showToast(data.message, 'success'); await load(); } catch (error) { context.showToast(error.message, 'error'); } } });
    await load(); if (sessionStorage.getItem('fly_order_source_request')) createOrderModal(context, load);
  };

  const initApprovals = async (root, context) => {
    const load = async () => { try { const data = await api(context, '/admin/approvals/purchase-orders?status=Chờ duyệt'); const badge = document.getElementById('approvalNavBadge'); if (badge) badge.textContent = String(data.items.length).padStart(2, '0'); root.querySelector('#approvalBody').innerHTML = data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaPO)}</strong><small>Nguồn ${esc(item.MaDN)}</small></td><td><strong>${esc(item.TenNCC)}</strong><small>Người lập: ${esc(item.NguoiLap)}</small></td><td>${item.SoMatHang} mặt hàng</td><td>${fmtDate(item.NgayGiaoDuKien)}</td><td>${item.SoNgayThanhToan} ngày</td><td class="num"><strong>${money(item.TongTien)}</strong></td><td><button class="warehouse-primary" data-review-order="${esc(item.MaPO)}">Xem và quyết định</button></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Không có Đơn mua hàng chờ phê duyệt.</td></tr>'; } catch (error) { context.showToast(error.message, 'error'); } };
    root.innerHTML = `${heading('PHÊ DUYỆT / MUA HÀNG', 'Đơn mua hàng chờ quyết định', 'Kiểm tra Phiếu đề nghị nguồn, Nhà cung cấp, số lượng, đơn giá và thời hạn thanh toán 30–45 ngày.', '<span class="warehouse-chip">Phê duyệt không làm tăng tồn kho</span>')}<article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>HÀNG ĐỢI PHÊ DUYỆT</p><h2>Đơn mua hàng</h2></div><button class="warehouse-secondary" id="refreshApprovals"><svg><use href="#i-refresh"/></svg>Làm mới</button></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>ĐƠN MUA</th><th>NHÀ CUNG CẤP</th><th>QUY MÔ</th><th>NGÀY GIAO</th><th>THANH TOÁN</th><th>TỔNG TIỀN</th><th>QUYẾT ĐỊNH</th></tr></thead><tbody id="approvalBody"></tbody></table></div></article>`;
    root.querySelector('#refreshApprovals').addEventListener('click', load); root.addEventListener('click', event => { const review = event.target.closest('[data-review-order]'); if (review) orderDetailModal(context, review.dataset.reviewOrder, true, load); }); await load();
  };

  const inventoryCountApprovalModal = async (context, id, onDone) => {
    try {
      const data = await api(context, `/admin/approvals/inventory-counts/${id}`);
      const count = data.count;
      const differences = data.lines.filter(line => Number(line.ChenhLech) !== 0);
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal inventory-count-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHÊ DUYỆT ĐIỀU CHỈNH TỒN / ${esc(count.MaKK)}</p><h2>${esc(count.TenKho)}</h2><span>${fmtDate(count.NgayKiemKe)} · Thủ kho ${esc(count.NguoiKiemKe)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="manager-readonly-note"><svg><use href="#i-warning"/></svg><div><strong>Phê duyệt sẽ cập nhật tồn kho</strong><span>Hệ thống chỉ sửa tồn cho các dòng chênh lệch và đồng thời tạo Giao dịch kho loại Điều chỉnh. Từ chối sẽ giữ nguyên tồn.</span></div></div><div class="warehouse-stats"><article><span>TỔNG MẶT HÀNG</span><strong>${data.lines.length}</strong><small>Trong đợt kiểm kê</small></article><article class="attention"><span>CÓ CHÊNH LỆCH</span><strong>${differences.length}</strong><small>Cần xem nguyên nhân</small></article><article><span>TỔNG THỪA</span><strong>${differences.reduce((sum, line) => sum + Math.max(0, Number(line.ChenhLech)), 0)}</strong><small>Đơn vị hàng</small></article><article><span>TỔNG THIẾU</span><strong>${differences.reduce((sum, line) => sum + Math.max(0, -Number(line.ChenhLech)), 0)}</strong><small>Đơn vị hàng</small></article></div><div class="warehouse-table-wrap"><table class="warehouse-table inventory-count-table"><thead><tr><th>SẢN PHẨM</th><th>HỆ THỐNG</th><th>THỰC TẾ</th><th>CHÊNH LỆCH</th><th>KẾT QUẢ</th><th>TÌNH TRẠNG</th><th>NGUYÊN NHÂN</th></tr></thead><tbody>${data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SLHeThong}</td><td class="num"><strong>${line.SLThucTe}</strong></td><td class="num"><strong>${Number(line.ChenhLech) > 0 ? '+' : ''}${line.ChenhLech}</strong></td><td><span class="status-pill ${Number(line.ChenhLech) === 0 ? 'ok' : 'sent'}">${esc(line.KetQuaDoiChieu)}</span></td><td>${esc(line.TinhTrangHang || 'Bình thường')}</td><td>${esc(line.NguyenNhan || '—')}</td></tr>`).join('')}</tbody></table></div>${count.GhiChu ? `<div class="receipt-rule"><svg><use href="#i-report"/></svg><span>${esc(count.GhiChu)}</span></div>` : ''}</div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-danger reject-count" type="button">Từ chối</button><button class="warehouse-primary approve-count" type="button">Duyệt và điều chỉnh tồn</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.approve-count').addEventListener('click', async () => {
        if (!window.confirm(`Duyệt ${id} và cập nhật tồn cho ${differences.length} mặt hàng chênh lệch?`)) return;
        try {
          const result = await api(context, `/admin/approvals/inventory-counts/${id}/approve`, { method: 'POST', body: '{}' });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelector('.reject-count').addEventListener('click', async () => {
        const reason = window.prompt(`Nhập lý do từ chối điều chỉnh tồn cho ${id}:`);
        if (reason == null) return;
        if (!reason.trim()) return context.showToast('Vui lòng nhập lý do từ chối.', 'error');
        try {
          const result = await api(context, `/admin/approvals/inventory-counts/${id}/reject`, { method: 'POST', body: JSON.stringify({ LyDo: reason.trim() }) });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const stockIssueApprovalModal = async (context, id, onDone) => {
    try {
      const data = await api(context, `/admin/approvals/stock-issues/${id}`);
      const issue = data.issue;
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal stock-issue-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHÊ DUYỆT PHIẾU XUẤT / ${esc(issue.MaPX)}</p><h2>${esc(issue.LoaiXuat)}</h2><span>${fmtDate(issue.NgayXuat)} · Thủ kho ${esc(issue.NguoiLap)} · ${esc(issue.TenKho)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="manager-readonly-note"><svg><use href="#i-warning"></use></svg><div><strong>Phê duyệt chưa làm giảm tồn kho</strong><span>Sau khi duyệt, Phiếu xuất chuyển sang “Đã duyệt”. Thủ kho phải thực hiện và xác nhận xuất thì hệ thống mới giảm tồn và tạo Giao dịch kho loại Xuất.</span></div></div><div class="stock-issue-summary"><div><span>LOẠI XUẤT</span><strong>${esc(issue.LoaiXuat)}</strong></div><div><span>PHIẾU NHẬP NGUỒN</span><strong>${esc(issue.MaPN || 'Không áp dụng')}</strong></div><div><span>NHÀ CUNG CẤP</span><strong>${esc(issue.TenNCC || 'Không áp dụng')}</strong></div><div><span>SỐ MẶT HÀNG</span><strong>${data.lines.length}</strong></div></div><div class="manager-readonly-note"><svg><use href="#i-request"></use></svg><div><strong>Lý do/Ghi chú xuất kho</strong><span>${esc(issue.GhiChu || '—')}</span></div></div><div class="warehouse-table-wrap"><table class="warehouse-table stock-issue-line-table"><thead><tr><th>SẢN PHẨM</th><th>TỒN HIỆN TẠI</th><th>SỐ LƯỢNG XUẤT</th><th>GIÁ VỐN THAM CHIẾU</th><th>GHI CHÚ DÒNG</th></tr></thead><tbody>${data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)} · ${esc(line.TenDM)}</small></td><td class="num">${line.SLTonHienTai}</td><td class="num"><strong>${line.SoLuong}</strong></td><td class="num">${money(line.DonGia)}</td><td>${esc(line.GhiChu || '—')}</td></tr>`).join('')}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-danger reject-stock-issue" type="button">Từ chối</button><button class="warehouse-primary approve-stock-issue" type="button">Phê duyệt Phiếu xuất</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.approve-stock-issue').addEventListener('click', async () => {
        if (!window.confirm(`Phê duyệt ${id}? Tồn kho vẫn giữ nguyên cho tới khi Thủ kho xác nhận xuất.`)) return;
        try {
          const result = await api(context, `/admin/approvals/stock-issues/${id}/approve`, { method: 'POST', body: '{}' });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelector('.reject-stock-issue').addEventListener('click', async () => {
        const reason = window.prompt(`Nhập lý do từ chối Phiếu xuất ${id}:`);
        if (reason == null) return;
        if (!reason.trim()) return context.showToast('Vui lòng nhập lý do từ chối.', 'error');
        try {
          const result = await api(context, `/admin/approvals/stock-issues/${id}/reject`, { method: 'POST', body: JSON.stringify({ LyDo: reason.trim() }) });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const paymentVoucherApprovalModal = async (context, id, onDone) => {
    try {
      const data = await api(context, `/admin/approvals/payment-vouchers/${id}`);
      const voucher = data.voucher;
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal payment-voucher-approval-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">UC09 · PHÊ DUYỆT PHIẾU CHI</p><h2>${esc(voucher.MaPhieu)}</h2><span>${esc(voucher.TenNCC)} · ${money(voucher.SoTienPhieuChi)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="manager-readonly-note"><svg><use href="#i-shield"></use></svg><div><strong>Phê duyệt chỉ cho phép Kế toán thực hiện thanh toán</strong><span>Công nợ vẫn giữ nguyên ${money(voucher.SoTienConLai)}. Chỉ giao dịch thanh toán thành công ở bước Kế toán mới chuyển công nợ sang Đã tất toán.</span></div></div><div class="payment-voucher-source"><div><span>CÔNG NỢ</span><strong>${esc(voucher.MaCNPTra)}</strong></div><div><span>HẠN THANH TOÁN</span><strong>${fmtDate(voucher.HanThanhToan)}</strong></div><div><span>HÓA ĐƠN NCC</span><strong>${esc(voucher.SoHoaDon)}</strong></div><div><span>ĐỐI CHIẾU BA BÊN</span><strong><i class="status-pill ${voucher.TrangThaiDoiChieu === 'Đã khớp' ? 'ok' : 'cancelled'}">${esc(voucher.TrangThaiDoiChieu)}</i></strong></div><div><span>ĐƠN MUA</span><strong>${esc(voucher.MaPO)}</strong></div><div><span>PHIẾU NHẬP</span><strong>${esc(voucher.MaPN)}</strong></div><div><span>PHƯƠNG THỨC</span><strong>${esc(voucher.PhuongThuc)}</strong></div><div><span>NGƯỜI LẬP</span><strong>${esc(voucher.NguoiLap)}</strong></div></div><div class="payment-voucher-amount"><span>SỐ TIỀN PHIẾU CHI / CÔNG NỢ CÒN LẠI</span><strong>${money(voucher.SoTienPhieuChi)} / ${money(voucher.SoTienConLai)}</strong><small>Hai số tiền bắt buộc phải bằng nhau và thanh toán toàn bộ một lần.</small></div><div class="manager-readonly-note"><svg><use href="#i-request"></use></svg><div><strong>Nội dung chi</strong><span>${esc(voucher.NoiDung)}</span>${voucher.GhiChu ? `<small>${esc(voucher.GhiChu)}</small>` : ''}</div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG HÓA ĐƠN</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THUẾ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${line.ThueSuat}%</td><td class="num"><strong>${money(line.ThanhTien)}</strong></td></tr>`).join('')}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-danger reject-payment-voucher" type="button">Từ chối</button><button class="warehouse-primary approve-payment-voucher" type="button">Phê duyệt Phiếu chi</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.approve-payment-voucher').addEventListener('click', async () => {
        if (!window.confirm(`Phê duyệt ${id}? Công nợ chưa giảm cho đến khi Kế toán thanh toán thành công.`)) return;
        try {
          const result = await api(context, `/admin/approvals/payment-vouchers/${id}/approve`, { method: 'POST', body: '{}' });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelector('.reject-payment-voucher').addEventListener('click', async () => {
        const reason = window.prompt(`Nhập lý do từ chối Phiếu chi ${id}:`);
        if (reason == null) return;
        if (!reason.trim()) return context.showToast('Vui lòng nhập lý do từ chối.', 'error');
        try {
          const result = await api(context, `/admin/approvals/payment-vouchers/${id}/reject`, { method: 'POST', body: JSON.stringify({ LyDo: reason.trim() }) });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initApprovalCenter = async (root, context) => {
    const empty = (cols, text) => `<tr><td colspan="${cols}" class="warehouse-empty">${esc(text)}</td></tr>`;
    const load = async () => {
      try {
        const [orders, queues] = await Promise.all([
          api(context, '/admin/approvals/purchase-orders?status=Chờ duyệt'),
          api(context, '/admin/approvals/queues')
        ]);
        const total = orders.items.length + queues.warehouse.length + queues.finance.length;
        const badge = document.getElementById('approvalNavBadge');
        if (badge) badge.textContent = String(total).padStart(2, '0');
        root.querySelector('#approvalSummary').innerHTML = `
          <article class="warehouse-stat"><span>ĐƠN MUA HÀNG</span><strong>${orders.items.length}</strong><small>Kiểm tra nguồn đề nghị và điều khoản mua</small></article>
          <article class="warehouse-stat warn"><span>CHỨNG TỪ KHO</span><strong>${queues.warehouse.length}</strong><small>Phiếu xuất và điều chỉnh sau kiểm kê</small></article>
          <article class="warehouse-stat"><span>TÀI CHÍNH &amp; ĐỔI TRẢ</span><strong>${queues.finance.length}</strong><small>Phiếu chi và hồ sơ đổi trả đã kiểm tra</small></article>`;
        root.querySelector('#purchaseApprovalBody').innerHTML = orders.items.length ? orders.items.map(item => `<tr><td><strong>${esc(item.MaPO)}</strong><small>Nguồn ${esc(item.MaDN)}</small></td><td><strong>${esc(item.TenNCC)}</strong><small>Người lập: ${esc(item.NguoiLap)}</small></td><td>${item.SoMatHang} mặt hàng</td><td>${fmtDate(item.NgayGiaoDuKien)}</td><td>${item.SoNgayThanhToan} ngày</td><td class="num"><strong>${money(item.TongTien)}</strong></td><td><button class="warehouse-primary" data-review-order="${esc(item.MaPO)}">Xem và quyết định</button></td></tr>`).join('') : empty(7, 'Không có Đơn mua hàng chờ phê duyệt.');
        root.querySelector('#warehouseApprovalBody').innerHTML = queues.warehouse.length ? queues.warehouse.map(item => `<tr><td><strong>${esc(item.MaHoSo)}</strong><small>${esc(item.LoaiHoSo)}</small></td><td>${esc(item.NguoiLap)}</td><td>${fmtDate(item.NgayLap)}</td><td>${esc(item.NoiDung || '—')}</td><td><span class="status-pill sent">${esc(item.TrangThai)}</span></td><td>${item.LoaiHoSo === 'Điều chỉnh kiểm kê' ? `<button class="warehouse-primary" data-review-inventory-count="${esc(item.MaHoSo)}">Xem và quyết định</button>` : item.LoaiHoSo === 'Phiếu xuất kho' ? `<button class="warehouse-primary" data-review-stock-issue="${esc(item.MaHoSo)}">Xem và quyết định</button>` : '—'}</td></tr>`).join('') : empty(6, 'Chưa có chứng từ kho do Thủ kho gửi duyệt.');
        root.querySelector('#financeApprovalBody').innerHTML = queues.finance.length ? queues.finance.map(item => `<tr><td><strong>${esc(item.MaHoSo)}</strong><small>${esc(item.LoaiHoSo)}</small></td><td>${esc(item.NguoiLap)}</td><td>${fmtDate(item.NgayLap)}</td><td>${esc(item.NoiDung || '—')}</td><td class="num">${money(item.SoTien)}</td><td><span class="status-pill sent">${esc(item.TrangThai)}</span></td><td>${item.LoaiHoSo === 'Phiếu chi Nhà cung cấp' ? `<button class="warehouse-primary" data-review-payment-voucher="${esc(item.MaHoSo)}">Xem và quyết định</button>` : item.LoaiHoSo === 'Đổi trả khách hàng' ? `<button class="warehouse-primary" data-approve-return="${esc(item.MaHoSo)}">Duyệt</button><button class="warehouse-danger" data-reject-return="${esc(item.MaHoSo)}">Từ chối</button>` : '—'}</td></tr>`).join('') : empty(7, 'Chưa có Phiếu chi hoặc hồ sơ đổi trả được gửi duyệt. Hóa đơn chờ đối chiếu và công nợ không nằm trong hàng phê duyệt này.');
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('ĐIỀU HÀNH / PHÊ DUYỆT', 'Trung tâm phê duyệt', 'Hồ sơ chỉ xuất hiện sau khi bộ phận phụ trách gửi đúng bước. Riêng duyệt kiểm kê có chênh lệch sẽ cập nhật tồn và ghi Giao dịch kho Điều chỉnh.', '<button class="warehouse-secondary" id="refreshApprovalCenter"><svg><use href="#i-refresh"/></svg>Làm mới</button>')}<div class="warehouse-stats approval-center-summary" id="approvalSummary"></div><article class="warehouse-table-card approval-queue"><div class="warehouse-panel-title"><div><p>UC05 · MUA HÀNG</p><h2>Đơn mua hàng chờ quyết định</h2></div><span class="warehouse-chip">Nhân viên mua hàng gửi</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>ĐƠN MUA</th><th>NHÀ CUNG CẤP</th><th>QUY MÔ</th><th>NGÀY GIAO</th><th>THANH TOÁN</th><th>TỔNG TIỀN</th><th>QUYẾT ĐỊNH</th></tr></thead><tbody id="purchaseApprovalBody"></tbody></table></div></article><article class="warehouse-table-card approval-queue"><div class="warehouse-panel-title"><div><p>UC06–UC07 · KHO</p><h2>Chứng từ kho chờ phê duyệt</h2></div><span class="warehouse-chip">Thủ kho gửi</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HỒ SƠ</th><th>NGƯỜI LẬP</th><th>NGÀY LẬP</th><th>NỘI DUNG</th><th>TRẠNG THÁI</th><th>QUYẾT ĐỊNH</th></tr></thead><tbody id="warehouseApprovalBody"></tbody></table></div></article><article class="warehouse-table-card approval-queue"><div class="warehouse-panel-title"><div><p>UC08–UC09 · TÀI CHÍNH</p><h2>Đề nghị thanh toán và đổi trả</h2></div><span class="warehouse-chip">Kế toán/Thu ngân gửi</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HỒ SƠ</th><th>NGƯỜI LẬP</th><th>NGÀY LẬP</th><th>NỘI DUNG</th><th>SỐ TIỀN</th><th>TRẠNG THÁI</th><th>QUYẾT ĐỊNH</th></tr></thead><tbody id="financeApprovalBody"></tbody></table></div></article>`;
    root.innerHTML = root.innerHTML
      .replace('actor nghiệp vụ', 'bộ phận phụ trách')
      .replace('UC05 · ', '')
      .replace('UC06–UC07 · ', '')
      .replace('UC08–UC09 · ', '');
    root.querySelector('#approvalSummary').insertAdjacentHTML('beforebegin', '<div class="approval-center-note"><strong>Chưa có bộ phận gửi hồ sơ thì danh sách sẽ trống.</strong><span>Kế toán lưu hoặc đối chiếu hóa đơn không cần Quản lý duyệt. Chỉ Phiếu chi thanh toán hoặc hồ sơ đổi trả đã được lập và gửi mới xuất hiện ở nhóm Tài chính.</span></div>');
    root.querySelector('#refreshApprovalCenter').addEventListener('click', load);
    root.addEventListener('click', async event => {
      const review = event.target.closest('[data-review-order]');
      if (review) return orderDetailModal(context, review.dataset.reviewOrder, true, load);
      const reviewInventoryCount = event.target.closest('[data-review-inventory-count]');
      if (reviewInventoryCount) return inventoryCountApprovalModal(context, reviewInventoryCount.dataset.reviewInventoryCount, load);
      const reviewStockIssue = event.target.closest('[data-review-stock-issue]');
      if (reviewStockIssue) return stockIssueApprovalModal(context, reviewStockIssue.dataset.reviewStockIssue, load);
      const reviewPaymentVoucher = event.target.closest('[data-review-payment-voucher]');
      if (reviewPaymentVoucher) return paymentVoucherApprovalModal(context, reviewPaymentVoucher.dataset.reviewPaymentVoucher, load);
      const approveReturn = event.target.closest('[data-approve-return]');
      if (approveReturn) {
        try {
          const result = await api(context, `/admin/approvals/returns/${approveReturn.dataset.approveReturn}/approve`, { method: 'POST', body: JSON.stringify({}) });
          context.showToast(result.message, 'success'); await load();
        } catch (error) { context.showToast(error.message, 'error'); }
        return;
      }
      const rejectReturn = event.target.closest('[data-reject-return]');
      if (rejectReturn) {
        const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
        overlay.innerHTML = `<div class="warehouse-modal" style="width:min(620px,95vw)"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">TỪ CHỐI ĐỔI TRẢ</p><h2>${esc(rejectReturn.dataset.rejectReturn)}</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-field"><label>Lý do *</label><textarea id="returnRejectReason" maxlength="500"></textarea></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary submit-decision">Xác nhận</button></div></div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove(); overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
        overlay.querySelector('.submit-decision').addEventListener('click', async () => {
          const LyDo = overlay.querySelector('#returnRejectReason').value.trim();
          if (!LyDo) return context.showToast('Vui lòng nhập lý do.', 'error');
          try {
            const result = await api(context, `/admin/approvals/returns/${rejectReturn.dataset.rejectReturn}/reject`, { method: 'POST', body: JSON.stringify({ LyDo }) });
            context.showToast(result.message, 'success'); close(); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
        });
      }
    });
    await load();
  };

  window.FLY_ROLE_PAGES = { templates: { ...(previous?.templates || {}), ...templates }, init: async (pageName, context) => { if (pageName === 'purchasing-orders') return initOrders(document.querySelector('.warehouse-page'), context); if (pageName === 'manager-purchase-approvals') return initApprovalCenter(document.querySelector('.warehouse-page'), context); return previous?.init?.(pageName, context); } };
})();
