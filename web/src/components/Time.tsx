import { useEffect, useState } from 'react'
import { imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt, monthYear } from '../lib/format'

// The first thing that changes: position. A static filmstrip of Barnard's Star, one frame per visit,
// all at nearly the same wavelength so brightness stays put and only the position moves.
export default function Time() {
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => { loadMeta('barnards-star').then(setMeta).catch(() => setMeta(null)) }, [])
  if (!meta) return null
  const n = Math.round((meta.size_arcmin * 60) / meta.pixel_scale_arcsec) + 1

  return (
    <section className="section" id="time">
      <div className="section-head">
        <p className="eyebrow mono">01 · Time</p>
        <h2>Same star, same colour, three dates.</h2>
        <p className="lede">
          SPHEREx comes back to every patch of sky about twice a year. We pick photos taken at nearly the same
          shade of infrared on each visit, so the star's brightness stays steady and the only thing left to change
          is where it is.
        </p>
      </div>
      <div className="filmstrip">
        {meta.visits.map((v, i) => (
          <figure key={v.file} className="film">
            <div className="film-img">
              <img src={imageUrl(meta.slug, v.file)} alt={`Barnard's Star, ${monthYear(v.date)}`} />
              <svg viewBox={`0 0 ${n} ${n}`} aria-hidden>
                <line x1={n / 2} x2={n / 2} y1="0" y2={n} className="ref" />
                <line x1="0" x2={n} y1={n / 2} y2={n / 2} className="ref" />
              </svg>
            </div>
            <figcaption className="mono">
              <b>{monthYear(v.date)}</b>
              <span>λ {fmt(v.wavelength_um)} µm</span>
              {i > 0 && <span className="accent">+{Math.round((v.mjd - meta.visits[0].mjd) / 30.44)} months</span>}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="fine center">The crosshairs stay fixed. Watch the star slide upward (north) against them.</p>
    </section>
  )
}
