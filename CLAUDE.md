# Tilt Town — developer notes

Browser city builder: three.js r170 + plain ES modules in `src/`, bundled by Vite. No framework, no TypeScript.

```sh
npm run dev     # http://localhost:5173, hot reload
npm run build   # dist/ (deployed to GitHub Pages from main by .github/workflows/pages.yml)
npm run smoke   # build + load twice (fresh town, then from autosave) in headless Chromium; fails on any error
```
Run `npm run smoke` before pushing.

## Module map (`src/`, in load order)

| File | What lives there |
|---|---|
| `core/util.js` | constants (`N`, `S`, `LV`…), rng/pick/lerp, geometry + canvas-texture helpers |
| `core/scene.js` | renderer, scene, camera, controls, sky, materials, world grid (`cells`, `cellAt`) |
| `world/houses.js` | procedural houses, laundry/power lines/stairs, trees, lamps, bridges, plazas, shop window goods, awnings, steam, glows |
| `world/streets.js` | smoke, birds, walkers, street props, boats, clock (`hour`, `day`), businesses data |
| `game/identity.js` | town/street/shop names, labels, crest, town card, house colours, mayor, chronicle, postcards, visiting |
| `world/organic.js` | warped plot grid, terraced joins, archways, yards, ivy, business frontage spill |
| `people/sim.js` | citizen names/looks, nav grid + A*, needs, errands, daily plans, B&B guests, movement |
| `people/characters.js` | GPU-skinned characters: rig, geometry, poses, actions |
| `people/animals.js` | dogs, cats, birds, donkey/horse, perf readout |
| `ui/cards.js` | speech bubbles, person/house/shop cards, selection outline, economy, cheats, money UI |
| `game/extras.js` | sound, shop interiors, weather, festival, landmarks, requests, paper, save/load, undo, photo, menu, tutorial |
| `game/meta.js` | unlocks, goals, land, decay, events, notables, scenarios, town generation |
| `world/visuals.js` | cliff island, waterfalls, rocks, reflections, light pools, backdrop, dust, intro flyover |
| `world/shops.js` | shop colours/icons/signs, storefront generators, map mode |
| `render/clarity.js` | hover/build preview, see-through, LOD, status pins, clean mode |
| `render/post.js` | time-of-day presets, painterly post-process |
| `ui/input.js` | UI wiring, picking, camera, main `frame()` loop |
| `ui/dock.js` | dock, trays, bottom sheet, radial menu, keyboard shortcuts |
| `game/progression.js` | guided first street, level, needs icons, rent, plot value, synergies, seasons, regatta, districts |
| `main.js` | entry: per-frame game hooks, startup, debug hooks |
| `styles.css` | all CSS |

## Rules

- **Load order is a chain.** Each module's first line is `import './<previous>.js'`, and `main.js` is last, so modules run top to bottom in the table above (top-level code may rely on anything earlier). A new module: put it in the chain (its first import is the previous module, the next module's first import becomes it) and add it to this table.
- **Imports are read-only.** A top-level variable that another module reassigns lives on `G` in `src/state.js` (e.g. `G.day`, `G.hour`, `G.citizens`, `G.funds`, `G.tool`). Assign its initial value as `G.foo = …` in the module that owns it. Functions that other modules wrap (`houseCard`, `personCard`, `autosave`, `snapshot`, `updateCity`, `poseAll`, `mapColOf`, `buildMapUI`, `lifeEvents`) are also called through `G`.
- Debug hooks for tests live on `window.__life`, `__g2`, `__own`, `__ch`, `__tilt`, `__x`; keep them working.
- `index.html` holds the DOM skeleton and the auto-reload script; `__BUILD__` is replaced with a timestamp at build.
- Add `?perf` to the URL (or Shift+P) for a performance readout.
