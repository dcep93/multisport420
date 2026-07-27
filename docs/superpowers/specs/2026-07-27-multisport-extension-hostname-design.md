# Multisport Extension Hostname Design

## Goal

Activate the Multisport Chrome extension's embedded-player helper only when the
player is descended from `localhost` or `multisport420.web.app`.

## Design

In `extension/pooembed.js`, replace `watchwall420.web.app` in the
`HOST_HOSTNAMES` allowlist with `multisport420.web.app`. Keep `localhost` and
the existing exact-hostname comparison unchanged.

This makes the allowlist match the requested two hosts exactly. The old
`watchwall420.web.app` hostname will no longer activate the helper. Broader
patterns such as all `web.app` subdomains are intentionally excluded.

No manifest permissions or match patterns need to change because the content
script still runs on the same embedded-player URL and uses ancestor origins to
decide whether to initialize its behavior.

## Verification

Check the extension JavaScript with Node's syntax checker and search the
extension source to confirm that the new hostname is present and the old
hostname is absent. Inspect the final diff to confirm the runtime edit is
limited to the allowlist entry.
