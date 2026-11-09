import '../world/shops.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {FH, LV, S} from '../core/util.js';
import {camera, canvas, cobbleMat, controls, renderer, scene, topY, wx} from '../core/scene.js';
import {LEAVES, laundryG, leafGeo} from '../world/houses.js';
import {warpV} from '../world/organic.js';
import {COST, bizStatus, selCell, selTarget} from '../ui/cards.js';
import {reqEl} from '../game/extras.js';
import {_mp, mapK} from '../world/shops.js';
import {maskMat, postU, rt} from './post.js';
import {apply, marker, pickCell, say} from '../ui/input.js';

/* ==========================================================================
   CLARITY: hover highlight, build preview, see-through occluders,
   focus-aware paint, detail LOD, status pins, clean mode
   ========================================================================== */
const HOV_LAYER = 5;
let hovCell = null, hovObj = null, hovRT = null, hovOn = 0;
function markHov(obj, on) { if (obj) obj.traverse(o => { if (o.isMesh) on ? o.layers.enable(HOV_LAYER) : o.layers.disable(HOV_LAYER); }); }
function setHover(c) {
  if (c === hovCell && selTarget(c) === hovObj) return;
  markHov(hovObj, false); hovCell = c || null; hovObj = hovCell ? selTarget(hovCell) : null; markHov(hovObj, true);
}
/* ghost preview of what the active tool will do */
const ghostMat = new THREE.MeshBasicMaterial({color: 0xfff4dc, transparent: true, opacity: .32, depthWrite: false});
const ghostLine = new THREE.LineBasicMaterial({color: 0xfff4dc, transparent: true, opacity: .9});
const ghost = new THREE.Group(); ghost.visible = false; scene.add(ghost);
const tagEl = document.createElement('div'); tagEl.id = 'tag'; document.body.appendChild(tagEl);
{ const st = document.createElement('style'); st.textContent = `
  #tag{position:fixed;pointer-events:none;transform:translate(-50%,-140%);font:600 12px 'Bricolage Grotesque',system-ui,sans-serif;color:#f3e6cc;background:rgba(28,20,16,.8);padding:5px 9px;border-radius:8px;white-space:nowrap;display:none;box-shadow:0 3px 10px rgba(0,0,0,.35)}
  #tag.bad{color:#ffb4a0}
  #pins{position:fixed;inset:0;pointer-events:none}
  .pin{position:absolute;transform:translate(-50%,-100%);width:26px;height:26px;border-radius:50% 50% 50% 4px;rotate:-45deg;display:grid;place-items:center;pointer-events:auto;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,.4);border:2px solid #f3e6cc}
  .pin span{rotate:45deg;font:700 13px 'Bricolage Grotesque',system-ui,sans-serif;color:#fff}
  body.clean #title,body.clean #chips,body.clean #presets,body.clean #pins,body.clean #legend,body.clean #mapIcons,body.clean #goalChip{visibility:hidden!important}
  #cleanB.on{background:#f0a35c;color:#24170f}
  #pinsB.on{box-shadow:inset 0 0 0 1px rgba(243,230,204,.45)}
  #presets.collapsed button:not(.on):not(.tog){display:none}
  #presets .tog{justify-content:center;opacity:.75;font-size:11px;padding:4px 8px}
  @media (max-width:700px){#presets{transform-origin:top right}}`; document.head.appendChild(st); }
function ghostGeo(kind, c) {
  ghost.clear(); const y = topY(c), add = (g, oy = 0) => { const m = new THREE.Mesh(g, ghostMat); m.position.y = oy; ghost.add(m); const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), ghostLine); l.position.y = oy; ghost.add(l); };
  warpV(ghost.position.set(wx(c.i), y, wx(c.j)));
  if (kind === 'house') { if (c.water) add(new THREE.BoxGeometry(1.4, .3, S), .1); else add(new THREE.BoxGeometry(S * .82, FH, S * .82), (c.floors || 0) * FH + FH / 2); }
  else if (kind === 'tree') { add(new THREE.CylinderGeometry(.08, .12, 1.4, 6), .7); add(new THREE.IcosahedronGeometry(.75, 1), 1.9); }
  else if (kind === 'lamp') { add(new THREE.CylinderGeometry(.04, .06, 1.5, 6), .75); add(new THREE.BoxGeometry(.2, .22, .2), 1.4); }
  else if (kind === 'plaza') add(new THREE.CylinderGeometry(.6, .65, .25, 16), .12);
  else if (kind === 'raise') add(new THREE.BoxGeometry(S, LV, S), LV / 2);
  else if (kind === 'lower') add(new THREE.BoxGeometry(S * 1.01, LV, S * 1.01), -LV / 2);
  else return false;
  return true;
}
const TOOL_INFO = {house: c => c.water ? ['Bridge', COST.bridge] : [c.floors ? `Floor ${c.floors + 1}` : 'House', COST.house], tree: () => ['Tree', COST.tree], lamp: () => ['Lamp', COST.lamp], plaza: () => ['Plaza', COST.plaza], raise: () => ['Raise ground', COST.raise], lower: () => ['Lower ground', COST.lower]};
G.lastPtr = null;
function updatePreview() {
  const c = hovCell, t = G.tool;
  ghostMat.color.set(0xfff4dc); ghostLine.color.set(0xfff4dc);
  if (!c || !G.lastPtr || !(TOOL_INFO[t] || t === 'erase')) { ghost.visible = false; tagEl.style.display = 'none'; return; }
  let label, cost = 0, bad = false;
  if (t === 'erase') {
    const what = c.floors ? 'top floor' : c.kind && c.kind !== 'church' ? c.kind : null; ghost.visible = false;
    if (!what) { tagEl.style.display = 'none'; return; }
    label = `Erase ${what} · refund €${Math.round((c.floors ? COST.house : COST[c.kind] || 0) * .3)}`;
  } else {
    const [l, k] = TOOL_INFO[t](c); label = l; cost = k;
    if (c.owned === false) { label = 'Not your land yet'; bad = true; }
    else if (t !== 'house' && c.water) { label = "Can't build on water"; bad = true; }
    else if ((t === 'tree' || t === 'lamp' || t === 'plaza') && (c.floors || c.kind)) { label = 'Occupied'; bad = true; }
    else if (t === 'house' && c.kind && !c.water) { label = 'Occupied'; bad = true; }
    else if (cost > G.funds) { label += ` · €${cost} (not enough money)`; bad = true; }
    else label += ` · €${cost}`;
    ghost.visible = !bad && ghostGeo(t, c);
    if (bad) { ghostMat.color.set(0xff8a70); ghostLine.color.set(0xff8a70); }
  }
  tagEl.textContent = label; tagEl.classList.toggle('bad', bad); tagEl.style.display = 'block';
  tagEl.style.left = G.lastPtr.x + 'px'; tagEl.style.top = G.lastPtr.y + 'px';
}
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) { G.lastPtr = {x: e.clientX, y: e.clientY}; setHover(pickCell(e)); } });
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { G.lastPtr = {x: e.clientX, y: e.clientY}; setHover(pickCell(e)); } });
canvas.addEventListener('pointerleave', () => { G.lastPtr = null; setHover(null); });
addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(() => { G.lastPtr = null; setHover(null); }, 120); }, true);
function renderHoverPass() {
  hovOn += ((hovObj ? 1 : 0) - hovOn) * .3; postU.hovOn.value = hovOn;
  if (!hovObj) return;
  if (!hovRT || hovRT.width !== rt.width >> 1) { hovRT?.dispose(); hovRT = new THREE.WebGLRenderTarget(rt.width >> 1, rt.height >> 1); postU.tHov.value = hovRT.texture; }
  postU.hovCol.value.set(G.tool === 'erase' ? '#ff8a70' : '#fff4dc');
  const fog = scene.fog; scene.fog = null; scene.overrideMaterial = maskMat; camera.layers.set(HOV_LAYER);
  renderer.setRenderTarget(hovRT); renderer.setClearColor(0, 1); renderer.clear(); renderer.render(scene, camera);
  scene.overrideMaterial = null; camera.layers.set(0); scene.fog = fog;
}

/* ---- see-through: dither anything between the camera and what you're looking at ---- */
const fadeCache = new Map();
function fadeOf(mat) {
  let f = fadeCache.get(mat); if (f) return f;
  f = mat.clone(); const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  f.onBeforeCompile = (sh, r) => { if (prev) prev.call(mat, sh, r); sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, 'if(mod(floor(gl_FragCoord.x),2.)+mod(floor(gl_FragCoord.y),2.)>.5)discard;}'); };
  f.customProgramCacheKey = () => (key ? key.call(mat) : mat.uuid) + '-fade';
  fadeCache.set(mat, f); return f;
}
function setFaded(g, on) {
  if (!!g.userData.faded === on) return; g.userData.faded = on;
  g.traverse(o => { if (!o.isMesh || o.isInstancedMesh || (on && o.material.isShaderMaterial)) return; if (on) { o.userData.mat0 = o.material; o.material = fadeOf(o.material); o.castShadow0 = o.castShadow; } else if (o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; } });
}
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fp = new THREE.Vector3(), _fq = new THREE.Vector3();
function focusCell() { return selCell || (G.tool !== 'look' ? hovCell : null) || hovCell; }
function updateSeeThrough() {
  const fc = focusCell(); _fa.copy(camera.position);
  if (fc) _fb.set(wx(fc.i), topY(fc) + Math.max(.6, (fc.floors || 0) * FH * .5), wx(fc.j));
  const L = fc ? _fb.distanceTo(_fa) : 0;
  for (const c of G.cells) {
    if (!c.obj) continue; let fade = false;
    if (fc && c !== fc && (c.floors || c.kind === 'tree' || c.kind === 'church')) {
      const h = c.floors ? c.floors * FH + .6 : 2.6;
      _fp.set(wx(c.i), topY(c) + h * .5, wx(c.j));
      const t = _fq.copy(_fp).sub(_fa).dot(_fb.clone().sub(_fa)) / (L * L);
      if (t > .02 && t < .97) { const near = _fq.copy(_fa).lerp(_fb, t); const dx = _fp.x - near.x, dz = _fp.z - near.z, dy = Math.max(0, Math.abs(_fp.y - near.y) - h * .5); fade = Math.hypot(dx, dz) < 1.25 && dy < .4; }
    }
    setFaded(c.obj, fade);
  }
}

/* ---- focus-aware paint, LOD, night lift ---- */
const _fs = new THREE.Vector3(), _fr = new THREE.Vector3();
function updateFocusPaint() {
  const fc = selCell || hovCell;
  if (!fc) { postU.focR.value += (0 - postU.focR.value) * .2; return; }
  _fs.set(wx(fc.i), topY(fc) + (fc.floors || 0) * FH * .5 + .3, wx(fc.j));
  _fr.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(2.2).add(_fs); _fs.project(camera); _fr.project(camera);
  postU.focUV.value.set(_fs.x * .5 + .5, _fs.y * .5 + .5);
  const r = Math.hypot((_fr.x - _fs.x) * .5 * innerWidth / innerHeight, (_fr.y - _fs.y) * .5);
  postU.focR.value += (Math.min(.45, r) - postU.focR.value) * .2;
}
function updateLOD() {
  const d = camera.position.distanceTo(controls.target);
  laundryG.visible = d < 36; leafGeo.setDrawRange(0, Math.floor(LEAVES * G.preset.leaves * (d < 45 ? 1 : .25)));
}

/* ---- status pins: only things that need you ---- */
const pinsEl = document.createElement('div'); pinsEl.id = 'pins'; document.body.appendChild(pinsEl);
let pins = [], pinT = 0;
function rebuildPins() {
  pinsEl.innerHTML = ''; pins = [];
  const add = (c, sym, col, why, open, close) => { const d = document.createElement('div'); d.dataset.close = close ? 1 : ''; d.className = 'pin'; d.style.background = col; d.title = why; d.innerHTML = `<span>${sym}</span>`; d.onclick = open; pinsEl.appendChild(d); pins.push({c, d}); };
  G.businesses.forEach(b => { const s = bizStatus(b); if (s === 'Struggling' || s === 'Losing money') add(b.cell, '€', '#c0442e', `${b.name}: ${s.toLowerCase()}`, () => G.houseCard(b.cell, false)); });
  G.cells.forEach(c => {
    if (c.floors > 0 && !(c.res && c.res.length) && c.owned !== false) add(c, '⌂', '#6b7684', 'Empty home', () => G.houseCard(c, false), true);
    if (c.broken) add(c, '!', '#d89a2a', 'Broken lamp', () => { const t0 = G.tool; G.tool = 'look'; apply(c); G.tool = t0; });
  });
  G.requests.forEach(r => { const z = r.z, c = z && z.home; if (c) add(c, '?', '#4a7ab0', r.text, () => reqEl.click()); });
}
function updatePins(dt) {
  if (!pinsOn) return;
  if ((pinT -= dt) < 0) { pinT = 2; rebuildPins(); }
  const far = camera.position.distanceTo(controls.target) > 60, w = innerWidth, h = innerHeight;
  const zoomed = camera.position.distanceTo(controls.target) < 22;
  pins.forEach(({c, d}) => {
    if (d.dataset.close && !zoomed || c === selCell) { d.style.display = 'none'; return; }
    warpV(_mp.set(wx(c.i), topY(c) + (c.floors || 1) * FH + (c.bizObj ? 1.9 : .9), wx(c.j))).project(camera);
    if (_mp.z > 1 || far || mapK > .5) { d.style.display = 'none'; return; }
    d.style.display = ''; d.style.left = ((_mp.x * .5 + .5) * w).toFixed(1) + 'px'; d.style.top = ((-_mp.y * .5 + .5) * h).toFixed(1) + 'px';
  });
}

/* ---- pins toggle ---- */
let pinsOn = false; try { pinsOn = localStorage.getItem('tilt-pins') === '1'; } catch (e) { }
{
  const bt = document.createElement('button'); bt.className = 'act'; bt.id = 'pinsB'; bt.title = 'Show or hide status pins';
  const sync = () => { bt.textContent = pinsOn ? 'Pins' : 'Pins off'; bt.classList.toggle('on', pinsOn); pinsEl.style.display = pinsOn ? '' : 'none'; };
  bt.onclick = () => { pinsOn = !pinsOn; try { localStorage.setItem('tilt-pins', pinsOn ? '1' : '0'); } catch (e) { } sync(); say(pinsOn ? 'Status pins on' : 'Status pins hidden'); };
  const m = document.getElementById('menu'); m.parentNode.insertBefore(bt, m); sync();
}
/* ---- clean mode + compact presets ---- */
{
  const bt = document.createElement('button'); bt.className = 'act'; bt.id = 'cleanB'; bt.textContent = 'Clean'; bt.title = 'Hide interface clutter';
  bt.onclick = () => { const on = !document.body.classList.contains('clean'); document.body.classList.toggle('clean', on); bt.classList.toggle('on', on); say(on ? 'Clean view: tap Clean again to bring the interface back' : 'Interface back'); };
  const m = document.getElementById('menu'); m.parentNode.insertBefore(bt, m);
}
function compactPresets() {
  marker.material.opacity = 0;
  const el = document.getElementById('presets'); if (!el || el.querySelector('.tog')) return;
  const tg = document.createElement('button'); tg.className = 'tog'; tg.textContent = 'Looks ▾'; el.appendChild(tg);
  const set = on => { el.classList.toggle('collapsed', on); tg.textContent = on ? 'Looks ▾' : 'Hide ▴'; };
  tg.onclick = () => set(!el.classList.contains('collapsed'));
  el.addEventListener('click', e => { if (e.target.closest('button') && !e.target.closest('.tog') && innerWidth < 700) setTimeout(() => set(true), 150); });
  set(innerWidth < 700);
}
function updateClarity(dt) { updatePreview(); updateSeeThrough(); updateFocusPaint(); updateLOD(); updatePins(dt); }

cobbleMat.color.setScalar(1.12);

export {compactPresets, pinsEl, pinsOn, renderHoverPass, setHover, updateClarity};
