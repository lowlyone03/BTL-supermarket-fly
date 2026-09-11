{
    const token = localStorage.getItem('fly_token');
    const API = window.FLY_API_BASE || 'http://localhost:3000/api';
    const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';
    const currentUser = JSON.parse(localStorage.getItem('fly_user') || '{}');
    let roles = [];
    let accounts = [];
    let availableEmployees = [];
    const searchInput = document.getElementById('accSearch');
    const roleFilter = document.getElementById('accRoleFilter');
    const statusFilter = document.getElementById('accStatusFilter');

    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const toDateInput = value => {
        if (window.FLY_EMP_PROFILE?.toDateInput) return window.FLY_EMP_PROFILE.toDateInput(value);
        if (!value) return '';
        const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    };

    const formatDate = dateStr => {
        if (window.FLY_EMP_PROFILE?.formatDate) {
            return window.FLY_EMP_PROFILE.formatDate(dateStr) || 'Chưa cập nhật';
        }
        const iso = toDateInput(dateStr);
        if (!iso) return 'Chưa cập nhật';
        try { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${iso}T00:00:00`)); }
        catch { return 'Chưa cập nhật'; }
    };

    const profileLine = (label, value) => `<div><small>${label}</small><p>${escapeHtml(value || 'Chưa cập nhật')}</p></div>`;

    const renderEmployeeProfileHtml = person => window.FLY_EMP_PROFILE?.renderCompactGrid?.(person) || `
        <div class="acc-emp-profile-grid">
            ${profileLine('Mã NV', person.MaNV)}
            ${profileLine('Số CCCD', person.CCCD)}
            ${profileLine('Ngày sinh', person.NgaySinh ? formatDate(person.NgaySinh) : '')}
            ${profileLine('Giới tính', person.GioiTinh)}
            ${profileLine('Số điện thoại', person.SDT)}
            ${profileLine('Email', person.Email)}
            <div class="emp-detail-full">${profileLine('Địa chỉ', person.DiaChi)}</div>
        </div>`;

    const renderAccounts = () => {
        const body = document.getElementById('accTableBody');
        if (!body) return;
        const normalizeSearch = window.FLY_SEARCH?.normalize || (value => String(value ?? '').trim().toLocaleLowerCase('vi-VN'));
        const search = normalizeSearch(searchInput?.value);
        const selectedRole = roleFilter?.value;
        const selectedStatus = statusFilter?.value;
        const filtered = accounts.filter(account =>
            [account.TenDangNhap, account.TenNV, account.ChucVu, account.TenVaiTro, account.CCCD, account.SDT, account.Email, account.MaNV, account.MSTCaNhan, account.SoBHXH]
                .some(value => normalizeSearch(value).includes(search))
            && (!selectedRole || String(account.MaVaiTro) === selectedRole)
            && (selectedStatus === '' || String(account.TrangThai) === selectedStatus)
        );
        const accCount = document.getElementById('accCount');
        if (accCount) accCount.textContent = `${filtered.length} tài khoản`;
        const active = document.getElementById('accActiveCount');
        if (active) active.textContent = accounts.filter(account => Number(account.TrangThai) === 1).length;
        const locked = document.getElementById('accLockedCount');
        if (locked) locked.textContent = accounts.filter(account => Number(account.TrangThai) === 0).length;
        const used = document.getElementById('accUsedCount');
        if (used) used.textContent = accounts.filter(account => Boolean(account.LanDangNhapCuoi)).length;
        body.innerHTML = filtered.length ? filtered.map(account => {
            const isCurrent = account.MaNV === currentUser.MaNV;
            return `<tr class="acc-row" data-acc-action="detail" data-ma-tk="${account.MaTK}">
                <td><strong>${escapeHtml(account.TenDangNhap)}</strong><small>${isCurrent ? 'Tài khoản đang sử dụng' : `Mã TK: ${escapeHtml(account.MaTK)}`}</small></td>
                <td><div class="person-cell"><span class="person-avatar">${escapeHtml(account.TenNV.split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase())}</span><span><strong>${escapeHtml(account.TenNV)}</strong><small>${escapeHtml(account.ChucVu)}${account.CCCD ? ` · CCCD ${escapeHtml(account.CCCD)}` : ''}</small></span></div></td>
                <td><select class="role-select" onchange="updateRole(${account.MaTK}, this.value)" ${isCurrent ? 'disabled title="Không thể tự đổi vai trò"' : ''}>
                    ${roles.map(role => `<option value="${role.MaVaiTro}" ${Number(role.MaVaiTro) === Number(account.MaVaiTro) ? 'selected' : ''}>${escapeHtml(role.TenVaiTro)}</option>`).join('')}
                </select></td>
                <td><span class="badge ${Number(account.TrangThai) === 1 ? 'badge-success' : 'badge-danger'}">${Number(account.TrangThai) === 1 ? 'Hoạt động' : 'Bị khóa'}</span></td>
                <td>${account.LanDangNhapCuoi ? new Date(account.LanDangNhapCuoi).toLocaleString('vi-VN', { timeZone: HANOI_TIME_ZONE }) : 'Chưa đăng nhập'}</td>
                <td class="align-right"><div class="action-btns">
                    <button type="button" class="btn btn-outline" data-acc-action="detail" data-ma-tk="${account.MaTK}">Hồ sơ</button>
                    <button class="btn ${Number(account.TrangThai) === 1 ? 'btn-danger' : 'btn-outline'}" onclick="toggleStatus(${account.MaTK}, '${escapeHtml(account.TenDangNhap)}')" ${isCurrent ? 'disabled title="Không thể tự khóa"' : ''}>${Number(account.TrangThai) === 1 ? 'Khóa' : 'Mở khóa'}</button>
                    <button class="btn btn-warning" onclick="resetPwd(${account.MaTK}, '${escapeHtml(account.TenDangNhap)}')">Đặt lại MK</button>
                </div></td>
            </tr>`;
        }).join('') : '<tr><td colspan="6" class="empty-state">Không tìm thấy tài khoản phù hợp.</td></tr>';
    };

    window.loadAccounts = async () => {
        const body = document.getElementById('accTableBody');
        if (!body) return;
        const navSeq = Number(window.FLY_NAV_SEQ || 0);
        body.innerHTML = '<tr><td colspan="6" class="empty-state">Đang tải dữ liệu...</td></tr>';
        try {
            const res = await fetch(`${API}/accounts`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tải tài khoản.');
            if (Number(window.FLY_NAV_SEQ || 0) !== navSeq || !document.getElementById('accTableBody')) return;
            accounts = data;
            renderAccounts();
        } catch (err) {
            if (!document.getElementById('accTableBody')) return;
            window.showToast(err.message || 'Lỗi tải tài khoản', 'error');
        }
    };

    window.loadRoles = async () => {
        const res = await fetch(`${API}/roles`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Không thể tải vai trò.');
        roles = data;
        const roleSelect = document.getElementById('maVaiTro');
        if (roleSelect) roleSelect.innerHTML = roles.map(role => `<option value="${role.MaVaiTro}">${escapeHtml(role.TenVaiTro)}</option>`).join('');
        if (roleFilter) roleFilter.innerHTML = '<option value="">Tất cả vai trò</option>' + roles.map(role => `<option value="${role.MaVaiTro}">${escapeHtml(role.TenVaiTro)}</option>`).join('');
    };

    const renderSelectedEmployeeProfile = () => {
        const box = document.getElementById('accEmpProfile');
        if (!box) return;
        const maNV = document.getElementById('maNV_Acc').value;
        const employee = availableEmployees.find(item => item.MaNV === maNV);
        if (!employee) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        box.hidden = false;
        if (window.FLY_EMP_PROFILE?.renderAccountEditor) {
            box.innerHTML = window.FLY_EMP_PROFILE.renderAccountEditor(employee);
            window.FLY_EMP_PROFILE.fillForm?.(employee, 'acc_');
        } else {
            box.innerHTML = `<strong>${escapeHtml(employee.TenNV)}</strong><small>Hồ sơ nhân viên sẽ gắn với tài khoản này</small>${renderEmployeeProfileHtml(employee)}`;
        }
    };

    const syncRoleFromEmployee = () => {
        const maNV = document.getElementById('maNV_Acc').value;
        const employee = availableEmployees.find(item => item.MaNV === maNV);
        const role = employee && roles.find(item => item.TenVaiTro === employee.ChucVu);
        if (role) document.getElementById('maVaiTro').value = String(role.MaVaiTro);
        renderSelectedEmployeeProfile();
    };

    window.loadAvailableEmployees = async () => {
        const res = await fetch(`${API}/employees/available`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Không thể tải nhân viên.');
        availableEmployees = data;
        const select = document.getElementById('maNV_Acc');
        if (!select) return;
        select.innerHTML = data.length === 0
            ? '<option value="">Không có nhân viên nào</option>'
            : data.map(employee => `<option value="${escapeHtml(employee.MaNV)}">${escapeHtml(employee.TenNV)} (${escapeHtml(employee.ChucVu)}${employee.CCCD ? ` · ${escapeHtml(employee.CCCD)}` : ''})</option>`).join('');
        syncRoleFromEmployee();
    };

    window.openAccDetail = maTK => {
        const account = accounts.find(item => Number(item.MaTK) === Number(maTK));
        if (!account) return;
        const isActive = Number(account.TrangThai) === 1;
        const syll = window.FLY_EMP_PROFILE?.renderSyllViews?.(account, {
            workStatus: account.TrangThaiNV || 'Đang làm việc',
            username: account.TenDangNhap
        }) || '';
        document.getElementById('accDetailContent').innerHTML = `
            <div class="emp-detail-header">
                <div class="emp-detail-name">
                    <p class="module-kicker">HỒ SƠ TÀI KHOẢN</p>
                    <h2>${escapeHtml(account.TenNV)}</h2>
                    <span class="emp-role-chip">${escapeHtml(account.TenVaiTro || account.ChucVu)}</span>
                </div>
                <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}" style="margin-left:auto">${isActive ? 'Hoạt động' : 'Bị khóa'}</span>
            </div>
            <div class="emp-detail-sections">
                <div class="emp-detail-section">
                    <h4>Tài khoản hệ thống</h4>
                    <div class="emp-detail-grid">
                        ${profileLine('Tên đăng nhập', account.TenDangNhap)}
                        ${profileLine('Mã tài khoản', account.MaTK)}
                        ${profileLine('Vai trò', account.TenVaiTro)}
                        ${profileLine('Đăng nhập cuối', account.LanDangNhapCuoi ? new Date(account.LanDangNhapCuoi).toLocaleString('vi-VN', { timeZone: HANOI_TIME_ZONE }) : 'Chưa đăng nhập')}
                    </div>
                </div>
            </div>
            ${syll}`;
        const backdrop = document.getElementById('accDetailBackdrop');
        if (backdrop) backdrop.style.display = 'flex';
    };

    window.closeAccDetail = () => {
        const backdrop = document.getElementById('accDetailBackdrop');
        if (backdrop) backdrop.style.display = 'none';
    };

    const showAccError = (id, ok, message) => {
        if (window.FLY_FIELDS?.setFieldError) return window.FLY_FIELDS.setFieldError(id, ok, message);
        const el = document.getElementById(`${id}_err`);
        const input = document.getElementById(id);
        if (el) { el.textContent = ok ? '' : message; el.style.display = ok ? 'none' : 'block'; }
        if (input) input.classList.toggle('input-error', !ok);
        return ok;
    };

    const clearAccErrors = () => {
        ['maNV_Acc', 'tenDangNhap'].forEach(id => showAccError(id, true, ''));
    };

    const validateAccForm = () => {
        const fields = window.FLY_FIELDS;
        const maNV = document.getElementById('maNV_Acc').value;
        const username = document.getElementById('tenDangNhap').value;
        let ok = true;
        if (!showAccError('maNV_Acc', Boolean(maNV), 'Vui lòng chọn nhân viên chưa có tài khoản.')) ok = false;
        const userResult = fields ? fields.validateUsername(username) : { ok: Boolean(username.trim()), message: 'Vui lòng nhập tên đăng nhập.' };
        if (!showAccError('tenDangNhap', userResult.ok, userResult.message || 'Tên đăng nhập không hợp lệ.')) ok = false;
        if (maNV && window.FLY_EMP_PROFILE?.validateProfileForm) {
            const profileOk = window.FLY_EMP_PROFILE.validateProfileForm(showAccError, {
                prefix: 'acc_',
                strictCreate: false,
                includeCore: true
            });
            if (!profileOk) ok = false;
        }
        return ok;
    };

    window.openAccModal = async () => {
        document.getElementById('accForm').reset();
        clearAccErrors();
        try {
            await loadAvailableEmployees();
            document.getElementById('accModal').style.display = 'flex';
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };
    window.closeAccModal = () => { document.getElementById('accModal').style.display = 'none'; };

    const handleAccAction = event => {
        if (event.target.closest('select, button:not([data-acc-action])')) return;
        const trigger = event.target.closest('[data-acc-action="detail"]');
        if (!trigger) return;
        event.preventDefault();
        openAccDetail(trigger.dataset.maTk);
    };

    document.getElementById('maNV_Acc').addEventListener('change', syncRoleFromEmployee);
    document.getElementById('accTableBody')?.addEventListener('click', handleAccAction);
    document.getElementById('accDetailBackdrop')?.addEventListener('click', event => {
        if (event.target === event.currentTarget) closeAccDetail();
    });
    searchInput.addEventListener('input', renderAccounts);
    roleFilter.addEventListener('change', renderAccounts);
    statusFilter.addEventListener('change', renderAccounts);
    document.getElementById('tenDangNhap')?.addEventListener('blur', () => {
        const fields = window.FLY_FIELDS;
        const result = fields ? fields.validateUsername(document.getElementById('tenDangNhap').value) : { ok: true };
        showAccError('tenDangNhap', result.ok, result.message);
    });

    document.getElementById('accForm').onsubmit = async event => {
        event.preventDefault();
        if (!validateAccForm()) return;
        const fields = window.FLY_FIELDS;
        const payload = {
            MaNV: document.getElementById('maNV_Acc').value,
            TenDangNhap: fields?.validateUsername(document.getElementById('tenDangNhap').value).value
                ?? document.getElementById('tenDangNhap').value.trim().toLowerCase(),
            MaVaiTro: Number(document.getElementById('maVaiTro').value),
            ...(window.FLY_EMP_PROFILE?.collectCoreFromForm?.('acc_') || {}),
            ...(window.FLY_EMP_PROFILE?.collectFromForm?.('acc_') || {})
        };
        if (!payload.MaNV) return window.showToast('Không có nhân viên để tạo tài khoản.', 'error');

        try {
            const res = await fetch(`${API}/accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tạo tài khoản.');
            window.showToast(data.message, 'success');
            closeAccModal();
            loadAccounts();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };

    window.toggleStatus = async (maTK, username) => {
        if (!confirm(`Bạn có chắc muốn thay đổi trạng thái của tài khoản ${username}?`)) return;
        try {
            const res = await fetch(`${API}/accounts/${maTK}/toggle-status`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể đổi trạng thái.');
            window.showToast(data.message, 'success');
            loadAccounts();
        } catch (err) { window.showToast(err.message, 'error'); }
    };

    window.resetPwd = async (maTK, username) => {
        if (!confirm(`Đặt lại mật khẩu của ${username} về '123'?`)) return;
        try {
            const res = await fetch(`${API}/accounts/${maTK}/reset-password`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể đặt lại mật khẩu.');
            window.showToast(data.message, 'success');
        } catch (err) { window.showToast(err.message, 'error'); }
    };

    window.updateRole = async (maTK, maVaiTro) => {
        try {
            const res = await fetch(`${API}/accounts/${maTK}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ MaVaiTro: Number(maVaiTro) })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể cập nhật vai trò.');
            window.showToast(data.message, 'success');
            loadAccounts();
        } catch (err) {
            window.showToast(err.message, 'error');
            loadAccounts();
        }
    };

    window.loadTelegramBindings = async () => {
        const body = document.getElementById('telegramBindBody');
        if (!body) return;
        body.innerHTML = '<tr><td colspan="7" class="empty-state">Đang tải liên kết Telegram...</td></tr>';
        try {
            const res = await fetch(`${API}/admin/telegram/bindings`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không tải được liên kết Telegram.');
            const items = data.items || [];
            body.innerHTML = items.length ? items.map(row => `
                <tr>
                    <td><strong>${escapeHtml(row.TenNV)}</strong><small>${escapeHtml(row.MaNV)}</small></td>
                    <td>${escapeHtml(row.TenDangNhap || '')}</td>
                    <td>${escapeHtml(row.TenVaiTro || '')}</td>
                    <td>${escapeHtml(row.ChatIdMasked || '****')}</td>
                    <td>${Number(row.Bat) === 1 ? 'Bật' : 'Tắt'}</td>
                    <td>${row.NgayXacThuc ? new Date(row.NgayXacThuc).toLocaleString('vi-VN', { timeZone: HANOI_TIME_ZONE }) : '—'}</td>
                    <td class="align-right"><div class="action-btns">
                        <button type="button" class="btn btn-outline" onclick="toggleTelegramChannel('${escapeHtml(row.MaNV)}', ${Number(row.Bat) === 1 ? 0 : 1})">${Number(row.Bat) === 1 ? 'Tắt kênh' : 'Bật kênh'}</button>
                        <button type="button" class="btn btn-danger" onclick="revokeTelegramBind('${escapeHtml(row.MaNV)}', '${escapeHtml(row.TenNV)}')">Hủy liên kết</button>
                    </div></td>
                </tr>`).join('') : '<tr><td colspan="7" class="empty-state">Chưa có nhân viên liên kết Telegram.</td></tr>';
        } catch (err) {
            body.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(err.message || 'Lỗi tải Telegram')}</td></tr>`;
        }
    };

    window.revokeTelegramBind = async (maNV, tenNV) => {
        if (!confirm(`Hủy liên kết Telegram của ${tenNV}?`)) return;
        try {
            const res = await fetch(`${API}/admin/telegram/bindings/${encodeURIComponent(maNV)}/revoke`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không hủy được liên kết.');
            window.showToast(data.message, 'success');
            loadTelegramBindings();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };

    window.toggleTelegramChannel = async (maNV, bat) => {
        try {
            const res = await fetch(`${API}/admin/telegram/bindings/${encodeURIComponent(maNV)}/channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ Bat: bat })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không đổi được kênh.');
            window.showToast(data.message, 'success');
            loadTelegramBindings();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };

    loadRoles().then(loadAccounts).then(loadTelegramBindings).catch(error => window.showToast(error.message, 'error'));
}
