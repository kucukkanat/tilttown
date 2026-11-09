import './sim.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {G} from '../state.js';
import {mul, pick, rng, tr} from '../core/util.js';
import {camera, grad, scene} from '../core/scene.js';
import {isOpenAt, raining} from '../world/streets.js';
import {OWN} from '../game/identity.js';
import {warpV} from '../world/organic.js';
import {lodFar, lodMid} from '../game/extras.js';
import {seasonOf} from '../game/progression.js';

G.poseAll = poseAll; // reassignable: other modules wrap it
/* ---------- people rendering: instanced body parts ---------- */
const peopleMat = new THREE.MeshToonMaterial({vertexColors: true, gradientMap: grad});

/* ==========================================================================
   SKIN: GPU-skinned, instanced characters (people + animals)
   bones live in a float texture (3 texels per bone = 3x4 affine), one row per
   character; per-character palette in a second texture; optional parts are
   toggled per character by bitmask; faces/body morphs are vertex codes.
   ========================================================================== */
const SK = {sets: [], maskScene: new THREE.Scene()};
const SKIN_GLSL = `
uniform highp sampler2D uBones; uniform highp sampler2D uPal; uniform int uDyn;
attribute vec2 aBone; attribute float aBW; attribute float aPart; attribute float aReg; attribute float aFace; attribute float aRow;
varying vec3 vSkC; varying float vSkPat; varying vec3 vSkL; varying float vSkF;
vec3 skP; vec3 skN;
mat4 skM(int b,int r){vec4 a=texelFetch(uBones,ivec2(b*3,r),0),c=texelFetch(uBones,ivec2(b*3+1,r),0),d=texelFetch(uBones,ivec2(b*3+2,r),0);
  return mat4(a.x,c.x,d.x,0.,a.y,c.y,d.y,0.,a.z,c.z,d.z,0.,a.w,c.w,d.w,1.);}
void skinIt(vec3 p,vec3 n){
  int r=int(aRow+.5);
  vec4 d0=texelFetch(uBones,ivec2(uDyn,r),0),d1=texelFetch(uBones,ivec2(uDyn+1,r),0),d2=texelFetch(uBones,ivec2(uDyn+2,r),0);
  float vis=1.;
  if(aPart>-.5){float m=aPart<23.5?d0.x:d0.y;float bi=aPart<23.5?aPart:aPart-24.;vis=mod(floor(m/exp2(bi)),2.);}
  float fc=floor(aFace+.001),ff=aFace-fc;
  if(fc==1.)p.y=.552+(p.y-.552)*(1.-d1.x*.9);
  else if(fc==2.)p.y+=.006*d1.y+.006*ff*max(0.,-d0.z)-.002*(1.-ff)*max(0.,-d0.z);
  else if(fc==3.)p.y+=.0065*d0.z*ff*ff-.0016*d0.z*(1.-ff);
  else if(fc==4.)p.y+=.0065*d0.z*ff*ff-.0016*d0.z*(1.-ff)-.012*d0.w*(1.-.75*ff*ff);
  else if(fc==10.)p.z+=.03*d1.w*ff;
  else if(fc==11.)p.z+=.014*d2.x*ff;
  else if(fc==12.)p.x*=1.+.35*d2.y*ff;
  mat4 S=aBW*skM(int(aBone.x+.5),r)+(1.-aBW)*skM(int(aBone.y+.5),r);
  skP=vis>.5?(S*vec4(p,1.)).xyz:vec3(0.,-99.,0.);
  skN=normalize(mat3(S)*n);
  vSkC=texelFetch(uPal,ivec2(int(aReg+.5),r),0).rgb;
  vSkPat=aReg>.5&&aReg<1.5?d1.z:0.;
  vSkL=p; vSkF=d2.z;
}`;
function skinPatchVS(src, withNormal) {
  src = SKIN_GLSL + '\n' + src;
  if (withNormal && src.includes('#include <beginnormal_vertex>')) {
    src = src.replace('#include <beginnormal_vertex>', 'skinIt(position,normal);vec3 objectNormal=skN;\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif');
    src = src.replace('#include <begin_vertex>', 'vec3 transformed=skP;');
  } else src = src.replace('#include <begin_vertex>', 'skinIt(position,vec3(0.,1.,0.));vec3 transformed=skP;');
  return src;
}
function skinMats(U) {
  const fade = fs => 'varying float vSkF;\n' + fs.replace('void main() {', 'void main() {\n if(vSkF>.001&&fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))<vSkF)discard;');
  const hook = (m, normal, frag) => { m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U); sh.vertexShader = skinPatchVS(sh.vertexShader, normal); sh.fragmentShader = fade(frag ? frag(sh.fragmentShader) : sh.fragmentShader); }; m.customProgramCacheKey = () => 'skin' + m.type; return m; };
  const toon = hook(new THREE.MeshToonMaterial({gradientMap: grad}), true, fs => 'varying vec3 vSkC;varying float vSkPat;varying vec3 vSkL;\n' + fs.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
    `vec3 kc=vSkC;
     if(vSkPat>.5){float st;vec3 alt;
       if(vSkPat<1.5){st=step(.5,fract(vSkL.y*72.));alt=vec3(.86,.84,.78);}
       else if(vSkPat<2.5){st=.5*step(.5,fract(vSkL.y*46.))+.5*step(.5,fract((vSkL.x+vSkL.z)*46.));alt=kc*.55;}
       else {st=step(.62,fract(vSkL.z*60.+sin(vSkL.x*90.)*.3));alt=kc*.5;}
       kc=mix(kc,alt,st);}
     vec4 diffuseColor=vec4(diffuse*kc,opacity);`));
  const depth = hook(new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking}), false);
  const mask = hook(new THREE.MeshBasicMaterial({color: 0xffffff}), false);
  return {toon, depth, mask};
}
class SkinSet {
  constructor(name, lodGeos, nb, cap, shadowLods = [true, true, true]) {
    this.name = name; this.nb = nb; this.W = nb * 3 + 3; this.cap = 0;
    this.U = {uBones: {value: null}, uPal: {value: null}, uDyn: {value: nb * 3}};
    this.M = skinMats(this.U); this.lods = [];
    lodGeos.forEach((g, k) => {
      const ig = new THREE.InstancedBufferGeometry(); ig.index = g.index; for (const a in g.attributes) ig.setAttribute(a, g.attributes[a]); ig.instanceCount = 0;
      const mesh = new THREE.Mesh(ig, this.M.toon); mesh.frustumCulled = false; mesh.castShadow = shadowLods[k]; mesh.receiveShadow = true; mesh.customDepthMaterial = this.M.depth; mesh.raycast = () => { };
      const twin = new THREE.Mesh(ig, this.M.mask); twin.frustumCulled = false; twin.raycast = () => { };
      scene.add(mesh); SK.maskScene.add(twin); if (k === 2) twin.layers.set(31); this.lods.push({geo: ig, mesh, twin, n: 0, verts: g.attributes.position.count});
    });
    this.grow(cap); SK.sets.push(this);
  }
  grow(cap) {
    cap = Math.max(16, Math.ceil(cap / 16) * 16); if (cap <= this.cap) return; this.cap = cap;
    const bd = new Float32Array(this.W * cap * 4); if (this.bd) bd.set(this.bd); this.bd = bd;
    const pd = new Float32Array(16 * cap * 4); if (this.pd) pd.set(this.pd); this.pd = pd;
    this.U.uBones.value?.dispose(); this.U.uPal.value?.dispose();
    const mk = (d, w) => { const t = new THREE.DataTexture(d, w, cap, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
    this.U.uBones.value = mk(bd, this.W); this.U.uPal.value = mk(pd, 16);
    this.lods.forEach(L => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); a.setUsage(THREE.DynamicDrawUsage); L.geo.setAttribute('aRow', a); L.twin.geometry = L.geo; });
  }
  begin() { this.lods.forEach(L => L.n = 0); }
  add(row, lod) { const L = this.lods[lod]; L.geo.attributes.aRow.array[L.n++] = row; }
  end() { this.lods.forEach(L => { L.geo.instanceCount = L.n; L.mesh.visible = L.twin.visible = L.n > 0; L.geo.attributes.aRow.needsUpdate = true; }); this.U.uBones.value.needsUpdate = true; }
  bone(row, b, M, r) {
    const e = M.elements, d = this.bd, o = (row * this.W + b * 3) * 4, x = r ? r.x : 0, y = r ? r.y : 0, z = r ? r.z : 0;
    d[o] = e[0]; d[o + 1] = e[4]; d[o + 2] = e[8]; d[o + 3] = e[12] - (e[0] * x + e[4] * y + e[8] * z);
    d[o + 4] = e[1]; d[o + 5] = e[5]; d[o + 6] = e[9]; d[o + 7] = e[13] - (e[1] * x + e[5] * y + e[9] * z);
    d[o + 8] = e[2]; d[o + 9] = e[6]; d[o + 10] = e[10]; d[o + 11] = e[14] - (e[2] * x + e[6] * y + e[10] * z);
  }
  dyn(row, k, a, b, c, dd) { const d = this.bd, o = (row * this.W + this.nb * 3 + k) * 4; d[o] = a; d[o + 1] = b; d[o + 2] = c; d[o + 3] = dd; }
  pal(row, slot, col) { const o = (row * 16 + slot) * 4; this.pd[o] = col.r; this.pd[o + 1] = col.g; this.pd[o + 2] = col.b; this.pd[o + 3] = 1; }
  palDone() { this.U.uPal.value.needsUpdate = true; }
  stats() { return this.lods.map(L => L.n * L.verts); }
}
/* geometry helpers: tag every vertex with bones / weight / part / palette region / morph code */
const _skv = new THREE.Vector3();
function skg(geo, o) {
  if (!geo.index) { const n = geo.attributes.position.count; geo.setIndex(Array.from({length: n}, (_, i) => i)); }
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position, n = pos.count, ab = new Float32Array(n * 2), aw = new Float32Array(n), ap = new Float32Array(n), ar = new Float32Array(n), af = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    _skv.fromBufferAttribute(pos, i); const b = typeof o.b === 'function' ? o.b(_skv) : o.b;
    ab[i * 2] = b[0]; ab[i * 2 + 1] = b[1] ?? b[0]; aw[i] = b[2] ?? 1; ap[i] = o.p ?? -1;
    ar[i] = typeof o.r === 'function' ? o.r(_skv) : o.r; af[i] = o.f ? o.f(_skv) : 0;
  }
  geo.setAttribute('aBone', new THREE.BufferAttribute(ab, 2)); geo.setAttribute('aBW', new THREE.BufferAttribute(aw, 1)); geo.setAttribute('aPart', new THREE.BufferAttribute(ap, 1)); geo.setAttribute('aReg', new THREE.BufferAttribute(ar, 1)); geo.setAttribute('aFace', new THREE.BufferAttribute(af, 1));
  return geo;
}
const gM = (g, m) => (g.applyMatrix4(m), g);
const gS = (sx, sy, sz) => new THREE.Matrix4().makeScale(sx, sy, sz);
const SPH = (r, w, h, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
const blendW = (y, hi, lo, bHi, bLo) => { const w = THREE.MathUtils.clamp((y - lo) / (hi - lo), 0, 1); const s = w * w * (3 - 2 * w); return [bHi, bLo, s]; };
const mergeSk = parts => mergeGeometries(parts.filter(Boolean));

/* ---------------- humans: rig + geometry ---------------- */
const HB = {root: 0, pel: 1, spi: 2, head: 3, thA: 4, shA: 5, ftA: 6, thB: 7, shB: 8, ftB: 9, uaA: 10, faA: 11, hnA: 12, uaB: 13, faB: 14, hnB: 15, hair: 16, skirt: 17, prA: 18, prB: 19, prBody: 20};
const H_NB = 21, HY = .542;
const H_REST = [[0, 0, 0], [0, .27, 0], [0, .27, 0], [0, HY, 0], [-.038, .265, 0], [-.038, .14, 0], [-.038, .02, 0], [.038, .265, 0], [.038, .14, 0], [.038, .02, 0],
  [-.084, .452, 0], [-.084, .352, 0], [-.084, .257, 0], [.084, .452, 0], [.084, .352, 0], [.084, .257, 0], [0, .56, -.03], [0, .29, 0], [-.084, .245, 0], [.084, .245, 0], [0, 0, 0]].map(a => new THREE.Vector3(...a));
// optional parts (bitmask ids)
const HP = {eyes: 1, brows: 2, mouth: 3, hShort: 4, hLong: 5, hBun: 6, hTail: 7, hCurly: 8, hSides: 9, beard: 10, moust: 11, glasses: 12, cap: 13, beret: 14, lenco: 15, straw: 16, beanie: 17, skirt: 18, apron: 19, belt: 20, collar: 21, scarf: 22, sbag: 23,
  pack: 24, shopBag: 25, pastry: 26, cane: 27, umb: 28, cup: 29, glass: 30, phone: 31, paper: 32, broom: 33, bread: 34, guitar: 35, easel: 36, cart: 37, tray: 38, suitcase: 39};
// palette slots
const HR = {skin: 0, shirt: 1, legs: 2, shoes: 3, hair: 4, hat: 5, bag: 6, white: 7, skirt: 8, fore: 9, accent: 10, dark: 11, lips: 12, wood: 13, umb: 14, gold: 15};
function buildHumanGeo(q) {
  const seg = [5, 6, 10][q], P = [], hd = new THREE.Vector3(0, HY, 0);
  const at = (x, y, z, rx = 0, ry = 0, rz = 0) => tr(x, y, z, ry, rx, rz);
  // torso + hips + neck: one lathe, elliptical, weighted pelvis->spine->head
  const tp = q === 0 ? [[0, .25], [.07, .27], [.068, .33], [.08, .43], [.07, .47], [.023, .49], [.022, .525], [0, .53]]
    : [[0, .25], [.05, .255], [.068, .27], [.075, .295], [.07, .33], [.066, .36], [.072, .40], [.08, .43], [.082, .447], [.07, .468], [.045, .483], [.024, .491], [.022, .51], [.022, .526], [0, .531]];
  P.push(skg(gM(new THREE.LatheGeometry(tp.map(([r, y]) => new THREE.Vector2(r, y)), seg + 2), gS(1, 1, .74)), {
    b: v => v.y > .49 ? blendW(v.y, .525, .495, HB.head, HB.spi) : blendW(v.y, .37, .31, HB.spi, HB.pel),
    r: v => v.y < .334 ? HR.legs : v.y < .487 ? HR.shirt : HR.skin,
    f: v => { if (v.z > .02 && v.y > .3 && v.y < .405) return 10 + .99 * Math.sin(Math.PI * (v.y - .3) / .105) * Math.min(1, v.z / .055); if (v.z > .02 && v.y > .395 && v.y < .455) return 11 + .99 * Math.sin(Math.PI * (v.y - .395) / .06) * Math.min(1, v.z / .055); if (v.y > .3 && v.y < .39) return 12 + .99 * Math.sin(Math.PI * (v.y - .3) / .09); return 0; }}));
  // legs: continuous tubes with a soft knee
  const lp = q === 0 ? [[0, .02], [.019, .03], [.027, .1], [.026, .14], [.034, .24], [.036, .31], [0, .32]]
    : [[0, .018], [.017, .022], [.019, .035], [.022, .06], [.028, .09], [.027, .115], [.025, .14], [.027, .16], [.032, .2], [.035, .25], [.036, .31], [0, .32]];
  for (const [sx, th, sh] of [[-.038, HB.thA, HB.shA], [.038, HB.thB, HB.shB]]) {
    P.push(skg(gM(new THREE.LatheGeometry(lp.map(([r, y]) => new THREE.Vector2(r, y)), seg), mul(tr(sx, 0, 0), gS(1, 1, .9))), {
      b: v => v.y > .27 ? blendW(v.y, .3, .27, HB.pel, th) : blendW(v.y, .165, .118, th, sh), r: HR.legs}));
    // shoe: rounded toe + sole
    const ft = sx < 0 ? HB.ftA : HB.ftB;
    P.push(skg(mergeGeometries([gM(SPH(.026, seg, Math.max(4, seg >> 1)), mul(tr(sx, .018, .022), gS(.85, .62, 1.75))), gM(new THREE.BoxGeometry(.044, .02, .06), tr(sx, .012, -.004))]), {b: [ft], r: HR.shoes}));
    if (q) P.push(skg(gM(new THREE.BoxGeometry(.048, .007, .098), tr(sx, .0035, .016)), {b: [ft], r: HR.dark}));
  }
  // arms: tube shoulder->elbow->wrist, sleeve colour switches at the elbow
  const ap = q === 0 ? [[0, .258], [.016, .265], [.019, .35], [.025, .44], [.026, .47], [0, .478]]
    : [[0, .257], [.0145, .262], [.016, .275], [.0175, .31], [.019, .345], [.02, .36], [.022, .39], [.024, .42], [.026, .45], [.027, .468], [0, .48]];
  for (const [sx, ua, fa, hn] of [[-.084, HB.uaA, HB.faA, HB.hnA], [.084, HB.uaB, HB.faB, HB.hnB]]) {
    P.push(skg(gM(new THREE.LatheGeometry(ap.map(([r, y]) => new THREE.Vector2(r, y)), seg), mul(tr(sx, 0, 0), gS(1, 1, .92))), {
      b: v => v.y > .44 ? [ua, HB.spi, 1 - .45 * THREE.MathUtils.smoothstep(v.y, .44, .475)] : blendW(v.y, .372, .334, ua, fa), r: v => v.y > .355 ? HR.shirt : HR.fore}));
    if (q) P.push(skg(gM(new THREE.TorusGeometry(.0165, .0035, 4, seg), mul(tr(sx, .268, 0), new THREE.Matrix4().makeRotationX(Math.PI / 2))), {b: [fa], r: HR.fore}));
    // mitten hand with thumb
    P.push(skg(mergeGeometries([gM(SPH(.017, seg, Math.max(4, seg >> 1)), mul(tr(sx, .24, .002), gS(.72, 1.25, .95))), ...(q ? [gM(SPH(.0075, 6, 4), mul(tr(sx - Math.sign(sx) * -.0, .248, .014), gS(1, 1.5, 1)))] : [])]), {b: [hn], r: HR.skin}));
  }
  // head
  P.push(skg(mergeGeometries([gM(SPH(.052, seg + 2, seg), mul(tr(0, HY, 0), gS(.95, 1.12, 1))),
    ...(q ? [gM(SPH(.0115, 6, 5), mul(tr(-.05, HY, -.002), gS(.5, 1, .8))), gM(SPH(.0115, 6, 5), mul(tr(.05, HY, -.002), gS(.5, 1, .8))), gM(SPH(.0085, 6, 5), mul(tr(0, HY - .005, .051), gS(.85, 1, 1.25)))] : []),
    ...(q === 2 ? [gM(SPH(.022, 8, 5), mul(tr(0, HY - .036, .02), gS(1.2, .8, 1.15)))] : [])]), {b: [HB.head], r: HR.skin}));
  if (q) {
    // eyes: sclera + pupil (near), dots (mid)
    for (const sx of [-.018, .018]) {
      if (q === 2) P.push(skg(gM(SPH(.0088, 8, 6), mul(tr(sx, HY + .01, .043), gS(1.1, 1, .6))), {b: [HB.head], p: HP.eyes, r: HR.white, f: () => 1}));
      P.push(skg(gM(SPH(q === 2 ? .0056 : .0075, 6, 4), tr(sx, HY + .01, q === 2 ? .0485 : .047)), {b: [HB.head], p: HP.eyes, r: HR.dark, f: () => 1}));
      P.push(skg(gM(new THREE.BoxGeometry(.018, .0038, .005), at(sx, HY + .025, .05, 0, 0, -Math.sign(sx) * .12)), {b: [HB.head], p: HP.brows, r: HR.hair, f: v => 2 + .99 * THREE.MathUtils.clamp(1 - Math.abs(v.x) / .027, 0, 1)}));
    }
    if (q === 2) P.push(skg(gM(new THREE.BoxGeometry(.023, .0032, .005, 6, 1, 1), tr(0, HY - .024, .0475)), {b: [HB.head], p: HP.mouth, r: HR.lips, f: v => (v.y > HY - .024 ? 3 : 4) + .99 * Math.min(1, Math.abs(v.x) / .0115)}));
    else P.push(skg(gM(new THREE.BoxGeometry(.018, .003, .004), tr(0, HY - .024, .048)), {b: [HB.head], p: HP.mouth, r: HR.lips}));
  }
  // hair styles (head bone; long and tail swing on the hair spring)
  const cap = (r = .057, cov = .5, sy = 1.15) => gM(SPH(r, seg + 2, Math.max(4, seg >> 1), 0, Math.PI * 2, 0, Math.PI * cov), mul(tr(0, HY + .006, -.006), gS(.97, sy, 1.04)));
  const hairB = v => v.y < HY - .01 ? [HB.hair, HB.head, THREE.MathUtils.clamp((HY - .01 - v.y) / .08, 0, 1)] : [HB.head];
  P.push(skg(cap(), {b: [HB.head], p: HP.hShort, r: HR.hair}));
  P.push(skg(mergeGeometries([cap(.058, .58), gM(new THREE.BoxGeometry(.104, .13, .036, 1, 3, 1), tr(0, HY - .05, -.042)), gM(new THREE.BoxGeometry(.02, .09, .05), tr(-.048, HY - .03, -.01)), gM(new THREE.BoxGeometry(.02, .09, .05), tr(.048, HY - .03, -.01))]), {b: hairB, p: HP.hLong, r: HR.hair}));
  P.push(skg(mergeGeometries([cap(.056, .55), gM(SPH(.028, 8, 6), tr(0, HY + .05, -.042))]), {b: [HB.head], p: HP.hBun, r: HR.hair}));
  P.push(skg(mergeGeometries([cap(.056, .55), gM(new THREE.CylinderGeometry(.016, .005, .11, 6, 3), tr(0, HY - .02, -.07, 0, -.3)), gM(SPH(.009, 5, 4), tr(0, HY + .028, -.055))]), {b: v => v.z < -.058 ? [HB.hair, HB.head, THREE.MathUtils.clamp((HY + .02 - v.y) / .07, 0, 1)] : [HB.head], p: HP.hTail, r: HR.hair}));
  P.push(skg(mergeGeometries(Array.from({length: q === 2 ? 10 : 6}, (_, k) => { const a = k * 2.4, e = .25 + (k % 4) * .28; return gM(SPH(.021, 5, 4), tr(Math.cos(a) * .046 * Math.cos(e), HY + .015 + Math.sin(e) * .05, Math.sin(a) * .046 * Math.cos(e) - .008)); })), {b: [HB.head], p: HP.hCurly, r: HR.hair}));
  P.push(skg(gM(new THREE.TorusGeometry(.05, .011, 4, seg + 2, Math.PI * 1.25), mul(tr(0, HY - .004, -.004), new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(Math.PI * .125 + Math.PI)))), {b: [HB.head], p: HP.hSides, r: HR.hair}));
  // facial hair, glasses
  P.push(skg(gM(SPH(.04, seg, Math.max(4, seg >> 1), 0, Math.PI * 2, Math.PI * .45, Math.PI * .4), mul(tr(0, HY - .004, .008), gS(1.05, 1.15, 1.06))), {b: [HB.head], p: HP.beard, r: HR.hair}));
  if (q === 2) P.push(skg(gM(new THREE.CapsuleGeometry(.0045, .022, 2, 5), at(0, HY - .015, .051, 0, 0, Math.PI / 2)), {b: [HB.head], p: HP.moust, r: HR.hair}));
  if (q === 2) P.push(skg(mergeGeometries([gM(new THREE.TorusGeometry(.0105, .0016, 3, 10), tr(-.019, HY + .01, .055)), gM(new THREE.TorusGeometry(.0105, .0016, 3, 10), tr(.019, HY + .01, .055)), gM(new THREE.BoxGeometry(.01, .002, .002), tr(0, HY + .013, .056)), gM(new THREE.BoxGeometry(.002, .002, .05), tr(-.05, HY + .012, .03)), gM(new THREE.BoxGeometry(.002, .002, .05), tr(.05, HY + .012, .03))]), {b: [HB.head], p: HP.glasses, r: HR.dark}));
  // hats
  P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.058, .061, .032, seg + 2), tr(0, HY + .04, -.004)), gM(SPH(.059, seg + 2, 4, 0, Math.PI * 2, 0, Math.PI * .5), mul(tr(0, HY + .052, -.004), gS(1, .35, 1))), gM(new THREE.BoxGeometry(.08, .008, .05), at(0, HY + .03, .05, -.15))]), {b: [HB.head], p: HP.cap, r: HR.hat}));
  P.push(skg(gM(new THREE.CylinderGeometry(.066, .058, .025, seg + 2), at(.008, HY + .05, -.004, 0, 0, .18)), {b: [HB.head], p: HP.beret, r: HR.hat}));
  P.push(skg(mergeGeometries([cap(.06, .62, 1.12), gM(new THREE.ConeGeometry(.026, .05, 5), at(0, HY - .045, -.05, .5)), gM(new THREE.BoxGeometry(.11, .03, .04), tr(0, HY - .035, -.03))]), {b: v => v.y < HY - .03 ? [HB.hair, HB.head, .5] : [HB.head], p: HP.lenco, r: HR.hat}));
  P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.11, .11, .006, seg + 4), tr(0, HY + .035, -.004)), gM(new THREE.CylinderGeometry(.05, .058, .045, seg + 2), tr(0, HY + .058, -.004)), gM(new THREE.CylinderGeometry(.0585, .0585, .01, seg + 2), tr(0, HY + .042, -.004))]), {b: [HB.head], p: HP.straw, r: v => v.y > HY + .038 && v.y < HY + .048 && Math.hypot(v.x, v.z + .004) < .06 ? HR.accent : HR.gold}));
  P.push(skg(mergeGeometries([cap(.06, .52, 1.25), gM(new THREE.TorusGeometry(.058, .008, 4, seg + 2), mul(tr(0, HY + .015, -.006), new THREE.Matrix4().makeRotationX(Math.PI / 2))), gM(SPH(.012, 5, 4), tr(0, HY + .085, -.006))]), {b: [HB.head], p: HP.beanie, r: HR.hat}));
  // clothing
  P.push(skg(gM(new THREE.CylinderGeometry(.071, .108, .16, seg + 2, q ? 3 : 1, true), mul(tr(0, .275, 0), gS(1, 1, .82))), {b: v => [HB.skirt, HB.pel, THREE.MathUtils.clamp((.33 - v.y) / .13, 0, 1)], p: HP.skirt, r: HR.skirt}));
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.11, .2, .006, 1, 3, 1), tr(0, .345, .058)), gM(new THREE.BoxGeometry(.08, .06, .006), tr(0, .432, .062)), ...(q ? [gM(new THREE.BoxGeometry(.004, .05, .004), tr(-.03, .48, .045)), gM(new THREE.BoxGeometry(.004, .05, .004), tr(.03, .48, .045))] : [])]), {b: v => blendW(v.y, .37, .31, HB.spi, HB.pel), p: HP.apron, r: HR.white}));
  if (q) P.push(skg(gM(new THREE.TorusGeometry(.068, .006, 4, seg + 2), mul(tr(0, .334, 0), gS(1, .74, 1)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))), {b: [HB.pel], p: HP.belt, r: HR.dark}));
  if (q) P.push(skg(gM(new THREE.TorusGeometry(.03, .007, 4, seg + 2), mul(tr(0, .487, .003), gS(1, 1, .9)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))), {b: [HB.spi], p: HP.collar, r: HR.accent}));
  P.push(skg(mergeGeometries([gM(new THREE.TorusGeometry(.03, .013, 5, seg + 2), mul(tr(0, .49, .002), new THREE.Matrix4().makeRotationX(Math.PI / 2))), gM(new THREE.BoxGeometry(.022, .08, .01), at(.02, .44, .045, .15, 0, .1))]), {b: [HB.spi], p: HP.scarf, r: HR.accent}));
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.07, .06, .028), tr(.088, .325, .01)), gM(new THREE.BoxGeometry(.072, .018, .03), tr(.088, .35, .012)), gM(new THREE.BoxGeometry(.006, .13, .006), tr(.072, .41, .035, 0, 0, -.08))]), {b: v => blendW(v.y, .37, .31, HB.spi, HB.pel), p: HP.sbag, r: HR.bag}));
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.1, .12, .05), tr(0, .41, -.078)), gM(new THREE.BoxGeometry(.08, .04, .015), tr(0, .38, -.105))]), {b: [HB.spi], p: HP.pack, r: HR.bag}));
  // hand-held props (prA = left hand, prB = right hand)
  const pA = H_REST[HB.prA], pB = H_REST[HB.prB];
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.07, .08, .042), tr(pA.x, pA.y - .075, pA.z)), gM(new THREE.TorusGeometry(.018, .003, 3, 8, Math.PI), tr(pA.x, pA.y - .035, pA.z))]), {b: [HB.prA], p: HP.shopBag, r: v => v.y > pA.y - .04 ? HR.dark : HR.bag}));
  if (q === 2) P.push(skg(gM(new THREE.TorusGeometry(.012, .007, 4, 7, Math.PI * 1.3), tr(pA.x, pA.y - .004, pA.z + .012)), {b: [HB.prA], p: HP.pastry, r: HR.gold}));
  P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.006, .006, .3, 5), tr(pB.x, pB.y - .14, pB.z + .01)), gM(new THREE.TorusGeometry(.012, .005, 4, 6, Math.PI), tr(pB.x, pB.y + .005, pB.z + .005, Math.PI / 2))]), {b: [HB.prB], p: HP.cane, r: HR.wood}));
  P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.005, .005, .32, 4), tr(pB.x, pB.y + .15, pB.z)), gM(new THREE.ConeGeometry(.27, .09, q ? 10 : 7, 1, true), tr(pB.x, pB.y + .32, pB.z)), ...(q ? [gM(SPH(.008, 4, 3), tr(pB.x, pB.y + .37, pB.z))] : [])]), {b: [HB.prB], p: HP.umb, r: v => v.y > pB.y + .27 ? HR.umb : HR.dark}));
  if (q === 2) {
    P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.011, .009, .017, 8), tr(pB.x, pB.y + .006, pB.z + .014)), gM(new THREE.CylinderGeometry(.016, .016, .003, 8), tr(pB.x, pB.y - .004, pB.z + .014))]), {b: [HB.prB], p: HP.cup, r: HR.white}));
    P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.011, .006, .02, 8), tr(pB.x, pB.y + .02, pB.z + .014)), gM(new THREE.CylinderGeometry(.002, .002, .02, 4), tr(pB.x, pB.y, pB.z + .014))]), {b: [HB.prB], p: HP.glass, r: HR.lips}));
    P.push(skg(gM(new THREE.BoxGeometry(.013, .024, .004), tr(pB.x, pB.y + .004, pB.z + .012)), {b: [HB.prB], p: HP.phone, r: HR.dark}));
    P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.11, .075, .003), at(pB.x - .055, pB.y + .03, pB.z + .03, -.5)), gM(new THREE.BoxGeometry(.004, .075, .006), at(pB.x - .055, pB.y + .03, pB.z + .03, -.5))]), {b: [HB.prB], p: HP.paper, r: v => Math.abs(v.x - (pB.x - .055)) < .003 ? HR.dark : HR.white}));
    P.push(skg(gM(new THREE.CapsuleGeometry(.012, .15, 2, 6), at(-.1, .41, .0, Math.PI / 2 - .25, .3, 0)), {b: [HB.uaA], p: HP.bread, r: HR.gold}));
  }
  P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.006, .006, .42, 4), tr(pB.x, pB.y - .08, pB.z + .02)), gM(new THREE.BoxGeometry(.08, .05, .025), tr(pB.x, pB.y - .3, pB.z + .02))]), {b: [HB.prB], p: HP.broom, r: v => v.y < pB.y - .27 ? HR.gold : HR.wood}));
  P.push(skg(mergeGeometries([gM(SPH(.06, q ? 8 : 5, q ? 5 : 3), mul(tr(0, .36, .07, 0, 0, .9), mul(tr(0, -.03, 0), gS(1, 1.25, .35)))), gM(new THREE.BoxGeometry(.02, .16, .012), mul(tr(0, .36, .07, 0, 0, .9), tr(0, .1, 0)))]), {b: [HB.spi], p: HP.guitar, r: HR.wood}));
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.02, .55, .02), tr(-.1, .27, .32, 0, .15)), gM(new THREE.BoxGeometry(.02, .55, .02), tr(.1, .27, .32, 0, .15)), gM(new THREE.BoxGeometry(.02, .5, .02), tr(0, .25, .2, 0, -.3)), gM(new THREE.BoxGeometry(.26, .2, .015), tr(0, .45, .35, 0, .15))]), {b: [HB.prBody], p: HP.easel, r: v => v.y > .36 && v.z > .34 ? HR.white : HR.wood}));
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.26, .14, .34), tr(0, .17, .4)), gM(new THREE.BoxGeometry(.24, .1, .14), tr(0, .29, .35)), gM(new THREE.CylinderGeometry(.06, .06, .02, 10), tr(-.14, .06, .4, 0, 0, Math.PI / 2)), gM(new THREE.CylinderGeometry(.06, .06, .02, 10), tr(.14, .06, .4, 0, 0, Math.PI / 2)), gM(new THREE.BoxGeometry(.24, .015, .015), tr(0, .26, .21))]), {b: [HB.prBody], p: HP.cart, r: v => v.y < .12 ? HR.dark : HR.wood}));
  if (q === 2) P.push(skg(mergeGeometries([gM(new THREE.CylinderGeometry(.05, .05, .006, 10), tr(pA.x, pA.y + .02, pA.z + .03)), gM(new THREE.CylinderGeometry(.01, .009, .016, 6), tr(pA.x - .015, pA.y + .031, pA.z + .03)), gM(new THREE.CylinderGeometry(.01, .009, .016, 6), tr(pA.x + .015, pA.y + .031, pA.z + .03))]), {b: [HB.prA], p: HP.tray, r: v => v.y > pA.y + .024 ? HR.white : HR.dark}));
  P.push(skg(mergeGeometries([gM(new THREE.BoxGeometry(.075, .105, .04), tr(pA.x - .01, pA.y - .085, pA.z)), gM(new THREE.BoxGeometry(.03, .012, .01), tr(pA.x - .01, pA.y - .026, pA.z)), gM(new THREE.BoxGeometry(.006, .02, .008), tr(pA.x - .023, pA.y - .03, pA.z)), gM(new THREE.BoxGeometry(.006, .02, .008), tr(pA.x + .003, pA.y - .03, pA.z))]), {b: [HB.prA], p: HP.suitcase, r: v => v.y > pA.y - .035 ? HR.dark : HR.umb}));
  const keep0 = new Set([-1, HP.hShort, HP.hLong, HP.skirt, HP.umb, HP.cart, HP.easel, HP.cap, HP.beret, HP.suitcase]);
  return mergeSk(q ? P : P.filter(g => keep0.has(g.attributes.aPart.array[0])));
}

/* ---------------- people: look, pose, actions ---------------- */
const hum = new SkinSet('human', [buildHumanGeo(2), buildHumanGeo(1), buildHumanGeo(0)], H_NB, 64, [true, true, false]);
let peopleParts = null; // legacy flag: truthy once built
const PCOL = {white: new THREE.Color('#f4efe6'), dark: new THREE.Color('#1c1714'), lips: new THREE.Color('#8a3a34'), wood: new THREE.Color('#6a4a30'), gold: new THREE.Color('#d9a654'), wine: new THREE.Color('#6a1a2a')};
const ACCENTS = ['#c0442e', '#e8dcc0', '#2f4f6f', '#d9a654', '#3f6a4f', '#8a3a5a', '#f0ece4'];
function lookX(z) {
  if (z.lx && z.lx.seed === z.seedN) return z.lx;
  const R = rng((z.seedN || 1) * 7 + 3), adult = z.role !== 'child', elder = z.role === 'retiree';
  const x = {seed: z.seedN};
  x.pattern = adult && R() < .22 ? (R() < .6 ? 1 : 2) : 0;
  x.belly = adult && (z.male ? R() < .35 : R() < .15) ? .3 + R() * .7 : 0;
  x.bust = adult && !z.male ? .5 + R() * .5 : 0;
  x.hips = !z.male && adult ? .2 + R() * .5 : 0;
  x.shK = z.male && adult ? 1 + R() * .12 : .94 + R() * .06;
  x.glasses = elder ? R() < .45 : adult && R() < .1;
  x.moust = z.male && adult && !z.beard && R() < (elder ? .35 : .15);
  x.curly = z.hair === 1 || z.hair === 2 ? R() < .18 : false;
  x.sides = z.male && elder && z.hair === 0;
  x.lenco = !z.male && elder && R() < .35;
  x.collar = adult && R() < .45; x.belt = !z.skirt && R() < .6;
  x.pack = z.role === 'student' ? R() < .7 : z.role === 'child' ? R() < .5 : false;
  x.sbag = !x.pack && adult && !z.male && R() < .35;
  x.accent = new THREE.Color(pick(R, ACCENTS));
  x.scarfP = R(); x.hatP = R(); x.fid = R();
  x.gait = z.role === 'child' ? 'kid' : elder ? 'old' : (z.role === 'student' || z.role === 'courier') ? 'brisk' : 'adult';
  z.lx = x; return x;
}
const GAIT = {adult: {cyc: .3, bob: .012, arm: .4, th: .5, kn: .85, hip: .1, tw: .14, sq: 0}, brisk: {cyc: .34, bob: .014, arm: .5, th: .55, kn: .9, hip: .12, tw: .18, sq: 0},
  old: {cyc: .2, bob: .006, arm: .18, th: .32, kn: .55, hip: .05, tw: .06, sq: 0}, kid: {cyc: .2, bob: .03, arm: .7, th: .6, kn: 1, hip: .12, tw: .15, sq: .06}};
function buildPeopleMeshes() {
  hum.grow(G.citizens.length + 8); peopleParts = true;
  G.citizens.forEach((z, i) => {
    const x = lookX(z);
    hum.pal(i, HR.skin, z.skin); hum.pal(i, HR.shirt, z.shirt); hum.pal(i, HR.legs, z.skirt ? z.tights : z.pants); hum.pal(i, HR.shoes, z.shoeC); hum.pal(i, HR.hair, z.hairC);
    hum.pal(i, HR.hat, z.hatC); hum.pal(i, HR.bag, z.bagC); hum.pal(i, HR.white, PCOL.white); hum.pal(i, HR.skirt, z.skirtC || z.pants); hum.pal(i, HR.fore, z.shortSleeve ? z.skin : z.shirt);
    hum.pal(i, HR.accent, z.isMayor ? new THREE.Color(OWN.crest.c1) : x.accent); hum.pal(i, HR.dark, PCOL.dark); hum.pal(i, HR.lips, z.skin.clone().lerp(PCOL.lips, .55).multiplyScalar(.8)); hum.pal(i, HR.wood, PCOL.wood); hum.pal(i, HR.umb, z.umbC); hum.pal(i, HR.gold, PCOL.gold);
  });
  hum.palDone();
}
// bone matrices (pose space)
const HM = Array.from({length: H_NB}, () => new THREE.Matrix4());
const _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _v4 = new THREE.Vector3(), _s4 = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const loc = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => _m4.compose(_v4.set(x, y, z), _q4.setFromEuler(_e4.set(rx, ry, rz)), _s4.set(s, s, s));
const chain = (out, parent, x, y, z, rx, ry, rz, s) => out.multiplyMatrices(parent, loc(x, y, z, rx, ry, rz, s));
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
const spring = (s, target, k, c, dt) => { s.v += ((target - s.a) * k - s.v * c) * dt; s.a += s.v * dt; return s.a; };
let _pT = 0, waveScan = 0;
const PEOPLE_STATS = {near: 0, mid: 0, far: 0, posed: 0};
function partsMask(list) { let a = 0, b = 0; for (const p of list) { if (p < 24) a += 2 ** p; else b += 2 ** (p - 24); } return [a, b]; }
function seasonNow() { return typeof seasonOf === 'function' ? seasonOf(G.day).n : 'Autumn'; }
function poseAll(t) {
  if (!peopleParts) return;
  const dt = Math.min(.1, Math.max(0, t - _pT)); _pT = t;
  const rain = raining(), sea = seasonNow(), cam = camera.position, nearD = Math.min(14, lodMid * .55);
  hum.begin(); let posed = 0; const frameN = (G.poseAll.n = (G.poseAll.n || 0) + 1);
  const st = PEOPLE_STATS; st.near = st.mid = st.far = 0;
  // waving: occasional greeting between passers-by (scan a few people per frame)
  if (G.citizens.length) for (let k = 0; k < 6; k++) { const z = G.citizens[waveScan++ % G.citizens.length]; if (!z.an || z.state !== 'go' || !z.chatty || z.an.waveCD > t) continue; for (const o of G.citizens) { if (o === z || o.state === 'inside' || o.role === 'child') continue; if (Math.abs(o.pos.x - z.pos.x) + Math.abs(o.pos.z - z.pos.z) < 1.3) { if (Math.random() < .35) { z.an.waveT = t; z.an.lookAt = o; z.an.lookUntil = t + 1.6; } z.an.waveCD = t + 6 + Math.random() * 8; break; } } }
  { const m = OWN.mayor; if (m && m.an && m.state === 'go' && !(m.an.mwCD > t)) { m.an.waveT = t; m.an.lookAt = {pos: camera.position}; m.an.lookUntil = t + 1.6; m.an.mwCD = t + 7; } }
  G.citizens.forEach((z, i) => {
    const an = z.an;
    if (z.state === 'inside') { // fade out where they went in, then vanish
      if (!an || an.fade <= 0 || an.row !== i) { if (an) an.fade = 0; return; }
      an.fade = Math.max(0, an.fade - dt * 2.6); if (!an.fade) return;
      hum.add(i, an.lod ?? 1); hum.dyn(i, 2, lookX(z).bust, lookX(z).hips, 1 - an.fade, 0); return;
    }
    const camD = cam.distanceTo(z.pos); if (camD > lodFar) return;
    const lod = camD < nearD ? 0 : camD < lodMid ? 1 : 2;
    hum.add(i, lod); st[['near', 'mid', 'far'][lod]]++;
    if (lod === 2 && (frameN + i) % 3 && an && an.row === i && an.fade >= 1) return; // far: pose every 3rd frame
    posed++; poseHuman(z, i, t, lod === 2 && an?.row === i ? dt * 3 : dt, lod, rain, sea);
  });
  st.posed = posed; hum.end(); updatePlayBalls(t);
}
function poseHuman(z, i, t, dt, lod, rain, sea) {
  const x = lookX(z), gait = GAIT[x.gait], child = z.role === 'child', s = z.s;
  const an = z.an ||= {ry: z.yaw, gp: z.phase, lp: z.pos.clone(), sitK: z.state === 'sit' ? 1 : 0, hair: {a: 0, v: 0}, skirt: {a: 0, v: 0}, bag: {a: 0, v: 0}, look: 0, lookT: 0, glance: 0, fade: 0, row: i, lod: 1, blinkT: t + Math.random() * 3, spd: 0, waveT: -9, waveCD: 0, talkS: -9, prevState: '', sip: 0, sipT: t + 2 + Math.random() * 4, fidT: 0, fid: 0, laughU: 0, pointU: 0};
  // ---- state bookkeeping
  an.row = i; an.lod = lod; an.fade = Math.min(1, an.fade + dt * 2.6);
  if (an.prevState !== z.state) { if (z.state === 'talk') an.talkS = t; an.prevState = z.state; }
  // render position (kids playing circle around a resting parent)
  const p = z.pos; let px = p.x, py = p.y, pz = p.z, yawT = z.yaw, playing = false;
  if (child && z.state === 'follow' && z.parent && !z.parent.moving && ['sit', 'talk', 'idle', 'queue'].includes(z.parent.state)) {
    playing = true; const a = t * 1.5 + z.id * 2.1, r = .55; px = z.parent.pos.x + Math.cos(a) * r; pz = z.parent.pos.z + Math.sin(a) * r; yawT = Math.atan2(-Math.sin(a), Math.cos(a)); an.play = {x: px + Math.sin(yawT) * .1, z: pz + Math.cos(yawT) * .1, y: py};
  } else an.play = null;
  // gait phase from distance actually travelled: feet don't slide
  const ddx = px - an.lp.x, ddz = pz - an.lp.z, dist = Math.hypot(ddx, ddz); an.lp.set(px, py, pz);
  const moving = playing || (z.moving && dist < .5);
  const v = dist < .5 && dt > 0 ? dist / dt : 0; const acc = (v - an.spd) / Math.max(dt, 1e-3); an.spd += (v - an.spd) * Math.min(1, dt * 8);
  if (dist < .5) an.gp += dist / (gait.cyc * s) * Math.PI;
  const walk = THREE.MathUtils.clamp(an.spd / (.25 * s), 0, 1) * (moving ? 1 : 0), ph = an.gp;
  // smooth turning
  an.ry = angLerp(an.ry, yawT, Math.min(1, dt * (z.state === 'sit' ? 14 : 9)));
  // sit blend
  an.sitK += ((z.state === 'sit' ? 1 : 0) - an.sitK) * Math.min(1, dt * 5); const sk = an.sitK;
  // ---- head look
  let lookTgt = null; if (z.state === 'talk' && z.talk?.with) lookTgt = z.talk.with.pos; else if (an.lookAt && t < an.lookUntil) lookTgt = an.lookAt.pos;
  if (lookTgt) { const ly = Math.atan2(lookTgt.x - px, lookTgt.z - pz); an.glance = THREE.MathUtils.clamp(((ly - an.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.1, 1.1); }
  else if (t > an.lookT) { an.glance = Math.random() < .55 ? 0 : (Math.random() - .5) * (walk > .5 ? .9 : 1.6); an.lookT = t + 2 + Math.random() * 5; }
  an.look += (an.glance - an.look) * Math.min(1, dt * 4);
  // ---- mood / face
  const joy = z.joy ?? z.parent?.joy ?? .6;
  if (t > an.blinkT) { an.blinkT = t + 2.2 + Math.random() * 4; an.blinkS = t; }
  const blink = t - (an.blinkS || -9) < .13 ? 1 : 0;
  let smile = THREE.MathUtils.clamp((joy - .45) * 2.2, -1, 1), open = 0, brow = 0;
  // ---- base pose values
  const HIP = .27, idle = Math.sin(t * 1.3 + z.id) * .025;
  const sq = gait.sq * walk * Math.abs(Math.sin(ph)); // kids squash
  let by = (py + walk * Math.abs(Math.cos(ph)) * gait.bob * s) * (1 - sk) + (py + .25 - HIP * s) * sk;
  if (z.state === 'dance') by += Math.abs(Math.sin(t * 6 + (z.dancePh || 0))) * .05;
  let pelRx = 0, pelRy = walk * Math.sin(ph) * gait.hip, pelRz = walk * Math.sin(ph) * .035 + idle * .3;
  let torRx = z.lean + walk * .05 + (x.gait === 'brisk' ? walk * .04 : 0) - sk * .06, torRy = -walk * Math.sin(ph) * gait.tw, torRz = 0;
  let nod = -z.lean * .7, hYaw = an.look * .75 - torRy - pelRy, hRoll = 0;
  let th = [walk * Math.sin(ph) * gait.th, walk * Math.sin(ph + Math.PI) * gait.th], kn = [walk * Math.max(0, Math.sin(ph + 1.3)) * gait.kn, walk * Math.max(0, Math.sin(ph + Math.PI + 1.3)) * gait.kn];
  const swing = Math.sin(ph - .35) * gait.arm * walk;
  let aA = -swing, aB = swing, eA = .25 + walk * .2, eB = .25 + walk * .2, zA = 0, zB = 0, fyA = 0, fyB = 0;
  let parts = []; let prBrx = 0, prBry = 0, prBrz = 0, prArx = 0, prArz = 0;
  // idle fidgets (standing still)
  const standing = !moving && sk < .5 && ['idle', 'queue', 'go', 'follow'].includes(z.state);
  if (standing) {
    if (t > an.fidT) { an.fidT = t + 5 + Math.random() * 7; an.fid = Math.floor(Math.random() * 5); }
    const shift = Math.sin(t * .7 + z.id) ; pelRz += shift * .045; th[0] += shift * .03; th[1] -= shift * .03; kn[shift > 0 ? 1 : 0] += Math.abs(shift) * .12;
    if (an.fid === 1 && x.gait === 'old') { aA = aB = .35; eA = eB = .6; zA = zB = 0; fyA = .9; fyB = -.9; }
    else if (an.fid === 2 && !child && z.role !== 'retiree') { aA = aB = -.45; eA = eB = 2.1; fyA = -1.1; fyB = 1.1; }
    else if (an.fid === 3 && (z.role === 'student' || z.role === 'worker' || z.role === 'courier')) { aB = -.5; eB = 2.0; nod = .45; parts.push(HP.phone); prBrx = -.9; smile *= .3; }
    else if (an.fid === 4) { aA = aB = .05 + idle; eA = eB = .3; hYaw += Math.sin(t * .9 + z.id) * .4; }
  }
  // ---- sitting
  if (sk > .01) {
    th = th.map(a => a * (1 - sk) - 1.5 * sk); kn = kn.map(a => a * (1 - sk) + 1.5 * sk);
    const sitArms = () => { aA = -.35; aB = -.35; eA = eB = 1.0; };
    if (sk > .5) {
      sitArms(); const biz = z.seat?.biz, kind = biz ? (biz.type === 'winebar' || biz.type === 'tasca' ? 'glass' : biz.type === 'bakery' ? 'pastry' : 'cup') : (z.role === 'retiree' && (x.fid < .6) ? 'paper' : x.fid > .75 && !child ? 'phone' : null);
      if (kind === 'cup' || kind === 'glass') {
        parts.push(kind === 'cup' ? HP.cup : HP.glass);
        if (t > an.sipT) { an.sipS = t; an.sipT = t + 4 + Math.random() * 6; }
        const k = THREE.MathUtils.clamp(Math.sin(Math.min(1, (t - (an.sipS || -9)) / 1.4) * Math.PI) * 1.6, 0, 1);
        aB = -.35 - .75 * k; eB = 1.0 + 1.35 * k; nod = -.15 * k; prBrx = .8 * k * (kind === 'glass' ? 1 : .7);
        if (k > .3) smile = Math.max(smile, .2);
      } else if (kind === 'pastry') { parts.push(HP.pastry, HP.cup); const k = Math.max(0, Math.sin(t * .8 + z.id)); aA = -.35 - .7 * k; eA = 1 + 1.3 * k; }
      else if (kind === 'paper') { parts.push(HP.paper); aA = aB = -.65; eA = eB = 1.55; zA = .25; zB = -.25; nod = .35; fyA = -.3; fyB = .3; prBrx = -.2; }
      else if (kind === 'phone') { parts.push(HP.phone); aB = -.45; eB = 2.0; nod = .45; prBrx = -.9; }
      else if (Math.sin(t * .7 + i * 3) > .6) { aB = -.6; eB = 1.9; }
    }
  }
  // ---- states and actions
  const st = z.state;
  if (st === 'talk') {
    const since = t - an.talkS, other = z.talk?.with, h = other ? (Math.min(z.id, other.id) * 31 + Math.max(z.id, other.id)) % 10 : 9;
    const grownups = !child && other && other.role !== 'child';
    if (since < 1.6) {
      const k = Math.sin(Math.min(1, since / 1.6) * Math.PI);
      if (h < 3 && grownups) { aA = aB = -1.25 * k; eA = eB = 1.0 * k + .25; zA = .35 * k; zB = -.35 * k; fyA = .7 * k; fyB = -.7 * k; torRx += .12 * k; smile = 1; }
      else if (h < 6 && grownups) { aB = -.85 * k; eB = .35; prBrx = 0; aB += Math.sin(since * 14) * .08 * k; smile = Math.max(smile, .5); }
      else { aB = -2.7 * k; eB = .35 + Math.sin(since * 13) * .35 * k; smile = Math.max(smile, .6); brow = .6 * k; }
    } else {
      const speaking = Math.sin(t * 1.25 + (z.id < (other?.id ?? 0) ? 0 : Math.PI)) > 0;
      if (t > an.laughU + 6 && Math.random() < dt * .08) an.laughU = t + 1.4;
      if (t < an.laughU) { nod = -.3; torRz += Math.sin(t * 22) * .025; open = .7 + .3 * Math.sin(t * 18); smile = 1; brow = .4; aA = -.2; eA = 1.6; }
      else if (speaking) {
        open = Math.max(0, Math.sin(t * 11 + z.id)) * .7;
        aB = -.7 + Math.sin(t * 5 + i) * .25; eB = 1.1 + Math.sin(t * 4 + i) * .3;
        if (t > an.pointU + 7 && Math.random() < dt * .05) an.pointU = t + 1.2;
        if (t < an.pointU) { aB = -1.45; eB = .08; zB = -.3; }
        brow = Math.sin(t * 2.3 + z.id) * .4;
      } else { nod += Math.sin(t * 3 + i) * .06; }
      hYaw += Math.sin(t * 1.7) * .12;
    }
  }
  if (st === 'serve') {
    const ty = z.work?.type;
    if (ty === 'fish') { aB = -1 + Math.sin(t * 14) * .35; eB = 1; aA = -.5; eA = 1.2; }
    else if (ty === 'cafe' || ty === 'tasca' || ty === 'winebar') { parts.push(ty === 'cafe' ? HP.cup : HP.glass); const k = (Math.sin(t * 1.8) + 1) / 2; aB = -.8 - .2 * k; eB = 1.3; prBrz = -.9 * k; aA = -.6; eA = 1.3; }
    else { aA = -.2 - Math.max(0, Math.sin(t * 2)) * .4; eA = 1.4; aB = -.3; eB = 1; }
    smile = Math.max(smile, .4);
  }
  if (st === 'idle' && z.step?.act === 'work') {
    if (z.work && z.work !== 'away' && !isOpenAt(z.work.type, G.hour)) { parts.push(HP.broom); const sw = Math.sin(t * 3 + z.id); aA = aB = -.55; eA = eB = .7; zA = .15; zB = -.15; torRy = sw * .3; prBrx = .55; prBry = sw * .4; nod = .25; }
    else { aB = -.5 + Math.sin(t * 2.4) * .3; eB = 1; }
  }
  if (st === 'dance') { const dp = t * 6 + (z.dancePh || 0); aA = -2.4 + Math.sin(dp) * .4; aB = -2.4 - Math.sin(dp) * .4; eA = eB = .4; z.yaw += .01; smile = 1; open = .3; }
  if (st === 'paint') { aB = -1.2 + Math.sin(t * 2) * .2; eB = .9 + Math.sin(t * 3.1) * .2; aA = -.3; eA = 1.2; parts.push(HP.easel); }
  if (st === 'busk') { aA = -.9; eA = 1.6; aB = -.5 + Math.sin(t * 9) * .15; eB = 1.3; parts.push(HP.guitar); open = Math.max(0, Math.sin(t * 6)) * .5; smile = .6; }
  if (z.step?.act === 'deliver' && (st === 'go' || st === 'idle')) { parts.push(HP.cart); aA = aB = -.7; eA = eB = .5; torRx += .12; }
  // walking wave
  const wk = t - an.waveT; if (wk >= 0 && wk < 1.3 && st === 'go') { const k = Math.sin(wk / 1.3 * Math.PI); aB = aB * (1 - k) - 2.6 * k; eB = .35 + Math.sin(t * 13) * .35 * k; smile = Math.max(smile, .7); brow = .5 * k; }
  // carrying: shopping bag / bread under the arm
  const carry = z.carry && sk < .5 && st !== 'serve';
  if (carry) { if (z.carry === 'bakery') { parts.push(HP.bread); aA = .12; eA = .9; zA = .25; } else { parts.push(HP.shopBag); aA = aA * .6; eA = Math.max(.15, eA * .6); } }
  // B&B guests arrive and leave with luggage
  if (z.role === 'guest' && st === 'go' && ((z.step?.act === 'home' && G.day === z.arrive && G.hour < 20) || (z.leaving && z.step?.act === 'away'))) { parts.push(HP.suitcase); aA = .05 + swing * .15; eA = .15; zA = .12; }
  // umbrella / cane
  const umbOn = rain && sk < .5 && st !== 'serve' && st !== 'dance';
  if (umbOn) { aB = -.55; eB = 1.25; parts.push(HP.umb); prBrx = 0; }
  else if (z.cane && sk < .5 && !parts.includes(HP.broom)) { parts.push(HP.cane); aB = -.15 + swing * .3; eB = .35; }
  // kids: run + ball, bouncier
  if (playing) { aA = -swing * 1.3; aB = swing * 1.3; smile = 1; open = .25; }
  // ---- secondary motion (springs)
  const sdt = Math.min(dt, .05);
  const hairA = spring(an.hair, -an.spd * .9 - (walk ? Math.abs(Math.cos(ph)) * .3 : 0) + nod * .5, 60, 7, sdt) - acc * .01;
  const skA = spring(an.skirt, -an.spd * .55, 40, 6, sdt), skZ = Math.sin(ph) * walk * .08;
  const bagA = spring(an.bag, -aA * .8 - an.spd * .4, 30, 3.5, sdt);
  // ---- clothing / accessories mask
  const hat = z.hat === 1 ? HP.cap : z.hat === 2 ? HP.beret : 0;
  if (x.lenco) parts.push(HP.lenco); else if (hat) parts.push(hat);
  else if (sea === 'Winter' && x.hatP < .3 && !child) parts.push(HP.beanie); else if (sea === 'Summer' && x.hatP < .15 && !child) parts.push(HP.straw);
  if (!x.lenco) {
    if (x.sides) parts.push(HP.hSides); else if (x.curly) parts.push(HP.hCurly); else if (z.hair === 1) parts.push(HP.hShort); else if (z.hair === 2) parts.push(HP.hLong); else if (z.hair === 3) parts.push(HP.hBun); else if (z.hair === 4) parts.push(HP.hTail);
  }
  if (z.beard) parts.push(HP.beard); if (x.moust) parts.push(HP.moust); if (x.glasses) parts.push(HP.glasses);
  if (z.skirt) parts.push(HP.skirt); if (z.apron) parts.push(HP.apron); if (x.belt) parts.push(HP.belt); if (x.collar) parts.push(HP.collar);
  if (sea === 'Winter' && x.scarfP < .55) parts.push(HP.scarf); if (x.pack) parts.push(HP.pack); if (x.sbag && !carry) parts.push(HP.sbag);
  parts.push(HP.eyes, HP.brows, HP.mouth);
  if (lod === 2) parts = parts.map(p => p === HP.hBun || p === HP.hTail || p === HP.hCurly || p === HP.hSides ? HP.hShort : p === HP.lenco ? HP.hLong : p);
  const [mA, mB] = partsMask(parts);
  // ---- build bone matrices
  const R0 = HM[0];
  _v4.set(px, by, pz); warpV(_v4);
  R0.compose(_v4, _q4.setFromEuler(_e4.set(0, an.ry, 0)), _s4.set(s * z.bw, s * (1 - sq), s * z.bw * (1 + sq * .5)));
  chain(HM[HB.pel], R0, 0, HIP, 0, pelRx, pelRy, pelRz);
  chain(HM[HB.spi], HM[HB.pel], 0, 0, 0, torRx, torRy, torRz);
  const hs = child ? 1.22 : 1;
  chain(HM[HB.head], HM[HB.spi], 0, .272, 0, nod + (z.state === 'talk' && !open ? Math.sin(t * 3 + i) * .03 : 0), hYaw, hRoll, hs);
  for (let sd = 0; sd < 2; sd++) {
    const sg = sd ? 1 : -1, T = sd ? HB.thB : HB.thA, Sh = T + 1, Ft = T + 2;
    chain(HM[T], R0, sg * .038, HIP - .005, 0, th[sd], 0, -sg * pelRz * .6);
    chain(HM[Sh], HM[T], 0, -.125, 0, kn[sd]);
    const heel = walk * .35 * Math.cos(ph + (sd ? Math.PI : 0)) * (1 - sk);
    chain(HM[Ft], HM[Sh], 0, -.12, 0, -(th[sd] + kn[sd]) + heel);
  }
  for (let sd = 0; sd < 2; sd++) {
    const sg = sd ? 1 : -1, U = sd ? HB.uaB : HB.uaA, a = sd ? aB : aA, e = sd ? eB : eA, rz = sd ? zB : zA, fy = sd ? fyB : fyA;
    chain(HM[U], HM[HB.spi], sg * .084 * x.shK, .182, 0, a, 0, sg * .1 + rz);
    chain(HM[U + 1], HM[U], 0, -.1, 0, -e, fy);
    chain(HM[U + 2], HM[U + 1], 0, -.095, 0, sd ? 0 : (carry && z.carry !== 'bakery' ? -bagA * .5 : 0));
  }
  chain(HM[HB.hair], HM[HB.head], 0, .018, -.03, THREE.MathUtils.clamp(hairA, -.9, .5), 0, -pelRz * 2);
  chain(HM[HB.skirt], HM[HB.pel], 0, .02, 0, THREE.MathUtils.clamp(skA, -.4, .3) - sk * .9, 0, skZ);
  chain(HM[HB.prA], HM[HB.hnA], 0, -.012, 0, (carry && z.carry !== 'bakery') ? -aA - (-eA) + bagA * .6 : prArx, 0, prArz);
  chain(HM[HB.prB], HM[HB.hnB], 0, -.012, 0, umbOn ? -(aB - eB) - .1 : parts.includes(HP.cane) ? -(aB - eB) - .05 : prBrx, prBry, prBrz);
  HM[HB.prBody].copy(R0);
  for (let b = 0; b < H_NB; b++) hum.bone(i, b, HM[b], H_REST[b]);
  if (z.dog) (an.hand ||= new THREE.Vector3()).set(0, -.02, .01).applyMatrix4(HM[HB.hnA]);
  hum.dyn(i, 0, mA, mB, smile, open);
  hum.dyn(i, 1, blink, brow, x.pattern, x.belly);
  hum.dyn(i, 2, x.bust, x.hips, 1 - an.fade, 0);
}
/* kids' balls */
const ballMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.035, 1), new THREE.MeshToonMaterial({gradientMap: grad}), 24);
ballMesh.frustumCulled = false; ballMesh.castShadow = true; ballMesh.layers.enable(1); scene.add(ballMesh);
{ const cs = ['#d94f3d', '#f0ece4', '#2f5ea8', '#e8c34a']; for (let k = 0; k < 24; k++) ballMesh.setColorAt(k, new THREE.Color(cs[k % 4])); }
function updatePlayBalls(t) {
  let n = 0;
  for (const z of G.citizens) { const pl = z.an?.play; if (!pl || n >= 24) continue; _v4.set(pl.x, pl.y + .035 + Math.abs(Math.sin(t * 6 + z.id)) * .05, pl.z); warpV(_v4); _m4.compose(_v4, _q4.setFromEuler(_e4.set(t * 5, 0, 0)), _s4.set(1, 1, 1)); ballMesh.setMatrixAt(n++, _m4); }
  ballMesh.count = n; ballMesh.instanceMatrix.needsUpdate = true;
}

export {PEOPLE_STATS, SK, SPH, SkinSet, _m4, _q4, _s4, _v4, angLerp, blendW, buildPeopleMeshes, chain, gM, gS, hum, loc, mergeSk, partsMask, peopleParts, skg, spring};
