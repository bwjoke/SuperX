# SuperX

**Understand X. Fact-check as you scroll.**

[Download 1.0.0](https://github.com/bwjoke/SuperX/releases/download/v1.0.0/SuperX.zip) · [Chrome Web Store](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo) · [Release notes](https://github.com/bwjoke/SuperX/releases/tag/v1.0.0) · [Website](https://superx.vip/) · [Support](https://github.com/bwjoke/SuperX/issues) · [简体中文](README.zh-CN.md) · [Privacy](PRIVACY.md)

SuperX is a Chrome / Edge extension that checks factual claims in X posts using a Grok subscription login, your own API Key or an official local Grok Build connection. Findings stream into a right-hand column that follows X's theme and font, while your original feed keeps its layout.

**GitHub Stable/Latest: [1.0.0](https://github.com/bwjoke/SuperX/releases/tag/v1.0.0) — [download the installation ZIP](https://github.com/bwjoke/SuperX/releases/download/v1.0.0/SuperX.zip).** This milestone brings automatic post fact-checks and manual pre-publication draft checks together, including images and source links. The Chrome Web Store's last verified version is **0.9.12**; the GitHub release does not update the store listing.

While browsing, SuperX investigates claims, relevant details and evidence without first producing another summary of the post. To check your own post or reply, click the round **SuperX** button next to Post/Reply. Findings appear below the editor and follow the draft's language. Enter text, add supported images, or use an image-only draft; empty drafts keep the button disabled. SuperX does not publish the draft.

Published-post pictures and available parent, ancestor and quoted-post pictures can be supplied as image inputs. Draft checks read up to four attached PNG/JPEG images (8 MiB total) only when you explicitly request a check. Reply threads and quotes remain supporting context; the draft remains the target. Draft video attachments are excluded; supplied video thumbnails represent still frames. Unsupported images or loading failures are reported rather than silently falling back to text alone. Draft text, images and results remain in runtime memory, outside browsing history, shared answer caches and diagnostic records. See [Privacy](PRIVACY.md).

Choose **Sign in · The X Subscription** (the default), **Grok API Key**, or **Grok Build · Local CLI / ACP**. Each connection keeps its own settings; SuperX never switches providers automatically. **Grok 4.3 + no reasoning** is recommended for browsing: usually quicker, more concise answers with fewer Tokens. Model access and charges depend on your account; local Build must support image input. See [connection setup](docs/CONNECTIONS.md).

SuperX supports twelve interface languages and thirteen localized package summaries, with English as fallback. The searchable, on-device history keeps recently viewed posts and existing answers for up to 24 hours. Browser-only subscription login and API Key installation require no build step or package dependencies. The extension uses Manifest V3 and plain JavaScript.

![SuperX on X with English explanations and fact checks](docs/assets/superx-preview-en.png)

*Historical screenshot from SuperX 0.7.26. Current versions run Fact Check directly and also support draft checks.*

## Downloads and support

| Entry | Purpose | Current status |
| --- | --- | --- |
| [GitHub Stable 1.0.0](https://github.com/bwjoke/SuperX/releases/tag/v1.0.0) · [Download ZIP](https://github.com/bwjoke/SuperX/releases/download/v1.0.0/SuperX.zip) | Current milestone for manual installation and updates | Stable/Latest |
| [Chrome Web Store](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo) | Store installation and Chrome-managed updates | Last verified: 0.9.12; 1.0.0 awaits store submission |
| [0.9.13 Preview archive](https://github.com/bwjoke/SuperX/releases/tag/v0.9.13) | Earlier draft-check preview, retained unchanged | Historical pre-release |
| [0.7.26 archive](https://github.com/bwjoke/SuperX/releases/tag/v0.7.26) | Earlier release with explanations, retained unchanged | Historical |
| [All GitHub Releases](https://github.com/bwjoke/SuperX/releases) | Versioned installation packages, source and checksums | Available |
| [Latest stable ZIP](https://github.com/bwjoke/SuperX/releases/latest/download/SuperX.zip) | Current GitHub Stable package | 1.0.0 |
| [GitHub Issues](https://github.com/bwjoke/SuperX/issues) | Bugs, feature requests and shared support for both channels | Open |

[SuperX.vip](https://superx.vip/) is the website; [bwjoke/SuperX](https://github.com/bwjoke/SuperX) hosts source, release notes and support. GitHub Stable and the Chrome Web Store may have different current versions. The maintainer explicitly selected 1.0.0 as GitHub Stable/Latest; earlier tags, attachments and hashes remain unchanged. See [release channels](docs/RELEASE_CHANNELS.md).

The [acceptance record](docs/RELEASE_CHECKLIST.md) distinguishes automated checks, isolated browser fixtures and installed-browser/provider tests. The new image transport checks do not establish live model comprehension on every connection. Installed Edge/macOS, fresh real-account API Key/local Build draft runs and OAuth restart/expiry scenarios retain their documented limitations. Neither a Stable label nor store publication expands that evidence.

## Features

- Check your own post or reply draft explicitly from its native composer, with streamed findings below the toolbar.
- Include published-post and reply/quote-context images; attach up to four PNG/JPEG images to a draft or check an image-only draft. Draft video attachments are excluded; video thumbnails are still frames.
- After feed scrolling stops, posts must stay visible for 1 second before automatic analysis. Both the wait and API concurrency are configurable; the default concurrency is 3.
- A continuous right column replaces X's original sidebar; collapse it to restore that sidebar.
- Fact Check starts directly in one streamed request, without a preceding explanation or a duplicate post summary. Findings lead with the useful conclusion, evidence and any relevant limits.
- Built-in or editable fact-check and comment instructions.
- Auto answers follow the post's currently displayed language, including translation / original switches. You can also choose a fixed language.
- Streamed Markdown, clickable sources, per-post Token usage and model details.
- Three optional one-line comment drafts, copied only when you click; SuperX does not post them.
- Local result caching and specific failure details when a fact check cannot finish; any available partial findings remain readable.
- A searchable, on-device history of posts viewed in the last 24 hours, including already generated answers and comments; available after browser restart.

SuperX's AI features require a configured connection; local browsing history works without one. Subscription OAuth connects directly from the extension, while CLI / ACP uses the official local service. Neither clicks X's Grok buttons. The X built-in Grok mode and URL-only interpretation mode were removed in version 0.7.0. SuperX is an independent project and is not affiliated with X or xAI.

## Install

Requirements: desktop Chrome or Chromium-based Edge 120+, and provider access to the selected model and search tools. API Key and OAuth modes run entirely in the browser. The optional local mode provides Windows PowerShell and macOS Terminal guidance for official Grok. OAuth has been exercised in installed Windows Chrome; macOS, other browsers and local CLI acceptance remain separate checks. Automated tests are not a live-device pass.

For the currently published Chrome Web Store version (last verified: 0.9.12), install from the store. Use the manual steps below for 1.0.0 until it reaches the store:

1. Open [SuperX in the Chrome Web Store](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo) and choose **Add to Chrome**.
2. Open **Settings → Connection**. New installations default to **Sign in · The X Subscription**: choose **Sign in to Grok** and approve the short code on the official page. You can instead configure **Grok API Key** or **Grok Build · Local CLI / ACP**. Each initially selects **Grok 4.3 / None**. Save settings, enable SuperX and open X.
3. Chrome manages extension updates. If replacing an unpacked installation, disable the old copy first to avoid duplicate analysis and configure the store copy separately.

For Edge or a manual GitHub installation:

1. Download the [**1.0.0 Stable installation ZIP**](https://github.com/bwjoke/SuperX/releases/download/v1.0.0/SuperX.zip) and extract it, or choose another labelled Preview or Stable package from [Releases](https://github.com/bwjoke/SuperX/releases). The versioned `SuperX-<version>.zip` and `SuperX.zip` attachments are identical. Alternatively, download the source and use its `extension/` folder.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Open SuperX settings, configure a connection available in that release and save. Enable SuperX and refresh X. Version 1.0.0 supports subscription sign-in, API Key and CLI / ACP; older archived releases may offer fewer connections.

To upgrade a manual installation, replace the files in the folder you actually loaded, reload the extension, then refresh X. Keep that folder in a permanent location. The GitHub-generated source archive is different from the extension ZIP attached to a release.

Switching from an unpacked installation to the store is a separate installation, with no automatic settings or Key migration currently provided. Disable the old installation first to avoid duplicate analysis, then configure the new one.

## Sign in with a Grok subscription

In **Settings → Connection**, new installations start with **Sign in · The X Subscription**. Choose **Sign in to Grok**, check the short code and approve the requested access yourself on the official xAI authorization page, then return to SuperX. No API Key, terminal, CLI or extra SuperX program is needed on Windows or macOS. A successful login loads the account's model directory without sending a test fact check. Each connection defaults to **Grok 4.3 / None**; if the account does not offer that model, choose an available one explicitly.

The authorization page can display **Grok Build** because this route uses xAI's shared public OAuth client; it is not a separately registered SuperX identity or an official partnership claim. Account eligibility, models, allowance and charges follow the provider's current rules; not every subscription is guaranteed to work. [Connection details](docs/CONNECTIONS.md#grok-subscription-oauth--browser-only) explain the identity and supported flow.

New sign-ins request only `openid offline_access grok-cli:access api:access`, without `profile` or `email`; SuperX does not fetch or use account-profile information. Existing connected logins stay connected, and this change does not reduce an already granted authorization retroactively.

**Remember login on this device** is selected by default. The rotating refresh token is encrypted locally with its own AES-GCM key in extension IndexedDB; access tokens stay in restricted browser-session storage and memory. No SuperX password or browser sync is used. Turn Remember login off to keep this login only for the browser session. If a refresh result cannot be safely confirmed or saved, sign in again. Signing out removes this connection without clearing your saved API Key or local Grok configuration. See [Privacy](PRIVACY.md).

## Set up your Grok API Key

For The X Subscription, use [Grok Dashboard → API Keys](https://grok.com/dashboard/api-keys), select **Grok Inference** rather than the default **Cursor** type, and enable Chat / the required model permissions. Existing [xAI Console](https://console.x.ai/) Keys remain supported. Check your [usage dashboard](https://grok.com/dashboard/usage) and provider rules for entitlement, limits and charges. SuperX does not promise that every subscription includes free or unlimited API use.

Both sources use **Settings → Connection → Grok API Key**; no separate Key-source selection is needed. Expand **Get a Grok API Key or check usage** to find the relevant account links. Check subscription usage in Grok Dashboard, or pay-as-you-go usage and billing in xAI Console, according to where you created the Key. Saving a Key confirms local storage, not API authentication or remaining allowance.

Eligible API use from The X Subscription shares the plan's weekly allowance. Alternatively, create a Key and add pay-as-you-go credits in [xAI Console](https://console.x.ai/), with token and tool charges managed there. Buying standard API credits does not enable faster processing automatically. [Priority Processing](https://docs.x.ai/developers/advanced-api-usage/priority-processing) is separately priced and requires explicit opt-in; SuperX currently sends standard requests. Priority may reduce latency during demand peaks but does not guarantee availability. See [Privacy](PRIVACY.md) for the data sent and the provider's handling.

**Remember Key on this device** is checked on first setup. It encrypts the Key automatically in this browser profile and restores it after browser restart, with no password or unlock step. Uncheck Remember Key and save to remove the encrypted record and local encryption key, keeping your API Key only for the current browser session. Browser sync is not used. **Clear saved Key** removes the encrypted record, encryption key, obsolete Key records, session credential and cache, while keeping your remember preference.

Existing plaintext Keys and usable session Keys from older versions migrate automatically when Remember Key is selected; plaintext records are removed after the encrypted save succeeds. Missing or damaged saved data requires entering the API Key once again. Older password-encrypted records are not decrypted and remain only until successful migration, replacement or clearing. Automatic encryption protects against exposure of the stored ciphertext alone; it does not protect against access to the full browser profile or a compromised device. See [Privacy](PRIVACY.md) for storage details.

In API mode, requests go directly from the extension's background worker to `api.x.ai`; the project does not operate a relay server. The Key is not passed to the X page's content script. Analysis uses your Key when SuperX is enabled. Clearing or replacing the Key cancels queued and active requests and clears the session cache; already sent work may still be billed. Read [Privacy](PRIVACY.md), especially on pages that show non-public posts.

## Settings and behavior

API mode: choose the model and reasoning effort from separate dropdowns. Models offered are `grok-4.3`, `grok-4.5`, `grok-4.6` and `grok-4.7`, with only supported effort levels shown. Grok 4.3 and no reasoning are each marked Recommended. This combination usually gives quicker, more concise checks with fewer Tokens; the default concurrency is 3; existing 4.5–4.7 settings retain low effort, and already saved custom model IDs remain available. Higher effort may increase latency and Token use; it does not enable Fast/Priority processing. Concurrency can be set from 1 to 8, and availability depends on your xAI account. At least one of **X search** or **Web search** must be enabled: both built-in and custom modes use the original post URL as their primary context and request its full text, including content hidden behind **Show more**. Retrieval can fail; the extension cannot guarantee that a model has obtained every part of a thread or inspected its media.

**Analyze after (seconds)** defaults to **1** in all three connection modes. Automatic tasks wait until feed/page scrolling stops and the post stays visible for the full configured time. Scrolling again resets that wait, including work still waiting in the provider queue; a request that has already started continues. Scrolling inside SuperX's answers does not reset the feed timer. Choose **0–30 seconds**, including fractional seconds; **0** starts immediately. Manual reanalysis and comments do not wait. History still records visible posts immediately, independently of provider access. Changing only this wait does not cancel started requests. The first upgrade from older settings changes the former defaults of 0 seconds / concurrency 4 to 1 second / concurrency 3 once; later explicit choices of 0 or 4 are retained.

Choose **Automatic mode** (the default) or **Manual mode** in Settings. Manual mode stops automatic post analysis and add a SuperX icon immediately to the left of Grok in each post's upper-right actions. Move the pointer over the icon to start that post's analysis immediately, or click / activate it with the keyboard. Only one card is displayed in the existing right-column area, with its top aligned to the selected post; long answers scroll within the card. Selecting another post replaces the visible card. Returning to a completed answer reuses it; use **Retry** for a fresh analysis. Closing the card restores the native right column. Turning manual mode on withdraws automatic work that has not started and preserves accepted requests. Browsing history and explicit draft checks retain their existing behavior. Choose Automatic mode to resume automatic analysis with your saved dwell time.

SuperX runs **Fact Check directly**. It retrieves the linked post and goes deeper into explicit claims, reasonably implied factual premises and checkable details, following relevant source context, numbers, comparisons and causal reasoning. It does not first generate an explanation, paraphrase the post or append a second fact-check request. Quote only the minimum needed to connect a finding to its claim. Distinguish what the author actually said from inferred premises; do not invent claims, force corrections or treat missing evidence as proof of falsehood. A sourced answer can still be mistaken.

Custom mode uses one **Shared fact-check prompt** for published posts and both kinds of draft. **New post context instructions** and **Reply context instructions** add each draft's context rules; comment suggestions have their own prompt. Blank instructions use the defaults; each prompt accepts up to 12,000 characters. Saving new prompts affects new tasks. Use **Reanalyze** for an existing post answer or **Check again** for a draft. A draft remains the target: quoted posts help interpret a new post, while available thread roots, earlier replies and the direct parent help resolve a reply's references. Both use the same depth and evidence standards as published-post checks. Application rules still enforce the selected language, safe handling of source material, avoiding duplicate recaps and comment output format. Earlier explanation settings no longer select a separate generation step; existing saved history, including earlier explanations, remains readable until its usual expiry or deletion.

Language settings contain two independent choices, both **Auto** by default. **Grok answer language** first uses the valid language mark on X's currently displayed post text, then falls back to the author's displayed prose. Quoted posts and search results do not choose the language. A fixed answer language overrides translation / original switches. **SuperX interface language** follows X's UI language in Auto; before X has reported a language, it uses the browser interface language. You can choose a fixed interface language for the rail, Settings and popup. Twelve UI languages are supported, with English as fallback. Changing only the interface language preserves answers and in-progress requests.

Collapse the right column with its top chevron; click the SuperX symbol to expand it. Collapse cancels tasks that have not started; started tasks may finish and their results are retained. Leaving a post's viewport withdraws unstarted queued work; started answers continue and are restored when you return. In 0.9.11, switching browser tabs also preserves started fact checks, comments and their retries, so returning reuses the same task. New automatic work waits until the feed is visible again. Refreshing, navigating away or closing a tab still stops that page's tasks; requests already sent may still be billed.

X's compose/reply dialogs, enlarged media and fullscreen content take precedence over SuperX: the rail, header and expand button temporarily hide and no new automatic checks start. Already-started requests can finish. Closing the viewer restores the feed and its configured reading wait. Answer links and sources use a consistent blue for the current light/dark theme, independent of individual post-link styling.

## Costs and cache

Automatic analysis can generate paid requests for every visible post. All X tabs share the configured request slots; excess work queues. Started answers keep generating when you scroll away, including while X temporarily unmounts a post. Returning to that post restores its answer without another request. Work not yet started can be withdrawn when it leaves view. Cancelled requests retain their slots until local transport cleanup finishes; aborting locally does not confirm that server-side work has stopped. The local mode uses a serial queue and its own model / effort selections; keep the official service terminal open and check the connection in Settings.

API Key and local CLI / ACP fact checks and comments retry transient failures after 3 seconds, up to 5 additional attempts per task. Waiting retries hold no request slot and rejoin the shared queue; other posts continue. Partial findings and reported usage are retained across attempts. Invalid credentials, account/balance restrictions, unsupported settings, output limits and unconfirmed local cancellation require user action instead of automatic retries. OAuth does not automatically replay generation after an accepted HTTP 200 response, stream failure, incomplete output or timeout; a rejected HTTP 401 can refresh authorization once before a single recovery request. An error on one post does not pause the whole queue. Retried or manually repeated requests can incur additional provider usage and charges.

There is no extension-level post-count limit or spending cap. More tabs, search tools, retries and **Reanalyze** can increase usage. Version 0.9.11 uses one generation request per fact-check attempt; comment suggestions use a separate request. Retrieval and model processing can still take time, and a request can invoke search tools multiple times. SuperX does not enable premium Priority Processing, change account budgets or switch models automatically. Check pricing and actual charges in the matching Grok Dashboard or xAI Console account.

The per-post Token display uses provider-reported usage for the current fact check and comments. Hover it for model and stage details. It does not total earlier reanalyses or all account spending. Cached results show their original usage and that no new usage was incurred for that cache hit; partial or missing statistics are marked rather than estimated.

Completed results are reusable for up to 24 hours within the current browser session, with a limit of 160 entries and approximately 4 MB. Cache identity includes the connection source, OAuth authorization identity where applicable, post, model, reasoning effort, answer language, search options, generation flow and effective prompts. Switching sources or signing into another OAuth account does not reuse the previous source/account's generated answers or comments, including generated history views; locally recorded post visits remain available. Cached results use trusted session storage and are removed when the browser session ends or credentials change. Old persistent caches are removed on upgrade. Expired entries are pruned when the worker starts and when new entries are saved; the 24 hours is a reuse limit, not an exact-time deletion timer within an open session. **Clear cache** removes the session cache. See [Privacy](PRIVACY.md) for what entries contain.

## Browsing history

Open **Browsing history** from the right-column header, extension popup or Settings. It lists supported posts actually visible while SuperX and history recording are enabled, with no dwell delay and no API Key required. Recording is enabled by default. Repeated views of a post are merged and move it to the top; its retention period is 24 hours after the latest view.

The history stores the displayed post text, author, URL, language, viewing times and available generated answers, sources, Token/model details and comment drafts in restricted `chrome.storage.local`. It survives browser restart, is not encrypted or synced, and is bounded to 1,000 posts and approximately 6 MB. Storage limits may remove older entries before 24 hours. It does not preserve a full post archive or save images. Opening, searching or expanding a saved answer makes no API request and does not preload remote images. Opening an original post or source link visits that website.

Search posts, authors and saved answers; remove individual entries or use **Clear history** to delete everything saved there. Turn off **Save browsing history** to stop new records and answer updates without deleting existing entries. Expired records are excluded from history views and pruned on startup, history reads/writes and an hourly background alarm. Browser shutdown, scheduling delays or storage errors can delay physical cleanup; there is no exact-time deletion guarantee.

History is separate from the API result cache: **Clear cache**, clearing/replacing the API Key and ending the browser session do not delete it. **Clear history** does not delete the Key or result cache, and does not erase an answer already displayed in X. Viewing history never automatically resumes analysis. Private or protected posts can be retained if they were visible on a supported page; see [Privacy](PRIVACY.md).

## Future direction

**Let your AI agent understand what you've been reading on X.** A future direction is user-controlled sharing of selected posts and saved explanations from SuperX's browsing history with your own AI agent, giving it context for follow-up research, discussion and writing. Agent integration is not available in the current release.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No answers | Enable SuperX, configure the selected connection, enable at least one search tool and refresh X after installing or reloading |
| Local Grok cannot connect | Keep its terminal open and check the saved local code/port; follow the [connection guide](docs/CONNECTIONS.md) |
| Wrong answer language | Select Auto to follow the displayed post, or choose your preferred fixed language; cached answers are separated by target language |
| Fact check incomplete | Expand the result's diagnostic details; possible causes include an output limit, connection failure, language mismatch, timeout, rate limit or account access |
| Rate limit or model busy | API Key/local transient failures retry after 3 seconds, up to 5 times; OAuth does not replay an accepted request. Other posts keep queuing. Check diagnostics before a manual retry |
| OAuth login expired or refresh uncertain | Sign in again in Settings; no saved API Key is substituted. Only approve the short code on the official authorization page |
| Unusual sidebar layout | Reload the extension and refresh X; report the page type, browser version and a redacted screenshot |

An answer with sources is not a guarantee of correctness. An incomplete fact check does not certify the post. Partial findings stay labelled incomplete during retries and after exhaustion; retry manually when appropriate.

## Development

Use **Node.js 22 or newer**. No `npm install` is needed for the extension, tests or local preview.

```sh
node tools/validate.mjs
node tools/preview-server.mjs
npm run package
```

The validator checks declared resources, JavaScript syntax and automated tests. The preview server prints a local URL and uses simulated storage and answers; it does not read your installed extension's Key or call the paid API. Continuous integration runs the validator and produces installation artifacts. See [Contributing](CONTRIBUTING.md) for development and [the release checklist](docs/RELEASE_CHECKLIST.md) for acceptance status. CI artifacts do not by themselves publish a GitHub Release. The website is maintained separately and is not part of this repository or its source release.

| Folder | Contents |
| --- | --- |
| `extension/` | Files loaded by the browser |
| `tests/` | Automated regression tests with mocked browser and provider APIs |
| `demo/` | Local UI previews using production code |
| `tools/` | Validation, preview and release helpers |
| `docs/` | Release channels, acceptance checklist and the README preview image |

Some internal module and storage names retain GrokFirst identifiers for upgrade compatibility. Changes to them need migration review.

## License

Project code and documentation are available under the [MIT License](LICENSE). The bundled Marked parser retains its [third-party license](extension/marked-LICENSE.txt).

For security reports, follow [SECURITY.md](SECURITY.md). Do not include API Keys or private post contents in public issues.
