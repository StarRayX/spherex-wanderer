// Product mark: a reticle with two offset dots, one star seen on two dates.
export default function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flex: 'none' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 1.5v4.5M12 18v4.5M1.5 12H6M18 12h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.8" cy="13.8" r="1.7" fill="currentColor" opacity=".4" />
      <circle cx="13.6" cy="10" r="2.2" fill="var(--cyan)" />
    </svg>
  )
}
