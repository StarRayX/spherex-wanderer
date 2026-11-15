import { Fragment, useEffect, useState } from 'react'
import type { PageProps } from '../lib/router'
import { loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'
import PageTabs from '../components/PageTabs'
import BalancedList from '../components/BalancedList'
import './Method.css'

const B = '/showcase/barnards-star/'
const STEPS = [
  { t: 'Find', d: "Find the SPHEREx photos of the spot in NASA's IRSA archive and group them into visits.", img: B + 'visit_00.png', cap: "Barnard's Star, visit of Aug 2025" },
  { t: 'Follow', d: 'Look where Gaia predicts the star on each date. Nearby stars drift, so an old position would miss them.', img: '/movers/3i-atlas/frames/01.png', cap: 'Comet 3I/ATLAS, a mover followed along its path' },
  { t: 'Match', d: 'Each pixel sees its own wavelength. Keep the photos from each visit that saw the same infrared colour.', img: B + 'visit_01.png', cap: "Barnard's Star, Apr 2026, same 4.9 µm colour" },
  { t: 'Stack', d: 'Align the photos on one grid and average each visit, so faint sources rise above the noise.', img: B + 'visit_02.png', cap: "Barnard's Star, Aug 2026, on the same grid" },
  { t: 'Measure', d: 'Find the star’s centre on each visit, fit its drift with an error bar, and compare it with Gaia.', img: B + 'diff_00_01.png', cap: 'Difference of two visits: the star has moved' },
]

const LIMITS = [
  'Pixels are 6.15 arcseconds wide and most spots have about three visits, so only fast, nearby stars show a measurable drift.',
  'Anything moving fast enough to see here is already in Gaia. This tool shows and checks motion; it doesn’t discover new stars.',
  'Spectra are checked against IRSA’s tool on one ordinary star only; brown dwarf spectra are marked preliminary.',
  'Very bright stars saturate the detector (R Draconis); very faint ones sit near the noise (WISE 0855).',
  'Live lookups depend on NASA’s archive, which can be slow or busy.',
]

const METHOD_TABS = [{ id: 'overview', label: 'Overview' }, { id: 'data', label: 'Data and limits' }] as const
type MethodTab = (typeof METHOD_TABS)[number]['id']

export default function Method({ params, onReady }: PageProps) {
  const [b, setB] = useState<Meta | null>(null)
  // The tab lives in the URL (#/method/<tab>), so links and the back button keep it.
  const tab: MethodTab = METHOD_TABS.some(t => t.id === params.slug) ? (params.slug as MethodTab) : 'overview'
  const setTab = (id: MethodTab) => { location.hash = `#/method/${id}` }
  useEffect(() => {
    loadMeta('barnards-star').then(setB).catch(() => {}).finally(onReady)
  }, [onReady])

  return (
    <div className="page">
      <h1>How it works</h1>

      <PageTabs tabs={METHOD_TABS} value={tab} onChange={setTab} label="Method sections" />

      {tab === 'overview' && <>
      <div className="me-results">
        <div className="me-result">
          {b?.motion ? <span className="num">{fmt(b.motion.measured_arcsec_per_yr, 2)} ± {fmt(b.motion.error_arcsec_per_yr, 2)} arcsec/yr</span> : <span className="skel" />}
          <h2>Checked against Gaia</h2>
          <p>Barnard's Star's northward drift over {b ? b.visits.length : 3} SPHEREx visits. Gaia: <span className="num" style={{ display: 'inline', fontSize: 'inherit', color: 'inherit' }}>{b?.motion ? fmt(b.motion.gaia_arcsec_per_yr, 2) : '10.36'}</span>, inside our error bar.</p>
        </div>
        <div className="me-result">
          <span className="num">within 3.3% on all 11 points</span>
          <h2>Checked against IRSA's tool</h2>
          <p>Matches IRSA's Spectrophotometry Tool on one isolated, unsaturated star. Not yet checked on brown dwarfs.</p>
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
      </>}

      {tab === 'data' && <div className="notes-stack">

      <section className="card">
        <h2 className="card-title">Data</h2>
        <p className="check-value">SPHEREx QR2 + QR3</p>
        <p className="notes-intro">Calibrated images from NASA/IPAC's IRSA archive, May 2025 to Oct 2026. Star positions from Gaia DR3.</p>
      </section>

      <section className="card">
        <h2 className="card-title">Data and tools</h2>
        <BalancedList className="refs" items={[
          'NASA SPHEREx Quick Release images: NASA/IPAC Infrared Science Archive (IRSA), doi:10.26131/IRSA652.',
          'Gaia Data Release 3: ESA/Gaia/DPAC.',
          'All-sky image tiles (HiPS) and Aladin Lite: CDS, Strasbourg.',
          '2MASS and DSS2 sky images: map backgrounds when SPHEREx tiles are unavailable.',
          'Astropy, pyvo and reproject for the image pipeline.',
        ]} />
      </section>
      <section className="card">
        <h2 className="card-title">Limits</h2>
        <BalancedList items={LIMITS} />
      </section>
      </div>}
    </div>
  )
}
