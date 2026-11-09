import * as THREE from 'three';

const N = 14, S = 2, LV = 0.7, FH = 0.92, MAXF = 7;
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = (R, a) => a[Math.floor(R() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const _c = new THREE.Color();
function jit(hex, R, amt = .05) { const c = new THREE.Color(hex); const h = {}; c.getHSL(h); c.setHSL(h.h + (R() - .5) * amt * .4, THREE.MathUtils.clamp(h.s + (R() - .5) * amt * 2, 0, 1), THREE.MathUtils.clamp(h.l + (R() - .5) * amt * 2, 0, 1)); return c; }
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  _c.set(col); const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function setAttr(g, n, v) { g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; }
const tr = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
const mul = (a, b) => a.clone().multiply(b);
function box(w, h, d, col, m) { const g = paint(new THREE.BoxGeometry(w, h, d), col); if (m) g.applyMatrix4(m); return g; }
function cyl(r1, r2, h, col, m, seg = 6) { const g = paint(new THREE.CylinderGeometry(r1, r2, h, seg), col); if (m) g.applyMatrix4(m); return g; }

/* ---------- canvas textures ---------- */
function canvasTex(size, draw, rep = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const x = cv.getContext('2d'); draw(x, size);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const R0 = rng(42);
const plasterTex = canvasTex(256, (x, s) => {
  x.fillStyle = '#fff'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) { const r = 8 + R0() * 40; const g = x.createRadialGradient(0, 0, 0, 0, 0, r); const a = .05 + R0() * .1; g.addColorStop(0, `rgba(90,70,50,${a})`); g.addColorStop(1, 'rgba(90,70,50,0)'); x.save(); x.translate(R0() * s, R0() * s); x.scale(1, .6 + R0()); x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); }
  for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(60,45,35,${.08 + R0() * .12})`; x.lineWidth = 1 + R0() * 3; const px = R0() * s; x.beginPath(); x.moveTo(px, R0() * s * .3); x.lineTo(px + (R0() - .5) * 8, s * (.4 + R0() * .6)); x.stroke(); }
  x.strokeStyle = 'rgba(40,30,25,.25)'; x.lineWidth = 1; for (let i = 0; i < 6; i++) { let px = R0() * s, py = R0() * s; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (R0() - .5) * 18; py += R0() * 12; x.lineTo(px, py); } x.stroke(); }
});
const tileTex = canvasTex(256, (x, s) => {
  x.fillStyle = '#9a8a80'; x.fillRect(0, 0, s, s);
  const rows = 10, cols = 8, rh = s / rows, cw = s / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const ox = (r % 2) * cw / 2, l = 200 + R0() * 55; x.fillStyle = `rgb(${l},${l * .93},${l * .88})`;
    x.beginPath(); x.ellipse(c * cw + ox + cw / 2, r * rh + rh * .55, cw * .52, rh * .62, 0, 0, Math.PI); x.fill();
    x.strokeStyle = 'rgba(40,25,20,.35)'; x.lineWidth = 1.5; x.stroke();
  }
});
tileTex.rotation = Math.PI / 2;
const stoneTex = canvasTex(256, (x, s) => {
  x.fillStyle = '#6a625a'; x.fillRect(0, 0, s, s);
  let y = 0; while (y < s) { const h = 18 + R0() * 16; let xx = -R0() * 30; while (xx < s) { const w = 26 + R0() * 34, l = 170 + R0() * 70; x.fillStyle = `rgb(${l},${l * .96},${l * .9})`; x.fillRect(xx + 2, y + 2, w - 4, h - 4); xx += w; } y += h; }
});
const cobbleTex = canvasTex(256, (x, s) => {
  x.fillStyle = '#4e463f'; x.fillRect(0, 0, s, s);
  for (let r = 0; r < 14; r++) for (let c = 0; c < 12; c++) { const l = 150 + R0() * 80, cx = (c + (r % 2) * .5) * s / 12 + (R0() - .5) * 4, cy = r * s / 14 + 9 + (R0() - .5) * 3; x.fillStyle = `rgb(${l},${l * .95},${l * .88})`; x.beginPath(); x.ellipse(cx, cy, 9 + R0() * 2, 7 + R0() * 2, R0(), 0, 6.3); x.fill(); x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.ellipse(cx - 2, cy - 2, 4, 3, 0, 0, 6.3); x.fill(); }
});
const brickTex = canvasTex(128, (x, s) => {
  x.fillStyle = '#d8d0c8'; x.fillRect(0, 0, s, s);
  for (let r = 0; r < 12; r++) for (let c = -1; c < 7; c++) { const l = 190 + R0() * 65; x.fillStyle = `rgb(${l},${l * .78},${l * .66})`; x.fillRect(c * 22 + (r % 2) * 11 + 1, r * s / 12 + 1, 20, s / 12 - 2); }
});
const azTex = canvasTex(128, (x, s) => {
  const t = s / 4; x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const ox = i * t, oy = j * t; x.strokeStyle = '#2f5ea8'; x.fillStyle = '#2f5ea8'; x.lineWidth = 2;
    x.beginPath(); x.arc(ox + t / 2, oy + t / 2, t * .22, 0, 6.3); x.stroke();
    x.beginPath(); x.moveTo(ox + t / 2, oy + 3); x.lineTo(ox + t - 3, oy + t / 2); x.lineTo(ox + t / 2, oy + t - 3); x.lineTo(ox + 3, oy + t / 2); x.closePath(); x.stroke();
    for (const [a, b] of [[0, 0], [t, 0], [0, t], [t, t]]) { x.beginPath(); x.arc(ox + a, oy + b, t * .16, 0, 6.3); x.fill(); }
    x.beginPath(); x.arc(ox + t / 2, oy + t / 2, t * .07, 0, 6.3); x.fill();
    x.strokeStyle = 'rgba(80,80,90,.35)'; x.lineWidth = 1; x.strokeRect(ox, oy, t, t);
  }
}, 2);
function glowTex(inner) { return canvasTex(64, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, inner); g.addColorStop(.25, 'rgba(255,190,110,.55)'); g.addColorStop(1, 'rgba(255,160,80,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }); }
const leafTex = canvasTex(32, (x, s) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(s / 2, s / 2, s * .42, s * .2, .6, 0, Math.PI * 2); x.fill(); });

export {FH, LV, MAXF, N, R0, S, azTex, box, brickTex, canvasTex, cobbleTex, cyl, glowTex, jit, leafTex, lerp, mul, paint, pick, plasterTex, rng, setAttr, stoneTex, tileTex, tr};
