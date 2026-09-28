## ADDED Requirements

### Requirement: Original generative paintings
The site SHALL render painted-brushstroke art from code (strokes following a vortex flow field on a canvas), SHALL NOT embed images, photographs, or copies of existing artworks, and SHALL NOT show team liveries or series marks.

#### Scenario: No image assets
- **WHEN** the built site is inspected
- **THEN** the paintings come from script and canvas, and there are no painting image files in the build

### Requirement: Deterministic paintings
A painting SHALL be the same each time it is shown for the same input, such as a race round or a chaos level.

#### Scenario: Revisit
- **WHEN** a race page is opened twice
- **THEN** its paintings look the same both times

### Requirement: Cheap to show
A painting SHALL be painted once per size (and again only after a resize settles), SHALL NOT repaint every frame, and SHALL NOT block the page from rendering its text first.

#### Scenario: Scrolling past a painting
- **WHEN** the reader scrolls past a painting
- **THEN** the canvas is not repainted, and any motion comes from transforms of the painted layer

### Requirement: Reduced motion
With reduced motion requested, paintings SHALL be shown still, with no drift or rotation.

#### Scenario: Reduced motion
- **WHEN** the reader's system requests reduced motion
- **THEN** every painting is static
