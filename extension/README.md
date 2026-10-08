# SuperX — Grok CLI 二次开发版

本项目基于 [bwjoke/SuperX](https://github.com/bwjoke/SuperX) 的 **0.7.26** 版本进行二次开发。原项目及其贡献者拥有原始代码的版权；本版本保留原 [MIT 许可证](LICENSE.txt) 与 [Marked 第三方许可证](marked-LICENSE.txt)。本版本是独立修改版，**不是上游官方发布，也不代表原作者、X 或 xAI 的认可或支持**。详见 [来源与修改声明](NOTICE.md)。

当前二次开发版本：**0.7.31**。上游版本号与本版本独立，不表示上游已经合并这些功能。

## 新增与调整

- 本地 Grok CLI 桥接：复用本机 Grok 登录，保留原有 xAI API 模式。
- 可设置 1–300 秒连续停留后分析，默认 5 秒；可切换为仅点击「需要了解」后调用。
- 快速解释默认不联网，联网补充来源可选；CLI 请求串行处理。
- 图片、视频查看器及模态界面打开时隐藏侧栏，关闭后恢复。
- 切换标签页时取消未开始的任务，保留正在生成的结果。

## 本地安装（macOS）

1. 解压到准备长期保留的目录，在 `chrome://extensions` 开启开发者模式并加载该目录。
2. **已经安装并登录 Grok CLI**：双击目录里的 **`连接 Grok.command`**。助手自动识别本目录的扩展 ID、CLI 路径与 Python，不需要复制 ID 或填写 API Key。
3. 返回插件设置，连接状态自动刷新；刷新 X 即可使用。完成首次连接后，以后直接使用，无需重复连接或测试。
4. **还没安装 CLI**：打开插件设置中的「还没安装或登录 Grok？」。按 [Grok 官方指引](https://github.com/xai-org/grok-build#installing-the-released-binary) 安装，再运行 `grok login` 登录，最后双击连接文件。
5. 在「回答来源」中设置停留秒数，或关闭「停留后自动分析」，改为仅手动触发。

浏览器不能自行执行本机程序，所以首次双击连接助手仍然必需。此步骤只注册本扩展的连接，不下载软件、不修改浏览器安全设置，也不要求管理员权限。macOS 可能要求确认打开文件或访问浏览器配置；无法自动识别时，设置页提供一条包含当前扩展 ID 的备用命令。系统提示未安装 Python 3 时，请按提示从 Python 官网安装。CLI 安装和登录由用户主动完成，助手不会静默执行。

高级方式仍可用：`python3 native/install.py --extension-id <扩展ID> --runtime <临时目录>`。不传 ID 时会自动发现本目录对应的安装；自定义临时目录可放在外置磁盘。

桥接安装器当前支持 macOS 的 Google Chrome 与 Ego Lite。扩展或 CLI 路径改变后需重新注册桥接。更新现有安装时保持加载目录不变，重载扩展并刷新 X，不必卸载重装。

## 数据与限制

CLI 请求仍发送到 Grok 云端，使用账号额度；本地运行不代表离线或免费。插件不读取或保存 CLI 登录凭证。快速模式仅解释页面可见文字，不读取原帖全文，也不直接理解图片或视频。搜索与引用不代表事实已经核实。评论仅生成草稿，不自动发布。

桥接请求文件会清理；Grok CLI 可能按其自身配置保存会话。浏览历史、设置、API Key 的处理见 [随附隐私说明](privacy.html)。停留控制限制自动分析，不改变本地浏览历史的记录规则。

## 验证与反馈

在完整仓库源码的根目录运行 `npm test` 和 `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'`。这些测试使用模拟接口，不调用真实付费模型。

已在 Ego Lite（Chromium）实测 CLI、停留/手动触发及图片遮挡修复。未完成独立 Google Chrome、Edge、Windows 或 Linux 的整套验收。模型时延和账号可用性可能变化。

二次开发功能的问题应提交给本版本维护者，不要将其当作上游官方行为。原项目与原有功能文档见 [bwjoke/SuperX](https://github.com/bwjoke/SuperX)。
