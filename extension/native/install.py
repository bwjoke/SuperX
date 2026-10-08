#!/usr/bin/env python3
"""Register only this unpacked extension's native bridge on macOS."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys
import tempfile

HOST = 'com.superx.grok_cli'
BROWSERS = ('Google/Chrome', 'Citro Labs/ego lite')
HERE = Path(__file__).resolve().parent


def find_grok():
    candidates = [shutil.which('grok'), Path.home()/'.local/bin/grok', Path.home()/'.grok/bin/grok',
                  Path('/opt/homebrew/bin/grok'), Path('/usr/local/bin/grok')]
    return next((str(Path(p).resolve()) for p in candidates if p and Path(p).is_file() and os.access(p, os.X_OK)), None)


def discover_ids(extension_dir, support):
    """Read only extension registrations; never copy browser profile contents."""
    found = set()
    for browser in BROWSERS:
        base = support/browser
        profiles = [base/'Default', *base.glob('Profile *')]
        for profile in profiles:
            for name in ('Preferences', 'Secure Preferences'):
                try:
                    settings = json.loads((profile/name).read_text()).get('extensions', {}).get('settings', {})
                except (OSError, ValueError):
                    continue
                for extension_id, record in settings.items():
                    path = record.get('path') if isinstance(record, dict) else None
                    if path and Path(path).is_absolute() and Path(path).resolve() == extension_dir.resolve() and re.fullmatch(r'[a-p]{32}', extension_id):
                        found.add(extension_id)
    return sorted(found)


def install(extension_ids, runtime=None):
    if isinstance(extension_ids, str):
        extension_ids = [extension_ids]
    if not extension_ids or any(not re.fullmatch(r'[a-p]{32}', value) for value in extension_ids):
        raise SystemExit('Invalid Chrome extension ID')
    grok = find_grok()
    if not grok:
        raise SystemExit('未找到 Grok CLI。请先按 https://github.com/xai-org/grok-build#installing-the-released-binary 安装，再运行 grok login，最后重新双击连接文件。')
    support = Path.home()/'Library/Application Support'
    targets = [support/browser/'NativeMessagingHosts'/(HOST+'.json') for browser in BROWSERS if (support/browser).exists()]
    if not targets:
        raise SystemExit('请先启动 Google Chrome 或 Ego Lite，并加载已解压的 SuperX 扩展。')
    host, launcher = HERE/'host.py', HERE/'launch-host'
    # Validate every destination before writing config or changing any registration.
    for target in targets:
        if target.exists() and json.loads(target.read_text()).get('path') not in (str(host), str(launcher)):
            raise SystemExit('已有其他目录的 SuperX 连接，请使用原安装目录，未覆盖：' + str(target))
    config_path = HERE/'config.json'
    config = json.loads(config_path.read_text()) if config_path.exists() else {}
    origins = sorted(set(config.get('origins', []) + ['chrome-extension://'+value+'/' for value in extension_ids]))
    runtime = Path(runtime or config.get('runtime') or Path(tempfile.gettempdir())/'superx-grok-cli').expanduser().resolve()
    runtime.mkdir(parents=True, exist_ok=True)
    # Bind the working interpreter; do not assume /usr/bin/python3 is installed.
    launcher.write_text('#!/bin/sh\nexec '+shlex.quote(sys.executable)+' '+shlex.quote(str(host))+' "$@"\n')
    launcher.chmod(0o700)
    config_path.write_text(json.dumps({'grok':grok, 'runtime':str(runtime), 'origins':origins}, indent=2)+'\n')
    config_path.chmod(0o600)
    manifest = {'name':HOST, 'description':'SuperX local Grok CLI bridge', 'path':str(launcher), 'type':'stdio', 'allowed_origins':origins}
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(manifest, indent=2)+'\n');target.chmod(0o600)
    print('已连接 SuperX 与 Grok CLI，无需填写 API Key。')
    if not (Path.home()/'.grok/auth.json').is_file():
        print('尚未检测到登录记录。请运行 grok login 完成登录，再回到插件。')
    else:
        print('已检测到登录记录。返回插件设置会自动检查连接；刷新 X 即可使用。')
    print('如需确认账号可用，请在插件设置点击「测试 Grok 连接」。')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--extension-id', help='Optional: auto-detected for this directory when omitted')
    parser.add_argument('--runtime', help='Temporary request directory')
    parser.add_argument('--interactive', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('当前连接助手仅适配 macOS。')
    if not find_grok():
        raise SystemExit('未找到 Grok CLI。安装指引：https://github.com/xai-org/grok-build#installing-the-released-binary\n安装后运行 grok login，再重新双击连接文件。')
    ids = [args.extension_id] if args.extension_id else discover_ids(HERE.parent, Path.home()/'Library/Application Support')
    if not ids and args.interactive:
        print('尚未识别到本目录的扩展。请先在 chrome://extensions 加载本目录。')
        value = input('已加载但未识别？可粘贴扩展 ID；直接回车退出：').strip()
        ids = [value] if value else []
    if not ids:
        raise SystemExit('未找到本目录的扩展，请加载后重试，或传入 --extension-id。')
    install(ids, args.runtime)


if __name__ == '__main__':
    main()
