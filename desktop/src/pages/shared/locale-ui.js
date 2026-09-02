(() => {
  const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  const pad = value => String(value).padStart(2, '0');
  const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
  const vietnamNow = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    return { year: get('year'), month: get('month'), day: get('day') };
  };
  const currentYear = () => Number(vietnamNow().year);
  const yearList = (selected) => {
    const selectedYear = Number(selected) || currentYear();
    const years = new Set([selectedYear, ...Array.from({ length: 16 }, (_, index) => currentYear() - 8 + index)]);
    return [...years].filter(year => year >= 2000 && year <= 2100).sort((a, b) => a - b);
  };
  const parseIsoDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  };
  const parseIsoMonth = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) };
  };
  const parseIsoDateTime = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) };
  };
  const options = (values, selected, labelFn) => values.map(value => {
    const matched = selected !== '' && selected != null && (Number(value) === Number(selected) || String(value) === String(selected));
    return `<option value="${value}" ${matched ? 'selected' : ''}>${labelFn ? labelFn(value) : value}</option>`;
  }).join('');

  const dateField = (id, iso = '', extraClass = '', optional = false) => {
    const now = vietnamNow();
    const parsed = parseIsoDate(iso) || { year: Number(now.year), month: Number(now.month), day: Number(now.day) };
    const days = Array.from({ length: daysInMonth(parsed.year, parsed.month) }, (_, index) => index + 1);
    const empty = optional ? '<option value="">—</option>' : '';
    const selectedDay = iso ? parsed.day : (optional ? '' : parsed.day);
    const selectedMonth = iso ? parsed.month : (optional ? '' : parsed.month);
    const selectedYear = iso ? parsed.year : (optional ? '' : parsed.year);
    const value = iso || (optional ? '' : `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`);
    return `<div class="fly-vi-date" data-kind="date" ${optional ? 'data-optional="1"' : ''}><select class="fly-vi-day" aria-label="Ngày">${empty}${options(days, selectedDay, day => `Ngày ${day}`)}</select><select class="fly-vi-month" aria-label="Tháng">${empty}${options([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], selectedMonth, month => MONTHS[month - 1])}</select><select class="fly-vi-year" aria-label="Năm">${empty}${options(yearList(parsed.year), selectedYear, year => `Năm ${year}`)}</select><input type="hidden" id="${id}" class="${extraClass}" value="${value}"></div>`;
  };

  const monthField = (id, ym = '') => {
    const now = vietnamNow();
    const parsed = parseIsoMonth(ym) || parseIsoMonth(`${now.year}-${now.month}`);
    return `<div class="fly-vi-date" data-kind="month"><select class="fly-vi-month" aria-label="Tháng">${options([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], parsed.month, month => MONTHS[month - 1])}</select><select class="fly-vi-year" aria-label="Năm">${options(yearList(parsed.year), parsed.year, year => `Năm ${year}`)}</select><input type="hidden" id="${id}" value="${ym || `${parsed.year}-${pad(parsed.month)}`}"></div>`;
  };

  const datetimeField = (id, isoLocal = '') => {
    const parsed = parseIsoDateTime(isoLocal) || parseIsoDateTime(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    const days = Array.from({ length: daysInMonth(parsed.year, parsed.month) }, (_, index) => index + 1);
    const hours = Array.from({ length: 24 }, (_, index) => index);
    const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
    const nearestMinute = minutes.reduce((best, item) => Math.abs(item - parsed.minute) < Math.abs(best - parsed.minute) ? item : best, 0);
    return `<div class="fly-vi-date fly-vi-datetime" data-kind="datetime"><select class="fly-vi-day" aria-label="Ngày">${options(days, parsed.day, day => `Ngày ${day}`)}</select><select class="fly-vi-month" aria-label="Tháng">${options([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], parsed.month, month => MONTHS[month - 1])}</select><select class="fly-vi-year" aria-label="Năm">${options(yearList(parsed.year), parsed.year, year => `Năm ${year}`)}</select><select class="fly-vi-hour" aria-label="Giờ">${options(hours, parsed.hour, hour => `${pad(hour)} giờ`)}</select><select class="fly-vi-minute" aria-label="Phút">${options(minutes, nearestMinute, minute => `${pad(minute)} phút`)}</select><input type="hidden" id="${id}" value="${isoLocal || `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}T${pad(parsed.hour)}:${pad(nearestMinute)}`}"></div>`;
  };

  const refillDays = (wrap, year, month, selectedDay) => {
    const daySelect = wrap.querySelector('.fly-vi-day');
    if (!daySelect) return selectedDay;
    const max = daysInMonth(year, month);
    const day = Math.min(Number(selectedDay) || 1, max);
    daySelect.innerHTML = options(Array.from({ length: max }, (_, index) => index + 1), day, value => `Ngày ${value}`);
    return day;
  };

  const writeHidden = wrap => {
    const hidden = wrap.querySelector('input[type="hidden"]');
    if (!hidden) return;
    if (wrap.dataset.optional === '1' && [...wrap.querySelectorAll('select')].some(select => select.value === '')) {
      hidden.value = '';
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const kind = wrap.dataset.kind;
    const year = Number(wrap.querySelector('.fly-vi-year').value);
    const month = Number(wrap.querySelector('.fly-vi-month').value);
    if (kind === 'month') {
      hidden.value = `${year}-${pad(month)}`;
    } else {
      const day = refillDays(wrap, year, month, wrap.querySelector('.fly-vi-day')?.value);
      if (kind === 'datetime') {
        const hour = Number(wrap.querySelector('.fly-vi-hour').value);
        const minute = Number(wrap.querySelector('.fly-vi-minute').value);
        hidden.value = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
      } else {
        hidden.value = `${year}-${pad(month)}-${pad(day)}`;
      }
    }
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const bindWidget = wrap => {
    if (wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';
    wrap.querySelectorAll('select').forEach(select => select.addEventListener('change', () => writeHidden(wrap)));
  };

  const mount = (root = document) => {
    root.querySelectorAll('.fly-vi-date:not([data-bound="1"])').forEach(bindWidget);
  };

  const refresh = hidden => {
    const wrap = hidden?.closest?.('.fly-vi-date');
    if (!wrap) return;
    const kind = wrap.dataset.kind;
    if (!hidden.value) {
      wrap.querySelectorAll('select').forEach(select => { select.value = ''; });
      return;
    }
    if (kind === 'month') {
      const parsed = parseIsoMonth(hidden.value) || parseIsoMonth(`${currentYear()}-${pad(new Date().getMonth() + 1)}`);
      wrap.querySelector('.fly-vi-year').value = String(parsed.year);
      wrap.querySelector('.fly-vi-month').value = String(parsed.month);
    } else {
      const parsed = kind === 'datetime' ? parseIsoDateTime(hidden.value) : parseIsoDate(hidden.value);
      if (!parsed) {
        hidden.value = '';
        wrap.querySelectorAll('select').forEach(select => { select.value = ''; });
        return;
      }
      wrap.querySelector('.fly-vi-year').value = String(parsed.year);
      wrap.querySelector('.fly-vi-month').value = String(parsed.month);
      refillDays(wrap, parsed.year, parsed.month, parsed.day);
      if (kind === 'datetime') {
        wrap.querySelector('.fly-vi-hour').value = String(parsed.hour);
        wrap.querySelector('.fly-vi-minute').value = String(parsed.minute - (parsed.minute % 5));
      }
    }
  };

  const hydrateNative = (root = document) => {
    root.querySelectorAll('input[type="date"], input[type="month"], input[type="datetime-local"]').forEach(input => {
      if (input.closest('.fly-vi-date')) return;
      if (input.hasAttribute('data-keep-native') || input.closest('[data-keep-native]') || input.closest('.audit-daterange') || input.closest('.warehouse-history-page') || input.closest('.warehouse-history-daterange') || input.closest('.payroll-period-picker') || input.closest('.accounting-payroll') || input.closest('.workforce-payroll-filter')) return;
      const type = input.getAttribute('type');
      const id = input.id || `fly-date-${Math.random().toString(36).slice(2, 8)}`;
      if (!input.id) input.id = id;
      const optional = !input.required;
      const html = type === 'month'
        ? monthField(id, input.value)
        : type === 'datetime-local'
          ? datetimeField(id, input.value)
          : dateField(id, input.value, input.className, optional);
      const holder = document.createElement('div');
      holder.innerHTML = html.trim();
      const widget = holder.firstElementChild;
      if (input.disabled) widget.querySelectorAll('select').forEach(select => { select.disabled = true; });
      input.replaceWith(widget);
      bindWidget(widget);
    });
  };

  const periodToolbar = (defaults, extraButtons = '', loadId = 'loadFinancialReport') => {
    const currentQuarter = defaults.quarter || `${defaults.year}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
    const quarterOptions = yearList(defaults.year).flatMap(year => [1, 2, 3, 4].map(quarter => {
      const value = `${year}-Q${quarter}`;
      return `<option value="${value}" ${value === currentQuarter ? 'selected' : ''}>Quý ${quarter}/${year}</option>`;
    })).join('');
    return `
    <article class="warehouse-table-card financial-report-filter"><div class="warehouse-toolbar"><div class="report-period-fields"><label><span>LOẠI KỲ</span><select id="reportPeriodType"><option value="day">Ngày</option><option value="month" selected>Tháng</option><option value="quarter">Quý</option><option value="year">Năm</option></select></label><label class="report-period-input" data-period-field="day"><span>NGÀY</span>${dateField('reportDay', defaults.day)}</label><label class="report-period-input active" data-period-field="month"><span>THÁNG</span>${monthField('reportMonth', defaults.month)}</label><label class="report-period-input" data-period-field="quarter"><span>QUÝ</span><select id="reportQuarter">${quarterOptions}</select></label><label class="report-period-input" data-period-field="year"><span>NĂM</span><select id="reportYear">${yearList(defaults.year).map(year => `<option value="${year}" ${String(year) === String(defaults.year) ? 'selected' : ''}>Năm ${year}</option>`).join('')}</select></label></div><div class="warehouse-toolbar-actions">${extraButtons}<button type="button" class="warehouse-primary" id="${loadId}">Lập báo cáo</button></div></div></article>`;
  };

  const hue = text => {
    let hash = 0;
    String(text || '').split('').forEach(char => { hash = ((hash << 5) - hash) + char.charCodeAt(0); hash |= 0; });
    return Math.abs(hash) % 360;
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const avatar = (text, extraClass = '') => {
    const letter = String(text || '?').trim().charAt(0).toUpperCase() || '?';
    const color = hue(text);
    return `<span class="fly-avatar ${extraClass}" style="background:hsl(${color} 38% 88%);color:hsl(${color} 42% 28%)">${letter}</span>`;
  };
  const person = (name, sub = '') => `<div class="fly-person">${avatar(name)}<div><strong>${esc(name || '—')}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
  const kpi = ({ icon, label, value, hint, tone = '' }) => `<article class="fly-kpi ${tone}"><span class="fly-kpi-icon"><svg><use href="#${icon}"/></svg></span><div><span>${label}</span><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div></article>`;
  const kpiGrid = (items, className = '') => `<div class="fly-kpi-grid ${esc(className)}">${(items || []).map(item => kpi(item)).join('')}</div>`;
  const bars = (items, empty = 'Chưa có dữ liệu trong kỳ.') => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return `<p class="warehouse-empty">${empty}</p>`;
    const max = Math.max(...list.map(item => Number(item.value) || 0), 1);
    return `<div class="fly-bars">${list.map(item => `<div class="fly-bar-row"><span class="fly-bar-label">${esc(item.label)}</span><div class="fly-bar-track"><i style="width:${Math.max(6, (Number(item.value) / max) * 100)}%"></i></div><b>${item.display}</b></div>`).join('')}</div>`;
  };
  const scan = (root = document) => {
    hydrateNative(root);
    mount(root);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(document));
  else scan(document);
  let scanQueued = false;
  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(() => { scanQueued = false; scan(document); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const reportPeriodDefaults = () => {
    const now = vietnamNow();
    let year = Number(now.year);
    let month = Number(now.month);
    if (Number(now.day) <= 3) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
    }
    const monthText = pad(month);
    const quarter = Math.floor((month - 1) / 3) + 1;
    return { day: `${now.year}-${now.month}-${now.day}`, month: `${year}-${monthText}`, quarter: `${year}-Q${quarter}`, year: String(year) };
  };
  const setReportPeriod = (root, type, period) => {
    const typeSelect = root.querySelector('#reportPeriodType');
    if (typeSelect) typeSelect.value = type;
    root.querySelectorAll('[data-period-field]').forEach(field => field.classList.toggle('active', field.dataset.periodField === type));
    const hidden = root.querySelector({ day: '#reportDay', month: '#reportMonth', quarter: '#reportQuarter', year: '#reportYear' }[type] || '#reportMonth');
    if (!hidden) return;
    hidden.value = period;
    refresh(hidden);
  };
  const fallbackBanner = (requestedLabel, shownLabel) => `<div class="report-period-fallback"><svg><use href="#i-warning"></use></svg><div><strong>${esc(requestedLabel)} chưa có chứng từ để vẽ biểu đồ</strong><span>Đang mở ${esc(shownLabel)} — kỳ gần nhất còn dữ liệu. Chọn lại kỳ trống rồi bấm Lập báo cáo nếu bạn muốn xem kỳ hiện tại.</span></div></div>`;
  const syncFromReport = (root, report) => {
    if (!report?.period) return;
    if (report.fallbackFrom?.label) root.dataset.reportFallbackFrom = report.fallbackFrom.label;
    setReportPeriod(root, report.period.periodType, report.period.period);
  };
  const activeFallbackBanner = (root, report) => {
    const from = report?.fallbackFrom?.label || root.dataset.reportFallbackFrom;
    if (!from || !report?.period?.label || from === report.period.label) return '';
    return fallbackBanner(from, report.period.label);
  };

  window.FLY_VI_DATE = { MONTHS, dateField, monthField, datetimeField, mount, refresh, hydrate: hydrateNative, periodToolbar };
  window.FLY_REPORT_PERIOD = { defaults: reportPeriodDefaults, set: setReportPeriod, syncFromReport, activeFallbackBanner };
  window.FLY_UI = { avatar, person, kpi, kpiGrid, bars, hue };
})();
