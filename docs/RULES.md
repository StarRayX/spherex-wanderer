# RULES: NASA Space Apps Challenge 2026, Manila local event

Read from the official 2026 pages on 2026-11-14: the [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), the [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) and the [Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/).

## Dates
- Hackathon: Nov 14-15, 2026.
- Submission opens Sat Nov 14, 9:00 a.m. and **closes Sun Nov 15, 11:59 p.m., in the time zone of our Local Event (Manila)**. Anything saved or submitted after that is not eligible for judging.
- Teams may edit and resubmit until the deadline. Only the last saved submission is judged.
- The Local Lead may set different times for local judging and awards. The global deadline above is the one that decides eligibility.
- Global Nominees: Dec 3, 2026. Global Finalists and Honorable Mentions: Dec 17, 2026. Global Winners: Jan 26, 2027.
- No project work before the hackathon. Research and planning only.

## Team and eligibility
- 1 to 6 members. All members must be registered for the same Local Event, not waitlisted, and listed on the team's Members tab.
- Must respond to one of the official challenges.
- Every required field on the project page must be filled in, in English.
- Both checkboxes on the project page must be ticked: terms and conditions, and "original work, all external resources listed in References".
- At least one NASA data set or resource is required to be eligible for a Global Award.
- No image, video, audio or likeness of anyone under 18 in the demo or project.
- NASA reviews teams for prohibited bilateral activity with China or Chinese-owned entities.

## Deliverables
- Project name, high-level summary, demo link, final project link, detailed description, NASA data, other data and references, use of Super Intelligence (SI, the 2026 word for AI).
- **Demo:** a video of 30 seconds or less, or at most 7 slides including title and intro. Over the limit means no global judging. Public link, no login, password or registration. Host it on YouTube, Drive, GitHub or similar. The site cannot take video uploads. Video may be in another language only with English subtitles; slides must be English.
- Slides must show team name, member names and the challenge chosen. They should show the project, the user experience, and how NASA data makes it possible.
- The project page accepts JPG, PNG and GIF up to 10 MB. Videos and documents go by link.
- Final project link must also be public with no login. If we host a new site, request a FortiGuard Web Filter Classification (form linked in the Submission Guide; category "web-based application", company "N/A") so judges can open it.
- A strong demo helps the Presentation score, but most of the evaluation is of the project page itself.

## Use of SI (AI)
- Allowed to speed up work. Not to come up with the idea of how to solve the challenge.
- The SI question is for data collection and judges do not see the answer. Judges do see watermarks, descriptive text and metadata.
- Images and video made with SI need a visible watermark. Audio, code and data need acknowledgement in the descriptive text and metadata.
- Generated content must not use or modify NASA logos, flags or mission identifiers.

## Judging
Five criteria, each scored 1 to 5, no published weights, at every level of judging:
1. Impact
2. Creativity
3. Validity (includes completeness and usability)
4. Relevance (NASA data as "a core component", not superficial)
5. Presentation (judges look at the demo and the full project)

Ten global awards. Relevant to us: **Best Use of Data** ("best makes space data accessible or leverages it to a unique application"). Also possible: Best Use of Technology, Best Storytelling, Art & Technology.

## Challenge: Planet X and SPHEREx (Advanced)
- Link: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/
- Must: RA/Dec in, SPHEREx image series out "like a little video".
- Must test on: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis.
- Optional (judges will look for these): easy updates with new releases, per-detector co-adds, spectra on the fly ("extra kudos"), add/subtract epochs, user field of view, Gaia/WISE overlays, coordinates in URL, contamination flags.

## Required data and tools
- NASA/IPAC IRSA SPHEREx archive: TAP `https://irsa.ipac.caltech.edu/TAP`, table `spherex.obscore`; cutouts via `?center=RA,Dec&size=...` on each image URL.
- Resources tab: IRSA SPHEREx page, [tutorial notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/), WiseView (model), Gaia DR3.
- Suggested: Astropy, Aladin Lite (CDS).
