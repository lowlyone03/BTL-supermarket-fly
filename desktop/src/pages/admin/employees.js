{
    const token = localStorage.getItem('fly_token');
    const API = window.FLY_API_BASE || 'http://localhost:3000/api';
    let isEditMode = false;
    let employees = [];
    const empModal = document.getElementById('empModal');
    const empForm = document.getElementById('empForm');
    const searchInput = document.getElementById('empSearch');
    const roleFilter = document.getElementById('empRoleFilter');
    const statusFilter = document.getElementById('empStatusFilter');
    let searchTimer = null;
    let employeesRequestController = null;
    let employeesRequestSeq = 0;

    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const getInitials = name => String(name || '').trim().split(/\s+/).slice(-2).map(p => p[0]).join('').toUpperCase();

    const toDateInput = value => {
        if (window.FLY_EMP_PROFILE?.toDateInput) return window.FLY_EMP_PROFILE.toDateInput(value);
        if (!value) return '';
        const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    };

    const formatDate = dateStr => {
        if (window.FLY_EMP_PROFILE?.formatDate) {
            return window.FLY_EMP_PROFILE.formatDate(dateStr) || '—';
        }
        if (!dateStr) return '—';
        const iso = toDateInput(dateStr);
        if (!iso) return '—';
        try { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${iso}T00:00:00`)); }
        catch { return '—'; }
    };

    const getTableColspan = () => {
        const thCount = document.querySelectorAll('.employee-table thead th').length;
        return thCount > 0 ? thCount : 6;
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const extractEmployeeList = payload => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.employees)) return payload.employees;
        return null;
    };

    const normalizeEmployee = raw => ({
        MaNV: raw?.MaNV ?? raw?.maNV ?? raw?.employeeId ?? '',
        TenNV: raw?.TenNV ?? raw?.tenNV ?? raw?.name ?? '',
        ChucVu: raw?.ChucVu ?? raw?.chucVu ?? raw?.roleName ?? '',
        CCCD: raw?.CCCD ?? raw?.cccd ?? raw?.soCCCD ?? '',
        NgaySinh: raw?.NgaySinh ?? raw?.ngaySinh ?? null,
        GioiTinh: raw?.GioiTinh ?? raw?.gioiTinh ?? '',
        SDT: raw?.SDT ?? raw?.sdt ?? raw?.phone ?? '',
        Email: raw?.Email ?? raw?.email ?? '',
        DiaChi: raw?.DiaChi ?? raw?.diaChi ?? raw?.address ?? '',
        TrangThai: raw?.TrangThai ?? raw?.trangThai ?? raw?.status ?? '',
        NgayVaoLam: raw?.NgayVaoLam ?? raw?.ngayVaoLam ?? null,
        HasAccount: raw?.HasAccount ?? raw?.hasAccount ?? raw?.coTaiKhoan ?? 0,
        TenDangNhap: raw?.TenDangNhap ?? raw?.tenDangNhap ?? raw?.username ?? '',
        CaLamGanNhat: raw?.CaLamGanNhat ?? raw?.caLamGanNhat ?? '',
        ...(window.FLY_EMP_PROFILE?.pick?.(raw) || {})
    });

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
        const cccd = document.getElementById('cccd').value.trim();
        const ngaySinh = document.getElementById('ngaySinh').value;
        const gioiTinh = document.getElementById('gioiTinh').value;
        const sdt = document.getElementById('sdt').value.trim();
        const email = document.getElementById('email').value.trim();
        const diaChi = document.getElementById('diaChi').value.trim();
        const ngayVaoLam = document.getElementById('ngayVaoLam').value;
        const chucVu = document.getElementById('chucVu').value;
        let ok = true;
        const fields = window.FLY_FIELDS;
        const codeResult = fields ? fields.validateEmployeeCode(maNV) : { ok: maNV.length >= 2, message: 'Mã nhân viên phải có ít nhất 2 ký tự' };
        const nameResult = fields ? fields.validateRequiredName(tenNV, 'Họ tên nhân viên') : { ok: tenNV.length >= 2, message: 'Vui lòng nhập họ tên nhân viên' };
        const strictCreate = !isEditMode;
        const cccdResult = fields
            ? (strictCreate ? fields.validateRequiredCccd?.(cccd) : fields.validateOptionalCccd(cccd))
            : { ok: !cccd || /^\d{9}(\d{3})?$/.test(cccd), message: 'CCCD phải gồm 12 chữ số (hoặc CMND 9 số).' };
        const birthResult = fields
            ? (strictCreate ? fields.validateRequiredPastDate?.(ngaySinh, 'Ngày sinh') : fields.validateOptionalPastDate(ngaySinh, 'Ngày sinh'))
            : { ok: !strictCreate || Boolean(ngaySinh), message: 'Ngày sinh là bắt buộc.' };
        const genderResult = fields
            ? (strictCreate ? fields.validateRequiredGender?.(gioiTinh) : fields.validateOptionalGender(gioiTinh))
            : { ok: !strictCreate || Boolean(gioiTinh), message: 'Giới tính là bắt buộc.' };
        const phoneResult = fields
            ? (strictCreate ? fields.validateRequiredVnPhone?.(sdt, 'Số điện thoại') : fields.validateOptionalVnPhone(sdt))
            : { ok: !sdt || /^0\d{9,10}$/.test(sdt), message: 'Số điện thoại không hợp lệ' };
        const emailResult = fields ? fields.validateOptionalEmail(email) : { ok: !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), message: 'Email không hợp lệ' };
        const addressResult = fields ? fields.validateOptionalNote(diaChi, 300) : { ok: true };
        const hireResult = fields
            ? (strictCreate ? fields.validateRequiredPastDate?.(ngayVaoLam, 'Ngày vào làm') : fields.validateOptionalPastDate(ngayVaoLam, 'Ngày vào làm'))
            : { ok: !strictCreate || Boolean(ngayVaoLam), message: 'Ngày vào làm là bắt buộc.' };
        if (addressResult.message) addressResult.message = addressResult.message.replace('Ghi chú', 'Địa chỉ');
        if (!validateField('maNV', codeResult.ok, codeResult.message || 'Mã nhân viên không hợp lệ')) ok = false;
        if (!validateField('tenNV', nameResult.ok, nameResult.message || 'Vui lòng nhập họ tên nhân viên')) ok = false;
        if (!validateField('cccd', cccdResult.ok, cccdResult.message || 'Số CCCD không hợp lệ')) ok = false;
        if (!validateField('ngaySinh', birthResult.ok, birthResult.message || 'Ngày sinh không hợp lệ')) ok = false;
        if (!validateField('gioiTinh', genderResult.ok, genderResult.message || 'Giới tính không hợp lệ')) ok = false;
        if (!validateField('sdt', phoneResult.ok, phoneResult.message || 'Số điện thoại không hợp lệ')) ok = false;
        if (!validateField('email', emailResult.ok, emailResult.message || 'Email không hợp lệ')) ok = false;
        if (!validateField('diaChi', addressResult.ok, addressResult.message || 'Địa chỉ không hợp lệ')) ok = false;
        if (!validateField('ngayVaoLam', hireResult.ok, hireResult.message || 'Ngày vào làm không hợp lệ')) ok = false;
        if (ngaySinh && ngayVaoLam && ngayVaoLam < ngaySinh) {
            if (!validateField('ngayVaoLam', false, 'Ngày vào làm không được trước ngày sinh.')) ok = false;
        }
        if (!validateField('chucVu', Boolean(chucVu), 'Vui lòng chọn chức vụ.')) ok = false;
        if (window.FLY_EMP_PROFILE?.validateProfileForm
            && !window.FLY_EMP_PROFILE.validateProfileForm(validateField, { strictCreate, includeCore: true })) ok = false;
        return ok;
    };

    const buildEmployeePayload = (emp, overrides = {}) => {
        const fields = window.FLY_FIELDS;
        const source = { ...emp, ...overrides };
        return {
            MaNV: fields?.validateEmployeeCode(source.MaNV).value ?? String(source.MaNV || '').trim().toUpperCase(),
            TenNV: fields?.validateRequiredName(source.TenNV, 'Họ tên nhân viên').value ?? String(source.TenNV || '').trim(),
            ChucVu: source.ChucVu,
            CCCD: fields?.validateOptionalCccd(source.CCCD).value ?? String(source.CCCD || '').trim(),
            NgaySinh: toDateInput(source.NgaySinh) || null,
            GioiTinh: fields?.validateOptionalGender(source.GioiTinh).value ?? String(source.GioiTinh || '').trim(),
            SDT: fields?.validateOptionalVnPhone(source.SDT).value ?? String(source.SDT || '').trim(),
            Email: fields?.validateOptionalEmail(source.Email).value ?? String(source.Email || '').trim(),
            DiaChi: fields?.validateOptionalNote(source.DiaChi, 300).value ?? String(source.DiaChi || '').trim(),
            NgayVaoLam: toDateInput(source.NgayVaoLam) || null,
            TrangThai: source.TrangThai,
            ...(() => {
                const profile = window.FLY_EMP_PROFILE?.pick?.(source) || {};
                if (profile.NgayCapCCCD) profile.NgayCapCCCD = toDateInput(profile.NgayCapCCCD);
                return profile;
            })()
        };
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
            [emp.TenNV, emp.MaNV, emp.ChucVu, emp.CCCD, emp.SDT, emp.Email, emp.MSTCaNhan, emp.SoBHXH]
                .some(value => normalizeSearch(value).includes(search))
            && (!selectedRole || emp.ChucVu === selectedRole)
            && (!selectedStatus || emp.TrangThai === selectedStatus)
        );
        setText('empCount', `${filtered.length} nhân viên`);
        setText('empActiveCount', employees.filter(emp => emp.TrangThai === 'Đang làm việc').length);
        setText('empAccountCount', employees.filter(emp => Number(emp.HasAccount) === 1).length);
        setText('empNoAccountCount', employees.filter(emp => Number(emp.HasAccount) !== 1 && emp.TrangThai === 'Đang làm việc').length);
        const onLeave = employees.filter(emp => emp.TrangThai === 'Nghỉ việc').length;
        setText('empOnLeave', onLeave);

        const roleColors = { 'Quản lý': '#2d6a4f', 'Nhân viên mua hàng': '#1b7fa3', 'Thủ kho': '#7c5cbf', 'Thu ngân': '#c97a0a', 'Kế toán': '#c4553d' };
        const getRoleColor = role => roleColors[role] || '#40916c';

        document.getElementById('empTableBody').innerHTML = filtered.length ? filtered.map(emp => {
            const initials = getInitials(emp.TenNV);
            const roleColor = getRoleColor(emp.ChucVu);
            const isActive = emp.TrangThai === 'Đang làm việc';
            const hasAccount = Number(emp.HasAccount) === 1;
            return `
            <tr class="emp-row" data-emp-action="detail" data-ma-nv="${escapeHtml(emp.MaNV)}">
                <td><div class="person-cell"><span class="person-avatar emp-avatar-lg" style="background:${roleColor}15;color:${roleColor}">${escapeHtml(initials)}</span><span><strong>${escapeHtml(emp.TenNV)}</strong><small>${escapeHtml(emp.MaNV)}${emp.CCCD ? ` · CCCD ${escapeHtml(emp.CCCD)}` : ''}</small></span></div></td>
                <td><span class="emp-role-chip" style="background:${roleColor}12;color:${roleColor};border-color:${roleColor}30">${escapeHtml(emp.ChucVu)}</span></td>
                <td class="contact-cell"><span>${escapeHtml(emp.SDT || 'Chưa có SĐT')}</span><small>${escapeHtml(emp.Email || '')}</small></td>
                <td><span class="badge ${isActive ? 'badge-success' : 'badge-secondary'}">${escapeHtml(emp.TrangThai || 'Đang làm việc')}</span></td>
                <td>${hasAccount ? `<span class="badge badge-info">${escapeHtml(emp.TenDangNhap)}</span>` : '<span class="badge badge-warning">Chưa cấp</span>'}</td>
                <td class="emp-actions-cell"><div class="emp-actions">
                    <button type="button" class="btn btn-outline emp-btn" data-emp-action="edit" data-ma-nv="${escapeHtml(emp.MaNV)}">Sửa</button>
                    ${isActive
                        ? `<button type="button" class="btn btn-danger emp-btn" data-emp-action="leave" data-ma-nv="${escapeHtml(emp.MaNV)}">Nghỉ việc</button>`
                        : `<button type="button" class="btn btn-secondary emp-btn" data-emp-action="restore" data-ma-nv="${escapeHtml(emp.MaNV)}">Mở lại</button>`}
                </div></td>
            </tr>`;
        }).join('') : `<tr><td colspan="${getTableColspan()}" class="empty-state">Không tìm thấy nhân viên phù hợp.</td></tr>`;
    };

    window.loadEmployees = async () => {
        const tbody = document.getElementById('empTableBody');
        const requestSeq = ++employeesRequestSeq;
        if (employeesRequestController) employeesRequestController.abort();
        employeesRequestController = new AbortController();

        tbody.innerHTML = `<tr><td colspan="${getTableColspan()}" class="empty-state">Đang tải dữ liệu...</td></tr>`;
        try {
            const res = await fetch(`${API}/employees`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: employeesRequestController.signal
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.message || 'Không thể tải danh sách nhân viên.');
            const list = extractEmployeeList(payload);
            if (!list) {
                throw new Error('Dữ liệu nhân viên trả về không đúng định dạng danh sách.');
            }
            if (requestSeq !== employeesRequestSeq) return;
            employees = list.map(normalizeEmployee);
            renderEmployees();
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('loadEmployees failed:', err);
            tbody.innerHTML = `<tr><td colspan="${getTableColspan()}" class="empty-state error-text">Không thể tải dữ liệu.</td></tr>`;
            window.showToast(err.message || 'Lỗi tải danh sách nhân viên', 'error');
        }
    };

    window.openEmpModal = () => {
        if (!empModal) return;
        isEditMode = false;
        document.getElementById('empModalTitle').textContent = 'Thêm nhân viên';
        document.getElementById('maNV').readOnly = false;
        document.getElementById('empAccountSection').style.display = 'none';
        document.querySelectorAll('.emp-field-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
        document.querySelectorAll('#empForm .input-error').forEach(el => el.classList.remove('input-error'));
        empForm.reset();
        window.FLY_EMP_PROFILE?.resetFormDefaults?.();
        document.querySelectorAll('.req-create').forEach(el => { el.hidden = false; });
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
        document.getElementById('cccd').value = emp.CCCD || '';
        document.getElementById('ngaySinh').value = toDateInput(emp.NgaySinh);
        document.getElementById('gioiTinh').value = emp.GioiTinh || '';
        document.getElementById('chucVu').value = emp.ChucVu;
        document.getElementById('sdt').value = emp.SDT || '';
        document.getElementById('email').value = emp.Email || '';
        document.getElementById('diaChi').value = emp.DiaChi || '';
        document.getElementById('ngayVaoLam').value = toDateInput(emp.NgayVaoLam);
        document.getElementById('trangThai').value = emp.TrangThai;
        window.FLY_EMP_PROFILE?.fillForm?.(emp);
        document.querySelectorAll('.req-create').forEach(el => { el.hidden = true; });
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

        const syll = window.FLY_EMP_PROFILE?.renderSyllViews?.(emp, {
            initials, roleColor: rc, workStatus: emp.TrangThai, shiftLine: emp.CaLamGanNhat || 'Không có dữ liệu'
        }) || '';
        document.getElementById('empDetailContent').innerHTML = `
            <div class="emp-detail-header">
                <div class="emp-detail-name">
                    <p class="module-kicker">HỒ SƠ NHÂN SỰ</p>
                    <h2>${escapeHtml(emp.TenNV)}</h2>
                    <span class="emp-role-chip" style="background:${rc}12;color:${rc};border-color:${rc}30">${escapeHtml(emp.ChucVu)}</span>
                </div>
                <span class="badge ${isActive ? 'badge-success' : 'badge-secondary'}" style="margin-left:auto">${escapeHtml(emp.TrangThai)}</span>
            </div>
            ${syll}
            <div class="emp-detail-sections">
                <div class="emp-detail-section">
                    <h4>Tài khoản hệ thống</h4>
                    ${hasAccount
                        ? `<div class="emp-account-badge active"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"><use href="#i-key"/></svg><div><strong>${escapeHtml(emp.TenDangNhap)}</strong><small>Tài khoản đang hoạt động</small></div></div>`
                        : `<div class="emp-account-badge inactive"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"><use href="#i-user-plus"/></svg><div><strong>Chưa có tài khoản</strong><small>Cần được cấp quyền truy cập</small></div></div>`
                    }
                </div>
            </div>
            <div class="emp-detail-actions">
                <button type="button" class="btn btn-primary" data-emp-action="edit" data-ma-nv="${escapeHtml(emp.MaNV)}">Chỉnh sửa hồ sơ</button>
                ${isActive
                    ? `<button type="button" class="btn btn-danger" data-emp-action="leave" data-ma-nv="${escapeHtml(emp.MaNV)}">Cho nghỉ việc</button>`
                    : `<button type="button" class="btn btn-secondary" data-emp-action="restore" data-ma-nv="${escapeHtml(emp.MaNV)}">Mở lại làm việc</button>`
                }
            </div>`;
        const backdrop = document.getElementById('empDetailBackdrop');
        if (backdrop) backdrop.style.display = 'flex';
    };

    window.closeEmpDetail = () => {
        document.getElementById('empDetailBackdrop').style.display = 'none';
    };

    window.toggleEmpStatus = async (maNV, newStatus) => {
        const emp = employees.find(item => item.MaNV === maNV);
        if (!emp) return;
        const confirmText = newStatus === 'Nghỉ việc'
            ? `Cho ${emp.TenNV} nghỉ việc? Tài khoản đăng nhập (nếu có) sẽ bị khóa.`
            : `Mở lại làm việc cho ${emp.TenNV}?`;
        if (!window.confirm(confirmText)) return;
        try {
            const res = await fetch(`${API}/employees/${encodeURIComponent(maNV)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(buildEmployeePayload(emp, { TrangThai: newStatus }))
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể cập nhật trạng thái.');
            window.showToast(`Đã chuyển ${emp.TenNV} sang "${newStatus}"`, 'success');
            closeEmpDetail();
            loadEmployees();
        } catch (err) {
            window.showToast(err.message || 'Lỗi cập nhật trạng thái', 'error');
        }
    };

    const handleEmpAction = event => {
        const trigger = event.target.closest('[data-emp-action]');
        if (!trigger) return;
        event.preventDefault();
        event.stopPropagation();
        const maNV = trigger.dataset.maNv;
        const action = trigger.dataset.empAction;
        if (action === 'edit') {
            closeEmpDetail();
            editEmpById(maNV);
            return;
        }
        if (action === 'leave') return toggleEmpStatus(maNV, 'Nghỉ việc');
        if (action === 'restore') return toggleEmpStatus(maNV, 'Đang làm việc');
        if (action === 'detail') return openEmpDetail(maNV);
    };

    empForm.onsubmit = async event => {
        event.preventDefault();
        if (!validateForm()) return;
        const payload = buildEmployeePayload({
            MaNV: document.getElementById('maNV').value,
            TenNV: document.getElementById('tenNV').value,
            ChucVu: document.getElementById('chucVu').value,
            CCCD: document.getElementById('cccd').value,
            NgaySinh: document.getElementById('ngaySinh').value,
            GioiTinh: document.getElementById('gioiTinh').value,
            SDT: document.getElementById('sdt').value,
            Email: document.getElementById('email').value,
            DiaChi: document.getElementById('diaChi').value,
            NgayVaoLam: document.getElementById('ngayVaoLam').value,
            TrangThai: document.getElementById('trangThai').value,
            ...(window.FLY_EMP_PROFILE?.collectFromForm?.() || {})
        });

        const url = isEditMode ? `${API}/employees/${encodeURIComponent(payload.MaNV)}` : `${API}/employees`;
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

    document.getElementById('empAddBtn')?.addEventListener('click', openEmpModal);
    document.getElementById('empRefreshBtn')?.addEventListener('click', () => loadEmployees());
    document.getElementById('empTableBody')?.addEventListener('click', handleEmpAction);
    document.getElementById('empDetailContent')?.addEventListener('click', handleEmpAction);
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderEmployees, 250);
    });
    roleFilter?.addEventListener('change', renderEmployees);
    statusFilter?.addEventListener('change', renderEmployees);

    // Real-time validation & avatar preview
    document.getElementById('tenNV')?.addEventListener('input', updateAvatarPreview);
    document.getElementById('diaChi')?.addEventListener('blur', () => {
        const choO = document.getElementById('choOHienNay');
        const diaChi = document.getElementById('diaChi')?.value?.trim();
        if (choO && !choO.value.trim() && diaChi) choO.value = diaChi;
    });
    const profileBlurIds = window.FLY_EMP_PROFILE?.blurFieldIds || [];
    ['maNV', 'tenNV', 'cccd', 'ngaySinh', 'gioiTinh', 'sdt', 'email', 'diaChi', 'ngayVaoLam', ...profileBlurIds].forEach(id => {
        document.getElementById(id)?.addEventListener('blur', () => {
            const v = document.getElementById(id).value.trim();
            const fields = window.FLY_FIELDS;
            if (id === 'maNV') {
                const result = fields ? fields.validateEmployeeCode(v) : { ok: v.length >= 2, message: 'Mã nhân viên phải có ít nhất 2 ký tự' };
                validateField('maNV', result.ok, result.message);
            }
            if (id === 'tenNV') {
                const result = fields ? fields.validateRequiredName(v, 'Họ tên nhân viên') : { ok: v.length >= 2, message: 'Vui lòng nhập họ tên nhân viên' };
                validateField('tenNV', result.ok, result.message);
            }
            if (id === 'cccd') {
                const result = fields ? fields.validateOptionalCccd(v) : { ok: !v || /^\d{9}(\d{3})?$/.test(v), message: 'CCCD phải gồm 12 chữ số (hoặc CMND 9 số).' };
                validateField('cccd', result.ok, result.message);
            }
            if (id === 'ngaySinh') {
                const result = fields ? fields.validateOptionalPastDate(v, 'Ngày sinh') : { ok: true };
                validateField('ngaySinh', result.ok, result.message);
            }
            if (id === 'gioiTinh') {
                const result = fields ? fields.validateOptionalGender(v) : { ok: true };
                validateField('gioiTinh', result.ok, result.message);
            }
            if (id === 'sdt') {
                const result = fields ? fields.validateOptionalVnPhone(v) : { ok: !v || /^0\d{9,10}$/.test(v), message: 'Số điện thoại không hợp lệ' };
                validateField('sdt', result.ok, result.message);
            }
            if (id === 'email') {
                const result = fields ? fields.validateOptionalEmail(v) : { ok: !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: 'Email không hợp lệ' };
                validateField('email', result.ok, result.message);
            }
            if (id === 'diaChi') {
                const result = fields ? fields.validateOptionalNote(v, 300) : { ok: true };
                validateField('diaChi', result.ok, result.message?.replace('Ghi chú', 'Địa chỉ'));
            }
            if (id === 'ngayVaoLam') {
                const ngaySinh = document.getElementById('ngaySinh').value;
                const result = fields ? fields.validateOptionalPastDate(v, 'Ngày vào làm') : { ok: true };
                if (!result.ok) validateField('ngayVaoLam', false, result.message);
                else if (ngaySinh && v && v < ngaySinh) validateField('ngayVaoLam', false, 'Ngày vào làm không được trước ngày sinh.');
                else validateField('ngayVaoLam', true, '');
            }
            if (profileBlurIds.includes(id)) {
                window.FLY_EMP_PROFILE?.validateProfileForm?.(validateField);
            }
        });
    });

    // Close detail panel on backdrop click
    document.getElementById('empDetailBackdrop')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeEmpDetail();
    });

    loadEmployees();
}
