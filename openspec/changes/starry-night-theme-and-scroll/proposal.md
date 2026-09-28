## Why

The site's pit-wall look is solid but reads as a tablet on a page: the front page hero is an inset rounded card floating in black, and nothing moves with the reader. The author's moodboard now points to a painterly, Starry Night style sky with a car riding the swirl, which suits a site about calls made under uncertainty. The chaos rating is also the one call with no visual of its own, and a painting whose turbulence follows the chaos level would show "Jev called calm, the race was bedlam" at a glance.

## What Changes

- **BREAKING (visual)**: the site palette changes from warm near-black with orange and oxblood to a Van Gogh inspired night palette: deep night blue surfaces, chrome yellow light, cobalt and cerulean accents, and a warm canvas paper for the printed scorecard and backtests. Sector colours (purple best, green on time, amber late or miss) stay, rechecked for WCAG 2.2 AA; the late and miss yellow moves to amber so it never reads as the star yellow.
- A generative painted-brushstroke art system: original strokes following a vortex flow field, drawn on a canvas, with no images and no copied artwork. It paints once per size and gets its life from slow layer motion.
- The front page hero becomes full-bleed and full height, and closes into a rounded card as the reader scrolls. The road ribbon and its cars sit under the painted sky.
- A new scroll-scrubbed "storm" band on the front page: the vortex fills the screen and a generic car travels the spiral as the reader scrolls.
- Scroll-linked entrances: circuit outlines draw in as their tiles arrive, and the page doors rise into place.
- The race page chaos section gets paintings driven by the chaos level: Jev's call, and after the race the actual level beside it.
- Every piece of motion falls back to a static layout under reduced motion and in browsers without scroll-driven animations.

## Capabilities

### New Capabilities
- `site-theme`: the night palette as design tokens, the contrast guarantees for every text and state colour, and the rule that art never carries meaning on its own.
- `painted-art`: the generative brushstroke paintings (sky, vortex, chaos levels), how they render, animate, and stay decorative and accessible.
- `landing-scroll`: the full-bleed hero that closes into a card, the storm band, and scroll-linked entrances, with their reduced-motion and unsupported-browser fallbacks.
- `chaos-painting`: the race page's chaos paintings for Jev's call and the actual level.

### Modified Capabilities
<!-- None in openspec/specs yet. The "near-black" wording in the Presentation requirement of the unarchived change add-race-weekend-predictions (specs/predictions-site) is superseded by site-theme; the other parts of that requirement (360px, AA contrast, no series marks) are unchanged. -->

## Impact

- `web/src/index.css`: design tokens, utilities, and keyframes.
- New art components under `web/src/components/art/` (painting renderer, storm band); restyled `TrackRibbon`, `TrackOutline`, `StartLights`, `Stamp`, and the paper surfaces.
- `web/src/pages/Landing.tsx` (hero, storm band, entrances), `web/src/components/race/Chaos.tsx` and `Headline.tsx` (chaos paintings), and every page that uses the old colour names.
- No new runtime dependency: canvas and CSS scroll-driven animations are built in; Lenis is already installed.
- Tests: contrast checks on the new tokens, and rendering tests for the chaos paintings' text alternatives.
- The unarchived change `add-race-weekend-predictions` keeps its requirements; only its "near-black" palette wording is superseded.
