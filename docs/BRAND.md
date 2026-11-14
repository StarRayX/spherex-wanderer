# BRAND: Observatory instrument

Chosen by the team on Nov 14. The product should look like real mission software: precise, calm and dark, with one accent colour. This is a starting system. Samantha may refine it.

## Tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0F14` | page background (slate) |
| `--panel` | `#111821` | panels, cards |
| `--rule` | `#1F2A36` | thin rules, grid lines, borders |
| `--ink` | `#D8E1EA` | main text |
| `--ink-dim` | `#7D8B99` | labels, secondary text |
| `--accent` | `#3EE6FF` | the one accent: active state, star trail, key numbers |
| `--warn` | `#FFB547` | data warnings only (flags, IRSA busy) |

Rule: cyan is the only accent. Warning amber appears only for data problems, never as decoration.

## Type
- UI and headings: **IBM Plex Sans**, self-hosted.
- Every number, coordinate and date: **IBM Plex Mono**, with tabular figures.
- Labels: small caps or uppercase Plex Mono at 11 to 12 px, letter-spaced. Use plenty of them; they carry the instrument feel.

## Visual language
- Thin 1 px rules and a faint grid. No drop shadows, gradients or glassmorphism.
- The viewer is framed by crosshair ticks at the corners and edge tick marks every N arcsec.
- Readouts sit in boxed panels: `RA`, `DEC`, `VISIT`, `λ`, `MOTION`.
- Coordinates in a corner update live as the cursor moves.
- Motion is small and functional: crossfades between visits, values counting up once. Nothing bounces.

## Hard bans
- Framework default styles shipped as-is.
- More than one accent colour.
- NASA logos or insignia anywhere (Space Apps rule for generated content, and not our brand).
- Jargon in user-facing copy where `IDEA.md` lists a plain replacement.

## Credit
A small "Made by NYSCP" in the footer, using the team logo in `branding/`.
