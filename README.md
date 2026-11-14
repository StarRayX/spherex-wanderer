# SPHEREx Blink

A public web tool for NASA Space Apps 2026, challenge [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/).

Type a star's name or sky coordinates and watch NASA SPHEREx images of that spot play like a short animation, one frame per visit. The tool marks where the Gaia catalogue says the star should be on each date, draws its path, and reports how far it moved.

Status: in development during the hackathon (Nov 14-15, 2026). The pipeline (query, wavelength picker, fetch, stack, measure, photometry, JPL lookup, name resolver) and a live `/api/blink` function exist, and the five test targets are built. Barnard's Star drift: Dec 10.55 +/- 0.71 arcsec/yr vs Gaia 10.36. WISE 0855 is a candidate only, and R Draconis is too bright for SPHEREx to measure. The web app is still being built.

## Docs
- [Tech plan](docs/TECH_PLAN.md): architecture, data, features, timeline, team split
- [Idea](docs/IDEA.md): what we build and why
- [API](docs/API.md): the live `/api/blink` endpoint
- [Rules](docs/RULES.md): challenge requirements and judging
- [Evidence notes](docs/evidence_notes.md): every fact we rely on, with its source
- [Plan](docs/PLAN.md): deadline, freeze times, team, permissions
- [Brand](docs/BRAND.md): Observatory instrument look, tokens, type, bans

## Team
NYSCP, Manila local event.
