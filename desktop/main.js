// Scope — برنامج سطح المكتب (Electron). بيفتح نفس نظام الويب من ملفات محلية، وبياناته بتتحفظ على الجهاز.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Scope');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win;
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; } }
function saveState() { try { if (!win || win.isDestroyed()) return; const b = win.getBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ ...b, max: win.isMaximized() })); } catch (e) {} }

function createWindow() {
  const st = loadState();
  try { const { screen } = require('electron'); const d = screen.getAllDisplays().some(d => st.x >= d.bounds.x && st.x < d.bounds.x + d.bounds.width - 50 && st.y >= d.bounds.y && st.y < d.bounds.y + d.bounds.height - 50); if (!d) { delete st.x; delete st.y; } } catch (e) { delete st.x; delete st.y; }
  win = new BrowserWindow({
    width: st.width || 1366, height: st.height || 860, x: st.x, y: st.y, minWidth: 380, minHeight: 600,
    title: 'Scope', icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#f6f7f4', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  if (st.max) win.maximize();
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // الروابط الخارجية تفتح في المتصفح، مش جوه البرنامج
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('close', saveState);
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const t = [
    { label: 'Scope', submenu: [
      { label: 'إعادة تحميل | Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() },
      { label: 'ملء الشاشة | Full screen', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { type: 'separator' },
      { label: 'تكبير | Zoom in', accelerator: 'CmdOrCtrl+=', click: () => win && win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5) },
      { label: 'تصغير | Zoom out', accelerator: 'CmdOrCtrl+-', click: () => win && win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5) },
      { label: 'الحجم الطبيعي | Reset zoom', accelerator: 'CmdOrCtrl+0', click: () => win && win.webContents.setZoomLevel(0) },
      { type: 'separator' },
      { label: 'طباعة | Print', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
      { type: 'separator' },
      { label: 'فتح مجلد البيانات | Open data folder', click: () => shell.openPath(app.getPath('userData')) },
      { label: 'عن البرنامج | About', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Scope', message: 'Scope ' + app.getVersion(), detail: 'بياناتك محفوظة على هذا الجهاز فقط.\nYour data is stored on this computer only.\n\n' + app.getPath('userData') }) },
      { type: 'separator' },
      { role: 'quit', label: 'خروج | Quit' }
    ] },
    { label: 'تعديل | Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { buildMenu(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
