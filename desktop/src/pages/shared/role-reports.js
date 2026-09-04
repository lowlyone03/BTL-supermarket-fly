(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'warehouse-reports': '<section class="warehouse-page financial-reports report-warehouse"><div class="overview-loading">Đang mở bộ lọc báo cáo...</div></section>',
    'cashier-reports': '<section class="warehouse-page cashier-page financial-reports report-cashier"><div class="overview-loading">Đang mở bộ lọc báo cáo...</div></section>',
    'purchasing-reports': '<section class="warehouse-page financial-reports report-purchasing"><div class="overview-loading">Đang mở bộ lọc báo cáo...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const qty = value => Number(value || 0).toLocaleString('vi-VN');
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const fmtDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const pad2 = value => String(value).padStart(2, '0');
  const vnYmd = value => {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const addDaysIso = (iso, days) => {
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  };
  const eachDay = (from, to) => {
    const days = [];
    let cursor = from;
    while (cursor <= to) {
      days.push(cursor);
      cursor = addDaysIso(cursor, 1);
    }
    return days;
  };
  const eachMonth = (from, to) => {
    const months = [];
    let year = Number(from.slice(0, 4));
    let month = Number(from.slice(5, 7));
    const endYear = Number(to.slice(0, 4));
    const endMonth = Number(to.slice(5, 7));
    while (year < endYear || (year === endYear && month <= endMonth)) {
      months.push(`${year}-${pad2(month)}`);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return months;
  };
  const emptySalesBucket = key => ({ key, SoHoaDon: 0, DoanhThuHoaDon: 0, SoPhieu: 0, TienHoan: 0, DoanhThuThuan: 0 });
  const addSalesBucket = (bucket, row) => {
    bucket.SoHoaDon += Number(row.SoHoaDon || 0);
    bucket.DoanhThuHoaDon += Number(row.DoanhThuHoaDon || 0);
    bucket.SoPhieu += Number(row.SoPhieu || 0);
    bucket.TienHoan += Number(row.TienHoan || 0);
    bucket.DoanhThuThuan += Number(row.DoanhThuThuan || 0);
    return bucket;
  };
  const salesTrendTitle = (type, kind = 'chart') => {
    const grain = { day: 'ngày', month: 'tháng', quarter: 'quý', year: 'năm' }[type] || 'ngày';
    return kind === 'print' ? `Doanh thu hóa đơn và doanh thu thuần theo ${grain}` : `Doanh thu bán hàng theo ${grain}`;
  };
  const salesTrend = (daily, period = {}) => {
    const type = period.periodType || 'month';
    const from = period.from;
    const to = period.to;
    const grain = (type === 'quarter' || type === 'year') ? 'month' : 'day';
    const rows = daily || [];
    if (!rows.length) {
      return { type, grain, title: salesTrendTitle(type), printTitle: salesTrendTitle(type, 'print'), labels: [], rows: [] };
    }
    let buckets;
    if (grain === 'month' && from && to) {
      const map = new Map(eachMonth(from, to).map(key => [key, emptySalesBucket(key)]));
      rows.forEach(row => {
        const key = vnYmd(row.Ngay).slice(0, 7);
        if (map.has(key)) addSalesBucket(map.get(key), row);
      });
      buckets = [...map.values()];
    } else if (type === 'month' && from && to) {
      const map = new Map(eachDay(from, to).map(key => [key, emptySalesBucket(key)]));
      rows.forEach(row => {
        const key = vnYmd(row.Ngay);
        if (map.has(key)) addSalesBucket(map.get(key), row);
      });
      buckets = [...map.values()];
    } else {
      buckets = rows.map(row => addSalesBucket(emptySalesBucket(vnYmd(row.Ngay)), row));
    }
    const labels = buckets.map(row => grain === 'month'
      ? `T${Number(row.key.slice(5, 7))}/${row.key.slice(0, 4)}`
      : fmtDate(row.Ngay || `${row.key}T00:00:00+07:00`));
    return {
      type,
      grain,
      title: salesTrendTitle(type),
      printTitle: salesTrendTitle(type, 'print'),
      labels,
      rows: buckets.map((row, index) => ({ ...row, label: labels[index] }))
    };
  };
  const heading = (kicker, title, subtitle) => `<header class="warehouse-heading"><div><p class="warehouse-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></header>`;
  const reportDefaults = () => window.FLY_REPORT_PERIOD?.defaults?.() || (() => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    const year = get('year'); const month = get('month'); const day = get('day');
    return { day: `${year}-${month}-${day}`, month: `${year}-${month}`, quarter: `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`, year };
  })();
  const api = async (context, path) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${context.apiBase}${path}`, { headers: { Authorization: `Bearer ${context.token}` }, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Không thể lập báo cáo.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Máy chủ phản hồi quá lâu. Hãy bấm Lập báo cáo để thử lại.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  const ui = () => window.FLY_UI || { kpiGrid: items => '', bars: () => '', person: (name, sub) => `${name}${sub ? `<small>${sub}</small>` : ''}` };
  const chartUi = () => window.FLY_CHARTS || { card: () => '', line: () => '', columns: () => '', horizontal: () => '', donut: () => '', compact: qty, money };
  const reportActionButtons = '<button class="warehouse-secondary" id="exportRoleReportCsv" disabled>Xuất CSV</button><button class="warehouse-secondary" id="printRoleReport" disabled>Xem bản in / PDF</button>';
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const downloadCsv = (filename, rows) => {
    const content = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const hangDiDauText = row => {
    if (row.HangDiDau) return row.HangDiDau;
    const restock = Number(row.SLNhapLai || 0);
    const scrap = Number(row.SLLoaiBo || row.SLKhongNhapLai || 0);
    const pending = Math.max(0, Number(row.SLTra || 0) - restock - scrap);
    const parts = [];
    if (restock) parts.push(`Nhập lại kho bán ${restock}`);
    if (scrap) parts.push(`Loại bỏ / vứt ${scrap} — không cộng tồn (đã trừ lúc bán)`);
    if (pending) parts.push(`Chưa xử lý kho ${pending}`);
    return parts.join(' · ') || '—';
  };
  const returnCsvRows = data => {
    const summary = data?.summary || {};
    const tickets = data?.tickets || [];
    const products = data?.products || [];
    return [
      [],
      ['ĐỔI TRẢ KHÁCH HÀNG'],
      ['Số phiếu', summary.SoPhieu || 0],
      ['Hoàn tiền / Đổi hàng', `${summary.SoHoanTien || 0} / ${summary.SoDoiHang || 0}`],
      ['Tiền đã hoàn', summary.TienHoan || 0],
      ['Chờ Thủ kho kiểm', summary.ChoKiemTra || 0],
      ['Chờ Quản lý duyệt', summary.ChoDuyet || 0],
      ['Chờ thu ngân xác nhận', summary.ChoThuNganXacNhan || 0],
      ['Nhập lại kho bán (phiếu)', summary.NhapLaiKho || 0],
      ['Loại bỏ / vứt (phiếu)', summary.KhongNhapLai || 0],
      [],
      ['Phiếu', 'Hóa đơn', 'Khách', 'Hình thức', 'Lý do', 'Tiền hoàn', 'Trạng thái', 'Trách nhiệm', 'Hàng đi đâu', 'Thu ngân lập', 'Thủ kho', 'Quản lý'],
      ...tickets.map(row => [row.MaDT, row.MaHD, row.TenKH || 'Khách vãng lai', row.HinhThucXuLy, row.LyDo, row.SoTienHoan, row.TrangThai, row.BuocCanXuLy, hangDiDauText(row), row.NguoiLap, row.NguoiKiemTra, row.NguoiDuyet]),
      [],
      ['Sản phẩm', 'Mã SP', 'SL trả', 'Nhập lại kho', 'Loại bỏ / vứt', 'Hàng đi đâu', 'Lý do'],
      ...products.map(row => [row.TenSP, row.MaSP, row.SLTra, row.SLNhapLai || 0, row.SLLoaiBo || row.SLKhongNhapLai || 0, hangDiDauText(row), row.LyDoMau])
    ];
  };
  const enableReportActions = root => root.querySelectorAll('#exportRoleReportCsv, #printRoleReport').forEach(button => { button.disabled = false; });
  const periodCard = (extraButtons = reportActionButtons) => {
    if (!window.FLY_VI_DATE?.periodToolbar) {
      return `<div id="roleReportBody">${failBox('Giao diện kỳ báo cáo chưa tải. Hãy đóng ứng dụng và chạy lại npm start.')}</div>`;
    }
    return `${window.FLY_VI_DATE.periodToolbar(reportDefaults(), extraButtons, 'loadRoleReport')}<div id="roleReportBody"><div class="welcome-card report-idle"><h2>Chưa lập báo cáo</h2><p>Chọn kỳ rồi bấm <strong>Lập báo cáo</strong> để tổng hợp số liệu. Trang này không tự chạy truy vấn nặng khi vừa mở.</p></div></div>`;
  };
  const bindPeriod = (root, load) => {
    const selected = () => {
      const type = root.querySelector('#reportPeriodType')?.value;
      const inputs = { day: '#reportDay', month: '#reportMonth', quarter: '#reportQuarter', year: '#reportYear' };
      const period = root.querySelector(inputs[type] || '#reportMonth')?.value;
      if (!type || !period) throw new Error('Chưa chọn kỳ báo cáo.');
      return { type, period };
    };
    root.querySelector('#reportPeriodType')?.addEventListener('change', () => {
      const type = root.querySelector('#reportPeriodType').value;
      root.querySelectorAll('[data-period-field]').forEach(field => field.classList.toggle('active', field.dataset.periodField === type));
    });
    root.querySelector('#loadRoleReport')?.addEventListener('click', load);
    return selected;
  };
  const failBox = message => `<div class="welcome-card"><h2>Không lập được báo cáo</h2><p>${esc(message)}</p></div>`;
  const titleBlock = (root, period, badge) => `${window.FLY_REPORT_PERIOD?.activeFallbackBanner(root, { period }) || ''}<div class="financial-report-title"><div><p>KỲ BÁO CÁO</p><h2>${esc(period.label)}</h2><span>${esc(period.from)} đến ${esc(period.to)}</span></div><span class="status-pill ok">${esc(badge)}</span></div>`;
  const slipKindLabel = doc => {
    const raw = `${doc.LoaiChungTu || ''} ${doc.LoaiGD || ''}`;
    if (/đổi trả/i.test(raw)) return 'Đổi trả';
    if (/kiểm kê/i.test(raw)) return 'Kiểm kê';
    if (/phiếu nhập/i.test(raw)) return 'Phiếu nhập';
    if (/phiếu xuất/i.test(raw)) return 'Phiếu xuất';
    if (/hoadon|hóa đơn/i.test(raw)) return 'Hóa đơn bán';
    return doc.LoaiChungTu || doc.LoaiGD || 'Chứng từ';
  };
  const slipDestination = doc => {
    const kind = `${doc.LoaiChungTu || ''} ${doc.LoaiGD || ''}`;
    const id = doc.MaChungTu;
    if (!id) return { nav: 'warehouse-history' };
    if (/đổi trả/i.test(kind)) return { nav: 'warehouse-returns', id, open: 'return' };
    if (/kiểm kê/i.test(kind)) return { nav: 'warehouse-inventory-counts', id, open: 'count' };
    if (/phiếu nhập/i.test(kind)) return { nav: 'warehouse-receipts', id };
    if (/phiếu xuất/i.test(kind)) return { nav: 'warehouse-stock-issues', id };
    return { nav: 'warehouse-history' };
  };
  const bindWarehouseChartActions = (charts, context) => {
    charts.setActionHandler?.(action => {
      if (!action?.nav && !action?.open) return;
      if (action.open === 'count' && action.id && window.FLY_WAREHOUSE?.openCount) {
        window.FLY_WAREHOUSE.openCount(context, action.id, () => {});
        return;
      }
      if (action.open === 'return' && action.id && window.FLY_WAREHOUSE?.openReturn) {
        window.FLY_WAREHOUSE.openReturn(context, action.id, () => {}, 'view');
        return;
      }
      if (action.nav === 'warehouse-receipts' && action.id) sessionStorage.setItem('fly_open_receipt', action.id);
      if (action.nav === 'warehouse-stock-issues' && action.id) sessionStorage.setItem('fly_open_stock_issue', action.id);
      if (action.nav === 'warehouse-inventory' && action.id) {
        sessionStorage.setItem('fly_inventory_search', action.id);
        sessionStorage.setItem('fly_inventory_low_only', '0');
      }
      context.navigate(action.nav);
    });
  };
  const percent = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Number(value || 0))}%`;
  const statusClass = value => /quá hạn|trễ|từ chối|thất bại/i.test(value || '') ? 'cancelled' : /hoàn thành|đã xác nhận|đã duyệt|khớp/i.test(value || '') ? 'ok' : /chờ|đang/i.test(value || '') ? 'sent' : 'draft';
  const alertList = items => `<div class="report-alert-list">${items.map(item => `<article class="${esc(item.tone || '')}"><span class="report-alert-icon"><svg><use href="#${esc(item.icon)}"/></svg></span><div><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></div>${item.value != null ? `<b>${esc(item.value)}</b>` : ''}</article>`).join('')}</div>`;
  const stepClass = value => /chưa|chờ|kẹt/i.test(value || '') ? 'sent' : /từ chối|không nhập lại|nhầm|loại bỏ|vứt/i.test(value || '') ? 'cancelled' : /xong|nhập lại kho/i.test(value || '') ? 'ok' : 'draft';
  const doiTraPanel = (data, options = {}) => {
    const summary = data?.summary || {};
    const tickets = data?.tickets || [];
    const products = data?.products || [];
    if (!Number(summary.SoPhieu || 0) && !tickets.length && !products.length) return '';
    const ticketRows = tickets.length
      ? tickets.map(row => `<tr class="${row.TrangThai === 'Đã duyệt' ? 'cashier-return-ready' : ''}"><td><strong>${esc(row.MaDT)}</strong><small>${esc(row.MaHD)} · ${esc(row.TenKH || 'Khách vãng lai')}</small></td><td>${esc(row.HinhThucXuLy)}<small>${esc(row.TrangThai)}</small></td><td class="report-return-reason">${esc(row.LyDo || '—')}</td><td class="num">${money(row.SoTienHoan)}</td><td class="report-return-duty"><span class="status-pill ${stepClass(row.BuocCanXuLy)}">${esc(row.BuocCanXuLy)}</span><small class="report-return-fate">Hàng: ${esc(hangDiDauText(row))}</small><div class="report-return-people"><span>Lập <b>${esc(row.NguoiLap || '—')}</b></span><span>Kho <b>${esc(row.NguoiKiemTra || '—')}</b></span><span>Duyệt <b>${esc(row.NguoiDuyet || '—')}</b></span></div></td></tr>`).join('')
      : '<tr><td colspan="5" class="warehouse-empty">Kỳ này chưa có phiếu đổi trả.</td></tr>';
    const productCard = options.showProducts === false ? '' : `<article class="warehouse-table-card report-return-products"><div class="warehouse-panel-title"><div><p>HÀNG KHÁCH TRẢ</p><h2>${esc(options.productTitle || 'Sản phẩm bị đổi trả nhiều')}</h2></div><span class="report-card-count">${products.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>SL TRẢ</th><th>NHẬP LẠI</th><th>LOẠI BỎ / VỨT</th><th>HÀNG ĐI ĐÂU</th></tr></thead><tbody>${products.length ? products.map(row => `<tr><td><strong>${esc(row.TenSP)}</strong><small>${esc(row.MaSP)}${row.LyDoMau ? ` · ${esc(row.LyDoMau)}` : ''}</small></td><td class="num">${row.SLTra}</td><td class="num">${row.SLNhapLai || 0}</td><td class="num">${row.SLLoaiBo || row.SLKhongNhapLai || 0}</td><td class="report-return-fate">${esc(hangDiDauText(row))}</td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Kỳ này chưa có hàng khách trả.</td></tr>'}</tbody></table></div></article>`;
    return `<section class="report-return-block">
      <div class="report-return-heading"><div><p>ĐỔI TRẢ VÀ TRÁCH NHIỆM</p><h2>${esc(options.title || 'Phiếu đổi trả trong kỳ')}</h2><span>${esc(options.subtitle || 'Cột trách nhiệm cho biết việc đang nằm ở bước nào. Hàng đi đâu: nhập lại kho bán (cộng tồn) hoặc loại bỏ/vứt (không cộng, đã trừ lúc bán).')}</span></div><b>${tickets.length} phiếu</b></div>
      <div class="report-return-kpis">
        <article><span>PHIẾU ĐỔI TRẢ</span><strong>${summary.SoPhieu || 0}</strong><small>${summary.SoHoanTien || 0} hoàn tiền · ${summary.SoDoiHang || 0} đổi hàng</small></article>
        <article><span>TIỀN ĐÃ HOÀN</span><strong>${money(summary.TienHoan)}</strong><small>${summary.ChoThuNganXacNhan || 0} chờ thu ngân xác nhận</small></article>
        <article><span>ĐANG KẸT BƯỚC</span><strong>${Number(summary.ChoKiemTra || 0) + Number(summary.ChoDuyet || 0) + Number(summary.ChoThuNganXacNhan || 0)}</strong><small>Thủ kho ${summary.ChoKiemTra || 0} · Quản lý ${summary.ChoDuyet || 0}</small></article>
        <article><span>HÀNG ĐI ĐÂU</span><strong>${summary.NhapLaiKho || 0} · ${summary.KhongNhapLai || 0}</strong><small>Nhập lại kho bán · Loại bỏ/vứt (không cộng tồn)</small></article>
      </div>
      <div class="report-return-grid">
        <article class="warehouse-table-card report-return-tickets"><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU / HĐ</th><th>HÌNH THỨC</th><th>LÝ DO</th><th>TIỀN HOÀN</th><th>TRÁCH NHIỆM / NGƯỜI XỬ LÝ</th></tr></thead><tbody>${ticketRows}</tbody></table></div></article>
        ${productCard}
      </div>
    </section>`;
  };

  const initWarehouseReport = async (root, context) => {
    let currentReport = null;
    root.innerHTML = `${heading('THỦ KHO / BÁO CÁO', 'Báo cáo nhập – xuất – tồn', 'Số lượng nhập xuất trong kỳ, tồn hiện tại, mặt hàng sắp hết, phiếu nhập/xuất/kiểm kê và đổi trả chờ kiểm.')}${periodCard()}`;
    let loadReport = async () => {};
    const selected = bindPeriod(root, () => { loadReport(); });
    loadReport = async () => {
      const button = root.querySelector('#loadRoleReport');
      if (button) button.disabled = true;
      try {
        const { type, period } = selected();
        const data = await api(context, `/warehouse/reports/inventory?periodType=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}${root.dataset.reportLock === '1' ? '&lockPeriod=1' : ''}`);
        window.FLY_REPORT_PERIOD?.syncFromReport(root, data);
        root.dataset.reportLock = '1';
        currentReport = data;
        const m = data.movement || {}; const stock = data.stock || {}; const docs = data.documents || {};
        const lowStock = data.lowStock || [];
        const daily = data.daily || [];
        const categories = data.inventoryByCategory || [];
        const recentDocuments = data.recentDocuments || [];
        const visuals = ui();
        const charts = chartUi();
        charts.setActionHandler?.(null);
        const netMovement = Number(m.SoLuongNhap || 0) - Number(m.SoLuongXuat || 0) + Number(m.DieuChinhRong || 0);
        const categoryTotal = categories.reduce((sum, row) => sum + Number(row.GiaTriTon || 0), 0);
        const productsByCat = new Map();
        (data.topProductsByCategory || []).forEach(row => {
          const list = productsByCat.get(row.MaDM) || [];
          list.push(row);
          productsByCat.set(row.MaDM, list);
        });
        const docsByDay = new Map();
        (data.dailyDocuments || []).forEach(doc => {
          const key = vnYmd(doc.Ngay);
          if (!docsByDay.has(key)) docsByDay.set(key, []);
          docsByDay.get(key).push(doc);
        });
        const categoryShare = value => categoryTotal ? percent(Number(value || 0) / categoryTotal * 100) : '0%';
        const categoryExtras = (_label, index) => {
          const row = categories[index];
          if (!row) return null;
          const products = productsByCat.get(row.MaDM) || [];
          return {
            title: row.TenDM,
            rows: [
              { name: 'Tỷ trọng', value: categoryShare(row.GiaTriTon), color: '#5376c6' },
              { name: 'Số lượng tồn', value: qty(row.SoLuongTon), color: '#d8a33e' }
            ],
            notes: products.length
              ? products.map(item => `Top: ${item.TenSP} · ${money(item.GiaTriTon)} · ${qty(item.SLTon)}`)
              : ['Nhóm này chưa có mặt hàng còn tồn.'],
            actions: [{ label: 'Mở tồn kho theo nhóm này', nav: 'warehouse-inventory', id: row.TenDM }]
          };
        };
        const dayExtras = (_label, index) => {
          const row = daily[index];
          if (!row) return null;
          const docsOfDay = docsByDay.get(vnYmd(row.Ngay)) || [];
          const notes = [];
          if (Number(row.DieuChinhRong)) notes.push(`Điều chỉnh ròng ${qty(row.DieuChinhRong)}`);
          const nhapCount = Number(row.SoChungTuNhap || 0);
          const xuatCount = Number(row.SoChungTuXuat || 0);
          if (nhapCount || xuatCount) notes.push(`${nhapCount} chứng từ nhập · ${xuatCount} chứng từ xuất`);
          if (docsOfDay.length) {
            notes.push(...docsOfDay.slice(0, 6).map(doc => `${slipKindLabel(doc)}: ${doc.MaChungTu}`));
            if (docsOfDay.length > 6) notes.push(`… và ${docsOfDay.length - 6} chứng từ khác trong ngày`);
          } else if (!nhapCount && !xuatCount) {
            notes.push('Ngày này chưa có phiếu trong sổ giao dịch kho.');
          }
          const actions = [{ label: 'Mở lịch sử kho', nav: 'warehouse-history' }];
          docsOfDay.slice(0, 3).forEach(doc => {
            const dest = slipDestination(doc);
            if (dest.id && dest.nav !== 'warehouse-history') {
              actions.push({ label: `Mở ${doc.MaChungTu}`, nav: dest.nav, id: dest.id, open: dest.open });
            }
          });
          return { notes, actions };
        };
        const donutItems = categories.map((row, index) => {
          const extra = categoryExtras(row.TenDM, index) || {};
          return {
            label: row.TenDM,
            value: row.GiaTriTon,
            color: charts.palette?.[index % charts.palette.length],
            extraRows: [{ name: 'Số lượng tồn', value: qty(row.SoLuongTon), color: '#d8a33e' }],
            notes: extra.notes || [],
            actions: extra.actions || []
          };
        });
        root.querySelector('#roleReportBody').innerHTML = `${titleBlock(root, data.period, 'Báo cáo kho')}
          ${visuals.kpiGrid([
            { icon: 'i-cash', label: 'GIÁ TRỊ TỒN KHO', value: money(stock.GiaTriTon), hint: `${qty(stock.TongTon)} đơn vị đang tồn` },
            { icon: 'i-warning', label: 'DƯỚI TỒN TỐI THIỂU', value: `${stock.TonThap || 0} mặt hàng`, hint: `${stock.HetHang || 0} mặt hàng đã hết`, tone: Number(stock.TonThap) ? 'attention' : '' },
            { icon: 'i-truck', label: 'PHIẾU NHẬP TRONG KỲ', value: String(docs.SoPhieuNhap || 0), hint: `${qty(m.SoLuongNhap)} đơn vị đã nhập` },
            { icon: 'i-inventory', label: 'PHIẾU XUẤT TRONG KỲ', value: String(docs.SoPhieuXuat || 0), hint: `${qty(m.SoLuongXuat)} đơn vị đã xuất` },
            { icon: 'i-approve', label: 'ĐỢT KIỂM KÊ', value: String(docs.SoKiemKe || 0), hint: `${docs.ChoDuyetKiemKe || 0} đợt chờ duyệt` },
            { icon: 'i-alert', label: 'CHÊNH LỆCH KIỂM KÊ', value: money(docs.GiaTriChenhLechKiemKe), hint: `${qty(m.DieuChinhRong)} điều chỉnh ròng`, tone: Number(docs.GiaTriChenhLechKiemKe) ? 'attention' : '' }
          ], 'primary')}
          <div class="fly-dashboard-grid report-chart-pair report-warehouse-visuals">
            ${charts.card({ kicker: 'NHẬP – XUẤT – TỒN', title: 'Biến động kho theo ngày', subtitle: 'Tồn cuối ngày đọc trục phải, được tái lập từ sổ giao dịch kho', badge: `${netMovement >= 0 ? '+' : ''}${qty(netMovement)} ròng`, className: 'executive', chart: charts.line({ labels: daily.map(row => fmtDate(row.Ngay)), series: [{ name: 'Nhập', values: daily.map(row => row.SoLuongNhap), color: '#2c8b66', dash: false }, { name: 'Xuất', values: daily.map(row => row.SoLuongXuat), color: '#e1a536', dash: true }, { name: 'Tồn cuối ngày', values: daily.map(row => row.TonCuoiNgay), color: '#5376c6', dash: true, axis: 'right' }], formatter: qty, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa phát sinh giao dịch kho.', dualAxis: true, alwaysHit: true, emphasis: true, pointExtras: dayExtras, markerNote: 'Nhập/Xuất đọc trục trái · Tồn cuối đọc trục phải. Bấm ngày để xem số và phiếu; bấm ra ngoài hoặc Esc để đóng.' }) })}
            ${charts.card({ kicker: 'DANH MỤC', title: 'Giá trị tồn theo danh mục', subtitle: 'Giá trị tồn hiện tại theo nhóm hàng', badge: money(stock.GiaTriTon), className: 'operations', chart: charts.columns({ labels: categories.map(row => row.TenDM), series: [{ name: 'Giá trị tồn', values: categories.map(row => row.GiaTriTon), color: '#2c8b66' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Chưa có dữ liệu tồn kho theo danh mục.', labelWrap: true, emphasizeBars: true, alwaysHit: true, pointExtras: categoryExtras, markerNote: 'Bấm cột để xem tỷ trọng, số lượng và mặt hàng chiếm vốn lớn nhất.' }) })}
          </div>
          <div class="fly-dashboard-grid report-chart-composition">
            ${charts.card({ kicker: 'CƠ CẤU TỒN', title: 'Tỷ trọng giá trị tồn kho', subtitle: 'Phân bổ vốn hàng hóa theo danh mục', badge: `${categories.length} danh mục`, className: 'summary wide', chart: charts.donut({ items: donutItems, centerLabel: 'Giá trị tồn', centerValue: money(categoryTotal || stock.GiaTriTon), formatter: money, emptyText: 'Chưa có giá trị tồn kho.' }) })}
          </div>
          <div class="report-bottom-grid">
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>ƯU TIÊN BỔ SUNG</p><h2>Sản phẩm dưới tồn tối thiểu</h2></div><span class="report-card-count">${stock.TonThap || 0}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>TỒN</th><th>THIẾU</th></tr></thead><tbody>${lowStock.length ? lowStock.slice(0, 6).map(row => `<tr><td>${visuals.person(row.TenSP, `${row.MaSP} · ${row.DonViTinh}`)}</td><td class="num">${qty(row.SLTon)}</td><td class="num"><strong>${qty(Math.max(0, Number(row.TonKhoToiThieu) - Number(row.SLTon)))}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Không có mặt hàng dưới tồn tối thiểu.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CHỨNG TỪ GẦN ĐÂY</p><h2>Phiếu nhập, xuất và kiểm kê</h2></div><span class="report-card-count">${recentDocuments.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>CHỨNG TỪ</th><th>NGÀY</th><th>TRẠNG THÁI</th></tr></thead><tbody>${recentDocuments.length ? recentDocuments.slice(0, 6).map(row => `<tr><td><strong>${esc(row.MaChungTu)}</strong><small>${esc(row.LoaiChungTu)} · ${esc(row.NguoiLap)}</small></td><td>${fmtDateTime(row.NgayChungTu)}</td><td><span class="status-pill ${statusClass(row.TrangThai)}">${esc(row.TrangThai)}</span></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Kỳ này chưa có chứng từ kho.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Việc kho cần xử lý</h2></div></div>${alertList([
              { icon: 'i-warning', tone: Number(stock.TonThap) ? 'warning' : 'ok', title: `${stock.TonThap || 0} mặt hàng dưới tồn tối thiểu`, detail: `${stock.HetHang || 0} mặt hàng đã hết`, value: 'Tồn kho' },
              { icon: 'i-inventory', tone: Number(docs.ChoDuyetXuat) ? 'warning' : 'ok', title: `${docs.ChoDuyetXuat || 0} Phiếu xuất chờ duyệt`, detail: 'Chưa làm giảm tồn kho', value: 'Xuất kho' },
              { icon: 'i-refresh', tone: Number(docs.ChoKiemTraDoiTra) ? 'warning' : 'ok', title: `${docs.ChoKiemTraDoiTra || 0} đổi trả chờ kiểm tra`, detail: 'Chỉ hàng đạt mới nhập lại kho', value: 'Đổi trả' },
              { icon: 'i-approve', tone: Number(docs.ChoDuyetKiemKe) ? 'warning' : 'ok', title: `${docs.ChoDuyetKiemKe || 0} kiểm kê chờ duyệt`, detail: 'Tồn chưa thay đổi trước khi duyệt', value: 'Kiểm kê' }
            ])}</article>
          </div>
          ${doiTraPanel(data.doiTra, { title: 'Hàng khách trả đã/đang kiểm', subtitle: 'Nhập lại = cộng tồn bán. Loại bỏ/vứt = không cộng tồn vì đã trừ lúc bán — không trừ lần nữa. Chờ kiểm tra là việc của Thủ kho.', productTitle: 'Mặt hàng trả về kho' })}`;
        window.FLY_REPORT_LAYOUT?.enhance(root.querySelector('#roleReportBody'), { actor: 'Thủ kho', analysisTitle: 'Biến động và sức khỏe tồn kho', detailTitle: 'Mặt hàng cần bổ sung' });
        bindWarehouseChartActions(charts, context);
        enableReportActions(root);
      } catch (error) {
        context.showToast(error.message, 'error');
        const body = root.querySelector('#roleReportBody');
        if (body) body.innerHTML = failBox(error.message);
      }
      finally { const live = root.querySelector('#loadRoleReport'); if (live) live.disabled = false; }
    };
    root.querySelector('#printRoleReport')?.addEventListener('click', () => {
      if (!currentReport) return;
      const m = currentReport.movement || {}; const stock = currentReport.stock || {}; const lowStock = currentReport.lowStock || [];
      window.FLY_PRINT.show({
        variant: 'report', title: 'BÁO CÁO NHẬP – XUẤT – TỒN', number: currentReport.period.period,
        documentDate: new Date(), status: currentReport.period.label,
        fields: [{ label: 'Từ ngày', value: currentReport.period.from }, { label: 'Đến ngày', value: currentReport.period.to }],
        columns: [{ label: 'Mã SP', key: 'MaSP' }, { label: 'Sản phẩm', key: 'TenSP' }, { label: 'ĐVT', key: 'DonViTinh' }, { label: 'Tồn hiện tại', key: 'SLTon', align: 'right' }, { label: 'Tồn tối thiểu', key: 'TonKhoToiThieu', align: 'right' }, { label: 'Thiếu', value: row => Math.max(0, Number(row.TonKhoToiThieu) - Number(row.SLTon)), align: 'right' }],
        rows: lowStock,
        summary: [{ label: 'Nhập trong kỳ', value: m.SoLuongNhap }, { label: 'Xuất trong kỳ', value: m.SoLuongXuat }, { label: 'Tồn hiện tại', value: stock.TongTon }, { label: 'Giá trị tồn', value: stock.GiaTriTon, format: 'money' }],
        chart: { title: 'Nhập – xuất – điều chỉnh theo ngày', rows: currentReport.daily || [], labelKey: 'Ngay', labelFormat: 'date', series: [{ name: 'Nhập', key: 'SoLuongNhap', color: '#267b5b' }, { name: 'Xuất', key: 'SoLuongXuat', color: '#d89f32' }, { name: 'Điều chỉnh', value: row => Math.abs(Number(row.DieuChinhRong || 0)), color: '#4f72bb' }] },
        note: 'Mức thiếu = tồn tối thiểu − tồn hiện tại. Danh sách chỉ gồm mặt hàng chạm hoặc dưới ngưỡng tồn tối thiểu.',
        signatures: ['Thủ kho lập báo cáo', 'Quản lý cửa hàng']
      });
    });
    root.querySelector('#exportRoleReportCsv')?.addEventListener('click', () => {
      if (!currentReport) return;
      const m = currentReport.movement || {}; const stock = currentReport.stock || {};
      downloadCsv(`bao-cao-kho-${currentReport.period.period}.csv`, [['BÁO CÁO NHẬP – XUẤT – TỒN', currentReport.period.label], ['Nhập trong kỳ', m.SoLuongNhap], ['Xuất trong kỳ', m.SoLuongXuat], ['Tồn hiện tại', stock.TongTon], ['Giá trị tồn', stock.GiaTriTon], [], ['Mã SP', 'Sản phẩm', 'ĐVT', 'Tồn', 'Tối thiểu', 'Thiếu'], ...(currentReport.lowStock || []).map(row => [row.MaSP, row.TenSP, row.DonViTinh, row.SLTon, row.TonKhoToiThieu, Math.max(0, Number(row.TonKhoToiThieu) - Number(row.SLTon))]), ...returnCsvRows(currentReport.doiTra)]);
    });
  };

  const initSalesReport = async (root, context) => {
    let currentReport = null;
    root.innerHTML = `${heading('THU NGÂN / BÁO CÁO', 'Báo cáo ca và bán hàng của bạn', 'Chỉ hóa đơn, phương thức thanh toán, hoàn tiền và ca do chính bạn lập. Không gồm doanh thu thu ngân khác.')}${periodCard()}`;
    let loadReport = async () => {};
    const selected = bindPeriod(root, () => { loadReport(); });
    loadReport = async () => {
      const button = root.querySelector('#loadRoleReport');
      if (button) button.disabled = true;
      try {
        const { type, period } = selected();
        const data = await api(context, `/cashier/reports/sales?periodType=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}${root.dataset.reportLock === '1' ? '&lockPeriod=1' : ''}`);
        window.FLY_REPORT_PERIOD?.syncFromReport(root, data);
        root.dataset.reportLock = '1';
        currentReport = data;
        const s = data.sales || {}; const m = data.methods || {};
        const shifts = data.shifts || [];
        const daily = data.daily || [];
        const topProducts = data.topProducts || [];
        const recentInvoices = data.recentInvoices || [];
        const alerts = data.alerts || {};
        const visuals = ui();
        const charts = chartUi();
        charts.setActionHandler?.(null);
        const trend = salesTrend(daily, data.period);
        const netRevenue = Number(s.DoanhThuHoaDon || 0) - Number(s.TienHoan || 0);
        const electronic = Number(m.QR || 0) + Number(m.The || 0) + Number(m.ChuyenKhoan || 0);
        const averageOrder = Number(s.SoHoaDon || 0) ? netRevenue / Number(s.SoHoaDon) : 0;
        const trendSeries = [{ name: 'Doanh thu hóa đơn', values: trend.rows.map(row => row.DoanhThuHoaDon), color: '#25845f' }, { name: 'Doanh thu thuần', values: trend.rows.map(row => row.DoanhThuThuan), color: '#4f73c5' }];
        const trendChartOpts = { labels: trend.labels, series: trendSeries, formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này bạn chưa có hóa đơn hoàn thành.' };
        const trendChart = (trend.type === 'month' || trend.grain === 'month')
          ? charts.columns({ ...trendChartOpts, markerNote: 'Cột xanh = doanh thu hóa đơn, cột xanh dương = doanh thu thuần — hai cột đứng cạnh nhau kể cả khi hai số bằng nhau. Ngày không bán không vẽ cột. Bấm vào cột hoặc vùng ngày để xem cả hai số.' })
          : charts.line({ ...trendChartOpts, markerNote: 'Hai chấm cạnh nhau là hai doanh thu của cùng một ngày. Ngày không bán không gắn chấm. Bấm vào ngày để xem cả hai số.' });
        root.querySelector('#roleReportBody').innerHTML = `${titleBlock(root, data.period, 'Bán hàng cá nhân')}
          ${visuals.kpiGrid([
            { icon: 'i-trend', label: 'DOANH THU THUẦN', value: money(netRevenue), hint: `${s.SoHoaDon || 0} hóa đơn hoàn thành` },
            { icon: 'i-report', label: 'SỐ HÓA ĐƠN', value: String(s.SoHoaDon || 0), hint: 'Chỉ hóa đơn đã hoàn thành' },
            { icon: 'i-cart', label: 'GIÁ TRỊ TRUNG BÌNH', value: money(averageOrder), hint: 'Doanh thu thuần / số hóa đơn' },
            { icon: 'i-cash', label: 'GIAO DỊCH TIỀN MẶT', value: money(m.TienMat), hint: 'Khoản đi vào két ca' },
            { icon: 'i-bank', label: 'THANH TOÁN ĐIỆN TỬ', value: money(electronic), hint: `QR ${money(m.QR)} · Thẻ ${money(m.The)} · CK ${money(m.ChuyenKhoan)}` },
            { icon: 'i-refresh', label: 'ĐỔI TRẢ HOÀN THÀNH', value: String(s.SoPhieu || 0), hint: `Đã hoàn ${money(s.TienHoan)}`, tone: Number(s.SoPhieu) ? 'attention' : '' }
          ], 'primary')}
          <div class="fly-dashboard-grid report-chart-trio">
            ${charts.card({ kicker: 'XU HƯỚNG CÁ NHÂN', title: trend.title, subtitle: 'Doanh thu hóa đơn và doanh thu sau hoàn tiền', badge: money(netRevenue), className: 'executive', chart: trendChart })}
            ${charts.card({ kicker: 'THANH TOÁN', title: 'Cơ cấu phương thức thu tiền', subtitle: 'Chỉ giao dịch thành công của hóa đơn hoàn thành', badge: `${s.SoHoaDon || 0} hóa đơn`, className: 'summary', chart: charts.donut({ items: [{ label: 'Tiền mặt', value: m.TienMat, color: '#25845f' }, { label: 'QR', value: m.QR, color: '#4f73c5' }, { label: 'Thẻ', value: m.The, color: '#7b61b8' }, { label: 'Chuyển khoản', value: m.ChuyenKhoan, color: '#d8a33e' }], centerLabel: 'Đã thu', centerValue: money(Number(m.TienMat || 0) + Number(m.QR || 0) + Number(m.The || 0) + Number(m.ChuyenKhoan || 0)), formatter: money, emptyText: 'Kỳ này bạn chưa có thanh toán thành công.' }) })}
            ${charts.card({ kicker: 'SẢN PHẨM', title: 'Top sản phẩm bán chạy', subtitle: 'Xếp theo doanh thu hóa đơn của bạn', badge: `${topProducts.length} sản phẩm`, className: 'ranking', chart: charts.horizontal({ items: topProducts.map(row => ({ label: row.TenSP, value: row.DoanhThu, display: money(row.DoanhThu) })), formatter: money, emptyText: 'Kỳ này bạn chưa bán sản phẩm nào.' }) })}
          </div>
          <div class="report-bottom-grid">
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CA BÁN HÀNG</p><h2>Doanh thu và đổi trả theo ca</h2></div><span class="report-card-count">${shifts.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>CA</th><th>HÓA ĐƠN</th><th>DOANH THU</th><th>ĐỔI TRẢ / HOÀN</th><th>TRẠNG THÁI</th></tr></thead><tbody>${shifts.length ? shifts.slice(0, 6).map(row => `<tr class="${Number(row.SoDoiTra || 0) ? 'cashier-invoice-has-return' : ''}"><td><strong>${esc(row.MaCa)}</strong><small>${fmtDateTime(row.ThoiGianBatDau)} → ${fmtDateTime(row.ThoiGianKetThuc)}</small></td><td class="num">${row.SoHoaDon || 0}</td><td class="num"><strong>${money(row.DoanhThu)}</strong><small>TM hệ thống ${row.TienMatHeThong == null ? '—' : money(row.TienMatHeThong)}</small></td><td class="num"><strong>${row.SoDoiTra || 0} phiếu</strong><small>Hoàn ${money(row.TienHoan)}</small></td><td><span class="status-pill ${statusClass(row.TrangThai)}">${esc(row.TrangThai)}</span></td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Kỳ này bạn chưa có ca bán hàng.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>GIAO DỊCH GẦN ĐÂY</p><h2>Hóa đơn do bạn lập</h2></div><span class="report-card-count">${recentInvoices.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÓA ĐƠN</th><th>THỜI GIAN</th><th>THANH TOÁN</th><th>GIÁ TRỊ</th></tr></thead><tbody>${recentInvoices.length ? recentInvoices.slice(0, 6).map(row => {
              const returnLabel = Number(row.SoPhieuDangXuLy || 0) ? 'Đang đổi trả'
                : (Number(row.SLBan || 0) > 0 && Number(row.SLDaTra || 0) >= Number(row.SLBan) && Number(row.TienDaHoan || 0) > 0) ? 'Đã hoàn hết'
                : Number(row.SoPhieuDoiHang || 0) && Number(row.TienDaHoan || 0) <= 0 ? 'Đã đổi hàng'
                : Number(row.TienDaHoan || 0) > 0 ? 'Hoàn một phần'
                : Number(row.SoPhieuDoiTra || 0) > 0 ? 'Có đổi trả' : '';
              return `<tr class="${returnLabel ? 'cashier-invoice-has-return' : ''}"><td><strong>${esc(row.MaHD)}</strong><small>${esc(row.TenKhachHang)}</small></td><td>${fmtDateTime(row.NgayLap)}</td><td>${esc(row.PhuongThuc || 'Chưa ghi nhận')}${returnLabel ? `<small><span class="status-pill ${/đang/i.test(returnLabel) ? 'sent' : /hết/i.test(returnLabel) ? 'cancelled' : 'returned'}">${esc(returnLabel)}</span></small>` : ''}</td><td class="num"><strong>${money(row.TongThanhToan)}</strong>${Number(row.TienDaHoan || 0) > 0 ? `<small>Đã hoàn ${money(row.TienDaHoan)}</small>` : ''}</td></tr>`;
            }).join('') : '<tr><td colspan="4" class="warehouse-empty">Kỳ này chưa có hóa đơn.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Việc cần xử lý tại quầy</h2></div></div>${alertList([
              { icon: 'i-report', tone: Number(alerts.HoaDonNhap) ? 'warning' : 'ok', title: `${alerts.HoaDonNhap || 0} hóa đơn đang nháp`, detail: 'Chưa ghi nhận doanh thu và chưa trừ tồn', value: 'Hóa đơn' },
              { icon: 'i-clock', tone: Number(alerts.ThanhToanChoXacNhan) ? 'danger' : 'ok', title: `${alerts.ThanhToanChoXacNhan || 0} thanh toán chờ xác nhận`, detail: 'Không hoàn tất hóa đơn khi chưa thanh toán đủ', value: 'Thanh toán' },
              { icon: 'i-refresh', tone: Number(alerts.DoiTraDangXuLy) ? 'warning' : 'ok', title: `${alerts.DoiTraDangXuLy || 0} yêu cầu đổi trả đang xử lý`, detail: 'Chờ Thủ kho / QL, hoặc xác nhận hoàn sau khi QL duyệt', value: 'Đổi trả' },
              { icon: 'i-cash', tone: Number(alerts.CaChoDoiSoat) ? 'warning' : 'ok', title: `${alerts.CaChoDoiSoat || 0} ca chờ Kế toán đối soát`, detail: 'Tiền mặt bàn giao được lập Phiếu thu', value: 'Đóng ca' }
            ])}</article>
          </div>
          ${doiTraPanel(data.doiTra, { title: 'Đổi trả trên ca của bạn', subtitle: 'Cột Hàng đi đâu ghi rõ nhập lại kho bán (cộng tồn) hoặc loại bỏ/vứt (không cộng, đã trừ lúc bán). Không trừ kho lần nữa.', productTitle: 'Hàng khách trả trên hóa đơn của bạn' })}`;
        window.FLY_REPORT_LAYOUT?.enhance(root.querySelector('#roleReportBody'), { actor: 'Thu ngân', analysisTitle: 'Doanh thu và phương thức thanh toán', detailTitle: 'Ca bán hàng cá nhân' });
        enableReportActions(root);
      } catch (error) {
        context.showToast(error.message, 'error');
        const body = root.querySelector('#roleReportBody');
        if (body) body.innerHTML = failBox(error.message);
      }
      finally { const live = root.querySelector('#loadRoleReport'); if (live) live.disabled = false; }
    };
    root.querySelector('#printRoleReport')?.addEventListener('click', () => {
      if (!currentReport) return;
      const s = currentReport.sales || {}; const methods = currentReport.methods || {}; const shifts = currentReport.shifts || [];
      const netRevenue = Number(s.DoanhThuHoaDon || 0) - Number(s.TienHoan || 0);
      const trend = salesTrend(currentReport.daily || [], currentReport.period);
      window.FLY_PRINT.show({
        variant: 'report', orientation: 'landscape', title: 'BÁO CÁO CA VÀ BÁN HÀNG CÁ NHÂN', number: currentReport.period.period,
        documentDate: new Date(), status: currentReport.period.label,
        fields: [{ label: 'Từ ngày', value: currentReport.period.from }, { label: 'Đến ngày', value: currentReport.period.to }],
        columns: [{ label: 'Mã ca', key: 'MaCa' }, { label: 'Mở ca', key: 'ThoiGianBatDau', format: 'date' }, { label: 'Số HĐ', key: 'SoHoaDon', align: 'right' }, { label: 'Doanh thu', key: 'DoanhThu', format: 'money', align: 'right' }, { label: 'Số đổi trả', key: 'SoDoiTra', align: 'right' }, { label: 'Tiền hoàn', key: 'TienHoan', format: 'money', align: 'right' }, { label: 'Trạng thái', key: 'TrangThai' }],
        rows: shifts,
        summary: [{ label: 'Doanh thu thuần', value: netRevenue, format: 'money' }, { label: 'Hóa đơn hoàn thành', value: s.SoHoaDon }, { label: 'Tiền hoàn', value: s.TienHoan, format: 'money' }, { label: 'Tiền mặt', value: methods.TienMat, format: 'money' }],
        chart: { title: trend.printTitle, rows: trend.rows, labelKey: 'label', series: [{ name: 'Doanh thu hóa đơn', key: 'DoanhThuHoaDon', color: '#b76045' }, { name: 'Doanh thu thuần', key: 'DoanhThuThuan', color: '#4f72bb' }] },
        note: 'Báo cáo chỉ gồm hóa đơn, hoàn tiền và ca của Thu ngân đang đăng nhập; không bao gồm doanh thu của nhân viên khác.',
        signatures: ['Thu ngân lập báo cáo', 'Kế toán đối soát']
      });
    });
    root.querySelector('#exportRoleReportCsv')?.addEventListener('click', () => {
      if (!currentReport) return;
      const s = currentReport.sales || {}; const m = currentReport.methods || {};
      downloadCsv(`bao-cao-thu-ngan-${currentReport.period.period}.csv`, [['BÁO CÁO CA VÀ BÁN HÀNG CÁ NHÂN', currentReport.period.label], ['Hóa đơn', s.SoHoaDon], ['Doanh thu hóa đơn', s.DoanhThuHoaDon], ['Tiền hoàn', s.TienHoan], ['Tiền mặt', m.TienMat], ['QR', m.QR], ['Thẻ', m.The], ['Chuyển khoản', m.ChuyenKhoan], [], ['Mã ca', 'Mở ca', 'Đóng ca', 'Hóa đơn', 'Doanh thu', 'Đổi trả', 'Tiền hoàn', 'Trạng thái'], ...(currentReport.shifts || []).map(row => [row.MaCa, fmtDateTime(row.ThoiGianBatDau), fmtDateTime(row.ThoiGianKetThuc), row.SoHoaDon, row.DoanhThu, row.SoDoiTra, row.TienHoan, row.TrangThai]), ...returnCsvRows(currentReport.doiTra)]);
    });
  };

  const initPurchasingReport = async (root, context) => {
    let currentReport = null;
    root.innerHTML = `${heading('MUA HÀNG / BÁO CÁO', 'Báo cáo đơn mua và giao hàng', 'Theo dõi đơn đã lập, giá trị theo trạng thái, số lượng còn thiếu và Nhà cung cấp trong kỳ.')}${periodCard()}`;
    let loadReport = async () => {};
    const selected = bindPeriod(root, () => { loadReport(); });
    loadReport = async () => {
      const button = root.querySelector('#loadRoleReport');
      if (button) button.disabled = true;
      try {
        const { type, period } = selected();
        const data = await api(context, `/purchasing/reports/buying?periodType=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}${root.dataset.reportLock === '1' ? '&lockPeriod=1' : ''}`);
        window.FLY_REPORT_PERIOD?.syncFromReport(root, data);
        root.dataset.reportLock = '1';
        currentReport = data;
        const s = data.summary || {};
        const byStatus = data.byStatus || [];
        const suppliers = data.suppliers || [];
        const daily = data.daily || [];
        const categories = data.byCategory || [];
        const actionOrders = data.actionOrders || [];
        const visuals = ui();
        const charts = chartUi();
        charts.setActionHandler?.(null);
        const onTimeRate = Number(s.SoDonDaHoanTat || 0) ? Number(s.SoDonDungHan || 0) / Number(s.SoDonDaHoanTat) * 100 : null;
        root.querySelector('#roleReportBody').innerHTML = `${titleBlock(root, data.period, 'Mua hàng')}
          ${visuals.kpiGrid([
            { icon: 'i-cash', label: 'TỔNG GIÁ TRỊ MUA HÀNG', value: money(s.GiaTriDonMua), hint: `${s.SoDonMua || 0} đơn hợp lệ trong kỳ` },
            { icon: 'i-report', label: 'ĐƠN MUA HÀNG', value: String(s.SoDonMua || 0), hint: `${s.SoPhieuNhap || 0} phiếu nhập · ${money(s.GiaTriNhap)}` },
            { icon: 'i-team', label: 'NHÀ CUNG CẤP HỢP TÁC', value: String(s.SoNhaCungCapHopTac || 0), hint: `${s.SoNhaCungCap || 0} NCC có đơn trong kỳ` },
            { icon: 'i-approve', label: 'ĐƠN CHỜ DUYỆT', value: String(s.SoDonChoDuyet || 0), hint: 'Chờ Quản lý cửa hàng quyết định', tone: Number(s.SoDonChoDuyet) ? 'attention' : '' },
            { icon: 'i-truck', label: 'ĐƠN GIAO TRỄ', value: String(s.SoDonTre || 0), hint: `${qty(s.SLConThieu)} đơn vị còn thiếu`, tone: Number(s.SoDonTre) ? 'attention' : '' },
            { icon: 'i-clock', label: 'TỶ LỆ GIAO ĐÚNG HẠN', value: onTimeRate == null ? '—' : percent(onTimeRate), hint: onTimeRate == null ? 'Chưa có đơn giao hoàn tất' : `${s.SoDonDungHan || 0}/${s.SoDonDaHoanTat || 0} đơn hoàn tất` }
          ], 'primary')}
          <div class="fly-dashboard-grid report-chart-trio">
            ${charts.card({ kicker: 'XU HƯỚNG ĐẶT MUA', title: 'Giá trị mua hàng theo ngày', subtitle: 'Không gồm đơn nháp và đơn bị từ chối', badge: money(s.GiaTriDonMua), className: 'executive', chart: charts.line({ labels: daily.map(row => fmtDate(row.Ngay)), series: [{ name: 'Giá trị đơn mua', values: daily.map(row => row.GiaTri), color: '#2c8b66' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có đơn mua hợp lệ.' }) })}
            ${charts.card({ kicker: 'NHÀ CUNG CẤP', title: 'Giá trị mua theo Nhà cung cấp', subtitle: 'So sánh tổng giá trị các đơn hợp lệ', badge: `${suppliers.length} đối tác`, className: 'operations', chart: charts.columns({ labels: suppliers.map(row => row.TenNCC), series: [{ name: 'Giá trị mua', values: suppliers.map(row => row.GiaTri), color: '#2c8b66' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có đơn theo Nhà cung cấp.' }) })}
            ${charts.card({ kicker: 'CƠ CẤU MUA HÀNG', title: 'Giá trị mua theo danh mục', subtitle: 'Phân bổ nhu cầu mua của cửa hàng', badge: `${categories.length} danh mục`, className: 'summary', chart: charts.donut({ items: categories.map((row, index) => ({ label: row.TenDM, value: row.GiaTri, color: charts.palette?.[index % charts.palette.length] })), centerLabel: 'Tổng mua', centerValue: money(s.GiaTriDonMua), formatter: money, emptyText: 'Kỳ này chưa có giá trị mua theo danh mục.' }) })}
          </div>
          <div class="report-bottom-grid">
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>TOP NHÀ CUNG CẤP</p><h2>Đối tác theo giá trị đặt mua</h2></div><span class="report-card-count">${suppliers.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÀ CUNG CẤP</th><th>SỐ ĐƠN</th><th>GIÁ TRỊ</th></tr></thead><tbody>${suppliers.length ? suppliers.slice(0, 6).map(row => `<tr><td>${visuals.person(row.TenNCC, row.MaNCC)}</td><td class="num">${row.SoDon}</td><td class="num"><strong>${money(row.GiaTri)}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Chưa phát sinh đơn mua.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>ĐƠN CẦN XỬ LÝ</p><h2>Phê duyệt và tiến độ giao</h2></div><span class="report-card-count">${actionOrders.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>ĐƠN / NCC</th><th>NGÀY GIAO</th><th>CÒN THIẾU</th><th>ƯU TIÊN</th></tr></thead><tbody>${actionOrders.length ? actionOrders.slice(0, 6).map(row => `<tr><td><strong>${esc(row.MaPO)}</strong><small>${esc(row.TenNCC)}</small></td><td>${fmtDate(row.NgayGiaoDuKien)}</td><td class="num">${qty(row.SLConThieu)}</td><td><span class="status-pill ${statusClass(row.UuTien)}">${esc(row.UuTien)}</span></td></tr>`).join('') : '<tr><td colspan="4" class="warehouse-empty">Không có đơn cần xử lý trong kỳ.</td></tr>'}</tbody></table></div></article>
            <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Ưu tiên mua hàng</h2></div></div>${alertList([
              { icon: 'i-approve', tone: Number(s.SoDonChoDuyet) ? 'warning' : 'ok', title: `${s.SoDonChoDuyet || 0} đơn chờ phê duyệt`, detail: 'Chỉ gửi NCC sau khi Quản lý duyệt', value: 'Phê duyệt' },
              { icon: 'i-truck', tone: Number(s.SoDonTre) ? 'danger' : 'ok', title: `${s.SoDonTre || 0} đơn đã trễ ngày giao`, detail: `${qty(s.SLConThieu)} đơn vị còn thiếu`, value: 'Giao hàng' },
              { icon: 'i-inventory', tone: Number(s.SoDonDangGiao) ? 'warning' : 'ok', title: `${s.SoDonDangGiao || 0} đơn đang theo dõi giao`, detail: 'Cập nhật xác nhận và lịch giao bù', value: 'Tiến độ' },
              { icon: 'i-clock', tone: onTimeRate == null ? '' : onTimeRate < 90 ? 'warning' : 'ok', title: onTimeRate == null ? 'Chưa đủ dữ liệu giao đúng hạn' : `${percent(onTimeRate)} đơn hoàn tất đúng hạn`, detail: 'Chỉ tính đơn đã có Phiếu nhập và hết số lượng thiếu', value: 'Chất lượng' }
            ])}</article>
          </div>
          ${doiTraPanel(data.doiTra, { title: 'Hàng khách trả — tín hiệu chất lượng', subtitle: 'SL loại bỏ/vứt cao trên một SKU thường là lỗi NCC hoặc bảo quản, không phải lỗi lập đơn mua.', productTitle: 'SKU khách trả nhiều' })}
          <details class="report-detail-disclosure"><summary>Xem cơ cấu trạng thái đơn mua</summary><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>TRẠNG THÁI</th><th>SỐ ĐƠN</th><th>GIÁ TRỊ</th></tr></thead><tbody>${byStatus.length ? byStatus.map(row => `<tr><td>${esc(row.TrangThai)}</td><td class="num">${row.SoDon}</td><td class="num">${money(row.GiaTri)}</td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Kỳ này chưa có đơn mua.</td></tr>'}</tbody></table></div></details>`;
        window.FLY_REPORT_LAYOUT?.enhance(root.querySelector('#roleReportBody'), { actor: 'Mua hàng', analysisTitle: 'Giá trị đơn và tiến độ giao hàng', detailTitle: 'Trạng thái đơn và Nhà cung cấp' });
        enableReportActions(root);
      } catch (error) {
        context.showToast(error.message, 'error');
        const body = root.querySelector('#roleReportBody');
        if (body) body.innerHTML = failBox(error.message);
      }
      finally { const live = root.querySelector('#loadRoleReport'); if (live) live.disabled = false; }
    };
    root.querySelector('#printRoleReport')?.addEventListener('click', () => {
      if (!currentReport) return;
      const s = currentReport.summary || {}; const suppliers = currentReport.suppliers || [];
      window.FLY_PRINT.show({
        variant: 'report', title: 'BÁO CÁO ĐƠN MUA VÀ GIAO HÀNG', number: currentReport.period.period,
        documentDate: new Date(), status: currentReport.period.label,
        fields: [{ label: 'Từ ngày', value: currentReport.period.from }, { label: 'Đến ngày', value: currentReport.period.to }],
        columns: [{ label: 'Mã NCC', key: 'MaNCC' }, { label: 'Nhà cung cấp', key: 'TenNCC' }, { label: 'Số đơn', key: 'SoDon', align: 'right' }, { label: 'Giá trị', key: 'GiaTri', format: 'money', align: 'right' }],
        rows: suppliers,
        summary: [{ label: 'Đơn mua hợp lệ', value: s.SoDonMua }, { label: 'Giá trị đơn mua', value: s.GiaTriDonMua, format: 'money' }, { label: 'Phiếu nhập', value: s.SoPhieuNhap }, { label: 'Số lượng còn thiếu', value: s.SLConThieu }],
        chart: { title: 'Giá trị đơn mua theo ngày', rows: currentReport.daily || [], labelKey: 'Ngay', labelFormat: 'date', series: [{ name: 'Giá trị đơn mua', key: 'GiaTri', color: '#73509b' }] },
        note: 'Giá trị xu hướng không bao gồm đơn Nháp và đơn Từ chối. Bảng chi tiết xếp Nhà cung cấp theo tổng giá trị giảm dần.',
        signatures: ['Nhân viên mua hàng', 'Quản lý cửa hàng']
      });
    });
    root.querySelector('#exportRoleReportCsv')?.addEventListener('click', () => {
      if (!currentReport) return;
      const s = currentReport.summary || {};
      downloadCsv(`bao-cao-mua-hang-${currentReport.period.period}.csv`, [['BÁO CÁO ĐƠN MUA VÀ GIAO HÀNG', currentReport.period.label], ['Đơn mua hợp lệ', s.SoDonMua], ['Giá trị đơn mua', s.GiaTriDonMua], ['Phiếu nhập', s.SoPhieuNhap], ['Giá trị nhập', s.GiaTriNhap], ['Số lượng còn thiếu', s.SLConThieu], [], ['Mã NCC', 'Nhà cung cấp', 'Số đơn', 'Giá trị'], ...(currentReport.suppliers || []).map(row => [row.MaNCC, row.TenNCC, row.SoDon, row.GiaTri]), ...returnCsvRows(currentReport.doiTra)]);
    });
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'warehouse-reports') return initWarehouseReport(document.querySelector('.financial-reports'), context);
      if (pageName === 'cashier-reports') return initSalesReport(document.querySelector('.financial-reports'), context);
      if (pageName === 'purchasing-reports') return initPurchasingReport(document.querySelector('.financial-reports'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
