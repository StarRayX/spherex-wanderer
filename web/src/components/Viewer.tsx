import { useEffect, useMemo, useRef, useState } from 'react'
import type { Meta } from '../lib/types'
import { fmt, monthYear } from '../lib/format'

interface Props {
  meta: Meta
  // Resolves a meta file name to a URL (static showcase or the live API).
  src: (file: string) => string
  autoplay?: boolean
  label?: string
}

type Layer = 'images' | 'changes'

const STEP_MS = 1100

// The PNGs are stored with south at the top (array row 0 = lowest Dec, x grows westward).
// We flip vertically so the view is the standard sky view: north up, east left.
export default function Viewer({ meta, src, autoplay = true, label }: Props) {
  const visits = meta.visits
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(autoplay)
  const [layer, setLayer] = useState<Layer>('images')
  const [zoom, setZoom] = useState(2)
  const [native, setNative] = useState(Math.round((meta.size_arcmin * 60) / meta.pixel_scale_arcsec))
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setIdx(0); setLayer('images'); setPlaying(autoplay) }, [meta.slug, autoplay])

  // Pause the loop when the viewer is off screen, so it does not burn battery behind the fold.
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
  // Difference i compares visit i and i+1. Show the pair that ends on the current visit.
  const diff = layer === 'changes' ? diffs.find(d => d.visits[1] === idx) ?? null : null
  const v = visits[idx]

  // Trail through every detected position up to the current visit, in native pixel centres.
  const trail = useMemo(() => visits.slice(0, idx + 1)
    .map(x => x.star_xy).filter((p): p is [number, number] => !!p)
    .map(([x, y]) => [x + 0.5, y + 0.5] as const), [visits, idx])

  // A visit whose wavelength sits well away from the others breaks the "same colour" promise: say so.
  const median = [...visits.map(x => x.wavelength_um)].sort((a, b) => a - b)[Math.floor(visits.length / 2)]
  const offColour = Math.abs(v.wavelength_um - median) > 0.04 * median
  const saturated = (meta.notes ?? []).some(n => /whole core is masked|saturates on this star/i.test(n))

  // With many visits, label only the ends and the current one so dates never collide.
  const showLabel = (i: number) => visits.length <= 4 || i === 0 || i === visits.length - 1 || i === idx

  const fov = native * meta.pixel_scale_arcsec // arcsec across
  const scaleArcsec = fov > 200 ? 60 : 30
  const scaleFrac = scaleArcsec / fov

  return (
    <div className="viewer">
      <div className="viewer-top mono">
        <span className="tag">{label ?? meta.target?.name ?? meta.slug}</span>
        <span>Visit {idx + 1}/{visits.length}</span>
        <span>{monthYear(v.date)}</span>
        <span className="nocaps">λ {fmt(v.wavelength_um)} µm</span>
      </div>

      <div className="frame" ref={frameRef}>
        <div className="ticks" aria-hidden />
        <div className="sky" style={{ transform: `scaleY(-1) scale(${zoom})` }}>
          {visits.map((x, i) => (
            <img key={x.file} src={src(x.file)} alt="" draggable={false}
              className={i === idx && !diff ? 'on' : ''}
              onLoad={e => i === 0 && setNative(Math.round(e.currentTarget.naturalWidth / meta.upsample))} />
          ))}
          {diffs.filter(d => d.file).map(d => (
            <img key={d.file} src={src(d.file!)} alt="" draggable={false}
              className={'diff ' + (diff && diff.file === d.file ? 'on' : '')} />
          ))}
          <svg className="overlay" viewBox={`0 0 ${native} ${native}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <pattern id="px" width="1" height="1" patternUnits="userSpaceOnUse">
                <path d="M1 0H0V1" fill="none" stroke="var(--rule)" strokeWidth="0.03" />
              </pattern>
            </defs>
            <rect width={native} height={native} fill="url(#px)" opacity="0.6" />
            <circle cx={v.predicted_xy[0] + 0.5} cy={v.predicted_xy[1] + 0.5} r="1.5" className="gaia" />
            {trail.length > 1 && (
              <polyline points={trail.map(p => p.join(',')).join(' ')} className="trail" />
            )}
            {trail.slice(0, -1).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.12" className="dot" />)}
            {v.star_xy && <Reticle x={v.star_xy[0] + 0.5} y={v.star_xy[1] + 0.5} />}
          </svg>
        </div>
        <div className="compass mono" aria-hidden><span className="n">N</span><span className="e">E</span></div>
        <div className="scale mono" aria-hidden>
          <i style={{ width: `${scaleFrac * zoom * 100}%` }} />{scaleArcsec}″
        </div>
        {diff === null && layer === 'changes' && (
          <div className="frame-note">
            {idx === 0 ? 'The first visit has nothing before it to compare with.'
              : diffs.find(d => d.visits[1] === idx)?.skipped
                ? `Not compared: ${diffs.find(d => d.visits[1] === idx)!.skipped}`
                : 'No change picture for this pair.'}
          </div>
        )}
        {v.star_xy === null && <div className="frame-note">Not detected in this visit.</div>}
        {v.star_xy !== null && layer === 'images' && offColour && (
          <div className="frame-note">This visit saw a different shade of infrared ({fmt(v.wavelength_um)} µm), so it can look brighter or dimmer for that reason alone.</div>
        )}
        {saturated && layer === 'images' && (
          <div className="frame-note bottom">The dark centre is missing data: the star is too bright for SPHEREx's detector.</div>
        )}
      </div>

      <div className="controls">
        <button className="btn icon" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="scrub" role="group" aria-label="Visits">
          {visits.map((x, i) => (
            <button key={x.file} className={'stop' + (i === idx ? ' on' : '')}
              onClick={() => { setIdx(i); setPlaying(false) }}
              aria-label={`Visit ${i + 1}, ${monthYear(x.date)}`}>
              <i /><span className="mono">{showLabel(i) ? monthYear(x.date, visits.length > 4) : ''}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Zoom">
          <span className="seg-label mono">Zoom</span>
          {[1, 2].map(z => <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)} aria-pressed={zoom === z}>{z}×</button>)}
        </div>
        {diffs.some(d => d.file) && (
          <div className="seg" role="group" aria-label="Layer">
            <button className={layer === 'images' ? 'on' : ''} onClick={() => setLayer('images')}>Images</button>
            <button className={layer === 'changes' ? 'on' : ''} onClick={() => setLayer('changes')}>What changed</button>
          </div>
        )}
      </div>

      <div className="legend">
        {layer === 'changes'
          ? <span className="wide">What changed: bright where light arrived since the last visit, dark where it left. A moving star leaves a bright and dark pair.</span>
          : <>
            <span><i className="lg-ret" />Where SPHEREx saw it</span>
            <span><i className="lg-gaia" />Where the Gaia star catalogue predicts it</span>
            <span><i className="lg-px" />One SPHEREx pixel = {meta.pixel_scale_arcsec}″ (arcseconds)</span>
            <span className="wide dim">A visit is one pass of SPHEREx over this spot, about every six months.</span>
          </>}
      </div>
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

const PlayIcon =() => <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
const PauseIcon = () => <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
