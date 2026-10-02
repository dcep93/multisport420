# Fantasy scoreboard detail

Approved with `yesi` on October 1, 2026.

## Presentation

Use the actual spotlight state, not a width guess. Minimized matchups keep the
horizontal scrolling strip but each card has five vertical rows: team A name,
score A (projection), team A win probability, score B (projection), team B name.
Smaller height-relative text must fit a 110px panel. Byes and Guillotine retain
their single-team summary and existing ordering/probability behavior.

Spotlight keeps paired teams horizontal. Below each team's summary, show its
entire roster one player per row with name, position/slot, actual score and
projection. Hide projections only for explicitly completed games; lineup locks
alone do not imply completion. Label bench and IR. Preserve existing projected
lineup optimization for league 203836968/team 6 and league 367176096/team 1,
and distinguish optimized selections from ESPN starter/bench assignments.
Actual team scores remain ESPN scores; bench points are not added to them.

A spotlight sidebar contains the top five weekly scorers at each position and
the top five unowned players across positions, sorted by actual weekly points.
Each row shows week points (season points), using the league's scoring settings.
Unowned means not on any league roster (including bench, IR and eliminated
teams), and ESPN ownership metadata must also identify the player as unowned.
On narrow panels the sidebar sits below matchups, with independent vertical
scrolling available for long rosters and ranking lists.

## Data and reliability

Extend the existing authenticated ESPN extension bridge with league player-card
data and professional game schedules. Construct endpoints in the extension and
bound requests. Fetch the complete paginated pool rather than ranking only a
default ESPN page. Keep refresh coalescing and the existing 30-second cadence.
Optional detail failures must preserve the core scoreboard and show an honest
detail warning. Missing scores remain unavailable, never invented zeros.

## Verification and delivery

Add parsing tests for zero/missing scores, current-season stats, completed versus
locked games, bench/IR, optimized selections, season totals, sorting, and ownership.
Exercise extension request validation, pagination and optional failures. Browser
fixtures verify the real bridge, minimized 110px geometry, horizontal spotlight
teams, complete player rows and leaderboard layout. Run app tests, extension
tests, production build and the targeted browser test. Commit and push main.

## Self-review

All requested behavior is covered. Weekly rankings are league-wide (owned and
unowned); the additional unowned list is league-specific. Player details appear
only in spotlight, preserving the explicitly requested five-row compact layout.
No unresolved approval checkpoints or product decisions remain.
