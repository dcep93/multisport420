# RedZone big-play highlighting

Approved by the user with `yesi` on 2026-11-22 during completion of possession-first labels.

Use the same yellow background as single-game home-player box-score rows (`var(--ww-panel-soft-reflection)`) for the entire RedZone event row: matchup/score, description, and down/distance/clock. Highlight qualifying plays immediately and persistently while they remain in the feed; no blinking, delay, duration timer, or autoscrolling.

Reuse the existing `getBigPlay` function from lib/renderLog/indicators.ts, without changing its rules. This includes its existing starting-red-zone exclusion (inside opponent 20), touchback/nullified/no-play exclusions, review-correction handling, distance and special-event thresholds. Normalize the ESPN fields it requires: text, shortText, review.upheld, statYardage, and start.yardsToEndzone. Recompute on every accepted summary so revised plays can gain or lose highlighting.

Carry a boolean on each normalized RedzonePlay and conditionally apply a semantic CSS class to the existing row. Keep possession-first labels and all current sorting, polling, deduplication, no-delay and manual-scroll behavior. Unit coverage must prove representative ordinary/big plays, starting-red-zone and nullified exclusions, replay reversal, and duplicate correction clearing. Browser checks must verify the computed yellow color on qualifying rows, ordinary rows unchanged, and existing scrolling/polling behavior.

Self-review: the existing classifier is the single source of rules; yellow matches the requested box-score treatment; persistence and update behavior are explicit. No outstanding decisions.
