const fs = require('fs'), path = require('path');
const B = path.join(__dirname, '..', 'build');
const js = fs.readFileSync(path.join(B, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(B, 'app.html'), 'utf8');

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const dyn = new Set([...js.matchAll(/id="([^"$]+)"/g)].map(m => m[1]));

const missing = [...used].filter(i => !ids.has(i) && !dyn.has(i));
const dead = [...ids].filter(i => !used.has(i) && !js.includes("'" + i + "'") && !js.includes('#' + i));

console.log('ids in html:', ids.size, '| $() lookups:', used.size);
console.log('MISSING (js asks, html lacks):', missing.length ? missing : 'none');
console.log('UNREFERENCED html ids:', dead.length ? dead : 'none');

// duplicate ids
const all = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const dup = all.filter((v, i) => all.indexOf(v) !== i);
console.log('DUPLICATE html ids:', dup.length ? [...new Set(dup)] : 'none');

// declared function/const names vs usage
const decl = [...js.matchAll(/^(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
const unused = decl.filter(n => {
  const hits = (js.match(new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length;
  return hits < 2 && !html.includes(n);
});
console.log('DECLARED-BUT-NEVER-USED:', unused.length ? unused : 'none');

// identifiers referenced but never declared anywhere (rough global sweep)
const known = new Set([...decl, ...[...js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]),
  ...[...js.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1])]);
console.log('NS/BRAND/SEED present in js refs:', ['NS', 'BRAND', 'SEED'].map(n => n + '=' + (js.includes(n) ? 'yes' : 'no')).join(' '));