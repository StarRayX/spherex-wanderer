import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/router'
import { imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt, monthYear } from '../lib/format'
import Mark from '../components/Mark'
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
        <div className="brand-line"><Mark size={32} /><span>SPHEREx <b>Blink</b></span></div>
        <h1>
          MOST tells you which SPHEREx images caught an asteroid or comet.
          <span className="h1-2">We give you its measured spectrum as a table.</span>
        </h1>
        <p className="def">MOST is IRSA's Moving Object Search Tool. IRSA's fixed-position tool cannot measure something that moves from image to image. SPHEREx is a NASA space telescope that maps the whole sky in infrared light.</p>
        <div className="cta">
          <a className="btn" href="#/movers">See moving-object spectra {ARROW}</a>
          <a className="text" href="#/triage">Vet a dot</a>
        </div>

        <div className="hm-tools">
          <a className="card hm-tool" href="#/movers">
            <h2>Moving objects</h2>
            <p>Pick a comet or an asteroid. Get its brightness at every infrared colour SPHEREx saw, with error bars, as a table you can download as CSV, VOTable or JSON.</p>
            <span className="hm-go">Open the spectra {ARROW}</span>
          </a>
          <a className="card hm-tool" href="#/triage">
            <h2>Vet a dot</h2>
            <p>Is this dot real? Type a position. We say whether it is a known asteroid, a cosmic ray, a bright-star leftover, a detector edge, or unexplained, and show the evidence.</p>
            <span className="hm-go">Check a position {ARROW}</span>
          </a>
        </div>

        <section className="hm-who" aria-labelledby="hm-who-h">
          <h2 id="hm-who-h">Who it is for</h2>
          <dl>
            <div><dt>Solar-system researchers</dt><dd>Go from a list of images to a spectrum without a day of scripting for each object.</dd></div>
            <div><dt>People vetting a candidate</dt><dd>Backyard Worlds volunteers and Source Discovery users checking whether a dot is real.</dd></div>
            <div><dt>Educators</dt><dd>Show students the infrared sky and how an object gives itself away by moving.</dd></div>
          </dl>
        </section>

        <section className="hm-more" aria-labelledby="hm-more-h">
          <h2 id="hm-more-h">Also here</h2>
          <div className="hm-more-grid">
            <a className="card" href="#/any"><h3>RA/Dec flipbook</h3><p className="muted sm">Type any position and flip through every SPHEREx image of it.</p></a>
            <a className="card" href="#/sky"><h3>Sky map</h3><p className="muted sm">See where SPHEREx looked and open the nearby fast-moving stars.</p></a>
            <a className="card" href="#/target/barnards-star"><h3>Test targets</h3><p className="muted sm">Five stars with known motion, used to test the pipeline.</p></a>
          </div>
        </section>

        <a className="preview hm-valid" href="#/target/barnards-star/visits">
          <div className="hm-valid-text">
            <h2>Validation</h2>
            <p>Our pipeline measures Barnard's Star moving {fmt(measured, 2)} ± {fmt(error, 2)} arcsec/yr; Gaia says {fmt(gaia, 2)}. This checks the code; it is not new science.</p>
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
