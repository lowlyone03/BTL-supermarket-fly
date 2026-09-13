{
    const token = localStorage.getItem('fly_token');
    const API = window.FLY_API_BASE || 'http://localhost:3000/api';
    const currentUser = JSON.parse(localStorage.getItem('fly_user') || '{}');
    let roles = [];
    let matrix = [];
    let staff = { functions: [], roles: [], employees: [] };
    let selectedMaNV = '';
    let viewMode = 'staff';
    let draftCodes = [];
    let editingMaNV = '';
    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
    const fold = value => String(value || '').trim().toLocaleLowerCase('vi-VN');
    const initials = name => String(name || '?').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
    const sortedJoin = list => [...(list || [])].sort().join('|');
    const roleRank = name => ({
        'quản lý': 50, 'kế toán': 40, 'nhân viên mua hàng': 30, 'thủ kho': 20, 'thu ngân': 10
    }[fold(name)] || 0);
    const isManagerEmp = emp => fold(emp?.TenVaiTro || emp?.ChucVu) === 'quản lý';
    const isFounderEmp = emp => Boolean(emp?.IsFounder)
        || fold(emp?.TenDangNhap) === 'admin'
        || String(emp?.MaNV || '').toUpperCase() === 'NV_QL01';
    const isSelfEmp = emp => Boolean(emp?.MaNV) && emp.MaNV === currentUser.MaNV;
    const canChangeRole = emp => Boolean(emp?.HasAccount) && !isFounderEmp(emp) && !isSelfEmp(emp);
    const canEditCodes = emp => Boolean(emp?.HasAccount) && !isManagerEmp(emp);
    const roleNameOf = id => (staff.roles || []).find(role => Number(role.MaVaiTro) === Number(id))?.TenVaiTro || '';

    window.loadPermissions = async () => {
        try {
            const [rolesRes, matrixRes, staffRes] = await Promise.all([
                fetch(`${API}/roles`, { headers: headers() }),
                fetch(`${API}/roles/permissions`, { headers: headers() }),
                fetch(`${API}/roles/staff-permissions`, { headers: headers() })
            ]);
            roles = await rolesRes.json();
            matrix = await matrixRes.json();
            staff = await staffRes.json();
            if (!rolesRes.ok || !matrixRes.ok || !staffRes.ok) {
                throw new Error(staff.message || 'Không thể tải dữ liệu phân quyền.');
            }
            if (selectedMaNV && !staff.employees.some(item => item.MaNV === selectedMaNV)) selectedMaNV = '';
            renderShell();
        } catch (err) {
            window.showToast(err.message || 'Lỗi tải phân quyền', 'error');
        }
    };

    const groupedFunctions = () => {
        const map = {};
        (staff.functions || []).forEach(fn => {
            if (!map[fn.Nhom]) map[fn.Nhom] = [];
            map[fn.Nhom].push(fn);
        });
        return map;
    };

    const employeesByRole = () => {
        const buckets = (staff.roles || []).map(role => ({
            ...role,
            employees: staff.employees.filter(emp => Number(emp.MaVaiTro) === Number(role.MaVaiTro)
                || (!emp.MaVaiTro && fold(emp.ChucVu) === fold(role.TenVaiTro)))
        }));
        const leftovers = staff.employees.filter(emp => !buckets.some(role => role.employees.includes(emp)));
        if (leftovers.length) buckets.push({ MaVaiTro: 0, TenVaiTro: 'Chưa gán vai trò', codes: [], employees: leftovers });
        return buckets;
    };

    const selectedEmployee = () => staff.employees.find(item => item.MaNV === selectedMaNV) || null;

    const renderShell = () => {
        const container = document.getElementById('matrixContainer');
        const count = document.getElementById('permRecordCount');
        const saveBtn = document.getElementById('permSaveBtn');
        if (count) {
            const custom = staff.employees.filter(item => item.CheDo === 'TuyChinh').length;
            const promoted = staff.employees.filter(item => item.IsPromotedManager).length;
            count.textContent = `${staff.employees.length} nhân viên · ${custom} tùy chỉnh · ${promoted} admin được phong`;
        }
        if (saveBtn) {
            saveBtn.textContent = viewMode === 'role' ? 'Lưu mẫu vai trò' : 'Lưu quyền nhân viên';
            saveBtn.onclick = viewMode === 'role' ? saveRoleMatrix : saveEmployeeDraft;
            saveBtn.classList.remove('is-dirty');
        }
        if (!container) return;
        container.innerHTML = `
          <div class="perm-toolbar">
            <div class="perm-tabs" role="tablist">
              <button type="button" class="perm-tab${viewMode === 'staff' ? ' is-active' : ''}" data-perm-view="staff" role="tab" aria-selected="${viewMode === 'staff'}">Theo nhân viên</button>
              <button type="button" class="perm-tab${viewMode === 'role' ? ' is-active' : ''}" data-perm-view="role" role="tab" aria-selected="${viewMode === 'role'}">Mẫu vai trò (tổng)</button>
            </div>
            ${viewMode === 'staff'
                ? `<label class="perm-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="permSearch" type="search" placeholder="Tìm tên, mã NV, tài khoản..." autocomplete="off" spellcheck="false"></label>`
                : `<p class="perm-toolbar-hint">Đổi tại đây áp dụng mặc định cho nhân viên chưa có tùy chỉnh riêng. Cột Quản lý là mẫu cố định — không phải khóa từng người.</p>`}
          </div>
          <div id="permWorkspace" class="perm-workspace">${viewMode === 'role' ? renderRoleMatrix() : renderStaffWorkspace()}</div>`;
        container.querySelectorAll('[data-perm-view]').forEach(btn => {
            btn.addEventListener('click', () => {
                viewMode = btn.dataset.permView;
                renderShell();
            });
        });
        container.querySelector('#permSearch')?.addEventListener('input', event => {
            const q = fold(event.target.value);
            container.querySelectorAll('[data-emp-row]').forEach(row => {
                row.hidden = Boolean(q) && !fold(row.dataset.search || '').includes(q);
            });
            container.querySelectorAll('[data-role-group]').forEach(group => {
                const rows = [...group.querySelectorAll('[data-emp-row]')];
                const hit = rows.some(row => !row.hidden);
                group.hidden = Boolean(q) && rows.length > 0 && !hit;
                if (q && hit) group.open = true;
            });
        });
        bindStaffEvents(container);
        const tree = container.querySelector('.perm-tree');
        const activeRow = container.querySelector('.perm-emp-row.is-active');
        if (tree && activeRow) {
            const rowRect = activeRow.getBoundingClientRect();
            const treeRect = tree.getBoundingClientRect();
            const summary = activeRow.closest('.perm-role-group')?.querySelector('summary');
            const targetTop = summary ? summary.getBoundingClientRect().top : rowRect.top;
            if (targetTop < treeRect.top + 8 || rowRect.bottom > treeRect.bottom - 12) {
                tree.scrollTop += targetTop - treeRect.top - 10;
            }
        }
    };

    const renderStaffWorkspace = () => {
        const groups = employeesByRole();
        const emp = selectedEmployee();
        if (emp && editingMaNV !== emp.MaNV) {
            draftCodes = [...(emp.codes || [])];
            editingMaNV = emp.MaNV;
        }
        return `<div class="perm-staff-layout">
          <aside class="perm-tree">
            <div class="perm-tree-head">
              <span>Theo vai trò</span>
              <small>Chọn một người để xem quyền, nâng hoặc hạ vai trò.</small>
            </div>
            ${groups.map(renderRoleGroup).join('')}
          </aside>
          <section class="perm-editor">${emp ? renderEmployeeEditor(emp) : `<div class="perm-empty"><span class="perm-empty-icon"><svg aria-hidden="true"><use href="#i-users"/></svg></span><h3>Chọn một nhân viên</h3><p>Vai trò là mẫu chung. Nhân viên được phong admin vẫn hạ được. Chỉ tài khoản gốc bị khóa.</p></div>`}</section>
        </div>`;
    };

    const treeBadges = (emp) => {
        const items = [];
        if (isFounderEmp(emp)) items.push('<em class="perm-badge is-founder">Admin gốc</em>');
        else if (emp.IsPromotedManager || (isManagerEmp(emp) && !isFounderEmp(emp))) items.push('<em class="perm-badge is-promoted">Được phong</em>');
        else items.push(emp.CheDo === 'TuyChinh'
            ? '<em class="perm-badge is-custom">Tùy chỉnh riêng</em>'
            : '<em class="perm-badge is-role">Theo vai trò</em>');
        const extra = (emp.extra || []).length ? `<i class="perm-extra-n">+${emp.extra.length} quyền thêm</i>` : '';
        return `<span class="perm-emp-flags">${items.join('')}${extra}</span>`;
    };

    const renderRoleGroup = (role) => {
        const custom = role.employees.filter(item => item.CheDo === 'TuyChinh').length;
        const selectedHere = role.employees.some(item => item.MaNV === selectedMaNV);
        const open = !selectedMaNV || selectedHere;
        return `<details class="perm-role-group" ${open ? 'open' : ''} data-role-group="${role.MaVaiTro}">
          <summary>
            <span class="perm-role-name">${escapeHtml(role.TenVaiTro)}</span>
            <span class="perm-role-meta">${role.employees.length} người${custom ? ` · ${custom} tùy chỉnh` : ''}</span>
          </summary>
          ${role.employees.length ? role.employees.map(emp => {
            const active = emp.MaNV === selectedMaNV ? ' is-active' : '';
            const search = `${emp.TenNV} ${emp.MaNV} ${emp.TenDangNhap || ''}`;
            return `<button type="button" class="perm-emp-row${active}" data-emp-row data-manv="${escapeHtml(emp.MaNV)}" data-search="${escapeHtml(search)}">
              <b>${escapeHtml(initials(emp.TenNV))}</b>
              <span class="perm-emp-copy"><strong>${escapeHtml(emp.TenNV)}</strong><small>${escapeHtml(emp.MaNV)}${emp.TenDangNhap ? ` · ${escapeHtml(emp.TenDangNhap)}` : ''}${emp.HasAccount ? '' : ' · chưa có TK'}</small></span>
              ${treeBadges(emp)}
            </button>`;
          }).join('') : '<p class="perm-empty-inline">Chưa có nhân viên.</p>'}
        </details>`;
    };

    const statusCard = (emp) => {
        if (isFounderEmp(emp)) {
            return `<div class="perm-status is-lock">
              <span class="perm-badge is-founder">Admin gốc — không hạ cấp</span>
              <p>Đây là tài khoản hệ thống. Không đổi vai trò, không tắt từng chức năng. Nhân viên được phong Quản lý vẫn hạ được — không nhầm với người này.</p>
            </div>`;
        }
        if (isSelfEmp(emp)) {
            return `<div class="perm-status is-warn">
              <span class="perm-badge is-role">Tài khoản đang dùng</span>
              <p>Không tự đổi vai trò của chính mình để tránh mất quyền đang mở trang này. Hãy nhờ admin gốc đổi hộ nếu cần.</p>
            </div>`;
        }
        if (emp.IsPromotedManager || (isManagerEmp(emp) && !isFounderEmp(emp))) {
            const prev = emp.TenVaiTroTruoc ? ` Vai trò/bộ phận cũ: <b>${escapeHtml(emp.TenVaiTroTruoc)}</b>.` : '';
            return `<div class="perm-status is-ok">
              <span class="perm-badge is-promoted">Admin được phong — có thể hạ cấp</span>
              <p>Người này được nâng từ bộ phận lên Quản lý. Mẫu quyền Quản lý vẫn cố định; muốn thu quyền thì chọn vai trò mới bên dưới.${prev}</p>
            </div>`;
        }
        if (!emp.HasAccount) {
            return `<div class="perm-status is-warn">
              <span class="perm-badge is-role">Chưa có tài khoản</span>
              <p>Tạo tài khoản trước khi gán quyền đăng nhập hoặc đổi vai trò.</p>
            </div>`;
        }
        return `<div class="perm-status is-ok">
          <span class="perm-badge is-ok">Có thể đổi vai trò</span>
          <p>Có thể cấp thêm / tắt riêng từng chức năng, hoặc nâng / hạ vai trò. Đổi vai trò không khóa người này.</p>
        </div>`;
    };

    const roleChangeCard = (emp) => {
        if (!emp.HasAccount) {
            return '<p class="perm-empty-inline">Nhân viên chưa có tài khoản — tạo tài khoản trước khi gán quyền đăng nhập.</p>';
        }
        const locked = !canChangeRole(emp);
        const promoteOptions = (staff.roles || [])
            .filter(role => Number(role.MaVaiTro) !== Number(emp.MaVaiTro))
            .map(role => {
                const prev = Number(role.MaVaiTro) === Number(emp.MaVaiTroTruoc);
                return `<option value="${role.MaVaiTro}" ${prev ? 'selected' : ''}>${escapeHtml(role.TenVaiTro)}${prev ? ' — vai trò cũ' : ''}</option>`;
            })
            .join('');
        const manager = isManagerEmp(emp);
        const title = manager ? 'Hạ cấp / đổi vai trò' : 'Nâng cấp / đổi vai trò';
        const hint = locked
            ? (isFounderEmp(emp)
                ? 'Khóa vì đây là admin gốc, không phải vì đang là Quản lý.'
                : 'Khóa vì đây là tài khoản bạn đang đăng nhập.')
            : (manager
                ? 'Chọn vai trò mới rồi bấm Hạ vai trò. Có thể về bộ phận cũ hoặc vai trò thấp hơn.'
                : 'Chọn vai trò mới. Nâng lên Quản lý vẫn hạ được sau này.');
        const firstId = (staff.roles || []).find(role => Number(role.MaVaiTro) !== Number(emp.MaVaiTro)
            && (!emp.MaVaiTroTruoc || Number(role.MaVaiTro) === Number(emp.MaVaiTroTruoc)))?.MaVaiTro
            || (staff.roles || []).find(role => Number(role.MaVaiTro) !== Number(emp.MaVaiTro))?.MaVaiTro;
        const btnLabel = roleActionLabel(emp, firstId);
        return `<div class="perm-promote${locked ? ' is-locked' : ''}">
            <div class="perm-promote-copy">
              <h4>${title}</h4>
              <p>${hint}</p>
            </div>
            <label>Vai trò mới
              <select id="permPromoteRole" ${locked ? 'disabled' : ''}>${promoteOptions}</select>
            </label>
            ${canEditCodes(emp) ? '<label class="perm-keep"><input type="checkbox" id="permKeepOverrides"> Giữ quyền riêng sau khi đổi vai trò</label>' : ''}
            <div class="perm-promote-actions">
              <button type="button" class="btn btn-primary" id="permPromoteBtn" ${locked ? 'disabled' : ''}>${escapeHtml(btnLabel)}</button>
              ${canEditCodes(emp) ? '<button type="button" class="btn btn-outline" id="permResetBtn">Khôi phục theo vai trò</button>' : ''}
            </div>
          </div>`;
    };

    const roleActionLabel = (emp, nextId) => {
        const nextName = roleNameOf(nextId);
        if (!nextName) return 'Đổi vai trò';
        if (roleRank(nextName) < roleRank(emp.TenVaiTro || emp.ChucVu)) {
            return Number(nextId) === Number(emp.MaVaiTroTruoc)
                ? `Hạ về ${nextName}`
                : 'Hạ vai trò';
        }
        if (roleRank(nextName) > roleRank(emp.TenVaiTro || emp.ChucVu)) return 'Nâng vai trò';
        return 'Đổi vai trò';
    };

    const renderEmployeeEditor = (emp) => {
        const codesLocked = !canEditCodes(emp);
        const groups = groupedFunctions();
        const roleSet = new Set(emp.roleCodes || []);
        const draftSet = new Set(draftCodes);
        const extraCount = draftCodes.filter(code => !roleSet.has(code)).length;
        const revokedCount = [...roleSet].filter(code => !draftSet.has(code)).length;
        const custom = emp.CheDo === 'TuyChinh';
        const catalog = Object.entries(groups).map(([nhom, funcs]) => {
            const onCount = funcs.filter(fn => draftSet.has(fn.MaChucNang)).length;
            return `
          <div class="perm-cat" data-perm-cat>
            <div class="perm-cat-head"><h4>${escapeHtml(nhom)}</h4><span class="perm-cat-count" data-cat-count>${onCount} / ${funcs.length} được phép</span></div>
            <div class="perm-check-list">
            ${funcs.map(fn => {
                const on = draftSet.has(fn.MaChucNang);
                const inherited = roleSet.has(fn.MaChucNang);
                const mark = on && !inherited ? ' is-extra' : (!on && inherited ? ' is-revoked' : '');
                return `<label class="perm-check${mark}${codesLocked ? ' is-locked' : ''}">
                  <input type="checkbox" data-uc="${escapeHtml(fn.MaChucNang)}" data-inherited="${inherited ? '1' : '0'}" ${on ? 'checked' : ''} ${codesLocked ? 'disabled' : ''}>
                  <span class="perm-check-copy">
                    <strong>${escapeHtml(fn.TenChucNang)}</strong>
                    <small>${escapeHtml(fn.MaChucNang)}${inherited ? ' · có trong mẫu vai trò' : ' · ngoài mẫu vai trò'}</small>
                  </span>
                  ${on && !inherited ? '<em>thêm</em>' : ''}
                  ${!on && inherited ? '<em>tắt riêng</em>' : ''}
                </label>`;
            }).join('')}
            </div>
          </div>`;
        }).join('');
        const barText = codesLocked
            ? (isFounderEmp(emp) ? 'Admin gốc: quyền cố định, không hạ cấp.' : 'Mẫu Quản lý cố định. Hạ vai trò ở khung phía trên nếu muốn thu quyền.')
            : (custom ? 'Đang dùng quyền riêng, khớp với dữ liệu đã lưu.' : 'Đang khớp mẫu vai trò.');
        const headBadge = isFounderEmp(emp)
            ? '<span class="perm-badge is-founder">Admin gốc — không hạ cấp</span>'
            : (canChangeRole(emp)
                ? '<span class="perm-badge is-ok">Có thể đổi vai trò</span>'
                : '<span class="perm-badge is-role">Không tự đổi vai trò</span>');
        return `<div class="perm-editor-scroll">
          <header class="perm-editor-head">
            <div class="perm-identity">
              <b class="perm-avatar">${escapeHtml(initials(emp.TenNV))}</b>
              <div>
                <p class="perm-crumb">Vai trò <b>${escapeHtml(emp.TenVaiTro || emp.ChucVu || '—')}</b> → nhân viên</p>
                <h2>${escapeHtml(emp.TenNV)}</h2>
                <p class="perm-sub">${escapeHtml(emp.MaNV)}${emp.TenDangNhap ? ` · ${escapeHtml(emp.TenDangNhap)}` : ''}${emp.HasAccount ? '' : ' · chưa có TK'}</p>
              </div>
            </div>
            <div class="perm-head-side">
              ${headBadge}
              ${custom && !isManagerEmp(emp) ? '<span class="perm-badge is-custom">Tùy chỉnh riêng</span>' : ''}
              <div class="perm-id-stats">
                <span><strong data-stat-on>${draftCodes.length}</strong> được phép</span>
                <span><strong data-stat-extra>${extraCount}</strong> thêm</span>
                <span><strong data-stat-off>${revokedCount}</strong> tắt riêng</span>
              </div>
            </div>
          </header>
          ${statusCard(emp)}
          ${roleChangeCard(emp)}
          <div class="perm-catalog-head">
            <h3>Chức năng được phép</h3>
            <p>${codesLocked ? 'Các ô dưới đây chỉ để xem — mẫu Quản lý không chỉnh từng người.' : 'Tick thêm hoặc bỏ để tạo quyền riêng, không đổi cả nhóm vai trò.'}</p>
          </div>
          <div class="perm-catalog">${catalog}</div>
        </div>
        <footer class="perm-editor-bar"><p data-perm-dirty>${barText}</p></footer>`;
    };

    const paintPermissionRow = (box) => {
        const emp = selectedEmployee();
        const inherited = box.dataset.inherited === '1' || (emp?.roleCodes || []).includes(box.dataset.uc);
        const label = box.closest('.perm-check');
        const on = box.checked;
        if (label) {
            label.classList.toggle('is-extra', on && !inherited);
            label.classList.toggle('is-revoked', !on && inherited);
            let mark = label.querySelector('em');
            const text = on && !inherited ? 'thêm' : (!on && inherited ? 'tắt riêng' : '');
            if (text) {
                if (!mark) {
                    mark = document.createElement('em');
                    label.appendChild(mark);
                }
                mark.textContent = text;
            } else if (mark) mark.remove();
        }
        const cat = box.closest('[data-perm-cat]');
        if (cat) {
            const boxes = cat.querySelectorAll('input[data-uc]');
            const n = [...boxes].filter(el => el.checked).length;
            const el = cat.querySelector('[data-cat-count]');
            if (el) el.textContent = `${n} / ${boxes.length} được phép`;
        }
        const editor = box.closest('.perm-editor') || document;
        const roleSet = new Set(emp?.roleCodes || []);
        const extra = draftCodes.filter(code => !roleSet.has(code)).length;
        const revoked = [...roleSet].filter(code => !draftCodes.includes(code)).length;
        const setText = (sel, value) => {
            const node = editor.querySelector(sel);
            if (node) node.textContent = String(value);
        };
        setText('[data-stat-on]', draftCodes.length);
        setText('[data-stat-extra]', extra);
        setText('[data-stat-off]', revoked);
        const dirty = sortedJoin(draftCodes) !== sortedJoin(emp?.codes);
        document.getElementById('permSaveBtn')?.classList.toggle('is-dirty', dirty);
        const hint = editor.querySelector('[data-perm-dirty]');
        if (hint) {
            hint.textContent = dirty
                ? 'Đã chỉnh trên màn hình này — nhấn Lưu quyền nhân viên để ghi nhận.'
                : (emp?.CheDo === 'TuyChinh' ? 'Đang dùng quyền riêng, khớp với dữ liệu đã lưu.' : 'Đang khớp mẫu vai trò.');
        }
    };

    const bindStaffEvents = (root) => {
        root.querySelectorAll('[data-manv]').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedMaNV = btn.dataset.manv;
                const emp = selectedEmployee();
                draftCodes = [...(emp?.codes || [])];
                renderShell();
            });
        });
        root.querySelectorAll('[data-uc]').forEach(box => {
            box.addEventListener('change', () => {
                const code = box.dataset.uc;
                if (box.checked && !draftCodes.includes(code)) draftCodes.push(code);
                if (!box.checked) draftCodes = draftCodes.filter(item => item !== code);
                paintPermissionRow(box);
            });
        });
        const select = root.querySelector('#permPromoteRole');
        const actionBtn = root.querySelector('#permPromoteBtn');
        const syncLabel = () => {
            const emp = selectedEmployee();
            if (!emp || !actionBtn || !select) return;
            actionBtn.textContent = roleActionLabel(emp, select.value);
        };
        select?.addEventListener('change', syncLabel);
        syncLabel();
        root.querySelector('#permResetBtn')?.addEventListener('click', resetEmployee);
        actionBtn?.addEventListener('click', changeEmployeeRole);
    };

    const saveEmployeeDraft = async () => {
        const emp = selectedEmployee();
        if (!emp) return window.showToast('Chọn nhân viên trước khi lưu.', 'error');
        if (!canEditCodes(emp)) {
            return window.showToast(
                isFounderEmp(emp)
                    ? 'Admin gốc: quyền cố định.'
                    : 'Mẫu Quản lý cố định. Hãy hạ vai trò nếu muốn thu quyền.',
                'error'
            );
        }
        try {
            const res = await fetch(`${API}/roles/employees/${encodeURIComponent(emp.MaNV)}/permissions`, {
                method: 'PUT',
                headers: headers(),
                body: JSON.stringify({ codes: draftCodes })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không lưu được.');
            window.showToast(data.message, 'success');
            editingMaNV = '';
            await loadPermissions();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };

    const resetEmployee = async () => {
        const emp = selectedEmployee();
        if (!emp) return;
        try {
            const res = await fetch(`${API}/roles/employees/${encodeURIComponent(emp.MaNV)}/permissions/reset`, {
                method: 'POST',
                headers: headers()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không khôi phục được.');
            window.showToast(data.message, 'success');
            editingMaNV = '';
            await loadPermissions();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };

    const changeEmployeeRole = async () => {
        const emp = selectedEmployee();
        const select = document.getElementById('permPromoteRole');
        if (!emp || !select?.value) return window.showToast('Chọn vai trò mới.', 'error');
        if (!canChangeRole(emp)) {
            return window.showToast(
                isFounderEmp(emp) ? 'Admin gốc không được hạ cấp.' : 'Không thể tự đổi vai trò của chính mình.',
                'error'
            );
        }
        const nextName = roleNameOf(select.value);
        const fromName = emp.TenVaiTro || emp.ChucVu || '—';
        const demote = roleRank(nextName) < roleRank(fromName);
        const ok = window.confirm(demote
            ? `Hạ ${emp.TenNV} từ ${fromName} xuống ${nextName}? Nhân viên mất quyền của vai trò cũ sau khi đăng nhập lại.`
            : `Chuyển ${emp.TenNV} từ ${fromName} sang ${nextName}?`);
        if (!ok) return;
        try {
            const res = await fetch(`${API}/roles/employees/${encodeURIComponent(emp.MaNV)}/promote`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    MaVaiTro: Number(select.value),
                    GiuQuyenRieng: Boolean(document.getElementById('permKeepOverrides')?.checked)
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không đổi được vai trò.');
            window.showToast(data.message, 'success');
            editingMaNV = '';
            await loadPermissions();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    };

    function renderRoleMatrix() {
        const grouped = {};
        matrix.forEach(m => {
            if (!grouped[m.Nhom]) grouped[m.Nhom] = {};
            if (!grouped[m.Nhom][m.MaChucNang]) {
                grouped[m.Nhom][m.MaChucNang] = { ten: m.TenChucNang, perms: {} };
            }
            grouped[m.Nhom][m.MaChucNang].perms[m.MaVaiTro] = m.DuocPhep;
        });

        let html = `<div class="perm-role-board"><p class="perm-role-lead">Mẫu vai trò áp dụng mặc định cho nhân viên chưa có tùy chỉnh riêng. Cột Quản lý là mẫu vận hành cố định — khác với việc khóa admin gốc trên tab Theo nhân viên.</p>
        <div class="perm-matrix-scroller"><table class="perm-matrix"><thead><tr><th>Chức năng</th>`;
        roles.forEach(r => { html += `<th>${escapeHtml(r.TenVaiTro)}</th>`; });
        html += `</tr></thead><tbody>`;

        for (const [nhom, funcs] of Object.entries(grouped)) {
            html += `<tr><td colspan="${roles.length + 1}" class="group-header">${escapeHtml(nhom)}</td></tr>`;
            for (const [maCN, data] of Object.entries(funcs)) {
                html += `<tr><td><div class="perm-function"><span>${escapeHtml(data.ten)}</span><small>${escapeHtml(maCN)}</small></div></td>`;
                roles.forEach(r => {
                    const isChecked = data.perms[r.MaVaiTro] ? 'checked' : '';
                    const disabled = (r.TenVaiTro === 'Quản lý') ? 'disabled' : '';
                    const title = disabled ? 'title="Mẫu vai trò Quản lý được cố định"' : '';
                    html += `<td><input type="checkbox" data-role="${r.MaVaiTro}" data-func="${escapeHtml(maCN)}" ${isChecked} ${disabled} ${title}></td>`;
                });
                html += `</tr>`;
            }
        }
        html += `</tbody></table></div></div>`;
        return html;
    }

    window.savePermissions = async () => {
        if (viewMode === 'staff') return saveEmployeeDraft();
        return saveRoleMatrix();
    };

    const saveRoleMatrix = async () => {
        const checkboxes = document.querySelectorAll('.perm-matrix input[type="checkbox"]:not(:disabled)');
        const payload = Array.from(checkboxes).map(cb => ({
            MaVaiTro: parseInt(cb.getAttribute('data-role'), 10),
            MaChucNang: cb.getAttribute('data-func'),
            DuocPhep: cb.checked
        }));

        try {
            const res = await fetch(`${API}/roles/permissions`, {
                method: 'PUT',
                headers: headers(),
                body: JSON.stringify({ permissions: payload })
            });
            const data = await res.json();
            if (res.ok) {
                window.showToast(data.message, 'success');
                loadPermissions();
            } else window.showToast(data.message, 'error');
        } catch (err) {
            window.showToast('Lỗi lưu phân quyền', 'error');
        }
    };

    loadPermissions();
}
