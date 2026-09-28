## ADDED Requirements

### Requirement: Scoring against official results
After the race, the system SHALL fetch the official classification and score the saved prediction: a Brier score for the podium questions (one per driver), the log loss and top-1 result of the winner question, and the absolute error of the chaos score.

#### Scenario: Scored race
- **WHEN** the official results are available
- **THEN** the race has a podium Brier, a winner log loss, whether the winner pick was right, and the chaos error

### Requirement: The chaos rubric is computed from data
The actual chaos level SHALL be computed by code from race-control messages and the classification on a fixed 0 to 4 rubric (safety cars, virtual safety cars, red flags, retirements, lead changes, wet running), and the rubric SHALL be the same text given to Jev in the question.

#### Scenario: Red flag
- **WHEN** the race had a red flag
- **THEN** the actual chaos level is 4

### Requirement: Raw and consistent views
Podium probabilities SHALL be scored as Jev returned them, and the scorecard SHALL also report how far they were from summing to three and any driver whose win probability exceeded their podium probability.

#### Scenario: Inconsistent answers
- **WHEN** a driver's win probability is higher than their podium probability
- **THEN** the scorecard lists that driver as an inconsistency

### Requirement: Podium pick
Jev's podium pick SHALL be the three drivers with the highest podium probability, scored as how many of them finished in the top three, alongside the grid baseline's pick of the top three starters.

#### Scenario: Podium pick scored
- **WHEN** a race is scored
- **THEN** the scorecard shows Jev's three podium picks, how many were right, and the same for the grid baseline

### Requirement: Baselines on the same races
Every scored race SHALL also score a grid-position baseline (historical top-three and win rates by starting slot in the current era, from f1db) and a recent-form baseline, on the same drivers.

#### Scenario: Comparison
- **WHEN** a race is scored
- **THEN** Jev and both baselines have the same metrics for that race

### Requirement: Season leaderboard and calibration
The season leaderboard SHALL show, for Jev and each baseline, cumulative metrics over the live races, the number of races, and a reliability table of podium probabilities with bins of fewer than 10 predictions marked as low-sample.

#### Scenario: Leaderboard update
- **WHEN** a race is scored
- **THEN** the leaderboard includes it and states how many live races it covers
