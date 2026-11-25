# SHS AI v2: stacked weekly model

Replayed 17,959 player-weeks (QB/RB/WR/TE ranked by the experts). Projection source: fantasypros.
Out of sample, walk-forward: seasons 2022, 2023, 2024, 2025, 2026 are each predicted by a model trained only on earlier seasons.

**Close calls** = pairs of players within 3 expert-rank spots at the same position in the same week (40,623 pairs): the start/sit decisions people face. **All pairs** = every two ranked players (the old headline number). **Avg miss** = average absolute error in fantasy points. **Rank corr.** = Spearman correlation with actual scoring, averaged over each position-week.

Headline: close calls 52.6% (experts) → 51.9% (SHS v2), avg miss 5.42 → 5.43 pts.

## All test seasons

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.6% | 67.4% | 5.42 | 0.452 |
| Projection | 52.1% | 67.3% | 5.42 | 0.451 |
| SHS (current) | 52.6% | 67.4% | 5.42 | 0.455 |
| Opportunity only | 50.7% | 67% | 5.45 | 0.439 |
| Context only | 51.8% | 67.2% | 5.45 | 0.447 |
| One ridge (no stack) | 51.7% | 67.2% | 5.41 | 0.447 |
| Stack | 52% | 67.3% | 5.43 | 0.448 |
| Stack + range | 51.9% | 67.2% | 5.43 | 0.447 |
| Stack, ranking head | 52.3% | 67.4% | 5.43 | 0.45 |
| Stack, ranking head, capped | 52.3% | 67.4% | 5.43 | 0.452 |

## By position (all test seasons)

### QB

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 53.9% | 65.4% | 5.83 | 0.428 |
| Projection | 54% | 65.4% | 5.77 | 0.43 |
| SHS (current) | 53.9% | 65.4% | 5.83 | 0.429 |
| Opportunity only | 52.3% | 64.5% | 5.87 | 0.402 |
| Context only | 53.7% | 65.3% | 5.87 | 0.426 |
| One ridge (no stack) | 54% | 65.3% | 5.81 | 0.426 |
| Stack | 54.2% | 65.2% | 5.88 | 0.423 |
| Stack + range | 53.6% | 65% | 5.88 | 0.418 |
| Stack, ranking head | 54.7% | 65.5% | 5.88 | 0.432 |
| Stack, ranking head, capped | 54.6% | 65.5% | 5.88 | 0.432 |

### RB

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.6% | 71.3% | 5.16 | 0.589 |
| Projection | 52% | 71.2% | 5.17 | 0.587 |
| SHS (current) | 52.4% | 71.3% | 5.16 | 0.588 |
| Opportunity only | 50.8% | 71.1% | 5.23 | 0.583 |
| Context only | 51.8% | 71.2% | 5.24 | 0.587 |
| One ridge (no stack) | 51.8% | 71.2% | 5.2 | 0.587 |
| Stack | 52% | 71.1% | 5.21 | 0.586 |
| Stack + range | 51.8% | 71.1% | 5.21 | 0.586 |
| Stack, ranking head | 52.4% | 71.3% | 5.21 | 0.588 |
| Stack, ranking head, capped | 52.4% | 71.3% | 5.21 | 0.588 |

### WR

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 51.7% | 66.1% | 5.64 | 0.452 |
| Projection | 50.6% | 65.9% | 5.66 | 0.447 |
| SHS (current) | 51.5% | 66.1% | 5.64 | 0.452 |
| Opportunity only | 49.5% | 65.7% | 5.65 | 0.441 |
| Context only | 50.8% | 65.8% | 5.66 | 0.445 |
| One ridge (no stack) | 50.1% | 65.8% | 5.62 | 0.445 |
| Stack | 50.8% | 66% | 5.62 | 0.45 |
| Stack + range | 50.9% | 66% | 5.62 | 0.449 |
| Stack, ranking head | 51.2% | 66.1% | 5.62 | 0.451 |
| Stack, ranking head, capped | 51.2% | 66.1% | 5.62 | 0.451 |

### TE

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 53.5% | 62.4% | 4.92 | 0.34 |
| Projection | 53.8% | 62.4% | 4.92 | 0.34 |
| SHS (current) | 54.6% | 62.6% | 4.91 | 0.349 |
| Opportunity only | 52.3% | 62% | 4.91 | 0.329 |
| Context only | 52.3% | 61.9% | 4.91 | 0.33 |
| One ridge (no stack) | 52.9% | 61.9% | 4.9 | 0.332 |
| Stack | 52.6% | 62.1% | 4.9 | 0.334 |
| Stack + range | 52.6% | 62.1% | 4.9 | 0.334 |
| Stack, ranking head | 52.7% | 62% | 4.9 | 0.33 |
| Stack, ranking head, capped | 52.8% | 62.2% | 4.9 | 0.335 |

## By season

### 2022

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.5% | 66.8% | 5.45 | 0.449 |
| Projection | 52.1% | 66.7% | 5.45 | 0.448 |
| SHS (current) | 52.5% | 66.8% | 5.44 | 0.452 |
| Opportunity only | 49.5% | 66.2% | 5.45 | 0.427 |
| Context only | 50.4% | 66.4% | 5.44 | 0.442 |
| One ridge (no stack) | 50.6% | 66.4% | 5.42 | 0.443 |
| Stack | 51.4% | 66.5% | 5.43 | 0.442 |
| Stack + range | 51.5% | 66.5% | 5.43 | 0.443 |
| Stack, ranking head | 52.3% | 66.8% | 5.43 | 0.449 |
| Stack, ranking head, capped | 52.3% | 66.8% | 5.43 | 0.449 |

### 2023

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.7% | 68.1% | 5.31 | 0.477 |
| Projection | 51.9% | 67.9% | 5.31 | 0.476 |
| SHS (current) | 52.5% | 68% | 5.3 | 0.478 |
| Opportunity only | 51% | 67.7% | 5.36 | 0.463 |
| Context only | 52.2% | 67.8% | 5.37 | 0.457 |
| One ridge (no stack) | 52.1% | 67.8% | 5.32 | 0.461 |
| Stack | 52.6% | 68% | 5.34 | 0.47 |
| Stack + range | 52.8% | 68% | 5.34 | 0.465 |
| Stack, ranking head | 52.4% | 68% | 5.34 | 0.468 |
| Stack, ranking head, capped | 52.5% | 68% | 5.34 | 0.473 |

### 2024

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.7% | 67.2% | 5.48 | 0.443 |
| Projection | 51.9% | 67.1% | 5.49 | 0.44 |
| SHS (current) | 52.6% | 67.2% | 5.48 | 0.446 |
| Opportunity only | 51.6% | 67% | 5.5 | 0.441 |
| Context only | 52.2% | 67% | 5.53 | 0.444 |
| One ridge (no stack) | 52.3% | 67.1% | 5.49 | 0.446 |
| Stack | 51.9% | 67% | 5.51 | 0.442 |
| Stack + range | 51.6% | 66.9% | 5.51 | 0.44 |
| Stack, ranking head | 52% | 67.1% | 5.51 | 0.443 |
| Stack, ranking head, capped | 52% | 67.1% | 5.51 | 0.443 |

### 2025

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.6% | 67.4% | 5.44 | 0.44 |
| Projection | 52.4% | 67.4% | 5.43 | 0.439 |
| SHS (current) | 52.7% | 67.5% | 5.44 | 0.442 |
| Opportunity only | 50.8% | 67% | 5.47 | 0.424 |
| Context only | 52.4% | 67.4% | 5.47 | 0.439 |
| One ridge (no stack) | 51.6% | 67.2% | 5.43 | 0.436 |
| Stack | 51.8% | 67.3% | 5.44 | 0.436 |
| Stack + range | 51.5% | 67.3% | 5.44 | 0.436 |
| Stack, ranking head | 52.5% | 67.4% | 5.44 | 0.44 |
| Stack, ranking head, capped | 52.5% | 67.4% | 5.44 | 0.44 |

### 2026

| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |
|---|---|---|---|---|
| Experts | 52.2% | 67.8% | 5.41 | 0.452 |
| Projection | 52% | 67.6% | 5.4 | 0.451 |
| SHS (current) | 52.8% | 67.8% | 5.41 | 0.457 |
| Opportunity only | 50.9% | 67.4% | 5.46 | 0.438 |
| Context only | 51.9% | 67.7% | 5.45 | 0.455 |
| One ridge (no stack) | 51.7% | 67.7% | 5.41 | 0.453 |
| Stack | 52.5% | 67.7% | 5.43 | 0.452 |
| Stack + range | 52.1% | 67.7% | 5.43 | 0.452 |
| Stack, ranking head | 52.5% | 67.8% | 5.43 | 0.453 |
| Stack, ranking head, capped | 52.5% | 67.8% | 5.43 | 0.454 |

## What the final model trusts (trained on every season)

Meta weights per position: intercept, experts, projection, opportunity, context, early-season projection pull, small-sample usage pull.

- **QB**: -0.46 · 0.21 · 0.24 · 0.25 · 0.33 · 0.95 · 0.62; range nudge 0.05; ranking head 0.433 · 0.162 · 0.357 · 0.087 · 0.037 · 0.031; **used by the app**
- **RB**: -0.79 · 0.27 · 0.27 · 0.22 · 0.32 · -2.07 · -1.49; range nudge 0; ranking head 0.042 · -0.015 · 0.087 · 0.008 · -0.002 · -0.016; **not used (no out-of-sample edge); the app keeps the current formula**
- **WR**: -1.02 · 0.29 · 0.27 · 0.24 · 0.29 · -2.05 · -0.76; range nudge 0.1; ranking head 0.020 · -0.132 · 0.121 · 0.001 · -0.075 · -0.018; **not used (no out-of-sample edge); the app keeps the current formula**
- **TE**: -0.52 · 0.26 · 0.27 · 0.23 · 0.29 · 0.11 · 0.28; range nudge 0; ranking head 0.323 · 0.189 · 0.544 · 0.052 · -0.172 · -0.018; **not used (no out-of-sample edge); the app keeps the current formula**

Range nudges chosen per test season: QB 0, 0.2, 0, 0, 0; RB 0, 0, 0.05, 0, 0.05; WR 0.1, 0.1, 0.2, 0.1, 0; TE 0, 0, 0, 0, 0.

Not in the backtest: player prop betting lines (no free history; the live app blends them in when available) and weather.
