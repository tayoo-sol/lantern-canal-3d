import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// ---------------------------------------------------------------------------
// Lantern Canal 3D — Milestone 2: levels 1–5, golden masks, bricole hazards,
// Web Audio SFX + ambient music, level select with saved progress.
// Steer a gondola down a foggy Venetian canal at night, collect coins and
// the hidden golden mask, dodge the bricole posts, reach the finish gate.
// Controls: arrows / WASD steer+speed, R restart, P pause, M mute.
// ---------------------------------------------------------------------------

const CANAL_HALF_WIDTH = 7
const BOAT_LIMIT_X = 5.6
const BOAT_RADIUS = 0.9
const MAX_SPEED = 8
const ACCEL = 6
const BRAKE = 9

// --- level definitions: length, coin/mask/bricole layout, par time ---------
const LEVELS = [
  {
    name: 'First Light', length: 200, par: 35,
    coins: [[-3.0, -30], [3.5, -55], [-1.0, -80], [4.0, -105], [-4.0, -130], [0.0, -160]],
    bricole: [],
    mask: [-5.0, -170],
  },
  {
    name: 'The Long Canal', length: 260, par: 45,
    coins: [[-3.5, -35], [3.0, -60], [-1.0, -90], [4.5, -120], [-4.0, -150], [1.0, -180], [-2.5, -215], [3.5, -240]],
    bricole: [[0, -75], [3.5, -140], [-3, -200]],
    mask: [5.0, -228],
  },
  {
    name: 'Bricole Maze', length: 320, par: 55,
    coins: [[3.5, -40], [-3.0, -70], [0, -100], [-4.5, -130], [4.0, -160], [-1.5, -190], [3.0, -220], [-3.5, -250], [0.5, -285]],
    bricole: [[-2, -85], [3, -125], [0, -170], [-4, -215], [2.5, -260]],
    mask: [-5.2, -300],
  },
  {
    name: 'Mask of the Night', length: 380, par: 65,
    coins: [[-4, -45], [2, -75], [-1, -105], [4.5, -135], [-3.5, -165], [0, -195], [3.5, -225], [-4, -255], [1.5, -285], [-2, -320], [4, -350]],
    bricole: [[2, -90], [-3.5, -130], [0.5, -175], [4, -220], [-2, -265], [3, -310], [-4, -345]],
    mask: [5.2, -360],
  },
  {
    name: 'The Grand Canal', length: 440, par: 75,
    coins: [[3, -50], [-3.5, -80], [1, -110], [-4.5, -140], [4, -170], [-1, -200], [3.5, -230], [-4, -260], [0, -290], [4.5, -320], [-2.5, -350], [2, -380], [0, -410]],
    bricole: [[-2, -95], [3.5, -135], [0, -180], [-4, -225], [2, -270], [4.5, -315], [-3, -360], [1, -395], [-4.5, -420]],
    mask: [5.3, -405],
  },
]

// --- saved progress (plain web game, so localStorage is fine) ---------------
const PROGRESS_KEY = 'lantern-canal-3d-progress-v1'
let progress = { stars: {}, unlocked: 1 }
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object') {
        if (p.stars && typeof p.stars === 'object') progress.stars = p.stars
        if (typeof p.unlocked === 'number') progress.unlocked = Math.min(LEVELS.length, Math.max(1, p.unlocked))
      }
    }
  } catch { /* private mode etc — play without saving */ }
}
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)) } catch { /* ignore */ }
}
loadProgress()

// --- audio: synthesized Web Audio SFX + ambient music loop ------------------
const AudioSys = {
  ctx: null, master: null, musicGain: null, muted: false, musicOn: false,
  _noiseBuf: null,
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.muted ? 0 : 0.9
        this.master.connect(this.ctx.destination)
        this.musicGain = this.ctx.createGain()
        this.musicGain.gain.value = 0.14
        this.musicGain.connect(this.master)
        this.startMusic()
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch { /* audio is optional — never break the game */ }
  },
  _detune() { return 0.95 + Math.random() * 0.1 }, // ±5% pitch for repeated SFX
  tone(freq, { dur = 0.15, type = 'sine', vol = 0.2, delay = 0, slideTo = null } = {}) {
    if (!this.ctx || this.muted) return
    try {
      const t0 = this.ctx.currentTime + delay
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq * this._detune(), t0)
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur)
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
      o.connect(g).connect(this.master)
      o.start(t0)
      o.stop(t0 + dur + 0.05)
    } catch { /* ignore */ }
  },
  noiseBurst(dur = 0.15, vol = 0.25) {
    if (!this.ctx || this.muted) return
    try {
      if (!this._noiseBuf) {
        const len = Math.floor(this.ctx.sampleRate * 0.25)
        this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
        const d = this._noiseBuf.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      }
      const t0 = this.ctx.currentTime
      const src = this.ctx.createBufferSource()
      src.buffer = this._noiseBuf
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 420
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(vol, t0)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
      src.connect(f).connect(g).connect(this.master)
      src.start(t0)
      src.stop(t0 + dur + 0.02)
    } catch { /* ignore */ }
  },
  coin() { this.tone(659.25, { dur: 0.12, vol: 0.2 }); this.tone(987.77, { dur: 0.2, vol: 0.2, delay: 0.07 }) },
  mask() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, { dur: 0.22, vol: 0.18, delay: i * 0.09 })) },
  bump() { this.tone(120, { dur: 0.22, vol: 0.3, slideTo: 55 }); this.noiseBurst(0.12, 0.2) },
  finish() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, { dur: 0.28, vol: 0.18, delay: i * 0.1 })) },
  click() { this.tone(700, { dur: 0.05, vol: 0.08 }) },
  toggleMute() {
    this.muted = !this.muted
    try { if (this.master) this.master.gain.value = this.muted ? 0 : 0.9 } catch { /* ignore */ }
    return this.muted
  },
  startMusic() {
    if (this.musicOn || !this.ctx) return
    this.musicOn = true
    try {
      // Slow ambient pad: Am – F – C – G, one chord every 4s, plus a soft
      // pentatonic pluck. Quiet, always running.
      const chords = [
        [110.0, 261.63, 329.63],
        [87.31, 220.0, 261.63],
        [130.81, 164.81, 196.0],
        [98.0, 246.94, 293.66],
      ]
      const filt = this.ctx.createBiquadFilter()
      filt.type = 'lowpass'
      filt.frequency.value = 750
      const padGain = this.ctx.createGain()
      padGain.gain.value = 0
      filt.connect(padGain).connect(this.musicGain)
      const oscs = chords[0].map((f) => {
        const o = this.ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = f
        o.connect(filt)
        o.start()
        return o
      })
      padGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2)
      const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880]
      let chordIdx = 0
      setInterval(() => {
        if (!this.ctx || this.muted) return
        try {
          chordIdx = (chordIdx + 1) % chords.length
          const t = this.ctx.currentTime
          chords[chordIdx].forEach((f, i) => { oscs[i].frequency.linearRampToValueAtTime(f, t + 1.5) })
          if (Math.random() < 0.6) {
            const f = PENTA[Math.floor(Math.random() * PENTA.length)]
            const o = this.ctx.createOscillator()
            const g = this.ctx.createGain()
            o.type = 'sine'
            o.frequency.value = f
            g.gain.setValueAtTime(0, t)
            g.gain.linearRampToValueAtTime(0.16, t + 0.02)
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
            o.connect(g).connect(this.musicGain)
            o.start(t)
            o.stop(t + 0.8)
          }
        } catch { /* ignore */ }
      }, 4000)
    } catch { /* ignore */ }
  },
}

// --- DOM -----------------------------------------------------------------------
const app = document.getElementById('app')
const hudTitle = document.getElementById('hud-title')
const hudCoins = document.getElementById('hud-coins')
const hudMask = document.getElementById('hud-mask')
const hudTime = document.getElementById('hud-time')
const overlay = document.getElementById('overlay')
const loadingEl = document.getElementById('loading')
const muteBtn = document.getElementById('mute-btn')
const pauseBtn = document.getElementById('pause-btn')

// --- renderer / scene / camera ---------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0a1428)
scene.fog = new THREE.FogExp2(0x0a1428, 0.022)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400)
camera.position.set(0, 7.5, 12)

// --- lights (M2: ambient raised a little — M1 was too dark on small screens) ---
scene.add(new THREE.AmbientLight(0x3d4c6e, 1.55))
const moonLight = new THREE.DirectionalLight(0xbfd0ff, 1.0)
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

// --- lantern glow texture (shared, do NOT dispose) ------------------------------
function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255, 170, 60, 0.85)')
  grad.addColorStop(0.4, 'rgba(255, 150, 40, 0.28)')
  grad.addColorStop(1, 'rgba(255, 140, 30, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}
const glowTex = makeGlowTexture()

// --- sparkle particles (coin / mask bursts) --------------------------------------
const PARTICLE_COUNT = 240
const particleGeo = new THREE.BufferGeometry()
const particlePos = new Float32Array(PARTICLE_COUNT * 3)
const particles = []
for (let i = 0; i < PARTICLE_COUNT; i++) {
  particles.push({ life: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0 })
  particlePos[i * 3 + 1] = -999
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3))
const particlePoints = new THREE.Points(
  particleGeo,
  new THREE.PointsMaterial({ color: 0xffd76a, size: 0.28, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
)
particlePoints.frustumCulled = false
scene.add(particlePoints)
let particleCursor = 0
function spawnBurst(x, y, z, n = 26) {
  for (let k = 0; k < n; k++) {
    const p = particles[particleCursor]
    particleCursor = (particleCursor + 1) % PARTICLE_COUNT
    const a = Math.random() * Math.PI * 2
    const sp = 1.5 + Math.random() * 3
    p.x = x; p.y = y; p.z = z
    p.vx = Math.cos(a) * sp
    p.vy = 1.5 + Math.random() * 3
    p.vz = Math.sin(a) * sp
    p.life = 0.55 + Math.random() * 0.35
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = particles[i]
    if (p.life > 0) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.vy -= 4 * dt
      if (p.life <= 0) p.y = -999
    }
    particlePos[i * 3] = p.x
    particlePos[i * 3 + 1] = p.y
    particlePos[i * 3 + 2] = p.z
  }
  particleGeo.attributes.position.needsUpdate = true
}

// --- gondola + gondolier ----------------------------------------------------------
const boat = new THREE.Group()
scene.add(boat)
let gondolierGroup = null
let modelLoaded = false

function normalizeModel(obj, targetSize) {
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
  boat.add(normalizeModel(model, 3.4))
})
loadModel(`${import.meta.env.BASE_URL}assets/gondolier-hero.glb`, (model) => {
  const g = normalizeModel(model, 1.75)
  g.position.set(0, 0.42, 1.35) // standing at the stern
  gondolierGroup = g
  boat.add(g)
})

function rand(a, b) { return a + Math.random() * (b - a) }

// --- level world builder ---------------------------------------------------------
let world = null

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m.map && m.map !== glowTex) m.map.dispose()
        m.dispose()
      }
    }
  })
}

function makeLantern(g, x, z, withLight, lanternLights, lanternGlows) {
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
  // soft radial glow sprite — the "fog lifts" halo around each lantern
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
  glow.position.y = 3.55
  glow.scale.setScalar(3.2)
  g.add(glow)
  lanternGlows.push(glow)
  if (withLight) {
    const light = new THREE.PointLight(0xff9a2a, 34, 26, 2)
    light.position.y = 3.55
    g.add(light)
    lanternLights.push(light)
  }
  g.position.set(x, 1.0, z)
  return g
}

function makeMask(x, z) {
  // Stylized golden carnival mask: flattened gold ellipsoid + dark eyes + wings
  const g = new THREE.Group()
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.9, roughness: 0.2, emissive: 0x664400, emissiveIntensity: 0.6 })
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), gold)
  face.scale.set(1.5, 0.55, 0.35)
  g.add(face)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x140f06 })
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), eyeMat)
    eye.position.set(side * 0.34, 0.02, 0.16)
    eye.scale.set(1, 0.6, 0.5)
    g.add(eye)
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), gold)
    wing.position.set(side * 0.95, 0.1, 0)
    wing.rotation.z = side * -1.2
    g.add(wing)
  }
  g.position.set(x, 1.35, z)
  g.userData.baseY = 1.35
  g.userData.phase = 0.7
  return g
}

function buildLevel(idx) {
  const def = LEVELS[idx]
  const L = def.length
  const finishZ = -(L - 10)
  if (world) {
    scene.remove(world.group)
    disposeObject(world.group)
  }
  const group = new THREE.Group()

  // water
  const waterGeo = new THREE.PlaneGeometry(16, L + 40, 12, 100)
  waterGeo.rotateX(-Math.PI / 2)
  const waterBase = waterGeo.attributes.position.array.slice()
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({ color: 0x0d2b4d, roughness: 0.3, metalness: 0.55 }),
  )
  water.position.set(0, 0, -L / 2 + 10)
  group.add(water)

  // canal walls + quays
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.95 })
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, L + 40), stoneMat)
    wall.position.set(side * (CANAL_HALF_WIDTH + 0.5), 0.7, -L / 2 + 10)
    group.add(wall)
    const quay = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.0, L + 40),
      new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 1 }),
    )
    quay.position.set(side * (CANAL_HALF_WIDTH + 3), 0.5, -L / 2 + 10)
    group.add(quay)
  }

  // buildings with lit windows
  const buildingColors = [0x2e3a55, 0x3a2f45, 0x2f4545, 0x453a2c, 0x353a4a]
  const windowGeo = new THREE.PlaneGeometry(0.55, 0.75)
  const windowLitMat = new THREE.MeshBasicMaterial({ color: 0xffd27a })
  const windowDarkMat = new THREE.MeshBasicMaterial({ color: 0x11141c })
  for (let z = 8; z > -L - 10; z -= rand(13, 19)) {
    for (const side of [-1, 1]) {
      const w = rand(5, 8), h = rand(5, 13), d = rand(6, 10)
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: buildingColors[Math.floor(Math.random() * buildingColors.length)], roughness: 0.9 }),
      )
      b.position.set(side * (CANAL_HALF_WIDTH + 3 + w / 2 + 0.6), h / 2, z)
      group.add(b)
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
          group.add(win)
        }
      }
    }
  }

  // lanterns along the canal (every 30m, alternating sides, every other lit)
  const lanternLights = []
  const lanternGlows = []
  let li = 0
  for (let z = -20; z > -L + 10; z -= 30, li++) {
    const side = li % 2 === 0 ? -1 : 1
    const lg = new THREE.Group()
    makeLantern(lg, side * 6.2, z, li % 2 === 0, lanternLights, lanternGlows)
    group.add(lg)
  }

  // bricole posts: decorative clusters near the edges + real obstacles mid-canal
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3421, roughness: 1 })
  function bricoleCluster(x, z) {
    const cluster = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 6), postMat)
      p.position.set(x + rand(-0.3, 0.3), 0.8, z + rand(-0.3, 0.3))
      p.rotation.z = rand(-0.12, 0.12)
      cluster.add(p)
    }
    group.add(cluster)
  }
  for (let z = -45, side = -1; z > -(L - 20); z -= 50, side *= -1) {
    bricoleCluster(side * 5.8, z)
  }
  const obstacles = []
  for (const [x, z] of def.bricole) {
    bricoleCluster(x, z)
    obstacles.push({ x, z, r: 1.35 })
  }

  // coins
  const coinGeo = new THREE.TorusGeometry(0.55, 0.17, 10, 20)
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.85, roughness: 0.25, emissive: 0x664400, emissiveIntensity: 0.5 })
  const coins = def.coins.map(([x, z], i) => {
    const c = new THREE.Mesh(coinGeo, coinMat)
    c.position.set(x, 1.1, z)
    c.userData.baseY = 1.1
    c.userData.phase = i * 1.1
    group.add(c)
    return c
  })

  // hidden golden mask (1 per level, tucked near a wall)
  const mask = makeMask(def.mask[0], def.mask[1])
  group.add(mask)

  // finish gate
  {
    const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 5, 8)
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, postMat)
      p.position.set(side * 6.4, 2.5, finishZ)
      group.add(p)
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
    banner.position.set(0, 4.6, finishZ)
    group.add(banner)
  }

  scene.add(group)
  world = { group, def, finishZ, waterGeo, waterBase, coins, mask, obstacles, lanternLights, lanternGlows }
  return world
}

// --- game state + flow -----------------------------------------------------------
const keys = {}
let state = 'menu' // 'menu' | 'intro' | 'playing' | 'paused' | 'complete'
let levelIndex = 0
let speed = 0
let lateralVel = 0
let posX = 0
let posZ = 0
let coinsCollected = 0
let maskCollected = false
let elapsed = 0
let bumps = 0
let bumpCooldown = 0
let shake = 0
let lastStars = 0

function starsFor(coins, total, mask) {
  if (coins >= total && mask) return 3
  if (total > 0 && coins / total >= 0.75) return 2
  return 1
}

function updateHUD() {
  const def = LEVELS[levelIndex]
  hudTitle.textContent = `🏮 LANTERN CANAL 3D — L${levelIndex + 1} · ${def.name}`
  hudCoins.textContent = `🪙 ${coinsCollected} / ${world.coins.length}`
  hudMask.textContent = maskCollected ? '🎭 ✓' : '🎭 –'
  hudTime.textContent = `⏱ ${elapsed.toFixed(1)}s`
}

function showMenu() {
  state = 'menu'
  const cards = LEVELS.map((def, i) => {
    const locked = i + 1 > progress.unlocked
    const stars = progress.stars[i + 1] || 0
    const starRow = stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆'
    return `<button class="btn level-card" data-action="play" data-level="${i}" ${locked ? 'disabled' : ''}>
      <b>LEVEL ${i + 1}</b><br>${def.name}<br>
      <span class="stars">${starRow}</span><br>
      <span class="lock">${locked ? '🔒 Complete Level ' + i + ' to unlock' : 'Par ' + def.par + 's · ' + def.coins.length + ' coins · ' + def.bricole.length + ' bricole'}</span>
    </button>`
  }).join('')
  overlay.innerHTML = `
    <h1>LANTERN CANAL 3D</h1>
    <p class="intro">Steer your gondola down a foggy Venetian canal at night. Follow the lanterns, collect the coins, find the hidden golden mask, dodge the bricole posts, and reach the finish gate.</p>
    <div class="level-grid">${cards}</div>
    <p class="keys intro"><b>←</b> <b>→</b> or <b>A</b> <b>D</b> steer &nbsp;·&nbsp; <b>↑</b> <b>↓</b> or <b>W</b> <b>S</b> speed &nbsp;·&nbsp; <b>R</b> restart &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>M</b> mute</p>`
  overlay.classList.remove('hidden')
}

function startLevel(i) {
  levelIndex = i
  buildLevel(i)
  speed = 0
  lateralVel = 0
  posX = 0
  posZ = 0
  coinsCollected = 0
  maskCollected = false
  elapsed = 0
  bumps = 0
  bumpCooldown = 0
  shake = 0
  boat.position.set(0, 0, 0)
  boat.rotation.set(0, 0, 0)
  updateHUD()
  state = 'intro'
  const def = LEVELS[i]
  overlay.innerHTML = `
    <h1>LEVEL ${i + 1} — ${def.name.toUpperCase()}</h1>
    <p class="intro">Length ${def.length}m · ${def.coins.length} coins · 1 hidden golden mask · ${def.bricole.length} bricole clusters · Par ${def.par}s</p>
    <p class="keys intro"><b>←</b> <b>→</b> or <b>A</b> <b>D</b> steer &nbsp;·&nbsp; <b>↑</b> <b>↓</b> or <b>W</b> <b>S</b> speed &nbsp;·&nbsp; <b>R</b> restart &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>M</b> mute</p>
    <p id="overlay-status">Press ↑ to set off</p>`
  overlay.classList.remove('hidden')
}

function showComplete() {
  state = 'complete'
  const stars = starsFor(coinsCollected, world.coins.length, maskCollected)
  lastStars = stars
  const key = String(levelIndex + 1)
  if (!progress.stars[key] || progress.stars[key] < stars) progress.stars[key] = stars
  progress.unlocked = Math.min(LEVELS.length, Math.max(progress.unlocked, levelIndex + 2))
  saveProgress()
  const next = levelIndex + 1 < LEVELS.length
  overlay.innerHTML = `
    <h1>LEVEL COMPLETE!</h1>
    <p class="stars-big">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
    <p>Coins ${coinsCollected} / ${world.coins.length} &nbsp;·&nbsp; Golden mask ${maskCollected ? '🎭 found!' : '🎭 missed'}<br>
    Time ${elapsed.toFixed(1)}s &nbsp;·&nbsp; Par ${world.def.par}s &nbsp;·&nbsp; Bumps ${bumps}</p>
    <p>${next ? '<button class="btn" data-action="next">Next Level →</button>' : '<b>🏆 You finished all 5 levels!</b><br>'}
    <button class="btn" data-action="replay">↻ Replay</button>
    <button class="btn" data-action="menu">Level Select</button></p>`
  overlay.classList.remove('hidden')
  AudioSys.finish()
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused'
    overlay.innerHTML = `<h1>PAUSED</h1><p>Take a breath, gondolier.</p>
      <p><button class="btn" data-action="resume">▶ Resume</button>
      <button class="btn" data-action="replay">↻ Restart</button>
      <button class="btn" data-action="menu">Level Select</button></p>`
    overlay.classList.remove('hidden')
  } else if (state === 'paused') {
    state = 'playing'
    overlay.classList.add('hidden')
  }
}

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn || btn.disabled) return
  AudioSys.ensure()
  AudioSys.click()
  const a = btn.dataset.action
  if (a === 'play') startLevel(Number(btn.dataset.level))
  else if (a === 'next') startLevel(levelIndex + 1)
  else if (a === 'replay') startLevel(levelIndex)
  else if (a === 'menu') showMenu()
  else if (a === 'resume') togglePause()
})

muteBtn.addEventListener('click', () => {
  AudioSys.ensure()
  muteBtn.textContent = AudioSys.toggleMute() ? '🔇' : '🔊'
})
pauseBtn.addEventListener('click', () => {
  if (state === 'playing' || state === 'paused') togglePause()
})

window.addEventListener('keydown', (e) => {
  AudioSys.ensure()
  keys[e.code] = true
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
  if (e.code === 'KeyM') {
    muteBtn.textContent = AudioSys.toggleMute() ? '🔇' : '🔊'
    return
  }
  if (e.code === 'KeyP') {
    if (state === 'playing' || state === 'paused') togglePause()
    return
  }
  if (e.code === 'KeyR') {
    if (state !== 'menu') startLevel(levelIndex)
    return
  }
  if (state === 'intro' && (e.code === 'ArrowUp' || e.code === 'KeyW')) {
    state = 'playing'
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
let renderEnabled = true // debug/testing hook: skip renderer.render() to run game logic without GPU cost
let frames = 0 // frames completed (rendered or skipped) — heartbeat for tests

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale
  const t = clock.elapsedTime

  if (world) {
    // water waves (gentle, cheap)
    const wp = world.waterGeo.attributes.position
    for (let i = 0; i < wp.count; i++) {
      const x = world.waterBase[i * 3]
      const z = world.waterBase[i * 3 + 2]
      wp.array[i * 3 + 1] = Math.sin(x * 0.5 + t * 0.9) * 0.07 + Math.sin(z * 0.25 + t * 1.3) * 0.06
    }
    wp.needsUpdate = true

    // coins spin + bob
    for (const c of world.coins) {
      if (!c.visible) continue
      c.rotation.y = t * 1.6 + c.userData.phase
      c.position.y = c.userData.baseY + Math.sin(t * 2 + c.userData.phase) * 0.15
    }

    // golden mask spin + bob
    const m = world.mask
    if (m.visible) {
      m.rotation.y = t * 1.2
      m.position.y = m.userData.baseY + Math.sin(t * 1.8 + m.userData.phase) * 0.18
    }

    // lantern glow flicker (light + halo sprite)
    world.lanternLights.forEach((l, i) => { l.intensity = 32 + Math.sin(t * 3 + i * 2.1) * 5 })
    world.lanternGlows.forEach((g, i) => {
      const f = 0.5 + Math.sin(t * 3 + i * 2.1) * 0.12
      g.material.opacity = f
      g.scale.setScalar(3.0 + Math.sin(t * 2.2 + i) * 0.35)
    })
  }

  updateParticles(dt)

  if (state === 'playing') {
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
    elapsed += dt

    if (bumpCooldown > 0) bumpCooldown -= dt

    // coin collection
    for (const c of world.coins) {
      if (!c.visible) continue
      const dx = c.position.x - posX
      const dz = c.position.z - posZ
      if (dx * dx + dz * dz < 1.6 * 1.6) {
        c.visible = false
        coinsCollected++
        spawnBurst(c.position.x, 1.1, c.position.z, 22)
        AudioSys.coin()
        updateHUD()
      }
    }

    // golden mask collection
    const m = world.mask
    if (m.visible) {
      const dx = m.position.x - posX
      const dz = m.position.z - posZ
      if (dx * dx + dz * dz < 1.8 * 1.8) {
        m.visible = false
        maskCollected = true
        spawnBurst(m.position.x, 1.4, m.position.z, 40)
        AudioSys.mask()
        updateHUD()
      }
    }

    // bricole collision: slow down + bounce + shake + thud
    for (const o of world.obstacles) {
      const dx = posX - o.x
      const dz = posZ - o.z
      const rr = o.r + BOAT_RADIUS
      if (dx * dx + dz * dz < rr * rr && bumpCooldown <= 0) {
        bumps++
        bumpCooldown = 0.9
        shake = 0.7
        speed *= 0.35
        posZ = Math.min(posZ + 1.5, 0)
        lateralVel = (dx >= 0 ? 1 : -1) * 5
        AudioSys.bump()
      }
    }

    if (posZ <= world.finishZ) {
      showComplete()
      updateHUD()
    }
  }

  // boat transform: bob + lean into steering; gondolier rows gently
  boat.position.set(posX, Math.sin(t * 1.8) * 0.05, posZ)
  boat.rotation.y = -lateralVel * 0.07
  boat.rotation.z = lateralVel * 0.02
  if (gondolierGroup) {
    gondolierGroup.rotation.z = Math.sin(t * 1.6) * 0.06 - lateralVel * 0.015
    gondolierGroup.rotation.x = Math.sin(t * 1.6 + 1.2) * 0.03
  }

  // chase camera (+ bump shake)
  let shakeX = 0
  let shakeY = 0
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.8)
    shakeX = (Math.random() - 0.5) * shake * 0.7
    shakeY = (Math.random() - 0.5) * shake * 0.5
  }
  camPos.set(posX * 0.6 + shakeX, 7.5 + shakeY, posZ + 11.5)
  camera.position.lerp(camPos, 1 - Math.pow(0.001, dt))
  camTarget.set(posX * 0.85, 1.2, posZ - 9)
  camera.lookAt(camTarget)

  if (state === 'playing') hudTime.textContent = `⏱ ${elapsed.toFixed(1)}s`

  if (renderEnabled) renderer.render(scene, camera)
  frames++
}

// test/debug handle (used by the automated smoke test)
window.__game = {
  get coins() { return coinsCollected },
  get totalCoins() { return world ? world.coins.length : 0 },
  get mask() { return maskCollected },
  get finished() { return state === 'complete' },
  get started() { return state === 'playing' },
  get state() { return state },
  get level() { return levelIndex + 1 },
  get stars() { return lastStars },
  get bumps() { return bumps },
  get muted() { return AudioSys.muted },
  get progress() { return JSON.parse(JSON.stringify(progress)) },
  get pos() { return { x: posX, z: posZ } },
  get speed() { return speed },
  get modelLoaded() { return modelLoaded },
  get boatChildren() { return boat.children.length },
  warp(x, z) { posX = x; posZ = z },
  setTimeScale(v) { timeScale = v },
  setRenderEnabled(v) { renderEnabled = !!v },
  setPixelRatio(v) {
    renderer.setPixelRatio(v)
    renderer.setSize(window.innerWidth, window.innerHeight)
  },
  get frames() { return frames },
  reset: () => startLevel(levelIndex),
  playLevel(i) { startLevel(i) },
  toggleMute() {
    const m = AudioSys.toggleMute()
    muteBtn.textContent = m ? '🔇' : '🔊'
    return m
  },
}

buildLevel(0)
updateHUD()
showMenu()
animate()
