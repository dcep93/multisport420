# Stream indicators and compact titles

## Approved behavior

All football tiles, including spotlight, show a football beside the possessing
team, maroon while that team has an active drive within 20 yards of the end zone,
and steelblue for a five-second big-play alert. **Maroon always takes priority
over blue**, per the user's correction. Possession and red-zone state follow the
displayed log delay. Big-play warnings start max(0, delay - 40 seconds) after a
new qualifying play is first observed. Use the recovered NFLStream trigger
thresholds. Dedupe alerts across repeated polling and cancel obsolete timers.

Keep indicators running with logs hidden and across spotlight changes. The
football behavior applies to NFL, CFB and CFL where ESPN supplies the data;
unknown possession/field position must not fabricate indicators. Completed
drives, halftime and finished games clear possession/red-zone indicators.

Every stream title, including the scoreboard, is 28 CSS pixels tall and uses a
single nonwrapping line. No ellipsis. Only overflowing text scrolls horizontally,
with pauses at the ends and on hover/focus. Keep refresh fixed and accessible.
Reduced-motion users can manually scroll overflowing text. Preserve existing
title-to-close and refresh behavior.

Keep NBA/NCAAB points streaks, suppress NFL streaks. Each NFL team card has one
unwrapped team-name line and one stat line: `24:45 = 232 / 45`, meaning possession
time = total yards / offensive plays. Keep full stat descriptions accessible.

## Structure

Add explicit play identity/yardage and football possession metadata to normalized
logs. Pure indicator helpers classify plays; a dedicated hook owns polling,
delayed snapshots and alert timers. ScreenCard owns this hook so hiding the log
does not disconnect indicators. The log becomes a view of that shared state.
An isolated title component owns overflow measurement and horizontal scrolling.

## Verification

Test threshold boundaries, deduplication, 80-second warning/120-second log timing,
five-second expiry, timer cleanup, stale response handling, maroon precedence,
completed drives and team identity. Test NFL shorthand and streak suppression,
retaining basketball streaks. Inspect the actual app at desktop/125% zoom and
narrow widths for 28px one-line titles, scrolling and fixed controls. Run unit
tests, lint and build. Commit/push main and verify the existing Firebase deploy.

## Self-review

The corrected color precedence is explicit. No new extension release is needed.
The old indicator algorithm must use the new chronological play order, not the
old first-element indexing. Presentation toggles must not restart polling or
replay alerts. Existing media/scoreboard integration remains intact.
