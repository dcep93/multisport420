# Scoreboard-only delay bypass

Approved with `yesi` on October 27, 2026.

When no non-scoreboard streams are open, the fantasy scoreboard must display
received data immediately. Closing the last video must release the latest
snapshot immediately and cancel pending delayed snapshots. Opening a video
restores the configured delay without changing the user's delay setting.

Derive the effective delay in Multiscreen from its current streams using the
existing isFantasyScoreboard predicate. Pass zero to its cards when there are
no video streams; otherwise pass the configured logDelayMs. The same current
streams already drive local and remote layouts, so this covers both.

Keep useDelayedScoreboard's existing queue, polling and error behavior. Its
zero-delay path returns the current snapshot and clears old timers. Restoring
a positive delay starts a fresh wait. Focus, mute and layout do not determine
whether a video is open.

Alternatives considered: mutating the delay setting would lose user preference;
making Scoreboard inspect global selection would couple it to app state.
Deriving the effective prop in Multiscreen keeps the decision with stream ownership.

Verify with a component regression covering scoreboard-only startup, adding
videos, removing one of multiple videos, closing the last video while an update
is pending, and reopening a video. Run the existing suite and production build.
Update scoreboard documentation, commit task changes on main, and push.

Self-review: scope and transitions are explicit; no new settings, timers or
network paths are needed. Existing hook tests cover queue cleanup and zero delay.
