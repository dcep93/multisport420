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

Version **0.3.7** restores the current audio state when a player controller starts
late, including when closing the spotlight promotes another stream. Nested
players also request the latest state when ready. Reload the extension and
refresh the viewing page to apply this fix.

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

With extension **0.3.8 or later**, open your signed-in ESPN Fantasy football league
once in Chrome. The extension remembers the last real league tab in IndexedDB.
After you close it, the background worker fetches ESPN data directly; it does not
open a tab, iframe, or hidden document. Select NFL in Multisport420 and add
**Fantasy scoreboard**. It loads once and refreshes every 30 seconds; the title
refresh button and phone remote also refresh it. Fantasy420 is not required.

When upgrading, reload the extension and Multisport420, and refresh an existing
ESPN league tab or visit your league once. This seeds the new IndexedDB preference:
0.3.8 no longer has permission to read the previous chrome.storage preference.
You can then close the ESPN tab. ESPN authentication and browser cookie settings
still determine whether authenticated background requests succeed; sign in again
if the scoreboard reports an authentication error.

The extension exposes its runtime ID only on Multisport420 and localhost. Its
service worker accepts scoreboard requests only from those origins. Existing
active/recent matching ESPN tabs take priority; otherwise it uses the last manually
opened league for direct background requests. Background requests never update
that preference. The extension requests no storage, offscreen, header-modification,
or cookies API permissions. Existing ESPN host permissions allow the requests.
Requests use fixed ESPN endpoints, credentials, no cache, and timeouts. No cookies
are read or copied by the extension, no lineup changes are submitted, and league
responses are not saved or sent to developer servers. Only the last league ID,
season, and visit time persist locally. Custom ESPN logos use the same session
and are passed as inline images. Explicit league overrides must match an open
or remembered league.

See [scoreboard documentation](../docs/scoreboard.md) for modes and projections.

Version **0.3.6** also handles ESPN custom photos served as `image/jpg`. After updating, reload the extension and refresh any open ESPN league tab so its content script uses the corrected image handling.
