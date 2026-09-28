## ADDED Requirements

### Requirement: Chaos shown as a painting
The race page chaos section SHALL show a painting whose turbulence follows Jev's chaos score on the 0 to 4 rubric, from long calm strokes at 0 to tight broken vortices at 4, with values between levels interpolated.

#### Scenario: A calm call
- **WHEN** Jev's chaos score is 0.92
- **THEN** the painting shows mostly long strokes with a little turbulence, and the text reads the score and its nearest levels

### Requirement: Called against actual
After the race, the chaos section SHALL show Jev's painting and the actual level's painting side by side, each labelled in text with its value, its level word, and for the actual level the reason.

#### Scenario: A scored race
- **WHEN** a race is scored with an actual chaos level of 4 and the reason "red flag on lap 12"
- **THEN** two labelled paintings appear: Jev's call with its score, and "Actual: 4, bedlam" with the reason

### Requirement: Behind the spoiler guard
The chaos paintings SHALL appear only after the reader reveals the calls, like every other call on the race page.

#### Scenario: Before the reveal
- **WHEN** a race page is opened and the calls are not yet revealed
- **THEN** no chaos painting is shown
