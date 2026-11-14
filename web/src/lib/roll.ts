import { useEffect, useRef } from 'react'

// Rolling numbers, after LAMBAT's home page. The real value always stays readable: the animated copy is
// aria-hidden and is reset to the final value if the animation is cut short.
export function useRoll<T extends HTMLElement>(deps: unknown[]) {
  const root = useRef<T>(null)
  useEffect(() => {
    const el = root.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const nodes = [...el.querySelectorAll<HTMLElement>('[data-to]')]
    const timers: number[] = []
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return
      io.unobserve(e.target)
      const n = e.target as HTMLElement
      const to = Number(n.dataset.to), digits = Number(n.dataset.digits ?? 0), t0 = performance.now()
      const final = n.dataset.final ?? String(to)
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 800)
        n.textContent = k >= 1 ? final : (to * (1 - (1 - k) ** 3)).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
        if (k < 1 && n.isConnected) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      timers.push(window.setTimeout(() => { n.textContent = final }, 1200))
    }), { threshold: 0.6 })
    nodes.forEach(n => io.observe(n))
    return () => { io.disconnect(); timers.forEach(clearTimeout); nodes.forEach(n => { n.textContent = n.dataset.final ?? n.textContent }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return root
}
