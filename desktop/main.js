// Scope — برنامج سطح المكتب (Electron). بيفتح نفس نظام الويب من ملفات محلية، وبياناته بتتحفظ على الجهاز.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, safeStorage } = require('electron');
const crypto = require('crypto');
const cp = require('child_process');
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
  if (currentLicense().ok) win.loadFile(path.join(__dirname, 'app', 'index.html'));
  else win.loadFile(path.join(__dirname, 'license', 'license.html'));
  // الروابط الخارجية تفتح في المتصفح، مش جوه البرنامج
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('close', saveState);
  win.on('focus', recheckLicense);
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
      { label: 'عن البرنامج | About', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Scope', message: 'Scope ' + app.getVersion(), detail: 'رقم الجهاز / Machine ID: ' + machineId() + '\n' + (currentLicense().ok ? 'مرخّص لـ: ' + (currentLicense().name || '—') + (currentLicense().exp ? ' — ينتهي ' + currentLicense().exp : '') : 'غير مفعّل') + '\n\n' + 'بياناتك محفوظة على هذا الجهاز فقط.\nYour data is stored on this computer only.\n\n' + app.getPath('userData') }) },
      { type: 'separator' },
      { role: 'quit', label: 'خروج | Quit' }
    ] },
    { label: 'تعديل | Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}


// ---------- ترخيص التفعيل: البرنامج مبيشتغلش على جهاز من غير كود من المالك ----------
const PUBKEYS = [`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAqjafhUXwSoaprVJE+8VQdJ7+Lm9nQS3X68twG69wKyQ=
-----END PUBLIC KEY-----`];
// وقت الاختبار الآلي بس (مرتبط بنفس مفتاح الاختبار): بنحاكي مرور الوقت
const nowMs = () => (process.env.SCOPE_E2E_PUBKEY && process.env.SCOPE_TEST_NOW) ? Date.parse(process.env.SCOPE_TEST_NOW) : Date.now();
const extraKey = () => { const k = process.env.SCOPE_E2E_PUBKEY; return k && /BEGIN PUBLIC KEY/.test(k) ? [k] : []; };
function rawMachineId() {
  try {
    if (process.platform === 'win32') { const o = cp.execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', windowsHide: true }); const m = o.match(/MachineGuid\s+REG_SZ\s+(\S+)/); if (m) return m[1]; }
    else if (process.platform === 'darwin') { const o = cp.execSync('ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf8' }); const m = o.match(/"IOPlatformUUID" = "([^"]+)"/); if (m) return m[1]; }
    else { for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) { try { const v = fs.readFileSync(f, 'utf8').trim(); if (v) return v; } catch (e) {} } }
  } catch (e) {}
  return null;
}
function machineId() {
  let raw = rawMachineId();
  if (!raw) { const f = path.join(app.getPath('userData'), 'mid.txt'); try { raw = fs.readFileSync(f, 'utf8'); } catch (e) { raw = crypto.randomUUID(); try { fs.writeFileSync(f, raw); } catch (e2) {} } }
  return crypto.createHash('sha256').update('scope-mid:' + raw).digest('hex').slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
}
function verifyCode(code) {
  try {
    const parts = String(code || '').trim().replace(/\s+/g, '').split('.');
    if (parts.length !== 2) return { ok: false, reason: 'bad' };
    const payload = Buffer.from(parts[0], 'base64url'), sig = Buffer.from(parts[1], 'base64url');
    if (!PUBKEYS.concat(extraKey()).some(k => { try { return crypto.verify(null, payload, k, sig); } catch (e) { return false; } })) return { ok: false, reason: 'bad' };
    const o = JSON.parse(payload.toString('utf8'));
    if (o.mid !== machineId()) return { ok: false, reason: 'machine' };
    if (o.exp && nowMs() > Date.parse(o.exp + 'T23:59:59')) return { ok: false, reason: 'expired', name: o.name, exp: o.exp };
    return { ok: true, name: o.name || '', exp: o.exp || null, daysLeft: o.exp ? Math.ceil((Date.parse(o.exp + 'T23:59:59') - nowMs()) / 864e5) : null };
  } catch (e) { return { ok: false, reason: 'bad' }; }
}
const licFiles = () => [path.join(app.getPath('userData'), 'license.json'), path.join(app.getPath('home'), '.scope-license.json')];
// حماية من رجوع تاريخ الجهاز لورا علشان الترخيص المنتهي ما يشتغلش تاني
const seenFiles = () => [path.join(app.getPath('userData'), 'seen.json'), path.join(app.getPath('home'), '.scope-seen.json')];
function lastSeen() { let t = 0; for (const f of seenFiles()) { try { t = Math.max(t, JSON.parse(fs.readFileSync(f, 'utf8')).t || 0); } catch (e) {} } return t; }
function markSeen() { const t = Math.max(lastSeen(), nowMs()); for (const f of seenFiles()) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ t })); } catch (e) {} } }
function currentLicense() {
  if (!app.isPackaged && process.env.SCOPE_LICENSE_DEV === '1') return { ok: true, name: 'dev' };
  let last = { ok: false, reason: 'none' };
  for (const f of licFiles()) { try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); const r = verifyCode(o.code); if (r.ok) { if (nowMs() + 2 * 864e5 < lastSeen()) return { ok: false, reason: 'clock', name: r.name }; markSeen(); return { ...r, code: o.code }; } last = r; } catch (e) {} }
  return last;
}
function saveLicense(code) { for (const f of licFiles()) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ code, at: Date.now() })); } catch (e) {} } }
const loadMain = () => { if (win) win.loadFile(path.join(__dirname, 'app', 'index.html')); };
ipcMain.handle('lic:status', () => { const r = currentLicense(); return { ok: !!r.ok, reason: r.reason, name: r.name, exp: r.exp, daysLeft: r.daysLeft === undefined ? null : r.daysLeft, mid: machineId() }; });
ipcMain.handle('lic:activate', (e, code) => { const r = verifyCode(code); if (r.ok && nowMs() + 2 * 864e5 < lastSeen()) return { ok: false, reason: 'clock' }; if (r.ok) { saveLicense(String(code).trim().replace(/\s+/g, '')); setTimeout(loadMain, 300); } return { ok: r.ok, reason: r.reason }; });

// ---------- النسخ الاحتياطي التلقائي ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(c) { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} }
const defaultDir = () => path.join(app.getPath('documents'), 'Scope-Backups');
const bkDir = () => { const d = readCfg().backupDir || defaultDir(); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; };
// مؤشرات خارج بيانات البرنامج: بتفضل موجودة حتى لو البرنامج اتمسح وانزّل تاني
const ptrFiles = () => [path.join(defaultDir(), 'location.json'), path.join(app.getPath('home'), '.scope-location.json')];
function writePointers(dir) { for (const f of ptrFiles()) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ dir, at: Date.now() })); } catch (e) {} } }
function readPointers() { const out = []; for (const f of ptrFiles()) { try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); if (o && o.dir) out.push(o.dir); } catch (e) {} } return out; }
const safeList = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
// كل الأماكن المحتملة للنسخ: الافتراضي + المؤشرات + السحابة + الفلاشات
function candidateDirs() {
  const c = new Set([defaultDir(), readCfg().backupDir, ...readPointers()].filter(Boolean));
  const home = app.getPath('home'), add = (p) => c.add(p);
  for (const n of safeList(home)) if (/^(OneDrive|Dropbox|Google ?Drive|iCloud|pCloud|MEGA|Sync)/i.test(n)) { add(path.join(home, n, 'Scope-Backups')); add(path.join(home, n, 'My Drive', 'Scope-Backups')); }
  if (process.platform === 'win32') { for (let i = 67; i <= 90; i++) { const d = String.fromCharCode(i) + ':\\'; add(d + 'Scope-Backups'); add(d + 'My Drive\\Scope-Backups'); } }
  if (process.platform === 'darwin') { for (const base of ['/Volumes', path.join(home, 'Library', 'CloudStorage')]) for (const n of safeList(base)) { add(path.join(base, n, 'Scope-Backups')); add(path.join(base, n, 'My Drive', 'Scope-Backups')); } add(path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Scope-Backups')); }
  if (process.platform === 'linux') { for (const base of ['/media', '/run/media', '/mnt']) for (const u of safeList(base)) { const p = path.join(base, u); add(path.join(p, 'Scope-Backups')); for (const n of safeList(p)) add(path.join(p, n, 'Scope-Backups')); } }
  return [...c];
}
function findAllBackups() { const out = []; for (const d of candidateDirs()) { for (const f of safeList(d)) { if (!/^Scope-.*\.json$/.test(f)) continue; try { const s = fs.statSync(path.join(d, f)); out.push({ dir: d, name: f, t: s.mtimeMs, mtime: fmt(s.mtimeMs) }); } catch (e) {} } } return out.sort((a, b) => b.t - a.t); }
const stamp = (d = new Date()) => d.toISOString().slice(0, 10);
function atomicWrite(file, data) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); }
const fmt = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const validBackup = (txt) => { try { const o = JSON.parse(txt); return !!(o && o.ing && o.branches && o.sales); } catch (e) { return false; } };
function listBackups() { const d = bkDir(); try { return fs.readdirSync(d).filter(f => /^Scope-.*\.json$/.test(f)).map(f => { const s = fs.statSync(path.join(d, f)); return { name: f, mtime: fmt(s.mtimeMs), t: s.mtimeMs, size: s.size }; }).sort((a, b) => b.t - a.t); } catch (e) { return []; } }
// ---- تشفير النسخ (AES-256-GCM + PBKDF2) — نفس صيغة نسخة المتصفح ----
let encPw = null;
function loadEncPw() { try { const c = readCfg(); if (c.encPw && safeStorage.isEncryptionAvailable()) encPw = safeStorage.decryptString(Buffer.from(c.encPw, 'base64')); } catch (e) { encPw = null; } }
function encPack(pw, txt) { const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.pbkdf2Sync(pw, salt, 250000, 32, 'sha256'), c = crypto.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([c.update(txt, 'utf8'), c.final()]), tag = c.getAuthTag(); return JSON.stringify({ scope: 1, enc: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: 250000, salt: salt.toString('base64'), iv: iv.toString('base64'), data: Buffer.concat([ct, tag]).toString('base64') }); }
function encUnpack(pw, o) { const salt = Buffer.from(o.salt, 'base64'), iv = Buffer.from(o.iv, 'base64'), buf = Buffer.from(o.data, 'base64'), tag = buf.subarray(buf.length - 16), ct = buf.subarray(0, buf.length - 16), key = crypto.pbkdf2Sync(pw, salt, o.iter || 250000, 32, 'sha256'), d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); }
const isEnv = (o) => !!(o && o.scope === 1 && o.enc && o.data);
function readBackupFile(file) { const raw = fs.readFileSync(file, 'utf8'); let o; try { o = JSON.parse(raw); } catch (e) { return null; } if (isEnv(o)) { if (encPw) { try { const j = encUnpack(encPw, o); return validBackup(j) ? { json: j } : null; } catch (e) { } } return { encrypted: true, raw }; } return validBackup(raw) ? { json: raw } : null; }
function reencryptAll() { const d = bkDir(); for (const f of listBackups()) { try { const p = path.join(d, f.name), raw = fs.readFileSync(p, 'utf8'); if (validBackup(raw)) atomicWrite(p, encPack(encPw, raw)); } catch (e) { } } }
ipcMain.handle('bk:encstatus', () => ({ enabled: !!encPw, persisted: !!readCfg().encPw, available: (() => { try { return safeStorage.isEncryptionAvailable(); } catch (e) { return false; } })() }));
ipcMain.handle('bk:setpw', (e, pw) => {
  try {
    const c = readCfg();
    if (!pw) { encPw = null; delete c.encPw; writeCfg(c); return { enabled: false }; }
    if (typeof pw !== 'string' || pw.length < 8) return { enabled: false };
    encPw = pw; delete c.encPw;
    try { if (safeStorage.isEncryptionAvailable()) c.encPw = safeStorage.encryptString(pw).toString('base64'); } catch (er) { }
    writeCfg(c); reencryptAll();
    return { enabled: true, persisted: !!c.encPw };
  } catch (err) { return { enabled: false }; }
});
ipcMain.handle('bk:checkpw', (e, pw) => !!encPw && typeof pw === 'string' && pw === encPw);
ipcMain.handle('bk:decrypt', (e, raw, pw) => { try { const j = encUnpack(String(pw), JSON.parse(raw)); return validBackup(j) ? { ok: true, json: j } : { ok: false }; } catch (er) { return { ok: false }; } });
ipcMain.handle('bk:save', (e, json) => {
  try {
    if (typeof json !== 'string' || !validBackup(json)) return { ok: false };
    const d = bkDir(), out = encPw ? encPack(encPw, json) : json;
    atomicWrite(path.join(d, 'Scope-latest.json'), out);
    atomicWrite(path.join(d, 'Scope-' + stamp() + '.json'), out);
    const daily = listBackups().filter(f => /^Scope-\d{4}-\d{2}-\d{2}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
    daily.slice(30).forEach(f => { try { fs.unlinkSync(path.join(d, f.name)); } catch (er) { } });
    return { ok: true, dir: d, at: Date.now(), encrypted: !!encPw };
  } catch (err) { return { ok: false, error: String(err && err.message) }; }
});
ipcMain.handle('bk:info', () => ({ dir: bkDir(), files: listBackups().slice(0, 8).map(({ name, mtime, size }) => ({ name, mtime, size })) }));
ipcMain.handle('bk:latest', () => { try { const f = findAllBackups()[0]; if (!f) return null; const r = readBackupFile(path.join(f.dir, f.name)); if (!r) return null; const c = readCfg(); if (!c.backupDir && f.dir !== defaultDir()) { c.backupDir = f.dir; writeCfg(c); } return { name: f.name, mtime: f.mtime, dir: f.dir, ...r }; } catch (e) { return null; } });
ipcMain.handle('bk:choose', async () => { const r = await dialog.showOpenDialog(win, { title: 'اختر مجلد النسخ الاحتياطي', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; let d = r.filePaths[0]; if (path.basename(d) !== 'Scope-Backups') d = path.join(d, 'Scope-Backups'); try { fs.mkdirSync(d, { recursive: true }); } catch (e) { return null; } const c = readCfg(); c.backupDir = d; writeCfg(c); writePointers(d); return d; });
ipcMain.handle('bk:pick', async () => { const r = await dialog.showOpenDialog(win, { title: 'اختر ملف نسخة احتياطية', defaultPath: bkDir(), filters: [{ name: 'Scope backup', extensions: ['json'] }], properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null; try { const x = readBackupFile(r.filePaths[0]); return x ? { name: path.basename(r.filePaths[0]), ...x } : null; } catch (e) { return null; } });
ipcMain.handle('bk:open', () => shell.openPath(bkDir()));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
function recheckLicense() { try { if (!win || win.isDestroyed()) return; const u = win.webContents.getURL(); if (/license\.html/.test(u)) return; if (!currentLicense().ok) win.loadFile(path.join(__dirname, 'license', 'license.html')); } catch (e) {} }
app.whenReady().then(() => { setInterval(recheckLicense, process.env.SCOPE_E2E_PUBKEY && process.env.SCOPE_LIC_RECHECK_MS ? +process.env.SCOPE_LIC_RECHECK_MS : 30 * 60 * 1000); loadEncPw(); try { const c = readCfg(); if (c.backupDir) writePointers(c.backupDir); } catch (e) {} buildMenu(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
