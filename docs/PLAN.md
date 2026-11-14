# PLAN (planning gate, answered Sat Nov 14, 16:30 Manila)

## Deadline
- **Sun Nov 15, 23:59 Manila**, confirmed in the official 2026 Project Submission Guide (11:59 p.m. in the Local Event's time zone). Anything saved or submitted after it is ineligible.
- About 31.5 hours from the planning gate.
- Ask the Local Lead whether local judging has an earlier cutoff. That does not change the global deadline.

## Freeze times (Manila)
| Time | Milestone |
|---|---|
| Sun 05:00 | Core working: Barnard's Star showcase end to end, deployed |
| Sun 13:00 | Feature freeze: features 1 to 5 of the tech plan |
| Sun 19:15 | Product, brand, all states, phone layout done |
| Sun 21:30 | Submission package locked (README, demo, project text, AI-use note) |
| Sun 23:30 | Repo frozen. No commits after the deadline |

## Demo moment
Split screen of Barnard's Star. The left side is a plain SPHEREx flipbook that flickers. The right side is ours: steady, with the star sliding along its path, and a measured motion next to Gaia's value.

## Look
- Direction: **Observatory instrument**. Full rules in `BRAND.md`.
- The product gets its own brand. NYSCP appears only as a small "made by" credit.

## Team
- **Samantha (snrbracamonte):** leads development and chooses her own work and approach. Nothing is assigned to her.
- **Clarence:** supports wherever Samantha wants help.
- **Claude:** works only on what the team asks for. Checks the repo and branches first, so it never overwrites Samantha's work.
- **Human-only:** voiceover and recording, the final form submit, connecting a Vercel account.

## Standing permissions for Claude (defaults, edit if wrong)
**Allowed without asking:**
- project-local installs
- creating files in the project
- commits and pushes to its own branches on StarRayX/spherex-blink
- Sonnet verification agents
- local servers and screenshots

**Always asks first:**
- pushing to `main`
- global installs
- downloads over 100 MB
- making the repo public
- deploys
- sending any message
- spending money or credits

**Never done by Claude:**
- creating accounts or entering passwords
- the final Space Apps submit

**Commits** carry no `Co-Authored-By: Claude` line.

## Early checks
- Everyone on the team is registered for the same Manila Local Event, not waitlisted, and listed on the team's Members tab. Otherwise the project is not eligible for global judging.
- Request a FortiGuard Web Filter Classification for the hosted site once it has a URL (see `RULES.md`), so judges can open it.
- Demo and project link must be public with no login. Test both in a private window.
- No one under 18 in the demo or project.
