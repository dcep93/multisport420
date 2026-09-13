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
