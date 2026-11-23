#!/usr/bin/env node
// مولّد أكواد تفعيل Scope (للمالك فقط) — مبيتحطش على أي جهاز عميل.
// الاستخدام:  node license.js <ملف-المفتاح-الخاص> <رقم-الجهاز XXXX-XXXX-XXXX-XXXX> "اسم العميل" [YYYY-MM-DD]
const fs = require('fs'), crypto = require('crypto');
const [, , keyFile, mid, name, exp] = process.argv;
if (!keyFile || !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(mid || '') || !name) { console.error('Usage: node license.js <private.key> <MACHINE-ID> "Customer name" [expiry YYYY-MM-DD]'); process.exit(1); }
const key = crypto.createPrivateKey({ key: Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64'), format: 'der', type: 'pkcs8' });
const payload = Buffer.from(JSON.stringify({ v: 1, mid: mid.toUpperCase(), name, exp: exp || null, iat: new Date().toISOString().slice(0, 10) }));
const code = payload.toString('base64url') + '.' + crypto.sign(null, payload, key).toString('base64url');
console.log('\n' + code + '\n');
