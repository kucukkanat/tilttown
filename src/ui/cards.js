import '../people/animals.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {lerp, pick, rng} from '../core/util.js';
import {camera, canvas, cellAt, controls, objG, terrainG} from '../core/scene.js';
import {rebuildLaundry} from '../world/houses.js';
import {BIZ, SHOPCOL, address, dust, frontFace, hhmm, isOpenAt, pop} from '../world/streets.js';
import {lblRefresh, namePrompt} from '../game/identity.js';
import {warpV} from '../world/organic.js';
import {ACT, FIRST_F, FIRST_M, LAST, bnbInfo, computeMood, makeLook, makePlan, release, satisfy, say3, sd} from '../people/sim.js';
import {buildPeopleMeshes} from '../people/characters.js';
import {BUDGET, firework, scheduleSave, undoStack, writePaper} from '../game/extras.js';
import {UNLOCKS, checkGoals, concertTime, dayStats, has, houseExtras, priceMult, resTaxMult, tradeoffs, wireHouseExtras} from '../game/meta.js';
import {ICON_ATLAS, SHOP_ORDER, iconPos} from '../world/shops.js';
import {postU} from '../render/post.js';
import {ndc, ray, refresh, say} from './input.js';
import {refreshItems} from './dock.js';
import {UPG, coinPop, plotValueHTML, reactAt, rentDrip, synergy, synergyMult} from '../game/progression.js';

G.personCard = personCard; // reassignable: other modules wrap it
G.houseCard = houseCard; // reassignable: other modules wrap it
/* ---------- speech bubbles ---------- */
const bubbleEl = document.getElementById('bubbles'), bubblePool = [];
for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'bub'; bubbleEl.appendChild(d); bubblePool.push(d); }
function updateBubbles() {
  const nowR = performance.now(); let k = 0;
  for (const z of G.citizens) {
    if (k >= bubblePool.length) break;
    if (!z.bubble || z.bubble.until < nowR || z.state === 'inside') continue;
    const p = warpV(z.pos.clone()); p.y += .75 * z.s; if (p.distanceTo(camera.position) > 26) continue;
    p.project(camera); if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
    const d = bubblePool[k++]; d.textContent = z.bubble.text; d.style.transform = `translate(${(p.x * .5 + .5) * innerWidth}px,${(-p.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`; d.style.opacity = 1;
  }
  for (; k < bubblePool.length; k++) bubblePool[k].style.opacity = 0;
}

/* ---------- cards (person, house, shop picker) ---------- */
const cardEl = document.getElementById('card');
G.cardFor = null;
/* selection highlight: the selected model is rendered into its own mask; the post pass draws its contour */
const SEL_LAYER = 2;
let selCell = null, selObj = null, selN = 0;
function markSel(obj, on) { if (obj) obj.traverse(o => { if (o.isMesh) on ? o.layers.enable(SEL_LAYER) : o.layers.disable(SEL_LAYER); }); }
function selTarget(c) { return c ? (c.obj || c.tmesh || null) : null; }
function selectCell(c) { markSel(selObj, false); selCell = c || null; selObj = selTarget(selCell); markSel(selObj, true); selN = 0; }
function updateSelection(t) {
  postU.selOn.value = selObj ? 1 : 0; if (!selCell) return;
  if ((selN++ % 10) === 0) { const o = selTarget(selCell); if (o !== selObj) { markSel(selObj, false); selObj = o; markSel(selObj, true); } }
  postU.selPulse.value = .75 + .25 * Math.sin(t * 4);
}
function closeCard() { cardEl.style.display = 'none'; G.cardFor = null; selectCell(null); }
function describe(z) {
  const w = z.where, s = z.state;
  if (z.role === 'child') return z.state === 'inside' ? (z.parent?.where.type === 'home' ? 'At home' : 'With family') : `Out with ${z.parent.name.split(' ')[0]}`;
  if (s === 'inside') return w.type === 'home' ? 'At home' : w.type === 'work' ? `Working at ${w.b.name}` : w.type === 'cafeIn' ? `Inside ${w.b.name}` : z.role === 'student' ? 'At school' : 'At work, out of town';
  if (s === 'sit') return z.seat?.biz ? `Sitting at ${z.seat.biz.name}` : 'Resting on a bench';
  if (s === 'queue') return `Queueing at ${z.qb?.name}`;
  if (s === 'serve') return `Serving at ${z.work.name}`;
  if (s === 'paint') return 'Painting the river view'; if (s === 'dance') return concertTime() ? 'Dancing at the plaza concert' : 'Dancing at São João'; if (s === 'busk') return 'Playing guitar for the café crowd'; if (z.step?.act === 'deliver') return 'Delivering to the shops';
  if (s === 'talk') return `Chatting with ${z.talk?.with?.name.split(' ')[0] || 'a neighbour'}`;
  if (s === 'idle' && z.step?.act === 'work') return `Running the stall at ${z.work.name}`;
  if (s === 'idle') return z.step?.act === 'dog' ? 'Walking the dog' : 'Taking in the view';
  const g = z.goal; if (!g) return 'Walking';
  return g.kind === 'enter' ? (g.data.type === 'home' ? 'Heading home' : g.data.type === 'away' ? (z.role === 'student' ? 'Off to school' : 'Off to work') : `Going to ${g.data.b?.name}`) : g.kind === 'seat' ? `Going to ${g.data.seat.biz ? g.data.seat.biz.name : 'a bench'}` : g.kind === 'queue' ? `Going to ${z.qb?.name}` : z.step?.act === 'dog' ? 'Walking the dog' : 'Strolling';
}
const roleLabel = z => (z.notable ? `★ ${z.notable} · ` : '') + roleLabel0(z);
const roleLabel0 = z => z.role === 'courier' ? 'Delivers to the shops each morning' : z.role === 'musician' ? 'Street musician' : z.role === 'baby' ? 'Baby' : z.role === 'keeper' ? `Runs ${z.work.name}` : z.role === 'staff' ? `Works at ${z.work.name}` : z.role === 'worker' ? 'Office worker' : z.role === 'retiree' ? 'Retired' : z.role === 'student' ? 'Student' : `Child of ${z.parent?.name.split(' ')[0]}`;
function personCard(z) {
  selectCell(null);
  G.cardFor = {kind: 'person', z};
  const cur = z.step, plan = z.role === 'child' ? '' : `<div class="plan">${z.plan.map(p => `<div class="${p === cur ? 'cur' : ''}"><span>${hhmm(p.at)}</span>${p.act === 'shop' ? BIZ[p.arg]?.label || 'Shopping' : ACT[p.act]}</div>`).join('')}</div>`;
  cardEl.innerHTML = `<div class="ch"><div><b>${z.name}</b><small>${z.age} · ${roleLabel(z)}</small></div><button class="x">×</button></div>
    <p class="now">${describe(z)}</p>
    <p><span>Home</span>${address(z.home)}</p>
    ${z.fav && z.role !== 'child' ? `<p><span>Favourite café</span>${z.fav.name}</p>` : ''}
    ${z.dog ? '<p><span>Dog</span>Yes, walks it daily</p>' : ''}
    <p><span>Mood</span>${Math.round(joyOf(z) * 100)}%${z.why.length ? ': ' + z.why.join(', ') : ''}</p>
    ${z.role !== 'child' ? `<p><span>Wallet</span>${euro(z.wallet || 0)} · earns ${euro(INCOME[z.role] || 0)}/day</p>` : ''}
    ${plan}
    <button class="act wide" id="fol">${G.follow === z ? 'Stop following' : 'Follow'}</button>`;
  cardEl.style.display = 'block';
  cardEl.querySelector('.x').onclick = closeCard;
  cardEl.querySelector('#fol').onclick = () => { G.follow = G.follow === z ? null : z; G.personCard(z); };
}
// a tap on the map can open a card under the finger; swallow the ghost click that follows
cardEl.addEventListener('click', e => { if (performance.now() - (window.__tapAt?.() || 0) < 450) { e.stopPropagation(); e.preventDefault(); } }, true);
function houseCard(c, picker) {
  selectCell(c);
  G.cardFor = {kind: 'house', c, picker};
  const b = c.bizObj, res = c.res || [];
  const shopInfo = b ? `<p><span>Shop</span>${b.name} · ${BIZ[b.type].label}</p><p><span>Hours</span>${BIZ[b.type].hours.map(([a, e]) => `${hhmm(a)}–${hhmm(e)}`).join(', ')} · ${isOpenAt(b.type, G.hour) ? 'Open' : 'Closed'}</p><p><span>Visits</span>${b.visits}</p><p><span>Money</span>${(newBizBooks(b), '')}today ${euro(b.rev)} · cash ${euro(b.cash)} · ${bizStatus(b)}</p><p><span>Costs/day</span>rent ${euro(RENT[b.type])}, wages ${euro(G.citizens.filter(z => z.work === b).reduce((a, z) => a + (WAGE[z.role] || 0), 0))}, tax 20%</p>${(() => { const staff = G.citizens.filter(z => z.work === b); const reg = b.who ? [...b.who.entries()].filter(([z]) => G.citizens.includes(z)).sort((a, d) => d[1] - a[1]).slice(0, 3).map(([z]) => z) : []; const favs = G.citizens.filter(z => z.fav === b && !reg.includes(z)).slice(0, 3 - reg.length); const regs = [...reg, ...favs]; return `${staff.length ? `<p><span>Staff</span>${staff.map(z => `<a data-z="${z.id}">${z.name.split(' ')[0]}</a>`).join(', ')}</p>` : ''}${regs.length ? `<p><span>Regulars</span>${regs.map(z => `<a data-z="${z.id}">${z.name.split(' ')[0]}</a>`).join(', ')}</p>` : ''}`; })()}` : '';
  const pick_ = shopSection(c, shopInfo);
  cardEl.innerHTML = `<div class="ch"><div><b>${address(c)}</b><small>${c.floors} floor${c.floors > 1 ? 's' : ''} · ${res.length} resident${res.length === 1 ? '' : 's'}</small></div><button class="x">×</button></div>
    ${plotValueHTML(c)}${pick_}${houseExtras(c)}
    ${res.length ? `<div class="res">${res.map(z => `<button class="act" data-z="${z.id}">${z.name.split(' ')[0]} · ${z.state === 'inside' && z.where.type === 'home' ? 'home' : 'out'}</button>`).join('')}</div>` : ''}`;
  cardEl.style.display = 'block'; if (G.cardFor.c !== G.houseCard._last) cardEl.scrollTop = 0; G.houseCard._last = c;
  cardEl.querySelector('.x').onclick = closeCard;
  cardEl.querySelectorAll('[data-z]').forEach(bt => bt.onclick = () => G.personCard(G.citizens[+bt.dataset.z]));
  wireHouseExtras(c);
  wireShopSection(c);
}
const CHANGE_COST = () => Math.round(COST.shop * .5);
function shopSection(c, info = '') {
  if (!c.floors) return '';
  if (frontFace(c) === undefined) return `<div class="shopsec"><h5>Shop</h5><p class="tip">Needs a door onto a street to host a shop.</p></div>`;
  const grid = (price, skip) => `<div class="sgrid">${Object.keys(BIZ).filter(k => k !== skip).map(k => BIZ[k].locked && !has(BIZ[k].locked)
    ? `<button class="act stype" disabled><i style="background:${SHOPCOL[k][0]}"></i>${BIZ[k].label}<small>★${UNLOCKS.find(u => u.id === BIZ[k].locked).at}</small></button>`
    : `<button class="act stype${price > G.funds ? ' poor' : ''}" data-b="${k}"><i style="background:${SHOPCOL[k][0]}"></i>${BIZ[k].label}<small>${euro(price)}</small></button>`).join('')}</div>`;
  if (!c.biz) return `<div class="shopsec"><h5>Open a shop</h5>${grid(COST.shop)}<p class="tip">A new shop starts with ${euro(200)} cash and closes if it falls below −${euro(80)}.</p></div>`;
  const closing = performance.now() - (c.closeAsk || 0) < 4000;
  const b = c.bizObj; let head = '';
  if (b) { const st = bizStatus(b), open = isOpenAt(b.type, G.hour), hrs = BIZ[b.type].hours.map(([a, e]) => `${hhmm(a)}–${hhmm(e)}`).join(', ');
    const tone = st === 'Thriving' ? 'good' : st === 'Steady' ? '' : 'bad';
    const rows = info.replace(/<p><span>(Shop|Hours|Visits|Money)<\/span>.*?<\/p>/g, '');
    head = `<div class="shead"><i style="background-image:url(${ICON_ATLAS.url});background-position:${iconPos(Math.max(0, SHOP_ORDER.indexOf(b.type)))}"></i><div><b>${b.name}</b><small>${BIZ[b.type].label} · ${open ? 'Open now' : 'Closed now'} · ${hrs}</small></div><span class="badge ${tone}">${st}</span></div>
      <div class="sstats"><div><b>${euro(b.rev)}</b><small>today</small></div><div><b>${euro(b.cash)}</b><small>cash</small></div><div><b>${b.visits}</b><small>visits</small></div></div>${b.type === 'bnb' ? bnbInfo(b) : ''}${rows}${(() => { const sy = synergy(b); return `<p><span>Location</span>${sy.m >= 1 ? '+' : '−'}${Math.round(Math.abs(sy.m - 1) * 100)}% sales</p>${sy.why.length ? `<p class="tip">${sy.why.map(([t, p]) => `${t} ${p}`).join(' · ')}</p>` : `<p class="tip">Plazas, the river and a mix of shop types nearby boost sales. Too many of the same type hurts.</p>`}`; })()}${(c.bizLvl || 0) < 2 ? `<button class="act wide${UPG[c.bizLvl || 0].cost > G.funds ? ' poor' : ''}" data-sa="upg">${UPG[c.bizLvl || 0].label} · ${euro(UPG[c.bizLvl || 0].cost)} · +12% sales</button>` : `<p class="tip">Fully upgraded: terrace and second counter.</p>`}`; }
  return `<div class="shopsec"><h5>Shop</h5>${head}<div class="grid"><button class="act" data-sa="ren">✎ Rename</button><button class="act" data-sa="change">${c.chgOpen ? 'Cancel' : 'Change type'}</button><button class="act danger" data-sa="close">${closing ? `Tap again · refund ${euro(Math.round(COST.shop * .3))}` : 'Close shop'}</button></div>${c.chgOpen ? `${grid(CHANGE_COST(), c.biz)}<p class="tip">Refitting costs half a new shop. The name, cash and staff stay.</p>` : ''}</div>`;
}
function hireKeeper(c) {
  const b2 = c.bizObj, pool = G.citizens.filter(z => z.role === 'worker' || z.role === 'retiree'); if (!b2 || !pool.length) return;
  const z = pool.sort((a, d) => (Math.abs(a.home.i - c.i) + Math.abs(a.home.j - c.j)) - (Math.abs(d.home.i - c.i) + Math.abs(d.home.j - c.j)))[0];
  z.role = 'keeper'; z.work = b2; z.plan = makePlan(z); z.step = null; makeLook(z, z.R); buildPeopleMeshes();
}
function wireShopSection(c) {
  cardEl.querySelectorAll('[data-sa]').forEach(bt => bt.onclick = () => {
    if (bt.dataset.sa === 'ren') { namePrompt('Rename the shop', 'Painted on the shop front', c.bizName || '', () => pick(Math.random, BIZ[c.biz].names), v => { c.bizName = v; const b = G.businesses.find(o => o.cell === c); if (b) b.name = v; lblRefresh(); refresh(c); G.houseCard(c); }); return; }
    if (bt.dataset.sa === 'upg') { const u = UPG[c.bizLvl || 0]; if (!u) return; G.snapshot(); if (!spend(u.cost, 'an upgrade')) { undoStack.pop(); return; } c.bizLvl = (c.bizLvl || 0) + 1; refresh(c); pop(c); reactAt(c, '✨'); say(`${u.label.replace('Add a', 'New')} for ${c.bizObj?.name || 'the shop'}`); G.houseCard(c); return; }
    if (bt.dataset.sa === 'change') { c.chgOpen = !c.chgOpen; c.closeAsk = 0; G.houseCard(c); return; }
    if (!(performance.now() - (c.closeAsk || 0) < 4000)) { c.closeAsk = performance.now(); c.chgOpen = false; G.houseCard(c); return; }
    c.closeAsk = 0; G.snapshot(); const old = c.bizObj;
    G.citizens.forEach(z => { if (z.work === old) { z.work = null; z.role = 'worker'; z.plan = makePlan(z); z.step = null; } });
    c.biz = null; c.bizLvl = 0; reactAt(c, '☁'); refund(COST.shop); refresh(c, true); dust(c); checkGoals(); say('Shop closed · the ground floor is a home again'); G.houseCard(c);
  });
  cardEl.querySelectorAll('.shopsec [data-b]').forEach(bt => bt.onclick = () => {
    const t = bt.dataset.b; if (!t) return;
    if (!c.biz) {
      G.snapshot(); if (!spend(COST.shop, 'opening a shop')) { undoStack.pop(); return; }
      c.biz = t; c.bizName = pick(Math.random, BIZ[t].names); dayStats.opened[t] = (dayStats.opened[t] || 0) + 1;
      refresh(c, true); pop(c); dust(c); checkGoals(); hireKeeper(c); say(`${BIZ[t].label} opening soon`); G.houseCard(c); return;
    }
    if (t === c.biz) return;
    G.snapshot(); if (!spend(CHANGE_COST(), 'refitting the shop')) { undoStack.pop(); return; }
    const old = c.bizObj, keep = old && {cash: old.cash, visits: old.visits, hist: old.hist, who: old.who};
    c.biz = t; c.chgOpen = false; refresh(c, true); pop(c); dust(c);
    const nb = c.bizObj; if (nb && keep) { Object.assign(nb, keep); G.citizens.forEach(z => { if (z.work === old) { z.work = nb; z.plan = makePlan(z); z.step = null; } }); }
    dayStats.opened[t] = (dayStats.opened[t] || 0) + 1; checkGoals(); say(`Now a ${BIZ[t].label.toLowerCase()}: ${c.bizName}`); G.houseCard(c);
  });
}
function refreshCard() { if (!G.cardFor) return; if (G.cardFor.kind === 'person') { const n = cardEl.querySelector('.now'); if (n) n.textContent = describe(G.cardFor.z); } }
function pickPerson(e) {
  if (G.tool !== 'look') return null;
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([terrainG, objG], true)[0], hd = hit ? hit.distance : Infinity, hc = hit && hit.object.userData.cell;
  const onBuilding = !!(hc && (hc.floors > 0 || (hc.kind && hc.kind !== 'lamp')));
  const k = r.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  let best = null, bd = Infinity;
  for (const z of G.citizens) {
    if (z.state === 'inside') continue; const p = warpV(z.pos.clone()); p.y += .35 * z.s;
    const dist = camera.position.distanceTo(p); if (dist > hd + .3) continue; // hidden behind what was tapped
    const sz = .75 * z.s / dist * k; // person height in pixels
    let rad = Math.min(22, Math.max(6, sz * .9)); if (onBuilding) rad = Math.min(rad, sz * .55 + 3);
    p.project(camera); if (p.z > 1) continue;
    const d = Math.hypot((p.x * .5 + .5) * r.width - (e.clientX - r.left), (-p.y * .5 + .5) * r.height - (e.clientY - r.top)); if (d < rad && d < bd) { bd = d; best = z; }
  }
  return best;
}
function updateFollow(dt) {
  if (!G.follow) return; if (G.follow.state === 'inside') { G.follow = null; return; }
  const tg = warpV(G.follow.pos.clone()); tg.y += .3; controls.target.lerp(tg, Math.min(1, dt * 3));
  const off = camera.position.clone().sub(controls.target), len = off.length(); off.setLength(lerp(len, 6, Math.min(1, dt * 1.5))); camera.position.copy(controls.target).add(off);
}

/* ---------- economy ---------- */
const COST = {house: 150, shop: 200, plaza: 250, tree: 20, lamp: 40, raise: 60, lower: 60, bridge: 300};
const PRICE = {cafe: 5.5, bakery: 4, grocer: 8, tasca: 14, fish: 10, florist: 6, books: 12, barber: 12};
const RENT = {cafe: 28, bakery: 15, grocer: 30, tasca: 45, fish: 24, florist: 18, books: 26, barber: 20};
const WAGE = {staff: 30, keeper: 25}, INCOME = {worker: 70, retiree: 38, student: 16, staff: 30, keeper: 25, child: 0, baby: 0, courier: 55, musician: 30};
const BIZ_TAX = .2, RES_TAX = 4, START_FUNDS = 1500;
G.funds = START_FUNDS; G.ledger = {day: 0, resTax: 0, bizTax: 0, upkeep: 0, closed: [], moved: [], arrived: 0};
const euro = v => v >= 1e11 ? '∞' : `€${Math.round(v).toLocaleString('en-US')}`;
/* ---- cheats: type a code anywhere (or in Menu › Code) ---- */
const CHEAT_BIG = 1e12, INF_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" style="vertical-align:-5px"><path d="M6.6 8.4C4.6 8.4 3 10 3 12s1.6 3.6 3.6 3.6c3.6 0 7.2-7.2 10.8-7.2 2 0 3.6 1.6 3.6 3.6s-1.6 3.6-3.6 3.6c-3.6 0-7.2-7.2-10.8-7.2z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let cheatMoney = false, cheatReal = 0;
try { const c = JSON.parse(localStorage.getItem('tilt-cheat') || 'null'); if (c && c.money) { cheatMoney = true; cheatReal = c.real || 0; } } catch (e) { }
function cheatSave() { try { localStorage.setItem('tilt-cheat', JSON.stringify({money: cheatMoney, real: cheatReal})); } catch (e) { } }
function cheatApply() { if (cheatMoney && G.funds < 1e11) { cheatReal = G.funds; G.funds = CHEAT_BIG; } }
function setCheatMoney(on) {
  if (on === cheatMoney) return; cheatMoney = on;
  if (on) { cheatReal = G.funds; G.funds = CHEAT_BIG; } else G.funds = cheatReal;
  cheatSave(); updateEco(); if (typeof refreshItems === 'function') refreshItems(); if (typeof scheduleSave === 'function') scheduleSave();
  toast(on ? 'Cheat: unlimited money' : 'Unlimited money off'); if (on && typeof firework === 'function') firework();
}
const CHEATS = {elonmusk: () => setCheatMoney(!cheatMoney)};
function tryCheat(text) { const t = String(text).toLowerCase().replace(/[^a-z]/g, ''); for (const k in CHEATS) if (t.endsWith(k)) { CHEATS[k](); return true; } return false; }
{ let buf = ''; addEventListener('keydown', e => { const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return; if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return; buf = (buf + e.key.toLowerCase()).slice(-24); if (tryCheat(buf)) buf = ''; }); }
function spend(v, what) { if (cheatMoney) { updateEco(); return true; } if (G.funds < v) { say(`Not enough money: ${what} costs ${euro(v)}`); flashEco(); return false; } G.funds -= v; updateEco(); return true; }
function refund(v) { G.funds += Math.round(v * .3); updateEco(); }
function newBizBooks(b) { b.cash ??= 200; b.rev ??= 0; b.hist ??= []; b.sales ??= 0; }
function pay(z, b) {
  const p = PRICE[b.type] * (.85 + z.R() * .3);
  if ((z.wallet ?? 0) < p) { say3(z, 'Too expensive today…'); z.missed = (z.missed || 0) + 1; return false; }
  satisfy(z, b.type); let sm = 1; try { sm = synergyMult(b); } catch (e) { } const pm = priceMult(b.type) * sm; z.wallet -= p; newBizBooks(b); b.rev += p * pm; b.cash += p * pm; b.sales++; try { coinPop(b, p * pm); } catch (e) { } dayStats.sales[b.type] = (dayStats.sales[b.type] || 0) + 1; dayStats.served++; z.spentToday = (z.spentToday || 0) + p; z.visitsToday = (z.visitsToday || 0) + 1; return true;
}
function joyOf(z) {
  let j = .55; const why = [];
  if (z.food) j += .12; else { j -= .2; why.push('no bakery or grocer within 6 streets'); }
  if (z.plazaNear) j += .08;
  j += Math.min(.15, (z.visitsToday || 0) * .05);
  if ((z.wallet ?? 0) < 15) { j -= .2; why.push('short of money'); } else if (z.wallet > 120) j += .05;
  if (z.missed) { j -= Math.min(.2, z.missed * .07); why.push('could not afford something'); }
  if (z.bonus) j += z.bonus;
  j += tradeoffs(z, why);
  z.joy = THREE.MathUtils.clamp(j, 0, 1); z.why = why; return z.joy;
}
const townJoy = () => { const a = G.citizens.filter(z => z.role !== 'child' && z.role !== 'baby'); if (!a.length) return 0; let s = 0, w = 0; for (const z of a) { const k = z.notable ? 2 : 1; s += joyOf(z) * k; w += k; } return s / w; };
function bizStatus(b) { const h = b.hist; const avg = h.length ? h.reduce((a, v) => a + v, 0) / h.length : 0; return b.cash < 40 ? 'Struggling' : avg > 25 ? 'Thriving' : avg < -5 ? 'Losing money' : 'Steady'; }
function runDay() {
  const L = {day: G.day, resTax: 0, bizTax: 0, upkeep: 0, closed: [], moved: [], arrived: 0};
  // households: income, residents' tax scaled by mood
  for (const z of G.citizens) {
    if (z.role === 'child') continue;
    z.wallet = (z.wallet || 0) + (INCOME[z.role] || 0);
    const tax = RES_TAX * joyOf(z) * resTaxMult(z.home); z.wallet -= tax; L.resTax += tax;
  }
  // businesses: tax on revenue, rent, wages; close when broke
  for (const b of [...G.businesses]) {
    newBizBooks(b);
    const tax = b.rev * BIZ_TAX, staff = G.citizens.filter(z => z.work === b).reduce((a, z) => a + (WAGE[z.role] || 0), 0);
    const profit = b.rev - tax - RENT[b.type] - staff;
    b.cash -= tax + RENT[b.type] + staff; L.bizTax += tax;
    b.hist.push(profit); if (b.hist.length > 3) b.hist.shift(); b.lastRev = b.rev; b.lastProfit = profit; b.rev = 0; b.sales = 0;
    if (b.cash < -80) { L.closed.push(b.name); b.cell.biz = null; b.cell.bizLvl = 0; reactAt(b.cell, '☁'); }
  }
  // town upkeep
  for (const c of G.cells) L.upkeep += c.kind === 'lamp' ? 1 : c.kind === 'plaza' ? 4 : c.kind === 'bridge' ? 2 : 0;
  G.funds += L.resTax + L.bizTax - L.upkeep - Math.min(rentDrip.paid, L.resTax); rentDrip.paid = 0;
  if (L.closed.length) { L.closed.forEach(n => setTimeout(() => toast(`${n} closed down: it ran out of money`), 400)); G.cells.filter(c => c.floors && !c.biz && c.bizObj).forEach(c => refresh(c, true)); }
  // unhappy people move away; a happy town attracts newcomers
  const avg = townJoy();
  for (const z of [...G.citizens]) if (z.role !== 'child' && z.role !== 'baby' && z.joy < .25 && Math.random() < .35) { L.moved.push(z.name); removeCitizen(z); }
  if (avg > .6) { const homes = G.cells.filter(c => c.floors > 0 && frontFace(c) !== undefined && (c.res || []).length < c.floors * 2); for (let k = 0; k < 2 && homes.length && G.citizens.length < (BUDGET()); k++) { newResident(pick(Math.random, homes), rng(Math.floor(Math.random() * 1e9))); L.arrived++; } }
  if (L.moved.length || L.arrived) { G.citizens.forEach((z, i) => z.id = i); computeMood(); buildPeopleMeshes(); }
  const LE = {items: []}; G.lifeEvents(LE); if (LE.items.length) { G.citizens.forEach((z, i) => z.id = i); buildPeopleMeshes(); }
  G.citizens.forEach(z => { z.visitsToday = 0; z.missed = 0; z.spentToday = 0; if (z.bonusUntil != null && G.day > z.bonusUntil) z.bonus = 0; });
  G.paperToday.push(...LE.items); G.paper.push({day: G.day, items: writePaper(L)}); if (G.paper.length > 5) G.paper.shift();
  rebuildLaundry();
  G.ledger = L; updateEco();
  toast(`Day ${G.day} closed: +${euro(L.resTax + L.bizTax)} taxes, −${euro(L.upkeep)} upkeep${L.moved.length ? ` · ${L.moved.length} moved away` : ''}${L.arrived ? ` · ${L.arrived} moved in` : ''}`);
}
function removeCitizen(z) {
  release(z); G.citizens = G.citizens.filter(o => o !== z); if (z.home.res) z.home.res = z.home.res.filter(o => o !== z);
  G.citizens.filter(o => o.parent === z).forEach(c => { const a = c.home.res?.find(o => o.role !== 'child' && o !== z); if (a) c.parent = a; else removeCitizen(c); });
  if (G.follow === z) G.follow = null; if (G.cardFor?.z === z) closeCard();
}
function newResident(h, R) {
  const male = R() < .5, fam = h.res?.[0]?.name.split(' ')[1] || pick(R, LAST);
  const z = {id: G.citizens.length, male, name: `${pick(R, male ? FIRST_M : FIRST_F)} ${fam}`, home: h, ...sd(R), pos: new THREE.Vector3(), yaw: 0, state: 'inside', where: {type: 'home'}, wp: [], lane: (R() - .5) * .6, phase: 0, talkCD: 0, carry: false};
  const r = R(); z.role = r < .3 ? 'retiree' : r < .5 ? 'student' : 'worker'; if (z.role === 'worker') z.work = 'away';
  z.age = z.role === 'retiree' ? 66 + Math.floor(R() * 20) : z.role === 'student' ? 18 + Math.floor(R() * 6) : 25 + Math.floor(R() * 35);
  z.chatty = R() < .55; z.dog = null; const cafes = G.businesses.filter(b => b.type === 'cafe'); z.fav = cafes.length ? pick(R, cafes) : null;
  z.wallet = 60 + R() * 120; makeLook(z, z.R); z.plan = makePlan(z); z.step = null; G.citizens.push(z); (h.res ||= []).push(z);
  say3(z, 'Just moved in!'); return z;
}
/* UI: money chip, ledger card, toasts */
const ecoEl = document.getElementById('eco'), toastEl = document.getElementById('toast');
let toastT;
function toast(t) { toastEl.textContent = t; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => toastEl.style.opacity = 0, 4200); }
function flashEco() { ecoEl.classList.remove('flash'); void ecoEl.offsetWidth; ecoEl.classList.add('flash'); }
function updateEco() { const j = townJoy(); ecoEl.innerHTML = `<b${cheatMoney ? ' title="Unlimited money (cheat)"' : ''}>${cheatMoney ? INF_SVG : euro(G.funds)}</b><span>Mood ${Math.round(j * 100)}%</span><span>${G.citizens.length} people</span>`; }
ecoEl.onclick = () => ledgerCard();
function ledgerCard() {
  G.cardFor = {kind: 'ledger'};
  const j = townJoy(), adults = G.citizens.filter(z => z.role !== 'child'), noFood = adults.filter(z => !z.food).length, poor = adults.filter(z => (z.wallet ?? 0) < 15).length;
  const rows = G.businesses.map(b => { newBizBooks(b); return `<tr><td><a data-h="${b.cell.i},${b.cell.j}">${b.name}</a></td><td>${euro(b.rev)}</td><td>${euro(b.cash)}</td><td>${bizStatus(b)}</td></tr>`; }).join('');
  cardEl.innerHTML = `<div class="ch"><div><b>Town ledger</b><small>Day ${G.day + 1} · ${hhmm(G.hour)}</small></div><button class="x">×</button></div>
    <p><span>Treasury</span><b>${euro(G.funds)}</b></p>
    <p><span>Yesterday</span>${G.day === 0 ? 'First day: taxes are collected at midnight' : `+${euro(G.ledger.resTax)} residents, +${euro(G.ledger.bizTax)} shops, −${euro(G.ledger.upkeep)} upkeep`}</p>
    <p><span>Mood</span>${Math.round(j * 100)}%${noFood ? ` · ${noFood} lack a bakery or grocer` : ''}${poor ? ` · ${poor} short of money` : ''}</p>
    <p><span>Mood effects</span>above 60% attracts newcomers; under 30% people move away</p>
    <table class="tb"><tr><th>Shop</th><th>Today</th><th>Cash</th><th>Status</th></tr>${rows || '<tr><td colspan="4">No shops yet</td></tr>'}</table>
    <p class="tip">Building costs: floor ${euro(COST.house)}, shop ${euro(COST.shop)}, plaza ${euro(COST.plaza)}, bridge ${euro(COST.bridge)}, lamp ${euro(COST.lamp)}, tree ${euro(COST.tree)}. Erasing refunds 30%.</p>`;
  cardEl.style.display = 'block';
  cardEl.querySelector('.x').onclick = closeCard;
  cardEl.querySelectorAll('[data-h]').forEach(a => a.onclick = () => { const [i, jj] = a.dataset.h.split(',').map(Number); G.houseCard(cellAt(i, jj), false); });
}

export {COST, INCOME, PRICE, RENT, RES_TAX, SEL_LAYER, START_FUNDS, bizStatus, bubbleEl, cardEl, cheatApply, closeCard, euro, joyOf, newBizBooks, newResident, pay, pickPerson, refreshCard, refund, removeCitizen, runDay, selCell, selObj, selTarget, selectCell, spend, toast, townJoy, tryCheat, updateBubbles, updateEco, updateFollow, updateSelection};
