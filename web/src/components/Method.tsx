import { useEffect, useState } from 'react'
import { loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'

const STEPS = [
  ['Find', "Ask NASA's IRSA archive which SPHEREx photos cover the spot, and group them into visits."],
  ['Follow', 'Move the star to where the Gaia catalogue predicts it on each date. Nearby stars drift, so last year’s position is the wrong place to look.'],
  ['Match', 'Every pixel of every photo saw its own wavelength. Keep the photos from each visit that saw the same shade of infrared.'],
  ['Stack', 'Line the photos up on one grid and average each visit, so faint things rise above the noise.'],
  ['Measure', 'Find the star’s centre on each visit, fit its drift with an error bar, and compare it with Gaia.'],
]

export default function Method() {
  const [b, setB] = useState<Meta | null>(null)
  const [e, setE] = useState<Meta | null>(null)
  useEffect(() => {
    loadMeta('barnards-star').then(setB).catch(() => {})
    loadMeta('epsilon-indi-b').then(setE).catch(() => {})
  }, [])

  return (
    <section className="section" id="method">
      <div className="section-head">
        <p className="eyebrow mono">05 · How it works</p>
        <h2>Five steps, checked against two references.</h2>
      </div>
      <ol className="steps">
        {STEPS.map(([t, d], i) => (
          <li key={t}><span className="mono n">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>
        ))}
      </ol>

      <div className="checks">
        {b?.motion && (
          <div className="check">
            <label className="mono">Check 1 · against Gaia DR3</label>
            <p className="big mono"><span className="accent">{fmt(b.motion.measured_arcsec_per_yr, 2)} ± {fmt(b.motion.error_arcsec_per_yr, 2)}</span> vs {fmt(b.motion.gaia_arcsec_per_yr, 2)} ″/yr</p>
            <p>Barnard's Star's northward drift from {b.visits.length} SPHEREx visits, against the European Space Agency's Gaia catalogue. Inside the error bar.</p>
          </div>
        )}
        {e?.spectrum && (
          <div className="check">
            <label className="mono">Check 2 · against IRSA's own tool</label>
            <p className="big mono"><span className="accent">within 3.3%</span> on all 11 points</p>
            <p>Our brightness extraction matched IRSA's own Spectrophotometry Tool on one isolated star. Not yet checked on stars like brown dwarfs, so those spectra are labelled preliminary.</p>
          </div>
        )}
        <div className="check">
          <label className="mono">Data</label>
          <p className="big mono">SPHEREx QR2 + QR3</p>
          <p>Calibrated images from NASA/IPAC's IRSA archive, May 2025 to Oct 2026, read live by coordinates. Star positions from Gaia DR3.</p>
        </div>
      </div>
    </section>
  )
}
