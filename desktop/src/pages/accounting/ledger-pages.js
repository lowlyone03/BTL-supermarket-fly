(() => {
  const previous = window.FLY_ROLE_PAGES;
  const pages = [
    'ledger-handbook', 'ledger-coa', 'ledger-periods', 'ledger-expenses', 'ledger-journals',
    'ledger-nkc', 'ledger-gl', 'ledger-trial', 'ledger-vat', 'ledger-close',
    'ledger-kqkd', 'ledger-cf', 'ledger-bs', 'ledger-assets', 'ledger-bank'
  ];
  const templates = Object.fromEntries(pages.map(name => [
    name,
    `<section class="warehouse-page ledger-page" data-ledger="${name}" data-keep-native><div class="lg-loading"><strong>Đang tải kế toán</strong>Vui lòng chờ trong giây lát...</div></section>`
  ]));

  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const monthNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date());
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const dateFromDocCode = value => {
    const match = String(value || '').trim().toUpperCase().match(/^[A-Z]+(\d+)/);
    if (!match) return '';
    const num = match[1];
    const ymd = (year, month, day) => {
      if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
      const probe = new Date(Date.UTC(year, month - 1, day));
      if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return '';
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    if (num.length >= 8) {
      const full = ymd(Number(num.slice(0, 4)), Number(num.slice(4, 6)), Number(num.slice(6, 8)));
      if (full) return full;
    }
    if (num.length >= 6) {
      const monthStart = ymd(Number(num.slice(0, 4)), Number(num.slice(4, 6)), 1);
      if (monthStart) return monthStart;
    }
    if (num.length >= 4) {
      const yyMonth = ymd(2000 + Number(num.slice(0, 2)), Number(num.slice(2, 4)), 1);
      if (yyMonth) return yyMonth;
    }
    return '';
  };
  const fmtDate = value => {
    if (window.FLY_VI_DATE?.formatDateVN) return window.FLY_VI_DATE.formatDateVN(value);
    if (!value) return '—';
    const exact = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (exact) return `${exact[3]}/${exact[2]}/${exact[1]}`;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(dt);
  };
  const formatQueueDate = row => {
    const value = row?.NgayPhatSinh || row?.NgayHoaDon || row?.NgayLap || row?.NgayChungTu
      || row?.NgayTiepNhan || dateFromDocCode(row?.MaChungTu);
    return window.FLY_VI_DATE?.formatDateVN ? window.FLY_VI_DATE.formatDateVN(value) : fmtDate(value);
  };
  const monthLabel = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    return match ? `Tháng ${Number(match[2])}/${match[1]}` : String(value || '—');
  };

  const LABELS = {
    Mo: 'Mở', Khoa: 'Khóa', ChuaMo: 'Chưa mở', DeNghiKhoa: 'Đề nghị khóa',
    'Su dung': 'Đang sử dụng', Ngung: 'Ngừng',
    No: 'Nợ', Co: 'Có', LuongTinh: 'Lưỡng tính',
    TS: 'Tài sản', NV: 'Nguồn vốn', DT: 'Doanh thu', CP: 'Chi phí', TT: 'Trung gian',
    Nhap: 'Nháp', DaXacNhan: 'Đã xác nhận', DaHuy: 'Đã hủy',
    DaGhiSo: 'Đã ghi sổ', ChoGhiSo: 'Chờ ghi sổ',
    ThuCong: 'Thủ công', Seeding: 'Số dư đầu kỳ', Engine: 'Hệ thống', TuDong: 'Hệ thống',
    THIEU_THUE: 'Thiếu thuế suất — POS chặn / chưa ghi sổ được',
    PN_CHUA_DOI_CHIEU: 'Phiếu nhập chưa đối chiếu 3 bên',
    KY_KHOA: 'Kỳ đã khóa — chờ ghi sổ trễ',
    THIEU_BAN_HANG: 'Thiếu bút toán Bán hàng / Giá vốn',
    'Thieu BAN_HANG/GIA_VON': 'Thiếu bút toán Bán hàng / Giá vốn',
    THIEU_MUA_HANG: 'Thiếu bút toán Mua hàng',
    'Thieu MUA_HANG': 'Thiếu bút toán Mua hàng',
    THIEU_CHI_PHI: 'Thiếu bút toán Chi phí vận hành',
    HoaDon: 'Hóa đơn bán', HoaDonMuaHang: 'Hóa đơn mua hàng',
    PhieuChi: 'Phiếu chi nhà cung cấp', PhieuNhap: 'Phiếu nhập kho',
    PhieuXuat: 'Phiếu xuất kho', PhieuDoiTra: 'Phiếu đổi trả',
    PhieuThu: 'Phiếu thu cuối ca', PhieuChiLuong: 'Phiếu chi lương',
    ChiPhiVanHanh: 'Phiếu chi phí vận hành', TaiSanCoDinh: 'Thẻ tài sản cố định',
    KyKeToan: 'Kỳ kế toán', KyLuong: 'Kỳ lương', ThuCong: 'Bút toán thủ công',
    KiemKe: 'Kiểm kê', ButToan: 'Bút toán',
    BAN_HANG: 'Bán hàng', GIA_VON: 'Giá vốn', MUA_HANG: 'Mua hàng',
    TRA_NCC: 'Trả nhà cung cấp', TRA_NCC_HANG: 'Trả hàng nhà cung cấp',
    CHI_PHI: 'Chi phí vận hành', CHI_LUONG: 'Chi lương', TRICH_LUONG: 'Trích lương',
    DOI_TRA_HOAN: 'Đổi trả / hoàn tiền', DOI_TRA_NHAP_KHO: 'Đổi trả nhập kho',
    DOI_TRA_GIAO_DOI: 'Đổi trả giao đổi', LECH_QUY: 'Lệch quỹ',
    SODU_DAU_KY: 'Số dư đầu kỳ', KET_CHUYEN: 'Kết chuyển', DAO_KET_CHUYEN: 'Đảo kết chuyển',
    THU_CONG: 'Thủ công', MUA_TSCD: 'Mua TSCĐ', KHAU_HAO: 'Khấu hao',
    KK_THIEU: 'Kiểm kê thiếu', KK_THUA: 'Kiểm kê thừa',
    XUAT_HUY: 'Xuất hủy', XUAT_NOI_BO: 'Xuất nội bộ',
    ChiPhi: 'Chi phí vận hành', TSCD: 'Tài sản cố định',
    DIEN: 'Tiền điện', NUOC: 'Tiền nước', THUE_NHA: 'Thuê mặt bằng',
    VP: 'Văn phòng phẩm', CUOC: 'Cước vận chuyển', QUANG_CAO: 'Quảng cáo',
    SUA_CHUA: 'Sửa chữa nhỏ', KHAC: 'Chi phí khác',
    'Tien dien': 'Tiền điện', 'Tien nuoc': 'Tiền nước', 'Thue mat bang': 'Thuê mặt bằng',
    'Van phong pham': 'Văn phòng phẩm', 'Cuoc van chuyen': 'Cước vận chuyển',
    'Quang cao': 'Quảng cáo', 'Sua chua nho': 'Sửa chữa nhỏ', 'Chi phi khac': 'Chi phí khác',
    'Chua khop': 'Chưa khớp', 'Khop tu dong': 'Khớp tự động',
    'Khop thu cong': 'Khớp thủ công', 'Chenh lech': 'Chênh lệch'
  };

  const ACCOUNT_NAMES = {
    111: 'Tiền mặt',
    112: 'Tiền gửi ngân hàng',
    1331: 'Thuế GTGT được khấu trừ',
    138: 'Phải thu khác (thiếu quỹ ca)',
    156: 'Hàng hóa',
    211: 'TSCĐ hữu hình',
    214: 'Hao mòn TSCĐ',
    331: 'Phải trả người bán',
    33311: 'Thuế GTGT đầu ra',
    334: 'Phải trả người lao động',
    411: 'Vốn chủ sở hữu',
    421: 'Kết quả kinh doanh lũy kế (mini, chưa TNDN)',
    511: 'Doanh thu bán hàng',
    5212: 'Chiết khấu / giảm giá',
    632: 'Giá vốn hàng bán',
    642: 'Chi phí quản lý doanh nghiệp',
    711: 'Thu nhập khác',
    911: 'Xác định kết quả kinh doanh'
  };

  const accountName = (maTK, tenTK) => ACCOUNT_NAMES[String(maTK || '').trim()] || tenTK || maTK || '—';

  const labelOf = value => {
    const raw = String(value ?? '');
    if (!raw) return '—';
    if (LABELS[raw]) return LABELS[raw];
    if (raw.startsWith('DAO_')) {
      const inner = labelOf(raw.slice(4));
      return `Đảo ${inner.charAt(0).toLowerCase()}${inner.slice(1)}`;
    }
    return raw;
  };
  const badgeClass = value => {
    const raw = String(value || '');
    if (['Mo', 'DaGhiSo', 'DaXacNhan', 'Su dung', 'Cân'].includes(raw)) return 'lg-badge-open';
    if (['Khoa', 'DaHuy', 'Ngung', 'Lệch', 'Đã đảo'].includes(raw)) return 'lg-badge-lock';
    if (['Nhap', 'ChuaMo', 'DeNghiKhoa', 'ChoGhiSo', 'THIEU_THUE', 'PN_CHUA_DOI_CHIEU'].includes(raw)) return 'lg-badge-wait';
    return 'lg-badge-muted';
  };
  const badge = (value, text = labelOf(value)) => `<span class="lg-badge ${badgeClass(value)}">${esc(text)}</span>`;

  const api = async (context, path, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const isForm = options.body instanceof FormData;
      const response = await fetch(`${context.apiBase}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${context.token}`,
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
          ...(options.headers || {})
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || `Không xử lý được yêu cầu (${response.status}).`);
        error.status = response.status;
        error.block = data.block;
        error.warn = data.warn;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Hết thời gian chờ. Kiểm tra máy chủ rồi thử lại.');
      throw error;
    } finally { clearTimeout(timer); }
  };

  const catchUi = (context, fn) => async (...args) => {
    try { await fn(...args); }
    catch (error) { context.showToast(error.message, 'error'); }
  };

  const guessDocLoai = (loai, ma) => {
    const kind = String(loai || '').trim();
    const id = String(ma || '').trim();
    if (kind) return kind;
    if (/^HDM/i.test(id)) return 'HoaDonMuaHang';
    if (/^HD/i.test(id)) return 'HoaDon';
    if (/^PCL/i.test(id)) return 'PhieuChiLuong';
    if (/^PC/i.test(id)) return 'PhieuChi';
    if (/^PN/i.test(id)) return 'PhieuNhap';
    if (/^CP/i.test(id)) return 'ChiPhiVanHanh';
    if (/^TS/i.test(id)) return 'TaiSanCoDinh';
    if (/^BT/i.test(id)) return 'ButToan';
    if (/^SK/i.test(id)) return 'SaoKeNganHang';
    if (/^\d{4}-\d{2}$/.test(id)) return 'KyKeToan';
    return kind;
  };

  const expenseName = row => LABELS[row?.MaLoaiCP] || labelOf(row?.TenLoaiCP);
  const canOpenDoc = loai => ['HoaDon', 'HoaDonMuaHang', 'PhieuChi', 'PhieuNhap', 'ChiPhiVanHanh', 'TaiSanCoDinh', 'KyKeToan', 'ButToan', 'SaoKeNganHang'].includes(loai);

  const printH = () => ({ label: labelOf, accountName, expenseName, monthLabel });
  const printLib = () => window.FLY_LEDGER_PRINT;

  const docLink = (loai, ma, text) => {
    const id = String(ma || '').trim();
    if (!id) return '—';
    const kind = guessDocLoai(loai, id);
    const label = esc(text || id);
    if (!canOpenDoc(kind)) return `<strong>${label}</strong>`;
    return `<button type="button" class="lg-doc-link" data-doc-loai="${esc(kind)}" data-doc-ma="${esc(id)}">${label}</button>`;
  };

  const fallbackInvoiceModal = (context, detail) => {
    const inv = detail.invoice || {};
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">HÓA ĐƠN GỐC LÚC BÁN</p><h2>${esc(inv.MaHD)}</h2></div><button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="return-source-card"><div><span>KHÁCH</span><strong>${esc(inv.TenKH || 'Khách vãng lai')}</strong><small>${esc(inv.SDT || 'Không SĐT')}</small></div><div><span>NGÀY BÁN</span><strong>${fmtDate(inv.NgayLap)}</strong></div><div><span>TỔNG LÚC BÁN</span><strong>${money(inv.TongThanhToan)}</strong></div><div><span>TRẠNG THÁI</span><strong>${esc(inv.TrangThai || '—')}</strong></div></div><p class="warehouse-kicker">DÒNG HÀNG LÚC THANH TOÁN</p><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>SL BÁN</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${(detail.lines || []).map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)}</small></td><td class="num">${line.SoLuong}</td><td class="num">${money(line.DonGia)}</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('')}</tbody></table></div></div><div class="warehouse-modal-actions">${inv.TrangThai === 'Hoàn thành' ? '<button type="button" class="warehouse-secondary" data-print-original>In</button>' : ''}<button type="button" class="warehouse-secondary close">Đóng</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-print-original]')?.addEventListener('click', event => {
      const lib = printLib();
      if (lib?.chooseAndShow) return lib.chooseAndShow(lib.invoice(detail), event.currentTarget);
      window.FLY_PRINT?.show({
        title: 'HÓA ĐƠN BÁN HÀNG', number: inv.MaHD, documentDate: inv.NgayLap, status: inv.TrangThai,
        fields: [
          { label: 'Thu ngân', value: inv.TenNV },
          { label: 'Khách hàng', value: inv.TenKH || 'Khách vãng lai' },
          { label: 'Điện thoại', value: inv.SDT || 'Không SĐT' }
        ],
        columns: [
          { key: 'TenSP', label: 'Sản phẩm' }, { key: 'SoLuong', label: 'SL', align: 'right' },
          { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
          { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
        ],
        rows: detail.lines,
        totals: [
          { label: 'Tiền hàng', value: inv.TongTienHang, format: 'money' },
          { label: 'Tổng thanh toán', value: inv.TongThanhToan, format: 'money' }
        ],
        note: 'Bản in hóa đơn gốc lúc bán. Đổi trả sau này in trên phiếu DT riêng.',
        signatures: ['Thu ngân', 'Khách hàng']
      });
    });
  };

  const simpleDocModal = (title, rows, printConfig) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    const printBtn = printConfig && printLib() ? printLib().modalButtonHtml() : '';
    overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">CHỨNG TỪ KẾ TOÁN</p><h2>${esc(title)}</h2></div><button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${v}</strong></div>`).join('')}</div></div><div class="warehouse-modal-actions">${printBtn}<button type="button" class="warehouse-secondary close">Đóng</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    if (printConfig) printLib()?.bindButton(overlay.querySelector('[data-print-doc]'), () => printConfig);
  };

  const fetchExpense = (context, maCP) =>
    api(context, `/ledger/documents/ChiPhiVanHanh/${encodeURIComponent(maCP)}`);

  const postExpenseJournal = async (context, maCP) => {
    const out = await api(context, `/ledger/expenses/${encodeURIComponent(maCP)}/confirm`, { method: 'POST' });
    if (out.queued) {
      throw new Error(out.message || `Không ghi sổ được bút toán CHI_PHI cho ${maCP}.`);
    }
    return out;
  };

  const openExpenseModal = (context, row, { onChanged } = {}) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    const isDraft = row.TrangThai === 'Nhap';
    const needsJournal = row.TrangThai === 'DaXacNhan' && !Number(row.HasJournal);
    const taxRate = row.ThueSuat == null || row.ThueSuat === '' ? '—' : `${Number(row.ThueSuat)}%`;
    const tk = row.MaTKTien ? `${row.MaTKTien} — ${accountName(row.MaTKTien)}` : '—';
    const kyText = row.TenKy || monthLabel(row.MaKy);
    const fields = [
      ['Loại', esc(expenseName(row))],
      ['Ngày chứng từ', esc(fmtDate(row.NgayChungTu))],
      ['Kỳ', esc(kyText)],
      ['Tiền hàng (chưa VAT)', money(row.TienHang)],
      ['Thuế suất', esc(taxRate)],
      ['VAT', money(row.TienThue)],
      ['Tổng cộng', money(row.TongCong)],
      ['TK tiền', esc(tk)],
      ['Trạng thái', badge(row.TrangThai)],
      ['Ghi chú', esc(row.GhiChu || '—')]
    ];
    const help = isDraft
      ? '<p class="lg-help" style="margin-top:14px">Phiếu nháp chưa ghi sổ. Xác nhận mới sinh bút toán chi phí. Hủy nháp nếu lập nhầm. Vẫn in được — bản in đóng dấu NHÁP.</p>'
      : needsJournal
        ? '<p class="lg-help" style="margin-top:14px">Phiếu đã xác nhận nhưng chưa có bút toán CHI_PHI. Bấm <strong>Ghi sổ vào kỳ đang mở</strong> — máy chủ kéo ngày/kỳ về kỳ Mở (ngày cuối kỳ nếu đang ngoài kỳ) rồi sinh bút toán. Không tạo phiếu mới.</p>'
        : '';
    overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHIẾU CHI PHÍ VẬN HÀNH</p><h2>${esc(row.MaCP || '')}</h2></div><button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid">${fields.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${v}</strong></div>`).join('')}</div>${help}</div><div class="warehouse-modal-actions">${printLib()?.modalButtonHtml('data-print-cp') || ''}<button type="button" class="warehouse-secondary close">Đóng</button>${isDraft ? '<button type="button" class="warehouse-danger" data-cancel-cp>Hủy nháp</button><button type="button" class="warehouse-primary" data-confirm-cp>Xác nhận</button>' : ''}${needsJournal ? '<button type="button" class="warehouse-primary" data-repost-cp>Ghi sổ vào kỳ đang mở</button>' : ''}</div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    printLib()?.bindButton(overlay.querySelector('[data-print-cp]'), () => printLib().expense(row, printH()));
    const reopenFresh = async () => {
      close();
      if (typeof onChanged === 'function') await onChanged();
      const data = await fetchExpense(context, row.MaCP);
      openExpenseModal(context, data.expense || { MaCP: row.MaCP }, { onChanged });
    };
    overlay.querySelector('[data-confirm-cp]')?.addEventListener('click', catchUi(context, async event => {
      await busy(event.currentTarget, async () => {
        const out = await postExpenseJournal(context, row.MaCP);
        context.showToast(out.message, 'success');
        await reopenFresh();
      });
    }));
    overlay.querySelector('[data-repost-cp]')?.addEventListener('click', catchUi(context, async event => {
      await busy(event.currentTarget, async () => {
        const out = await postExpenseJournal(context, row.MaCP);
        context.showToast(out.message, 'success');
        await reopenFresh();
      });
    }));
    overlay.querySelector('[data-cancel-cp]')?.addEventListener('click', catchUi(context, async event => {
      if (!window.confirm(`Hủy phiếu nháp ${row.MaCP}? Phiếu sẽ thành Đã hủy và không sinh bút toán.`)) return;
      await busy(event.currentTarget, async () => {
        const out = await api(context, `/ledger/expenses/${encodeURIComponent(row.MaCP)}/cancel`, { method: 'POST' });
        context.showToast(out.message, 'success');
        close();
        if (typeof onChanged === 'function') await onChanged();
      });
    }));
  };

  const openJournalModal = async (context, maBT) => {
    const data = await api(context, `/ledger/journals/${encodeURIComponent(maBT)}`);
    const row = data.journal || {};
    const lines = data.lines || [];
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    const fields = [
      ['Ngày hạch toán', esc(fmtDate(row.NgayHachToan))],
      ['Chứng từ', `${esc(labelOf(row.LoaiChungTu))} ${docLink(row.LoaiChungTu, row.MaChungTu)}`],
      ['Loại bút toán', esc(labelOf(row.LoaiButToan))],
      ['Nguồn', row.DaBiDao ? badge('Khoa', 'Đã đảo') : badge(row.Nguon || 'DaGhiSo')],
      ['Người lập', esc(row.TenNV || '—')],
      ['Tổng Nợ', money(row.TongNo)],
      ['Tổng Có', money(row.TongCo)],
      ['Diễn giải', esc(row.DienGiai || '—')]
    ];
    const body = lines.map(line => {
      const side = postingSide(line);
      return `<tr class="${side ? `lg-dk-${side}-row` : ''}">
      <td><span class="lg-dk-side">${side === 'no' ? 'Nợ' : side === 'co' ? 'Có' : '—'}</span></td>
      <td><strong class="hb-tk">${esc(line.MaTK)}</strong></td>
      <td>${esc(accountName(line.MaTK, line.TenTK))}</td>
      <td class="num">${money(line.SoTienNo)}</td>
      <td class="num">${money(line.SoTienCo)}</td>
      <td>${esc(line.DienGiaiDong || row.DienGiai || '—')}</td>
    </tr>`;
    }).join('');
    overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">BÚT TOÁN</p><h2>${esc(row.MaBT || maBT)}</h2></div><button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid">${fields.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${v}</strong></div>`).join('')}</div><div class="lg-dinh-khoan-card"><p class="lg-kicker">Định khoản</p>${dinhKhoanHtml(lines)}</div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>BÊN</th><th>TK</th><th>TÊN TK</th><th>NỢ</th><th>CÓ</th><th>DIỄN GIẢI</th></tr></thead><tbody>${body || '<tr><td colspan="6">Không có dòng hạch toán.</td></tr>'}</tbody></table></div></div><div class="warehouse-modal-actions">${printLib()?.modalButtonHtml('data-print-bt') || ''}<button type="button" class="warehouse-secondary close">Đóng</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    bindDocLinks(overlay, context);
    printLib()?.bindButton(overlay.querySelector('[data-print-bt]'), () => printLib().journal(row, lines, printH()));
  };

  const openStatementModal = async (context, maSaoKe) => {
    const data = await api(context, `/ledger/bank-statements/${encodeURIComponent(maSaoKe)}`);
    const header = data.statement || {};
    const lines = data.lines || [];
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    const fields = [
      ['Mã TKNH', esc(header.MaTKNH || '—')],
      ['Từ ngày', esc(fmtDate(header.TuNgay))],
      ['Đến ngày', esc(fmtDate(header.DenNgay))],
      ['Tệp', esc(header.TenFile || '—')]
    ];
    const body = lines.map(line => `<tr>
      <td>${esc(fmtDate(line.NgayGD))}</td>
      <td>${esc(line.DienGiai || '—')}</td>
      <td>${esc(line.MaGiaoDich || '—')}</td>
      <td class="num">${money(line.PhatSinhNo)}</td>
      <td class="num">${money(line.PhatSinhCo)}</td>
      <td>${badge(line.TrangThaiKhop)}</td>
      <td>${esc([labelOf(line.LoaiChungTuKhop), line.MaChungTuKhop].filter(Boolean).join(' ') || '—')}</td>
    </tr>`).join('');
    overlay.innerHTML = `<div class="warehouse-modal receipt-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">SAO KÊ NGÂN HÀNG</p><h2>${esc(header.MaSaoKe || maSaoKe)}</h2></div><button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button></div><div class="warehouse-modal-body"><div class="warehouse-detail-grid">${fields.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${v}</strong></div>`).join('')}</div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY GD</th><th>DIỄN GIẢI</th><th>MÃ GD</th><th>NỢ</th><th>CÓ</th><th>KHỚP</th><th>CHỨNG TỪ</th></tr></thead><tbody>${body || '<tr><td colspan="7">Không có dòng giao dịch.</td></tr>'}</tbody></table></div></div><div class="warehouse-modal-actions">${printLib()?.modalButtonHtml('data-print-sk') || ''}<button type="button" class="warehouse-secondary" data-auto-match>Khớp tự động</button><button type="button" class="warehouse-secondary close">Đóng</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    printLib()?.bindButton(overlay.querySelector('[data-print-sk]'), () => printLib().statement(header, lines, printH()));
    overlay.querySelector('[data-auto-match]')?.addEventListener('click', catchUi(context, async event => {
      await busy(event.currentTarget, async () => {
        const out = await api(context, `/ledger/bank-statements/${encodeURIComponent(maSaoKe)}/auto-match`, { method: 'POST' });
        context.showToast(out.message, 'success');
        close();
        await openStatementModal(context, maSaoKe);
      });
    }));
  };

  const openLedgerDocument = async (context, loai, ma, onChanged) => {
    const id = String(ma || '').trim();
    const kind = guessDocLoai(loai, id);
    if (!id) return context.showToast('Chưa có mã chứng từ để mở.', 'error');
    if (kind === 'HoaDon') {
      const detail = await api(context, `/ledger/documents/HoaDon/${encodeURIComponent(id)}`);
      if (window.FLY_SALES_INVOICE?.open) {
        window.FLY_SALES_INVOICE.open(context, detail, { readOnly: true });
        return;
      }
      fallbackInvoiceModal(context, detail);
      return;
    }
    if (kind === 'HoaDonMuaHang') {
      if (!window.FLY_ACC_DOCS?.open) throw new Error('Chưa tải được màn hình hóa đơn mua hàng.');
      return window.FLY_ACC_DOCS.open(context, 'invoice', id);
    }
    if (kind === 'PhieuChi') {
      if (!window.FLY_ACC_DOCS?.open) throw new Error('Chưa tải được màn hình phiếu chi.');
      return window.FLY_ACC_DOCS.open(context, 'pc', id);
    }
    if (kind === 'PhieuNhap') {
      if (!window.FLY_ACC_DOCS?.open) throw new Error('Chưa tải được màn hình phiếu nhập.');
      return window.FLY_ACC_DOCS.open(context, 'pn', id);
    }
    if (kind === 'ChiPhiVanHanh') {
      let data = await fetchExpense(context, id);
      let expense = data.expense || { MaCP: id };
      if (expense.TrangThai === 'DaXacNhan' && !Number(expense.HasJournal)) {
        try {
          const out = await postExpenseJournal(context, id);
          context.showToast(out.message, 'success');
          if (typeof onChanged === 'function') await onChanged();
          data = await fetchExpense(context, id);
          expense = data.expense || out.expense || expense;
        } catch (error) {
          context.showToast(error.message, 'error');
        }
      }
      openExpenseModal(context, expense, { onChanged });
      return;
    }
    if (kind === 'TaiSanCoDinh') {
      const data = await api(context, `/ledger/documents/TaiSanCoDinh/${encodeURIComponent(id)}`);
      const row = data.asset || {};
      simpleDocModal(`Thẻ TSCĐ ${row.MaTSCD || id}`, [
        ['Tên', esc(row.TenTSCD || '—')],
        ['Ngày mua', esc(fmtDate(row.NgayMua))],
        ['Ngày đưa vào SD', esc(fmtDate(row.NgayDuaVaoSD))],
        ['Nguyên giá', money(row.NguyenGia)],
        ['VAT', money(row.TienThue)],
        ['TK tiền', esc(row.MaTKTien ? `${row.MaTKTien} — ${accountName(row.MaTKTien)}` : '—')],
        ['Số tháng KH', esc(row.SoThangKH || '—')],
        ['Trạng thái', badge(row.TrangThai)]
      ], printLib()?.asset(row, printH()));
      return;
    }
    if (kind === 'KyKeToan' || kind === 'SoDuDauKy') {
      if (typeof context.navigate === 'function') context.navigate('ledger-periods');
      context.showToast(`Kỳ kế toán ${id}`, 'info');
      return;
    }
    if (kind === 'ButToan' || kind === 'ThuCong') {
      await openJournalModal(context, id);
      return;
    }
    if (kind === 'ChoGhiSo') {
      if (typeof context.navigate === 'function') context.navigate('ledger-journals');
      context.showToast(`${labelOf(kind)} ${id}`, 'info');
      return;
    }
    if (kind === 'SaoKeNganHang') {
      await openStatementModal(context, id);
      return;
    }
    if (kind === 'TaiKhoanNganHang') {
      if (typeof context.navigate === 'function') context.navigate('ledger-bank');
      return;
    }
    if (kind === 'TaiKhoanKeToan') {
      if (typeof context.navigate === 'function') context.navigate('ledger-coa');
      return;
    }
    throw new Error(`Chưa có màn hình chi tiết cho ${labelOf(kind)} ${id}.`);
  };

  const bindDocLinks = (scope, context, onChanged) => {
    scope.querySelectorAll('[data-doc-ma]').forEach(button => {
      button.addEventListener('click', catchUi(context, () => openLedgerDocument(context, button.dataset.docLoai, button.dataset.docMa, onChanged)));
    });
  };

  const busy = async (button, work) => {
    if (!button) return work();
    const prev = button.textContent;
    button.disabled = true;
    try { return await work(); }
    finally {
      button.disabled = false;
      button.textContent = prev;
    }
  };

  const header = (title, lead, extra = '') => `
    <header class="lg-header">
      <div>
        <p class="lg-kicker">Kế toán</p>
        <h1>${esc(title)}</h1>
        <p class="lg-lead">${esc(lead)}</p>
      </div>
      ${extra}
    </header>`;

  const periodChip = (period) => {
    if (!period) {
      return `<aside class="lg-period-chip"><small>Kỳ hiện tại</small><strong>Chưa có kỳ</strong></aside>`;
    }
    return `<aside class="lg-period-chip"><small>Kỳ hiện tại</small><strong>${esc(monthLabel(period.MaKy))}</strong><div style="margin-top:8px">${badge(period.TrangThai)}</div></aside>`;
  };

  const loadOpenPeriod = async (context) => {
    try {
      const data = await api(context, '/ledger/periods');
      const items = data.items || [];
      return items.find(row => row.TrangThai === 'Mo') || null;
    } catch {
      return null;
    }
  };

  const isoDay = value => {
    if (window.FLY_VI_DATE?.dateKeyVN) return window.FLY_VI_DATE.dateKeyVN(value) || '';
    if (!value) return '';
    const exact = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (exact) return `${exact[1]}-${exact[2]}-${exact[3]}`;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  };

  const dateInOpenPeriod = (period) => {
    if (!period) return todayISO();
    const tu = isoDay(period.TuNgay);
    const den = isoDay(period.DenNgay);
    const today = todayISO();
    if (tu && today < tu) return tu;
    if (den && today > den) return den;
    if (tu && den && today >= tu && today <= den) return today;
    return den || today;
  };

  const bindOpenPeriodDate = (input, period) => {
    if (!input) return dateInOpenPeriod(period);
    const tu = isoDay(period?.TuNgay);
    const den = isoDay(period?.DenNgay);
    if (tu) input.min = tu;
    if (den) input.max = den;
    const value = dateInOpenPeriod(period);
    input.value = value;
    return value;
  };

  const assertDateInOpenPeriod = (value, period) => {
    if (!period) return 'Chưa có kỳ đang mở. Mở kỳ kế toán trước khi lập chứng từ.';
    const ngay = isoDay(value);
    const tu = isoDay(period.TuNgay);
    const den = isoDay(period.DenNgay);
    if (!ngay || !tu || !den || ngay < tu || ngay > den) {
      return `Ngày ngoài kỳ đang mở (${monthLabel(period.MaKy)}). Chỉ nhận ${fmtDate(tu)} – ${fmtDate(den)}.`;
    }
    return '';
  };

  const emptyRow = (cols, title, detail) =>
    `<tr><td colspan="${cols}"><div class="lg-empty"><strong>${esc(title)}</strong>${esc(detail)}</div></td></tr>`;

  const table = (headers, rows, { emptyTitle = 'Chưa có dữ liệu', emptyDetail = 'Chưa phát sinh số liệu trên màn này.', cols, tableClass = '' } = {}) => {
    const count = cols || headers.length;
    return `<div class="lg-table-wrap"><table class="lg-table${tableClass ? ` ${esc(tableClass)}` : ''}"><thead><tr>${headers.map(h => {
      const obj = typeof h === 'object' && h;
      const cls = [obj && obj.num ? 'lg-num' : '', obj && obj.className ? obj.className : ''].filter(Boolean).join(' ');
      return `<th${cls ? ` class="${esc(cls)}"` : ''}>${esc(obj ? obj.text : h)}</th>`;
    }).join('')}</tr></thead>
    <tbody>${rows || emptyRow(count, emptyTitle, emptyDetail)}</tbody></table></div>`;
  };

  const postingSide = line => Number(line?.SoTienNo) > 0 ? 'no' : (Number(line?.SoTienCo) > 0 ? 'co' : '');

  const dinhKhoanHtml = (lines = [], { amount = true } = {}) => {
    const items = (Array.isArray(lines) ? lines : []).filter(line => postingSide(line));
    if (!items.length) return '<span class="lg-muted">Chưa có dòng hạch toán</span>';
    return `<div class="lg-dinh-khoan${amount ? '' : ' is-compact'}">${items.map(line => {
      const side = postingSide(line);
      const amt = side === 'no' ? line.SoTienNo : line.SoTienCo;
      const ten = accountName(line.MaTK, line.TenTK);
      return `<div class="lg-dk-line lg-dk-${side}">
        <span class="lg-dk-side">${side === 'no' ? 'Nợ' : 'Có'}</span>
        <span class="lg-dk-tk">${esc(line.MaTK)}</span>
        <span class="lg-dk-name" title="${esc(ten)}">${esc(ten)}</span>
        ${amount ? `<strong class="lg-dk-amt">${money(amt)}</strong>` : ''}
      </div>`;
    }).join('')}</div>`;
  };

  const loadingBox = (text = 'Đang tải dữ liệu kế toán...') =>
    `<div class="lg-loading"><strong>Đang tải</strong>${esc(text)}</div>`;

  const errorBox = message =>
    `<div class="lg-error-box"><strong>Không tải được màn kế toán</strong>${esc(message)}</div>`;

  const periodWatermark = async (context, maKy) => {
    try {
      const data = await api(context, '/ledger/periods');
      const row = (data.items || []).find(item => item.MaKy === maKy);
      return !row || row.TrangThai !== 'Khoa';
    } catch {
      return true;
    }
  };

  const paper = ({ title, period, watermark, meta = '', body }) => `
    <article class="lg-paper">
      ${watermark ? '<div class="lg-watermark">Số liệu tạm tính</div>' : ''}
      <div class="lg-paper-head">
        <div>
          <p class="lg-kicker">Báo cáo kế toán mini</p>
          <h2>${esc(title)}</h2>
          <p>${esc(period ? `Kỳ ${monthLabel(period.period || period.label || period.MaKy || period)}` : 'Chưa chọn kỳ')}</p>
        </div>
        <div class="lg-paper-meta">${meta}${watermark ? '<div>Đóng dấu: Số liệu tạm tính — kỳ chưa khóa</div>' : '<div>Kỳ đã khóa — số liệu chính thức</div>'}</div>
      </div>
      ${body}
    </article>`;

  const isBar = (line, ch) => {
    const t = String(line || '').trim();
    return t.length >= 8 && [...t].every(c => c === ch);
  };

  const SECTION_HEAD = /^(\d+[A-Z]?)\.\s+(.+)$/;
  const SUBSECTION_HEAD = /^(\d+[A-Z]?)\.(\d+)\.\s+(.+)$/;
  const BT_CODE_RE = /\b(BAN_HANG|GIA_VON|MUA_HANG|TRA_NCC_HANG|TRA_NCC|CHI_PHI|TRICH_LUONG|CHI_LUONG|LECH_QUY|MUA_TSCD|KHAU_HAO|DOI_TRA_HOAN|DOI_TRA_NHAP_KHO|DOI_TRA_GIAO_DOI|KK_THIEU|KK_THUA|XUAT_HUY|XUAT_NOI_BO|THU_CONG|KET_CHUYEN|SODU_DAU_KY|DAO_[A-Z0-9_]+)\b/g;

  const parseHandbook = raw => {
    const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const atSection = idx => isBar(lines[idx], '=')
      && /^\s*\d+[A-Z]?\.\s+\S/.test(lines[idx + 1] || '')
      && isBar(lines[idx + 2], '=');
    let i = 0;
    const introLines = [];
    while (i < lines.length && !atSection(i)) {
      introLines.push(lines[i]);
      i += 1;
    }
    const introJoined = introLines.join('\n');
    const tocAt = introJoined.search(/\n-{8,}\s*\nMỤC LỤC\s*\n-{8,}/);
    const intro = (tocAt >= 0 ? introJoined.slice(0, tocAt) : introJoined).trim();
    const sections = [];
    while (i < lines.length) {
      if (!atSection(i)) {
        i += 1;
        continue;
      }
      const titleLine = lines[i + 1].trim();
      const match = titleLine.match(SECTION_HEAD);
      if (!match) {
        i += 3;
        continue;
      }
      const num = match[1];
      const title = match[2].trim();
      i += 3;
      const body = [];
      while (i < lines.length && !atSection(i)) {
        const t = (lines[i] || '').trim();
        if (t === 'HẾT TÀI LIỆU.' || t.startsWith('HẾT TÀI LIỆU')) break;
        body.push(lines[i]);
        i += 1;
      }
      sections.push({
        id: `hb-s${num}`,
        num,
        title,
        body,
        featured: /^3A$/i.test(num) || /^hạch toán/i.test(title) || /đối soát ngân hàng/i.test(title)
      });
    }
    return { intro, sections };
  };

  const isMetaFact = t => /:\s+\S/.test(t) && t.length > 20;
  const isCalloutLead = t => /^\[(CHOT|VI_DU|CANH_BAO|LUU_Y|KHONG|BLOCK|WARN)\]/i.test(t)
    || /^(CHỐT|CẢNH BÁO|VÍ DỤ|LƯU Ý|BLOCK|WARN|Cảnh báo|Lưu ý|Ví dụ)\b/.test(t)
    || /^KHÔNG\s/.test(t);
  const isTermHead = t => t.length <= 56
    && !/[.!?]$/.test(t)
    && !isMetaFact(t)
    && !/^[-•]/.test(t)
    && !/^(Nợ|Có)\s/.test(t)
    && !/^Q\d+\./i.test(t)
    && !SUBSECTION_HEAD.test(t)
    && !/^\d+[A-Z]?\.\s/.test(t)
    && !t.includes('|')
    && !/^Bước\s+/i.test(t)
    && !/^-----/.test(t)
    && !/^→/.test(t)
    && !/^=+$/.test(t)
    && !isCalloutLead(t);

  const CALLOUT_META = {
    CHOT: { cls: 'hb-callout-chot', label: 'Chốt' },
    VI_DU: { cls: 'hb-callout-vidu', label: 'Ví dụ' },
    CANH_BAO: { cls: 'hb-callout-alert', label: 'Cảnh báo' },
    LUU_Y: { cls: 'hb-callout-note', label: 'Lưu ý' },
    KHONG: { cls: 'hb-callout-ban', label: 'Không' },
    BLOCK: { cls: 'hb-callout-block', label: 'BLOCK' },
    WARN: { cls: 'hb-callout-warn', label: 'WARN' }
  };

  const parseCallout = t => {
    const mark = t.match(/^\[(CHOT|VI_DU|CANH_BAO|LUU_Y|KHONG|BLOCK|WARN)\]\s*(.*)$/i);
    if (mark) return { kind: mark[1].toUpperCase(), rest: (mark[2] || '').trim() };
    if (/^KHÔNG\s/.test(t)) return { kind: 'KHONG', rest: t };
    const pref = t.match(/^(CHỐT|CẢNH BÁO|VÍ DỤ|LƯU Ý|BLOCK|WARN|Cảnh báo|Lưu ý|Ví dụ)\b(?:\s*[—–:\-]\s*|\s+)?(.*)$/);
    if (!pref) return null;
    const lead = pref[1];
    const kind = /chốt/i.test(lead) ? 'CHOT'
      : /cảnh báo/i.test(lead) ? 'CANH_BAO'
        : /ví dụ/i.test(lead) ? 'VI_DU'
          : /lưu ý/i.test(lead) ? 'LUU_Y'
            : lead.toUpperCase() === 'BLOCK' ? 'BLOCK'
              : lead.toUpperCase() === 'WARN' ? 'WARN'
                : 'LUU_Y';
    return { kind, rest: (pref[2] || '').trim() || t };
  };

  const applyOutsideTags = (html, re, fn) => {
    let skip = false;
    return html.split(/(<[^>]+>)/).map(part => {
      if (part.startsWith('<')) {
        if (/^<(span|strong|mark)\b/i.test(part)) skip = true;
        if (/^<\//.test(part)) skip = false;
        return part;
      }
      if (skip) return part;
      return part.replace(re, fn);
    }).join('');
  };

  const richInline = raw => {
    let html = esc(raw);
    html = applyOutsideTags(html, /(\d{1,3}(?:\.\d{3})+)(đ)?/g, (_, n, d) => `<strong class="hb-money">${n}${d || ''}</strong>`);
    const codes = Object.keys(ACCOUNT_NAMES).sort((a, b) => b.length - a.length).join('|');
    html = applyOutsideTags(html, new RegExp(`\\b(${codes})\\b`, 'g'), m => `<span class="hb-tk">${m}</span>`);
    html = applyOutsideTags(html, BT_CODE_RE, m => `<span class="hb-bt">${m}</span>`);
    const chips = [
      [/chờ ghi sổ/gi, 'hb-term-wait'],
      [/ghi sổ trễ/gi, 'hb-term-wait'],
      [/số liệu tạm tính/gi, 'hb-term-temp'],
      [/tạm tính/gi, 'hb-term-temp'],
      [/chốt số dư/gi, 'hb-term-ok'],
      [/đã chốt/gi, 'hb-term-ok'],
      [/\bNULL\b/g, 'hb-term-null'],
      [/\b0%/g, 'hb-term-ok']
    ];
    chips.forEach(([re, cls]) => {
      html = applyOutsideTags(html, re, m => `<span class="hb-term-chip ${cls}">${m}</span>`);
    });
    html = applyOutsideTags(html, /chốt/gi, m => `<span class="hb-term-chip hb-term-ok">${m}</span>`);
    return html;
  };

  const isJournalLine = t => /^(Nợ|Có)\s/.test(t) || /^→/.test(t);

  const renderJournalLine = t => {
    const m = t.match(/^(Nợ|Có)\s+(\d{3,5})\s+(?:([\d.]{3,})\s*)?(.*)$/);
    if (!m) return `<div class="hb-journal-line">${richInline(t)}</div>`;
    const tk = m[2];
    const ten = ACCOUNT_NAMES[tk] || '';
    const note = (m[4] || '').trim();
    const noteHasName = ten && note.toLocaleLowerCase('vi-VN').includes(ten.toLocaleLowerCase('vi-VN'));
    return `<div class="hb-journal-line"><span class="hb-dc hb-dc-${m[1] === 'Nợ' ? 'no' : 'co'}">${esc(m[1])}</span><span class="hb-tk">${esc(tk)}</span>${ten && !noteHasName ? `<span class="hb-tk-name">${esc(ten)}</span>` : ''}${m[3] ? `<strong class="hb-money">${esc(m[3])}</strong>` : ''}${note ? `<span class="hb-jnote">${richInline(note)}</span>` : ''}</div>`;
  };

  const splitPipeRow = t => {
    const raw = String(t || '').trim().replace(/^\|/, '').replace(/\|$/, '');
    return raw.split('|').map(cell => cell.trim());
  };
  const isPipeRow = t => {
    const s = String(t || '').trim();
    if ((s.match(/\|/g) || []).length < 2) return false;
    if (/^\[(CHOT|VI_DU|CANH_BAO|LUU_Y|KHONG|BLOCK|WARN)\]/i.test(s)) return false;
    if (/^(Nợ|Có)\s/.test(s)) return false;
    return true;
  };
  const isPipeSep = cells => cells.length > 0 && cells.every(cell => /^[-:]+$/.test(cell) || cell === '');
  const renderPipeTable = matrix => {
    if (!matrix.length) return '';
    const head = matrix[0];
    const banIdx = head.findIndex(cell => /không được/i.test(cell));
    const body = matrix.slice(1);
    const th = head.map(cell => `<th>${richInline(cell)}</th>`).join('');
    const tr = body.map(row => {
      const td = row.map((cell, idx) => `<td${idx === banIdx ? ' class="hb-td-ban"' : ''}>${richInline(cell)}</td>`).join('');
      return `<tr>${td}</tr>`;
    }).join('');
    return `<div class="hb-table-wrap"><table class="hb-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  };

  const renderCallout = (kind, inner) => {
    const meta = CALLOUT_META[kind] || CALLOUT_META.LUU_Y;
    return `<aside class="hb-callout ${meta.cls}"><span class="hb-callout-label">${meta.label}</span><div class="hb-callout-body">${inner}</div></aside>`;
  };

  const renderHandbookLines = (lines, sectionId) => {
    const html = [];
    let para = [];
    let list = [];
    let steps = [];
    let journals = [];
    let subIdx = 0;
    const flushPara = () => {
      if (!para.length) return;
      html.push(`<p>${richInline(para.join(' '))}</p>`);
      para = [];
    };
    const flushList = () => {
      if (!list.length) return;
      html.push(`<ul>${list.map(item => `<li>${richInline(item)}</li>`).join('')}</ul>`);
      list = [];
    };
    const flushSteps = () => {
      if (!steps.length) return;
      html.push(`<ol class="hb-steps">${steps.map(step => `<li><span class="hb-step-n">${esc(step.n)}</span><div>${richInline(step.text)}</div></li>`).join('')}</ol>`);
      steps = [];
    };
    const flushJournals = () => {
      if (!journals.length) return;
      html.push(`<div class="hb-journal-block">${journals.map(renderJournalLine).join('')}</div>`);
      journals = [];
    };
    const flushAll = () => {
      flushPara();
      flushList();
      flushSteps();
      flushJournals();
    };

    const rows = lines.map(line => String(line || '').replace(/\s+$/, ''));
    for (let i = 0; i < rows.length; i += 1) {
      const t = rows[i].trim();
      if (!t || /^[=-]{8,}$/.test(t)) {
        flushAll();
        continue;
      }
      const sub = t.match(SUBSECTION_HEAD);
      if (sub) {
        flushAll();
        subIdx = Number(sub[2]);
        html.push(`<h3 id="${sectionId}-${sub[2]}">${esc(t)}</h3>`);
        continue;
      }
      if (isPipeRow(t)) {
        const matrix = [];
        let j = i;
        while (j < rows.length && isPipeRow(rows[j].trim())) {
          const cells = splitPipeRow(rows[j].trim());
          if (!isPipeSep(cells)) matrix.push(cells);
          j += 1;
        }
        if (matrix.length >= 2) {
          flushAll();
          i = j - 1;
          html.push(renderPipeTable(matrix));
          continue;
        }
      }
      const band = t.match(/^-----\s*(.+?)\s*-----(?:\s+(.*))?$/);
      if (band) {
        flushAll();
        subIdx += 1;
        const extra = band[2] ? ` <small>${esc(band[2].trim())}</small>` : '';
        html.push(`<h3 id="${sectionId}-b${subIdx}" class="hb-band">${esc(band[1].trim())}${extra}</h3>`);
        continue;
      }
      if (/^Q\d+\./i.test(t)) {
        flushAll();
        subIdx += 1;
        html.push(`<h3 id="${sectionId}-q${subIdx}" class="hb-faq">${esc(t)}</h3>`);
        continue;
      }
      const stepHead = t.match(/^Bước\s+([A-Z0-9]+)\s*[—–\-]\s*(.+)$/i);
      if (stepHead) {
        flushAll();
        html.push(`<p class="hb-step-head"><span class="hb-step-pill">Bước ${esc(stepHead[1])}</span><strong>${esc(stepHead[2].trim())}</strong></p>`);
        continue;
      }
      const callout = parseCallout(t);
      if (callout) {
        flushAll();
        const bits = [];
        if (callout.rest) bits.push(`<p>${richInline(callout.rest)}</p>`);
        const takeBody = !callout.rest;
        while (i + 1 < rows.length) {
          const nxt = rows[i + 1].trim();
          if (!nxt) break;
          if (/^\[(CHOT|VI_DU|CANH_BAO|LUU_Y|KHONG|BLOCK|WARN)\]/i.test(nxt)
            || /^(CHỐT|CẢNH BÁO|VÍ DỤ|LƯU Ý|BLOCK|WARN|Cảnh báo|Lưu ý|Ví dụ)\b/.test(nxt)
            || SUBSECTION_HEAD.test(nxt) || /^Q\d+\./i.test(nxt) || /^-----\s*/.test(nxt) || /^Bước\s+/i.test(nxt)
            || isPipeRow(nxt)) break;
          const canTake = isJournalLine(nxt) || (takeBody && !isTermHead(nxt));
          if (!canTake) break;
          i += 1;
          if (isJournalLine(nxt)) {
            const pack = [nxt];
            while (i + 1 < rows.length && isJournalLine(rows[i + 1].trim())) {
              i += 1;
              pack.push(rows[i].trim());
            }
            bits.push(`<div class="hb-journal-block">${pack.map(renderJournalLine).join('')}</div>`);
          } else if (/^[-•]\s+/.test(nxt)) {
            bits.push(`<ul><li>${richInline(nxt.replace(/^[-•]\s+/, ''))}</li></ul>`);
          } else if (/^\d+\.\s+/.test(nxt)) {
            const num = nxt.match(/^(\d+)\.\s+(.+)$/);
            bits.push(`<p class="hb-step-inline"><span class="hb-step-n">${esc(num[1])}</span><span>${richInline(num[2])}</span></p>`);
          } else {
            bits.push(`<p>${richInline(nxt)}</p>`);
          }
        }
        html.push(renderCallout(callout.kind, bits.join('') || `<p>${richInline(t)}</p>`));
        continue;
      }
      if (isTermHead(t)) {
        flushAll();
        html.push(`<h4 class="hb-term">${richInline(t)}</h4>`);
        continue;
      }
      const meta = t.match(/^(.+?)\s{2,}:\s+(.+)$/);
      if (meta) {
        flushAll();
        html.push(`<div class="hb-meta"><span>${esc(meta[1].trim())}</span><strong>${richInline(meta[2].trim())}</strong></div>`);
        continue;
      }
      if (/^[-•]\s+/.test(t)) {
        flushPara();
        flushSteps();
        flushJournals();
        list.push(t.replace(/^[-•]\s+/, ''));
        continue;
      }
      const numbered = t.match(/^(\d+)\.\s+(.+)$/);
      if (numbered && !/^\d+\.\d+\./.test(t)) {
        flushPara();
        flushList();
        flushJournals();
        steps.push({ n: numbered[1], text: numbered[2] });
        continue;
      }
      if (isJournalLine(t)) {
        flushPara();
        flushList();
        flushSteps();
        journals.push(t);
        continue;
      }
      flushList();
      flushSteps();
      flushJournals();
      para.push(t);
    }
    flushAll();
    return html.join('');
  };

  const loadHandbookText = async context => {
    try {
      const data = await api(context, '/ledger/handbook');
      if (data.content) return data.content;
    } catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      try {
        const response = await fetch('../accounting/cam-nang.txt');
        if (response.ok) return await response.text();
      } catch { /* dùng lỗi API gốc */ }
      throw error;
    }
    const response = await fetch('../accounting/cam-nang.txt');
    if (!response.ok) throw new Error('Không tải được cẩm nang kế toán.');
    return response.text();
  };

  const highlightQuery = (scope, query) => {
    const q = String(query || '').trim();
    if (!q || q.length < 2) return 0;
    const needle = q.toLocaleLowerCase('vi-VN');
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent || parent.closest('mark, script, style')) continue;
      nodes.push(walker.currentNode);
    }
    let hits = 0;
    nodes.forEach(node => {
      const text = node.nodeValue;
      const lower = text.toLocaleLowerCase('vi-VN');
      let from = 0;
      const parts = [];
      while (from < text.length) {
        const idx = lower.indexOf(needle, from);
        if (idx < 0) {
          parts.push(document.createTextNode(text.slice(from)));
          break;
        }
        if (idx > from) parts.push(document.createTextNode(text.slice(from, idx)));
        const mark = document.createElement('mark');
        mark.className = 'hb-mark';
        mark.textContent = text.slice(idx, idx + q.length);
        parts.push(mark);
        hits += 1;
        from = idx + q.length;
      }
      if (parts.length > 1) {
        const wrap = document.createDocumentFragment();
        parts.forEach(part => wrap.appendChild(part));
        node.parentNode.replaceChild(wrap, node);
      }
    });
    return hits;
  };

  const initHandbook = async (root, context) => {
    root.classList.add('hb-page');
    root.innerHTML = `${header('Cẩm nang kế toán', 'Sổ tay nghiệp vụ ngay trong hệ thống — mục lục dính trái, ô tìm luôn trên cùng. Không phải MISA / tờ khai thuế.')}
      <div class="lg-loading"><strong>Đang tải cẩm nang</strong>Vui lòng chờ trong giây lát...</div>`;
    const raw = await loadHandbookText(context);
    const parsed = parseHandbook(raw);
    const introRender = renderHandbookLines(parsed.intro.split('\n'), 'hb-intro');
    const rendered = parsed.sections.map(section => ({
      ...section,
      html: renderHandbookLines(section.body, section.id)
    }));
    const tocHtml = [
      `<a href="#hb-intro" data-hb-jump="hb-intro"><span>0</span>Giới thiệu</a>`,
      ...rendered.map(section => `<a href="#${section.id}" data-hb-jump="${section.id}" class="${section.featured ? 'is-featured' : ''}"><span>${esc(section.num)}</span>${esc(section.title)}</a>`)
    ].join('');
    const mainHtml = `
      <article class="hb-section hb-intro" id="hb-intro">
        <div class="hb-section-head"><span class="hb-num">0</span><div><p class="lg-kicker">Cẩm nang mini</p><h2>Giới thiệu &amp; cách đọc</h2></div></div>
        <div class="hb-body">${introRender}</div>
      </article>
      ${rendered.map(section => `
        <article class="hb-section${section.featured ? ' is-featured' : ''}" id="${section.id}">
          <div class="hb-section-head"><span class="hb-num">${esc(section.num)}</span><div><p class="lg-kicker">Mục ${esc(section.num)}</p><h2>${esc(section.title)}</h2></div></div>
          <div class="hb-body">${section.html}</div>
        </article>`).join('')}`;
    root.innerHTML = `${header('Cẩm nang kế toán', 'Sổ tay nghiệp vụ khớp plan mini 1.5 — ngay trong menu Kế toán. Hạch toán / định khoản: mục 3A. Ngày đầu làm mục 1 → 5; lỗi thường gặp ở mục 17.')}
      <ul class="hb-legend" aria-label="Chú thích màu trên cẩm nang">
        <li class="is-rule"><span></span>Ý chính / quy tắc chốt</li>
        <li class="is-alert"><span></span>Cảnh báo · BLOCK · cấm</li>
        <li class="is-ex"><span></span>Ví dụ số / định khoản</li>
        <li class="is-step"><span></span>Bước bấm trên app</li>
      </ul>
      <div class="hb-shell">
        <aside class="hb-toc" id="hbToc">
          <label class="hb-search"><span>Tìm trong cẩm nang</span><input type="search" id="hbSearch" placeholder="Ví dụ: hạch toán, cước, 642, VAT..." autocomplete="off"></label>
          <p class="hb-toc-kicker">Mục lục</p>
          <nav class="hb-toc-nav" id="hbTocNav">${tocHtml}</nav>
          <p class="hb-toc-hint" id="hbSearchHint">Gõ để lọc mục và tô từ khóa. Enter nhảy tới mục đầu.</p>
        </aside>
        <div class="hb-main" id="hbMain">${mainHtml}</div>
      </div>`;

    const tocNav = root.querySelector('#hbTocNav');
    const searchInput = root.querySelector('#hbSearch');
    const hint = root.querySelector('#hbSearchHint');
    const main = root.querySelector('#hbMain');
    const scroller = root.closest('.content-area') || root;
    const jump = id => {
      const el = root.querySelector(`#${CSS.escape(id)}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      tocNav.querySelectorAll('a').forEach(a => a.classList.toggle('is-active', a.dataset.hbJump === id));
    };
    tocNav.querySelectorAll('[data-hb-jump]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        jump(link.dataset.hbJump);
      });
    });

    const applySearch = () => {
      const q = searchInput.value.trim();
      const articles = [...main.querySelectorAll('.hb-section')];
      articles.forEach(article => {
        article.querySelectorAll('mark.hb-mark').forEach(mark => {
          mark.replaceWith(document.createTextNode(mark.textContent));
        });
        article.normalize();
      });
      if (q.length < 2) {
        articles.forEach(article => { article.hidden = false; });
        tocNav.querySelectorAll('a').forEach(a => { a.hidden = false; });
        hint.textContent = 'Gõ để lọc mục và tô từ khóa.';
        return;
      }
      const needle = q.toLocaleLowerCase('vi-VN');
      let shown = 0;
      articles.forEach(article => {
        const hay = article.innerText.toLocaleLowerCase('vi-VN');
        const match = hay.includes(needle);
        article.hidden = !match;
        const jumpId = article.id;
        const tocLink = tocNav.querySelector(`[data-hb-jump="${jumpId}"]`);
        if (tocLink) tocLink.hidden = !match;
        if (match) {
          shown += 1;
          highlightQuery(article, q);
        }
      });
      hint.textContent = shown ? `${shown} mục khớp “${q}”. Enter để tới mục đầu.` : `Không thấy “${q}”. Thử hạch toán, cước, 642, VAT…`;
    };

    let searchTimer = 0;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applySearch, 160);
    });
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(searchTimer);
        applySearch();
        const first = [...main.querySelectorAll('.hb-section')].find(article => !article.hidden);
        if (first) jump(first.id);
      }
    });

    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible?.target?.id) return;
      tocNav.querySelectorAll('a').forEach(a => a.classList.toggle('is-active', a.dataset.hbJump === visible.target.id));
    }, { root: scroller, rootMargin: '-12% 0px -70% 0px', threshold: [0, 0.15, 0.4] });
    main.querySelectorAll('.hb-section').forEach(section => observer.observe(section));
    let pendingJump = '';
    try { pendingJump = sessionStorage.getItem('fly_hb_jump') || ''; } catch { pendingJump = ''; }
    if (pendingJump && root.querySelector(`#${CSS.escape(pendingJump)}`)) {
      try { sessionStorage.removeItem('fly_hb_jump'); } catch { /* ignore */ }
      setTimeout(() => jump(pendingJump), 80);
    }
  };

  const initCoa = async (root, context) => {
    const current = await loadOpenPeriod(context);
    root.innerHTML = `${header('Hệ thống tài khoản', '18 tài khoản hệ thống (có 138). Không xóa được tài khoản hệ thống. Ánh xạ định khoản nằm trong journalEngine, không có bảng cấu hình.', periodChip(current))}
      <article class="lg-card">
        <div class="lg-toolbar" style="margin:0 0 12px;padding:0;border:0;box-shadow:none">
          <h2 style="margin:0">Danh mục tài khoản</h2>
          <div class="lg-actions">${printLib()?.buttonHtml('coaPrint') || ''}</div>
        </div>
        <p class="lg-help">Mã tài khoản giữ nguyên (111, 112, 156…). Tính chất và loại báo cáo hiển thị tiếng Việt có dấu.</p>
        <div id="coaBody">${loadingBox()}</div>
      </article>`;
    const data = await api(context, '/ledger/accounts');
    const rows = (data.items || []).map(row => `<tr class="${row.LaHeThong ? 'is-key' : ''}">
      <td><strong>${esc(row.MaTK)}</strong></td>
      <td>${esc(accountName(row.MaTK, row.TenTK))}</td>
      <td>${badge(row.TinhChat)}</td>
      <td>${esc(labelOf(row.LoaiBC))}</td>
      <td>${row.ChoPhepGhiSo ? 'Cho phép' : 'Không ghi sổ'}</td>
      <td>${badge(row.TrangThai)}</td>
    </tr>`).join('');
    root.querySelector('#coaBody').innerHTML = table(
      ['Mã TK', 'Tên tài khoản', 'Tính chất', 'Báo cáo', 'Ghi sổ', 'Trạng thái'],
      rows,
      { emptyTitle: 'Chưa có tài khoản', emptyDetail: 'Hãy chạy migration kế toán để seed 18 tài khoản hệ thống.' }
    );
    printLib()?.bindButton(root.querySelector('#coaPrint'), () => printLib().accounts(data.items || [], printH()));
  };

  const openingKeyAccounts = new Set(['111', '112', '156', '331', '411', '421']);

  const initPeriods = async (root, context) => {
    const current = await loadOpenPeriod(context);
    root.innerHTML = `${header('Kỳ kế toán', 'Mỗi tháng một kỳ. Làm lần lượt: tạo kỳ → mở kỳ → nhập số dư cân (Nợ = Có) → chốt số dư. Sau khi chốt không sửa trực tiếp — dùng bút toán điều chỉnh.', periodChip(current))}
      <div class="lg-toolbar">
        <label class="lg-field"><span>Tháng kỳ</span><input type="month" id="kyMonth" data-keep-native value="${monthNow()}"></label>
        <div class="lg-actions">
          <button type="button" class="lg-btn lg-btn-ghost" id="kyReload">Tải lại</button>
          ${printLib()?.buttonHtml('kyPrint') || ''}
        </div>
      </div>
      <ol class="lg-stepper" id="kySteps"></ol>
      <article class="lg-card">
        <div id="kyAction"></div>
        <div class="lg-balance-bar" id="kyBalance"><span>Chọn tháng rồi làm theo các bước.</span></div>
        <div id="kyOpenBody">${loadingBox('Đang tải số dư đầu kỳ...')}</div>
      </article>
      <h3 class="lg-section-title">Các kỳ đã lập</h3>
      <div id="kyList"></div>`;

    const monthInput = root.querySelector('#kyMonth');
    const maKyOf = () => monthInput.value;

    const renderSteps = (exists, isOpen, isClosed, allChot) => {
      const steps = [
        { id: 1, title: 'Tạo kỳ', text: 'Tạo kỳ tháng (từ ngày 01 đến cuối tháng).' },
        { id: 2, title: 'Mở kỳ', text: 'Chỉ nên có một kỳ đang mở.' },
        { id: 3, title: 'Nhập số dư', text: 'Nhập dư Nợ hoặc dư Có — một bên, không cả hai.' },
        { id: 4, title: 'Chốt số dư', text: 'Chốt khi tổng Nợ = tổng Có. Không sửa sau khi chốt.' }
      ];
      const currentStep = !exists ? 1 : (!isOpen && !isClosed ? 2 : (allChot ? 0 : 3));
      root.querySelector('#kySteps').innerHTML = steps.map(step => {
        const done = (step.id === 1 && exists) || (step.id === 2 && (isOpen || isClosed || allChot)) || (step.id >= 3 && allChot);
        const current = step.id === currentStep || (currentStep === 3 && step.id === 4 && isOpen && !allChot);
        const blocked = (step.id === 2 && !exists) || (step.id >= 3 && !isOpen) || (step.id === 4 && !isOpen);
        const cls = done && !current ? 'is-done' : current ? 'is-current' : blocked ? 'is-blocked' : '';
        return `<li class="lg-step ${cls}"><span class="lg-step-index">${done && !current ? '✓' : step.id}</span><div><strong>${step.title}</strong><p>${step.text}</p></div></li>`;
      }).join('');
    };

    const collectLines = () => [...root.querySelectorAll('[data-open-no]')].map(input => ({
      MaTK: input.dataset.openNo,
      SoDuNo: Number(input.value || 0),
      SoDuCo: Number(root.querySelector(`[data-open-co="${input.dataset.openNo}"]`)?.value || 0)
    }));

    const paintBalance = (locked) => {
      const lines = collectLines();
      const tongNo = lines.reduce((sum, row) => sum + Number(row.SoDuNo || 0), 0);
      const tongCo = lines.reduce((sum, row) => sum + Number(row.SoDuCo || 0), 0);
      const both = lines.filter(row => row.SoDuNo > 0 && row.SoDuCo > 0);
      const balanced = tongNo === tongCo;
      const bar = root.querySelector('#kyBalance');
      bar.className = `lg-balance-bar ${balanced ? 'is-on' : 'is-off'}`;
      bar.innerHTML = `<span>Tổng Nợ <b>${money(tongNo)}</b> · Tổng Có <b>${money(tongCo)}</b></span>
        <span>${locked ? 'Đã chốt — không sửa trực tiếp' : balanced ? 'Đã cân Nợ = Có, có thể chốt' : `Lệch ${money(Math.abs(tongNo - tongCo))} — chưa chốt được`}</span>
        ${both.length ? `<p class="lg-error">Tài khoản ${both.map(r => r.MaTK).join(', ')} đang nhập cả Nợ và Có. Chỉ nhập một bên.</p>` : ''}`;
      const lockBtn = root.querySelector('#kyLockOpen');
      if (lockBtn) lockBtn.disabled = locked || !balanced || both.length > 0;
      return { balanced, tongNo, tongCo };
    };

    printLib()?.bindButton(root.querySelector('#kyPrint'), () => {
      const opening = root._openingPrint;
      if (!opening) {
        window.alert('Chưa có số dư kỳ để in. Chọn tháng rồi tải lại.');
        return null;
      }
      return printLib().opening(opening.maKy, opening.items, printH());
    });

    const reload = async () => {
      const maKy = maKyOf();
      const list = await api(context, '/ledger/periods');
      const items = list.items || [];
      const selected = items.find(row => row.MaKy === maKy);
      const exists = Boolean(selected);
      const isOpen = selected?.TrangThai === 'Mo';
      const isClosed = selected?.TrangThai === 'Khoa';
      const opening = await api(context, `/ledger/periods/${maKy}/opening`);
      root._openingPrint = { maKy, items: opening.items || [] };
      const allChot = Boolean(opening.items?.length) && opening.items.every(row => row.DaChot);
      renderSteps(exists, isOpen, isClosed, allChot);

      root.querySelector('#kyAction').innerHTML = `
        <div class="lg-actions" style="margin:0 0 14px">
          <button type="button" class="lg-btn lg-btn-primary" id="kyCreate" ${exists ? 'disabled' : ''}>${exists ? 'Đã tạo kỳ' : '1. Tạo kỳ'}</button>
          <button type="button" class="lg-btn ${exists && !isOpen && !isClosed ? 'lg-btn-primary' : 'lg-btn-ghost'}" id="kyOpen" ${!exists || isOpen || isClosed ? 'disabled' : ''}>${isOpen ? 'Đang mở' : isClosed ? 'Kỳ đã khóa' : '2. Mở kỳ'}</button>
          <button type="button" class="lg-btn lg-btn-ghost" id="kySaveOpen" ${!isOpen || allChot ? 'disabled' : ''}>3. Lưu số dư</button>
          <button type="button" class="lg-btn ${isOpen && !allChot ? 'lg-btn-primary' : 'lg-btn-ghost'}" id="kyLockOpen" ${!isOpen || allChot ? 'disabled' : ''}>${allChot ? 'Đã chốt số dư' : '4. Chốt số dư'}</button>
        </div>
        <p class="lg-help">${!exists ? 'Bắt đầu bằng Tạo kỳ cho tháng đã chọn.' : !isOpen && !isClosed ? 'Kỳ đã tạo (chưa mở). Bấm Mở kỳ trước khi nhập số dư.' : isClosed ? 'Kỳ đã khóa. Muốn sửa số liệu thì dùng Khóa kỳ / kết chuyển → Mở lại (chỉ kỳ gần nhất).' : allChot ? 'Số dư đầu kỳ đã chốt. Sai sót xử lý bằng bút toán điều chỉnh, không sửa hàng số dư.' : 'Nhập số dư các tài khoản then chốt (111, 112, 156, 331, 411, 421), bấm Lưu số dư, kiểm tra Nợ = Có, rồi Chốt số dư.'}</p>`;

      const locked = allChot || !isOpen;
      root.querySelector('#kyOpenBody').innerHTML = table(
        ['Mã TK', 'Tên tài khoản', { text: 'Dư Nợ', num: true }, { text: 'Dư Có', num: true }, 'Chốt'],
        (opening.items || []).map(row => `<tr class="${openingKeyAccounts.has(row.MaTK) ? 'is-key' : ''}">
          <td><strong>${esc(row.MaTK)}</strong></td>
          <td>${esc(accountName(row.MaTK, row.TenTK))}</td>
          <td class="lg-num"><input class="lg-money-input" data-keep-native data-open-no="${esc(row.MaTK)}" type="number" min="0" step="1000" value="${Number(row.SoDuNo || 0)}" ${locked ? 'disabled' : ''}></td>
          <td class="lg-num"><input class="lg-money-input" data-keep-native data-open-co="${esc(row.MaTK)}" type="number" min="0" step="1000" value="${Number(row.SoDuCo || 0)}" ${locked ? 'disabled' : ''}></td>
          <td>${row.DaChot ? badge('Khoa', 'Đã chốt') : badge('Nhap', 'Nháp')}</td>
        </tr>`).join(''),
        { emptyTitle: 'Chưa có tài khoản', emptyDetail: 'Mở Hệ thống tài khoản để kiểm tra danh mục.' }
      );

      root.querySelector('#kyList').innerHTML = table(
        ['Kỳ', 'Trạng thái', 'Từ ngày', 'Đến ngày', 'Kết chuyển'],
        items.map(row => `<tr class="${row.MaKy === maKy ? 'is-emphasis' : ''}">
          <td><strong>${esc(row.MaKy)}</strong></td>
          <td>${badge(row.TrangThai)}</td>
          <td>${fmtDate(row.TuNgay)}</td>
          <td>${fmtDate(row.DenNgay)}</td>
          <td>${row.DaKetChuyen ? badge('DaGhiSo', 'Đã kết chuyển') : badge('ChuaMo', 'Chưa kết chuyển')}</td>
        </tr>`).join(''),
        { emptyTitle: 'Chưa có kỳ kế toán', emptyDetail: 'Chọn tháng rồi bấm Tạo kỳ.' }
      );

      paintBalance(locked);
      root.querySelectorAll('[data-open-no], [data-open-co]').forEach(input => {
        input.addEventListener('input', () => paintBalance(locked));
      });

      root.querySelector('#kyCreate').addEventListener('click', catchUi(context, async ev => {
        await busy(ev.currentTarget, async () => {
          const [Nam, Thang] = maKyOf().split('-').map(Number);
          await api(context, '/ledger/periods', { method: 'POST', body: JSON.stringify({ Nam, Thang }) });
          context.showToast(`Đã tạo kỳ ${maKyOf()}.`, 'success');
          await reload();
        });
      }));
      root.querySelector('#kyOpen').addEventListener('click', catchUi(context, async ev => {
        await busy(ev.currentTarget, async () => {
          const data = await api(context, `/ledger/periods/${maKyOf()}/open`, { method: 'POST' });
          context.showToast(data.message, 'success');
          await reload();
        });
      }));
      root.querySelector('#kySaveOpen').addEventListener('click', catchUi(context, async ev => {
        await busy(ev.currentTarget, async () => {
          const saved = await api(context, `/ledger/periods/${maKyOf()}/opening`, { method: 'PUT', body: JSON.stringify({ lines: collectLines() }) });
          context.showToast(saved.message, 'success');
          await reload();
        });
      }));
      root.querySelector('#kyLockOpen').addEventListener('click', catchUi(context, async ev => {
        const { balanced } = paintBalance(false);
        if (!balanced) return context.showToast('Tổng Nợ phải bằng tổng Có trước khi chốt số dư.', 'error');
        if (!window.confirm('Chốt số dư đầu kỳ? Sau khi chốt không sửa trực tiếp (dùng bút toán điều chỉnh).')) return;
        await busy(ev.currentTarget, async () => {
          const data = await api(context, `/ledger/periods/${maKyOf()}/opening/lock`, { method: 'POST' });
          context.showToast(data.message, 'success');
          await reload();
        });
      }));
    };

    root.querySelector('#kyReload').addEventListener('click', () => reload().catch(err => context.showToast(err.message, 'error')));
    monthInput.addEventListener('change', () => reload().catch(err => context.showToast(err.message, 'error')));
    await reload();
  };

  const initExpenses = async (root, context) => {
    const [types, current] = await Promise.all([api(context, '/ledger/expense-types'), loadOpenPeriod(context)]);
    const defaultNgay = dateInOpenPeriod(current);
    const kyHint = current
      ? `Ngày chứng từ mặc định theo kỳ đang mở (${monthLabel(current.MaKy)}: ${fmtDate(current.TuNgay)} – ${fmtDate(current.DenNgay)}), không lấy ngày máy nếu nằm ngoài kỳ.`
      : 'Chưa có kỳ đang mở. Mở kỳ kế toán trước khi lập phiếu.';
    root.innerHTML = `${header('Chi phí vận hành', 'Ghi điện, nước, thuê mặt bằng, văn phòng, cước xe… vào TK 642. Chỉ trả bằng 111 hoặc 112 trong kỳ — không ghi nợ 331.', periodChip(current))}
      <article class="lg-card">
        <h2>Lập phiếu chi phí</h2>
        <p class="lg-help">Lưu nháp trước, rồi xác nhận để sinh bút toán. ${esc(kyHint)} Nếu kỳ đã khóa, chứng từ ngày thuộc kỳ khóa vẫn lưu và bút toán vào hàng chờ ghi sổ.</p>
        <form id="cpForm" class="lg-form lg-grid-2" data-keep-native>
          <label><span>Loại chi phí</span><select id="cpLoai">${(types.items || []).map(t => `<option value="${esc(t.MaLoaiCP)}">${esc(expenseName(t))}</option>`).join('')}</select></label>
          <label><span>Ngày chứng từ</span><input type="date" id="cpNgay" required value="${esc(defaultNgay)}"></label>
          <label><span>Tiền hàng (chưa VAT)</span><input type="number" id="cpHang" min="0" step="1" required placeholder="0"></label>
          <label><span>Thuế suất</span><select id="cpThue"><option value="0">0%</option><option value="5">5%</option><option value="8">8%</option><option value="10">10%</option></select></label>
          <label><span>Tài khoản tiền</span><select id="cpTK"><option value="111">111 — ${esc(accountName('111'))}</option><option value="112">112 — ${esc(accountName('112'))}</option></select></label>
          <label><span>Ghi chú</span><input id="cpGC" maxlength="200" placeholder="Số hóa đơn, nhà cung cấp..."></label>
          <div class="lg-actions" style="grid-column:1/-1;margin:0"><button class="lg-btn lg-btn-primary" type="submit">Lưu nháp</button></div>
        </form>
      </article>
      <h3 class="lg-section-title">Phiếu đã lập</h3>
      <p class="lg-help">Bấm mã phiếu (chữ xanh gạch chân) hoặc bấm vào dòng để mở lại. Phiếu Nháp: trong cửa sổ chi tiết có Xác nhận và Hủy nháp.</p>
      <div id="cpList">${loadingBox()}</div>`;

    bindOpenPeriodDate(root.querySelector('#cpNgay'), current);

    const reload = async () => {
      const data = await api(context, '/ledger/expenses');
      if (data.backfill?.error) context.showToast(data.backfill.error, 'error');
      else if (data.backfill?.posted) context.showToast(`Đã bổ sung ${data.backfill.posted} bút toán chi phí vào kỳ đang mở.`, 'success');
      root.querySelector('#cpList').innerHTML = table(
        ['Mã', 'Loại', 'Ngày', { text: 'Tiền hàng', num: true }, { text: 'VAT', num: true }, { text: 'Tổng', num: true }, 'TK tiền', 'Trạng thái', ''],
        (data.items || []).map(row => `<tr class="is-openable" data-cp-ma="${esc(row.MaCP)}" data-doc-loai="ChiPhiVanHanh">
          <td>${docLink('ChiPhiVanHanh', row.MaCP)}</td>
          <td>${esc(expenseName(row))}</td>
          <td>${fmtDate(row.NgayChungTu)}</td>
          <td class="lg-num">${money(row.TienHang)}</td>
          <td class="lg-num">${money(row.TienThue)}</td>
          <td class="lg-num">${money(row.TongCong)}</td>
          <td>${esc(row.MaTKTien)}</td>
          <td>${badge(row.TrangThai)}</td>
          <td>${row.TrangThai === 'Nhap' ? `<button type="button" data-cp="${esc(row.MaCP)}" class="lg-btn lg-btn-primary">Xác nhận</button>` : (row.TrangThai === 'DaXacNhan' && !Number(row.HasJournal) ? `<button type="button" data-cp="${esc(row.MaCP)}" class="lg-btn lg-btn-primary">Ghi sổ</button>` : '')}</td>
        </tr>`).join(''),
        { emptyTitle: 'Chưa có chi phí', emptyDetail: 'Lập phiếu ở form phía trên.' }
      );
      bindDocLinks(root.querySelector('#cpList'), context, reload);
      root.querySelectorAll('#cpList tbody tr[data-cp-ma]').forEach(tr => {
        tr.addEventListener('click', catchUi(context, event => {
          if (event.target.closest('button, a')) return;
          return openLedgerDocument(context, 'ChiPhiVanHanh', tr.dataset.cpMa, reload);
        }));
      });
      root.querySelectorAll('[data-cp]').forEach(btn => btn.addEventListener('click', catchUi(context, async event => {
        event.stopPropagation();
        await busy(btn, async () => {
          const out = await postExpenseJournal(context, btn.dataset.cp);
          context.showToast(out.message, 'success');
          await reload();
        });
      })));
    };

    root.querySelector('#cpForm').addEventListener('submit', catchUi(context, async event => {
      event.preventDefault();
      const hang = Number(root.querySelector('#cpHang').value);
      if (!(hang >= 0)) return context.showToast('Tiền hàng không hợp lệ.', 'error');
      const ngayLoi = assertDateInOpenPeriod(root.querySelector('#cpNgay').value, current);
      if (ngayLoi) return context.showToast(ngayLoi, 'error');
      const out = await api(context, '/ledger/expenses', {
        method: 'POST',
        body: JSON.stringify({
          MaLoaiCP: root.querySelector('#cpLoai').value,
          NgayChungTu: root.querySelector('#cpNgay').value,
          TienHang: hang,
          ThueSuat: Number(root.querySelector('#cpThue').value),
          MaTKTien: root.querySelector('#cpTK').value,
          GhiChu: root.querySelector('#cpGC').value
        })
      });
      context.showToast(out.message, 'success');
      event.target.reset();
      bindOpenPeriodDate(root.querySelector('#cpNgay'), current);
      await reload();
    }));
    await reload();
  };

  const reasonText = value => labelOf(value);

  const initJournals = async (root, context) => {
    let current = await loadOpenPeriod(context);
    const defaultNgay = dateInOpenPeriod(current);
    root.innerHTML = `${header('Bút toán & chờ ghi sổ', 'Hàng chờ: chứng từ hợp lệ thiếu bút toán, hoặc phát sinh khi kỳ đã khóa. Bút toán thủ công do máy chủ sinh mã TC + yyMM + 5 số — không dùng để thanh lý TSCĐ.', periodChip(current))}
      <div class="lg-toolbar">
        <div class="lg-actions" style="margin:0"><button type="button" class="lg-btn lg-btn-ghost" id="btReload">Tải lại</button></div>
      </div>
      <article class="lg-card">
        <h2>Chờ ghi sổ</h2>
        <p class="lg-help">Thiếu thuế hoặc phiếu nhập chưa đối chiếu thì không bấm ghi sổ trễ — phải xử lý nghiệp vụ gốc trước.</p>
        <div id="btQueue">${loadingBox()}</div>
      </article>
      <article class="lg-card">
        <h2>Bút toán thủ công</h2>
        <p class="lg-help">Ngày hạch toán phải thuộc kỳ đang mở${current ? ` (${monthLabel(current.MaKy)}: ${fmtDate(current.TuNgay)} – ${fmtDate(current.DenNgay)})` : ''}. Không dùng cho thanh lý TSCĐ.</p>
        <form id="btManual" class="lg-form lg-grid-2" data-keep-native>
          <label><span>Ngày hạch toán</span><input type="date" id="btNgay" required value="${esc(defaultNgay)}"></label>
          <label><span>Số tiền</span><input type="number" id="btTien" min="1" step="1" required placeholder="0"></label>
          <label class="lg-span"><span>Diễn giải</span><input id="btDG" required maxlength="500" placeholder="Ví dụ: Xóa chênh lệch phải thu khác 138"></label>
          <label><span>Nợ — mã TK</span><input id="btNoTK" required maxlength="8" placeholder="111"></label>
          <label><span>Có — mã TK</span><input id="btCoTK" required maxlength="8" placeholder="138"></label>
          <p class="lg-hint" style="grid-column:1/-1">Mã chứng từ do máy chủ sinh. Không gửi mã từ giao diện.</p>
          <div class="lg-actions" style="grid-column:1/-1;margin:0"><button class="lg-btn lg-btn-primary" type="submit">Ghi sổ</button></div>
        </form>
      </article>
      <h3 class="lg-section-title">Bút toán gần đây${current?.MaKy ? ` — ${esc(monthLabel(current.MaKy))}` : ''}</h3>
      <div id="btList"></div>`;

    bindOpenPeriodDate(root.querySelector('#btNgay'), current);

    const reload = async (opts = {}) => {
      current = await loadOpenPeriod(context);
      const titleEl = root.querySelector('.lg-section-title');
      if (titleEl) {
        titleEl.textContent = `Bút toán gần đây${current?.MaKy ? ` — ${monthLabel(current.MaKy)}` : ''}`;
      }
      const queue = await api(context, '/ledger/unposted');
      if (!opts.skipBackfill) {
        const pendingCp = [
          ...(queue.missing || []).filter(row => row.LoaiChungTu === 'ChiPhiVanHanh' && row.LyDo === 'THIEU_CHI_PHI'),
          ...(queue.queue || []).filter(row => row.LoaiChungTu === 'ChiPhiVanHanh' && (row.LyDo === 'THIEU_CHI_PHI' || row.LyDo === 'KY_KHOA'))
        ];
        if (pendingCp.length) {
          let posted = 0;
          let lastError = '';
          for (const row of pendingCp) {
            try {
              const out = await postExpenseJournal(context, row.MaChungTu);
              if (out.MaBT && !out.alreadyPosted) posted += 1;
            } catch (error) {
              lastError = error.message;
            }
          }
          if (posted) context.showToast(`Đã bổ sung ${posted} bút toán chi phí.`, 'success');
          else if (lastError) context.showToast(lastError, 'error');
          return reload({ skipBackfill: true });
        }
      }
      const qRows = [...(queue.queue || []), ...(queue.missing || [])];
      root.querySelector('#btQueue').innerHTML = table(
        ['Chứng từ', 'Ngày', 'Loại', 'Lý do', ''],
        qRows.map(row => {
          const canPost = row.MaCho && row.ChoGhi !== 0 && row.LyDo !== 'THIEU_THUE' && row.LyDo !== 'PN_CHUA_DOI_CHIEU';
          const canExpense = row.LoaiChungTu === 'ChiPhiVanHanh' && (row.LyDo === 'THIEU_CHI_PHI' || row.LyDo === 'KY_KHOA');
          return `<tr class="${row.LyDo === 'THIEU_THUE' || row.LyDo === 'PN_CHUA_DOI_CHIEU' ? 'is-warn' : ''}">
            <td>${docLink(row.LoaiChungTu, row.MaChungTu)}</td>
            <td>${formatQueueDate(row)}</td>
            <td>${esc(labelOf(row.LoaiChungTu))}</td>
            <td>${esc(reasonText(row.LyDo))}</td>
            <td>${canPost ? `<button type="button" data-cho="${row.MaCho}" class="lg-btn lg-btn-primary">Ghi sổ trễ</button>` : canExpense ? `<button type="button" data-cp-post="${esc(row.MaChungTu)}" class="lg-btn lg-btn-primary">Ghi sổ</button>` : ''}</td>
          </tr>`;
        }).join(''),
        { emptyTitle: 'Không có chứng từ chờ ghi sổ', emptyDetail: 'Mọi chứng từ hợp lệ đã có bút toán.' }
      );
      bindDocLinks(root.querySelector('#btQueue'), context);
      root.querySelectorAll('[data-cho]').forEach(btn => btn.addEventListener('click', catchUi(context, async () => {
        await busy(btn, async () => {
          const out = await api(context, `/ledger/unposted/${btn.dataset.cho}/post`, { method: 'POST' });
          context.showToast(out.message, out.queued ? 'error' : 'success');
          await reload({ skipBackfill: true });
        });
      })));
      root.querySelectorAll('[data-cp-post]').forEach(btn => btn.addEventListener('click', catchUi(context, async () => {
        await busy(btn, async () => {
          const out = await postExpenseJournal(context, btn.dataset.cpPost);
          context.showToast(out.message, 'success');
          await reload({ skipBackfill: true });
        });
      })));

      const list = await api(context, current?.MaKy ? `/ledger/journals?maKy=${encodeURIComponent(current.MaKy)}` : '/ledger/journals');
      if (list.backfill?.error) context.showToast(list.backfill.error, 'error');
      else if (list.backfill?.posted) context.showToast(`Đã bổ sung ${list.backfill.posted} bút toán chi phí vào kỳ đang mở.`, 'success');
      root.querySelector('#btList').innerHTML = table(
        ['Mã BT', 'Ngày HT', 'Chứng từ', 'Loại', { text: 'Định khoản', className: 'lg-dk-col' }, { text: 'Nợ', num: true }, { text: 'Có', num: true }, 'Nguồn', ''],
        (list.items || []).map(row => `<tr class="is-openable is-dk" data-bt-ma="${esc(row.MaBT)}">
          <td>${docLink('ButToan', row.MaBT)}</td>
          <td>${fmtDate(row.NgayHachToan)}</td>
          <td>${esc(labelOf(row.LoaiChungTu))} ${docLink(row.LoaiChungTu, row.MaChungTu)}</td>
          <td>${esc(labelOf(row.LoaiButToan))}</td>
          <td class="lg-dk-cell">${dinhKhoanHtml(row.lines)}</td>
          <td class="lg-num">${money(row.TongNo)}</td>
          <td class="lg-num">${money(row.TongCo)}</td>
          <td>${row.DaBiDao ? badge('Khoa', 'Đã đảo') : badge(row.Nguon || 'DaGhiSo')}</td>
          <td>${!row.DaBiDao && row.Nguon === 'ThuCong' ? `<button type="button" data-dao="${esc(row.MaBT)}" class="lg-btn lg-btn-ghost">Đảo</button>` : ''}</td>
        </tr>`).join(''),
        { emptyTitle: 'Chưa có bút toán', emptyDetail: 'Bút toán sẽ xuất hiện khi ghi sổ chứng từ hoặc lập bút toán thủ công.', tableClass: 'lg-table-journals' }
      );
      bindDocLinks(root.querySelector('#btList'), context);
      root.querySelectorAll('#btList tbody tr[data-bt-ma]').forEach(tr => {
        tr.addEventListener('click', catchUi(context, event => {
          if (event.target.closest('button, a')) return;
          return openJournalModal(context, tr.dataset.btMa);
        }));
      });
      root.querySelectorAll('[data-dao]').forEach(btn => btn.addEventListener('click', catchUi(context, async () => {
        const lyDo = window.prompt('Lý do đảo bút toán thủ công');
        if (!lyDo) return;
        const out = await api(context, `/ledger/journals/${btn.dataset.dao}/reverse`, { method: 'POST', body: JSON.stringify({ LyDo: lyDo }) });
        context.showToast(out.message, 'success');
        await reload();
      })));
    };

    root.querySelector('#btReload').addEventListener('click', () => reload().catch(err => context.showToast(err.message, 'error')));
    root.querySelector('#btManual').addEventListener('submit', catchUi(context, async event => {
      event.preventDefault();
      const soTien = Number(root.querySelector('#btTien').value);
      const noTK = root.querySelector('#btNoTK').value.trim();
      const coTK = root.querySelector('#btCoTK').value.trim();
      if (soTien <= 0) return context.showToast('Số tiền phải lớn hơn 0.', 'error');
      if (!noTK || !coTK) return context.showToast('Nhập đủ tài khoản Nợ và Có.', 'error');
      if (noTK === coTK) return context.showToast('Tài khoản Nợ và Có phải khác nhau.', 'error');
      const ngayLoi = assertDateInOpenPeriod(root.querySelector('#btNgay').value, current);
      if (ngayLoi) return context.showToast(ngayLoi, 'error');
      const out = await api(context, '/ledger/journals', {
        method: 'POST',
        body: JSON.stringify({
          ngay: root.querySelector('#btNgay').value,
          dienGiai: root.querySelector('#btDG').value,
          lines: [
            { maTK: noTK, soTienNo: soTien, soTienCo: 0 },
            { maTK: coTK, soTienNo: 0, soTienCo: soTien }
          ]
        })
      });
      context.showToast(out.message, 'success');
      await reload();
    }));
    await reload();
  };

  const unwrapReport = result => {
    if (result && typeof result === 'object' && 'html' in result) return result;
    return { html: result, print: null };
  };

  const bindReport = async (root, context, title, lead, loadFn, extraToolbar = '') => {
    const current = await loadOpenPeriod(context);
    root.innerHTML = `${header(title, lead, periodChip(current))}
      <div class="lg-toolbar">
        <label class="lg-field"><span>Kỳ báo cáo</span><input type="month" id="rpMonth" data-keep-native value="${monthNow()}"></label>
        ${extraToolbar}
        <div class="lg-actions">
          <button type="button" class="lg-btn lg-btn-primary" id="rpLoad">Lập báo cáo</button>
          ${printLib()?.buttonHtml('rpPrint', 'In báo cáo tháng') || ''}
        </div>
      </div>
      <div id="rpOut">${loadingBox('Đang lập báo cáo...')}</div>`;
    let printConfig = null;
    printLib()?.bindButton(root.querySelector('#rpPrint'), () => {
      if (!printConfig) {
        window.alert('Chưa có số liệu để in. Bấm Lập báo cáo trước.');
        return null;
      }
      return printConfig;
    });
    const load = async () => {
      root.querySelector('#rpOut').innerHTML = loadingBox('Đang lập báo cáo...');
      const packed = unwrapReport(await loadFn(root.querySelector('#rpMonth').value));
      printConfig = packed.print || null;
      root.querySelector('#rpOut').innerHTML = packed.html;
      bindDocLinks(root.querySelector('#rpOut'), context);
    };
    root.querySelector('#rpLoad').addEventListener('click', () => load().catch(err => {
      printConfig = null;
      root.querySelector('#rpOut').innerHTML = errorBox(err.message);
      context.showToast(err.message, 'error');
    }));
    await load().catch(err => { root.querySelector('#rpOut').innerHTML = errorBox(err.message); });
  };

  const initNkc = (root, context) => bindReport(root, context, 'Nhật ký chung',
    'Toàn bộ dòng hạch toán trong kỳ. Tổng Nợ phải bằng tổng Có.',
    async period => {
      const [data, watermark] = await Promise.all([
        api(context, `/ledger/reports/journal?periodType=month&period=${period}`),
        periodWatermark(context, period)
      ]);
      const rows = (data.items || []).map(row => `<tr>
        <td>${fmtDate(row.NgayHachToan)}</td>
        <td>${docLink('ButToan', row.MaBT)}</td>
        <td class="lg-dk-cell">${dinhKhoanHtml([row], { amount: false })}</td>
        <td class="lg-num">${money(row.SoTienNo)}</td>
        <td class="lg-num">${money(row.SoTienCo)}</td>
        <td>${esc(row.DienGiaiDong || row.DienGiai || '—')}</td>
      </tr>`).join('');
      return {
        html: `${paper({
          title: 'Nhật ký chung',
          period: data.period || { period },
          watermark,
          meta: `${esc(data.nguon || '')}<div>${data.balanced ? 'Cân Nợ = Có' : 'Lệch Nợ / Có'}</div>`,
          body: `<div class="lg-kpi-row">
            <div class="lg-kpi"><span>Tổng Nợ</span><strong>${money(data.tongNo)}</strong></div>
            <div class="lg-kpi"><span>Tổng Có</span><strong>${money(data.tongCo)}</strong></div>
            <div class="lg-kpi ${data.balanced ? 'is-good' : 'is-bad'}"><span>Đối chiếu</span><strong>${data.balanced ? 'Cân' : 'Lệch'}</strong></div>
            <div class="lg-kpi"><span>Số dòng</span><strong>${(data.items || []).length}</strong></div>
          </div>` + table(
            ['Ngày', 'Mã BT', { text: 'Định khoản', className: 'lg-dk-col' }, { text: 'Nợ', num: true }, { text: 'Có', num: true }, 'Diễn giải'],
            rows + `<tr class="is-total"><td colspan="3">Tổng cộng</td><td class="lg-num">${money(data.tongNo)}</td><td class="lg-num">${money(data.tongCo)}</td><td></td></tr>`,
            { emptyTitle: 'Chưa có phát sinh', emptyDetail: 'Kỳ này chưa có dòng nhật ký chung.', tableClass: 'lg-table-journals' }
          )
        })}`,
        print: printLib()?.report({
          title: 'NHẬT KÝ CHUNG',
          period,
          watermark,
          fields: [
            { label: 'Tổng Nợ', value: data.tongNo, format: 'money' },
            { label: 'Tổng Có', value: data.tongCo, format: 'money' },
            { label: 'Đối chiếu', value: data.balanced ? 'Cân Nợ = Có' : 'Lệch' }
          ],
          columns: [
            { key: 'NgayHachToan', label: 'Ngày', format: 'date' },
            { key: 'MaBT', label: 'Mã BT' },
            { key: 'MaTK', label: 'TK' },
            { key: 'TenTK', label: 'Tên TK' },
            { key: 'SoTienNo', label: 'Nợ', format: 'money', align: 'right' },
            { key: 'SoTienCo', label: 'Có', format: 'money', align: 'right' },
            { key: 'DienGiai', label: 'Diễn giải' }
          ],
          rows: (data.items || []).map(row => ({
            ...row,
            TenTK: accountName(row.MaTK, row.TenTK),
            DienGiai: row.DienGiaiDong || row.DienGiai
          })),
          summary: [
            { label: 'Tổng Nợ', value: data.tongNo, format: 'money' },
            { label: 'Tổng Có', value: data.tongCo, format: 'money' },
            { label: 'Số dòng', value: (data.items || []).length }
          ],
          orientation: 'landscape',
          note: data.nguon || ''
        })
      };
    });

  const initGl = async (root, context) => {
    const current = await loadOpenPeriod(context);
    root.innerHTML = `${header('Sổ cái', 'Chi tiết phát sinh và số dư chạy theo từng tài khoản trong kỳ.', periodChip(current))}
      <div class="lg-toolbar">
        <label class="lg-field"><span>Mã tài khoản</span><input id="glTK" value="111" maxlength="8" placeholder="111"></label>
        <label class="lg-field"><span>Kỳ</span><input type="month" id="rpMonth" data-keep-native value="${monthNow()}"></label>
        <div class="lg-actions">
          <button type="button" class="lg-btn lg-btn-primary" id="rpLoad">Xem sổ cái</button>
          ${printLib()?.buttonHtml('rpPrint') || ''}
        </div>
      </div>
      <div id="rpOut">${loadingBox()}</div>`;
    let printConfig = null;
    printLib()?.bindButton(root.querySelector('#rpPrint'), () => {
      if (!printConfig) {
        window.alert('Chưa có sổ cái để in. Bấm Xem sổ cái trước.');
        return null;
      }
      return printConfig;
    });
    const load = async () => {
      const maTK = root.querySelector('#glTK').value.trim();
      const period = root.querySelector('#rpMonth').value;
      const [data, watermark] = await Promise.all([
        api(context, `/ledger/reports/general-ledger?maTK=${encodeURIComponent(maTK)}&periodType=month&period=${period}`),
        periodWatermark(context, period)
      ]);
      const rows = (data.items || []).map(row => `<tr>
        <td>${fmtDate(row.NgayHachToan)}</td><td>${esc(row.MaBT)}</td>
        <td class="lg-num">${money(row.SoTienNo)}</td><td class="lg-num">${money(row.SoTienCo)}</td>
        <td class="lg-num">${money(row.DuChay)}</td>
      </tr>`).join('');
      root.querySelector('#rpOut').innerHTML = paper({
        title: `Sổ cái ${maTK} — ${accountName(data.account?.MaTK || maTK, data.account?.TenTK)}`,
        period: data.period || { period },
        watermark,
        meta: `Tài khoản ${esc(maTK)}`,
        body: `<div class="lg-kpi-row">
          <div class="lg-kpi"><span>Số dư đầu</span><strong>${money(data.soDuDau)}</strong></div>
          <div class="lg-kpi"><span>Phát sinh Nợ</span><strong>${money(data.psNo)}</strong></div>
          <div class="lg-kpi"><span>Phát sinh Có</span><strong>${money(data.psCo)}</strong></div>
          <div class="lg-kpi is-good"><span>Số dư cuối</span><strong>${money(data.soDuCuoi)}</strong></div>
        </div>` + table(
          ['Ngày', 'Bút toán', { text: 'Nợ', num: true }, { text: 'Có', num: true }, { text: 'Dư chạy', num: true }],
          rows,
          { emptyTitle: 'Không có phát sinh', emptyDetail: `Tài khoản ${maTK} chưa có dòng trong kỳ.` }
        )
      });
      printConfig = printLib()?.report({
        title: `SỔ CÁI ${maTK} — ${accountName(data.account?.MaTK || maTK, data.account?.TenTK)}`,
        period,
        watermark,
        fields: [
          { label: 'Tài khoản', value: `${maTK} — ${accountName(data.account?.MaTK || maTK, data.account?.TenTK)}` },
          { label: 'Số dư đầu', value: data.soDuDau, format: 'money' },
          { label: 'PS Nợ', value: data.psNo, format: 'money' },
          { label: 'PS Có', value: data.psCo, format: 'money' },
          { label: 'Số dư cuối', value: data.soDuCuoi, format: 'money' }
        ],
        columns: [
          { key: 'NgayHachToan', label: 'Ngày', format: 'date' },
          { key: 'MaBT', label: 'Bút toán' },
          { key: 'SoTienNo', label: 'Nợ', format: 'money', align: 'right' },
          { key: 'SoTienCo', label: 'Có', format: 'money', align: 'right' },
          { key: 'DuChay', label: 'Dư chạy', format: 'money', align: 'right' }
        ],
        rows: data.items || [],
        summary: [
          { label: 'Số dư đầu', value: data.soDuDau, format: 'money' },
          { label: 'Phát sinh Nợ', value: data.psNo, format: 'money' },
          { label: 'Phát sinh Có', value: data.psCo, format: 'money' },
          { label: 'Số dư cuối', value: data.soDuCuoi, format: 'money' }
        ]
      });
    };
    root.querySelector('#rpLoad').addEventListener('click', () => load().catch(err => {
      printConfig = null;
      root.querySelector('#rpOut').innerHTML = errorBox(err.message);
      context.showToast(err.message, 'error');
    }));
    await load().catch(err => { root.querySelector('#rpOut').innerHTML = errorBox(err.message); });
  };

  const initTrial = (root, context) => bindReport(root, context, 'Cân đối phát sinh',
    'Đối chiếu ba cột: dư đầu, phát sinh, dư cuối. Cả ba cặp Nợ/Có phải cân.',
    async period => {
      const [data, watermark] = await Promise.all([
        api(context, `/ledger/reports/trial-balance?periodType=month&period=${period}`),
        periodWatermark(context, period)
      ]);
      const rows = (data.items || []).map(row => `<tr>
        <td><strong>${esc(row.MaTK)}</strong></td><td>${esc(accountName(row.MaTK, row.TenTK))}</td>
        <td class="lg-num">${money(row.DuDauNo)}</td><td class="lg-num">${money(row.DuDauCo)}</td>
        <td class="lg-num">${money(row.PsNo)}</td><td class="lg-num">${money(row.PsCo)}</td>
        <td class="lg-num">${money(row.DuCuoiNo)}</td><td class="lg-num">${money(row.DuCuoiCo)}</td>
      </tr>`).join('');
      return {
        html: paper({
          title: 'Bảng cân đối phát sinh',
          period: data.period || { period },
          watermark,
          meta: data.dat ? 'Cân đủ 3 cột' : 'Có cột lệch',
          body: `<div class="lg-kpi-row">
            <div class="lg-kpi ${data.check?.dau ? 'is-good' : 'is-bad'}"><span>Đầu kỳ</span><strong>${money(data.tong?.dauNo)} / ${money(data.tong?.dauCo)}</strong></div>
            <div class="lg-kpi ${data.check?.ps ? 'is-good' : 'is-bad'}"><span>Phát sinh</span><strong>${money(data.tong?.psNo)} / ${money(data.tong?.psCo)}</strong></div>
            <div class="lg-kpi ${data.check?.cuoi ? 'is-good' : 'is-bad'}"><span>Cuối kỳ</span><strong>${money(data.tong?.cuoiNo)} / ${money(data.tong?.cuoiCo)}</strong></div>
            <div class="lg-kpi ${data.dat ? 'is-good' : 'is-bad'}"><span>Kết luận</span><strong>${data.dat ? 'Cân 3 cột' : 'Lệch'}</strong></div>
          </div>` + table(
            ['TK', 'Tên', { text: 'Đầu Nợ', num: true }, { text: 'Đầu Có', num: true }, { text: 'PS Nợ', num: true }, { text: 'PS Có', num: true }, { text: 'Cuối Nợ', num: true }, { text: 'Cuối Có', num: true }],
            rows + `<tr class="is-total"><td colspan="2">Tổng cộng</td>
              <td class="lg-num">${money(data.tong?.dauNo)}</td><td class="lg-num">${money(data.tong?.dauCo)}</td>
              <td class="lg-num">${money(data.tong?.psNo)}</td><td class="lg-num">${money(data.tong?.psCo)}</td>
              <td class="lg-num">${money(data.tong?.cuoiNo)}</td><td class="lg-num">${money(data.tong?.cuoiCo)}</td></tr>`
          )
        }),
        print: printLib()?.report({
          title: 'BẢNG CÂN ĐỐI PHÁT SINH',
          period,
          watermark,
          orientation: 'landscape',
          fields: [
            { label: 'Kết luận', value: data.dat ? 'Cân đủ 3 cột' : 'Có cột lệch' }
          ],
          columns: [
            { key: 'MaTK', label: 'TK' },
            { key: 'ten', label: 'Tên' },
            { key: 'DuDauNo', label: 'Đầu Nợ', format: 'money', align: 'right' },
            { key: 'DuDauCo', label: 'Đầu Có', format: 'money', align: 'right' },
            { key: 'PsNo', label: 'PS Nợ', format: 'money', align: 'right' },
            { key: 'PsCo', label: 'PS Có', format: 'money', align: 'right' },
            { key: 'DuCuoiNo', label: 'Cuối Nợ', format: 'money', align: 'right' },
            { key: 'DuCuoiCo', label: 'Cuối Có', format: 'money', align: 'right' }
          ],
          rows: (data.items || []).map(row => ({ ...row, ten: accountName(row.MaTK, row.TenTK) })),
          summary: [
            { label: 'Đầu kỳ Nợ / Có', value: `${money(data.tong?.dauNo)} / ${money(data.tong?.dauCo)}` },
            { label: 'Phát sinh Nợ / Có', value: `${money(data.tong?.psNo)} / ${money(data.tong?.psCo)}` },
            { label: 'Cuối kỳ Nợ / Có', value: `${money(data.tong?.cuoiNo)} / ${money(data.tong?.cuoiCo)}` },
            { label: 'Kết luận', value: data.dat ? 'Cân 3 cột' : 'Lệch' }
          ]
        })
      };
    });

  const initVat = (root, context) => bindReport(root, context, 'Bảng kê VAT',
    'VAT đầu ra từ hóa đơn bán hoàn thành. VAT đầu vào = hóa đơn mua khớp + chi phí + TSCĐ − trả NCC hàng. Không phải số phải nộp tờ khai.',
    async period => {
      const [sum, ra, vao, watermark] = await Promise.all([
        api(context, `/ledger/reports/vat-summary?periodType=month&period=${period}`),
        api(context, `/ledger/reports/vat-output?periodType=month&period=${period}`).catch(() => ({ items: [] })),
        api(context, `/ledger/reports/vat-input?periodType=month&period=${period}`).catch(() => ({ items: [] })),
        periodWatermark(context, period)
      ]);
      const missing = (ra.items || []).filter(row => row.thieuThue || row.ThueSuat == null).length;
      const raRows = (ra.items || []).map(row => `<tr class="${row.thieuThue || row.ThueSuat == null ? 'is-warn' : ''}">
        <td>${docLink('HoaDon', row.MaHD)}</td><td>${fmtDate(row.NgayLap)}</td><td>${esc(row.MaSP)}</td>
        <td>${row.ThueSuat == null ? badge('Nhap', 'Chưa chọn') : `${esc(row.ThueSuat)}%`}</td>
        <td class="lg-num">${money(row.vat ?? row.TienThue)}</td>
      </tr>`).join('');
      const vaoRows = (vao.items || []).map(row => `<tr class="${row.Nguon === 'TRA_NCC_HANG' ? 'is-warn' : ''}">
        <td>${esc(labelOf(row.Nguon))}</td><td>${docLink(row.Nguon === 'ChiPhi' ? 'ChiPhiVanHanh' : row.Nguon === 'TSCD' ? 'TaiSanCoDinh' : row.Nguon === 'TRA_NCC_HANG' ? 'PhieuXuat' : 'HoaDonMuaHang', row.Ma)}</td><td>${fmtDate(row.Ngay)}</td>
        <td class="lg-num">${money(row.TienHang)}</td><td class="lg-num">${money(row.VAT)}</td>
      </tr>`).join('');
      return {
        html: paper({
          title: 'Bảng kê VAT trong kỳ',
          period: sum.period || { period },
          watermark,
          meta: esc(sum.nhan || 'Không phải số phải nộp tờ khai.'),
          body: `<div class="lg-kpi-row">
            <div class="lg-kpi"><span>VAT đầu ra</span><strong>${money(sum.vatRa)}</strong></div>
            <div class="lg-kpi"><span>VAT đầu vào</span><strong>${money(sum.vatVao)}</strong></div>
            <div class="lg-kpi"><span>Chênh lệch</span><strong>${money(sum.chenh)}</strong></div>
            <div class="lg-kpi ${missing ? 'is-warn' : 'is-good'}"><span>Dòng bán thiếu thuế</span><strong>${missing}</strong></div>
          </div>
          <p class="lg-note">VAT vào = hóa đơn mua khớp + chi phí vận hành + TSCĐ − trả hàng nhà cung cấp (snapshot dòng hóa đơn mua đã 3-way). Dòng trả NCC là số âm.</p>
          <h3 class="lg-section-title">VAT đầu ra</h3>
          ${table(['Hóa đơn', 'Ngày', 'Mã SP', 'Thuế suất', { text: 'VAT', num: true }], raRows, { emptyTitle: 'Chưa có VAT đầu ra', emptyDetail: 'Chưa có hóa đơn bán hoàn thành trong kỳ.' })}
          <h3 class="lg-section-title">VAT đầu vào</h3>
          ${table(['Nguồn', 'Mã', 'Ngày', { text: 'Tiền hàng', num: true }, { text: 'VAT', num: true }], vaoRows, { emptyTitle: 'Chưa có VAT đầu vào', emptyDetail: 'Chưa có hóa đơn mua khớp, chi phí hoặc TSCĐ trong kỳ.' })}`
        }),
        print: printLib()?.report({
          title: 'BẢNG KÊ VAT',
          period,
          watermark,
          fields: [
            { label: 'VAT đầu ra', value: sum.vatRa, format: 'money' },
            { label: 'VAT đầu vào', value: sum.vatVao, format: 'money' },
            { label: 'Chênh lệch', value: sum.chenh, format: 'money' },
            { label: 'Dòng bán thiếu thuế', value: missing }
          ],
          columns: [
            { key: 'MaHD', label: 'Hóa đơn' },
            { key: 'NgayLap', label: 'Ngày', format: 'date' },
            { key: 'MaSP', label: 'Mã SP' },
            { key: 'thue', label: 'Thuế suất' },
            { key: 'vat', label: 'VAT', format: 'money', align: 'right' }
          ],
          rows: (ra.items || []).map(row => ({
            ...row,
            thue: row.ThueSuat == null ? 'Chưa chọn' : `${row.ThueSuat}%`,
            vat: row.vat ?? row.TienThue
          })),
          extraTables: [{
            title: 'VAT đầu vào',
            columns: [
              { key: 'nguon', label: 'Nguồn' },
              { key: 'Ma', label: 'Mã' },
              { key: 'Ngay', label: 'Ngày', format: 'date' },
              { key: 'TienHang', label: 'Tiền hàng', format: 'money', align: 'right' },
              { key: 'VAT', label: 'VAT', format: 'money', align: 'right' }
            ],
            rows: (vao.items || []).map(row => ({ ...row, nguon: labelOf(row.Nguon) }))
          }],
          extraSummary: [
            { label: 'VAT đầu ra', value: sum.vatRa, format: 'money' },
            { label: 'VAT đầu vào', value: sum.vatVao, format: 'money' },
            { label: 'Chênh lệch', value: sum.chenh, format: 'money' }
          ],
          note: sum.nhan || 'Không phải số phải nộp tờ khai.'
        })
      };
    });

  const renderCloseCheck = (data) => {
    const blocks = data.block || [];
    const warns = data.warn || [];
    return `<div class="lg-split">
      <section class="lg-panel lg-panel-block">
        <h3>BLOCK — không khóa</h3>
        <p>Chứng từ đã ở trạng thái hợp lệ nhưng thiếu bút toán bắt buộc. Không có nút bỏ qua.</p>
        <ul>${blocks.map(x => `<li>${esc(x)}</li>`).join('') || '<li>Không có mục BLOCK.</li>'}</ul>
      </section>
      <section class="lg-panel lg-panel-warn">
        <h3>WARN — vẫn khóa được</h3>
        <p>Phiếu nhập chưa 3-way, hóa đơn nháp, chứng từ chờ duyệt… Cảnh báo nhưng vẫn khóa kỳ được.</p>
        <ul>${warns.map(x => `<li>${esc(x)}</li>`).join('') || '<li>Không có mục WARN.</li>'}</ul>
      </section>
    </div>
    <p class="lg-note">${blocks.length ? 'Hãy ghi sổ các chứng từ BLOCK trước khi khóa.' : warns.length ? 'Không có BLOCK. Có thể khóa kỳ; WARN sẽ được ghi nhận.' : 'Checklist sạch — có thể kết chuyển rồi khóa kỳ.'}</p>`;
  };

  const initClose = async (root, context) => {
    const current = await loadOpenPeriod(context);
    root.innerHTML = `${header('Khóa kỳ / kết chuyển', 'Kiểm tra BLOCK (đỏ, chặn khóa) và WARN (vàng, vẫn khóa). Kết chuyển 511/5212/632/642/711 → 911 → 421, rồi khóa kỳ. Chỉ mở lại kỳ khóa gần nhất nếu kỳ sau chưa có bút toán nghiệp vụ.', periodChip(current))}
      <div class="lg-toolbar">
        <label class="lg-field"><span>Kỳ</span><input type="month" id="clMonth" data-keep-native value="${monthNow()}"></label>
        <div class="lg-actions">
          <button type="button" class="lg-btn lg-btn-ghost" id="clCheck">Kiểm tra</button>
          <button type="button" class="lg-btn lg-btn-ghost" id="clKc">Kết chuyển</button>
          <button type="button" class="lg-btn lg-btn-primary" id="clClose">Khóa kỳ</button>
          <button type="button" class="lg-btn lg-btn-ghost" id="clReopen">Mở lại kỳ</button>
        </div>
      </div>
      <div id="clOut">${loadingBox('Đang kiểm tra điều kiện khóa kỳ...')}</div>`;
    const maKy = () => root.querySelector('#clMonth').value;
    const runCheck = async () => {
      const data = await api(context, `/ledger/periods/${maKy()}/close-check`);
      root.querySelector('#clOut').innerHTML = renderCloseCheck(data);
      root.querySelector('#clClose').disabled = Boolean(data.block?.length);
      return data;
    };
    root.querySelector('#clCheck').addEventListener('click', catchUi(context, () => runCheck()));
    root.querySelector('#clKc').addEventListener('click', catchUi(context, async ev => {
      await busy(ev.currentTarget, async () => {
        const data = await api(context, `/ledger/periods/${maKy()}/closing-entry`, { method: 'POST' });
        context.showToast(data.message, 'success');
      });
    }));
    root.querySelector('#clClose').addEventListener('click', catchUi(context, async ev => {
      const check = await runCheck();
      if (check.block?.length) return context.showToast('Không khóa — còn chứng từ hợp lệ thiếu bút toán.', 'error');
      if (check.warn?.length && !window.confirm('Còn cảnh báo WARN (vẫn khóa được). Khóa kỳ này?')) return;
      else if (!check.warn?.length && !window.confirm(`Khóa kỳ ${maKy()}? Số dư cuối sẽ chuyển thành số dư đầu kỳ sau.`)) return;
      try {
        await busy(ev.currentTarget, async () => {
          const data = await api(context, `/ledger/periods/${maKy()}/close`, { method: 'POST' });
          context.showToast(data.message, 'success');
          await runCheck();
        });
      } catch (error) {
        if (error.block) {
          root.querySelector('#clOut').innerHTML = renderCloseCheck(error);
          root.querySelector('#clClose').disabled = Boolean(error.block.length);
        }
        throw error;
      }
    }));
    root.querySelector('#clReopen').addEventListener('click', catchUi(context, async ev => {
      const LyDo = window.prompt('Lý do mở lại kỳ (chỉ kỳ khóa gần nhất, kỳ sau chưa có bút toán nghiệp vụ)');
      if (!LyDo) return;
      await busy(ev.currentTarget, async () => {
        const data = await api(context, `/ledger/periods/${maKy()}/reopen`, { method: 'POST', body: JSON.stringify({ LyDo }) });
        context.showToast(data.message, 'success');
      });
    }));
    root.querySelector('#clMonth').addEventListener('change', () => runCheck().catch(err => {
      root.querySelector('#clOut').innerHTML = errorBox(err.message);
    }));
    await runCheck();
  };

  const initKqkd = (root, context) => bindReport(root, context, 'Kết quả kinh doanh',
    'Phát sinh thuần trong kỳ (không gồm số dư đầu / kết chuyển). Chưa xử lý thuế TNDN. Không trừ tiền trả NCC.',
    async period => {
      const [data, watermark] = await Promise.all([
        api(context, `/ledger/reports/income-statement?periodType=month&period=${period}`),
        periodWatermark(context, period)
      ]);
      const rows = (data.lines || []).map(row => `<tr class="${row.id === 3 || row.id === 5 || row.id === 8 ? 'is-emphasis' : ''}">
        <td>${row.id}</td><td>${esc(row.label)}</td><td class="lg-num">${money(row.amount)}</td>
      </tr>`).join('');
      return {
        html: paper({
          title: 'Kết quả kinh doanh (mini)',
          period: data.period || { period },
          watermark,
          meta: `${esc(data.chuThich || '')}<div>${esc(data.nguon || '')}</div>`,
          body: table(['#', 'Chỉ tiêu', { text: 'Số tiền', num: true }], rows) +
            `<p class="lg-note">Dòng 8 là lợi nhuận kế toán mini trước thuế — dùng cho chỉ tiêu J trên bảng cân đối khi kỳ chưa kết chuyển.</p>`
        }),
        print: printLib()?.report({
          title: 'KẾT QUẢ KINH DOANH',
          period,
          watermark,
          fields: [{ label: 'Nguồn', value: data.nguon || 'Phát sinh thuần trong kỳ' }],
          columns: [
            { key: 'id', label: '#' },
            { key: 'label', label: 'Chỉ tiêu' },
            { key: 'amount', label: 'Số tiền', format: 'money', align: 'right' }
          ],
          rows: data.lines || [],
          note: data.chuThich || 'Dòng 8 là lợi nhuận kế toán mini trước thuế.'
        })
      };
    });

  const initCf = (root, context) => bindReport(root, context, 'Lưu chuyển tiền tệ',
    'Phát sinh 111 + 112 trong kỳ. Thu/chi khác gồm bút toán thủ công (THU_CONG). I + II + III phải khớp phát sinh tiền.',
    async period => {
      const [data, watermark] = await Promise.all([
        api(context, `/ledger/reports/cash-flow?periodType=month&period=${period}`),
        periodWatermark(context, period)
      ]);
      const i = data.I || {};
      const body = `
        <div class="lg-kpi-row">
          <div class="lg-kpi"><span>I. Kinh doanh</span><strong>${money(i.tong)}</strong></div>
          <div class="lg-kpi"><span>II. Đầu tư</span><strong>${money(data.II?.tong)}</strong></div>
          <div class="lg-kpi"><span>III. Tài chính</span><strong>${money(data.III?.tong)}</strong></div>
          <div class="lg-kpi ${data.khop ? 'is-good' : 'is-bad'}"><span>Tổng / khớp 111+112</span><strong>${money(data.tong)} · ${data.khop ? 'Khớp' : 'Lệch'}</strong></div>
        </div>` + table(['Nhóm', 'Chỉ tiêu', { text: 'Số tiền', num: true }], [
        ['I', 'Thu bán hàng', i.banHang],
        ['I', 'Đổi trả / hoàn', i.hoan],
        ['I', 'Trả NCC', i.traNcc],
        ['I', 'Chi lương', i.luong],
        ['I', 'Chi phí vận hành', i.chiPhi],
        ['I', 'Lệch quỹ', i.lechQuy],
        ['I', 'Thu/chi khác (bút toán thủ công)', i.thuChiKhac],
        ['I', 'Cộng hoạt động kinh doanh', i.tong],
        ['II', 'Mua TSCĐ', data.II?.muaTscd],
        ['II', 'Cộng hoạt động đầu tư', data.II?.tong],
        ['III', 'Hoạt động tài chính (mini không phát sinh)', data.III?.tong],
        ['', 'Tổng lưu chuyển tiền', data.tong]
      ].map(([g, label, amount], index, all) => {
        const last = index === all.length - 1 || /Cộng|Tổng/.test(label);
        return `<tr class="${last ? 'is-total' : ''}"><td>${esc(g)}</td><td>${esc(label)}</td><td class="lg-num">${money(amount)}</td></tr>`;
      }).join('')) + `<p class="lg-note">${esc(data.nguon || '')}. Thu/chi khác lấy dấu theo Nợ/Có của 111/112.</p>`;
      const cfRows = [
        { nhom: 'I', chiTieu: 'Thu bán hàng', soTien: i.banHang },
        { nhom: 'I', chiTieu: 'Đổi trả / hoàn', soTien: i.hoan },
        { nhom: 'I', chiTieu: 'Trả NCC', soTien: i.traNcc },
        { nhom: 'I', chiTieu: 'Chi lương', soTien: i.luong },
        { nhom: 'I', chiTieu: 'Chi phí vận hành', soTien: i.chiPhi },
        { nhom: 'I', chiTieu: 'Lệch quỹ', soTien: i.lechQuy },
        { nhom: 'I', chiTieu: 'Thu/chi khác (bút toán thủ công)', soTien: i.thuChiKhac },
        { nhom: 'I', chiTieu: 'Cộng hoạt động kinh doanh', soTien: i.tong },
        { nhom: 'II', chiTieu: 'Mua TSCĐ', soTien: data.II?.muaTscd },
        { nhom: 'II', chiTieu: 'Cộng hoạt động đầu tư', soTien: data.II?.tong },
        { nhom: 'III', chiTieu: 'Hoạt động tài chính (mini không phát sinh)', soTien: data.III?.tong },
        { nhom: '', chiTieu: 'Tổng lưu chuyển tiền', soTien: data.tong }
      ];
      return {
        html: paper({
          title: 'Lưu chuyển tiền tệ',
          period: data.period || { period },
          watermark,
          meta: data.khop ? 'Khớp phát sinh 111 + 112' : 'Lệch so với phát sinh tiền',
          body
        }),
        print: printLib()?.report({
          title: 'LƯU CHUYỂN TIỀN TỆ',
          period,
          watermark,
          fields: [
            { label: 'I. Kinh doanh', value: i.tong, format: 'money' },
            { label: 'II. Đầu tư', value: data.II?.tong, format: 'money' },
            { label: 'III. Tài chính', value: data.III?.tong, format: 'money' },
            { label: 'Khớp 111+112', value: data.khop ? 'Khớp' : 'Lệch' }
          ],
          columns: [
            { key: 'nhom', label: 'Nhóm' },
            { key: 'chiTieu', label: 'Chỉ tiêu' },
            { key: 'soTien', label: 'Số tiền', format: 'money', align: 'right' }
          ],
          rows: cfRows,
          summary: [
            { label: 'I. Kinh doanh', value: i.tong, format: 'money' },
            { label: 'II. Đầu tư', value: data.II?.tong, format: 'money' },
            { label: 'III. Tài chính', value: data.III?.tong, format: 'money' },
            { label: 'Tổng', value: data.tong, format: 'money' }
          ],
          note: data.nguon || ''
        })
      };
    });

  const initBs = (root, context) => bindReport(root, context, 'Bảng cân đối kế toán',
    'Tài sản phải bằng nguồn vốn. Kỳ chưa khóa đóng dấu Số liệu tạm tính. Kỳ chưa kết chuyển: J = 421 + lợi nhuận dòng 8 KQKD (không cộng 911).',
    async period => {
      const data = await api(context, `/ledger/reports/balance-sheet?periodType=month&period=${period}`);
      const ts = [
        ['A', 'Tiền (111 + 112)', data.taiSan?.A],
        ['B', 'Phải thu khác (138)', data.taiSan?.B],
        ['C', 'Hàng tồn kho (156)', data.taiSan?.C],
        ['D', 'VAT đầu vào (1331)', data.taiSan?.D],
        ['E', 'TSCĐ ròng (211 − 214)', data.taiSan?.E]
      ];
      const nv = [
        ['F', 'Phải trả NCC (331)', data.nguonVon?.F],
        ['G', 'VAT đầu ra (33311)', data.nguonVon?.G],
        ['H', 'Phải trả lương (334)', data.nguonVon?.H],
        ['I', 'Vốn chủ sở hữu (411)', data.nguonVon?.I],
        ['J', data.closed ? 'LN lũy kế (421, đã kết chuyển)' : 'LN lũy kế (421 + LN kỳ 8.4)', data.nguonVon?.J]
      ];
      const col = (title, rows, total, label) => `
        <div>
          <h3 class="lg-section-title">${title}</h3>
          ${table(['', 'Chỉ tiêu', { text: 'Số tiền', num: true }],
            rows.map(([id, name, amount]) => `<tr><td>${id}</td><td>${esc(name)}</td><td class="lg-num">${money(amount)}</td></tr>`).join('') +
            `<tr class="is-total"><td></td><td>${label}</td><td class="lg-num">${money(total)}</td></tr>`)}
        </div>`;
      return {
        html: paper({
          title: 'Bảng cân đối kế toán',
          period: data.period || { period },
          watermark: Boolean(data.watermark),
          meta: `${data.can ? 'Tài sản = Nguồn vốn' : 'Lệch TS / NV'}<div>${data.closed ? 'J = 421 (đã kết chuyển)' : 'J = 421 + LN KQKD 8.4'}</div>`,
          body: `<div class="lg-kpi-row">
            <div class="lg-kpi"><span>Tổng tài sản</span><strong>${money(data.tongTS)}</strong></div>
            <div class="lg-kpi"><span>Tổng nguồn vốn</span><strong>${money(data.tongNV)}</strong></div>
            <div class="lg-kpi ${data.can ? 'is-good' : 'is-bad'}"><span>TS = NV</span><strong>${data.can ? 'Cân' : 'Lệch'}</strong></div>
            <div class="lg-kpi ${data.watermark ? 'is-warn' : 'is-good'}"><span>Trạng thái</span><strong>${data.watermark ? 'Tạm tính' : 'Đã khóa'}</strong></div>
          </div>
          <div class="lg-split">${col('Tài sản', ts, data.tongTS, 'Tổng tài sản')}${col('Nguồn vốn', nv, data.tongNV, 'Tổng nguồn vốn')}</div>
          <p class="lg-note">${esc(data.chuThich || '')}</p>`
        }),
        print: printLib()?.report({
          title: 'BẢNG CÂN ĐỐI KẾ TOÁN',
          period,
          watermark: Boolean(data.watermark),
          fields: [
            { label: 'Tổng tài sản', value: data.tongTS, format: 'money' },
            { label: 'Tổng nguồn vốn', value: data.tongNV, format: 'money' },
            { label: 'TS = NV', value: data.can ? 'Cân' : 'Lệch' },
            { label: 'Trạng thái', value: data.watermark ? 'Số liệu tạm tính' : 'Đã khóa' }
          ],
          columns: [
            { key: 'id', label: '' },
            { key: 'name', label: 'Chỉ tiêu tài sản' },
            { key: 'amount', label: 'Số tiền', format: 'money', align: 'right' }
          ],
          rows: ts.map(([id, name, amount]) => ({ id, name, amount })),
          extraTables: [{
            title: 'Nguồn vốn',
            columns: [
              { key: 'id', label: '' },
              { key: 'name', label: 'Chỉ tiêu' },
              { key: 'amount', label: 'Số tiền', format: 'money', align: 'right' }
            ],
            rows: nv.map(([id, name, amount]) => ({ id, name, amount }))
          }],
          extraSummary: [
            { label: 'Tổng tài sản', value: data.tongTS, format: 'money' },
            { label: 'Tổng nguồn vốn', value: data.tongNV, format: 'money' }
          ],
          note: data.chuThich || ''
        })
      };
    });

  const initAssets = async (root, context) => {
    const current = await loadOpenPeriod(context);
    root.innerHTML = `${header('Tài sản cố định', 'Lập thẻ TSCĐ, ghi sổ mua bằng 111 hoặc 112, chạy khấu hao tháng. Mô hình mini không thanh lý và không đánh giá lại.', periodChip(current))}
      <article class="lg-card">
        <h2>Lập thẻ tài sản</h2>
        <form id="tsForm" class="lg-form lg-grid-2" data-keep-native>
          <label><span>Tên TSCĐ</span><input id="tsTen" required maxlength="200" placeholder="Ví dụ: Tủ mát cửa hàng"></label>
          <label><span>Nguyên giá (chưa VAT)</span><input type="number" id="tsNg" min="1" step="1000" required placeholder="0"></label>
          <label><span>Ngày mua</span><input type="date" id="tsMua" required value="${todayISO()}"></label>
          <label><span>Ngày đưa vào sử dụng</span><input type="date" id="tsSd" required value="${todayISO()}"></label>
          <label><span>Số tháng khấu hao</span><input type="number" id="tsThang" min="1" value="36" required></label>
          <label><span>Tiền thuế VAT</span><input type="number" id="tsThue" min="0" step="100" value="0"></label>
          <label><span>Tài khoản tiền</span><select id="tsTK"><option value="111">111 — ${esc(accountName('111'))}</option><option value="112">112 — ${esc(accountName('112'))}</option></select></label>
          <div class="lg-actions" style="align-self:end;margin:0"><button class="lg-btn lg-btn-primary" type="submit">Lập thẻ</button></div>
        </form>
      </article>
      <article class="lg-card">
        <h2>Khấu hao kỳ</h2>
        <div class="lg-toolbar" style="margin:0;padding:0;border:0;box-shadow:none">
          <label class="lg-field"><span>Kỳ khấu hao</span><input type="month" id="tsKy" data-keep-native value="${monthNow()}"></label>
          <div class="lg-actions"><button type="button" class="lg-btn lg-btn-ghost" id="tsKh">Chạy khấu hao</button></div>
        </div>
      </article>
      <h3 class="lg-section-title">Danh sách thẻ</h3>
      <div id="tsList">${loadingBox()}</div>`;

    const reload = async () => {
      const data = await api(context, '/ledger/assets');
      root.querySelector('#tsList').innerHTML = table(
        ['Mã', 'Tên', 'Ngày mua', { text: 'Nguyên giá', num: true }, { text: 'VAT', num: true }, 'TK tiền', ''],
        (data.items || []).map(row => `<tr class="is-openable" data-ts-ma="${esc(row.MaTSCD)}">
          <td>${docLink('TaiSanCoDinh', row.MaTSCD)}</td>
          <td>${esc(row.TenTSCD)}</td>
          <td>${fmtDate(row.NgayMua)}</td>
          <td class="lg-num">${money(row.NguyenGia)}</td>
          <td class="lg-num">${money(row.TienThue)}</td>
          <td>${esc(row.MaTKTien)}</td>
          <td>
            <button type="button" data-print-ts="${esc(row.MaTSCD)}" class="lg-btn lg-btn-ghost">In</button>
            <button type="button" data-ts="${esc(row.MaTSCD)}" class="lg-btn lg-btn-primary">Ghi sổ mua</button>
          </td>
        </tr>`).join(''),
        { emptyTitle: 'Chưa có TSCĐ', emptyDetail: 'Lập thẻ ở form phía trên. Mini không làm thanh lý.' }
      );
      bindDocLinks(root.querySelector('#tsList'), context, reload);
      root.querySelectorAll('#tsList tbody tr[data-ts-ma]').forEach(tr => {
        tr.addEventListener('click', catchUi(context, event => {
          if (event.target.closest('button, a')) return;
          return openLedgerDocument(context, 'TaiSanCoDinh', tr.dataset.tsMa);
        }));
      });
      root.querySelectorAll('[data-print-ts]').forEach(btn => {
        printLib()?.bindButton(btn, async () => {
          const detail = await api(context, `/ledger/documents/TaiSanCoDinh/${encodeURIComponent(btn.dataset.printTs)}`);
          return printLib().asset(detail.asset || {}, printH());
        });
      });
      root.querySelectorAll('[data-ts]').forEach(btn => btn.addEventListener('click', catchUi(context, async () => {
        await busy(btn, async () => {
          const out = await api(context, `/ledger/assets/${btn.dataset.ts}/confirm`, { method: 'POST' });
          context.showToast(out.message, 'success');
          await reload();
        });
      })));
    };

    root.querySelector('#tsForm').addEventListener('submit', catchUi(context, async event => {
      event.preventDefault();
      const out = await api(context, '/ledger/assets', {
        method: 'POST',
        body: JSON.stringify({
          TenTSCD: root.querySelector('#tsTen').value,
          NgayMua: root.querySelector('#tsMua').value,
          NgayDuaVaoSD: root.querySelector('#tsSd').value,
          SoThangKH: Number(root.querySelector('#tsThang').value),
          NguyenGia: Number(root.querySelector('#tsNg').value),
          TienThue: Number(root.querySelector('#tsThue').value),
          MaTKTien: root.querySelector('#tsTK').value
        })
      });
      context.showToast(out.message, 'success');
      await reload();
    }));
    root.querySelector('#tsKh').addEventListener('click', catchUi(context, async ev => {
      await busy(ev.currentTarget, async () => {
        const out = await api(context, `/ledger/periods/${root.querySelector('#tsKy').value}/depreciation`, { method: 'POST' });
        context.showToast(out.message, 'success');
      });
    }));
    await reload();
  };

  const initBank = async (root, context) => {
    const current = await loadOpenPeriod(context);
    root.innerHTML = `${header('Ngân hàng & sao kê CSV', 'Kế toán mini chỉ dùng 1 tài khoản ngân hàng đang sử dụng, luôn map TK 112. Chỉ nhập sao kê CSV — không nhập Excel. Đối soát thông minh (điểm khớp, xác nhận KT) nằm menu riêng.', periodChip(current) + (typeof context.navigate === 'function' ? '<button type="button" class="lg-btn lg-btn-ghost" id="openSmartRecon">Mở đối soát thông minh</button>' : ''))}
      <div id="nhBox"></div>
      <article class="lg-card">
        <h2>Nhập sao kê CSV</h2>
        <p class="lg-help">Chỉ nhận tệp .csv. Không nhập Excel (.xlsx / .xls). Cột gợi ý: ngay, sotien (hoặc no/co), diengiai, magd. Sau khi nhập, mở cửa sổ sao kê để xem / in / khớp.</p>
        <form id="csvForm" class="lg-form lg-grid-2" data-keep-native>
          <label><span>Mã TKNH</span><input id="csvTk" required placeholder="NH0001"></label>
          <label><span>Tệp CSV</span><input type="file" id="csvFile" accept=".csv,text/csv" required></label>
          <div class="lg-actions" style="grid-column:1/-1;margin:0"><button class="lg-btn lg-btn-primary" type="submit">Nhập CSV</button></div>
        </form>
        <form id="skOpen" class="lg-form lg-grid-2" data-keep-native style="margin-top:12px">
          <label><span>Mã sao kê đã nhập</span><input id="skMa" placeholder="SK26090001" maxlength="20"></label>
          <div class="lg-actions" style="align-self:end;margin:0">
            <button class="lg-btn lg-btn-ghost" type="submit">Xem / in sao kê</button>
          </div>
        </form>
      </article>
      <h3 class="lg-section-title">Tài khoản ngân hàng</h3>
      <div id="nhList">${loadingBox()}</div>`;

    const reload = async () => {
      const data = await api(context, '/ledger/bank-accounts');
      const items = data.items || [];
      const active = items.filter(row => row.TrangThai === 'Su dung' || /sử dụng/i.test(row.TrangThai || ''));
      const hasActive = active.length >= 1;
      root.querySelector('#nhBox').innerHTML = hasActive
        ? `<article class="lg-panel lg-panel-ok"><h3>Đã có 1 tài khoản đang dùng</h3>
            <p>Mini không thêm ngân hàng thứ hai khi đã có tài khoản trạng thái Đang sử dụng. Mọi bút toán ngân hàng vào TK 112 — không tách 1121/1122.</p></article>`
        : `<article class="lg-card">
            <h2>Thêm tài khoản ngân hàng</h2>
            <p class="lg-help">Chỉ thêm khi chưa có tài khoản đang sử dụng. Máy chủ luôn gán MaTKKeToan = 112.</p>
            <form id="nhForm" class="lg-form lg-grid-2">
              <label><span>Số tài khoản</span><input id="nhSo" required maxlength="30" placeholder="Số TK doanh nghiệp"></label>
              <label><span>Tên ngân hàng</span><input id="nhTen" required maxlength="100" placeholder="Ví dụ: Vietcombank"></label>
              <label><span>Chủ tài khoản</span><input id="nhChu" required maxlength="150" placeholder="Tên chủ TK"></label>
              <div class="lg-actions" style="align-self:end;margin:0"><button class="lg-btn lg-btn-primary" type="submit">Thêm tài khoản</button></div>
            </form>
          </article>`;
      if (!hasActive) {
        root.querySelector('#nhForm')?.addEventListener('submit', catchUi(context, async event => {
          event.preventDefault();
          try {
            const out = await api(context, '/ledger/bank-accounts', {
              method: 'POST',
              body: JSON.stringify({
                SoTaiKhoan: root.querySelector('#nhSo').value,
                TenNH: root.querySelector('#nhTen').value,
                ChuTaiKhoan: root.querySelector('#nhChu').value
              })
            });
            context.showToast(out.message, 'success');
            await reload();
          } catch (error) {
            context.showToast(error.message || 'Không thêm được tài khoản. Mini chỉ cho 1 tài khoản đang sử dụng.', 'error');
          }
        }));
      }
      if (active[0] && !root.querySelector('#csvTk').value) root.querySelector('#csvTk').value = active[0].MaTKNH;
      root.querySelector('#nhList').innerHTML = table(
        ['Mã TKNH', 'Số tài khoản', 'Ngân hàng', 'Chủ TK', 'TK kế toán', 'Trạng thái'],
        items.map(row => `<tr>
          <td><strong>${esc(row.MaTKNH)}</strong></td>
          <td>${esc(row.SoTaiKhoan)}</td>
          <td>${esc(row.TenNH)}</td>
          <td>${esc(row.ChuTaiKhoan)}</td>
          <td>${esc(row.MaTKKeToan)}</td>
          <td>${badge(row.TrangThai)}</td>
        </tr>`).join(''),
        { emptyTitle: 'Chưa có tài khoản ngân hàng', emptyDetail: 'Thêm đúng 1 tài khoản đang sử dụng để đối chiếu sao kê.' }
      );
    };

    root.querySelector('#csvForm').addEventListener('submit', catchUi(context, async event => {
      event.preventDefault();
      const file = root.querySelector('#csvFile').files[0];
      if (!file) return context.showToast('Chọn tệp CSV.', 'error');
      if (!/\.csv$/i.test(file.name)) return context.showToast('Chỉ nhận tệp CSV. Không nhập Excel.', 'error');
      const body = new FormData();
      body.append('file', file);
      body.append('MaTKNH', root.querySelector('#csvTk').value);
      const out = await api(context, '/ledger/bank-statements', { method: 'POST', body });
      context.showToast(`Đã nhập ${out.soDong} dòng (${out.MaSaoKe}).`, 'success');
      if (out.MaSaoKe) {
        const maInput = root.querySelector('#skMa');
        if (maInput) maInput.value = out.MaSaoKe;
        await openStatementModal(context, out.MaSaoKe);
      }
    }));
    root.querySelector('#skOpen')?.addEventListener('submit', catchUi(context, async event => {
      event.preventDefault();
      const ma = root.querySelector('#skMa')?.value.trim();
      if (!ma) return context.showToast('Nhập mã sao kê (ví dụ SK26090001).', 'error');
      await openStatementModal(context, ma);
    }));
    await reload();
    root.querySelector('#openSmartRecon')?.addEventListener('click', () => context.navigate('ledger-reconciliation'));
  };

  const inits = {
    'ledger-handbook': initHandbook,
    'ledger-coa': initCoa,
    'ledger-periods': initPeriods,
    'ledger-expenses': initExpenses,
    'ledger-journals': initJournals,
    'ledger-nkc': initNkc,
    'ledger-gl': initGl,
    'ledger-trial': initTrial,
    'ledger-vat': initVat,
    'ledger-close': initClose,
    'ledger-kqkd': initKqkd,
    'ledger-cf': initCf,
    'ledger-bs': initBs,
    'ledger-assets': initAssets,
    'ledger-bank': initBank
  };

  window.FLY_LEDGER_DOCS = { open: openLedgerDocument, guess: guessDocLoai };
  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (inits[pageName]) {
        const root = document.querySelector('.ledger-page') || document.querySelector('.warehouse-page');
        try { await inits[pageName](root, context); }
        catch (error) { root.innerHTML = errorBox(error.message); }
        return;
      }
      return previous?.init?.(pageName, context);
    }
  };
})();
