const fs = require('fs'), path = require('path');
const B = path.join(__dirname, '..', 'build');
const js = fs.readFileSync(path.join(B, 'app.js'), 'utf8');

function grab(name) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm');
  const m = re.exec(js);
  if (m) {
    let i = js.indexOf('{', m.index + m[0].length - 1), depth = 0, j = i;
    for (; j < js.length; j++) {
      if (js[j] === '{') depth++;
      else if (js[j] === '}') { depth--; if (!depth) { j++; break; } }
    }
    return js.slice(m.index, j);
  }
  const cm = new RegExp('^const\\s+' + name + '\\s*=', 'm').exec(js);
  if (!cm) throw new Error('cannot find ' + name);
  let depth = 0, j = cm.index;
  for (; j < js.length; j++) {
    const ch = js[j];
    if ('{(['.includes(ch)) depth++;
    else if ('})]'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) { j++; break; }
  }
  return js.slice(cm.index, j);
}
const constLine = n => grab(n);

const brand = fs.readFileSync(path.join(B, 'brand.public.txt'), 'utf8');
const prelude = js.slice(js.indexOf('const dg ='), js.indexOf('function todayJ('));
const src = [
  brand, prelude,
  constLine('PCOLS'), constLine('DEF_ITEMS'),
  grab('PDEF'), grab('normPS'), grab('amtLines'), grab('donut'), grab('lineChart'),
  'const UI={unit:"ریال"}; const SC=["a","b","c","d","e","f","g","h"];',
  'module.exports={normPS,PDEF,amtLines,donut,lineChart,num};'
].join('\n');
const m = { exports: {} };
new Function('module', 'exports', src)(m, m.exports);
const A = m.exports;

let fail = 0;
const bad = s => { console.log('FAIL:', s); fail++; };
const eq = (a, b, s) => { if (a !== b) bad(`${s}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/* ---- normPS invariants ---- */
const d = A.normPS(null);
eq(d.am.form.r, false, 'default form hides rial');
eq(d.am.form.t, true, 'default form shows toman');
eq(d.am.sum.r, true, 'default summary shows rial');
eq(d.am.prn.show, false, 'default print amount block off');
eq(d.cols.length, 10, 'default 10 columns');
eq(d.cols.every(Boolean), true, 'default all columns visible');
eq(d.color, '#12305a', 'default colour');
eq(d.open, '0', 'default opening');

// every unit off -> rial forced back on
let p = A.normPS({ am: { sum: { r: false, t: false, n: true, w: true } } });
eq(p.am.sum.r || p.am.sum.t, true, 'normPS restores a unit');
// every format off -> numeric forced back on
p = A.normPS({ am: { sum: { r: true, t: true, n: false, w: false } } });
eq(p.am.sum.n || p.am.sum.w, true, 'normPS restores a format');
// untouched groups keep their defaults
eq(p.am.form.r, false, 'normPS leaves other groups at default');
eq(p.am.prn.show, false, 'normPS keeps prn.show default');
// explicit false is honoured
p = A.normPS({ am: { prn: { show: true } }, ck: { dup: false } });
eq(p.am.prn.show, true, 'normPS honours explicit true');
eq(p.ck.dup, false, 'normPS honours explicit false');
eq(p.ck.qty, true, 'normPS keeps other checks on');
// all columns off -> reset
p = A.normPS({ cols: new Array(10).fill(false) });
eq(p.cols.every(Boolean), true, 'normPS refuses zero visible columns');
p = A.normPS({ cols: [true, false] });
eq(p.cols.length, 10, 'normPS repairs wrong column count');
// junk colour / items
eq(A.normPS({ color: 'red' }).color, '#12305a', 'normPS rejects bad colour');
eq(A.normPS({ color: '#abc' }).color, '#12305a', 'normPS rejects short hex');
eq(A.normPS({ color: '#AABBCC' }).color, '#AABBCC', 'normPS accepts uppercase hex');
p = A.normPS({ items: [null, { t: 'x', v: 'y', k: 'zz', on: false }] });
eq(p.items.length, 2, 'normPS keeps item slots');
eq(p.items[1].k, 'c', 'normPS coerces unknown item kind');
eq(p.items[1].on, false, 'normPS honours item off');
eq(p.items[0].t, '', 'normPS survives null item');

/* ---- the p-am guard: last unit / last format cannot be turned off ---- */
const guard = (o, k) => {
  const pair = (k === 'r' || k === 't') ? ['r', 't'] : ['n', 'w'];
  return pair.some(x => x !== k && o[x]);   // true = allowed to uncheck
};
eq(guard({ r: true, t: true, n: true, w: true }, 'r'), true, 'guard allows rial off when toman on');
eq(guard({ r: true, t: false, n: true, w: true }, 'r'), false, 'guard blocks last unit');
eq(guard({ r: true, t: true, n: true, w: false }, 'n'), false, 'guard blocks last format');
eq(guard({ r: true, t: true, n: true, w: true }, 'w'), true, 'guard allows words off');

/* ---- amount block never renders empty ---- */
for (const g of ['sum', 'form', 'prn']) {
  const o = A.normPS(null).am[g];
  const html = A.amtLines(1234567, o);
  if (!html.trim()) bad('amtLines empty for ' + g);
}
eq(A.amtLines(0, { r: false, t: false, n: false, w: false }), '', 'amtLines all-off yields nothing (guard prevents this state)');

/* ---- donut: single 100% slice must be a visible ring ---- */
const one = A.donut([{ label: 'زعفران', v: 100 }], 0);
eq(/fill-rule="evenodd"/.test(one), true, 'donut full-circle uses evenodd ring');
const paths = one.match(/<path[^>]*d="([^"]+)"/g) || [];
eq(paths.length, 1, 'donut single slice -> one path');
eq(/A72,72 0 1 1/.test(one), true, 'donut full circle uses large-arc');
// two distinct endpoints for the outer arc (top and bottom), so it is not degenerate
eq(/M110,38/.test(one), true, 'donut outer arc starts at top');
eq(/A44,44 0 1 0/.test(one), true, 'donut inner circle drawn opposite winding');

/* ---- donut: 9 slices must not reuse a colour ---- */
const nine = A.donut(Array.from({ length: 8 }, (_, i) => ({ label: 'k' + i, v: 10 })), 5);
const fills = [...nine.matchAll(/<path[^>]*fill="([^"]+)"/g)].map(x => x[1]);
eq(fills.length, 9, 'donut 9 slices');
eq(new Set(fills).size, 9, 'donut 9 distinct fills');
const legend = [...nine.matchAll(/<i style="background:([^"]+)"/g)].map(x => x[1]);
eq(new Set(legend).size, 9, 'donut legend colours match slices');
eq(JSON.stringify(legend), JSON.stringify(fills), 'legend order matches slice order');

/* ---- donut: normal multi-slice still uses arcs, percentages sum to 100 ---- */
const multi = A.donut([{ label: 'a', v: 60 }, { label: 'b', v: 30 }, { label: 'c', v: 10 }], 0);
eq(/fill-rule/.test(multi), false, 'donut multi-slice uses normal arcs');
const pct = [...multi.matchAll(/— (\d+\.\d)٪/g)].map(x => +x[1]);
eq(Math.round(pct.reduce((a, b) => a + b, 0)), 100, 'donut percentages sum to 100');
eq(A.donut([], 0).includes('ردیف کالایی یافت نشد'), true, 'donut empty state');

/* ---- line chart survives a large series (no spread RangeError) ---- */
const big = Array.from({ length: 200000 }, (_, i) => (i % 2 ? 1 : -1) * i * 1000);
let lc;
try { lc = A.lineChart(big); } catch (e) { bad('lineChart threw on 200k points: ' + e.message); }
if (lc) {
  eq(/<svg/.test(lc), true, 'lineChart renders 200k points');
  eq(/NaN|Infinity|undefined/.test(lc), false, 'lineChart output has no NaN/Infinity');
}
eq(A.lineChart([]).includes('داده‌ای برای نمودار نیست'), true, 'lineChart empty state');
const flat = A.lineChart([0, 0, 0, 0]);
eq(/NaN|Infinity/.test(flat), false, 'lineChart all-zero series has no NaN');

console.log(fail ? `\n${fail} FAILURES` : '\nALL SETTINGS / CHART CHECKS PASSED');
process.exit(fail ? 1 : 0);