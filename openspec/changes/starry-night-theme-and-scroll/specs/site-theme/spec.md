## ADDED Requirements

### Requirement: Night palette
The site SHALL use a single night palette on every page: deep night blue surfaces, a chrome yellow accent, cobalt and cerulean for art and fills, and a warm canvas paper for printed sheets (scorecard, backtests). It SHALL NOT mix in the previous warm near-black, orange, or oxblood surfaces.

#### Scenario: Every page shares the palette
- **WHEN** the front page, season, backtests, method, and a race page are opened
- **THEN** each uses the night surface, text, and accent tokens, and none shows the previous warm palette

### Requirement: Measured contrast
Every text colour and every state colour SHALL meet WCAG 2.2 AA against every surface it is used on (4.5:1 for normal text, 3:1 for large text and non-text indicators), and team colour fills SHALL reach at least 3:1 against the bar track.

#### Scenario: Contrast is tested
- **WHEN** the test suite runs
- **THEN** it computes the contrast of each text and state token on each surface token, and of each team fill on the bar track, and fails below the thresholds

### Requirement: State colours stay distinct from the accent
Late, provisional, and miss states SHALL use an amber distinct from the chrome yellow accent, and every state SHALL still be named in words.

#### Scenario: A late race on the season list
- **WHEN** a late call is listed next to other races
- **THEN** its status reads "Late, not scored" with an amber marker that is not the accent yellow

### Requirement: Art never carries meaning alone
Paintings, road art, circuit outlines, and other decoration SHALL be hidden from assistive technology, and anything they suggest SHALL also be said in text nearby. Text SHALL NOT sit directly on a painting without a scrim or panel.

#### Scenario: Screen reader on the front page
- **WHEN** a screen reader reads the front page hero
- **THEN** it reads the headline and the next race, and nothing from the paintings or cars
