import './characters.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {G} from '../state.js';
import {mul, pick, rng, tr} from '../core/util.js';
import {DIRS, camera, cellAt, controls, renderer, scene, topY, water, wx} from '../core/scene.js';
import {walkY, walkable} from '../world/streets.js';
import {warpV} from '../world/organic.js';
import {cellOf, groundAt, navPath} from './sim.js';
import {PEOPLE_STATS, SK, SPH, SkinSet, _m4, _q4, _s4, _v4, angLerp, blendW, buildPeopleMeshes, chain, gM, gS, hum, loc, mergeSk, partsMask, skg, spring} from './characters.js';
import {cats, lodFar, quality, snowAmt} from '../game/extras.js';
import {marketOn} from '../game/meta.js';

/* ---------------- animals ---------------- */
const lim = (r0, r1, h, seg, m) => gM(new THREE.CylinderGeometry(r1, r0, h, seg, 2), m);
// ---- dog
const DB = {root: 0, body: 1, head: 2, t1: 3, t2: 4, eA: 5, eB: 6, fA: 7, fB: 8, bA: 9, bB: 10};
const D_REST = [[0, 0, 0], [0, .12, 0], [0, .15, .1], [0, .14, -.11], [0, .17, -.17], [-.03, .19, .12], [.03, .19, .12], [-.035, .1, .07], [.035, .1, .07], [-.035, .1, -.07], [.035, .1, -.07]].map(a => new THREE.Vector3(...a));
function buildDogGeo() {
  const P = [], s = 10;
  P.push(skg(mergeGeometries([gM(SPH(1, s, 7), mul(tr(0, .123, -.01), gS(.058, .056, .12))), gM(SPH(1, s, 7), mul(tr(0, .13, .055), gS(.056, .062, .065)))]), {b: v => v.z > .09 ? [DB.head, DB.body, .3] : [DB.body], r: v => v.y < .1 && Math.abs(v.x) < .03 ? 0 : 1}));
  P.push(skg(gM(new THREE.CylinderGeometry(.03, .036, .09, s, 3), tr(0, .16, .11, 0, .75)), {b: v => blendW(v.z, .14, .08, DB.head, DB.body), r: 1}));
  P.push(skg(mergeGeometries([gM(SPH(.042, s, 8), tr(0, .178, .135)), gM(SPH(1, 8, 6), mul(tr(0, .166, .178), gS(.024, .022, .04)))]), {b: [DB.head], r: v => v.z > .16 && v.y < .175 ? 0 : 1}));
  P.push(skg(mergeGeometries([gM(SPH(.0085, 6, 5), tr(0, .172, .216)), gM(SPH(.0055, 5, 4), tr(-.017, .19, .168)), gM(SPH(.0055, 5, 4), tr(.017, .19, .168))]), {b: [DB.head], r: 2}));
  P.push(skg(gM(new THREE.BoxGeometry(.016, .004, .025), tr(0, .153, .2, 0, .4)), {b: [DB.head], p: 5, r: 4}));
  for (const [sx, e] of [[-1, DB.eA], [1, DB.eB]]) {
    P.push(skg(gM(SPH(1, 6, 5), mul(tr(sx * .038, .168, .12, 0, 0, sx * .25), gS(.011, .034, .024))), {b: [e], p: 0, r: 5}));
    P.push(skg(gM(new THREE.ConeGeometry(.014, .042, 5), tr(sx * .025, .218, .12, 0, -.15, sx * -.25)), {b: [e], p: 1, r: 5}));
  }
  P.push(skg(gM(new THREE.CylinderGeometry(.004, .009, .13, 5, 4), tr(0, .17, -.155, 0, -.75)), {b: v => blendW(-v.z, .16, .13, DB.t2, DB.t1), p: 2, r: 1}));
  P.push(skg(gM(new THREE.TorusGeometry(.03, .009, 4, 8, Math.PI * 1.4), tr(0, .17, -.115, Math.PI / 2, 0, 0)), {b: [DB.t1], p: 3, r: 1}));
  P.push(skg(gM(new THREE.TorusGeometry(.032, .006, 4, 10), tr(0, .158, .095, 0, 1.0)), {b: [DB.head, DB.body, .5], p: 4, r: 3}));
  for (const [x, z, b] of [[-.035, .07, DB.fA], [.035, .07, DB.fB], [-.035, -.07, DB.bA], [.035, -.07, DB.bB]]) {
    P.push(skg(mergeGeometries([lim(.012, .017, .1, 6, tr(x, .05, z)), gM(SPH(1, 6, 4), mul(tr(x, .01, z + .008), gS(.016, .01, .02)))]), {b: v => v.y > .085 ? [b, DB.body, .5] : [b], r: v => v.y < .03 ? 0 : 1}));
  }
  return mergeSk(P);
}
const BREEDS = {mutt: {k: 1, sc: [1, 1, 1], m: [0, 2, 4, 5]}, terrier: {k: .8, sc: [1, 1, .95], m: [1, 2, 4, 5]}, dachs: {k: .9, sc: [1, .72, 1.4], m: [0, 2, 4]}, podengo: {k: 1, sc: [.9, 1.18, 1.05], m: [1, 3, 4]}, lab: {k: 1.25, sc: [1.08, 1, 1.05], m: [0, 2, 4, 5]}};
// ---- cat
const CB = {root: 0, body: 1, head: 2, t1: 3, t2: 4, t3: 5, fA: 6, fB: 7, bA: 8, bB: 9};
const C_REST = [[0, 0, 0], [0, .07, 0], [0, .1, .08], [0, .08, -.08], [0, .12, -.12], [0, .16, -.13], [-.025, .06, .05], [.025, .06, .05], [-.025, .06, -.05], [.025, .06, -.05]].map(a => new THREE.Vector3(...a));
function buildCatGeo() {
  const P = [], s = 9;
  P.push(skg(gM(SPH(1, s, 7), mul(tr(0, .073, 0), gS(.042, .043, .088))), {b: v => v.z > .06 ? [DB.head > 0 ? CB.head : 2, CB.body, .25] : [CB.body], r: v => v.y < .055 && v.z > 0 ? 0 : 1}));
  P.push(skg(mergeGeometries([gM(SPH(1, s, 7), mul(tr(0, .108, .098), gS(.036, .032, .033))), gM(new THREE.ConeGeometry(.013, .028, 4), tr(-.019, .138, .095, 0, 0, .25)), gM(new THREE.ConeGeometry(.013, .028, 4), tr(.019, .138, .095, 0, 0, -.25)), gM(SPH(1, 6, 4), mul(tr(0, .1, .124), gS(.018, .013, .012)))]), {b: [CB.head], r: v => v.z > .118 && v.y < .106 ? 0 : 1}));
  P.push(skg(mergeGeometries([gM(SPH(.0065, 5, 4), tr(-.013, .114, .128)), gM(SPH(.0065, 5, 4), tr(.013, .114, .128))]), {b: [CB.head], r: 3}));
  P.push(skg(gM(SPH(.004, 4, 3), tr(0, .104, .134)), {b: [CB.head], r: 4}));
  const tp = [[0, .08, -.08], [0, .12, -.12], [0, .16, -.13], [0, .195, -.12]];
  for (let k = 0; k < 3; k++) { const a = new THREE.Vector3(...tp[k]), b = new THREE.Vector3(...tp[k + 1]), d = b.clone().sub(a), L = d.length(); const g = new THREE.CylinderGeometry(.0075 - k * .0012, .009 - k * .0012, L * 1.15, 6, 2); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()))); g.applyMatrix4(tr(...a.clone().add(b).multiplyScalar(.5).toArray())); P.push(skg(g, {b: [CB.t1 + k], r: 1})); }
  for (const [x, z, b] of [[-.025, .05, CB.fA], [.025, .05, CB.fB], [-.025, -.05, CB.bA], [.025, -.05, CB.bB]]) P.push(skg(mergeGeometries([lim(.008, .011, .065, 5, tr(x, .032, z)), gM(SPH(1, 5, 4), mul(tr(x, .006, z + .005), gS(.011, .007, .013)))]), {b: v => v.y > .05 ? [b, CB.body, .5] : [b], r: v => v.y < .02 ? 0 : 1}));
  return mergeSk(P);
}
// ---- birds (pigeon / gull / duck)
const BB = {root: 0, body: 1, head: 2, wA: 3, wB: 4, tail: 5, feet: 6};
const B_REST = [[0, 0, 0], [0, .035, 0], [0, .055, .028], [-.018, .045, 0], [.018, .045, 0], [0, .04, -.035], [0, .015, 0]].map(a => new THREE.Vector3(...a));
function buildBirdGeo() {
  const P = [];
  P.push(skg(gM(SPH(1, 8, 6), mul(tr(0, .036, 0), gS(.021, .021, .036))), {b: [BB.body], r: 1}));
  P.push(skg(mergeGeometries([gM(SPH(.0135, 7, 5), tr(0, .064, .033)), gM(new THREE.CylinderGeometry(.009, .013, .022, 6), tr(0, .052, .026, 0, .5))]), {b: v => v.y > .058 ? [BB.head] : [BB.head, BB.body, .5], r: 2}));
  P.push(skg(gM(new THREE.TorusGeometry(.011, .004, 4, 8), tr(0, .053, .026, 0, 1.0)), {b: [BB.head, BB.body, .5], p: 1, r: 4}));
  P.push(skg(gM(new THREE.ConeGeometry(.0045, .016, 4), tr(0, .062, .05, 0, Math.PI / 2)), {b: [BB.head], r: 3}));
  P.push(skg(mergeGeometries([gM(SPH(.0028, 4, 3), tr(-.011, .068, .04)), gM(SPH(.0028, 4, 3), tr(.011, .068, .04))]), {b: [BB.head], r: 6}));
  for (const [sx, w] of [[-1, BB.wA], [1, BB.wB]]) P.push(skg(gM(SPH(1, 7, 4), mul(tr(sx * .021, .044, -.006), gS(.0045, .015, .033))), {b: [w], r: 5}));
  for (const [sx, w] of [[-1, BB.wA], [1, BB.wB]]) P.push(skg(gM(new THREE.BoxGeometry(.06, .003, .03), tr(sx * .05, .046, -.004)), {b: [w], p: 2, r: 5}));
  P.push(skg(gM(new THREE.BoxGeometry(.02, .003, .03), tr(0, .036, -.046, 0, .2)), {b: [BB.tail], r: 5}));
  P.push(skg(mergeGeometries([lim(.0018, .0018, .018, 3, tr(-.007, .009, 0)), lim(.0018, .0018, .018, 3, tr(.007, .009, 0))]), {b: [BB.feet], p: 0, r: 7}));
  return mergeSk(P);
}
// ---- equine (horse / donkey + cart)
const EB = {root: 0, body: 1, neck: 2, head: 3, tail: 4, fA: 5, fB: 6, bA: 7, bB: 8, eA: 9, eB: 10, wheel: 11};
const E_REST = [[0, 0, 0], [0, .36, 0], [0, .42, .15], [0, .56, .26], [0, .4, -.2], [-.05, .3, .13], [.05, .3, .13], [-.05, .3, -.13], [.05, .3, -.13], [-.02, .6, .27], [.02, .6, .27], [0, .13, -.62]].map(a => new THREE.Vector3(...a));
function buildEquineGeo() {
  const P = [], s = 10;
  P.push(skg(mergeGeometries([gM(SPH(1, s, 8), mul(tr(0, .36, 0), gS(.085, .095, .2))), gM(SPH(1, s, 6), mul(tr(0, .37, .12), gS(.08, .095, .09))), gM(SPH(1, s, 6), mul(tr(0, .37, -.13), gS(.083, .09, .09)))]), {b: [EB.body], r: 1}));
  P.push(skg(gM(new THREE.CylinderGeometry(.038, .055, .2, s, 3), tr(0, .48, .2, 0, .65)), {b: v => blendW(v.y, .53, .42, EB.neck, EB.body), r: 1}));
  P.push(skg(gM(new THREE.BoxGeometry(.018, .16, .05, 1, 3, 1), tr(0, .5, .19, 0, .65)), {b: v => blendW(v.y, .53, .42, EB.neck, EB.body), p: 3, r: 2}));
  P.push(skg(mergeGeometries([gM(SPH(1, s, 7), mul(tr(0, .565, .27), gS(.036, .045, .05))), gM(SPH(1, 8, 6), mul(tr(0, .53, .33, 0, .5), gS(.028, .03, .055)))]), {b: [EB.head], r: v => v.z > .34 ? 0 : 1}));
  P.push(skg(mergeGeometries([gM(SPH(.006, 5, 4), tr(-.03, .575, .3)), gM(SPH(.006, 5, 4), tr(.03, .575, .3))]), {b: [EB.head], r: 2}));
  for (const [sx, e] of [[-1, EB.eA], [1, EB.eB]]) {
    P.push(skg(gM(new THREE.ConeGeometry(.011, .04, 4), tr(sx * .02, .615, .265, 0, 0, sx * -.2)), {b: [e], p: 0, r: 1}));
    P.push(skg(gM(new THREE.ConeGeometry(.016, .085, 5), tr(sx * .024, .64, .26, 0, -.1, sx * -.3)), {b: [e], p: 1, r: 1}));
  }
  P.push(skg(gM(new THREE.CylinderGeometry(.006, .022, .2, 6, 3), tr(0, .32, -.235, 0, -.35)), {b: [EB.tail], r: 2}));
  for (const [x, z, b] of [[-.05, .13, EB.fA], [.05, .13, EB.fB], [-.05, -.13, EB.bA], [.05, -.13, EB.bB]])
    P.push(skg(mergeGeometries([lim(.017, .028, .3, 7, tr(x, .16, z)), gM(new THREE.CylinderGeometry(.02, .022, .03, 7), tr(x, .015, z))]), {b: v => v.y > .28 ? [b, EB.body, .5] : [b], r: v => v.y < .032 ? 2 : 1}));
  // cart (part 2): bed, sides, produce, shafts; wheels on their own bone
  const cz = -.62;
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.38, .04, .42), tr(0, .24, cz)), gM(new THREE.BoxGeometry(.02, .1, .42), tr(-.19, .29, cz)), gM(new THREE.BoxGeometry(.02, .1, .42), tr(.19, .29, cz)), gM(new THREE.BoxGeometry(.38, .1, .02), tr(0, .29, cz - .21)), gM(new THREE.BoxGeometry(.015, .015, .5), tr(-.1, .27, -.2, 0, -.15)), gM(new THREE.BoxGeometry(.015, .015, .5), tr(.1, .27, -.2, 0, -.15))]), {b: [EB.root], p: 2, r: 3}));
  P.push(skg(mergeGeometries(Array.from({length: 9}, (_, k) => gM(SPH(.034, 6, 4), tr(-.11 + (k % 3) * .11, .29 + (k % 2) * .02, cz - .12 + Math.floor(k / 3) * .12)))), {b: [EB.root], p: 2, r: v => (Math.round((v.x + .2) * 30) + Math.round(v.z * 30)) % 3 ? 6 : 7}));
  P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.13, .13, .025, 12), tr(-.215, .13, cz, 0, 0, Math.PI / 2)), gM(new THREE.CylinderGeometry(.13, .13, .025, 12), tr(.215, .13, cz, 0, 0, Math.PI / 2)), gM(new THREE.BoxGeometry(.03, .24, .026), tr(-.215, .13, cz)), gM(new THREE.BoxGeometry(.03, .24, .026), tr(.215, .13, cz)), gM(new THREE.BoxGeometry(.03, .026, .24), tr(-.215, .13, cz)), gM(new THREE.BoxGeometry(.03, .026, .24), tr(.215, .13, cz))]), {b: [EB.wheel], p: 2, r: v => Math.abs(v.x) > .2 && Math.hypot(v.y - .13, v.z - cz) > .11 ? 2 : 3}));
  return mergeSk(P);
}
const dogs = new SkinSet('dog', [buildDogGeo()], 11, 16, [true]);
const catSet = new SkinSet('cat', [buildCatGeo()], 10, 16, [true]);
const birdSet = new SkinSet('bird', [buildBirdGeo()], 7, 48, [true]);
const equi = new SkinSet('equine', [buildEquineGeo()], 12, 4, [true]);
const AM = Array.from({length: 12}, () => new THREE.Matrix4());
const _eR = new THREE.Euler(0, 0, 0, 'YXZ');
const rootM = (x, y, z, yaw, sx, sy, sz, pitch = 0, roll = 0) => { _v4.set(x, y, z); warpV(_v4); return AM[0].compose(_v4, _q4.setFromEuler(_eR.set(pitch, yaw, roll, 'YXZ')), _s4.set(sx, sy, sz)); };
const C = h => new THREE.Color(h);
/* dogs: walk with their owner; trot, sniff, sit, wag, pant; leash to the owner's hand */
const leashGeo = new THREE.BufferGeometry(); leashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 8 * 3 * 2), 3));
const leash = new THREE.LineSegments(leashGeo, new THREE.LineBasicMaterial({color: 0x2a1d16})); leash.frustumCulled = false; scene.add(leash);
function dogLook(z) {
  if (z.dog.br) return; const R = rng((z.seedN || 1) * 13 + 5), br = pick(R, Object.keys(BREEDS)); z.dog.br = br; z.dog.an = {gp: 0, lp: new THREE.Vector3(), ry: z.dog.yaw, ear: {a: 0, v: 0}, mode: 0, modeT: 0, sitK: 0};
  const coat = {mutt: z.dog.c, terrier: C(pick(R, ['#e8e0d0', '#c8a070', '#8a6a4a'])), dachs: C(pick(R, ['#7a3a1a', '#3a2a20', '#a86a3a'])), podengo: C(pick(R, ['#c8903a', '#d8b070', '#e8d8b8'])), lab: C(pick(R, ['#e0c080', '#2a2220', '#6a4028']))}[br];
  z.dog.pal = [coat.clone().lerp(C('#f4ecdc'), .55), coat, C('#141010'), C(pick(R, ['#c0302a', '#2f5ea8', '#3f8a4f'])), C('#d86a7a'), coat.clone().multiplyScalar(br === 'mutt' ? .7 : .9)];
}
function updateDogs(t, dt) {
  dogs.begin(); let n = 0, li = 0; const lp = leashGeo.attributes.position.array;
  for (const z of G.citizens) {
    if (!z.dog || !z.dog.on || z.state === 'inside') continue; if (camera.position.distanceTo(z.dog.pos) > lodFar) continue;
    dogLook(z); const d = z.dog, a = d.an, B = BREEDS[d.br], k = d.s * B.k, row = n++;
    dogs.grow(n + 1); if (!d.palSet || d.row !== row) { d.pal.forEach((c, s) => dogs.pal(row, s, c)); dogs.palDone(); d.palSet = true; d.row = row; }
    dogs.add(row, 0);
    const dist = a.lp.distanceTo(d.pos); a.lp.copy(d.pos); const moving = dist > .0005 && dist < .5;
    a.gp += dist / (.16 * k) * Math.PI; a.ry = angLerp(a.ry, d.yaw, Math.min(1, dt * 8));
    if (!moving && t > a.modeT) { a.mode = Math.floor(Math.random() * 4); a.modeT = t + 3 + Math.random() * 5; }
    const mode = moving ? -1 : a.mode, sit = mode === 1; a.sitK += ((sit ? 1 : 0) - a.sitK) * Math.min(1, dt * 5);
    const ph = a.gp, w = moving ? 1 : 0, sk = a.sitK;
    const bob = w * Math.abs(Math.sin(ph)) * .008 * k;
    const R0 = rootM(d.pos.x, d.pos.y + bob - sk * .03 * k, d.pos.z, a.ry, k * B.sc[0], k * B.sc[1], k * B.sc[2]);
    chain(AM[DB.body], R0, 0, .12, -.07 * sk, -.45 * sk, 0, w * Math.sin(ph) * .04); AM[DB.body].multiply(loc(0, 0, .07 * sk));
    const sniff = mode === 0 ? 1 : 0, pant = mode === 2 || (moving && an_(z)) ? 1 : 0;
    const headRx = sniff * (.55 + Math.sin(t * 9) * .06) - sk * .2 - (mode === 2 ? .25 : 0) + w * Math.sin(ph * 2) * .05;
    chain(AM[DB.head], AM[DB.body], 0, .03, .1, headRx, mode === 3 ? Math.sin(t * .8) * .6 : 0, 0);
    const wag = Math.sin(t * (moving ? 14 : 18)) * (sniff ? .25 : .7);
    chain(AM[DB.t1], AM[DB.body], 0, .02, -.11, -.6 + sk * .5, wag, 0); chain(AM[DB.t2], AM[DB.t1], 0, .03, -.06, -.2, wag * .6, 0);
    const ear = spring(a.ear, -w * .4 - headRx * .3, 50, 5, Math.min(dt, .05));
    chain(AM[DB.eA], AM[DB.head], -.03, .04, .02, ear, 0, -ear * .3); chain(AM[DB.eB], AM[DB.head], .03, .04, .02, ear, 0, ear * .3);
    const legs = [[DB.fA, -.035, .07, 0], [DB.fB, .035, .07, Math.PI], [DB.bA, -.035, -.07, Math.PI], [DB.bB, .035, -.07, 0]];
    for (const [b, x, zz, o] of legs) { const back = zz < 0; chain(AM[b], back ? AM[0] : AM[0], x, .1, zz, w * Math.sin(ph + o) * .6 + (back ? -1.3 * sk : .45 * sk), 0, 0); if (back) AM[b].premultiply(_m4.makeTranslation(0, -.03 * sk * k, .02 * sk * k)); }
    for (let b = 0; b < 11; b++) dogs.bone(row, b, AM[b], D_REST[b]);
    const [mA] = partsMask([...B.m.filter(p => p !== 5), ...(pant ? [5] : [])]); dogs.dyn(row, 0, mA, 0, 0, 0); dogs.dyn(row, 1, 0, 0, 0, 0); dogs.dyn(row, 2, 0, 0, 0, 0);
    // leash: from collar to the owner's hand, sagging
    if (z.an?.hand && li < 16) { const c0 = _v4.set(0, .03, .06).applyMatrix4(AM[DB.head]).clone(), h = z.an.hand; for (let q = 0; q < 8; q++) { const u0 = q / 8, u1 = (q + 1) / 8; for (const [u, o] of [[u0, 0], [u1, 3]]) { const sag = Math.sin(u * Math.PI) * .07; lp[(li * 8 + q) * 6 + o] = c0.x + (h.x - c0.x) * u; lp[(li * 8 + q) * 6 + o + 1] = c0.y + (h.y - c0.y) * u - sag; lp[(li * 8 + q) * 6 + o + 2] = c0.z + (h.z - c0.z) * u; } } li++; }
  }
  dogs.end(); leashGeo.setDrawRange(0, li * 16); leashGeo.attributes.position.needsUpdate = true;
}
function an_(z) { return z.an && z.an.spd > .3; }
/* cats: walk, sit, groom, curl up asleep; tabbies, tuxedos, gingers */
const CATPAL = [['#1e1e1e', '#f0ece4'], ['#d8a050', '#f4e4c4', 3], ['#f0ece4', '#f0ece4'], ['#8a8a88', '#d8d4cc', 3], ['#6a4a30', '#c8a880', 3], ['#c87a3a', '#f0dcc0', 3], ['#2a2420', '#f0ece4'], ['#a87a5a', '#e8d8c0', 3], ['#4a4a4a', '#e0dcd4']];
function updateCatsSkin(t, dt) {
  catSet.begin(); catSet.grow(cats.length + 1);
  cats.forEach((k, i) => {
    if (!k.an) { const cp = CATPAL[i % CATPAL.length]; k.an = {ry: k.yaw, gp: 0, lp: k.pos.clone(), sitK: 0, mode: 'sit', modeT: 0, pat: cp[2] || 0}; catSet.pal(i, 1, C(cp[0])); catSet.pal(i, 0, C(cp[1])); catSet.pal(i, 2, C('#141010')); catSet.pal(i, 3, C(pick(Math.random, ['#9ab040', '#d8a830', '#5a9ab0']))); catSet.pal(i, 4, C('#d88a8a')); catSet.palDone(); }
    const a = k.an; if (camera.position.distanceTo(k.pos) > lodFar || (snowAmt > .6 && !k.tgt && !k.roof)) return;
    catSet.add(i, 0);
    const dist = a.lp.distanceTo(k.pos); a.lp.copy(k.pos); const moving = !!k.tgt && dist > .0003 && dist < .5;
    a.gp += dist / .1 * Math.PI; a.ry = angLerp(a.ry, k.yaw, Math.min(1, dt * 8));
    if (!moving && t > a.modeT) { const night = G.hour > 21 || G.hour < 6.5; const r = Math.random(); a.mode = (k.roof || night) && r < .55 ? 'sleep' : r < .3 ? 'groom' : 'sit'; a.modeT = t + 6 + Math.random() * 10; }
    const mode = moving ? 'walk' : a.mode, w = moving ? 1 : 0, ph = a.gp;
    a.sitK += ((mode === 'walk' ? 0 : 1) - a.sitK) * Math.min(1, dt * 4); const sk = a.sitK, sl = mode === 'sleep' ? sk : 0, si = mode === 'sleep' ? 0 : sk;
    const R0 = rootM(k.pos.x, k.pos.y - sl * .035, k.pos.z, a.ry, 1, 1, 1);
    chain(AM[CB.body], R0, 0, .07, -.04 * si, -.55 * si, 0, sl * 1.2); AM[CB.body].multiply(loc(0, 0, .04 * si));
    const groom = mode === 'groom' ? 1 : 0;
    chain(AM[CB.head], AM[CB.body], 0, .03, .08, .5 * si + groom * (.5 + Math.sin(t * 7) * .15) + sl * .6 + w * Math.sin(ph * 2) * .04, groom * .7 + (mode === 'sit' ? Math.sin(t * .5 + i) * .5 : 0) - sl * .9, groom * .3);
    const flick = Math.sin(t * 2.3 + i) > .8 ? Math.sin(t * 15) * .4 : 0;
    chain(AM[CB.t1], AM[CB.body], 0, .01, -.08, -.9 * w + .9 * si - sl * .2, Math.sin(t * 1.4 + i) * .3 * w + si * .9 + sl * 1.6, 0);
    chain(AM[CB.t2], AM[CB.t1], 0, .04, -.04, -.2 * w + .3 * si, si * .9 + sl * 1.2 + Math.sin(t * 1.4 + i + .6) * .3 * w, 0);
    chain(AM[CB.t3], AM[CB.t2], 0, .04, -.01, .3 * w + flick * .5, si * .7 + sl * 1 + flick, 0);
    for (const [b, x, zz, o] of [[CB.fA, -.025, .05, 0], [CB.fB, .025, .05, Math.PI], [CB.bA, -.025, -.05, Math.PI], [CB.bB, .025, -.05, 0]]) {
      const back = zz < 0; let rx = w * Math.sin(ph + o) * .55 + (back ? -1.4 * si : .25 * si), sc = 1;
      if (b === CB.fA && groom) rx = -1.4 + Math.sin(t * 7) * .2; if (sl > .5) sc = .001;
      chain(AM[b], AM[0], x, .06, zz, rx, 0, 0, sc); if (back && si) AM[b].premultiply(_m4.makeTranslation(0, -.015 * si, .012 * si));
    }
    for (let b = 0; b < 10; b++) catSet.bone(i, b, AM[b], C_REST[b]);
    catSet.dyn(i, 0, 0, 0, 0, 0); catSet.dyn(i, 1, 0, 0, a.pat, 0); catSet.dyn(i, 2, 0, 0, 0, 0);
  });
  catSet.end();
}
/* birds: pigeons on plazas (peck, waddle, scatter), gulls on the waterfront, ducks on the river */
const birds2 = [];
const BIRDPAL = {pigeon: ['#8a8c94', '#6a6e7a', '#3a3a3e', '#5a8a6a', '#7a7e88', '#d06a6a', '#1a1a1a'], gull: ['#f4f2ee', '#f4f2ee', '#e8b830', '#f4f2ee', '#a8acb4', '#e8b830', '#1a1a1a'], duck: ['#8a6a4a', '#2f6a3a', '#e8a030', '#f4f2ee', '#7a5a3a', '#e8a030', '#1a1a1a']};
function birdsPlan() {
  const keep = birds2.length; birds2.length = 0;
  const plazas = G.cells.filter(c => c.kind === 'plaza'), water = G.cells.filter(c => c.water), rails = G.cells.filter(c => (c.kind === 'bridge' || c.kind === 'lamp') && DIRS.some(([dx, dz]) => cellAt(c.i + dx, c.j + dz)?.water));
  plazas.slice(0, 6).forEach(c => { for (let k = 0; k < 5; k++) birds2.push({kind: 'pigeon', home: c, pos: new THREE.Vector3(wx(c.i) + (Math.random() - .5) * 1.4, topY(c), wx(c.j) + (Math.random() - .5) * 1.4), yaw: Math.random() * 6, st: 'ground', t: 0, gp: 0}); });
  if (water.length) { for (let k = 0; k < 4; k++) { const c = pick(Math.random, water); birds2.push({kind: 'duck', home: c, pos: new THREE.Vector3(wx(c.i) + (Math.random() - .5), -.3, wx(c.j) + (Math.random() - .5)), yaw: Math.random() * 6, st: 'swim', t: 0, gp: 0}); }
    for (let k = 0; k < 3; k++) { const c = rails.length ? pick(Math.random, rails) : pick(Math.random, water); birds2.push({kind: 'gull', home: c, pos: new THREE.Vector3(wx(c.i), c.water ? -.3 : topY(c) + (c.kind === 'lamp' ? 1.18 : .12), wx(c.j)), yaw: Math.random() * 6, st: c.water ? 'swim' : 'perch', t: 0, gp: 0}); } }
  birdSet.grow(birds2.length + 1);
  birds2.forEach((b, i) => { const P = BIRDPAL[b.kind]; [1, 2, 3, 4, 5, 7, 6].forEach((slot, k) => birdSet.pal(i, slot, C(P[k]))); birdSet.pal(i, 0, C(P[0])); });
  birdSet.palDone();
}
let birdsSig = '';
function updateBirds2(t, dt) {
  const sig = G.cells.filter(c => c.kind === 'plaza' || c.water).length + ':' + G.cells.filter(c => c.kind === 'bridge').length;
  if (sig !== birdsSig) { birdsSig = sig; birdsPlan(); }
  birdSet.begin();
  birds2.forEach((b, i) => {
    const sc = b.kind === 'gull' ? 1.9 : b.kind === 'duck' ? 1.6 : 1.15; let pitch = 0, flap = 0, headRx = 0, wingOpen = 0, feet = b.kind !== 'duck';
    if (b.kind === 'pigeon') {
      if (b.st === 'ground') {
        let scare = null; for (const z of G.citizens) if (z.state !== 'inside' && Math.abs(z.pos.x - b.pos.x) + Math.abs(z.pos.z - b.pos.z) < .5 && (z.moving || z.role === 'child')) { scare = z; break; }
        if (scare || (marketOn && Math.random() < dt * .02)) { b.st = 'fly'; b.t = t; b.ang = Math.random() * 6; b.r = 1.2 + Math.random() * .8; b.h = 1.4 + Math.random(); b.dur = 4 + Math.random() * 4; }
        else {
          if (!b.tgt || t > b.wait) { b.tgt = new THREE.Vector3(wx(b.home.i) + (Math.random() - .5) * 1.5, topY(b.home), wx(b.home.j) + (Math.random() - .5) * 1.5); b.wait = t + 2 + Math.random() * 4; b.peck = Math.random() < .5; }
          const d = b.tgt.clone().sub(b.pos); d.y = 0; const L = d.length();
          if (L > .03) { const st = Math.min(L, dt * .25); b.pos.addScaledVector(d, st / L); b.yaw = Math.atan2(d.x, d.z); b.gp += st / .02 * Math.PI; headRx = Math.sin(b.gp) * .35; }
          else if (b.peck) headRx = Math.max(0, Math.sin(t * 9 + i)) * 1.1;
          b.pos.y = topY(b.home);
        }
      }
      if (b.st === 'fly') {
        const u = (t - b.t) / b.dur, cx = wx(b.home.i), cz = wx(b.home.j), a = b.ang + u * 5;
        const up = Math.min(1, u * 4), down = u > .8 ? (u - .8) / .2 : 0;
        const tx = cx + Math.cos(a) * b.r * (1 - down), tz = cz + Math.sin(a) * b.r * (1 - down), ty = topY(b.home) + b.h * Math.sin(Math.min(1, up) * Math.PI / 2) * (1 - down);
        b.yaw = Math.atan2(tx - b.pos.x, tz - b.pos.z) || b.yaw; b.pos.set(tx, ty, tz); flap = Math.sin(t * 28 + i) * (down > .6 ? .3 : 1); wingOpen = 1; feet = false; pitch = -.15;
        if (u >= 1) { b.st = 'ground'; b.tgt = null; }
      }
    } else if (b.kind === 'duck') {
      if (!b.tgt || b.pos.distanceTo(b.tgt) < .05) { const w = G.cells.filter(c => c.water && Math.abs(c.i - b.home.i) + Math.abs(c.j - b.home.j) < 4); const c = w.length ? pick(Math.random, w) : b.home; b.tgt = new THREE.Vector3(wx(c.i) + (Math.random() - .5) * .9, -.3, wx(c.j) + (Math.random() - .5) * .9); }
      const d = b.tgt.clone().sub(b.pos); d.y = 0; const L = d.length(); if (L > .01) { b.pos.addScaledVector(d, Math.min(L, dt * .1) / L); b.yaw = angLerp(b.yaw, Math.atan2(d.x, d.z), dt * 2); }
      b.pos.y = (typeof water !== 'undefined' ? water.position.y : -.32) - .012 + Math.sin(t * 2 + i) * .004; const dip = Math.sin(t * .4 + i * 2) > .93; pitch = dip ? 1.1 : 0; headRx = dip ? .5 : Math.sin(t * 1.3 + i) * .1;
    } else {
      if (b.st === 'perch' && Math.random() < dt * .03) { b.st = 'fly'; b.t = t; b.dur = 8 + Math.random() * 6; b.base = b.pos.clone(); }
      if (b.st === 'fly') {
        const u = (t - b.t) / b.dur, a = u * Math.PI * 2, R = 3;
        const tx = b.base.x + Math.sin(a) * R, tz = b.base.z + (1 - Math.cos(a)) * R * .6, ty = b.base.y + Math.sin(u * Math.PI) * 2.2;
        b.yaw = Math.atan2(tx - b.pos.x, tz - b.pos.z) || b.yaw; b.pos.set(tx, ty, tz); wingOpen = 1; feet = false; flap = Math.sin(t * 9 + i) > .3 ? Math.sin(t * 14 + i) * .7 : .15; pitch = -.1;
        if (u >= 1) { b.st = 'perch'; b.pos.copy(b.base); }
      } else if (b.st === 'swim') { b.pos.y = (typeof water !== 'undefined' ? water.position.y : -.32) - .01; feet = false; headRx = Math.sin(t + i) * .1; }
      else headRx = Math.sin(t * .7 + i * 3) * .15;
    }
    if (camera.position.distanceTo(b.pos) > lodFar) return; birdSet.add(i, 0);
    const R0 = rootM(b.pos.x, b.pos.y, b.pos.z, b.yaw, sc, sc, sc, pitch);
    chain(AM[BB.body], R0, 0, .035, 0, 0, 0, 0);
    chain(AM[BB.head], AM[BB.body], 0, .02, .028, headRx, b.kind !== 'pigeon' || b.st !== 'ground' ? Math.sin(t * .9 + i * 2) * .5 : 0, 0);
    for (const [w, sx] of [[BB.wA, -1], [BB.wB, 1]]) chain(AM[w], AM[BB.body], sx * .018, .01, 0, 0, 0, sx * (wingOpen * (1.25 + flap * .9)));
    chain(AM[BB.tail], AM[BB.body], 0, .005, -.035, wingOpen ? -.1 : .15, 0, 0);
    chain(AM[BB.feet], R0, 0, .015, 0, 0, 0, 0);
    for (let k = 0; k < 7; k++) birdSet.bone(i, k, AM[k], B_REST[k]);
    const [mA] = partsMask([...(feet ? [0] : []), ...(b.kind === 'pigeon' ? [1] : []), ...(wingOpen ? [2] : [])]);
    birdSet.dyn(i, 0, mA, 0, 0, 0); birdSet.dyn(i, 1, 0, 0, 0, 0); birdSet.dyn(i, 2, 0, 0, 0, 0);
  });
  birdSet.end();
}
/* working animals: a donkey cart wandering the streets by day, a horse at market day */
const equines = [{kind: 'donkey', pos: new THREE.Vector3(), yaw: 0, path: [], wait: 0, gp: 0, lp: new THREE.Vector3(), on: false, ry: 0}, {kind: 'horse', pos: new THREE.Vector3(), yaw: 0, path: [], gp: 0, lp: new THREE.Vector3(), on: false, ry: 0}];
equi.pal(0, 1, C('#7a7068')); equi.pal(0, 0, C('#d8d0c4')); equi.pal(0, 2, C('#2a2420')); equi.pal(0, 3, C('#7a5a38')); equi.pal(0, 6, C('#d9472b')); equi.pal(0, 7, C('#7aa33a'));
equi.pal(1, 1, C('#7a4a2a')); equi.pal(1, 0, C('#e8dcc8')); equi.pal(1, 2, C('#1e1612')); equi.pal(1, 3, C('#7a5a38')); equi.pal(1, 6, C('#e8a23a')); equi.pal(1, 7, C('#7aa33a')); equi.palDone();
function updateEquines(t, dt) {
  equi.begin();
  const plazas = G.cells.filter(c => c.kind === 'plaza'), streets = G.cells.filter(c => walkable(c) && !c.water && !c.kind);
  const day_ = G.hour > 8 && G.hour < 19;
  equines.forEach((e, i) => {
    if (e.kind === 'donkey') {
      if (!streets.length) return;
      if (!e.on) { const c = pick(Math.random, streets); e.pos.set(wx(c.i), walkY(c), wx(c.j)); e.lp.copy(e.pos); e.on = true; }
      if (day_ && !e.path.length && t > e.wait) { const from = cellOf(e.pos), to = pick(Math.random, plazas.length && Math.random() < .5 ? plazas : streets); const p = navPath(e.pos.x, e.pos.z, wx(to.i), wx(to.j)); if (p) e.path = p; e.wait = t + 8 + Math.random() * 10; }
      if (e.path.length && day_) { const tg = e.path[0], d = tg.clone().sub(e.pos); const L = Math.hypot(d.x, d.z); if (L < .04) { e.path.shift(); if (!e.path.length) e.wait = t + 6 + Math.random() * 8; } else { const st = Math.min(L, dt * .32 * Math.max(.5, G.speed)); e.pos.x += d.x / L * st; e.pos.z += d.z / L * st; e.pos.y = groundAt(e.pos.x, e.pos.z); e.yaw = Math.atan2(d.x, d.z); } }
    } else {
      e.on = marketOn && plazas.length > 0; if (!e.on) return;
      if (!e.home || e.home.kind !== 'plaza') { e.home = plazas[0]; e.pos.set(wx(e.home.i) + .55, topY(e.home), wx(e.home.j) - .2); e.yaw = 1.2; e.lp.copy(e.pos); }
    }
    if (camera.position.distanceTo(e.pos) > lodFar) return; equi.add(i, 0);
    const dist = e.lp.distanceTo(e.pos); e.lp.copy(e.pos); const moving = dist > .0004 && dist < .5; e.gp += dist / .22 * Math.PI; e.ry = angLerp(e.ry, e.yaw, Math.min(1, dt * 5));
    const k = e.kind === 'donkey' ? .82 : 1.05, w = moving ? 1 : 0, ph = e.gp;
    const R0 = rootM(e.pos.x, e.pos.y + w * Math.abs(Math.sin(ph * 2)) * .006, e.pos.z, e.ry, k, k, k);
    chain(AM[EB.body], R0, 0, .36, 0, 0, 0, w * Math.sin(ph) * .02);
    const graze = !moving && Math.sin(t * .25 + i * 3) > .3 ? 1 : 0;
    chain(AM[EB.neck], AM[EB.body], 0, .06, .15, graze * .9 + w * Math.sin(ph * 2) * .06 + Math.sin(t * .6 + i) * .05, 0, 0);
    chain(AM[EB.head], AM[EB.neck], 0, .14, .11, graze * .3 + (graze ? Math.sin(t * 6) * .05 : 0), Math.sin(t * .4 + i) * .2, 0);
    chain(AM[EB.tail], AM[EB.body], 0, .04, -.2, .2, Math.sin(t * 1.7 + i) * (Math.sin(t * .5) > .4 ? .6 : .15), 0);
    const flick = Math.sin(t * 1.1 + i * 2) > .85 ? Math.sin(t * 20) * .4 : 0;
    chain(AM[EB.eA], AM[EB.head], -.02, .04, .01, flick, 0, 0); chain(AM[EB.eB], AM[EB.head], .02, .04, .01, -flick * .5, 0, 0);
    for (const [b, x, zz, o] of [[EB.fA, -.05, .13, 0], [EB.bB, .05, -.13, Math.PI * .5], [EB.fB, .05, .13, Math.PI], [EB.bA, -.05, -.13, Math.PI * 1.5]]) chain(AM[b], AM[0], x, .3, zz, w * Math.sin(ph + o) * .45 + (b === EB.fA && !moving && Math.sin(t * .9 + i) > .95 ? -.5 : 0), 0, 0);
    chain(AM[EB.wheel], AM[0], 0, .13, -.62, -e.gp * .35, 0, 0);
    for (let b = 0; b < 12; b++) equi.bone(i, b, AM[b], E_REST[b]);
    const [mA] = partsMask(e.kind === 'donkey' ? [1, 2, 3] : [0, 3]); equi.dyn(i, 0, mA, 0, 0, 0); equi.dyn(i, 1, 0, 0, 0, 0); equi.dyn(i, 2, 0, 0, 0, 0);
  });
  equi.end();
}
let _aT = 0;
function updateAnimals(t) { const dt = Math.min(.1, Math.max(0, t - _aT)); _aT = t; updateDogs(t, dt); updateCatsSkin(t, dt); updateBirds2(t, dt); updateEquines(t, dt); }
window.__ch = {top: c => topY(c), wx: i => wx(i), r: () => renderer, hum: () => hum, cit: () => G.citizens, stats: () => ({people: {...PEOPLE_STATS}, verts: Object.fromEntries(SK.sets.map(S => [S.name, S.stats()])), calls: renderer.info.render.calls}), birds: () => birds2.map(b => b.kind + ':' + b.st), eq: () => equines.map(e => e.on), cats: () => cats.map(k => k.an?.mode)};
controls.minDistance = 3.6; // allow a close look at the people
window.__ch.gpuRow = (setName, row) => { const S = SK.sets.find(s => s.name === setName); const rt = new THREE.WebGLRenderTarget(S.W, 1, {type: THREE.FloatType}); const m = new THREE.ShaderMaterial({uniforms: {T: {value: S.U.uBones.value}, R: {value: row}}, vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: 'uniform highp sampler2D T;uniform int R;void main(){gl_FragColor=texelFetch(T,ivec2(int(gl_FragCoord.x),R),0);}'}); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m), sc = new THREE.Scene(); sc.add(q); const cam = new THREE.Camera(); renderer.setRenderTarget(rt); renderer.render(sc, cam); const out = new Float32Array(S.W * 4); renderer.readRenderTargetPixels(rt, 0, 0, S.W, 1, out); renderer.setRenderTarget(null); return [Array.from(out.slice(0, 12)).map(v => +v.toFixed(3)), Array.from(S.bd.slice(row * S.W * 4, row * S.W * 4 + 12)).map(v => +v.toFixed(3))]; };
window.__ch.snap = (onlySkin, w = 480, h = 360) => { const rt = new THREE.WebGLRenderTarget(w, h); const hid = []; if (onlySkin) scene.children.forEach(o => { if (!SK.sets.some(S => S.lods.some(L => L.mesh === o)) && !o.isLight && o.visible) { o.visible = false; hid.push(o); } }); const a = camera.aspect; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setRenderTarget(rt); renderer.setClearColor(0x88aacc, 1); renderer.clear(); renderer.render(scene, camera); const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); renderer.setRenderTarget(null); hid.forEach(o => o.visible = true); camera.aspect = a; camera.updateProjectionMatrix(); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'), im = cx.createImageData(w, h); for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); cx.putImageData(im, 0, 0); return cv.toDataURL('image/png'); };
window.__ch.freeze = () => { G.updateCity = () => { }; };
window.__ch.stress = n => { G.updateCity = () => { }; const base = G.citizens.slice(); const walk = G.cells.filter(c => walkable(c) && !c.water); for (let k = 0; k < n; k++) { const s = base[k % base.length], c = pick(Math.random, walk); const z = Object.assign(Object.create(null), s, {an: null, lx: null, pos: new THREE.Vector3(wx(c.i) + (Math.random() - .5) * 1.4, walkY(c), wx(c.j) + (Math.random() - .5) * 1.4), state: k % 3 ? 'idle' : 'talk', talk: null, seedN: (s.seedN || 1) + k * 7919, yaw: Math.random() * 6, moving: false}); z.id = G.citizens.length; G.citizens.push(z); } buildPeopleMeshes(); return G.citizens.length; };
window.__ch.time = (frames = 30) => new Promise(res => { let n = 0, pa = 0; const o = G.poseAll; G.poseAll = t => { const a = performance.now(); o(t); pa += performance.now() - a; }; const t0 = performance.now(); const f = () => { if (++n < frames) requestAnimationFrame(f); else { G.poseAll = o; res({frame: +((performance.now() - t0) / frames).toFixed(1), pose: +(pa / frames).toFixed(2), people: {...PEOPLE_STATS}}); } }; requestAnimationFrame(f); });
window.__ch.partVerts = lod => { const g = hum.lods[lod].geo, a = g.attributes.aPart.array, r = {}; for (const v of a) r[v] = (r[v] || 0) + 1; return {total: a.length, idx: g.index.count / 3, parts: r}; };
window.__ch.birdObjs = () => birds2; window.__ch.equines = () => equines; window.__ch.catObjs = () => cats;
/* performance readout: ?perf in the URL or Shift+P */
const perfEl = document.createElement('div'); perfEl.id = 'perfHud';
perfEl.style.cssText = 'position:fixed;right:10px;top:calc(60px + env(safe-area-inset-top));z-index:9;font:600 11px ui-monospace,Menlo,monospace;color:#f3e6cc;background:rgba(20,14,10,.78);padding:6px 9px;border-radius:8px;pointer-events:none;white-space:pre;display:none';
document.body.appendChild(perfEl);
let perfOn = /[?&]perf/.test(location.search), perfLast = performance.now(), perfAcc = 0, perfN = 0, perfTxt = '';
if (perfOn) perfEl.style.display = 'block';
addEventListener('keydown', e => { if (e.key === 'P' && e.shiftKey) { perfOn = !perfOn; perfEl.style.display = perfOn ? 'block' : 'none'; } });
renderer.info.autoReset = false;
const _ua = updateAnimals;
updateAnimals = t => {
  const now = performance.now(), dt = now - perfLast; perfLast = now; perfAcc += dt; perfN++;
  if (perfOn && perfAcc > 500) {
    const I = renderer.info.render, ps = PEOPLE_STATS, v = SK.sets.reduce((a, S) => a + S.stats().reduce((x, y) => x + y, 0), 0);
    perfTxt = `${(1000 * perfN / perfAcc).toFixed(0)} fps  ${(perfAcc / perfN).toFixed(1)} ms\ncalls ${I.calls}  tris ${(I.triangles / 1000).toFixed(0)}k\npeople ${ps.near}/${ps.mid}/${ps.far} posed ${ps.posed}\nskin verts ${(v / 1000).toFixed(0)}k  q ${quality}`;
    perfEl.textContent = perfTxt; perfAcc = 0; perfN = 0;
  } else if (perfAcc > 500) { perfAcc = 0; perfN = 0; }
  renderer.info.reset(); _ua(t);
};

const _B = new THREE.Matrix4(), _P = new THREE.Matrix4(), _T = new THREE.Matrix4(), _H = new THREE.Matrix4(), _J = new THREE.Matrix4(), _K = new THREE.Matrix4(), _R = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3(), ZM = new THREE.Matrix4().makeScale(0, 0, 0);
const R4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => _R.compose(_V.set(x, y, z), _Q.setFromEuler(_E.set(rx, ry, rz)), _S.set(s, s, s));
const _X0 = new THREE.Matrix4();

export {updateAnimals};
