import { useEffect, useState } from 'react'
import Viewer from './Viewer'
import Readout from './Readout'
import type { Meta } from '../lib/types'

type State =
  | { kind: 'idle' }
  | { kind: 'working'; done: number; total: number; message: string }
  | { kind: 'done'; meta: Meta; slug: string; label: string }
  | { kind: 'error'; message: string }

interface Reply { meta: Meta; slug: string; label?: string; error?: string }

// Live mode: any coordinates, built on demand by /api/blink (see docs/API.md).
export default function AnySpot() {
  const [ra, setRa] = useState('')
  const [dec, setDec] = useState('')
  const [size, setSize] = useState('4')
  const [state, setState] = useState<State>({ kind: 'idle' })

  // Pre-fill from the URL (?ra=&dec=&size=) so any view can be linked or embedded.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.get('ra') && q.get('dec')) {
      setRa(q.get('ra')!); setDec(q.get('dec')!)
      if (q.get('size')) setSize(q.get('size')!)
    }
  }, [])

  async function run(e: React.FormEvent) {
    e.preventDefault()
    const r = Number(ra), d = Number(dec)
    if (!Number.isFinite(r) || r < 0 || r > 360 || !Number.isFinite(d) || d < -90 || d > 90) {
      setState({ kind: 'error', message: 'Enter RA between 0 and 360 and Dec between -90 and 90, in degrees.' })
      return
    }
    const q = new URLSearchParams({ ra: String(r), dec: String(d), size })
    history.replaceState(null, '', `?${q}#any`)
    setState({ kind: 'working', done: 0, total: 0, message: 'Asking the NASA archive which photos cover this spot…' })

    try {
      const res = await fetch(`/api/blink?${q}`)
      const ctype = res.headers.get('content-type') ?? ''
      if (!ctype.includes('json')) throw new Error('Live mode needs the deployed API. It is not running here.')
      const body = (await res.json()) as Reply
      if (!res.ok || body.error) throw new Error(body.error ?? `The archive request failed (${res.status}).`)
      setState({ kind: 'done', meta: body.meta, slug: body.slug, label: body.label ?? `RA ${r}, Dec ${d}` })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // Elapsed time while a build runs. We do not poll ?status=: on Vercel the status file lives in one
  // instance's temp folder, so another instance could answer 404 (see docs/REVIEW_2026-11-14.md).
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (state.kind !== 'working') return
    setElapsed(0)
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [state.kind])

  return (
    <section className="section" id="any">
      <div className="section-head">
        <p className="eyebrow mono">04 · Any spot in the sky</p>
        <h2>Point the instrument anywhere.</h2>
        <p className="lede">Type sky coordinates. Blink asks NASA's archive for every SPHEREx photo of that spot, stacks them by visit, and plays them back.</p>
      </div>

      <form className="console" onSubmit={run}>
        <label><span className="mono">RA (deg)</span><input inputMode="decimal" value={ra} onChange={e => setRa(e.target.value)} placeholder="269.4485" /></label>
        <label><span className="mono">Dec (deg)</span><input inputMode="decimal" value={dec} onChange={e => setDec(e.target.value)} placeholder="4.7394" /></label>
        <label><span className="mono">Field</span>
          <select value={size} onChange={e => setSize(e.target.value)}>
            <option value="2">2′ (fast)</option><option value="4">4′</option><option value="6">6′ (slow)</option>
          </select>
        </label>
        <button className="btn primary" disabled={state.kind === 'working'}>
          {state.kind === 'working' ? 'Working…' : 'Blink this spot'}
        </button>
      </form>

      <div className="any-out">
        {state.kind === 'idle' && <p className="fine">Each photo takes a few seconds to fetch from the archive, so a new spot can take a minute or two. The five test targets above are ready instantly.</p>}
        {state.kind === 'working' && (
          <div className="state loading"><div className="bar"><i /></div><span className="mono">{state.message} {elapsed}s</span></div>
        )}
        {state.kind === 'error' && <div className="state error"><b>That did not work.</b> {state.message}</div>}
        {state.kind === 'done' && (
          <div className="hero-instrument">
            <Viewer meta={state.meta} label={state.label}
              src={f => `/api/blink?file=${encodeURIComponent(`${state.slug}/${f}`)}`} />
            <Readout meta={state.meta} />
          </div>
        )}
      </div>
    </section>
  )
}
