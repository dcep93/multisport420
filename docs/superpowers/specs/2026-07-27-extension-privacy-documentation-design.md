# Extension Privacy Practices Design

## Goal

Prepare consistent Chrome Web Store Privacy Practices declarations for the
Multisport420 companion extension.

## Privacy-policy decision

The extension does not collect user data. The user chose not to create or
publish a separate privacy-policy page. No file will be added to `app/public/`.

## Dashboard copy

Add repository-managed Chrome Web Store privacy copy outside the extension
package with these declarations:

- **Single purpose:** Improve embedded video playback on
  `multisport420.web.app` by managing playback, focused-screen audio, and
  intrusive popups.
- **Host-access justification:** The extension runs on `embedsports.top` and
  `pooembed.eu` player frames used by Multisport420. Access is required to
  control playback and mute state, forward player commands, and block intrusive
  popup elements.
- **Remote code:** No. All executable code is packaged with the extension.
- **Data collection:** None.

## Verification

Confirm that the saved dashboard copy exactly matches the approved wording and
is stored outside `extension/`. Inspect the diff to confirm no app or extension
runtime code changed in this step.
