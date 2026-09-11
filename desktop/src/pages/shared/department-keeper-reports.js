(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'admin-department-reports': '<section class="warehouse-page financial-reports report-department-admin"><div class="overview-loading">Đang mở báo cáo bộ phận...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const dept = () => window.FLY_DEPARTMENT_REPORT || {};
  const exp = () => window.FLY_DEPARTMENT_EXPORT || {};
  const api = async (context, path, options = {}) => {
    const response = await fetch(`${context.apiBase}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${context.token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không tải được báo cáo bộ phận.');
    return data;
  };

  const initAdminDepartmentReports = async (root, context) => {
    let current = null;
    let compareRows = [];
    root.innerHTML = `<header class="warehouse-heading"><div>
        <p class="warehouse-kicker">QUẢN LÝ / BÁO CÁO BỘ PHẬN</p>
        <h1>Báo cáo bộ phận đã gửi</h1>
        <p>Xem snapshot Mua hàng, Kế toán và Thu ngân đã nộp. Báo cáo tổng siêu thị vẫn ở <strong>Báo cáo cửa hàng</strong>. Không duyệt — chỉ xem, xuất và phản hồi nếu cần giải trình.</p>
      </div></header>
      <article class="report-admin-banner dept-split-note">
        <strong>Hai menu khác nhau</strong>
        <span>Báo cáo cửa hàng = toàn siêu thị. Báo cáo bộ phận = bản đã khóa lúc gửi. Báo cáo Thủ kho vẫn ở menu riêng.</span>
      </article>
      <section class="dept-admin-toolbar">
        <div class="dept-admin-filters">
          <label><span>Phòng ban</span><select id="deptFilterBoPhan">
            <option value="">Tất cả</option>
            <option value="MuaHang">Mua hàng</option>
            <option value="KeToan">Kế toán</option>
            <option value="ThuNgan">Thu ngân</option>
          </select></label>
          <label><span>Loại</span><select id="deptFilterKind">
            <option value="">Tất cả</option>
            <option value="MH_DON_MUA">Đơn mua</option>
            <option value="KT_NOI_BO">Nội bộ kế toán</option>
            <option value="KT_KQKD">KQKD</option>
            <option value="KT_LCTT">LCTT</option>
            <option value="KT_BCDKT">BCĐKT</option>
            <option value="TN_BAN_HANG">Bán hàng ca</option>
          </select></label>
          <label><span>Kỳ</span><input type="month" id="deptFilterPeriod" data-keep-native></label>
          <label><span>Trạng thái</span><select id="deptFilterStatus">
            <option value="">Đang hiệu lực</option>
            <option value="Đã gửi">Đã gửi</option>
            <option value="Đã xem">Đã xem</option>
            <option value="Cần phản hồi">Cần phản hồi</option>
            <option value="Đã thu hồi">Đã thu hồi</option>
          </select></label>
          <label><span>Người lập</span><input type="search" id="deptFilterAuthor" placeholder="NV003" autocomplete="off"></label>
          <label class="dept-admin-toggle"><input type="checkbox" id="deptIncludeWarehouse"><span>Kèm bản Thủ kho</span></label>
        </div>
        <div class="dept-admin-actions">
          <button type="button" class="warehouse-primary" id="deptFilterApply">Lọc</button>
          <button type="button" class="warehouse-secondary" id="exportRoleReportCsv" disabled>Xuất CSV</button>
          <button type="button" class="warehouse-secondary" id="exportRoleReportExcel" disabled>Xuất Excel</button>
          <button type="button" class="warehouse-secondary" id="printRoleReport" disabled>Xem bản in / PDF</button>
        </div>
      </section>
      <div id="adminDeptTabs"></div>
      <div id="adminDeptList"></div>
      <div id="adminDeptDetail"><div class="welcome-card report-idle report-idle-keeper">
        <span class="report-idle-mark" aria-hidden="true"><svg><use href="#i-report"></use></svg></span>
        <h2>Chưa mở báo cáo</h2>
        <p>Chọn một bản nộp ở danh sách trên để xem snapshot, đối chiếu số hiện tại, xuất file hoặc gửi phản hồi.</p>
      </div></div>`;

    root.querySelector('#printRoleReport')?.addEventListener('click', () => {
      if (!current?.report) return;
      window.FLY_PRINT?.show(dept().buildPrintConfig?.(current.header.LoaiBaoCao, current.report, {
        number: current.header.MaBC,
        preparedBy: current.header.TenNV_Lap,
        issuedAt: current.header.NgayNop,
        note: current.header.GhiChu || ''
      }));
    });
    root.querySelector('#exportRoleReportCsv')?.addEventListener('click', () => {
      if (!current?.report) return;
      exp().downloadCsv?.(current.header.LoaiBaoCao, current.report, { number: current.header.MaBC, preparedBy: current.header.TenNV_Lap });
    });
    root.querySelector('#exportRoleReportExcel')?.addEventListener('click', () => {
      if (!current?.report) return;
      exp().downloadExcel?.(current.header.LoaiBaoCao, current.report, { number: current.header.MaBC, preparedBy: current.header.TenNV_Lap });
    });

    const queryString = () => {
      const params = new URLSearchParams();
      const boPhan = root.querySelector('#deptFilterBoPhan')?.value;
      const kind = root.querySelector('#deptFilterKind')?.value;
      const period = root.querySelector('#deptFilterPeriod')?.value;
      const status = root.querySelector('#deptFilterStatus')?.value;
      const author = root.querySelector('#deptFilterAuthor')?.value.trim();
      if (boPhan) params.set('boPhan', boPhan);
      if (kind) params.set('kind', kind);
      if (period) {
        params.set('periodType', 'month');
        params.set('period', period);
      }
      if (status) params.set('status', status);
      if (status === 'Đã thu hồi') params.set('includeWithdrawn', '1');
      if (author) params.set('maNV', author);
      if (root.querySelector('#deptIncludeWarehouse')?.checked) params.set('includeWarehouse', '1');
      params.set('history', '1');
      return params.toString();
    };

    const renderList = (items, warehouse, activeId) => {
      const host = root.querySelector('#adminDeptList');
      const tabs = root.querySelector('#adminDeptTabs');
      if (tabs) {
        tabs.innerHTML = warehouse?.length
          ? `<article class="dept-wh-ref">
              <div class="report-submit-head"><p>THAM CHIẾU THỦ KHO</p>
                <h3>${warehouse.length} bản gần đây — xem đủ ở menu Báo cáo Thủ kho</h3></div>
              <div class="report-submit-list">${warehouse.slice(0, 6).map(item => `<article class="report-submit-item is-static">
                <div class="report-submit-item-top"><strong>${esc(item.MaBC)}</strong>${dept().statusBadge?.(item.TrangThai || 'Đã gửi') || ''}</div>
                <span class="report-submit-kind">Thủ kho</span>
                <span class="report-submit-period">${esc(item.NhanKy || item.GiaTriKy || '—')}</span>
                <small>${esc(item.TenNV_Lap || '')}</small>
              </article>`).join('')}</div>
            </article>`
          : '';
      }
      if (!host) return;
      host.innerHTML = dept().submittedStrip?.(items, 'admin') || '';
      host.querySelectorAll('[data-department-report]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.departmentReport === activeId);
        button.addEventListener('click', () => openReport(button.dataset.departmentReport));
      });
    };

    const openReport = async (id) => {
      if (!id) return;
      const detail = root.querySelector('#adminDeptDetail');
      detail.innerHTML = '<div class="overview-loading">Đang mở báo cáo bộ phận...</div>';
      try {
        const data = await api(context, `/admin/reports/department-submissions/${encodeURIComponent(id)}`);
        current = data;
        const header = data.header || {};
        const kind = header.LoaiBaoCao;
        compareRows = [];
        try {
          const cmp = await api(context, `/admin/reports/department-submissions/${encodeURIComponent(id)}/compare`);
          compareRows = cmp.rows || [];
        } catch { compareRows = []; }
        const versions = (data.versions || []).filter(item => item.MaBC !== header.MaBC);
        const headerHtml = `${dept().detailHero?.(header, data.report) || ''}
          ${dept().versionLine?.(versions) || ''}
          ${dept().compareTable?.(compareRows) || ''}`;
        const footerHtml = dept().feedbackCard?.(header) || '';
        detail.innerHTML = dept().snapshotHtml?.(kind, data.report || {}, {
          headerHtml,
          footerHtml
        }) || headerHtml + footerHtml;
        const actor = kind === 'MH_DON_MUA' ? 'Mua hàng' : kind === 'TN_BAN_HANG' ? 'Thu ngân' : 'Kế toán';
        window.FLY_REPORT_LAYOUT?.enhance(detail.querySelector('.dept-full-report') || detail, {
          actor,
          analysisTitle: 'Các khối bộ phận đã gửi',
          detailTitle: 'Chi tiết bản nộp'
        });
        root.querySelector('#deptFeedbackForm')?.addEventListener('submit', async event => {
          event.preventDefault();
          const note = event.target.note.value.trim();
          if (!note) return context.showToast?.('Hãy ghi nội dung cần giải trình.', 'error');
          try {
            const out = await api(context, `/admin/reports/department-submissions/${encodeURIComponent(id)}/feedback`, { method: 'POST', body: { note } });
            context.showToast?.(out.message, 'success');
            await openReport(id);
          } catch (error) {
            context.showToast?.(error.message, 'error');
          }
        });
        detail.querySelectorAll('[data-open-version]').forEach(button => {
          button.addEventListener('click', () => openReport(button.dataset.openVersion));
        });
        root.querySelectorAll('#exportRoleReportCsv, #exportRoleReportExcel, #printRoleReport').forEach(button => { button.disabled = false; });
        root.querySelectorAll('[data-department-report]').forEach(button => {
          button.classList.toggle('is-active', button.dataset.departmentReport === id);
        });
      } catch (error) {
        current = null;
        detail.innerHTML = `<div class="welcome-card"><h2>Không mở được báo cáo</h2><p>${esc(error.message)}</p></div>`;
        context.showToast?.(error.message, 'error');
      }
    };

    const reload = async () => {
      try {
        const data = await api(context, `/admin/reports/department-submissions?${queryString()}`);
        const items = data.items || [];
        renderList(items, data.warehouse || [], current?.header?.MaBC);
        const wanted = sessionStorage.getItem('fly_open_department_report') || current?.header?.MaBC || items[0]?.MaBC;
        sessionStorage.removeItem('fly_open_department_report');
        if (wanted && items.some(item => item.MaBC === wanted)) await openReport(wanted);
        else if (!current && items[0]) await openReport(items[0].MaBC);
      } catch (error) {
        root.querySelector('#adminDeptList').innerHTML = `<div class="welcome-card"><h2>Chưa có dữ liệu</h2><p>${esc(error.message)}</p></div>`;
      }
    };

    root.querySelector('#deptFilterApply')?.addEventListener('click', reload);
    root.querySelector('#deptIncludeWarehouse')?.addEventListener('change', reload);
    root.querySelector('#deptFilterAuthor')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); reload(); }
    });
    ['#deptFilterBoPhan', '#deptFilterKind', '#deptFilterPeriod', '#deptFilterStatus'].forEach(sel => {
      root.querySelector(sel)?.addEventListener('change', reload);
    });
    await reload();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'admin-department-reports') {
        return initAdminDepartmentReports(document.querySelector('.report-department-admin') || document.querySelector('.financial-reports'), context);
      }
      return previous?.init?.(pageName, context);
    }
  };
})();
