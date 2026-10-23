# DeepSeek + Twikit 本地接入（实验功能）

扩展现在默认支持 [浏览器内 twitter-scraper 模式](../twitter-scraper/README.zh-CN.md)，无需启动本机服务。本文仅描述独立的 Twikit／终端测试工具；扩展不再提供 Twikit 服务选项。

模型生成和网页搜索直连 DeepSeek；读取原帖、搜索 X 由本机 Python/Twikit 完成。不再调用 Grok。DeepSeek 的模型和网页搜索按其官方规则收费；Twikit 本身无需付费 API Key。

可以完全在终端运行，不必加载 Chrome 扩展。只有需要 X 页面内的核查侧栏时，才加载 `extension/`。

## 1. 安装依赖

在项目根目录执行（本次工作环境已安装）：

```sh
python3 -m venv integrations/twikit/.venv
integrations/twikit/.venv/bin/python -m pip install -r integrations/twikit/requirements.txt
```

需要 Python 3.10+、Node.js 22+。

## 2. 在本机配置 X Cookie

Twikit 需要你自己的 X 登录会话。登录 X 网页，在开发者工具的 Application / Storage → Cookies → `https://x.com` 找到 `auth_token` 和 `ct0`。不要发到聊天、提交 Git 或交给第三方网站。

执行下列命令，在终端的隐藏输入中粘贴这两个值：

```sh
integrations/twikit/.venv/bin/python integrations/twikit/configure_cookies.py
```

默认写入 `~/.config/superx/x.cookies.json`，仅当前用户可读写。Cookie 在本机 Twikit 中使用，不传给 DeepSeek；读取出的帖子文字、作者及链接会作为核查上下文发给 DeepSeek。脚本不会覆盖已有文件。也可以通过 `--output` 指定其他路径。

## 3. 直接测试 Twikit（不需要 DeepSeek Key，也不需要扩展）

搜索 X：

```sh
integrations/twikit/.venv/bin/python integrations/twikit/bridge.py \
  --cookies "$HOME/.config/superx/x.cookies.json" search "DeepSeek" --count 5
```

读取原帖：

```sh
integrations/twikit/.venv/bin/python integrations/twikit/bridge.py \
  --cookies "$HOME/.config/superx/x.cookies.json" read 'https://x.com/用户名/status/帖子ID'
```

替换为真实帖子链接。终端输出帖子正文和来源链接。长帖子优先使用 Twikit 的 `full_text`；不会自动展开所有父帖、引用帖或检查媒体，模型需要时可继续调用读取工具。

## 4. 启动服务并用 DeepSeek 核查

第一个终端运行并保持打开：

```sh
integrations/twikit/.venv/bin/python integrations/twikit/bridge.py \
  --cookies "$HOME/.config/superx/x.cookies.json" serve
```

服务仅监听 `127.0.0.1:2420`，提供只读的 `/read`、`/search`，不支持发帖。终端客户端可以访问；浏览器来源默认禁止。按 Ctrl+C 停止。

第二个终端配置 Key，然后核查。下面以 zsh 的隐藏输入为例：

```sh
read -s 'DEEPSEEK_API_KEY?DeepSeek API Key: '
export DEEPSEEK_API_KEY
node tools/fact-check.mjs --url 'https://x.com/用户名/status/帖子ID'
unset DEEPSEEK_API_KEY
```

也可以将 Key 存在权限受限的本机文本文件，用 `--key-file /本机路径` 读取，避免把 Key 写入命令行历史。

只核查一段文字、只使用 DeepSeek 网页搜索时，不需要 Cookie 或 Twikit 服务：

```sh
node tools/fact-check.mjs --text '要核查的说法' --no-x --key-file /本机/DeepSeekKey文件
```

默认模型 `deepseek-flash`，可通过 `--model deepseek-v4-pro` 切换。默认不思考，可用 `--effort none|low|medium|high|max` 选择推理等级，其中 Medium 按官方规则映射为 High。`--no-web` 关闭网页搜索，`--no-x` 关闭 X 工具，`--port` 更改本机端口。核查最多 3 轮工具规划、8 次工具调用，再流式生成最终回答。Token 汇总不包含搜索费用。

## 浏览器扩展

扩展中的 X 内容固定来自浏览器内 twitter-scraper。无需配置 Twikit Cookie、端口或启动本机服务，见 [浏览器接入说明](../twitter-scraper/README.zh-CN.md)。上面的 Twikit 工具仅供终端独立读取、搜索和核查使用。

## 验证范围与限制

本机已验证依赖安装、命令行入口、模拟的 DeepSeek 工具调用及流式回答、Twikit HTTP 路由和浏览器来源限制。真实搜索和核查需要有效 Cookie、DeepSeek Key、账号权限及网络；没有凭据的模拟测试不代表真实 X 接口可用。

Twikit 使用非官方接口，可能受限流、登录过期和 X 接口变更影响。Cookie 失效时需要本机更新，不会自动读取浏览器配置或尝试登录。检索失败会作为工具错误告知模型，并将回答标为未完成，不能当成核查成功。

```sh
node --test tests/deepseek-provider.test.js
integrations/twikit/.venv/bin/python -m unittest discover -s integrations/twikit -p 'test_*.py'
```

参考：[DeepSeek Search 文档](https://api-docs.deepseek.com/guides/search/)、[DeepSeek Chat API](https://api-docs.deepseek.com/api/create-chat-completion/)、[Twikit](https://github.com/d60/twikit)。
