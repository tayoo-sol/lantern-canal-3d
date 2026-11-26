// Debug probe: what loads, what fails, and what __game reports.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'

const PORT = 4181
const candidates = [
  process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
]
const executablePath = candidates.find(existsSync)
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: process.env.HOME + '/workspace/lantern-canal-3d',
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 3000))
const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 200)))
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText))
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()) })
await page.goto(`http://127.0.0.1:${PORT}/lantern-canal-3d/`, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(5000)
  const s = await page.evaluate(() => {
    if (!window.__game) return { game: false }
    return { game: true, modelLoaded: window.__game.modelLoaded, children: window.__game.boatChildren, loadingHidden: document.getElementById('loading').classList.contains('hidden') }
  })
  console.log(`t+${(i + 1) * 5}s`, JSON.stringify(s))
}
await browser.close()
server.kill()
