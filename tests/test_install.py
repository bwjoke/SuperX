import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('installer', Path(__file__).resolve().parents[1]/'extension/native/install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get('SUPERX_TEST_TMPDIR'))
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.extension = self.root/'Extension with spaces'
        self.native = self.extension/'native'
        self.native.mkdir(parents=True)
        self.support = self.root/'Library/Application Support'
        self.browser = self.support/'Google/Chrome'
        self.browser.mkdir(parents=True)

    def test_discovery_only_accepts_this_directory_across_profiles(self):
        for profile, filename, value in [('Default','Secure Preferences','a'*32),('Profile 2','Preferences','b'*32)]:
            target=self.browser/profile/filename;target.parent.mkdir()
            target.write_text(json.dumps({'extensions':{'settings':{value:{'path':str(self.extension)},'c'*32:{'path':str(self.root/'other')}}}}))
        self.assertEqual(installer.discover_ids(self.extension,self.support),['a'*32,'b'*32])

    def test_installs_interpreter_launcher_and_reuses_existing_runtime(self):
        runtime=self.root/'runtime';runtime.mkdir()
        (self.native/'config.json').write_text(json.dumps({'runtime':str(runtime),'origins':[]}))
        with patch.object(installer,'HERE',self.native),patch.object(installer.Path,'home',return_value=self.root),patch.object(installer,'find_grok',return_value='/fixed/grok'):
            installer.install(['a'*32])
        manifest=json.loads((self.browser/'NativeMessagingHosts'/f'{installer.HOST}.json').read_text())
        self.assertEqual(manifest['allowed_origins'],['chrome-extension://'+'a'*32+'/'])
        self.assertEqual(manifest['path'],str(self.native/'launch-host'))
        self.assertTrue((self.native/'launch-host').stat().st_mode & 0o100)
        self.assertIn('"$@"',(self.native/'launch-host').read_text())
        self.assertEqual(json.loads((self.native/'config.json').read_text())['runtime'],str(runtime.resolve()))

    def test_missing_cli_and_conflicting_install_do_not_write_config(self):
        with patch.object(installer,'HERE',self.native),patch.object(installer,'find_grok',return_value=None):
            with self.assertRaisesRegex(SystemExit,'Grok CLI'):installer.install('a'*32)
        self.assertFalse((self.native/'config.json').exists())
        target=self.browser/'NativeMessagingHosts'/f'{installer.HOST}.json';target.parent.mkdir()
        target.write_text(json.dumps({'path':'/another/installation/host.py'}))
        with patch.object(installer,'HERE',self.native),patch.object(installer.Path,'home',return_value=self.root),patch.object(installer,'find_grok',return_value='/fixed/grok'):
            with self.assertRaisesRegex(SystemExit,'其他目录'):installer.install('a'*32)
        self.assertFalse((self.native/'config.json').exists())
        self.assertEqual(json.loads(target.read_text())['path'],'/another/installation/host.py')


if __name__=='__main__':unittest.main()
