import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { PageProps } from '../lib/router'
import { getJson, joinUrl } from '../lib/download'
import { wlColor } from '../lib/wavelength'
import PageTabs from '../components/PageTabs'
import './Movers.css'

// Where the precomputed files live. Switch to '/movers' to test with fixtures.
const MOVERS_BASE = '/movers'

// ---------- data shapes (docs/MOVERS_CONTRACT.md) ----------
interface IndexEntry {
  slug: string
  name: string
  designation: string
  kind: 'comet' | 'asteroid'
  n_rows: number
  wl_min_um: number
  wl_max_um: number
  date_first: string
  date_last: string
  note: string
}
interface Meta extends IndexEntry {
  aperture_arcsec: number
  annulus_arcsec: [number, number]
  ephemeris: string
  method: string
  caveats: string[]
  bands: Band[]
}
interface Row {
  mjd: number
  iso: string
  obs_id: string
  detector: number
  ra_pred: number
  dec_pred: number
  ra_meas: number | null
  dec_meas: number | null
  offset_arcsec: number | null
  wavelength_um: number
  bandwidth_um: number
  flux_ujy: number
  flux_err_ujy: number
  snr: number | null
  flags: number
}
interface Band { um: number; label: string; lo_um?: number; hi_um?: number }
interface Frame { file: string; iso: string; wavelength_um: number; ra: number; dec: number; size_deg: number }

const f1 = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '' : n.toFixed(d))
const day = (iso: string) => iso.slice(0, 10)
const when = (iso: string) => iso.slice(0, 16).replace('T', ' ')
const kindWord = (k: string) => (k === 'comet' ? 'Comet' : 'Asteroid')
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Movers({ params, onReady }: PageProps) {
  const slug = params.slug
  return slug ? <Detail key={slug} slug={slug} tabParam={params.tab} onReady={onReady} /> : <List onReady={onReady} />
}

// ---------- list ----------
function List({ onReady }: { onReady: () => void }) {
  const [items, setItems] = useState<IndexEntry[] | null>(null)

  useEffect(() => {
    let live = true
    getJson<IndexEntry[]>(joinUrl(MOVERS_BASE, 'index.json'))
      .then(d => live && setItems(Array.isArray(d) ? d : []))
      .catch(() => live && setItems([]))
      .finally(onReady)
    return () => { live = false }
  }, [onReady])

  const sorted = useMemo(() => (items ?? []).slice().sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'comet' ? -1 : 1)), [items])

  return (
    <div className="page mv">
      <h1>Moving objects</h1>
      <p className="mv-lede">Measured brightness at each SPHEREx wavelength, one row per frame. Brightness, not reflectance.</p>

      {items === null ? (
        <div className="mv-cards" aria-busy="true" aria-label="Loading objects">
          {[0, 1, 2].map(i => <div key={i} className="card"><span className="skel skel-line" style={{ width: '50%' }} /><span className="skel skel-big" style={{ width: '70%' }} /><span className="skel skel-line" /></div>)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card mv-empty">
          <h2>Spectra are being computed</h2>
          <p className="muted">Each object takes a few minutes to measure, so we compute them ahead of time. Check back soon.</p>
        </div>
      ) : (
        <ul className="mv-cards">
          {sorted.map(o => (
            <li key={o.slug}>
              <a className="card mv-card" href={`#/movers/${encodeURIComponent(o.slug)}`}>
                <h2>{o.name}</h2>
                <p className="muted sm"><span className="mv-kind" data-kind={o.kind}>{typeLabel(o)}</span></p>
                <Spark slug={o.slug} kind={o.kind} />
                <p className="mv-meta"><b>{o.n_rows}</b> frames</p>
                <p className="mv-meta muted"><span className="mv-date">{day(o.date_first)}</span> to <span className="mv-date">{day(o.date_last)}</span></p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Comet, or Asteroid plus the taxonomic letter when the note names one, e.g. "(M-type)".
function typeLabel(o: IndexEntry) {
  if (o.kind === 'comet') return 'Comet'
  const t = /\(([A-Za-z]{1,2})-type\)/.exec(o.note)
  return t ? `Asteroid, ${t[1].toUpperCase()}-type` : 'Asteroid'
}

// One small fetch per object, shared and cached, started only when the card scrolls near the screen.
type Pt = { w: number; f: number; k: string }
const sparkCache = new Map<string, Promise<Pt[]>>()
function loadSpark(slug: string) {
  let p = sparkCache.get(slug)
  if (!p) {
    p = getJson<{ rows: Row[] }>(joinUrl(MOVERS_BASE, encodeURIComponent(slug), 'spectrum.json')).then(s =>
      (s.rows ?? []).filter(r => Number.isFinite(r.wavelength_um) && Number.isFinite(r.flux_ujy)).map(r => ({ w: r.wavelength_um, f: r.flux_ujy, k: r.iso.slice(0, 7) })))
    sparkCache.set(slug, p)
  }
  return p
}

function Spark({ slug, kind }: { slug: string; kind: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pts, setPts] = useState<Pt[] | null>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (!seen) return
    let live = true
    loadSpark(slug).then(p => live && setPts(p)).catch(() => live && setPts([]))
    return () => { live = false }
  }, [seen, slug])

  const W = 240, H = 56, P = 4
  let body: ReactNode = null
  if (pts && pts.length) {
    let use = pts
    if (kind === 'comet') {
      const c = new Map<string, number>()
      pts.forEach(p => c.set(p.k, (c.get(p.k) ?? 0) + 1))
      const main = [...c.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      use = pts.filter(p => p.k === main)
    }
    const pos = use.filter(p => p.f > 0)
    const log = pos.length > 1 && Math.max(...pos.map(p => p.f)) / Math.min(...pos.map(p => p.f)) > LOG_RATIO
    const d = log ? pos : use
    const yv = (v: number) => (log ? Math.log10(v) : v)
    const xs = d.map(p => p.w), ys = d.map(p => yv(p.f))
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const X = (v: number) => P + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * P)
    const Y = (v: number) => H - P - ((yv(v) - y0) / (y1 - y0 || 1)) * (H - 2 * P)
    body = d.map((p, i) => <circle key={i} cx={X(p.w)} cy={Y(p.f)} r={1.6} style={{ fill: wlColor(p.w) }} />)
  }
  return (
    <div className="mv-spark" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={pts && pts.length ? 'Small plot of brightness against wavelength' : 'Plot loading'}>
        <line x1={P} x2={W - P} y1={H - 1} y2={H - 1} />
        {body}
      </svg>
    </div>
  )
}

// ---------- detail ----------
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; meta: Meta; rows: Row[]; frames: Frame[] }

const DETAIL_TABS = [{ id: 'spectrum', label: 'Spectrum' }, { id: 'images', label: 'Images' }, { id: 'table', label: 'Measurements' }, { id: 'notes', label: 'Method and limits' }] as const
type DetailTab = (typeof DETAIL_TABS)[number]['id']

function Detail({ slug, tabParam, onReady }: { slug: string; tabParam: string | null; onReady: () => void }) {
  const [d, setD] = useState<Load>({ state: 'loading' })
  // The tab lives in the URL (#/movers/<slug>/<tab>), so links and the back button keep it.
  const tab: DetailTab = DETAIL_TABS.some(t => t.id === tabParam) ? (tabParam as DetailTab) : 'spectrum'
  const setTab = (id: DetailTab) => { location.hash = `#/movers/${encodeURIComponent(slug)}/${id}` }
  const base = joinUrl(MOVERS_BASE, encodeURIComponent(slug))

  useEffect(() => {
    let live = true
    Promise.all([
      getJson<{ meta: Meta; rows: Row[] }>(joinUrl(base, 'spectrum.json')),
      getJson<Frame[]>(joinUrl(base, 'frames.json')).catch(() => [] as Frame[]),
    ])
      .then(([s, frames]) => {
        if (!live) return
        const rows = (s.rows ?? []).filter(r => Number.isFinite(r.wavelength_um) && Number.isFinite(r.flux_ujy))
        setD({ state: 'ok', meta: s.meta, rows, frames: Array.isArray(frames) ? frames : [] })
      })
      .catch(() => live && setD({ state: 'error' }))
      .finally(onReady)
    return () => { live = false }
  }, [base, onReady])

  if (d.state === 'loading') {
    return (
      <div className="page mv" aria-busy="true" aria-label="Loading the spectrum">
        <a className="mv-back" href="#/movers">All moving objects</a>
        <span className="skel skel-big" style={{ width: '40%' }} />
        <span className="skel skel-line" style={{ width: '60%' }} />
        <div className="mv-block"><span className="skel skel-box" style={{ ['--ar' as string]: '2.2' }} /></div>
      </div>
    )
  }
  if (d.state === 'error') {
    return (
      <div className="page mv">
        <a className="mv-back" href="#/movers">All moving objects</a>
        <div className="card mv-empty">
          <h2>We could not load this object</h2>
          <p className="muted">The spectrum file for "{slug}" is missing or unreadable. It may still be computing.</p>
          <a className="btn sm" href="#/movers">See all objects</a>
        </div>
      </div>
    )
  }

  const { meta, rows, frames } = d
  return (
    <div className="page mv">
      <a className="mv-back" href="#/movers">All moving objects</a>
      <header className="mv-head">
        <div>
          <h1>{meta.name}</h1>
          <p className="muted"><span className="mv-kind" data-kind={meta.kind}>{kindWord(meta.kind)}</span>. {meta.designation}. <span className="mv-date">{day(meta.date_first)}</span> to <span className="mv-date">{day(meta.date_last)}</span>.</p>
          <p className="mv-note">{meta.note}</p>
        </div>
        <div className="mv-dl" role="group" aria-label="Download the table">
          <a className="btn sm quiet" href={joinUrl(base, 'spectrum.csv')} download>Download CSV</a>
          <a className="btn sm quiet" href={joinUrl(base, 'spectrum.vot')} download>Download VOTable</a>
          <a className="btn sm quiet" href={joinUrl(base, 'spectrum.json')} download>Download JSON</a>
        </div>
      </header>

      <PageTabs tabs={DETAIL_TABS} value={tab} onChange={setTab} label={`${meta.name} sections`} />

      {tab === 'spectrum' && <section className="mv-block" aria-labelledby="mv-plot-h">
        <h2 id="mv-plot-h" className="card-title">Measured spectrum</h2>
        <p className="mv-sub-t"><b>Brightness, not reflectance.</b>{meta.kind === 'comet' ? ' Comet values depend on the aperture size, the circle we add the light inside.' : ' We did not divide out the Sun.'}</p>
        <p className="caption mv-prose">
          How bright {meta.name} looked at each infrared colour, in <Gloss tip="Microjanskys, a unit of brightness">µJy</Gloss> (microjanskys, a unit of brightness). Each point is one SPHEREx image. Shaded bands mark colours where common ices and gases absorb or glow.
        </p>
        <Plot rows={rows} bands={meta.bands ?? []} />
      </section>}

      {tab === 'images' && <section className="mv-block" aria-labelledby="mv-blink-h">
        <h2 id="mv-blink-h" className="card-title">Blink the images</h2>
        <Blink frames={frames} base={base} name={meta.name} />
      </section>}

      {tab === 'notes' && <>
      <section className="mv-block">
        <h2 className="card-title">How the numbers were made</h2>
        <dl className="mv-facts mv-facts-col">
          <div><dt>Measurements</dt><dd>{meta.n_rows}</dd></div>
          <div><dt>Wavelength</dt><dd>{f1(meta.wl_min_um, 2)} to {f1(meta.wl_max_um, 2)} µm</dd></div>
          <div><dt><Gloss tip="The circle we add the light inside">Aperture</Gloss></dt><dd>{f1(meta.aperture_arcsec, 1)} arcsec</dd></div>
          <div><dt>Sky ring</dt><dd>{meta.annulus_arcsec?.[0]} to {meta.annulus_arcsec?.[1]} arcsec</dd></div>
          <div><dt>Orbit from</dt><dd>{meta.ephemeris}</dd></div>
        </dl>
        <p className="mv-sec-p">{meta.method}</p>
        <p className="muted sm mv-sec-p">Aperture (the circle we add the light inside): {f1(meta.aperture_arcsec, 1)} arcseconds. Sky ring, used to subtract the background: {meta.annulus_arcsec?.[0]} to {meta.annulus_arcsec?.[1]} arcseconds. Orbit source: {meta.ephemeris}.</p>
      </section>

      <section className="mv-block">
        <h2 className="card-title">Limits</h2>
        <ul className="notes-list">
          {(meta.caveats ?? []).map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>
      </>}

      {tab === 'table' && <section className="mv-block">
        <h2 className="card-title">All {rows.length} measurements</h2>
        <RowsTable rows={rows} />
      </section>}
    </div>
  )
}

// Plain-words gloss on a term: dotted underline and a hover or long-press title.
function Gloss({ tip, children }: { tip: string; children: ReactNode }) {
  return <abbr className="mv-gloss" title={tip}>{children}</abbr>
}

// ---------- spectrum plot ----------
function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo || 1
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10))
  return out
}

const EPOCH_COLORS = ['#4DD0F8', '#FFB384', '#C9B8FF', '#8FA8FF', '#7FE3A8']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const epochName = (k: string) => `${MONTHS[+k.slice(5, 7) - 1] ?? k.slice(5, 7)} ${k.slice(0, 4)}`
const LOG_RATIO = 30
const HOVER_PX = 14

const BAND_RANGE: Record<string, [number, number]> = { H2O: [2.6, 2.85], CO2: [4.18, 4.34], CO: [4.55, 4.75] }

function Plot({ rows, bands }: { rows: Row[]; bands: Band[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(720)
  const [sel, setSel] = useState<number | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))))
    ro.observe(el)
    setW(Math.max(280, Math.round(el.clientWidth)))
    return () => ro.disconnect()
  }, [])

  // Epochs: one per calendar month of the observation date. Brightness can change a lot between epochs,
  // so each epoch is its own series and only the biggest one is shown at first.
  const epochs = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach(r => m.set(r.iso.slice(0, 7), (m.get(r.iso.slice(0, 7)) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, n], i) => ({ key, n, color: EPOCH_COLORS[i % EPOCH_COLORS.length] }))
  }, [rows])
  const [on, setOn] = useState<string[] | null>(null)
  const active = on ?? (epochs.length ? [epochs.reduce((a, b) => (b.n > a.n ? b : a)).key] : [])
  const single = active.length === 1
  const colorOf = (k: string) => epochs.find(e => e.key === k)?.color ?? EPOCH_COLORS[0]

  const shown = useMemo(() => rows.filter(r => active.includes(r.iso.slice(0, 7))), [rows, active])
  const log = useMemo(() => {
    const pos = shown.map(r => r.flux_ujy).filter(v => v > 0)
    return pos.length > 1 && Math.max(...pos) / Math.min(...pos) > LOG_RATIO
  }, [shown])
  const vis = useMemo(() => (log ? shown.filter(r => r.flux_ujy > 0) : shown), [shown, log])
  const hidden = shown.length - vis.length
  // When every row carries a flag the open-circle marker says nothing, so it is only used if some rows are clean.
  const mark = rows.some(r => !r.flags) && rows.some(r => r.flags)

  const H = w < 520 ? 290 : 360
  const PAD = { l: log ? 76 : w < 520 ? 64 : 66, r: 14, t: 20, b: 48 }

  const g = useMemo(() => {
    if (!vis.length) return null
    const ws = vis.map(r => r.wavelength_um)
    const pad = (Math.max(...ws) - Math.min(...ws) || 1) * 0.04
    const x0 = Math.min(...ws) - pad, x1 = Math.max(...ws) + pad
    if (log) {
      const lo = Math.log10(Math.min(...vis.map(r => r.flux_ujy))) - 0.15
      const hi = Math.log10(Math.max(...vis.map(r => r.flux_ujy + (r.flux_err_ujy || 0)))) + 0.3
      return { x0, x1, lo, hi }
    }
    const lo = Math.min(0, ...vis.map(r => r.flux_ujy - (r.flux_err_ujy || 0)))
    const hi = Math.max(...vis.map(r => r.flux_ujy + (r.flux_err_ujy || 0))) * 1.15 || 1
    return { x0, x1, lo, hi }
  }, [vis, log])

  const chips = (
    <div className="mv-epochs" role="group" aria-label="Show observation epochs">
      <span className="mv-epochs-l">Show visits from:</span>
      {epochs.map(e => (
        <button key={e.key} aria-pressed={active.includes(e.key)}
          onClick={() => { setSel(null); setOn(active.includes(e.key) ? active.filter(k => k !== e.key) : [...active, e.key]) }}>
          <span className="mv-sw" style={{ background: e.color }} aria-hidden />{epochName(e.key)} <b>{e.n}</b>
        </button>
      ))}
    </div>
  )
  if (!g) return <>{epochs.length > 0 && chips}<p className="muted">{rows.length ? 'Choose an epoch to plot.' : 'No measurements to plot.'}</p></>

  const x = (v: number) => PAD.l + ((v - g.x0) / (g.x1 - g.x0)) * (w - PAD.l - PAD.r)
  const yv = (v: number) => (log ? Math.log10(Math.max(v, 1e-9)) : v)
  const y = (v: number) => H - PAD.b - ((Math.max(yv(v), g.lo) - g.lo) / (g.hi - g.lo)) * (H - PAD.t - PAD.b)
  let yt: number[]
  if (log) {
    yt = []
    for (let k = Math.floor(g.lo); k <= Math.ceil(g.hi); k++) for (const m of [1, 3]) { const v = m * 10 ** k, l = Math.log10(v); if (l >= g.lo && l <= g.hi) yt.push(v) }
  } else yt = niceTicks(g.lo, g.hi, 5)
  const xt = niceTicks(g.x0, g.x1, w < 520 ? 4 : 8)

  // Band labels: two rows, so neighbouring labels do not overlap.
  const inRange = bands.filter(b => b.um >= g.x0 && b.um <= g.x1).sort((a, b) => a.um - b.um)
  const rowEnd = [-1e9, -1e9]
  const labelled = inRange.map(b => {
    const px = x(b.um), half = b.label.length * 3.9 + 3
    const lvl = px - half > rowEnd[0] ? 0 : px - half > rowEnd[1] ? 1 : 0
    rowEnd[lvl] = px + half
    const rg: [number, number] = b.lo_um !== undefined && b.hi_um !== undefined ? [b.lo_um, b.hi_um] : BAND_RANGE[b.label.replace(/[^A-Za-z0-9]/g, '').toUpperCase()] ?? [b.um - 0.08, b.um + 0.08]
    const bx0 = Math.max(PAD.l, x(rg[0])), bx1 = Math.min(w - PAD.r, x(rg[1]))
    return { ...b, px, lvl, half, bx0, bw: Math.max(2, bx1 - bx0), anchor: px < PAD.l + half ? 'start' : px > w - PAD.r - half ? 'end' : 'middle' }
  })

  // Mouse: highlight only when within HOVER_PX of a point. Touch: tap selects the nearest point within a larger reach.
  function pick(e: PointerEvent<SVGSVGElement>, tap: boolean) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left, py = e.clientY - box.top
    const reach = e.pointerType === 'touch' ? 28 : HOVER_PX
    let best: number | null = null, bd = reach
    vis.forEach((r, i) => { const dd = Math.hypot(x(r.wavelength_um) - px, y(r.flux_ujy) - py); if (dd <= bd) { bd = dd; best = i } })
    if (best !== null || e.pointerType !== 'touch' || tap) setSel(best)
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { setSel(null); return }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    setSel(s => Math.min(vis.length - 1, Math.max(0, (s ?? 0) + (e.key === 'ArrowRight' ? 1 : -1))))
  }
  const s = sel === null ? null : vis[sel] ?? null
  const tip = s ? { px: x(s.wavelength_um), py: y(s.flux_ujy) } : null
  const fmtTick = (v: number) => v.toLocaleString('en-US')

  return (
    <div className="mv-plot" ref={box}>
      {chips}
      <div className="mv-stage" tabIndex={0} onKeyDown={onKey} aria-label={`Spectrum with ${vis.length} points. Use the left and right arrow keys to read each point.`}>
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Flux in microjanskys against wavelength in microns"
          onPointerMove={e => pick(e, false)} onPointerDown={e => pick(e, true)} onPointerLeave={e => { if (e.pointerType !== 'touch') setSel(null) }}>
          {yt.map(v => (
            <g key={'y' + v}>
              <line className="gl" x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} />
              <text className="tick" x={PAD.l - 8} y={y(v) + 4} textAnchor="end">{fmtTick(v)}</text>
            </g>
          ))}
          {xt.map(v => (
            <g key={'x' + v}>
              <line className="gl faint" x1={x(v)} x2={x(v)} y1={PAD.t} y2={H - PAD.b} />
              <text className="tick" x={x(v)} y={H - PAD.b + 18} textAnchor="middle">{v}</text>
            </g>
          ))}
          {!log && g.lo < 0 && <line className="zero" x1={PAD.l} x2={w - PAD.r} y1={y(0)} y2={y(0)} />}
          {labelled.map(b => <rect key={'bs' + b.um + b.label} className="band-shade" x={b.bx0} y={PAD.t} width={b.bw} height={H - PAD.t - PAD.b} />)}
          {labelled.map(b => (
            <g key={b.um + b.label}>
              <rect className="band-bg" x={b.anchor === 'start' ? b.px : b.anchor === 'end' ? b.px - 2 * b.half : b.px - b.half} y={PAD.t + 3 + b.lvl * 18} width={2 * b.half} height={16} rx={4} />
              <text className="band-t" x={b.anchor === 'start' ? b.px + b.half : b.anchor === 'end' ? b.px - b.half : b.px} y={PAD.t + 15 + b.lvl * 18} textAnchor="middle">{b.label}</text>
            </g>
          ))}
          {vis.map((r, i) => {
            const c = single ? wlColor(r.wavelength_um) : colorOf(r.iso.slice(0, 7))
            return (
              <g key={i} className={i === sel ? 'pt on' : 'pt'}>
                <path className="eb" style={single ? undefined : { stroke: c }} d={`M${x(r.wavelength_um)} ${y(r.flux_ujy - (r.flux_err_ujy || 0))}V${y(r.flux_ujy + (r.flux_err_ujy || 0))}M${x(r.wavelength_um) - 3} ${y(r.flux_ujy - (r.flux_err_ujy || 0))}h6M${x(r.wavelength_um) - 3} ${y(r.flux_ujy + (r.flux_err_ujy || 0))}h6`} />
                <circle className={mark && r.flags ? 'flagged' : ''} cx={x(r.wavelength_um)} cy={y(r.flux_ujy)} r={i === sel ? 5 : 3} style={mark && r.flags ? { stroke: c } : { fill: c }} />
              </g>
            )
          })}
          {single && Array.from({ length: 8 }, (_, k) => {
            const x0p = PAD.l + (k * (w - PAD.l - PAD.r)) / 8, x1p = PAD.l + ((k + 1) * (w - PAD.l - PAD.r)) / 8
            const mid = g.x0 + ((k + 0.5) / 8) * (g.x1 - g.x0)
            return <rect key={'wk' + k} x={x0p} y={H - PAD.b} width={x1p - x0p} height={4} style={{ fill: wlColor(Math.max(mid, 0.01)) }} />
          })}
          <text className="axl" x={(PAD.l + w - PAD.r) / 2} y={H - 8} textAnchor="middle">Wavelength (µm)</text>
          <text className="axl" transform={`translate(12 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle">{log ? 'Flux (µJy, log scale)' : 'Flux (µJy)'}</text>
        </svg>
        {s && tip && (
          <div className="mv-tip" aria-hidden style={{ left: tip.px, top: tip.py, transform: `translate(${tip.px > w - 230 ? 'calc(-100% - 12px)' : '12px'}, ${tip.py < 150 ? '12px' : 'calc(-100% - 12px)'})` }}>
            <p className="mv-tip-w"><b>{f1(s.wavelength_um, 3)}</b> µm</p>
            <p><b>{f1(s.flux_ujy, 1)}</b> ± <b>{f1(s.flux_err_ujy, 1)}</b> µJy</p>
            {s.snr !== null && s.snr !== undefined && <p>S/N <b>{f1(s.snr, 1)}</b></p>}
            <p>{when(s.iso)} UTC</p>
            <p className="muted">{epochName(s.iso.slice(0, 7))}{s.flags ? '. Flagged' : ''}</p>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {s ? `${f1(s.wavelength_um, 3)} microns. Flux ${f1(s.flux_ujy, 1)} plus or minus ${f1(s.flux_err_ujy, 1)} microjanskys. Signal to noise ${f1(s.snr, 1)}. ${when(s.iso)} UTC. ${epochName(s.iso.slice(0, 7))}.${s.flags ? ' Flagged.' : ''}` : ''}
      </p>
      <ul className="legend mv-legend">
        <li><span className="mv-dot" style={single ? { background: wlColor(2.5) } : undefined} /> Measurement with error bar</li>
        {mark && <li><span className="mv-dot open" /> Flagged by SPHEREx</li>}
        <li><span className="mv-dot" style={{ background: '#4DD0F8' }} /><span className="mv-dot" style={{ background: '#FFB384' }} /> {single ? 'Colour is wavelength' : 'Colour is epoch'}</li>
      </ul>
      <p className="caption mv-prose mv-capline">
        Point at a dot or tap it to read its values.{log ? ` Flux axis is logarithmic (brightness spans over ${LOG_RATIO}x).` : ''}{hidden > 0 ? ` ${hidden} value${hidden > 1 ? 's' : ''} at or below zero cannot be drawn on it, but ${hidden > 1 ? 'are' : 'is'} in the table.` : ''}{epochs.length > 1 ? ' Epochs are plotted apart because brightness can change a lot between visits.' : ''}
      </p>
    </div>
  )
}

// ---------- blink ----------
function Blink({ frames, base, name }: { frames: Frame[]; base: string; name: string }) {
  const [i, setI] = useState(0)
  const [play, setPlay] = useState(() => !reduceMotion())

  useEffect(() => {
    if (!play || frames.length < 2) return
    const t = setInterval(() => setI(v => (v + 1) % frames.length), 750)
    return () => clearInterval(t)
  }, [play, frames.length])

  if (!frames.length) return <p className="muted">No cutout images for this object yet.</p>
  const f = frames[Math.min(i, frames.length - 1)]
  const arcmin = f.size_deg ? Math.round(f.size_deg * 60 * 10) / 10 : null

  return (
    <div className="mv-blink">
      <div className="mv-frame">
        {frames.map((fr, k) => (
          <img key={fr.file} className={k === i ? 'on' : ''} src={joinUrl(base, fr.file)} alt={k === i ? `${name} in the SPHEREx image taken ${day(fr.iso)} at ${f1(fr.wavelength_um, 2)} microns, centred on where it should be` : ''} />
        ))}
        <svg viewBox="0 0 100 100" aria-hidden><path d="M50 36v8M50 56v8M36 50h8M56 50h8" /></svg>
      </div>
      <p className="mv-cap"><b>{when(f.iso)} UTC</b>. <span className="mv-wl"><span className="mv-wsw" style={{ background: wlColor(f.wavelength_um) }} aria-hidden />{f1(f.wavelength_um, 2)} µm</span>. Image {i + 1} of {frames.length}.</p>
      <div className="mv-ctl">
        <button className="btn sm quiet" onClick={() => setPlay(p => !p)} aria-pressed={play}>{play ? 'Pause' : 'Play'}</button>
        <input type="range" min={0} max={frames.length - 1} value={i} onChange={e => { setPlay(false); setI(+e.target.value) }} aria-label="Choose an image" />
      </div>
      <p className="caption">{arcmin ? `About ${arcmin}′ across. ` : ''}The cross marks the predicted position. Each frame is a different wavelength.</p>
    </div>
  )
}

// ---------- table ----------
type Col = { key: keyof Row; label: string; digits?: number; title?: string }
const COLS: Col[] = [
  { key: 'wavelength_um', label: 'Wavelength (µm)', digits: 3 },
  { key: 'flux_ujy', label: 'Flux (µJy)', digits: 2 },
  { key: 'flux_err_ujy', label: 'Error (µJy)', digits: 2 },
  { key: 'snr', label: 'S/N', digits: 1, title: 'Signal to noise: how far above the noise' },
  { key: 'iso', label: 'Date (UTC)' },
  { key: 'offset_arcsec', label: 'Offset (arcsec)', digits: 2, title: 'Distance between the measured and the predicted position. Blank when the object was too faint to find.' },
  { key: 'detector', label: 'Detector' },
  { key: 'flags', label: 'Flags', title: 'SPHEREx quality markers. 0 means none were raised inside the aperture.' },
]
const SHOWN = 10 // rows shown first
const MORE = 25 // rows added per "Show more"

function RowsTable({ rows }: { rows: Row[] }) {
  const [key, setKey] = useState<keyof Row>('wavelength_um')
  const [asc, setAsc] = useState(true)
  const [limit, setLimit] = useState(SHOWN)

  const sorted = useMemo(() => {
    const out = rows.slice()
    out.sort((a, b) => {
      const x = a[key], y = b[key]
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return asc ? c : -c
    })
    return out
  }, [rows, key, asc])

  const shown = sorted.slice(0, limit)
  function sortBy(k: keyof Row) {
    if (k === key) setAsc(a => !a)
    else { setKey(k); setAsc(true) }
  }

  return (
    <>
      <p className="caption">One row per SPHEREx image. Click a heading to sort. Flags 0 means none.</p>
      <div className="mv-scroll" tabIndex={0} role="region" aria-label="Measurement table">
        <table className="mv-table">
          <thead>
            <tr>
              {COLS.map(c => (
                <th key={c.key} scope="col" aria-sort={key === c.key ? (asc ? 'ascending' : 'descending') : 'none'} title={c.title}>
                  <button onClick={() => sortBy(c.key)}>{c.label}<span aria-hidden>{key === c.key ? (asc ? ' ▲' : ' ▼') : ''}</span></button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, n) => (
              <tr key={r.obs_id + n} className={r.flags ? 'flag' : ''}>
                {COLS.map(c => {
                  const v = r[c.key]
                  return <td key={c.key}>{c.key === 'iso' ? when(String(v)) : typeof v === 'number' && c.digits !== undefined ? f1(v, c.digits) : v ?? ''}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SHOWN && (
        <p className="mv-more">
          <span className="muted sm">Showing {shown.length} of {rows.length} rows.</span>{' '}
          {rows.length > limit
            ? <button className="linkbtn" onClick={() => setLimit(l => l + MORE)}>Show {Math.min(MORE, rows.length - limit)} more</button>
            : <button className="linkbtn" onClick={() => setLimit(SHOWN)}>Show fewer</button>}
        </p>
      )}
    </>
  )
}
