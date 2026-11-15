import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { PageProps } from '../lib/router'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'
import { TARGETS, loadMeta, imageUrl } from '../lib/targets'
import Viewer from '../components/Viewer'
import './AnySpot.css'

type Live =
  | { kind: 'working' }
  | { kind: 'done'; meta: Meta; slug: string; label: string }
  | { kind: 'error'; message: string }

interface Reply { meta: Meta; slug: string; label?: string; error?: string }

const EXAMPLE_SLUGS = ['barnards-star', 'epsilon-indi-b', 'rw-aurigae']
const EXAMPLES = EXAMPLE_SLUGS.map(s => TARGETS.find(t => t.slug === s)!)
const SIZES = ['2', '4', '8']
// Chips fill the form. The first three are prepared (instant); the last needs a live fetch.
const LIVE_EXAMPLE = { name: 'Orion Nebula', ra: '83.8221', dec: '-5.3911' }
const STEPS = [
  { until: 15, text: 'Finding SPHEREx images of this spot' },
  { until: 60, text: "Downloading the images from NASA's archive" },
  { until: Infinity, text: 'Measuring the star in each visit' },
]

const coord = (n: number) => n.toFixed(4)

function parseNum(s: string) {
  return s.trim() === '' ? NaN : Number(s)
}
function raError(s: string) {
  const n = parseNum(s)
  return Number.isFinite(n) && n >= 0 && n <= 360 ? '' : 'RA must be between 0 and 360'
}
function decError(s: string) {
  const n = parseNum(s)
  return Number.isFinite(n) && n >= -90 && n <= 90 ? '' : 'Dec must be between -90 and 90'
}

// Live mode: any coordinates, built on demand by /api/blink (docs/API.md). The three examples use the static showcase.
export default function AnySpot({ params, onReady }: PageProps) {
  const q0 = params.query
  const hasQuery = q0.get('ra') !== null || q0.get('dec') !== null
  const [ra, setRa] = useState(q0.get('ra') ?? '')
  const [dec, setDec] = useState(q0.get('dec') ?? '')
  const [size, setSize] = useState(q0.get('size') ?? '4')
  const [selected, setSelected] = useState<string | null>(null)
  const [metas, setMetas] = useState<Record<string, Meta>>({})
  const [metaFailed, setMetaFailed] = useState(false)
  const [live, setLive] = useState<Live | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const reqId = useRef(0)
  const autoRan = useRef(false)

  useEffect(() => { onReady() }, [onReady])

  // Load the three showcase metas once, so a prepared spot can answer instantly.
  useEffect(() => {
    let alive = true
    EXAMPLES.forEach(t => {
      loadMeta(t.slug).then(m => {
        if (!alive) return
        setMetas(prev => ({ ...prev, [t.slug]: m }))
      }).catch(() => { if (alive && t.slug === EXAMPLE_SLUGS[0]) setMetaFailed(true) })
    })
    return () => { alive = false }
  }, [hasQuery])

  // Elapsed time while a build runs. We do not poll ?status=: on Vercel the status file lives in one
  // instance's temp folder, so another instance could answer 404 (docs/REVIEW_2026-11-14.md).
  const working = live?.kind === 'working'
  useEffect(() => {
    if (!working) return
    setElapsed(0)
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [working])

  function matchExample(r: string, d: string) {
    return EXAMPLES.find(t => {
      const a = metas[t.slug]?.target?.astrometry
      return a && coord(a.ra) === r.trim() && coord(a.dec) === d.trim()
    })?.slug ?? null
  }

  // A chip only fills the form. The result appears when the user presses Show photos.
  function fill(r: string, d: string) {
    reqId.current++
    setLive(null)
    setSelected(null)
    setSubmitted(false)
    setRa(r)
    setDec(d)
  }

  function pick(slug: string) {
    const a = metas[slug]?.target?.astrometry
    if (a) fill(coord(a.ra), coord(a.dec))
  }

  async function runLive(rs: string, ds: string, sz: string) {
    const r = Number(rs), d = Number(ds)
    const q = new URLSearchParams({ ra: String(r), dec: String(d), size: sz })
    history.replaceState(null, '', `#/any?${q}`)
    const id = ++reqId.current
    setSelected(null)
    setLive({ kind: 'working' })
    try {
      const res = await fetch(`/api/blink?${q}`)
      if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error('Live lookups need the deployed site; they don’t run on this copy.')
      const body = (await res.json()) as Reply
      if (!res.ok || body.error) throw new Error(body.error ?? `The archive request failed (${res.status}).`)
      if (id !== reqId.current) return
      setLive({ kind: 'done', meta: body.meta, slug: body.slug, label: body.label ?? `RA ${fmt(r, 4)}, Dec ${fmt(d, 4)}` })
    } catch (err) {
      if (id !== reqId.current) return
      setLive({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // A shared link with coordinates that are not an example builds that spot straight away.
  useEffect(() => {
    if (autoRan.current || !hasQuery) return
    if (raError(ra) || decError(dec)) return
    autoRan.current = true
    const needed = EXAMPLES.length
    if (Object.keys(metas).length < needed && !metaFailed) return
    const m = matchExample(ra, dec)
    if (m) setSelected(m)
    else void runLive(ra, dec, size)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metas, metaFailed])

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (raError(ra) || decError(dec)) return
    const m = matchExample(ra, dec)
    if (m) { reqId.current++; setLive(null); setSelected(m); return }
    void runLive(ra, dec, size)
  }

  const raErr = (submitted || ra !== '') ? raError(ra) : ''
  const decErr = (submitted || dec !== '') ? decError(dec) : ''

  // What the right-hand side shows.
  let result: React.ReactNode
  if (live?.kind === 'working') {
    result = (
      <div className="as-result" role="status">
        <span className="skel" style={{ height: 28, width: 'min(34ch, 90%)' }} />
        <span className="skel as-skel-img" />
        <div className="as-working">
          <p className="as-working-head">Building this spot live <span className="num">{elapsed}s</span> of about 60 to 120s</p>
          <ul className="as-steps">
            {STEPS.map((st, i) => {
              const cur = STEPS.findIndex(x => elapsed < x.until)
              return <li key={st.text} className={i < cur ? 'done' : i === cur ? 'now' : ''}><span>{i < cur ? 'Done' : i === cur ? 'Now' : 'Next'}</span>{st.text}</li>
            })}
          </ul>
          <div className="bar" />
          <p className="muted as-fine">The steps are our best guess from the time passed. Stay on this page.</p>
        </div>
      </div>
    )
  } else if (live?.kind === 'error') {
    result = (
      <div className="as-result">
        <div className="as-errbox" role="alert">
          <h2>We could not build this spot</h2>
          <p>{live.message}</p>
          <p className="muted">Check the coordinates and try again. The examples always work.</p>
        </div>
      </div>
    )
  } else if (live?.kind === 'done') {
    result = <Answer meta={live.meta} name={live.label} src={f => `/api/blink?file=${encodeURIComponent(`${live.slug}/${f}`)}`} />
  } else if (selected && metas[selected]) {
    const t = TARGETS.find(x => x.slug === selected)!
    result = <Answer meta={metas[selected]} name={t.name} src={f => imageUrl(selected, f)} />
  } else if (selected && metaFailed) {
    result = (
      <div className="as-result">
        <div className="as-errbox" role="alert">
          <h2>The example photos did not load</h2>
          <p>Reload to try again, or type coordinates and press Show photos.</p>
        </div>
      </div>
    )
  } else {
    result = (
      <div className="as-empty as-hide-phone">
        <h2>Nothing is fetched yet</h2>
        <p>Enter a position or tap an example, then press Show photos.</p>
      </div>
    )
  }

  return (
    <div className="page as-page">
      <h1>Look up any spot in the sky</h1>
      <p className="as-lede">Type a position: we fetch its SPHEREx photos live from NASA's archive and measure how far its star moved.</p>

      <div className="as-grid">
        <div className="as-inputs">
          <div>
            <h2 className="as-h">Try an example</h2>
            <div className="as-chips">
              {EXAMPLES.map(t => (
                <button key={t.slug} type="button" className="as-chip" aria-pressed={ra === coord(metas[t.slug]?.target?.astrometry?.ra ?? NaN) && dec === coord(metas[t.slug]?.target?.astrometry?.dec ?? NaN)} onClick={() => pick(t.slug)} disabled={!metas[t.slug]}>{t.name} <span className="as-tag">instant</span></button>
              ))}
              <button type="button" className="as-chip" aria-pressed={ra === LIVE_EXAMPLE.ra && dec === LIVE_EXAMPLE.dec} onClick={() => fill(LIVE_EXAMPLE.ra, LIVE_EXAMPLE.dec)}>{LIVE_EXAMPLE.name} <span className="as-tag">live, 1 to 2 min</span></button>
            </div>
          </div>

          <form className="as-form" onSubmit={submit} noValidate>
            <div>
              <label className="as-label" htmlFor="as-ra">Right ascension (RA), degrees</label>
              <input id="as-ra" className="field" inputMode="decimal" value={ra} onChange={e => setRa(e.target.value)} aria-invalid={!!raErr} aria-describedby="as-ra-note" />
              {raErr ? <p className="as-err" id="as-ra-note">{raErr}</p> : <p className="as-hint" id="as-ra-note">Sky longitude, 0 to 360</p>}
            </div>
            <div>
              <label className="as-label" htmlFor="as-dec">Declination (Dec), degrees</label>
              <input id="as-dec" className="field" inputMode="decimal" value={dec} onChange={e => setDec(e.target.value)} aria-invalid={!!decErr} aria-describedby="as-dec-note" />
              {decErr ? <p className="as-err" id="as-dec-note">{decErr}</p> : <p className="as-hint" id="as-dec-note">Sky latitude, -90 to 90</p>}
            </div>
            <div>
              <span className="as-label" id="as-fov">Field of view</span>
              <div className="as-seg" role="group" aria-labelledby="as-fov">
                {SIZES.map(s => (
                  <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>{s}′</button>
                ))}
              </div>
            </div>
            <div className="as-go">
              <p className="as-note"><b>This fetches SPHEREx images live, which takes 1 to 2 minutes.</b> Spots we already prepared show at once.</p>
              <button className="btn as-btn" disabled={working}>{working ? 'Working…' : 'Show photos'}</button>
            </div>
          </form>
        </div>

        <div aria-live="polite">{result}</div>
      </div>
    </div>
  )
}

function Answer({ meta, name, src }: { meta: Meta; name: string; src: (f: string) => string }) {
  const n = meta.visits.length
  const title = meta.target?.name ?? name
  const m = meta.motion
  return (
    <div className="as-result">
      {m
        ? <p className="as-answer">{title} moves <span className="num">{fmt(m.measured_arcsec_per_yr)}</span> arcseconds a year across {n} SPHEREx visits. Gaia says <span className="num">{fmt(m.gaia_arcsec_per_yr)}</span>.</p>
        : <p className="as-answer">{meta.target?.claim ?? `${n} SPHEREx visits found at this spot.`}</p>}
      <div className="card"><Viewer meta={meta} src={src} /></div>
    </div>
  )
}
