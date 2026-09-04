const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flyDesktop', {
  loadAdminPage: pageName => ipcRenderer.invoke('load-admin-page', pageName),
  saveBackupFile: ({ defaultName, data }) => ipcRenderer.invoke('save-backup-file', { defaultName, data }),
  savePrintPdf: ({ html, defaultName, landscape }) => ipcRenderer.invoke('save-print-pdf', { html, defaultName, landscape }),
});
