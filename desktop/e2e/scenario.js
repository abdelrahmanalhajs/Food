// سيناريو مطعم حقيقي: بيانات من الصفر + حسابات متوقعة بتتحسب هنا بشكل مستقل ويتقارن بيها ناتج البرنامج.
// بيتنده من e2e.js (على Windows/Mac/Linux) ومن الاختبار المحلي.
module.exports = async function scenario(w, check, ev, sleep) {
  const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
  const sc = (name, ok, extra) => check('S. ' + name, ok, extra);
  // ---------- 1) بدء من الصفر عن طريق الواجهة ----------
  await ev(w, () => go('imp')); await w.click('[data-cx=wipeAll]'); await w.fill('#ask_i', 'مطعم النيل'); await w.click('#ask_ok'); await w.waitForSelector('#ask_i'); await w.fill('#ask_i', 'مسح'); await w.click('#ask_ok'); await sleep(900);
  sc('1. البداية من الصفر: فرع واحد وكل شيء فاضي', await ev(w, () => S.branches.length === 1 && S.ing.length === 0 && S.rec.length === 0 && S.sales.length === 0 && S.exp.length === 0));
  const B1 = await ev(w, () => S.branches[0].id);
  // ---------- 2) الخامات والوصفات من الواجهة ----------
  const ING = [['دجاج', 'g', 0.18], ['أرز', 'g', 0.03], ['جبنة', 'g', 0.30], ['كريمة', 'ml', 0.08], ['عبوة', 'pc', 5]];
  await ev(w, () => go('stock'));
  for (const [n, u, c] of ING) { await w.fill('#ni_n', n); await w.selectOption('#ni_u', u); await w.fill('#ni_c', String(c)); await w.click('[data-act=addIng]'); await sleep(150); }
  sc('2. إضافة 5 خامات من الواجهة', await ev(w, () => S.ing.length === 5 && S.ing.find(g => g.name === 'جبنة').cost === 0.30));
  await ev(w, () => go('rec'));
  for (const n of ['فراخ بالأرز', 'مكرونة بالجبنة']) { await w.fill('#nr_n', n); await w.click('[data-act=addRec]'); await sleep(150); }
  const ids = await ev(w, (B1) => { const g = n => S.ing.find(x => x.name === n).id; g('دجاج'); S.ing.find(x => x.name === 'دجاج').yield = 85; S.ing.find(x => x.name === 'عبوة').pack = true;
    S.rec[0].items = [{ ing: g('دجاج'), qty: 150 }, { ing: g('أرز'), qty: 100 }, { ing: g('عبوة'), qty: 1 }]; S.rec[0].prices = { dine: 90, direct: 90, app: 110 };
    S.rec[1].items = [{ ing: g('جبنة'), qty: 120 }, { ing: g('كريمة'), qty: 60 }, { ing: g('عبوة'), qty: 1 }]; S.rec[1].prices = { dine: 100, direct: 100, app: 120 };
    const open = { دجاج: 5000, أرز: 20000, جبنة: 6000, كريمة: 3000, عبوة: 400 }; S.ing.forEach(x => { x.stockBy = { [B1]: open[x.name] }; x.stock = open[x.name]; });
    S.settings.ins = 0; S.cash = { cash: 10000, bank: 0 }; save(); render(); return { r1: S.rec[0].id, r2: S.rec[1].id, i1: g('دجاج'), i2: g('أرز'), i3: g('جبنة'), i5: g('عبوة') }; }, B1);
  const c1 = 150 * 0.18 / 0.85 + 100 * 0.03 + 5, c2 = 120 * 0.30 + 60 * 0.08 + 5;
  sc('3. تكلفة الطبق من الخامات (مع الـ Yield) مظبوطة', await ev(w, (ids) => ({ a: recCost(REC(ids.r1)).total, b: recCost(REC(ids.r2)).total }), ids).then(r => near(r.a, c1, 1e-6) && near(r.b, c2, 1e-6)), c1.toFixed(4) + ' / ' + c2.toFixed(4));
  // ---------- 3) بيع من شاشة المبيعات (بيخصم مخزون ويزوّد الكاش) ----------
  await ev(w, () => go('pos')); await sleep(300);
  await w.selectOption('[data-pls="0"]', ids.r1); await w.fill('[data-plq="0"]', '3'); await sleep(300);
  await w.click('[data-act=sell]'); await sleep(400);
  const st = await ev(w, (ids) => ({ i1: ING(ids.i1).stock, i2: ING(ids.i2).stock, i5: ING(ids.i5).stock, cash: S.cash.cash, n: S.sales.length }), ids);
  sc('4. بيع 3 أطباق: المخزون اتخصم صح (دجاج مع الـ Yield)', near(st.i1, 5000 - 3 * 150 / 0.85, 0.01) && near(st.i2, 20000 - 300, 0.01) && st.i5 === 397, JSON.stringify(st));
  sc('5. البيع النقدي زوّد الكاش 270', near(st.cash, 10270, 0.01) && st.n === 1);
  // ---------- 4) باقي المبيعات بتواريخ مختلفة وقنوات وخصومات ----------
  await ev(w, (a) => { const { ids, B1 } = a; const d = n => addDays(today(), -n);
    S.sales.push({ id: 'x1', date: d(1), ch: 'dine', items: [{ rid: ids.r1, qty: 10, price: 90 }], disc: 0, orders: 6, br: B1, by: 'owner' });
    S.sales.push({ id: 'x2', date: d(2), ch: 'app', items: [{ rid: ids.r1, qty: 4, price: 110 }, { rid: ids.r2, qty: 6, price: 120 }], disc: 10, orders: 7, br: B1, by: 'owner' });
    S.sales.push({ id: 'x3', date: d(3), ch: 'direct', items: [{ rid: ids.r2, qty: 5, price: 100 }], disc: 0, orders: 5, br: B1, by: 'owner' });
    save(); }, { ids, B1 });
  // طلبات ملغاة من الواجهة
  await ev(w, () => go('pos')); await sleep(300); await w.fill('#cx_n', '2'); await w.fill('#cx_v', '180'); await w.click('[data-act=cancelOrder]'); await sleep(300);
  // ---------- 5) مصروفات وموظفين وهالك ----------
  await ev(w, () => go('exp')); await sleep(300); await w.fill('#ea', '6000'); await w.fill('#en', 'إيجار'); await w.click('[data-act=addExp]'); await sleep(300);
  await ev(w, (B1) => { S.exp.push({ id: 'e2', date: today(), cat: 'كهرباء ومياه وغاز', type: 'fixed', amount: 900, note: '', ind: true, br: '' }); S.exp.push({ id: 'e3', date: today(), cat: 'تسويق وإعلانات', type: 'variable', amount: 400, note: '', ind: true, br: '' });
    S.emp.push({ id: 'ea', name: 'أحمد', role: 'شيف', br: B1, base: 5000, allow: 500, inc: 0, otH: 0, abs: 0, adv: 0 }); S.emp.push({ id: 'eb', name: 'منى', role: 'كاشير', br: B1, base: 4000, allow: 400, inc: 0, otH: 8, abs: 1, adv: 300 }); save(); }, B1);
  sc('6. مصروف الإيجار نزل من الكاش', await ev(w, () => S.cash.cash === 4270 && S.exp.some(e => e.amount === 6000)));
  await ev(w, () => go('stock')); await sleep(300);
  await w.selectOption('#wi', ids.i1); await w.fill('#wq', '200'); await w.fill('#wr', 'تالف'); await w.click('[data-act=addWaste]'); await sleep(300);
  sc('7. تسجيل هالك 200 جم دجاج خصم من المخزون', near(await ev(w, (ids) => ING(ids.i1).stock, ids), 5000 - 3 * 150 / 0.85 - 200, 0.01));
  // ---------- 6) مقارنة الأرقام المتوقعة (محسوبة مستقلة) بناتج البرنامج ----------
  const gross = 10 * 90 + (4 * 110 + 6 * 120) * 0.9 + 5 * 100 + 3 * 90, cogs = (10 + 4 + 3) * c1 + (6 + 5) * c2, comm = 0.3 * (4 * 110 + 6 * 120) * 0.9, del = 12 * 5;
  const day = 4000 / 30, gross2 = 4000 + 400 + 8 * (day / 8) * 1.5 - 1 * day, fixed = 6000 + 900 + 5500 + gross2, varx = 400, shrink = 200 * 0.18;
  const cm = gross - cogs - comm - del - varx, net = cm - fixed - shrink;
  const R = await ev(w, () => { const r = agg('all'); return { rev: r.rev, cogs: r.cogs, comm: r.comm, del: r.del, orders: r.orders, canc: r.canc, cancVal: r.cancVal, fixed: r.fixed, varx: r.varx, shrink: r.shrink, cm: r.cm, net: r.net, cmr: r.cmr, be: r.be, avg: r.avgTicket, fcp: r.fcp }; });
  const rows = [['المبيعات', R.rev, gross], ['تكلفة الخامات', R.cogs, cogs], ['العمولات (30% تطبيق)', R.comm, comm], ['التوصيل (12×5 طلبات)', R.del, del], ['المصروفات الثابتة (مع المرتبات والأوفرتايم والغياب)', R.fixed, fixed], ['المتغيرة', R.varx, varx], ['الهالك', R.shrink, shrink], ['هامش المساهمة', R.cm, cm], ['صافي الربح', R.net, net]];
  for (const [n, got, exp] of rows) sc('8. ' + n + ' مطابقة', near(got, exp, 0.02), 'app=' + got.toFixed(2) + ' expected=' + exp.toFixed(2));
  sc('9. عدد الطلبات والملغي', R.orders === 19 && R.canc === 2 && R.cancVal === 180, R.orders + '/' + R.canc + '/' + R.cancVal);
  sc('10. نسبة الخامات من المبيعات', near(R.fcp, cogs / gross * 100, 0.01), R.fcp.toFixed(2) + '%');
  sc('11. متوسط الفاتورة = المبيعات ÷ الطلبات', near(R.avg, gross / 19, 0.01), R.avg.toFixed(2));
  const be = (fixed + shrink) / (cm / gross);
  sc('12. نقطة التعادل = (ثابت+هالك) ÷ نسبة هامش المساهمة', near(R.be, be, 0.5), R.be.toFixed(1) + ' vs ' + be.toFixed(1));
  // ---------- 7) صفحات التقارير بتعرض نفس الأرقام ----------
  await ev(w, () => go('pl')); const plTxt = await w.locator('main').innerText();
  sc('13. صفحة الأرباح والخسائر فيها المبيعات الصحيحة', plTxt.replace(/[,٬]/g, '').includes(String(Math.round(gross))), 'rev=' + Math.round(gross));
  await ev(w, () => go('dash')); const dashTxt = (await w.locator('main').innerText()).replace(/[,٬]/g, '');
  sc('14. لوحة المالك فيها المبيعات وصافي الربح', dashTxt.includes(String(Math.round(gross))) && dashTxt.includes(String(Math.round(net))), 'net=' + Math.round(net));
  // ---------- 8) فاتورة مشتريات: متوسط مرجّح للتكلفة وزيادة المخزون ----------
  await ev(w, (a) => { S.inv.push({ id: 'v1', supplier: 'مورد A', date: today(), lines: [{ ing: a.i3, qty: 5, unit: 1000, total: 1100 }], status: 'pending', dup: false, img: null, br: a.B1 }); save(); render(); }, { i3: ids.i3, B1 });
  await ev(w, () => go('inv')); await sleep(300);
  const beforeS = await ev(w, (ids) => ING(ids.i3).stock, ids);
  await w.click('[data-act=appr][data-id=v1]'); await sleep(300);
  const aft = await ev(w, (ids) => ({ cost: ING(ids.i3).cost, stock: ING(ids.i3).stock, last: ING(ids.i3).last }), ids);
  sc('15. اعتماد فاتورة: متوسط مرجّح للتكلفة', near(aft.cost, (beforeS * 0.30 + 5000 * 0.22) / (beforeS + 5000), 1e-6), aft.cost.toFixed(5));
  sc('16. اعتماد فاتورة: المخزون زاد 5000 جم وآخر سعر 0.22', near(aft.stock, beforeS + 5000, 0.01) && near(aft.last, 0.22, 1e-9));
  // ---------- 9) تحويل بين الفروع ----------
  await ev(w, () => go('brs')); await w.fill('#cxnb', 'فرع المعادي'); await w.click('[data-cx=newbr]'); await sleep(400);
  const B2 = await ev(w, () => S.branches[1].id);
  await ev(w, () => go('stock')); await sleep(300);
  const tot0 = await ev(w, (ids) => ING(ids.i2).stock, ids);
  await w.selectOption('#tf_from', B1); await w.selectOption('#tf_to', B2); await w.selectOption('#tf_i', ids.i2); await w.fill('#tf_q', '1000'); await w.click('[data-act=transfer]'); await sleep(300);
  const tr = await ev(w, (a) => ({ b1: ING(a.ids.i2).stockBy[a.B1], b2: ING(a.ids.i2).stockBy[a.B2], tot: ING(a.ids.i2).stock }), { ids, B1, B2 });
  sc('17. تحويل 1000 جم بين الفروع: الإجمالي ثابت', near(tr.tot, tot0, 0.01) && near(tr.b2, 1000, 0.01) && near(tr.b1, tot0 - 1000, 0.01), JSON.stringify(tr));
  // ---------- 10) توزيع المبيعات على الفروع ----------
  const split = await ev(w, (a) => { const x = agg(a.B1), y = agg(a.B2), all = agg('all'); return { a: x.rev, b: y.rev, all: all.rev }; }, { B1, B2 });
  sc('18. مبيعات الفروع = إجمالي المبيعات', near(split.a + split.b, split.all, 0.01) && near(split.b, 0, 0.01), JSON.stringify(split));
  // ---------- 11) قفل الشهر ----------
  await ev(w, () => go('close')); await sleep(300); await w.click('[data-act=closePeriod]'); await w.waitForSelector('#ask_i'); await w.fill('#ask_i', 'نوفمبر الاختبار'); await w.click('#ask_ok'); await sleep(400);
  const cl = await ev(w, () => S.closes[S.closes.length - 1]);
  sc('19. قفل الفترة بيحفظ نفس الأرقام', cl && cl.label === 'نوفمبر الاختبار' && near(cl.rev, R.rev, 0.5) && cl.orders === 19, JSON.stringify(cl && { rev: Math.round(cl.rev), net: Math.round(cl.net), orders: cl.orders }));
  // ---------- 12) كاش وسلف ----------
  const cash = await ev(w, () => cashPos());
  sc('20. السيولة = الكاش + البنك', near(cash.liquid, cash.cash + cash.bank, 0.01) && cash.cash === 4270, 'cash=' + cash.cash);
  sc('21. أرقام التقارير المهمة كلها أرقام (مفيش NaN/Infinity)', await ev(w, () => { const r = agg('all'), H = health(), C = cashPos(), p = planActions(r); return [r.rev, r.net, r.be, H.score, C.liquid, C.o30, p.total].every(v => typeof v === 'number' && isFinite(v) || (typeof v === 'number' && v !== v ? false : true)) && !Object.values(r).some(v => typeof v === 'number' && v !== v); }));
  await ev(w, (B1) => { S.settings.br = 'all'; save(); }, B1);
};
