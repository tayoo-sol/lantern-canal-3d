// Smoke test for Lantern Canal 3D (milestone 1).
// Serves docs/ on localhost, opens it in headless Chromium (SwiftShader),
// and checks: no console/page errors, both hero GLBs load, keyboard steering
// moves the gondola, coins can be collected, finish shows LEVEL COMPLETE.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = process.env.HOME + '/workspace/meshy-z-axis'
const PORT = 4180

const candidates = [
  process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
]
const executablePath = candidates.find(existsSync)
if (!executablePath) { console.log('NO_CHROMIUM_FOUND'); process.exit(2) }

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
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
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`http://127.0.0.1:${PORT}/lantern-canal-3d/`, { waitUntil: 'domcontentloaded' })

  // 1. wait for both hero GLBs to load (or fallback) — up to 120s
  try {
    await page.waitForFunction(() => window.__game && window.__game.modelLoaded === true, { timeout: 120000 })
    check('models loaded (gondola + gondolier GLB)', true)
  } catch {
    check('models loaded (gondola + gondolier GLB)', false, 'timeout waiting for modelLoaded')
  }
  const boatChildren = await page.evaluate(() => window.__game.boatChildren)
  check('boat group has gondola + gondolier', boatChildren === 2, `children=${boatChildren}`)
  // Software rendering here runs ~1 FPS, so speed up game time for the
  // input checks (real players on a GPU run at timeScale 1).
  await page.evaluate(() => window.__game.setTimeScale(8))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${shotsDir}/lantern-canal-3d-m1-start.png` })

  // 2. keyboard: hold Up, boat must move forward and gain speed
  const z0 = (await page.evaluate(() => window.__game.pos)).z
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(4000)
  const st1 = await page.evaluate(() => ({ z: window.__game.pos.z, speed: window.__game.speed, started: window.__game.started }))
  await page.keyboard.up('ArrowUp')
  check('ArrowUp moves gondola forward', st1.z < z0 - 0.5 && st1.speed > 0.5, `z ${z0.toFixed(1)} -> ${st1.z.toFixed(1)}, speed ${st1.speed.toFixed(1)}`)
  check('game started (overlay hidden)', st1.started === true)

  // 3. steering: hold Left, x must decrease; then Right, x must increase
  const x0 = (await page.evaluate(() => window.__game.pos)).x
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(2500)
  await page.keyboard.up('ArrowLeft')
  const x1 = (await page.evaluate(() => window.__game.pos)).x
  check('ArrowLeft steers left', x1 < x0 - 0.3, `x ${x0.toFixed(2)} -> ${x1.toFixed(2)}`)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(2500)
  await page.keyboard.up('ArrowRight')
  const x2 = (await page.evaluate(() => window.__game.pos)).x
  check('ArrowRight steers right', x2 > x1 + 0.3, `x ${x1.toFixed(2)} -> ${x2.toFixed(2)}`)
  await page.screenshot({ path: `${shotsDir}/lantern-canal-3d-m1-sailing.png` })

  // 4. coin collection: warp next to the coin at (-1,-80) and drive through it
  const coinsBefore = await page.evaluate(() => window.__game.coins)
  await page.evaluate(() => window.__game.warp(-1, -76))
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(3500)
  await page.keyboard.up('ArrowUp')
  const coinsAfter = await page.evaluate(() => window.__game.coins)
  check('coin collected when sailing through it', coinsAfter > coinsBefore, `${coinsBefore} -> ${coinsAfter}`)

  // 5. finish: warp just before the gate and drive through
  await page.evaluate(() => window.__game.warp(0, -186))
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(5000)
  await page.keyboard.up('ArrowUp')
  const fin = await page.evaluate(() => ({ finished: window.__game.finished }))
  const overlayText = await page.textContent('#overlay')
  check('finish shows LEVEL COMPLETE', fin.finished === true && overlayText.includes('LEVEL COMPLETE'), `finished=${fin.finished}`)
  await page.screenshot({ path: `${shotsDir}/lantern-canal-3d-m1-complete.png` })

  // 6. restart with R
  await page.keyboard.press('KeyR')
  await page.waitForTimeout(500)
  const rst = await page.evaluate(() => ({ coins: window.__game.coins, finished: window.__game.finished, z: window.__game.pos.z }))
  check('R restarts the level', rst.coins === 0 && rst.finished === false && Math.abs(rst.z) < 0.01, JSON.stringify(rst))

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
