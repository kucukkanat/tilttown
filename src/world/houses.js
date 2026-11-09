import '../core/scene.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {FH, LV, N, S, box, cyl, glowTex, jit, leafTex, mul, paint, pick, rng, setAttr, tr} from '../core/util.js';
import {DIRS, ROOFS, SHUT, WALLS, azMat, bodyMat, brickMat, cellAt, cobbleMat, darkMat, grad, houseLit, litMat, litU, mkMesh, objG, plainMat, roofMat, scene, stoneMat, swayMat, terrainG, topY, wx} from '../core/scene.js';
import {buildStreets, frontFace, walkable} from './streets.js';
import {OWN, TILE_TINT, flagMat, labelGeo, labelMat, ownDecor, plaqueFor, plazaName, streetName, townName} from '../game/identity.js';
import {buildJoins, buildYard, terrainDressing, warpV} from './organic.js';
import {buildChurch, bunting, effWeather, festActive, interiorMat, landmarkDecor, wetAmt} from '../game/extras.js';
import {shabbyLvl, storyDecor} from '../game/meta.js';
import {hookMap, signMat, storefront} from './shops.js';

/* ---------- procedural house ---------- */
const ARCHS = [['gabled', 4], ['tower', 2], ['town', 2.5], ['turret', 2]];
function archOf(c) { if (c.style === 'villa') return 'villa'; if (c.style === 'nouveau') return 'town'; const R = rng(c.seed * 7 + 1); let r = R() * 10.5; for (const [a, w] of ARCHS) if ((r -= w) < 0) return a; return 'gabled'; }
const AWN = [['#b8432f', '#efe3c8'], ['#2f5f6f', '#efe3c8'], ['#3f6a3f', '#e8d8a8'], ['#7a3a5a', '#f0e0d0']];

function buildHouse(c) {
  const R = rng(c.seed * 9973 + 7);
  const arch = archOf(c);
  const body = [], roof = [], lit = [], dark = [], plain = [], glows = [], brick = [], tile = [], lbls = [];
  const fl = c.floors;
  const nb = DIRS.map(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); return n && n.floors > 0 ? n : null; });
  const hw = arch === 'tower' ? .55 : .8;
  let x0 = -hw, x1 = hw, z0 = -hw, z1 = hw;
  if (nb[0]) x1 = 1; if (nb[1]) x0 = -1; if (nb[2]) z1 = 1; if (nb[3]) z0 = -1;
  const wall = jit(pick(R, WALLS), R, .06), trim = R() < .55 ? '#ece0c6' : '#3b3530', shut = pick(R, SHUT);
  if (c.style === 'nouveau') wall.set(pick(rng(c.seed), ['#e8c8c0', '#c8d8c0', '#e8dcb0', '#c0d0e0'])); if (c.style === 'villa') wall.set('#f2eee6'); if (c.paint?.w) wall.set(c.paint.w);
  const SL = shabbyLvl(c), RS = rng(c.seed * 3 + 11); if (SL) wall.lerp(new THREE.Color('#8a7a6a'), .22 * SL);
  const rc = R() < .16 ? jit(pick(R, ['#4a5560', '#55606a', '#3f4850']), R, .04) : jit(pick(R, ROOFS), R, .05);
  if (c.style === 'nouveau') rc.set('#5f8f7a');
  const leanAmt = arch === 'tower' ? .13 : arch === 'turret' ? .03 : .07;
  let lx = (R() - .5) * leanAmt, lz = (R() - .5) * leanAmt;
  if (nb[0] || nb[1]) lz *= .3; if (nb[2] || nb[3]) lx *= .3;
  const doorFace = frontFace(c) ?? [2, 0, 3, 1].find(k => !nb[k]) ?? -1; let shop = null; const shopGlass = [], signG = [], flutter = []; let swing = null, plate = null, pole = null;
  let lastThr = 0; const chims = [];
  const addLit = g => { lastThr = .12 + R() * 1.0; setAttr(g, 'lthr', lastThr); lit.push(g); };
  const glowLast = (...vs) => vs.forEach(v => { v.thr = lastThr; glows.push(v); });
  let turret = null;
  if (arch === 'turret') {
    const cs = [[0, 2], [0, 3], [1, 2], [1, 3]].filter(([a, b]) => !nb[a] && !nb[b]);
    if (cs.length) { const [a, b] = pick(R, cs); turret = {a, b, sx: a === 0 ? 1 : -1, sz: b === 2 ? 1 : -1}; }
  }
  const setback = fl >= 3 && !turret && R() < .3;
  const freeFaces = [0, 1, 2, 3].filter(k => !nb[k] && k !== doorFace && !(turret && (k === turret.a || k === turret.b)));
  const bayFace = fl >= 3 && freeFaces.length && R() < .45 ? pick(R, freeFaces) : -1;
  const azulR = R() < .24, azTintR = pick(R, ['#ffffff', '#eef4ff', '#f2f8ea', '#fff2e2']), azul = c.paint?.t ? c.paint.t !== 'none' : azulR || c.style === 'villa', azTint = c.paint?.t && c.paint.t !== 'none' ? TILE_TINT[c.paint.t] : azTintR, quoin = R() < .4, winStyle = pick(R, ['plain', 'lintel', 'key', 'ped', 'key']);
  const mull = R() < .7, ivyFace = R() < .22 && freeFaces.length ? pick(R, freeFaces) : -1, ivyH = 1 + Math.floor(R() * Math.min(3, fl)), ivyT = (R() - .5) * .8;
  const pipeFace = R() < .65 && freeFaces.length ? pick(R, freeFaces) : -1, quoinCol = trim === '#3b3530' ? '#d8ccb4' : jit('#e6dccb', R, .03);
  const CURT = ['#a83a3a', '#e8dcc0', '#3a5a8a', '#6a8a4a', '#d8a040'];

  // stilted basement on the downhill side
  const myTop = topY(c); let low = myTop;
  DIRS.forEach(([dx, dz]) => { const n = cellAt(c.i + dx, c.j + dz); if (n) low = Math.min(low, n.water ? -.32 : topY(n)); });
  if (myTop - low > .1) {
    const h = myTop - low + .02, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    body.push(box(x1 - x0 - .06, h, z1 - z0 - .06, jit(wall, R, .1).multiplyScalar(.62), tr(cx, -h / 2, cz)));
    for (const sx of [x0 + .15, x1 - .15]) for (const sz of [z0 + .15, z1 - .15]) plain.push(box(.14, h, .14, '#5a4a3e', tr(sx, -h / 2, sz)));
  }

  function windowAt(em, wy, wh, tall) {
    body.push(box(.42, wh + .12, .06, trim, mul(em, tr(0, wy, 0))));
    const rv = jit(trim, R, .04).multiplyScalar(.62);
    for (const sx of [-.18, .18]) plain.push(box(.05, wh + .02, .11, rv, mul(em, tr(sx, wy, .055))));
    plain.push(box(.41, .05, .11, rv, mul(em, tr(0, wy + wh / 2 + .015, .055))));
    const gm = mul(em, tr(0, wy, .035)), on = R() < .5;
    addLit(box(.3, wh, .02, '#fff', gm));
    glowLast(new THREE.Vector3(0, 0, .25).applyMatrix4(gm));
    if (R() < .6) for (const sx of [-.31, .31]) plain.push(box(.2, wh + .06, .04, shut, mul(em, tr(sx, wy, .03))));
    if (!tall) body.push(box(.5, .05, .13, trim, mul(em, tr(0, wy - wh / 2 - .03, .05))));
    if (R() < .12 || c.biz === 'bnb') plain.push(box(.36, .1, .16, '#7a4a30', mul(em, tr(0, wy - wh / 2 - .02, .14)))), plain.push(box(.34, .1, .12, pick(R, ['#c4502b', '#e0a23a', '#6a8a3a', '#d06a8a']), mul(em, tr(0, wy - wh / 2 + .07, .14))));
    if (mull) { plain.push(box(.022, wh, .015, trim, mul(gm, tr(0, 0, .022)))); plain.push(box(.3, .022, .015, trim, mul(gm, tr(0, wh * .18, .022)))); }
    if (R() < .4) { const cc = pick(R, CURT); for (const sx of [-.11, .11]) plain.push(box(.08, wh * .92, .01, cc, mul(gm, tr(sx, 0, .012)))); }
    const ty = wy + wh / 2 + .06;
    if (winStyle === 'lintel' || winStyle === 'key') body.push(box(.54, .07, .08, trim, mul(em, tr(0, ty + .02, .01))));
    if (winStyle === 'key') body.push(box(.1, .13, .09, trim, mul(em, tr(0, ty + .04, .015))));
    if (winStyle === 'ped' && !tall) { const sh = new THREE.Shape([new THREE.Vector2(-.3, 0), new THREE.Vector2(.3, 0), new THREE.Vector2(0, .15)]); const pg = paint(new THREE.ExtrudeGeometry(sh, {depth: .07, bevelEnabled: false}), trim); pg.applyMatrix4(mul(em, tr(0, ty, -.02))); body.push(pg); }
  }

  let chain = tr((x0 + x1) / 2, 0, (z0 + z1) / 2);
  let topM, topW, topD, bay = null;
  for (let f = 0; f < fl; f++) {
    if (f > 0) chain.multiply(tr(0, 0, 0, (R() - .5) * .05, lx * (.6 + R() * .8), lz * (.6 + R() * .8)));
    const jet = f > 0 && R() < .3 ? .07 : 0, last = f === fl - 1;
    let w = (x1 - x0) + jet * 2 * (nb[0] || nb[1] ? 0 : 1), d = (z1 - z0) + jet * 2 * (nb[2] || nb[3] ? 0 : 1);
    if (last && setback) { w *= .74; d *= .74; }
    const m = mul(chain, tr(0, FH / 2, 0));
    const wc = f === 0 && R() < .35 ? jit(wall, R, .1).multiplyScalar(.85) : (f > 1 && R() < .15 ? jit(pick(R, WALLS), R, .05) : wall);
    body.push(box(w, FH, d, wc, m));
    if (f > 0) body.push(box(w + .08, .07, d + .08, trim, mul(m, tr(0, -FH / 2 + .02, 0))));
    if (f === 1) bay = {m, w, d};
    if (f === 0) body.push(box(w + .05, .24, d + .05, jit('#857a70', R, .04), mul(m, tr(0, -FH / 2 + .12, 0))));
    for (let k = 0; k < 4; k++) {
      if (nb[k]) continue;
      const ry = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][k], half = k < 2 ? w / 2 : d / 2, span = k < 2 ? d : w, fm = mul(m, tr(0, 0, 0, ry));
      if (azul && f > 0 && !(k === bayFace && f < fl - 1)) tile.push(box(span - .03, FH - .1, .014, azTint, mul(fm, tr(0, .02, half + .007))));
      else if (R() < .32 || RS() < SL * .3) for (let q = 0; q < 2 + Math.floor(R() * 2); q++) { const top = R() < .5, ph = .08 + R() * .1; brick.push(box(.18 + R() * .3, ph, .014, '#ffffff', mul(fm, tr((R() - .5) * (span - .5), top ? FH / 2 - .14 - R() * .04 : -FH / 2 + (f ? .12 : .32) + R() * .06, half + .007 + q * .001)))); }
      if (quoin && !azul) for (const sg of [-1, 1]) { const nk = k < 2 ? (sg > 0 ? (k === 0 ? 2 : 3) : (k === 0 ? 3 : 2)) : (sg > 0 ? (k === 2 ? 1 : 0) : (k === 2 ? 0 : 1)); if (nb[nk]) continue; for (let q = 0; q < 4; q++) { const wq = q % 2 ? .14 : .22; body.push(box(wq, .19, .03, quoinCol, mul(fm, tr(sg * (span / 2 - wq / 2 + .01), -FH / 2 + .12 + q * .23, half + .01)))); } }
      if (k === ivyFace && f < ivyH) for (let q = 0; q < 6; q++) plain.push(paint(new THREE.IcosahedronGeometry(.1 + R() * .1, 0), jit(pick(R, ['#4f6a2f', '#5f7a35', '#3f5a2a', '#7a8a3a', f === ivyH - 1 ? '#a8502a' : '#4f6a2f']), R, .06)).applyMatrix4(mul(fm, mul(tr(ivyT * span + (R() - .5) * .55, (R() - .5) * FH, half + .03), new THREE.Matrix4().makeScale(1, 1, .35)))));
      if (k === pipeFace && last) { plain.push(cyl(.03, .03, (f + 1) * FH, '#3e3a36', mul(fm, tr(span / 2 - .07, FH / 2 - (f + 1) * FH / 2, half + .04)), 6)); plain.push(box(.1, .04, .06, '#3e3a36', mul(fm, tr(span / 2 - .07, -FH / 2 - f * FH + .03, half + .07)))); }
    }
    let balcony = f > 0 && (R() < .18 || c.style === 'nouveau');
    for (let k = 0; k < 4; k++) {
      if (nb[k]) continue;
      if (k === bayFace && f >= 1 && f < fl - 1) continue;
      const ry = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][k];
      const half = k < 2 ? w / 2 : d / 2, span = k < 2 ? d : w;
      const fm = mul(m, tr(0, 0, 0, ry));
      if (f === 0 && c.biz && k === doorFace) { // business shopfront
        const sw = Math.min(span * .8, 1.5), em = mul(fm, tr(0, 0, half));
        const sf = storefront(c, em, sw, R, {body, plain, shopGlass, glows, flutter, signG, lit, tile, lbls});
        swing = sf.swing; plate = sf.plate; shop = sf.shop; pole = sf.pole || null;
        continue;
      }
      const slots = (arch === 'tower' || (turret && (k === turret.a || k === turret.b))) ? [0] : span > 1.45 ? [-span * .27, span * .27] : [0];
      slots.forEach((t, si) => {
        const em = mul(fm, tr(t, 0, half));
        if (f === 0 && k === doorFace && si === slots.length - 1) {
          body.push(box(.56, .82, .05, trim, mul(em, tr(0, -FH / 2 + .41, .01))));
          plain.push(box(.44, .72, .05, c.paint?.d || '#4a2f22', mul(em, tr(0, -FH / 2 + .36, .03))));
          plain.push(box(.62, .08, .22, '#8b8076', mul(em, tr(0, -FH / 2 + .04, .1))));
          for (const px of [-.1, .1]) for (const py of [.2, .5]) plain.push(box(.14, .2, .02, '#3a2418', mul(em, tr(px, -FH / 2 + py, .06))));
          plain.push(box(.03, .03, .03, '#c9a33f', mul(em, tr(.15, -FH / 2 + .36, .07))));
          addLit(box(.38, .07, .02, '#fff', mul(em, tr(0, -FH / 2 + .77, .04))));
          plain.push(box(.1, .07, .015, '#2f5ea8', mul(em, tr(.36, -FH / 2 + .62, .03)))); if (plaqueFor(c)) { const px_ = -Math.min(.46, span / 2 - .2); plain.push(box(.38, .13, .012, '#1f3f8a', mul(em, tr(px_, -FH / 2 + .62, .03)))); lbls.push(labelGeo('street:' + c.i, streetName(c.i), {kind: 'azul'}, .36, .11).applyMatrix4(mul(em, tr(px_, -FH / 2 + .62, .038)))); }
          if (R() < .55) { plain.push(box(.03, .03, .14, '#2a2622', mul(em, tr(-.38, -FH / 2 + .85, .07)))); addLit(box(.09, .13, .09, '#fff', mul(em, tr(-.38, -FH / 2 + .76, .14)))); glowLast(new THREE.Vector3(-.38, -FH / 2 + .76, .3).applyMatrix4(em)); }
          if (R() < .2) { plain.push(box(.03, .03, .42, '#2a2622', mul(em, tr(.45, -FH / 2 + .9, .21)))); plain.push(box(.04, .26, .32, pick(R, ['#2f4a3a', '#7a3a2a', '#2a3a5a', '#8a6a2a']), mul(em, tr(.45, -FH / 2 + .74, .28)))); }
          return;
        }
        if (R() < .1 || RS() < SL * .12) { if (R() < .4) plain.push(box(.36, .5, .05, '#6a5040', mul(em, tr(0, .04, .02)))); return; } // boarded / blank
        const tall = balcony && si === 0;
        windowAt(em, tall ? -.08 : .04, tall ? .7 : .48, tall);
        if (tall) {
          plain.push(box(.9, .06, .38, '#6b625a', mul(em, tr(0, -.43, .19))));
          plain.push(box(.9, .03, .03, '#2a2622', mul(em, tr(0, -.14, .36))));
          for (let b = -4; b <= 4; b++) plain.push(box(.02, .28, .02, '#2a2622', mul(em, tr(b * .1, -.28, .36))));
          balcony = false;
        }
        if (R() < .07) plain.push(box(.3, .2, .2, '#d6d4c8', mul(em, tr(.42, -.28, .12))));
        if (R() < .05) plain.push(box(.04, .04, .3, '#aaa', mul(em, tr(.3, .3, .15)))), plain.push(paint(new THREE.CylinderGeometry(.16, .16, .03, 10), '#e0e0dc').applyMatrix4(mul(em, tr(.3, .3, .3, 0, Math.PI / 2))));
      });
    }
    topM = m; topW = w; topD = d;
    chain.multiply(tr(0, FH, 0));
  }

  // bay window spanning middle floors
  if (bayFace >= 0 && bay) {
    const k = bayFace, ry = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][k], half = k < 2 ? bay.w / 2 : bay.d / 2;
    const nB = fl - 2, fm = mul(bay.m, tr(0, -FH / 2, half, ry)).multiply(tr(0, 0, 0)), fm2 = mul(bay.m, tr(0, 0, 0, ry));
    const bc = R() < .4 ? jit('#6b4a35', R, .08) : jit(wall, R, .08).multiplyScalar(1.08);
    const base = mul(fm2, tr(0, -FH / 2, half));
    body.push(box(.86, nB * FH, .36, bc, mul(base, tr(0, nB * FH / 2, .18))));
    plain.push(box(.92, .08, .4, '#4a3a30', mul(base, tr(0, -.02, .2))));
    roof.push(box(.98, .07, .46, rc, mul(base, tr(0, nB * FH + .03, .22, 0, .25))));
    for (let q = 0; q < nB; q++) windowAt(mul(base, tr(0, FH * (q + .5), .36)), .04, .5, false);
  }

  // turret
  if (turret) {
    const th = fl * FH + .25, r = .4;
    const tx = (x0 + x1) / 2 + turret.sx * ((x1 - x0) / 2 - .05), tz = (z0 + z1) / 2 + turret.sz * ((z1 - z0) / 2 - .05);
    const tc = jit(wall, R, .08).offsetHSL(0, -.05, .06);
    body.push(cyl(r, r, th, tc, tr(tx, th / 2, tz), 14));
    for (let f = 0; f < fl; f++) body.push(cyl(r + .04, r + .04, .06, trim, tr(tx, f * FH + .02, tz), 14));
    const a0 = Math.atan2(turret.sx, turret.sz);
    for (let f = 0; f < fl; f++) for (const da of [-.85, 0, .85]) {
      if (f === 0 && da !== 0) continue;
      const a = a0 + da, gm = tr(tx + Math.sin(a) * r, f * FH + FH / 2 + .04, tz + Math.cos(a) * r, a), on = R() < .55;
      body.push(box(.26, .5, .05, trim, gm));
      addLit(box(.18, .4, .02, '#fff', mul(gm, tr(0, 0, .03))));
      glowLast(new THREE.Vector3(0, 0, .25).applyMatrix4(gm));
    }
    roof.push(cyl(.02, r + .14, 1.1 + R() * .5, rc, tr(tx, th + .55, tz), 14));
    plain.push(cyl(.015, .015, .5, '#2a2622', tr(tx, th + 1.3, tz)));
  }

  // roof
  if (arch === 'villa') { // flat roof terrace
    const rm = mul(topM, tr(0, FH / 2, 0));
    body.push(box(topW + .06, .06, topD + .06, '#e8e0d0', rm));
    for (const [w_, d_, x_, z_] of [[topW, .06, 0, topD / 2], [topW, .06, 0, -topD / 2], [.06, topD, topW / 2, 0], [.06, topD, -topW / 2, 0]]) body.push(box(w_ + .04, .26, d_ + .04, '#f2eee6', mul(rm, tr(x_, .13, z_))));
    for (const s of [-1, 1]) { plain.push(cyl(.1, .08, .16, '#a0583a', mul(rm, tr(s * topW * .3, .11, topD * .25)), 8)); plain.push(paint(new THREE.IcosahedronGeometry(.14, 0), '#5f7a35').applyMatrix4(mul(rm, tr(s * topW * .3, .3, topD * .25)))); }
    plain.push(cyl(.012, .012, .6, '#ddd', mul(rm, tr(0, .33, -topD * .15)), 4)); for (let s = 0; s < 8; s++) plain.push(paint(new THREE.CylinderGeometry(.02, .38, .12, 3, 1, true, s * Math.PI / 4, Math.PI / 4), s % 2 ? '#f4f0e8' : '#2f5ea8').applyMatrix4(mul(rm, tr(0, .65, -topD * .15))));
    plain.push(box(.2, .35, .2, '#d8ccb4', mul(rm, tr(-topW * .35, .2, -topD * .3)))); chims.push(new THREE.Vector3(-topW * .35, .45, -topD * .3).applyMatrix4(rm));
  } else if (arch === 'town') { // mansard + rooftop clutter
    const mh = .55, k = .66, s = 1 / (2 * .35355);
    const rm = mul(topM, tr(0, FH / 2, 0));
    const g = paint(new THREE.CylinderGeometry(.5 * k, .5, mh, 4, 1), rc); g.applyMatrix4(tr(0, 0, 0, Math.PI / 4));
    g.applyMatrix4(new THREE.Matrix4().makeScale((topW + .16) * s, 1, (topD + .16) * s)); g.applyMatrix4(mul(rm, tr(0, mh / 2, 0)));
    roof.push(g);
    plain.push(box((topW + .16) * k, .06, (topD + .16) * k, '#5a4a40', mul(rm, tr(0, mh + .02, 0))));
    for (let q = 0; q < 4; q++) {
      if (nb[q] || R() < .35) continue;
      const ry = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][q], half = (q < 2 ? topW : topD) / 2;
      const dm = mul(rm, tr(0, 0, 0, ry)).multiply(tr(0, mh * .45, half - .06));
      body.push(box(.36, .38, .3, trim, dm)); roof.push(box(.44, .06, .38, rc, mul(dm, tr(0, .21, 0))));
      const on = R() < .5; addLit(box(.22, .24, .02, '#fff', mul(dm, tr(0, 0, .16))));
      glowLast(new THREE.Vector3(0, 0, .35).applyMatrix4(dm));
    }
    const ex = R();
    if (ex < .45) { // water tank on legs
      const tm = mul(rm, tr((R() - .5) * topW * .3, mh, (R() - .5) * topD * .3));
      for (const a of [-.18, .18]) for (const b of [-.18, .18]) plain.push(box(.04, .4, .04, '#3a3430', mul(tm, tr(a, .2, b))));
      plain.push(cyl(.3, .3, .5, '#8a5a40', mul(tm, tr(0, .65, 0)), 10)); plain.push(cyl(.02, .33, .18, '#5a3a2a', mul(tm, tr(0, .99, 0)), 10));
    } else if (ex < .8) { // rooftop shed
      const sm = mul(rm, tr((R() - .5) * topW * .3, mh, (R() - .5) * topD * .3, R() * .4));
      body.push(box(.55, .45, .45, jit(pick(R, WALLS), R, .08), mul(sm, tr(0, .23, 0))));
      roof.push(box(.65, .05, .55, '#6a6a68', mul(sm, tr(0, .48, 0, 0, 0, .15))));
      plain.push(box(.2, .32, .02, '#4a2f22', mul(sm, tr(.08, .17, .23))));
    }
    plain.push(box(.22, .5, .22, '#8a4a38', mul(rm, tr(topW * .3, mh + .2, -topD * .25)))); chims.push(new THREE.Vector3(topW * .3, mh + .5, -topD * .25).applyMatrix4(rm));
  } else {
    const along = R() < .5;
    const rm = mul(topM, tr(0, FH / 2, 0, along ? 0 : Math.PI / 2));
    const L = along ? topD : topW, Wd = along ? topW : topD;
    const rh = arch === 'tower' ? .8 + R() * .5 : .38 + R() * .38, ov = .16, th = .07;
    const shp = new THREE.Shape([new THREE.Vector2(-Wd / 2, 0), new THREE.Vector2(Wd / 2, 0), new THREE.Vector2(0, rh)]);
    const gab = paint(new THREE.ExtrudeGeometry(shp, {depth: L, bevelEnabled: false}), wall); gab.applyMatrix4(mul(rm, tr(0, 0, -L / 2))); body.push(gab);
    const sl = Math.hypot(Wd / 2, rh), a = Math.atan2(rh, Wd / 2);
    for (const s of [1, -1]) {
      const dir = new THREE.Vector2(s * Wd / 2, -rh).divideScalar(sl), nrm = new THREE.Vector2(s * rh, Wd / 2).divideScalar(sl);
      const cx = s * Wd / 4 + dir.x * ov / 2 + nrm.x * th / 2, cy = rh / 2 + dir.y * ov / 2 + nrm.y * th / 2;
      const smx = mul(rm, tr(cx, cy, 0, 0, 0, -s * a));
      roof.push(box(sl + ov, th, L + .3, rc, smx));
      for (let q = 0; q < Math.floor(R() * 3); q++) roof.push(box(.25 + R() * .3, th + .025, .25 + R() * .4, pick(R, ['#6a7a3a', '#5a6a32', '#4a2a22', '#d0704a', jit(rc, R, .15)]), mul(smx, tr((R() - .5) * sl * .6, .01, (R() - .5) * L * .7))));
      plain.push(box(.08, .07, L + .32, '#3e3a36', mul(rm, tr(s * (Wd / 2 + ov * Math.cos(a)), -ov * Math.sin(a) - .02, 0))));
    }
    roof.push(cyl(.075, .075, L + .34, jit(rc, R, .1).multiplyScalar(.82), mul(rm, tr(0, rh + .035, 0, 0, Math.PI / 2)), 8));
    for (let q = -1; q <= 1; q += 2) roof.push(cyl(.09, .07, .05, jit(rc, R, .1).multiplyScalar(.7), mul(rm, tr(0, rh + .035, q * (L / 2 + .17), 0, Math.PI / 2)), 8));
    if (arch !== 'tower' && L > 1.2 && R() < .45) { // dormer
      const s = R() < .5 ? 1 : -1, dz = (R() - .5) * L * .3;
      const dm = mul(rm, tr(s * Wd * .22, rh * .52, dz, s > 0 ? Math.PI / 2 : -Math.PI / 2));
      body.push(box(.4, .42, .5, wall, mul(dm, tr(0, .1, -.05))));
      body.push(box(.3, .3, .05, trim, mul(dm, tr(0, .12, .21))));
      const on = R() < .5; addLit(box(.2, .22, .02, '#fff', mul(dm, tr(0, .12, .245))));
      glowLast(new THREE.Vector3(0, .12, .4).applyMatrix4(dm));
      roof.push(box(.52, .06, .6, rc, mul(dm, tr(0, .35, -.03, 0, .12))));
    }
    if (R() < .85) { const cx = (R() - .5) * Wd * .5, cz = (R() - .5) * L * .6, h = rh * (1 - Math.abs(cx) / (Wd / 2)); plain.push(box(.24, .7, .24, '#8a4a38', mul(rm, tr(cx, h + .1, cz)))); plain.push(box(.32, .07, .32, '#3a3330', mul(rm, tr(cx, h + .48, cz)))); chims.push(new THREE.Vector3(cx, h + .55, cz).applyMatrix4(rm)); for (const o of [-.07, .07]) if (R() < .7) plain.push(cyl(.04, .05, .15, '#a85a3a', mul(rm, tr(cx + o, h + .58, cz)), 6)); }
    if (R() < .35) { plain.push(box(.03, .8, .03, '#2a2622', mul(rm, tr(0, rh + .4, L * .3)))); plain.push(box(.5, .02, .02, '#2a2622', mul(rm, tr(0, rh + .65, L * .3)))); }
    if (arch === 'tower' && R() < .5) plain.push(box(.04, .45, .04, '#2a2622', mul(rm, tr(0, rh + .2, 0)))), plain.push(box(.3, .12, .02, '#2a2622', mul(rm, tr(.1, rh + .38, 0)))); // weathervane
  }
  return {body, roof, lit, dark, plain, glows, chims, brick, tile, shop, shopGlass, sign: signG, flutter, swing, plate, pole, lbls};
}

/* ---------- decor: laundry, power lines, stairs ---------- */
const laundryG = new THREE.Group(); scene.add(laundryG);
const CLOTH = ['#f2efe6', '#d94f3d', '#3f6f9f', '#e8c34a', '#7aa36a', '#f2a1b1', '#ffffff', '#5a4a7a'];
function swayTop(g, top, k) { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = Math.max(0, top - p.getY(i)) * k; g.setAttribute('sway', new THREE.BufferAttribute(a, 1)); return g; }
const eave = c => topY(c) + c.floors * FH;
function rebuildLaundry() {
  laundryG.children.forEach(m => m.geometry.dispose()); laundryG.clear();
  const g = [], wires = [], stairs = [];
  for (const c of G.cells) {
    if (c.floors < 2) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      // laundry
      const R = rng(c.seed * 13 + dx * 7 + dz * 3);
      if (R() < .8) for (let k = 2; k <= 4; k++) {
        const t = cellAt(c.i + dx * k, c.j + dz * k); if (!t) break;
        let ok = true; for (let q = 1; q < k; q++) { const m = cellAt(c.i + dx * q, c.j + dz * q); if (m.floors > 0) ok = false; }
        if (!ok) break; if (t.floors < 2) continue;
        const lo = Math.max(topY(c), topY(t)) + .85, hi = Math.min(topY(c) + (c.floors - .25) * FH, topY(t) + (t.floors - .25) * FH);
        if (hi < lo) continue;
        const y = lo + R() * (hi - lo), off = .82;
        const a = new THREE.Vector3(wx(c.i) + dx * off, y, wx(c.j) + dz * off), b = new THREE.Vector3(wx(t.i) - dx * off, y, wx(t.j) - dz * off);
        const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, .5).add(new THREE.Vector3(0, -.12 * k, 0)), b);
        g.push(swayTop(paint(new THREE.TubeGeometry(curve, 12, .012, 3), '#2a2622'), -99, 0));
        for (let u = .12; u < .9; u += .09 + R() * .07) {
          if (R() < .25) continue;
          const p = curve.getPoint(u), cw = .13 + R() * .15, ch = .18 + R() * .24;
          g.push(swayTop(box(dx ? cw : .02, ch, dx ? .02 : cw, pick(R, CLOTH), tr(p.x, p.y - ch / 2 + .01, p.z)), p.y, .9));
        }
        break;
      }
      // power lines (+ birds sitting on them)
      const R2 = rng(c.seed * 17 + dx * 5 + dz * 11);
      if (R2() < .55) for (let k = 2; k <= 5; k++) {
        const t = cellAt(c.i + dx * k, c.j + dz * k); if (!t) break;
        if (t.floors < 2) { if (t.floors > 0) break; continue; }
        const y = Math.min(eave(c), eave(t)) - .08;
        let ok = true; for (let q = 1; q < k; q++) { const m = cellAt(c.i + dx * q, c.j + dz * q); const top = m.floors ? eave(m) + 1.1 : topY(m) + (m.kind === 'tree' ? 3.6 : m.kind === 'lamp' ? 1.7 : 0); if (top > y - .2) ok = false; }
        if (!ok) break;
        const off = .8, px = -dz, pz = dx;
        for (const lat of [-.1, .12]) {
          const a = new THREE.Vector3(wx(c.i) + dx * off + px * lat, y + lat * .3, wx(c.j) + dz * off + pz * lat), b = new THREE.Vector3(wx(t.i) - dx * off + px * lat, y + lat * .3, wx(t.j) - dz * off + pz * lat);
          const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, .5).add(new THREE.Vector3(0, -.14 * k, 0)), b);
          wires.push(paint(new THREE.TubeGeometry(curve, 14, .01, 3), '#1e1a1a'));
          if (lat > 0 && R2() < .6) { const nB = 1 + Math.floor(R2() * 4), u0 = .2 + R2() * .4; for (let q = 0; q < nB; q++) { const p = curve.getPoint(u0 + q * .06 + R2() * .02), ry = Math.atan2(px, pz) + (R2() < .5 ? 0 : Math.PI); wires.push(box(.07, .07, .13, '#1e1a1e', mul(tr(p.x, p.y + .045, p.z, ry), tr(0, 0, 0, 0, .25)))); wires.push(box(.05, .05, .05, '#1e1a1e', mul(tr(p.x, p.y + .1, p.z, ry), tr(0, 0, .06)))); } }
        }
        break;
      }
    }
  }
  // stairs between terrace levels on walkable cells
  for (const L of G.cells) {
    if (!walkable(L) || L.water) continue;
    DIRS.forEach(([dx, dz], di) => {
      const U = cellAt(L.i + dx, L.j + dz);
      if (!U || U.water || !walkable(U) || U.lvl !== L.lvl + 1) return;
      const R = rng(L.seed * 3 + di), lat = (R() - .5) * .7, px = -dz, pz = dx, base = L.lvl * LV, col = jit('#9a8c7c', R, .05);
      for (let k = 0; k < 5; k++) { const h = (k + 1) * LV / 5, o = 1 - .1 - (4 - k) * .2; stairs.push(box(dx ? .2 : .9, h, dx ? .9 : .2, col, tr(wx(L.i) + dx * o + px * lat, base + h / 2, wx(L.j) + dz * o + pz * lat))); }
      for (const s of [-.47, .47]) { const a = new THREE.Vector3(wx(L.i) + dx * .05 + px * (lat + s), base + .45, wx(L.j) + dz * .05 + pz * (lat + s)), b = new THREE.Vector3(wx(L.i) + dx * 1 + px * (lat + s), base + LV + .45, wx(L.j) + dz * 1 + pz * (lat + s)); wires.push(paint(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, .02, 4), '#2a2622')); for (const u of [0, 1]) { const p = a.clone().lerp(b, u); wires.push(box(.03, .45, .03, '#2a2622', tr(p.x, p.y - .22, p.z))); } }
    });
  }
  buildStreets(stairs, wires);
  const festLit = [];
  if ((typeof festActive === 'function' && festActive()) || (typeof G.g2Summer !== 'undefined' && G.g2Summer)) {
    const R3 = rng(G.day * 7 + 3);
    for (const c of G.cells) { if (c.floors < 1) continue; for (const [dx, dz] of [[1, 0], [0, 1]]) for (let k = 2; k <= 4; k++) { const t = cellAt(c.i + dx * k, c.j + dz * k); if (!t) break; let ok = true; for (let q = 1; q < k; q++) if (cellAt(c.i + dx * q, c.j + dz * q).floors > 0) ok = false; if (!ok) break; if (t.floors < 1) continue; const y = Math.min(eave(c), eave(t)) - .25; if (y < Math.max(topY(c), topY(t)) + .7) break; bunting(wires, festLit, new THREE.Vector3(wx(c.i) + dx * .82, y, wx(c.j) + dz * .82), new THREE.Vector3(wx(t.i) - dx * .82, y, wx(t.j) - dz * .82), k, R3); break; } }
    for (const c of G.cells) if (c.kind === 'plaza') { const x = wx(c.i), z = wx(c.j), y = topY(c); wires.push(cyl(.02, .02, 1.6, '#2a2622', tr(x, y + .8, z), 5)); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; bunting(wires, festLit, new THREE.Vector3(x, y + 1.55, z), new THREE.Vector3(x + Math.cos(a) * .95, y + .9, z + Math.sin(a) * .95), 1, R3); } }
  }
  if (typeof landmarkDecor === 'function') landmarkDecor(wires);
  if (typeof storyDecor === 'function') storyDecor(wires, festLit);
  if (G.day > 0 && effWeather() !== 'snow' && (typeof G.g2Autumn === 'undefined' || G.g2Autumn)) { const R4_ = rng(G.day * 13 + 1), n = Math.min(10, G.day * 2); for (const c of G.cells) { if (!walkable(c) || c.water) continue; for (let q = 0; q < n; q++) { const x = wx(c.i) + (R4_() - .5) * 1.9, z = wx(c.j) + (R4_() - .5) * 1.9; wires.push(box(.07, .006, .05, pick(R4_, ['#c4502b', '#d9772b', '#e0a23a', '#8e3a2a']), tr(x, c.lvl * LV + .03, z, R4_() * 6))); } } }
  { const op = [], ol = [], of = []; try { ownDecor(op, ol, of); } catch (e) { console.warn(e); } if (op.length) laundryG.add(mkMesh(op, plainMat, true)); if (ol.length) laundryG.add(mkMesh(ol, labelMat, false)); if (of.length) laundryG.add(mkMesh(of, flagMat, true)); }
  if (festLit.length) laundryG.add(mkMesh(festLit, litMat, false));
  if (g.length) laundryG.add(mkMesh(g, swayMat, true));
  if (wires.length) laundryG.add(mkMesh(wires, plainMat, true));
  { const pl = [], bo = [], ro = []; buildJoins(pl, bo, ro); if (bo.length) laundryG.add(mkMesh(bo, bodyMat, true)); if (ro.length) laundryG.add(mkMesh(ro, roofMat, true)); if (pl.length) laundryG.add(mkMesh(pl, plainMat, true)); }
  if (stairs.length) laundryG.add(mkMesh(stairs, stoneMat, true));
}

function buildTree(c) {
  const R = rng(c.seed * 31 + 3), plain = [];
  const r0 = R(), sp = c.species || (r0 < .5 ? 'plane' : r0 < .7 ? 'cypress' : r0 < .85 ? 'orange' : 'palm');
  const blob = (r, col, m, det = 1) => { const g = paint(new THREE.IcosahedronGeometry(r, det), col); g.applyMatrix4(m); plain.push(g); };
  const S3 = (x, y, z, sx, sy, sz) => mul(tr(x, y, z, R() * 6), new THREE.Matrix4().makeScale(sx, sy, sz));
  if (sp === 'plane') {
    const bare = R() < .2, h = 1.5 + R() * 1.3, bark = '#8a7a62';
    plain.push(cyl(.06, .13, h, bark, tr(0, h / 2, 0), 7));
    for (let k = 0; k < 5; k++) plain.push(box(.09, .14 + R() * .2, .03, pick(R, ['#c8b898', '#6a5a48', '#a89878']), mul(tr(0, .3 + R() * (h - .5), 0, R() * 6.28), tr(0, 0, .09 - k * .004))));
    for (let b = 0; b < 5; b++) { const ang = R() * 6.28, tilt = .45 + R() * .45, l = .6 + R() * .7; plain.push(cyl(.02, .055, l, bark, mul(tr(0, h * (.5 + R() * .4), 0, ang), mul(tr(0, 0, 0, 0, tilt), tr(0, l / 2, 0))))); }
    if (!bare) {
      const base = pick(R, ['#d9772b', '#c4502b', '#e0a23a', '#a8432b', '#b8862e', '#8a8a3a']), cB = new THREE.Color(base);
      const dark = cB.clone().multiplyScalar(.62), hi = cB.clone().lerp(new THREE.Color('#ffd890'), .35);
      for (let k = 0; k < 6; k++) blob(.36 + R() * .22, jit('#' + dark.getHexString(), R, .06), S3((R() - .5) * 1, h * .72 + R() * .5, (R() - .5) * 1, 1, .78, 1));
      for (let k = 0; k < 7; k++) blob(.28 + R() * .2, jit(base, R, .08), S3((R() - .5) * 1.2, h * .8 + R() * .8, (R() - .5) * 1.2, 1, .8, 1));
      for (let k = 0; k < 5; k++) blob(.16 + R() * .12, jit('#' + hi.getHexString(), R, .06), S3((R() - .5) * .9 + .15, h * .95 + R() * .75, (R() - .5) * .9 - .1, 1, .8, 1));
    }
  } else if (sp === 'cypress') {
    const h = 2.4 + R() * 1.3;
    plain.push(cyl(.04, .07, .5, '#4a3628', tr(0, .25, 0)));
    for (let k = 0; k < 7; k++) { const u = k / 6, r = .42 * (1 - u * .78) + .06; blob(r, jit(pick(R, ['#3f5a2e', '#4a6634', '#38502a']), R, .06), S3((R() - .5) * .08, .45 + u * (h - .6), (R() - .5) * .08, 1, 1.7, 1)); }
    for (let k = 0; k < 4; k++) { const u = R() * .8; blob(.14, jit('#6f8a42', R, .08), S3(.12 * (1 - u), .5 + u * h * .9, -.08, 1, 1.5, 1)); }
  } else if (sp === 'orange') {
    for (const [x, z, s] of [[-.35, -.3, 1], [.45, .35, .8]]) {
      plain.push(cyl(.32 * s, .24 * s, .42 * s, '#b0583a', tr(x, .21 * s, z), 10)); plain.push(cyl(.35 * s, .35 * s, .07 * s, '#c86a48', tr(x, .42 * s, z), 10));
      plain.push(cyl(.03, .045, .7 * s, '#4a3628', tr(x, .7 * s, z)));
      blob(.42 * s, jit('#3f6a2a', R, .06), S3(x, 1.18 * s, z, 1, .85, 1));
      blob(.3 * s, jit('#5a8a36', R, .06), S3(x + .08, 1.3 * s, z - .06, 1, .8, 1));
      for (let k = 0; k < 9; k++) { const a = R() * 6.28, e = (R() - .3) * 1.2; blob(.055 * s + .01, jit('#f08a1a', R, .05), tr(x + Math.cos(a) * Math.cos(e) * .42 * s, 1.18 * s + Math.sin(e) * .34 * s, z + Math.sin(a) * Math.cos(e) * .42 * s), 0); }
    }
  } else { // palm
    const segs = 7, lean = (R() - .5) * .5, lz = (R() - .5) * .4; let x = 0, y = 0, z = 0;
    for (let k = 0; k < segs; k++) { const sl = .42, nx = x + lean * .12 * (k / segs + .3), nz = z + lz * .1; plain.push(cyl(.07 - k * .004, .085 - k * .004, sl, k % 2 ? '#7a6248' : '#8a7058', mul(tr((x + nx) / 2, y + sl / 2, (z + nz) / 2), new THREE.Matrix4().makeRotationZ(-lean * .25)), 7)); x = nx; z = nz; y += sl * .98; }
    for (let f = 0; f < 9; f++) { const a = f / 9 * 6.283 + R() * .3, L = .9 + R() * .4, col = jit(pick(R, ['#5a7a32', '#6f8a3a', '#4a6a2a']), R, .05);
      for (let q = 0; q < 2; q++) { const m = mul(tr(x, y + .05, z, a), mul(tr(0, 0, 0, 0, 0, q ? -.6 : .25), tr(L * (q ? .78 : .25), q ? -L * .22 : 0, 0))); plain.push(box(L * .55, .02, .26 - q * .08, col, m)); } }
    blob(.12, '#6a4a2a', tr(x, y - .02, z), 0);
  }
  plain.forEach(g => { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = Math.max(0, p.getY(i) - .5) * (sp === 'palm' ? .07 : sp === 'cypress' ? .03 : .05); g.setAttribute('sway', new THREE.BufferAttribute(a, 1)); });
  return {sway: plain, glows: []};
}
function buildLamp(c) {
  const plain = [], lit = [];
  if (c?.broken) { plain.push(cyl(.035, .06, 1.5, '#262422', tr(.15, .72, 0, 0, 0, -.22))); plain.push(box(.14, .2, .14, '#3a3a40', tr(.5, 1.25, 0))); plain.push(box(.1, .02, .1, '#9aa0a8', tr(.3, .01, .15))); return {plain, glows: []}; }
  plain.push(cyl(.035, .06, 1.5, '#262422', tr(0, .75, 0)));
  plain.push(box(.4, .03, .03, '#262422', tr(.18, 1.45, 0)));
  plain.push(box(.2, .05, .2, '#262422', tr(.34, 1.5, 0)));
  lit.push(setAttr(box(.14, .2, .14, '#fff', tr(.34, 1.36, 0)), 'lthr', .1));
  const gv = new THREE.Vector3(.34, 1.36, 0); gv.thr = .1;
  return {plain, lit, glows: [gv]};
}
function buildBridge(c) {
  const plain = [], body = [];
  const col = '#8b7d6e';
  body.push(box(1.3, .22, S, col, tr(0, .05, 0)));
  for (const s of [-.6, .6]) body.push(box(.1, .3, S, col, tr(s, .3, 0)));
  const arch = paint(new THREE.TorusGeometry(.62, .12, 6, 14, Math.PI), col); arch.applyMatrix4(tr(0, -.55, 0, Math.PI / 2)); body.push(arch);
  return {body, plain, glows: []};
}

function buildPlaza(c) {
  const R = rng(c.seed * 5 + 9), plain = [], body = [];
  if (c.statue) { body.push(box(.6, .5, .6, '#b8aa98', tr(0, .25, 0))); body.push(box(.68, .06, .68, '#d8ccb4', tr(0, .52, 0))); const br = '#6a5a3a'; plain.push(cyl(.06, .09, .4, br, tr(0, .75, 0), 8)); plain.push(paint(new THREE.SphereGeometry(.07, 8, 6), br).applyMatrix4(tr(0, 1.02, 0))); plain.push(box(.04, .32, .04, br, tr(.12, 1.02, 0, 0, 0, -.6))); plain.push(box(.04, .25, .04, br, tr(-.1, .82, 0, 0, 0, .2))); plain.push(box(.16, .02, .2, br, tr(.24, 1.17, 0))); }
  else { body.push(cyl(.55, .6, .22, '#b8aa98', tr(0, .11, 0), 16)); plain.push(cyl(.48, .48, .02, '#4a8a96', tr(0, .2, 0), 16));
  body.push(cyl(.08, .12, .55, '#b8aa98', tr(0, .4, 0), 8)); body.push(cyl(.22, .12, .08, '#b8aa98', tr(0, .7, 0), 12)); plain.push(cyl(.18, .18, .02, '#5a9aa6', tr(0, .74, 0), 12)); }
  for (const [x, z, ry] of [[0, .82, Math.PI], [0, -.82, 0]]) { const pm = tr(x, 0, z, ry); plain.push(box(.62, .05, .2, '#6a4a30', mul(pm, tr(0, .22, 0)))); plain.push(box(.62, .16, .04, '#6a4a30', mul(pm, tr(0, .36, -.09)))); for (const bx of [-.26, .26]) plain.push(box(.04, .22, .2, '#2a2622', mul(pm, tr(bx, .11, 0)))); }
  for (const [x, z] of [[.75, .75], [-.75, -.75]]) { plain.push(cyl(.14, .11, .2, '#a0583a', tr(x, .1, z), 8)); plain.push(paint(new THREE.IcosahedronGeometry(.2, 0), '#5f7a35').applyMatrix4(tr(x, .34, z))); }
  const sway = []; for (const [x, z] of [[.78, -.78], [-.78, .78]]) { plain.push(cyl(.04, .07, .9, '#5a4232', tr(x, .45, z), 6)); const base = pick(R, ['#d9772b', '#c4502b', '#e0a23a', '#6f8a3a']); for (let q = 0; q < 4; q++) sway.push(paint(new THREE.IcosahedronGeometry(.24 + R() * .1, 1), jit(base, R, .08)).applyMatrix4(tr(x + (R() - .5) * .3, 1.05 + R() * .3, z + (R() - .5) * .3))); }
  sway.forEach(g => { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = Math.max(0, p.getY(i) - .5) * .05; g.setAttribute('sway', new THREE.BufferAttribute(a, 1)); });
  const lbls = [], pk = c.i * N + c.j; plain.push(box(.07, .34, .18, '#8a7a64', tr(.84, .17, 0))); plain.push(box(.06, .17, .54, '#b8aa98', tr(.86, .41, 0))); lbls.push(labelGeo('plaza:' + pk, plazaName(c), {kind: 'stone'}, .52, .15).applyMatrix4(tr(.894, .41, 0, Math.PI / 2)));
  if (c.statue) lbls.push(labelGeo('statue', OWN.statue || (OWN.mayor ? 'Mayor ' + OWN.mayor.name : townName()), {kind: 'brass'}, .5, .1).applyMatrix4(tr(0, .27, .325)));
  return {plain, body, sway, glows: [], lbls};
}
function distCob(c) { return ({old: '#c8ae86', river: '#a9b4b4', market: '#c79a86'})[c.dist] || '#b8aa98'; }
function rebuildTerrain(c) {
  if (c.tmesh) { terrainG.remove(c.tmesh); c.tmesh.traverse(o => o.geometry && o.geometry.dispose()); c.tmesh = null; }
  if (c.water) return;
  const R = rng(c.seed + 5), h = (c.lvl + 1) * LV;
  const m = mkMesh([box(S, h, S, jit('#a89a88', R, .05), tr(0, -LV + h / 2, 0))], stoneMat, true);
  const wild = c.owned === false, top = wild ? mkMesh([box(S - .02, .05, S - .02, jit('#6f7a48', R, .08), tr(0, c.lvl * LV + .02, 0)), ...Array.from({length: 4}, () => paint(new THREE.IcosahedronGeometry(.15 + R() * .15, 0), jit('#5a6a35', R, .1)).applyMatrix4(mul(tr((R() - .5) * 1.6, c.lvl * LV + .1, (R() - .5) * 1.6), new THREE.Matrix4().makeScale(1, .6, 1))))], plainMat, true) : mkMesh([box(S - .02, .03, S - .02, jit(distCob(c), R, .05), tr(0, c.lvl * LV + .01, 0))], cobbleMat, false); top.userData.cell = c; m.add(top); m.position.set(wx(c.i), 0, wx(c.j)); m.userData.cell = c; { const dr = terrainDressing(c); if (dr) m.add(dr); } terrainG.add(m); c.tmesh = m;
}
function rebuildObj(c) {
  if (c.obj) { objG.remove(c.obj); c.obj.traverse(o => o.geometry && o.geometry.dispose()); c.obj = null; }
  let parts = null;
  if (c.floors > 0) parts = buildHouse(c);
  else if (c.kind === 'tree') parts = buildTree(c);
  else if (c.kind === 'lamp') parts = buildLamp(c);
  else if (c.kind === 'bridge') parts = buildBridge(c);
  else if (c.kind === 'plaza') parts = buildPlaza(c);
  else if (c.kind === 'church') parts = buildChurch(c);
  c.glows = []; c.chims = [];
  if (!parts) return;
  if (c.floors > 0) { const y = buildYard(c); parts.sway = [...(parts.sway || []), ...y.sway]; parts.plain = [...(parts.plain || []), ...y.plain]; parts.glows = [...(parts.glows || []), ...y.glows]; }
  const g = new THREE.Group();
  if (c.floors > 0) houseLit(c);
  if (parts.shopGlass?.length) { const im = mkMesh(parts.shopGlass, interiorMat(c), false); im.layers.enable(1); g.add(im); }
  [[parts.sway, swayMat], [parts.brick, brickMat, false], [parts.tile, azMat, false], [parts.body, bodyMat], [parts.roof, roofMat], [parts.plain, plainMat], [parts.lit, c.floors > 0 ? houseLit(c) : litMat, false], [parts.dark, darkMat, false], [parts.sign, signMat, false]].forEach(([geos, mat, cast]) => { if (geos && geos.length) g.add(mkMesh(geos, mat, cast !== false)); });
  if (parts.flutter?.length) g.add(mkMesh(parts.flutter, flutterMat, true));
  if (parts.lbls?.length) g.add(mkMesh(parts.lbls, labelMat, false));
  c.swing = null; c.plate = null;
  if (parts.swing) { const h = new THREE.Group(); h.matrixAutoUpdate = false; h.matrix.copy(parts.swing.m); const sw = new THREE.Group(); sw.add(mkMesh(parts.swing.plain, plainMat, true)); const sm = mkMesh(parts.swing.sign, signMat, false); sm.layers.enable(1); sw.add(sm); h.add(sw); g.add(h); c.swing = sw; }
  c.pole = null; if (parts.pole) { const h = new THREE.Group(); h.matrixAutoUpdate = false; h.matrix.copy(parts.pole.m); const pm_ = mkMesh(parts.pole.g, plainMat, false); h.add(pm_); g.add(h); c.pole = pm_; }
  if (parts.plate) { const h = new THREE.Group(); h.matrixAutoUpdate = false; h.matrix.copy(parts.plate.m); const pm_ = mkMesh(parts.plate.g, plainMat, false); h.add(pm_); g.add(h); c.plate = pm_; }
  c.grille = null;
  if (parts.shop) {
    const gg = [box(parts.shop.sw + .06, .74, .02, '#7c7a74', tr(0, -.37, 0))]; for (let q = 0; q < 9; q++) gg.push(box(parts.shop.sw + .07, .012, .025, '#5c5a56', tr(0, -.04 - q * .08, 0)));
    const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.matrix.copy(parts.shop.m); const gm = mkMesh(gg, plainMat, false); holder.add(gm); g.add(holder); c.grille = gm;
  }
  const y = c.kind === 'bridge' ? 0 : topY(c);
  g.position.set(wx(c.i), y, wx(c.j)); g.userData.cell = c;
  if (c.floors > 0) { const J = rng(c.seed * 3 + 11); g.position.x += (J() - .5) * .1; g.position.z += (J() - .5) * .1; g.rotation.y = (J() - .5) * .07; }
  g.traverse(o => o.userData.cell = c);
  objG.add(g); c.obj = g; hookMap(g, c);
  c.glows = parts.glows.map(v => { const w = warpV(v.clone().applyMatrix4(g.matrixWorld)); w.thr = v.thr ?? .2; return w; });
  c.chims = (parts.chims || []).map(v => warpV(v.clone().applyMatrix4(g.matrixWorld)));
}


/* ---- shop window displays: modelled goods per shop type ---- */
function windowGoods(type, em, sw, R, out) {
  const W = sw - .32, x0 = -sw / 2 + .12, y = -.3, z = .07, n = 7, X = q => x0 + q * W / (n - 1);
  const at = (x, yy, zz, ry = 0, rx = 0, rz = 0) => mul(em, tr(x, yy, zz, ry, rx, rz));
  const S = (r, w, h, col, m, sx = 1, sy = 1, sz = 1) => paint(new THREE.SphereGeometry(r, w, h), col).applyMatrix4(mul(m, new THREE.Matrix4().makeScale(sx, sy, sz)));
  out.push(box(W + .14, .02, .12, '#4a3020', at(x0 + W / 2, y - .025, z)));
  out.push(box(W + .14, .012, .012, '#2a2622', at(x0 + W / 2, y - .04, z + .06)));
  switch (type) {
    case 'bakery': for (let q = 0; q < n; q++) { if (q % 2) out.push(paint(new THREE.TorusGeometry(.022, .011, 5, 8, Math.PI * 1.25), pick(R, ['#d9a654', '#c8904a'])).applyMatrix4(at(X(q), y + .012, z, 0, -Math.PI / 2, R()))); else out.push(S(.03, 7, 5, pick(R, ['#c8904a', '#b8783a', '#e0b070']), at(X(q), y + .018, z, R() * .5), 1.9, .75, 1)); }
      out.push(cyl(.06, .06, .008, '#f0ece4', at(X(3), y + .07, z - .01), 10)); out.push(cyl(.008, .008, .07, '#c9a33f', at(X(3), y + .035, z - .01), 5)); break;
    case 'grocer': for (let q = 0; q < 4; q++) { const x = X(q * 2); out.push(box(.08, .045, .07, '#8a6a42', at(x, y + .02, z, 0, -.12))); const fc = pick(R, ['#d9472b', '#7aa33a', '#e8a23a', '#c0302a', '#e8d040']); for (let k = 0; k < 5; k++) out.push(S(.016, 5, 4, fc, at(x - .024 + (k % 3) * .024, y + .053 + Math.floor(k / 3) * .012, z - .012 + Math.floor(k / 3) * .02))); } break;
    case 'fish': out.push(box(W + .06, .02, .1, '#e8f0f4', at(x0 + W / 2, y + .008, z))); for (let q = 0; q < n; q++) { const col = pick(R, ['#a8b4bc', '#c0ccd4', '#8a9aa8', '#d0a090']); out.push(S(.02, 6, 4, col, at(X(q), y + .028, z, .4 + R() * .3), 2.2, .55, .8)); out.push(paint(new THREE.ConeGeometry(.014, .024, 4), col).applyMatrix4(at(X(q) - .05, y + .028, z - .02, .4, 0, Math.PI / 2))); } break;
    case 'florist': for (let q = 0; q < 5; q++) { const x = X(q * 1.5); out.push(cyl(.024, .02, .05, '#9aa4ac', at(x, y + .025, z), 8)); const fc = pick(R, ['#d94f3d', '#f2a1b1', '#e8c34a', '#f4f0e8', '#8a4ab0']); for (let k = 0; k < 6; k++) { const a = k * 1.1; out.push(box(.004, .07, .004, '#3f6a2f', at(x + Math.cos(a) * .012, y + .085, z + Math.sin(a) * .012, 0, Math.cos(a) * .2, Math.sin(a) * .2))); out.push(S(.012, 5, 4, fc, at(x + Math.cos(a) * .02, y + .125, z + Math.sin(a) * .02))); } } break;
    case 'books': { let x = x0 - .02; while (x < x0 + W) { const h = .07 + R() * .04, w = .012 + R() * .01; out.push(box(w, h, .06, pick(R, ['#8a3a2a', '#2f5f6f', '#c9a33f', '#e8dcc0', '#3f6a4f', '#5a4a7a', '#b86a3a']), at(x, y + h / 2, z, 0, 0, R() < .15 ? .25 : 0))); x += w + .003 + (R() < .12 ? .05 : 0); } break; }
    case 'cafe': out.push(cyl(.05, .05, .006, '#f0ece4', at(X(1), y + .05, z), 10)); out.push(cyl(.006, .006, .05, '#c9a33f', at(X(1), y + .025, z), 4)); out.push(cyl(.034, .034, .04, '#8a4a2a', at(X(1), y + .073, z), 10)); out.push(cyl(.035, .035, .008, '#f4ecdc', at(X(1), y + .096, z), 10));
      for (const q of [3, 4, 5]) { out.push(cyl(.012, .01, .02, '#f4f0e8', at(X(q), y + .01, z), 8)); out.push(cyl(.018, .018, .003, '#f4f0e8', at(X(q), y, z), 8)); } out.push(S(.025, 7, 5, '#d9a654', at(X(6), y + .015, z), 1.4, .8, 1.4)); break;
    case 'tasca': case 'winebar': for (let q = 0; q < n; q++) { const col = pick(R, type === 'winebar' ? ['#2f4a2f', '#5a1f2f', '#1e2a24'] : ['#2f5a3a', '#6a2a2a', '#c9a33f']); out.push(cyl(.016, .016, .07, col, at(X(q), y + .035, z), 7)); out.push(cyl(.006, .012, .035, col, at(X(q), y + .088, z), 6)); out.push(cyl(.0165, .0165, .022, '#e8dcc0', at(X(q), y + .03, z), 7)); } break;
    case 'pharmacy': for (let q = 0; q < n; q++) { out.push(cyl(.014, .014, .045, pick(R, ['#f4f4f4', '#c8803a', '#e8e0d0']), at(X(q), y + .022, z), 7)); out.push(cyl(.015, .015, .01, pick(R, ['#2f7a4a', '#d94f3d', '#f4f4f4']), at(X(q), y + .05, z), 7)); } break;
    case 'barber': for (let q = 0; q < 3; q++) out.push(cyl(.014, .014, .05, pick(R, ['#2f5ea8', '#f4f0e8', '#c0302a']), at(X(q * 3), y + .025, z), 7)); out.push(box(.12, .1, .01, '#c8d4dc', at(X(4), y + .05, z - .03))); break;
    default: { const goods = {cinema: ['#c9a33f', '#b8342a', '#1e1e2a']}[type] || ['#c9a33f', '#e8dcc0']; for (let q = 0; q < n; q++) out.push(box(.06, .05 + R() * .05, .05, pick(R, goods), at(X(q), y + .03, z))); }
  }
}
/* scalloped awning valance: fluttering fabric */
function scallops(em, aw, a1, a2, out) {
  const n = 14, st = aw / n, r = st / 2;
  out.push(box(aw, .045, .012, a1, mul(em, tr(0, .262, .522))));
  for (let k = 0; k < n; k++) out.push(paint(new THREE.CylinderGeometry(r, r, .012, 7, 1, false, -Math.PI / 2, Math.PI), k % 2 ? a2 : a1).applyMatrix4(mul(em, mul(tr(-aw / 2 + st * (k + .5), .24, .522), new THREE.Matrix4().makeRotationX(Math.PI / 2)))));
}
const flutterU = {uTime: {value: 0}, uWind: {value: 1}};
const flutterMat = new THREE.MeshToonMaterial({vertexColors: true, gradientMap: grad, side: THREE.DoubleSide});
flutterMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, flutterU);
  sh.vertexShader = 'uniform float uTime,uWind;varying vec3 vFW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n{vec4 wp=modelMatrix*vec4(transformed,1.);float f=(sin(uTime*3.1+(wp.x+wp.z)*7.)*.010+sin(uTime*5.3+wp.x*13.+wp.z*5.)*.005)*uWind;transformed.y+=f;transformed.x+=f*.5;vFW=wp.xyz;}');
  sh.fragmentShader = 'varying vec3 vFW;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n{float wv=step(.5,fract((vFW.x+vFW.z)*90.))*step(.5,fract(vFW.y*90.));diffuseColor.rgb*=.95+.07*wv;}'); };
flutterMat.customProgramCacheKey = () => 'flutter';
/* wood grain on painted wood / timber props (subtle, world space) */
{ const prev = plainMat.onBeforeCompile, key = plainMat.customProgramCacheKey;
  plainMat.onBeforeCompile = (sh, r) => { if (prev) prev.call(plainMat, sh, r);
    sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = 'varying vec3 vGW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {vec3 c=diffuseColor.rgb;float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b));
       float wood=step(c.b*1.6,c.r)*step(c.g*1.15,c.r)*smoothstep(.015,.06,mx-mn)*(1.-smoothstep(.3,.5,mx));
       float g=sin((vGW.x+vGW.z)*48.+sin(vGW.y*7.+vGW.x*2.3)*2.5)*.5+.5;g=g*g;
       float knot=smoothstep(.92,1.,sin(vGW.x*9.1+vGW.y*3.)*sin(vGW.z*8.3-vGW.y*2.));
       diffuseColor.rgb*=1.-wood*(.13*g+.12*knot);}`); };
  plainMat.customProgramCacheKey = () => (key ? key.call(plainMat) : 'plain') + '-grain'; plainMat.needsUpdate = true; }
/* steam from coffee cups and bakery doors */
const STEAMN = 90, steamPos = new Float32Array(STEAMN * 3), steamLife = new Float32Array(STEAMN), steamSrc = [];
const steamGeo = new THREE.BufferGeometry(); steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({size: .09, map: glowTex('rgba(255,255,255,1)'), transparent: true, opacity: .32, depthWrite: false, color: 0xf4efe6}));
steam.frustumCulled = false; scene.add(steam);
let steamK = 0;
function updateShopLife(t, dt) {
  flutterU.uTime.value = t; flutterU.uWind.value = 1 + (typeof wetAmt !== 'undefined' ? wetAmt * 2.5 : 0);
  steamSrc.length = 0;
  for (const b of G.businesses) {
    const c = b.cell, open = b.open > .5;
    if (c.swing) c.swing.rotation.z = Math.sin(t * 1.4 + (c.seed % 17)) * (.05 + flutterU.uWind.value * .03) + Math.sin(t * 3.7 + c.seed) * .015;
    if (c.pole && open) c.pole.rotation.y = t * 1.6;
    if (c.plate) c.plate.rotation.y += ((open ? 0 : Math.PI) - c.plate.rotation.y) * Math.min(1, dt * 4);
    if (b.furnOpen) { b.furnOpen.visible = open; b.furnClosed.visible = !open; }
    if (b.type === 'cafe' && open) for (const s of b.seats || []) if (s.by) steamSrc.push(s.pos);
    if ((b.type === 'bakery' && open && G.hour < 11) && b.door) steamSrc.push(b.door);
  }
  const p = steamPos;
  for (let i = 0; i < STEAMN; i++) {
    steamLife[i] -= dt * .45;
    if (steamLife[i] <= 0) { if (!steamSrc.length) { p[i * 3 + 1] = -99; continue; } const s = steamSrc[(steamK++) % steamSrc.length]; steamLife[i] = 1; p[i * 3] = s.x + (Math.random() - .5) * .06; p[i * 3 + 1] = s.y + .45; p[i * 3 + 2] = s.z + (Math.random() - .5) * .06; }
    p[i * 3] += Math.sin(t * 2 + i) * dt * .03; p[i * 3 + 1] += dt * .12; p[i * 3 + 2] += Math.cos(t * 1.7 + i) * dt * .03;
  }
  steamGeo.attributes.position.needsUpdate = true;
}

/* ---------- glows & leaves ---------- */
const glowGeo = new THREE.BufferGeometry();
const glowU = {uNight: litU.uNight, uTime: litU.uTime, uScale: {value: 400}, map: {value: glowTex('rgba(255,235,180,1)')}};
const glowMat = new THREE.ShaderMaterial({uniforms: glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float thr,occ;uniform float uNight,uTime,uScale;varying float vA;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=(thr<0.?occ*.7:smoothstep(thr,thr+.06,uNight)*occ)*(.8+.2*sin(uTime*(2.+thr*9.)+thr*90.));gl_PointSize=1.2*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform sampler2D map;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(t.rgb*vec3(1.,.69,.38),t.a*t.a*vA*.85);}`});
const chims = [], glowRefs = [];
const glowPts = new THREE.Points(glowGeo, glowMat); glowPts.frustumCulled = false; scene.add(glowPts);
function rebuildGlows() {
  const arr = [], th = []; chims.length = 0; glowRefs.length = 0;
  G.cells.forEach(c => { c.glows && c.glows.forEach(v => { arr.push(v.x, v.y, v.z); th.push(v.thr); glowRefs.push([c, v.thr]); }); c.chims && c.chims.forEach(v => { v.cell = c; chims.push(v); }); });
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); glowGeo.setAttribute('thr', new THREE.Float32BufferAttribute(th, 1)); glowGeo.setAttribute('occ', new THREE.Float32BufferAttribute(new Float32Array(th.length).fill(1), 1)); glowGeo.computeBoundingSphere();
}
const LEAVES = 420, leafPos = new Float32Array(LEAVES * 3), leafCol = new Float32Array(LEAVES * 3), leafSeed = new Float32Array(LEAVES);
{ const R = rng(7); for (let i = 0; i < LEAVES; i++) { leafPos.set([(R() - .5) * 40, R() * 16, (R() - .5) * 40], i * 3); const c = new THREE.Color(pick(R, ['#d9772b', '#c4502b', '#e0a23a', '#8e3a2a'])); leafCol.set([c.r, c.g, c.b], i * 3); leafSeed[i] = R() * 100; } }
const leafGeo = new THREE.BufferGeometry();
leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3)); leafGeo.setAttribute('color', new THREE.BufferAttribute(leafCol, 3));
const leafMat = new THREE.PointsMaterial({size: .22, map: leafTex, vertexColors: true, alphaTest: .5, transparent: false});
const leaves = new THREE.Points(leafGeo, leafMat); leaves.frustumCulled = false; scene.add(leaves);

export {LEAVES, archOf, chims, glowGeo, glowRefs, glowU, laundryG, leafCol, leafGeo, leafPos, leafSeed, leaves, rebuildGlows, rebuildLaundry, rebuildObj, rebuildTerrain, scallops, updateShopLife, windowGoods};
