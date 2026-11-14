import { useEffect, useState } from 'react'
import { getJson } from '../lib/download'
import { wlColor } from '../lib/wavelength'
import './HeroBlink.css'

type Frame = { file: string; iso: string; wavelength_um: number; size_deg: number }

const BASE = '/movers/3i-atlas'
const MS = 700
// IRSA's position uncertainty for the predicted comet position, in arcsec.
const RADIUS_ARCSEC = 24.6
const SIZE = 232 // frame images are 232 x 232 px

const date = (iso: string) => new Date(iso + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function HeroBlink() {
  const [frames, setFrames] = useState<Frame[]>([])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    let live = true
    getJson<Frame[]>(`${BASE}/frames.json`).then(f => {
      if (!live) return
      f.forEach(fr => { const im = new Image(); im.src = `${BASE}/${fr.file}` })
      setFrames(f)
    }).catch(() => setFrames([]))
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!playing || frames.length < 2) return
    const t = window.setInterval(() => setI(k => (k + 1) % frames.length), MS)
    return () => window.clearInterval(t)
  }, [playing, frames.length])

  if (!frames.length) return <div className="hb" aria-hidden><div className="hb-img hb-skel" /></div>

  const f = frames[i]
  const r = (RADIUS_ARCSEC / 3600 / f.size_deg) * SIZE
  const um = f.wavelength_um

  return (
    <figure className="hb">
      <div className="hb-img">
        <img src={`${BASE}/${f.file}`} width={SIZE} height={SIZE} alt={`3I/ATLAS at ${um.toFixed(2)} µm, SPHEREx, ${date(f.iso)}`} />
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={r} />
          <text x={SIZE / 2 + r + 6} y={SIZE / 2 + 4}>3I/ATLAS</text>
        </svg>
      </div>
      <figcaption className="hb-cap">
        <span className="hb-wl"><span className="hb-sw" style={{ background: wlColor(um) }} aria-hidden />{um.toFixed(2)} µm</span>
        <span> · frame {i + 1} of {frames.length}</span>
        <span className="hb-date">{date(f.iso)}</span>
      </figcaption>
      <div className="hb-row">
        <button type="button" className="hb-btn" aria-pressed={!playing} onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play'}</button>
        <a className="hb-link" href="#/movers/3i-atlas">See its spectrum →</a>
      </div>
    </figure>
  )
}
