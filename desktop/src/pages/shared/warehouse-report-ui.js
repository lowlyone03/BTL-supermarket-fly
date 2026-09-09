(() => {
  const PAGE_SIZE = 10;
  const PRINT_WRITEOFF_LIMIT = 40;
  const PRINT_RETURN_LIMIT = 20;
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const qty = value => Number(value || 0).toLocaleString('vi-VN');
  const exp = () => window.FLY_WAREHOUSE_EXPORT || {};
  const periodTypeLabel = type => exp().periodTypeLabel?.(type) || ({ day: 'Ngày', month: 'Tháng', quarter: 'Quý', year: 'Năm' }[type] || 'Kỳ');
  const writeoffKind = row => exp().writeoffKind?.(row) || (String(row?.LoaiXuat || '') === 'Sử dụng nội bộ' ? 'reuse' : row?.MaDT ? 'return' : 'scrap');
  const writeoffKindLabel = kind => exp().writeoffKindLabel?.(kind) || ({ scrap: 'Hủy hàng', reuse: 'Tận dụng NV', return: 'Đổi trả loại bỏ' }[kind] || 'Khác');
  const writeoffSplit = summary => exp().writeoffSplit?.(summary) || { slScrap: 0, gtScrap: 0, slReuse: 0, gtReuse: 0, slReturn: 0, gtReturn: 0, slTotal: 0, gtTotal: 0, tickets: 0, products: 0 };
  const writeoffDoc = row => exp().writeoffDoc?.(row) || [row?.MaPX, row?.MaKK, row?.MaDT].filter(Boolean).join(' · ');
  const fmtDate = value => exp().fmtDate?.(value) || (value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—');
  const fmtDateTime = value => exp().fmtDateTime?.(value) || (value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—');
  const vnYmd = value => exp().vnYmd?.(value) || '';
  const pad2 = value => String(value).padStart(2, '0');
  const addDaysIso = (iso, days) => {
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  };
  const eachDay = (from, to) => {
    const days = [];
    let cursor = from;
    while (cursor <= to) { days.push(cursor); cursor = addDaysIso(cursor, 1); }
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
  const ui = () => window.FLY_UI || { kpiGrid: () => '', person: (name, sub) => `${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}` };
  const chartUi = () => window.FLY_CHARTS || { card: () => '', line: () => '', columns: () => '', donut: () => '', compact: qty, money, palette: ['#25845f', '#d8a33e', '#4f73c5'] };

  const warehouseButtons = (mode = 'keeper') => {
    const send = mode === 'keeper'
      ? '<button class="warehouse-primary" id="submitWarehouseReport" disabled>Gửi báo cáo kho</button>'
      : '';
    return `<button class="warehouse-secondary" id="exportRoleReportCsv" disabled>Xuất CSV</button><button class="warehouse-secondary" id="exportRoleReportExcel" disabled>Xuất Excel</button><button class="warehouse-secondary" id="printRoleReport" disabled>Xem bản in / PDF</button>${send}`;
  };

  const scopeCard = (period = {}, extra = '') => {
    const type = periodTypeLabel(period.periodType);
    return `<article class="report-scope-card">
      <div><p>BÁO CÁO TỔNG KHO · THEO ${esc(type).toUpperCase()}</p>
        <h3>${esc(period.label || 'Chưa chọn kỳ')}</h3>
        <span>${esc(fmtDate(period.from) || period.from || '—')} đến ${esc(fmtDate(period.to) || period.to || '—')}</span>
      </div>
      <p>Đây là báo cáo tổng hợp <strong>cả kho</strong> theo ngày, tháng, quý hoặc năm — không phải danh sách từng phiếu lẻ. Đổi loại kỳ phía trên rồi bấm <strong>Lập báo cáo</strong>. In được bản hệ thống hoặc giấy trắng mực đen; xuất Excel/CSV đủ mục như chứng từ doanh nghiệp.${extra}</p>
    </article>`;
  };

  const kindBadge = kind => `<span class="report-writeoff-kind is-${esc(kind)}">${esc(writeoffKindLabel(kind))}</span>`;

  const writeoffTrend = (lines = [], period = {}) => {
    const type = period.periodType || 'month';
    const grain = (type === 'quarter' || type === 'year') ? 'month' : 'day';
    const emptyBucket = key => ({ key, scrap: 0, reuse: 0, ret: 0, value: 0 });
    let map;
    if (grain === 'month' && period.from && period.to) {
      map = new Map(eachMonth(period.from, period.to).map(key => [key, emptyBucket(key)]));
    } else if (type === 'month' && period.from && period.to) {
      map = new Map(eachDay(period.from, period.to).map(key => [key, emptyBucket(key)]));
    } else {
      map = new Map();
    }
    lines.forEach(row => {
      const day = vnYmd(row.NgayXuat);
      const key = grain === 'month' ? day.slice(0, 7) : day;
      if (!key) return;
      if (!map.has(key)) map.set(key, emptyBucket(key));
      const bucket = map.get(key);
      const sl = Number(row.SoLuong || 0);
      const gt = Number(row.GiaTri || 0);
      const kind = writeoffKind(row);
      if (kind === 'reuse') bucket.reuse += sl;
      else if (kind === 'return') bucket.ret += sl;
      else bucket.scrap += sl;
      bucket.value += gt;
    });
    const buckets = [...map.values()];
    const labels = buckets.map(row => grain === 'month'
      ? `T${Number(row.key.slice(5, 7))}/${row.key.slice(0, 4)}`
      : fmtDate(`${row.key}T00:00:00+07:00`));
    return { grain, labels, rows: buckets.map((row, index) => ({ ...row, label: labels[index] })) };
  };

  const writeoffDayTable = (trend) => {
    const rows = (trend?.rows || []).filter(row => row.scrap || row.reuse || row.ret || row.value);
    if (!rows.length) return '';
    const grain = trend.grain === 'month' ? 'Tháng' : 'Ngày';
    return `<div class="report-writeoff-daytable">
      <p>Chi tiết từng ${grain.toLocaleLowerCase('vi-VN')} có phát sinh</p>
      <table><thead><tr><th>${esc(grain)}</th><th>Hủy</th><th>Tận dụng</th><th>Đổi trả</th><th>Tổng SL</th><th>Giá trị vốn</th></tr></thead>
      <tbody>${rows.map(row => `<tr>
        <td><strong>${esc(row.label)}</strong></td>
        <td class="num">${qty(row.scrap)}</td>
        <td class="num">${qty(row.reuse)}</td>
        <td class="num">${qty(row.ret)}</td>
        <td class="num"><strong>${qty(row.scrap + row.reuse + row.ret)}</strong></td>
        <td class="num">${money(row.value)}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  };

  const writeoffCharts = (data, period) => {
    const charts = chartUi();
    const lines = data?.lines || [];
    const split = writeoffSplit(data?.summary || {});
    const trend = writeoffTrend(lines, period);
    const visible = trend.rows.filter(row => row.scrap || row.reuse || row.ret || row.value);
    const stacked = visible.length > 6;
    const grain = trend.grain === 'month' ? 'tháng' : 'ngày';
    const donutItems = [
      { label: 'Hủy hàng', value: split.gtScrap, color: '#b05b43' },
      { label: 'Tận dụng NV', value: split.gtReuse, color: '#197678' },
      { label: 'Đổi trả loại bỏ', value: split.gtReturn, color: '#8a5a2b' }
    ].filter(item => Number(item.value) > 0);
    const products = (exp().writeoffByProduct?.({ hangRoiKhoBan: data }) || []).slice(0, 8).filter(row => row.value > 0);
    return `<div class="fly-dashboard-grid report-chart-pair report-writeoff-visuals">
      ${charts.card({
        kicker: 'CƠ CẤU GIÁ TRỊ',
        title: 'Hàng đã xuất — không còn bán',
        subtitle: 'Giá vốn của hàng hủy, tận dụng và đổi trả loại bỏ trong kỳ',
        badge: money(split.gtTotal),
        className: 'summary',
        chart: charts.donut({
          items: donutItems,
          centerLabel: 'Giá trị vốn',
          centerValue: money(split.gtTotal),
          formatter: money,
          emptyText: 'Kỳ này chưa có hàng rời kho bán.'
        })
      })}
      ${charts.card({
        kicker: trend.grain === 'month' ? 'THEO THÁNG CÓ PHÁT SINH' : 'THEO NGÀY CÓ PHÁT SINH',
        title: 'Số lượng hàng rời kho bán',
        subtitle: stacked
          ? `Chỉ ${visible.length} ${grain} có hàng — cột chồng để đọc nhiều mốc`
          : `Chỉ ${visible.length || 0} ${grain} có hàng — ba cột cạnh nhau: hủy / tận dụng / đổi trả, có số trên cột`,
        badge: `${qty(split.slTotal)} ĐV`,
        className: 'operations report-writeoff-qtychart',
        chart: charts.columns({
          labels: visible.map(row => row.label),
          series: [
            { name: 'Hủy hàng', values: visible.map(row => row.scrap), color: '#b05b43' },
            { name: 'Tận dụng NV', values: visible.map(row => row.reuse), color: '#197678' },
            { name: 'Đổi trả loại bỏ', values: visible.map(row => row.ret), color: '#8a5a2b' }
          ],
          formatter: qty,
          axisFormatter: charts.compact,
          emptyText: 'Kỳ này chưa phát sinh hàng rời kho bán.',
          stacked,
          hideEmpty: true,
          valueLabels: true,
          emphasizeBars: true,
          alwaysHit: true,
          pointExtras: (label, index) => {
            const row = visible[index];
            if (!row) return null;
            return {
              title: label,
              notes: [
                `Hủy ${qty(row.scrap)} · Tận dụng ${qty(row.reuse)} · Đổi trả ${qty(row.ret)}`,
                `Giá trị vốn ${money(row.value)}`
              ]
            };
          },
          markerNote: stacked
            ? `Mỗi cột là một ${grain} có phát sinh. Đỏ = hủy, xanh = tận dụng NV, nâu = đổi trả loại bỏ. Số trên đỉnh là tổng đơn vị.`
            : `Ba cột của cùng một ${grain}: đỏ hủy, xanh tận dụng NV, nâu đổi trả loại bỏ. Ngày không phát sinh không vẽ.`
        })
      })}
    </div>
    <div class="fly-dashboard-grid report-writeoff-extra">
      ${charts.card({
        kicker: 'CHI TIẾT MẶT HÀNG',
        title: 'Giá trị vốn theo sản phẩm',
        subtitle: 'Các mã chiếm nhiều vốn hàng rời kho bán nhất trong kỳ',
        badge: `${products.length} mã`,
        className: 'summary wide',
        chart: charts.horizontal({
          items: products.map(row => ({
            label: `${row.label}${row.ma ? ` (${row.ma})` : ''}`,
            value: row.value,
            display: `${money(row.value)} · ${qty(row.sl)} ĐV`,
            color: '#1d7656'
          })),
          formatter: money,
          emptyText: 'Kỳ này chưa có mặt hàng rời kho bán.'
        })
      })}
    </div>
    ${writeoffDayTable({ ...trend, rows: visible })}`;
  };

  const writeoffSection = (data, period) => {
    const summary = data?.summary || {};
    const lines = data?.lines || [];
    const split = writeoffSplit(summary);
    return `<section class="report-writeoff-block" id="warehouseWriteoffBlock">
      <div class="report-return-heading"><div><p>HÀNG RỜI KHO BÁN</p><h2>Hàng đã xuất — không còn bán</h2>
        <span>Hàng hủy, tận dụng cho nhân viên và đổi trả loại bỏ. Biểu đồ là cả kỳ; bảng bên dưới lọc và phân trang 10 dòng để xem từng phiếu mà không phải lướt dài.</span></div>
        <b>${lines.length} dòng · ${split.tickets} phiếu</b></div>
      <div class="report-return-kpis report-writeoff-kpis">
        <article><span>HỦY HÀNG</span><strong>${qty(split.slScrap)}</strong><small>${money(split.gtScrap)} · kiểm kê hoặc phiếu hủy</small></article>
        <article><span>TẬN DỤNG NV</span><strong>${qty(split.slReuse)}</strong><small>${money(split.gtReuse)} · sử dụng nội bộ</small></article>
        <article><span>ĐỔI TRẢ LOẠI BỎ</span><strong>${qty(split.slReturn)}</strong><small>${money(split.gtReturn)} · không nhập lại kho bán</small></article>
        <article><span>TỔNG GIÁ TRỊ</span><strong>${money(split.gtTotal)}</strong><small>${qty(split.slTotal)} đơn vị · ${split.tickets} phiếu</small></article>
      </div>
      ${writeoffCharts(data, period)}
      <div class="report-writeoff-tools">
        <div class="report-writeoff-chips" role="tablist" aria-label="Lọc nhóm hàng đã xuất">
          <button type="button" class="is-active" data-writeoff-filter="all">Tất cả <b>${lines.length}</b></button>
          <button type="button" data-writeoff-filter="scrap">Hủy <b>${lines.filter(row => writeoffKind(row) === 'scrap').length}</b></button>
          <button type="button" data-writeoff-filter="reuse">Tận dụng <b>${lines.filter(row => writeoffKind(row) === 'reuse').length}</b></button>
          <button type="button" data-writeoff-filter="return">Đổi trả <b>${lines.filter(row => writeoffKind(row) === 'return').length}</b></button>
        </div>
        <label class="report-writeoff-search"><span>Tìm phiếu / hàng</span><input type="search" id="writeoffSearch" placeholder="Mã SP, tên hàng, PX, KK, DT..." autocomplete="off"></label>
      </div>
      <article class="warehouse-table-card report-writeoff-lines">
        <div class="warehouse-table-wrap"><table class="warehouse-table">
          <thead><tr><th>SẢN PHẨM</th><th>SL</th><th>ĐƠN GIÁ VỐN</th><th>THÀNH TIỀN</th><th>NHÓM</th><th>CHỨNG TỪ</th><th>NGÀY</th><th>ẢNH HƯỞNG TỒN</th></tr></thead>
          <tbody id="writeoffTableBody"></tbody>
        </table></div>
        <div class="report-writeoff-pager" id="writeoffPager"></div>
      </article>
    </section>`;
  };

  const docCell = row => {
    const main = row.MaPX
      ? `<button type="button" class="report-writeoff-doc" data-nav="warehouse-stock-issues" data-id="${esc(row.MaPX)}">${esc(row.MaPX)}</button>`
      : '<span>Chưa có phiếu xuất</span>';
    const extras = [];
    if (row.MaKK) extras.push(`<button type="button" class="report-writeoff-doc" data-open="count" data-id="${esc(row.MaKK)}">${esc(row.MaKK)}</button>`);
    if (row.MaDT) extras.push(`<button type="button" class="report-writeoff-doc" data-open="return" data-id="${esc(row.MaDT)}">${esc(row.MaDT)}</button>`);
    return `<strong>${main}</strong>${extras.length ? `<small>${extras.join(' · ')}</small>` : ''}`;
  };

  const lineRowHtml = row => {
    const kind = writeoffKind(row);
    return `<tr data-writeoff-kind="${esc(kind)}">
      <td><strong>${esc(row.TenSP)}</strong><small>${esc(row.MaSP)}${row.DonViTinh ? ` · ${esc(row.DonViTinh)}` : ''}</small></td>
      <td class="num">${qty(row.SoLuong)}</td>
      <td class="num">${money(row.DonGia)}</td>
      <td class="num"><strong>${money(row.GiaTri)}</strong></td>
      <td>${kindBadge(kind)}<small>${esc(row.Nguon || row.PhanLoai || '')}</small></td>
      <td class="report-writeoff-docs">${docCell(row)}</td>
      <td>${esc(fmtDate(row.NgayXuat) || '—')}</td>
      <td class="report-writeoff-stock">${esc(row.AnhHuongTon || '—')}</td>
    </tr>`;
  };

  const bindWriteoffDocs = (root, context) => {
    root.querySelectorAll('.report-writeoff-doc').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        const id = button.dataset.id;
        const open = button.dataset.open;
        const nav = button.dataset.nav;
        if (!id) return;
        if (open === 'count' && window.FLY_WAREHOUSE?.openCount) {
          window.FLY_WAREHOUSE.openCount(context, id, () => {});
          return;
        }
        if (open === 'return' && window.FLY_WAREHOUSE?.openReturn) {
          window.FLY_WAREHOUSE.openReturn(context, id, () => {}, 'view');
          return;
        }
        if (nav === 'warehouse-stock-issues') {
          sessionStorage.setItem('fly_open_stock_issue', id);
          context.navigate?.(nav);
        }
      });
    });
  };

  const bindWriteoffWorkbench = (root, lines = [], context) => {
    const body = root.querySelector('#writeoffTableBody');
    const pager = root.querySelector('#writeoffPager');
    if (!body) return;
    let filter = 'all';
    let query = '';
    let page = 1;
    const normalized = value => String(value || '').toLocaleLowerCase('vi-VN');
    const filtered = () => lines.filter(row => {
      if (filter !== 'all' && writeoffKind(row) !== filter) return false;
      if (!query) return true;
      const hay = normalized([row.TenSP, row.MaSP, row.MaPX, row.MaKK, row.MaDT, row.PhanLoai, row.Nguon].join(' '));
      return hay.includes(query);
    });
    const render = () => {
      const list = filtered();
      const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (page > pages) page = pages;
      const start = (page - 1) * PAGE_SIZE;
      const slice = list.slice(start, start + PAGE_SIZE);
      body.innerHTML = slice.length
        ? slice.map(lineRowHtml).join('')
        : `<tr><td colspan="8" class="warehouse-empty">${lines.length ? 'Không có dòng khớp bộ lọc. Xóa tìm kiếm hoặc chọn lại nhóm.' : 'Kỳ này chưa có hàng hủy, tận dụng hoặc đổi trả loại bỏ.'}</td></tr>`;
      const from = list.length ? start + 1 : 0;
      const to = Math.min(start + PAGE_SIZE, list.length);
      const pageButtons = [];
      const pushPage = index => pageButtons.push(`<button type="button" class="${index === page ? 'is-active' : ''}" data-writeoff-page="${index}">${index}</button>`);
      if (pages <= 7) {
        for (let i = 1; i <= pages; i += 1) pushPage(i);
      } else {
        pushPage(1);
        const fromPage = Math.max(2, page - 1);
        const toPage = Math.min(pages - 1, page + 1);
        if (fromPage > 2) pageButtons.push('<span>…</span>');
        for (let i = fromPage; i <= toPage; i += 1) pushPage(i);
        if (toPage < pages - 1) pageButtons.push('<span>…</span>');
        pushPage(pages);
      }
      pager.innerHTML = `<div class="report-writeoff-range">Hiển thị <strong>${from}–${to}</strong> / ${list.length} dòng${list.length !== lines.length ? ` (lọc từ ${lines.length})` : ''} · ${PAGE_SIZE} dòng/trang</div>
        <div class="report-writeoff-pages">
          <button type="button" data-writeoff-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Trước</button>
          ${pageButtons.join('')}
          <button type="button" data-writeoff-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Sau</button>
        </div>`;
      bindWriteoffDocs(body, context);
    };
    root.querySelectorAll('[data-writeoff-filter]').forEach(button => {
      button.addEventListener('click', () => {
        filter = button.dataset.writeoffFilter;
        page = 1;
        root.querySelectorAll('[data-writeoff-filter]').forEach(item => item.classList.toggle('is-active', item === button));
        render();
      });
    });
    root.querySelector('#writeoffSearch')?.addEventListener('input', event => {
      query = normalized(event.target.value.trim());
      page = 1;
      render();
    });
    pager?.addEventListener('click', event => {
      const button = event.target.closest('[data-writeoff-page]');
      if (!button || button.disabled) return;
      const next = Number(button.dataset.writeoffPage);
      if (!Number.isFinite(next) || next < 1) return;
      page = next;
      render();
    });
    render();
  };

  const periodLabelOf = item => exp().formatPeriodLabel?.(item.LoaiKy, item.GiaTriKy, item.NhanKy)
    || item.NhanKy || item.GiaTriKy || '—';

  const submittedStrip = (items = [], mode = 'keeper') => {
    if (!items.length) {
      return `<article class="report-submit-strip is-empty"><p>${mode === 'admin'
        ? 'Chưa có báo cáo Thủ kho nào được gửi.'
        : 'Bạn chưa gửi kỳ nào cho Quản lý. Chỉ khi bấm <strong>Gửi báo cáo kho</strong> thì mới có dòng ở đây — hệ thống không tự gửi hộ.'}</p></article>`;
    }
    const tag = mode === 'admin' ? 'button' : 'article';
    const type = mode === 'admin' ? ' type="button"' : '';
    return `<article class="report-submit-strip">
      <div class="report-submit-head"><p>${mode === 'admin' ? 'BÁO CÁO THỦ KHO ĐÃ NHẬN' : 'KỲ ĐÃ GỬI CHO QUẢN LÝ'}</p>
        <h3>${mode === 'admin' ? 'Chọn một kỳ để xem bản Thủ kho đã nộp' : 'Mỗi dòng là một lần bạn đã bấm Gửi báo cáo kho'}</h3>
        ${mode === 'keeper' ? '<span class="report-submit-help">Quản lý xem ở menu <strong>Báo cáo Thủ kho</strong> — không phải Báo cáo cửa hàng. Gửi lại cùng kỳ sẽ thay bản cũ. Gửi nhầm thì bấm <strong>Thu hồi</strong>.</span>' : ''}
      </div>
      <div class="report-submit-list">${items.slice(0, 8).map(item => `<${tag}${type} class="report-submit-item" data-warehouse-report="${esc(item.MaBC)}">
        <strong>${esc(item.MaBC)}</strong><span>${esc(periodLabelOf(item))}</span>
        <small>${esc(item.TenNV_Lap || '')} · ${esc(fmtDateTime(item.NgayNop))} · ${esc(item.TrangThai || 'Đã gửi')}</small>
        ${mode === 'keeper' ? `<button type="button" class="report-submit-withdraw" data-withdraw-report="${esc(item.MaBC)}">Thu hồi bản này</button>` : ''}
      </${tag}>`).join('')}</div>
    </article>`;
  };

  const bindSubmittedStrip = (host, { onWithdraw } = {}) => {
    if (!host || typeof onWithdraw !== 'function') return;
    host.querySelectorAll('[data-withdraw-report]').forEach(button => {
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.withdrawReport;
        if (!id) return;
        if (!window.confirm(`Thu hồi ${id}? Quản lý sẽ không còn thấy bản này. Bạn có thể lập và gửi lại sau.`)) return;
        button.disabled = true;
        try {
          await onWithdraw(id);
        } catch (error) {
          button.disabled = false;
          window.alert(error.message || 'Không thu hồi được báo cáo.');
        }
      });
    });
  };

  const movementTrend = (daily = [], period = {}) => {
    const type = period.periodType || 'month';
    if (type === 'quarter' || type === 'year') {
      const rows = printMovementRows({ period, daily });
      return {
        grain: 'tháng',
        labels: rows.map(row => row.label),
        nhap: rows.map(row => row.SoLuongNhap),
        xuat: rows.map(row => row.SoLuongXuat),
        ton: rows.map(row => row.TonCuoiNgay),
        rows
      };
    }
    return {
      grain: 'ngày',
      labels: daily.map(row => fmtDate(row.Ngay)),
      nhap: daily.map(row => row.SoLuongNhap),
      xuat: daily.map(row => row.SoLuongXuat),
      ton: daily.map(row => row.TonCuoiNgay),
      rows: daily
    };
  };

  const printMovementRows = (report) => {
    const type = report.period?.periodType;
    const daily = report.daily || [];
    if ((type === 'quarter' || type === 'year') && daily.length) {
      const map = new Map();
      daily.forEach(row => {
        const key = vnYmd(row.Ngay).slice(0, 7);
        if (!map.has(key)) map.set(key, { Ngay: `${key}-01`, label: `Tháng ${key.slice(5, 7)}/${key.slice(0, 4)}`, SoLuongNhap: 0, SoLuongXuat: 0, DieuChinhRong: 0, TonCuoiNgay: 0, SoChungTuNhap: 0, SoChungTuXuat: 0 });
        const bucket = map.get(key);
        bucket.SoLuongNhap += Number(row.SoLuongNhap || 0);
        bucket.SoLuongXuat += Number(row.SoLuongXuat || 0);
        bucket.DieuChinhRong += Number(row.DieuChinhRong || 0);
        bucket.SoChungTuNhap += Number(row.SoChungTuNhap || 0);
        bucket.SoChungTuXuat += Number(row.SoChungTuXuat || 0);
        bucket.TonCuoiNgay = Number(row.TonCuoiNgay || 0);
      });
      return [...map.values()];
    }
    return daily;
  };

  const buildPrintConfig = (report, meta = {}) => {
    const period = report.period || {};
    const m = report.movement || {};
    const stock = report.stock || {};
    const writeoff = report.hangRoiKhoBan || {};
    const split = writeoffSplit(writeoff.summary || {});
    const lines = writeoff.lines || [];
    const printedLines = lines.slice(0, PRINT_WRITEOFF_LIMIT);
    const movementRows = printMovementRows(report);
    const grain = period.periodType === 'quarter' || period.periodType === 'year' ? 'tháng' : 'ngày';
    const number = exp().reportNumber?.(report, meta) || meta.number || period.period;
    return {
      variant: 'report',
      orientation: 'landscape',
      title: 'BÁO CÁO TỔNG HỢP KHO',
      number,
      documentDate: meta.issuedAt || new Date(),
      status: `${periodTypeLabel(period.periodType)} · ${period.label || period.period || ''}`.trim(),
      fields: [
        { label: 'Loại kỳ', value: periodTypeLabel(period.periodType) },
        { label: 'Kỳ báo cáo', value: period.label || period.period || '—' },
        { label: 'Từ ngày', value: period.from },
        { label: 'Đến ngày', value: period.to },
        { label: 'Người lập', value: meta.preparedBy || 'Thủ kho' },
        { label: 'Phân loại', value: 'Báo cáo Thủ kho (nội bộ)' }
      ],
      columns: [
        { label: period.periodType === 'quarter' || period.periodType === 'year' ? 'Tháng' : 'Ngày', value: row => row.label || fmtDate(row.Ngay) },
        { label: 'Nhập', key: 'SoLuongNhap', align: 'right' },
        { label: 'Xuất', key: 'SoLuongXuat', align: 'right' },
        { label: 'Điều chỉnh', key: 'DieuChinhRong', align: 'right' },
        { label: 'Tồn cuối', key: 'TonCuoiNgay', align: 'right' },
        { label: 'CT nhập', key: 'SoChungTuNhap', align: 'right' },
        { label: 'CT xuất', key: 'SoChungTuXuat', align: 'right' }
      ],
      rows: movementRows,
      summary: [
        { label: 'Tồn đầu kỳ', value: m.SoLuongDauKy, hint: 'Đơn vị hàng' },
        { label: 'Nhập trong kỳ', value: m.SoLuongNhap, hint: `${qty(m.SoLuongXuat)} xuất` },
        { label: 'Tồn cuối kỳ', value: m.SoLuongCuoiKy, hint: 'Đơn vị hàng' },
        { label: 'Giá trị tồn', value: stock.GiaTriTon, format: 'money', hint: `${qty(stock.TongTon)} đang tồn` }
      ],
      extraSummaryTitle: 'Hàng đã xuất — không còn bán',
      extraSummary: [
        { label: 'Hủy hàng', value: split.gtScrap, format: 'money', hint: `${split.slScrap} đơn vị` },
        { label: 'Tận dụng NV', value: split.gtReuse, format: 'money', hint: `${split.slReuse} đơn vị` },
        { label: 'Đổi trả loại bỏ', value: split.gtReturn, format: 'money', hint: `${split.slReturn} đơn vị` },
        { label: 'Tổng giá trị', value: split.gtTotal, format: 'money', hint: `${split.slTotal} đơn vị · ${split.tickets} phiếu` }
      ],
      extraTables: [
        {
          title: lines.length > PRINT_WRITEOFF_LIMIT
            ? `Chi tiết hàng đã xuất không còn bán (${printedLines.length}/${lines.length} dòng — đủ dòng xem Excel/CSV)`
            : 'Chi tiết hàng đã xuất không còn bán',
          emptyText: 'Kỳ này chưa có hàng hủy, tận dụng hoặc đổi trả loại bỏ.',
          columns: [
            { label: 'Sản phẩm', value: row => `${row.TenSP || ''} (${row.MaSP || ''})` },
            { label: 'SL', key: 'SoLuong', align: 'right' },
            { label: 'Đơn giá vốn', key: 'DonGia', format: 'money', align: 'right' },
            { label: 'Thành tiền', key: 'GiaTri', format: 'money', align: 'right' },
            { label: 'Nhóm', value: row => writeoffKindLabel(writeoffKind(row)) },
            { label: 'Chứng từ', value: writeoffDoc },
            { label: 'Ngày', key: 'NgayXuat', format: 'date' },
            { label: 'Ảnh hưởng tồn', key: 'AnhHuongTon' }
          ],
          rows: printedLines
        },
        {
          title: 'Tồn thấp — ưu tiên bổ sung',
          emptyText: 'Không có mặt hàng dưới tồn tối thiểu.',
          columns: [
            { label: 'Mã SP', key: 'MaSP' },
            { label: 'Sản phẩm', key: 'TenSP' },
            { label: 'ĐVT', key: 'DonViTinh' },
            { label: 'Tồn', key: 'SLTon', align: 'right' },
            { label: 'Tối thiểu', key: 'TonKhoToiThieu', align: 'right' },
            { label: 'Thiếu', value: row => Math.max(0, Number(row.TonKhoToiThieu) - Number(row.SLTon)), align: 'right' }
          ],
          rows: report.lowStock || []
        },
        {
          title: (report.doiTra?.tickets || []).length > PRINT_RETURN_LIMIT
            ? `Đổi trả trong kỳ (${PRINT_RETURN_LIMIT}/${(report.doiTra?.tickets || []).length} phiếu — đủ phiếu xem Excel)`
            : 'Đổi trả trong kỳ',
          emptyText: 'Kỳ này chưa có phiếu đổi trả.',
          columns: [
            { label: 'Phiếu', key: 'MaDT' },
            { label: 'Hóa đơn', key: 'MaHD' },
            { label: 'Hình thức', key: 'HinhThucXuLy' },
            { label: 'Tiền hoàn', key: 'SoTienHoan', format: 'money', align: 'right' },
            { label: 'Trách nhiệm', key: 'BuocCanXuLy' },
            { label: 'Hàng đi đâu', value: row => exp().hangDiDauText?.(row) || row.HangDiDau || '—' }
          ],
          rows: (report.doiTra?.tickets || []).slice(0, PRINT_RETURN_LIMIT)
        }
      ],
      chart: {
        title: `Nhập – xuất – điều chỉnh theo ${grain}`,
        rows: movementRows,
        labelKey: 'Ngay',
        labelFormat: movementRows[0]?.label ? undefined : 'date',
        label: row => row.label || undefined,
        series: [
          { name: 'Nhập', key: 'SoLuongNhap', color: '#267b5b' },
          { name: 'Xuất', key: 'SoLuongXuat', color: '#d89f32' },
          { name: 'Điều chỉnh', value: row => Math.abs(Number(row.DieuChinhRong || 0)), color: '#4f72bb' }
        ]
      },
      note: 'Báo cáo Thủ kho tổng hợp cả kho theo kỳ đã chọn. Hàng đã xuất không còn bán gồm hủy, tận dụng nhân viên và đổi trả loại bỏ; phiếu thông tin không trừ trùng tồn. Chi tiết đầy đủ từng dòng in trên Excel/CSV. Bản hệ thống dùng lưu hồ sơ phần mềm; bản giấy trắng mực đen dùng nộp ký.',
      signatures: ['Thủ kho lập báo cáo', 'Quản lý cửa hàng']
    };
  };

  const exportMeta = (report, context, extra = {}) => ({
    number: extra.number || exp().reportNumber?.(report, extra),
    preparedBy: extra.preparedBy || context?.user?.TenNV || 'Thủ kho',
    staffId: extra.staffId || context?.user?.MaNV || '',
    issuedAt: extra.issuedAt || new Date(),
    status: extra.status || 'Bản làm việc',
    note: extra.note || ''
  });

  const openSubmitModal = ({ periodLabel, replacedHint, onSubmit }) => {
    const old = document.querySelector('.report-submit-backdrop');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop report-submit-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal report-submit-modal" role="dialog" aria-modal="true" aria-labelledby="whSubmitTitle">
      <div class="warehouse-modal-heading"><div><p class="warehouse-kicker">GỬI BÁO CÁO THỦ KHO</p><h2 id="whSubmitTitle">Gửi ${esc(periodLabel)} cho Quản lý</h2></div>
        <button class="warehouse-icon-button close" type="button" aria-label="Đóng">×</button></div>
      <div class="warehouse-modal-body">
        <p>Quản lý xem bản này ở menu <strong>Báo cáo Thủ kho</strong>. Menu <strong>Báo cáo cửa hàng</strong> vẫn là báo cáo tổng cả siêu thị — hai việc tách nhau.</p>
        ${replacedHint ? `<p class="report-submit-warn">${esc(replacedHint)}</p>` : ''}
        <label><span>Ghi chú gửi kèm (không bắt buộc)</span><textarea id="whSubmitNote" rows="3" maxlength="300" placeholder="Ví dụ: đã xuất hết hàng hủy kiểm kê ngày 08/09."></textarea></label>
      </div>
      <div class="warehouse-modal-actions">
        <button type="button" class="warehouse-secondary close">Hủy</button>
        <button type="button" class="warehouse-primary" id="whSubmitConfirm">Gửi báo cáo</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('#whSubmitConfirm').addEventListener('click', async () => {
      const button = overlay.querySelector('#whSubmitConfirm');
      button.disabled = true;
      try {
        await onSubmit(overlay.querySelector('#whSubmitNote').value.trim());
        close();
      } catch (error) {
        button.disabled = false;
        window.alert(error.message || 'Không gửi được báo cáo.');
      }
    });
  };

  const bindWarehouseReportActions = (root, { getReport, context, mode = 'keeper', getMeta, onSubmitted } = {}) => {
    const enable = () => root.querySelectorAll('#exportRoleReportCsv, #exportRoleReportExcel, #printRoleReport, #submitWarehouseReport').forEach(button => { button.disabled = false; });
    const metaOf = (report, extra) => (typeof getMeta === 'function' ? { ...exportMeta(report, context, extra), ...getMeta(report) } : exportMeta(report, context, extra));
    root.querySelector('#printRoleReport')?.addEventListener('click', () => {
      const report = getReport?.();
      if (!report) return;
      window.FLY_PRINT?.show(buildPrintConfig(report, metaOf(report)));
    });
    root.querySelector('#exportRoleReportCsv')?.addEventListener('click', () => {
      const report = getReport?.();
      if (!report) return;
      exp().downloadCsv?.(report, metaOf(report));
    });
    root.querySelector('#exportRoleReportExcel')?.addEventListener('click', () => {
      const report = getReport?.();
      if (!report) return;
      exp().downloadExcel?.(report, metaOf(report));
    });
    root.querySelector('#submitWarehouseReport')?.addEventListener('click', () => {
      if (mode !== 'keeper') return;
      const report = getReport?.();
      if (!report?.period) return;
      openSubmitModal({
        periodLabel: report.period.label || report.period.period,
        replacedHint: 'Nếu kỳ này đã gửi rồi, hệ thống sẽ ghi đè bản cũ bằng số liệu vừa lập.',
        onSubmit: async note => {
          const response = await fetch(`${context.apiBase}/warehouse/reports/submit`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ report, note })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Không gửi được báo cáo kho.');
          context.showToast?.(data.message, 'success');
          onSubmitted?.(data);
        }
      });
    });
    return { enable };
  };

  const snapshotHtml = (report, header = {}) => {
    const visuals = ui();
    const m = report.movement || {};
    const stock = report.stock || {};
    const docs = report.documents || {};
    const period = report.period || {};
    const writeoff = report.hangRoiKhoBan || {};
    const split = writeoffSplit(writeoff.summary || {});
    const lowStock = report.lowStock || [];
    const recentDocuments = report.recentDocuments || [];
    const returns = report.doiTra || {};
    const tickets = returns.tickets || [];
    return `${scopeCard(period, header.scopeExtra || ' Đây là bản Thủ kho đã nộp, không phải báo cáo tổng cửa hàng.')}
      ${header.banner || ''}
      ${visuals.kpiGrid([
        { icon: 'i-cash', label: 'GIÁ TRỊ TỒN KHO', value: money(stock.GiaTriTon), hint: `${qty(stock.TongTon)} đơn vị đang tồn` },
        { icon: 'i-truck', label: 'NHẬP / XUẤT TRONG KỲ', value: `${qty(m.SoLuongNhap)} / ${qty(m.SoLuongXuat)}`, hint: `Tồn đầu ${qty(m.SoLuongDauKy)} · cuối ${qty(m.SoLuongCuoiKy)}` },
        { icon: 'i-warning', label: 'DƯỚI TỒN TỐI THIỂU', value: `${stock.TonThap || 0} mặt hàng`, hint: `${stock.HetHang || 0} mặt hàng đã hết`, tone: Number(stock.TonThap) ? 'attention' : '' },
        { icon: 'i-inventory', label: 'HÀNG RỜI KHO BÁN', value: money(split.gtTotal), hint: `${qty(split.slTotal)} đơn vị · ${split.tickets} phiếu` },
        { icon: 'i-approve', label: 'ĐỢT KIỂM KÊ', value: String(docs.SoKiemKe || 0), hint: `${docs.ChoDuyetKiemKe || 0} đợt chờ duyệt` },
        { icon: 'i-refresh', label: 'ĐỔI TRẢ TRONG KỲ', value: String(returns.summary?.SoPhieu || tickets.length || 0), hint: `${returns.summary?.KhongNhapLai || 0} phiếu loại bỏ` }
      ], 'primary')}
      ${writeoffSection(writeoff, period)}
      <div class="report-bottom-grid">
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>ƯU TIÊN BỔ SUNG</p><h2>Sản phẩm dưới tồn tối thiểu</h2></div><span class="report-card-count">${stock.TonThap || 0}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>TỒN</th><th>THIẾU</th></tr></thead><tbody>${lowStock.length ? lowStock.slice(0, 8).map(row => `<tr><td>${visuals.person(row.TenSP, `${row.MaSP} · ${row.DonViTinh || ''}`)}</td><td class="num">${qty(row.SLTon)}</td><td class="num"><strong>${qty(Math.max(0, Number(row.TonKhoToiThieu) - Number(row.SLTon)))}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Không có mặt hàng dưới tồn tối thiểu.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CHỨNG TỪ</p><h2>Phiếu nhập, xuất và kiểm kê</h2></div><span class="report-card-count">${recentDocuments.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>CHỨNG TỪ</th><th>NGÀY</th><th>TRẠNG THÁI</th></tr></thead><tbody>${recentDocuments.length ? recentDocuments.slice(0, 8).map(row => `<tr><td><strong>${esc(row.MaChungTu)}</strong><small>${esc(row.LoaiChungTu)} · ${esc(row.NguoiLap || '')}</small></td><td>${esc(fmtDateTime(row.NgayChungTu))}</td><td>${esc(row.TrangThai || '—')}</td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Kỳ này chưa có chứng từ kho.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>ĐỔI TRẢ</p><h2>Phiếu trong kỳ</h2></div><span class="report-card-count">${tickets.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU</th><th>HÌNH THỨC</th><th>TIỀN HOÀN</th></tr></thead><tbody>${tickets.length ? tickets.slice(0, 8).map(row => `<tr><td><strong>${esc(row.MaDT)}</strong><small>${esc(row.BuocCanXuLy || row.TrangThai || '')}</small></td><td>${esc(row.HinhThucXuLy || '—')}</td><td class="num">${money(row.SoTienHoan)}</td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Kỳ này chưa có phiếu đổi trả.</td></tr>'}</tbody></table></div></article>
      </div>`;
  };

  const mountSnapshot = (root, report, context, header = {}) => {
    if (!root) return;
    root.innerHTML = snapshotHtml(report, header);
    bindWriteoffWorkbench(root.querySelector('#warehouseWriteoffBlock') || root, report.hangRoiKhoBan?.lines || [], context);
    window.FLY_REPORT_LAYOUT?.enhance(root, { actor: 'Thủ kho', analysisTitle: 'Báo cáo Thủ kho đã nộp', detailTitle: 'Chi tiết kho' });
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
      context.navigate?.(action.nav);
    });
  };

  window.FLY_WAREHOUSE_REPORT = {
    PAGE_SIZE,
    warehouseButtons,
    scopeCard,
    writeoffSection,
    bindWriteoffWorkbench,
    bindWriteoffDocs,
    submittedStrip,
    bindSubmittedStrip,
    buildPrintConfig,
    exportMeta,
    bindWarehouseReportActions,
    bindWarehouseChartActions,
    snapshotHtml,
    mountSnapshot,
    movementTrend,
    periodTypeLabel,
    writeoffKind,
    writeoffSplit,
    ui,
    chartUi
  };
})();
