(() => {
  const previous = window.FLY_ROLE_PAGES;
  const KINDS = {
    'ledger-kqkd': { kind: 'KT_KQKD', path: '/ledger/reports/income-statement', label: 'KQKD' },
    'ledger-cf': { kind: 'KT_LCTT', path: '/ledger/reports/cash-flow', label: 'LCTT' },
    'ledger-bs': { kind: 'KT_BCDKT', path: '/ledger/reports/balance-sheet', label: 'BCĐKT' }
  };

  const attach = async (pageName, root, context) => {
    const spec = KINDS[pageName];
    if (!spec || !root) return;
    const role = String(context?.user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
    if (role === 'quản lý') return;
    const actions = root.querySelector('.lg-actions');
    if (!actions || root.querySelector('#submitDepartmentReport')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lg-btn warehouse-primary';
    button.id = 'submitDepartmentReport';
    button.hidden = true;
    button.textContent = `Gửi ${spec.label} cho Quản lý`;
    actions.appendChild(button);
    const host = document.createElement('div');
    host.id = 'departmentSubmitHost';
    root.appendChild(host);

    const dept = () => window.FLY_DEPARTMENT_REPORT || {};
    const refresh = () => dept().mountDueAndStrip?.(root, context, {
      listPath: `/accounting/reports/submissions?kind=${encodeURIComponent(spec.kind)}`,
      withdrawPath: '/accounting/reports/submissions',
      kind: spec.kind,
      onChanged: refresh
    });

    const enable = () => { button.hidden = false; button.disabled = false; };
    root.querySelector('#rpLoad')?.addEventListener('click', () => setTimeout(enable, 400));
    if (root.querySelector('#rpOut') && !root.querySelector('#rpOut .lg-empty, #rpOut .welcome-card')) enable();
    else enable();

    button.addEventListener('click', async () => {
      const period = root.querySelector('#rpMonth')?.value;
      if (!period) return context.showToast?.('Chọn kỳ tháng rồi lập báo cáo trước.', 'error');
      try {
        const response = await fetch(`${context.apiBase}${spec.path}?periodType=month&period=${encodeURIComponent(period)}`, {
          headers: { Authorization: `Bearer ${context.token}` }
        });
        const report = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(report.message || 'Không lấy được số liệu sổ cái.');
        report.period = report.period || { periodType: 'month', period, label: period, from: `${period}-01`, to: `${period}-28` };
        let watermark = Boolean(report.watermark);
        try {
          const periods = await fetch(`${context.apiBase}/ledger/periods`, { headers: { Authorization: `Bearer ${context.token}` } });
          const pack = await periods.json().catch(() => ({}));
          const row = (pack.items || []).find(item => item.MaKy === period);
          watermark = !row || row.TrangThai !== 'Khoa';
        } catch { /* server sẽ chặn */ }
        report.watermark = watermark;
        if (watermark) {
          context.showToast?.('Kỳ chưa khóa — còn dấu «Số liệu tạm tính», không gửi được.', 'error');
          return;
        }
        dept().openSubmitModal?.({
          periodLabel: report.period.label || period,
          kind: spec.kind,
          warnings: dept().collectClientWarnings?.(spec.kind, report) || [],
          onSubmit: async note => {
            const sent = await fetch(`${context.apiBase}/accounting/reports/submit`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: spec.kind, report, note })
            });
            const data = await sent.json().catch(() => ({}));
            if (!sent.ok) throw new Error(data.message || 'Không gửi được báo cáo sổ cái.');
            context.showToast?.(data.message, 'success');
            await refresh();
          }
        });
      } catch (error) {
        context.showToast?.(error.message, 'error');
      }
    });
    await refresh();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}) },
    init: async (pageName, context) => {
      const result = await previous?.init?.(pageName, context);
      if (KINDS[pageName]) {
        const root = document.querySelector('.ledger-page') || document.querySelector('.warehouse-page');
        await attach(pageName, root, context);
      }
      return result;
    }
  };
})();
