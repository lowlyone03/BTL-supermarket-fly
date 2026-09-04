{
    const token = localStorage.getItem('fly_token');
    const API = window.FLY_API_BASE || 'http://localhost:3000/api';
    let roles = [];
    let matrix = [];
    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    window.loadPermissions = async () => {
        try {
            const [rolesRes, matrixRes] = await Promise.all([
                fetch(`${API}/roles`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API}/roles/permissions`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            roles = await rolesRes.json();
            matrix = await matrixRes.json();
            if (!rolesRes.ok || !matrixRes.ok) throw new Error('Không thể tải dữ liệu phân quyền.');
            renderMatrix();
        } catch (err) {
            window.showToast('Lỗi tải phân quyền', 'error');
        }
    };

    function renderMatrix() {
        const container = document.getElementById('matrixContainer');

        // Nhóm theo Nhom chức năng
        const grouped = {};
        matrix.forEach(m => {
            if (!grouped[m.Nhom]) grouped[m.Nhom] = {};
            if (!grouped[m.Nhom][m.MaChucNang]) {
                grouped[m.Nhom][m.MaChucNang] = { ten: m.TenChucNang, perms: {} };
            }
            grouped[m.Nhom][m.MaChucNang].perms[m.MaVaiTro] = m.DuocPhep;
        });

        let html = `<table class="perm-matrix"><thead><tr><th>Chức năng</th>`;
        roles.forEach(r => { html += `<th>${escapeHtml(r.TenVaiTro)}</th>`; });
        html += `</tr></thead><tbody>`;

        for (const [nhom, funcs] of Object.entries(grouped)) {
            html += `<tr><td colspan="${roles.length + 1}" class="group-header">${escapeHtml(nhom)}</td></tr>`;
            for (const [maCN, data] of Object.entries(funcs)) {
                html += `<tr><td><div class="perm-function"><span>${escapeHtml(data.ten)}</span></div></td>`;
                roles.forEach(r => {
                    const isChecked = data.perms[r.MaVaiTro] ? 'checked' : '';
                    const disabled = (r.TenVaiTro === 'Quản lý') ? 'disabled' : ''; // Bộ quyền điều hành cốt lõi của Quản lý được cố định.
                    const title = disabled ? 'title="Quyền Quản lý được cố định"' : '';
                    html += `<td><input type="checkbox" data-role="${r.MaVaiTro}" data-func="${escapeHtml(maCN)}" ${isChecked} ${disabled} ${title}></td>`;
                });
                html += `</tr>`;
            }
        }
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    window.savePermissions = async () => {
        const checkboxes = document.querySelectorAll('.perm-matrix input[type="checkbox"]:not(:disabled)');
        const payload = Array.from(checkboxes).map(cb => ({
            MaVaiTro: parseInt(cb.getAttribute('data-role')),
            MaChucNang: cb.getAttribute('data-func'),
            DuocPhep: cb.checked
        }));

        try {
            const res = await fetch(`${API}/roles/permissions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
