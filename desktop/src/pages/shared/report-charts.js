(() => {
  const palette = ['#25845f', '#d8a33e', '#4f73c5', '#cc6e50', '#7b61b8', '#2f9aa0'];
  let sequence = 0;
  let actionHandler = null;
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const attr = esc;
  const number = value => Number(value || 0);
  const compact = value => {
    const amount = number(value);
    const absolute = Math.abs(amount);
    const format = (divisor, suffix) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount / divisor)} ${suffix}`;
    if (absolute >= 1_000_000_000) return format(1_000_000_000, 'tỷ');
    if (absolute >= 1_000_000) return format(1_000_000, 'tr');
    if (absolute >= 1_000) return format(1_000, 'nghìn');
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount);
  };
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(number(value));
  const empty = message => `<div class="fly-chart-empty"><span>⌁</span><strong>Chưa có dữ liệu để vẽ biểu đồ</strong><small>${esc(message || 'Hãy chọn kỳ khác hoặc phát sinh chứng từ mới.')}</small></div>`;
  const legend = (series, { line = false } = {}) => `<div class="fly-chart-legend">${series.map((item, index) => {
    const color = item.color || palette[index % palette.length];
    const dash = line && (item.dash ?? index > 0);
    return `<span><i class="is-swatch${line ? ' is-line' : ''}${dash ? ' is-dashed' : ''}" style="--legend:${color}"></i>${esc(item.name)}</span>`;
  }).join('')}</div>`;
  const card = ({ kicker, title, subtitle = '', badge = '', chart, className = '' }) => `<article class="fly-chart-card ${className}"><header><div><p>${esc(kicker)}</p><h2>${esc(title)}</h2>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>${badge ? `<span class="fly-chart-badge">${esc(badge)}</span>` : ''}</header>${chart}</article>`;
  const pointActive = (series, index) => series.some(item => number(item.values[index]) > 0);
  const extraAt = (pointExtras, label, index) => {
    if (typeof pointExtras === 'function') return pointExtras(label, index) || null;
    if (Array.isArray(pointExtras)) return pointExtras[index] || null;
    return null;
  };
  const tipBundle = (label, series, index, formatter, extra = null) => {
    const rows = (extra?.omitSeries ? [] : series.map(item => ({ name: item.name, value: formatter(item.values[index] || 0), color: item.color }))).concat(extra?.rows || []);
    const data = {
      title: extra?.title || String(label ?? ''),
      rows,
      notes: extra?.notes || [],
      actions: extra?.actions || []
    };
    return {
      payload: attr(JSON.stringify(data)),
      plain: attr([data.title, ...rows.map(row => `${row.name}: ${row.value}`), ...data.notes].join(' · '))
    };
  };
  const tipAttrs = (bundle, key = '') => `data-chart-payload="${bundle.payload}" data-chart-tip="${bundle.plain}"${key ? ` data-chart-key="${attr(key)}"` : ''}`;
  const wrapLabel = (text, maxChars = 14) => {
    const raw = String(text || '');
    if (raw.length <= maxChars) return [raw];
    const words = raw.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    return lines.slice(0, 3);
  };
  const scaleOf = (values, { pad = false, includeZero = true } = {}) => {
    const list = values.length ? values : [0];
    let min = includeZero ? Math.min(0, ...list) : Math.min(...list);
    let max = includeZero ? Math.max(0, ...list) : Math.max(...list);
    if (pad && list.length) {
      min = Math.min(...list);
      max = Math.max(...list);
      if (min === max) {
        min = Math.max(0, min - 1);
        max += 1;
      } else {
        const span = max - min;
        min = Math.max(0, min - span * 0.18);
        max += span * 0.12;
      }
    }
    if (min === max) max = min + 1;
    return { min, max, range: max - min };
  };

  const line = ({ labels = [], series = [], formatter = compact, axisFormatter = compact, emptyText = '', markerNote = '', dualAxis = false, alwaysHit = false, pointExtras = null, emphasis = false }) => {
    const cleanSeries = series.map((item, index) => ({
      ...item,
      color: item.color || palette[index % palette.length],
      values: (item.values || []).map(number),
      dash: item.dash ?? index > 0,
      axis: item.axis || (dualAxis && index === series.length - 1 ? 'right' : 'left')
    }));
    if (!labels.length || !cleanSeries.some(item => item.values.length)) return empty(emptyText);
    const leftSeries = cleanSeries.filter(item => item.axis !== 'right');
    const rightSeries = cleanSeries.filter(item => item.axis === 'right');
    const useDual = dualAxis && leftSeries.length && rightSeries.length;
    const leftScale = scaleOf((useDual ? leftSeries : cleanSeries).flatMap(item => item.values));
    const rightScale = useDual ? scaleOf(rightSeries.flatMap(item => item.values), { pad: true, includeZero: false }) : leftScale;
    const width = 780;
    const height = emphasis ? 360 : 328;
    const left = useDual ? 70 : 76;
    const right = useDual ? 70 : 22;
    const top = 22;
    const bottom = 52;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = index => left + (labels.length === 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth);
    const yOf = (item, value) => {
      const scale = item.axis === 'right' && useDual ? rightScale : leftScale;
      return top + ((scale.max - value) / scale.range) * plotHeight;
    };
    const id = `fly-chart-${++sequence}`;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = leftScale.max - (leftScale.range * index / 4);
      const py = top + (plotHeight * index / 4);
      const rightValue = rightScale.max - (rightScale.range * index / 4);
      const rightLabel = useDual ? `<text class="fly-chart-axis-right" x="${width - right + 12}" y="${py + 5}" text-anchor="start">${esc(axisFormatter(rightValue))}</text>` : '';
      return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}"/><text x="${left - 12}" y="${py + 5}" text-anchor="end">${esc(axisFormatter(value))}</text>${rightLabel}`;
    }).join('');
    const labelStep = labels.length <= 10 ? 1 : Math.max(1, Math.ceil(labels.length / 7));
    const xLabels = labels.map((label, index) => (index % labelStep === 0 || index === labels.length - 1) ? `<text x="${x(index)}" y="${height - 16}" text-anchor="middle">${esc(label)}</text>` : '').join('');
    const seriesCount = cleanSeries.length;
    const markerShift = seriesIndex => (useDual || emphasis || seriesCount <= 1 ? 0 : (seriesIndex - (seriesCount - 1) / 2) * 11);
    const hitWidth = Math.max(18, labels.length > 1 ? plotWidth / (labels.length - 1) : plotWidth);
    const hits = labels.map((label, index) => {
      if (!alwaysHit && !pointActive(cleanSeries, index)) return '';
      const bundle = tipBundle(label, cleanSeries, index, formatter, extraAt(pointExtras, label, index));
      return `<rect class="fly-chart-hit" tabindex="0" x="${x(index) - hitWidth / 2}" y="${top}" width="${hitWidth}" height="${plotHeight}" fill="transparent" ${tipAttrs(bundle, `line-${id}-${index}`)}/>`;
    }).join('');
    const shapes = cleanSeries.map((item, seriesIndex) => {
      const points = item.values.map((value, index) => `${x(index)},${yOf(item, value)}`);
      const path = points.map((point, index) => `${index ? 'L' : 'M'}${point}`).join(' ');
      const area = seriesIndex === 0 ? `<path class="fly-chart-area" d="${path} L${x(item.values.length - 1)},${top + plotHeight} L${x(0)},${top + plotHeight} Z" fill="url(#${id})"/>` : '';
      const dash = item.dash ? ' stroke-dasharray="8 6"' : '';
      const strokeW = emphasis ? (item.dash ? 4.4 : 5.6) : (seriesIndex === 0 ? 4.6 : 3.1);
      return `${area}<path class="fly-chart-line" d="${path}" stroke="${item.color}" style="stroke-width:${strokeW}"${dash}/>`;
    }).join('');
    const dots = cleanSeries.flatMap((item, seriesIndex) => item.values.map((value, index) => {
      if (!value && !item.alwaysDot && !alwaysHit) return '';
      if (!value && !item.alwaysDot) return '';
      const bundle = tipBundle(labels[index], cleanSeries, index, formatter, extraAt(pointExtras, labels[index], index));
      const radius = emphasis ? (seriesIndex === 0 ? 7.2 : 6.4) : (seriesIndex === 0 ? 6.4 : 5.4);
      return `<circle class="fly-chart-point" tabindex="0" cx="${x(index) + markerShift(seriesIndex)}" cy="${yOf(item, value)}" r="${radius}" fill="${item.color}" stroke="#fff" stroke-width="1.8" ${tipAttrs(bundle, `line-${id}-${index}`)}/>`;
    })).join('');
    const note = markerNote ? `<p class="fly-chart-note">${esc(markerNote)}</p>` : '';
    return `${legend(cleanSeries, { line: true })}<div class="fly-chart-canvas line${useDual ? ' dual-axis' : ''}${emphasis ? ' is-emphasis' : ''}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ ${attr(cleanSeries.map(item => item.name).join(', '))}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${cleanSeries[0].color}" stop-opacity=".24"/><stop offset="1" stop-color="${cleanSeries[0].color}" stop-opacity="0"/></linearGradient></defs><g class="fly-chart-grid">${grid}${xLabels}</g>${hits}${shapes}${dots}</svg></div>${note}`;
  };

  const columns = ({ labels = [], series = [], formatter = compact, axisFormatter = compact, emptyText = '', markerNote = '', labelWrap = false, emphasizeBars = false, alwaysHit = false, pointExtras = null }) => {
    const cleanSeries = series.map((item, index) => ({ ...item, color: item.color || palette[index % palette.length], values: (item.values || []).map(number) }));
    if (!labels.length || !cleanSeries.some(item => item.values.length)) return empty(emptyText);
    const wrap = !!labelWrap;
    const width = 760;
    const height = wrap ? 352 : 286;
    const left = 58;
    const right = 18;
    const top = 24;
    const bottom = wrap ? 92 : 44;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const max = Math.max(1, ...cleanSeries.flatMap(item => item.values.map(value => Math.max(0, value))));
    const dense = labels.length > 14;
    const groupWidth = plotWidth / labels.length;
    const gap = dense ? 2 : emphasizeBars ? 8 : 5;
    const inset = dense ? 3 : emphasizeBars ? 16 : 12;
    const barWidth = emphasizeBars && cleanSeries.length === 1
      ? Math.min(58, Math.max(22, groupWidth * 0.52))
      : Math.min(34, Math.max(4, (groupWidth - inset) / cleanSeries.length - gap));
    const totalWidth = cleanSeries.length * barWidth + (cleanSeries.length - 1) * gap;
    const id = `fly-cols-${++sequence}`;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = max - (max * index / 4); const py = top + (plotHeight * index / 4);
      return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}"/><text x="${left - 10}" y="${py + 4}" text-anchor="end">${esc(axisFormatter(value))}</text>`;
    }).join('');
    const labelStep = (wrap || labels.length <= 8) ? 1 : Math.max(1, Math.ceil(labels.length / 7));
    const maxChars = labels.length <= 6 ? 14 : 11;
    const xLabels = labels.map((label, index) => {
      if (!(index % labelStep === 0 || index === labels.length - 1)) return '';
      const cx = left + groupWidth * (index + .5);
      if (!wrap) return `<text x="${cx}" y="${height - 13}" text-anchor="middle">${esc(label)}</text>`;
      const lines = wrapLabel(label, maxChars);
      const start = height - 18 - (lines.length - 1) * 13;
      return `<text class="fly-chart-wrap-label" x="${cx}" y="${start}" text-anchor="middle">${lines.map((line, lineIndex) => `<tspan x="${cx}" dy="${lineIndex ? 13 : 0}">${esc(line)}</tspan>`).join('')}</text>`;
    }).join('');
    const hits = labels.map((label, index) => {
      if (!alwaysHit && !pointActive(cleanSeries, index)) return '';
      const bundle = tipBundle(label, cleanSeries, index, formatter, extraAt(pointExtras, label, index));
      return `<rect class="fly-chart-hit" tabindex="0" x="${left + groupWidth * index}" y="${top}" width="${groupWidth}" height="${plotHeight}" fill="transparent" ${tipAttrs(bundle, `col-${id}-${index}`)}/>`;
    }).join('');
    const bars = labels.map((label, index) => {
      const bundle = tipBundle(label, cleanSeries, index, formatter, extraAt(pointExtras, label, index));
      return cleanSeries.map((item, seriesIndex) => {
        const value = Math.max(0, item.values[index] || 0);
        if (!value) return '';
        const barHeight = Math.max(4, (value / max) * plotHeight);
        const px = left + groupWidth * index + (groupWidth - totalWidth) / 2 + seriesIndex * (barWidth + gap);
        return `<rect class="fly-chart-bar" tabindex="0" x="${px}" y="${top + plotHeight - barHeight}" width="${barWidth}" height="${barHeight}" rx="${emphasizeBars ? 7 : 4}" fill="${item.color}" ${tipAttrs(bundle, `col-${id}-${index}`)}/>`;
      }).join('');
    }).join('');
    const note = markerNote ? `<p class="fly-chart-note">${esc(markerNote)}</p>` : '';
    return `${legend(cleanSeries)}<div class="fly-chart-canvas columns${emphasizeBars ? ' is-emphasis' : ''}${wrap ? ' is-wrap' : ''}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ cột ${attr(cleanSeries.map(item => item.name).join(', '))}"><g class="fly-chart-grid">${grid}${xLabels}</g>${hits}${bars}</svg></div>${note}`;
  };

  const horizontal = ({ items = [], formatter = compact, emptyText = '', color = palette[0] }) => {
    const list = items.map(item => ({ ...item, value: number(item.value) })).filter(item => item.value >= 0).slice(0, 8);
    if (!list.length) return empty(emptyText);
    const max = Math.max(1, ...list.map(item => item.value));
    const rows = list.map(item => {
      const label = String(item.label || '—');
      const percent = Math.max(item.value ? 6 : 0, item.value / max * 100);
      return `<div class="fly-hbar-row" tabindex="0" data-chart-tip="${attr(`${label}: ${formatter(item.value)}`)}"><span class="fly-hbar-label" title="${attr(label)}">${esc(label)}</span><div class="fly-hbar-track"><i style="width:${percent}%;--bar:${item.color || color}"></i></div><strong class="fly-hbar-value">${esc(item.display || formatter(item.value))}</strong></div>`;
    }).join('');
    return `<div class="fly-chart-canvas horizontal" role="img" aria-label="Biểu đồ thanh"><div class="fly-hbar">${rows}</div></div>`;
  };

  const donut = ({ items = [], centerLabel = 'Tổng', centerValue, formatter = compact, emptyText = '' }) => {
    const list = items.map((item, index) => ({ ...item, value: Math.max(0, number(item.value)), color: item.color || palette[index % palette.length] })).filter(item => item.value > 0);
    const total = list.reduce((sum, item) => sum + item.value, 0);
    if (!list.length || total <= 0) return empty(emptyText);
    const id = `fly-donut-${++sequence}`;
    const pct = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value / total * 100)}%`;
    let offset = 0;
    const segments = list.map((item, index) => {
      const percent = item.value / total * 100;
      const start = offset;
      offset += percent;
      const extra = {
        title: item.label,
        rows: [
          { name: 'Giá trị', value: formatter(item.value), color: item.color },
          { name: 'Tỷ trọng', value: pct(item.value), color: item.color },
          ...(item.extraRows || [])
        ],
        notes: item.notes || [],
        actions: item.actions || [],
        omitSeries: true
      };
      const bundle = tipBundle(item.label, [], 0, formatter, extra);
      return `<circle class="fly-donut-segment" tabindex="0" cx="110" cy="110" r="72" pathLength="100" fill="none" stroke="${item.color}" stroke-width="32" stroke-dasharray="${Math.max(.5, percent - .7)} ${100 - Math.max(.5, percent - .7)}" stroke-dashoffset="-${start}" ${tipAttrs(bundle, `${id}-${index}`)}/>`;
    }).join('');
    const legendRows = list.map((item, index) => {
      const extra = {
        title: item.label,
        rows: [
          { name: 'Giá trị', value: formatter(item.value), color: item.color },
          { name: 'Tỷ trọng', value: pct(item.value), color: item.color },
          ...(item.extraRows || [])
        ],
        notes: item.notes || [],
        actions: item.actions || [],
        omitSeries: true
      };
      const bundle = tipBundle(item.label, [], 0, formatter, extra);
      const top = (item.notes || [])[0];
      return `<div class="fly-donut-legend-row" tabindex="0" role="button" ${tipAttrs(bundle, `${id}-${index}`)}><i style="--legend:${item.color}"></i><div class="fly-donut-legend-copy"><span>${esc(item.label)}</span>${top ? `<small>${esc(top)}</small>` : ''}</div><div class="fly-donut-legend-nums"><em>${esc(pct(item.value))}</em><strong>${esc(item.display || formatter(item.value))}</strong></div></div>`;
    }).join('');
    return `<div class="fly-donut-layout"><div class="fly-donut"><svg viewBox="0 0 220 220" role="img" aria-label="Biểu đồ cơ cấu"><circle cx="110" cy="110" r="72" fill="none" stroke="#edf2ef" stroke-width="32"/><g transform="rotate(-90 110 110)">${segments}</g><text x="110" y="100" text-anchor="middle">${esc(centerLabel)}</text><text class="fly-donut-total" x="110" y="126" text-anchor="middle">${esc(centerValue ?? formatter(total))}</text></svg></div><div class="fly-donut-legend">${legendRows}</div></div>`;
  };

  const metricBars = ({ items = [], formatter = compact, emptyText = '' }) => {
    const list = items.map((item, index) => ({ ...item, value: number(item.value), color: item.color || palette[index % palette.length] }));
    if (!list.length) return empty(emptyText);
    const max = Math.max(1, ...list.map(item => Math.abs(item.value)));
    return `<div class="fly-metric-bars">${list.map(item => {
      const percent = Math.abs(item.value) / max * 100;
      return `<div class="fly-metric-bar" tabindex="0" data-chart-tip="${attr(`${item.label}: ${formatter(item.value)}`)}"><div><span>${esc(item.label)}</span><strong>${esc(item.display || formatter(item.value))}</strong></div><div class="fly-metric-track"><i style="width:${Math.max(item.value ? 4 : 0, percent)}%;--bar:${item.color}"></i></div>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}</div>`;
    }).join('')}</div>`;
  };

  const tooltip = document.createElement('div');
  tooltip.className = 'fly-chart-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'status');
  document.body.appendChild(tooltip);
  const tipSelector = '[data-chart-payload], [data-chart-tip]';
  let pinned = null;
  const fillTip = target => {
    const raw = target.dataset.chartPayload;
    if (raw) {
      try {
        const data = JSON.parse(raw);
        const notes = (data.notes || []).map(note => `<small class="fly-chart-tip-note">${esc(note)}</small>`).join('');
        const actions = (data.actions || []).map(action => `<button type="button" class="fly-chart-tip-action" data-chart-nav="${attr(action.nav || '')}" data-chart-id="${attr(action.id || '')}" data-chart-open="${attr(action.open || '')}">${esc(action.label)}</button>`).join('');
        tooltip.innerHTML = `<strong class="fly-chart-tip-title">${esc(data.title || '')}</strong>${(data.rows || []).map(row => `<div class="fly-chart-tip-row"><i style="background:${esc(row.color || '#fff')}"></i><span>${esc(row.name)}</span><b>${esc(row.value)}</b></div>`).join('')}${notes}${actions}${pinned === target ? '<small class="fly-chart-tip-pin">Bấm ra ngoài hoặc Esc để đóng</small>' : '<small class="fly-chart-tip-pin">Bấm để giữ bảng số</small>'}`;
        tooltip.classList.toggle('has-actions', Boolean((data.actions || []).length));
        return;
      } catch { /* fall through to plain text */ }
    }
    tooltip.classList.remove('has-actions');
    tooltip.textContent = target.dataset.chartTip || '';
  };
  const place = (x, y) => {
    tooltip.hidden = false;
    const width = Math.min(320, tooltip.offsetWidth || 240);
    const height = tooltip.offsetHeight || 80;
    tooltip.style.left = `${Math.min(window.innerWidth - width - 12, Math.max(12, x + 14))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, y - height - 12))}px`;
  };
  const show = (target, x, y) => {
    fillTip(target);
    tooltip.classList.toggle('is-pinned', pinned === target);
    place(x, y);
  };
  const clearActive = () => document.querySelectorAll('.fly-chart-hit.is-active, .fly-chart-bar.is-active, .fly-chart-point.is-active, .fly-donut-segment.is-active, .fly-donut-legend-row.is-active').forEach(node => node.classList.remove('is-active'));
  const unpin = () => {
    pinned = null;
    tooltip.classList.remove('is-pinned', 'has-actions');
    tooltip.hidden = true;
    clearActive();
  };
  const activate = target => {
    clearActive();
    const key = target.dataset.chartKey;
    if (key) {
      document.querySelectorAll('[data-chart-key]').forEach(node => {
        if (node.dataset.chartKey === key) node.classList.add('is-active');
      });
      return;
    }
    target.classList.add('is-active');
  };
  const runAction = action => {
    unpin();
    if (actionHandler) actionHandler(action);
  };
  document.addEventListener('pointermove', event => {
    if (pinned) return;
    const target = event.target.closest?.(tipSelector);
    if (target) show(target, event.clientX, event.clientY);
    else tooltip.hidden = true;
  });
  document.addEventListener('pointerdown', event => {
    if (tooltip.contains(event.target)) {
      const button = event.target.closest('[data-chart-nav], [data-chart-open]');
      if (button) {
        event.preventDefault();
        runAction({ nav: button.dataset.chartNav, id: button.dataset.chartId, open: button.dataset.chartOpen });
      }
      return;
    }
    const target = event.target.closest?.(tipSelector);
    if (!target) {
      if (pinned) unpin();
      return;
    }
    if (pinned === target) {
      unpin();
      return;
    }
    pinned = target;
    activate(target);
    show(target, event.clientX, event.clientY);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pinned) unpin();
  });
  document.addEventListener('pointerleave', () => { if (!pinned) tooltip.hidden = true; });
  document.addEventListener('focusin', event => {
    const target = event.target.closest?.(tipSelector);
    if (!target || pinned) return;
    const bounds = target.getBoundingClientRect();
    show(target, bounds.left + bounds.width / 2, bounds.top);
  });
  document.addEventListener('focusout', event => {
    if (pinned) return;
    if (event.target.closest?.(tipSelector)) tooltip.hidden = true;
  });

  window.FLY_CHARTS = {
    palette,
    compact,
    money,
    empty,
    card,
    line,
    columns,
    horizontal,
    donut,
    metricBars,
    setActionHandler: fn => { actionHandler = typeof fn === 'function' ? fn : null; }
  };
})();
