import importlib.util
import json
import os
from pathlib import Path
import signal
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

HOST = Path(__file__).resolve().parents[1] / 'extension/native/host.py'
spec = importlib.util.spec_from_file_location('host', HOST)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class BridgeTests(unittest.TestCase):
    def test_command_has_no_shell_or_mcp(self):
        args = host.command({'grok':'/fixed/grok'}, Path('/tmp/input'), '', True)
        self.assertIn('MCPTool', args)
        self.assertIn('dontAsk', args)
        self.assertEqual(args[args.index('--tools')+1], 'web_search,web_fetch')
        self.assertNotIn('--always-approve', args)

    def fixture(self, script):
        folder = tempfile.TemporaryDirectory(dir=os.environ.get('SUPERX_TEST_TMPDIR'))
        self.addCleanup(folder.cleanup)
        root = Path(folder.name)
        (root/'host.py').write_bytes(HOST.read_bytes())
        fake = root/'fake-grok'
        fake.write_text('#!'+sys.executable+'\n'+script)
        fake.chmod(0o700)
        origin = 'chrome-extension://'+'a'*32+'/'
        (root/'config.json').write_text(json.dumps({'grok':str(fake),'runtime':str(root),'origins':[origin]}))
        proc = subprocess.Popen([sys.executable,str(root/'host.py'),origin],stdin=subprocess.PIPE,stdout=subprocess.PIPE,bufsize=0)
        self.addCleanup(lambda: self.close(proc))
        return root,proc

    @staticmethod
    def close(proc):
        if not proc.stdin.closed:
            proc.stdin.close()
        try:
            proc.wait(timeout=6)
        except subprocess.TimeoutExpired:
            proc.kill();proc.wait()
        proc.stdout.close()

    @staticmethod
    def send(proc, value):
        data=json.dumps(value).encode()
        proc.stdin.write(struct.pack('<I',len(data))+data);proc.stdin.flush()

    @staticmethod
    def read(proc):
        import select
        if not select.select([proc.stdout],[],[],8)[0]:
            raise AssertionError('native frame timed out')
        length=struct.unpack('<I',proc.stdout.read(4))[0]
        return json.loads(proc.stdout.read(length))

    def test_first_chunk_is_emitted_when_monotonic_clock_starts_near_zero(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('SUPERX_TEST_TMPDIR')) as directory:
            root = Path(directory)
            fake = root/'fake-grok'
            fake.write_text('#!'+sys.executable+'\nimport json\nprint(json.dumps({"type":"text","data":"first"}),flush=True)\nprint(json.dumps({"type":"end","stopReason":"end_turn"}),flush=True)\n')
            fake.chmod(0o700)
            messages = []
            with patch.object(host.time, 'monotonic', return_value=0.01), patch.object(host, 'emit', side_effect=messages.append):
                host.run({'type':'run','prompt':'test'}, {'grok':str(fake),'runtime':str(root)})
            self.assertEqual([message['type'] for message in messages], ['update','result'])
            self.assertEqual(messages[0]['text'], 'first')

    def test_streamed_result_and_search_receipt(self):
        _,proc=self.fixture('''import json
for event in [
 {'type':'text','data':'I will search first'},
 {'type':'tool_call','toolCallId':'s','toolName':'web_search','status':'in_progress'},
 {'type':'tool_call_update','toolCallId':'s','status':'completed'},
 {'type':'text','data':'答案'},
 {'type':'end','stopReason':'end_turn','usage':{'input_tokens':2,'cache_read_input_tokens':3,'output_tokens':1,'total_tokens':6}}]:
 print(json.dumps(event),flush=True)
''')
        self.send(proc,{'type':'run','prompt':'test','webSearch':True})
        answer=self.read(proc)
        while answer['type']=='update':answer=self.read(proc)
        self.assertEqual(answer['text'],'答案')
        self.assertTrue(answer['searched'])
        self.assertEqual(answer['usage']['input_tokens'],5)

    def test_incomplete_output_is_not_success(self):
        _,proc=self.fixture('print(\'{"type":"text","data":"partial"}\',flush=True)\n')
        self.send(proc,{'type':'run','prompt':'test'})
        result=self.read(proc)
        while result['type']=='update':result=self.read(proc)
        self.assertEqual(result['code'],'CLI_INCOMPLETE')

    def test_disconnect_stops_process_and_cleans_temp_files(self):
        root,proc=self.fixture('''import os,time,json
print(json.dumps({'type':'text','data':str(os.getpid())}),flush=True)
time.sleep(30)
''')
        self.send(proc,{'type':'run','prompt':'test'})
        pid=int(self.read(proc)['text'])
        self.close(proc)
        with self.assertRaises(ProcessLookupError):os.kill(pid,0)
        self.assertEqual(list(root.glob('request-*')),[])

    def test_sigterm_stops_child(self):
        _,proc=self.fixture('import os,time,json\nprint(json.dumps({"type":"text","data":str(os.getpid())}),flush=True)\ntime.sleep(30)\n')
        self.send(proc,{'type':'run','prompt':'test'})
        pid=int(self.read(proc)['text'])
        proc.terminate();proc.wait(timeout=6)
        with self.assertRaises(ProcessLookupError):os.kill(pid,0)

    def test_invalid_model_cannot_become_an_argument(self):
        _,proc=self.fixture('raise RuntimeError("must not run")\n')
        self.send(proc,{'type':'run','prompt':'test','model':'--always-approve'})
        self.assertEqual(self.read(proc)['code'],'CLI_INPUT')


if __name__=='__main__':unittest.main()
