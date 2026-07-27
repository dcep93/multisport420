# Extension Manifest Description Design

## Goal

Replace the placeholder Chrome extension description with concise public copy
that represents the intended finished Multisport420 companion.

## Design

Set the `description` field in `extension/manifest.json` to:

> Companion for multisport420.web.app that manages video playback, mute
> controls, and intrusive popups.

The description positions the extension as specific to Multisport420 and names
its three intended user-facing capabilities. No other manifest fields or
extension behavior will change in this step.

## Verification

Parse the manifest as JSON and confirm that the description does not exceed the
Chrome Web Store's 132-character limit. Inspect the diff to confirm only the
description field changed at runtime.
