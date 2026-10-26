# Release checklist

This checklist separates reproducible checks from manual browser and service checks. A passing mock test suite is not evidence that a particular X account, browser installation, or paid API request works.

## 1.1.0 GitHub Stable/Latest release — 2026-10-27

The maintainer-approved [1.1.0 GitHub Stable/Latest release](https://github.com/bwjoke/SuperX/releases/tag/v1.1.0) is published and verified. This section supersedes the candidate-only distribution status in the historical records below; their measurements and package hashes remain scoped to those earlier builds. The final [release record](RELEASE_1.1.0.md) contains the reviewed commit, CI links and artifact hashes. Chrome Web Store 1.1.0 is not submitted.

- [x] Complete the functional release candidate with the Custom trigger controls, immediate visible cache results, hover styling/countdown, same-account restoration and confirmed video-cover URL repair.
- [x] Pass **1,262 automated checks** and the existing **196 isolated browser checks**. Keep the recorded installed Windows Chrome/subscription evidence separate from controlled fixtures; do not expand API Key, Build, Edge/macOS, restart or natural-expiry acceptance by inference.
- [x] Review the media/API changes: the confirmed JPEG cover retains required format and size through API, OAuth and Build. Recognized image failures retain safe diagnostics and stop automatic replay. Record the remaining `src`/`currentSrc`, `video[poster]` and unavailable-image boundaries as follow-up work.
- [x] Credit proposals from 0xDenji-Ai (#1), risingjerry (#4) and ArronKong (#5) without claiming their code was merged. Thank PG2047 (#3) for security review and record the maintainer's explicit deferral; keep s4ndr1ver (#2) as a separate proposal. No public PR response is implied by this documentation.
- [x] Record immutable source commit `716bfa885984d43699734271834d8527159efbdd`, [successful three-OS CI](https://github.com/bwjoke/SuperX/actions/runs/40398983322) and [successful release workflow](https://github.com/bwjoke/SuperX/actions/runs/40399242400). Installation ZIP SHA-256: `f31914ad56cb4052f005cd6d30491a924f582c33f977b6dd1fad941b07a52268`; source ZIP SHA-256: `36398000d6c6f4d5c81575ee37f34c69665497a1b28e5c552788be552095d59e`.
- [x] Publish the reviewed release as GitHub Stable/Latest at `2026-10-26T20:52:24Z` (October 27 in Asia/Shanghai) and verify its public installation/source ZIPs match workflow downloads byte for byte. Preserve the source tag, assets and inventories.
- [x] Deploy the website privacy page separately and verify the canonical HTTPS page returns HTTP 200 with 1.1.0 content. Website deployment does not establish Chrome Web Store publication.
- [ ] Upload the same accepted installation ZIP to the Chrome Web Store later. Submission, approval and publication remain separate statuses; the last verified public listing is 0.9.12.

The security proposal in PR #3 is intentionally deferred, not represented as completed. Existing media-discovery edge cases are also recorded in the release notes. These follow-ups do not change the maintainer's authorization for this GitHub release.

## 1.1.0 custom-trigger candidate — 2026-10-26

Local candidate only. Includes the earlier 1.0.1 reply-spacing and visible-input repairs without replacing either saved 1.0.1 package or any published 1.0.0 asset.

- [x] Keep Automatic as default; share Automatic / Custom / Paused between popup and Settings. Store custom options independently with native radio/checkbox semantics and all twelve UI languages. Initial custom options: manual button, one-second button hover and detail main enabled; whole-post hover and detail replies disabled.
- [x] Separate trigger intent from cache bypass. First explicit or hover checks may use cache; repeated hover displays results; only an explicit recheck bypasses cache. Coalesce matching in-flight post identities even when X renders multiple copies, and mirror progress/results without another request.
- [x] Gate post jobs in the worker at admission, after asynchronous preparation and at dispatch. Cross-tab mode changes remove newly disallowed unstarted automatic jobs without invalidating accepted running jobs, explicit queued checks, or draft checks. Mode/trigger-only changes do not alter cache or paid-job revision.
- [x] Compare the current detail route by status ID, use current DOM order for ancestors versus following replies, keep nested quote controls out of the main header, and match native icon/control geometry including short rows. Continuous mouse hover resets after leave, scrolling, backgrounding or modal entry; synthetic/touch hover does not trigger a request.
- [x] Preserve unsaved unrelated Settings edits when the popup switches mode; merge unchanged trigger preferences from the latest worker state during settings, Key and Build saves. Pausing remains available without a valid provider connection.
- [x] Pass 1,226 automated checks and 80 isolated real-browser interaction/layout checks using production code with mocked storage/provider responses. Zero browser errors and external requests. Coverage includes the native three-way selector, all five conditions, delay resets, duplicate-request prevention, explicit recheck, paused draft checks, detail ID aliases, ancestor reordering, quoted Grok exclusion and narrow/RTL layouts. The new browser report is at `artifacts/trigger-modes-preview/report.json`.
- [x] Build the 51-file installation ZIP as `artifacts/preview-1.1.0-custom-triggers/SuperX-1.1.0.zip`, SHA-256 `00cf14dac7068f0e5f08a3cf521993757e0d9709578926395fcbce1e9185d601`, and compare its bytes against a fresh deterministic archive from current production files. Keep earlier candidate and public packages unchanged.
- [x] After the maintainer's reload, inspect installed Chrome's X homepage: overlay reports version 1.1.0; Custom mode displays one SuperX control immediately before the native Grok control. The measured host is 20 x 20px and its symbol approximately 19.33px wide, matching the native Grok SVG width; idle visible cards did not start generation. Save `artifacts/preview-1.1.0-custom-triggers/live-20261026/custom-feed-idle.png`. This establishes version, observed idle behavior and geometry only, not successful inference or all trigger settings.
- [x] Fix a separately confirmed cold-worker lifecycle defect: a temporary OAuth restoring/refreshing snapshot discarded a deferred manual click. Retain same-account intent until readiness, preserve accepted queued/running checks, and reject deferred actions after account replacement or definitive authentication failure. Pass 1,229 automated checks and repeat all 80 isolated browser checks, with zero browser errors/external requests; independent review found no blocker in the narrow fix.
- [x] Save the updated 51-file package separately at `artifacts/preview-1.1.0-custom-triggers-recovery/SuperX-1.1.0.zip`, SHA-256 `e6e618f87da2073eaf441213bd49edf7f92e6428c59399c3a92c72bebce7f792`. The earlier candidate remains unchanged. The installed browser inspected above predates this recovery fix and needs another reload before claiming its live acceptance.
- [x] The maintainer confirmed performing an actual post-control click followed by Pause. Subsequent DOM inspection showed the new post buttons removed, two completed sourced Grok 4.3 answers (36,239 and 29,354 reported tokens), and remaining visible cards marked `Auto analysis paused`; later visible cards stayed paused while the feed scrolled. Save `live-20261026/paused-feed.png` beside the first candidate. The tool did not capture the start-to-finish transition, so this confirms observed results and paused UI, not exact cancellation timing or zero provider requests.
- [x] The maintainer reloaded the recovery candidate and restored Custom mode. Open a fresh real X detail page for `https://x.com/NASA/status/1956376225074552934`: only the main post begins automatically and completes with sourced Grok 4.3 output (28,326 reported tokens). After reloading this agent-created tab, the same answer is byte-identical, the status explicitly reads `Cached · Search used`, and the tooltip states `Cached result; no new tokens for this part.` Four loaded comments remain idle with empty answers. Evidence: `artifacts/preview-1.1.0-custom-triggers-recovery/live-20261026/`.
- [x] Complete the core installed-Chrome acceptance on the recovery candidate. The maintainer confirmed all three final mouse tests as normal: with detail-main auto disabled, the NASA page stays idle until a one-second button hover restores its cached answer; with button hover disabled, a one-second whole-post hover restores the answer; a manual check of a new post continues after switching to Paused and changing tabs, without restarting. This is maintainer-reported interaction evidence in addition to the directly observed detail-main/cache/default-idle-comment results above. Record `live-20261026/maintainer-acceptance.json` beside the recovery package.

The browser interface refused access to the extension Settings URL. Its clicks on allowed X post controls produced no observed generation; the cause of that automation-only observation is not established. A native-browser takeover request also timed out. Do not infer a provider failure from those automation attempts. The maintainer completed the real mouse interactions recorded above after reloading the recovery candidate. Positive detail-reply triggering, popup-to-Settings synchronization and forced cold-worker/OAuth recovery remain covered by automated/isolated tests rather than separately observed installed-browser runs. Real-provider acceptance in this candidate used the existing Grok subscription with Grok 4.3; it does not establish new API Key/Build, Edge or macOS acceptance. GitHub/store publication has not been performed for this candidate.

### Visible cached answers correction — 2026-10-26

The maintainer clarified that Custom limits new paid work; it must not hide existing cached findings until a trigger. This follow-up supersedes the earlier cache-on-hover acceptance behavior above, without replacing its saved candidate package.

- [x] Separate a visible post's local cache lookup from generation admission. Matching saved answers render immediately in Automatic, Custom (including all triggers off) and Paused. A miss stays neutral and can start paid work only through the existing trigger policy. No new extension permissions.
- [x] Keep the worker lookup outside `ANALYZE`, authorization refresh, remote media loading, history writes, concurrency slots and provider discovery. Preserve current account/model/language/effort/search/prompt cache keys and expiry; missing OAuth identity defers safely.
- [x] Keep passive lookups outside progress and keepalive state; deduplicate simultaneous copies, retry on viewport reentry rather than every tick, and bound a missing response. Account/config changes, recycled posts and fresh manual checks reject stale cache replies. Duplicate copies join the active manual result instead of displaying an older cached one.
- [x] Pass 1,243 automated checks, including 278 backend and 284 content checks. Independently review cache-only side effects, account boundaries, idle wake behavior and duplicate-post races.
- [x] Complete 48 current information-feed checks and retain 49 unchanged popup/Settings checks: 97 passing isolated browser checks, zero page errors and external requests. The original combined run's single failed test assertion read a Shadow host instead of its internal Token label; retain that raw report and the successful corrected feed rerun separately. Visually inspect `custom-cache-visible.png`: saved findings appear without interaction while the uncached row remains idle.
- [x] Package the correction separately at `artifacts/preview-1.1.0-visible-cache/SuperX-1.1.0.zip`, SHA-256 `6066440ee27f368212cd8e251055e8df463d0136b85d2572a49d062b54e40ed1`. The directory includes validation, the combined 97-check acceptance report, raw source reports and a screenshot. Preserve the previous recovery package and all public releases.
- [ ] Reload this correction in installed Chrome to confirm passive cached-answer restoration. The prior installed-Chrome acceptance predates this correction; its real-provider results do not establish the new passive cache behavior.

### Popup trigger summary — 2026-10-26

- [x] Add a read-only five-row summary directly below the popup mode selector, shown only for Custom. Display actual saved on/off values and both hover delays; show button hover as unavailable when the manual button is disabled. Preserve all saved settings and reflect external updates. Replace the repeated Custom hint with a short reminder that existing answers remain visible.
- [x] Localize all compact labels and states in the twelve UI languages. Pass 1,246 automated checks and 75 isolated UI checks, including English/Chinese/Arabic, dark/light themes, default/changed values, dependency state, visibility outside Custom and narrow layouts without overlapping columns.
- [x] Save the unchanged-version candidate at `artifacts/preview-1.1.0-trigger-summary/SuperX-1.1.0.zip`, SHA-256 `0032f93f22a1da22c0131e6ade3a7362db64c3ef86146dcc46ac26d1e6cf6ebf`. It retains the visible-cache correction above. The directory includes the validation log, UI report and reviewed screenshots; previous candidates remain unchanged. This popup-only follow-up does not establish a new installed-browser or provider run.

### Hover default and quoted video-cover repair — 2026-10-27

- [x] Enable whole-post hover by default with a one-second delay; retain previously saved explicit `false` values and custom delays. Update the fallback, defaults, current documentation and default-state UI assertions. Pass 187 focused Core/UI checks and 121 isolated trigger/UI checks, with zero page errors or external requests.
- [x] Investigate the maintainer's repeated HTTP 400 for `https://x.com/kylewmi/status/2114725817838444654`. The profile/feed contains a quoted video cover with an extensionless path plus `format=jpg&name=360x360`; its detail-page counterpart has a `.jpg` suffix. Read-only public HEAD requests prove the feed URL and `.jpg` counterpart work, but both the bare path and format-only path return 404. `format=jpg&name=orig` works. Preserve the format and supply fixed `name=orig` in the final image input; continue removing unrelated query parameters. Evidence is in `http-evidence.json` beside the new package.
- [x] Keep thumbnail formats within JPEG/PNG support shared by API, OAuth and local Build. Add a Build image-loader regression for the normalized extensionless URL. Keep existing fixed-filename thumbnail behavior for unsupported format hints.
- [x] Classify only the explicit structured provider codes `invalid_image`, `invalid_image_url` and `image_parse_error` as `API_IMAGE_INPUT`, with localized media-specific guidance. Retain sanitized diagnostic classification without raw image-error echoes; do not automatically retry a rejected image. Generic HTTP 400 and arbitrary prose remain generic request failures.
- [x] Pass 1,257 automated checks, including the actual feed-shaped quoted-cover input, three connection paths, safe errors/diagnostics and terminal retry behavior. The maintainer reloaded and confirmed that this exact post now checks successfully from the author's profile timeline without entering its detail page. This is maintainer-reported real-provider evidence; the discarded original error body was not available for inspection.
- [x] Save final candidate `artifacts/preview-1.1.0-thumbnail-final/SuperX-1.1.0.zip`, SHA-256 `3a95dd060dfb09e4f9b802512e8094fe131999e5732cbb5e374fb9dbf22fd291`. Retain the preliminary `thumbnail-fix` package and all older candidates. The final package additionally limits format hints to JPEG/PNG for Build compatibility; that final small change does not alter the JPEG URL confirmed by the maintainer. No GitHub or store publication is part of this repair.

### Trigger order and popup copy — 2026-10-27

- [x] List button hover before whole-post hover in both Settings and the popup summary. Keep checkbox values, saved delays and the button-hover dependency unchanged.
- [x] Remove the existing-result reminder from the Custom popup footer and retain it in Settings. Use Pause for the English mode-selector label while preserving paused-state status text.
- [x] Pass 15 focused unit/structure checks and 93 isolated UI checks across English, Simplified Chinese and Arabic in light/dark themes, with zero page errors or external requests. Inspect the Chinese popup and English Pause selector screenshots in `artifacts/trigger-modes-preview/`; `ui-report.json` records this UI-only run. No additional installed-browser/provider acceptance or publication is implied.

### Native post-header hover — 2026-10-27

- [x] Inspect the current X Grok control without triggering it: its button is approximately 19.335 × 20px, its symbol is 19.335 × 18.75px, and its separate rounded hover layer is 35.335 × 34.75px. The symbol uses muted gray while the wrapper inherits the page foreground. The supplied screenshot's hover pixels match native blue at ten-percent opacity.
- [x] Match that separate hover layer and symbol color on SuperX while retaining the original action-row box, trigger handlers and native DOM. Prefer the rounded absolute child over a rounded button wrapper; avoid saving the hovered Grok/caret color as the idle color. Keep the blue and tint consistent across themes, with a short color transition and reduced-motion support.
- [x] Pass 286 content/interaction regression tests, including small rounded wrapper versus larger hover layer and the hovered-caret fallback. The local candidate is `artifacts/preview-1.1.0-native-hover/SuperX-1.1.0.zip`, SHA-256 `6b89860ccd327b963749012dfa2b6d559e39c0761bca3407b36347c355cd90a2`, byte-checked against the current 51 production files. Earlier packages and public releases remain unchanged.
- [x] Pass 25 isolated browser hover checks across dark/light, desktop and 375px RTL layouts, including exact native halo geometry/tint, idle/hover/leave colors, missing-Grok fallback, keyboard focus, unchanged native markup/post heights and zero model requests. Save `halo-report.json` and reviewed screenshots beside the package. The current installed extension was measured read-only; the updated code was exercised in the isolated browser, not reloaded into the user's live tabs.

### Hover countdown foreground — 2026-10-27

- [x] Fill the SuperX logo from physical left to right during a pending new post-hover or button-hover check. Reuse each existing timer's start/deadline; follow the first due condition and preserve the other timer's elapsed time if the button is left while the pointer remains over the post. Re-rendering does not restart the animation or add a model request.
- [x] Clear visual progress on leave, scroll, blur, pause, cache completion or generation. Do not show countdowns for existing results, active/disabled checks or a zero-second delay. Reduced-motion disables the sweep while preserving the configured wait. Unfocused windows cannot rearm or dispatch hover checks.
- [x] Pass 290 content/interaction checks, 36 isolated countdown checks and all 25 native hover regressions with zero browser errors or external requests. Verify dark/light and physical left-to-right progress in RTL. Save reports and reviewed mid-progress screenshots beside the package; these are isolated browser checks, not new live-provider acceptance.
- [x] Save `artifacts/preview-1.1.0-hover-countdown/SuperX-1.1.0.zip`, SHA-256 `0f874dc9542f511b98d7fa858bac81ce9884b3382a399682ccc4fad80a233e22`; keep prior candidates unchanged.

## 1.0.1 reply-spacing candidate — 2026-10-25

Local candidate only; the published 1.0.0 tag and installation files remain unchanged.

- [x] Inspect an installed Chrome reply dialog: the native character counter has a 30px wrapper and a centered 20px SVG whose circle paints to 22px including its stroke. Comparing only wrapper boxes leaves visibly unequal gaps. The temporary test reply was cleared, the dialog closed, and the existing homepage draft preserved; no check or post was submitted.
- [x] Balance the SuperX button against visible adjacent controls, accounting for counter strokes, native wrapper insets and nested button margins. Skip hidden siblings and retain RTL/reversed-row support. Ignore distant controls separated by flexible toolbar space; only SuperX margins change.
- [x] Pass 1,191 automated validation checks and 542 isolated control checks, including 274 focused spacing checks. The isolated checks cover modal/inline replies, narrow layouts, empty/typed/cleared drafts, show/hide stability and unchanged native styles, with zero runtime errors or external requests.
- [x] Package `artifacts/preview-1.0.1-reply-spacing/SuperX-1.0.1.zip`; SHA-256: `3ed16ef2e2efea8fc081b5dd35f8a36edba1a5043b22f3ee19051e0ef63169d4`. The adjacent reports and screenshots are isolated fixture evidence, not installed-candidate acceptance.
- [ ] After the maintainer reloads 1.0.1, measure the installed candidate in both modal and inline replies. GitHub publication and Chrome Web Store upload are separate actions.

October 26 input-extraction follow-up:

- [x] Reproduce hidden retained header/media contamination in local DOM fixtures. Ordinary post extraction previously accepted hidden timed permalinks and hidden image/video nodes, unlike the displayed-body filter. A hidden stale permalink could identify a different post; an extra stale image could change the provider input. This establishes extraction defects, not the cause of the maintainer's specific feed error without its URL and diagnostics.
- [x] Use the existing hidden-state rules for post identifiers, source metadata, media and quotation branches. Preserve screen-independent extraction: an offscreen, zero-size, unloaded image is still eligible unless hidden. Visible image ownership remains separated across target and nested quotes.
- [x] Pass 1,197 full automated checks, including six new regressions and a comparison proving that hidden stale feed nodes yield the same request as the equivalent clean detail page. No live inference or post was submitted for this investigation. The currently connected feed had no retained error card, so specific incident attribution remains pending.
- [x] Save the combined local candidate as `artifacts/preview-1.0.1-feed-input/SuperX-1.0.1.zip`, SHA-256 `5fae59f1366f835ae8c97d807a2b625a087c0da5b09e7e26a0992adb0f95167d`, retaining the prior spacing-only archive.
- [ ] Reproduce the reported failure with its post URL/error text and confirm the repaired input in the installed candidate. Keep the earlier reply-spacing package unchanged and save this follow-up in a separate candidate directory.

## 1.0.0 stable milestone — 2026-10-24

The maintainer approved the current candidate for a 1.0.0 GitHub stable release. The candidate's post/draft/image implementation and the latest localized recommendation/summary refinements are retained; this version change does not introduce a new provider or permission. Chrome Web Store submission and website deployment are separate actions.

- [x] Preserve the 0.9.14 functional evidence below: 1,191 automated checks, 1,631 isolated composer checks, 81 image-composer checks and 126 recommendation-layout checks. The final summaries have also passed the 132-character package validation for all thirteen locales.
- [x] Record installed Windows Chrome subscription/OAuth with Grok 4.3: published images, parent-image reply context, image-only draft arithmetic, retained hide/show result and disabled empty-draft behavior. These were tested before the version-only promotion; no fresh API Key/Build live inference, macOS or Chrome-store delivery claim is made.
- [x] Update manifest/package versions, current README and bundled privacy metadata to 1.0.0. Preserve old releases and every already-distributed candidate archive.
- [x] Validate the 1.0.0 source and final installation/source archives for the maintainer-authorized GitHub publication. Installation SHA-256: `72480dd586d962e3b67004348072b6a9b4bd0c6f8fad345183bb85fc82f892fe`. The release page records its commit, tag and published asset checksums.
- [ ] Upload the exact 1.0.0 installation ZIP to Chrome Web Store and separately deploy the prepared privacy page. A GitHub release does not complete either step.

## 0.9.14 image-context candidate — 2026-10-23

Local candidate only. The published 0.9.13 Preview and 0.9.12 Stable files remain unchanged; this work does not publish a GitHub release, deploy the website or submit a store update.

- [x] Pass **1,191 automated validation checks**, including native image inputs across API/OAuth/Build, target-vs-context ownership, two levels of quotation, image-only drafts, original-resolution PNG/JPEG URLs, deduplication and bounded image/text input.
- [x] Pass **81 isolated image-composer checks** across all four post/reply scenes and both themes. Explicit Check captures the native uploaded preview, typing does not read bytes, image replacement marks results stale, removal disables an image-only check, capture timeout/cancellation cannot send a late request, and prepared data is released. No provider requests or page errors occurred.
- [x] Confirm private image data and arbitrary provider echoes do not enter diagnostics; draft jobs remain excluded from persistent history and answer caches. Published image provenance and model output may still be present in ordinary history/results.
- [x] Check a real NASA image through the production Build loader in a fresh Edge 155 MV3 extension with no host permissions. The original JPEG returned HTTP 200/CORS, 206,142 bytes, and produced native ACP image data. The ACP service was a fixture and made **zero model requests**; this verifies transport/CORS, not live model comprehension.
- [x] Verify explicit failures for unsupported Build image capability, dropped images, unavailable bytes and input limits. Keep the existing tool restrictions and credentials-omitted image loading; no new manifest permissions.
- [x] Update bundled/repository/local-website privacy copy and thirteen short summaries. Check bilingual privacy layouts at desktop and narrow widths. The online website and store fields have not been changed.
- [x] Pass **1,631 full isolated composer checks with 53 screenshots**, including the new image checks and existing toolbar, scrolling, context, state and localization regressions; zero page errors and external requests. Package all 51 production files as `artifacts/preview-0.9.14-media-context/SuperX-0.9.14.zip`, SHA-256 `9e4e9c7b72e26f3340f0c8fed7640e4e70249db21c99de6d642ea2060c866d77`, and verify it matches current production contents.
- [x] On October 24, after the maintainer reloaded the candidate, run installed Windows Chrome with subscription OAuth and Grok 4.3. The NASA post and a pictured reply produced image-specific observations; a manual reply about the parent photo's visor and tool returned 5,307 reported tokens. An unpublished image-only draft, with empty editor text and no added alt description, correctly read a PNG containing “37 cartons / 8 items per carton / Total: 306 items” and corrected it to **296, not 306** (4,263 reported tokens). Hide/show retained identical output and usage; removing the last image disabled Check. The temporary image and reply text were removed, dialogs closed, and nothing was published. Evidence: `artifacts/preview-0.9.14-media-context/live-20261024/`. These observations establish the tested image input path, not universal visual accuracy.
- [ ] Complete separate live API Key/Build and macOS image inference acceptance; their transport fixtures and the Build CORS probe do not establish real-account model comprehension.
- [x] On October 24, add localized recommended labels to Grok 4.3 and no reasoning in all three connection settings, with one small retrieval/latency/Token guidance paragraph. Pass the existing 1,191 validation checks and 126 focused isolated UI checks across API/OAuth/Build, Chinese/English/Arabic, desktop/narrow widths, and language changes preserving preselected alternatives. Save the updated candidate separately at `artifacts/preview-0.9.14-recommended-model/SuperX-0.9.14.zip` (SHA-256 `3666bbd8b3e76db0c57a04395a1b7bd9f8e1db9696509d6213e9c877e27ad600`); preserve the earlier image-test package above.
- [x] Shorten that recommendation at the maintainer's request: remove the retrieval/complex-question sentence in all twelve UI languages and all three HTML fallbacks. Keep only speed, concise answers and lower Token use. The copy-only revision passes 21 localization and six structure checks; package `artifacts/preview-0.9.14-recommendation-short/SuperX-0.9.14.zip` has SHA-256 `4e44562091993232688eed2eddb07a1597b85ecf7c4ad36e26a5f33749be0073`. Previous candidate packages are retained.
- [x] Restore 24-hour browsing history in all thirteen localized package summaries while retaining post/draft checks, evidence sources and connection choices. Every summary fits the 132-character bound (Simplified Chinese: 81 characters). Package `artifacts/preview-0.9.14-summary-history/SuperX-0.9.14.zip` has SHA-256 `8323beba65ff929a22307b2f61e07f48d72041696feb56f55e2eecb35c69a014`; earlier candidates remain unchanged.

## 0.9.13 draft-check Preview — 2026-10-22

Published as a GitHub Preview with explicit maintainer authorization. Chrome Web Store and GitHub Stable/Latest remain 0.9.12. The functional and visual checks below have distinct scopes; final native-installed visual acceptance and store submission remain separate.

- [x] Pass **1,143 automated validation checks**, including the three draft transports, selected model/effort, draft-language following, shared fact-check core with separate context instructions, shared concurrency, configuration cancellation and exclusion from history, caches and stored diagnostics.
- [x] Pass **1,551 isolated browser checks with 53 screenshots** in the final October 22 pre-release run, exercising production composer code across all four post/reply contexts, two themes and three widths, plus full content-script handshakes, worker wake, editor remounts, native counter/submit controls, changed drafts, stale callbacks and source isolation. Zero page errors and zero external requests were recorded. These fixtures use simulated replies and make no provider requests or X publications.
- [x] After the final ancestor merge repair, pass **22 focused thread-context checks** with zero page errors, including a root disappearing while a previously unseen intermediate reply loads. This targeted run supplements the full browser run above.
- [x] Pass **21 focused search-tooltip checks** with zero page errors: observed/unknown/pending metadata, keyboard-accessible details, unchanged visible Token heading, partial errors and cleared records on new attempts. Search counts are omitted when the transport does not provide a consistent count.
- [x] Verify a circular SuperX logo control with localized accessible labels and hover hints, persistent visibility with empty drafts disabled, placement immediately before native Post/Reply, native colors/height, animated header progress, reported Token hover details and header recheck. The logo occupies about 64% of the circle (23px at the normal 36px height); the empty-draft English hint is “Enter a draft to fact-check.” No separate completion row, reply-context message, metadata disclosure, website footer or enlarged-reading view remains; reply context still reaches the request.
- [x] Pass **270 focused control-layout checks** after the October 22 visual refinement: four composer contexts, light/dark themes, desktop/narrow widths, empty → typed → empty transitions, no disabled-button requests, fixed dimensions, symmetric spacing that includes native margins/gaps, and restored existing results without replay. Ten opacity cases verify native disabled colors within one pixel-value unit, including private wrappers without duplicating shared-ancestor opacity. This is isolated-browser acceptance, not a new live provider run.
- [x] Verify state-independent circle dimensions and stable native toolbar/counter/publish geometry through Check / Hide / Show. Across 12 animation frames, the indented answer separator stays at the original native edge's vertical position; screenshot pixel samples confirm the indented line when open and full native line when closed. Cover independent native separators, bordered composers, narrow avatar-column boundaries, RTL and unsupported-layout fallback.
- [x] Use actual non-overlay scrollbars to verify stable modal content width before and after overflow, native wheel scrolling, nested and flex/grid scroll containers, unchanged unrelated containers, remount retention, shared references, original inline value/priority restoration and respect for subsequent X changes or stronger native CSS rules.
- [x] Verify preset/custom settings persistence: the same fact-check core applies to all three contexts, with separate new-post and reply context instructions. Preserve genuine legacy custom text; migrate exact retired defaults. Keep quoted-post or reply context in a separate auxiliary input before the final draft target, preserve the draft and custom prompts within the 58,000-character request budget, and redact all context on errors. Check all three sources, unrelated/adversarial context, optional draft search, unchanged mandatory ordinary-post retrieval, and prompt changes that preserve accepted jobs and existing post caches. These are program-level checks, not a semantic evaluation of live Grok answers.
- [x] Verify root → earlier replies → direct-parent collection, exclusion of unrelated posts and nested quotes, independent quoted new posts, root-plus-nearest-five bounds, retained context across virtualization, matched modal inheritance and clearing on unrelated navigation. A short denial can reach the API with the event described in its original thread; this verifies the supplied input, not the eventual model judgment.
- [x] Inspect the actual Windows Chrome X DOM to cover its deeply nested expanded reply editor, column-wrapped submit button and character-counter branch. An earlier local 0.9.13 candidate is visible in the maintainer's working browser with a completed Grok 4.3 draft check and reported usage; this observation does not accept the final UI rebuild or all three live connections.
- [x] After reloading the functional context repair in Windows Chrome, check a reply asking which mission supplied the samples on the NASA source post: Grok 4.3 identified Apollo 17 (16,493 reported tokens). A quoted-post draft asking about the orbiter identified Lunar Reconnaissance Orbiter and its role (29,917 reported tokens). Both answers appeared below the toolbar; hide/show retained the same answer and usage with zero measured horizontal drift. Editing marked the reply result stale without automatic resubmission. Temporary drafts were discarded; nothing was published. This was the functional candidate before the final button-only refinements; it is not new live acceptance of each later build.
- [ ] Recheck the final installed visual refinements and remaining relevance cases (a short denial referencing the original thread and an opinion reply). Current logo, disabled-color and spacing acceptance is isolated-browser coverage, not a final installed-build pass.
- [ ] Complete separate live API Key/Build and macOS acceptance where required, without substituting credentials or claiming automatic provider fallback.
- [x] Repair the configured local Build recovery case: **16 focused checks** confirm that an initially unavailable or post-handshake unavailable service restores the explicit retry action without automatically submitting or losing the prior draft/result.
- [x] Reproduce the sticky-toolbar fallback with the actual expanded-composer structure. Keep the findings outside the sticky containing block and preserve native styles and the editor's left inset; **27 focused checks** cover long output, scrolling, toggling and new-post quotation cards at desktop and narrow widths.
- [x] Compare actual Chrome DOMs: the homepage composer, expanded ordinary-post reply, expanded nested reply, and new-post modal all use a native sticky action branch (`top: 0; bottom: -1px`). The defect is not specific to reply depth; it appears when no usable outer separator is found and the fallback places a long result inside that branch's containing block.
- [x] Update bundled/repository privacy notices, the local bilingual website privacy page and thirteen local store descriptions for OAuth, Build, bounded reply/quote context and unpublished drafts. The local website page passes structural and four isolated language/width checks; private website/store files stay outside the public source archive.
- [ ] Deploy the prepared public privacy page and apply the store descriptions, screenshots and submission fields. The October 22 audit confirmed that the live privacy page was still the October 7 API-only version; local validation does not establish deployment. GitHub Preview publication does not perform those external updates.
- [x] Prepare the Preview release after maintainer acceptance of the remaining documented limits; preserve all published 0.9.12 assets and Stable/Latest status.

### 0.9.13 官网隐私与商店字段更新步骤

这些是发布操作指引；本次修复没有部署官网或改动商店后台。

1. **官网隐私页**：仓库 `PRIVACY.md`、`extension/privacy.html` 与本机 `website/public/privacy/index.html` 中英文正文已按当前数据流更新，保留官网布局和语言切换。内容包括订阅 OAuth、API Key、本机 Build 三种连接；OAuth 凭据的保存、刷新和退出；主动点击才发送草稿及有界上下文；草稿附件不发送；草稿结果仅在运行内存保留，不写历史、缓存或诊断日志。普通设置和浏览历史仍未加密，不能把凭据加密描述成全部数据加密。线上部署仍需下一步单独完成。
2. **预览与部署**：在仓库的 `website/` 目录执行 `npm run preview`，检查 `/privacy/` 的中英文。确认后执行 `npm run deploy` 更新既有 `superx-official` 项目；或执行 `npm run package`，把 `website/artifacts/SuperX-website.zip` 上传到该项目的 Cloudflare Pages Direct Upload。使用 `website/public/` 这套完整官网，避免用旧独立隐私站覆盖首页。部署后直接打开 `https://superx.vip/privacy/` 核对日期和实际正文，不能只依靠结构检查脚本。
3. **Chrome 后台 → 商品详情**：更新 13 个商店语言的长介绍和对应截图。本机 `chrome-web-store/description.*.txt` 与 `listing-locales.json` 已为 0.9.13 准备，包括草稿核查及其隐私说明；按文件对应语言粘贴。上传安装 ZIP 只更新程序和 manifest 的本地化短摘要，不会自动替换长介绍、截图或审核说明。
4. **Chrome 后台 → 隐私权**：单一用途加入“核查用户正在撰写的帖子或回复”；网站内容说明包含用户主动提交的未发布草稿与可用上下文；X/API 主机权限理由补充这一用途。政策 URL 仍为 `https://superx.vip/privacy/`，其公开内容应先同步。此功能未新增扩展权限。
5. **Chrome 后台 → 测试说明**：增加新帖及回复的测试步骤：输入文字后点击发布按钮附近的 SuperX 图标；结果应在工具栏下方；编辑内容后显示过期提示，点击重新核查才再请求；收起/展开和切换标签页不重复请求；不自动发布，草稿不进入浏览历史。审核凭据仅填后台私有字段。
6. **版本材料与提交**：把私有 `submission.en.txt`、`submission.zh-CN.txt` 和 `listing-locales.json` 的版本记录更新为最终候选，保留真实验收边界。最终实机验收通过后上传 `SuperX-0.9.13.zip`，不上传 `-source.zip` 或网站 ZIP。检查商品详情、隐私、测试说明、截图之后再提交审核。

可加入长介绍的新增功能段落（其他语言也需同步，不替代完整隐私政策）：

> **发布前核查**：在 X 撰写新帖或回复时，输入文字后点击 SuperX 按钮，即可在工具栏下方查看核查结果。引用帖和可用对话上下文帮助理解你所写的内容。只有主动点击才会发送草稿；附件不参与核查。草稿结果仅在运行内存保留，不写入浏览历史、回答缓存或排障日志。SuperX 不修改文字，也不会替你发布。所选账号的额度、费用和服务商数据政策仍然适用。

> **Check before you post**: While writing a post or reply on X, enter text and click the SuperX button to see fact-check findings below the toolbar. Quoted posts and available conversation context help interpret your words. Draft text is sent only when you request a check; attachments are excluded. Draft results stay in runtime memory and are not saved to browsing history, the answer cache or diagnostic logs. SuperX does not edit your text or publish it for you. Your selected account's usage limits, charges and provider data policies still apply.

## 0.9.12 Stable promotion — 2026-10-20

[Stable release](https://github.com/bwjoke/SuperX/releases/tag/v0.9.12) · [Installable ZIP](https://github.com/bwjoke/SuperX/releases/download/v0.9.12/SuperX.zip) · [Chrome Web Store](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo). This repair keeps X's inline reply toolbar out of primary-navigation detection and updates rail geometry when native navigation changes height. First published as Preview on October 19, it became Chrome Web Store and GitHub **Stable/Latest** on October 20. The layout checks below belong to the October 19 installed candidate.

- [x] Pass **263 content regressions** and **1,082 automated validation checks**, including inline reply controls, real navigation, hidden/duplicate tabs, temporary zero/oversized navigation, observation cleanup and preserved existing answers.
- [x] Pass **912 isolated browser checks across 12 scenarios with 38 screenshots**, covering the layout repair. These do not establish new live provider or installed-browser account acceptance.
- [x] Validate exported public source with **1,082 checks** and rebuild the installation ZIP with identical bytes.
- [x] After the user reloaded the extension, exercise actual installed **Windows Chrome 0.9.12**: focus the inline reply editor, scroll away and back, open an image, and open/close the new-post dialog. The rail returns correctly and the four existing completed answers remain available.
- [x] Record the accepted installation ZIP SHA-256: `c34d378b2eb37660a0d029c0e2c36b2dd4077a3548413a5a9b35ca55d293c885`. The versioned ZIP and `SuperX.zip` alias must have identical bytes.
- [x] The maintainer confirmed store publication. A direct request to the public listing and the Google-delivered CRX both report **0.9.12** on October 20.
- [x] Compare the delivered CRX with the accepted installation ZIP: **49 ordinary files byte-identical**, only Google's `update_url` added to the manifest, and only `_metadata/verified_contents.json` added. CRX SHA-256: `2b96c5b4ff1b4043d7f4cc236e7d0230ce1ba5748ef30b724ba367a186ba1386`. This is a payload comparison, not installation or independent CRX-signature verification.
- [x] Promote the same GitHub release to Stable/Latest without moving its tag or replacing its seven attachments. Preserve all published 0.9.11 files as historical artifacts.
- [ ] Complete a new store-installed functional test separately; public availability and payload comparison do not establish that pass.

This is targeted layout acceptance. It does not add evidence for the earlier pending four-scope full-browser restart, natural token expiry, installed Edge/macOS operation or new live API Key/CLI acceptance. Those scopes remain as recorded below.

<a id="0911-preview--2026-10-18"></a>

## 0.9.11 Stable promotion — 2026-10-19

[Archived release](https://github.com/bwjoke/SuperX/releases/tag/v0.9.11) · [Installable ZIP](https://github.com/bwjoke/SuperX/releases/download/v0.9.11/SuperX.zip). The official listing reported **0.9.11** on **October 19, 2026**. That release was promoted from Preview to **Stable/Latest** by changing status only; its tag, attachments and hashes were preserved. Version 0.9.12 superseded it on October 20; both 0.9.11 and 0.7.26 remain historical archives.

The functional evidence below was collected on October 18 from the installed Windows Chrome candidate. Store publication is a distribution result, not a new store-installed functional pass or evidence for pending browsers, restart or expiry scenarios.

- [x] Run the current automated validation: **1,057 tests passed**. These use controlled browser/provider fixtures and do not establish live account eligibility or billing.
- [x] Complete **16 isolated Edge Manifest V3 locale-selection checks**, covering packaged metadata language selection. This is isolated browser coverage, not acceptance of the installed extension on a real Edge account.
- [x] Verify the current four-scope request omits profile/email; keep existing connected grants and reject unfinished authorizations from the retired scope set. Do not claim existing grants were retroactively reduced.
- [x] Record fresh user-approved four-scope sign-in in installed Windows Chrome and the earlier live Grok 4.3 Fact Check with four clickable sources (23,754 reported Tokens).
- [x] After the latest extension reload and X refresh, retain the four-scope login and complete a new live **Grok 4.3 Fact Check: 30,226 Tokens (29,693 input / 533 output), six distinct citation sources**.
- [x] Generate exactly **three comment drafts: 1,373 Tokens (1,305 input / 68 output)** in the current four-scope run.
- [x] User-confirmed live tab switch: leave while generation is running, return and see the same task continue without another request.
- [x] Click a comment copy button and observe **Copied** feedback after the clipboard write resolved. Independent system-clipboard readback was not verified.
- [ ] Complete four-scope **full Chrome exit/reopen** restoration and a new uncached check; extension reload/refresh is a different scenario.
- [ ] Observe real natural access-token expiry and safe refresh/reauthorization behavior. Simulated expiry is not a live-expiry pass.
- [ ] Complete installed Edge and macOS acceptance; repeat official CLI / ACP installation and inference with real accounts on Windows/macOS. New live API Key inference has not been established by this run.
- [x] Prepare versioned Stable downloads, three-source installation notes, updated privacy guidance, bounded-retry behavior and [PR #1 community credit](https://github.com/bwjoke/SuperX/pull/1), accurately identifying the independent implementation.
- [x] Preserve the original tagged source commit `151985851dd6555e62864b9f2fb6d2568e9b4d77`, installation ZIP SHA-256 `cc77b5b1c3f2aa0fcc679127f53003ceac562f3b35ba54af14ec34761d1789bc` and source ZIP SHA-256 `62064c03dacfe4f62209871ca837be180160d2a271946430be0b195a5f17f89e`. The original [CI](https://github.com/bwjoke/SuperX/actions/runs/39127074307) and [release workflow](https://github.com/bwjoke/SuperX/actions/runs/39127074254) passed; all seven release attachments were anonymously verified. This promotion does not replace them or the historical 0.7.26 artifacts.
- [x] Verify the official public Chrome Web Store listing reports **0.9.11**, updated **2026-10-19**, for item `clcflilaihhnnglfamdblhopokpnlioo`.
- [x] Compare the Google HTTPS-delivered 0.9.11 CRX against the accepted ZIP: **51 versus 50 files**, **49 ordinary files byte-identical**, only Google `update_url` added semantically to the manifest, and only `_metadata/verified_contents.json` added. No manifest key or other semantic change was found. CRX SHA-256: `80abbbe205bb8664639fdc8771167ab7bd5f191d351aac5ad678f10788a3873d`. CRX and ZIP whole-package hashes differ by format; this comparison did not install the CRX or independently verify its signature.
- [x] Promote the existing GitHub 0.9.11 release to Stable/Latest and verify the anonymous Latest ZIP. The download matches SHA-256 `cc77b5b1c3f2aa0fcc679127f53003ceac562f3b35ba54af14ec34761d1789bc`; the original tag and all seven attachment digests remain unchanged.
- [ ] Complete a new store-installed functional test separately; listing availability and file comparison do not establish that pass.

The earlier six-scope authorization used `openid profile email offline_access grok-cli:access api:access` and separately passed live checks, three comments/copying, cross-tab cache reuse and new uncached checks after fully restarting Chrome. The current flow requests only `openid offline_access grok-cli:access api:access`. Those six-scope results do **not** prove current four-scope restart restoration or expiry. Current observations also do not establish all-plan eligibility, Included billing treatment or captured raw native-annotation protocol behavior. Exact evidence and remaining limits are in [CONNECTIONS.md](CONNECTIONS.md#acceptance-scope).

## Historical development snapshots

The following 0.8.x/0.9.1 entries record earlier local candidates, not separately published releases or the current acceptance checklist. The combined 0.9.11 release supersedes their current-status wording; keep historical passes and pending evidence scoped to their original builds.

## 0.9.1 local candidate — official connection, Windows and macOS

- [x] Implement independent API Key and direct official Grok CLI / ACP modes; preserve API defaults and avoid automatic provider fallback or paid retry.
- [x] Provide Dashboard Key setup and a built-in Windows/macOS official-install, login, generated-command and connection-check guide. No extra SuperX program or downloaded profile file is required.
- [x] Remove native-messaging permission and obsolete local-program packaging. Scope optional local access to 127.0.0.1; encrypt the local connection code and exclude it from public configuration and diagnostics.
- [x] Exercise model/effort negotiation, login-required states, actual tool-count gates, reverse-RPC denial, hosted search events, usage retention, per-post sessions, cancellation and unconfirmed cleanup with controlled fixtures.
- [ ] Install the candidate on Windows Chrome / Edge with official Grok and a real account; verify guided setup, Fact Check, comments, language following, model/effort choices, cancellation, restart and recovery.
- [ ] Repeat installed-browser acceptance on Apple silicon and Intel Macs, including official installation, terminal startup, local permission, login/restart and stopping the service. Simulated Mac paths are not a live-device pass.
- [ ] Review managed-device limitations with actual device policy before claiming support there; do not remove or bypass company policy.
- [ ] Accept the candidate, then explicitly publish Preview. Store submission, website update and Stable promotion remain separate. Preserve all published 0.7.26 artifacts and earlier local snapshots.

## 0.8.2 local candidate — Model and reasoning selectors

- [x] Replace free-form model entry with a model selector and a supported-effort selector. Preserve old saved model IDs and their previous effective reasoning defaults.
- [x] Apply the chosen effort to fact checks and comment drafts; separate their caches by effort and refresh old displayed results when the saved effort changes.
- [x] Complete local automated and isolated-browser checks for model/effort choices, save/reopen, language changes, Key drafts, fast defaults and narrow layouts: 647 automated tests and 166 isolated-browser checks passed. No real Key or paid API request was used.
- [ ] Confirm the installed candidate on real X; model availability, provider behavior and factual accuracy still require live acceptance.
- [ ] Publish only after explicit candidate acceptance. Keep the published 0.7.26 Stable artifacts unchanged.

## 0.8.1 local candidate — Fact Check only and reader output handling

- [x] Remove live explanation generation and the explanation/settings flow selector; each automatic task makes one streamed Fact Check request.
- [x] Apply concise, non-repetitive fact-check instructions in built-in and custom modes; keep the original URL and full-post retrieval as context.
- [x] Migrate retired flow settings to Fact Check only, preserve saved credentials and valid custom drafts, and partition new answers from 0.7.26 explanation-plus-check caches.
- [x] Keep existing browsing history readable, including older answers. Preserve comment drafts, independent language choices and Token/model details.
- [x] Validate intermediate-message and tool-command regressions locally: split streaming prefixes, final-answer replacement, no final answer, partial failures, cache/history boundaries and ordinary JSON/code preservation. The 0.8.1 candidate passes 629 automated tests and 95 isolated local-browser checks; these do not call the paid API or prove live-provider acceptance.
- [ ] Confirm the installed 0.8.1 candidate on real X posts: no tool-command JSON in answers, incomplete status when no final answer arrives, no explanation step, useful concise findings rather than a post recap, Auto original/translation following, custom prompts, comments and Key restoration.
- [ ] Explicitly publish a new GitHub Preview after candidate acceptance; keep the existing 0.7.26 Stable tag and attachments unchanged. Store submission and Stable promotion remain separate.

The 0.8.1 source and local package are candidates. The 0.8.0 candidate remains an earlier local snapshot. The published Chrome Web Store and GitHub Stable/Latest remain 0.7.26 until a later release is deliberately published and accepted. Local mock regressions do not establish the exact upstream event shape of an observed live failure.

## Before the first GitHub Preview

- [x] Review and publish the first public Git commit: no credentials, browser profiles, private screenshots, workstation paths, temporary SDKs or unrelated production files. The independently maintained website and internal store-preparation files are excluded. The `v0.7.26` release contains 76 public source files.
- [x] Enable GitHub private vulnerability reporting and confirm the process in `SECURITY.md`; the repository API reports it enabled.
- [x] Review the English and Chinese README installation steps and configured release/support URLs. The initial Preview download and Issues were publicly available; 0.7.26 is now available through the store and GitHub Stable/Latest as recorded below.
- [x] Run local validation: 642 automated tests passed. Validate and package the exported public source separately; its installation ZIP matches the working-source build byte for byte.
- [x] Confirm the installation ZIP has `manifest.json` at its root, includes project and Marked license notices, and matches the generated inventory and SHA-256 checksums.
- [x] Review release notes, privacy documentation and API billing information; verify the independently hosted privacy page separately.
- [x] Complete the Chrome core acceptance recorded below for 0.7.26; disclose remaining browser and advanced manual checks in the Preview notes.
- [x] Publish the actual policy at `https://superx.vip/privacy/` through the existing website deployment, with the public Issues link. Anonymous HTTP checks confirm the distinct bilingual privacy content and its local assets; the homepage, download and support destinations work.
- [x] Publish the reviewed repository and Preview after authorization. Anonymous download matches the accepted installation ZIP SHA-256: `23711b6b3349428ad7374e4e409a8a96241794f1820889f7dfdbf3d0e15040b2`.
- [x] Confirm GitHub CI and the release workflow on the published source: both completed successfully for release commit `254cade96e210e3faef4ca7e08fb67f6bc8c8e90`.

The first Preview uses the completed Chrome core checks plus local validation. It does not require every Edge or advanced manual scenario below to be complete. Keep untested scenarios explicit; a Preview is not Stable or store approval.

## 0.7.26 store publication and remaining checks — 2026-10-08

- [x] Verify the public [Chrome Web Store listing](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo), item ID `clcflilaihhnnglfamdblhopokpnlioo`, and version 0.7.26.
- [x] Compare the delivered CRX with the accepted GitHub ZIP: 30 versus 29 files, all non-manifest files byte-identical, only store verification metadata added, and the manifest differs only by `update_url`. This is a file-content comparison, not a claim that CRX and ZIP hashes match.
- [x] Confirm actual Chrome store installation with the user: explanations, Fact Check, Key saving and restoration after restart work.
- [x] Promote the existing 0.7.26 GitHub release to Stable/Latest and verify the anonymous latest ZIP download. Preserve the tag, installation/source attachments and accepted installation SHA-256.

Stable records the completed Chrome publishing and core functional checks. It does not turn the remaining scenarios below into passes or guarantee model accuracy.

- [ ] Complete the remaining installed-browser acceptance for the supported release scope, including Edge and advanced credential/storage scenarios below. Record any unsupported or deferred scope explicitly.
- [ ] Match the Chrome Web Store privacy declarations to the actual website content, post URLs, author labels and API credential handling. No remote executable code is used.
- [ ] Review provider and store data-handling requirements against the final simplified setup; removing the consent UI does not establish store approval or an exemption from provider terms. Provide usable review credentials only through the dashboard's private review fields.

## 0.7.26 Chrome core acceptance — 2026-10-07

The user confirmed the following on installed Chrome on Windows 11. These are user-reported functional results; they do not certify every storage detail or every browser. The exact Chrome build number has not been recorded.

| Scenario | Result |
| --- | --- |
| Upgrade the existing Chrome installation; normal operation | User-confirmed pass |
| Restart Windows 11; remembered Key restores without re-entry | User-confirmed pass |
| Fresh Chrome profile: Enable and Remember Key on; both language choices Auto | User-confirmed pass |
| No API Key: local browsing history works | User-confirmed pass |
| First save of the user's own API Key; explanation and Fact Check produce results | User-confirmed pass |
| Answer language and interface language can be switched independently | User-confirmed pass |
| Auto answer language follows original / translation switches | User-confirmed pass |
| Generate three comments and copy a suggestion into Notepad | User-confirmed pass |

Edge's actual installed-extension checks remain pending. Successful Key restoration does not mean the user inspected ciphertext, IndexedDB, old-format migration or failure races; those scenarios retain their separate evidence and pending manual status.

The user separately confirmed the store-installed 0.7.26 on 2026-10-08: installation, explanation, Fact Check, Key saving and restart restoration passed. This confirmation does not extend the earlier language, clipboard or history checks to a new store-installation test.

## Historical 0.7.26 installed-browser checklist

The pass labels below belong to the 0.7.26 acceptance recorded above; they are not new 0.9.11 checks. For each new release, repeat applicable scenarios in a fresh browser profile and separately as an upgrade, using that release's connections and Fact Check behavior. A Pending entry was not established by the historical core check even if a fixture covers it. Enter credentials yourself in extension Settings; never include them in an issue, screenshot, recording or test fixture.

| Check | Chrome | Edge |
| --- | --- | --- |
| Record browser version and operating system | Pending | Pending |
| Extract the release ZIP and load its root folder in Developer mode | Pending | Pending |
| Open settings before visiting X; interface follows browser language | Pending | Pending |
| Fresh-profile defaults: Enable and Remember Key on; both languages Auto | User-confirmed pass | Pending |
| Save and reopen settings; choices remain | Pending | Pending |
| First save of an own Key allows enabled explanation and Fact Check | User-confirmed pass | Pending |
| Install 0.7.26 from the Chrome Web Store; explanation and Fact Check work | User-confirmed pass (2026-10-08) | Pending |
| Store-installed Key saves and restores after restart | User-confirmed pass (2026-10-08) | Pending |
| No API requests without a usable Key; inspect the no-Key failure path | Pending | Pending |
| Remembered Key restores after Windows/browser restart without re-entry | User-confirmed pass (Windows reboot) | Pending |
| Inspect saved ciphertext, absence of a plaintext local API Key and the separate IndexedDB encryption key | Pending | Pending |
| Session-only Key is unavailable after browser restart and requires re-entry | Pending | Pending |
| Upgrade: encrypt existing plaintext or a usable old session Key before removing old records; unavailable old password-encrypted Key requires one-time API Key re-entry | Pending | Pending |
| Missing/damaged ciphertext or IndexedDB encryption key requests API Key re-entry, never authorizes a paid call | Pending | Pending |
| Clear or replace Key: cancel queued analysis/comments/fact checks and clear obsolete credentials/cache | Pending | Pending |
| Settings opens at the API Key field for missing or migration-needed credentials; no password, lock or unlock controls | Pending | Pending |
| Cache is reused within the browser session and removed on browser exit; legacy local cache is deleted | Pending | Pending |
| Uncheck Remember Key; verify the choice survives browser restart and ciphertext, IndexedDB encryption key and obsolete persistent records are removed | Pending | Pending |
| Clear Key; ciphertext, IndexedDB encryption key, old records, session Key and cache clear while the selected preference remains | Pending | Pending |
| Upgrade to the candidate; normal operation | User-confirmed pass | Pending |
| Upgrade preserves each saved prompt/setting; inspect the migration paths | Pending | Pending |
| Check popup pause/resume and opening settings | Pending | Pending |
| Auto interface labels follow an X interface-language change | Pending | Pending |
| Answer and interface language selections switch independently | User-confirmed pass | Pending |
| Auto answer follows original/translation; fixed answer language can be selected | User-confirmed pass | Pending |
| Collapse/expand; left navigation and timeline do not resize | Pending | Pending |
| Review Markdown, source links, and model/Token tooltip | Pending | Pending |
| Generate three one-line comments and copy one into Notepad | User-confirmed pass | Pending |
| Browsing history records visible supported posts with no Key | User-confirmed pass | Pending |
| History merges repeat views, survives restart and makes no paid request when opened | Pending | Pending |
| History search, individual deletion, clear and recording toggle work independently of the Key and result cache | Pending | Pending |
| Start a request, pause or navigate away; late output does not attach to another post | Pending | Pending |

For current live acceptance, use a small, controlled session to verify the selected connection, model and tools. Automatic Fact Check makes one generation request per attempt, without a preceding explanation or second background check. Comment drafts use a separate request; tool calls and retries can add usage. All visible posts can trigger requests, including started work that continues after switching tabs. Disable new analysis when the check ends and account for already-started work. Entitlement, allowance and charges follow the provider account, not mock-test results.

## Failure and privacy checks

Use isolated fixtures for rate limits, interrupted streams, incomplete Fact Checks, invalid credentials and cancellation; do not deliberately exhaust a real account. Preserve partial findings, citations and reported usage, show safe diagnostics and keep one failure from freezing other posts. API Key/local CLI transient failures wait 3 seconds and retry up to 5 additional times; waiting retries release their slots and rejoin the queue after actual transport cleanup. Invalid credentials, account restrictions, unsupported settings, output limits and unconfirmed local cancellation are terminal. OAuth does not automatically replay generation after an accepted HTTP 200, stream failure, incomplete output or timeout; an initial HTTP 401 rejection may refresh once and make one recovery request. Verify bounded attempts, usage aggregation and no duplicate request when returning to a tab or remounting a post. Page navigation/closure/BFCache still safely stop interrupted work and leave manual retry available.

Verify startup pruning removes expired session-cache entries while valid answers remain reusable. Credential/source changes must not restore an older Key, OAuth grant or cached result from a late operation; OAuth generated results stay separated by authorization identity. Confirm retired consent fields do not block an upgrade. With fabricated credentials, check automatic remembered-credential encryption, a separate non-extractable IndexedDB key and failure-safe migration/persistence. Remember-off and sign-out must remove the appropriate persistent login without clearing unrelated sources or pretending to erase existing provider-side work. History text remains local and unencrypted; do not claim full-profile protection, hardware binding or guaranteed forensic erasure.

## Release procedure

Use the shared [release channels](RELEASE_CHANNELS.md) procedure. GitHub hosts previews and stable archives; the store distributes accepted stable versions from the same source and package.

1. Keep `package.json` and `extension/manifest.json` on the same version.
2. Complete local checks, build `npm run package:release`, and review the exact Git diff and both archive inventories. Record the commit and installation ZIP SHA-256.
3. Push the reviewed source and version tag only after publication is authorized.
4. The release workflow validates the numeric tag, reruns tests, and attaches the installation/source ZIPs, inventories and checksums to a draft preview excluded from Latest.
5. Complete public-distribution prerequisites, review the draft, and explicitly publish it with the maintainer's selected Preview or Stable status and accurate acceptance limits. GitHub Stable may precede the store release.
6. Verify the accepted installation ZIP checksum and upload that exact package to the store when separately authorized. Keep submission, approval and public availability recorded as different states.
7. After store publication, verify its listing and delivered package, then update the channel entries and release report. Preserve published GitHub attachments and tags; a store publication does not require rebuilding them or imply new functional acceptance.

- [x] Record the public store item ID and listing URL. The October 8 entry records historical 0.7.26 publication; the October 19 section records current 0.9.11 publication.
- [x] Confirm the stable `SuperX.zip` alias has the same bytes as the versioned ZIP, is included in its checksums and is available through `/releases/latest/download/SuperX.zip`.
- [x] Keep Preview separate from Stable/Latest. Version 0.9.11 was Preview on October 18 and promoted on October 19; current download entries use Stable/Latest and no longer list the same version as a new Preview.
- [ ] Check that store support points to the repository's public Issues and privacy links use the verified public policy URL.
- [ ] Keep manual update and channel-switch instructions accurate; do not promise automatic Key/settings migration across installation IDs.

GitHub repository/release publication, website deployment and browser-store submission are separate steps. Local preparation does not establish their public status.
