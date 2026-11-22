// Scope — برنامج سطح المكتب (Electron). بيفتح نفس نظام الويب من ملفات محلية، وبياناته بتتحفظ على الجهاز.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
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
      { label: 'فتح مجلد النسخ الاحتياطي | Open backup folder', click: () => shell.openPath(bkDir()) },
      { label: 'استرجاع من نسخة احتياطية… | Restore backup…', click: () => win && win.webContents.executeJavaScript('window.scopeRestore&&window.scopeRestore()') },
      { label: 'فتح مجلد البيانات | Open data folder', click: () => shell.openPath(app.getPath('userData')) },
      { label: 'عن البرنامج | About', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Scope', message: 'Scope ' + app.getVersion(), detail: 'بياناتك محفوظة على هذا الجهاز فقط.\nYour data is stored on this computer only.\n\n' + app.getPath('userData') }) },
      { type: 'separator' },
      { role: 'quit', label: 'خروج | Quit' }
    ] },
    { label: 'تعديل | Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

// ---------- النسخ الاحتياطي التلقائي ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(c) { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} }
const bkDir = () => { const d = readCfg().backupDir || path.join(app.getPath('documents'), 'Scope-Backups'); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; };
const stamp = (d = new Date()) => d.toISOString().slice(0, 10);
function atomicWrite(file, data) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); }
const fmt = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const validBackup = (txt) => { try { const o = JSON.parse(txt); return !!(o && o.ing && o.branches && o.sales); } catch (e) { return false; } };
function listBackups() { const d = bkDir(); try { return fs.readdirSync(d).filter(f => /^Scope-.*\.json$/.test(f)).map(f => { const s = fs.statSync(path.join(d, f)); return { name: f, mtime: fmt(s.mtimeMs), t: s.mtimeMs, size: s.size }; }).sort((a, b) => b.t - a.t); } catch (e) { return []; } }
ipcMain.handle('bk:save', (e, json) => {
  try {
    if (typeof json !== 'string' || !validBackup(json)) return { ok: false };
    const d = bkDir();
    atomicWrite(path.join(d, 'Scope-latest.json'), json);
    atomicWrite(path.join(d, 'Scope-' + stamp() + '.json'), json);
    const daily = listBackups().filter(f => /^Scope-\d{4}-\d{2}-\d{2}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
    daily.slice(30).forEach(f => { try { fs.unlinkSync(path.join(d, f.name)); } catch (er) {} });
    return { ok: true, dir: d, at: Date.now() };
  } catch (err) { return { ok: false, error: String(err && err.message) }; }
});
ipcMain.handle('bk:info', () => ({ dir: bkDir(), files: listBackups().slice(0, 8).map(({ name, mtime, size }) => ({ name, mtime, size })) }));
ipcMain.handle('bk:latest', () => { try { const f = listBackups()[0]; if (!f) return null; const json = fs.readFileSync(path.join(bkDir(), f.name), 'utf8'); return validBackup(json) ? { name: f.name, mtime: f.mtime, json } : null; } catch (e) { return null; } });
ipcMain.handle('bk:choose', async () => { const r = await dialog.showOpenDialog(win, { title: 'اختر مجلد النسخ الاحتياطي', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; const c = readCfg(); c.backupDir = r.filePaths[0]; writeCfg(c); return c.backupDir; });
ipcMain.handle('bk:pick', async () => { const r = await dialog.showOpenDialog(win, { title: 'اختر ملف نسخة احتياطية', defaultPath: bkDir(), filters: [{ name: 'Scope backup', extensions: ['json'] }], properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null; try { return { name: path.basename(r.filePaths[0]), json: fs.readFileSync(r.filePaths[0], 'utf8') }; } catch (e) { return null; } });
ipcMain.handle('bk:open', () => shell.openPath(bkDir()));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { buildMenu(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
