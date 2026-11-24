import { Card, PageHeader, Tag } from "@/components/ui";
import { STRATEGY_WEIGHTS } from "@/lib/engine/classify";
import { FLEX_SHARES } from "@/lib/engine/positions";

export default function Methodology() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Transparency" title="How it's calculated" />
      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        Every number in Fantasy HQ is tagged by where it came from: <Tag kind="ACTUAL" /> real results, <Tag kind="SLEEPER" /> straight from Sleeper,
        <Tag kind="MODEL" className="mx-1" /> calculated by the SHS model in your browser, and <Tag kind="ESTIMATE" /> rough estimates.
        Weekly projections come from Sleeper; values, rankings and trade logic are the SHS model. No paid data.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Data sources">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Sleeper API</b>: your leagues, rosters, lineups, matchups, standings, scoring rules, traded picks, transactions, injuries. Each player&apos;s weekly points come straight from Sleeper&apos;s league-scored results whenever he was on any roster that week.</li>
            <li><b>NFLverse</b>: weekly player stats (targets, carries, attempts), snap counts, NFL schedule and draft info. Used for usage trends, matchups, byes, and to score weeks a player wasn&apos;t rostered, using your league&apos;s scoring rules.</li>
            <li>Players are matched across sources by NFL GSIS ID, which Sleeper includes for most players.</li>
            <li><b>Sleeper projections</b>: Sleeper&apos;s own weekly projected stat lines (the same ones the Sleeper app shows), scored with your league&apos;s exact scoring settings.</li>
            <li>Everything is cached on your device. Sleeper league data refreshes every 5–60 min and projections every 2 hours. A GitHub job rebuilds the NFLverse files and Sleeper&apos;s player list every 6 hours.</li>
          </ul>
        </Card>

        <Card title="Weekly projection">
          <p className="text-sm leading-relaxed"><b>Sleeper&apos;s projection, scored your way.</b> For this week and every week through your fantasy final, Fantasy HQ downloads Sleeper&apos;s projected stat line for each player (passing yards, receptions, field goals, sacks…) and multiplies it by your league&apos;s scoring settings, including TE premium, first downs and bonuses.</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>A player Sleeper doesn&apos;t list for a week (injured, inactive, bye) is projected at 0 that week.</li>
            <li><b>Healthy points per game</b> (used for value) = 65% Sleeper&apos;s rest-of-season rate + 35% his actual production this season.</li>
            <li><b>Range:</b> low/high ≈ 20th/80th percentile, from the player&apos;s own week-to-week spread around Sleeper&apos;s number.</li>
            <li><b>Fallback:</b> if Sleeper&apos;s projections can&apos;t load, the SHS model takes over: recent and season averages in your scoring × usage trend × team offense (±6%) × matchup (±15%) × injury availability.</li>
          </ul>
        </Card>

        <Card title="Trade value (redraft)">
          <p className="text-sm leading-relaxed"><b>Trade value</b> is a 0–100 score: 100 = the most valuable player in that league. It isn&apos;t a points total or a points-per-game rank.</p>
          <p className="mt-2 text-sm leading-relaxed">Redraft value = rest-of-season points <b>above replacement</b>: for each remaining week through your fantasy final, max(0, projection − replacement level). Fantasy playoff weeks count ×1.4. Age is ignored.</p>
          <p className="mt-2 text-sm leading-relaxed"><b>Replacement level</b> = whichever is higher:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
            <li>the last starter the league needs at the position: teams × starters, with flex slots split as {Object.entries(FLEX_SHARES).map(([k, v]) => `${k} ${Object.entries(v).map(([p, sh]) => `${p} ${Math.round(sh * 100)}%`).join("/")}`).join("; ")};</li>
            <li>or what&apos;s on your waiver wire right now (95% of the second-best healthy free agent).</li>
          </ul>
          <p className="mt-2 text-sm leading-relaxed">This is positional scarcity: in a 1-QB league, QB12 and the best free-agent QB score close to QB5, so a mid-range starting QB is worth far less than a top-12 WR, who fills one of several WR/flex spots that are hard to replace. TEs outside the top few behave the same way.</p>
        </Card>

        <Card title="Dynasty value">
          <p className="text-sm leading-relaxed">Five-season surplus over replacement: healthy points-per-game surplus, projected forward along a position-specific age curve (e.g. RBs peak 22–25, WRs 24–28, QBs 27–33), discounted 15% per year, × 17 games. Scaled so the league&apos;s top asset = 100.</p>
          <p className="mt-2 text-sm leading-relaxed">Split into <b>now</b> (this season) and <b>future</b> (seasons 2–5) so team strategy can weight them. Rookies with few games lean on a draft-capital prior (round 1 ≈ 110% of replacement, round 2 95%, round 3 85%, later 65%).</p>
        </Card>

        <Card title="Draft picks">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>Base share of the top asset: R1 early 42% / mid 32% / late 24%; R2 14/11/8%; R3 5/4/3%; R4+ 2%.</li>
            <li>Superflex 1st-rounders ×1.12. League size adjustment (12 ÷ teams)^0.25.</li>
            <li>Next year&apos;s slot is <i>estimated</i> from simulated final standings; later years default to &quot;mid&quot;. You can set early/mid/late manually in the Trade Analyzer.</li>
            <li>Years out: ×1.0 next draft, ×0.9, ×0.82. Rookie class strength is not modelled (no reliable free data).</li>
            <li>In Redraft and Keeper valuation, future picks are worth 0.</li>
          </ul>
        </Card>

        <Card title="Power rankings">
          <p className="text-sm leading-relaxed"><b>Power score = 45% lineup strength + 35% rest-of-season strength + 20% points per game</b>, each measured as a share of the league&apos;s best team on that measure.</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Lineup strength:</b> projected points of the best healthy starting lineup.</li>
            <li><b>Rest of season:</b> average projected best lineup over the remaining weeks, with byes and injuries.</li>
            <li><b>Points per game:</b> actual scoring so far. Trades don&apos;t change this part.</li>
            <li><b>Position ranks:</b> projected points each position contributes to the best lineup (flex players count toward their own position). <b>Depth</b> = best three bench players.</li>
            <li>Strengths and weaknesses = positions in the league&apos;s top or bottom quarter.</li>
          </ul>
        </Card>

        <Card title="Waiver Assistant">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Pool:</b> the top 60 free agents by Sleeper projection (rest-of-season rate + this week). Out, IR, PUP, suspended and players with no projected points left are excluded.</li>
            <li><b>Needs:</b> positions where your best lineup ranks in the bottom half of the league, plus this week&apos;s holes (starters on bye, injured or projected for nothing).</li>
            <li><b>Score:</b> 45% lineup gain this week + 55% average weekly lineup gain through your fantasy final, plus a bonus when he fills a need or hole. Dynasty leagues also weigh trade value.</li>
            <li><b>Full roster:</b> the suggested drop (your lowest-value player outside your best lineups) comes off first, so every gain is net of losing him.</li>
            <li>FAAB bids aren&apos;t estimated (no reliable free data).</li>
          </ul>
        </Card>

        <Card title="Trades: who wins and how to make it fair">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>What goes into each player (Redraft):</b> production (season and last 4 games), rest-of-season projection, opportunity trend, team offense, schedule ahead (incl. playoffs) and injury status. Shown as chips on every trade.</li>
            <li><b>Dynasty adds:</b> age curve, contract (expiring deals for players 26+ ×0.95, 2+ years left ×1.02) and durability from games played and official injury reports (under 60% of games ×0.88, under 80% ×0.94). Rookie picks use the pick model.</li>
            <li><b>Four quarters ≠ a dollar:</b> each side&apos;s package value = (Σ value^1.5)^(1/1.5). One 80 stays 80, four 20s ≈ 50, 50 + 40 ≈ 72. The same applies to picks.</li>
            <li><b>Roster spots:</b> taking back more players than you send means cutting your lowest-value players; their value is subtracted. Freeing spots credits half the value of the best free agents.</li>
            <li><b>Spectrum bar:</b> Redraft blends value gained (50%) with each side&apos;s rest-of-season lineup gain (50%). Dynasty uses each team&apos;s strategy-adjusted value.</li>
            <li><b>Make it fair:</b> when the value gap is more than about 8%, it looks for one asset from the side getting the better deal (non-starters preferred) worth roughly the gap, or one to remove from the side that&apos;s overpaying.</li>
            <li><b>Power shift:</b> every team&apos;s power score and rank is recalculated with both new rosters, plus each side&apos;s positional ranks.</li>
          </ul>
        </Card>

        <Card title="Trade Finder">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Needs</b> = positions where a team ranks in the bottom half; <b>can spare</b> = top third, or a bench player good enough to start for most teams.</li>
            <li>Builds 1-for-1, 2-for-1 and 1-for-2 deals that move your surplus to their need and theirs to yours. In dynasty, a pick can even out the value.</li>
            <li><b>Redraft</b> keeps deals that raise your best lineups through the fantasy final, cost them under ~6 points, and stay within a fair value band.</li>
            <li><b>Dynasty</b> keeps deals where both sides gain strategy-adjusted value. Contenders won&apos;t give up more than ~10 points this season.</li>
            <li>Only deals the other manager would plausibly accept (judged by market value with a premium for giving up the best player), ranked by your gain, their gain and acceptance chance; at most two per partner.</li>
          </ul>
        </Card>

        <Card title="Breakout Finder">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Who&apos;s eligible:</b> rookies, second- and third-year players only, who are healthy (not Out/Doubtful/IR/PUP/suspended), projected to play this week, and have a real role (Sleeper rest-of-season projection of at least QB 12 / RB 6 / WR 6 / TE 4.5 pts per game, or a 50%+ snap share). Players already top-5 (QB/TE) or top-10 (RB/WR) are excluded.</li>
            <li><b>Score:</b> 20% share of team volume, 15% efficiency (points per opportunity), 15% opportunity trend, 10% snap trend, 15% Sleeper outlook (projected rate vs his average so far), 15% draft capital, 10% age for his class.</li>
          </ul>
        </Card>

        <Card title="Start / Sit, Waiver planner, Mock draft, Ask SHS, News">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Start / Sit:</b> each player&apos;s week is a gamma-shaped range around his projection (his own swings shrunk toward his position&apos;s, betting lines when posted); 20,000 simulated weeks count how often each scores the most.</li>
            <li><b>Waiver planner:</b> your best lineup is rebuilt for each of the next four weeks (byes, injuries, matchups) and every top free agent is tried in it; the gain per week shows when to add him. Injured players good enough to start when healthy are flagged as stashes.</li>
            <li><b>Mock draft:</b> your league&apos;s rounds, roster spots and order (keeper drafts: keepers placed in their cost picks and traded picks applied; rookie drafts: next season&apos;s rookie picks and owners). Computer teams pick near expert ADP with randomness, fill starters, and leave K/DEF late. Grades: best starting lineup (redraft/keeper) or total value (dynasty).</li>
            <li><b>Ask SHS:</b> recognises the question type and the players named, then runs the same tools as the rest of the app. No AI service; nothing leaves your device.</li>
            <li><b>News:</b> every data refresh compares Sleeper&apos;s player database with the previous one (injury designations, IR, team changes, depth-chart starters) and adds the most-added players and your league&apos;s transactions.</li>
          </ul>
        </Card>

        <Card title="Rookie Report">
          <p className="text-sm leading-relaxed">This season&apos;s rookies (first NFL season this year). Draft-capital-first model, scored within each position: 35% draft capital (overall pick, steep at the top) · 25% role (snap share; QBs: share of team dropbacks) · 25% opportunity &amp; production (expected points from touches and targets, plus points per game) · 10% age · 5% landing spot. Grade A 70+, B 50+, C 30+. College prospects arrive once NFLverse publishes combine and draft data.</p>
        </Card>

        <Card title="Waiver impact">
          <p className="text-sm leading-relaxed">Adding a player is checked against your active roster limit (bench included, IR/taxi excluded). If you&apos;re full, you must pick a drop, and the impact (this week, rest of season, power score and positional ranks) includes losing that player.</p>
        </Card>

        <Card title="Keeper Planner (keeper leagues)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Cost</b> = this season&apos;s draft round ± your modifier (same, +1, +2, +3; &quot;+&quot; moves the cost earlier by default, configurable). Undrafted players cost the round you set (default: last). Any player can be given a custom round.</li>
            <li><b>Keeper value</b> = next season&apos;s projected points per game above replacement (healthy base × age curve one year on × durability).</li>
            <li><b>Round value</b> = the next-season value of the player you&apos;d typically get with that pick: every player ranked by next-season value, taking the middle of the round.</li>
            <li><b>KEEP</b> = the best N by surplus (keeper value − round value), where N is your keeper limit.</li>
          </ul>
        </Card>

        <Card title="Team classification (dynasty only)">
          <p className="text-sm leading-relaxed">Used only in dynasty leagues, where a team&apos;s long-term plan changes what assets are worth. Redraft leagues don&apos;t use these labels. Each team gets a score for Contender, Pretender, Rebuilder and Tanking from league-relative percentiles of: projected lineup strength, record, points for, record vs all-play record (luck), playoff and title odds, dependence on two players, roster age, future share of value and pick capital. Highest score wins. Confidence is its share across the four.</p>
          <p className="mt-2 text-sm leading-relaxed"><b>Tanking</b> only uses observable evidence: starting lineups clearly weaker (by season average) than available bench players in 3+ of the last 6 weeks, and trades selling veterans for picks/youth. It never claims to know intent. Manual overrides are stored next to the automatic result.</p>
        </Card>

        <Card title="Strategic value (dynasty trades)">
          <p className="text-sm leading-relaxed">Market value never changes. Strategic value re-weights it for each team:</p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-1">Class</th><th>This season</th><th>Future</th><th>Picks</th><th>Age 28+</th></tr></thead>
            <tbody>
              {Object.entries(STRATEGY_WEIGHTS).map(([k, w]) => (
                <tr key={k} className="border-t border-line"><td className="py-1.5 font-semibold">{k}</td><td className="num">×{w.now}</td><td className="num">×{w.future}</td><td className="num">×{w.picks}</td><td className="num">×{w.vetPenalty}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Rankings & SHS AI">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>ECR</b>: FantasyPros expert consensus rankings (weekly, rest of season, dynasty), published openly by DynastyProcess and refreshed by the site every 6 hours. This is the default order.</li>
            <li><b>Pts</b>: Sleeper&apos;s projected stat lines scored with your league&apos;s settings.</li>
            <li><b>SHS AI</b> = 75% ECR + 25% SHS factors by default. Weekly, when a player has prediction-market lines: 50% ECR + 30% markets + 20% factors. Each factor scores −1 to +1 against players ranked near him at his position; the result moves his rating by up to the non-expert share (shown as ±%). All weights are adjustable in Settings.</li>
            <li><b>Prediction markets:</b> Kalshi and Polymarket per-game player lines (e.g. &quot;30+ receiving yards&quot; at 63%) are fitted to an expected stat line for each player and scored in your league&apos;s scoring. Refreshed hourly on game days.</li>
            <li><b>All league types:</b> points per game, snap share (last 3), opportunity share and efficiency percentiles, usage trend, expected fantasy points from his opportunities (ffopportunity model; over-performers are expected to cool, under-performers to bounce back), Next Gen Stats tracking (separation, YAC over expected, rush yards over expected, CPOE), PFR charting (yards after contact, broken tackles, drops, rating when targeted, bad throws, pressure), and the projection vs the projection at his expert rank.</li>
            <li><b>Weekly:</b> weather at kickoff from Open-Meteo, injuries and practice participation (DNP / limited / full; his QB or a teammate ahead of him out), defensive matchup, Vegas implied team total, game script from the spread (favourites run more, underdogs pass more).</li>
            <li><b>Rest of season:</b> schedule ahead (incl. fantasy playoffs) and injury outlook.</li>
            <li><b>Dynasty:</b> age cliff (RB ~27, WR/TE ~30, QB ~34), team situation & outlook (offense rank and trend), coaching (same head coach as last season vs a new one, plus the offense&apos;s trend), usage (snaps and share of team looks), combine & draft profile (draft round plus speed score from the NFL Combine; counts less for veterans).</li>
            <li><b>College production (optional):</b> with a free collegefootballdata.com key, young RBs/WRs/TEs get a factor for their share of their college team&apos;s yards and TDs in their final season.</li>
            <li><b>Accuracy & auto-tune:</b> each week&apos;s rankings are saved on your device before kickoff and graded afterwards (how often each ranking put the higher scorer first in every same-position pair). After 3 graded weeks, factors that predicted beating or missing the expert rank get up to 1.5× weight; weak ones down to 0.5×.</li>
            <li>Data: Sleeper, NFLverse (stats, snaps, schedule, coaches, Vegas lines, combine, injuries/practice, Next Gen Stats, PFR advanced), ffopportunity, DynastyProcess / FantasyPros, Kalshi, Polymarket, Open-Meteo, optional CFBD.</li>
          </ul>
        </Card>

        <Card title="Stats & schedule">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Defense vs position:</b> fantasy points each NFL defense has allowed per game to QB/RB/WR/TE/K/DEF this season, in your league&apos;s scoring. Factor = allowed ÷ league average.</li>
            <li><b>Strength of schedule:</b> the average factor of a team&apos;s remaining opponents (rest of season, and fantasy playoff weeks separately). Rank 1 = easiest.</li>
            <li><b>All-play record:</b> your record if you played every team every week. <b>Luck</b> = actual wins − all-play expected wins.</li>
          </ul>
        </Card>

        <Card title="Simulations & lineups">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li><b>Best lineup:</b> fills the most restrictive slots first (QB, RB… then FLEX, then SUPER_FLEX) with the best eligible projected player. Supports K, DEF, IDP and custom flex slots. Players whose games have started stay put.</li>
            <li><b>Win %:</b> normal approximation of both lineups&apos; projected totals and spreads. During games, finished players count their actual points.</li>
            <li><b>Playoff/title odds:</b> 4,000 simulated seasons over Sleeper&apos;s real remaining schedule. Ties broken by points for. Divisions aren&apos;t modelled yet.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
