import type { Astrometry, Motion } from './types'

const LY_PER_PC = 3.26156
const MOON_ARCSEC = 1865 // apparent width of the full Moon, about 31 arcminutes

export const fmt = (n: number, digits = 2) => n.toFixed(digits)

export function lightYears(a?: Astrometry) {
  if (!a || !(a.parallax > 0)) return null
  return (1000 / a.parallax) * LY_PER_PC
}

// Total drift from Gaia proper motion, arcsec per year.
export function totalDrift(a?: Astrometry) {
  if (!a) return null
  return Math.hypot(a.pmra, a.pmdec) / 1000
}

// Years to cross one full-Moon width at its current drift: a human-scale way to say how fast.
export function yearsPerMoon(a?: Astrometry) {
  const d = totalDrift(a)
  return d && d > 0.05 ? MOON_ARCSEC / d : null
}

export function axisWords(m: Motion) {
  return m.axis === 'dec' ? 'north to south' : 'east to west'
}

export function raHms(deg: number) {
  const h = deg / 15
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  const ss = ((h - hh) * 60 - mm) * 60
  return `${pad(hh)}h ${pad(mm)}m ${ss.toFixed(1).padStart(4, '0')}s`
}

export function decDms(deg: number) {
  const s = deg < 0 ? '-' : '+'
  const a = Math.abs(deg)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const sec = ((a - d) * 60 - m) * 60
  return `${s}${pad(d)}° ${pad(m)}′ ${sec.toFixed(0).padStart(2, '0')}″`
}

const pad = (n: number) => String(n).padStart(2, '0')

export function monthYear(iso: string) {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
