(() => {
  const esc = value => String(value ?? '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0))} đ`;
  const date = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const valueOf = (row, column) => {
    const raw = typeof column.value === 'function' ? column.value(row) : row[column.key];
    if (column.format === 'money') return money(raw);
    if (column.format === 'date') return date(raw);
    if (column.format === 'percent') return `${Number(raw || 0)}%`;
    return raw ?? '—';
  };

  const build = config => {
    const fields = (config.fields || []).map(item => `<div><span>${esc(item.label)}</span><strong>${esc(item.format === 'money' ? money(item.value) : item.format === 'date' ? date(item.value) : item.value)}</strong></div>`).join('');
    const columns = config.columns || [];
    const rows = (config.rows || []).map((row, index) => `<tr><td class="center">${index + 1}</td>${columns.map(column => `<td class="${column.align || ''}">${esc(valueOf(row, column))}</td>`).join('')}</tr>`).join('');
    const totals = (config.totals || []).map(item => `<div><span>${esc(item.label)}</span><strong>${esc(item.format === 'money' ? money(item.value) : item.value)}</strong></div>`).join('');
    const signatures = (config.signatures || ['Người lập', 'Bộ phận liên quan']).map(item => `<div><strong>${esc(item)}</strong><span>(Ký, ghi rõ họ tên)</span></div>`).join('');
    return `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(config.title)} ${esc(config.number || '')}</title><style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#17251e;background:#eef1ef;font:12px Arial,sans-serif}.sheet{width:210mm;min-height:297mm;margin:16px auto;padding:14mm 13mm;background:#fff;box-shadow:0 10px 35px #17251e24}.top{display:grid;grid-template-columns:1fr 1fr;gap:20px}.brand strong,.country strong{display:block;font-size:14px}.brand span,.country span{display:block;margin-top:4px;font-size:10px}.country{text-align:center}.country i{display:block;width:130px;margin:7px auto 0;border-top:1px solid #17251e}.doc{text-align:center;margin:24px 0 18px}.doc h1{margin:0;font-size:22px;letter-spacing:.04em}.doc p{margin:7px 0 0}.doc .status{display:inline-block;margin-top:9px;padding:5px 12px;border:1px solid #91b8a6;border-radius:20px;color:#17694e;font-size:10px;font-weight:700}.fields{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 28px;margin-bottom:16px}.fields div{display:flex;gap:7px;border-bottom:1px dotted #9aa79f;padding-bottom:5px}.fields span{color:#66736c}.fields strong{margin-left:auto;text-align:right}table{width:100%;border-collapse:collapse;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #69766f;padding:7px 6px;vertical-align:top}th{background:#eef4f0;font-size:10px;text-align:center}.center{text-align:center}.right{text-align:right}.totals{margin:12px 0 0 auto;width:min(90mm,100%)}.totals div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #9aa79f}.note{margin-top:14px;padding:10px 12px;border:1px solid #cad8d0;background:#f5f8f6;line-height:1.5}.signatures{display:grid;grid-template-columns:repeat(var(--signatures),1fr);gap:12px;margin-top:28px;text-align:center;page-break-inside:avoid}.signatures strong,.signatures span{display:block}.signatures span{margin-top:5px;font-size:10px;font-style:italic}.sign-space{height:58px}.footer{margin-top:18px;padding-top:8px;border-top:1px solid #cfd7d2;color:#78837d;font-size:9px;text-align:center}@media print{body{background:#fff}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}
    </style></head><body><main class="sheet"><section class="top"><div class="brand"><strong>SUPERMARKET FLY</strong><span>Cửa hàng Hà Nội · Hệ thống quản lý nội bộ</span></div><div class="country"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><span>Độc lập – Tự do – Hạnh phúc</span><i></i></div></section><header class="doc"><h1>${esc(config.title)}</h1><p>Số: <strong>${esc(config.number || '—')}</strong> · Ngày lập: ${esc(date(config.documentDate || new Date()))}</p>${config.status ? `<span class="status">${esc(config.status)}</span>` : ''}</header><section class="fields">${fields}</section><table><thead><tr><th style="width:34px">STT</th>${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length + 1}" class="center">Không có dòng chi tiết</td></tr>`}</tbody></table>${totals ? `<section class="totals">${totals}</section>` : ''}${config.note ? `<section class="note"><strong>Ghi chú:</strong> ${esc(config.note)}</section>` : ''}<section class="signatures" style="--signatures:${Math.max(1, (config.signatures || ['Người lập','Bộ phận liên quan']).length)}">${signatures}</section><div class="sign-space"></div><footer class="footer">Chứng từ được lập từ hệ thống Supermarket Fly · Cửa hàng Hà Nội</footer></main></body></html>`;
  };

  const show = config => {
    const old = document.querySelector('.document-preview-backdrop');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'document-preview-backdrop';
    overlay.innerHTML = `<div class="document-preview-shell"><header><div><span>XEM TRƯỚC BẢN IN A4</span><strong>${esc(config.title)} · ${esc(config.number || '')}</strong></div><div><button class="warehouse-secondary close-preview">Đóng</button><button class="warehouse-primary print-document">In chứng từ</button></div></header><iframe title="Xem trước ${esc(config.title)}"></iframe></div>`;
    document.body.appendChild(overlay);
    const iframe = overlay.querySelector('iframe');
    iframe.srcdoc = build(config);
    const close = () => overlay.remove();
    overlay.querySelector('.close-preview').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.print-document').addEventListener('click', () => iframe.contentWindow?.print());
  };

  window.FLY_PRINT = { show, money, date };
})();
