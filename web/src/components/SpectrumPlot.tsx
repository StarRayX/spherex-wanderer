import { useEffect, useMemo, useRef, useState } from 'react'
import type { Spectrum } from '../lib/types'
import { fmt } from '../lib/format'

// Approximate wavelength coverage of SPHEREx's six detector bands, in microns.
const BANDS: [string, number, number][] = [
  ['D1', 0.75, 1.09], ['D2', 1.10, 1.62], ['D3', 1.63, 2.41],
  ['D4', 2.42, 3.82], ['D5', 3.83, 4.41], ['D6', 4.42, 5.0],
]

const W = 720, H = 300, PAD = { l: 52, r: 16, t: 28, b: 44 }
const X0 = 0.7, X1 = 5.05

interface Note { at: number; text: string }
type Pt = { w: number; f: number; e: number }

// Break the line where no photo was sampled, so it never implies data across a gap.
const GAP_UM = 0.5
function segments(pts: Pt[]) {
  const out: Pt[][] = []
  pts.forEach((p, i) => {
    if (i === 0 || p.w - pts[i - 1].w > GAP_UM) out.push([p])
    else out[out.length - 1].push(p)
  })
  return out
}

export default function SpectrumPlot({ spectrum, notes = [] }: { spectrum: Spectrum; notes?: Note[] }) {
  const pts = useMemo(() => spectrum.wavelength_um
    .map((w, i) => ({ w, f: spectrum.flux_mjy[i], e: spectrum.err_mjy[i] }))
    .sort((a, b) => a.w - b.w), [spectrum])
  const yMax = Math.ceil(Math.max(...pts.map(p => p.f + p.e)) / 10) * 10
  const x = (w: number) => PAD.l + ((w - X0) / (X1 - X0)) * (W - PAD.l - PAD.r)
  const y = (f: number) => H - PAD.b - (f / yMax) * (H - PAD.t - PAD.b)

  // Draw the points in one by one the first time the plot scrolls into view.
  const ref = useRef<SVGSVGElement>(null)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let t: ReturnType<typeof setInterval> | undefined
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || t) return
      t = setInterval(() => setShown(n => {
        if (n >= pts.length) { clearInterval(t); return n }
        return n + 1
      }), 35)
    }, { threshold: 0.1 })
    io.observe(el)
    return () => { io.disconnect(); if (t) clearInterval(t) }
  }, [pts.length])

  const [hover, setHover] = useState<number | null>(null)
  const vis = pts.slice(0, shown)
  const yTicks = [0, yMax / 2, yMax]

  return (
    <figure className="spectrum">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Brightness of the object at ${pts.length} infrared wavelengths from ${fmt(pts[0].w)} to ${fmt(pts[pts.length - 1].w)} microns`}>
        {BANDS.map(([n, a, b], i) => (
          <g key={n}>
            <rect x={x(a)} y={PAD.t} width={x(b) - x(a)} height={H - PAD.t - PAD.b}
              className={i % 2 ? 'band alt' : 'band'} />
            <text x={(x(a) + x(b)) / 2} y={PAD.t - 10} className="band-label">{n}</text>
          </g>
        ))}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="gridline" />
            <text x={PAD.l - 8} y={y(t) + 4} className="axis-num" textAnchor="end">{t}</text>
          </g>
        ))}
        {[1, 2, 3, 4, 5].map(w => (
          <text key={w} x={x(w)} y={H - PAD.b + 18} className="axis-num" textAnchor="middle">{w} µm</text>
        ))}
        <text x={(W + PAD.l) / 2} y={H - 6} className="axis-label" textAnchor="middle">wavelength · longer = redder</text>
        <text x={14} y={(H - PAD.b + PAD.t) / 2} className="axis-label" textAnchor="middle"
          transform={`rotate(-90 14 ${(H - PAD.b + PAD.t) / 2})`}>brightness</text>

        {segments(vis).map((seg, i) => seg.length > 1 &&
          <polyline key={i} className="spec-line" points={seg.map(p => `${x(p.w)},${y(p.f)}`).join(' ')} />)}
        {vis.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="spec-pt">
            <line x1={x(p.w)} x2={x(p.w)} y1={y(p.f - p.e)} y2={y(p.f + p.e)} className="err" />
            <circle cx={x(p.w)} cy={y(p.f)} r={hover === i ? 5 : 3.2} />
            <rect x={x(p.w) - 8} y={PAD.t} width={16} height={H - PAD.t - PAD.b} fill="transparent" />
          </g>
        ))}
        {shown >= pts.length && notes.map((n, k) => {
          const p = pts.reduce((a, b) => Math.abs(b.w - n.at) < Math.abs(a.w - n.at) ? b : a)
          const above = y(p.f) > H / 2
          const ty = above ? y(p.f) - 44 - k * 4 : y(p.f) + 52
          return (
            <g key={n.text} className="note">
              <line x1={x(p.w)} x2={x(p.w)} y1={above ? y(p.f) - 8 : y(p.f) + 8} y2={above ? ty + 6 : ty - 14} />
              <text x={x(p.w)} y={ty} textAnchor="middle">{n.text}</text>
            </g>
          )
        })}
        {hover !== null && vis[hover] && (
          <g className="tip" transform={`translate(${Math.min(x(vis[hover].w) + 10, W - 150)},${PAD.t + 8})`}>
            <rect width="140" height="40" rx="2" />
            <text x="8" y="16">λ {fmt(vis[hover].w)} µm</text>
            <text x="8" y="32">{fmt(vis[hover].f, 1)} ± {fmt(vis[hover].e, 1)} mJy</text>
          </g>
        )}
      </svg>
      <figcaption className="fine">
        Each dot is one SPHEREx photo. Brightness is in millijanskys (mJy), the unit astronomers use for faint light.
        The shaded columns D1 to D6 are SPHEREx's six detectors, each covering one slice of infrared.
        {notes.length > 0 && <span className="notes-inline"> {notes.map(n => n.text[0].toUpperCase() + n.text.slice(1)).join('. ')}.</span>}
      </figcaption>
    </figure>
  )
}
