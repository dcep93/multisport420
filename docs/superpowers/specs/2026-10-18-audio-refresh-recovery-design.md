# Audio recovery during stream refresh

The user approved fixing the reported refresh/spotlight failures after the code investigation. Keep the app as the owner of desired mute state and preserve explicit mute choices.

Complete the readiness handshake: the generated wrapper announces readiness after installing its listener; the app replies only to its own current iframe with current mute and selector state. A nested relay without cached state requests it upstream. Keep load replay for older controllers. This addresses early lost messages without periodic unmute commands that would override native player controls.

Observe video insertion/removal in the extension and bind the current video again when it changes. Mute the old video, apply the latest requested state to the replacement, and start playback. Recheck on commands so a replacement immediately before observer delivery is handled. Do not continually reset manual mute on unrelated DOM mutations.

A single-stream refresh fetches descriptors to replace only the requested stream, without replacing the global catalogue and pruning other open streams. Keep the explicit catalogue-refresh behavior unchanged.

Regression coverage uses Node and jsdom only: delayed readiness, current-state reply isolation, replacement videos including pending observer delivery, and A/B/C refresh with incomplete listings. Run app/extension tests, build, lint, and review the diff. Bump the extension patch version, document reload requirements, commit/push main, and verify deployment. No Chrome control.

Alternatives considered: periodic resend would override player-native controls; a full acknowledgement/retry protocol adds complexity beyond the demonstrated failures. Readiness plus video lifecycle tracking targets the missing transitions.

## Verification

The added app readiness and incomplete-list regression cases and replacement-video cases failed before the implementation and pass after it. Full checks: 363 app tests, 42 extension tests, production build, and changed-file lint pass. Full-project lint reports 64 pre-existing errors in untouched Remote/scoreboard files. A jsdom observer teardown issue in the new test fixture was corrected; affected extension tests were rerun cleanly. Extension 0.3.9 ZIP contents were verified against source. Browser automation was not used.
