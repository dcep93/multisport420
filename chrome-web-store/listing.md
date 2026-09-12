# Chrome Web Store Listing

## Detailed description

Companion extension for multisport420.web.app. Manages embedded video playback,
controls focused-screen audio, blocks intrusive popups, and supplies live ESPN
fantasy football data to Multisport420's native scoreboard. Keep your signed-in
ESPN league open in another tab to see scores, projections, head-to-head win
chances, and Guillotine elimination risk. Fantasy420 is not required.

## Privacy Practices

### Single purpose

Support multisport420.web.app's sports viewing experience with embedded playback
controls and its native fantasy scoreboard.

### Host-access justification

The extension runs on `embedsports.top` and `pooembed.eu` player frames used by
Multisport420. Access is required to control playback and mute state, forward
player commands, and block intrusive popup elements.

On `multisport420.web.app` and `localhost`, a small content script advertises the
extension's runtime ID so the page can connect. ESPN Fantasy football access
allows the extension to locate an open league tab and run its scoreboard content
script. Access to `lm-api-reads.fantasy.espn.com` supports authenticated league
data requests through that ESPN tab. Only Multisport420 and localhost may request
scoreboard data; the extension constructs the permitted API URL itself.

### Remote code

No. All executable code is packaged with the extension.

### Data collection

No developer-side data collection, analytics, or storage. ESPN league names,
teams, rosters, scores, and projections are fetched using the user's existing
ESPN session and passed to the requesting Multisport420 page for local display
and calculations. The extension does not read or export login cookies or submit
lineup changes.

## Packaging

This file contains store metadata and must not be included in the extension
release ZIP.
