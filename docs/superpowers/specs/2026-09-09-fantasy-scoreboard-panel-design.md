# Fantasy scoreboard panel

The user's explicit request defines the behavior: when NFL is selected and the
Fantasy420 Chrome extension is installed, show a Fantasy scoreboard entry in
Multisport's available streams. Selecting it opens the existing hosted scoreboard
and sends its documented refresh message every 30 seconds.

Detect the extension using its existing document-level runtime-ID marker and a
MutationObserver, which handles content-script injection after React mounts.
No new extension permissions or extension release are required. The entry is
exclusive to the NFL list, including exclusion from ALL. Its stable built-in
stream descriptor participates in existing selection, hash restoration and rooms.
A saved panel can still display the scoreboard's own installation instructions
when opened in a browser without the extension.

Render a direct iframe at https://fantasy420.web.app/scoreboard, rather than the
video host's nested srcdoc flow. Reuse card focus/close controls, omit the ESPN
play-by-play column, and send refresh messages to the exact Fantasy420 origin.
The existing title refresh button and refresh-log commands use the same message.
The iframe fetches initially by itself. Start one 30-second timer per mounted
panel; clean it up when removed. Focusing another panel or switching list
categories preserves the selected scoreboard and its timer like other streams.

Verification: test NFL/extension filtering, late marker discovery and cleanup,
fixed iframe URL, 30-second cadence, manual refresh and timer cleanup. Run app
tests and production build, push main, verify deployment, and use Chrome to
select the real panel and observe the fetch counter advance after 30 seconds.

Self-review: implementation scope, message contract, selection persistence and
failure behavior are specified; no unresolved decisions or extra approval needed.
