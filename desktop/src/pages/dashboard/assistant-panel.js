(() => {
  const API_BASE = window.flyApi?.getApiBase() || window.FLY_API_BASE || 'http://127.0.0.1:3000/api';
  const token = localStorage.getItem('fly_token');
  let user = {};
  try { user = JSON.parse(localStorage.getItem('fly_user') || '{}'); } catch { user = {}; }

  const roleKey = String(user.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
  const chipsByRole = {
    'quản lý': [
      'Hôm nay cần chú ý gì?',
      'Vì sao tháng này có lãi nhưng tiền mặt giảm?',
      'Phiếu PO nào đáng chú ý trước khi duyệt?',
      'Nếu doanh thu giảm 10% thì lãi gộp thế nào?'
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
      'Tôi còn hóa đơn nháp không?',
      'Bao nhiêu hóa đơn MoMo trong ca?'
    ],
    'kế toán': [
      'Tại sao trả NCC không làm giảm LN lần nữa?',
      'Chứng từ nào chờ ghi sổ?',
      'NCC công nợ lớn nhất?',
      'Vì sao MoMo không vào két?'
    ]
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const history = [];
  let sending = false;
  let activeTab = 'chat';
  let loaded = { today: false, alerts: false, insights: false };

  const drawer = () => document.getElementById('assistantDrawer');
  const backdrop = () => document.getElementById('assistantBackdrop');
  const thread = () => document.getElementById('assistantThread');
  const errorBox = () => document.getElementById('assistantError');
  const input = () => document.getElementById('assistantInput');
  const sendBtn = () => document.getElementById('assistantSend');
  const fab = () => document.getElementById('assistantFab');
  const isOpen = () => drawer()?.classList.contains('is-open');

  const moneyText = (value) => String(value ?? '').replace(/(\d)đ$/i, '$1 đ').replace(/(\d)₫$/i, '$1 ₫');

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

  const handleAuth = (response) => {
    if (response.status !== 401) return false;
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
      `<button type="button" class="assistant-pill" data-nav="${escapeHtml(item.target)}">${escapeHtml(item.label)}</button>`
    ).join('')}</div>`;
  };

  const evidenceHtml = (rows) => {
    const list = (rows || []).filter(Boolean);
    if (!list.length) return '';
    return `<div class="assistant-evidence"><strong>Nhận định · Bằng chứng · Nguồn · Độ tin cậy</strong>${
      list.map((row) => {
        const nums = Array.isArray(row.numbers) ? row.numbers.join(' · ') : (row.evidence || '');
        return `${escapeHtml(row.claim || 'Nhận định')} — ${escapeHtml(nums)} — ${escapeHtml(row.source || '')} — ${escapeHtml(row.confidence || '')}`;
      }).join('<br>')
    }</div>`;
  };

  const renderThread = () => {
    const root = thread();
    if (!root) return;
    if (!history.length) {
      root.innerHTML = `<div class="assistant-empty">
        <div class="assistant-orb" aria-hidden="true"><svg><use href="#i-sparkle"></use></svg></div>
        <h3>Chào ${escapeHtml(user.TenNV || 'bạn')}</h3>
        <p>Trợ lý Fly đọc số liệu đúng quyền ${escapeHtml(user.TenVaiTro || '')}. Tab Hôm nay tự tổng hợp — không cần hỏi từng câu.</p>
      </div>`;
      return;
    }
    root.innerHTML = history.map((turn) => {
      if (turn.role === 'user') {
        return `<div class="assistant-turn is-user"><div class="assistant-bubble">${escapeHtml(turn.text)}</div></div>`;
      }
      const body = turn.typing
        ? `<span class="assistant-typing" aria-label="Đang soạn"><i></i><i></i><i></i></span>`
        : `${escapeHtml(turn.text)}${evidenceHtml(turn.evidence)}${pillsHtml(turn.nextActions)}${
          (turn.sources || []).length
            ? `<div class="assistant-sources"><strong>Nguồn</strong>${turn.sources.map((item) => escapeHtml(item)).join('<br>')}</div>`
            : ''
        }`;
      return `<div class="assistant-turn is-bot"><div class="assistant-bubble">${body}</div></div>`;
    }).join('');
    root.querySelectorAll('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => goScreen(button.dataset.nav));
    });
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
        `<div class="assistant-kpi"><small>${escapeHtml(chip.label)}</small><strong>${escapeHtml(moneyText(chip.value))}</strong></div>`
      ).join('') || '<p class="assistant-muted">Không lấy được KPI trong phạm vi quyền.</p>'}</div>
      <div class="assistant-card">
        <h3>3 việc ưu tiên</h3>
        <div class="assistant-priority">${priorities.map((item) =>
          `<article><b>${item.order}</b><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.why)}</p></div>${
            item.nextAction ? `<button type="button" class="assistant-pill" data-nav="${escapeHtml(item.nextAction.target)}">${escapeHtml(item.nextAction.label)}</button>` : ''
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
      <h3>${escapeHtml(item.object || item.type)}</h3>
      <p>${escapeHtml(item.evidence)}</p>
      ${evidenceHtml([{ claim: kind, numbers: [item.evidence], source: item.source, confidence: item.confidence || item.band }])}
      ${pillsHtml(item.nextAction ? [item.nextAction] : [])}
    </div>`;
    root.innerHTML = `<div class="assistant-workspace">
      <div class="assistant-card"><h3>Cảnh báo</h3><p class="assistant-muted">${anomalies.length ? '' : 'Không có tín hiệu bất thường trong dữ liệu hiện có.'}</p></div>
      ${anomalies.map((item) => card(item, 'Anomaly')).join('')}
      <div class="assistant-card"><h3>Risk score</h3><p class="assistant-muted">Điểm 0–100 do engine; AI không tự chấm.</p></div>
      ${risks.map((item) => card(item, 'Risk')).join('') || '<p class="assistant-muted">Chưa đủ tín hiệu để chấm rủi ro.</p>'}
    </div>`;
    root.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => goScreen(button.dataset.nav)));
  };

  const renderInsights = (pack) => {
    const root = document.getElementById('assistantInsights');
    if (!root) return;
    const cards = pack.insights || [];
    root.innerHTML = `<div class="assistant-workspace">${cards.map((card) =>
      `<div class="assistant-card"><h3>${escapeHtml(card.title)}</h3><p style="white-space:pre-wrap">${escapeHtml(card.body)}</p>${evidenceHtml(card.evidence)}${pillsHtml(card.nextAction ? [card.nextAction] : [])}</div>`
    ).join('') || '<p class="assistant-muted">Chưa có thẻ phân tích cho vai trò này.</p>'}</div>`;
    root.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => goScreen(button.dataset.nav)));
  };

  const apiGet = async (path) => {
    const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    if (handleAuth(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không tải được Intelligence Center.');
    return data;
  };

  const ensureTab = async (tab) => {
    if (tab === 'chat') return;
    const map = {
      today: { path: '/assistant/brief', render: renderToday, key: 'today' },
      alerts: { path: '/assistant/alerts', render: renderAlerts, key: 'alerts' },
      insights: { path: '/assistant/insights', render: renderInsights, key: 'insights' }
    };
    const spec = map[tab];
    if (!spec || loaded[spec.key]) return;
    const root = document.getElementById(tab === 'today' ? 'assistantToday' : tab === 'alerts' ? 'assistantAlerts' : 'assistantInsights');
    if (root) root.innerHTML = skeleton();
    try {
      spec.render(await apiGet(spec.path));
      loaded[spec.key] = true;
    } catch (error) {
      if (root) root.innerHTML = `<div class="assistant-workspace"><div class="assistant-card"><p>${escapeHtml(error.message)}</p></div></div>`;
    }
  };

  const renderScenarioForm = () => {
    const root = document.getElementById('assistantScenario');
    if (!root || root.dataset.ready === '1') return;
    root.dataset.ready = '1';
    root.innerHTML = `<div class="assistant-workspace">
      <div class="assistant-card">
        <h3>What-if có kiểm soát</h3>
        <p class="assistant-muted">Engine tính. AI không bịa công thức. Không lập PO, không ghi sổ.</p>
        <form class="assistant-form" id="assistantScenarioForm">
          <label>Loại kịch bản
            <select id="scenarioType">
              <option value="revenue_drop">Doanh thu giảm X% → lãi gộp / KQKD</option>
              <option value="safety_stock">Tăng tồn an toàn X% → cần nhập thêm</option>
              <option value="demand_4w">Nhu cầu TB 4 tuần → nguy cơ thiếu</option>
            </select>
          </label>
          <label id="scenarioParamLabel">Tham số (%)
            <input id="scenarioParam" type="number" min="0" max="80" value="10">
          </label>
          <button type="submit" class="assistant-send">Phân tích</button>
        </form>
      </div>
      <div id="scenarioResult"></div>
    </div>`;
    const typeSel = document.getElementById('scenarioType');
    const param = document.getElementById('scenarioParam');
    const label = document.getElementById('scenarioParamLabel');
    typeSel.addEventListener('change', () => {
      const hide = typeSel.value === 'demand_4w';
      label.hidden = hide;
      param.disabled = hide;
      if (typeSel.value === 'safety_stock') { param.max = 200; param.value = 20; }
      else { param.max = 80; param.value = 10; }
    });
    document.getElementById('assistantScenarioForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const box = document.getElementById('scenarioResult');
      box.innerHTML = skeleton();
      try {
        const type = typeSel.value;
        const params = type === 'revenue_drop' ? { dropPct: Number(param.value) }
          : type === 'safety_stock' ? { bumpPct: Number(param.value) } : {};
        const response = await fetch(`${API_BASE}/assistant/scenario`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ type, params })
        });
        if (handleAuth(response)) return;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Không chạy được kịch bản.');
        const projected = data.projected || {};
        const projHtml = Object.keys(projected).length
          ? `<p>${Object.entries(projected).map(([key, value]) => `<strong>${escapeHtml(key)}</strong>: ${escapeHtml(typeof value === 'number' ? value.toLocaleString('vi-VN') : value)}`).join('<br>')}</p>`
          : '';
        const lines = (data.lines || []).slice(0, 8).map((row) =>
          `<li>${escapeHtml(row.MaSP || '')} ${escapeHtml(row.TenSP || '')} — ${escapeHtml(row.canNhapThem ?? row.daysLeft ?? '')}</li>`
        ).join('');
        box.innerHTML = `<div class="assistant-card">
          <h3>${escapeHtml(data.title || 'Kết quả')}</h3>
          <p>${escapeHtml(data.assumption || '')}</p>
          ${data.fallback ? `<p class="assistant-muted">${escapeHtml(data.fallback)}</p>` : ''}
          ${projHtml}
          ${lines ? `<ul>${lines}</ul>` : ''}
          ${evidenceHtml(data.evidence)}
        </div>`;
      } catch (error) {
        box.innerHTML = `<div class="assistant-card"><p>${escapeHtml(error.message)}</p></div>`;
      }
    });
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
    const question = String(raw || input()?.value || '').trim();
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
      if (handleAuth(response)) return;
      history.pop();
      if (!response.ok) {
        const message = data.message || 'Trợ lý tạm không trả lời được.';
        history.push({ role: 'bot', text: message, sources: [] });
        setError(message);
      } else {
        history.push({
          role: 'bot',
          text: data.answer || 'Không có nội dung trả lời.',
          sources: data.sources || [],
          evidence: data.evidence || [],
          nextActions: data.nextActions || []
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
    renderThread();
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
