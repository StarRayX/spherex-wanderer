// The tab bar used across pages (Test stars, Moving objects, Vet a field, Method): one style, one behaviour.
export type TabDef<T extends string> = { id: T; label: string }

export default function PageTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: readonly TabDef<T>[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="t-tabs" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  )
}
