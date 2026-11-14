import { useEffect, useState } from 'react'

// Hash routes: #/  #/sky  #/target/<slug>[/<tab>]  #/any[?ra=&dec=&size=]  #/method
export interface Route {
  raw: string
  key: string
  slug: string | null
  tab: string | null
  query: URLSearchParams
}

export interface PageProps {
  params: Route
  onReady: () => void
}

export function parse(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent)
  return { raw: h, key: seg[0] || 'home', slug: seg[1] ?? null, tab: seg[2] ?? null, query: new URLSearchParams(qs ?? '') }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const f = () => setRoute(parse())
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return route
}

export const go = (hash: string) => { location.hash = hash }
