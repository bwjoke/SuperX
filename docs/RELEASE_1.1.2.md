# 1.1.2 X compatibility candidate

Status: intermediate local candidate, superseded by [1.1.3](RELEASE_1.1.3.md) after installed-browser acceptance. GitHub Stable and Chrome Web Store remain 1.1.0. This candidate's ZIP, and existing release tags/assets, are unchanged.

## Scope

Support X's semantic/URT timeline and textarea composers alongside the legacy interface. The shared `x-dom.js` adapter centralizes native identity, ownership, page layout and control discovery, while preserving legacy markers. This candidate supersedes the intermediate local 1.1.1 ZIP without replacing it.

- Restore the right-hand rail, post buttons, hover timers, detail rules and cached answers. Detect the actual native page header and match the new Grok button's size, foreground and neutral hover background.
- Distinguish primary posts, direct/nested quotes, authors, uploaded pictures, quoted pictures and video posters. Mark truncated context from native inline expanders without copying their labels into prompts.
- Keep late results off recycled virtual rows and new reply recipients. Preserve accepted requests through pause and temporary hidden/inert page states.
- Read textarea values separately from transparent text mirrors. Support home posts, inline detail replies, new-post dialogs, reply dialogs and quote dialogs. Place answers after the whole form with the editor's text inset and stable native controls.
- Read linkless parent previews from the current form and resolve exact `in_reply_to` identity. If the route changes before the preview updates, send only the new recipient URL rather than attributing the previous parent's text/media to it.
- Refresh snapshots on native picture/source changes, responsive `currentSrc`, image load, video `poster` and metadata readiness. Changes to a checked draft's context mark its result stale without automatically sending another draft request.

No new host permissions, connection modes, prompts or storage migrations. The separate security work discussed for PR #3 remains deferred.

## Validation

- `node tools/validate.mjs`: **1,302** unit/contract checks passed, with JavaScript syntax, manifest, localization and production-file validation.
- `node tools/accept-x-redesign.mjs`: **89** new-interface browser checks passed; see `artifacts/x-redesign-compat/report.json`. Covers five compose scenes, parent/quote context, uploads, triggers, cache, pause, recycled rows, recipient switches, readonly editors, transparent mirrors, delayed media, responsive pictures, light/dark, RTL and narrow layouts.
- `node tools/accept-trigger-modes.mjs`: **196** legacy browser checks passed after the final media changes.
- Legacy full draft suite: **1,903** checks passed before the final media-event additions. Targeted modal-context (**31**), spacing (**274**) and final image (**81**) suites were also rerun successfully. Independent new-interface context/media regression: **6** checks passed.
- These browser suites use isolated fabricated pages and intercepted transport, with no actual account, model requests or X publishing. No page errors or external requests were reported.

Live read-only inspection established the new DOM on @coolish, legacy DOM in the other profile, and the actual new video poster shape. No reliable new promoted-post example was present; full new-ad-marker coverage is not claimed. Existing provider/media limitations are unchanged.

## Installation candidate

- ZIP: `artifacts/preview-1.1.2-x-redesign/SuperX-1.1.2.zip`
- SHA-256: `dbf8ecfdf0c59c94c9283579ddbb10c0463ada0db9dd6cca37e8fff653eea6e7`
- 52 production files; `manifest.json` at the ZIP root. Inventory and checksum files sit alongside the archive.

Installed Chrome acceptance confirmed 1.1.2 on fresh tabs in both profiles: the NASA test post produced sourced answers (32,975 reported tokens on the new interface; 37,416 on legacy), and the new reply dialog produced a contextual answer (56,289 tokens). Show/Hide retained the native Reply button's horizontal position and width. Agent-written drafts were cleared; nothing was posted.

Two failures were found during this acceptance: the new native quote composer uses a plain `article` without the embedded-frame marker, causing its WebP picture to enter the unpublished-image validation path; X's global reset also removed the injected inline reply control's 8px margins. Both are addressed by 1.1.3. Evidence is in `artifacts/preview-1.1.2-x-redesign/live-20261028/`.
