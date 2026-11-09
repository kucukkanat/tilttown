import './visuals.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {FH, N, box, cyl, jit, mul, paint, pick, setAttr, tr} from '../core/util.js';
import {WOBGL, camera, controls, grad, litU, renderer, scene, topY, wx} from '../core/scene.js';
import {scallops, windowGoods} from './houses.js';
import {BIZ, SHOPCOL} from './streets.js';
import {OWN, SPECS, hex, labelGeo} from '../game/identity.js';
import {warpV} from './organic.js';
import {wobPatch} from './visuals.js';
import {postU, rt} from '../render/post.js';
import {say} from '../ui/input.js';

G.mapColOf = mapColOf; // reassignable: other modules wrap it
G.buildMapUI = buildMapUI; // reassignable: other modules wrap it
/* ==========================================================================
   SHOP IDENTITY: colours, icon atlas, hanging signs, map mode
   ========================================================================== */
const SHOP_ORDER = ['cafe', 'bakery', 'grocer', 'tasca', 'fish', 'florist', 'books', 'barber', 'pharmacy', 'winebar', 'cinema', 'bnb'];
const ICON_ATLAS = (() => {
  const T = 128, cv = document.createElement('canvas'); cv.width = T * 4; cv.height = T * 3; const x = cv.getContext('2d');
  SHOP_ORDER.forEach((type, n) => {
    const ox = (n % 4) * T, oy = Math.floor(n / 4) * T, [col] = SHOPCOL[type];
    x.save(); x.translate(ox + T / 2, oy + T / 2);
    x.fillStyle = '#f3e6cc'; x.beginPath(); x.arc(0, 0, 58, 0, 6.3); x.fill();
    x.lineWidth = 9; x.strokeStyle = col; x.beginPath(); x.arc(0, 0, 53, 0, 6.3); x.stroke();
    x.fillStyle = x.strokeStyle = '#2a1d16'; x.lineWidth = 6; x.lineCap = x.lineJoin = 'round';
    const P = (pts, fill) => { x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); fill ? x.fill() : x.stroke(); };
    switch (type) {
      case 'cafe': x.beginPath(); x.moveTo(-26, -8); x.lineTo(22, -8); x.lineTo(16, 22); x.lineTo(-20, 22); x.closePath(); x.fill(); x.beginPath(); x.arc(26, 4, 9, -1.4, 1.4); x.stroke(); P([[-34, 30], [32, 30]]);
        for (const s of [-12, 0, 12]) { x.beginPath(); x.moveTo(s, -16); x.bezierCurveTo(s - 7, -24, s + 7, -30, s, -38); x.stroke(); } break;
      case 'bakery': x.beginPath(); x.ellipse(0, 4, 36, 20, 0, 0, 6.3); x.fill(); x.strokeStyle = '#f3e6cc'; x.lineWidth = 5; for (const s of [-16, 0, 16]) P([[s - 6, -8], [s + 6, 16]]); break;
      case 'grocer': x.fillStyle = col; x.beginPath(); x.arc(-9, 8, 22, 0, 6.3); x.arc(11, 8, 22, 0, 6.3); x.fill(); x.fillStyle = '#2a1d16'; P([[2, -12], [6, -30]]); x.fillStyle = '#5f8a3a'; x.beginPath(); x.ellipse(16, -26, 12, 6, -.5, 0, 6.3); x.fill(); break;
      case 'tasca': P([[-14, -34], [-14, 34]]); for (const s of [-24, -14, -4]) P([[s, -34], [s, -12]]); P([[-24, -12], [-4, -12]]); x.beginPath(); x.moveTo(16, 34); x.lineTo(16, -34); x.quadraticCurveTo(32, -20, 26, 4); x.lineTo(16, 4); x.fill(); break;
      case 'fish': x.fillStyle = col; x.beginPath(); x.ellipse(-6, 0, 28, 16, 0, 0, 6.3); x.fill(); P([[18, 0], [36, -16], [36, 16]], true); x.fillStyle = '#f3e6cc'; x.beginPath(); x.arc(-20, -4, 4, 0, 6.3); x.fill(); break;
      case 'florist': x.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; x.beginPath(); x.arc(Math.cos(a) * 17, Math.sin(a) * 17 - 6, 13, 0, 6.3); x.fill(); } x.fillStyle = '#e8b830'; x.beginPath(); x.arc(0, -6, 9, 0, 6.3); x.fill(); x.strokeStyle = '#4f7a32'; P([[0, 14], [0, 40]]); break;
      case 'books': x.fillStyle = col; x.beginPath(); x.moveTo(0, -18); x.quadraticCurveTo(-18, -28, -38, -22); x.lineTo(-38, 26); x.quadraticCurveTo(-18, 20, 0, 30); x.quadraticCurveTo(18, 20, 38, 26); x.lineTo(38, -22); x.quadraticCurveTo(18, -28, 0, -18); x.fill(); x.strokeStyle = '#f3e6cc'; x.lineWidth = 4; P([[0, -18], [0, 28]]); break;
      case 'barber': x.lineWidth = 7; P([[-22, -30], [16, 14]]); P([[22, -30], [-16, 14]]); x.beginPath(); x.arc(-20, 24, 11, 0, 6.3); x.stroke(); x.beginPath(); x.arc(20, 24, 11, 0, 6.3); x.stroke(); break;
      case 'pharmacy': x.fillStyle = col; x.fillRect(-12, -34, 24, 68); x.fillRect(-34, -12, 68, 24); break;
      case 'winebar': x.fillStyle = col; x.beginPath(); x.moveTo(-20, -32); x.lineTo(20, -32); x.quadraticCurveTo(22, 4, 0, 6); x.quadraticCurveTo(-22, 4, -20, -32); x.fill(); P([[0, 6], [0, 30]]); P([[-14, 32], [14, 32]]); break;
      case 'bnb': x.fillStyle = col; x.fillRect(-36, -26, 9, 52); x.fillRect(27, -2, 9, 28); x.fillRect(-36, 4, 72, 14); x.fillStyle = '#f3e6cc'; x.fillRect(-27, -8, 54, 12); x.fillStyle = col; x.beginPath(); x.ellipse(-14, -10, 11, 7, 0, 0, 6.3); x.fill(); x.fillStyle = '#2a1d16'; x.font = 'bold 20px Georgia,serif'; x.textAlign = 'center'; x.fillText('B&B', 10, -16); break;
      case 'cinema': x.fillRect(-34, -10, 68, 40); x.save(); x.rotate(-.25); x.fillStyle = col; x.fillRect(-36, -34, 68, 14); x.restore(); x.fillStyle = '#f3e6cc'; for (const s of [-20, 0, 20]) x.fillRect(s - 4, 2, 8, 16); break;
    }
    x.restore();
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return {tex, url: cv.toDataURL()};
})();
function iconUVs(type, g, flip) {
  const n = Math.max(0, SHOP_ORDER.indexOf(type)), c = n % 4, r = Math.floor(n / 4), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { let u = uv.getX(i), v = uv.getY(i); if (flip) u = 1 - u; uv.setXY(i, (c + .04 + u * .92) / 4, 1 - (r + .04 + (1 - v) * .92) / 3); }
  return g;
}
const signMat = new THREE.MeshToonMaterial({map: ICON_ATLAS.tex, gradientMap: grad, side: THREE.DoubleSide});
signMat.onBeforeCompile = sh => { sh.uniforms.uNight = litU.uNight; sh.fragmentShader = 'uniform float uNight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*uNight*.55;'); };
signMat.customProgramCacheKey = () => 'sign';
wobPatch(signMat, false);

/* ==========================================================================
   STOREFRONTS: one procedural generator per shop type, seeded variations.
   em = facade frame (x along the wall, y from the ground-floor centre, z out)
   ========================================================================== */
function storefront(c, em, sw, R, A) {
  const type = c.biz, B = BIZ[type], [k1, k2] = SHOPCOL[type] || B.awn, out = {swing: null, plate: null, shop: null};
  const at = (x, y, z, ry = 0, rx = 0, rz = 0) => mul(em, tr(x, y, z, ry, rx, rz));
  const bx = (arr, w, h, d, col, x, y, z, ry, rx, rz) => arr.push(box(w, h, d, col, at(x, y, z, ry, rx, rz)));
  const cy = (arr, r1, r2, h, col, x, y, z, seg = 8, ry, rx, rz) => arr.push(cyl(r1, r2, h, col, at(x, y, z, ry, rx, rz), seg));
  const sp = (arr, r, col, x, y, z, sx = 1, sy = 1, sz = 1, seg = 6) => arr.push(paint(new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)), col).applyMatrix4(mul(at(x, y, z), new THREE.Matrix4().makeScale(sx, sy, sz))));
  const {body, plain, shopGlass, glows, flutter, signG, lit, tile, lbls = []} = A, shopNm = c.bizName || B.label, sKey = 'shop:' + (c.i * N + c.j);
  const dk = new THREE.Color(k1).multiplyScalar(.55), F = -.46; // floor level in this frame
  const glow = (x, y, z, thr = -1) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(em); v.thr = thr; glows.push(v); };
  const lamp = (x, y, thr = -1, col = '#2a2622') => { bx(plain, .03, .03, .14, col, x, y + .06, .07); cy(plain, .045, .03, .1, col, x, y, .14, 6); lit.push(setAttr(box(.05, .06, .05, '#fff', at(x, y - .01, .14)), 'lthr', thr)); glow(x, y - .05, .2, thr); };
  const glass = (x, y, w, h, panesX = 1, panesY = 1, mull = dk) => {
    shopGlass.push(box(w, h, .02, '#fff', at(x, y, .03)));
    for (let q = 1; q < panesX; q++) bx(plain, .022, h, .03, mull, x - w / 2 + q * w / panesX, y, .045);
    for (let q = 1; q < panesY; q++) bx(plain, w, .022, .03, mull, x, y - h / 2 + q * h / panesY, .045);
    bx(plain, w + .04, .035, .05, mull, x, y + h / 2 + .012, .04); bx(plain, w + .04, .035, .05, mull, x, y - h / 2 - .012, .04);
    bx(plain, .035, h, .05, mull, x - w / 2 - .012, y, .04); bx(plain, .035, h, .05, mull, x + w / 2 + .012, y, .04);
    glow(x, y, .3);
  };
  const door = (x, col, h = .7, w = .25, panes = true) => {
    bx(plain, w + .05, h + .04, .03, dk, x, F + h / 2 + .01, .02); bx(plain, w, h, .04, col, x, F + h / 2, .035);
    if (panes) shopGlass.push(box(w * .7, h * .42, .02, '#fff', at(x, F + h * .7, .058))); else { bx(plain, w * .7, h * .3, .012, new THREE.Color(col).multiplyScalar(.8), x, F + h * .72, .06); bx(plain, w * .7, h * .3, .012, new THREE.Color(col).multiplyScalar(.8), x, F + h * .3, .06); }
    bx(plain, .018, .05, .03, '#c9a33f', x + w * .35, F + h * .48, .07);
    return x;
  };
  const surround = (col, top = .36, style = 'square') => {
    for (const s of [-1, 1]) { bx(body, .09, top - F, .07, col, s * (sw / 2 + .03), (top + F) / 2, .01); bx(plain, .11, .06, .09, col, s * (sw / 2 + .03), top + .01, .02); }
    bx(body, sw + .16, .05, .09, col, 0, F + .02, .02);
    if (style === 'arch') { const a = paint(new THREE.TorusGeometry(sw / 2, .045, 4, 12, Math.PI), col); a.applyMatrix4(at(0, top - .02, .03)); body.push(a); }
  };
  let awTop = -1; // highest point of an awning against the wall, so the name board can sit above it
  const fascia = (col, letter, y = .47, w = sw + .14, h = .15) => {
    y = Math.max(y, awTop + h / 2 + .02);
    const z = .06, d = .14; // a deep board standing proud of the facade, so ledges, windows and lamps behind it don't cover the name
    bx(body, w, h, d, col, 0, y, z); bx(plain, w + .04, .03, d + .03, dk, 0, y + h / 2 + .01, z + .01); bx(plain, w + .04, .025, d + .02, dk, 0, y - h / 2 - .01, z + .01);
    lbls.push(labelGeo(sKey, shopNm, {bg: hex(col), fg: hex(letter)}, w * .97, h * .9).applyMatrix4(at(0, y, z + d / 2 + .005)));
    return y + h / 2; // top of the board
  };
  const stripedAwning = (aw, depth, tilt, n, y = .36, scallop = true) => {
    awTop = Math.max(awTop, y + Math.sin(tilt) * depth / 2 + .03);
    for (let s = 0; s < n; s++) plain.push(box(aw / n, .04, depth, s % 2 ? k2 : k1, at(-aw / 2 + aw / n * (s + .5), y, depth / 2 - .02, 0, tilt)));
    if (scallop) scallops(mul(em, tr(0, y - .36 - Math.sin(tilt) * (depth - .55), depth - .55)), aw, k1, k2, flutter);
    for (const s of [-1, 1]) bx(plain, .012, .012, depth, '#2a2622', s * aw / 2, y - .02, depth / 2 - .02, 0, tilt);
  };
  const domeAwning = (aw, col, y = .34) => { const g = paint(new THREE.CylinderGeometry(.22, .22, aw, 12, 1, true, 0, Math.PI), col); g.applyMatrix4(at(0, y, .02, 0, Math.PI / 2, Math.PI / 2)); flutter.push(g); for (let q = 0; q <= 4; q++) { const a = paint(new THREE.TorusGeometry(.222, .006, 3, 10, Math.PI), '#2a2622'); a.applyMatrix4(at(-aw / 2 + q * aw / 4, y, .02, Math.PI / 2)); plain.push(a); } };
  const flatAwning = (aw, col, band, y = .36, depth = .45) => { awTop = Math.max(awTop, y + Math.sin(.22) * depth / 2 + .03); flutter.push(box(aw, .03, depth, col, at(0, y, depth / 2, 0, .22))); flutter.push(box(aw, .1, .012, band, at(0, y - .06 - depth * .22, depth - .01))); };
  const plate = (x, y = .07) => { out.plate = {m: at(x, y, .072), g: [box(.11, .055, .006, '#efe3c8', tr(0, 0, .004)), box(.07, .008, .007, '#2f5a3a', tr(0, .006, .006)), box(.05, .008, .007, '#2f5a3a', tr(0, -.01, .006)), box(.11, .055, .006, '#b8342a', tr(0, 0, -.004)), box(.07, .008, .007, '#f4ecdc', tr(0, 0, -.006)), box(.004, .05, .004, '#2a2622', tr(0, .045, 0, 0, 0, .5)), box(.004, .05, .004, '#2a2622', tr(0, .045, 0, 0, 0, -.5))]}; };
  const swingSign = (x) => { out.swing = hangingSign(type, em, x, plain, signG); };
  const ledge = (x, w) => bx(plain, w + .06, .03, .09, dk, x, F + .3, .06);
  const L = R() < .5 ? -1 : 1; // which side the door goes (seeded)
  const dx = L * (sw / 2 - .17), gx = -L * .14, gw = sw - .42;
  switch (type) {
    case 'cafe': {
      surround(dk, .36); bx(body, gw + .06, .16, .05, dk, gx, F + .08, .025);
      glass(gx, -.02, gw, .58, 2 + Math.floor(R() * 2), 1); door(dx, k1); windowGoods(type, em, sw, R, plain);
      stripedAwning(sw + .2, .55, .38, 7 + 2 * Math.floor(R() * 2), .36, true); const fTop = fascia(dk, '#e8d8a8');
      bx(plain, .16, .22, .015, '#1e1e1e', dx + L * .26, F + .14, .2, L * .3, -.2); bx(plain, .18, .24, .01, '#5a3a28', dx + L * .26, F + .14, .19, L * .3, -.2); lamp(-dx, fTop + .12);
      swingSign(-L * (sw / 2 + .06)); plate(dx); out.shop = {m: at(gx, .27, .07), sw: gw}; break;
    }
    case 'bakery': {
      surround('#efe3c8', .36); door(dx, '#8a5a2a');
      const bw = gw - .02; bx(body, bw + .12, .2, .24, '#efe3c8', gx, F + .1, .12); shopGlass.push(box(bw, .44, .02, '#fff', at(gx, -.06, .23))); for (const s of [-1, 1]) { bx(plain, .03, .46, .24, '#8a5a2a', gx + s * bw / 2, -.06, .12); shopGlass.push(box(.02, .44, .2, '#fff', at(gx + s * (bw / 2 - .02), -.06, .13))); }
      bx(plain, bw + .1, .05, .27, '#8a5a2a', gx, .18, .13); glow(gx, -.06, .4);
      windowGoods(type, mul(em, tr(gx + sw / 2 - .16 - bw / 2 + .06, .06, .1)), bw + .2, R, plain);
      flatAwning(sw + .14, k1, '#f4ead2', .38, .4); fascia('#6a3a1a', '#e8c890');
      for (let q = 0; q < 5; q++) sp(plain, .018, '#d9a654', dx + (q - 2) * .02, F + .78 + Math.abs(q - 2) * -.012, .05, .6, 1.6, .6);
      swingSign(-L * (sw / 2 + .06)); plate(dx); out.shop = {m: at(gx, .19, .25), sw: bw}; break;
    }
    case 'grocer': {
      surround(dk, .36); bx(body, sw + .02, .74, .02, '#3a2a20', 0, -.09, -.02); shopGlass.push(box(sw - .1, .5, .02, '#fff', at(0, -.03, -.005)));
      cy(plain, .06, .06, sw + .02, '#7c7a74', 0, .3, .05, 10, 0, 0, Math.PI / 2);
      for (let r = 0; r < 3; r++) { const y = F + .09 + r * .1, z = .2 - r * .07; bx(plain, sw - .1, .03, .12, '#8a6a42', 0, y, z); for (let q = 0; q < 5; q++) { const x = -sw / 2 + .15 + q * (sw - .3) / 4; bx(plain, .16, .07, .1, '#a07a4a', x, y + .05, z); const fc = pick(R, ['#d9472b', '#7aa33a', '#e8a23a', '#c0302a', '#e8d040', '#6a8a2a']); for (let k = 0; k < 4; k++) sp(plain, .022, fc, x - .045 + (k % 2) * .09 + (R() - .5) * .02, y + .1, z - .02 + Math.floor(k / 2) * .04, 1, 1, 1, 5); } }
      stripedAwning(sw + .3, .75, .3, 9, .38, false); fascia('#2f4a2a', '#e8d8a8');
      bx(plain, .16, .1, .01, '#efe3c8', -sw * .3, F + .5, .02); swingSign(L * (sw / 2 + .06)); out.shop = {m: at(0, .27, .07), sw: sw - .02}; break;
    }
    case 'fish': {
      tile.push(box(sw + .2, .86, .014, '#bcd4e8', at(0, -.03, .02)));
      bx(body, sw * .7, .5, .04, '#e8eef4', gx * .5, -.02, .02); shopGlass.push(box(sw * .62, .4, .02, '#fff', at(gx * .5, .0, .045)));
      bx(plain, sw * .74, .06, .2, '#d8dcde', gx * .5, F + .3, .1); for (let q = 0; q < 6; q++) sp(plain, .02, pick(R, ['#a8b4bc', '#c0ccd4', '#8a9aa8']), gx * .5 - sw * .3 + q * sw * .12, F + .34, .12, 2.3, .5, .8, 6);
      door(dx * 1.05, '#1f3f5f'); bx(plain, sw + .24, .03, .3, '#7c7a74', 0, .4, .15, 0, .12); fascia('#1f3f5f', '#e8eef4', .5);
      swingSign(-L * (sw / 2 + .08)); plate(dx * 1.05); out.shop = {m: at(gx * .5, .2, .07), sw: sw * .62}; break;
    }
    case 'florist': {
      const green = jit('#3f6a4a', R, .08); surround(green, .3, 'arch'); bx(body, gw + .08, .16, .05, green, gx, F + .08, .025);
      glass(gx, -.04, gw, .54, 1, 2, green); door(dx, green); windowGoods(type, em, sw, R, plain);
      for (let q = 0; q < 10; q++) { const t = q / 9; sp(plain, .045 + R() * .03, pick(R, ['#4f7a32', '#5f8a3a', '#3f6a2a']), -sw / 2 - .02 + t * (sw + .04), .42 + Math.sin(t * Math.PI) * .12, .06, 1, .8, .7, 5); if (R() < .6) sp(plain, .022, pick(R, ['#d94f3d', '#f2a1b1', '#e8c34a', '#f4f0e8']), -sw / 2 + t * sw, .44 + Math.sin(t * Math.PI) * .12, .1, 1, 1, 1, 5); }
      flatAwning(sw + .1, k1, '#f6ece6', .58, .32); swingSign(-L * (sw / 2 + .06)); plate(dx); out.shop = {m: at(gx, .23, .07), sw: gw}; break;
    }
    case 'books': {
      const wood = jit('#3a2418', R, .06); surround(wood, .36); bx(body, gw + .06, .14, .05, wood, gx, F + .07, .025);
      glass(gx, -.02, gw, .6, 3 + Math.floor(R() * 2), 3, wood); door(dx, k1, .7, .25, true); windowGoods(type, em, sw, R, plain);
      fascia('#2a2040', '#c9a33f'); for (const s of [-1, 1]) { bx(plain, .02, .02, .18, '#c9a33f', s * sw * .3, .58, .1, 0, .5); cy(plain, .04, .02, .05, '#c9a33f', s * sw * .3, .53, .19, 6); lit.push(setAttr(box(.04, .03, .04, '#fff', at(s * sw * .3, .5, .19)), 'lthr', -1)); }
      swingSign(-L * (sw / 2 + .06)); plate(dx); out.shop = {m: at(gx, .29, .07), sw: gw}; break;
    }
    case 'barber': {
      surround('#1e1e2a', .36); glass(gx, -.02, gw, .58, 1, 1, '#1e1e2a'); bx(plain, gw, .16, .012, '#f4f0e8', gx, -.06, .05); door(dx, '#1e1e2a');
      for (let q = 0; q < 6; q++) bx(plain, sw / 6, .02, .2, q % 2 ? '#1e1e1e' : '#f4f4f4', -sw / 2 + sw / 12 + q * sw / 6, F + .01, .12);
      stripedAwning(sw + .2, .5, .42, 8, .36, false); fascia('#1e1e2a', '#f4f4f4');
      const px = -L * (sw / 2 + .12); bx(plain, .03, .03, .12, '#c9a33f', px, .12, .06); bx(plain, .03, .03, .12, '#c9a33f', px, -.18, .06); sp(plain, .035, '#c9a33f', px, .2, .12); sp(plain, .035, '#c9a33f', px, -.26, .12);
      out.pole = {m: at(px, -.03, .12), g: (() => { const g = paint(new THREE.CylinderGeometry(.03, .03, .4, 10, 12, true), '#fff'); const p = g.attributes.position, col = g.attributes.color; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), s = Math.sin(a * 2 + p.getY(i) * 30); const cc = s > .33 ? [.75, .05, .05] : s < -.33 ? [.06, .15, .5] : [1, 1, 1]; col.setXYZ(i, ...cc); } return [g, cyl(.034, .034, .04, '#c9a33f', tr(0, .21, 0), 10), cyl(.034, .034, .04, '#c9a33f', tr(0, -.21, 0), 10)]; })()};
      plate(dx); out.shop = {m: at(gx, .27, .07), sw: gw}; break;
    }
    case 'pharmacy': {
      surround('#e8e4dc', .36); glass(gx, -.02, gw, .62, 1, 1, '#c8ccd0'); door(dx, '#c8ccd0', .72, .27, true); windowGoods(type, em, sw, R, plain);
      fascia('#1f5a3a', '#f4f4f4');
      const cx_ = -L * (sw / 2 + .2); bx(plain, .03, .03, .2, '#2a2622', cx_, .62, .1); for (const [w, h] of [[.08, .26], [.26, .08]]) { bx(plain, w, h, .05, '#2f9a5a', cx_, .62, .22); lit.push(setAttr(box(w * .8, h * .8, .055, '#fff', at(cx_, .62, .22)), 'lthr', -1)); } glow(cx_, .62, .3);
      plate(dx); out.shop = {m: at(gx, .29, .07), sw: gw}; break;
    }
    case 'tasca': {
      const stone = '#d8ccb8'; for (let q = 0; q <= 8; q++) { const a = Math.PI * q / 8; bx(body, .1, .1, .08, stone, Math.cos(a) * .2 + dx * .9, .02 + Math.sin(a) * .2, .02, 0, 0, a - Math.PI / 2); }
      for (const s of [-1, 1]) bx(body, .1, .5, .08, stone, dx * .9 + s * .2, F + .25, .02);
      bx(plain, .32, .7, .04, '#5a3220', dx * .9, F + .35, .03); for (let q = 0; q < 4; q++) bx(plain, .005, .66, .045, '#3a2010', dx * .9 - .12 + q * .08, F + .35, .035);
      glass(-L * .3, .02, .38, .36, 2, 2, '#3a2010'); for (let q = 0; q < 4; q++) bx(plain, .01, .38, .02, '#1e1e1e', -L * .3 - .14 + q * .093, .02, .07);
      lamp(dx * .9 - .3 * L, .3, -1); lamp(dx * .9 + .3 * L, .3, -1);
      bx(plain, .18, .26, .015, '#1e1e1e', -L * .3, F + .2, .12, 0, -.15); for (let q = 0; q < 4; q++) bx(plain, .1 + R() * .04, .01, .005, '#f4f0e8', -L * .3, F + .28 - q * .05, .13, 0, -.15);
      fascia('#3a1a1a', '#e8d8a8', .5, sw * .8, .12); swingSign(-L * (sw / 2 + .06)); plate(dx * .9 + .1 * L, .2); break;
    }
    case 'winebar': {
      const burg = jit('#4a1a24', R, .05); surround(burg, .32, 'arch'); glass(gx, -.06, gw, .5, 2, 1, burg); door(dx, '#2a1218', .7, .25, false);
      for (let q = 0; q < 7; q++) { cy(plain, .016, .016, .08, pick(R, ['#2f4a2f', '#5a1f2f', '#1e2a24']), gx - gw / 2 + .06 + q * (gw - .12) / 6, F + .36, .07, 6); }
      cy(plain, .16, .16, .05, '#6a3a20', -L * (sw / 2 + .16), .45, .1, 12, 0, Math.PI / 2); cy(plain, .165, .165, .02, '#2a2622', -L * (sw / 2 + .16), .45, .13, 12, 0, Math.PI / 2); signG.push(iconUVs(type, new THREE.PlaneGeometry(.2, .2), false).applyMatrix4(at(-L * (sw / 2 + .16), .45, .132)));
      for (let q = 0; q < 8; q++) sp(plain, .03, pick(R, ['#3f6a2a', '#4f7a32', '#5a1f3a']), -sw / 2 + q * sw / 7, .44 + Math.sin(q) * .03, .05, 1, .8, .6, 5);
      lamp(dx + .2 * -L, .25, -1); fascia(burg, '#c9a33f', .52, sw * .7, .12); plate(dx); out.shop = {m: at(gx, .19, .07), sw: gw}; break;
    }
    case 'cinema': {
      surround('#1e1e2a', .2); glass(0, -.12, .3, .26, 1, 1, '#c9a33f'); door(dx, '#8a1a1a', .66, .25, true); door(-dx, '#8a1a1a', .66, .25, true);
      for (const s of [-1, 1]) { bx(plain, .22, .3, .02, '#c9a33f', s * .33, .12, .03); bx(plain, .18, .26, .01, pick(R, ['#b8342a', '#2f5ea8', '#c9a33f', '#3f6a3f']), s * .33, .12, .045); }
      bx(plain, sw + .3, .14, .5, '#1a1a24', 0, .36, .25); bx(plain, sw + .32, .02, .52, '#c9a33f', 0, .29, .25);
      for (let q = 0; q < 14; q++) lit.push(setAttr(box(.035, .035, .02, '#fff', at(-sw / 2 - .1 + q * (sw + .2) / 13, .36, .51)), 'lthr', -1));
      bx(plain, .05, .9, .18, '#b8342a', -L * (sw / 2 + .12), .55, .12); for (let q = 0; q < 5; q++) lit.push(setAttr(box(.06, .1, .04, '#fff', at(-L * (sw / 2 + .12), .85 - q * .15, .2)), 'lthr', -1));
      glow(0, .3, .6); out.shop = {m: at(0, .01, .07), sw: .3}; break;
    }
    case 'bnb': {
      // a guesthouse front: painted door with fanlight, house plaques, lanterns, bay trees, window with lace and flowers
      const doorCol = pick(R, ['#2f5ea8', '#2f6a4a', '#8a2a2a', '#3a4a5a', '#c9a33f']), trim = '#efe3c8';
      const ddx = L * .26, wxp = -L * .3;
      bx(body, .4, .86, .06, trim, ddx, F + .43, .015); door(ddx, doorCol, .62, .26, false);
      const fan = paint(new THREE.CylinderGeometry(.13, .13, .02, 10, 1, false, -Math.PI / 2, Math.PI), '#fff'); fan.applyMatrix4(at(ddx, F + .64, .04, 0, Math.PI / 2)); shopGlass.push(fan);
      for (let q = 0; q < 5; q++) bx(plain, .005, .12, .03, trim, ddx + Math.cos(Math.PI * q / 4) * .06, F + .64 + Math.abs(Math.sin(Math.PI * q / 4)) * .06, .05, 0, 0, Math.PI * q / 4 - Math.PI / 2);
      bx(plain, .4, .04, .12, '#8b8076', ddx, F + .02, .08); bx(plain, .32, .015, .14, '#7a5a38', ddx, F + .045, .18);
      bx(plain, .08, .05, .01, '#efe3c8', ddx, F + .8, .05); bx(plain, .04, .025, .012, '#2a2622', ddx, F + .8, .052); // house number
      bx(plain, .1, .07, .008, '#2f5ea8', ddx - L * .25, .12, .015); bx(plain, .06, .02, .01, '#f4f4f4', ddx - L * .25, .12, .02); // blue "AL" licence plate
      bx(plain, .12, .05, .008, '#c9a33f', ddx - L * .25, .02, .015); // brass "rooms" plate
      bx(plain, .5, .14, .02, '#1f3f8a', wxp, .36, .02); lbls.push(labelGeo(sKey, shopNm, {kind: 'azul'}, .48, .12).applyMatrix4(at(wxp, .36, .032)));
      lamp(ddx - L * .25, .3, .1, '#1e1e1e');
      for (const s of [-1, 1]) { const px = ddx + s * .27; cy(plain, .07, .05, .12, '#8a4a38', px, F + .06, .14, 8); cy(plain, .008, .008, .16, '#5a4232', px, F + .2, .14, 4); sp(plain, .085, pick(R, ['#3f6a2a', '#4f7a32']), px, F + .34, .14, 1, 1.15, 1, 7); }
      bx(body, .5, .5, .06, trim, wxp, -.02, .015); shopGlass.push(box(.38, .38, .02, '#fff', at(wxp, -.02, .035))); bx(plain, .02, .38, .03, trim, wxp, -.02, .05); bx(plain, .38, .02, .03, trim, wxp, .04, .05);
      bx(plain, .17, .3, .01, '#f4f0e8', wxp - .1, -.04, .05); bx(plain, .17, .3, .01, '#f4f0e8', wxp + .1, -.04, .05);
      for (const s of [-1, 1]) bx(plain, .2, .44, .03, pick(R, ['#3f6a4a', '#2f5ea8', '#efe3c8']), wxp + s * .32, -.02, .03);
      bx(plain, .46, .1, .14, '#7a4a30', wxp, -.31, .1); for (let q = 0; q < 7; q++) sp(plain, .035, pick(R, ['#d94f3d', '#f2a1b1', '#e8c34a', '#f4f0e8', '#4f7a32']), wxp - .2 + q * .066, -.24, .12, 1, 1, 1, 5);
      // bench with a cushion under the window
      bx(plain, .44, .03, .14, '#6a4a30', wxp, F + .2, .16); bx(plain, .4, .02, .1, pick(R, ['#c0442e', '#2f5ea8', '#e8c34a']), wxp, F + .225, .16); for (const s of [-1, 1]) bx(plain, .03, .2, .1, '#2a2622', wxp + s * .19, F + .1, .16);
      // suitcase by the door
      bx(plain, .1, .14, .05, pick(R, ['#2f5ea8', '#c0442e', '#e8a23a', '#3f6a4a']), ddx + L * .2, F + .08, .2); bx(plain, .04, .015, .015, '#2a2622', ddx + L * .2, F + .16, .2);
      out.swing = hangingSign(type, em, L * (sw / 2 + .12), plain, signG);
      glow(ddx, F + .55, .25, .1); out.bnb = true; break;
    }
    default: {
      surround(dk, .36); glass(gx, -.02, gw, .58, 2, 1); door(dx, k1); windowGoods(type, em, sw, R, plain); stripedAwning(sw + .2, .55, .38, 7); fascia(dk, '#e8d8a8'); swingSign(-L * (sw / 2 + .06)); plate(dx); out.shop = {m: at(gx, .27, .07), sw: gw};
    }
  }
  if (OWN.spec && SPECS[OWN.spec].types.includes(type)) { const xb = -L * sw * .34, bm = at(xb, F + .2, .36, 0, -.18); for (const s_ of [-1, 1]) plain.push(box(.025, .42, .025, '#4a3a2a', mul(bm, tr(s_ * .2, 0, -.02)))); plain.push(box(.46, .2, .02, '#2a2622', mul(bm, tr(0, .08, 0)))); lbls.push(labelGeo('spec', '★ ' + SPECS[OWN.spec].label, {kind: 'brass'}, .44, .1).applyMatrix4(mul(bm, tr(0, .1, .03)))); }
  return out;
}
/* hanging bracket sign for a shopfront (em = facade frame, x along wall, z out) */
function hangingSign(type, em, x0, plain, sign) {
  const [col] = SHOPCOL[type] || ['#7a3a2a'];
  plain.push(box(.035, .035, .78, '#2a2622', mul(em, tr(x0, 1.06, .38))));
  plain.push(box(.025, .025, .62, '#2a2622', mul(em, tr(x0, .9, .22, 0, -.62))));
  plain.push(paint(new THREE.TorusGeometry(.06, .012, 4, 10), '#2a2622').applyMatrix4(mul(em, tr(x0, 1.06, .78, Math.PI / 2))));
  const sw = {m: mul(em, tr(x0, 1.03, .44)), plain: [], sign: []};
  for (const z of [-.22, .22]) { sw.plain.push(box(.012, .07, .012, '#2a2622', tr(0, -.02, z))); sw.plain.push(paint(new THREE.TorusGeometry(.012, .003, 3, 8), '#2a2622').applyMatrix4(tr(0, .016, z, Math.PI / 2))); }
  sw.plain.push(box(.045, .6, .6, col, tr(0, -.36, 0))); sw.plain.push(box(.05, .035, .62, '#2a2622', tr(0, -.045, 0))); sw.plain.push(box(.05, .035, .62, '#2a2622', tr(0, -.675, 0)));
  for (const s of [1, -1]) sw.sign.push(iconUVs(type, new THREE.PlaneGeometry(.54, .54), false).applyMatrix4(tr(s * .026, -.36, 0, s * Math.PI / 2)));
  return sw;
}
/* coloured mosaic threshold + per-type extras on the street */
function shopThreshold(b, M, P, R) {
  if (b.type === 'bnb') { P(box(.34, .012, .2, '#7a5a38', M(0, .008, -.3))); return; }
  const [col, st] = SHOPCOL[b.type] || ['#7a3a2a', '#efe3c8'];
  P(box(.78, .014, .26, st, M(0, .012, -.3))); P(box(.7, .018, .2, col, M(0, .013, -.3)));
  for (let q = 0; q < 5; q++) P(box(.06, .02, .06, st, M(-.28 + q * .14, .014, -.3, .78)));
  if (b.type === 'cafe') for (const x of [-.45, .45]) { P(cyl(.015, .015, .95, '#2a2622', M(x, .48, .22), 5)); P(paint(new THREE.CylinderGeometry(.03, .42, .16, 8, 1, true), col).applyMatrix4(M(x, .98, .22))); P(paint(new THREE.CylinderGeometry(.42, .42, .05, 8, 1, true), st).applyMatrix4(M(x, .88, .22))); }
  if (b.type === 'bakery') for (const x of [-.62, -.38]) { P(box(.2, .12, .16, '#8a6a42', M(x, .06, -.05))); for (let k = 0; k < 3; k++) P(paint(new THREE.SphereGeometry(.05, 6, 4), pick(R, ['#c8904a', '#e0b070', '#a86a30'])).applyMatrix4(mul(M(x + (k - 1) * .055, .14, -.05), new THREE.Matrix4().makeScale(1, .7, 1.6)))); }
  if (b.type === 'books' || b.type === 'florist' || b.type === 'grocer' || b.type === 'fish') { P(box(.03, .42, .3, '#3a2a20', M(.62, .21, .1, .35, 0, .18))); P(box(.035, .34, .24, '#1e2a24', M(.62, .23, .1, .35, 0, .18))); P(box(.04, .06, .2, col, M(.64, .33, .1, .35, 0, .18))); }
}

/* ---- map mode: category tint + floating shop icons ---- */
const MAP_LAYER = 4;
const mapMat = new THREE.ShaderMaterial({uniforms: {uCol: {value: new THREE.Color()}, uA: {value: 1}},
  vertexShader: WOBGL + `void main(){vec3 p=position;vec4 w=modelMatrix*vec4(p,1.);p+=(vec4(wobW(w.xyz),0.)*modelMatrix).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader: `uniform vec3 uCol;uniform float uA;void main(){if(uA<.5)discard;gl_FragColor=vec4(uCol,1.);}`});
const MAPCOL = {home: new THREE.Color('#ead9b6'), vacant: new THREE.Color('#7d8794'), tree: new THREE.Color('#6f9a4e'), plaza: new THREE.Color('#d8c08a'), bridge: new THREE.Color('#a89a88'), landmark: new THREE.Color('#f0c25a'), none: new THREE.Color('#000')};
const shopC = {}; Object.keys(SHOPCOL).forEach(k => shopC[k] = new THREE.Color(SHOPCOL[k][0]));
function mapColOf(c) {
  if (!c) return MAPCOL.none;
  if (c.biz) return shopC[c.biz] || MAPCOL.landmark;
  if (c.floors > 0) return (c.res && c.res.length) ? MAPCOL.home : MAPCOL.vacant;
  if (c.kind === 'tree') return MAPCOL.tree; if (c.kind === 'plaza') return MAPCOL.plaza; if (c.kind === 'bridge') return MAPCOL.bridge;
  if (c.kind && c.kind !== 'lamp') return MAPCOL.landmark;
  return MAPCOL.none;
}
function mapHook(r, s, cam, g, mat) { if (mat !== mapMat) return; const mc = G.mapColOf(this.userData.cell); mapMat.uniforms.uCol.value.copy(mc); mapMat.uniforms.uA.value = mc === MAPCOL.none ? 0 : 1; mapMat.uniformsNeedUpdate = true; }
function hookMap(group, cell) { group.traverse(o => { if (o.isMesh && o.material === signMat) o.layers.enable(1); if (o.isMesh && !o.isInstancedMesh) { o.userData.cell = cell; o.onBeforeRender = mapHook; o.layers.enable(MAP_LAYER); } }); }
let mapRT = null, mapOn = false, mapK = 0;
const mapIconsEl = document.createElement('div'); mapIconsEl.id = 'mapIcons'; document.body.appendChild(mapIconsEl);
const legendEl = document.createElement('div'); legendEl.id = 'legend'; legendEl.className = 'panel'; document.body.appendChild(legendEl);
{ const st = document.createElement('style'); st.textContent = `
  #mapIcons{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .35s}
  #mapIcons.on{opacity:1}
  .mi{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:auto;cursor:pointer}
  .mi i{width:34px;height:34px;border-radius:50%;background-image:url(${ICON_ATLAS.url});background-size:400% 300%;box-shadow:0 3px 10px rgba(0,0,0,.45)}
  .mi i.closed{filter:grayscale(.8) brightness(.8)}
  .mi b{font:600 10px 'Bricolage Grotesque',system-ui,sans-serif;color:#f3e6cc;background:rgba(28,20,16,.72);padding:2px 6px;border-radius:6px;white-space:nowrap}
  .mi:after{content:'';width:2px;height:10px;background:rgba(243,230,204,.7)}
  #legend{position:fixed;right:12px;left:auto!important;top:calc(14px + env(safe-area-inset-top))!important;bottom:auto!important;padding:8px 12px;font-size:12px;display:none;flex-direction:column;gap:5px;max-height:50vh;overflow:auto;z-index:3}
  #legend .lh{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;font:400 14px Caprasimo,Georgia,serif;min-height:28px}
  #legend .lh small{font:500 11px 'Bricolage Grotesque',system-ui,sans-serif;opacity:.65}
  #legend.min span{display:none}
  #legend.on{display:flex}
  #legend span{display:flex;align-items:center;gap:8px}#legend em{width:12px;height:12px;border-radius:3px;display:inline-block;border:1px solid rgba(255,255,255,.25)}
  #mapB.on{background:#f0a35c;color:#24170f}
  @media (max-width:700px){#legend{top:auto;bottom:calc(150px + env(safe-area-inset-bottom));left:8px;font-size:11px;padding:8px 10px;max-height:30vh}}`; document.head.appendChild(st); }
const iconPos = n => { const c = n % 4, r = Math.floor(n / 4); return `${c / 3 * 100}% ${r / 2 * 100}%`; };
function buildMapUI() {
  mapIconsEl.innerHTML = '';
  G.businesses.forEach(b => {
    const d = document.createElement('div'); d.className = 'mi'; d.innerHTML = `<i style="background-position:${iconPos(Math.max(0, SHOP_ORDER.indexOf(b.type)))}"></i><b>${b.name}</b>`;
    d.onclick = () => G.houseCard(b.cell, false); b.mapEl = d; mapIconsEl.appendChild(d);
  });
  const types = [...new Set(G.businesses.map(b => b.type))];
  legendEl.innerHTML = `<div class="lh">Map key<small>${legendEl.classList.contains('min') ? 'show ▾' : 'hide ▴'}</small></div>` + types.map(t => `<span><em style="background:${SHOPCOL[t][0]}"></em>${BIZ[t].label}</span>`).join('') +
    `<span><em style="background:#ead9b6"></em>Homes</span><span><em style="background:#7d8794"></em>Empty homes</span><span><em style="background:#f0c25a"></em>Landmarks</span><span><em style="background:#6f9a4e"></em>Trees</span>`;
}
const _mp = new THREE.Vector3();
function updateMapUI() {
  postU.mapOn.value = mapK;
  if (mapK < .02) return;
  const w = innerWidth, h = innerHeight, near = camera.position.distanceTo(controls.target) < 30;
  G.businesses.forEach(b => {
    const d = b.mapEl; if (!d) return; const c = b.cell;
    warpV(_mp.set(wx(c.i), topY(c) + c.floors * FH + 1.1, wx(c.j))).project(camera);
    if (_mp.z > 1) { d.style.display = 'none'; return; }
    d.style.display = ''; d.style.left = ((_mp.x * .5 + .5) * w).toFixed(1) + 'px'; d.style.top = ((-_mp.y * .5 + .5) * h).toFixed(1) + 'px';
    d.querySelector('b').style.display = near ? '' : 'none'; d.querySelector('i').classList.toggle('closed', !(b.open > .5));
  });
}
function setMap(on) {
  mapOn = on; mapIconsEl.classList.toggle('on', on); legendEl.classList.toggle('on', on);
  if (on && legendEl.dataset.init !== '1') { legendEl.dataset.init = '1'; legendEl.classList.toggle('min', innerWidth < 700); legendEl.onclick = () => { legendEl.classList.toggle('min'); const sm = legendEl.querySelector('.lh small'); if (sm) sm.textContent = legendEl.classList.contains('min') ? 'show ▾' : 'hide ▴'; }; }
  document.getElementById('mapB')?.classList.toggle('on', on);
  if (on) { G.buildMapUI(); say('Map view: shops by type, homes, empty homes'); }
}
function renderMapPass() {
  mapK += ((mapOn ? 1 : 0) - mapK) * .15; if (!mapOn && mapK < .02) { mapK = 0; return; }
  if (!mapRT || mapRT.width !== rt.width >> 1) { mapRT?.dispose(); mapRT = new THREE.WebGLRenderTarget(rt.width >> 1, rt.height >> 1); postU.tMap.value = mapRT.texture; }
  const fog = scene.fog; scene.fog = null; scene.overrideMaterial = mapMat; camera.layers.set(MAP_LAYER);
  renderer.setRenderTarget(mapRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  scene.overrideMaterial = null; camera.layers.set(0); scene.fog = fog; renderer.setClearColor(0x000000, 1);
}
{ const bt = document.createElement('button'); bt.className = 'act'; bt.id = 'mapB'; bt.textContent = 'Map'; bt.title = 'Map view'; bt.onclick = () => setMap(!mapOn); const m = document.getElementById('menu'); m.parentNode.insertBefore(bt, m); }

export {ICON_ATLAS, MAPCOL, SHOP_ORDER, _mp, hookMap, iconPos, legendEl, mapK, mapOn, renderMapPass, setMap, shopThreshold, signMat, storefront, updateMapUI};
