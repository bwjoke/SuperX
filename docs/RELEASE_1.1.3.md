# 1.1.3 compatibility acceptance

Local candidate, October 28, 2026. Public GitHub and Chrome Web Store remain 1.1.0. Earlier candidate archives are retained unchanged.

## Changes after installed acceptance

The shared old/new X adapter and media refresh work are described in [1.1.2](RELEASE_1.1.2.md). Two cases found on the installed new interface are corrected here:

- The quote composer can render a plain `article` inside a noninteractive preview, without `data-slot="embedded-tweet-frame"`. Recognize that article using its own author/body and permalink evidence. Its pictures stay with quoted context rather than being treated as new draft attachments.
- X's outer CSS reset can override normal declarations on a shadow host. Protect only SuperX's own host layout/typography declarations, preserving the 8px composer-control spacing and panel inset without modifying X's native styles or controls.

No new permissions, provider, prompts, or saved-setting changes.

## Verification

- 1,303 unit/contract checks, syntax and production-package validation passed.
- 104 isolated new-interface browser checks passed, now including the exact ordinary-article quote shape and outer CSS reset. No page errors, provider calls or external requests in this suite.
- Legacy modal-context suite: 31 passed. Legacy spacing suite: 274 passed after the host-isolation changes. Earlier full legacy draft acceptance (1,903) and trigger acceptance (196) remain scoped to their recorded runs.
- Independent regression verifies quote ownership and host margins under the outer reset; evidence reports are under `artifacts/x-redesign-compat/`.

## Candidate

- `artifacts/preview-1.1.3-x-redesign/SuperX-1.1.3.zip`
- SHA-256: `8f2e5ff417b9af6822271b41fa661a763c0cc3b68d05d9f1011edd5f3d4c6384`
- 52 production files, with `manifest.json` at archive root.

## Installed Chrome acceptance — October 28

- The maintainer reloaded both profiles. Fresh/updated test tabs report **1.1.3**. The legacy profile still has its test-id based posts and one visible SuperX rail; the other profile has X's new interface.
- On the new interface, quote the same public NASA post (`https://x.com/NASA/status/1956376225074552934`). Its native preview is an ordinary article with a WebP picture. Ask which mission provided the samples, using the draft control. The check completes with **22,171 reported tokens**, clickable NASA sources, the Apollo 17 answer and a reference to the quoted photograph. No unsupported-draft-image error appears.
- New inline reply controls measure **36 × 36 CSS px**; the gap to the native Reply button is **8 CSS px**, with 8px start/end host margins under X's real stylesheet. The native Reply button remains 62 × 36px.
- All agent-entered draft text was cleared. No post or reply was published. Evidence and measurements are saved in `artifacts/preview-1.1.3-x-redesign/live-20261028/`.

These installed observations supplement the scoped 1.1.2 post/reply checks and the isolated regression suites. They do not establish every future X rollout variant or the unobserved promoted-post marker. No public release or store submission has been performed.
