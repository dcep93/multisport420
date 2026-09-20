# Live big-play clock in the spotlight banner

User-directed revision: remove the standalone big-play timestamp from the log;
show only the game clock in the spotlight banner, sourced from the newest
accepted ESPN snapshot with no configured log delay.

Keep latestBigPlayClock separate from displayedLog and the temporary warning.
Find the newest qualifying football play from full chronological history on each
accepted fetch. Clear/fall back on corrections; keep it after ordinary plays and
warning expiry. Existing sequence/epoch/timestamp checks reject stale responses.
Delayed log publication must preserve the latest live clock rather than overwrite
it. Nonfootball/unsupported games have no clock. Switching games clears old data.

Pass the clock only to the focused ScreenTitleBar. Render a fixed clock span
beside the fixed hotkey so long titles cannot scroll it away. Display only the
clock, with no extra label/team/description. Existing title colors, alert timing,
log delay and audio controls remain unchanged. The existing ten-second fetch
cadence still applies; no added application delay is applied to the clock.

Verify immediate publication before delayed log/alert, persistence, latest-play
selection and correction, stale-response/delayed-publication protection, spotlight
switching, absent sidebar/secondary clock, and long-title layout. Run app tests,
build, changed-file lint and the browser fixture; commit/push main and deploy.

Self-review: live timestamp and delayed log are independent state. No extension
update, polling increase or changes to blue/red banner precedence are required.
