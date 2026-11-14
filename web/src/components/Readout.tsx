import type { Meta } from '../lib/types'
import { axisWords, decDms, fmt, lightYears, raHms, tidy, yearsPerMoon } from '../lib/format'
import { STATUS_LABEL, type Status } from '../lib/targets'

// Boxed instrument readouts. Every number here comes straight from meta.json.
export default function Readout({ meta, status }: { meta: Meta; status?: Status }) {
  const a = meta.target?.astrometry
  const m = meta.motion
  const ly = lightYears(a)
  const moon = yearsPerMoon(a)

  return (
    <div className="readout">
      {status && <div className={`pill ${status}`}>{STATUS_LABEL[status]}</div>}

      {m ? (
        <div className="cell big">
          <label>Drift across the sky, {axisWords(m)}</label>
          <div className="val mono">
            <span className="accent">{fmt(m.measured_arcsec_per_yr, 1)}</span>
            <small> ± {fmt(m.error_arcsec_per_yr, 1)}″/yr</small>
          </div>
          <p className="sub">Measured by SPHEREx. Gaia says <b className="mono">{fmt(m.gaia_arcsec_per_yr, 1)}″/yr</b>,
            {Math.abs(m.measured_arcsec_per_yr - m.gaia_arcsec_per_yr) <= m.error_arcsec_per_yr
              ? ' inside our error bar.' : ' just outside our error bar.'}</p>
        </div>
      ) : (
        <div className="cell big">
          <label>What SPHEREx shows</label>
          <p className="claim">{tidy(meta.target?.claim ?? '')}</p>
        </div>
      )}

      <div className="grid2">
        {ly !== null && (
          <div className="cell"><label>Distance</label>
            <div className="val mono">{ly < 100 ? fmt(ly, 1) : Math.round(ly).toLocaleString()} <small>light years</small></div></div>
        )}
        {moon !== null && (
          <div className="cell"><label>Crosses a full Moon in</label>
            <div className="val mono">{moon < 1000 ? Math.round(moon) : Math.round(moon / 100) * 100} <small>years</small></div></div>
        )}
        {a && (
          <>
            <div className="cell"><label>RA · sky longitude</label><div className="val mono sm">{raHms(a.ra)}</div></div>
            <div className="cell"><label>Dec · sky latitude</label><div className="val mono sm">{decDms(a.dec)}</div></div>
          </>
        )}
      </div>

      {m && meta.target?.claim && <p className="claim small">{tidy(meta.target.claim)}</p>}
    </div>
  )
}
