// اختبار شامل للبرنامج المثبّت (Electron) — بيشتغل على Windows وMac وLinux.
// الاستخدام: APP_EXEC=<مسار البرنامج> node e2e/e2e.js
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require('playwright'); }
const { _electron } = pw;
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const EXEC = process.env.APP_EXEC;
if (!EXEC) { console.error('APP_EXEC is required'); process.exit(2); }
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'scope-e2e'); fs.mkdirSync(OUT, { recursive: true });
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-ud-'));
const crypto = require('crypto');
// مفتاح اختبار مؤقت: بيتحط في البرنامج عن طريق متغير بيئة علشان نختبر التفعيل الحقيقي بدون المفتاح الخاص بتاع المالك
const TK = crypto.generateKeyPairSync('ed25519');
const TPUB = TK.publicKey.export({ type: 'spki', format: 'pem' });
const mkCode = (mid, o = {}, key = TK.privateKey) => { const payload = Buffer.from(JSON.stringify({ v: 1, mid, name: o.name || 'QA', exp: o.exp === undefined ? null : o.exp, iat: '2026-01-01' })); return payload.toString('base64url') + '.' + crypto.sign(null, payload, key).toString('base64url'); };
try { fs.rmSync(path.join(os.homedir(), '.scope-license.json'), { force: true }); fs.rmSync(path.join(os.homedir(), '.scope-seen.json'), { force: true }); } catch (e) { }
const ENV = { ...process.env, SCOPE_E2E_PUBKEY: TPUB };
const results = []; const errs = [];
const check = (name, ok, extra) => { results.push([name, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  -> ' + extra : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const launch = () => _electron.launch({ executablePath: EXEC, args: ['--no-sandbox', '--user-data-dir=' + UD], env: ENV, timeout: 60000 });
async function activateNow(w) { const mid = await ev(w, () => scopeDesktop.licStatus().then(s => s.mid)); await w.fill('#lic_code', mkCode(mid)); await w.click('#go'); await w.waitForFunction(() => document.title === 'Scope', null, { timeout: 20000 }); await sleep(1500); }
async function open(app) { const w = await app.firstWindow(); w.on('pageerror', e => errs.push(e.message)); await w.waitForLoadState('domcontentloaded'); await sleep(1500); if (await w.locator('#lic_code').count()) await activateNow(w); return w; }
const ev = (w, f, a) => w.evaluate(f, a);
async function allPages(w, label) { const tabs = await ev(w, () => TABS.filter(x => can(x[0])).map(x => x[0])); let bad = 0, empty = 0; for (const t of tabs) { try { await ev(w, t => go(t), t); await sleep(60); if (!(await w.locator('main').innerText()).trim()) empty++; } catch (e) { bad++; console.log('  throw on', t, String(e.message).split('\n')[0]); } } check(label + ': كل الصفحات تفتح (' + tabs.length + ')', bad === 0 && empty === 0, 'throws=' + bad + ' empty=' + empty); }

(async () => {
  let app = await launch(); let w = await app.firstWindow(); w.on('pageerror', e => errs.push(e.message)); await w.waitForLoadState('domcontentloaded'); await sleep(1500);
  // ===== التفعيل (الباسورد بتاع التثبيت) =====
  check('L1. من غير ترخيص: بتظهر شاشة التفعيل بدل البرنامج', (await w.locator('#lic_code').count()) === 1 && (await w.title()) === 'تفعيل Scope');
  const mid = await ev(w, () => scopeDesktop.licStatus().then(s => s.mid)); check('L2. رقم الجهاز ظاهر بصيغة صحيحة', /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(mid), mid);
  const tryCode = async (code) => { await w.fill('#lic_code', code); await w.click('#go'); await sleep(900); return (await w.locator('#err').innerText()).trim(); };
  check('L3. كود عشوائي مرفوض', (await tryCode('garbage')).length > 0 && (await w.locator('#lic_code').count()) === 1);
  const other = crypto.generateKeyPairSync('ed25519');
  await tryCode(mkCode(mid, {}, other.privateKey)); check('L4. كود موقّع بمفتاح غير مفتاح المالك مرفوض', (await w.locator('#lic_code').count()) === 1 && /غير صحيح/.test(await w.locator('#err').innerText()));
  await tryCode(mkCode('AAAA-BBBB-CCCC-DDDD')); check('L5. كود لجهاز تاني مرفوض', /جهاز تاني/.test(await w.locator('#err').innerText()));
  await tryCode(mkCode(mid, { exp: '2020-01-01' })); check('L6. كود منتهي مرفوض', /منتهي/.test(await w.locator('#err').innerText()));
  const good = mkCode(mid, { name: 'مطعم الاختبار' }); const tampered = good.slice(0, 20) + (good[20] === 'A' ? 'B' : 'A') + good.slice(21);
  await tryCode(tampered); check('L7. كود معدّل بالتلاعب مرفوض', (await w.locator('#lic_code').count()) === 1);
  await w.fill('#lic_code', good); await w.click('#go'); await w.waitForFunction(() => document.title === 'Scope', null, { timeout: 20000 }); await sleep(1500);
  check('L8. الكود الصح بيفعّل ويفتح البرنامج', (await w.title()) === 'Scope');
  check('1. البرنامج بيفتح والعنوان Scope', (await w.title()) === 'Scope', await w.title());
  // لو الجهاز فيه نسخ احتياطية من تشغيل سابق، البرنامج بيعرض استرجاعها — هنا بنرفض علشان نبدأ من الصفر
  await w.waitForSelector('#ask_no', { timeout: 4000 }).then(() => w.click('#ask_no')).catch(() => { }); await sleep(500);
  await ev(w, () => { localStorage.fp_tour = '1'; }); await w.reload(); await sleep(1200);
  await w.waitForSelector('#ask_no', { timeout: 2500 }).then(() => w.click('#ask_no')).catch(() => { }); await sleep(500);
  check('2. أول تشغيل: شاشة إنشاء المدير إجبارية', (await ev(w, () => document.getElementById('lgn') && document.getElementById('lgn').dataset.mode)) === 'setup');
  // كلمة سر ضعيفة
  await w.fill('#lg_n', 'المدير'); await w.fill('#lg_u', 'boss'); await w.fill('#lg_p', 'abc'); await w.fill('#lg_p2', 'abc'); await w.click('[data-cx=doSetup]'); await sleep(500);
  check('3. كلمة سر ضعيفة مرفوضة', (await w.locator('#lgn .al').count()) > 0 && (await ev(w, () => !authOn())));
  await w.fill('#lg_p', 'Boss#2026'); await w.fill('#lg_p2', 'Boss#2026'); await w.click('[data-cx=doSetup]'); await w.waitForSelector('#lgn div[style*=monospace]', { timeout: 20000 });
  const rec = await w.locator('#lgn div[style*=monospace]').innerText();
  check('4. كود الطوارئ ظهر', /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(rec.trim()), rec);
  await w.click('[data-cx=codeDone]'); await sleep(600);
  check('5. كلمة السر مش متخزنة صريحة', await ev(w, () => !JSON.stringify(localStorage).includes('Boss#2026') && S.auth.users[0].hash.length > 20));
  await allPages(w, '6. عربي');
  await ev(w, () => { S.settings.lang = 'en'; save(); }); await w.reload(); await sleep(1500);
  if (await w.locator('#lgn').count()) { await w.fill('#lg_u', 'boss'); await w.fill('#lg_p', 'Boss#2026'); await w.click('[data-cx=doLogin]'); await sleep(1500); }
  await allPages(w, '7. إنجليزي');
  await ev(w, () => { S.settings.lang = 'ar'; save(); }); await w.reload(); await sleep(1500);
  // مصروف + فرع + شكوى + صفحة مخصصة + مستخدم
  await ev(w, () => go('exp')); await w.fill('#ea', '777'); await w.click('[data-act=addExp]'); await sleep(300);
  check('8. إضافة مصروف', await ev(w, () => S.exp.some(e => e.amount === 777)));
  await ev(w, () => go('brs')); await w.fill('#cxnb', 'فرع الإسكندرية'); await w.click('[data-cx=newbr]'); await sleep(400);
  check('9. إضافة فرع + دور كاشير تلقائي', await ev(w, () => S.branches.some(b => b.name === 'فرع الإسكندرية') && Object.values(CFG().roles).some(r => /الإسكندرية/.test(r.n) && r.br)));
  await ev(w, () => { const id = S.branches[S.branches.length - 1].id; BRS.sel = id; render(); }); await w.click('[data-cx=brgo][data-t=stock]'); await sleep(300);
  check('10. أزرار مميزات الفرع بتفلتر الصفحة', await ev(w, () => tab === 'stock' && S.settings.br === S.branches[S.branches.length - 1].id));
  await ev(w, () => { S.settings.br = 'all'; save(); });
  await ev(w, () => go('cmp')); await w.fill('#cm_n', 'اختبار'); await w.click('[data-cx=addcmp]'); await sleep(300);
  check('11. تسجيل شكوى', await ev(w, () => (S.complaints || []).length === 1));
  await ev(w, () => go('pages')); await w.click('[data-cx=tpl][data-t=debts]'); await w.click('[data-cx=donepage]'); await sleep(300);
  check('12. صفحة مخصصة من قالب', await ev(w, () => CFG().pages.length === 1));
  await w.click('[data-cx=pgt][data-t=users]').catch(async () => { await ev(w, () => go('pages')); await w.click('[data-cx=pgt][data-t=users]'); });
  await w.fill('#nu_n', 'سارة'); await w.fill('#nu_u', 'sara'); await w.fill('#nu_p', 'Sara#123'); await w.selectOption('#nu_r', 'cash'); await w.click('[data-cx=addUser]'); await sleep(900);
  check('13. إضافة مستخدم كاشير', await ev(w, () => AU().users.some(u => u.u === 'sara' && u.role === 'cash')));
  await w.fill('#nu_n', 'تكرار'); await w.fill('#nu_u', 'SARA'); await w.fill('#nu_p', 'Other#123'); await w.click('[data-cx=addUser]'); await sleep(400);
  check('14. اسم مستخدم مكرر مرفوض', await ev(w, () => AU().users.filter(u => u.u === 'sara').length === 1));
  // تسجيل خروج ودخول
  await w.click('#nav [data-cx=logout]'); await w.waitForSelector('#lgn');
  for (let i = 0; i < 5; i++) { await w.fill('#lg_u', 'sara'); await w.fill('#lg_p', 'bad' + i); await w.click('[data-cx=doLogin]'); await sleep(700); }
  check('15. قفل بعد 5 محاولات غلط', /استنى/.test(await w.locator('#lgn .al').innerText()));
  await ev(w, () => localStorage.removeItem('scope_fail')); await w.reload(); await sleep(1500);
  await w.fill('#lg_u', 'sara'); await w.fill('#lg_p', 'Sara#123'); await w.click('[data-cx=doLogin]'); await sleep(1500);
  const cashTabs = await ev(w, () => TABS.filter(x => can(x[0])).map(x => x[0]));
  check('16. الكاشير يشوف صفحات محدودة بس', cashTabs.includes('pos') && !cashTabs.includes('dash') && !cashTabs.includes('pages'), cashTabs.join(','));
  await ev(w, () => go('pages')); check('17. الكاشير ما يدخلش الإدارة', (await ev(w, () => tab)) !== 'pages');
  check('18. قايمة تغيير الدور مخفية', (await w.locator('#roleSel').count()) === 0);
  await w.click('#nav [data-cx=logout]'); await w.waitForSelector('#lgn'); await w.fill('#lg_u', 'boss'); await w.fill('#lg_p', 'Boss#2026'); await w.click('[data-cx=doLogin]'); await sleep(1500);
  check('19. دخول المدير', (await ev(w, () => role())) === 'owner');
  // نسخ احتياطي + تشفير
  await ev(w, () => { S.settings.marker = 'E2E-MARK'; save(); }); await sleep(6500);
  const bdir = await ev(w, () => scopeDesktop.info().then(i => i.dir));
  const files = fs.readdirSync(bdir).filter(f => f.endsWith('.json'));
  check('20. نسخ احتياطي تلقائي اتكتب', files.includes('Scope-latest.json') && files.some(f => /^Scope-\d{4}-\d{2}-\d{2}\.json$/.test(f)), bdir);
  await ev(w, () => go('set')); await sleep(800);
  await w.fill('#enc_p', 'Backup#Pass9'); await w.fill('#enc_p2', 'Backup#Pass9'); await w.click('[data-cx=encOn]'); await sleep(3500);
  const env = fs.readFileSync(path.join(bdir, 'Scope-latest.json'), 'utf8'); let o = {}; try { o = JSON.parse(env); } catch (e) { }
  check('21. النسخة بقت مشفّرة ومفيهاش بيانات مقروءة', o.scope === 1 && o.enc === 'AES-256-GCM' && !env.includes('E2E-MARK') && !env.includes('boss'));
  check('22. كل النسخ القديمة اتشفرت', fs.readdirSync(bdir).filter(f => f.endsWith('.json')).every(f => { try { return JSON.parse(fs.readFileSync(path.join(bdir, f), 'utf8')).scope === 1; } catch (e) { return false; } }));
  check('23. مكتبة Excel المدمجة شغالة بدون إنترنت', (await ev(w, () => ensureXLSX().then(() => typeof XLSX, e => 'ERR'))) === 'object');
  await w.screenshot({ path: path.join(OUT, 'settings.png') });
  await ev(w, () => scopeDesktop.saveBackup(JSON.stringify(S)));
  await app.close(); await sleep(1500);
  // استمرار البيانات بعد إعادة التشغيل
  app = await launch(); w = await open(app);
  check('24. بعد إعادة التشغيل: مطلوب تسجيل دخول', (await ev(w, () => document.getElementById('lgn') && document.getElementById('lgn').dataset.mode)) === 'login');
  await w.fill('#lg_u', 'boss'); await w.fill('#lg_p', 'Boss#2026'); await w.click('[data-cx=doLogin]'); await sleep(1500);
  check('25. البيانات فضلت محفوظة', await ev(w, () => S.settings.marker === 'E2E-MARK' && S.branches.length === 4 && S.exp.some(e => e.amount === 777)));
  // قفل النسخة الواحدة
  const second = cp.spawnSync(EXEC, ['--no-sandbox', '--user-data-dir=' + UD], { timeout: 25000, env: ENV });
  await sleep(1500); check('26. نسخة ثانية ما بتفتحش نافذة تانية', app.windows().length === 1, 'windows=' + app.windows().length);
  await app.close(); await sleep(1500);
  // كارثة: مسح بيانات البرنامج + استرجاع
  fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD, { recursive: true });
  app = await launch(); w = await open(app);
  await w.waitForSelector('#ask_ok', { timeout: 20000 }).catch(() => { });
  check('27. بعد المسح: عرض استرجاع نسخة', /نسخة احتياطية/.test(await ev(w, () => (document.querySelector('#mbody h3') || {}).textContent || '')));
  await w.click('#ask_ok'); await w.waitForSelector('#ask_i'); await w.fill('#ask_i', 'wrong-pass'); await w.click('#ask_ok'); await sleep(900);
  check('28. كلمة سر غلط ← بيسأل تاني', (await w.locator('#ask_i').count()) === 1);
  await w.fill('#ask_i', 'Backup#Pass9'); await w.click('#ask_ok'); await sleep(3000);
  await ev(w, () => { localStorage.fp_tour = '1'; }).catch(() => { });
  await w.fill('#lg_u', 'boss'); await w.fill('#lg_p', 'Boss#2026'); await w.click('[data-cx=doLogin]'); await sleep(1500);
  check('29. الاسترجاع رجّع كل شيء', await ev(w, () => S.settings.marker === 'E2E-MARK' && S.branches.length === 4 && CFG().pages.length === 1 && AU().users.length === 2 && (S.complaints || []).length === 1));
  // بدء من الصفر
  await ev(w, () => go('imp')); await w.click('[data-cx=wipeAll]'); await w.fill('#ask_i', 'مطعم حقيقي'); await w.click('#ask_ok'); await w.waitForSelector('#ask_i'); await w.fill('#ask_i', 'مسح'); await w.click('#ask_ok'); await sleep(1000);
  check('30. مسح كل شيء والبدء من الصفر', await ev(w, () => S.ing.length === 0 && S.rec.length === 0 && S.sales.length === 0 && S.branches.length === 1 && S.branches[0].name === 'مطعم حقيقي' && AU().users.length === 2));
  await allPages(w, '31. صفحات النظام الفاضي');
  await ev(w, () => go('stock')); await w.fill('#ni_n', 'دجاج'); await w.fill('#ni_c', '0.18'); await w.click('[data-act=addIng]'); await w.fill('#ni_n', 'أرز'); await w.fill('#ni_c', '0.03'); await w.click('[data-act=addIng]');
  await ev(w, () => go('rec')); await w.fill('#nr_n', 'فراخ بالأرز'); await w.click('[data-act=addRec]'); await sleep(300);
  await ev(w, () => { const r = S.rec[0]; r.items = [{ ing: S.ing[0].id, qty: 150 }, { ing: S.ing[1].id, qty: 100 }]; r.prices = { dine: 90, direct: 90, app: 110 }; S.cash = { cash: 5000, bank: 0 }; save(); render(); });
  await ev(w, () => { S.sales.push({ id: 's1', date: today(), ch: Object.keys(S.channels)[0], items: [{ rid: S.rec[0].id, qty: 3, price: 90 }], disc: 0, orders: 3, br: S.branches[0].id, by: 'owner' }); save(); });
  check('32. دورة كاملة من الصفر: خامة ← وصفة ← بيع ← أرباح', await ev(w, () => { const R = agg(); return Math.round(R.rev) === 270 && R.cogs > 0; }));
  await allPages(w, '33. كل الصفحات بعد إدخال بيانات حقيقية');
  await ev(w, () => go('golive')); check('34. صفحة جاهزية التشغيل', (await w.locator('main h2').first().innerText()).includes('تشغيل'));
  await w.screenshot({ path: path.join(OUT, 'golive.png') });
  // ===== سيناريو مطعم حقيقي: الأرقام المتوقعة محسوبة بشكل مستقل =====
  await require('./scenario')(w, check, ev, sleep);
  check('35. مفيش أخطاء جافاسكربت أثناء الاختبار كله', errs.length === 0, errs.slice(0, 3).join(' | '));
  await app.close(); await sleep(1500);
  // مجلد نسخ مخصص (فلاشة/سحابة): الاسترجاع بعد مسح البرنامج يلاقيه لوحده عن طريق المؤشر
  const USB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-usb-')), 'Scope-Backups');
  fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD, { recursive: true });
  fs.writeFileSync(path.join(UD, 'config.json'), JSON.stringify({ backupDir: USB }));
  app = await launch(); w = await open(app);
  if (await w.locator('#ask_no').count()) await w.click('#ask_no'); await sleep(800);
  await ev(w, () => { localStorage.fp_tour = '1'; S.settings.marker = 'CUSTOM-FOLDER'; save(); }); await sleep(6500);
  check('36. النسخة اتكتبت في المجلد المخصص', fs.existsSync(path.join(USB, 'Scope-latest.json')), USB);
  await app.close(); await sleep(1500);
  fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD, { recursive: true });   // إعدادات البرنامج (وفيها مكان المجلد) اتمسحت
  app = await launch(); w = await open(app);
  await w.waitForSelector('#ask_ok', { timeout: 20000 }).catch(() => { });
  const offer = await ev(w, () => (document.querySelector('#mbody h3') || {}).textContent || '');
  check('37. الاسترجاع لقى المجلد المخصص لوحده', offer.includes(path.basename(path.dirname(USB))) || offer.includes('Scope-Backups'), offer.slice(0, 140));
  await w.click('#ask_ok'); await sleep(3500);
  check('38. البيانات رجعت من المجلد المخصص', await ev(w, () => S.settings.marker === 'CUSTOM-FOLDER'));
  await app.close();
  // ===== انتهاء الترخيص والتجديد (الوقت بيتحاكى بمتغير بيئة الاختبار) =====
  const UD3 = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-ud3-'));
  for (const f of ['.scope-license.json', '.scope-seen.json']) { try { fs.rmSync(path.join(os.homedir(), f), { force: true }); } catch (e) { } }
  const launchAt = (now) => _electron.launch({ executablePath: EXEC, args: ['--no-sandbox', '--user-data-dir=' + UD3], env: { ...ENV, SCOPE_TEST_NOW: now, SCOPE_LIC_RECHECK_MS: '1500' }, timeout: 60000 });
  const pageOf = async (ap) => { const p = await ap.firstWindow(); p.on('pageerror', e => errs.push(e.message)); await p.waitForLoadState('domcontentloaded'); await sleep(1500); return p; };
  let a3 = await launchAt('2031-01-01T10:00:00Z'), w3 = await pageOf(a3);
  const mid3 = await ev(w3, () => scopeDesktop.licStatus().then(s => s.mid));
  await w3.fill('#lic_code', mkCode(mid3, { name: 'مطعم الاختبار', exp: '2031-01-31' })); await w3.click('#go'); await w3.waitForFunction(() => document.title === 'Scope', null, { timeout: 20000 }); await sleep(1500);
  const st3 = await ev(w3, () => scopeDesktop.licStatus());
  check('E1. ترخيص بتاريخ انتهاء بيشتغل ويحسب الأيام المتبقية', st3.ok && st3.daysLeft >= 30 && st3.daysLeft <= 31, JSON.stringify({ d: st3.daysLeft, exp: st3.exp }));
  await ev(w3, () => { localStorage.fp_tour = '1'; S.settings.marker = 'RENEW-KEEP'; save(); render(); });
  check('E2. تنبيه قبل الانتهاء بـ 14 يوم أو أقل', await ev(w3, () => { window.__lic = { daysLeft: 10 }; return alerts().some(a => /ينتهي بعد/.test(a[1])); }));
  await a3.evaluate((_, v) => { process.env.SCOPE_TEST_NOW = v; }, '2031-03-01T10:00:00Z'); await sleep(4500);
  check('E3. البرنامج المفتوح بيتقفل لما الترخيص ينتهي', /license\.html/.test(w3.url()) && /انتهى/.test(await w3.locator('#err').innerText()), w3.url().slice(-20));
  await a3.close(); await sleep(1500);
  a3 = await launchAt('2031-03-01T10:00:00Z'); w3 = await pageOf(a3);
  check('E4. فتح البرنامج بعد الانتهاء: شاشة التفعيل بدل البرنامج', (await w3.locator('#lic_code').count()) === 1 && /انتهى/.test(await w3.locator('#err').innerText()));
  await w3.fill('#lic_code', mkCode(mid3, { name: 'مطعم الاختبار', exp: '2031-01-31' })); await w3.click('#go'); await sleep(900);
  check('E5. إدخال نفس الكود المنتهي مرفوض', (await w3.locator('#lic_code').count()) === 1);
  await w3.fill('#lic_code', mkCode(mid3, { name: 'مطعم الاختبار', exp: '2032-01-01' })); await w3.click('#go'); await w3.waitForFunction(() => document.title === 'Scope', null, { timeout: 20000 }); await sleep(1500);
  check('E6. كود التجديد بيفتح البرنامج والبيانات زي ما هي', await ev(w3, () => S.settings.marker === 'RENEW-KEEP'));
  await a3.close(); await sleep(1500);
  a3 = await launchAt('2031-01-10T10:00:00Z'); w3 = await pageOf(a3);
  check('E7. رجوع تاريخ الجهاز لورا بيقفل الترخيص', (await w3.locator('#lic_code').count()) === 1 && /تاريخ الجهاز/.test(await w3.locator('#err').innerText()));
  await a3.close();
  for (const f of ['.scope-license.json', '.scope-seen.json']) { try { fs.rmSync(path.join(os.homedir(), f), { force: true }); } catch (e) { } }
  const failed = results.filter(r => !r[1]);
  console.log('\n=== ' + (results.length - failed.length) + '/' + results.length + ' passed on ' + process.platform + '/' + process.arch + ' ===');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ platform: process.platform, arch: process.arch, results, errs }, null, 1));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(1); });
