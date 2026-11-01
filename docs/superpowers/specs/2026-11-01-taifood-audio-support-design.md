# Taifood embed audio support

The live viewing page now embeds videos at `https://taifood-blog.asia/embed/*`.
Extension 0.3.9 does not match this host, leaving all players audible despite
the selected-game audio contract. The user approved adding host support and pushing.

## Design

Extend the existing media controller and early popup guard registrations to the
exact HTTPS embed path. Reuse their existing Multisport420 ancestor checks and
audio-ready handshake. Do not request broad host access or change the website.
A new provider-specific controller would duplicate working logic; matching all
websites would unnecessarily widen access. The focused manifest change is preferred.

Release as 0.3.10, update extension/store documentation, and create a local ZIP
with the same runtime files as 0.3.9. Installing or reloading the extension and
refreshing the viewer is still required; a Git push cannot update installed Chrome
extensions or publish a Web Store release.

## Verification

Use a manifest-driven DOM regression test to reproduce missing injection, then
verify initial muting, selecting one of two streams, switching selection, and
leaving standalone embeds untouched. Run all extension tests, validate the ZIP,
and push the task-owned changes on main. Live Chrome activation is outside this
source fix and must not be claimed as verified.
