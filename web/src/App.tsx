import { useEffect, useState } from 'react'
import Hero from './components/Hero'
import Time from './components/Time'
import Colour from './components/Colour'
import Gallery from './components/Gallery'
import AnySpot from './components/AnySpot'
import Method from './components/Method'
import { TARGETS } from './lib/targets'

function initialTarget() {
  const t = new URLSearchParams(location.search).get('target')
  return TARGETS.some(x => x.slug === t) ? t! : TARGETS[0].slug
}

export default function App() {
  const [slug, setSlug] = useState(initialTarget)

  // Sections fill in after their data loads, so a deep link (#colour) needs a second scroll.
  useEffect(() => {
    if (!location.hash) return
    const t = setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 700)
    return () => clearTimeout(t)
  }, [])

  function select(s: string, scroll = false) {
    setSlug(s)
    const q = new URLSearchParams(location.search)
    q.set('target', s)
    history.replaceState(null, '', `?${q}${location.hash}`)
    if (scroll) document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <header className="bar-top">
        <a href="#top" className="wordmark" aria-label="SPHEREx Blink, home">
          <Mark /><span>SPHEREx <b>Blink</b></span>
        </a>
        <nav className="mono">
          <a href="#time">Time</a><a href="#colour">Colour</a><a href="#targets">Targets</a>
          <a href="#any">Any spot</a><a href="#method">Method</a>
        </nav>
      </header>
      <main>
        <Hero slug={slug} onSelect={s => select(s)} />
        <Time />
        <Colour />
        <Gallery onOpen={s => select(s, true)} />
        <AnySpot />
        <Method />
      </main>
      <footer className="foot">
        <p>Images: NASA SPHEREx, via NASA/IPAC Infrared Science Archive (IRSA). Positions: ESA Gaia DR3.
          Built for the 2026 NASA Space Apps Challenge, "Planet X and SPHEREx". Not an official NASA product.</p>
        <p className="made mono"><img src="/nyscp.svg" alt="" />Made by NYSCP, Manila</p>
      </footer>
    </>
  )
}

// Product mark: a reticle with two offset dots, one star seen on two dates.
function Mark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10" cy="13.5" r="1.6" fill="currentColor" opacity="0.35" />
      <circle cx="13.5" cy="10" r="2" fill="var(--accent)" />
    </svg>
  )
}
