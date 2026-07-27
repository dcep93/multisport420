# Extension Privacy Documentation Design

## Goal

Provide a stable public privacy-policy URL and consistent Chrome Web Store
privacy declarations for the Multisport420 companion extension.

## Public policy

Add a plain static page at `app/public/privacy.html`, which the Vite build will
publish as `https://multisport420.web.app/privacy.html`. The page will use no
external scripts or assets.

The policy will state that the extension does not collect, store, sell, or
transmit user data. It will disclose that the extension locally reads embedded
player state and ancestor hostnames, and locally changes playback, mute, and
popup-related elements. It will explain why the extension accesses
`pooembed.eu` and `embedsports.top`, identify `dcep93@gmail.com` as the contact,
and include an effective date.

## Dashboard copy

Add repository-managed Chrome Web Store privacy copy outside the extension
package. It will include:

- A narrow single-purpose statement.
- Separate justifications for access to `pooembed.eu` and `embedsports.top`.
- A data-use disclosure consistent with the public policy.
- A declaration that the extension does not execute remote code.

## Verification

Run the app build and confirm that `dist/privacy.html` exists. Review the public
policy and dashboard copy together for consistent claims, then inspect the diff
to confirm no extension runtime code changed in this step.
