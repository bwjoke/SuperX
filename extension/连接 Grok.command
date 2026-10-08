#!/bin/bash
# Run beside the extension files. No downloads, privilege changes or auto-login.
cd -- "$(dirname -- "$0")" || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin"
printf '%s\n' 'SuperX · 连接本机 Grok' '请先在浏览器加载这个文件夹中的扩展。'
if command -v python3 >/dev/null 2>&1; then
  python3 native/install.py --interactive
  setup_result=$?
else
  printf '%s\n' '未找到 Python 3。请从 https://www.python.org/downloads/macos/ 安装后重试。'
  setup_result=1
fi
if [ "$setup_result" -ne 0 ]; then
  printf '%s\n' '连接尚未完成，请按上方提示处理。'
fi
read -r -p '按回车关闭此窗口…' ignored_reply
exit "$setup_result"
