## ADDED Requirements

### Requirement: Snapshot built only from pre-race facts
Before each race, the system SHALL build a snapshot containing only facts known after qualifying and before lights out: the qualifying order and times, the starting grid when published (with known grid penalties and pit-lane starts), championship standings before the race, each driver's and team's results in the previous races of the season, sprint results on sprint weekends, and historical rates computed by code. It SHALL NOT include anything from the race itself.

#### Scenario: No race data
- **WHEN** the snapshot for a race is inspected
- **THEN** it contains no lap, position, or result data from that race

### Requirement: Facts are computed by code and written as plain sentences
Every number in the snapshot (gaps to pole, points, finishing streaks, historical podium rate from a grid slot) SHALL be computed by code and written as a plain sentence per driver, so Jev never has to do arithmetic or parse tables.

#### Scenario: Driver line
- **WHEN** a driver's line is built
- **THEN** it states the grid slot, the gap to pole in seconds, points and position in the championship, and results in the last three races

### Requirement: Three typed questions in one request
The system SHALL send one Jev request per race containing: a `noul` question per driver asking whether that driver will finish in the top three, a `choice` question over every driver on the grid asking who will win, and a `score` question rating how chaotic the race will be against the published chaos rubric.

#### Scenario: One request
- **WHEN** the prediction for a race is made
- **THEN** exactly one Jev request is sent, and its questions cover every driver on the grid

### Requirement: Immutable, timestamped record
Each prediction SHALL be saved with the full request, the response, the reported model version, the provider, the cost, the snapshot inputs, and the time it was made, and committed to the repository before the race's scheduled start. A prediction made or changed after the scheduled start SHALL be marked late and excluded from scoring.

#### Scenario: Late prediction
- **WHEN** a prediction's timestamp is after the race's scheduled start
- **THEN** it is published as late and is not scored

### Requirement: Waiting for qualifying data
The pre-race job SHALL wait until the qualifying results are available, retrying on a schedule, and SHALL give up one hour before the race start, publishing "no prediction for this race" rather than predicting from incomplete data.

#### Scenario: Data never arrives
- **WHEN** qualifying results are still missing one hour before the start
- **THEN** no prediction is made and the race page says so

### Requirement: Honest about memorised history
Predictions for races that happened before the model version's date SHALL be labelled as backtests that the model may have seen in training, and SHALL be kept separate from the live season record.

#### Scenario: Backtest label
- **WHEN** a 2024 race is predicted to test the pipeline
- **THEN** it is stored and shown as a backtest, not as part of the live leaderboard
