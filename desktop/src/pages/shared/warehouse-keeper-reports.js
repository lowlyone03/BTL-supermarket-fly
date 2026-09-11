(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'admin-warehouse-reports': '<section class="warehouse-page financial-reports report-warehouse report-warehouse-admin"><div class="overview-loading">Đang mở báo cáo Thủ kho...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const wh = () => window.FLY_WAREHOUSE_REPORT || {};
  const exp = () => window.FLY_WAREHOUSE_EXPORT || {};
  const api = async (context, path) => {
    const response = await fetch(`${context.apiBase}${path}`, { headers: { Authorization: `Bearer ${context.token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không tải được báo cáo Thủ kho.');
    return data;
  };

  const initAdminWarehouseReports = async (root, context) => {
    let current = null;
    root.innerHTML = `<header class="warehouse-heading"><div>
        <p class="warehouse-kicker">QUẢN LÝ / BÁO CÁO THỦ KHO</p>
        <h1>Báo cáo Thủ kho đã gửi</h1>
        <p>Xem bản Thủ kho đã nộp theo ngày, tháng, quý hoặc năm. Báo cáo tổng siêu thị vẫn ở <strong>Báo cáo cửa hàng</strong>.</p>
      </div></header>
      <article class="report-admin-banner dept-split-note">
        <strong>Hai menu khác nhau</strong>
        <span>Báo cáo cửa hàng = toàn siêu thị. Báo cáo Thủ kho = nhập–xuất–tồn, hàng rời kho bán, tồn thấp và đổi trả do Thủ kho gửi lên.</span>
      </article>
      <section class="dept-admin-toolbar">
        <div class="dept-admin-actions">
          ${wh().warehouseButtons?.('admin') || '<button class="warehouse-secondary" id="exportRoleReportCsv" disabled>Xuất CSV</button><button class="warehouse-secondary" id="exportRoleReportExcel" disabled>Xuất Excel</button><button class="warehouse-secondary" id="printRoleReport" disabled>Xem bản in / PDF</button>'}
        </div>
      </section>
      <div id="adminWarehouseList"></div>
      <div id="adminWarehouseDetail"><div class="welcome-card report-idle report-idle-keeper">
        <span class="report-idle-mark" aria-hidden="true"><svg><use href="#i-report"></use></svg></span>
        <h2>Chưa mở báo cáo</h2>
        <p>Chọn một kỳ Thủ kho đã gửi để xem snapshot, in hoặc xuất Excel/CSV.</p>
      </div></div>`;

    const actions = wh().bindWarehouseReportActions?.(root, {
      getReport: () => current?.report,
      context,
      mode: 'admin',
      getMeta: report => ({
        number: current?.header?.MaBC,
        preparedBy: current?.header?.TenNV_Lap,
        staffId: current?.header?.MaNV_Lap,
        issuedAt: current?.header?.NgayNop,
        status: current?.header?.TrangThai || 'Đã gửi',
        note: current?.header?.GhiChu || ''
      })
    });

    const renderList = (items, activeId) => {
      const host = root.querySelector('#adminWarehouseList');
      if (!host) return;
      host.innerHTML = wh().submittedStrip?.(items, 'admin') || '';
      host.querySelectorAll('[data-warehouse-report]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.warehouseReport === activeId);
        button.addEventListener('click', () => openReport(button.dataset.warehouseReport));
      });
    };

    const openReport = async (id) => {
      if (!id) return;
      const detail = root.querySelector('#adminWarehouseDetail');
      detail.innerHTML = '<div class="overview-loading">Đang mở báo cáo Thủ kho...</div>';
      try {
        const data = await api(context, `/admin/reports/warehouse-submissions/${encodeURIComponent(id)}`);
        current = data;
        const header = data.header || {};
        const banner = `<article class="report-admin-meta">
          <div><p>SỐ BÁO CÁO</p><strong>${esc(header.MaBC)}</strong><small>${esc(header.TrangThai || 'Đã gửi')}</small></div>
          <div><p>NGƯỜI LẬP</p><strong>${esc(header.TenNV_Lap || 'Thủ kho')}</strong><small>${esc(header.MaNV_Lap || '')}</small></div>
          <div><p>NGÀY NỘP</p><strong>${esc(exp().fmtDateTime?.(header.NgayNop) || header.NgayNop || '—')}</strong><small>${esc(header.GhiChu || 'Không có ghi chú')}</small></div>
        </article>`;
        wh().mountSnapshot?.(detail, data.report || {}, context, { banner, scopeExtra: ' Bản đã khóa theo thời điểm Thủ kho gửi.' });
        actions?.enable?.();
        root.querySelectorAll('[data-warehouse-report]').forEach(button => {
          button.classList.toggle('is-active', button.dataset.warehouseReport === id);
        });
      } catch (error) {
        current = null;
        detail.innerHTML = `<div class="welcome-card"><h2>Không mở được báo cáo</h2><p>${esc(error.message)}</p></div>`;
        context.showToast?.(error.message, 'error');
      }
    };

    try {
      const list = await api(context, '/admin/reports/warehouse-submissions');
      const items = list.items || [];
      renderList(items);
      const wanted = sessionStorage.getItem('fly_open_warehouse_report') || items[0]?.MaBC;
      sessionStorage.removeItem('fly_open_warehouse_report');
      if (wanted && items.some(item => item.MaBC === wanted)) await openReport(wanted);
      else if (items[0]) await openReport(items[0].MaBC);
    } catch (error) {
      root.querySelector('#adminWarehouseList').innerHTML = `<div class="welcome-card"><h2>Chưa có dữ liệu</h2><p>${esc(error.message)}</p></div>`;
    }
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'admin-warehouse-reports') {
        return initAdminWarehouseReports(document.querySelector('.report-warehouse-admin') || document.querySelector('.financial-reports'), context);
      }
      return previous?.init?.(pageName, context);
    }
  };
})();
