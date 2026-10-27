# SuperX 1.1.0

Published as [GitHub Stable/Latest v1.1.0](https://github.com/bwjoke/SuperX/releases/tag/v1.1.0) on October 27, 2026 at 04:52:24 in Asia/Shanghai (`2026-10-26T20:52:24Z`). Download the verified [SuperX.zip](https://github.com/bwjoke/SuperX/releases/download/v1.1.0/SuperX.zip) installation package. The published installation and source ZIPs match the successful release workflow's downloads byte for byte.

[Chrome Web Store 1.1.0](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo) is public. The maintainer confirmed publication and the official listing and Google-delivered package were verified on October 28, 2026. The listing reports an October 27 update date. GitHub and the store now offer the same version.

## Changes

- Choose Automatic, Custom or Pause from the popup or Settings. Custom combines the post-header button, button hover, whole-post hover, detail-post checks and reply checks. The first four start enabled, with one-second hover delays; reply checks start disabled. Existing explicit choices remain intact.
- Display matching cached findings immediately in every mode. Triggers control new requests; repeated hover and duplicate copies of a post share existing work. An explicit recheck can bypass the cache.
- Show a compact trigger summary in the popup and a left-to-right logo countdown while a new hover check is pending. Match X's native post-control hover appearance and honor reduced motion.
- Preserve accepted work through mode changes, tab switches and temporary connection restoration. Remove disallowed automatic work before it starts, while keeping explicit checks and manual draft checks available under their existing rules.
- Include the reply-control spacing and hidden retained DOM repairs prepared in the earlier 1.0.1 candidate.
- Fix extensionless video-cover URLs in feed and quoted posts by preserving their required image format and supplying the original-size parameter. The same image input is supported by API, subscription OAuth and local Build. Recognized image rejections receive a specific message and are not automatically replayed.

## Validation and scope

The final functional tree passed **1,262 automated checks** and the existing **196 isolated browser checks**. Isolated checks use controlled storage/provider fixtures; they are not additional paid-provider or installed-browser passes. Detailed scenario records remain in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

Installed Windows Chrome observations and maintainer-reported interaction checks cover the recorded subscription/Grok 4.3 scenarios, including the corrected video's successful check from its profile timeline. They do not establish fresh API Key/local Build inference, Edge/macOS installation, OAuth full-browser restart or natural-expiry acceptance. No new provider or extension permission is introduced.

| Release evidence | Status |
| --- | --- |
| Reviewed source commit | [`716bfa885984d43699734271834d8527159efbdd`](https://github.com/bwjoke/SuperX/commit/716bfa885984d43699734271834d8527159efbdd) |
| GitHub CI and release workflow | [CI passed on all three operating systems](https://github.com/bwjoke/SuperX/actions/runs/40398983322); [release workflow passed](https://github.com/bwjoke/SuperX/actions/runs/40399242400) |
| Installation ZIP and SHA-256 | `SuperX-1.1.0.zip` / `SuperX.zip`: `f31914ad56cb4052f005cd6d30491a924f582c33f977b6dd1fad941b07a52268` |
| Curated source ZIP and SHA-256 | `SuperX-1.1.0-source.zip`: `36398000d6c6f4d5c81575ee37f34c69665497a1b28e5c552788be552095d59e` |
| GitHub Stable/Latest publication | Published; Latest resolves to v1.1.0 and the anonymously downloaded installation ZIP matches the recorded SHA-256 |
| Chrome Web Store 1.1.0 | Public; official listing and package verified October 28, 2026; listing update date October 27 |
| Google-delivered CRX and SHA-256 | `SuperX-store-1.1.0.crx`: `54aacd5b0e06f59565ca2ce6e03545b719b78a1e1e746dcb8fcd360fcfd56733` |
| Public privacy page | [Canonical HTTPS page](https://superx.vip/privacy/) verified with HTTP 200, version 1.1.0 and Custom/hover text after the separate website deployment |

The release includes installation/source inventories and checksum files. Later documentation status updates do not change the source tag or rebuild the published ZIPs.

The store CRX has 52 files versus 51 in the accepted installation ZIP. All 50 ordinary files are byte-identical; the manifest only adds Google's `update_url`, and `_metadata/verified_contents.json` is the sole added file. This comparison did not install or independently signature-verify the CRX and does not extend functional acceptance. CRX and ZIP are different formats; their whole-file hashes are not expected to match.

## Community acknowledgements

Thanks to [@0xDenji-Ai — PR #1](https://github.com/bwjoke/SuperX/pull/1), [@risingjerry — PR #4](https://github.com/bwjoke/SuperX/pull/4) and [@ArronKong — PR #5](https://github.com/bwjoke/SuperX/pull/5) for proposals that informed the work. SuperX 1.1.0 contains independently implemented changes; none of those PRs was merged as code for this release.

Thanks also to [@PG2047 — PR #3](https://github.com/bwjoke/SuperX/pull/3) for the security review. The maintainer explicitly deferred that proposal for separate follow-up; its recommendations are not claimed as implemented or resolved in 1.1.0. [@s4ndr1ver — PR #2](https://github.com/bwjoke/SuperX/pull/2) remains a separate proposal and is not included as a feature claim here.

## Follow-up boundaries

- The deferred security proposal above remains separate work. This release does not change the existing credential-storage guarantees documented in [PRIVACY.md](../PRIVACY.md).
- Current feed extraction still prefers an image's `src` over `currentSrc` and does not independently extract `video[poster]`. These existing media-discovery edge cases remain follow-up work; the video-cover repair above addresses the confirmed JPEG URL defect.
- External images may expire, become inaccessible or fail decoding. Only recognized structured image error codes identify that cause specifically; a generic upstream 400 may still remain a generic request error. A successful fixture or one repaired post does not guarantee every remote image can be read.

Existing tags, published packages and their hashes remain unchanged. Update an unpacked installation by replacing its files, reloading the extension, then refreshing X. Do not run duplicate store and unpacked installations at the same time.

## Completed store-publication follow-up — 2026-10-28

The maintainer authorized the follow-up on October 27 and confirmed store publication on October 28. The official listing and package independently confirmed 1.1.0. README and channel records were updated without changing the release tag or published assets. Each PR's current discussion was checked before posting; no equivalent 1.1.0 reply existed. The existing GitHub release already remained Stable/Latest, so no promotion was needed.

| PR | Posted acknowledgement | Scope communicated |
| --- | --- | --- |
| #1 | [Reply to 0xDenji-Ai](https://github.com/bwjoke/SuperX/pull/1#issuecomment-6450701237) | Main trigger goals independently covered; continuous hover and multi-post rail retained; score and access-token persistence not included; original CLI PR distinguished from the author's newer fork |
| #2 | [Reply to s4ndr1ver](https://github.com/bwjoke/SuperX/pull/2#issuecomment-6450704030) | DeepSeek and in-browser X reading remain a separate Draft proposal, outside 1.1.0 |
| #3 | [Reply to PG2047](https://github.com/bwjoke/SuperX/pull/3#issuecomment-6450705368) | Security hardening explicitly deferred to a separate release, not claimed as implemented |
| #4 | [Reply to risingjerry](https://github.com/bwjoke/SuperX/pull/4#issuecomment-6450708284) | Main usage-control goal covered by independent Automatic / Custom / Pause implementation with cache reuse and retained work |
| #5 | [Reply to ArronKong](https://github.com/bwjoke/SuperX/pull/5#issuecomment-6450710872) | Header button and configurable hover covered independently, retaining the multi-post rail |

All five PRs remain open and unmerged; #2 remains Draft. No review thread was resolved and no PR state was changed. Contribution credits remain in the release notes. The one-time store follow-up automation `superx-1-1-0` is retired after completion.
