import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Meta } from '../lib/types'
import { fmt, monthYear } from '../lib/format'
import './Viewer.css'

interface Props {
  meta: Meta
  // Resolves a meta file name to a URL (static showcase or the live API).
  src: (file: string) => string
  autoplay?: boolean
  compact?: boolean
  // Optional side column (wide screens): the visit line and legend move into it, between `top` and `bottom`.
  aside?: { top: ReactNode; bottom: ReactNode }
}

type Layer = 'images' | 'changes'
const STEP_MS = 1100

// The PNGs are stored with south at the top (array row 0 = lowest Dec, x grows westward).
// We flip vertically so the view is the standard sky view: north up, east left.
export default function Viewer({ meta, src, autoplay = true, compact = false, aside }: Props) {
  const visits = meta.visits
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(autoplay)
  const [layer, setLayer] = useState<Layer>('images')
  const [zoom, setZoom] = useState(2)
  const [native, setNative] = useState(Math.round((meta.size_arcmin * 60) / meta.pixel_scale_arcsec))
  const [loaded, setLoaded] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setIdx(0); setLayer('images'); setPlaying(autoplay); setLoaded(false) }, [meta.slug, autoplay])

  // Pause the loop when the viewer is off screen.
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!playing || !visible || visits.length < 2) return
    const t = setInterval(() => setIdx(i => (i + 1) % visits.length), STEP_MS)
    return () => clearInterval(t)
  }, [playing, visible, visits.length])

  const diffs = meta.differences ?? []
  const pair = diffs.find(d => d.visits[1] === idx) ?? null
  const diff = layer === 'changes' && pair?.file ? pair : null
  const v = visits[idx]

  const trail = useMemo(() => visits.slice(0, idx + 1)
    .map(x => x.star_xy).filter((p): p is [number, number] => !!p)
    .map(([x, y]) => [x + 0.5, y + 0.5] as const), [visits, idx])

  // A visit whose wavelength sits well away from the others breaks the "same colour" promise: say so.
  const median = [...visits.map(x => x.wavelength_um)].sort((a, b) => a - b)[Math.floor(visits.length / 2)]
  const offColour = Math.abs(v.wavelength_um - median) > 0.04 * median
  const saturated = (meta.notes ?? []).some(n => /whole core is masked|saturates on this star/i.test(n))
  const showLabel = (i: number) => visits.length <= (compact ? 3 : 4) || i === 0 || i === visits.length - 1 || i === idx

  const fov = native * meta.pixel_scale_arcsec
  const scaleArcsec = fov > 200 ? 60 : 30

  const top = (
      <div className="viewer-top">
        <b>Visit {idx + 1} of {visits.length}</b>
        <span>{monthYear(v.date)}</span>
        <span className="mono">λ {fmt(v.wavelength_um)} µm</span>
        {compact && (<>{diffs.some(d => d.file) && ( <button className="chip-btn" onClick={() => setLayer(l => (l === 'changes' ? 'images' : 'changes'))} aria-pressed={layer === 'changes'} title="Show only what changed since the last visit">Changes</button> )}</>)}
      </div>
  )

  const frame = (
      <div className="frame" ref={frameRef}>
        <div className="sky" style={{ transform: `scaleY(-1) scale(${zoom})` }}>
          {visits.map((x, i) => (
            <img key={x.file} src={src(x.file)} alt="" draggable={false} className={i === idx && !diff ? 'on' : ''}
              onLoad={e => { if (i === 0) { setNative(Math.round(e.currentTarget.naturalWidth / meta.upsample)); setLoaded(true) } }} />
          ))}
          {diffs.filter(d => d.file).map(d => (
            <img key={d.file} src={src(d.file!)} alt="" draggable={false} className={diff && diff.file === d.file ? 'on' : ''} />
          ))}
          <svg className="overlay" viewBox={`0 0 ${native} ${native}`} preserveAspectRatio="none" aria-hidden>
            {/* Faint crosshair through the measured position, across the whole frame. */}
            {v.star_xy && <g className="xhair">
              <line x1={-native} x2={2 * native} y1={v.star_xy[1] + 0.5} y2={v.star_xy[1] + 0.5} />
              <line x1={v.star_xy[0] + 0.5} x2={v.star_xy[0] + 0.5} y1={-native} y2={2 * native} />
            </g>}
            {/* Gaia's prediction for every visit so far; older ones are fainter. */}
            {visits.slice(0, idx + 1).map((x, i) => (
              <circle key={'g' + i} cx={x.predicted_xy[0] + 0.5} cy={x.predicted_xy[1] + 0.5} r={R_GAIA} className="gaia" style={{ opacity: age(i, idx) }} />
            ))}
            {trail.length > 1 && <>
              <polyline points={trail.map(p => p.join(',')).join(' ')} className="trail-halo" />
              <polyline points={trail.map(p => p.join(',')).join(' ')} className="trail" />
              <Arrow from={trail[trail.length - 2]} to={trail[trail.length - 1]} />
            </>}
            {/* Past measured positions, fading with age. */}
            {trail.slice(0, -1).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={R_DOT} className="dot" style={{ opacity: age(i, idx) }} />)}
            {v.star_xy && <Reticle x={v.star_xy[0] + 0.5} y={v.star_xy[1] + 0.5} />}
          </svg>
        </div>
        {!loaded && <div className="frame-skel skel" aria-hidden />}
        <div className="vf" aria-hidden><i /><i /><i /><i /></div>
        {idx > 0 && v.star_xy && (
          <span className="frame-tag" aria-hidden style={{
            left: `${(((v.star_xy[0] + 0.5) / native - 0.5) * zoom + 0.5) * 100}%`,
            top: `${((0.5 - (v.star_xy[1] + 0.5) / native) * zoom + 0.5 + (R_TICK / native) * zoom) * 100}%`,
          }}>{monthYear(visits[0].date, true)} → {monthYear(v.date, true)}</span>
        )}
        <div className="compass" aria-hidden><span className="n">N</span><span className="e">E</span></div>
        <div className="scalebar" aria-hidden><i style={{ width: `${(scaleArcsec / fov) * zoom * 100}%` }} />{scaleArcsec}″</div>
        {layer === 'changes' && !diff && (
          <div className="frame-note">{idx === 0 ? 'The first visit has nothing before it to compare with.'
            : pair?.skipped ? `Not compared: ${pair.skipped}` : 'No change picture for this pair.'}</div>
        )}
        {v.star_xy === null && <div className="frame-note">Not detected in this visit.</div>}
        {v.star_xy !== null && layer === 'images' && offColour && (
          <div className="frame-note">This visit saw a different colour of infrared ({fmt(v.wavelength_um)} µm), so it can look brighter or dimmer for that reason alone.</div>
        )}
        {saturated && layer === 'images' && <div className="frame-note info">The star is too bright for SPHEREx's detector: its centre is filled in white and not measured.</div>}
      </div>
  )

  const controls = (
      <div className="controls">
        <button className="icon-btn" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="scrub" role="group" aria-label="Visits" style={{ ['--n' as string]: visits.length }}>
          {visits.map((x, i) => (
            <button key={x.file} className={'stop' + (i === idx ? ' on' : '')} onClick={() => { setIdx(i); setPlaying(false) }}
              aria-label={`Visit ${i + 1}, ${monthYear(x.date)}`}>
              <i /><span>{showLabel(i) ? monthYear(x.date, compact || visits.length > 4) : ''}</span>
            </button>
          ))}
        </div>
        <button className="chip-btn" onClick={() => setZoom(z => (z === 2 ? 1 : 2))} aria-pressed={zoom === 2} title="Zoom in on the star">2×</button>
        {!compact && (<>{diffs.some(d => d.file) && ( <button className="chip-btn" onClick={() => setLayer(l => (l === 'changes' ? 'images' : 'changes'))} aria-pressed={layer === 'changes'} title="Show only what changed since the last visit">Changes</button> )}</>)}
      </div>
  )

  const legend = !compact && (
        <ul className="legend">
          {layer === 'changes'
            ? <li className="full">Bright: light that arrived. Dark: light that left.</li>
            : <>
              <li><i className="lg-ret" />SPHEREx sees it here</li>
              <li><i className="lg-gaia" />Gaia predicts here</li>
            </>}
        </ul>
  )

  if (aside) {
    return (
      <div className="viewer viewer-split">
        <div className="viewer-main">{frame}{controls}</div>
        <div className="viewer-aside">
          <div className="va-top">{aside.top}</div>
          <div className="va-mid">{top}{legend}</div>
          <div className="va-bottom">{aside.bottom}</div>
        </div>
      </div>
    )
  }
  return <div className="viewer">{top}{frame}{controls}{legend}</div>
}

// Overlay sizes, in image pixels (the overlay scales with the image and the 2x zoom).
const R_RING = 1.7 // measuring ring: just outside the star's glow at 2x
const R_TICK = 2.35 // ticks run from the ring out to here
const R_GAIA = 0.24
const R_DOT = 0.15
// Opacity for visit i when visit `now` is shown: the newest is solid, older ones fade.
const age = (i: number, now: number) => (now === 0 ? 1 : 0.4 + 0.6 * (i / now))

// A thin measuring ring with four ticks outside it, leaving the star itself visible.
function Reticle({ x, y }: { x: number; y: number }) {
  const a = R_RING, b = R_TICK
  return (
    <g className="reticle">
      <circle cx={x} cy={y} r={a} />
      <line x1={x - b} x2={x - a} y1={y} y2={y} /><line x1={x + a} x2={x + b} y1={y} y2={y} />
      <line x1={x} x2={x} y1={y - b} y2={y - a} /><line x1={x} x2={x} y1={y + a} y2={y + b} />
    </g>
  )
}

// Arrowhead on the trail's last step, pointing along that step, with its tip on the current position.
function Arrow({ from, to }: { from: readonly [number, number]; to: readonly [number, number] }) {
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy)
  if (len < 0.2) return null
  const ux = dx / len, uy = dy / len, L = Math.min(0.34, len * 0.6), W = L * 0.55
  const bx = to[0] - ux * L, by = to[1] - uy * L
  return <polygon className="arrow" points={`${to[0]},${to[1]} ${bx - uy * W},${by + ux * W} ${bx + uy * W},${by - ux * W}`} />
}

const PlayIcon = () => <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor" /></svg>
const PauseIcon = () => <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
