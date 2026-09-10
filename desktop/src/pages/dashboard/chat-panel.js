(() => {
  const API_BASE = window.flyApi?.getApiBase() || window.FLY_API_BASE || 'http://127.0.0.1:3000/api';
  const token = localStorage.getItem('fly_token');
  let user = {};
  try { user = JSON.parse(localStorage.getItem('fly_user') || '{}'); } catch { user = {}; }

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const ROOM_META = {
    'cua-hang': { title: 'Cửa hàng' },
    'kho': { title: 'Kho' },
    'mua-hang': { title: 'Mua hàng' },
    'ke-toan': { title: 'Kế toán' },
    'thu-ngan': { title: 'Thu ngân' },
    'quan-ly': { title: 'Quản lý' }
  };
  const ROOM_ORDER = ['cua-hang', 'kho', 'mua-hang', 'ke-toan', 'thu-ngan', 'quan-ly'];
  const VOUCHER_LABEL = {
    HoaDon: 'Hóa đơn bán hàng',
    HoaDonMuaHang: 'Hóa đơn mua hàng',
    DeNghiMuaHang: 'Đề nghị mua hàng',
    DonMuaHang: 'Đơn mua hàng',
    PhieuNhap: 'Phiếu nhập kho',
    PhieuXuat: 'Phiếu xuất kho'
  };

  const roomMeta = (room) => ROOM_META[room?.khoa] || {
    title: String(room?.tenPhong || 'Phòng').replace(/^#/, '')
  };

  const inferVoucherLoai = (loai, ma) => {
    const known = String(loai || '').trim();
    if (VOUCHER_LABEL[known]) return known;
    const id = String(ma || '').trim().toUpperCase();
    if (/^HDMH|^HDM/.test(id)) return 'HoaDonMuaHang';
    if (/^HD/.test(id)) return 'HoaDon';
    if (/^DN/.test(id)) return 'DeNghiMuaHang';
    if (/^PO|^DMH/.test(id)) return 'DonMuaHang';
    if (/^PN/.test(id)) return 'PhieuNhap';
    if (/^PX/.test(id)) return 'PhieuXuat';
    return known;
  };

  const drawer = () => document.getElementById('chatWidget');
  const backdrop = () => document.getElementById('chatBackdrop');
  const fab = () => document.getElementById('chatFab');
  const isOpen = () => drawer()?.classList.contains('is-open');

  const syncComposer = (room) => {
    const input = document.getElementById('chatInput');
    const send = document.getElementById('chatSend');
    const attachFile = document.getElementById('chatAttachFile');
    const attachVoucher = document.getElementById('chatAttachVoucher');
    const enabled = Boolean(room?.maPhong || activeRoom);
    const meta = roomMeta(room);
    if (input) {
      input.disabled = !enabled;
      input.placeholder = enabled ? `Nhắn trong ${meta.title}` : 'Chọn phòng bên trái để nhắn';
    }
    [send, attachFile, attachVoucher].forEach((el) => {
      if (el) el.disabled = !enabled;
    });
  };

  let rooms = [];
  let activeRoom = '';
  let messages = [];
  let pendingFile = null;
  let objectUrls = new Map();
  let sending = false;
  let chatLive = false;
  let chatSource = null;
  let chatAbort = null;
  let chatTimer = 0;
  let chatReconnect = 0;
  let chatReadyWatch = 0;
  let chatBackoff = 2000;
  let chatToastTimer = 0;
  let voucherTimer = 0;
  let roomSeq = 0;

  const authHeaders = (json = true) => {
    const headers = { Authorization: `Bearer ${token}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const handleAuth = (response) => {
    if (response.status !== 401) return false;
    localStorage.removeItem('fly_token');
    localStorage.removeItem('fly_user');
    window.location.href = '../login/login.html';
    return true;
  };

  const api = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...authHeaders(!(options.body instanceof FormData)), ...options.headers }
    });
    if (handleAuth(response)) throw new Error('Phiên đăng nhập đã hết hạn.');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể gọi chat nội bộ.');
    return data;
  };

  const soundMuted = () => {
    try { return localStorage.getItem(`fly_inbox_sound_${user.MaNV || 'nv'}`) === 'off'; }
    catch { return false; }
  };

  const syncTriggers = (open) => {
    const expanded = open ? 'true' : 'false';
    document.getElementById('menuInternalChat')?.setAttribute('aria-expanded', expanded);
    fab()?.setAttribute('aria-expanded', expanded);
    fab()?.classList.toggle('is-hidden', open);
  };

  const setBadge = (count) => {
    const n = Number(count || 0);
    ['chatUnreadCount', 'chatFabCount'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n > 99 ? '99+' : String(n);
      el.classList.toggle('visible', n > 0);
    });
  };

  const setError = (message) => {
    const box = document.getElementById('chatError');
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || '';
  };

  const setWarn = (message) => {
    const box = document.getElementById('chatWarn');
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || '';
  };

  const clock = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
    }).format(new Date(value));
  };

  const fileUrl = async (maTin) => {
    const key = String(maTin);
    if (objectUrls.has(key)) return objectUrls.get(key);
    const response = await fetch(`${API_BASE}/chat/files/${maTin}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (handleAuth(response)) throw new Error('hết hạn');
    if (!response.ok) throw new Error('Không tải được tệp.');
    const url = URL.createObjectURL(await response.blob());
    objectUrls.set(key, url);
    return url;
  };

  const openLightbox = (html) => {
    const box = document.getElementById('chatLightbox');
    const body = document.getElementById('chatLightboxBody');
    if (!box || !body) return;
    body.innerHTML = html;
    box.hidden = false;
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
  };

  const closeLightbox = () => {
    const box = document.getElementById('chatLightbox');
    const body = document.getElementById('chatLightboxBody');
    if (body) body.replaceChildren();
    if (!box) return;
    box.classList.remove('is-open');
    box.hidden = true;
    box.setAttribute('aria-hidden', 'true');
  };

  const VOUCHER_CODE_RE = /\b((?:HDMH|HDM|HD|DN|PO|DMH|PN|PX)[A-Z0-9]{4,})\b/i;

  const parseVoucherFromDom = (button) => {
    let loai = button?.getAttribute('data-voucher') || '';
    let ma = String(button?.getAttribute('data-ma') || '').trim();
    if (!ma) {
      const context = button?.closest('.chat-turn, .chat-voucher, .chat-bubble');
      const match = String(context?.innerText || '').match(VOUCHER_CODE_RE);
      if (match) ma = match[1].toUpperCase();
    }
    return { loai: inferVoucherLoai(loai, ma), ma };
  };

  const fallbackPrintWindow = (title, ma, extra = '') => {
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(ma)}</title>
      <style>body{font-family:"Be Vietnam Pro",Inter,"Segoe UI",Arial,sans-serif;padding:28px;color:#17382e}h1{font-size:20px}p{color:#5c6b63}</style></head>
      <body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(ma)}</p>${extra}</body></html>`;
    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) {
      openLightbox(`<iframe src="${URL.createObjectURL(new Blob([html], { type: 'text/html' }))}" title="${escapeHtml(title)}"></iframe>`);
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch { /* ignore */ } }, 250);
  };

  const showPrint = async (config) => {
    if (!config) throw new Error('Không có dữ liệu chứng từ để xem.');
    if (window.FLY_PRINT?.show) {
      await window.FLY_PRINT.show(config);
      return true;
    }
    fallbackPrintWindow(config.title || 'Chứng từ', config.number || '');
    return true;
  };

  const moneyVi = (value) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0))} đ`;

  const invoicePrintConfig = (detail, ma) => {
    if (window.FLY_LEDGER_PRINT?.invoice) return window.FLY_LEDGER_PRINT.invoice(detail);
    const inv = detail.invoice || {};
    const paid = (detail.payments || []).filter((item) => item.TrangThai === 'Thành công');
    const fields = [
      { label: 'Thu ngân', value: inv.TenNV },
      { label: 'Ca bán', value: inv.MaCa || '—' },
      { label: 'Khách hàng', value: inv.TenKH || 'Khách vãng lai' },
      { label: 'Điện thoại', value: inv.SDT || 'Không SĐT' }
    ];
    if (paid.length) {
      fields.push({
        label: 'Thanh toán',
        value: paid.map((item) => `${item.PhuongThuc} ${moneyVi(item.SoTien)}`).join(', ')
      });
    }
    return {
      title: 'HÓA ĐƠN BÁN HÀNG',
      number: inv.MaHD || ma,
      documentDate: inv.NgayLap,
      status: inv.TrangThai,
      fields,
      columns: [
        { key: 'TenSP', label: 'Sản phẩm' },
        { key: 'SoLuong', label: 'SL', align: 'right' },
        { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
        { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
      ],
      rows: detail.lines || [],
      totals: [
        { label: 'Tiền hàng', value: inv.TongTienHang, format: 'money' },
        { label: 'Giảm giá', value: inv.TienGiamGia, format: 'money' },
        { label: 'Điểm quy đổi', value: inv.TienDiemQuyDoi, format: 'money' },
        { label: 'Tổng thanh toán', value: inv.TongThanhToan, format: 'money' }
      ],
      note: 'Bản in hóa đơn gốc lúc bán.',
      signatures: ['Thu ngân', 'Khách hàng']
    };
  };

  const fetchJsonQuiet = async (path) => {
    try { return await api(path); }
    catch (error) { return { __error: error.message }; }
  };

  const openPreviewFile = async (maTin, kind) => {
    const url = await fileUrl(maTin);
    if (kind === 'image') openLightbox(`<img src="${url}" alt="Ảnh đính kèm">`);
    else openLightbox(`<iframe src="${url}" title="Bản xem tệp"></iframe>`);
  };

  const printIfReady = async (data, builder) => {
    if (!data || data.__error) return false;
    const config = builder(data);
    if (!config) return false;
    await showPrint(config);
    return true;
  };

  const openVoucher = async (rawLoai, rawMa) => {
    const ma = String(rawMa || '').trim();
    const loai = inferVoucherLoai(rawLoai, ma);
    if (!ma) throw new Error('Chứng từ thiếu mã. Không đọc được số như HD202609100002.');
    closeLightbox();
    const errors = [];

    if (loai === 'HoaDon') {
      const cashier = await fetchJsonQuiet(`/cashier/invoices/${encodeURIComponent(ma)}`);
      const ledger = (cashier.invoice || Array.isArray(cashier.lines))
        ? cashier
        : await fetchJsonQuiet(`/ledger/documents/HoaDon/${encodeURIComponent(ma)}`);
      const detail = (ledger.invoice || Array.isArray(ledger.lines)) ? ledger : null;
      if (detail) {
        await showPrint(invoicePrintConfig(detail, ma));
        return;
      }
      if (cashier.__error) errors.push(cashier.__error);
      if (ledger.__error) errors.push(ledger.__error);
    }

    if (loai === 'DonMuaHang') {
      const data = await fetchJsonQuiet(`/purchasing/purchase-orders/${encodeURIComponent(ma)}`);
      const alt = data.order ? data : await fetchJsonQuiet(`/approvals/purchase-orders/${encodeURIComponent(ma)}`);
      const printed = await printIfReady(alt.order ? alt : null, (item) => ({
        title: 'ĐƠN MUA HÀNG',
        number: item.order.MaPO || ma,
        documentDate: item.order.NgayLap,
        status: item.order.TrangThai,
        fields: [
          { label: 'Nhà cung cấp', value: item.order.TenNCC },
          { label: 'Người lập', value: item.order.NguoiLap }
        ],
        columns: [
          { key: 'TenSP', label: 'Tên mặt hàng' },
          { key: 'SoLuong', label: 'SL', align: 'right' },
          { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' }
        ],
        rows: item.lines || []
      }));
      if (printed) return;
      if (data.__error) errors.push(data.__error);
      if (alt.__error) errors.push(alt.__error);
    }

    if (loai === 'PhieuNhap') {
      const data = await fetchJsonQuiet(`/warehouse/receipts/${encodeURIComponent(ma)}`);
      const printed = await printIfReady(data.receipt ? data : null, (item) => ({
        title: 'PHIẾU NHẬP KHO',
        number: item.receipt.MaPN || ma,
        documentDate: item.receipt.NgayXacNhan || item.receipt.NgayNhap,
        status: item.receipt.TrangThai,
        fields: [
          { label: 'Đơn mua', value: item.receipt.MaPO },
          { label: 'Nhà cung cấp', value: item.receipt.TenNCC }
        ],
        rows: item.lines || []
      }));
      if (printed) return;
      if (data.__error) errors.push(data.__error);
    }

    const meta = await fetchJsonQuiet(`/chat/vouchers/${encodeURIComponent(loai || 'HoaDon')}/${encodeURIComponent(ma)}`);
    if (meta && !meta.__error) {
      await showPrint({
        title: meta.title || VOUCHER_LABEL[loai] || 'CHỨNG TỪ',
        number: meta.ma || ma,
        documentDate: meta.ngay,
        status: meta.trangThai,
        fields: [
          { label: 'Loại', value: VOUCHER_LABEL[meta.loai] || meta.loai || loai },
          { label: 'Mã', value: meta.ma || ma },
          { label: 'Trạng thái', value: meta.trangThai || '—' }
        ]
      });
      return;
    }
    if (meta?.__error) errors.push(meta.__error);
    throw new Error(errors.filter(Boolean)[0] || 'Không mở được chứng từ này.');
  };

  const renderPending = () => {
    const box = document.getElementById('chatPending');
    if (!box) return;
    if (!pendingFile) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    box.innerHTML = `Sẽ gửi: <b>${escapeHtml(pendingFile.name)}</b> <button type="button" id="chatPendingClear">Bỏ</button>`;
    document.getElementById('chatPendingClear')?.addEventListener('click', () => {
      pendingFile = null;
      const input = document.getElementById('chatFileInput');
      if (input) input.value = '';
      renderPending();
    });
  };

  const sortedRooms = () => [...rooms].sort((a, b) => {
    const ia = ROOM_ORDER.indexOf(a.khoa);
    const ib = ROOM_ORDER.indexOf(b.khoa);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  let roomsMarkup = '';
  let threadMarkup = '';

  const renderRooms = () => {
    const nav = document.getElementById('chatRooms');
    if (!nav) return;
    const html = !rooms.length
      ? '<p class="chat-empty">Chưa có phòng.</p>'
      : sortedRooms().map((room) => {
        const meta = roomMeta(room);
        const unread = Number(room.chuaDoc || 0);
        const mark = unread > 1
          ? `<span class="chat-room-badge">${unread > 99 ? '99+' : unread}</span>`
          : unread === 1 ? '<i class="chat-room-dot" aria-hidden="true"></i>' : '';
        const id = escapeHtml(room.maPhong);
        return `<button type="button" class="chat-room${room.maPhong === activeRoom ? ' is-active' : ''}" data-room-id="${id}" data-room="${id}">
        <strong>${escapeHtml(meta.title)}</strong>${mark}
      </button>`;
      }).join('');
    if (html === roomsMarkup) return;
    roomsMarkup = html;
    nav.innerHTML = html;
  };

  const attachmentHtml = (item) => {
    if (item.loaiTin === 'Anh' || item.loaiTin === 'File') {
      const name = item.tenFile || (item.loaiTin === 'Anh' ? 'Ảnh đính kèm' : 'Tệp PDF');
      const kind = item.loaiTin === 'Anh' ? 'image' : 'pdf';
      return `<div class="chat-file">
        <div class="chat-attach-copy">
          <strong>${escapeHtml(name)}</strong>
          <span>${item.loaiTin === 'Anh' ? 'Ảnh đính kèm' : 'Tệp PDF'}</span>
        </div>
        <button type="button" class="chat-xem" data-preview="${escapeHtml(item.maTin)}" data-kind="${kind}">Xem</button>
      </div>`;
    }
    if (item.loaiTin === 'ChungTu') {
      const loai = inferVoucherLoai(item.loaiChungTu, item.maChungTu);
      const ma = item.maChungTu || '';
      return `<div class="chat-voucher">
        <div class="chat-attach-copy">
          <strong>${escapeHtml(VOUCHER_LABEL[loai] || item.noiDung || 'Chứng từ')}</strong>
          <span>${escapeHtml(ma || 'Chưa có mã')}</span>
        </div>
        <button type="button" class="chat-xem" data-voucher="${escapeHtml(loai)}" data-ma="${escapeHtml(ma)}" data-code="${escapeHtml(ma)}">Xem</button>
      </div>`;
    }
    return '';
  };

  const renderThread = () => {
    const root = document.getElementById('chatThread');
    const label = document.getElementById('chatRoomLabel');
    const room = rooms.find((item) => item.maPhong === activeRoom);
    const meta = roomMeta(room);
    if (label) label.textContent = room ? `Tin giữa các bộ phận · ${meta.title}` : 'Tin giữa các bộ phận';
    syncComposer(room);
    if (!root) return;
    let html;
    if (!activeRoom) {
      html = `<div class="chat-empty"><h3>Chat nội bộ</h3><p>Chọn một bộ phận bên trái để bắt đầu.</p></div>`;
    } else if (!messages.length) {
      html = `<div class="chat-empty"><h3>${escapeHtml(meta.title)}</h3><p>Chưa có tin. Viết tin đầu tiên cho bộ phận ${escapeHtml(meta.title)}.</p></div>`;
    } else {
      html = messages.map((item) => {
        const attach = attachmentHtml(item);
        const text = item.loaiTin === 'ChungTu' ? '' : escapeHtml(item.noiDung);
        return `<div class="chat-turn${item.cuaToi ? ' is-mine' : ''}">
        <div class="chat-meta">${escapeHtml(item.tenNVGui)} · ${escapeHtml(clock(item.ngayGui))}</div>
        <div class="chat-bubble">${text}${attach}</div>
      </div>`;
      }).join('');
    }
    if (html !== threadMarkup) {
      threadMarkup = html;
      root.innerHTML = html;
    }
    if (activeRoom && messages.length) root.scrollTop = root.scrollHeight;
  };

  const applyUnread = (data) => {
    const tong = Number(data?.tongChuaDoc || 0);
    setBadge(tong);
    if (!Array.isArray(data?.phong) || !rooms.length) return;
    const map = new Map(data.phong.map((item) => [item.maPhong, item]));
    let dirty = false;
    rooms = rooms.map((room) => {
      const next = map.get(room.maPhong);
      if (!next) return room;
      if (Number(next.chuaDoc || 0) !== Number(room.chuaDoc || 0) || next.tinCuoiAt !== room.tinCuoiAt) {
        dirty = true;
      }
      return { ...room, chuaDoc: next.chuaDoc, tinCuoiAt: next.tinCuoiAt };
    });
    if (dirty) renderRooms();
  };

  const loadUnread = async () => {
    try { applyUnread(await api('/chat/unread')); }
    catch { /* giữ badge cũ */ }
  };

  const loadRooms = async () => {
    const data = await api('/chat/rooms');
    rooms = data.items || [];
    setBadge(rooms.reduce((sum, room) => sum + Number(room.chuaDoc || 0), 0));
    if (activeRoom && !rooms.some((room) => room.maPhong === activeRoom)) activeRoom = '';
    renderRooms();
    const first = sortedRooms()[0];
    if (!activeRoom && first) await openRoom(first.maPhong);
    else renderThread();
  };

  const markRead = async (maPhong, maTin) => {
    if (!maPhong || !maTin) return;
    try { await api(`/chat/rooms/${encodeURIComponent(maPhong)}/read`, { method: 'POST', body: JSON.stringify({ MaTinCuoi: maTin }) }); }
    catch { /* unread sẽ tự sửa lúc poll */ }
  };

  const loadMessages = async (maPhong, { after = 0, silent = false, seq = roomSeq } = {}) => {
    const data = await api(`/chat/rooms/${encodeURIComponent(maPhong)}/messages${after ? `?after=${after}` : ''}`);
    if (seq !== roomSeq || activeRoom !== maPhong) return;
    let changed = !after;
    if (after) {
      const known = new Set(messages.map((item) => item.maTin));
      const incoming = (data.items || []).filter((item) => !known.has(item.maTin));
      if (!incoming.length) {
        const last = messages[messages.length - 1];
        if (isOpen() && last) await markRead(maPhong, last.maTin);
        return;
      }
      messages = [...messages, ...incoming];
      changed = true;
    } else {
      messages = data.items || [];
    }
    if (!silent || changed) renderThread();
    const last = messages[messages.length - 1];
    if (isOpen() && activeRoom === maPhong && last) await markRead(maPhong, last.maTin);
  };

  const openRoom = async (maPhong) => {
    if (!maPhong) return;
    const seq = ++roomSeq;
    activeRoom = maPhong;
    setError('');
    const pop = document.getElementById('chatVoucherPop');
    if (pop) pop.hidden = true;
    renderRooms();
    syncComposer(rooms.find((item) => item.maPhong === maPhong));
    try {
      await loadMessages(maPhong, { seq });
      if (seq !== roomSeq) return;
      await loadUnread();
      document.getElementById('chatInput')?.focus();
    } catch (error) {
      if (seq === roomSeq) setError(error.message || 'Không tải được tin phòng này.');
    }
  };

  const showChatToast = (title, detail) => {
    const toast = document.getElementById('chatToast');
    if (!toast) return;
    document.getElementById('chatToastTitle').textContent = title;
    document.getElementById('chatToastDetail').textContent = detail;
    toast.hidden = false;
    clearTimeout(chatToastTimer);
    chatToastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  };

  const onRemoteMessage = async (maPhong) => {
    const room = rooms.find((item) => item.maPhong === maPhong);
    if (activeRoom === maPhong && isOpen()) {
      const after = messages.length ? messages[messages.length - 1].maTin : 0;
      await loadMessages(maPhong, { after });
      await loadRooms();
      return;
    }
    await loadRooms();
    await loadUnread();
    if (!soundMuted()) {
      showChatToast(roomMeta(room).title, 'Có tin mới. Mở Chat để xem.');
    }
  };

  const sendText = async () => {
    if (sending) return;
    const input = document.getElementById('chatInput');
    const text = String(input?.value || '').trim();
    if (!activeRoom) return setError('Chọn một kênh trước khi gửi.');
    if (!text && !pendingFile) return;
    sending = true;
    setError('');
    try {
      if (pendingFile) {
        const form = new FormData();
        form.append('TepChat', pendingFile);
        if (text) form.append('NoiDung', text);
        const result = await api(`/chat/rooms/${encodeURIComponent(activeRoom)}/files`, { method: 'POST', body: form });
        pendingFile = null;
        renderPending();
        if (result.canhBao) setWarn(result.canhBao);
      } else {
        const result = await api(`/chat/rooms/${encodeURIComponent(activeRoom)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ NoiDung: text })
        });
        if (result.canhBao) setWarn(result.canhBao);
        else setWarn('');
      }
      if (input) input.value = '';
      await loadMessages(activeRoom);
      await loadRooms();
    } catch (error) {
      setError(error.message);
    } finally {
      sending = false;
    }
  };

  const attachVoucher = async (loai, ma) => {
    if (!activeRoom) return setError('Chọn kênh trước khi đính chứng từ.');
    try {
      const result = await api(`/chat/rooms/${encodeURIComponent(activeRoom)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ LoaiChungTu: loai, MaChungTu: ma })
      });
      document.getElementById('chatVoucherPop').hidden = true;
      if (result.canhBao) setWarn(result.canhBao);
      await loadMessages(activeRoom);
      await loadRooms();
    } catch (error) {
      setError(error.message);
    }
  };

  const searchVouchers = async () => {
    const loai = document.getElementById('chatVoucherType')?.value || '';
    const q = document.getElementById('chatVoucherQ')?.value || '';
    const list = document.getElementById('chatVoucherList');
    if (!list) return;
    try {
      const data = await api(`/chat/vouchers?loai=${encodeURIComponent(loai)}&q=${encodeURIComponent(q)}`);
      const items = data.items || [];
      list.innerHTML = items.length
        ? items.map((item) => `<li><button type="button" data-loai="${escapeHtml(item.loai)}" data-ma="${escapeHtml(item.ma)}">${escapeHtml(item.ten)}${item.trangThai ? ` · ${escapeHtml(item.trangThai)}` : ''}</button></li>`).join('')
        : '<li><button type="button" disabled>Không thấy chứng từ phù hợp.</button></li>';
      list.querySelectorAll('button[data-ma]').forEach((button) => {
        button.addEventListener('click', () => attachVoucher(button.dataset.loai, button.dataset.ma));
      });
    } catch (error) {
      list.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
    }
  };

  const stopPoll = () => {
    if (chatTimer) {
      clearInterval(chatTimer);
      chatTimer = 0;
    }
  };

  const startPoll = () => {
    if (chatTimer) return;
    chatTimer = setInterval(async () => {
      await loadUnread();
      if (activeRoom) {
        const after = messages.length ? messages[messages.length - 1].maTin : 0;
        try { await loadMessages(activeRoom, { after, silent: true }); } catch { /* ignore */ }
      }
    }, 4000);
  };

  const markLive = () => {
    chatLive = true;
    chatBackoff = 2000;
    if (chatReadyWatch) {
      clearTimeout(chatReadyWatch);
      chatReadyWatch = 0;
    }
    stopPoll();
  };

  const closeStream = () => {
    if (chatReadyWatch) {
      clearTimeout(chatReadyWatch);
      chatReadyWatch = 0;
    }
    if (chatSource) {
      chatSource.close();
      chatSource = null;
    }
    if (chatAbort) {
      chatAbort.abort();
      chatAbort = null;
    }
  };

  const scheduleReconnect = () => {
    chatLive = false;
    startPoll();
    if (chatReconnect) return;
    const wait = chatBackoff;
    chatBackoff = Math.min(Math.round(chatBackoff * 1.6), 15000);
    chatReconnect = setTimeout(() => {
      chatReconnect = 0;
      connectStream();
    }, wait);
  };

  const consumeFetchStream = async () => {
    chatAbort = new AbortController();
    const response = await fetch(`${API_BASE}/chat/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: chatAbort.signal
    });
    if (handleAuth(response)) return;
    if (!response.ok || !response.body) throw new Error('stream');
    markLive();
    loadUnread();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      for (const block of parts) {
        if (/event:\s*chat/.test(block)) {
          const line = block.split('\n').find((row) => row.startsWith('data:'));
          let maPhong = '';
          try { maPhong = JSON.parse(line.slice(5)).maPhong; } catch { maPhong = ''; }
          await onRemoteMessage(maPhong);
        } else if (/event:\s*(unread|room)/.test(block)) {
          await loadRooms();
        }
      }
    }
    throw new Error('ended');
  };

  const connectStream = () => {
    if (chatReconnect) {
      clearTimeout(chatReconnect);
      chatReconnect = 0;
    }
    closeStream();
    const useFetchStream = () => {
      closeStream();
      consumeFetchStream().catch((error) => {
        if (error?.name === 'AbortError') return;
        scheduleReconnect();
      });
    };
    if (!window.EventSource) {
      useFetchStream();
      return;
    }
    try {
      chatSource = new EventSource(`${API_BASE}/chat/stream?token=${encodeURIComponent(token)}`);
    } catch {
      useFetchStream();
      return;
    }
    const onPing = () => {
      markLive();
      loadUnread();
    };
    chatSource.addEventListener('ready', onPing);
    chatSource.addEventListener('chat', (event) => {
      markLive();
      let maPhong = '';
      try { maPhong = JSON.parse(event.data || '{}').maPhong; } catch { maPhong = ''; }
      onRemoteMessage(maPhong);
    });
    chatSource.addEventListener('unread', () => { markLive(); loadUnread(); });
    chatSource.addEventListener('room', () => { markLive(); loadRooms(); });
    chatSource.onerror = () => {
      if (chatLive && chatSource && chatSource.readyState !== EventSource.CLOSED) return;
      startPoll();
      if (chatSource && chatSource.readyState !== EventSource.CLOSED) return;
      useFetchStream();
    };
    chatReadyWatch = setTimeout(() => {
      if (chatLive) return;
      useFetchStream();
    }, 2500);
  };

  const openDrawer = async () => {
    drawer()?.classList.add('is-open');
    backdrop()?.classList.add('is-open');
    backdrop() && (backdrop().hidden = false);
    syncTriggers(true);
    setError('');
    try {
      await loadRooms();
      if (activeRoom) await loadMessages(activeRoom);
    } catch (error) {
      setError(error.message);
    }
    document.getElementById('chatInput')?.focus();
  };

  const closeDrawer = () => {
    closeLightbox();
    drawer()?.classList.remove('is-open');
    backdrop()?.classList.remove('is-open');
    if (backdrop()) backdrop().hidden = true;
    syncTriggers(false);
    const pop = document.getElementById('chatVoucherPop');
    if (pop) pop.hidden = true;
  };

  const toggleDrawer = () => (isOpen() ? closeDrawer() : openDrawer());

  let lastPanelAction = { key: '', at: 0 };
  const onceAction = (key, run) => {
    const now = Date.now();
    if (lastPanelAction.key === key && now - lastPanelAction.at < 500) return false;
    lastPanelAction = { key, at: now };
    run();
    return true;
  };

  const handlePanelAction = (event) => {
    const panel = drawer();
    if (!panel || !panel.contains(event.target)) return;
    const roomBtn = event.target.closest('[data-room-id], [data-room]');
    if (roomBtn && panel.contains(roomBtn)) {
      event.preventDefault();
      event.stopPropagation();
      const maPhong = roomBtn.getAttribute('data-room-id') || roomBtn.getAttribute('data-room');
      onceAction(`room:${maPhong}`, () => {
        console.debug('[chat]', 'room', maPhong);
        openRoom(maPhong);
      });
      return;
    }
    const xem = event.target.closest('.chat-xem');
    if (xem && panel.contains(xem)) {
      event.preventDefault();
      event.stopPropagation();
      const key = xem.dataset.preview || `${xem.dataset.voucher || ''}:${xem.dataset.ma || ''}`;
      onceAction(`xem:${key}`, async () => {
        try {
          if (xem.dataset.preview) {
            console.debug('[chat]', 'xem', 'file', xem.dataset.preview);
            await openPreviewFile(xem.dataset.preview, xem.dataset.kind);
            return;
          }
          const parsed = parseVoucherFromDom(xem);
          console.debug('[chat]', 'xem', parsed.loai, parsed.ma);
          await openVoucher(parsed.loai, parsed.ma);
        } catch (error) {
          setError(error.message || 'Không xem được chứng từ.');
        }
      });
    }
  };

  const bindPanel = () => {
    const panel = drawer();
    if (!panel || panel.dataset.chatBound === '1') return;
    panel.dataset.chatBound = '1';
    panel.addEventListener('pointerdown', handlePanelAction, true);
    panel.addEventListener('click', handlePanelAction, true);
  };

  document.getElementById('menuInternalChat')?.addEventListener('click', toggleDrawer);
  fab()?.addEventListener('click', toggleDrawer);
  document.getElementById('chatClose')?.addEventListener('click', closeDrawer);
  bindPanel();
  document.getElementById('chatSend')?.addEventListener('click', sendText);
  document.getElementById('chatInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  });
  document.getElementById('chatAttachFile')?.addEventListener('click', () => {
    document.getElementById('chatFileInput')?.click();
  });
  document.getElementById('chatFileInput')?.addEventListener('change', (event) => {
    pendingFile = event.target.files?.[0] || null;
    renderPending();
  });
  document.getElementById('chatAttachVoucher')?.addEventListener('click', () => {
    const pop = document.getElementById('chatVoucherPop');
    if (!pop) return;
    pop.hidden = !pop.hidden;
    if (!pop.hidden) searchVouchers();
  });
  document.getElementById('chatVoucherType')?.addEventListener('change', searchVouchers);
  document.getElementById('chatVoucherQ')?.addEventListener('input', () => {
    clearTimeout(voucherTimer);
    voucherTimer = setTimeout(searchVouchers, 280);
  });
  document.getElementById('chatLightboxClose')?.addEventListener('click', closeLightbox);
  document.getElementById('chatLightbox')?.addEventListener('click', (event) => {
    if (event.target.id === 'chatLightbox') closeLightbox();
  });
  document.getElementById('chatToast')?.addEventListener('click', () => {
    document.getElementById('chatToast').hidden = true;
    openDrawer();
  });

  window.FLY_ESCAPE?.register({ isOpen, close: closeDrawer });
  window.FLY_ESCAPE?.register({
    isOpen: () => document.getElementById('chatLightbox')?.classList.contains('is-open'),
    close: closeLightbox
  });
  closeLightbox();
  syncComposer(null);

  if (token) {
    loadUnread();
    connectStream();
    if (!chatLive) startPoll();
  }
})();
