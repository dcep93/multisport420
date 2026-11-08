# Remote loaded-streams visibility

Approved with `yesi` on November 8, 2026.

## Behavior

Add a Show/Hide loaded streams button immediately before the remote's Loaded
streams catalog. Default to shown. Hide the entire catalog, including its search
and checkboxes, while retaining its search state. Leave playback, room state,
viewing controls, and game-selection buttons unchanged. The visibility button
remains usable while disconnected or sending room commands.

Store the preference under `multisport420:remote:show-loaded-streams` as `true`
or `false`. Restore it on mount; missing or invalid values mean shown. Listen for
localStorage changes from other same-origin tabs, including clearing storage.
The preference applies to this browser across rooms, not to other devices.
If localStorage throws, the toggle continues to work in memory.

## Implementation

Use a small external-store hook following useHorizontalScrolling's established
pattern, including a same-document change event and a stable boolean snapshot.
Add an accessible button with aria-expanded and aria-controls. Keep the catalog
mounted inside a hidden wrapper so search text survives collapse. Reuse existing
remote button styles with a small spacing class.

## Validation

Run existing remote-controls tests, production TypeScript/Vite build, and lint
on the changed TypeScript files. Review the storage listener, default value,
unavailable-storage fallback, and hidden-panel semantics. This is a reversible
UI preference; no new test suite or unrelated refactoring is needed.
