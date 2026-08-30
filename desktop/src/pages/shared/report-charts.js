(() => {
  const palette = ['#25845f', '#d8a33e', '#4f73c5', '#cc6e50', '#7b61b8', '#2f9aa0'];
  let sequence = 0;
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
  const legend = series => `<div class="fly-chart-legend">${series.map((item, index) => `<span><i style="--legend:${item.color || palette[index % palette.length]}"></i>${esc(item.name)}</span>`).join('')}</div>`;
  const card = ({ kicker, title, subtitle = '', badge = '', chart, className = '' }) => `<article class="fly-chart-card ${className}"><header><div><p>${esc(kicker)}</p><h2>${esc(title)}</h2>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>${badge ? `<span class="fly-chart-badge">${esc(badge)}</span>` : ''}</header>${chart}</article>`;

  const line = ({ labels = [], series = [], formatter = compact, axisFormatter = compact, emptyText = '' }) => {
    const cleanSeries = series.map((item, index) => ({ ...item, color: item.color || palette[index % palette.length], values: (item.values || []).map(number) }));
    if (!labels.length || !cleanSeries.some(item => item.values.length)) return empty(emptyText);
    const width = 760; const height = 286; const left = 58; const right = 18; const top = 24; const bottom = 42;
    const plotWidth = width - left - right; const plotHeight = height - top - bottom;
    const values = cleanSeries.flatMap(item => item.values);
    let min = Math.min(0, ...values); let max = Math.max(0, ...values);
    if (min === max) max = min + 1;
    const range = max - min;
    const x = index => left + (labels.length === 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth);
    const y = value => top + ((max - value) / range) * plotHeight;
    const id = `fly-chart-${++sequence}`;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = max - (range * index / 4); const py = top + (plotHeight * index / 4);
      return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}"/><text x="${left - 10}" y="${py + 4}" text-anchor="end">${esc(axisFormatter(value))}</text>`;
    }).join('');
    const labelStep = Math.max(1, Math.ceil(labels.length / 7));
    const xLabels = labels.map((label, index) => (index % labelStep === 0 || index === labels.length - 1) ? `<text x="${x(index)}" y="${height - 13}" text-anchor="middle">${esc(label)}</text>` : '').join('');
    const shapes = cleanSeries.map((item, seriesIndex) => {
      const points = item.values.map((value, index) => `${x(index)},${y(value)}`);
      const path = points.map((point, index) => `${index ? 'L' : 'M'}${point}`).join(' ');
      const area = seriesIndex === 0 ? `<path class="fly-chart-area" d="${path} L${x(item.values.length - 1)},${top + plotHeight} L${x(0)},${top + plotHeight} Z" fill="url(#${id})"/>` : '';
      const dots = item.values.map((value, index) => `<circle class="fly-chart-point" tabindex="0" cx="${x(index)}" cy="${y(value)}" r="4.5" fill="${item.color}" data-chart-tip="${attr(`${labels[index]} · ${item.name}: ${formatter(value)}`)}"/>`).join('');
      return `${area}<path class="fly-chart-line" d="${path}" stroke="${item.color}"/>${dots}`;
    }).join('');
    return `${legend(cleanSeries)}<div class="fly-chart-canvas line"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ ${attr(cleanSeries.map(item => item.name).join(', '))}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${cleanSeries[0].color}" stop-opacity=".24"/><stop offset="1" stop-color="${cleanSeries[0].color}" stop-opacity="0"/></linearGradient></defs><g class="fly-chart-grid">${grid}${xLabels}</g>${shapes}</svg></div>`;
  };

  const columns = ({ labels = [], series = [], formatter = compact, axisFormatter = compact, emptyText = '' }) => {
    const cleanSeries = series.map((item, index) => ({ ...item, color: item.color || palette[index % palette.length], values: (item.values || []).map(number) }));
    if (!labels.length || !cleanSeries.some(item => item.values.length)) return empty(emptyText);
    const width = 760; const height = 286; const left = 58; const right = 18; const top = 24; const bottom = 44;
    const plotWidth = width - left - right; const plotHeight = height - top - bottom;
    const max = Math.max(1, ...cleanSeries.flatMap(item => item.values.map(value => Math.max(0, value))));
    const groupWidth = plotWidth / labels.length; const gap = 5; const barWidth = Math.min(34, Math.max(5, (groupWidth - 12) / cleanSeries.length - gap));
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = max - (max * index / 4); const py = top + (plotHeight * index / 4);
      return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}"/><text x="${left - 10}" y="${py + 4}" text-anchor="end">${esc(axisFormatter(value))}</text>`;
    }).join('');
    const labelStep = Math.max(1, Math.ceil(labels.length / 7));
    const xLabels = labels.map((label, index) => (index % labelStep === 0 || index === labels.length - 1) ? `<text x="${left + groupWidth * (index + .5)}" y="${height - 13}" text-anchor="middle">${esc(label)}</text>` : '').join('');
    const bars = labels.map((label, index) => cleanSeries.map((item, seriesIndex) => {
      const value = Math.max(0, item.values[index] || 0); const barHeight = (value / max) * plotHeight;
      const totalWidth = cleanSeries.length * barWidth + (cleanSeries.length - 1) * gap;
      const px = left + groupWidth * index + (groupWidth - totalWidth) / 2 + seriesIndex * (barWidth + gap);
      return `<rect class="fly-chart-bar" tabindex="0" x="${px}" y="${top + plotHeight - barHeight}" width="${barWidth}" height="${Math.max(2, barHeight)}" rx="5" fill="${item.color}" data-chart-tip="${attr(`${label} · ${item.name}: ${formatter(value)}`)}"/>`;
    }).join('')).join('');
    return `${legend(cleanSeries)}<div class="fly-chart-canvas columns"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ cột ${attr(cleanSeries.map(item => item.name).join(', '))}"><g class="fly-chart-grid">${grid}${xLabels}</g>${bars}</svg></div>`;
  };

  const horizontal = ({ items = [], formatter = compact, emptyText = '', color = palette[0] }) => {
    const list = items.map(item => ({ ...item, value: number(item.value) })).filter(item => item.value >= 0).slice(0, 8);
    if (!list.length) return empty(emptyText);
    const width = 760; const rowHeight = 46; const height = Math.max(155, list.length * rowHeight + 24); const left = 180; const right = 88; const max = Math.max(1, ...list.map(item => item.value));
    const rows = list.map((item, index) => {
      const y = 18 + index * rowHeight; const barWidth = ((width - left - right) * item.value / max);
      const label = String(item.label || '—'); const shortLabel = label.length > 22 ? `${label.slice(0, 20)}…` : label;
      return `<text x="${left - 12}" y="${y + 18}" text-anchor="end">${esc(shortLabel)}</text><rect class="fly-chart-track" x="${left}" y="${y}" width="${width - left - right}" height="24" rx="8"/><rect class="fly-chart-bar" tabindex="0" x="${left}" y="${y}" width="${Math.max(3, barWidth)}" height="24" rx="8" fill="${item.color || color}" data-chart-tip="${attr(`${label}: ${formatter(item.value)}`)}"/><text class="fly-chart-value" x="${width - right + 10}" y="${y + 18}">${esc(item.display || formatter(item.value))}</text>`;
    }).join('');
    return `<div class="fly-chart-canvas horizontal"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ thanh">${rows}</svg></div>`;
  };

  const donut = ({ items = [], centerLabel = 'Tổng', centerValue, formatter = compact, emptyText = '' }) => {
    const list = items.map((item, index) => ({ ...item, value: Math.max(0, number(item.value)), color: item.color || palette[index % palette.length] })).filter(item => item.value > 0);
    const total = list.reduce((sum, item) => sum + item.value, 0);
    if (!list.length || total <= 0) return empty(emptyText);
    let offset = 0;
    const segments = list.map(item => {
      const percent = item.value / total * 100; const start = offset; offset += percent;
      return `<circle class="fly-donut-segment" tabindex="0" cx="110" cy="110" r="72" pathLength="100" fill="none" stroke="${item.color}" stroke-width="30" stroke-dasharray="${Math.max(.5, percent - .7)} ${100 - Math.max(.5, percent - .7)}" stroke-dashoffset="-${start}" data-chart-tip="${attr(`${item.label}: ${formatter(item.value)} (${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(percent)}%)`)}"/>`;
    }).join('');
    return `<div class="fly-donut-layout"><div class="fly-donut"><svg viewBox="0 0 220 220" role="img" aria-label="Biểu đồ cơ cấu"><circle cx="110" cy="110" r="72" fill="none" stroke="#edf2ef" stroke-width="30"/><g transform="rotate(-90 110 110)">${segments}</g><text x="110" y="104" text-anchor="middle">${esc(centerLabel)}</text><text class="fly-donut-total" x="110" y="127" text-anchor="middle">${esc(centerValue ?? formatter(total))}</text></svg></div><div class="fly-donut-legend">${list.map(item => `<div><i style="--legend:${item.color}"></i><span>${esc(item.label)}</span><strong>${esc(item.display || formatter(item.value))}</strong></div>`).join('')}</div></div>`;
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
  document.body.appendChild(tooltip);
  const show = (target, x, y) => {
    tooltip.textContent = target.dataset.chartTip || '';
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(window.innerWidth - 230, Math.max(12, x + 14))}px`;
    tooltip.style.top = `${Math.max(12, y - 44)}px`;
  };
  document.addEventListener('pointermove', event => {
    const target = event.target.closest?.('[data-chart-tip]');
    if (target) show(target, event.clientX, event.clientY); else tooltip.hidden = true;
  });
  document.addEventListener('pointerleave', () => { tooltip.hidden = true; });
  document.addEventListener('focusin', event => {
    const target = event.target.closest?.('[data-chart-tip]');
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    show(target, bounds.left + bounds.width / 2, bounds.top);
  });
  document.addEventListener('focusout', event => { if (event.target.closest?.('[data-chart-tip]')) tooltip.hidden = true; });

  window.FLY_CHARTS = { palette, compact, money, empty, card, line, columns, horizontal, donut, metricBars };
})();
