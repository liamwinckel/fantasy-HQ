# SHS Fantasy HQ

Liam's fantasy football command centre for Sleeper, as a web app.

**Live:** https://liamwinckel.github.io/fantasy-hq/

Open it on your phone, then Share → **Add to Home Screen** for a full-screen app icon.
It runs entirely in your browser: no server, no accounts, no API keys, free to run.

## Tools (per league; pick the league at the top)

- **Dashboard**: built for the league's format (redraft: playoff path · keeper: keeper preview · dynasty: age profile, picks, future stars), plus this week, action queue, waiver targets, breakout watch and injuries.
- **Matchup**: head-to-head for any game in any week (◀ ▶), with both lineups, position edges and the scoreboard.
- **Lineup Optimizer**: current vs recommended lineup. **+** on a bench player asks which slot he goes into, **⇄** moves a starter, **−** benches him.
- **Trade Finder**: every team's needs and surpluses, and 1-for-1 / 2-for-1 / 1-for-2 deals that fit both builds.
- **Trade Analyzer**: **+ / −** to build the deal. Spectrum bar: you on the left (green), them on the right (red). Make-it-fair suggestions, power-ranking shifts, title odds.
- **Waiver Assistant**: the league's top projected free agents, your needs and this week's holes, and the net impact of each add (with a forced drop when your roster is full).
- **League Analyzer**: power rankings and positional heat map. Tap any team for its roster and stats.
- **Stats & Schedule**: strength of schedule (rest of season and playoffs), defense vs position, a sortable player stats table, and fantasy-team scoring (all-play record, luck).
- **Breakout Finder**: rookies, 2nd- and 3rd-year players with a real role who are healthy and projected to play.
- **Rookie Report**, **Keeper Planner** (keeper leagues), **How it's calculated**, **Settings**.
- **Player card**: tap any player, anywhere.

## Where the data comes from

| Data | Source | Refresh |
|---|---|---|
| Leagues, rosters, matchups, scoring | Sleeper API, straight from your browser | 5–60 min |
| Weekly projections | Sleeper's projected stat lines, scored with your league's settings | 2 h |
| Stats, snaps, schedule, contracts, injury reports | NFLverse, trimmed by a GitHub Action into `/data/*.json` | every 6 h |
| Player list (names, teams, ages) | Sleeper, trimmed by the same Action | every 6 h |

Browsers can't download NFLverse files directly (GitHub release files don't allow it), so the
**Deploy** workflow (`.github/workflows/deploy.yml`) downloads them, slims them down with
`scripts/build-data.ts`, builds the site and publishes it to GitHub Pages on every push and every 6 hours.

Settings (username, hidden leagues, keeper rules) are saved per device. Use **Settings → Copy settings code**
on one device and **Import** on another to carry them over.

## Models (short version; the full version is in the app)

- **Projections**: Sleeper's weekly projections scored in your league's scoring. The SHS model (recent form × usage × offense × matchup × availability) is the fallback.
- **Trade value (0–100)**: redraft = rest-of-season points above replacement, where replacement is the higher of the league's last starter at the position and the best free agent. That's what keeps one-slot, easy-to-stream positions (QB in 1QB, most TEs) from being overvalued. Dynasty = five-season surplus with age curves, contracts and durability.
- **Packages**: (Σ value^1.5)^(1/1.5), so four quarters ≠ a dollar (picks too).
- **Power score**: 45% lineup strength + 35% rest-of-season strength + 20% points per game.
- **Odds**: 4,000 simulated seasons on Sleeper's remaining schedule.

## Develop

```bash
npm install
npm run data      # download NFLverse + Sleeper player data into public/data
npm run dev       # http://localhost:3000
npm test          # needs the offline fixtures (see tests/fixtures)
```

Offline fixtures: put the NFLverse CSVs in `tests/fixtures/generated/nflverse`, then
`npx tsx tests/fixtures/build.ts && npx tsx tests/fixtures/projections.ts && npx tsx scripts/build-data.ts --fixtures tests/fixtures/generated/nflverse`.

Stack: Next.js (static export), React, TypeScript, Tailwind, Zod, Vitest. Everything else runs in the browser.

## Never

Fantasy HQ only reads from Sleeper. It never sends trades, claims or lineups, and never suggests trades between separate leagues.
