import './clarity.js'; // load order: runs after the previous module
import * as THREE from 'three';
import {G} from '../state.js';
import {lerp} from '../core/util.js';
import {DPR, NOISE, SMALL, camera, hemi, litU, renderer, scene, skyU, sun, waterMat} from '../core/scene.js';
import {glowU} from '../world/houses.js';
import {smokeCol} from '../world/streets.js';
import {addBlueHour} from '../game/meta.js';

/* ---------- presets (palettes per time-of-day) ---------- */
const P = (top, hor, cloud, sun, si, hs, hg, hi, wat) => ({top, hor, cloud, sun, si, hs, hg, hi, wat});
const PRESETS = [
  {name: 'Porto dusk', dot: '#f2a07a', wind: .6, cloudAmt: .55, swirl: .7, leaves: .4, tint: '#7a4a6a',
    k: [P('#7fa6cf', '#f0d9b5', '#fff0dc', '#fff0d0', 2.4, '#bcd0e8', '#7a6050', 1.1, '#4f8a96'),
        P('#6a5a8e', '#f3a17c', '#f6c09a', '#ff9a5c', 2.0, '#b48ab0', '#5a3a3a', .9, '#4a5a7a'),
        P('#161c38', '#3e3456', '#4c4268', '#7b8ac0', .35, '#3a4070', '#1a1420', .55, '#1b2a40')]},
  {name: 'Night canal', dot: '#3f8f8f', wind: .5, cloudAmt: .7, swirl: 1.4, leaves: .2, tint: '#1f5a66',
    k: [P('#4a8aa0', '#b0d0c0', '#e6efe0', '#fff2d8', 2.2, '#a8d0d0', '#506050', 1.1, '#3f8a8a'),
        P('#1f4f6a', '#5a9a90', '#86b8a8', '#ffb070', 1.4, '#6aa0a8', '#2a3a3a', .9, '#2a6670'),
        P('#0a1a2a', '#1a4452', '#2c6270', '#80b0c0', .4, '#2a5060', '#0a1418', .6, '#163e48')]},
  {name: 'Storm hill', dot: '#8a8a70', wind: 2.2, cloudAmt: .8, swirl: .5, leaves: 1, tint: '#4a4a3a',
    k: [P('#6a747c', '#c8b896', '#cfc8b8', '#fff0d0', 1.8, '#a8b0b0', '#5a5040', 1.1, '#4a6066'),
        P('#3a404c', '#cf9358', '#8a8070', '#ffb060', 1.5, '#7a7a80', '#40342a', .9, '#3a4850'),
        P('#12151c', '#3a3430', '#33302e', '#8090a0', .3, '#303844', '#14120f', .55, '#1a2228')]},
  {name: 'Golden wind', dot: '#e8a050', wind: 1.4, cloudAmt: .85, swirl: 1.1, leaves: .7, tint: '#1f4f5f',
    k: [P('#2f7a86', '#e8c890', '#f8dcae', '#fff0c8', 2.4, '#9ad0d0', '#6a5040', 1.1, '#3f8a8a'),
        P('#1d5c66', '#e89a4a', '#f0b060', '#ffa040', 2.2, '#5a9a9a', '#5a3020', .85, '#2a6670'),
        P('#0d2630', '#2a3a40', '#3a4a50', '#90a0b0', .35, '#2a4a50', '#100c0c', .55, '#122e36')]},
];
addBlueHour();
const SPLIT = {'Porto dusk': ['#3a6a7a', '#ffcfa0'], 'Night canal': ['#2a6070', '#ffd890'], 'Storm hill': ['#4a5868', '#e8d0a0'], 'Golden wind': ['#2a5a6a', '#ffc070'], 'Blue hour': ['#3a3a8a', '#ffb4c4']};
G.preset = PRESETS[0]; G.tod = .5;
const cA = new THREE.Color(), cB = new THREE.Color();
function mix(key, a, b, t, out) { return out.copy(cA.set(a[key])).lerp(cB.set(b[key]), t); }
const post = {tint: new THREE.Color()};
const _moonP = new THREE.Vector3();
function applyLook() {
  const [d, du, n] = G.preset.k; const [a, b, t] = G.tod < .5 ? [d, du, G.tod * 2] : [du, n, (G.tod - .5) * 2];
  mix('top', a, b, t, skyU.top.value); mix('hor', a, b, t, skyU.hor.value); mix('cloud', a, b, t, skyU.cloud.value); mix('sun', a, b, t, skyU.sunCol.value);
  scene.fog.color.copy(skyU.hor.value).lerp(skyU.top.value, .25);
  sun.color.copy(skyU.sunCol.value); sun.intensity = lerp(a.si, b.si, t);
  mix('hs', a, b, t, hemi.color); mix('hg', a, b, t, hemi.groundColor); hemi.intensity = lerp(a.hi, b.hi, t);
  mix('wat', a, b, t, waterMat.color);
  const elev = G.tod < .75 ? lerp(1.05, .16, Math.min(1, G.tod / .55)) : .5, az = G.tod < .75 ? .9 + G.tod * .9 : -.6;
  const ill = postU.illus.value > .5, el2 = ill ? elev * lerp(.92, .72, Math.min(1, G.tod / .45)) + .05 : elev;
  if (ill) { sun.intensity *= 1.3; hemi.intensity *= 1.18; hemi.color.lerp(cB.set('#7a80c0'), .22); }
  sun.position.set(Math.cos(az) * Math.cos(el2) * 50, Math.sin(el2) * 50, Math.sin(az) * Math.cos(el2) * 50);
  skyU.sunDir.value.copy(sun.position).normalize();
  { const nk = THREE.MathUtils.smoothstep(G.tod, .45, .8);
    if (nk > 0) { sun.position.lerp(_moonP.copy(skyU.moonDir.value).multiplyScalar(50), nk); sun.color.lerp(cB.set('#9fb4ec'), nk); sun.intensity = lerp(sun.intensity, Math.max(sun.intensity, 1.35), nk);
      hemi.intensity *= 1 + nk * .9; hemi.color.lerp(cB.set('#6a76b8'), nk * .5); hemi.groundColor.lerp(cB.set('#2a2440'), nk * .4); } }
  skyU.wind.value = G.preset.wind; skyU.cloudAmt.value = G.preset.cloudAmt; skyU.swirl.value = G.preset.swirl;
  const night = THREE.MathUtils.smoothstep(G.tod, .3, .8);
  litU.uNight.value = night; litU.uWind.value = .12 + G.preset.wind * .35;
  smokeCol.copy(skyU.cloud.value).lerp(cB.set('#8f8a86'), .55).lerp(skyU.top.value, night * .3);
  waterMat.emissive.set(0x0).lerp(cB.set(0x2a2010), night * .4);
  postU.tint.value.set(G.preset.tint); postU.night.value = night; postU.hazeC.value.copy(scene.fog.color);
  const sp = SPLIT[G.preset.name] || ['#4a6a7a', '#ffd8b0']; postU.shT.value.set(sp[0]); postU.hiT.value.set(sp[1]);
  postU.golden.value = THREE.MathUtils.smoothstep(G.tod, .1, .34) * (1 - THREE.MathUtils.smoothstep(G.tod, .5, .72)) * (G.preset.name === 'Storm hill' ? .5 : 1);
}

/* ---------- post-process: kuwahara paint + ink + paper ---------- */
let rt, maskRT, selRT;
const maskMat = new THREE.MeshBasicMaterial({color: 0xffffff});
const postU = {selOn: {value: 0}, selPulse: {value: 1}, tSel: {value: null}, selCol: {value: new THREE.Color('#ffc86a')}, tilt: {value: 0}, tColor: {value: null}, tDepth: {value: null}, tMask: {value: null}, res: {value: new THREE.Vector2()}, cNear: {value: camera.near}, cFar: {value: camera.far}, time: {value: 0}, paint: {value: 1.6}, ink: {value: new THREE.Color('#24160f')}, tint: {value: new THREE.Color()}, night: {value: 0},
  shT: {value: new THREE.Color('#3a6a7a')}, hiT: {value: new THREE.Color('#ffcfa0')}, sunUV: {value: new THREE.Vector2(.5, .9)}, sunCol: {value: new THREE.Color()}, golden: {value: 0}, rays: {value: 0}, dof: {value: 0}, focusD: {value: 30}, aoAmt: {value: .5}, fx: {value: 1}, tMap: {value: null}, mapOn: {value: 0}, tHov: {value: null}, hovOn: {value: 0}, hovCol: {value: new THREE.Color('#fff4dc')}, focUV: {value: new THREE.Vector2(.5, .5)}, focR: {value: 0}, illus: {value: 0}, hazeC: {value: new THREE.Color()}, nightB: {value: 1}};
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: postU, depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader: NOISE + `
  uniform sampler2D tColor,tDepth,tMask,tSel;uniform vec3 selCol;uniform float selOn,selPulse;uniform vec2 res;uniform float tilt,cNear,cFar,time,paint,night;uniform vec3 ink,tint,shT,hiT,sunCol;uniform vec2 sunUV;uniform float golden,rays,dof,focusD,aoAmt,fx,mapOn,hovOn,focR,illus,nightB;uniform vec3 hazeC;uniform sampler2D tMap,tHov;uniform vec3 hovCol;uniform vec2 focUV;varying vec2 vUv;
  float lin(float d){float z=d*2.-1.;return 2.*cNear*cFar/(cFar+cNear-z*(cFar-cNear));}
  float LD(vec2 p){return lin(texture2D(tDepth,p).r);}
  float luma(vec3 c){return dot(c,vec3(.3,.59,.11));}
  void main(){
    vec2 px=1./res; vec2 uv=vUv; vec2 q=uv*res;
    float dr=texture2D(tDepth,uv).r; bool sky=dr>.9999; float d=sky?cFar:lin(dr);
    float blur=dof*smoothstep(.14,.6,abs(min(d,focusD*4.)-focusD)/focusD);
    float keep=focR>.005?1.-smoothstep(focR*.7,focR*1.35,length((uv-focUV)*vec2(res.x/res.y,1.))):0.;blur*=1.-keep;
    vec2 warp=(vec2(noise(q/20.),noise(q/20.+31.))-.5)*px*4.;
    vec2 su=uv+warp; vec2 st=px*paint*(1.+tilt*4.*smoothstep(.1,.45,abs(vUv.y-.5))+blur*2.4)*(1.-keep*.55);
    vec3 m0=vec3(0),m1=vec3(0),m2=vec3(0),m3=vec3(0),s0=vec3(0),s1=vec3(0),s2=vec3(0),s3=vec3(0),c;
    for(int j=0;j<=2;j++)for(int i=0;i<=2;i++){
      c=texture2D(tColor,su+vec2(-i,-j)*st).rgb;m0+=c;s0+=c*c;
      c=texture2D(tColor,su+vec2(i,-j)*st).rgb;m1+=c;s1+=c*c;
      c=texture2D(tColor,su+vec2(-i,j)*st).rgb;m2+=c;s2+=c*c;
      c=texture2D(tColor,su+vec2(i,j)*st).rgb;m3+=c;s3+=c*c;}
    m0/=9.;m1/=9.;m2/=9.;m3/=9.;
    float v0=dot(s0/9.-m0*m0,vec3(1)),v1=dot(s1/9.-m1*m1,vec3(1)),v2=dot(s2/9.-m2*m2,vec3(1)),v3=dot(s3/9.-m3*m3,vec3(1));
    vec3 col=m0;float mv=v0;if(v1<mv){mv=v1;col=m1;}if(v2<mv){mv=v2;col=m2;}if(v3<mv){col=m3;}
    vec3 avg=(m0+m1+m2+m3)*.25;
    // brush strokes that follow the shapes: smear along the edge tangent
    vec2 g2=px*2.;
    vec2 gr=vec2(luma(texture2D(tColor,uv+vec2(g2.x,0)).rgb)-luma(texture2D(tColor,uv-vec2(g2.x,0)).rgb),luma(texture2D(tColor,uv+vec2(0,g2.y)).rgb)-luma(texture2D(tColor,uv-vec2(0,g2.y)).rgb));
    float gm=length(gr);
    vec2 td=gm>1e-4?vec2(-gr.y,gr.x)/gm:vec2(.8,.6);
    float na=(noise(q/45.)-.5)*.9;td=mat2(cos(na),-sin(na),sin(na),cos(na))*td;
    vec3 sm=vec3(0);for(int k=-3;k<=3;k++)sm+=texture2D(tColor,su+td*float(k)*px*paint*1.7).rgb;sm/=7.;
    float sk=(smoothstep(.004,.06,gm)*.4+.12)*fx*(1.-blur*.6)*(1.-keep*.8);
    col=mix(col,sm,sk);
    float bristle=noise(vec2(dot(q,td)*.09,dot(q,vec2(-td.y,td.x))*.75));
    col*=1.+(bristle-.5)*.1*fx*(1.-illus*.6);
    if(illus>.5){vec3 raw=texture2D(tColor,uv+warp*.25).rgb;col=mix(raw,col,.12);}
    col=mix(col,texture2D(tColor,uv).rgb,max(texture2D(tMask,uv).r*(1.-tilt*smoothstep(.15,.4,abs(vUv.y-.5)))*(1.-blur),keep*.5));
    // ambient occlusion from depth
    if(!sky&&aoAmt>0.){float ao=0.;float rad=clamp(300./d,3.,24.)*res.y/900.;float rot=hash(floor(q))*6.28;
      for(int k=0;k<8;k++){float a=float(k)*.785+rot;vec2 o=vec2(cos(a),sin(a))*px*rad*(k<4?.5:1.);float df=d-LD(uv+o);ao+=smoothstep(.03,.25,df)*(1.-smoothstep(.5,1.6,df));}
      col*=1.-ao/8.*aoAmt*(1.-smoothstep(60.,120.,d));}
    // rim light on silhouettes facing the sky
    if(!sky){float a3=texture2D(tDepth,uv+vec2(0,px.y*3.)).r,a6=texture2D(tDepth,uv+vec2(0,px.y*6.)).r;
      float r3=a3>.9999?1.:clamp((lin(a3)-d)/d*4.,0.,1.),r6=a6>.9999?1.:clamp((lin(a6)-d)/d*4.,0.,1.);
      col+=mix(sunCol,vec3(.5,.62,.95),night*illus)*max(r3,r6*.6)*(.08+.3*golden+.3*night*illus)*(1.-night*.85*(1.-illus))*(1.-smoothstep(50.,110.,d));}
    // ink: two scales, heavier on silhouettes, varying pressure
    vec2 ui=uv+(vec2(noise(q/11.),noise(q/11.+17.))-.5)*px*1.8*illus;float dI=sky?cFar:LD(ui);
    float l1=LD(ui-vec2(px.x,0)),r1=LD(ui+vec2(px.x,0)),u1=LD(ui+vec2(0,px.y)),b1=LD(ui-vec2(0,px.y));
    float e=(abs(l1+r1-2.*dI)+abs(u1+b1-2.*dI))/dI;
    vec2 p2=px*mix(2.2,1.5,illus);
    float jump=max(max(abs(LD(ui-vec2(p2.x,0))-dI),abs(LD(ui+vec2(p2.x,0))-dI)),max(abs(LD(ui+vec2(0,p2.y))-dI),abs(LD(ui-vec2(0,p2.y))-dI)))/dI;
    float wob=mix(.72+.56*noise(q/6.),1.,illus*.8);float pres=mix(.55+.9*noise(q/80.+7.),1.05,illus*.85);
    float inkA=smoothstep(.012,.045,e*wob)*(.55+.45*pres);
    float sil=smoothstep(.1,.35,jump)*smoothstep(.3,.7,pres*wob);
    inkA=max(inkA,sil*fx);
    if(illus>.5){vec2 g1=px*1.2;float fl=abs(luma(texture2D(tColor,ui+vec2(g1.x,0)).rgb)-luma(texture2D(tColor,ui-vec2(g1.x,0)).rgb))+abs(luma(texture2D(tColor,ui+vec2(0,g1.y)).rgb)-luma(texture2D(tColor,ui-vec2(0,g1.y)).rgb));
      float fine=smoothstep(.06,.16,fl/(luma(col)+.25))*(1.-smoothstep(22.,60.,d));inkA=max(inkA,fine*.62*(.75+.5*noise(q/5.)));}
    inkA*=(1.-smoothstep(70.,160.,d))*(sky?0.:1.)*(1.-blur*.7);
    // pigment pooling + colour bleed at edges
    float bleed=smoothstep(.0,.5,max(e*6.,jump*2.5))*(sky?0.:1.);
    col=mix(col,avg*1.03,bleed*.3*fx);col*=1.-bleed*.07*fx;
    col*=1.-smoothstep(.05,.22,gm)*.06*fx;
    vec3 inkC=mix(ink*(.85+.3*pres),mix(vec3(.12,.12,.2),vec3(.42,.48,.68),sil),night*.85);
    col=mix(col,inkC,inkA*mix(.82,mix(.45,.62,sil),night));
    // golden-hour light shafts
    if(rays>.01){vec2 dv=sunUV-uv;vec2 stp=dv/18.;vec2 pp=uv+stp*hash(q);float rs=0.;
      for(int k=0;k<18;k++){rs+=step(.9999,texture2D(tDepth,pp).r);pp+=stp;}
      rs/=18.;float fall=exp(-length(dv*vec2(res.x/res.y,1.))*1.7);
      col+=sunCol*rs*fall*rays*(sky?.22:.38);}
    // grading: saturation, split tone, tint
    float lum=luma(col);
    if(illus>.5){
      col*=1.+.22*(1.-night);float f=lum*1.22*5.;float qv=(floor(f)+smoothstep(.3,.7,fract(f)))/5.;col*=mix(1.,qv/max(luma(col),.002),.45);lum=luma(col);
      vec3 cool=normalize(mix(shT,vec3(.32,.34,.68),.55))*1.05;float shd=1.-smoothstep(.06,.34,lum);
      col=mix(col,col*cool*1.9+cool*(.1+.05*night),shd*mix(.45,.72,night));
      float warm=smoothstep(.5,.85,lum)*smoothstep(.0,.15,col.r-col.b);
      col=mix(vec3(luma(col)),col,mix(1.12,1.38,warm));col*=1.+warm*.12;col=mix(col,hiT*1.05,smoothstep(.8,1.15,luma(col))*.65);lum=luma(col);}
    col=mix(vec3(lum),col,1.12);
    vec3 tone=mix(shT,hiT,smoothstep(.06,.65,lum));tone/=max(luma(tone),.01);
    col=mix(col,col*tone,.3*fx);
    col+=tint*(1.-smoothstep(0.,.45,lum))*.04;
    col=col*(1.+night*.3)+vec3(.01,.012,.018)*night;
    if(illus>.5&&!sky){
      float ak=smoothstep(focusD*.55,focusD*2.4,d);col=mix(col,hazeC*(1.+night*.5),ak*(.08+.04*night));
      col=col*(1.+night*.25)+vec3(.008,.01,.02)*night;
      vec3 cc=clamp(col,0.,1.);vec3 sc=cc*cc*(3.-2.*cc);col=mix(col,sc+(col-cc),mix(.22,.42,night));col+=vec3(.025,.02,.015)*(1.-night);
      float hl=luma(col);float hp=abs(fract((q.x+q.y+noise(q/28.)*7.)/4.6)-.5);
      float hatch=(1.-smoothstep(.05,.12,hp))*(1.-smoothstep(.06,.26,hl))*(1.-smoothstep(20.,55.,d));
      col=mix(col,ink*.8,hatch*.22);}
    if(mapOn>.01){vec4 mc=texture2D(tMap,uv);float ml=luma(col);vec3 bw=vec3(ml)*.55+vec3(.21,.19,.18);
      vec2 p3=px*2.;vec4 ma=texture2D(tMap,uv+vec2(p3.x,0)),mb=texture2D(tMap,uv-vec2(p3.x,0)),mcc=texture2D(tMap,uv+vec2(0,p3.y)),md=texture2D(tMap,uv-vec2(0,p3.y));
      float me=clamp(length(ma-mc)+length(mb-mc)+length(mcc-mc)+length(md-mc),0.,1.);
      vec3 mm=mix(bw,mc.rgb*(.6+.6*ml),mc.a*.85);mm=mix(mm,vec3(.98,.93,.82),me*.55);
      col=mix(col,mm,mapOn);}
    // canvas: weave, fibres, grain, streaks
    float weave=sin(q.x*1.75+sin(q.y*.11)*1.5)*sin(q.y*1.75+sin(q.x*.13)*1.5);
    float fib=noise(vec2(q.x*.06+q.y*.7,q.y*.025))*noise(q*.31);
    float g=noise(q*.8);
    float stv=noise(vec2((uv.x+uv.y)*res.x*.04,(uv.x-uv.y)*res.y*.5));
    col*=.92+.08*g; col*=.95+.1*stv; col*=1.+weave*.028*fx-fib*.05*fx;
    if(night>.02){vec3 bl=vec3(0);for(int k=0;k<12;k++){float a=float(k)*.5236;vec2 o=vec2(cos(a),sin(a))*px*(k<6?7.:16.);vec3 s=texture2D(tColor,uv+o).rgb;float w=max(0.,luma(s)-.62)*smoothstep(.0,.15,s.r-s.b);bl+=vec3(1.,.66,.34)*w*(k<6?1.:.6);}
      col+=bl/12.*night*1.6*(sky?.3:1.);
      if(sky)col*=1.-.22*night;}
    col*=mix(1.,nightB,night);
    col*=mix(.72,1.,smoothstep(.95,.3,length(vUv-.5)*1.25));
    if(hovOn>.02){float h0=texture2D(tHov,uv).r,hm=0.;for(int k=0;k<8;k++){float a=float(k)*.785;hm=max(hm,texture2D(tHov,uv+vec2(cos(a),sin(a))*px*2.2).r);}
      col=mix(col,hovCol*1.25,clamp(hm-h0,0.,1.)*hovOn*.9);col+=hovCol*h0*.06*hovOn;}
    if(selOn>.5){float s0=texture2D(tSel,uv).r,m=0.;
      for(int k=0;k<12;k++){float a=float(k)*.5236;vec2 o=vec2(cos(a),sin(a))*px*2.6;m=max(m,texture2D(tSel,uv+o).r);}
      float edge=clamp(m-s0,0.,1.);col=mix(col,selCol*1.6,edge*selPulse);col+=selCol*s0*.07;}
    col=pow(max(col,0.),vec3(1./2.2));
    gl_FragColor=vec4(col,1.);
  }`
})));
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 50 : 32; camera.updateProjectionMatrix();
  if (!resize.done && w < h) { camera.position.multiplyScalar(1.35); } resize.done = true;
  const pw = Math.floor(w * DPR), ph = Math.floor(h * DPR);
  rt?.dispose(); rt = new THREE.WebGLRenderTarget(pw, ph, {type: THREE.HalfFloatType});
  rt.depthTexture = new THREE.DepthTexture(pw, ph); rt.depthTexture.type = THREE.UnsignedIntType;
  selRT?.dispose(); selRT = new THREE.WebGLRenderTarget(pw, ph); postU.tSel.value = selRT.texture;
  maskRT?.dispose(); maskRT = new THREE.WebGLRenderTarget(SMALL ? pw >> 1 : pw, SMALL ? ph >> 1 : ph);
  postU.tColor.value = rt.texture; postU.tDepth.value = rt.depthTexture; postU.tMask.value = maskRT.texture; postU.res.value.set(pw, ph);
  glowU.uScale.value = ph / 2;
}
addEventListener('resize', resize);

export {P, PRESETS, applyLook, maskMat, maskRT, postCam, postScene, postU, resize, rt, selRT};
