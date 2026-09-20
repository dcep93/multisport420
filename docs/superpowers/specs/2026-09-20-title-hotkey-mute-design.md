# Fixed title hotkeys and reliable player audio

Approved by the user on September 20, 2026, including the addition that a muted
stream must unmute whenever it enters the spotlight.

## Behavior

Render the screen number as a nonshrinking sibling before the scrolling title
viewport. Preserve title scrolling, possession and big-play order, refresh,
close actions, and accessible indexed labels. A sibling is simpler than a sticky
number inside the existing centered scrolling text.

Remove the extension's requirement for an interaction inside each embedded
player before accepting a mute toggle. Keep host ancestry and message-source
checks. Explicit set-muted commands always apply the requested boolean, so
spotlighting unmutes even a previously manually muted stream. Toggle commands
still allow muting the current spotlight until the next focus transition.

Remove the local replacement-focus helper's redundant mute toggle: focus
changes already send set-muted, and a simultaneous toggle would conflict with
explicit unmuting. Keep existing number-key and phone remote semantics.

## Verification and delivery

Cover stationary hotkeys during animation and manual scrolling; commands in
independent player frames without direct interaction; repeated toggles; manual
mute followed by spotlight; and commands arriving before the video exists.
Run app tests, extension tests, build and lint. Verify layout and keyboard audio
routing using local browser fixtures. Bump the extension to 0.3.2 and document
reloading. Commit and push main, whose workflow deploys the website.

## Self-review

All three requested behaviors have explicit expected outcomes. No protocol or
remote changes are needed. Tests distinguish focus commands from mute toggles.
The extension change requires reloading the extension and viewing page.
