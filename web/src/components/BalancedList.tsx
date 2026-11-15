import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// A list shown in two equal columns on wide screens, split where the two columns come out closest in height.
// Items keep their order: the left column reads first, then the right. CSS columns cannot do this because a
// long item that must not break across columns leaves one side much taller. On narrow screens the two halves
// simply stack, so the split does not matter there.
// A first item far longer than the rest would leave one column much taller whatever the split, so it is shown
// full width above the two columns ("lead"), and the rest are balanced below it.
const len = (x: ReactNode) => (typeof x === 'string' ? x.length : 0)

export default function BalancedList({ items: all, className = 'notes-list' }: { items: ReactNode[]; className?: string }) {
  const rest = all.slice(1).map(len).sort((a, b) => a - b)
  const median = rest.length ? rest[Math.floor(rest.length / 2)] : 0
  const hasLead = false // plain two columns (kept switchable: all.length >= 4 && len(all[0]) > 2.5 * median)
  void median
  const lead = hasLead ? all[0] : null
  const items = hasLead ? all.slice(1) : all
  const box = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(Math.ceil(items.length / 2))

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const lists = el.querySelectorAll(':scope > ul')
      if (lists.length < 2) return
      const a = lists[0].getBoundingClientRect(), b = lists[1].getBoundingClientRect()
      if (b.top >= a.bottom - 1) return // stacked (narrow screen): nothing to balance
      // Both columns have the same width, so each item's height is the same in either column.
      const lis = [...el.querySelectorAll(':scope > ul > li')] as HTMLElement[]
      const gap = parseFloat(getComputedStyle(lists[0]).rowGap || '0') || 0
      const h = lis.map(li => li.getBoundingClientRect().height + gap)
      const total = h.reduce((s, x) => s + x, 0)
      let best = split, bestDiff = Infinity, left = 0
      for (let k = 1; k < h.length; k++) {
        left += h[k - 1]
        const d = Math.abs(left - (total - left))
        if (d < bestDiff) { bestDiff = d; best = k }
      }
      if (best !== split) setSplit(best)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items.length, split])

  return (
    <>
    {lead !== null && <ul className={className + ' bal-lead'}><li>{lead}</li></ul>}
    <div className="bal-cols" ref={box}>
      <ul className={className}>{items.slice(0, split).map((x, i) => <li key={i}>{x}</li>)}</ul>
      <ul className={className}>{items.slice(split).map((x, i) => <li key={split + i}>{x}</li>)}</ul>
    </div>
    </>
  )
}
