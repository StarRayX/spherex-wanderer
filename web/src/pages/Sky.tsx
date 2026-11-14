import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageProps } from '../lib/router'
import { STATUS_LABEL, TARGETS, imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { axisWords, decDms, fmt, lightYears, raHms, totalDrift, yearsPerMoon } from '../lib/format'
import Viewer from '../components/Viewer'
import { Logo } from '../components/Logo'
import './Sky.css'

// The 300 fastest-moving stars in Gaia DR3 (pipeline/scripts/fetch_fast_movers.py), positions at epoch 2016.0.
// They are drawn as faint dots at their SPHEREx-era position; the five test targets stay the prominent layer.
interface FastFile { epoch: number; fields: string[]; rows: [string, number, number, number, number, number, number, number | null][] }
interface FastStar { name: string; ra: number; dec: number; pmra: number; pmdec: number; parallax: number }
const FAST_EPOCH = 2026.0 // SPHEREx's all-sky survey, which began in 2025
const COINCIDE_DEG = 1 / 60 // a fast mover within 1 arcmin of a test target is that target; skip it

// The sky page follows LAMBAT's map page: the map fills the screen and the column is a stack of floating
// cards on the left (a bottom section on phones). Imagery is HiPS tiles. CDS publishes SPHEREx QR2 as an
// all-sky colour map; each layer lists hosts in order of preference and the first whose all-sky preview loads
// wins, so an outage falls back to a mirror instead of a black canvas.
interface Host { url: string; name: string; probe: string; credit: string }
const LAYERS: { key: 'ir' | 'vis'; label: string; hosts: Host[] }[] = [
  { key: 'ir', label: 'Infrared', hosts: [
    { url: 'https://alasky.cds.unistra.fr/SPHEREx/color', name: 'SPHEREx', probe: '/Norder3/Allsky.png', credit: 'SPHEREx QR2 colour (NASA/JPL-Caltech, IRSA; HiPS by CDS)' },
    { url: 'https://alaskybis.cds.unistra.fr/SPHEREx/color', name: 'SPHEREx', probe: '/Norder3/Allsky.png', credit: 'SPHEREx QR2 colour (NASA/JPL-Caltech, IRSA; HiPS by CDS)' },
    { url: 'https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color', name: '2MASS', probe: '/Norder3/Allsky.jpg', credit: '2MASS colour (UMass/IPAC-Caltech; HiPS by CDS, mirrored by IRSA)' },
  ] },
  // DSS2 is stitched from about 900 photographic plates with different exposures, so zoomed out its plate edges
  // show as a checkerboard. Mellinger is a smooth all-sky mosaic but low resolution, so it is used only when wide.
  { key: 'vis', label: 'Visible light', hosts: [
    { url: 'https://casda.csiro.au/hips/DSS2/color', name: 'DSS2', probe: '/Norder3/Allsky.jpg', credit: 'DSS2 colour (STScI/AURA; HiPS by CDS, mirrored by CSIRO)' },
    { url: 'https://alasky.cds.unistra.fr/DSS/DSSColor', name: 'DSS2', probe: '/Norder3/Allsky.jpg', credit: 'DSS2 colour (STScI/AURA; HiPS by CDS)' },
  ] },
]

function probe(h: Host, ms = 8000) {
  return new Promise<boolean>(resolve => {
    const img = new Image()
    const t = setTimeout(() => { img.src = ''; resolve(false) }, ms)
    img.onload = () => { clearTimeout(t); resolve(true) }
    img.onerror = () => { clearTimeout(t); resolve(false) }
    img.src = h.url + h.probe
  })
}
// Visible light when zoomed out (wider than WIDE_FOV degrees): Mellinger, if CDS answers.
const MELLINGER: Host[] = [
  { url: 'https://alasky.cds.unistra.fr/MellingerRGB', name: 'Mellinger', probe: '/Norder3/Allsky.jpg', credit: 'Mellinger colour optical survey (Axel Mellinger; HiPS by CDS)' },
  { url: 'https://alaskybis.cds.unistra.fr/MellingerRGB', name: 'Mellinger', probe: '/Norder3/Allsky.jpg', credit: 'Mellinger colour optical survey (Axel Mellinger; HiPS by CDS)' },
]
const WIDE_FOV = 15
const DSS2_CUTS: [number, number] = [20, 230]

// Apply per-survey colour cuts after a survey change (the new base layer is created by setImageSurvey).
function tune(v: AladinView, url: string) {
  const fix = () => {
    const layer = (v as any).getBaseImageLayer?.()
    if (!layer?.setCuts) return
    if (url.includes('DSS2') || url.includes('DSSColor')) layer.setCuts(...DSS2_CUTS)
  }
  fix()
  setTimeout(fix, 300)
}

// Probe every host at once and report the most preferred one that has answered so far, each time that changes.
// A fast mirror is used straight away and a preferred host that answers later takes over. A dead or hanging
// server no longer holds the map up (before, an answer was only used once every host listed before it had
// failed, so one hung mirror cost the full 5 s timeout). Resolves with the final best, null if none answered.
function pick(hosts: Host[], onBest?: (h: Host) => void) {
  return new Promise<Host | null>(resolve => {
    let best = -1, n = 0
    hosts.forEach((h, i) => void probe(h, 5000).then(r => {
      if (r && (best < 0 || i < best)) { best = i; onBest?.(h) }
      if (++n === hosts.length) resolve(best >= 0 ? hosts[best] : null)
    }))
  })
}
// The host that answered best last visit: the map opens on it without waiting for the probes.
const HOST_KEY = 'sky.host.ir'
const rememberedIr = (): Host | null => {
  try { const u = localStorage.getItem(HOST_KEY); return LAYERS[0].hosts.find(h => h.url === u) ?? null } catch { return null }
}
const rememberIr = (h: Host) => { try { localStorage.setItem(HOST_KEY, h.url) } catch { /* not kept */ } }
const SLOW_MS = 6000 // no survey server answered by now: show the note with a Retry button
const COL_KEY = 'sky.panel.collapsed'
type Res = { ir?: Host | null; vis?: Host | null; mel?: Host | null } // undefined: still probing; null: none answered

// Where a star is in a given year, from Gaia's position and drift (proper motion only; parallax is under 1").
function at(a: { ra: number; dec: number; pmra: number; pmdec: number; epoch_from: number }, year: number): [number, number] {
  const k = 1 / Math.cos((a.dec * Math.PI) / 180), yrs = year - a.epoch_from
  return [a.ra + ((a.pmra / 1000) * yrs / 3600) * k, a.dec + (a.pmdec / 1000) * yrs / 3600]
}
const yearOf = (mjd: number) => 2000 + (mjd - 51544.5) / 365.25
const midYear = (m: Meta) => yearOf((m.visits[0].mjd + m.visits[m.visits.length - 1].mjd) / 2)
const THEN = 1999 // the 2MASS sky survey ran 1997 to 2001
const nowYear = (m: Meta) => yearOf(m.visits[m.visits.length - 1].mjd) // the latest SPHEREx visit: what "now" means on the map
const TILES_CAP_MS = 12000 // never leave the "loading sky images" pill up longer than this
const GLIDE_MS = 4000
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// The sky map draws on a canvas, so it reads the accent colour from the CSS tokens at start-up.
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() || '#00B8D9'

// The accent colour at low opacity, for the faint fast-mover dots.
function faint(alpha: number) {
  const hex = accent().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(0,184,217,${alpha})`
  const n = parseInt(hex, 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`
}

// Aladin draws a selected catalogue source in its selectionColor (green by default); transparent turns that off.
const NO_RING = 'rgba(0,0,0,0)'

// Stereographic projection: the view from the centre of the sky sphere, like a skybox camera. Capped at 100
// degrees across, about a normal camera's field; wider than that the edges stretch as you pan.
const WHOLE_SKY_FOV = 100
const TARGET_FOV = 0.25

// A catalogue shape that draws a source's name as its own label and keeps it inside the canvas: on the right of
// the marker by default, flipped to the left near the right edge, and cut with an ellipsis if neither side fits.
// Label boxes already drawn this frame. Sources draw back to back within a few ms, so a gap since the last draw
// call marks a new frame and clears the list. `priority` labels (the picked star's) are always drawn.
let drawn: [number, number, number, number][] = []
let lastDraw = 0
const hits = (b: [number, number, number, number]) => drawn.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
function labelShape(ring: boolean, font: string, colour: string, offset: number, priority = false) {
  return (s: any, ctx: CanvasRenderingContext2D) => {
    const x = s.x, y = s.y, text = String(s.data?.name ?? '')
    const W = ctx.canvas.clientWidth || ctx.canvas.width
    const now = performance.now()
    if (now - lastDraw > 6) drawn = []
    lastDraw = now
    ctx.save()
    if (ring) {
      ctx.strokeStyle = accent(); ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 2 * Math.PI); ctx.stroke()
    }
    ctx.font = font; ctx.textBaseline = 'middle'
    let label = text, left = false
    if (x + offset + ctx.measureText(label).width > W - 8) {
      if (x - offset - ctx.measureText(label).width >= 8) left = true
      else {
        left = x > W / 2
        const avail = Math.max(24, left ? x - offset - 8 : W - x - offset - 8)
        while (label.length > 3 && ctx.measureText(label + '…').width > avail) label = label.slice(0, -1)
        label = label.trimEnd() + '…'
      }
    }
    const box = (l: boolean): [number, number, number, number] => {
      const w = ctx.measureText(label).width, lx = l ? x - offset : x + offset
      return [l ? lx - w : lx, y - 9, l ? lx : lx + w, y + 9]
    }
    let b = box(left)
    if (!priority && hits(b)) {
      const other = box(!left)
      const fits = other[0] >= 8 && other[2] <= W - 8
      if (fits && !hits(other)) { left = !left; b = other }
      else { ctx.restore(); return } // no clear spot: the ring stays, the name shows on hover or tap
    }
    drawn.push(b)
    ctx.textAlign = left ? 'right' : 'left'
    const lx = left ? x - offset : x + offset
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.lineJoin = 'round'
    ctx.strokeText(label, lx, y); ctx.fillStyle = colour; ctx.fillText(label, lx, y)
    ctx.restore()
  }
}

// Aladin Lite ships no types; this is the part of its API used here.
interface AladinView {
  gotoRaDec(ra: number, dec: number): void
  setFoV(fov: number): void
  getFoV(): [number, number]
  getRaDec(): [number, number]
  setImageSurvey(id: string): void
  setFoVRange(min: number, max: number): void
  addCatalog(c: unknown): void
  addOverlay(o: unknown): void
  on(event: string, fn: (arg: any) => void): void
}

// One animation loop that moves position and zoom together. Position follows the great circle (slerp of unit
// vectors, so it never takes the long way round or jumps at RA 0/360); zoom is a lerp of log(fov), so it feels
// even; both ease out. The HUD updates from the view's own events, so nothing here touches React state.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const D2R = Math.PI / 180
const toVec = (ra: number, dec: number): [number, number, number] =>
  [Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)]
const toRaDec = (v: [number, number, number]): [number, number] =>
  [((Math.atan2(v[1], v[0]) / D2R) % 360 + 360) % 360, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R]
const sepDeg = (r1: number, d1: number, r2: number, d2: number) => {
  const a = toVec(r1, d1), b = toVec(r2, d2)
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R
}

function flyTo(v: AladinView, ra: number, dec: number, fov: number, id: { current: number }, ms = 1800) {
  cancelAnimationFrame(id.current)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { v.gotoRaDec(ra, dec); v.setFoV(fov); return }
  const [ra0, dec0] = v.getRaDec(), fov0 = v.getFoV()[0]
  const a = toVec(ra0, dec0), b = toVec(ra, dec)
  const omega = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
  const so = Math.sin(omega)
  const l0 = Math.log(fov0), l1 = Math.log(fov)
  // Long moves pull the camera back mid-flight (an arc in log zoom), so it never sweeps the sky zoomed in.
  const lm = Math.log(Math.min(WHOLE_SKY_FOV, Math.max(fov0, fov, (omega * 180) / Math.PI * 1.5)))
  const lift = Math.max(0, lm - (l0 + l1) / 2)
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms), e = easeOutCubic(t)
    let p: [number, number, number]
    if (so < 1e-6) p = b
    else {
      const k0 = Math.sin((1 - e) * omega) / so, k1 = Math.sin(e * omega) / so
      p = [k0 * a[0] + k1 * b[0], k0 * a[1] + k1 * b[1], k0 * a[2] + k1 * b[2]]
    }
    const [r, d] = t >= 1 ? [ra, dec] : toRaDec(p)
    v.gotoRaDec(r, d)
    v.setFoV(t >= 1 ? fov : Math.exp(l0 + (l1 - l0) * e + 4 * e * (1 - e) * lift))
    if (t < 1) id.current = requestAnimationFrame(step)
  }
  id.current = requestAnimationFrame(step)
}

function writeHud(el: HTMLDivElement | null, ra: number, dec: number, fov: number) {
  if (!el) return
  const [a, b, c] = el.children as unknown as HTMLElement[]
  const label = fov >= 1 ? `${fmt(fov, fov >= 10 ? 0 : 1)}°` : `${fmt(fov * 60, 1)}′`
  const scale = fov > 60 ? 'a big patch of sky' : fov > 5 ? 'constellation' : fov > 0.5 ? 'a few full Moons' : 'SPHEREx cutout scale'
  a.textContent = `RA ${raHms(((ra % 360) + 360) % 360)}`
  b.textContent = `Dec ${decDms(dec)}`
  c.textContent = `Field ${label} · ${scale}`
}

// SPHEREx visit PNGs are opaque dark squares. Redraw each onto a canvas so the dark background turns transparent
// (alpha scales with brightness above the frame's median) and the edges fade out radially. Cached per URL.
const blended = new Map<string, Promise<string>>()
function blendedUrl(url: string): Promise<string> {
  let p = blended.get(url)
  if (!p) {
    p = new Promise<string>(resolve => {
      const im = new Image()
      im.onload = () => {
        try {
          const w = im.naturalWidth, h = im.naturalHeight
          const c = document.createElement('canvas')
          c.width = w; c.height = h
          const g = c.getContext('2d')!
          g.drawImage(im, 0, 0)
          const d = g.getImageData(0, 0, w, h), px = d.data
          const lum = new Uint8Array(w * h)
          for (let i = 0; i < w * h; i++) lum[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11
          const hist = new Uint32Array(256)
          lum.forEach(v => hist[v]++)
          const q = (f: number) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= f * w * h) return v } return 255 }
          const med = q(0.5), top = Math.max(q(0.995), med + 8)
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x
            const r = Math.min(1, Math.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) * 2)
            const t = Math.min(1, Math.max(0, (r - 0.55) / 0.45))
            const fall = 1 - t * t * (3 - 2 * t)
            const b = Math.min(1, Math.max(0, (lum[i] - med) / (top - med)))
            px[i * 4 + 3] = Math.round(255 * fall * Math.pow(b, 0.7))
          }
          g.putImageData(d, 0, 0)
          resolve(c.toDataURL('image/png'))
        } catch { resolve(url) }
      }
      im.onerror = () => resolve(url)
      im.src = url
    })
    blended.set(url, p)
  }
  return p
}

export default function Sky({ params, onReady }: PageProps) {
  const box = useRef<HTMLDivElement>(null)
  const view = useRef<AladinView | null>(null)
  const overlay = useRef<any>(null)
  const lib = useRef<any>(null)
  const epochs = useRef<any>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [layer, setLayer] = useState<'ir' | 'vis'>('ir')
  const [hosts, setHosts] = useState<Partial<Record<'ir' | 'vis', Host>>>({})
  const [wideVis, setWideVis] = useState<Host | null>(null)
  const layerRef = useRef<'ir' | 'vis'>('ir')
  const surveyRef = useRef<string>('')
  const [wide, setWide] = useState(true)
  const wideRef = useRef(true)
  const hud = useRef<HTMLDivElement>(null)
  const anim = useRef(0)
  const marks = useRef<{ cat: any; src: Map<string, any> } | null>(null)
  const [picked, setPicked] = useState<Meta | null>(null)
  const [tiles, setTiles] = useState(true) // no sky tiles have been drawn yet; on from mount
  const tilesTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [slow, setSlow] = useState(false) // no survey server has answered after SLOW_MS
  const resRef = useRef<Res>({})
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retryProbes = useRef<(() => void) | null>(null)
  const userLayer = useRef(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COL_KEY) === '1' } catch { return false } })
  const [sheet, setSheet] = useState(false) // phones: the cards are a bottom sheet over the map
  const [fast, setFast] = useState<FastStar | null>(null)
  const [fastCount, setFastCount] = useState(0)
  const fastPick = useRef<any>(null) // a one-source catalogue drawn as a ring round the clicked fast mover
  const glideCat = useRef<any>(null) // one source drawn as a filled dot, moved along the star's path
  const glide = useRef<{ id: number; a: any; year1: number; on: boolean }>({ id: 0, a: null, year1: 0, on: false })
  const slider = useRef<HTMLInputElement>(null)
  const yearLabel = useRef<HTMLSpanElement>(null)
  const layers = useRef<{ names: string[]; token: number; cur: number }>({ names: [], token: 0, cur: 0 }) // SPHEREx photos pinned on the map
  const tip = useRef<HTMLDivElement>(null)
  const metaBySlug = useRef(new Map<string, Meta>())
  const viewerBox = useRef<HTMLDivElement>(null)

  useEffect(() => { onReady() }, [onReady])

  const hideTip = () => { if (tip.current) tip.current.style.display = 'none' }

  // Only the visit whose index the side panel shows is visible on the map; the rest sit at opacity 0.
  const showVisit = (i: number) => {
    const L = layers.current, v = view.current as any
    L.cur = i
    L.names.forEach((n, k) => { const img = v?.view?.imageLayers?.get(n); if (img?.setOpacity) img.setOpacity(k === i ? 0.9 : 0) })
  }
  const dropPhotos = () => {
    const L = layers.current, v = view.current as any
    L.token++ // photos still loading will remove themselves when they arrive
    L.names.forEach(n => v?.removeImageLayer?.(n))
    L.names = []
  }
  const setMarker = (year: number | null) => {
    const c = glideCat.current, A = lib.current, g = glide.current
    if (!c || !A) return
    c.removeAll?.()
    if (year === null || !g.a) return
    const [ra, dec] = at(g.a, year)
    c.addSources([A.source(ra, dec, { label: String(Math.floor(year)) })])
    if (slider.current) slider.current.value = String(year)
    if (yearLabel.current) yearLabel.current.textContent = String(Math.floor(year))
  }
  const stopGlide = () => { cancelAnimationFrame(glide.current.id) }
  const clearGlide = () => { stopGlide(); glide.current.a = null; setMarker(null) }
  const playGlide = () => {
    const g = glide.current
    if (!g.a) return
    cancelAnimationFrame(g.id)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setMarker(g.year1); return }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / GLIDE_MS)
      setMarker(THEN + (g.year1 - THEN) * easeInOut(t))
      if (t < 1) g.id = requestAnimationFrame(step)
    }
    g.id = requestAnimationFrame(step)
  }
  const [hasGlide, setHasGlide] = useState(false)

  // Keep the map photo on the same visit as the side panel's viewer, by reading which stop the viewer marks as on.
  useEffect(() => {
    const el = viewerBox.current
    if (!el || !picked) return
    const read = () => {
      const stops = [...el.querySelectorAll('.stop')]
      const i = stops.findIndex(s => s.classList.contains('on'))
      if (i >= 0 && i !== layers.current.cur) showVisit(i)
    }
    const mo = new MutationObserver(read)
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['class'] })
    read()
    return () => mo.disconnect()
  }, [picked])

  // One readable label per circle: while a star is selected its catalogue name label is taken off the map,
  // because the "<name>, now (year)" label beside the circle already says it.
  const showMarks = (except?: string) => {
    const m = marks.current
    if (!m) return
    m.cat.removeAll?.()
    m.cat.addSources([...m.src].filter(([slug]) => slug !== except).map(([, o]) => o))
  }

  const fly = useCallback(async (slug: string) => {
    const m = await loadMeta(slug)
    setCollapsed(false) // picking a star on the map opens the card (the saved preference is untouched)
    setFast(null)
    fastPick.current?.removeAll?.()
    setPicked(m)
    setSheet(true)
    const a = m.target?.astrometry, v = view.current, A = lib.current
    if (!a || !v || !A) return
    const ov = overlay.current
    ov.removeAll?.()
    epochs.current?.removeAll?.()
    clearGlide()
    dropPhotos()
    hideTip()
    showMarks(slug)
    // Gaia positions are for 2016. Move the star to the middle of the SPHEREx visits, or a fast mover
    // like Barnard's Star (about 100 arcsec since 2016) would sit outside its own 2 arcmin box.
    const k = 1 / Math.cos((a.dec * Math.PI) / 180)
    const yNow = nowYear(m)
    const [ra, dec] = at(a, yNow)
    // Plain annotations: a blue circle where the star is now, and for a fast mover a white circle where it was
    // in 1999 with an arrow between them. Nothing that needs an astronomy background to read.
    const name = TARGETS.find(t => t.slug === slug)?.name ?? 'The star'
    const year = Math.floor(yNow)
    const r = 15 / 3600
    ov.add(A.circle(ra, dec, r, { color: accent(), hoverColor: accent(), selectionColor: accent(), lineWidth: 2.5 }))
    const d = totalDrift(a)
    if (d && d > 1) {
      const then = at(a, THEN)
      // the arrow runs between the two circles' edges, with a two-stroke head at the "now" end
      const dx = (ra - then[0]) / k, dy = dec - then[1], len = Math.hypot(dx, dy)
      const ux = dx / len, uy = dy / len
      const p0: [number, number] = [then[0] + ux * r * 1.2 * k, then[1] + uy * r * 1.2]
      const p1: [number, number] = [ra - ux * r * 1.2 * k, dec - uy * r * 1.2]
      // a short head: 6% of the shaft, at most 12 arcsec, 25 degrees either side of the shaft
      const hl = Math.min(Math.max(0, len - r * 2.4) * 0.06, 12 / 3600)
      const head = (sgn: number): [number, number] => [
        p1[0] + (-ux * 0.906 - sgn * uy * 0.423) * hl * k, p1[1] + (-uy * 0.906 + sgn * ux * 0.423) * hl]
      const w = { color: '#FFFFFF', hoverColor: '#FFFFFF', selectionColor: '#FFFFFF', lineWidth: 2 }
      // shaft and head as one polyline (retracing the tip), so the arrow hovers as one piece
      ov.add(A.polyline([p0, p1, head(1), p1, head(-1)], w))
      ov.add(A.circle(then[0], then[1], r, w))
      epochs.current?.addSources([
        A.source(then[0] - r * 1.4 * k, then[1] - r * 1.4, { name: `${name} in ${THEN}` }),
        A.source(ra - r * 1.4 * k, dec - r * 1.4, { name: `${name}, now (${year})` }),
      ])
    } else {
      epochs.current?.addSources([A.source(ra - r * 1.4 * k, dec - r * 1.4, { name: `${name}, now (${year})` })])
    }
    // Frame today's square and, for a fast mover, its 1999 position too.
    let cra = ra, cdec = dec, fov = TARGET_FOV
    if (d && d > 1) {
      const then = at(a, THEN)
      cra = (ra + then[0]) / 2; cdec = (dec + then[1]) / 2
      const sep = Math.hypot((ra - then[0]) / k, dec - then[1])
      fov = Math.max(TARGET_FOV, sep * 2.6)
    }
    // SPHEREx photos pinned at their true sky position. The PNGs are 6.15" pixels upsampled, centred on the star's
    // position at the middle visit; row 0 is the lowest Dec and x grows westward, so CDELT1 < 0 and CDELT2 > 0.
    const L = layers.current, token = L.token
    const mid = Math.floor(m.visits.length / 2)
    const [cr, cd] = at(a, yearOf(m.visits[mid].mjd))
    const n = (Math.round((m.size_arcmin * 60) / m.pixel_scale_arcsec) | 1) * m.upsample, sc = m.pixel_scale_arcsec / m.upsample / 3600
    L.cur = 0
    const wcs = { NAXIS: 2, NAXIS1: n, NAXIS2: n, CTYPE1: 'RA---TAN', CTYPE2: 'DEC--TAN', CRPIX1: (n + 1) / 2, CRPIX2: (n + 1) / 2, CRVAL1: cr, CRVAL2: cd, CDELT1: -sc, CDELT2: sc }
    L.names = m.visits.map((_, i) => `sx-${token}-${i}`)
    m.visits.forEach(async (x, i) => {
      const name = L.names[i]
      const url = await blendedUrl(imageUrl(slug, x.file))
      if (layers.current.token !== token) return
      const img = A.image(url, { name, imgFormat: 'png', opacity: 0, wcs,
        successCallback: () => { if (layers.current.token !== token) (v as any).removeImageLayer?.(name); else showVisit(layers.current.cur) } })
      ;(v as any).setOverlayImageLayer(img, name)
    })
    // The then-to-now glide: a dot that moves from the 1999 circle to the blue circle.
    glide.current.a = a
    glide.current.year1 = yNow
    setHasGlide(!!(d && d > 1))
    if (slider.current) { slider.current.min = String(THEN); slider.current.max = String(yNow); slider.current.value = String(yNow) }
    if (yearLabel.current) yearLabel.current.textContent = String(Math.floor(yNow))
    flyTo(v, cra, cdec, fov, anim)
    if (d && d > 1) playGlide() // one automatic sweep from 1999 to now; the slider takes over after
  }, [])

  // The fast-mover layer: loaded after the map is ready, so a slow or missing file never holds the map up.
  async function loadFast(A: any, v: AladinView, targets: [number, number][]) {
    try {
      const f: FastFile = await fetch('/data/fast_movers.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      const cat = A.catalog({ name: 'Fastest-moving stars', sourceSize: 8, color: faint(0.5),
        hoverColor: accent(), selectionColor: NO_RING, shape: 'circle', displayLabel: false })
      const list: any[] = []
      for (const [name, , ra0, dec0, pmra, pmdec, parallax] of f.rows) {
        const [ra, dec] = at({ ra: ra0, dec: dec0, pmra, pmdec, epoch_from: f.epoch }, FAST_EPOCH)
        if (targets.some(([r, d]) => sepDeg(ra, dec, r, d) < COINCIDE_DEG)) continue
        const star: FastStar = { name, ra, dec, pmra, pmdec, parallax }
        list.push(A.source(ra, dec, { fast: star }))
      }
      cat.addSources(list)
      v.addCatalog(cat)
      setFastCount(list.length)
    } catch (e) {
      console.warn('Fast-mover layer not loaded:', e)
    }
  }

  // ra, dec: the clicked marker's own (propagated) position, so the ring sits exactly on the dot
  function pickFast(s: FastStar, ra = s.ra, dec = s.dec) {
    setPicked(null)
    setCollapsed(false)
    overlay.current?.removeAll?.()
    epochs.current?.removeAll?.()
    clearGlide()
    dropPhotos()
    hideTip()
    setHasGlide(false)
    showMarks()
    setFast(s)
    setSheet(true)
    const c = fastPick.current
    if (c && lib.current) { c.removeAll?.(); c.addSources([lib.current.source(ra, dec, {})]) }
  }

  useEffect(() => {
    let dead = false
    tilesTimer.current = setTimeout(() => setTiles(false), TILES_CAP_MS)
    ;(async () => {
      try {
        if (!document.createElement('canvas').getContext('webgl2')) throw new Error('no WebGL2')
        // The probes run beside the map start-up and never gate it: the map opens at once on the default
        // survey, then switches to the better one if a probe finds it. No answer by SLOW_MS shows the note.
        const res: Res = {}
        let run = 0, tilesReady = true
        const apply = () => {
          const ir = res.ir ?? undefined, vis = res.vis ?? undefined
          setHosts({ ir, vis })
          setWideVis(res.mel ?? null)
          if (res.ir === null && vis && !userLayer.current && layerRef.current === 'ir') { layerRef.current = 'vis'; setLayer('vis') }
          const vw = view.current
          if (!vw) return
          const want = layerRef.current === 'ir' ? ir?.url : (res.mel && vis && vw.getFoV()[0] > WIDE_FOV ? res.mel.url : vis?.url)
          if (want && want !== surveyRef.current) { surveyRef.current = want; vw.setImageSurvey(want); tune(vw, want) }
          // The chosen host's all-sky preview has just loaded, so Aladin paints its first tiles within a moment.
          if (want && tilesReady) { tilesReady = false; clearTimeout(tilesTimer.current); tilesTimer.current = setTimeout(() => setTiles(false), 1200) }
        }
        const startProbes = () => {
          const my = ++run
          let okAny = !!(res.ir || res.vis || res.mel), done = 0
          clearTimeout(slowTimer.current)
          setSlow(false)
          slowTimer.current = setTimeout(() => { if (my === run && !dead && !okAny) setSlow(true) }, SLOW_MS)
          const todo = (['ir', 'vis', 'mel'] as const).filter(k => !res[k])
          if (!todo.length) return
          const groups = { ir: LAYERS[0].hosts, vis: LAYERS[1].hosts, mel: MELLINGER }
          todo.forEach(k => void pick(groups[k], h => {
            if (my !== run || dead) return
            res[k] = h
            okAny = true; setSlow(false)
            if (k === 'ir') rememberIr(h)
            apply()
          }).then(h => {
            if (my !== run || dead) return
            if (!h) res[k] = null
            if (++done === todo.length && !okAny) setSlow(true)
            apply()
          }))
        }
        resRef.current = res
        retryProbes.current = () => { for (const k of ['ir', 'vis', 'mel'] as const) if (!res[k]) res[k] = undefined; startProbes() }
        startProbes()
        const A = await import('aladin-lite').then(mod => mod.default as any)
        await A.init
        if (dead || !box.current) return
        lib.current = A
        // Open on the host that answered last time, else the IRSA mirror (the most reliable); a better host that
        // answers meanwhile takes over through apply().
        const first = rememberedIr() ?? LAYERS[0].hosts[2]
        layerRef.current = 'ir'
        surveyRef.current = first.url
        const v: AladinView = A.aladin(box.current, {
          survey: first.url, fov: WHOLE_SKY_FOV, target: '266.4 -28.9', projection: 'STG', cooFrame: 'ICRSd',
          showReticle: false, showZoomControl: false, showFullscreenControl: false, showLayersControl: false,
          showGotoControl: false, showFrame: false, showCooGridControl: false, showSimbadPointerControl: false,
          showProjectionControl: false, showContextMenu: false, showSettingsControl: false, showShareControl: false,
          showStatusBar: false, showCooLocation: false, showFov: false, backgroundColor: 'rgb(5,7,12)',
        })
        view.current = v
        v.setFoVRange(0.02, WHOLE_SKY_FOV)
        setTiles(true)
        clearTimeout(tilesTimer.current)
        tilesTimer.current = setTimeout(() => setTiles(false), TILES_CAP_MS)
        // the user taking the map over cancels a running fly
        const stop = () => { cancelAnimationFrame(anim.current); hideTip() }
        box.current.addEventListener('pointerdown', stop)
        box.current.addEventListener('wheel', stop, { passive: true })
        tune(v, first.url)
        const metas = await Promise.all(TARGETS.map(t => loadMeta(t.slug).catch(() => null)))
        const cat = A.catalog({ name: 'Test targets', sourceSize: 22, color: accent(), hoverColor: accent(), selectionColor: NO_RING,
          displayLabel: false, shape: labelShape(true, '600 13px Public Sans', '#E8EEF6', 16) })
        // Markers sit where each star is during the SPHEREx visits, not at its 2016 catalogue position.
        const srcs = new Map<string, any>()
        marks.current = { cat, src: srcs }
        metas.forEach((m, i) => {
          const a = m?.target?.astrometry
          if (m && a) { const [ra, dec] = at(a, midYear(m)); const src = A.source(ra, dec, { name: TARGETS[i].name, slug: TARGETS[i].slug }); srcs.set(TARGETS[i].slug, src); cat.addSources([src]) }
        })
        v.addCatalog(cat)
        epochs.current = A.catalog({ name: 'Then and now', sourceSize: 8, color: NO_RING, hoverColor: NO_RING, selectionColor: NO_RING,
          displayLabel: false, shape: labelShape(false, '600 13px Public Sans', '#FFFFFF', 4, true) })
        v.addCatalog(epochs.current)
        // A filled dot with the year beside it: a custom shape, so it keeps its size in pixels at every zoom.
        const dot = (s: any, ctx: CanvasRenderingContext2D) => {
          const x = s.x, y = s.y, label = s.data?.label ?? ''
          ctx.save()
          ctx.fillStyle = accent(); ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.lineWidth = 2
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.stroke(); ctx.fill()
          ctx.font = '600 13px Public Sans'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3
          ctx.strokeText(label, x + 10, y); ctx.fillStyle = '#FFFFFF'; ctx.fillText(label, x + 10, y)
          ctx.restore()
        }
        glideCat.current = A.catalog({ name: 'Glide', sourceSize: 8, shape: dot, color: accent(), hoverColor: accent(), selectionColor: NO_RING, displayLabel: false })
        v.addCatalog(glideCat.current)
        metas.forEach((m, i) => { if (m) metaBySlug.current.set(TARGETS[i].slug, m) })
        // Hover tooltip: next to the cursor, for the five targets and the fast-mover dots only (not the annotation shapes).
        const pointer = { x: 0, y: 0 }
        const place = () => {
          const t = tip.current, b = box.current
          if (!t || !b) return
          const x = Math.min(pointer.x + 14, b.clientWidth - t.offsetWidth - 8), y = Math.min(pointer.y + 16, b.clientHeight - t.offsetHeight - 8)
          t.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`
        }
        box.current.addEventListener('pointermove', e => {
          const r = box.current!.getBoundingClientRect()
          pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top
          if (tip.current && tip.current.style.display === 'block') place()
        })
        const tipLines = (o: any): string[] | null => {
          const d = o?.data
          if (d?.slug) {
            const m = metaBySlug.current.get(d.slug), a = m?.target?.astrometry, t = TARGETS.find(x => x.slug === d.slug)
            if (!m || !t) return null
            const ly = lightYears(a), dr = totalDrift(a)
            return [t.name, [ly ? `${fmt(ly, ly < 100 ? 1 : 0)} light years` : '', dr ? `drifts ${fmt(dr, 2)}″ a year` : ''].filter(Boolean).join(' · '),
              STATUS_LABEL[t.status] + (t.status === 'measured' ? ' by SPHEREx' : '')]
          }
          if (d?.fast) {
            const s = d.fast as FastStar, a = { ...s, epoch_from: FAST_EPOCH }, ly = lightYears(a), dr = totalDrift(a)
            return [s.name, [ly ? `${fmt(ly, ly < 100 ? 1 : 0)} light years` : '', dr ? `drifts ${fmt(dr, 2)}″ a year` : ''].filter(Boolean).join(' · ')]
          }
          return null
        }
        if (window.matchMedia('(hover: hover)').matches) {
          v.on('objectHovered', (o: any) => {
            const lines = tipLines(o), t = tip.current
            if (!lines || !t) return
            t.replaceChildren(...lines.map((l, i) => { const p = document.createElement(i === 0 ? 'b' : 'span'); p.textContent = l; return p }))
            t.style.display = 'block'
            place()
          })
          v.on('objectHoveredStop', hideTip)
          box.current.addEventListener('pointerdown', hideTip)
          box.current.addEventListener('wheel', hideTip, { passive: true })
        }
        overlay.current = A.graphicOverlay({ color: accent(), hoverColor: accent(), selectionColor: accent(), lineWidth: 1.5 })
        v.addOverlay(overlay.current)
        v.on('objectClicked', (o: any) => {
          // Aladin selects the clicked source and draws its own ring, which stays at the old screen spot during a
          // fly. Our circles and the card are the only selection feedback, so drop its selection right after.
          setTimeout(() => (v as any).view?.unselectObjects?.(), 0)
          if (o?.data?.slug) void fly(o.data.slug)
          else if (o?.data?.fast) pickFast(o.data.fast as FastStar, o.ra, o.dec)
        })
        // Ring round a clicked fast mover: a catalogue, so it keeps its size in pixels at every zoom.
        fastPick.current = A.catalog({ name: 'Picked fast mover', sourceSize: 18, color: accent(),
          hoverColor: accent(), selectionColor: NO_RING, shape: 'circle', displayLabel: false })
        v.addCatalog(fastPick.current)
        void loadFast(A, v, [...srcs.values()].map(o => [o.ra, o.dec] as [number, number]))
        // Aladin keeps a hovered or selected source's ring at its last screen spot when the view moves under it
        // (a fly, a zoom), so a ring would hang in empty sky. Drop both whenever the view changes.
        const dropRings = () => {
          const vw = (v as any).view
          if (!vw) return
          if (vw.lastHoveredObject) { vw.lastHoveredObject.forEach((o: any) => o.unhover?.()); vw.lastHoveredObject = null }
          if (vw.selection) vw.unselectObjects?.()
        }
        const sync = () => {
          dropRings()
          hideTip()
          const [ra, dec] = v.getRaDec(), fov = v.getFoV()[0]
          writeHud(hud.current, ra, dec, fov)
          const w = fov > WIDE_FOV
          if (w !== wideRef.current) { wideRef.current = w; setWide(w) }
          // Visible light: the smooth Mellinger mosaic when zoomed out, detailed DSS2 when zoomed in.
          const { vis, mel } = resRef.current
          if (layerRef.current === 'vis' && mel && vis) {
            const want = fov > WIDE_FOV ? mel.url : vis.url
            if (want !== surveyRef.current) { surveyRef.current = want; v.setImageSurvey(want); tune(v, want) }
          }
        }
        v.on('positionChanged', sync)
        v.on('zoomChanged', sync)
        sync()
        apply() // a probe that finished while Aladin was starting
        setState('ready')
      } catch (e) {
        console.error('Sky map failed to start:', e)
        if (!dead) setState('failed')
      }
    })()
    return () => { dead = true; clearTimeout(slowTimer.current); clearTimeout(tilesTimer.current); cancelAnimationFrame(anim.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A direct link (#/sky?target=slug) selects and flies to the star once the map is ready, also when only
  // the hash changes and this page stays mounted.
  const want = params.query.get('target')
  useEffect(() => {
    if (state === 'ready' && want && TARGETS.some(t => t.slug === want)) void fly(want)
  }, [state, want, fly])

  function wholeSky() {
    setPicked(null)
    setFast(null)
    fastPick.current?.removeAll?.()
    overlay.current?.removeAll?.()
    epochs.current?.removeAll?.()
    clearGlide()
    dropPhotos()
    hideTip()
    setHasGlide(false)
    showMarks()
    if (view.current) flyTo(view.current, 266.4, -28.9, WHOLE_SKY_FOV, anim)
  }
  function switchLayer(k: 'ir' | 'vis') {
    const h = hosts[k]
    if (!h) return
    userLayer.current = true
    setLayer(k)
    layerRef.current = k
    const url = k === 'vis' && wideVis && wideRef.current ? wideVis.url : h.url
    surveyRef.current = url
    if (view.current) { view.current.setImageSurvey(url); tune(view.current, url) }
  }

  const shown = layer === 'vis' && wideVis && wide ? wideVis : hosts[layer] ?? (layer === 'ir' ? LAYERS[0].hosts[0] : undefined)
  const info = picked ? TARGETS.find(t => t.slug === picked.slug)! : null

  return (
    <div className={'skypage' + (collapsed ? ' col-off' : '')}>
      <div className="skywrap">
        <div ref={box} className="aladin" aria-label="Interactive map of the sky" />
        {state !== 'ready' && (
          <div className="sky-cover" role="status" aria-live="polite">
            <div className="loader-box">
              <Logo height={48} />
              {state === 'failed' ? <>
                <p className="loader-title">The sky map could not load</p>
                <p className="loader-step">It needs WebGL2 and a sky image server, and neither answered. Each star still opens its SPHEREx photos.</p>
              </> : <>
                <p className="loader-title">Loading the sky</p>
                <div className="bar" />
              </>}
            </div>
          </div>
        )}
        {state !== 'failed' && tiles && !slow && (
          <p className="sky-loading" role="status">Loading sky images…</p>
        )}
        <div className="sky-hud" aria-hidden ref={hud}>
          <span /><span /><span />
        </div>
        <div className="sky-tip" ref={tip} aria-hidden />
        {shown && <p className="sky-credit">Sky: {shown.credit}. Map: Aladin Lite (CDS).</p>}
        {slow && (
          <div className="sky-slow" role="status">
            <p>Sky images are slow to load from the survey servers. The markers and SPHEREx photos still work.</p>
            <button className="btn sm" onClick={() => retryProbes.current?.()}>Retry</button>
          </div>
        )}
        <div className="sky-tools">
          {Object.keys(hosts).length > 0 && (
            <div className="seg" role="group" aria-label="Sky images">
              {LAYERS.filter(l => hosts[l.key]).map(l => (
                <button key={l.key} onClick={() => switchLayer(l.key)} aria-pressed={layer === l.key}>{l.label} · {hosts[l.key]!.name}</button>
              ))}
            </div>
          )}
          <button className="btn sm" onClick={wholeSky}>Zoom out</button>
        </div>
      </div>

      <button className="sky-toggle" onClick={() => {
        const n = !collapsed
        setCollapsed(n)
        try { localStorage.setItem(COL_KEY, n ? '1' : '0') } catch { /* private mode: the preference is just not kept */ }
      }} aria-expanded={!collapsed} aria-controls="sky-panel" aria-label={collapsed ? 'Show the star panel' : 'Hide the star panel'}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {collapsed && <span>Stars</span>}
      </button>
      <div id="sky-panel" className={'skycol' + (sheet ? ' open' : '')}>
        <button className="handle" onClick={() => setSheet(o => !o)} aria-expanded={sheet} aria-label={sheet ? 'Lower the panel' : 'Raise the panel'}>
          <span className="handle-t">{picked && info ? info.name : fast ? fast.name : 'Pick a star'}</span>
        </button>
          {picked && info ? (
            <div className="card">
              <div className="picked-head back-head">
                <button className="back-btn" onClick={wholeSky} aria-label="Back to all stars" title="Back to all stars">
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <h2>{info.name}</h2>
              </div>
              <span className={`badge ${info.status}`} style={{ marginTop: 8 }}><span className="dot" />{STATUS_LABEL[info.status]}</span>
              <div className="picked-stats">
                <div className="stat">
                  <span className="stat-label">{picked.motion ? `Drift, ${axisWords(picked.motion)}` : 'Drift'}</span>
                  <span className="stat-value">{picked.motion ? <>{fmt(picked.motion.measured_arcsec_per_yr, 2)} ± {fmt(picked.motion.error_arcsec_per_yr, 2)}<small> arcsec/yr</small></> : 'None'}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Gaia says</span>
                  <span className="stat-value">{picked.motion ? <>{fmt(picked.motion.gaia_arcsec_per_yr, 2)}<small> arcsec/yr</small></> : 'n/a'}</span>
                </div>
              </div>
              <div ref={viewerBox}><Viewer meta={picked} src={f => imageUrl(picked.slug, f)} compact /></div>
              {hasGlide && (
                <div className="glide">
                  <span className="glide-label" id="glide-label">Where the star was:</span>
                  <input ref={slider} type="range" min={THEN} max={nowYear(picked)} step="0.01" defaultValue={nowYear(picked)} aria-labelledby="glide-label"
                    onInput={e => { stopGlide(); setMarker(Number(e.currentTarget.value)) }} />
                  <span className="glide-year mono" ref={yearLabel}>{Math.floor(nowYear(picked))}</span>
                </div>
              )}
              <p className="caption" style={{ marginTop: 12 }}>
                {(totalDrift(picked.target?.astrometry) ?? 0) > 1
                  ? <>On the map, the star has moved from the white circle ({THEN}) to the blue circle (today).{shown?.name === '2MASS' && <> The background photo is from {THEN}, so it still shows the star in the white circle.</>}{layer === 'vis' && <> The visible-light photo is older, taken between the 1950s and 1990s, so the star appears further back along its path, outside both circles.</>}</>
                  : <>On the map, the blue circle shows where the star is today.</>}
              </p>
              <a className="btn sm" href={`#/target/${picked.slug}`}>Open the full dashboard</a>
            </div>
          ) : fast ? (
            <FastCard s={fast} onClose={wholeSky} />
          ) : (
            <div className="card">
              <h1 className="q">Pick a star to fly to it</h1>
              <p className="caption" style={{ margin: 0 }}>Drag to look around. Scroll or pinch to zoom.</p>
              <ul className="target-list" aria-busy={state === 'loading'}>
                {state === 'loading'
                  ? TARGETS.map(t => (
                    <li key={t.slug} className="skel-row" aria-hidden>
                      <span className="skel" style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 6 }} />
                      <span style={{ flex: 1 }}><span className="skel skel-line" style={{ width: '45%' }} /><span className="skel skel-line" style={{ width: '85%' }} /></span>
                    </li>
                  ))
                  : TARGETS.map(t => (
                    <li key={t.slug}>
                      <button onClick={() => void fly(t.slug)}>
                        <i className={`tdot ${t.status}`} />
                        <span><span className="tn">{t.name}</span><span className="th">{t.hook}</span></span>
                      </button>
                    </li>
                  ))}
              </ul>
              {state === 'ready' && fastCount > 0 && (
                <p className="caption fast-hint"><i className="fast-dot" aria-hidden />Faint dots are the 300 fastest-moving stars in the Gaia catalogue. Click one.</p>
              )}
              {state === 'ready' && hosts.ir && hosts.ir.name !== 'SPHEREx' && (
                <p className="notice sky-warn">SPHEREx's all-sky map is not reachable right now (CDS server), so the infrared background is 2MASS. The target photos are SPHEREx.</p>
              )}
              {state === 'failed' && (
                <p className="notice sky-warn">The map could not load, but each target still opens its SPHEREx photos: <a href="#/target/barnards-star">open the dashboard</a>.</p>
              )}
            </div>
          )}
      </div>
    </div>
  )
}

// A fast mover's card: distance from parallax, drift from proper motion, and a link to its SPHEREx photos.
function FastCard({ s, onClose }: { s: FastStar; onClose: () => void }) {
  const a = { ...s, epoch_from: FAST_EPOCH }
  const ly = lightYears(a)
  const drift = totalDrift(a)
  const moon = yearsPerMoon(a)
  const href = `#/any?ra=${s.ra.toFixed(4)}&dec=${s.dec.toFixed(4)}&size=4`
  return (
    <div className="card fast-card">
      <div className="picked-head">
        <h2>{s.name}</h2>
        <button className="linkbtn" onClick={onClose}>All targets</button>
      </div>
      <p className="caption" style={{ margin: '4px 0 0' }}>One of the 300 fastest-moving stars in Gaia.</p>
      <div className="picked-stats">
        <div className="stat">
          <span className="stat-label">Distance</span>
          <span className="stat-value">{ly ? <>{fmt(ly, ly < 100 ? 1 : 0)}<small> light years</small></> : 'n/a'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Drift</span>
          <span className="stat-value">{drift ? <>{fmt(drift, 2)}<small> ″/yr</small></> : 'n/a'}</span>
        </div>
      </div>
      {moon && <p className="caption" style={{ marginTop: 12 }}>Crosses a full Moon in {fmt(moon, 0)} years.</p>}
      <a className="btn sm" href={href}>Show its SPHEREx photos</a>
      <p className="caption fast-note">Live photos need the deployed site.</p>
    </div>
  )
}

