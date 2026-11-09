import './input.js'; // load order: runs after the previous module
import {G} from '../state.js';
import {canvas, controls} from '../core/scene.js';
import {hhmm} from '../world/streets.js';
import {townCard} from '../game/identity.js';
import {COST, cardEl, closeCard, euro} from './cards.js';
import {live, setPhoto, undo, undoStack} from '../game/extras.js';
import {mapOn, setMap} from '../world/shops.js';
import {pinsOn, setHover} from '../render/clarity.js';
import {ICON, TOOLS, apply, clkEl, pickCell, pivotDot, timeEl, toolsEl} from './input.js';

/* ==========================================================================
   UI v2: thumb-zone dock, contextual trays, bottom sheet, radial build menu
   ========================================================================== */
const UI = {tray: null, armed: null};
const BUILD_ITEMS = ['house', 'plaza', 'landmark', 'tree', 'lamp', 'erase'], LAND_ITEMS = ['raise', 'lower', 'district'];
const TLABEL = Object.fromEntries(TOOLS);
const costOf = id => ({house: COST.house, shop: COST.shop, plaza: COST.plaza, tree: COST.tree, lamp: COST.lamp, raise: COST.raise, lower: COST.lower})[id];
const svgI = id => `<svg viewBox="0 0 24 24">${ICON[id]}</svg>`;
const DOCK_ICON = {
  build: '<path d="M4 20h16M6 20V10l6-5 6 5v10M10 20v-5h4v5"/>',
  land: '<path d="M3 18l5-7 4 4 3-3 6 6zM3 21h18"/>',
  time: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  inbox: '<path d="M4 13l2-7h12l2 7v5H4zM4 13h5l1 2h4l1-2h5"/>',
};
{ const st = document.createElement('style'); st.textContent = `
  #bar{display:none!important}
  #dock{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom));display:flex;gap:6px;padding:6px;z-index:4}
  #dock>button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:60px;height:56px;padding:4px 8px;font:600 11px 'Bricolage Grotesque',system-ui,sans-serif;color:var(--paper);background:transparent;border:0;border-radius:12px;cursor:pointer;position:relative}
  #dock>button svg,.tray svg,#radial svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  #dock>button.on{background:rgba(243,230,204,.2);box-shadow:inset 0 0 0 1px rgba(243,230,204,.35)}
  #dock>button.open{background:rgba(240,163,92,.25)}
  #dock .clk{font:600 13px 'Bricolage Grotesque',system-ui,sans-serif;font-variant-numeric:tabular-nums}
  #dock .paused:after{content:'II';position:absolute;top:3px;right:6px;font-size:9px;color:#f0a35c}
  .tray{position:fixed;left:50%;transform:translate(-50%,8px);bottom:calc(84px + env(safe-area-inset-bottom));width:min(560px,calc(100vw - 16px));padding:10px;display:none;z-index:4;opacity:0;transition:opacity .16s,transform .16s;touch-action:pan-x}
  .tray.show{display:block}.tray.vis{opacity:1;transform:translate(-50%,0)}
  .tray h4{margin:0 2px 8px;font:400 15px Caprasimo,Georgia,serif;display:flex;justify-content:space-between;align-items:center}
  .tray h4 small{font:500 11px 'Bricolage Grotesque',system-ui,sans-serif;opacity:.6}
  .tray .grip{width:36px;height:4px;border-radius:2px;background:rgba(243,230,204,.35);margin:-2px auto 8px}
  .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px}
  .tgrid button{display:flex;flex-direction:column;align-items:center;gap:3px;min-height:64px;padding:8px 4px;border:0;border-radius:12px;background:rgba(243,230,204,.08);color:var(--paper);font:600 12px 'Bricolage Grotesque',system-ui,sans-serif;cursor:pointer}
  .tgrid button small{font-weight:500;font-size:10.5px;opacity:.7}
  .tgrid button.on{background:rgba(243,230,204,.22);box-shadow:inset 0 0 0 1px rgba(243,230,204,.4)}
  .tgrid button.danger{color:#ffb4a0}
  .tgrid button.poor small{color:#ffb4a0;opacity:1}
  .trow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
  .trow .act{min-height:44px;min-width:48px;border-radius:12px}
  #trayTime .big{font:600 26px 'Bricolage Grotesque',system-ui,sans-serif;font-variant-numeric:tabular-nums}
  #trayTime input[type=range]{width:100%;height:36px}
  #trayTime .spd .act{min-width:56px}
  #trayMore #presets{position:static!important;display:flex!important;flex-direction:row!important;flex-wrap:wrap;gap:6px;padding:0;background:none;box-shadow:none;backdrop-filter:none;max-width:none;transform:none}
  #trayMore #presets button{display:flex!important;min-height:40px;padding:6px 10px}
  #trayMore #presets span{display:inline!important}
  #trayMore #presets .tog{display:none!important}
  #trayInbox .tgrid button{flex-direction:row;justify-content:flex-start;min-height:48px;padding:8px 12px;text-align:left}
  #ctx{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));display:none;align-items:center;gap:8px;padding:6px 6px 6px 12px;z-index:3;font:600 13px 'Bricolage Grotesque',system-ui,sans-serif}
  #ctx.show{display:flex}#ctx span{opacity:.75;font-weight:500}
  #ctx button{min-height:40px;padding:0 14px;border-radius:10px;border:0;font:600 13px 'Bricolage Grotesque',system-ui,sans-serif;cursor:pointer}
  #ctx .chg{background:rgba(243,230,204,.1);color:var(--paper)}#ctx .done{background:#f0a35c;color:#24170f}
  #undoF{position:fixed;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));min-height:44px;padding:0 14px;border:0;font:600 13px 'Bricolage Grotesque',system-ui,sans-serif;color:var(--paper);cursor:pointer;z-index:3;opacity:0;pointer-events:none;transition:opacity .25s}
  #undoF.show{opacity:1;pointer-events:auto}
  #inboxB{position:relative;display:flex;align-items:center;gap:6px;padding:7px 11px;font:600 12px 'Bricolage Grotesque',system-ui,sans-serif;color:var(--paper);cursor:pointer;border:0}
  #inboxB svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #inboxB b{min-width:18px;height:18px;border-radius:9px;background:#c0442e;color:#fff;font-size:11px;display:none;place-items:center;padding:0 5px}
  #inboxB.hot b{display:grid}
  #chips>#goalsBtn,#chips>#reqs,#chips>#paperBtn,#chips>#scenChip{display:none!important}
  #title{transition:opacity .8s}#title.gone{opacity:0;pointer-events:none}
  #chips,#card{transition:top .5s}#title.gone~#chips{top:14px}#title.gone~#card{top:60px}
  #radial{position:fixed;left:0;top:0;width:220px;height:220px;margin:-110px 0 0 -110px;pointer-events:none;z-index:6;display:none}
  #radial.show{display:block}
  #radial .ring{position:absolute;inset:62px;border-radius:50%;border:2px solid rgba(243,230,204,.5);background:rgba(28,20,16,.35)}
  #radial button{position:absolute;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font:600 10px 'Bricolage Grotesque',system-ui,sans-serif;color:var(--paper);background:rgba(36,26,20,.9);box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:auto;cursor:pointer;transition:transform .1s,background .1s}
  #radial button.hi{transform:scale(1.15);background:#f0a35c;color:#24170f}
  #radial button.no{opacity:.45}
  body.photo #dock,body.photo .tray,body.photo #ctx,body.photo #undoF{display:none!important}
  body.clean #inboxB{visibility:hidden}
  @media (max-width:700px){
    #card{left:0!important;right:0;width:auto!important;top:auto!important;bottom:calc(76px + env(safe-area-inset-bottom))!important;max-height:46vh!important;border-radius:16px 16px 0 0;padding-top:18px!important;transition:max-height .2s}
    #card.full{max-height:82vh!important}
    #card:before{content:'';position:absolute;left:50%;top:6px;width:40px;height:4px;margin-left:-20px;border-radius:2px;background:rgba(243,230,204,.4)}
    #chips{top:calc(10px + env(safe-area-inset-top))!important;bottom:auto!important;left:10px!important}
    #title{display:none}
    #dock{left:8px;right:8px;transform:none;justify-content:space-between}
    #dock>button{flex:1;min-width:0}
    #legend{top:calc(56px + env(safe-area-inset-top))!important;right:10px}
  }
  @media (max-height:520px) and (orientation:landscape){
    #dock{left:auto;right:calc(8px + env(safe-area-inset-right));top:50%;bottom:auto;transform:translateY(-50%);flex-direction:column}
    #dock>button{height:48px;min-width:64px}
    .tray{left:auto;right:96px;bottom:auto;top:50%;transform:translate(8px,-50%);width:min(420px,calc(100vw - 120px));max-height:calc(100vh - 20px);overflow:auto}
    .tray.vis{transform:translate(0,-50%)}
    #ctx{left:auto;right:96px;transform:none;bottom:10px}
    #undoF{right:96px;bottom:60px}
    #card{bottom:8px!important;max-height:calc(100vh - 70px)!important;left:8px!important;right:auto!important;width:min(360px,50vw)!important;border-radius:14px}
  }`; document.head.appendChild(st); }

/* ---- dock ---- */
const dock = document.createElement('div'); dock.id = 'dock'; dock.className = 'panel'; document.body.appendChild(dock);
const dockBtn = (k, label, icon) => { const b = document.createElement('button'); b.dataset.k = k; b.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg><span>${label}</span>`; dock.appendChild(b); return b; };
const dkLook = dockBtn('look', 'Look', ICON.look), dkBuild = dockBtn('build', 'Build', DOCK_ICON.build), dkLand = dockBtn('land', 'Land', DOCK_ICON.land), dkTime = dockBtn('time', '07:00', DOCK_ICON.time), dkMore = dockBtn('more', 'More', DOCK_ICON.more);
dkTime.querySelector('span').className = 'clk';

/* ---- trays ---- */
const mkTray = (id, title, hint) => { const t = document.createElement('div'); t.id = id; t.className = 'tray panel'; t.innerHTML = `<div class="grip"></div><h4>${title}<small>${hint || ''}</small></h4>`; document.body.appendChild(t); return t; };
const trayBuild = mkTray('trayBuild', 'Build', 'pick, then tap plots'), trayLand = mkTray('trayLand', 'Shape the land', 'pick, then tap plots'), trayTime = mkTray('trayTime', 'Time', ''), trayMore = mkTray('trayMore', 'More', ''), trayInbox = mkTray('trayInbox', 'Town news', '');
const TRAYS = {build: trayBuild, land: trayLand, time: trayTime, more: trayMore, inbox: trayInbox};
function itemGrid(tray, items) {
  const g = document.createElement('div'); g.className = 'tgrid'; tray.appendChild(g);
  items.forEach(id => { const b = document.createElement('button'); b.dataset.t = id; if (id === 'erase') b.classList.add('danger'); b.onclick = () => armTool(id); g.appendChild(b); });
  return g;
}
const buildGrid = itemGrid(trayBuild, BUILD_ITEMS), landGrid = itemGrid(trayLand, LAND_ITEMS);
function refreshItems() {
  [...buildGrid.children, ...landGrid.children].forEach(b => {
    const id = b.dataset.t, k = costOf(id);
    b.innerHTML = `${svgI(id)}${TLABEL[id]}<small>${id === 'erase' ? 'refund 30%' : id === 'landmark' ? 'unlocks' : k != null ? euro(k) : ''}</small>`;
    b.classList.toggle('on', G.tool === id); b.classList.toggle('poor', k != null && k > G.funds);
  });
}
// time tray: move the real controls in
{ const big = document.createElement('div'); big.className = 'big'; big.id = 'clkBig'; trayTime.appendChild(big);
  trayTime.appendChild(timeEl); const r = document.createElement('div'); r.className = 'trow'; r.appendChild(document.querySelector('.spd')); trayTime.appendChild(r);
  const q = document.createElement('div'); q.className = 'trow';
  [['Dawn', 6.5], ['Noon', 12.5], ['Dusk', 18.6], ['Night', 22]].forEach(([l, h]) => { const b = document.createElement('button'); b.className = 'act'; b.textContent = l; b.onclick = () => { timeEl.value = h; timeEl.oninput(); }; q.appendChild(b); });
  trayTime.appendChild(q); }
// more tray
{ const g = document.createElement('div'); g.className = 'tgrid'; trayMore.appendChild(g);
  const add = (label, icon, fn, id) => { const b = document.createElement('button'); if (id) b.id = id; b.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg>${label}`; b.onclick = fn; g.appendChild(b); return b; };
  add('Your town', '<path d="M5 4h14v7c0 5-4 8-7 9-3-1-7-4-7-9z"/><path d="M12 8v8M8 12h8"/>', () => { closeTray(); townCard(); }, 'mTown');
  add('Map', '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>', () => { setMap(!mapOn); closeTray(); refreshMore(); }, 'mMap');
  add('Pins', '<path d="M12 21s-6-5.5-6-10a6 6 0 0112 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>', () => { document.getElementById('pinsB').click(); refreshMore(); }, 'mPins');
  add('Clean view', '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>', () => { document.getElementById('cleanB').click(); refreshMore(); }, 'mClean');
  add('Photo', '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M9 7l1.5-3h3L15 7"/>', () => { closeTray(); setPhoto(true); });
  add('Sound', '<path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 010 6"/>', () => { document.getElementById('snd').click(); setTimeout(refreshMore, 200); }, 'mSnd');
  add('Undo', '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>', () => undo());
  add('Settings', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', () => { closeTray(); document.getElementById('menu').click(); });
  const h = document.createElement('h4'); h.style.marginTop = '12px'; h.innerHTML = 'Looks<small>colour and light</small>'; trayMore.appendChild(h);
  trayMore.appendChild(document.getElementById('presets')); }
function refreshMore() {
  const on = (id, v) => document.getElementById(id)?.classList.toggle('on', !!v);
  on('mMap', mapOn); on('mPins', pinsOn); on('mClean', document.body.classList.contains('clean')); on('mSnd', typeof live === 'function' && live());
}
// inbox tray: goals, requests, paper, scenario
{ const g = document.createElement('div'); g.className = 'tgrid'; g.style.gridTemplateColumns = '1fr'; trayInbox.appendChild(g);
  ['goalsBtn', 'reqs', 'paperBtn', 'scenChip'].forEach(id => { const src = document.getElementById(id); if (!src) return;
    const b = document.createElement('button'); b.dataset.src = id; b.onclick = () => { closeTray(); src.click(); }; g.appendChild(b); }); }
function refreshInbox() {
  trayInbox.querySelectorAll('[data-src]').forEach(b => { const src = document.getElementById(b.dataset.src); const vis = src && src.style.display !== 'none'; b.style.display = vis ? '' : 'none'; if (vis) b.textContent = src.textContent; });
  const n = G.requests.length, el = document.getElementById('inboxB'); if (!el) return;
  el.classList.toggle('hot', n > 0); el.querySelector('b').textContent = n;
}
{ const b = document.createElement('button'); b.id = 'inboxB'; b.className = 'panel chip'; b.innerHTML = `<svg viewBox="0 0 24 24">${DOCK_ICON.inbox}</svg>News<b>0</b>`; b.onclick = () => toggleTray('inbox'); document.getElementById('chips').insertBefore(b, document.getElementById('eventChip')); }

function openTray(k) {
  Object.entries(TRAYS).forEach(([key, t]) => { if (key !== k && t.classList.contains('show')) { t.classList.remove('vis'); t.classList.remove('show'); } });
  const t = TRAYS[k]; UI.tray = k; t.classList.add('show'); requestAnimationFrame(() => t.classList.add('vis'));
  if (k === 'build' || k === 'land') refreshItems(); if (k === 'more') refreshMore(); if (k === 'inbox') refreshInbox();
  syncDock(); document.getElementById('ctx').classList.remove('show');
}
function closeTray() { if (!UI.tray) return; const t = TRAYS[UI.tray]; t.classList.remove('vis'); t.classList.remove('show'); UI.tray = null; syncDock(); syncCtx(); }
function toggleTray(k) { UI.tray === k ? closeTray() : openTray(k); }

/* ---- arming a tool: contextual bar with Done ---- */
const ctx = document.createElement('div'); ctx.id = 'ctx'; ctx.className = 'panel'; document.body.appendChild(ctx);
function armTool(id) {
  const b = [...toolsEl.children].find(x => x.textContent.trim() === TLABEL[id]); b && b.click();
  closeTray(); syncDock(); syncCtx();
}
function syncCtx() {
  const on = G.tool !== 'look' && !UI.tray;
  ctx.classList.toggle('show', on); if (!on) return;
  const k = costOf(G.tool);
  ctx.innerHTML = `${svgI(G.tool)}<b>${TLABEL[G.tool]}</b><span>${G.tool === 'erase' ? 'tap to remove' : k != null ? euro(k) + ' each' : 'tap a plot'}</span><button class="chg">Change</button><button class="done">Done</button>`;
  ctx.querySelector('svg').style.cssText = 'width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7';
  ctx.querySelector('.chg').onclick = () => openTray(LAND_ITEMS.includes(G.tool) ? 'land' : 'build');
  ctx.querySelector('.done').onclick = () => armTool('look');
}
function syncDock() {
  dkLook.classList.toggle('on', G.tool === 'look' && !UI.tray);
  dkBuild.classList.toggle('on', BUILD_ITEMS.includes(G.tool)); dkLand.classList.toggle('on', LAND_ITEMS.includes(G.tool));
  [dkBuild, dkLand, dkTime, dkMore].forEach(b => b.classList.toggle('open', UI.tray === b.dataset.k));
  dkBuild.querySelector('svg').innerHTML = BUILD_ITEMS.includes(G.tool) ? ICON[G.tool] : DOCK_ICON.build;
  dkLand.querySelector('svg').innerHTML = LAND_ITEMS.includes(G.tool) ? ICON[G.tool] : DOCK_ICON.land;
}
dkLook.onclick = () => { closeTray(); armTool('look'); };
{ // easter egg: press and hold the clock, then slide left/right to scrub the time of day
  let hold = null, scrub = null, skipClick = false;
  const bub = document.createElement('div'); bub.id = 'scrubBub'; bub.className = 'panel'; document.body.appendChild(bub);
  const st = document.createElement('style'); st.textContent = `#scrubBub{position:fixed;transform:translate(-50%,-100%);padding:8px 14px;font:600 20px 'Bricolage Grotesque',system-ui,sans-serif;font-variant-numeric:tabular-nums;display:none;z-index:7;pointer-events:none}#scrubBub small{display:block;font:500 11px 'Bricolage Grotesque',system-ui,sans-serif;opacity:.7;text-align:center}#dock>button[data-k=time]{touch-action:none}#dock>button.scrub{background:#f0a35c;color:#24170f}`; document.head.appendChild(st);
  const show = () => { const r = dkTime.getBoundingClientRect(), h = +timeEl.value; bub.style.left = (r.left + r.width / 2) + 'px'; bub.style.top = (r.top - 10) + 'px'; bub.innerHTML = `${hhmm(h)}<small>slide ◂ ▸</small>`; dkTime.querySelector('.clk').textContent = hhmm(h); };
  dkTime.addEventListener('pointerdown', e => { clearTimeout(hold); const x = e.clientX, id = e.pointerId;
    hold = setTimeout(() => { scrub = {x, h: +timeEl.value}; skipClick = true; try { dkTime.setPointerCapture(id); } catch (er) { } dkTime.classList.add('scrub'); bub.style.display = 'block'; show(); closeTray(); try { navigator.vibrate && navigator.vibrate(10); } catch (er) { } }, 380); });
  dkTime.addEventListener('pointermove', e => { if (!scrub) return; let h = scrub.h + (e.clientX - scrub.x) * 24 / Math.max(240, innerWidth * .7); h = ((h % 24) + 24) % 24; timeEl.value = h; timeEl.oninput(); show(); });
  const end = () => { clearTimeout(hold); if (!scrub) return; scrub = null; dkTime.classList.remove('scrub'); bub.style.display = 'none'; };
  dkTime.addEventListener('pointerup', end); dkTime.addEventListener('pointercancel', end); dkTime.addEventListener('lostpointercapture', end);
  dkTime.addEventListener('click', e => { if (skipClick) { skipClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  dkTime.addEventListener('contextmenu', e => e.preventDefault());
}
dkBuild.onclick = () => toggleTray('build'); dkLand.onclick = () => toggleTray('land'); dkTime.onclick = () => toggleTray('time'); dkMore.onclick = () => toggleTray('more');
// tapping the town closes an open tray (the tap still goes through)
canvas.addEventListener('pointerdown', () => { if (UI.tray) closeTray(); }, true);
// swipe a tray down to close it
Object.values(TRAYS).forEach(t => { let y0 = null; t.addEventListener('pointerdown', e => { y0 = e.clientY; }); t.addEventListener('pointerup', e => { if (y0 != null && e.clientY - y0 > 50) closeTray(); y0 = null; }); });

/* ---- floating undo after an edit ---- */
const undoF = document.createElement('button'); undoF.id = 'undoF'; undoF.className = 'panel'; undoF.textContent = '↶ Undo'; document.body.appendChild(undoF);
let undoT = 0; undoF.onclick = () => { undo(); undoT = 0; };
const _snap = G.snapshot; G.snapshot = function () { _snap.apply(this, arguments); undoT = 7; };

/* ---- card as a draggable bottom sheet on phones ---- */
{ let y0 = null, h0 = 0;
  cardEl.addEventListener('pointerdown', e => { if (innerWidth > 700) return; const r = cardEl.getBoundingClientRect(); if (e.clientY - r.top > 44) return; y0 = e.clientY; h0 = r.height; cardEl.setPointerCapture(e.pointerId); });
  cardEl.addEventListener('pointerup', e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy > 60) { if (cardEl.classList.contains('full')) cardEl.classList.remove('full'); else closeCard(); } else if (dy < -40) cardEl.classList.add('full'); else if (Math.abs(dy) < 6) cardEl.classList.toggle('full'); });
  new MutationObserver(() => { if (cardEl.style.display === 'none') cardEl.classList.remove('full'); else if (UI.tray && UI.tray !== 'more') closeTray(); }).observe(cardEl, {attributes: true, attributeFilter: ['style']}); }

/* ---- radial build menu on long-press ---- */
const radial = document.createElement('div'); radial.id = 'radial'; radial.innerHTML = '<div class="ring"></div>'; document.body.appendChild(radial);
const RAD = ['house', 'tree', 'lamp', 'plaza', 'erase'];
RAD.forEach((id, k) => { const a = -Math.PI / 2 + k / RAD.length * Math.PI * 2, b = document.createElement('button'); b.dataset.t = id; b.style.left = (110 + Math.cos(a) * 78) + 'px'; b.style.top = (110 + Math.sin(a) * 78) + 'px'; radial.appendChild(b); });
let rad = null, lpT = null;
function radialOpen(x, y, c) {
  rad = {x, y, c, hi: null}; G.rot = null; pivotDot.visible = false; radial.style.left = x + 'px'; radial.style.top = y + 'px'; radial.classList.add('show'); controls.enabled = false; G.down = null;
  radial.querySelectorAll('button').forEach(b => { const id = b.dataset.t, k = costOf(id); b.innerHTML = `${svgI(id)}${TLABEL[id]}`; b.classList.toggle('no', k != null && k > G.funds); b.classList.remove('hi'); });
  setHover(c); try { navigator.vibrate && navigator.vibrate(12); } catch (e) { }
}
function radialClose() { radial.classList.remove('show'); rad = null; controls.enabled = true; setHover(null); }
function radialPick(id) {
  const c = rad && rad.c; radialClose(); if (!c) return;
  const t0 = G.tool; G.tool = id; apply(c); G.tool = t0; syncDock();
}
canvas.addEventListener('pointerdown', e => {
  clearTimeout(lpT); if (G.tool !== 'look' || rad) return; const x = e.clientX, y = e.clientY;
  lpT = setTimeout(() => { const c = pickCell({clientX: x, clientY: y}); if (c && G.down && Math.hypot(G.down.x - x, G.down.y - y) < 1) radialOpen(x, y, c); }, 480);
});
canvas.addEventListener('pointermove', e => { if (G.down && Math.hypot(e.clientX - G.down.x, e.clientY - G.down.y) > 8) clearTimeout(lpT); });
addEventListener('pointermove', e => {
  if (!rad) return; const dx = e.clientX - rad.x, dy = e.clientY - rad.y; let hi = null;
  if (Math.hypot(dx, dy) > 34) { const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2); hi = RAD[Math.round(a / (Math.PI * 2 / RAD.length)) % RAD.length]; }
  rad.hi = hi; radial.querySelectorAll('button').forEach(b => b.classList.toggle('hi', b.dataset.t === hi));
});
addEventListener('pointerup', e => {
  clearTimeout(lpT); if (!rad) return;
  const tgt = e.target.closest && e.target.closest('#radial button');
  if (tgt) { radialPick(tgt.dataset.t); return; }
  if (rad.hi) { radialPick(rad.hi); return; }
  if (!rad.armed) { rad.armed = true; return; } // first release keeps it open for a tap
  radialClose();
}, true);
addEventListener('pointerdown', e => { if (rad && !(e.target.closest && e.target.closest('#radial'))) { e.stopPropagation(); e.preventDefault(); radialClose(); } }, true);
addEventListener('wheel', e => { if (rad) { e.stopPropagation(); e.preventDefault(); } }, {capture: true, passive: false});
addEventListener('touchmove', e => { if (rad) e.preventDefault(); }, {capture: true, passive: false});

/* ---- keyboard shortcuts (desktop) ---- */
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); undo(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const map = {'1': 'house', '2': 'plaza', '3': 'landmark', '4': 'tree', '5': 'lamp', r: 'raise', f: 'lower', x: 'erase', l: 'look'};
  if (map[k]) { armTool(map[k]); return; }
  if (k === 'escape') { if (rad) radialClose(); else if (UI.tray) closeTray(); else if (G.tool !== 'look') armTool('look'); else closeCard(); }
  else if (k === ' ') { e.preventDefault(); const b = document.querySelector(`.spd .act[data-s="${G.speed ? 0 : 1}"]`); b && b.click(); }
  else if (k === 'm') { setMap(!mapOn); }
  else if (k === 't') toggleTray('time'); else if (k === 'b') toggleTray('build');
});

/* ---- per-frame upkeep ---- */
let uiT = 0;
function updateUI(dt) {
  if ((uiT -= dt) < 0) { uiT = .25;
    dkTime.querySelector('.clk').textContent = clkEl.textContent; dkTime.classList.toggle('paused', G.speed === 0);
    const big = document.getElementById('clkBig'); if (big && UI.tray === 'time') big.textContent = clkEl.textContent;
    if (UI.tray === 'build' || UI.tray === 'land') refreshItems(); refreshInbox();
    if (!UI.tray && ctx.classList.contains('show') !== (G.tool !== 'look')) { syncCtx(); syncDock(); }
  }
  undoT = Math.max(0, undoT - dt); undoF.classList.toggle('show', undoT > 0 && undoStack.length > 0 && (innerWidth > 700 || cardEl.style.display === 'none'));
}
setTimeout(() => document.getElementById('title')?.classList.add('gone'), 7000);
addEventListener('pointerdown', () => setTimeout(() => document.getElementById('title')?.classList.add('gone'), 2500), {once: true});
syncDock();

G.g2Summer = false; G.g2Autumn = true;

export {TLABEL, armTool, closeTray, rad, refreshItems, trayMore, updateUI};
