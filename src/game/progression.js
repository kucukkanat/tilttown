import '../ui/dock.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {FH, MAXF, N, box, cyl, paint, pick, tr} from '../core/util.js';
import {DIRS, camera, cellAt, controls, grad, mkMesh, plainMat, scene, swayMat, topY, wx} from '../core/scene.js';
import {LEAVES, leafCol, leafGeo, rebuildLaundry} from '../world/houses.js';
import {BIZ, SHOPCOL, frontFace, walkable} from '../world/streets.js';
import {askTownName} from './identity.js';
import {warpV} from '../world/organic.js';
import {MAXWALK, houseDoor, navDist, needs} from '../people/sim.js';
import {RES_TAX, cardEl, euro, toast, updateEco} from '../ui/cards.js';
import {cats, firework} from './extras.js';
import {EVENTS, cruiseG, dayStats, goals, goalsCard, resTaxMult, riverPath} from './meta.js';
import {MAPCOL, legendEl, mapOn} from '../world/shops.js';
import {setHover} from '../render/clarity.js';
import {say} from '../ui/input.js';
import {TLABEL, armTool} from '../ui/dock.js';

/* ==========================================================================
   GAME 2: guided first street, goals & level, needs, coins, plot value,
   shop synergies, reactions, seasons, regatta, upgrades, districts
   ========================================================================== */
const g2Near = (c, r, f) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (!a && !b) continue; const n = cellAt(c.i + a, c.j + b); if (n && f(n)) return true; } return false; };
const g2Count = (c, r, f) => { let k = 0; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (!a && !b) continue; const n = cellAt(c.i + a, c.j + b); if (n && f(n)) k++; } return k; };
const hasYard = (n, t) => (n.yard || []).includes(t);

/* ---- districts ---- */
const DIST = {old: {label: 'Old Town', col: '#c9a36a', home: .1, shop: null}, river: {label: 'Riverside', col: '#5a9ab0', home: .05, shop: t => ['florist', 'fish', 'winebar', 'cafe'].includes(t)}, market: {label: 'Market quarter', col: '#c86a4a', home: 0, shop: () => true}};
const DIST_ORDER = [null, 'old', 'river', 'market'];

/* ---- plot value ---- */
function plotValue(c) {
  if (!c || c.water) return {v: 1, why: []};
  let v = 1; const why = [], add = (d, t) => { v += d; why.push([t, `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`]); };
  if (DIRS.some(([dx, dz]) => cellAt(c.i + dx, c.j + dz)?.water)) add(.12, 'River view');
  if (g2Near(c, 2, n => n.kind === 'plaza')) add(.12, 'Plaza nearby');
  const g = g2Count(c, 1, n => n.kind === 'tree' || hasYard(n, 'tree')) + (c.yard || []).filter(x => x === 'tree').length; if (g) add(Math.min(.12, g * .04), 'Trees');
  if ((c.yard || []).includes('lamp') || g2Near(c, 2, n => n.kind === 'lamp' || hasYard(n, 'lamp'))) add(.06, 'Lit street');
  if (g2Near(c, 3, n => !!n.bizObj)) add(.08, 'Shops nearby'); else if (!g2Near(c, 5, n => !!n.bizObj)) add(-.1, 'No shops within 5');
  if (g2Count(c, 1, n => n.floors > 0) >= 7) add(-.1, 'Crowded');
  if ((c.cond ?? 1) < .5) add(-.08, 'Shabby');
  const d = DIST[c.dist]; if (d && d.home) add(d.home, d.label);
  return {v: Math.max(.6, Math.min(1.6, v)), why};
}
function valueMult(c) { return c ? plotValue(c).v : 1; }
function plotValueHTML(c) {
  if (!c.floors) return '';
  const {v, why} = plotValue(c), st = Math.max(1, Math.min(5, Math.round((v - .6) / .2) + 1));
  return `<p><span>Plot value</span>${'★'.repeat(st)}${'☆'.repeat(5 - st)} · rent ${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%</p>${why.length ? `<p class="tip">${why.map(([t, p]) => `${t} ${p}`).join(' · ')}</p>` : ''}`;
}

/* ---- shop synergies + upgrades ---- */
function synergy(b) {
  const c = b.cell; let m = 1; const why = [], add = (d, t) => { m += d; why.push([t, `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`]); };
  if (['cafe', 'tasca', 'winebar'].includes(b.type) && g2Near(c, 2, n => n.kind === 'plaza')) add(.15, 'Next to a plaza');
  if (['florist', 'fish', 'winebar'].includes(b.type) && g2Near(c, 1, n => n.water)) add(.1, 'By the river');
  const same = g2Count(c, 2, n => n.bizObj && n !== c && n.biz === b.type); if (same) add(-Math.min(.3, same * .12), `${same} more ${BIZ[b.type].label.toLowerCase()}${same > 1 ? 's' : ''} nearby`);
  const types = new Set(); for (let a = -2; a <= 2; a++) for (let q = -2; q <= 2; q++) { const n = cellAt(c.i + a, c.j + q); if (n && n !== c && n.bizObj && n.biz !== b.type) types.add(n.biz); }
  if (types.size >= 2) add(.08, 'Busy shopping street');
  const d = DIST[c.dist]; if (d && d.shop && d.shop(b.type)) add(.1, d.label);
  const L = c.bizLvl || 0; if (L) add(.12 * L, L > 1 ? 'Terrace and second counter' : 'Terrace');
  return {m: Math.max(.5, m), why};
}
function synergyMult(b) { return synergy(b).m; }
const UPG = [{label: 'Add a terrace', cost: 150}, {label: 'Add a second counter', cost: 250}];
function shopUpgradeDecor(b, M, P, R) {
  const L = b.cell.bizLvl || 0, [col, st] = SHOPCOL[b.type] || ['#7a3a2a', '#efe3c8'];
  if (L >= 1) for (const x of [-.75, .75]) { P(cyl(.16, .16, .03, '#e8e0d0', M(x, .46, .45), 10)); P(cyl(.02, .02, .45, '#2a2622', M(x, .23, .45), 5)); P(cyl(.015, .015, .95, '#2a2622', M(x, .48, .45), 5)); P(paint(new THREE.CylinderGeometry(.03, .38, .14, 8, 1, true), col).applyMatrix4(M(x, .98, .45))); for (const s of [-.22, .22]) P(box(.12, .24, .12, '#6a4a30', M(x + s, .12, .45))); }
  if (L >= 2) { P(box(1.4, .12, .12, col, M(0, .08, -.42))); for (let q = 0; q < 6; q++) P(paint(new THREE.IcosahedronGeometry(.07, 0), pick(R, ['#d9774a', '#e0a23a', '#c4502b', '#f0d0e0'])).applyMatrix4(M(-.6 + q * .24, .18, -.42))); }
}

/* ---- level and goal tracker ---- */
const townLevel = () => 1 + Math.floor(G.stars / 3), levelProg = () => (G.stars % 3) / 3;
G.lastLvl = null;
{ const st = document.createElement('style'); st.textContent = `
  #lvlB,#goalT{display:flex;align-items:center;gap:7px;padding:7px 11px;font:600 12px 'Bricolage Grotesque',system-ui,sans-serif;color:var(--paper);cursor:pointer;border:0}
  #lvlB i{width:40px;height:5px;border-radius:3px;background:rgba(243,230,204,.18);overflow:hidden;display:block}#lvlB i b{display:block;height:100%;background:#f0a35c;border-radius:3px}
  #goalT{max-width:min(320px,calc(100vw - 24px));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#goalT em{font-style:normal;color:#f6c38a;margin-left:auto}
  #quest{position:fixed;left:50%;transform:translateX(-50%);top:calc(60px + env(safe-area-inset-top));width:min(440px,calc(100vw - 20px));padding:10px 12px;display:none;z-index:5;font-size:13px}
  #quest.show{display:block}#quest.mini p,#quest.mini .qb,#quest.mini .bar{display:none}#quest.mini{padding:7px 12px}#quest .qh{display:flex;align-items:center;gap:8px}#quest .qh b{font:400 16px Caprasimo,Georgia,serif}#quest .qh small{margin-left:auto;opacity:.6}
  #quest p{margin:4px 0 8px;opacity:.85}#quest .qb{display:flex;gap:6px}#quest button{min-height:40px;padding:0 14px;border-radius:10px;border:0;font:600 13px 'Bricolage Grotesque',system-ui,sans-serif;cursor:pointer}
  #quest .go{background:#f0a35c;color:#24170f}#quest .skip{background:rgba(243,230,204,.1);color:var(--paper)}
  #quest .bar{height:4px;border-radius:2px;background:rgba(243,230,204,.15);margin-top:8px;overflow:hidden}#quest .bar i{display:block;height:100%;background:#f0a35c}
  .g2fx{position:fixed;pointer-events:none;transform:translate(-50%,-50%);font:700 13px 'Bricolage Grotesque',system-ui,sans-serif;z-index:4;animation:g2up 1.3s ease-out forwards;text-shadow:0 1px 3px rgba(0,0,0,.6)}
  .g2fx.coin{color:#ffd36a}.g2fx.big{font-size:22px}
  @keyframes g2up{0%{opacity:0;transform:translate(-50%,-30%) scale(.7)}15%{opacity:1;transform:translate(-50%,-60%) scale(1)}100%{opacity:0;transform:translate(-50%,-240%) scale(1)}}
  .need{position:fixed;transform:translate(-50%,-100%);width:34px;height:34px;border-radius:50%;background:#fbf3e2;display:grid;place-items:center;font-size:18px;box-shadow:0 3px 10px rgba(0,0,0,.35);cursor:pointer;z-index:3;display:none}
  .need:after{content:'';position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-top-color:#fbf3e2;border-bottom:0}
  body.clean .need,body.clean #goalT,body.clean #lvlB,body.photo .need,body.photo #quest,body.photo #goalT,body.photo #lvlB{display:none!important}
  @media (max-width:700px){#goalT{max-width:calc(100vw - 20px)}#quest{top:calc(100px + env(safe-area-inset-top))}}`; document.head.appendChild(st); }

const chipsEl = document.getElementById('chips'); const lvlB = document.createElement('button'); lvlB.id = 'lvlB'; lvlB.className = 'panel chip'; lvlB.onclick = () => goalsCard(); chipsEl.insertBefore(lvlB, document.getElementById('eco').nextSibling);
const goalT = document.createElement('button'); goalT.id = 'goalT'; goalT.className = 'panel chip'; goalT.onclick = () => goalsCard(); chipsEl.appendChild(goalT);
function updateLevelUI() {
  const L = townLevel(); lvlB.innerHTML = `Lv ${L}<i><b style="width:${Math.round(levelProg() * 100)}%"></b></i>`;
  if (G.lastLvl != null && L > G.lastLvl) { toast(`Town level ${L}! New things to unlock`); for (let k = 0; k < 4; k++) setTimeout(firework, k * 350); fxAt(innerWidth / 2, innerHeight * .35, `Level ${L}`, 'big coin'); }
  G.lastLvl = L;
  const g = goals.find(x => !x.done); goalT.style.display = quest && quest.k < QUEST.length ? 'none' : '';
  if (g) { const [a, b] = g.prog(); goalT.innerHTML = `<span>◎ ${g.text}</span><em>${Math.min(a, b)}/${b}</em>`; } else goalT.innerHTML = `<span>◎ All goals done today</span><em>★</em>`;
}

/* ---- floating feedback: coins, hearts, clouds ---- */
let fxN = 0;
function fxAt(x, y, text, cls = '') { if (fxN > 14) return; const d = document.createElement('div'); d.className = 'g2fx ' + cls; d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); fxN++; setTimeout(() => { d.remove(); fxN--; }, 1300); }
const _fxv = new THREE.Vector3();
function fxWorld(x, y, z, text, cls) { _fxv.set(x, y, z); warpV(_fxv).project(camera); if (_fxv.z > 1 || Math.abs(_fxv.x) > 1.1 || Math.abs(_fxv.y) > 1.1) return; if (camera.position.distanceTo(controls.target) > 45) return; fxAt((_fxv.x * .5 + .5) * innerWidth, (-_fxv.y * .5 + .5) * innerHeight, text, cls); }
const fxCell = (c, text, cls, h) => fxWorld(wx(c.i), topY(c) + (h ?? ((c.floors || 0) * FH + .8)), wx(c.j), text, cls);
const coinAcc = new Map();
function coinPop(b, amt) { const k = (coinAcc.get(b) || 0) + amt; coinAcc.set(b, k); }
let coinT = 0;
function flushCoins(dt) { if ((coinT -= dt) > 0) return; coinT = .5; for (const [b, v] of coinAcc) { if (v >= 1 && b.cell) fxCell(b.cell, `+${euro(Math.round(v))}`, 'coin', (b.cell.floors ? 1.2 : .8)); } coinAcc.clear(); }
const reactAt = (c, sym) => fxCell(c, sym, 'big');

/* ---- hourly rent ---- */
const rentDrip = {paid: 0, h: null};
function tickRent() {
  const h = Math.floor(G.hour); if (rentDrip.h === null) { rentDrip.h = h; return; } if (h === rentDrip.h) return; rentDrip.h = h; if (G.speed <= 0) return;
  let est = 0; for (const z of G.citizens) if (z.role !== 'child' && z.role !== 'baby') est += RES_TAX * (z.joy ?? .6) * resTaxMult(z.home);
  const drip = est / 24; if (drip <= 0) return; G.funds += drip; rentDrip.paid += drip; updateEco();
  if (Math.random() < .5) { const homes = G.cells.filter(c => c.floors > 0 && c.res && c.res.length); if (homes.length) fxCell(pick(Math.random, homes), `+${euro(Math.max(1, Math.round(drip / 3)))}`, 'coin'); }
}

/* ---- needs above heads ---- */
const NEED = {cut: ['🚧', 'Our street is cut off from the rest of town'], food: ['🍞', 'Hungry: no bakery, grocer or fishmonger within walking distance'], cafe: ['☕', 'Wants a coffee: no café within walking distance'], green: ['🌳', 'Wants trees nearby'], lamp: ['💡', 'Street is too dark']};
function needOf(z) {
  const h = z.home; if (!h) return null; const n = needs(z), from = houseDoor(h) || z.pos;
  if (G.businesses.length && G.businesses.every(b => !b.door || navDist(b, from) >= 1e8)) return 'cut';
  const has = types => G.businesses.some(b => types.includes(b.type) && b.door && navDist(b, from) <= MAXWALK(z));
  if (n.food < .35 && !has(['bakery', 'grocer', 'fish'])) return 'food';
  if (n.coffee < .35 && !has(['cafe', 'tasca'])) return 'cafe';
  if (!(h.yard || []).includes('tree') && !g2Near(h, 2, n => n.kind === 'tree' || n.kind === 'plaza' || hasYard(n, 'tree'))) return 'green';
  if ((G.hour > 18.5 || G.hour < 6) && !(h.yard || []).includes('lamp') && !g2Near(h, 2, n => n.kind === 'lamp' || hasYard(n, 'lamp'))) return 'lamp';
  return null;
}
const needEls = Array.from({length: 5}, () => { const d = document.createElement('div'); d.className = 'need'; document.body.appendChild(d); return d; });
let needT = 0, needShown = [];
function nearestShopHouse(c) { const opts = G.cells.filter(n => n.floors > 0 && !n.biz && frontFace(n) !== undefined && n.owned !== false); opts.sort((a, b) => (Math.abs(a.i - c.i) + Math.abs(a.j - c.j)) - (Math.abs(b.i - c.i) + Math.abs(b.j - c.j))); return opts[0]; }
function solveNeed(z, k) {
  if (k === 'cut') { setHover(z.home); say('Connect this street: remove a house or tree, add a bridge, or build stairs (one level at a time)'); return; }
  if (k === 'food' || k === 'cafe') { const c = nearestShopHouse(z.home); if (c) { armTool('look'); G.houseCard(c); say(k === 'cafe' ? 'Open a café here' : 'Open a bakery or grocer here'); } else say('Build a house with a door on a street first'); }
  else { armTool(k === 'green' ? 'tree' : 'lamp'); setHover(z.home); say(k === 'green' ? `Plant a tree near ${z.name.split(' ')[0]}'s home (or in its garden)` : `Light a lamp near ${z.name.split(' ')[0]}'s home`); }
}
function updateNeeds(dt) {
  if ((needT -= dt) < 0) { needT = 1;
    for (const z of G.citizens) { if (z.role === 'baby') continue; const n = needOf(z); if (z.need && !n && z.state !== 'inside') { const p = warpV(z.pos.clone()); fxWorld(p.x, p.y + 1.1, p.z, '❤', 'big'); } z.need = n; }
    needShown = G.citizens.filter(z => z.need && z.state !== 'inside' && z.pos.distanceTo(camera.position) < 30).sort((a, b) => a.pos.distanceTo(camera.position) - b.pos.distanceTo(camera.position)).slice(0, needEls.length);
  }
  const on = !mapOn && !document.body.classList.contains('clean');
  needEls.forEach((d, k) => { const z = needShown[k]; if (!on || !z || z.state === 'inside') { d.style.display = 'none'; return; }
    const p = warpV(z.pos.clone()); p.y += 1.15 * z.s; p.project(camera); if (p.z > 1) { d.style.display = 'none'; return; }
    d.style.display = 'grid'; d.style.left = ((p.x * .5 + .5) * innerWidth) + 'px'; d.style.top = ((-p.y * .5 + .5) * innerHeight) + 'px';
    if (d.dataset.k !== z.need + z.id) { d.dataset.k = z.need + z.id; d.textContent = NEED[z.need][0]; d.title = `${z.name.split(' ')[0]}: ${NEED[z.need][1]}`; d.onclick = () => solveNeed(z, z.need); } });
}

/* ---- guided first street ---- */
const treesCount = () => G.cells.filter(c => c.kind === 'tree').length + G.cells.reduce((a, c) => a + (c.yard || []).filter(x => x === 'tree').length, 0);
const lampsCount = () => G.cells.filter(c => c.kind === 'lamp').length + G.cells.reduce((a, c) => a + (c.yard || []).filter(x => x === 'lamp').length, 0);
const QUEST = [
  {t: 'Build your first house', h: 'Tap Build, pick House, then tap the glowing plot.', tool: 'house', n: () => G.cells.filter(c => c.floors > 0).length, tg: 'plot'},
  {t: 'Add a floor', h: 'With House still picked, tap a house to stack a floor on it.', tool: 'house', n: () => G.cells.reduce((a, c) => a + (c.floors || 0), 0), tg: 'house'},
  {t: 'Open a café', h: 'Tap Done, then tap the glowing house and pick Café in its card.', tool: null, n: () => G.businesses.filter(b => b.type === 'cafe').length, tg: 'shophouse'},
  {t: 'Light a lamp', h: 'Build › Lamp, then tap the glowing street.', tool: 'lamp', n: lampsCount, tg: 'street'},
  {t: 'Plant a tree', h: 'Build › Tree, then tap a plot or a house to plant in its garden.', tool: 'tree', n: treesCount, tg: 'plot'},
  {t: 'Watch someone buy a coffee', h: 'Let the clock run; a resident will stop by your café.', tool: null, n: () => dayStats.sales.cafe || 0, tg: 'cafe'},
];
let quest = null;
const qEl = document.createElement('div'); qEl.id = 'quest'; qEl.className = 'panel'; document.body.appendChild(qEl);
const qMark = new THREE.Group(); { const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .86, 40), new THREE.MeshBasicMaterial({color: 0xffd36a, transparent: true, opacity: .95, side: THREE.DoubleSide})); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 9; qMark.add(ring);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 12), new THREE.MeshBasicMaterial({color: 0xffd36a, depthTest: false})); beam.rotation.x = Math.PI; beam.position.y = 2.2; beam.renderOrder = 9; qMark.add(beam); qMark.userData = {ring, beam}; }
qMark.visible = false; scene.add(qMark);
function qTarget(kind) {
  const ctr = (() => { const hs = G.cells.filter(c => c.floors > 0); if (!hs.length) return {i: N / 2, j: N / 2}; return {i: hs.reduce((a, c) => a + c.i, 0) / hs.length, j: hs.reduce((a, c) => a + c.j, 0) / hs.length}; })();
  const d = c => Math.abs(c.i - ctr.i) + Math.abs(c.j - ctr.j), ok = c => c.owned !== false && !c.water;
  let opts = [];
  if (kind === 'plot') opts = G.cells.filter(c => ok(c) && !c.floors && !c.kind && DIRS.some(([a, b]) => { const n = cellAt(c.i + a, c.j + b); return n && walkable(n) && !n.water; }));
  if (kind === 'house') opts = G.cells.filter(c => ok(c) && c.floors > 0 && c.floors < MAXF);
  if (kind === 'shophouse') opts = G.cells.filter(c => ok(c) && c.floors > 0 && !c.biz && frontFace(c) !== undefined);
  if (kind === 'street') opts = G.cells.filter(c => ok(c) && !c.floors && !c.kind && walkable(c));
  if (kind === 'cafe') opts = G.businesses.filter(b => b.type === 'cafe').map(b => b.cell);
  opts.sort((a, b) => d(a) - d(b)); return opts[0] || null;
}
function questStart(k) {
  quest = {k, base: k < QUEST.length ? QUEST[k].n() : 0, cell: k < QUEST.length ? qTarget(QUEST[k].tg) : null};
  try { localStorage.setItem('tilt-quest', String(k)); } catch (e) { }
  renderQuest();
}
function renderQuest() {
  if (!quest || quest.k >= QUEST.length) { qEl.classList.remove('show'); qMark.visible = false; return; }
  const q = QUEST[quest.k]; qEl.classList.add('show');
  qEl.innerHTML = `<div class="qh"><b>${q.t}</b><small>Step ${quest.k + 1} of ${QUEST.length} · +${euro(100)}</small></div><p>${q.h}</p><div class="qb"><button class="go">${q.tool ? 'Pick ' + TLABEL[q.tool] : 'Show me'}</button><button class="skip">Skip guide</button></div><div class="bar"><i style="width:${Math.round(quest.k / QUEST.length * 100)}%"></i></div>`;
  qEl.querySelector('.go').onclick = () => { if (q.tool) armTool(q.tool); else if (quest.cell && q.tg === 'shophouse') G.houseCard(quest.cell); if (quest.cell) { controls.target.copy(warpV(new THREE.Vector3(wx(quest.cell.i), topY(quest.cell), wx(quest.cell.j)))); } if (QUEST[quest.k].tg === 'cafe' && G.speed === 0) G.speed = 1; };
  qEl.querySelector('.skip').onclick = () => { quest.k = QUEST.length; try { localStorage.setItem('tilt-quest', 'done'); } catch (e) { } renderQuest(); updateLevelUI(); };
}
function updateQuest(t) {
  qEl.classList.toggle('mini', innerWidth < 700 && cardEl.style.display === 'block');
  if (!quest || quest.k >= QUEST.length) return;
  const q = QUEST[quest.k];
  if (q.n() > quest.base) { G.funds += 100; updateEco(); fxAt(innerWidth / 2, 120, `+${euro(100)}`, 'big coin'); toast(`Done: ${q.t}`);
    if (quest.k + 1 >= QUEST.length) { G.funds += 200; updateEco(); toast('Your first street is alive! +€200. Goals take over from here'); setTimeout(askTownName, 2800); for (let k = 0; k < 5; k++) setTimeout(firework, k * 300); try { localStorage.setItem('tilt-quest', 'done'); } catch (e) { } quest.k = QUEST.length; renderQuest(); updateLevelUI(); return; }
    questStart(quest.k + 1); return; }
  if (!quest.cell || (q.tg === 'plot' && (quest.cell.floors || quest.cell.kind)) || (q.tg === 'shophouse' && quest.cell.biz)) { quest.cell = qTarget(q.tg); }
  const c = quest.cell; qMark.visible = !!c && !mapOn;
  if (c) { qMark.position.set(wx(c.i), topY(c) + (q.tg === 'house' || q.tg === 'shophouse' || q.tg === 'cafe' ? c.floors * FH + .3 : .06), wx(c.j)); warpV(qMark.position);
    const s = 1 + Math.sin(t * 4) * .08; qMark.userData.ring.scale.setScalar(s); qMark.userData.beam.position.y = 2.2 + Math.sin(t * 3) * .15 + (q.tg === 'house' || q.tg === 'shophouse' || q.tg === 'cafe' ? .4 : 0); }
}
function questInit() {
  let st = null; try { st = localStorage.getItem('tilt-quest'); } catch (e) { }
  let tut = null; try { tut = localStorage.getItem('tilt-tut'); } catch (e) { }
  if (st === 'done' || (st === null && tut)) { quest = {k: QUEST.length}; return; }
  try { localStorage.setItem('tilt-tut', '1'); } catch (e) { }
  questStart(st === null ? 0 : Math.min(QUEST.length, +st || 0));
}

/* ---- starting camera + frame my town ---- */
function frameTown(close) {
  const hs = G.cells.filter(c => c.floors > 0 || c.kind); if (!hs.length) return;
  const biz = G.businesses.length ? G.businesses.map(b => b.cell) : hs, src = close ? biz : hs;
  const cx = src.reduce((a, c) => a + wx(c.i), 0) / src.length, cz = src.reduce((a, c) => a + wx(c.j), 0) / src.length;
  const r = Math.max(4, ...hs.map(c => Math.hypot(wx(c.i) - cx, wx(c.j) - cz)));
  const dist = close ? 27 : r * 2.1 + 10, dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.set(cx, 1.4, cz); camera.position.copy(controls.target).addScaledVector(dir, dist);
}

/* ---- seasons ---- */
const SEASONS = [{n: 'Autumn', col: '#000000', amt: 0, leaves: 1}, {n: 'Winter', col: '#cfd2d4', amt: .75, leaves: 0}, {n: 'Spring', col: '#f4a6c4', amt: .75, leaves: .6}, {n: 'Summer', col: '#4f9a3a', amt: .85, leaves: .1}];
const seasonOf = d => SEASONS[Math.floor(d / 5) % 4];
const SEA_U = {col: {value: new THREE.Color()}, amt: {value: 0}}; let seasonLeaf = 1; G.seasonDay = -1; let seasonSnow = false;
{ const prev = swayMat.onBeforeCompile, key = swayMat.customProgramCacheKey;
  swayMat.onBeforeCompile = (sh, r) => { if (prev) prev.call(swayMat, sh, r); sh.uniforms.uSeaCol = SEA_U.col; sh.uniforms.uSeaAmt = SEA_U.amt;
    sh.fragmentShader = 'uniform vec3 uSeaCol;uniform float uSeaAmt;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n{vec3 c0=diffuseColor.rgb;float sat=max(c0.r,max(c0.g,c0.b))-min(c0.r,min(c0.g,c0.b));diffuseColor.rgb=mix(c0,uSeaCol*(.75+.6*dot(c0,vec3(.33))),uSeaAmt*smoothstep(.12,.3,sat));}'); };
  swayMat.customProgramCacheKey = () => (key ? key.call(swayMat) : 'sway') + '-season'; swayMat.needsUpdate = true; }
const leafCol0 = leafCol.slice();
function applySeason(announce) {
  const s = seasonOf(G.day); G.g2Summer = s.n === 'Summer'; G.g2Autumn = s.n === 'Autumn'; leafGeo.setDrawRange(0, Math.round(LEAVES * s.leaves)); SEA_U.col.value.set(s.col); SEA_U.amt.value = s.amt; seasonLeaf = s.leaves;
  const pink = new THREE.Color('#f4b8cc'), white = new THREE.Color('#fff4f8');
  for (let i = 0; i < LEAVES; i++) { if (s.n === 'Spring') { const c = Math.random() < .5 ? pink : white; leafCol.set([c.r, c.g, c.b], i * 3); } else leafCol.set(leafCol0.subarray(i * 3, i * 3 + 3), i * 3); }
  leafGeo.attributes.color.needsUpdate = true;
  if (s.n === 'Winter' && G.weather === 'auto') { G.weather = 'snow'; seasonSnow = true; } else if (s.n !== 'Winter' && seasonSnow) { G.weather = 'auto'; seasonSnow = false; }
  rebuildLaundry();
  if (announce) toast(`${s.n} arrives in Tilt Town`);
}
const seasonName = () => seasonOf(G.day).n;

/* ---- regatta event ---- */
EVENTS.regatta = {title: 'Regatta', start(e) { const p = riverPath(); if (!p || p.length < 3) return; e.path = p; e.boats = [];
    for (let k = 0; k < 4; k++) { const g = new THREE.Group(), sail = pick(Math.random, ['#f4f0e8', '#d94f3d', '#f0a35c', '#5a9ab0']);
      g.add(mkMesh([box(.7, .14, .26, '#6a4a30', tr(0, .07, 0)), cyl(.015, .015, .9, '#2a2622', tr(0, .55, 0), 5)], plainMat, true));
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([0, .15, 0, 0, 1, 0, .45, .2, 0], 3)); sg.computeVertexNormals(); g.add(new THREE.Mesh(paint(sg, sail), new THREE.MeshToonMaterial({vertexColors: true, gradientMap: grad, side: THREE.DoubleSide})));
      g.userData.off = (k - 1.5) * .35; g.userData.lag = k * .06; cruiseG.add(g); e.boats.push(g); }
    toast('Regatta today! Sailboats race down the river (+€150, happier residents)'); e.paid = false; },
  tick(e, k) { if (!e.boats) return; const p = e.path; e.boats.forEach(g => { const u = Math.max(0, Math.min(1, k * 1.15 - g.userData.lag)), f = u * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), t = f - i; g.position.lerpVectors(p[i], p[i + 1], t); g.position.z += g.userData.off; g.position.y = -.3 + Math.sin(k * 40 + g.userData.off * 9) * .02; g.rotation.y = Math.atan2(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z) - Math.PI / 2; });
    if (k > .5 && !e.paid) { e.paid = true; G.funds += 150; updateEco(); G.citizens.forEach(z => z.bonus = Math.min(.15, (z.bonus || 0) + .05)); fxAt(innerWidth / 2, 140, `+${euro(150)}`, 'big coin'); } },
  end(e) { (e.boats || []).forEach(g => cruiseG.remove(g)); }};

/* ---- rooftop cats ---- */
function catsToRoofs() { const roofs = G.cells.filter(c => c.floors > 0); cats.forEach(k => { k.roof = false; if (roofs.length && Math.random() < .3) { const c = pick(Math.random, roofs); k.roof = true; k.tgt = null; k.pos.set(wx(c.i) + (Math.random() - .5) * .5, topY(c) + c.floors * FH + .45, wx(c.j) + (Math.random() - .5) * .5); } }); }

/* ---- map modes: uses / value / districts ---- */
let mapMode = 'use';
const VALC = Array.from({length: 9}, (_, k) => new THREE.Color().setHSL(.0 + k / 8 * .33, .65, .52));
const DISTC = Object.fromEntries(Object.entries(DIST).map(([k, d]) => [k, new THREE.Color(d.col)]));
{ const prevMC = G.mapColOf;
  G.mapColOf = c => { if (!c || mapMode === 'use') return prevMC(c); if (c.water) return MAPCOL.none;
    if (mapMode === 'value') { if (!c.floors) return MAPCOL.none; return VALC[Math.max(0, Math.min(8, Math.round((plotValue(c).v - .7) / .8 * 8)))]; }
    return c.dist ? DISTC[c.dist] : MAPCOL.none; };
  const prevBuild = G.buildMapUI;
  G.buildMapUI = () => { prevBuild(); const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:4px;margin:4px 0'; ['use', 'value', 'district'].forEach(m => { const b = document.createElement('button'); b.className = 'act' + (mapMode === m ? ' on' : ''); b.style.cssText = 'min-height:30px;padding:4px 8px;font-size:11px'; b.textContent = {use: 'Uses', value: 'Value', district: 'Districts'}[m]; b.onclick = e => { e.stopPropagation(); mapMode = m; G.buildMapUI(); }; row.appendChild(b); }); legendEl.insertBefore(row, legendEl.children[1] || null);
    if (mapMode !== 'use') { legendEl.querySelectorAll('span').forEach(s => s.remove()); const add = (col, t) => { const s = document.createElement('span'); s.innerHTML = `<em style="background:${col}"></em>${t}`; legendEl.appendChild(s); };
      if (mapMode === 'value') { add('#' + VALC[8].getHexString(), 'High value home'); add('#' + VALC[4].getHexString(), 'Average'); add('#' + VALC[0].getHexString(), 'Low value'); }
      else { Object.values(DIST).forEach(d => add(d.col, d.label)); add('#555', 'Paint with Land › District'); } } };
}

export {DIST, DIST_ORDER, QUEST, UPG, applySeason, catsToRoofs, coinPop, flushCoins, frameTown, needEls, needOf, plotValue, plotValueHTML, quest, questInit, questStart, reactAt, rentDrip, seasonOf, shopUpgradeDecor, synergy, synergyMult, tickRent, townLevel, updateLevelUI, updateNeeds, updateQuest, valueMult};
