import type { Meta } from './types'

export type Status = 'measured' | 'candidate' | 'images' | 'brightness'

export interface TargetInfo {
  slug: string
  name: string
  // One plain sentence a non-astronomer can read. Facts come from meta.json and docs/evidence_notes.md.
  hook: string
  status: Status
}

// Order matters: the hero opens on the first one.
export const TARGETS: TargetInfo[] = [
  { slug: 'barnards-star', name: "Barnard's Star", status: 'measured',
    hook: 'The fastest-moving star in our sky, about 6 light years away.' },
  { slug: 'epsilon-indi-b', name: 'Epsilon Indi B', status: 'measured',
    hook: 'A pair of brown dwarfs: objects too small to shine like stars.' },
  { slug: 'wise-0855', name: 'WISE 0855', status: 'candidate',
    hook: 'One of the coldest known brown dwarfs. Barely there, even in infrared.' },
  { slug: 'rw-aurigae', name: 'RW Aurigae', status: 'brightness',
    hook: 'A young star still pulling in gas, with big swings in brightness.' },
  { slug: 'r-draconis', name: 'R Draconis', status: 'images',
    hook: 'A giant pulsing star, so bright it overloads SPHEREx.' },
]

export const STATUS_LABEL: Record<Status, string> = {
  measured: 'Drift measured',
  candidate: 'Candidate only',
  brightness: 'Brightness change',
  images: 'Images only',
}

const cache = new Map<string, Promise<Meta>>()

export function loadMeta(slug: string): Promise<Meta> {
  let p = cache.get(slug)
  if (!p) {
    p = fetch(`/showcase/${slug}/meta.json`).then(r => {
      if (!r.ok) throw new Error(`Could not load ${slug} (${r.status})`)
      return r.json() as Promise<Meta>
    })
    cache.set(slug, p)
  }
  return p
}

export function imageUrl(slug: string, file: string) {
  return `/showcase/${slug}/${file}`
}
