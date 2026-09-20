# Webapp-owned mute state

The user approved implementing active-number mute and spotlight unmute without
requiring an extension update. Extension 0.3.1 already handles explicit
multisport420:set-muted messages without player interaction, but gates toggle
messages. The website will own desired mute state and emit only explicit states.

Each mounted screen tracks whether its current spotlight session is muted.
A new targeted request flips that flag only while focused. A focus change clears
it, so leaving always mutes and entering always requests unmute. Ignore historical
requests at mount and requests targeting other screens. Combine focus and mute
state before sending to avoid contradictory intermediate commands. Reuse the
same boolean for iframe load and subsequent changes, preserving mute on refresh.
Keyboard and room commands retain their current request routing.

Test against an unchanged copy of extension/pooembed.js from commit 63e2daa
(version 0.3.1), as well as the current controller. Cover all eight screens,
repeated active-number presses, 4 -> 4 -> 3 -> 4, and refresh while muted.
Extension files and version remain unchanged. Old extensions still preserve
player-native manual mute in some cases; this change governs app/remote controls.

Run app tests, production build, changed-file lint, browser compatibility tests,
and applicable remote checks. Commit/push main and verify website deployment.
Self-review: no extension update, new permissions, or player-click prerequisite.

## Verification

Before the fix, the browser test with the unchanged 0.3.1 script failed when
pressing the active stream number: the video remained unmuted. After the fix,
both old and current controller cases pass across eight screens, repeated
mute/unmute, 4/4/3/4 and refreshing while muted. The refresh test waits for the
original iframe to detach before checking the replacement video.

162 app unit tests, production build and changed-file lint pass. Phone-remote
tests now assert explicit per-player state and no replay on reconnect; their
lint and test discovery pass, but integration execution is unavailable because
this machine lacks the Firebase emulator and Java runtime. Extension files and
manifest are unchanged. Existing root test-results output is left unstaged.
