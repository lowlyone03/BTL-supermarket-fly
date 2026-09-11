(() => {
  const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  const VN_TZ = 'Asia/Ho_Chi_Minh';
  const pad = value => String(value).padStart(2, '0');
  const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
  const vietnamNow = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    return { year: get('year'), month: get('month'), day: get('day') };
  };
  const currentYear = () => Number(vietnamNow().year);
  const YEAR_PRESETS = {
    birth: { min: () => 1940, max: now => now - 16 },
    issue: { min: () => 1980, max: now => now },
    hire: { min: () => 1990, max: now => now + 1 },
    report: { min: now => now - 8, max: now => now + 7 },
    expiry: { min: now => now - 2, max: now => now + 20 },
    general: { min: () => 2000, max: now => now + 5 }
  };
  const PRESET_TITLES = {
    birth: 'Năm sinh',
    issue: 'Năm cấp CCCD',
    hire: 'Năm vào làm',
    expiry: 'Năm hết hạn',
    report: 'Năm kỳ báo cáo',
    general: 'Chọn năm'
  };
  const inferYearPreset = ({ id = '', extraClass = '', dataset = {} } = {}) => {
    const explicit = String(dataset.dateRange || dataset.yearRange || dataset.yearPreset || '').trim();
    if (explicit && YEAR_PRESETS[explicit]) return explicit;
    const hay = `${id} ${extraClass}`.toLowerCase();
    if (/ngaysinh|birthday|namsinh/.test(hay)) return 'birth';
    if (/ngaycapcccd|ngaycap/.test(hay)) return 'issue';
    if (/ngayvaolam|ngaybatdau/.test(hay)) return 'hire';
    if (/\bexpiry\b|hansudung|ngayhethan/.test(hay)) return 'expiry';
    if (/report(day|month|year)/.test(hay)) return 'report';
    return 'general';
  };
  const yearList = (selected, preset = 'report') => {
    const now = currentYear();
    const spec = YEAR_PRESETS[preset] || YEAR_PRESETS.general;
    const min = spec.min(now);
    const max = spec.max(now);
    const years = [];
    for (let year = min; year <= max; year += 1) years.push(year);
    const selectedYear = Number(selected);
    if (Number.isInteger(selectedYear) && selectedYear >= 1800 && selectedYear <= 2200 && !years.includes(selectedYear)) {
      years.push(selectedYear);
      years.sort((a, b) => a - b);
    }
    return years;
  };
  const calendarKeyFromDate = date => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  };
  /** YYYY-MM-DD theo lịch VN. Không new Date('2026-09-09') / không cắt UTC từ ISO. */
  const dateKeyVN = value => {
    if (value == null || value === '') return null;
    if (value instanceof Date) return calendarKeyFromDate(value);
    const text = String(value).trim();
    if (!text || text === '—') return null;
    const exact = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (exact) return `${exact[1]}-${exact[2]}-${exact[3]}`;
    return calendarKeyFromDate(new Date(text));
  };
  const formatDateVN = value => {
    const key = dateKeyVN(value);
    if (!key) return '—';
    const [year, month, day] = key.split('-');
    return `${day}/${month}/${year}`;
  };
  const parseIsoDate = value => {
    const key = dateKeyVN(value);
    if (!key) return null;
    const [year, month, day] = key.split('-');
    return { year: Number(year), month: Number(month), day: Number(day) };
  };
  const parseIsoMonth = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) };
  };
  const parseIsoDateTime = value => {
    const text = String(value || '').trim();
    if (!text) return null;
    if (value instanceof Date || /Z|[+-]\d{2}:\d{2}$/.test(text)) {
      const dt = value instanceof Date ? value : new Date(text);
      if (Number.isNaN(dt.getTime())) return null;
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(dt);
      const get = type => Number(parts.find(part => part.type === type)?.value);
      return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
    }
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) };
  };
  const options = (values, selected, labelFn) => values.map(value => {
    const matched = selected !== '' && selected != null && (Number(value) === Number(selected) || String(value) === String(selected));
    return `<option value="${value}" ${matched ? 'selected' : ''}>${labelFn ? labelFn(value) : value}</option>`;
  }).join('');
  const yearChevron = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const yearControlHtml = (years, selectedYear, optional) => {
    const empty = optional ? '<option value="">—</option>' : '';
    const hasValue = selectedYear !== '' && selectedYear != null;
    const label = hasValue ? `Năm ${selectedYear}` : 'Chọn năm';
    return `<div class="fly-vi-year-wrap"><select class="fly-vi-year" tabindex="-1" aria-hidden="true">${empty}${options(years, hasValue ? selectedYear : '', year => `Năm ${year}`)}</select><button type="button" class="fly-vi-year-trigger${hasValue ? '' : ' is-empty'}" aria-haspopup="listbox" aria-expanded="false" aria-label="Chọn năm"><span>${label}</span>${yearChevron}</button></div>`;
  };

  const dateField = (id, iso = '', extraClass = '', optional = false, preset) => {
    const range = preset && YEAR_PRESETS[preset] ? preset : inferYearPreset({ id, extraClass });
    const now = vietnamNow();
    const parsed = parseIsoDate(iso) || { year: Number(now.year), month: Number(now.month), day: Number(now.day) };
    const days = Array.from({ length: daysInMonth(parsed.year, parsed.month) }, (_, index) => index + 1);
    const empty = optional ? '<option value="">—</option>' : '';
    const selectedDay = iso ? parsed.day : (optional ? '' : parsed.day);
    const selectedMonth = iso ? parsed.month : (optional ? '' : parsed.month);
    const selectedYear = iso ? parsed.year : (optional ? '' : parsed.year);
    const value = iso || (optional ? '' : `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`);
    return `<div class="fly-vi-date" data-kind="date" data-year-preset="${range}" ${optional ? 'data-optional="1"' : ''}><select class="fly-vi-day" aria-label="Ngày">${empty}${options(days, selectedDay, day => `Ngày ${day}`)}</select><select class="fly-vi-month" aria-label="Tháng">${empty}${options([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], selectedMonth, month => MONTHS[month - 1])}</select>${yearControlHtml(yearList(selectedYear, range), selectedYear, optional)}<input type="hidden" id="${id}" class="${extraClass}" value="${value}"></div>`;
  };

  const monthField = (id, ym = '', preset) => {
    const range = preset && YEAR_PRESETS[preset] ? preset : inferYearPreset({ id });
    const now = vietnamNow();
    const parsed = parseIsoMonth(ym) || parseIsoMonth(`${now.year}-${now.month}`);
    return `<div class="fly-vi-date" data-kind="month" data-year-preset="${range}"><select class="fly-vi-month" aria-label="Tháng">${options([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], parsed.month, month => MONTHS[month - 1])}</select>${yearControlHtml(yearList(parsed.year, range), parsed.year, false)}<input type="hidden" id="${id}" value="${ym || `${parsed.year}-${pad(parsed.month)}`}"></div>`;
  };

  const datetimeField = (id, isoLocal = '', preset) => {
    const range = preset && YEAR_PRESETS[preset] ? preset : inferYearPreset({ id });
    const parsed = parseIsoDateTime(isoLocal) || parseIsoDateTime(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    const days = Array.from({ length: daysInMonth(parsed.year, parsed.month) }, (_, index) => index + 1);
    const hours = Array.from({ length: 24 }, (_, index) => index);
    const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
    const nearestMinute = minutes.reduce((best, item) => Math.abs(item - parsed.minute) < Math.abs(best - parsed.minute) ? item : best, 0);
    return `<div class="fly-vi-date fly-vi-datetime" data-kind="datetime" data-year-preset="${range}"><select class="fly-vi-day" aria-label="Ngày">${options(days, parsed.day, day => `Ngày ${day}`)}</select><select class="fly-vi-month" aria-label="Tháng">${options([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], parsed.month, month => MONTHS[month - 1])}</select>${yearControlHtml(yearList(parsed.year, range), parsed.year, false)}<select class="fly-vi-hour" aria-label="Giờ">${options(hours, parsed.hour, hour => `${pad(hour)} giờ`)}</select><select class="fly-vi-minute" aria-label="Phút">${options(minutes, nearestMinute, minute => `${pad(minute)} phút`)}</select><input type="hidden" id="${id}" value="${isoLocal || `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}T${pad(parsed.hour)}:${pad(nearestMinute)}`}"></div>`;
  };

  const refillDays = (wrap, year, month, selectedDay) => {
    const daySelect = wrap.querySelector('.fly-vi-day');
    if (!daySelect) return selectedDay;
    const max = daysInMonth(year, month);
    const optional = wrap.dataset.optional === '1';
    const empty = optional ? '<option value="">—</option>' : '';
    const day = (selectedDay === '' || selectedDay == null) && optional
      ? ''
      : Math.min(Number(selectedDay) || 1, max);
    daySelect.innerHTML = `${empty}${options(Array.from({ length: max }, (_, index) => index + 1), day, value => `Ngày ${value}`)}`;
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

  const syncYearTrigger = select => {
    const trigger = select?.closest?.('.fly-vi-year-wrap')?.querySelector('.fly-vi-year-trigger');
    if (!trigger) return;
    const label = trigger.querySelector('span');
    const selected = select.options[select.selectedIndex];
    if (label) label.textContent = selected?.value ? selected.textContent : 'Chọn năm';
    trigger.classList.toggle('is-empty', !select.value);
    trigger.disabled = select.disabled;
  };

  const refillYears = (wrap, selectedYear) => {
    const yearSelect = wrap.querySelector('.fly-vi-year');
    if (!yearSelect) return;
    const hidden = wrap.querySelector('input[type="hidden"]');
    const preset = wrap.dataset.yearPreset || inferYearPreset({ id: hidden?.id || '', extraClass: hidden?.className || '' });
    wrap.dataset.yearPreset = preset;
    const optional = wrap.dataset.optional === '1';
    const empty = optional ? '<option value="">—</option>' : '';
    const current = selectedYear === '' || selectedYear == null ? '' : selectedYear;
    yearSelect.innerHTML = `${empty}${options(yearList(current, preset), current, year => `Năm ${year}`)}`;
    yearSelect.value = current === '' ? '' : String(current);
    syncYearTrigger(yearSelect);
  };

  let yearPanel = null;
  let yearPanelSelect = null;
  let yearPanelDecade = 0;

  const closeYearPanel = () => {
    if (!yearPanel) return;
    yearPanel.hidden = true;
    yearPanel.replaceChildren();
    document.querySelectorAll('.fly-vi-year-trigger[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    yearPanelSelect = null;
  };

  const ensureYearPanel = () => {
    if (yearPanel) return yearPanel;
    yearPanel = document.createElement('div');
    yearPanel.className = 'fly-vi-year-panel';
    yearPanel.hidden = true;
    yearPanel.setAttribute('role', 'dialog');
    yearPanel.setAttribute('aria-label', 'Chọn năm');
    document.body.appendChild(yearPanel);
    yearPanel.addEventListener('mousedown', event => event.stopPropagation());
    yearPanel.addEventListener('click', event => event.stopPropagation());
    return yearPanel;
  };

  const decadesOf = years => [...new Set(years.map(year => Math.floor(year / 10) * 10))].sort((a, b) => a - b);

  const defaultDecade = (years, selected, preset) => {
    if (selected) return Math.floor(Number(selected) / 10) * 10;
    const list = decadesOf(years);
    if (preset === 'birth') {
      const guess = Math.floor((currentYear() - 28) / 10) * 10;
      return list.includes(guess) ? guess : (list[Math.max(0, Math.floor(list.length * 0.6))] || list[0] || guess);
    }
    const nowDecade = Math.floor(currentYear() / 10) * 10;
    return list.includes(nowDecade) ? nowDecade : (list[list.length - 1] || nowDecade);
  };

  const pickYearValue = (select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncYearTrigger(select);
    closeYearPanel();
  };

  const renderYearPanelBody = (select, trigger, searchText = '') => {
    const panel = ensureYearPanel();
    const wrap = select.closest('.fly-vi-date');
    const preset = wrap?.dataset.yearPreset || 'general';
    const years = Array.from(select.options).filter(opt => opt.value !== '').map(opt => Number(opt.value));
    const hasEmpty = Array.from(select.options).some(opt => opt.value === '');
    const selected = select.value;
    const useGrid = years.length > 20;
    const decades = decadesOf(years);
    if (!decades.includes(yearPanelDecade)) {
      yearPanelDecade = defaultDecade(years, selected, preset);
    }
    const decadeYears = years.filter(year => Math.floor(year / 10) * 10 === yearPanelDecade);
    const title = PRESET_TITLES[preset] || 'Chọn năm';
    const hint = preset === 'birth'
      ? 'Nhân viên cửa hàng — chọn năm sinh (có thể gõ 1994)'
      : 'Gõ 4 số để nhảy tới năm';

    panel.innerHTML = useGrid ? `
      <div class="fly-vi-year-head">
        <div>
          <strong>${title}</strong>
          <small>${hint}</small>
        </div>
      </div>
      <input class="fly-vi-year-search" type="text" inputmode="numeric" maxlength="4" placeholder="Ví dụ: 1988" autocomplete="off" aria-label="Tìm năm" value="${searchText.replaceAll('"', '&quot;')}">
      <div class="fly-vi-year-decades">${decades.map(decade => `<button type="button" class="fly-vi-year-chip${decade === yearPanelDecade ? ' is-active' : ''}" data-decade="${decade}">${decade}</button>`).join('')}</div>
      <div class="fly-vi-year-grid" role="listbox">${decadeYears.map(year => `<button type="button" class="fly-vi-year-cell${String(year) === String(selected) ? ' selected' : ''}" role="option" data-year="${year}" aria-selected="${String(year) === String(selected)}">${year}</button>`).join('')}</div>
      ${hasEmpty ? '<button type="button" class="fly-vi-year-clear" data-year="">Để trống</button>' : ''}
    ` : `
      <div class="fly-vi-year-head"><div><strong>${title}</strong><small>Cuộn để chọn năm</small></div></div>
      <div class="fly-vi-year-list" role="listbox">
        ${hasEmpty ? `<button type="button" class="fly-vi-year-option${selected === '' ? ' selected' : ''}" data-year="">—</button>` : ''}
        ${years.map(year => `<button type="button" class="fly-vi-year-option${String(year) === String(selected) ? ' selected' : ''}" role="option" data-year="${year}">Năm ${year}</button>`).join('')}
      </div>
    `;

    panel.querySelectorAll('[data-year]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        pickYearValue(select, button.getAttribute('data-year'));
      });
    });
    panel.querySelectorAll('[data-decade]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        yearPanelDecade = Number(button.dataset.decade);
        const typed = panel.querySelector('.fly-vi-year-search')?.value || '';
        renderYearPanelBody(select, trigger, typed);
        panel.querySelector('.fly-vi-year-search')?.focus();
      });
    });
    const search = panel.querySelector('.fly-vi-year-search');
    if (search) {
      search.addEventListener('input', () => {
        const raw = search.value.replace(/\D/g, '').slice(0, 4);
        if (raw !== search.value) search.value = raw;
        let nextDecade = yearPanelDecade;
        if (raw.length === 4) nextDecade = Math.floor(Number(raw) / 10) * 10;
        else if (raw.length === 3) nextDecade = Number(raw) * 10;
        if (decades.includes(nextDecade) && nextDecade !== yearPanelDecade) {
          yearPanelDecade = nextDecade;
          renderYearPanelBody(select, trigger, raw);
          const next = yearPanel?.querySelector('.fly-vi-year-search');
          if (next) {
            next.focus();
            next.value = raw;
            next.setSelectionRange(raw.length, raw.length);
          }
          return;
        }
        if (raw.length === 4) {
          panel.querySelectorAll('.fly-vi-year-cell').forEach(cell => {
            cell.classList.toggle('selected', cell.dataset.year === raw);
          });
        }
      });
      search.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const raw = search.value.replace(/\D/g, '');
          if (raw.length === 4 && years.includes(Number(raw))) pickYearValue(select, raw);
        }
      });
    }

    panel.hidden = false;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, useGrid ? 296 : 220);
    const panelWidth = Math.min(width, window.innerWidth - 24);
    panel.style.width = `${panelWidth}px`;
    panel.style.left = `${Math.min(Math.max(12, rect.left), window.innerWidth - panelWidth - 12)}px`;
    panel.style.top = `${Math.max(10, rect.bottom + 8)}px`;
    requestAnimationFrame(() => {
      const menuHeight = panel.offsetHeight;
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - panel.offsetWidth - 12);
      const top = rect.bottom + 8 + menuHeight > window.innerHeight - 10
        ? rect.top - menuHeight - 8
        : rect.bottom + 8;
      panel.style.left = `${left}px`;
      panel.style.top = `${Math.max(10, top)}px`;
      const selectedCell = panel.querySelector('.selected');
      selectedCell?.scrollIntoView({ block: 'nearest' });
    });
  };

  const openYearPanel = (select, trigger) => {
    if (select.disabled) return;
    if (yearPanelSelect === select && yearPanel && !yearPanel.hidden) {
      closeYearPanel();
      return;
    }
    closeYearPanel();
    yearPanelSelect = select;
    const selected = select.value;
    const wrap = select.closest('.fly-vi-date');
    const years = Array.from(select.options).filter(opt => opt.value !== '').map(opt => Number(opt.value));
    yearPanelDecade = defaultDecade(years, selected, wrap?.dataset.yearPreset || 'general');
    trigger.setAttribute('aria-expanded', 'true');
    renderYearPanelBody(select, trigger);
  };

  const ensureYearWrap = wrap => {
    const yearSelect = wrap.querySelector('.fly-vi-year');
    if (!yearSelect) return null;
    let yearWrap = yearSelect.closest('.fly-vi-year-wrap');
    if (!yearWrap) {
      yearWrap = document.createElement('div');
      yearWrap.className = 'fly-vi-year-wrap';
      yearSelect.before(yearWrap);
      yearWrap.appendChild(yearSelect);
      yearWrap.insertAdjacentHTML('beforeend', `<button type="button" class="fly-vi-year-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="Chọn năm"><span></span>${yearChevron}</button>`);
    }
    return yearWrap;
  };

  const bindWidget = wrap => {
    if (wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';
    if (!wrap.dataset.yearPreset) {
      const hidden = wrap.querySelector('input[type="hidden"]');
      wrap.dataset.yearPreset = inferYearPreset({ id: hidden?.id || '', extraClass: hidden?.className || '' });
    }
    wrap.querySelectorAll('select').forEach(select => select.addEventListener('change', () => {
      writeHidden(wrap);
      if (select.classList.contains('fly-vi-year')) syncYearTrigger(select);
    }));
    const yearSelect = wrap.querySelector('.fly-vi-year');
    const yearWrap = ensureYearWrap(wrap);
    const trigger = yearWrap?.querySelector('.fly-vi-year-trigger');
    if (yearSelect && trigger) {
      syncYearTrigger(yearSelect);
      trigger.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openYearPanel(yearSelect, trigger);
      });
      trigger.addEventListener('keydown', event => {
        if (/^\d$/.test(event.key)) {
          event.preventDefault();
          openYearPanel(yearSelect, trigger);
          const search = yearPanel?.querySelector('.fly-vi-year-search');
          if (search) {
            search.value = event.key;
            search.dispatchEvent(new Event('input', { bubbles: true }));
            search.focus();
          }
        }
      });
      new MutationObserver(() => syncYearTrigger(yearSelect)).observe(yearSelect, { attributes: true, attributeFilter: ['disabled'] });
    }
  };

  const mount = (root = document) => {
    root.querySelectorAll('.fly-vi-date:not([data-bound="1"])').forEach(bindWidget);
  };

  const refresh = hidden => {
    const wrap = hidden?.closest?.('.fly-vi-date');
    if (!wrap) return;
    const kind = wrap.dataset.kind;
    const yearSelect = wrap.querySelector('.fly-vi-year');
    if (!hidden.value) {
      wrap.querySelectorAll('select').forEach(select => { select.value = ''; });
      if (yearSelect) refillYears(wrap, '');
      return;
    }
    if (kind === 'month') {
      const parsed = parseIsoMonth(hidden.value) || parseIsoMonth(`${currentYear()}-${pad(new Date().getMonth() + 1)}`);
      refillYears(wrap, parsed.year);
      wrap.querySelector('.fly-vi-month').value = String(parsed.month);
    } else {
      const parsed = kind === 'datetime' ? parseIsoDateTime(hidden.value) : parseIsoDate(hidden.value);
      if (!parsed) {
        hidden.value = '';
        wrap.querySelectorAll('select').forEach(select => { select.value = ''; });
        if (yearSelect) refillYears(wrap, '');
        return;
      }
      refillYears(wrap, parsed.year);
      wrap.querySelector('.fly-vi-month').value = String(parsed.month);
      refillDays(wrap, parsed.year, parsed.month, parsed.day);
      if (kind === 'datetime') {
        wrap.querySelector('.fly-vi-hour').value = String(parsed.hour);
        wrap.querySelector('.fly-vi-minute').value = String(parsed.minute - (parsed.minute % 5));
      }
    }
  };

  const sync = (root = document) => {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll?.('.fly-vi-date input[type="hidden"]').forEach(refresh);
  };

  const hydrateNative = (root = document) => {
    root.querySelectorAll('input[type="date"], input[type="month"], input[type="datetime-local"]').forEach(input => {
      if (input.closest('.fly-vi-date')) return;
      if (input.hasAttribute('data-keep-native') || input.closest('[data-keep-native]') || input.closest('.audit-daterange') || input.closest('.warehouse-history-page') || input.closest('.warehouse-history-daterange') || input.closest('.payroll-period-picker') || input.closest('.accounting-payroll') || input.closest('.workforce-payroll-filter') || input.closest('.workforce-approve-page') || input.closest('.workforce-approve-filters') || input.closest('.manager-holidays') || input.closest('.accounting-history') || input.closest('.financial-report-filter') || input.closest('.store-pnl-filter')) return;
      const type = input.getAttribute('type');
      const id = input.id || `fly-date-${Math.random().toString(36).slice(2, 8)}`;
      if (!input.id) input.id = id;
      const optional = !input.required;
      const preset = inferYearPreset({ id, extraClass: input.className, dataset: input.dataset });
      const html = type === 'month'
        ? monthField(id, input.value, preset)
        : type === 'datetime-local'
          ? datetimeField(id, input.value, preset)
          : dateField(id, input.value, input.className, optional, preset);
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
  document.addEventListener('click', closeYearPanel);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeYearPanel(); });
  document.addEventListener('scroll', event => {
    if (yearPanel && event.target && (event.target === yearPanel || yearPanel.contains(event.target))) return;
    closeYearPanel();
  }, true);
  window.addEventListener('resize', closeYearPanel);
  document.addEventListener('reset', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    queueMicrotask(() => form.querySelectorAll('.fly-vi-date input[type="hidden"]').forEach(refresh));
  }, true);

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

  const parsePositiveInteger = (value, label = 'Số lượng') => {
    if (window.FLY_FIELDS?.validatePositiveInteger) return window.FLY_FIELDS.validatePositiveInteger(value, label);
    if (value === '' || value === null || value === undefined) return { ok: false, message: `${label} là bắt buộc.` };
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1) return { ok: false, message: `${label} phải là số nguyên lớn hơn 0.` };
    return { ok: true, value: num };
  };
  const stockLeftText = (item) => {
    const stock = Number(item?.SLTon ?? item?.SLTonHienTai ?? 0);
    const unit = String(item?.DonViTinh || '').trim();
    return unit ? `còn ${stock} ${unit}` : `còn ${stock}`;
  };
  const stockExceededMessage = (item) => {
    const name = item?.TenSP || item?.MaSP || 'Sản phẩm';
    const stock = Number(item?.SLTon ?? item?.SLTonHienTai ?? 0);
    const unit = String(item?.DonViTinh || '').trim();
    return `${name} chỉ còn ${stock}${unit ? ` ${unit}` : ''}.`;
  };
  const stepperMarkup = ({
    id = '',
    value = 1,
    min = 1,
    max = '',
    inputClass = 'qty-stepper-input',
    wrapClass = 'qty-stepper',
    ariaLabel = 'Số lượng'
  } = {}) => {
    const maxNum = max === '' || max == null ? NaN : Number(max);
    const maxAttr = Number.isFinite(maxNum) ? ` max="${maxNum}"` : '';
    const idAttr = id !== '' && id != null ? ` data-id="${esc(id)}"` : '';
    return `<span class="${esc(wrapClass)}"><button type="button" data-qty-step="-1" aria-label="Giảm số lượng">−</button><input class="${esc(inputClass)}" type="number" inputmode="numeric" min="${Number(min)}"${maxAttr} step="1" value="${Number(value)}"${idAttr} aria-label="${esc(ariaLabel)}"><button type="button" data-qty-step="1" aria-label="Tăng số lượng">+</button></span>`;
  };
  const bindStepper = (wrap, { commit } = {}) => {
    if (!wrap || typeof commit !== 'function') return;
    const input = wrap.querySelector('input[type="number"]');
    if (!input) return;
    wrap.querySelectorAll('[data-qty-step]').forEach(button => {
      button.addEventListener('click', () => {
        const delta = Number(button.dataset.qtyStep);
        const current = Number(input.value);
        const base = Number.isInteger(current) ? current : 0;
        commit(input, base + delta, 'step');
      });
    });
    input.addEventListener('focus', () => {
      try { input.select(); } catch { /* ignore */ }
    });
    input.addEventListener('change', () => commit(input, input.value, 'change'));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
  };

  window.FLY_VI_DATE = { MONTHS, dateField, monthField, datetimeField, mount, refresh, sync, hydrate: hydrateNative, periodToolbar, formatDateVN, dateKeyVN };
  window.FLY_REPORT_PERIOD = { defaults: reportPeriodDefaults, set: setReportPeriod, syncFromReport, activeFallbackBanner };
  window.FLY_UI = { avatar, person, kpi, kpiGrid, bars, hue };
  window.FLY_QTY = { parsePositiveInteger, stockLeftText, stockExceededMessage, stepperMarkup, bind: bindStepper };
})();
