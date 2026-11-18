/* ساخت نسخهٔ عمومی: همه‌چیز در یک فایل index.html در ریشهٔ مخزن.
   هیچ دادهٔ واقعی در ورودی‌های این مخزن نیست؛ دفتر خروجی خالی است. */
const fs = require('fs');
const path = require('path');
const B = __dirname;
const read = f => fs.readFileSync(path.join(B, f), 'utf8');

const exceljs = read('exceljs.txt');
const xlsx    = read('xlsx.txt');
const font    = read('font.txt').replace(/<\/style>\s*$/, '') + '</style>';
const css     = read('app.css');
const body    = read('app.html');
const brand   = read('brand.public.txt');
const seed    = read('seed.public.txt');
const app     = read('app.js');

/* تگ بستهٔ اسکریپت داخل هر قطعه، سند را زودتر از موعد می‌بندد. */
for (const [n, s] of [['app.js', app], ['app.html', body], ['brand', brand], ['seed', seed]]) {
  if (/<\/script/i.test(s)) throw new Error('closing script tag found inside ' + n);
}
if (!/const SEED = \[\];/.test(seed)) throw new Error('public build must ship an empty ledger');

const title = 'صورت‌حساب — دفتر بدهکار و بستانکار آفلاین';
const desc  = 'دفتر صورت‌حساب تک‌فایل و کاملاً آفلاین — ثبت گردش بدهکار و بستانکار، مانده لحظه‌ای، تحلیل نموداری، دفتر چک، خروجی اکسل و چاپ A4.';

const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${desc}">
<title>${title}</title>
${exceljs}
${xlsx}
${font}
<style>
${css}
</style>
<style id="colStyle"></style>
<style id="pgStyle">@page{size:A4 landscape;margin:8mm 8mm 12mm}</style>
</head>
<body>
${body}
<script>
${brand}
</script>
<script>
${seed}
</script>
<script>
${app}
</script>
</body>
</html>
`;

const out = path.join(B, '..', 'index.html');
fs.writeFileSync(out, html, 'utf8');
console.log('built', out, (Buffer.byteLength(html) / 1048576).toFixed(2) + ' MB');