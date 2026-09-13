# Embed.st player integration

## Problem and evidence

The active Multisport420 tab embeds four `https://embed.st/embed/*` players
through same-origin srcdoc wrappers. All four videos were playing with
`muted: false`, including three secondary tiles. The enabled unpacked extension
is version 0.3.0 and has no content-script match for embed.st.

The player contains an `aclib.runPop` initializer and a transparent `#dontfoid`
element covering its entire viewport. Existing code hides that element on
embedsports.top, but is not registered for embed.st.

## Approved approach

Register the existing `pooembed.js` media controller and `embedsports.js`
overlay-removal/message-forwarding script for `https://embed.st/embed/*` in
all matching frames. Preserve their existing host matches and document_idle
timing. The media controller already limits activation to descendants of
Multisport420 or localhost. Keep the existing app-to-wrapper-to-player mute
protocol. Bump the extension patch version to 0.3.1 and document reloading.

This reuses the existing integration instead of adding a second player
implementation. Iframe sandboxing is a broader alternative with playback
compatibility risks and is outside this initial fix. Hiding the known overlay
does not promise to block every possible popup mechanism.

## Verification and delivery

Run the existing extension tests and validate the manifest/script paths.
Reload the unpacked extension and Multisport420 in Chrome. Inspect actual video
mute state before and after changing spotlight; secondary videos must be muted.
Verify the known overlay is hidden and player clicks do not open another tab.
Restore the original spotlight and playback state after testing. Check that the
native fantasy scoreboard still works; reload its ESPN tab if reloading the
extension disconnects its content script. Investigate failures in this flow
before declaring completion. Commit and push task changes to main.

## Self-review

The scope covers both reported failures, preserves existing providers, and
requires real-browser evidence for the newly supported provider. No new
background APIs, broad host wildcards, or website deployment are required.

## Live-verification adjustment

Registering the existing scripts restored the correct mute states. Live testing
also showed that the player overwrites the overlay's inline style, undoing the
one-time `display: none` assignment. Replace that polling/inline-style helper
with `embedsports.css`, registered alongside `embedsports.js`, using persistent
`#dontfoid { display: none !important; pointer-events: none !important; }`.
Verify the overlay remains hidden across spotlight changes and player clicks.

## Verification result

Extension 0.3.1 was reloaded in the user's Chrome. All four players reached
`readyState: 4` and were playing; the three secondary players were muted and
the restored Vikings spotlight was unmuted. Changing spotlight transferred
the requested mute state. Directly clicking the spotlight video paused it,
clicking Play resumed it, and neither click created a new tab. The final
player DOM contained no `#dontfoid` element. The ESPN tab was refreshed after
extension reload and the native fantasy scoreboard resumed updating.

All eight existing extension tests passed. Manifest resource paths and
`git diff --check` passed. Popup verification covers this live player and
its known overlay, not arbitrary future ad mechanisms.
