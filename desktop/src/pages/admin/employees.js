{
    const token = localStorage.getItem('fly_token');
    let isEditMode = false;
    let employees = [];
    const empModal = document.getElementById('empModal');
    const empForm = document.getElementById('empForm');
    const searchInput = document.getElementById('empSearch');
    const roleFilter = document.getElementById('empRoleFilter');
    const statusFilter = document.getElementById('empStatusFilter');
    let searchTimer = null;

    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const getInitials = name => String(name || '').trim().split(/\s+/).slice(-2).map(p => p[0]).join('').toUpperCase();

    const formatDate = dateStr => {
        if (!dateStr) return '—';
        try { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr)); }
        catch { return '—'; }
    };

    const validateField = (id, condition, msg) => {
        const el = document.getElementById(id + '_err');
        if (!el) return condition;
        el.textContent = condition ? '' : msg;
        el.style.display = condition ? 'none' : 'block';
        const input = document.getElementById(id);
        if (input) input.classList.toggle('input-error', !condition);
        return condition;
    };

    const validateForm = () => {
        const maNV = document.getElementById('maNV').value.trim();
        const tenNV = document.getElementById('tenNV').value.trim();
        const sdt = document.getElementById('sdt').value.trim();
        const email = document.getElementById('email').value.trim();
        let ok = true;
        if (!validateField('maNV', maNV.length >= 2, 'Mã nhân viên phải có ít nhất 2 ký tự')) ok = false;
        if (!validateField('tenNV', tenNV.length >= 2, 'Vui lòng nhập họ tên nhân viên')) ok = false;
        if (!validateField('sdt', !sdt || /^0\d{9,10}$/.test(sdt), 'Số điện thoại không hợp lệ')) ok = false;
        if (!validateField('email', !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Email không hợp lệ')) ok = false;
        return ok;
    };

    const updateAvatarPreview = () => {
        const name = document.getElementById('tenNV')?.value || '';
        const initials = getInitials(name) || '?';
        const el = document.getElementById('empAvatarInitials');
        const nameEl = document.getElementById('empAvatarName');
        if (el) el.textContent = initials;
        if (nameEl) nameEl.textContent = name || 'Nhân viên mới';
    };

    const renderEmployees = () => {
        const normalizeSearch = window.FLY_SEARCH?.normalize || (value => String(value ?? '').trim().toLocaleLowerCase('vi-VN'));
        const search = normalizeSearch(searchInput.value);
        const selectedRole = roleFilter.value;
        const selectedStatus = statusFilter.value;
        const filtered = employees.filter(emp =>
            [emp.TenNV, emp.MaNV, emp.ChucVu, emp.SDT, emp.Email]
                .some(value => normalizeSearch(value).includes(search))
            && (!selectedRole || emp.ChucVu === selectedRole)
            && (!selectedStatus || emp.TrangThai === selectedStatus)
        );
        document.getElementById('empCount').textContent = `${filtered.length} nhân viên`;
        document.getElementById('empActiveCount').textContent = employees.filter(emp => emp.TrangThai === 'Đang làm việc').length;
        document.getElementById('empAccountCount').textContent = employees.filter(emp => Number(emp.HasAccount) === 1).length;
        document.getElementById('empNoAccountCount').textContent = employees.filter(emp => Number(emp.HasAccount) !== 1 && emp.TrangThai === 'Đang làm việc').length;
        const onLeave = employees.filter(emp => emp.TrangThai === 'Nghỉ việc').length;
        document.getElementById('empOnLeave').textContent = onLeave;

        const roleColors = { 'Quản lý': '#2d6a4f', 'Nhân viên mua hàng': '#1b7fa3', 'Thủ kho': '#7c5cbf', 'Thu ngân': '#c97a0a', 'Kế toán': '#c4553d' };
        const getRoleColor = role => roleColors[role] || '#40916c';

        document.getElementById('empTableBody').innerHTML = filtered.length ? filtered.map(emp => {
            const initials = getInitials(emp.TenNV);
            const roleColor = getRoleColor(emp.ChucVu);
            const isActive = emp.TrangThai === 'Đang làm việc';
            const hasAccount = Number(emp.HasAccount) === 1;
            return `
            <tr class="emp-row" onclick="openEmpDetail('${escapeHtml(emp.MaNV)}')" title="Click để xem chi tiết">
                <td><div class="person-cell"><span class="person-avatar emp-avatar-lg" style="background:${roleColor}15;color:${roleColor}">${escapeHtml(initials)}</span><span><strong>${escapeHtml(emp.TenNV)}</strong><small>${escapeHtml(emp.MaNV)}</small></span></div></td>
                <td><span class="emp-role-chip" style="background:${roleColor}12;color:${roleColor};border-color:${roleColor}30">${escapeHtml(emp.ChucVu)}</span></td>
                <td class="contact-cell"><span>${escapeHtml(emp.SDT || 'Chưa có SĐT')}</span><small>${escapeHtml(emp.Email || '')}</small></td>
                <td><span class="emp-date">${formatDate(emp.NgayVaoLam)}</span></td>
                <td><span class="badge ${isActive ? 'badge-success' : 'badge-secondary'}">${escapeHtml(emp.TrangThai)}</span></td>
                <td>${hasAccount ? `<span class="badge badge-info">${escapeHtml(emp.TenDangNhap)}</span>` : '<span class="badge badge-warning">Chưa cấp</span>'}</td>
                <td class="align-right"><div class="action-btns">
                    <button class="btn btn-outline" onclick="event.stopPropagation();editEmpById('${escapeHtml(emp.MaNV)}')">Chỉnh sửa</button>
                    ${isActive ? `<button class="btn btn-outline emp-btn-lock" onclick="event.stopPropagation();toggleEmpStatus('${escapeHtml(emp.MaNV)}','Nghỉ việc')" title="Cho nghỉ việc">🔒</button>` : `<button class="btn btn-outline emp-btn-unlock" onclick="event.stopPropagation();toggleEmpStatus('${escapeHtml(emp.MaNV)}','Đang làm việc')" title="Mở lại">🔓</button>`}
                </div></td>
            </tr>`;
        }).join('') : '<tr><td colspan="7" class="empty-state">Không tìm thấy nhân viên phù hợp.</td></tr>';
    };

    window.loadEmployees = async () => {
        const tbody = document.getElementById('empTableBody');
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Đang tải dữ liệu...</td></tr>';
        try {
            const res = await fetch('http://localhost:3000/api/employees', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tải danh sách nhân viên.');
            employees = data;
            renderEmployees();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state error-text">Không thể tải dữ liệu.</td></tr>';
            window.showToast(err.message || 'Lỗi tải danh sách nhân viên', 'error');
        }
    };

    window.openEmpModal = () => {
        isEditMode = false;
        document.getElementById('empModalTitle').textContent = 'Thêm nhân viên';
        document.getElementById('maNV').readOnly = false;
        document.getElementById('empAccountSection').style.display = 'none';
        document.querySelectorAll('.emp-field-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
        document.querySelectorAll('#empForm .input-error').forEach(el => el.classList.remove('input-error'));
        empForm.reset();
        updateAvatarPreview();
        empModal.style.display = 'flex';
        document.getElementById('maNV').focus();
    };

    window.closeEmpModal = () => { empModal.style.display = 'none'; };

    window.editEmpById = maNV => {
        const emp = employees.find(item => item.MaNV === maNV);
        if (!emp) return;
        isEditMode = true;
        document.getElementById('empModalTitle').textContent = 'Sửa thông tin nhân viên';
        document.getElementById('maNV').value = emp.MaNV;
        document.getElementById('maNV').readOnly = true;
        document.getElementById('tenNV').value = emp.TenNV;
        document.getElementById('chucVu').value = emp.ChucVu;
        document.getElementById('sdt').value = emp.SDT || '';
        document.getElementById('email').value = emp.Email || '';
        document.getElementById('diaChi').value = emp.DiaChi || '';
        document.getElementById('trangThai').value = emp.TrangThai;
        document.querySelectorAll('.emp-field-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
        document.querySelectorAll('#empForm .input-error').forEach(el => el.classList.remove('input-error'));

        const accountSection = document.getElementById('empAccountSection');
        const accountInfo = document.getElementById('empAccountInfo');
        if (Number(emp.HasAccount) === 1) {
            accountSection.style.display = '';
            accountInfo.innerHTML = `<div class="emp-account-badge active"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"><use href="#i-key"/></svg><div><strong>Tài khoản: ${escapeHtml(emp.TenDangNhap)}</strong><small>Đã được cấp quyền truy cập hệ thống</small></div></div>`;
        } else {
            accountSection.style.display = '';
            accountInfo.innerHTML = `<div class="emp-account-badge inactive"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"><use href="#i-user-plus"/></svg><div><strong>Chưa có tài khoản</strong><small>Nhân viên này chưa được cấp tài khoản đăng nhập</small></div></div>`;
        }
        updateAvatarPreview();
        empModal.style.display = 'flex';
    };

    window.openEmpDetail = maNV => {
        const emp = employees.find(item => item.MaNV === maNV);
        if (!emp) return;
        const initials = getInitials(emp.TenNV);
        const isActive = emp.TrangThai === 'Đang làm việc';
        const hasAccount = Number(emp.HasAccount) === 1;
        const roleColors = { 'Quản lý': '#2d6a4f', 'Nhân viên mua hàng': '#1b7fa3', 'Thủ kho': '#7c5cbf', 'Thu ngân': '#c97a0a', 'Kế toán': '#c4553d' };
        const rc = roleColors[emp.ChucVu] || '#40916c';

        document.getElementById('empDetailContent').innerHTML = `
            <div class="emp-detail-header">
                <div class="emp-detail-avatar" style="background:${rc}15;color:${rc}">${escapeHtml(initials)}</div>
                <div class="emp-detail-name">
                    <h2>${escapeHtml(emp.TenNV)}</h2>
                    <span class="emp-role-chip" style="background:${rc}12;color:${rc};border-color:${rc}30">${escapeHtml(emp.ChucVu)}</span>
                </div>
                <span class="badge ${isActive ? 'badge-success' : 'badge-secondary'}" style="margin-left:auto">${escapeHtml(emp.TrangThai)}</span>
            </div>
            <div class="emp-detail-sections">
                <div class="emp-detail-section">
                    <h4>Thông tin cá nhân</h4>
                    <div class="emp-detail-grid">
                        <div><small>Mã NV</small><p>${escapeHtml(emp.MaNV)}</p></div>
                        <div><small>Họ tên</small><p>${escapeHtml(emp.TenNV)}</p></div>
                        <div><small>Số điện thoại</small><p>${escapeHtml(emp.SDT || 'Chưa cập nhật')}</p></div>
                        <div><small>Email</small><p>${escapeHtml(emp.Email || 'Chưa cập nhật')}</p></div>
                        <div class="emp-detail-full"><small>Địa chỉ</small><p>${escapeHtml(emp.DiaChi || 'Chưa cập nhật')}</p></div>
                    </div>
                </div>
                <div class="emp-detail-section">
                    <h4>Thông tin công việc</h4>
                    <div class="emp-detail-grid">
                        <div><small>Chức vụ</small><p>${escapeHtml(emp.ChucVu)}</p></div>
                        <div><small>Ngày vào làm</small><p>${formatDate(emp.NgayVaoLam)}</p></div>
                        <div><small>Trạng thái</small><p>${escapeHtml(emp.TrangThai)}</p></div>
                        <div><small>Ca làm gần nhất</small><p>${escapeHtml(emp.CaLamGanNhat || 'Không có dữ liệu')}</p></div>
                    </div>
                </div>
                <div class="emp-detail-section">
                    <h4>Tài khoản hệ thống</h4>
                    ${hasAccount
                        ? `<div class="emp-account-badge active"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"><use href="#i-key"/></svg><div><strong>${escapeHtml(emp.TenDangNhap)}</strong><small>Tài khoản đang hoạt động</small></div></div>`
                        : `<div class="emp-account-badge inactive"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"><use href="#i-user-plus"/></svg><div><strong>Chưa có tài khoản</strong><small>Cần được cấp quyền truy cập</small></div></div>`
                    }
                </div>
            </div>
            <div class="emp-detail-actions">
                <button class="btn btn-primary" onclick="closeEmpDetail();editEmpById('${escapeHtml(emp.MaNV)}')">Chỉnh sửa hồ sơ</button>
                ${isActive
                    ? `<button class="btn btn-secondary" onclick="closeEmpDetail();toggleEmpStatus('${escapeHtml(emp.MaNV)}','Nghỉ việc')">Cho nghỉ việc</button>`
                    : `<button class="btn btn-secondary" onclick="closeEmpDetail();toggleEmpStatus('${escapeHtml(emp.MaNV)}','Đang làm việc')">Mở lại làm việc</button>`
                }
            </div>`;
        document.getElementById('empDetailBackdrop').style.display = 'flex';
    };

    window.closeEmpDetail = () => {
        document.getElementById('empDetailBackdrop').style.display = 'none';
    };

    window.toggleEmpStatus = async (maNV, newStatus) => {
        const emp = employees.find(item => item.MaNV === maNV);
        if (!emp) return;
        try {
            const res = await fetch(`http://localhost:3000/api/employees/${encodeURIComponent(maNV)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ...emp, TrangThai: newStatus })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể cập nhật trạng thái.');
            window.showToast(`Đã chuyển ${emp.TenNV} sang "${newStatus}"`, 'success');
            loadEmployees();
        } catch (err) {
            window.showToast(err.message || 'Lỗi cập nhật trạng thái', 'error');
        }
    };

    empForm.onsubmit = async event => {
        event.preventDefault();
        if (!validateForm()) return;
        const payload = {
            MaNV: document.getElementById('maNV').value.trim(),
            TenNV: document.getElementById('tenNV').value.trim(),
            ChucVu: document.getElementById('chucVu').value,
            SDT: document.getElementById('sdt').value.trim(),
            Email: document.getElementById('email').value.trim(),
            DiaChi: document.getElementById('diaChi').value.trim(),
            TrangThai: document.getElementById('trangThai').value
        };

        const url = isEditMode ? `http://localhost:3000/api/employees/${encodeURIComponent(payload.MaNV)}` : 'http://localhost:3000/api/employees';
        try {
            const res = await fetch(url, {
                method: isEditMode ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể lưu nhân viên.');
            window.showToast(data.message, 'success');
            closeEmpModal();
            loadEmployees();
        } catch (err) {
            window.showToast(err.message || 'Lỗi lưu nhân viên', 'error');
        }
    };

    // Debounced search
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderEmployees, 250);
    });
    roleFilter.addEventListener('change', renderEmployees);
    statusFilter.addEventListener('change', renderEmployees);

    // Real-time validation & avatar preview
    document.getElementById('tenNV')?.addEventListener('input', updateAvatarPreview);
    ['maNV', 'tenNV', 'sdt', 'email'].forEach(id => {
        document.getElementById(id)?.addEventListener('blur', () => {
            const v = document.getElementById(id).value.trim();
            if (id === 'maNV') validateField('maNV', v.length >= 2, 'Mã nhân viên phải có ít nhất 2 ký tự');
            if (id === 'tenNV') validateField('tenNV', v.length >= 2, 'Vui lòng nhập họ tên nhân viên');
            if (id === 'sdt') validateField('sdt', !v || /^0\d{9,10}$/.test(v), 'Số điện thoại không hợp lệ');
            if (id === 'email') validateField('email', !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email không hợp lệ');
        });
    });

    // Close detail panel on backdrop click
    document.getElementById('empDetailBackdrop')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeEmpDetail();
    });

    loadEmployees();
}
