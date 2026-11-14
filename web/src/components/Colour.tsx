import { useEffect, useState } from 'react'
import SpectrumPlot from './SpectrumPlot'
import { loadMeta } from '../lib/targets'
import type { Meta } from '../lib/types'
import { fmt, lightYears } from '../lib/format'

// The second thing that changes: colour. Only Epsilon Indi B has a validated-method spectrum so far.
export default function Colour() {
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => { loadMeta('epsilon-indi-b').then(setMeta).catch(() => setMeta(null)) }, [])
  const s = meta?.spectrum
  const ly = lightYears(meta?.target?.astrometry)

  return (
    <section className="section" id="colour">
      <div className="section-head">
        <p className="eyebrow mono">02 · Colour</p>
        <h2>Every pixel is a rainbow.</h2>
        <p className="lede">
          Each SPHEREx photo catches an object at a different shade of infrared. Put a year of photos in order of
          wavelength and you get its spectrum: a fingerprint of what it is made of.
        </p>
      </div>

      {s ? (
        <div className="colour-grid">
          <div className="panel">
            <div className="panel-top mono"><span className="tag">Epsilon Indi B</span><span>{s.n_used} SPHEREx photos</span><span>{s.visit_date}</span><span className="pill brightness sm">Preliminary</span></div>
            <SpectrumPlot spectrum={s} notes={[
              { at: 1.5, text: 'dip: water vapour absorbs here' },
              { at: 4.03, text: 'brightest near 4 µm: it is cold' },
            ]} />
          </div>
          <div className="colour-copy">
            <h3>Water vapour, in a failed star{ly ? ` ${fmt(ly, 0)} light years away` : ''}.</h3>
            <p>
              Brown dwarfs are too small to burn like the Sun. They are cold enough for water vapour and methane in
              their air, and those molecules swallow light at certain wavelengths. The deep dips in this curve are
              where that happens. The peak near 4 microns is the glow of a cold object.
            </p>
            <details className="fine">
              <summary>How sure are we?</summary>
              <p>{s.validation}</p>
              <ul>{s.caveats.map(c => <li key={c}>{c}</li>)}</ul>
            </details>
          </div>
        </div>
      ) : (
        <div className="state loading"><div className="skeleton wide" /></div>
      )}
    </section>
  )
}
