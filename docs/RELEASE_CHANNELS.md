# Release channels

SuperX uses one source tree and one version sequence, with two distribution channels. GitHub is the project home for code, downloads, documentation and support. The Chrome Web Store provides Chrome-managed installation and updates. GitHub Stable and the store may have different current versions; acceptance results and remaining checks are recorded separately.

## Choose a channel

| Channel | Who it serves | Installation and updates |
| --- | --- | --- |
| Chrome Web Store — Stable | Chrome users who want store installation and automatic updates | Install from the verified store listing; Chrome manages updates |
| GitHub Releases — Preview | People who want the newest changes and can report problems | Download the attached extension ZIP, load it unpacked and update it manually |
| GitHub Releases — Stable | People who want the current maintainer-approved release or a specific archived version | Download the extension ZIP, load it unpacked and update it manually; source and checksums are included |

Preview is a release status, not a second product or a second source repository. The store can lag behind either a newer GitHub Stable release or a Preview. Always show each channel’s actual version instead of implying they update together. The `main` branch and CI artifacts are development outputs, not a promise of an installable public release.

## Versions and downloads

Keep `package.json`, `extension/manifest.json` and the Git tag in agreement: `0.8.3` and `v0.8.3`, for example. Batch related fixes into one reviewable installation candidate; individual development commits and local checks do not require a version bump. Increment the patch version when handing off a distinct candidate or publishing a release, and reserve minor or major version changes for a substantial product milestone. Once a candidate has been distributed for acceptance or published, changed packaged code needs a new increasing version. Do not put a `-beta` suffix in the Chrome `version` field or move a published tag to different code. GitHub's **Pre-release** flag identifies a preview.

Each release provides:

- `SuperX-<version>.zip`: the installation/upload package, with `manifest.json` at its root.
- `SuperX.zip`: an identical-byte convenience alias within that release. `/releases/latest/download/SuperX.zip` selects the latest Stable release, while a versioned Preview URL selects that Preview.
- `SuperX-<version>-files.json` and `SuperX-<version>-SHA256SUMS.txt`: installation inventory and checksums, including the alias.
- `SuperX-<version>-source.zip`, source inventory and source checksums: the curated public source, including project documentation.

GitHub's automatically generated **Source code** archives are not the installation ZIP. Users loading source must select its `extension/` directory.

Use these destinations on the README, website and store support entry:

| Entry | Destination |
| --- | --- |
| Install from Chrome Web Store | `https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo` |
| Website | `https://superx.vip/` |
| Source | `https://github.com/bwjoke/SuperX` |
| Archived Preview 0.9.13 release | `https://github.com/bwjoke/SuperX/releases/tag/v0.9.13` |
| Archived Preview 0.9.13 ZIP | `https://github.com/bwjoke/SuperX/releases/download/v0.9.13/SuperX.zip` |
| Stable 1.1.0 release | `https://github.com/bwjoke/SuperX/releases/tag/v1.1.0` |
| Download Stable 1.1.0 ZIP | `https://github.com/bwjoke/SuperX/releases/download/v1.1.0/SuperX.zip` |
| Archived 1.0.0 release | `https://github.com/bwjoke/SuperX/releases/tag/v1.0.0` |
| Archived 1.0.0 ZIP | `https://github.com/bwjoke/SuperX/releases/download/v1.0.0/SuperX.zip` |
| All versions | `https://github.com/bwjoke/SuperX/releases` |
| Download the latest stable ZIP | `https://github.com/bwjoke/SuperX/releases/latest/download/SuperX.zip` |
| Browse releases and changelogs | `https://github.com/bwjoke/SuperX/releases` and `CHANGELOG.md` |
| Report a bug, request a feature or ask a usage question | `https://github.com/bwjoke/SuperX/issues` |
| Discuss usage | `https://github.com/bwjoke/SuperX/discussions`, after the maintainer enables Discussions; otherwise Issues |
| Privacy | `https://superx.vip/privacy/`, after verifying its published policy content |

GitHub's `/releases/latest` excludes previews and drafts. Until the first stable release exists, mark the stable download as unavailable rather than pointing it at a preview. The current Stable has the direct release and ZIP links above; the Releases list remains the index for all versions and future previews. Any automatic preview index must select published preview releases rather than reuse `/latest`. Preparing these URLs does not publish the repository, its releases or a store listing.

## Prepare a preview

1. Finish the intended changes on a reviewed commit and update the changelog. Complete the first-Preview prerequisites and core Chrome acceptance in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Report remaining Edge and advanced manual scenarios as untested; they do not prevent a clearly labelled Preview.
2. Build the complete release bundle with `npm run package:release`. Check the installation ZIP, source ZIP, inventories and checksums. This local command does not publish anything.
3. After authorization to publish, push the reviewed commit and matching `vMAJOR.MINOR.PATCH` tag. The release workflow validates the source and prepares a **draft preview**, explicitly excluded from Latest.
4. Review the release notes and attachments. Publish the draft explicitly as a **Pre-release**, with known limitations and manual installation/update instructions. A successful workflow alone does not publish a release.
5. Collect reports against that version and installation channel. Batch related fixes before handing off the next candidate; changes to an already distributed package require a new version, and a new tag when published. Leave existing published attachments unchanged.

The workflow refuses to overwrite a published release. CI also produces reviewable build artifacts; they are not the main download entry for users.

## Publish or promote a stable release

1. Select a reviewed candidate and record its installation, upgrade and functional acceptance, including remaining limitations. Test the actual package being released. A Stable designation does not certify every browser, connection or model response.
2. Build or download the versioned installation ZIP and verify its SHA-256, source bundle and inventories. Preserve the same tag, installation files and hashes after publication.
3. With explicit maintainer authorization, publish the GitHub release as **Stable** and mark it **Latest**. GitHub Stable may be released before the Chrome Web Store version catches up. The tag workflow still creates a draft preview by default; a successful workflow alone does not approve or publish a Stable release.
4. Upload that exact installation ZIP to the Chrome Web Store when ready. Do not upload the source ZIP or rebuild different code under the same tag. Record store status separately as not submitted, submitted, approved or published; these states are not interchangeable.
5. Update the README, release notes and public policy/support links with each channel's actual version. When the store publishes the new version, verify its public listing and package without replacing the GitHub artifacts.

If a rejected or failed candidate needs packaged changes, create a new version and repeat acceptance. A production hotfix follows the same process with a smaller change. Store updates require increasing versions and review; the store should not receive every development commit.

For each promotion, record this information in its release notes or release report:

| Field | Value to record |
| --- | --- |
| Version and tag | The installed numeric version and its matching tag |
| Source | The full reviewed Git commit SHA |
| Installation package | File name and SHA-256 |
| Acceptance | Browser/OS, fresh install and upgrade results, remaining limitations |
| GitHub | Preview/Stable status and release URL |
| Chrome Web Store | Verified item ID, version, review/publication status and listing URL |
| Policy and support | Verified public privacy and Issues URLs |

## Moving between installations

An unpacked GitHub installation does not become a store installation automatically. Its development ID can differ from the published store ID, `clcflilaihhnnglfamdblhopokpnlioo`. Settings and remembered Keys belong to the extension's storage and are not automatically migrated between different IDs or browser profiles. Removing an extension clears its local storage.

When switching channels, keep any custom prompt text you need, disable the old installation to avoid duplicate paid analysis, install the desired channel and configure its supported connection. Stable 1.1.0 offers direct subscription sign-in, API Key and local Grok Build / CLI / ACP. New installations default to subscription sign-in and Grok 4.3 / None; saved connection choices are retained. Do not promise a seamless migration until it has been tested with the real store item. A future explicit settings export should exclude credentials; it is not currently implemented.

## Shared project home and support

Start with the GitHub README as the information/download hub. Issues handle bugs and feature requests; Discussions can handle questions, sharing and release announcements once enabled. Store support links point to this same community, so reports are not split across unrelated trackers. Bug reports include version, browser, installation source and reproduction steps. Security reports follow [SECURITY.md](../SECURITY.md).

Until Discussions is enabled, the **Usage question** issue form provides a support path. Suggested Discussion categories are **Q&A**, **Ideas** and **Announcements**. Keep actionable bug reports in Issues and link to them from relevant discussions.

[superx.vip](https://superx.vip/) provides the product website, with **Install stable**, **Try preview**, **Source**, **Support** and **Privacy** entries as each destination becomes available. Downloads come from GitHub and the Chrome Web Store. Keep [privacy/](https://superx.vip/privacy/) as a permanent public policy path. The website is deployed and maintained separately; its source and deployment configuration are excluded from the extension repository and source release. Do not deploy the extension repository over the existing website.

## Current release status — 2026-10-27

**GitHub Stable/Latest is [SuperX 1.1.0](https://github.com/bwjoke/SuperX/releases/tag/v1.1.0)**, published on October 27, 2026 in Asia/Shanghai. Download the verified [1.1.0 installation ZIP](https://github.com/bwjoke/SuperX/releases/download/v1.1.0/SuperX.zip), or use the [latest stable ZIP](https://github.com/bwjoke/SuperX/releases/latest/download/SuperX.zip). Unpacked installations update manually.

The release adds Custom trigger controls, immediate cached findings, hover progress and the confirmed feed video-cover repair. [The release record](RELEASE_1.1.0.md) includes the immutable source commit, successful three-OS CI/release workflows and installation/source hashes; published ZIPs match workflow downloads byte for byte.

Version [1.0.0](https://github.com/bwjoke/SuperX/releases/tag/v1.0.0) remains an unchanged historical milestone combining automatic post fact-checking with explicit checks of post/reply drafts and images. Its source tag, installation/source packages and original hashes remain available.

The Chrome Web Store's last verified public version remains **0.9.12**. Version 1.1.0 has **not been submitted**. Store upload follows separately, after the GitHub release; store availability will be updated only after its own publication and verification.

The [public privacy page](https://superx.vip/privacy/) was deployed separately and verified to return HTTPS 200 with 1.1.0 content. This does not imply store submission or approval.

See [the acceptance record](RELEASE_CHECKLIST.md) for exact automated, isolated-browser and live test scope. Earlier Windows Chrome reply/quote checks and image transport fixtures do not establish every provider's live image interpretation, installed Edge/macOS behavior or the remaining OAuth restart/expiry scenarios.

**[0.9.13 Preview](https://github.com/bwjoke/SuperX/releases/tag/v0.9.13)** remains an unchanged archive of the earlier draft-check release, with its [original installation ZIP](https://github.com/bwjoke/SuperX/releases/download/v0.9.13/SuperX.zip). Historical versions and their acceptance records remain available.

## 0.9.12 store package record

Version 0.9.12 became GitHub Stable/Latest after its Chrome Web Store publication on October 20, 2026. Its original tag and all seven attachments remain unchanged; installation ZIP SHA-256 is `c34d378b2eb37660a0d029c0e2c36b2dd4077a3548413a5a9b35ca55d293c885`. The 0.9.12 layout acceptance below and earlier connection acceptance retain their original scope. Store publication is not a new store-installed functional test.

The Google-delivered 0.9.12 CRX has 51 files against the accepted ZIP's 50: all 49 ordinary files are byte-identical; only Google's `update_url` is added to the manifest, and `_metadata/verified_contents.json` is the sole added file. CRX SHA-256 is `2b96c5b4ff1b4043d7f4cc236e7d0230ce1ba5748ef30b724ba367a186ba1386`. This comparison did not install or independently signature-verify the CRX.

## 0.9.11 promotion record — 2026-10-19

Version **[0.9.11](https://github.com/bwjoke/SuperX/releases/tag/v0.9.11)** became the Chrome Web Store and GitHub **Stable/Latest** release on October 19, before 0.9.12 superseded it on October 20. The public listing then reported version 0.9.11, updated October 19, 2026. Its versioned [installation ZIP](https://github.com/bwjoke/SuperX/releases/download/v0.9.11/SuperX.zip) remains available as an archive. It introduced direct browser subscription sign-in alongside API Key and local CLI / ACP connections, and Fact Check without a preceding explanation.

The existing 0.9.11 release was promoted from Preview by changing its release status and Latest designation only. Its tag, original installation/source attachments and hashes remain unchanged; the 0.7.26 historical release also remains intact. At that time, 0.9.12 was a separate Preview; it subsequently became Stable/Latest on October 20.

Store-package verification used the Google-delivered CRX retrieved over HTTPS, without installing it or independently verifying its signature. The accepted GitHub installation ZIP contains **50 files** and the store CRX **51 files**: all **49 ordinary files are byte-identical**, the manifest semantically adds only `update_url: https://clients2.google.com/service/update2/crx`, and the only new file is `_metadata/verified_contents.json`. No manifest key or other semantic change was found. CRX and ZIP are different formats; their whole-package hashes are not equal.

| Preserved release evidence | Value |
| --- | --- |
| Original tagged source commit | [`151985851dd6555e62864b9f2fb6d2568e9b4d77`](https://github.com/bwjoke/SuperX/commit/151985851dd6555e62864b9f2fb6d2568e9b4d77) |
| Installation ZIP SHA-256 | `cc77b5b1c3f2aa0fcc679127f53003ceac562f3b35ba54af14ec34761d1789bc` |
| Source ZIP SHA-256 | `62064c03dacfe4f62209871ca837be180160d2a271946430be0b195a5f17f89e` |
| Google CRX SHA-256 | `80abbbe205bb8664639fdc8771167ab7bd5f191d351aac5ad678f10788a3873d` |
| Original publication checks | [CI passed](https://github.com/bwjoke/SuperX/actions/runs/39127074307), [release workflow passed](https://github.com/bwjoke/SuperX/actions/runs/39127074254); all seven attachments verified anonymously |

The October 18 acceptance record distinguishes current four-scope Windows Chrome checks from earlier six-scope results. Current checks include restoration after reloading the extension, a live Grok 4.3 Fact Check with six sources, three generated comment drafts and Copied feedback, and user-confirmed continuation across a browser-tab switch without another request. Independent system-clipboard readback was not verified. Four-scope full-browser restart restoration and natural token expiry, installed Edge/macOS operation, and new real-account API Key/local CLI acceptance remain unestablished. See [the checklist](RELEASE_CHECKLIST.md#0911-preview--2026-10-18) and [connection acceptance scope](CONNECTIONS.md#acceptance-scope) for exact evidence and outstanding checks.

## 0.9.12 acceptance — 2026-10-19

[Release notes](https://github.com/bwjoke/SuperX/releases/tag/v0.9.12) · [Installable ZIP](https://github.com/bwjoke/SuperX/releases/download/v0.9.12/SuperX.zip). This release fixes X's inline reply toolbar being mistaken for page navigation, which moved the SuperX header down and clipped the original post's answer. It also tracks native navigation height changes from fonts or CSS without waiting for a scroll. Existing answers and their scroll positions remain in place.

Acceptance includes **263 content regressions**, **1,082 automated validation checks**, and **912 isolated browser checks across 12 scenarios with 38 screenshots**. Exported public source also passed 1,082 checks, and rebuilding its installation ZIP produced identical bytes. After the user reloaded the extension, actual **Windows Chrome 0.9.12** UI checks covered focusing the inline reply, scrolling away and back, opening an image, and opening/closing the new-post dialog; the four existing completed answers remained available. This targeted layout acceptance adds no new provider, authentication, full-browser restart, natural-expiry or macOS acceptance.

Installation ZIP SHA-256: `c34d378b2eb37660a0d029c0e2c36b2dd4077a3548413a5a9b35ca55d293c885`. This candidate was published as Preview on October 19, then promoted unchanged to Stable/Latest after store publication was verified on October 20. Its original source archive retains the Preview-era documentation; current channel information is maintained on `main`.

## Publication history

On October 7, 2026, [bwjoke/SuperX](https://github.com/bwjoke/SuperX) and [0.7.26 Preview](https://github.com/bwjoke/SuperX/releases/tag/v0.7.26) were published. The release uses reviewed commit `254cade96e210e3faef4ca7e08fb67f6bc8c8e90`; its 76-file public source excludes the independently maintained website. Local and exported-source validation passed 642 tests, and both [CI](https://github.com/bwjoke/SuperX/actions/runs/37581481369) and [release packaging](https://github.com/bwjoke/SuperX/actions/runs/37581507805) succeeded on GitHub. The anonymous installation download matches the accepted ZIP byte for byte. Private vulnerability reporting is enabled. The website's GitHub, Preview download and Issues entries are live, and [privacy/](https://superx.vip/privacy/) serves its own bilingual policy without signing in.

On October 8, 2026, the [Chrome Web Store listing](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo) was verified as publicly available at version 0.7.26, item ID `clcflilaihhnnglfamdblhopokpnlioo`. The Google-delivered CRX contains 30 files versus 29 in the accepted GitHub ZIP. All non-manifest files are byte-identical; the store adds `_metadata/verified_contents.json` and only `update_url` to the manifest. CRX and ZIP are different package formats, so whole-package hashes are not compared as equal. The user confirmed store installation, explanations, Fact Check, Key saving and restoration after restart. At that time, the existing [0.7.26 release](https://github.com/bwjoke/SuperX/releases/tag/v0.7.26) was promoted to Stable/Latest without changing its tag or attachments, and the latest-stable link served its accepted installation ZIP. At that October 8 promotion, no newer Preview was available. Version 0.9.11 subsequently became Preview on October 18 and Stable/Latest on October 19, as recorded above.

The user confirmed core functionality on Windows 11 Chrome: upgrade operation, Key restoration after restarting Windows, fresh-profile Enable/Remember Key/Auto defaults, no-Key history, first own-Key save, explanations and Fact Check, independent language switches, Auto original/translation following, and three comment drafts with copying into Notepad.

Edge installed-extension acceptance and advanced manual credential, storage, deletion and race scenarios remain pending, as recorded in [the checklist](RELEASE_CHECKLIST.md). Store publication and the confirmed Chrome core checks do not mark these other scenarios as passed. Stable describes the distribution channel; it does not certify every browser or the correctness of model output. Documentation status updates do not move the published tag or replace its installation/source attachments.

## 简体中文

一套源码，两条渠道：GitHub 是代码、文档、稳定／预览下载与 Issues 支持的项目主页；Chrome 商店提供安装与自动更新。两条渠道可以处于不同版本。GitHub 保留原始安装包与源码存档，验收结果及待测范围单独记录。

所有安装候选使用递增的数字版本及匹配 tag，预览身份用 GitHub 的 Pre-release 标记表示。新 tag 的工作流默认只生成预览草稿。审核附件及验收记录后，维护者可明确授权公开为 Preview，或选择作为 Stable/Latest 发布；GitHub 稳定版可以先于商店发布。准备上传商店时使用同一份安装 ZIP，保留标签、附件和 SHA-256，并单独记录未提交、审核中、已批准或已公开状态。GitHub `latest` 不含预览版；Releases 列表保留所有版本。

相关修正先合并成一批再验收、递增版本号，不为每次开发提交或本地检查单独加号。一般修复递增末位；重大产品阶段可调整次版本或主版本号。已交付验收或公开发布的包不覆盖，后续改动使用新版本，以便追溯。

GitHub 解压版需要手动更新，商店版由 Chrome 更新。当前不同安装 ID 之间不自动迁移 Key 和设置，切换渠道时先停用旧版，避免重复分析。官网 [superx.vip](https://superx.vip/) 独立维护，源码不纳入扩展开源；隐私路径保持为 `/privacy/`。仓库、下载、Issues 及商店入口以实际公开状态为准，最终安装验收需单独完成。

2026-10-08 已核验 Chrome 商店公开版本为 0.7.26，商品 ID 为 `clcflilaihhnnglfamdblhopokpnlioo`。Google CRX 与 GitHub ZIP 的非 manifest 文件逐字节相同，仅多出商店验证元数据，manifest 仅增加 `update_url`。用户已确认商店安装后的解释、Fact Check、Key 保存及重启恢复正常；GitHub 同一版本已晋升 Stable/Latest，标签及附件保持不变。这是 10 月 8 日晋升时的历史状态，当时没有更新的预览版。

**当前 GitHub 稳定版：[1.1.0](https://github.com/bwjoke/SuperX/releases/tag/v1.1.0)，已于北京时间 2026 年 10 月 27 日作为 Stable/Latest 发布。** 可[下载安装 ZIP](https://github.com/bwjoke/SuperX/releases/download/v1.1.0/SuperX.zip)，解压安装后手动更新。公开下载已与发布工作流产物核对一致，源码提交、CI 和校验值见[发布记录](RELEASE_1.1.0.md)。Chrome 商店最后核验的公开版本仍为 **0.9.12**；1.1.0 尚未提交商店。

1.1.0 新增自定义触发、缓存回答立即显示、悬停倒计时和已确认的视频封面修复，保留 1.0.0 的帖子／草稿／图片核查流程。1.0.0 的原标签与附件作为历史版本保留。官网隐私页已单独部署，并核验 HTTPS 200、1.1.0 和自定义／悬停说明；这不代表商店已提交或批准。[验收记录](RELEASE_CHECKLIST.md)仍区分自动检查、隔离浏览器与实机／真实提供方测试；发布稳定版不会扩大已建立的实测范围。

**[0.9.13 Preview](https://github.com/bwjoke/SuperX/releases/tag/v0.9.13)** 作为较早草稿核查版本归档，原始[安装 ZIP](https://github.com/bwjoke/SuperX/releases/download/v0.9.13/SuperX.zip)、源码和校验值不变。0.9.12 及更早版本的发布、商店文件比对和验收记录保留在上文。

**2026-10-19：[0.9.11](https://github.com/bwjoke/SuperX/releases/tag/v0.9.11) 当日成为 Chrome 商店及 GitHub Stable/Latest 版本，原[安装 ZIP](https://github.com/bwjoke/SuperX/releases/download/v0.9.11/SuperX.zip)保留。** 当时官方商店公开页显示版本 0.9.11、更新日期 2026-10-19。此版本此前于 10 月 18 日作为 Preview 发布；晋升只改变状态及 Latest 指向，保留原 tag、安装／源码附件及校验值。0.9.12 当日为独立 Preview，随后于 10 月 20 日成为新的 Stable/Latest；0.9.11 和 0.7.26 均保留为历史归档。

**0.9.12 于 10 月 19 日先作为 Preview 提供，10 月 20 日随商店公开晋升 Stable/Latest。** 它修复帖子内回复工具栏被误当页头、导致右栏下移和首帖答案被裁剪的问题，并跟随原生导航的纯高度变化。263 项内容回归、1,082 项完整检查，以及覆盖 12 种场景的 912 项隔离浏览器检查、38 张截图通过；导出源码验证同样通过 1,082 项检查，重建安装包逐字节一致。用户重载扩展后，已在真实 Windows Chrome 0.9.12 中实测回复框焦点、滚动往返、图片查看及新帖弹窗恢复正常，原有四条已完成回答保留。这些是本次布局修复验收，不扩大旧连接／授权、完整重启／自然到期或 macOS 的实测范围。安装包 SHA-256 见上方 0.9.12 记录。

0.9.11 晋升时从 Google HTTPS 下载的商店 CRX 有 51 个文件，原安装 ZIP 有 50 个：49 个普通文件逐字节一致，manifest 语义上仅增加 Google `update_url`，新增文件仅为 `_metadata/verified_contents.json`，没有新增 manifest key 或其他语义变化。这是文件比对，未安装该 CRX，也未独立验签；CRX 和 ZIP 格式不同，不能声称整包哈希一致。原发布源码提交、安装／源码 ZIP 校验值、GitHub CI／发布工作流和七个匿名可下载附件的证据见上表；0.9.11 晋升没有重打包或替换附件。

0.9.11 提供浏览器内订阅登录、API Key 和本机 CLI／ACP 三种连接，直接 Fact Check，不再前置解释。新安装默认订阅登录，三种来源分别默认 Grok 4.3／关闭推理；已有来源选择保留。商店公开不等于已新增商店实装功能验收，也不能代替下列未验项目。

四项权限的 Windows Chrome 实测已确认重载扩展后的登录恢复、真实 Grok 4.3 六源核查、三条评论生成及 Copied 提示，以及生成中切走标签页再返回后继续原任务、没有重新请求。独立系统剪贴板读回未核验。完整重启浏览器后的四项权限恢复、自然到期、macOS／Edge 实装及新的 API Key／CLI 真实账号验收仍未建立。此前 0.7.26 的 Windows 11 重启、语言、历史和复制等结果，以及六项权限的整浏览器重启结果，均只是各自版本／授权范围的历史证据。具体见[验收清单](RELEASE_CHECKLIST.md)和[连接验收范围](CONNECTIONS.md#acceptance-scope)，不保证模型回答准确。

## Official references

- [GitHub release links](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases) and [Latest release semantics](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)
- [GitHub CLI release creation](https://cli.github.com/manual/gh_release_create) and [release status editing](https://cli.github.com/manual/gh_release_edit)
- [Chrome Web Store updates and deferred publishing](https://developer.chrome.com/docs/webstore/update)
- [Chrome numeric versions](https://developer.chrome.com/docs/extensions/reference/manifest/version), [development extension IDs](https://developer.chrome.com/docs/extensions/reference/manifest/key) and [extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome support URLs](https://developer.chrome.com/docs/webstore/support-users)
