# SHS AI research (2021–2026)

Generated 2026-11-25 · 95 weeks · 17,959 player-weeks · projection source: sleeper.

## Weekly

Every week was replayed with only what was known before Sunday's first kickoff. *Picks right* = for every pair of players at the same position in the same week, how often the one ranked higher outscored the other (PPR). The SHS column is out of sample: fitted on the other seasons, graded on that one.

| Season | Weeks | Experts | Projection | 50/50 | Old mix 25/25/50 | **SHS formula** |
|---|---|---|---|---|---|---|
| 2021 | 17 | 66.4% | 65.3% | 65.9% | 65.7% | **66.5%** |
| 2022 | 17 | 66.9% | 66.8% | 67% | 66.6% | **66.9%** |
| 2023 | 17 | 68.2% | 67.7% | 68.1% | 67.8% | **68.2%** |
| 2024 | 17 | 67.3% | 66.9% | 67.3% | 66.9% | **67.4%** |
| 2025 | 17 | 67.6% | 67.5% | 67.7% | 67.4% | **67.6%** |
| 2026 | 10 | 67.9% | 67.9% | 68.2% | 67.6% | **67.9%** |
| **Average** | | 67.4% | 67% | 67.4% | 67% | **67.4%** |

When SHS AI disagreed with the experts on which of two players would score more, it was right 53.4% of the time (1,974 pairs).

### Weekly formula by position

| Pos | Projection pull γ | Factors kept (β) | Out-of-sample gain |
|---|---|---|---|
| QB | 0 | none | +0 |
| RB | 0 | none | +0 |
| WR | 0 | none | +0 |
| TE | 0.275 | ppg -0.079, script -0.047 | +0.28 |

### Each factor alone (gain in picks right vs experts, out of sample)

| Factor | QB | RB | WR | TE | Kept for |
|---|---|---|---|---|---|
| gap | -0.2 | -0.04 | -0.09 | -0.16 | TE |
| inj | -0.09 | -0.02 | -0.09 | -0.05 | — |
| matchup | -0.35 | -0.14 | -0.13 | -0.27 | — |
| vegas | 0.01 | -0.17 | -0.14 | 0.15 | — |
| script | -0.29 | -0.17 | -0.14 | -0.04 | TE |
| ppg | -0.27 | -0.18 | -0.11 | 0.16 | TE |
| xfp | -0.32 | -0.15 | -0.14 | -0.13 | — |
| track | -0.21 | -0.09 | -0.12 | -0.1 | — |
| snap | — | -0.13 | -0.11 | 0.02 | — |
| adv | -0.43 | -0.13 | -0.12 | -0.16 | — |
| chart | -0.26 | -0.11 | -0.13 | -0.01 | — |

## Rest of season

In-season expert rest-of-season ranks (weeks 4–14, 2021–2025). Outcome: PPR points from that week to week 17. Graded pairwise within position and week.

| Pos | Experts | SHS gain | Factors kept (β) | Each factor alone |
|---|---|---|---|---|
| QB | 66.7% | +0.82 | inj 0.796 | age -1.06, form -0.62, inj +1.21, luck -0.61, missed -0.45, ppg -0.97, sd -1.25, share -0.94, snap -0.11, xfp -0.79 |
| RB | 71.2% | +0.58 | inj 0.552, xfp 0.035 | age -0.27, form +0, inj +0.43, luck -0.5, missed -0.13, ppg -0.18, sd -0.22, share +0.06, snap -0.05, xfp +0.13 |
| WR | 70.2% | +0.73 | inj 0.604 | age -0.58, form -0.21, inj +0.86, luck -0.26, missed -0.4, ppg -0.18, sd -0.32, share -0.16, snap -0.22, xfp -0.43 |
| TE | 63.9% | +0.65 | inj 0.536 | age -0.81, form -0.45, inj +0.87, luck -0.75, missed -0.42, ppg -0.44, sd -0.54, share -0.55, snap -0.11, xfp -0.83 |

## Dynasty

Preseason expert dynasty ranks (2021–2025). Outcome: PPR points that season and the next (2026 scaled to a full season). Factors use only the previous season.

| Pos | Experts | SHS gain | Factors kept (β) | Each factor alone |
|---|---|---|---|---|
| QB | 70.8% | +0 | none | age -0.48, draft -0.67, games +0.53, luck -0.83, ppg -1.75, rookie -0.29, sd -1.56, share -0.51, snap -0.07, team -0.77, xfp -0.1 |
| RB | 72.1% | +0 | none | age -0.86, draft -0.7, games -0.09, luck -0.57, ppg -1.33, rookie -0.73, sd -1.69, share -0.68, snap +0.17, team -1.62, xfp -0.5 |
| WR | 71.3% | +0 | none | age -0.8, draft +0.58, games +0.48, luck -0.66, ppg -0.76, rookie +0.08, sd -1.7, share -0.99, snap +0.22, team -0.88, xfp -0.62 |
| TE | 69.8% | +1.77 | snap 0.16, age -0.075, games 0.083 | age +0.15, draft -2.55, games +0.44, luck -0.87, ppg -1.41, rookie +0.09, sd -1.44, share -1.22, snap +1.42, team -1.75, xfp -1.56 |
