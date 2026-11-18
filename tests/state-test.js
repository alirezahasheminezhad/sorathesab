const fs = require('fs'), path = require('path');
const B = path.join(__dirname, '..', 'build');
const js = fs.readFileSync(path.join(B, 'app.js'), 'utf8');

function grab(name) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm');
  const m = re.exec(js);
  if (m) {
    let i = js.indexOf('{', m.index + m[0].length - 1), d = 0, j = i;
    for (; j < js.length; j++) { if (js[j] === '{') d++; else if (js[j] === '}') { d--; if (!d) { j++; break; } } }
    return js.slice(m.index, j);
  }
  const cm = new RegExp('^const\\s+' + name + '\\s*=', 'm').exec(js);
  if (!cm) throw new Error('cannot find ' + name);
  let d = 0, j = cm.index;
  for (; j < js.length; j++) {
    const c = js[j];
    if ('{(['.includes(c)) d++; else if ('})]'.includes(c)) d--;
    else if (c === ';' && d === 0) { j++; break; }
  }
  return js.slice(cm.index, j);
}

const brand = fs.readFileSync(path.join(B, 'brand.public.txt'), 'utf8');
const prelude = js.slice(js.indexOf('const dg ='), js.indexOf('function todayJ('));
const keys = js.slice(js.indexOf('const K  = NS;'), js.indexOf('const $ ='));

const stub = `
const MEM = new Map();
const store = {
  ok:true,
  get(k,d){ return MEM.has(k) ? MEM.get(k) : d; },
  json(k,d){ try{ const v=this.get(k,null); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ MEM.set(k,String(v)); return true; },
  del(k){ MEM.delete(k); }
};
let uidN = 0;
const DEFAULT_CUR = 'ریال - ایران';
let rows = [], hist = [], redoStack = [], LOG = [], VIEWS = [], BOOKS = [];
let SEL = new Set(), curBook = 'main', activeView = null, activeId = null;
let scoreCache = new Map(), cacheTerm = null; const HC = new Map();
let PS = {open:'0'};
const opening = () => 0;
const PCOLS = new Array(10).fill('c');
const SEED = [];
const UI = {unit:'ریال'};
/* DOM-facing side effects are stubbed; the state transitions under test are the real code */
const reindex = () => {};
const render = () => {};
const toast = () => {};
const hideToast = () => {};
const status = () => {};
const setSave = () => {};
const fillPanel = () => {};
const logChange = (m,a,b) => LOG.push({m, n0:a.length, n1:b.length});
const closeDrawer = () => {};
const saveBooks = () => store.set(BK, JSON.stringify(BOOKS));
const renderBooks = () => {};
const $ = () => ({value:'', textContent:'', classList:{toggle(){}}, addEventListener(){}});
const ask = async () => true;
const askText = async (t,d,v) => v;
`;

const names = ['normRow', 'uid', 'snapshot', 'dropSearchCache', 'commit', 'undo', 'redo',
  'psKey', 'rowKey', 'logKey', 'bookRowKey', 'bookCount', 'loadBooks', 'switchBook', 'deleteBook',
  'loadRows', 'persistRows', 'loadPS', 'savePS', 'loadLog', 'normPS', 'PDEF', 'DEF_ITEMS'];
const src = [brand, prelude, keys, stub, ...names.map(grab),
  'module.exports={MEM,store,K,PK,LK,BK,VK,UK,APPID,isBackupId,get rows(){return rows},set rows(v){rows=v},' +
  'get hist(){return hist},get redoStack(){return redoStack},get SEL(){return SEL},set SEL(v){SEL=v},' +
  'get BOOKS(){return BOOKS},set BOOKS(v){BOOKS=v},get curBook(){return curBook},' +
  'commit,undo,redo,snapshot,normRow,loadBooks,switchBook,deleteBook,bookCount,rowKey,psKey,logKey};'].join('\n');
const m = { exports: {} };
new Function('module', 'exports', src)(m, m.exports);
const A = m.exports;

let fail = 0;
const bad = s => { console.log('FAIL:', s); fail++; };
const eq = (a, b, s) => { if (a !== b) bad(`${s}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const R = (s, dr, cr) => A.normRow({ d: '1404/04/0' + (1 + (s % 9)), s: 'سند ' + s, dr, cr });
const ids = () => A.rows.map(r => r.id).join(',');

(async () => {
  /* ---- commit / undo / redo round-trip ---- */
  A.rows = [R(1, 100, 0), R(2, 0, 50), R(3, 200, 0)];
  const base = ids();
  eq(A.hist.length, 0, 'no history initially');
  eq(A.redoStack.length, 0, 'no redo initially');

  A.commit([R(1, 100, 0), R(2, 0, 50), R(3, 200, 0), R(4, 300, 0)], 'افزودن');
  eq(A.rows.length, 4, 'commit appended a row');
  eq(A.hist.length, 1, 'commit pushed one snapshot');
  eq(A.redoStack.length, 0, 'commit clears redo');

  A.undo();
  eq(A.rows.length, 3, 'undo restored 3 rows');
  eq(ids(), base, 'undo restored exact ids and order');
  eq(A.redoStack.length, 1, 'undo pushed a redo snapshot');
  eq(A.hist.length, 0, 'undo popped history');

  A.redo();
  eq(A.rows.length, 4, 'redo re-applied the append');
  eq(A.hist.length, 1, 'redo pushed history back');
  eq(A.redoStack.length, 0, 'redo popped its stack');

  // undo twice must not go past the beginning
  A.undo(); A.undo(); A.undo();
  eq(A.rows.length, 3, 'undo stops at the oldest snapshot');
  A.redo(); A.redo(); A.redo();
  eq(A.rows.length, 4, 'redo stops at the newest snapshot');

  // a fresh commit after undo must discard the redo branch
  A.undo();
  eq(A.redoStack.length, 1, 'redo available after undo');
  A.commit([R(9, 1, 0)], 'شاخه جدید');
  eq(A.redoStack.length, 0, 'new commit discards the redo branch');
  A.redo();
  eq(A.rows.length, 1, 'redo is a no-op after a new commit');

  // multi-step chain returns to the original state
  A.rows = [R(1, 100, 0)];
  const start = ids();
  A.commit([R(1, 100, 0), R(2, 200, 0)], 'a');
  A.commit([R(1, 100, 0), R(2, 200, 0), R(3, 300, 0)], 'b');
  A.commit([R(3, 300, 0)], 'c');
  A.undo(); A.undo(); A.undo();
  eq(ids(), start, 'three undos return to the start');
  A.redo(); A.redo(); A.redo();
  eq(A.rows.length, 1, 'three redos return to the end');

  // history is capped at 40
  A.rows = [R(0, 1, 0)];
  for (let i = 0; i < 60; i++) A.commit([R(i, i + 1, 0)], 'x' + i);
  eq(A.hist.length, 40, 'history capped at 40 snapshots');

  // selection survives undo/redo
  A.rows = [R(1, 100, 0), R(2, 200, 0)];
  A.SEL = new Set([A.rows[1].id]);
  A.commit([A.rows[0]], 'حذف', { keepSel: false });
  eq(A.SEL.size, 0, 'commit drops selection of removed rows');
  A.undo();
  eq(A.SEL.size, 1, 'undo restores the selection');
  A.redo();
  eq(A.SEL.size, 0, 'redo restores the post-delete selection');

  /* ---- storage keys are unchanged for the main book ---- */
  eq(A.K, 'sorathesab_ledger_v1', 'public namespace');
  eq(A.APPID, 'sorathesab-ledger', 'backup id derived from namespace');
  eq(A.isBackupId('older-ledger'), true, 'legacy backup accepted');
  eq(A.isBackupId('sorathesab-ledger'), true, 'own backup accepted');
  eq(A.isBackupId('something-else'), false, 'foreign file rejected');
  eq(A.isBackupId(null), false, 'missing app id rejected');
  A.switchBook('main');
  eq(A.rowKey(), A.K, 'main book uses the bare row key');
  eq(A.psKey(), A.PK, 'main book uses the bare settings key');
  eq(A.logKey(), A.LK, 'main book uses the bare log key');

  /* ---- multi-book isolation ---- */
  A.BOOKS = [{ id: 'main', name: 'دفتر اصلی' }];
  A.switchBook('main');
  A.rows = [R(1, 100, 0), R(2, 200, 0)];
  A.commit(A.rows.slice(), 'seed main');
  eq(A.MEM.has(A.K), true, 'main rows persisted under the bare key');

  A.BOOKS = [{ id: 'main', name: 'دفتر اصلی' }, { id: 'x1', name: 'دفتر دوم' }];
  A.switchBook('x1');
  eq(A.rowKey(), A.K + '_bx1', 'second book uses a suffixed key');
  eq(A.hist.length, 0, 'switching books clears history');
  eq(A.redoStack.length, 0, 'switching books clears redo');
  eq(A.SEL.size, 0, 'switching books clears selection');

  /* ---- deleting a book removes exactly its own keys ---- */
  A.MEM.set(A.K + '_bx1', '[]');
  A.MEM.set(A.PK + '_bx1', '{}');
  A.MEM.set(A.LK + '_bx1', '[]');
  const mainBefore = A.MEM.get(A.K);
  A.switchBook('main');
  await A.deleteBook('x1');
  eq(A.MEM.has(A.K + '_bx1'), false, 'deleted book row key removed');
  eq(A.MEM.has(A.PK + '_bx1'), false, 'deleted book settings key removed');
  eq(A.MEM.has(A.LK + '_bx1'), false, 'deleted book log key removed');
  eq(A.MEM.get(A.K), mainBefore, 'deleting another book leaves main data untouched');
  eq(A.BOOKS.length, 1, 'book removed from the index');
  eq(A.curBook, 'main', 'still on main');

  /* ---- deleting the MAIN book must clear its bare keys too (audit #9) ---- */
  A.BOOKS = [{ id: 'main', name: 'دفتر اصلی' }, { id: 'x2', name: 'دفتر دوم' }];
  A.MEM.set(A.K, '[{"id":"a"}]');
  A.MEM.set(A.PK, '{"color":"#12305a"}');
  A.MEM.set(A.LK, '[{"m":"x"}]');
  A.MEM.set(A.K + '_bx2', '[]');
  A.switchBook('main');
  await A.deleteBook('main');
  eq(A.MEM.has(A.K), false, 'main row key removed');
  eq(A.MEM.has(A.PK), false, 'main settings key removed (audit #9)');
  eq(A.MEM.has(A.LK), false, 'main log key removed (audit #9)');
  eq(A.MEM.has(A.K + '_bx2'), true, 'surviving book data untouched');
  eq(A.curBook, 'x2', 'switched to the surviving book');
  eq(A.BOOKS.length, 1, 'main removed from the index');

  /* ---- the last book cannot be deleted ---- */
  await A.deleteBook('x2');
  eq(A.BOOKS.length, 1, 'last book survives a delete request');
  eq(A.MEM.has(A.K + '_bx2'), true, 'last book data intact');

  /* ---- loadBooks must not resurrect a deleted main ---- */
  A.MEM.set(A.BK, JSON.stringify([{ id: 'x2', name: 'دفتر دوم' }]));
  A.loadBooks();
  eq(A.BOOKS.length, 1, 'loadBooks keeps the stored list');
  eq(A.BOOKS[0].id, 'x2', 'deleted main stays deleted');
  A.MEM.set(A.BK, '[]');
  A.loadBooks();
  eq(A.BOOKS.length, 1, 'empty index seeds one default book');
  eq(A.BOOKS[0].id, 'main', 'default book is main');
  A.MEM.set(A.BK, 'not json');
  A.loadBooks();
  eq(A.BOOKS[0].id, 'main', 'corrupt index falls back to default');
  A.MEM.set(A.BK, JSON.stringify([null, { id: 'ok', name: null }]));
  A.loadBooks();
  eq(A.BOOKS.length, 1, 'null entries dropped');
  eq(A.BOOKS[0].name, 'دفتر بی‌نام', 'missing name gets a label');

  console.log(fail ? `\n${fail} FAILURES` : '\nALL STATE / STORAGE CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();