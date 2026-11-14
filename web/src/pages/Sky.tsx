import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageProps } from '../lib/router'
import { STATUS_LABEL, TARGETS, imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { axisWords, decDms, fmt, raHms, totalDrift } from '../lib/format'
import Viewer from '../components/Viewer'
import Mark from '../components/Mark'

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
async function pick(hosts: Host[]) {
  for (const h of hosts) if (await probe(h)) return h
  return null
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

const STEPS = ['Finding a sky image server', 'Loading the sky map', 'Placing the five test stars']

const WHOLE_SKY_FOV = 180
const TARGET_FOV = 0.25
const CUTOUT_DEG = 2 / 60
const DRIFT_YEARS = 1000

// Aladin Lite ships no types; this is the part of its API used here.
interface AladinView {
  animateToRaDec(ra: number, dec: number, seconds: number, done?: () => void): void
  zoomToFoV(fov: number, seconds?: number, done?: () => void): void
  getFoV(): [number, number]
  getRaDec(): [number, number]
  setImageSurvey(id: string): void
  addCatalog(c: unknown): void
  addOverlay(o: unknown): void
  on(event: string, fn: (arg: any) => void): void
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
  const [pos, setPos] = useState({ ra: 0, dec: 0, fov: WHOLE_SKY_FOV })
  const [picked, setPicked] = useState<Meta | null>(null)
  const [step, setStep] = useState(0)
  const [sheet, setSheet] = useState(false) // phones: the cards are a bottom sheet over the map

  useEffect(() => { onReady() }, [onReady])

  const fly = useCallback(async (slug: string) => {
    const m = await loadMeta(slug)
    setPicked(m)
    setSheet(true)
    const a = m.target?.astrometry, v = view.current, A = lib.current
    if (!a || !v || !A) return
    const ov = overlay.current
    ov.removeAll?.()
    epochs.current?.removeAll?.()
    // Gaia positions are for 2016. Move the star to the middle of the SPHEREx visits, or a fast mover
    // like Barnard's Star (about 100 arcsec since 2016) would sit outside its own 2 arcmin box.
    const k = 1 / Math.cos((a.dec * Math.PI) / 180)
    const [ra, dec] = at(a, midYear(m))
    const h = CUTOUT_DEG / 2
    ov.add(A.polygon([[ra - h * k, dec - h], [ra + h * k, dec - h], [ra + h * k, dec + h], [ra - h * k, dec + h]]))
    const d = totalDrift(a)
    if (d && d > 1) {
      // The path from 1999 (when the 2MASS background photo was taken) through today and 1,000 years on.
      const then = at(a, THEN), later = at(a, midYear(m) + DRIFT_YEARS)
      ov.add(A.polyline([then, [ra, dec], later], { color: accent(), lineWidth: 2 }))
      ov.add(A.circle(then[0], then[1], 15 / 3600, { color: '#FFFFFF', lineWidth: 1.5 }))
      epochs.current?.addSources([
        A.source(then[0], then[1], { name: `Here in ${THEN}` }),
        A.source(ra + h * k, dec + h, { name: 'Here now (SPHEREx)' }),
      ])
    }
    // Frame today's square and, for a fast mover, its 1999 position too.
    let cra = ra, cdec = dec, fov = TARGET_FOV
    if (d && d > 1) {
      const then = at(a, THEN)
      cra = (ra + then[0]) / 2; cdec = (dec + then[1]) / 2
      const sep = Math.hypot((ra - then[0]) / k, dec - then[1])
      fov = Math.max(TARGET_FOV, sep * 2.6)
    }
    v.animateToRaDec(cra, cdec, 1.4, () => v.zoomToFoV(fov, 1.2))
  }, [])

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        if (!document.createElement('canvas').getContext('webgl2')) throw new Error('no WebGL2')
        setStep(0)
        const [A, ir, vis] = await Promise.all([
          import('aladin-lite').then(mod => mod.default as any),
          pick(LAYERS[0].hosts), pick(LAYERS[1].hosts),
        ])
        const first = ir ?? vis
        if (!first) throw new Error('no sky server answered')
        setStep(1)
        await A.init
        if (dead || !box.current) return
        lib.current = A
        setHosts({ ir: ir ?? undefined, vis: vis ?? undefined })
        setLayer(ir ? 'ir' : 'vis')
        const v: AladinView = A.aladin(box.current, {
          survey: first.url, fov: WHOLE_SKY_FOV, target: '266.4 -28.9', projection: 'AIT', cooFrame: 'ICRSd',
          showReticle: false, showZoomControl: false, showFullscreenControl: false, showLayersControl: false,
          showGotoControl: false, showFrame: false, showCooGridControl: false, showSimbadPointerControl: false,
          showProjectionControl: false, showContextMenu: false, showSettingsControl: false, showShareControl: false,
          showStatusBar: false, showCooLocation: false, showFov: false, backgroundColor: 'rgb(5,7,12)',
        })
        view.current = v
        setStep(2)
        const metas = await Promise.all(TARGETS.map(t => loadMeta(t.slug).catch(() => null)))
        const cat = A.catalog({ name: 'Test targets', sourceSize: 22, color: accent(), shape: 'circle',
          displayLabel: true, labelColumn: 'name', labelColor: '#E8EEF6', labelFont: '600 13px Public Sans' })
        // Markers sit where each star is during the SPHEREx visits, not at its 2016 catalogue position.
        metas.forEach((m, i) => {
          const a = m?.target?.astrometry
          if (m && a) { const [ra, dec] = at(a, midYear(m)); cat.addSources([A.source(ra, dec, { name: TARGETS[i].name, slug: TARGETS[i].slug })]) }
        })
        v.addCatalog(cat)
        epochs.current = A.catalog({ name: 'Then and now', sourceSize: 8, color: 'rgba(0,0,0,0)', shape: 'square',
          displayLabel: true, labelColumn: 'name', labelColor: '#FFFFFF', labelFont: '600 12px Public Sans' })
        v.addCatalog(epochs.current)
        overlay.current = A.graphicOverlay({ color: accent(), lineWidth: 1.5 })
        v.addOverlay(overlay.current)
        v.on('objectClicked', (o: any) => { if (o?.data?.slug) void fly(o.data.slug) })
        const sync = () => { const [ra, dec] = v.getRaDec(); setPos({ ra, dec, fov: v.getFoV()[0] }) }
        v.on('positionChanged', sync)
        v.on('zoomChanged', sync)
        sync()
        setState('ready')
        const want = params.query.get('target')
        if (want && TARGETS.some(t => t.slug === want)) void fly(want)
      } catch (e) {
        console.error('Sky map failed to start:', e)
        if (!dead) setState('failed')
      }
    })()
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function wholeSky() {
    setPicked(null)
    overlay.current?.removeAll?.()
    view.current?.animateToRaDec(266.4, -28.9, 1.2, () => view.current?.zoomToFoV(WHOLE_SKY_FOV, 1.2))
  }
  function switchLayer(k: 'ir' | 'vis') {
    const h = hosts[k]
    if (!h) return
    setLayer(k)
    view.current?.setImageSurvey(h.url)
  }

  const shown = hosts[layer]
  const fovLabel = pos.fov >= 1 ? `${fmt(pos.fov, pos.fov >= 10 ? 0 : 1)}°` : `${fmt(pos.fov * 60, 1)}′`
  const scale = pos.fov > 90 ? 'whole sky' : pos.fov > 5 ? 'constellation' : pos.fov > 0.5 ? 'a few full Moons' : 'SPHEREx cutout scale'
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
        <div className="sky-hud" aria-hidden>
          <span>RA {raHms(((pos.ra % 360) + 360) % 360)}</span>
          <span>Dec {decDms(pos.dec)}</span>
          <span>Field {fovLabel} · {scale}</span>
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
          <button className="btn sm" onClick={wholeSky}>Whole sky</button>
        </div>
      </div>

      <div className={'skycol' + (sheet ? ' open' : '')}>
        <button className="handle" onClick={() => setSheet(o => !o)} aria-expanded={sheet} aria-label={sheet ? 'Lower the panel' : 'Raise the panel'}>
          <span className="handle-t">{picked && info ? info.name : 'Pick a star'}</span>
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
                On the map, the cyan square is the 2 arcminute patch these photos show.
                {(totalDrift(picked.target?.astrometry) ?? 0) > 1 && <> The white circle is where the star was in {THEN}, and the cyan line carries its drift 1,000 years on.</>}
                {(totalDrift(picked.target?.astrometry) ?? 0) > 1 && shown?.name === '2MASS' && <> The background is a 2MASS photo from around {THEN}, so there the star sits in the circle, not in the square.</>}
              </p>
              <a className="btn sm" href={`#/target/${picked.slug}`}>Open the full dashboard</a>
            </div>
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
