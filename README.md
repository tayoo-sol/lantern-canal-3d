# Lantern Canal 3D

A Three.js gondola game through a foggy Venetian canal at night. Steer your
gondola past the lanterns, collect the coins, and reach the finish gate.

**Entry for the Meshy Z-Axis Awards — Gaming track** (deadline 24 Jan 2027).
Play it here: https://tayoo-sol.github.io/lantern-canal-3d/

## How to play

- **← →** or **A / D** — steer
- **↑ ↓** or **W / S** — speed up / slow down
- **R** — restart the level
- **P** — pause · **M** — mute

Collect coins and the hidden golden mask (1 per level) for up to 3 stars.
Dodge the bricole posts — hitting one slows you down. Progress and best
stars are saved in your browser; finishing a level unlocks the next one.

## Tech

- Three.js + Vite, plain JavaScript, $0 hosting on GitHub Pages.
- Hero 3D assets are AI-generated with TRELLIS.2 (Microsoft, MIT licence)
  from reference images, then exported as GLB:
  - `public/assets/gondola-hero.glb` — Venetian gondola (black hull, gold trim)
  - `public/assets/gondolier-hero.glb` — masked gondolier with oar
  - Lanterns are procedural for now (a TRELLIS.2 lantern hero asset is planned).
- Canal, buildings, water, sky, coins, masks, lanterns and bricole posts are
  procedural Three.js. All sound is synthesized Web Audio (no audio files):
  coin/mask/finish chimes, bump thud, ambient pad + pluck music loop.

## Develop

```bash
npm install
npm run dev     # local dev server
npm run build   # builds into docs/ (GitHub Pages source)
node smoke-test.mjs   # headless Chromium play-through (18 checks)
```

Debug hooks (in `window.__game`): `setTimeScale(v)` speeds the game clock;
`setRenderEnabled(false)` skips `renderer.render()` so gameplay logic can be
tested at full speed when software rendering is slow; `setPixelRatio(v)`
shrinks the render buffer; `frames` counts completed loop iterations.

## Status

Milestone 2 (26 Nov 2026): levels 1–5 with a level-select screen, hidden
golden mask per level, bricole collision hazards (slowdown + shake + thud),
saved progress + best stars (localStorage), Web Audio SFX (coin/mask/bump/
finish) + ambient music loop with mute, lantern glow halos, coin/mask
sparkle particles, rowing gondolier, pause.
Not yet: lantern hero GLB (TRELLIS.2 quota — retry 27 Nov), mobile/touch,
levels 6+.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
