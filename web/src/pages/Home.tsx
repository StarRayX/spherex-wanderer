import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/router'
import { TARGETS, imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt, monthYear } from '../lib/format'
import { useRoll } from '../lib/roll'
import Mark from '../components/Mark'

// Rows of spherex.obscore (images) in IRSA's archive across QR2, QR2 deep, QR3 and QR3 deep, counted 7 Nov 2026
// (docs/evidence_notes.md). The archive grows with each release, so the label carries the date.
const ARCHIVE_IMAGES = 1607473

const ARROW = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
const ARCSEC = <abbr title="An arcsecond is 1/3600 of a degree. The full Moon is about 1,800 arcseconds wide.">arcseconds</abbr>

export default function Home({ onReady }: PageProps) {
  const [b, setB] = useState<Meta | null>(null)
  const [visits, setVisits] = useState<number | null>(null)

  useEffect(() => {
    loadMeta('barnards-star').then(setB).catch(() => setB(null)).finally(onReady)
    Promise.all(TARGETS.map(t => loadMeta(t.slug))).then(ms => setVisits(ms.reduce((s, m) => s + m.visits.length, 0))).catch(() => {})
  }, [onReady])

  const strip = useRoll<HTMLDListElement>([visits])
  const m = b?.motion
  const n = b ? Math.round((b.size_arcmin * 60) / b.pixel_scale_arcsec) + 1 : 21

  return (
    <div className="home">
      <div className="home-bg" aria-hidden><div className="stars" /><div className="orbit" /></div>
      <div className="home-inner">
        <div className="brand-line"><Mark size={32} /><span>SPHEREx <b>Blink</b></span></div>
        <p className="eyebrow tagline">Watch nearby stars move</p>
        <h1 aria-busy={!m}>
          {m ? <>
            Barnard's Star moved <span className="nb">{fmt(m.measured_arcsec_per_yr, 1)} ± {fmt(m.error_arcsec_per_yr, 1)}</span> {ARCSEC} a year in NASA SPHEREx photos.
            <span className="h1-2">That matches the Gaia star catalogue's {fmt(m.gaia_arcsec_per_yr, 1)}, inside our error bar.</span>
          </> : <>
            <span className="skel skel-line" style={{ height: '1.1em' }} /><span className="skel skel-line" style={{ height: '1.1em', width: '70%' }} />
          </>}
        </h1>
        <p className="def">SPHEREx is a NASA space telescope. Since May 2025 it has photographed the whole sky every six months, in 102 colours of infrared light.</p>
        <div className="cta">
          <a className="btn" href="#/sky">Open the sky map {ARROW}</a>
          <a className="text" href="#/target/barnards-star">See the five test targets</a>
        </div>

        <dl className="stats-strip" ref={strip} aria-label="SPHEREx Blink in numbers">
          <div><dt>SPHEREx images in NASA's archive, searchable by sky position (7 Nov 2026)</dt>
            <dd><span className="mono" aria-hidden data-to={ARCHIVE_IMAGES} data-final={ARCHIVE_IMAGES.toLocaleString('en-US')}>{ARCHIVE_IMAGES.toLocaleString('en-US')}</span><span className="sr-only">{ARCHIVE_IMAGES.toLocaleString('en-US')}</span></dd></div>
          <div><dt>SPHEREx visits across the five test targets</dt>
            <dd>{visits === null ? <span className="skel skel-line" style={{ width: '3ch', height: '1.4em' }} /> : <><span className="mono" aria-hidden data-to={visits} data-final={String(visits)}>{visits}</span><span className="sr-only">{visits}</span></>}</dd></div>
          <div><dt>colours of infrared light in every SPHEREx photo</dt>
            <dd><span className="mono" aria-hidden data-to={102} data-final="102">102</span><span className="sr-only">102</span></dd></div>
        </dl>

        <p className="lede">Blink lines SPHEREx's photos up so anyone can see the two things that change in the sky: where a star is, and what colour it is.</p>

        <div className="how">
          <a className="preview" href="#/target/barnards-star/visits">
            <div className="pv-strip">
              {b ? b.visits.map(v => (
                <figure key={v.file}>
                  <img src={imageUrl(b.slug, v.file)} alt={`Barnard's Star, ${monthYear(v.date)}`} />
                  <svg viewBox={`0 0 ${n} ${n}`} aria-hidden><line x1={n / 2} x2={n / 2} y1="0" y2={n} className="ref" /><line x1="0" x2={n} y1={n / 2} y2={n / 2} className="ref" /></svg>
                  <figcaption>{monthYear(v.date, true)}</figcaption>
                </figure>
              )) : [0, 1, 2].map(i => <span key={i} className="skel skel-box" />)}
            </div>
            <span className="pv-cap">Open Barnard's Star {ARROW}</span>
            <p className="pv-legend">Three SPHEREx visits, one year apart end to end. The crosshair stays put; the star slides north.</p>
          </a>
          <div className="steps">
            <h2>How it works</h2>
            <ol>
              <li><span className="n" aria-hidden>1</span><div><b>Find every photo of the spot.</b> We ask NASA's archive for each SPHEREx image that covers a star, and group them by visit.</div></li>
              <li><span className="n" aria-hidden>2</span><div><b>Compare like with like.</b> Each photo caught the star in a different colour of infrared. We keep the ones taken in the same colour, so only its position changes.</div></li>
              <li><span className="n" aria-hidden>3</span><div><b>Measure the drift and check it.</b> We find the star's centre on each visit, fit its drift with an error bar, and compare it with the Gaia star catalogue.</div></li>
            </ol>
          </div>
        </div>

        <p className="foot-note">Two of the challenge's five test targets give a measured drift. We show the other three as they are: a faint candidate, a brightness change, and a star too bright for SPHEREx to measure.</p>
      </div>
    </div>
  )
}
