# Extension Toolbar Action Design

## Goal

Remove the inert Chrome toolbar action so users are not presented with a button
that has no behavior.

## Design

Delete only the `action` block from `extension/manifest.json`. Keep the
top-level 16, 32, 48, and 128 pixel icons because Chrome uses them during
installation, in extension management, and in the Chrome Web Store.

The extension will continue to run automatically through its existing content
scripts. No popup, background worker, or click handler will be added.

## Verification

Parse the manifest as JSON, confirm that it no longer declares `action`, and
confirm that its icons and content-script definitions are unchanged.
