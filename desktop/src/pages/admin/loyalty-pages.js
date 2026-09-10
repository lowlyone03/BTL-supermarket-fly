(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'manager-loyalty': '<section class="warehouse-page loyalty-page"><div class="loyalty-loading" role="status">Đang tải phân khúc khách thành viên…</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const money = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0))} đ`;
  const fmtDate = value => {
    if (window.FLY_VI_DATE?.formatDateVN) return window.FLY_VI_DATE.formatDateVN(value);
    const exact = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return exact ? `${exact[3]}/${exact[2]}/${exact[1]}` : (value ? String(value).slice(0, 10) : '—');
  };
  const api = async (context, path) => {
    const response = await fetch(`${context.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${context.token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Lỗi ${response.status}`);
    return data;
  };
  const segClass = name => {
    if (name === 'Giá trị cao') return 'loyalty-pill loyalty-pill-vip';
    if (name === 'Thân thiết') return 'loyalty-pill loyalty-pill-loyal';
    if (name === 'Nguy cơ rời bỏ' || name === 'Ngủ đông') return 'loyalty-pill loyalty-pill-risk';
    if (name === 'Mới') return 'loyalty-pill loyalty-pill-new';
    return 'loyalty-pill';
  };
  const avatar = name => {
    if (window.FLY_UI?.avatar) return window.FLY_UI.avatar(name, 'loyalty-avatar');
    const letter = String(name || '?').trim().charAt(0).toLocaleUpperCase('vi-VN') || '?';
    return `<span class="fly-avatar loyalty-avatar">${esc(letter)}</span>`;
  };
  const RFM_TIP = {
    R: 'R (Recency): lần mua gần nhất — 5 = mới mua, 1 = lâu rồi',
    F: 'F (Frequency): số lần mua — 5 = thường xuyên, 1 = ít mua',
    M: 'M (Monetary): tổng chi — 5 = chi nhiều, 1 = chi ít'
  };
  const rfmChip = (key, value, label) =>
    `<span class="loyalty-rfm-chip" title="${esc(RFM_TIP[key])}"><b>${esc(key)}${esc(value)}</b><small>${esc(label)}</small></span>`;
  const rfmBadges = row => `<div class="loyalty-rfm" title="${esc(`${RFM_TIP.R}. ${RFM_TIP.F}. ${RFM_TIP.M}`)}">${
    rfmChip('R', row.R, 'Gần đây')}${rfmChip('F', row.F, 'Thường xuyên')}${rfmChip('M', row.M, 'Chi nhiều')
  }</div>`;
  const daysAway = row => {
    const days = Number(row.RecencyNgay);
    if (!Number.isFinite(days)) return 'Chưa có lần mua';
    if (days <= 0) return 'Mua hôm nay';
    return `${days.toLocaleString('vi-VN')} ngày chưa mua`;
  };
  const winbackHint = row => {
    const amount = Number(row.GoiY?.voucherVnd || 20000);
    return `Win-back ${amount.toLocaleString('vi-VN')} đ`;
  };
  const emptyBox = (title, detail) => `<div class="loyalty-empty"><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>`;
  const currentMonth = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit'
  }).format(new Date());

  const initLoyalty = async (root, context) => {
    const now = currentMonth();
    const periodHtml = window.FLY_VI_DATE?.monthField
      ? window.FLY_VI_DATE.monthField('loyMonth', now)
      : `<input id="loyMonth" type="month" value="${esc(now)}" data-keep-native>`;
    root.innerHTML = `
      <header class="loyalty-header">
        <div class="loyalty-header-copy">
          <p class="loyalty-kicker">Quản lý · UC10</p>
          <h1>Khách hàng thân thiết — RFM</h1>
          <p class="loyalty-lead">Phân khúc theo hóa đơn hoàn thành và điểm thành viên. Gợi ý ưu đãi theo chính sách cửa hàng.</p>
        </div>
        <div class="loyalty-period">
          <span>Tháng / năm</span>
          ${periodHtml}
        </div>
      </header>
      <div class="loyalty-kpis" id="loyKpis"></div>
      <div class="loyalty-grid">
        <article class="loyalty-panel">
          <div class="loyalty-panel-head">
            <div>
              <strong>Phân khúc</strong>
              <p>Khách thành viên theo lần mua gần nhất, số lần mua và tổng chi</p>
            </div>
            <div class="loyalty-head-tools">
              <p class="loyalty-legend">R = lần mua gần nhất · F = số lần mua · M = tổng chi. 1 = thấp, 5 = cao.</p>
              <label class="loyalty-search">
                <svg aria-hidden="true"><use href="#i-search"/></svg>
                <input id="loySearch" type="search" placeholder="Tìm tên hoặc mã khách…">
              </label>
            </div>
          </div>
          <div class="loyalty-table-wrap" id="loyTable">${emptyBox('Đang tải', 'Vui lòng chờ danh sách phân khúc.')}</div>
        </article>
        <article class="loyalty-panel loyalty-risk-panel">
          <div class="loyalty-panel-head">
            <div>
              <strong>Khách có nguy cơ rời</strong>
              <p>Ngủ đông và khách ít quay lại</p>
            </div>
          </div>
          <div class="loyalty-risk-list" id="loyRisk">${emptyBox('Đang tải', 'Vui lòng chờ danh sách at-risk.')}</div>
        </article>
      </div>`;
    window.FLY_VI_DATE?.mount?.(root);

    const paint = (data, search = '') => {
      const kpi = data.kpi || {};
      const summary = data.summary || {};
      const segs = summary.segments || {};
      const policy = data.policy || {};
      const vipMax = policy.vipMaxPercent ?? 10;
      const winback = Number(policy.winBackVoucherVnd || 20000).toLocaleString('vi-VN');
      const multiplier = policy.newMemberPointMultiplier ?? 2;
      root.querySelector('#loyKpis').innerHTML = [
        ['Khách thành viên', summary.soKhach || 0, 'Có hồ sơ điểm', ''],
        ['Hóa đơn tháng này', kpi.SoHoaDonThanhVien || 0, kpi.label || 'Hóa đơn hoàn thành', 'is-invoice'],
        ['Doanh thu thành viên', money(kpi.DoanhThuThanhVien), 'Hóa đơn hoàn thành', 'is-money'],
        ['Có nguy cơ rời', summary.atRisk || 0, `Win-back ${winback} đ`, 'is-risk'],
        ['Giá trị cao', segs['Giá trị cao'] || 0, `VIP tối đa ${vipMax}%`, 'is-vip'],
        ['Mới', segs['Mới'] || 0, `×${multiplier} điểm`, 'is-new']
      ].map(([label, value, hint, tone]) => `<article class="loyalty-kpi ${tone}"><span class="loyalty-kpi-label"><i class="loyalty-dot"></i>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></article>`).join('');

      const q = search.trim().toLowerCase();
      const rows = (data.segments || []).filter(row => !q || `${row.TenKH} ${row.MaKH}`.toLowerCase().includes(q));
      if (!rows.length) {
        root.querySelector('#loyTable').innerHTML = emptyBox('Không có khách phù hợp', q ? 'Thử đổi từ khóa tìm kiếm.' : 'Chưa có khách thành viên trong kỳ này.');
      } else {
        const body = rows.map(row => `<tr>
          <td><div class="loyalty-cust">${avatar(row.TenKH)}<div><strong>${esc(row.TenKH)}</strong><small>${esc(row.MaKH)}</small></div></div></td>
          <td>${rfmBadges(row)}</td>
          <td class="is-num">${esc(money(row.TongChiTieu))}</td>
          <td class="is-date">${esc(fmtDate(row.LanMuaGanNhat))}</td>
          <td><span class="${segClass(row.Segment)}">${esc(row.Segment)}</span></td>
        </tr>`).join('');
        root.querySelector('#loyTable').innerHTML = `<table class="loyalty-table"><thead><tr>
          <th>Khách</th><th>Mức gắn bó</th><th class="is-num">Chi tiêu</th><th>Mua gần</th><th>Phân khúc</th>
        </tr></thead><tbody>${body}</tbody></table>
        <p class="loyalty-table-note">R = lần mua gần nhất · F = số lần mua · M = tổng chi. 1 = thấp, 5 = cao.</p>`;
      }

      const risk = data.atRisk || [];
      if (!risk.length) {
        root.querySelector('#loyRisk').innerHTML = emptyBox('Không có khách at-risk', 'Chưa có khách ngủ đông hoặc nguy cơ rời bỏ.');
        return;
      }
      root.querySelector('#loyRisk').innerHTML = `<ul>${risk.map(row => `<li class="loyalty-risk-item">
        ${avatar(row.TenKH)}
        <div class="loyalty-risk-copy">
          <strong>${esc(row.TenKH)}</strong>
          <div class="loyalty-risk-meta">${rfmBadges(row)}<small>${esc(daysAway(row))}</small></div>
        </div>
        <span class="loyalty-hint">${esc(winbackHint(row))}</span>
      </li>`).join('')}</ul>`;
    };

    const reload = async () => {
      const month = root.querySelector('#loyMonth').value;
      const data = await api(context, `/admin/loyalty/overview?month=${encodeURIComponent(month)}`);
      paint(data, root.querySelector('#loySearch').value);
      root._loyData = data;
    };
    root.querySelector('#loyMonth').addEventListener('change', () => {
      reload().catch(error => {
        root.querySelector('#loyTable').innerHTML = emptyBox('Không tải được RFM', error.message);
        root.querySelector('#loyRisk').innerHTML = emptyBox('Không tải được RFM', error.message);
      });
    });
    root.querySelector('#loySearch').addEventListener('input', () => {
      if (root._loyData) paint(root._loyData, root.querySelector('#loySearch').value);
    });
    await reload();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'manager-loyalty') {
        const root = document.querySelector('.loyalty-page') || document.querySelector('.warehouse-page');
        try { await initLoyalty(root, context); }
        catch (error) {
          root.innerHTML = `<div class="loyalty-empty loyalty-empty-error"><strong>Không tải được RFM</strong><small>${esc(error.message)}</small></div>`;
        }
        return;
      }
      return previous?.init?.(pageName, context);
    }
  };
})();
