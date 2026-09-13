# Public privacy policy

The user requested a deployed policy after being offered a short page on the existing site. This authorizes creating and deploying the public page. The July decision against a policy is superseded by this request and the newer ESPN scoreboard feature.

Use a standalone static page at `app/public/privacy/index.html`, served at `https://multisport420.web.app/privacy/`. This makes it accessible without JavaScript, authentication, an extension, or live sports feeds. A React route would require the app runtime; a separate host would introduce unnecessary hosting. Use readable dark styling matching the site, responsive width, semantic headings, and no external assets or scripts.

Cover current website and extension behavior: ESPN tab/league identifiers, league response data, authenticated requests with existing cookies (no cookie/password extraction), local calculations, permitted Multisport and localhost recipients, no developer-server transfer of fantasy responses, no extension analytics/sale/advertising, media controls, website local caches/unlock flag/selection URLs, proxy and provider requests, Firebase optional room state and its persistence, third-party network metadata, retention and user controls. Include a Chrome Web Store Limited Use statement, September 13 2026 update date, and the verified public project issue tracker for general privacy questions without soliciting sensitive public details. Do not invent storage TTLs or claim removing the extension deletes Firebase/ESPN data.

Link the page from both the app menu and password gate using a new tab to preserve the viewing session. Put the URL in the extension README and Chrome Web Store listing notes. Update the old privacy-decision document to identify its superseding policy. Do not change extension runtime behavior, permissions, or publishing status.

Verification: review policy against inspected source; verify public static HTML has no app scripts and all links resolve; build the app; lint changed TSX; inspect desktop and narrow browser rendering; run existing tests; push main through the existing Firebase workflow; confirm the live page is served as static HTML and publicly readable. No new unit test is needed for a static page and simple links.

Self-review: concrete URL and scope, current data flows, no placeholders or unsupported deletion/security promises. Publication is requested; no additional approval checkpoint is needed.
