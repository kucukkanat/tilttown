import './extras.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {LV, N, S, box, cyl, mul, paint, pick, rng, setAttr, tr} from '../core/util.js';
import {DIRS, camera, cellAt, litMat, mkMesh, objG, plainMat, renderer, scene, terrainG, topY, water, wx} from '../core/scene.js';
import {rebuildGlows, rebuildLaundry, rebuildObj, rebuildTerrain} from '../world/houses.js';
import {BIZ, SHOPCOL, canStep, dust, hhmm, isOpenAt, now, pop, walkY, walkable} from '../world/streets.js';
import {OWN, assignBusinesses, escH, ownFrame, ownReset, ownSpecMult, streetName, townName} from './identity.js';
import {makePlan, say3, spawnCitizens} from '../people/sim.js';
import {buildPeopleMeshes} from '../people/characters.js';
import {INCOME, PRICE, RENT, START_FUNDS, cardEl, cheatApply, closeCard, euro, joyOf, newBizBooks, selectCell, spend, toast, townJoy, updateEco} from '../ui/cards.js';
import {BUDGET, INTERIOR, cats, effWeather, festActive, fwA, live, makeRequest, mistU, paperNote, placeCats, rebuildWaterFx, scheduleSave, snowAmt, tone, undoStack, updateReqChip} from './extras.js';
import {P, PRESETS} from '../render/post.js';
import {refresh} from '../ui/input.js';
import {valueMult} from './progression.js';

/* =====================================================================
   META: goals & stars, unlocks, land, trade-offs, decay, events,
   scenarios, weekly challenge, storylines, notables, postcards, personality
   ===================================================================== */
G.stars = 0; let goals = []; let dayStats = {sales: {}, served: 0, floors: 0, opened: {}, reqs: 0, closed: 0, repaints: 0};
G.landBought = 0; G.quayWalls = false; G.events = []; G.scen = {id: 'free'}; G.stories = []; G.notables = {}; G.nataCell = null; G.stageCell = null;
const resetDayStats = () => { dayStats = {sales: {}, served: 0, floors: 0, opened: {}, reqs: 0, closed: 0, repaints: 0}; };

/* ---- unlocks ---- */
const UNLOCKS = [
  {at: 3, id: 'pharmacy', label: 'Pharmacy (shop)'}, {at: 6, id: 'nouveau', label: 'Art Nouveau house style'}, {at: 9, id: 'winebar', label: 'Wine bar (shop)'},
  {at: 12, id: 'villa', label: 'Tiled villa house style'}, {at: 15, id: 'bluehour', label: 'Blue hour preset'}, {at: 18, id: 'cinema', label: 'Cinema (shop)'}, {at: 22, id: 'statue', label: 'Statue plaza'},
];
const has = id => UNLOCKS.some(u => u.id === id && G.stars >= u.at);
const nextUnlock = () => UNLOCKS.find(u => G.stars < u.at);
Object.assign(BIZ, {
  pharmacy: {label: 'Pharmacy', hours: [[9, 19]], awn: ['#2f7a4a', '#f0f4f0'], sign: '#1f5a3a', names: ['Farmácia Central'], locked: 'pharmacy'},
  winebar: {label: 'Wine bar', hours: [[17, 24]], awn: ['#5a1f2f', '#6a2a3a'], sign: '#3a1420', staff: 1, names: ['Vinhos do Porto', 'Adega Velha'], locked: 'winebar'},
  cinema: {label: 'Cinema', hours: [[15, 24]], awn: ['#1e1e2a', '#c9a33f'], sign: '#1a1a24', names: ['Cine Lua', 'Cinema Batalha'], locked: 'cinema'},
});
Object.assign(PRICE, {pharmacy: 9, winebar: 9, cinema: 8}); Object.assign(RENT, {pharmacy: 24, winebar: 32, cinema: 40});
Object.assign(BIZ, {bnb: {label: 'B&B', hours: [[7, 23]], awn: ['#2f5ea8', '#efe3c8'], sign: '#1f3a6a', names: ['Casa Azul B&B', 'Guest House Ribeira', 'Casa da Avó', 'Hostel Lua', 'Casa do Rio']}}); Object.assign(SHOPCOL, {bnb: ['#2f5ea8', '#efe3c8']}); Object.assign(PRICE, {bnb: 38}); Object.assign(RENT, {bnb: 30}); Object.assign(INCOME, {guest: 0});
Object.assign(INTERIOR, {bnb: ['#efe3c8', '#8a5a2a', '#2f5ea8', '#e8c34a']});
Object.assign(INTERIOR, {pharmacy: ['#e8f0ec', '#2f7a4a', '#f4f4f4', '#d94f3d'], winebar: ['#5a2a2a', '#3a1420', '#2f5a3a', '#c9a33f'], cinema: ['#2a1a2a', '#c9a33f', '#b8342a', '#1e1e2a']});
function addBlueHour() { PRESETS.push({name: 'Blue hour', dot: '#4a5aa8', wind: .4, cloudAmt: .5, swirl: .9, leaves: .2, tint: '#2a3a7a', locked: 'bluehour',
  k: [P('#6a8ac8', '#d8e0f0', '#f0f4ff', '#fff4e0', 2.2, '#b8c8e8', '#5a5a6a', 1.1, '#4a7aa0'),
      P('#2a3a8a', '#7a7ac0', '#9a9ad0', '#ffb080', 1.4, '#6a7ab8', '#2a2a4a', .9, '#2a4a7a'),
      P('#0e1438', '#2a3270', '#3a4280', '#8090d0', .45, '#2a3a7a', '#0a0a1a', .6, '#14204a')]}); }

/* ---- daily goals ---- */
const SALE_NOUN = {bnb: 'guest nights', cafe: 'coffees', bakery: 'loaves', grocer: 'grocery baskets', tasca: 'tasca dinners', fish: 'fish', florist: 'bouquets', books: 'books', barber: 'haircuts', pharmacy: 'prescriptions', winebar: 'glasses of wine', cinema: 'cinema tickets'};
function makeGoals() {
  const out = [], R = Math.random, types = [...new Set(G.businesses.map(b => b.type))];
  const T = [];
  if (types.length) { const t = pick(R, types), n = 6 + Math.round(G.businesses.filter(b => b.type === t).length * (6 + R() * 6)); T.push({id: 'sales', text: `Sell ${n} ${SALE_NOUN[t]}`, prog: () => [dayStats.sales[t] || 0, n]}); }
  const m = Math.min(.8, Math.round((townJoy() + .05) * 20) / 20); T.push({id: 'mood', text: `Reach ${Math.round(m * 100)}% town mood`, prog: () => [Math.round(townJoy() * 100), Math.round(m * 100)]});
  const avail = Object.keys(BIZ).filter(k => (!BIZ[k].locked || has(BIZ[k].locked)) && !types.includes(k)); if (avail.length) { const t = pick(R, avail); T.push({id: 'open', text: `Open a ${BIZ[t].label.toLowerCase()}`, prog: () => [dayStats.opened[t] || 0, 1]}); }
  const sv = 20 + Math.round(G.citizens.length * .3); T.push({id: 'served', text: `Serve ${sv} customers in total`, prog: () => [dayStats.served, sv]});
  T.push({id: 'floors', text: 'Build 3 new floors', prog: () => [dayStats.floors, 3]});
  if (G.requests.length) T.push({id: 'req', text: 'Fulfil a resident request', prog: () => [dayStats.reqs, 1]});
  if (G.cells.some(c => c.floors && (c.cond ?? 1) < .5)) T.push({id: 'repaint', text: 'Repaint a shabby house', prog: () => [dayStats.repaints, 1]});
  T.push({id: 'pop', text: `Reach ${G.citizens.length + 4} residents`, prog: () => [G.citizens.length, G.citizens.length + 4]});
  while (out.length < 3 && T.length) { const g = T.splice(Math.floor(R() * T.length), 1)[0]; g.done = false; out.push(g); }
  goals = out; updateGoalChip();
}
function checkGoals() {
  for (const g of goals) if (!g.done) { const [a, b] = g.prog(); if (a >= b) { g.done = true; G.stars++; toast(`Goal done: ${g.text}. ★ ${G.stars}`); const u = UNLOCKS.find(x => x.at === G.stars); if (u) setTimeout(() => toast(`Unlocked: ${u.label}!`), 2200); scheduleSave(); } }
  updateGoalChip();
}
const goalEl = document.getElementById('goalsBtn');
function updateGoalChip() { goalEl.textContent = `★ ${G.stars} · Goals ${goals.filter(g => g.done).length}/${goals.length}`; [...document.getElementById('presets').children].forEach((x, k) => x.classList.toggle('locked', !!PRESETS[k]?.locked && !has(PRESETS[k].locked))); }
goalEl.onclick = () => goalsCard();
function goalsCard() {
  G.cardFor = {kind: 'goals'}; const nu = nextUnlock();
  cardEl.innerHTML = `<div class="ch"><div><b>Today's goals</b><small>Each goal earns a star · ★ ${G.stars}</small></div><button class="x">×</button></div>
    ${goals.map(g => { const [a, b] = g.prog(); return `<p class="${g.done ? 'gdone' : ''}"><span>${g.done ? '★ Done' : `${Math.min(a, b)}/${b}`}</span>${g.text}</p>`; }).join('')}
    ${scenLine()}
    <p><span>Next unlock</span>${nu ? `${nu.label} at ★ ${nu.at}` : 'Everything unlocked!'}</p>
    <div class="unl">${UNLOCKS.map(u => `<i class="${G.stars >= u.at ? 'on' : ''}">★${u.at} ${u.label}</i>`).join('')}</div>
    ${G.stories.length ? `<p><span>Stories</span></p>${G.stories.map(s => `<p class="${s.done ? 'gdone' : ''}"><span>${s.done ? '★ Done' : `Step ${s.step + 1}/${s.steps.length}`}</span><b>${s.title}</b>: ${s.done ? s.doneText : s.steps[s.step].text}</p>`).join('')}` : ''}`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
}

/* ---- land ---- */
const plotPrice = () => 150 + G.landBought * 30;
function landCard(c) {
  selectCell(c);
  G.cardFor = {kind: 'land'};
  const adj = DIRS.some(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); return n && n.owned !== false; });
  cardEl.innerHTML = `<div class="ch"><div><b>Wild land</b><small>Outside the town limits</small></div><button class="x">×</button></div>
    <p>${adj ? `Buy this plot for <b>${euro(plotPrice())}</b> to build on it. Each plot costs a little more than the last.` : 'You can only buy plots next to land you already own.'}</p>
    ${adj ? '<button class="act wide" id="buyPlot">Buy plot</button>' : ''}`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
  const b = document.getElementById('buyPlot'); if (b) b.onclick = () => { G.snapshot(); if (!spend(plotPrice(), 'this plot')) { undoStack.pop(); return; } c.owned = true; G.landBought++; c.kind = null; rebuildTerrain(c); refresh(c, true); pop(c); dust(c); closeCard(); toast('Plot bought: the town grows'); };
}

/* ---- house condition, styles, trade-offs ---- */
const shabbyLvl = c => (c.cond ?? 1) < .35 ? 2 : (c.cond ?? 1) < .65 ? 1 : 0;
function tradeoffs(z, why) {
  let j = 0; const h = z.home; if (!h) return 0;
  const tall = DIRS.some(([dx, dz]) => { const n = cellAt(h.i + dx, h.j + dz); return n && n.floors >= h.floors + 3; });
  if (tall) { j -= .07; why.push('in the shade of tall neighbours'); }
  const loud = G.businesses.some(b => ['tasca', 'winebar', 'cinema'].includes(b.type) && Math.abs(b.cell.i - h.i) + Math.abs(b.cell.j - h.j) <= 2);
  if (loud && z.role === 'retiree') { j -= .12; why.push('nightlife noise keeps them awake'); }
  if (loud && z.role === 'student') j += .08;
  const sl = shabbyLvl(h); if (sl) { j -= .06 * sl; why.push(sl === 2 ? 'their house is falling apart' : 'their house needs paint'); }
  if (h.flooded) { j -= .15; why.push('the ground floor flooded'); }
  if (G.nataCell && Math.abs(G.nataCell.i - h.i) + Math.abs(G.nataCell.j - h.j) <= 4) j += .05;
  if (traits.has('quiet') && z.role === 'retiree') j += .05;
  return j;
}
const resTaxMult = c => (1 + Math.max(0, (c?.floors || 0) - 3) * .1) * valueMult(c);
function repaint(c) { const cost = 50 * c.floors; G.snapshot(); if (!spend(cost, 'repainting')) { undoStack.pop(); return false; } c.cond = 1; dayStats.repaints++; rebuildObj(c); rebuildGlows(); pop(c); dust(c); checkGoals(); scheduleSave(); return true; }
function restyle(c, st) { G.snapshot(); if (!spend(100, 'a restyle')) { undoStack.pop(); return; } c.style = st || null; refresh(c, true); pop(c); dust(c); }
function decayDay() {
  for (const c of G.cells) if (c.floors) { const before = shabbyLvl(c); c.cond = Math.max(0, (c.cond ?? 1) - (.03 + Math.random() * .02 + (effWeather() === 'rain' ? .02 : 0))); if (shabbyLvl(c) !== before) rebuildObj(c); }
}
function houseExtras(c) {
  if (!c.floors) return '';
  const cond = Math.round((c.cond ?? 1) * 100), sl = shabbyLvl(c);
  const styles = [['', 'Classic'], ...(has('nouveau') ? [['nouveau', 'Art Nouveau']] : []), ...(has('villa') ? [['villa', 'Tiled villa']] : [])];
  return `<p><span>Condition</span>${cond}%${sl ? (sl === 2 ? ' · falling apart' : ' · needs paint') : ''}</p>
    ${cond < 95 ? `<button class="act wide" id="repaintB">Repaint for ${euro(50 * c.floors)}</button>` : ''}
    ${styles.length > 1 ? `<p><span>Style (€100)</span></p><div class="grid">${styles.map(([k, l]) => `<button class="act ${(c.style || '') === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>` : ''}`;
}
function wireHouseExtras(c) {
  const rb = document.getElementById('repaintB'); if (rb) rb.onclick = () => { if (repaint(c)) G.houseCard(c, G.cardFor?.picker); };
  cardEl.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { restyle(c, b.dataset.st); G.houseCard(c, G.cardFor?.picker); });
}

/* ---- random events ---- */
const cruiseG = new THREE.Group(); scene.add(cruiseG);
function buildCruise() {
  const g = [], l = [];
  g.push(paint(new THREE.CylinderGeometry(.5, .35, 3.2, 10, 1), '#f4f0e8').applyMatrix4(mul(tr(0, .05, 0, 0, Math.PI / 2), new THREE.Matrix4().makeScale(1, 1, .55))));
  g.push(box(2.4, .35, .6, '#f4f0e8', tr(0, .45, 0))); g.push(box(1.8, .3, .55, '#e8e0d0', tr(-.1, .78, 0))); g.push(box(2.6, .05, .62, '#2f5a8a', tr(0, .22, 0)));
  g.push(cyl(.09, .1, .5, '#b8342a', tr(.4, 1.1, 0), 10)); g.push(cyl(.1, .1, .06, '#1e1e1e', tr(.4, 1.37, 0), 10));
  for (let q = 0; q < 8; q++) for (const z of [-.31, .31]) l.push(setAttr(box(.14, .1, .01, '#fff', tr(-1 + q * .28, .5, z)), 'lthr', .25));
  const grp = new THREE.Group(); grp.add(mkMesh(g, plainMat, true)); grp.add(mkMesh(l, litMat, false)); return grp;
}
function riverPath() { const w = G.cells.filter(c => c.water); if (!w.length) return null; const byI = new Map(); w.forEach(c => { if (!byI.has(c.i)) byI.set(c.i, []); byI.get(c.i).push(c); }); return [...byI.keys()].sort((a, b) => a - b).map(i => { const cs = byI.get(i); return new THREE.Vector3(wx(i), -.32, cs.reduce((a, c) => a + wx(c.j), 0) / cs.length); }); }
const EVENTS = {
  flood: {title: 'River flood', start(e) { e.peak = G.quayWalls ? -.12 : .18; G.cells.forEach(c => { if (!G.quayWalls && !c.water && c.lvl === 0 && c.floors && DIRS.some(([dx, dz]) => cellAt(c.i + dx, c.j + dz)?.water)) c.flooded = true; }); toast(G.quayWalls ? 'The river is rising, but the quay walls hold!' : 'Flood! The river spills over the quay. Raise quay walls (Menu) to protect homes'); paperNote(G.quayWalls ? 'Quay walls hold back the flood' : 'Flood soaks riverside homes'); },
    tick(e, k) { water.position.y = -.32 + (e.peak + .32) * Math.sin(Math.min(1, k) * Math.PI); }, end() { water.position.y = -.32; G.cells.forEach(c => c.flooded = false); }},
  storm: {title: 'Storm', start(e) { e.prevW = G.weather; G.weather = 'rain'; const lamps = G.cells.filter(c => c.kind === 'lamp'); lamps.forEach(c => { if (Math.random() < .45) { c.broken = true; rebuildObj(c); } }); rebuildGlows(); const n = G.cells.filter(c => c.broken).length; toast(`Storm! ${n} street lamps are broken. Tap them with Look to repair (€20 each)`); paperNote(`Storm knocks out ${n} street lamps`); },
    end(e) { if (G.weather === 'rain') G.weather = e.prevW || 'auto'; }},
  cruise: {title: 'Cruise boat visit', start(e) { const p = riverPath(); if (!p || p.length < 3) return; e.path = p; e.boat = buildCruise(); cruiseG.add(e.boat); e.paid = false; toast('A cruise boat is arriving! Cafés with free seats will earn big'); if (live()) { tone(110, 1.6, .06, 'sawtooth'); tone(165, 1.6, .04, 'sawtooth'); } },
    tick(e, k) { if (!e.boat) return; const p = e.path, u = k < .25 ? k / .25 * .5 : k > .75 ? .5 + (k - .75) / .25 * .5 : .5; const f = u * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), t = f - i; e.boat.position.lerpVectors(p[i], p[i + 1], t); e.boat.position.y = water.position.y + .05; const d = p[i + 1].clone().sub(p[i]); e.boat.rotation.y = Math.atan2(d.x, d.z) - Math.PI / 2;
      if (k > .3 && !e.paid) { e.paid = true; let tot = 0; for (const b of G.businesses) if (['cafe', 'tasca', 'winebar'].includes(b.type) && isOpenAt(b.type, G.hour)) { const free = (b.seats || []).filter(s => !s.by).length + 2, earn = free * 14 * (traits.has('cafe') ? 1.15 : 1); newBizBooks(b); b.rev += earn; b.cash += earn; tot += earn; b.sales += free; dayStats.served += free; } toast(tot ? `Tourists spent ${euro(tot)} in your cafés!` : 'The tourists found no open café. Open more cafés by the river'); paperNote(tot ? `Cruise tourists spend ${euro(tot)} in town` : 'Cruise tourists find nowhere to eat'); checkGoals(); } },
    end(e) { if (e.boat) cruiseG.remove(e.boat); }},
  inspector: {title: 'Health inspector', start(e) { const food = G.businesses.filter(b => ['cafe', 'bakery', 'tasca', 'fish', 'grocer', 'winebar'].includes(b.type)); if (!food.length) return; const b = pick(Math.random, food), ok = (b.cell.cond ?? 1) >= .5 && b.cash > 40; if (ok) { G.funds += 60; toast(`Health inspector visited ${b.name}: spotless! +€60 grant`); paperNote(`${b.name} passes inspection with flying colours`); } else { G.funds -= 120; b.cash -= 50; toast(`Health inspector fined ${b.name}: a shabby or broke shop. −€120 town fine. Repaint and support it`); paperNote(`${b.name} fails health inspection`); } updateEco(); }},
  market: {title: 'Market day', start() { const pl = G.cells.filter(c => c.kind === 'plaza'); toast(pl.length ? 'Market day! Stalls fill the plazas and grocers sell more' : 'Market day, but there is no plaza for stalls. Build one!'); marketOn = pl.length > 0; rebuildLaundry(); }, end() { marketOn = false; rebuildLaundry(); }},
};
let marketOn = false;
function rollEvent() {
  if (Math.random() > .45) return;
  const pool = ['storm', 'cruise', 'cruise', 'inspector', 'market', 'market']; if (G.cells.some(c => c.water)) pool.push('flood', 'flood', 'regatta');
  const kind = pick(Math.random, pool), at = kind === 'cruise' ? 10 + Math.random() * 5 : kind === 'market' ? 7 : kind === 'regatta' ? 13 : kind === 'inspector' ? 11 : 8 + Math.random() * 10;
  G.events.push({kind, at, dur: {flood: 6, storm: 8, cruise: 4, inspector: 0, market: 10, regatta: 2.5}[kind], started: false, day: G.day});
}
function updateEvents(dt) {
  for (const e of [...G.events]) {
    const E = EVENTS[e.kind];
    if (!e.started && e.day === G.day && G.hour >= e.at) { e.started = true; E.start(e); if (!e.dur) { G.events = G.events.filter(o => o !== e); continue; } }
    if (e.started) { const k = (now() - (e.day * 24 + e.at)) / e.dur; if (E.tick) E.tick(e, k); if (k >= 1) { E.end && E.end(e); G.events = G.events.filter(o => o !== e); } }
    else if (e.day < G.day) G.events = G.events.filter(o => o !== e);
  }
  const ev = G.events.find(e => e.started); eventEl.style.display = ev ? 'block' : 'none'; if (ev) eventEl.textContent = EVENTS[ev.kind].title;
}
const eventEl = document.getElementById('eventChip');
eventEl.onclick = () => { const broken = G.cells.filter(c => c.broken); G.cardFor = {kind: 'event'}; cardEl.innerHTML = `<div class="ch"><div><b>${eventEl.textContent}</b><small>Happening now</small></div><button class="x">×</button></div>${broken.length ? `<button class="act wide" id="fixAll">Repair ${broken.length} lamps (${euro(broken.length * 20)})</button>` : ''}${!G.quayWalls ? `<button class="act wide" id="quayB">Raise quay walls (${euro(500)})</button>` : '<p>Quay walls protect against floods.</p>'}`; cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard; const f = document.getElementById('fixAll'); if (f) f.onclick = () => { if (!spend(broken.length * 20, 'repairs')) return; broken.forEach(c => { c.broken = false; rebuildObj(c); }); rebuildGlows(); closeCard(); toast('Lamps repaired'); }; const q = document.getElementById('quayB'); if (q) q.onclick = buyQuay; };
function buyQuay() { if (!spend(500, 'quay walls')) return; G.quayWalls = true; G.cells.forEach(c => c.flooded = false); rebuildLaundry(); toast('Quay walls raised: floods can no longer reach homes'); paperNote('Council raises quay walls along the river'); closeCard(); scheduleSave(); }

/* ---- town personality ---- */
let traits = new Set();
const TRAITS = {cafe: ['Café capital', 'cafés earn 15% more'], market: ['Market town', 'grocers, fishmongers and florists earn 10% more'], quiet: ['Quiet hill village', 'retirees are happier'], river: ['Riverside town', 'cruise boats visit more often'], culture: ['Town of culture', 'stars from goals give €50 each']};
function computeTraits() {
  const cnt = t => G.businesses.filter(b => b.type === t).length; traits = new Set();
  if (cnt('cafe') + cnt('tasca') + cnt('winebar') >= 4) traits.add('cafe');
  if (cnt('grocer') + cnt('fish') + cnt('florist') >= 3) traits.add('market');
  if (!cnt('tasca') && !cnt('winebar') && !cnt('cinema') && G.cells.filter(c => c.floors).reduce((a, c, _, arr) => a + c.lvl / arr.length, 0) > 1.2) traits.add('quiet');
  if (G.cells.filter(c => c.kind === 'bridge').length >= 3 && G.cells.filter(c => c.kind === 'lamp' && DIRS.some(([dx, dz]) => cellAt(c.i + dx, c.j + dz)?.water)).length >= 5) traits.add('river');
  if (G.cells.some(c => c.kind === 'church') && cnt('books') && cnt('cinema')) traits.add('culture');
}
const priceMult = t => ownSpecMult(t) * (traits.has('cafe') && ['cafe', 'tasca', 'winebar'].includes(t) ? 1.15 : 1) * (traits.has('market') && ['grocer', 'fish', 'florist'].includes(t) ? 1.1 : 1) * (marketOn && ['grocer', 'fish', 'florist'].includes(t) ? 1.5 : 1);

/* ---- notables & storylines ---- */
function pickNotables() {
  const adults = G.citizens.filter(z => ['worker', 'retiree', 'student', 'keeper'].includes(z.role)); if (adults.length < 4) return;
  const used = new Set(), take = f => { const c = adults.filter(z => !used.has(z) && f(z)); const z = c.length ? pick(Math.random, c) : null; if (z) used.add(z); return z; };
  const mayor = take(z => z.age > 40), gossip = take(z => z.chatty), painter = take(() => true);
  G.notables = {mayor, gossip, painter};
  if (mayor) { mayor.notable = 'Mayor'; mayor.shirt = new THREE.Color('#2a2a3a'); mayor.hat = 0; }
  if (gossip) gossip.notable = 'Town gossip';
  if (painter) { painter.notable = 'Painter'; painter.hat = 2; painter.hatC = new THREE.Color('#1e1e2a'); painter.plan = [{at: 0, act: 'home'}, {at: 9.5, act: 'paint'}, {at: 16, act: 'cafe'}, {at: 18, act: 'home'}]; }
  buildPeopleMeshes();
}
const isNotable = z => !!z.notable;
const STORY_DEFS = {
  nata: z => ({id: 'nata', z, title: `${z.name.split(' ')[0]}'s pastry dream`, step: 0, steps: [
    {text: `Cheer ${z.name.split(' ')[0]} up: get her mood above 60%`, test: () => joyOf(z) > .6},
    {text: `Open a bakery within 3 streets of her home on ${streetName(z.home.i)}`, test: () => G.businesses.some(b => b.type === 'bakery' && Math.abs(b.cell.i - z.home.i) + Math.abs(b.cell.j - z.home.j) <= 3)},
  ], doneText: `Pastéis da ${z.name.split(' ')[0]} stall opened: +€40 a day and happier neighbours`, reward() { const b = G.businesses.find(b => b.type === 'bakery' && Math.abs(b.cell.i - z.home.i) + Math.abs(b.cell.j - z.home.j) <= 3); if (b) { z.role = 'staff'; z.work = b; z.apron = true; z.plan = makePlan(z); z.step = null; } G.nataCell = b ? b.street : z.home; rebuildLaundry(); buildPeopleMeshes(); }}),
  band: z => ({id: 'band', z, title: `${z.name.split(' ')[0]}'s band`, step: 0, steps: [
    {text: 'Build a plaza where the band can play', test: () => G.cells.some(c => c.kind === 'plaza')},
    {text: 'Light it up: 2 street lamps within 2 cells of a plaza', test: () => G.cells.some(c => c.kind === 'plaza' && G.cells.filter(l => l.kind === 'lamp' && Math.abs(l.i - c.i) + Math.abs(l.j - c.j) <= 2).length >= 2)},
    {text: 'Get the town mood to 62%', test: () => townJoy() >= .62},
  ], doneText: 'Concert nights every third evening on the plaza', reward() { G.stageCell = G.cells.find(c => c.kind === 'plaza'); rebuildLaundry(); }}),
  painter: z => ({id: 'painter', z, title: `${z.name.split(' ')[0]} the painter`, step: 0, steps: [
    {text: 'Take a 3-star postcard in photo mode', test: () => album.some(p => p.stars >= 3)},
    {text: 'Build a plaza next to the river', test: () => G.cells.some(c => c.kind === 'plaza' && DIRS.some(([dx, dz]) => cellAt(c.i + dx, c.j + dz)?.water))},
  ], doneText: 'A painting of your town sold in Lisbon: +€600', reward() { G.funds += 600; updateEco(); }}),
};
function makeStories() {
  G.stories = [];
  const pickA = f => { const c = G.citizens.filter(z => f(z) && !z.notable && z.role !== 'child' && z.role !== 'baby' && z.role !== 'guest'); return c.length ? pick(Math.random, c) : null; };
  const rita = pickA(z => !z.male && ['worker', 'student'].includes(z.role)); if (rita) G.stories.push(STORY_DEFS.nata(rita));
  const hugo = pickA(z => z.male && ['student', 'worker'].includes(z.role)); if (hugo) G.stories.push(STORY_DEFS.band(hugo));
  if (G.notables.painter) G.stories.push(STORY_DEFS.painter(G.notables.painter));
}
function checkStories() {
  for (const s of G.stories) {
    if (s.done || !G.citizens.includes(s.z)) continue;
    if (s.steps[s.step].test()) { s.step++; if (s.step >= s.steps.length) { s.done = true; s.reward(); G.stars += 2; toast(`Story complete: ${s.title}! ${s.doneText}. ★ +2`); paperNote(`${s.title}: ${s.doneText}`); say3(s.z, 'Obrigado!'); } else toast(`${s.title}: ${s.steps[s.step].text}`); scheduleSave(); }
  }
  updateGoalChip();
}
const concertTime = () => G.stageCell && G.stageCell.kind === 'plaza' && G.day % 3 === 2 && G.hour >= 20 && G.hour < 22.5;
function storyDecor(out, lit) {
  if (G.nataCell) { const x = wx(G.nataCell.i), z = wx(G.nataCell.j), y = walkY(G.nataCell); const pm = tr(x + .55, y, z - .5, .4);
    out.push(box(.5, .3, .32, '#c9a33f', mul(pm, tr(0, .3, 0)))); for (const s of [-.2, .2]) out.push(cyl(.06, .06, .02, '#2a2622', mul(pm, tr(s, .08, .17, 0, 0, Math.PI / 2)), 10));
    for (let q = 0; q < 6; q++) out.push(cyl(.035, .03, .02, '#e0a23a', mul(pm, tr(-.18 + (q % 3) * .18, .47, -.06 + Math.floor(q / 3) * .1)), 8));
    out.push(cyl(.012, .012, .7, '#ddd', mul(pm, tr(0, .75, 0)), 4)); for (let s = 0; s < 8; s++) out.push(paint(new THREE.CylinderGeometry(.02, .4, .14, 3, 1, true, s * Math.PI / 4, Math.PI / 4), s % 2 ? '#f4f0e8' : '#2f5ea8').applyMatrix4(mul(pm, tr(0, 1.1, 0)))); }
  if (G.stageCell && G.stageCell.kind === 'plaza') { const x = wx(G.stageCell.i), z = wx(G.stageCell.j), y = topY(G.stageCell);
    out.push(box(.7, .12, .45, '#6a4a30', tr(x + .55, y + .06, z))); for (const s of [-.3, .3]) out.push(box(.03, .9, .03, '#2a2622', tr(x + .55 + s, y + .5, z - .2))); out.push(box(.7, .05, .03, '#2a2622', tr(x + .55, y + .95, z - .2)));
    for (let q = 0; q < 5; q++) lit.push(setAttr(box(.05, .05, .05, '#fff', tr(x + .3 + q * .12, y + .9, z - .18)), 'lthr', .2)); }
  if (marketOn) for (const c of G.cells) if (c.kind === 'plaza') { const x = wx(c.i), z = wx(c.j), y = topY(c);
    for (const [ox, oz, col] of [[-.6, .55, '#b8432f'], [.6, -.55, '#2f6aa8']]) { out.push(box(.5, .04, .35, '#8a6a42', tr(x + ox, y + .4, z + oz))); for (const s of [-.22, .22]) out.push(box(.03, .8, .03, '#3a2a20', tr(x + ox + s, y + .4, z + oz - .15))); out.push(box(.56, .03, .45, col, tr(x + ox, y + .82, z + oz, 0, .2))); for (let k = 0; k < 6; k++) out.push(paint(new THREE.IcosahedronGeometry(.04, 0), pick(Math.random, ['#d9472b', '#7aa33a', '#e8a23a', '#e8d84a'])).applyMatrix4(tr(x + ox - .2 + k * .08, y + .45, z + oz))); } }
  if (G.quayWalls) for (const c of G.cells) { if (!walkable(c) || c.water) continue; DIRS.forEach(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); if (n && n.water && n.kind !== 'bridge') out.push(box(dx ? .12 : S, .32, dx ? S : .12, '#a49684', tr(wx(c.i) + dx * .97, c.lvl * LV + .16, wx(c.j) + dz * .97))); }); }
}

/* ---- postcards ---- */
let album = []; const ALBUM_KEY = 'tilt-town-album-v1';
try { album = JSON.parse(localStorage.getItem(ALBUM_KEY) || '[]'); } catch (e) { }
const SECRETS = [
  {id: 'fw', title: 'Fireworks over the river', test: () => festActive() && fwA.some(a => a > .3)},
  {id: 'snowtram', title: 'Snowy tram', test: v => snowAmt > .5 && G.tram?.car && v(G.tram.car.position)},
  {id: 'bells', title: 'Blue hour bells', test: v => G.hour >= 19.5 && G.hour < 21.5 && G.cells.some(c => c.kind === 'church' && v(new THREE.Vector3(wx(c.i), 2, wx(c.j))))},
  {id: 'cat', title: 'Midnight cat', test: v => (G.hour < 4 || G.hour > 23) && cats.some(k => v(k.pos) && camera.position.distanceTo(k.pos) < 8)},
  {id: 'funi', title: 'Up the hill', test: v => G.funi?.car && v(G.funi.car.position) && camera.position.distanceTo(G.funi.car.position) < 10},
];
G.snapPending = false;
function scoreShot() {
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)), V = p => fr.containsPoint(p);
  const parts = [];
  if (G.hour >= 17.3 && G.hour <= 20.3) parts.push('golden hour'); if (G.hour >= 21 || G.hour < 5) parts.push('night lights');
  if (festActive()) parts.push('festival');
  if (G.citizens.filter(z => z.state !== 'inside' && V(z.pos) && camera.position.distanceTo(z.pos) < 25).length >= 12) parts.push('busy streets');
  if (G.cells.some(c => c.kind === 'church' && V(new THREE.Vector3(wx(c.i), 2, wx(c.j)))) || (G.tram?.car && V(G.tram.car.position)) || (G.funi?.car && V(G.funi.car.position))) parts.push('landmark');
  if (['snow', 'fog'].includes(effWeather()) || mistU.uA.value > .3) parts.push('weather');
  const sec = SECRETS.find(s => !album.some(p => p.secret === s.id) && s.test(V));
  const st = Math.min(3, Math.max(1, Math.ceil(parts.length * .75)));
  return {stars: sec ? 3 : st, parts, secret: sec?.id, title: sec ? sec.title : parts.length ? parts.map(p => p[0].toUpperCase() + p.slice(1)).join(' · ') : 'A quiet corner'};
}
function grabPostcard() {
  const sc = scoreShot(), src = renderer.domElement, cv = document.createElement('canvas'); cv.width = 480; cv.height = Math.round(480 * src.height / src.width);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); try { ownFrame(cv); } catch (e) { }
  const card = {img: cv.toDataURL('image/jpeg', .72), ...sc, day: G.day, at: hhmm(G.hour)};
  album.unshift(card); if (album.length > 14) album.length = 14;
  try { localStorage.setItem(ALBUM_KEY, JSON.stringify(album)); } catch (e) { album.length = Math.max(1, album.length - 4); }
  toast(`${'★'.repeat(card.stars)} Postcard: ${card.title}${card.secret ? ' (secret!)' : ''}`); checkStories();
}
document.getElementById('snapB').onclick = () => { G.snapPending = true; };
function albumCard() {
  G.cardFor = {kind: 'album'};
  cardEl.innerHTML = `<div class="ch"><div><b>Postcard album</b><small>${album.length} saved · secrets ${album.filter(p => p.secret).length}/${SECRETS.length}</small></div><button class="x">×</button></div>
    <p class="tip">In photo mode, tap Snap. Golden hour, night lights, festivals, crowds, landmarks and weather score stars. Some secret shots wait to be found.</p>
    <div class="album">${album.map(p => `<figure><img src="${p.img}"><figcaption>${'★'.repeat(p.stars)} ${p.title} <a download="${escH(townName())} day ${p.day + 1}.jpg" href="${p.img}" style="color:#f0a35c">Save</a></figcaption></figure>`).join('')}${SECRETS.filter(s => !album.some(p => p.secret === s.id)).map(() => '<figure class="sec"><div>?</div><figcaption>Secret postcard</figcaption></figure>').join('')}</div>`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
}

/* ---- scenarios & weekly challenge ---- */
const weekNo = () => { const d = new Date(), y = d.getUTCFullYear(), s = Date.UTC(y, 0, 1); return [y, Math.ceil(((d - s) / 864e5 + new Date(s).getUTCDay() + 1) / 7)]; };
const SCEN = {
  free: {title: 'Free play', desc: 'No limits. Grow your town at your own pace.'},
  ribeira: {title: 'Revive the Ribeira', desc: 'A tired riverside quarter: shabby houses and closed shops. Reach 70% mood.', days: 10, star: [5, 7, 10], opt: {shabby: true, emptyShops: true, funds: 1800}, win: () => townJoy() >= .7},
  bridge: {title: 'Bridge Town', desc: 'Two banks and no bridges. Build 2 bridges and grow to the target population.', days: 9, star: [4, 6, 9], opt: {noBridges: true, funds: 900}, target: () => Math.round(BUDGET() * .6), win: s => G.cells.filter(c => c.kind === 'bridge').length >= 2 && G.citizens.length >= s.target},
  hill: {title: 'Hill of 100 Steps', desc: 'A steep town. Build the funicular and reach 65% mood.', days: 10, star: [4, 7, 10], opt: {hilly: true, funds: 1600, landmarks: true}, win: () => G.funi && !G.funi.broken && townJoy() >= .65},
  budget: {title: 'Budget Mayor', desc: 'Start poor. Grow to the target population and never let the treasury drop below €0.', days: 12, star: [7, 9, 12], opt: {funds: 700}, target: () => Math.round(BUDGET() * .75), win: s => G.citizens.length >= s.target, fail: () => G.funds < 0},
  weekly: {title: 'Weekly challenge', desc: 'Everyone gets this week\'s town. Score as high as you can in 7 days, then compare codes with friends.', days: 7, opt: {weekly: true}, score: true},
};
let scenBest = {}; try { scenBest = JSON.parse(localStorage.getItem('tilt-scen-best') || '{}'); } catch (e) { }
function startScenario(id) {
  const S = SCEN[id]; let seed = Math.floor(Math.random() * 1e6);
  if (id === 'weekly') { const [y, w] = weekNo(); seed = y * 100 + w; }
  generate(seed, S.opt || {}); G.scen = {id, startDay: G.day, target: S.target ? S.target() : 0, done: false};
  closeCard(); toast(`${S.title}: ${S.desc}`); scheduleSave(); updateScenChip();
}
const weekScore = () => Math.round(G.citizens.length * 10 + townJoy() * 1000 + Math.max(0, G.funds) / 5 + G.stars * 100);
function checkScenario(midnight) {
  const S = SCEN[G.scen.id]; if (!S || G.scen.id === 'free' || G.scen.done) return;
  const elapsed = G.day - G.scen.startDay;
  if (S.score) { if (elapsed >= S.days) { G.scen.done = true; G.scen.score = weekScore(); const [y, w] = weekNo(); G.scen.code = `TT-${y}W${w}-${G.scen.score}-${((G.scen.score * 7919 + w * 31) % 997).toString(36)}`; resultCard(true); } updateScenChip(); return; }
  if (S.fail && midnight && S.fail()) { G.scen.done = true; G.scen.won = false; resultCard(false); return; }
  if (S.win(G.scen)) { G.scen.done = true; G.scen.won = true; const d = elapsed + (G.hour / 24); G.scen.stars = d <= S.star[0] ? 3 : d <= S.star[1] ? 2 : 1; if ((scenBest[G.scen.id] || 0) < G.scen.stars) { scenBest[G.scen.id] = G.scen.stars; try { localStorage.setItem('tilt-scen-best', JSON.stringify(scenBest)); } catch (e) { } } resultCard(true); }
  else if (elapsed >= S.days) { G.scen.done = true; G.scen.won = false; resultCard(false); }
  updateScenChip();
}
function scenLine() { const S = SCEN[G.scen.id]; if (!S || G.scen.id === 'free') return ''; return `<p><span>Scenario</span><b>${S.title}</b>: day ${Math.min(S.days, G.day - G.scen.startDay + 1)}/${S.days}${G.scen.target ? ` · target ${G.scen.target} people` : ''}${S.score ? ` · score ${weekScore()}` : ''}</p>`; }
const scenEl = document.getElementById('scenChip');
function updateScenChip() { const S = SCEN[G.scen.id]; scenEl.style.display = S && G.scen.id !== 'free' ? 'block' : 'none'; if (S) scenEl.textContent = G.scen.done ? `${S.title}: ${G.scen.won === false ? 'failed' : 'done'}` : `${S.title} · day ${Math.min(S.days || 0, G.day - G.scen.startDay + 1)}/${S.days}`; }
scenEl.onclick = () => scenarioCard();
function resultCard(won) {
  const S = SCEN[G.scen.id]; G.cardFor = {kind: 'result'};
  cardEl.innerHTML = `<div class="ch"><div><b>${S.title}</b><small>${S.score ? 'Week complete' : won ? 'Scenario complete!' : 'Not this time'}</small></div><button class="x">×</button></div>
    ${S.score ? `<p class="lead">Score ${G.scen.score}</p><p>Your code: <b>${G.scen.code}</b></p><button class="act wide" id="cpCode">Copy code</button>` : won ? `<p class="lead">${'★'.repeat(G.scen.stars)}${'☆'.repeat(3 - G.scen.stars)}</p><p>Finished in ${G.day - G.scen.startDay + 1} days.</p>` : `<p>${S.fail && S.fail() ? 'The treasury went below €0.' : 'Time ran out.'} You can keep playing this town freely, or try again.</p>`}
    <div class="grid"><button class="act" id="again">Try again</button><button class="act" id="keep">Keep playing</button><button class="act" id="more">Other scenarios</button></div>`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
  document.getElementById('again').onclick = () => startScenario(G.scen.id); document.getElementById('keep').onclick = () => { G.scen = {id: 'free'}; updateScenChip(); closeCard(); }; document.getElementById('more').onclick = scenarioCard;
  const cp = document.getElementById('cpCode'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(G.scen.code); toast('Code copied'); } catch (e) { toast(G.scen.code); } };
}
let friendCodes = []; try { friendCodes = JSON.parse(localStorage.getItem('tilt-friends') || '[]'); } catch (e) { }
function scenarioCard() {
  G.cardFor = {kind: 'scen'}; const [y, w] = weekNo();
  const rows = [...friendCodes, ...(G.scen.code ? [{name: 'You', code: G.scen.code}] : [])].map(f => { const m = /TT-(\d+)W(\d+)-(\d+)/.exec(f.code); return m ? {name: f.name, wk: `${m[1]}W${m[2]}`, score: +m[3]} : null; }).filter(Boolean).filter(r => r.wk === `${y}W${w}`).sort((a, b) => b.score - a.score);
  cardEl.innerHTML = `<div class="ch"><div><b>Scenarios</b><small>Short challenges with a goal and a deadline</small></div><button class="x">×</button></div>
    ${Object.entries(SCEN).map(([k, S]) => `<div class="scn"><p><b>${S.title}</b>${scenBest[k] ? ` <span class="st">${'★'.repeat(scenBest[k])}</span>` : ''}</p><p class="tip">${S.desc}${S.days ? ` · ${S.days} days` : ''}${S.star ? ` · 3★ within ${S.star[0]} days` : ''}</p><button class="act" data-s="${k}">${k === 'free' ? 'New free town' : 'Play'}</button></div>`).join('')}
    <p><span>Week ${w}</span>Compare scores with friends</p>
    ${rows.length ? `<table class="tb">${rows.map((r, i) => `<tr><td>${i + 1}.</td><td>${r.name}</td><td>${r.score}</td></tr>`).join('')}</table>` : '<p class="tip">Paste a friend\'s weekly code below.</p>'}
    <input id="fName" placeholder="Friend's name" style="width:38%"> <input id="fCode" placeholder="TT-…" style="width:52%"><button class="act wide" id="addF">Add friend's code</button>`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
  cardEl.querySelectorAll('[data-s]').forEach(b => b.onclick = () => startScenario(b.dataset.s));
  document.getElementById('addF').onclick = () => { const code = document.getElementById('fCode').value.trim(), name = document.getElementById('fName').value.trim() || 'Friend'; const m = /TT-(\d+)W(\d+)-(\d+)-([0-9a-z]+)/.exec(code); if (!m || ((+m[3] * 7919 + +m[2] * 31) % 997).toString(36) !== m[4]) { toast('That code does not look right'); return; } friendCodes.push({name, code}); try { localStorage.setItem('tilt-friends', JSON.stringify(friendCodes)); } catch (e) { } scenarioCard(); };
}

/* ---- per-day hook ---- */
function metaDay() {
  decayDay(); computeTraits();
  if (G.notables.mayor && G.citizens.includes(G.notables.mayor) && G.day % 7 === 0 && townJoy() > .6) { G.funds += 300; paperNote(`Mayor ${G.notables.mayor.name} secures a €300 grant for the happy town`); }
  if (G.nataCell) G.funds += 40;
  if (traits.has('culture')) G.funds += goals.filter(g => g.done).length * 50;
  resetDayStats(); makeGoals(); rollEvent(); if (traits.has('river') && Math.random() < .4 && !G.events.some(e => e.kind === 'cruise')) G.events.push({kind: 'cruise', at: 11 + Math.random() * 4, dur: 4, started: false, day: G.day});
  checkScenario(true);
}
function metaHour() { checkGoals(); checkStories(); checkScenario(false); computeTraits(); if (G.notables.gossip && G.citizens.includes(G.notables.gossip) && G.paper.length && Math.random() < .4 && G.notables.gossip.state !== 'inside') say3(G.notables.gossip, `Did you hear? ${G.paper.at(-1).items[0].slice(0, 46)}…`); }

/* ---------- town generation ---------- */
function connectStreets() {
  for (let loop = 0; loop < 14; loop++) {
    const comp = new Map(); let n = 0; const sizes = [];
    for (const c of G.cells) { if (comp.has(c) || !walkable(c)) continue; const q = [c]; comp.set(c, n); let k = 0; while (q.length) { const a = q.pop(); k++; for (const [dx, dz] of DIRS) { const b = cellAt(a.i + dx, a.j + dz); if (b && !comp.has(b) && canStep(a, b, dx)) { comp.set(b, n); q.push(b); } } } sizes.push(k); n++; }
    if (n <= 1) return;
    const small = sizes.indexOf(Math.min(...sizes)), dist = new Map(), prev = new Map(), open = [];
    for (const c of G.cells) if (comp.get(c) === small) { dist.set(c, 0); open.push(c); }
    let goal = null;
    while (open.length) {
      open.sort((a, b) => dist.get(b) - dist.get(a)); const a = open.pop();
      if (comp.has(a) && comp.get(a) !== small) { goal = a; break; }
      for (const [dx, dz] of DIRS) { const b = cellAt(a.i + dx, a.j + dz); if (!b || b.owned === false) continue;
        if (!b.water && !a.water && Math.abs(a.lvl - b.lvl) > 1) continue; if ((b.water || a.water) && dx !== 0) continue;
        const cost = walkable(b) ? .2 : b.water ? 4 : b.floors ? 3 + b.floors * .3 : 1, d = dist.get(a) + cost;
        if (d < (dist.get(b) ?? 1e9)) { dist.set(b, d); prev.set(b, a); if (!open.includes(b)) open.push(b); } }
    }
    if (!goal) { G.cells.forEach(c => { if (comp.get(c) === small && !c.water) { /* unreachable pocket: leave */ } }); return; }
    for (let c = goal; c && comp.get(c) !== small; c = prev.get(c)) { if (c.water) c.kind = 'bridge'; else { c.floors = 0; if (c.kind === 'tree') c.kind = null; } }
  }
}
function generate(seed, opt = {}) {
  try { ownReset(); OWN._mark = 1; } catch (e) { }
  G.cells.forEach(c => { if (c.tmesh) terrainG.remove(c.tmesh); if (c.obj) objG.remove(c.obj); }); G.businesses = []; G.tram = null; G.funi = null;
  G.cells = [];
  const R = rng(seed), ph = R() * 6, amp = 2 + R() * 1.5, mid = N / 2 - .5 + (R() - .5) * 2;
  const riverJ = i => Math.round(mid + amp * Math.sin(i * .42 + ph));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const rj = riverJ(i), dist = Math.max(0, j < rj ? rj - j : j - rj - 1);
    const isW = j === rj || j === rj + 1;
    const lvl = isW ? 0 : THREE.MathUtils.clamp(Math.floor(((dist - 1) * .55 + .7 * Math.sin(i * .6 + seed) + .5 * Math.cos(j * .7 + ph) + .3) * (opt.hilly ? 1.9 : 1)), 0, 4);
    const owned = Math.abs(i - 6.5) <= 4.6 && Math.abs(j - 6.5) <= 4.6;
    G.cells.push({i, j, lvl, water: isW, floors: 0, kind: null, seed: Math.floor(R() * 1e6), tmesh: null, obj: null, glows: [], owned: isW || owned, cond: opt.shabby ? .15 + R() * .3 : .75 + R() * .25});
  }
  for (const c of G.cells) {
    if (c.water) continue;
    if (c.owned === false) { if (R() < .35) c.kind = 'tree'; continue; }
    const r = R(), edge = c.i === 0 || c.j === 0 || c.i === N - 1 || c.j === N - 1;
    const bank = DIRS.some(([dx, dz]) => cellAt(c.i + dx, c.j + dz)?.water);
    const street = (c.i % 5 === 2) || (bank && R() < .7);
    if (bank && r < .35) c.kind = 'lamp';
    else if (street) { if (r > .9) c.kind = 'lamp'; }
    else if (edge && r < .3) c.kind = 'tree';
    else if (r < (edge ? .5 : .78)) c.floors = 1 + Math.floor(R() * 3.2) + (R() < .25 ? 2 : 0);
    else if (r < .86) c.kind = 'tree';
  }
  const bi = [2 + Math.floor(R() * 4), 8 + Math.floor(R() * 4)];
  if (!opt.noBridges) bi.forEach(i => G.cells.filter(c => c.i === i && c.water).forEach(c => c.kind = 'bridge'));
  connectStreets();
  assignBusinesses(R);
  if (opt.emptyShops) G.cells.forEach(c => { if (c.biz && R() < .6) c.biz = null; });
  G.cells.forEach(c => { rebuildTerrain(c); rebuildObj(c); });
  rebuildGlows(); rebuildLaundry();
  spawnCitizens(seed);
  G.funds = opt.funds ?? START_FUNDS; cheatApply(); G.ledger = {day: 0, resTax: 0, bizTax: 0, upkeep: 0, closed: [], moved: [], arrived: 0}; G.businesses.forEach(newBizBooks);
  G.requests = []; G.reqDone = []; G.paper = []; G.paperToday = []; G.unlocked = opt.landmarks ? {church: true, tram: true, funicular: true} : {church: false, tram: false, funicular: false}; G.festNight = -1; undoStack.length = 0;
  G.landBought = 0; G.quayWalls = false; G.events = []; G.nataCell = null; G.stageCell = null; marketOn = false; G.scen = {id: 'free'}; water.position.y = -.32; resetDayStats(); pickNotables(); makeStories(); computeTraits(); makeGoals(); updateScenChip();
  rebuildWaterFx(); placeCats(); updateEco(); updateReqChip(); setTimeout(() => { if (!G.requests.length) makeRequest(); }, 4000); G.autosave();
}

export {EVENTS, STORY_DEFS, TRAITS, UNLOCKS, addBlueHour, album, albumCard, buyQuay, checkGoals, computeTraits, concertTime, cruiseG, dayStats, generate, goals, goalsCard, grabPostcard, has, houseExtras, landCard, makeGoals, marketOn, metaDay, metaHour, priceMult, resTaxMult, resetDayStats, riverPath, scenarioCard, shabbyLvl, startScenario, storyDecor, tradeoffs, traits, updateEvents, updateGoalChip, updateScenChip, wireHouseExtras};
