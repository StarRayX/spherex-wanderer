// Wavelength colour ramp, used only for data: a colour from here always means a wavelength.
// Six stops over SPHEREx's 0.75 to 5 micron range, spaced on a log scale so short wavelengths are not crowded.
// Keep cyan (--cyan) for links, buttons and focus; never use this ramp for categories.
export const WL_STOPS = ['#6D7CFF', '#3FB8F0', '#4FD8A4', '#E8D25A', '#FF9A4A', '#E5483F']
const MIN = 0.75, MAX = 5

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

export function wlColor(um: number): string {
  const t = Math.min(1, Math.max(0, Math.log(um / MIN) / Math.log(MAX / MIN)))
  const x = t * (WL_STOPS.length - 1)
  const i = Math.min(WL_STOPS.length - 2, Math.floor(x))
  const f = x - i
  const a = hex(WL_STOPS[i]), b = hex(WL_STOPS[i + 1])
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
