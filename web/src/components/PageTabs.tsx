// The tab bar used across pages (Test stars, Moving objects, Vet a field, Method): one style, one behaviour.
// `short`: an optional shorter label for phones, so every tab fits on one line.
export type TabDef<T extends string> = { id: T; label: string; short?: string }

export default function PageTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: readonly TabDef<T>[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="t-tabs" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.short ? <><span className="tab-long">{t.label}</span><span className="tab-short" aria-hidden>{t.short}</span></> : t.label}
        </button>
      ))}
    </div>
  )
}
