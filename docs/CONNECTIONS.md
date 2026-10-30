# Connect SuperX

The current release offers three independent connections: [Chrome Web Store](https://chromewebstore.google.com/detail/superx/clcflilaihhnnglfamdblhopokpnlioo), [release notes](https://github.com/bwjoke/SuperX/releases/latest) and [installable ZIP](https://github.com/bwjoke/SuperX/releases/latest/download/SuperX.zip). **Sign in · The X Subscription** is first and the default for new installations; **Grok API Key** uses a Key you create; **Grok Build · Local CLI / ACP** connects to the official service on your computer. All three initially select **Grok 4.3 / reasoning None** and retain their own choices. Existing selections and settings are preserved. Nonempty older settings without a source keep API; missing/empty settings with legacy credentials also keep that conservative API path. Switching sources never substitutes another credential, changes account budgets or bypasses quotas. Archived 0.7.26 supports API Key mode only.

| Connection | What you need | Where you sign in / manage usage |
| --- | --- | --- |
| Sign in · The X Subscription | An eligible Grok account and a browser | Official xAI device-authorization page; your Grok account |
| Grok API Key | A Grok Inference Key or xAI Console API Key | Grok Dashboard for subscription allowance, or xAI Console for pay-as-you-go usage |
| Grok Build · Local CLI / ACP | Official Grok installed, signed in and running locally | Official CLI login and account; SuperX connects only to its loopback service |

## Grok subscription (OAuth) — browser only

This connection works directly from Chrome / Edge on Windows or macOS. **No Grok CLI, terminal, additional SuperX program or API Key is required.**

1. Open **Settings → Connection**. New installations already select **Sign in · The X Subscription**; choose **Sign in to Grok**.
2. SuperX displays a short authorization code and opens the official `accounts.x.ai` / `auth.x.ai` device page. Check that the code matches and confirm the requested access yourself. Enter your account password only on the official site, never in SuperX.
3. Return to SuperX. After authorization, it loads the account's model directory without sending a Fact Check, comment or other test inference request. If the page was closed, reopen the official link from Settings before the code expires; otherwise cancel and start again.
4. Select a model available to this account and a supported reasoning level, then save settings and enable SuperX. The initial choice stays **Grok 4.3 / None**; an unavailable choice is shown explicitly rather than silently replaced by Grok 4.7.

**Why the official page may say Grok Build:** SuperX currently uses xAI's shared public OAuth client, not a separately registered SuperX client. [OpenClaw's xAI documentation](https://docs.openclaw.ai/providers/xai) documents the same shared-client identity and [its implementation](https://github.com/openclaw/openclaw/blob/main/extensions/xai/xai-oauth.ts) provides a public reference. This does not make SuperX an official partner or establish support for every plan. Eligibility, available models, tool access, limits and charges follow your account and the provider's current rules.

**Remember login on this device** defaults on. SuperX encrypts the rotating refresh token locally with a separate AES-GCM key in extension IndexedDB. Access tokens remain only in restricted browser-session storage and worker memory. No SuperX password, browser sync, CLI login file or project relay is used. With remembering off, the login lasts only for this browser session. Expiry follows the provider's returned token lifetime, with background and on-demand refresh. A missing/corrupt record, uncertain rotation or failed rotated-token save requires a new login rather than reusing a possibly consumed refresh token.

**Sign out** removes this OAuth connection and attempts to revoke the most recently known refresh token at the provider. It does not log out of your browser's Grok website, stop the CLI, erase recorded post visits, or clear saved API/local credentials. Revocation is best effort; provider-side records and account controls remain separate. Changing connection source cancels a pending device login; it does not automatically sign out an already connected OAuth account.

The extension requests the additional fixed host `https://auth.x.ai/*` for device authorization, token refresh and revocation; an upgrade may require Chrome to approve this new site access. Generation and model-directory calls go directly to `https://api.x.ai`, using OAuth Bearer authorization without CLI identity headers. The public client ID is `b1a00492-073a-47ea-816f-4c329264a828`; it is an application identifier, not a credential.

New authorizations request four scopes: `openid offline_access grok-cli:access api:access`. They omit `profile` and `email`, the optional profile/email claim scopes described in [OpenID Connect §5.4](https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims). `offline_access` requests refresh access under [OpenID Connect §11](https://openid.net/specs/openid-connect-core-1_0.html#OfflineAccess); the two Grok access scopes are provider-defined, with the granted scope controlled by the authorization server ([OAuth 2.0 §3.3](https://www.rfc-editor.org/rfc/rfc6749.html#section-3.3)). SuperX does not fetch or use account-profile information.

Existing connected logins are preserved: a narrower new request does not retroactively reduce an old grant. An unfinished device login saved with an older scope set is discarded; start sign-in again for the current request. Fresh four-scope authorization, login restoration after reloading the extension, live Grok 4.3 Fact Checks and three generated comments have passed in installed Windows Chrome. The user confirmed that the official authorization page no longer listed name/avatar or email. Full-browser restart restoration and natural-expiry checks remain outstanding for this four-scope grant. See [acceptance scope](#acceptance-scope) and [Privacy](../PRIVACY.md).

OAuth generation is not automatically replayed after an accepted HTTP 200 response, an in-stream failure, incomplete output or timeout. An initial HTTP 401 rejection can refresh authorization once and make one recovery request; a second rejection requires sign-in again. Retained partial output and reported usage stay visible, while other posts continue through the shared queue. Check the error before choosing **Reanalyze** yourself.

## Grok API Key

This browser-only option works on both Windows and macOS. No terminal or extra local software is required.

1. Open SuperX **Settings → Connection**, select **Grok API Key**, and expand **Get a Grok API Key or check usage** if needed.
2. Choose the appropriate account site: for eligible The X Subscription API allowance, use [Grok Dashboard → API Keys](https://grok.com/dashboard/api-keys), choose **Grok Inference** instead of **Cursor**, and enable **Chat** / the required model permissions. For pay-as-you-go API credits, create a Key and add credits in [xAI Console](https://console.x.ai/). Both Keys go in the same SuperX input; there is no additional provider or Key-source selection.
3. Create a Key, paste it into SuperX, and save. **Remember Key on this device** is selected by default and restores it after browser restart without a SuperX password.
4. Select an available model and reasoning effort. Enable SuperX and open X.

Entitlement, usage limits and charges depend on your account and the provider's rules. Check [Grok Dashboard usage](https://grok.com/dashboard/usage) for subscription usage, or xAI Console for pay-as-you-go usage/billing. A subscription is not a promise of free or unlimited API usage, and saving a Key does not validate provider access or available allowance. See [Privacy](../PRIVACY.md) for data and credential handling.

Eligible API use from The X Subscription shares the plan's weekly allowance. For pay-as-you-go API use, create a Key and add credits in [xAI Console](https://console.x.ai/); tokens and tool calls are billed there. Purchasing standard credits does not automatically improve processing priority. [Priority Processing](https://docs.x.ai/developers/advanced-api-usage/priority-processing) requires explicit opt-in and extra payment; SuperX currently uses standard requests. Priority can reduce peak-time latency but does not guarantee availability.

## Grok CLI / ACP — official local connection

Use the official Grok installation and account login. **No separate SuperX installer, Node installation, browser host registration or downloaded profile file is required.** The browser communicates with the official CLI's ACP WebSocket service; it cannot start terminal programs by itself.

The guide covers **Windows PowerShell** and **macOS Terminal**, including Apple silicon and Intel Macs supported by the official Grok distribution. Use desktop Chrome or Chromium-based Edge 120+. This release checks compatibility with **Grok Build 1.0.60** before sending a task; another version is rejected until its protocol and restrictions are reviewed.

1. Follow the [official Grok installation instructions](https://github.com/xai-org/grok-build). Open PowerShell on Windows or Terminal on macOS. Run `grok --version` to check the installation, then `grok login` and finish signing in on the official page. SuperX does not ask for your account password or receive the login token.
2. Open **SuperX Settings → Grok Build · Local CLI / ACP → Step-by-step guide**. Select Windows or macOS, then **Generate launch command**. SuperX creates a random local connection code automatically; you do not need to invent a password or edit configuration files.
3. Copy the generated command into that terminal and run it. It starts the official service on **127.0.0.1**, with an isolated temporary working/configuration directory and restricted discovery settings. Keep the terminal open while using this mode.
4. Return to SuperX and select **Check connection**. Approve the browser's optional access to the local address if asked. The check confirms the official login, protocol, available models and restricted session without sending a Fact Check or comment prompt.
5. **Save connection**, choose an available model and reasoning effort, and save settings. Enable SuperX and open X. Local settings initially select **Grok 4.3 / reasoning off (`none`)**, independently of API Key and OAuth choices. The local mode does not use your extension API Key. If the official CLI cannot confirm that model or reasoning level, SuperX keeps the choice visible and asks you to choose a supported option; it does not silently switch to Grok 4.7 or enable reasoning.

The former CLI default **Grok 4.7 / Low** is migrated once to **Grok 4.3 / None**. Older versions did not record whether that exact pair was chosen manually; other combinations and later explicit selections are retained. ACP `none` is a distinct level from `minimal` and `low` and must be confirmed by the official service before a prompt is sent.

For daily use, start the generated command before opening X. After restarting your computer, start it again; SuperX cannot automatically launch the official CLI. If you generate a new connection code, run the new command and save the new connection together. To stop the service, press **Ctrl+C** in its terminal. You can switch back to API Key mode at any time.

The service is bound to this computer, not the local network or a public relay. The connection code authorizes access to that local service. Keep it, the generated command and screenshots of either private. It is not your Grok account password or API Key. SuperX encrypts its saved copy locally and does not send it to X or a SuperX server. Local encryption does not protect a compromised device or full browser profile. Terminal history and your clipboard can retain a copied command; generating a new code and stopping the old service invalidates that old connection.

SuperX supplies a restricted profile for each new post session, checks that the actual local-function count is zero, refuses filesystem/terminal/permission requests and observes only the allowed hosted search events. The generated launch command also disables imported coding/MCP integrations. These are application restrictions, **not an operating-system sandbox** or a guarantee against a compromised official runtime. Do not replace the generated command with `--always-approve` or expose the service on `0.0.0.0`.

Closing a browser connection alone does not guarantee that an official-service task stops. SuperX explicitly requests cancellation and session closure; if it cannot confirm this, it reports the uncertainty instead of retrying. Press Ctrl+C in the service terminal if a stop cannot be confirmed. If the warning remains after the service has stopped, reload SuperX from Settings, then start and check the service again; the worker deliberately keeps an unresolved-session block until it can confirm cleanup or is reloaded. Already submitted work may count against provider usage. Official Grok can make supporting requests, such as generating session titles, in addition to the main task.

In all three connection modes, automatic analysis waits until feed/page scrolling stops and a post remains visible for the configured time: 1 second by default, adjustable from 0 to 30 seconds in Settings. Further scrolling resets pending work's timer; scrolling inside SuperX's answers does not. Zero starts immediately, and manual reanalysis/comments bypass the wait. API Key and OAuth share the configured request limit, default 3 (configurable from 1 to 8); local Grok tasks run serially with a fresh session per post. Neither ACP nor the selected reasoning effort guarantees lower latency or lower quota consumption. Reported Token counts are not a measurement of subscription cash charges.

Started answers, comments and their existing retries continue when posts scroll out of view, when X temporarily unmounts their articles and when switching browser tabs. Returning restores the same task and partial output without starting another request. While the feed is hidden, new automatic triggers pause and only work confirmed never to have started is withdrawn. Actual page navigation, tab closure and BFCache suspension still stop interrupted work safely, retain available partial output and require manual retry. Unstarted work can also be withdrawn when it leaves view. API Key and CLI / ACP tasks retry transient failures after 3 seconds, up to 5 additional attempts, without pausing other posts. Waiting retries release their request slots and rejoin the shared queue only after local transport cleanup finishes. Reported usage accumulates across attempts; retries may consume additional provider allowance or paid API usage. Invalid credentials, account restrictions, output limits, unsupported settings and unconfirmed local cancellation do not automatically retry. OAuth uses the more conservative no-replay policy above. No retry changes the selected connection, model or reasoning level.

Generated cache entries and saved-history answers/comments are scoped to the selected connection source and, for OAuth, the individual authorization identity. Switching sources or OAuth accounts does not show another source/account's generated results. The local record of which posts you visited remains available; switching or signing out does not delete those visits.

## Troubleshooting

| Message or situation | Next step |
| --- | --- |
| `grok` is not found | Finish the official installation, then reopen PowerShell or Terminal so its PATH is updated. |
| Sign-in required | Run `grok login` outside the SuperX launch command, complete the official login and check again. |
| OAuth authorization expired / declined | Cancel and sign in again from Settings; approve only the code on the official page. No CLI login or API Key is needed. |
| OAuth refresh uncertain / storage error | Sign in again. SuperX will not reuse a potentially consumed refresh token or fall back to your API Key. |
| OAuth connected but model directory unavailable | Reload the model directory; this is separate from the login state. Keep the selected model until the account confirms availability. |
| Cannot connect | Keep the service terminal open. Check that its port and code match SuperX; stop any older service before starting a replacement. |
| Local permission denied | Allow SuperX's optional local-address access from the connection check. API mode does not need it. |
| Unsupported version | Compare `grok --version` with this release's tested version. Use API mode while a newer official runtime is awaiting compatibility review. |
| Model / effort unavailable | Select the choices reported by the connected account. API and CLI catalogs may differ; no model is silently substituted. |
| Restricted session could not be confirmed | Use the generated command. Managed-device policy may prevent this setup; do not disable company protections. API mode remains available. |
| Stop could not be confirmed | Press Ctrl+C in the official service terminal. SuperX does not replay the request automatically. |
| Usage / account limit | Check the matching account's usage and billing, then retry the affected post manually. This task does not automatically retry; other posts are not globally paused. Switching transport is not a quota workaround. |
| Rate limit / model busy / interrupted stream | API Key/local transient failures retry after 3 seconds, up to 5 times. OAuth does not replay accepted requests; inspect the retained error/partial output before a manual retry. Other posts continue. |

## Acceptance scope

### Current four-scope Windows Chrome record — 2026-10-18

This record applies to `openid offline_access grok-cli:access api:access`, not to an earlier grant containing profile/email. The user approved a fresh authorization on the official page and confirmed that name/avatar and email were no longer listed. An initial live Grok 4.3 check returned 23,754 Tokens (23,417 input / 337 output), four clickable sources and no cache marker or authentication error.

The latest installed 0.9.11 checks then recorded:

| Scenario | Observed result |
| --- | --- |
| Reload the extension and refresh X with the four-scope login already saved | Login restored without a new authorization |
| New live Grok 4.3 Fact Check | 30,226 reported Tokens: 29,693 input / 533 output; six distinct citation sources |
| Generate comment suggestions | Exactly three drafts; 1,373 reported Tokens: 1,305 input / 68 output |
| Copy a comment from this run | The copy button showed **Copied** after its clipboard write resolved; independent system-clipboard readback was not verified |
| Switch to another browser tab while generation is running, then return | User-confirmed continuation of the same generation without another request |
| Fully exit/reopen Chrome with this four-scope grant and perform a new uncached check | Not yet established; extension reload is a separate result |
| Reach natural token expiry and refresh safely | Not yet observed live |

The visible model tooltip and citations were checked, but the run did not capture the raw request body, token returned-scope field or native annotation payload. UI citations and reported Tokens do not establish billing treatment or a captured native-annotation protocol assertion.

### Earlier six-scope evidence — separate historical result

An earlier October 18 Windows Chrome installation used `openid profile email offline_access grok-cli:access api:access`. It passed live Grok 4.3 Fact Checks with clickable sources, three one-line comments and **Copied** feedback, cross-tab cache reuse, and new uncached generation after the user fully exited/reopened Chrome without signing in again. The user also confirmed sign-out returned to the selected source's login guidance, did not silently fall back, and preserved saved API Key/Build configuration. These results belong to that six-scope grant; they do not prove full-browser restart restoration or expiry for the current four-scope flow.

### Automated coverage and remaining limits

The recorded local validation passed **1,057 automated tests**, and **16 isolated Edge Manifest V3 locale-selection checks** verified packaged metadata selection. Windows/macOS command generation, OAuth lifecycle, provider behavior and hidden-tab continuation have controlled coverage. These are not real-account Edge/macOS or official CLI installation/inference passes.

This run did not establish new live API Key inference, official CLI / ACP real-account installation/inference, installed Edge/macOS operation or actual natural token expiry. It does not guarantee every subscription's eligibility, Included billing treatment, factual accuracy or service availability. See [the release checklist](RELEASE_CHECKLIST.md#0911-stable-promotion--2026-10-19). The Chrome Web Store and GitHub Stable/Latest now provide 0.9.12, verified on October 20, 2026. That update fixes rail layout around reply editors and preserves these connections; publication does not mark the remaining live scenarios as passed.

For API failures, open **Local diagnostic log** at the bottom of Settings. It keeps up to 30 failures from the last 24 hours of the current browser session, with redacted provider details and supported trace IDs. Transport HTTP status and an error event's status are separate: an HTTP 200 stream can still fail later, and a `spending_limit` event alone does not establish HTTP 402 or an exhausted subscription. Review the matching account's usage and the recorded cause before deciding what to change. Existing failures whose details were not retained cannot be reconstructed. Copying or clearing this local log does not call the provider or clear browsing history.

## 中文快速引导

新安装默认选择排在首位的 **订阅登录 · The X Subscription**（OAuth），另有 **Grok API Key** 和 **本机 Grok Build · CLI / ACP**。已有来源和各自设置不变；旧设置非空但没有来源，或设置缺失／为空但留有旧凭据时，保留 API 路径。订阅登录仅需浏览器，Windows 和 Mac 均无需 API Key、CLI 或额外程序：在「设置 → 连接」点击登录 Grok，核对短码后由本人在官方 xAI 授权页确认，再回到 SuperX。页面可能显示 **Grok Build**，这是共享 OAuth 客户端的身份，并非 SuperX 独立注册的应用或官方合作声明。账号资格、模型、额度与费用以提供方规则为准；三种来源均默认 4.3／关闭推理，不可用时由用户明确改选。

新授权只请求 `openid offline_access grok-cli:access api:access`，不再请求 `profile`／`email`，也不获取或使用账号资料信息。后两项属于标准可选资料权限，见 [OpenID Connect §5.4](https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims)；`offline_access` 用于请求刷新授权，见 [§11](https://openid.net/specs/openid-connect-core-1_0.html#OfflineAccess)，Grok 两项访问权限由服务商定义并决定实际授予范围，见 [OAuth 2.0 §3.3](https://www.rfc-editor.org/rfc/rfc6749.html#section-3.3)。已有登录不会自动退出，旧授权也不会追溯缩权；旧权限范围的待完成设备登录会清除，需要重新开始。

默认在本机记住登录：刷新 Token 由独立 AES-GCM 密钥加密，密钥在扩展 IndexedDB，访问 Token 只保留于受限会话和内存。无需密码、不使用同步；关闭记住后，浏览器新会话需重新登录。升级新增固定 `auth.x.ai` 主机权限，Chrome 可能要求批准。轮换结果无法确认或保存失败时重新登录，不能反复消费旧刷新 Token。退出 OAuth 不清除 API Key／本机配置或本机帖子访问记录。更换来源／账号后，生成回答、评论与历史中的生成内容按来源及授权身份隔离。

OAuth 已收到 HTTP 200 后的流错误、未完成或超时不自动重放；首次 HTTP 401 拒绝可刷新授权并恢复一次。其他帖子继续处理，手动重新核查前请先查看错误和部分输出。生成中的核查、评论及既有重试在滚出视野、帖子临时卸载或切换浏览器标签页后继续，返回显示原任务，不重复请求；信息流隐藏时暂停新的自动触发，只撤出确认从未开始的排队工作。真正导航、关闭标签页和 BFCache 挂起仍会安全停止受影响任务，保留已有部分结果供手动重试。

**2026-10-18 四项权限实测：**用户在官方授权页确认不再列出姓名／头像和邮箱后亲自授权，初次真实 Grok 4.3 核查返回 23,754 Tokens 和四个可点出处。最新重载扩展并刷新 X 后，已有四项权限登录恢复；新 Grok 4.3 核查返回 **30,226 Tokens（输入 29,693／输出 533），六个不同引用源**；随后生成恰好三条评论，**1,373 Tokens（输入 1,305／输出 68）**。复制按钮在剪贴板写入返回成功后显示 **Copied**，但未独立核验系统剪贴板读回。用户确认生成中切走其他标签页，再回来仍继续同一任务，没有重新请求。完整退出重开 Chrome 后的四项权限恢复和自然到期仍未建立。不能把重载扩展当作完整浏览器重启，也不能沿用早先六项权限的评论复制、跨标签缓存和完整重启结果宣称这些项目通过。

当前记录另有 **1,057 项自动测试**和 **16 项隔离 Edge Manifest V3 语言选择检查**通过，不能代替 Edge／macOS 实装、新 API Key 推理或本机 CLI 真实账号安装／推理验收。本次未捕获原始请求体、Token 返回的 scope 字段或原生 annotation 协议；不保证所有套餐资格、Included 计费或服务可用性。完整范围见上方[验收记录](#acceptance-scope)。2026-10-20 商店与 GitHub Stable/Latest 已同步为 0.9.12；该版修复回复框与右栏布局，保留上述连接方式。剩余实机待测项保持不变。

**Grok API Key 模式**在 Windows 和 Mac 上都只需浏览器：打开「设置 → 连接 → Grok API Key」，按需展开获取帮助。使用订阅 API 额度时，去 [Grok Dashboard → API Keys](https://grok.com/dashboard/api-keys) 创建 **Grok Inference** 类型而非 Cursor 类型的 Key，按账号要求授权 Chat／模型；使用按量付费 API 时，去 [xAI 控制台](https://console.x.ai/) 创建 Key、购买额度。两种来源均粘贴到同一个 API Key 输入框并保存，不另选来源。默认在本机自动加密记住，无需 SuperX 密码；保存不代表已验证 API 权限或剩余额度。用量和费用请到创建 Key 的账户查看。

符合条件的订阅 API 使用计入共享周额度；也可在 [xAI 控制台](https://console.x.ai/) 购买按量付费额度。购买普通额度不等于启用额外收费的 Priority Processing，SuperX 当前使用标准处理。三种模式均默认在停止滚动、帖子连续可见满 1 秒后自动分析，设置可改为 0–30 秒，0 秒立即分析；API Key／OAuth 默认共享并发上限 3（可设 1–8），本机模式逐项执行。手动重新分析、评论及浏览历史不受停留等待影响。

**本机 Grok Build · CLI / ACP 模式**无需安装 SuperX 提供的其他程序：先按 [Grok 官方说明](https://github.com/xai-org/grok-build) 安装并用 `grok login` 登录。打开 SuperX 的逐步引导，选择 Windows 或 macOS，生成并复制启动命令；Windows 在 PowerShell、Mac 在终端执行。保持该窗口打开，回到 SuperX 检查连接、保存连接，再选择模型／推理档位并保存设置。检查连接不发送核查问题。

启动命令只监听本机地址，自动生成连接码并隔离工作／配置目录。连接码只用于本机官方服务，不是账号密码或 API Key；请勿公开连接码、完整命令或相关截图。SuperX 本机加密保存连接码，不读取或复制官方登录文件。重启电脑后需要重新运行启动命令；按 Ctrl+C 停止服务。浏览器断线不等于官方任务已经停止，若提示停止未确认，请在终端按 Ctrl+C 手动停止。停止后若提示仍在，请从设置重新加载 SuperX，再启动服务并重新检查连接；停止未确认时不会自动重试，也不会转为 API 计费。

CLI／ACP 支持 Windows 和 macOS 引导；此版本按官方 Grok 1.0.60 检查兼容性。工具限制不等同于系统沙箱，本机 CLI 的 Mac 及真实账号实机验收仍需另行完成。完整数据说明见 [隐私说明](../PRIVACY.md)。

Sources: [official Grok Build installation](https://github.com/xai-org/grok-build), [official agent / WebSocket mode](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md), [headless CLI and ACP](https://docs.x.ai/build/cli/headless-scripting).
