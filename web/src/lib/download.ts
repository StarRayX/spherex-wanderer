// Small helpers shared by the Moving objects and Vet a dot pages.

/** Join URL parts with single slashes. */
export function joinUrl(...parts: string[]) {
  return parts.map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, ''))).filter(Boolean).join('/')
}

/** Fetch JSON. Throws on a bad status or on a body that is not JSON (a dev server answers a missing file with HTML). */
export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  const text = await r.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Not JSON: ${url}`)
  }
}

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return ''
  const s = Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  return [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\n') + '\n'
}

/** Save text as a file from the browser, for views the page filtered itself. */
export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
