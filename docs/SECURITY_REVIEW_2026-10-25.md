# SuperX security review — 2026-10-25

## Decision and scope

**An audited, pinned build is suitable for an isolated trial; this review does not establish suitability for a browser profile used for cryptocurrency signing or a funded X Money account.**

Baseline: [`bwjoke/SuperX` commit `5cfa125f9000866c1719afc452d1867ef37280bf`](https://github.com/bwjoke/SuperX/tree/5cfa125f9000866c1719afc452d1867ef37280bf), version 1.0.0. The review covers extension permissions, content/background messages, provider requests, credential storage, rendering, local-service restrictions, and release contents. The accompanying patch adds targeted controls and regression tests. Findings below describe observable gaps or conditional risks, not evidence of deliberate theft or a demonstrated X Money transfer exploit.

No live account, wallet, signing device, payment, or paid model request was used. The Chrome Web Store CRX, provider infrastructure, browser vulnerabilities, and the installed Grok runtime were not audited. No operating-system sandbox was verified. Passing tests cannot prove the absence of vulnerabilities.

## Existing controls and trust boundaries

The baseline [`extension/manifest.json`](../extension/manifest.json) requests `storage` and `alarms`, host access to `x.com`, `twitter.com`, `api.x.ai`, and `auth.x.ai`, and optional loopback access. It does not request `cookies`, browser `history`, `debugger`, `nativeMessaging`, or all-site access. This limits exposure to unrelated sites; it does not make permitted X pages read-only.

Chrome [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) can read and modify their page DOM. An isolated JavaScript world does not protect the displayed page from the extension. Missing `cookies` permission does not prevent actions through an authenticated page. Conversely, X host access does not itself grant direct access to another wallet extension's private storage or arbitrary DeFi pages.

Controls present in the source include:

- [`background.js`](../extension/background.js) restricts local/session storage to trusted extension contexts and keeps provider credentials in the background worker. Trusted UI and feed messages have separate authorization paths.
- [`key-store.js`](../extension/key-store.js) uses AES-256-GCM with non-extractable keys in IndexedDB. This protects a ciphertext-only disclosure, not theft of the whole browser profile, malicious extension code, or device compromise.
- [`markdown-renderer.js`](../extension/markdown-renderer.js) constructs a bounded DOM from Markdown tokens. It does not execute model HTML or load model images. HTTP(S) link validation does not establish that a destination is trustworthy.
- [`build-transport.js`](../extension/build-transport.js) fixes local connections to `127.0.0.1` and requires a connection secret. [`build-acp.js`](../extension/build-acp.js) rejects client tool/permission requests; [`build-setup.js`](../extension/build-setup.js) generates restrictive runtime settings. These are application controls, not an OS sandbox.

## Findings and changes

### F1 — Incomplete sensitive-route exclusion and stale SPA authorization

**Priority: medium; privacy/control hardening with potentially serious financial context.**

The baseline injects scripts across all paths on the two X hosts. Its runtime denylist omits Money and several account/payment routes. A long-lived port retains its connection-time sender URL after single-page navigation; checking that URL alone cannot prove the current page remains permitted. This establishes an authorization gap, not evidence that Money data was transmitted or funds could be moved.

The patch:

- Shares a normalized route policy through [`feed-core.js`](../extension/feed-core.js), including Money, payment, account, authentication, settings, and private-message sections. Ambiguous encodings fail closed.
- Adds manifest exclusions for direct navigation and content/draft guards before reading or dispatching work.
- Checks browser-owned current/pending tab URLs in the background, including before queued jobs run. Navigation to excluded routes disconnects the client and cancels work.
- Clears retained draft state and stops feed activity after a sensitive SPA transition.

Relevant files: [`manifest.json`](../extension/manifest.json), [`background.js`](../extension/background.js), [`content.js`](../extension/content.js), [`draft-composer.js`](../extension/draft-composer.js).

**Residual limit:** A path denylist can miss future routes. Cancellation cannot recall data already sent or guarantee remote computation stops. These checks do not remove X host permissions or prevent a malicious future extension version from abusing them.

### F2 — Synthetic feed-control events could trigger privileged actions

**Priority: medium, conditional on attacker-controlled JavaScript already executing in the X document.**

The feed uses an open shadow root. Baseline manual handlers did not consistently require trusted browser events. A page script could dispatch synthetic events to controls that request work or change settings. Ordinary tweet text alone does not provide this capability.

The patch requires `event.isTrusted === true` for manual feed actions in [`content.js`](../extension/content.js). Regression tests check that synthetic events cannot cause those actions. This does not prevent UI deception, a compromised browser, or legitimate user clicks on misleading content. Automatic analysis remains automatic.

### F3 — API-key requests lacked the OAuth transport restrictions

**Priority: low; conditional transport hardening.**

In [`api-provider.js`](../extension/api-provider.js), only OAuth requests previously specified redirect rejection and omitted ambient cookies. Following a redirect can disclose a POST body under some redirect conditions; this is not proof that the provider redirects requests or that a bearer token would be forwarded cross-origin.

Both credential modes now set `redirect: 'error'`, `credentials: 'omit'`, `cache: 'no-store'`, and `referrerPolicy: 'no-referrer'`. Unexpected final response URLs are rejected. Transport tests cover the restrictions. The provider remains a trusted recipient of submitted content.

### F4 — Automatic usage and retained history remain operational risks

**Priority: configuration decision; disclosed behavior, not a theft finding.**

[`feed-core.js`](../extension/feed-core.js) enables analysis by default once a connection is available; new installs select OAuth. API-key mode can incur paid usage. There is no extension-level monetary cap, and retries can consume additional allowance. [`history-store.js`](../extension/history-store.js) enables local history by default, including visible protected posts, with a 24-hour reuse/retention policy, up to 1,000 entries and approximately 6 MB. Actual deletion can be delayed.

These defaults are not silently changed by this patch. Pause automatic analysis during setup; use a dedicated provider credential with a provider-side spending limit where available. Disable and clear history when retention is unwanted. Clearing credentials does not clear history or provider records. See [`PRIVACY.md`](../PRIVACY.md).

## Crypto and X Money deployment

Use a separate research profile with no wallet extension, exchange session, or payment activity. Prefer a separate X account without Money funds or linked financial instruments. Using the same funded X account in two profiles preserves account-level risk. Profile separation also does not protect against OS compromise.

Use a clean financial browser for transactions. Hardware wallets protect key custody, but malicious approvals can still authorize loss. Verify the recipient, amount, network, and approval scope on a trusted display where supported; avoid blind signing when the transaction cannot be understood. See [Ledger's explanation](https://www.ledger.com/academy/cryptos-greatest-weakness-blind-signing-explained).

The official [X Money FAQ](https://money.x.com/en/i/faq) places beneficiary management at `https://x.com/i/money/settings/beneficiaries`: excluding only `money.x.com` is insufficient. It requires a passkey for Money sign-in, but does not establish fresh authorization bound to every transfer. Card purchase limits do not constitute a P2P cap; the FAQ describes verified P2P as unlimited and most payments as noncancelable. Use the official app or a clean browser for Money and report unauthorized activity promptly. [Deposit insurance](https://money.x.com/en) covers insured-bank failure, not extension compromise.

## Validation and supply chain

- Baseline validator: **1,188 tests passed; 3 Windows-specific tests skipped** in the approved runtime.
- Patched validator: **1,209 tests passed; 3 Windows-specific tests skipped**, including syntax checks for 56 JavaScript files and the 51-file production package. The 21 added tests cover route policy, stale ports, pending navigation, cancellation, draft/image cleanup, synthetic input and transport restrictions. They use local fixtures and fabricated data, not a live X or Money account. One earlier concurrent run timed out in an unchanged IndexedDB test; the complete final run passed without changing that test.
- The reviewed hardening candidate is **not an upstream release**. Its installation ZIP SHA-256 is `d62b059718aa98c1590b3c5f7d34cf665230b2a8c7010a761d6ed8e27fbbdcf7`. Its manifest retains version 1.0.0; identify this candidate by its security branch/commit and hash, not the version number alone.
- Published GitHub `SuperX-1.0.0.zip`: all **51 files** matched the pinned commit's extension contents and the published file manifest. No missing, extra, duplicate, unsafe-path, or differing entries were found. Archive SHA-256: `72480dd586d962e3b67004348072b6a9b4bd0c6f8fad345183bb85fc82f892fe`.
- Vendored Marked **18.1.0** matched the [npm package](https://registry.npmjs.org/marked/-/marked-18.1.0.tgz), including its license; registry SHA-512 integrity verified. UMD SHA-256: `f424dcb508fdf93e0137a970cfce8f3207ea2e3f37eca5f7556a52875683632a`. This establishes byte correspondence, not absence of dependency vulnerabilities.

The ZIP comparison does not authenticate the Chrome Web Store CRX. Chrome [automatically updates store extensions](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle); future updates require separate review. Pin the audited source, retain its package hash, and review upstream changes before installing updates. A fork is not itself a security control, and freezing it indefinitely can miss security fixes.
