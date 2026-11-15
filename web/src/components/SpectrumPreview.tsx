import { useEffect, useState } from 'react'
import { getJson } from '../lib/download'
import { wlColor } from '../lib/wavelength'

// Home: the headline promises a table, so show one. Five rows of the 3I/ATLAS spectrum from its main epoch,
// spread across the wavelength range (shortest, longest and three between), straight from spectrum.json.
type Row = { wavelength_um: number; flux_ujy: number; flux_err_ujy: number; iso: string }

const BASE = '/movers/3i-atlas'
const SHOW = 5
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function SpectrumPreview() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [epoch, setEpoch] = useState<{ label: string; n: number } | null>(null)

  useEffect(() => {
    let live = true
    getJson<{ rows: Row[] }>(`${BASE}/spectrum.json`).then(s => {
      if (!live) return
      const all = (s.rows ?? []).filter(r => Number.isFinite(r.wavelength_um) && Number.isFinite(r.flux_ujy))
      // Rows from one epoch only (the month with the most frames): the comet's brightness changes a lot
      // between epochs, so mixing them would make neighbouring rows look wrong.
      const n = new Map<string, number>()
      all.forEach(r => n.set(r.iso.slice(0, 7), (n.get(r.iso.slice(0, 7)) ?? 0) + 1))
      const main = [...n.entries()].reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0])[0]
      const ep = all.filter(r => r.iso.startsWith(main)).sort((a, b) => a.wavelength_um - b.wavelength_um)
      const pick = ep.length <= SHOW ? ep : Array.from({ length: SHOW }, (_, k) => ep[Math.round((k * (ep.length - 1)) / (SHOW - 1))])
      setTotal(all.length)
      setEpoch({ label: new Date(main + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }), n: ep.length })
      setRows(pick)
    }).catch(() => live && setRows([]))
    return () => { live = false }
  }, [])

  if (rows && rows.length === 0) return null

  return (
    <section className="sp" aria-labelledby="sp-h">
      <h2 id="sp-h" className="sp-h">3I/ATLAS spectrum{epoch ? <span className="sp-n">, {epoch.label}: {SHOW} of {epoch.n} rows</span> : null}</h2>
      <div className="sp-scroll" tabIndex={0} role="region" aria-label="Five rows of the 3I/ATLAS spectrum">
        <table className="sp-table">
          <thead>
            <tr><th scope="col">Wavelength (µm)</th><th scope="col">Flux (µJy)</th><th scope="col">Error (µJy)</th><th scope="col">Date (UTC)</th></tr>
          </thead>
          <tbody>
            {rows ? rows.map(r => (
              <tr key={r.iso + r.wavelength_um}>
                <td><span className="sp-sw" style={{ background: wlColor(r.wavelength_um) }} aria-hidden />{r.wavelength_um.toFixed(3)}</td>
                <td>{num(r.flux_ujy)}</td>
                <td>{num(r.flux_err_ujy)}</td>
                <td>{r.iso.slice(0, 10)}<span className="sp-t"> {r.iso.slice(11, 16)}</span></td>
              </tr>
            )) : Array.from({ length: SHOW }, (_, k) => (
              <tr key={k}><td colSpan={4}><span className="skel skel-line" /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sp-dl">
        All {total || 116} rows: <a href={`${BASE}/spectrum.csv`} download>CSV</a> · <a href={`${BASE}/spectrum.vot`} download>VOTable</a> · <a href={`${BASE}/spectrum.json`} download>JSON</a> · <a href="#/movers/3i-atlas">plot</a>
      </p>
    </section>
  )
}
