# 1.1.1 X compatibility candidate

Status: intermediate local candidate, October 28, 2026, superseded by [1.1.2](RELEASE_1.1.2.md) after the final media-refresh review. Its installation ZIP is retained unchanged. GitHub Stable and Chrome Web Store remain 1.1.0.

## Implementation

X's new interface has native `article`, URT timelines, `data-href` post wrappers, embedded quote frames and textarea composers, without the previous `data-testid` markers. A shared `x-dom.js` adapter now resolves identity, ownership, page layout and controls for both interfaces. It is packaged before `feed-core.js` and used by the feed and draft paths. Legacy markers remain supported.

- Feed: primary/sidebar discovery, native page header, virtual rows, main-post identity, direct and nested quotes, source-owned pictures and video posters. Inline expanders mark truncated context without including their UI labels.
- Triggers: manual post control, both hover timers, detail-main/reply rules, cache restoration and retention of started work. A recycled article cannot receive the previous post's late answer.
- Drafts: home, detail reply, new-post modal, reply modal and quote modal. Read textarea values independently of transparent visual mirrors. Keep the whole form above the result and align its text column. Preserve native button geometry and modal scrollbar space.
- Context: read a linkless reply preview within its own form, use the exact `in_reply_to`, and keep quoted posts as auxiliary context. On recipient changes, unchanged old preview text/media are withheld until the preview updates. Existing answers cannot migrate to the new recipient.
- Images: retain owned published/context pictures and video thumbnails; read an uploaded draft picture only for its explicit draft check. Exclude avatars, quoted media and editor media from the wrong source.

No new host permissions, connection modes, prompts or storage migrations are introduced. The separate security work discussed for PR #3 remains deferred.

## Reproducible acceptance

- `node tools/validate.mjs`: 1,299 unit/contract checks passed; syntax, manifest, localization and 52-file production allowlist validated.
- `node tools/accept-x-redesign.mjs`: 87 isolated browser checks passed. Uses fabricated content with the observed new DOM shapes and intercepts all network traffic. Covers five compose scenes, manual/hover/automatic scope, cache/paused work, row reuse, reply-recipient reuse, images, native geometry, long modal answers, light/dark, RTL and narrow layouts.
- `node tools/accept-trigger-modes.mjs`: 196 legacy browser checks passed.
- `node tools/accept-draft-composer.mjs`: 1,903 legacy browser checks passed. After the final draft layout/context repairs, targeted modal-context (31) and spacing (274) suites were rerun successfully.
- Browser fixtures reported no page errors or external requests. Their reports are in `artifacts/x-redesign-compat/`, `artifacts/trigger-modes-preview/` and `artifacts/draft-check-preview/`.

These are deterministic local checks, not evidence of a paid request on an installed candidate. Live read-only inspection established the DOM changes on @coolish and the retained legacy interface in the other profile. It also confirmed the new video poster URL structure. No reliable promoted-post sample was present; do not claim full new-ad-marker coverage. Existing media/model limitations are unchanged.

## Candidate and remaining acceptance

- ZIP: `artifacts/preview-1.1.1-x-redesign/SuperX-1.1.1.zip`
- SHA-256: `ae672d2f049282a9dd4469139c135bb28545708c66f0a087b0fe7a4494a1e7f7`
- The ZIP contains `manifest.json` at its root. Its inventory/checksums are alongside it. The previous public 1.1.0 assets remain untouched.
- Use the 1.1.2 candidate for installed acceptance; do not publish posts as part of acceptance.
- Public release and store submission require the maintainer's next release instruction after installed acceptance.
