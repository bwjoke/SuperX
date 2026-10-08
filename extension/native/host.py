#!/usr/bin/python3
"""SuperX Native Messaging host. No shell execution and no credentials over IPC."""
import fcntl
import json
import os
from pathlib import Path
import re
import selectors
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time

HERE = Path(__file__).resolve().parent
MAX_MESSAGE = 512 * 1024
MAX_OUTPUT = 2 * 1024 * 1024
WRITE_LOCK = threading.Lock()
STOP = threading.Event()


def emit(value):
    data = json.dumps(value, ensure_ascii=False).encode('utf-8')
    try:
        with WRITE_LOCK:
            sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
            sys.stdout.buffer.flush()
    except (BrokenPipeError, OSError):
        STOP.set()


def read_exact(count):
    data = bytearray()
    while len(data) < count:
        part = sys.stdin.buffer.read(count - len(data))
        if not part:
            raise EOFError
        data.extend(part)
    return bytes(data)


def classify_error(text):
    if re.search(r'429|rate.?limit|quota|exhausted|usage limit', text, re.I):
        return 'RATE_LIMIT'
    if re.search(r'401|unauth|sign.?in|log.?in|authenticat|token.*expir', text, re.I):
        return 'CLI_AUTH'
    return 'CLI_ERROR'


def command(config, prompt_file, model, search):
    args = [config['grok'], '--prompt-file', str(prompt_file), '--output-format', 'streaming-json',
            '--no-subagents', '--no-plan', '--verbatim', '--permission-mode', 'dontAsk',
            '--tools', 'web_search,web_fetch' if search else '',
            '--deny', 'MCPTool', '--deny', 'Bash', '--deny', 'Read', '--deny', 'Write', '--deny', 'Edit',
            '--max-turns', '6' if search else '1',
            '--system-prompt-override', 'You explain X posts for a reader. Follow the application rules in the prompt. Never use local files, shell, MCP or subagents.']
    if search:
        args += ['--allow', 'WebFetch']
    else:
        args += ['--disable-web-search', '--reasoning-effort', 'low']
    if model:
        args += ['--model', model]
    return args


def run(message, config):
    proc = None
    stage = 'input'
    try:
        probe = message.get('type') == 'test'
        prompt = 'Reply with exactly SUPERX_GROK_OK. Do not use tools.' if probe else message.get('prompt')
        model = '' if probe else message.get('model', '')
        if not isinstance(prompt, str) or not 1 <= len(prompt) <= 100000:
            raise ValueError('CLI_INPUT')
        if not isinstance(model, str) or model and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}', model):
            raise ValueError('CLI_INPUT')
        search = not probe and message.get('webSearch') is True
        stage = 'runtime'
        runtime = Path(config['runtime'])
        try:
            runtime.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryFile(dir=runtime):
                pass
        except PermissionError:
            # macOS may deny browser-launched hosts access to removable disks.
            # Use bounded, self-cleaning OS temp files without changing TCC.
            runtime = Path(tempfile.gettempdir()) / 'superx-grok-cli'
            runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
        with (runtime / 'request.lock').open('a') as lock:
            lock_start = time.monotonic()
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if STOP.wait(0.05):
                        return
                    if time.monotonic() - lock_start > 3:
                        raise ValueError('CLI_BUSY')
            with tempfile.TemporaryDirectory(prefix='request-', dir=runtime) as work:
                prompt_file = Path(work) / 'prompt.txt'
                prompt_file.write_text(prompt, encoding='utf-8')
                prompt_file.chmod(0o600)
                env = os.environ.copy()
                env.pop('XAI_API_KEY', None)
                env.pop('GROK_API_KEY', None)
                env['TMPDIR'] = work
                # Scope these switches to the plugin child; keep the user's
                # CLI settings, login and skills untouched.
                env['GROK_MEMORY'] = '0'
                for vendor in ('CLAUDE', 'CURSOR'):
                    for surface in ('SKILLS', 'MCPS', 'AGENTS', 'RULES', 'HOOKS', 'SESSIONS'):
                        env[f'GROK_{vendor}_{surface}_ENABLED'] = 'false'
                env['GROK_MANAGED_MCPS_ENABLED'] = 'false'
                env['GROK_MANAGED_MCP_GATEWAY_TOOLS_ENABLED'] = 'false'
                # CLI native session storage stays under its own home. Task
                # files and captured stderr are temporary on the external disk.
                with tempfile.TemporaryFile(dir=work) as err:
                    stage = 'spawn'
                    proc = subprocess.Popen(command(config, prompt_file, model, search), cwd=work, env=env,
                                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=err,
                                            start_new_session=True)
                    stage = 'stream'
                    sel = selectors.DefaultSelector()
                    sel.register(proc.stdout, selectors.EVENT_READ)
                    start = time.monotonic()
                    pending = b''
                    total = 0
                    text = ''
                    final = None
                    tools = {}
                    searched = False
                    last_update = None
                    reset_text = False
                    try:
                        while True:
                            if STOP.is_set():
                                return
                            if time.monotonic() - start > (50 if probe else 165):
                                raise ValueError('TIMEOUT')
                            if not sel.select(0.2):
                                continue
                            data = os.read(proc.stdout.fileno(), 65536)
                            if not data:
                                break
                            pending += data
                            total += len(data)
                            if total > MAX_OUTPUT:
                                raise ValueError('CLI_OUTPUT')
                            while b'\n' in pending:
                                line, pending = pending.split(b'\n', 1)
                                if not line.strip():
                                    continue
                                try:
                                    event = json.loads(line)
                                except (ValueError, UnicodeDecodeError):
                                    raise ValueError('CLI_OUTPUT')
                                kind = event.get('type')
                                if kind == 'text':
                                    if reset_text:
                                        text = ''
                                        reset_text = False
                                    text += event.get('data', '')
                                    if len(text) > 30000:
                                        raise ValueError('CLI_OUTPUT')
                                    if last_update is None or time.monotonic() - last_update > 0.15:
                                        emit({'type':'update', 'text':text})
                                        last_update = time.monotonic()
                                elif kind == 'tool_call':
                                    reset_text = True
                                    tools[event.get('toolCallId')] = event.get('toolName')
                                    if event.get('status') == 'completed' and event.get('toolName') in ('web_search', 'web_fetch'):
                                        searched = True
                                elif kind == 'tool_call_update' and event.get('status') == 'completed':
                                    searched |= tools.get(event.get('toolCallId')) in ('web_search', 'web_fetch')
                                elif kind == 'error':
                                    raise ValueError(classify_error(str(event)))
                                elif kind == 'end':
                                    final = event
                    finally:
                        sel.close()
                    proc.wait(timeout=5)
                    if proc.returncode:
                        err.seek(0)
                        raise ValueError(classify_error(err.read(16000).decode('utf-8', 'replace')))
                    if not final or final.get('stopReason') != 'end_turn' or not text.strip():
                        raise ValueError('CLI_INCOMPLETE')
                    if probe and text.strip() != 'SUPERX_GROK_OK':
                        raise ValueError('CLI_OUTPUT')
                    models = list((final.get('modelUsage') or {}).keys())
                    raw = final.get('usage') or {}
                    usage = {k:v for k,v in raw.items() if k in ('input_tokens','output_tokens','total_tokens') and isinstance(v,int) and v >= 0}
                    # Headless input_tokens excludes cached inputs; normalize to
                    # the extension's inclusive input-token convention.
                    if 'input_tokens' in usage:
                        usage['input_tokens'] += sum(raw.get(k,0) for k in ('cache_read_input_tokens','cache_creation_input_tokens') if isinstance(raw.get(k,0),int))
                    emit({'type':'result', 'text':text, 'searched':searched, 'model':models[0] if models else model,
                          'usage':usage, 'usageComplete':not final.get('usage_is_incomplete', False) and bool(usage)})
    except ValueError as error:
        emit({'type':'error', 'code':str(error) if str(error).startswith(('CLI_', 'RATE_', 'TIMEOUT')) else 'CLI_ERROR'})
    except (OSError, subprocess.SubprocessError) as error:
        emit({'type':'error', 'code':'CLI_ERROR', 'diagnostics':{'stage':stage, 'exception':type(error).__name__, 'errno':getattr(error,'errno',None)}})
    finally:
        if proc and proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
                proc.wait(timeout=2)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        if proc and proc.stdout:
            proc.stdout.close()


def main():
    config = json.loads((HERE / 'config.json').read_text())
    if len(sys.argv) < 2 or sys.argv[1] not in config['origins']:
        return
    worker = None
    def terminate(signum, frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)
    try:
        while not STOP.is_set():
            size = struct.unpack('<I', read_exact(4))[0]
            if size > MAX_MESSAGE:
                break
            message = json.loads(read_exact(size))
            if not isinstance(message, dict):
                break
            if message.get('type') == 'check':
                installed = os.access(config['grok'], os.X_OK)
                auth = (Path.home() / '.grok/auth.json').is_file()
                emit({'type':'result', 'installed':installed, 'hasLogin':auth})
            elif message.get('type') in ('run','test'):
                if worker and worker.is_alive():
                    emit({'type':'error','code':'CLI_BUSY'})
                else:
                    worker = threading.Thread(target=run, args=(message,config))
                    worker.start()
            else:
                emit({'type':'error','code':'CLI_INPUT'})
    except (EOFError, ValueError, OSError):
        pass
    finally:
        STOP.set()
        if worker:
            worker.join(timeout=5)


if __name__ == '__main__':
    main()
