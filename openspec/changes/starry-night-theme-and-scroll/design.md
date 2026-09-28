## Context

The site (`web/`, Vite, React 19, Tailwind 4, static) has a pit-wall visual system: warm near-black tokens in `src/index.css`, poster art in `src/components/art/` (a road ribbon with generic cars, circuit outlines from bacinger/f1-circuits, speed bursts, start lights), four pages (front page, season, backtests, method) plus race pages, Lenis smooth scrolling, and instant scroll-to-top on navigation. The front page hero is a rounded card inside a max-width column, which reads as a tablet framed in the browser.

The new direction comes from the author's moodboard: a Starry Night style painting of a single-seater riding a swirl of blue and yellow impasto. The painting itself and the car's team livery are someone else's work and cannot be used. Only the idea is taken: a flow-field sky, thick directional strokes, cobalt and chrome yellow, and a small car riding the vortex.

Hard constraints stay: no series names or marks, no liveries or logos, WCAG 2.2 AA, 360px with no horizontal scroll, no em or en dashes, static site, honesty labels visible.

## Goals / Non-Goals

**Goals:**
- One coherent night palette across every page, with contrast measured rather than eyeballed.
- Original generative paintings that look hand-made, cost one paint per size, and never carry meaning on their own.
- A front page that fills the screen and moves with the reader: the hero closes into a card, a storm band scrubs with scroll, and sections arrive rather than just appear.
- Chaos made visible: a painting per chaos level, Jev's call beside the actual level.

**Non-Goals:**
- No images, photos, or AI-generated bitmaps; no reproduction of the reference painting.
- No WebGL. Canvas 2D is enough and far simpler.
- No scroll-jacking: native scroll speed and direction are never overridden, and Lenis stays the only smoothing.
- No change to data, scoring, routes, or page structure beyond the front page hero and storm band.

## Decisions

### 1. The palette, as tokens

The tokens keep their roles so components change little; the values change.

| Token | Role | Value | Checked |
| --- | --- | --- | --- |
| `ink` | page, night sky base | `#070d1c` | |
| `panel` | cards | `#0e1830` | |
| `raised` | hover, bar tracks | `#16233f` | |
| `line` | 1px rules | `#26355a` | decorative |
| `text` | primary | `#f2ecdc` | 16.4 : 1 on ink, 13.2 on raised |
| `muted` | secondary | `#a9b4c8` | 9.3 on ink, 7.5 on raised |
| `star` (was `signal`) | the one hot accent | `#f5c542` | 12.0 on ink; ink on star 12.0 |
| `cobalt`, `cerulean` | art and fills | `#1f4fa3`, `#6fb6ee` | cerulean as text 7.1+ |
| `paper`, `print`, `print-muted` | printed sheets | `#efe6cf`, `#141a2b`, `#4c5568` | 13.9 and 6.0 |
| `sector-purple`, `sector-green` | best, on time | `#c3a6ff`, `#4fd98f` | 7.6+ on raised |
| `sector-amber` (was yellow) | late, provisional, miss | `#ff9f43` | 7.6+ on raised |
| `flag-red` | failed, inconsistent | `#ff6b5e` | 5.6+ on raised |

Why amber for late and miss: the chrome yellow is now the light of the whole site, so a yellow state colour would read as decoration. Amber is warm enough to still mean caution.

Alternative considered: keep the warm palette and add a blue painting on top. Rejected, because two palettes side by side read as two sites.

The oxblood token is dropped as a surface colour. Stamps on paper use cobalt (and `flag-red` for failures on dark surfaces), so the printed record stays in the night palette.

### 2. Painted strokes on canvas, generated

A `Painting` component draws on a `<canvas>`:
- A flow field made of one or more vortex centres (a swirl at each centre plus a gentle global drift), perturbed by smooth noise.
- Several thousand short strokes. Each starts at a jittered grid point, follows the field for a few steps, and is drawn as a tapered, round-capped path. The colour comes from a palette ramp by distance to the nearest vortex (light at the eye, cobalt at the edge), with slight per-stroke lightness jitter. Two or three passes run coarse to fine, so thick strokes sit under thin ones like impasto.
- The seed is deterministic per use (for example the race round), so a painting is the same on every visit.

It paints once on mount and again only on a debounced resize, and it sizes to the device pixel ratio, capped at 2. Life comes from CSS: the canvas layer rotates or drifts a few degrees over tens of seconds, which is a composited transform with no repaint.

Alternatives considered: SVG `feTurbulence` looks like marble, not brushwork; WebGL shaders look better animated but add complexity and a GPU dependency for a decorative layer; pre-rendered images would be static files, but they break "no images" and are heavier than the code.

Accessibility: every canvas is `aria-hidden`, with its meaning in nearby text. Text never sits directly on a painting: a scrim or panel behind the text keeps the contrast from Decision 1.

### 3. The hero closes into a card on scroll

Structure: an outer section about 170svh tall, holding a sticky, full-viewport stage. The stage holds the painted sky, the road ribbon, the headline, and the next-race card.

The scroll progress through the outer section drives:
- the frame: `clip-path: inset(p * 3vh p * 3vw round p * 28px)`, from full-bleed to a rounded card;
- the scale: about 1 to 0.94;
- the headline: it lifts and loses a little opacity;
- the next-race card: it moves faster than the stage (parallax), so it lands as its own card.

It is driven by CSS scroll-driven animations (`animation-timeline: view()` or a named `scroll-timeline` on the section), wrapped in `@supports (animation-timeline: view())`. There is no per-frame JS; Lenis smooths the scroll and the timeline follows. Where the feature is missing (Firefox without the flag), the hero is simply full-bleed and static. Under `prefers-reduced-motion`, the stage is not sticky and nothing animates.

Alternative considered: a JS progress variable from Lenis's scroll event. It works everywhere, but it runs code every frame and duplicates what the platform now does. It stays the fallback if scroll timelines misbehave with Lenis in testing.

At 360px the stage stays full-bleed, but the next-race card follows the headline rather than overlapping it, and the shrink is gentler (smaller inset), so text never crowds.

### 4. The storm band

This is a second sticky section of about 200svh. Its stage shows one large vortex painting and a generic car (the existing `Car` art) placed on a spiral path with CSS `offset-path`. Its `offset-distance` is scrubbed by the section's view timeline from the outer arm to the eye, and the car shrinks slightly as it spirals in. One line of type sits on a scrim: the site's promise, such as "Every call, through every storm." The static fallback parks the car on the outer arm.

### 5. Scroll-linked entrances

Circuit tiles draw their outlines as they enter the viewport: the existing draw-in keyframes run on a view timeline with an entry range. The page doors rise and fade in on the same kind of timeline. Both fall back to the current on-load behaviour.

### 6. Chaos paintings

The same `Painting` renderer takes a `turbulence` value from 0 to 4:
- 0: long, near-parallel strokes and a single slow drift;
- 2: eddies appear;
- 4: several tight vortices with short, broken strokes.

Before the race, the chaos card shows Jev's call as a painting. After the race, a pair is shown side by side, labelled in text: "Jev's call: 0.92, calm to lively" and "Actual: 4, bedlam, red flag on lap 12". Values between levels interpolate, so 0.92 paints a little turbulence. The pair sits behind the spoiler guard like every other call.

### 7. The road ribbon and other art under the sky

The ribbon's asphalt becomes a dark blue-grey, with kerbs in canvas white and a muted red. The cars' bodies become canvas white, star yellow, and cerulean: generic colours, never team liveries. Circuit outlines, start lights, and stamps take the new tokens; the start lights stay red, because lights are lights.

### 8. As built

Decisions settled during implementation and review:
- **The hero is sticky only on wide, tall screens** (at least 1024px wide and 700px tall), where the headline and the next-race card fit one screen. On phones and short screens it is a full-bleed section that rounds off into a card as it scrolls away.
- **The storm band is sticky only at 600px tall and up.** Below that, the stage grows to fit its text, so nothing is clipped at 400% zoom (WCAG 1.4.10).
- **The car shrinks about its own centre.** The car rides the path on one group and shrinks on a second group with `transform-box: fill-box`. Scaling the path group itself moves the car toward the drawing's origin.
- **One scrim constant.** `TEXT_SCRIM` (0.82, in `painting/scrim.ts`) drives the hero scrims, and `palette.test.ts` checks every text colour over it on the brightest paint colour. The lowest alpha that passes is 0.75.
- **The renderer paints offscreen and swaps the result in**, so a repaint never flashes. It repaints on a change of pixel density, and it broadens strokes when the stroke cap thins them on very large screens.
- **Scroll timelines follow Lenis frame by frame.** Measured: a 456px eased scroll moved the frame inset smoothly across 109 frames. The JS progress fallback from Decision 3 was not needed.

### 9. Follow-ups after the first review with the author

- **The storm car is swallowed by the eye.** In the last 18% of the band it shrinks to 8% and fades out.
- **A chequered backdrop, fixed behind every page.** It is a tonal flag (night blue on night blue) rippled by a displacement map, with fold shading that only darkens, a capped metallic sheen, and a faint cerulean glow. The tones live in `art/backdropTones.ts`, and a test checks that the backdrop's brightest possible point is no lighter than `raised`, so no text loses contrast. An earlier attempt with light squares and warm glows was rejected because it did.
- **The doors are complementary.** Season is night blue, Backtests is canvas, and Method is chrome gold with ink text (12:1). Blue against gold is the painting's own complementary pair.
- **Every start gantry runs a real start.** Lights come on one a second, hold for a random 0.2 to 3 seconds, then all go out together, looping only while the gantry is on screen. The spoiler guard idles on the same loop and runs a quick version once you ask. All five are lit and still under reduced motion.

## Risks / Trade-offs

- [Canvas paint time on low-end phones] → Stroke count scales with area and is capped; paint work is split across idle frames (`requestIdleCallback`, with `setTimeout` as the fallback); the first paint is a cheap gradient, so layout never waits.
- [Scroll-driven animations interacting with Lenis] → Verified smooth (Decision 8). The JS progress fallback stays documented if a browser regresses.
- [`clip-path` and `offset-distance` animate on the main thread] → They held 120fps in headless Chromium, but CPU throttling did not take effect there, so low-end phones are unmeasured. Check on a real low-end Android. If the hero stutters, animate `transform` on a rounded mask wrapper instead of `clip-path`.
- [Sticky tall sections feel like scroll-jacking] → Keep the hero at about 170svh and the storm band at about 200svh; native scroll speed is untouched; both collapse to normal flow under reduced motion.
- [Text contrast over paintings] → Text always sits on a scrim or panel; contrast is measured against the scrim colour, never the painting.
- [The yellow accent and the amber state colour confused] → Every state still carries its word ("Late", "Miss"); amber is noticeably warmer; check them side by side on the season list.
- [Team colours on the new bar track] → The team fills are rechecked against `raised`, and any below 3:1 is adjusted for non-text contrast.
- [Visual regression across every page] → Screenshots of every preview state at 1440px and 360px before and after, plus the 360px no-horizontal-scroll check on every route.

## Migration Plan

The site is static and deploys on push. The change ships as one commit, or a short series (tokens, then art, then scroll) that each build green. Rollback is a revert. No data changes.

## Open Questions

- The line of type in the storm band: the promise wording is the author's call.
- Whether night races (Singapore, Las Vegas, Qatar, Abu Dhabi) get a denser sky on their race hero. It is a cheap variation of Decision 2, but optional.
