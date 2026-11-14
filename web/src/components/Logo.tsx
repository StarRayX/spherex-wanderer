import './Brand.css'

// Wanderer logo: a circle (the object) and two polygons (the dart, its track). Parts carry classes so CSS can
// animate them: .lg-dot, .lg-dart-a, .lg-dart-b. Ink follows currentColor; the circle takes --cyan.
export function Logo({ height = 30, className = '' }: { height?: number; className?: string }) {
  return (
    <svg className={'logo ' + className} viewBox="0 0 196.13 205.93" height={height} width={(height * 196.13) / 205.93} aria-hidden focusable="false">
      <circle className="lg-dot" cx="108.34" cy="25.18" r="25.18" />
      <polygon className="lg-dart-a" points="0 41.57 196.13 79.43 133.16 103.76 164.98 205.93 91.66 108.17 112.95 88.45 0 41.57" />
      <polygon className="lg-dart-b" points="15.39 56.57 96.94 91.65 13.67 168.95 53.02 93.3 15.39 56.57" />
    </svg>
  )
}

// WANDERER, one span per letter so the sidebar can slide them in and out in turn (as LAMBAT's wordmark does).
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={'nav-word ' + className} role="img" aria-label="Wanderer">
      {'WANDERER'.split('').map((c, i) => <span key={i} className="ltr" style={{ ['--i' as string]: i }} aria-hidden>{c}</span>)}
    </span>
  )
}
