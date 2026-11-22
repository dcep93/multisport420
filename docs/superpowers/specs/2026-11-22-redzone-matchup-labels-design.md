# RedZone possession-first matchup labels

Approved with `yesi` on 2026-11-22. This supersedes the original RedZone design's prohibition on matchup labels; all other live-feed behavior stays in effect.

Add one compact label above each play description. Use team abbreviations and the scores recorded on that event. If the possessing team is away, render `MIA 6 @ BUF 20`; if it is home, render `BUF 20 vs MIA 6`. Possession is defined at the start of the play, including plays that turn the ball over. The score is the event's reported score (including points scored on that play), not the game's latest score.

Read home/away team identities and abbreviations from summary.header.competitions[0].competitors. Match play.start.team.id to those identities, with the drive team as fallback when play-start possession is unavailable. Do not use play.end.team or current scoreboard possession. Accept numeric/string IDs. Use shortDisplayName/displayName/name if abbreviation is absent. If team identities or possession cannot be resolved, omit the label rather than falsely attributing possession. Missing event scores display an em dash, while zero remains zero; do not substitute the current score.

Extend the existing normalized RedzonePlay with an optional matchup label. Render it above description and existing down/distance/clock, styled compactly. Keep polling, ordering, stable keys, delay bypass, and manual scroll anchoring unchanged. Verify both orientations, turnovers, per-event historical scores, zero/missing data, fallback possession and deduplicated corrections. Update the existing browser test to exercise realistic team/score metadata and retain its polling/scroll checks. Run unit tests, changed-file lint, production build, browser test, and inspect the screenshot; commit and push main, then verify deployment.

Self-review: possession timing and event score timing are explicit; the prior no-label requirement is intentionally superseded; incomplete data never creates invented possession or scores. No outstanding decisions.
