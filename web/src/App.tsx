import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRoute } from './lib/router'
import Mark from './components/Mark'

// Shell and hash router, after LAMBAT's web app: a sidebar (bottom tab bar under 768 px), one page per route,
// each page lazy-loaded behind a skeleton. index.html carries a static skeleton inside #root that React replaces on first render.
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
  triage: 'Vet a field: SPHEREx Blink',
  sky: 'Sky map: SPHEREx Blink',
  target: 'Test stars: SPHEREx Blink',
  any: 'Any spot: SPHEREx Blink',
  method: 'Method: SPHEREx Blink',
}

const Icon = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />
)
type NavItem = { id: Key; href: string; label: string; tab: string; icon: string; sub?: string }
const NAV: NavItem[] = [
  { id: 'home', href: '#/', label: 'Home', tab: 'Home', icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' },
  { id: 'movers', href: '#/movers', label: 'Moving objects', tab: 'Movers', icon: '<circle cx="6" cy="18" r="2.5"/><path d="M8.5 15.5 20 4"/><path d="M13 4h7v7"/>' },
  { id: 'triage', href: '#/triage', label: 'Vet a field', tab: 'Vet', icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="m8.5 11 2 2 3.5-4"/>' },
]
const EXPLORE: NavItem[] = [
  { id: 'sky', href: '#/sky', label: 'Sky map', tab: 'Sky', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' },
  { id: 'target', href: '#/target', label: 'Test stars', tab: 'Test stars', sub: '12 prepared stars with checked results', icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' },
  { id: 'any', href: '#/any', label: 'Any spot', tab: 'Any spot', sub: 'Look up any position live (1 to 2 minutes)', icon: '<circle cx="12" cy="12" r="8"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/><circle cx="12" cy="12" r="1.5"/>' },
  { id: 'method', href: '#/method', label: 'Method', tab: 'Method', icon: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>' },
]
// Phone bottom bar: Home, the two pitch pages, Sky, and a More sheet holding the rest of Explore.
const BAR: NavItem[] = [NAV[0], NAV[1], NAV[2], EXPLORE[0]]
const MORE: NavItem[] = EXPLORE.slice(1)
const MORE_ICON = '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
const tip = (n: NavItem) => (n.sub ? n.label + ': ' + n.sub : n.label)

// No boot overlay any more: the shell renders at once. Kept as a no-op for pages that still call onReady.
function bootDone() {}

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
  const [more, setMore] = useState(false)
  const inMore = active !== null && MORE.some(n => n.id === active)

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
      const a = list?.querySelector<HTMLElement>('[aria-current="page"]')
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

  useEffect(() => { setMore(false) }, [active])
  useEffect(() => {
    if (!more) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [more])

  function toggle() {
    const next = !open
    setOpen(next)
    document.documentElement.dataset.nav = next ? 'open' : 'closed'
    try { localStorage.setItem('blink.nav', next ? 'open' : 'closed') } catch { /* private mode */ }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 260)
  }

  return (
    <>
    <nav className="nav" aria-label="Main">
      <div className="nav-head">
        <a className="nav-brand" href="#/" aria-label="SPHEREx Blink home"><Mark /><span>SPHEREx <b>Blink</b></span></a>
        <button className="nav-toggle" onClick={toggle} aria-expanded={open} aria-label={open ? 'Collapse the sidebar' : 'Expand the sidebar'}>
          <Icon d='<path d="m15 6-6 6 6 6"/>' />
        </button>
      </div>
      <ul ref={ul}>
        <span className="nav-ind" ref={ind} aria-hidden />
        {phone ? (
          <>
            {BAR.map(n => (
              <li key={n.id}>
                <a className="item" href={n.href} title={n.label} aria-current={active === n.id ? 'page' : undefined}>
                  <Icon d={n.icon} /><span>{n.tab}</span>
                </a>
              </li>
            ))}
            <li>
              <button type="button" className="item" aria-haspopup="true" aria-expanded={more} aria-current={inMore ? 'page' : undefined} onClick={() => setMore(m => !m)}>
                <Icon d={MORE_ICON} /><span>More</span>
              </button>
            </li>
          </>
        ) : (
          <>
            {NAV.map(n => <NavLink key={n.id} n={n} active={active} />)}
            <li className="nav-group" role="presentation"><span>Explore</span></li>
            {EXPLORE.map(n => <NavLink key={n.id} n={n} active={active} />)}
          </>
        )}
      </ul>
      <div className="nav-foot">
        <p className="made"><img src="/nyscp.svg" alt="" /><span>Made by NYSCP, Manila</span></p>
      </div>
    </nav>
        {phone && more && (
          <>
            <button type="button" className="more-scrim" aria-label="Close the menu" onClick={() => setMore(false)} />
            <div className="more-sheet" role="menu" aria-label="More pages">
              {MORE.map(n => (
                <a key={n.id} role="menuitem" className="more-item" href={n.href} aria-current={active === n.id ? 'page' : undefined}>
                  <Icon d={n.icon} />
                  <span><b>{n.label}</b>{n.sub && <small>{n.sub}</small>}</span>
                </a>
              ))}
            </div>
          </>
        )}
      </>
  )
}

function NavLink({ n, active }: { n: NavItem; active: Key | null }) {
  return (
    <li>
      <a className="item" href={n.href} title={tip(n)} aria-current={active === n.id ? 'page' : undefined}>
        <Icon d={n.icon} /><span>{n.label}</span>
      </a>
    </li>
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


