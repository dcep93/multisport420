# Native fantasy scoreboard

Install or reload the Multisport420 Chrome extension **0.3.5 or later** from
`extension/`. Reload your signed-in ESPN Fantasy football league tab and
Multisport420, select **NFL**, and add **Fantasy scoreboard**. The app renders
the scoreboard directly and uses its own extension. Fantasy420 is not required.

The extension selects an active/recent ESPN league tab. Optional Multisport URL
parameters `?leagueId=123&year=2026&mode=head-to-head` select a league/season and
initial mode. If no matching tab is open, the extension loads the most recently
opened real league in a hidden offscreen iframe. Open the league once after
installing/updating to seed this preference. The last league ID, season and visit
time persist in extension-local storage; automatic iframe loads do not replace
them. Existing tabs take priority. The frame is reused across refreshes and
closes after a minute without requests. An explicit league override must match
an open or remembered league. Native ESPN Knockout leagues
and league 367176096 default to Guillotine; the Mode selector changes the display
without fetching again. Keep the existing `#Fantasy420Scoreboard` selection hash:
this historical identifier is retained for saved links and rooms only.

## Display and refresh

Matchups show names, actual points, projected final points in parentheses, and
win probability. In expanded head-to-head matchups, the favorite's percentage
is replaced by one 👑 per consecutive fantasy win they **would have if they won
this week**. The underdog's percentage
is replaced by one 🫘 per consecutive fantasy loss they **would have if they
lost this week**: their streak entering the week plus one. Wins and ties break
the streak, and byes do not add losses. The current matchup is not counted twice.
Guillotine shows each team's elimination risk. Matchups sort
closest to 50/50 first; Guillotine sorts highest risk first. At most three teams
above 1% elimination risk triggers THUNDERDOME and hides teams below the threshold.
Missing scores/projections remain unavailable rather than being replaced by zero.

When minimized, each paired matchup uses five vertical rows: the first team's
name, score (projection), its win probability, the second team's score
(projection), and the second team's name. Smaller text fits a 110px panel.
Matchups continue to scroll horizontally.

When spotlighted, each team's current W–L record appears to the right of its name when ESPN provides it. Both team icons sit together in the center of the matchup header, separated by a small “vs”; unavailable images fall back to team initials. Paired teams appear side by side with a shared roster table:
**score A (projection), player A, position, player B, score B (projection)**.
Players align by lineup slot; repeated slots get separate rows. Bench and IR
players align by position and remain labeled. Unequal rosters retain every
player with an empty opposing side. Single teams retain their full roster list.
Completed NFL games omit player projections; a locked lineup alone
does not indicate a completed game. The special optimized projection described
below still accounts for eligible players currently on the bench.
Team actual scores remain ESPN's totals and do not include bench points.

Player highlights follow their NFL team's live game: grey while playing,
yellow with possession, and pink with possession in the red zone. Each player's
half of the shared row is colored independently; the same highlights appear in
single-team rosters and leaderboards. Scheduled and completed games have no
highlight. Possession colors clear at halftime. Public NFL status refreshes
every 15 seconds with an eight-second timeout; failed polls clear old colors
and display a status notice. This needs no additional extension update.

The spotlight sidebar shows the week's top five scorers at every position plus
the top five unowned players across positions, with **week score (season score)**
using the league's scoring settings. Rankings use actual weekly points, not
projections. Unowned players must have ESPN's unowned status and be absent from
all league rosters, including bench, IR and eliminated teams. Long rosters and
rankings scroll vertically. The expanded view uses a full-width matchup card,
mirrored team summaries, and a shared table with subtle bench separation.
Matchup backgrounds have a symmetric gradient, with the same dark center and
60% higher perceptual lightness at both edges.
At widths of 800px or less, the leaderboard moves
below the matchups.

The strip scrolls horizontally
at 10% of the available scroll distance per second, pauses five seconds at the
start and 2.5 seconds at the end, then returns to the start. Hover, focus, manual
interaction and reduced-motion preferences pause automatic movement. Scroll down
inside the panel to reach league/week, Mode, Refresh and Pause/Resume controls.

There is one initial refresh, then a refresh every 30 seconds while mounted.
The title button, toolbar button and remote refresh use the same controller;
overlapping requests combine into one refresh. Each refresh fetches the league
scoreboard, a paginated complete league-scored player pool, and NFL schedules.
Closing the panel stops its timer.
An ordinary fetch failure keeps the last snapshot and displays a warning;
missing or outdated extension connections clear it and show reload instructions.
Optional player-pool or NFL-schedule failures retain the core scoreboard and
show a detail warning. An incomplete pool never supplies purported league-wide
rankings. Older extensions can still show team scores, but need reloading after
the update for player leaders and completion-aware projections.

## Calculations and provenance

Ported from Fantasy420's scoreboard at commit `0052b08d`, including its existing
regression tests. All calculation modules live in `app/src/app_x/scoreboard`.
There are no imports, network requests or frames pointing to Fantasy420.

Actual scores use ESPN `totalPointsLive`; projections use
`totalProjectedPointsLive`. Both home/away schedules and native Knockout team
arrays are supported, including byes and previously eliminated teams.

For league **203836968/team 6** and **367176096/team 1**, the projected lineup
optimizer maximizes the unlocked starting lineup from the current roster using
ESPN weekly projections and legal lineup slots. Locked starters stay in place,
locked bench players remain benched, and IR players are excluded. The displayed
projection adjusts ESPN's live baseline by the change in unlocked starters.
Incomplete metadata preserves ESPN's projection. Selected starters or a fallback
reason are logged with the `[Multisport420] Projected roster` prefix. This does
not change your actual ESPN lineup.

The probability models are the existing custom NFLStream-derived estimates,
not ESPN win odds. For each team, `r = max(0, projected - actual)` and
`u = r + min(r, 5)`. Head-to-head odds use the normal CDF of the projected-score
difference divided by `8 * sqrt((uA + uB) / 12)`. Zero uncertainty gives 100%,
0%, or 50% for a tie. Guillotine integrates independent normal final scores with
mean equal to the projection and sigma `max(0.01, 8 * sqrt(u / 12))`, excluding
nonpositive projections and withholding probabilities when required data is absent.

## Extension and verification

The site sends a bounded scoreboard request to its extension. The service worker
validates the origin, league and year, then asks the selected ESPN tab or hidden
frame content script to fetch the league scoreboard, `kona_playercard` pages and
`proTeamSchedules_wl` with credentials and no cache. Player pagination has a
20-page ceiling of 500 players per page, and all requests share a 12-second
deadline. The logical refresh counter still counts one refresh. Endpoint URLs
are constructed inside the extension. Custom ESPN team logos are also fetched
with the ESPN session and passed as inline images so authenticated logos work
on Multisport420. Only the last league ID, season and visit time persist. League
responses and image data stay in browser memory and
is not sent to developer servers. Existing video-player scripts are unchanged.

From `app`, run `npm test` and `npm run build`. From the repository root run
`node --test extension/*.test.cjs`. The browser check is
`cd app && npx playwright test tests/browser/scoreboard.spec.ts --timeout=60000`.
It loads the real unpacked Multisport extension in isolated Chromium and serves
deterministic ESPN fixture responses, checking the full messaging path, native
rendering, compact layout, controls, and automatic refresh. This does not verify
the user's live ESPN login. The app's existing remote browser suite separately
requires its Firebase emulator.

The closed-tab fallback is covered by `tests/browser/scoreboard-background.spec.ts`,
including remembered-league selection, reuse, concurrent requests, idle cleanup,
and the narrow iframe header rule. Set `ESPN_LIVE_FRAME=1` for an optional smoke
check against the real ESPN page (score API responses remain fixtures).
