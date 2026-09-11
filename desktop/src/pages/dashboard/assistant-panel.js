(() => {
  const API_BASE = window.flyApi?.getApiBase() || window.FLY_API_BASE || 'http://127.0.0.1:3000/api';
  const token = localStorage.getItem('fly_token');
  let user = {};
  try { user = JSON.parse(localStorage.getItem('fly_user') || '{}'); } catch { user = {}; }

  const roleKey = String(user.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
  const chipsByRole = {
    'quản lý': [
      'In báo cáo tháng này',
      'Danh sách đơn mua tháng này',
      'In phiếu nhập tháng 8',
      'Công nợ NCC'
    ],
    'nhân viên mua hàng': [
      'Đề nghị kho nào chưa lập đơn?',
      'Đơn nào giá mua tăng so với lần trước?',
      'NCC nào đang giao thiếu?'
    ],
    'thủ kho': [
      'Mặt hàng nào dưới định mức?',
      'Giải thích tồn thấp tuần này',
      'Nếu tăng tồn an toàn 20% thì cần nhập thêm bao nhiêu?'
    ],
    'thu ngân': [
      'Ca này tiền mặt hệ thống là bao nhiêu? MoMo có vào két không?',
      'Danh sách hóa đơn bán tháng này',
      'Bao nhiêu hóa đơn MoMo trong ca?'
    ],
    'kế toán': [
      'Danh sách hóa đơn mua tháng này',
      'Chứng từ nào chờ ghi sổ?',
      'NCC công nợ lớn nhất?'
    ]
  };

  const UC_LABELS = {
    UC01: 'đăng nhập', UC02: 'quản lý tài khoản', UC03: 'nhật ký hệ thống',
    UC04: 'nhân viên, sản phẩm, khuyến mãi', UC05: 'duyệt đơn mua', UC06: 'duyệt phiếu xuất',
    UC07: 'duyệt điều chỉnh tồn', UC08: 'duyệt đổi trả', UC09: 'duyệt phiếu chi',
    UC10: 'dashboard và báo cáo', UC11: 'nhà cung cấp', UC12: 'đề nghị mua từ kho',
    UC13: 'đơn mua hàng', UC14: 'theo dõi giao hàng', UC15: 'tồn kho chi tiết',
    UC16: 'lập đề nghị mua', UC17: 'nhận hàng', UC18: 'phiếu nhập kho',
    UC19: 'phiếu xuất kho', UC20: 'kiểm kê', UC21: 'kiểm tra đổi trả',
    UC22: 'ca bán hàng', UC23: 'khách hàng tại quầy', UC24: 'lập hóa đơn',
    UC25: 'thanh toán hóa đơn', UC26: 'đổi trả tại quầy', UC27: 'đối chiếu hóa đơn mua',
    UC28: 'công nợ nhà cung cấp', UC29: 'phiếu thu ca', UC30: 'phân ca',
    UC31: 'lịch và chấm công', UC32: 'duyệt công', UC33: 'bảng lương',
    UC34: 'hệ thống tài khoản', UC35: 'kỳ kế toán', UC36: 'chi phí vận hành',
    UC37: 'chờ ghi sổ', UC38: 'sổ kế toán', UC39: 'khóa kỳ',
    UC40: 'bảng kê VAT', UC41: 'tài sản cố định', UC42: 'sao kê ngân hàng',
    UC43: 'kết quả kinh doanh'
  };

  const SOURCE_RULES = [
    [/notifications/i, 'Hộp thư'],
    [/admin\/dashboard|dashboard quản lý/i, 'Dashboard quản lý'],
    [/approvals/i, 'Hàng chờ duyệt'],
    [/store-profit-loss|income-statement|\bkqkd\b|lãi lỗ/i, 'KQKD'],
    [/payables|công nợ/i, 'Công nợ'],
    [/cash-flow|lưu chuyển/i, 'Lưu chuyển tiền tệ'],
    [/sales-shifts|báo cáo ca/i, 'Báo cáo ca'],
    [/purchase-requests|đề nghị mua/i, 'Đề nghị mua hàng'],
    [/purchase-orders|đơn mua/i, 'Đơn mua hàng'],
    [/warehouse\/dashboard|tổng quan kho/i, 'Tổng quan kho'],
    [/warehouse\/inventory|tồn kho/i, 'Tồn kho'],
    [/shifts\/current|ca bán|tóm tắt ca/i, 'Ca bán hàng'],
    [/unposted|chờ ghi sổ/i, 'Chờ ghi sổ'],
    [/purchase-invoices|hóa đơn mua/i, 'Hóa đơn mua hàng'],
    [/shift-settlements|phiếu thu/i, 'Ca và phiếu thu'],
    [/reconciliation|đối soát/i, 'Đối soát ngân hàng'],
    [/loyalty|khách hàng thân thiết|rfm/i, 'Khách hàng thân thiết']
  ];

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const padUc = (num) => `UC${String(Number(num)).padStart(2, '0')}`;

  const replaceUc = (value) => {
    let out = String(value ?? '');
    out = out.replace(/\bUC\s*0*(\d{1,2})\s*[–—−-]\s*UC\s*0*(\d{1,2})\b/gi, (_, a, b) => {
      const start = UC_LABELS[padUc(a)];
      const end = UC_LABELS[padUc(b)];
      return start && end ? `${start} đến ${end}` : 'các chức năng được cấp';
    });
    out = out.replace(/\bUC\s*0*(\d{1,2})\b/gi, (_, n) => UC_LABELS[padUc(n)] || 'chức năng được cấp');
    out = out.replace(/\buse[\s-]*cases?\b/gi, '');
    out = out.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1');
    return out.trim();
  };

  const hideApi = (value) => String(value ?? '')
    .replace(/\bGET\s+\/api\/[^\s,;)]+/gi, '')
    .replace(/\/api\/[a-z0-9/_\-?=&%.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const cleanText = (value) => hideApi(replaceUc(value));

  const sourceChip = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return '';
    for (const [re, label] of SOURCE_RULES) {
      if (re.test(text)) return label;
    }
    if (/\/api\//i.test(text) || /^GET\s+/i.test(text)) return 'Số liệu hệ thống';
    return cleanText(text);
  };

  const vndInt = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
    const raw = String(value ?? '').trim().replace(/\s*(đ|₫|VND|VNĐ)\s*$/i, '');
    if (!raw) return 0;
    if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) return Math.round(Number(raw.replace(/\./g, '')));
    const parsed = Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  };

  const tx = (key, fallback) => window.FLY_I18N?.t(key) || fallback || key;

  const prettyMoney = (value) => `${vndInt(value).toLocaleString('vi-VN')} đ`;

  const friendlyNetError = (error) => {
    const raw = String(error?.message || error || '');
    if (/failed to fetch|networkerror|load failed|err_connection|abort/i.test(raw)) {
      return tx('assist.failFetch', window.flyApi?.connectionErrorMessage?.(window.flyApi?.getOrigin?.())
        || 'Không kết nối được máy chủ. Chạy npm start, giữ cửa sổ đó mở, rồi thử lại.');
    }
    return raw || tx('assist.failGeneric', 'Không tải được số liệu trợ lý.');
  };

  const confidenceLabel = (value) => ({
    high: tx('assist.confHigh', 'Cao'),
    medium: tx('assist.confMid', 'Trung bình'),
    low: tx('assist.confLow', 'Thấp')
  }[String(value || '').toLowerCase()] || '');

  const moneyText = (value) => {
    const raw = String(value ?? '');
    if (/đ|₫|VND|VNĐ/i.test(raw) || /^-?\d{1,3}(\.\d{3})+/.test(raw.trim()) || typeof value === 'number') {
      return prettyMoney(value);
    }
    return raw.replace(/(\d)đ$/i, '$1 đ').replace(/(\d)₫$/i, '$1 ₫');
  };

  const decorateInline = (escaped) => {
    let html = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/(^|\s)#{1,6}\s+/g, '$1');
    html = html.replace(/(\d{1,3}(?:\.\d{3})+)(?:\s*)(đ|₫|VNĐ|VND)?/gi, (_, num) =>
      `<span class="assistant-money">${prettyMoney(num)}</span>`);
    html = html.replace(/(\d+)(?:\s*)(đ|₫)\b/gi, (_, num) =>
      `<span class="assistant-money">${prettyMoney(num)}</span>`);
    return html;
  };

  const renderTable = (lines) => {
    const rows = lines
      .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
      .filter((cells) => cells.length && !cells.every((cell) => /^:?-{2,}:?$/.test(cell)));
    if (!rows.length) return '';
    const hasHeader = rows[0].every((cell) => !/\d{3,}/.test(cell));
    const body = hasHeader ? rows.slice(1) : rows;
    return `<div class="assistant-metric-row">${body.map((cells) => {
      const [label, ...rest] = cells;
      const amount = rest.join(' · ');
      return `<article class="assistant-metric"><small>${decorateInline(escapeHtml(cleanText(label)))}</small><strong class="assistant-money">${escapeHtml(moneyText(amount || '—'))}</strong></article>`;
    }).join('')}</div>`;
  };

  const renderBotText = (raw) => {
    const text = cleanText(raw).replace(/\r\n/g, '\n').trim();
    if (!text) return '';
    const lines = text.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*\|/.test(line) || (line.includes('|') && /^\s*\|?\s*[-:| ]+\s*\|/.test(lines[i + 1] || ''))) {
        const block = [];
        while (i < lines.length && (lines[i].includes('|') || (!lines[i].trim() && lines[i + 1]?.includes('|')))) {
          if (lines[i].trim()) block.push(lines[i]);
          i += 1;
          if (i < lines.length && !lines[i].includes('|') && lines[i].trim()) break;
        }
        out.push(renderTable(block));
        continue;
      }
      if (/^\s*---+\s*$/.test(line)) { i += 1; continue; }
      if (/^\s*#{1,6}\s+/.test(line)) {
        out.push(`<p class="assistant-md-title">${decorateInline(escapeHtml(cleanText(line.replace(/^\s*#{1,6}\s+/, ''))))}</p>`);
        i += 1;
        continue;
      }
      if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
          i += 1;
        }
        out.push(`<ul class="assistant-md-list">${items.map((item) => `<li>${decorateInline(escapeHtml(cleanText(item)))}</li>`).join('')}</ul>`);
        continue;
      }
      if (!line.trim()) { i += 1; continue; }
      out.push(`<p>${decorateInline(escapeHtml(cleanText(line)))}</p>`);
      i += 1;
    }
    return `<div class="assistant-md">${out.join('')}</div>`;
  };

  const history = [];
  let sending = false;
  let lastKind = null;
  let syncingMonth = false;
  let activeTab = 'chat';
  let loaded = { today: false, alerts: false, insights: false };

  const KIND_ASK = {
    po: 'danh sách đơn mua',
    purchase: 'danh sách hóa đơn mua',
    sales: 'danh sách hóa đơn bán',
    receipt: 'danh sách phiếu nhập',
    issue: 'danh sách phiếu xuất',
    request: 'danh sách đề nghị mua',
    return: 'danh sách đổi trả',
    count: 'danh sách kiểm kê',
    'receipt-cash': 'danh sách phiếu thu ca',
    payment: 'danh sách phiếu chi',
    payables: 'công nợ NCC',
    payroll: 'lương gộp',
    'low-stock': 'tồn thấp',
    'warehouse-report': 'báo cáo thủ kho',
    'trial-balance': 'cân đối phát sinh',
    kqkd: 'tải KQKD',
    'cash-flow': 'lưu chuyển tiền tệ',
    'balance-sheet': 'bảng cân đối kế toán',
    'store-report': 'in báo cáo'
  };

  const padMonth = (value) => String(value).padStart(2, '0');
  const hanoiNow = () => {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    return new Date(`${key}T12:00:00+07:00`);
  };
  const currentMonthKey = () => {
    const now = hanoiNow();
    return `${now.getFullYear()}-${padMonth(now.getMonth() + 1)}`;
  };
  const monthSelect = () => document.getElementById('assistantMonth');
  const selectedMonthKey = () => {
    const value = monthSelect()?.value;
    if (!value || value === 'this') return currentMonthKey();
    return value;
  };
  const monthPhrase = () => {
    if (monthSelect()?.value === 'this') return 'tháng này';
    const [year, month] = selectedMonthKey().split('-');
    return `tháng ${Number(month)}/${year}`;
  };
  const hasPeriodHint = (text) => {
    const folded = String(text || '').toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /thang\s*(nay|truoc|\d)|hom\s*(nay|qua)|\b20\d{2}-0?[1-9]\b|\b20\d{2}-1[0-2]\b|\b(0?[1-9]|1[0-2])\s*[/\-]\s*20\d{2}\b/.test(folded);
  };
  const withSelectedMonth = (question) => {
    if (!question || hasPeriodHint(question)) return question;
    return `${question} ${monthPhrase()}`;
  };
  const fillMonthSelect = () => {
    const select = monthSelect();
    if (!select) return;
    const now = hanoiNow();
    const parts = ['<option value="this">Tháng này</option>'];
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      parts.push(`<option value="${year}-${padMonth(month)}">Tháng ${month}/${year}</option>`);
    }
    select.innerHTML = parts.join('');
    select.value = 'this';
  };
  const syncMonthSelect = (period) => {
    const select = monthSelect();
    if (!select || !period) return;
    const key = period.key && String(period.key).length >= 7
      ? String(period.key).slice(0, 7)
      : (period.year && period.month ? `${period.year}-${padMonth(period.month)}` : '');
    if (!key) return;
    syncingMonth = true;
    if (key === currentMonthKey()) select.value = 'this';
    else if ([...select.options].some((option) => option.value === key)) select.value = key;
    else {
      const [year, month] = key.split('-');
      const extra = document.createElement('option');
      extra.value = key;
      extra.textContent = `Tháng ${Number(month)}/${year}`;
      select.appendChild(extra);
      select.value = key;
    }
    syncingMonth = false;
  };

  const drawer = () => document.getElementById('assistantDrawer');
  const backdrop = () => document.getElementById('assistantBackdrop');
  const thread = () => document.getElementById('assistantThread');
  const errorBox = () => document.getElementById('assistantError');
  const input = () => document.getElementById('assistantInput');
  const sendBtn = () => document.getElementById('assistantSend');
  const fab = () => document.getElementById('assistantFab');
  const isOpen = () => drawer()?.classList.contains('is-open');

  const syncTriggers = (open) => {
    const expanded = open ? 'true' : 'false';
    document.getElementById('menuAssistant')?.setAttribute('aria-expanded', expanded);
    fab()?.setAttribute('aria-expanded', expanded);
    fab()?.classList.toggle('is-hidden', open);
  };

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  });

  const isAssistantProviderError = (response, data) => {
    const code = String(data?.code || '');
    const message = String(data?.message || '');
    if (response.status === 429 && (code === 'ASSISTANT_RATE' || /giới hạn tốc độ|hết .*câu hỏi trợ lý/i.test(message))) return true;
    if (response.status !== 401) return false;
    return code === 'ASSISTANT_AUTH'
      || code === 'ASSISTANT_NOT_CONFIGURED'
      || /ASSISTANT_API_KEY|Khóa Genspark|Khóa CodeCraft/i.test(message);
  };

  const handleAuth = (response, data) => {
    if (response.status !== 401) return false;
    if (isAssistantProviderError(response, data)) return false;
    localStorage.removeItem('fly_token');
    localStorage.removeItem('fly_user');
    window.location.href = '../login/login.html';
    return true;
  };

  const setError = (message) => {
    const box = errorBox();
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || '';
  };

  const goScreen = (target) => {
    if (!target) return;
    const ok = window.FLY_NAV?.open(target);
    if (ok) closeDrawer();
    else window.showToast?.('Không tìm thấy màn hình này trên vai trò hiện tại.', 'error');
  };

  const pillsHtml = (actions) => {
    const list = (actions || []).filter((item) => item?.target && item?.label);
    if (!list.length) return '';
    return `<div class="assistant-actions">${list.map((item) =>
      `<button type="button" class="assistant-pill" data-nav="${escapeHtml(item.target)}">${escapeHtml(cleanText(item.label))}</button>`
    ).join('')}</div>`;
  };

  const evidenceHtml = (rows) => {
    const list = (rows || []).filter(Boolean);
    if (!list.length) return '';
    return `<div class="assistant-evidence"><strong>Bằng chứng</strong><div class="assistant-metric-row">${
      list.map((row) => {
        const nums = Array.isArray(row.numbers) ? row.numbers : (row.evidence ? [row.evidence] : []);
        const src = sourceChip(row.source);
        return `<article class="assistant-metric">
          <small>${escapeHtml(cleanText(row.claim || 'Nhận định'))}</small>
          ${nums.map((num) => `<strong class="assistant-money">${escapeHtml(moneyText(num))}</strong>`).join('')}
          ${src ? `<span class="assistant-source-chip">${escapeHtml(src)}</span>` : ''}
          ${row.confidence ? `<span class="assistant-source-chip">${escapeHtml(tx('assist.confidence', 'Tin cậy'))}: ${escapeHtml(confidenceLabel(row.confidence) || row.confidence)}</span>` : ''}
        </article>`;
      }).join('')
    }</div></div>`;
  };

  const sourcesHtml = (items) => {
    const chips = [...new Set((items || []).map(sourceChip).filter(Boolean))];
    if (!chips.length) return '';
    return `<div class="assistant-sources"><strong>Nguồn</strong><div class="assistant-source-chips">${
      chips.map((chip) => `<span class="assistant-source-chip">${escapeHtml(chip)}</span>`).join('')
    }</div></div>`;
  };

  const fmtDate = (value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
    } catch {
      return String(value).slice(0, 10);
    }
  };

  const actionButtons = () => `<div class="assistant-invoice-actions">
        <button type="button" class="assistant-pill" data-doc-action="view">Xem</button>
        <button type="button" class="assistant-pill" data-doc-action="system">In hệ thống</button>
        <button type="button" class="assistant-pill" data-doc-action="official">In giấy trắng</button>
        <button type="button" class="assistant-pill" data-doc-action="download">Tải PDF</button>
      </div>`;

  const docsHtml = (turn) => {
    const kind = turn.kind || turn.invoiceKind;
    const loai = turn.loai || '';
    const rows = turn.items || turn.invoices || [];
    const report = turn.report;
    const print = turn.print?.mau || turn.print || null;
    if (!kind && !report && !print && !rows.length) return '';
    const printAttr = print ? encodeURIComponent(JSON.stringify(print)) : '';
    const reportName = {
      'store-report': 'Báo cáo cửa hàng', kqkd: 'KQKD', payroll: 'Lương gộp',
      'warehouse-report': 'Báo cáo thủ kho', 'trial-balance': 'Cân đối phát sinh',
      'cash-flow': 'Lưu chuyển tiền tệ', 'balance-sheet': 'Bảng cân đối kế toán'
    }[kind] || 'Báo cáo';
    const periodLabel = report?.period?.label || '';
    const metrics = report?.kpis ? `<header class="assistant-report-head">${escapeHtml(reportName)}${periodLabel ? ` · ${escapeHtml(periodLabel)}` : ''}</header>
      <div class="assistant-metric-row">
        <article class="assistant-metric"><small>Doanh thu thuần</small><strong class="assistant-money">${escapeHtml(prettyMoney(report.kpis.doanhThuThuan))}</strong></article>
        <article class="assistant-metric"><small>Lãi gộp</small><strong class="assistant-money">${escapeHtml(prettyMoney(report.kpis.laiGop))}</strong></article>
        <article class="assistant-metric"><small>KQKD</small><strong class="assistant-money">${escapeHtml(prettyMoney(report.kpis.kqkdLoiNhuan))}</strong></article>
      </div>` : '';
    const list = rows.length ? `<div class="assistant-doc-list">${rows.map((row, index) => `<article class="assistant-doc-card${index === 0 ? ' is-selected' : ''}" data-doc-id="${escapeHtml(row.id)}" data-loai="${escapeHtml(row.loai || loai)}">
          <div class="assistant-doc-top">
            <strong class="assistant-doc-id">${escapeHtml(row.soHd || row.id)}</strong>
            <span class="assistant-doc-money assistant-money">${escapeHtml(prettyMoney(row.tien))}</span>
          </div>
          <p class="assistant-doc-partner">${escapeHtml(row.ncc || '—')}</p>
          <p class="assistant-doc-meta"><span class="assistant-doc-date">${escapeHtml(fmtDate(row.ngay))}</span><span class="assistant-doc-status">${escapeHtml(cleanText(row.trangThai || '—'))}</span></p>
        </article>`).join('')}</div>` : '';
    return `<div class="assistant-invoice-box assistant-report-box" data-kind="${escapeHtml(kind || '')}" data-loai="${escapeHtml(loai)}" data-print="${printAttr}">
      ${metrics}${list}${actionButtons()}
    </div>`;
  };

  const downloadPrint = async (config, skin = 'system') => {
    if (!window.FLY_PRINT?.build) throw new Error('Chưa tải được máy in chứng từ.');
    const resolved = { ...config, skin };
    const html = window.FLY_PRINT.build(resolved);
    const defaultName = window.FLY_PRINT.pdfFileName?.(resolved) || 'bao-cao.pdf';
    if (window.flyDesktop?.savePrintPdf) {
      const result = await window.flyDesktop.savePrintPdf({ html, defaultName, landscape: false });
      if (result?.canceled) return;
      window.showToast?.('Đã tải PDF.', 'success');
      return;
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = String(defaultName).replace(/\.pdf$/i, '.html');
    link.click();
    URL.revokeObjectURL(link.href);
    window.showToast?.('Đã tải bản in.', 'success');
  };

  const loadDocPrintConfig = async (box) => {
    const selected = box.querySelector('.assistant-doc-card.is-selected') || box.querySelector('.assistant-doc-card');
    const id = selected?.dataset.docId;
    const kind = box.dataset.kind;
    if (id && kind) {
      const response = await fetch(`${API_BASE}/assistant/docs/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, {
        headers: authHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (handleAuth(response, data)) return null;
      if (!response.ok) throw new Error(friendlyPrintError(data.message || 'Không tải được chứng từ.'));
      return data.print || data.mau || null;
    }
    if (!box.dataset.print) throw new Error('Chưa có mẫu in.');
    try {
      return JSON.parse(decodeURIComponent(box.dataset.print));
    } catch {
      throw new Error('Chưa có mẫu in.');
    }
  };

  const friendlyPrintError = (error) => {
    const raw = String(error?.message || error || '');
    if (/poolPromise/i.test(raw) || (/pool/i.test(raw) && /is not defined/i.test(raw))) {
      return 'Không in được chứng từ. Chạy lại npm start rồi thử lại.';
    }
    return raw || 'Không in được chứng từ.';
  };

  const bindDocsOnce = () => {
    [thread(), document.getElementById('assistantScenario')].filter(Boolean).forEach((root) => {
    if (root.dataset.docBound === '1') return;
    root.dataset.docBound = '1';
    root.addEventListener('click', async (event) => {
      const row = event.target.closest('.assistant-doc-card[data-doc-id]');
      if (row && !event.target.closest('[data-doc-action]')) {
        const box = row.closest('.assistant-invoice-box');
        if (!box) return;
        box.querySelectorAll('.assistant-doc-card.is-selected').forEach((item) => item.classList.remove('is-selected'));
        row.classList.add('is-selected');
        return;
      }
      const button = event.target.closest('[data-doc-action]');
      if (!button) return;
      const box = button.closest('.assistant-invoice-box, .assistant-scenario-result');
      if (!box) return;
      try {
        const config = await loadDocPrintConfig(box);
        if (!config) return;
        const action = button.dataset.docAction;
        if (action === 'download') {
          await downloadPrint(config, 'system');
          return;
        }
        if (!window.FLY_PRINT?.show) throw new Error('Chưa tải được máy in chứng từ.');
        const skin = action === 'official' ? 'official' : 'system';
        await window.FLY_PRINT.show({ ...config, skin });
      } catch (error) {
        window.showToast?.(friendlyPrintError(error), 'error');
      }
    });
    });
  };

  const renderThread = () => {
    const root = thread();
    if (!root) return;
    if (!history.length) {
      root.innerHTML = `<div class="assistant-empty">
        <div class="assistant-orb" aria-hidden="true"><svg><use href="#i-sparkle"></use></svg></div>
        <h3>Chào ${escapeHtml(user.TenNV || 'bạn')}</h3>
        <p>Trợ lý Fly đọc số liệu đúng quyền ${escapeHtml(user.TenVaiTro || '')}. Hỏi danh sách chứng từ hoặc báo cáo theo tháng để xem / in / tải ngay trong khung chat.</p>
      </div>`;
      return;
    }
    root.innerHTML = history.map((turn) => {
      if (turn.role === 'user') {
        return `<div class="assistant-turn is-user"><div class="assistant-bubble">${escapeHtml(turn.text)}</div></div>`;
      }
      const hideReportBlurb = turn.report?.kpis && !turn.report.empty;
      const body = turn.typing
        ? `<span class="assistant-typing" aria-label="Đang soạn"><i></i><i></i><i></i></span>`
        : `${hideReportBlurb ? '' : renderBotText(turn.text)}${docsHtml(turn)}${turn.report || turn.print ? '' : evidenceHtml(turn.evidence)}${pillsHtml(turn.nextActions)}${sourcesHtml(turn.sources)}`;
      return `<div class="assistant-turn is-bot"><div class="assistant-bubble">${body}</div></div>`;
    }).join('');
    root.querySelectorAll('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => goScreen(button.dataset.nav));
    });
    bindDocsOnce();
    root.scrollTop = root.scrollHeight;
  };

  const fillChips = () => {
    const wrap = document.getElementById('assistantChips');
    if (!wrap) return;
    const chips = chipsByRole[roleKey] || chipsByRole['quản lý'];
    wrap.innerHTML = chips.map((text) => `<button type="button" class="assistant-chip">${escapeHtml(text)}</button>`).join('');
    wrap.querySelectorAll('.assistant-chip').forEach((button) => {
      button.addEventListener('click', () => sendQuestion(button.textContent));
    });
  };

  const skeleton = () => `<div class="assistant-workspace"><div class="assistant-skel"></div><div class="assistant-skel"></div></div>`;

  const renderToday = (pack) => {
    const root = document.getElementById('assistantToday');
    if (!root) return;
    const kpis = pack.kpis || [];
    const priorities = pack.priorities || [];
    root.innerHTML = `<div class="assistant-workspace">
      ${pack.llmConfigured === false ? '<p class="assistant-muted">Chưa cấu hình LLM — số liệu engine vẫn hiện. Điền ASSISTANT_API_KEY rồi restart npm start nếu cần diễn giải chat.</p>' : ''}
      <div class="assistant-kpi-row">${kpis.map((chip) =>
        `<div class="assistant-kpi"><small>${escapeHtml(cleanText(chip.label))}</small><strong class="assistant-money">${escapeHtml(moneyText(chip.value))}</strong></div>`
      ).join('') || '<p class="assistant-muted">Không lấy được KPI trong phạm vi quyền.</p>'}</div>
      <div class="assistant-card">
        <h3>3 việc ưu tiên</h3>
        <div class="assistant-priority">${priorities.map((item) =>
          `<article><b>${item.order}</b><div><strong>${escapeHtml(cleanText(item.title))}</strong><p>${escapeHtml(cleanText(item.why))}</p></div>${
            item.nextAction ? `<button type="button" class="assistant-pill" data-nav="${escapeHtml(item.nextAction.target)}">${escapeHtml(cleanText(item.nextAction.label))}</button>` : ''
          }</article>`
        ).join('')}</div>
      </div>
    </div>`;
    root.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => goScreen(button.dataset.nav)));
  };

  const renderAlerts = (pack) => {
    const root = document.getElementById('assistantAlerts');
    if (!root) return;
    const anomalies = pack.anomalies || [];
    const risks = pack.risks || [];
    const card = (item, kind) => `<div class="assistant-card">
      <span class="assistant-badge ${escapeHtml(item.severity || item.band || 'Low')}">${escapeHtml(item.severity || item.band || 'Low')}</span>
      <h3>${escapeHtml(cleanText(item.object || item.type))}</h3>
      <p>${escapeHtml(cleanText(item.evidence))}</p>
      ${evidenceHtml([{ claim: kind, numbers: [item.evidence], source: item.source, confidence: item.confidence || item.band }])}
      ${pillsHtml(item.nextAction ? [item.nextAction] : [])}
    </div>`;
    root.innerHTML = `<div class="assistant-workspace">
      <div class="assistant-card"><h3>Cảnh báo</h3><p class="assistant-muted">${anomalies.length ? '' : 'Không có tín hiệu bất thường trong dữ liệu hiện có.'}</p></div>
      ${anomalies.map((item) => card(item, 'Cảnh báo')).join('')}
      <div class="assistant-card"><h3>Điểm rủi ro</h3><p class="assistant-muted">Điểm 0–100 do engine; AI không tự chấm.</p></div>
      ${risks.map((item) => card(item, 'Rủi ro')).join('') || '<p class="assistant-muted">Chưa đủ tín hiệu để chấm rủi ro.</p>'}
    </div>`;
    root.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => goScreen(button.dataset.nav)));
  };

  const renderInsights = (pack) => {
    const root = document.getElementById('assistantInsights');
    if (!root) return;
    const cards = (pack?.insights || []).slice(0, 6);
    if (!cards.length) {
      root.innerHTML = `<div class="assistant-workspace"><div class="assistant-card"><p class="assistant-muted">${escapeHtml(tx('assist.insightsEmpty', 'Chưa có thẻ phân tích cho vai trò này hoặc chưa đủ số liệu.'))}</p></div></div>`;
      return;
    }
    root.innerHTML = `<div class="assistant-workspace">${cards.map((card) => {
      const conf = card.evidence?.find((row) => row.confidence)?.confidence || 'medium';
      return `<div class="assistant-card">
        <div class="assistant-card-top"><h3>${escapeHtml(cleanText(card.title))}</h3><span class="assistant-badge ${escapeHtml(conf)}">${escapeHtml(confidenceLabel(conf) || conf)}</span></div>
        ${renderBotText(card.body)}
        ${evidenceHtml(card.evidence)}
        ${pillsHtml(card.nextAction ? [card.nextAction] : [])}
      </div>`;
    }).join('')}</div>`;
    root.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => goScreen(button.dataset.nav)));
  };

  const apiGet = async (path) => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 25000);
    try {
      const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders(), signal: ctrl.signal });
      const data = await response.json().catch(() => ({}));
      if (handleAuth(response, data)) return null;
      if (!response.ok) throw new Error(data.message || tx('assist.failGeneric', 'Không tải được số liệu trợ lý.'));
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(tx('assist.failSlow', 'Máy chủ trả lời chậm. Thử lại.'));
      throw new Error(friendlyNetError(error));
    } finally {
      window.clearTimeout(timer);
    }
  };

  const ensureTab = async (tab) => {
    if (tab === 'chat' || tab === 'scenario') return;
    const map = {
      today: { path: '/assistant/brief', render: renderToday, key: 'today' },
      alerts: { path: '/assistant/alerts', render: renderAlerts, key: 'alerts' },
      insights: { path: `/assistant/insights?month=${encodeURIComponent(selectedMonthKey())}`, render: renderInsights, key: 'insights' }
    };
    const spec = map[tab];
    if (!spec || loaded[spec.key]) return;
    const root = document.getElementById(tab === 'today' ? 'assistantToday' : tab === 'alerts' ? 'assistantAlerts' : 'assistantInsights');
    if (root) root.innerHTML = skeleton();
    try {
      const pack = await apiGet(spec.path);
      if (!pack) return;
      spec.render(pack);
      loaded[spec.key] = true;
    } catch (error) {
      if (root) {
        root.innerHTML = `<div class="assistant-workspace"><div class="assistant-card">
          <p>${escapeHtml(friendlyNetError(error))}</p>
          <button type="button" class="assistant-pill" data-retry-tab="${escapeHtml(tab)}">${escapeHtml(tx('common.retry', 'Thử lại'))}</button>
        </div></div>`;
        root.querySelector('[data-retry-tab]')?.addEventListener('click', () => {
          loaded[spec.key] = false;
          ensureTab(tab);
        });
      }
    }
  };

  const SCENARIO_META = {
    revenue_drop: { label: 'Doanh thu giảm X%', hint: 'Giảm khối lượng bán, GV tỷ lệ theo DT. Lương/cước giữ nguyên. Không trừ trả NCC.', max: 80, value: 10, param: 'X (%)' },
    revenue_up: { label: 'Doanh thu tăng X%', hint: 'Tăng khối lượng bán, GV tỷ lệ theo DT. Lương/cước giữ nguyên. Không trừ trả NCC.', max: 80, value: 10, param: 'X (%)' },
    purchase_price: { label: 'Giá mua NCC tăng X%', hint: 'GV thuần tăng theo %. DT giữ nguyên. Lãi gộp và KQKD giảm đúng phần vốn tăng.', max: 80, value: 5, param: 'X (%)' },
    safety_stock: { label: 'Tăng tồn an toàn X%', hint: 'Định mức mới = ceil(định mức × hệ số). Chỉ hàng trong quyền tồn. Không lập PO.', max: 200, value: 20, param: 'X (%)' },
    demand_4w: { label: 'Nhu cầu = TB 4 tuần', hint: 'Nhu cầu = bán 28 ngày / 4 tuần. Nguy cơ khi ngày tồn còn lại < 7. Không ghi đề nghị.', max: 0, value: 0, param: '' },
    tender_mix: { label: 'Tỷ trọng TM → MoMo X%', hint: 'Chuyển X% tiền mặt phiếu thu sang MoMo/QR. Két giảm, 112 tăng cùng số. DT không đổi.', max: 80, value: 20, param: 'X (%) TM→MoMo' }
  };

  const scenarioParamsOf = (type, pct) => {
    if (type === 'revenue_drop') return { dropPct: pct, changePct: -Math.abs(pct) };
    if (type === 'revenue_up') return { changePct: Math.abs(pct) };
    if (type === 'purchase_price' || type === 'safety_stock') return { bumpPct: pct };
    if (type === 'tender_mix') return { shiftPct: pct };
    return {};
  };

  const moneyOrText = (value) => (typeof value === 'number' ? prettyMoney(value) : moneyText(value));

  const compareRowsHtml = (data) => {
    const current = data.current || {};
    const projected = data.projected || {};
    const delta = data.delta || {};
    const percent = data.percent || {};
    const labels = {
      doanhThuThuan: 'Doanh thu thuần', loiNhuanGop: 'Lãi gộp', kqkdLoiNhuan: 'KQKD',
      giaVonThuan: 'Giá vốn thuần', bienLaiGop: 'Biên lãi gộp (%)',
      tienMat: 'Két (TM)', momo: 'MoMo / QR', nganHang112: '112 ước',
      tongCanNhap: 'SL cần nhập thêm', tongTienUoc: 'Tiền ước nhập thêm', soMatHangThieu: 'Số MH thiếu',
      soNguyCo: 'Số MH nguy cơ'
    };
    const keys = Object.keys(projected);
    if (!keys.length) return '';
    return `<div class="assistant-compare">${keys.map((key) => `<div class="assistant-compare-row">
        <span>${escapeHtml(labels[key] || cleanText(key))}</span>
        <strong class="assistant-money">${escapeHtml(key === 'bienLaiGop' ? `${current[key] ?? '—'}%` : moneyOrText(current[key] ?? '—'))}</strong>
        <strong class="assistant-money">${escapeHtml(key === 'bienLaiGop' ? `${projected[key] ?? '—'}%` : moneyOrText(projected[key]))}</strong>
        <em>${escapeHtml(delta[key] == null ? '—' : (key === 'bienLaiGop' ? `${delta[key]}` : prettyMoney(delta[key])))}${percent[key] != null ? ` (${percent[key]}%)` : ''}</em>
      </div>`).join('')}</div>`;
  };

  const renderScenarioForm = () => {
    const root = document.getElementById('assistantScenario');
    if (!root) return;
    if (root.dataset.ready === '1') return;
    root.dataset.ready = '1';
    root.innerHTML = `<div class="assistant-workspace">
      <div class="assistant-deny-banner">Trợ lý được hỏi đáp, soạn thảo, điều hướng — không được duyệt phiếu chi, hoàn tiền, phân quyền hay bất kỳ nút phê duyệt nào.</div>
      <div class="assistant-card">
        <h3>${escapeHtml(tx('assist.scenarioTitle', 'Kịch bản có kiểm soát'))}</h3>
        <p class="assistant-muted">${escapeHtml(tx('assist.scenarioLead', 'Engine tính. AI không bịa công thức. Không lập PO, không ghi sổ. Tháng lấy từ ô Tháng trên widget.'))}</p>
        <form class="assistant-form" id="assistantScenarioForm">
          <label>${escapeHtml(tx('assist.scenarioType', 'Loại'))}
            <select id="scenarioType">${Object.entries(SCENARIO_META).map(([id, meta]) =>
              `<option value="${id}">${escapeHtml(tx(`assist.sc.${id}`, meta.label))}</option>`
            ).join('')}</select>
          </label>
          <p class="assistant-scenario-hint" id="scenarioHint"></p>
          <label id="scenarioParamLabel">${escapeHtml(tx('assist.scenarioPct', 'Tham số'))}
            <input id="scenarioParam" type="number" min="0" max="80" value="10">
          </label>
          <button type="submit" class="assistant-send">${escapeHtml(tx('assist.scenarioRun', 'Phân tích'))}</button>
        </form>
      </div>
      <div class="assistant-card" id="assistantScenarioCatalog">
        <h3>Kịch bản nghiệp vụ cửa hàng</h3>
        <p class="assistant-muted" id="scenarioCatalogLead">Bấm một thẻ để hỏi trợ lý. Lọc theo từ khóa. Engine số nằm ở form trên.</p>
        <input id="scenarioCatalogQ" type="search" placeholder="Tìm kịch bản: công nợ, ca, SOP, KM..." autocomplete="off">
        <div id="scenarioCatalogList" class="assistant-scenario-groups">Đang tải kịch bản...</div>
      </div>
      <div id="scenarioResult"></div>
    </div>`;
    const typeSel = document.getElementById('scenarioType');
    const param = document.getElementById('scenarioParam');
    const label = document.getElementById('scenarioParamLabel');
    const hint = document.getElementById('scenarioHint');
    const syncType = () => {
      const meta = SCENARIO_META[typeSel.value] || SCENARIO_META.revenue_drop;
      hint.textContent = tx(`assist.scHint.${typeSel.value}`, meta.hint);
      const hide = typeSel.value === 'demand_4w';
      label.hidden = hide;
      param.disabled = hide;
      if (!hide) {
        param.max = meta.max;
        param.value = meta.value;
        label.firstChild.textContent = `${meta.param} `;
      }
    };
    typeSel.addEventListener('change', syncType);
    syncType();
    document.getElementById('assistantScenarioForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const box = document.getElementById('scenarioResult');
      box.innerHTML = skeleton();
      try {
        const type = typeSel.value;
        const pct = Number(param.value);
        const params = { ...scenarioParamsOf(type, pct), period: selectedMonthKey(), month: selectedMonthKey() };
        const response = await fetch(`${API_BASE}/assistant/scenario`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ type, params })
        });
        const data = await response.json().catch(() => ({}));
        if (handleAuth(response, data)) return;
        if (!response.ok) throw new Error(data.message || tx('assist.scenarioFail', 'Không chạy được kịch bản.'));
        const lines = (data.lines || []).slice(0, 8).map((row) =>
          `<li>${escapeHtml(row.MaSP || '')} ${escapeHtml(row.TenSP || '')} — ${escapeHtml(String(row.canNhapThem ?? row.daysLeft ?? ''))}${row.tienUoc ? ` · ${prettyMoney(row.tienUoc)}` : ''}</li>`
        ).join('');
        const printAttr = data.print ? encodeURIComponent(JSON.stringify(data.print)) : '';
        box.innerHTML = `<div class="assistant-card assistant-scenario-result" data-kind="store-report" data-print="${printAttr}">
          <h3>${escapeHtml(cleanText(data.title || tx('assist.scenarioResult', 'Kết quả')))}</h3>
          <p class="assistant-scenario-block"><strong>${escapeHtml(tx('assist.scenarioAssume', 'Giả định'))}</strong> ${escapeHtml(cleanText(data.assumption || ''))}</p>
          ${data.formula ? `<p class="assistant-scenario-block"><strong>${escapeHtml(tx('assist.scenarioFormula', 'Công thức'))}</strong> ${escapeHtml(data.formula)}</p>` : ''}
          ${data.fallback ? `<p class="assistant-muted">${escapeHtml(cleanText(data.fallback))}</p>` : ''}
          <div class="assistant-compare-head"><span></span><span>${escapeHtml(tx('assist.now', 'Hiện tại'))}</span><span>${escapeHtml(tx('assist.whatif', 'Kịch bản'))}</span><span>${escapeHtml(tx('assist.delta', 'Chênh'))}</span></div>
          ${compareRowsHtml(data)}
          ${lines ? `<ul class="assistant-md-list">${lines}</ul>` : ''}
          ${evidenceHtml(data.evidence)}
          ${pillsHtml(data.nextActions || [])}
          ${data.print ? actionButtons() : ''}
        </div>`;
        box.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => goScreen(button.dataset.nav)));
      } catch (error) {
        box.innerHTML = `<div class="assistant-card"><p>${escapeHtml(friendlyNetError(error))}</p></div>`;
      }
    });
    const catalogRoot = document.getElementById('scenarioCatalogList');
    const catalogLead = document.getElementById('scenarioCatalogLead');
    let catalogGroups = [];
    const foldText = (text) => String(text || '').toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const paintCatalog = (query = '') => {
      if (!catalogRoot) return;
      const q = foldText(query);
      const groups = catalogGroups.map((group) => ({
        group: group.group,
        scenarios: (group.scenarios || []).filter((item) => {
          if (!q) return true;
          return foldText(`${item.title} ${item.prompt}`).includes(q);
        })
      })).filter((group) => group.scenarios.length);
      if (!groups.length) {
        catalogRoot.innerHTML = '<p class="assistant-muted">Không có kịch bản khớp từ khóa hoặc quyền của bạn.</p>';
        return;
      }
      catalogRoot.innerHTML = groups.map((group) => `<section class="assistant-sc-group"><h4>${escapeHtml(group.group)}</h4><div class="assistant-sc-grid">${group.scenarios.map((item) => `<button type="button" class="assistant-sc-card" data-sc="${escapeHtml(item.id)}" data-engine="${escapeHtml(item.engine?.type || '')}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.prompt)}</span></button>`).join('')}</div></section>`).join('');
      catalogRoot.querySelectorAll('.assistant-sc-card').forEach((card) => {
        card.addEventListener('click', () => {
          const id = card.dataset.sc;
          const found = catalogGroups.flatMap((group) => group.scenarios).find((item) => item.id === id);
          if (!found) return;
          if (found.engine?.type && SCENARIO_META[found.engine.type]) {
            typeSel.value = found.engine.type;
            syncType();
          }
          sendQuestion(found.prompt);
        });
      });
    };
    fetch(`${API_BASE}/assistant/scenarios`, { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (handleAuth(response, data)) return;
        if (!response.ok) throw new Error(data.message || 'Không tải được kịch bản.');
        catalogGroups = data.groups || [];
        if (catalogLead && data.lead) catalogLead.textContent = `${data.lead} (${data.total || 0} kịch bản trong quyền của bạn).`;
        paintCatalog();
      })
      .catch((error) => {
        if (catalogRoot) catalogRoot.innerHTML = `<p class="assistant-muted">${escapeHtml(friendlyNetError(error))}</p>`;
      });
    document.getElementById('scenarioCatalogQ')?.addEventListener('input', (event) => paintCatalog(event.target.value));
  };

  const setTab = (tab) => {
    activeTab = tab;
    document.querySelectorAll('#assistantTabs button').forEach((button) => {
      const on = button.dataset.tab === tab;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.assistant-pane').forEach((pane) => {
      pane.classList.toggle('is-active', pane.dataset.pane === tab);
    });
    if (tab === 'scenario') renderScenarioForm();
    else ensureTab(tab);
  };

  const openDrawer = () => {
    const shade = backdrop();
    if (shade) {
      shade.hidden = false;
      window.requestAnimationFrame(() => shade.classList.add('is-open'));
    }
    drawer()?.classList.add('is-open');
    syncTriggers(true);
    setTimeout(() => input()?.focus(), 180);
    ensureTab('today');
  };

  const closeDrawer = () => {
    const shade = backdrop();
    shade?.classList.remove('is-open');
    drawer()?.classList.remove('is-open');
    if (shade) {
      window.setTimeout(() => {
        if (!isOpen()) shade.hidden = true;
      }, 220);
    }
    syncTriggers(false);
  };

  const sendQuestion = async (raw) => {
    const question = withSelectedMonth(String(raw || input()?.value || '').trim());
    if (!question || sending) return;
    setTab('chat');
    sending = true;
    sendBtn().disabled = true;
    setError('');
    history.push({ role: 'user', text: question });
    history.push({ role: 'bot', text: '', typing: true, sources: [] });
    input().value = '';
    renderThread();
    try {
      const payloadHistory = history
        .filter((turn) => !turn.typing)
        .slice(-6)
        .map((turn) => ({ role: turn.role === 'bot' ? 'assistant' : 'user', text: turn.text }));
      const response = await fetch(`${API_BASE}/assistant/ask`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ question, history: payloadHistory.slice(0, -1) })
      });
      const data = await response.json().catch(() => ({}));
      if (handleAuth(response, data)) return;
      history.pop();
      if (!response.ok) {
        const message = data.message
          || (response.status === 401 ? 'Khóa Genspark không hợp lệ hoặc đã thu hồi. Kiểm tra ASSISTANT_API_KEY rồi chạy lại npm start.' : '')
          || (response.status === 429 ? 'Genspark đang giới hạn tốc độ. Đợi một lát rồi hỏi lại, hoặc mở đúng màn hình dashboard.' : '')
          || 'Trợ lý tạm không trả lời được.';
        history.push({ role: 'bot', text: message, sources: [] });
        setError(message);
      } else {
        const kind = data.kind || data.invoiceKind || null;
        if (kind) lastKind = kind;
        syncMonthSelect(data.period);
        history.push({
          role: 'bot',
          text: data.answer || 'Không có nội dung trả lời.',
          sources: data.sources || [],
          evidence: data.evidence || [],
          nextActions: data.nextActions || [],
          invoices: data.invoices || data.items || [],
          invoiceKind: data.invoiceKind || data.kind || null,
          kind,
          loai: data.loai || null,
          items: data.items || data.invoices || [],
          report: data.report || null,
          print: data.print || null,
          period: data.period || null
        });
      }
    } catch {
      history.pop();
      const message = 'Không kết nối được máy chủ. Kiểm tra npm start rồi hỏi lại.';
      history.push({ role: 'bot', text: message, sources: [] });
      setError(message);
    } finally {
      sending = false;
      sendBtn().disabled = false;
      renderThread();
      input()?.focus();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    fillChips();
    fillMonthSelect();
    bindDocsOnce();
    renderThread();
    monthSelect()?.addEventListener('change', () => {
      loaded.insights = false;
      if (activeTab === 'insights') ensureTab('insights');
      if (syncingMonth || sending || !lastKind) return;
      sendQuestion(`${KIND_ASK[lastKind] || 'danh sách'} ${monthPhrase()}`);
    });
    const toggleWidget = (event) => {
      event.preventDefault();
      if (isOpen()) closeDrawer();
      else openDrawer();
    };
    document.getElementById('menuAssistant')?.addEventListener('click', toggleWidget);
    fab()?.addEventListener('click', toggleWidget);
    document.getElementById('assistantClose')?.addEventListener('click', closeDrawer);
    backdrop()?.addEventListener('click', closeDrawer);
    sendBtn()?.addEventListener('click', () => sendQuestion());
    input()?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendQuestion();
      }
    });
    document.getElementById('assistantTabs')?.addEventListener('click', (event) => {
      const tab = event.target.closest('button')?.dataset.tab;
      if (tab) setTab(tab);
    });
    window.FLY_ESCAPE?.register({ isOpen, close: closeDrawer });
  });
})();
