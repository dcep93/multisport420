# Native fantasy scoreboard

Install or reload the Multisport420 Chrome extension **0.3.0 or later** from
`extension/`. Reload your signed-in ESPN Fantasy football league tab and
Multisport420, select **NFL**, and add **Fantasy scoreboard**. The app renders
the scoreboard directly and uses its own extension. Fantasy420 is not required.

The extension selects an active/recent ESPN league tab. Optional Multisport URL
parameters `?leagueId=123&year=2026&mode=head-to-head` select a league/season and
initial mode. Keep that league open in another tab. Native ESPN Knockout leagues
and league 367176096 default to Guillotine; the Mode selector changes the display
without fetching again. Keep the existing `#Fantasy420Scoreboard` selection hash:
this historical identifier is retained for saved links and rooms only.

## Display and refresh

Matchups show names, actual points, projected final points in parentheses, and
win probability. Guillotine shows each team's elimination risk. Matchups sort
closest to 50/50 first; Guillotine sorts highest risk first. At most three teams
above 1% elimination risk triggers THUNDERDOME and hides teams below the threshold.
Missing scores/projections remain unavailable rather than being replaced by zero.

The strip fits the panel height, including a 110px panel. It scrolls horizontally
at 10% of the available scroll distance per second, pauses five seconds at the
start and 2.5 seconds at the end, then returns to the start. Hover, focus, manual
interaction and reduced-motion preferences pause automatic movement. Scroll down
inside the panel to reach league/week, Mode, Refresh and Pause/Resume controls.

There is one initial fetch, then a refresh every 30 seconds while mounted.
The title button, toolbar button and remote refresh use the same controller;
overlapping requests combine into one fetch. Closing the panel stops its timer.
An ordinary fetch failure keeps the last snapshot and displays a warning;
missing or outdated extension connections clear it and show reload instructions.

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
validates the origin, league and year, then asks an ESPN top-frame content script
to fetch the original league API with credentials and no cache. Endpoint URLs
are constructed inside the extension. League data stays in browser memory and
is not sent to developer servers. Existing video-player scripts are unchanged.

From `app`, run `npm test` and `npm run build`. From the repository root run
`node --test extension/*.test.cjs`. The browser check is
`cd app && npx playwright test tests/browser/scoreboard.spec.ts --timeout=60000`.
It loads the real unpacked Multisport extension in isolated Chromium and serves
deterministic ESPN fixture responses, checking the full messaging path, native
rendering, compact layout, controls, and automatic refresh. This does not verify
the user's live ESPN login. The app's existing remote browser suite separately
requires its Firebase emulator.
