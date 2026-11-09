# Tilt Town

A painterly city builder in the browser: build a crooked, Porto-style riverside town of leaning houses, red tiles and glowing windows, and watch its people live in it.

**Play:** https://kucukkanat.github.io/tilttown/

## Features
- Procedural houses, shops, cafés, plazas, landmarks, trees and lamps on a floating island with a river and waterfall
- Organic layout: irregular plots, terraced rows that join neighbouring houses, archways over alleys, garden spots beside houses, ivy on terrace drops
- Simulated citizens with daily plans, an economy, goals, requests, events and scenarios
- Illustrated (hand-drawn lines, flat colour) and painterly looks, five lighting presets, weather and day/night
- Mobile-first controls: thumb-zone dock, build and land trays, shops managed from each house's card, press-and-hold build wheel, bottom-sheet cards, map view and status pins

## Controls
- **Touch:** tap to select, drag to orbit, pinch to zoom, press and hold a plot for the build wheel
- **Gardens:** pick Tree or Lamp and tap a house to plant up to two in its garden
- **Shops:** tap any house to open, change or close its shop from the card
- **Time shortcut:** press and hold the clock button, then slide left or right to scrub the time of day
- **Keyboard:** 1–5 build tools, R/F raise/lower, X erase, L look, Space pause, M map, T time, Esc back, Ctrl/Cmd+Z undo

## Tech
A single `index.html` using [three.js](https://threejs.org/) r170 from jsDelivr. No build step; open the file or serve the folder.

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.

## Progression and life (Nov 2026)
- Guided first street: 6 steps with a glowing marker and €100 rewards, then daily goals take over
- Town level from stars, goal tracker chip, level-up fireworks
- Residents show needs (🍞 ☕ 🌳 💡) above their heads; tap one to fix it
- Coins pop on sales; rent drips in hourly
- Plot value (river, plazas, trees, lamps, shops, crowding) sets rent; Value map mode
- Shop location bonuses and penalties, terrace and second-counter upgrades
- Districts (Old Town, Riverside, Market) painted from Land › District; Districts map mode
- Seasons every 5 days, regatta event, evening plaza crowds, rooftop cats; press H to frame the town

## Characters and street life
- People are one GPU-skinned mesh (bones in a float texture, 3 distance LODs), with smooth joints, body variety, clothing patterns, and faces that blink, smile and talk up close
- Walks without foot sliding, per-role gaits, springy hair/skirts/bags, head turns, sit/stand blends, sipping coffee, reading the paper, carrying bread, waves, hugs, handshakes, laughter, sweeping, kids kicking a ball
- Dogs (5 breeds, on leashes), cats (sit, groom, sleep), pigeons on plazas, gulls and ducks on the river, a donkey cart by day and a horse on market day
- Shops: modelled window displays per type, scalloped fluttering awnings, swinging signs, open/closed door plates, café chairs stacked at closing, coffee steam
- Add `?perf` to the URL (or press Shift+P) for a performance readout

## Life simulation
- People walk on a fine navigation grid (8 cells per tile): around lamp posts, fountains, benches, café furniture and props, up real stairs, across bridge decks only, and never through walls or over water
- They steer around each other and around people standing still
- No more teleports: people appear and vanish only at doors or the town edge, with a short fade
- Free time is driven by needs (food, coffee, fun, errands) that run down over the day; people pick the most attractive open shop within walking distance, so a newly opened café or bakery gets customers
- Need bubbles mean "nothing suitable within walking distance"; 🚧 means a street is cut off from the town
- New towns are generated fully connected

## Storefronts and B&Bs
- Every shop type has its own procedural storefront (seeded per shop): café terraces with parasols and chalkboards, bakery bay windows, open grocer fronts with produce steps, tiled fishmongers, arched florists, gold-lettered bookshops, barbers with a spinning pole, pharmacies with a lit green cross, stone-arched tascas, wine bars with barrel signs, cinema marquees with bulbs
- B&B: a guesthouse front (painted door with fanlight, house number, blue AL licence plate, lantern, bay trees, bench, lace curtains, window boxes on every floor). Guests arrive with suitcases from 14:30, go out for dinner, stay 1–3 nights and check out by noon; rooms and appeal are shown in the shop card

## Make it yours
- **Names on real signs**: name your town (welcome sign, newspaper, postcards, tab title), streets (azulejo plaques on corner houses), squares (stone plaque) and shops (painted on the fascia; B&B gets a tiled board). Tap an empty street or a square in Look mode to rename; ✎ Rename in a shop card.
- **Crest**: shape, two colours and an emblem in the *Your town* card (More tray). Flies on flags at the welcome sign, church, squares and bridges, stamps postcards and becomes the favicon.
- **Colours**: wall, door and tile pattern per house; a town palette for new houses.
- **Chronicle**: firsts and milestones written down automatically; founding-day lanterns every 10 days; residents send letters with their names.
- **Mayor**: make any resident mayor (they wear your colours and wave at the camera); at town level 5 the town offers a statue in the square you choose.
- **Traditions**: a town specialty (+15% at matching shops, a brass board, tourists ask for it) and your own festival theme and day each season.
- **Sharing**: framed postcards with name, crest and day; visit a friend's town from their code, read-only, with your own town kept safe.
