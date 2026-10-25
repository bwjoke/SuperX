# Security policy

SuperX is currently a Beta. There is no guaranteed security-response time or long-term support schedule. Use the latest available release and review its change notes before installing.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/bwjoke/SuperX/security/advisories/new) for sensitive reports when the repository's **Security → Advisories → Report a vulnerability** option is available. The repository owner must enable this option; its existence is not assumed before publication.

If private reporting is unavailable, open a [public issue](https://github.com/bwjoke/SuperX/issues/new/choose) that only asks for a private reporting channel. Do not include an exploit, API Key, private post, full request payload or other sensitive details in that issue. Wait for the maintainer to provide a private channel before sending those details. This project does not publish a separate security email address.

A useful private report includes the affected release, browser version, relevant page type, expected versus actual behavior, and a minimal reproduction using fabricated credentials and content. State whether the issue could expose credentials, execute model-provided code, bypass origin checks or trigger unauthorized requests. Redact screenshots and logs.

## If a Key was exposed

Revoke or rotate it in the xAI console, check account usage, and replace or clear it in SuperX. Clearing the local Key does not revoke the provider credential. Do not commit a replacement Key to the repository.

## Implementation boundaries

- Known sensitive X routes are excluded by the manifest and a shared runtime policy. Background requests check current and pending browser-owned tab URLs, not only a port's connection-time sender URL. Entering a blocked route cancels local tasks and clears transient page state. Reload a supported page after a direct excluded-page load. This is defense in depth: X host permissions remain, future routes can differ, and a malicious extension update can remove these controls. Keep this extension out of wallet/financial browser profiles and prefer an unfunded research-only X account. See the [2026-10-25 review](docs/SECURITY_REVIEW_2026-10-25.md).

- Keys and provider calls remain in the extension background worker and trusted extension UI.
- Remembered API Keys are automatically encrypted with AES-GCM. Ciphertext is stored in `chrome.storage.local` as `apiKeyEncrypted`; a separate, randomly generated, non-extractable CryptoKey is stored in extension IndexedDB. The worker automatically restores the decrypted API Key into restricted session storage after browser restart. There is no password or manual lock/unlock workflow. Session-only API Keys remain in session storage and necessary runtime memory.
- Encryption protects exposure of ciphertext or local-settings storage alone. It does not protect access to the ciphertext and IndexedDB together, a full browser profile or backup, or a compromised runtime/device. The CryptoKey’s non-extractable flag prevents raw export through Web Crypto; it does not provide operating-system or hardware binding. Settings, custom prompts and recent browsing history are not encrypted.
- Existing plaintext credentials and usable old session Keys migrate automatically when Remember Key is selected; plaintext is removed only after successful encryption. Older password-encrypted records are not decrypted. Missing or damaged ciphertext or encryption keys require one-time API Key re-entry; obsolete records remain only until successful migration, replacement or clearing.
- Disabling Remember Key removes the saved ciphertext, separate encryption key and obsolete persistent records. Clearing credentials also removes the session Key and cache. Logical deletion does not guarantee forensic erasure or removal from older backups.
- API analysis requires an available API Key and enabled features. The optional local mode requires a confirmed official Grok login and restricted ACP session; it does not use the extension API Key. There is no automatic provider fallback or paid retry. Key clearing and replacement cancel old task generations and clear the session cache. There is no separate consent-state gate.
- Feed pages receive configuration and Key readiness, never the credential itself.
- Official local Grok access is optional and fixed to loopback. The generated launch command binds to `127.0.0.1`; remote hosts, arbitrary WebSocket paths and user-provided URL query strings are not accepted. The local connection code is separate from the API Key, encrypted on device and omitted from feed configuration and diagnostics. Its protection has the same full-profile/device limits as remembered Keys. It is a local-service access credential: copied commands, shell history and screenshots must be treated as sensitive. The official service does not enforce a SuperX-only browser origin.
- SuperX supplies an inline restricted profile, confirms the actual local-function count is zero, verifies model/effort selections and rejects all reverse file/terminal/permission RPCs. Startup commands isolate configuration and disable imported integrations. These checks are not an OS sandbox, a guarantee against a compromised official runtime, or permission to bypass managed-device policy.
- WebSocket disconnection does not imply the official task stopped. Cancellation explicitly requests cancel and session closure; reconnection is limited to cleanup, never a repeated prompt. Unconfirmed cleanup is surfaced to the user, who can stop the service in its terminal. Already submitted work can consume quota.
- Recent history is stored in restricted `chrome.storage.local`, without sync or a server copy. Recording defaults on and observes supported posts actually visible while SuperX is enabled; no Key or completed analysis is required. Stored text, generated answers, sources, usage/model metadata and comments can include non-public content. History lasts 24 hours from the latest view, bounded to 1,000 posts / approximately 6 MB, with expiry filtering and startup, read/write and hourly alarm cleanup. Browser shutdown or storage errors may delay physical deletion. It is separate from the session cache: clearing or replacing credentials and clearing cache do not remove history. Deletion/clearing and disabling recording guard against late task results recreating removed entries. The feed cannot request the full saved history collection.
- Model and retrieved content are untrusted data. Markdown rendering must continue to use a restricted DOM builder, without model HTML execution or remote model images.
- New host permissions, telemetry, automatic paid retries or persistence changes require explicit review.

This document supplies a reporting process; it does not claim an external security audit has been completed.
