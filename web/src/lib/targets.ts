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
  { slug: 'proxima-centauri', name: 'Proxima Centauri', status: 'images',
    hook: 'The closest star to the Sun, 4.2 light years away.' },
  { slug: 'kapteyns-star', name: "Kapteyn's Star", status: 'measured',
    hook: "Of all the stars Gaia has measured, only Barnard's Star crosses our sky faster." },
  { slug: 'groombridge-1830', name: 'Groombridge 1830', status: 'measured',
    hook: "The third-fastest star across our sky in Gaia's catalogue, about 30 light years away." },
  { slug: '61-cygni-a', name: '61 Cygni A', status: 'measured',
    hook: 'One of a pair of stars 11.4 light years away, with its partner 61 Cygni B the second bright dot beside it.' },
  { slug: 'lacaille-9352', name: 'Lacaille 9352', status: 'measured',
    hook: "A star 10.7 light years away, the fourth-fastest across our sky in Gaia's catalogue." },
  { slug: 'wolf-359', name: 'Wolf 359', status: 'measured',
    hook: 'A star 7.9 light years away, too faint to see without a telescope.' },
  { slug: 'luhman-16', name: 'Luhman 16', status: 'images',
    hook: 'The third-closest system to the Sun: a pair of brown dwarfs 6.5 light years away.' },
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
