# multisport420 Chrome Extension

Manifest V3 extension for multisport420 player integration, including spotlight
audio and mute commands on supported embeds, plus native ESPN fantasy scoreboards.
The viewing site is
https://multisport420.web.app (localhost is also supported for development).

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `multisport420/extension` folder

After updating an existing unpacked installation, click **Reload** on the
extension card and refresh the viewing page. Deploying the website does not
update your locally installed extension. The phone remote needs no extension.

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
