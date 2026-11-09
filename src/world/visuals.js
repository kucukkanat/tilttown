import '../game/meta.js'; // load order: runs after the previous module
import {Reflector} from 'three/addons/objects/Reflector.js';
import * as THREE from 'three';
import {G} from '../state.js';
import {LV, N, R0, S, canvasTex, cyl, glowTex, jit, lerp, mul, paint, pick, rng, tr} from '../core/util.js';
import {DIRS, WOBGL, azMat, base, bodyMat, brickMat, camera, cellAt, controls, darkMat, grad, litU, mkMesh, plainMat, roofMat, scene, skyU, swayMat, topY, water, waterMat, waterU, wx} from '../core/scene.js';
import {glowGeo, glowRefs, glowU} from './houses.js';
import {puffTex} from './streets.js';
import {labelMat} from '../game/identity.js';
import {warpD} from './organic.js';
import {quality} from '../game/extras.js';
import {postU} from '../render/post.js';

/* ==========================================================================
   VISUALS v11: cliff island, waterfalls, floating rocks, light pools,
   backdrop, dust motes, wobble/grime, reflections, intro flyover
   ========================================================================== */
const GN = `float gH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gH(i),gH(i+vec2(1,0)),f.x),mix(gH(i+vec2(0,1)),gH(i+1.),f.x),f.y);}\n`;
/* ---- hand-made wobble + grime ---- */
function wobPatch(mat, grime) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.vertexShader = WOBGL + 'varying float vLY;varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n{vec3 wp0=(modelMatrix*vec4(transformed,1.)).xyz;vLY=transformed.y;vWP=wp0;transformed+=(vec4(wobW(wp0),0.)*modelMatrix).xyz;}');
    sh.fragmentShader = (grime ? GN : '') + 'varying float vLY;varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + (grime ? '{float st=gN(vec2((vWP.x+vWP.z)*6.,vWP.y*.8))*gN(vec2((vWP.x-vWP.z)*11.,vWP.y*2.5));float bs=1.-smoothstep(.0,.6,vLY);float drip=smoothstep(.3,.62,st);diffuseColor.rgb*=1.-(bs*.26+drip*.17);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.86,.92,.78),bs*.5);}' : ''));
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : mat.uuid) + '-wob';
  mat.needsUpdate = true;
}
wobPatch(bodyMat, true);
[roofMat, plainMat, darkMat, brickMat, azMat, labelMat].forEach(m => wobPatch(m, false)); // labels must wobble with the boards they sit on, or they sink into them

/* ---- sculpted cliff island ---- */
const rockTex = canvasTex(256, (x, s) => {
  x.fillStyle = '#9a8a7a'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 300; i++) { const l = 120 + R0() * 100; x.fillStyle = `rgba(${l},${l * .92},${l * .82},.35)`; x.fillRect(R0() * s, R0() * s, 20 + R0() * 90, 2 + R0() * 6); }
  for (let i = 0; i < 140; i++) { x.strokeStyle = `rgba(40,30,28,${.2 + R0() * .3})`; x.lineWidth = 1 + R0() * 2; x.beginPath(); let px = R0() * s, py = R0() * s; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (R0() - .5) * 22; py += R0() * 18; x.lineTo(px, py); } x.stroke(); }
}, 1);
const cliffMat = new THREE.MeshToonMaterial({vertexColors: true, map: rockTex, gradientMap: grad, emissive: 0x2a1a1c});
cliffMat.onBeforeCompile = sh => { // the underside melts into haze so the eye stays on the town
  sh.vertexShader = 'varying float vCY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCY=(modelMatrix*vec4(transformed,1.)).y;');
  sh.fragmentShader = 'varying float vCY;\n' + sh.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n#ifdef USE_FOG\ngl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,smoothstep(-2.5,-12.,vCY)*.62);\n#endif');
};
cliffMat.customProgramCacheKey = () => 'cliff-haze';
const CLIFF = {H: 14, rings: 30, segs: 128, half: N * S / 2 + .35};
const _cR = rng(99), _cPh = [0, 1, 2, 3, 4].map(() => _cR() * 6.28);
function cliffNoise(a, t) { return Math.sin(a * 5 + _cPh[0] + t * 3) * .5 + Math.sin(a * 11 + _cPh[1] - t * 7) * .3 + Math.sin(a * 23 + _cPh[2] + t * 13) * .18 + Math.sin(t * 17 + a * 3 + _cPh[3]) * .2 + Math.sin(a * 37 + _cPh[4]) * .08; }
function cliffPt(a, t, out = new THREE.Vector3()) {
  const y = -LV - Math.pow(t, 1.05) * CLIFF.H;
  const shrink = t < .06 ? 1 + t * 1.2 : (1 + .072) * (1 - Math.pow((t - .06) / .94, 1.6) * .985);
  const p = lerp(40, 2.4, Math.min(1, t * 2.2)), ca = Math.cos(a), sa = Math.sin(a);
  const k = 1 / Math.pow(Math.pow(Math.abs(ca), p) + Math.pow(Math.abs(sa), p), 1 / p);
  const rad = CLIFF.half * k * shrink * (1 + cliffNoise(a, t) * .085 * Math.min(1, t * 5));
  return out.set(ca * rad, y, sa * rad);
}
function buildCliff() {
  const {rings, segs} = CLIFF, pos = [], col = [], uv = [], idx = [], v = new THREE.Vector3(), c = new THREE.Color();
  const moss = new THREE.Color('#6d7a42'), r1 = new THREE.Color('#b8957a'), r2 = new THREE.Color('#957c6c'), deep = new THREE.Color('#6a5466'), band = new THREE.Color('#d0a888');
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s <= segs; s++) {
      const a = s / segs * Math.PI * 2; cliffPt(a, t, v); pos.push(v.x, v.y, v.z); uv.push(s / segs * 10, t * 4);
      const st = .5 + .5 * Math.sin(v.y * 2.1 + cliffNoise(a, t) * 2.5);
      c.copy(r1).lerp(r2, st).lerp(band, Math.max(0, Math.sin(v.y * 5.3 + a * 2)) * .3).lerp(deep, Math.pow(t, 1.3) * .75);
      if (t < .08) c.lerp(moss, (1 - t / .08) * (.6 + .4 * Math.sin(a * 31)));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) { const a = r * (segs + 1) + s, b = a + segs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, cliffMat); m.receiveShadow = false; return m;
}
const cliffG = new THREE.Group(); scene.add(cliffG);
scene.remove(base); base.visible = false;
cliffG.add(buildCliff());
{ // hanging roots + ivy
  const R = rng(321), gs = [], v = new THREE.Vector3(), o = new THREE.Vector3();
  const sway = (g, y0, k) => { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = Math.max(0, y0 - p.getY(i)) * k; g.setAttribute('sway', new THREE.BufferAttribute(a, 1)); return g; };
  for (let n = 0; n < 34; n++) {
    const a = R() * 6.283, t = .01 + Math.pow(R(), 2) * .12; cliffPt(a, t, v); const out = o.set(v.x, 0, v.z).normalize();
    const L = .4 + R() * 1.4, pts = []; for (let k = 0; k <= 4; k++) { const u = k / 4; pts.push(new THREE.Vector3(v.x + out.x * (.05 + u * .25 + Math.sin(u * 3 + n) * .1), v.y - u * L, v.z + out.z * (.05 + u * .25) + Math.cos(u * 4 + n) * .08)); }
    gs.push(sway(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, .014 + R() * .014, 3), pick(R, ['#6a5040', '#5a4434', '#7a5c48'])), v.y, .045));
  }
  const leaf = new THREE.TetrahedronGeometry(1, 0);
  for (let n = 0; n < 46; n++) {
    const a0 = R() * 6.283, wdt = .25 + R() * .6, len = .6 + R() * 2.2, autumn = R() < .25, top0 = cliffPt(a0, 0, new THREE.Vector3());
    const hue = autumn ? ['#b8562b', '#c47a2b', '#a8432b', '#8a6a2a'] : ['#4f6a32', '#5f7a3a', '#3f5a2a', '#6a7a3a', '#56703a'];
    const cnt = Math.floor(wdt * len * 70);
    for (let k = 0; k < cnt; k++) {
      const da = (R() - .5) * wdt / CLIFF.half, dy = Math.pow(R(), 1.5) * len * (1 - Math.abs(da * CLIFF.half / wdt) * .8);
      const t = dy / CLIFF.H; cliffPt(a0 + da, t, v); const out = o.set(v.x, 0, v.z).normalize(), sc = .05 + R() * .06;
      const g = paint(leaf.clone(), jit(pick(R, hue), R, .1)); g.applyMatrix4(mul(tr(v.x + out.x * .06, v.y, v.z + out.z * .06, R() * 6, R() * 6, R() * 6), new THREE.Matrix4().makeScale(sc, sc * .5, sc * 1.3)));
      gs.push(sway(g, top0.y, .02));
    }
  }
  const m = mkMesh(gs, swayMat, false); cliffG.add(m);
}
/* floating rocks */
const floatRocks = [];
{
  const R = rng(77);
  for (let n = 0; n < 8; n++) {
    const sc = .6 + R() * 1.6, g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const j = 1 + (Math.sin(x * 7 + n) * Math.cos(z * 5 + n * 2)) * .15; y = y > .2 ? .2 + (y - .2) * .2 : y * (1.9 + R() * .2); p.setXYZ(i, x * j, y, z * j); }
    g.computeVertexNormals(); const ng = g, cc = [], pp = ng.attributes.position;
    for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), cl = new THREE.Color(y > .18 && Math.sin(pp.getX(i) * 9 + n) > -.2 ? '#7a8a4a' : '#b0927a').lerp(new THREE.Color('#5a4a5a'), Math.min(1, Math.max(0, -y) * .4)); cc.push(cl.r, cl.g, cl.b); }
    ng.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pp.count * 2).map((_, i) => i % 2 ? pp.getY(i >> 1) : pp.getX(i >> 1) + pp.getZ(i >> 1)), 2));
    const m = new THREE.Mesh(ng, cliffMat); const ang = R() * 6.283, d = 19 + R() * 9;
    m.scale.setScalar(sc); m.position.set(Math.cos(ang) * d, -2 - R() * 9, Math.sin(ang) * d); m.rotation.y = R() * 6; m.userData = {y: m.position.y, ph: R() * 6};
    if (R() < .6) { const t = mkMesh([paint(new THREE.IcosahedronGeometry(.28, 0), '#4f6a32').applyMatrix4(tr(.2, .38, .1)), paint(new THREE.IcosahedronGeometry(.2, 0), '#a8432b').applyMatrix4(tr(-.3, .32, -.2)), cyl(.03, .05, .4, '#3d2c22', tr(.2, .2, .1))], plainMat, false); t.scale.setScalar(1 / sc * .9); m.add(t); }
    cliffG.add(m); floatRocks.push(m);
  }
}

/* ---- waterfalls off the island edge ---- */
const fallU = {uTime: waterU.uTime, uCol: {value: new THREE.Color()}, uFoam: {value: new THREE.Color('#e8f0f0')}, uNight: litU.uNight};
const fallMat = new THREE.ShaderMaterial({uniforms: fallU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: GN + `uniform float uTime,uNight;uniform vec3 uCol,uFoam;varying vec2 vUv;
  void main(){float sp=1.+vUv.y*.9;float x=(vUv.x-.5)*sp+.5;
    float s=gN(vec2(vUv.x*16.,vUv.y*5.-uTime*2.4))*.6+gN(vec2(vUv.x*40.,vUv.y*12.-uTime*3.6))*.4;
    float edge=smoothstep(0.,.1,vUv.x)*smoothstep(1.,.9,vUv.x);
    float a=(.5+.45*s)*edge*(1.-smoothstep(.45,1.,vUv.y))*smoothstep(0.,.03,vUv.y);
    vec3 c=mix(uCol*1.15,uFoam,clamp(smoothstep(.45,.8,s)+vUv.y*.7,0.,1.));
    c*=mix(1.,.45,uNight);
    gl_FragColor=vec4(c,a*.9);}`});
const fallMistU = {uTime: waterU.uTime, uScale: glowU.uScale, map: {value: puffTex}, uC: {value: new THREE.Color()}};
const fallMist = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({uniforms: fallMistU, transparent: true, depthWrite: false,
  vertexShader: `attribute vec3 dir;attribute float ph;uniform float uTime,uScale;varying float vA;
    void main(){float c=fract(uTime*.12+ph);vec3 p=position+dir*c*2.2+vec3(0.,-c*3.5,0.)+vec3(sin(ph*40.+uTime*.5),0.,cos(ph*31.+uTime*.4))*c*.8;
      vec4 mv=modelViewMatrix*vec4(p,1.);vA=sin(c*3.1416)*.55;gl_PointSize=(1.5+c*4.)*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform sampler2D map;uniform vec3 uC;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(uC,t.a*vA);}`}));
fallMist.frustumCulled = false;
const fallG = new THREE.Group(); scene.add(fallG); fallG.add(fallMist);
let fallMesh = null;
function buildFalls() {
  if (fallMesh) { fallG.remove(fallMesh); fallMesh.geometry.dispose(); fallMesh = null; }
  const pos = [], uv = [], idx = [], mp = [], md = [], mph = [], half = N * S / 2;
  const NU = 22, NL = 6;
  G.cells.forEach(c => {
    if (!c.water) return;
    DIRS.forEach(([dx, dz]) => {
      if (cellAt(c.i + dx, c.j + dz)) return;
      const ex = wx(c.i) + dx * S / 2, ez = wx(c.j) + dz * S / 2, lx = -dz, lz = dx, b0 = pos.length / 3;
      for (let u = 0; u <= NU; u++) {
        const t = u / NU, out = 1.6 * Math.sqrt(t) + t * .6, y = -.32 - t * t * 1.0 * 11 - t * 1.2, spread = 1 + t * .7;
        for (let l = 0; l <= NL; l++) { const q = (l / NL - .5) * S * spread; pos.push(ex + dx * out + lx * q, y, ez + dz * out + lz * q); uv.push(l / NL, t); }
      }
      for (let u = 0; u < NU; u++) for (let l = 0; l < NL; l++) { const a = b0 + u * (NL + 1) + l, b = a + NL + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      for (let k = 0; k < 26; k++) { const q = (Math.random() - .5) * S * 1.4, t = .35 + Math.random() * .5; mp.push(ex + dx * (1.7 * Math.sqrt(t) + .5) + lx * q, -.32 - t * t * 11, ez + dz * (1.7 * Math.sqrt(t) + .5) + lz * q); md.push(dx, 0, dz); mph.push(Math.random()); }
      for (let k = 0; k < 8; k++) { const q = (Math.random() - .5) * S; mp.push(ex + dx * .3 + lx * q, -.3, ez + dz * .3 + lz * q); md.push(dx * .4, .6, dz * .4); mph.push(Math.random()); }
    });
  });
  const g = new THREE.BufferGeometry(); g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  fallMesh = new THREE.Mesh(g, fallMat); fallMesh.frustumCulled = false; fallMesh.renderOrder = 2; fallG.add(fallMesh);
  const mg = fallMist.geometry; mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mg.setAttribute('dir', new THREE.Float32BufferAttribute(md, 3)); mg.setAttribute('ph', new THREE.Float32BufferAttribute(mph, 1));
}

/* ---- water distance field (foam + depth) ---- */
function buildWaterDist() {
  const W = 64, data = waterU.uDist.value.image.data, half = N * S / 2;
  const land = G.cells.filter(c => !c.water);
  for (let r = 0; r < W; r++) for (let q = 0; q < W; q++) {
    const px_ = (q + .5) / W * N * S - half, pz_ = (r + .5) / W * N * S - half; let x = px_, z = pz_; for (let it = 0; it < 4; it++) { const d0 = warpD(x, z); x = px_ - d0.x; z = pz_ - d0.y; } let d = 9;
    const ci = Math.floor((x + half) / S), cj = Math.floor((z + half) / S), here = cellAt(ci, cj);
    if (here && !here.water) d = 0; else for (const c of land) { const cx = wx(c.i), cz = wx(c.j), ddx = Math.max(0, Math.abs(x - cx) - S / 2), ddz = Math.max(0, Math.abs(z - cz) - S / 2); d = Math.min(d, Math.hypot(ddx, ddz)); }
    data[r * W + q] = Math.min(255, d / 1.4 * 255);
  }
  waterU.uDist.value.needsUpdate = true;
}

/* ---- reflections ---- */
const reflector = new Reflector(new THREE.PlaneGeometry(N * S, N * S), {textureWidth: 512, textureHeight: 512, clipBias: .003, shader: {
  name: 'TiltRefl', uniforms: {color: {value: null}, tDiffuse: {value: null}, textureMatrix: {value: null}, uTime: {value: 0}, uDist: {value: null}, uStr: {value: .55}},
  vertexShader: `uniform mat4 textureMatrix;varying vec4 vUvR;varying vec3 vW;void main(){vUvR=textureMatrix*vec4(position,1.);vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse,uDist;uniform float uTime,uStr;varying vec4 vUvR;varying vec3 vW;
    void main(){vec2 wob=vec2(sin(vW.z*3.1+uTime*1.3)+.6*sin(vW.x*6.-uTime*.9),sin(vW.x*2.7+uTime*1.1)+.5*sin(vW.z*7.+uTime))*.01;
      vec4 u=vUvR;u.xy+=wob*u.w;vec3 r=texture2DProj(tDiffuse,u).rgb;
      float dl=texture2D(uDist,vW.xz/${(N * S).toFixed(1)}+.5).r;
      gl_FragColor=vec4(r*vec3(.72,.9,.96),uStr*smoothstep(.0,.12,dl));}`}});
reflector.rotation.x = -Math.PI / 2; reflector.position.y = -.315; reflector.renderOrder = 1;
Object.assign(reflector.material, {transparent: true, depthWrite: false});
reflector.material.uniforms.uDist.value = waterU.uDist.value;
scene.add(reflector);
{ const rRT = reflector.getRenderTarget(); rRT.texture.type = THREE.HalfFloatType; }

/* ---- night light pools ---- */
const poolMat = new THREE.ShaderMaterial({uniforms: {uNight: litU.uNight, uTime: litU.uTime}, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
  vertexShader: `attribute float aThr,aOcc;uniform float uNight;varying vec2 vUv;varying float vA;
    void main(){vUv=uv;vA=aThr<0.?aOcc*smoothstep(.15,.6,uNight):smoothstep(aThr,aThr+.06,uNight)*aOcc;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
  fragmentShader: GN + `uniform float uTime;varying vec2 vUv;varying float vA;void main(){vec2 p=vUv-.5;float r=length(p)*2.;float n=gN(vUv*9.)*.25;
    float a=pow(max(0.,1.-r-n*.3),2.2)*vA;gl_FragColor=vec4(vec3(1.,.62,.3)*a*1.05,1.);}`});
let pools = null, poolIdx = [];
function buildPools() {
  if (pools) { scene.remove(pools); pools.dispose(); pools = null; }
  const pos = glowGeo.attributes.position; if (!pos) return; const items = []; poolIdx = [];
  for (let i = 0; i < pos.count; i++) {
    const [c, thr] = glowRefs[i] || []; if (!c || c.water) continue;
    const lamp = c.kind === 'lamp', shop = thr < 0 && !c.kind;
    if (!lamp && !shop) continue;
    if (shop && pos.getY(i) - topY(c) > 1.4) continue;
    items.push([pos.getX(i), topY(c) + .045, pos.getZ(i), lamp ? 4.4 : 2.8, thr]); poolIdx.push(i);
  }
  if (!items.length) return;
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
  pools = new THREE.InstancedMesh(g, poolMat, items.length); pools.frustumCulled = false; pools.renderOrder = 3;
  const m = new THREE.Matrix4(), th = new Float32Array(items.length), oc = new Float32Array(items.length).fill(1);
  items.forEach(([x, y, z, s, t], k) => { m.makeScale(s, 1, s).setPosition(x, y, z); pools.setMatrixAt(k, m); th[k] = t; });
  g.setAttribute('aThr', new THREE.InstancedBufferAttribute(th, 1)); g.setAttribute('aOcc', new THREE.InstancedBufferAttribute(oc, 1));
  scene.add(pools);
}
function syncPools() { if (!pools) return; const a = glowGeo.attributes.occ, b = pools.geometry.attributes.aOcc; if (!a) return; for (let k = 0; k < poolIdx.length; k++) b.array[k] = a.array[poolIdx[k]]; b.needsUpdate = true; }

/* ---- painted backdrop: hills + distant city ---- */
const bdTex = (() => {
  const W = 2048, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), R = rng(555);
  const ridge = (base, amp, fr, ph) => q => base - amp * (Math.sin(q / W * 6.283 * fr[0] + ph) * .5 + Math.sin(q / W * 6.283 * fr[1] + ph * 2) * .3 + Math.sin(q / W * 6.283 * fr[2] + ph * 3) * .2);
  const hill = (f, r) => { x.fillStyle = `rgb(${r},0,0)`; x.beginPath(); x.moveTo(0, H); for (let q = 0; q <= W; q += 8) x.lineTo(q, f(q)); x.lineTo(W, H); x.fill(); };
  hill(ridge(120, 38, [3, 7, 17], 1.3), 255);
  hill(ridge(150, 26, [2, 9, 23], 4.1), 200);
  // two distant towns
  for (const [c0, c1] of [[300, 760], [1250, 1600]]) {
    let q = c0; while (q < c1) {
      const w = 6 + R() * 16, hh = 8 + R() * 26 * Math.sin((q - c0) / (c1 - c0) * Math.PI) + 4, by = 172;
      x.fillStyle = 'rgb(150,0,0)'; x.fillRect(q, by - hh, w, hh + 80);
      if (R() < .5) { x.beginPath(); x.moveTo(q - 1, by - hh); x.lineTo(q + w / 2, by - hh - w * .5); x.lineTo(q + w + 1, by - hh); x.fill(); }
      if (R() < .06) { x.fillRect(q + w / 2 - 2, by - hh - 22, 4, 22); x.beginPath(); x.arc(q + w / 2, by - hh - 22, 4, 0, 6.3); x.fill(); }
      for (let k = 0; k < hh / 5; k++) if (R() < .35) { x.fillStyle = 'rgb(150,255,0)'; x.fillRect(q + 1 + R() * (w - 3), by - hh + 3 + R() * (hh - 4), 1.5, 2); x.fillStyle = 'rgb(150,0,0)'; }
      q += w + R() * 2;
    }
  }
  hill(ridge(190, 14, [4, 11, 29], 2.2), 70);
  const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; return t;
})();
const bdU = {map: {value: bdTex}, hor: skyU.hor, top: skyU.top, sunCol: skyU.sunCol, night: litU.uNight, time: litU.uTime};
const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 46, 160, 1, true), new THREE.ShaderMaterial({uniforms: bdU, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: GN + `uniform sampler2D map;uniform vec3 hor,top,sunCol;uniform float night,time;varying vec2 vUv;
  void main(){vec4 t=texture2D(map,vUv);if(t.a<.5)discard;float dp=t.r;
    vec3 haze=mix(hor,top,.18);vec3 c=mix(mix(top,hor,.4)*.62,haze*.94,smoothstep(.2,1.,dp));
    c=mix(c,c*vec3(.95,.9,1.05),1.-dp);
    c*=.95+.08*gN(vUv*vec2(900.,60.))*gN(vUv*vec2(120.,8.));
    c+=sunCol*.05*dp;
    c=mix(c,haze,smoothstep(.5,.15,vUv.y)*.85);
    c+=vec3(1.,.66,.3)*step(.5,t.g)*night*1.3*(.7+.3*sin(time*2.+vUv.x*900.));
    gl_FragColor=vec4(c,smoothstep(.08,.35,vUv.y));}`}));
backdrop.renderOrder = -1; backdrop.frustumCulled = false; scene.add(backdrop);

/* ---- dust motes in the sun ---- */
const DUST = 220, dustU = {uTime: litU.uTime, uC: {value: new THREE.Vector3()}, uScale: glowU.uScale, uA: {value: 0}, map: {value: glowTex('rgba(255,245,220,1)')}, uCol: skyU.sunCol};
const dustGeo = new THREE.BufferGeometry(); { const R = rng(9), p = [], ph = []; for (let i = 0; i < DUST; i++) { p.push(R() * 22, R() * 9, R() * 22); ph.push(R() * 100); } dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); dustGeo.setAttribute('ph', new THREE.Float32BufferAttribute(ph, 1)); }
const motes = new THREE.Points(dustGeo, new THREE.ShaderMaterial({uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float ph;uniform float uTime,uScale,uA;uniform vec3 uC;varying float vA;
    void main(){vec3 p=position+vec3(sin(uTime*.13+ph)*1.2+uTime*.15,sin(uTime*.21+ph*1.7)*.8,cos(uTime*.11+ph)*1.2);
      p=mod(p-uC+vec3(11.,0.,11.),vec3(22.,9.,22.))+uC-vec3(11.,0.,11.);
      vec4 mv=modelViewMatrix*vec4(p,1.);vA=uA*(.4+.6*sin(uTime*1.5+ph*3.))*smoothstep(4.,9.,-mv.z);gl_PointSize=.12*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform sampler2D map;uniform vec3 uCol;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(mix(uCol,vec3(1.),.4)*t.a*max(vA,0.),1.);}`}));
motes.frustumCulled = false; scene.add(motes);

/* ---- per-frame visuals ---- */
const _sv = new THREE.Vector3();
G.intro = null;
function startIntro() {
  const T = controls.target.clone(), P = camera.position.clone();
  G.intro = {t: 0, T, off: P.sub(T)};
  const stop = () => { if (G.intro) { camera.position.copy(G.intro.T).add(G.intro.off); G.intro = null; } };
  ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(k => addEventListener(k, stop, {once: true, passive: true}));
}
function updateIntro(dt) {
  if (!G.intro) return;
  G.intro.t = Math.min(1, G.intro.t + dt / 5.5); const e = 1 - Math.pow(1 - G.intro.t, 3);
  const o = G.intro.off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (1 - e) * 1.5).multiplyScalar(lerp(2.4, 1, e));
  o.y += (1 - e) * 18;
  camera.position.copy(G.intro.T).add(o); controls.target.copy(G.intro.T).add(new THREE.Vector3(0, -(1 - e) * 4, 0));
  if (G.intro.t >= 1) G.intro = null;
}
function updateVisuals(dt, t) {
  floatRocks.forEach(m => { m.position.y = m.userData.y + Math.sin(t * .45 + m.userData.ph) * .25; m.rotation.y += dt * .02; });
  fallG.position.y = water.position.y + .32;
  fallU.uCol.value.copy(waterMat.color); fallMistU.uC.value.copy(scene.fog.color).lerp(new THREE.Color(1, 1, 1), .5);
  reflector.position.y = water.position.y + .005; reflector.material.uniforms.uTime.value = t;
  reflector.material.uniforms.uStr.value = .34 - .12 * litU.uNight.value;
  backdrop.position.set(camera.position.x, camera.position.y - 7, camera.position.z);
  dustU.uC.value.copy(controls.target); dustU.uA.value = (postU.golden.value * .9 + .25) * (1 - litU.uNight.value) * (camera.position.distanceTo(controls.target) < 30 ? 1 : .3);
  skyU.night.value = litU.uNight.value;
  syncPools();
  // depth of field + sun screen pos for the post pass
  const dist = camera.position.distanceTo(controls.target);
  postU.focusD.value = dist; postU.dof.value = (1 - THREE.MathUtils.smoothstep(dist, 9, 21)) * (quality === 'low' ? .5 : 1);
  _sv.copy(skyU.sunDir.value).multiplyScalar(300).add(camera.position).project(camera);
  postU.sunUV.value.set(_sv.x * .5 + .5, _sv.y * .5 + .5); postU.rays.value = _sv.z < 1 ? postU.golden.value : 0;
  postU.sunCol.value.copy(skyU.sunCol.value);
}
function rebuildVisFx() { buildFalls(); buildWaterDist(); buildPools(); }

export {rebuildVisFx, reflector, startIntro, updateIntro, updateVisuals, wobPatch};
