## ADDED Requirements

### Requirement: Race page before and after
Each race SHALL have a page that, before the race, shows Jev's calls (podium probability per driver in grid order, the winner pick with the full distribution, the chaos score with its rubric) and the prediction time with a link to its commit; and after the race, adds the results, the scorecard, and how Jev compared with the baselines.

#### Scenario: Before the race
- **WHEN** the page is opened after the prediction and before the start
- **THEN** it shows the calls and the time they were made, and no results

### Requirement: Season page
The site SHALL have a season page with the leaderboard, the calibration table, and a list of every race with its status (upcoming, predicted, scored, no prediction).

#### Scenario: Status list
- **WHEN** the season page is opened
- **THEN** every race of the season is listed with its status

### Requirement: Static, key-free build
The site SHALL be built as static files from the committed predictions and scores, SHALL contain no API key, and SHALL be deployed to Vercel automatically after each job commits.

#### Scenario: No key in the build
- **WHEN** the built site is searched for the API key
- **THEN** it is not found

### Requirement: Scheduled jobs
A pre-race workflow SHALL run after each qualifying session and a post-race workflow after each race, both on GitHub Actions with `OPENROUTER_API_KEY` as a secret, and each SHALL commit its output and trigger a deploy.

#### Scenario: Pre-race run
- **WHEN** qualifying for a race has finished and its results are published
- **THEN** the pre-race workflow makes the prediction, commits it, and the race page shows it

### Requirement: Presentation
The site SHALL reuse the existing visual language (near-black, Satoshi and Instrument Serif, team colours, tabular figures), work at 360px, meet WCAG 2.2 AA contrast, and not use the F1 or Formula 1 names or marks in its branding.

#### Scenario: Phone width
- **WHEN** a race page is opened at 360px
- **THEN** it has no horizontal scroll
