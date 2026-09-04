(() => {
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const fmtHistoryWhen = value => {
    if (!value) return '—';
    const at = new Date(value);
    const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(at);
    const date = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(at);
    return `${time} · ${date}`;
  };
  const fmtDay = iso => {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : (iso || '—');
  };
  const historyKindMeta = kind => ({
    'doi-tra': { icon: 'i-cart', label: 'Kiểm đổi trả' },
    'phieu-nhap': { icon: 'i-box', label: 'Phiếu nhập' },
    'phieu-xuat': { icon: 'i-truck', label: 'Phiếu xuất' },
    'kiem-ke': { icon: 'i-inventory', label: 'Kiểm kê' },
    'de-nghi': { icon: 'i-request', label: 'Đề nghị mua' }
  }[kind] || { icon: 'i-log', label: 'Thao tác kho' });
  const auditListHtml = rows => {
    const logs = (rows || []).map(row => `<li><strong>${esc(row.HanhDong)}</strong> <small>${fmtDate(row.ThoiGian)}${row.TenNV ? ` · ${esc(row.TenNV)}` : ''}</small><span>${esc(row.NoiDung || '')}</span></li>`).join('');
    return logs ? `<p class="return-dossier-section">NHẬT KÝ PHIẾU</p><ul class="warehouse-history-audit">${logs}</ul>` : '';
  };
  const renderHistoryCard = (item, inner = '') => {
    const meta = historyKindMeta(item.kind);
    const sub = item.subtitle && item.subtitle !== item.status
      ? `<p class="warehouse-history-sub">${esc(item.subtitle)}</p>`
      : '';
    return `<article class="warehouse-history-card is-openable kind-${esc(item.kind || 'other')} tone-${esc(item.tone || 'info')}" tabindex="0" data-history-kind="${esc(item.kind || '')}" data-history-id="${esc(item.recordId || '')}" aria-label="Xem lịch sử chi tiết ${esc(item.title)}">
      <div class="warehouse-history-card-rail" aria-hidden="true"><svg><use href="#${meta.icon}"/></svg></div>
      <div class="warehouse-history-card-main">
        <div class="warehouse-history-card-head">
          <div>
            <p class="warehouse-history-when">${esc(fmtHistoryWhen(item.at))}</p>
            <h3>${esc(item.title)}</h3>
            ${sub}
          </div>
          <span class="status-pill ${statusClass(item.status)}">${esc(item.status)}</span>
        </div>
        ${inner}
        <p class="warehouse-history-open-hint">Xem lịch sử chi tiết</p>
      </div>
    </article>`;
  };
  const statusClass = status => ({
    'Nháp': 'draft', 'Đã gửi': 'sent', 'Đang xử lý': 'processing', 'Yêu cầu bổ sung': 'returned',
    'Đã hủy': 'cancelled', 'Hoàn thành': 'ok', 'Đã lập đơn': 'ok', 'Đã xác nhận': 'ok',
    'Chờ kiểm tra': 'sent', 'Chờ duyệt': 'sent', 'Đã duyệt': 'ok', 'Từ chối': 'cancelled',
    'Đang kiểm': 'processing', 'Chờ duyệt điều chỉnh': 'sent', 'Hoàn thành không chênh lệch': 'ok'
  }[status] || 'draft');
  const stockStatus = item => item.MucTon === 'Hết hàng' ? 'out' : ['Cần bổ sung', 'Chưa nhập lần đầu'].includes(item.MucTon) ? 'low' : 'ok';
  const productPhoto = (item, className = '') => window.FLY_PRODUCT_IMAGES?.markup(item, { className }) || '';
  const unsellableConditions = new Set(['Hỏng', 'Hết hạn']);
  const isPreRequestCount = count => /trước khi lập đề nghị/i.test(count?.GhiChu || '');
  const classifyCheckedLines = lines => {
    const enough = [];
    const needBuy = [];
    const scrap = [];
    for (const line of lines) {
      const damaged = unsellableConditions.has(line.TinhTrangHang);
      const actual = Number(line.SLThucTe);
      const min = Number(line.TonKhoToiThieu || 0);
      const ordered = Number(line.SLDatMua || 0);
      const sellable = damaged ? 0 : actual;
      const remainingNeed = Math.max(0, min - sellable - ordered);
      const item = {
        ...line,
        remainingNeed,
        SLDeNghi: Math.max(1, remainingNeed),
        GhiChu: `Thực tế kiểm đếm: ${actual}${damaged ? ` · ${line.TinhTrangHang}` : ''}`
      };
      if (damaged && actual > 0) scrap.push(item);
      if (remainingNeed > 0) needBuy.push(item);
      else if (!damaged) enough.push(item);
    }
    return { enough, needBuy, scrap };
  };
  const collectCountLines = overlay => Array.from(overlay.querySelectorAll('tbody tr[data-product]')).map(row => ({
    MaSP: row.dataset.product,
    TenSP: row.dataset.name,
    DonViTinh: row.dataset.unit,
    SLHeThong: Number(row.dataset.system),
    SLThucTe: Number(row.querySelector('.inventory-count-actual')?.value ?? row.dataset.system),
    TonKhoToiThieu: Number(row.dataset.min || 0),
    SLDatMua: Number(row.dataset.ordered || 0),
    TinhTrangHang: row.querySelector('.inventory-count-condition')?.value || 'Bình thường',
    NguyenNhan: row.querySelector('.inventory-count-reason')?.value?.trim() || ''
  }));

  const templates = {
    'warehouse-home': '<section class="warehouse-page" id="warehouseHome"><div class="overview-loading">Đang tổng hợp tình hình kho...</div></section>',
    'warehouse-inventory': '<section class="warehouse-page" id="warehouseInventory"><div class="overview-loading">Đang tải tồn kho...</div></section>',
    'warehouse-inventory-counts': '<section class="warehouse-page" id="warehouseInventoryCounts"><div class="overview-loading">Đang tải các đợt kiểm kê...</div></section>',
    'warehouse-requests': '<section class="warehouse-page" id="warehouseRequests"><div class="overview-loading">Đang tải đề nghị mua hàng...</div></section>',
    'purchasing-inbox': '<section class="warehouse-page" id="purchasingInbox"><div class="overview-loading">Đang tải đề nghị từ kho...</div></section>',
    'warehouse-returns': '<section class="warehouse-page" id="warehouseReturns"><div class="overview-loading">Đang tải hàng đổi trả...</div></section>',
    'warehouse-history': '<section class="warehouse-page warehouse-history-page" id="warehouseHistory"><div class="overview-loading">Đang tải lịch sử kho...</div></section>'
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
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const inspectNoteText = text => String(text || '')
    .replace(/^Đạt yêu cầu, được nhập lại kho\.\s*/i, '')
    .replace(/^Không đạt, không nhập lại kho\.\s*/i, '');
  const wasRestocked = text => /ược nhập lại kho/i.test(text || '') && !/không nhập lại/i.test(text || '');
  const hangDiDauLabel = ketQua => wasRestocked(ketQua)
    ? 'Nhập lại kho bán (cộng tồn khi thu ngân xác nhận)'
    : /không nhập lại/i.test(ketQua || '')
      ? 'Loại bỏ / vứt — không cộng tồn (đã trừ lúc bán)'
      : 'Chưa kiểm kho';
  const inspectVerdict = ketQua => {
    if (/không đạt|không nhập lại/i.test(ketQua || '')) return 'Không đạt — không nhập lại kho';
    if (/ạt yêu cầu|ược nhập lại/i.test(ketQua || '')) return 'Đạt — nhập lại kho bán';
    return 'Chưa có kết quả kiểm';
  };
  const invoicePayText = payments => {
    const paid = (payments || []).filter(item => item.TrangThai === 'Thành công');
    return paid.length ? paid.map(item => `${item.PhuongThuc} ${money(item.SoTien)}`).join(', ') : '';
  };
  const refundText = ticket => {
    if (ticket.HinhThucXuLy !== 'Hoàn tiền') return 'Đổi hàng — không hoàn tiền';
    const bits = [money(ticket.SoTienHoan || 0)];
    if (ticket.PhuongThucHoan) bits.push(ticket.PhuongThucHoan);
    if (ticket.MaGiaoDichHoan) bits.push(`mã ${ticket.MaGiaoDichHoan}`);
    if (ticket.NgayHoan) bits.push(fmtDate(ticket.NgayHoan));
    return bits.join(' · ');
  };
  const printWarehouseReturn = detail => {
    if (!window.FLY_PRINT?.show) return;
    const ticket = detail.ticket || {};
    const payText = invoicePayText(detail.payments);
    const fields = [
      { label: 'Cửa hàng / kho', value: [ticket.TenKho, ticket.DiaChiKho].filter(Boolean).join(' · ') || 'Cửa hàng Hà Nội' },
      { label: 'Hóa đơn gốc', value: ticket.MaHD },
      { label: 'Ngày bán gốc', value: ticket.NgayHoaDon ? fmtDate(ticket.NgayHoaDon) : '—' },
      { label: 'Tổng lúc bán', value: money(ticket.TongThanhToan) },
      { label: 'Khách hàng', value: ticket.TenKH || 'Khách vãng lai' },
      { label: 'Điện thoại', value: ticket.SDT || 'Không SĐT' },
      { label: 'Ca / thu ngân gốc', value: [ticket.MaCaGoc, ticket.ThuNganGoc].filter(Boolean).join(' · ') || '—' },
      { label: 'Thu ngân lập phiếu', value: ticket.NguoiLap ? `${ticket.NguoiLap} · ${fmtDate(ticket.NgayLap)}` : '—' },
      { label: 'Hình thức', value: ticket.HinhThucXuLy },
      { label: 'Số tiền hoàn', value: refundText(ticket) },
      { label: 'Hàng đi đâu', value: hangDiDauLabel(ticket.KetQuaKiemTra) },
      { label: 'Thủ kho kiểm', value: ticket.NguoiKiemTra ? `${ticket.NguoiKiemTra} · ${fmtDate(ticket.NgayKiemTra)}` : 'Chưa kiểm' },
      { label: 'Quản lý duyệt', value: ticket.NguoiDuyet ? `${ticket.NguoiDuyet} · ${fmtDate(ticket.NgayDuyet)}` : 'Chưa duyệt' }
    ];
    if (payText) fields.splice(4, 0, { label: 'Thanh toán hóa đơn gốc', value: payText });
    if (ticket.HangThanhVien) fields.splice(fields.findIndex(item => item.label === 'Điện thoại') + 1, 0, { label: 'Hạng thành viên', value: ticket.HangThanhVien });
    if (ticket.NgayHoan) fields.push({ label: 'Hoàn / đổi lúc', value: `${fmtDate(ticket.NgayHoan)}${ticket.MaCaHoan ? ` · ca ${ticket.MaCaHoan}` : ''}` });
    const note = [
      ticket.LyDo ? `Lý do thu ngân: ${ticket.LyDo}.` : '',
      ticket.KetQuaKiemTra ? `Kết quả kiểm: ${ticket.KetQuaKiemTra}.` : '',
      hangDiDauLabel(ticket.KetQuaKiemTra) + '.',
      ticket.GhiChu ? `Ghi chú phiếu: ${ticket.GhiChu}` : ''
    ].filter(Boolean).join(' ');
    window.FLY_PRINT.show({
      title: 'HỒ SƠ KIỂM ĐỔI TRẢ',
      number: ticket.MaDT,
      documentDate: ticket.NgayKiemTra || ticket.NgayLap,
      status: ticket.TrangThai,
      fields,
      columns: [
        { key: 'LoaiDong', label: 'Loại dòng' },
        { key: 'MaSP', label: 'Mã SP' },
        { key: 'MaVach', label: 'Mã vạch' },
        { key: 'TenSP', label: 'Sản phẩm' },
        { key: 'DonViTinh', label: 'ĐVT' },
        { key: 'SLBan', label: 'SL bán', align: 'right' },
        { key: 'SoLuong', label: 'SL', align: 'right' },
        { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
        { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
      ],
      rows: (detail.lines || []).map(line => ({
        ...line,
        LoaiDong: line.LoaiDong || 'Hàng khách trả',
        MaVach: line.MaVach || '—',
        DonViTinh: line.DonViTinh || '—',
        SLBan: line.LoaiDong === 'Hàng giao đổi' ? '—' : (line.SLBan ?? '—')
      })),
      totals: [
        { label: 'Tiền hàng khách trả', value: (detail.lines || []).filter(line => line.LoaiDong === 'Hàng khách trả').reduce((sum, line) => sum + Number(line.ThanhTien || 0), 0), format: 'money' },
        { label: 'Số tiền hoàn', value: ticket.SoTienHoan, format: 'money' }
      ],
      note,
      signatures: ['Thu ngân lập phiếu', 'Thủ kho kiểm hàng', 'Quản lý duyệt']
    });
  };
  const confirmMistakeModal = ({ maDT, products, reduceStock }) => new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    const rows = (products || []).map(line => `<tr><td><strong>${esc(line.TenSP || line.MaSP)}</strong><small>${esc(line.MaSP)}</small></td><td class="num">${line.SoLuong}</td></tr>`).join('');
    overlay.innerHTML = `<div class="warehouse-modal mistake-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">XÁC NHẬN TÍCH NHẦM</p><h2>${esc(maDT)}</h2></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="return-inspect-warn"><svg><use href="#i-warning"></use></svg><div><strong>${reduceStock ? 'Hàng hỏng đã nhập lại kho — xác nhận sẽ trừ tồn ngay' : 'Hàng hỏng — xác nhận sẽ không nhập lại kho khi thu ngân hoàn/đổi'}</strong><span>${reduceStock ? 'Số lượng khách trả từng được cộng tồn sẽ bị xuất hủy. Không cần phiếu xuất riêng, không chờ Quản lý duyệt.' : 'Thu ngân chưa hoàn tất nên tồn chưa cộng. Sửa kết quả kiểm để không cộng tồn lúc xác nhận hoàn.'}</span></div></div>${rows ? `<div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÀNG SẼ ${reduceStock ? 'TRỪ TỒN' : 'KHÔNG NHẬP LẠI'}</th><th>SL</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}<div class="warehouse-field"><label>Mô tả tích nhầm *</label><textarea id="mistakeReason" maxlength="400">Hàng hỏng, đã tick nhầm nhập lại kho bán.</textarea></div></div><div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-danger confirm-mistake" type="button">${reduceStock ? 'Xác nhận và trừ tồn' : 'Xác nhận không nhập lại'}</button></div></div>`;
    document.body.appendChild(overlay);
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => finish(null)));
    overlay.querySelector('.confirm-mistake').addEventListener('click', () => {
      const reason = overlay.querySelector('#mistakeReason').value.trim();
      if (!reason) { overlay.querySelector('#mistakeReason').focus(); return; }
      finish(reason);
    });
  });
  const inspectReturnModal = async (context, id, onDone, mode = 'create') => {
    try {
      const detail = await api(context, `/warehouse/returns/${id}`);
      const ticket = detail.ticket;
      const restocked = wasRestocked(ticket.KetQuaKiemTra);
      const editable = mode !== 'view' && (ticket.TrangThai === 'Chờ kiểm tra' || (ticket.TrangThai === 'Chờ duyệt' && mode === 'revise'));
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const lines = (detail.lines || []).filter(item => item.LoaiDong === 'Hàng khách trả');
      const exchanged = (detail.lines || []).filter(item => item.LoaiDong === 'Hàng giao đổi');
      const payText = invoicePayText(detail.payments);
      const kicker = editable ? (mode === 'revise' ? 'SỬA KẾT QUẢ KIỂM' : 'KIỂM TRA HÀNG KHÁCH TRẢ') : 'HỒ SƠ KIỂM ĐỔI TRẢ';
      const productRows = items => items.map(item => `<tr>
        <td><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.MaVach || 'Chưa có mã vạch')} · ${esc(item.DonViTinh || '—')}</small>${item.LyDo && item.LyDo !== ticket.LyDo ? `<small>${esc(item.LyDo)}</small>` : ''}</td>
        <td class="num">${item.SLBan != null ? item.SLBan : '—'}</td>
        <td class="num">${item.SoLuong}</td>
        <td class="num">${money(item.DonGia)}</td>
        <td class="num">${money(item.ThanhTien)}</td>
      </tr>`).join('');
      const moves = (detail.stockMoves || []).map(move => `<li><strong>${esc(move.LoaiGD)} ${Number(move.SoLuong) > 0 ? '+' : ''}${move.SoLuong}</strong> ${esc(move.TenSP)} <small>${esc(move.GhiChu || '')} · ${esc(move.NguoiGhiSo)} · ${fmtDate(move.NgayGD)}</small></li>`).join('');
      const logs = (detail.audit || []).map(row => `<li><strong>${esc(row.HanhDong)}</strong> <small>${fmtDate(row.ThoiGian)}${row.TenNV ? ` · ${esc(row.TenNV)}` : ''}</small><span>${esc(row.NoiDung || '')}</span></li>`).join('');
      overlay.innerHTML = `<div class="warehouse-modal receipt-modal return-dossier-modal">
        <div class="warehouse-modal-heading"><div>
          <p class="warehouse-kicker">${kicker}</p>
          <h2>${esc(ticket.MaDT)}</h2>
          <span>${esc(ticket.TenKho || 'Cửa hàng Hà Nội')}${ticket.DiaChiKho ? ` · ${esc(ticket.DiaChiKho)}` : ''} · ${esc(ticket.TrangThai)}</span>
        </div><button class="warehouse-icon-button close" type="button">×</button></div>
        <div class="warehouse-modal-body">
          <div class="return-source-card return-dossier-cards">
            <div><span>HÓA ĐƠN GỐC</span><strong>${esc(ticket.MaHD)}</strong><small>${fmtDate(ticket.NgayHoaDon)}${ticket.TongThanhToan != null ? ` · ${money(ticket.TongThanhToan)}` : ''}${payText ? ` · ${esc(payText)}` : ''}</small></div>
            <div><span>KHÁCH HÀNG</span><strong>${esc(ticket.TenKH || 'Khách vãng lai')}</strong><small>${esc(ticket.SDT || 'Không SĐT')}${ticket.HangThanhVien ? ` · ${esc(ticket.HangThanhVien)}` : ''}</small></div>
            <div><span>CA / THU NGÂN GỐC</span><strong>${esc(ticket.MaCaGoc || '—')}</strong><small>${esc(ticket.ThuNganGoc || '')}</small></div>
            <div><span>HÌNH THỨC</span><strong>${esc(ticket.HinhThucXuLy)}</strong><small>${esc(refundText(ticket))}</small></div>
            <div><span>HÀNG ĐI ĐÂU</span><strong>${esc(hangDiDauLabel(ticket.KetQuaKiemTra))}</strong><small>${esc(ticket.TrangThai)}</small></div>
            <div><span>CỬA HÀNG / KHO</span><strong>${esc(ticket.TenKho || 'Cửa hàng Hà Nội')}</strong><small>${esc(ticket.DiaChiKho || '')}</small></div>
          </div>
          <div class="return-dossier-trail">
            <div><span>LẬP</span><strong>${esc(ticket.NguoiLap || '—')}</strong><small>${fmtDate(ticket.NgayLap)}</small></div>
            <div><span>KHO KIỂM</span><strong>${esc(ticket.NguoiKiemTra || 'Chưa kiểm')}</strong><small>${ticket.NgayKiemTra ? fmtDate(ticket.NgayKiemTra) : 'Chưa có'}</small></div>
            <div><span>DUYỆT</span><strong>${esc(ticket.NguoiDuyet || 'Chưa duyệt')}</strong><small>${ticket.NgayDuyet ? fmtDate(ticket.NgayDuyet) : 'Chưa có'}</small></div>
            ${ticket.NgayHoan ? `<div><span>HOÀN / ĐỔI</span><strong>${esc(ticket.MaCaHoan || 'Đã xác nhận')}</strong><small>${fmtDate(ticket.NgayHoan)}</small></div>` : ''}
          </div>
          ${editable ? `<div class="return-inspect-warn"><svg><use href="#i-warning"/></svg><div><strong>Hàng hỏng, hết hạn hoặc lỗi cửa hàng: bỏ tick nhập lại kho</strong><span>Không tick = loại bỏ/vứt, tồn giữ nguyên vì đã trừ lúc bán — không trừ lần nữa. Chỉ tick khi bao bì nguyên, còn hạn và còn bán được (sẽ cộng tồn bán).</span></div></div>` : ''}
          <p>Lý do thu ngân: <strong>${esc(ticket.LyDo || '—')}</strong></p>
          ${ticket.GhiChu ? `<p class="warehouse-history-note">Ghi chú phiếu: ${esc(ticket.GhiChu)}</p>` : ''}
          <p class="return-dossier-section">HÀNG KHÁCH TRẢ</p>
          <div class="warehouse-table-wrap"><table class="warehouse-table return-dossier-table"><thead><tr><th>SẢN PHẨM</th><th>SL BÁN</th><th>SL TRẢ</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${productRows(lines) || '<tr><td colspan="5" class="warehouse-empty">Không có hàng khách trả.</td></tr>'}</tbody></table></div>
          ${exchanged.length ? `<p class="return-dossier-section">HÀNG GIAO ĐỔI CHO KHÁCH</p><div class="warehouse-table-wrap"><table class="warehouse-table return-dossier-table"><thead><tr><th>SẢN PHẨM</th><th>SL BÁN GỐC</th><th>SL GIAO</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${productRows(exchanged)}</tbody></table></div>` : ''}
          ${editable
            ? `<label class="warehouse-field return-restock-field"><input type="checkbox" id="restock" ${restocked ? 'checked' : ''}> <span>Nhập lại kho bán (cộng tồn)<small>Không tick = loại bỏ/vứt. Không trừ kho lần nữa vì đã trừ lúc bán.</small></span></label><div class="warehouse-field"><label>Kết quả kiểm tra *</label><textarea id="inspectNote" maxlength="200" placeholder="Tình trạng bao bì, hạn dùng, lỗi sản phẩm...">${esc(inspectNoteText(ticket.KetQuaKiemTra))}</textarea></div>`
            : `<div class="warehouse-history-result return-inspect-result"><span>Kết quả kiểm kho</span><strong>${esc(inspectVerdict(ticket.KetQuaKiemTra))}</strong><p>${esc(ticket.KetQuaKiemTra || 'Chưa ghi kết quả')}</p><small>Kiểm lúc ${fmtDate(ticket.NgayKiemTra)} · ${esc(ticket.NguoiKiemTra || '—')}</small><small>Hàng đi đâu: ${esc(hangDiDauLabel(ticket.KetQuaKiemTra))}</small></div>`}
          ${moves ? `<div class="warehouse-history-moves"><p>SỔ KHO</p><ul>${moves}</ul></div>` : ''}
          ${logs ? `<p class="return-dossier-section">NHẬT KÝ PHIẾU</p><ul class="warehouse-history-audit">${logs}</ul>` : ''}
        </div>
        <div class="warehouse-modal-actions">
          <button class="warehouse-secondary close" type="button">${editable ? 'Hủy' : 'Đóng'}</button>
          <button class="warehouse-secondary print-return" type="button"><svg><use href="#i-report"/></svg>In hồ sơ</button>
          ${editable ? `<button class="warehouse-primary save-inspect" type="button">${mode === 'revise' ? 'Lưu kết quả mới' : 'Ghi nhận và gửi duyệt'}</button>` : ''}
          ${!editable && restocked && ['Đã duyệt', 'Hoàn thành'].includes(ticket.TrangThai) ? `<button class="warehouse-danger flag-mistake" type="button">${ticket.TrangThai === 'Hoàn thành' ? 'Tôi đã tích nhầm — trừ tồn' : 'Tôi đã tích nhầm'}</button>` : ''}
        </div>
      </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      overlay.querySelector('.print-return')?.addEventListener('click', () => printWarehouseReturn(detail));
      overlay.querySelector('.save-inspect')?.addEventListener('click', async () => {
        try {
          const restock = overlay.querySelector('#restock').checked;
          if (restock && /hỏng|hết hạn|kém chất|lỗi cửa hàng|không bán/i.test(ticket.LyDo || '')) {
            if (!confirm('Lý do thu ngân là hàng hỏng/hết hạn. Tick nhập lại sẽ cộng tồn bán. Chỉ tiếp tục nếu hàng thực sự còn bán được.')) return;
          }
          const result = await api(context, `/warehouse/returns/${id}/inspect`, { method: 'POST', body: JSON.stringify({ KetQuaKiemTra: overlay.querySelector('#inspectNote').value, DuocNhapLai: restock }) });
          context.showToast(result.message, 'success'); close(); await onDone?.();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelector('.flag-mistake')?.addEventListener('click', async () => {
        const reason = await confirmMistakeModal({
          maDT: id,
          products: lines,
          reduceStock: ticket.TrangThai === 'Hoàn thành' && restocked
        });
        if (reason == null) return;
        try {
          const result = await api(context, `/warehouse/returns/${id}/flag-mistake`, { method: 'POST', body: JSON.stringify({ LyDo: reason }) });
          context.showToast(result.message, 'success'); close(); await onDone?.();
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const showError = (root, error) => {
    root.innerHTML = `<div class="welcome-card"><h2>Không thể tải dữ liệu</h2><p>${esc(error.message)}</p></div>`;
  };

  const showCountFollowUp = (context, { MaKK, TrangThai, lines }) => {
    const { enough, needBuy, scrap } = classifyCheckedLines(lines);
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    const list = (items, empty) => items.length
      ? `<ul class="count-followup-list">${items.map(item => `<li><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · thực tế ${item.SLThucTe} ${esc(item.DonViTinh || '')}${item.TinhTrangHang && item.TinhTrangHang !== 'Bình thường' ? ` · ${esc(item.TinhTrangHang)}` : ''}${item.remainingNeed ? ` · thiếu ${item.remainingNeed}` : ''}</small></li>`).join('')}</ul>`
      : `<p class="count-followup-empty">${esc(empty)}</p>`;
    overlay.innerHTML = `<div class="warehouse-modal count-followup-modal" role="dialog" aria-modal="true">
      <div class="warehouse-modal-heading"><div><p class="warehouse-kicker">KẾT QUẢ KIỂM TRA / ${esc(MaKK)}</p><h2>Còn đủ, hết hàng hay hàng hỏng?</h2></div><button class="warehouse-icon-button modal-close" type="button" aria-label="Đóng">×</button></div>
      <div class="warehouse-modal-body">
        <div class="receipt-rule"><svg><use href="#i-warning"/></svg><span>Căn cứ số lượng thực tế đã kiểm đếm để quyết định mua hàng. Tồn trên hệ thống chỉ đổi sau khi Quản lý duyệt đợt kiểm kê (nếu có chênh lệch) hoặc sau khi xác nhận Phiếu xuất hủy.</span></div>
        <p class="count-followup-status">Đợt kiểm kê: <strong>${esc(TrangThai || 'Đã ghi nhận')}</strong></p>
        <section class="count-followup-block"><h3>Còn đủ — không lập đề nghị</h3>${list(enough, 'Không có mặt hàng còn đủ sau kiểm tra.')}</section>
        <section class="count-followup-block warn"><h3>Hết hoặc dưới nhu cầu — lập Phiếu đề nghị mua hàng</h3>${list(needBuy, 'Không có mặt hàng cần nhập sau kiểm tra.')}</section>
        <section class="count-followup-block danger"><h3>Hỏng / hết hạn — Phiếu xuất hủy</h3>${list(scrap, 'Không ghi nhận hàng hỏng hoặc hết hạn.')}<p class="count-followup-hint">Xuất hủy phải qua Quản lý duyệt, Thủ kho xác nhận mới trừ tồn. Không lập nhu cầu ảo nếu hàng còn bán được.</p></section>
      </div>
      <div class="warehouse-modal-actions">
        <button class="warehouse-secondary modal-close" type="button">Đóng</button>
        ${scrap.length ? '<button class="warehouse-secondary open-scrap" type="button">Lập Phiếu xuất hủy</button>' : ''}
        ${needBuy.length ? '<button class="warehouse-primary open-request" type="button">Lập phiếu đề nghị mua hàng</button>' : ''}
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.open-request')?.addEventListener('click', () => {
      close();
      requestModal(context, needBuy, null, {
        LyDo: 'Bổ sung hàng hóa sau kiểm tra số lượng thực tế',
        GhiChu: `Theo đợt kiểm kê ${MaKK}`
      });
    });
    overlay.querySelector('.open-scrap')?.addEventListener('click', () => {
      sessionStorage.setItem('fly_stock_issue_prefill', JSON.stringify({
        LoaiXuat: 'Hủy hàng',
        GhiChu: `Hàng hỏng/hết hạn sau đợt kiểm kê ${MaKK}`,
        lines: scrap.map(item => ({ MaSP: item.MaSP, SoLuong: Math.max(1, Number(item.SLThucTe) || 1), GhiChu: item.TinhTrangHang }))
      }));
      close();
      context.navigate('warehouse-stock-issues');
    });
  };

  const inventoryCountDetail = async (context, id, onDone, options = {}) => {
    try {
      const data = await api(context, `/warehouse/inventory-counts/${id}`);
      const count = data.count;
      const editable = count.TrangThai === 'Đang kiểm';
      const overlay = document.createElement('div');
      overlay.className = 'warehouse-modal-backdrop';
      const resultLabel = difference => difference > 0 ? 'Thừa' : difference < 0 ? 'Thiếu' : 'Khớp';
      const rows = data.lines.map(line => {
        const difference = Number(line.SLThucTe) - Number(line.SLHeThong);
        const actual = editable
          ? `<input class="inventory-count-actual" type="number" min="0" step="1" value="${Number(line.SLThucTe)}" aria-label="Số lượng thực tế ${esc(line.TenSP)}">`
          : `<strong>${Number(line.SLThucTe)}</strong>`;
        const condition = editable
          ? `<select class="inventory-count-condition"><option ${line.TinhTrangHang === 'Bình thường' ? 'selected' : ''}>Bình thường</option><option ${line.TinhTrangHang === 'Hỏng' ? 'selected' : ''}>Hỏng</option><option ${line.TinhTrangHang === 'Hết hạn' ? 'selected' : ''}>Hết hạn</option></select>`
          : esc(line.TinhTrangHang || 'Bình thường');
        const reason = editable
          ? `<input class="inventory-count-reason" maxlength="200" value="${esc(line.NguyenNhan || '')}" placeholder="Bắt buộc nếu lệch">`
          : esc(line.NguyenNhan || '—');
        return `<tr data-product="${esc(line.MaSP)}" data-system="${Number(line.SLHeThong)}" data-name="${esc(line.TenSP)}" data-unit="${esc(line.DonViTinh || '')}" data-min="${Number(line.TonKhoToiThieu || 0)}" data-ordered="${Number(line.SLDatMua || 0)}"><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)} · ${esc(line.DonViTinh)} · ${esc(line.TenDM)}</small></td><td class="num"><strong>${Number(line.SLHeThong)}</strong></td><td class="num">${actual}</td><td class="num inventory-count-difference">${difference > 0 ? '+' : ''}${difference}</td><td><span class="status-pill inventory-count-result ${difference === 0 ? 'ok' : 'sent'}">${resultLabel(difference)}</span></td><td>${condition}</td><td>${reason}</td></tr>`;
      }).join('');
      const preRequest = options.followUp || isPreRequestCount(count);
      overlay.innerHTML = `<div class="warehouse-modal inventory-count-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">${preRequest ? 'KIỂM TRA SỐ LƯỢNG THỰC TẾ' : 'KIỂM KÊ KHO'} / ${esc(count.MaKK)}</p><h2>${esc(count.TenKho)}</h2><span>${fmtDate(count.NgayKiemKe)} · ${esc(count.NguoiKiemKe)} · ${esc(count.TrangThai)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="receipt-rule"><svg><use href="#i-warning"/></svg><span>${preRequest ? 'Cảnh báo tồn tối thiểu chỉ là gợi ý. Ghi số thực tế và tình trạng (bình thường / hỏng / hết hạn). Còn đủ thì không lập đề nghị. Hết hoặc dưới nhu cầu thì lập Phiếu đề nghị mua hàng. Tồn hệ thống chỉ đổi sau khi Quản lý duyệt chênh lệch.' : 'Số lượng hệ thống là ảnh chụp lúc tạo đợt. Khi có chênh lệch phải ghi nguyên nhân; tồn kho chỉ thay đổi sau khi Quản lý duyệt.'}</span></div><div class="warehouse-field inventory-count-note"><label>Ghi chú đợt kiểm kê</label><textarea id="inventoryCountNote" maxlength="500" ${editable ? '' : 'disabled'}>${esc(count.GhiChu || '')}</textarea></div>${count.LyDoTuChoi ? `<div class="manager-readonly-note"><svg><use href="#i-warning"/></svg><div><strong>Lý do từ chối</strong><span>${esc(count.LyDoTuChoi)}</span></div></div>` : ''}<div class="warehouse-table-wrap"><table class="warehouse-table inventory-count-table"><thead><tr><th>SẢN PHẨM</th><th>HỆ THỐNG</th><th>THỰC TẾ</th><th>CHÊNH LỆCH</th><th>KẾT QUẢ</th><th>TÌNH TRẠNG</th><th>NGUYÊN NHÂN</th></tr></thead><tbody>${rows}</tbody></table></div>${auditListHtml(data.audit)}</div><div class="warehouse-modal-actions"><div class="inventory-count-submit-hint" ${editable ? '' : 'hidden'}></div><button class="warehouse-secondary close" type="button">Đóng</button>${editable ? '<button class="warehouse-secondary save-count" type="button">Lưu kết quả đếm</button><button class="warehouse-primary submit-count" type="button"></button>' : ''}</div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
      const updateRow = row => {
        const actual = Number(row.querySelector('.inventory-count-actual').value);
        const system = Number(row.dataset.system);
        const difference = Number.isFinite(actual) ? actual - system : 0;
        row.querySelector('.inventory-count-difference').textContent = `${difference > 0 ? '+' : ''}${difference}`;
        const badge = row.querySelector('.inventory-count-result');
        badge.textContent = resultLabel(difference);
        badge.className = `status-pill inventory-count-result ${difference === 0 ? 'ok' : 'sent'}`;
      };
      const differenceCount = () => Array.from(overlay.querySelectorAll('tbody tr[data-product]')).filter(row => {
        const actual = Number(row.querySelector('.inventory-count-actual').value);
        return Number.isFinite(actual) && actual !== Number(row.dataset.system);
      }).length;
      const updateSubmitState = () => {
        const total = differenceCount();
        const submitButton = overlay.querySelector('.submit-count');
        const hint = overlay.querySelector('.inventory-count-submit-hint');
        if (!submitButton || !hint) return;
        if (total > 0) {
          submitButton.textContent = `Gửi Quản lý duyệt (${total} mặt hàng)`;
          hint.innerHTML = `<strong>Có ${total} mặt hàng chênh lệch.</strong><span>Sau khi gửi, tồn kho chưa thay đổi cho tới khi Quản lý duyệt.</span>`;
          hint.className = 'inventory-count-submit-hint has-difference';
        } else {
          submitButton.textContent = 'Kết thúc kiểm kê (không cần duyệt)';
          hint.innerHTML = '<strong>Không có chênh lệch.</strong><span>Đợt kiểm kê sẽ hoàn thành ngay và không gửi sang Quản lý.</span>';
          hint.className = 'inventory-count-submit-hint no-difference';
        }
      };
      overlay.querySelectorAll('.inventory-count-actual').forEach(input => input.addEventListener('input', () => {
        updateRow(input.closest('tr'));
        updateSubmitState();
      }));
      updateSubmitState();
      const payload = () => ({
        GhiChu: overlay.querySelector('#inventoryCountNote').value.trim(),
        lines: Array.from(overlay.querySelectorAll('tbody tr[data-product]')).map(row => ({
          MaSP: row.dataset.product,
          SLHeThong: Number(row.dataset.system),
          SLThucTe: Number(row.querySelector('.inventory-count-actual').value),
          TinhTrangHang: row.querySelector('.inventory-count-condition').value,
          NguyenNhan: row.querySelector('.inventory-count-reason').value.trim()
        }))
      });
      const save = async () => api(context, `/warehouse/inventory-counts/${id}`, { method: 'PUT', body: JSON.stringify(payload()) });
      overlay.querySelector('.save-count')?.addEventListener('click', async () => {
        try { const result = await save(); context.showToast(result.message, 'success'); await onDone(); }
        catch (error) { context.showToast(error.message, 'error'); }
      });
      overlay.querySelector('.submit-count')?.addEventListener('click', async () => {
        try {
          const total = differenceCount();
          const question = total > 0
            ? `Gửi ${total} mặt hàng chênh lệch sang Quản lý duyệt điều chỉnh tồn kho?`
            : 'Không có mặt hàng chênh lệch. Kết thúc đợt kiểm kê này mà không gửi Quản lý duyệt?';
          if (!window.confirm(question)) return;
          await save();
          const followLines = collectCountLines(overlay);
          const result = await api(context, `/warehouse/inventory-counts/${id}/submit`, { method: 'POST', body: '{}' });
          context.showToast(result.message, 'success'); close(); await onDone();
          if (preRequest) showCountFollowUp(context, { MaKK: id, TrangThai: result.TrangThai, lines: followLines });
        } catch (error) { context.showToast(error.message, 'error'); }
      });
    } catch (error) { context.showToast(error.message, 'error'); }
  };

  const initInventoryCounts = async (root, context) => {
    const load = async () => {
      try {
        const search = root.querySelector('#inventoryCountSearch')?.value || '';
        const status = root.querySelector('#inventoryCountStatus')?.value || '';
        const data = await api(context, `/warehouse/inventory-counts?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
        if (!root.querySelector('#inventoryCountBody')) {
          root.innerHTML = `${heading('KHO HÀNG / KIỂM KÊ', 'Kiểm kê và xử lý chênh lệch', 'Thủ kho ghi số thực tế trên đợt kiểm kê; không lập Phiếu đề nghị điều chỉnh riêng.', '<button class="warehouse-primary" id="newInventoryCount"><svg><use href="#i-plus"/></svg>Tạo đợt kiểm kê</button>')}<article class="warehouse-table-card"><div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="inventoryCountSearch" placeholder="Tìm mã kiểm kê hoặc ghi chú..."></label><div class="warehouse-toolbar-actions"><select id="inventoryCountStatus"><option value="">Tất cả trạng thái</option><option>Đang kiểm</option><option>Chờ duyệt điều chỉnh</option><option>Đã duyệt</option><option>Từ chối</option><option>Hoàn thành không chênh lệch</option></select><button class="warehouse-icon-button" id="refreshInventoryCounts" title="Làm mới"><svg><use href="#i-refresh"/></svg></button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>ĐỢT KIỂM KÊ</th><th>NGÀY KIỂM</th><th>PHẠM VI</th><th>CHÊNH LỆCH</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody id="inventoryCountBody"></tbody></table></div></article>`;
          let timer;
          root.querySelector('#inventoryCountSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
          root.querySelector('#inventoryCountStatus').addEventListener('change', load);
          root.querySelector('#refreshInventoryCounts').addEventListener('click', load);
          root.querySelector('#newInventoryCount').addEventListener('click', async () => {
            if (!window.confirm('Tạo đợt kiểm kê và chụp số tồn hiện tại của toàn bộ mặt hàng đang bán?')) return;
            try {
              const result = await api(context, '/warehouse/inventory-counts', { method: 'POST', body: '{}' });
              context.showToast(result.message, 'success'); await load(); inventoryCountDetail(context, result.MaKK, load);
            } catch (error) { context.showToast(error.message, 'error'); }
          });
          root.addEventListener('click', event => {
            const button = event.target.closest('[data-view-inventory-count]');
            if (button) inventoryCountDetail(context, button.dataset.viewInventoryCount, load);
          });
        }
        root.querySelector('#inventoryCountBody').innerHTML = data.items.length ? data.items.map(item => `<tr><td><strong>${esc(item.MaKK)}</strong><small>${esc(item.TenKho)}</small></td><td>${fmtDate(item.NgayKiemKe)}</td><td><strong>${item.SoMatHang || 0} mặt hàng</strong><small>${item.SoMatHangChenhLech || 0} mặt hàng chênh lệch</small></td><td><strong>Thừa ${item.TongThua || 0}</strong><small>Thiếu ${item.TongThieu || 0}</small></td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span>${item.LyDoTuChoi ? `<small>${esc(item.LyDoTuChoi)}</small>` : ''}</td><td><button class="warehouse-secondary" data-view-inventory-count="${esc(item.MaKK)}">${item.TrangThai === 'Đang kiểm' ? 'Tiếp tục kiểm' : 'Xem chi tiết'}</button></td></tr>`).join('') : '<tr><td colspan="6" class="warehouse-empty">Chưa có đợt kiểm kê phù hợp.</td></tr>';
      } catch (error) { showError(root, error); }
    };
    await load();
  };

  const initHome = async (root, context) => {
    try {
      const data = await api(context, '/warehouse/dashboard');
      const s = data.summary;
      const lowRows = data.lowStock.length ? data.lowStock.map(item => `
        <li><div class="warehouse-product-cell">${productPhoto(item, 'table-product-photo')}<div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · Định mức ${item.TonKhoToiThieu} ${esc(item.DonViTinh)}</small></div></div><div class="warehouse-stock-number"><b>${item.SLTon}</b><small>Đang đặt: ${item.SLDatMua}</small></div></li>`).join('') : '<li><div><strong>Không có mặt hàng dưới định mức</strong><small>Tồn kho đang ở mức ổn định.</small></div></li>';
      const requestRows = data.recentRequests.length ? data.recentRequests.map(item => `
        <li><div><strong>${esc(item.MaDN)}</strong><small>${item.SoMatHang} mặt hàng · ${fmtDate(item.NgayLap)}</small></div><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></li>`).join('') : '<li><div><strong>Chưa có đề nghị mua hàng</strong><small>Bắt đầu từ danh sách mặt hàng cần bổ sung.</small></div></li>';
      root.innerHTML = `
        ${heading('KHO HÀNG / TỔNG QUAN', 'Nhịp vận hành kho hôm nay', `${data.warehouse.TenKho} · ${data.warehouse.DiaChi}`, '<button class="warehouse-secondary" data-go="warehouse-history" type="button">Lịch sử kho</button>')}
        <article class="warehouse-hero"><div class="warehouse-hero-copy"><span><svg><use href="#i-warning"/></svg> CẢNH BÁO TỒN TỐI THIỂU</span><h2>${Number(s.CanBoSung || 0)} mặt hàng dưới định mức</h2><p>Kiểm tra số lượng thực tế trước khi lập đề nghị mua hàng. Còn đủ thì không lập nhu cầu. Hàng hỏng hoặc hết hạn thì lập Phiếu xuất hủy.</p><button class="warehouse-primary" data-go="warehouse-inventory"><svg><use href="#i-inventory"/></svg>Mở tồn kho &amp; cảnh báo</button></div></article>
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

  const printRequest = data => {
    const request = data.request;
    window.FLY_PRINT.show({
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
    });
  };

  const requestModal = (context, items, existing = null, extras = {}) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'warehouse-modal-backdrop';
    const lineHtml = items.map(item => {
      const current = item.SLTonHienTai ?? item.SLTon ?? item.SLThucTe ?? 0;
      const suggested = item.SLDeNghi ?? Math.max(1, Number(item.TonKhoToiThieu || 0) - Number(current) - Number(item.SLDatMua || 0));
      return `<div class="warehouse-form-line" data-product="${esc(item.MaSP)}" data-note="${esc(item.GhiChu || '')}">
        <div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.DonViTinh || '')}</small></div>
        <span>${current}</span><span>${item.TonKhoToiThieu ?? item.SLTonToiThieu ?? 0}</span><span>${item.SLDatMua ?? 0}</span>
        <input class="request-qty" type="number" min="1" step="1" value="${suggested}" aria-label="Số lượng đề nghị ${esc(item.TenSP)}">
        <button class="remove-line" type="button" title="Bỏ mặt hàng">×</button></div>`;
    }).join('');
    backdrop.innerHTML = `<div class="warehouse-modal" role="dialog" aria-modal="true">
      <div class="warehouse-modal-heading"><div><p class="warehouse-kicker">ĐỀ NGHỊ MUA HÀNG</p><h2>${existing ? `Cập nhật ${esc(existing.MaDN)}` : 'Lập phiếu đề nghị mua hàng'}</h2></div><button class="warehouse-icon-button modal-close" aria-label="Đóng">×</button></div>
      <div class="warehouse-modal-body">
        <div class="warehouse-form-grid"><div class="warehouse-field"><label>Lý do đề nghị</label><input id="requestReason" maxlength="500" value="${esc(existing?.LyDo || extras.LyDo || 'Bổ sung hàng hóa')}"></div><div class="warehouse-field"><label>Ghi chú chung</label><input id="requestNote" maxlength="500" value="${esc(existing?.GhiChu || extras.GhiChu || '')}" placeholder="Thông tin cần bộ phận mua hàng lưu ý"></div></div>
        <div class="warehouse-modal-note">Chỉ lập đề nghị khi đã kiểm tra số lượng thực tế và hàng còn thiếu. Phiếu đề nghị không đổi tồn kho. Nhân viên mua hàng lập Đơn mua; Quản lý mới phê duyệt đơn.</div>
        <div class="warehouse-form-lines"><div class="warehouse-form-line heading"><span>Mặt hàng</span><span>Tồn hiện tại</span><span>Định mức</span><span>Đã đặt</span><span>SL đề nghị</span><span></span></div>${lineHtml}</div>
      </div>
      <div class="warehouse-modal-actions"><button class="warehouse-secondary modal-close" type="button">Đóng</button><button class="warehouse-secondary print-draft" type="button">Lưu và xem bản in</button><button class="warehouse-secondary save-draft" type="button">Lưu bản nháp</button><button class="warehouse-primary save-submit" type="button">Lưu và gửi mua hàng</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    backdrop.querySelectorAll('.remove-line').forEach(button => button.addEventListener('click', () => button.closest('.warehouse-form-line').remove()));

    const save = async (submit, preview = false) => {
      const rows = Array.from(backdrop.querySelectorAll('.warehouse-form-line[data-product]'));
      if (!rows.length) return context.showToast('Đề nghị phải còn ít nhất một mặt hàng.', 'error');
      const lines = rows.map(row => ({
        MaSP: row.dataset.product,
        SLDeNghi: Number(row.querySelector('.request-qty').value),
        GhiChu: row.dataset.note || ''
      }));
      const payload = { LyDo: backdrop.querySelector('#requestReason').value, GhiChu: backdrop.querySelector('#requestNote').value, lines };
      try {
        const saved = existing
          ? await api(context, `/warehouse/purchase-requests/${existing.MaDN}`, { method: 'PUT', body: JSON.stringify(payload) })
          : await api(context, '/warehouse/purchase-requests', { method: 'POST', body: JSON.stringify(payload) });
        const id = existing?.MaDN || saved.MaDN;
        if (submit) await api(context, `/warehouse/purchase-requests/${id}/submit`, { method: 'POST' });
        context.showToast(preview ? 'Đã lưu bản nháp. Mở xem trước để in.' : (submit ? 'Đã gửi đề nghị tới Nhân viên mua hàng.' : saved.message), 'success');
        close();
        context.navigate('warehouse-requests');
        if (preview) printRequest(await api(context, `/warehouse/purchase-requests/${id}`));
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    backdrop.querySelector('.save-draft').addEventListener('click', () => save(false));
    backdrop.querySelector('.print-draft').addEventListener('click', () => save(false, true));
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
        ${auditListHtml(data.audit)}
      </div><div class="warehouse-modal-actions"><button class="warehouse-secondary modal-close">Đóng</button><button class="warehouse-primary print-request"><svg><use href="#i-report"/></svg>Xem bản in</button></div></div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', () => backdrop.remove()));
      backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
      backdrop.querySelector('.print-request').addEventListener('click', () => printRequest(data));
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
    const presetSearch = sessionStorage.getItem('fly_inventory_search');
    const presetLow = sessionStorage.getItem('fly_inventory_low_only');
    if (presetSearch != null) sessionStorage.removeItem('fly_inventory_search');
    if (presetLow != null) sessionStorage.removeItem('fly_inventory_low_only');
    const selectedItems = () => Array.from(root.querySelectorAll('.inventory-select:checked')).map(box => currentItems.find(item => item.MaSP === box.value)).filter(Boolean);
    const load = async () => {
      const search = root.querySelector('#inventorySearch')?.value || '';
      const lowOnly = root.querySelector('#lowOnly')?.checked ?? true;
      try {
        const data = await api(context, `/warehouse/inventory?search=${encodeURIComponent(search)}&lowOnly=${lowOnly}`);
        currentItems = data.items;
        const rows = data.items.length ? data.items.map(item => `<tr>
          <td><input type="checkbox" class="inventory-select" value="${esc(item.MaSP)}" ${item.MucTon === 'Đủ hàng' ? '' : 'checked'} aria-label="Chọn ${esc(item.TenSP)}"></td>
          <td><div class="warehouse-product-cell">${productPhoto(item, 'table-product-photo')}<div><strong>${esc(item.TenSP)}</strong><small>${esc(item.MaSP)} · ${esc(item.MaVach || 'Chưa có mã vạch')}</small></div></div></td><td>${esc(item.TenDM)}</td>
          <td class="num">${item.SLTon}</td><td class="num">${item.TonKhoToiThieu}</td><td class="num">${item.SLDatMua}</td>
          <td><span class="status-pill ${stockStatus(item)}">${esc(item.MucTon)}</span></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty"><strong>Không có mặt hàng cần xử lý</strong><small>Bỏ lọc “Chỉ hiện hàng cần nhập” để xem toàn bộ tồn, hoặc làm mới danh sách.</small></td></tr>';
        root.querySelector('#inventoryBody').innerHTML = rows;
      } catch (error) {
        const body = root.querySelector('#inventoryBody');
        if (body) body.innerHTML = `<tr><td colspan="7" class="warehouse-empty warehouse-empty-error"><strong>Không tải được tồn kho</strong><small>${esc(error.message)}</small></td></tr>`;
        else context.showToast(error.message, 'error');
      }
    };
    root.innerHTML = `${heading('KHO HÀNG / TỒN KHO', 'Tồn kho và cảnh báo tồn tối thiểu', 'So sánh tồn với mức tối thiểu. Kiểm tra số lượng thực tế trước khi lập phiếu đề nghị mua hàng.', '<span class="warehouse-chip">Kho cửa hàng Hà Nội</span>')}
      <article class="warehouse-table-card inventory-alert-card"><div class="receipt-rule inventory-check-rule"><svg><use href="#i-warning"/></svg><span>Cảnh báo tồn tối thiểu chỉ là gợi ý. Còn đủ sau khi kiểm đếm thì không lập đề nghị. Hết hoặc dưới nhu cầu thì gửi mua hàng. Hỏng/hết hạn thì lập Phiếu xuất hủy.</span></div>
      <div class="warehouse-toolbar"><label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="inventorySearch" placeholder="Tìm mã, tên sản phẩm, mã vạch hoặc nhóm hàng..." value="${esc(presetSearch || '')}"></label><div class="warehouse-toolbar-actions"><label class="warehouse-check"><input id="lowOnly" type="checkbox"${presetLow === '0' ? '' : ' checked'}> Chỉ hiện hàng cần nhập</label><button class="warehouse-secondary" id="refreshInventory" type="button"><svg><use href="#i-refresh"/></svg>Làm mới</button><button class="warehouse-secondary" id="createRequest" type="button">Lập phiếu đề nghị mua hàng</button><button class="warehouse-primary" id="checkActual" type="button"><svg><use href="#i-plus"/></svg>Kiểm tra số lượng thực tế</button></div></div>
      <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>CHỌN</th><th>MẶT HÀNG</th><th>NHÓM HÀNG</th><th>TỒN HIỆN TẠI</th><th>TỒN TỐI THIỂU</th><th>ĐÃ ĐẶT</th><th>MỨC TỒN</th></tr></thead><tbody id="inventoryBody"></tbody></table></div></article>`;
    let timer;
    root.querySelector('#inventorySearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    root.querySelector('#lowOnly').addEventListener('change', load);
    root.querySelector('#refreshInventory').addEventListener('click', load);
    root.querySelector('#checkActual').addEventListener('click', async () => {
      const selected = selectedItems();
      if (!selected.length) return context.showToast('Hãy chọn ít nhất một mặt hàng để kiểm tra số lượng thực tế.', 'error');
      try {
        const result = await api(context, '/warehouse/inventory-counts', {
          method: 'POST',
          body: JSON.stringify({
            products: selected.map(item => item.MaSP),
            GhiChu: 'Kiểm tra số lượng thực tế trước khi lập đề nghị mua hàng.'
          })
        });
        context.showToast(result.message, 'success');
        inventoryCountDetail(context, result.MaKK, load, { followUp: true });
      } catch (error) { context.showToast(error.message, 'error'); }
    });
    root.querySelector('#createRequest').addEventListener('click', () => {
      const selected = selectedItems();
      if (!selected.length) return context.showToast('Hãy chọn ít nhất một mặt hàng.', 'error');
      if (!window.confirm('Tài liệu yêu cầu kiểm tra số lượng thực tế trước khi lập đề nghị. Chỉ tiếp tục nếu đã kiểm đếm và hàng thực tế còn thiếu.')) return;
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

  const initWarehouseReturns = async (root, context) => {
    const load = async () => {
      try {
        const data = await api(context, '/warehouse/returns?status=' + encodeURIComponent(root.querySelector('#returnStatus')?.value || 'Chờ kiểm tra'));
        if (!root.querySelector('#warehouseReturnBody')) {
          root.innerHTML = `${heading('KHO HÀNG / ĐỔI TRẢ', 'Kiểm tra hàng khách trả', 'Thủ kho ghi kết quả kiểm. Hàng hỏng thì bỏ tick: loại bỏ/vứt. Tick nhầm nhập lại thì vào Lịch sử kho bấm Tôi đã tích nhầm để trừ tồn.', '<button class="warehouse-secondary" data-go-history type="button">Lịch sử kho</button>')}<article class="warehouse-table-card"><div class="warehouse-toolbar"><select id="returnStatus"><option>Chờ kiểm tra</option><option>Chờ duyệt</option><option>Đã duyệt</option><option>Hoàn thành</option><option value="">Tất cả</option></select></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU</th><th>HÓA ĐƠN / KHÁCH</th><th>HÌNH THỨC</th><th>HÀNG ĐI ĐÂU</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody id="warehouseReturnBody"></tbody></table></div></article>`;
          root.querySelector('#returnStatus').addEventListener('change', load);
          root.querySelector('[data-go-history]')?.addEventListener('click', () => context.navigate('warehouse-history'));
        }
        const actionCell = item => {
          if (item.TrangThai === 'Chờ kiểm tra') return `<button class="warehouse-primary" data-inspect="${esc(item.MaDT)}">Kiểm tra</button>`;
          if (item.TrangThai === 'Chờ duyệt') return `<button class="warehouse-secondary" data-revise="${esc(item.MaDT)}">Sửa kiểm</button>`;
          return `<button class="warehouse-secondary" data-view="${esc(item.MaDT)}">Xem hồ sơ</button>`;
        };
        root.querySelector('#warehouseReturnBody').innerHTML = data.items.length ? data.items.map(item => `<tr class="${wasRestocked(item.KetQuaKiemTra) && /hỏng|hết hạn|lỗi cửa hàng/i.test(item.LyDo || '') ? 'warehouse-history-warn-row' : ''}"><td><strong>${esc(item.MaDT)}</strong><small>${fmtDate(item.NgayLap)}</small></td><td>${esc(item.MaHD)}<small>${esc(item.TenKH || 'Khách vãng lai')}</small></td><td>${esc(item.HinhThucXuLy)}<small>${esc(item.LyDo || '—')}</small></td><td>${esc(hangDiDauLabel(item.KetQuaKiemTra))}</td><td><span class="status-pill ${statusClass(item.TrangThai)}">${esc(item.TrangThai)}</span></td><td class="warehouse-row-actions">${actionCell(item)}</td></tr>`).join('') : '<tr><td colspan="6" class="warehouse-empty">Không có phiếu ở trạng thái này.</td></tr>';
        root.querySelectorAll('[data-inspect]').forEach(button => button.addEventListener('click', () => inspectReturnModal(context, button.dataset.inspect, load, 'create')));
        root.querySelectorAll('[data-revise]').forEach(button => button.addEventListener('click', () => inspectReturnModal(context, button.dataset.revise, load, 'revise')));
        root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => inspectReturnModal(context, button.dataset.view, load, 'view')));
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
  };

  const openHistoryDetail = (context, item, onDone) => {
    const id = item?.recordId;
    if (!id) return;
    if (item.kind === 'doi-tra') return inspectReturnModal(context, id, onDone, 'view');
    if (item.kind === 'kiem-ke') return inventoryCountDetail(context, id, onDone);
    if (item.kind === 'de-nghi') return detailModal(context, id);
    if (item.kind === 'phieu-xuat') {
      if (window.FLY_STOCK_ISSUE?.open) return window.FLY_STOCK_ISSUE.open(context, id, onDone);
      return context.showToast('Không mở được phiếu xuất.', 'error');
    }
    if (item.kind === 'phieu-nhap') {
      if (window.FLY_RECEIPT?.open) return window.FLY_RECEIPT.open(context, id, onDone);
      return context.showToast('Không mở được phiếu nhập.', 'error');
    }
    context.showToast('Chưa có hồ sơ chi tiết cho loại việc này.', 'error');
  };
  const bindHistoryOpeners = (root, context, load) => {
    const body = root.querySelector('#warehouseHistoryBody');
    if (!body || body.dataset.historyOpenBound) return;
    body.dataset.historyOpenBound = '1';
    const resolveItem = card => (root._historyData?.timeline || []).find(row => row.recordId === card.dataset.historyId && row.kind === card.dataset.historyKind);
    body.addEventListener('click', event => {
      if (event.target.closest('button, a, input, textarea, select, label')) return;
      const card = event.target.closest('[data-history-kind][data-history-id]');
      if (!card || !body.contains(card)) return;
      const item = resolveItem(card);
      if (item) openHistoryDetail(context, item, load);
    });
    body.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('[data-history-kind][data-history-id]');
      if (!card || event.target !== card) return;
      event.preventDefault();
      const item = resolveItem(card);
      if (item) openHistoryDetail(context, item, load);
    });
  };

  const initHistory = async (root, context) => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 8)}01`;
    const load = async () => {
      const from = root.querySelector('#historyFrom')?.value || monthStart;
      const to = root.querySelector('#historyTo')?.value || today;
      const kind = root.querySelector('#historyKind')?.value || 'all';
      const search = root.querySelector('#historySearch')?.value || '';
      try {
        const data = await api(context, `/warehouse/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&kind=${encodeURIComponent(kind)}&search=${encodeURIComponent(search)}`);
        const s = data.summary || {};
        const actor = data.actor || {};
        if (!root.querySelector('#warehouseHistoryBody')) {
          root.innerHTML = `${heading('KHO HÀNG / LỊCH SỬ', 'Việc bạn đã làm tại kho', 'Nếu tick nhầm nhập lại hàng hỏng, bấm Tôi đã tích nhầm trên phiếu đã hoàn thành: tồn giảm ngay số lượng đã cộng. Phiếu còn chờ duyệt thì sửa kết quả kiểm.', `<button class="warehouse-secondary" id="printWarehouseHistory" type="button">In / PDF</button>`)}
            <div class="warehouse-toolbar warehouse-history-toolbar">
              <label class="warehouse-search"><svg><use href="#i-search"/></svg><input id="historySearch" placeholder="Tìm phiếu, sản phẩm, lý do..."></label>
              <div class="warehouse-history-filters">
                <div class="warehouse-history-daterange" role="group" aria-label="Khoảng ngày" data-keep-native="1">
                  <label>Từ <input id="historyFrom" type="date" data-keep-native="1" value="${esc(from)}"></label>
                  <span aria-hidden="true">—</span>
                  <label>Đến <input id="historyTo" type="date" data-keep-native="1" value="${esc(to)}"></label>
                </div>
                <select id="historyKind">
                  <option value="all">Tất cả việc làm</option>
                  <option value="doi-tra">Kiểm đổi trả</option>
                  <option value="phieu-nhap">Phiếu nhập</option>
                  <option value="phieu-xuat">Phiếu xuất</option>
                  <option value="kiem-ke">Kiểm kê</option>
                  <option value="de-nghi">Đề nghị mua</option>
                </select>
                <button class="warehouse-icon-button warehouse-history-refresh" id="refreshHistory" title="Làm mới" type="button"><svg><use href="#i-refresh"/></svg></button>
              </div>
            </div>
            <div id="warehouseHistoryBody"></div>`;
          let timer;
          root.querySelector('#historySearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
          ['historyFrom', 'historyTo', 'historyKind'].forEach(id => root.querySelector(`#${id}`).addEventListener('change', load));
          root.querySelector('#refreshHistory').addEventListener('click', load);
          bindHistoryOpeners(root, context, load);
          root.querySelector('#printWarehouseHistory').addEventListener('click', () => {
            const current = root._historyData;
            if (!current) return;
            window.FLY_PRINT?.show({
              variant: 'report', title: 'LỊCH SỬ THAO TÁC KHO', number: `${current.period.from}–${current.period.to}`,
              documentDate: new Date(), status: current.actor?.TenNV || 'Thủ kho',
              fields: [{ label: 'Thủ kho', value: current.actor?.TenNV }, { label: 'Từ ngày', value: current.period.from }, { label: 'Đến ngày', value: current.period.to }],
              columns: [
                { label: 'Thời gian', value: row => fmtDate(row.at) },
                { label: 'Việc làm', key: 'title' },
                { label: 'Chi tiết', key: 'subtitle' },
                { label: 'Hàng đi đâu / ghi chú', value: row => row.hangDiDau || row.detail || '—' },
                { label: 'Trạng thái', key: 'status' }
              ],
              rows: current.timeline || [],
              note: 'Lịch sử theo người đăng nhập. Tick nhầm nhập lại hàng hỏng: xác nhận tích nhầm trên phiếu đã hoàn thành để trừ tồn ngay.',
              signatures: ['Thủ kho', 'Quản lý cửa hàng']
            });
          });
        }
        root._historyData = data;
        const cards = (data.timeline || []).map(item => {
          if (item.kind === 'doi-tra') {
            const products = (item.products || []).map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)}</small></td><td class="num">${line.SoLuong}</td><td>${esc(line.LyDo || item.ticket?.LyDo || '—')}</td></tr>`).join('');
            const moves = (item.stockMoves || []).map(move => `<li><strong>${esc(move.LoaiGD)} ${move.SoLuong > 0 ? '+' : ''}${move.SoLuong}</strong> ${esc(move.TenSP)} <small>${esc(move.GhiChu || '')} · ${esc(move.NguoiGhiSo)} · ${fmtDate(move.NgayGD)}</small></li>`).join('');
            const logs = (item.audit || []).map(row => `<li><strong>${esc(row.HanhDong)}</strong> <small>${fmtDate(row.ThoiGian)}</small><span>${esc(row.NoiDung || '')}</span></li>`).join('');
            return renderHistoryCard({ ...item, title: `${item.ticket.MaDT} · ${item.title}` }, `
              ${item.corrected ? `<div class="warehouse-history-alert ok"><strong>Đã xác nhận tích nhầm:</strong> hàng hỏng nhập nhầm đã được trừ tồn (hoặc sẽ không cộng khi thu ngân xác nhận).</div>` : item.mistaken ? `<div class="warehouse-history-alert"><strong>Có dấu hiệu tích nhầm:</strong> lý do thu ngân là hàng hỏng/hết hạn nhưng bạn đã cho nhập lại kho bán. Bấm Tôi đã tích nhầm để trừ tồn.</div>` : ''}
              <div class="warehouse-history-meta">
                <div><span>LÝ DO THU NGÂN</span><strong>${esc(item.ticket.LyDo || '—')}</strong></div>
                <div><span>BẠN ĐÃ CHỌN</span><strong>${esc(item.hangDiDau)}</strong></div>
                <div><span>KẾT QUẢ GHI</span><strong>${esc(item.ticket.KetQuaKiemTra || '—')}</strong></div>
                <div><span>THU NGÂN / DUYỆT</span><strong>${esc(item.ticket.NguoiLap || '—')}</strong><small>QL ${esc(item.ticket.NguoiDuyet || 'chưa duyệt')}</small></div>
              </div>
              <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÀNG KHÁCH TRẢ</th><th>SL</th><th>LÝ DO DÒNG</th></tr></thead><tbody>${products || '<tr><td colspan="3" class="warehouse-empty">Không có dòng hàng trả.</td></tr>'}</tbody></table></div>
              ${moves ? `<div class="warehouse-history-moves"><p>SỔ KHO SAU XÁC NHẬN</p><ul>${moves}</ul></div>` : `<p class="warehouse-history-muted">${item.restock ? 'Chưa có dòng sổ kho — thu ngân chưa xác nhận hoàn/đổi nên tồn chưa cộng.' : 'Không cộng tồn. Đã trừ lúc bán, không trừ lần nữa.'}</p>`}
              ${item.ticket.GhiChu ? `<p class="warehouse-history-note">${esc(item.ticket.GhiChu)}</p>` : ''}
              ${logs ? `<ul class="warehouse-history-audit">${logs}</ul>` : ''}
              <div class="warehouse-history-actions">
                <button class="warehouse-secondary" data-view="${esc(item.recordId)}" type="button">Xem hồ sơ</button>
                ${item.canRevise ? `<button class="warehouse-primary" data-revise="${esc(item.recordId)}" type="button">Sửa kết quả kiểm</button>` : ''}
                ${item.canFlagMistake ? `<button class="warehouse-danger" data-flag="${esc(item.recordId)}" type="button">${item.status === 'Hoàn thành' ? 'Tôi đã tích nhầm — trừ tồn' : 'Tôi đã tích nhầm'}</button>` : ''}
              </div>`);
          }
          return renderHistoryCard(item, item.detail ? `<p class="warehouse-history-note">${esc(item.detail)}</p>` : '');
        }).join('');
        root.querySelector('#warehouseHistoryBody').innerHTML = `
          <p class="warehouse-history-actor">Thủ kho <strong>${esc(actor.TenNV || '')}</strong> · ${esc(actor.MaNV || '')} · ${esc(fmtDay(data.period.from))} → ${esc(fmtDay(data.period.to))}</p>
          <div class="warehouse-stats warehouse-history-stats">
            <article><span class="warehouse-history-stat-icon"><svg><use href="#i-cart"/></svg></span><div><span>KIỂM ĐỔI TRẢ</span><strong>${s.SoKiemDoiTra || 0}</strong><small>${s.SoNhapLai || 0} nhập lại · ${s.SoLoaiBo || 0} loại bỏ</small></div></article>
            <article class="${Number(s.SoTichNham) ? 'attention' : ''}"><span class="warehouse-history-stat-icon"><svg><use href="#i-warning"/></svg></span><div><span>CÓ DẤU HIỆU TÍCH NHẦM</span><strong>${s.SoTichNham || 0}</strong><small>Hỏng/hết hạn nhưng nhập lại kho</small></div></article>
            <article><span class="warehouse-history-stat-icon"><svg><use href="#i-box"/></svg></span><div><span>PHIẾU NHẬP / XUẤT</span><strong>${s.SoPhieuNhap || 0} / ${s.SoPhieuXuat || 0}</strong><small>Do bạn lập trong kỳ</small></div></article>
            <article><span class="warehouse-history-stat-icon"><svg><use href="#i-inventory"/></svg></span><div><span>KIỂM KÊ / ĐỀ NGHỊ</span><strong>${s.SoKiemKe || 0} / ${s.SoDeNghi || 0}</strong><small>Đợt kiểm và đề nghị mua</small></div></article>
          </div>
          <div class="warehouse-history-feed">${cards || '<div class="warehouse-history-empty"><span class="warehouse-history-empty-icon"><svg><use href="#i-log"/></svg></span><strong>Kỳ này bạn chưa có thao tác kho</strong><small>Đổi khoảng ngày hoặc loại việc, hoặc bấm làm mới để xem lại.</small></div>'}</div>
          ${(data.audit || []).length ? `<article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>NHẬT KÝ CHI TIẾT</p><h2>Mọi thao tác đã ghi sổ</h2></div><span class="report-card-count">${data.audit.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>THỜI GIAN</th><th>HÀNH ĐỘNG</th><th>CHỨNG TỪ</th><th>NỘI DUNG</th></tr></thead><tbody>${data.audit.map(row => `<tr><td>${fmtDate(row.ThoiGian)}</td><td><strong>${esc(row.HanhDong)}</strong><small>${esc(row.BangLienQuan)}</small></td><td>${esc(row.MaBanGhi || '—')}</td><td>${esc(row.NoiDung || '—')}</td></tr>`).join('')}</tbody></table></div></article>` : ''}`;
        root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => inspectReturnModal(context, button.dataset.view, load, 'view')));
        root.querySelectorAll('[data-revise]').forEach(button => button.addEventListener('click', () => inspectReturnModal(context, button.dataset.revise, load, 'revise')));
        root.querySelectorAll('[data-flag]').forEach(button => button.addEventListener('click', async () => {
          const card = (root._historyData?.timeline || []).find(row => row.recordId === button.dataset.flag);
          const reason = await confirmMistakeModal({
            maDT: button.dataset.flag,
            products: card?.products || [],
            reduceStock: card?.status === 'Hoàn thành' && card?.restock
          });
          if (reason == null) return;
          try {
            const result = await api(context, `/warehouse/returns/${button.dataset.flag}/flag-mistake`, { method: 'POST', body: JSON.stringify({ LyDo: reason }) });
            context.showToast(result.message, 'success'); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
        }));
        root.querySelectorAll('[data-scrap-return]').forEach(button => button.addEventListener('click', async () => {
          try {
            const result = await api(context, `/warehouse/stock-issues/from-return/${button.dataset.scrapReturn}`, { method: 'POST', body: '{}' });
            sessionStorage.setItem('fly_open_stock_issue', result.MaPX);
            context.showToast(result.message, 'success');
            context.navigate('warehouse-stock-issues');
          } catch (error) { context.showToast(error.message, 'error'); }
        }));
        root.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => context.navigate(button.dataset.go)));
      } catch (error) { showError(root, error); }
    };
    await load();
  };

  const init = async (pageName, context) => {
    const root = document.querySelector('.warehouse-page');
    if (!root) return;
    if (pageName === 'warehouse-home') return initHome(root, context);
    if (pageName === 'warehouse-inventory') return initInventory(root, context);
    if (pageName === 'warehouse-inventory-counts') return initInventoryCounts(root, context);
    if (pageName === 'warehouse-requests') return initRequests(root, context);
    if (pageName === 'warehouse-returns') return initWarehouseReturns(root, context);
    if (pageName === 'warehouse-history') return initHistory(root, context);
    if (pageName === 'purchasing-inbox') return initPurchasing(root, context);
  };

  window.FLY_WAREHOUSE = {
    openReturn: inspectReturnModal,
    openCount: inventoryCountDetail,
    openRequest: detailModal,
    openHistory: openHistoryDetail
  };
  window.FLY_ROLE_PAGES = { templates, init };
})();
