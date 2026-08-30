(() => {
  const esc = value => String(value ?? '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0))} đ`;
  const date = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const compact = value => {
    const amount = Number(value || 0); const absolute = Math.abs(amount);
    if (absolute >= 1_000_000_000) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount / 1_000_000_000)} tỷ`;
    if (absolute >= 1_000_000) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount / 1_000_000)} tr`;
    if (absolute >= 1_000) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount / 1_000)} nghìn`;
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount);
  };
  const formatted = item => item.format === 'money' ? money(item.value) : item.format === 'date' ? date(item.value) : item.format === 'percent' ? `${Number(item.value || 0)}%` : item.value;
  const valueOf = (row, column) => {
    const raw = typeof column.value === 'function' ? column.value(row) : row[column.key];
    return formatted({ ...column, value: raw }) ?? '—';
  };

  const printChart = (chart, rows) => {
    if (!chart || !rows.length || !(chart.series || []).length) return '';
    const colors = ['#267b5b', '#d89f32', '#4f72bb'];
    const series = chart.series.map((item, index) => ({ ...item, color: item.color || colors[index % colors.length], values: rows.map(row => Number(typeof item.value === 'function' ? item.value(row) : row[item.key]) || 0) }));
    const values = series.flatMap(item => item.values);
    let min = Math.min(0, ...values); let max = Math.max(0, ...values);
    if (min === max) max = min + 1;
    const width = 720; const height = 176; const left = 52; const right = 15; const top = 12; const bottom = 30;
    const plotWidth = width - left - right; const plotHeight = height - top - bottom; const range = max - min;
    const x = index => left + (rows.length === 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth);
    const y = value => top + (max - value) / range * plotHeight;
    const grid = Array.from({ length: 4 }, (_, index) => {
      const value = max - range * index / 3; const py = top + plotHeight * index / 3;
      return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}"/><text x="${left - 8}" y="${py + 3}" text-anchor="end">${esc(compact(value))}</text>`;
    }).join('');
    const labelStep = Math.max(1, Math.ceil(rows.length / 6));
    const labels = rows.map((row, index) => {
      if (index % labelStep !== 0 && index !== rows.length - 1) return '';
      const raw = typeof chart.label === 'function' ? chart.label(row) : row[chart.labelKey];
      return `<text x="${x(index)}" y="${height - 8}" text-anchor="middle">${esc(chart.labelFormat === 'date' ? date(raw) : raw)}</text>`;
    }).join('');
    const paths = series.map(item => {
      const path = item.values.map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`).join(' ');
      const points = item.values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="3.6" fill="${item.color}"/>`).join('');
      return `<path d="${path}" stroke="${item.color}"/>${points}`;
    }).join('');
    const legend = series.map(item => `<span><i style="background:${item.color}"></i>${esc(item.name)}</span>`).join('');
    return `<section class="report-chart"><div class="section-heading"><div><span>PHÂN TÍCH XU HƯỚNG</span><strong>${esc(chart.title || 'Diễn biến trong kỳ')}</strong></div><div class="chart-legend">${legend}</div></div><svg viewBox="0 0 ${width} ${height}" role="img"><g class="chart-grid">${grid}${labels}</g><g class="chart-lines">${paths}</g></svg></section>`;
  };

  const build = config => {
    const isReport = config.variant === 'report' || String(config.title || '').toUpperCase().startsWith('BÁO CÁO');
    const orientation = config.orientation === 'landscape' ? 'landscape' : 'portrait';
    const fields = (config.fields || []).map(item => `<div><span>${esc(item.label)}</span><strong>${esc(formatted(item))}</strong></div>`).join('');
    const columns = config.columns || []; const sourceRows = config.rows || [];
    const rows = sourceRows.map((row, index) => `<tr><td class="center row-index">${index + 1}</td>${columns.map(column => `<td class="${column.align || ''}">${esc(valueOf(row, column))}</td>`).join('')}</tr>`).join('');
    const totalsConfig = config.totals || [];
    const totals = totalsConfig.map(item => `<div><span>${esc(item.label)}</span><strong>${esc(formatted(item))}</strong></div>`).join('');
    const summaryColors = ['#267b5b', '#d89f32', '#4f72bb', '#7c5a96'];
    const summaries = (config.summary || totalsConfig).slice(0, 4).map((item, index) => `<article style="--summary-color:${item.color || summaryColors[index % 4]}"><span>${esc(item.label)}</span><strong>${esc(formatted(item))}</strong>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}</article>`).join('');
    const signatures = (config.signatures || ['Người lập', 'Bộ phận liên quan']).map(item => `<div><strong>${esc(item)}</strong><span>(Ký, ghi rõ họ tên)</span></div>`).join('');
    const chart = isReport ? printChart(config.chart, config.chart?.rows || sourceRows) : '';
    const totalsSection = totals && !isReport ? `<section class="totals">${totals}</section>` : '';
    return `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(config.title)} ${esc(config.number || '')}</title><style>
      @page{size:A4 ${orientation};margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;color:#183126;background:#e9eeeb;font:11px "Segoe UI",Arial,sans-serif}.sheet{width:${orientation === 'landscape' ? '297mm' : '210mm'};min-height:${orientation === 'landscape' ? '210mm' : '297mm'};margin:16px auto;padding:12mm 13mm;background:#fff;box-shadow:0 14px 44px #17251e24}.top{display:grid;grid-template-columns:1fr 1fr;align-items:start;gap:20px;padding-bottom:12px;border-bottom:1px solid #dbe4df}.brand-lockup{display:flex;align-items:center;gap:10px}.brand-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;background:#1d7656;color:#fff;font-size:19px;font-weight:900}.brand strong,.country strong{display:block;font-size:13px}.brand span,.country span{display:block;margin-top:3px;color:#677a70;font-size:9px}.country{text-align:right}.country i{display:block;width:120px;margin:6px 0 0 auto;border-top:1px solid #728179}.doc{position:relative;overflow:hidden;margin:14px 0;padding:17px 19px;border-radius:13px;background:linear-gradient(120deg,#174a37,#278261);color:#fff}.doc:after{content:"";position:absolute;width:150px;height:150px;right:-45px;top:-95px;border-radius:50%;background:#ffffff12}.doc .eyebrow{display:block;margin-bottom:5px;color:#d1eadf;font-size:8px;font-weight:800;letter-spacing:.13em}.doc h1{margin:0;font-size:21px;letter-spacing:.025em}.doc p{margin:7px 0 0;color:#e2f1ea}.doc .status{position:absolute;right:18px;bottom:17px;padding:5px 10px;border:1px solid #ffffff45;border-radius:20px;background:#ffffff16;color:#fff;font-size:9px;font-weight:700}.fields{display:grid;grid-template-columns:repeat(2,1fr);gap:7px 14px;margin-bottom:12px}.fields div{display:flex;gap:7px;padding:8px 10px;border:1px solid #dbe5df;border-radius:8px;background:#f8faf9}.fields span{color:#6c7d74}.fields strong{margin-left:auto;text-align:right}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.summary-grid article{position:relative;overflow:hidden;min-height:62px;padding:10px 11px;border:1px solid #dde6e1;border-radius:10px;background:linear-gradient(145deg,#fff,#f8faf9)}.summary-grid article:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--summary-color)}.summary-grid span,.summary-grid strong,.summary-grid small{display:block}.summary-grid span{color:#718178;font-size:8px;font-weight:800;letter-spacing:.05em}.summary-grid strong{margin-top:5px;color:#19382b;font-size:14px}.summary-grid small{margin-top:3px;color:#849088;font-size:8px}.report-chart{margin-bottom:12px;padding:10px 12px 6px;border:1px solid #dce5e0;border-radius:11px;page-break-inside:avoid}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:3px}.section-heading>div:first-child span,.section-heading>div:first-child strong{display:block}.section-heading>div:first-child span{color:#73867b;font-size:7px;font-weight:850;letter-spacing:.11em}.section-heading>div:first-child strong{margin-top:3px;font-size:11px}.chart-legend{display:flex;flex-wrap:wrap;gap:8px;color:#60736a;font-size:8px}.chart-legend span{display:flex;align-items:center;gap:4px}.chart-legend i{width:7px;height:7px;border-radius:2px}.report-chart svg{display:block;width:100%;height:43mm}.chart-grid line{stroke:#e3ebe6;stroke-dasharray:3 4}.chart-grid text{fill:#718279;font:8px "Segoe UI",Arial}.chart-lines path{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.chart-lines circle{stroke:#fff;stroke-width:1.8}.table-title{display:flex;align-items:center;justify-content:space-between;margin:3px 0 7px}.table-title strong{font-size:11px}.table-title span{color:#74857b;font-size:8px}table{width:100%;overflow:hidden;border:1px solid #d5dfda;border-radius:9px;border-collapse:separate;border-spacing:0;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{padding:7px 7px;border:0;border-bottom:1px solid #e1e8e4;vertical-align:top}th{background:#eaf3ee;color:#315343;font-size:8px;text-align:center;letter-spacing:.03em}tbody tr:nth-child(even){background:#f8faf9}tbody tr:last-child td{border-bottom:0}.row-index{width:28px;color:#78877f}.center{text-align:center}.right{text-align:right}.totals{margin:12px 0 0 auto;width:min(90mm,100%)}.totals div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #9aa79f}.note{margin-top:11px;padding:9px 11px;border-left:3px solid #2b8060;border-radius:0 7px 7px 0;background:#f1f7f4;line-height:1.45}.signatures{display:grid;grid-template-columns:repeat(var(--signatures),1fr);gap:12px;margin-top:19px;text-align:center;page-break-inside:avoid}.signatures strong,.signatures span{display:block}.signatures span{margin-top:4px;color:#748078;font-size:9px;font-style:italic}.sign-space{height:38px}.footer{display:flex;justify-content:space-between;margin-top:12px;padding-top:7px;border-top:1px solid #d6dfda;color:#7b8881;font-size:8px}.footer:after{content:"Supermarket Fly · Nội bộ"}@media print{body{background:#fff}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}
    </style></head><body><main class="sheet ${isReport ? 'report-sheet' : ''}"><section class="top"><div class="brand-lockup"><div class="brand-mark">F</div><div class="brand"><strong>SUPERMARKET FLY</strong><span>Cửa hàng Hà Nội · Hệ thống quản lý nội bộ</span></div></div><div class="country"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><span>Độc lập – Tự do – Hạnh phúc</span><i></i></div></section><header class="doc"><span class="eyebrow">${isReport ? 'BÁO CÁO QUẢN TRỊ · DỮ LIỆU HỆ THỐNG' : 'CHỨNG TỪ NỘI BỘ · DỮ LIỆU HỆ THỐNG'}</span><h1>${esc(config.title)}</h1><p>Số <strong>${esc(config.number || '—')}</strong> · Ngày lập ${esc(date(config.documentDate || new Date()))}</p>${config.status ? `<span class="status">${esc(config.status)}</span>` : ''}</header><section class="fields">${fields}</section>${isReport && summaries ? `<section class="summary-grid">${summaries}</section>` : ''}${chart}${isReport ? `<div class="table-title"><strong>Chi tiết số liệu trong kỳ</strong><span>${sourceRows.length} dòng dữ liệu</span></div>` : ''}<table><thead><tr><th style="width:34px">STT</th>${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length + 1}" class="center">Không có dòng chi tiết</td></tr>`}</tbody></table>${totalsSection}${config.note ? `<section class="note"><strong>Ghi chú:</strong> ${esc(config.note)}</section>` : ''}<section class="signatures" style="--signatures:${Math.max(1, (config.signatures || ['Người lập','Bộ phận liên quan']).length)}">${signatures}</section><div class="sign-space"></div><footer class="footer"><span>Phát hành tự động lúc ${esc(new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()))}</span></footer></main></body></html>`;
  };

  const show = config => {
    const old = document.querySelector('.document-preview-backdrop');
    if (old) old.remove();
    const isReport = config.variant === 'report' || String(config.title || '').toUpperCase().startsWith('BÁO CÁO');
    const overlay = document.createElement('div');
    overlay.className = `document-preview-backdrop${isReport ? ' report-preview' : ''}`;
    overlay.innerHTML = `<div class="document-preview-shell"><header><div><span>${isReport ? 'BẢN TRÌNH BÀY A4 · BÁO CÁO QUẢN TRỊ' : 'XEM TRƯỚC BẢN IN A4'}</span><strong>${esc(config.title)} · ${esc(config.number || '')}</strong></div><div><button class="warehouse-secondary close-preview">Đóng</button><button class="warehouse-primary print-document">${isReport ? 'In / Lưu PDF' : 'In chứng từ'}</button></div></header><iframe title="Xem trước ${esc(config.title)}"></iframe></div>`;
    document.body.appendChild(overlay);
    const iframe = overlay.querySelector('iframe');
    iframe.srcdoc = build(config);
    iframe.addEventListener('load', () => {
      if (!isReport || !iframe.contentDocument?.head) return;
      const style = iframe.contentDocument.createElement('style');
      style.textContent = `.doc{border:1px solid #d7e6de;border-left:4px solid #2b8463;background:linear-gradient(120deg,#f1f8f4,#fff);color:#183126}.doc:after{background:#2b84630a}.doc .eyebrow{color:#2b8463}.doc p{color:#667a70}.doc .status{border-color:#bddaca;background:#fff;color:#276f55}`;
      iframe.contentDocument.head.appendChild(style);
    });
    const close = () => overlay.remove();
    overlay.querySelector('.close-preview').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.print-document').addEventListener('click', () => iframe.contentWindow?.print());
  };

  window.FLY_PRINT = { show, build, money, date };
})();
