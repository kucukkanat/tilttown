import '../world/streets.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {LV, N, box, cyl, mul, pick, tr} from '../core/util.js';
import {DIRS, WALLS, camera, cellAt, grad, litU, scene, topY, wx} from '../core/scene.js';
import {archOf, laundryG, rebuildLaundry} from '../world/houses.js';
import {BIZ, STREETS, frontFace, hhmm, walkable} from '../world/streets.js';
import {GREET} from '../people/sim.js';
import {buildPeopleMeshes} from '../people/characters.js';
import {cardEl, closeCard, newBizBooks, selectCell, toast} from '../ui/cards.js';
import {firework, fromCode, loadTown, scheduleSave, serialize, townCode} from './extras.js';
import {albumCard, has} from './meta.js';
import {refresh, say} from '../ui/input.js';
import {QUEST, needOf, quest, townLevel} from './progression.js';

/* ==========================================================================
   OWNERSHIP: names (town, streets, squares, shops) painted on real boards,
   a town crest on flags/postcards/favicon, house colours, a chronicle,
   a mayor, a town specialty, your own festival, postcards, visiting friends.
   ========================================================================== */
const OWN = {town: null, founded: 0, streets: {}, plazas: {}, crest: {shape: 'shield', c1: '#2f5ea8', c2: '#efe3c8', emblem: '⛵'}, palette: null, mayor: null, spec: null, fest: {theme: 'sjoao', day: 3}, chronicle: [], firsts: {}, asked: {}};
const TOWN_A = ['Vila', 'Porto', 'Ribeira', 'Santa', 'São', 'Monte', 'Vale', 'Praia', 'Foz', 'Cais'], TOWN_B = ['Nova', 'do Sol', 'da Lua', 'Velha', 'das Flores', 'do Rio', 'Azul', 'da Ponte', 'de Telha', 'do Gato', 'Alegre', 'dos Barcos'];
const STREET_A = ['Rua', 'Rua', 'Travessa', 'Calçada', 'Beco', 'Largo', 'Rua'], STREET_B = ['das Flores', 'do Sol', 'da Ribeira', 'Nova', 'do Gato', 'das Taipas', 'da Lua', 'Direita', 'da Vitória', 'do Poço', 'dos Ferreiros', 'da Fonte', 'das Laranjeiras', 'do Pão', 'dos Pescadores', 'da Sé', 'do Mirante', 'das Andorinhas'];
const SQUARE_A = ['Praça', 'Largo', 'Praça', 'Jardim'], SQUARE_B = ['da Avó', 'do Coreto', 'das Pombas', 'da Liberdade', 'do Chafariz', 'dos Namorados', 'da Alegria', 'do Pelourinho', 'das Tílias', 'do Sol'];
const rnd = a => a[Math.floor(Math.random() * a.length)];
const suggestTown = () => `${rnd(TOWN_A)} ${rnd(TOWN_B)}`, suggestStreet = () => `${rnd(STREET_A)} ${rnd(STREET_B)}`, suggestSquare = () => `${rnd(SQUARE_A)} ${rnd(SQUARE_B)}`;
const townName = () => OWN.town || 'Tilt Town';
const streetName = i => OWN.streets[i] || STREETS[i % STREETS.length];
const cellKey = c => c.i * N + c.j;
const plazaName = c => OWN.plazas[cellKey(c)]?.name || `Praça ${streetName(c.i).replace(/^(Rua|Travessa|Calçada|Beco|Largo) /, '')}`;
const hex = c => '#' + new THREE.Color(c).getHexString();
const escH = s => String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[ch]);
/* ---- crest ---- */
const CREST_SHAPES = ['shield', 'round', 'banner', 'heart'], CREST_COLS = ['#2f5ea8', '#c0442e', '#2f6a4a', '#c9a33f', '#5a3a8a', '#1e1e2a', '#efe3c8', '#d0708a'], EMBLEMS = ['⛵', '🐟', '🏰', '☀️', '☕', '🌸', '🍇', '🗝️', '⚓', '🐓'];
function crestPath(x, cx, cy, S, shape) {
  x.beginPath();
  if (shape === 'round') x.arc(cx, cy, S * .46, 0, 6.283);
  else if (shape === 'banner') { x.moveTo(cx - S * .36, cy - S * .46); x.lineTo(cx + S * .36, cy - S * .46); x.lineTo(cx + S * .36, cy + S * .46); x.lineTo(cx, cy + S * .3); x.lineTo(cx - S * .36, cy + S * .46); x.closePath(); }
  else if (shape === 'heart') { x.moveTo(cx, cy + S * .44); x.bezierCurveTo(cx - S * .55, cy + S * .05, cx - S * .42, cy - S * .5, cx, cy - S * .2); x.bezierCurveTo(cx + S * .42, cy - S * .5, cx + S * .55, cy + S * .05, cx, cy + S * .44); }
  else { x.moveTo(cx - S * .4, cy - S * .44); x.lineTo(cx + S * .4, cy - S * .44); x.lineTo(cx + S * .4, cy + .02 * S); x.quadraticCurveTo(cx + S * .4, cy + S * .38, cx, cy + S * .48); x.quadraticCurveTo(cx - S * .4, cy + S * .38, cx - S * .4, cy + .02 * S); x.closePath(); }
}
function drawCrest(x, cx, cy, S, cr = OWN.crest) {
  x.save(); crestPath(x, cx, cy, S, cr.shape); x.fillStyle = cr.c1; x.fill(); x.clip();
  x.fillStyle = cr.c2; x.fillRect(cx, cy - S, S, S * 2); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(cx - S, cy - S, S * 2, S * .55);
  x.restore(); crestPath(x, cx, cy, S, cr.shape); x.lineWidth = Math.max(2, S * .045); x.strokeStyle = '#2a1d16'; x.stroke();
  x.save(); x.font = `${Math.round(S * .44)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = S * .04; x.fillText(cr.emblem, cx, cy + S * .02); x.restore();
}
const crestCv = document.createElement('canvas'); crestCv.width = crestCv.height = 256;
const flagCv = document.createElement('canvas'); flagCv.width = 256; flagCv.height = 170;
const flagTex = new THREE.CanvasTexture(flagCv); flagTex.colorSpace = THREE.SRGBColorSpace;
function paintCrest() {
  const a = crestCv.getContext('2d'); a.clearRect(0, 0, 256, 256); drawCrest(a, 128, 128, 240);
  const f = flagCv.getContext('2d'); f.fillStyle = OWN.crest.c1; f.fillRect(0, 0, 256, 170); f.fillStyle = OWN.crest.c2; f.fillRect(0, 0, 256, 28); f.fillRect(0, 142, 256, 28); drawCrest(f, 128, 85, 130); flagTex.needsUpdate = true;
  try { const url = crestCv.toDataURL('image/png'); for (const rel of ['icon', 'apple-touch-icon']) { let l = document.querySelector(`link[rel="${rel}"]`); if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); } l.href = url; } } catch (e) { }
  if (typeof lblRedrawAll === 'function') lblRedrawAll();
}
const flagMat = new THREE.MeshToonMaterial({map: flagTex, gradientMap: grad, side: THREE.DoubleSide});
const flagU = {uTime: {value: 0}};
flagMat.onBeforeCompile = sh => { sh.uniforms.uTime = flagU.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n{float k=uv.x;vec4 w=modelMatrix*vec4(position,1.);transformed.z+=sin(uTime*4.+k*6.+w.x+w.z)*.035*k;transformed.y+=sin(uTime*3.1+k*5.)*.012*k;}'); };
flagMat.customProgramCacheKey = () => 'flag';
/* ---- text labels: one shared canvas atlas, 64 slots of 512x128 ---- */
const LBL = {cv: document.createElement('canvas'), slots: new Map(), list: [], next: 0};
LBL.cv.width = LBL.cv.height = 2048; LBL.ctx = LBL.cv.getContext('2d');
LBL.tex = new THREE.CanvasTexture(LBL.cv); LBL.tex.colorSpace = THREE.SRGBColorSpace; LBL.tex.anisotropy = 4;
const labelMat = new THREE.MeshToonMaterial({map: LBL.tex, gradientMap: grad});
labelMat.onBeforeCompile = sh => { sh.uniforms.uNight = litU.uNight; sh.fragmentShader = 'uniform float uNight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*uNight*.35;'); };
labelMat.customProgramCacheKey = () => 'label';
function fitFont(x, text, family, weight, maxW, size) { let s = size; do { x.font = `${weight} ${Math.round(s)}px ${family}`; if (x.measureText(text).width <= maxW) break; s *= .92; } while (s > 8); return s; }
function lblDraw(s) {
  const x = LBL.ctx, X = (s.idx % 4) * 512, Y = Math.floor(s.idx / 4) * 128, bh = Math.min(128, 512 / s.aspect), by = Y + (128 - bh) / 2, st = s.style, t = s.text;
  x.clearRect(X, Y, 512, 128); x.save(); x.beginPath(); x.rect(X, by, 512, bh); x.clip();
  const CAP = 'Caprasimo,Georgia,serif', BRI = "'Bricolage Grotesque',system-ui,sans-serif";
  if (st.kind === 'azul') { x.fillStyle = '#f8f6f0'; x.fillRect(X, by, 512, bh); x.strokeStyle = '#1f3f8a'; x.lineWidth = bh * .07; x.strokeRect(X + bh * .08, by + bh * .08, 512 - bh * .16, bh * .84); x.lineWidth = bh * .025; x.strokeRect(X + bh * .17, by + bh * .17, 512 - bh * .34, bh * .66); x.fillStyle = '#1f3f8a'; for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { x.beginPath(); x.arc(X + bh * .12 + a * (512 - bh * .24), by + bh * .12 + b * bh * .76, bh * .05, 0, 6.3); x.fill(); } fitFont(x, t, CAP, 400, 512 - bh * .6, bh * .44); x.fillStyle = '#1f3f8a'; }
  else if (st.kind === 'stone') { x.fillStyle = '#d8ccb4'; x.fillRect(X, by, 512, bh); x.strokeStyle = '#8a7a64'; x.lineWidth = bh * .08; x.strokeRect(X + bh * .1, by + bh * .1, 512 - bh * .2, bh * .8); fitFont(x, t, CAP, 400, 512 - bh * .5, bh * .46); x.fillStyle = '#3a2a20'; }
  else if (st.kind === 'brass') { const g = x.createLinearGradient(X, by, X, by + bh); g.addColorStop(0, '#e0b85a'); g.addColorStop(1, '#a8802a'); x.fillStyle = g; x.fillRect(X, by, 512, bh); x.strokeStyle = '#6a4a1a'; x.lineWidth = bh * .06; x.strokeRect(X + bh * .06, by + bh * .06, 512 - bh * .12, bh * .88); fitFont(x, t, BRI, 700, 512 - bh * .4, bh * .5); x.fillStyle = '#2a1d16'; }
  else if (st.kind === 'welcome') { x.fillStyle = '#efe3c8'; x.fillRect(X, by, 512, bh); x.strokeStyle = OWN.crest.c1; x.lineWidth = bh * .08; x.strokeRect(X + bh * .06, by + bh * .06, 512 - bh * .12, bh * .88); x.drawImage(crestCv, X + bh * .12, by + bh * .1, bh * .8, bh * .8); x.fillStyle = '#6a5a4a'; x.font = `600 ${Math.round(bh * .2)}px ${BRI}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('Bem-vindos a', X + bh * 1.05, by + bh * .3); fitFont(x, t, CAP, 400, 512 - bh * 1.2, bh * .42); x.fillStyle = '#2a1d16'; x.fillText(t, X + bh * 1.05, by + bh * .64); x.restore(); s.uv = [X / 2048, 1 - (by + bh) / 2048, (X + 512) / 2048, 1 - by / 2048]; LBL.tex.needsUpdate = true; return; }
  else { x.fillStyle = st.bg || '#2a2622'; x.fillRect(X, by, 512, bh); x.strokeStyle = st.fg || '#e8d8a8'; x.globalAlpha = .5; x.lineWidth = bh * .04; x.strokeRect(X + bh * .1, by + bh * .12, 512 - bh * .2, bh * .76); x.globalAlpha = 1; fitFont(x, t, CAP, 400, 512 - bh * .45, bh * .56); x.fillStyle = st.fg || '#e8d8a8'; }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, X + 256, by + bh * .53); x.restore();
  s.uv = [X / 2048, 1 - (by + bh) / 2048, (X + 512) / 2048, 1 - by / 2048]; LBL.tex.needsUpdate = true;
}
function lblSlot(key, text, style, aspect) {
  let s = LBL.slots.get(key);
  if (!s) { const idx = LBL.next++ % 64; for (const [k, o] of LBL.slots) if (o.idx === idx) LBL.slots.delete(k); s = {idx, key}; LBL.slots.set(key, s); }
  if (s.text !== text || s.sk !== JSON.stringify(style) || s.aspect !== aspect) { s.text = text; s.style = style; s.sk = JSON.stringify(style); s.aspect = aspect; lblDraw(s); }
  return s;
}
function lblRedrawAll() { for (const s of LBL.slots.values()) lblDraw(s); }
function labelGeo(key, text, style, w, h) {
  const s = lblSlot(key, text, style, w / h), g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, [u0, v0, u1, v1] = s.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}
const lblRefresh = () => { for (const s of LBL.slots.values()) { const t = s.key === 'town' ? townName() : s.key.startsWith('street:') ? streetName(+s.key.slice(7)) : s.key.startsWith('plaza:') ? plazaName(G.cells[+s.key.slice(6)] || {i: 0, j: 0}) : s.key.startsWith('shop:') ? (G.cells[+s.key.slice(5)]?.bizName || s.text) : s.text; if (t !== s.text) { s.text = t; lblDraw(s); } } };
if (document.fonts) Promise.all([document.fonts.load('40px Caprasimo'), document.fonts.load("700 40px 'Bricolage Grotesque'")]).then(() => { lblRedrawAll(); paintCrest(); }).catch(() => { });
/* ---- where the names live in the world ---- */
function plaqueFor(c) { return G.cells.find(h => h.i === c.i && h.floors > 0 && !h.biz && frontFace(h) !== undefined) === c; }
const SPECS = {nata: {label: 'Pastéis de nata', types: ['bakery', 'cafe']}, sardinha: {label: 'Grilled sardines', types: ['fish', 'tasca']}, porto: {label: 'Port wine', types: ['winebar', 'tasca']}, francesinha: {label: 'Francesinha', types: ['tasca', 'cafe']}, flores: {label: 'Flower crowns', types: ['florist']}};
const ownSpecMult = t => OWN.spec && SPECS[OWN.spec].types.includes(t) ? 1.15 : 1;
function ownDecor(plain, lbls, flags) {
  // welcome sign at the town edge, facing inwards
  const ctr = {i: N / 2 - .5, j: N / 2 - .5};
  const edge = G.cells.filter(c => walkable(c) && !c.water && !c.kind && DIRS.some(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); return !n || n.owned === false; })).sort((a, b) => Math.hypot(a.i - ctr.i, a.j - ctr.j) - Math.hypot(b.i - ctr.i, b.j - ctr.j));
  const e = edge[0];
  if (e) { const k = DIRS.findIndex(([dx, dz]) => { const n = cellAt(e.i + dx, e.j + dz); return !n || n.owned === false; }), [dx, dz] = DIRS[k], y = e.lvl * LV, px = -dz, pz = dx;
    const x0 = wx(e.i) + dx * .72 + px * .45, z0 = wx(e.j) + dz * .72 + pz * .45, ry = Math.atan2(-dx, -dz); ownDecor.at = [x0, y + .66, z0, dx, dz];
    for (const s of [-.36, .36]) plain.push(box(.05, .82, .05, '#5a4232', tr(x0 + px * s, y + .41, z0 + pz * s)));
    plain.push(box(.86, .26, .05, '#6a4a30', mul(tr(x0, y + .66, z0, ry), tr(0, 0, 0))));
    lbls.push(labelGeo('town', townName(), {kind: 'welcome'}, .8, .2).applyMatrix4(mul(tr(x0, y + .66, z0, ry), tr(0, 0, .065))));
    plain.push(cyl(.02, .02, 1.5, '#2a2622', tr(x0 + px * .62, y + .75, z0 + pz * .62), 5));
    flags.push(new THREE.PlaneGeometry(.42, .28, 8, 1).translate(.21, 0, 0).applyMatrix4(tr(x0 + px * .62, y + 1.34, z0 + pz * .62, ry + Math.PI / 2)));
  }
  for (const c of G.cells) {
    const x = wx(c.i), z = wx(c.j), y = topY(c);
    if (c.kind === 'church') { plain.push(cyl(.02, .02, 1.6, '#2a2622', tr(x + .82, y + .8, z + .7), 5)); flags.push(new THREE.PlaneGeometry(.4, .27, 8, 1).translate(.2, 0, 0).applyMatrix4(tr(x + .82, y + 1.45, z + .7))); }
    if (c.kind === 'plaza') { plain.push(cyl(.02, .025, 1.5, '#2a2622', tr(x - .86, y + .75, z + .42), 5)); flags.push(new THREE.PlaneGeometry(.38, .25, 8, 1).translate(.19, 0, 0).applyMatrix4(tr(x - .86, y + 1.36, z + .42, Math.PI / 4))); }
    if (c.kind === 'bridge') for (const s of [-1, 1]) { plain.push(cyl(.012, .012, .5, '#2a2622', tr(x + .6, .45, z + s * .92), 4)); flags.push(new THREE.PlaneGeometry(.18, .12, 4, 1).translate(.09, 0, 0).applyMatrix4(tr(x + .6, .64, z + s * .92, Math.PI / 2))); }
  }
}
/* ---- small prompt card: a name with a suggestion and a dice ---- */
function namePrompt(title, sub, value, roll, save, extra = '') {
  G.cardFor = {kind: 'name'};
  cardEl.innerHTML = `<div class="ch"><div><b>${escH(title)}</b><small>${escH(sub)}</small></div><button class="x">×</button></div>
    <div class="grid" style="gap:6px"><input id="nmIn" type="text" maxlength="28" value="${escH(value)}" style="flex:1;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid rgba(243,230,204,.25);background:rgba(0,0,0,.25);color:var(--paper);font:400 17px Caprasimo,Georgia,serif;width:100%"><button class="act" id="nmRoll" style="min-width:48px;font-size:18px" title="Another suggestion">🎲</button></div>
    ${extra}<div class="grid"><button class="act" id="nmSave" style="background:#f0a35c;color:#24170f">Save name</button><button class="act" id="nmNo">Not now</button></div>`;
  cardEl.style.display = 'block';
  const inp = cardEl.querySelector('#nmIn');
  cardEl.querySelector('.x').onclick = closeCard; cardEl.querySelector('#nmNo').onclick = closeCard;
  cardEl.querySelector('#nmRoll').onclick = () => { inp.value = roll(); };
  cardEl.querySelector('#nmSave').onclick = () => { const v = inp.value.trim().slice(0, 28); if (!v) return; save(v); scheduleSave(); };
}
function setTownName(v, first) { const had = OWN.town; OWN.town = v; ownIdentity(); lblRefresh(); if (!had || first) ownLog(`The town is named ${v}`); toast(`Welcome to ${v}!`); for (let k = 0; k < 3; k++) setTimeout(firework, k * 300); rebuildLaundry(); }
function askTownName() { if (OWN.asked.town) return; OWN.asked.town = 1; namePrompt('Name your town', 'It goes on the welcome sign, the paper and your postcards', suggestTown(), suggestTown, v => { setTownName(v, true); townCard(); }); }
function streetCard(c) {
  selectCell(c);
  const i = c.i, shops = G.businesses.filter(b => b.cell.i === i), homes = G.cells.filter(h => h.i === i && h.floors > 0), people = homes.reduce((a, h) => a + (h.res || []).length, 0);
  namePrompt(streetName(i), `${homes.length} houses · ${people} residents${shops.length ? ' · ' + shops.map(b => b.name).join(', ') : ''}`, streetName(i), suggestStreet, v => { OWN.streets[i] = v; lblRefresh(); refresh(c); say(`Renamed to ${v}`); streetCard(c); }, '<p class="tip">Street plaques on the corner houses show this name.</p>');
  cardEl.querySelector('#nmSave').textContent = 'Rename street';
}
function plazaCard(c) {
  selectCell(c);
  const p = OWN.plazas[cellKey(c)];
  namePrompt(plazaName(c), p ? `Dedicated on day ${p.day + 1}` : 'A square in your town', plazaName(c), suggestSquare, v => { const was = !OWN.plazas[cellKey(c)]; OWN.plazas[cellKey(c)] = {name: v, day: p?.day ?? G.day}; if (was) ownLog(`${v} is dedicated`); lblRefresh(); refresh(c); plazaCard(c); },
    `<p class="tip">The name is carved on the plaque. Residents will start meeting “at ${escH(plazaName(c))}”.</p>${OWN.mayor && !c.statue && has('statue') ? '<button class="act wide" id="stMayor">Put the mayor\'s statue here</button>' : ''}`);
  cardEl.querySelector('#nmSave').textContent = 'Name this square';
  const sb = cardEl.querySelector('#stMayor'); if (sb) sb.onclick = () => placeStatue(c);
}
function placeStatue(c) { c.statue = true; refresh(c); ownLog(`A statue of Mayor ${OWN.mayor.name} goes up in ${plazaName(c)}`); toast(`The town honours Mayor ${OWN.mayor.name}`); for (let k = 0; k < 4; k++) setTimeout(firework, k * 300); closeCard(); }
/* ---- your town card ---- */
const PALETTES = {porto: ['#d8a55c', '#5f9e9a', '#d98a6c', '#e6d2a6', '#6f8fb3', '#c9a33f', '#c97b84'], pastel: ['#f2c6b4', '#bcd8d0', '#f4e3b0', '#c8d4ec', '#e8c4d4', '#d8e8c0'], ochre: ['#c9a33f', '#d98a4a', '#b8682e', '#e0b870', '#a8582e'], seaside: ['#f4f0e8', '#6f8fb3', '#a8c8d8', '#e6eef4', '#2f5ea8'], terracotta: ['#b8542e', '#d8784a', '#e8b890', '#8a3a2a', '#f0d8b8']};
const FEST_THEMES = {sjoao: {label: 'São João', cols: ['#d94f3d', '#e8c34a', '#3f8a5a', '#2f6aa8', '#f4f0e8', '#e07a3a']}, vindima: {label: 'Grape harvest', cols: ['#6a1f3a', '#8a3a5a', '#c9a33f', '#4f7a32', '#f4ecdc']}, sardinha: {label: 'Sardine festival', cols: ['#2f6aa8', '#a8b4bc', '#f4f0e8', '#d94f3d']}, lanternas: {label: 'Lantern night', cols: ['#e8c34a', '#f0a35c', '#f4f0e8', '#c0442e']}};
let foundingTonight = false;
function festColors() { return foundingTonight ? [OWN.crest.c1, OWN.crest.c2, '#f4f0e8'] : FEST_THEMES[OWN.fest.theme]?.cols || FEST_THEMES.sjoao.cols; }
function townCard() {
  G.cardFor = {kind: 'town'}; const cr = OWN.crest, sw = (k, cols, cur) => cols.map(c => `<button class="act" data-${k}="${c}" style="min-width:34px;min-height:34px;padding:0;border-radius:50%;background:${c};box-shadow:${c === cur ? '0 0 0 3px #f0a35c' : 'inset 0 0 0 1px rgba(255,255,255,.25)'}"></button>`).join('');
  const days = Math.max(0, G.day - OWN.founded);
  cardEl.innerHTML = `<div class="ch"><div style="display:flex;align-items:center;gap:10px"><img src="${crestCv.toDataURL()}" style="width:44px;height:44px"><div><b>${escH(townName())}</b><small>Founded day ${OWN.founded + 1} · ${days} day${days === 1 ? '' : 's'} old · ${G.citizens.filter(z => z.role !== 'guest').length} residents</small></div></div><button class="x">×</button></div>
    <div class="grid"><button class="act" id="tcName">Rename town</button><button class="act" id="tcChron">Chronicle (${OWN.chronicle.length})</button></div>
    <p><span>Crest</span></p><div class="grid">${CREST_SHAPES.map(s => `<button class="act ${cr.shape === s ? 'on' : ''}" data-shape="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
    <div class="grid" style="flex-wrap:wrap">${sw('c1', CREST_COLS, cr.c1)}</div><div class="grid" style="flex-wrap:wrap">${sw('c2', CREST_COLS, cr.c2)}</div>
    <div class="grid" style="flex-wrap:wrap">${EMBLEMS.map(e => `<button class="act ${cr.emblem === e ? 'on' : ''}" data-em="${e}" style="min-width:40px;font-size:18px">${e}</button>`).join('')}</div>
    <p><span>House colours</span>new houses follow this palette</p><div class="grid" style="flex-wrap:wrap">${Object.entries(PALETTES).map(([k, cols]) => `<button class="act ${OWN.palette === k ? 'on' : ''}" data-pal="${k}" style="flex-direction:column;gap:3px"><span style="display:flex;gap:2px">${cols.slice(0, 5).map(c => `<i style="width:9px;height:14px;border-radius:2px;background:${c};display:block"></i>`).join('')}</span>${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <p><span>Town specialty</span>${OWN.spec ? SPECS[OWN.spec].label : 'none yet'}</p><div class="grid" style="flex-wrap:wrap">${Object.entries(SPECS).map(([k, s]) => `<button class="act ${OWN.spec === k ? 'on' : ''}" data-spec="${k}">${s.label}</button>`).join('')}</div>
    <p class="tip">Shops that make it charge 15% more and wear a brass sign; visitors come asking for it.</p>
    <p><span>Your festival</span>${FEST_THEMES[OWN.fest.theme].label}, day ${OWN.fest.day} of every season</p><div class="grid" style="flex-wrap:wrap">${Object.entries(FEST_THEMES).map(([k, f]) => `<button class="act ${OWN.fest.theme === k ? 'on' : ''}" data-fest="${k}">${f.label}</button>`).join('')}</div>
    <div class="grid">${[1, 2, 3, 4, 5].map(d => `<button class="act ${OWN.fest.day === d ? 'on' : ''}" data-fday="${d}">Day ${d}</button>`).join('')}</div>
    <p><span>Mayor</span>${OWN.mayor ? escH(OWN.mayor.name) : 'Tap a resident, then “Make mayor”'}</p>
    <div class="grid"><button class="act" id="tcCard">Postcards</button><button class="act" id="tcVisit">Visit a friend's town</button></div>
    <div id="tcVisitBox" style="display:none"><textarea id="tcCode" rows="3" placeholder="Paste a town code" style="width:100%;font-size:11px;background:rgba(0,0,0,.3);color:var(--paper);border:1px solid rgba(243,230,204,.2);border-radius:8px"></textarea><button class="act wide" id="tcGo">Visit (your town is kept safe)</button></div>`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
  const Q = s => cardEl.querySelector(s), all = (s, f) => cardEl.querySelectorAll(s).forEach(b => b.onclick = () => f(b));
  Q('#tcName').onclick = () => { OWN.asked.town = 0; namePrompt('Rename your town', 'Shown on the welcome sign, the paper and postcards', townName(), suggestTown, v => { setTownName(v); townCard(); }); };
  Q('#tcChron').onclick = chronicleCard; Q('#tcCard').onclick = () => { closeCard(); if (typeof albumCard === 'function') albumCard(); };
  Q('#tcVisit').onclick = () => { Q('#tcVisitBox').style.display = 'block'; }; Q('#tcGo').onclick = () => visitTown(Q('#tcCode').value);
  const crestSet = (k, v) => { OWN.crest[k] = v; paintCrest(); rebuildLaundry(); scheduleSave(); townCard(); };
  all('[data-shape]', b => crestSet('shape', b.dataset.shape)); all('[data-c1]', b => crestSet('c1', b.dataset.c1)); all('[data-c2]', b => crestSet('c2', b.dataset.c2)); all('[data-em]', b => crestSet('emblem', b.dataset.em));
  all('[data-pal]', b => { OWN.palette = OWN.palette === b.dataset.pal ? null : b.dataset.pal; scheduleSave(); say(OWN.palette ? 'New houses will use this palette' : 'Palette off: new houses pick freely'); townCard(); });
  all('[data-spec]', b => { const was = OWN.spec; OWN.spec = b.dataset.spec; if (was !== OWN.spec) ownLog(`${SPECS[OWN.spec].label} becomes the town specialty`); G.businesses.forEach(x => SPECS[OWN.spec].types.includes(x.type) && refresh(x.cell)); scheduleSave(); townCard(); });
  all('[data-fest]', b => { OWN.fest.theme = b.dataset.fest; scheduleSave(); townCard(); }); all('[data-fday]', b => { OWN.fest.day = +b.dataset.fday; scheduleSave(); townCard(); });
}
function chronicleCard() {
  G.cardFor = {kind: 'chron'};
  cardEl.innerHTML = `<div class="ch"><div><b>Chronicle of ${escH(townName())}</b><small>${OWN.chronicle.length} moments</small></div><button class="x">×</button></div>
    ${OWN.chronicle.length ? OWN.chronicle.slice().reverse().map(e => `<p><span>Day ${e.d + 1}</span>${escH(e.t)}</p>`).join('') : '<p class="tip">Big moments are written down here as your town grows.</p>'}
    <button class="act wide" id="chBack">Back to your town</button>`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard; cardEl.querySelector('#chBack').onclick = townCard;
}
function ownLog(t) { OWN.chronicle.push({d: G.day, t}); if (OWN.chronicle.length > 200) OWN.chronicle.shift(); scheduleSave(); }
/* ---- house colours (house card section) ---- */
const DOORS = ['#4a2f22', '#2f5ea8', '#2f6a4a', '#8a2a2a', '#c9a33f', '#1e1e2a'], TILES = ['none', 'blue', 'green', 'yellow'];
const TILE_TINT = {blue: '#eef4ff', green: '#eaf6e6', yellow: '#fff4dc'};
function paintHTML(c) {
  if (!c.floors) return ''; const p = c.paint || {}, sw = (k, cols, cur) => cols.map(col => `<button class="act" data-p${k}="${col}" style="min-width:30px;min-height:30px;padding:0;border-radius:50%;background:${col};box-shadow:${col === cur ? '0 0 0 3px #f0a35c' : 'inset 0 0 0 1px rgba(255,255,255,.25)'}"></button>`).join('');
  return `<div class="shopsec"><h5>Colours</h5><p><span>Walls</span></p><div class="grid" style="flex-wrap:wrap">${sw('w', [...new Set([...WALLS, ...PALETTES.pastel])], p.w)}</div>
    <p><span>Door</span></p><div class="grid" style="flex-wrap:wrap">${sw('d', DOORS, p.d)}</div>
    <p><span>Tiles</span></p><div class="grid">${TILES.map(t => `<button class="act ${p.t === t ? 'on' : ''}" data-pt="${t}">${t === 'none' ? 'Plain' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>`;
}
function wirePaint(c) {
  const set = (k, v) => { c.paint = {...(c.paint || {}), [k]: v}; refresh(c); scheduleSave(); G.houseCard(c); };
  cardEl.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => set('w', b.dataset.pw)); cardEl.querySelectorAll('[data-pd]').forEach(b => b.onclick = () => set('d', b.dataset.pd)); cardEl.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => set('t', b.dataset.pt));
}
{ const _hc = G.houseCard; G.houseCard = (c, p) => { _hc(c, p); if (!c?.floors || G.cardFor?.kind === 'name') return; const box_ = document.createElement('div'); box_.innerHTML = paintHTML(c); const res = cardEl.querySelector('.res'); res ? cardEl.insertBefore(box_, res) : cardEl.appendChild(box_); wirePaint(c); }; }
/* ---- mayor ---- */
{ const _pc = G.personCard; G.personCard = z => { _pc(z); if (z.role === 'child' || z.role === 'guest') return; const b = document.createElement('button'); b.className = 'act wide'; b.textContent = OWN.mayor === z ? 'Mayor of ' + townName() + ' ★' : 'Make mayor'; b.onclick = () => { if (OWN.mayor === z) return; if (OWN.mayor) { OWN.mayor.isMayor = false; OWN.mayor.notable = null; } OWN.mayor = z; z.isMayor = true; G.notables.mayor = z; z.notable = 'Mayor'; ownLog(`${z.name} becomes mayor`); toast(`${z.name} is the new mayor of ${townName()}`); buildPeopleMeshes(); scheduleSave(); G.personCard(z); }; cardEl.appendChild(b); }; }
/* ---- letters, greetings ---- */
function ownGreet(z) {
  const R = Math.random(), pl = G.cells.filter(c => c.kind === 'plaza');
  if (z.role === 'guest' && OWN.spec && R < .4) return `Where can I try the ${SPECS[OWN.spec].label.toLowerCase()}?`;
  if (pl.length && R < .25) return `Meet you at ${plazaName(pick(Math.random, pl))}?`;
  if (OWN.town && R < .4) return pick(Math.random, [`Lovely day in ${OWN.town}!`, `${OWN.town} is the best`, `Bom dia, ${OWN.town}!`]);
  if (OWN.mayor && R < .5) return `Have you seen Mayor ${OWN.mayor.name.split(' ')[0]}?`;
  return pick(z.R || Math.random, GREET);
}
{ const _le = G.lifeEvents; G.lifeEvents = L => { _le(L);
  const recent = G.businesses.filter(b => (b.openedDay ?? -9) >= G.day - 2), adults = G.citizens.filter(z => z.role !== 'child' && z.role !== 'guest');
  if (recent.length && adults.length && Math.random() < .7) { const b = pick(Math.random, recent), z = adults.sort((a, d) => (Math.abs(a.home.i - b.cell.i) + Math.abs(a.home.j - b.cell.j)) - (Math.abs(d.home.i - b.cell.i) + Math.abs(d.home.j - b.cell.j)))[0]; L.items.push(`✉ “Obrigada for ${b.name} on ${streetName(b.cell.i)}!” · ${z.name}`); }
  else if (adults.length && Math.random() < .5) { const z = pick(Math.random, adults), n = typeof needOf === 'function' ? needOf(z) : null; if (n === 'food') L.items.push(`✉ “We still have no bakery near ${streetName(z.home.i)}.” · ${z.name}`); else if (n === 'cafe') L.items.push(`✉ “A café on ${streetName(z.home.i)} would be lovely.” · ${z.name}`); else L.items.push(`✉ “${pick(Math.random, ['I love living in', 'My grandchildren want to move to', 'Every morning I thank the mayor of'])} ${townName()}.” · ${z.name}`); }
}; }
/* ---- chronicle firsts, anniversaries, festival day ---- */
let ownH = -1;
function ownMarkExisting() { const F = OWN.firsts; G.businesses.forEach(b => F['shop:' + b.type] = 1); G.cells.forEach(c => { if (c.kind) F['kind:' + c.kind] = 1; if (c.floors >= 6) F.tall = 1; }); [25, 50, 75, 100, 150, 200].forEach(m => { if (G.citizens.length >= m) F['pop' + m] = 1; }); F.level = typeof townLevel === 'function' ? townLevel() : 1; }
function ownTick() {
  const h = Math.floor(G.hour); if (h === ownH) return; ownH = h; const F = OWN.firsts;
  for (const b of G.businesses) { b.openedDay ??= G.day; if (!F['shop:' + b.type]) { F['shop:' + b.type] = 1; ownLog(`${b.name} opens on ${streetName(b.cell.i)}: the first ${BIZ[b.type].label.toLowerCase()} in town`); } }
  for (const c of G.cells) { if (c.kind && !F['kind:' + c.kind] && ['church', 'bridge', 'plaza'].includes(c.kind)) { F['kind:' + c.kind] = 1; ownLog({church: 'The church bell rings for the first time', bridge: 'The first bridge crosses the river', plaza: 'The town gets its first square'}[c.kind]); } if (c.floors >= 6 && !F.tall) { F.tall = 1; ownLog(`A six-storey house rises on ${streetName(c.i)}`); } }
  if (G.tram && !F.tram) { F.tram = 1; ownLog('The tram makes its first run'); } if (G.funi && !F.funi) { F.funi = 1; ownLog('The funicular opens'); }
  const pop = G.citizens.filter(z => z.role !== 'guest').length; for (const m of [25, 50, 75, 100, 150, 200]) if (pop >= m && !F['pop' + m]) { F['pop' + m] = 1; ownLog(`${townName()} reaches ${m} residents`); }
  const g = G.citizens.find(z => z.role === 'guest'); if (g && !F.guest) { F.guest = 1; ownLog(`First B&B guest: ${g.name}`); }
  const L = typeof townLevel === 'function' ? townLevel() : 1; if (L > (F.level || 1)) { F.level = L; ownLog(`Town level ${L}`); }
  if (h === 8 && G.day > OWN.founded && (G.day - OWN.founded) % 10 === 0 && !F['anniv' + G.day]) { F['anniv' + G.day] = 1; G.festNight = G.day; foundingTonight = true; ownLog(`Founding day: ${townName()} turns ${G.day - OWN.founded} days old`); toast(`Happy founding day, ${townName()}! Lanterns go up tonight`); }
  else if (h === 8 && G.day % 5 === OWN.fest.day - 1 && !F['fest' + G.day] && G.festNight !== G.day) { F['fest' + G.day] = 1; G.festNight = G.day; foundingTonight = false; toast(`${FEST_THEMES[OWN.fest.theme].label} tonight! Lanterns go up at 19:30`); ownLog(`${FEST_THEMES[OWN.fest.theme].label} is celebrated`); }
  if (h === 3) foundingTonight = false;
  if (OWN.mayor && !G.citizens.includes(OWN.mayor)) { ownLog(`Mayor ${OWN.mayor.name} retires`); OWN.mayor = null; }
  if (OWN.mayor && L >= 5 && !OWN.asked.statue && G.cells.some(c => c.kind === 'plaza') && !G.cells.some(c => c.statue)) { OWN.asked.statue = 1; const pl = G.cells.filter(c => c.kind === 'plaza');
    G.cardFor = {kind: 'statue'}; cardEl.innerHTML = `<div class="ch"><div><b>A statue for the mayor</b><small>The residents want to honour Mayor ${escH(OWN.mayor.name)}</small></div><button class="x">×</button></div><p>Choose the square:</p><div class="grid" style="flex-direction:column">${pl.map(c => `<button class="act wide" data-st="${cellKey(c)}">${escH(plazaName(c))}</button>`).join('')}</div>`;
    cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard; cardEl.querySelectorAll('[data-st]').forEach(b => b.onclick = () => placeStatue(G.cells[+b.dataset.st])); }
  if (!OWN.town && !OWN.asked.town && quest && quest.k >= QUEST.length && h % 2 === 0) askTownName();
  if (OWN.mayor && !OWN.mayor.isMayor) OWN.mayor.isMayor = true;
}
/* ---- identity everywhere ---- */
function ownIdentity() { document.title = OWN.town ? `${OWN.town} · Tilt Town` : 'Tilt Town'; const h = document.querySelector('#title h1'); if (h) h.textContent = townName(); }
function ownReset() { Object.assign(OWN, {town: null, founded: G.day, streets: {}, plazas: {}, crest: {shape: pick(Math.random, CREST_SHAPES), c1: pick(Math.random, CREST_COLS.slice(0, 6)), c2: '#efe3c8', emblem: pick(Math.random, EMBLEMS)}, palette: null, mayor: null, spec: null, fest: {theme: 'sjoao', day: 3}, chronicle: [], firsts: {}, asked: {}, _mark: 1}); paintCrest(); ownIdentity(); }
function ownSave() { return {...OWN, mayor: OWN.mayor ? G.citizens.indexOf(OWN.mayor) : -1}; }
function ownLoad(o) { if (!o) { ownReset(); return; } const m = o.mayor; Object.assign(OWN, {streets: {}, plazas: {}, chronicle: [], firsts: {}, asked: {}}, o, {mayor: null}); OWN._mayorIdx = m; paintCrest(); ownIdentity(); }
function ownAfterCitizens() { const m = OWN._mayorIdx; OWN.mayor = m >= 0 ? G.citizens[m] || null : null; G.citizens.forEach(z => z.isMayor = z === OWN.mayor); delete OWN._mayorIdx; }
/* ---- postcards: framed with name, crest and day ---- */
function ownFrame(cv) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, bh = Math.round(H * .16);
  x.fillStyle = 'rgba(28,20,16,.72)'; x.fillRect(0, H - bh, W, bh);
  x.fillStyle = '#f3e6cc'; x.font = `400 ${Math.round(bh * .46)}px Caprasimo,Georgia,serif`; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(townName(), bh * .3, H - bh / 2);
  x.font = `600 ${Math.round(bh * .26)}px 'Bricolage Grotesque',sans-serif`; x.textAlign = 'right'; x.fillText(`Day ${G.day + 1} · ${hhmm(G.hour)}`, W - bh * 1.35, H - bh / 2);
  x.drawImage(crestCv, W - bh * 1.1, H - bh * .95, bh * .9, bh * .9);
  x.strokeStyle = '#f3e6cc'; x.lineWidth = 4; x.strokeRect(6, 6, W - 12, H - 12);
}
/* ---- visiting a friend's town (read-only) ---- */
let VISIT = null;
const visitBar = document.createElement('div'); visitBar.id = 'visitBar'; visitBar.className = 'panel';
visitBar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(56px + env(safe-area-inset-top));z-index:8;display:none;align-items:center;gap:10px;padding:8px 12px;font:600 13px "Bricolage Grotesque",system-ui,sans-serif;color:var(--paper)';
document.body.appendChild(visitBar);
async function visitTown(code) {
  try { const D = await fromCode(String(code).trim()); const home = serialize(); VISIT = {home}; loadTown(D);
    visitBar.innerHTML = `<span>Visiting <b style="font:400 15px Caprasimo,Georgia,serif">${escH(townName())}</b></span><button class="act" id="vbBack" style="background:#f0a35c;color:#24170f">Back home</button>`; visitBar.style.display = 'flex';
    document.body.classList.add('visiting'); visitBar.querySelector('#vbBack').onclick = leaveVisit; toast(`Welcome to ${townName()}! Have a look around`);
  } catch (e) { toast('That code could not be read'); }
}
function leaveVisit() { if (!VISIT) return; const H = VISIT.home; VISIT = null; loadTown(H); visitBar.style.display = 'none'; document.body.classList.remove('visiting'); toast(`Back home in ${townName()}`); G.autosave(); }
{ const _as = G.autosave; G.autosave = (...a) => { if (VISIT) return; return _as(...a); }; }
{ const st = document.createElement('style'); st.textContent = `body.visiting #dkBuild,body.visiting #dkLand,body.visiting #quest,body.visiting #undoF{display:none!important}`; document.head.appendChild(st); }
paintCrest();
window.__own = {cit: () => G.citizens, personCard: G.personCard, townCode, cam: () => camera, lg: () => laundryG, cells: () => G.cells, refresh, ownDecor, plaqueFor, frontFace, OWN, townCard, chronicleCard, setTownName, streetCard, plazaCard, ownTick, ownLog, visitTown, leaveVisit, LBL, paintCrest, placeStatue};


function assignBusinesses(R) {
  G.cells.forEach(c => { c.biz = null; });
  const want = ['bakery', 'cafe', 'grocer', 'tasca', 'fish', 'cafe', 'florist', 'books', 'barber', 'bakery', 'bnb'];
  for (const type of want) {
    const ok = [];
    for (const c of G.cells) {
      if (!c.floors || c.biz) continue; const k = frontFace(c); if (k === undefined) continue;
      const st = cellAt(c.i + DIRS[k][0], c.j + DIRS[k][1]);
      if (type === 'fish' && !DIRS.some(([dx, dz]) => cellAt(st.i + dx, st.j + dz)?.water)) continue;
      if (G.cells.some(o => o.biz === type && Math.abs(o.i - c.i) + Math.abs(o.j - c.j) <= (type === 'cafe' ? 2 : 4))) continue;
      if (G.cells.some(o => o.biz && o !== c && Math.abs(o.i - c.i) + Math.abs(o.j - c.j) <= 1)) continue;
      ok.push(c); const a = archOf(c); if (a === 'town' || a === 'turret') ok.push(c);
    }
    if (!ok.length) continue;
    const c = pick(R, ok); c.biz = type; c.bizName = pick(R, BIZ[type].names.filter(n => !G.cells.some(o => o.bizName === n && o.biz))) || BIZ[type].names[0];
  }
}
function rebuildBiz() {
  const old = new Map(G.businesses.map(b => [b.cell, b]));
  G.businesses = [];
  for (const c of G.cells) {
    c.bizObj = null;
    if (!c.biz) continue;
    if (!c.floors) { c.biz = null; continue; }
    const k = frontFace(c); if (k === undefined) continue;
    let b = old.get(c); if (!b || b.type !== c.biz) b = {cell: c, type: c.biz, name: c.bizName, open: 0, queue: [], visits: 0};
    b.face = k; b.street = cellAt(c.i + DIRS[k][0], c.j + DIRS[k][1]); b.queue = b.queue.filter(z => z.qb === b);
    newBizBooks(b); c.bizObj = b; G.businesses.push(b);
  }
}

/* business frontage spill: tables, stands, queue spots */
const bizSpillG = new THREE.Group(); scene.add(bizSpillG);

export {OWN, PALETTES, SPECS, TILE_TINT, VISIT, askTownName, assignBusinesses, bizSpillG, cellKey, escH, festColors, flagMat, hex, labelGeo, labelMat, lblRefresh, namePrompt, ownAfterCitizens, ownDecor, ownFrame, ownGreet, ownLoad, ownMarkExisting, ownReset, ownSave, ownSpecMult, ownTick, plaqueFor, plazaCard, plazaName, rebuildBiz, streetCard, streetName, townCard, townName};
