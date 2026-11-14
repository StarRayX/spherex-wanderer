import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/router'
import { imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { monthYear } from '../lib/format'
import { Logo } from '../components/Logo'
import HeroBlink from '../components/HeroBlink'
import './Home.css'

// Fallbacks for the validation card if the Barnard's Star file cannot load (values from the pipeline run, docs/evidence_notes.md).
const BARNARD = { measured: 10.55, error: 0.71, gaia: 10.36 }

const ARROW = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>

export default function Home({ onReady }: PageProps) {
  const [b, setB] = useState<Meta | null>(null)

  useEffect(() => {
    loadMeta('barnards-star').then(setB).catch(() => setB(null)).finally(onReady)
  }, [onReady])

  const m = b?.motion
  const measured = m?.measured_arcsec_per_yr ?? BARNARD.measured
  const error = m?.error_arcsec_per_yr ?? BARNARD.error
  const gaia = m?.gaia_arcsec_per_yr ?? BARNARD.gaia
  const n = b ? Math.round((b.size_arcmin * 60) / b.pixel_scale_arcsec) + 1 : 21

  return (
    <div className="home">
      <div className="home-bg" aria-hidden><div className="stars" /></div>
      <div className="home-inner">
        <div className="brand-line"><Logo height={32} /><span><b>Wanderer</b></span></div>
        <div className="hm-hero">
          <h1>
            NASA's archive tells you which SPHEREx images caught an asteroid or comet.
            <span className="h1-2">We give you its measured spectrum as a table.</span>
          </h1>
          <HeroBlink />
        </div>
        <p className="def">Wanderer measures comets and asteroids in NASA SPHEREx images. IRSA's tools list the images; we measure the object in each one.</p>
        <div className="hm-tools">
          <a className="hm-tool" href="#/movers">
            <h2>Moving objects</h2>
            <p>Pick a comet or an asteroid. Get its brightness at every infrared colour SPHEREx saw, with error bars, as a table you can download as CSV, VOTable or JSON.</p>
            <span className="hm-go">Moving objects {ARROW}</span>
          </a>
          <a className="hm-tool" href="#/triage">
            <h2>Vet a field</h2>
            <p>Shows every change between visits in two pre-run fields, sorted with evidence.</p>
            <span className="hm-go">Vet a field {ARROW}</span>
          </a>
        </div>

        <p className="hm-who muted sm">For solar-system researchers, Backyard Worlds and Source Discovery volunteers, and educators.</p>

        <p className="hm-more sm">
          <a href="#/sky">Sky map</a>
          <a href="#/target/barnards-star">Test stars</a>
          <a href="#/any">Any spot</a>
          <a href="#/method">Method</a>
        </p>

        <a className="hm-valid" href="#/target/barnards-star/visits">
          <div className="hm-valid-text">
            <h2>Validation: Barnard's Star</h2>
            <p className="hm-num">{measured.toFixed(2)} ± {error.toFixed(2)} arcsec per year, Gaia {gaia.toFixed(2)}</p>
            <p>This checks the code; it is not new science.</p>
            <span className="pv-cap">See the images {ARROW}</span>
          </div>
          <div className="pv-strip">
            {b ? b.visits.map(v => (
              <figure key={v.file}>
                <img src={imageUrl(b.slug, v.file)} alt={`Barnard's Star, ${monthYear(v.date)}`} />
                <svg viewBox={`0 0 ${n} ${n}`} aria-hidden><line x1={n / 2} x2={n / 2} y1="0" y2={n} className="ref" /><line x1="0" x2={n} y1={n / 2} y2={n / 2} className="ref" /></svg>
                <figcaption>{monthYear(v.date, true)}</figcaption>
              </figure>
            )) : [0, 1, 2].map(i => <span key={i} className="skel skel-box" />)}
          </div>
        </a>
      </div>
    </div>
  )
}
