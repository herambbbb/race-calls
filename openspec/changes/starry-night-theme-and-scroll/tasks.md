## 1. Night palette

- [x] 1.1 Replace the design tokens in `web/src/index.css` with the night palette (ink, panel, raised, line, text, muted, star, cobalt, cerulean, paper, print, print-muted, sector purple, green, amber, flag red, link); rename `signal` to `star` and `sector-yellow` to `sector-amber`; drop oxblood as a surface
- [x] 1.2 Update every component and page that uses a renamed or removed token (stamps move to cobalt on paper and flag red on dark; halftone, glass, hatch, and paper utilities take the new colours)
- [x] 1.3 Recheck the team fills in `data/teams.ts` against the new bar track (`raised`), and adjust any below 3:1
- [x] 1.4 Add a contrast test that computes every text and state token on every surface, and every team fill on the bar track, and fails below AA
- [x] 1.5 Restyle the road ribbon (blue-grey asphalt, canvas and muted red kerbs, cars in canvas white, star yellow, and cerulean), circuit outlines, start lights, and the poster footer for the new palette

## 2. Painting renderer

- [x] 2.1 Build the flow field: vortex centres with swirl, a global drift, and smooth noise, from a seeded random source so output is deterministic
- [x] 2.2 Build the `Painting` canvas component: coarse-to-fine passes of tapered strokes coloured by distance to the vortices, sized to the device pixel ratio (capped at 2), painted once per size, repainted only after a debounced resize, and split across idle frames with a cheap gradient first
- [x] 2.3 Add slow drift and rotation of the painted layer by CSS transform, stopped under reduced motion; mark every canvas `aria-hidden`
- [x] 2.4 Unit-test the field and the seeded random source (same seed gives the same strokes; turbulence changes the vortex count and stroke length)

## 3. Front page hero

- [x] 3.1 Make the hero full-bleed and full height: a painted sky behind the road ribbon, the headline on a scrim, and the next-race card
- [x] 3.2 Add the scroll-driven close-in (clip-path inset and radius, slight scale, headline lift, next-race card parallax) on a view timeline, inside `@supports (animation-timeline: view())`
- [x] 3.3 Fallbacks: static full-bleed without scroll timelines or under reduced motion; at 360px, the card follows the headline and the inset is gentler
- [x] 3.4 Verify with Lenis that the timeline tracks smoothly; if it stutters, switch this section to a JS progress variable from Lenis's scroll event

## 4. Storm band

- [x] 4.1 Add the sticky storm band after the hero: a full-screen vortex painting, one line of type on a scrim, and the generic car on a spiral `offset-path`
- [x] 4.2 Scrub the car's `offset-distance` (and a slight shrink) with the band's view timeline, both directions; park the car on the outer arm in the fallback

## 5. Scroll-linked entrances

- [x] 5.1 Draw the circuit outlines in as their tiles enter the viewport, on an entry-range view timeline
- [x] 5.2 Rise the page doors into place as they enter; fall back to showing both without animation

## 6. Chaos paintings

- [x] 6.1 Map a chaos value (0 to 4, interpolated) to painting parameters: vortex count, swirl strength, and stroke length
- [x] 6.2 Show Jev's chaos painting in the race page chaos section, labelled in text with the score and nearest levels, behind the spoiler guard
- [x] 6.3 After the race, show Jev's painting and the actual level's painting side by side, each labelled with value, level word, and (for the actual level) the reason
- [x] 6.4 Rendering tests: the text labels for called and actual, nothing shown before the reveal, and the paintings `aria-hidden`

## 7. Verification

- [x] 7.1 Screenshots of every preview state and page at 1440px and 360px; check the paintings, scrims, and the hero close-in visually
- [x] 7.2 Run the 360px no-horizontal-scroll check on every route and preview state, with and without reduced motion
- [x] 7.3 Typecheck, lint, tests, and production build green; no secrets in the build; no em or en dashes; no series names in UI text
- [x] 7.4 Independent review pass (correctness, accessibility, performance of the canvas and scroll timelines)

## 8. Follow-ups

- [x] 8.1 Fade the storm car out as it reaches the eye
- [x] 8.2 Tonal chequered backdrop behind every page, with a test that its brightest point stays at or below `raised`
- [x] 8.3 Complementary doors: night blue, canvas, and chrome gold
- [x] 8.4 Every start gantry runs a real start sequence on a loop, visible-only, static under reduced motion
