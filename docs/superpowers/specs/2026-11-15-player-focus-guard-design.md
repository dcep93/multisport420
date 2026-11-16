# Website player focus guard

## Approved behavior

Keep Multisport420 number shortcuts usable when a stream iframe takes keyboard
focus through a click, script, refresh, or returning to the browser. This is a
website-only change; do not modify the extension. The user approved this design
with `yesi`, including implementation and verification checkpoints.

## Approach

Mount a small focus-guard hook while the authorized viewer has selected streams.
Make the main app shell programmatically focusable with tabIndex=-1. When the
active element is a `.screen-iframe` inside that shell, focus the shell with
preventScroll. This works without reading cross-origin player documents.

Schedule a deferred check on top-window focus/blur, pageshow, document visibility
changes, and outer player loads. Check every 250 milliseconds while mounted to
recover from nested frame navigation and focus changes that do not notify the
parent. Recheck visibility, document focus, and active element on every attempt.
Never focus the app while hidden or while its document does not have focus.
Remove listeners and cancel pending timers on cleanup.

App inputs, selects, buttons, and editable fields retain focus. The shell stays
out of the normal Tab sequence. Mouse player controls remain usable. Keyboard
interaction inside player frames is intentionally interrupted in favor of app
shortcuts; this tradeoff was approved. A shortcut pressed before the deferred or
periodic recovery completes can still be consumed by the iframe. This does not
claim zero-latency interception, which needs cooperation inside cross-origin frames.

## Alternatives

Return-only recovery misses focus changes during viewing. Forwarding keys from
inside players would preserve player keyboard focus but requires extension
changes, which the user rejected. The website focus guard is the selected design.

## Verification

Use a browser fixture with real nested cross-origin iframes and two streams.
Demonstrate the current failure after a player grabs focus, then verify number
shortcuts select/mute streams after recovery, including nested reloads. Verify
mouse player clicks still work, app text input retains focus, focus recovery does
not scroll, and focus returns on page reactivation. Unit tests cover deferred and
periodic paths, hidden/unfocused documents, unrelated iframes, and cleanup.
Run app tests, TypeScript/build, lint, and the existing player browser tests.

## Review

Scope and requirements checked: website only, no extension changes, no layout or
room-state redesign, no approval pauses remaining. Preserve the existing unrelated
extension/screenshot.png change. Work on main, commit task-owned changes, and push.
