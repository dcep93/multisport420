# RedZone live play-by-play

Approved by the user with `yesi` on 2026-11-22, including the corrections below.

When NFL RedZone is the selected spotlight stream and logs are visible, its log is a single feed of plays from every active NFL game, whether or not that game's stream is loaded. Discover games from ESPN's NFL scoreboard and fetch their summaries immediately, then poll every 10 seconds. Active includes halftime, but excludes scheduled and completed games. Stop polling when the RedZone panel is not visible.

Use a dedicated feed instead of the existing single-game log pipeline. Bypass the configured log delay entirely and publish each game's successful response immediately. ESPN's own publication/network latency still applies. Do not wait for all games before showing a completed request. Avoid overlapping polls; abort outstanding requests on cleanup and bound request duration so a stalled game cannot stop polling.

Merge previous and current drive plays, deduplicate by game ID plus play ID, and sort globally by actual play wallclock descending with deterministic ties. Corrected plays replace earlier versions. Keep text-bearing plays including penalties and administrative plays. Plays without a valid timestamp remain present at the end with stable ordering; never invent wallclock values from fetch time. Remove games when a successful scoreboard response says they are no longer active. Preserve a game's last good data through a temporary failure while continuing other games and retrying.

Each entry contains only the play description and a second line joining down/distance/field position and quarter/clock with ` - `. There are no matchup labels, drive headings, stats, or box scores. Example:

> (Shotgun) J.Allen pass short left to D.Moore to MIA 28 for 20 yards (J.Rodriguez).
> 1st & 10 at MIA 48 - Q2 0:00

The panel supports manual wheel, touch, and keyboard scrolling. No autoscroller or automatic scroll-to-top is used. New plays appear at the top; preserve the visible reading position when a user has scrolled into older entries. At the top, show new entries immediately. Use stable row identities and scroll anchoring as needed.

Recognize RedZone independently of an ESPN event ID, using its stream title/slug and NFL context without confusing a normal game's red-zone possession indicator. Preserve ordinary stream log behavior and existing targeted refresh controls. Provide concise loading, no-active-games, and unavailable states; partial failures must not hide successful play data.

Verify with focused parser/polling/integration tests and a browser fixture covering live updates, manual scrolling, no autoscroll, no labels, and delay bypass. Run the existing unit suite, lint, and production build. Commit only task-owned files and push main; preserve the unrelated extension screenshot change.

Self-review: the user's correction supersedes clipping; manual scrolling is required. All display, ordering, lifecycle, failure, and verification requirements are explicit. No outstanding design decisions.
