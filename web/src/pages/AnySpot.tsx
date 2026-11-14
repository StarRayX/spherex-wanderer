import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { PageProps } from '../lib/router'
import type { Meta } from '../lib/types'
import { fmt } from '../lib/format'
import Viewer from '../components/Viewer'

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; meta: Meta; slug: string; label: string }
  | { kind: 'error'; message: string }

interface Reply { meta: Meta; slug: string; label?: string; error?: string }

// Gaia DR3 positions (year 2016) of three showcase targets, so a live result can be compared with the prebuilt one.
const EXAMPLES = [
  { name: "Barnard's Star", ra: 269.4485, dec: 4.7394 },
  { name: 'Epsilon Indi B', ra: 331.0765, dec: -56.7938 },
  { name: 'RW Aurigae', ra: 76.9561, dec: 30.4012 },
]

// Live mode: any coordinates, built on demand by /api/blink (docs/API.md).
export default function AnySpot({ params, onReady }: PageProps) {
  const [ra, setRa] = useState(params.query.get('ra') ?? '')
  const [dec, setDec] = useState(params.query.get('dec') ?? '')
  const [size, setSize] = useState(params.query.get('size') ?? '4')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => { onReady() }, [onReady])

  // Elapsed time while a build runs. We do not poll ?status=: on Vercel the status file lives in one
  // instance's temp folder, so another instance could answer 404 (docs/REVIEW_2026-11-14.md).
  useEffect(() => {
    if (state.kind !== 'working') return
    setElapsed(0)
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [state.kind])

  async function run(e: FormEvent) {
    e.preventDefault()
    const r = Number(ra), d = Number(dec)
    if (!ra || !dec || !Number.isFinite(r) || r < 0 || r > 360 || !Number.isFinite(d) || d < -90 || d > 90) {
      setState({ kind: 'error', message: 'Enter RA between 0 and 360 and Dec between -90 and 90, both in degrees.' })
      return
    }
    const q = new URLSearchParams({ ra: String(r), dec: String(d), size })
    history.replaceState(null, '', `#/any?${q}`)
    setState({ kind: 'working' })
    try {
      const res = await fetch(`/api/blink?${q}`)
      if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error('Live mode needs the deployed API, and it is not running on this copy of the site.')
      const body = (await res.json()) as Reply
      if (!res.ok || body.error) throw new Error(body.error ?? `The archive request failed (${res.status}).`)
      setState({ kind: 'done', meta: body.meta, slug: body.slug, label: body.label ?? `RA ${fmt(r, 4)}, Dec ${fmt(d, 4)}` })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="page">
      <p className="eyebrow">Any spot in the sky</p>
      <h1 style={{ fontSize: 'var(--t-xl)', margin: '8px 0 12px' }}>Point SPHEREx anywhere.</h1>
      <p className="muted" style={{ maxWidth: '60ch' }}>Type sky coordinates. Blink asks NASA's archive for every SPHEREx photo of that spot, stacks them by visit, and plays them back. Each photo takes a few seconds to fetch, so a new spot can take a minute or two.</p>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="examples">
          <span className="caption" style={{ margin: 0 }}>Try one:</span>
          {EXAMPLES.map(x => (
            <button key={x.name} type="button" className="btn sm quiet" onClick={() => { setRa(String(x.ra)); setDec(String(x.dec)) }}>{x.name}</button>
          ))}
        </div>
        <form className="console" onSubmit={run}>
          <label>RA, sky longitude (deg)<input className="field mono" inputMode="decimal" value={ra} onChange={e => setRa(e.target.value)} placeholder="269.4485" /></label>
          <label>Dec, sky latitude (deg)<input className="field mono" inputMode="decimal" value={dec} onChange={e => setDec(e.target.value)} placeholder="4.7394" /></label>
          <label>Field of view
            <select className="field" value={size} onChange={e => setSize(e.target.value)}>
              <option value="2">2 arcmin (fast)</option><option value="4">4 arcmin</option><option value="6">6 arcmin (slow)</option>
            </select>
          </label>
          <button className="btn" disabled={state.kind === 'working'}>{state.kind === 'working' ? 'Working…' : 'Show this spot'}</button>
        </form>
      </div>

      <div style={{ marginTop: 16 }}>
        {state.kind === 'working' && (
          <div className="card" role="status"><p style={{ margin: '0 0 12px' }}>Asking NASA's archive for every SPHEREx photo of this spot. <span className="mono">{elapsed}s</span></p><div className="bar" /></div>
        )}
        {state.kind === 'error' && <p className="notice" role="alert"><b>That did not work.</b> {state.message}</p>}
        {state.kind === 'done' && (
          <div className="card split">
            <Viewer meta={state.meta} src={f => `/api/blink?file=${encodeURIComponent(`${state.slug}/${f}`)}`} />
            <div>
              <h2 className="card-title">{state.label}</h2>
              <p className="caption">{state.meta.visits.length} visits found.</p>
              {state.meta.motion
                ? <p>Drift: <b className="mono">{fmt(state.meta.motion.measured_arcsec_per_yr, 1)} ± {fmt(state.meta.motion.error_arcsec_per_yr, 1)} ″/yr</b>. Gaia says <b className="mono">{fmt(state.meta.motion.gaia_arcsec_per_yr, 1)}</b>.</p>
                : <p className="muted">No drift measured at this spot.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
