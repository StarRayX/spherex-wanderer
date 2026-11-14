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
const DEFAULT_SLUG = 'barnards-star'

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
  const [selected, setSelected] = useState<string | null>(hasQuery ? null : DEFAULT_SLUG)
  const [metas, setMetas] = useState<Record<string, Meta>>({})
  const [metaFailed, setMetaFailed] = useState(false)
  const [live, setLive] = useState<Live | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const reqId = useRef(0)
  const autoRan = useRef(false)

  useEffect(() => { onReady() }, [onReady])

  // Load the three showcase metas once. Prefill Barnard's Star unless the URL carried coordinates.
  useEffect(() => {
    let alive = true
    EXAMPLES.forEach(t => {
      loadMeta(t.slug).then(m => {
        if (!alive) return
        setMetas(prev => ({ ...prev, [t.slug]: m }))
        if (t.slug === DEFAULT_SLUG && !hasQuery && m.target?.astrometry) {
          setRa(r => r === '' ? coord(m.target!.astrometry!.ra) : r)
          setDec(d => d === '' ? coord(m.target!.astrometry!.dec) : d)
        }
      }).catch(() => { if (alive && t.slug === DEFAULT_SLUG) setMetaFailed(true) })
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

  function pick(slug: string) {
    const a = metas[slug]?.target?.astrometry
    reqId.current++
    setLive(null)
    setSubmitted(false)
    setSelected(slug)
    if (a) { setRa(coord(a.ra)); setDec(coord(a.dec)) }
  }

  function edit(setter: (v: string) => void, v: string, other: 'ra' | 'dec') {
    setter(v)
    const r = other === 'ra' ? v : ra
    const d = other === 'dec' ? v : dec
    const m = matchExample(r, d)
    if (m) { reqId.current++; setLive(null); setSelected(m) } else setSelected(null)
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
      if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error('Live mode needs the deployed API, and it is not running on this copy of the site.')
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
          <p>Fetching photos from NASA's archive, about 1 to 2 minutes. <span className="num">{elapsed}s</span></p>
          <div className="bar" />
        </div>
      </div>
    )
  } else if (live?.kind === 'error') {
    result = (
      <div className="as-result">
        <div className="as-errbox" role="alert">
          <h2>We could not build this spot</h2>
          <p>{live.message}</p>
          <p className="muted">Check the coordinates, then try again. The three examples on the left always work.</p>
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
          <p>Reload the page to try again, or type coordinates and press Show photos.</p>
        </div>
      </div>
    )
  } else {
    result = (
      <div className="as-result" aria-busy="true">
        <span className="skel" style={{ height: 28, width: 'min(34ch, 90%)' }} />
        <span className="skel as-skel-img" />
      </div>
    )
  }

  return (
    <div className="page as-page">
      <h1>See any patch of sky through SPHEREx</h1>
      <p className="as-lede">Pick a spot. We show every SPHEREx photo of it and how far its star moved.</p>

      <div className="as-grid">
        <div className="as-inputs">
          <div>
            <h2 className="as-h">Start with an example</h2>
            <div className="as-examples">
              {EXAMPLES.map(t => {
                const m = metas[t.slug]
                return (
                  <button key={t.slug} type="button" className="as-ex" aria-pressed={selected === t.slug} onClick={() => pick(t.slug)}>
                    <span className="as-ex-name">{t.name}</span>
                    <span className="as-ex-sub">{t.hook}{m ? ` ${m.visits.length} SPHEREx visits.` : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <form className="as-form" onSubmit={submit} noValidate>
            <div>
              <label className="as-label" htmlFor="as-ra">Right ascension (RA), degrees</label>
              <input id="as-ra" className="field" inputMode="decimal" value={ra} onChange={e => edit(setRa, e.target.value, 'ra')} aria-invalid={!!raErr} aria-describedby="as-ra-note" />
              {raErr ? <p className="as-err" id="as-ra-note">{raErr}</p> : <p className="as-hint" id="as-ra-note">Sky longitude, 0 to 360</p>}
            </div>
            <div>
              <label className="as-label" htmlFor="as-dec">Declination (Dec), degrees</label>
              <input id="as-dec" className="field" inputMode="decimal" value={dec} onChange={e => edit(setDec, e.target.value, 'dec')} aria-invalid={!!decErr} aria-describedby="as-dec-note" />
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
              <button className="btn as-btn" disabled={working}>{working ? 'Working…' : 'Show photos'}</button>
              <p className="as-note">New spots take 1 to 2 minutes. The three examples load instantly.</p>
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
        ? <p className="as-answer">{title} moves <span className="num">{fmt(m.measured_arcsec_per_yr, 1)}</span> arcseconds a year across {n} SPHEREx visits. Gaia says <span className="num">{fmt(m.gaia_arcsec_per_yr, 1)}</span>.</p>
        : <p className="as-answer">{meta.target?.claim ?? `${n} SPHEREx visits found at this spot.`}</p>}
      <Viewer meta={meta} src={src} />
    </div>
  )
}
