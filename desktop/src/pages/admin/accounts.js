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

    const renderAccounts = () => {
        const normalizeSearch = window.FLY_SEARCH?.normalize || (value => String(value ?? '').trim().toLocaleLowerCase('vi-VN'));
        const search = normalizeSearch(searchInput.value);
        const selectedRole = roleFilter.value;
        const selectedStatus = statusFilter.value;
        const filtered = accounts.filter(account =>
            [account.TenDangNhap, account.TenNV, account.ChucVu, account.TenVaiTro]
                .some(value => normalizeSearch(value).includes(search))
            && (!selectedRole || String(account.MaVaiTro) === selectedRole)
            && (selectedStatus === '' || String(account.TrangThai) === selectedStatus)
        );
        document.getElementById('accCount').textContent = `${filtered.length} tài khoản`;
        document.getElementById('accActiveCount').textContent = accounts.filter(account => Number(account.TrangThai) === 1).length;
        document.getElementById('accLockedCount').textContent = accounts.filter(account => Number(account.TrangThai) === 0).length;
        document.getElementById('accUsedCount').textContent = accounts.filter(account => Boolean(account.LanDangNhapCuoi)).length;
        document.getElementById('accTableBody').innerHTML = filtered.length ? filtered.map(account => {
            const isCurrent = account.MaNV === currentUser.MaNV;
            return `<tr>
                <td><strong>${escapeHtml(account.TenDangNhap)}</strong><small>${isCurrent ? 'Tài khoản đang sử dụng' : `Mã TK: ${escapeHtml(account.MaTK)}`}</small></td>
                <td><div class="person-cell"><span class="person-avatar">${escapeHtml(account.TenNV.split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase())}</span><span><strong>${escapeHtml(account.TenNV)}</strong><small>${escapeHtml(account.ChucVu)}</small></span></div></td>
                <td><select class="role-select" onchange="updateRole(${account.MaTK}, this.value)" ${isCurrent ? 'disabled title="Không thể tự đổi vai trò"' : ''}>
                    ${roles.map(role => `<option value="${role.MaVaiTro}" ${Number(role.MaVaiTro) === Number(account.MaVaiTro) ? 'selected' : ''}>${escapeHtml(role.TenVaiTro)}</option>`).join('')}
                </select></td>
                <td><span class="badge ${Number(account.TrangThai) === 1 ? 'badge-success' : 'badge-danger'}">${Number(account.TrangThai) === 1 ? 'Hoạt động' : 'Bị khóa'}</span></td>
                <td>${account.LanDangNhapCuoi ? new Date(account.LanDangNhapCuoi).toLocaleString('vi-VN', { timeZone: HANOI_TIME_ZONE }) : 'Chưa đăng nhập'}</td>
                <td class="align-right"><div class="action-btns">
                    <button class="btn ${Number(account.TrangThai) === 1 ? 'btn-danger' : 'btn-outline'}" onclick="toggleStatus(${account.MaTK}, '${escapeHtml(account.TenDangNhap)}')" ${isCurrent ? 'disabled title="Không thể tự khóa"' : ''}>${Number(account.TrangThai) === 1 ? 'Khóa' : 'Mở khóa'}</button>
                    <button class="btn btn-warning" onclick="resetPwd(${account.MaTK}, '${escapeHtml(account.TenDangNhap)}')">Đặt lại MK</button>
                </div></td>
            </tr>`;
        }).join('') : '<tr><td colspan="6" class="empty-state">Không tìm thấy tài khoản phù hợp.</td></tr>';
    };

    window.loadAccounts = async () => {
        document.getElementById('accTableBody').innerHTML = '<tr><td colspan="6" class="empty-state">Đang tải dữ liệu...</td></tr>';
        try {
            const res = await fetch(`${API}/accounts`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tải tài khoản.');
            accounts = data;
            renderAccounts();
        } catch (err) {
            window.showToast(err.message || 'Lỗi tải tài khoản', 'error');
        }
    };

    window.loadRoles = async () => {
        const res = await fetch(`${API}/roles`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Không thể tải vai trò.');
        roles = data;
        document.getElementById('maVaiTro').innerHTML = roles.map(role => `<option value="${role.MaVaiTro}">${escapeHtml(role.TenVaiTro)}</option>`).join('');
        roleFilter.innerHTML = '<option value="">Tất cả vai trò</option>' + roles.map(role => `<option value="${role.MaVaiTro}">${escapeHtml(role.TenVaiTro)}</option>`).join('');
    };

    const syncRoleFromEmployee = () => {
        const maNV = document.getElementById('maNV_Acc').value;
        const employee = availableEmployees.find(item => item.MaNV === maNV);
        const role = employee && roles.find(item => item.TenVaiTro === employee.ChucVu);
        if (role) document.getElementById('maVaiTro').value = String(role.MaVaiTro);
    };

    window.loadAvailableEmployees = async () => {
        const res = await fetch(`${API}/employees/available`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Không thể tải nhân viên.');
        availableEmployees = data;
        const select = document.getElementById('maNV_Acc');
        select.innerHTML = data.length === 0
            ? '<option value="">Không có nhân viên nào</option>'
            : data.map(employee => `<option value="${escapeHtml(employee.MaNV)}">${escapeHtml(employee.TenNV)} (${escapeHtml(employee.ChucVu)})</option>`).join('');
        syncRoleFromEmployee();
    };

    window.openAccModal = async () => {
        document.getElementById('accForm').reset();
        try {
            await loadAvailableEmployees();
            document.getElementById('accModal').style.display = 'flex';
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };
    window.closeAccModal = () => { document.getElementById('accModal').style.display = 'none'; };

    document.getElementById('maNV_Acc').addEventListener('change', syncRoleFromEmployee);
    searchInput.addEventListener('input', renderAccounts);
    roleFilter.addEventListener('change', renderAccounts);
    statusFilter.addEventListener('change', renderAccounts);

    document.getElementById('accForm').onsubmit = async event => {
        event.preventDefault();
        const payload = {
            MaNV: document.getElementById('maNV_Acc').value,
            TenDangNhap: document.getElementById('tenDangNhap').value.trim(),
            MaVaiTro: Number(document.getElementById('maVaiTro').value)
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

    loadRoles().then(loadAccounts).catch(error => window.showToast(error.message, 'error'));
}
