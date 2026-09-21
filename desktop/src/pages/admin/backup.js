(() => {
  const API = `${window.FLY_API_BASE || 'http://localhost:3000/api'}/admin`;
  const token = localStorage.getItem('fly_token');
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const HANOI = 'Asia/Ho_Chi_Minh';
  const fmtTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: HANOI, dateStyle: 'short', timeStyle: 'medium' }) : '—';
  const fmtSize = bytes => {
    const size = Number(bytes) || 0;
    if (!size) return '—';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Yêu cầu thất bại.');
    return data;
  };

  let backups = [];
  let restoreTarget = null;

  const CREATE_BACKUP_HTML = '<svg aria-hidden="true"><use href="#i-shield"/></svg> Tạo backup ngay';
  const CONFIRM_RESTORE_HTML = 'Khôi phục ngay';
  const SAVE_MAINT_HTML = 'Lưu chế độ bảo trì';

  const emptyRow = (cols, title, hint) => `<tr><td colspan="${cols}"><div class="backup-empty"><svg aria-hidden="true"><use href="#i-box"/></svg><strong>${esc(title)}</strong><span>${esc(hint)}</span></div></td></tr>`;

  const setBusy = (busy) => {
    document.querySelector('.backup-module')?.classList.toggle('is-busy', busy);
  };

  const showTab = (name) => {
    if (!name) return;
    document.querySelectorAll('.backup-tab, [data-backup-tab]').forEach(btn => {
      const active = btn.dataset.backupTab === name;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-backup-panel]').forEach(panel => {
      const active = panel.dataset.backupPanel === name;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  };

  const syncMaintUi = (enabled, reason) => {
    const on = Boolean(enabled);
    const banner = document.getElementById('maintStatusBanner');
    const bannerReason = document.getElementById('maintBannerReason');
    const state = document.getElementById('maintToggleState');
    if (banner) banner.hidden = !on;
    if (bannerReason) {
      bannerReason.textContent = on
        ? (reason ? reason : 'Nhân viên bị chặn thao tác nghiệp vụ cho đến khi tắt.')
        : 'Nhân viên bị chặn thao tác nghiệp vụ cho đến khi tắt.';
    }
    if (state) state.textContent = on ? 'Đang bật' : 'Đang tắt';
  };

  const backupRoot = document.querySelector('.backup-module');
  backupRoot?.addEventListener('click', event => {
    const btn = event.target.closest('.backup-tab, [data-backup-tab]');
    if (!btn || !backupRoot.contains(btn)) return;
    event.preventDefault();
    showTab(btn.dataset.backupTab);
  });

  document.getElementById('maintEnabled')?.addEventListener('change', event => {
    const state = document.getElementById('maintToggleState');
    if (state) state.textContent = event.target.checked ? 'Đang bật' : 'Đang tắt';
  });

  const renderBackups = () => {
    const body = document.getElementById('backupTableBody');
    const restoreBody = document.getElementById('restoreTableBody');
    const normalizeSearch = window.FLY_SEARCH?.normalize || (value => String(value ?? '').toLowerCase());
    const keyword = normalizeSearch(document.getElementById('backupSearch')?.value || '');
    const filtered = keyword
      ? backups.filter(b => normalizeSearch(b.fileName).includes(keyword))
      : backups;
    const bakOnly = backups.filter(b => b.canRestore);
    if (body) {
      body.innerHTML = filtered.length
        ? filtered.map(b => {
            const badge = b.canRestore
              ? '<span class="badge badge-success">.bak · Khôi phục được</span>'
              : '<span class="badge badge-warning">JSON · Không khôi phục</span>';
            const iconClass = b.canRestore ? 'backup-file-icon' : 'backup-file-icon is-meta';
            const icon = b.canRestore ? '#i-shield' : '#i-doc';
            return `<tr>
              <td>
                <div class="backup-file-cell">
                  <span class="${iconClass}"><svg aria-hidden="true"><use href="${icon}"/></svg></span>
                  <div><strong>${esc(b.fileName)}</strong></div>
                </div>
              </td>
              <td>${badge}</td>
              <td>${fmtSize(b.size)}</td>
              <td>${fmtTime(b.createdAt)}</td>
              <td class="align-right backup-row-actions">
                ${b.canRestore ? `<button type="button" class="btn btn-outline backup-row-btn" data-download-backup="${esc(b.fileName)}">Tải xuống</button>` : ''}
              </td>
            </tr>`;
          }).join('')
        : emptyRow(
          5,
          keyword ? (window.FLY_SEARCH?.emptyMessage?.(document.getElementById('backupSearch')?.value, 'file backup', 'Không tìm thấy file backup.') || 'Không tìm thấy file backup.') : 'Chưa có file backup',
          keyword ? 'Thử từ khóa khác hoặc xóa ô tìm kiếm.' : 'Nhấn «Tạo backup ngay» để sao lưu CSDL thành file .bak trên máy chủ.'
        );
    }
    if (restoreBody) {
      restoreBody.innerHTML = bakOnly.length
        ? bakOnly.map(b => `<tr>
            <td>
              <div class="backup-file-cell">
                <span class="backup-file-icon"><svg aria-hidden="true"><use href="#i-shield"/></svg></span>
                <div><strong>${esc(b.fileName)}</strong><small>Có thể khôi phục</small></div>
              </div>
            </td>
            <td>${fmtSize(b.size)}</td>
            <td>${fmtTime(b.createdAt)}</td>
            <td class="align-right backup-row-actions">
              <button type="button" class="btn btn-danger backup-row-btn" data-restore-backup="${esc(b.fileName)}">Khôi phục</button>
            </td>
          </tr>`).join('')
        : emptyRow(4, 'Chưa có file .bak trên máy chủ', 'Tạo backup ở tab Sao lưu, hoặc chọn file .bak sẵn có trên máy này.');
    }
  };

  const loadBackups = async () => {
    const navSeq = Number(window.FLY_NAV_SEQ || 0);
    try {
      const data = await api(`${API}/backups`);
      if (Number(window.FLY_NAV_SEQ || 0) !== navSeq) return;
      backups = data.items || [];
      const total = document.getElementById('backupTotalCount');
      if (total) total.textContent = backups.filter(b => b.canRestore).length;
      const lastTime = document.getElementById('backupLastTime');
      const lastFile = document.getElementById('backupLastFile');
      const latest = data.latest || backups[0];
      if (lastTime) lastTime.textContent = latest ? fmtTime(latest.createdAt) : '—';
      if (lastFile) lastFile.textContent = latest ? latest.fileName : 'Chưa có backup';
      const statusCard = document.getElementById('backupStatusCard');
      const statusLevel = document.getElementById('backupStatusLevel');
      const statusText = document.getElementById('backupStatusText');
      const level = data.status?.level || 'warning';
      if (statusCard) {
        statusCard.classList.toggle('warning', level !== 'ok');
        statusCard.classList.toggle('ok', level === 'ok');
      }
      if (statusLevel) statusLevel.textContent = latest?.canRestore ? 'Đầy đủ' : (latest ? 'Không khôi phục' : 'Chưa có');
      if (statusText) statusText.textContent = data.status?.message || '—';
      if (data.projectBackupDir) {
        const pathEl = document.getElementById('backupProjectPath');
        if (pathEl) pathEl.textContent = data.projectBackupDir;
      }
      if (data.backupDir) {
        const serverEl = document.getElementById('backupServerPath');
        if (serverEl) serverEl.textContent = data.backupDir;
      }
      renderBackups();
    } catch (error) {
      const body = document.getElementById('backupTableBody');
      if (body) body.innerHTML = emptyRow(5, 'Không tải được danh sách', error.message);
    }
  };

  const loadMaintenance = async () => {
    try {
      const data = await api(`${API}/maintenance`);
      const enabled = document.getElementById('maintEnabled');
      const reason = document.getElementById('maintReason');
      if (enabled) enabled.checked = Boolean(data.enabled);
      if (reason) reason.value = data.reason || '';
      syncMaintUi(data.enabled, data.reason);
      const shifts = data.openShifts || [];
      const note = document.getElementById('maintOpenShiftNote');
      if (note) note.textContent = shifts.length
        ? `Đang mở ${shifts.length} ca: ${shifts.map(s => `${s.MaCa} (${s.TenNV})`).join(', ')}.`
        : 'Không có ca đang mở.';
      const ackWrap = document.getElementById('maintOpenAckWrap');
      if (ackWrap) ackWrap.hidden = !shifts.length;
      const list = document.getElementById('maintChecklist');
      if (list) {
        list.innerHTML = (data.checklist || []).map(item => `<li>${esc(item)}</li>`).join('');
      }
    } catch (error) {
      const note = document.getElementById('maintOpenShiftNote');
      if (note) note.textContent = error.message;
    }
  };

  const openRestoreModal = (target) => {
    restoreTarget = target;
    const modal = document.getElementById('restoreModal');
    const label = document.getElementById('restoreFileLabel');
    if (label) {
      label.textContent = target?.fileName
        ? `File: ${target.fileName}`
        : (target?.localPath ? `File máy: ${target.localPath}` : 'File đã chọn, sẽ tải lên máy chủ.');
    }
    document.getElementById('restoreAck').checked = false;
    document.getElementById('restoreBackupFirst').checked = true;
    document.getElementById('restorePhrase').value = '';
    document.getElementById('restorePassword').value = '';
    window.FLY_FIELDS?.setFieldError?.('restorePhrase', true, '');
    window.FLY_FIELDS?.setFieldError?.('restorePassword', true, '');
    modal.style.display = 'flex';
  };

  const closeRestoreModal = () => {
    document.getElementById('restoreModal').style.display = 'none';
    restoreTarget = null;
  };

  const saveCreatedBackup = async (fileName) => {
    if (!fileName || !window.flyDesktop?.saveBackupFile) return;
    const response = await fetch(`${API}/backups/${encodeURIComponent(fileName)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const buffer = await response.arrayBuffer();
    const saved = await window.flyDesktop.saveBackupFile({ defaultName: fileName, data: buffer });
    if (!saved?.canceled) window.showToast(`Đã lưu bản sao tại ${saved.filePath || fileName}.`, 'success');
  };

  document.getElementById('btnCreateBackup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnCreateBackup');
    btn.disabled = true;
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-refresh"/></svg> Đang tạo backup...';
    setBusy(true);
    try {
      const data = await api(`${API}/backup`, { method: 'POST' });
      window.showToast(data.message, 'success');
      await loadBackups();
      if (data.fileName) {
        try { await saveCreatedBackup(data.fileName); } catch { /* hủy hộp thoại */ }
      }
    } catch (error) {
      window.showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = CREATE_BACKUP_HTML;
      setBusy(false);
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
        throw new Error(data.message || 'Không thể tải file backup.');
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

  document.getElementById('restoreTableBody')?.addEventListener('click', event => {
    const restoreBtn = event.target.closest('[data-restore-backup]');
    if (restoreBtn) openRestoreModal({ fileName: restoreBtn.dataset.restoreBackup });
  });

  document.getElementById('btnRestoreFromFile')?.addEventListener('click', async () => {
    if (window.flyDesktop?.pickBackupFile) {
      const picked = await window.flyDesktop.pickBackupFile();
      if (picked?.canceled || !picked?.filePath) return;
      openRestoreModal({ localPath: picked.filePath, fileName: picked.fileName });
      return;
    }
    document.getElementById('restoreFileInput')?.click();
  });

  document.getElementById('restoreFileInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    openRestoreModal({ file });
    event.target.value = '';
  });

  document.getElementById('closeRestoreModal')?.addEventListener('click', closeRestoreModal);
  document.getElementById('cancelRestoreModal')?.addEventListener('click', closeRestoreModal);

  document.getElementById('restoreForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = window.FLY_FIELDS;
    const ack = document.getElementById('restoreAck').checked;
    const phrase = document.getElementById('restorePhrase').value;
    const password = document.getElementById('restorePassword').value;
    const saoLuuTruoc = document.getElementById('restoreBackupFirst').checked;
    const phraseOk = fields?.validateRestoreConfirm
      ? fields.validateRestoreConfirm(phrase)
      : { ok: String(phrase || '').toUpperCase().includes('KHOI PHUC'), message: 'Hãy gõ KHOI PHUC.' };
    fields?.setFieldError?.('restorePhrase', phraseOk.ok, phraseOk.message);
    fields?.setFieldError?.('restorePassword', Boolean(password), password ? '' : 'Nhập mật khẩu Quản lý.');
    if (!ack) {
      window.showToast('Hãy xác nhận đã hiểu dữ liệu hiện tại sẽ bị thay.', 'error');
      return;
    }
    if (!phraseOk.ok || !password || !restoreTarget) return;
    const btn = document.getElementById('confirmRestoreBtn');
    btn.disabled = true;
    btn.textContent = 'Đang khôi phục...';
    setBusy(true);
    try {
      let data;
      const payload = { xacNhan: phrase, daHieuMatDuLieu: true, MatKhau: password, saoLuuTruoc };
      if (restoreTarget.fileName && !restoreTarget.file && !restoreTarget.localPath) {
        data = await api(`${API}/backups/${encodeURIComponent(restoreTarget.fileName)}/restore`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } else {
        const form = new FormData();
        form.append('xacNhan', phrase);
        form.append('daHieuMatDuLieu', 'true');
        form.append('MatKhau', password);
        form.append('saoLuuTruoc', saoLuuTruoc ? 'true' : 'false');
        if (restoreTarget.localPath) form.append('localPath', restoreTarget.localPath);
        if (restoreTarget.file) form.append('TepBak', restoreTarget.file);
        const response = await fetch(`${API}/restore`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form
        });
        data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Không khôi phục được.');
      }
      closeRestoreModal();
      window.showToast(data.message || 'Đã khôi phục.', 'success');
      if (data.needRestart) {
        setTimeout(() => {
          localStorage.removeItem('fly_token');
          localStorage.removeItem('fly_user');
          window.location.href = '../login/login.html';
        }, 1800);
      }
    } catch (error) {
      window.showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = CONFIRM_RESTORE_HTML;
      setBusy(false);
    }
  });

  document.getElementById('btnSaveMaintenance')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveMaintenance');
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      const data = await api(`${API}/maintenance`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: document.getElementById('maintEnabled').checked,
          reason: document.getElementById('maintReason').value,
          daHieuCaMo: document.getElementById('maintOpenAck')?.checked === true
        })
      });
      window.showToast(data.message, 'success');
      await loadMaintenance();
    } catch (error) {
      window.showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = SAVE_MAINT_HTML;
    }
  });

  Promise.all([loadBackups(), loadMaintenance()]).catch(() => {});
})();
