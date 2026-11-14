import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRoute } from './lib/router'
import Mark from './components/Mark'

// Shell and hash router, after LAMBAT's web app: a sidebar (bottom tab bar under 768 px), one page per route,
// each page lazy-loaded behind a skeleton, and the boot screen in index.html removed after the first draw.
const PAGES = {
  home: lazy(() => import('./pages/Home')),
  movers: lazy(() => import('./pages/Movers')),
  triage: lazy(() => import('./pages/Triage')),
  sky: lazy(() => import('./pages/Sky')),
  target: lazy(() => import('./pages/Target')),
  any: lazy(() => import('./pages/AnySpot')),
  method: lazy(() => import('./pages/Method')),
}
type Key = keyof typeof PAGES

const TITLES: Record<Key, string> = {
  home: 'SPHEREx Blink: spectra of moving objects and dot checks',
  movers: 'Moving objects: SPHEREx Blink',
  triage: 'Vet a dot: SPHEREx Blink',
  sky: 'Sky map: SPHEREx Blink',
  target: 'Targets: SPHEREx Blink',
  any: 'Any spot: SPHEREx Blink',
  method: 'Method and limits: SPHEREx Blink',
}

const Icon = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />
)
const NAV: { id: Key; href: string; label: string; tab: string; icon: string }[] = [
  { id: 'home', href: '#/', label: 'Home', tab: 'Home', icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' },
  { id: 'movers', href: '#/movers', label: 'Moving objects', tab: 'Movers', icon: '<circle cx="6" cy="18" r="2.5"/><path d="M8.5 15.5 20 4"/><path d="M13 4h7v7"/>' },
  { id: 'triage', href: '#/triage', label: 'Vet a dot', tab: 'Vet', icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="m8.5 11 2 2 3.5-4"/>' },
  { id: 'sky', href: '#/sky', label: 'Sky map', tab: 'Sky', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' },
  { id: 'target', href: '#/target', label: 'Target dashboard', tab: 'Targets', icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' },
  { id: 'any', href: '#/any', label: 'Any spot in the sky', tab: 'Any spot', icon: '<circle cx="12" cy="12" r="8"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/><circle cx="12" cy="12" r="1.5"/>' },
  { id: 'method', href: '#/method', label: 'Method and limits', tab: 'Method', icon: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>' },
]

function bootDone() {
  const b = document.getElementById('boot')
  if (!b || b.dataset.done) return
  b.dataset.done = '1'
  b.classList.add('gone')
  setTimeout(() => b.remove(), 400)
}
setTimeout(bootDone, 12000)

export default function App() {
  const route = useRoute()
  const key = (route.key in PAGES ? route.key : null) as Key | null
  const Page = key ? PAGES[key] : null

  useEffect(() => {
    document.title = key ? TITLES[key] : 'Page not found: SPHEREx Blink'
    document.body.className = 'route-' + (key ?? 'notfound')
  }, [key])
  useEffect(() => { if (key !== 'sky') window.scrollTo(0, 0) }, [key, route.slug])

  return (
    <div className="app">
      <Nav active={key} />
      <main id="view" tabIndex={-1}>
        {Page ? (
          <Suspense fallback={<PageSkel />}>
            <Page params={route} onReady={bootDone} />
          </Suspense>
        ) : (
          <NotFound onReady={bootDone} />
        )}
      </main>
    </div>
  )
}

function Nav({ active }: { active: Key | null }) {
  const ul = useRef<HTMLUListElement>(null)
  const ind = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(() => document.documentElement.dataset.nav !== 'closed')
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const f = () => setPhone(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])

  // One highlight that slides between items instead of jumping; re-measured whenever the list resizes.
  useLayoutEffect(() => {
    const place = () => {
      const i = ind.current, list = ul.current
      const a = list?.querySelector<HTMLElement>('a[aria-current="page"]')
      if (!i || !list) return
      if (!a) { i.style.opacity = '0'; return }
      const u = list.getBoundingClientRect(), r = a.getBoundingClientRect()
      i.style.opacity = '1'
      i.style.width = r.width + 'px'
      i.style.height = r.height + 'px'
      i.style.transform = `translate(${r.left - u.left}px, ${r.top - u.top}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    if (ul.current) ro.observe(ul.current)
    return () => ro.disconnect()
  }, [active, open, phone])

  function toggle() {
    const next = !open
    setOpen(next)
    document.documentElement.dataset.nav = next ? 'open' : 'closed'
    try { localStorage.setItem('blink.nav', next ? 'open' : 'closed') } catch { /* private mode */ }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 260)
  }

  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-head">
        <a className="nav-brand" href="#/" aria-label="SPHEREx Blink home"><Mark /><span>SPHEREx <b>Blink</b></span></a>
        <button className="nav-toggle" onClick={toggle} aria-expanded={open} aria-label={open ? 'Collapse the sidebar' : 'Expand the sidebar'}>
          <Icon d='<path d="m15 6-6 6 6 6"/>' />
        </button>
      </div>
      <ul ref={ul}>
        <span className="nav-ind" ref={ind} aria-hidden />
        {NAV.map(n => (
          <li key={n.id}>
            <a className="item" href={n.href} title={n.label} aria-current={active === n.id ? 'page' : undefined}>
              <Icon d={n.icon} /><span>{phone ? n.tab : n.label}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="nav-foot">
        <p className="made"><img src="/nyscp.svg" alt="" /><span>Made by NYSCP, Manila</span></p>
      </div>
    </nav>
  )
}

const w = (v: string) => ({ '--w': v }) as CSSProperties

function PageSkel() {
  return (
    <div className="page-skel" aria-hidden>
      <span className="skel skel-line" style={w('18%')} />
      <span className="skel skel-big" style={w('62%')} />
      <span className="skel skel-line" />
      <span className="skel skel-line" style={w('72%')} />
      <div className="page-skel-row">
        {[0, 1, 2].map(i => <div key={i} className="card"><span className="skel skel-line" style={w('45%')} /><span className="skel skel-big" /></div>)}
      </div>
    </div>
  )
}

function NotFound({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady() }, [onReady])
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p className="muted" style={{ margin: '8px 0 16px' }}>That address does not match a SPHEREx Blink page.</p>
      <a className="btn" href="#/">Back to home</a>
    </div>
  )
}


