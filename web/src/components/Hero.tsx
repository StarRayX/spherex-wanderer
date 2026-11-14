import { useEffect, useState } from 'react'
import Viewer from './Viewer'
import Readout from './Readout'
import { TARGETS, imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'

export default function Hero({ slug, onSelect }: { slug: string; onSelect: (s: string) => void }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const info = TARGETS.find(t => t.slug === slug)!

  useEffect(() => {
    let live = true
    setError(null)
    loadMeta(slug).then(m => live && setMeta(m)).catch(e => live && setError(String(e.message ?? e)))
    return () => { live = false }
  }, [slug])

  const m = meta?.slug === slug ? meta : null
  const barnard = slug === 'barnards-star' && m?.motion

  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow mono">NASA SPHEREx · {TARGETS.length} test targets · QR2 + QR3 data</p>
        <h1>
          {barnard ? <>This star moved.<br /><span className="accent">SPHEREx saw it.</span></>
            : <>{info.name}<br /><span className="accent">in SPHEREx</span></>}
        </h1>
        <p className="lede">
          {barnard
            ? <>Barnard's Star drifts <b className="mono">{fmt(m.motion!.measured_arcsec_per_yr, 1)} ± {fmt(m.motion!.error_arcsec_per_yr, 1)}</b> arcseconds a year northward in SPHEREx images. The Gaia star catalogue says <b className="mono">{fmt(m.motion!.gaia_arcsec_per_yr, 1)}</b>.</>
            : info.hook}
        </p>
        <p className="lede dim">
          SPHEREx photographs the whole sky every six months in 102 colours of infrared light.
          Blink lines those photos up so you can see the two things that change: <b>where</b> an object is, and <b>what colour</b> it is.
        </p>

        <div className="chips" role="tablist" aria-label="Test targets">
          {TARGETS.map(t => (
            <button key={t.slug} role="tab" aria-selected={t.slug === slug}
              className={'chip' + (t.slug === slug ? ' on' : '')} onClick={() => onSelect(t.slug)}>
              <i className={`st ${t.status}`} />{t.name}
            </button>
          ))}
        </div>
        <a className="link mono" href="#any">Or look at any spot in the sky →</a>
      </div>

      <div className="hero-instrument">
        {error && <div className="state error">Could not load this target. {error}</div>}
        {!m && !error && <div className="state loading"><div className="skeleton square" /><span className="mono">Loading SPHEREx visits…</span></div>}
        {m && (
          <>
            <Viewer meta={m} src={f => imageUrl(slug, f)} />
            <Readout meta={m} status={info.status} />
          </>
        )}
      </div>
    </section>
  )
}
