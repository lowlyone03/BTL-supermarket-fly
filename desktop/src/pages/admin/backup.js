(() => {
  const API = `${window.FLY_API_BASE || 'http://localhost:3000/api'}/admin`;
  const token = localStorage.getItem('fly_token');
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const HANOI = 'Asia/Ho_Chi_Minh';
  const fmtTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: HANOI, dateStyle: 'short', timeStyle: 'medium' }) : '—';
  const fmtSize = bytes => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Yêu cầu thất bại.');
    return data;
  };

  let backups = [];

  const loadBackups = async () => {
    try {
      const data = await api('/backups');
      backups = data.items || [];
      document.getElementById('backupTotalCount').textContent = backups.length;
      if (backups.length) {
        document.getElementById('backupLastTime').textContent = fmtTime(backups[0].createdAt);
        document.getElementById('backupLastFile').textContent = backups[0].fileName;
      }
      renderBackups();
    } catch (error) {
      document.getElementById('backupTableBody').innerHTML = `<tr><td colspan="4" class="empty-state error-text">${esc(error.message)}</td></tr>`;
    }
  };

  const renderBackups = () => {
    const keyword = (document.getElementById('backupSearch')?.value || '').toLowerCase();
    const filtered = keyword ? backups.filter(b => b.fileName.toLowerCase().includes(keyword)) : backups;
    document.getElementById('backupTableBody').innerHTML = filtered.length
      ? filtered.map(b => `<tr>
          <td><strong>${esc(b.fileName)}</strong></td>
          <td>${fmtSize(b.size)}</td>
          <td>${fmtTime(b.createdAt)}</td>
          <td class="align-right"><button type="button" class="btn btn-outline" style="font-size:9px;padding:4px 10px;border:1px solid #cbd8d0;border-radius:8px;color:#2f5e4a" data-download-backup="${esc(b.fileName)}">Tải xuống</button></td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="empty-state">Chưa có file backup.</td></tr>';
  };

  const loadSecurityLogs = async () => {
    try {
      const data = await api('/security-logs');
      const logs = data.items || [];
      const today = new Date().toLocaleDateString('vi-VN', { timeZone: HANOI });
      const todayCount = logs.filter(l => new Date(l.ThoiGian).toLocaleDateString('vi-VN', { timeZone: HANOI }) === today).length;
      document.getElementById('securityEventCount').textContent = todayCount;
      document.getElementById('securityLogBody').innerHTML = logs.length
        ? logs.map(l => `<tr>
            <td><small>${fmtTime(l.ThoiGian)}</small></td>
            <td><strong>${esc(l.NguoiThaoTac)}</strong><small>${esc(l.TenVaiTro || '')}</small></td>
            <td>${esc(l.HanhDong)}<small>${esc(l.NoiDung || '')}</small></td>
          </tr>`).join('')
        : '<tr><td colspan="3" class="empty-state">Chưa có sự kiện bảo mật.</td></tr>';
    } catch (error) {
      document.getElementById('securityLogBody').innerHTML = `<tr><td colspan="3" class="empty-state error-text">${esc(error.message)}</td></tr>`;
    }
  };

  document.getElementById('btnCreateBackup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnCreateBackup');
    btn.disabled = true;
    btn.textContent = 'Đang tạo backup...';
    try {
      const data = await api('/backup', { method: 'POST' });
      window.showToast(data.message, 'success');
      await loadBackups();
    } catch (error) {
      window.showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg aria-hidden="true"><use href="#i-shield"/></svg> Tạo backup ngay';
    }
  });

  document.getElementById('backupSearch')?.addEventListener('input', renderBackups);

  document.getElementById('backupTableBody')?.addEventListener('click', async event => {
    const btn = event.target.closest('[data-download-backup]');
    if (!btn) return;
    const fileName = btn.dataset.downloadBackup;
    if (!fileName) return;
    btn.disabled = true;
    try {
      const response = await fetch(`${API}/backups/${encodeURIComponent(fileName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const statusHint = response.status === 401 ? 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.' : response.status === 404 ? 'File backup không tồn tại.' : (data.message || 'Không thể tải file backup.');
        throw new Error(statusHint);
      }
      const buffer = await response.arrayBuffer();
      if (!window.flyDesktop?.saveBackupFile) {
        throw new Error('Ứng dụng desktop chưa sẵn sàng lưu file. Hãy khởi động lại Electron.');
      }
      const saved = await window.flyDesktop.saveBackupFile({ defaultName: fileName, data: buffer });
      if (saved?.canceled) return;
      window.showToast(`Đã lưu ${fileName}.`, 'success');
    } catch (error) {
      window.showToast(error.message || 'Không thể tải file backup.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  Promise.all([loadBackups(), loadSecurityLogs()]).catch(() => {});
})();
