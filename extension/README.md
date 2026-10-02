# multisport420 Chrome Extension

Manifest V3 extension for multisport420 player integration, including spotlight
audio and mute commands on supported embeds, plus native ESPN fantasy scoreboards.
The viewing site is
https://multisport420.web.app (localhost is also supported for development).

[Privacy policy](https://multisport420.web.app/privacy/) covers the website and
extension, including ESPN data access, sharing, retention, and user controls.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `multisport420/extension` folder

After updating an existing unpacked installation, click **Reload** on the
extension card and refresh the viewing page. Deploying the website does not
update your locally installed extension. The phone remote needs no extension.

## Mute and spotlight controls (0.3.2 or later)

Mute controls work on every supported screen without first clicking inside its
embedded player. Each toggle inverts that player's current mute state. Entering
spotlight unmutes the stream, including streams muted manually in the player.
Reload the extension and refresh the viewing page after upgrading to apply these
audio fixes to already-open players.

## Embed.st players (0.3.1 or later)

### Popup protection (0.3.3)

On supported embed hosts, a MAIN-world script starts at `document_start`, before
player scripts can save `window.open`. When the player is inside Multisport420
(or localhost), it blocks scripted new windows and links targeting new windows,
the top window, or parent windows. Standalone embed pages are unaffected. The
existing CSS still hides the known `#dontfoid` overlay. No additional host
permissions are requested.

This is best effort: new ad techniques, unsupported nested hosts, and same-frame
redirects can still escape these measures. The current provider rejects sandboxed
iframes, so a webapp sandbox was tested and intentionally not shipped. Reload the
extension and viewing page after upgrading; website deployment alone does not
install this protection.

The extension runs its existing media controller and popup-overlay helper on
`https://embed.st/embed/*`, including nested players in Multisport420. This
restores spotlight audio and hides the known `#dontfoid` click overlay, including
when the player recreates or restyles it during resizing. It is
not a general-purpose popup blocker. Reload the extension and viewing page
after upgrading.

## Fantasy scoreboard (0.3.0 or later)

With extension **0.3.5 or later**, open your signed-in ESPN Fantasy football league
once in Chrome. The extension remembers the last real league tab locally and can
reopen it in an invisible iframe after you close the tab. Select
NFL in Multisport420 and add **Fantasy scoreboard**. It loads once and refreshes
every 30 seconds; the title refresh button and phone remote also refresh it.
Fantasy420's website and extension are not required.

When upgrading, reload the extension, the ESPN league tab, and Multisport420.
Older Multisport extension versions do not advertise scoreboard support.

The extension exposes its runtime ID only on Multisport420 and localhost. Its
service worker accepts scoreboard requests only from those origins, chooses an
active/recent matching ESPN tab, or uses the last manually opened league in an
offscreen iframe when no matching tab exists. The content script fetches league
data with the existing ESPN login. Hidden frames never update the remembered
league; they close after a minute without scoreboard requests. The extension
uses storage and offscreen permissions plus a narrowly scoped header rule that
lets only its own hidden frame embed that specific ESPN league page. Requests use a fixed ESPN endpoint,
no cache, and timeouts. No cookies are read or copied by the extension, no lineup
changes are submitted, and league responses are not saved or sent to developer servers. Only the last
league ID, season, and visit time persist locally. Custom ESPN logos are fetched
using the same ESPN session and passed to the scoreboard as inline images. If ESPN needs you to sign in
again, open the league normally once. Explicit league overrides must match an
open or remembered league.

See [scoreboard documentation](../docs/scoreboard.md) for modes and projections.
