// Live verification: load the deployed GitHub Pages site in headless
// Chromium and confirm the game boots with no console errors.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const candidates = [
  process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
]
const executablePath = candidates.find(existsSync)
if (!executablePath) { console.log('NO_CHROMIUM_FOUND'); process.exit(2) }

const proxyUrl = new URL(process.env.https_proxy || process.env.HTTPS_PROXY || '')
const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  proxy: { server: proxyUrl.protocol + '//' + proxyUrl.host, username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password), bypass: 'localhost,127.0.0.1' },
})
const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`) })

await page.goto('https://tayoo-sol.github.io/lantern-canal-3d/', { waitUntil: 'domcontentloaded' })
try {
  await page.waitForFunction(() => window.__game && window.__game.modelLoaded === true, { timeout: 180000 })
  console.log('LIVE PASS: models loaded on the deployed site')
} catch {
  console.log('LIVE FAIL: models did not load within 180s')
}
const st = await page.evaluate(() => window.__game ? { children: window.__game.boatChildren, coins: window.__game.totalCoins } : null)
console.log('LIVE STATE:', JSON.stringify(st))
await page.waitForTimeout(2000)
await page.screenshot({ path: process.env.HOME + '/workspace/meshy-z-axis/lantern-canal-3d-m1-live.png' })
console.log('LIVE console/page errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
