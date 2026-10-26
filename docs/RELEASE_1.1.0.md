# SuperX 1.1.0

Published as [GitHub Stable/Latest v1.1.0](https://github.com/bwjoke/SuperX/releases/tag/v1.1.0) on October 27, 2026 at 04:52:24 in Asia/Shanghai (`2026-10-26T20:52:24Z`). Download the verified [SuperX.zip](https://github.com/bwjoke/SuperX/releases/download/v1.1.0/SuperX.zip) installation package. The published installation and source ZIPs match the successful release workflow's downloads byte for byte.

Chrome Web Store 1.1.0 has **not been submitted**. The last verified public store version is **0.9.12**. GitHub publication and the later store upload are separate operations.

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
| Chrome Web Store 1.1.0 | Not submitted |
| Public privacy page | [Canonical HTTPS page](https://superx.vip/privacy/) verified with HTTP 200, version 1.1.0 and Custom/hover text after the separate website deployment |

The release includes installation/source inventories and checksum files. Later documentation status updates do not change the source tag or rebuild the published ZIPs.

## Community acknowledgements

Thanks to [@0xDenji-Ai — PR #1](https://github.com/bwjoke/SuperX/pull/1), [@risingjerry — PR #4](https://github.com/bwjoke/SuperX/pull/4) and [@ArronKong — PR #5](https://github.com/bwjoke/SuperX/pull/5) for proposals that informed the work. SuperX 1.1.0 contains independently implemented changes; none of those PRs was merged as code for this release.

Thanks also to [@PG2047 — PR #3](https://github.com/bwjoke/SuperX/pull/3) for the security review. The maintainer explicitly deferred that proposal for separate follow-up; its recommendations are not claimed as implemented or resolved in 1.1.0. [@s4ndr1ver — PR #2](https://github.com/bwjoke/SuperX/pull/2) remains a separate proposal and is not included as a feature claim here.

## Follow-up boundaries

- The deferred security proposal above remains separate work. This release does not change the existing credential-storage guarantees documented in [PRIVACY.md](../PRIVACY.md).
- Current feed extraction still prefers an image's `src` over `currentSrc` and does not independently extract `video[poster]`. These existing media-discovery edge cases remain follow-up work; the video-cover repair above addresses the confirmed JPEG URL defect.
- External images may expire, become inaccessible or fail decoding. Only recognized structured image error codes identify that cause specifically; a generic upstream 400 may still remain a generic request error. A successful fixture or one repaired post does not guarantee every remote image can be read.

Existing tags, published packages and their hashes remain unchanged. Update an unpacked installation by replacing its files, reloading the extension, then refreshing X. Do not run duplicate store and unpacked installations at the same time.

## After Chrome Web Store approval

The maintainer authorized this follow-up on October 27, 2026. Wait for their explicit approval confirmation or reliable official evidence that item `clcflilaihhnnglfamdblhopokpnlioo` publicly serves 1.1.0. Update the channel records without rebuilding release assets or moving the tag. Then check each PR's current discussion before posting the corresponding acknowledgement below, avoiding duplicate replies. Do not merge or close PRs automatically. The thread follow-up is recorded as automation `superx-1-1-0`.

### PR #1 — proposed follow-up after approval

感谢 @0xDenji-Ai 持续补充实现与验证。SuperX 1.1.0 现已在 Chrome 商店发布：根据用户对用量的反馈，我们保留默认全自动，并加入可配置的自定义模式，支持点击、帖子悬停、按钮悬停、详情页规则及悬停进度。主要目标通过独立实现覆盖，贡献致谢继续保留。

当前采用连续悬停、滚动后重新计时，并保留多帖右栏；评分和访问令牌持久化需要分别评估，尚未加入。这次不会原样合并旧 CLI 实现。再次感谢你的投入与详细说明。

### PR #2 — proposed follow-up after approval

感谢 @s4ndr1ver 的完整实现、测试和限制说明。1.1.0 已发布，本次集中完成现有 Grok 连接、自定义触发和稳定性改进；DeepSeek 与浏览器内 X 读取这条新方案未包含在内。建议先保留为 Draft，额外权限、维护和图片／上下文兼容性留待单独评估，不将本次发布表述为已覆盖此提案。谢谢你的贡献。

### PR #3 — proposed follow-up after approval

Thank you @PG2047 for the detailed hardening proposal, tests, and clear limits. SuperX 1.1.0 is now available in the Chrome Web Store. The maintainer chose to defer this security work to a separate release; it has not been merged or claimed as implemented in 1.1.0. A follow-up review should also preserve valid public post URLs such as `/grok/status/...` when tightening route exclusions. Thanks again for identifying and documenting these gaps.

### PR #4 — proposed follow-up after approval

Thank you @risingjerry for addressing unnecessary usage and providing regression and live-browser checks. SuperX 1.1.0 is now available in the Chrome Web Store and covers the main goal through Automatic / Custom / Pause, configurable triggers, cached-result reuse, and preservation of started work. We used an independent integrated implementation rather than merging the older UI changes as-is, and credited your contribution in the release notes. Thank you again.

### PR #5 — proposed follow-up after approval

Thank you @ArronKong for the post-header button, hover interaction, and layout work. SuperX 1.1.0 is now available in the Chrome Web Store with the header button, configurable button/post hover delays and a waiting-progress indicator. It keeps the existing multi-post rail rather than the proposed single-card layout. We used an independent implementation and credited your contribution in the release notes. Thanks again for helping improve this workflow.
