# Autoscroll refresh continuity

Both scrollers hold at the end for 1 second. Keep the scoreboard's 5-second start hold, the game log's 2.5-second loop start hold (with no initial hold), and existing 2.5-second manual-interaction holds.

Scoreboard data refreshes must preserve the mounted scroller, pixel position, fractional progress, and remaining hold. Only explicit mode changes retain the existing reset behavior. Remove the fetch timestamp from the reset key rather than persisting and restoring state around unnecessary resets.

The game log already retains its effect across data updates. Detect its end explicitly instead of relying on an offset mismatch after scrolling past the bottom. Preserve the current phase and remaining hold when children change. If content grows during the end hold, continue toward the new end after the remaining hold rather than wrapping using stale dimensions. Clamp to the new maximum only when content shrinks past the current position. Disable browser scroll anchoring in autoscrollers so inserted rows do not change the pixel offset.

Keep the two existing components; a shared scrolling engine is unnecessary for this change. Test end timing, refreshes during movement and both holds, content resizing, and timer cleanup. Include a real Scoreboard integration regression with a new fetch timestamp. Run the app test suite and production build before committing and pushing main.
