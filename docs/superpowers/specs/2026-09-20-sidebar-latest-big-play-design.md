# Latest big play in the sidebar log

The user requests moving big-play detail out of the blue title banner and always
rendering the latest big play below the sidebar's teams.

Derive the newest qualifying football play from the displayed log's chronological
plays using the existing getBigPlay rules. Render a compact Latest big play block
immediately after the team summaries, containing only its game clock (for example, Q1 4:22), with no label, team or description.
Use the displayed snapshot so the block follows log delay and refresh behavior.
It persists beyond the five-second warning, loads historical big plays on initial
view, updates to newer qualifying plays, and drops nullified/corrected plays.
Hide the block when none qualify or for nonfootball leagues.

Keep the existing blue alert timing and football icon, but remove the banner
clock prop and unused alert-clock state. This computes a summary from log data
instead of maintaining a separate persistent cache that could become stale.

Verify banner clock removal, placement, persistence through ordinary plays,
replacement by newer big plays, nullification and empty/nonfootball cases.
Run app tests, build, changed-file lint and a browser layout check; commit/push
main and check deployment. Existing unrelated scoreboard lint failures remain
outside this change.

Self-review: the brief alert and persistent log summary are independent. No new
API calls or polling changes are required, and refresh/delay behavior is retained.

## Verification

159 app tests pass, including persistent history, newer play replacement,
nullification, completed games and nonfootball/empty logs. Production build and
changed-file lint pass. Browser verification uses the existing indicators fixture
and confirms the block's position below teams, no horizontal overflow, no clock
in the blue banner, and persistence after the actual alert expires. The sidebar
screenshot was visually inspected at 320px width.


## User clarification

Only the latest big play's game clock should appear below the teams. Removed the
label, team name and play description. Exact-text assertions cover this content
restriction while retaining the existing persistence and placement checks.
