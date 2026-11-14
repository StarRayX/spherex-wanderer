import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageProps } from '../lib/router'
import { STATUS_LABEL, TARGETS, imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { axisWords, decDms, fmt, lightYears, raHms, totalDrift, yearsPerMoon } from '../lib/format'
import Viewer from '../components/Viewer'
import Mark from '../components/Mark'
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

// Probe every host at once and keep the most preferred one that answered, so a dead server costs one
// timeout (5 s) instead of one per host in turn.
async function pick(hosts: Host[]) {
  const ok = await Promise.all(hosts.map(h => probe(h, 5000)))
  return hosts.find((_, i) => ok[i]) ?? null
}

// Where a star is in a given year, from Gaia's position and drift (proper motion only; parallax is under 1").
function at(a: { ra: number; dec: number; pmra: number; pmdec: number; epoch_from: number }, year: number): [number, number] {
  const k = 1 / Math.cos((a.dec * Math.PI) / 180), yrs = year - a.epoch_from
  return [a.ra + ((a.pmra / 1000) * yrs / 3600) * k, a.dec + (a.pmdec / 1000) * yrs / 3600]
}
const yearOf = (mjd: number) => 2000 + (mjd - 51544.5) / 365.25
const midYear = (m: Meta) => yearOf((m.visits[0].mjd + m.visits[m.visits.length - 1].mjd) / 2)
const THEN = 1999 // the 2MASS sky survey ran 1997 to 2001

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

const STEPS = ['Finding a sky image server', 'Loading the sky map', 'Placing the five test stars']

// Stereographic projection: the view from the centre of the sky sphere, like a skybox camera. Capped at 100
// degrees across, about a normal camera's field; wider than that the edges stretch as you pan.
const WHOLE_SKY_FOV = 100
const TARGET_FOV = 0.25

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
  const [step, setStep] = useState(0)
  const [sheet, setSheet] = useState(false) // phones: the cards are a bottom sheet over the map
  const [fast, setFast] = useState<FastStar | null>(null)
  const [fastCount, setFastCount] = useState(0)
  const fastPick = useRef<any>(null) // a one-source catalogue drawn as a ring round the clicked fast mover

  useEffect(() => { onReady() }, [onReady])

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
    setFast(null)
    fastPick.current?.removeAll?.()
    setPicked(m)
    setSheet(true)
    const a = m.target?.astrometry, v = view.current, A = lib.current
    if (!a || !v || !A) return
    const ov = overlay.current
    ov.removeAll?.()
    epochs.current?.removeAll?.()
    showMarks(slug)
    // Gaia positions are for 2016. Move the star to the middle of the SPHEREx visits, or a fast mover
    // like Barnard's Star (about 100 arcsec since 2016) would sit outside its own 2 arcmin box.
    const k = 1 / Math.cos((a.dec * Math.PI) / 180)
    const [ra, dec] = at(a, midYear(m))
    // Plain annotations: a blue circle where the star is now, and for a fast mover a white circle where it was
    // in 1999 with an arrow between them. Nothing that needs an astronomy background to read.
    const name = TARGETS.find(t => t.slug === slug)?.name ?? 'The star'
    const year = Math.round(midYear(m))
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
    flyTo(v, cra, cdec, fov, anim)
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
    overlay.current?.removeAll?.()
    epochs.current?.removeAll?.()
    showMarks()
    setFast(s)
    setSheet(true)
    const c = fastPick.current
    if (c && lib.current) { c.removeAll?.(); c.addSources([lib.current.source(ra, dec, {})]) }
  }

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        if (!document.createElement('canvas').getContext('webgl2')) throw new Error('no WebGL2')
        setStep(0)
        const [A, ir, vis, mel] = await Promise.all([
          import('aladin-lite').then(mod => mod.default as any),
          pick(LAYERS[0].hosts), pick(LAYERS[1].hosts), pick(MELLINGER),
        ])
        setWideVis(mel)
        const first = ir ?? vis
        if (!first) throw new Error('no sky server answered')
        setStep(1)
        await A.init
        if (dead || !box.current) return
        lib.current = A
        setHosts({ ir: ir ?? undefined, vis: vis ?? undefined })
        setLayer(ir ? 'ir' : 'vis')
        layerRef.current = ir ? 'ir' : 'vis'
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
        // the user taking the map over cancels a running fly
        const stop = () => cancelAnimationFrame(anim.current)
        box.current.addEventListener('pointerdown', stop)
        box.current.addEventListener('wheel', stop, { passive: true })
        tune(v, first.url)
        setStep(2)
        const metas = await Promise.all(TARGETS.map(t => loadMeta(t.slug).catch(() => null)))
        const cat = A.catalog({ name: 'Test targets', sourceSize: 22, color: accent(), hoverColor: accent(), selectionColor: NO_RING, shape: 'circle',
          displayLabel: true, labelColumn: 'name', labelColor: '#E8EEF6', labelFont: '600 13px Public Sans' })
        // Markers sit where each star is during the SPHEREx visits, not at its 2016 catalogue position.
        const srcs = new Map<string, any>()
        marks.current = { cat, src: srcs }
        metas.forEach((m, i) => {
          const a = m?.target?.astrometry
          if (m && a) { const [ra, dec] = at(a, midYear(m)); const src = A.source(ra, dec, { name: TARGETS[i].name, slug: TARGETS[i].slug }); srcs.set(TARGETS[i].slug, src); cat.addSources([src]) }
        })
        v.addCatalog(cat)
        epochs.current = A.catalog({ name: 'Then and now', sourceSize: 8, color: NO_RING, hoverColor: NO_RING, selectionColor: NO_RING, shape: 'square',
          displayLabel: true, labelColumn: 'name', labelColor: '#FFFFFF', labelFont: '600 12px Public Sans' })
        v.addCatalog(epochs.current)
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
          const [ra, dec] = v.getRaDec(), fov = v.getFoV()[0]
          writeHud(hud.current, ra, dec, fov)
          const w = fov > WIDE_FOV
          if (w !== wideRef.current) { wideRef.current = w; setWide(w) }
          // Visible light: the smooth Mellinger mosaic when zoomed out, detailed DSS2 when zoomed in.
          if (layerRef.current === 'vis' && mel && vis) {
            const want = fov > WIDE_FOV ? mel.url : vis.url
            if (want !== surveyRef.current) { surveyRef.current = want; v.setImageSurvey(want); tune(v, want) }
          }
        }
        v.on('positionChanged', sync)
        v.on('zoomChanged', sync)
        sync()
        setState('ready')
      } catch (e) {
        console.error('Sky map failed to start:', e)
        if (!dead) setState('failed')
      }
    })()
    return () => { dead = true; cancelAnimationFrame(anim.current) }
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
    showMarks()
    if (view.current) flyTo(view.current, 266.4, -28.9, WHOLE_SKY_FOV, anim)
  }
  function switchLayer(k: 'ir' | 'vis') {
    const h = hosts[k]
    if (!h) return
    setLayer(k)
    layerRef.current = k
    const url = k === 'vis' && wideVis && wideRef.current ? wideVis.url : h.url
    surveyRef.current = url
    if (view.current) { view.current.setImageSurvey(url); tune(view.current, url) }
  }

  const shown = layer === 'vis' && wideVis && wide ? wideVis : hosts[layer]
  const info = picked ? TARGETS.find(t => t.slug === picked.slug)! : null

  return (
    <div className="skypage">
      <div className="skywrap">
        <div ref={box} className="aladin" aria-label="Interactive map of the sky" />
        {state !== 'ready' && (
          <div className="sky-cover" role="status" aria-live="polite">
            <div className="loader-box">
              <Mark size={48} />
              {state === 'failed' ? <>
                <p className="loader-title">The sky map could not load</p>
                <p className="loader-step">It needs WebGL2 and a sky image server, and neither answered. Each star still opens its SPHEREx photos.</p>
              </> : <>
                <p className="loader-title">Loading the sky</p>
                <p className="loader-step">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
                <div className="bar" />
              </>}
            </div>
          </div>
        )}
        <div className="sky-hud" aria-hidden ref={hud}>
          <span /><span /><span />
        </div>
        {shown && <p className="sky-credit">Sky: {shown.credit}. Map: Aladin Lite (CDS).</p>}
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

      <div className={'skycol' + (sheet ? ' open' : '')}>
        <button className="handle" onClick={() => setSheet(o => !o)} aria-expanded={sheet} aria-label={sheet ? 'Lower the panel' : 'Raise the panel'}>
          <span className="handle-t">{picked && info ? info.name : fast ? fast.name : 'Pick a star'}</span>
        </button>
          {picked && info ? (
            <div className="card">
              <div className="picked-head">
                <h2>{info.name}</h2>
                <button className="linkbtn" onClick={wholeSky}>All targets</button>
              </div>
              <span className={`badge ${info.status}`} style={{ marginTop: 8 }}><span className="dot" />{STATUS_LABEL[info.status]}</span>
              <div className="picked-stats">
                <div className="stat">
                  <span className="stat-label">{picked.motion ? `Drift, ${axisWords(picked.motion)}` : 'Drift'}</span>
                  <span className="stat-value">{picked.motion ? <>{fmt(picked.motion.measured_arcsec_per_yr, 1)}<small> ″/yr</small></> : 'None'}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Gaia says</span>
                  <span className="stat-value">{picked.motion ? <>{fmt(picked.motion.gaia_arcsec_per_yr, 1)}<small> ″/yr</small></> : 'n/a'}</span>
                </div>
              </div>
              <Viewer meta={picked} src={f => imageUrl(picked.slug, f)} compact />
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
