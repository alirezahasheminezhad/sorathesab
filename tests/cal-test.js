const fs = require('fs'), path = require('path');
const js = fs.readFileSync(path.join(__dirname, '..', 'build', 'app.js'), 'utf8');

// pull the pure text+calendar block: dg .. todayJ (no DOM, no state)
const from = js.indexOf('const dg =');
const upto = js.indexOf('function todayJ(');
const src = [js.slice(from, upto),
  'module.exports={j2d,g2d,d2j,d2g,jalCal,jleap,jMonthLen,jvalid,normDate,dkey,dnum,pad2};'].join('\n');
const m = { exports: {} };
new Function('module', 'exports', src)(m, m.exports);
const C = m.exports;

let fail = 0;
const bad = (msg) => { console.log('FAIL:', msg); fail++; };

// 1. round-trip every Jalali day across 1300..1500
let days = 0;
for (let y = 1300; y <= 1500; y++) {
  for (let mo = 1; mo <= 12; mo++) {
    for (let d = 1; d <= C.jMonthLen(y, mo); d++) {
      const jdn = C.j2d(y, mo, d);
      const back = C.d2j(jdn);
      if (!back || back.jy !== y || back.jm !== mo || back.jd !== d)
        bad(`roundtrip ${y}/${mo}/${d} -> ${jdn} -> ${JSON.stringify(back)}`);
      days++;
    }
  }
}
console.log('round-tripped', days, 'Jalali days (1300-1500)');

// 2. consecutive day numbers must differ by exactly 1 across month/year borders
for (const [y, mo] of [[1403, 6], [1403, 12], [1404, 6], [1404, 12], [1400, 12], [1399, 12]]) {
  const last = C.jMonthLen(y, mo);
  const a = C.j2d(y, mo, last);
  const b = mo === 12 ? C.j2d(y + 1, 1, 1) : C.j2d(y, mo + 1, 1);
  if (b - a !== 1) bad(`border ${y}/${mo}/${last} -> next = ${b - a} days`);
}

// 3. leap years: Esfand has 30 days exactly when jleap
for (const y of [1399, 1400, 1401, 1402, 1403, 1404, 1405, 1408]) {
  const len = C.jMonthLen(y, 12);
  if (len !== (C.jleap(y) ? 30 : 29)) bad(`esfand len ${y} = ${len}, leap=${C.jleap(y)}`);
}

// 4. known anchor: 1403/01/01 == 2024-03-20
if (C.j2d(1403, 1, 1) !== C.g2d(2024, 3, 20)) bad('1403/01/01 != 2024-03-20');
if (C.j2d(1404, 1, 1) !== C.g2d(2025, 3, 21)) bad('1404/01/01 != 2025-03-21');

// 5. dnum accepts Persian digits and separators, rejects impossible dates
if (C.dnum('۱۴۰۴/۰۷/۳۰') !== C.j2d(1404, 7, 30)) bad('dnum Persian digits');
if (C.dnum('1404-07-30') !== C.j2d(1404, 7, 30)) bad('dnum dash separator');
if (C.dnum('1404/12/30') !== null && !C.jleap(1404)) bad('dnum accepted invalid esfand 30');
if (C.dnum('1404/07/31') !== null) bad('dnum accepted mehr 31');
if (C.dnum('') !== null) bad('dnum empty');

// 6. the cheque "soon" window must cross month boundaries
const win = (due, today) => {
  const a = C.dnum(today), b = C.dnum(due);
  if (a == null || b == null) return null;
  const left = b - a;
  return { left, overdue: left < 0, soon: left >= 0 && left <= 10 };
};
const cases = [
  ['1404/09/03', '1404/08/25', 8, true],    // آبان ۳۰ روز دارد؛ پنجره از مرز ماه می‌گذرد
  ['1404/08/30', '1404/08/28', 2, true],
  ['1404/09/01', '1404/08/30', 1, true],
  ['1405/01/05', '1404/12/29', 5, true],    // از مرز سال می‌گذرد (۱۴۰۴ کبیسه نیست)
  ['1404/09/20', '1404/09/01', 19, false],
  ['1404/08/20', '1404/09/01', -11, false],
  ['1404/09/01', '1404/09/01', 0, true],
];
for (const [due, today, left, soon] of cases) {
  const r = win(due, today);
  if (!r) { bad(`window null for ${due} vs ${today}`); continue; }
  if (left !== null && r.left !== left) bad(`window ${due} vs ${today}: left=${r.left}, want ${left}`);
  if (r.soon !== soon) bad(`window ${due} vs ${today}: soon=${r.soon}, want ${soon}`);
}

// 7. dkey ordering must agree with dnum ordering
for (let i = 0; i < 4000; i++) {
  const y = 1400 + (i % 6), mo = 1 + (i % 12), d = 1 + (i % 28);
  const s = `${y}/${C.pad2(mo)}/${C.pad2(d)}`;
  const y2 = 1400 + ((i + 3) % 6), mo2 = 1 + ((i + 5) % 12), d2 = 1 + ((i + 7) % 28);
  const s2 = `${y2}/${C.pad2(mo2)}/${C.pad2(d2)}`;
  const ka = C.dkey(s), kb = C.dkey(s2), na = C.dnum(s), nb = C.dnum(s2);
  if (ka != null && kb != null && Math.sign(ka - kb) !== Math.sign(na - nb))
    bad(`order mismatch ${s} vs ${s2}`);
}

console.log(fail ? `\n${fail} FAILURES` : '\nALL CALENDAR CHECKS PASSED');
process.exit(fail ? 1 : 0);