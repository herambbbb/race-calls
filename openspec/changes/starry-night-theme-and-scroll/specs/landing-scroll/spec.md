## ADDED Requirements

### Requirement: Full-bleed hero that closes into a card
The front page hero SHALL fill the viewport edge to edge on arrival, and as the reader scrolls it SHALL close into a rounded, inset card while the next-race card moves ahead of it and lands as its own card.

#### Scenario: Arrival
- **WHEN** the front page is opened on a wide screen
- **THEN** the hero fills the viewport with no surrounding frame

#### Scenario: Scrolling on
- **WHEN** the reader scrolls through the hero
- **THEN** its edges pull in to a rounded card and it scales down slightly, following the scroll position

### Requirement: Storm band
The front page SHALL include a storm band after the hero, where a large vortex painting fills the screen and a generic car travels a spiral from the outer arm to the eye as the reader scrolls through it.

#### Scenario: Scrubbing
- **WHEN** the reader scrolls down and then back up through the storm band
- **THEN** the car moves along the spiral in step with the scroll position, in both directions

### Requirement: Scroll-linked entrances
Circuit outlines on the front page SHALL draw in as their tiles enter the viewport, and the page doors SHALL rise into place as they enter.

#### Scenario: Circuits arrive
- **WHEN** the circuits grid scrolls into view
- **THEN** each outline draws itself in as its tile enters

### Requirement: Scroll is never hijacked
Scroll-linked motion SHALL follow the reader's own scroll and SHALL NOT change its speed or direction, stop it, or move the page on its own. Navigation SHALL still land at the top of a new page at once.

#### Scenario: Normal scrolling
- **WHEN** the reader scrolls the front page
- **THEN** the page moves by the amount they scroll, and the sticky sections release after their length

### Requirement: Fallbacks
With reduced motion requested, or where the browser lacks scroll-driven animations, the hero SHALL be a static full-bleed section, the storm band SHALL show the car at rest, and the entrances SHALL be shown without animation. The page SHALL work at 360px with no horizontal scroll in every mode.

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and the front page is scrolled
- **THEN** nothing is sticky or scrubbed, and all content is shown in normal flow

#### Scenario: Phone width
- **WHEN** the front page is opened at 360px
- **THEN** it has no horizontal scroll and the next-race card follows the headline without overlapping it
