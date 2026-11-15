import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/router'
import { STATUS_LABEL, TARGETS, imageUrl, loadMeta } from '../lib/targets'
import type { Meta, PhotometryPoint } from '../lib/types'
import { axisWords, decDms, fmt, lightYears, monthYear, raHms, tidy, yearsPerMoon } from '../lib/format'
import Viewer from '../components/Viewer'
import SpectrumPlot from '../components/SpectrumPlot'
import './Target.css'
import BalancedList from '../components/BalancedList'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'visits', label: 'Visits' },
  { id: 'colour', label: 'Colour' },
  { id: 'notes', label: 'Notes and limits' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function Target({ params, onReady }: PageProps) {
  const slug = TARGETS.some(t => t.slug === params.slug) ? params.slug! : TARGETS[0].slug
  const tab: Tab = TABS.some(t => t.id === params.tab) ? (params.tab as Tab) : 'overview'
  const info = TARGETS.find(t => t.slug === slug)!
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setError(null)
    loadMeta(slug).then(m => live && setMeta(m)).catch(e => live && setError(String(e.message ?? e))).finally(onReady)
    return () => { live = false }
  }, [slug, onReady])

  const m = meta?.slug === slug ? meta : null

  return (
    <div className="page">
      <div className="target-head">
        <div>
          <h1>Test star: {info.name}</h1>
          <p className="sub">{info.hook}</p>
          <p className="t-prepared">One of 12 test stars, prepared and checked in advance. For your own spot, use Any spot.</p>
        </div>
        <div className="target-switch">
          <label htmlFor="tsel" className="sr-only">Switch test star</label>
          <select id="tsel" className="field" value={slug} onChange={e => { location.hash = `#/target/${e.target.value}/${tab}` }}>
            {TARGETS.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="t-tabs" role="tablist" aria-label={`${info.name} sections`}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { location.hash = `#/target/${slug}/${t.id}` }}>{t.label}</button>
        ))}
      </div>

      {error && <p className="notice">Could not load {info.name}: {error}</p>}
      {!m && !error && <div className="grid3">{[0, 1, 2].map(i => <div key={i} className="card"><span className="skel skel-line" style={{ width: '45%' }} /><span className="skel skel-big" /></div>)}</div>}
      {m && tab === 'overview' && <Overview m={m} />}
      {m && tab === 'visits' && <Visits m={m} />}
      {m && tab === 'colour' && <Colour m={m} />}
      {m && tab === 'notes' && <Notes m={m} />}
    </div>
  )
}

function Overview({ m }: { m: Meta }) {
  const info = TARGETS.find(t => t.slug === m.slug)!
  const a = m.target?.astrometry
  const mo = m.motion
  const ly = lightYears(a), moon = yearsPerMoon(a)
  const gap = mo ? Math.abs(mo.measured_arcsec_per_yr - mo.gaia_arcsec_per_yr) : 0
  const verdict = !mo ? '' : gap <= mo.error_arcsec_per_yr ? 'Gaia sits inside our error bar.' : gap <= 2 * mo.error_arcsec_per_yr ? 'Gaia sits just outside our error bar.' : 'Gaia sits well outside our error bar.'

  return (
    <div className="grid3 ov">
      <div className="card stat">
        <span className="stat-label">How far it moves each year</span>
        {mo ? <>
          <strong className="t-verdict">{verdict}</strong>
          <div className="t-pair">
            <div><span className="stat-label">Our measurement</span><span className="stat-value">{fmt(mo.measured_arcsec_per_yr)} ± {fmt(mo.error_arcsec_per_yr)}<small> arcseconds</small></span></div>
            <div><span className="stat-label">Gaia</span><span className="stat-value">{fmt(mo.gaia_arcsec_per_yr)}<small> arcseconds</small></span></div>
          </div>
          <span className="stat-label">It moves {axisWords(mo)}.</span>
        </> : <><span className="stat-value">None</span><span className="stat-label">Not measured</span></>}
      </div>
      <div className="card stat">
        <span className="stat-label">Distance</span>
        <span className="stat-value">{ly === null ? 'n/a' : ly < 100 ? fmt(ly, 1) : Math.round(ly).toLocaleString('en-US')}<small> light years</small></span>
      </div>
      <div className="card stat">
        <span className="stat-label">Crosses a full Moon in</span>
        <span className="stat-value">{moon === null ? 'n/a' : (moon < 1000 ? Math.round(moon) : Math.round(moon / 100) * 100).toLocaleString('en-US')}<small> years</small></span>
      </div>

      <div className="wide ov-view">
        <Viewer meta={m} src={f => imageUrl(m.slug, f)} aside={{
          top: <>
            <span className={`badge ${info.status}`}><span className="dot" />{STATUS_LABEL[info.status]}</span>
            <p className="ov-claim">{tidy(m.target?.claim ?? '')}</p>
          </>,
          bottom: <>
            {mo && <p className="ov-result mono">Ours: {fmt(mo.measured_arcsec_per_yr)} ± {fmt(mo.error_arcsec_per_yr)}″/yr<br />Gaia: {fmt(mo.gaia_arcsec_per_yr)}″/yr</p>}
            {a && <p className="mono sm muted">RA {raHms(a.ra)} · Dec {decDms(a.dec)}</p>}
            <div className="cta">
              <a className="btn sm" href={`#/sky?target=${m.slug}`}>Show on the sky map</a>
            </div>
          </>,
        }} />
      </div>
    </div>
  )
}

function Visits({ m }: { m: Meta }) {
  const n = Math.round((m.size_arcmin * 60) / m.pixel_scale_arcsec) + 1
  return (
    <div className="split t-visits">
      <div className="card"><Viewer meta={m} src={f => imageUrl(m.slug, f)} /></div>
      <div className="t-visits-list">
        <h2 className="card-title">Every visit</h2>
        <p className="caption">One image per visit. The crosshair is fixed.</p>
        <div className="filmstrip">
          {m.visits.map((v, i) => (
            <figure key={v.file}>
              <span className="v-n">{String(i + 1).padStart(2, '0')}</span>
              <div className="well">
                <img src={imageUrl(m.slug, v.file)} alt={`${m.target?.name}, visit ${i + 1}, ${monthYear(v.date)}`} />
                <svg viewBox={`0 0 ${n} ${n}`} aria-hidden><line x1={n / 2} x2={n / 2} y1="0" y2={n} className="ref" /><line x1="0" x2={n} y1={n / 2} y2={n / 2} className="ref" /></svg>
              </div>
              <figcaption><b>{monthYear(v.date)}</b><span className="mono">{fmt(v.wavelength_um)} µm</span></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}

function Colour({ m }: { m: Meta }) {
  const s = m.spectrum
  const phot = Array.isArray(m.photometry) ? (m.photometry as PhotometryPoint[]) : []
  return (
    <div className={'grid2' + (s && m.slug === 'epsilon-indi-b' ? ' t-colour-aside' : '')}>
      {s ? (
        <>
          <div className="card wide">
            <div className="picked-head"><h2 className="card-title">Its spectrum: brightness in each colour of infrared</h2><span className="badge prelim">Preliminary</span></div>
            <p className="caption">{s.n_used} SPHEREx photos from the {s.visit_date} visit, put in order of wavelength.</p>
            <SpectrumPlot spectrum={s} notes={m.slug === 'epsilon-indi-b' ? [
              { at: 1.5, text: 'dip: water vapour absorbs here', dy: -122, anchor: 'start' },
              { at: 4.03, text: 'brightest near 4 µm: it is cold', dy: -24, anchor: 'end' },
            ] : []} />
          </div>
          {m.slug === 'epsilon-indi-b' && (
            <div className="card">
              <h2 className="card-title">Water vapour, in a failed star</h2>
              <p className="sm">Brown dwarfs are too small to burn like the Sun, and cold enough for water vapour and methane, which absorb certain wavelengths. Those are the dips. The peak near 4 microns is the glow of a cold object.</p>
            </div>
          )}
          <div className="card">
            <h2 className="card-title">How sure are we?</h2>
            <p className="sm">Our method matched IRSA's tool on one ordinary star. This object is much redder, so treat the curve as a first look.</p>
            <ul className="notes-list">{s.caveats.map(c => <li key={c}>{tidy(c)}</li>)}</ul>
          </div>
        </>
      ) : (
        <div className="card wide">
          <h2 className="card-title">No spectrum for this target</h2>
          <p className="notice">{tidy(m.spectrum_reason ?? 'Not built for this target.')}</p>
        </div>
      )}
      {phot.length > 0 && (
        <div className="card wide">
          <h2 className="card-title">Brightness on each visit</h2>
          <p className="caption">Same small circle around the star each time. Compare rows only at matching wavelengths.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="mono sm t-phot" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th style={{ padding: 8 }}>Visit</th><th style={{ padding: 8 }}>Wavelength</th><th style={{ padding: 8 }}>Brightness</th></tr></thead>
              <tbody>
                {phot.map(p => (
                  <tr key={p.date} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: 8 }}>{monthYear(p.date)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.wavelength_min_um)} to {fmt(p.wavelength_max_um)} µm</td>
                    <td style={{ padding: 8 }}>{p.aperture_mjy == null ? 'n/a' : `${p.lower_limit ? 'over ' : ''}${fmt(p.aperture_mjy, 1)} mJy`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="caption" style={{ marginTop: 8, marginBottom: 0 }}>mJy (millijansky) is the unit astronomers use for faint light.</p>
        </div>
      )}
    </div>
  )
}

function Notes({ m }: { m: Meta }) {
  return (
    <div className="notes-stack">
      {m.target?.astrometry_source && (
        <section className="card">
          <h2 className="card-title">Where the position comes from</h2>
          <p className="notes-intro mono" style={{ overflowWrap: 'anywhere' }}>{m.target.astrometry_source}</p>
        </section>
      )}
      <section className="card">
        <h2 className="card-title">Limits</h2>
        <p className="notes-intro">What SPHEREx could and couldn't measure for this star.</p>
        <BalancedList items={(m.notes ?? []).map(n => tidy(n))} />
      </section>

    </div>
  )
}
