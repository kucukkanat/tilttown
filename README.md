# Tilt Town

A painterly city builder in the browser: build a crooked, Porto-style riverside town of leaning houses, red tiles and glowing windows, and watch its people live in it.

**Play:** https://kucukkanat.github.io/tilttown/

## Features
- Procedural houses, shops, cafés, plazas, landmarks, trees and lamps on a floating island with a river and waterfall
- Simulated citizens with daily plans, an economy, goals, requests, events and scenarios
- Illustrated (hand-drawn lines, flat colour) and painterly looks, five lighting presets, weather and day/night
- Mobile-first controls: thumb-zone dock, build and land trays, shops managed from each house's card, press-and-hold build wheel, bottom-sheet cards, map view and status pins

## Controls
- **Touch:** tap to select, drag to orbit, pinch to zoom, press and hold a plot for the build wheel
- **Shops:** tap any house to open, change or close its shop from the card
- **Time shortcut:** press and hold the clock button, then slide left or right to scrub the time of day
- **Keyboard:** 1–5 build tools, R/F raise/lower, X erase, L look, Space pause, M map, T time, Esc back, Ctrl/Cmd+Z undo

## Tech
A single `index.html` using [three.js](https://threejs.org/) r170 from jsDelivr. No build step; open the file or serve the folder.

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.
