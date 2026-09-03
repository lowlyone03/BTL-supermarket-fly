const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flyDesktop', {
  loadAdminPage: pageName => ipcRenderer.invoke('load-admin-page', pageName),
  saveBackupFile: ({ defaultName, data }) => ipcRenderer.invoke('save-backup-file', { defaultName, data }),
});
