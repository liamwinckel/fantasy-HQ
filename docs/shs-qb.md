# SHS AI: quarterback inputs

Walk-forward, seasons 2023, 2024, 2025, 2026 (each predicted only from earlier seasons). Projection source: fantasypros. 5,122 QB close calls.

## Result

| | Close calls | All pairs | Rank corr. |
|---|---|---|---|
| Experts | 53.9% | 64.7% | 0.41 |
| v2 base | 54.6% | 64.9% | 0.414 |
| v2 + QB inputs (selected) | 54.8% | 64.8% | 0.415 |

Inputs chosen inside each training window: 2023: total; 2024: total, defOut, wind, pace, passD, oppPace; 2025: wind, pace, total; 2026: wind, defOut.

Final model (every season): **wind, rushPg, short, home**, **not used** (didn't beat the experts and base v2 out of sample by 0.2+).

## Each input on its own (added to v2 base)

| | Close calls | All pairs | Rank corr. |
|---|---|---|---|
| passD | 54.3% | 64.8% | 0.412 |
| rushD | 54.4% | 64.8% | 0.413 |
| rushPg | 54.8% | 64.9% | 0.414 |
| rushX | 54.7% | 64.9% | 0.414 |
| wrOut | 54.6% | 64.8% | 0.412 |
| olOut | 54.4% | 64.8% | 0.413 |
| ownDef | 54.5% | 64.9% | 0.415 |
| defOut | 54.6% | 64.8% | 0.413 |
| passRt | 54.9% | 64.9% | 0.413 |
| pace | 54.2% | 64.8% | 0.412 |
| oppPace | 54.5% | 64.8% | 0.413 |
| press | 54.4% | 64.8% | 0.413 |
| oppDbOut | 54.6% | 64.9% | 0.414 |
| total | 55.2% | 65% | 0.415 |
| trend | 53.9% | 64.7% | 0.411 |
| wind | 55.4% | 65% | 0.418 |
| short | 54.9% | 64.9% | 0.416 |
| home | 54.3% | 64.8% | 0.413 |
