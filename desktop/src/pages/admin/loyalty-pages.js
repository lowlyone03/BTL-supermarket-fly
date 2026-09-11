(() => {
  const previous = window.FLY_ROLE_PAGES;
  const t = (key, vars) => window.FLY_I18N?.t(key, vars) || key;
  const templates = {
    'manager-loyalty': '<section class="warehouse-page loyalty-page"><div class="loyalty-loading" role="status"></div></section>'
  };
  const DEFAULT_POLICY = {
    vipEnabled: true,
    vipMaxPercent: 10,
    winBackEnabled: true,
    winBackVoucherVnd: 20000,
    newMemberEnabled: true,
    newMemberPointMultiplier: 2
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const money = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0))} đ`;
  const fmtDate = value => {
    if (window.FLY_VI_DATE?.formatDateVN) return window.FLY_VI_DATE.formatDateVN(value);
    const exact = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return exact ? `${exact[3]}/${exact[2]}/${exact[1]}` : (value ? String(value).slice(0, 10) : '—');
  };
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
    if (!response.ok) throw new Error(data.message || `Lỗi ${response.status}`);
    return data;
  };
  const segClass = name => {
    if (name === 'Giá trị cao') return 'loyalty-pill loyalty-pill-vip';
    if (name === 'Thân thiết') return 'loyalty-pill loyalty-pill-loyal';
    if (name === 'Nguy cơ rời bỏ' || name === 'Ngủ đông') return 'loyalty-pill loyalty-pill-risk';
    if (name === 'Mới') return 'loyalty-pill loyalty-pill-new';
    if (name === 'Chưa phát sinh') return 'loyalty-pill loyalty-pill-idle';
    return 'loyalty-pill';
  };
  const avatar = name => {
    if (window.FLY_UI?.avatar) return window.FLY_UI.avatar(name, 'loyalty-avatar');
    const letter = String(name || '?').trim().charAt(0).toLocaleUpperCase('vi-VN') || '?';
    return `<span class="fly-avatar loyalty-avatar">${esc(letter)}</span>`;
  };
  const RFM_TIP = () => ({
    R: t('loyalty.tipR'),
    F: t('loyalty.tipF'),
    M: t('loyalty.tipM')
  });
  const rfmChip = (key, value, label) =>
    `<span class="loyalty-rfm-chip" title="${esc(RFM_TIP()[key])}"><b>${esc(key)}${esc(value)}</b><small>${esc(label)}</small></span>`;
  const rfmBadges = row => `<div class="loyalty-rfm" title="${esc(`${RFM_TIP().R}. ${RFM_TIP().F}. ${RFM_TIP().M}`)}">${
    rfmChip('R', row.R, t('loyalty.rNear'))}${rfmChip('F', row.F, t('loyalty.fOften'))}${rfmChip('M', row.M, t('loyalty.mSpend'))
  }</div>`;
  const looksNeverBought = row => row.chuaTungMua === true
    || row.Segment === 'Chưa phát sinh'
    || (!row.LanMuaGanNhat && Number(row.SoHoaDon || 0) === 0 && Number(row.TongChiTieu || 0) === 0);
  const daysAway = row => {
    if (looksNeverBought(row)) return t('loyalty.never');
    const raw = row.soNgayChuaMua ?? row.RecencyNgay;
    if (raw == null || raw === '') {
      return row.LanMuaGanNhat ? t('loyalty.days365') : t('loyalty.never');
    }
    const days = Number(raw);
    if (!Number.isFinite(days) || days === 999) return row.LanMuaGanNhat ? t('loyalty.days365') : t('loyalty.never');
    if (days <= 0) return t('loyalty.boughtToday');
    return t('loyalty.daysAway', { n: days.toLocaleString('vi-VN') });
  };
  const offerOf = row => row?.GoiY || {};
  const offerTone = row => {
    const category = offerOf(row).category;
    if (looksNeverBought(row) || !category) return 'is-idle';
    if (category === 'VIP') return 'is-vip';
    if (category === 'win-back') return 'is-win';
    if (category === 'mới') return 'is-new';
    return 'is-idle';
  };
  const offerLabel = row => offerOf(row).shortLabel || offerOf(row).label || 'Không gợi ý';
  const offerBlock = row => `<div class="loyalty-offer">
        <span class="loyalty-hint ${offerTone(row)}">${esc(offerLabel(row))}</span>
        <button type="button" class="loyalty-offer-detail" data-makh-detail="${esc(row.MaKH)}">Chi tiết gợi ý</button>
      </div>`;
  const riskItem = row => `<li class="loyalty-risk-item">
        ${avatar(row.TenKH)}
        <div class="loyalty-risk-copy">
          <strong>${esc(row.TenKH)}</strong>
          <div class="loyalty-risk-meta">${rfmBadges(row)}<small>${esc(daysAway(row))}</small></div>
        </div>
        ${offerBlock(row)}
      </li>`;
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
          <p class="loyalty-kicker">${t('loyalty.kicker')}</p>
          <h1>${t('loyalty.title')}</h1>
          <p class="loyalty-lead">
            <span>Phân khúc theo hóa đơn hoàn thành.</span>
            <span>Gợi ý chỉ trong chính sách cửa hàng.</span>
            <a href="#loyPolicy" class="loyalty-policy-link" id="loyPolicyJump">Xem chính sách</a>
          </p>
        </div>
        <div class="loyalty-period">
          <span>${t('loyalty.month')}</span>
          ${periodHtml}
        </div>
      </header>
      <article class="loyalty-panel loyalty-policy-panel" id="loyPolicy">
        <div class="loyalty-panel-head">
          <div>
            <strong>Chính sách ưu đãi cửa hàng</strong>
            <p>Lưu xong có hiệu lực ngay. Thu ngân bấm Áp dụng mới trừ tiền. Tắt nhóm thì POS ẩn nút đó.</p>
          </div>
          <p class="loyalty-policy-status" id="loyPolicyStatus" role="status"></p>
        </div>
        <form class="loyalty-policy-form" id="loyPolicyForm">
          <div class="loyalty-policy-card is-vip">
            <label class="loyalty-policy-top" for="loyVipOn">
              <input id="loyVipOn" type="checkbox" checked>
              <b>VIP</b>
            </label>
            <span class="loyalty-policy-field">Giảm tối đa
              <input id="loyVipPct" type="number" min="1" max="20" step="1" value="10"> %
            </span>
          </div>
          <div class="loyalty-policy-card is-win">
            <label class="loyalty-policy-top" for="loyWinOn">
              <input id="loyWinOn" type="checkbox" checked>
              <b>Win-back</b>
            </label>
            <span class="loyalty-policy-field">Voucher
              <input id="loyWinAmt" type="number" min="1000" max="500000" step="1000" value="20000"> đ
            </span>
          </div>
          <div class="loyalty-policy-card is-new">
            <label class="loyalty-policy-top" for="loyNewOn">
              <input id="loyNewOn" type="checkbox" checked>
              <b>Khách mới</b>
            </label>
            <span class="loyalty-policy-field">Nhân
              <input id="loyNewMul" type="number" min="1" max="5" step="1" value="2"> điểm
            </span>
          </div>
          <div class="loyalty-policy-actions">
            <p class="loyalty-policy-note">Ba nhóm cố định. AI không bịa phần trăm. Không tự áp khi chỉ chọn khách.</p>
            <div class="loyalty-policy-btns">
              <button type="button" class="loyalty-btn is-ghost" id="loyReset">Khôi phục mặc định</button>
              <button type="submit" class="loyalty-btn" id="loySave">Lưu chính sách</button>
            </div>
          </div>
        </form>
      </article>
      <div class="loyalty-live" id="loyLive"></div>
      <div class="loyalty-kpis" id="loyKpis"></div>
      <div class="loyalty-grid">
        <article class="loyalty-panel">
          <div class="loyalty-panel-head">
            <div>
              <strong>${t('loyalty.segTitle')}</strong>
              <p>${t('loyalty.segLead')}</p>
            </div>
            <div class="loyalty-head-tools">
              <p class="loyalty-legend">${t('loyalty.legend')}</p>
              <label class="loyalty-search">
                <svg aria-hidden="true"><use href="#i-search"/></svg>
                <input id="loySearch" type="search" placeholder="${t('loyalty.searchPh')}">
              </label>
            </div>
          </div>
          <div class="loyalty-table-wrap" id="loyTable">${emptyBox(t('loyalty.loadBox'), t('loyalty.waitSeg'))}</div>
        </article>
        <article class="loyalty-panel loyalty-risk-panel">
          <div class="loyalty-panel-head">
            <div>
              <strong>${t('loyalty.riskTitle')}</strong>
              <p>${t('loyalty.riskLead')}</p>
            </div>
          </div>
          <div class="loyalty-risk-list" id="loyRisk">${emptyBox(t('loyalty.loadBox'), t('loyalty.waitRisk'))}</div>
        </article>
      </div>
      <div class="loyalty-modal" id="loyModal" hidden>
        <div class="loyalty-modal-card" role="dialog" aria-modal="true" aria-labelledby="loyModalTitle">
          <header>
            <div>
              <p class="loyalty-kicker">Gợi ý ưu đãi</p>
              <strong id="loyModalTitle">Chi tiết gợi ý</strong>
            </div>
            <button type="button" class="loyalty-btn is-ghost" id="loyModalClose">Đóng</button>
          </header>
          <div id="loyModalBody"></div>
        </div>
      </div>`;
    window.FLY_VI_DATE?.mount?.(root);

    const setStatus = (text, tone = '') => {
      const node = root.querySelector('#loyPolicyStatus');
      if (!node) return;
      node.textContent = text || '';
      node.className = `loyalty-policy-status${tone ? ` ${tone}` : ''}`;
    };
    const syncToggles = () => {
      root.querySelector('#loyVipPct').disabled = !root.querySelector('#loyVipOn').checked;
      root.querySelector('#loyWinAmt').disabled = !root.querySelector('#loyWinOn').checked;
      root.querySelector('#loyNewMul').disabled = !root.querySelector('#loyNewOn').checked;
    };
    const fillPolicy = (policy = {}) => {
      root.querySelector('#loyVipOn').checked = policy.vipEnabled !== false;
      root.querySelector('#loyVipPct').value = policy.vipMaxPercent ?? 10;
      root.querySelector('#loyWinOn').checked = policy.winBackEnabled !== false;
      root.querySelector('#loyWinAmt').value = policy.winBackVoucherVnd ?? 20000;
      root.querySelector('#loyNewOn').checked = policy.newMemberEnabled !== false;
      root.querySelector('#loyNewMul').value = policy.newMemberPointMultiplier ?? 2;
      syncToggles();
    };
    const readPolicyForm = () => ({
      vipEnabled: root.querySelector('#loyVipOn').checked,
      vipMaxPercent: Number(root.querySelector('#loyVipPct').value),
      winBackEnabled: root.querySelector('#loyWinOn').checked,
      winBackVoucherVnd: Number(root.querySelector('#loyWinAmt').value),
      newMemberEnabled: root.querySelector('#loyNewOn').checked,
      newMemberPointMultiplier: Number(root.querySelector('#loyNewMul').value)
    });
    const findRow = maKH => {
      const data = root._loyData || {};
      return (data.segments || []).find(row => row.MaKH === maKH)
        || (data.atRisk || []).find(row => row.MaKH === maKH)
        || (data.chuaPhatSinh || []).find(row => row.MaKH === maKH);
    };
    const closeDetail = () => {
      const modal = root.querySelector('#loyModal');
      if (modal) modal.hidden = true;
    };
    const openPolicy = () => {
      const panel = root.querySelector('#loyPolicy');
      panel?.classList.add('is-focus');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => panel?.classList.remove('is-focus'), 1600);
      root.querySelector('#loyVipPct')?.focus();
    };
    const openDetail = maKH => {
      const row = findRow(maKH);
      const modal = root.querySelector('#loyModal');
      const body = root.querySelector('#loyModalBody');
      const title = root.querySelector('#loyModalTitle');
      if (!row || !modal || !body) return;
      const offer = offerOf(row);
      const policy = root._loyData?.policy || {};
      title.textContent = row.TenKH || 'Chi tiết gợi ý';
      body.innerHTML = `
        <p class="loyalty-modal-who"><small>${esc(row.MaKH)}</small><span class="${segClass(row.Segment)}">${esc(row.Segment)}</span></p>
        <div class="loyalty-modal-rfm">${rfmBadges(row)}</div>
        <dl class="loyalty-modal-dl">
          <div><dt>Lần mua gần</dt><dd>${esc(looksNeverBought(row) ? 'Chưa từng mua' : fmtDate(row.LanMuaGanNhat))}</dd></div>
          <div><dt>Số hóa đơn hoàn thành</dt><dd>${esc(row.SoHoaDon ?? 0)}</dd></div>
          <div><dt>Tổng chi</dt><dd>${esc(money(row.TongChiTieu))}</dd></div>
          <div><dt>Gợi ý</dt><dd>${esc(offer.shortLabel || offer.label || 'Không gợi ý')}</dd></div>
        </dl>
        <article class="loyalty-modal-box">
          <strong>Lý do RFM</strong>
          <p>${esc(offer.rfmLyDo || 'Phân khúc theo hóa đơn hoàn thành.')}</p>
        </article>
        <article class="loyalty-modal-box">
          <strong>Chính sách đang áp dụng</strong>
          <p>${esc(offer.chinhSach || 'Chỉ ba nhóm VIP / win-back / khách mới.')}</p>
          <p class="loyalty-modal-policy">VIP tối đa ${esc(policy.vipEnabled === false ? 'tắt' : `${policy.vipMaxPercent ?? 10}%`)} · Win-back ${esc(policy.winBackEnabled === false ? 'tắt' : money(policy.winBackVoucherVnd || 20000))} · Khách mới ${esc(policy.newMemberEnabled === false ? 'tắt' : `×${policy.newMemberPointMultiplier ?? 2} điểm`)}</p>
        </article>
        <p class="loyalty-modal-note">${esc(offer.camKet || 'Chỉ gợi ý nội bộ. Hệ thống không tự gắn khuyến mãi lên POS.')}</p>`;
      modal.hidden = false;
    };

    const paint = (data, search = '', opts = {}) => {
      const kpi = data.kpi || {};
      const summary = data.summary || {};
      const segs = summary.segments || {};
      const policy = data.policy || {};
      if (opts.syncForm) fillPolicy(policy);
      const live = data.homNayAp || {};
      const hieuLuc = data.hieuLuc || {};
      const liveNode = root.querySelector('#loyLive');
      if (liveNode) {
        liveNode.innerHTML = `
          <article class="loyalty-live-card">
            <strong>Hôm nay đã áp</strong>
            <p>${esc(live.soHd || 0)} HĐ / ${esc(money(live.tongTienGiam || 0))} giảm / ${esc(live.diemNhan || 0)} điểm nhân</p>
          </article>
          <article class="loyalty-live-card is-count">
            <strong>Khách theo chính sách đang lưu</strong>
            <p>${esc(hieuLuc.vip || 0)} VIP · ${esc(hieuLuc.winBack || 0)} win-back · ${esc(hieuLuc.moi || 0)} mới</p>
          </article>`;
      }
      const vipMax = policy.vipEnabled === false ? 'tắt' : `VIP tối đa ${policy.vipMaxPercent ?? 10}%`;
      const winback = policy.winBackEnabled === false ? 'tắt' : `Win-back ${Number(policy.winBackVoucherVnd || 20000).toLocaleString('vi-VN')} đ`;
      const multiplier = policy.newMemberEnabled === false ? 'tắt' : `×${policy.newMemberPointMultiplier ?? 2} điểm`;
      root.querySelector('#loyKpis').innerHTML = [
        [t('loyalty.kpiMembers'), summary.soKhach || 0, t('loyalty.kpiMembersHint'), ''],
        [t('loyalty.kpiInvoices'), kpi.SoHoaDonThanhVien || 0, kpi.label || t('loyalty.kpiDone'), 'is-invoice'],
        [t('loyalty.kpiRev'), money(kpi.DoanhThuThanhVien), t('loyalty.kpiDone'), 'is-money'],
        [t('loyalty.kpiRisk'), summary.atRisk || 0, winback, 'is-risk'],
        [t('loyalty.kpiVip'), segs['Giá trị cao'] || 0, vipMax, 'is-vip'],
        [t('loyalty.kpiNew'), segs['Mới'] || 0, multiplier, 'is-new']
      ].map(([label, value, hint, tone]) => `<article class="loyalty-kpi ${tone}"><span class="loyalty-kpi-label"><i class="loyalty-dot"></i>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></article>`).join('');

      const q = search.trim().toLowerCase();
      const rows = (data.segments || []).filter(row => !q || `${row.TenKH} ${row.MaKH}`.toLowerCase().includes(q));
      if (!rows.length) {
        root.querySelector('#loyTable').innerHTML = emptyBox(t('loyalty.noMatch'), q ? t('loyalty.trySearch') : t('loyalty.noMember'));
      } else {
        const body = rows.map(row => `<tr>
          <td><div class="loyalty-cust">${avatar(row.TenKH)}<div><strong>${esc(row.TenKH)}</strong><small>${esc(row.MaKH)}</small></div></div></td>
          <td>${rfmBadges(row)}</td>
          <td class="is-num">${esc(money(row.TongChiTieu))}</td>
          <td class="is-date">${esc(looksNeverBought(row) ? t('loyalty.never') : fmtDate(row.LanMuaGanNhat))}</td>
          <td><span class="${segClass(row.Segment)}">${esc(row.Segment)}</span></td>
          <td>${offerBlock(row)}</td>
        </tr>`).join('');
        root.querySelector('#loyTable').innerHTML = `<table class="loyalty-table"><thead><tr>
          <th>${t('loyalty.colCust')}</th><th>${t('loyalty.colBond')}</th><th class="is-num">${t('loyalty.colSpend')}</th><th>${t('loyalty.colRecent')}</th><th>${t('loyalty.colSeg')}</th><th>${t('loyalty.colOffer')}</th>
        </tr></thead><tbody>${body}</tbody></table>
        <p class="loyalty-table-note">Gợi ý lấy đúng chính sách đã lưu. Không tự gắn khuyến mãi lên quầy thu ngân.</p>`;
      }

      const risk = (data.atRisk || []).filter(row => !looksNeverBought(row));
      const neverBought = Array.isArray(data.chuaPhatSinh)
        ? data.chuaPhatSinh
        : (data.segments || []).filter(looksNeverBought);
      if (!risk.length && !neverBought.length) {
        root.querySelector('#loyRisk').innerHTML = emptyBox(t('loyalty.noRisk'), t('loyalty.noSleep'));
        return;
      }
      const riskBlock = risk.length
        ? `<ul>${risk.map(riskItem).join('')}</ul>`
        : `<div class="loyalty-risk-note">${t('loyalty.noSleepBought')}</div>`;
      const neverBlock = neverBought.length
        ? `<div class="loyalty-risk-subhead"><strong>${t('loyalty.idleTitle')}</strong><p>${t('loyalty.idleLead')}</p></div><ul>${neverBought.map(riskItem).join('')}</ul>`
        : '';
      root.querySelector('#loyRisk').innerHTML = `${riskBlock}${neverBlock}`;
    };

    const reload = async () => {
      const month = root.querySelector('#loyMonth').value;
      const data = await api(context, `/admin/loyalty/overview?month=${encodeURIComponent(month)}`);
      paint(data, root.querySelector('#loySearch').value, { syncForm: true });
      root._loyData = data;
    };
    const savePolicy = async () => {
      setStatus('Đang lưu…');
      try {
        const saved = await api(context, '/admin/loyalty/policy', {
          method: 'PUT',
          body: { ...readPolicyForm(), month: root.querySelector('#loyMonth')?.value }
        });
        fillPolicy(saved.policy || readPolicyForm());
        const hieuLuc = saved.hieuLuc || {};
        setStatus(`Hiệu lực: ${hieuLuc.vip || 0} VIP · ${hieuLuc.winBack || 0} win-back · ${hieuLuc.moi || 0} mới.`, 'is-ok');
        context.showToast?.(saved.message || 'Chương trình đã có hiệu lực.', 'success');
        if (saved.overview) {
          paint(saved.overview, root.querySelector('#loySearch').value, { syncForm: true });
          root._loyData = saved.overview;
        } else {
          await reload();
        }
      } catch (error) {
        setStatus(error.message, 'is-err');
      }
    };

    root.querySelector('#loyMonth').addEventListener('change', () => {
      reload().catch(error => {
        root.querySelector('#loyTable').innerHTML = emptyBox(t('loyalty.fail'), error.message);
        root.querySelector('#loyRisk').innerHTML = emptyBox(t('loyalty.fail'), error.message);
      });
    });
    root.querySelector('#loySearch').addEventListener('input', () => {
      if (root._loyData) paint(root._loyData, root.querySelector('#loySearch').value);
    });
    root.querySelector('#loyPolicyForm').addEventListener('submit', event => {
      event.preventDefault();
      savePolicy();
    });
    root.querySelector('#loyVipOn').addEventListener('change', syncToggles);
    root.querySelector('#loyWinOn').addEventListener('change', syncToggles);
    root.querySelector('#loyNewOn').addEventListener('change', syncToggles);
    root.querySelector('#loyReset').addEventListener('click', () => {
      fillPolicy(DEFAULT_POLICY);
      setStatus('Đã điền mặc định 10% / 20.000 đ / ×2. Bấm Lưu chính sách để ghi máy chủ.');
    });
    root.querySelector('#loyPolicyJump').addEventListener('click', event => {
      event.preventDefault();
      openPolicy();
    });
    root.addEventListener('click', event => {
      const detail = event.target.closest('[data-makh-detail]');
      if (detail) {
        openDetail(detail.dataset.makhDetail);
        return;
      }
      if (event.target.id === 'loyModalClose' || event.target.id === 'loyModal') closeDetail();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeDetail();
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
          root.innerHTML = `<div class="loyalty-empty loyalty-empty-error"><strong>${t('loyalty.fail')}</strong><small>${esc(error.message)}</small></div>`;
        }
        return;
      }
      return previous?.init?.(pageName, context);
    }
  };
})();
