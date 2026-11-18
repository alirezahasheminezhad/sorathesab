const fs = require('fs'), path = require('path');
const js = fs.readFileSync(path.join(__dirname, '..', 'build', 'app.js'), 'utf8');

/* brace-matched extraction of top-level declarations, so the real code is tested verbatim */
function grab(name) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm');
  const m = re.exec(js);
  if (m) {
    let i = js.indexOf('{', m.index + m[0].length - 1), depth = 0, j = i;
    for (; j < js.length; j++) {
      const c = js[j];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) { j++; break; } }
    }
    return js.slice(m.index, j);
  }
  const line = js.split('\n').find(l => new RegExp('^const\\s+' + name + '\\s*=').test(l));
  if (!line) throw new Error('cannot find ' + name);
  return line;
}

const prelude = js.slice(js.indexOf('const dg ='), js.indexOf('function todayJ('));
const names = ['nw', 'calc', 'audit', 'normRow', 'lev', 'dice', 'parseAmount',
  'goodName', 'uid', 'hay', 'score'];
const parts = [];
for (const n of names) { try { parts.push(grab(n)); } catch (e) { console.log('(skip ' + n + ')'); } }

const stub = `
let uidN = 0;
const DEFAULT_CUR = 'ریال - ایران';
let PS = {ck:{on:true,imp:true,cons:true,date:true,ord:true,cur:true,dup:true,mark:true,prnw:true,qty:true},
  am:{sum:{r:true,t:true,n:true,w:true},form:{r:false,t:true,n:true,w:true},prn:{r:true,t:true,n:true,w:true,show:false}},
  cols:new Array(10).fill(true), items:[], color:'#12305a', zebra:true, showTotals:true};
let rows = [];
const opening = () => 0;
const PCOLS = ['تاریخ عملیات','شرح','مقدار','واحد','قیمت','بدهکار','بستانکار','تشخیص','مانده','عنوان ارز و کشور'];
const HC = new Map();
`;
const src = [prelude, stub, ...parts,
  'module.exports={calc,audit,normRow,lev,dice,nw,parseAmount,num,nz,fa,toEn,jvalid,normDate,goodName};'].join('\n');
const m = { exports: {} };
new Function('module', 'exports', src)(m, m.exports);
const A = m.exports;

let fail = 0;
const bad = s => { console.log('FAIL:', s); fail++; };
const eq = (a, b, s) => { if (a !== b) bad(`${s}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/* ---- running balance ---- */
const R = (d, s, dr, cr, extra) => A.normRow(Object.assign({ d, s, dr, cr }, extra));
const list = [
  R('1404/01/05', 'فروش زعفران', 5000000, 0),
  R('1404/01/06', 'پرداخت نقدی', 0, 2000000),
  R('1404/01/07', 'فروش هل', 1500000, 0),
];
let c = A.calc(list, 0);
eq(c.dr, 6500000, 'calc total debit');
eq(c.cr, 2000000, 'calc total credit');
eq(c.bal, 4500000, 'calc balance');
eq(JSON.stringify(c.bals), JSON.stringify([5000000, 3000000, 4500000]), 'running balances');
c = A.calc(list, -1000000);
eq(c.bal, 3500000, 'balance with negative opening');
eq(c.bals[0], 4000000, 'first balance honours opening');

/* ---- import audit: the #10 fix ---- */
const mk = (dr, cr, i) => R('1404/02/' + String(i + 1).padStart(2, '0'), 'سند ' + (i + 1), dr, cr);
const rows3 = [mk(1000, 0, 0), mk(0, 400, 1), mk(700, 0, 2)];
const balOf = (l) => A.calc(l, 0).bals;

// file balances that start from the file's own opening (not the app's) must be clean
let fb = balOf(rows3).map(v => v + 90000);   // file period opened at +90000
let iss = A.audit(rows3, fb).filter(x => x.k === 'bal');
eq(iss.length, 0, 'audit: file with its own opening balance');

// blank cells must not break the chain
fb = [91000, null, null];
iss = A.audit(rows3, fb).filter(x => x.k === 'bal');
eq(iss.length, 0, 'audit: leading balance then blanks');
fb = [null, 90600, null];
iss = A.audit(rows3, fb).filter(x => x.k === 'bal');
eq(iss.length, 0, 'audit: baseline established at first non-blank');
fb = [91000, null, 91300];
iss = A.audit(rows3, fb).filter(x => x.k === 'bal');
eq(iss.length, 0, 'audit: blank in the middle');

// a genuinely wrong balance must still be caught, and only on that row
fb = [91000, 90600, 99999];
iss = A.audit(rows3, fb).filter(x => x.k === 'bal');
eq(iss.length, 1, 'audit: one wrong balance -> one error');
eq(iss[0] && iss[0].n, 3, 'audit: error points at row 3');

// creditor-side balances are negative
fb = balOf(rows3).map(v => v - 500000);
iss = A.audit(rows3, fb).filter(x => x.k === 'bal');
eq(iss.length, 0, 'audit: negative (creditor) file balances');

/* ---- consistency checks still fire ---- */
iss = A.audit([R('1404/02/01', 'x', 100, 100)], null).map(x => x.k);
eq(iss.includes('both'), true, 'audit: debit and credit both positive');
iss = A.audit([R('1404/12/30', 'x', 1, 0)], null).map(x => x.k);
eq(iss.includes('date'), true, 'audit: invalid esfand 30 in non-leap year');
iss = A.audit([R('1404/03/02', 'b', 1, 0), R('1404/03/01', 'a', 1, 0)], null).map(x => x.k);
eq(iss.includes('ord'), true, 'audit: out-of-order dates');
iss = A.audit([R('1404/03/01', 'x', 0, 0, { q: 2, p: 500 })], null).map(x => x.k);
eq(iss.includes('zero'), true, 'audit: zero amount');
iss = A.audit([R('1404/03/01', 'x', 900, 0, { q: 2, p: 500 })], null).map(x => x.k);
eq(iss.includes('qty'), true, 'audit: qty x price mismatch');

/* ---- normRow hardening (#1) ---- */
eq(A.normRow({ id: 'ok_1-2', d: '1404/01/01', s: 'x' }).id, 'ok_1-2', 'normRow keeps safe id');
eq(/^[A-Za-z0-9_-]{1,64}$/.test(A.normRow({ id: '"><img src=x>', d: '1404/01/01', s: 'x' }).id), true, 'normRow rejects unsafe id');
eq(/^[A-Za-z0-9_-]{1,64}$/.test(A.normRow({ id: 'a'.repeat(200), d: '1404/01/01', s: 'x' }).id), true, 'normRow rejects overlong id');
eq(A.normRow({ d: '1404/01/01', s: 'x', dr: -5 }).dr, 0, 'normRow clamps negative debit');
eq(A.normRow({ d: '1404/01/01', s: 'x', dr: 'NaN' }).dr, 0, 'normRow rejects NaN');
eq(A.normRow({ d: '1404/01/01', s: 'x', dr: Infinity }).dr, 0, 'normRow rejects Infinity');

/* ---- digit / amount parsing ---- */
eq(A.num('۱٬۲۳۴٬۵۶۷'), 1234567, 'num Persian grouped digits');
eq(A.num('1,234.50'), 1234.5, 'num latin grouped decimal');
eq(A.num('۱۲۳٫۵'), 123.5, 'num Persian decimal separator');
eq(A.num(''), 0, 'num empty');
eq(A.num('abc'), 0, 'num non-numeric');
eq(A.nz('كتاب ي'), 'کتاب ی', 'nz normalises Arabic letters');
eq(A.toEn('۱۴۰۴/۰۱/۰۱'), '1404/01/01', 'toEn date digits');

/* ---- number to words ---- */
const w = n => A.nw(n);
eq(typeof w(0), 'string', 'nw returns string for 0');
eq(w(0).length > 0, true, 'nw(0) not empty');
for (const n of [1, 10, 11, 20, 100, 101, 115, 200, 999, 1000, 1001, 1000000, 1234567, 94099541250]) {
  const s = w(n);
  if (!s || /undefined|NaN/.test(s)) bad('nw(' + n + ') = ' + s);
}
console.log('nw(94099541250) =', w(94099541250));
console.log('nw(1234567)    =', w(1234567));

/* ---- fuzzy distance ---- */
eq(A.lev('زعفران', 'زعفران'), 0, 'lev identical');
eq(A.lev('', 'abc'), 3, 'lev empty');
eq(A.lev('abc', 'abd'), 1, 'lev one substitution');
eq(A.dice('زعفران', 'زعفران'), 1, 'dice identical');
eq(A.dice('abc', 'xyz') < 0.2, true, 'dice disjoint');

console.log(fail ? `\n${fail} FAILURES` : '\nALL LOGIC CHECKS PASSED');
process.exit(fail ? 1 : 0);