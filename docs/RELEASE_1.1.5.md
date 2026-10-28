# SuperX 1.1.5 — X interface compatibility and reliability

Release preparation, October 28, 2026. This record retains the acceptance history of local candidates below. The Chrome Web Store currently serves 1.1.0; submission and public availability of 1.1.5 are separate steps. No earlier installer is overwritten.

Maintainer instruction: keep the version at 1.1.5 until the Chrome Web Store submission. Unsubmitted revisions use separate artifact folders; do not increment the version for these fixes.

## Final publication bundle

The maintainer authorized GitHub publication and preparation of the Chrome Web Store upload on October 28. The selected installation archive is `artifacts/release-1.1.5/SuperX-1.1.5.zip`, with identical alias `SuperX.zip`; SHA-256: `ee7175af1242e0d7243c81e376c59090df3c18a6b891ce2fb6e256d7e81c5793`. Its 52 production files include the updated bilingual privacy notice and local-only guide-state disclosure. Earlier development ZIPs remain unchanged.

Final local validation: 1,347 unit/contract checks, syntax checks for 68 JavaScript files and 312 isolated usage-error browser checks passed. The official-site privacy update separately passed 18 desktop/mobile rendering checks. These are automated or isolated checks, not new live-provider, installed Edge or macOS acceptance. Remote CI, publication and attachment verification are recorded after completion; the Chrome Web Store remains at 1.1.0 pending a separate upload and review.

## Published GitHub release

**[SuperX v1.1.5](https://github.com/bwjoke/SuperX/releases/tag/v1.1.5) is public Stable/Latest**, published October 28, 2026 at 11:57:59 UTC. The immutable tag points to source commit `287442159cee06d349c69076dbc645280d01804c`. No older tag or published attachment was changed.

- [Three-platform CI](https://github.com/bwjoke/SuperX/actions/runs/40683522268) succeeded. Windows passed 1,347 checks; Linux and macOS each passed 1,344 with the three Windows-only shell tests skipped.
- [Release workflow](https://github.com/bwjoke/SuperX/actions/runs/40683680971) succeeded and generated the seven installation/source attachments. Every downloaded attachment matched the locally prepared release bundle byte for byte before the draft was published.
- The exported source passed 1,347 Windows checks and rebuilt the installation ZIP to the same SHA-256. The public installation URL was anonymously downloaded after publication and matched it too. Source ZIP SHA-256: `d89845cb3a5cd69291a26170a302c218b9bcf9782eeef6c80dfa43d5c34c3989`.
- [The public privacy notice](https://superx.vip/privacy/) was deployed separately and verified over HTTPS with the 1.1.5 date and local-only guide-state disclosure. No home-page configuration was changed.

The Chrome Web Store still serves 1.1.0. Upload `artifacts/release-1.1.5/SuperX-1.1.5.zip` to the existing item; the source ZIP is not an extension upload. Submission materials are maintained separately under the local `chrome-web-store/` directory. This main-branch record may be updated after store review; the tag, published source archive and installation attachments remain immutable.

## Why the previous acceptance missed the issue

The new X adapter was tested for extracting video posters, and provider tests asserted their normalized URL strings. The tests did not independently verify that an extensionless WebP poster still resolved after request construction. Build fixtures returned valid PNG bytes for any requested URL. Those tests established dispatch behavior, not CDN availability. The 1.1.4 incident demonstrated the missing end-to-end contract.

## Confirmed findings and changes

- The same real video-cover base has a readable `.jpg` and `.png` path, while its bare path and `format=jpeg/png/webp&name=orig` variants return 404. Its `format=jpg&name=orig` rendition returns JPEG. Extensionless video covers now select that fixed JPEG rendition regardless of missing or unrecognized source-format parameters. Old JPEG/PNG filename paths remain intact.
- API Key, subscription and local Build use one `Core.imageInputURL` function. Draft capture uses it for trusted published CDN previews too, avoiding rejection when new X displays an originally supported upload as WebP. Actual local draft bytes still must be PNG/JPEG, with the existing four-image and 8 MiB limits.
- Both interfaces collect responsive `currentSrc` and video `poster` sources. Published-post extraction excludes unpublished content inside a composer.
- Media visibility changes refresh the visible snapshot. An explicit retry reads the current post and verifies its identity, rather than resending a stale image snapshot. Already-started jobs are not cancelled or automatically repeated.
- A reused reply preview cannot acquire the new recipient's identity merely because its old images finish loading.

The extraction, visibility and reused-composer cases are reproducible fixture defects; they are not claimed as the observed cause of the two original `invalid_image` failures. Those two failures were separately reproduced and accepted in 1.1.4.

## Verification

- Full validation: 1,318 unit/contract checks passed; syntax checked for 65 JavaScript files; 52 production files and 13 description locales validated.
- New X isolated browser acceptance: 106 checks passed, including the WebP draft-preview case; no page errors or unexpected external requests.
- Legacy X trigger regression: 71 checks passed, including cache and request-preservation behavior; no page errors or unexpected external requests.
- Reused-recipient browser regression: 9 checks passed. Late old media and expanded old text stayed excluded from the new recipient; no automatic extra draft check occurred.
- Seven public-CDN input cases normalized to HTTP 200 JPEG/PNG responses with matching file signatures. Evidence: `artifacts/media-audit-20261028/cdn-contract.json`.
- Independent review of shared URL handling and request snapshot lifetime found no further blocker in these changes.

No model request was made by these audit fixtures. Public CDN checks contain only public media URLs and record status, MIME type and file signatures. Installed live-provider acceptance of 1.1.5 is still pending; successful 1.1.4 checks do not substitute for that acceptance.

## Limits

Normalization cannot guarantee that a deleted, restricted, expired or temporarily unavailable image can be fetched by xAI. The audit does not silently drop such images or retry a paid model request without an explicit user action. Unverified video filename extensions retain prior behavior; local WebP/GIF uploads remain outside the supported PNG/JPEG draft-input contract.

## Local package

`artifacts/preview-1.1.5-media-audit/SuperX-1.1.5.zip`, 52 production files, SHA-256 `f765ec8524d070f8cfb7a4709a182e475292b001c4146d5f7d50f96000fce5b1`.

Source changes and this candidate have not been committed, pushed or published. The installed extension must be reloaded before testing them.

## Layout revision, same version

The maintainer reported missing rail dividers at native post boundaries and insufficient spacing between the modal compose toolbar and the draft-answer divider.

- Native separator sampling now includes top/bottom edges and thin standalone lines inside post-containing cells, preserving fractional coordinates and nonzero alpha. It stops before quoted-post bodies, media and draft forms. Existing native top lines prevent duplicate synthetic top lines.
- Compose/reply dialogs without a reusable native boundary add spacing on the SuperX panel only, bringing the gap from the lowest visible toolbar control to the divider to 14 CSS pixels where the native layout leaves less space. Existing larger native spacing is preserved. Inline composers and native-boundary alignment are unchanged.
- The previous media-audit ZIP remains an earlier local revision, not the latest candidate. This revision will be packaged separately under `artifacts/preview-1.1.5-layout-fix/`.

Layout revision verification:

- Full validation: 1,321 checks passed, 66 JavaScript files syntax-checked, 52 production files and unchanged 1.1.5 manifest validated.
- New-interface browser acceptance: 125 checks passed, including a 40px native lock control beside 36px Post/Check controls, native 24px form padding/margin, modal show/hide stability and zero extra inline padding.
- Independent rail-boundary browser acceptance: 62 checks passed. Native/rail coordinates, computed thickness and captured pixel colors match for translucent edges, subpixel standalone rules, overlapping rows and both interfaces. Quote borders remain excluded; moving/hidden rules do not leave stale lines.
- Legacy spacing: 274 checks passed. Legacy sticky-boundary and modal-context checks: 27 and 31 passed.
- All browser runs had zero page errors and no unexpected external requests. No model request or publishing action was made.

Screenshots and reports are retained under `artifacts/preview-1.1.5-layout-fix/acceptance/`. Installed-profile acceptance still requires reloading the extension; the automated browser runs use isolated native-layout fixtures, not the maintainer's live account.

Layout-revision installer: `artifacts/preview-1.1.5-layout-fix/SuperX-1.1.5.zip`, SHA-256 `d6e573c77775ada56cf8e6ba1f3e90071816a2a2ad0fa9fc39a9c785d962ea64`. It superseded the earlier local media-audit package while retaining the same 1.1.5 version as requested.

## Notification boundary revision, same version

Ordinary notification rows do not own fact-check answers, so their mutual separators must not be extended into the empty rail. Native row observation is retained for layout updates, but rendering now requires ownership by a recognized post or a shared boundary touching a post. A short empty separator spacer directly attached to a post is still supported. This preserves the previous native-line alignment fix without dividing blank notification regions.

Added regressions cover mixed and notification-only lists, post-to-notification and notification-to-post node reuse, and unrelated standalone rules. The version remains 1.1.5. This revision is packaged separately from earlier local candidates.

Verification: 1,323 unit/contract checks and 86 isolated browser checks passed with no page errors or unexpected external requests. The browser checks cover mixed notification lists on both interfaces and preserve the previous translucent, fractional and quoted-content boundary cases. Evidence is copied to `artifacts/preview-1.1.5-notification-boundaries/acceptance/`.

Latest local installer: `artifacts/preview-1.1.5-notification-boundaries/SuperX-1.1.5.zip`, SHA-256 `e114361b1d15843fd6c2bc1bb4ddb69cf01ad47b82dd11e3dac4844e32ff9b9e`. This supersedes the earlier local layout-fix installer; no package version, permissions, authentication, or generation behavior changed.

## Custom-trigger guidance revision, same version

The compact popup labels explicitly name mouse/pointer hover. Both relevant Settings labels now locate the SuperX button in the post's top-right corner in all 12 interface languages.

On Home, a first-use hint points to one visible SuperX post button when custom mode and that button are enabled and the connection is usable. It follows the active light/dark theme, stays out of native layout, and is hidden behind compose/media dialogs or away from Home. It offers only clicking when button hover is disabled. Dismissing the hint hides it for the current page; clicking or completing a button hover records completion separately from analysis settings in local extension storage. Existing results count as button use without another model request. Ordinary post hover, automatic checks and draft checks do not complete the guide.

Completion is shared across open tabs through a dedicated display-state message, leaving generation queues and hover timers intact. The equal-delay parent-post/button-hover case and a longer button-hover wait are covered: actual button use completes the guide while only one model request is sent. A failed optional storage write does not block analysis; an unpersisted acknowledgement retains the completion retry on the next connection or button action.

Verification: 1,333 unit/contract checks, 93 existing settings/popup browser checks and 98 dedicated onboarding browser checks passed. Dedicated old/new-interface onboarding screenshots and the browser report are in `artifacts/trigger-guide-preview/`. No live provider call or posting action was performed for this revision. The version remains 1.1.5; the new package is stored separately under `artifacts/preview-1.1.5-trigger-guide/`.

Latest local installer: `artifacts/preview-1.1.5-trigger-guide/SuperX-1.1.5.zip`, SHA-256 `39ebc98591503862245250a1f4af32e71eefdfd66089dc11b4c2f59fbc2475f1`. Earlier candidate archives are preserved. Source and installer remain local and unpublished.

## Account-error guidance revision, same version

Model-catalog failures now carry a bounded diagnostic reason independently of sign-in state. Explicit provider codes distinguish insufficient quota, insufficient credits, a spending cap and request frequency; a generic 429 remains an unspecified rate/quota restriction, and a generic 403 remains an access denial. Network, timeout, server and malformed-response failures have separate messages. Unknown HTTP failures do not claim the response format or account balance is at fault.

Settings, post checks and draft checks offer fixed official usage links beside the relevant errors. Subscription sign-in uses `https://grok.com/dashboard/usage`; API Key errors additionally offer `https://console.x.ai/` because keys can originate from either service. These links open only after user action, in a new tab without opener access. No billing API, additional credential, permission, generation request or automatic usage-page navigation was added. No remaining-quota percentage or reset time is inferred.

A failed catalog refresh preserves the last successful model list and explicitly identifies its use. The first failed load does not advertise fallback models as account-authorized. Successful recovery clears the warning, link and invalid-field state. Partial answers remain visible when an account error interrupts generation. All 12 interface languages include the new guidance. The package version remains 1.1.5 and earlier candidate archives remain intact.

Verification: 1,347 unit/contract checks passed, 68 JavaScript files passed syntax validation, and 312 isolated browser checks passed with zero page errors or unexpected external requests. Browser coverage includes English, Simplified Chinese and Arabic, first-load versus cached-catalog failures, recovery, both X interfaces, draft errors, stable native-button geometry and user-activated usage links with no opener access. The browser fixtures use synthetic replies and do not validate a live account's remaining quota.

Latest local installer: `artifacts/preview-1.1.5-usage-errors/SuperX-1.1.5.zip` (52 production files), SHA-256 `4a5cddf56a0abef971c1ac2e0e74a87dd7ead653d736cd51d7dd309a22846d19`. This supersedes the trigger-guide candidate for local testing without overwriting it. Reports and screenshots are retained in its `acceptance/` folder. This revision is not published to GitHub or the Chrome Web Store.
