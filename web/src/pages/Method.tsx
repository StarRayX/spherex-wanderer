import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/router'
import { loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'

const STEPS = [
  ['Find', "Ask NASA's IRSA archive which SPHEREx photos cover the spot, and group them into visits."],
  ['Follow', 'Move the star to where the Gaia catalogue predicts it on each date. Nearby stars drift, so an old position is the wrong place to look.'],
  ['Match', 'Every pixel of every photo saw its own wavelength. Keep the photos from each visit that saw the same colour of infrared.'],
  ['Stack', 'Line the photos up on one grid and average each visit, so faint things rise above the noise.'],
  ['Measure', 'Find the star’s centre on each visit, fit its drift with an error bar, and compare it with Gaia.'],
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
  const [e, setE] = useState<Meta | null>(null)
  useEffect(() => {
    Promise.all([
      loadMeta('barnards-star').then(setB).catch(() => {}),
      loadMeta('epsilon-indi-b').then(setE).catch(() => {}),
    ]).finally(onReady)
  }, [onReady])

  return (
    <div className="page">
      <h1 style={{ fontSize: 'var(--t-xl)', margin: '0 0 24px' }}>How it works</h1>

      <div className="card">
        <ol className="pipeline">
          {STEPS.map(([t, d], i) => <li key={t}><span className="n" aria-hidden>{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}
        </ol>
      </div>

      <div className="grid3" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 className="card-title">Checked against Gaia</h2>
          {b?.motion ? <>
            <p className="check-value"><span className="hl">{fmt(b.motion.measured_arcsec_per_yr, 2)} ± {fmt(b.motion.error_arcsec_per_yr, 2)}</span> vs {fmt(b.motion.gaia_arcsec_per_yr, 2)}</p>
            <p className="sm muted" style={{ margin: 0 }}>Barnard's Star's northward drift in arcseconds a year, from {b.visits.length} SPHEREx visits, against the European Space Agency's Gaia catalogue. Inside the error bar.</p>
          </> : <span className="skel skel-big" />}
        </div>
        <div className="card">
          <h2 className="card-title">Checked against IRSA's tool</h2>
          {e?.spectrum ? <>
            <p className="check-value"><span className="hl">within 3.3%</span> on all 11 points</p>
            <p className="sm muted" style={{ margin: 0 }}>Our brightness measurements matched IRSA's Spectrophotometry Tool on one isolated star. Not yet checked on brown dwarfs.</p>
          </> : <span className="skel skel-big" />}
        </div>
        <div className="card">
          <h2 className="card-title">Data</h2>
          <p className="check-value">SPHEREx QR2 + QR3</p>
          <p className="sm muted" style={{ margin: 0 }}>Calibrated images from NASA/IPAC's IRSA archive, May 2025 to Oct 2026, read by sky position. Star positions from Gaia DR3.</p>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
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
