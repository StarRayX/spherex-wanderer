import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { PageProps } from '../lib/router'
import { getJson, joinUrl } from '../lib/download'
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
  bands: { um: number; label: string }[]
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
interface Frame { file: string; iso: string; wavelength_um: number; ra: number; dec: number; size_deg: number }

const f1 = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '' : n.toFixed(d))
const day = (iso: string) => iso.slice(0, 10)
const when = (iso: string) => iso.slice(0, 16).replace('T', ' ')
const kindWord = (k: string) => (k === 'comet' ? 'Comet' : 'Asteroid')
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Movers({ params, onReady }: PageProps) {
  const slug = params.slug
  return slug ? <Detail key={slug} slug={slug} onReady={onReady} /> : <List onReady={onReady} />
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
      <p className="mv-lede">
        IRSA's Moving Object Search Tool (MOST) tells you which SPHEREx images caught an asteroid or comet. We go one step further: we give you the measured spectrum as a table, one row per image. IRSA's fixed-position tool cannot do that for something that moves.
      </p>
      <p className="mv-for muted">For researchers who study asteroids and comets and need a spectrum, not a list of images. Every file is a download.</p>

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
                <p className="muted sm"><span className="mv-kind" data-kind={o.kind}>{kindWord(o.kind)}</span>. {o.designation}</p>
                <p className="mv-note">{o.note}</p>
                <dl className="mv-facts">
                  <div><dt>Measurements</dt><dd>{o.n_rows}</dd></div>
                  <div><dt>Wavelength</dt><dd>{f1(o.wl_min_um, 2)} to {f1(o.wl_max_um, 2)} µm</dd></div>
                  <div><dt>Dates</dt><dd>{day(o.date_first)} to {day(o.date_last)}</dd></div>
                </dl>
                <span className="mv-open">Open the spectrum</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- detail ----------
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; meta: Meta; rows: Row[]; frames: Frame[] }

function Detail({ slug, onReady }: { slug: string; onReady: () => void }) {
  const [d, setD] = useState<Load>({ state: 'loading' })
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
        <div className="card mv-block"><span className="skel skel-box" style={{ ['--ar' as string]: '2.2' }} /></div>
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
          <p className="muted"><span className="mv-kind" data-kind={meta.kind}>{kindWord(meta.kind)}</span>. {meta.designation}. {day(meta.date_first)} to {day(meta.date_last)}.</p>
          <p className="mv-note">{meta.note}</p>
        </div>
        <div className="mv-dl" role="group" aria-label="Download the table">
          <a className="btn sm" href={joinUrl(base, 'spectrum.csv')} download>Download CSV</a>
          <a className="btn sm quiet" href={joinUrl(base, 'spectrum.vot')} download>Download VOTable</a>
          <a className="btn sm quiet" href={joinUrl(base, 'spectrum.json')} download>Download JSON</a>
        </div>
      </header>

      <section className="card mv-block" aria-labelledby="mv-plot-h">
        <h2 id="mv-plot-h" className="card-title">Measured spectrum</h2>
        <p className="caption">
          How bright {meta.name} looked at each infrared colour, in microjanskys (µJy), with error bars. Each point is one SPHEREx image. Thin lines mark colours where common ices and gases absorb or glow. This is brightness, not reflectance: we did not divide out the Sun or correct the aperture.
        </p>
        <Plot rows={rows} bands={meta.bands ?? []} />
      </section>

      <div className="mv-two">
        <section className="card mv-block" aria-labelledby="mv-blink-h">
          <h2 id="mv-blink-h" className="card-title">Blink the images</h2>
          <Blink frames={frames} base={base} name={meta.name} />
        </section>
        <section className="card mv-block" aria-labelledby="mv-how-h">
          <h2 id="mv-how-h" className="card-title">How the numbers were made</h2>
          <dl className="mv-facts mv-facts-col">
            <div><dt>Measurements</dt><dd>{meta.n_rows}</dd></div>
            <div><dt>Wavelength</dt><dd>{f1(meta.wl_min_um, 2)} to {f1(meta.wl_max_um, 2)} µm</dd></div>
            <div><dt>Aperture</dt><dd>{f1(meta.aperture_arcsec, 1)} arcsec</dd></div>
            <div><dt>Sky ring</dt><dd>{meta.annulus_arcsec?.[0]} to {meta.annulus_arcsec?.[1]} arcsec</dd></div>
            <div><dt>Orbit from</dt><dd>{meta.ephemeris}</dd></div>
          </dl>
          <details className="mv-fold">
            <summary>Method</summary>
            <p>{meta.method}</p>
            <p className="muted sm">Aperture: {f1(meta.aperture_arcsec, 1)} arcseconds. Sky ring: {meta.annulus_arcsec?.[0]} to {meta.annulus_arcsec?.[1]} arcseconds. Orbit source: {meta.ephemeris}.</p>
          </details>
          <h3 className="mv-sub">Limits</h3>
          <ul className="notes-list">
            {(meta.caveats ?? []).map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </section>
      </div>

      <section className="card mv-block" aria-labelledby="mv-table-h">
        <h2 id="mv-table-h" className="card-title">The table</h2>
        <RowsTable rows={rows} />
      </section>
    </div>
  )
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

function Plot({ rows, bands }: { rows: Row[]; bands: { um: number; label: string }[] }) {
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
  const PAD = { l: log ? 76 : w < 520 ? 52 : 62, r: 14, t: 20, b: 48 }

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
    const px = x(b.um), half = b.label.length * 3.6 + 3
    const lvl = px - half > rowEnd[0] ? 0 : px - half > rowEnd[1] ? 1 : 0
    rowEnd[lvl] = px + half
    return { ...b, px, lvl, half, anchor: px < PAD.l + half ? 'start' : px > w - PAD.r - half ? 'end' : 'middle' }
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
          {labelled.map(b => (
            <g key={b.um + b.label}>
              <line className="band" x1={b.px} x2={b.px} y1={PAD.t} y2={H - PAD.b} />
              <rect className="band-bg" x={b.anchor === 'start' ? b.px : b.anchor === 'end' ? b.px - 2 * b.half : b.px - b.half} y={PAD.t + 3 + b.lvl * 18} width={2 * b.half} height={16} rx={4} />
              <text className="band-t" x={b.anchor === 'start' ? b.px + b.half : b.anchor === 'end' ? b.px - b.half : b.px} y={PAD.t + 15 + b.lvl * 18} textAnchor="middle">{b.label}</text>
            </g>
          ))}
          {vis.map((r, i) => {
            const c = colorOf(r.iso.slice(0, 7))
            return (
              <g key={i} className={i === sel ? 'pt on' : 'pt'}>
                <line className="eb" style={{ stroke: c }} x1={x(r.wavelength_um)} x2={x(r.wavelength_um)} y1={y(r.flux_ujy - (r.flux_err_ujy || 0))} y2={y(r.flux_ujy + (r.flux_err_ujy || 0))} />
                <circle className={mark && r.flags ? 'flagged' : ''} cx={x(r.wavelength_um)} cy={y(r.flux_ujy)} r={i === sel ? 5 : 3} style={mark && r.flags ? { stroke: c } : { fill: c }} />
              </g>
            )
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
      <p className="mv-read">
        <span className="muted">Point at a dot or tap it to read its values.</span>
      </p>
      {log && <p className="caption">The flux axis is logarithmic because brightness spans more than a factor of {LOG_RATIO}. Gridlines step by about a factor of 3.{hidden > 0 ? ` ${hidden} measurement${hidden > 1 ? 's' : ''} at or below zero cannot be drawn on a log axis. They are still in the table.` : ''}</p>}
      <ul className="legend mv-legend">
        <li><span className="mv-dot" /> Measurement with error bar</li>
        {mark && <li><span className="mv-dot open" /> SPHEREx flagged some pixels in the aperture</li>}
        {labelled.length > 0 && <li><span className="mv-bandkey" /> Colour of a known feature</li>}
      </ul>
      {epochs.length > 1 && <p className="caption">Each epoch is a separate set of visits, and the object's brightness can change a lot between them, so epochs are plotted apart. The table and downloads include every epoch.</p>}
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
      <p className="mv-cap"><b>{when(f.iso)} UTC</b>. {f1(f.wavelength_um, 2)} µm. Image {i + 1} of {frames.length}.</p>
      <div className="mv-ctl">
        <button className="btn sm quiet" onClick={() => setPlay(p => !p)} aria-pressed={play}>{play ? 'Pause' : 'Play'}</button>
        <input type="range" min={0} max={frames.length - 1} value={i} onChange={e => { setPlay(false); setI(+e.target.value) }} aria-label="Choose an image" />
      </div>
      <p className="caption">{arcmin ? `Each cutout is about ${arcmin} arcminutes wide. ` : ''}The cross marks where the orbit says the object should be. The colour changes from image to image, so brightness changes too.</p>
    </div>
  )
}

// ---------- table ----------
type Col = { key: keyof Row; label: string; digits?: number; title?: string }
const COLS: Col[] = [
  { key: 'wavelength_um', label: 'Wavelength (µm)', digits: 3 },
  { key: 'flux_ujy', label: 'Flux (µJy)', digits: 2 },
  { key: 'flux_err_ujy', label: 'Error (µJy)', digits: 2 },
  { key: 'snr', label: 'S/N', digits: 1, title: 'Signal to noise: flux divided by error' },
  { key: 'iso', label: 'Date (UTC)' },
  { key: 'offset_arcsec', label: 'Offset (arcsec)', digits: 2, title: 'Distance between the measured and the predicted position. Blank when the object was too faint to find.' },
  { key: 'detector', label: 'Detector' },
  { key: 'flags', label: 'Flags', title: 'Sum of SPHEREx flag bits inside the aperture. 0 means none.' },
]
const SHOWN = 50

function RowsTable({ rows }: { rows: Row[] }) {
  const [key, setKey] = useState<keyof Row>('wavelength_um')
  const [asc, setAsc] = useState(true)
  const [all, setAll] = useState(false)

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

  const shown = all ? sorted : sorted.slice(0, SHOWN)
  function sortBy(k: keyof Row) {
    if (k === key) setAsc(a => !a)
    else { setKey(k); setAsc(true) }
  }

  return (
    <>
      <p className="caption">One row per SPHEREx image. Click a heading to sort. Flags is the sum of SPHEREx's flag bits inside the aperture, and 0 means none.</p>
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
          <button className="linkbtn" onClick={() => setAll(a => !a)}>{all ? 'Show the first 50' : `Show all ${rows.length}`}</button>
        </p>
      )}
    </>
  )
}
