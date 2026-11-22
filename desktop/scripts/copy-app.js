// ينسخ ملفات الويب (../app) إلى ./app قبل التشغيل أو البناء
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', '..', 'app'), dst = path.join(__dirname, '..', 'app');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
// الـ service worker مش لازم داخل Electron
fs.rmSync(path.join(dst, 'sw.js'), { force: true });
console.log('app copied ->', dst);
