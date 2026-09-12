# Native Multisport420 scoreboard

## Approved scope

Replace the Fantasy420 iframe with a native React scoreboard and extend the
existing Multisport420 MV3 extension. No runtime dependency on Fantasy420's
website, extension, repository, or services remains. Fantasy420 remains unchanged.
Port the existing ESPN parsing, probability models, optimized projected lineups
(league 203836968/team 6 and league 367176096/team 1), display modes, ordering,
THUNDERDOME behavior, formatting, and horizontal scrolling.

## Architecture and integration

Keep the saved `Fantasy420Scoreboard` slug solely as a compatibility identifier
for existing hashes and room stream records; change its URL to the Multisport
site. Render a native component, never navigate to a saved descriptor's URL.
Keep the NFL-only entry gated on a Multisport extension scoreboard capability
marker, including discovery after React mounts. Old Multisport extensions must
not falsely advertise support. Preserve focus, close, room and title refresh.

Isolate parsing, lineup optimization, probability calculations, controller,
transport and presentation under `app/src/app_x/scoreboard`. Copy calculations
from Fantasy420 at commit 0052b08d and retain provenance in documentation.
Use scoped CSS and container height units in place of iframe viewport units.
Keep the statistics strip one panel-height tall, with toolbar below it reachable
by vertical scrolling, matching the existing compact presentation. Native hover,
keyboard and reduced-motion controls retain the existing scrolling behavior.

## Extension protocol

Add a service worker and two content scripts: a capability/runtime ID marker
on https://multisport420.web.app and localhost, and an ESPN football-tab fetcher.
Use externally_connectable and an exact-origin service-worker check. Internal
messages use the multisport420:scoreboard namespace. Construct the ESPN endpoint
inside the extension; never accept a webpage-supplied fetch URL. Use the current
Fantasy420 request views, authenticated ESPN tab, no cache, bounded timeouts,
validated league/year, top-frame messages, and network-start acknowledgments.
No generic fetch/storage bridge or unrelated Fantasy420 features are added.
Retain existing player scripts. Bump extension to 0.3.0 and document new access.

## Lifecycle and failures

Fetch once per mounted panel, including StrictMode, then every 30 seconds.
Manual, remote and timed refreshes use one controller and coalesce in flight.
Unmount clears the timer. Mode changes only recalculate the current snapshot.
Default to the active/recent ESPN league tab; retain leagueId/year/mode query
options. Native Knockout and league 367176096 default to Guillotine.
Preserve prior data after normal fetch failures and show a warning. Missing or
incompatible extensions clear the snapshot and show update/reload instructions.
Lineup optimization only affects displayed projections; never submit ESPN edits.

## Verification and delivery

Port calculation/controller, lineup and scrolling tests. Cover the real extension
scripts with node tests, including rejected origins, tab selection, credentials,
failures and fetch counts. Test native rendering, no iframe/Fantasy420 runtime,
late capability injection, StrictMode, automatic/manual/remote refresh and cleanup.
Run app tests, extension tests and production build. Use a browser fixture to
verify 110px and larger panel layouts, controls and refresh. Attempt real Chrome
extension verification when the installed browser environment supports it;
report any unverified live authentication or extension-reload requirement.
Commit task changes and push main per workspace defaults.

## Self-review

Approved scope is covered. Compatibility strings do not imply a runtime
Fantasy420 dependency. The component uses local calculations, existing extension
player behavior is preserved, and no unresolved product decisions remain.
