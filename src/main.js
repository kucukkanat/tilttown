import './game/progression.js'; // load order: runs after the previous module
import {G} from './state.js';
import {camera, cellAt, controls} from './core/scene.js';
import {laundryG, rebuildLaundry, rebuildObj} from './world/houses.js';
import {walkable} from './world/streets.js';
import {bubbleEl, runDay, updateEco} from './ui/cards.js';
import {lookStyle, planFuni, planTram, setLookStyle, setPhoto, tutorial, undo} from './game/extras.js';
import {album, startScenario, updateGoalChip} from './game/meta.js';
import {startIntro} from './world/visuals.js';
import {setMap} from './world/shops.js';
import {compactPresets, pinsEl, setHover} from './render/clarity.js';
import {PRESETS} from './render/post.js';
import {apply, frame, refresh} from './ui/input.js';
import {closeTray, trayMore} from './ui/dock.js';
import {applySeason, catsToRoofs, flushCoins, frameTown, needEls, plotValue, quest, questInit, questStart, seasonOf, synergy, tickRent, townLevel, updateLevelUI, updateNeeds, updateQuest} from './game/progression.js';

/* ---- per-frame ---- */
let g2Day = null;
function updateGame2(dt, t) {
  tickRent(); flushCoins(dt); updateNeeds(dt); updateQuest(t);
  if (g2Day !== G.day) { const first = g2Day === null; g2Day = G.day; if (first || seasonOf(G.day) !== seasonOf(G.day - 1) || G.seasonDay < 0) applySeason(!first && seasonOf(G.day) !== seasonOf(G.day - 1)); G.seasonDay = G.day; }
  if ((uiG2T -= dt) < 0) { uiG2T = .5; updateLevelUI(); }
}
let uiG2T = 0;

{ const mg = trayMore.querySelector('.tgrid'); if (mg) { const b = document.createElement('button'); b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="3"/></svg>Frame town'; b.onclick = () => { closeTray(); frameTown(false); }; mg.appendChild(b); } }
window.__g2 = {cells: () => G.cells, biz: () => G.businesses, synergy, plotValue, funds: v => { G.funds = v; updateEco(); }, quest: () => quest, lvl: () => [G.stars, townLevel(), G.lastLvl, uiG2T, g2Day], ul: () => updateLevelUI()};
function g2Start() { G.lastLvl = townLevel(); questInit(); if (innerWidth < 700) frameTown(true); catsToRoofs(); updateLevelUI(); }
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'h' || e.key === 'H') frameTown(false); });

setLookStyle(lookStyle, true); compactPresets(); g2Start(); startIntro(); frame();
try { if (!localStorage.getItem('tilt-tut')) setTimeout(() => tutorial(0), 800); } catch (e) { }
document.getElementById('undoB').onclick = undo;
window.__x = {ev: k => { G.events.push({kind: k, at: G.hour + .01, dur: {flood: 6, storm: 8, cruise: 4, inspector: 0, market: 10, regatta: 2.5}[k], started: false, day: G.day}); }, quest: k => questStart(k), season: d => { G.day = d; }, need: () => G.citizens.filter(z => z.need).map(z => z.need), stars: n => { G.stars = n; updateGoalChip(); }, style: (i, j, s) => { const c = cellAt(i, j); c.style = s; refresh(c, true); }, shabby: () => { G.cells.forEach(c => { if (c.floors) { c.cond = .1; rebuildObj(c); } }); }, scen: id => startScenario(id), snap: () => { G.snapPending = true; }, album: () => album.length, unlock: () => { G.unlocked = {church: true, tram: true, funicular: true}; }, weather: w => { G.weather = w; rebuildLaundry(); }, fest: () => { G.festNight = G.day; }, photo: v => setPhoto(v), tram: () => { G.tram = planTram(); rebuildLaundry(); return !!G.tram; }, funi: () => { G.funi = planFuni(); rebuildLaundry(); return G.funi && [G.funi.a, G.funi.b]; }, church: () => { const c = G.cells.find(c => walkable(c) && !c.water && !c.kind && c.i > 3 && c.i < 10); c.kind = 'church'; refresh(c, true); return [c.i, c.j]; }, tutOff: () => { document.getElementById('tut').style.display = 'none'; }, info: () => ({tb: G.tram && G.tram.broken, tc: G.tram && G.tram.cells, tp: G.tram && G.tram.car && G.tram.car.position.toArray(), fb: G.funi && G.funi.broken, fp: G.funi && G.funi.car && G.funi.car.position.toArray()})};
addEventListener('pagehide', G.autosave); document.addEventListener('visibilitychange', () => { if (document.hidden) G.autosave(); });
/* world-anchored overlays (speech bubbles, need icons, map pins) live in one layer under the interface */
{ const W = document.createElement('div'); W.id = 'worldUI'; W.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden';
  const cv = document.getElementById('c'); cv.after(W); [bubbleEl, pinsEl, ...needEls].forEach(e => e && W.appendChild(e)); }
window.__tilt = {illus: on => setLookStyle(on ? 'illus' : 'paint'), hover: (i, j, t) => { if (t) G.tool = t; setHover(i == null ? null : cellAt(i, j)); G.lastPtr = {x: innerWidth / 2, y: innerHeight / 2}; }, sel: (i, j) => G.houseCard(cellAt(i, j), false), map: v => setMap(v), intro: () => G.intro, lc: () => laundryG.children.map(m => m.geometry.attributes.position.count), cam: (x, y, z, tx, ty, tz) => { G.intro = null; camera.position.set(x, y, z); controls.target.set(tx, ty, tz); }, apply: (i, j, t) => { G.tool = t || G.tool; apply(cellAt(i, j)); }, set: (p, h) => { G.preset = PRESETS[p]; if (h != null) { G.hour = h; G.citizens.forEach(z => z.step = null); } }, speed: v => G.speed = v, cit: () => G.citizens, biz: () => G.businesses, card: i => G.personCard(G.citizens[i]), house: (i, j) => G.houseCard(cellAt(i, j), true), follow: i => { G.follow = G.citizens[i]; }, day: () => { G.day++; runDay(); }, funds: () => G.funds, run: (n, dt) => { for (let k = 0; k < n; k++) G.updateCity(dt); }, hr: () => G.hour};

export {updateGame2};
