# Scoreboard without additional API permissions

User approved direct background ESPN requests and IndexedDB with `yesi`.

Keep the existing top-level ESPN-tab bridge when available. When every matching
tab is closed, fetch the same fixed ESPN scoreboard, paginated player pool,
schedules, and authenticated custom logos in the extension service worker.
Share that request code between the worker and content script. Use credentialed,
uncached requests with the existing deadline, validation, and partial-detail
failure behavior. Only trusted Multisport origins may request data; requests
cannot supply arbitrary URLs or access an unrelated saved league.

Store the last real league visit in extension-origin IndexedDB, preserving
timestamp ordering and excluding incognito visits. Removing the storage API
permission means legacy chrome.storage preferences cannot be read; an existing
ESPN league tab or a fresh visit seeds the new database. Do not collect cookies.

Remove the offscreen document and response-header rules and their permissions.
Keep existing host access. Bump the extension to 0.3.8 and update privacy text,
docs, and the submission ZIP. No automatic visible-tab fallback is approved.

Validate the common request code, pagination, logos, origin checks, IndexedDB
durability, and closed-tab requests in an actual isolated Chromium extension.
Fixtures verify credentials and browser plumbing, not ESPN's acceptance of the
user's current login. Report that limitation and request extension reload for
live verification. If live auth fails, investigate before replacing it with a
visible-tab workflow. No changes to scoreboard presentation or video controls.
