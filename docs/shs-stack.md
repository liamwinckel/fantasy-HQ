# SHS AI v2: stacked weekly model

Replayed 17,959 player-weeks (QB/RB/WR/TE ranked by the experts). Projection source: sleeper.
Out of sample, walk-forward: seasons 2022, 2023, 2024, 2025, 2026 are each predicted by a model trained only on earlier seasons.

**Close calls** = pairs of players within 3 expert-rank spots at the same position in the same week (40,623 pairs): the start/sit decisions people face. **All pairs** = every two ranked players (the old headline number). **Avg miss** = average absolute error in fantasy points. **Rank corr.** = Spearman correlation with actual scoring, averaged over each position-week.

Headline: close calls 52.6% (experts) → 52.6% (SHS v2), avg miss 5.41 → 5.41 pts.

**Two-stage models**: the usage, matchup and projection parts also learn from 25,407 player-weeks of 2012–2020 (before the expert-rank archive; projection from Sleeper's 2018+ archive). The blend with expert ranks still learns only from graded seasons. Kept per position only where it beat the single-stage model out of sample: QB no, RB no, WR no, TE yes.

## All test seasons

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.6% | 67.4% | 5.41 | 0.452 |
| Projection | 52.7% | 67.2% | 5.39 | 0.445 |
| SHS (current) | 52.7% | 67.5% | 5.41 | 0.455 |
| Opportunity only | 50.5% | 66.9% | 5.45 | 0.435 |
| Context only | 51.9% | 67.2% | 5.45 | 0.447 |
| One ridge (no stack) | 52.3% | 67.3% | 5.4 | 0.449 |
| Stack | 52.8% | 67.4% | 5.41 | 0.452 |
| Stack + range | 52.6% | 67.4% | 5.41 | 0.45 |
| Stack, ranking head | 53.1% | 67.5% | 5.41 | 0.453 |
| Stack, ranking head, capped | 53% | 67.5% | 5.41 | 0.453 |
| Two-stage: opportunity only | 50.5% | 66.8% | 5.47 | 0.433 |
| Two-stage: stack | 52.8% | 67.4% | 5.41 | 0.452 |
| Two-stage: ranking head | 53% | 67.5% | 5.41 | 0.455 |
| Two-stage: ranking head, capped | 53% | 67.5% | 5.41 | 0.454 |

## By position (all test seasons)

### QB

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 53.9% | 65.4% | 5.92 | 0.428 |
| Projection | 52.6% | 64.9% | 5.79 | 0.416 |
| SHS (current) | 53.6% | 65.3% | 5.92 | 0.426 |
| Opportunity only | 51.6% | 64.2% | 5.92 | 0.397 |
| Context only | 53.6% | 65.3% | 5.9 | 0.426 |
| One ridge (no stack) | 54% | 65.3% | 5.81 | 0.428 |
| Stack | 54.1% | 65.4% | 5.89 | 0.428 |
| Stack + range | 53.5% | 65.1% | 5.89 | 0.423 |
| Stack, ranking head | 54% | 65.3% | 5.89 | 0.428 |
| Stack, ranking head, capped | 53.9% | 65.3% | 5.89 | 0.428 |
| Two-stage: opportunity only | 51.9% | 64.2% | 5.93 | 0.397 |
| Two-stage: stack | 53.9% | 65.4% | 5.89 | 0.428 |
| Two-stage: ranking head | 54% | 65.3% | 5.89 | 0.43 |
| Two-stage: ranking head, capped | 53.9% | 65.3% | 5.89 | 0.43 |

### RB

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.6% | 71.3% | 5.14 | 0.589 |
| Projection | 53.3% | 71.3% | 5.13 | 0.589 |
| SHS (current) | 52.4% | 71.3% | 5.14 | 0.588 |
| Opportunity only | 51.2% | 71.1% | 5.23 | 0.583 |
| Context only | 51.4% | 71.1% | 5.24 | 0.585 |
| One ridge (no stack) | 52.8% | 71.3% | 5.17 | 0.591 |
| Stack | 53.6% | 71.4% | 5.18 | 0.592 |
| Stack + range | 53.6% | 71.4% | 5.18 | 0.592 |
| Stack, ranking head | 53.5% | 71.4% | 5.18 | 0.592 |
| Stack, ranking head, capped | 53.5% | 71.4% | 5.18 | 0.592 |
| Two-stage: opportunity only | 50.9% | 70.9% | 5.24 | 0.579 |
| Two-stage: stack | 53.6% | 71.4% | 5.18 | 0.592 |
| Two-stage: ranking head | 53.3% | 71.4% | 5.18 | 0.592 |
| Two-stage: ranking head, capped | 53.2% | 71.4% | 5.18 | 0.592 |

### WR

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 51.7% | 66.1% | 5.61 | 0.452 |
| Projection | 52.2% | 65.7% | 5.62 | 0.442 |
| SHS (current) | 51.6% | 66.1% | 5.61 | 0.451 |
| Opportunity only | 49.3% | 65.6% | 5.64 | 0.439 |
| Context only | 51.1% | 65.9% | 5.65 | 0.445 |
| One ridge (no stack) | 51.2% | 65.9% | 5.59 | 0.448 |
| Stack | 51.7% | 66.1% | 5.6 | 0.452 |
| Stack + range | 51.3% | 66% | 5.6 | 0.451 |
| Stack, ranking head | 52.5% | 66.2% | 5.6 | 0.454 |
| Stack, ranking head, capped | 52.5% | 66.2% | 5.6 | 0.454 |
| Two-stage: opportunity only | 49.3% | 65.4% | 5.68 | 0.434 |
| Two-stage: stack | 51.6% | 66.1% | 5.6 | 0.451 |
| Two-stage: ranking head | 52.3% | 66.2% | 5.6 | 0.453 |
| Two-stage: ranking head, capped | 52.3% | 66.2% | 5.6 | 0.453 |

### TE

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 53.5% | 62.4% | 4.91 | 0.34 |
| Projection | 52.7% | 62.1% | 4.91 | 0.334 |
| SHS (current) | 55.1% | 62.8% | 4.89 | 0.354 |
| Opportunity only | 51.4% | 61.7% | 4.91 | 0.323 |
| Context only | 52.9% | 62% | 4.9 | 0.333 |
| One ridge (no stack) | 52.2% | 61.8% | 4.89 | 0.328 |
| Stack | 52.9% | 62% | 4.89 | 0.335 |
| Stack + range | 52.9% | 62.1% | 4.89 | 0.335 |
| Stack, ranking head | 52.7% | 62.1% | 4.89 | 0.339 |
| Stack, ranking head, capped | 52.7% | 62.2% | 4.89 | 0.339 |
| Two-stage: opportunity only | 51.5% | 61.6% | 4.92 | 0.32 |
| Two-stage: stack | 52.8% | 62.1% | 4.89 | 0.335 |
| Two-stage: ranking head | 53.1% | 62.3% | 4.89 | 0.343 |
| Two-stage: ranking head, capped | 53.2% | 62.3% | 4.89 | 0.341 |

## By season

### 2022

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.5% | 66.8% | 5.45 | 0.449 |
| Projection | 53.5% | 66.7% | 5.42 | 0.446 |
| SHS (current) | 52.7% | 66.8% | 5.45 | 0.452 |
| Opportunity only | 49.2% | 66.1% | 5.44 | 0.423 |
| Context only | 50.9% | 66.5% | 5.42 | 0.444 |
| One ridge (no stack) | 51% | 66.5% | 5.37 | 0.443 |
| Stack | 52.2% | 66.8% | 5.38 | 0.449 |
| Stack + range | 52.2% | 66.7% | 5.38 | 0.447 |
| Stack, ranking head | 52.2% | 66.8% | 5.38 | 0.448 |
| Stack, ranking head, capped | 52.2% | 66.8% | 5.38 | 0.448 |
| Two-stage: opportunity only | 49.1% | 65.9% | 5.48 | 0.419 |
| Two-stage: stack | 52.2% | 66.8% | 5.38 | 0.446 |
| Two-stage: ranking head | 52.4% | 66.8% | 5.38 | 0.449 |
| Two-stage: ranking head, capped | 52.4% | 66.8% | 5.38 | 0.449 |

### 2023

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.7% | 68.1% | 5.29 | 0.477 |
| Projection | 52.5% | 67.5% | 5.31 | 0.46 |
| SHS (current) | 52.4% | 68% | 5.29 | 0.476 |
| Opportunity only | 50.8% | 67.6% | 5.36 | 0.459 |
| Context only | 51.9% | 67.7% | 5.36 | 0.458 |
| One ridge (no stack) | 52.4% | 67.8% | 5.31 | 0.46 |
| Stack | 52.5% | 67.9% | 5.31 | 0.471 |
| Stack + range | 52.1% | 67.8% | 5.31 | 0.465 |
| Stack, ranking head | 52.7% | 68% | 5.31 | 0.469 |
| Stack, ranking head, capped | 52.5% | 68% | 5.31 | 0.472 |
| Two-stage: opportunity only | 50.5% | 67.3% | 5.39 | 0.455 |
| Two-stage: stack | 52.5% | 68% | 5.31 | 0.474 |
| Two-stage: ranking head | 52.2% | 68% | 5.31 | 0.471 |
| Two-stage: ranking head, capped | 52.3% | 68% | 5.31 | 0.473 |

### 2024

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.7% | 67.2% | 5.44 | 0.443 |
| Projection | 51.6% | 66.8% | 5.43 | 0.438 |
| SHS (current) | 52.5% | 67.3% | 5.44 | 0.448 |
| Opportunity only | 51.7% | 66.9% | 5.5 | 0.438 |
| Context only | 52.1% | 67% | 5.52 | 0.444 |
| One ridge (no stack) | 52.4% | 67.2% | 5.45 | 0.45 |
| Stack | 52.7% | 67.2% | 5.48 | 0.446 |
| Stack + range | 52.4% | 67.1% | 5.48 | 0.445 |
| Stack, ranking head | 52.7% | 67.3% | 5.48 | 0.448 |
| Stack, ranking head, capped | 52.7% | 67.2% | 5.48 | 0.446 |
| Two-stage: opportunity only | 51.5% | 66.8% | 5.52 | 0.434 |
| Two-stage: stack | 52.7% | 67.2% | 5.48 | 0.445 |
| Two-stage: ranking head | 52.8% | 67.3% | 5.48 | 0.45 |
| Two-stage: ranking head, capped | 52.8% | 67.3% | 5.48 | 0.448 |

### 2025

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.6% | 67.4% | 5.47 | 0.44 |
| Projection | 53.3% | 67.3% | 5.44 | 0.433 |
| SHS (current) | 52.9% | 67.5% | 5.47 | 0.442 |
| Opportunity only | 50.4% | 66.8% | 5.51 | 0.421 |
| Context only | 52.4% | 67.3% | 5.52 | 0.439 |
| One ridge (no stack) | 52.9% | 67.4% | 5.46 | 0.438 |
| Stack | 53.2% | 67.5% | 5.48 | 0.44 |
| Stack + range | 52.9% | 67.4% | 5.48 | 0.439 |
| Stack, ranking head | 54.2% | 67.6% | 5.48 | 0.445 |
| Stack, ranking head, capped | 54.3% | 67.6% | 5.48 | 0.444 |
| Two-stage: opportunity only | 50.8% | 66.8% | 5.51 | 0.42 |
| Two-stage: stack | 53.1% | 67.5% | 5.48 | 0.441 |
| Two-stage: ranking head | 53.7% | 67.6% | 5.48 | 0.446 |
| Two-stage: ranking head, capped | 53.7% | 67.6% | 5.48 | 0.445 |

### 2026

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.2% | 67.8% | 5.4 | 0.452 |
| Projection | 52.2% | 67.8% | 5.36 | 0.454 |
| SHS (current) | 53.2% | 67.8% | 5.39 | 0.457 |
| Opportunity only | 50.7% | 67.4% | 5.46 | 0.435 |
| Context only | 52.3% | 67.7% | 5.43 | 0.456 |
| One ridge (no stack) | 53.1% | 67.9% | 5.38 | 0.457 |
| Stack | 53.9% | 68% | 5.42 | 0.456 |
| Stack + range | 53.8% | 68% | 5.42 | 0.456 |
| Stack, ranking head | 54% | 68% | 5.42 | 0.457 |
| Stack, ranking head, capped | 53.9% | 68% | 5.42 | 0.456 |
| Two-stage: opportunity only | 50.7% | 67.4% | 5.47 | 0.437 |
| Two-stage: stack | 53.7% | 68% | 5.41 | 0.456 |
| Two-stage: ranking head | 54.4% | 68% | 5.41 | 0.459 |
| Two-stage: ranking head, capped | 54.2% | 68% | 5.41 | 0.458 |

## What the final model trusts (trained on every season)

Meta weights per position: intercept, experts, projection, opportunity, context, early-season projection pull, small-sample usage pull.

- **QB**: -0.10 · 0.19 · 0.22 · 0.24 · 0.36 · -0.06 · 0.71; range nudge 0; ranking head 0.189 · 0.217 · 0.334 · 0.023 · 0.048 · 0.002; **not used (no out-of-sample edge); the app keeps the current formula**
- **RB**: -0.88 · 0.24 · 0.35 · 0.20 · 0.29 · 0.23 · -0.84; range nudge 0; ranking head 0.338 · -0.057 · 0.195 · 0.065 · -0.014 · -0.021; **used by the app**
- **WR**: -1.11 · 0.28 · 0.27 · 0.25 · 0.29 · -0.07 · -0.69; range nudge 0; ranking head 0.214 · -0.179 · 0.110 · 0.018 · -0.070 · -0.007; **used by the app**
- **TE**: -0.47 · 0.27 · 0.24 · 0.25 · 0.32 · 0.30 · 1.32; range nudge 0.1; ranking head 0.316 · 0.022 · 0.522 · 0.018 · -0.161 · -0.006; **not used (no out-of-sample edge); the app keeps the current formula**

Range nudges chosen per test season: QB 0, 0.2, 0, 0, 0; RB 0, 0, 0.05, 0, 0; WR 0.3, 0, 0.1, 0.1, 0.1; TE 0.05, 0, 0, 0.05, 0.05.

Not in the backtest: player prop betting lines (no free history; the live app blends them in when available) and weather.
