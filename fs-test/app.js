// Piano Groove Player (prueba del capítulo piloto). Usa PIANO (pianoeng.js), BOOK (data.js), INSTS (insts.js), ASSETS (drums.js).
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const ttl = s => esc(s).replace(/"([^"]*)"/g, '“$1”');
// Biblioteca: los capítulos llegan cifrados (AES-GCM) en CHAPTERS (chapters.js); la clave de cada uno va en el código QR del libro.
const LVN = {1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Pro'};
let LIB = {};          // n → capítulo descifrado
let CH = null, ALL = [];
let LEVEL = 1, PI = 0, TR = 0, TPCT = 1, SOUND = 'piano';
const MODE = (typeof BOOK_MODE !== 'undefined') ? BOOK_MODE : 'piano';
const UKE = typeof BOOK_INST !== 'undefined' && BOOK_INST === 'uke';   // ukelele: mismo modo que la guitarra, 4 cuerdas G-C-E-A
const mute = {rh: false, lh: false, dr: false, bs: false, kb: false, gt: false};
let METRO = false, COUNTIN = true;
try { const o = JSON.parse(localStorage.getItem('pg-opts') || '{}'); if (o.s) SOUND = o.s; if ('m' in o) METRO = o.m; if ('c' in o) COUNTIN = o.c; } catch (e) {}
// vista (bajo y guitarra): 'all' partitura+TAB+mástil · 'nt' partitura+TAB · 'tab' solo TAB · 'neck' solo mástil
let VIEW = 'all'; try { VIEW = localStorage.getItem('pg-view-' + (typeof BOOK_MODE !== 'undefined' ? BOOK_MODE : 'piano')) || 'all'; } catch (e) {}
const VIEWS = [['all', 'All'], ['nt', 'Notes + TAB'], ['tab', 'TAB'], ['neck', 'Neck']];
function setView(v) { VIEW = v; try { localStorage.setItem('pg-view-' + MODE, v); } catch (e) {} applyView(); drawScore(); drawKbd(); fitTop(); }
function applyView() { const pl = $('player'); if (!pl) return; const on = MODE !== 'piano';
  VIEWS.forEach(([k]) => document.body.classList.toggle('v-' + k, on && VIEW === k));
  document.querySelectorAll('.views button,.rviews button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === VIEW));
  const rv = $('rview'); if (rv) rv.textContent = (VIEWS.find(x => x[0] === VIEW) || VIEWS[0])[1]; showChName(); }
function showChName(i) { const el = $('chname'); if (!el || !NOTES) return; const t = i == null ? (START || 0) : i; let sym = ''; for (const c of NOTES.cs) if (Math.max(0, c.s) <= t) sym = c.sym; el.textContent = sym; }
const saveOpts = () => { try { localStorage.setItem('pg-opts', JSON.stringify({s: SOUND, m: METRO, c: COUNTIN})); } catch (e) {} };
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2200); }
const ub64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function openChapter(id, keyB64) {
  const blob = CHAPTERS[id]; if (!blob) throw new Error('unknown');
  const raw = ub64(blob), iv = raw.slice(0, 12), ct = raw.slice(12);
  const key = await crypto.subtle.importKey('raw', ub64(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}
function codes() { let k = {}; try { k = JSON.parse(localStorage.getItem('pg-codes') || '{}'); } catch (e) {} if (typeof PREVIEW_KEYS !== 'undefined') Object.assign(k, PREVIEW_KEYS); return k; }
// capítulo partido en dos claves (nivel 1 / niveles 2-4): se juntan en una sola entrada
function addCh(c) { const o = LIB[c.n];
  if (o && !o.demo && !o.lib && !c.lib && o.id === c.id) { const lv = {}; o.levels.concat(c.levels).forEach(L => lv[L.n] = L);
    const m = Object.assign({}, o.part === 2 ? c : o); m.levels = Object.values(lv).sort((a, b) => a.n - b.n); delete m.part;
    m.more = (m.more || []).filter(n => !lv[n]); LIB[c.n] = m; return m; }
  LIB[c.n] = c; return c; }
async function loadLibrary() {
  const k = codes(); LIB = {};
  for (const [id, key] of Object.entries(k)) { try { const c = await openChapter(id, key); if (LIB[c.n] && LIB[c.n].demo) delete LIB[c.n]; addCh(c); } catch (e) {} }
  if (typeof DEMO !== 'undefined' && DEMO && !Object.keys(LIB).length) LIB[DEMO.n] = DEMO;
}
// código: PG1.<id>.<clave>[.L<nivel>]  (dentro de https://piano.dibidup.com/#…)
async function handleCode(txt) {
  const m = /(?:PG1|BG1|GG1|UK1|FS1|GI1)\.(\w+)\.([\w-]{16,})(?:\.L(\d))?/.exec(decodeURIComponent(txt || ''));
  if (!m) { toast('This code is not from this book.'); return false; }
  try {
    const c = await openChapter(m[1], m[2]); const k = codes(); k[m[1]] = m[2];
    try { localStorage.setItem('pg-codes', JSON.stringify(k)); } catch (e) {}
    if (LIB[c.n] && LIB[c.n].demo) delete LIB[c.n];
    const had = LIB[c.n] && !LIB[c.n].demo ? LIB[c.n].levels.map(L => L.n) : []; const isNew = !c.levels.every(L => had.includes(L.n)); addCh(c);
    if (c.lib) { toast('The Pattern Library is unlocked!'); openLib(c.n, 1); return true; }
    toast(!isNew ? 'Chapter ' + c.n + ' is already in your library' : c.part === 2 ? 'Chapter ' + c.n + ': ' + c.levels.map(L => LVN[L.n]).join(', ') + ' added' : 'Chapter ' + c.n + ' added: ' + c.title);
    openLib(c.n, m[3] ? +m[3] : 1); return true;
  } catch (e) { toast('This code could not be read. Try again.'); return false; }
}
function openLib(n, lv) {
  stop(); CH = LIB[n]; ALL = [];
  CH.levels.forEach(L => L.sections.forEach(S => S.patterns.forEach(p => ALL.push(Object.assign({lv: L.n, sec: S.title}, p)))));
  LEVEL = CH.levels.some(L => L.n === lv) ? lv : CH.levels[0].n; PI = ALL.findIndex(p => p.lv === LEVEL); TR = 0; TPCT = 1; NOTES = null;
  chapterView(); window.scrollTo(0, 0);
}
// ---------------- más libros de la serie (solo en la biblioteca; sin avisos emergentes)
const MORE_BOOKS = [
  {id: 'drums', t: 'Drum Grooves for Every Style', d: '1,180 grooves and 152 fills in 35+ styles.', img: '61xa6mcngHL', asin: 'B0HP8SHVFF'},
  {id: 'piano', t: 'Piano Grooves for Every Style', d: '508 patterns for both hands in 16 styles.', img: '71A6UwegwTL', asin: 'B0HPZWMLG2'},
  {id: 'guitar', t: 'Guitar Grooves for Every Style', d: '527 guitar parts in notation and TAB, 16 styles.', img: '714mbPBKc5L', asin: 'B0HQ13N24B'},
  {id: 'improv', t: 'Guitar Improvisation for Every Style', d: '494 licks and solos in notation and TAB, 14 styles.', img: '619cg3kfMnL', asin: 'B0HST43XDJ'},
  {id: 'bass', t: 'Bass Grooves for Every Style', d: '512 bass lines in notation and TAB, with slap.', img: '71Oj17lKJXL', asin: 'B0HQWDLC6S'},
  {id: 'uke', t: 'Ukulele Step by Step', d: '253 patterns, from first chords to advanced, in notation and TAB.', img: '71BIm4dZZ7L', asin: 'B0HQYWPPSP'},
  {id: 'read', t: 'Learn to Read Music in a Month', d: 'Read sheet music from scratch in 30 days.', img: '71qFEW194pL', asin: 'B0HP8NTHB8', asinIntl: 'B0HMX7DY9M'},
];
function amazonStore() {
  let tz = '', lang = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  try { lang = (navigator.languages || [navigator.language]).join(',').toLowerCase(); } catch (e) {}
  const TZ = {'Europe/Madrid': 'es', 'Europe/Lisbon': 'es', 'Atlantic/Madeira': 'es', 'Atlantic/Azores': 'es', 'Europe/Warsaw': 'pl', 'Europe/Stockholm': 'se', 'Atlantic/Canary': 'es', 'Africa/Ceuta': 'es', 'Europe/Berlin': 'de', 'Europe/Vienna': 'de', 'Europe/Zurich': 'de', 'Europe/Busingen': 'de',
    'Europe/Paris': 'fr', 'Europe/Brussels': 'be', 'Europe/Luxembourg': 'fr', 'Europe/Monaco': 'fr', 'Europe/Rome': 'it', 'Europe/San_Marino': 'it', 'Europe/Vatican': 'it',
    'Europe/London': 'uk', 'Europe/Dublin': 'ie', 'Europe/Amsterdam': 'nl', 'Asia/Tokyo': 'jp'};
  let s = TZ[tz];
  if (!s && /^Australia\//.test(tz)) s = 'au';
  if (!s && /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Whitehorse|Yellowknife|Iqaluit)$/.test(tz)) s = 'ca';
  if (!s) { const m = lang.match(/\b(en-gb|en-ie|es-es|pt-pt|fr-be|nl-be|de|fr-fr|it|nl-nl|pl|sv|ja)\b/); s = m ? {'en-gb': 'uk', 'en-ie': 'ie', 'pt-pt': 'es', 'fr-be': 'be', 'nl-be': 'be', pl: 'pl', sv: 'se', 'es-es': 'es', de: 'de', 'fr-fr': 'fr', it: 'it', 'nl-nl': 'nl', ja: 'jp'}[m[1]] : 'us'; }
  const DOM = {us: 'amazon.com', uk: 'amazon.co.uk', es: 'amazon.es', de: 'amazon.de', fr: 'amazon.fr', it: 'amazon.it', nl: 'amazon.nl', jp: 'amazon.co.jp', ca: 'amazon.ca', au: 'amazon.com.au', ie: 'amazon.ie', be: 'amazon.com.be', pl: 'amazon.pl', se: 'amazon.se'};
  return {s, dom: DOM[s]};
}
function moreBooks() {
  const me = (typeof BOOK_ID !== 'undefined') ? BOOK_ID : MODE;
  const st = amazonStore(), label = 'Amazon.' + st.dom.slice(7);
  const items = MORE_BOOKS.filter(b => b.id !== me && b.asin && (!b.only || b.only.includes(st.s))).map(b => {
    const asin = (b.asinIntl && st.s !== 'us' && st.s !== 'ca') ? b.asinIntl : b.asin;
    const url = 'https://www.' + st.dom + '/dp/' + asin;
    return `<div class="mb"><a class="mbc" href="${url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${b.img ? `<img src="https://m.media-amazon.com/images/I/${b.img}._SL240_.jpg" alt="" loading="lazy" onerror="this.remove()">` : ''}</a><div class="mbt"><b>${esc(b.t)}</b><span>${esc(b.d)}</span><a class="btn mbb" href="${url}" target="_blank" rel="noopener" data-mb="${b.id}">View on ${label}</a></div></div>`;
  }).join('');
  if (!items) return '';
  if (!document.getElementById('mbcss')) { const c = document.createElement('style'); c.id = 'mbcss';
    c.textContent = '.more{margin-top:18px;border-top:1px solid var(--line);padding-top:14px}.more summary{cursor:pointer;font-weight:700;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px}.more summary::-webkit-details-marker{display:none}.more summary::after{content:"+";font:400 22px var(--body);color:var(--accent)}.more[open] summary::after{content:"−"}.more summary small{display:block;font-weight:400;color:var(--muted);font-size:13px}.mbl{display:grid;gap:10px;margin-top:10px}.mb{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg)}.mbc{flex:none;width:58px;height:75px;border-radius:3px;background:var(--cell);overflow:hidden}.mbc img{width:100%;height:100%;object-fit:cover;display:block}.mbt{display:grid;gap:3px;min-width:0}.mbt span{color:var(--muted);font-size:13.5px}.mbb{justify-self:start;margin-top:4px;padding:8px 14px;font-size:13px;text-decoration:none}';
    document.head.appendChild(c); }
  return `<details class="more"><summary><span>More books with this app<small>Same Groove Player, other instruments.</small></span></summary><div class="mbl">${items}</div></details>`;
}
function wireMoreBooks() {
  document.querySelectorAll('[data-mb]').forEach(a => a.addEventListener('click', () => { try { if (typeof gcEvt === 'function') gcEvt(MODE + ': more books click ' + a.dataset.mb + ' ' + a.href.replace(/^https:\/\/www\./, '')); } catch (e) {} }));
  const d = document.querySelector('details.more'); if (d) d.addEventListener('toggle', () => { try { if (d.open && typeof gcEvt === 'function') gcEvt(MODE + ': more books open'); } catch (e) {} });
}
// ---------------- reseña en Amazon: fila fija en la biblioteca y tarjeta visible (una vez; «Not now» vuelve a las 2 semanas, máx. 3)
const STAR = '<svg class="rstar" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg><i class="rsp a"></i><i class="rsp b"></i>';
function rateSt() { let r = {}; try { r = JSON.parse(localStorage.getItem('dm-rate-improv') || '{}'); } catch (e) {} if (!r.first) { r.first = Date.now(); rateSave(r); } return r; }
function rateSave(r) { try { localStorage.setItem('dm-rate-improv', JSON.stringify(r)); } catch (e) {} }
function rateUrl() { const me = (typeof BOOK_ID !== 'undefined') ? BOOK_ID : MODE, b = MORE_BOOKS.find(x => x.id === me); if (!b || !b.asin) return null;
  const st = amazonStore(), asin = (b.asinIntl && st.s !== 'us' && st.s !== 'ca') ? b.asinIntl : b.asin; return 'https://www.' + st.dom + '/review/create-review?asin=' + asin; }
function rateCss() { if (document.getElementById('rtcss')) return; const c = document.createElement('style'); c.id = 'rtcss';
  c.textContent = '@keyframes rshine{0%,100%{transform:scale(1) rotate(0);filter:drop-shadow(0 0 3px #ffd34d)}50%{transform:scale(1.12) rotate(8deg);filter:drop-shadow(0 0 10px #ffd34d)}}@keyframes rtw{0%,100%{opacity:0;transform:scale(.3) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}' +
    '.rs{position:relative;width:46px;height:46px;flex:none;display:grid;place-items:center}.rstar{width:40px;height:40px;fill:#ffc83d;stroke:#fff3c4;stroke-width:.8;animation:rshine 2.4s ease-in-out infinite}' +
    '.rsp{position:absolute;width:9px;height:9px;background:#fff3c4;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:rtw 2.4s ease-in-out infinite}.rsp.a{top:0;right:2px;animation-delay:.3s}.rsp.b{bottom:3px;left:0;animation-delay:1.2s}' +
    '.rcard{border:1px solid var(--accent);border-radius:14px;padding:14px;background:var(--panel);display:grid;gap:12px;margin-bottom:6px}.rcard .rt{display:flex;gap:12px;align-items:flex-start}.rcard b{font:700 19px var(--display)}.rcard p{margin:3px 0 0;color:var(--muted);font-size:14px}' +
    '.rcard .rb{display:flex;gap:8px;flex-wrap:wrap}.rcard .rb a{flex:1;justify-content:center;text-decoration:none;min-height:44px}.rcard .rb button{min-height:44px}.rrow{display:flex;gap:12px;align-items:center;margin-top:12px;border-top:1px solid var(--line);padding-top:12px;text-decoration:none;color:inherit}.rrow .rs{width:34px;height:34px}.rrow .rstar{width:28px;height:28px}.rrow span{display:grid;gap:2px}.rrow small{color:var(--muted)}';
  document.head.appendChild(c); }
function rateCard() { const url = rateUrl(); if (!url) return ''; const r = rateSt(), force = /[?&]rate=1/.test(location.search); if (r.final && !force) return '';
  const chs = Object.values(LIB).filter(c => !c.demo && !c.lib).length, now = Date.now();
  if (r.done && !r.doneAt) { r.doneAt = now; rateSave(r); }
  // 1.ª vez: al tener el primer capítulo. «Not now»: otra vez a los 3 capítulos o a los 2 días (máx. 3). Tras «Rate»/«I already did»: una última vez al mes.
  const due = force || (r.done ? now > r.doneAt + 30 * 864e5 : !r.n ? chs >= 1 : (r.n < 3 && (now > (r.snooze || 0) || chs >= Math.max(3, (r.chAt || 0) + 2))));
  if (!due) return ''; rateCss(); rate5Css();
  const st5 = [0, 1, 2, 3, 4].map(i => `<svg class="s5" style="animation-delay:${i * 0.12}s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>`).join('');
  return `<div class="rcard r5" id="rcard"><b>Enjoying the book?</b>
    <a class="stars5" id="rgo" href="${url}" target="_blank" rel="noopener" aria-label="Rate this book on Amazon">${st5}</a>
    <p>Rate it on Amazon: <b>just tap the stars</b>. It takes 10 seconds, no need to write anything.</p>
    <small>Every rating helps a small independent author keep making books and apps like this one. Thank you!</small>
    <a class="btn rbig" id="rgo2" href="${url}" target="_blank" rel="noopener">★ Rate this book</a>
    <div class="rlinks"><button id="rno">Not now</button><span>·</span><button id="rdid">I already did</button></div></div>`; }
function rate5Css() { if (document.getElementById('r5css')) return; const c = document.createElement('style'); c.id = 'r5css';
  c.textContent = '@keyframes s5in{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.18);opacity:1}100%{transform:scale(1)}}@keyframes s5glow{0%,100%{filter:drop-shadow(0 0 2px #ffd34d)}50%{filter:drop-shadow(0 0 9px #ffd34d)}}' +
    '.r5{text-align:center;justify-items:center}.r5>b{font:700 21px var(--display)}.r5 p{margin:0;font-size:15px}.r5 small{color:var(--muted);font-size:12.5px;max-width:34em}' +
    '.stars5{display:flex;gap:6px;justify-content:center;padding:6px 10px;border-radius:12px;text-decoration:none}.stars5:active{transform:scale(.97)}' +
    '.s5{width:46px;height:46px;fill:#ffc83d;stroke:#fff3c4;stroke-width:.8;animation:s5in .5s ease-out both,s5glow 2.4s ease-in-out 1s infinite}' +
    '.rbig{width:100%;max-width:360px;justify-content:center;text-decoration:none;min-height:54px;font-size:18px;font-weight:700;border-radius:14px;box-shadow:0 4px 18px rgba(255,200,61,.35)}' +
    '.rlinks{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:13px}.rlinks button{background:none;border:0;color:var(--muted);font:inherit;text-decoration:underline;padding:6px 4px;cursor:pointer;min-height:auto}';
  document.head.appendChild(c); }
function rateRow() { const url = rateUrl(); if (!url) return ''; rateCss(); return `<a class="rrow" id="rrow" href="${url}" target="_blank" rel="noopener"><span class="rs">${STAR}</span><span><b>Rate this book on Amazon</b><small>Every review helps us keep making books like this one.</small></span></a>`; }
function wireRate() { const ev = t => { try { if (typeof gcEvt === 'function') gcEvt(MODE + ': review ' + t); } catch (e) {} };
  const done = t => { const r = rateSt(); if (r.done) r.final = 1; else { r.done = 1; r.doneAt = Date.now(); } rateSave(r); ev(t); const c = $('rcard'); if (c) c.remove(); };
  const g = $('rgo'); if (g) g.addEventListener('click', () => done('click'));
  const g2 = $('rgo2'); if (g2) g2.addEventListener('click', () => done('click'));
  const d = $('rdid'); if (d) d.onclick = () => done('already');
  const no = $('rno'); if (no) no.onclick = () => { const r = rateSt(); if (r.done) r.final = 1; else { r.n = (r.n || 0) + 1; r.snooze = Date.now() + 2 * 864e5; r.chAt = Object.values(LIB).filter(c => !c.demo && !c.lib).length; } rateSave(r); ev('not now'); const c = $('rcard'); if (c) c.remove(); };
  const w = $('rrow'); if (w) w.addEventListener('click', () => ev('menu click'));
  if ($('rcard')) ev('card shown' + (rateSt().done ? ' (last try)' : '')); }
// ---------------- afinador por micrófono (guitarra, bajo, ukelele). Todo se analiza en el móvil; no se graba nada.
// Diseño: arco de −50 a +50 cents, nota grande con su octava y el clavijero del instrumento con una etiqueta por cuerda.
const TUN_INST = (typeof BOOK_INST !== 'undefined' && BOOK_INST === 'uke') ? 'uke' : MODE;
// cada cuerda: nombre, octava, MIDI, lado de la etiqueta, fila (y en la imagen) y punta de la clavija (x en la imagen de 1199 de ancho)
const TUN_SETS = {
  guitar: [{id: 'std', label: 'Guitar · Standard', img: 'tuner_guitar.jpg', h: 760, s: [
    ['E', 2, 40, 'L', 373, 312], ['A', 2, 45, 'L', 255, 322], ['D', 3, 50, 'L', 138, 320], ['G', 3, 55, 'R', 138, 875], ['B', 3, 59, 'R', 255, 879], ['E', 4, 64, 'R', 373, 891]]}],
  bass: [{id: 'b4', label: 'Bass · 4 strings', img: 'tuner_bass4.jpg', h: 752, s: [
      ['E', 1, 28, 'L', 441, 258], ['A', 1, 33, 'L', 331, 311], ['D', 2, 38, 'L', 226, 352], ['G', 2, 43, 'L', 123, 392]]},
    {id: 'b5', label: 'Bass · 5 strings', img: 'tuner_bass5.jpg', h: 764, s: [
      ['B', 0, 23, 'L', 505, 241], ['E', 1, 28, 'L', 397, 272], ['A', 1, 33, 'L', 294, 308], ['D', 2, 38, 'L', 190, 344], ['G', 2, 43, 'L', 88, 379]]},
    {id: 'b6', label: 'Bass · 6 strings', img: 'tuner_bass6.jpg', h: 762, s: [
      ['B', 0, 23, 'L', 386, 283], ['E', 1, 28, 'L', 251, 308], ['A', 1, 33, 'L', 122, 314], ['D', 2, 38, 'R', 122, 889], ['G', 2, 43, 'R', 251, 894], ['C', 3, 48, 'R', 386, 917]]}],
  uke: [{id: 'std', label: 'Ukulele · Standard (G C E A)', img: 'tuner_uke.jpg', h: 752, s: [
    ['G', 4, 67, 'L', 340, 327], ['C', 4, 60, 'L', 166, 323], ['E', 4, 64, 'R', 166, 876], ['A', 4, 69, 'R', 340, 872]]}]}[TUN_INST] || null;
let TUN_SET = TUN_SETS ? TUN_SETS[0] : null;
try { const k = localStorage.getItem('dm-tun-' + TUN_INST); if (k && TUN_SETS) TUN_SET = TUN_SETS.find(x => x.id === k) || TUN_SET; } catch (e) {}
const TUN_NAME = {guitar: 'guitar', bass: 'bass', uke: 'ukulele'}[TUN_INST] || 'instrument';
const TUN_NN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
let TUN = null;
function tunCss() { if (document.getElementById('tuncss')) return; const c = document.createElement('style'); c.id = 'tuncss';
  c.textContent = '#tun{position:fixed;inset:0;z-index:60;background:#0d0f16;overflow:auto;color:#f2f2f2}' +
    '#tun .tp{max-width:520px;margin:0 auto;padding:12px 14px 22px;display:grid;gap:8px}' +
    '#tun .th{display:grid;grid-template-columns:44px 1fr 44px;align-items:center}#tun .th b{text-align:center;font:600 26px var(--display)}' +
    '#tun .ib{width:44px;height:44px;border-radius:50%;border:0;background:none;color:#f2f2f2;font-size:24px;cursor:pointer;display:grid;place-items:center}' +
    '#tun .sel{justify-self:center;min-height:44px;padding:0 18px;border-radius:24px;border:1px solid #3a3d47;background:#1a1d26;color:#f2f2f2;font:500 16px var(--body);display:flex;align-items:center;gap:10px}' +
    '#tun select.sel{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:36px;background-image:linear-gradient(45deg,transparent 50%,#ccc 50%),linear-gradient(135deg,#ccc 50%,transparent 50%);background-position:calc(100% - 20px) 50%,calc(100% - 14px) 50%;background-size:6px 6px;background-repeat:no-repeat}' +
    '#tun .mt{width:100%;display:block}#tun .mt text{fill:#bfc2cc;font:500 15px var(--body)}#tun .mt .z{fill:#f2f2f2;font-size:20px}' +
    '#tun .nn{text-align:center;font:800 84px/0.95 var(--display);margin-top:-14px;color:#f2f2f2;transition:color .2s}#tun .nn sub{font-size:.42em;vertical-align:baseline;margin-left:2px}#tun .nn.ok{color:#44e86a;text-shadow:0 0 24px rgba(68,232,106,.35)}' +
    '#tun .st{display:flex;justify-content:center;align-items:center;gap:10px;min-height:30px;font:500 17px var(--body);color:#cfd2da}#tun .st .ck{width:28px;height:28px;border-radius:50%;background:#44e86a;display:none;place-items:center;color:#0d0f16;font-weight:900}#tun .st.ok .ck{display:grid}' +
    '#tun .hs{position:relative;width:100%}#tun .hs img{position:absolute;top:0;height:100%;left:18.52%;width:62.97%;object-fit:cover;-webkit-mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}' +
    '#tun .hs svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}' +
    '#tun .pl{position:absolute;width:13.6%;height:5.6%;min-height:34px;transform:translateY(-50%);border-radius:999px;border:2px solid #8a8d96;background:rgba(13,15,22,.6);color:#f2f2f2;font:500 clamp(15px,4.4vw,24px) var(--display);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;line-height:1}' +
    '#tun .pl sub{font-size:.58em;position:relative;top:.35em;margin-left:1px;line-height:0}#tun .pl.L{left:3.6%}#tun .pl.R{right:3.6%}' +
    '#tun .pl.hint{border-color:#e8c25a;color:#ffe08a;box-shadow:0 0 12px rgba(232,194,90,.45)}#tun .pl.on{border-color:#44e86a;color:#44e86a;box-shadow:0 0 14px rgba(68,232,106,.7),inset 0 0 8px rgba(68,232,106,.3)}' +
    '#tun .tb{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}#tun .tb .btn{min-height:44px}#tun .tb .btn.on{background:var(--accent);color:var(--accent-fg)}' +
    '#tun .tlv{height:4px;border-radius:2px;background:#232632;overflow:hidden;margin:2px 18%}#tun .tlv i{display:block;height:100%;width:0;background:#6b6f7c;transition:width .08s}' +
    '#tun .tmic{justify-self:center;min-height:52px;font-size:17px;padding:0 24px}#tun .tmic[hidden]{display:none}#tun .tst{text-align:center;color:#a9acb6;font-size:14px;min-height:20px;padding:0 8px}#tun .tst small{display:block;margin-top:6px;line-height:1.45}' +
    '.trow{display:flex;gap:12px;align-items:center;margin-top:12px;border-top:1px solid var(--line);padding-top:12px;color:inherit;background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left;cursor:pointer;font:inherit}' +
    '.trow .ti{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:50%;background:var(--accent);color:var(--accent-fg);font-weight:800}.trow span{display:grid;gap:2px}.trow small{color:var(--muted)}' +
    '.backrow{display:flex;justify-content:space-between;gap:8px;align-items:center}';
  document.head.appendChild(c); }
function tunerRow() { return '';   // sin afinador (no está preparado)
 if (!TUN_SETS) return ''; tunCss();
  return `<button class="trow" id="trow"><span class="ti">♪</span><span><b>Tuner</b><small>Tune your ${TUN_NAME} with the microphone.</small></span></button>`; }
function wireTuner() { const t = $('trow'); if (t) t.onclick = openTuner; const b = $('tunb'); if (b) b.onclick = openTuner; }
// detector de altura (YIN): fiable también con el Mi grave del bajo
function tunPitch(buf, sr, fmin, fmax) {
  const N = buf.length; let rms = 0; for (let i = 0; i < N; i++) rms += buf[i] * buf[i]; rms = Math.sqrt(rms / N); if (rms < 0.0015) return null;
  const tMin = Math.floor(sr / fmax), tMax = Math.min(Math.floor(sr / fmin), Math.floor(N / 2) - 1), W = N - tMax - 1;
  const d = new Float32Array(tMax + 2), c = new Float32Array(tMax + 2); c[0] = 1;
  for (let t = 1; t <= tMax + 1; t++) { let s = 0; for (let j = 0; j < W; j++) { const x = buf[j] - buf[j + t]; s += x * x; } d[t] = s; }
  let sum = 0; for (let t = 1; t <= tMax + 1; t++) { sum += d[t]; c[t] = d[t] * t / (sum || 1); }
  let best = -1; for (let t = tMin + 1; t <= tMax; t++) if (c[t] < 0.2 && c[t] <= c[t - 1] && c[t] <= c[t + 1]) { best = t; while (best + 1 <= tMax && c[best + 1] < c[best]) best++; break; }
  if (best < 0) { let mv = 1e9; for (let t = tMin + 1; t <= tMax; t++) if (c[t] < mv) { mv = c[t]; best = t; } if (mv > 0.5) return null; }
  tunPitch.q = c[best]; tunPitch.rms = rms;
  const a = d[best - 1], m = d[best], b = d[best + 1], den = a - 2 * m + b, sh = den ? (a - b) / (2 * den) : 0;
  return sr / (best + Math.max(-1, Math.min(1, sh)));
}
// «ting» corto y agudo (fuera del rango que escucha el afinador); se ignora el micro mientras suena
function tunTing(S) { try { const C = S.ctx || (S.ctx = new (window.AudioContext || window.webkitAudioContext)()); C.resume(); const t = C.currentTime, g = C.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .005); g.gain.exponentialRampToValueAtTime(.0005, t + .7); g.connect(C.destination);
  [[2637, 1], [3951, .35]].forEach(([f, a]) => { const o = C.createOscillator(), gg = C.createGain(); o.frequency.value = f; gg.gain.value = a; o.connect(gg).connect(g); o.start(t); o.stop(t + .75); });
  S.mute = performance.now() + 350; } catch (e) {} }
// pantalla siempre encendida mientras el afinador está abierto
async function tunWake(on) { try { if (on) { if ('wakeLock' in navigator && !(TUN && TUN.wl)) { const w = await navigator.wakeLock.request('screen'); if (TUN) TUN.wl = w; else w.release(); } }
  else if (TUN && TUN.wl) { TUN.wl.release(); TUN.wl = null; } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && TUN) { TUN.wl = null; tunWake(true); } });
// arco del medidor: −50 … +50 cents en 140°
function tunArc() { const cx = 300, cy = 330, r = 250, A = c => (c / 50) * 70 * Math.PI / 180, P = (c, rr) => [cx + rr * Math.sin(A(c)), cy - rr * Math.cos(A(c))];
  let g = ''; const [x0, y0] = P(-50, r), [x1, y1] = P(50, r), [a0, b0] = P(-10, r), [a1, b1] = P(10, r);
  g += `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" fill="none" stroke="#555966" stroke-width="3"/>`;
  g += `<path d="M${a0} ${b0} A${r} ${r} 0 0 1 ${a1} ${b1}" fill="none" stroke="#2f6e3e" stroke-width="5"/>`;
  for (let c = -10; c <= 10; c++) { const [p, q] = P(c, r - 2), [u, v] = P(c, r + 12); g += `<line x1="${p}" y1="${q}" x2="${u}" y2="${v}" stroke="#3fbf5c" stroke-width="${c % 10 ? 3 : 4}" opacity=".75"/>`; }
  for (let c = -50; c <= 50; c += 10) { const [p, q] = P(c, r - 12), [u, v] = P(c, r + 12), [tx, ty] = P(c, r + 40);
    g += `<line x1="${p}" y1="${q}" x2="${u}" y2="${v}" stroke="#8a8d96" stroke-width="3"/><text x="${tx}" y="${ty + 6}" text-anchor="middle" class="${c ? '' : 'z'}">${c > 0 ? '+' + c : c < 0 ? '−' + (-c) : '0'}</text>`; }
  g += `<g id="tunk"><line x1="${cx}" y1="${cy - r - 22}" x2="${cx}" y2="${cy - r + 58}" stroke="currentColor" stroke-width="10" stroke-linecap="round"/></g>`;
  return `<svg class="mt" viewBox="0 18 600 300" aria-hidden="true">${g}</svg>`; }
function tunHead() { const S = TUN_SET, H = S.h, W = 1199;
  const lines = S.s.map(([n, o, m, side, y, px], k) => { const x0 = side === 'L' ? 0.172 * W : 0.828 * W; return `<line id="tunc${k}" x1="${x0}" y1="${y}" x2="${px}" y2="${y}" stroke="#8a8d96" stroke-width="2"/>`; }).join('');
  return `<div class="hs" style="aspect-ratio:${W}/${H}"><img src="${S.img}" alt="" draggable="false"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${lines}</svg>` +
    S.s.map(([n, o, m, side, y], k) => `<button class="pl ${side}" data-s="${k}" style="top:${(y / H * 100).toFixed(2)}%">${n}<sub>${o}</sub></button>`).join('') + '</div>'; }
async function openTuner() { return;
 if (!TUN_SETS) return; tunCss(); try { if (typeof stop === 'function') stop(); } catch (e) {}
  const el = document.createElement('div'); el.id = 'tun';
  const draw = () => {
    el.innerHTML = `<div class="tp" role="dialog" aria-label="Tuner"><div class="th"><span></span><b>Tuner</b><button class="ib" id="tunx" aria-label="Close">✕</button></div>
      ${TUN_SETS.length > 1 ? `<select class="sel" id="tunv">${TUN_SETS.map(x => `<option value="${x.id}"${x === TUN_SET ? ' selected' : ''}>${x.label}</option>`).join('')}</select>` : `<div class="sel">${TUN_SET.label}</div>`}
      ${tunArc()}<div class="nn" id="tunn">–</div><div class="st" id="tunst"><span class="ck">✓</span><span id="tunh">Play an open string</span></div>
      ${tunHead()}<div class="tlv"><i id="tunl"></i></div><div class="tst" id="tuns">The tuner listens with the microphone of your phone.</div>
      <button class="btn tmic" id="tunp">🎤 Turn on the microphone</button>
      <div class="tb"><button class="btn ghost on" id="tuna">Auto</button><button class="btn ghost" id="tunr">Play the note</button></div></div>`; };
  draw(); document.body.appendChild(el);
  const S = TUN = {el, sel: -1, ctx: null, st: null, raf: 0, hist: [], last: 0, x: -50, v: 0, tgt: -50, seen: 0};
  const close = () => { cancelAnimationFrame(S.raf); cancelAnimationFrame(S.spr); try { S.st && S.st.getTracks().forEach(t => t.stop()); } catch (e) {} try { S.ctx && S.ctx.close(); } catch (e) {} try { S.mic && S.mic.close(); } catch (e) {} tunWake(false); el.remove(); TUN = null; };
  const pick = k => { S.sel = k; S.cur = k >= 0 ? k : null; $('tuna').classList.toggle('on', k < 0); paintPills(k >= 0 ? k : null, false); };
  const paintPills = (i, ok) => el.querySelectorAll('.pl').forEach(p => { const me = +p.dataset.s === i; p.classList.toggle('on', me && (ok || S.sel === i)); p.classList.toggle('hint', me && !ok && S.sel !== i);
    const ln = $('tunc' + p.dataset.s); if (ln) ln.setAttribute('stroke', me ? (ok || S.sel === i ? '#44e86a' : '#e8c25a') : '#8a8d96'); });
  const wire = () => { $('tunx').onclick = close; const v = $('tunv');
    if (v) v.onchange = () => { TUN_SET = TUN_SETS.find(x => x.id === v.value) || TUN_SET; try { localStorage.setItem('dm-tun-' + TUN_INST, TUN_SET.id); } catch (e) {}
      const mic = !$('tunp') || $('tunp').hidden; draw(); wire(); S.sel = -1; S.cur = null; S.hist = []; if (mic) { $('tunp').hidden = true; $('tuns').textContent = 'Listening… play one string at a time.'; } };
    el.querySelectorAll('.pl').forEach(p => p.onclick = () => pick(S.sel === +p.dataset.s ? -1 : +p.dataset.s)); $('tuna').onclick = () => pick(-1);
    $('tunr').onclick = refTone; $('tunp').onclick = start; };
  // nota de referencia con muchos armónicos (el altavoz del móvil no da las notas graves; así se reconoce la nota)
  const refTone = () => { if (!S.ctx) S.ctx = new (window.AudioContext || window.webkitAudioContext)(); S.ctx.resume();
    const i = S.sel >= 0 ? S.sel : (S.cur ?? 0), f = 440 * Math.pow(2, (TUN_SET.s[i][2] - 69) / 12), t = S.ctx.currentTime;
    const g = S.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.25, t + .03); g.gain.setTargetAtTime(0, t + 1.6, .3); g.connect(S.ctx.destination);
    const N = 24, re = new Float32Array(N + 1), im = new Float32Array(N + 1); for (let h = 1; h <= N; h++) im[h] = (f * h < 4000 ? 1 / h : 0) * (h === 1 ? 1.5 : 1);
    const o = S.ctx.createOscillator(); o.setPeriodicWave(S.ctx.createPeriodicWave(re, im)); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 2.6); paintPills(i, false); };
  // aguja pesada (muelle muy amortiguado): sube con el sonido y, en silencio, vuelve a su reposo en el extremo izquierdo
  const spring = () => { if (!TUN) return; S.spr = requestAnimationFrame(spring); const live = performance.now() - S.seen < 450; if (!live) S.tgt = -50;
    S.v = S.v * 0.78 + (S.tgt - S.x) * 0.014; S.x += S.v; const k = $('tunk'); if (!k) return;
    const ok = live && S.inTune; k.setAttribute('transform', `rotate(${(Math.max(-55, Math.min(55, S.x)) / 50 * 70).toFixed(2)} 300 330)`);
    k.style.color = ok ? '#44e86a' : live ? '#e8c25a' : '#4a4d58'; k.style.filter = ok ? 'drop-shadow(0 0 8px #44e86a)' : 'none';
    if (!live && S.wasLive) { S.wasLive = false; $('tunn').classList.remove('ok'); $('tunst').classList.remove('ok'); } };
  S.spr = requestAnimationFrame(spring);
  tunWake(true);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  try { if (typeof gcEvt === 'function') gcEvt((TUN_INST === 'uke' ? 'ukulele' : MODE) + ': tuner open'); } catch (e) {}
  const start = async () => { $('tunp').hidden = true; $('tuns').textContent = 'Tap «Allow» when your phone asks.'; try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('no mic'), {name: 'NotSupported'});
    S.st = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: true}});
    if (!TUN) { S.st.getTracks().forEach(t => t.stop()); return; }
    S.mic = new (window.AudioContext || window.webkitAudioContext)(); await S.mic.resume();
    const src = S.mic.createMediaStreamSource(S.st), an = S.mic.createAnalyser(); an.fftSize = TUN_INST === 'bass' ? 8192 : 4096; src.connect(an);
    const buf = new Float32Array(an.fftSize), fmin = TUN_INST === 'bass' ? 28 : TUN_INST === 'uke' ? 200 : 70, fmax = TUN_INST === 'bass' ? 420 : TUN_INST === 'uke' ? 1100 : 1000;
    $('tuns').textContent = 'Listening… play one string at a time.';
    const loop = now => { S.raf = requestAnimationFrame(loop); if (now - S.last < 70) return; S.last = now;
      if (S.mic.state !== 'running') S.mic.resume(); an.getFloatTimeDomainData(buf); let pk = 0; for (let k = 0; k < buf.length; k++) { const v = Math.abs(buf[k]); if (v > pk) pk = v; }
      const lv = $('tunl'); if (lv) lv.style.width = Math.min(100, Math.round(Math.sqrt(pk) * 140)) + '%'; const f = tunPitch(buf, S.mic.sampleRate, fmin, fmax);
      if (!f) { if (pk > 0.02 && !S.hist.length) $('tuns').textContent = 'I hear sound: play one open string and let it ring.'; if (S.hist.length && now - S.seen > 900) { S.hist = []; S.prevM = null; S.sm = null; S.on0 = 0; S.npk = 0; if (now - S.seen > 1500) S.ting = false; } return; }
      let m = 69 + 12 * Math.log2(f / 440);
      // error típico: oír una octava o una quinta por debajo (el Mi agudo como La grave); si la nota anterior encaja con un armónico, se corrige
      if (S.prevM != null && now - S.seen < 600) for (const off of [12, 19.02, 24, -12]) if (Math.abs(m + off - S.prevM) < 0.6) { m += off; break; }
      // nueva pulsación: el volumen sube de golpe. Sus primeros 250 ms suenan algo altos y se ignoran
      const rr = tunPitch.rms; if (!S.hist.length || rr > (S.prr || 0) * 1.8) { if (!S.on0) S.on0 = now; S.npk = rr; } S.prr = rr; S.npk = Math.max(S.npk || 0, rr);
      if (S.on0 && now - S.on0 < 250) { S.seen = performance.now(); S.prevM = m; return; } S.on0 = 0;
      // cola de la nota (por debajo del 15 % de su volumen máximo) o lectura poco clara: no mueven la aguja
      if (rr < S.npk * 0.15 || tunPitch.q > 0.25) { if (S.hist.length) S.seen = performance.now(); return; }
      if (now < (S.mute || 0)) { S.seen = performance.now(); return; }
      // lecturas sueltas que se alejan más de medio semitono de las demás se descartan
      if (S.hist.length >= 3) { const md = S.hist.slice().sort((a, b) => a - b)[S.hist.length >> 1]; if (Math.abs(m - md) > 0.5 && ++S.odd < 3) { S.seen = performance.now(); return; } } S.odd = 0;
      S.seen = performance.now(); S.wasLive = true; S.prevM = m; S.hist.push(m); if (S.hist.length > 9) S.hist.shift();
      const hs = S.hist.slice().sort((a, b) => a - b), q = hs.length > 4 ? Math.floor(hs.length / 4) : 0, mid = hs.slice(q, hs.length - q),
        med = mid.reduce((a, b) => a + b, 0) / mid.length, STR = TUN_SET.s;
      let i = S.sel; if (i < 0) { let bd = 1e9, c = 0; STR.forEach((s, k) => { const dd = Math.abs(med - s[2]); if (dd < bd) { bd = dd; c = k; } });
        // cambia de cuerda solo si la nueva gana varias lecturas seguidas
        if (S.cur == null || S.cur === c) { S.cur = c; S.cand = null; S.cn = 0; } else if (S.cand === c) { if (++S.cn >= 4) { S.cur = c; S.cand = null; S.cn = 0; } } else { S.cand = c; S.cn = 1; }
        i = S.cur; }
      const [nm, oc, target] = STR[i], raw = (med - target) * 100;
      // media suavizada: lenta cerca de la afinación, rápida si giras mucho la clavija o cambias de cuerda
      if (S.smI !== i || S.sm == null || Math.abs(raw - S.sm) > 35) { S.sm = raw; S.ting = false; } else S.sm += (raw - S.sm) * (Math.abs(raw - S.sm) > 12 ? 0.3 : Math.abs(S.sm) < 8 ? 0.07 : 0.14); S.smI = i;
      const cents = S.sm, ok = Math.abs(cents) <= (S.inTune ? 7 : 4); S.inTune = ok;
      // afinada: la aguja se queda quieta en el centro (las pequeñas variaciones se comprimen) y suena un «ting» una vez
      S.tgt = ok ? cents * 0.25 : Math.max(-50, Math.min(50, cents));
      if (ok && !S.ting) { S.ting = true; tunTing(S); } if (Math.abs(cents) > 10) S.ting = false;
      const near = Math.round(med), nn = TUN_NN[((near % 12) + 12) % 12];
      $('tunn').innerHTML = nm + '<sub>' + oc + '</sub>'; $('tunn').classList.toggle('ok', ok); $('tunst').classList.toggle('ok', ok); paintPills(i, ok);
      $('tunh').textContent = ok ? 'In tune' : Math.abs(cents) > 150 ? 'You are playing ' + nn + ' · aim for ' + nm : (cents > 0 ? '+' : '') + Math.round(cents) + ' cents · ' + (cents > 0 ? 'loosen a little' : 'tighten a little');
      $('tuns').textContent = ok ? 'Next string.' : Math.abs(cents) > 150 ? 'Turn the peg slowly towards ' + nm + '.' : cents > 0 ? 'Too high: loosen the string a little.' : 'Too low: tighten the string a little.'; };
    S.raf = requestAnimationFrame(loop);
  } catch (e) { $('tuns').innerHTML = (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? tunHelp() : e.name === 'NotSupported' ? 'This browser cannot use the microphone. Open the app in Chrome or Safari.' : 'Microphone not available: ' + (e.message || e.name); $('tunp').hidden = false; $('tunp').textContent = '🎤 Try again'; } };
  wire();
  // si el permiso ya está dado, empieza sin pedir nada; si está bloqueado, explica cómo quitar el bloqueo
  try { const q = navigator.permissions && await navigator.permissions.query({name: 'microphone'});
    if (q && q.state === 'granted') start(); else if (q && q.state === 'denied') { $('tuns').innerHTML = tunHelp(); $('tunp').textContent = '🎤 Try again'; } } catch (e) {}
}
// cómo desbloquear el micrófono, según el móvil
function tunHelp() { const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), and = /Android/.test(ua);
  const steps = ios ? 'On iPhone: tap <b>aA</b> in the address bar › <b>Website Settings</b> › <b>Microphone</b> › <b>Allow</b>. If you installed the app, open <b>Settings</b> › <b>Safari</b> › <b>Microphone</b> › <b>Allow</b>.'
    : and ? 'On Android: tap the <b>icon left of the address</b> (or ⋮ › <b>Site settings</b>) › <b>Permissions</b> › <b>Microphone</b> › <b>Allow</b>.'
    : 'Click the <b>icon left of the address</b> › <b>Microphone</b> › <b>Allow</b>, then reload the page.';
  return '<span style="color:#f2f2f2">The microphone is blocked for this app.</span><small>' + steps + ' Then tap the button again.</small>'; }

function library() {
  stop(); CH = null;
  const chs = Object.values(LIB).sort((a, b) => (a.lib ? 999 : a.n) - (b.lib ? 999 : b.n));
  const items = chs.map(c => { const n = c.levels.reduce((a, L) => a + L.sections.reduce((x, S) => x + S.patterns.length, 0), 0);
    return `<button class="sec chb" data-n="${c.n}"><span class="sw l${c.lib ? 4 : 2}"></span><span><b>${c.lib ? '' : '<span class="n">' + c.n + '</span> '}${esc(c.title)}${c.demo ? ' <small class="demo">SAMPLE</small>' : ''}</b><span>${n} patterns${c.sub ? ' · ' + esc(c.sub) : ''}</span></span></button>`; }).join('');
  const total = Object.keys(CHAPTERS).filter(k => k !== 'lib' && !(k.endsWith('2') && CHAPTERS[k.slice(0, -1)])).length;
  $('view').innerHTML = `${rateCard()}<h2>Your library</h2>${items ? `<div class="list">${items}</div>` : ''}
    <div class="empty"><svg viewBox="0 0 24 24"><path d="M4 4h5v2H6v3H4V4zm11 0h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm14 3v-3h2v5h-5v-2h3zM8 8h3v3H8V8zm5 0h3v3h-3V8zm-5 5h3v3H8v-3zm5 0h3v3h-3v-3z"/></svg>
    <p class="muted">${Object.values(LIB).filter(c => !c.demo).length ? 'Add more chapters' : 'Add your first chapter'}: point your camera at the code on the <b>first page of any chapter</b> of the book, or tap <b>Scan a code</b>.<br>${Object.values(LIB).filter(c => !c.demo && !c.lib).length} of ${total} chapters added.</p></div>${tunerRow()}${moreBooks()}${rateRow()}`;
  document.querySelectorAll('.chb').forEach(b => b.onclick = () => openLib(+b.dataset.n, 1));
  wireMoreBooks(); wireRate(); wireTuner();
}
function chapterView() { home(); }
// ---------------- vistas
function home() {
  const levels = (CH.levels.length === 1 && CH.levels[0].plain) ? '' : CH.levels.map(L => `<button class="lvb" data-l="${L.n}" aria-pressed="${L.n === LEVEL}"><i class="lvsq l${L.n}"></i>${LVN[L.n]}</button>`).join('') + (CH.more || []).map(n => `<button class="lvb lock" data-lock="${n}" aria-pressed="false" style="opacity:.5"><i class="lvsq l${n}"></i>${LVN[n]} 🔒</button>`).join('');
  const list = CH.levels.find(L => L.n === LEVEL).sections.map(S => `<h3>${esc(S.title)}</h3><div class="list">` +
    S.patterns.map(p => { const i = ALL.findIndex(q => q.num === p.num); return `<button class="sec pat${i === PI ? ' on' : ''}" data-i="${i}"><span class="sw l${LEVEL}"></span><span><b><span class="n">${p.num}</span> ${ttl(p.t)}</b><span>${esc(p.ch.replace(/<\d+/g, '').replace(/\s*\|\s*/g, ' | '))} · ${p.bpm} bpm</span></span></button>`; }).join('') + '</div>').join('');
  $('view').innerHTML = `<div class="backrow"><button class="btn ghost back" id="back">‹ Library</button></div><div class="chtitle"><small>${CH.lib ? 'Extra' : 'Chapter ' + CH.n}</small><h2>${esc(CH.title)}</h2></div><div class="lvbar">${levels}</div><div id="player"></div>${list}`;
  $('back').onclick = () => library(); wireTuner(); tunCss();
  document.querySelectorAll('.lvb.lock').forEach(b => b.onclick = () => toast('To open this level, scan the code at the start of the Intermediate level in the book.'));
  document.querySelectorAll('.lvb:not(.lock)').forEach(b => b.onclick = () => { LEVEL = +b.dataset.l; PI = ALL.findIndex(p => p.lv === LEVEL); stop(); if (IMPV) TPCT = 1; home(); });
  document.querySelectorAll('.pat').forEach(b => b.onclick = () => { const was = playing; stop(); PI = +b.dataset.i; if (IMPV) TPCT = 1; home(); $('player').scrollIntoView({behavior: 'smooth', block: 'start'}); if (was) play(); });
  renderPlayer();
}
const cur = () => ALL[PI];
function sclT(s) { if (!TR || !s) return s; const k = cur().key || 'C'; return s.replace(/(^|[\s(,\/])([A-G][#b]?)(?=$|[\s,)\/:]|m|dim|6|7|9)/g, (m, pre, r) => pre + PIANO.transposeChords(r, k, TR)); }
function keyName() { return PIANO.transposeKey(cur().key || 'C', TR); }
function chan(k, label) { return `<button data-m="${k}" aria-pressed="${!mute[k]}">${label}</button>`; }
function renderPlayer() {
  const P = cur(), T0 = Math.round(P.bpm * TPCT);
  $('player').innerHTML = `${MODE !== 'piano' ? `<div class="views" role="group" aria-label="View">${VIEWS.map(([k, l]) => `<button data-v="${k}" aria-pressed="${VIEW === k}">${l}</button>`).join('')}</div>` : ''}<div class="scorewrap">${P.scl ? `<div class="sclbar"><span>♪</span> <span id="scltx">${esc(sclT(P.scl))}</span></div>` : ''}<div class="score" id="score"></div></div>
  <div class="seekrow"><div class="qbtns"><button id="qmet" aria-pressed="${METRO}" title="Metronome" aria-label="Metronome"><svg viewBox="0 0 24 24"><path d="M9.2 2h5.6l4.6 18.5c.2.8-.4 1.5-1.2 1.5H5.8c-.8 0-1.4-.7-1.2-1.5zM10.6 4l-3.3 14h9.4l-1.2-5-3.6 3.3-1.1-1.1 4.2-3.9L13.4 4z"/></svg></button><button id="qcin" aria-pressed="${COUNTIN}" title="Count-in" aria-label="Count-in"><b>1234</b></button>${MODE === 'guitar' ? `<button id="qtrail" aria-pressed="${TRAIL !== 'off'}" title="Trail on the neck" aria-label="Trail on the neck"><svg viewBox="0 0 24 24"><path d="M3 19c3-1 4-6 7-7s5 3 8 1l1.2-.8.8 1.6-1.2.8c-4 2.6-6.6-1.5-8.5-.8C8 14.6 7.2 19.8 3.6 21z"/><circle cx="19.5" cy="6.5" r="2.8"/></svg></button>` : ''}<button id="qfull" title="Full screen" aria-label="Full screen"><svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg></button></div><div class="seek" id="seek" aria-label="Position and loop"></div></div>
  ${MODE !== 'piano' ? '<div class="chname" id="chname"></div>' : ''}<div class="kbd" id="kbd"></div>
  <div class="transport"><div class="pbtns"><button id="play" aria-label="Play"><svg viewBox="0 0 24 24" id="picon"><path d="M7 4.5v15l13-7.5z"/></svg></button><button id="prst" class="prst" aria-label="Back to start"><svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM19 5v14L9 12z"/></svg></button></div>
  <div style="display:grid;gap:4px;min-width:0"><div class="gnav"><span class="gt"><span class="n">${P.num}</span> ${ttl(P.t)}</span><button id="gprev">‹ Previous</button><button id="gnext">Next ›</button></div>
  <div><span class="bpm"><span id="bpm">${T0}</span> <small><span id="pct">${TPCT !== 1 ? Math.round(TPCT * 100) + '% · ' : ''}</span>bpm${/\/8$/.test(P.meter || '') ? ' (dotted quarter) · ' + P.meter : ''}${P.swing ? ' · swing ' + P.swing + 'ths' : ''}</small></span></div>
  <input type="range" id="tempo" min="30" max="220" value="${T0}" aria-label="Tempo">
  <div class="steps"><button data-f=".5">50%</button><button data-f=".75">75%</button><button data-f=".9">90%</button><button data-f="1">100%</button><button data-d="-4">−4</button><button data-d="4">+4</button></div></div></div>
  <div class="fsrow"><span>Hands</span><div class="fsv" role="group" aria-label="Which hand plays">${[['all', 'All'], ['thumb', 'Thumb (p)'], ['fingers', 'Fingers (i m a)']].map(([k, l]) => `<button data-fsv="${k}" aria-pressed="${FSV === k}">${l}</button>`).join('')}</div>
    <button id="fstrain" class="fstog" aria-pressed="${TRAIN}">Speed trainer</button><button id="fspima" class="fstog" aria-pressed="${PIMA}">p i m a</button><button id="fshand" class="fstog" aria-pressed="${HANDON}">Hand</button>
    <small id="fstxt">${TRAIN ? 'Starts at 50% and adds 5% every time the loop comes round, up to 100%.' : 'Mute the thumb or the fingers and play that part yourself.'}</small></div>
  <div class="keyrow"><span>Key</span><button id="kdn" aria-label="Transpose down">−</button><b id="kname">${esc(keyName())}</b><button id="kup" aria-label="Transpose up">+</button><button id="k0" class="ghostb">Original key</button></div>
  <div class="mix chs">${MODE === 'guitar' ? chan('gt', UKE ? 'Ukulele' : 'Guitar') + chan('dr', 'Drums') + chan('bs', 'Bass') + (hasKeys() ? chan('kb', 'Keys') : '') : MODE === 'bass' ? chan('bs', 'Bass') + chan('dr', 'Drums') + chan('kb', 'Keys') : chan('rh', 'Right hand') + chan('lh', 'Left hand') + chan('dr', 'Drums') + chan('bs', 'Bass')}</div>
  <div class="opts">${MODE !== 'piano' ? '' : `<label><input type="radio" name="snd" value="piano" ${SOUND === 'piano' ? 'checked' : ''}><span>Acoustic piano</span></label><label><input type="radio" name="snd" value="ep" ${SOUND === 'ep' ? 'checked' : ''}><span>Electric piano</span></label>`}<label><input type="checkbox" id="metro" ${METRO ? 'checked' : ''}><span>Metronome</span></label><label><input type="checkbox" id="countin" ${COUNTIN ? 'checked' : ''}><span>Count-in</span></label></div>
  <div class="syncrow"><span>Sync</span><button id="sydn" aria-label="Show the score earlier">−</button><b id="syval">${SYNC > 0 ? '+' : ''}${SYNC} ms</b><button id="syup" aria-label="Show the score later">+</button><small>If the moving bar runs ahead of the sound, press +; if it lags behind, press −.</small></div>
  <p class="tip">${esc(P.tip).replace(/&lt;(\/?)b&gt;/g, '<$1b>')}</p>
  <div class="rail" id="rail" aria-label="Quick controls">
    <button id="rplay" class="rbig" aria-label="Play"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg></button>
    <div class="rrow"><button id="rprev" aria-label="Previous pattern">‹</button><button id="rnext" aria-label="Next pattern">›</button></div>
    <div class="rlab">Tempo</div><div class="rrow"><button id="rtdn" aria-label="Slower">−</button><button id="rtup" aria-label="Faster">+</button></div><div class="rval" id="rbpm"></div>
    <div class="rlab">Key</div><div class="rrow"><button id="rkdn" aria-label="Key down">−</button><button id="rkup" aria-label="Key up">+</button></div><div class="rval" id="rkey"></div>
    ${MODE !== 'piano' ? `<div class="rlab">View</div><div class="rviews">${VIEWS.map(([k, l]) => `<button data-v="${k}" aria-pressed="${VIEW === k}">${{all: 'All', nt: 'N+T', tab: 'TAB', neck: 'Neck'}[k]}</button>`).join('')}</div>` : ''}
    <div class="rmix">${(MODE === 'guitar' ? [['gt', UKE ? 'Uke' : 'Gtr'], ['dr', 'Drm'], ['bs', 'Bass']].concat(hasKeys() ? [['kb', 'Keys']] : []) : MODE === 'bass' ? [['bs', 'Bass'], ['dr', 'Drm'], ['kb', 'Keys']] : [['rh', 'RH'], ['lh', 'LH'], ['dr', 'Drm'], ['bs', 'Bass']]).map(([k, l]) => `<button data-rm="${k}" aria-pressed="${!mute[k]}">${l}</button>`).join('')}</div>
  </div>`;
  LOOP = null; START = 0; PAUSED = false; KLO = 36; KHI = 84; applyView(); drawScore(); drawKbd(); initRail(); drawSeek(); applyView();
  document.querySelectorAll('.views button').forEach(b => b.onclick = () => setView(b.dataset.v));
  const sy = d => { SYNC = Math.max(-300, Math.min(300, SYNC + d)); try { localStorage.setItem('pg-sync', SYNC); } catch (e) {} $('syval').textContent = (SYNC > 0 ? '+' : '') + SYNC + ' ms'; };
  $('sydn').onclick = () => sy(-20); $('syup').onclick = () => sy(20);
  if ($('qtrail')) $('qtrail').onclick = e => { e.stopPropagation(); trailMenu($('qtrail')); };
  $('qfull').onclick = () => setFocus(true); if (document.body.classList.contains('focus')) buildFbar();
  $('score').onclick = () => playing ? pause() : play();
  const setT = (v, f) => { $('tempo').value = v; $('bpm').textContent = $('tempo').value; TPCT = f ? +f : +$('tempo').value / P.bpm; if (Math.abs(TPCT - 1) < .005) TPCT = 1; $('pct').textContent = TPCT !== 1 ? Math.round(TPCT * 100) + '% · ' : ''; };
  $('tempo').oninput = e => setT(e.target.value);
  document.querySelectorAll('.steps button').forEach(b => b.onclick = () => b.dataset.f ? setT(Math.round(P.bpm * b.dataset.f), b.dataset.f) : setT(+$('tempo').value + +b.dataset.d));
  document.querySelectorAll('.mix button[data-m]').forEach(b => { b.onclick = () => { if (b._long) { b._long = false; return; } mute[b.dataset.m] = !mute[b.dataset.m]; b.setAttribute('aria-pressed', !mute[b.dataset.m]); }; holdVol(b, b.dataset.m); });
  volLabels();
  $('play').onclick = () => playing ? pause() : play();
  if ($('prst')) $('prst').onclick = () => { stop(); PAUSED = false; START = LOOP ? LOOP[0] * (NOTES || PIANO.expand(cur(), {tr: TR})).n : 0; markSeek(Math.floor(START / (NOTES || PIANO.expand(cur(), {tr: TR})).n), 0); };
  const mv = d => { const was = playing; stop(); const lst = ALL.filter(p => p.lv === LEVEL); const k = (lst.indexOf(P) + d + lst.length) % lst.length; PI = ALL.indexOf(lst[k]); /* improvisación (20/11/2026): cada ejercicio empieza a su velocidad */ if (IMPV) TPCT = 1; home(); if (was) play(); };
  $('gprev').onclick = () => mv(-1); $('gnext').onclick = () => mv(1);
  const tr = d => { TR = d === 0 ? 0 : Math.max(-6, Math.min(6, TR + d)); if (TR === 6 && d > 0) TR = 6; $('kname').textContent = keyName(); if ($('scltx')) $('scltx').textContent = sclT(P.scl); NOTES = null; drawScore(); };
  $('kdn').onclick = () => tr(-1); $('kup').onclick = () => tr(1); $('k0').onclick = () => tr(0);
  document.querySelectorAll('input[name=snd]').forEach(r => r.onchange = () => { SOUND = r.value; saveOpts(); });
  $('metro').onchange = e => { METRO = e.target.checked; saveOpts(); $('qmet').setAttribute('aria-pressed', METRO); };
  $('countin').onchange = e => { COUNTIN = e.target.checked; saveOpts(); $('qcin').setAttribute('aria-pressed', COUNTIN); };
  $('qmet').onclick = () => { $('metro').checked = !$('metro').checked; $('metro').dispatchEvent(new Event('change')); };
  $('qcin').onclick = () => { $('countin').checked = !$('countin').checked; $('countin').dispatchEvent(new Event('change')); };
  fsWire();
}
let LAY = null, NOTES = null;
// PRUEBA fingerstyle (28/11/2026): qué mano suena, entrenador de velocidad y letras p i m a
let FSV = 'all', TRAIN = false, PIMA = true;
(function () { const c = document.createElement('style'); c.textContent = '.fsrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.fsrow>span{font-weight:700;color:var(--muted);font-size:13px}.fsv{display:flex;gap:4px}.fsv button,.fstog{min-height:36px;padding:6px 10px;border-radius:10px;border:1px solid var(--line,#444);background:transparent;color:inherit;font:600 13px var(--body);cursor:pointer}.fsv button[aria-pressed=true],.fstog[aria-pressed=true]{background:var(--accent);color:#111;border-color:var(--accent)}.fsrow small{flex-basis:100%;color:var(--muted);font-size:12px}'; document.head.appendChild(c); })();

// ---- PRUEBA (28/11/2026): vista de la mano derecha (p i m a) ----
let HANDON = true; const HQ = [];
const HCOL = {p: '#378ADD', i: '#97C459', m: '#EF9F27', a: '#D85A30'}, HX = {p: 128, i: 214, m: 252, a: 290}, HDEF = {p: 1, i: 3, m: 4, a: 5};
const HY = st => 20 + (5 - st) * 24;   // cuerda 0 = Mi grave (abajo) … 5 = Mi agudo (arriba)
const HST = {p: {st: 1, on: 0, pre: 0}, i: {st: 3, on: 0, pre: 0}, m: {st: 4, on: 0, pre: 0}, a: {st: 5, on: 0, pre: 0}}, SV = [0, 1, 2, 3, 4, 5].map(() => ({t: -9, d: .3, c: '#fff'}));
function handFinger(nt, st) { const P = cur(), pf = ((P.pf || {}).gt || '').replace(/[|\s]/g, ''), c = pf[nt.s] || '.';
  if (c === 'p' && st <= 2) return 'p'; if ('ima'.includes(c) && c !== '.' && st >= 3) return c;
  return st <= 2 ? 'p' : st === 3 ? 'i' : st === 4 ? 'm' : 'a'; }
window.__handNote = (t, nt, st, d) => { if (HANDON) HQ.push({t, f: handFinger(nt, st), st, d: Math.max(.22, Math.min(.9, d))}); };
const RHX = {p: 71, i: 79, m: 84.5, a: 90};   // inclinados: i a la izquierda, a a la derecha; el pulgar más hacia el mástil
function rhZone(dy) { const Y = st => 84 - st * dy;
  return ['p', 'i', 'm', 'a'].map(f => `<g class="rhf" id="nf_${f}"><circle cx="${RHX[f]}%" cy="${Y(HST[f].st)}%" r="${f === 'p' ? 9 : 8}" fill="#161514" stroke="${HCOL[f]}" stroke-width="2.2"/><text x="${RHX[f]}%" y="${Y(HST[f].st)}%" text-anchor="middle" dominant-baseline="central" font-weight="700" font-size="11" fill="${HCOL[f]}">${f}</text></g>`).join(''); }
function handSvg() { const str = [0, 1, 2, 3, 4, 5].map(k => `<line x1="10" y1="${HY(k)}" x2="390" y2="${HY(k)}" stroke="#D3D1C7" stroke-width="${2.9 - k * .38}"/>`).join('');
  const fl = ['p', 'i', 'm', 'a'].map(f => `<line id="hl_${f}" x1="345" y1="182" x2="${HX[f]}" y2="${HY(HST[f].st)}" stroke="#B4B2A9" stroke-opacity=".22" stroke-width="${f === 'p' ? 20 : 15}" stroke-linecap="round"/>`).join('');
  const fc = ['p', 'i', 'm', 'a'].map(f => `<g id="hf_${f}"><circle r="${f === 'p' ? 14 : 12}" fill="none" stroke="${HCOL[f]}" stroke-width="2.2"/><text text-anchor="middle" dominant-baseline="central" font-weight="700" font-size="14" fill="${HCOL[f]}">${f}</text></g>`).join('');
  return `<svg viewBox="0 0 400 168" width="100%" role="img" aria-label="Right hand: which finger plucks which string"><rect x="0" y="4" width="400" height="160" rx="12" fill="#1f1e1c"/><circle cx="60" cy="80" r="38" fill="#121110" opacity=".55"/>${str}<g id="hvib"></g>${fl}${fc}</svg>
    <div class="hleg">${['p', 'i', 'm', 'a'].map(f => `<span><i style="background:${HCOL[f]}"></i>${f}</span>`).join('')}<small>Filled = plays now · ring = gets ready</small></div>`; }
function handFrame() { requestAnimationFrame(handFrame); if (!ctx || !HANDON || !$('nf_p') || !FBG) return; const Yp = st => 84 - st * FBG.dy;
  const now = ctx.currentTime - (typeof SYNC === 'number' ? SYNC / 1000 : 0);
  for (const f in HST) HST[f].pre = 0;
  for (let k = HQ.length - 1; k >= 0; k--) { const q = HQ[k];
    if (q.t <= now) { const h = HST[q.f]; h.st = q.st; h.on = q.t + Math.min(q.d, .35); SV[q.st] = {t: q.t, d: q.d, c: HCOL[q.f]}; HQ.splice(k, 1); }
    else if (q.t - now < .2) HST[q.f].pre = 1; else if (q.t - now > 30) HQ.splice(k, 1); }
  for (const f in HST) { const h = HST[f], g = $('nf_' + f); if (!g) continue; const on = now < h.on, c = g.firstChild, tx = c.nextSibling, y = Yp(h.st) + '%';
    c.setAttribute('cy', y); tx.setAttribute('y', y); c.setAttribute('cx', (RHX[f] + (on ? .6 : 0)) + '%'); tx.setAttribute('x', (RHX[f] + (on ? .6 : 0)) + '%');
    c.setAttribute('fill', on ? HCOL[f] : '#161514'); c.setAttribute('stroke-width', on ? 0 : h.pre ? 4.2 : 2.2); c.setAttribute('r', (f === 'p' ? 9 : 8) + (on ? 1.5 : 0)); tx.setAttribute('fill', on ? '#111' : HCOL[f]); }
  SV.forEach((v, st) => { const el = $('s' + st); if (!el) return; const e = now - v.t, act = e >= 0 && e <= v.d;
    if (act) { el.style.stroke = v.c; el.style.opacity = String(1 - .5 * e / v.d); el.classList.add('vibr'); } else if (el.classList.contains('vibr')) { el.style.stroke = ''; el.style.opacity = ''; el.classList.remove('vibr'); } }); }
requestAnimationFrame(handFrame);
(function () { const c = document.createElement('style'); c.textContent = '.shole{fill:#0d0c0b;stroke:#3a3835;stroke-width:1}@keyframes vibr{0%{transform:translateY(0)}25%{transform:translateY(.9px)}75%{transform:translateY(-.9px)}100%{transform:translateY(0)}}.str.vibr{animation:vibr .05s linear infinite}#handv{margin:8px 0 4px}#handv .hleg{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font:600 12px var(--body);color:var(--muted);margin-top:4px}#handv .hleg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:-1px}#handv .hleg small{font-weight:400}'; document.head.appendChild(c); })();
function fsWire() {
  $('fshand').onclick = () => { HANDON = !HANDON; $('fshand').setAttribute('aria-pressed', HANDON); drawFret(); };
  const P = cur(), T = (f) => { const v = Math.round(P.bpm * f); $('tempo').value = v; $('bpm').textContent = v; TPCT = f; $('pct').textContent = f !== 1 ? Math.round(f * 100) + '% · ' : ''; };
  document.querySelectorAll('.fsv button').forEach(b => b.onclick = () => { FSV = b.dataset.fsv; document.querySelectorAll('.fsv button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('fstrain').onclick = () => { TRAIN = !TRAIN; $('fstrain').setAttribute('aria-pressed', TRAIN); $('fstxt').textContent = TRAIN ? 'Starts at 50% and adds 5% every time the loop comes round, up to 100%.' : 'Mute the thumb or the fingers and play that part yourself.'; if (TRAIN) T(.5); };
  $('fspima').onclick = () => { PIMA = !PIMA; $('fspima').setAttribute('aria-pressed', PIMA); drawScore(); };
  window.__fsRamp = () => { if (!TRAIN || TPCT >= 1) return; T(Math.min(1, Math.round((TPCT + .05) * 100) / 100)); };
}
let CHFR = new Map(), ARP = new Map(), FBNF = 13, SYS = [], CURSYS = -1, KEYS = null, FRETS = null, SW = 640, GBASS = null;
// guitarra: trastes (acordes con su forma, notas sueltas por posición) y bajo de acompañamiento (P.bass o la fundamental en cada cambio)
function hasKeys() { try { return !!(CH && CH.levels.some(L => L.sections.some(s => s.patterns.some(q => q.keys)))); } catch (e) { return false; } }
function prepGtr(P) {
  KEYS = null; if (P.keys) try { KEYS = PIANO.expand({ch: P.ch, rh: P.keys, lh: '', bass: '', key: P.key, meter: P.meter, leg: P.kleg || {}, swing: P.swing, lv: P.lv}, {tr: TR}); } catch (e) { KEYS = null; }
  const X = NOTES, L = X.n * X.nb; FRETS = new Map();
  const single = (X.hands.gt || []).filter(n => !n.fr), m = PIANO.tabFrets(single, P.pos, P.lv, UKE ? PIANO.UKSTR : PIANO.GSTR);
  CHFR = new Map();   // acordes con forma: los de la cifra (nt.fr) y los escritos nota a nota (varias notas a la vez)
  for (const nt of X.hands.gt || []) { let fr = nt.fr; const r = m.get(nt);
    if (!fr && r && nt.ps.length > 1) fr = [[r[0], r[1]], ...(r[2] || []).map(e => [e[0], e[1]])];
    if (fr && fr.length > 1) CHFR.set(nt, nt.vfr ? nt.vfr.slice().sort((p, q) => p[0] - q[0]) : fr); FRETS.set(nt, fr || [r].filter(Boolean)); }
  const vfrArp = new Map(); for (const nt of X.hands.gt || []) if (nt.vfr && nt.fr && nt.fr.length === 1) vfrArp.set(nt, nt.vfr.slice().sort((p, q) => p[0] - q[0]));   // ukelele: punteo sobre la forma del acorde
  // arpegios: las notas sueltas de un mismo acorde que caen en cuerdas distintas (una por cuerda, palmo ≤ 4 trastes) forman su forma de acorde
  const LICK = /[bqv]/.test(Object.values(P.art || {}).join(''));
  ARP = new Map(); const segs = X.cs.map((c, k) => [Math.max(0, c.s), k + 1 < X.cs.length ? Math.max(0, X.cs[k + 1].s) : L]);
  for (const [a, z] of segs) { const ns = (X.hands.gt || []).filter(nt => nt.s >= a && nt.s < z && !CHFR.has(nt) && m.get(nt) && !nt.wrapIn);
    if (ns.length < 3) continue; const cnt = new Map();   // en cada cuerda, el traste más tocado forma parte de la forma; el resto son notas de paso
    for (const nt of ns) { const [st, f] = m.get(nt), k = st + '_' + f; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const byS = new Map(); for (const [k, c] of [...cnt.entries()].sort((p, q) => q[1] - p[1])) { const [st, f] = k.split('_').map(Number); if (!byS.has(st)) byS.set(st, f); }
    const inShape = nt => { const [st, f] = m.get(nt); return byS.get(st) === f; }, extra = ns.filter(nt => !inShape(nt)).length;
    const fx = [...byS.values()].filter(f => f > 0);
    if (byS.size < 3 || extra > ns.length * 0.3 || (fx.length && Math.max(...fx) - Math.min(...fx) > 4)) continue;
    let shape = [...byS.entries()].sort((p, q) => p[0] - q[0]);
    if (LICK) continue;   // frases de solo (con bends o vibratos): notas sueltas, sin forma de acorde
    // solo es arpegio si todas las notas de la forma son notas del acorde (si no, es una frase de escala o un riff y se ven notas sueltas)
    try { const k0 = segs.findIndex(sg => sg[0] === a), sym0 = X.cs[k0] && X.cs[k0].sym;
      if (sym0) { const pc = PIANO.parseChord(sym0), rp = r => ({C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11})[r.l] + r.a, r0 = rp(pc.root);
        const pcs = new Set(Object.values(pc.iv).map(v => ((r0 + v[1]) % 12 + 12) % 12)); if (pc.bass) pcs.add(((rp(pc.bass)) % 12 + 12) % 12);
        const G = UKE ? PIANO.UKSTR : PIANO.GSTR;
        const off = shape.filter(([st, f]) => !pcs.has((G[st] + f) % 12)).length; if (off > (shape.length >= 4 ? 1 : 0)) continue; } } catch (e) {}   // con 4 cuerdas o más se admite una nota de adorno (hammer-on sobre el acorde)
    // si las notas caben en la forma normal del acorde (p. ej. el Do abierto), se enseña la forma completa
    try { const k = segs.findIndex(sg => sg[0] === a), sym = X.cs[k] && X.cs[k].sym;
      if (sym) { const V = PIANO.expand({ch: sym, gtr: 'C' + '-'.repeat(X.n - 1), key: P.key || 'C', lv: P.lv || 2, meter: P.meter, inst: P.inst}).hands.gt[0], vf = V && V.fr;
        if (vf && shape.every(([st, f]) => vf.some(q => q[0] === st && q[1] === f))) shape = vf.slice().sort((p, q) => p[0] - q[0]); } } catch (e) {}
    ns.forEach(nt => ARP.set(nt, inShape(nt) ? shape : {shape})); }
  for (const [nt, sh] of vfrArp) ARP.set(nt, sh);
  let b = P.bass; if (!b) { const a = new Array(L).fill('-'); X.cs.forEach(c => { if (c.s >= 0 && c.s < L) a[c.s] = '1'; }); if (a[0] !== '1') a[0] = '1'; b = a.join(''); }
  GBASS = PIANO.expand(Object.assign({}, P, {bass: b, rh: '', lh: '', gtr: ''}), {tr: TR}).hands.bs || [];
}
// bajo: digitación (para el mástil) y teclado de acompañamiento (P.keys o un acorde sostenido en cada cambio)
function prepBass(P) {
  if (MODE === 'guitar') return prepGtr(P);
  if (MODE !== 'bass') return; const X = NOTES, L = X.n * X.nb;
  FRETS = PIANO.tabFrets(X.hands.bs || [], P.pos, P.lv);
  let k = P.keys;
  if (!k) { const a = new Array(L).fill('-'); X.cs.forEach(c => { if (c.s >= 0 && c.s < L) a[c.s] = 'T'; }); if (a[0] !== 'T') a[0] = 'T'; k = a.join(''); }
  KEYS = PIANO.expand(Object.assign({}, P, {rh: k, lh: '', bass: ''}), {tr: TR});
}
// barra de posición: tocar un compás = ir ahí; arrastrar por varios compases = repetir esa zona en bucle
function seekTo(bar) {
  const X = NOTES || PIANO.expand(cur(), {tr: TR}), bn = X.n; START = bar * bn;
  if (playing && ctx) { voices.forEach(v => { try { v.stop(); } catch (e) {} }); voices = []; visQ = []; cin = 0; POS = START; WRAPPED = false; CRASH1 = true; nextT = ctx.currentTime + 0.06; }
  markSeek(bar, 0);
  if (PAGE) { const k = SYS.findIndex(L => bar >= L.bars[0] && bar < L.bars[1]); if (k >= 0 && (k < PAGE[0] || k >= PAGE[1])) pageFrom(k); }
}
function drawSeek() {
  const box = $('seek'); if (!box) return; const X = NOTES || PIANO.expand(cur(), {tr: TR}), nb = X.nb;
  let h = '<div class="sbars">'; for (let b = 0; b < nb; b++) h += `<div class="sc${LOOP && b >= LOOP[0] && b < LOOP[1] ? ' lp' : ''}" data-b="${b}"><i></i><span>${b + 1}</span></div>`;
  h += '</div>' + (LOOP ? `<button class="sclr" id="sclr" aria-label="Stop looping">Loop ${LOOP[0] + 1}–${LOOP[1]} ✕</button>` : '<span class="shint">Tap a bar to jump · hold bars to loop them (hold again to clear)</span>');
  box.innerHTML = h; markSeek(Math.floor(START / X.n), 0);
  if ($('sclr')) $('sclr').onclick = () => { LOOP = null; drawSeek(); };
  const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest && el.closest('.sc'); return c ? +c.dataset.b : null; };
  let a = null, drag = false, lp = null, longDone = false; const bars = box.querySelector('.sbars');   // pulsación larga = bucle de ese compás
  bars.oncontextmenu = e => e.preventDefault();
  bars.onpointerdown = e => { a = cellAt(e); drag = false; longDone = false; clearTimeout(lp); if (a === null) return; bars.setPointerCapture(e.pointerId);
    const b0 = a; lp = setTimeout(() => { if (drag || a !== b0) return; longDone = true; try { navigator.vibrate && navigator.vibrate(25); } catch (er) {}
      // sin bucle: ese compás · fuera del bucle: se amplía hasta él · dentro del bucle: se quita el bucle
      if (!LOOP) LOOP = [b0, b0 + 1]; else if (b0 >= LOOP[0] && b0 < LOOP[1]) LOOP = null; else LOOP = [Math.min(LOOP[0], b0), Math.max(LOOP[1], b0 + 1)];
      drawSeek(); if (LOOP) seekTo(LOOP[0]); }, 550); };
  bars.onpointermove = e => { if (a === null || longDone) return; const b = cellAt(e); if (b === null || (b === a && !drag)) return; drag = true; clearTimeout(lp);
    const lo = Math.min(a, b), hi = Math.max(a, b); bars.querySelectorAll('.sc').forEach(c => c.classList.toggle('lp', +c.dataset.b >= lo && +c.dataset.b <= hi)); };
  bars.onpointerup = e => { clearTimeout(lp); if (a === null) return; if (longDone) { a = null; longDone = false; return; } const b = cellAt(e); const end = b === null ? a : b;
    if (drag) { LOOP = [Math.min(a, end), Math.max(a, end) + 1]; drawSeek(); seekTo(LOOP[0]); }
    else { if (LOOP && (a < LOOP[0] || a >= LOOP[1])) LOOP = null; drawSeek(); seekTo(a); }
    a = null; drag = false; };
  bars.onpointercancel = () => { clearTimeout(lp); a = null; drag = false; if (!longDone) drawSeek(); longDone = false; };
}
function markSeek(bar, frac) { const box = $('seek'); if (!box) return; box.querySelectorAll('.sc').forEach(c => { const on = +c.dataset.b === bar; c.classList.toggle('cur', on); c.querySelector('i').style.width = on ? (frac * 100).toFixed(1) + '%' : '0'; }); }
// volumen por canal: mantener pulsado Guitar / Bass / Drums (o Gtr / Bass / Drm en la barra lateral) abre un control de volumen
const CHN = {gt: 'Guitar', dr: 'Drums', bs: 'Bass', kb: 'Keys', rh: 'Right hand', lh: 'Left hand'};
function volLabels() { document.querySelectorAll('[data-m],[data-rm]').forEach(b => { const k = b.dataset.m || b.dataset.rm; let t = b.querySelector('.vl'); const v = Math.round(vf(k) * 100);
  if (v === 100) { if (t) t.remove(); return; } if (!t) { t = document.createElement('small'); t.className = 'vl'; b.appendChild(t); } t.textContent = v + '%'; }); }
function holdVol(b, k) { let tm = null;
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('pointerdown', () => { clearTimeout(tm); tm = setTimeout(() => { b._long = true; try { navigator.vibrate && navigator.vibrate(25); } catch (e) {} openVol(b, k); }, 500); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(tm))); }
function openVol(b, k) {
  document.querySelectorAll('.volpop').forEach(x => x.remove());
  const r = b.getBoundingClientRect(), pop = document.createElement('div'); pop.className = 'volpop';
  pop.innerHTML = `<div class="vh"><b>${CHN[k] || k}</b><span id="vval">${Math.round(vf(k) * 100)}%</span></div><input type="range" min="0" max="150" step="5" value="${Math.round(vf(k) * 100)}" aria-label="${CHN[k] || k} volume"><div class="vb"><button data-v="0">0</button><button data-v="50">50</button><button data-v="100">100</button><button data-v="150">150</button><button class="vok">OK</button></div>`;
  document.body.appendChild(pop);
  const W = pop.offsetWidth, H = pop.offsetHeight; let x = r.left + r.width / 2 - W / 2, y = r.top - H - 8; if (y < 6) y = r.bottom + 8;
  pop.style.left = Math.max(6, Math.min(innerWidth - W - 6, x)) + 'px'; pop.style.top = Math.max(6, Math.min(innerHeight - H - 6, y)) + 'px';
  const set = v => { VOL[k] = v / 100; pop.querySelector('input').value = v; $('vval').textContent = v + '%'; volLabels(); if (v > 0 && mute[k]) { mute[k] = false; document.querySelectorAll(`[data-m="${k}"],[data-rm="${k}"]`).forEach(x => x.setAttribute('aria-pressed', 'true')); } };
  pop.querySelector('input').oninput = e => set(+e.target.value);
  pop.querySelectorAll('[data-v]').forEach(x => x.onclick = () => set(+x.dataset.v));
  const close = () => { pop.remove(); document.removeEventListener('pointerdown', out, true); };
  const out = e => { if (!pop.contains(e.target)) close(); };
  pop.querySelector('.vok').onclick = close; setTimeout(() => document.addEventListener('pointerdown', out, true), 0);
}
// pantalla completa: solo partitura, barra de compases y mástil/teclado; una barra flotante para tocar y volver a las funciones
function setFocus(on) {
  document.body.classList.toggle('focus', on);
  try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) {}
  const fb = document.querySelector('body > .fbar'); if (fb) fb.remove(); if (on) buildFbar();
  setTimeout(() => { if ($('score')) drawScore(); if ($('player')) $('player').scrollIntoView({block: 'start'}); }, 120);
}
function buildFbar() {
  document.querySelectorAll('body > .fbar').forEach(x => x.remove());
  const fb = document.createElement('div'); fb.className = 'fbar';
  fb.innerHTML = '<button class="fprst" aria-label="Back to start"><svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM19 5v14L9 12z"/></svg></button><button class="fplay" aria-label="Play"></button><button class="fexit" aria-label="Exit full screen"><svg viewBox="0 0 24 24"><path d="M10 4v6H4V8h4V4zm4 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/></svg><span>Controls</span></button>';
  document.body.appendChild(fb);
  fb.querySelector('.fplay').onclick = () => { $('play') && $('play').click(); syncFbar(); };
  fb.querySelector('.fprst').onclick = () => { $('prst') && $('prst').click(); syncFbar(); };
  fb.querySelector('.fexit').onclick = () => setFocus(false);
  syncFbar();
}
function syncFbar() { const b = document.querySelector('body > .fbar .fplay'); if (!b) return;
  b.innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>'; }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('focus')) setFocus(false); });
setInterval(() => { syncFbar(); if (document.body.classList.contains('focus') && !$('player')) setFocus(false); }, 300);
// barra lateral compacta (solo móvil en horizontal): los controles principales sin bajar la página
let RAILT = null;
function syncRail() { if (!$('player') || !$('player').innerHTML) { const r = $('rail'); if (r) r.remove(); document.body.classList.remove('hasrail'); }
  if (!$('rail')) { clearInterval(RAILT); RAILT = null; return; }
  $('rbpm').textContent = $('bpm') ? $('bpm').textContent + ' bpm' : ''; $('rkey').textContent = $('kname') ? $('kname').textContent : '';
  $('rplay').innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  document.querySelectorAll('#rail [data-rm]').forEach(b => b.setAttribute('aria-pressed', !mute[b.dataset.rm])); volLabels(); }
function initRail() {
  document.querySelectorAll('body > .rail').forEach(r => r.remove()); const rl = $('rail'); if (rl) { document.body.appendChild(rl); document.body.classList.add('hasrail'); }   // fuera de la tarjeta: fijo al borde de la pantalla
  const go = (id, sel) => { const el = sel ? document.querySelector(sel) : $(id); if (el) el.click(); syncRail(); };
  $('rplay').onclick = () => go('play'); $('rprev').onclick = () => go('gprev'); $('rnext').onclick = () => go('gnext');
  $('rtdn').onclick = () => go(null, '.steps [data-d="-4"]'); $('rtup').onclick = () => go(null, '.steps [data-d="4"]');
  $('rkdn').onclick = () => go('kdn'); $('rkup').onclick = () => go('kup');
  document.querySelectorAll('.rviews button').forEach(b => b.onclick = () => setView(b.dataset.v));
  document.querySelectorAll('#rail [data-rm]').forEach(b => { b.onclick = () => { if (b._long) { b._long = false; return; } go(null, `.mix button[data-m="${b.dataset.rm}"]`); }; holdVol(b, b.dataset.rm); });
  syncRail(); if (!RAILT) RAILT = setInterval(syncRail, 300); }
// si la partitura no cabe (móvil en horizontal), se alinea arriba: centrada se cortaría la primera línea
function fitTop() { const box = $('score'); if (!box || PAGE) return; box.style.alignContent = ''; const svg = box.querySelector('svg'); if (svg) { svg.style.width = ''; svg.style.margin = ''; }
  requestAnimationFrame(() => {
    // una línea completa (pentagrama + las 6 cuerdas de TAB) tiene que caber: si no, se reduce la partitura lo justo
    if (svg && SYS.length && getComputedStyle(box).maxHeight !== 'none') { const sc = svg.clientWidth / (SW + 8), hMax = Math.max(...SYS.map(L => L.H)) * sc + 6, room = box.clientHeight - 6;
      if (hMax > room && room > 60) { svg.style.width = Math.max(55, room / hMax * 100).toFixed(1) + '%'; svg.style.margin = '0 auto'; } }
    if (box.scrollHeight > box.clientHeight + 2) { box.style.alignContent = 'start'; box.scrollTop = 0; } }); }
let RSZ = null; addEventListener('resize', () => { clearTimeout(RSZ); RSZ = setTimeout(() => { if ($('score') && !playing) drawScore(); }, 250); });
// pasa de línea sola: si no caben todos los pentagramas (móvil en horizontal), muestra el que está sonando y el siguiente
function follow(k) {
  if (k === CURSYS) return; CURSYS = k; if (!PAGE) return;
  if (k < PAGE[0] || k >= PAGE[1]) pageFrom(k);
}
function drawScore() { const _P = cur(), _pf = _P && _P.pf; if (_pf && !PIMA) delete _P.pf; try { return drawScore0(); } finally { if (_pf) _P.pf = _pf; } }
function drawScore0() {
  const P = cur(); const narrow = MODE !== 'bass' && innerWidth < 700, foc = document.body.classList.contains('focus') && innerWidth < innerHeight, W = narrow ? (MODE === 'piano' ? (foc ? 340 : 400) : (foc ? 400 : 470)) : 640;   // pantalla completa en vertical: aún más grande   // guitarra y piano en móvil vertical: 2 compases por línea, más grandes
  SW = W;
  SYS = (MODE === 'bass' ? PIANO.systemsBass : MODE === 'guitar' ? PIANO.systemsGtr : PIANO.systems)(P, Object.assign({W, sp: 5.6, tr: TR}, MODE !== 'bass' ? {big: true} : {}, MODE !== 'piano' && VIEW === 'tab' ? {rhythm: true} : MODE !== 'piano' && VIEW === 'neck' ? {rhythmOnly: true} : {}, narrow ? {per: 2, forcePer: MODE === 'piano' ? 2 : undefined} : {}, MODE !== 'piano' && VIEW === 'neck' ? {per: 4} : {})); LAY = SYS[0];
  NOTES = PIANO.expand(P, {tr: TR}); prepBass(P); if (MODE !== 'piano') drawFret(); else if ($('kbd')) drawKbd();
  PAGE = null; PAGEH = 0; if ($('score')) $('score').style.height = ''; showSystems(0, SYS.length);
  // si no cabe todo, se pasa a páginas: solo las líneas que caben enteras (pentagrama + TAB), empezando por la que suena
  requestAnimationFrame(() => { const box = $('score'); if (box && box.scrollHeight > box.clientHeight + 4) pageFrom(0); });
}
let PAGE = null, PAGEH = 0;   // [primera, última+1] líneas visibles cuando la partitura va por páginas
function showSystems(a, z) {
  let y = 0, g = '';
  SYS.forEach((L, k) => { if (k < a || k >= z) return; L.y = y; g += `<g transform="translate(0 ${y.toFixed(1)})">${PIANO.toSVG(L)}<rect id="ph${k}" x="0" y="0" width="${(L.slotX[L.bars[0] * L.n + 1] - L.slotX[L.bars[0] * L.n]).toFixed(1)}" height="${L.H.toFixed(1)}" rx="3" class="ph" visibility="hidden"/></g>`; y += L.H + 4; });
  const box = $('score'); box.innerHTML = `<svg viewBox="-4 0 ${SW + 8} ${Math.max(1, y - 4).toFixed(1)}" width="100%" role="img" aria-label="Score">${g}</svg>`;
  box.style.alignContent = ''; box.scrollTop = 0;
}
function pageFrom(k) {
  const box = $('score'); if (!box) return; const svg0 = box.querySelector('svg'); box.style.alignContent = 'start';
  if (!PAGEH) { PAGEH = box.clientHeight; box.style.height = PAGEH + 'px'; }   // el recuadro no cambia de alto al pasar de página
  const room = PAGEH - 8, wpx = (svg0 ? svg0.parentElement.clientWidth : box.clientWidth) - 16, sc = wpx / (SW + 8);
  let z = k, h = 0; while (z < SYS.length && (z === k || h + (SYS[z].H + 4) * sc <= room)) { h += (SYS[z].H + 4) * sc; z++; }
  PAGE = [k, z]; showSystems(k, z);
  const svg = box.querySelector('svg'); const hh = (h - 4 * sc);
  if (svg && hh > room) { svg.style.width = Math.max(50, room / hh * 100).toFixed(1) + '%'; svg.style.margin = '0 auto'; }
}
// teclado: C2..C6
let KLO = 36, KHI = 84;   // C2–C6 (4 octavas); si suena una nota fuera, el teclado se desplaza hasta ella
// mástil completo (trastes 0–12), siempre visible: las notas del patrón en tenue y la que suena iluminada
const FSK = typeof BOOK_KIND !== 'undefined' && BOOK_KIND === 'fs';   // PRUEBA fingerstyle: mástil corto + mano derecha en la boca
function drawFret() {
  const box = $('kbd'); if (!box) return;
  // mástil: trastes 0–12 como mínimo; si el patrón sube más, se alarga lo necesario (hasta el 24)
  let maxF = FSK ? 4 : 12; if (FRETS) for (const fr of FRETS.values()) if (fr) (Array.isArray(fr[0]) ? fr : [fr]).forEach(q => { if (q && q[1] > maxF) maxF = q[1]; (q && q[2] || []).forEach(e => { if (e[1] > maxF) maxF = e[1]; }); });
  if (NOTES && NOTES.hands.gt) for (const nt of NOTES.hands.gt) if (nt.fr) nt.fr.forEach(q => { if (q[1] > maxF) maxF = q[1]; });
  HSET = new Set(); if (FRETS) for (const [nt, fr] of FRETS) if (nt.art === 'H' && fr) (Array.isArray(fr[0]) ? fr : [fr]).forEach(q => { if (q) HSET.add(q[0] + '_' + q[1]); });   // 21/11/2026: armónicos naturales: círculo sobre el traste
  const NF = Math.min(24, maxF + 1); FBNF = NF; const FD = f => 1 - Math.pow(2, -f / 12), sx = IMPV ? (f => 3 + 94 * FD(f) / FD(NF)) : FSK ? (f => 3 + f * 60 / NF) : (f => 3 + f * 94 / NF); let h = '';   // improvisación (nov 2026): trastes como en una guitarra real, más juntos hacia el puente
  for (let f = 0; f <= NF; f++) h += `<line x1="${sx(f)}%" y1="10%" x2="${sx(f)}%" y2="84%" class="${f ? 'fw' : 'nut'}"/>`;   // los trastes acaban en la primera y la última cuerda
  [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].filter(f => f <= NF).forEach(f => { if (f % 12 === 0) { h += `<circle cx="${sx(f - 0.5)}%" cy="${MODE === 'guitar' && !UKE ? 32 : 22}%" r="3.5" class="fdot"/><circle cx="${sx(f - 0.5)}%" cy="${MODE === 'guitar' && !UKE ? 62 : 72}%" r="3.5" class="fdot"/>`; } else h += `<circle cx="${sx(f - 0.5)}%" cy="47%" r="3.5" class="fdot"/>`; });   // el 12 lleva dos puntos
  const NSx = MODE === 'guitar' && !UKE ? 6 : 4, dy = 74 / (NSx - 1);
  for (let st = 0; st < NSx; st++) h += `<line id="s${st}" x1="${sx(0)}%" y1="${84 - st * dy}%" x2="97%" y2="${84 - st * dy}%" class="str" style="stroke-width:${UKE ? 1.9 : (MODE === 'guitar' ? 2.2 : 2.6) - st * (MODE === 'guitar' ? 0.32 : 0.45)}"/>`;
  const used = new Set(); if (FRETS) for (const [nt, fr] of FRETS.entries()) if (fr && !(GDIAG && (CHFR.has(nt) || ARP.has(nt)))) (Array.isArray(fr[0]) ? fr : [fr]).forEach(q => q && used.add(q[0] + '_' + q[1]));
  for (let st = 0; st < NSx; st++) for (let f = 0; f <= NF; f++) h += `<circle id="f${st}_${f}" cx="${f ? sx(HSET.has(st + '_' + f) ? f : f - 0.5) : 1.5}%" cy="${84 - st * dy}%" r="${(MODE === 'guitar' && !UKE ? 5.5 : 7) * (NF > 16 ? 0.8 : 1)}" class="fn${used.has(st + '_' + f) ? ' used' : ''}"/>`;
  for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].filter(f => f <= NF)) h += `<text x="${sx(f - 0.5)}%" y="100%" text-anchor="middle" class="kl">${f}</text>`;
  if (FSK) h = `<ellipse cx="82%" cy="47%" rx="10%" ry="44%" class="shole"/>` + h;
  if (GDIAG) h += '<g id="chd"></g>';
  if (FSK && HANDON) h += rhZone(dy);
  if (bendv()) h += '<path id="bs_" class="bstr" d="" style="display:none"/><path id="bs_2" class="bstr" d="" style="display:none"/>';
  box.innerHTML = `<svg${IMPV ? ' class="impv"' : ''} width="100%" height="${IMPV ? Math.round(Math.max(84, Math.min(150, (box.clientWidth || innerWidth) * 0.17, innerHeight * 0.22))) : MODE === 'guitar' && !UKE ? 104 : 90}" aria-hidden="true">${h}</svg>`; FBG = {NF, NSx, dy, sx};   // improvisación (nov 2026): el mástil crece si la pantalla tiene sitio (tableta, ordenador)
  if (IMPV && VIEW === 'neck') {   // 20/11/2026: en vista «Neck» con el móvil en vertical el mástil salía casi cuadrado; se limita a ~3,3 veces más largo que alto
    const sv = box.querySelector('svg'), w = box.clientWidth || innerWidth;
    if (sv) { const hh = sv.getBoundingClientRect().height, lim = Math.round(w * 0.3); if (hh > lim) { sv.style.setProperty('height', lim + 'px', 'important'); sv.classList.toggle('slim', lim < 150); } }
  }
  if (GDIAG) showChord([...CHFR.values()][0] || [...ARP.values()].filter(v => Array.isArray(v))[0] || null, 0);
}
// guitarra (prueba): el acorde se ve como diagrama completo en el mástil (cejilla incluida) y late con cada rasgueo
let HSET = new Set();
const IMPV = typeof BOOK_KIND !== 'undefined' && BOOK_KIND === 'improv';
const bendv = () => IMPV || (MODE === 'guitar' && !UKE);   // bends y vibratos dibujados en el mástil (guitarra: improvisación, grooves, fingerstyle)   // improvisación: notas sueltas en el mástil (sin diagramas de acorde)
const GDIAG = MODE === 'guitar' && !IMPV;
function chordFingers(fr) {
  const fx = fr.filter(q => q[1] > 0), opens = fr.some(q => q[1] === 0), minF = fx.length ? Math.min(...fx.map(q => q[1])) : 0;
  const atMin = fx.filter(q => q[1] === minF), sts = atMin.map(q => q[0]);
  let barre = !opens && minF > 0 && atMin.length >= 2 ? [Math.min(...sts), Math.max(...fr.map(q => q[0]))] : null;
  if (barre) { const on = new Set(fr.map(q => q[0])); for (let st = barre[0]; st <= barre[1]; st++) if (!on.has(st)) { barre = null; break; } }   // con una cuerda apagada en medio no es cejilla
  const fing = new Map(); let k = barre ? 2 : 1;
  if (barre) atMin.forEach(q => fing.set(q[0], 1));
  fx.filter(q => !(barre && q[1] === minF)).sort((a, b) => a[1] - b[1] || a[0] - b[0]).forEach(q => fing.set(q[0], Math.min(4, k++)));
  return {barre, minF, fing};
}
function showChord(fr, hit, mute) {
  const g = $('chd'); if (!g) return; const sv = g.ownerSVGElement; if (sv) sv.classList.toggle('chordmode', !!fr); if (!fr) { g.innerHTML = ''; return; }
  const NF = FBNF, NSc = UKE ? 4 : 6, sx = (FBG && FBG.sx) || (f => 3 + f * 94 / NF), dy = 74 / (NSc - 1), Y = st => 84 - st * dy, {barre, minF, fing} = chordFingers(fr);
  const on = new Map(fr.map(q => [q[0], q[1]])); let h = '';
  for (let st = 0; st < NSc; st++) if (!on.has(st)) h += `<text x="1.5%" y="${Y(st) + 2.6}%" text-anchor="middle" class="cx">×</text>`;
  if (barre) h += `<rect x="${sx(minF - 0.5) - 1.15}%" y="${Y(barre[1]) - 4.5}%" width="2.3%" height="${(barre[1] - barre[0]) * dy + 9}%" rx="7" class="cb"/>`;
  for (const [st, f] of on) {
    if (f === 0) { h += `<circle id="cd${st}_0" cx="1.6%" cy="${Y(st)}%" r="4" class="co"/>`; continue; }
    if (barre && f === minF && st !== barre[0] && st !== barre[1]) { h += `<circle id="cd${st}_${f}" cx="${sx(f - 0.5)}%" cy="${Y(st)}%" r="7.5" class="cd bm"/>`; continue; }
    h += `<circle id="cd${st}_${f}" cx="${sx(f - 0.5)}%" cy="${Y(st)}%" r="7.5" class="cd"/><text x="${sx(f - 0.5)}%" y="${Y(st) + 3.4}%" text-anchor="middle" class="cf">${fing.get(st) || ''}</text>`; }
  g.innerHTML = h; g.dataset.sh = JSON.stringify(fr); g.setAttribute('class', hit ? (mute ? 'hit mute' : 'hit') : '');
}
function shiftKbd(m) {
  const on = [...lit.entries()].filter(([, c]) => c > 0).map(([k]) => +k).concat([m]);   // lo que ya suena tiene que seguir viéndose
  const lo = Math.min(...on), hi = Math.max(...on), cLo = lo - (lo % 12), cHi = hi + (12 - hi % 12) % 12;
  if (cHi - cLo > 48) { KLO = cLo; KHI = cHi; }   // muy separadas (mano izquierda muy grave y derecha muy aguda): teclado más ancho
  else if (m < KLO) { KLO = m - (m % 12); KHI = KLO + 48; } else { KHI = m + (12 - m % 12) % 12; KLO = KHI - 48; }
  drawKbd(); for (const [k, c] of lit) if (c > 0) { const el = $('k' + k); if (el) el.classList.add('on'); }
}
function drawKbd() {
  if (MODE !== 'piano') return drawFret();
  const whites = []; for (let m = KLO; m <= KHI; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
  const ww = 100 / whites.length; let h = '';
  whites.forEach((m, i) => h += `<rect class="kw" id="k${m}" x="${(i * ww).toFixed(3)}%" y="0" width="${ww.toFixed(3)}%" height="100%"/>`);
  for (let m = KLO; m <= KHI; m++) if ([1, 3, 6, 8, 10].includes(m % 12)) { const i = whites.indexOf(m - 1); h += `<rect class="kb" id="k${m}" x="${((i + 1) * ww - ww * 0.32).toFixed(3)}%" y="0" width="${(ww * 0.64).toFixed(3)}%" height="62%"/>`; }
  whites.forEach((m, i) => { if (m % 12 === 0) h += `<text x="${(i * ww + ww / 2).toFixed(3)}%" y="92%" text-anchor="middle" class="kl">C${m / 12 - 1}</text>`; });
  $('kbd').innerHTML = `<svg width="100%" height="64" aria-hidden="true">${h}</svg>`;
}

// ---------------- audio
let POS = 0, START = 0, LOOP = null, WRAPPED = false, CRASH1 = true, PAUSED = false, LASTP = -1;   // posición (semicorchea), inicio elegido en la barra, bucle [compás inicial, compás final) y si ya se ha dado la vuelta
let ctx = null, master = null, bufs = {}, INST = {}, loaded = false, playing = false, timer = null, nextT = 0, step = 0, cin = 0, visQ = [], voices = [], rr = {}, openHat = null, WL = null;
function b64buf(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
function onset(buf) { const x = buf.getChannelData(0); for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.02) return Math.max(0, i / buf.sampleRate - 0.002); return 0; }
async function initAudio() {
  if (ctx) return; try { ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'playback'}); } catch (e) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  // limitador suave: evita la saturación (el «chisporroteo») cuando suenan muchas notas a la vez
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2; comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0.42; master.connect(comp);
  // reverberación breve y ligera (poca CPU en móviles)
  const conv = ctx.createConvolver(); const len = Math.floor(ctx.sampleRate * 0.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4); }
  conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.12; conv.connect(wet).connect(master);
  REVIN = ctx.createGain(); REVIN.connect(conv);
  toast('Loading sounds…');
  const jobs = Object.entries(ASSETS.snd).map(([k, v]) => ctx.decodeAudioData(b64buf(v)).then(b => bufs[k] = {b, o: onset(b)}));
  for (const [name, v] of Object.entries(INSTS)) for (const [m, b64] of Object.entries(v.pts)) jobs.push(ctx.decodeAudioData(b64buf(b64)).then(b => { (INST[name] = INST[name] || {})[m] = {b, o: onset(b)}; }));
  await Promise.all(jobs); loaded = true;
}
let REVIN = null; const live = []; const byKey = new Map();
const NV = {hh: 3, ride: 2, kick: 2, snare: 2, ghost: 2, palma: 4, sorda: 3, cjb: 3, cjs: 3, cast: 2};
const G = {hh: 3.4, hhA: 2.2, hho: 3.0, ride: 3.6, crash: .85, snare: .8, snareA: .8, ghost: 1.0, xstick: 1.6, kick: .6, sticks: 1.2, palma: .9, sorda: 1.1, cjb: 1.0, cjs: .8, cast: .7};
function hit(name, t, gain) {
  let key = name; if (NV[name]) { rr[name] = ((rr[name] || 0) + 1) % NV[name]; key = name + '_' + rr[name]; } else if (!name.startsWith('click')) key = name + '_0';
  const B = bufs[key]; if (!B) return null; const s = ctx.createBufferSource(); s.buffer = B.b; const g = ctx.createGain(); g.gain.value = gain;
  s.connect(g).connect(master); s.start(t, B.o); voices.push(s); if (voices.length > 200) voices.shift(); return {s, g};
}
const VOL = {};   // volumen de cada canal (1 = 100 %), se cambia con una pulsación larga en su botón
const vf = k => VOL[k] == null ? 1 : VOL[k];
const play1 = (n, t, v = 1) => hit(n, t, 1.2 * (G[n] || 1) * v * (n === 'sticks' ? 1 : vf('dr')));
function strike(k, ch, t) {
  if (k === 'hh') { if (openHat && openHat.t < t) { openHat.g.gain.setTargetAtTime(0, t, 0.012); openHat = null; } if (ch === 'x') play1('hh', t, .8); else if (ch === 'X') play1('hhA', t); else { const r = play1('hho', t); if (r) openHat = {...r, t}; } }
  else if (k === 'rd') play1('ride', t); else if (k === 'cr') play1('crash', t);
  else if (k === 'bd') play1('kick', t);
  // flamenco: palmas (P fuerte, s sorda), cajón (B grave, S seco), castañuelas (c)
  else if (k === 'pa') { if (ch === 'P') play1('palma', t, .95 + .1 * Math.random()); else play1('sorda', t, .6); }
  else if (k === 'cj') { if (ch === 'B') play1('cjb', t); else play1('cjs', t, ch === 's' ? .45 : .75); }
  else if (k === 'ca') play1('cast', t, ch === 'C' ? 1 : .6);
  else if (k === 'sn') { if (ch === 'c') play1('xstick', t, .9); else if (ch === 'g') play1('ghost', t); else play1(ch === 'A' ? 'snareA' : 'snare', t, .9); }
}
const byStr = new Map(); let gtLive = [], GT_T0 = null;
function note(inst, m, t, dur, lv, from, vib, str, op) {   // op (nov 2026): {rel: soltar el bend, pre: pre-bend que se suelta, vd: retraso del vibrato, leg: ligado sin ataque de púa}
  const P = INST[inst]; if (!P) return; let best = null; for (const k of Object.keys(P)) if (best === null || Math.abs(+k - m) < Math.abs(best - m)) best = +k;
  const B = P[best]; const src = ctx.createBufferSource(); src.buffer = B.b; src.playbackRate.value = Math.pow(2, (m - best) / 12);
  if (from != null) { src.playbackRate.setValueAtTime(Math.pow(2, (from - best) / 12), t); src.playbackRate.linearRampToValueAtTime(Math.pow(2, (m - best) / 12), t + (op && op.slow ? 0.22 : Math.abs(from - m) >= 2 ? 0.14 : 0.07)); }
  if (op && op.rel && from != null) { const tr = t + Math.max(0.2, dur * 0.5); src.playbackRate.setValueAtTime(Math.pow(2, (m - best) / 12), tr); src.playbackRate.linearRampToValueAtTime(Math.pow(2, (from - best) / 12), tr + 0.15); }
  if (op && op.dip) { const k0 = Math.pow(2, (m - best) / 12), k1 = Math.pow(2, (m - 2 - best) / 12), ta = t + Math.min(0.05, dur * 0.2);   // nov 2026 (improv): palanca abajo un tono y vuelta
    src.playbackRate.setValueAtTime(k0, ta); src.playbackRate.linearRampToValueAtTime(k1, ta + Math.min(0.1, dur * 0.3)); src.playbackRate.linearRampToValueAtTime(k0, ta + Math.min(0.24, dur * 0.7)); }
  if (op && op.dive) { const ta = t + Math.min(0.15, dur * 0.2); src.playbackRate.setValueAtTime(Math.pow(2, (m - best) / 12), ta); src.playbackRate.exponentialRampToValueAtTime(Math.pow(2, (m - 14 - best) / 12), t + dur); }   // dive bomb: cae más de una octava
  if (op && op.pre) { const tr = t + Math.min(0.16, dur * 0.35); src.playbackRate.setValueAtTime(Math.pow(2, (m - best) / 12), tr); src.playbackRate.linearRampToValueAtTime(Math.pow(2, (m - 2 - best) / 12), tr + 0.15); }
  const g = ctx.createGain(); if (op && op.dist) { const ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), cv = new Float32Array(1024); for (let j = 0; j < 1024; j++) cv[j] = Math.tanh((j / 511.5 - 1) * 6); ws.curve = cv; lp.type = 'lowpass'; lp.frequency.value = 6500; src.connect(ws); ws.connect(lp); lp.connect(g); } else if (op && op.pm) { /* 22/11/2026: palm mute con distorsión más natural: conserva el ataque brillante y se apaga enseguida (antes un filtro fijo a 900 Hz sonaba a otra distorsión) */ const lp = ctx.createBiquadFilter(), ls = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(1700, t + 0.07); ls.type = 'lowshelf'; ls.frequency.value = 160; ls.gain.value = 4; src.connect(lp); lp.connect(ls); ls.connect(g); } else src.connect(g); g.connect(master); if (!inst.startsWith('bass')) g.connect(REVIN);
  if (op && op.pinch) {   // 20/11/2026: armónico pinch: la nota pisada queda debajo, suave, y por encima chilla el armónico (+19) distorsionado, con vibrato
    const f = 440 * Math.pow(2, (m + 19 - 69) / 12), o = ctx.createOscillator(), ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), og = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; const cv = new Float32Array(1024); for (let j = 0; j < 1024; j++) { const x = j / 511.5 - 1; cv[j] = Math.tanh(x * 4); } ws.curve = cv;
    lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f * 3); lp.Q.value = 2;
    o.connect(ws); ws.connect(lp); lp.connect(og); og.connect(master); og.connect(REVIN);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6; lfo.connect(lg); lg.connect(o.detune); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(35, t + Math.min(0.4, dur * 0.6));
    const L = Math.max(0.3, dur); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(lv * 0.16, t + 0.008); og.gain.setTargetAtTime(lv * 0.11, t + 0.03, 0.08); og.gain.setValueAtTime(lv * 0.11, t + L); og.gain.setTargetAtTime(0, t + L, 0.06);
    o.start(t); lfo.start(t); o.stop(t + L + 0.4); lfo.stop(t + L + 0.4); lv *= 0.4; }
  if (op && op.harm) {   // armónico: la muestra más suave y un seno a la misma altura que suena como una campana
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); o.connect(og); og.connect(master); og.connect(REVIN);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(lv * 0.55, t + 0.006); og.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(0.4, dur * 1.4)); o.start(t); o.stop(t + Math.max(0.45, dur * 1.5)); lv *= 0.45; }
  const rel = inst.startsWith('bass') ? .04 : .09, end = t + dur;
  if (vib && dur > 0.18 && src.detune) {   // vibrato: la nota oscila arriba y abajo (unos 5,5 veces por segundo), entrando poco a poco
    // como en la guitarra, la nota solo sube y vuelve (empujar y soltar la cuerda): detune = A·(1 − cos), igual que el dibujo
    const lfo = ctx.createOscillator(), dg = ctx.createGain(), dc = ctx.createConstantSource ? ctx.createConstantSource() : null, cg = ctx.createGain();
    lfo.frequency.value = VIBHZ; lfo.connect(dg); dg.connect(src.detune); const t0 = t + (op && op.vd ? op.vd : 0.08), t1 = Math.max(t0 + 0.12, t + Math.min(0.35, dur * 0.5));
    const VD = op && op.bar ? 38 : 22; dg.gain.setValueAtTime(0, t); dg.gain.setValueAtTime(0, t0); dg.gain.linearRampToValueAtTime(VD, t1);   // palanca: más ancho y hacia los dos lados
    lfo.start(t0 + 0.25 / VIBHZ); lfo.stop(end + rel * 6);
    if (dc && !(op && op.bar)) { dc.connect(cg); cg.connect(src.detune); cg.gain.setValueAtTime(0, t); cg.gain.setValueAtTime(0, t0); cg.gain.linearRampToValueAtTime(22, t1); dc.start(t); dc.stop(end + rel * 6); } }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + (op && op.swell ? Math.min(0.7, dur * 0.7) : 0.004));                // entrada sin clic (swell: entra poco a poco)
  if (op && op.leg) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 0.012); }   // ligado: sin el golpe de la púa (se salta el ataque de la muestra)
  g.gain.setValueAtTime(lv, end); g.gain.setTargetAtTime(0, end, rel); src.start(t, B.o + (op && op.leg ? 0.03 : 0)); src.stop(end + rel * 6);
  // la misma tecla otra vez: apaga la anterior (como el apagador de un piano)
  const key = inst + m, prev = byKey.get(key);
  if (prev && prev.end > t) { prev.g.gain.cancelScheduledValues(t); prev.g.gain.setTargetAtTime(0, t, 0.015); try { prev.src.stop(t + 0.12); } catch (e) {} }
  const v = {src, g, end: end + rel * 6}; byKey.set(key, v); live.push(v);
  // guitarra: una nota nueva en la misma cuerda apaga la anterior (en una cuerda solo suena una nota a la vez)
  if (str != null && IMPV) { const g0 = GT_T0 != null ? GT_T0 : t; for (const o of gtLive) if (o.t0 < g0 - 0.001 && o.end > t) { o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0, t, 0.012); try { o.src.stop(t + 0.1); } catch (e) {} }
    gtLive = gtLive.filter(o => o.end > t && o.t0 >= g0 - 0.001); v.t0 = g0; gtLive.push(v); }   // improvisación: líneas de una sola voz; solo suenan juntas las notas que empiezan a la vez
  if (str != null) { const ps = byStr.get(str); if (ps && ps !== v && ps.end > t) { ps.g.gain.cancelScheduledValues(t); ps.g.gain.setTargetAtTime(0, t, 0.012); try { ps.src.stop(t + 0.1); } catch (e) {} } byStr.set(str, v); }
  // como mucho 40 voces: las más antiguas se apagan con un fundido rápido
  while (live.length && live[0].end < t) live.shift();
  if (live.length > 40) { const o = live.shift(); o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0, t, 0.02); try { o.src.stop(t + 0.15); } catch (e) {} }
  voices.push(src); if (voices.length > 300) voices.splice(0, 100);
}
const lit = new Map(), HELD = new Map();
// tapping (nov 2026): nota golpeada con la mano derecha (T) seguida de un pull-off en la misma cuerda
function gtNext(nt) { const L = NOTES.hands.gt, i = L.indexOf(nt); return i >= 0 ? L[i + 1] : null; }
function sameStr(a, b) { const fa = FRETS && FRETS.get(a), fb = FRETS && FRETS.get(b); return fa && fb && fa[0] && fb[0] && fa[0][0] === fb[0][0]; }
function tap0(nt) { if (nt.art !== 'T' || !NOTES) return false; const n = gtNext(nt); return !!(n && n.art === 'p' && n.s === nt.s + nt.d && sameStr(nt, n)); }
function isTap(nt) { return tap0(nt); }
function tapCell(nt) { const held = new Set(); let e = nt.s + nt.d, n = gtNext(nt);
  while (n && n.s === e && (n.art === 'p' || n.art === 'h') && sameStr(nt, n)) { const fr = FRETS.get(n)[0]; if (n.art === 'p') held.add(fr[0] + '_' + fr[1]); e = n.s + n.d; n = gtNext(n); }
  return {held, d: e - nt.s}; }
function tapMark(el, on) { const id = 'tm' + el.id; let tx = $(id);
  if (!on) { if (tx) tx.remove(); return; }
  if (!tx) { tx = document.createElementNS('http://www.w3.org/2000/svg', 'text'); tx.id = id; tx.setAttribute('class', 'tapm'); tx.setAttribute('x', el.getAttribute('cx')); tx.setAttribute('y', el.getAttribute('cy')); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('dominant-baseline', 'central'); tx.textContent = 'T'; el.after(tx); } }
function keyOn(m, hand, t, dur) { visQ.push([t, 'k', m, hand, 1]); visQ.push([t + dur * 0.92, 'k', m, hand, 0]); }
let BUSY = null, BUSYN = null;
function busyBeat(b) {      // 4/4X: un pulso con semicorcheas, tresillos o seisillos escritos se toca tal cual (sin swing)
  if (BUSYN !== NOTES) { BUSYN = NOTES; BUSY = new Set(); const all = (NOTES.hands || {}).gt || [];
    for (const nt of all) { const r = nt.s % 12; if (r % 6 !== 0) BUSY.add(Math.floor(nt.s / 12)); } }
  return BUSY.has(b % (NOTES.nb * 4)); }
function schedule() {
  const P = cur(); if (!NOTES) { NOTES = PIANO.expand(P, {tr: TR}); prepBass(P); }
  const M = NOTES.M, bn = NOTES.n, n = bn * NOTES.nb, bpm = +$('tempo').value, s = 60 / bpm / M.beat;
  const DR = P.drum || (CH.drums || {})[P.dr] || null;
  while (nextT < ctx.currentTime + 0.2) {
    if (cin > 0) { const G = M.grp, k = G ? G.length - cin : 0; play1('sticks', nextT, (G ? k === 0 : cin === bn / M.beat) ? 1 : .8); cin--; nextT += (G ? G[k] : M.beat) * s; continue; }   // amalgamas: la cuenta sigue los pulsos (2+2+3…)
    const i = POS, sw = (M.beat === 4 || M.beat === 12) ? (P.swing || 0) : 0, t = nextT + (M.beat === 12 ? (sw === 8 && i % 12 === 6 ? 2 : 0) : (sw === 8 ? [0, .333, .667, .333][i % 4] : sw === 16 ? (i % 2 ? .333 : 0) : 0)) * s;
    // nov 2026: final con la banda. P.fin = paso del golpe final; P.fin = -1: el último ataque de la guitarra (20/11/2026, finales del blues)
    const FIN = P.fin == null ? null : +P.fin >= 0 ? +P.fin : Math.max(...(NOTES.hands.gt || [{s: 0}]).map(q => q.s));
    if (MODE === 'guitar') {
      if (!mute.bs && GBASS) for (const nt of GBASS) if (nt.s === i && !(nt.wrapIn && WRAPPED) && !(FIN != null && nt.s >= FIN && !+P.fin >= 0)) for (const p of nt.ps) note('bassf', p.m, t, (FIN != null && nt.s === FIN ? Math.max(4 * M.beat, n - FIN) : nt.d + (nt.wrap || 0)) * s * 0.95, .55 * (nt.v / 0.85) * vf('bs'));
      if (!mute.bs && GBASS && FIN != null && i === FIN && !(+P.fin >= 0 && GBASS.some(q => q.s === FIN))) {   // el bajo da la tónica del último acorde y la deja sonar
        const c = NOTES.cs.filter(q => q.s <= FIN).pop(), mm = c && /^([A-G])([#b]?)/.exec(c.sym);
        if (mm) { const pc = ({C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11}[mm[1]] + (mm[2] === '#' ? 1 : mm[2] === 'b' ? -1 : 0) + 12) % 12; note('bassf', 40 + (pc - 4 + 12) % 12, t, Math.max(4 * M.beat, n - FIN) * s * 0.95, .6 * vf('bs')); } }
      const tg = (M.beat === 12 && sw === 8 && i % 12 === 6 && busyBeat(Math.floor(i / 12))) ? t - 2 * s : t;   // la guitarra con semicorcheas o tresillos escritos no lleva swing; el acompañamiento sí
      if (!mute.gt) for (const nt of NOTES.hands.gt || []) if (nt.s === i) { const t = tg;
        if (nt.wrapIn && WRAPPED) continue;
        const tone = 'g' + (P.tone || CH.tone || 'clean');
        const PMD = tone !== 'gclean' && !!INST[tone];   // 20/11/2026: palm mute con distorsión (antes usaba la muestra apagada limpia)
        let dur = (nt.d + (nt.wrap || 0)) * s * (nt.d <= 2 ? 0.85 : 0.97);
        if (nt.art === 's' || nt.art === 'a') dur = Math.min(dur, s * 1.2);
        const ghost = nt.art === 'x', palm = nt.art === 'm', acc = (nt.art === '>' || nt.art === 'a' || nt.art === '^') ? 1.3 : 1;
        const lv = .5 / Math.sqrt(Math.max(1, nt.ps.length) * 0.6) * (nt.v / 0.85) * acc * (ghost ? .5 : nt.art === 'h' || nt.art === 'p' ? .85 : 1) * vf('gt');
        const frs = FRETS && FRETS.get(nt) || [];
        let order = nt.ps.map((p, k) => k); if (nt.art === 'U') order.reverse();
        const gap = nt.ps.length > 1 ? (nt.art === 'D' || nt.art === 'U' ? .011 : .006) : 0;
        const prev = nt.art === '/' ? (NOTES.hands.gt[NOTES.hands.gt.indexOf(nt) - 1] || null) : null;
        GT_T0 = t;
        order.forEach((k, j) => { const m = nt.ps[k].m, tt = t + j * gap;
          if (FSV !== 'all' && frs[k]) { const th = frs[k][0] <= 2; if ((FSV === 'thumb') !== th) return; }
          if (frs[k] && window.__handNote) window.__handNote(tt, nt, frs[k][0], dur);
          if (ghost) note('gmute', m, tt, .05, lv * 1.2, null, false, frs[k] ? 'gs' + frs[k][0] : null);
          else { const a = nt.art, bu = (a === 'b' || a === 'W' || a === 'Y') ? 2 : (a === 'q' || a === 'N' || a === 'K') ? 1 : a === 'G' ? 3 : a === 'J' ? 4 : a === 'L' ? 2 : a === 'O' ? (k === 0 ? 2 : 0) : a === 'o' ? (k === 0 ? 1 : 0) : 0;   // nov 2026: bends grandes, tras la cejuela y en double stops (O/o: solo la primera nota)
            const HS = !!INST.gharm && (a === 'H' || a === 'A' || a === 'I');   // 21/11/2026: armónicos con muestras reales (FluidR3 «Guitar Harmonics»)
            if (HS) { const ti = INST[tone] ? tone : 'gclean', ms = m + (a === 'A' ? 12 : a === 'I' ? 19 : 0), dist = tone !== 'gclean';   // con distorsión, también el natural y el artificial
              if (a === 'I') note(ti, m, tt, Math.min(dur, .25), lv * 0.25, null, false, null);   // pinch: el golpe de púa de la nota pisada, corto y bajo
              note('gharm', ms, tt, Math.max(dur, a === 'H' ? 1.2 : 0.3), lv * (dist ? 0.08 : 0.22)   /* 21/11/2026: medido contra la guitarra normal (la distorsión multiplica ~4,4 la muestra) */, null, a === 'I' || nt.art === 'v', frs[k] ? 'gs' + frs[k][0] : null, {dist, vd: a === 'I' ? 0.1 : 0});
            } else note(palm ? (PMD ? tone : 'gmute') : (INST[tone] ? tone : 'gclean'), m + (a === 'A' ? 12 : a === 'I' ? 19 : a === 'c' ? 0.5 : 0), tt, palm ? Math.min(dur, PMD ? .2 : .16) : dur, a === 'I' ? lv * 1.1 : palm && PMD ? lv * 1.15 : lv, bu ? m - bu : a === 'c' ? m : prev ? (prev.ps[k] || prev.ps[0]).m : null, nt.art === 'v' || nt.art === 'W' || nt.art === 'w' || a === 'I', frs[k] ? 'gs' + frs[k][0] : null,
            {rel: nt.art === 'Y', pre: nt.art === 'Z', vd: nt.art === 'W' ? 0.24 : 0, leg: (nt.art === 'h' || nt.art === 'p') && !palm, harm: a === 'H' || a === 'A', pinch: false, pm: palm && PMD, dip: a === 'Q', dive: a === 'R', bar: a === 'w', swell: a === 'F', slow: !!P.bneck && a === '/'}); } }); GT_T0 = null;
        if (bendv() && nt.art === '/' && prev && FRETS) { const pf = FRETS.get(prev) || [];   // slide: el dedo se desliza por la cuerda desde la nota anterior
          frs.forEach(fr => { const q = pf.find(x => x[0] === fr[0]); if (q && q[1] !== fr[1]) visQ.push([t, 'slide', fr[0], q[1], fr[1], Math.max(.18, Math.min(.32, dur * .6))]); }); }
        if (bendv() && nt.art === 'L') frs.forEach(fr => { if (fr[1] > 2) visQ.push([t, 'slide', fr[0], fr[1] - 2, fr[1], 0.16]); });   // slide desde abajo
        if (bendv() && (nt.art === 'v' || nt.art === 'w') && frs[0] && dur > 0.18) visQ.push([t, 'vib', frs[0][0], frs[0][1], Math.max(.1, dur * 0.92)]);
        if (bendv() && 'bqWYZGJOoKc'.includes(nt.art || '#') && frs[0] && frs[0][1] > 0) for (const bf of (nt.art === 'K' ? frs.filter(q => q[1] > 0) : [frs[0]])) visQ.push([t, 'bend', bf[0], bf[1], nt.art === 'c' ? 0.22 : 'qoK'.includes(nt.art) ? 0.5 : nt.art === 'G' ? 1.4 : nt.art === 'J' ? 1.7 : 1, Math.max(.1, dur * 0.92), nt.art === 'Y' ? {rel: Math.max(0.2, dur * 0.5)} : nt.art === 'Z' ? {pre: Math.min(0.16, dur * 0.35)} : null]);
        if (bendv() && nt.art === 'W' && frs[0] && dur > 0.3) visQ.push([t + 0.24, 'vib', frs[0][0], frs[0][1], Math.max(.1, dur * 0.92 - 0.24), 1]);   // bend y vibrato arriba
        if (GDIAG && CHFR.has(nt)) { const cf = CHFR.get(nt); visQ.push([t, 'c', cf, 1, ghost]); visQ.push([t + Math.min(.13, dur * 0.6), 'c', cf, 0]); }
        else if (GDIAG && ARP.has(nt)) { const a = ARP.get(nt), sh = a.shape || a, key = frs[0] ? frs[0][0] + '_' + frs[0][1] : null;   // arpegio: la forma del acorde y cada nota encendida dentro de ella
          visQ.push([t, 'ca', sh]); if (key) { const ev = a.shape ? 'f' : 'cn'; visQ.push([t, ev, key, 1]); visQ.push([t + Math.max(.08, dur * 0.92), ev, key, 0]); } }
        else { if (GDIAG) visQ.push([t, 'cd']); const tap = isTap(nt); for (const fr of frs) { visQ.push([t, 'f', fr[0] + '_' + fr[1], 1, tap ? 'T' : nt.art === 'H' ? 'H' : 0]); visQ.push([t + Math.max(.08, dur * 0.92), 'f', fr[0] + '_' + fr[1], 0]); } }
        if (nt.art === 'h' && frs[0] && FRETS) { const pv = NOTES.hands.gt[NOTES.hands.gt.indexOf(nt) - 1], pf = pv && FRETS.get(pv); if (pf && pf[0] && pf[0][0] === frs[0][0] && pf[0][1] < frs[0][1] && pf[0][1] > 0) { const k = pf[0][0] + '_' + pf[0][1]; visQ.push([t, 'fh', k, 1]); visQ.push([t + Math.max(.08, dur * 0.92), 'fh', k, 0]); } }   // hammer-on: el dedo de abajo se queda puesto
        if (tap0(nt)) { const c = tapCell(nt); for (const k of c.held) { visQ.push([t, 'fh', k, 1]); visQ.push([t + c.d * s, 'fh', k, 0]); } }   // tapping: los dedos de la mano izquierda se quedan puestos mientras dura la figura
      }
    }
    if (MODE !== 'piano' && !mute.kb && KEYS) { const P_ = cur(), ki = MODE === 'guitar' ? (P_.kin || 'ep') : 'ep', kv = MODE === 'guitar' ? (P_.kv || 1) * (ki === 'piano' ? .8 : 1) : 1;
      if (FIN != null && i === FIN && !(KEYS.hands.rh || []).some(q => q.s === FIN)) { const lk = (KEYS.hands.rh || []).filter(q => q.s < FIN).pop();   // final: el teclado repite el último acorde y lo deja sonar
        if (lk) lk.ps.forEach(p => note(ki, p.m, t, Math.max(4 * M.beat, n - FIN) * s * 0.95, .2 / Math.sqrt(lk.ps.length) * 1.4 * kv * vf('kb'))); }
      for (const nt of KEYS.hands.rh || []) if (nt.s === i && !(FIN != null && nt.s > FIN)) { const dur = (FIN != null && nt.s === FIN ? Math.max(4 * M.beat, n - FIN) : nt.d) * s * 0.95; nt.ps.forEach((p, j) => note(ki, p.m, t + (MODE === 'guitar' && ki === 'piano' ? j * .004 : 0), dur, .2 / Math.sqrt(nt.ps.length) * 1.4 * kv * vf('kb'))); } }
    for (const hand of (MODE === 'bass' ? ['bs'] : MODE === 'guitar' ? [] : ['rh', 'lh', 'bs'])) {
      if (mute[hand]) continue; const lst = NOTES.hands[hand]; if (!lst) continue;
      for (const nt of lst) if (nt.s === i) {
        if (nt.wrapIn && WRAPPED) continue;                       // ya suena desde el final de la vuelta anterior
        let dur = (nt.d + (nt.wrap || 0)) * s * (nt.d <= 2 ? 0.85 : 0.97);
        if (nt.art === 's' || nt.art === 'a') dur = Math.min(dur, s * 1.2);
        const inst = hand === 'bs' ? 'bassf' : SOUND;
        const acc = (nt.art === '>' || nt.art === 'a' || nt.art === '^') ? 1.3 : 1;
        const lv = (hand === 'bs' ? .62 : (hand === 'rh' ? .42 : .5) / Math.sqrt(nt.ps.length) * 1.35) * (nt.v / 0.85) * acc * vf(hand);
        for (const g of (nt.gr || [])) note(inst, g.m, t - 0.05, 0.06, lv * 0.8);
        if (MODE === 'bass') {
          const ghost = nt.art === 'x', legato = nt.art === 'h' || nt.art === 'p', slide = nt.art === '/';
          const bl = .7 * (nt.v / 0.85) * acc * vf('bs') * (ghost ? .45 : legato ? .75 : (nt.art === 'T' || nt.art === 'P') ? 1.25 : 1);
          const prev = slide ? lst[lst.indexOf(nt) - 1] : null;
          const binst = INST.bassslap && ((CH && CH.id === 'slap') || P.slap) ? 'bassslap' : 'bassf';   // capítulo de slap: sonido de bajo slap
          for (const p of nt.ps) note(binst, p.m, t, ghost ? Math.min(dur, .06) : dur, bl * (binst === 'bassslap' ? 0.85 : 1), prev ? prev.ps[0].m : null);
          const fr = FRETS && FRETS.get(nt); if (fr) { visQ.push([t, 'f', fr[0] + '_' + fr[1], 1]); visQ.push([t + Math.max(.08, dur * 0.92), 'f', fr[0] + '_' + fr[1], 0]); }
          continue;
        }
        for (const p of nt.ps) { const m = p.m; note(inst, m, t, dur, lv); if (hand !== 'bs') keyOn(m, hand, t, dur); }
      }
    }
    // platillo crash: en el primer tiempo solo al arrancar (o al volver al principio de una forma larga), no en cada compás
    // nov 2026: final con la banda (P.fin = golpe final): en el último compás la batería solo marca los golpes del bajo y para en el acorde final
    const finBar = FIN != null && i >= Math.floor(FIN / bn) * bn;
    if (finBar && DR && !mute.dr) { const hitB = (GBASS || []).some(nt => nt.s === i);
      if (i === FIN) { strike('cr', 'X', t); strike('bd', 'o', t); } else if (hitB && i < FIN) { strike('bd', 'o', t); strike('sn', 'A', t); } }
    if (DR && !mute.dr && !finBar) for (const k of ['hh', 'rd', 'cr', 'sn', 'bd', 'pa', 'cj', 'ca']) { const r = DR[k] || ''; const c = r[i % r.length]; if (!c || c === '.') continue;
      if (k === 'cr' && i % bn === 0 && !(CRASH1 || (i === 0 && NOTES.nb >= 8))) continue;
      strike(k, c, t); }
    CRASH1 = false;
    if (METRO && (M.grp ? M.grp.reduce((a, g) => (a.push(a[a.length - 1] + g), a), [0]).includes(i % bn) : i % M.beat === 0)) hit(i % bn === 0 ? 'click' : 'click2', t, i % bn === 0 ? .4 : .28);
    visQ.push([t, 'p', i]); step++; nextT += s;
    { const la = LOOP ? LOOP[0] * bn : 0, lb = LOOP ? Math.min(LOOP[1], NOTES.nb) * bn : n; POS++; if (POS >= lb || POS < la) { POS = la; WRAPPED = la === 0; if (window.__fsRamp) window.__fsRamp(); } }
  }
}
// sincronía imagen-sonido: lo que se ve se retrasa lo que tarda el sonido en salir por el altavoz (latencia de salida del móvil o del Bluetooth)
let FBG = null, BENDS = [], SLIDES = [];
// slide: un punto encendido viaja por la cuerda desde el traste de salida al de llegada; el de llegada se enciende al final
function slideFrame(now) {
  const sv = document.querySelector('#kbd svg'); if (!sv || !FBG) return;
  for (const sl of SLIDES) {
    const dst = $('f' + sl.st + '_' + sl.f1);
    if (!sl.el) { sl.el = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); sl.el.setAttribute('class', 'fn on'); sl.el.setAttribute('r', dst ? dst.getAttribute('r') : 5.5); sl.el.setAttribute('cy', dst ? dst.getAttribute('cy') : '50%'); sv.appendChild(sl.el); }
    const k = Math.max(0, Math.min(1, (now - sl.t0) / (sl.t1 - sl.t0))), e = k * k * (3 - 2 * k), f = sl.f0 + (sl.f1 - sl.f0) * e;
    sl.el.setAttribute('cx', FBG.sx(f - 0.5) + '%');
    if (dst) dst.style.opacity = k < 1 ? '0' : '';
    const src = $('f' + sl.st + '_' + sl.f0); if (src && now >= sl.t0 && k < 1) src.classList.remove('on');
    if (k >= 1 && sl.el) { sl.el.remove(); sl.done = 1; }
  }
  SLIDES = SLIDES.filter(sl => !sl.done && now < sl.t1 + 1);
}
const VIBHZ = 5.5;
// 22/11/2026 (idea de Álex): rastro de la melodía en el mástil: una cometa que va de la nota anterior a la nueva y se apaga.
// Se elige con el botón junto al metrónomo (por defecto apagado) y la elección se guarda en el móvil.
// cometa: [ancho de la cabeza (× radio), intensidad, brillo (px), color de la cola, color de la cabeza, duración (ms)]
const COMETS = {
  thin: [0.35, 0.85, 2, '#e0b562', '#f3d38a', 1700], soft: [0.55, 0.6, 2, '#e0b562', '#f3d38a', 1700], bright: [0.55, 1, 4, '#e0b562', '#f3d38a', 1700],
  wide: [1.15, 0.6, 3, '#e0b562', '#f3d38a', 1700], widebright: [1.2, 1, 6, '#e0b562', '#f3d38a', 1700], long: [0.7, 1, 4, '#e0b562', '#f3d38a', 3200],
  blue: [0.7, 1, 4, '#3b9cff', '#a8dcff', 1700], glowcomet: [0.55, 1, 4, '#e0b562', '#f3d38a', 1700], white: [0.7, 1, 4, '#cfd6e0', '#ffffff', 1700], fire: [0.8, 1, 5, '#e0442b', '#ffb43c', 1700]};
const TRAILS = [['off', 'Off'], ['thin', 'Comet · thin'], ['soft', 'Comet · soft'], ['bright', 'Comet · bright'], ['wide', 'Comet · wide'],
  ['widebright', 'Comet · wide and bright'], ['long', 'Comet · long tail'], ['glow', 'Afterglow'], ['glowlong', 'Afterglow · long'], ['glowcomet', 'Afterglow + comet'], ['blue', 'Comet · blue'], ['white', 'Comet · white'], ['fire', 'Comet · fire']];
let TRAIL = 'off'; try { const v = localStorage.getItem('pg-trail2'); if (v && TRAILS.some(q => q[0] === v)) TRAIL = v; } catch (e) {}
function haloOn() { return MODE === 'guitar' && TRAIL !== 'off'; }
const GLOW = {glow: [250, 450], glowlong: [500, 700], glowcomet: [250, 450]};   // [ms que la nota sigue encendida, ms que tarda en apagarse]
let LASTH = null, HGN = 0;
const SVGNS = 'http://www.w3.org/2000/svg';
function fadeOut(node, ms, from, extra) { const an = node.animate([{opacity: from}, {opacity: from * 0.6, offset: 0.3}, {opacity: 0}], {duration: ms, easing: 'linear', fill: 'forwards'}); an.onfinish = () => { node.remove(); if (extra) extra.remove(); }; }
function mk(tag, at) { const n = document.createElementNS(SVGNS, tag); for (const k in at) n.setAttribute(k, at[k]); n.style.pointerEvents = 'none'; n.classList.add('ftrail'); return n; }
// nota que empieza: la cometa desde la nota anterior (estrecha y transparente atrás, ancha y brillante en la nota nueva)
function cometTo(el) {
  if (!haloOn() || !el.parentNode) return;
  if (TRAIL in GLOW) { const o = GLW.get(el.id); if (o) { o.remove(); GLW.delete(el.id); } }
  if (!(TRAIL in COMETS)) return;
  let b; try { b = el.getBBox(); } catch (e) { return; }
  const x = b.x + b.width / 2, y = b.y + b.height / 2, r = b.width / 2, now = performance.now(), L = LASTH, par = el.parentNode;
  LASTH = {x, y, t: now};
  if (!L || now - L.t > 2500) return;
  const dx = x - L.x, dy = y - L.y, d = Math.hypot(dx, dy); if (d < r * 0.8) return;
  const ux = dx / d, uy = dy / d, nx = -uy, ny = ux, [cw, co, cg, c1, c2, ms] = COMETS[TRAIL];
  const sv = el.ownerSVGElement, id = 'hg' + (++HGN); let defs = sv.querySelector('defs'); if (!defs) { defs = document.createElementNS(SVGNS, 'defs'); sv.insertBefore(defs, sv.firstChild); }
  const gr = document.createElementNS(SVGNS, 'linearGradient'); gr.setAttribute('id', id); gr.setAttribute('gradientUnits', 'userSpaceOnUse');
  gr.setAttribute('x1', L.x); gr.setAttribute('y1', L.y); gr.setAttribute('x2', x); gr.setAttribute('y2', y);
  gr.innerHTML = `<stop offset="0" stop-color="${c1}" stop-opacity="0"/><stop offset="0.7" stop-color="${c1}" stop-opacity="${0.55 * co}"/><stop offset="1" stop-color="${c2}" stop-opacity="${0.95 * co}"/>`; defs.appendChild(gr);
  const w0 = r * 0.1, w1 = r * cw, pg = mk('polygon', {points: [[L.x + nx * w0, L.y + ny * w0], [x + nx * w1, y + ny * w1], [x - nx * w1, y - ny * w1], [L.x - nx * w0, L.y - ny * w0]].map(q => q.join(',')).join(' '), fill: 'url(#' + id + ')'});
  pg.style.filter = `drop-shadow(0 0 ${cg}px ${c1})`; par.insertBefore(pg, el); fadeOut(pg, ms, 1, gr);
}
// «Afterglow»: al soltar la nota, se queda encendida un momento (igual que cuando suena) y luego se apaga poco a poco
const GLW = new Map();
function haloTrail(el) {
  if (!haloOn() || !(TRAIL in GLOW) || !el.parentNode) return;
  const [hold, fade] = GLOW[TRAIL], g = el.cloneNode(false); g.removeAttribute('id'); g.setAttribute('class', 'fn on ftrail'); g.style.transform = ''; g.style.pointerEvents = 'none';
  const o = GLW.get(el.id); if (o) o.remove();
  el.parentNode.insertBefore(g, el.nextSibling); GLW.set(el.id, g);
  const T = hold + fade, an = g.animate([{opacity: 1}, {opacity: 0.85, offset: hold / T}, {opacity: 0}], {duration: T, easing: 'ease-in', fill: 'forwards'});
  an.onfinish = () => { g.remove(); if (GLW.get(el.id) === g) GLW.delete(el.id); };
}
function trailMenu(btn) {
  const old = $('trailm'); if (old) { old.remove(); return; }
  const m = document.createElement('div'); m.id = 'trailm';
  m.style.cssText = 'position:absolute;z-index:60;background:#1e1c19;border:1px solid #8a7448;border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:4px;box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:200px';
  m.innerHTML = '<div style="color:#c9a25a;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px">Trail on the neck</div>' +
    TRAILS.map(([k, t]) => `<button data-k="${k}" style="text-align:left;padding:9px 12px;border-radius:9px;border:0;font:inherit;font-size:15px;cursor:pointer;background:${k === TRAIL ? '#c9a25a' : 'transparent'};color:${k === TRAIL ? '#121110' : '#f2eadb'}">${k in COMETS ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:${COMETS[k][4]};box-shadow:0 0 ${COMETS[k][2]}px ${COMETS[k][3]}"></span>` : ''}${t}</button>`).join('');
  document.body.appendChild(m); const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px'; m.style.top = (r.bottom + scrollY + 6) + 'px';
  m.onclick = e => { const bt = e.target.closest('button'); const k = bt && bt.dataset.k; if (!k) return; e.stopPropagation(); TRAIL = k; LASTH = null; try { localStorage.setItem('pg-trail2', k); } catch (er) {}
    document.querySelectorAll('.ftrail').forEach(n => n.remove()); GLW.clear(); document.querySelectorAll('#qtrail').forEach(q => q.setAttribute('aria-pressed', TRAIL !== 'off')); m.remove(); };
  setTimeout(() => document.addEventListener('click', function cl(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', cl); } }), 0);
}
// bend: la cuerda se dobla hacia el centro del mástil mientras sube la nota y vuelve al soltarla
function bendFrame(now) {
  BENDS = BENDS.filter(b => now < b.t1 + 0.12); const pth0 = $('bs_'), pth1 = $('bs_2'); if (!FBG || !pth0) return;
  const act = BENDS.filter(b => now >= b.t0), last = act[act.length - 1], grp = last ? act.filter(b => Math.abs(b.t0 - last.t0) < 0.01).slice(-2) : [];   // bend doble (K): las dos cuerdas a la vez
  document.querySelectorAll('#kbd line.str').forEach(l => l.style.opacity = ''); document.querySelectorAll('#kbd .fn').forEach(c => c.style.transform = '');
  pth0.style.display = 'none'; if (pth1) pth1.style.display = 'none';
  grp.forEach((b, i) => bendOne(now, b, i ? pth1 : pth0));
}
function bendOne(now, b, pth) {
  if (!b || !pth) return;
  const sv = pth.ownerSVGElement, W = sv.getBoundingClientRect().width, H = sv.getBoundingClientRect().height, {sx, dy, NSx} = FBG;
  let k, amt;
  if (b.vib) {   // vibrato: la cuerda y el circulito suben y bajan con el sonido (empujar y soltar)
    const a = now - b.t0, ramp = Math.min(1, Math.max(0, (a - 0.08) / 0.27)), down = now > b.t1 ? Math.max(0, 1 - (now - b.t1) / 0.1) : 1;
    k = (0.5 - 0.5 * Math.cos(2 * Math.PI * VIBHZ * Math.max(0, a - 0.08))) * ramp * down; amt = 0.55;
    if (b.base) { k = (b.base + 0.35 * k / 1) * down; amt = 1; } }
  else { const up = b.pre != null ? 1 : Math.min(1, (now - b.t0) / (b.amt >= 1 ? 0.14 : 0.08)), down = now > b.t1 ? Math.max(0, 1 - (now - b.t1) / 0.1) : 1;
    const tr = b.rel != null ? b.rel : b.pre, back = tr != null && now > b.t0 + tr ? Math.max(0, 1 - (now - b.t0 - tr) / 0.15) : 1;
    k = up * down * back; amt = b.amt; }
  const y0 = (84 - b.st * dy) / 100 * H, dir = b.st < (NSx - 1) / 2 ? -1 : 1, off = dir * k * amt * dy / 100 * H * 0.75;
  const xn = sx(0) / 100 * W, xe = 0.97 * W, xf = sx(b.f - 0.5) / 100 * W, xa = sx(b.f) / 100 * W;
  const ln = $('s' + b.st); if (ln) { ln.style.opacity = '0'; pth.style.strokeWidth = ln.style.strokeWidth; }
  pth.setAttribute('d', `M${xn},${y0} L${xf},${y0 + off} L${xe},${y0 + off * 0.55}`); pth.style.display = '';   // nov 2026: la cuerda entera se mueve, en línea recta desde la cejuela hasta el dedo y del dedo hacia el puente (el puente está más allá del mástil dibujado)
  const c = $('f' + b.st + '_' + b.f); if (c) c.style.transform = `translateY(${off}px)`;
}
let SYNC = 0; try { SYNC = +(localStorage.getItem('pg-sync') || 0) || 0; } catch (e) {}   // ajuste fino del usuario, en ms (+ = la imagen más tarde)
const outLat = () => { try { return Math.min(0.35, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)); } catch (e) { return 0; } };
function draw() {
  if (!playing) return; const now = ctx.currentTime - outLat() + 0.012 - SYNC / 1000;
  const due = visQ.filter(e => e[0] <= now).sort((a, b) => a[0] - b[0]); visQ = visQ.filter(e => e[0] > now);
  for (const e of due) {
    if (e[1] === 'p') { LASTP = e[2]; const bar = Math.floor(e[2] / NOTES.n); markSeek(bar, (e[2] % NOTES.n + 1) / NOTES.n); showChName(e[2]); { const kk = SYS.findIndex(L => bar >= L.bars[0] && bar < L.bars[1]); if (kk >= 0) follow(kk); } SYS.forEach((L, k) => { const r = $('ph' + k); if (!r) return;
        const on = bar >= L.bars[0] && bar < L.bars[1]; r.setAttribute('visibility', on ? 'visible' : 'hidden'); if (on) { r.setAttribute('x', (L.slotX[e[2]] - 2).toFixed(1)); follow(k); } }); }
    else if (e[1] === 'f') { const el = $('f' + e[2]); if (el) { if (!e[3] && el.classList.contains('on')) haloTrail(el); if (e[3] && !el.classList.contains('on')) cometTo(el); el.classList.toggle('on', !!e[3]); tapMark(el, e[3] && e[4] === 'T'); const hf = +e[2].split('_')[1];   // 21/11/2026: armónico natural: el círculo encima del traste, no entre trastes
      if (FBG && hf) el.setAttribute('cx', FBG.sx((e[3] ? e[4] === 'H' : HSET.has(e[2])) ? hf : hf - 0.5) + '%'); } }
    else if (e[1] === 'fh') { const el = $('f' + e[2]); if (el) { const c = Math.max(0, (HELD.get(e[2]) || 0) + (e[3] ? 1 : -1)); HELD.set(e[2], c); el.classList.toggle('held', c > 0); } }
    else if (e[1] === 'c') showChord(e[2], e[3], e[4]);
    else if (e[1] === 'ca') { const g = $('chd'); if (g && g.dataset.sh !== JSON.stringify(e[2])) showChord(e[2], 0); if (g) { g.setAttribute('class', 'arp'); const sv = g.ownerSVGElement; if (sv) sv.classList.add('chordmode'); } }
    else if (e[1] === 'cn') { const el = $('cd' + e[2]); if (el) el.classList.toggle('lit', !!e[3]); }
    else if (e[1] === 'bend') BENDS.push(Object.assign({st: e[2], f: e[3], amt: e[4], t0: e[0], t1: e[0] + e[5]}, e[6] || {}));
    else if (e[1] === 'vib') BENDS.push({st: e[2], f: e[3], vib: 1, base: e[5] || 0, t0: e[0], t1: e[0] + e[4]});
    else if (e[1] === 'slide') SLIDES.push({st: e[2], f0: e[3], f1: e[4], t0: e[0], t1: e[0] + e[5]});
    else if (e[1] === 'cd') { const g = $('chd'); if (g && g.innerHTML) g.setAttribute('class', 'dim'); }   // el acorde queda atenuado; solo se ven además las notas que suenan
    else { if (e[4] && MODE === 'piano' && !$('k' + e[2])) shiftKbd(e[2]);
      const el = $('k' + e[2]); if (el) { const c = (lit.get(e[2]) || 0) + (e[4] ? 1 : -1); lit.set(e[2], Math.max(0, c)); el.classList.toggle('on', c > 0); el.classList.toggle(e[3], c > 0); } }
  }
  if (bendv()) { bendFrame(now); slideFrame(now); }
  requestAnimationFrame(draw);
}
async function play() {
  await initAudio(); if (ctx.state === 'suspended') await ctx.resume(); if (!loaded) return;
  if (innerWidth > innerHeight && innerHeight < 620 && $('player')) $('player').scrollIntoView({behavior: 'smooth', block: 'start'});
  document.querySelectorAll('#kbd .on, #kbd .held, #chd .lit').forEach(el => el.classList.remove('on', 'held', 'lit', 'rh', 'lh')); document.querySelectorAll('#kbd .tapm').forEach(el => el.remove()); lit.clear(); HELD.clear();
  NOTES = null; playing = true; step = 0; visQ = []; POS = START; WRAPPED = false; CRASH1 = true; cin = (COUNTIN && !PAUSED) ? (() => { const X = PIANO.expand(cur(), {tr: TR}); return X.M.grp ? X.M.grp.length : X.n / X.M.beat; })() : 0; nextT = ctx.currentTime + 0.08; timer = setInterval(schedule, 25); schedule();
  PAUSED = false; $('picon').innerHTML = '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>'; $('play').setAttribute('aria-label', 'Pause'); requestAnimationFrame(draw);
  try { if ('wakeLock' in navigator && !WL) { WL = await navigator.wakeLock.request('screen'); WL.addEventListener('release', () => WL = null); } } catch (e) {}
}
// pausa: se para el sonido y todo se queda como está (partitura, compás, acorde y nota en el mástil); el play sigue desde ahí
function pause() {
  if (!playing) return; playing = false; clearInterval(timer); voices.forEach(v => { try { v.stop(); } catch (e) {} }); voices = []; openHat = null; visQ = [];
  live.length = 0; byKey.clear(); try { WL && WL.release(); WL = null; } catch (e) {}
  const n = NOTES ? NOTES.n * NOTES.nb : 0; if (n && LASTP >= 0) { const la = LOOP ? LOOP[0] * NOTES.n : 0, lb = LOOP ? LOOP[1] * NOTES.n : n; START = LASTP + 1; if (START >= lb || START < la) START = la; }
  // lo que suena justo en ese momento se queda encendido: el acorde completo o la nota en su sitio
  if (NOTES && LASTP >= 0 && MODE !== 'piano') { const hand = MODE === 'guitar' ? 'gt' : 'bs';
    for (const nt of NOTES.hands[hand] || []) if (nt.s <= LASTP && LASTP < nt.s + nt.d) { const fr = FRETS && FRETS.get(nt);
      if (MODE === 'guitar' && CHFR.has(nt)) showChord(CHFR.get(nt), 0);
      else if (MODE === 'guitar' && ARP.has(nt) && fr && fr[0]) { const a = ARP.get(nt); showChord(a.shape || a, 0); const el = $('cd' + fr[0][0] + '_' + fr[0][1]); if (el) el.classList.add('lit'); else { const f2 = $('f' + fr[0][0] + '_' + fr[0][1]); if (f2) f2.classList.add('on'); } }
      else if (fr) (Array.isArray(fr[0]) ? fr : [fr]).forEach(q => { const el = q && $('f' + q[0] + '_' + q[1]); if (el) el.classList.add('on'); }); } }
  PAUSED = true; const g = $('chd'); if (g && g.innerHTML) { g.setAttribute('class', ''); const sv = g.ownerSVGElement; if (sv) sv.classList.add('chordmode'); }
  if ($('picon')) { $('picon').innerHTML = '<path d="M7 4.5v15l13-7.5z"/>'; $('play').setAttribute('aria-label', 'Play'); }
}
function stop() { PAUSED = false;
  if (!playing) return; playing = false; clearInterval(timer); voices.forEach(v => { try { v.stop(); } catch (e) {} }); voices = []; openHat = null;
  live.length = 0; byKey.clear(); try { WL && WL.release(); WL = null; } catch (e) {}
  document.querySelectorAll('.ph').forEach(r => r.setAttribute('visibility', 'hidden')); CURSYS = -1; if (PAGE) pageFrom(0); else if ($('score')) $('score').scrollTop = 0; document.querySelectorAll('#kbd rect, #kbd circle').forEach(r => r.classList.remove('on', 'held', 'rh', 'lh')); document.querySelectorAll('#kbd .tapm').forEach(el => el.remove()); lit.clear(); HELD.clear();
  if (GDIAG) showChord([...CHFR.values()][0] || [...ARP.values()].filter(v => Array.isArray(v))[0] || null, 0);
  if ($('picon')) { $('picon').innerHTML = '<path d="M7 4.5v15l13-7.5z"/>'; $('play').setAttribute('aria-label', 'Play'); }
}
// escanear con la cámara (foto) o al abrir un enlace del libro
async function readImage(src) {
  const img = new Image(); img.src = src; await img.decode();
  for (const max of [1400, 900, 2000, 600]) {
    const k = Math.min(1, max / Math.max(img.width, img.height)); const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', {willReadFrequently: true}); cx.drawImage(img, 0, 0, w, h);
    const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, {inversionAttempts: 'dontInvert'}); if (r) return r.data; }
  return null;
}
$('cam').onchange = async e => { const f = e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f);
  try { const t = await readImage(url); if (t) await handleCode(t); else toast('No code found. Hold the phone steady and fill the screen with the code.'); } finally { URL.revokeObjectURL(url); e.target.value = ''; } };
(async () => { await loadLibrary(); const h = location.hash.slice(1);
  if (/(?:PG1|BG1|GG1|UK1|FS1|GI1)\./.test(h)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} if (await handleCode(h)) return; }
  library(); })();
addEventListener('hashchange', async () => { const h = location.hash.slice(1); if (/(?:PG1|BG1|GG1|UK1|FS1|GI1)\./.test(h)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} await handleCode(h); } });
let _rz = null; 
if ('serviceWorker' in navigator && /^https:$/.test(location.protocol) && !/claude|claudeusercontent/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
// guitarra: al girar el móvil, se recoloca la partitura (2 compases por línea en vertical)
if (MODE !== 'bass') { let wasN = innerWidth < 700; addEventListener('resize', () => { const n = innerWidth < 700; if (n !== wasN && !playing && $('score')) { wasN = n; drawScore(); } }); }

window.ACT_CFG = {"re": "(?:GI1)\\.(\\w+)\\.([\\w-]{16,})(?:\\.L(\\d))?", "book": "improv", "store": "pg-codes", "thumbs": "act/", "boxes": {"48": [71.5, 13.2, 11.1, 8.5], "71": [71.6, 13.2, 11.2, 8.5], "86": [71.6, 19.4, 11.2, 8.6], "102": [71.6, 19.4, 11.2, 8.6], "114": [71.6, 13.2, 11.2, 8.5], "125": [71.5, 19.4, 11.1, 8.6], "133": [71.5, 19.4, 11.1, 8.6], "143": [71.6, 21.3, 11.2, 8.5], "160": [71.5, 21.3, 11.1, 8.5], "172": [71.5, 15.1, 11.1, 8.5], "184": [71.5, 19.4, 11.1, 8.6], "194": [71.6, 27.4, 11.2, 8.5], "203": [71.6, 19.4, 11.2, 8.6], "213": [71.5, 13.2, 11.1, 8.5]}, "open": [""], "ask": [{"sid": "blues", "ch": 4, "page": 48, "title": "Blues"}, {"sid": "rock", "ch": 5, "page": 71, "title": "Rock"}, {"sid": "metal", "ch": 6, "page": 86, "title": "Hard Rock and Metal"}, {"sid": "country", "ch": 7, "page": 102, "title": "Country and Southern Rock"}, {"sid": "funk", "ch": 8, "page": 114, "title": "Funk"}, {"sid": "soul", "ch": 9, "page": 125, "title": "R&B, Gospel and Neo-Soul"}, {"sid": "pop", "ch": 10, "page": 133, "title": "Pop and Melodic Solos"}, {"sid": "jazz", "ch": 11, "page": 143, "title": "Jazz: Swing and Bebop"}, {"sid": "fusion", "ch": 12, "page": 160, "title": "Modal Jazz and Fusion"}, {"sid": "gypsy", "ch": 13, "page": 172, "title": "Gypsy Jazz"}, {"sid": "latin", "ch": 14, "page": 184, "title": "Latin Rock and Salsa"}, {"sid": "brazil", "ch": 15, "page": 194, "title": "Brazilian: Bossa Nova, Samba and Choro"}, {"sid": "flamenco", "ch": 16, "page": 203, "title": "Flamenco and Spanish Guitar"}, {"sid": "african", "ch": 17, "page": 213, "title": "African Guitar"}]};


// ---------------- activación del libro (una sola vez por dispositivo) ----------------
// El primer código fuera de la muestra no abre nada todavía: la app pide escanear (dentro de la app)
// el código de una página concreta del libro, elegida al azar entre capítulos que no salen en la
// vista previa de Amazon. Al escanearlo, se desbloquea todo. Quien ya tenía capítulos guardados
// se da por activado, así que los clientes actuales no ven nada nuevo.
(function () {
  const A = window.ACT_CFG; if (!A) return;
  const KEY = 'act-' + A.book, LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};
  const RE = A.re ? new RegExp(A.re) : /(?:PG1|BG1|GG1|UK1|FS1)\.(\w+)\.([\w-]{16,})(?:\.L(\d))?/;
  const sidOf = t => { let u = t || ''; try { u = decodeURIComponent(u); } catch (e) {} const m = RE.exec(u); return m ? m[1] : null; };
  let st = LS.get(KEY, null);
  const free = sid => A.open.includes(sid);
  if (!st) { let had = false;                                // ¿ya usaba la app con el libro? (códigos guardados que no son de la muestra)
    try { const v = JSON.parse(localStorage.getItem(A.store) || '{}');
      had = Array.isArray(v) ? v.some(t => { const s = sidOf(t); return !!s && !free(s); }) : Object.keys(v || {}).length > 0; } catch (e) {}
    st = {done: had}; LS.set(KEY, st); }
  let SRC = 'link';                                          // 'scan' solo cuando el código entra por el escáner de la app
  window.ACT_SCANNED = t => { SRC = 'scan'; return handleCode(t, true); };
  const fileIn = document.getElementById('cam');
  if (fileIn) fileIn.addEventListener('change', () => { SRC = 'scan'; }, true);
  const orig = handleCode;
  handleCode = async function (txt, ...rest) {
    const src = SRC; SRC = 'link';
    const sid = sidOf(txt);
    if (st.done || !sid || free(sid)) return orig(txt, ...rest);
    // lectura: la página se pide de la misma edición (EE. UU. / Reino Unido) que el código abierto
    if (!st.ask) { const pool = (A.pool && A.pools && A.pools[A.pool(sid)]) || A.ask; st.ask = pool[Math.floor(Math.random() * pool.length)]; LS.set(KEY, st); }
    if (src === 'scan' && sid === st.ask.sid) {              // código pedido, escaneado con el libro delante
      st.done = true; LS.set(KEY, st); close();
      const pend = st.pending || []; delete st.pending; LS.set(KEY, st);
      for (const p of pend) if (sidOf(p) !== sid) { try { await orig(p, true); } catch (e) {} }
      const ok = await orig(txt, ...rest); toast('Your book is activated. Enjoy!'); return ok;
    }
    if (sid !== st.ask.sid || src !== 'scan') { const p = st.pending || []; if (!p.some(x => sidOf(x) === sid)) p.push(txt); st.pending = p.slice(-6); LS.set(KEY, st); }
    const wrong = src === 'scan' && sid !== st.ask.sid && !!st.shown; st.shown = true; LS.set(KEY, st); show(wrong); return false;
  };
  let ov = null;
  function close() { if (ov) { ov.remove(); ov = null; } }
  function show(wrong) {
    close(); const q = st.ask, dir = A.thumbs || 'act/', img = typeof q.img === 'string' ? q.img : q.img !== false ? dir + 'p' + String(q.page).padStart(3, '0') + '.jpg' : '';
    if (!document.getElementById('act-css')) { const s = document.createElement('style'); s.id = 'act-css';
      s.textContent =
        '#act-ov{position:fixed;inset:0;z-index:9998;background:rgba(8,7,6,.86);padding:14px;overflow:auto;display:flex}' +
        '#act-box{background:var(--panel,#1e1c19);color:var(--fg,#f2eadb);border:1px solid var(--line,#34302a);border-radius:20px;max-width:520px;width:100%;margin:auto;padding:22px 20px 16px;box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:var(--body,system-ui)}' +
        '#act-box .eb{font:700 12px/1 var(--body,system-ui);letter-spacing:.2em;text-transform:uppercase;color:var(--accent,#c9a25a);text-align:center}' +
        '#act-box h2{font:700 34px/1 var(--display,system-ui);text-transform:uppercase;letter-spacing:.02em;margin:10px 0 16px;text-align:center}#act-box h2 span{display:block;color:var(--accent,#c9a25a);font-size:64px;line-height:.95;margin-top:2px}' +
        '#act-wrong{background:#5a1f1a;color:#ffd9d2;border-radius:12px;padding:10px 12px;margin:0 0 14px;font-weight:700;text-align:center}' +
        '#act-vis{display:grid;grid-template-columns:150px 1fr;gap:16px;align-items:center;background:#15130f;border-radius:16px;padding:14px}' +
        '#act-th{position:relative;border-radius:6px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.5);background:#fff;aspect-ratio:621/810}' +
        '#act-th img{display:block;width:100%;height:100%}' +
        '#act-th i{position:absolute;border:3px solid var(--accent,#c9a25a);border-radius:5px;box-shadow:0 0 0 3px rgba(201,162,90,.35);animation:actp 1.4s ease-in-out infinite}' +
        '#act-th b{position:absolute;background:var(--accent,#c9a25a);color:#121110;font:700 10px/1 var(--body,system-ui);padding:4px 6px;border-radius:5px;white-space:nowrap}' +
        '@keyframes actp{50%{box-shadow:0 0 0 7px rgba(201,162,90,.15)}}' +
        '#act-pg small{display:block;color:var(--muted,#8f8676);font-size:14px;line-height:1.3}' +
        '#act-pg strong{display:block;font:700 34px/1 var(--display,system-ui);color:var(--fg,#f2eadb);text-transform:uppercase;margin:6px 0 4px}#act-pg .tip{margin-top:10px;color:var(--accent,#c9a25a)}' +
        '#act-steps{list-style:none;margin:16px 0 4px;padding:0;display:grid;gap:10px}' +
        '#act-steps li{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:center;font-size:16px;line-height:1.35}' +
        '#act-steps li span{width:30px;height:30px;border-radius:50%;background:var(--accent,#c9a25a);color:#121110;font-weight:700;display:grid;place-items:center}' +
        '#act-box .go{display:flex;align-items:center;justify-content:center;gap:10px;font:700 19px/1 var(--body,system-ui);padding:17px;border-radius:14px;border:0;background:var(--accent,#c9a25a);color:#121110;width:100%;margin-top:16px;cursor:pointer}' +
        '#act-box .go svg{width:24px;height:24px;fill:currentColor}' +
        '#act-box .lnk{display:block;margin:8px auto 0;background:none;border:0;color:var(--muted,#8f8676);font:500 14px var(--body,system-ui);padding:8px;cursor:pointer}' +
        '#act-box .help{text-align:center;font-size:13px;color:var(--muted,#8f8676);margin:2px 0 0}' +
        '@media (max-width:420px){#act-box{padding:18px 14px 12px}#act-vis{grid-template-columns:118px 1fr;gap:12px;padding:12px}#act-pg strong{font-size:28px}#act-box h2{font-size:28px;margin-bottom:12px}#act-box h2 span{font-size:54px}#act-steps li{font-size:15px}}';
      document.head.appendChild(s); }
    const B = q.box || (A.boxes || {})[q.page] || [71.7, 16, 11, 8.5], U = A.unit || 'Chapter';
    const thumb = img ? '<div id="act-th"' + (A.aspect ? ' style="aspect-ratio:' + A.aspect + '"' : '') + '><img src="' + img + '" alt="Page ' + q.page + ' of your book" onerror="this.parentNode.style.display=\'none\'">' +
      '<i style="left:' + B[0] + '%;top:' + B[1] + '%;width:' + B[2] + '%;height:' + B[3] + '%"></i>' +
      '<b style="right:' + Math.max(3, 100 - B[0] - B[2]) + '%;top:' + (B[1] + B[3] + 2) + '%">SCAN THIS</b></div>' : '';
    ov = document.createElement('div'); ov.id = 'act-ov';
    ov.innerHTML = '<div id="act-box" role="dialog" aria-label="Activate your book">' +
      '<div class="eb">One-time step · Activate your book</div><h2>Now scan<span>page ' + q.page + '</span></h2>' +
      (wrong ? '<p id="act-wrong">That is a different code. Look for page ' + q.page + '.</p>' : '') +
      '<div id="act-vis">' + thumb + '<div id="act-pg"><small>Page ' + q.page + ' is the first page of</small><strong>' + U + ' ' + q.ch + '</strong><small>' + q.title + '</small><small class="tip">The code is at the top, in the gold box.</small></div></div>' +
      '<ol id="act-steps"><li><span>1</span><div>Open the book at page ' + q.page + '.</div></li>' +
      '<li><span>2</span><div>Tap <b>Scan the code</b> below.</div></li>' +
      '<li><span>3</span><div>Point the camera at the code in the gold box. Done: the whole book opens.</div></li></ol>' +
      '<button type="button" class="go" data-a="scan"><svg viewBox="0 0 24 24"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>Scan the code</button>' +
      '<button type="button" class="lnk" data-a="later">Not now</button>' +
      '<p class="help">Only needed once on this device. Help: hello@dibidup.com</p></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'later') return close();
      close(); if (window.camScanOpen) window.camScanOpen(); else if (fileIn) fileIn.click(); });
  }
})();

window.CAMSCAN_CFG = {onCode: t => (window.ACT_SCANNED || handleCode)(t)};

// ---------------- escáner con la cámara del ordenador ----------------
// En móvil y tableta, «Scan a code» abre la cámara del sistema (foto) como siempre.
// En ordenador abre la webcam en directo y lee el código en cuanto aparece; si no hay
// cámara o se deniega el permiso, ofrece elegir una foto del código.
(function () {
  const CFG = window.CAMSCAN_CFG || {};
  const ua = navigator.userAgent || '';
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const can = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof jsQR === 'function';
  if (phone || !can) return;
  const fileInput = () => document.getElementById(CFG.input || 'cam');
  let ov = null, stream = null, raf = 0, busy = false;
  function css() {
    if (document.getElementById('cs-css')) return;
    const s = document.createElement('style'); s.id = 'cs-css';
    s.textContent = '#cs-ov{position:fixed;inset:0;z-index:9999;background:rgba(10,12,16,.92);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}' +
      '#cs-box{background:#fff;color:#1a1d24;border-radius:14px;max-width:560px;width:100%;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.4);text-align:center}' +
      '#cs-box h2{margin:0 0 6px;font-size:20px}#cs-box p{margin:6px 0 12px;font-size:15px;line-height:1.4;color:#3a3f4a}' +
      '#cs-vw{position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:4/3}' +
      '#cs-vw video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}' +
      '#cs-vw i{position:absolute;inset:18%;border:3px solid rgba(255,255,255,.9);border-radius:12px;box-shadow:0 0 0 999px rgba(0,0,0,.25)}' +
      '#cs-st{min-height:20px;font-size:14px;margin:10px 0 4px;color:#3a3f4a}' +
      '#cs-bt{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px}' +
      '#cs-bt button{font:inherit;font-size:15px;padding:10px 16px;border-radius:10px;border:1px solid #c9ced8;background:#f3f5f8;color:#1a1d24;cursor:pointer}' +
      '#cs-bt button.pri{background:#1a1d24;color:#fff;border-color:#1a1d24}';
    document.head.appendChild(s);
  }
  function close() {
    cancelAnimationFrame(raf); raf = 0;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (ov) { ov.remove(); ov = null; }
  }
  function photo() { close(); const i = fileInput(); if (i) i.click(); }
  function status(t) { const e = document.getElementById('cs-st'); if (e) e.textContent = t; }
  async function open() {
    if (ov) return; css();
    ov = document.createElement('div'); ov.id = 'cs-ov';
    ov.innerHTML = '<div id="cs-box" role="dialog" aria-label="Scan a code"><h2>Scan a code</h2>' +
      '<p>Hold the book in front of your computer’s camera, with the code inside the frame. Keep it still for a moment.</p>' +
      '<div id="cs-vw"><video playsinline muted></video><i></i></div><div id="cs-st">Starting the camera…</div>' +
      '<div id="cs-bt"><button type="button" data-a="photo">Use a photo of the code</button><button type="button" class="pri" data-a="close">Cancel</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (a === 'close') close(); else if (a === 'photo') photo(); else if (e.target === ov) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    const v = ov.querySelector('video');
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {width: {ideal: 1920}, height: {ideal: 1080}, facingMode: 'user'}});
    } catch (e) {
      status(e && e.name === 'NotAllowedError' ? 'The camera is blocked. Allow it in your browser (the camera icon in the address bar), or use a photo of the code.' : 'No camera was found on this computer. You can use a photo of the code instead.');
      const vw = document.getElementById('cs-vw'); if (vw) vw.style.display = 'none'; return;
    }
    if (!ov) { stream.getTracks().forEach(t => t.stop()); stream = null; return; }
    v.srcObject = stream; try { await v.play(); } catch (e) {}
    status('Looking for the code…');
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', {willReadFrequently: true});
    let last = 0, n = 0;
    const tick = async t => {
      if (!ov) return; raf = requestAnimationFrame(tick);
      if (busy || t - last < 120 || !v.videoWidth) return; last = t; n++;
      const W = v.videoWidth, H = v.videoHeight;
      // tres pasadas alternas: marco completo, centro ampliado y centro más ampliado
      // (la webcam da poco detalle: ampliar el centro suaviza el ruido y agranda los módulos del código)
      const P = [[0, 1, 1280], [0.2, 0.6, 1400], [0.3, 0.4, 1200]][n % 3];
      const sx = W * P[0], sy = H * P[0], sw = W * P[1], sh = H * P[1];
      const k = P[2] / Math.max(sw, sh); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      let r = null; try { r = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, {inversionAttempts: 'dontInvert'}); } catch (e) {}
      if (r && r.data) {
        busy = true; status('Code found!');
        const data = r.data; close();
        try { await CFG.onCode(data); } finally { busy = false; }
      }
    };
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener('click', e => {
    if (e.target.closest('input')) return;   // el clic que abre el selector de fotos (input dentro de la etiqueta)
    const b = e.target.closest(CFG.trigger || 'label[for="cam"]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); open();
  }, true);
  window.camScanOpen = open;
})();
