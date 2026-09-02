{
    const token = localStorage.getItem('fly_token');
    const API = window.FLY_API_BASE || 'http://localhost:3000/api';
    const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';
    const FALLBACK_KINDS = [
        { value: 'nghiep-vu', label: 'Việc cửa hàng (ẩn đăng nhập)' },
        { value: '', label: 'Tất cả việc làm' },
        { value: 'dang-nhap', label: 'Chỉ đăng nhập' },
        { value: 'duyet', label: 'Phê duyệt / từ chối' },
        { value: 'tien-ton', label: 'Tiền và tồn kho' },
        { value: 'cong-no', label: 'Công nợ / phiếu chi' },
        { value: 'luong', label: 'Ca, công, lương' },
        { value: 'he-thong', label: 'Tài khoản / phân quyền' }
    ];
    const FALLBACK_ROLES = [
        { value: '', label: 'Tất cả vai trò' },
        { value: 'Quản lý', label: 'Quản lý' },
        { value: 'Kế toán', label: 'Kế toán' },
        { value: 'Thu ngân', label: 'Thu ngân' },
        { value: 'Thủ kho', label: 'Thủ kho' },
        { value: 'Nhân viên mua hàng', label: 'Nhân viên mua hàng' }
    ];

    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    const vnDateKey = value => {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: HANOI_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(value instanceof Date ? value : new Date());
        const part = type => parts.find(item => item.type === type)?.value || '';
        return `${part('year')}-${part('month')}-${part('day')}`;
    };
    const addDays = (iso, days) => {
        const [y, m, d] = iso.split('-').map(Number);
        const date = new Date(y, m - 1, d + days);
        return vnDateKey(date);
    };
    const fmtTime = value => value
        ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: HANOI_TIME_ZONE }).format(new Date(value))
        : '—';
    const initials = name => String(name || 'HT').trim().split(/\s+/).slice(-2).map(part => part[0] || '').join('').toUpperCase() || 'HT';
    const fillSelect = (id, items, selected) => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = (items || []).map(item => {
            const value = item.value == null ? item : item.value;
            const label = item.label == null ? item : item.label;
            return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
        select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const queryString = extra => {
        const params = new URLSearchParams({
            from: document.getElementById('logFrom').value,
            to: document.getElementById('logTo').value,
            search: document.getElementById('logSearch').value.trim(),
            kind: document.getElementById('logKind').value,
            action: document.getElementById('logAction').value,
            role: document.getElementById('logRole').value,
            actor: document.getElementById('logActor').value,
            page: String(state.page),
            pageSize: '50',
            ...extra
        });
        return params.toString();
    };
    const api = async (path, options = {}) => {
        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
        });
        if (options.blob) {
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || 'Không thể xuất nhật ký.');
            }
            return response.blob();
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Không thể tải nhật ký.');
        return data;
    };

    const state = { page: 1, total: 0, items: [], selected: null };

    const resultBadge = row => {
        const ok = String(row.ketQuaHienThi || 'Thành công') !== 'Thất bại';
        return `<span class="badge ${ok ? 'badge-success' : 'badge-danger'}">${escapeHtml(row.ketQuaHienThi || 'Thành công')}</span>`;
    };
    const toneClass = row => {
        if (row.laDangNhap) return 'audit-row-login';
        if (row.mucDoHienThi === 'Quan trọng') return 'audit-row-critical';
        if (row.mucDoHienThi === 'Cảnh báo') return 'audit-row-warn';
        return '';
    };
    const docCell = row => {
        if (!row.doiTuongMa) return `<span class="audit-muted">${escapeHtml(row.doiTuong || 'Không gắn chứng từ')}</span>`;
        const label = `${row.doiTuong} ${row.doiTuongMa}`;
        if (row.target) {
            return `<button type="button" class="audit-doc-link" data-open-target="${escapeHtml(row.target)}" title="Mở màn liên quan">${escapeHtml(label)}</button>`;
        }
        return `<strong>${escapeHtml(row.doiTuongMa)}</strong><small>${escapeHtml(row.doiTuong)}</small>`;
    };

    const closeDetail = () => {
        state.selected = null;
        const panel = document.getElementById('auditDetail');
        const backdrop = document.getElementById('auditBackdrop');
        panel?.classList.remove('open');
        if (panel) panel.hidden = true;
        if (backdrop) backdrop.hidden = true;
        document.getElementById('auditWorkspace')?.classList.remove('has-detail');
        document.querySelectorAll('.audit-table tbody tr.is-active').forEach(row => row.classList.remove('is-active'));
    };

    const openDetail = row => {
        state.selected = row;
        const panel = document.getElementById('auditDetail');
        const backdrop = document.getElementById('auditBackdrop');
        if (!panel) return;
        panel.hidden = false;
        if (backdrop) backdrop.hidden = false;
        document.getElementById('auditWorkspace')?.classList.add('has-detail');
        const diffBlock = (title, data) => {
            if (!data) return '';
            const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            return `<div class="audit-diff"><span>${escapeHtml(title)}</span><pre>${escapeHtml(text)}</pre></div>`;
        };
        panel.innerHTML = `
            <div class="audit-detail-head">
                <div><p class="module-kicker">CHI TIẾT DÒNG NHẬT KÝ</p><h2>${escapeHtml(row.viecLam)}</h2></div>
                <button type="button" class="close-btn" id="auditDetailClose" aria-label="Đóng">×</button>
            </div>
            <p class="audit-detail-title">${escapeHtml(row.tieuDe)}</p>
            <dl class="audit-detail-grid">
                <div><dt>Thời gian</dt><dd>${escapeHtml(fmtTime(row.ThoiGian))}</dd></div>
                <div><dt>Người làm</dt><dd>${escapeHtml(row.TenNV || 'Hệ thống')}<small>${escapeHtml(row.TenVaiTro || row.TenDangNhap || '')}</small></dd></div>
                <div><dt>Kết quả</dt><dd>${resultBadge(row)}</dd></div>
                <div><dt>Mức độ</dt><dd>${escapeHtml(row.mucDoHienThi || 'Thông tin')}</dd></div>
                <div><dt>Chứng từ</dt><dd>${docCell(row)}</dd></div>
                <div><dt>Mã UC</dt><dd>${escapeHtml(row.MaUC || '—')}</dd></div>
            </dl>
            <div class="audit-explain"><strong>Nghĩa là gì?</strong><p>${escapeHtml(row.giaiThich)}</p></div>
            ${row.NoiDung ? `<p class="audit-note"><strong>Chi tiết đã ghi:</strong> ${escapeHtml(row.NoiDung)}</p>` : ''}
            ${row.DiaChiIP ? `<p class="audit-muted">Máy truy cập: ${escapeHtml(row.DiaChiIP)}</p>` : ''}
            ${diffBlock('Trước khi thao tác', row.truoc)}${diffBlock('Sau khi thao tác', row.sau)}
            <p class="audit-lock-note">Nhật ký không thể sửa hoặc xóa. Dùng để giải trình khi có sai lệch tiền, tồn kho hoặc phê duyệt.</p>`;
        panel.classList.add('open');
        panel.querySelector('#auditDetailClose')?.addEventListener('click', closeDetail);
    };

    const renderTable = () => {
        const body = document.getElementById('logTableBody');
        const count = document.getElementById('logCount');
        const pageLabel = document.getElementById('auditPageLabel');
        if (!body) return;
        count.textContent = `${state.total} bản ghi`;
        const from = (state.page - 1) * 50 + (state.items.length ? 1 : 0);
        const to = (state.page - 1) * 50 + state.items.length;
        if (pageLabel) pageLabel.textContent = state.total ? `Hiện ${from}–${to} / ${state.total}` : 'Không có bản ghi';
        document.getElementById('auditPrev').disabled = state.page <= 1;
        document.getElementById('auditNext').disabled = state.page * 50 >= state.total;
        if (!state.items.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty-state">Không có thao tác phù hợp bộ lọc. Thử chọn “Tất cả việc làm” hoặc nới khoảng ngày.</td></tr>`;
            return;
        }
        body.innerHTML = state.items.map(row => `
            <tr class="${toneClass(row)}${state.selected && String(state.selected.MaNK) === String(row.MaNK) ? ' is-active' : ''}" data-id="${escapeHtml(row.MaNK)}" tabindex="0">
                <td>${escapeHtml(fmtTime(row.ThoiGian))}</td>
                <td><div class="person-cell"><span class="person-avatar">${escapeHtml(initials(row.TenNV))}</span><span><strong>${escapeHtml(row.TenNV || 'Hệ thống')}</strong><small>${escapeHtml(row.TenVaiTro || row.TenDangNhap || '')}</small></span></div></td>
                <td><div class="audit-action-cell" title="${escapeHtml(row.tieuDe)}"><strong>${escapeHtml(row.tieuDe)}</strong><small>${escapeHtml(row.viecLam)}</small></div></td>
                <td>${docCell(row)}</td>
                <td>${resultBadge(row)}</td>
            </tr>`).join('');
        body.querySelectorAll('tr[data-id]').forEach(tr => {
            const row = state.items.find(item => String(item.MaNK) === tr.dataset.id);
            tr.addEventListener('click', event => {
                if (event.target.closest('.audit-doc-link')) return;
                body.querySelectorAll('tr.is-active').forEach(item => item.classList.remove('is-active'));
                tr.classList.add('is-active');
                openDetail(row);
            });
        });
    };

    const loadLogs = async () => {
        const body = document.getElementById('logTableBody');
        if (body) body.innerHTML = '<tr><td colspan="5" class="empty-state">Đang tải nhật ký...</td></tr>';
        try {
            const data = await api(`/accounts/audit-log?${queryString()}`);
            state.items = data.items || [];
            state.total = Number(data.total || 0);
            renderTable();
        } catch (error) {
            if (body) body.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
            window.showToast?.(error.message, 'error');
        }
    };

    const applyDefaultDates = () => {
        const today = vnDateKey(new Date());
        const from = addDays(today, -6);
        const fromInput = document.getElementById('logFrom');
        const toInput = document.getElementById('logTo');
        if (fromInput) fromInput.value = from;
        if (toInput) toInput.value = today;
    };

    const loadFilters = async () => {
        fillSelect('logKind', FALLBACK_KINDS, 'nghiep-vu');
        fillSelect('logRole', FALLBACK_ROLES, '');
        fillSelect('logAction', [{ value: '', label: 'Tất cả hành động' }], '');
        fillSelect('logActor', [{ value: '', label: 'Tất cả nhân viên' }], '');
        try {
            const data = await api('/accounts/audit-log/filters');
            fillSelect('logKind', data.kinds?.length ? data.kinds : FALLBACK_KINDS, 'nghiep-vu');
            fillSelect('logRole', data.roles?.length ? data.roles : FALLBACK_ROLES, '');
            fillSelect('logAction', data.actions?.length ? data.actions : [{ value: '', label: 'Tất cả hành động' }], '');
            fillSelect('logActor', data.people?.length ? data.people : [{ value: '', label: 'Tất cả nhân viên' }], '');
        } catch (error) {
            window.showToast?.(error.message || 'Không tải được bộ lọc nhật ký', 'error');
        }
    };

    window.loadLogs = () => { state.page = 1; return loadLogs(); };
    window.clearLogFilters = () => {
        document.getElementById('logSearch').value = '';
        document.getElementById('logKind').value = 'nghiep-vu';
        document.getElementById('logAction').value = '';
        document.getElementById('logRole').value = '';
        document.getElementById('logActor').value = '';
        document.getElementById('logFrom').value = '';
        document.getElementById('logTo').value = '';
        applyDefaultDates();
        ['logKind', 'logAction', 'logRole', 'logActor'].forEach(id => {
            document.getElementById(id)?.dispatchEvent(new Event('change', { bubbles: true }));
        });
        state.page = 1;
        loadLogs();
    };
    window.exportAuditCsv = async () => {
        try {
            const blob = await api(`/accounts/audit-log/export?${queryString({ page: '1', pageSize: '500' })}`, { blob: true });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'nhat-ky-he-thong.csv';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            window.showToast?.(error.message, 'error');
        }
    };

    applyDefaultDates();
    loadFilters().then(loadLogs);
    ['logSearch'].forEach(id => {
        let timer;
        document.getElementById(id)?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => { state.page = 1; loadLogs(); }, 280);
        });
    });
    ['logKind', 'logAction', 'logRole', 'logActor', 'logFrom', 'logTo'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => { state.page = 1; loadLogs(); });
        document.getElementById(id)?.addEventListener('input', () => { state.page = 1; loadLogs(); });
    });
    document.getElementById('auditPrev')?.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadLogs(); } });
    document.getElementById('auditNext')?.addEventListener('click', () => { if (state.page * 50 < state.total) { state.page += 1; loadLogs(); } });
    document.getElementById('auditReload')?.addEventListener('click', loadLogs);
    document.getElementById('auditBackdrop')?.addEventListener('click', closeDetail);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById('auditDetail')?.classList.contains('open')) closeDetail();
    });
}
