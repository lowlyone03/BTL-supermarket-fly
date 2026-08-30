{
    const token = localStorage.getItem('fly_token');
    const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';
    let logs = [];
    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    const actionBadge = action => {
        const normalized = String(action || '').toLocaleLowerCase('vi-VN');
        if (normalized.includes('đăng nhập')) return 'badge-info';
        if (normalized.includes('khóa') || normalized.includes('xóa')) return 'badge-danger';
        if (normalized.includes('thêm') || normalized.includes('tạo')) return 'badge-success';
        if (normalized.includes('đặt lại') || normalized.includes('đổi')) return 'badge-warning';
        return 'badge-secondary';
    };
    const hanoiDateKey = value => {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: HANOI_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date(value));
        const part = type => parts.find(item => item.type === type)?.value || '';
        return `${part('year')}-${part('month')}-${part('day')}`;
    };

    const renderLogs = () => {
        const search = document.getElementById('logSearch').value.trim().toLocaleLowerCase('vi-VN');
        const from = document.getElementById('logFrom').value;
        const to = document.getElementById('logTo').value;
        const filtered = logs.filter(log => {
            const text = [log.HanhDong, log.NoiDung, log.TenNV, log.TenDangNhap, log.BangLienQuan, log.MaBanGhi]
                .map(value => String(value || '').toLocaleLowerCase('vi-VN')).join(' ');
            const dateKey = hanoiDateKey(log.ThoiGian);
            return text.includes(search) && (!from || dateKey >= from) && (!to || dateKey <= to);
        });

        document.getElementById('logCount').textContent = `${filtered.length} bản ghi`;
        document.getElementById('logTableBody').innerHTML = filtered.length ? filtered.map(log => `
            <tr>
                <td>${new Date(log.ThoiGian).toLocaleString('vi-VN', { timeZone: HANOI_TIME_ZONE })}</td>
                <td><div class="person-cell"><span class="person-avatar">${escapeHtml(String(log.TenNV || 'HT').split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase())}</span><span><strong>${escapeHtml(log.TenNV || 'Hệ thống')}</strong><small>${escapeHtml(log.TenDangNhap || '')}</small></span></div></td>
                <td><span class="badge ${actionBadge(log.HanhDong)}">${escapeHtml(log.HanhDong)}</span></td>
                <td>${escapeHtml(log.BangLienQuan || '—')}</td>
                <td>${escapeHtml(log.MaBanGhi || '—')}</td>
                <td>${escapeHtml(log.NoiDung || '—')}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Không có nhật ký phù hợp.</td></tr>';
    };

    window.loadLogs = async () => {
        document.getElementById('logTableBody').innerHTML = '<tr><td colspan="6" class="empty-state">Đang tải dữ liệu...</td></tr>';
        try {
            const res = await fetch('http://localhost:3000/api/accounts/audit-log', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tải nhật ký.');
            logs = data;
            renderLogs();
        } catch (err) {
            window.showToast(err.message || 'Lỗi tải nhật ký hệ thống', 'error');
        }
    };

    window.clearLogFilters = () => {
        document.getElementById('logSearch').value = '';
        document.getElementById('logFrom').value = '';
        document.getElementById('logTo').value = '';
        window.FLY_VI_DATE?.refresh(document.getElementById('logFrom'));
        window.FLY_VI_DATE?.refresh(document.getElementById('logTo'));
        renderLogs();
    };

    ['logSearch', 'logFrom', 'logTo'].forEach(id => document.getElementById(id).addEventListener('input', renderLogs));
    loadLogs();
}
