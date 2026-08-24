(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'accounting-invoices': '<section class="warehouse-page"><div class="overview-loading">Đang tải hồ sơ hóa đơn...</div></section>',
    'accounting-payables': '<section class="warehouse-page"><div class="overview-loading">Đang tải công nợ phải trả...</div></section>',
    'manager-payables': '<section class="warehouse-page"><div class="overview-loading">Đang tổng hợp công nợ toàn hệ thống...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const api = async (context, path, options = {}) => {
    const response = await fetch(`${context.apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };
  const heading = (kicker, title, subtitle, action = '') => `<header class="warehouse-heading"><div><p class="warehouse-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</header>`;
  const matchClass = status => status === 'Đã khớp' ? 'ok' : status === 'Chênh lệch' ? 'cancelled' : 'draft';
  const debtClass = status => status === 'Đã thanh toán' ? 'ok' : status === 'Quá hạn' ? 'cancelled' : 'sent';

  const managerPayableDetail = async (context, id) => {
    try {
      const data = await api(context, `/admin/finance/payables/${id}`);
      const debt = data.payable;
      const rows = data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${line.ThueSuat}%</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal manager-payable-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐIỀU HÀNH / HỒ SƠ CÔNG NỢ</p><h2>${esc(debt.MaCNPTra)}</h2></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="manager-readonly-note"><svg><use href="#i-report"/></svg><div><strong>Quản lý đang xem ở chế độ giám sát</strong><span>Đối chiếu hóa đơn, lập Phiếu chi và cập nhật thanh toán vẫn do Kế toán thực hiện.</span></div></div><div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(debt.TenNCC)}</strong></div><div><span>HÓA ĐƠN</span><strong>${esc(debt.SoHoaDon)}</strong></div><div><span>ĐƠN MUA</span><strong>${esc(debt.MaPO)}</strong></div><div><span>PHIẾU NHẬP</span><strong>${esc(debt.MaPN || '—')}</strong></div><div><span>NGÀY PHÁT SINH</span><strong>${fmtDate(debt.NgayPhatSinh)}</strong></div><div><span>HẠN THANH TOÁN</span><strong>${fmtDate(debt.HanThanhToan)}</strong></div></div><div class="manager-debt-amounts"><div><span>GIÁ TRỊ GHI NHẬN</span><strong>${money(debt.SoTienNo)}</strong></div><div><span>ĐÃ THANH TOÁN</span><strong>${money(debt.SoTienDaTra)}</strong></div><div><span>CÒN PHẢI TRẢ</span><strong>${money(debt.SoTienConLai)}</strong></div><div><span>TRẠNG THÁI</span><strong><i class="status-pill ${debtClass(debt.TrangThaiHienTai)}">${esc(debt.TrangThaiHienTai)}</i></strong></div></div><div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THUẾ SUẤT</th><th>TIỀN HÀNG</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng</button><button class="warehouse-primary print-payable-detail"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.querySelector('.print-payable-detail').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'BẢNG CHI TIẾT CÔNG NỢ NHÀ CUNG CẤP', number: debt.MaCNPTra,
        documentDate: new Date(), status: debt.TrangThaiHienTai,
        fields: [
          { label: 'Nhà cung cấp', value: debt.TenNCC }, { label: 'Hóa đơn', value: debt.SoHoaDon },
          { label: 'Đơn mua', value: debt.MaPO }, { label: 'Phiếu nhập', value: debt.MaPN || '—' },
          { label: 'Ngày phát sinh', value: debt.NgayPhatSinh, format: 'date' }, { label: 'Hạn thanh toán', value: debt.HanThanhToan, format: 'date' }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
          { label: 'ĐVT', key: 'DonViTinh' }, { label: 'Số lượng', key: 'SoLuong', align: 'right' },
          { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
          { label: 'Thuế suất', key: 'ThueSuat', format: 'percent', align: 'right' },
          { label: 'Tiền hàng', key: 'ThanhTien', format: 'money', align: 'right' }
        ], rows: data.lines,
        totals: [
          { label: 'Giá trị ghi nhận', value: debt.SoTienNo, format: 'money' },
          { label: 'Đã thanh toán', value: debt.SoTienDaTra, format: 'money' },
          { label: 'CÒN PHẢI TRẢ', value: debt.SoTienConLai, format: 'money' }
        ],
        note: 'Bảng chi tiết phục vụ Quản lý cửa hàng theo dõi. Không thay thế Hóa đơn Nhà cung cấp hoặc Phiếu chi.',
        signatures: ['Kế toán theo dõi', 'Quản lý cửa hàng']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const invoiceDetail = async (context, id) => {
    try {
      const data = await api(context, `/accounting/purchase-invoices/${id}`);
      const invoice = data.invoice;
      const rows = data.lines.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${line.ThueSuat}%</td><td class="num">${money(line.TienThue)}</td><td class="num"><strong>${money(line.ThanhTien)}</strong></td></tr>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const statusNote = invoice.GhiChuChenhLech
        ? `<p class="warehouse-modal-note"><strong>Chênh lệch cần phối hợp xử lý:</strong> ${esc(invoice.GhiChuChenhLech)}</p>`
        : invoice.TrangThaiDoiChieu === 'Đã khớp'
          ? '<p class="receipt-rule">Đơn mua – Phiếu nhập – Hóa đơn đã được Kế toán xác nhận khớp. Công nợ phải trả đã được ghi nhận.</p>'
          : invoice.TrangThaiDoiChieu === 'Chờ đối chiếu'
            ? '<p class="receipt-rule">Hóa đơn đã được lưu nhưng chưa đối chiếu. Chưa phát sinh công nợ; hãy đóng cửa sổ này và chọn “Đối chiếu”.</p>'
            : '<p class="receipt-rule">Hóa đơn đang chờ Thủ kho xác nhận Phiếu nhập. Chưa phát sinh công nợ.</p>';
      overlay.innerHTML = `<div class="warehouse-modal order-detail-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HÓA ĐƠN NHÀ CUNG CẤP</p><h2>${esc(invoice.SoHoaDon)}</h2></div><button class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid"><div><span>NHÀ CUNG CẤP</span><strong>${esc(invoice.TenNCC)}</strong></div><div><span>ĐƠN MUA</span><strong>${esc(invoice.MaPO || '—')}</strong></div><div><span>PHIẾU NHẬP</span><strong>${esc(invoice.MaPN || 'Chưa có')}</strong></div><div><span>KẾT QUẢ ĐỐI CHIẾU</span><strong><span class="status-pill ${matchClass(invoice.TrangThaiDoiChieu)}">${esc(invoice.TrangThaiDoiChieu)}</span></strong></div><div><span>TỔNG CỘNG</span><strong>${money(invoice.TongCong)}</strong></div><div><span>CÔNG NỢ</span><strong>${esc(invoice.MaCNPTra || 'Chưa phát sinh')}</strong></div></div>${statusNote}<div class="warehouse-table-wrap warehouse-form-lines"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THUẾ SUẤT</th><th>TIỀN THUẾ</th><th>TIỀN HÀNG</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng</button><button class="warehouse-primary print-invoice-record"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.querySelector('.print-invoice-record').addEventListener('click', () => window.FLY_PRINT.show({
        title: 'PHIẾU TIẾP NHẬN HÓA ĐƠN NHÀ CUNG CẤP', number: invoice.MaHDMH,
        documentDate: invoice.NgayTiepNhan, status: invoice.TrangThaiDoiChieu,
        fields: [
          { label: 'Số hóa đơn Nhà cung cấp', value: invoice.SoHoaDon }, { label: 'Nhà cung cấp', value: invoice.TenNCC },
          { label: 'Đơn mua', value: invoice.MaPO }, { label: 'Phiếu nhập', value: invoice.MaPN || 'Chưa có' },
          { label: 'Ngày hóa đơn', value: invoice.NgayHoaDon, format: 'date' }, { label: 'Người tiếp nhận', value: invoice.NguoiTiepNhan }
        ],
        columns: [
          { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' }, { label: 'ĐVT', key: 'DonViTinh' },
          { label: 'Số lượng', key: 'SoLuong', align: 'right' }, { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
          { label: 'Thuế suất', key: 'ThueSuat', format: 'percent', align: 'right' }, { label: 'Tiền hàng', key: 'ThanhTien', format: 'money', align: 'right' }
        ], rows: data.lines, totals: [
          { label: 'Tổng tiền hàng', value: invoice.TongTienHang, format: 'money' },
          { label: 'Tiền thuế', value: invoice.TienThue, format: 'money' }, { label: 'TỔNG CỘNG', value: invoice.TongCong, format: 'money' }
        ], note: 'Đây là phiếu ghi nhận hóa đơn do Nhà cung cấp giao, không thay thế hóa đơn điện tử hoặc hóa đơn GTGT gốc.',
        signatures: ['Người giao hóa đơn', 'Kế toán tiếp nhận']
      }));
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const lineMarkup = lines => `<div class="accounting-invoice-line heading"><span>MẶT HÀNG</span><span>THAM CHIẾU</span><span>SL HÓA ĐƠN</span><span>GIÁ THAM CHIẾU</span><span>GIÁ HÓA ĐƠN</span><span>THUẾ (%)</span><span>THÀNH TIỀN</span></div>${lines.map(line => {
    const quantity = Number(line.SoLuongChapNhan ?? line.SoLuong);
    const price = Number(line.DonGiaNhap ?? line.DonGiaDonMua ?? line.DonGia);
    return `<div class="accounting-invoice-line" data-product="${esc(line.MaSP)}"><div><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)}</small></div><span>${quantity}</span><input class="invoice-qty" type="number" min="1" value="${quantity}"><span>${money(price)}</span><input class="invoice-price" type="number" min="0" step="100" value="${price}"><input class="invoice-tax" type="number" min="0" max="100" step="1" value="8"><strong class="invoice-total"></strong></div>`;
  }).join('')}`;

  const bindLineTotals = overlay => {
    const calculate = row => {
      const quantity = Number(row.querySelector('.invoice-qty').value || 0);
      const price = Number(row.querySelector('.invoice-price').value || 0);
      const tax = Number(row.querySelector('.invoice-tax').value || 0);
      row.querySelector('.invoice-total').textContent = money(quantity * price * (1 + tax / 100));
    };
    overlay.querySelectorAll('.accounting-invoice-line[data-product]').forEach(row => {
      row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => calculate(row)));
      calculate(row);
    });
  };

  const createInvoiceModal = async (context, onDone) => {
    try {
      const [receiptsData, ordersData] = await Promise.all([
        api(context, '/accounting/receipt-files'),
        api(context, '/accounting/purchase-order-files')
      ]);
      const receipts = receiptsData.items.filter(item => !item.DaTiepNhanHoaDon);
      const orders = ordersData.items;
      if (!receipts.length && !orders.length) return context.showToast('Chưa có Đơn mua hợp lệ để tiếp nhận hóa đơn.', 'error');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">TIẾP NHẬN HÓA ĐƠN NHÀ CUNG CẤP</p><h2>Lưu chứng từ để Kế toán kiểm tra</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="accounting-intake-choice"><label><input type="radio" name="invoiceMode" value="receipt" ${receipts.length ? 'checked' : ''}><span><strong>Đã có Phiếu nhập</strong><small>Lưu hồ sơ ở trạng thái Chờ đối chiếu</small></span></label><label><input type="radio" name="invoiceMode" value="order" ${receipts.length ? '' : 'checked'}><span><strong>Hóa đơn đến trước</strong><small>Lưu chờ Phiếu nhập, chưa tạo công nợ</small></span></label></div><div class="warehouse-form-grid accounting-invoice-header"><div class="warehouse-field"><label>Hồ sơ tham chiếu *</label><select id="invoiceSource"></select></div><div class="warehouse-field"><label>Số hóa đơn Nhà cung cấp *</label><input id="supplierInvoiceNo" maxlength="50" placeholder="Ví dụ: 00001234"></div><div class="warehouse-field"><label>Ngày hóa đơn *</label><input id="invoiceDate" type="date" value="${today}"></div><div class="warehouse-field"><label>Điều khoản thanh toán</label><input id="paymentTerm" disabled></div></div><div class="receipt-rule"><svg><use href="#i-approve"></use></svg><span>Nút “Lưu hóa đơn” chỉ tiếp nhận chứng từ. Sau đó Kế toán phải mở bảng đối chiếu Đơn mua – Phiếu nhập – Hóa đơn và xác nhận riêng thì công nợ mới được ghi nhận.</span></div><div id="invoiceLines" class="warehouse-receipt-lines"></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Hủy</button><button class="warehouse-primary save-invoice">Lưu hồ sơ hóa đơn</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      const currentMode = () => overlay.querySelector('input[name="invoiceMode"]:checked').value;
      const fillSources = async () => {
        const mode = currentMode();
        const source = overlay.querySelector('#invoiceSource');
        const items = mode === 'receipt' ? receipts : orders;
        source.innerHTML = items.length ? items.map(item => `<option value="${esc(mode === 'receipt' ? item.MaPN : item.MaPO)}">${esc(mode === 'receipt' ? `${item.MaPN} · ${item.TenNCC}` : `${item.MaPO} · ${item.TenNCC}`)}</option>`).join('') : '<option value="">Chưa có hồ sơ phù hợp</option>';
        source.disabled = !items.length;
        overlay.querySelector('.save-invoice').disabled = !items.length;
        if (items.length) await loadLines(); else overlay.querySelector('#invoiceLines').innerHTML = '<div class="warehouse-empty">Chưa có hồ sơ phù hợp với lựa chọn này.</div>';
      };
      const loadLines = async () => {
        const mode = currentMode();
        const id = overlay.querySelector('#invoiceSource').value;
        if (!id) return;
        const data = await api(context, mode === 'receipt' ? `/accounting/receipt-files/${id}` : `/accounting/purchase-order-files/${id}`);
        overlay.querySelector('#paymentTerm').value = `${data.file.SoNgayThanhToan} ngày theo Đơn mua ${data.file.MaPO}`;
        overlay.querySelector('#invoiceLines').innerHTML = lineMarkup(data.lines);
        bindLineTotals(overlay);
      };
      overlay.querySelectorAll('input[name="invoiceMode"]').forEach(input => input.addEventListener('change', fillSources));
      overlay.querySelector('#invoiceSource').addEventListener('change', loadLines);
      overlay.querySelector('.save-invoice').addEventListener('click', async () => {
        const SoHoaDon = overlay.querySelector('#supplierInvoiceNo').value.trim();
        if (!SoHoaDon) return context.showToast('Vui lòng nhập số hóa đơn Nhà cung cấp.', 'error');
        const mode = currentMode();
        const sourceId = overlay.querySelector('#invoiceSource').value;
        const lines = Array.from(overlay.querySelectorAll('.accounting-invoice-line[data-product]')).map(row => ({
          MaSP: row.dataset.product,
          SoLuong: Number(row.querySelector('.invoice-qty').value),
          DonGia: Number(row.querySelector('.invoice-price').value),
          ThueSuat: Number(row.querySelector('.invoice-tax').value)
        }));
        try {
          const result = await api(context, '/accounting/purchase-invoices', {
            method: 'POST',
            body: JSON.stringify({
              [mode === 'receipt' ? 'MaPN' : 'MaPO']: sourceId,
              SoHoaDon,
              NgayHoaDon: overlay.querySelector('#invoiceDate').value,
              lines
            })
          });
          context.showToast(result.message, result.TrangThaiDoiChieu === 'Chênh lệch' ? 'error' : 'success');
          close();
          await onDone();
          invoiceDetail(context, result.MaHDMH);
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      await fillSources();
      overlay.querySelector('#supplierInvoiceNo').focus();
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const reconcileModal = async (context, invoice, onDone) => {
    try {
      const data = await api(context, '/accounting/receipt-files');
      const candidates = data.items.filter(item => (!item.DaTiepNhanHoaDon || item.MaPN === invoice.MaPN) && item.MaPO === invoice.MaPO && item.MaNCC === invoice.MaNCC);
      if (!candidates.length) return context.showToast('Chưa có Phiếu nhập đã xác nhận phù hợp với hóa đơn này.', 'error');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal accounting-reconcile-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">KẾ TOÁN / ĐỐI CHIẾU BA CHỨNG TỪ</p><h2>Kiểm tra hóa đơn ${esc(invoice.SoHoaDon)}</h2></div><button class="warehouse-icon-button close">×</button></div><div class="warehouse-modal-body"><div class="warehouse-field accounting-receipt-picker"><label>Phiếu nhập dùng để đối chiếu *</label><select id="matchReceipt">${candidates.map(item => `<option value="${esc(item.MaPN)}" ${item.MaPN === invoice.MaPN ? 'selected' : ''}>${esc(item.MaPN)} · ${item.TongSoLuong} đơn vị · ${esc(item.TenNCC)}</option>`).join('')}</select></div><div id="reconciliationPreview"><div class="overview-loading">Đang lập bảng so sánh ba chứng từ...</div></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close">Đóng, chưa đối chiếu</button><button class="warehouse-secondary print-reconciliation" disabled>Xem bản in đối chiếu</button><button class="warehouse-primary reconcile" disabled>Xác nhận đối chiếu và ghi nhận công nợ</button></div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      let currentPreview = null;
      const loadPreview = async () => {
        const MaPN = overlay.querySelector('#matchReceipt').value;
        const preview = await api(context, `/accounting/purchase-invoices/${invoice.MaHDMH}/reconciliation-preview?MaPN=${encodeURIComponent(MaPN)}`);
        currentPreview = preview;
        const matched = !preview.differences.length;
        overlay.querySelector('#reconciliationPreview').innerHTML = `<div class="accounting-document-strip"><article><span>ĐƠN MUA</span><strong>${esc(preview.purchaseOrder.MaPO)}</strong><small>${preview.purchaseOrder.SoNgayThanhToan} ngày thanh toán</small></article><article><span>PHIẾU NHẬP</span><strong>${esc(preview.receipt.MaPN)}</strong><small>Thủ kho đã xác nhận</small></article><article><span>HÓA ĐƠN NHÀ CUNG CẤP</span><strong>${esc(preview.invoice.SoHoaDon)}</strong><small>${money(preview.invoice.TongCong)}</small></article></div><div class="warehouse-table-wrap accounting-reconcile-table"><table class="warehouse-table"><thead><tr><th>MẶT HÀNG</th><th>SL ĐẶT</th><th>SL THỰC NHẬN</th><th>SL HÓA ĐƠN</th><th>GIÁ ĐƠN MUA</th><th>GIÁ HÓA ĐƠN</th><th>KẾT QUẢ</th></tr></thead><tbody>${preview.rows.map(row => `<tr><td><strong>${esc(row.TenSP)}</strong><small>${esc(row.MaSP)} · ${esc(row.DonViTinh)}</small></td><td class="num">${row.SoLuongDat}</td><td class="num">${row.SoLuongThucNhan}</td><td class="num">${row.SoLuongHoaDon}</td><td class="num">${money(row.DonGiaDonMua)}</td><td class="num">${money(row.DonGiaHoaDon)}</td><td><span class="status-pill ${row.KetQua === 'Khớp' ? 'ok' : 'cancelled'}">${esc(row.KetQua)}</span></td></tr>`).join('')}</tbody></table></div><div class="accounting-reconcile-result ${matched ? 'matched' : 'different'}"><strong>${matched ? 'Ba chứng từ khớp' : 'Hồ sơ đang có chênh lệch'}</strong><p>${matched ? 'Kế toán kiểm tra lại lần cuối rồi bấm xác nhận. Chỉ thao tác xác nhận này mới phát sinh công nợ phải trả.' : esc(preview.differences.join('; '))}</p></div>`;
        const button = overlay.querySelector('.reconcile');
        button.disabled = !matched;
        button.dataset.ready = matched ? 'true' : 'false';
        overlay.querySelector('.print-reconciliation').disabled = false;
      };
      overlay.querySelector('#matchReceipt').addEventListener('change', () => loadPreview().catch(error => context.showToast(error.message, 'error')));
      overlay.querySelector('.print-reconciliation').addEventListener('click', () => {
        if (!currentPreview) return;
        window.FLY_PRINT.show({
          title: 'BIÊN BẢN ĐỐI CHIẾU BA CHỨNG TỪ', number: invoice.MaHDMH,
          documentDate: new Date(), status: currentPreview.result,
          fields: [
            { label: 'Đơn mua', value: currentPreview.purchaseOrder.MaPO }, { label: 'Phiếu nhập', value: currentPreview.receipt.MaPN },
            { label: 'Số hóa đơn Nhà cung cấp', value: currentPreview.invoice.SoHoaDon }, { label: 'Nhà cung cấp', value: currentPreview.invoice.TenNCC }
          ],
          columns: [
            { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
            { label: 'SL đặt', key: 'SoLuongDat', align: 'right' }, { label: 'SL thực nhận', key: 'SoLuongThucNhan', align: 'right' },
            { label: 'SL hóa đơn', key: 'SoLuongHoaDon', align: 'right' }, { label: 'Giá Đơn mua', key: 'DonGiaDonMua', format: 'money', align: 'right' },
            { label: 'Giá hóa đơn', key: 'DonGiaHoaDon', format: 'money', align: 'right' }, { label: 'Kết quả', key: 'KetQua' }
          ], rows: currentPreview.rows,
          totals: [{ label: 'Tổng cộng theo hóa đơn', value: currentPreview.invoice.TongCong, format: 'money' }],
          note: currentPreview.differences.length ? currentPreview.differences.join('; ') : 'Số lượng hóa đơn và đơn giá khớp với số lượng thực nhận theo Phiếu nhập.',
          signatures: ['Nhân viên mua hàng', 'Thủ kho', 'Kế toán đối chiếu']
        });
      });
      overlay.querySelector('.reconcile').addEventListener('click', async () => {
        try {
          const result = await api(context, `/accounting/purchase-invoices/${invoice.MaHDMH}/reconcile`, { method: 'POST', body: JSON.stringify({ MaPN: overlay.querySelector('#matchReceipt').value, XacNhanDoiChieu: true }) });
          context.showToast(result.message, result.TrangThaiDoiChieu === 'Đã khớp' ? 'success' : 'error');
          close();
          await onDone();
          invoiceDetail(context, invoice.MaHDMH);
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      await loadPreview();
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initInvoices = async (root, context) => {
    let items = [];
    const load = async () => {
      try {
        const search = root.querySelector('#invoiceSearch').value;
        const match = root.querySelector('#invoiceMatch').value;
        const data = await api(context, `/accounting/purchase-invoices?search=${encodeURIComponent(search)}&match=${encodeURIComponent(match)}`);
        items = data.items;
        root.querySelector('#invoiceBody').innerHTML = items.length ? items.map(item => `<tr><td><strong>${esc(item.SoHoaDon)}</strong><small>${esc(item.MaHDMH)}</small></td><td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)}</small></td><td><strong>${esc(item.MaPO || '—')}</strong><small>${item.MaPN ? `Nhập ${esc(item.MaPN)}` : 'Chờ Phiếu nhập'}</small></td><td>${fmtDate(item.NgayHoaDon)}</td><td class="num"><strong>${money(item.TongCong)}</strong><small>Thuế ${money(item.TienThue)}</small></td><td><span class="status-pill ${matchClass(item.TrangThaiDoiChieu)}">${esc(item.TrangThaiDoiChieu)}</span></td><td>${item.MaCNPTra ? `<strong>${esc(item.MaCNPTra)}</strong><small>Hạn ${fmtDate(item.HanThanhToan)}</small>` : '<span class="status-pill cancelled">Chưa phát sinh</span>'}</td><td><div class="warehouse-row-actions"><button data-invoice="${esc(item.MaHDMH)}">Chi tiết</button>${item.TrangThaiDoiChieu !== 'Đã khớp' ? `<button class="send" data-reconcile="${esc(item.MaHDMH)}">Đối chiếu</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="8" class="warehouse-empty">Chưa có hóa đơn mua hàng phù hợp.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    root.innerHTML = `${heading('KẾ TOÁN / MUA HÀNG', 'Đối chiếu hóa đơn Nhà cung cấp', 'Tiếp nhận hóa đơn trước hoặc sau Phiếu nhập; chỉ hồ sơ được Kế toán xác nhận khớp ba bên mới ghi nhận công nợ.', '<button class="warehouse-primary" id="newInvoice"><svg><use href="#i-plus"></use></svg>Tiếp nhận hóa đơn</button>')}<div class="accounting-flow"><span>Đơn mua đã duyệt</span><i>→</i><span>Phiếu nhập đã xác nhận</span><i>→</i><span>Hóa đơn Nhà cung cấp</span><i>→</i><strong>Kế toán xác nhận đối chiếu</strong><i>→</i><strong>Công nợ phải trả</strong></div><article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"></use></svg><input id="invoiceSearch" placeholder="Tìm số hóa đơn, Đơn mua hoặc Nhà cung cấp..."></label><div class="warehouse-toolbar-actions"><select id="invoiceMatch"><option value="">Tất cả kết quả</option><option>Chờ Phiếu nhập</option><option>Chờ đối chiếu</option><option>Đã khớp</option><option>Chênh lệch</option></select><button class="warehouse-icon-button" id="refreshInvoices"><svg><use href="#i-refresh"></use></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÓA ĐƠN</th><th>NHÀ CUNG CẤP</th><th>HỒ SƠ NGUỒN</th><th>NGÀY HÓA ĐƠN</th><th>TỔNG CỘNG</th><th>ĐỐI CHIẾU</th><th>CÔNG NỢ</th><th>THAO TÁC</th></tr></thead><tbody id="invoiceBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#invoiceSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#invoiceMatch').addEventListener('change', load);
    root.querySelector('#refreshInvoices').addEventListener('click', load);
    root.querySelector('#newInvoice').addEventListener('click', () => createInvoiceModal(context, load));
    root.addEventListener('click', event => {
      const detail = event.target.closest('[data-invoice]');
      if (detail) return invoiceDetail(context, detail.dataset.invoice);
      const reconcile = event.target.closest('[data-reconcile]');
      if (reconcile) {
        const invoice = items.find(item => item.MaHDMH === reconcile.dataset.reconcile);
        if (invoice) reconcileModal(context, invoice, load);
      }
    });
    await load();
  };

  const initPayables = async (root, context) => {
    try {
      const data = await api(context, '/accounting/purchase-invoices?match=Đã khớp');
      const debts = data.items.filter(item => item.MaCNPTra);
      const total = debts.reduce((sum, item) => sum + Number(item.SoTienConLai || 0), 0);
      root.innerHTML = `${heading('KẾ TOÁN / CÔNG NỢ', 'Công nợ Nhà cung cấp', 'Nghĩa vụ thanh toán chỉ phát sinh từ hóa đơn đã đối chiếu khớp.', '<button class="warehouse-secondary" id="backInvoices">Mở hồ sơ đối chiếu</button>')}<div class="warehouse-stats"><article><span>TỔNG CÔNG NỢ CÒN LẠI</span><strong>${money(total)}</strong><small>${debts.length} khoản phải trả</small></article><article><span>NGUYÊN TẮC GHI NHẬN</span><strong>3 bên</strong><small>Đơn mua · Phiếu nhập · Hóa đơn</small></article></div><article class="warehouse-table-card"><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>MÃ CÔNG NỢ</th><th>NHÀ CUNG CẤP</th><th>HÓA ĐƠN</th><th>HẠN THANH TOÁN</th><th>CÒN PHẢI TRẢ</th><th>TRẠNG THÁI</th></tr></thead><tbody>${debts.length ? debts.map(item => `<tr><td><strong>${esc(item.MaCNPTra)}</strong></td><td>${esc(item.TenNCC)}</td><td><button class="warehouse-link" data-invoice="${esc(item.MaHDMH)}">${esc(item.SoHoaDon)}</button></td><td>${fmtDate(item.HanThanhToan)}</td><td class="num"><strong>${money(item.SoTienConLai)}</strong></td><td><span class="status-pill ${item.TrangThaiCongNo === 'Quá hạn' ? 'cancelled' : 'sent'}">${esc(item.TrangThaiCongNo)}</span></td></tr>`).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa phát sinh công nợ phải trả.</td></tr>'}</tbody></table></div></article>`;
      root.querySelector('#backInvoices').addEventListener('click', () => context.navigate('accounting-invoices'));
      root.addEventListener('click', event => { const button = event.target.closest('[data-invoice]'); if (button) invoiceDetail(context, button.dataset.invoice); });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initManagerPayables = async (root, context) => {
    let items = [];
    let summary = {};
    const render = () => {
      root.querySelector('#managerDebtBody').innerHTML = items.length ? items.map(item => `
        <tr>
          <td><strong>${esc(item.MaCNPTra)}</strong><small>Phát sinh ${fmtDate(item.NgayPhatSinh)}</small></td>
          <td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)}</small></td>
          <td><strong>HĐ ${esc(item.SoHoaDon)}</strong><small>${esc(item.MaPO)} · ${esc(item.MaPN || 'Chưa có Phiếu nhập')}</small></td>
          <td><strong>${fmtDate(item.HanThanhToan)}</strong><small>${item.TrangThaiHienTai === 'Đã thanh toán' ? 'Đã hoàn tất' : item.SoNgayConLai < 0 ? `Quá ${Math.abs(item.SoNgayConLai)} ngày` : `Còn ${item.SoNgayConLai} ngày`}</small></td>
          <td class="num"><strong>${money(item.SoTienNo)}</strong><small>Đã trả ${money(item.SoTienDaTra)}</small></td>
          <td class="num"><strong>${money(item.SoTienConLai)}</strong></td>
          <td><span class="status-pill ${debtClass(item.TrangThaiHienTai)}">${esc(item.TrangThaiHienTai)}</span></td>
          <td><button class="warehouse-secondary manager-debt-detail" data-manager-debt="${esc(item.MaCNPTra)}">Xem hồ sơ</button></td>
        </tr>`).join('') : '<tr><td colspan="8" class="warehouse-empty">Chưa phát sinh công nợ phải trả phù hợp với bộ lọc.</td></tr>';
      root.querySelector('#managerDebtCount').textContent = `${items.length} khoản hiển thị`;
    };
    const load = async () => {
      try {
        const search = root.querySelector('#managerDebtSearch').value;
        const status = root.querySelector('#managerDebtStatus').value;
        const data = await api(context, `/admin/finance/payables?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        items = data.items;
        summary = data.summary;
        root.querySelector('#managerDebtTotal').textContent = money(summary.TongPhatSinh);
        root.querySelector('#managerDebtPaid').textContent = money(summary.TongDaTra);
        root.querySelector('#managerDebtRemaining').textContent = money(summary.TongConLai);
        root.querySelector('#managerDebtOverdue').textContent = money(summary.TongQuaHan);
        root.querySelector('#managerDebtTotalNote').textContent = `${summary.TongKhoan || 0} khoản đã ghi nhận`;
        root.querySelector('#managerDebtOverdueNote').textContent = `${summary.SoKhoanQuaHan || 0} khoản quá hạn`;
        render();
      } catch (error) { context.showToast(error.message, 'error'); }
    };

    root.innerHTML = `${heading('ĐIỀU HÀNH / TÀI CHÍNH', 'Theo dõi công nợ Nhà cung cấp', 'Giám sát toàn bộ nghĩa vụ phải trả của cửa hàng; dữ liệu chỉ phát sinh sau khi Kế toán xác nhận đối chiếu ba chứng từ.', '<button class="warehouse-primary" id="printManagerPayables"><svg><use href="#i-report"/></svg>In báo cáo công nợ</button>')}<div class="manager-readonly-note"><svg><use href="#i-shield"/></svg><div><strong>Phạm vi của Quản lý cửa hàng</strong><span>Được xem và in báo cáo toàn hệ thống. Kế toán chịu trách nhiệm đối chiếu hóa đơn, lập Phiếu chi và cập nhật số tiền đã thanh toán.</span></div></div><div class="warehouse-stats manager-debt-stats"><article><span>TỔNG GIÁ TRỊ GHI NHẬN</span><strong id="managerDebtTotal">0 đ</strong><small id="managerDebtTotalNote">0 khoản đã ghi nhận</small></article><article><span>ĐÃ THANH TOÁN</span><strong id="managerDebtPaid">0 đ</strong><small>Lũy kế thanh toán Nhà cung cấp</small></article><article><span>CÒN PHẢI TRẢ</span><strong id="managerDebtRemaining">0 đ</strong><small>Nghĩa vụ chưa hoàn tất</small></article><article class="attention"><span>ĐÃ QUÁ HẠN</span><strong id="managerDebtOverdue">0 đ</strong><small id="managerDebtOverdueNote">0 khoản quá hạn</small></article></div><article class="warehouse-table-card manager-debt-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="managerDebtSearch" placeholder="Tìm mã công nợ, Nhà cung cấp, hóa đơn hoặc Đơn mua..."></label><div class="warehouse-toolbar-actions"><span class="manager-debt-count" id="managerDebtCount">0 khoản hiển thị</span><select id="managerDebtStatus"><option value="">Tất cả trạng thái</option><option>Đang nợ</option><option>Quá hạn</option><option>Đã thanh toán</option></select><button class="warehouse-icon-button" id="refreshManagerDebt" title="Làm mới"><svg><use href="#i-refresh"/></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table manager-debt-table"><thead><tr><th>MÃ CÔNG NỢ</th><th>NHÀ CUNG CẤP</th><th>HỒ SƠ NGUỒN</th><th>HẠN THANH TOÁN</th><th>GIÁ TRỊ / ĐÃ TRẢ</th><th>CÒN LẠI</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody id="managerDebtBody"></tbody></table></div></article>`;

    let timer;
    root.querySelector('#managerDebtSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#managerDebtStatus').addEventListener('change', load);
    root.querySelector('#refreshManagerDebt').addEventListener('click', load);
    root.addEventListener('click', event => {
      const detail = event.target.closest('[data-manager-debt]');
      if (detail) managerPayableDetail(context, detail.dataset.managerDebt);
    });
    root.querySelector('#printManagerPayables').addEventListener('click', () => window.FLY_PRINT.show({
      title: 'BÁO CÁO TỔNG HỢP CÔNG NỢ NHÀ CUNG CẤP', number: `BC-CN-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).replaceAll('-', '')}`,
      documentDate: new Date(), status: 'Báo cáo quản trị',
      fields: [
        { label: 'Phạm vi', value: 'Toàn bộ cửa hàng Hà Nội' }, { label: 'Số khoản đang hiển thị', value: items.length },
        { label: 'Tổng giá trị ghi nhận', value: summary.TongPhatSinh, format: 'money' }, { label: 'Tổng còn phải trả', value: summary.TongConLai, format: 'money' }
      ],
      columns: [
        { label: 'Mã công nợ', key: 'MaCNPTra' }, { label: 'Nhà cung cấp', key: 'TenNCC' },
        { label: 'Hóa đơn', key: 'SoHoaDon' }, { label: 'Hạn thanh toán', key: 'HanThanhToan', format: 'date' },
        { label: 'Giá trị', key: 'SoTienNo', format: 'money', align: 'right' },
        { label: 'Đã trả', key: 'SoTienDaTra', format: 'money', align: 'right' },
        { label: 'Còn lại', key: 'SoTienConLai', format: 'money', align: 'right' },
        { label: 'Trạng thái', key: 'TrangThaiHienTai' }
      ], rows: items,
      totals: [
        { label: 'Tổng đã thanh toán', value: summary.TongDaTra, format: 'money' },
        { label: 'Tổng còn phải trả', value: summary.TongConLai, format: 'money' },
        { label: 'Trong đó quá hạn', value: summary.TongQuaHan, format: 'money' }
      ],
      note: 'Báo cáo quản trị được lập từ các khoản công nợ đã phát sinh sau đối chiếu Đơn mua – Phiếu nhập – Hóa đơn.',
      signatures: ['Kế toán lập báo cáo', 'Quản lý cửa hàng']
    }));
    await load();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'accounting-invoices') return initInvoices(document.querySelector('.warehouse-page'), context);
      if (pageName === 'accounting-payables') return initPayables(document.querySelector('.warehouse-page'), context);
      if (pageName === 'manager-payables') return initManagerPayables(document.querySelector('.warehouse-page'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
