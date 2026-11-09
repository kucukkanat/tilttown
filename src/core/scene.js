import './util.js'; // load order: runs after the previous module
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {G} from '../state.js';
import {LV, N, S, azTex, box, brickTex, cobbleTex, plasterTex, stoneTex, tileTex} from './util.js';

/* ---------- renderer / scene ---------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
const SMALL = Math.min(innerWidth, innerHeight) < 700;
const DPR = Math.min(devicePixelRatio || 1, SMALL ? 1.25 : 1.5);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 95, 230);
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 900);
camera.position.set(27, 15, 33);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2.2, 0); controls.enableDamping = true; controls.dampingFactor = .08;
controls.maxPolarAngle = 1.38; controls.minDistance = 10; controls.maxDistance = 85;

const grad = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const bodyMat = new THREE.MeshToonMaterial({vertexColors: true, map: plasterTex, gradientMap: grad});
const roofMat = new THREE.MeshToonMaterial({vertexColors: true, map: tileTex, gradientMap: grad});
const stoneMat = new THREE.MeshToonMaterial({vertexColors: true, map: stoneTex, gradientMap: grad});
const cobbleMat = new THREE.MeshToonMaterial({vertexColors: true, map: cobbleTex, gradientMap: grad});
const brickMat = new THREE.MeshToonMaterial({vertexColors: true, map: brickTex, gradientMap: grad});
const azMat = new THREE.MeshToonMaterial({vertexColors: true, map: azTex, gradientMap: grad});
const plainMat = new THREE.MeshToonMaterial({vertexColors: true, gradientMap: grad});
const litMat = new THREE.MeshBasicMaterial({color: 0xffc66b});
const litU = {uNight: {value: 0}, uTime: {value: 0}, uWind: {value: .5}};
litMat.color.set(0xffffff);
const WOBGL = `vec3 wobW(vec3 p){return vec3(sin(p.y*1.9+p.z*.7)*.022+sin(p.z*2.3+p.x*.4)*.012,-abs(sin(p.x*1.3+p.z*1.1))*.022*smoothstep(.8,3.5,p.y),sin(p.y*1.7+p.x*.9)*.022+sin(p.x*2.1+p.y*.3)*.012);}\n`;
const litPatch = U => sh => {
  Object.assign(sh.uniforms, litU, U);
  sh.vertexShader = WOBGL + 'attribute float lthr;\nvarying float vThr;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvThr=lthr;transformed+=(vec4(wobW((modelMatrix*vec4(transformed,1.)).xyz),0.)*modelMatrix).xyz;');
  sh.fragmentShader = 'uniform float uNight,uTime,uOcc,uOpen;\nvarying float vThr;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat on=vThr<0.?uOpen:smoothstep(vThr,vThr+.06,uNight)*step(fract(vThr*7.31),uOcc+.02);float fl=.88+.12*sin(uTime*(2.+vThr*9.)+vThr*90.)*sin(uTime*1.3+vThr*40.);\ndiffuseColor.rgb=mix(vec3(.012,.016,.024),vec3(1.,.6,.22)*fl,on);');
};
litMat.onBeforeCompile = litPatch({uOcc: {value: 1}, uOpen: {value: 1}}); litMat.customProgramCacheKey = () => 'lit';
function houseLit(c) { if (!c.litMatH) { c.litU = {uOcc: {value: c.occ ?? .6}, uOpen: {value: 0}}; c.litMatH = new THREE.MeshBasicMaterial({color: 0xffffff}); c.litMatH.onBeforeCompile = litPatch(c.litU); c.litMatH.customProgramCacheKey = () => 'lit'; } return c.litMatH; }
const swayMat = new THREE.MeshToonMaterial({vertexColors: true, gradientMap: grad});
swayMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, litU);
  sh.vertexShader = 'attribute float sway;\nuniform float uTime,uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph=position.x*1.3+position.z*.9;transformed.x+=(sin(uTime*2.7+ph)+.6)*sway*uWind;transformed.z+=cos(uTime*2.1+ph*1.3)*sway*uWind*.6;');
};
const darkMat = new THREE.MeshToonMaterial({color: 0x26303a, gradientMap: grad});
const waterMat = new THREE.MeshToonMaterial({color: 0x2c5a63, gradientMap: grad, emissive: 0x000000});
const waterU = {uTime: {value: 0}, uDist: {value: (() => { const t = new THREE.DataTexture(new Uint8Array(64 * 64).fill(255), 64, 64, THREE.RedFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; })()}, uBoats: {value: Array.from({length: 6}, () => new THREE.Vector4())}, uFoamC: {value: new THREE.Color('#e9efe6')}};
waterMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, waterU);
  sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW=(modelMatrix*vec4(position,1.)).xyz;');
  sh.fragmentShader = 'uniform float uTime;uniform sampler2D uDist;uniform vec4 uBoats[6];uniform vec3 uFoamC;varying vec3 vW;\nfloat wH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float wN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wH(i),wH(i+vec2(1,0)),f.x),mix(wH(i+vec2(0,1)),wH(i+1.),f.x),f.y);}\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float rr=sin(vW.x*2.6+uTime*1.4+sin(vW.z*1.7+uTime*.8)*1.6)*sin(vW.z*3.1-uTime*.6+vW.x*.4);
diffuseColor.rgb*=1.+smoothstep(.6,.95,rr)*.45-smoothstep(.6,.95,-rr)*.12;
float dl=texture2D(uDist,vW.xz/${(N * S).toFixed(1)}+.5).r;
diffuseColor.rgb*=mix(1.14,.6,smoothstep(.05,.85,dl));
float fn=wN(vW.xz*4.5+vec2(uTime*.35,-uTime*.25));
float foam=smoothstep(.17,.02,dl-fn*.09)*(.55+.45*sin(uTime*1.7+dl*50.+fn*4.));
for(int k=0;k<6;k++){vec4 b=uBoats[k];if(b.w>.5){float r=length(vW.xz-b.xz);float ph=fract(r*1.7-uTime*.45);foam+=(1.-smoothstep(.0,.08,abs(ph-.5)))*smoothstep(1.8,.5,r)*smoothstep(.3,.5,r)*.55;}}
diffuseColor.rgb=mix(diffuseColor.rgb,uFoamC,clamp(foam,0.,1.)*.62);`);
};

const hemi = new THREE.HemisphereLight(0xffffff, 0x443322, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048);
Object.assign(sun.shadow.camera, {left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120});
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;

/* ---------- sky ---------- */
const NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}`;
const skyU = {night: {value: 0}, moonDir: {value: new THREE.Vector3(-.55, .42, -.72).normalize()}, top: {value: new THREE.Color()}, hor: {value: new THREE.Color()}, cloud: {value: new THREE.Color()}, sunCol: {value: new THREE.Color()}, sunDir: {value: new THREE.Vector3()}, time: {value: 0}, wind: {value: 1}, cloudAmt: {value: .6}, swirl: {value: 1}};
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: NOISE + `
  uniform vec3 top,hor,cloud,sunCol,sunDir,moonDir;uniform float time,wind,cloudAmt,swirl,night;varying vec3 vDir;
  void main(){vec3 d=normalize(vDir);float h=d.y;
    vec3 col=mix(hor,top,smoothstep(-.02,.6,abs(h)));
    float ah=abs(h);
    vec2 p=d.xz/(ah+.18)*.9; p.x*=.45; p+=vec2(time*wind*.012,0.);
    vec2 w=vec2(fbm(p*1.3+time*.004),fbm(p*1.3+4.1))*swirl*1.6;
    float f=fbm(p+w);
    float streak=fbm(vec2(dot(d.xz,vec2(.7,.7))*40.,h*140.));
    float m=smoothstep(.62-cloudAmt*.3,.78,f)*smoothstep(-.02,.1,ah);
    float sg=pow(max(dot(d,normalize(sunDir)),0.),6.);
    vec3 cc=cloud*(.75+.45*streak)+sunCol*sg*.45;
    cc=mix(cc*.72,cc,smoothstep(.55,.8,f+h*.4));
    col=mix(col,cc,m);
    col+=sunCol*pow(max(dot(d,normalize(sunDir)),0.),40.)*.35;
    col*=.93+.14*streak;
    col=mix(col,mix(hor,top,.35)*.8,smoothstep(0.,-.5,h)*.6);
    if(night>.01){vec2 sp=vec2(atan(d.z,d.x)*95.,asin(clamp(h,-1.,1.))*95.);vec2 ce=floor(sp);float hs=hash(ce);
      vec2 f=fract(sp)-.5-(vec2(hash(ce+3.1),hash(ce+7.7))-.5)*.6;float st=step(.982,hs)*smoothstep(.14+.08*hash(ce+1.3),.0,length(f))*(.55+.45*sin(time*(1.5+hs*3.)+hs*90.));
      st*=smoothstep(.04,.3,h)*(1.-m*.95);col+=vec3(1.,.95,.86)*st*night*1.4;
      float md=dot(d,moonDir);float disc=smoothstep(.99945,.99965,md);
      col=mix(col,vec3(1.,.95,.82)*(1.15-.25*noise(d.xz*700.)),disc*night*(1.-m*.75));
      col+=vec3(.55,.62,.85)*(pow(max(md,0.),260.)*.45+pow(max(md,0.),30.)*.08)*night*(1.-m*.5);}
    gl_FragColor=vec4(col,1.);}`
}));
scene.add(sky);

/* ---------- world data ---------- */
const terrainG = new THREE.Group(), objG = new THREE.Group(); scene.add(terrainG, objG);
G.cells = [];
const cellAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? null : G.cells[i * N + j];
const wx = i => (i - (N - 1) / 2) * S;
const topY = c => c.water ? -0.3 : c.lvl * LV;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // +x, -x, +z, -z
const water = new THREE.Mesh(new THREE.PlaneGeometry(N * S, N * S), waterMat);
water.rotation.x = -Math.PI / 2; water.position.y = -0.32; water.receiveShadow = true; scene.add(water);
const base = new THREE.Mesh(box(N * S + .6, 2.2, N * S + .6, '#5a4c44'), stoneMat);
base.position.y = -LV - 1.1; base.receiveShadow = true; scene.add(base);

const WALLS = ['#d8a55c', '#5f9e9a', '#d98a6c', '#e6d2a6', '#6f8fb3', '#c9a33f', '#c97b84', '#8aa46a', '#b8c4c0', '#e0b58a', '#4f7f8f'];
const ROOFS = ['#b5452f', '#a33d2c', '#c0563a', '#8e3a2a', '#9b4a32'];
const SHUT = ['#4f7a5a', '#3f6f7a', '#7a4a3a', '#5a6a3a', '#c9b48a', '#2f4f5f'];

function mkMesh(geos, mat, cast = true) {
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = cast; m.receiveShadow = true; return m;
}

export {DIRS, DPR, NOISE, ROOFS, SHUT, SMALL, WALLS, WOBGL, azMat, base, bodyMat, brickMat, camera, canvas, cellAt, cobbleMat, controls, darkMat, grad, hemi, houseLit, litMat, litU, mkMesh, objG, plainMat, renderer, roofMat, scene, skyU, stoneMat, sun, swayMat, terrainG, topY, water, waterMat, waterU, wx};
