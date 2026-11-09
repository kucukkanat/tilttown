import '../world/organic.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {LV, N, S, pick, rng} from '../core/util.js';
import {DIRS, camera, cellAt, objG, terrainG, wx} from '../core/scene.js';
import {glowGeo, glowRefs, laundryG} from '../world/houses.js';
import {BIZ, canStep, frontFace, hhmm, isOpenAt, now, raining, walkY, walkable} from '../world/streets.js';
import {OWN, VISIT, bizSpillG, ownGreet, ownMarkExisting, ownTick} from '../game/identity.js';
import {buildPeopleMeshes, peopleParts} from './characters.js';
import {PRICE, closeCard, joyOf, newResident, pay, removeCitizen, runDay, toast, townJoy, updateEco} from '../ui/cards.js';
import {BUDGET, FEST_STEP, bell, checkRequests, checkUnlocks, makeRequest, partyTime, shutterSound, syncRefl} from '../game/extras.js';
import {concertTime, metaDay, metaHour} from '../game/meta.js';
import {refresh} from '../ui/input.js';
import {plotValue} from '../game/progression.js';

G.updateCity = updateCity; // reassignable: other modules wrap it
/* ---------- citizens ---------- */
const FIRST_M = ['João', 'Miguel', 'Tiago', 'Rui', 'Pedro', 'André', 'Luís', 'Carlos', 'Duarte', 'Afonso', 'Manuel', 'Nuno', 'Vasco', 'Hugo'];
const FIRST_F = ['Maria', 'Ana', 'Inês', 'Beatriz', 'Sofia', 'Rita', 'Catarina', 'Leonor', 'Joana', 'Teresa', 'Marta', 'Lúcia', 'Clara', 'Rosa'];
const LAST = ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gomes', 'Lopes', 'Marques', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira'];
const SKIN = ['#f1d3b8', '#e6c2a2', '#d4a882', '#b8855e', '#8a5c3c', '#5e3c28'];
const HAIR = ['#2a1d16', '#3a2418', '#5a3420', '#8a5a30', '#c8a060', '#1a1a1a', '#6a3020'];
const SHIRT = ['#6a8aa8', '#a84a3a', '#3f6a4f', '#d8c8a8', '#5a4a7a', '#c9a33f', '#2f3f5f', '#e0d8cc', '#8a5a3a', '#4a7a8a', '#b86a7a', '#7a8a4a', '#d07a4a'];
const PANTS = ['#2a2a36', '#3a3a3a', '#4a3a2a', '#2f3f5f', '#5a5048', '#6a6a5a', '#3a4a5a'];
const DOGC = ['#c8a070', '#3a2a20', '#e8e0d0', '#8a6a4a', '#1e1e1e'];
const GREET = ['Bom dia!', 'Tudo bem?', 'Olá!', 'Então?', 'Até logo!', 'Boa tarde!', 'Que calor…', 'Viste o jogo?'];
const GRUMBLE = ['No bakery near here…', 'Where do I buy bread?', 'The grocer is so far…'];
G.citizens = []; G.follow = null;

function cellOf(p) { return cellAt(Math.round(p.x / S + (N - 1) / 2), Math.round(p.z / S + (N - 1) / 2)); }
function bfs(a, b, maxD = 999) {
  if (!a || !b) return null; if (a === b) return [a];
  const prev = new Map([[a, null]]), q = [a], d = new Map([[a, 0]]);
  while (q.length) {
    const c = q.shift(); if (d.get(c) >= maxD) continue;
    for (const [dx, dz] of DIRS) {
      const n = cellAt(c.i + dx, c.j + dz); if (!n || prev.has(n) || !canStep(c, n, dx)) continue;
      prev.set(n, c); d.set(n, d.get(c) + 1);
      if (n === b) { const path = [n]; let p = c; while (p) { path.unshift(p); p = prev.get(p); } return path; }
      q.push(n);
    }
  }
  return null;
}
function houseDoor(h) { const k = frontFace(h); if (k === undefined) return null; const [dx, dz] = DIRS[k], L = cellAt(h.i + dx, h.j + dz); return new THREE.Vector3(wx(L.i) - dx * .9, L.lvl * LV, wx(L.j) - dz * .9); }


/* ==========================================================================
   NAV: fine walk grid (8 nodes per cell). Hard blocks (walls, water, cliffs,
   stair railings via height steps) and soft blocks (props, furniture, lamp
   posts, fountains) that paths avoid; A* + string pulling; ground height that
   follows stairs and bridge decks.
   ========================================================================== */
const NR = 8, NG = N * NR, NS = S / NR, NX0 = -N * S / 2;
const nav = {pass: new Uint8Array(NG * NG), h: new Float32Array(NG * NG), comp: new Int32Array(NG * NG), dirty: true, props: [], fields: new Map(), stairs: new Map()};
const nIdx = (gx, gz) => gx * NG + gz;
const nOf = v => Math.floor((v - NX0) / NS);
const nX = g => NX0 + (g + .5) * NS;
function stairsOf(c) {
  let s = nav.stairs.get(c); if (s) return s; s = [];
  if (c && walkable(c) && !c.water) DIRS.forEach(([dx, dz], di) => { const U = cellAt(c.i + dx, c.j + dz); if (!U || U.water || !walkable(U) || U.lvl !== c.lvl + 1) return; const R = rng(c.seed * 3 + di); s.push({dx, dz, lat: (R() - .5) * .7}); });
  nav.stairs.set(c, s); return s;
}
function groundAt(x, z, c = cellOf({x, z})) {
  if (!c) return 0; if (c.water) return .17;
  const lx = x - wx(c.i), lz = z - wx(c.j), base = c.lvl * LV;
  for (const st of stairsOf(c)) { const along = lx * st.dx + lz * st.dz, lat = -lx * st.dz + lz * st.dx; if (along > 0 && Math.abs(lat - st.lat) < .45) return base + LV * THREE.MathUtils.clamp(along + .1, 0, 1); }
  return base;
}
function navPropBox(geos, inflate = .05, minH = .08, maxY0 = Infinity) {
  if (!geos.length) return; const bb = new THREE.Box3(), b = new THREE.Box3();
  for (const g of geos) { if (!g.boundingBox) g.computeBoundingBox(); b.copy(g.boundingBox); if (b.max.y - b.min.y < minH) continue; bb.union(b); }
  if (!bb.isEmpty() && bb.min.y <= maxY0) nav.props.push({x0: bb.min.x - inflate, x1: bb.max.x + inflate, z0: bb.min.z - inflate, z1: bb.max.z + inflate, y0: bb.min.y});
}
function navBuild() {
  nav.dirty = false; nav.stairs.clear(); nav.fields.clear();
  const P = nav.pass, H = nav.h;
  for (let gx = 0; gx < NG; gx++) for (let gz = 0; gz < NG; gz++) {
    const k = nIdx(gx, gz), c = cellAt(Math.floor(gx / NR), Math.floor(gz / NR)), x = nX(gx), z = nX(gz);
    if (!c || !walkable(c)) { P[k] = 0; H[k] = 0; continue; }
    if (c.water) { const ok = c.kind === 'bridge' && Math.abs(x - wx(c.i)) < .42; P[k] = ok ? 1 : 0; H[k] = .17; continue; }
    P[k] = 1; H[k] = groundAt(x, z, c);
    const lx = x - wx(c.i), lz = z - wx(c.j);
    // quay rails / parapets at the cell rim towards water or drops
    if (Math.abs(lx) > .86 || Math.abs(lz) > .86) { const dx = Math.abs(lx) > .86 ? Math.sign(lx) : 0, dz = Math.abs(lz) > .86 ? Math.sign(lz) : 0; for (const [ax, az] of [[dx, 0], [0, dz]]) { if (!ax && !az) continue; const n = cellAt(c.i + ax, c.j + az); if (!n || (n.water && n.kind !== 'bridge') || (n.water && n.kind === 'bridge' && ax !== 0)) P[k] = 0; } }
  }
  // soft obstacles: lamp posts, plaza furniture, street props, shop furniture
  const soft = (x, z, r) => { for (let gx = nOf(x - r); gx <= nOf(x + r); gx++) for (let gz = nOf(z - r); gz <= nOf(z + r); gz++) { if (gx < 0 || gz < 0 || gx >= NG || gz >= NG) continue; const k = nIdx(gx, gz); if (P[k] && Math.hypot(nX(gx) - x, nX(gz) - z) < r) P[k] = 2; } };
  const softBox = (x0, x1, z0, z1) => { for (let gx = Math.max(0, nOf(x0)); gx <= Math.min(NG - 1, nOf(x1)); gx++) for (let gz = Math.max(0, nOf(z0)); gz <= Math.min(NG - 1, nOf(z1)); gz++) { const k = nIdx(gx, gz); if (P[k] && nX(gx) > x0 && nX(gx) < x1 && nX(gz) > z0 && nX(gz) < z1) P[k] = 2; } };
  for (const c of G.cells) {
    const x = wx(c.i), z = wx(c.j);
    if (c.kind === 'lamp') soft(x + (c.broken ? .15 : 0), z, .16);
    if (c.kind === 'plaza') { soft(x, z, c.statue ? .48 : .72); for (const sz of [.82, -.82]) softBox(x - .36, x + .36, z + sz - .16, z + sz + .16); for (const [a, b] of [[.75, .75], [-.75, -.75], [.78, -.78], [-.78, .78]]) soft(x + a, z + b, .2); }
  }
  for (const b of nav.props) softBox(b.x0, b.x1, b.z0, b.z1);
  // connected components (soft counts as passable) for reachability tests
  const C = nav.comp; C.fill(-1); let id = 0; const q = new Int32Array(NG * NG);
  for (let s = 0; s < NG * NG; s++) { if (!P[s] || C[s] >= 0) continue; let h = 0, t = 0; q[t++] = s; C[s] = id;
    while (h < t) { const k = q[h++], gx = (k / NG) | 0, gz = k % NG; for (const [ax, az] of NB4) { const nx = gx + ax, nz = gz + az; if (nx < 0 || nz < 0 || nx >= NG || nz >= NG) continue; const n = nIdx(nx, nz); if (C[n] >= 0 || !P[n] || !navStep(k, n)) continue; C[n] = id; q[t++] = n; } }
    id++; }
}
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], NB8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
function navStep(a, b) {
  const P = nav.pass; if (!P[a] || !P[b]) return false;
  if (Math.abs(nav.h[a] - nav.h[b]) > .25) return false;
  const ax = (a / NG) | 0, az = a % NG, bx = (b / NG) | 0, bz = b % NG, ci = Math.floor(ax / NR), cj = Math.floor(az / NR), di = Math.floor(bx / NR), dj = Math.floor(bz / NR);
  if (ci === di && cj === dj) return true;
  if (ci !== di && cj !== dj) return false;
  const A = cellAt(ci, cj), B = cellAt(di, dj); return !!(A && B && canStep(A, B, di - ci) && canStep(B, A, ci - di));
}
function navEnsure() { if (nav.dirty) navBuild(); }
function navNear(x, z, maxR = 10) { // nearest passable node to a point
  navEnsure(); const gx = THREE.MathUtils.clamp(nOf(x), 0, NG - 1), gz = THREE.MathUtils.clamp(nOf(z), 0, NG - 1);
  if (nav.pass[nIdx(gx, gz)] === 1) return nIdx(gx, gz);
  for (let r = 1; r <= maxR; r++) { let best = -1, bd = 1e9; for (let ax = -r; ax <= r; ax++) for (let az = -r; az <= r; az++) { if (Math.max(Math.abs(ax), Math.abs(az)) !== r) continue; const nx = gx + ax, nz = gz + az; if (nx < 0 || nz < 0 || nx >= NG || nz >= NG) continue; const k = nIdx(nx, nz); if (nav.pass[k] !== 1) continue; const d = ax * ax + az * az; if (d < bd) { bd = d; best = k; } } if (best >= 0) return best; }
  return -1;
}
const nodeVec = (k, v = new THREE.Vector3()) => v.set(nX((k / NG) | 0), nav.h[k], nX(k % NG));
// A* over the fine grid
const AS = {g: new Float32Array(NG * NG), f: new Float32Array(NG * NG), from: new Int32Array(NG * NG), seen: new Uint32Array(NG * NG), stamp: 1, heap: new Int32Array(NG * NG * 4)};
function navPath(sx, sz, tx, tz) {
  navEnsure();
  let s = navNear(sx, sz, 6); if (s < 0) return null;
  const tgx = THREE.MathUtils.clamp(nOf(tx), 0, NG - 1), tgz = THREE.MathUtils.clamp(nOf(tz), 0, NG - 1);
  let t = nIdx(tgx, tgz); if (!nav.pass[t] || nav.comp[t] !== nav.comp[s]) { t = -1; // goal inside a wall: nearest reachable node
    for (let r = 1; r <= 10 && t < 0; r++) for (let ax = -r; ax <= r && t < 0; ax++) for (let az = -r; az <= r; az++) { const nx = tgx + ax, nz = tgz + az; if (nx < 0 || nz < 0 || nx >= NG || nz >= NG) continue; const k = nIdx(nx, nz); if (nav.pass[k] && nav.comp[k] === nav.comp[s]) { t = k; break; } } }
  if (t < 0) return null;
  const st = ++AS.stamp, {g, f, from, seen, heap} = AS; let hn = 0;
  const hx = (t / NG) | 0, hz = t % NG, heur = k => { const dx = Math.abs(((k / NG) | 0) - hx), dz = Math.abs(k % NG - hz); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
  const push = k => { let i = hn++; heap[i] = k; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[k]) break; heap[i] = heap[p]; i = p; } heap[i] = k; };
  const pop = () => { const top = heap[0], last = heap[--hn]; let i = 0; while (true) { let l = i * 2 + 1; if (l >= hn) break; if (l + 1 < hn && f[heap[l + 1]] < f[heap[l]]) l++; if (f[heap[l]] >= f[last]) break; heap[i] = heap[l]; i = l; } heap[i] = last; return top; };
  seen[s] = st; g[s] = 0; f[s] = heur(s); from[s] = -1; push(s); let found = false, it = 0;
  while (hn && it++ < 40000) {
    const k = pop(); if (k === t) { found = true; break; }
    const kx = (k / NG) | 0, kz = k % NG;
    for (const [ax, az, w] of NB8) {
      const nx = kx + ax, nz = kz + az; if (nx < 0 || nz < 0 || nx >= NG || nz >= NG) continue; const n = nIdx(nx, nz);
      if (!navStep(k, n)) continue;
      if (ax && az && (!navStep(k, nIdx(nx, kz)) || !navStep(k, nIdx(kx, nz)))) continue;
      const cost = g[k] + w * (nav.pass[n] === 2 ? 6 : 1);
      if (seen[n] === st && cost >= g[n]) continue;
      seen[n] = st; g[n] = cost; f[n] = cost + heur(n); from[n] = k; push(n);
    }
  }
  if (!found) return null;
  const nodes = []; for (let k = t; k >= 0; k = from[k]) nodes.push(k); nodes.reverse();
  // string pulling: keep the farthest node still in clear line of sight
  const out = []; let i = 0;
  while (i < nodes.length - 1) { let j = Math.min(nodes.length - 1, i + 24); while (j > i + 1 && !navLOS(nodes[i], nodes[j])) j--; out.push(nodes[j]); i = j; }
  return out.map(k => nodeVec(k));
}
function navLOS(a, b) {
  const ax = nX((a / NG) | 0), az = nX(a % NG), bx = nX((b / NG) | 0), bz = nX(b % NG), L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / .08); let prev = a;
  for (let q = 1; q <= n; q++) { const u = q / n, k = nIdx(nOf(ax + (bx - ax) * u), nOf(az + (bz - az) * u)); if (k === prev) continue; if (nav.pass[k] !== 1 && k !== b) return false; const px = (prev / NG) | 0, pz = prev % NG, kx = (k / NG) | 0, kz = k % NG; if (!navStep(prev, k)) return false; if (px !== kx && pz !== kz && (!navStep(prev, nIdx(kx, pz)) || !navStep(prev, nIdx(px, kz)))) return false; prev = k; }
  return true;
}
// BFS distance fields from each business door (in cells) for decisions
function navDist(b, from) {
  navEnsure(); let F = nav.fields.get(b);
  if (!F) { F = new Float32Array(NG * NG).fill(1e9); const s = navNear(b.door.x, b.door.z, 6); if (s >= 0) { const q = new Int32Array(NG * NG); let h = 0, t = 0; q[t++] = s; F[s] = 0; while (h < t) { const k = q[h++], gx = (k / NG) | 0, gz = k % NG; for (const [ax, az] of NB4) { const nx = gx + ax, nz = gz + az; if (nx < 0 || nz < 0 || nx >= NG || nz >= NG) continue; const n = nIdx(nx, nz); if (F[n] < 1e9 || !navStep(k, n)) continue; F[n] = F[k] + 1; q[t++] = n; } } } nav.fields.set(b, F); }
  const k = navNear(from.x, from.z, 6); return k < 0 ? 1e9 : F[k] / NR;
}
const navOK = (x, z) => { const gx = nOf(x), gz = nOf(z); return gx >= 0 && gz >= 0 && gx < NG && gz < NG && nav.pass[nIdx(gx, gz)] > 0; };
function navRandomSpot(z, filter) { // a random free spot reachable from z
  navEnsure(); const s = navNear(z.pos.x, z.pos.z, 6); if (s < 0) return null;
  for (let tries = 0; tries < 40; tries++) { const k = Math.floor(z.R() * NG * NG); if (nav.pass[k] !== 1 || nav.comp[k] !== nav.comp[s]) continue; const c = cellAt(Math.floor(((k / NG) | 0) / NR), Math.floor((k % NG) / NR)); if (!c || c.water || (filter && !filter(c))) continue; return nodeVec(k); }
  return null;
}
/* ---------------- needs-driven errands ---------------- */
const SAT = {bakery: {food: .5, coffee: .15}, grocer: {food: .8}, fish: {food: .6}, cafe: {coffee: 1, fun: .2}, tasca: {food: .4, fun: .5}, winebar: {fun: .7}, cinema: {fun: .9}, florist: {errand: 1}, pharmacy: {errand: 1}, barber: {errand: 1}, books: {errand: 1, fun: .2}};
const NEED_RATE = {food: .045, coffee: .09, fun: .04, errand: .03};
function needs(z) {
  if (!z.nd) { const R = rng((z.seedN || 1) * 17 + 3); z.nd = {food: .45 + R() * .5, coffee: .35 + R() * .6, fun: .4 + R() * .5, errand: .5 + R() * .5}; z.ndT = now(); }
  return z.nd;
}
function needsTick(z) {
  const n = needs(z), t = now(), dh = Math.max(0, Math.min(6, t - z.ndT)); z.ndT = t; if (!dh) return;
  const awake = G.hour > 6.5 && G.hour < 23, home = z.state === 'inside' && z.where?.type === 'home';
  for (const k in NEED_RATE) n[k] = Math.max(0, n[k] - NEED_RATE[k] * dh * (awake ? 1 : .2) * (k === 'coffee' && home ? .5 : 1));
}
function satisfy(z, type) { const n = needs(z), s = SAT[type]; if (!s) return; for (const k in s) n[k] = Math.min(1, n[k] + s[k]); }
const MAXWALK = z => z.role === 'retiree' ? 9 : z.role === 'student' ? 13 : 11;
function fromPos(z) { return z.state === 'inside' ? (z.where?.type === 'home' ? (houseDoor(z.home) || z.pos) : z.where?.b?.door || z.pos) : z.pos; }
function shopOptions(z, bias, typeOnly) {
  const n = needs(z), from = fromPos(z), out = [];
  for (const b of G.businesses) {
    if (!b.door || !isOpenAt(b.type, G.hour) || (typeOnly && b.type !== typeOnly)) continue;
    const s = SAT[b.type] || {}; let gain = 0; for (const k in s) gain += (1 - n[k]) * s[k];
    if (bias === b.type) gain += .45; if (gain < .18 && !typeOnly) continue;
    const d = navDist(b, from); if (d > MAXWALK(z)) continue;
    if ((z.wallet ?? 0) < (PRICE[b.type] || 8) * .85) continue;
    const busy = b.queue ? b.queue.length : 0; if (busy >= 5) continue;
    out.push({b, score: gain / (1 + d / 6) * (z.fav === b ? 1.3 : 1) * (1 - busy * .1), d});
  }
  return out.sort((a, c) => c.score - a.score);
}
function chooseActivity(z, bias) {
  const opts = shopOptions(z, bias), r = z.R();
  const strollW = .16 + (needs(z).fun < .5 ? .1 : 0), best = opts[0];
  if (best && best.score > strollW * (.6 + r * .8)) { const pickO = opts.length > 1 && z.R() < .25 ? opts[1] : best; return goBusiness(z, pickO.b); }
  return newStroll(z);
}
function goBusiness(z, b) { return ['cafe', 'tasca', 'winebar', 'cinema'].includes(b.type) ? visitB(z, b) : shopB(z, b); }
function visitB(z, b) {
  if (!pay(z, b)) return newStroll(z);
  release(z); if (z.state === 'inside' && !show(z)) return;
  const dur = b.type === 'tasca' ? 1 + z.R() : .4 + z.R() * .5;
  if (raining() || b.type === 'cinema') return goTo(z, b.door, 'enter', {type: 'cafeIn', b, until: now() + dur});
  const s = freeSeat(b.seats, z); if (!s) return goTo(z, b.door, 'enter', {type: 'cafeIn', b, until: now() + dur});
  s.biz = b; goTo(z, s.pos, 'seat', {seat: s, dur});
}
function shopB(z, b) {
  release(z); if (z.state === 'inside' && !show(z)) return;
  b.queue.push(z); z.qb = b; goTo(z, qspot(b, b.queue.length - 1), 'queue');
}
/* local avoidance: walkers steer around each other and around people standing still */
const _sep = new THREE.Vector3(), sepHash = new Map();
function separate(dt) {
  sepHash.clear(); const key = (x, z) => (Math.floor(x / .5) + 512) * 4096 + Math.floor(z / .5) + 512;
  for (const z of G.citizens) { if (z.state === 'inside') continue; const k = key(z.pos.x, z.pos.z); let l = sepHash.get(k); if (!l) sepHash.set(k, l = []); l.push(z); }
  const R = .22, LOOK = .55;
  for (const z of G.citizens) {
    if (z.state !== 'go' && z.state !== 'follow') continue;
    const gd = z.goal ? Math.hypot(z.goal.pt.x - z.pos.x, z.goal.pt.z - z.pos.z) : 9;
    _sep.set(0, 0, 0); const gx = Math.floor(z.pos.x / .5), gz = Math.floor(z.pos.z / .5), fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = sepHash.get((gx + a + 512) * 4096 + gz + b + 512); if (!l) continue;
      for (const o of l) { if (o === z || (z.role === 'child' && o === z.parent) || (o.role === 'child' && o.parent === z) || (z.role === 'child' && o.role === 'child' && o.parent === z.parent)) continue;
        const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z, d = Math.hypot(dx, dz); if (d > LOOK || d < 1e-4 || Math.abs(z.pos.y - o.pos.y) > .3) continue;
        if (gd < .25 && o.state !== 'go') continue; // arriving next to someone (queue, seat) is fine
        const share = o.state === 'go' || o.state === 'follow' ? .5 : 1;
        if (d < R) { const k = (R - d) / R * 2.2 * share; _sep.x += dx / d * k; _sep.z += dz / d * k; }
        const along = -dx * fx - dz * fz; // other is ahead of me
        if (along > 0 && along < LOOK) { const px = -dx - fx * along, pz = -dz - fz * along, lat = Math.hypot(px, pz); if (lat < R * 1.15) { let sx = fz, sz = -fx; const side = px * sx + pz * sz; if (side > 0 || (side === 0 && o.state === 'go')) { sx = -sx; sz = -sz; } const k = (1 - along / LOOK) * (1 - lat / (R * 1.15)) * 1.6 * share; _sep.x += sx * k; _sep.z += sz * k; } } } }
    if (!_sep.x && !_sep.z) continue;
    const m = Math.hypot(_sep.x, _sep.z), L = Math.min(1.2, m) * dt * .7 * Math.max(G.speed, .5), nx = z.pos.x + _sep.x / m * L, nz = z.pos.z + _sep.z / m * L;
    const a = nIdx(nOf(z.pos.x), nOf(z.pos.z)), b = nIdx(nOf(nx), nOf(nz));
    if (a === b ? nav.pass[b] > 0 : navStep(a, b)) { z.pos.x = nx; z.pos.z = nz; z.pos.y = groundAt(nx, nz); }
  }
}
window.__life = {
  monitor() {
    const M = {frames: 0, jumps: 0, popOut: 0, blocked: 0, soft: 0, air: 0, overlap: 0, samples: 0, jumpEx: [], popEx: []}; const last = new Map();
    const tick = () => {
      M.frames++;
      const out = G.citizens.filter(z => z.state !== 'inside');
      for (const z of G.citizens) {
        const p = last.get(z), inside = z.state === 'inside';
        if (p && !inside && !p.inside && z.role !== 'child') { const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z); if (d > .6) { M.jumps++; if (M.jumpEx.length < 5) M.jumpEx.push(z.state + ':' + d.toFixed(2)); } }
        if (p && !inside && p.inside && z.role !== 'child') { const doors = [houseDoor(z.home), ...G.businesses.map(b => b.door)].filter(Boolean); const dd = Math.min(...doors.map(d => Math.hypot(d.x - z.pos.x, d.z - z.pos.z))), c = cellOf(z.pos), edge = c && DIRS.some(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); return !n || n.owned === false; }); if (dd > .6 && !edge) { M.popOut++; if (M.popEx.length < 5) M.popEx.push(z.where?.type + ':' + dd.toFixed(1) + ':' + (c && [c.i, c.j]) + ':' + z.state); } }
        if (p && !inside && z.role !== 'child') { const k0 = nIdx(nOf(p.x), nOf(p.z)), k1 = nIdx(nOf(z.pos.x), nOf(z.pos.z)); if (!nav.pass[k1] && (p.inside || nav.pass[k0])) { (M.enter ||= []).length < 10 && M.enter.push([p.inside ? 'from-inside' : 'walk', p.st, z.state, z.goal?.kind, z.where?.type, (Math.hypot(z.pos.x - p.x, z.pos.z - p.z)).toFixed(2), (() => { const c = cellOf(z.pos); return c ? [c.i, c.j, c.kind, c.water, c.floors, (z.pos.x - wx(c.i)).toFixed(2), (z.pos.z - wx(c.j)).toFixed(2), nav.dirty].join(',') : 'none'; })()].join('/')); } }
        last.set(z, {x: z.pos.x, z: z.pos.z, inside, st: z.state});
      }
      for (const z of out) { if (z.state !== 'go' || z.role === 'child') continue; M.samples++; const k = nIdx(nOf(z.pos.x), nOf(z.pos.z)); const gd = z.goal ? Math.hypot(z.goal.pt.x - z.pos.x, z.goal.pt.z - z.pos.z) : 9; if (!nav.pass[k]) { M.blocked++; if ((M.blEx ||= []).length < 12 && M.frames % 7 === 0) { const c = cellOf(z.pos); M.blEx.push([z.goal?.kind, z.goal?.data?.type, c?.kind, c?.water, c?.floors, (z.pos.x - wx(c.i)).toFixed(2), (z.pos.z - wx(c.j)).toFixed(2), z.wp.length].join('/')); } } else if (nav.pass[k] === 2 && gd > .45) M.soft++; if (Math.abs(z.pos.y - groundAt(z.pos.x, z.pos.z)) > .06) M.air++; }
      for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) { const A = out[a], B = out[b]; if (A.state !== 'go' && B.state !== 'go') continue; if (A.parent === B || B.parent === A) continue; if (Math.hypot(A.pos.x - B.pos.x, A.pos.z - B.pos.z) < .12 && Math.abs(A.pos.y - B.pos.y) < .3) { M.overlap++; if ((M.ovEx ||= []).length < 14 && M.frames % 5 === 0) { const gd = q => q.goal ? Math.hypot(q.goal.pt.x - q.pos.x, q.goal.pt.z - q.pos.z).toFixed(2) : '-'; M.ovEx.push([A.state, A.goal?.kind, gd(A), B.state, B.goal?.kind, gd(B), A.role, B.role].join('/')); } } }
    };
    window.__lifeM = M; window.__lifeTick = tick; return 1;
  },
  sim(steps, dt = 1 / 30, sp = 4) { const os = G.speed; G.speed = sp; for (let k = 0; k < steps; k++) { G.updateCity(dt); if (window.__lifeTick) window.__lifeTick(); } G.speed = os; return hhmm(G.hour) + ' d' + G.day; },
  sales: () => G.businesses.map(b => b.type + ':' + b.sales + '/' + (b.visits || 0)).join(' '),
  needs: () => { const c = {}; G.citizens.forEach(z => { if (z.need) c[z.need] = (c[z.need] || 0) + 1; }); return c; },
  nd: () => { const n = G.citizens.filter(z => z.nd); const avg = k => (n.reduce((a, z) => a + z.nd[k], 0) / Math.max(1, n.length)).toFixed(2); return {food: avg('food'), coffee: avg('coffee'), fun: avg('fun')}; },
};
window.__life.dbg = () => ({placeOf, edgeCell, show, startStep, chooseActivity, stairsOf, groundAt, navPath});
window.__life.open = (type) => { const used = new Set(G.businesses.map(b => b.cell)); const cand = G.cells.filter(c => c.floors > 0 && !c.biz && frontFace(c) !== undefined && !used.has(c)); const far = cand.sort((a, b) => Math.min(...G.businesses.filter(x => x.type === type).map(x => Math.abs(x.cell.i - b.i) + Math.abs(x.cell.j - b.j)), 99) - Math.min(...G.businesses.filter(x => x.type === type).map(x => Math.abs(x.cell.i - a.i) + Math.abs(x.cell.j - a.j)), 99))[0]; far.biz = type; far.bizName = 'Test ' + type; refresh(far, true); return [far.i, far.j]; };
window.__life.count = type => G.businesses.filter(b => b.type === type).map(b => b.bizName + ':' + b.sales).join(' ');
window.__life.conn = () => { navEnsure(); const cs = G.cells.filter(c => walkable(c) && !c.water); const comp = c => nav.comp[navNear(wx(c.i), wx(c.j), 4)]; const m = new Map(); cs.forEach(c => { const k = comp(c); m.set(k, (m.get(k) || 0) + 1); }); const bad = []; for (const a of cs) for (const b of cs) { if (bad.length > 6) break; if (comp(a) !== comp(b) && bfs(a, b)) bad.push([a.i, a.j, a.lvl, b.i, b.j, b.lvl].join(',')); } return {comps: [...m.values()].sort((a, b) => b - a), bad}; };
window.__life.grid = () => { navEnsure(); let s = ''; for (let i = 0; i < N; i++) { for (let j = 0; j < N; j++) { const c = cellAt(i, j); let ch = '  .'; if (c.owned === false) ch = '  ~'; else if (c.water) ch = c.kind === 'bridge' ? '  =' : '  w'; else if (c.floors) ch = '  H'; else if (c.kind === 'tree') ch = '  T'; else if (walkable(c)) { const k = nav.comp[navNear(wx(i), wx(j), 4)]; ch = String(k).padStart(2) + c.lvl; } s += ch; } s += '\n'; } return s; };
window.__life.only = (c) => { const hid = []; const st = c.bizObj?.street; for (const grp of [objG, terrainG, bizSpillG, laundryG]) grp.children.forEach(o => { const oc = o.userData.cell || o.userData.biz?.cell; const keep = oc === c || (st && oc === st) || (grp === bizSpillG && o.userData.biz?.cell === c); if (!keep && o.visible) { o.visible = false; hid.push(o); } }); return () => hid.forEach(o => o.visible = true); };

function sd(R) { const n = Math.floor(R() * 1e9); return {seedN: n, R: rng(n)}; }
function makeLook(z, R) {
  const elder = z.role === 'retiree', child = z.role === 'child';
  z.s = child ? .6 + R() * .08 : .94 + R() * .14; z.bw = .9 + R() * .25;
  z.skin = new THREE.Color(pick(R, SKIN)); z.shirt = new THREE.Color(pick(R, SHIRT)); z.pants = new THREE.Color(pick(R, PANTS));
  z.hairC = new THREE.Color(elder ? pick(R, ['#c8c8c4', '#a8a8a4', '#e8e8e4', '#8a8a88']) : pick(R, HAIR));
  z.hair = z.male ? (elder && R() < .35 ? 0 : 1) : pick(R, child ? [2, 4, 4, 1] : [2, 2, 3, 4, 1]);
  z.beard = z.male && !child && R() < .28; z.hat = elder ? (R() < .45 ? (z.male ? 1 : 2) : 0) : (!child && R() < .08 ? 1 : 0);
  z.hatC = new THREE.Color(pick(R, ['#3a3a3a', '#5a4a3a', '#2a3a4a', '#6a2a2a', '#4a4a3a']));
  z.skirt = !z.male && R() < .45; z.skirtC = new THREE.Color(pick(R, ['#6a2a3a', '#2f3f5f', '#3f5a3f', '#8a6a3a', '#5a4a6a', '#a84a3a', '#2a2a2a']));
  z.tights = R() < .5 ? z.skin.clone() : new THREE.Color('#2a2a30');
  z.shortSleeve = !elder && R() < .3; z.shoeC = new THREE.Color(pick(R, ['#1e1a18', '#3a2a20', '#5a3a28', '#2a2a30', '#d8d0c8']));
  z.lean = elder ? .2 + R() * .1 : 0; z.cane = elder && R() < .5;
  z.apron = (z.role === 'keeper' || z.role === 'staff') && ['cafe', 'bakery', 'grocer', 'fish', 'tasca'].includes(z.work?.type);
  z.bagC = new THREE.Color(pick(R, ['#e8dcc0', '#c9a33f', '#3f6a4f', '#a84a3a', '#d8d0c4']));
  z.umbC = new THREE.Color(pick(R, ['#1e1e24', '#8a2a2a', '#2a4a6a', '#3a5a3a', '#c9a33f']));
}
function spawnCitizens(seed) {
  G.citizens = []; G.follow = null; closeCard();
  const R = rng(seed * 3 + 1), budget = Math.round(BUDGET() * .42);
  G.cells.forEach(c => { c.res = []; });
  const houses = G.cells.filter(c => c.floors > 0 && frontFace(c) !== undefined);
  for (let i = houses.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [houses[i], houses[j]] = [houses[j], houses[i]]; }
  const last = pick(R, LAST);
  for (const h of houses) {
    const fam = pick(R, LAST), n = 1 + Math.floor(R() * Math.min(h.floors + 1, 3));
    for (let k = 0; k < n && G.citizens.length < budget; k++) {
      const male = R() < .5, z = {id: G.citizens.length, male, name: `${pick(R, male ? FIRST_M : FIRST_F)} ${fam}`, home: h, role: null, work: null, ...sd(R), pos: new THREE.Vector3(), yaw: R() * 6, state: 'inside', where: {type: 'home'}, wp: [], lane: (R() - .5) * .6, phase: R() * 6, vis: 0, talkCD: 0, carry: false};
      G.citizens.push(z); h.res.push(z);
    }
  }
  const free = () => G.citizens.filter(z => !z.role);
  for (const b of G.businesses) {
    for (const role of BIZ[b.type].staff ? ['keeper', 'staff'] : ['keeper']) {
      const f = free(); if (!f.length) break;
      f.sort((a, c) => (Math.abs(a.home.i - b.cell.i) + Math.abs(a.home.j - b.cell.j)) - (Math.abs(c.home.i - b.cell.i) + Math.abs(c.home.j - b.cell.j)) + (R() - .5) * 6);
      const z = f[0]; z.role = role; z.work = b;
    }
  }
  for (const z of free()) {
    const r = R(), adults = z.home.res.filter(o => o !== z && o.role !== 'child');
    if (r < .28) z.role = 'retiree';
    else if (r < .45) z.role = 'student';
    else if (r < .57 && adults.length) { z.role = 'child'; z.parent = pick(R, adults); }
    else { z.role = 'worker'; z.work = 'away'; }
  }
  const ws = G.citizens.filter(z => z.role === 'worker'); if (ws.length > 3) { ws[0].role = 'courier'; ws[0].work = null; ws[1].role = 'musician'; ws[1].work = null; }
  const cafes = G.businesses.filter(b => b.type === 'cafe');
  for (const z of G.citizens) {
    z.age = z.role === 'child' ? 6 + Math.floor(z.R() * 6) : z.role === 'retiree' ? 66 + Math.floor(z.R() * 22) : z.role === 'student' ? 17 + Math.floor(z.R() * 7) : 24 + Math.floor(z.R() * 38);
    z.chatty = z.R() < .55; z.dog = z.role !== 'child' && z.role !== 'staff' && z.R() < .16 ? {c: new THREE.Color(pick(z.R, DOGC)), s: .8 + z.R() * .5, pos: new THREE.Vector3(), yaw: 0} : null;
    z.fav = cafes.length ? pick(z.R, cafes) : null;
    z.wallet = 40 + z.R() * 160; makeLook(z, z.R); z.plan = makePlan(z); z.step = null;
  }
  computeMood(); buildPeopleMeshes(); warmStart();
}
const ACT = {winebar: 'Wine bar', cinema: 'Cinema', paint: 'Painting', concert: 'Concert', home: 'Home', work: 'Work', away: 'Out of town', school: 'School', cafe: 'Café', tasca: 'Tasca', shop: 'Shopping', stroll: 'Stroll', dog: 'Dog walk'};
function makePlan(z) {
  const R = z.R, j = () => (R() - .5) * .7, P = [], add = (at, act, arg) => P.push({at: THREE.MathUtils.clamp(at, 0, 23.95), act, arg});
  add(0, 'home');
  if (z.role === 'keeper' || z.role === 'staff') {
    BIZ[z.work.type].hours.forEach(([a, b]) => { add(a - .5 + R() * .2, 'work'); add(Math.min(b + .2, 23.9), b < 22 && R() < .35 ? 'tasca' : 'home'); });
    if (z.dog) add(BIZ[z.work.type].hours.at(-1)[1] + .6, 'dog');
  } else if (z.role === 'worker') {
    if (z.dog) add(6.4 + j() * .3, 'dog');
    add(7 + j() * .5, 'shop', 'bakery'); add(7.9 + j(), 'away');
    add(17.2 + j(), R() < .3 ? 'cafe' : R() < .5 ? 'shop' : R() < .65 ? 'winebar' : 'stroll', pick(R, ['grocer', 'barber', 'florist', 'pharmacy']));
    add(18.4 + j(), z.dog ? 'dog' : 'home'); if (R() < .4) add(19.7 + j(), 'tasca'); add(21.6 + j() + R(), 'home');
  } else if (z.role === 'retiree') {
    if (z.dog) add(7.4 + j(), 'dog');
    add(8.6 + j(), 'cafe'); add(10 + j(), 'shop', pick(R, ['grocer', 'fish', 'florist', 'bakery', 'pharmacy'])); add(11.3 + j(), 'home');
    add(14.4 + j(), 'stroll'); add(16 + j(), R() < .5 ? 'cafe' : 'stroll'); add(17.8 + j(), 'home');
  } else if (z.role === 'courier') {
    add(5.6 + R() * .3, 'deliver'); add(9.4, 'stroll'); add(12, 'home'); add(17 + j(), 'cafe'); add(19 + j(), 'home');
  } else if (z.role === 'musician') {
    add(10 + j(), 'stroll'); add(12.5, 'home'); add(15.5 + j() * .3, 'busk'); add(21.6, 'home');
  } else if (z.role === 'baby') {
  } else if (z.role === 'guest') {
    const d0 = z.arrive ?? -1, nights = z.nights || 1, arr = z.arrAt || 16;
    if (G.day === d0) { add(0, 'away'); add(arr, 'home'); add(Math.max(arr + 1.2, 19.3 + j()), R() < .5 ? 'tasca' : 'winebar'); add(21.8 + j(), 'home'); }
    else if (d0 < 0 || G.day >= d0 + nights) { z.leaving = true; add(0, 'home'); add(8.4 + j(), 'cafe'); add(9.8 + j(), 'stroll'); add(11.2 + j(), 'away'); }
    else { add(0, 'home'); add(8.6 + j(), 'cafe'); add(10 + j(), 'stroll'); add(12.6 + j(), 'tasca'); add(14.5 + j(), 'stroll'); add(16.3 + j(), 'shop', pick(R, ['books', 'florist', 'bakery'])); add(19.6 + j(), R() < .5 ? 'winebar' : 'cinema'); add(22.2 + j(), 'home'); }
  } else if (z.role === 'student') {
    add(7.9 + j(), 'school'); add(13.2 + j(), 'stroll'); add(15 + j(), R() < .5 ? 'shop' : 'cafe', 'books'); add(16.6 + j(), 'stroll');
    add(19.4 + j(), R() < .35 ? 'tasca' : R() < .5 ? 'cinema' : R() < .7 ? 'winebar' : 'stroll'); add(22.6 + j() + R(), 'home');
  }
  return P.sort((a, b) => a.at - b.at);
}
const CONCERT_STEP = {at: 20, act: 'concert'};
function currentStep(z) { if (concertTime() && z.role !== 'baby' && z.id % 3 === 0 && z.step?.act !== 'work') return CONCERT_STEP; if (partyTime() && z.role !== 'baby' && !(z.work && z.work !== 'away' && z.work.type === 'tasca' && z.step?.act === 'work')) return FEST_STEP; let s = z.plan[0]; for (const p of z.plan) if (p.at <= G.hour) s = p; return s; }
function computeMood() {
  const food = G.businesses.filter(b => b.type === 'bakery' || b.type === 'grocer');
  const cache = new Map();
  for (const z of G.citizens) {
    if (!cache.has(z.home)) { const k = frontFace(z.home); const st = k === undefined ? null : cellAt(z.home.i + DIRS[k][0], z.home.j + DIRS[k][1]); cache.set(z.home, [!!st && food.some(b => { const p = bfs(st, b.street, 7); return p && p.length - 1 <= 6; }), !!st && G.cells.some(c => c.kind === 'plaza' && (bfs(st, c, 6)?.length || 99) - 1 <= 5)]); }
    [z.food, z.plazaNear] = cache.get(z.home); z.happy = z.food; joyOf(z);
  }
}
function placeOf(z) {
  const w = z.where;
  if (w.type === 'home') return houseDoor(z.home);
  if ((w.type === 'work' || w.type === 'cafeIn') && w.b?.door) return w.b.door.clone();
  if (w.type === 'away') { const c = edgeCell(z); return c ? new THREE.Vector3(wx(c.i), walkY(c), wx(c.j)) : (houseDoor(z.home) || z.pos.clone()); }
  return z.pos.clone();
}
function edgeCell(z) { navEnsure(); const hd = z.home && houseDoor(z.home), hk = hd ? navNear(hd.x, hd.z, 6) : -1; const e = G.cells.filter(c => walkable(c) && !c.water && DIRS.some(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); return !n || n.owned === false; }) && (hk < 0 || nav.comp[navNear(wx(c.i), wx(c.j), 4)] === nav.comp[hk])); if (!e.length) return null; const h = z.home || cellOf(z.pos); return e.sort((a, b) => (Math.abs(a.i - h.i) + Math.abs(a.j - h.j)) - (Math.abs(b.i - h.i) + Math.abs(b.j - h.j)))[(z.seedN || 0) % Math.min(2, e.length)]; }
function show(z) { if (z.state !== 'inside') return; const p = placeOf(z); if (!p) return false; z.pos.copy(p); z.state = 'idle'; z.until = 0; return true; }
function goTo(z, pt, kind, data = {}) {
  z.goal = {pt: pt.clone(), kind, data}; z.stuck = 0;
  if (z.pos.distanceTo(pt) < .12 && z.state !== 'inside') { z.pos.x = pt.x; z.pos.z = pt.z; z.wp = []; arrive(z); return; }
  const path = navPath(z.pos.x, z.pos.z, pt.x, pt.z);
  if (!path) { // unreachable: don't teleport; give up on this plan and pick something else soon
    z.wp = []; leaveQueue(z); if (z.seat) { z.seat.by = null; z.seat = null; }
    if (z.state === 'inside') { z.until = now() + .15; return; }
    if (kind === 'enter') { z.state = 'inside'; z.where = data; z.until = data.until || 0; return; }
    z.state = 'idle'; z.until = now() + .05; return;
  }
  z.wp = path; const e = pt.clone(); e.y = groundAt(e.x, e.z); const ek = navNear(e.x, e.z, 0), last = path.length ? navNear(path.at(-1).x, path.at(-1).z, 2) : -1;
  const ok = nav.pass[nIdx(nOf(e.x), nOf(e.z))] > 0 && (last < 0 || navLOS(last, nIdx(nOf(e.x), nOf(e.z))) || Math.hypot(path.at(-1).x - e.x, path.at(-1).z - e.z) < .3);
  if (ok) z.wp.push(e); else if (path.length) z.goal.pt.copy(path.at(-1)); z.state = 'go';
}
function arrive(z) {
  const g = z.goal; z.wp = [];
  if (g.kind === 'enter') { z.state = 'inside'; z.where = g.data; z.until = g.data.until || 0; z.carry = g.data.type === 'home' ? false : z.carry; }
  else if (g.kind === 'seat') { z.state = 'sit'; z.seat = g.data.seat; z.yaw = z.seat.yaw; z.until = now() + g.data.dur; if (z.seat.biz) { z.seat.biz.visits++; (z.seat.biz.who ||= new Map()).set(z, (z.seat.biz.who.get(z) || 0) + 1); if (z.R() < .3) say3(z, z.seat.biz.type === 'cafe' ? 'Um café, por favor' : 'Mais um copo!'); } }
  else if (g.kind === 'queue') { z.state = 'queue'; }
  else if (g.kind === 'spot') { z.state = g.data.dance ? 'dance' : g.data.busk ? 'busk' : g.data.paint ? 'paint' : 'idle'; if (g.data.paint) { z.until = 0; z.yaw = g.data.yaw; return; } if (g.data.yaw != null) z.yaw = g.data.yaw; z.until = g.data.dance || g.data.busk ? 0 : now() + (g.data.dur || .1); if (g.data.dance) z.dancePh = Math.random() * 6; }
  else if (g.kind === 'stand') { z.state = 'idle'; z.yaw = g.data.yaw; z.until = 0; }
  else if (g.kind === 'serve') { z.state = 'serve'; z.until = 0; z.serveT = 0; }
}
function freeSeat(list, z) { if (z.seat) { z.seat.by = null; z.seat = null; } const f = list.filter(s => !s.by); if (!f.length) return null; const s = pick(z.R, f); s.by = z; return s; }
function leaveQueue(z) { if (z.qb) { const i = z.qb.queue.indexOf(z); if (i >= 0) z.qb.queue.splice(i, 1); z.qb = null; } z.serveEnd = null; }
function release(z) { leaveQueue(z); if (z.seat) { z.seat.by = null; z.seat = null; } z.talk = null; }
function newStroll(z) {
  release(z); if (z.state === 'inside' && !show(z)) return;
  const r = z.R(), dogStep = z.step?.act === 'dog';
  if (!dogStep && G.hour > 17.5 && G.hour < 22 && z.R() < .55) { const p = navRandomSpot(z, c => c.kind === 'plaza'); if (p) return goTo(z, p, 'spot', {dur: .12 + z.R() * .25}); }
  if (!dogStep && r < .35) { const s = freeSeat(G.publicSeats, z); if (s) return goTo(z, s.pos, 'seat', {seat: s, dur: .25 + z.R() * .4}); }
  if (r < .65 && G.railSpots.length) { const s = pick(z.R, G.railSpots); return goTo(z, s.pos, 'spot', {yaw: s.yaw, dur: .15 + z.R() * .25}); }
  const p = navRandomSpot(z); if (!p) { z.state = 'idle'; z.until = now() + .1; return; }
  goTo(z, p, 'spot', {dur: .05 + z.R() * .12});
}
function visit(z, type) {
  const open = G.businesses.filter(b => b.type === type && isOpenAt(type, G.hour) && b.door);
  if (!open.length) return newStroll(z);
  const b = z.fav && open.includes(z.fav) && z.R() < .6 ? z.fav : nearPick(z, open);
  if (!pay(z, b)) return newStroll(z);
  release(z); if (z.state === 'inside' && !show(z)) return;
  const dur = type === 'tasca' ? 1 + z.R() : .4 + z.R() * .5;
  if (raining()) return goTo(z, b.door, 'enter', {type: 'cafeIn', b, until: now() + dur});
  const s = freeSeat(b.seats, z); if (!s) return goTo(z, b.door, 'enter', {type: 'cafeIn', b, until: now() + dur});
  s.biz = b; goTo(z, s.pos, 'seat', {seat: s, dur});
}
function shop(z, type) {
  const open = G.businesses.filter(b => b.type === type && isOpenAt(type, G.hour) && b.door && b.queue.length < 5);
  if (!open.length) return newStroll(z);
  const b = nearPick(z, open); if ((z.wallet ?? 0) < PRICE[b.type] * .85) { say3(z, 'Too expensive today…'); z.missed = (z.missed || 0) + 1; return newStroll(z); }
  release(z); if (z.state === 'inside' && !show(z)) return;
  b.queue.push(z); z.qb = b; goTo(z, qspot(b, b.queue.length - 1), 'queue');
}
function nearPick(z, list) { const from = z.state === 'inside' ? (z.where.type === 'home' ? z.home : cellOf(z.pos)) : cellOf(z.pos); const w = list.map(b => 1 / (1 + (from ? Math.abs(from.i - b.cell.i) + Math.abs(from.j - b.cell.j) : 5) ** 1.5)); let r = z.R() * w.reduce((a, v) => a + v, 0); for (let i = 0; i < list.length; i++) if ((r -= w[i]) <= 0) return list[i]; return list.at(-1); }
function qspot(b, i) { if (nav.dirty || b.qxV !== b.qspots) { b.qx = []; b.qxV = b.qspots; navEnsure(); } if (b.qx[i]) return b.qx[i]; const l = b.qspots.at(-1) || b.door; let p = b.qspots[i] ? b.qspots[i].clone() : l.clone().addScaledVector(b.perp, -(i - b.qspots.length + 1) * .3); if (!navOK(p.x, p.z) || Math.abs(groundAt(p.x, p.z) - l.y) > .2) { const k = navNear(p.x, p.z, 6); if (k >= 0) p = nodeVec(k); } return b.qx[i] = p; }
function startStep(z, st) {
  const act = st.act;
  if (act === 'home') { if (z.state === 'inside' && z.where.type === 'home') return; release(z); if (z.state === 'inside' && !show(z)) return; const d = houseDoor(z.home); if (!d) { z.state = 'inside'; z.where = {type: 'home'}; return; } return goTo(z, d, 'enter', {type: 'home'}); }
  if (act === 'work') {
    const b = z.work; if (!b || !b.door || !G.businesses.includes(b)) return newStroll(z);
    release(z); if (z.state === 'inside' && !show(z)) return;
    if (z.role === 'keeper' && b.keeper) return goTo(z, b.keeper.pos, 'stand', {yaw: b.keeper.yaw});
    if (z.role === 'staff' && b.seats.length) return goTo(z, b.door, 'serve');
    return goTo(z, b.door, 'enter', {type: 'work', b});
  }
  if (act === 'away' || act === 'school') { release(z); if (z.state === 'inside' && z.where.type === 'away') return; if (z.state === 'inside' && !show(z)) return; const c = edgeCell(z); if (!c) { z.state = 'inside'; z.where = {type: 'away'}; return; } return goTo(z, new THREE.Vector3(wx(c.i), walkY(c), wx(c.j)), 'enter', {type: 'away'}); }
  if (act === 'party') { release(z); if (z.state === 'inside' && !show(z)) return; const pl = G.cells.filter(c => c.kind === 'plaza'), opts = pl.length && Math.random() < .7 ? pl : G.cells.filter(c => walkable(c) && !c.water); if (!opts.length) return; const c = nearPick(z, opts.map(cc => ({cell: cc}))).cell; return goTo(z, new THREE.Vector3(wx(c.i) + (Math.random() - .5) * 1.6, walkY(c), wx(c.j) + (Math.random() - .5) * 1.6), 'spot', {dance: true}); }
  if (act === 'deliver') { z.route = G.businesses.filter(b => b.door).sort((a, b) => a.cell.i - b.cell.i || a.cell.j - b.cell.j); return nextDelivery(z); }
  if (act === 'busk') { release(z); if (z.state === 'inside' && !show(z)) return; const open = G.businesses.filter(b => (b.type === 'cafe' || b.type === 'tasca') && isOpenAt(b.type, G.hour) && b.door); const b = open.sort((a, d) => d.seats.filter(s => s.by).length - a.seats.filter(s => s.by).length)[0]; if (!b) return newStroll(z); return goTo(z, b.door.clone().addScaledVector(b.perp, 1.05).add(new THREE.Vector3(Math.sin(b.yawOut) * .45, 0, Math.cos(b.yawOut) * .45)), 'spot', {busk: true, yaw: b.yawOut}); }
  if (act === 'paint') { release(z); if (z.state === 'inside' && !show(z)) return; const s = G.railSpots.length ? pick(Math.random, G.railSpots) : null; if (!s) return newStroll(z); return goTo(z, s.pos, 'spot', {paint: true, yaw: s.yaw}); }
  if (act === 'concert') { release(z); if (z.state === 'inside' && !show(z)) return; const c = G.stageCell; return goTo(z, new THREE.Vector3(wx(c.i) - .2 + (Math.random() - .5) * 1.2, walkY(c), wx(c.j) + (Math.random() - .5) * 1.4), 'spot', {dance: true}); }
  if (['cafe', 'tasca', 'winebar', 'cinema', 'shop', 'stroll'].includes(act)) return chooseActivity(z, act === 'shop' ? st.arg : act === 'stroll' ? null : act);
  return newStroll(z);
}
function nextDelivery(z) { release(z); if (z.state === 'inside' && !show(z)) return; const b = z.route?.shift(); if (!b) return newStroll(z); goTo(z, b.door.clone().addScaledVector(b.perp, .35), 'spot', {dur: .06, yaw: b.yawOut + Math.PI}); }
function afterActivity(z) { const a = z.step?.act; if (a === 'errand') { z.step = null; return; } if (a === 'deliver') return nextDelivery(z); if (a === 'party' || a === 'busk' || a === 'paint' || a === 'concert') return; if (a === 'home' || a === 'work' || a === 'away' || a === 'school') { z.step = null; return; } chooseActivity(z, null); }
function warmStart() {
  for (const z of G.citizens) {
    if (z.role === 'child' || z.role === 'baby') continue;
    const st = currentStep(z); z.step = st; z.state = 'inside';
    if (st.act === 'home') { z.where = {type: 'home'}; continue; }
    if (st.act === 'away' || st.act === 'school') { z.where = {type: 'away'}; continue; }
    if (st.act === 'work' && z.work?.door && !z.work.keeper && z.role === 'keeper') { z.where = {type: 'work', b: z.work}; continue; }
    const hd = houseDoor(z.home); if (hd) z.pos.copy(hd); const p = navRandomSpot(z, c => !c.water); if (!p) continue; z.pos.copy(p); z.state = 'idle'; z.until = 0;
    startStep(z, st);
  }
}
function cityRefresh() {
  // after any edit: re-home, drop stale seats/queues, replan current step
  computeMood();
  const homes = G.cells.filter(c => c.floors > 0 && frontFace(c) !== undefined);
  for (const z of G.citizens) {
    if (!z.home.floors || frontFace(z.home) === undefined) { if (!homes.length) continue; const old = z.home; z.home = pick(z.R, homes); old.res = (old.res || []).filter(o => o !== z); (z.home.res ||= []).push(z); }
    if (z.work && z.work !== 'away' && !G.businesses.includes(z.work)) { const nb = G.businesses.find(b => b.cell === z.work.cell); if (nb) z.work = nb; else { z.role = 'worker'; z.work = 'away'; z.plan = makePlan(z); z.apron = false; } }
    if (z.role === 'child') continue;
    if (z.seat || z.qb || z.state === 'go' || z.state === 'sit' || z.state === 'queue' || z.state === 'serve' || z.state === 'talk') { z.seat = null; z.qb = null; z.talk = null; if (z.state !== 'inside') z.state = 'idle'; z.step = null; }
    if (z.state === 'inside' && z.where.b && !G.businesses.includes(z.where.b)) { z.where = {type: 'away'}; }
  }
  G.businesses.forEach(b => b.queue = []);
  // people whose home is gone and no home exists leave town; empty new houses get newcomers
  const before = G.citizens.length;
  if (!homes.length) G.citizens = G.citizens.filter(z => z.home.floors > 0);
  const budget = BUDGET();
  for (const hh of homes) {
    if (G.citizens.length >= budget) break;
    if ((hh.res || []).length) continue;
    hh.res = []; const R = rng(hh.seed * 31 + G.citizens.length), n = 1 + Math.floor(R() * Math.min(hh.floors, 2));
    for (let k = 0; k < n && G.citizens.length < budget; k++) newResident(hh, R);
  }
  if (G.citizens.length !== before || !peopleParts) { G.citizens.forEach((z, i) => z.id = i); computeMood(); buildPeopleMeshes(); }
  if (G.follow && (G.follow.state === 'inside' || !G.citizens.includes(G.follow))) G.follow = null;
}
function say3(z, text) { z.bubble = {text, until: performance.now() + 2600}; }

/* ---- B&B: rooms, appeal, guests who check in and out ---- */
const GUEST_LAST = ['Smith', 'Müller', 'Dubois', 'Rossi', 'Jansen', 'Kowalski', 'Tanaka', 'García', 'Novak', 'Larsen', 'Okafor', 'Kim'];
const GUEST_M = ['Tom', 'Lukas', 'Pierre', 'Marco', 'Jan', 'Piotr', 'Kenji', 'Diego', 'Erik', 'Chidi'], GUEST_F = ['Emma', 'Lena', 'Claire', 'Giulia', 'Sanne', 'Anna', 'Yuki', 'Lucía', 'Ingrid', 'Ada'];
function bnbRooms(b) { return Math.max(2, ((b.cell.floors || 1) - 1) * 2); }
function bnbAppeal(b) {
  const c = b.cell; let a = .32;
  try { a += (plotValue(c).v - 1) * .6; } catch (e) { }
  const near = t => G.businesses.filter(o => o !== b && t.includes(o.type) && Math.abs(o.cell.i - c.i) + Math.abs(o.cell.j - c.j) <= 4).length;
  a += Math.min(.2, near(['cafe', 'bakery']) * .08) + Math.min(.2, near(['tasca', 'winebar', 'cinema']) * .08);
  if (G.cells.some(x => x.kind === 'church')) a += .05;
  a *= .6 + townJoy() * .7;
  return THREE.MathUtils.clamp(a, .08, .95);
}
function bnbGuests(b) { return G.citizens.filter(z => z.role === 'guest' && z.guestOf === b); }
function bnbInfo(b) {
  const g = bnbGuests(b), rooms = bnbRooms(b), ap = Math.round(bnbAppeal(b) * 100);
  return `<p><span>Rooms</span>${rooms} · ${g.length} guest${g.length === 1 ? '' : 's'} staying</p><p><span>Appeal</span>${ap}% · guests check in from 14:30 and leave by noon</p><p class="tip">More cafés, tascas and wine bars nearby, a nicer plot and a happier town fill more rooms. Taller houses have more rooms.</p>`;
}
let bnbDay = -1, bnbDirty = false;
function spawnGuest(b, R, arrAt) {
  const male = R() < .5, z = {id: G.citizens.length, male, name: `${pick(R, male ? GUEST_M : GUEST_F)} ${pick(R, GUEST_LAST)}`, home: b.cell, role: 'guest', work: null, ...sd(R), pos: new THREE.Vector3(), yaw: 0, state: 'inside', where: {type: 'away'}, wp: [], lane: (R() - .5) * .6, phase: R() * 6, vis: 0, talkCD: 0, carry: false};
  z.guestOf = b; z.arrive = G.day; z.arrAt = arrAt; z.nights = 1 + (R() < .35 ? 1 : 0) + (R() < .1 ? 1 : 0);
  z.age = 22 + Math.floor(z.R() * 45); z.chatty = z.R() < .6; z.dog = null; z.fav = null; z.wallet = 220 + z.R() * 260;
  makeLook(z, z.R); z.plan = makePlan(z); z.step = null; G.citizens.push(z);
  for (let n = 0; n < z.nights; n++) pay(z, b);
  return z;
}
function bnbTick() {
  const bnbs = G.businesses.filter(b => b.type === 'bnb' && b.door);
  // check-outs and guests of closed B&Bs
  const gone = G.citizens.filter(z => z.role === 'guest' && ((z.leaving && z.state === 'inside' && z.where?.type === 'away' && z.step?.act === 'away') || !G.businesses.includes(z.guestOf) && z.state === 'inside'));
  if (gone.length) { gone.forEach(removeCitizen); bnbDirty = true; }
  G.citizens.forEach(z => { if (z.role === 'guest' && !G.businesses.includes(z.guestOf) && !z.leaving) { z.leaving = true; z.arrive = -1; z.plan = makePlan(z); z.step = null; } });
  if (G.hour >= 14.5 && G.hour < 20 && bnbDay !== G.day) {
    bnbDay = G.day; const R = rng(G.day * 977 + 13);
    for (const b of bnbs) {
      const free = bnbRooms(b) - bnbGuests(b).length; if (free <= 0) continue;
      const n = Math.min(free, Math.round(bnbRooms(b) * bnbAppeal(b) * (.7 + R() * .6)));
      for (let k = 0; k < n; k++) spawnGuest(b, R, Math.min(19.5, G.hour + .3 + k * .45 + R() * .5));
      if (n) { bnbDirty = true; if (b.cell.obj && camera.position.distanceTo(b.door) < 30) say3(G.citizens.at(-1), 'Olá! We booked a room…'); }
    }
  }
  if (bnbDirty) { bnbDirty = false; G.citizens.forEach((z, i) => z.id = i); computeMood(); buildPeopleMeshes(); }
}
window.__bnb = () => G.businesses.filter(b => b.type === 'bnb').map(b => b.name + ': rooms ' + bnbRooms(b) + ' appeal ' + bnbAppeal(b).toFixed(2) + ' guests ' + bnbGuests(b).length + ' [' + bnbGuests(b).map(z => z.state[0] + (z.leaving ? 'L' : '')).join('') + '] sales ' + b.sales).join(' | ') + ' · citizens ' + G.citizens.length;

function simTick() {
  const t = now();
  bnbTick(); try { if (!VISIT) { if (OWN._mark) { ownMarkExisting(); delete OWN._mark; } ownTick(); } } catch (e) { console.warn(e); }
  for (const z of G.citizens) {
    if (z.role === 'child' || z.role === 'baby') continue;
    needsTick(z);
    const st = currentStep(z);
    if (st !== z.step) { z.step = st; startStep(z, st); continue; }
    if (z.state === 'inside' && z.where?.type === 'home' && G.hour > 8 && G.hour < 19.5 && t > (z.errCD || 0) && Math.min(z.nd.food, z.nd.coffee) < .2) { z.errCD = t + 2.5; const o = shopOptions(z, null).filter(o => (SAT[o.b.type].food || 0) + (SAT[o.b.type].coffee || 0) > .3)[0]; if (o) { z.step = {act: 'errand', at: G.hour}; goBusiness(z, o.b); continue; } }
    if (z.state === 'sit' && t >= z.until) afterActivity(z);
    else if (z.state === 'idle' && z.until && t >= z.until) afterActivity(z);
    else if (z.state === 'inside' && z.where.type === 'cafeIn' && t >= z.until) { show(z); afterActivity(z); }
    else if (z.state === 'talk' && t >= z.until) { const r = z.talk; z.talk = null; if (r && r.wp.length) { z.state = 'go'; z.wp = r.wp; z.goal = r.goal; } else afterActivity(z); }
    else if (z.state === 'queue' && z.qb) {
      const b = z.qb;
      if (!isOpenAt(b.type, G.hour)) { leaveQueue(z); afterActivity(z); }
      else if (b.queue[0] === z && z.pos.distanceTo(qspot(b, 0)) < .1) {
        if (z.serveEnd == null) { z.serveEnd = t + .08 + z.R() * .08; if (z.R() < .5) say3(z, b.type === 'bakery' ? 'Duas natas, por favor' : b.type === 'barber' ? 'Só aparar, obrigado' : 'Quanto custa?'); }
        else if (t >= z.serveEnd) { leaveQueue(z); pay(z, b); b.visits++; (b.who ||= new Map()).set(z, (b.who.get(z) || 0) + 1); z.carry = b.type !== 'barber' ? b.type : false; afterActivity(z); }
      }
    } else if (z.state === 'serve' && !isOpenAt(z.work.type, G.hour) && z.step?.act === 'work') { goTo(z, z.work.door, 'enter', {type: 'work', b: z.work}); }
  }
  // chats
  const vis = G.citizens.filter(z => z.role !== 'child' && (z.state === 'go' || z.state === 'idle') && z.chatty && z.talkCD < t && z.step && (z.step.act === 'stroll' || z.step.act === 'dog' || z.state === 'idle'));
  for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++) {
    const A = vis[a], B = vis[b]; if (A.talk || B.talk || A.state === 'talk' || B.state === 'talk') continue;
    if (A.pos.distanceToSquared(B.pos) > .5) continue;
    const dur = .08 + A.R() * .1;
    for (const [P, Q] of [[A, B], [B, A]]) { P.talk = {wp: P.wp, goal: P.goal, with: Q}; P.state = 'talk'; P.until = t + dur; P.talkCD = t + 1.5; P.yaw = Math.atan2(Q.pos.x - P.pos.x, Q.pos.z - P.pos.z); }
    say3(A, ownGreet(A)); setTimeout(() => say3(B, ownGreet(B)), 900);
  }
  // occupancy → lit windows
  for (const c of G.cells) {
    if (!c.floors || !c.litU) continue;
    const res = c.res || [];
    c.occ = res.length ? res.filter(z => (z.state === 'inside' && z.where.type === 'home') || (z.role === 'child' && z.parent?.state === 'inside' && z.parent.where.type === 'home')).length / res.length : .55;
    c.litU.uOcc.value = c.occ; c.litU.uOpen.value = c.bizObj ? c.bizObj.open : 0;
  }
  const occA = glowGeo.attributes.occ;
  if (occA) for (let i = 0; i < glowRefs.length; i++) { const [c, thr] = glowRefs[i]; occA.array[i] = thr < 0 ? (c.bizObj?.open || 0) : c.floors ? (((thr * 7.31) % 1) <= (c.occ ?? 1) + .02 ? 1 : 0) : 1; }
  if (occA) occA.needsUpdate = true; syncRefl();
  if ((simTick.n = (simTick.n || 0) + 1) % 10 === 0) updateEco();
  // grumbles
  if (Math.random() < .02) { const u = G.citizens.filter(z => !z.food && z.state === 'go'); if (u.length) say3(pick(Math.random, u), pick(Math.random, GRUMBLE)); }
}

/* movement + business animation, per frame */
const _d = new THREE.Vector3();
function updateCity(dt) {
  const gdt = dt * G.speed;
  const ph = Math.floor(G.hour); G.hour += gdt / 30; if (Math.floor(G.hour) !== ph && G.speed > 0) { const hh = Math.floor(G.hour) % 24; if (hh >= 8 && hh <= 21) bell(G.speed > 1 ? 1 : (hh % 12 || 12)); if (hh === 7) { if (G.requests.length < 3) makeRequest(); if (G.paper.length && G.paper.at(-1).day === G.day - 1) toast('The morning paper is out (tap Paper)'); } checkRequests(); checkUnlocks(); metaHour(); G.autosave(); }
  if (G.hour >= 24) { G.hour -= 24; G.day++; runDay(); metaDay(); G.citizens.forEach(z => { if (z.notable !== 'Painter') z.plan = makePlan(z); z.step = null; }); }
  G.simAcc += dt; if (G.simAcc > .2) { G.simAcc = 0; simTick(); }
  for (const b of G.businesses) {
    const target = isOpenAt(b.type, G.hour) ? 1 : 0; if (b.lastT !== undefined && b.lastT !== target && b.door) shutterSound(b.door); b.lastT = target; b.open += (target - b.open) * Math.min(1, dt * 1.2);
    if (b.grille) b.grille.scale.y = Math.max(.001, 1 - b.open);
    if (b.spill) { b.spill.visible = b.open > .05; b.spill.scale.setScalar(.6 + .4 * b.open); }
  }
  const sp = .55 * G.speed;
  for (const z of G.citizens) {
    z.moving = false;
    if (z.role === 'child') continue;
    if (z.state === 'go' && z.wp.length) {
      const tg = z.wp[0]; _d.set(tg.x - z.pos.x, 0, tg.z - z.pos.z); const dist = _d.length(), step = sp * (z.lean ? .7 : 1) * dt;
      if (dist <= step + .001) { z.pos.x = tg.x; z.pos.z = tg.z; z.wp.shift(); z.stuck = 0; if (!z.wp.length) { z.pos.y = groundAt(z.pos.x, z.pos.z); arrive(z); } }
      else { const ox = z.pos.x, oz = z.pos.z; z.pos.addScaledVector(_d, step / dist); z.yaw = Math.atan2(_d.x, _d.z); z.moving = G.speed > 0; z._lastD = z._lastD ?? dist; if (dist > z._lastD - step * .3) z.stuck = (z.stuck || 0) + dt; else z.stuck = 0; z._lastD = dist; if (z.stuck > 2.5 && z.goal) { z.stuck = 0; z._lastD = null; const g = z.goal; goTo(z, g.pt, g.kind, g.data); } }
      z.pos.y = groundAt(z.pos.x, z.pos.z);
    } else if (z.state === 'queue' && z.qb) {
      const tg = qspot(z.qb, Math.max(0, z.qb.queue.indexOf(z))); _d.set(tg.x - z.pos.x, 0, tg.z - z.pos.z); const dist = _d.length();
      if (dist > .04) { const step = Math.min(dist, sp * .6 * dt); z.pos.addScaledVector(_d, step / dist); z.pos.y = groundAt(z.pos.x, z.pos.z); z.yaw = Math.atan2(_d.x, _d.z); z.moving = G.speed > 0; }
      else z.yaw += (Math.atan2(z.qb.door.x - z.pos.x, z.qb.door.z - z.pos.z) - z.yaw) * .1;
    } else if (z.state === 'serve') {
      const b = z.work; z.serveT -= dt * G.speed;
      if (!z.serveTo || z.serveT <= 0) { const occ = b.seats.filter(s => s.by && s.by.state === 'sit'); z.serveTo = occ.length && Math.random() < .6 ? pick(Math.random, occ).pos.clone().addScaledVector(b.perp, .18) : b.door.clone(); z.serveT = 3 + Math.random() * 4; }
      _d.set(z.serveTo.x - z.pos.x, 0, z.serveTo.z - z.pos.z); const dist = _d.length();
      if (dist > .05) { const step = Math.min(dist, sp * dt); z.pos.addScaledVector(_d, step / dist); z.yaw = Math.atan2(_d.x, _d.z); z.moving = G.speed > 0; }
      z.pos.y = b.door.y;
    }
    if (z.moving) z.phase += dt * G.speed * 9;
  }
  for (const z of G.citizens) if (z.role === 'child') {
    const p = z.parent; z.state = p && p.state !== 'inside' ? 'follow' : 'inside';
    if (z.state === 'follow') { const side = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(.24); let tg = p.pos.clone().add(side); if (!navOK(tg.x, tg.z) || Math.abs(groundAt(tg.x, tg.z) - p.pos.y) > .2) tg = p.pos.clone().addScaledVector(side, -.4).add(new THREE.Vector3(-Math.sin(p.yaw) * .2, 0, -Math.cos(p.yaw) * .2)); if (z.pos.distanceTo(p.pos) > 2) z.pos.copy(p.pos); z.pos.lerp(tg, Math.min(1, dt * 6)); z.pos.y = groundAt(z.pos.x, z.pos.z); z.yaw = p.yaw; z.moving = p.moving; if (z.moving) z.phase += dt * G.speed * 12; }
  }
  if (G.speed > 0) separate(dt);
  for (const z of G.citizens) if (z.dog) {
    const show_ = z.state !== 'inside' && z.step?.act === 'dog'; z.dog.on = show_;
    if (show_) { let tg = z.pos.clone().add(new THREE.Vector3(Math.sin(z.yaw + 2.6) * .4, 0, Math.cos(z.yaw + 2.6) * .4)); if (!navOK(tg.x, tg.z) || Math.abs(groundAt(tg.x, tg.z) - z.pos.y) > .2) tg = z.pos.clone().add(new THREE.Vector3(-Math.sin(z.yaw) * .3, 0, -Math.cos(z.yaw) * .3)); const dd = tg.clone().sub(z.dog.pos); dd.y = 0; if (dd.length() > 2) z.dog.pos.copy(tg); else { z.dog.pos.lerp(tg, Math.min(1, dt * 3)); if (dd.length() > .05) z.dog.yaw = Math.atan2(dd.x, dd.z); } z.dog.pos.y = groundAt(z.dog.pos.x, z.dog.pos.z); }
  }
}

export {ACT, FIRST_F, FIRST_M, GREET, LAST, MAXWALK, bnbInfo, cellOf, cityRefresh, computeMood, groundAt, houseDoor, makeLook, makePlan, nav, navDist, navPath, navPropBox, needs, release, satisfy, say3, sd, spawnCitizens, warmStart};
