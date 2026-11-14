import { useEffect, useMemo, useRef, useState } from 'react'
import type { Meta } from '../lib/types'
import { fmt, monthYear } from '../lib/format'
import './Viewer.css'

interface Props {
  meta: Meta
  // Resolves a meta file name to a URL (static showcase or the live API).
  src: (file: string) => string
  autoplay?: boolean
  compact?: boolean
}

type Layer = 'images' | 'changes'
const STEP_MS = 1100

// The PNGs are stored with south at the top (array row 0 = lowest Dec, x grows westward).
// We flip vertically so the view is the standard sky view: north up, east left.
export default function Viewer({ meta, src, autoplay = true, compact = false }: Props) {
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

  return (
    <div className="viewer">
      <div className="viewer-top">
        <b>Visit {idx + 1} of {visits.length}</b>
        <span>{monthYear(v.date)}</span>
        <span className="mono">λ {fmt(v.wavelength_um)} µm</span>
        {compact && (<>{diffs.some(d => d.file) && ( <button className="chip-btn" onClick={() => setLayer(l => (l === 'changes' ? 'images' : 'changes'))} aria-pressed={layer === 'changes'} title="Show only what changed since the last visit">Changes</button> )}</>)}
      </div>

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
            <circle cx={v.predicted_xy[0] + 0.5} cy={v.predicted_xy[1] + 0.5} r="1.5" className="gaia" />
            {trail.length > 1 && <polyline points={trail.map(p => p.join(',')).join(' ')} className="trail" />}
            {trail.slice(0, -1).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.12" className="dot" />)}
            {v.star_xy && <Reticle x={v.star_xy[0] + 0.5} y={v.star_xy[1] + 0.5} />}
          </svg>
        </div>
        {!loaded && <div className="frame-skel skel" aria-hidden />}
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

      <div className="controls">
        <button className="icon-btn" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="scrub" role="group" aria-label="Visits">
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

      {!compact && (
        <ul className="legend">
          {layer === 'changes'
            ? <li className="full">Bright: light that arrived. Dark: light that left.</li>
            : <>
              <li><i className="lg-ret" />SPHEREx sees it here</li>
              <li><i className="lg-gaia" />Gaia predicts here</li>
            </>}
        </ul>
      )}
    </div>
  )
}

// Four ticks around the measured centre, leaving the star itself visible.
function Reticle({ x, y }: { x: number; y: number }) {
  const a = 2.1, b = 3.2
  return (
    <g className="reticle">
      <line x1={x - b} x2={x - a} y1={y} y2={y} /><line x1={x + a} x2={x + b} y1={y} y2={y} />
      <line x1={x} x2={x} y1={y - b} y2={y - a} /><line x1={x} x2={x} y1={y + a} y2={y + b} />
    </g>
  )
}

const PlayIcon = () => <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor" /></svg>
const PauseIcon = () => <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
