/* =====================================================================
   دفتر صورت‌حساب — نسخه یکپارچه آفلاین
   کلیدهای ذخیره‌سازی با نسخه‌های قبلی سازگار است؛ داده‌های موجود حفظ می‌شود.
   ===================================================================== */
'use strict';

/* ------------------------------ keys ------------------------------ */
const K  = NS;                               // دفتر اصلی — بدون تغییر
const PK = K + '_print2';                    // تنظیمات ظاهر — بدون تغییر
const LK = K + '_log';                       // تاریخچه — بدون تغییر
const BK = K + '_books';                   // فهرست دفترها
const VK = K + '_views';                   // نماهای ذخیره‌شده
const UK = K + '_ui';                      // ترجیحات رابط
/* شناسهٔ فایل پشتیبان از فضای‌نام دفتر ساخته می‌شود؛ پشتیبان نسخه‌های دیگر همین دفتر هم پذیرفته می‌شود. */
const APPID = NS.replace(/_ledger_v\d+$/, '-ledger');
const isBackupId = v => typeof v === 'string' && /^[a-z0-9_-]+-ledger$/.test(v);

const $ = id => document.getElementById(id);
/* rAF can be starved in background/occluded tabs; the timer guarantees the frame lands. */
const nextFrame = fn => {
  let done = false;
  const run = () => { if (done) return; done = true; fn(); };
  requestAnimationFrame(run);
  setTimeout(run, 32);
};
const RM = matchMedia('(prefers-reduced-motion:reduce)');

/* --------------------------- safe storage -------------------------- */
const store = {
  ok: true,
  get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : v; } catch(e){ this.ok = false; return d; } },
  json(k, d){ try { const v = this.get(k, null); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, v); this.ok = true; return true; } catch(e){ this.ok = false; return false; } },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};

/* ---------------------------- text / numbers ----------------------- */
const dg = s => String(s ?? '').replace(/[۰-۹٠-٩]/g, c => {
  const k = c.codePointAt(0);
  return String(k - (k >= 0x6F0 ? 0x6F0 : 0x660));
});
const fa = s => String(s ?? '').replace(/[يى]/g,'ی').replace(/ك/g,'ک');
function toEn(s){
  return dg(s).replace(/[,٬\s‌‏‎]/g,'').replace(/٫/g,'.').replace(/[−–—]/g,'-');
}
const num = s => { const v = parseFloat(toEn(s)); return Number.isFinite(v) ? v : 0; };
const nz = s => dg(s).replace(/(\d)[,٬](?=\d)/g,'$1')
  .replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[ۀة]/g,'ه').replace(/[أإآ]/g,'ا')
  .replace(/[ً-ٰٟـ]/g,'').replace(/‌/g,' ').toLowerCase();
const words = s => nz(s).split(/[^\p{L}\p{N}/.]+/u).map(w => w.replace(/^[./]+|[./]+$/g,'')).filter(Boolean);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf  = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
const nf6 = new Intl.NumberFormat('en-US', {maximumFractionDigits: 6});
const gf  = v => v ? nf6.format(v) : '';
const clamp = (v,a,b) => Math.min(Math.max(v,a),b);

const money = v => nf.format(UI.unit === 'تومان' ? v/10 : v);
const fbal = b => nf.format(Math.abs(b)) + (b < 0 ? ' بستانکار' : b > 0 ? ' بدهکار' : ' (تسویه)');

/* group digits while typing, caret preserved */
function groupInput(el, allowNeg){
  const raw = dg(el.value), pos = el.selectionStart ?? raw.length;
  const neg = allowNeg && /^\s*-/.test(raw);
  const before = raw.slice(0,pos).replace(/[^\d.]/g,'').length;
  let clean = raw.replace(/[^\d.]/g,'');
  const k = clean.indexOf('.');
  if (k >= 0) clean = clean.slice(0,k+1) + clean.slice(k+1).replace(/\./g,'');
  let [i,d] = clean.split('.');
  if (i === '' && d !== undefined) i = '0';
  i = (i||'').replace(/^0+(?=\d)/,'');
  const out = (neg?'-':'') + i.replace(/\B(?=(\d{3})+(?!\d))/g,',') + (d !== undefined ? '.'+d : '');
  el.value = out;
  let c = 0, np = 0;
  for (; np < out.length && c < before; np++) if (/[\d.]/.test(out[np])) c++;
  if (neg) np = Math.min(np+1, out.length);
  try { el.setSelectionRange(np,np); } catch(e){}
}

/* ------------------------- number to Persian words ------------------ */
const W1=['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه','ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'];
const W10=['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'];
const W100=['','یکصد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'];
const WS=['','هزار','میلیون','میلیارد','تریلیون','کوادریلیون'];
function w3(n){
  const a=[], h=Math.floor(n/100), r=n%100;
  if (h) a.push(W100[h]);
  if (r){ if (r<20) a.push(W1[r]); else { a.push(W10[Math.floor(r/10)]); if (r%10) a.push(W1[r%10]); } }
  return a.join(' و ');
}
function nw(v){
  if (!Number.isFinite(v)) return '';
  const neg = v < 0; v = Math.round(Math.abs(v)*100)/100;
  let ip = Math.floor(v); const fp = Math.round((v-ip)*100);
  if (ip >= 1e18) return 'عدد بسیار بزرگ';
  if (!ip && !fp) return 'صفر';
  const parts=[]; let k=0;
  while (ip>0){ const g=ip%1000; if (g) parts.unshift(w3(g)+(WS[k]?' '+WS[k]:'')); ip=Math.floor(ip/1000); k++; }
  let s = parts.join(' و ');
  if (fp) s += (s?' و ':'') + (fp%10===0 ? w3(fp/10)+' دهم' : w3(fp)+' صدم');
  return (neg?'منفی ':'')+s;
}
function amtLines(v, o){
  if (!o) return '';
  let h = '';
  [['r','ریال',v],['t','تومان',v/10]].forEach(([k,u,x]) => {
    if (!o[k]) return;
    if (o.n) h += `<div class="al">${nf.format(x)} ${u}</div>`;
    if (o.w) h += `<div class="aw">${nw(x)} ${u}</div>`;
  });
  return h;
}

/* ------------------------------ Jalali ------------------------------ */
/* الگوریتم جلالی به تقسیم با گردکردن به سمت صفر نیاز دارد؛ Math.floor برای operand منفی سال را یکی کم می‌کند. */
const jdiv=(a,b)=>Math.trunc(a/b), jmod=(a,b)=>a-Math.trunc(a/b)*b;
const JBREAKS=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCal(jy){
  const bl=JBREAKS.length, gy=jy+621; let leapJ=-14, jp=JBREAKS[0], jm=0, jump=0, leap=-1, n, i;
  if (jy<jp || jy>=JBREAKS[bl-1]) return null;
  for (i=1;i<bl;i++){ jm=JBREAKS[i]; jump=jm-jp; if (jy<jm) break; leapJ+=jdiv(jump,33)*8+jdiv(jmod(jump,33),4); jp=jm; }
  n=jy-jp;
  leapJ += jdiv(n,33)*8 + jdiv(jmod(n,33)+3,4);
  if (jmod(jump,33)===4 && jump-n===4) leapJ++;
  const leapG = jdiv(gy,4) - jdiv((jdiv(gy,100)+1)*3,4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump-n<6) n = n-jump+jdiv(jump+4,33)*33;
  leap = jmod(jmod(n+1,33)-1,4); if (leap===-1) leap=4;
  return {leap, gy, march};
}
function g2d(gy,gm,gd){
  let d = jdiv((gy+jdiv(gm-8,6)+100100)*1461,4) + jdiv(153*jmod(gm+9,12)+2,5) + gd - 34840408;
  return d - jdiv(jdiv(gy+100100+jdiv(gm-8,6),100)*3,4) + 752;
}
function d2g(jdn){
  let j = 4*jdn + 139361631;
  j += jdiv(jdiv(4*jdn+183187720,146097)*3,4)*4 - 3908;
  const i = jdiv(jmod(j,1461),4)*5 + 308;
  const gd = jdiv(jmod(i,153),5)+1, gm = jmod(jdiv(i,153),12)+1, gy = jdiv(j,1461)-100100+jdiv(8-gm,6);
  return {gy,gm,gd};
}
function d2j(jdn){
  const gy=d2g(jdn).gy; let jy=gy-621; const r=jalCal(jy); if (!r) return null;
  let k = jdn - g2d(gy,3,r.march), jm, jd;
  if (k>=0){ if (k<=185) return {jy, jm:1+jdiv(k,31), jd:jmod(k,31)+1}; k-=186; }
  else { jy--; k+=179; if (r.leap===1) k++; }
  jm = 7+jdiv(k,30); jd = jmod(k,30)+1;
  return {jy,jm,jd};
}
function j2d(jy,jm,jd){
  const r = jalCal(jy); if (!r) return null;
  return g2d(r.gy,3,r.march) + (jm<=6 ? (jm-1)*31 : 186+(jm-7)*30) + jd-1;
}
const jleap = y => { const r = jalCal(y); return !!r && r.leap===0; };
const MN = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const jMonthLen = (y,m) => m<=6 ? 31 : m<=11 ? 30 : (jleap(y)?30:29);
const pad2 = n => String(n).padStart(2,'0');

function normDate(s){
  let t = toEn(s).replace(/[-.\\/]/g,'/').replace(/\/+/g,'/').replace(/^\/|\/$/g,'');
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  return m ? `${m[1]}/${pad2(m[2])}/${pad2(m[3])}` : t;
}
function jvalid(s){
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(normDate(s)); if (!m) return false;
  const y=+m[1], mo=+m[2], d=+m[3];
  if (y<1300 || y>1500 || mo<1 || mo>12 || d<1) return false;
  return d <= jMonthLen(y,mo);
}
const dkey = s => { const m=/^(\d{4})\/(\d{2})\/(\d{2})$/.exec(normDate(s)); return (m && jvalid(s)) ? (+m[1])*10000+(+m[2])*100+(+m[3]) : null; };
/* کلید تاریخ فقط برای مرتب‌سازی است؛ برای فاصلهٔ روزها باید شمارهٔ روز پیوسته به‌کار رود، وگرنه مرز ماه می‌شکند. */
const dnum = s => { const m=/^(\d{4})\/(\d{2})\/(\d{2})$/.exec(normDate(s)); return (m && jvalid(s)) ? j2d(+m[1],+m[2],+m[3]) : null; };
function todayJ(){
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric'})
      .formatToParts(new Date()).map(x=>[x.type,x.value]));
    const y=parseInt(p.year), m=parseInt(p.month), d=parseInt(p.day);
    if (y && m && d) return {y,m,d};
  } catch(e){}
  const j = d2j(g2d(new Date().getFullYear(), new Date().getMonth()+1, new Date().getDate()));
  return {y:j.jy, m:j.jm, d:j.jd};
}
const todayNum = () => { const t=todayJ(); return j2d(t.y,t.m,t.d); };
const todayStr = () => { const t=todayJ(); return `${t.y}/${pad2(t.m)}/${pad2(t.d)}`; };
const gregToJ = (gy,gm,gd) => { const j=d2j(g2d(gy,gm,gd)); return j ? `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}` : ''; };
const sortByDate = list => list.map((r,i)=>[r,i])
  .sort((a,b)=>(dkey(a[0].d) ?? 1e9)-(dkey(b[0].d) ?? 1e9) || a[1]-b[1]).map(x=>x[0]);

/* ------------------------------- state ------------------------------ */
const COLS = ['تاریخ عملیات','شرح','مقدار','واحد','قیمت','بدهکار','بستانکار','تشخیص','مانده','عنوان ارز و کشور'];
const PCOLS = ['ردیف','تاریخ','شرح','مقدار','واحد','قیمت','بدهکار','بستانکار','تشخیص','مانده'];
const CID   = ['idx','date','desc','qty','unit','price','dr','cr','side','bal'];
const DEFAULT_CUR = 'ریال - ایران (مبنا)';

let rows = [], hist = [], redoStack = [], LOG = [], VIEWS = [], BOOKS = [];
let SEL = new Set();                 // row ids
let visRows = [], LASTV = null, AUD = [], AUDMAP = {};
let activeId = null, printSel = false, sMsg = false, curBook = 'main';
let scoreCache = new Map(), cacheTerm = null;

const UI = Object.assign({unit:'ریال', theme:'light', density:'cozy', anim:true, tab:'ledger', order:'reg'}, store.json(UK,{}));
if (!['ریال','تومان'].includes(UI.unit)) UI.unit = 'ریال';
if (!['light','dark'].includes(UI.theme)) UI.theme = 'light';
const saveUI = () => store.set(UK, JSON.stringify(UI));

/* --------------------------- print settings ------------------------- */
const DEF_ITEMS = () => BRAND.items.map(x => Object.assign({}, x));
const PDEF = () => ({
  name:BRAND.name, showName:true,
  sub:BRAND.sub, showSub:true,
  date:'', showDate:true, showUnit:true, open:'0',
  main:BRAND.main,
  showMain:true, items:DEF_ITEMS(), showItems:true,
  color:'#12305a', fs:'', zebra:true, showTotals:true,
  cols:PCOLS.map(()=>true),
  am:{sum:{r:true,t:true,n:true,w:true}, form:{r:false,t:true,n:true,w:true}, prn:{r:true,t:true,n:true,w:true,show:false}},
  ck:{on:true,imp:true,cons:true,date:true,ord:true,cur:true,dup:true,mark:true,prnw:true,qty:true}
});
function normPS(p){
  const src = (p && typeof p === 'object') ? p : {};
  const r = Object.assign(PDEF(), src);
  if (!Array.isArray(r.cols) || r.cols.length !== PCOLS.length) r.cols = PCOLS.map(()=>true);
  r.cols = r.cols.map(Boolean);
  if (!r.cols.some(Boolean)) r.cols = PCOLS.map(()=>true);
  r.items = Array.isArray(r.items)
    ? r.items.map(x => ({t:String(x&&x.t||''), v:String(x&&x.v||''), k:(x&&x.k==='s')?'s':'c', on:!(x&&x.on===false)}))
    : DEF_ITEMS();
  ['name','sub','date','main','fs','open'].forEach(k => { r[k] = String(r[k] ?? (k==='open'?'0':'')); });
  if (!/^#[0-9a-fA-F]{6}$/.test(r.color)) r.color = '#12305a';
  ['showName','showSub','showDate','showUnit','showMain','showItems','zebra','showTotals'].forEach(k => { r[k] = r[k] !== false; });
  const D = PDEF();
  r.am = {}; ['sum','form','prn'].forEach(g => {
    const s = (src.am && src.am[g]) || {}, o = Object.assign({}, D.am[g]);
    Object.keys(o).forEach(k => { if (k in s) o[k] = s[k] !== false; });
    if (!o.r && !o.t) o.r = true;
    if (!o.n && !o.w) o.n = true;
    r.am[g] = o;
  });
  r.ck = {}; Object.keys(D.ck).forEach(k => { r.ck[k] = !(src.ck && src.ck[k] === false); });
  return r;
}
let PS = PDEF();
const psKey  = () => curBook === 'main' ? PK : PK + '_b' + curBook;
const rowKey = () => curBook === 'main' ? K  : K  + '_b' + curBook;
const logKey = () => curBook === 'main' ? LK : LK + '_b' + curBook;
const opening = () => { const v = num(PS.open); return Number.isFinite(v) ? v : 0; };

/* ------------------------------ rows i/o ---------------------------- */
let uidN = 0;
const uid = () => 'r' + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2,6);
function normRow(r){
  if (!r || typeof r !== 'object') return null;
  const o = {
    id: typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.id) ? r.id : uid(),
    d: normDate(String(r.d ?? '')),
    s: String(r.s ?? '').trim(),
    q: Number.isFinite(+r.q) ? Math.max(0,+r.q) : 0,
    u: String(r.u ?? '').trim(),
    p: Number.isFinite(+r.p) ? Math.max(0,+r.p) : 0,
    dr: Number.isFinite(+r.dr) ? Math.max(0,+r.dr) : 0,
    cr: Number.isFinite(+r.cr) ? Math.max(0,+r.cr) : 0,
    c: String(r.c ?? '').trim() || DEFAULT_CUR,
    note: String(r.note ?? '')
  };
  if (!o.d && !o.s && !o.dr && !o.cr) return null;
  return o;
}
function loadRows(){
  const raw = store.json(rowKey(), null);
  if (Array.isArray(raw)){
    rows = raw.map(normRow).filter(Boolean);
    const seen = new Set();
    rows.forEach(r => { if (seen.has(r.id)) r.id = uid(); seen.add(r.id); });
  } else if (curBook === 'main' && typeof SEED !== 'undefined'){
    rows = SEED.map(a => normRow({d:a[0],s:a[1],q:a[2],u:a[3],p:a[4],dr:a[5],cr:a[6],c:DEFAULT_CUR})).filter(Boolean);
    persistRows();
  } else rows = [];
}
function persistRows(){
  setSave('busy');
  const ok = store.set(rowKey(), JSON.stringify(rows));
  setSave(ok ? 'ok' : 'bad');
  if (!ok) status('ذخیره‌سازی در مرورگر انجام نشد (حافظه پر است یا حالت خصوصی). از «دانلود پشتیبان» استفاده کنید.', true);
  return ok;
}
let saveT = null;
function setSave(state){
  const el = $('saveChip'); if (!el) return;
  clearTimeout(saveT);
  el.classList.toggle('busy', state === 'busy');
  el.classList.toggle('bad', state === 'bad');
  $('saveTxt').textContent = state === 'busy' ? 'در حال ذخیره…' : state === 'bad' ? 'ذخیره نشد' : 'ذخیره شد';
  if (state === 'ok') saveT = setTimeout(() => { $('saveTxt').textContent = 'ذخیره شد'; }, 1200);
}
function loadPS(){ PS = normPS(store.json(psKey(), null)); }
function savePS(){ if (!store.set(psKey(), JSON.stringify(PS))) status('ذخیره تنظیمات انجام نشد.', true); }
function loadLog(){ const l = store.json(logKey(), []); LOG = Array.isArray(l) ? l : []; }

/* ------------------------------- books ------------------------------ */
function loadBooks(){
  const b = store.json(BK, null);
  const list = Array.isArray(b) ? b.filter(x => x && typeof x.id === 'string') : [];
  BOOKS = list.length ? list : [{id:'main', name:BRAND.book}];
  BOOKS.forEach(x => { x.name = String(x.name || 'دفتر بی‌نام'); });
}
function saveBooks(){ store.set(BK, JSON.stringify(BOOKS)); }
function renderBooks(){
  const s = $('book'); s.innerHTML = '';
  BOOKS.forEach(b => s.add(new Option(b.name, b.id)));
  s.value = curBook;
}
function switchBook(id){
  if (id === curBook) return;
  curBook = id;
  store.set(K+'_cur', id);
  $('book').value = id;
  SEL.clear(); hist = []; redoStack = []; activeId = null; closeDrawer();
  dropSearchCache(); activeView = null;
  loadRows(); loadPS(); loadLog();
  $('unit').value = UI.unit;
  fillPanel(); render(); persistRows();
  status(`دفتر «${(BOOKS.find(b=>b.id===id)||{}).name}» باز شد — ${rows.length} ردیف.`);
}
function bookRowKey(id){ return id === 'main' ? K : K + '_b' + id; }
function bookCount(id){
  if (id === curBook) return rows.length;
  const l = store.json(bookRowKey(id), null);
  return Array.isArray(l) ? l.length : 0;
}
function renderBookList(){
  const tb = $('bksB'); tb.innerHTML = '';
  const last = BOOKS.length < 2;
  BOOKS.forEach(b => {
    const on = b.id === curBook, n = bookCount(b.id);
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><span class="bkname${on?' on':''}"><i class="dot"></i>${esc(b.name)}${on?' <span class="sev info">فعال</span>':''}</span></td>` +
      `<td class="n">${nf.format(n)}</td>` +
      `<td><span class="bkacts">` +
        `<button type="button" data-ba="o" data-id="${esc(b.id)}"${on?' disabled':''}>بازکردن</button>` +
        `<button type="button" data-ba="r" data-id="${esc(b.id)}">تغییر نام</button>` +
        `<button type="button" data-ba="d" data-id="${esc(b.id)}" class="danger"${last?' disabled':''}>حذف</button>` +
      `</span></td>`;
    tb.appendChild(tr);
  });
}
async function newBook(){
  const name = await askText('دفتر جدید', 'هر دفتر داده، تنظیمات چاپ و تاریخچه جدا دارد؛ دفتر فعلی دست‌نخورده می‌ماند.',
    'نام دفتر', '', 'ساختن دفتر');
  if (!name) return null;
  const id = 'b' + Date.now().toString(36);
  BOOKS.push({id, name:name.trim()}); saveBooks();
  const clone = normPS(PS); clone.sub = name.trim();
  store.set(PK+'_b'+id, JSON.stringify(clone));
  store.set(K+'_b'+id, '[]');
  renderBooks(); switchBook(id);
  status(`دفتر «${name.trim()}» ساخته شد. اکنون خالی است.`);
  return id;
}
async function renameBook(id){
  const b = BOOKS.find(x => x.id === id); if (!b) return;
  const name = await askText('تغییر نام دفتر', 'داده‌های دفتر تغییری نمی‌کند؛ فقط نام نمایشی عوض می‌شود.',
    'نام دفتر', b.name, 'ذخیره نام');
  if (!name || name === b.name) return;
  b.name = name; saveBooks(); renderBooks();
  if (id === curBook){ PS.sub = name; savePS(); }
  status(`نام دفتر به «${name}» تغییر کرد.`);
}
async function deleteBook(id){
  const b = BOOKS.find(x => x.id === id); if (!b || BOOKS.length < 2) return;
  const n = bookCount(id);
  const ok = await ask('حذف دفتر', `دفتر «${b.name}» با ${nf.format(n)} ردیف برای همیشه حذف می‌شود و قابل بازگردانی نیست. اگر لازمش دارید، ابتدا از آن پشتیبان بگیرید.`, 'حذف دفتر');
  if (!ok) return;
  /* دفتر اصلی کلید بی‌پسوند دارد؛ پاک‌کردن کلید پسونددار، تنظیمات و تاریخچه‌اش را جا می‌گذاشت. */
  if (id === 'main'){ store.del(K); store.del(PK); store.del(LK); }
  else { store.del(K+'_b'+id); store.del(PK+'_b'+id); store.del(LK+'_b'+id); }
  BOOKS = BOOKS.filter(x => x.id !== id); saveBooks();
  const next = BOOKS[0].id;
  renderBooks();
  if (id === curBook) switchBook(next); else $('book').value = curBook;
  status(`دفتر «${b.name}» حذف شد.`);
}

/* ------------------------------- status ----------------------------- */
function status(m, err){
  const el = $('status'); if (!el) return;
  el.textContent = m || '';
  el.classList.toggle('err', !!err);
  el.classList.toggle('ok', !err && !!m);
}

/* ------------------------------- calc ------------------------------- */
function calc(list = rows, open = opening()){
  let b = open, dr = 0, cr = 0; const bals = [];
  for (const r of list){ b += r.dr - r.cr; bals.push(b); dr += r.dr; cr += r.cr; }
  return {dr, cr, bal:b, bals, open};
}

/* ------------------------------- audit ------------------------------ */
function audit(list, fb){
  const out = [], ck = PS.ck;
  if (!ck.on) return out;
  let prev = null, prevFb = null; const seen = new Map();
  list.forEach((r,i) => {
    const n = i+1, add = (sev,k,m) => out.push({n,sev,k,m,id:r.id});
    if (ck.cons){
      if ([r.q,r.p,r.dr,r.cr].some(v => !Number.isFinite(v) || v < 0)) add('err','neg','مقدار، قیمت یا مبلغ منفی یا نامعتبر است');
      if (r.dr > 0 && r.cr > 0) add('err','both','بدهکار و بستانکار هم‌زمان مثبت‌اند');
      if (!r.dr && !r.cr) add('warn','zero','مبلغ بدهکار و بستانکار هر دو صفر است');
    }
    if (ck.qty && r.q > 0 && r.p > 0){
      const amt = r.dr || r.cr, want = r.q*r.p;
      if (amt > 0 && Math.abs(want-amt) > Math.max(1, want*0.001))
        add('warn','qty',`مقدار × قیمت = ${nf.format(Math.round(want))} ولی مبلغ ثبت‌شده ${nf.format(amt)} است (اختلاف ${nf.format(Math.round(amt-want))})`);
    }
    if (ck.date && !jvalid(r.d)) add('err','date','تاریخ شمسی نامعتبر: ' + (r.d || '(خالی)'));
    const k = dkey(r.d);
    if (ck.ord && k != null && prev != null && k < prev) add('warn','ord','تاریخ از ردیف قبلی عقب‌تر است؛ مانده‌های میانی گمراه‌کننده می‌شوند');
    if (k != null) prev = k;
    if (ck.cur && r.c && !/^(ریال|تومان)/.test(fa(r.c))) add('warn','cur',`ردیف ارزی («${r.c}») بدون نرخ تبدیل با ریال جمع می‌شود`);
    if (ck.dup){
      const key = [r.d,nz(r.s),r.dr,r.cr].join('|');
      if (seen.has(key)) add('warn','dup','مشابه ردیف ' + seen.get(key) + ' (تاریخ، شرح و مبلغ یکسان)');
      else seen.set(key,n);
    }
    if (ck.imp && fb){
      const dRow = r.dr-r.cr;
      if (fb[i] != null){
        /* مانده‌های فایل دورهٔ خودش را دارد، نه مانده اول دورهٔ دفتر؛ اولین مانده مبنا می‌شود. */
        if (prevFb == null) prevFb = fb[i]-dRow;
        const dFile = fb[i]-prevFb;
        if (Math.abs(dFile-dRow) >= 1)
          add('err','bal',`تغییر مانده در فایل ${nf.format(dFile)} است ولی مبلغ این ردیف ${nf.format(dRow)}؛ مانده فایل: ${nf.format(Math.abs(fb[i]))} ${fb[i]<0?'بستانکار':'بدهکار'}`);
        prevFb = fb[i];
      } else if (prevFb != null) prevFb += dRow;   // سلول خالی مانده زنجیره را نمی‌شکند
    }
  });
  return out;
}

/* ------------------------------ search ------------------------------ */
function lev(a,b){
  if (a === b) return 0;
  const m=a.length, n=b.length; if (!m||!n) return Math.max(m,n);
  let p = Array.from({length:n+1},(_,j)=>j);
  for (let i=1;i<=m;i++){
    const c=[i];
    for (let j=1;j<=n;j++) c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));
    p=c;
  }
  return p[n];
}
function dice(a,b){
  if (a.length<2||b.length<2) return 0;
  const g = s => { const m=new Map(); for (let i=0;i<s.length-1;i++){ const k=s.slice(i,i+2); m.set(k,(m.get(k)||0)+1); } return m; };
  const A=g(a), B=g(b); let x=0;
  A.forEach((v,k)=>{ x += Math.min(v, B.get(k)||0); });
  return 2*x/(a.length+b.length-2);
}
const HC = new Map();
function hay(r){
  let h = HC.get(r.id);
  const src = r.s+r.d+r.u+(r.note||'');
  if (!h || h.src !== src){
    const text = nz(r.d+' '+r.s+' '+r.u+' '+(r.note||''));
    h = {src, text, flat:text.replace(/\s/g,''), w:[...new Set(words(text))],
      nums:(text.match(/\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite)};
    HC.set(r.id,h);
  }
  return h;
}
function tokScore(tok,h,vals,exact){
  if (/^\d+(\.\d+)?$/.test(tok)){
    const v = parseFloat(tok); let best = (!exact && h.text.includes(tok)) ? 1 : 0;
    for (const n of vals.concat(h.nums)){
      let s = n === v ? 1 : exact ? 0 : (tok.length>=3 && String(n).includes(tok)) ? .9 : 0;
      if (!s && !exact){ const c = 1-Math.abs(n-v)/Math.max(n,v); if (c >= .9) s = c*.8; }
      if (s > best) best = s;
    }
    return best;
  }
  if (h.text.includes(tok)) return 1;
  if (h.flat.includes(tok)) return .95;
  const thr = tok.length<=2 ? 0 : tok.length<=5 ? 1 : 2; let best = 0;
  for (const w of h.w){
    let s = dice(tok,w)*.6;
    if (Math.abs(w.length-tok.length) <= thr){
      const d = lev(tok,w);
      if (d <= thr) s = Math.max(s, .9-.15*d + (w.startsWith(tok)?.05:0));
    }
    if (s > best) best = s;
  }
  return best;
}
function score(r,bal,toks,exact){
  if (!toks.length) return 1;
  const h = hay(r), vals = [r.q,r.p,r.dr,r.cr,Math.abs(bal)].filter(x=>x>0).flatMap(x=>[x,x/10]);
  let sum = 0, ok = true;
  for (const tk of toks){ const s = tokScore(tk,h,vals,exact); if (s < .4) ok = false; sum += s; }
  const avg = sum/toks.length;
  return ok ? avg : -avg;
}

/* ------------------------------ filters ----------------------------- */
const OPS = {'فروش':/فروش|بارگیری/, 'خرید':/خرید/, 'دریافت':/دریافت|وصول|واریز/, 'پرداخت':/پرداخت|حواله/, 'چک':/چک/, 'اصلاحیه':/اصلاح|برگشت|عودت/};
const XI = ['xf-d1','xf-d2','xf-a1','xf-a2','xf-op'];
const xfActive = () => XI.some(id => $(id).value.trim()) || $('xf-ex').checked;
const filterActive = () => !!$('q').value.trim() || $('flt').value !== 'all' || xfActive();
function xf(r){
  const d1 = dkey($('xf-d1').value), d2 = dkey($('xf-d2').value), k = dkey(r.d);
  if ((d1 != null && (k == null || k < d1)) || (d2 != null && (k == null || k > d2))) return false;
  const m = UI.unit === 'تومان' ? 10 : 1, a = Math.max(r.dr,r.cr);
  const lo = $('xf-a1').value.trim(), hi = $('xf-a2').value.trim();
  if (lo && a < num(lo)*m) return false;
  if (hi && a > num(hi)*m) return false;
  const op = $('xf-op').value;
  if (op && !OPS[op].test(nz(r.s))) return false;
  return true;
}

/* ---------------------------- view builder -------------------------- */
function buildView(){
  const term = $('q').value.trim(), f = $('flt').value, ord = $('xf-ord').value, exact = $('xf-ex').checked;
  const n = rows.length;
  const chrono = ord === 'date';
  const seq = rows.map((_,i)=>i);
  if (chrono) seq.sort((a,b)=>(dkey(rows[a].d) ?? 1e9)-(dkey(rows[b].d) ?? 1e9) || a-b);

  // running balance follows the ledger sequence (chronological when asked)
  const bals = new Array(n); let b = opening();
  for (const i of seq){ b += rows[i].dr - rows[i].cr; bals[i] = b; }
  const t = calc(rows);

  let sc = null, near = false;
  if (term){
    const toks = words(term);
    if (cacheTerm !== term + '|' + exact + '|' + n){ scoreCache = new Map(); cacheTerm = term+'|'+exact+'|'+n; }
    sc = rows.map((r,i) => {
      const key = r.id + ':' + bals[i];
      let v = scoreCache.get(key);
      if (v === undefined){ v = score(r,bals[i],toks,exact); scoreCache.set(key,v); }
      return v;
    });
    if (!sc.some(x=>x>0) && !exact && sc.length){
      near = true;
      /* امتیاز بی‌نتیجه منفی است؛ قدرمطلقش همان میانگین شباهت است و بزرگ‌ترین‌ها نزدیک‌ترین‌اند.
         آستانه به‌تنهایی کافی نیست: با امتیازهای مساوی همهٔ ردیف‌ها برمی‌گشتند. فقط ده نزدیک‌ترین. */
      const rank = sc.map((x,i)=>[i,-x]).sort((a,b)=>b[1]-a[1] || a[0]-b[0]);
      sc = sc.map(()=>0);
      rank.slice(0,10).forEach(([i,v]) => { if (v >= .15) sc[i] = v; });
    }
  }

  let order = seq.slice();
  if (ord === 'sim' && sc) order.sort((a,b)=>sc[b]-sc[a] || a-b);
  else if (ord === 'amt') order.sort((a,b)=>Math.max(rows[b].dr,rows[b].cr)-Math.max(rows[a].dr,rows[a].cr) || a-b);
  else if (sc && ord === 'reg') order.sort((a,b)=>sc[b]-sc[a] || a-b);

  AUD = audit(rows);
  AUDMAP = {};
  AUD.forEach(x => { (AUDMAP[x.id] = AUDMAP[x.id] || []).push(x); });

  const vis = [];
  for (const i of order){
    const r = rows[i], bb = bals[i];
    if (sc && sc[i] <= 0) continue;
    if (f === 'dr' && !r.dr) continue;
    if (f === 'cr' && !r.cr) continue;
    if (f === 'deb' && bb < 0) continue;
    if (f === 'cre' && bb >= 0) continue;
    if (f === 'flag' && !AUDMAP[r.id]) continue;
    if (!xf(r)) continue;
    vis.push(i);
  }
  const d1 = dkey($('xf-d1').value);
  let open = opening();
  if (d1 != null){ open = opening(); rows.forEach(r => { const k = dkey(r.d); if (k != null && k < d1) open += r.dr-r.cr; }); }
  const vdr = vis.reduce((x,i)=>x+rows[i].dr,0), vcr = vis.reduce((x,i)=>x+rows[i].cr,0);
  return {term, f, ord, exact, sc, near, bals, t, vis, open, vdr, vcr, chrono, hasDateFrom:d1 != null};
}

/* --------------------------- highlight match ------------------------ */
function hl(text, term){
  const safe = esc(text);
  if (!term) return safe;
  const toks = words(term).filter(t => t.length >= 2 && !/^\d+$/.test(t));
  if (!toks.length) return safe;
  const nt = nz(text);
  const ranges = [];
  for (const tk of toks){
    let from = 0, at;
    while ((at = nt.indexOf(tk, from)) !== -1){ ranges.push([at, at+tk.length]); from = at+tk.length; if (ranges.length > 40) break; }
  }
  if (!ranges.length || nt.length !== text.length) return safe;
  ranges.sort((a,b)=>a[0]-b[0]);
  let out = '', cur = 0;
  for (const [s,e] of ranges){ if (s < cur) continue; out += esc(text.slice(cur,s)) + '<mark>' + esc(text.slice(s,e)) + '</mark>'; cur = e; }
  return out + esc(text.slice(cur));
}

/* ------------------------------ render ------------------------------ */
const GRIP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const SORTABLE = {1:'date', 3:'qty', 5:'price', 6:'dr', 7:'cr'};
const NUMCOL = new Set([3,5,6,7,9]);
const COLW = ['62px','92px','auto','78px','76px','104px','116px','116px','92px','116px'];
let VIS = PCOLS.map((_,i)=>i);

function renderHead(){
  VIS = PS.cols.map((v,i)=>v?i:-1).filter(i=>i>=0);
  $('cg').innerHTML = '<col style="width:38px"><col style="width:26px">'
    + VIS.map(i=>`<col${COLW[i]!=='auto'?` style="width:${COLW[i]}"`:''}>`).join('')
    + '<col style="width:132px">';
  $('thd').innerHTML = '<tr><th scope="col" class="c-sel"><input type="checkbox" id="selAll" aria-label="انتخاب همه ردیف‌های نمایش‌داده‌شده"></th>'
    + '<th scope="col" class="c-grip" aria-label="جابه‌جایی"></th>'
    + VIS.map(i=>{
        const sk = SORTABLE[i];
        return `<th scope="col" class="c-${CID[i]}${NUMCOL.has(i)?' n':''}${sk?' sortable':''}"${sk?` data-sort="${sk}" tabindex="0" role="button" aria-label="مرتب‌سازی بر اساس ${PCOLS[i]}"`:''}>${PCOLS[i]}${sk?'<span class="arw">↕</span>':''}</th>`;
      }).join('')
    + '<th scope="col" class="c-act">عملیات</th></tr>';
  $('selAll').addEventListener('change', e => { visRows.forEach(i => e.target.checked ? SEL.add(rows[i].id) : SEL.delete(rows[i].id)); render(); });
  $('thd').querySelectorAll('th.sortable').forEach(th => {
    const go = () => {
      const k = th.dataset.sort, s = $('xf-ord');
      s.value = (k === 'date') ? (s.value === 'date' ? 'reg' : 'date') : (s.value === 'amt' ? 'reg' : 'amt');
      UI.order = s.value; saveUI(); activeView = null; render();
    };
    th.addEventListener('click', go);
    th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
  });
}
let renderQ = false;
function render(){
  if (renderQ) return;
  renderQ = true;
  nextFrame(() => { renderQ = false; doRender(); });
}
function syncCols(){
  if (VIS.join() !== PS.cols.map((v,i)=>v?i:-1).filter(i=>i>=0).join()) renderHead();
}
function doRender(){
  syncCols();
  const V = buildView(); LASTV = V;
  const {vis, bals, t, term} = V;
  const canDrag = V.ord === 'reg' || V.ord === 'sim';
  const parts = [];
  for (const i of vis){
    const r = rows[i], b = bals[i], deb = b >= 0, iss = AUDMAP[r.id];
    const warn = iss && PS.ck.on && PS.ck.mark
      ? `<span class="mk" title="${esc(iss.map(x=>x.m).join(' | '))}" aria-label="هشدار: ${esc(iss.map(x=>x.m).join('، '))}">⚠</span>` : '';
    const cell = [
      `<td class="idx c-idx">${i+1}${warn}</td>`,
      `<td class="c-date">${esc(r.d)}</td>`,
      `<td class="desc c-desc" data-open="${i}" title="کلیک: جزئیات سند"><span class="dtext">${hl(r.s,term)}</span>${r.note?'<span class="dwtag" style="margin-top:4px">یادداشت</span>':''}</td>`,
      `<td class="n c-qty">${r.q?nf.format(r.q):''}</td>`,
      `<td class="c-unit">${esc(r.u)}</td>`,
      `<td class="n c-price">${r.p?money(r.p):''}</td>`,
      `<td class="n dr c-dr">${r.dr?money(r.dr):''}</td>`,
      `<td class="n cr c-cr">${r.cr?money(r.cr):''}</td>`,
      `<td class="c-side"><span class="side ${deb?'deb':'cre'}">${deb?'بدهکار':'بستانکار'}</span></td>`,
      `<td class="n bal c-bal">${money(Math.abs(b))}</td>`
    ];
    parts.push(`<tr data-i="${i}" data-id="${esc(r.id)}"${SEL.has(r.id)?' class="sel"':''}>
      <td class="c-sel"><input type="checkbox" data-sel="${i}" aria-label="انتخاب ردیف ${i+1}"${SEL.has(r.id)?' checked':''}></td>
      <td class="c-grip">${canDrag?`<span class="grip" data-grip="${i}" role="button" tabindex="-1" title="بکشید تا جابه‌جا شود" aria-label="جابه‌جایی ردیف ${i+1}">${GRIP}</span>`:''}</td>
      ${VIS.map(k=>cell[k]).join('')}
      <td class="acts c-act">
        <button type="button" class="tiny" data-a="e" data-i="${i}" aria-label="ویرایش ردیف ${i+1}">ویرایش</button>
        <button type="button" class="tiny" data-a="c" data-i="${i}" aria-label="کپی ردیف ${i+1}">کپی</button>
        <button type="button" class="tiny" data-a="d" data-i="${i}" aria-label="حذف ردیف ${i+1}">حذف</button>
      </td></tr>`);
  }
  $('tb').innerHTML = parts.join('') || `<tr><td colspan="${VIS.length+3}" class="empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M14 3v5h5M8 13h8M8 17h5"/></svg>
    <b>${rows.length ? 'ردیفی با این فیلتر پیدا نشد' : 'این دفتر هنوز خالی است'}</b>
    ${rows.length ? 'فیلترها را پاک کنید یا عبارت دیگری بجویید.' : 'با «ردیف جدید» شروع کنید یا از «فایل و داده ← ورود از فایل اکسل» استفاده کنید.'}</td></tr>`;

  visRows = vis;
  updSel(); xpUpdate(vis.length); renderSummary(V); renderFsum(V); applyAll(); renderViews();
  $('bUndo').disabled = !hist.length;
  $('bRedo').disabled = !redoStack.length;
  const nOpen = CHEQUES.filter(c=>c.status==='open').length;
  $('chqBadge').hidden = !nOpen; $('chqBadge').textContent = nOpen;

  if (term){ status(!vis.length ? 'ردیفی مطابق این جست‌وجو پیدا نشد.' : V.near ? 'نتیجه دقیقی نبود؛ نزدیک‌ترین ردیف‌ها نمایش داده شد.' : `${vis.length} ردیف مطابق یا مشابه جست‌وجو`); sMsg = true; }
  else if (sMsg){ status(''); sMsg = false; }
  if (activeId) markActive();
  if (UI.tab === 'analytics') renderAnalytics();
  if (UI.tab === 'cheques') renderCheques();
}

function renderSummary(V){
  const t = V.t;
  $('xDr').innerHTML  = amtLines(t.dr, PS.am.sum)  || `<div class="al">${money(t.dr)}</div>`;
  $('xCr').innerHTML  = amtLines(t.cr, PS.am.sum)  || `<div class="al">${money(t.cr)}</div>`;
  $('xBal').innerHTML = amtLines(Math.abs(t.bal), PS.am.sum) || `<div class="al">${money(Math.abs(t.bal))}</div>`;
  $('tSide').textContent = t.bal > 0 ? 'بدهکار' : t.bal < 0 ? 'بستانکار' : 'تسویه شده';
  $('tN').textContent = nf.format(rows.length);
  $('hDr').textContent = `${rows.filter(r=>r.dr>0).length} سند بدهکار` + (opening() ? ` · مانده اول دوره: ${fbal(opening())}` : '');
  $('hCr').textContent = `${rows.filter(r=>r.cr>0).length} سند بستانکار`;
  $('hN').textContent = V.vis.length !== rows.length ? `نمایش ${V.vis.length} ردیف با فیلتر فعال` : `${CHEQUES.length} چک شناسایی شد`;
  drawSpark(V);
}
function drawSpark(V){
  const svg = $('sparkBal');
  const vals = V.bals;
  if (!vals.length){ svg.innerHTML = ''; return; }
  const step = Math.max(1, Math.ceil(vals.length/160));
  const pts = []; for (let i=0;i<vals.length;i+=step) pts.push(vals[i]);
  if (pts[pts.length-1] !== vals[vals.length-1]) pts.push(vals[vals.length-1]);
  const mn = Math.min(0,...pts), mx = Math.max(0,...pts), span = (mx-mn)||1;
  const X = i => pts.length<2 ? 0 : (i/(pts.length-1))*200;
  const Y = v => 32 - ((v-mn)/span)*30;
  const d = pts.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const zero = Y(0).toFixed(1);
  svg.innerHTML = `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--info)" stop-opacity=".38"/><stop offset="100%" stop-color="var(--info)" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" y1="${zero}" x2="200" y2="${zero}" stroke="var(--border-strong)" stroke-width=".7" stroke-dasharray="2 2"/>
    <path d="${d} L200,${zero} L0,${zero} Z" fill="url(#sg)"/>
    <path d="${d}" fill="none" stroke="var(--info)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="200" cy="${Y(pts[pts.length-1]).toFixed(1)}" r="2.4" fill="var(--info)"/>`;
}
function renderFsum(V){
  const fb = v => money(Math.abs(v)) + (v<0?' بستانکار':v>0?' بدهکار':' (تسویه)');
  const act = filterActive();
  $('fsum').innerHTML =
    `<span>${V.hasDateFrom ? 'مانده اول دوره' : 'مانده اول دوره (تنظیمات)'}: <b>${fb(V.open)}</b></span>` +
    `<span>گردش بدهکار: <b>${money(V.vdr)}</b></span>` +
    `<span>گردش بستانکار: <b>${money(V.vcr)}</b></span>` +
    `<span>مانده پایان (${UI.unit}): <b>${fb(V.open+V.vdr-V.vcr)}</b></span>` +
    `<span>تعداد اسناد: <b>${V.vis.length}</b></span>` +
    (V.chrono ? '<span class="warnnote">↕ مانده‌ها بر پایه ترتیب تاریخ بازمحاسبه شده‌اند</span>' : '') +
    (act ? '<span class="warnnote">⚠ فیلتر فعال است؛ این جمع‌ها فقط مربوط به ردیف‌های نمایش‌داده‌شده است، نه کل حساب</span>' : '');
}

/* ---------------------------- commit / undo ------------------------- */
function snapshot(){ return JSON.stringify({rows, sel:[...SEL]}); }
/* شرح/واحد/یادداشت عوض می‌شود بی‌آنکه تعداد ردیف‌ها یا مانده تغییر کند؛ کلید کش جست‌وجو آن را نمی‌بیند. */
function dropSearchCache(){ scoreCache = new Map(); cacheTerm = null; HC.clear(); }
function commit(next, msg, opts){
  logChange(msg, rows, next);
  hist.push(snapshot());
  if (hist.length > 40) hist.shift();
  redoStack = [];
  rows = next;
  if (!opts || !opts.keepSel) SEL = new Set([...SEL].filter(id => rows.some(r=>r.id===id)));
  dropSearchCache();
  persistRows(); reindex(); render(); toast(msg);
}
function undo(){
  if (!hist.length) return;
  redoStack.push(snapshot());
  const s = JSON.parse(hist.pop());
  rows = s.rows.map(normRow).filter(Boolean);
  SEL = new Set(s.sel||[]);
  dropSearchCache();
  persistRows(); reindex(); render(); hideToast();
  status('عملیات قبلی بازگردانی شد.');
}
function redo(){
  if (!redoStack.length) return;
  hist.push(snapshot());
  const s = JSON.parse(redoStack.pop());
  rows = s.rows.map(normRow).filter(Boolean);
  SEL = new Set(s.sel||[]);
  dropSearchCache();
  persistRows(); reindex(); render(); hideToast();
  status('عملیات بازگردانی‌شده دوباره اعمال شد.');
}
function reindex(){ CHEQUES = buildCheques(); }

let cdT = null;
function toast(msg){
  $('tm').textContent = msg;
  $('toast').classList.add('show');
  let cd = 15; $('cd').textContent = cd;
  clearInterval(cdT);
  cdT = setInterval(() => { cd--; $('cd').textContent = cd; if (cd <= 0) hideToast(); }, 1000);
  status(msg);
}
function hideToast(){ clearInterval(cdT); cdT = null; $('toast').classList.remove('show'); }

/* ------------------------------ dialogs ----------------------------- */
const showD = id => { const d = $(id); if (!d.open) d.showModal(); return d; };
function settle(d, val){ const r = d._res; d._res = null; if (r) r(val); }
/* برخی موتورهای تعبیه‌شده رویداد close را ارسال نمی‌کنند؛ رصد صفت open ریزوظیفه است و همیشه اجرا می‌شود. */
function onClose(d, fn){
  let was = d.open;
  new MutationObserver(() => { const now = d.open; if (was && !now) fn(); was = now; })
    .observe(d, {attributes:true, attributeFilter:['open']});
}
onClose($('cfm'), () => settle($('cfm'), $('cfm').returnValue === 'ok'));
function ask(title, msg, okText, danger){
  return new Promise(res => {
    const d = $('cfm');
    settle(d, false);                        // درخواست قبلی هرگز معلق نمی‌ماند
    $('cfmT').textContent = title; $('cfmM').textContent = msg;
    $('cfmOk').textContent = okText || 'تأیید';
    $('cfmOk').className = danger === false ? 'primary' : 'danger';
    d.returnValue = 'cancel';                // ← Esc هرگز تأیید نیست
    d._res = res;
    if (!d.open) d.showModal();              // showModal روی مودال باز خطا می‌دهد
    (danger === false ? $('cfmOk') : $('cfmNo')).focus();
  });
}
onClose($('rep'), () => settle($('rep'), $('rep').returnValue || 'cancel'));
function report(title, msg, issues, btns){
  return new Promise(res => {
    const d = $('rep');
    settle(d, 'cancel');
    $('repT').textContent = title; $('repM').textContent = msg;
    $('repB').innerHTML = issues.slice(0,600).map(x =>
      `<tr><td>${esc(x.n)}</td><td><span class="sev ${x.sev==='err'?'err':x.sev==='warn'?'warn':'info'}">${x.sev==='err'?'خطا':x.sev==='warn'?'هشدار':'ثبت'}</span></td><td>${esc(x.m)}</td></tr>`).join('')
      + (issues.length > 600 ? `<tr><td colspan="3">و ${issues.length-600} مورد دیگر…</td></tr>` : '')
      || '<tr><td colspan="3" class="empty" style="padding:26px">موردی یافت نشد.</td></tr>';
    $('repF').innerHTML = btns.map(b => `<button value="${esc(b[0])}" class="${b[2]||''}">${esc(b[1])}</button>`).join('');
    d.returnValue = 'cancel';
    d._res = res;
    if (!d.open) d.showModal();
    const first = $('repF').querySelector('button'); if (first) first.focus();
  });
}
onClose($('prm'), () => settle($('prm'), $('prm').returnValue === 'ok' ? $('prmV').value.trim() : null));
function askText(title, msg, label, value, okText){
  return new Promise(res => {
    const d = $('prm');
    settle(d, null);
    $('prmT').textContent = title; $('prmM').textContent = msg;
    $('prmL').textContent = label || 'نام';
    $('prmOk').textContent = okText || 'ذخیره';
    $('prmE').hidden = true; $('prmV').value = value || '';
    d.returnValue = 'cancel';
    d._res = res;
    if (!d.open) d.showModal();
    $('prmV').focus(); $('prmV').select();
  });
}
$('prmF').addEventListener('submit', e => {
  if (!$('prmV').value.trim()){ e.preventDefault(); $('prmE').hidden = false; $('prmV').focus(); }
});
$('prmNo').onclick = () => $('prm').close('cancel');

/* ------------------------------- form ------------------------------- */
const FIELDS = {d:'f-d', s:'f-s', q:'f-q', p:'f-p', amt:'f-amt'};
function clearErrors(){
  Object.values(FIELDS).forEach(id => $(id).removeAttribute('aria-invalid'));
  document.querySelectorAll('#frm .err').forEach(e => { e.hidden = true; e.textContent = ''; });
  $('errsum').hidden = true; $('errList').innerHTML = '';
}
function openForm(i, preset){
  const r = i >= 0 ? rows[i] : (preset || {d:todayStr(), s:'', q:0, u:'', p:0, dr:0, cr:0, c:DEFAULT_CUR, note:''});
  const f = $('frm');
  f.d.value = r.d; f.s.value = r.s; f.q.value = gf(r.q); f.u.value = r.u;
  f.p.value = gf(r.p); f.side.value = (r.cr > 0 && !r.dr) ? 'cr' : 'dr';
  f.amt.value = gf(r.dr || r.cr); f.c.value = r.c || DEFAULT_CUR; f.note.value = r.note || '';
  f.dataset.i = i;
  $('f-auto').checked = !(r.q > 0 && r.p > 0 && Math.abs(r.q*r.p - (r.dr||r.cr)) > 1);
  clearErrors();
  $('dlgT').textContent = i >= 0 ? `ویرایش ردیف ${i+1}` : 'ردیف جدید';
  showD('dlg'); fAmx(); $('f-d')._sync(); f.s.focus();
}
function validate(){
  const f = $('frm'), errs = [];
  const set = (key,msg) => errs.push({key,msg});
  const dn = normDate(f.d.value);
  if (!dn) set('d','تاریخ عملیات الزامی است.');
  else if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dn)) set('d','تاریخ را به شکل 1405-01-16 وارد کنید.');
  else if (!jvalid(dn)) set('d','این تاریخ در تقویم شمسی وجود ندارد (روزِ ماه با طول واقعی ماه نمی‌خواند).');
  if (!f.s.value.trim()) set('s','شرح عملیات الزامی است.');
  if (f.q.value.trim() && !Number.isFinite(parseFloat(toEn(f.q.value)))) set('q','مقدار باید عدد باشد.');
  if (f.p.value.trim() && !Number.isFinite(parseFloat(toEn(f.p.value)))) set('p','قیمت باید عدد باشد.');
  const amt = f.amt.value.trim() ? parseFloat(toEn(f.amt.value)) : NaN;
  if (!Number.isFinite(amt)) set('amt','مبلغ الزامی است و باید عدد باشد.');
  else if (amt < 0) set('amt','مبلغ نمی‌تواند منفی باشد؛ به‌جای آن نوع مبلغ را عوض کنید.');
  return errs;
}
function showErrors(errs){
  clearErrors();
  const list = $('errList');
  errs.forEach(({key,msg}) => {
    const input = $(FIELDS[key]);
    input.setAttribute('aria-invalid','true');
    if (key === 'd' && input.style.display === 'none' && !dManual){
      dManual = true; store.set('kal_dmode','m'); DSL.forEach(i => { i._sync(); i._apply(); });
    }
    const e = $('e-'+key);
    if (e){ e.textContent = msg; e.hidden = false; }
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = '#'+FIELDS[key]; a.textContent = msg;
    a.addEventListener('click', ev => { ev.preventDefault(); input.focus(); });
    li.appendChild(a); list.appendChild(li);
  });
  $('errsum').hidden = false; $('errsum').focus();
}
function fAmx(){
  const o = PS.am.form;
  $('f-amx').innerHTML = amtLines(num($('f-amt').value), o);
  $('f-pmx').innerHTML = amtLines(num($('f-p').value), o);
}
function autoCalc(srcId){
  if (!$('f-auto').checked) return;
  const q = num($('f-q').value), p = num($('f-p').value), a = num($('f-amt').value);
  if (srcId !== 'f-amt' && q > 0 && p > 0) $('f-amt').value = gf(Math.round(q*p));
  else if (srcId === 'f-amt' && q > 0 && a > 0) $('f-p').value = gf(Math.round(a/q*100)/100);
}
async function submitForm(keepOpen){
  const errs = validate();
  if (errs.length){ showErrors(errs); return false; }
  const f = $('frm'), i = +f.dataset.i, amt = num(f.amt.value);
  const rec = normRow({
    id: i >= 0 ? rows[i].id : uid(),
    d: normDate(f.d.value), s: f.s.value.trim(), q: num(f.q.value), u: f.u.value.trim(), p: num(f.p.value),
    dr: f.side.value === 'dr' ? amt : 0, cr: f.side.value === 'cr' ? amt : 0,
    c: f.c.value.trim() || DEFAULT_CUR, note: f.note.value.trim()
  });
  const next = rows.slice();
  if (i >= 0) next[i] = rec; else next.push(rec);
  const at = i >= 0 ? i+1 : next.length;
  const w = audit(next).filter(x => x.sev === 'err' || ['dup','qty','ord','zero'].includes(x.k))
    .filter(x => x.n === at || (x.k === 'ord' && x.n === at+1));
  if (w.length){
    const a = await report('هشدار پیش از ثبت', 'موارد زیر یافت شد. سند با وجود این هشدارها ثبت شود؟', w,
      [['ok','ثبت با وجود هشدار','primary'],['cancel','بازگشت به فرم']]);
    if (a !== 'ok') return false;
  }
  commit(next, i >= 0 ? `ردیف ${at} ویرایش شد` : 'سند جدید افزوده شد');
  if (keepOpen){
    const side = f.side.value, u = f.u.value, d = f.d.value, c = f.c.value;
    openForm(-1, {d, s:'', q:0, u, p:0, dr:0, cr:0, c, note:''});
    $('f-side').value = side;
  } else $('dlg').close();
  return true;
}

/* ---------------------------- row actions --------------------------- */
async function delRow(i){
  const r = rows[i];
  const ok = await ask('حذف سند', `ردیف ${i+1} (${r.d} — ${r.s.slice(0,70)}) حذف شود؟ تا ۱۵ ثانیه با «بازگردانی» برمی‌گردد.`, 'حذف سند');
  if (!ok) return;
  if (activeId === r.id) closeDrawer();
  commit(rows.filter((_,k)=>k!==i), `ردیف ${i+1} حذف شد`);
}
function copyRow(i){
  const next = rows.slice();
  next.splice(i+1, 0, Object.assign({}, rows[i], {id:uid()}));
  commit(next, `ردیف ${i+1} کپی شد؛ نسخه تازه را ویرایش کنید`);
}
function moveRow(from, to){
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
  const next = rows.slice();
  const [r] = next.splice(from,1);
  next.splice(to,0,r);
  commit(next, `ردیف ${from+1} به جایگاه ${to+1} منتقل شد`);
}

/* ---------------------------- selection ----------------------------- */
function updSel(){
  const ids = new Set(rows.map(r=>r.id));
  SEL.forEach(id => { if (!ids.has(id)) SEL.delete(id); });
  const list = rows.filter(r=>SEL.has(r.id));
  const all = $('selAll');
  all.checked = !!visRows.length && visRows.every(i=>SEL.has(rows[i].id));
  all.indeterminate = !all.checked && visRows.some(i=>SEL.has(rows[i].id));
  const b = $('selbar');
  if (!list.length){ b.hidden = true; b.innerHTML = ''; return; }
  const dr = list.reduce((x,r)=>x+r.dr,0), cr = list.reduce((x,r)=>x+r.cr,0), net = dr-cr;
  const k = UI.unit === 'تومان' ? 10 : 1;
  b.hidden = false;
  b.innerHTML = `<b>${list.length} ردیف انتخاب‌شده</b>
    <span>جمع بدهکار: <b>${money(dr)}</b></span>
    <span>جمع بستانکار: <b>${money(cr)}</b></span>
    <span>جمع همه مبالغ: <b>${money(dr+cr)}</b></span>
    <span>تفاضل: <b>${money(Math.abs(net))} ${net>0?'بدهکار':net<0?'بستانکار':'(صفر)'}</b></span>
    <button type="button" data-s="xls">اکسل</button>
    <button type="button" data-s="prn" class="primary">چاپ انتخاب‌شده‌ها</button>
    <button type="button" data-s="bulk">ویرایش گروهی</button>
    <button type="button" data-s="dup">کپی گروهی</button>
    <button type="button" data-s="del" class="danger">حذف گروهی</button>
    <button type="button" data-s="clr">لغو انتخاب</button>
    <div class="sw">تفاضل به حروف: ${nw(Math.abs(net)/k)} ${UI.unit}</div>`;
}
function selectedIdx(){ return rows.map((r,i)=>i).filter(i=>SEL.has(rows[i].id)); }
async function bulkDelete(){
  const idx = selectedIdx(); if (!idx.length) return;
  const dr = idx.reduce((x,i)=>x+rows[i].dr,0), cr = idx.reduce((x,i)=>x+rows[i].cr,0);
  const ok = await ask('حذف گروهی', `${idx.length} ردیف حذف شود؟ جمع بدهکار ${nf.format(dr)} و جمع بستانکار ${nf.format(cr)} ریال از دفتر کم می‌شود. قابل بازگردانی است.`, `حذف ${idx.length} ردیف`);
  if (!ok) return;
  const drop = new Set(idx);
  SEL.clear(); closeDrawer();
  commit(rows.filter((_,i)=>!drop.has(i)), `${idx.length} ردیف حذف شد`);
}
function bulkDup(){
  const idx = selectedIdx(); if (!idx.length) return;
  const next = rows.slice();
  const copies = idx.map(i=>Object.assign({}, rows[i], {id:uid()}));
  next.splice(idx[idx.length-1]+1, 0, ...copies);
  commit(next, `${copies.length} ردیف کپی شد`);
}

/* ---------------------------- bulk edit ----------------------------- */
const BK_HINT = {
  date:'تاریخ همه ردیف‌های انتخاب‌شده با این مقدار جایگزین می‌شود (قالب 1405-01-16).',
  side:'همه ردیف‌ها بدهکار یا بستانکار می‌شوند؛ مبلغ هر ردیف تغییر نمی‌کند.',
  unit:'واحد اندازه‌گیری همه ردیف‌ها یکسان می‌شود.',
  prefix:'این متن به ابتدای شرح همه ردیف‌ها اضافه می‌شود.',
  suffix:'این متن به انتهای شرح همه ردیف‌ها اضافه می‌شود.',
  replace:'همه رخدادهای «متن جست‌وجو» در شرح، با «جایگزین» عوض می‌شوند.',
  scale:'مبلغ بدهکار/بستانکار و قیمت هر ردیف در این ضریب ضرب می‌شود (مثلاً 1.1 یعنی ۱۰٪ افزایش).',
  cur:'عنوان ارز و کشور همه ردیف‌ها یکسان می‌شود.'
};
function bulkSync(){
  const op = $('bk-op').value;
  $('bk-hint').textContent = BK_HINT[op] || '';
  $('bk-v2w').hidden = op !== 'replace';
  const l = $('bk-v1l'), v = $('bk-v1');
  v.type = 'text'; v.removeAttribute('list');
  const map = {date:'تاریخ جدید', side:'نوع مبلغ', unit:'واحد جدید', prefix:'متن افزودنی', suffix:'متن افزودنی',
    replace:'متن جست‌وجو', scale:'ضریب', cur:'عنوان ارز و کشور'};
  l.textContent = map[op] || 'مقدار';
  if (op === 'side'){
    const sel = document.createElement('select');
    sel.id = 'bk-v1'; sel.innerHTML = '<option value="dr">بدهکار</option><option value="cr">بستانکار</option>';
    v.replaceWith(sel);
  } else if (v.tagName === 'SELECT'){
    const inp = document.createElement('input');
    inp.id = 'bk-v1'; inp.autocomplete = 'off';
    v.replaceWith(inp);
  }
  const cur = $('bk-v1');
  if (op === 'date'){ cur.placeholder = todayStr(); if (cur._sync) cur._sync(); }
  else if (op === 'scale') cur.placeholder = '1.00';
  else cur.placeholder = '';
}
function openBulk(){
  const idx = selectedIdx();
  if (!idx.length){ status('ابتدا ردیف‌ها را با تیک ستون اول انتخاب کنید.', true); return; }
  $('bulkSub').textContent = `${idx.length} ردیف انتخاب شده است. این عملیات روی همه آن‌ها اعمال می‌شود و قابل بازگردانی است.`;
  $('bk-op').value = 'date'; bulkSync();
  showD('bulk');
}
function applyBulk(){
  const idx = selectedIdx(); if (!idx.length) return;
  const op = $('bk-op').value, v1 = $('bk-v1').value.trim(), v2 = $('bk-v2').value;
  const next = rows.slice();
  if (op === 'date' && !jvalid(v1)){ status('تاریخ جدید معتبر نیست.', true); return; }
  if (op === 'scale' && !(num(v1) > 0)){ status('ضریب باید عددی بزرگ‌تر از صفر باشد.', true); return; }
  if (op === 'replace' && !v1){ status('متن جست‌وجو خالی است.', true); return; }
  idx.forEach(i => {
    const r = Object.assign({}, next[i]);
    if (op === 'date') r.d = normDate(v1);
    else if (op === 'side'){ const a = r.dr||r.cr; r.dr = v1==='dr'?a:0; r.cr = v1==='cr'?a:0; }
    else if (op === 'unit') r.u = v1;
    else if (op === 'prefix') r.s = (v1+' '+r.s).trim();
    else if (op === 'suffix') r.s = (r.s+' '+v1).trim();
    else if (op === 'replace') r.s = r.s.split(v1).join(v2);
    else if (op === 'scale'){ const k = num(v1); r.dr = Math.round(r.dr*k); r.cr = Math.round(r.cr*k); r.p = Math.round(r.p*k*100)/100; }
    else if (op === 'cur') r.c = v1 || DEFAULT_CUR;
    next[i] = r;
  });
  $('bulk').close();
  commit(next, `${idx.length} ردیف به‌صورت گروهی ویرایش شد`);
}

/* ------------------------------- drawer ----------------------------- */
let drawerLast = null;
function openDrawer(i){
  const r = rows[i]; if (!r) return;
  activeId = r.id; drawerLast = document.activeElement;
  const V = LASTV || buildView();
  const before = V.bals[i] - (r.dr - r.cr), after = V.bals[i];
  const iss = AUDMAP[r.id] || [];
  const chq = CHEQUES.filter(c => c.ids.includes(r.id));
  const g = (r.q > 0 && r.p > 0) ? goodName(r.s) : '';
  const cell = (t,v,cls,wordsToo) => `<div class="dwcell ${cls||''}"><div class="t">${t}</div><div class="v">${v}</div>${wordsToo?`<div class="w">${nw(num(String(v).replace(/,/g,''))/(UI.unit==='تومان'?10:1))} ${UI.unit}</div>`:''}</div>`;
  $('dwT').textContent = `سند شماره ${i+1}`;
  $('dwBody').innerHTML = `
    <div class="dwsec"><h4>شرح سند</h4><p>${esc(r.s)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:9px">
        <span class="dwtag">📅 ${esc(r.d || 'بدون تاریخ')}</span>
        ${g?`<span class="dwtag">📦 ${esc(g)}</span>`:''}
        ${r.u?`<span class="dwtag">واحد: ${esc(r.u)}</span>`:''}
        <span class="dwtag">${esc(r.c||DEFAULT_CUR)}</span>
      </div></div>
    <div class="dwgrid">
      ${cell('بدهکار', r.dr?money(r.dr):'—', r.dr?'dr':'', !!r.dr)}
      ${cell('بستانکار', r.cr?money(r.cr):'—', r.cr?'cr':'', !!r.cr)}
      ${r.q?cell('مقدار', nf.format(r.q)):''}
      ${r.p?cell('قیمت واحد', money(r.p)):''}
      ${cell('مانده پیش از این سند', money(Math.abs(before))+' '+(before<0?'بستانکار':before>0?'بدهکار':'تسویه'),'wide')}
      ${cell('مانده پس از این سند', money(Math.abs(after))+' '+(after<0?'بستانکار':after>0?'بدهکار':'تسویه'),'wide',true)}
    </div>
    ${r.note?`<div class="dwsec"><h4>یادداشت داخلی</h4><p>${esc(r.note)}</p></div>`:''}
    ${chq.length?`<div class="dwsec"><h4>چک‌های مرتبط</h4>${chq.map(c=>`<p>شماره <bdi>${esc(c.no)}</bdi> — ${esc(c.bank||'بانک نامشخص')} — سررسید ${esc(c.due||'—')} — ${chqStatusLabel(c.status)}</p>`).join('')}</div>`:''}
    ${iss.length?`<div class="dwsec"><h4>کنترل صحت (${iss.length} مورد)</h4><div class="dwfindings">${iss.map(x=>`<div class="dwfind ${x.sev==='err'?'err':''}"><span>${x.sev==='err'?'⛔':'⚠'}</span><span>${esc(x.m)}</span></div>`).join('')}</div></div>`
      :'<div class="dwsec"><h4>کنترل صحت</h4><p style="color:var(--cr)">✓ موردی یافت نشد.</p></div>'}`;
  const pos = visRows.indexOf(i);
  $('dwPrev').disabled = pos <= 0;
  $('dwNext').disabled = pos < 0 || pos >= visRows.length-1;
  $('dwUp').disabled = i === 0;
  $('dwDown').disabled = i === rows.length-1;
  $('drawer').hidden = false;
  nextFrame(() => { $('drawer').classList.add('open'); $('dwScrim').classList.add('on'); });
  markActive();
}
function closeDrawer(){
  const d = $('drawer');
  if (d.hidden) return;
  d.classList.remove('open'); $('dwScrim').classList.remove('on');
  activeId = null;
  setTimeout(() => { d.hidden = true; }, 300);
  document.querySelectorAll('#tb tr.active').forEach(t=>t.classList.remove('active'));
  if (drawerLast && document.contains(drawerLast)) { try { drawerLast.focus(); } catch(e){} }
  drawerLast = null;
}
function markActive(){
  document.querySelectorAll('#tb tr.active').forEach(t=>t.classList.remove('active'));
  const tr = document.querySelector(`#tb tr[data-id="${activeId}"]`);
  if (tr) tr.classList.add('active');
}
function drawerStep(dir){
  const i = rows.findIndex(r=>r.id===activeId);
  const pos = visRows.indexOf(i);
  const np = pos + dir;
  if (np >= 0 && np < visRows.length) openDrawer(visRows[np]);
}

/* --------------------------- drag to reorder ------------------------ */
(function initDrag(){
  let dragI = -1, targetI = -1, after = false, ghost = null;
  const clearMarks = () => document.querySelectorAll('#tb tr.dropbefore,#tb tr.dropafter').forEach(t=>t.classList.remove('dropbefore','dropafter'));
  $('tb').addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-grip]'); if (!g || dragI >= 0) return;
    e.preventDefault();
    dragI = +g.dataset.grip;
    const tr = g.closest('tr'); tr.classList.add('dragging');
    ghost = tr;
    const move = ev => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el && el.closest && el.closest('#tb tr[data-i]');
      clearMarks();
      if (!row){ targetI = -1; return; }
      targetI = +row.dataset.i;
      const b = row.getBoundingClientRect();
      after = ev.clientY > b.top + b.height/2;
      row.classList.add(after ? 'dropafter' : 'dropbefore');
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (ghost) ghost.classList.remove('dragging');
      clearMarks();
      if (dragI >= 0 && targetI >= 0 && targetI !== dragI){
        let to = targetI + (after ? 1 : 0);
        if (to > dragI) to--;
        moveRow(dragI, clamp(to, 0, rows.length-1));
      }
      dragI = targetI = -1; ghost = null;
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    /* اگر اشاره‌گر فعال نباشد setPointerCapture خطا می‌دهد؛ کشیدن باید بی‌آن هم کار کند. */
    try { g.setPointerCapture(e.pointerId); } catch(_){}
  });
})();

/* ------------------------------ date selects ------------------------ */
let dManual = store.get('kal_dmode','s') === 'm';
const DSL = [];
function dateSel(inp){
  const w = document.createElement('span'); w.className = 'dsel';
  w.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:5px';
  w.innerHTML = '<select class="dd" aria-label="روز" style="flex:1;min-width:66px"></select>'
    + '<select class="dm" aria-label="ماه" style="flex:1.6;min-width:92px"></select>'
    + '<select class="dy" aria-label="سال" style="flex:1;min-width:78px"></select>'
    + '<button type="button" class="tiny dt">امروز</button><button type="button" class="tiny dx"></button>';
  inp.after(w);
  const d = w.querySelector('.dd'), m = w.querySelector('.dm'), y = w.querySelector('.dy'), bx = w.querySelector('.dx');
  m.add(new Option('ماه','')); MN.forEach((n,i)=>m.add(new Option(n,i+1)));
  y.add(new Option('سال','')); for (let i=1390;i<=1425;i++) y.add(new Option(i,i));
  const fillD = () => {
    const mm = +m.value, yy = +y.value, max = !mm ? 31 : jMonthLen(yy||1403,mm), cur = d.value;
    d.innerHTML = ''; d.add(new Option('روز',''));
    for (let i=1;i<=max;i++) d.add(new Option(i,i));
    if (cur && +cur <= max) d.value = cur;
  };
  const push = () => {
    inp.value = (d.value && m.value && y.value) ? `${y.value}/${pad2(m.value)}/${pad2(d.value)}` : '';
    inp.dispatchEvent(new Event('input',{bubbles:true}));
  };
  m.onchange = y.onchange = () => { fillD(); push(); };
  d.onchange = push;
  w.querySelector('.dt').onclick = () => {
    const t = todayJ();
    if (![...y.options].some(o=>+o.value===t.y)) y.add(new Option(t.y,t.y));
    y.value = t.y; m.value = t.m; fillD(); d.value = t.d; push();
  };
  const apply = () => {
    [d,m,y,w.querySelector('.dt')].forEach(el => { el.style.display = dManual ? 'none' : ''; });
    inp.style.display = dManual ? '' : 'none';
    bx.textContent = dManual ? '▾ انتخابی' : '✎ دستی';
    bx.title = dManual ? 'برگشت به انتخاب روز/ماه/سال' : 'نوشتن دستی تاریخ';
  };
  inp._sync = () => {
    const k = normDate(inp.value), mt = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(k);
    if (mt && jvalid(k)){
      if (![...y.options].some(o=>+o.value===+mt[1])) y.add(new Option(+mt[1],+mt[1]));
      y.value = +mt[1]; m.value = +mt[2]; fillD(); d.value = +mt[3];
    } else { y.value=''; m.value=''; fillD(); d.value=''; }
  };
  inp._apply = apply;
  bx.onclick = () => {
    dManual = !dManual; store.set('kal_dmode', dManual?'m':'s');
    DSL.forEach(i => { i._sync(); i._apply(); });
  };
  fillD(); DSL.push(inp); apply(); inp._sync();
}

/* ------------------------- appearance / footer ---------------------- */
const fsVal = () => { const r = String(PS.fs).trim(); if (!r) return null; const v = parseFloat(toEn(r)); return (v>=5&&v<=16)?v:null; };
const visItems = () => PS.showItems ? PS.items.filter(x=>x.on && (x.t.trim()||x.v.trim())) : [];
const lnk = v => {
  const t = String(v).trim();
  if (/^(https?:\/\/|www\.)[\w.-]+/i.test(t)){
    const h = /^https?:\/\//i.test(t) ? t : 'https://'+t;
    return `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(t)}</a>`;
  }
  return `<bdi>${esc(t)}</bdi>`;
};
function applyBrand(){
  const nm = PS.name.trim(), sb = PS.sub.trim();
  $('brandName').textContent = nm || 'صورت‌حساب';
  $('brandName').hidden = !(PS.showName && nm);
  $('brandSub').textContent = sb; $('brandSub').hidden = !(PS.showSub && sb);
  $('brandLogo').textContent = (nm || 'ص').trim().charAt(0) || 'ص';
  const m = [];
  if (PS.showUnit) m.push('واحد: ' + UI.unit);
  if (PS.showDate) m.push('تاریخ: ' + (PS.date.trim() || new Date().toLocaleDateString('fa-IR')));
  $('brandMeta').textContent = m.join(' · '); $('brandMeta').hidden = !m.length;
  document.title = (nm ? nm + ' — ' : '') + (sb || 'صورت‌حساب');
}
function applyLook(){
  const st = document.documentElement.style;
  st.setProperty('--tc', PS.color);
  st.setProperty('--row-pad', UI.density === 'compact' ? '4px' : '9px');
  st.setProperty('--tfs', UI.density === 'compact' ? '12.5px' : '13.5px');
  st.setProperty('--dur', UI.anim ? '.22s' : '0s');
  document.documentElement.dataset.theme = UI.theme;
  document.documentElement.dataset.anim = UI.anim ? 'on' : 'off';
  $('tbl').classList.toggle('zb', PS.zebra);
  syncCols();
  $('icTheme').innerHTML = UI.theme === 'dark'
    ? '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>'
    : '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>';
  document.querySelectorAll('#p-theme button').forEach(b=>b.classList.toggle('on', b.dataset.v===UI.theme));
  document.querySelectorAll('#p-density button').forEach(b=>b.classList.toggle('on', b.dataset.v===UI.density));
  const dark = UI.theme === 'dark';
  const tl = dark ? 'حالت تاریک روشن است؛ به روشن تغییر بده' : 'حالت روشن فعال است؛ به تاریک تغییر بده';
  $('bTheme').setAttribute('aria-pressed', String(dark));
  $('bTheme').setAttribute('aria-label', tl); $('bTheme').title = tl;
}
function applyTf(){
  const tf = $('tf');
  if (!PS.showTotals || !rows.length || !LASTV){ tf.innerHTML = ''; return; }
  const V = LASTV, t = V.t, act = filterActive();
  const vis = VIS;
  const nA = vis.filter(i=>i<6).length;
  const sd = t.bal === 0 ? 'تسویه' : (t.bal < 0 ? 'بستانکار' : 'بدهکار');
  const lead = '<td class="c-sel"></td><td class="c-grip"></td>';
  const c = {6:`<td class="n dr">${money(act?V.vdr:t.dr)}</td>`, 7:`<td class="n cr">${money(act?V.vcr:t.cr)}</td>`,
    8:`<td>${act?'—':sd}</td>`, 9:`<td class="n">${money(Math.abs(act?V.open+V.vdr-V.vcr:t.bal))}</td>`};
  let html = `<tr>${lead}${nA?`<td class="ft" colspan="${nA}">${act?'جمع ردیف‌های نمایش‌داده‌شده':'جمع کل گردش و مانده نهایی'}</td>`:''}${vis.filter(i=>i>=6).map(i=>c[i]).join('')}<td class="c-act"></td></tr>`;
  if (act){
    const nB = vis.filter(i=>i<8).length;
    const c2 = {8:`<td>${sd}</td>`, 9:`<td class="n">${money(Math.abs(t.bal))}</td>`};
    html += `<tr class="sub">${lead}${nB?`<td class="ft" colspan="${nB}">مانده نهایی کل حساب (بدون فیلتر)</td>`:''}${vis.filter(i=>i>=8).map(i=>c2[i]).join('')}<td class="c-act"></td></tr>`;
  }
  tf.innerHTML = html;
}
function applyFoot(){
  const el = $('sfoot'), it = visItems(), main = PS.showMain ? PS.main.trim() : '';
  if (!it.length && !main){ el.hidden = true; el.innerHTML = ''; return; }
  const cs = it.filter(x=>x.k!=='s'), ss = it.filter(x=>x.k==='s');
  el.hidden = false;
  el.innerHTML = `<div class="sf-in">
    ${cs.length?`<div class="sf-grid">${cs.map(x=>`<div class="sf-card">${x.t.trim()?`<span class="sf-t">${esc(x.t.trim())}</span>`:''}<span class="sf-v">${lnk(x.v)}</span></div>`).join('')}</div>`:''}
    ${ss.length?`<div class="sf-soc"><span class="sf-st">شبکه‌های اجتماعی</span>${ss.map(x=>`<span class="sf-chip">${x.t.trim()?`<b>${esc(x.t.trim())}</b>`:''}${lnk(x.v)}</span>`).join('')}</div>`:''}
    ${main?`<p class="sf-main">${esc(main).replace(/\n/g,'<br>')}</p>`:''}</div>`;
}
function applyAll(){ applyBrand(); applyLook(); applyTf(); applyFoot(); }

/* ------------------------------- print ------------------------------ */
const OR = {
  landscape:{w:281, h:194, f:8, c:[8,20,108,15,13,21,27,27,15,27]},
  portrait: {w:194, h:281, f:7, c:[6,17,43,11,11,16,26,26,12,26]}
};
function buildPrint(){
  const ori = $('ori').value, o = OR[ori], V = LASTV || buildView(), t = V.t, pa = $('pa');
  const idx = printSel ? selectedIdx() : [...V.vis];
  const term = V.term, filtered = printSel || filterActive();
  const sdr = idx.reduce((x,i)=>x+rows[i].dr,0), scr = idx.reduce((x,i)=>x+rows[i].cr,0);
  const fl = [];
  if (term) fl.push('جست‌وجو: «'+term+'»');
  if (V.f !== 'all') fl.push($('flt').selectedOptions[0].text);
  if (printSel) fl.push('فقط ردیف‌های انتخاب‌شده');
  if (xfActive()) fl.push('فیلتر دقیق فعال');
  if (filtered) fl.push(`ردیف‌های چاپ‌شده: ${idx.length} از ${rows.length}`);
  $('pgStyle').textContent = `@page{size:A4 ${ori};margin:8mm 8mm 12mm}`;
  const vis = PS.cols.map((v,i)=>v?i:-1).filter(i=>i>=0);
  const tw = vis.reduce((x,i)=>x+o.c[i],0) || 1, f = fsVal();
  pa.style.width = o.w+'mm'; pa.style.fontSize = (f||o.f)+'pt';
  pa.style.setProperty('--pc', PS.color);
  const side = b => b<0?'بستانکار':'بدهکار';
  const cells = (r,b,n) => [`<td>${n}</td>`, `<td>${esc(r.d)}</td>`, `<td>${esc(r.s)}</td>`,
    `<td class="n">${r.q?nf.format(r.q):''}</td>`, `<td>${esc(r.u)}</td>`, `<td class="n">${r.p?money(r.p):''}</td>`,
    `<td class="n">${r.dr?money(r.dr):''}</td>`, `<td class="n">${r.cr?money(r.cr):''}</td>`,
    `<td>${b===0?'تسویه':side(b)}</td>`, `<td class="n">${money(Math.abs(b))}</td>`];
  const left = (PS.showName && PS.name.trim() ? `<h2>${esc(PS.name)}</h2>` : '')
    + (PS.showSub && PS.sub.trim() ? `<div>${esc(PS.sub)}</div>` : '');
  const meta = [];
  if (PS.showUnit) meta.push('واحد: '+UI.unit);
  if (fl.length) meta.push(esc(fl.join(' — ')));
  if (PS.showDate) meta.push(PS.date.trim() ? 'تاریخ: '+esc(PS.date.trim()) : 'تاریخ چاپ: '+new Date().toLocaleDateString('fa-IR'));
  const head = (left||meta.length) ? `<div class="ph"><div>${left}</div><div class="pm">${meta.join('<br>')}</div></div>` : '';
  const nA = vis.filter(i=>i<6).length, nB = vis.filter(i=>i<8).length;
  let tfoot = '';
  if (PS.showTotals){
    const tc = {6:`<td class="n">${money(filtered?sdr:t.dr)}</td>`, 7:`<td class="n">${money(filtered?scr:t.cr)}</td>`,
      8:`<td>${filtered?'':(t.bal===0?'تسویه':side(t.bal))}</td>`, 9:`<td class="n">${filtered?'':money(Math.abs(t.bal))}</td>`};
    tfoot = `<tfoot><tr class="tt">${nA?`<td colspan="${nA}">${filtered?'جمع ردیف‌های این صورت‌حساب':'جمع کل گردش و مانده نهایی'}</td>`:''}${vis.filter(i=>i>=6).map(i=>tc[i]).join('')}</tr>`;
    if (filtered){
      const fc = {8:`<td>${t.bal===0?'تسویه':side(t.bal)}</td>`, 9:`<td class="n">${money(Math.abs(t.bal))}</td>`};
      tfoot += `<tr class="tt">${nB?`<td colspan="${nB}">مانده نهایی کل حساب (بدون فیلتر)</td>`:''}${vis.filter(i=>i>=8).map(i=>fc[i]).join('')}</tr>`;
    }
    tfoot += '</tfoot>';
  }
  const it = visItems(), main = PS.showMain ? PS.main.trim() : '';
  const lab = x => `<div>${x.t.trim()?'<b>'+esc(x.t.trim())+(x.v.trim()?': ':'')+'</b>':''}<bdi>${esc(x.v.trim())}</bdi></div>`;
  const cs = it.filter(x=>x.k!=='s'), ss = it.filter(x=>x.k==='s');
  const foot = (it.length||main) ? `<div class="pf">${cs.length?`<div class="pfi">${cs.map(lab).join('')}</div>`:''}${ss.length?`<div class="pfs2"><b>شبکه‌های اجتماعی:</b>${ss.map(lab).join('')}</div>`:''}${main?`<p>${esc(main).replace(/\n/g,'<br>')}</p>`:''}</div>` : '';
  const psum = PS.am.prn.show ? `<div class="psm">${[['جمع بدهکار',t.dr],['جمع بستانکار',t.cr],['مانده نهایی کل حساب ('+(t.bal<0?'بستانکار':t.bal>0?'بدهکار':'تسویه')+')',Math.abs(t.bal)]].map(([l,v])=>`<div><b>${l}</b>${amtLines(v,PS.am.prn)}</div>`).join('')}</div>` : '';
  pa.innerHTML = `${head}${psum}
  <table><colgroup>${vis.map(i=>`<col style="width:${(o.c[i]*o.w/tw).toFixed(2)}mm">`).join('')}</colgroup>
  <thead><tr>${vis.map(i=>`<th>${PCOLS[i]}</th>`).join('')}</tr></thead>
  <tbody${PS.zebra?' class="z"':''}>${idx.map(i=>`<tr>${(c=>vis.map(k=>c[k]).join(''))(cells(rows[i],V.bals[i],i+1))}</tr>`).join('')}</tbody>
  ${tfoot}</table>${foot}`;
  return {idx, filtered};
}
async function doPrint(sel){
  printSel = !!sel;
  if (PS.ck.on && PS.ck.prnw && (filterActive() || printSel)){
    const ok = await ask('چاپ با فیلتر فعال',
      printSel ? 'فقط ردیف‌های انتخاب‌شده چاپ می‌شوند؛ جمع‌ها مربوط به همان ردیف‌هاست و مانده کل حساب جداگانه ذیل جدول می‌آید. ادامه می‌دهید؟'
               : 'جست‌وجو یا فیلتر فعال است؛ فقط ردیف‌های نمایش‌داده‌شده چاپ می‌شوند. مانده کل حساب جداگانه ذیل جدول می‌آید. ادامه می‌دهید؟',
      'چاپ کن', false);
    if (!ok){ printSel = false; return; }
  }
  buildPrint();
  window.print();
}
window.addEventListener('beforeprint', () => { buildPrint(); });
window.addEventListener('afterprint', () => { if (printSel){ printSel = false; } });

function openPreview(){
  printSel = false;
  const info = buildPrint();
  const pa = $('pa'), pv = $('pvpage');
  pv.innerHTML = pa.innerHTML;
  pv.style.width = (OR[$('ori').value].w + 16) + 'mm';   // کاغذ کامل با حاشیه، تا جدول دقیقاً داخل ناحیه چاپ بنشیند
  pv.style.fontSize = pa.style.fontSize;
  pv.style.setProperty('--pc', PS.color);
  pv.className = 'printpage';
  pv.style.zoom = '';
  const ori = $('ori').value;
  $('pvInfo').textContent = `${info.idx.length} ردیف · A4 ${ori==='landscape'?'افقی':'عمودی'} · ${VIS.length} ستون`;
  showD('pvw');
  nextFrame(() => {
    const avail = $('pvbody').clientWidth - 37, w = pv.offsetWidth;
    if (w > avail && w > 0) pv.style.zoom = String(avail/w);
  });
}

/* ------------------------------- export ----------------------------- */
const pickRows = scope => scope === 's' ? selectedIdx() : scope === 'f' ? [...visRows] : rows.map((_,i)=>i);
function download(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => { const t = todayJ(); return `${t.y}-${pad2(t.m)}-${pad2(t.d)}`; };
function fileBase(){ return (PS.name.trim()||'صورت-حساب').replace(/[\\/:*?"<>|]/g,'-') + '-' + stamp(); }

async function exportXlsx(scope){
  const V = LASTV || buildView(), t = V.t, sel = pickRows(scope);
  if (!sel.length){ status('ردیفی برای خروجی وجود ندارد.', true); return; }
  const isF = scope !== 'all';
  const open = opening();
  const sdr = sel.reduce((x,i)=>x+rows[i].dr,0), scr = sel.reduce((x,i)=>x+rows[i].cr,0);
  const head = COLS;
  const body = sel.map(i => { const r = rows[i], b = V.bals[i];
    return [r.d, r.s, r.q, r.u, r.p, r.dr, r.cr, b<0?'بستانکار':b>0?'بدهکار':'تسویه', Math.abs(b), r.c]; });
  const L = sel.length+1, T = L+1;
  const tot = ['', scope==='s'?'جمع ردیف‌های انتخاب‌شده':scope==='f'?'جمع ردیف‌های فیلترشده':'جمع کل',
    sel.reduce((x,i)=>x+rows[i].q,0), '', '', sdr, scr,
    isF ? '' : (t.bal<0?'بستانکار':t.bal>0?'بدهکار':'تسویه'), isF ? '' : Math.abs(t.bal), ''];

  if (typeof ExcelJS === 'undefined'){
    if (typeof XLSX === 'undefined'){ status('کتابخانه اکسل در دسترس نیست؛ از خروجی CSV استفاده کنید.', true); return; }
    const aoa = [head, ...body, tot];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:12},{wch:70},{wch:10},{wch:12},{wch:12},{wch:18},{wch:18},{wch:11},{wch:18},{wch:20}];
    ws['!views'] = [{RTL:true}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'صورت‌حساب');
    XLSX.writeFile(wb, fileBase()+'.xlsx');
    status('فایل اکسل ساخته شد.'); return;
  }
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = PS.name || 'صورت‌حساب'; wb.created = new Date();
    const tc = PS.color.replace('#','').toUpperCase();
    const ws = wb.addWorksheet('صورت‌حساب', {
      views:[{rightToLeft:true, state:'frozen', ySplit:1}],
      pageSetup:{paperSize:9, orientation:$('ori').value==='portrait'?'portrait':'landscape', fitToPage:true,
        fitToWidth:1, fitToHeight:0, margins:{left:.3,right:.3,top:.4,bottom:.5,header:.2,footer:.2}, printTitlesRow:'1:1'}
    });
    const W = [12,70,10,12,12,18,18,11,18,20];
    ws.columns = head.map((h,i)=>({header:h, width:W[i]}));
    body.forEach(r=>ws.addRow(r));
    const trow = ws.addRow(tot);
    trow.getCell(3).value = {formula:`SUM(C2:C${L})`, result:tot[2]};
    trow.getCell(6).value = {formula:`SUM(F2:F${L})`, result:sdr};
    trow.getCell(7).value = {formula:`SUM(G2:G${L})`, result:scr};
    /* مانده نهایی مانده اول دوره را هم دارد؛ فرمول بدون آن با عدد نمایش‌داده‌شده نمی‌خواند. */
    if (!isF) trow.getCell(9).value = {formula:`ABS(${open}+F${T}-G${T})`, result:Math.abs(t.bal)};
    ws.eachRow((row,rn) => row.eachCell(c => {
      c.font = {name:'Tahoma', size:10, bold:rn===1||rn===T, color:{argb: rn===1?'FFFFFFFF':'FF000000'}};
      c.alignment = {vertical:'top', wrapText:true, horizontal:'right'};
      c.border = {top:{style:'thin',color:{argb:'FFBBBBBB'}}, bottom:{style:'thin',color:{argb:'FFBBBBBB'}}};
      if (rn === 1) c.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+tc}};
      else if (rn === T) c.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFE6EDF6'}};
    }));
    ws.eachRow((row,rn) => { if (rn<2) return; row.eachCell((c,cn) => {
      if (![3,5,6,7,9].includes(cn)) return;
      const v = c.value && c.value.formula ? c.value.result : c.value;
      if (typeof v === 'number') c.numFmt = Number.isInteger(v) ? '#,##0' : '#,##0.00';
    }); });
    // summary sheet
    const s2 = wb.addWorksheet('خلاصه', {views:[{rightToLeft:true}]});
    s2.columns = [{header:'عنوان',width:34},{header:'مقدار',width:26}];
    [['کسب‌وکار',PS.name],['مشتری',PS.sub],['تاریخ تهیه',new Date().toLocaleDateString('fa-IR')],
      ['تعداد ردیف',sel.length],['مانده اول دوره (ریال)',open],['جمع بدهکار (ریال)',isF?sdr:t.dr],
      ['جمع بستانکار (ریال)',isF?scr:t.cr],['مانده نهایی (ریال)',Math.abs(isF?open+sdr-scr:t.bal)],
      ['وضعیت مانده',(isF?open+sdr-scr:t.bal)<0?'بستانکار':(isF?open+sdr-scr:t.bal)>0?'بدهکار':'تسویه'],
      ['مانده به حروف',nw(Math.abs(isF?open+sdr-scr:t.bal))+' ریال']
    ].forEach(r=>s2.addRow(r));
    s2.eachRow((row,rn)=>row.eachCell(c=>{
      c.font={name:'Tahoma',size:10,bold:rn===1}; c.alignment={horizontal:'right',vertical:'top',wrapText:true};
      if (rn===1) c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+tc}}, c.font={name:'Tahoma',size:10,bold:true,color:{argb:'FFFFFFFF'}};
      if (rn>1 && typeof c.value==='number') c.numFmt='#,##0';
    }));
    const buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), fileBase()+'.xlsx');
    status('فایل اکسل ساخته شد (شیت صورت‌حساب + شیت خلاصه، A4، یک صفحه عرض).');
  } catch(err){ status('ساخت فایل اکسل ناموفق بود: '+err.message, true); }
}
function csvCell(v){
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function exportCsv(){
  const V = LASTV || buildView();
  const idx = [...V.vis];
  if (!idx.length){ status('ردیفی برای خروجی وجود ندارد.', true); return; }
  const lines = [COLS.join(',')];
  idx.forEach(i => { const r = rows[i], b = V.bals[i];
    lines.push([r.d,r.s,r.q,r.u,r.p,r.dr,r.cr,b<0?'بستانکار':b>0?'بدهکار':'تسویه',Math.abs(b),r.c].map(csvCell).join(',')); });
  download(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}), fileBase()+'.csv');
  status(`فایل CSV با ${idx.length} ردیف ساخته شد.`);
}
function backup(){
  const data = {app:APPID, version:2, exportedAt:new Date().toISOString(),
    book:curBook, bookName:(BOOKS.find(b=>b.id===curBook)||{}).name||'', rows, print:PS, log:LOG, views:VIEWS, ui:UI};
  download(new Blob([JSON.stringify(data,null,1)],{type:'application/json'}), 'backup-'+fileBase()+'.json');
  status('فایل پشتیبان کامل دانلود شد (ردیف‌ها + تنظیمات + تاریخچه + نماها).');
}

/* ------------------------------- import ----------------------------- */
const HEAD_ALIASES = {
  d:['تاریخ عملیات','تاریخ','تاريخ','date'],
  s:['شرح','شرح عملیات','توضیحات','description'],
  q:['مقدار','تعداد','qty','quantity'],
  u:['واحد','unit'],
  p:['قیمت','قیمت واحد','price'],
  dr:['بدهکار','debit','dr'],
  cr:['بستانکار','credit','cr'],
  side:['تشخیص','وضعیت','side'],
  bal:['مانده','balance'],
  c:['عنوان ارز و کشور','ارز','کشور','currency']
};
function mapHeader(head){
  const norm = head.map(h => nz(String(h||'')).replace(/\s+/g,' ').trim());
  const map = {};
  for (const key in HEAD_ALIASES){
    const i = norm.findIndex(h => HEAD_ALIASES[key].some(a => h === nz(a)));
    if (i >= 0) map[key] = i;
  }
  return map;
}
const TOTAL_RE = /^(جمع|جمع کل|جمع ردیف|جمع ردیف‌های|total|grand total)/;
function parseAmount(v){
  if (typeof v === 'number') return v;
  const t = toEn(v).replace(/[()]/g,'');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
function parseCellDate(v){
  if (v instanceof Date) return gregToJ(v.getFullYear(), v.getMonth()+1, v.getDate());
  const s = String(v ?? '').trim();
  if (!s) return '';
  const g = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(toEn(s));
  if (g && +g[1] >= 1700) return gregToJ(+g[1],+g[2],+g[3]);   // سال ≥ ۱۷۰۰ میلادی است؛ کمتر از آن شمسی
  return normDate(s);
}
async function importFile(file){
  if (typeof XLSX === 'undefined'){ status('کتابخانه خواندن اکسل در دسترس نیست.', true); return; }
  let wb;
  try {
    if (/\.csv$/i.test(file.name)) wb = XLSX.read(await file.text(), {type:'string', raw:true, cellDates:true});
    else wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array', cellDates:true});
  } catch(err){ status('فایل خوانده نشد: '+err.message, true); return; }
  let sheetName = wb.SheetNames[0];
  if (wb.SheetNames.length > 1){
    const a = await report('انتخاب شیت', `این فایل ${wb.SheetNames.length} شیت دارد. کدام شیت وارد شود؟`,
      wb.SheetNames.map((n,i)=>({n:i+1, sev:'info', m:n})),
      wb.SheetNames.map((n,i)=>[String(i), n, i===0?'primary':'']).concat([['cancel','انصراف']]));
    if (a === 'cancel') return;
    sheetName = wb.SheetNames[+a] || sheetName;
  }
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1, defval:'', raw:true, blankrows:false});
  if (!aoa.length){ status('شیت انتخاب‌شده خالی است.', true); return; }
  let hRow = 0, map = mapHeader(aoa[0]||[]);
  if (map.d === undefined || map.s === undefined){
    for (let k=1;k<Math.min(aoa.length,8);k++){
      const m2 = mapHeader(aoa[k]||[]);
      if (m2.d !== undefined && m2.s !== undefined){ map = m2; hRow = k; break; }
    }
  }
  if (map.d === undefined || map.s === undefined){
    status('ستون‌های «تاریخ» و «شرح» در فایل پیدا نشد. سرستون‌ها باید شامل: '+COLS.join('، ')+' باشند.', true); return;
  }
  const data = [], fbArr = []; let skipped = 0, last = null;
  for (let k=hRow+1;k<aoa.length;k++){
    const x = aoa[k]; if (!x) continue;
    const dRaw = x[map.d], sRaw = String(x[map.s] ?? '').trim();
    if (!String(dRaw ?? '').trim() && !sRaw){ skipped++; continue; }
    if (TOTAL_RE.test(nz(sRaw))){ skipped++; continue; }
    const dr = map.dr !== undefined ? parseAmount(x[map.dr]) : 0;
    const cr = map.cr !== undefined ? parseAmount(x[map.cr]) : 0;
    const r = normRow({d:parseCellDate(dRaw), s:fa(sRaw), q:map.q!==undefined?parseAmount(x[map.q]):0,
      u:map.u!==undefined?fa(String(x[map.u]??'').trim()):'', p:map.p!==undefined?parseAmount(x[map.p]):0,
      dr:Math.max(0,dr), cr:Math.max(0,cr), c:map.c!==undefined?String(x[map.c]??'').trim():DEFAULT_CUR});
    if (!r){ skipped++; continue; }
    data.push(r); last = x;
    if (map.bal !== undefined){
      const bv = String(x[map.bal] ?? '').trim();
      const sd = map.side !== undefined ? String(x[map.side] ?? '').trim() : '';
      fbArr.push(bv === '' ? null : (sd === 'بستانکار' ? -1 : 1)*parseAmount(bv));
    } else fbArr.push(null);
  }
  if (!data.length){ status('هیچ ردیف قابل واردکردنی پیدا نشد.', true); return; }
  const fileBal = (last && map.bal !== undefined)
    ? parseAmount(last[map.bal]) * (map.side !== undefined && String(last[map.side]??'').trim()==='بستانکار' ? -1 : 1) : null;
  const computed = calc(data, 0).bal;
  /* مانده پایانی فایل با مانده اول دورهٔ خودِ فایل سنجیده می‌شود، نه با صفر؛
     وگرنه هر فایلی که مانده ابتدای دوره دارد، خطای بی‌جا می‌گیرد. */
  const firstFb = fbArr.findIndex(v => v != null);
  const fileOpen = firstFb < 0 ? 0 : fbArr[firstFb] - (data[firstFb].dr - data[firstFb].cr);
  const balOK = fileBal === null || Math.abs(fileBal - (fileOpen + computed)) < 1;
  let final = data;
  const issues = audit(data, fbArr.some(v=>v!=null) ? fbArr : null);
  if (!balOK) issues.unshift({n:data.length, sev:'err', k:'bal',
    m:`مانده پایانی فایل ${nf.format(Math.abs(fileBal))} ${fileBal<0?'بستانکار':'بدهکار'} است ولی مانده اول دورهٔ فایل به‌علاوهٔ جمع ردیف‌ها ${nf.format(Math.abs(fileOpen+computed))} ${fileOpen+computed<0?'بستانکار':'بدهکار'} می‌شود.`});
  if (issues.length){
    const bad = new Set(issues.filter(x=>x.sev==='err'&&x.k!=='bal').map(x=>x.n));
    const btns = [['all','لحاظ همه ردیف‌ها','primary']];
    if (bad.size) btns.push(['skip',`حذف ${bad.size} ردیف خطادار و ادامه`]);
    if (issues.some(x=>x.k==='ord')) btns.push(['sort','لحاظ همه + مرتب‌سازی تاریخ']);
    btns.push(['cancel','انصراف']);
    const a = await report('کنترل اطلاعات فایل', `${issues.length} مورد در ${data.length} ردیف یافت شد (${skipped} ردیف خالی/جمع نادیده گرفته شد). چه کنم؟`, issues, btns);
    if (a === 'cancel') return;
    if (a === 'skip') final = data.filter((_,k)=>!bad.has(k+1));
    if (a === 'sort') final = sortByDate(data);
  }
  const mode = rows.length
    ? await report('نحوه ورود', `${final.length} ردیف آماده ورود است. با ${rows.length} ردیف فعلی چه کنم؟`,
        [{n:1,sev:'info',m:'جایگزینی: دفتر فعلی کاملاً با فایل عوض می‌شود (قابل بازگردانی).'},
         {n:2,sev:'info',m:'افزودن: ردیف‌های فایل به انتهای دفتر فعلی اضافه می‌شوند.'}],
        [['replace','جایگزین کن','primary'],['append','به انتها اضافه کن'],['cancel','انصراف']])
    : 'replace';
  if (mode === 'cancel') return;
  const next = mode === 'append' ? rows.concat(final) : final;
  const go = await ask('ورود از فایل', `${final.length} ردیف از شیت «${sheetName}» ${mode==='append'?'به دفتر اضافه':'جایگزین دفتر'} می‌شود. ${cmpTxt(rows,next)} ادامه می‌دهید؟`, mode==='append'?'اضافه کن':'جایگزین کن', false);
  if (!go) return;
  SEL.clear();
  commit(next, balOK ? `${final.length} ردیف وارد شد؛ مانده با فایل می‌خواند` : `${final.length} ردیف وارد شد؛ ⚠ مانده محاسبه‌شده با ستون مانده فایل فرق دارد`);
}
const cmpTxt = (a,b) => {
  const ca = calc(a), cb = calc(b);
  return `فعلی: ${a.length} ردیف، مانده ${fbal(ca.bal)} ← جدید: ${b.length} ردیف، مانده ${fbal(cb.bal)} (اختلاف ${nf.format(cb.bal-ca.bal)} ریال).`;
};

/* ------------------------------ change log -------------------------- */
const FN = {d:'تاریخ', s:'شرح', q:'مقدار', u:'واحد', p:'قیمت', dr:'بدهکار', cr:'بستانکار', c:'ارز', note:'یادداشت'};
function logChange(msg, a, b){
  const ch = [];
  if (a.length === b.length){
    b.forEach((r,i) => {
      if (JSON.stringify(r) !== JSON.stringify(a[i]))
        ch.push(`ردیف ${i+1}: ` + Object.keys(FN).filter(k=>a[i][k]!==r[k])
          .map(k=>`${FN[k]} از «${String(a[i][k]).slice(0,40)}» به «${String(r[k]).slice(0,40)}»`).join('، '));
    });
  }
  LOG.push({t:new Date().toLocaleString('fa-IR'), m:msg, n0:a.length, n1:b.length, ch:ch.slice(0,15)});
  LOG = LOG.slice(-400);
  store.set(logKey(), JSON.stringify(LOG));
}

/* ------------------------------ saved views ------------------------- */
function loadViews(){ const v = store.json(VK, []); VIEWS = Array.isArray(v) ? v.filter(x=>x&&x.name&&x.state) : []; }
function saveViews(){ store.set(VK, JSON.stringify(VIEWS)); }
function captureState(){
  return {q:$('q').value, flt:$('flt').value, ord:$('xf-ord').value, ex:$('xf-ex').checked,
    d1:$('xf-d1').value, d2:$('xf-d2').value, a1:$('xf-a1').value, a2:$('xf-a2').value, op:$('xf-op').value,
    unit:UI.unit, cols:PS.cols.slice()};
}
function applyState(s){
  $('q').value = s.q||''; $('flt').value = s.flt||'all'; $('xf-ord').value = s.ord||'reg';
  $('xf-ex').checked = !!s.ex;
  $('xf-d1').value = s.d1||''; $('xf-d2').value = s.d2||'';
  $('xf-a1').value = s.a1||''; $('xf-a2').value = s.a2||''; $('xf-op').value = s.op||'';
  $('xf-d1')._sync(); $('xf-d2')._sync();
  if (s.unit && s.unit !== UI.unit){ UI.unit = s.unit; $('unit').value = s.unit; saveUI(); }
  if (Array.isArray(s.cols) && s.cols.length === PCOLS.length) PS.cols = s.cols.map(Boolean);
  scoreCache = new Map(); cacheTerm = null;
  render();
}
let activeView = null;
function renderViews(){
  const el = $('views');
  if (!VIEWS.length){ el.innerHTML = ''; return; }
  el.innerHTML = '<span class="vlabel">نماهای ذخیره‌شده:</span>' + VIEWS.map((v,i)=>
    `<span class="vchip${activeView===i?' on':''}"><button type="button" data-v="${i}">${esc(v.name)}</button><button type="button" class="vdel" data-vd="${i}" aria-label="حذف نما ${esc(v.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join('');
}

/* ------------------------------ analytics --------------------------- */
function goodName(s){
  let t = nz(s).trim();
  t = t.replace(/^برگشت\s+از\s+(فروش|خرید)\s*\(\d+\)\s*/,'');
  const cut = t.split(/\s*[-–—]\s*/)[0].trim();
  return cut.replace(/\s+/g,' ').slice(0,42).trim();
}
function monthKey(d){ const k = dkey(d); return k ? Math.floor(k/100) : null; }
function monthLabel(mk){ const y = Math.floor(mk/100), m = mk%100; return MN[m-1]+' '+String(y).slice(2); }

function renderAnalytics(){
  const V = LASTV || buildView();
  const t = V.t;
  const months = new Map();
  rows.forEach(r => { const mk = monthKey(r.d); if (mk == null) return;
    const o = months.get(mk) || {dr:0,cr:0,n:0}; o.dr += r.dr; o.cr += r.cr; o.n++; months.set(mk,o); });
  const mks = [...months.keys()].sort((a,b)=>a-b);
  const goods = new Map();
  rows.forEach(r => {
    if (!(r.q > 0 && r.p > 0)) return;
    const g = goodName(r.s); if (!g) return;
    const o = goods.get(g) || {buy:0,sell:0,val:0,psum:0,pn:0,n:0};
    if (r.cr > 0) o.buy += r.q; else o.sell += r.q;
    o.val += (r.dr||r.cr); o.psum += r.p; o.pn++; o.n++;
    goods.set(g,o);
  });
  const glist = [...goods.entries()].sort((a,b)=>b[1].val-a[1].val);
  const avgM = mks.length ? (t.dr+t.cr)/mks.length : 0;
  const biggest = rows.reduce((m,r)=>Math.max(m,r.dr,r.cr),0);
  $('anKpis').innerHTML = [
    ['تعداد اسناد', nf.format(rows.length), `${mks.length} ماه فعال`],
    ['گردش کل', nf.format(UI.unit==='تومان'?(t.dr+t.cr)/10:t.dr+t.cr), UI.unit],
    ['میانگین گردش ماهانه', nf.format(Math.round(UI.unit==='تومان'?avgM/10:avgM)), UI.unit],
    ['بزرگ‌ترین سند', nf.format(UI.unit==='تومان'?biggest/10:biggest), UI.unit],
    ['کالاهای شناسایی‌شده', nf.format(goods.size), `${glist.reduce((x,g)=>x+g[1].n,0)} ردیف کالایی`],
    ['ردیف‌های دارای هشدار', nf.format(Object.keys(AUDMAP).length), PS.ck.on?'کنترل‌ها روشن':'کنترل‌ها خاموش']
  ].map(([a,b,c])=>`<div class="kpi"><div class="kt">${a}</div><div class="kv">${b}</div><div class="ks">${c}</div></div>`).join('');
  $('chMonthly').innerHTML = barChart(mks.map(k=>({label:monthLabel(k), a:months.get(k).dr, b:months.get(k).cr})));
  $('chBalance').innerHTML = lineChart(V.bals);
  $('chGoods').innerHTML = donut(glist.slice(0,8).map(([n,o])=>({label:n, v:o.val})), glist.slice(8).reduce((x,g)=>x+g[1].val,0));
  const gmax = Math.max(1,...glist.map(g=>g[1].val));
  $('goodsBody').innerHTML = glist.length ? glist.map(([n,o])=>
    `<tr><td>${esc(n)}<span class="bar-inline" style="width:${(o.val/gmax*100).toFixed(1)}%"></span></td>
     <td class="n">${o.buy?nf.format(Math.round(o.buy*100)/100):'—'}</td>
     <td class="n">${o.sell?nf.format(Math.round(o.sell*100)/100):'—'}</td>
     <td class="n">${money(Math.round(o.psum/o.pn))}</td>
     <td class="n">${money(o.val)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty" style="padding:26px">ردیف کالایی (دارای مقدار و قیمت) یافت نشد.</td></tr>';
  const parties = new Map();
  rows.forEach(r => {
    const ms = r.s.match(/\(([^()]{3,60})\)/g) || [];
    ms.forEach(m => {
      const v = m.slice(1,-1).trim();
      if (!v || /^[\d\s/.,:-]+$/.test(dg(v)) || !/[آ-ی]/.test(v)) return;
      const key = nz(v).replace(/\s+/g,' ');
      const o = parties.get(key) || {name:v, n:0, dr:0, cr:0};
      o.n++; o.dr += r.dr; o.cr += r.cr; parties.set(key,o);
    });
  });
  const plist = [...parties.values()].sort((a,b)=>(b.dr+b.cr)-(a.dr+a.cr)).slice(0,40);
  $('partyBody').innerHTML = plist.length ? plist.map(p=>{
    const net = p.dr-p.cr;
    return `<tr><td>${esc(p.name)}</td><td class="n">${p.n}</td><td class="n">${p.dr?money(p.dr):'—'}</td>
      <td class="n">${p.cr?money(p.cr):'—'}</td><td class="n" style="color:${net>0?'var(--dr)':net<0?'var(--cr)':'inherit'}">${money(Math.abs(net))} ${net>0?'بد':net<0?'بس':''}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty" style="padding:26px">نامی داخل پرانتز شرح‌ها یافت نشد.</td></tr>';
}
const SC = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','var(--s7)','var(--s8)'];
/* نمودارها direction:rtl را به ارث می‌برند، پس start یعنی لبه راست و end یعنی لبه چپ؛ لنگرها بر همین اساس انتخاب شده‌اند. */
function barChart(data){
  if (!data.length) return '<p class="muted">داده‌ای برای نمودار نیست.</p>';
  const W=920, H=250, pad={t:18,r:14,b:38,l:52};
  const iw = W-pad.l-pad.r, ih = H-pad.t-pad.b;
  const mx = Math.max(1,...data.flatMap(d=>[d.a,d.b]));
  const scale = v => ih*(v/mx);
  const gw = iw/data.length, bw = Math.min(20, gw*0.3);
  const unitDiv = UI.unit==='تومان' ? 1e7 : 1e6;
  const unitName = UI.unit==='تومان' ? 'میلیون تومان' : 'میلیون ریال';
  let g = '';
  for (let i=0;i<=4;i++){
    const y = pad.t+ih-(ih*i/4);
    g += `<line class="grid" x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W-pad.r}" y2="${y.toFixed(1)}"/>
      <text x="${pad.l-6}" y="${(y+3).toFixed(1)}" text-anchor="start">${nf.format(Math.round(mx*i/4/unitDiv))}</text>`;
  }
  let bars = '', nets = [];
  data.forEach((d,i) => {
    const cx = pad.l+gw*i+gw/2;
    const ha = scale(d.a), hb = scale(d.b);
    bars += `<rect class="bar" x="${(cx-bw-1).toFixed(1)}" y="${(pad.t+ih-ha).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,ha).toFixed(1)}" rx="2.5" fill="var(--s1)"><title>${esc(d.label)} — بدهکار ${nf.format(d.a)}</title></rect>`;
    bars += `<rect class="bar" x="${(cx+1).toFixed(1)}" y="${(pad.t+ih-hb).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,hb).toFixed(1)}" rx="2.5" fill="var(--s4)"><title>${esc(d.label)} — بستانکار ${nf.format(d.b)}</title></rect>`;
    bars += `<text class="vlab" x="${cx.toFixed(1)}" y="${(pad.t+ih-Math.max(ha,hb)-4).toFixed(1)}" text-anchor="middle">${nf.format(Math.round(Math.max(d.a,d.b)/unitDiv))}</text>`;
    bars += `<text x="${cx.toFixed(1)}" y="${H-pad.b+15}" text-anchor="middle">${esc(d.label)}</text>`;
    nets.push([cx, pad.t+ih-scale(Math.abs(d.a-d.b))]);
  });
  const netPath = nets.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${clamp(p[1],pad.t,pad.t+ih).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار گردش ماهانه">
    ${g}<line class="axis" x1="${pad.l}" y1="${pad.t+ih}" x2="${W-pad.r}" y2="${pad.t+ih}"/>
    ${bars}<path d="${netPath}" fill="none" stroke="var(--s2)" stroke-width="1.8" stroke-dasharray="4 3" opacity=".85"/>
    <text x="${pad.l}" y="11" text-anchor="end">واحد اعداد: ${unitName}</text></svg>`;
}
function lineChart(vals){
  if (!vals.length) return '<p class="muted">داده‌ای برای نمودار نیست.</p>';
  const W=920, H=230, pad={t:16,r:14,b:26,l:58};
  const iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  const step = Math.max(1, Math.ceil(vals.length/300));
  const pts=[]; for (let i=0;i<vals.length;i+=step) pts.push([i,vals[i]]);
  if (pts[pts.length-1][0] !== vals.length-1) pts.push([vals.length-1, vals[vals.length-1]]);
  /* گسترش آرایه در Math.min با دفترهای بزرگ به سقف آرگومان می‌خورد؛ حلقهٔ ساده بی‌سقف است. */
  let mn=0, mx=0;
  for (let i=0;i<vals.length;i++){ const v=vals[i]; if (v<mn) mn=v; if (v>mx) mx=v; }
  const span=(mx-mn)||1;
  const X=i=>pad.l+(i/Math.max(1,vals.length-1))*iw;
  const Y=v=>pad.t+ih-((v-mn)/span)*ih;
  const d=pts.map((p,i)=>`${i?'L':'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  const div = UI.unit==='تومان'?1e7:1e6;
  let g='';
  for (let i=0;i<=4;i++){
    const v = mn+span*i/4, y=Y(v);
    g += `<line class="grid" x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W-pad.r}" y2="${y.toFixed(1)}"/>
      <text x="${pad.l-6}" y="${(y+3).toFixed(1)}" text-anchor="start">${nf.format(Math.round(v/div))}</text>`;
  }
  const zy=Y(0);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="روند مانده حساب">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--s2)" stop-opacity=".30"/><stop offset="100%" stop-color="var(--s2)" stop-opacity="0"/></linearGradient></defs>
    ${g}<path d="${d} L${X(vals.length-1).toFixed(1)},${zy.toFixed(1)} L${pad.l},${zy.toFixed(1)} Z" fill="url(#lg)"/>
    <line class="axis" x1="${pad.l}" y1="${zy.toFixed(1)}" x2="${W-pad.r}" y2="${zy.toFixed(1)}" stroke="var(--s1)" stroke-dasharray="3 3"/>
    <path d="${d}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(vals.length-1).toFixed(1)}" cy="${Y(vals[vals.length-1]).toFixed(1)}" r="3.4" fill="var(--s2)"/>
    <text x="${pad.l}" y="11" text-anchor="end">واحد اعداد: ${UI.unit==='تومان'?'میلیون تومان':'میلیون ریال'} · بالای خط قرمز = بدهکار</text>
    <text x="${W-pad.r}" y="${H-6}" text-anchor="start">${vals.length} سند</text></svg>`;
}
function donut(items, rest){
  const all = items.slice();
  /* «سایر کالاها» رنگ خنثای خودش را دارد؛ در غیر این صورت به رنگ اولین کالا برمی‌گشت. */
  if (rest > 0) all.push({label:'سایر کالاها', v:rest, c:'var(--border-strong)'});
  const total = all.reduce((x,i)=>x+i.v,0);
  if (!total) return '<p class="muted">ردیف کالایی یافت نشد.</p>';
  const R=72, r=44, C=110;
  const col = (it,i) => it.c || SC[i%8];
  let a0 = -Math.PI/2, paths = '';
  all.forEach((it,i) => {
    const share = it.v/total;
    const fill = col(it,i);
    const tip = `<title>${esc(it.label)} — ${(share*100).toFixed(1)}٪</title>`;
    /* کمان کامل نقطهٔ آغاز و پایان یکسان دارد و ناپدید می‌شود؛ حلقهٔ کامل را با دو نیم‌دایره می‌کشیم. */
    if (share >= .999){
      paths += `<path d="M${C},${C-R} A${R},${R} 0 1 1 ${C},${C+R} A${R},${R} 0 1 1 ${C},${C-R} Z
        M${C},${C-r} A${r},${r} 0 1 0 ${C},${C+r} A${r},${r} 0 1 0 ${C},${C-r} Z"
        fill="${fill}" fill-rule="evenodd" stroke="var(--surface)" stroke-width="1.5">${tip}</path>`;
      return;
    }
    const a1 = a0 + share*Math.PI*2;
    const big = (a1-a0) > Math.PI ? 1 : 0;
    const p = (rad,ang) => [C+rad*Math.cos(ang), C+rad*Math.sin(ang)];
    const [x0,y0]=p(R,a0), [x1,y1]=p(R,a1), [x2,y2]=p(r,a1), [x3,y3]=p(r,a0);
    paths += `<path d="M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${big} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${r},${r} 0 ${big} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z"
      fill="${fill}" stroke="var(--surface)" stroke-width="1.5">${tip}</path>`;
    a0 = a1;
  });
  return `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
    <svg class="chart" viewBox="0 0 220 220" style="width:200px;flex:none" role="img" aria-label="سهم کالاها">
      ${paths}<text x="110" y="106" text-anchor="middle" style="font-size:11px;font-weight:800;fill:var(--text)">${nf.format(all.length)} کالا</text>
      <text x="110" y="122" text-anchor="middle" style="font-size:9px">${nf.format(Math.round(total/(UI.unit==='تومان'?1e7:1e6)))} م ${UI.unit}</text></svg>
    <div class="legend" style="flex-direction:column;flex:1;min-width:150px;margin:0">
      ${all.map((it,i)=>`<span><i style="background:${col(it,i)}"></i>${esc(it.label)} — <b>${(it.v/total*100).toFixed(1)}٪</b></span>`).join('')}
    </div></div>`;
}

/* ------------------------------ cheques ----------------------------- */
let CHEQUES = [];
const CHQ_NO = /چک\s*(?:دریافتی|پرداختی|صادر[هه]?)?\s*\(\s*([\d]{3,}(?:\/\d+)?)\s*\)/;
const CHQ_NO2 = /شماره\s*چک\s*:?\s*([\d]{3,})/;
function chqStatusLabel(s){
  return {open:'در جریان', returned:'عودت شده', spent:'خرج شده', bounced:'برگشتی'}[s] || s;
}
function buildCheques(){
  const map = new Map();
  const ensure = no => {
    if (!map.has(no)) map.set(no, {no, bank:'', due:'', amount:0, recv:'', ids:[], events:[], status:'open', kind:''});
    return map.get(no);
  };
  rows.forEach((r,i) => {
    const s = fa(r.s);
    const m = CHQ_NO.exec(s) || CHQ_NO2.exec(s);
    if (!m) return;
    const no = m[1];
    const c = ensure(no);
    c.ids.push(r.id);
    const isReturn = /عودت|برگشت/.test(s) && !/برگشت از (فروش|خرید)/.test(s);
    const isSpend  = /خرج\s*چک|سند\s*پرداخت/.test(s);
    const isBounce = /چک\s*برگشتی/.test(s);
    const isRecv   = /سند\s*دریافت/.test(s);
    if (isBounce){ c.events.push({i, type:'bounced'}); }
    else if (isReturn){ c.events.push({i, type:'returned'}); }
    else if (isSpend){ c.events.push({i, type:'spent'}); }
    else if (isRecv){ c.events.push({i, type:'recv'}); }
    else c.events.push({i, type:'ref'});
    if (isRecv || (!c.recv && !isReturn && !isSpend && !isBounce)){
      const tail = s.slice(m.index + m[0].length);
      const bank = tail.replace(/\(.*?\)/g,' ').replace(/\d{6,}/g,' ').replace(/توسط.*$/,'').replace(/[.\-–]/g,' ').replace(/\s+/g,' ').trim();
      if (bank.length > 2 && bank.length < 70) c.bank = bank;
      const dm = [...s.matchAll(/\((\d{4}[-/]\d{1,2}[-/]\d{1,2})\)/g)];
      if (dm.length) c.due = normDate(dm[dm.length-1][1]);
      if (!c.recv){ c.recv = r.d; c.amount = r.dr || r.cr; c.kind = r.cr > 0 ? 'دریافتی' : 'پرداختی'; c.mainIdx = i; }
    }
    if (!c.amount) c.amount = r.dr || r.cr;
    if (!c.due){
      const dm = [...s.matchAll(/\((\d{4}[-/]\d{1,2}[-/]\d{1,2})\)/g)];
      if (dm.length) c.due = normDate(dm[dm.length-1][1]);
    }
  });
  const tn = todayNum();
  const out = [...map.values()];
  out.forEach(c => {
    const types = new Set(c.events.map(e=>e.type));
    c.status = types.has('returned') ? 'returned' : types.has('spent') ? 'spent' : types.has('bounced') ? 'bounced' : 'open';
    const dn = dnum(c.due);
    c.left = dn != null && tn != null ? dn - tn : null;
    c.overdue = c.status === 'open' && c.left != null && c.left < 0;
    c.soon = c.status === 'open' && c.left != null && c.left >= 0 && c.left <= 10;
    if (c.mainIdx === undefined) c.mainIdx = c.events.length ? c.events[0].i : 0;
  });
  out.sort((a,b) => (dkey(a.due) ?? 9e8)-(dkey(b.due) ?? 9e8) || a.no.localeCompare(b.no));
  return out;
}
function renderCheques(){
  const open = CHEQUES.filter(c=>c.status==='open');
  const overdue = open.filter(c=>c.overdue);
  const soon = open.filter(c=>c.soon);
  const sum = a => a.reduce((x,c)=>x+c.amount,0);
  $('chqKpis').innerHTML = [
    ['کل چک‌های شناسایی‌شده', nf.format(CHEQUES.length), 'از متن شرح اسناد'],
    ['در جریان', nf.format(open.length), money(sum(open))+' '+UI.unit],
    ['سررسید گذشته', nf.format(overdue.length), money(sum(overdue))+' '+UI.unit],
    ['سررسید نزدیک', nf.format(soon.length), 'تا ۱۰ روز آینده'],
    ['عودت / برگشتی', nf.format(CHEQUES.filter(c=>c.status==='returned'||c.status==='bounced').length), 'از دفتر خارج شده'],
    ['خرج شده', nf.format(CHEQUES.filter(c=>c.status==='spent').length), 'به دیگری واگذار شده']
  ].map(([a,b,c])=>`<div class="kpi"><div class="kt">${a}</div><div class="kv">${b}</div><div class="ks">${c}</div></div>`).join('');
  const st = $('chqStatus').value, q = nz($('chqQ').value.trim());
  let list = CHEQUES;
  if (st === 'open') list = list.filter(c=>c.status==='open');
  else if (st === 'returned') list = list.filter(c=>c.status==='returned'||c.status==='bounced');
  else if (st === 'spent') list = list.filter(c=>c.status==='spent');
  else if (st === 'due') list = list.filter(c=>c.overdue||c.soon);
  if (q) list = list.filter(c=>nz(c.no+' '+c.bank).includes(q));
  $('chqBody').innerHTML = list.length ? list.map(c => {
    const cls = c.status==='open' ? (c.overdue?'bad':c.soon?'warn':'info') : c.status==='spent' ? 'ok' : 'mute';
    const left = c.status === 'open' && c.left != null
      ? `<span class="pillstat ${c.overdue?'bad':c.soon?'warn':'info'}">${c.left < 0 ? nf.format(-c.left)+' روز گذشته' : c.left === 0 ? 'امروز' : nf.format(c.left)+' روز مانده'}</span>`
      : '';
    return `<tr>
      <td><button type="button" class="tiny" data-chq="${c.mainIdx}" style="font-weight:800"><bdi>${esc(c.no)}</bdi></button></td>
      <td>${esc(c.bank||'—')}</td>
      <td class="n">${c.amount?money(c.amount):'—'}</td>
      <td>${esc(c.recv||'—')}</td>
      <td>${esc(c.due||'—')} ${left}</td>
      <td><span class="pillstat ${cls}">${chqStatusLabel(c.status)}</span></td>
      <td>${c.events.map(e=>`<button type="button" class="tiny" data-chq="${e.i}" title="${esc(rows[e.i]?rows[e.i].s.slice(0,80):'')}">${e.i+1}</button>`).join(' ')}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty" style="padding:30px">چکی با این شرایط پیدا نشد.</td></tr>';
}
function exportChequeCsv(){
  if (!CHEQUES.length){ status('چکی برای خروجی وجود ندارد.', true); return; }
  const head = ['شماره چک','بانک و شعبه','مبلغ (ریال)','تاریخ دریافت','سررسید','وضعیت','ردیف‌های مرتبط'];
  const lines = [head.join(',')];
  CHEQUES.forEach(c => lines.push([c.no,c.bank,c.amount,c.recv,c.due,chqStatusLabel(c.status),
    c.events.map(e=>e.i+1).join(' ')].map(csvCell).join(',')));
  download(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}), 'دفتر-چک-'+stamp()+'.csv');
  status('فایل CSV دفتر چک ساخته شد.');
}

/* ------------------------------ settings UI ------------------------- */
const PF = [['p-name','name'],['p-sub','sub'],['p-date','date'],['p-main','main'],['p-color','color'],['p-fs','fs'],['p-open','open'],
  ['p-showName','showName'],['p-showSub','showSub'],['p-showDate','showDate'],['p-showUnit','showUnit'],
  ['p-showMain','showMain'],['p-showItems','showItems'],['p-zebra','zebra'],['p-showTotals','showTotals']];
function renderPItems(){
  $('p-items').innerHTML = PS.items.map((x,i)=>`<div class="prow it">
    <input data-i="${i}" data-f="t" placeholder="عنوان" value="${esc(x.t)}" aria-label="عنوان بخش ${i+1}">
    <input data-i="${i}" data-f="v" placeholder="مقدار" value="${esc(x.v)}" aria-label="مقدار بخش ${i+1}">
    <select data-i="${i}" data-f="k" aria-label="نوع نمایش بخش ${i+1}"><option value="c"${x.k!=='s'?' selected':''}>کارت</option><option value="s"${x.k==='s'?' selected':''}>شبکه اجتماعی</option></select>
    <label class="chk"><input type="checkbox" data-i="${i}" data-f="on"${x.on?' checked':''}> نمایش</label>
    <button type="button" class="tiny" data-del="${i}" aria-label="حذف بخش ${i+1}">حذف</button></div>`).join('')
    || '<p class="muted">هنوز بخشی افزوده نشده است.</p>';
}
function renderPCols(){
  $('p-cols').innerHTML = PCOLS.map((n,i)=>`<label class="chk"><input type="checkbox" data-c="${i}"${PS.cols[i]?' checked':''}> ${n}</label>`).join('');
}
const AMG = [['sum','کارت‌های خلاصه حساب'],['form','فرم ثبت و ویرایش سند'],['prn','بلوک خلاصه در چاپ']];
const AMK = [['r','ریال'],['t','تومان'],['n','عددی'],['w','متنی']];
const CKL = [['on','فعال‌سازی کنترل‌ها (کلید اصلی)'],['imp','ورود اکسل: کنترل مانده ردیف‌به‌ردیف'],
  ['cons','مبلغ منفی / بدهکار و بستانکار هم‌زمان'],['qty','مقدار × قیمت با مبلغ نمی‌خواند'],
  ['date','اعتبارسنجی تاریخ شمسی واقعی'],['ord','هشدار ترتیب تاریخ'],['cur','هشدار ردیف ارزی بدون نرخ'],
  ['dup','هشدار ردیف تکراری'],['mark','نشانه ⚠ روی ردیف‌های دارای هشدار'],['prnw','هشدار چاپ با فیلتر فعال']];
function renderAmCk(){
  $('p-am').innerHTML = AMG.map(([g,t])=>`<div><div class="muted" style="margin-bottom:4px">${t}</div><div class="prow">${AMK.map(([k,n])=>`<label class="chk"><input type="checkbox" data-g="${g}" data-k="${k}"${PS.am[g][k]?' checked':''}> ${n}</label>`).join('')}${g==='prn'?`<label class="chk"><input type="checkbox" data-g="prn" data-k="show"${PS.am.prn.show?' checked':''}> نمایش در چاپ</label>`:''}</div></div>`).join('');
  $('p-ck').innerHTML = CKL.map(([k,n])=>`<label class="chk"><input type="checkbox" data-ck="${k}"${PS.ck[k]?' checked':''}> ${n}</label>`).join('');
}
const SWATCHES = ['#12305a','#0f766e','#7a1c14','#6d4006','#1d6b41','#8d2755','#3b3b46','#1e4372'];
function fillPanel(){
  PF.forEach(([id,k]) => { const el = $(id); if (!el) return; if (el.type === 'checkbox') el.checked = !!PS[k]; else el.value = PS[k]; });
  $('p-fserr').hidden = !String(PS.fs).trim() || fsVal() !== null;
  $('p-anim').checked = !!UI.anim;
  $('p-swatches').innerHTML = SWATCHES.map(c=>`<button type="button" class="swatch${c.toLowerCase()===PS.color.toLowerCase()?' on':''}" data-col="${c}" style="background:${c}" title="${c}" aria-label="رنگ ${c}"></button>`).join('');
  renderPItems(); renderPCols(); renderAmCk(); applyLook();
}
let svT = null;
function changed(){ clearTimeout(svT); svT = setTimeout(savePS, 250); applyAll(); }

/* ------------------------------ filter chips ------------------------ */
const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
let XT = [];
function xpBuild(sel, cont){
  const s = $(sel), c = $(cont);
  c.innerHTML = [...s.options].map(o=>`<button type="button" role="radio" aria-checked="false" data-v="${esc(o.value)}">${esc(o.textContent)}</button>`).join('');
  c.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; s.value = b.dataset.v; s.dispatchEvent(new Event('change',{bubbles:true})); });
}
function xpUpdate(n){
  const u = UI.unit, t = [], v = id => $(id).value.trim(), add = (l,f) => t.push([l,f]);
  if (v('q')) add('جست‌وجو: «'+v('q').slice(0,26)+'»', ()=>{ $('q').value=''; });
  if ($('flt').value !== 'all') add($('flt').selectedOptions[0].text, ()=>{ $('flt').value='all'; });
  if (v('xf-d1')) add('از '+v('xf-d1'), ()=>{ $('xf-d1').value=''; $('xf-d1')._sync(); });
  if (v('xf-d2')) add('تا '+v('xf-d2'), ()=>{ $('xf-d2').value=''; $('xf-d2')._sync(); });
  if (v('xf-a1')) add(`حداقل ${v('xf-a1')} ${u}`, ()=>{ $('xf-a1').value=''; });
  if (v('xf-a2')) add(`حداکثر ${v('xf-a2')} ${u}`, ()=>{ $('xf-a2').value=''; });
  if (v('xf-op')) add('نوع: '+v('xf-op'), ()=>{ $('xf-op').value=''; });
  if ($('xf-ord').value !== 'reg') add('ترتیب: '+$('xf-ord').selectedOptions[0].text, ()=>{ $('xf-ord').value='reg'; });
  if ($('xf-ex').checked) add('عدد دقیقاً برابر', ()=>{ $('xf-ex').checked=false; });
  XT = t;
  $('xf-tags').innerHTML = t.map((x,i)=>`<span class="xtag"><button type="button" data-i="${i}" aria-label="حذف فیلتر: ${esc(x[0])}">${X_SVG}</button>${esc(x[0])}</span>`).join('');
  const b = $('xf-badge'); b.hidden = !t.length; b.textContent = t.length;
  $('xf-count').innerHTML = `نمایش <b>${n}</b> از <b>${rows.length}</b> ردیف`;
  document.querySelectorAll('.xu').forEach(e => { e.textContent = u; });
  [['xf-op','xf-op-chips'],['xf-ord','xf-ord-seg']].forEach(([s,c]) =>
    document.querySelectorAll('#'+c+' button').forEach(bt => {
      const on = bt.dataset.v === $(s).value;
      bt.setAttribute('aria-checked', on); bt.classList.toggle('on', on);
    }));
  document.querySelectorAll('#tbl th.sortable').forEach(th => {
    const k = th.dataset.sort, ord = $('xf-ord').value;
    /* ستون‌های مقدار/قیمت/بدهکار/بستانکار همه با حالت «amt» مرتب می‌شوند، نه کلیدی به نام amt. */
    const on = k === 'date' ? ord === 'date' : ord === 'amt';
    if (on) th.dataset.dir = 'desc'; else delete th.dataset.dir;
    const a = th.querySelector('.arw'); if (a) a.textContent = on ? '▾' : '↕';
  });
}

/* -------------------------------- tabs ------------------------------ */
function setTab(name){
  UI.tab = name; saveUI();
  [['ledger','tabLedger','pnlLedger'],['analytics','tabAnalytics','pnlAnalytics'],['cheques','tabCheques','pnlCheques']]
    .forEach(([k,t,p]) => { $(t).setAttribute('aria-selected', k===name); $(p).hidden = k!==name; });
  /* هنگام راه‌اندازی، جدول را خودِ init می‌سازد؛ اینجا فقط بازگشت به تب دفتر باید بازسازی کند. */
  if (name === 'ledger' && LASTV) render();
  if (name === 'analytics') renderAnalytics();
  if (name === 'cheques') renderCheques();
}

/* ============================ EVENT WIRING ========================== */
/* هر جست‌وجو تایمر خودش را دارد؛ تایمر مشترک، رندر در انتظارِ جست‌وجوی دیگر را لغو می‌کرد. */
let qT = null, chqT = null;
$('q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { scoreCache = new Map(); cacheTerm = null; activeView = null; render(); }, 130); });
$('flt').addEventListener('change', () => { activeView = null; render(); });
$('unit').addEventListener('change', e => { UI.unit = e.target.value; saveUI(); render(); if (UI.tab==='analytics') renderAnalytics(); if (UI.tab==='cheques') renderCheques(); });
$('book').addEventListener('change', e => switchBook(e.target.value));
$('bNewBook').onclick = () => newBook();
$('bBooks').onclick = () => { renderBookList(); showD('bks'); };
$('bksNew').onclick = async () => {
  $('bks').close();
  await newBook();
  renderBookList(); showD('bks');
};
$('bksB').addEventListener('click', async e => {
  const b = e.target.closest('button[data-ba]'); if (!b || b.disabled) return;
  const id = b.dataset.id, a = b.dataset.ba;
  $('bks').close();
  if (a === 'o') switchBook(id);
  else if (a === 'r') await renameBook(id);
  else if (a === 'd') await deleteBook(id);
  if (a !== 'o'){ renderBookList(); showD('bks'); }
});
$('bTheme').onclick = () => { UI.theme = UI.theme === 'dark' ? 'light' : 'dark'; saveUI(); applyLook(); };
$('bKeys').onclick = () => showD('keys');
$('bAdd').onclick = () => openForm(-1);
$('bUndo').onclick = undo;
$('bRedo').onclick = redo;
$('tUndo').onclick = undo;
$('tClose').onclick = hideToast;
$('bCancel').onclick = () => $('dlg').close();
$('bSaveNew').onclick = () => submitForm(true);
$('frm').addEventListener('submit', e => { e.preventDefault(); submitForm(false); });
onClose($('dlg'), clearErrors);
['f-q','f-p','f-amt'].forEach(id => $(id).addEventListener('input', () => { groupInput($(id)); autoCalc(id); fAmx(); }));
$('f-auto').addEventListener('change', () => { if ($('f-auto').checked) autoCalc('f-q'); fAmx(); });
$('f-side').addEventListener('change', fAmx);

$('tb').addEventListener('click', async e => {
  const b = e.target.closest('button[data-a]');
  if (b){
    const i = +b.dataset.i, a = b.dataset.a;
    if (a === 'e') openForm(i);
    else if (a === 'c') copyRow(i);
    else if (a === 'd') await delRow(i);
    return;
  }
  const d = e.target.closest('[data-open]');
  if (d) openDrawer(+d.dataset.open);
});
$('tb').addEventListener('change', e => {
  const c = e.target.closest('[data-sel]'); if (!c) return;
  const r = rows[+c.dataset.sel]; if (!r) return;
  c.checked ? SEL.add(r.id) : SEL.delete(r.id);
  c.closest('tr').classList.toggle('sel', c.checked);
  updSel();
});
$('selbar').addEventListener('click', e => {
  const b = e.target.closest('[data-s]'); if (!b) return;
  const s = b.dataset.s;
  if (s === 'xls') exportXlsx('s');
  else if (s === 'prn') doPrint(true);
  else if (s === 'bulk') openBulk();
  else if (s === 'dup') bulkDup();
  else if (s === 'del') bulkDelete();
  else if (s === 'clr'){ SEL.clear(); render(); }
});
$('dwClose').onclick = closeDrawer;
$('dwScrim').onclick = closeDrawer;
$('dwPrev').onclick = () => drawerStep(-1);
$('dwNext').onclick = () => drawerStep(1);
$('dwEdit').onclick = () => { const i = rows.findIndex(r=>r.id===activeId); if (i>=0) openForm(i); };
$('dwCopy').onclick = () => { const i = rows.findIndex(r=>r.id===activeId); if (i>=0) copyRow(i); };
$('dwDel').onclick = () => { const i = rows.findIndex(r=>r.id===activeId); if (i>=0) delRow(i); };
$('dwUp').onclick = () => { const i = rows.findIndex(r=>r.id===activeId); if (i>0){ moveRow(i,i-1); openDrawer(i-1); } };
$('dwDown').onclick = () => { const i = rows.findIndex(r=>r.id===activeId); if (i>=0 && i<rows.length-1){ moveRow(i,i+1); openDrawer(i+1); } };

$('bk-op').addEventListener('change', bulkSync);
$('bkCancel').onclick = () => $('bulk').close();
$('bulkFrm').addEventListener('submit', e => { e.preventDefault(); applyBulk(); });

/* file menu */
const closeMenu = () => { $('mFile').open = false; };
$('bImp').onclick = () => { closeMenu(); $('fx').click(); };
$('fx').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); };
$('bRes').onclick = () => { closeMenu(); $('fj').click(); };
$('fj').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    let o;
    try { o = JSON.parse(await file.text()); }
    catch(_){ throw new Error('فایل پشتیبان خوانده نشد؛ محتوای آن JSON معتبر نیست.'); }
    if (!o || !isBackupId(o.app) || !Array.isArray(o.rows)) throw new Error('فایل پشتیبان معتبر نیست.');
    const inc = o.rows.map(normRow).filter(Boolean);
    if (!inc.length && o.rows.length) throw new Error('داده‌های فایل پشتیبان ناسازگار است.');
    const bn = (BOOKS.find(b=>b.id===curBook)||{}).name || '';
    const from = o.bookName && o.bookName !== bn ? ` این پشتیبان از دفتر «${o.bookName}» گرفته شده و در دفتر «${bn}» جای می‌گیرد.` : '';
    const go = await ask('بازیابی پشتیبان', `${cmpTxt(rows, inc)}${from} ادامه می‌دهید؟ (قابل بازگردانی است)`, 'بازیابی کن', false);
    if (!go) return;
    if (o.print && typeof o.print === 'object'){ PS = normPS(o.print); savePS(); }
    if (Array.isArray(o.views)){ VIEWS = o.views.filter(x=>x&&x.name&&x.state); saveViews(); }
    if (Array.isArray(o.log)){ LOG = o.log.filter(x=>x&&x.t&&x.m); store.set(logKey(), JSON.stringify(LOG)); }
    if (o.ui && typeof o.ui === 'object'){
      const u = o.ui;
      if (u.unit === 'ریال' || u.unit === 'تومان') UI.unit = u.unit;
      if (u.theme === 'light' || u.theme === 'dark') UI.theme = u.theme;
      if (u.density === 'cozy' || u.density === 'compact') UI.density = u.density;
      if (['reg','sim','date','amt'].includes(u.order)) UI.order = u.order;
      if (typeof u.anim === 'boolean') UI.anim = u.anim;
      saveUI(); $('unit').value = UI.unit; $('xf-ord').value = UI.order;
    }
    SEL.clear(); closeDrawer(); fillPanel();
    commit(inc, 'نسخه پشتیبان بازیابی شد');
  } catch(err){ status(err.message || 'خواندن فایل پشتیبان ناموفق بود.', true); }
};
$('bXls').onclick  = () => { closeMenu(); exportXlsx('all'); };
$('bXlsF').onclick = () => { closeMenu(); if (!filterActive()){ status('هیچ فیلتری فعال نیست؛ «اکسل — کل حساب» را بزنید.', true); return; } exportXlsx('f'); };
$('bXlsS').onclick = () => { closeMenu(); if (!selectedIdx().length){ status('ابتدا ردیف‌ها را با تیک ستون اول انتخاب کنید.', true); return; } exportXlsx('s'); };
$('bCsv').onclick  = () => { closeMenu(); exportCsv(); };
$('bBak').onclick  = () => { closeMenu(); backup(); };
$('bSort').onclick = async () => {
  closeMenu();
  const s = sortByDate(rows);
  if (s.every((r,i)=>r===rows[i])){ status('ردیف‌ها از قبل بر اساس تاریخ مرتب‌اند.'); return; }
  const ok = await ask('مرتب‌سازی تاریخ‌محور', 'ترتیب ثبت‌شده ردیف‌ها تغییر می‌کند و مانده‌های میانی دوباره محاسبه می‌شوند (مانده نهایی عوض نمی‌شود). قابل بازگردانی است.', 'مرتب کن', false);
  if (ok) commit(s, 'ردیف‌ها بر اساس تاریخ مرتب شدند');
};
$('bDedup').onclick = async () => {
  closeMenu();
  const seen = new Map(), dups = [];
  rows.forEach((r,i) => {
    const key = [r.d, nz(r.s), r.dr, r.cr].join('|');
    if (seen.has(key)) dups.push({keep:seen.get(key), i});
    else seen.set(key, i);
  });
  if (!dups.length){ status('ردیف تکراری (تاریخ، شرح و مبلغ یکسان) پیدا نشد.'); return; }
  const a = await report('ردیف‌های تکراری', `${dups.length} ردیف تکراری یافت شد. کدام کار انجام شود؟`,
    dups.map(d=>({n:d.i+1, sev:'warn', m:`تکرار ردیف ${d.keep+1} — ${rows[d.i].d} — ${rows[d.i].s.slice(0,70)}`})),
    [['del',`حذف ${dups.length} تکرار`,'danger'],['sel','فقط انتخابشان کن','primary'],['cancel','انصراف']]);
  if (a === 'del'){
    const ok = await ask('حذف تکراری‌ها', `${dups.length} ردیف تکراری حذف شود؟ نسخه اول هر گروه نگه داشته می‌شود. قابل بازگردانی است.`, 'حذف کن');
    if (!ok) return;
    const drop = new Set(dups.map(d=>d.i));
    commit(rows.filter((_,i)=>!drop.has(i)), `${dups.length} ردیف تکراری حذف شد`);
  } else if (a === 'sel'){
    SEL = new Set(dups.map(d=>rows[d.i].id)); render();
    status(`${dups.length} ردیف تکراری انتخاب شد؛ می‌توانید حذف گروهی کنید.`);
  }
};
$('bLog').onclick = async () => {
  closeMenu();
  const a = await report('تاریخچه تغییرات', LOG.length ? `${LOG.length} رویداد ذخیره شده (جدیدترین بالا).` : 'هنوز تغییری ثبت نشده است.',
    LOG.map((x,i)=>({n:i+1, sev:'info', m:`${x.t} — ${x.m} (${x.n0}←${x.n1} ردیف)${x.ch&&x.ch.length?' | '+x.ch.join(' | '):''}`})).reverse(),
    [['x','بستن','primary'],['clr','پاک‌کردن تاریخچه']]);
  if (a === 'clr' && await ask('پاک‌کردن تاریخچه', 'تاریخچه تغییرات برای همیشه پاک می‌شود. ادامه می‌دهید؟', 'پاک کن')){
    LOG = []; store.del(logKey()); status('تاریخچه پاک شد.');
  }
};
$('ori').onchange = () => { if ($('pvw').open) openPreview(); };
$('bPrn').onclick = () => doPrint(false);
$('bPvw').onclick = openPreview;
$('pvClose').onclick = () => $('pvw').close();
$('pvPrint').onclick = () => { $('pvw').close(); buildPrint(); window.print(); };

/* tabs */
$('tabLedger').onclick = () => setTab('ledger');
$('tabAnalytics').onclick = () => setTab('analytics');
$('tabCheques').onclick = () => setTab('cheques');
$('chqStatus').addEventListener('change', renderCheques);
$('chqQ').addEventListener('input', () => { clearTimeout(chqT); chqT = setTimeout(renderCheques, 130); });
$('chqCsv').onclick = exportChequeCsv;
$('chqBody').addEventListener('click', e => {
  const b = e.target.closest('[data-chq]'); if (!b) return;
  setTab('ledger'); openDrawer(+b.dataset.chq);
});

/* filters */
[...XI, 'xf-ord', 'xf-ex'].forEach(id =>
  $(id).addEventListener(['xf-op','xf-ord','xf-ex'].includes(id) ? 'change' : 'input', () => { activeView = null; render(); }));
['xf-a1','xf-a2'].forEach(id => $(id).addEventListener('input', () => groupInput($(id))));
$('xf-clr').onclick = () => {
  XI.forEach(id => $(id).value = '');
  $('xf-ex').checked = false; $('xf-ord').value = 'reg'; $('q').value = ''; $('flt').value = 'all';
  ['xf-d1','xf-d2'].forEach(id => $(id)._sync());
  activeView = null; scoreCache = new Map(); cacheTerm = null;
  render(); status('همه فیلترها پاک شد.');
};
$('xf-tags').addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  XT[+b.dataset.i][1](); activeView = null; scoreCache = new Map(); cacheTerm = null; render();
});
$('xf-ex').addEventListener('change', e => {
  if (e.target.checked && !$('q').value.trim()){ status('عدد مورد نظر را در کادر «جست‌وجو» بالای صفحه بنویسید.'); $('q').focus(); }
});
/* saved views */
$('bSaveView').onclick = async () => {
  const name = await askText('ذخیره نما', 'فیلترها، جست‌وجو، ترتیب و ستون‌های نمایش‌داده‌شده در این نما ذخیره می‌شود.',
    'نام نما', '', 'ذخیره نما');
  if (!name) return;
  VIEWS.push({name:name.trim(), state:captureState()});
  if (VIEWS.length > 24) VIEWS.shift();
  saveViews(); activeView = VIEWS.length-1; renderViews();
  status(`نمای «${name.trim()}» ذخیره شد.`);
};
$('views').addEventListener('click', async e => {
  const d = e.target.closest('[data-vd]');
  if (d){
    const i = +d.dataset.vd;
    const ok = await ask('حذف نما', `نمای «${VIEWS[i].name}» حذف شود؟`, 'حذف نما');
    if (!ok) return;
    VIEWS.splice(i,1); if (activeView === i) activeView = null;
    saveViews(); renderViews(); status('نما حذف شد.');
    return;
  }
  const b = e.target.closest('[data-v]'); if (!b) return;
  const i = +b.dataset.v; activeView = i; applyState(VIEWS[i].state);
  status(`نمای «${VIEWS[i].name}» اعمال شد.`);
});

/* settings panel */
PF.forEach(([id,k]) => {
  const el = $(id); if (!el || k === 'open') return;
  el.addEventListener('input', () => {
    PS[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'fs') $('p-fserr').hidden = !String(PS.fs).trim() || fsVal() !== null;
    if (k === 'color') document.querySelectorAll('#p-swatches .swatch').forEach(s=>s.classList.toggle('on', s.dataset.col.toLowerCase()===PS.color.toLowerCase()));
    changed();
    if (k === 'showUnit') render();
  });
});
$('p-open').addEventListener('input', () => { groupInput($('p-open'), true); PS.open = $('p-open').value; changed(); render(); });
$('p-swatches').addEventListener('click', e => {
  const b = e.target.closest('[data-col]'); if (!b) return;
  PS.color = b.dataset.col; $('p-color').value = PS.color;
  document.querySelectorAll('#p-swatches .swatch').forEach(s=>s.classList.toggle('on', s===b));
  changed();
});
function pItemEdit(e){
  const t = e.target, i = t.dataset.i; if (i === undefined) return;
  PS.items[+i][t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
  changed();
}
$('p-items').addEventListener('input', pItemEdit);
$('p-items').addEventListener('change', pItemEdit);
$('p-items').addEventListener('click', e => {
  const b = e.target.closest('button[data-del]'); if (!b) return;
  PS.items.splice(+b.dataset.del,1); renderPItems(); changed();
});
$('p-addItem').onclick = () => {
  PS.items.push({t:'',v:'',k:'c',on:true}); renderPItems(); changed();
  const l = $('p-items').querySelectorAll('input[data-f="t"]'); if (l.length) l[l.length-1].focus();
};
$('p-cols').addEventListener('change', e => {
  const c = e.target.dataset.c; if (c === undefined) return;
  PS.cols[+c] = e.target.checked;
  if (!PS.cols.some(Boolean)){ PS.cols[+c] = true; e.target.checked = true; status('حداقل یک ستون باید نمایش داده شود.', true); }
  changed(); render();
});
$('p-am').addEventListener('change', e => {
  const t = e.target; if (!t.dataset.g) return;
  const g = t.dataset.g, k = t.dataset.k, o = PS.am[g];
  /* هر واحد به یک قالب و هر قالب به یک واحد نیاز دارد؛ وگرنه کادر خالی می‌شود. */
  if (!t.checked && k !== 'show'){
    const pair = (k === 'r' || k === 't') ? ['r','t'] : ['n','w'];
    if (!pair.some(p => p !== k && o[p])){
      t.checked = true;
      status(pair[0] === 'r' ? 'دست‌کم یکی از واحدهای ریال یا تومان باید روشن بماند.' : 'دست‌کم یکی از قالب‌های عددی یا متنی باید روشن بماند.', true);
      return;
    }
  }
  o[k] = t.checked; savePS(); render(); fAmx();
});
$('p-ck').addEventListener('change', e => { const t = e.target; if (!t.dataset.ck) return; PS.ck[t.dataset.ck] = t.checked; savePS(); render(); });
$('p-runck').onclick = async () => {
  const iss = audit(rows);
  await report('کنترل صحت کل دفتر', iss.length ? `${iss.length} مورد در ${rows.length} ردیف یافت شد.` : 'هیچ موردی یافت نشد؛ دفتر سالم است.',
    iss, [['x','بستن','primary']]);
};
$('p-theme').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; UI.theme = b.dataset.v; saveUI(); applyLook(); });
$('p-density').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; UI.density = b.dataset.v; saveUI(); applyLook(); });
$('p-anim').addEventListener('change', e => { UI.anim = e.target.checked; saveUI(); applyLook(); });
$('bPS').onclick = () => { const d = $('pdlg'); if (d.open) d.close(); else { fillPanel(); d.show(); clampPanel(); } };
$('pClose').onclick = $('pClose2').onclick = () => $('pdlg').close();
$('pReset').onclick = async () => {
  const ok = await ask('بازنشانی تنظیمات', 'سربرگ، پاورقی، اطلاعات تماس، مانده اول دوره و ظاهر جدول به پیش‌فرض برمی‌گردد. ردیف‌های دفتر دست‌نخورده می‌مانند.', 'بازنشانی');
  if (!ok) return;
  PS = PDEF(); savePS(); fillPanel(); render(); status('تنظیمات بازنشانی شد.');
};
/* offsetWidth/Left اندازه چیدمان را می‌دهد؛ getBoundingClientRect در میانه انیمیشن ورود کوچک‌تر است و پنجره را از لبه بیرون می‌زند. */
function clampPanel(){
  const d = $('pdlg');
  if (!d.open || !d.style.left) return;
  d.style.left = clamp(d.offsetLeft, 0, Math.max(0, innerWidth - d.offsetWidth)) + 'px';
  d.style.top  = clamp(d.offsetTop,  0, Math.max(0, innerHeight - d.offsetHeight)) + 'px';
}
(function initPanelDrag(){
  const d = $('pdlg'), h = $('pdh'); let ox=0, oy=0, on=false;
  h.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || innerWidth <= 760) return;
    ox = e.clientX-d.offsetLeft; oy = e.clientY-d.offsetTop; on = true;
    try { h.setPointerCapture(e.pointerId); } catch(_){}
  });
  h.addEventListener('pointermove', e => {
    if (!on) return;
    const x = clamp(e.clientX-ox, 0, Math.max(0, innerWidth-d.offsetWidth));
    const y = clamp(e.clientY-oy, 0, Math.max(0, innerHeight-d.offsetHeight));
    d.style.left = x+'px'; d.style.top = y+'px'; d.style.right = 'auto'; d.style.bottom = 'auto';
  });
  const stop = () => { on = false; };
  h.addEventListener('pointerup', stop); h.addEventListener('pointercancel', stop);
})();

/* keyboard */
document.addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape'){
    if (!$('drawer').hidden && !document.querySelector('dialog[open]')){ closeDrawer(); return; }
    /* پنجرهٔ تنظیمات محاوره‌ای نیست؛ Escape خودش آن را نمی‌بندد. */
    if ($('pdlg').open && !document.querySelector('dialog[open]:not(#pdlg)')){ $('pdlg').close(); return; }
  }
  const om = document.querySelector('dialog[open]');
  if (om && om.id !== 'pdlg') return;      // میان‌برها داخل پنجره‌های محاوره‌ای بی‌اثرند
  if (mod && e.key.toLowerCase() === 'k'){ e.preventDefault(); setTab('ledger'); $('q').focus(); $('q').select(); return; }
  if (e.key === '/' && !typing){ e.preventDefault(); setTab('ledger'); $('q').focus(); return; }
  if (e.key === '?' && !typing){ e.preventDefault(); showD('keys'); return; }
  if (mod && e.key.toLowerCase() === 'z' && !typing){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing){ e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'n'){ e.preventDefault(); openForm(-1); return; }
  if (mod && e.key.toLowerCase() === 's'){ e.preventDefault(); backup(); return; }
  if (mod && e.key.toLowerCase() === 'p'){ e.preventDefault(); doPrint(false); return; }
  if (mod && e.key.toLowerCase() === 'a' && !typing && UI.tab === 'ledger'){
    e.preventDefault(); visRows.forEach(i=>SEL.add(rows[i].id)); render(); return;
  }
  if (e.key === 'Delete' && !typing && SEL.size && !document.querySelector('dialog[open]')){ e.preventDefault(); bulkDelete(); return; }
  if (!$('drawer').hidden && !document.querySelector('dialog[open]') && !typing){
    if (e.key === 'ArrowDown'){ e.preventDefault(); drawerStep(1); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); drawerStep(-1); }
  }
});

/* keep dialogs from closing on backdrop click-through mistakes */
document.querySelectorAll('dialog').forEach(d => {
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    if (d.id === 'pdlg') return;
    d.close();
  });
});
document.addEventListener('click', e => { if (!e.target.closest('#mFile')) $('mFile').open = false; });
window.addEventListener('resize', () => { if ($('pvw').open) openPreview(); clampPanel(); });
window.addEventListener('beforeunload', e => {
  if (!store.ok){ e.preventDefault(); e.returnValue = ''; }
});

/* ================================ INIT ============================== */
(function init(){
  loadBooks();
  const last = store.get(K+'_cur', 'main');
  curBook = BOOKS.some(b=>b.id===last) ? last : BOOKS[0].id;
  renderBooks();
  loadPS(); loadRows(); loadLog(); loadViews();
  $('unit').value = UI.unit;
  ['f-d','xf-d1','xf-d2'].forEach(id => dateSel($(id)));
  xpBuild('xf-op','xf-op-chips'); xpBuild('xf-ord','xf-ord-seg');
  $('xf-ord').value = ['reg','sim','date','amt'].includes(UI.order) ? UI.order : 'reg';
  $('xf-ord').addEventListener('change', () => { UI.order = $('xf-ord').value; saveUI(); });
  reindex();
  renderHead();
  fillPanel();
  setTab(['ledger','analytics','cheques'].includes(UI.tab) ? UI.tab : 'ledger');
  doRender();
  persistRows();
  const flagged = Object.keys(AUDMAP).length;
  status(rows.length
    ? `${rows.length} سند بارگذاری شد${flagged ? ` · ${flagged} ردیف دارای هشدار کنترلی` : ' · کنترل صحت: موردی یافت نشد'}.`
    : 'این دفتر خالی است. با «ردیف جدید» یا «ورود از فایل اکسل» شروع کنید.');
  if (!store.ok) status('مرورگر اجازه ذخیره‌سازی نمی‌دهد؛ تغییرات پس از بستن صفحه از بین می‌رود. از «دانلود پشتیبان» استفاده کنید.', true);
})();