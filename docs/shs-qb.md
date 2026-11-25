# SHS AI: quarterback inputs

Walk-forward, seasons 2023, 2024, 2025, 2026 (each predicted only from earlier seasons). Projection source: sleeper. 5,122 QB close calls.

## Result

| | Close calls | All pairs | Rank corr. |
|---|---|---|---|
| Experts | 53.9% | 64.7% | 0.41 |
| v2 base | 54.3% | 64.7% | 0.411 |
| v2 + QB inputs (selected) | 54.1% | 64.7% | 0.411 |

Inputs chosen inside each training window: 2023: press, trend, defOut; 2024: wind, defOut, total, passRt; 2025: wind, total; 2026: wind.

Final model (every season): **wind**, **live trial** (picked by hand after these results; judged by the live track record).

## Each input on its own (added to v2 base)

| | Close calls | All pairs | Rank corr. |
|---|---|---|---|
| passD | 54.2% | 64.7% | 0.411 |
| rushD | 54.1% | 64.6% | 0.41 |
| rushPg | 54.2% | 64.7% | 0.41 |
| rushX | 54.1% | 64.7% | 0.41 |
| wrOut | 54.1% | 64.6% | 0.408 |
| olOut | 54.4% | 64.8% | 0.411 |
| ownDef | 54.5% | 64.7% | 0.411 |
| defOut | 54.6% | 64.8% | 0.412 |
| passRt | 54.3% | 64.7% | 0.41 |
| pace | 54.2% | 64.7% | 0.411 |
| oppPace | 54.4% | 64.7% | 0.41 |
| press | 53.9% | 64.6% | 0.41 |
| oppDbOut | 54.3% | 64.7% | 0.411 |
| total | 54.3% | 64.7% | 0.41 |
| trend | 54.2% | 64.7% | 0.411 |
| wind | 54.9% | 64.9% | 0.416 |
| short | 54.5% | 64.8% | 0.414 |
| home | 54% | 64.7% | 0.411 |
