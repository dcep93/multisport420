# Extension Store Description Design

## Goal

Prepare terse, accurate detailed-description copy for the Multisport420 Chrome
Web Store listing.

## Design

Create a repository file outside `extension/` containing this approved copy:

> Companion extension for multisport420.web.app. Manages embedded video
> playback, controls focused-screen audio, and blocks intrusive popups. It only
> operates on the embedded player services used by Multisport420.

The file will serve as the source for manually completing the Chrome Web Store
listing. Keeping it outside `extension/` prevents listing metadata from entering
the release ZIP. This step does not alter extension behavior.

## Verification

Confirm that the saved copy exactly matches the approved wording and that no
runtime extension files change as part of this step.
