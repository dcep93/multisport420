# Refresh streams

Add a `refresh streams` button beside `clear cache` in Options, using the existing secondary button style. Request the stream list with both proxy cache ages set to zero so a manual refresh requests fresh data. Keep normal startup and individual-player refresh cache defaults unchanged.

Pass an async callback from MultisportApp through Menu to Options. Options disables the button and shows `refreshing…` while awaiting the callback, then restores it. If the request fails, keep the old list and show an accessible retry message. A successful request updates the list using the existing selection reconciliation behavior. Do not clear settings or room state.

Use a wrapping action group for narrow screens. Validate with build, lint, and existing tests. Reusing the current cached fetch would be smaller but could show stale results; clearing all caches would unnecessarily reset unrelated state.
