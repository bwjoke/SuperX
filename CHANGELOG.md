# 0.7.31 — Independent Grok CLI edition

Based on bwjoke/SuperX 0.7.26 (MIT). Adds a local Grok CLI bridge, one-time macOS connection assistant, installation/login guidance, configurable 1–300 second dwell triggering, manual analysis, and media overlay fixes. Preserves API mode. See README.md and NOTICE.md.

# Changelog

SuperX release history. The extension's `manifest.json` is the authoritative installed version. Test counts below describe those releases' recorded checks, not live provider or browser-store certification.

## 0.7.26 — Public release preparation

- Connect project, website, Preview downloads and support destinations, and refresh installation and privacy documentation for the current password-free setup and local browsing history.
- Keep the independently maintained website, internal store preparation, local review records and deployment utilities outside the public source export and Git commit. Remove the obsolete GitHub Pages deployment workflow.
- Normalize packaged text to LF while preserving binary files, so Windows working copies and public source checkouts produce the same installation ZIP and checksums.

## 0.7.25 — Language menu order

- Order both answer and interface language menus as Auto, English, 简体中文, then the remaining languages in their existing order. Apply the same answer-language order in the reading rail while preserving saved choices and Auto defaults.

## 0.7.24 — Recent browsing history

- Add a local history page for posts seen while SuperX is enabled, including posts without an available API Key or completed answer. Deduplicate repeated posts and retain existing explanations, Fact Checks, Token/model metadata and generated comments for later reading.
- Keep history across browser restarts for 24 hours from each post's last visit, subject to a 1,000-post / approximately 6 MB limit. Expired records are removed on startup, reads/writes and an hourly cleanup alarm; browser scheduling can delay physical cleanup.
- Add rail, popup and Settings entries, local search, saved Markdown answers, comment copying, recording controls, individual deletion and clear confirmation. Viewing or searching history does not call xAI or load remote post media.
- Separate history from session answer caching and encrypted Key storage. Prevent stale visit batches and late answers from restoring deleted records, and keep main analysis working when history recording is disabled or unavailable.
- Add the narrowly scoped `alarms` permission for history cleanup, and update all interface languages and privacy documentation. History text is stored locally without encryption; clearing the API Key or answer cache does not clear history.

## 0.7.23 — Automatic Key encryption

- Encrypt remembered API Keys automatically with AES-GCM. Store ciphertext in extension local storage and a separate nonextractable random CryptoKey in the extension's IndexedDB; restore automatically after browser restart, without password or lock/unlock controls.
- Migrate usable plaintext or older session credentials to encrypted storage. Missing or damaged encrypted data requests API Key re-entry; encryption failures never fall back to saving plaintext.
- Preserve session-only storage, clearing/replacement, cancellation, cache cleanup and guarded settings saves. Clear removes the ciphertext, stored CryptoKey and session Key.
- Update setup and privacy copy to describe the limited protection against ciphertext/settings-only leaks. This does not promise protection against complete profile copying or a compromised extension runtime.

## 0.7.22 — Password-free Key setup

- Remove the complete password encryption, lock and unlock flow from Settings and the worker. Remember Key now stores the API Key in local browser-profile storage and restores it after a browser restart; unchecking it keeps credentials only for the current browser session. Storage remains restricted to trusted extension contexts.
- Save a changed Key and settings in one guarded transaction, preserving request cancellation and cache cleanup during credential replacement or clearing. Settings-only saves retain the existing Key and optional session-only preference.
- Migrate an old encrypted Key when its usable session copy is available. If only the old ciphertext remains, ask for the API Key once rather than an unlock password; replacing or clearing it removes that obsolete data.
- Update all interface languages, privacy descriptions, setup instructions and review checks. Keep the circular browser icon and other reading features.

## 0.7.21 — Circular toolbar badge

- Render the browser icon as a fixed white circular badge with a black SuperX mark. Keep the area outside the circle transparent and retain the original mark's proportion, paths and four gaps.
- Fit the diagonal tips inside the badge with a white perimeter, improving visibility on both dark and light toolbar backgrounds. Regenerate and inspect the 16, 32, 48 and 128 pixel PNGs.

## 0.7.20 — Larger toolbar icon

- Reduce transparent padding in the browser icon assets, increasing the centered SuperX symbol from 112 to 124 units within its 128-unit canvas. Preserve the original aspect ratio, paths, four gaps and transparent background.
- Regenerate the 16, 32, 48 and 128 pixel PNGs, check the small-size visible coverage and transparent corners, and make icon-generation reports follow the current version instead of overwriting historical proof files.

## 0.7.19 — Simpler Key controls

- Remove the manual Lock Key button and its suggestions from Settings. Preserve encrypted Key storage, password unlock after browser restart, clearing/replacing credentials and the internal cancellation boundary during credential replacement.
- Open Settings at the API Key field from the rail, onboarding and popup, including existing pages and old password-focus requests. A saved locked Key remains available to unlock explicitly within Settings.
- Keep the saved-Key status concise and synchronize the privacy, setup and review instructions with the simplified controls.

## 0.7.18 — Model choice guidance

- Recommend grok-4.3 for fast, lower-cost reading and list grok-4.5, grok-4.6 and grok-4.7 as higher Token-price alternatives. Localize the hint and add a link to official model pricing.
- Compare these models to grok-4.3 rather than claiming every newer version costs more: the ordinary input/output rates of grok-4.5, grok-4.6 and grok-4.7 are currently equal. Checked against [official xAI pricing](https://docs.x.ai/developers/pricing) on October 6, 2026; no numeric rates are stored in the product UI.

## 0.7.17 — Quiet Settings author footer

- Move the PaulWei author link from the Settings sidebar brand area to the page footer. Use the same small muted text as the footer, with a blue link on hover or keyboard focus.

## 0.7.16 — Answer metadata and connection handling

- Add a discreet Settings author attribution linking PaulWei to `https://x.com/coolish`. The author label follows the selected interface language.
- Put Token consumption at the top of completed answers instead of repeating Search used. Model names, search/fact-check status and cached status remain available in the metadata tooltip; progress, incomplete fact checks and errors keep their visible status.
- Treat an idle extension-worker disconnect quietly, preserving completed answers and comments. Reconnect when work or an action needs the worker, and wait for its configuration before dispatching.
- Keep interrupted active tasks visibly retryable rather than automatically repeating paid analysis or comment requests. Expired extension contexts still ask the user to refresh X.

## 0.7.15 — Independent answer and interface languages

- Split Language into Grok answer language and SuperX interface language, both Auto by default. Answer Auto follows the post's displayed original/translation; interface Auto follows X with the browser locale as its initial fallback. Existing explicit answer choices remain intact.
- Allow a fixed interface language across the right rail, Settings and popup. Preview it in Settings without discarding drafts; applying an interface-only change preserves answers, caches, active requests and queued fact checks.
- Clarify that an encrypted saved Key is stored on this device and currently unlocked, with a brief reminder about locking it when leaving the computer. Session-only Keys use separate wording that does not imply device persistence.

## 0.7.14 — Interrupted timeline separators

- Extend native full-width horizontal dividers from non-post timeline cells into the right rail, including recommendation modules and thin filled lines inside padded spacers. Preserve their exact native coordinates, thickness and color without adding answer rows or changing the feed.
- Observe non-post cell resizing and remove stale observations and lines after removal, so asynchronous module changes do not leave outdated separators. Borderless, narrow, nested and sidebar content do not produce invented lines.
- Preserve the first-post top boundary and add interrupted-feed regression and local browser rendering checks.

## 0.7.13 — Button connection recovery

- Settings opens through a separate runtime request rather than depending on the feed port. This narrowly allowed operation is available to the extension's top-frame X content script; credential access and mutations remain restricted to trusted extension pages. Older workers retain the port fallback.
- A failed feed send now immediately clears waiting states, updates controls and schedules one reconnection attempt. Initial connection failures also retry, and stale ports cannot invalidate or update a replacement connection.
- When an extension reload leaves an expired page connection, show a localized, clickable Refresh X action instead of silent buttons or endless reconnection. Completed answers and copied-comment drafts remain readable; failed comment requests are not automatically replayed.
- Added profile-page, connection-failure, stale-port and Settings permission regressions, plus synthetic browser recovery checks.

## 0.7.12 — Onboarding and reading-state polish

- Made Settings clickable within missing/locked Key messages, focusing the relevant input in an existing or newly opened settings page. The popup uses one clear Add / Unlock API Key action instead of duplicate settings buttons.
- Hide unavailable generation and clear-Key actions. Settings now report unsaved changes, Enter unlocks a saved Key, external Key changes refresh untouched inputs, and failed Key saves show the actual security state while retaining a retryable draft.
- Preserve completed answers, sources, comments and Token information across pause/resume and Key lock/unlock, without automatically repeating completed requests.
- Stop new automatic analysis when the right column has insufficient space. Worker-confirmed cancellation removes waiting requests while preserving calls that already started, including delayed START messages.
- Replace misleading missing-Key guidance after API rate limits with quota/balance recovery guidance.
- Check completed explanations, combined answers and comment drafts for obvious script/language mismatches as well as fact checks; retain billing metadata, without automatic retries or subsequent fact-check calls for rejected explanations. This conservative check does not distinguish all languages sharing a script.
- Expanded synthetic UI and queue-race regressions and local browser walkthroughs. Final installed-extension acceptance remains pending.

## 0.7.11 — Simpler setup

- Removed the long data-sharing confirmation panel, mandatory checkbox, ZDR attestation and consent-dependent analysis gate. Saving a valid own xAI API Key is sufficient to make the extension ready; enabling analysis remains the user's control.
- Retained a brief direct-to-xAI and API-billing hint near the Key field, with the privacy notice available separately. The extension does not validate or change provider account settings.
- Preserved password-encrypted Remember Key, lock/unlock, credential-change cancellation and session-cache handling. Obsolete consent records do not block existing usable Keys or cached results.
- Updated local previews, current privacy documentation and store submission drafts to describe the simpler setup. Final browser/store acceptance remains pending.

## 0.7.10 — Chrome Web Store preparation

- Added a prominent data-handling disclosure and explicit, versioned consent. Post extraction, analysis and comment requests are blocked until accepted; withdrawing consent cancels work and removes page snapshots.
- Remembered API Keys now use password-protected AES-GCM 256 with PBKDF2 SHA-256, fresh salt and IV. Browser restart requires unlocking; session-only storage remains available. Legacy plaintext Keys require explicit migration or clearing.
- Added lock/unlock controls and generation-safe credential mutations so old asynchronous results and queued fact checks cannot continue after a lock, clear or withdrawal.
- Moved result caches to trusted browser session storage, reusable for at most 24 hours within that session. Browser exit, Key security changes and consent withdrawal clear them; old persistent caches are removed on upgrade.
- Added an included privacy notice, bilingual store submission drafts and a static privacy site prepared for GitHub Pages. Public URLs and actual store submission are still pending.
- Prepared shared release channels: GitHub draft previews and stable archives, with the same accepted installation ZIP used for Chrome Web Store publication. Added a complete installation/source bundle, an identical-byte `SuperX.zip` download alias, explicit channel guidance and installation-source fields in bug reports. No public release or store submission is performed by these helpers.

## 0.7.9 — GitHub Beta preparation

- Added an MIT license for original code and documentation, retaining Marked's third-party notice and excluding branding assets from the MIT grant.
- Replaced the development-oriented home page with English and Chinese installation, billing, behavior and troubleshooting guides.
- Added privacy, security-reporting and contribution / browser-acceptance documentation.
- Prune expired, malformed, future-dated and over-budget cache entries when the background worker initializes as well as after completed results; fresh cache hits are unchanged. The 24-hour period is a reuse expiry, not an exact-time disk-deletion promise.
- Added automated validation and deterministic installation ZIP / SHA-256 packaging. Repository cleanup prepares a reviewable public source export without publishing a GitHub release.

## 0.7.8

- Settings and popup use the browser's interface language before X has reported one. Unsupported languages fall back to English.
- After opening X, its UI language takes precedence and the last reported X language survives browser restarts. Browser fallback is not saved as if it came from X.
- Answer language remains independently controlled by Auto or the user's fixed selection.
- Recorded validation: 391 tests, 19 declared resources and 24 JavaScript syntax checks. Mocked cases include missing / failing language APIs, differing browser UI and web-preference languages, first setup, restarts and live UI switches.

## 0.7.7

- First setup defaults Remember Key on this device to checked. Existing explicit preferences and legacy session-only credentials are preserved.
- Clearing a Key keeps the remember preference; no implicit session-to-local credential migration.
- Simplified the settings switch label to Enable, with corresponding text across the supported UI languages.
- Recorded validation: 383 automated tests.

## 0.7.6

- Updated the settings and popup tagline to **Understand X. Fact-check as you scroll.** Localized UI versions follow X's interface language.

## 0.7.5

- Aligned the settings sidebar's visible wordmark, tagline, heading and navigation, without changing the source SVG artwork.
- Changed toolbar PNGs to a white foreground with a thin black inner edge, preserving alpha and four gaps.
- Redesigned the popup with X-style neutral colors, blue interactions, the SVG wordmark, light appearance and RTL support.
- Recorded validation: 370 tests, 19 resources and 24 syntax checks; mocked browser checks covered alignment, a 320 px popup, multiple locales, keyboard behavior and error feedback. No real Key or paid request was used.

## 0.7.4

- Redesigned settings around X's neutral colors, blue controls and thin separators, with section navigation and a sticky Save bar.
- Added responsive one-column forms, light appearance and RTL while preserving settings, prompts and storage preferences.
- Removed the toolbar icons' opaque white plate.
- Recorded validation: 370 tests, 19 resources and 24 syntax checks; mocked browser checks at 320, 375, 700 and desktop widths found no horizontal overflow.

## 0.7.3

- Changed English verification labels to **Fact check**. Replaced the ambiguous Partial answer label with Fact check incomplete, preserving the explanation and exposing safe failure diagnostics.
- Diagnostics distinguish output limit, connection, language mismatch, timeout, rate limit, access, provider error and unknown causes; no automatic paid retry or output-limit increase.
- Fixed false language rejection when Chinese output begins with an English proper name.
- Treat a completed API event as completion instead of waiting for socket EOF and misclassifying trailing connection errors.
- Gave queued fact checks regular dispatch opportunities; each actual request has its own timeout rather than spending it in the queue.
- Recorded validation: 370 tests, 18 resources and 24 syntax checks; mocked browser checks covered failure labels, diagnostics and retained explanations.
- Detailed technical evidence is in [the fact-check audit](docs/SuperX-0.7.3-fact-check-audit.md); old results without recorded errors cannot identify their original failure cause.

## 0.7.2

- Added a subtle 1 px separator between explanation and background fact check, following X's current border color and text inset.
- Added a waiting animation below the separator until fact-check text begins.
- Preserve stage boundaries during streaming and in new cached results. Do not guess boundaries in legacy caches, single-stage answers or failures without fact-check text.
- Recorded validation: 342 tests, 18 resources and 23 syntax checks; mocked light, black and dark-blue previews retained feed geometry and avoided horizontal overflow.

## 0.7.1

- Integrated the supplied SVG symbol into the expand control, right-column header, popup and settings. Interface foreground adapts to light, black and dark-blue themes.
- Added the supplied full SVG wordmark and 16 / 32 / 48 / 128 px PNG manifest icons.
- The supplied artwork retained its original paths and four gap masks. This records implementation provenance, not authorization to redistribute third-party-derived branding.
- Recorded validation: 331 tests, 18 resources and 23 syntax checks; mocked browser geometry remained unchanged.

## 0.7.0

- Renamed GrokFirst to **SuperX**.
- Removed X built-in Grok without a Key and URL-only interpretation. The supported provider is now xAI API, with built-in prompts by default and optional custom prompts.
- Migrate legacy native provider and URL interpretation selections to API / built-in prompts, preserving existing Keys, models, language, search settings and custom drafts. No Key means no model request.
- Kept old internal storage, port and module identifiers for upgrade compatibility.
- Recorded validation: 331 tests, 13 resources and 22 syntax checks; mocked settings confirmed supported modes and retained drafts, while right-column collapse / expand preserved original feed geometry.

## Before 0.7.0 — GrokFirst

Earlier iterations introduced editable prompts, full-post URL context, displayed-language synchronization, safer link / citation handling, restricted Markdown rendering and API Token reporting. Native Grok and URL-only modes described in that history do not apply to current SuperX.

Detailed legacy development records remain in [the historical archive](docs/GrokFirst-before-0.7.0.md). Current installation and behavior are documented in [README.md](README.md) and [README.zh-CN.md](README.zh-CN.md).
