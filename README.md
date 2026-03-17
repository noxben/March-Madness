# COOPERcast — March Madness Bracket Simulator

Implements Silver Bulletin's COOPER methodology for NCAA Tournament forecasting.
**Bracket pre-loaded with the real 2026 Selection Sunday field (March 15, 2026).**

## The 2026 Bracket

| Region | #1 seed | #2 seed | Notable threats |
|--------|---------|---------|-----------------|
| **East** | Duke (32-2) | UConn | #3 Michigan St., #4 Kansas — toughest region |
| **South** | Florida (26-7) | Houston | #3 Illinois, #5 Vanderbilt |
| **West** | Arizona (32-2) | Purdue | #3 Gonzaga, #5 Wisconsin |
| **Midwest** | Michigan (31-3) | Iowa St. | #3 Virginia, #4 Alabama |

**First Four winners already filled in:**
- East #11: South Florida (beat play-in)
- South #16: Prairie View A&M (beat Lehigh)
- West #11: Texas (beat NC State)
- Midwest #11: Miami OH (beat SMU) · Midwest #16: UMBC (beat Howard)

## Key Injuries to Enter in the App

Set these in Data Setup → 🩹 button for each team:

| Team | Player | Impact | Play% | Notes |
|------|--------|--------|-------|-------|
| Duke | Caleb Foster | 4 | 0% | Fractured foot, season-ending surgery |
| Duke | Patrick Ngongba II | 5 | 60% | Foot injury, "hopeful" to return |
| Michigan | L.J. Cason | 6 | 50% | Late-season injury, PG depth impacted |
| North Carolina | Caleb Wilson | 8 | 0% | Hand injury, season-ending surgery |

## What it does

- **Data**: Live-fetches T-Rank (Torvik) stats — AdjO, AdjD, Tempo, Barthag for all ~360 D1 teams
- **Composite rating**: 5/8 barthag-Elo + 3/8 efficiency-normalized (mirrors COOPER 5/8 + KenPom 3/8 weighting)
- **Simulation**: Up to 25,000 Monte Carlo bracket runs with hot Elo updates cascading through rounds
- **Injuries**: Binary roll per Silver's methodology — player either plays (0 penalty) or doesn't (full replacement penalty)
- **Score distribution**: Fat-tailed t-distribution (df=10) for projected margins
- **Outputs**: Win % to each round, upset watch, head-to-head matchup lab with injury scenario comparison

## Setup

```bash
npm install
npm start
```

## Deploy to Vercel (free, 2 minutes)

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import repo
3. Click Deploy — no config needed

## How to use

### Step 1 — Data Setup
- Click **Fetch Live T-Rank Data** — pulls current season stats automatically
- The 2026 bracket is pre-loaded with all 68 official teams; auto-matched to Torvik by name
- Any unmatched slots (rare) show in yellow — use the search to assign manually
- Add injury flags with the 🩹 button: set player impact (1–10) and play probability (0–100%)
- See the injury table above for the most important ones to enter

### Step 2 — Bracket Simulator
- Hit **Run Sims** — runs Monte Carlo bracket simulations in ~5-10 seconds
- Sort/filter results by region, seed, or advancement probability
- Upset Watch highlights first-round upsets with >25% probability
- Re-run anytime after changing injury data

### Step 3 — Matchup Lab
- Search any two teams (all ~360 D1 teams available, not just bracket teams)
- See win probability, projected score, full margin distribution chart
- If injuries are set, compare with/without injury scenarios side by side

## Methodology notes

### Composite Elo
```
compositeElo = (5/8) × barthagToElo(barthag) + (3/8) × (1500 + netRating × 28.5)
```

Where `barthagToElo` converts Torvik's win probability to Elo scale:
```
elo = 1500 + 400 × log10(p / (1 - p))
```

### Pace adjustment
Projected margins are scaled by `teamAvgTempo / leagueAvgTempo (68.5)` so uptempo teams have
higher variance, consistent with Silver's observation that higher-scoring games introduce more variability.

### Injury roll (binary, per Silver's methodology)
```javascript
const plays = Math.random() < injury.playProbability;
penalty = plays ? 0 : (impact / 10) × 8.5; // max ~8.5 pts = Silver's 7-10pt range
```

### Win bonus
Silver adds 6 points to the winner's final margin for Elo update purposes.
This is applied in the hot Elo update after each simulated game.

### Hot Elo updates
After each round, winners' Elo is updated using k-factor 55 (Silver's value), scaled 1.3× for
tournament games (rounds 3+). This means a 12-seed that upsets a 5-seed will carry a higher
rating into the Sweet 16, making further upsets more likely — matching Silver's "late rounds
can be less chalky" observation.

## Data source

**Barttorvik.com (T-Rank)** — free, no subscription required.
Fetched from: `https://barttorvik.com/2026_team_results.json`

If CORS blocks the direct fetch, the app falls back to allorigins.win proxy automatically.

## Limitations vs. true COOPER

- No actual COOPER Elo (Silver Bulletin paywalled) — we use Torvik's barthag as the 5/8 component
- No preseason poll adjustment (Bayesian version) — ratings are purely data-driven
- Travel penalty not applied (NCAA tournament is neutral sites throughout)
- Home court advantage not applied (neutral sites)
- Women's tournament not supported


## What it does

- **Data**: Live-fetches T-Rank (Torvik) stats — AdjO, AdjD, Tempo, Barthag for all ~360 D1 teams
- **Composite rating**: 5/8 barthag-Elo + 3/8 efficiency-normalized (mirrors COOPER 5/8 + KenPom 3/8 weighting)
- **Simulation**: 10,000 Monte Carlo bracket runs with hot Elo updates cascading through rounds
- **Injuries**: Binary roll per Silver's methodology — player either plays (0 penalty) or doesn't (full replacement penalty)
- **Score distribution**: Fat-tailed t-distribution (df=10) for projected margins
- **Outputs**: Win % to each round, upset watch, head-to-head matchup lab with injury scenario comparison

## Setup

```bash
npm install
npm start
```

## Deploy to Vercel (free, 2 minutes)

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import repo
3. Click Deploy — no config needed

## How to use

### Step 1 — Data Setup
- Click **Fetch Live T-Rank Data** — pulls current season stats automatically
- The 2026 bracket is pre-seeded with Selection Sunday teams; auto-matched to Torvik
- Any unmatched slots show in yellow — use the search to assign manually
- Add injury flags with the 🩹 button: set player impact (1–10) and play probability (0–100%)

### Step 2 — Bracket Simulator
- Hit **Run Sims** — runs 10,000 Monte Carlo bracket simulations in ~5 seconds
- Sort/filter results by region, seed, or advancement probability
- Upset Watch highlights first-round upsets with >25% probability
- Re-run anytime after changing injury data

### Step 3 — Matchup Lab
- Search any two teams (all ~360 D1 teams available, not just bracket teams)
- See win probability, projected score, full margin distribution chart
- If injuries are set, compare with/without injury scenarios side by side

## Methodology notes

### Composite Elo
```
compositeElo = (5/8) × barthagToElo(barthag) + (3/8) × (1500 + netRating × 28.5)
```

Where `barthagToElo` converts Torvik's win probability to Elo scale:
```
elo = 1500 + 400 × log10(p / (1 - p))
```

### Pace adjustment
Projected margins are scaled by `teamAvgTempo / leagueAvgTempo (68.5)` so uptempo teams have
higher variance, consistent with Silver's observation that higher-scoring games introduce more variability.

### Injury roll (binary, per Silver's methodology)
```javascript
const plays = Math.random() < injury.playProbability;
penalty = plays ? 0 : (impact / 10) × 8.5; // max ~8.5 pts = Silver's 7-10pt range
```

### Win bonus
Silver adds 6 points to the winner's final margin for Elo update purposes.
This is applied in the hot Elo update after each simulated game.

### Hot Elo updates
After each round, winners' Elo is updated using k-factor 55 (Silver's value), scaled 1.3× for
tournament games (rounds 3+). This means a 12-seed that upsets a 5-seed will carry a higher
rating into the Sweet 16, making further upsets more likely — matching Silver's "late rounds
can be less chalky" observation.

## Data source

**Barttorvik.com (T-Rank)** — free, no subscription required.
Fetched from: `https://barttorvik.com/2026_team_results.json`

If CORS blocks the direct fetch, the app falls back to allorigins.win proxy automatically.

## Limitations vs. true COOPER

- No actual COOPER Elo (Silver Bulletin paywalled) — we use Torvik's barthag as the 5/8 component
- No preseason poll adjustment (Bayesian version) — ratings are purely data-driven
- Travel penalty not applied (NCAA tournament is neutral sites throughout)
- Home court advantage not applied (neutral sites)
- Women's tournament not supported

