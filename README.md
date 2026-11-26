# Lantern Canal 3D

A Three.js gondola game through a foggy Venetian canal at night. Steer your
gondola past the lanterns, collect the coins, and reach the finish gate.

**Entry for the Meshy Z-Axis Awards — Gaming track** (deadline 24 Jan 2027).
Play it here: https://tayoo-sol.github.io/lantern-canal-3d/

## How to play

- **← →** or **A / D** — steer
- **↑ ↓** or **W / S** — speed up / slow down
- **R** — restart the level

Collect all 6 coins for 3 stars. The timer starts when you first speed up.

## Tech

- Three.js + Vite, plain JavaScript, $0 hosting on GitHub Pages.
- Hero 3D assets are AI-generated with TRELLIS.2 (Microsoft, MIT licence)
  from reference images, then exported as GLB:
  - `public/assets/gondola-hero.glb` — Venetian gondola (black hull, gold trim)
  - `public/assets/gondolier-hero.glb` — masked gondolier with oar
  - Lanterns are procedural for now (a TRELLIS.2 lantern hero asset is planned).
- Canal, buildings, water, sky, coins and lanterns are procedural Three.js.

## Develop

```bash
npm install
npm run dev     # local dev server
npm run build   # builds into docs/ (GitHub Pages source)
node smoke-test.mjs   # headless Chromium play-through (10 checks)
```

## Status

Milestone 1 (26 Nov 2026): 1 playable level — steering, speed, wall
collision, 6 collectible coins, finish gate with star rating, restart.
Not yet: levels 2+, sound, golden-mask collectible, polish.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
