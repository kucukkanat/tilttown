import '../game/identity.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {FH, LV, N, S, box, cyl, jit, mul, paint, pick, rng, setAttr, tr} from '../core/util.js';
import {DIRS, cellAt, litMat, mkMesh, objG, plainMat, swayMat, terrainG, topY, wx} from '../core/scene.js';
import {laundryG} from './houses.js';
import {frontFace, propAt} from './streets.js';
import {bizSpillG} from '../game/identity.js';
import {navPropBox} from '../people/sim.js';
import {hookMap, shopThreshold} from './shops.js';
import {shopUpgradeDecor} from '../game/progression.js';

/* ==========================================================================
   ORGANIC TOWN: irregular plot grid (baked warp), terraced joins, archways,
   yard spots, ivy on drops, broken island edge
   ========================================================================== */
const LAT = {key: null, off: null}, WARP_AMT = .21;
function latEnsure() {
  const key = G.cells.length ? G.cells[0].seed + ':' + G.cells[N + 1].seed : null; if (LAT.key === key) return;
  LAT.key = key; const M = N + 1, R = rng(((G.cells.length ? G.cells[0].seed : 1) | 0) + 777); LAT.off = new Float32Array(M * M * 2);
  for (let a = 1; a < N; a++) for (let b = 1; b < N; b++) { const k = (a * M + b) * 2; LAT.off[k] = (R() - .5) * 2 * S * WARP_AMT; LAT.off[k + 1] = (R() - .5) * 2 * S * WARP_AMT; }
}
const _wd = {x: 0, y: 0};
function warpD(x, z, out = _wd) {
  latEnsure(); const half = N * S / 2, u = (x + half) / S, v = (z + half) / S;
  if (!LAT.off || u <= 0 || v <= 0 || u >= N || v >= N) { out.x = 0; out.y = 0; return out; }
  const a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b, M = N + 1, O = LAT.off;
  const k00 = (a * M + b) * 2, k10 = ((a + 1) * M + b) * 2, k01 = (a * M + b + 1) * 2, k11 = ((a + 1) * M + b + 1) * 2;
  out.x = (O[k00] * (1 - fu) + O[k10] * fu) * (1 - fv) + (O[k01] * (1 - fu) + O[k11] * fu) * fv;
  out.y = (O[k00 + 1] * (1 - fu) + O[k10 + 1] * fu) * (1 - fv) + (O[k01 + 1] * (1 - fu) + O[k11 + 1] * fu) * fv;
  return out;
}
function warpV(v) { const d = warpD(v.x, v.z); v.x += d.x; v.z += d.y; return v; }
const _wv = new THREE.Vector3(), _wi = new THREE.Matrix4();
function warpObject(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!(o.isMesh || o.isLine || o.isPoints) || o.isInstancedMesh || !o.geometry || o.userData.noWarp) return;
    const g = o.geometry.userData.warped ? o.geometry : o.geometry.clone(); if (g.userData.warped) return;
    const p = g.attributes.position; if (!p) return; _wi.copy(o.matrixWorld).invert();
    for (let i = 0; i < p.count; i++) { _wv.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); warpV(_wv); _wv.applyMatrix4(_wi); p.setXYZ(i, _wv.x, _wv.y, _wv.z); }
    p.needsUpdate = true; g.userData.warped = true; g.computeBoundingSphere(); g.computeBoundingBox(); o.geometry = g;
  });
}
[terrainG, objG, laundryG, bizSpillG].forEach(grp => { const add = grp.add.bind(grp); grp.add = (...objs) => { objs.forEach(warpObject); return add(...objs); }; });

/* ---- terraced joins between neighbouring houses + archways over alleys ---- */
function buildJoins(plain, body, roof) {
  const done = new Set();
  for (const c of G.cells) {
    if (!(c.floors > 0)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const n = cellAt(c.i + dx, c.j + dz); if (!n || !(n.floors > 0)) continue;
      const R = rng(c.seed * 13 + n.seed), y0 = Math.min(topY(c), topY(n)), y1 = Math.min(topY(c) + c.floors * FH, topY(n) + n.floors * FH) - .06;
      if (y1 - y0 < .4) continue;
      const cx = (wx(c.i) + wx(n.i)) / 2, cz = (wx(c.j) + wx(n.j)) / 2, along = dx ? 'z' : 'x';
      const w = .74, d = 1.15 + R() * .25, h = y1 - y0, col = jit(pick(R, ['#d9b48a', '#c98a6a', '#e3cfa6', '#b8a58c', '#d7a07a']), R, .06);
      const m = tr(cx + (along === 'x' ? (R() - .5) * .2 : 0), y0 + h / 2, cz + (along === 'z' ? (R() - .5) * .2 : 0));
      body.push(along === 'z' ? box(w, h, d, col, m) : box(d, h, w, col, m));
      const rm = tr(cx, y1 + .07, cz, along === 'z' ? Math.PI / 2 : 0);
      roof.push(box(d + .08, .14, w + .1, jit('#a8452e', R, .08), rm));
      if (h > FH * 1.4 && R() < .55) { const wy = y0 + FH * (1.4 + Math.floor(R() * Math.max(1, h / FH - 1.6))); const off = (along === 'z' ? [w / 2 + .01, 0] : [0, w / 2 + .01]);
        for (const s of [1, -1]) plain.push(box(along === 'z' ? .02 : .26, .38, along === 'z' ? .26 : .02, '#2a2a3a', tr(cx + off[0] * s, wy, cz + off[1] * s))); }
    }
  }
  // archways: a one-tile walkway between two tall houses on opposite sides
  for (const c of G.cells) {
    if (c.floors > 0 || c.water || c.kind) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const a = cellAt(c.i - dx, c.j - dz), b = cellAt(c.i + dx, c.j + dz); if (!a || !b || a.floors < 3 || b.floors < 3) continue;
      const key = c.i * N + c.j + ':' + dx; if (done.has(key)) continue; done.add(key);
      const R = rng(c.seed * 7 + 3), base = Math.max(topY(a), topY(b), topY(c)) + FH * 1.7, h = FH * .95, col = jit(pick(R, ['#d9b48a', '#e3cfa6', '#c98a6a']), R, .05);
      const span = S + .5, x = wx(c.i), z = wx(c.j), along = dx ? 'x' : 'z';
      body.push(along === 'x' ? box(span, h, .9, col, tr(x, base + h / 2, z)) : box(.9, h, span, col, tr(x, base + h / 2, z)));
      roof.push(along === 'x' ? box(span + .1, .12, 1.0, jit('#a8452e', R, .08), tr(x, base + h + .06, z)) : box(1.0, .12, span + .1, jit('#a8452e', R, .08), tr(x, base + h + .06, z)));
      const arch = paint(new THREE.TorusGeometry(.62, .07, 6, 14, Math.PI), '#8a7a66');
      for (const s of [1, -1]) { const g = arch.clone(); g.applyMatrix4(mul(tr(x + (along === 'z' ? s * .46 : 0), base, z + (along === 'x' ? s * .46 : 0), along === 'x' ? 0 : Math.PI / 2), new THREE.Matrix4().makeRotationZ(Math.PI))); plain.push(g); }
      for (const s of [1, -1]) plain.push(box(.34, .28, .04, '#2a2a3a', tr(x + (along === 'z' ? s * .47 : (R() - .5) * .6), base + h * .55, z + (along === 'x' ? s * .47 : (R() - .5) * .6))));
    }
  }
}

/* ---- yard spots: small trees, lamps and pots beside a house ---- */
function yardSpots(c) {
  const k = frontFace(c), f = k === undefined ? [0, 1] : DIRS[k], back = [-f[0], -f[1]], side = [f[1], -f[0]];
  return [[back[0] * .74 + side[0] * .64, back[1] * .74 + side[1] * .64], [back[0] * .74 - side[0] * .64, back[1] * .74 - side[1] * .64]];
}
function buildYard(c) {
  const sway = [], plain = [], glows = [], R = rng(c.seed * 17 + 1), spots = yardSpots(c), items = [...(c.yard || [])];
  if (!items.length && R() < .45) items.push('pots');
  items.slice(0, 2).forEach((it, n) => {
    const [x, z] = spots[n];
    if (it === 'tree') {
      plain.push(cyl(.035, .06, .7, '#5a4232', tr(x, .35, z), 6));
      const base = pick(R, ['#d9772b', '#c4502b', '#e0a23a', '#6f8a3a', '#a8432b']);
      for (let q = 0; q < 4; q++) sway.push(paint(new THREE.IcosahedronGeometry(.2 + R() * .1, 1), jit(base, R, .08)).applyMatrix4(tr(x + (R() - .5) * .3, .85 + R() * .3, z + (R() - .5) * .3)));
    } else if (it === 'lamp') {
      plain.push(cyl(.025, .035, 1.1, '#2a2622', tr(x, .55, z), 6)); plain.push(box(.14, .16, .14, '#2a2622', tr(x, 1.15, z)));
      const g = new THREE.Vector3(x, 1.12, z); g.thr = .25; glows.push(g);
    } else {
      for (let q = 0; q < 3; q++) { const px = x + (R() - .5) * .35, pz = z + (R() - .5) * .35; plain.push(cyl(.08, .06, .14, pick(R, ['#a0583a', '#b8683a', '#8a5a3a']), tr(px, .07, pz), 7)); sway.push(paint(new THREE.IcosahedronGeometry(.11 + R() * .05, 0), jit(pick(R, ['#4f6a32', '#6a7a3a', '#c4502b', '#e0a23a']), R, .08)).applyMatrix4(tr(px, .22, pz))); }
    }
  });
  sway.forEach(g => { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = Math.max(0, p.getY(i) - .3) * .05; g.setAttribute('sway', new THREE.BufferAttribute(a, 1)); });
  return {sway, plain, glows};
}

/* ---- ivy on level drops and a broken, planted island edge ---- */
function terrainDressing(c) {
  if (c.water || c.owned === false) return null;
  const R = rng(c.seed * 23 + 5), sway = [], plain = [], y = c.lvl * LV;
  DIRS.forEach(([dx, dz]) => {
    const n = cellAt(c.i + dx, c.j + dz), drop = !n ? 0 : n.water ? 0 : c.lvl - n.lvl, edge = !n;
    if (drop > 0 && R() < .75) {
      const cnt = 6 + Math.floor(R() * 8), along = [dz, dx];
      for (let q = 0; q < cnt; q++) { const t = (R() - .5) * 1.8, hang = R() * Math.min(drop * LV, 1.1);
        const g = paint(new THREE.IcosahedronGeometry(.08 + R() * .07, 0), jit(pick(R, R() < .25 ? ['#a8432b', '#c4602b'] : ['#4f6a32', '#5f7a3a', '#3f5a2a']), R, .1));
        g.applyMatrix4(tr(dx * (S / 2 + .03) + along[0] * t, y - hang, dz * (S / 2 + .03) + along[1] * t)); sway.push(g); }
    }
    if (edge && R() < .8) {
      const along = [dz, dx];
      for (let q = 0; q < 3; q++) { const t = (R() - .5) * 1.6, s = .14 + R() * .2;
        plain.push(paint(new THREE.DodecahedronGeometry(s, 0), jit(pick(R, ['#9a8a78', '#8a7a6a', '#a89a88']), R, .06)).applyMatrix4(tr(dx * (S / 2 - .1) + along[0] * t, y + s * .4, dz * (S / 2 - .1) + along[1] * t)));
        if (R() < .7) sway.push(paint(new THREE.IcosahedronGeometry(.12 + R() * .1, 0), jit(pick(R, ['#5f7a3a', '#6a7a3a', '#c4502b']), R, .08)).applyMatrix4(tr(dx * (S / 2 - .25) + along[0] * (t + .2), y + .12, dz * (S / 2 - .25) + along[1] * (t + .2)))); }
    }
  });
  sway.forEach(g => { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = .02; g.setAttribute('sway', new THREE.BufferAttribute(a, 1)); });
  if (!sway.length && !plain.length) return null;
  const grp = new THREE.Group(); if (sway.length) grp.add(mkMesh(sway, swayMat, false)); if (plain.length) grp.add(mkMesh(plain, plainMat, true));
  return grp;
}

G.publicSeats = []; G.railSpots = [];
function seatAt(pm, x, z, faceX, faceZ) { const p = new THREE.Vector3(x, 0, z).applyMatrix4(pm), f = new THREE.Vector3(faceX, 0, faceZ).applyMatrix4(pm); return {pos: p, yaw: Math.atan2(f.x - p.x, f.z - p.z), by: null}; }
function bizSpill(b) {
  const L = b.street, R = rng(b.cell.seed * 7 + 11), g = [], lit = [];
  const [dx, dz] = DIRS[b.face], tx = -dx, tz = -dz, y = L.lvl * LV, cx = wx(L.i), cz = wx(L.j);
  const pm = tr(cx + tx * .5, y, cz + tz * .5, Math.atan2(-tx, -tz));
  const W = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(pm);
  b.door = new THREE.Vector3(cx + tx * .9, y, cz + tz * .9); b.yawOut = Math.atan2(-tx, -tz);
  b.seats = []; b.qspots = []; b.keeper = null; b.perp = new THREE.Vector3(-tz, 0, tx);
  const P = (geo) => g.push(geo), M = (x, yy, z, ry = 0, rx = 0, rz = 0) => mul(pm, tr(x, yy, z, ry, rx, rz)), gOpen = [], gClosed = [];
  const stand = (cols, item) => {
    for (const x of [-.42, .42]) for (const z of [-.32, .02]) P(box(.04, .38, .04, '#3a2a20', M(x, .19, z)));
    for (let q = 0; q < 3; q++) { const x = (q - 1) * .3; P(box(.28, .08, .3, '#8a6a42', M(x, .42, -.15, 0, .25))); for (let k = 0; k < 7; k++) item(M(x + (R() - .5) * .2, .49, -.15 + (R() - .5) * .2, R() * 3), pick(R, cols)); }
    b.keeper = {pos: W(0, -.5), yaw: b.yawOut};
    for (let i = 0; i < 4; i++) b.qspots.push(W(.1 - i * .3, .42));
  };
  switch (b.type) {
    case 'cafe':
      for (const x of [-.45, .45]) { propAt(gOpen, R, M(x, 0, .22), 'cafe'); b.seats.push(seatAt(pm, x - .3, .22, x, .22), seatAt(pm, x + .3, .22, x, .22));
        gClosed.push(cyl(.18, .18, .03, '#ece4d4', M(x, .4, .22), 12), cyl(.02, .02, .4, '#2a2622', M(x, .2, .22), 5), cyl(.015, .015, .95, '#ddd', M(x, .47, .22), 4), cyl(.035, .02, .4, '#c8b8a0', M(x, .75, .22), 6));
        for (const s of [-1, 1]) { const m = (a, yy, zz, rx = 0) => M(x + s * .07 + a, .58 + yy, .22 + zz, s * .4, rx + Math.PI); gClosed.push(box(.16, .03, .16, '#2a2622', m(0, -.15, 0)), box(.16, .2, .02, '#2a2622', m(0, -.05, .07)), box(.02, .24, .02, '#2a2622', m(-.06, -.01, -.06)), box(.02, .24, .02, '#2a2622', m(.06, -.01, -.06))); } }
      P(box(.04, .4, .26, '#2a2622', M(.82, .2, -.3, .3))); P(box(.03, .32, .22, '#1e2a24', M(.8, .22, -.3, .3)));
      break;
    case 'tasca':
      P(box(1.2, .04, .36, '#6a4a30', M(0, .4, .25))); for (const x of [-.5, .5]) for (const z of [.12, .38]) P(box(.04, .4, .04, '#3a2a20', M(x, .2, z)));
      for (const z of [-.02, .52]) { P(box(1.2, .04, .14, '#5a3a28', M(0, .24, z))); for (const x of [-.4, 0, .4]) b.seats.push(seatAt(pm, x, z, x, .25)); }
      for (const x of [-.78, .78]) P(box(.04, 1.35, .04, '#2a2622', M(x, .67, .6)));
      P(box(1.56, .015, .015, '#2a2622', M(0, 1.3, .6)));
      for (let q = 0; q < 9; q++) lit.push(setAttr(box(.05, .06, .05, '#fff', M(-.7 + q * .175, 1.25 - Math.sin(q / 8 * Math.PI) * .1, .6)), 'lthr', .22));
      for (let q = 0; q < 4; q++) P(cyl(.025, .025, .12, '#2f5a3a', M(-.45 + q * .3, .48, .25), 6));
      break;
    case 'bakery':
      P(box(.02, .5, .32, '#1e2a24', M(.7, .25, -.15, .4, 0, .2))); P(box(.02, .5, .32, '#1e2a24', M(.78, .25, -.15, .4, 0, -.2)));
      for (let q = 0; q < 3; q++) P(paint(new THREE.SphereGeometry(.13, 7, 5), '#d8ccb0').applyMatrix4(mul(M(-.65 + q * .12, .1, -.32 + (q % 2) * .1), new THREE.Matrix4().makeScale(1, .8, .8))));
      for (let i = 0; i < 5; i++) b.qspots.push(W(.15 - i * .3, -.05));
      break;
    case 'grocer': stand(['#d9472b', '#e8a23a', '#7aa33a', '#e8d84a', '#8a3a6a'], (m, c) => P(paint(new THREE.IcosahedronGeometry(.045, 0), c).applyMatrix4(m))); break;
    case 'fish': stand(['#8a9aa8', '#a8b4bc', '#6a7a88'], (m, c) => { P(box(.16, .03, .06, c, m)); }); for (let q = 0; q < 3; q++) P(box(.27, .02, .29, '#f0f4f8', M((q - 1) * .3, .465, -.15, 0, .25))); break;
    case 'florist': {
      for (let q = 0; q < 5; q++) { const x = -.6 + q * .3, z = -.25 + (q % 2) * .12; P(cyl(.08, .07, .18, '#5a6a72', M(x, .09, z), 8)); const fc = pick(R, ['#d94f3d', '#e8c34a', '#f2a1b1', '#f4f0f0', '#9a5ac8']); for (let k = 0; k < 6; k++) P(box(.05, .05, .05, fc, M(x + (R() - .5) * .12, .24 + R() * .1, z + (R() - .5) * .12))); P(paint(new THREE.IcosahedronGeometry(.08, 0), '#4f6a2f').applyMatrix4(M(x, .2, z))); }
      b.keeper = {pos: W(.75, -.4), yaw: b.yawOut}; for (let i = 0; i < 3; i++) b.qspots.push(W(.5 - i * .3, .3));
      break;
    }
    case 'books': {
      P(box(.6, .06, .34, '#6a4a30', M(-.25, .4, -.15))); for (const x of [-.5, 0]) for (const z of [-.3, 0]) P(box(.03, .4, .03, '#3a2a20', M(x, .2, z)));
      P(paint(new THREE.TorusGeometry(.1, .015, 4, 12), '#2a2622').applyMatrix4(M(-.58, .1, -.15, Math.PI / 2)));
      for (let k = 0; k < 9; k++) P(box(.06 + R() * .04, .04, .12, pick(R, ['#8a3a2a', '#2f5f6f', '#c9a33f', '#3f6a3f', '#e8dcc0', '#4a3a6a']), M(-.48 + (k % 5) * .11, .45 + Math.floor(k / 5) * .04, -.15 + (R() - .5) * .1, (R() - .5) * .4)));
      for (let i = 0; i < 3; i++) b.qspots.push(W(.4 - i * .3, -.05));
      break;
    }
    case 'barber': {
      for (let q = 0; q < 6; q++) P(cyl(.04, .04, .1, q % 2 ? '#f4f4f4' : (q % 4 ? '#2f5f8f' : '#b8342a'), M(.72, .3 + q * .1, -.38), 8));
      P(paint(new THREE.SphereGeometry(.045, 8, 5), '#e8e0d0').applyMatrix4(M(.72, .92, -.38)));
      P(box(.5, .04, .16, '#6a4a30', M(-.4, .22, -.25))); for (const x of [-.6, -.2]) P(box(.03, .22, .14, '#2a2622', M(x, .11, -.25)));
      b.seats.push(seatAt(pm, -.5, -.25, -.5, .5), seatAt(pm, -.3, -.25, -.3, .5));
      for (let i = 0; i < 3; i++) b.qspots.push(W(.3 - i * .3, .05));
      break;
    }
    case 'pharmacy': {
      P(box(.04, .3, .3, '#f4f4f4', M(.72, 1.05, -.38))); P(box(.045, .22, .07, '#2f9a5a', M(.72, 1.05, -.38))); P(box(.045, .07, .22, '#2f9a5a', M(.72, 1.05, -.38))); P(box(.03, .03, .3, '#2a2622', M(.72, 1.25, -.5)));
      P(box(.5, .04, .16, '#6a4a30', M(-.45, .22, -.28))); for (const x of [-.65, -.25]) P(box(.03, .22, .14, '#2a2622', M(x, .11, -.28)));
      for (let i = 0; i < 4; i++) b.qspots.push(W(.3 - i * .3, 0)); break;
    }
    case 'winebar': {
      for (const x of [-.45, .45]) { P(cyl(.16, .16, .42, '#6a3a20', M(x, .21, .22), 10)); P(cyl(.165, .165, .03, '#2a2622', M(x, .1, .22), 10)); P(cyl(.165, .165, .03, '#2a2622', M(x, .33, .22), 10)); P(cyl(.02, .015, .1, '#2f5a3a', M(x + .05, .47, .22), 6)); for (const s of [-.3, .3]) { P(cyl(.08, .08, .03, '#3a2418', M(x + s, .3, .22), 8)); P(cyl(.015, .015, .3, '#2a2622', M(x + s, .15, .22), 4)); b.seats.push(seatAt(pm, x + s, .22, x, .22)); } }
      for (let q = 0; q < 7; q++) lit.push(setAttr(box(.05, .06, .05, '#fff', M(-.7 + q * .23, 1.3, .55)), 'lthr', .2)); P(box(1.6, .012, .012, '#2a2622', M(0, 1.34, .55)));
      break;
    }
    case 'cinema': {
      P(box(1.4, .28, .08, '#1a1a24', M(0, 1.15, -.42))); for (let q = 0; q < 12; q++) lit.push(setAttr(box(.05, .05, .03, '#fff', M(-.66 + q * .12, 1.31, -.38)), 'lthr', -.5));
      for (const x of [-.6, .6]) { P(box(.32, .46, .04, '#2a2622', M(x, .45, -.3))); P(box(.26, .38, .02, pick(R, ['#b8342a', '#2f5ea8', '#c9a33f', '#3f6a3f']), M(x, .45, -.27))); }
      for (let i = 0; i < 5; i++) b.qspots.push(W(.2 - i * .28, .05)); break;
    }
  }
  shopUpgradeDecor(b, M, P, R); shopThreshold(b, M, P, R);
  const grp = new THREE.Group();
  if (g.length) grp.add(mkMesh(g, plainMat, true));
  b.furnOpen = b.furnClosed = null; if (gOpen.length) { b.furnOpen = mkMesh(gOpen, plainMat, true); b.furnClosed = mkMesh(gClosed, plainMat, true); grp.add(b.furnOpen, b.furnClosed); }
  if (lit.length) grp.add(mkMesh(lit, litMat, false));
  for (const geo of g) navPropBox([geo], .03, .12, y + .3);
  grp.userData.biz = b; b.spill = grp; bizSpillG.add(grp); hookMap(grp, b.cell);
}

export {bizSpill, buildJoins, buildYard, terrainDressing, warpD, warpV};
