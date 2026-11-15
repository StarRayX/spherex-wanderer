import type { ReactNode } from 'react'

// One page of a long table at a time: "11–20 of 145" with Previous and Next. Used by the change list and the
// measurements table so both page the same way. `extra` sits between the count and the buttons.
export default function Pager({ page, size, total, onPage, extra }: {
  page: number
  size: number
  total: number
  onPage: (page: number) => void
  extra?: ReactNode
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  const from = total ? page * size + 1 : 0
  const to = Math.min(total, (page + 1) * size)
  return (
    <div className="pager">
      <span className="muted sm" aria-live="polite">{from}–{to} of {total}</span>
      {extra}
      {pages > 1 && (
        <div className="pager-btns" role="group" aria-label="Pages">
          <button type="button" className="btn sm quiet" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
          <button type="button" className="btn sm quiet" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}
