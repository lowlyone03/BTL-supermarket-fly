(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'warehouse-stock-issues': '<section class="warehouse-page"><div class="overview-loading">Đang tải Phiếu xuất kho...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const statusClass = status => ({ 'Nháp': 'draft', 'Chờ duyệt': 'sent', 'Đã duyệt': 'processing', 'Từ chối': 'cancelled', 'Đã xác nhận': 'ok' }[status] || 'draft');
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
  const printStockIssue = data => {
    const issue = data.issue;
    const lines = data.lines || [];
    window.FLY_PRINT.show({
      title: 'PHIẾU XUẤT KHO',
      number: issue.MaPX,
      documentDate: issue.NgayXuat || new Date(),
      status: issue.TrangThai,
      fields: [
        { label: 'Loại xuất', value: issue.LoaiXuat }, { label: 'Kho', value: issue.TenKho },
        { label: 'Người lập', value: issue.NguoiLap }, { label: 'Phiếu nhập nguồn', value: issue.MaPN || 'Không áp dụng' },
        { label: 'Nhà cung cấp', value: issue.TenNCC || 'Không áp dụng' }, { label: 'Người duyệt', value: issue.NguoiDuyet || 'Chưa duyệt' }
      ],
      columns: [
        { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' }, { label: 'ĐVT', key: 'DonViTinh' },
        { label: 'SL xuất', key: 'SoLuong', align: 'right' }, { label: 'Giá vốn', key: 'DonGia', format: 'money', align: 'right' },
        { label: 'Ghi chú', key: 'GhiChu' }
      ],
      rows: lines,
      totals: [
        { label: 'Tổng số lượng xuất', value: lines.reduce((sum, line) => sum + Number(line.SoLuong || 0), 0) },
        { label: 'Giá trị tham chiếu', value: issue.TongGiaTriThamChieu, format: 'money' }
      ],
      note: issue.GhiChu || 'Tồn kho chỉ giảm sau khi Quản lý duyệt và Thủ kho xác nhận đã xuất hàng.',
      signatures: ['Thủ kho lập phiếu', 'Quản lý phê duyệt']
    });
  };

  const issueReadOnlyModal = async (context, id, onDone) => {
    try {
      const data = await api(context, `/warehouse/stock-issues/${id}`);
      const issue = data.issue;
      const related = data.relatedReturn || (issue.MaDT ? { MaDT: issue.MaDT, LyDo: issue.LyDoThuNgan } : null);
      const rows = (data.lines || []).map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)} · ${esc(line.TenDM)}</small></td><td class="num">${line.SLTonHienTai}</td><td class="num"><strong>${line.SoLuong}</strong></td><td class="num">${money(line.DonGia)}</td><td>${esc(line.GhiChu || '—')}</td></tr>`).join('');
      const moves = (data.stockMoves || []).map(move => `<li><strong>${esc(move.LoaiGD)} ${Number(move.SoLuong) > 0 ? '+' : ''}${move.SoLuong}</strong> ${esc(move.TenSP)} <small>${esc(move.GhiChu || '')} · ${esc(move.NguoiGhiSo)} · ${fmtDate(move.NgayGD)}</small></li>`).join('');
      const logs = (data.audit || []).map(row => `<li><strong>${esc(row.HanhDong)}</strong> <small>${fmtDate(row.ThoiGian)}${row.TenNV ? ` · ${esc(row.TenNV)}` : ''}</small><span>${esc(row.NoiDung || '')}</span></li>`).join('');
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal stock-issue-modal">
        <div class="warehouse-modal-heading"><div>
          <p class="warehouse-kicker">PHIẾU XUẤT KHO / ${esc(issue.MaPX)}</p>
          <h2>${esc(issue.LoaiXuat)}</h2>
          <span>${fmtDate(issue.NgayXuat)} · ${esc(issue.TenKho)} · ${esc(issue.NguoiLap)}</span>
        </div><button class="warehouse-icon-button close" type="button">×</button></div>
        <div class="warehouse-modal-body">
          <div class="stock-issue-summary">
            <div><span>TRẠNG THÁI</span><strong><span class="status-pill ${statusClass(issue.TrangThai)}">${esc(issue.TrangThai)}</span></strong></div>
            <div><span>LOẠI XUẤT</span><strong>${esc(issue.LoaiXuat)}</strong></div>
            <div><span>PHIẾU NHẬP NGUỒN</span><strong>${esc(issue.MaPN || 'Không áp dụng')}</strong></div>
            <div><span>NHÀ CUNG CẤP</span><strong>${esc(issue.TenNCC || 'Không áp dụng')}</strong></div>
            <div><span>NGƯỜI DUYỆT</span><strong>${esc(issue.NguoiDuyet || 'Chưa duyệt')}</strong><small>${issue.NgayDuyet ? fmtDate(issue.NgayDuyet) : ''}</small></div>
            <div><span>NGƯỜI XÁC NHẬN</span><strong>${esc(issue.NguoiXacNhan || (issue.TrangThai === 'Đã xác nhận' ? issue.NguoiLap : 'Chưa xác nhận'))}</strong><small>${issue.NgayXacNhan ? fmtDate(issue.NgayXacNhan) : ''}</small></div>
            <div><span>PHIẾU ĐỔI TRẢ NGUỒN</span><strong>${related?.MaDT ? `<button type="button" class="stock-issue-related-link open-related-return" data-return="${esc(related.MaDT)}">${esc(related.MaDT)}</button>` : 'Không liên kết'}</strong><small>${related?.MaHD ? `Hóa đơn ${esc(related.MaHD)}` : ''}</small></div>
            <div><span>LÝ DO THU NGÂN</span><strong>${esc(issue.LyDoThuNgan || related?.LyDo || '—')}</strong></div>
          </div>
          ${issue.LyDoTuChoi ? `<div class="manager-readonly-note"><svg><use href="#i-warning"></use></svg><div><strong>Lý do từ chối</strong><span>${esc(issue.LyDoTuChoi)}</span></div></div>` : ''}
          <div class="manager-readonly-note"><svg><use href="#i-request"></use></svg><div><strong>Lý do/Ghi chú xuất kho</strong><span>${esc(issue.GhiChu || '—')}</span></div></div>
          <div class="warehouse-table-wrap"><table class="warehouse-table stock-issue-line-table"><thead><tr><th>SẢN PHẨM</th><th>TỒN HIỆN TẠI</th><th>SL XUẤT</th><th>GIÁ VỐN THAM CHIẾU</th><th>GHI CHÚ DÒNG</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="warehouse-empty">Không có dòng hàng.</td></tr>'}</tbody></table></div>
          ${moves ? `<div class="warehouse-history-moves"><p>SỔ KHO</p><ul>${moves}</ul></div>` : ''}
          ${logs ? `<p class="return-dossier-section">NHẬT KÝ PHIẾU</p><ul class="warehouse-history-audit">${logs}</ul>` : ''}
          ${issue.TrangThai === 'Đã duyệt' ? '<div class="receipt-rule"><svg><use href="#i-warning"></use></svg><span>Quản lý đã duyệt nhưng tồn kho chưa giảm. Chỉ khi Thủ kho xác nhận đã xuất hàng, hệ thống mới giảm tồn và ghi Giao dịch kho loại Xuất.</span></div>' : ''}
        </div>
        <div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Đóng</button><button class="warehouse-secondary print-stock-issue" type="button"><svg><use href="#i-report"></use></svg>Xem bản in</button>${issue.TrangThai === 'Đã duyệt' ? '<button class="warehouse-primary confirm-stock-issue" type="button">Xác nhận đã xuất hàng</button>' : ''}</div>
      </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.print-stock-issue')?.addEventListener('click', () => printStockIssue(data));
      overlay.querySelector('.open-related-return')?.addEventListener('click', () => {
        const maDT = overlay.querySelector('.open-related-return').dataset.return;
        window.FLY_WAREHOUSE?.openReturn?.(context, maDT, onDone, 'view');
      });
      overlay.querySelector('.confirm-stock-issue')?.addEventListener('click', async () => {
        if (!window.confirm(`Xác nhận đã xuất hàng theo ${issue.MaPX}? Thao tác này sẽ giảm tồn kho và không thể sửa phiếu.`)) return;
        try {
          const result = await api(context, `/warehouse/stock-issues/${id}/confirm`, { method: 'POST', body: '{}' });
          context.showToast(result.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const issueEditorModal = async (context, id, onDone) => {
    try {
      const [options, detail] = await Promise.all([
        api(context, '/warehouse/stock-issues/options'),
        id ? api(context, `/warehouse/stock-issues/${id}`) : Promise.resolve(null)
      ]);
      if (detail && detail.issue.TrangThai !== 'Nháp') return issueReadOnlyModal(context, id, onDone);
      let prefill = null;
      if (!id) {
        try { prefill = JSON.parse(sessionStorage.getItem('fly_stock_issue_prefill') || 'null'); }
        catch { prefill = null; }
        if (prefill) sessionStorage.removeItem('fly_stock_issue_prefill');
      }
      const issue = detail?.issue || { LoaiXuat: prefill?.LoaiXuat || 'Hủy hàng', MaPN: '', GhiChu: prefill?.GhiChu || '' };
      let catalog = options.products;
      let sourceReceipt = null;
      let lines = (detail?.lines || []).map(line => ({ MaSP: line.MaSP, SoLuong: Number(line.SoLuong), GhiChu: line.GhiChu || '' }));
      if (!id && Array.isArray(prefill?.lines) && prefill.lines.length) {
        lines = prefill.lines.map(line => ({ MaSP: line.MaSP, SoLuong: Number(line.SoLuong) || 1, GhiChu: line.GhiChu || '' }));
      }
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      overlay.innerHTML = `<div class="warehouse-modal stock-issue-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">${id ? `CẬP NHẬT ${esc(id)}` : 'LẬP PHIẾU XUẤT KHO THỦ CÔNG'}</p><h2>${esc(options.warehouse.TenKho)}</h2><span>Nháp → Chờ duyệt → Đã duyệt → Thủ kho xác nhận xuất</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="receipt-rule"><svg><use href="#i-warning"></use></svg><span>Phê duyệt chưa làm giảm tồn. Trả Nhà cung cấp bắt buộc chọn Phiếu nhập nguồn; không có nghiệp vụ điều chuyển kho.</span></div><div class="stock-issue-fields"><div class="warehouse-field"><label>Loại xuất *</label><select id="stockIssueType"><option ${issue.LoaiXuat === 'Trả NCC' ? 'selected' : ''}>Trả NCC</option><option ${issue.LoaiXuat === 'Hủy hàng' ? 'selected' : ''}>Hủy hàng</option><option ${issue.LoaiXuat === 'Sử dụng nội bộ' ? 'selected' : ''}>Sử dụng nội bộ</option></select></div><div class="warehouse-field source-receipt-field"><label>Phiếu nhập nguồn *</label><select id="stockIssueReceipt"><option value="">Chọn Phiếu nhập đã xác nhận</option>${options.receipts.map(receipt => `<option value="${esc(receipt.MaPN)}" ${receipt.MaPN === issue.MaPN ? 'selected' : ''}>${esc(receipt.MaPN)} · ${esc(receipt.TenNCC)} · ${receipt.TongChapNhan} đơn vị</option>`).join('')}</select><small class="source-receipt-note"></small></div><div class="warehouse-field stock-issue-note"><label>Lý do/Ghi chú xuất kho *</label><textarea id="stockIssueNote" maxlength="500" placeholder="Ghi rõ lý do xuất hủy, trả NCC hoặc sử dụng nội bộ...">${esc(issue.GhiChu || '')}</textarea></div></div><div class="stock-issue-add-row"><div class="warehouse-field"><label>Sản phẩm</label><select id="stockIssueProduct"></select></div><div class="warehouse-field"><label>Số lượng</label><input id="stockIssueQuantity" type="number" min="1" step="1" value="1"></div><button class="warehouse-secondary" id="addStockIssueLine" type="button"><svg><use href="#i-plus"></use></svg>Thêm dòng</button></div><div class="warehouse-table-wrap"><table class="warehouse-table stock-issue-line-table"><thead><tr><th>SẢN PHẨM</th><th>TỒN HIỆN TẠI</th><th>GIỚI HẠN NGUỒN</th><th>SỐ LƯỢNG XUẤT</th><th>GHI CHÚ DÒNG</th><th></th></tr></thead><tbody id="stockIssueLines"></tbody></table></div></div><div class="warehouse-modal-actions"><div class="stock-issue-action-note"><strong>Tồn kho chưa thay đổi khi lưu hoặc gửi duyệt.</strong><span>Chỉ bước “Xác nhận đã xuất hàng” sau phê duyệt mới trừ tồn.</span></div><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-secondary print-stock-issue-draft" type="button">Lưu và xem bản in</button><button class="warehouse-secondary save-draft" type="button">Lưu Nháp</button><button class="warehouse-primary save-submit" type="button">Lưu và gửi duyệt</button></div></div>`;
      document.body.appendChild(overlay);
      const typeSelect = overlay.querySelector('#stockIssueType');
      const receiptField = overlay.querySelector('.source-receipt-field');
      const receiptSelect = overlay.querySelector('#stockIssueReceipt');
      const productSelect = overlay.querySelector('#stockIssueProduct');
      const body = overlay.querySelector('#stockIssueLines');
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));

      const productInfo = maSP => catalog.find(product => product.MaSP === maSP) || options.products.find(product => product.MaSP === maSP) || detail?.lines.find(product => product.MaSP === maSP);
      const sourceLimit = product => product ? Number(product.SoLuongChapNhan || 0) - Number(product.SoLuongDaTra || 0) : null;
      const renderProductOptions = () => {
        const available = catalog.filter(product => !lines.some(line => line.MaSP === product.MaSP));
        productSelect.innerHTML = available.length ? `<option value="">Chọn sản phẩm</option>${available.map(product => `<option value="${esc(product.MaSP)}">${esc(product.TenSP)} · tồn ${product.SLTon}${typeSelect.value === 'Trả NCC' ? ` · còn được trả ${sourceLimit(product)}` : ''}</option>`).join('')}` : '<option value="">Không còn sản phẩm có thể thêm</option>';
      };
      const renderLines = () => {
        body.innerHTML = lines.length ? lines.map(line => {
          const product = productInfo(line.MaSP) || {};
          const limit = typeSelect.value === 'Trả NCC' ? sourceLimit(product) : null;
          return `<tr data-product="${esc(line.MaSP)}"><td><strong>${esc(product.TenSP || line.MaSP)}</strong><small>${esc(line.MaSP)} · ${esc(product.DonViTinh || '')}</small></td><td class="num">${Number(product.SLTon ?? product.SLTonHienTai ?? 0)}</td><td class="num">${limit === null ? 'Không áp dụng' : limit}</td><td><input class="stock-issue-quantity" type="number" min="1" step="1" ${limit === null ? '' : `max="${limit}"`} value="${line.SoLuong}"></td><td><input class="stock-issue-line-note" maxlength="200" value="${esc(line.GhiChu || '')}" placeholder="Tùy chọn"></td><td><button class="warehouse-icon-button remove-stock-issue-line" type="button" title="Xóa dòng">×</button></td></tr>`;
        }).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa có mặt hàng trong Phiếu xuất.</td></tr>';
        renderProductOptions();
      };
      const readLines = () => {
        lines = Array.from(body.querySelectorAll('tr[data-product]')).map(row => ({
          MaSP: row.dataset.product,
          SoLuong: Number(row.querySelector('.stock-issue-quantity').value),
          GhiChu: row.querySelector('.stock-issue-line-note').value.trim()
        }));
        return lines;
      };
      const loadReceipt = async (maPN, preserveLines = false) => {
        if (!maPN) {
          sourceReceipt = null; catalog = [];
          if (!preserveLines) lines = [];
          overlay.querySelector('.source-receipt-note').textContent = options.receipts.length ? 'Chọn Phiếu nhập để lấy đúng Nhà cung cấp và mặt hàng nguồn.' : 'Chưa có Phiếu nhập nào đã xác nhận để làm nguồn trả Nhà cung cấp.';
          renderLines(); return;
        }
        const data = await api(context, `/warehouse/stock-issues/source-receipts/${encodeURIComponent(maPN)}`);
        sourceReceipt = data.receipt; catalog = data.lines;
        overlay.querySelector('.source-receipt-note').textContent = `${sourceReceipt.TenNCC} · chỉ chọn mặt hàng đã nhập và còn số lượng có thể trả.`;
        if (!preserveLines) lines = [];
        renderLines();
      };
      const syncType = async (preserveLines = false) => {
        const isReturn = typeSelect.value === 'Trả NCC';
        receiptField.hidden = !isReturn;
        if (isReturn) await loadReceipt(receiptSelect.value, preserveLines);
        else { sourceReceipt = null; catalog = options.products; if (!preserveLines) lines = []; renderLines(); }
      };
      typeSelect.addEventListener('change', () => syncType(false).catch(error => context.showToast(error.message, 'error')));
      receiptSelect.addEventListener('change', () => loadReceipt(receiptSelect.value, false).catch(error => context.showToast(error.message, 'error')));
      overlay.querySelector('#addStockIssueLine').addEventListener('click', () => {
        readLines();
        const MaSP = productSelect.value;
        const SoLuong = Number(overlay.querySelector('#stockIssueQuantity').value);
        if (!MaSP) return context.showToast('Vui lòng chọn sản phẩm.', 'error');
        if (!Number.isInteger(SoLuong) || SoLuong <= 0) return context.showToast('Số lượng xuất phải là số nguyên lớn hơn 0.', 'error');
        const product = productInfo(MaSP);
        if (typeSelect.value === 'Trả NCC' && SoLuong > sourceLimit(product)) return context.showToast('Số lượng vượt quá phần còn có thể trả theo Phiếu nhập nguồn.', 'error');
        lines.push({ MaSP, SoLuong, GhiChu: '' }); renderLines();
      });
      body.addEventListener('click', event => {
        const button = event.target.closest('.remove-stock-issue-line');
        if (!button) return;
        readLines(); lines = lines.filter(line => line.MaSP !== button.closest('tr').dataset.product); renderLines();
      });
      const payload = () => ({
        LoaiXuat: typeSelect.value,
        MaPN: typeSelect.value === 'Trả NCC' ? receiptSelect.value : null,
        GhiChu: overlay.querySelector('#stockIssueNote').value.trim(),
        lines: readLines()
      });
      let currentId = id;
      const save = async () => {
        const result = await api(context, currentId ? `/warehouse/stock-issues/${currentId}` : '/warehouse/stock-issues', {
          method: currentId ? 'PUT' : 'POST', body: JSON.stringify(payload())
        });
        currentId = currentId || result.MaPX;
        return result;
      };
      overlay.querySelector('.save-draft').addEventListener('click', async () => {
        try { const result = await save(); context.showToast(result.message, 'success'); close(); await onDone(); }
        catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelector('.print-stock-issue-draft').addEventListener('click', async () => {
        try {
          const result = await save();
          context.showToast('Đã lưu bản nháp. Mở xem trước để in.', 'success');
          close();
          await onDone();
          printStockIssue(await api(context, `/warehouse/stock-issues/${currentId || result.MaPX}`));
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelector('.save-submit').addEventListener('click', async () => {
        try {
          if (!overlay.querySelector('#stockIssueNote').value.trim()) return context.showToast('Vui lòng ghi rõ lý do xuất kho trước khi gửi duyệt.', 'error');
          const result = await save();
          const maPX = currentId || result.MaPX;
          const submitted = await api(context, `/warehouse/stock-issues/${maPX}/submit`, { method: 'POST', body: '{}' });
          context.showToast(submitted.message, 'success'); close(); await onDone();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      await syncType(true);
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initStockIssues = async (root, context) => {
    const load = async () => {
      try {
        const search = root.querySelector('#stockIssueSearch')?.value || '';
        const status = root.querySelector('#stockIssueStatus')?.value || '';
        const data = await api(context, `/warehouse/stock-issues?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        if (!root.querySelector('#stockIssueBody')) {
          root.innerHTML = `${heading('KHO HÀNG / XUẤT THỦ CÔNG', 'Phiếu xuất kho', 'Lập phiếu xuất trả Nhà cung cấp, hủy hàng hoặc sử dụng nội bộ; tồn chỉ giảm sau khi được duyệt và Thủ kho xác nhận xuất.', '<button class="warehouse-primary" id="newStockIssue"><svg><use href="#i-plus"></use></svg>Lập Phiếu xuất</button>')}<div class="stock-issue-flow"><strong>Nháp</strong><span>→</span><strong>Chờ duyệt</strong><span>→</span><strong>Đã duyệt</strong><span>→</span><strong>Thủ kho xác nhận</strong><span>→</span><strong>Giảm tồn</strong></div><article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"></use></svg><input id="stockIssueSearch" placeholder="Tìm mã phiếu, loại xuất, Phiếu nhập hoặc Nhà cung cấp..."></label><div class="warehouse-toolbar-actions"><select id="stockIssueStatus"><option value="">Tất cả trạng thái</option><option>Nháp</option><option>Chờ duyệt</option><option>Đã duyệt</option><option>Từ chối</option><option>Đã xác nhận</option></select><button class="warehouse-icon-button" id="refreshStockIssues" title="Làm mới"><svg><use href="#i-refresh"></use></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU XUẤT</th><th>LOẠI XUẤT / NGUỒN</th><th>QUY MÔ</th><th>GIÁ TRỊ THAM CHIẾU</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody id="stockIssueBody"></tbody></table></div></article>`;
          let timer;
          root.querySelector('#stockIssueSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
          root.querySelector('#stockIssueStatus').addEventListener('change', load);
          root.querySelector('#refreshStockIssues').addEventListener('click', load);
          root.querySelector('#newStockIssue').addEventListener('click', () => issueEditorModal(context, null, load));
          root.addEventListener('click', event => {
            const button = event.target.closest('[data-stock-issue]');
            if (!button) return;
            if (button.dataset.mode === 'edit') issueEditorModal(context, button.dataset.stockIssue, load);
            else issueReadOnlyModal(context, button.dataset.stockIssue, load);
          });
        }
        root.querySelector('#stockIssueBody').innerHTML = data.items.length ? data.items.map(item => {
          const mode = item.TrangThai === 'Nháp' ? 'edit' : 'view';
          const action = item.TrangThai === 'Nháp' ? 'Sửa / gửi duyệt' : item.TrangThai === 'Đã duyệt' ? 'Xác nhận xuất' : 'Xem chi tiết';
          return `<tr><td><strong>${esc(item.MaPX)}</strong><small>${fmtDate(item.NgayXuat)} · ${esc(item.TenKho)}</small></td><td><strong>${esc(item.LoaiXuat)}</strong><small>${item.MaPN ? `${esc(item.MaPN)} · ${esc(item.TenNCC || '')}` : 'Không dùng Phiếu nhập nguồn'}</small></td><td><strong>${item.SoMatHang || 0} mặt hàng</strong><small>${item.TongSoLuong || 0} đơn vị xuất</small></td><td class="num"><strong>${money(item.TongGiaTriThamChieu)}</strong></td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span>${item.LyDoTuChoi ? `<small>${esc(item.LyDoTuChoi)}</small>` : ''}</td><td><button class="${item.TrangThai === 'Đã duyệt' ? 'warehouse-primary' : 'warehouse-secondary'}" data-stock-issue="${esc(item.MaPX)}" data-mode="${mode}">${action}</button></td></tr>`;
        }).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa có Phiếu xuất kho phù hợp.</td></tr>';
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
    const pending = sessionStorage.getItem('fly_open_stock_issue');
    if (pending) {
      sessionStorage.removeItem('fly_open_stock_issue');
      await issueEditorModal(context, pending, load);
    } else if (sessionStorage.getItem('fly_stock_issue_prefill')) {
      await issueEditorModal(context, null, load);
    }
  };

  window.FLY_STOCK_ISSUE = { open: (context, id, onDone) => issueEditorModal(context, id, onDone) };
  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'warehouse-stock-issues') return initStockIssues(document.querySelector('.warehouse-page'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
