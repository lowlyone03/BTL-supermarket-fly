const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flyDesktop', {
  loadAdminPage: pageName => ipcRenderer.invoke('load-admin-page', pageName)
});
