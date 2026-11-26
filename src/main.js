import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// ---------------------------------------------------------------------------
// Lantern Canal 3D — Milestone 1: one playable level
// Steer a gondola down a foggy Venetian canal at night, collect coins,
// reach the finish gate. Controls: arrows / WASD, R to restart.
// ---------------------------------------------------------------------------

const CANAL_HALF_WIDTH = 7
const BOAT_LIMIT_X = 5.6
const LEVEL_LENGTH = 200
const FINISH_Z = -190
const COIN_POSITIONS = [
  [-3.0, -30], [3.5, -55], [-1.0, -80], [4.0, -105], [-4.0, -130], [0.0, -160],
]
const MAX_SPEED = 8
const ACCEL = 6
const BRAKE = 9

const app = document.getElementById('app')
const hudCoins = document.getElementById('hud-coins')
const hudTime = document.getElementById('hud-time')
const overlay = document.getElementById('overlay')
const overlayStatus = document.getElementById('overlay-status')
const loadingEl = document.getElementById('loading')

// --- renderer / scene / camera ---------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0a1428)
scene.fog = new THREE.FogExp2(0x0a1428, 0.022)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400)
camera.position.set(0, 7.5, 12)

// --- lights ------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x33415e, 1.1))
const moonLight = new THREE.DirectionalLight(0xbfd0ff, 0.7)
moonLight.position.set(-30, 40, -60)
scene.add(moonLight)

// --- sky: stars + moon -------------------------------------------------------
{
  const starGeo = new THREE.BufferGeometry()
  const starPos = []
  for (let i = 0; i < 350; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 120 + Math.random() * 120
    starPos.push(Math.cos(a) * r, 25 + Math.random() * 90, -Math.abs(Math.sin(a)) * r - 20)
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 0.9, fog: false })))
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf5, fog: false }),
  )
  moon.position.set(-42, 40, -170)
  moon.lookAt(camera.position)
  scene.add(moon)
}

// --- water -------------------------------------------------------------------
const waterGeo = new THREE.PlaneGeometry(16, LEVEL_LENGTH + 40, 12, 100)
waterGeo.rotateX(-Math.PI / 2)
const waterBase = waterGeo.attributes.position.array.slice()
const water = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({ color: 0x0d2b4d, roughness: 0.3, metalness: 0.55 }),
)
water.position.set(0, 0, -LEVEL_LENGTH / 2 + 10)
scene.add(water)

// --- canal walls + quays ------------------------------------------------------
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.95 })
for (const side of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, LEVEL_LENGTH + 40), stoneMat)
  wall.position.set(side * (CANAL_HALF_WIDTH + 0.5), 0.7, -LEVEL_LENGTH / 2 + 10)
  scene.add(wall)
  const quay = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.0, LEVEL_LENGTH + 40),
    new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 1 }),
  )
  quay.position.set(side * (CANAL_HALF_WIDTH + 3), 0.5, -LEVEL_LENGTH / 2 + 10)
  scene.add(quay)
}

// --- buildings with lit windows ----------------------------------------------
const buildingColors = [0x1a2233, 0x241d2b, 0x1d2b2b, 0x2b2118, 0x20242e]
const windowGeo = new THREE.PlaneGeometry(0.55, 0.75)
const windowLitMat = new THREE.MeshBasicMaterial({ color: 0xffd27a })
const windowDarkMat = new THREE.MeshBasicMaterial({ color: 0x11141c })
function rand(a, b) { return a + Math.random() * (b - a) }
for (let z = 8; z > -LEVEL_LENGTH - 10; z -= rand(13, 19)) {
  for (const side of [-1, 1]) {
    const w = rand(5, 8), h = rand(5, 13), d = rand(6, 10)
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: buildingColors[Math.floor(Math.random() * buildingColors.length)], roughness: 0.9 }),
    )
    b.position.set(side * (CANAL_HALF_WIDTH + 3 + w / 2 + 0.6), h / 2, z)
    scene.add(b)
    // windows on the canal-facing side
    const rows = Math.floor(h / 3)
    const cols = Math.floor(w / 2.2)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.45) continue
        const win = new THREE.Mesh(windowGeo, Math.random() < 0.55 ? windowLitMat : windowDarkMat)
        win.position.set(
          side * (CANAL_HALF_WIDTH + 3 + 0.6 + 0.06),
          2 + r * 3,
          z - w / 2 + 1.1 + c * 2.2 + rand(-0.3, 0.3),
        )
        win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
        scene.add(win)
      }
    }
  }
}

// --- procedural lanterns (hero lantern GLB comes later) ----------------------
const lanternLights = []
function makeLantern(x, z, withLight) {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.7 }),
  )
  pole.position.y = 1.7
  g.add(pole)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xff9a2a, emissive: 0xff8c1a, emissiveIntensity: 2.4 }),
  )
  bulb.position.y = 3.55
  g.add(bulb)
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.7 }),
  )
  cap.position.y = 3.95
  g.add(cap)
  if (withLight) {
    const light = new THREE.PointLight(0xff9a2a, 30, 20, 2)
    light.position.y = 3.55
    g.add(light)
    lanternLights.push(light)
  }
  g.position.set(x, 1.0, z)
  scene.add(g)
  return g
}
const lanternSpots = [[-6.2, -20, true], [6.2, -50, false], [-6.2, -80, true], [6.2, -110, false], [-6.2, -140, true], [6.2, -170, false]]
for (const [x, z, lit] of lanternSpots) makeLantern(x, z, lit)

// --- bricole posts (visual markers in the water, near the edges) --------------
const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3421, roughness: 1 })
for (const [x, z] of [[-5.8, -45], [5.8, -95], [-5.8, -145], [5.8, -175]]) {
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 6), postMat)
    p.position.set(x + rand(-0.3, 0.3), 0.8, z + rand(-0.3, 0.3))
    p.rotation.z = rand(-0.12, 0.12)
    scene.add(p)
  }
}

// --- coins ---------------------------------------------------------------------
const coinGeo = new THREE.TorusGeometry(0.55, 0.17, 10, 20)
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.85, roughness: 0.25, emissive: 0x664400, emissiveIntensity: 0.5 })
const coins = COIN_POSITIONS.map(([x, z], i) => {
  const c = new THREE.Mesh(coinGeo, coinMat)
  c.position.set(x, 1.1, z)
  c.userData.baseY = 1.1
  c.userData.phase = i * 1.1
  scene.add(c)
  return c
})

// --- finish gate ---------------------------------------------------------------
{
  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 5, 8)
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, postMat)
    p.position.set(side * 6.4, 2.5, FINISH_Z)
    scene.add(p)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1a1206'
  ctx.fillRect(0, 0, 512, 96)
  ctx.fillStyle = '#ffd76a'
  ctx.font = 'bold 56px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('★ FINISH ★', 256, 52)
  const tex = new THREE.CanvasTexture(canvas)
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(12.8, 2.4),
    new THREE.MeshBasicMaterial({ map: tex }),
  )
  banner.position.set(0, 4.6, FINISH_Z)
  scene.add(banner)
}

// --- gondola + gondolier --------------------------------------------------------
const boat = new THREE.Group()
scene.add(boat)
let modelLoaded = false

function normalizeModel(obj, targetSize) {
  // Rotate so the longest horizontal axis lies along Z (forward), then scale
  // the model so its longest dimension is targetSize, centred on the group
  // origin with its base at y = 0.
  let box = new THREE.Box3().setFromObject(obj)
  const size = new THREE.Vector3()
  box.getSize(size)
  if (size.x > size.z) obj.rotation.y = Math.PI / 2
  box = new THREE.Box3().setFromObject(obj)
  box.getSize(size)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale = targetSize / maxDim
  obj.scale.setScalar(scale)
  obj.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
  const group = new THREE.Group()
  group.add(obj)
  return group
}

const manager = new THREE.LoadingManager()
manager.onLoad = () => {
  loadingEl.classList.add('hidden')
  modelLoaded = true
}
manager.onError = () => {
  loadingEl.classList.add('hidden')
}
const loader = new GLTFLoader(manager)

function loadModel(url, onLoad) {
  loader.load(
    url,
    (gltf) => onLoad(gltf.scene),
    undefined,
    () => {
      // Fallback: simple proxy boat so the level stays playable
      const proxy = new THREE.Group()
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.5, 3.4),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.4 }),
      )
      hull.position.y = 0.25
      proxy.add(hull)
      onLoad(proxy)
    },
  )
}

loadModel(`${import.meta.env.BASE_URL}assets/gondola-hero.glb`, (model) => {
  const g = normalizeModel(model, 3.4)
  boat.add(g)
})
loadModel(`${import.meta.env.BASE_URL}assets/gondolier-hero.glb`, (model) => {
  const g = normalizeModel(model, 1.75)
  g.position.set(0, 0.42, 1.35) // standing at the stern
  boat.add(g)
})

// --- game state ------------------------------------------------------------------
const keys = {}
let speed = 0
let lateralVel = 0
let posX = 0
let posZ = 0
let coinsCollected = 0
let elapsed = 0
let started = false
let finished = false

function resetLevel() {
  posX = 0
  posZ = 0
  speed = 0
  lateralVel = 0
  coinsCollected = 0
  elapsed = 0
  started = false
  finished = false
  for (const c of coins) c.visible = true
  hudCoins.textContent = `🪙 0 / ${coins.length}`
  hudTime.textContent = '⏱ 0.0s'
  overlay.classList.remove('hidden')
  overlay.querySelector('h1').textContent = 'LANTERN CANAL 3D'
  overlay.querySelectorAll('.intro').forEach((el) => { el.style.display = '' })
  overlayStatus.textContent = 'Press ↑ to set off'
  boat.position.set(0, 0, 0)
  boat.rotation.set(0, 0, 0)
}

window.addEventListener('keydown', (e) => {
  keys[e.code] = true
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
  if (e.code === 'KeyR') resetLevel()
  if (!started && (e.code === 'ArrowUp' || e.code === 'KeyW')) {
    started = true
    overlay.classList.add('hidden')
  }
})
window.addEventListener('keyup', (e) => { keys[e.code] = false })

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// --- main loop -------------------------------------------------------------------
const clock = new THREE.Clock()
const camTarget = new THREE.Vector3()
const camPos = new THREE.Vector3()
let timeScale = 1 // debug/testing hook (default 1 = real time)

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale
  const t = clock.elapsedTime

  // water waves (gentle, cheap)
  const wp = waterGeo.attributes.position
  for (let i = 0; i < wp.count; i++) {
    const x = waterBase[i * 3]
    const z = waterBase[i * 3 + 2]
    wp.array[i * 3 + 1] = Math.sin(x * 0.5 + t * 0.9) * 0.07 + Math.sin(z * 0.25 + t * 1.3) * 0.06
  }
  wp.needsUpdate = true

  // coins spin + bob
  for (const c of coins) {
    if (!c.visible) continue
    c.rotation.y = t * 1.6 + c.userData.phase
    c.position.y = c.userData.baseY + Math.sin(t * 2 + c.userData.phase) * 0.15
  }

  // lantern glow flicker
  lanternLights.forEach((l, i) => { l.intensity = 28 + Math.sin(t * 3 + i * 2.1) * 4 })

  if (!finished) {
    const up = keys.ArrowUp || keys.KeyW
    const down = keys.ArrowDown || keys.KeyS
    const left = keys.ArrowLeft || keys.KeyA
    const right = keys.ArrowRight || keys.KeyD

    if (up) speed = Math.min(speed + ACCEL * dt, MAX_SPEED)
    else if (down) speed = Math.max(speed - BRAKE * dt, 0)
    else speed = Math.max(speed - 1.2 * dt, 0) // gentle drag

    const steer = (left ? -1 : 0) + (right ? 1 : 0)
    lateralVel += steer * 14 * dt
    lateralVel *= Math.pow(0.12, dt) // damp
    posX += lateralVel * dt
    if (posX > BOAT_LIMIT_X) { posX = BOAT_LIMIT_X; lateralVel *= -0.3 }
    if (posX < -BOAT_LIMIT_X) { posX = -BOAT_LIMIT_X; lateralVel *= -0.3 }

    posZ -= speed * dt
    if (started) elapsed += dt

    // coin collection
    for (const c of coins) {
      if (!c.visible) continue
      const dx = c.position.x - posX
      const dz = c.position.z - posZ
      if (dx * dx + dz * dz < 1.6 * 1.6) {
        c.visible = false
        coinsCollected++
        hudCoins.textContent = `🪙 ${coinsCollected} / ${coins.length}`
      }
    }

    if (posZ <= FINISH_Z) {
      finished = true
      const stars = coinsCollected >= coins.length ? 3 : coinsCollected >= 4 ? 2 : 1
      overlay.querySelector('h1').textContent = 'LEVEL COMPLETE!'
      overlay.querySelectorAll('.intro').forEach((el) => { el.style.display = 'none' })
      overlayStatus.innerHTML = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}<br>Coins ${coinsCollected} / ${coins.length} &nbsp;·&nbsp; Time ${elapsed.toFixed(1)}s<br>Press R to play again`
      overlay.classList.remove('hidden')
    }
  }

  // boat transform: bob + lean into steering
  boat.position.set(posX, Math.sin(t * 1.8) * 0.05, posZ)
  boat.rotation.y = -lateralVel * 0.07
  boat.rotation.z = lateralVel * 0.02

  // chase camera
  camPos.set(posX * 0.6, 7.5, posZ + 11.5)
  camera.position.lerp(camPos, 1 - Math.pow(0.001, dt))
  camTarget.set(posX * 0.85, 1.2, posZ - 9)
  camera.lookAt(camTarget)

  if (started && !finished) hudTime.textContent = `⏱ ${elapsed.toFixed(1)}s`

  renderer.render(scene, camera)
}

// test/debug handle (used by the automated smoke test)
window.__game = {
  get coins() { return coinsCollected },
  get totalCoins() { return coins.length },
  get finished() { return finished },
  get started() { return started },
  get pos() { return { x: posX, z: posZ } },
  get speed() { return speed },
  get modelLoaded() { return modelLoaded },
  get boatChildren() { return boat.children.length },
  warp(x, z) { posX = x; posZ = z; },
  setTimeScale(v) { timeScale = v; },
  reset: resetLevel,
}

resetLevel()
animate()
