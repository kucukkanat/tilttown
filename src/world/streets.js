import './houses.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {G} from '../state.js';
import {LV, R0, S, box, canvasTex, cyl, jit, lerp, mul, paint, pick, rng, tr} from '../core/util.js';
import {DIRS, cellAt, grad, mkMesh, plainMat, scene, topY, waterU, wx} from '../core/scene.js';
import {archOf, chims, glowU} from './houses.js';
import {bizSpillG, rebuildBiz, streetName} from '../game/identity.js';
import {bizSpill} from './organic.js';
import {nav, navPropBox} from '../people/sim.js';
import {effWeather} from '../game/extras.js';
import {mapOn} from './shops.js';

/* ---------- life: smoke, birds, walkers ---------- */
const puffTex = canvasTex(64, (x, s) => {
  for (let i = 0; i < 9; i++) { const cx = s / 2 + (R0() - .5) * s * .35, cy = s / 2 + (R0() - .5) * s * .35, r = s * (.18 + R0() * .14); const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }
});
const SMAX = 1400, sPos = new Float32Array(SMAX * 3), sSize = new Float32Array(SMAX), sAlpha = new Float32Array(SMAX), sCol = new Float32Array(SMAX * 3);
const sp = Array.from({length: SMAX}, () => ({life: 1, max: 1, v: new THREE.Vector3(), p: new THREE.Vector3(), s0: 1, s1: 1, a: 0, drag: 0}));
const smokeGeo = new THREE.BufferGeometry();
smokeGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
smokeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlpha, 1)); smokeGeo.setAttribute('aCol', new THREE.BufferAttribute(sCol, 3));
const smoke = new THREE.Points(smokeGeo, new THREE.ShaderMaterial({
  uniforms: {uScale: glowU.uScale, map: {value: puffTex}}, transparent: true, depthWrite: false,
  vertexShader: `attribute float aSize,aAlpha;attribute vec3 aCol;uniform float uScale;varying float vA;varying vec3 vC;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=aAlpha;vC=aCol;gl_PointSize=aSize*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform sampler2D map;varying float vA;varying vec3 vC;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vC*(.8+.35*t.a),min(1.,t.a*1.6)*vA);}`
}));
smoke.frustumCulled = false; scene.add(smoke);
let sCur = 0;
const smokeCol = new THREE.Color(), dustCol = new THREE.Color('#cbb79c');
function emit(p, v, s0, s1, life, col, a, drag = 0) {
  for (let n = 0; n < SMAX; n++) {
    const k = (sCur + n) % SMAX, q = sp[k];
    if (q.life >= q.max) { q.p.copy(p); q.v.copy(v); q.s0 = s0; q.s1 = s1; q.max = life; q.life = 0; q.a = a; q.drag = drag; sCol.set([col.r, col.g, col.b], k * 3); sCur = k + 1; return; }
  }
}
const WIND = new THREE.Vector3(1, 0, .35).normalize();
const SR = rng(99);
function updateSmoke(dt, t) {
  const w = G.preset.wind;
  chims.forEach((ch, k) => {
    // ~1 in 4 chimneys has a fire lit, only while someone is home; more in the cold morning and evening
    const lucky = (((k * 2654435761) >>> 0) % 100) < 24, cold = G.hour < 9.5 || G.hour > 17.5;
    if (!lucky || (ch.cell && (ch.cell.occ ?? 1) < .3) || (!cold && k % 3)) return;
    ch.acc = (ch.acc || 0) + dt;
    while (ch.acc > .75) { ch.acc -= .75; emit(new THREE.Vector3(ch.x + (SR() - .5) * .08, ch.y, ch.z + (SR() - .5) * .08), new THREE.Vector3(WIND.x * w * .25, .45 + SR() * .25, WIND.z * w * .25), 1.8, 6.5 + SR() * 2.5, 3.4 + SR() * 1.5, smokeCol, .42); }
  });
  for (let k = 0; k < SMAX; k++) {
    const q = sp[k];
    if (q.life >= q.max) { sAlpha[k] = 0; sSize[k] = 0; continue; }
    q.life += dt; const age = Math.min(1, q.life / q.max);
    q.v.x += WIND.x * w * .35 * dt; q.v.z += WIND.z * w * .35 * dt; q.v.y *= 1 - q.drag * dt;
    if (q.drag) { q.v.x *= 1 - q.drag * dt; q.v.z *= 1 - q.drag * dt; }
    q.p.addScaledVector(q.v, dt);
    sPos.set([q.p.x + Math.sin(t * 1.3 + k) * .05 * age, q.p.y, q.p.z], k * 3);
    sSize[k] = lerp(q.s0, q.s1, Math.sqrt(age));
    sAlpha[k] = q.a * THREE.MathUtils.smoothstep(age, 0, .12) * (1 - age);
  }
  smokeGeo.attributes.position.needsUpdate = smokeGeo.attributes.aSize.needsUpdate = smokeGeo.attributes.aAlpha.needsUpdate = smokeGeo.attributes.aCol.needsUpdate = true;
}
function dust(c) {
  const x = wx(c.i), z = wx(c.j), y = topY(c);
  for (let n = 0; n < 16; n++) { const a = n / 16 * 6.283 + SR() * .3, sp_ = 1.2 + SR() * .8; emit(new THREE.Vector3(x + Math.cos(a) * .8, y + .1, z + Math.sin(a) * .8), new THREE.Vector3(Math.cos(a) * sp_, .25 + SR() * .3, Math.sin(a) * sp_), 1.2, 3.2, .9 + SR() * .4, dustCol, .75, 3); }
}

// pop-in animation
const pops = [];
function pop(c) { if (c.obj) { pops.push({o: c.obj, t: 0}); c.obj.scale.set(1.2, .65, 1.2); } }
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt / .5; const t = Math.min(1, p.t);
    const sy = 1 - (1 - t) * (1 - t) * .35 * Math.cos(t * Math.PI * 2.4) / Math.max(.001, 1 - t * .0);
    const s = t >= 1 ? 1 : sy; p.o.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    if (t >= 1) pops.splice(i, 1);
  }
}

// birds
const birdGeo = new THREE.BufferGeometry();
birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .1, -.3, .09, -.05, 0, 0, -.05, 0, 0, .1, 0, 0, -.05, .3, .09, -.05], 3));
const BN = 36, birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({color: 0x1e171c, side: THREE.DoubleSide}), BN);
birds.frustumCulled = false; scene.add(birds);
const FLOCKS = [{cx: 0, cz: 0, r: 14, h: 12, spd: .22}, {cx: 5, cz: -4, r: 7, h: 8.5, spd: -.34}];
const bird = Array.from({length: BN}, (_, i) => { const R = rng(i + 500); return {f: i < 22 ? 0 : 1, off: R() * 1.1, dr: (R() - .5) * 5, dh: (R() - .5) * 2.5, fs: 9 + R() * 6, ph: R() * 6}; });
const dummy = new THREE.Object3D(), _v = new THREE.Vector3();
function updateBirds(t) {
  bird.forEach((b, i) => {
    const f = FLOCKS[b.f], a = t * f.spd + b.off, r = f.r + b.dr;
    dummy.position.set(f.cx + Math.cos(a) * r, f.h + b.dh + Math.sin(t * .8 + b.ph) * .5, f.cz + Math.sin(a) * r);
    const sgn = Math.sign(f.spd); _v.set(-Math.sin(a) * sgn, Math.sin(t * .8 + b.ph) * .1, Math.cos(a) * sgn).add(dummy.position);
    dummy.lookAt(_v);
    const flap = Math.sin(t * b.fs + b.ph); dummy.scale.set(1, (Math.sin(t * .5 + b.ph) > .3 ? .6 : flap * 1.8), 1);
    dummy.updateMatrix(); birds.setMatrixAt(i, dummy.matrix);
  });
  birds.instanceMatrix.needsUpdate = true;
}

// walkers
const walkable = c => !!c && c.owned !== false && !c.floors && c.kind !== 'tree' && c.kind !== 'church' && (!c.water || c.kind === 'bridge');
const walkY = c => c.water ? .17 : c.lvl * LV;
function canStep(a, b, dx) { if (!walkable(b)) return false; if (a.water || b.water) return dx === 0 && Math.abs(walkY(a) - walkY(b)) < .8; return Math.abs(a.lvl - b.lvl) <= 1; }
const WN = 28;
const walkerMat = new THREE.MeshToonMaterial({vertexColors: true, gradientMap: grad});
const wBodyGeo = mergeGeometries([cyl(.07, .11, .32, '#fff', tr(0, .16, 0), 7), paint(new THREE.SphereGeometry(.075, 7, 5), '#ffe0c8').applyMatrix4(tr(0, .4, 0)), cyl(.03, .03, .14, '#fff', tr(-.04, -.0, 0), 4), cyl(.03, .03, .14, '#fff', tr(.04, 0, 0), 4)]);
const wUmbGeo = mergeGeometries([cyl(.008, .3, .1, '#fff', tr(0, .66, 0), 8), cyl(.008, .008, .3, '#222', tr(0, .5, 0), 4)]);
const walkersMesh = new THREE.InstancedMesh(wBodyGeo, walkerMat, WN), umbMesh = new THREE.InstancedMesh(wUmbGeo, walkerMat, WN);
walkersMesh.visible = umbMesh.visible = false; walkersMesh.castShadow = true; walkersMesh.frustumCulled = umbMesh.frustumCulled = false; scene.add(walkersMesh, umbMesh);
const COATS = ['#2a2a3a', '#5a2a2a', '#2f4a3a', '#6a5040', '#3a3a3a', '#7a6a4a', '#2a3a5a', '#8a3a2a'];
const UMBS = ['#1e1e24', '#8a2a2a', '#2a4a6a', '#3a5a3a', '#c9a33f'];
const walkers = Array.from({length: WN}, (_, i) => { const R = rng(i * 77 + 3); walkersMesh.setColorAt(i, new THREE.Color(pick(R, COATS))); umbMesh.setColorAt(i, new THREE.Color(pick(R, UMBS))); return {c: null, n: null, prev: null, t: 0, speed: .7 + R() * .5, lane: (R() - .5) * .7, wait: 0, R}; });
function reseat(w) { const opts = G.cells.filter(c => walkable(c) && !c.water); w.c = opts.length ? pick(w.R, opts) : null; w.n = null; w.t = 0; }
function nextStep(w) {
  const opts = DIRS.map(([dx, dz]) => [cellAt(w.c.i + dx, w.c.j + dz), dx]).filter(([n, dx]) => n && canStep(w.c, n, dx)).map(([n]) => n);
  const fwd = opts.filter(n => n !== w.prev);
  const pool = fwd.length ? fwd : opts;
  w.n = pool.length ? pick(w.R, pool) : null; if (!w.n) w.wait = 1 + w.R() * 2;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function updateWalkers(dt, t) {
  walkers.forEach((w, i) => {
    if (!walkable(w.c)) reseat(w);
    if (!w.c) { dummy.scale.setScalar(0); dummy.updateMatrix(); walkersMesh.setMatrixAt(i, dummy.matrix); umbMesh.setMatrixAt(i, dummy.matrix); return; }
    if (w.n && !walkable(w.n)) { w.n = null; w.t = 0; }
    if (!w.n) { w.wait -= dt; if (w.wait <= 0) nextStep(w); }
    if (w.n) { w.t += dt * w.speed / S; if (w.t >= 1) { w.prev = w.c; w.c = w.n; w.n = null; w.t = 0; nextStep(w); } }
    const n = w.n || w.c;
    _a.set(wx(w.c.i), 0, wx(w.c.j)); _b.set(wx(n.i), 0, wx(n.j));
    const dir = _b.clone().sub(_a); const moving = dir.lengthSq() > 0; if (moving) dir.normalize(); else dir.set(Math.sin(w.lane * 9), 0, Math.cos(w.lane * 9));
    dummy.position.lerpVectors(_a, _b, w.t).add(new THREE.Vector3(-dir.z * w.lane, 0, dir.x * w.lane));
    dummy.position.y = lerp(walkY(w.c), walkY(n), THREE.MathUtils.smoothstep(w.t, .3, .7)) + (moving ? Math.abs(Math.sin(t * 9 * w.speed + i)) * .035 : 0) + .07;
    dummy.rotation.set(0, Math.atan2(dir.x, dir.z), 0); dummy.scale.setScalar(1.3);
    dummy.updateMatrix(); walkersMesh.setMatrixAt(i, dummy.matrix);
    if (G.preset.name !== 'Storm hill') dummy.scale.setScalar(0), dummy.updateMatrix();
    umbMesh.setMatrixAt(i, dummy.matrix);
  });
  walkersMesh.instanceMatrix.needsUpdate = umbMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- street props ---------- */
const CAFE = ['#b8432f', '#2f5f6f', '#3f6a3f', '#c9a33f'];
function propAt(out, R, pm, kind) { const n0 = out.length; propAt0(out, R, pm, kind); if (kind !== 'puddle' && kind !== 'manhole' && typeof nav !== 'undefined') navPropBox(out.slice(n0)); }
function propAt0(out, R, pm, kind) {
  const P = (g) => out.push(g);
  if (kind === 'bench') {
    P(box(.62, .05, .2, '#6a4a30', mul(pm, tr(0, .22, 0)))); P(box(.62, .16, .04, '#6a4a30', mul(pm, tr(0, .36, -.09))));
    for (const x of [-.26, .26]) P(box(.04, .22, .2, '#2a2622', mul(pm, tr(x, .11, 0))));
  } else if (kind === 'planter') {
    for (let q = 0; q < 1 + Math.floor(R() * 3); q++) { const x = (q - 1) * .3; P(cyl(.12, .09, .22, pick(R, ['#a0583a', '#8a4a38', '#b8b0a0']), mul(pm, tr(x, .11, 0)), 8)); P(paint(new THREE.IcosahedronGeometry(.16, 0), jit(pick(R, ['#4f6a2f', '#6a7a35', '#3f5a2a']), R, .08)).applyMatrix4(mul(pm, tr(x, .32, 0)))); if (R() < .6) for (let fl = 0; fl < 4; fl++) P(box(.05, .05, .05, pick(R, ['#d94f3d', '#e8c34a', '#f2a1b1', '#f0f0f0']), mul(pm, tr(x + (R() - .5) * .2, .4 + R() * .06, (R() - .5) * .2)))); }
  } else if (kind === 'crates') {
    P(box(.28, .28, .28, '#8a6a42', mul(pm, tr(-.15, .14, 0, .2)))); if (R() < .6) P(box(.24, .24, .24, '#7a5a38', mul(pm, tr(-.12, .4, 0, .7))));
    P(cyl(.12, .12, .32, '#6a4a30', mul(pm, tr(.2, .16, 0)), 9)); P(cyl(.125, .125, .03, '#2a2622', mul(pm, tr(.2, .08, 0)), 9)); P(cyl(.125, .125, .03, '#2a2622', mul(pm, tr(.2, .24, 0)), 9));
  } else if (kind === 'bike') {
    const c = pick(R, ['#2f5f8f', '#b8342a', '#2a2a2a', '#3f6a3f']);
    for (const x of [-.22, .22]) P(paint(new THREE.TorusGeometry(.13, .012, 4, 14), '#1e1e1e').applyMatrix4(mul(pm, tr(x, .14, 0))));
    P(box(.36, .02, .02, c, mul(pm, tr(0, .27, 0)))); P(box(.02, .2, .02, c, mul(pm, tr(-.08, .2, 0, 0, 0, .3)))); P(box(.02, .16, .02, c, mul(pm, tr(.17, .22, 0, 0, 0, -.3))));
    P(box(.1, .03, .05, '#1e1e1e', mul(pm, tr(-.1, .32, 0)))); P(box(.02, .02, .2, '#1e1e1e', mul(pm, tr(.2, .32, 0))));
  } else if (kind === 'cafe') {
    const c = pick(R, CAFE);
    P(cyl(.18, .18, .03, '#ece4d4', mul(pm, tr(0, .4, 0)), 12)); P(cyl(.02, .02, .4, '#2a2622', mul(pm, tr(0, .2, 0)), 5));
    for (const x of [-.3, .3]) { P(box(.16, .03, .16, '#2a2622', mul(pm, tr(x, .24, 0)))); P(box(.16, .2, .02, '#2a2622', mul(pm, tr(x + Math.sign(x) * .07, .34, 0, Math.PI / 2)))); for (const lx of [-.06, .06]) P(box(.02, .24, .02, '#2a2622', mul(pm, tr(x + lx, .12, 0)))); }
    P(cyl(.015, .015, .9, '#ddd', mul(pm, tr(0, .85, 0)), 4));
    for (let s = 0; s < 8; s++) P(paint(new THREE.CylinderGeometry(.02, .55, .2, 3, 1, true, s * Math.PI / 4, Math.PI / 4), s % 2 ? '#efe3c8' : c).applyMatrix4(mul(pm, tr(0, 1.2, 0))));
  } else if (kind === 'puddle') {
    P(paint(new THREE.CylinderGeometry(.3, .3, .01, 12), '#3a4a58').applyMatrix4(mul(pm, mul(tr(0, .012, .2), new THREE.Matrix4().makeScale(1.5, 1, .8)))));
  } else if (kind === 'manhole') {
    P(cyl(.2, .2, .02, '#3a3634', mul(pm, tr(0, .012, .3)), 12));
  } else if (kind === 'hydrant') {
    P(cyl(.06, .07, .24, '#b8342a', mul(pm, tr(0, .12, 0)), 8)); P(paint(new THREE.SphereGeometry(.065, 8, 4), '#b8342a').applyMatrix4(mul(pm, tr(0, .24, 0)))); P(box(.18, .04, .04, '#b8342a', mul(pm, tr(0, .16, 0))));
    P(cyl(.11, .09, .3, '#3f5a3a', mul(pm, tr(.35, .15, 0)), 8));
  } else if (kind === 'bollards') {
    for (const x of [-.4, 0, .4]) P(cyl(.05, .06, .3, '#2a2622', mul(pm, tr(x, .15, 0)), 6));
  }
}
const PROPS = [['bench', 3], ['planter', 4], ['crates', 3], ['bike', 2], ['puddle', 3], ['manhole', 2], ['hydrant', 2], ['bollards', 2]];
function pickProp(R) { let r = R() * 21; for (const [k, w] of PROPS) if ((r -= w) < 0) return k; return 'planter'; }
const boatsG = new THREE.Group(); scene.add(boatsG);
function buildStreets(stone, out) {
  boatsG.children.forEach(o => o.geometry.dispose()); boatsG.clear();
  nav.props.length = 0; nav.dirty = true;
  rebuildBiz(); bizSpillG.children.forEach(o => o.traverse(m => m.geometry && m.geometry.dispose())); bizSpillG.clear(); G.publicSeats = []; G.railSpots = [];
  for (const b of G.businesses) { bizSpill(b); b.grille = b.cell.grille; }
  if (typeof mapOn !== 'undefined' && mapOn) setTimeout(G.buildMapUI, 0);
  for (const c of G.cells) if (c.kind === 'plaza') { const x = wx(c.i), z = wx(c.j), y = topY(c); for (const sz of [.82, -.82]) for (const sx of [-.15, .15]) G.publicSeats.push({pos: new THREE.Vector3(x + sx, y, z + sz), yaw: sz > 0 ? Math.PI : 0, by: null}); }
  for (const L of G.cells) {
    const cx = wx(L.i), cz = wx(L.j);
    if (L.water) {
      const R = rng(L.seed * 41);
      if (L.kind !== 'bridge' && R() < .22) {
        const hc = jit(pick(R, ['#2f5f6f', '#b8432f', '#e6d2a6', '#3f6a3f', '#c9a33f']), R, .06);
        const g = [paint(new THREE.SphereGeometry(.5, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hc).applyMatrix4(new THREE.Matrix4().makeScale(.42, .32, 1.15)),
          box(.36, .03, .1, '#6a4a30', tr(0, -.04, .1)), box(.36, .03, .1, '#6a4a30', tr(0, -.04, -.35)), box(.03, .03, 1.1, '#5a3a28', tr(.3, .02, 0, .5, 0, .2))];
        const b = mkMesh(g, plainMat, true); b.position.set(cx + (R() - .5) * 1.2, -.3, cz + (R() - .5) * .3); b.rotation.y = Math.PI / 2 + (R() - .5) * .6; b.userData.ph = R() * 6; boatsG.add(b);
      }
      continue;
    }
    if (!walkable(L)) continue;
    const R = rng(L.seed * 29 + 1), y = L.lvl * LV;
    // parapets, quay railings
    DIRS.forEach(([dx, dz], di) => {
      const N = cellAt(L.i + dx, L.j + dz), ex = cx + dx * .93, ez = cz + dz * .93;
      const along = (len, h, th, col, yy, o = 0) => box(dx ? th : len, h, dx ? len : th, col, tr(ex + dx * o, yy, ez + dz * o));
      if (N && N.water) {
        if (N.kind === 'bridge') return;
        for (let q = -2; q <= 2; q++) out.push(box(.04, .42, .04, '#2a2622', tr(ex + (dx ? 0 : q * .45), y + .21, ez + (dz ? 0 : q * .45))));
        out.push(along(S, .035, .035, '#2a2622', y + .42)); out.push(along(S, .025, .025, '#2a2622', y + .22));
        G.railSpots.push({pos: new THREE.Vector3(cx + dx * .72 + (dx ? 0 : (R() - .5)), y, cz + dz * .72 + (dz ? 0 : (R() - .5))), yaw: Math.atan2(dx, dz)});
        if (R() < .35) out.push(cyl(.07, .09, .2, '#1e1e1e', tr(ex - dx * .2 + (dx ? 0 : .6), y + .1, ez - dz * .2 + (dz ? 0 : .6)), 7));
      } else if (!N || (N.lvl < L.lvl && !(walkable(N) && L.lvl - N.lvl === 1)) || (N.water === false && N.lvl < L.lvl && N.floors === 0 && !walkable(N))) {
        const col = jit('#a49684', R, .04);
        stone.push(along(S, .3, .14, col, y + .15)); stone.push(along(S + .02, .05, .2, jit('#c2b4a0', R, .03), y + .32));
      }
    });
    if (L.kind) continue;
    // props along the edge next to houses (sidewalk side)
    const sides = DIRS.map((d, k) => k).filter(k => { const n = cellAt(L.i + DIRS[k][0], L.j + DIRS[k][1]); return n && n.floors > 0 && !(n.bizObj && n.bizObj.street === L); });
    if (G.businesses.some(b => b.street === L) && R() < .6) continue;
    const town = sides.find(k => { const n = cellAt(L.i + DIRS[k][0], L.j + DIRS[k][1]); return archOf(n) === 'town'; });
    const nP = R() < .25 ? 0 : 1 + (R() < .35 ? 1 : 0);
    for (let q = 0; q < nP; q++) {
      const k = sides.length ? pick(R, sides) : Math.floor(R() * 4), [dx, dz] = DIRS[k];
      const lat = (R() - .5) * 1.1, px = -dz, pz = dx;
      const pm = tr(cx + dx * .68 + px * lat, y, cz + dz * .68 + pz * lat, Math.atan2(-dx, -dz));
      const kind = pickProp(R); propAt(out, R, pm, kind);
      if (kind === 'bench') for (const sx of [-.15, .15]) { const sp = new THREE.Vector3(sx, 0, 0).applyMatrix4(pm), fp = new THREE.Vector3(sx, 0, 1).applyMatrix4(pm); G.publicSeats.push({pos: sp, yaw: Math.atan2(fp.x - sp.x, fp.z - sp.z), by: null}); }
    }
  }
}
function updateBoats(t) { const ub = waterU.uBoats.value; ub.forEach(v => v.w = 0); boatsG.children.forEach((b, k) => { if (k < 6) ub[k].set(b.position.x, b.position.y, b.position.z, 1); b.position.y = -.3 + Math.sin(t * 1.4 + b.userData.ph) * .03; b.rotation.z = Math.sin(t * 1.1 + b.userData.ph) * .06; }); }

/* ---------- city: clock, businesses, citizens ---------- */
const PHONE = Math.min(innerWidth, innerHeight) < 700;
G.hour = 7.6; G.day = 0; G.speed = 1; G.simAcc = 0;
const now = () => G.day * 24 + G.hour;
const TOD_K = [[0, 1], [4.5, 1], [6, .62], [7.5, .3], [9.5, 0], [16, 0], [18.5, .42], [20, .62], [21.5, .85], [23, 1], [24, 1]];
function hourToTod(h) { for (let i = 1; i < TOD_K.length; i++) { const [h1, v1] = TOD_K[i - 1], [h2, v2] = TOD_K[i]; if (h <= h2) return lerp(v1, v2, (h - h1) / (h2 - h1)); } return 1; }
const hhmm = h => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const raining = () => effWeather() === 'rain';

const BIZ = {
  cafe: {label: 'Café', hours: [[7, 22]], awn: ['#7a3a2a', '#efe3c8'], sign: '#2a2622', staff: 1, names: ['Café Aurora', 'Café Lua', 'Café Ribeira', 'Café do Gato']},
  bakery: {label: 'Bakery', hours: [[6, 14]], awn: ['#c9a33f', '#efe3c8'], sign: '#6a3a1a', names: ['Padaria Sol', 'Padaria Nata', 'Padaria Avó']},
  grocer: {label: 'Grocer', hours: [[8, 19]], awn: ['#3f6a3f', '#e8d8a8'], sign: '#2f4a2a', stand: true, names: ['Mercearia Verde', 'Frutaria Rosa']},
  tasca: {label: 'Tasca', hours: [[12, 15], [19, 24]], awn: ['#6a2a2a', '#8a3a2a'], sign: '#3a1a1a', staff: 1, names: ['Tasca do Zé', 'Tasca Maré']},
  fish: {label: 'Fishmonger', hours: [[6, 12]], awn: ['#2f5f8f', '#e8eef4'], sign: '#1f3f5f', stand: true, names: ['Peixaria Mar']},
  florist: {label: 'Florist', hours: [[9, 18]], awn: ['#c97b84', '#f4e8e0'], sign: '#7a3a4a', stand: true, names: ['Florista Lírio']},
  books: {label: 'Bookshop', hours: [[10, 19]], awn: ['#4a3a6a', '#e8e0d0'], sign: '#2a2040', names: ['Livraria Velha']},
  barber: {label: 'Barber', hours: [[9, 18]], awn: ['#b8342a', '#f4f4f4'], sign: '#1e1e2a', names: ['Barbearia Silva']},
};
const SHOPCOL = {cafe: ['#2f7a72', '#efe3c8'], bakery: ['#d8a03a', '#f4ead2'], grocer: ['#3f7a3a', '#e8d8a8'], tasca: ['#9a2f2a', '#efe3c8'], fish: ['#2f5f9f', '#e8eef4'], florist: ['#d0708a', '#f6ece6'], books: ['#5a3a8a', '#e8e0d0'], barber: ['#b8342a', '#f4f4f4'], pharmacy: ['#2f9a5a', '#f0f4f0'], winebar: ['#6a1f3a', '#d8b8a0'], cinema: ['#c9a33f', '#1e1e2a']};
const isOpenAt = (type, h) => BIZ[type].hours.some(([a, b]) => h >= a && h < b);
function frontFace(c) { for (const k of [2, 0, 3, 1]) { const n = cellAt(c.i + DIRS[k][0], c.j + DIRS[k][1]); if (n && !n.water && walkable(n)) return k; } return undefined; }
G.businesses = [];
const STREETS = ['Rua das Flores', 'Rua do Sol', 'Rua da Ribeira', 'Rua Nova', 'Travessa do Gato', 'Rua das Taipas', 'Beco da Lua', 'Rua Direita', 'Calçada da Vitória', 'Rua do Poço', 'Rua Escura', 'Largo do Peixe', 'Rua da Fonte', 'Rua do Moinho'];
const address = c => `${streetName(c.i)}, ${c.j * 2 + 1}`;

export {BIZ, PHONE, SHOPCOL, STREETS, address, buildStreets, canStep, dust, frontFace, hhmm, hourToTod, isOpenAt, now, pop, propAt, puffTex, raining, smokeCol, updateBirds, updateBoats, updatePops, updateSmoke, walkY, walkable};
