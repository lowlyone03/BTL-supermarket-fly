{
    const token = localStorage.getItem('fly_token');
    let isEditMode = false;
    let employees = [];
    const empModal = document.getElementById('empModal');
    const empForm = document.getElementById('empForm');
    const searchInput = document.getElementById('empSearch');
    const roleFilter = document.getElementById('empRoleFilter');
    const statusFilter = document.getElementById('empStatusFilter');

    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

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
        document.getElementById('empTableBody').innerHTML = filtered.length ? filtered.map(emp => `
            <tr>
                <td><div class="person-cell"><span class="person-avatar">${escapeHtml(emp.TenNV.split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase())}</span><span><strong>${escapeHtml(emp.TenNV)}</strong><small>${escapeHtml(emp.MaNV)}</small></span></div></td>
                <td>${escapeHtml(emp.ChucVu)}</td>
                <td class="contact-cell"><span>${escapeHtml(emp.SDT || 'Chưa có SĐT')}</span><small>${escapeHtml(emp.Email || 'Chưa có email')}</small></td>
                <td><span class="badge ${emp.TrangThai === 'Đang làm việc' ? 'badge-success' : 'badge-secondary'}">${escapeHtml(emp.TrangThai)}</span></td>
                <td>${Number(emp.HasAccount) === 1 ? `<span class="badge badge-info">${escapeHtml(emp.TenDangNhap)}</span>` : '<span class="badge badge-warning">Chưa cấp</span>'}</td>
                <td class="align-right"><div class="action-btns"><button class="btn btn-outline" onclick="editEmpById('${escapeHtml(emp.MaNV)}')">Chỉnh sửa</button></div></td>
            </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Không tìm thấy nhân viên phù hợp.</td></tr>';
    };

    window.loadEmployees = async () => {
        const tbody = document.getElementById('empTableBody');
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Đang tải dữ liệu...</td></tr>';
        try {
            const res = await fetch('http://localhost:3000/api/employees', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tải danh sách nhân viên.');
            employees = data;
            renderEmployees();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state error-text">Không thể tải dữ liệu.</td></tr>';
            window.showToast(err.message || 'Lỗi tải danh sách nhân viên', 'error');
        }
    };

    window.openEmpModal = () => {
        isEditMode = false;
        document.getElementById('empModalTitle').textContent = 'Thêm nhân viên';
        document.getElementById('maNV').readOnly = false;
        empForm.reset();
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
        empModal.style.display = 'flex';
    };

    empForm.onsubmit = async event => {
        event.preventDefault();
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

    searchInput.addEventListener('input', renderEmployees);
    roleFilter.addEventListener('change', renderEmployees);
    statusFilter.addEventListener('change', renderEmployees);
    loadEmployees();
}
