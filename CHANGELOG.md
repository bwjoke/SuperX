# Changelog

SuperX release history. The extension's `manifest.json` is the authoritative installed version. Test counts below describe those releases' recorded checks, not live provider or browser-store certification.

## Unreleased — Browser and financial-page security hardening

- Exclude known Money, payment, wallet, account, authentication, settings and private-message routes at direct load and during X single-page navigation. Use one shared route policy for feed, draft and background processing.
- Check browser-owned current and pending tab URLs before accepting feed work and before dispatching queued requests. Cancel tasks and clear transient page state on entry to excluded routes; do not resume old drafts after returning.
- Require genuine browser input for manual feed actions, including paid retries, comment generation, clipboard copying and preference changes.
- Apply redirect rejection, cookie omission, no-store caching and no-referrer transport to both API Key and OAuth inference.
- Add regression tests and a [bounded security review](docs/SECURITY_REVIEW_2026-10-25.md). Host permissions remain unchanged; these controls do not make a funded X account or wallet browser safe from a malicious extension update.

## 1.0.0 — Fact-check posts, drafts and images (2026-10-24)

- Release the current post and draft fact-checking workflow as the first 1.0 milestone on GitHub. The Chrome Web Store update is submitted separately using the same installation ZIP; availability there is not implied by the GitHub release.

- Supply published-post pictures, relevant reply ancestors and nested quoted-post pictures as labeled native image inputs, rather than relying only on URL text or a media-presence flag. Keep each source's ownership and distinguish a video thumbnail from a watched video. Continue to treat screenshot text as a claim to investigate, not independent corroboration.
- Read newly attached draft PNG/JPEG pictures only after an explicit Check, including image-only drafts. Keep the draft as the target and quoted/parent material as supporting context. Changing attachments marks existing findings stale without automatically sending another request. Videos and other non-image draft attachments remain excluded.
- Limit unpublished draft pictures to four and 8 MiB total decoded bytes. Bound context to 24 images and the existing text budget, with explicit omitted-media notices. Local Build additionally limits all loaded image bytes to 8 MiB and checks advertised image support before sending native ACP image blocks. Failed, unsupported or dropped images report an error instead of silently completing a text-only check; image loading has a bounded deadline.
- Keep draft image bytes out of persistent history, answer caches and diagnostics. Update the bilingual privacy policy and all twelve UI languages; do not add host permissions. Preserve published 0.9.13 and earlier packages; website privacy publication remains a separate deployment.
- Keep all thirteen localized package summaries concise while including automatic post checks, manual draft checks, evidence sources, 24-hour browsing history and connection choices. Simplified Chinese: “Grok 自动深入核查 X 帖子，也可核查发帖、回复草稿，附证据来源。查看近 24 小时浏览历史。支持 The X Subscription 或 API Key。”
- Mark Grok 4.3 and no reasoning as recommended in all three connection settings, with concise localized guidance on fast feed browsing, shorter answers and lower Token use. Keep existing selections and availability checks unchanged.

## 0.9.13 — Check a post or reply before publishing (Preview, 2026-10-22)

- Add a manual draft-check button in the home composer, new-post dialog, reply dialog and inline reply editor. The round control sits directly before Post/Reply with symmetric native spacing, matches its height and effective disabled colors, and shows a balanced SuperX logo. Empty drafts keep the control visible but disabled; typing enables it without shifting the toolbar. Accessible labels and hover hints describe checking or showing/hiding existing results; checking again is a separate header action. This GitHub Preview does not change Chrome Web Store or GitHub Stable/Latest, which remain 0.9.12.
- Keep the logo button the same size across states and languages so toggling findings does not move X's native controls. Keep the findings separator indented with the editor text and at the original composer boundary's vertical position; opening and closing the answer does not move that boundary.
- Reserve native scrollbar space only in the draft's modal scroll containers, including before they overflow. Showing or hiding an answer no longer changes the available editor width. Keep native scrolling and restore any prior scrollbar-gutter setting when the last draft editor detaches; preserve subsequent changes made by X.
- Stream a draft's findings and clickable sources below its native action toolbar. Long answers expand in place with the page or dialog; there is no image generation or enlarged-reading view.
- Keep progress and reported Token usage beside SuperX in the panel header, with an animated waiting indicator and model/input/output details on hover. Remove the separate completion line, bottom metadata disclosure and website footer.
- Keep search-call records in the Token tooltip and keyboard-accessible description, without another visible status row. Distinguish observed calls, awaiting reports and unconfirmed records; a call is not proof of valid evidence. Missing metadata never becomes a zero search count, and each new attempt clears the previous attempt's search marker.
- Restore the explicit recheck action when an initially unavailable local connection becomes ready, without automatically submitting the draft or discarding an existing answer.
- Keep draft findings outside the native sticky toolbar's containing block when X exposes no usable outer composer separator. This prevents long answers from placing the native controls over the findings, while retaining the editor's left inset and X's original sticky styles.
- Keep the submitted draft snapshot separate from continued editing. Mark changed drafts as stale and let the user check again; collapsing the panel or switching browser tabs preserves started work rather than issuing another request.
- Use the selected Grok subscription, API Key or local Build connection, model, reasoning and search settings. The answer follows the draft's language. New-post quotes and a reply's available root, earlier replies and direct parent are supporting context, not substitute targets. Preserve known thread context across X's temporary DOM removal, keep unrelated timeline posts out, and distinguish new-post quotations from reply recipients. Omit the redundant reply-context status line. Automatic feed analysis can remain paused or its rail collapsed while a draft is explicitly checked.
- Read native reply previews and new-post quote cards even when X omits their permalink or renders them as buttons, including bounded nested quotations. Treat linkless previews as unverified context; restore a permalink only from a unique exact author, text and timestamp match. Quoted cards are not unpublished media attachments. Detect native text-node replacement so expanded or changed context marks existing findings stale without repeating the request.
- Resolve factual questions such as “who do you mean?” or “which people is this about?” from the appropriate reply or quoted context before deciding whether further evidence is needed. Do not dismiss a question merely because it is not an assertion, guess ambiguous identities, or substitute a full parent-post audit for the draft's question.
- Share the same editable fact-check core across published posts, new-post drafts and reply drafts. Settings → Prompts → Custom prompts adds separate new-post and reply context instructions; these supplement the shared evidence and depth standards. Resolve short replies such as “this incident did not happen” against the supplied conversation and investigate that event instead of requiring the draft to repeat its details. Keep the draft target last, preserve genuine legacy custom instructions, and bound auxiliary context without truncating the submitted draft or custom prompts. Prompt edits apply to new requests without canceling accepted work; context-only edits do not invalidate published-post caches. Installed Windows Chrome checks resolved a contextual reply question and a quoted-post question; that does not guarantee model relevance for every draft.
- Check draft text only. Composer attachments are not read or sent for this task; show this limit when attachments are detected. Draft checks do not edit or submit the post or reply.
- Retain draft snapshots and findings in page/worker runtime memory only. Exclude draft tasks from browsing history, the answer cache and local diagnostic records; page navigation, reload or closure clears the page's retained drafts. Provider-side handling and previously sent data remain subject to the selected service's policies.
- Refresh all thirteen localized package summaries for automatic post fact-checks, own post/reply checks, evidence links, 24-hour browsing history and subscription/API Key connections, within Chrome's 132-character limit.

## 0.9.12 — Keep the rail aligned when replying (Stable, 2026-10-20; Preview, 2026-10-19)

- Fix the post-detail inline reply editor moving the SuperX header down to its media toolbar and clipping the original post's answer. X uses `role="tablist"` for both page navigation and reply controls; only visible navigation before the feed can now position the rail header.
- Exclude post, media, poll, recommendation and editor tab bars, including hidden or zero-width duplicates. Preserve real home/profile navigation, fractional borders, partially clipped headers and navigation that has scrolled offscreen.
- Observe native navigation and its containers for size changes caused by fonts or CSS transitions, without waiting for scrolling or DOM mutations. Release obsolete observations when navigation changes or the rail is hidden.
- Keep existing streamed answers, usage, sources and answer scroll positions while the inline reply expands or changes height. Focusing the editor does not cancel or repeat analysis. Existing dialog/media suppression remains in effect.
- Promote the same repair to GitHub Stable/Latest after verifying Chrome Web Store publication on October 20. Preserve the original tag, installation/source packages and checksums; 0.9.11 remains an archived release. This distribution update does not add new functional acceptance results.

## 0.9.11 — Browser-only Grok subscription login (Stable, 2026-10-19; Preview, 2026-10-18)

- Promote the existing 0.9.11 release to Stable/Latest after verifying its public Chrome Web Store listing and Google-delivered payload on October 19. The store adds only `update_url` to the manifest and `_metadata/verified_contents.json`; all other files match the accepted ZIP. Preserve the original tag, installation/source attachments and checksums. Store publication does not turn remaining browser/account acceptance scenarios into passes.

- Community credit: Thanks to [@0xDenji-Ai](https://github.com/0xDenji-Ai) for [PR #1](https://github.com/bwjoke/SuperX/pull/1), proposing local Grok CLI access, dwell-based triggers, macOS setup guidance, media/dialog handling and preserving started work across tab switches, with attention to API compatibility. This release addresses those core goals through a separate implementation rather than merging the PR as-is.
- Localize the extension and store short description for all twelve interface languages, with English as the default and separate Brazilian/European Portuguese catalogs for Chrome's regional locale codes. Replace the hardcoded Chinese summary and keep all thirteen locale catalogs in both installable and public-source packages. Prepare matching localized store descriptions for the new fact-check and subscription-login flow; dashboard descriptions remain separate from package metadata and must be updated with the new store version.
- Add a third, independent Grok subscription OAuth connection for Windows and macOS browsers. Device authorization uses the shared public Grok client and official xAI page; no CLI, local service, API Key or additional SuperX program is needed. Explain that the authorization page can display Grok Build, rather than a separately registered SuperX identity. Keep account eligibility and model/tool availability subject to provider rules; do not claim an official partnership or universal plan entitlement.
- Put **Sign in · The X Subscription** first and make it the new-install default, followed by **Grok API Key** and **Grok Build · Local CLI / ACP**. Preserve saved selections and independent settings; nonempty older settings without a source, or missing/empty settings with legacy credentials, retain the API path. All three initially select Grok 4.3 / reasoning None, with no silent model switch, provider fallback or budget change.
- Remove the Settings About authorization block. Show The X Subscription / Pricing / View Usage links in that order, and add [Pricing](https://x.ai/pricing) beside Create Grok API Key in the subscription guide. Keep remember controls at 20 px across all twelve interface languages.
- Handle Chrome's BFCache port closure on both ends and reconnect on page restoration. Preserve completed answers, citations, usage and comments; interrupted requests retain their partial output for manual retry rather than automatically generating again. Clear suspended-page timers and reject stale port messages without changing login or provider settings.
- Keep already-started fact checks, comment drafts and their existing retry chains running when switching browser tabs. Pause new automatic work and withdraw only tasks confirmed never to have started; retain the original subscriptions so returning displays their progress or completed results without another request. Protect START/retry queue races in the shared worker. Actual page navigation, closure and BFCache suspension still stop interrupted work safely and require explicit retry.
- Use the same curated Grok 4.3 / 4.5 / 4.6 / 4.7 model menu for subscription login, API Key and local Build, including the local setup guide. Provider catalogs control availability and reasoning levels instead of adding unrelated image, video or experimental entries. Preserve previously saved text aliases; keep saved image/video IDs visibly unsupported and reject their new tasks without inference or automatic retry.
- Open browsing history directly from the end of the Settings sidebar, with the same heading size as Settings. Keep its recording switch only on the history page, whose navigation places Settings above Browsing history at matching sizes.
- Align Settings and history to the same 920 px page, 240 px sidebar, header dimensions and mobile branding. Reserve the vertical scrollbar gutter on both pages so changing the number of history records does not shift the centered layout.
- Allow pausing and saving unrelated preferences when a model catalog or local connection is unavailable. Validate runnable connection changes separately, retain connection drafts while pausing and avoid local connection permissions or credential writes for ordinary preference saves.
- Keep built-in prompt settings concise; Custom prompts still opens the editable fact-check instructions, with comment customization available in an expandable editor. Group answer-cache clearing, extension reload and diagnostic logs under collapsed Maintenance & troubleshooting; answer-cache clearing does not delete browsing history.
- Reserve a status line in both page headers, improve muted text on dark cards and show search/model validation next to the relevant controls. Use concise save feedback and consistent maintenance copy across all twelve interface languages.
- Request only `openid offline_access grok-cli:access api:access` on new authorization, removing `profile` and `email` and never fetching or using account-profile information. Preserve connected credentials without claiming retroactive scope reduction; discard pending device logins saved with an older scope set. After HTTP-200 device-code negotiation, the user reloaded the installed candidate, signed out and in, confirmed that name/avatar and email were no longer listed on the official page, and completed fresh authorization. A live Grok 4.3 Fact Check with four clickable sources then passed; four-scope restart and natural expiry remain separate checks.
- Keep OAuth tokens in the trusted worker. Remember login defaults on and stores only refresh-token ciphertext locally, with an independent non-extractable AES-GCM key in IndexedDB; access tokens remain session-only. No password or browser sync. Add fixed `auth.x.ai` host access for device/token/revocation requests and authentication alarms; inference and model-directory requests go directly to `api.x.ai` without CLI identity headers.
- Serialize token rotation, persist intent before consuming a refresh token and require reauthorization after uncertain outcomes or unsafe storage. Make cancel, logout and late callbacks respect authorization generations. Validate official links, keep secret codes/tokens out of feed configuration, history and diagnostics, and load only the model directory after login without test inference.
- Verify persisted login records by exact field values and array order while allowing Chrome storage to reorder object keys; unchanged records must not produce a false storage failure.
- Separate cache reuse and generated history views by connection source and OAuth authorization identity while retaining on-device post visits. Signing out of OAuth leaves saved API/local configuration intact.
- Do not automatically replay OAuth generation after an accepted HTTP 200 response, stream failure, incomplete output or timeout. An initial HTTP 401 rejection may refresh authorization once and make one recovery request. Existing API Key/local transient retries remain 3 seconds, up to 5 extra attempts, without freezing other posts.
- Update bilingual onboarding and privacy documentation. Earlier six-scope Windows Chrome checks confirmed fresh user-approved OAuth authorization, live Grok 4.3 fact checks with clickable evidence, exactly three comment drafts and copying, cross-tab cache reuse, and new uncached checks after fully restarting Chrome without reauthorization. The user confirmed sign-out without silent fallback and preservation of saved API Key/Build configuration. The new four-scope authorization and one new live Grok 4.3 Fact Check subsequently passed; the earlier restart, comments and cache results remain six-scope evidence. macOS, actual natural token expiry, new API Key/CLI real-account acceptance, all-plan eligibility and Included billing treatment remain separate; observed UI citations do not certify captured raw native annotations. Stable remained 0.7.26 during the Preview; 0.9.11 was promoted on October 19 after store publication.

## 0.9.10 — Simplify connection setup and clarify Key sources (unreleased candidate)

- Put the connection method, one Grok API Key field and model settings on the main setup path. Remove the global explanatory introduction, repeated API branding, duplicate console links and repeated storage/usage instructions. Keep Enable as a separate global control.
- Offer Grok Dashboard subscription allowance and xAI Console pay-as-you-go credits as two sources of Keys for the same API Key mode, inside an expandable help section. Keep Grok Inference / Cursor setup advice only with the Grok Dashboard path and show each account's own usage/billing entry. Do not add a Key-source setting or infer account entitlements from a Key.
- Move credential clearing next to the Key, combine the remember/session explanation and shorten saved/session/missing/replacement states without implying provider authentication or available credit. Keep model, reasoning, scrolling, language and local Grok controls intact.
- Remove Priority Processing guidance from the setup path because SuperX does not offer that setting. Retain the detailed API billing/processing explanation in the connection documentation. Update all twelve interface languages.
- Use Grok API Key consistently for the connection option, credential input and missing-Key guidance, including the feed's Settings link and popup onboarding. Clarify that local Grok model settings are saved independently from API mode.
- Expand the API Key and usage guide by default, including first setup without a Key. Label the subscription path as `grok.com · The X Subscription`, add a localized Recommended badge and link the subscription name in its description to the official overview. Keep manual collapse intact during language, provider and save updates.
- Default both connections to Grok 4.3 with reasoning off (`none`). Support the actual ACP `none` level throughout settings, the guided setup, status metadata and requests; accept an already acknowledged `currentValue: none` even when the official fallback menu omits it. Never relabel `minimal` or `low` as reasoning off, silently switch models or run with an unconfirmed level.
- Migrate only the exact former CLI default `grok-4.7 / low` once, using a separate `buildDefaultsVersion` marker. Older records cannot distinguish an untouched default from a manual choice of that same pair, so both are migrated once; retain other combinations and all later explicit selections, including 4.7 / low. Preserve API choices, credentials, scrolling and concurrency preferences.
- Retry transient Fact Check and comment failures after 3 seconds, up to 5 additional attempts per task. Release slots during the wait, rejoin the shared queue after actual transport cleanup, retain partial findings and accumulate reported usage without double counting. Keep invalid credentials, account restrictions, unsupported settings, output limits and unconfirmed local cancellation terminal.
- Remove error-derived account, capacity and rate-limit queue freezes, including legacy session markers. An individual failure no longer prevents other posts from starting. Preserve explicit user/configuration cancellation and the official-runtime block when stopping a session cannot be confirmed.
- Keep started requests and streamed text when scrolling away or X unmounts/recycles timeline articles. Reattach the original card and subscription on return instead of repeating a paid request. Withdraw only work confirmed not to have started; retain at most 100 inactive detached cards per feed page. Auto language changes still invalidate obsolete input.
- This is one combined local candidate; published Stable remains 0.7.26. Retry and virtualization behavior is checked with isolated fixtures, without new live-provider calls.

## 0.9.9 — Go deeper into checkable details (unreleased candidate)

- Remove the built-in and fixed application instructions that asked for a brief exit when there was no "meaningful checkable claim". Encourage investigating explicit claims, reasonably implied factual premises and checkable details, including relevant sources, context, numbers, comparisons and causal reasoning.
- Retain concise findings without a duplicate post recap. Distinguish the author's actual claims from inferred premises; do not invent claims or evidence, force a correction, or treat missing evidence as proof of falsehood. API and official local Grok use the same rules.
- Upgrade only exact copies of the retired default prompt, including untouched copies saved in the custom editor. Preserve edited custom instructions, comment prompts and browsing history. Version fact-check cache identity so new tasks do not reuse answers generated under the old rules; existing displayed/history answers remain until reanalysis or normal expiry.
- Hide the complete SuperX interaction layer while X compose/reply dialogs, media viewers or external fullscreen content are open, including the header and collapsed expand button. Resume the feed after closing; preserve started requests and use confirmed queue-only cancellation for work not yet started. Temporary modal routes do not clear the underlying feed's answers or record covered posts as new history.
- Use a stable blue accent for answer links, sources and controls instead of sampling an arbitrary post link's color. Align light-theme blue in the local setup and privacy pages with Settings and history.
- Keep the 0.9.8 scrolling/dwell and concurrency defaults. Published Stable remains 0.7.26; no new live-provider quality comparison is claimed.
- Batch related development fixes into the same candidate before handoff rather than increasing the version for every small edit. Preserve already distributed or published packages.

## 0.9.8 — Wait for reading and use three API slots by default (unreleased candidate)

- Default API concurrency to 3, configurable from 1 to 8. Preserve the shared limit across tabs, fact checks, comments and cancellation cleanup.
- Default automatic analysis to a 1-second wait after feed/page scrolling stops, with the post continuously visible. Settings supports 0–30 seconds, including fractions; 0 starts immediately. Further scrolling resets waiting work, including tasks confirmed not yet started in the provider queue. Scrolling inside SuperX's answers does not reset the timer. Started requests continue, and manual reanalysis/comments bypass the wait.
- Apply the wait to both API Key and official local Grok modes, without delaying browsing history or requiring an API Key for history. Changing the wait alone preserves already-started requests. Migrate the old 0-second/default-four settings once; retain later explicit zero/four choices and other valid custom values.
- Explain subscription API allowance and pay-as-you-go xAI credits in Settings and connection guides. Standard credits do not automatically enable separately priced Priority Processing; SuperX continues to send standard requests without changing billing tiers.
- Retain account-limit and model-capacity pause protections. This remains a local candidate; published Stable remains 0.7.26.

## 0.9.7 — Distinguish model capacity and pause automatic requests (unreleased candidate)

- Recognize supported overload error codes and the provider's fixed model-at-capacity error message at the error boundary. Use a local capacity classification without inventing an upstream error code or replacing the original HTTP transport status.
- Show a localized model-busy message and pause subsequent automatic API requests. Preserve running work, completed answers and billing metadata. Permit one explicit manual probe; resume after a complete successful result, without timer-based paid retries, automatic model switching or Priority Processing.
- Keep model-capacity protection independent of account-spending restrictions. An earlier HTTP 402 remains an account/entitlement refusal; a later HTTP-200 stream error with a capacity message does not prove another 402 or a concurrency-limit breach.
- Retain the 0.9.6 transport-lifetime concurrency fix. Published Stable remains 0.7.26.

## 0.9.6 — Keep cancelled API transports inside the concurrency limit (unreleased candidate)

- Retain shared API request slots until the underlying provider call and response-reader cancellation settle. Cancellation and timeout can update the UI promptly without allowing replacement requests to exceed the configured local transport limit while old requests are still closing.
- Include response-reader cleanup after terminal events, provider errors, oversized HTTP error bodies and headers arriving after cancellation. Keep late output isolated from replacement tasks and share the same limit across tabs, fact checks and comment drafts.
- Display a completed result without waiting for local cache persistence. Waiting posts still show queued status; visible loading labels are not a measurement of upstream server execution.
- This corrects a reproduced local concurrency defect, not a proven cause of xAI's intermittent `spending_limit` responses. Cancelling a local request does not confirm that server-side work or billing has stopped. No automatic paid retries or account-budget changes. Published Stable remains 0.7.26.

## 0.9.5 — Preserve official string-shaped API error details (unreleased candidate)

- Read official flat `{code, error: string}` errors and complete JSON string error bodies through the same bounded redaction as object-shaped error messages. Prefer specific message fields when both are present.
- Preserve HTTP and stream provenance without treating prose or WKE text as a budget classification. Do not parse HTML bodies, serialize arbitrary error objects or retry requests automatically. This improves future diagnostics; it does not establish the cause of a previously observed failure.
- Published Stable remains 0.7.26.

## 0.9.4 — Trace API failures without guessing account exhaustion (unreleased candidate)

- Distinguish HTTP rejection, errors inside an accepted stream and network failure. Keep transport status separate from an error event's explicit status; a stream's `spending_limit` is not by itself proof of HTTP 402.
- Capture bounded, redacted provider error details, supported request/response trace IDs, local timing, requested model/effort and a server-confirmed model when supplied. Keep request bodies, API Keys, prompts and arbitrary provider fields out of the structured log.
- Add a collapsed local diagnostic log at the bottom of Settings, with explicit refresh, copy and clear controls. Retain at most 30 API failures for 24 hours within the current browser session. Nothing is automatically uploaded; clearing this log does not clear posts, history, answer caches or account-limit protection.
- Correct the unknown-error wording: an unrecognized category does not prove the service supplied no explanation. Previous failures cannot be reconstructed when their original details were discarded.
- A reported spending error does not identify which allowance or upstream check caused it. Do not claim that a subscription was exhausted without supporting account evidence. Published Stable remains 0.7.26.

## 0.9.3 — Pause automatic work at API account limits (unreleased candidate)

- Installed 0.9.2 diagnostics identified a live HTTP 402 / `spending_limit` rejection alongside successful Grok 4.3 checks. This identifies a provider account spending or usage restriction, not which balance, budget or allowance was exhausted.
- Pause queued and new automatic API work on structured account-limit errors. Preserve already-running answers and reported usage, keep cached results and local history available, and retain only a sanitized pause cause in restricted browser-session storage across worker sleep.
- Allow one explicit manual recovery probe at a time. Resume new automatic work across open tabs only after a complete provider response and confirmed pause-state removal. A failed probe, cached answer, ordinary settings edit or same-Key save does not establish account recovery. Replacing or clearing the API Key resets the previous account's pause.
- Keep API and local Grok independent; do not retry paid work automatically, change account budgets or fall back to another provider. Published Stable remains 0.7.26.

## 0.9.2 — Settings layout and API failure details (unreleased candidate)

- Fix a misplaced closing tag that displayed local Grok model, reasoning and connection controls outside their selected provider panel. Add strict structural checks and verify real browser form containment, validation and provider switching.
- Show actionable API error categories instead of the same generic “Analysis failed” for rejected Keys, access/usage limits, request support, service errors, interrupted streams and incomplete output. Keep sanitized HTTP status and allowlisted provider error codes even when no partial answer exists.
- Bound error-body inspection and keep raw upstream messages, account identifiers and credentials out of diagnostics. A 402 can indicate balance, budget or usage limits; it does not by itself prove an empty account.
- Do not automatically retry paid requests or switch providers. Earlier failures without detailed metadata cannot be diagnosed retrospectively; new diagnostics provide evidence for the next failure.
- This remains a local candidate. Published Stable is still 0.7.26.

## 0.9.1 — Direct official Grok connection (unreleased candidate)

- Keep API Key as the default and add a direct official Grok CLI / ACP connection. Windows and macOS users install and sign in through official Grok, then copy a generated launch command; no additional SuperX program, Node runtime or browser host registration is required.
- Add first-use API Key guidance for The X Subscription: Grok Dashboard, Grok Inference Key type, Chat/model access and account usage. Existing xAI Console Keys remain supported. Entitlement and billing follow the account and provider; no free/unlimited claim is made.
- Request optional access to the loopback address only for the local mode. Generate a random local connection code, encrypt its saved copy and keep credentials out of feed configuration and diagnostics. No automatic provider fallback or paid retry.
- Isolate the official service's temporary configuration/working directory and disable imported coding/MCP integrations. Supply an inline restricted profile, confirm the actual local-function count is zero, and verify model/effort selections before a prompt. These application checks are not an OS sandbox.
- Use one fresh ACP session per post, serial task execution, actual hosted search events, provider-reported Token metadata and explicit cancel/close requests. Surface unconfirmed cleanup; a disconnected browser alone does not imply the official task stopped.
- Preserve concise Fact Check, language following, custom prompts, comments, Markdown and local history. Include Windows/macOS setup and provider-specific privacy guidance. Connection checks send no Fact Check or comment prompt.
- This is a local candidate. Mock and isolated-runtime checks do not establish real-account Windows/macOS installed-browser acceptance. Published Stable remains 0.7.26.

## 0.9.0 — Earlier local prototype

- Superseded by the direct official-service setup in 0.9.1 before public release. Its existing local artifacts remain historical snapshots and are not the current installation guide.

## 0.8.2 — Model and reasoning selectors (unreleased candidate)

- Replace the editable model-name field with separate model and reasoning-effort dropdowns. Offer Grok 4.3, 4.5, 4.6 and 4.7, and only the effort levels supported by each model. Keep already saved custom model IDs as existing selections without adding a free-form input.
- Send the selected effort explicitly for fact checks and comment drafts. Preserve previous defaults on upgrade: Grok 4.3 uses none, while 4.5–4.7 use low. Unknown existing model IDs keep provider-default reasoning.
- Include effort in answer/comment cache identities and refresh visible answers when it changes. Fast defaults select Grok 4.3 with no reasoning and four concurrent requests; they do not enable a paid Fast/Priority service tier.
- Local candidate awaiting installed-extension acceptance. Public Stable remains 0.7.26.

## 0.8.1 — Reader output handling (unreleased candidate)

- Distinguish intermediate assistant messages and tool-call data from the final reader-facing answer. Use the completed response as the authoritative result instead of retaining earlier text when no final answer is present.
- Hold recognized tool-command JSON while streaming and exclude replies consisting only of those commands from the reading rail and successful answer caches. Ordinary prose, code and JSON remain supported.
- Show an incomplete fact check when the provider supplies no reader-facing answer. Preserve reported Token/model usage without automatically starting another paid request.
- Keep the single-request Fact Check behavior introduced in 0.8.0. This local regression-fix candidate still requires installed-extension acceptance; the published Chrome Web Store and GitHub Stable version remains 0.7.26.

## 0.8.0 — Fact Check only (unreleased candidate)

- Temporarily remove the explanation stage and its Settings controls. Run a single streamed Fact Check directly for each visible post, using its original URL and enabled search tools. Older generation-flow preferences no longer start an explanation or second request.
- Make built-in and fixed application instructions ask for concise findings, supporting or conflicting evidence and sources, without repeating the post, adding a summary or reproducing its full claims list. Identify a disputed claim only as briefly as necessary; state briefly when there is no checkable factual claim.
- Keep editable fact-check and comment prompts, independent answer/interface languages, translation following, comment drafts, Token/model details, encrypted Key storage and local browsing history. Existing saved answers, including earlier explanations, remain readable under normal history retention.
- Update isolated demos to show one Fact Check stream, including its waiting and incomplete-result states. Removing the separate explanation avoids an extra generation request; retrieval time, model latency and factual accuracy still depend on the provider and evidence.
- This is a local candidate awaiting installed-extension acceptance. The published Chrome Web Store and GitHub stable version remains 0.7.26; no 0.8.0 release or store update is implied.

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
