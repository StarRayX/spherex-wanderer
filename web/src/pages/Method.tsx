import { Fragment, useEffect, useState } from 'react'
import type { PageProps } from '../lib/router'
import { loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'
import './Method.css'

const B = '/showcase/barnards-star/'
const STEPS = [
  { t: 'Find', d: "Ask NASA's IRSA archive which SPHEREx photos cover the spot, and group them into visits.", img: B + 'visit_00.png', cap: "Barnard's Star, visit of Aug 2025" },
  { t: 'Follow', d: 'Move the star to where the Gaia catalogue predicts it on each date. Nearby stars drift, so an old position is the wrong place to look.', img: '/movers/3i-atlas/frames/01.png', cap: 'Comet 3I/ATLAS, a mover followed along its path' },
  { t: 'Match', d: 'Every pixel of every photo saw its own wavelength. Keep the photos from each visit that saw the same colour of infrared.', img: B + 'visit_01.png', cap: "Barnard's Star, Apr 2026, same 4.9 µm colour" },
  { t: 'Stack', d: 'Line the photos up on one grid and average each visit, so faint things rise above the noise.', img: B + 'visit_02.png', cap: "Barnard's Star, Aug 2026, on the same grid" },
  { t: 'Measure', d: 'Find the star’s centre on each visit, fit its drift with an error bar, and compare it with Gaia.', img: B + 'diff_00_01.png', cap: 'Difference of two visits: the star has moved' },
]

const LIMITS = [
  'SPHEREx pixels are 6.15 arcseconds wide, and most spots have about three visits so far. Only fast, nearby movers show a drift we can measure.',
  'Anything moving fast enough to see here is already in the Gaia catalogue. This is a tool for seeing and checking motion, not for discovering new stars.',
  'Spectra are checked against IRSA’s own tool on one ordinary star only. Spectra of brown dwarfs are labelled preliminary.',
  'Very bright stars overload the detector (R Draconis), and very faint ones sit near the noise (WISE 0855).',
  'Live mode depends on NASA’s archive answering; it can be slow or busy.',
]

export default function Method({ onReady }: PageProps) {
  const [b, setB] = useState<Meta | null>(null)
  useEffect(() => {
    loadMeta('barnards-star').then(setB).catch(() => {}).finally(onReady)
  }, [onReady])

  return (
    <div className="page">
      <h1 style={{ fontSize: 'var(--t-xl)', margin: '0 0 var(--s4)' }}>How it works</h1>

      <div className="me-results">
        <div className="me-result">
          {b?.motion ? <span className="num">{fmt(b.motion.measured_arcsec_per_yr, 2)} ± {fmt(b.motion.error_arcsec_per_yr, 2)} arcsec/yr</span> : <span className="skel" />}
          <h2>Checked against Gaia</h2>
          <p>Barnard's Star's northward drift from {b ? b.visits.length : 3} SPHEREx visits, against Gaia's <span className="num" style={{ display: 'inline', fontSize: 'inherit', color: 'inherit' }}>{b?.motion ? fmt(b.motion.gaia_arcsec_per_yr, 2) : '10.36'}</span>. Inside the error bar.</p>
        </div>
        <div className="me-result">
          <span className="num">within 3.3% on all 11 points</span>
          <h2>Checked against IRSA's tool</h2>
          <p>Our brightness measurements match IRSA's Spectrophotometry Tool on one isolated, unsaturated star. Not yet checked on brown dwarfs.</p>
        </div>
      </div>

      <h2 className="me-h">The five steps</h2>
      <ol className="me-flow">
        {STEPS.map((s, i) => (
          <Fragment key={s.t}>
            {i > 0 && <li className="me-arrow" aria-hidden><svg viewBox="0 0 16 16"><path d="M5 2l6 6-6 6" /></svg></li>}
            <li className="me-step">
              <span className="me-n">{String(i + 1).padStart(2, '0')}</span>
              <img src={s.img} alt={s.cap} loading="lazy" />
              <h3>{s.t}</h3>
              <p>{s.d}</p>
              <span className="me-cap">{s.cap}</span>
            </li>
          </Fragment>
        ))}
      </ol>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Data</h2>
        <p className="check-value">SPHEREx QR2 + QR3</p>
        <p className="sm muted" style={{ margin: 0 }}>Calibrated images from NASA/IPAC's IRSA archive, May 2025 to Oct 2026, read by sky position. Star positions from Gaia DR3.</p>
      </div>

      <div className="grid2" >
        <div className="card">
          <h2 className="card-title">Limits</h2>
          <ul className="notes-list">{LIMITS.map(l => <li key={l}>{l}</li>)}</ul>
        </div>
        <div className="card">
          <h2 className="card-title">Data and tools</h2>
          <ul className="refs">
            <li>NASA SPHEREx Quick Release images: NASA/IPAC Infrared Science Archive (IRSA), doi:10.26131/IRSA652.</li>
            <li>Gaia Data Release 3: ESA/Gaia/DPAC.</li>
            <li>All-sky image tiles (HiPS) and Aladin Lite: CDS, Strasbourg.</li>
            <li>2MASS and DSS2 sky images, used as map backgrounds when SPHEREx tiles are unavailable.</li>
            <li>Astropy, pyvo and reproject for the image pipeline.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
