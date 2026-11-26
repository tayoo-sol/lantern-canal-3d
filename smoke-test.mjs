// Smoke test for Lantern Canal 3D (milestone 2).
// Serves docs/ on localhost, opens it in headless Chromium (SwiftShader),
// and checks: level select + locks, play L1 to finish (progress saved),
// play L2: golden mask collect, bricole bump, finish + stars, mute toggle,
// level select shows earned stars. 0 console/page errors.
//
// NOTE: software rendering on this VM is extremely slow (tens of seconds
// per frame under load), so gameplay logic is tested with rendering OFF
// (setRenderEnabled(false) — the game loop still runs at full speed) and
// rendering is only switched on for the three proof screenshots, at a
// reduced pixel ratio.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = process.env.HOME + '/workspace/meshy-zaxis'
const PORT = 4180

const candidates = [
  process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
]
const executablePath = candidates.find(existsSync)
if (!executablePath) { console.log('NO_CHROMIUM_FOUND'); process.exit(2) }

const server = spawn(path.join(root, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 3000))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

let browser
let errors = []
try {
  browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`http://127.0.0.1:${PORT}/lantern-canal-3d/`, { waitUntil: 'domcontentloaded' })

  // Wait for the game handle, then shrink the render buffer (cheap frames).
  await page.waitForFunction(() => window.__game, { timeout: 60000 })
  await page.evaluate(() => window.__game.setPixelRatio(0.5))

  // 1. wait for both hero GLBs to load (or fallback) — parsing 21 MB of
  // GLB on shared CPUs is slow, allow plenty of time.
  try {
    await page.waitForFunction(() => window.__game.modelLoaded === true, { timeout: 300000 })
    check('models loaded (gondola + gondolier GLB)', true)
  } catch {
    check('models loaded (gondola + gondolier GLB)', false, 'timeout waiting for modelLoaded')
  }
  const boatChildren = await page.evaluate(() => window.__game.boatChildren)
  check('boat group has gondola + gondolier', boatChildren === 2, `children=${boatChildren}`)

  // Helper: take a proof screenshot (rendering on, wait for fresh frames).
  async function shot(name) {
    const f0 = await page.evaluate(() => window.__game.frames)
    await page.evaluate(() => window.__game.setRenderEnabled(true))
    await page.waitForFunction((prev) => window.__game.frames > prev + 1, f0, { timeout: 180000 })
    await page.screenshot({ path: `${shotsDir}/${name}`, timeout: 180000 })
    await page.evaluate(() => window.__game.setRenderEnabled(false))
  }

  // 2. level select: 5 cards, level 2 locked at start
  await shot('lantern-canal-3d-m2-select.png')
  const menuText = await page.textContent('#overlay')
  check('level select shows all 5 levels', ['LEVEL 1', 'LEVEL 2', 'LEVEL 3', 'LEVEL 4', 'LEVEL 5'].every((s) => menuText.includes(s)))
  const l2Locked = await page.$eval('[data-action="play"][data-level="1"]', (el) => el.disabled)
  check('level 2 locked before level 1 is finished', l2Locked === true)

  // From here: rendering OFF — game logic runs at full speed on the CPU.
  await page.evaluate(() => {
    window.__game.setRenderEnabled(false)
    window.__game.setTimeScale(8)
  })

  // 3. play level 1: start + movement + steering (condition-based waits)
  await page.click('[data-action="play"][data-level="0"]')
  await page.waitForTimeout(300)
  await page.keyboard.down('ArrowUp')
  await page.waitForFunction(() => window.__game.pos.z < -5 && window.__game.speed > 0.5, { timeout: 30000 })
  const st1 = await page.evaluate(() => ({ z: window.__game.pos.z, speed: window.__game.speed, started: window.__game.started }))
  await page.keyboard.up('ArrowUp')
  check('ArrowUp moves gondola forward', st1.z < -5 && st1.speed > 0.5, `z -> ${st1.z.toFixed(1)}, speed ${st1.speed.toFixed(1)}`)
  check('game started (overlay hidden)', st1.started === true)
  const x0 = (await page.evaluate(() => window.__game.pos)).x
  await page.keyboard.down('ArrowLeft')
  await page.waitForFunction((prev) => window.__game.pos.x < prev - 0.3, x0, { timeout: 30000 })
  await page.keyboard.up('ArrowLeft')
  const x1 = (await page.evaluate(() => window.__game.pos)).x
  check('ArrowLeft steers left', x1 < x0 - 0.3, `x ${x0.toFixed(2)} -> ${x1.toFixed(2)}`)
  await page.keyboard.down('ArrowRight')
  await page.waitForFunction((prev) => window.__game.pos.x > prev + 0.3, x1, { timeout: 30000 })
  await page.keyboard.up('ArrowRight')
  const x2 = (await page.evaluate(() => window.__game.pos)).x
  check('ArrowRight steers right', x2 > x1 + 0.3, `x ${x1.toFixed(2)} -> ${x2.toFixed(2)}`)

  // 4. finish level 1 (finish at -190)
  await page.evaluate(() => window.__game.warp(0, -186))
  await page.keyboard.down('ArrowUp')
  await page.waitForFunction(() => window.__game.finished === true, { timeout: 30000 })
  await page.keyboard.up('ArrowUp')
  const fin1 = await page.evaluate(() => ({ finished: window.__game.finished, stars: window.__game.stars }))
  const overlayText1 = await page.textContent('#overlay')
  check('level 1 finish shows LEVEL COMPLETE', fin1.finished === true && overlayText1.includes('LEVEL COMPLETE'), `finished=${fin1.finished}, stars=${fin1.stars}`)
  const prog1 = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern-canal-3d-progress-v1') || '{}'))
  check('progress saved: level 1 stars + level 2 unlocked', (prog1.stars?.['1'] || 0) >= 1 && (prog1.unlocked || 1) >= 2, JSON.stringify(prog1))

  // 5. next level -> level 2 intro, start it, screenshot mid-canal
  await page.click('[data-action="next"]')
  await page.waitForTimeout(300)
  const lvl2 = await page.evaluate(() => window.__game.level)
  check('Next Level loads level 2', lvl2 === 2, `level=${lvl2}`)
  await page.keyboard.down('ArrowUp')
  await page.waitForFunction(() => window.__game.started === true, { timeout: 30000 })
  await page.keyboard.up('ArrowUp')
  await shot('lantern-canal-3d-m2-level2-sailing.png')
  await page.evaluate(() => window.__game.setRenderEnabled(false))

  // 6. golden mask: warp right onto it (L2 mask at 5, -228)
  await page.evaluate(() => window.__game.warp(5, -227.2))
  await page.waitForFunction(() => window.__game.mask === true, { timeout: 30000 })
  const hudMask = await page.textContent('#hud-mask')
  check('golden mask collected', (await page.evaluate(() => window.__game.mask)) === true && hudMask.includes('✓'), `hud="${hudMask}"`)

  // 7. bricole bump: warp onto the obstacle at (0, -75)
  await page.evaluate(() => window.__game.warp(0, -75))
  await page.waitForFunction(() => window.__game.bumps >= 1, { timeout: 30000 })
  const bumps = await page.evaluate(() => window.__game.bumps)
  check('bricole bump registers', bumps >= 1, `bumps=${bumps}`)

  // 8. finish level 2 (L2 finish at -250)
  await page.evaluate(() => window.__game.warp(0, -247))
  await page.keyboard.down('ArrowUp')
  await page.waitForFunction(() => window.__game.finished === true, { timeout: 30000 })
  await page.keyboard.up('ArrowUp')
  const fin2 = await page.evaluate(() => ({ finished: window.__game.finished, stars: window.__game.stars }))
  const overlayText2 = await page.textContent('#overlay')
  check('level 2 finish shows LEVEL COMPLETE + stars', fin2.finished === true && overlayText2.includes('LEVEL COMPLETE') && fin2.stars >= 1, `finished=${fin2.finished}, stars=${fin2.stars}`)
  await shot('lantern-canal-3d-m2-level2-complete.png')
  await page.evaluate(() => window.__game.setRenderEnabled(false))

  // 9. mute toggle
  await page.click('#mute-btn')
  const muted1 = await page.evaluate(() => window.__game.muted)
  await page.click('#mute-btn')
  const muted2 = await page.evaluate(() => window.__game.muted)
  check('mute button toggles audio', muted1 === true && muted2 === false, `${muted1} -> ${muted2}`)

  // 10. back to level select: level 2 shows stars, level 3 unlocked
  await page.click('[data-action="menu"]')
  await page.waitForTimeout(300)
  const l2Stars = await page.$eval('[data-action="play"][data-level="1"]', (el) => el.textContent.includes('★'))
  const l3Unlocked = await page.$eval('[data-action="play"][data-level="2"]', (el) => !el.disabled)
  check('level select shows level 2 stars + level 3 unlocked', l2Stars === true && l3Unlocked === true)

  // 11. restart with R (start L3, then R)
  await page.click('[data-action="play"][data-level="2"]')
  await page.waitForTimeout(300)
  await page.keyboard.press('KeyR')
  await page.waitForTimeout(300)
  const rst = await page.evaluate(() => ({ coins: window.__game.coins, finished: window.__game.finished, z: window.__game.pos.z, level: window.__game.level }))
  check('R restarts the level', rst.coins === 0 && rst.finished === false && Math.abs(rst.z) < 0.01 && rst.level === 3, JSON.stringify(rst))

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  console.log('TEST CRASH: ' + String(e && e.message || e))
  if (errors.length) console.log('console errors: ' + errors.slice(0, 5).join(' | '))
} finally {
  if (browser) await browser.close()
  server.kill()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
