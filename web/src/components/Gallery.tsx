import { useEffect, useState } from 'react'
import { STATUS_LABEL, TARGETS, imageUrl, loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'

// One honest card per required test target: what SPHEREx shows, and what it does not.
export default function Gallery({ onOpen }: { onOpen: (slug: string) => void }) {
  const [metas, setMetas] = useState<Record<string, Meta>>({})
  useEffect(() => {
    TARGETS.forEach(t => loadMeta(t.slug).then(m => setMetas(s => ({ ...s, [t.slug]: m }))).catch(() => {}))
  }, [])

  return (
    <section className="section" id="targets">
      <div className="section-head">
        <p className="eyebrow mono">03 · The five test targets</p>
        <h2>What SPHEREx can and cannot show.</h2>
        <p className="lede">The challenge asked for five targets. Here is each one, including the hard cases we could not measure.</p>
      </div>
      <div className="cards">
        {TARGETS.map(t => {
          const m = metas[t.slug]
          return (
            <button key={t.slug} className="card" onClick={() => onOpen(t.slug)}>
              <div className="card-img">
                {m ? <img src={imageUrl(t.slug, m.visits[0].file)} alt="" /> : <div className="skeleton square" />}
                <span className={`pill ${t.status} sm`}>{STATUS_LABEL[t.status]}</span>
              </div>
              <div className="card-body">
                <h3>{t.name}</h3>
                <p>{t.hook}</p>
                {m?.motion && (
                  <p className="mono stat">
                    <span className="accent">{fmt(m.motion.measured_arcsec_per_yr, 1)} ± {fmt(m.motion.error_arcsec_per_yr, 1)}″/yr</span>
                    <span className="dim"> · Gaia {fmt(m.motion.gaia_arcsec_per_yr, 1)}</span>
                  </p>
                )}
                {m?.target?.claim && !m.motion && <p className="claim small">{m.target.claim}</p>}
                <span className="mono more">{m ? `${m.visits.length} visits · open →` : 'loading…'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
