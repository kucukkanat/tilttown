import '../render/post.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {MAXF, N, S, lerp, pick} from '../core/util.js';
import {DIRS, camera, canvas, cellAt, controls, litU, objG, renderer, scene, skyU, terrainG, topY, waterU, wx} from '../core/scene.js';
import {LEAVES, laundryG, leafGeo, leafPos, leafSeed, rebuildGlows, rebuildLaundry, rebuildObj, rebuildTerrain, updateShopLife} from '../world/houses.js';
import {dust, hhmm, hourToTod, pop, updateBirds, updateBoats, updatePops, updateSmoke, walkable} from '../world/streets.js';
import {OWN, PALETTES, VISIT, cellKey, plazaCard, streetCard} from '../game/identity.js';
import {cityRefresh, makePlan} from '../people/sim.js';
import {SK} from '../people/characters.js';
import {updateAnimals} from '../people/animals.js';
import {COST, SEL_LAYER, cardEl, closeCard, euro, pickPerson, refreshCard, refund, selObj, selectCell, spend, toast, updateBubbles, updateFollow, updateSelection} from './cards.js';
import {AC, LM_COST, SAVE_KEY, UNLOCK, checkRequests, checkUnlocks, governor, initSound, live, loadTown, lookStyle, paperNote, photo, planFuni, planTram, qPaint, rebuildWaterFx, scheduleSave, undoStack, updateCats, updateFestival, updateSound, updateTransit, updateWeather} from '../game/extras.js';
import {UNLOCKS, checkGoals, dayStats, generate, grabPostcard, has, landCard, updateEvents} from '../game/meta.js';
import {updateIntro, updateVisuals} from '../world/visuals.js';
import {mapOn, renderMapPass, updateMapUI} from '../world/shops.js';
import {renderHoverPass, updateClarity} from '../render/clarity.js';
import {PRESETS, applyLook, maskMat, maskRT, postCam, postScene, postU, resize, rt, selRT} from '../render/post.js';
import {rad, updateUI} from './dock.js';
import {DIST, DIST_ORDER} from '../game/progression.js';
import {updateGame2} from '../main.js';

/* ---------- UI ---------- */
const ICON = {
  landmark: '<path d="M12 2v3M10 4h4M8 21V9l4-3 4 3v12M5 21h14"/><path d="M11 21v-4h2v4"/>',
  look: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  shop: '<path d="M4 10h16l-1.5-5h-13zM5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  plaza: '<ellipse cx="12" cy="17" rx="8" ry="3"/><path d="M12 14V7M9 7h6"/><path d="M10 4c1 1 3 1 4 0"/>',
  house: '<path d="M4 20V10l8-6 8 6v10z"/><path d="M10 20v-5h4v5"/>',
  tree: '<path d="M12 21v-7"/><circle cx="12" cy="9" r="5"/>',
  lamp: '<path d="M9 21h6M12 21V6h4"/><path d="M15 6h3v4h-3z"/>',
  raise: '<path d="M4 18h16M12 14V4M8 8l4-4 4 4"/>',
  lower: '<path d="M4 18h16M12 4v10M8 10l4 4 4-4"/>',
  erase: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  district: '<path d="M4 4h7v7H4zM13 13h7v7h-7z"/><path d="M13 4h7v7h-7z" stroke-dasharray="2 2"/>',
};
const TOOLS = [['look', 'Look'], ['house', 'House'], ['shop', 'Shop'], ['plaza', 'Plaza'], ['landmark', 'Landmark'], ['tree', 'Tree'], ['lamp', 'Lamp'], ['raise', 'Raise'], ['lower', 'Lower'], ['district', 'District'], ['erase', 'Erase']];
G.tool = 'look';
const toolsEl = document.getElementById('tools');
TOOLS.forEach(([id, label]) => { const b = document.createElement('button'); b.innerHTML = `<svg viewBox="0 0 24 24">${ICON[id]}</svg>${label}`; b.onclick = () => { G.tool = id; [...toolsEl.children].forEach(x => x.classList.toggle('on', x === b)); const cst = {house: `${euro(COST.house)} per floor (water: bridge ${euro(COST.bridge)})`, shop: `${euro(COST.shop)} to open`, plaza: euro(COST.plaza), landmark: 'church, tram and funicular unlock as the town grows', tree: euro(COST.tree), lamp: euro(COST.lamp), raise: euro(COST.raise), lower: euro(COST.lower), erase: 'refunds 30%'}[id]; if (cst) say(`${label}: ${cst}`); }; if (id === G.tool) b.classList.add('on'); toolsEl.appendChild(b); });
const presetsEl = document.getElementById('presets');
PRESETS.forEach(p => { const b = document.createElement('button'); b.innerHTML = `<i style="background:${p.dot}"></i><span>${p.name}</span>`; b.title = p.name; if (p.locked) b.classList.add('locked'); b.onclick = () => { if (p.locked && !has(p.locked)) { say(`Unlocks at ★${UNLOCKS.find(u => u.id === p.locked).at}`); return; } b.classList.remove('locked'); G.preset = p; [...presetsEl.children].forEach(x => x.classList.toggle('on', x === b)); applyLook(); }; if (p === G.preset) b.classList.add('on'); presetsEl.appendChild(b); });
const timeEl = document.getElementById('time');
timeEl.oninput = () => { const nh = +timeEl.value; if (nh < G.hour - 1) { G.day++; G.citizens.forEach(z => { z.plan = makePlan(z); }); } G.hour = nh; G.citizens.forEach(z => z.step = null); };
document.querySelectorAll('.spd .act').forEach(b => b.onclick = () => { G.speed = +b.dataset.s; document.querySelectorAll('.spd .act').forEach(x => x.classList.toggle('on', x === b)); });
const clkEl = document.getElementById('clk');
document.getElementById('snd').onclick = e => { if (!AC) initSound(); else if (AC.state === 'running') AC.suspend(); else AC.resume(); setTimeout(() => e.target.classList.toggle('on', live()), 120); };
document.getElementById('rand').onclick = () => generate(Math.floor(Math.random() * 1e6));
document.getElementById('clear').onclick = () => { G.cells.forEach(c => { c.floors = 0; c.kind = null; c.biz = null; }); G.cells.forEach(rebuildObj); rebuildGlows(); rebuildLaundry(); cityRefresh(); closeCard(); };
const hint = document.getElementById('hint'); let hintT;
function say(t) { hint.textContent = t; hint.style.opacity = 1; clearTimeout(hintT); hintT = setTimeout(() => hint.style.opacity = 0, 1200); }

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickCell(e) {
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([terrainG, objG], true)[0];
  if (hit) return hit.object.userData.cell;
  const p = new THREE.Vector3(); if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), .3), p)) return cellAt(Math.round(p.x / S + (N - 1) / 2), Math.round(p.z / S + (N - 1) / 2));
  return null;
}
function landmarkCard(c) {
  selectCell(c);
  G.cardFor = {kind: 'lm'}; const U = UNLOCK(), n = G.citizens.length;
  const row = (k, label, what) => `<p><span>${label}</span>${G.unlocked[k] ? `${euro(LM_COST[k])} · ${what}` : `Locked until ${U[k]} residents (now ${n})`}</p>${G.unlocked[k] ? `<button class="act wide" data-l="${k}">${k === 'church' ? 'Build church on this spot' : k === 'tram' ? (G.tram ? 'Rebuild tram line' : 'Build tram line') : (G.funi ? 'Rebuild funicular' : 'Build funicular')}</button>` : ''}`;
  cardEl.innerHTML = `<div class="ch"><div><b>Landmarks</b><small>Unlocked as the town grows</small></div><button class="x">×</button></div>
    ${row('church', 'Church', 'a bell tower on the empty spot you tapped')}${row('tram', 'Tram', 'runs along the longest straight, level street')}${row('funicular', 'Funicular', 'climbs the steepest slope')}${has('statue') ? `<p><span>Statue plaza</span>${euro(350)} · a bronze statue with benches on the spot you tapped</p><button class="act wide" data-l="statue">Build statue plaza</button>` : `<p><span>Statue plaza</span>Unlocks at ★22</p>`}`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
  cardEl.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
    const k = b.dataset.l;
    if (k === 'statue') { if (c.water || c.floors || c.kind) { say('Tap an empty street spot first'); return; } G.snapshot(); if (!spend(350, 'the statue plaza')) { undoStack.pop(); return; } c.kind = 'plaza'; c.statue = true; refresh(c, true); pop(c); dust(c); paperNote('A bronze statue is unveiled on the new plaza'); }
    if (k === 'church') { if (c.water || c.floors || c.kind) { say('Tap an empty street spot first'); return; } G.snapshot(); if (!spend(LM_COST.church, 'the church')) { undoStack.pop(); return; } c.kind = 'church'; refresh(c, true); pop(c); dust(c); paperNote('The new church bell rings for the first time'); }
    if (k === 'tram') { const pl = planTram(); if (!pl) { say('Needs a straight, level street at least 4 cells long'); return; } G.snapshot(); if (!spend(LM_COST.tram, 'the tram')) { undoStack.pop(); return; } G.tram = pl; rebuildLaundry(); paperNote('Ding ding! The tram starts running'); }
    if (k === 'funicular') { const pl = planFuni(); if (!pl) { say('Needs a slope rising 2+ levels within 5 cells'); return; } G.snapshot(); if (!spend(LM_COST.funicular, 'the funicular')) { undoStack.pop(); return; } G.funi = pl; rebuildLaundry(); paperNote('The funicular opens: no more climbing the hill'); }
    closeCard(); scheduleSave();
  });
}
function refresh(c, nbToo) {
  rebuildObj(c);
  if (nbToo) DIRS.forEach(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); if (n && n.floors > 0) rebuildObj(n); });
  rebuildGlows(); rebuildLaundry(); cityRefresh(); rebuildWaterFx(); checkRequests(); checkUnlocks(); scheduleSave();
}
function apply(c) {
  if (!c) return;
  if (VISIT && G.tool !== 'look') { say('Visiting: look around only'); return; }
  if (c.owned === false && !c.water) return landCard(c);
  if (!['look', 'shop', 'landmark'].includes(G.tool)) G.snapshot();
  if (G.tool === 'landmark') return landmarkCard(c);
  if (G.tool === 'look') { if (c.floors > 0) G.houseCard(c, false); else if (c.broken) { selectCell(c); G.cardFor = {kind: 'lamp'}; cardEl.innerHTML = `<div class="ch"><div><b>Broken street lamp</b><small>Knocked out by the storm</small></div><button class="x">×</button></div><button class="act wide" id="fixL">Repair for €20</button>`; cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard; document.getElementById('fixL').onclick = () => { if (!spend(20, 'a repair')) return; c.broken = false; rebuildObj(c); rebuildGlows(); closeCard(); }; } else if (c.kind === 'plaza') plazaCard(c); else if (!c.water && !c.kind && walkable(c)) streetCard(c); else closeCard(); return; }
  if (G.tool === 'shop') { if (!c.floors) { say('Tap a house'); return; } G.houseCard(c); return; }
  if (G.tool === 'plaza') { if (c.water || c.floors > 0) { say('Needs an empty street'); return; } if (c.kind !== 'plaza' && !spend(COST.plaza, 'a plaza')) return; if (c.kind === 'plaza') refund(COST.plaza); c.kind = c.kind === 'plaza' ? null : 'plaza'; refresh(c); if (c.kind) { pop(c); dust(c); if (!OWN.plazas[cellKey(c)]) setTimeout(() => plazaCard(c), 600); } return; }
  if (G.tool === 'house') {
    if (c.water) { if (c.kind !== 'bridge' && !spend(COST.bridge, 'a bridge')) return; if (c.kind === 'bridge') refund(COST.bridge); c.kind = c.kind === 'bridge' ? null : 'bridge'; refresh(c); if (c.kind) { pop(c); dust(c); } return; }
    if (c.floors >= MAXF) { say('Tall enough!'); return; }
    if (!spend(COST.house, 'a floor')) return;
    const was = c.floors; c.kind = null; c.floors++; if (!was) { c.cond = 1; c.paint = OWN.palette ? {w: pick(Math.random, PALETTES[OWN.palette])} : null; } dayStats.floors++; refresh(c, was === 0); pop(c); dust(c); checkGoals();
  } else if (G.tool === 'tree' || G.tool === 'lamp') {
    if (c.water) return;
    if (c.floors > 0) { c.yard ||= []; if (c.yard.length >= 2) { say('This garden is full'); return; } if (!spend(COST[G.tool], `a ${G.tool}`)) return; c.yard.push(G.tool); refresh(c); pop(c); dust(c); return; }
    if (c.kind === G.tool) return; if (!spend(COST[G.tool], `a ${G.tool}`)) return;
    c.kind = G.tool; refresh(c); pop(c); dust(c);
  } else if (G.tool === 'erase') {
    if (c.floors > 0) { refund(COST.house); c.floors--; if (!c.floors) { c.biz = null; c.yard = []; } refresh(c, c.floors === 0); } else if (c.kind) { refund(COST[c.kind] || 0); c.kind = null; refresh(c); }
  } else if (G.tool === 'district') {
    if (c.water) return; const nd = DIST_ORDER[(DIST_ORDER.indexOf(c.dist || null) + 1) % DIST_ORDER.length]; c.dist = nd; rebuildTerrain(c); say(nd ? `${DIST[nd].label}: ${{old: 'homes +10% rent', river: 'homes +5%, cafés, florists, fishmongers, wine bars +10%', market: 'all shops +10%'}[nd]}` : 'District cleared'); if (mapOn) G.buildMapUI();
  } else if (G.tool === 'raise' || G.tool === 'lower') {
    if (c.water) return; const nl = c.lvl + (G.tool === 'raise' ? 1 : -1); if (nl < 0 || nl > 4) return;
    if (!spend(COST.raise, 'terrain work')) return;
    c.lvl = nl; rebuildTerrain(c); DIRS.forEach(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); if (n) rebuildTerrain(n); }); refresh(c, true);
  }
}
const marker = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(S * .98, .05, S * .98)), new THREE.LineBasicMaterial({color: 0xfff0d0, transparent: true, opacity: .8}));
marker.visible = false; scene.add(marker);
G.down = null;
canvas.addEventListener('pointerdown', e => { G.down = {x: e.clientX, y: e.clientY, t: performance.now()}; });
let tapAt = 0; window.__tapAt = () => tapAt;
canvas.addEventListener('pointerup', e => {
  tapAt = performance.now();
  if (G.down && Math.hypot(e.clientX - G.down.x, e.clientY - G.down.y) < 7 && performance.now() - G.down.t < 500) { const z = pickPerson(e); if (z) G.personCard(z); else apply(pickCell(e)); }
  G.down = null;
});
canvas.addEventListener('pointermove', e => {
  if (G.down && G.follow && Math.hypot(e.clientX - G.down.x, e.clientY - G.down.y) > 7) { G.follow = null; if (G.cardFor?.kind === 'person') G.personCard(G.cardFor.z); }
  if (e.pointerType !== 'mouse' || e.buttons) { marker.visible = false; return; }
  const c = pickCell(e); marker.visible = !!c;
  if (c) marker.position.set(wx(c.i), topY(c) + .03, wx(c.j));
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
/* ---------- camera: orbit around the point under the pointer, zoom toward the pointer ---------- */
controls.enableRotate = false; controls.zoomToCursor = true; controls.screenSpacePanning = false;
const pivot = new THREE.Vector3(), pivotDot = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({color: 0xfff0d0, transparent: true, opacity: .85, depthTest: false}));
pivotDot.renderOrder = 10; pivotDot.visible = false; scene.add(pivotDot);
const activePtrs = new Set(); G.rot = null;
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3(), _fw = new THREE.Vector3();
function pickPivot(e) {
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([terrainG, objG, laundryG], true)[0];
  if (hit) return pivot.copy(hit.point);
  if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pivot)) return pivot;
  return pivot.copy(controls.target);
}
function rotAbout(q) { camera.position.sub(pivot).applyQuaternion(q).add(pivot); controls.target.sub(pivot).applyQuaternion(q).add(pivot); camera.quaternion.premultiply(q); }
const camLocked = () => typeof rad !== 'undefined' && !!rad;
function orbitBy(yaw, pitch) {
  rotAbout(_q1.setFromAxisAngle(_ax.set(0, 1, 0), yaw));
  _ax.set(1, 0, 0).applyQuaternion(camera.quaternion); _q2.setFromAxisAngle(_ax, pitch);
  _fw.set(0, 0, -1).applyQuaternion(camera.quaternion).applyQuaternion(_q2);
  if (_fw.y < -.06 && _fw.y > -.995) rotAbout(_q2);
  camera.updateMatrixWorld();
}
canvas.addEventListener('pointerdown', e => {
  activePtrs.add(e.pointerId);
  if (activePtrs.size > 1) { G.rot = null; pivotDot.visible = false; return; }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  G.rot = {x: e.clientX, y: e.clientY, moved: false, id: e.pointerId};
});
canvas.addEventListener('pointermove', e => {
  if (camLocked()) { G.rot = null; pivotDot.visible = false; return; }
  if (!G.rot || e.pointerId !== G.rot.id || activePtrs.size > 1) return;
  const dx = e.clientX - G.rot.x, dy = e.clientY - G.rot.y;
  if (!G.rot.moved) { if (Math.hypot(dx, dy) < 5) return; G.rot.moved = true; pickPivot({clientX: G.rot.x, clientY: G.rot.y}); pivotDot.position.copy(pivot); pivotDot.visible = true; if (photo) controls.autoRotate = false; }
  G.rot.x = e.clientX; G.rot.y = e.clientY;
  const k = 2 * Math.PI / canvas.clientHeight * .85;
  orbitBy(-dx * k, -dy * k);
});
const endPtr = e => { activePtrs.delete(e.pointerId); if (G.rot && G.rot.id === e.pointerId) { G.rot = null; pivotDot.visible = false; } };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('lostpointercapture', endPtr);

/* ---------- loop ---------- */
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  updateIntro(dt); controls.update();
  skyU.time.value = t; postU.time.value = t; litU.uTime.value = t; waterU.uTime.value = t; updateBoats(t);
  updateSmoke(dt, t); updatePops(dt); updateBirds(t);
  G.updateCity(dt); G.poseAll(t); updateBubbles(); updateFollow(dt); updateSound(dt);
  updateSelection(t); updateEvents(dt); updateWeather(dt, t); updateFestival(dt); updateTransit(dt); updateCats(dt, t); updateAnimals(t); updateShopLife(t, dt); governor(dt);
  postU.paint.value = (lookStyle === 'illus' ? .7 : 1) * lerp(.55, 1.8, THREE.MathUtils.clamp((camera.position.distanceTo(controls.target) - 7) / 35, 0, 1)) * qPaint;
  G.tod = hourToTod(G.hour); applyLook(); clkEl.textContent = hhmm(G.hour); if (document.activeElement !== timeEl) timeEl.value = G.hour;
  if ((frame.n = (frame.n || 0) + 1) % 30 === 0) refreshCard();
  const w = G.preset.wind, lv = G.preset.leaves;
  for (let i = 0; i < LEAVES; i++) {
    const s = leafSeed[i], k = i * 3;
    leafPos[k] += (w * 1.6 + Math.sin(t * 1.3 + s) * .8) * dt;
    leafPos[k + 1] -= (.5 + Math.sin(t * 2 + s) * .3) * dt;
    leafPos[k + 2] += (Math.cos(t * .9 + s) * .6 + w * .5) * dt;
    if (leafPos[k] > 20) leafPos[k] -= 40; if (leafPos[k + 2] > 20) leafPos[k + 2] -= 40;
    if (leafPos[k + 1] < -.5) leafPos[k + 1] += 16;
  }
  leafGeo.attributes.position.needsUpdate = true; updateVisuals(dt, t); updateClarity(dt); updateUI(dt); updateGame2(dt, t);
  leafGeo.setDrawRange(0, Math.floor(LEAVES * lv));
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  scene.overrideMaterial = maskMat; camera.layers.set(1); const fog = scene.fog; scene.fog = null;
  renderer.setRenderTarget(maskRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
  { const ac = renderer.autoClear; renderer.autoClear = false; camera.layers.set(0); renderer.render(SK.maskScene, camera); renderer.autoClear = ac; camera.layers.set(1); }
  if (selObj) { camera.layers.set(SEL_LAYER); renderer.setRenderTarget(selRT); renderer.clear(); renderer.render(scene, camera); }
  scene.overrideMaterial = null; camera.layers.set(0); scene.fog = fog;
  renderHoverPass(); renderMapPass(); updateMapUI();
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  if (G.snapPending) { G.snapPending = false; grabPostcard(); }
  requestAnimationFrame(frame);
}
try { G.stars = +(localStorage.getItem('tilt-stars') || 0); } catch (e) { }
resize();
let loaded = false; try { const s = localStorage.getItem(SAVE_KEY); if (s) { loadTown(JSON.parse(s)); loaded = true; setTimeout(() => toast(`Welcome back! Day ${G.day + 1} in your town`), 600); } } catch (e) { console.warn('save unreadable', e); }
if (!loaded) generate(1234);

export {ICON, TOOLS, apply, clkEl, frame, marker, ndc, pickCell, pivotDot, presetsEl, ray, refresh, say, timeEl, toolsEl};
