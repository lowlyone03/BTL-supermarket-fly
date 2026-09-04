const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs/promises');
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

const saveBackupFile = async (event, payload = {}) => {
  const defaultName = path.basename(String(payload.defaultName || 'backup.bak'));
  const data = payload.data;
  if (!data) {
    throw new Error('Không có dữ liệu file để lưu.');
  }
  const parent = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(parent || undefined, {
    title: 'Lưu file backup',
    defaultPath: defaultName,
    filters: [
      { name: 'Backup', extensions: ['bak', 'json'] },
      { name: 'Tất cả các file', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await fs.writeFile(result.filePath, bytes);
  return { canceled: false, filePath: result.filePath };
};

const registerSaveBackupFileHandler = () => {
  ipcMain.removeHandler('save-backup-file');
  ipcMain.handle('save-backup-file', saveBackupFile);
};

const safePdfName = value => {
  const name = path.basename(String(value || 'chung-tu.pdf')).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').trim();
  return name.toLowerCase().endsWith('.pdf') ? name : `${name || 'chung-tu'}.pdf`;
};

const savePrintPdf = async (event, payload = {}) => {
  const html = String(payload.html || '');
  if (!html.trim()) {
    throw new Error('Không có nội dung bản in.');
  }
  const parent = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(parent || undefined, {
    title: 'Lưu bản in PDF',
    defaultPath: safePdfName(payload.defaultName),
    filters: [
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Tất cả các file', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const tempHtml = path.join(app.getPath('temp'), `fly-print-${Date.now()}-${process.pid}.html`);
  const printWin = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await fs.writeFile(tempHtml, html, 'utf8');
    await printWin.loadFile(tempHtml);
    const pdf = await printWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      landscape: Boolean(payload.landscape),
    });
    await fs.writeFile(result.filePath, pdf);
    await shell.openPath(result.filePath);
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    throw new Error(error.message || 'Không tạo được file PDF.');
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy();
    await fs.unlink(tempHtml).catch(() => {});
  }
};

const registerSavePrintPdfHandler = () => {
  ipcMain.removeHandler('save-print-pdf');
  ipcMain.handle('save-print-pdf', savePrintPdf);
};

registerSaveBackupFileHandler();
registerSavePrintPdfHandler();

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
  registerSaveBackupFileHandler();
  registerSavePrintPdfHandler();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
