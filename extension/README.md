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

The extension runs its existing media controller and popup-overlay helper on
`https://embed.st/embed/*`, including nested players in Multisport420. This
restores spotlight audio and hides the known `#dontfoid` click overlay, including
when the player recreates or restyles it during resizing. It is
not a general-purpose popup blocker. Reload the extension and viewing page
after upgrading.

## Fantasy scoreboard (0.3.0 or later)

Keep a signed-in ESPN Fantasy football league open in another Chrome tab. Select
NFL in Multisport420 and add **Fantasy scoreboard**. It loads once and refreshes
every 30 seconds; the title refresh button and phone remote also refresh it.
Fantasy420's website and extension are not required.

When upgrading, reload the extension, the ESPN league tab, and Multisport420.
Older Multisport extension versions do not advertise scoreboard support.

The extension exposes its runtime ID only on Multisport420 and localhost. Its
service worker accepts scoreboard requests only from those origins, chooses an
active/recent matching ESPN tab, and asks its top-frame content script to fetch
the league data with the existing ESPN login. Requests use a fixed ESPN endpoint,
no cache, and timeouts. No cookies are read or copied by the extension, no lineup
changes are submitted, and league data is not saved or sent to developer servers.

See [scoreboard documentation](../docs/scoreboard.md) for modes and projections.
