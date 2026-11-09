import '../ui/cards.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {G} from '../state.js';
import {LV, N, S, box, canvasTex, cyl, glowTex, lerp, mul, paint, pick, rng, setAttr, tr} from '../core/util.js';
import {DIRS, DPR, SMALL, bodyMat, camera, cellAt, cobbleMat, controls, litMat, litU, mkMesh, objG, plainMat, renderer, roofMat, scene, stoneMat, sun, swayMat, terrainG, topY, wx} from '../core/scene.js';
import {glowGeo, glowU, leaves, rebuildGlows, rebuildLaundry, rebuildObj, rebuildTerrain} from '../world/houses.js';
import {BIZ, PHONE, hhmm, puffTex, raining, walkY, walkable} from '../world/streets.js';
import {escH, festColors, ownAfterCitizens, ownLoad, ownSave, streetName, townName} from './identity.js';
import {warpV} from '../world/organic.js';
import {FIRST_F, FIRST_M, cellOf, cityRefresh, computeMood, makeLook, makePlan, say3, warmStart} from '../people/sim.js';
import {buildPeopleMeshes} from '../people/characters.js';
import {cardEl, cheatApply, closeCard, euro, toast, townJoy, tryCheat, updateEco} from '../ui/cards.js';
import {STORY_DEFS, TRAITS, albumCard, buyQuay, computeTraits, dayStats, goalsCard, makeGoals, resetDayStats, scenarioCard, traits, updateScenChip} from './meta.js';
import {rebuildVisFx, reflector} from '../world/visuals.js';
import {PRESETS, applyLook, postU, resize} from '../render/post.js';
import {presetsEl, say} from '../ui/input.js';
import {catsToRoofs} from './progression.js';

G.lifeEvents = lifeEvents; // reassignable: other modules wrap it
G.autosave = autosave; // reassignable: other modules wrap it
G.snapshot = snapshot; // reassignable: other modules wrap it
/* ---------- synthesized ambient sound ---------- */
let AC = null, master = null, NB = null; const SND = {};
function noiseBuf() { const b = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function loopNoise(type, freq, q = 1) { const s = AC.createBufferSource(); s.buffer = NB; s.loop = true; s.playbackRate.value = .8 + Math.random() * .4; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = AC.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(master); s.start(); return {s, f, g}; }
function initSound() {
  AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .7; master.connect(AC.destination); NB = noiseBuf();
  SND.wind = loopNoise('bandpass', 400, .6); SND.rain = loopNoise('highpass', 2600, .4); SND.river = loopNoise('lowpass', 450, .7);
  SND.chat = [650, 1150, 2300].map(f => loopNoise('bandpass', f, 5));
}
const live = () => AC && AC.state === 'running';
function setG(n, v, tc = .5) { n.gain.setTargetAtTime(v, AC.currentTime, tc); }
function tone(freq, dur, peak, type = 'sine', at = 0, slideTo) {
  const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime + at; o.type = type; o.frequency.setValueAtTime(freq, t0); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + .012); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + .05);
}
function bell(n) { if (!live()) return; for (let k = 0; k < n; k++) [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(196 * m, 3.6 / (i + 1), .045 / (i + 1), 'sine', k * 1.7)); }
function gull() { const n = 2 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) tone(1500 + Math.random() * 300, .22, .018, 'triangle', k * .28, 950); }
function chirp() { for (let k = 0; k < 3; k++) tone(3300 + Math.random() * 1400, .07, .01, 'sine', k * .11, 4600); }
function cricket() { for (let k = 0; k < 6; k++) tone(4300, .028, .005, 'square', k * .055); }
function bark() { tone(380, .12, .035, 'sawtooth', 0, 210); tone(410, .12, .03, 'sawtooth', .22, 230); }
function shutterSound(pos) {
  if (!live()) return; const d = pos.distanceTo(controls.target); if (d > 14) return;
  const s = AC.createBufferSource(); s.buffer = NB; const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 3; const g = AC.createGain(), v = .09 * (1 - d / 14), t0 = AC.currentTime;
  s.connect(f).connect(g).connect(master); g.gain.setValueAtTime(0, t0); for (let k = 0; k < 16; k++) g.gain.setValueAtTime(v * (k % 2 ? 1 : .25), t0 + k * .065); g.gain.linearRampToValueAtTime(0, t0 + 1.15); s.start(t0); s.stop(t0 + 1.2);
}
function updateSound(dt) {
  if (!live()) return;
  const tgt = controls.target, zoom = THREE.MathUtils.clamp(1 - (camera.position.distanceTo(tgt) - 6) / 60, .15, 1), T = performance.now();
  setG(SND.wind.g, (.015 + G.preset.wind * .045) * (.6 + .4 * (1 - zoom))); SND.wind.f.frequency.setTargetAtTime(280 + G.preset.wind * 220 + Math.sin(T / 1700) * 120, AC.currentTime, .6);
  setG(SND.rain.g, raining() ? .05 : 0);
  let dw = 99; for (const c of G.cells) if (c.water) dw = Math.min(dw, Math.hypot(wx(c.i) - tgt.x, wx(c.j) - tgt.z)); setG(SND.river.g, .06 * zoom * Math.max(0, 1 - dw / 9));
  let busy = 0; for (const b of G.businesses) { if (!b.seats?.length || !b.door) continue; const n = b.seats.filter(s => s.by && s.by.state === 'sit').length; if (n) busy += n * Math.max(0, 1 - b.door.distanceTo(tgt) / 10); }
  const talkers = G.citizens.filter(z => z.state === 'talk' && z.pos.distanceTo(tgt) < 8).length, cv = Math.min(.05, (busy * .007 + talkers * .006) * zoom);
  SND.chat.forEach((c, i) => setG(c.g, cv * (.5 + .5 * Math.sin(T / (90 + i * 37) + i * 2) * Math.sin(T / (410 + i * 90))), .05));
  if (Math.random() < dt * .07 * zoom && dw < 10 && G.hour > 6 && G.hour < 20) gull();
  if (Math.random() < dt * .3 && G.hour > 5.5 && G.hour < 10 && !raining()) chirp();
  if (Math.random() < dt * .5 && (G.hour > 21 || G.hour < 5)) cricket();
  if (Math.random() < dt * .05 && G.citizens.some(z => z.dog?.on && z.pos.distanceTo(tgt) < 8)) bark();
}

/* ---------- shop interiors: interior-mapped glass with a shopkeeper silhouette ---------- */
const INTERIOR = {cafe: ['#c89a6a', '#f4f0e8', '#6a4a30', '#e0b070'], bakery: ['#e8c890', '#c8904a', '#e0b070', '#f4e8d0'], grocer: ['#d8e0c0', '#d9472b', '#7aa33a', '#e8a23a'], tasca: ['#8a4a3a', '#2f5a3a', '#6a2a2a', '#e8d8a8'], fish: ['#c0d0dc', '#a8b4bc', '#f0f4f8', '#6a7a88'], florist: ['#e8d8e0', '#d94f3d', '#f2a1b1', '#e8c34a'], books: ['#7a5a3a', '#8a3a2a', '#2f5f6f', '#c9a33f'], barber: ['#d8e4e8', '#e8e0d0', '#2a2622', '#b8342a']};
function interiorMat(c) {
  const [w, g1, g2, g3] = INTERIOR[c.biz] || INTERIOR.cafe;
  return new THREE.ShaderMaterial({
    uniforms: {uOpen: c.litU.uOpen, uTime: litU.uTime, uWall: {value: new THREE.Color(w)}, uG1: {value: new THREE.Color(g1)}, uG2: {value: new THREE.Color(g2)}, uG3: {value: new THREE.Color(g3)}, uSeed: {value: (c.seed % 97) / 97}},
    vertexShader: `varying vec2 vUv;varying vec3 vVP,vNrm;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vVP=mv.xyz;vNrm=normalMatrix*normal;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float uOpen,uTime,uSeed;uniform vec3 uWall,uG1,uG2,uG3;varying vec2 vUv;varying vec3 vVP,vNrm;
      float h21(vec2 p){return fract(sin(dot(p+uSeed,vec2(41.3,289.1)))*43758.5);}
      void main(){
        vec3 N=normalize(vNrm),P=vVP,V=normalize(P);
        vec3 dp1=dFdx(P),dp2=dFdy(P);vec2 du1=dFdx(vUv),du2=dFdy(vUv);
        vec3 d2p=cross(dp2,N),d1p=cross(N,dp1);vec3 T=d2p*du1.x+d1p*du2.x,B=d2p*du1.y+d1p*du2.y;
        float im=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-12));T*=im;B*=im;
        vec3 rd=vec3(dot(V,T),dot(V,B),dot(V,N));rd.z=min(rd.z,-.02);
        vec3 ro=vec3(vUv,0.);float D=.8;
        float tx=rd.x>0.?(1.-ro.x)/rd.x:-ro.x/rd.x,ty=rd.y>0.?(1.-ro.y)/rd.y:-ro.y/rd.y,tz=-D/rd.z;
        float t=min(min(tx,ty),tz);vec3 h=ro+rd*t;vec3 col;
        if(t==tz){col=uWall;float sy=fract(h.y*4.);vec2 cl=floor(vec2(h.x*8.,h.y*4.));
          if(sy<.08)col=uWall*.5;else if(sy<.55){float r=h21(cl);col=r<.33?uG1:r<.66?uG2:uG3;col*=.75+.35*h21(cl+3.);if(fract(h.x*8.)<.1)col=uWall*.65;}}
        else if(t==ty){col=rd.y<0.?mix(vec3(.3,.2,.13),vec3(.4,.28,.18),step(.5,fract((h.x-h.z)*3.))):uWall*1.1;}
        else{col=uWall*.78;}
        float tc=-D*.35/rd.z;vec3 hc=ro+rd*tc;if(tc<t&&hc.y<.3&&hc.x>.12&&hc.x<.88){col=vec3(.38,.24,.15)*(hc.y>.27?1.3:1.);t=tc;}
        float ts=-D*.55/rd.z;vec3 hs=ro+rd*ts;float sx=.6+.08*sin(uTime*.25+uSeed*9.);
        float body=length((hs.xy-vec2(sx,.4))*vec2(1.,.62))-.12,head=length(hs.xy-vec2(sx,.64))-.065;
        if(ts<t&&min(body,head)<0.&&hs.y>.28)col=vec3(.1,.075,.06);
        col*=1.-.35*clamp(-h.z/D,0.,1.);
        col*=mix(.2,1.9,uOpen)*vec3(1.08,.95,.78);
        float fr=pow(1.-clamp(-rd.z,0.,1.),3.);col=mix(col,vec3(.55,.62,.7),fr*.4+.06);
        gl_FragColor=vec4(col,1.);}`
  });
}

/* =====================================================================
   EXTRAS: weather, seasons, mist, reflections, festival, landmarks,
   requests, paper & life events, cats, save/load, undo, photo, tutorial
   ===================================================================== */
const BUDGET = () => PHONE ? 120 : 200;
G.weather = 'auto'; let snowAmt = 0; let wetAmt = 0; let fogAmt = 0;
const effWeather = () => G.weather === 'auto' ? (G.preset.name === 'Storm hill' ? 'rain' : 'clear') : G.weather;

/* ---- snow caps + wet streets on world materials ---- */
const envU = {uSnow: {value: 0}, uWet: {value: 0}};
function envPatch(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    if (prev) prev(sh);
    Object.assign(sh.uniforms, envU);
    sh.vertexShader = 'varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN=normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader = 'uniform float uSnow,uWet;varying vec3 vWN;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat up=smoothstep(.35,.75,vWN.y);diffuseColor.rgb*=1.-uWet*.32*up;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.95,1.),uSnow*up);');
  };
  mat.customProgramCacheKey = () => 'env-' + mat.uuid;
  mat.needsUpdate = true;
}
[roofMat, cobbleMat, stoneMat, plainMat, swayMat, bodyMat].forEach(envPatch);

/* ---- rain streaks + snow flakes ---- */
const RAINN = 1400, rainPos = new Float32Array(RAINN * 6);
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({color: 0xc8d4e0, transparent: true, opacity: .45})); rainLines.frustumCulled = false; scene.add(rainLines);
const SNOWN = 1600, snowPos = new Float32Array(SNOWN * 3), snowSeed = new Float32Array(SNOWN);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({size: .16, color: 0xffffff, map: glowTex('rgba(255,255,255,1)'), alphaTest: .4, transparent: true})); snowPts.frustumCulled = false; scene.add(snowPts);
for (let i = 0; i < RAINN; i++) { const x = (Math.random() - .5) * 36, y = Math.random() * 18, z = (Math.random() - .5) * 36; rainPos.set([x, y, z, x - .05, y - .5, z], i * 6); }
for (let i = 0; i < SNOWN; i++) { snowPos.set([(Math.random() - .5) * 36, Math.random() * 16, (Math.random() - .5) * 36], i * 3); snowSeed[i] = Math.random() * 100; }
function updateWeather(dt, t) {
  const w = effWeather(), k = Math.min(1, dt * .25);
  wetAmt += ((w === 'rain' ? 1 : 0) - wetAmt) * k; snowAmt += ((w === 'snow' ? 1 : 0) - snowAmt) * Math.min(1, dt * .3); fogAmt += ((w === 'fog' ? 1 : 0) - fogAmt) * k;
  envU.uWet.value = wetAmt; envU.uSnow.value = snowAmt;
  rainLines.visible = w === 'rain'; snowPts.visible = w === 'snow';
  if (rainLines.visible) { for (let i = 0; i < RAINN; i++) { const o = i * 6; let y = rainPos[o + 1] - dt * 14; if (y < -1) y += 18; rainPos[o + 1] = y; rainPos[o + 4] = y - .5; } rainGeo.attributes.position.needsUpdate = true; }
  if (snowPts.visible) { for (let i = 0; i < SNOWN; i++) { const o = i * 3, s = snowSeed[i]; snowPos[o] += Math.sin(t * .7 + s) * dt * .3 + G.preset.wind * dt * .15; snowPos[o + 1] -= dt * (.5 + (s % 1) * .4); if (snowPos[o + 1] < -1) snowPos[o + 1] += 16; if (snowPos[o] > 18) snowPos[o] -= 36; } snowGeo.attributes.position.needsUpdate = true; }
  const mistK = Math.max(fogAmt, THREE.MathUtils.smoothstep(G.hour, 4.5, 6.5) * (1 - THREE.MathUtils.smoothstep(G.hour, 8.5, 10.5)) * .8);
  scene.fog.near = lerp(95, 12, fogAmt); scene.fog.far = lerp(230, 70, fogAmt);
  mistU.uA.value = mistK; mistU.uT.value = t; mistU.uC.value.copy(scene.fog.color);
  leaves.visible = w !== 'snow';
}

/* ---- river mist + light reflections ---- */
const mistU = {uA: {value: 0}, uT: {value: 0}, uC: {value: new THREE.Color()}, uScale: glowU.uScale, map: {value: puffTex}};
const mistGeo = new THREE.BufferGeometry(), mistPts = new THREE.Points(mistGeo, new THREE.ShaderMaterial({
  uniforms: mistU, transparent: true, depthWrite: false,
  vertexShader: `attribute float ph;uniform float uT,uScale;varying float vA;void main(){vec3 p=position;p.x+=sin(uT*.07+ph)*1.2;p.y+=sin(uT*.2+ph*3.)*.05;vec4 mv=modelViewMatrix*vec4(p,1.);vA=.5+.5*sin(uT*.15+ph*7.);gl_PointSize=9.*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform sampler2D map;uniform float uA;uniform vec3 uC;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(mix(uC,vec3(1.),.35),t.a*uA*.5*vA);}`
})); mistPts.frustumCulled = false; scene.add(mistPts);
const streakTex = canvasTex(64, (x, s) => { const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, 'rgba(255,220,160,0)'); g.addColorStop(.2, 'rgba(255,210,150,.9)'); g.addColorStop(1, 'rgba(255,200,140,0)'); x.fillStyle = g; for (let i = 0; i < 6; i++) x.fillRect(s / 2 - 5 + (i % 3 - 1) * 3, i * 8, 10 - (i % 2) * 4, 22); });
const reflGeo = new THREE.BufferGeometry(), reflPts = new THREE.Points(reflGeo, new THREE.ShaderMaterial({
  uniforms: {uNight: litU.uNight, uTime: litU.uTime, uScale: glowU.uScale, map: {value: streakTex}}, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float thr,occ;uniform float uNight,uTime,uScale;varying float vA;void main(){vec3 p=position;p.x+=sin(uTime*2.+p.z*3.)*.05;vec4 mv=modelViewMatrix*vec4(p,1.);vA=(thr<0.?occ*.6:smoothstep(thr,thr+.06,uNight)*occ)*(.55+.45*sin(uTime*3.+p.x*4.));gl_PointSize=2.2*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform sampler2D map;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(t.rgb,t.a*vA*.55);}`
})); reflPts.frustumCulled = false; scene.add(reflPts);
let reflIdx = [];
function rebuildWaterFx() {
  if (typeof rebuildVisFx === 'function') setTimeout(rebuildVisFx, 0);
  const wc = G.cells.filter(c => c.water && c.kind !== 'bridge'), mp = [], ph = [];
  wc.forEach(c => { for (let k = 0; k < 3; k++) { mp.push(wx(c.i) + (Math.random() - .5) * 2, -.1 + Math.random() * .25, wx(c.j) + (Math.random() - .5) * 2); ph.push(Math.random() * 10); } });
  mistGeo.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mistGeo.setAttribute('ph', new THREE.Float32BufferAttribute(ph, 1));
  const pos = glowGeo.attributes.position, thr = glowGeo.attributes.thr, rp = [], rt = []; reflIdx = [];
  if (pos) for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const near = wc.find(c => Math.abs(wx(c.i) - x) < 1.6 && Math.abs(wx(c.j) - z) < 2.6); if (!near) continue;
    const ry = -.32 - (y + .32) * .35; let rz = z; const cz = wx(near.j); if (Math.abs(rz - cz) > .9) rz = cz + Math.sign(rz - cz) * .9;
    rp.push(x, ry, rz); rt.push(thr.getX(i)); reflIdx.push(i);
  }
  reflGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); reflGeo.setAttribute('thr', new THREE.Float32BufferAttribute(rt, 1)); reflGeo.setAttribute('occ', new THREE.Float32BufferAttribute(new Float32Array(rt.length).fill(1), 1));
}
function syncRefl() { const a = glowGeo.attributes.occ, b = reflGeo.attributes.occ; if (!a || !b) return; for (let k = 0; k < reflIdx.length; k++) b.array[k] = a.array[reflIdx[k]]; b.needsUpdate = true; }

/* ---- São João festival ---- */
G.festNight = -1; const FEST_STEP = {at: 20.5, act: 'party'};
const festActive = () => (G.day === G.festNight && G.hour >= 19.5) || (G.day === G.festNight + 1 && G.hour < 2);
const partyTime = () => (G.day === G.festNight && G.hour >= 20.5) || (G.day === G.festNight + 1 && G.hour < 1.3);
let festWas = false;
const FW = 900, fwPos = new Float32Array(FW * 3), fwCol = new Float32Array(FW * 3), fwA = new Float32Array(FW), fwV = new Float32Array(FW * 3), fwL = new Float32Array(FW);
const fwGeo = new THREE.BufferGeometry(); fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3)); fwGeo.setAttribute('aCol', new THREE.BufferAttribute(fwCol, 3)); fwGeo.setAttribute('aA', new THREE.BufferAttribute(fwA, 1));
const fwPts = new THREE.Points(fwGeo, new THREE.ShaderMaterial({uniforms: {uScale: glowU.uScale, map: {value: glowTex('rgba(255,255,255,1)')}}, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 aCol;attribute float aA;uniform float uScale;varying vec3 vC;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vC=aCol;vA=aA;gl_PointSize=.9*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform sampler2D map;varying vec3 vC;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vC,t.a*vA);}`})); fwPts.frustumCulled = false; scene.add(fwPts);
let fwCur = 0, fwT = 0;
function firework() {
  const c = new THREE.Color().setHSL(Math.random(), .9, .6), x = (Math.random() - .5) * 16, y = 13 + Math.random() * 5, z = (Math.random() - .5) * 16;
  for (let k = 0; k < 70; k++) { const i = (fwCur++) % FW, th = Math.random() * 6.283, ph = Math.acos(Math.random() * 2 - 1), sp = 3 + Math.random() * 1.5; fwPos.set([x, y, z], i * 3); fwV.set([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp], i * 3); fwCol.set([c.r, c.g, c.b], i * 3); fwL[i] = 1.6 + Math.random() * .6; fwA[i] = 1; }
  if (live()) { const s = AC.createBufferSource(); s.buffer = NB; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = AC.createGain(), t0 = AC.currentTime + .25; s.connect(f).connect(g).connect(master); g.gain.setValueAtTime(.12, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .9); s.start(t0); s.stop(t0 + 1); for (let k = 0; k < 8; k++) tone(2500 + Math.random() * 2500, .03, .01, 'square', .5 + k * .08); }
  fwGeo.attributes.aCol.needsUpdate = true;
}
const MELODY = [0, 4, 7, 9, 7, 4, 2, 4, 5, 9, 12, 9, 7, 5, 4, 2]; let melT = 0, melI = 0;
function updateFestival(dt) {
  const on = festActive();
  if (on !== festWas) { festWas = on; rebuildLaundry(); if (on) { toast('São João! Lanterns are up, and the town is out to celebrate'); paperNote('São João lights up the town'); } }
  let any = false;
  for (let i = 0; i < FW; i++) { if (fwA[i] <= 0) continue; any = true; fwL[i] -= dt; fwV[i * 3 + 1] -= 2.2 * dt; fwPos[i * 3] += fwV[i * 3] * dt; fwPos[i * 3 + 1] += fwV[i * 3 + 1] * dt; fwPos[i * 3 + 2] += fwV[i * 3 + 2] * dt; fwA[i] = Math.max(0, Math.min(1, fwL[i])); }
  if (any) { fwGeo.attributes.position.needsUpdate = true; fwGeo.attributes.aA.needsUpdate = true; }
  if (on && G.hour >= 21 && (G.hour < 24 || G.hour < 1)) { fwT -= dt * Math.max(1, G.speed); if (fwT <= 0) { firework(); fwT = 1.5 + Math.random() * 2.5; } }
  if (on && live() && partyTime()) { melT -= dt; if (melT <= 0) { melT = .26; const n = MELODY[melI++ % MELODY.length]; const f = 392 * Math.pow(2, n / 12); tone(f, .24, .022, 'triangle'); if (melI % 4 === 0) tone(f / 2, .4, .018, 'sine'); } }
}
function bunting(g, lit, a, b, k, R) {
  const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, .5).add(new THREE.Vector3(0, -.1 * k, 0)), b);
  g.push(paint(new THREE.TubeGeometry(curve, 10, .008, 3), '#2a2622'));
  const tri = new THREE.Shape([new THREE.Vector2(-.06, 0), new THREE.Vector2(.06, 0), new THREE.Vector2(0, -.13)]);
  const dir = b.clone().sub(a).normalize(), ry = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  for (let u = .06; u < .95; u += .07) { const p = curve.getPoint(u); const fg = paint(new THREE.ExtrudeGeometry(tri, {depth: .005, bevelEnabled: false}), pick(R, festColors())); fg.applyMatrix4(tr(p.x, p.y, p.z, ry)); g.push(fg); }
  for (let u = .2; u < .9; u += .3) { const p = curve.getPoint(u); lit.push(setAttr(paint(new THREE.SphereGeometry(.07, 8, 6), '#fff').applyMatrix4(mul(tr(p.x, p.y - .12, p.z), new THREE.Matrix4().makeScale(1, 1.3, 1))), 'lthr', .05)); }
}

/* ---- landmarks: church, tram, funicular ---- */
G.unlocked = {church: false, tram: false, funicular: false}; G.tram = null; G.funi = null;
const UNLOCK = () => ({church: Math.round(BUDGET() * .5), tram: Math.round(BUDGET() * .65), funicular: Math.round(BUDGET() * .8)});
const LM_COST = {church: 400, tram: 600, funicular: 800};
function checkUnlocks() {
  const u = UNLOCK(), n = G.citizens.length;
  for (const k of ['church', 'tram', 'funicular']) if (!G.unlocked[k] && n >= u[k]) { G.unlocked[k] = true; toast(`Unlocked: ${{church: 'Church with bell tower', tram: 'Tram line', funicular: 'Funicular'}[k]}! Find it in the Landmark tool`); paperNote(`Town reaches ${n} residents. Council approves a ${k}`); }
}
function buildChurch(c) {
  const body = [], roof = [], plain = [], lit = [], wall = '#f0e8d8', R = rng(c.seed + 77);
  body.push(box(1.3, 1.1, 1.6, wall, tr(.15, .55, 0))); body.push(box(1.34, .12, 1.64, '#d8ccb4', tr(.15, 0.06, 0)));
  const sh = new THREE.Shape([new THREE.Vector2(-.65, 0), new THREE.Vector2(.65, 0), new THREE.Vector2(0, .55)]);
  const gab = paint(new THREE.ExtrudeGeometry(sh, {depth: 1.6, bevelEnabled: false}), wall); gab.applyMatrix4(tr(.15, 1.1, -.8)); body.push(gab);
  for (const s of [1, -1]) roof.push(box(.95, .06, 1.72, '#a83d2c', mul(tr(.15 + s * .33, 1.38, 0), tr(0, 0, 0, 0, 0, -s * .7))));
  body.push(box(.6, 2.5, .6, wall, tr(-.62, 1.25, -.45))); body.push(box(.66, .1, .66, '#d8ccb4', tr(-.62, 1.8, -.45)));
  roof.push(paint(new THREE.ConeGeometry(.45, .9, 4), '#5a6a72').applyMatrix4(tr(-.62, 2.95, -.45, Math.PI / 4)));
  plain.push(box(.03, .35, .03, '#c9a33f', tr(-.62, 3.55, -.45))); plain.push(box(.2, .03, .03, '#c9a33f', tr(-.62, 3.6, -.45)));
  plain.push(cyl(.17, .17, .03, '#f4f0e8', tr(-.62, 2.05, -.14, 0, Math.PI / 2), 16)); plain.push(box(.015, .12, .01, '#1e1a18', tr(-.62, 2.09, -.12))); plain.push(box(.09, .015, .01, '#1e1a18', tr(-.6, 2.05, -.12)));
  for (const zz of [-.14, -.76]) plain.push(box(.22, .32, .04, '#2a2622', tr(-.62, 2.4, zz)));
  plain.push(cyl(.06, .1, .14, '#b8862e', tr(-.62, 2.35, -.45), 8));
  body.push(box(.06, .62, .4, '#ece0c6', tr(.82, .42, 0))); plain.push(box(.04, .55, .32, '#5a3420', tr(.83, .36, 0)));
  for (const zz of [-.55, .55]) { body.push(box(.05, .5, .26, '#ece0c6', tr(.81, .8, zz))); lit.push(setAttr(box(.03, .42, .18, '#fff', tr(.83, .8, zz)), 'lthr', .35)); }
  for (const xx of [-.3, .15, .6]) { lit.push(setAttr(box(.18, .38, .03, '#fff', tr(xx, .7, .815)), 'lthr', .4)); lit.push(setAttr(box(.18, .38, .03, '#fff', tr(xx, .7, -.815)), 'lthr', .4)); }
  body.push(cyl(.16, .16, .04, '#2f5ea8', tr(.82, 1.25, 0, 0, 0, Math.PI / 2), 14));
  for (let q = 0; q < 3; q++) plain.push(box(.3, .06, 1.1 - q * .2, '#b8aa98', tr(1.0 - q * .1, .03 + q * .06, 0)));
  return {body, roof, plain, lit, glows: []};
}
function straightRuns(minLen, test) {
  const runs = [];
  for (const [dx, dz] of [[1, 0], [0, 1]]) for (const c of G.cells) {
    const prev = cellAt(c.i - dx, c.j - dz); if (!test(c) || (prev && test(prev) && prev.lvl === c.lvl)) continue;
    const run = [c]; let n = cellAt(c.i + dx, c.j + dz); while (n && test(n) && n.lvl === c.lvl) { run.push(n); n = cellAt(n.i + dx, n.j + dz); }
    if (run.length >= minLen) runs.push(run);
  }
  return runs.sort((a, b) => b.length - a.length);
}
function planTram() { const r = straightRuns(4, c => walkable(c) && !c.water && c.kind !== 'plaza'); return r.length ? {cells: r[0].map(c => [c.i, c.j]), t: 0, dir: 1, wait: 0} : null; }
function planFuni() {
  let best = null;
  for (const [dx, dz] of DIRS) for (const a of G.cells) {
    if (!walkable(a) || a.water) continue;
    for (let k = 3; k <= 5; k++) { const b = cellAt(a.i + dx * k, a.j + dz * k); if (!b || !walkable(b) || b.water) continue; const rise = b.lvl - a.lvl; if (rise >= 2 && (!best || rise > best.rise || (rise === best.rise && k < best.k))) best = {a: [a.i, a.j], b: [b.i, b.j], rise, k}; }
  }
  return best ? {...best, t: 0, dir: 1, wait: 0} : null;
}
const tramG = new THREE.Group(), funiG = new THREE.Group(); scene.add(tramG, funiG);
function buildTramCar() {
  const g = [], l = [];
  g.push(box(1.05, .26, .46, '#e8b83a', tr(0, .3, 0))); g.push(box(1.07, .06, .48, '#b8342a', tr(0, .45, 0))); g.push(box(1.05, .2, .46, '#efe3c8', tr(0, .58, 0)));
  g.push(box(1.12, .05, .5, '#6a6a68', tr(0, .7, 0))); g.push(box(.02, .28, .02, '#2a2622', tr(.1, .86, 0, 0, 0, .5))); g.push(box(.3, .02, .02, '#2a2622', tr(.17, .99, 0)));
  for (const x of [-.32, .32]) for (const z of [-.18, .18]) g.push(cyl(.07, .07, .04, '#2a2622', tr(x, .1, z, 0, Math.PI / 2), 10));
  for (let q = 0; q < 4; q++) for (const z of [-.235, .235]) l.push(setAttr(box(.18, .14, .01, '#fff', tr(-.36 + q * .24, .59, z)), 'lthr', .3));
  for (const x of [-.53, .53]) l.push(setAttr(box(.01, .14, .3, '#fff', tr(x, .59, 0)), 'lthr', .3));
  const grp = new THREE.Group(); grp.add(mkMesh(g, plainMat, true)); grp.add(mkMesh(l, litMat, false)); return grp;
}
function buildFuniCar() {
  const g = [], l = [];
  g.push(box(.5, .5, .9, '#b8342a', tr(0, .3, 0))); g.push(box(.52, .06, .92, '#efe3c8', tr(0, .58, 0))); g.push(box(.52, .06, .92, '#2a2622', tr(0, .05, 0)));
  for (let q = 0; q < 3; q++) for (const x of [-.255, .255]) l.push(setAttr(box(.01, .16, .2, '#fff', tr(x, .36, -.28 + q * .28)), 'lthr', .3));
  const grp = new THREE.Group(); grp.add(mkMesh(g, plainMat, true)); grp.add(mkMesh(l, litMat, false)); return grp;
}
function landmarkDecor(out) {
  tramG.clear(); funiG.clear();
  if (G.tram) {
    const cs = G.tram.cells.map(([i, j]) => cellAt(i, j));
    if (cs.some(c => !walkable(c) || c.water) || cs.some(c => c.lvl !== cs[0].lvl)) { G.tram.broken = true; } else {
      G.tram.broken = false; const a = cs[0], b = cs.at(-1), dx = Math.sign(b.i - a.i), dz = Math.sign(b.j - a.j), y = a.lvl * LV + .02, len = (cs.length - 1) * S + 1.6;
      const cx = (wx(a.i) + wx(b.i)) / 2, cz = (wx(a.j) + wx(b.j)) / 2;
      for (const off of [-.17, .17]) out.push(box(dx ? len : .04, .02, dx ? .04 : len, '#4a4a48', tr(cx - dz * off, y, cz + dx * off)));
      for (let q = 0; q < cs.length; q++) { const c = cs[q]; if (q % 2 === 0) { out.push(cyl(.035, .045, 1.5, '#2a2622', tr(wx(c.i) - dz * .7, y + .75, wx(c.j) + dx * .7), 6)); out.push(box(dx ? .04 : .9, .03, dx ? .9 : .04, '#2a2622', tr(wx(c.i) - dz * .35, y + 1.45, wx(c.j) + dx * .35))); } }
      out.push(box(dx ? len : .015, .015, dx ? .015 : len, '#1e1a18', tr(cx, y + 1.0, cz)));
      G.tram.car = buildTramCar(); tramG.add(G.tram.car); G.tram.A = new THREE.Vector3(wx(a.i), y, wx(a.j)); G.tram.B = new THREE.Vector3(wx(b.i), y, wx(b.j)); G.tram.car.rotation.y = dx ? 0 : Math.PI / 2;
    }
  }
  if (G.funi) {
    const a = cellAt(...G.funi.a), b = cellAt(...G.funi.b);
    if (!walkable(a) || !walkable(b) || b.lvl - a.lvl < 1) G.funi.broken = true; else {
      G.funi.broken = false; const A = new THREE.Vector3(wx(a.i), a.lvl * LV + .35, wx(a.j)), B = new THREE.Vector3(wx(b.i), b.lvl * LV + .35, wx(b.j));
      const mid = A.clone().lerp(B, .5), d = B.clone().sub(A), L = d.length(), yaw = Math.atan2(d.x, d.z), pitch = -Math.asin(d.y / L);
      for (const off of [-.18, .18]) out.push(box(.05, .05, L + .4, '#3a3a3a', mul(tr(mid.x + Math.cos(yaw) * off, mid.y, mid.z - Math.sin(yaw) * off, yaw), tr(0, 0, 0, 0, pitch))));
      out.push(box(.5, .06, L + .4, '#6a5a48', mul(tr(mid.x, mid.y - .05, mid.z, yaw), tr(0, 0, 0, 0, pitch))));
      const n = Math.ceil(L / 1.4); for (let q = 0; q <= n; q++) { const p = A.clone().lerp(B, q / n), ground = (cellOf(p)?.floors ? topY(cellOf(p)) : (cellOf(p)?.water ? -.3 : (cellOf(p)?.lvl || 0) * LV)); const h = p.y - ground; if (h > .15) out.push(box(.08, h, .08, '#4a4440', tr(p.x, ground + h / 2, p.z))); }
      for (const P of [A, B]) { out.push(box(.9, .05, .9, '#8b7d6e', tr(P.x, P.y - .32, P.z))); out.push(box(.9, .04, .9, '#6a6a68', tr(P.x, P.y + .62, P.z))); for (const s of [-.4, .4]) out.push(box(.04, .9, .04, '#2a2622', tr(P.x + s, P.y + .15, P.z + .4))); }
      G.funi.car = buildFuniCar(); funiG.add(G.funi.car); G.funi.A = A; G.funi.B = B; G.funi.car.rotation.set(pitch, yaw, 0, 'YXZ');
    }
  }
}
function updateTransit(dt) {
  for (const v of [G.tram, G.funi]) {
    if (!v || v.broken || !v.car) continue;
    if (v.wait > 0) { v.wait -= dt * Math.max(G.speed, .5); continue; }
    const L = v.A.distanceTo(v.B), sp = (v === G.tram ? 1.1 : .7) * Math.max(G.speed, G.speed ? 1 : 0) / L;
    v.t += v.dir * dt * sp; if (v.t >= 1 || v.t <= 0) { v.t = THREE.MathUtils.clamp(v.t, 0, 1); v.dir *= -1; v.wait = 3; if (live() && v.car.position.distanceTo(controls.target) < 14) { tone(1320, .25, .03, 'sine'); tone(1320, .25, .03, 'sine', .3); } }
    const e = v.t * v.t * (3 - 2 * v.t); v.car.position.lerpVectors(v.A, v.B, e); warpV(v.car.position);
  }
}

/* ---- citizen requests ---- */
G.requests = []; G.reqDone = [];
const REQ_KINDS = ['shop', 'shop', 'shop', 'plaza', 'lamp', 'tree', 'homes', 'bridge'];
function makeRequest() {
  const adults = G.citizens.filter(z => z.role !== 'child' && z.role !== 'baby' && !G.requests.some(r => r.z === z)); if (!adults.length) return;
  const z = pick(Math.random, adults), kind = pick(Math.random, REQ_KINDS), st = streetName(z.home.i);
  const near = (pred, d) => G.cells.some(c => pred(c) && Math.abs(c.i - z.home.i) + Math.abs(c.j - z.home.j) <= d);
  let r = null;
  if (kind === 'shop') { const type = pick(Math.random, Object.keys(BIZ).filter(t => !near(c => c.biz === t, 4))); if (type) r = {text: `${z.name.split(' ')[0]} wants a ${BIZ[type].label.toLowerCase()} near ${st}`, test: () => near(c => c.biz === type && c.bizObj, 4), reward: 220}; }
  if (kind === 'plaza' && !near(c => c.kind === 'plaza', 4)) r = {text: `Neighbours on ${st} want a plaza to sit and chat`, test: () => near(c => c.kind === 'plaza', 4), reward: 260};
  if (kind === 'lamp' && !near(c => c.kind === 'lamp', 2)) r = {text: `${z.name.split(' ')[0]} says ${st} is too dark at night`, test: () => near(c => c.kind === 'lamp', 2), reward: 90};
  if (kind === 'tree' && !near(c => c.kind === 'tree', 2)) r = {text: `${z.name.split(' ')[0]} wishes ${st} had a tree`, test: () => near(c => c.kind === 'tree', 2), reward: 60};
  if (kind === 'homes') { const f0 = G.cells.reduce((a, c) => a + c.floors, 0); r = {text: `${z.name.split(' ')[0]}'s cousin needs a home: build 3 more floors`, test: () => G.cells.reduce((a, c) => a + c.floors, 0) >= f0 + 3, reward: 300}; }
  if (kind === 'bridge') { const b0 = G.cells.filter(c => c.kind === 'bridge').length; if (b0 < 6) r = {text: `People want another way across the river`, test: () => G.cells.filter(c => c.kind === 'bridge').length > b0, reward: 280}; }
  if (!r) return;
  r.z = z; r.day = G.day; G.requests.push(r); toast(`New request: ${r.text}`); updateReqChip();
}
function checkRequests() {
  for (const r of [...G.requests]) if (r.test()) {
    G.requests = G.requests.filter(o => o !== r); G.funds += r.reward; G.reqDone.push(r); dayStats.reqs++;
    const near = G.citizens.filter(z => Math.abs(z.home.i - r.z.home.i) + Math.abs(z.home.j - r.z.home.j) <= 3); near.forEach(z => { z.bonus = .12; z.bonusUntil = G.day + 2; });
    toast(`Request done: ${r.text}. +${euro(r.reward)}, and the neighbours are happier`); say3(r.z, 'Obrigado!'); paperNote(`Council answers residents: ${r.text.replace(/^.+? (wants|says|wishes)/, 'neighbours got what they asked for:')}`.slice(0, 90));
    updateEco();
  }
  for (const r of [...G.requests]) if (!G.citizens.includes(r.z)) G.requests = G.requests.filter(o => o !== r);
  updateReqChip();
}
const reqEl = document.getElementById('reqs'), paperEl = document.getElementById('paperBtn');
function updateReqChip() { reqEl.textContent = `Requests ${G.requests.length}`; reqEl.classList.toggle('hot', G.requests.length > 0); }
reqEl.onclick = () => {
  G.cardFor = {kind: 'reqs'};
  cardEl.innerHTML = `<div class="ch"><div><b>Requests</b><small>Fulfil them for money and happier neighbours</small></div><button class="x">×</button></div>
    ${G.requests.length ? G.requests.map(r => `<p class="req"><span>${euro(r.reward)}</span>${r.text}</p>`).join('') : '<p>No open requests. New ones arrive each morning.</p>'}
    ${G.reqDone.length ? `<p class="tip">Done: ${G.reqDone.length}</p>` : ''}`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
};

/* ---- town paper & life events ---- */
G.paper = []; G.paperToday = [];
function paperNote(t) { G.paperToday.push(t); }
paperEl.onclick = () => paperCard();
function paperCard() {
  G.cardFor = {kind: 'paper'};
  const ed = G.paper.at(-1);
  cardEl.innerHTML = `<div class="ch"><div><b>O Jornal de ${escH(townName())}</b><small>${ed ? `Day ${ed.day + 1} edition` : 'First edition tomorrow morning'}</small></div><button class="x">×</button></div>
    ${ed ? ed.items.map((t, k) => `<p class="${k ? '' : 'lead'}">${t}</p>`).join('') : '<p>The printing press is warming up. Check back after midnight.</p>'}`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
}
function lifeEvents(L) {
  const adults = G.citizens.filter(z => ['worker', 'retiree', 'student', 'keeper', 'staff'].includes(z.role) && z.age < 60 && z.age > 22);
  if (Math.random() < .35 && adults.length > 3) {
    const a = pick(Math.random, adults), b = pick(Math.random, adults.filter(o => o !== a && o.home !== a.home && o.male !== a.male && Math.abs(o.age - a.age) < 12));
    if (b) { const last = a.name.split(' ')[1]; b.home.res = b.home.res.filter(o => o !== b); b.home = a.home; a.home.res.push(b); b.name = `${b.name.split(' ')[0]} ${last}`; L.items.push(`Wedding bells: ${a.name.split(' ')[0]} and ${b.name.split(' ')[0]} ${last} tie the knot`); }
  }
  if (Math.random() < .3 && G.citizens.length < BUDGET()) {
    const homes = G.cells.filter(c => (c.res || []).filter(z => z.role !== 'child' && z.role !== 'baby' && z.age < 45).length >= 2);
    if (homes.length) { const h = pick(Math.random, homes), par = h.res.find(z => z.role !== 'child'), male = Math.random() < .5, n = Math.floor(Math.random() * 1e9);
      const z = {id: G.citizens.length, male, name: `${pick(Math.random, male ? FIRST_M : FIRST_F)} ${par.name.split(' ')[1]}`, home: h, seedN: n, R: rng(n), pos: new THREE.Vector3(), yaw: 0, state: 'inside', where: {type: 'home'}, wp: [], lane: 0, phase: 0, talkCD: 0, carry: false, role: 'baby', age: 0, parent: par, wallet: 0, plan: [{at: 0, act: 'home'}], dog: null};
      makeLook(z, z.R); G.citizens.push(z); h.res.push(z); L.items.push(`A baby! ${z.name.split(' ')[0]} is born on ${streetName(h.i)}`); }
  }
}
function writePaper(L) {
  const items = [];
  const best = [...G.businesses].sort((a, b) => (b.lastRev || 0) - (a.lastRev || 0))[0];
  if (best && best.lastRev) items.push(`${best.name} has its best-selling day: ${euro(best.lastRev)} through the till`);
  L.closed.forEach(n => items.push(`${n} closes its doors; neighbours worried`));
  L.moved.slice(0, 2).forEach(n => items.push(`${n} has moved away`));
  if (L.arrived) items.push(`${L.arrived} newcomer${L.arrived > 1 ? 's' : ''} moved into town`);
  items.push(...G.paperToday); G.paperToday = [];
  const w = effWeather(); items.push(w === 'rain' ? 'Weather: umbrellas out, cafés move indoors' : w === 'snow' ? 'Weather: snow on the rooftops' : w === 'fog' ? 'Weather: thick fog rolls in from the river' : 'Weather: fair skies over the river');
  items.push(`Town mood ${Math.round(townJoy() * 100)}% · treasury ${euro(G.funds)} · ${G.citizens.length} residents`);
  return items;
}

/* ---- cats ---- */
const CATN = 9, catGeo = mergeGeometries([paint(new THREE.SphereGeometry(.06, 8, 6), '#fff').applyMatrix4(mul(tr(0, .07, 0), new THREE.Matrix4().makeScale(.8, .75, 1.5))), paint(new THREE.SphereGeometry(.042, 8, 6), '#fff').applyMatrix4(tr(0, .12, .09)), box(.02, .03, .01, '#fff', tr(-.022, .16, .09, 0, 0, .3)), box(.02, .03, .01, '#fff', tr(.022, .16, .09, 0, 0, -.3)), cyl(.009, .006, .13, '#fff', tr(0, .12, -.12, 0, -.9), 4), ...[[-.025, .05], [.025, .05], [-.025, -.05], [.025, -.05]].map(([x, z]) => cyl(.008, .008, .05, '#fff', tr(x, .025, z), 4))]);
const cats = Array.from({length: CATN}, (_, i) => { return {pos: new THREE.Vector3(), tgt: null, wait: Math.random() * 5, yaw: 0, sit: true}; });
function placeCats() { const opts = G.cells.filter(c => walkable(c) && !c.water); cats.forEach(k => { const c = opts.length ? pick(Math.random, opts) : null; if (c) k.pos.set(wx(c.i) + (Math.random() - .5) * 1.4, walkY(c), wx(c.j) + (Math.random() - .5) * 1.4); }); catsToRoofs(); }
function updateCats(dt, t) {
  const opts = G.cells.filter(c => walkable(c) && !c.water);
  cats.forEach((k, i) => {
    if (k.roof) k.sit = true; else if (k.tgt) { const d = k.tgt.clone().sub(k.pos); d.y = 0; const L = d.length(); if (L < .05) { k.tgt = null; k.wait = 3 + Math.random() * 10; k.sit = true; } else { k.pos.addScaledVector(d, Math.min(1, dt * .45 * Math.max(G.speed, 0) / L)); k.yaw = Math.atan2(d.x, d.z); k.sit = false; const c = cellOf(k.pos); if (c) k.pos.y += (walkY(c) - k.pos.y) * Math.min(1, dt * 4); } }
    else { k.wait -= dt * G.speed; if (k.wait <= 0 && opts.length) { const here = cellOf(k.pos); const n = opts.filter(c => here && Math.abs(c.i - here.i) + Math.abs(c.j - here.j) <= 1); const c = pick(Math.random, n.length ? n : opts); k.tgt = new THREE.Vector3(wx(c.i) + (Math.random() - .5) * 1.4, walkY(c), wx(c.j) + (Math.random() - .5) * 1.4); } }
  });
}

/* ---- save / load / town code ---- */
const SAVE_KEY = 'tilt-town-save-v1';
function colHex(c) { return c ? '#' + c.getHexString() : null; }
function serialize() {
  const idx = c => c ? c.i * N + c.j : -1;
  return {v: 1, day: G.day, hour: G.hour, funds: G.funds, preset: PRESETS.indexOf(G.preset), weather: G.weather, festNight: G.festNight, unlocked: G.unlocked, tram: G.tram && {cells: G.tram.cells}, funi: G.funi && {a: G.funi.a, b: G.funi.b, rise: G.funi.rise, k: G.funi.k}, ledger: {...G.ledger, closed: [], moved: []}, paper: G.paper.slice(-3),
    cells: G.cells.map(c => [c.lvl, c.water ? 1 : 0, c.floors, c.kind || 0, c.biz || 0, c.bizName || 0, c.seed, c.owned === false ? 0 : 1, Math.round((c.cond ?? 1) * 100) / 100, c.style || 0, c.broken ? 1 : 0, c.statue ? 1 : 0, c.yard && c.yard.length ? c.yard.join(',') : 0, c.bizLvl || 0, c.dist || 0, c.paint || 0]),
    meta: {own: ownSave(), stars: G.stars, landBought: G.landBought, quayWalls: G.quayWalls, scen: {...G.scen}, notables: Object.fromEntries(Object.entries(G.notables).map(([k, z]) => [k, G.citizens.indexOf(z)])), stories: G.stories.map(s => ({id: s.id, zi: G.citizens.indexOf(s.z), step: s.step, done: s.done})), nata: G.nataCell ? G.nataCell.i * N + G.nataCell.j : -1, stage: G.stageCell ? G.stageCell.i * N + G.stageCell.j : -1},
    biz: G.businesses.map(b => [idx(b.cell), Math.round(b.cash), Math.round(b.rev), b.hist, b.visits]),
    cit: G.citizens.map(z => ({n: z.name, m: z.male ? 1 : 0, r: z.role, a: z.age, h: idx(z.home), w: z.work && z.work !== 'away' ? idx(z.work.cell) : -1, p: z.parent ? G.citizens.indexOf(z.parent) : -1, wl: Math.round(z.wallet || 0), s: z.seedN || 1, ch: z.chatty ? 1 : 0, d: z.dog ? [colHex(z.dog.c), z.dog.s] : 0, f: z.fav ? idx(z.fav.cell) : -1,
      L: [z.s, z.bw, colHex(z.skin), colHex(z.shirt), colHex(z.pants), colHex(z.hairC), z.hair, z.beard ? 1 : 0, z.hat, colHex(z.hatC), z.skirt ? 1 : 0, colHex(z.skirtC), colHex(z.tights), z.shortSleeve ? 1 : 0, colHex(z.shoeC), z.lean, z.cane ? 1 : 0, z.apron ? 1 : 0, colHex(z.bagC), colHex(z.umbC)]}))};
}
function loadTown(D) {
  G.cells.forEach(c => { if (c.tmesh) terrainG.remove(c.tmesh); if (c.obj) objG.remove(c.obj); }); G.businesses = []; closeCard();
  G.cells = D.cells.map((a, k) => ({i: Math.floor(k / N), j: k % N, lvl: a[0], water: !!a[1], floors: a[2], kind: a[3] || null, biz: a[4] || null, bizName: a[5] || null, seed: a[6], tmesh: null, obj: null, glows: [], owned: a[7] !== 0, cond: a[8] ?? 1, style: a[9] || null, broken: !!a[10], statue: !!a[11], yard: a[12] ? String(a[12]).split(',') : [], bizLvl: a[13] || 0, dist: a[14] || null, paint: a[15] || null}));
  const M_ = D.meta || {}; ownLoad(M_.own); G.stars = Math.max(G.stars, M_.stars || 0); G.landBought = M_.landBought || 0; G.quayWalls = !!M_.quayWalls; G.scen = M_.scen || {id: 'free'}; G.nataCell = M_.nata >= 0 ? G.cells[M_.nata] : null; G.stageCell = M_.stage >= 0 ? G.cells[M_.stage] : null; G.events = []; resetDayStats();
  G.day = D.day; G.hour = D.hour; G.funds = D.funds; cheatApply(); G.preset = PRESETS[D.preset] || PRESETS[0]; G.weather = D.weather || 'auto'; G.festNight = D.festNight ?? -1; G.unlocked = D.unlocked || G.unlocked; G.ledger = D.ledger || G.ledger; G.paper = D.paper || [];
  G.tram = D.tram ? {...D.tram, t: 0, dir: 1, wait: 0} : null; G.funi = D.funi ? {...D.funi, t: 0, dir: 1, wait: 0} : null;
  G.cells.forEach(c => { rebuildTerrain(c); rebuildObj(c); }); rebuildGlows(); rebuildLaundry();
  for (const [ci, cash, rev, hist, visits] of D.biz || []) { const b = G.businesses.find(o => o.cell === G.cells[ci]); if (b) Object.assign(b, {cash, rev, hist: hist || [], visits: visits || 0}); }
  G.cells.forEach(c => c.res = []);
  G.citizens = D.cit.map((o, k) => {
    const z = {id: k, male: !!o.m, name: o.n, role: o.r, age: o.a, home: G.cells[o.h], seedN: o.s, R: rng(o.s), pos: new THREE.Vector3(), yaw: 0, state: 'inside', where: {type: 'home'}, wp: [], lane: (rng(o.s + 1)() - .5) * .6, phase: 0, talkCD: 0, carry: false, wallet: o.wl, chatty: !!o.ch};
    z.work = o.w >= 0 ? G.businesses.find(b => b.cell === G.cells[o.w]) || 'away' : (['worker', 'courier'].includes(o.r) ? 'away' : null);
    if (z.work === 'away' && (o.r === 'keeper' || o.r === 'staff')) z.role = 'worker';
    z.fav = o.f >= 0 ? G.businesses.find(b => b.cell === G.cells[o.f]) || null : null;
    z.dog = o.d ? {c: new THREE.Color(o.d[0]), s: o.d[1], pos: new THREE.Vector3(), yaw: 0} : null;
    const L = o.L, C = h => h ? new THREE.Color(h) : new THREE.Color('#888');
    Object.assign(z, {s: L[0], bw: L[1], skin: C(L[2]), shirt: C(L[3]), pants: C(L[4]), hairC: C(L[5]), hair: L[6], beard: !!L[7], hat: L[8], hatC: C(L[9]), skirt: !!L[10], skirtC: C(L[11]), tights: C(L[12]), shortSleeve: !!L[13], shoeC: C(L[14]), lean: L[15], cane: !!L[16], apron: !!L[17], bagC: C(L[18]), umbC: C(L[19])});
    (z.home.res ||= []).push(z); return z;
  });
  D.cit.forEach((o, k) => { if (o.p >= 0) G.citizens[k].parent = G.citizens[o.p]; });
  G.citizens.forEach(z => { z.plan = makePlan(z); z.step = null; });
  G.notables = {}; for (const [k, zi] of Object.entries(M_.notables || {})) { const z = G.citizens[zi]; if (!z) continue; G.notables[k] = z; z.notable = {mayor: 'Mayor', gossip: 'Town gossip', painter: 'Painter'}[k]; if (k === 'painter') z.plan = [{at: 0, act: 'home'}, {at: 9.5, act: 'paint'}, {at: 16, act: 'cafe'}, {at: 18, act: 'home'}]; }
  G.stories = (M_.stories || []).filter(s => G.citizens[s.zi] && STORY_DEFS[s.id]).map(s => Object.assign(STORY_DEFS[s.id](G.citizens[s.zi]), {step: s.step, done: s.done}));
  ownAfterCitizens(); computeMood(); buildPeopleMeshes(); warmStart(); rebuildWaterFx(); placeCats(); updateEco(); updateReqChip(); computeTraits(); makeGoals(); updateScenChip(); rebuildLaundry();
  [...presetsEl.children].forEach((x, k) => x.classList.toggle('on', PRESETS[k] === G.preset));
}
let saveT = 0;
function autosave(now_) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); localStorage.setItem('tilt-stars', String(G.stars)); } catch (e) { } }
function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(G.autosave, 1500); }
async function townCode() {
  const json = JSON.stringify(serialize());
  if (window.CompressionStream) { const s = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')); const buf = new Uint8Array(await new Response(s).arrayBuffer()); let bin = ''; buf.forEach(b => bin += String.fromCharCode(b)); return 'Z' + btoa(bin); }
  return 'J' + btoa(unescape(encodeURIComponent(json)));
}
async function fromCode(code) {
  code = code.trim();
  if (code[0] === 'Z') { const bin = atob(code.slice(1)), buf = Uint8Array.from(bin, ch => ch.charCodeAt(0)); const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')); return JSON.parse(await new Response(s).text()); }
  if (code[0] === 'J') return JSON.parse(decodeURIComponent(escape(atob(code.slice(1)))));
  throw new Error('bad code');
}

/* ---- undo ---- */
const undoStack = [];
function snapshot() { undoStack.push({cells: G.cells.map(c => ({lvl: c.lvl, floors: c.floors, kind: c.kind, biz: c.biz, bizName: c.bizName})), funds: G.funds, tram: G.tram && {cells: G.tram.cells}, funi: G.funi && {...G.funi, car: null}}); if (undoStack.length > 25) undoStack.shift(); }
function undo() {
  const s = undoStack.pop(); if (!s) { say('Nothing to undo'); return; }
  G.cells.forEach((c, k) => Object.assign(c, s.cells[k])); G.funds = s.funds; G.tram = s.tram ? {...s.tram, t: 0, dir: 1, wait: 0} : null; G.funi = s.funi ? {...s.funi, t: 0, dir: 1, wait: 0} : null;
  G.cells.forEach(c => { rebuildTerrain(c); rebuildObj(c); }); rebuildGlows(); rebuildLaundry(); cityRefresh(); rebuildWaterFx(); updateEco(); say('Undone'); scheduleSave();
}

/* ---- photo mode ---- */
let photo = false;
function setPhoto(on) { photo = on; document.body.classList.toggle('photo', on); postU.tilt.value = on ? 1 : 0; controls.autoRotate = on; controls.autoRotateSpeed = .35; closeCard(); }
document.getElementById('photoExit').onclick = () => setPhoto(false);

/* ---- quality governor ---- */
let quality = 'auto', qPaint = 1, fpsAcc = 0, fpsN = 0, fpsDone = false, lodFar = 75, lodMid = 26;
try { const v = parseFloat(localStorage.getItem('tilt-nightb')); if (v) setTimeout(() => postU.nightB.value = v, 0); } catch (e) { }
let lookStyle = 'illus'; try { lookStyle = localStorage.getItem('tilt-look') || 'illus'; } catch (e) { }
function setLookStyle(st, init) {
  lookStyle = st; const on = st === 'illus'; postU.illus.value = on ? 1 : 0;
  renderer.shadowMap.type = on ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; sun.shadow.radius = on ? 1.5 : 1;
  if (!init) { scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); try { localStorage.setItem('tilt-look', st); } catch (e) { } }
  applyLook();
}
function setQuality(q) {
  quality = q; const low = q === 'low';
  if (typeof reflector !== 'undefined') reflector.visible = !low; postU.aoAmt.value = low ? 0 : .5;
  renderer.setPixelRatio(low ? 1 : DPR); sun.castShadow = !low || !SMALL; qPaint = low ? .8 : 1; lodFar = low ? 45 : 75; lodMid = low ? 16 : 26; resize();
}
function governor(dt) { if (fpsDone || quality !== 'auto') return; fpsAcc += dt; fpsN++; if (fpsAcc > 5) { fpsDone = true; const fps = fpsN / fpsAcc; if (fps < 28) { setQuality('low'); quality = 'auto'; toast(`Running at ${Math.round(fps)} fps, so switched to lighter graphics (Menu → Quality)`); } } }

/* ---- menu ---- */
document.getElementById('menu').onclick = () => {
  G.cardFor = {kind: 'menu'};
  const W = ['auto', 'clear', 'rain', 'fog', 'snow'];
  cardEl.innerHTML = `<div class="ch"><div><b>Town menu</b><small>Day ${G.day + 1} · ${hhmm(G.hour)}</small></div><button class="x">×</button></div>
    <div class="grid"><button class="act" data-m="undo">↶ Undo</button><button class="act" data-m="photo">Photo mode</button><button class="act" data-m="fest">Hold São João tonight</button><button class="act" data-m="paper">Town paper</button><button class="act" data-m="goals">Goals & stories</button><button class="act" data-m="scen">Scenarios</button><button class="act" data-m="album">Postcard album</button>${G.quayWalls ? '' : `<button class="act" data-m="quay">Quay walls ${euro(500)}</button>`}</div>${traits.size ? `<p><span>Town character</span>${[...traits].map(t => `${TRAITS[t][0]} (${TRAITS[t][1]})`).join('; ')}</p>` : ''}
    <p><span>Weather</span></p><div class="grid">${W.map(w => `<button class="act ${G.weather === w ? 'on' : ''}" data-w="${w}">${w === 'auto' ? 'By preset' : w[0].toUpperCase() + w.slice(1)}</button>`).join('')}</div>
    <p><span>Look</span></p><div class="grid"><button class="act ${lookStyle === 'illus' ? 'on' : ''}" data-look="illus">Illustrated</button><button class="act ${lookStyle === 'paint' ? 'on' : ''}" data-look="paint">Painterly</button></div>
    <p><span>Code</span></p><div class="grid"><input id="cheatIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter a code" style="flex:1;width:100%;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid rgba(243,230,204,.2);background:rgba(0,0,0,.25);color:var(--paper);font:500 14px 'Bricolage Grotesque',system-ui,sans-serif"></div>
    <p><span>Night brightness</span></p><div class="grid"><input id="nightB" type="range" min="0.6" max="1.8" step="0.05" value="${postU.nightB.value}" style="flex:1;width:100%;accent-color:#f0a35c;height:32px"></div>
    <p><span>Quality</span></p><div class="grid">${['auto', 'high', 'low'].map(q => `<button class="act ${quality === q ? 'on' : ''}" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div>
    <p><span>Town</span></p><div class="grid"><button class="act" data-m="save">Copy town code</button><button class="act" data-m="load">Load town code</button><button class="act" data-m="new">New town</button><button class="act" data-m="clear">Clear land</button><button class="act" data-m="tut">How to play</button></div>
    <div id="codeBox" style="display:none"><textarea id="codeTa" rows="4" style="width:100%;font-size:11px;background:rgba(0,0,0,.3);color:var(--paper);border:1px solid rgba(243,230,204,.2);border-radius:8px"></textarea><button class="act wide" id="codeGo">Load this town</button></div>`;
  cardEl.style.display = 'block'; cardEl.querySelector('.x').onclick = closeCard;
  cardEl.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { G.weather = b.dataset.w; scheduleSave(); document.getElementById('menu').click(); });
  cardEl.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { setQuality(b.dataset.q); document.getElementById('menu').click(); });
  { const ci = cardEl.querySelector('#cheatIn'); if (ci) ci.oninput = () => { if (tryCheat(ci.value)) { ci.value = ''; ci.blur(); } }; }
  { const nb = cardEl.querySelector('#nightB'); if (nb) nb.oninput = () => { postU.nightB.value = +nb.value; try { localStorage.setItem('tilt-nightb', nb.value); } catch (e) { } }; }
  cardEl.querySelectorAll('[data-look]').forEach(b => b.onclick = () => { setLookStyle(b.dataset.look); document.getElementById('menu').click(); });
  cardEl.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
    const m = b.dataset.m;
    if (m === 'undo') undo();
    if (m === 'photo') setPhoto(true);
    if (m === 'fest') { G.festNight = G.hour < 19.5 ? G.day : G.day + 1; toast(`São João is on ${G.festNight === G.day ? 'tonight' : 'tomorrow night'}: lanterns go up at 19:30`); closeCard(); scheduleSave(); }
    if (m === 'paper') paperCard(); if (m === 'goals') goalsCard(); if (m === 'scen') scenarioCard(); if (m === 'album') albumCard(); if (m === 'quay') buyQuay();
    if (m === 'new') { scenarioCard(); }
    if (m === 'clear') document.getElementById('clear').click();
    if (m === 'tut') { closeCard(); tutorial(0); }
    if (m === 'save') { const code = await townCode(); try { await navigator.clipboard.writeText(code); toast(`Town code copied (${Math.round(code.length / 1024)} KB). Paste it into Load town code anywhere`); } catch (e) { const bx = document.getElementById('codeBox'); bx.style.display = 'block'; const ta = document.getElementById('codeTa'); ta.value = code; ta.select(); toast('Copy the code from the box'); } }
    if (m === 'load') { document.getElementById('codeBox').style.display = 'block'; document.getElementById('codeTa').value = ''; document.getElementById('codeTa').focus(); }
  });
  document.getElementById('codeGo').onclick = async () => { try { const D = await fromCode(document.getElementById('codeTa').value); loadTown(D); G.autosave(); toast('Town loaded'); } catch (e) { toast('That code could not be read'); } };
};

/* ---- tutorial ---- */
const TUT = [
  ['Welcome to Tilt Town', 'Build a crooked riverside neighbourhood and watch its people live in it. Drag to orbit, pinch or scroll to zoom.'],
  ['Look around', 'With the Look tool, tap any person to see who they are, what they are doing and their plan for today. Tap a house to meet its residents. Follow someone with the Follow button.'],
  ['Build with money', 'Tap Build at the bottom, pick House, Tree, Lamp and more, then tap plots. Tap Done when finished. To open a café or shop, tap any house and pick one in its card. Each piece costs money from the treasury (top left); taxes come in at midnight. Shortcut: press and hold a plot for a quick build wheel.'],
  ['Keep people happy', 'Mood rises with food shops nearby, plazas and money. Happy towns attract newcomers and unlock landmarks: a church, a tram and a funicular. Check Requests for residents\' wishes.'],
  ['Time and more', 'The clock button opens time controls: pause, speed and jump to dawn, noon, dusk or night. More has the map, pins, looks, photo mode and settings. News at the top collects goals, requests and the town paper.'],
];
function tutorial(k) {
  const el = document.getElementById('tut');
  if (k >= TUT.length) { el.style.display = 'none'; try { localStorage.setItem('tilt-tut', '1'); } catch (e) { } return; }
  el.innerHTML = `<b>${TUT[k][0]}</b><p>${TUT[k][1]}</p><div><span>${k + 1} / ${TUT.length}</span><button class="act" id="tSkip">Skip</button><button class="act on" id="tNext">${k === TUT.length - 1 ? 'Start building' : 'Next'}</button></div>`;
  el.style.display = 'block'; document.getElementById('tNext').onclick = () => tutorial(k + 1); document.getElementById('tSkip').onclick = () => tutorial(99);
}

export {AC, BUDGET, FEST_STEP, INTERIOR, LM_COST, SAVE_KEY, UNLOCK, bell, buildChurch, bunting, cats, checkRequests, checkUnlocks, effWeather, festActive, firework, fromCode, fwA, governor, initSound, interiorMat, landmarkDecor, live, loadTown, lodFar, lodMid, lookStyle, makeRequest, mistU, paperNote, partyTime, photo, placeCats, planFuni, planTram, qPaint, quality, rebuildWaterFx, reqEl, scheduleSave, serialize, setLookStyle, setPhoto, shutterSound, snowAmt, syncRefl, tone, townCode, tutorial, undo, undoStack, updateCats, updateFestival, updateReqChip, updateSound, updateTransit, updateWeather, wetAmt, writePaper};
