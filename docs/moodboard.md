# Race Calls moodboard

Where the look comes from, and what was taken from each. Links only: the pins are other
people's work and are never copied into the site. Everything on the site is original SVG
or type, with no photos, logos, liveries, or series marks.

## Sources

- Componine (componine.com): warm near-black, film grain, faint column rules, framed
  "exhibit" panels, a glass pill navigation, a status pill with a glowing dot.
- useLayouts and Spectrum UI: mono labels ("ROUND 16 // 2026"), window cards with a title
  bar, motion only where it means something.
- Pinterest, "f1 moodboard edit" and the Hamilton poster pin: halftone dots, greige poster
  paper with oxblood, starbursts, stacked repeated type fading to an outline, an italic
  serif letter dropped into heavy sans, stamps and stickers.
- Pinterest, "f1 poster graphic design": the Daytona poster (a thick road sweeping across
  the page with cars riding it), side and top views of the car with huge type behind,
  "we race as one" colour streaks trailing the cars.
- Pinterest, "vintage grand prix poster illustration": "In Monaco, always go for the gap"
  (asphalt with red and white kerbs, top-down cars on the line), the Suzuka radial speed
  burst, the Monaco '75 arch-framed poster.
- The 2026 circuit sheet (reference image from the brief's author): every round as a
  plain outline, which the backtests and the season grid now follow.

## What that became

| Motif | Where |
| --- | --- |
| Asphalt ribbon with kerbs, cars driving it, speed streaks | Front page hero (`TrackRibbon`) |
| Top-down generic single-seater | Doors, season and method headers (`Car`) |
| Radial speed burst | Season door and header (`SpeedBurst`) |
| Arch-framed posters | The three doors on the front page |
| Real circuit outlines, drawn in, a dot lapping | Race hero, next-race card, circuits grid, backtests, race list (`TrackOutline`, data from bacinger/f1-circuits, MIT) |
| Five start lights | The spoiler guard, method door |
| Stamps on paper | Honesty labels and the scorecard |
| Halftone, grain, column rules, starburst | Hero and header backgrounds |

## Rules kept

No series name or marks, no team logos or driver photos, team colours only as swatches and
bars, and every decorative piece is `aria-hidden` with its meaning said in text nearby.
