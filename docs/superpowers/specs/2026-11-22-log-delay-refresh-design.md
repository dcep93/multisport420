# Play-by-play delay and immediate refresh

Approved with `yesi` on 2026-11-22.

This supersedes the delay-bypass behavior in the earlier RedZone live-log, matchup-label, and big-play-highlight designs. Highlighting now appears with the delayed row, or immediately when manually refreshed.

## Behavior

All ordinary league logs and the RedZone full play-by-play use the configured log delay for initial loading and automatic updates. Zero delay publishes immediately. RedZone retains its combined chronological feed, matchup labels, big-play highlights, per-game error recovery, and scroll anchor.

Clicking a log immediately displays the latest accepted data already in memory, starts a fresh request, and displays the accepted response immediately. Keyboard activation and existing targeted log-refresh commands use the same path. Pending delayed snapshots and obsolete requests cannot roll the view backward. Subsequent automatic updates use the configured delay again. A failed refresh keeps the cached display and reports the existing error state. Other streams remain unaffected.

Delay changes clear the old queue and restart the delay scope. Unmount cancels requests and timers. Rapid clicks must not allow earlier refresh completions to override later results.

RedZone's feed stays mounted for the lifetime of its loaded stream, including when another stream is spotlighted, logs are hidden, or another layout is selected. Visibility changes preserve polling, cached rows, and queued publication deadlines; they must not restart the viewing delay. Hidden updates preserve the reading anchor for when the panel returns. Removing the stream still cancels its requests and timers. This supersedes the earlier live-log design's instruction to stop polling when the panel is hidden.

## Implementation

Keep the latest accepted ordinary log inside its existing effect scope, independently of the displayed log. Publish that cached log when refresh begins, then retain the existing request-epoch protection and immediate-fetch path.

Pass `logDelayMs` from Multiscreen through RedzoneLog to useRedzoneLog. Maintain immutable RedZone snapshots and a queue of publication timers; polling faster than the delay must not postpone earlier publications. Scope displayed state to the normalized delay so old state is hidden on changes. Manual refresh clears timers, publishes the cached snapshot, invalidates/aborts older requests, and performs a fresh immediate cycle. Publish games independently as summaries resolve. Keep loading/error reporting usable while waiting.

Attach click and Enter/Space activation to the RedZone region, preserving its scrolling behavior. The fantasy scoreboard is not a clickable play-by-play log and retains its current refresh semantics.

## Verification

Use controlled promises and fake timers to prove cache-first display while the network is pending, fresh display after completion, failure retention, out-of-order protection, resumed delays, settings changes, cleanup, and isolation. Exercise NFL and nonfootball ordinary logs. Update the existing RedZone browser fixture/test so it checks actual delay propagation and click behavior while preserving its layout and scroll checks. Run affected unit tests, browser coverage, production build, and relevant lint checks.

## Review

The request is fully covered, with no new setting or unrelated scoreboard behavior change. Observation-based delay matches existing logs and works when ESPN play timestamps are absent or corrected. No unresolved design questions remain.

## Validation results

The completed implementation passes 461 unit/integration tests across 31 files, both RedZone browser tests, the production build, and targeted ESLint. Held network responses verify the cached and fetched render phases independently. Coverage includes refresh failures with visible errors, keyboard activation, resumed delays, stream isolation, and returning to a previous delay while discovery remains unresolved. The browser screenshot preserves the existing feed layout and big-play coloring.

The visibility regression fix passes 464 unit/integration tests and both RedZone browser tests. Added coverage verifies unchanged delay deadlines and continued hidden polling across spotlight, log-toggle, and layout transitions, cleanup on stream removal, and restoration of the reading anchor after hidden updates.
