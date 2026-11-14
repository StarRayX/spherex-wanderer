# RULES: NASA Space Apps Challenge 2026, Manila local event

Read 2026-11-07. The 2026 Project Submission guide and Judging & Awards guide publish Nov 13. Recheck everything marked 2025 then.

## Dates
- Hackathon: Nov 14-15, 2026 (OPENED, participant FAQ). Submission deadline is set by the Manila local event. Confirm the exact hour in Manila time. [unconfirmed]
- Teams may not start work before the hackathon (OPENED per subagent, FAQ). Research and planning only until Nov 14. No project code before then.
- Challenge resources: Nov 13.
- Results: nominees, finalists, honorable mentions in Dec 2026; global winners in Jan 2027.

## Team
- 1 to 6 members. Submit through the team's project page.

## Deliverables (2025 guide, proxy until Nov 13)
- Project name, high-level summary, demo link, final project link, detailed description, NASA data used, other data, use of AI ("SI" in 2026 wording).
- Demo: a 30-second video OR at most 7 slides including the title. Over the limit means no global judging. Public link, no login. Video needs English subtitles.
- AI-generated images and video need a visible watermark. No NASA branding in generated content. 2026 FAQ: describe how SI tools were used.

## Judging (2025 guide)
Five criteria, each 1 to 5, no published weights:
1. Impact
2. Creativity
3. Validity (includes completeness and usability)
4. Relevance (NASA data as "a core component", not superficial)
5. Presentation

Relevant global award: Best Use of Data.

## Challenge: Planet X and SPHEREx (Advanced)
- Link: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/
- Must: RA/Dec in, SPHEREx image series out "like a little video".
- Must test on: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis.
- Optional (judges will look for these): easy updates with new releases, per-detector co-adds, spectra on the fly ("extra kudos"), add/subtract epochs, user field of view, Gaia/WISE overlays, coordinates in URL, contamination flags.

## Required data and tools
- NASA/IPAC IRSA SPHEREx archive: TAP `https://irsa.ipac.caltech.edu/TAP`, table `spherex.obscore`; cutouts via `?center=RA,Dec&size=...` on each image URL.
- Suggested: Astropy, Aladin Lite (CDS).
