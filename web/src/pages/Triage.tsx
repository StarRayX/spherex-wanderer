import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { PageProps } from '../lib/router'
import { downloadText, getJson, joinUrl, toCsv } from '../lib/download'
import './Triage.css'

// Where the precomputed files live. Switch to '/triage' to test with fixtures.
const TRIAGE_BASE = '/triage'
const MATCH_ARCSEC = 15

type VerdictId = 'known_asteroid' | 'star_residual' | 'cosmic_ray' | 'edge_mask' | 'unconfirmable' | 'unexplained'
type Counts = Partial<Record<VerdictId, number>>

// Plain names for the verdicts. Colour is never the only signal: every swatch sits next to its name.
const VERDICTS: { id: VerdictId; label: string; color: string; hint: string }[] = [
  { id: 'known_asteroid', label: 'Known asteroid', color: '#4DD0F8', hint: 'A catalogued asteroid is predicted at this spot.' },
  { id: 'star_residual', label: 'Bright-star leftover', color: '#8FA8FF', hint: 'Light left over from subtracting a bright star.' },
  { id: 'cosmic_ray', label: 'Cosmic ray', color: '#FFB384', hint: 'A particle hit on the detector, not a real object.' },
  { id: 'edge_mask', label: 'Detector edge or mask', color: '#C9B8FF', hint: 'Too close to the edge or to a masked area to trust.' },
  { id: 'unconfirmable', label: 'Cannot confirm', color: '#8B99AB', hint: 'Not enough images or too faint to check.' },
  { id: 'unexplained', label: 'Unexplained', color: '#FFFFFF', hint: 'Nothing we checked explains it. This is not a discovery.' },
]
const V = Object.fromEntries(VERDICTS.map(v => [v.id, v])) as Record<VerdictId, (typeof VERDICTS)[number]>

interface IndexEntry { slug: string; name: string; ra: number; dec: number; detector: number | string; date_first: string; date_last: string; counts: Counts }
interface Evidence {
  jpl_name: string | null
  jpl_offset_arcsec: number | null
  flags_bits: number | null
  flag_names: string[] | null
  nearest_gaia_g: number | null
  nearest_gaia_sep_arcsec: number | null
  edge_px: number | null
  in_adjacent_frame: boolean | null
}
interface Row { id: string; ra: number; dec: number; mjd: number; iso: string; obs_id: string; verdict: VerdictId; reason: string; evidence: Evidence; thumb: string }
interface Meta extends IndexEntry {
  depth_note: string
  method: string
  caveats: string[]
  transient_bit_overlap?: { cosmic_rays: number; flagged_transient_by_pipeline: number }
}

const day = (iso: string) => iso.slice(0, 10)
const deg = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : '')
const total = (c: Counts) => VERDICTS.reduce((s, v) => s + (c?.[v.id] ?? 0), 0)

// Distance on the sky in arcseconds. Fine at the few-arcsecond scale used here.
function sepArcsec(ra1: number, dec1: number, ra2: number, dec2: number) {
  const dRa = ((ra1 - ra2 + 540) % 360) - 180
  const dDec = dec1 - dec2
  return Math.hypot(dRa * Math.cos(((dec1 + dec2) / 2) * Math.PI / 180), dDec) * 3600
}

// Accepts decimal degrees, or sexagesimal like 14:29:42.9 or "14 29 42.9" (RA in hours).
function parseCoord(text: string, isRa: boolean): number | null {
  const t = text.trim().replace(/[hdms°'"]/gi, ' ').replace(/,/g, '.').replace(/:/g, ' ').trim()
  if (!t) return null
  const parts = t.split(/\s+/)
  if (parts.some(p => !/^[+-]?\d*\.?\d+$/.test(p)) || parts.length > 3) return null
  const sign = parts[0].startsWith('-') ? -1 : 1
  const [a, b = '0', c = '0'] = parts
  const val = sign * (Math.abs(+a) + +b / 60 + +c / 3600)
  const out = parts.length > 1 && isRa ? val * 15 : val
  if (isRa) return out >= 0 && out < 360 ? out : null
  return out >= -90 && out <= 90 ? out : null
}

export default function Triage({ params, onReady }: PageProps) {
  const slug = params.slug
  return slug ? <Detail key={slug} slug={slug} onReady={onReady} /> : <List onReady={onReady} />
}

const WHO = 'For Backyard Worlds volunteers and Source Discovery users who want to know what explains a change they see in SPHEREx images.'
const CHANGE_GLOSS = 'A change is a spot that got brighter or fainter between visits.'
const D1_GLOSS = "Detector D1 is one of SPHEREx's six detectors. D1 sees the shortest wavelengths."

// ---------- list ----------
function List({ onReady }: { onReady: () => void }) {
  const [items, setItems] = useState<IndexEntry[] | null>(null)
  useEffect(() => {
    let live = true
    getJson<IndexEntry[]>(joinUrl(TRIAGE_BASE, 'index.json'))
      .then(d => live && setItems(Array.isArray(d) ? d : []))
      .catch(() => live && setItems([]))
      .finally(onReady)
    return () => { live = false }
  }, [onReady])

  return (
    <div className="page tg">
      <h1>Vet a field</h1>
      <p className="tg-lede">We compared SPHEREx visits of two patches of sky and sorted every change we found, with the evidence. Pick a field, then filter the changes or check a position inside it.</p>
      <p className="muted tg-for">{WHO} {CHANGE_GLOSS}</p>

      {items === null ? (
        <div className="tg-cards" aria-busy="true" aria-label="Loading fields">
          {[0, 1].map(i => <div key={i} className="card"><span className="skel skel-big" style={{ width: '60%' }} /><span className="skel skel-line" /><span className="skel skel-line" style={{ width: '40%' }} /></div>)}
        </div>
      ) : items.length === 0 ? (
        <div className="card tg-empty">
          <h2>Fields are being processed</h2>
          <p className="muted">Each field takes a few minutes to check, so we run them ahead of time. Check back soon.</p>
        </div>
      ) : (
        <ul className="tg-cards">
          {items.map(f => (
            <li key={f.slug}>
              <a className="card tg-card" href={`#/triage/${encodeURIComponent(f.slug)}`}>
                <h2>{f.name}</h2>
                <p className="muted sm">Field centre RA {deg(f.ra, 3)}°, Dec {deg(f.dec, 3)}°, about 30 arcmin across. Detector {f.detector}. {day(f.date_first)} to {day(f.date_last)}.</p>
                <p className="tg-total"><b>{total(f.counts)}</b> changes checked</p>
                <CountBar counts={f.counts} />
                <span className="tg-open">Open this field</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CountBar({ counts }: { counts: Counts }) {
  const t = total(counts)
  const desc = VERDICTS.map(v => `${counts?.[v.id] ?? 0} ${v.label}`).join(', ')
  if (!t) return <p className="muted sm">No changes recorded.</p>
  return (
    <div className="tg-bar" role="img" aria-label={desc}>
      {VERDICTS.filter(v => counts?.[v.id]).map(v => <span key={v.id} style={{ flexGrow: counts[v.id], background: v.color }} title={`${v.label}: ${counts[v.id]}`} />)}
    </div>
  )
}

// ---------- detail ----------
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; meta: Meta; rows: Row[] }

function Detail({ slug, onReady }: { slug: string; onReady: () => void }) {
  const [d, setD] = useState<Load>({ state: 'loading' })
  const base = joinUrl(TRIAGE_BASE, encodeURIComponent(slug))

  useEffect(() => {
    let live = true
    getJson<{ meta: Meta; rows: Row[] }>(joinUrl(base, 'triage.json'))
      .then(s => live && setD({ state: 'ok', meta: s.meta, rows: Array.isArray(s.rows) ? s.rows : [] }))
      .catch(() => live && setD({ state: 'error' }))
      .finally(onReady)
    return () => { live = false }
  }, [base, onReady])

  if (d.state === 'loading') {
    return (
      <div className="page tg" aria-busy="true" aria-label="Loading the field">
        <a className="tg-back" href="#/triage">All fields</a>
        <span className="skel skel-big" style={{ width: '40%' }} />
        <span className="skel skel-line" style={{ width: '60%' }} />
        <div className="card tg-block"><span className="skel skel-box" style={{ ['--ar' as string]: '3' }} /></div>
      </div>
    )
  }
  if (d.state === 'error') {
    return (
      <div className="page tg">
        <a className="tg-back" href="#/triage">All fields</a>
        <div className="card tg-empty">
          <h2>We could not load this field</h2>
          <p className="muted">The file for "{slug}" is missing or unreadable. It may still be processing.</p>
          <a className="btn sm" href="#/triage">See all fields</a>
        </div>
      </div>
    )
  }

  const { meta, rows } = d
  const counts = meta.counts ?? {}
  const o = meta.transient_bit_overlap
  const n = total(counts) || rows.length
  const pct = n ? Math.round(100 * (counts.star_residual ?? 0) / n) : 0
  const crowded = n > 0 && pct >= 50
  return (
    <div className="page tg">
      <a className="tg-back" href="#/triage">All fields</a>
      <header className="tg-head">
        <div>
          <h1>{meta.name}</h1>
          <p className="muted">Field centre RA {deg(meta.ra, 3)}°, Dec {deg(meta.dec, 3)}°, about 30 arcmin across. Detector {meta.detector}. {day(meta.date_first)} to {day(meta.date_last)}.</p>
          <p className="muted tg-for">{CHANGE_GLOSS} {D1_GLOSS}</p>
        </div>
        <div className="tg-dl" role="group" aria-label="Download the table">
          <a className="btn sm" href={joinUrl(base, 'triage.csv')} download>Download CSV</a>
          <a className="btn sm quiet" href={joinUrl(base, 'triage.json')} download>Download JSON</a>
        </div>
      </header>

      {meta.depth_note && (
        <aside className="tg-depth" aria-label="How deep these images go">
          <h2>What an empty result does not tell you</h2>
          <p>{meta.depth_note}</p>
        </aside>
      )}

      {crowded && (
        <p className="tg-crowd">This field is crowded. {pct}% of its changes ({counts.star_residual} of {n}) are bright-star leftovers, so most of what you see here is subtraction noise, not new objects.</p>
      )}

      <Check rows={rows} meta={meta} base={base} />

      <section className="card tg-block" aria-labelledby="tg-all-h">
        <h2 id="tg-all-h" className="card-title">Every change in this field</h2>
        <p className="caption">{rows.length} changes between visits, each sorted into one cause.</p>
        {o && o.cosmic_rays > 0 && <p className="tg-trans">The SPHEREx pipeline already marked {o.flagged_transient_by_pipeline} of the {o.cosmic_rays} cosmic rays we found as TRANSIENT.</p>}
        <Table rows={rows} counts={counts} base={base} slug={meta.slug} />
      </section>

      <section className="card tg-block" aria-labelledby="tg-how-h">
        <h2 id="tg-how-h" className="card-title">How we checked</h2>
        <details className="tg-fold">
          <summary>Method</summary>
          <p>{meta.method}</p>
        </details>
        <h3 className="tg-sub">Limits</h3>
        <ul className="notes-list">{(meta.caveats ?? []).map((c, i) => <li key={i}>{c}</li>)}</ul>
      </section>
    </div>
  )
}

// ---------- check a position ----------
type Result = { kind: 'hit'; row: Row; sep: number; others: number } | { kind: 'none'; elsewhere?: string } | { kind: 'bad'; msg: string }

function Check({ rows, meta, base }: { rows: Row[]; meta: Meta; base: string }) {
  const [ra, setRa] = useState('')
  const [dec, setDec] = useState('')
  const [date, setDate] = useState('')
  const [res, setRes] = useState<Result | null>(null)

  function run(e?: FormEvent, raT = ra, decT = dec) {
    e?.preventDefault()
    const r = parseCoord(raT, true), d = parseCoord(decT, false)
    if (r === null || d === null) {
      setRes({ kind: 'bad', msg: 'Enter RA and Dec as decimal degrees, like 210.6 and -11.9. RA can also be hours, like 14:02:24.' })
      return
    }
    const near = rows.map(row => ({ row, sep: sepArcsec(r, d, row.ra, row.dec) })).filter(x => x.sep <= MATCH_ARCSEC).sort((a, b) => a.sep - b.sep)
    const onDay = date ? near.filter(x => day(x.row.iso) === date) : near
    if (!onDay.length) {
      setRes({ kind: 'none', elsewhere: date && near.length ? day(near[0].row.iso) : undefined })
      return
    }
    setRes({ kind: 'hit', row: onDay[0].row, sep: onDay[0].sep, others: onDay.length - 1 })
  }
  function example() {
    const r = rows[0]
    if (!r) return
    const a = deg(r.ra, 5), b = deg(r.dec, 5)
    setRa(a); setDec(b); setDate('')
    run(undefined, a, b)
  }

  return (
    <section className="card tg-block" aria-labelledby="tg-check-h">
      <h2 id="tg-check-h" className="card-title">Check a position in this field</h2>
      <p className="caption">This only searches inside this field: centre RA {deg(meta.ra, 3)}°, Dec {deg(meta.dec, 3)}°, about 30 arcmin across. A position outside it will always come back empty. We look for the nearest recorded change within {MATCH_ARCSEC} arcseconds.</p>
      <form className="tg-form" onSubmit={run}>
        <label>RA<input inputMode="decimal" value={ra} onChange={e => setRa(e.target.value)} placeholder="210.6 or 14:02:24" autoComplete="off" /></label>
        <label>Dec<input inputMode="decimal" value={dec} onChange={e => setDec(e.target.value)} placeholder="-11.9" autoComplete="off" /></label>
        <label>Date, optional<input type="date" value={date} onChange={e => setDate(e.target.value)} min={day(meta.date_first)} max={day(meta.date_last)} /></label>
        <button className="btn" type="submit">Check</button>
      </form>
      {rows.length > 0 && <p className="tg-try"><button type="button" className="linkbtn" onClick={example}>Try a position from this field</button></p>}

      <div className="tg-result" aria-live="polite">
        {res?.kind === 'bad' && <p className="notice">{res.msg}</p>}
        {res?.kind === 'none' && (
          <div className="tg-none">
            <h3>No change recorded here</h3>
            <p className="muted">{res.elsewhere ? `Nothing on that date, but a change was recorded within ${MATCH_ARCSEC} arcseconds on ${res.elsewhere}. Clear the date to see it.` : `We found no change within ${MATCH_ARCSEC} arcseconds. That does not prove the dot is real or fake. Only this field was searched, and the images are shallow.`}</p>
          </div>
        )}
        {res?.kind === 'hit' && (
          <>
            <p className="tg-near">Nearest change: {res.sep.toFixed(1)} arcseconds from your position.{res.others > 0 ? ` ${res.others} more within ${MATCH_ARCSEC} arcseconds${date ? ' on that date' : ' on other dates or frames'}.` : ''}</p>
            <VerdictCard row={res.row} base={base} />
          </>
        )}
      </div>
    </section>
  )
}

function Swatch({ v }: { v: VerdictId }) {
  return <span className="tg-sw" style={{ background: V[v]?.color ?? '#888' }} aria-hidden />
}

function Yes(v: boolean | null | undefined) {
  return v === true ? 'Yes' : v === false ? 'No' : 'Not checked'
}

function VerdictCard({ row, base }: { row: Row; base: string }) {
  const e = row.evidence ?? ({} as Evidence)
  const flags = e.flag_names ?? []
  return (
    <div className="tg-vcard">
      <img src={joinUrl(base, row.thumb)} alt="Cutout of the change" width={96} height={96} />
      <div>
        <h3><Swatch v={row.verdict} />{V[row.verdict]?.label ?? row.verdict}</h3>
        <p>{row.reason}</p>
        <dl className="tg-ev">
          <div><dt>Known asteroid (JPL)</dt><dd>{e.jpl_name ? `${e.jpl_name}, ${deg(e.jpl_offset_arcsec ?? NaN, 1)} arcsec away` : 'No match'}</dd></div>
          <div><dt>SPHEREx FLAGS bits</dt><dd>{flags.length ? flags.join(', ') : 'None'}</dd></div>
          <div><dt>Nearest Gaia star</dt><dd>{e.nearest_gaia_sep_arcsec === null || e.nearest_gaia_sep_arcsec === undefined ? 'None nearby' : `Magnitude ${deg(e.nearest_gaia_g ?? NaN, 1)}, ${deg(e.nearest_gaia_sep_arcsec, 1)} arcsec away`}</dd></div>
          <div><dt>Distance to detector edge</dt><dd>{e.edge_px === null || e.edge_px === undefined ? 'Unknown' : `${e.edge_px} pixels`}</dd></div>
          <div><dt>Seen in the next frame</dt><dd>{Yes(e.in_adjacent_frame)}</dd></div>
          <div><dt>Position</dt><dd>{deg(row.ra, 5)}, {deg(row.dec, 5)}</dd></div>
          <div><dt>Date</dt><dd>{row.iso.slice(0, 16).replace('T', ' ')} UTC</dd></div>
        </dl>
      </div>
    </div>
  )
}

// ---------- table ----------
const PAGE = 50
function Table({ rows, counts, base, slug }: { rows: Row[]; counts: Counts; base: string; slug: string }) {
  const [filter, setFilter] = useState<VerdictId | 'all'>('all')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)

  const shownCounts = useMemo(() => {
    const c: Counts = {}
    rows.forEach(r => { c[r.verdict] = (c[r.verdict] ?? 0) + 1 })
    return total(counts) ? counts : c
  }, [rows, counts])
  const list = useMemo(() => (filter === 'all' ? rows : rows.filter(r => r.verdict === filter)), [rows, filter])

  function saveView() {
    const cols = ['id', 'ra', 'dec', 'iso', 'obs_id', 'verdict', 'reason', 'jpl_name', 'jpl_offset_arcsec', 'flag_names', 'nearest_gaia_g', 'nearest_gaia_sep_arcsec', 'edge_px', 'in_adjacent_frame']
    downloadText(`${slug}-${filter}.csv`, toCsv(list.map(r => ({ ...r, ...r.evidence })), cols))
  }

  return (
    <>
      <CountBar counts={shownCounts} />
      <dl className="tg-defs">
        <div><dt>Bright-star leftover</dt><dd>a bright star that did not subtract cleanly.</dd></div>
        <div><dt>Cosmic ray</dt><dd>a particle hit that lights up one exposure.</dd></div>
        <div><dt>Detector edge or mask</dt><dd>too close to the edge of the detector, or to a patch we hide, to trust.</dd></div>
        <div><dt>FLAGS bits</dt><dd>quality markers the SPHEREx pipeline puts on each pixel.</dd></div>
        <div><dt>TRANSIENT</dt><dd>the pipeline&apos;s marker for a pixel that spiked in one exposure.</dd></div>
      </dl>
      <div className="tg-chips" role="group" aria-label="Filter by cause">
        <button aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setLimit(PAGE) }}>All <b>{rows.length}</b></button>
        {VERDICTS.map(v => (
          <button key={v.id} aria-pressed={filter === v.id} onClick={() => { setFilter(v.id); setLimit(PAGE) }} title={v.hint}>
            <Swatch v={v.id} />{v.label} <b>{shownCounts[v.id] ?? 0}</b>
          </button>
        ))}
      </div>

      {list.length === 0 ? <p className="muted">No changes with this verdict.</p> : (
        <div className="tg-scroll">
          <table className="tg-table">
            <thead><tr><th scope="col">Cutout</th><th scope="col">Verdict</th><th scope="col">RA, Dec</th><th scope="col">Date (UTC)</th><th scope="col">Why</th></tr></thead>
            <tbody>
              {list.slice(0, limit).map(r => (
                <Fragment key={r.id}>
                  <tr>
                    <td data-l="Cutout"><img src={joinUrl(base, r.thumb)} alt="" width={56} height={56} loading="lazy" /></td>
                    <td data-l="Verdict" className="tg-v"><span><Swatch v={r.verdict} />{V[r.verdict]?.label ?? r.verdict}</span>
                      <button className="linkbtn" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide evidence' : 'Evidence'}</button></td>
                    <td data-l="RA, Dec" className="nb">{deg(r.ra, 4)}, {deg(r.dec, 4)}</td>
                    <td data-l="Date" className="nb">{day(r.iso)}</td>
                    <td data-l="Why" className="tg-why">{r.reason}</td>
                  </tr>
                  {open === r.id && <tr className="tg-ev-row"><td colSpan={5}><VerdictCard row={r} base={base} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tg-more">
        <span className="muted sm">Showing {Math.min(limit, list.length)} of {list.length}.</span>{' '}
        {list.length > limit && <button className="linkbtn" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more</button>}{' '}
        {filter !== 'all' && list.length > 0 && <button className="linkbtn" onClick={saveView}>Download this view as CSV</button>}
      </p>
    </>
  )
}
