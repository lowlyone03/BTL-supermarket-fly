(() => {
  const KIND_META = {
    MH_DON_MUA: { label: 'Báo cáo đơn mua và giao hàng', short: 'Đơn mua', send: 'Gửi báo cáo mua hàng', page: 'purchasing-reports' },
    KT_NOI_BO: { label: 'Báo cáo tài chính nội bộ', short: 'Nội bộ', send: 'Gửi báo cáo kế toán', page: 'accounting-reports' },
    KT_KQKD: { label: 'Kết quả kinh doanh', short: 'KQKD', send: 'Gửi KQKD cho Quản lý', page: 'ledger-kqkd' },
    KT_LCTT: { label: 'Lưu chuyển tiền tệ', short: 'LCTT', send: 'Gửi LCTT cho Quản lý', page: 'ledger-cf' },
    KT_BCDKT: { label: 'Bảng cân đối kế toán', short: 'BCĐKT', send: 'Gửi BCĐKT cho Quản lý', page: 'ledger-bs' },
    TN_BAN_HANG: { label: 'Báo cáo ca và bán hàng', short: 'Bán hàng', send: 'Gửi báo cáo thu ngân', page: 'cashier-reports' }
  };
  const DEPT_LABEL = { MuaHang: 'Mua hàng', KeToan: 'Kế toán', ThuNgan: 'Thu ngân' };
  const statusClass = status => ({
    'Đã gửi': 'sent',
    'Đã xem': 'ok',
    'Cần phản hồi': 'warning',
    'Đã thu hồi': 'cancelled',
    Nháp: 'draft'
  }[status] || 'draft');
  const statusBadge = status => `<span class="status-pill ${statusClass(status)}">${esc(status || 'Đã gửi')}</span>`;
  const kindLabel = (kind, fallback) => (KIND_META[kind] || {}).short || (KIND_META[kind] || {}).label || fallback || kind || 'Báo cáo';
  const deptOf = (item = {}) => DEPT_LABEL[item.BoPhan] || item.BoPhan || '';
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const qty = value => Number(value || 0).toLocaleString('vi-VN');
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const fmtDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const ui = () => window.FLY_UI || { kpiGrid: () => '', person: (name, sub) => `${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}` };
  const exp = () => window.FLY_DEPARTMENT_EXPORT || {};

  const currentMonth = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}`;
  };

  const followupButtons = (kind, { excel = true, canSend = true } = {}) => {
    const meta = KIND_META[kind] || {};
    return `<div class="report-followup-actions" hidden>
      <div class="report-followup-exports">
        <button class="warehouse-secondary" id="exportRoleReportCsv" disabled>Xuất CSV</button>
        ${excel ? '<button class="warehouse-secondary" id="exportRoleReportExcel" disabled>Xuất Excel</button>' : ''}
        <button class="warehouse-secondary" id="printRoleReport" disabled>Xem bản in / PDF</button>
      </div>
      ${canSend ? `<button class="warehouse-primary" id="submitDepartmentReport" disabled>${esc(meta.send || 'Gửi báo cáo bộ phận')}</button>` : ''}
    </div>`;
  };

  const idleHtml = (sendLabel) => `<div class="welcome-card report-idle report-idle-keeper">
      <span class="report-idle-mark" aria-hidden="true"><svg><use href="#i-report"></use></svg></span>
      <h2>Đang lập báo cáo</h2>
      <p>Đang tổng hợp số liệu kỳ đã chọn. Xuất file và <strong>${esc(sendLabel || 'Gửi Quản lý')}</strong> hiện sau khi đã có số.</p>
    </div>`;

  const dueBanner = (due, kind) => {
    if (!due || due.submitted) return '';
    const meta = KIND_META[kind] || {};
    return `<article class="report-due-banner report-due-banner-compact"><div><strong>Tháng này chưa nộp</strong>
      <span>Bấm <strong>${esc(meta.send || 'Gửi')}</strong> phía trên sau khi xem số — Quản lý xem ở <strong>Báo cáo bộ phận</strong>.</span></div></article>`;
  };

  const periodLabelOf = item => item.NhanKy || item.GiaTriKy || '—';

  const submitCard = (item, mode = 'staff') => {
    const tag = mode === 'admin' ? 'button' : 'article';
    const type = mode === 'admin' ? ' type="button"' : '';
    const deptName = deptOf(item);
    const kind = kindLabel(item.LoaiBaoCao, item.LoaiKy);
    const period = periodLabelOf(item);
    const version = Number(item.SoPhien) > 1 ? ` · phiên ${esc(item.SoPhien)}` : '';
    return `<${tag}${type} class="report-submit-item" data-department-report="${esc(item.MaBC)}">
        <div class="report-submit-item-top"><strong>${esc(item.MaBC)}</strong>${statusBadge(item.TrangThai || 'Đã gửi')}</div>
        <span class="report-submit-kind">${esc([deptName, kind].filter(Boolean).join(' · '))}</span>
        <span class="report-submit-period">${esc(period)}${version}</span>
        <small>${esc(item.TenNV_Lap || '')}${item.TenNV_Lap ? ' · ' : ''}${esc(fmtDateTime(item.NgayNop))}</small>
        ${mode === 'staff' && (item.TrangThai === 'Đã gửi' || item.TrangThai === 'Nháp')
          ? `<button type="button" class="report-submit-withdraw" data-withdraw-report="${esc(item.MaBC)}">Thu hồi bản này</button>` : ''}
      </${tag}>`;
  };

  const submittedStrip = (items = [], mode = 'staff', { kind } = {}) => {
    if (!items.length) {
      if (mode !== 'admin') return '';
      return `<article class="report-submit-strip is-empty">
        <span class="report-idle-mark" aria-hidden="true"><svg><use href="#i-report"></use></svg></span>
        <p>Chưa có báo cáo bộ phận nào được gửi.</p>
      </article>`;
    }
    return `<article class="report-submit-strip">
      <div class="report-submit-head"><p>${mode === 'admin' ? 'BẢN NỘP ĐÃ NHẬN' : 'KỲ ĐÃ GỬI CHO QUẢN LÝ'}</p>
        <h3>${mode === 'admin' ? 'Chọn một bản để xem snapshot đã khóa' : 'Mỗi thẻ là một lần gửi — phiên mới nhất là bản hiện hành'}</h3>
        ${mode === 'staff' ? '<span class="report-submit-help">Quản lý xem ở menu <strong>Báo cáo bộ phận</strong>, không phải Báo cáo cửa hàng. Chưa xem thì thu hồi được.</span>' : ''}
      </div>
      <div class="report-submit-list">${items.slice(0, 12).map(item => submitCard(item, mode)).join('')}</div>
    </article>`;
  };

  const bindSubmittedStrip = (host, { onWithdraw, onOpen } = {}) => {
    if (!host) return;
    host.querySelectorAll('[data-department-report]').forEach(button => {
      if (onOpen && button.tagName === 'BUTTON') {
        button.addEventListener('click', () => onOpen(button.dataset.departmentReport));
      }
    });
    if (typeof onWithdraw !== 'function') return;
    host.querySelectorAll('[data-withdraw-report]').forEach(button => {
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.withdrawReport;
        if (!id) return;
        const ok = window.FLY_DIALOG?.confirm
          ? await window.FLY_DIALOG.confirm({
            title: `Thu hồi ${id}?`,
            message: 'Quản lý sẽ không còn thấy bản này trong danh sách mặc định. JSON vẫn được giữ. Bạn có thể lập và gửi phiên mới.',
            confirmText: 'Thu hồi',
            cancelText: 'Giữ lại'
          })
          : window.confirm(`Thu hồi ${id}?`);
        if (!ok) return;
        button.disabled = true;
        try { await onWithdraw(id); }
        catch (error) {
          button.disabled = false;
          window.alert(error.message || 'Không thu hồi được báo cáo.');
        }
      });
    });
  };

  const openSubmitModal = ({ periodLabel, kind, versionHint, warnings = [], onSubmit }) => {
    const old = document.querySelector('.report-submit-backdrop');
    if (old) old.remove();
    const meta = KIND_META[kind] || {};
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop report-submit-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal report-submit-modal" role="dialog" aria-modal="true" aria-labelledby="deptSubmitTitle">
      <div class="warehouse-modal-heading"><div><p class="warehouse-kicker">GỬI BÁO CÁO BỘ PHẬN</p><h2 id="deptSubmitTitle">Gửi ${esc(periodLabel)} cho Quản lý</h2></div>
        <button class="warehouse-icon-button close" type="button" aria-label="Đóng">×</button></div>
      <div class="warehouse-modal-body">
        <div class="report-submit-callout">Quản lý xem bản này ở menu <strong>Báo cáo bộ phận</strong>. Menu <strong>Báo cáo cửa hàng</strong> vẫn là báo cáo tổng siêu thị. Trợ lý / Telegram không duyệt.</div>
        <dl class="report-submit-facts">
          <div><dt>Loại báo cáo</dt><dd>${esc(meta.label || kind)}</dd></div>
          <div><dt>Kỳ gửi</dt><dd>${esc(periodLabel)}</dd></div>
        </dl>
        ${versionHint ? `<p class="report-submit-warn">${esc(versionHint)}</p>` : ''}
        ${warnings.length ? `<ul class="report-submit-warn-list">${warnings.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
        <label><span>Ghi chú gửi kèm <em>không bắt buộc · tối đa 300 ký tự</em></span>
          <textarea id="deptSubmitNote" rows="3" maxlength="300" placeholder="Ví dụ: còn 2 đơn giao trễ, đã nhắc NCC."></textarea></label>
      </div>
      <div class="warehouse-modal-actions">
        <button type="button" class="warehouse-secondary close">Hủy</button>
        <button type="button" class="warehouse-primary" id="deptSubmitConfirm">Gửi báo cáo</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('#deptSubmitConfirm').addEventListener('click', async () => {
      const button = overlay.querySelector('#deptSubmitConfirm');
      button.disabled = true;
      try {
        await onSubmit(overlay.querySelector('#deptSubmitNote').value.trim());
        close();
      } catch (error) {
        button.disabled = false;
        window.alert(error.message || 'Không gửi được báo cáo.');
      }
    });
  };

  const collectClientWarnings = (kind, report = {}) => {
    const warnings = [];
    if (kind === 'TN_BAN_HANG') {
      const alerts = report.alerts || {};
      if (Number(alerts.CaChoDoiSoat)) warnings.push(`${alerts.CaChoDoiSoat} ca đang chờ Kế toán đối soát.`);
      if (Number(alerts.HoaDonNhap)) warnings.push(`${alerts.HoaDonNhap} hóa đơn còn nháp.`);
      if (Number(alerts.ThanhToanChoXacNhan)) warnings.push(`${alerts.ThanhToanChoXacNhan} thanh toán chờ xác nhận.`);
    }
    if (kind === 'KT_NOI_BO') {
      const chenh = Number(report.finance?.ChenhLechPhieuThu || 0);
      if (chenh) warnings.push(`Chênh lệch phiếu thu ${money(chenh)}.`);
    }
    if (KIND_META[kind] && /KT_KQKD|KT_LCTT|KT_BCDKT/.test(kind) && report.watermark) {
      warnings.push('Kỳ còn dấu «Số liệu tạm tính» — máy chủ sẽ từ chối gửi.');
    }
    return warnings;
  };

  const bindDepartmentReportActions = (root, {
    getReport, context, kind, endpoint, getMeta, onSubmitted, extraPrint
  } = {}) => {
    const enable = () => {
      const row = root.querySelector('.report-followup-actions');
      if (row) row.hidden = false;
      const role = String(context?.user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
      const canSend = role !== 'quản lý';
      root.querySelectorAll('#exportRoleReportCsv, #exportRoleReportExcel, #printRoleReport, #exportReportCsv, #printFinancialReport').forEach(button => {
        button.disabled = false;
        button.hidden = false;
      });
      const sendBtn = root.querySelector('#submitDepartmentReport');
      if (sendBtn) {
        sendBtn.hidden = !canSend;
        sendBtn.disabled = !canSend;
        if (!canSend) sendBtn.remove();
      }
    };
    const metaOf = (report, extra) => {
      const base = {
        number: extra?.number,
        preparedBy: extra?.preparedBy || context?.user?.TenNV || '',
        staffId: extra?.staffId || context?.user?.MaNV || '',
        issuedAt: extra?.issuedAt || new Date(),
        status: extra?.status || 'Bản làm việc',
        note: extra?.note || '',
        kind
      };
      return typeof getMeta === 'function' ? { ...base, ...getMeta(report) } : base;
    };
    root.querySelector('#printRoleReport')?.addEventListener('click', () => {
      const report = getReport?.();
      if (!report) return;
      if (typeof extraPrint === 'function') return extraPrint(report, metaOf(report));
      window.FLY_PRINT?.show(buildPrintConfig(kind, report, metaOf(report)));
    });
    root.querySelector('#exportRoleReportCsv')?.addEventListener('click', () => {
      const report = getReport?.();
      if (!report) return;
      exp().downloadCsv?.(kind, report, metaOf(report));
    });
    root.querySelector('#exportRoleReportExcel')?.addEventListener('click', () => {
      const report = getReport?.();
      if (!report) return;
      exp().downloadExcel?.(kind, report, metaOf(report));
    });
    const isManagerUser = String(context?.user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN') === 'quản lý';
    root.querySelector('#submitDepartmentReport')?.addEventListener('click', () => {
      if (isManagerUser) return;
      const report = getReport?.();
      if (!report?.period) return;
      const same = (root._deptSubmissions || []).find(item => item.GiaTriKy === report.period.period && item.LoaiBaoCao === kind);
      openSubmitModal({
        periodLabel: report.period.label || report.period.period,
        kind,
        versionHint: same
          ? `Kỳ này đã có ${same.MaBC} (phiên ${same.SoPhien || 1}). Gửi lần này sẽ tạo phiên mới, không ghi đè.`
          : '',
        warnings: collectClientWarnings(kind, report),
        onSubmit: async note => {
          const response = await fetch(`${context.apiBase}${endpoint}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ report, note, kind })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Không gửi được báo cáo bộ phận.');
          context.showToast?.(data.message, 'success');
          if (data.warnings?.length) context.showToast?.(data.warnings.join(' '), 'warning');
          onSubmitted?.(data);
        }
      });
    });
    return { enable };
  };

  const mountDueAndStrip = async (root, context, { listPath, withdrawPath, kind, currentReport, onChanged } = {}) => {
    const host = root.querySelector('#departmentSubmitHost');
    if (!host) return [];
    let items = [];
    let due = { submitted: true };
    try {
      const month = currentMonth();
      const sep = listPath.includes('?') ? '&' : '?';
      const response = await fetch(`${context.apiBase}${listPath}${sep}periodType=month&period=${encodeURIComponent(month)}`, {
        headers: { Authorization: `Bearer ${context.token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        items = data.items || [];
        due = data.due || due;
      }
    } catch { items = []; }
    root._deptSubmissions = items;
    const compiled = Boolean(currentReport?.period);
    if (!compiled && !items.length) {
      host.innerHTML = '';
      return items;
    }
    host.innerHTML = `${compiled ? dueBanner(due, kind) : ''}${submittedStrip(items, 'staff', { kind })}`;
    bindSubmittedStrip(host, {
      onWithdraw: async id => {
        const response = await fetch(`${context.apiBase}${withdrawPath}/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${context.token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Không thu hồi được báo cáo.');
        if (currentReport && currentReport.submittedNumber === id) delete currentReport.submittedNumber;
        context.showToast?.(data.message, 'success');
        onChanged?.();
      }
    });
    return items;
  };

  const percent = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Number(value || 0))}%`;
  const rowTone = value => /quá hạn|trễ|từ chối|thất bại/i.test(value || '') ? 'cancelled' : /hoàn thành|đã xác nhận|đã duyệt|khớp/i.test(value || '') ? 'ok' : /chờ|đang/i.test(value || '') ? 'sent' : 'draft';
  const debtClass = status => status === 'Đã thanh toán' ? 'ok' : status === 'Quá hạn' ? 'cancelled' : 'sent';
  const matchClass = status => status === 'Đã khớp' ? 'ok' : status === 'Chênh lệch' ? 'cancelled' : 'draft';
  const stepClass = value => /chưa|chờ|kẹt/i.test(value || '') ? 'sent' : /từ chối|không nhập lại|nhầm|loại bỏ|vứt/i.test(value || '') ? 'cancelled' : /xong|nhập lại kho/i.test(value || '') ? 'ok' : 'draft';
  const chartUi = () => window.FLY_CHARTS || { card: () => '', line: () => '', columns: () => '', horizontal: () => '', donut: () => '', compact: qty, money, palette: ['#2c8b66', '#e1a536', '#5376c6', '#e17a52'] };
  const cleanNote = value => {
    const text = String(value || '').trim();
    if (!text) return '';
    const folded = text.toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
    if (/^(không có ghi chú|n\/a|none|-|—|\.|…)$/i.test(folded)) return '';
    if (/(he\s*he+|hihi|haha|asdf|lorem|test123|xxx+)/i.test(folded)) return '';
    if (folded.length <= 3) return '';
    return text;
  };
  const alertList = items => `<div class="report-alert-list">${items.map(item => `<article class="${esc(item.tone || '')}"><span class="report-alert-icon"><svg><use href="#${esc(item.icon)}"/></svg></span><div><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></div>${item.value != null ? `<b>${esc(item.value)}</b>` : ''}</article>`).join('')}</div>`;
  const hangDiDauText = row => {
    if (row?.HangDiDau) return row.HangDiDau;
    const restock = Number(row?.SLNhapLai || 0);
    const scrap = Number(row?.SLLoaiBo || row?.SLKhongNhapLai || 0);
    const pending = Math.max(0, Number(row?.SLTra || 0) - restock - scrap);
    const parts = [];
    if (restock) parts.push(`Nhập lại kho bán ${restock}`);
    if (scrap) parts.push(`Loại bỏ / vứt ${scrap} — không cộng tồn (đã trừ lúc bán)`);
    if (pending) parts.push(`Chưa xử lý kho ${pending}`);
    return parts.join(' · ') || '—';
  };
  const doiTraPanel = (data, options = {}) => {
    const summary = data?.summary || {};
    const tickets = data?.tickets || [];
    const products = data?.products || [];
    if (!Number(summary.SoPhieu || 0) && !tickets.length && !products.length) return '';
    const ticketRows = tickets.length
      ? tickets.map(row => `<tr><td><strong>${esc(row.MaDT)}</strong><small>${esc(row.MaHD)} · ${esc(row.TenKH || 'Khách vãng lai')}</small></td><td>${esc(row.HinhThucXuLy)}<small>${esc(row.TrangThai)}</small></td><td class="report-return-reason">${esc(row.LyDo || '—')}</td><td class="num">${money(row.SoTienHoan)}</td><td class="report-return-duty"><span class="status-pill ${stepClass(row.BuocCanXuLy)}">${esc(row.BuocCanXuLy || '—')}</span><small class="report-return-fate">Hàng: ${esc(hangDiDauText(row))}</small></td></tr>`).join('')
      : '<tr><td colspan="5" class="warehouse-empty">Kỳ này chưa có phiếu đổi trả.</td></tr>';
    const productCard = `<article class="warehouse-table-card report-return-products"><div class="warehouse-panel-title"><div><p>HÀNG KHÁCH TRẢ</p><h2>${esc(options.productTitle || 'Sản phẩm bị đổi trả nhiều')}</h2></div><span class="report-card-count">${products.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>SL TRẢ</th><th>NHẬP LẠI</th><th>LOẠI BỎ / VỨT</th><th>HÀNG ĐI ĐÂU</th></tr></thead><tbody>${products.length ? products.map(row => `<tr><td><strong>${esc(row.TenSP)}</strong><small>${esc(row.MaSP)}</small></td><td class="num">${row.SLTra}</td><td class="num">${row.SLNhapLai || 0}</td><td class="num">${row.SLLoaiBo || row.SLKhongNhapLai || 0}</td><td class="report-return-fate">${esc(hangDiDauText(row))}</td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Kỳ này chưa có hàng khách trả.</td></tr>'}</tbody></table></div></article>`;
    return `<section class="report-return-block">
      <div class="report-return-heading"><div><p>ĐỔI TRẢ VÀ TRÁCH NHIỆM</p><h2>${esc(options.title || 'Phiếu đổi trả trong kỳ')}</h2><span>${esc(options.subtitle || '')}</span></div><b>${tickets.length} phiếu</b></div>
      <div class="report-return-kpis">
        <article><span>PHIẾU ĐỔI TRẢ</span><strong>${summary.SoPhieu || 0}</strong><small>${summary.SoHoanTien || 0} hoàn tiền · ${summary.SoDoiHang || 0} đổi hàng</small></article>
        <article><span>TIỀN ĐÃ HOÀN</span><strong>${money(summary.TienHoan)}</strong><small>${summary.ChoThuNganXacNhan || 0} chờ thu ngân xác nhận</small></article>
        <article><span>ĐANG KẸT BƯỚC</span><strong>${Number(summary.ChoKiemTra || 0) + Number(summary.ChoDuyet || 0) + Number(summary.ChoThuNganXacNhan || 0)}</strong><small>Thủ kho ${summary.ChoKiemTra || 0} · Quản lý ${summary.ChoDuyet || 0}</small></article>
        <article><span>HÀNG ĐI ĐÂU</span><strong>${summary.NhapLaiKho || 0} · ${summary.KhongNhapLai || 0}</strong><small>Nhập lại kho bán · Loại bỏ/vứt</small></article>
      </div>
      <div class="report-return-grid">
        <article class="warehouse-table-card report-return-tickets"><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU / HĐ</th><th>HÌNH THỨC</th><th>LÝ DO</th><th>TIỀN HOÀN</th><th>TRÁCH NHIỆM</th></tr></thead><tbody>${ticketRows}</tbody></table></div></article>
        ${productCard}
      </div>
    </section>`;
  };
  const periodTitle = (period = {}, badge) => `<div class="financial-report-title"><div><p>KỲ BÁO CÁO · BẢN ĐÃ KHÓA</p><h2>${esc(period.label || period.period || '—')}</h2><span>${esc(fmtDate(period.from) || period.from || '—')} đến ${esc(fmtDate(period.to) || period.to || '—')}</span></div><span class="status-pill ok">${esc(badge)}</span></div>`;

  const fullFinancial = (report) => {
    const visuals = ui();
    const charts = chartUi();
    const s = report.sales || {};
    const p = report.purchases || {};
    const inv = report.inventory || {};
    const f = report.finance || {};
    const daily = report.daily || [];
    const cashflowDaily = report.cashflowDaily || [];
    const debtAging = report.debtAging || [];
    const payables = report.payables || [];
    const reconciliation = report.reconciliation || [];
    const grossMargin = Number(s.DoanhThuThuan || 0) ? Number(s.LoiNhuanGop || 0) / Number(s.DoanhThuThuan) * 100 : 0;
    const reconciliationMatched = reconciliation.find(row => row.TrangThaiDoiChieu === 'Đã khớp') || {};
    const reconciliationPending = reconciliation.reduce((sum, row) => sum + (row.TrangThaiDoiChieu === 'Đã khớp' ? 0 : Number(row.SoHoaDon || 0)), 0);
    return `${periodTitle(report.period, 'Nội bộ kế toán')}
      ${visuals.kpiGrid([
        { icon: 'i-trend', label: 'DOANH THU THUẦN', value: money(s.DoanhThuThuan), hint: `${s.SoHoaDon || 0} hóa đơn − ${money(s.TienHoan)} hoàn tiền` },
        { icon: 'i-cash', label: 'PHIẾU THU THỰC NỘP', value: money(f.PhieuThuThucNop), hint: `${f.SoPhieuThu || 0} Phiếu thu bàn giao ca` },
        { icon: 'i-report', label: 'ĐÃ CHI NHÀ CUNG CẤP', value: money(f.DaThanhToanNCC), hint: `${f.SoPhieuChi || 0} Phiếu chi lập trong kỳ` },
        { icon: 'i-bank', label: 'CÔNG NỢ PHẢI TRẢ', value: money(f.CongNoConLai), hint: `${f.SoKhoanNoPhatSinh || 0} khoản phát sinh trong kỳ` },
        { icon: 'i-clock', label: 'CÔNG NỢ QUÁ HẠN', value: money(f.CongNoQuaHan), hint: 'Theo hạn thanh toán 30–45 ngày', tone: Number(f.CongNoQuaHan) ? 'attention' : '' },
        { icon: 'i-warning', label: 'CHÊNH LỆCH BÀN GIAO', value: money(f.ChenhLechPhieuThu), hint: 'Thực nộp − số tiền theo hệ thống', tone: Number(f.ChenhLechPhieuThu) ? 'attention' : '' }
      ], 'primary')}
      <div class="fly-dashboard-grid report-chart-trio">
        ${charts.card({ kicker: 'DOANH THU ĐÃ ĐỐI SOÁT', title: 'Doanh thu, giá vốn và lãi gộp', subtitle: 'Số liệu bán hàng sau hoàn tiền và đổi trả', badge: `Biên lãi ${percent(grossMargin)}`, className: 'executive', chart: charts.line({ labels: daily.map(row => fmtDate(row.Ngay)), series: [{ name: 'Doanh thu thuần', values: daily.map(row => row.DoanhThuThuan), color: '#2c8b66' }, { name: 'Giá vốn thuần', values: daily.map(row => row.GiaVonHangBanThuan), color: '#e1a536' }, { name: 'Lãi gộp', values: daily.map(row => row.LoiNhuanGop), color: '#5376c6' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có hóa đơn hoặc đổi trả hoàn thành.' }) })}
        ${charts.card({ kicker: 'DÒNG TIỀN CHỨNG TỪ', title: 'Phiếu thu và khoản đã chi', subtitle: 'Thực nộp theo ca so với thanh toán NCC thành công', badge: `${Number(f.SoPhieuThu || 0) + Number(f.SoPhieuChi || 0)} phiếu`, className: 'operations', chart: charts.columns({ labels: cashflowDaily.map(row => fmtDate(row.Ngay)), series: [{ name: 'Phiếu thu thực nộp', values: cashflowDaily.map(row => row.ThucNop), color: '#2c8b66' }, { name: 'Đã chi NCC', values: cashflowDaily.map(row => row.DaChi), color: '#e17a52' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có Phiếu thu hoặc khoản chi thành công.' }) })}
        ${charts.card({ kicker: 'TUỔI CÔNG NỢ', title: 'Cơ cấu công nợ phải trả', subtitle: 'Phân nhóm theo số ngày tới hạn hoặc quá hạn', badge: money(f.CongNoConLai), className: 'summary', chart: charts.donut({ items: debtAging.map((row, index) => ({ label: `${row.NhomHan} · ${row.SoKhoan} khoản`, value: row.GiaTri, color: charts.palette?.[index % (charts.palette.length || 1)] })), centerLabel: 'Còn phải trả', centerValue: money(f.CongNoConLai), formatter: money, emptyText: 'Không có công nợ phải trả.' }) })}
      </div>
      <div class="report-bottom-grid">
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CÔNG NỢ NHÀ CUNG CẤP</p><h2>Các khoản cần theo dõi hạn</h2></div><span class="report-card-count">${payables.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÀ CUNG CẤP</th><th>HẠN</th><th>CÒN LẠI</th><th>TRẠNG THÁI</th></tr></thead><tbody>${payables.length ? payables.slice(0, 8).map(row => `<tr><td><strong>${esc(row.TenNCC)}</strong><small>${esc(row.MaCNPTra)} · HĐ ${esc(row.SoHoaDon)}</small></td><td>${fmtDate(row.HanThanhToan)}</td><td class="num"><strong>${money(row.SoTienConLai)}</strong></td><td><span class="status-pill ${debtClass(row.TrangThaiHienTai)}">${esc(row.TrangThaiHienTai || '—')}</span></td></tr>`).join('') : '<tr><td colspan="4" class="warehouse-empty">Không có công nợ phải trả.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>ĐỐI CHIẾU BA CHỨNG TỪ</p><h2>Trạng thái hóa đơn mua hàng</h2></div><span class="report-card-count">${reconciliation.reduce((sum, row) => sum + Number(row.SoHoaDon || 0), 0)}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>TRẠNG THÁI</th><th>HÓA ĐƠN</th><th>TỔNG GIÁ TRỊ</th></tr></thead><tbody>${reconciliation.length ? reconciliation.map(row => `<tr><td><span class="status-pill ${matchClass(row.TrangThaiDoiChieu)}">${esc(row.TrangThaiDoiChieu)}</span></td><td class="num">${row.SoHoaDon}</td><td class="num"><strong>${money(row.TongCong)}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Kỳ này chưa có hóa đơn mua hàng.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Ưu tiên kế toán</h2></div></div>${alertList([
          { icon: 'i-report', tone: reconciliationPending ? 'warning' : 'ok', title: `${reconciliationPending} hóa đơn chưa đối chiếu khớp`, detail: `${reconciliationMatched.SoHoaDon || 0} hóa đơn đã khớp trong kỳ`, value: 'Đối chiếu' },
          { icon: 'i-bank', tone: Number(f.CongNoQuaHan) ? 'danger' : 'ok', title: `Công nợ quá hạn ${money(f.CongNoQuaHan)}`, detail: 'Thanh toán toàn bộ một lần sau phê duyệt', value: 'Công nợ' },
          { icon: 'i-cash', tone: Number(f.ChenhLechPhieuThu) ? 'warning' : 'ok', title: `Chênh lệch bàn giao ${money(f.ChenhLechPhieuThu)}`, detail: 'Ghi lý do trực tiếp trên Phiếu thu', value: 'Bàn giao' },
          { icon: 'i-trend', tone: Number(s.DoanhThuThuan) ? 'ok' : '', title: `Lợi nhuận gộp ${money(s.LoiNhuanGop)}`, detail: `Biên lãi gộp ${percent(grossMargin)}`, value: 'Báo cáo' }
        ])}</article>
      </div>
      ${doiTraPanel(report.doiTra, { title: 'Hoàn tiền ảnh hưởng doanh thu thuần', subtitle: 'Tiền hoàn đã trừ khỏi doanh thu thuần. Hàng loại bỏ/vứt không hoàn giá vốn vào tồn; hàng nhập lại mới cộng tồn bán.', productTitle: 'Hàng trả làm giảm doanh thu' })}
      <details class="report-detail-disclosure accounting-detail" open><summary>Xem công thức lãi gộp và dữ liệu đối soát chi tiết</summary>
        <div class="gross-profit-steps"><div class="step"><div><span>DOANH THU HÓA ĐƠN</span><strong>${money(s.DoanhThuHoaDon)}</strong></div><b>−</b><div><span>TIỀN HOÀN</span><strong>${money(s.TienHoan)}</strong></div><b>=</b><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div></div><div class="step"><div><span>GIÁ VỐN HÓA ĐƠN</span><strong>${money(s.GiaVonHoaDon)}</strong></div><b>−</b><div><span>GV HÀNG TRẢ NHẬP LẠI</span><strong>${money(s.GiaVonHangTraNhapLai)}</strong></div><b>+</b><div><span>GV HÀNG GIAO ĐỔI</span><strong>${money(s.GiaVonHangGiaoDoi)}</strong></div><b>=</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div></div><div class="step"><div class="mid"><span>DOANH THU THUẦN</span><strong>${money(s.DoanhThuThuan)}</strong></div><b>−</b><div class="mid"><span>GIÁ VỐN THUẦN</span><strong>${money(s.GiaVonHangBanThuan)}</strong></div><b>=</b><div class="result"><span>LÃI GỘP</span><strong>${money(s.LoiNhuanGop ?? (Number(s.DoanhThuThuan || 0) - Number(s.GiaVonHangBanThuan || 0)))}</strong></div></div></div>
        <div class="financial-report-sections"><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>MUA HÀNG &amp; THUẾ</p><h2>Chứng từ đầu vào</h2></div></div><div class="report-metric-list"><div><span>Đơn mua / Phiếu nhập</span><strong>${p.SoDonMua || 0} / ${p.SoPhieuNhap || 0}</strong></div><div><span>Tiền hàng / Thuế đầu vào</span><strong>${money(p.TienHangMua)} / ${money(p.ThueDauVao)}</strong></div></div></article><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>NHẬP – XUẤT – TỒN</p><h2>Biến động hàng hóa</h2></div></div><div class="report-metric-list"><div><span>Tồn đầu / cuối kỳ</span><strong>${qty(inv.SoLuongDauKy)} / ${qty(inv.SoLuongCuoiKy)}</strong></div><div><span>Nhập / xuất</span><strong>${qty(inv.SoLuongNhap)} / ${qty(inv.SoLuongXuat)}</strong></div></div></article><article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>THU – CHI</p><h2>Tổng hợp chứng từ</h2></div></div><div class="report-metric-list"><div><span>Phiếu thu hệ thống / thực nộp</span><strong>${money(f.PhieuThuTheoHeThong)} / ${money(f.PhieuThuThucNop)}</strong></div><div><span>Phiếu chi / đã thanh toán</span><strong>${money(f.TongPhieuChi)} / ${money(f.DaThanhToanNCC)}</strong></div></div></article></div>
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CHI TIẾT BÁN HÀNG</p><h2>Doanh thu, giá vốn và lãi gộp theo ngày</h2></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY</th><th>HÓA ĐƠN</th><th>DOANH THU HĐ</th><th>TIỀN HOÀN</th><th>DOANH THU THUẦN</th><th>GIÁ VỐN THUẦN</th><th>LÃI GỘP</th></tr></thead><tbody>${daily.length ? daily.map(row => `<tr><td>${fmtDate(row.Ngay)}</td><td class="num">${row.SoHoaDon}</td><td class="num">${money(row.DoanhThuHoaDon)}</td><td class="num">${money(row.TienHoan)}</td><td class="num"><strong>${money(row.DoanhThuThuan)}</strong></td><td class="num">${money(row.GiaVonHangBanThuan)}</td><td class="num"><strong>${money(row.LoiNhuanGop)}</strong></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Kỳ này chưa có hóa đơn hoàn thành hoặc đổi trả hoàn thành.</td></tr>'}</tbody></table></div></article>
      </details>`;
  };

  const fullPurchasing = (report) => {
    const visuals = ui();
    const charts = chartUi();
    const s = report.summary || {};
    const byStatus = report.byStatus || [];
    const suppliers = report.suppliers || [];
    const daily = report.daily || [];
    const categories = report.byCategory || [];
    const actionOrders = report.actionOrders || [];
    const onTimeRate = Number(s.SoDonDaHoanTat || 0) ? Number(s.SoDonDungHan || 0) / Number(s.SoDonDaHoanTat) * 100 : null;
    return `${periodTitle(report.period, 'Mua hàng')}
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
        ${charts.card({ kicker: 'CƠ CẤU MUA HÀNG', title: 'Giá trị mua theo danh mục', subtitle: 'Phân bổ nhu cầu mua của cửa hàng', badge: `${categories.length} danh mục`, className: 'summary', chart: charts.donut({ items: categories.map((row, index) => ({ label: row.TenDM, value: row.GiaTri, color: charts.palette?.[index % (charts.palette.length || 1)] })), centerLabel: 'Tổng mua', centerValue: money(s.GiaTriDonMua), formatter: money, emptyText: 'Kỳ này chưa có giá trị mua theo danh mục.' }) })}
      </div>
      <div class="report-bottom-grid">
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>TOP NHÀ CUNG CẤP</p><h2>Đối tác theo giá trị đặt mua</h2></div><span class="report-card-count">${suppliers.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÀ CUNG CẤP</th><th>SỐ ĐƠN</th><th>GIÁ TRỊ</th></tr></thead><tbody>${suppliers.length ? suppliers.slice(0, 8).map(row => `<tr><td>${visuals.person(row.TenNCC, row.MaNCC)}</td><td class="num">${row.SoDon}</td><td class="num"><strong>${money(row.GiaTri)}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Chưa phát sinh đơn mua.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>ĐƠN CẦN XỬ LÝ</p><h2>Phê duyệt và tiến độ giao</h2></div><span class="report-card-count">${actionOrders.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>ĐƠN / NCC</th><th>NGÀY GIAO</th><th>CÒN THIẾU</th><th>ƯU TIÊN</th></tr></thead><tbody>${actionOrders.length ? actionOrders.slice(0, 8).map(row => `<tr><td><strong>${esc(row.MaPO)}</strong><small>${esc(row.TenNCC)}</small></td><td>${fmtDate(row.NgayGiaoDuKien)}</td><td class="num">${qty(row.SLConThieu)}</td><td><span class="status-pill ${rowTone(row.UuTien)}">${esc(row.UuTien || '—')}</span></td></tr>`).join('') : '<tr><td colspan="4" class="warehouse-empty">Không có đơn cần xử lý trong kỳ.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Ưu tiên mua hàng</h2></div></div>${alertList([
          { icon: 'i-approve', tone: Number(s.SoDonChoDuyet) ? 'warning' : 'ok', title: `${s.SoDonChoDuyet || 0} đơn chờ phê duyệt`, detail: 'Chỉ gửi NCC sau khi Quản lý duyệt', value: 'Phê duyệt' },
          { icon: 'i-truck', tone: Number(s.SoDonTre) ? 'danger' : 'ok', title: `${s.SoDonTre || 0} đơn đã trễ ngày giao`, detail: `${qty(s.SLConThieu)} đơn vị còn thiếu`, value: 'Giao hàng' },
          { icon: 'i-inventory', tone: Number(s.SoDonDangGiao) ? 'warning' : 'ok', title: `${s.SoDonDangGiao || 0} đơn đang theo dõi giao`, detail: 'Cập nhật xác nhận và lịch giao bù', value: 'Tiến độ' },
          { icon: 'i-clock', tone: onTimeRate == null ? '' : onTimeRate < 90 ? 'warning' : 'ok', title: onTimeRate == null ? 'Chưa đủ dữ liệu giao đúng hạn' : `${percent(onTimeRate)} đơn hoàn tất đúng hạn`, detail: 'Chỉ tính đơn đã có Phiếu nhập và hết số lượng thiếu', value: 'Chất lượng' }
        ])}</article>
      </div>
      ${doiTraPanel(report.doiTra, { title: 'Hàng khách trả — tín hiệu chất lượng', subtitle: 'SL loại bỏ/vứt cao trên một SKU thường là lỗi NCC hoặc bảo quản, không phải lỗi lập đơn mua.', productTitle: 'SKU khách trả nhiều' })}
      <details class="report-detail-disclosure"><summary>Xem cơ cấu trạng thái đơn mua</summary><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>TRẠNG THÁI</th><th>SỐ ĐƠN</th><th>GIÁ TRỊ</th></tr></thead><tbody>${byStatus.length ? byStatus.map(row => `<tr><td>${esc(row.TrangThai)}</td><td class="num">${row.SoDon}</td><td class="num">${money(row.GiaTri)}</td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Kỳ này chưa có đơn mua.</td></tr>'}</tbody></table></div></details>`;
  };

  const fullSales = (report) => {
    const visuals = ui();
    const charts = chartUi();
    const s = report.sales || {};
    const m = report.methods || {};
    const shifts = report.shifts || [];
    const daily = report.daily || [];
    const topProducts = report.topProducts || [];
    const recentInvoices = report.recentInvoices || [];
    const alerts = report.alerts || {};
    const netRevenue = Number(s.DoanhThuHoaDon || 0) - Number(s.TienHoan || 0);
    const electronic = Number(m.QR || 0) + Number(m.The || 0) + Number(m.ChuyenKhoan || 0);
    const averageOrder = Number(s.SoHoaDon || 0) ? netRevenue / Number(s.SoHoaDon) : 0;
    const labels = daily.map(row => fmtDate(row.Ngay));
    return `${periodTitle(report.period, 'Bán hàng cá nhân')}
      ${visuals.kpiGrid([
        { icon: 'i-trend', label: 'DOANH THU THUẦN', value: money(netRevenue), hint: `${s.SoHoaDon || 0} hóa đơn hoàn thành` },
        { icon: 'i-report', label: 'SỐ HÓA ĐƠN', value: String(s.SoHoaDon || 0), hint: 'Chỉ hóa đơn đã hoàn thành' },
        { icon: 'i-cart', label: 'GIÁ TRỊ TRUNG BÌNH', value: money(averageOrder), hint: 'Doanh thu thuần / số hóa đơn' },
        { icon: 'i-cash', label: 'GIAO DỊCH TIỀN MẶT', value: money(m.TienMat), hint: 'Khoản đi vào két ca' },
        { icon: 'i-bank', label: 'THANH TOÁN ĐIỆN TỬ', value: money(electronic), hint: `QR ${money(m.QR)} · Thẻ ${money(m.The)} · CK ${money(m.ChuyenKhoan)}` },
        { icon: 'i-refresh', label: 'ĐỔI TRẢ HOÀN THÀNH', value: String(s.SoPhieu || 0), hint: `Đã hoàn ${money(s.TienHoan)}`, tone: Number(s.SoPhieu) ? 'attention' : '' }
      ], 'primary')}
      <div class="fly-dashboard-grid report-chart-trio">
        ${charts.card({ kicker: 'XU HƯỚNG CÁ NHÂN', title: 'Doanh thu bán hàng theo ngày', subtitle: 'Doanh thu hóa đơn và doanh thu sau hoàn tiền', badge: money(netRevenue), className: 'executive', chart: charts.line({ labels, series: [{ name: 'Doanh thu hóa đơn', values: daily.map(row => row.DoanhThuHoaDon), color: '#25845f' }, { name: 'Doanh thu thuần', values: daily.map(row => row.DoanhThuThuan ?? (Number(row.DoanhThuHoaDon || 0) - Number(row.TienHoan || 0))), color: '#4f73c5' }], formatter: money, axisFormatter: charts.compact, emptyText: 'Kỳ này chưa có hóa đơn hoàn thành.' }) })}
        ${charts.card({ kicker: 'THANH TOÁN', title: 'Cơ cấu phương thức thu tiền', subtitle: 'Chỉ giao dịch thành công của hóa đơn hoàn thành', badge: `${s.SoHoaDon || 0} hóa đơn`, className: 'summary', chart: charts.donut({ items: [{ label: 'Tiền mặt', value: m.TienMat, color: '#25845f' }, { label: 'QR', value: m.QR, color: '#4f73c5' }, { label: 'Thẻ', value: m.The, color: '#7b61b8' }, { label: 'Chuyển khoản', value: m.ChuyenKhoan, color: '#d8a33e' }], centerLabel: 'Đã thu', centerValue: money(Number(m.TienMat || 0) + electronic), formatter: money, emptyText: 'Kỳ này chưa có thanh toán thành công.' }) })}
        ${charts.card({ kicker: 'SẢN PHẨM', title: 'Top sản phẩm bán chạy', subtitle: 'Xếp theo doanh thu hóa đơn', badge: `${topProducts.length} sản phẩm`, className: 'ranking', chart: charts.horizontal({ items: topProducts.map(row => ({ label: row.TenSP, value: row.DoanhThu, display: money(row.DoanhThu) })), formatter: money, emptyText: 'Kỳ này chưa bán sản phẩm nào.' }) })}
      </div>
      <div class="report-bottom-grid">
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>CA BÁN HÀNG</p><h2>Doanh thu và đổi trả theo ca</h2></div><span class="report-card-count">${shifts.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>CA</th><th>HÓA ĐƠN</th><th>DOANH THU</th><th>ĐỔI TRẢ / HOÀN</th><th>TRẠNG THÁI</th></tr></thead><tbody>${shifts.length ? shifts.slice(0, 8).map(row => `<tr><td><strong>${esc(row.MaCa)}</strong><small>${fmtDateTime(row.ThoiGianBatDau)} → ${fmtDateTime(row.ThoiGianKetThuc)}</small></td><td class="num">${row.SoHoaDon || 0}</td><td class="num"><strong>${money(row.DoanhThu)}</strong></td><td class="num"><strong>${row.SoDoiTra || 0} phiếu</strong><small>Hoàn ${money(row.TienHoan)}</small></td><td><span class="status-pill ${rowTone(row.TrangThai)}">${esc(row.TrangThai || '—')}</span></td></tr>`).join('') : '<tr><td colspan="5" class="warehouse-empty">Kỳ này chưa có ca bán hàng.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>GIAO DỊCH GẦN ĐÂY</p><h2>Hóa đơn đã lập</h2></div><span class="report-card-count">${recentInvoices.length}</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÓA ĐƠN</th><th>THỜI GIAN</th><th>THANH TOÁN</th><th>GIÁ TRỊ</th></tr></thead><tbody>${recentInvoices.length ? recentInvoices.slice(0, 8).map(row => `<tr><td><strong>${esc(row.MaHD)}</strong><small>${esc(row.TenKhachHang)}</small></td><td>${fmtDateTime(row.NgayLap)}</td><td>${esc(row.PhuongThuc || 'Chưa ghi nhận')}</td><td class="num"><strong>${money(row.TongThanhToan)}</strong></td></tr>`).join('') : '<tr><td colspan="4" class="warehouse-empty">Kỳ này chưa có hóa đơn.</td></tr>'}</tbody></table></div></article>
        <article class="warehouse-table-card report-alert-card"><div class="warehouse-panel-title"><div><p>THÔNG BÁO / CẢNH BÁO</p><h2>Việc cần xử lý tại quầy</h2></div></div>${alertList([
          { icon: 'i-report', tone: Number(alerts.HoaDonNhap) ? 'warning' : 'ok', title: `${alerts.HoaDonNhap || 0} hóa đơn đang nháp`, detail: 'Chưa ghi nhận doanh thu và chưa trừ tồn', value: 'Hóa đơn' },
          { icon: 'i-clock', tone: Number(alerts.ThanhToanChoXacNhan) ? 'danger' : 'ok', title: `${alerts.ThanhToanChoXacNhan || 0} thanh toán chờ xác nhận`, detail: 'Không hoàn tất hóa đơn khi chưa thanh toán đủ', value: 'Thanh toán' },
          { icon: 'i-refresh', tone: Number(alerts.DoiTraDangXuLy) ? 'warning' : 'ok', title: `${alerts.DoiTraDangXuLy || 0} yêu cầu đổi trả đang xử lý`, detail: 'Chờ Thủ kho / QL, hoặc xác nhận hoàn sau khi QL duyệt', value: 'Đổi trả' },
          { icon: 'i-cash', tone: Number(alerts.CaChoDoiSoat) ? 'warning' : 'ok', title: `${alerts.CaChoDoiSoat || 0} ca chờ Kế toán đối soát`, detail: 'Tiền mặt bàn giao được lập Phiếu thu', value: 'Đóng ca' }
        ])}</article>
      </div>
      ${doiTraPanel(report.doiTra, { title: 'Đổi trả trên ca', subtitle: 'Hàng đi đâu: nhập lại kho bán (cộng tồn) hoặc loại bỏ/vứt (không cộng, đã trừ lúc bán).', productTitle: 'Hàng khách trả trên hóa đơn' })}`;
  };

  const fullLedger = (kind, report) => {
    const visuals = ui();
    const lines = report.lines || [];
    const value = report.loiNhuanKeToan != null ? money(report.loiNhuanKeToan)
      : report.tong != null ? money(report.tong)
      : (report.canDoi ? 'Cân' : '—');
    return `${periodTitle(report.period, KIND_META[kind]?.short || 'Sổ cái')}
      ${visuals.kpiGrid([{ icon: 'i-report', label: KIND_META[kind]?.label || kind, value, hint: report.chuThich || report.nguon || '' }], 'primary')}
      <article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>SỔ CÁI</p><h2>Dòng báo cáo đã nộp</h2></div><span class="report-card-count">${lines.length}</span></div>
        <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>#</th><th>CHỈ TIÊU</th><th>SỐ TIỀN</th></tr></thead>
        <tbody>${lines.length ? lines.map(row => `<tr><td>${esc(row.id)}</td><td>${esc(row.label)}</td><td class="num">${money(row.amount)}</td></tr>`).join('') : '<tr><td colspan="3" class="warehouse-empty">Không có dòng sổ cái.</td></tr>'}</tbody></table></div></article>`;
  };

  const fullReportHtml = (kind, report = {}) => {
    const body = kind === 'KT_NOI_BO' ? fullFinancial(report)
      : kind === 'MH_DON_MUA' ? fullPurchasing(report)
      : kind === 'TN_BAN_HANG' ? fullSales(report)
      : fullLedger(kind, report);
    const actor = kind === 'MH_DON_MUA' ? 'Mua hàng' : kind === 'TN_BAN_HANG' ? 'Thu ngân' : 'Kế toán';
    return `<section class="dept-full-report" data-report-actor="${esc(actor)}">
      <p class="dept-snapshot-ribbon">Đúng các khối bộ phận đã thấy sau khi <strong>Lập báo cáo</strong> — số đã khóa lúc gửi, không lấy lại số live.</p>
      ${body}
    </section>`;
  };

  const snapshotHtml = (kind, report, header = {}) => {
    const headerHtml = header.headerHtml || header.banner || '';
    const footerHtml = header.footerHtml || '';
    return `${headerHtml}${fullReportHtml(kind, report || {})}${footerHtml}`;
  };

  const detailHero = (header = {}, report = {}) => {
    const kind = header.LoaiBaoCao;
    const meta = KIND_META[kind] || {};
    const period = report.period || {};
    const status = header.TrangThai || 'Đã gửi';
    const note = cleanNote(header.GhiChu);
    return `<article class="dept-report-hero">
      <div class="dept-report-hero-main">
        <p>BẢN NỘP · ${esc((deptOf(header) || 'BỘ PHẬN').toUpperCase())}</p>
        <div class="dept-report-hero-title"><h2>${esc(header.MaBC || '—')}</h2>${statusBadge(status)}</div>
        <strong>${esc(meta.label || kind || 'Báo cáo bộ phận')}</strong>
        <span>${esc(period.label || period.period || header.NhanKy || header.GiaTriKy || '—')} · ${esc(fmtDate(period.from) || period.from || '—')} → ${esc(fmtDate(period.to) || period.to || '—')}</span>
      </div>
      <dl class="dept-report-hero-meta">
        <div><dt>Người lập</dt><dd>${esc(header.TenNV_Lap || '—')}<small>${esc([header.MaNV_Lap, deptOf(header)].filter(Boolean).join(' · ') || '—')}</small></dd></div>
        <div><dt>Ngày nộp</dt><dd>${esc(fmtDateTime(header.NgayNop) || '—')}<small>Phiên ${esc(header.SoPhien || 1)}</small></dd></div>
        ${note ? `<div><dt>Ghi chú gửi kèm</dt><dd>${esc(note)}</dd></div>` : ''}
      </dl>
    </article>`;
  };

  const versionLine = (versions = []) => {
    if (!versions.length) return '';
    return `<div class="dept-version-row"><span>Lịch sử phiên</span><div>${versions.map(item =>
      `<button type="button" class="report-version-link" data-open-version="${esc(item.MaBC)}">${esc(item.MaBC)} · v${esc(item.SoPhien)}</button>`
    ).join('')}</div></div>`;
  };

  const feedbackCard = (header = {}) => `<article class="dept-feedback-card">
      ${header.PhanHoiQL ? `<div class="dept-feedback-sent"><p>ĐÃ PHẢN HỒI</p><span>${esc(header.PhanHoiQL)}</span></div>` : ''}
      <form class="report-feedback-form" id="deptFeedbackForm">
        <div class="warehouse-panel-title"><div><p>PHẢN HỒI QUẢN LÝ</p><h2>Gửi người lập — không phải duyệt</h2></div></div>
        <label><span>Nội dung cần giải trình</span>
          <textarea name="note" maxlength="500" rows="3" placeholder="Ví dụ: giải thích chênh lệch phiếu thu ngày 08."></textarea></label>
        <div class="dept-feedback-actions">
          <p>Người lập sẽ thấy trạng thái <strong>Cần phản hồi</strong>. Trợ lý / Telegram không duyệt hộ.</p>
          <button type="submit" class="warehouse-primary">Gửi phản hồi</button>
        </div>
      </form>
    </article>`;

  const compareTable = (rows = []) => {
    if (!rows.length) return '';
    return `<details class="report-compare-card warehouse-table-card is-secondary" open>
      <summary class="warehouse-panel-title"><div><p>ĐỐI CHIẾU PHỤ</p><h2>Bản nộp và số hiện tại</h2></div><span class="report-card-count">${rows.length} chỉ số</span></summary>
      <p class="report-compare-note">Cột <strong>Hiện tại</strong> lấy lúc bạn mở trang — chỉ để thấy số live đã đổi sau khi nộp. Báo cáo đầy đủ nằm bên dưới.</p>
      <div class="warehouse-table-wrap"><table class="warehouse-table report-compare-table"><thead><tr><th>CHỈ SỐ</th><th>BẢN NỘP</th><th>HIỆN TẠI</th><th>CHÊNH LỆCH</th></tr></thead>
      <tbody>${rows.map(row => {
        const fmt = row.money ? money : qty;
        const delta = row.delta;
        const cls = delta == null ? 'is-flat' : (delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat');
        const deltaText = delta == null ? '—' : `${delta > 0 ? '+' : ''}${fmt(delta)}`;
        return `<tr><td>${esc(row.label)}</td><td class="num">${fmt(row.submitted)}</td><td class="num">${row.live == null ? '—' : fmt(row.live)}</td>
          <td class="num"><span class="report-delta ${cls}">${deltaText}</span></td></tr>`;
      }).join('')}</tbody></table></div>
    </details>`;
  };

  const buildPrintConfig = (kind, report, meta = {}) => {
    const period = report.period || {};
    const title = (KIND_META[kind] || {}).label || 'Báo cáo bộ phận';
    const number = meta.number || period.period;
    const fields = [
      { label: 'Loại kỳ', value: period.periodType || '—' },
      { label: 'Kỳ báo cáo', value: period.label || period.period || '—' },
      { label: 'Từ ngày', value: period.from },
      { label: 'Đến ngày', value: period.to },
      { label: 'Người lập', value: meta.preparedBy || '—' },
      { label: 'Phân loại', value: 'Báo cáo bộ phận (nội bộ)' }
    ];
    if (kind === 'MH_DON_MUA') {
      const s = report.summary || {};
      return {
        variant: 'report', orientation: 'landscape', title: title.toUpperCase(), number,
        documentDate: meta.issuedAt || new Date(), status: period.label,
        fields,
        columns: [{ label: 'Mã NCC', key: 'MaNCC' }, { label: 'Nhà cung cấp', key: 'TenNCC' }, { label: 'Số đơn', key: 'SoDon', align: 'right' }, { label: 'Giá trị', key: 'GiaTri', format: 'money', align: 'right' }],
        rows: report.suppliers || [],
        summary: [
          { label: 'Đơn mua hợp lệ', value: s.SoDonMua },
          { label: 'Giá trị đơn mua', value: s.GiaTriDonMua, format: 'money' },
          { label: 'Phiếu nhập', value: s.SoPhieuNhap },
          { label: 'SL còn thiếu', value: s.SLConThieu }
        ],
        note: meta.note || 'Bản nộp bộ phận Mua hàng. Không phải Báo cáo cửa hàng. PDF lấy từ snapshot.',
        signatures: ['Nhân viên mua hàng', 'Quản lý cửa hàng']
      };
    }
    if (kind === 'TN_BAN_HANG') {
      const s = report.sales || {};
      const m = report.methods || {};
      return {
        variant: 'report', orientation: 'landscape', title: title.toUpperCase(), number,
        documentDate: meta.issuedAt || new Date(), status: period.label,
        fields,
        columns: [{ label: 'Ca', key: 'MaCa' }, { label: 'Hóa đơn', key: 'SoHoaDon', align: 'right' }, { label: 'Doanh thu', key: 'DoanhThu', format: 'money', align: 'right' }, { label: 'Hoàn', key: 'TienHoan', format: 'money', align: 'right' }, { label: 'Trạng thái', key: 'TrangThai' }],
        rows: report.shifts || [],
        summary: [
          { label: 'Hóa đơn', value: s.SoHoaDon },
          { label: 'Doanh thu hóa đơn', value: s.DoanhThuHoaDon, format: 'money' },
          { label: 'Tiền hoàn', value: s.TienHoan, format: 'money' },
          { label: 'Tiền mặt', value: m.TienMat, format: 'money' }
        ],
        note: meta.note || 'Chỉ số của thu ngân đã gửi. Không gồm doanh thu thu ngân khác.',
        signatures: ['Thu ngân lập báo cáo', 'Quản lý cửa hàng']
      };
    }
    const s = report.sales || {};
    const f = report.finance || {};
    return {
      variant: 'report', orientation: 'landscape', title: title.toUpperCase(), number,
      documentDate: meta.issuedAt || new Date(), status: period.label,
      fields,
      columns: kind === 'KT_NOI_BO'
        ? [{ label: 'Ngày', value: row => fmtDate(row.Ngay) }, { label: 'Hóa đơn', key: 'SoHoaDon', align: 'right' }, { label: 'DT thuần', key: 'DoanhThuThuan', format: 'money', align: 'right' }, { label: 'Lãi gộp', key: 'LoiNhuanGop', format: 'money', align: 'right' }]
        : [{ label: '#', key: 'id' }, { label: 'Chỉ tiêu', key: 'label' }, { label: 'Số tiền', key: 'amount', format: 'money', align: 'right' }],
      rows: kind === 'KT_NOI_BO' ? (report.daily || []) : (report.lines || []),
      summary: kind === 'KT_NOI_BO'
        ? [
          { label: 'Doanh thu thuần', value: s.DoanhThuThuan, format: 'money' },
          { label: 'Lãi gộp', value: s.LoiNhuanGop, format: 'money' },
          { label: 'Phiếu thu thực nộp', value: f.PhieuThuThucNop, format: 'money' },
          { label: 'Công nợ còn lại', value: f.CongNoConLai, format: 'money' }
        ]
        : [{ label: 'Tổng / LN', value: report.loiNhuanKeToan ?? report.tong ?? 0, format: 'money' }],
      note: meta.note || 'Bản nộp bộ phận Kế toán từ snapshot. Không duyệt trên bản in.',
      signatures: ['Kế toán lập báo cáo', 'Quản lý cửa hàng']
    };
  };

  window.FLY_DEPARTMENT_REPORT = {
    KIND_META,
    DEPT_LABEL,
    currentMonth,
    followupButtons,
    idleHtml,
    dueBanner,
    submittedStrip,
    bindSubmittedStrip,
    openSubmitModal,
    bindDepartmentReportActions,
    mountDueAndStrip,
    snapshotHtml,
    fullReportHtml,
    detailHero,
    versionLine,
    feedbackCard,
    compareTable,
    statusBadge,
    buildPrintConfig,
    collectClientWarnings,
    money,
    esc,
    fmtDate,
    fmtDateTime
  };
})();
