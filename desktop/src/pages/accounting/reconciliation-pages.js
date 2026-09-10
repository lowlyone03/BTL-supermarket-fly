(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'ledger-reconciliation': '<section class="warehouse-page ledger-page recon-page" data-keep-native><div class="lg-loading"><strong>Đang tải đối soát ngân hàng</strong>Vui lòng chờ...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const codesOf = user => Array.isArray(user?.Quyen) ? user.Quyen : [];
  const isManagerUser = user => String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN') === 'quản lý';
  const fmtDate = value => {
    if (window.FLY_VI_DATE?.formatDateVN) return window.FLY_VI_DATE.formatDateVN(value);
    const exact = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return exact ? `${exact[3]}/${exact[2]}/${exact[1]}` : (value ? String(value).slice(0, 10) : '—');
  };
  const api = async (context, path, options = {}) => {
    const isForm = options.body instanceof FormData;
    const response = await fetch(`${context.apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${context.token}`,
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Lỗi ${response.status}`);
    return data;
  };
  const catchUi = (context, fn) => async (...args) => {
    try { await fn(...args); } catch (error) { context.showToast(error.message, 'error'); }
  };
  const openHandbook = context => {
    try { sessionStorage.setItem('fly_hb_jump', 'hb-s19'); } catch { /* ignore */ }
    if (typeof context.navigate === 'function') context.navigate('ledger-handbook');
  };
  const badgeClass = status => {
    if (status === 'Khớp tự động' || status === 'Đã xác nhận') return 'recon-badge recon-badge-ok';
    if (status === 'Gợi ý') return 'recon-badge recon-badge-suggest';
    if (status === 'Chênh lệch') return 'recon-badge recon-badge-diff';
    if (status === 'Bỏ gợi ý') return 'recon-badge recon-badge-muted';
    if (status === 'Chưa khớp' || status === 'Chưa chạy') return 'recon-badge recon-badge-wait';
    return 'recon-badge recon-badge-muted';
  };
  const chips = text => String(text || '').split(/;\s*/).map(part => part.trim()).filter(Boolean)
    .map(part => `<span class="recon-chip">${esc(part)}</span>`).join('');
  const fileLabel = file => file ? file.name : 'Chưa chọn tệp CSV';

  const initQlSummary = async (root, context) => {
    root.innerHTML = `
      <header class="lg-header recon-header">
        <div>
          <p class="lg-kicker">Quản lý · Tóm tắt UC10</p>
          <h1>Đối soát ngân hàng thông minh</h1>
          <p class="lg-lead">Bạn xem số dòng còn chờ và tổng tiền chưa đối soát. Không xem từng dòng sao kê, không nhập CSV và không xác nhận khớp — việc đó thuộc Kế toán (UC42).</p>
        </div>
        <button type="button" class="lg-btn lg-btn-ghost" id="reconOpenHb">Mở cẩm nang · mục 19</button>
      </header>
      <div class="recon-stats recon-stats-ql" id="reconStats"></div>
      <article class="lg-card recon-ql-note">
        <h2>Vì sao chỉ có tóm tắt?</h2>
        <p class="lg-help">Theo plan AIS, Quản lý giám sát tiến độ đối soát (bao nhiêu dòng, bao nhiêu tiền), không đọc nội dung chuyển khoản. Chi tiết ứng viên, điểm khớp và nút xác nhận nằm ở tài khoản Kế toán.</p>
        <ul class="recon-note-list">
          <li>Sao kê ngân hàng được ghép với MoMo QR, phiếu chi NCC, chi lương chuyển khoản và bút toán TK 112.</li>
          <li>Engine tính điểm cố định — không phải chatbot quyết định khớp.</li>
          <li>Xác nhận đối soát không tự ghi sổ và không tự trả nhà cung cấp.</li>
        </ul>
        <div class="lg-actions" style="margin:16px 0 0;justify-content:flex-start">
          <button type="button" class="lg-btn lg-btn-primary" id="reconOpenHb2">Đọc cẩm nang đối soát</button>
        </div>
      </article>`;
    root.querySelectorAll('#reconOpenHb, #reconOpenHb2').forEach(btn => {
      btn.addEventListener('click', () => openHandbook(context));
    });
    const fill = pack => {
      const cards = [
        ['Chờ đối soát', pack.soDongChuaDoiSoat || 0, money(pack.tongTienChuaDoiSoat), 'Dòng chưa được Kế toán xác nhận'],
        ['Khớp tự động', pack.soDongAutoChoXacNhan || 0, 'Vẫn chờ Kế toán chốt', 'Điểm cao, chưa ghi sổ'],
        ['Gợi ý', pack.soDongGoiY || 0, 'Tiền và ngày gần khớp', 'Cần Kế toán xem ứng viên'],
        ['Chênh lệch', pack.soDongChenhLech || 0, 'Hai số khác nhau', 'Sao kê ≠ chứng từ'],
        ['Chưa khớp', pack.soDongChuaKhop || 0, 'Chưa có ứng viên', 'Phí NH, CK lạ…']
      ];
      root.querySelector('#reconStats').innerHTML = cards.map(([label, value, moneyHint, hint]) => `
        <article>
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
          <em>${esc(moneyHint)}</em>
          <small>${esc(hint)}</small>
        </article>`).join('');
    };
    try {
      fill(await api(context, '/admin/reconciliation/summary'));
    } catch (error) {
      fill({});
      context.showToast(error.message, 'error');
    }
  };

  const initRecon = async (root, context) => {
    let currentId = '';
    let selectedDong = '';
    let filter = '';
    let query = '';

    const renderShell = () => {
      root.innerHTML = `
        <header class="lg-header recon-header">
          <div>
            <p class="lg-kicker">Kế toán · Đối soát ngân hàng</p>
            <h1>Đối soát ngân hàng thông minh</h1>
            <p class="lg-lead">Ghép từng dòng sao kê với giao dịch MoMo QR, phiếu chi nhà cung cấp, chi lương chuyển khoản và bút toán TK 112. Engine chỉ tính điểm — Kế toán mới được xác nhận. Máy không tự ghi sổ.</p>
          </div>
          <button type="button" class="lg-btn lg-btn-ghost" id="reconOpenHb">Cẩm nang · mục 19</button>
        </header>
        <div class="recon-stats" id="reconStats"></div>
        <article class="lg-card recon-import">
          <div class="recon-import-head">
            <div>
              <h2>Nhập sao kê</h2>
              <p class="lg-help">Cột mẫu: Ngày, Số tiền, Nội dung, Mã tham chiếu. Dòng dương là tiền vào (MoMo / Nợ 112). Dòng âm là tiền ra (chi NCC hoặc lương).</p>
            </div>
          </div>
          <form id="reconCsv" class="recon-import-form" data-keep-native>
            <label class="recon-field">
              <span>Tài khoản ngân hàng</span>
              <input id="reconTk" placeholder="NH0001" maxlength="20" autocomplete="off">
            </label>
            <label class="recon-field recon-file-field">
              <span>Tệp sao kê CSV</span>
              <div class="recon-file-row">
                <input type="file" id="reconFile" accept=".csv,text/csv" required>
                <em id="reconFileName">Chưa chọn tệp CSV</em>
              </div>
            </label>
            <div class="recon-import-actions">
              <button class="lg-btn lg-btn-primary" type="submit">Nhập và chạy đối soát</button>
              <a class="lg-btn lg-btn-ghost" id="reconTpl" href="#">Tải mẫu CSV</a>
            </div>
          </form>
        </article>
        <article class="lg-card recon-work-card">
          <div class="recon-toolbar" data-keep-native>
            <label class="recon-field">
              <span>Sao kê đã nhập</span>
              <select id="reconPick"><option value="">Chọn sao kê…</option></select>
            </label>
            <label class="recon-field recon-field-grow">
              <span>Tìm dòng</span>
              <input id="reconSearch" placeholder="Nội dung, mã phiếu chi, mã giao dịch…" autocomplete="off">
            </label>
            <label class="recon-field">
              <span>Trạng thái</span>
              <select id="reconFilter">
                <option value="">Mọi trạng thái</option>
                <option>Khớp tự động</option>
                <option>Gợi ý</option>
                <option>Chênh lệch</option>
                <option>Chưa khớp</option>
                <option>Đã xác nhận</option>
              </select>
            </label>
            <div class="recon-toolbar-actions">
              <button class="lg-btn lg-btn-ghost" type="button" id="reconRun">Chạy lại engine</button>
              <button class="lg-btn lg-btn-primary" type="button" id="reconConfirmAuto">Xác nhận hàng loạt (khớp tự động)</button>
            </div>
          </div>
          <div class="recon-work">
            <div class="recon-table-wrap" id="reconTable"></div>
            <aside class="recon-detail" id="reconDetail"></aside>
          </div>
        </article>`;
    };

    const fillStats = counts => {
      const c = counts || {};
      const cards = [
        ['Tổng dòng', c.tong || 0, 'Sao kê đang mở', 'Mọi dòng đã nhập'],
        ['Chờ xác nhận', c.choXacNhan || 0, money(c.tongTienChuaXacNhan), 'Tiền chưa được Kế toán chốt'],
        ['Khớp tự động', c.auto || 0, 'Vẫn cần Kế toán chốt', 'Điểm cao, chưa ghi sổ'],
        ['Gợi ý', c.goiY || 0, 'Thường tiền + ngày', 'Xem ứng viên rồi xác nhận'],
        ['Chênh lệch', c.chenhLech || 0, 'Hiện hai số', 'Sao kê khác chứng từ'],
        ['Chưa khớp', c.chuaKhop || 0, 'Không có ứng viên', 'Phí ngân hàng, CK lạ…']
      ];
      root.querySelector('#reconStats').innerHTML = cards.map(([label, value, moneyHint, hint]) => `
        <article>
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
          <em>${esc(moneyHint)}</em>
          <small>${esc(hint)}</small>
        </article>`).join('');
    };

    const emptyTable = (title, detail) => `
      <div class="recon-empty">
        <span class="recon-empty-mark" aria-hidden="true">NH</span>
        <h3>${esc(title)}</h3>
        <p>${esc(detail)}</p>
      </div>`;

    const showDetail = (line, statement) => {
      const box = root.querySelector('#reconDetail');
      if (!line) {
        box.innerHTML = `
          <div class="recon-detail-empty">
            <p class="lg-kicker">Chi tiết dòng</p>
            <h2>Chọn một dòng sao kê</h2>
            <p>Ứng viên, lý do điểm (tiền / ngày / mã / NCC) và hai số khi chênh lệch hiện ở đây. Xác nhận không ghi sổ.</p>
          </div>`;
        return;
      }
      const candidates = line.ungVien || [];
      const locked = line.TrangThaiKT === 'Đã xác nhận';
      const hasDiff = line.TrangThaiGoiY === 'Chênh lệch'
        || (line.ChenLech != null && Number(line.ChenLech) !== 0);
      const chenh = hasDiff
        ? `<div class="recon-diff-pair">
            <article><span>Số trên sao kê</span><strong>${money(line.SoTienSaoKe ?? line.SoTien)}</strong></article>
            <article><span>Số trên chứng từ</span><strong>${money(line.SoTienChungTu)}</strong></article>
            <article class="is-gap"><span>Chênh lệch</span><strong>${money(line.ChenLech)}</strong></article>
          </div>`
        : '';
      box.innerHTML = `
        <div class="recon-detail-head">
          <div>
            <p class="lg-kicker">Dòng ${esc(line.MaDong)} · ${esc(statement?.MaSaoKe || '')}</p>
            <h2>${esc(fmtDate(line.NgayGD))} · ${money(line.SoTien)}</h2>
            <p class="recon-detail-desc">${esc(line.DienGiai || 'Không có nội dung')}</p>
          </div>
          <span class="${badgeClass(line.TrangThaiGoiY)}">${esc(line.TrangThaiGoiY || 'Chưa chạy')}</span>
        </div>
        <div class="recon-chip-row">${chips(line.LyDo) || '<span class="recon-chip is-muted">Chưa có lý do điểm</span>'}</div>
        ${chenh}
        <p class="recon-meta">Điểm ${esc(line.DiemKhop ?? 0)} · Kế toán: ${esc(line.TrangThaiKT || '—')} · gợi ý ${esc(line.LoaiGoiY || '—')} ${esc(line.MaGoiY || '')}</p>
        <h3 class="recon-subhead">Ứng viên</h3>
        <div class="recon-cand-wrap">
          <table class="warehouse-table recon-cand-table">
            <thead><tr><th>Chứng từ</th><th>Ngày</th><th>Tiền</th><th>Điểm</th><th>Lý do</th><th></th></tr></thead>
            <tbody>
              ${candidates.length ? candidates.map(item => `<tr>
                <td><strong>${esc(item.LoaiChungTu)}</strong> ${esc(item.MaChungTu)}<small>${esc(item.TenDoiTac || item.MaThamChieu || '')}</small></td>
                <td>${esc(fmtDate(item.NgayGD))}</td>
                <td class="num">${money(item.SoTien)}</td>
                <td>${esc(item.DiemKhop)}</td>
                <td><div class="recon-chip-row is-tight">${chips(item.LyDo)}</div></td>
                <td>${locked ? '' : `<button type="button" class="lg-btn lg-btn-ghost recon-pick-btn" data-pick="${esc(item.MaUngVien)}">Chọn</button>`}</td>
              </tr>`).join('') : '<tr><td colspan="6">Không có ứng viên trên dòng này.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="recon-detail-actions">
          ${locked ? '<p class="lg-help" style="margin:0">Dòng đã xác nhận. Engine không được tự sửa sổ.</p>' : `
            <button type="button" class="lg-btn lg-btn-primary" id="reconConfirmLine">Xác nhận đối soát</button>
            <button type="button" class="lg-btn lg-btn-ghost" id="reconRejectLine">Bỏ gợi ý</button>`}
        </div>`;
      box.querySelector('#reconConfirmLine')?.addEventListener('click', catchUi(context, async () => {
        const out = await api(context, `/accounting/reconciliation/lines/${line.MaDong}/confirm`, { method: 'POST', body: JSON.stringify({}) });
        context.showToast(out.message, 'success');
        await loadCurrent();
      }));
      box.querySelector('#reconRejectLine')?.addEventListener('click', catchUi(context, async () => {
        const out = await api(context, `/accounting/reconciliation/lines/${line.MaDong}/reject`, { method: 'POST', body: JSON.stringify({}) });
        context.showToast(out.message, 'success');
        await loadCurrent();
      }));
      box.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', catchUi(context, async () => {
        const out = await api(context, `/accounting/reconciliation/lines/${line.MaDong}/confirm`, {
          method: 'POST', body: JSON.stringify({ MaUngVien: Number(btn.dataset.pick) })
        });
        context.showToast(out.message, 'success');
        await loadCurrent();
      })));
    };

    const renderLines = data => {
      const lines = data.lines || [];
      fillStats(data.counts);
      const hasStatement = Boolean(data.statement);
      if (!hasStatement) {
        root.querySelector('#reconTable').innerHTML = emptyTable(
          'Chưa có sao kê để đối soát',
          'Tải mẫu CSV, chọn tệp rồi bấm Nhập và chạy đối soát. Engine sẽ xếp loại từng dòng — bạn mới là người xác nhận.'
        );
        showDetail(null);
        return;
      }
      if (!lines.length) {
        root.querySelector('#reconTable').innerHTML = emptyTable(
          'Không có dòng khớp bộ lọc',
          'Thử xóa ô tìm hoặc chọn lại trạng thái. Sao kê vẫn còn — chỉ đang bị lọc.'
        );
        showDetail(null);
        return;
      }
      root.querySelector('#reconTable').innerHTML = `
        <table class="warehouse-table recon-line-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Số tiền</th>
              <th>Nội dung</th>
              <th>Trạng thái</th>
              <th>Điểm</th>
              <th>Ứng viên</th>
              <th>Chênh lệch</th>
            </tr>
          </thead>
          <tbody>
            ${lines.map(row => {
              const cand = [row.LoaiGoiY, row.MaGoiY].filter(Boolean).join(' ') || '—';
              const diff = row.ChenLech != null && Number(row.ChenLech) !== 0 ? money(row.ChenLech) : '—';
              return `<tr data-dong="${esc(row.MaDong)}" class="recon-row${String(row.MaDong) === String(selectedDong) ? ' is-active' : ''}">
                <td>${esc(fmtDate(row.NgayGD))}</td>
                <td class="num recon-money">${money(row.SoTien)}</td>
                <td>${esc(row.DienGiai || '—')}<small>${esc(row.MaThamChieu || row.MaGiaoDich || '')}</small></td>
                <td><span class="${badgeClass(row.TrangThaiGoiY)}">${esc(row.TrangThaiGoiY || '—')}</span></td>
                <td class="num">${esc(row.DiemKhop ?? '—')}</td>
                <td>${esc(cand)}</td>
                <td class="num${diff !== '—' ? ' is-diff' : ''}">${esc(diff)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
      root.querySelectorAll('.recon-row').forEach(tr => tr.addEventListener('click', () => {
        selectedDong = tr.dataset.dong;
        root.querySelectorAll('.recon-row').forEach(row => row.classList.toggle('is-active', row === tr));
        const line = lines.find(item => String(item.MaDong) === tr.dataset.dong);
        showDetail(line, data.statement);
      }));
      const keep = lines.find(item => String(item.MaDong) === String(selectedDong));
      showDetail(keep || null, data.statement);
    };

    const loadList = async () => {
      const data = await api(context, '/accounting/reconciliation/statements');
      const pick = root.querySelector('#reconPick');
      const items = data.items || [];
      pick.innerHTML = `<option value="">Chọn sao kê…</option>` + items.map(row =>
        `<option value="${esc(row.MaSaoKe)}" ${row.MaSaoKe === currentId ? 'selected' : ''}>${esc(row.MaSaoKe)} · ${esc(row.TenFile || '')} · ${esc(row.SoDong || 0)} dòng</option>`).join('');
      if (!currentId && items[0]) currentId = items[0].MaSaoKe;
      if (currentId) pick.value = currentId;
      return items;
    };

    const loadCurrent = async () => {
      if (!currentId) {
        fillStats({});
        root.querySelector('#reconTable').innerHTML = emptyTable(
          'Chưa nhập sao kê',
          'Chọn tệp CSV (Ngày, Số tiền, Nội dung, Mã tham chiếu) rồi bấm Nhập và chạy đối soát. Có thể tải mẫu trước.'
        );
        showDetail(null);
        return;
      }
      const qs = new URLSearchParams();
      if (filter) qs.set('trangThai', filter);
      if (query) qs.set('search', query);
      const data = await api(context, `/accounting/reconciliation/statements/${encodeURIComponent(currentId)}${qs.toString() ? `?${qs}` : ''}`);
      renderLines(data);
    };

    renderShell();
    root.querySelector('#reconOpenHb')?.addEventListener('click', () => openHandbook(context));
    try {
      const banks = await api(context, '/ledger/bank-accounts');
      const active = (banks.items || []).find(row => /su dung|sử dụng/i.test(row.TrangThai || ''));
      if (active) root.querySelector('#reconTk').value = active.MaTKNH;
    } catch { /* TKNH tuỳ chọn */ }

    root.querySelector('#reconFile').addEventListener('change', event => {
      root.querySelector('#reconFileName').textContent = fileLabel(event.target.files[0]);
    });
    root.querySelector('#reconTpl').addEventListener('click', catchUi(context, async event => {
      event.preventDefault();
      const response = await fetch(`${context.apiBase}/accounting/reconciliation/template.csv`, {
        headers: { Authorization: `Bearer ${context.token}` }
      });
      if (!response.ok) throw new Error('Không tải được mẫu CSV.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sao-ke-doi-soat-mau.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    root.querySelector('#reconCsv').addEventListener('submit', catchUi(context, async event => {
      event.preventDefault();
      const file = root.querySelector('#reconFile').files[0];
      if (!file) return context.showToast('Chọn tệp CSV.', 'error');
      const body = new FormData();
      body.append('file', file);
      body.append('MaTKNH', root.querySelector('#reconTk').value);
      const out = await api(context, '/accounting/reconciliation/statements/import', { method: 'POST', body });
      context.showToast(`Đã nhập ${out.soDong} dòng (${out.MaSaoKe}). Engine đã chạy — chưa ghi sổ.`, 'success');
      currentId = out.MaSaoKe;
      selectedDong = '';
      await loadList();
      await loadCurrent();
    }));
    root.querySelector('#reconPick').addEventListener('change', catchUi(context, async event => {
      currentId = event.target.value;
      selectedDong = '';
      await loadCurrent();
    }));
    root.querySelector('#reconFilter').addEventListener('change', catchUi(context, async event => {
      filter = event.target.value;
      await loadCurrent();
    }));
    let searchTimer;
    root.querySelector('#reconSearch').addEventListener('input', event => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(catchUi(context, async () => {
        query = event.target.value.trim();
        await loadCurrent();
      }), 280);
    });
    root.querySelector('#reconRun').addEventListener('click', catchUi(context, async () => {
      if (!currentId) return context.showToast('Chọn sao kê đã nhập.', 'error');
      const out = await api(context, `/accounting/reconciliation/statements/${encodeURIComponent(currentId)}/run`, { method: 'POST', body: '{}' });
      context.showToast(`Đã chạy lại engine ${out.soDong} dòng. Không dùng LLM.`, 'success');
      await loadCurrent();
    }));
    root.querySelector('#reconConfirmAuto').addEventListener('click', catchUi(context, async () => {
      if (!currentId) return context.showToast('Chọn sao kê đã nhập.', 'error');
      const out = await api(context, `/accounting/reconciliation/statements/${encodeURIComponent(currentId)}/confirm-auto`, { method: 'POST', body: '{}' });
      context.showToast(out.message, 'success');
      await loadCurrent();
    }));
    await loadList();
    await loadCurrent();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'ledger-reconciliation') {
        const root = document.querySelector('.recon-page') || document.querySelector('.ledger-page') || document.querySelector('.warehouse-page');
        try {
          const canAct = codesOf(context.user).includes('UC42');
          if (!canAct && isManagerUser(context.user)) await initQlSummary(root, context);
          else if (!canAct) {
            root.innerHTML = `
              <header class="lg-header recon-header">
                <div>
                  <p class="lg-kicker">Đối soát ngân hàng</p>
                  <h1>Đối soát ngân hàng thông minh</h1>
                  <p class="lg-lead">Tài khoản này không có quyền nhập sao kê (UC42) hay xem tóm tắt quản lý (UC10).</p>
                </div>
              </header>
              <article class="lg-card"><p class="lg-help" style="margin:0">Nhờ Quản lý kiểm tra phân quyền, hoặc mở Cẩm nang kế toán — mục 19.</p></article>`;
          } else await initRecon(root, context);
        } catch (error) {
          root.innerHTML = `<div class="warehouse-empty">${esc(error.message)}</div>`;
        }
        return;
      }
      return previous?.init?.(pageName, context);
    }
  };
})();
