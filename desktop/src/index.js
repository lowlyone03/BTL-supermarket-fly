const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const adminPageTemplates = require('./pages/admin/admin-page-templates');

app.commandLine.appendSwitch('lang', 'vi-VN');
app.commandLine.appendSwitch('accept-lang', 'vi-VN,vi');

if (require('electron-squirrel-startup')) {
  app.quit();
}

const ADMIN_PAGES = new Set(Object.keys(adminPageTemplates));

ipcMain.handle('load-admin-page', async (_event, pageName) => {
  if (!ADMIN_PAGES.has(pageName)) {
    throw new Error('Trang quản trị không hợp lệ.');
  }
  return adminPageTemplates[pageName];
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: 'Supermarket Fly - Nền tảng quản lý nội bộ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'pages', 'landing', 'landing.html'));
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
