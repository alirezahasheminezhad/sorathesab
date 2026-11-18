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

const prelude = js.slice(js.indexOf('const dg ='), js.indexOf('function todayJ('));
const names = ['hay', 'tokScore', 'score', 'lev', 'dice', 'calc', 'normRow', 'uid'];
const src = [prelude, 'let uidN=0; const HC=new Map(); const DEFAULT_CUR="ریال - ایران";',
  ...names.map(grab),
  /* the exact near-match fallback lifted from buildView */
  `function nearFallback(sc, exact){
    let near = false;
    if (!sc.some(x=>x>0) && !exact && sc.length){
      near = true;
      const rank = sc.map((x,i)=>[i,-x]).sort((a,b)=>b[1]-a[1] || a[0]-b[0]);
      sc = sc.map(()=>0);
      rank.slice(0,10).forEach(([i,v]) => { if (v >= .15) sc[i] = v; });
    }
    return {sc, near};
  }
  module.exports={score,hay,lev,dice,calc,normRow,nearFallback,words};`
].join('\n');
const m = { exports: {} };
new Function('module', 'exports', src)(m, m.exports);
const A = m.exports;

let fail = 0;
const bad = s => { console.log('FAIL:', s); fail++; };
const eq = (a, b, s) => { if (a !== b) bad(`${s}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const R = (d, s, dr, cr, extra) => A.normRow(Object.assign({ d, s, dr, cr }, extra));

/* ---- exact search ---- */
const rows = [
  R('1404/01/05', 'فروش زعفران قائنات', 5000000, 0),
  R('1404/01/06', 'خرید هل سبز', 0, 2000000),
  R('1404/01/07', 'فروش دارچین سیلان', 1500000, 0),
  R('1404/01/08', 'پرداخت حواله بانکی', 0, 700000),
];
const sc = (term, exact) => rows.map((r, i) => A.score(r, A.calc(rows, 0).bals[i], A.words(term), !!exact));
eq(sc('زعفران')[0] > 0, true, 'exact term hits its row');
eq(sc('زعفران').filter(x => x > 0).length, 1, 'only the matching row scores positive');
eq(sc('هل')[1] > 0, true, 'second row matched');
eq(sc('5000000')[0] > 0, true, 'numeric amount searchable');
eq(sc('۵۰۰۰۰۰۰')[0] > 0, true, 'Persian-digit amount searchable');
eq(sc('فروش').filter(x => x > 0).length, 2, 'shared token matches two rows');
eq(sc('زعفران هل').every(x => x > 0), false, 'multi-token needs all tokens');

/* ---- note is searchable (audit #4) ---- */
const withNote = R('1404/02/01', 'فروش عمومی', 100, 0, { note: 'پیگیری شود با انبار مرکزی' });
eq(A.score(withNote, 100, A.words('انبار'), false) > 0, true, 'note text is searchable');
// editing the note must invalidate the haystack cache
A.hay(withNote);
withNote.note = 'تحویل به مشتری نقدی';
eq(A.score(withNote, 100, A.words('انبار'), false) > 0, false, 'hay cache refreshes when note changes');
eq(A.score(withNote, 100, A.words('نقدی'), false) > 0, true, 'new note text searchable immediately');

/* ---- near-match fallback: bounded, and keeps the BEST matches ---- */
const many = Array.from({ length: 224 }, (_, i) => R('1404/03/01', 'سند شماره ' + i, 1000 + i, 0));
many.push(R('1404/03/01', 'زعفران قائنات', 9000, 0));
const raw = many.map(r => A.score(r, 0, A.words('زعفران قالب'), false));
eq(raw.every(x => x <= 0), true, 'partial multi-token match scores non-positive');
const fb = A.nearFallback(raw.slice(), false);
eq(fb.near, true, 'fallback flagged as near');
const kept = fb.sc.filter(x => x > 0);
eq(kept.length <= 10, true, 'fallback keeps at most 10 rows');
eq(kept.length > 0, true, 'fallback keeps the genuinely near row');
eq(fb.sc[224] > 0, true, 'the closest row is the one kept');
// the kept rows must be the highest-similarity ones
const best = raw.map(x => -x).sort((a, b) => b - a).slice(0, 10).filter(v => v >= .15);
eq(kept.length, best.length, 'fallback count equals top-10 above threshold');
eq(Math.max(...kept).toFixed(6), Math.max(...best).toFixed(6), 'fallback keeps the best similarity, not the worst');
// a term near nothing at all must yield nothing, not the whole ledger
const far = many.map(r => A.score(r, 0, A.words('بیلدوزر'), false));
eq(A.nearFallback(far.slice(), false).sc.filter(x => x > 0).length, 0, 'unrelated term yields no rows');
// exact mode must not fall back
eq(A.nearFallback(raw.slice(), true).near, false, 'exact mode never falls back');
// a positive hit disables the fallback
eq(A.nearFallback([0, 0.8, -0.2], false).near, false, 'fallback skipped when an exact hit exists');
// tied scores must not return the whole ledger
const tied = new Array(225).fill(-0.5);
eq(A.nearFallback(tied, false).sc.filter(x => x > 0).length, 10, 'tied scores capped at 10');
// empty ledger
eq(A.nearFallback([], false).near, false, 'empty ledger does not flag near');

/* ---- Excel total formula identity (audit #8) ---- */
for (const open of [0, 1000000, -94099541250, 250.5]) {
  const t = A.calc(rows, open);
  const sdr = rows.reduce((x, r) => x + r.dr, 0), scr = rows.reduce((x, r) => x + r.cr, 0);
  const formulaResult = Math.abs(open + sdr - scr);   // ABS(open + F - G)
  eq(formulaResult, Math.abs(t.bal), `Excel ABS(open+F-G) matches |balance| for opening ${open}`);
}

console.log(fail ? `\n${fail} FAILURES` : '\nALL SEARCH / EXPORT CHECKS PASSED');
process.exit(fail ? 1 : 0);