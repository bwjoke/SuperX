'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, mkdir, readFile, writeFile, rm, utimes } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

const sourceRoot = resolve(__dirname, '..');
const packager = import('../tools/package-extension.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('local and browser X integrations request scoped optional access without native messaging',async()=>{
  const manifest=JSON.parse(await readFile(join(sourceRoot,'extension','manifest.json'),'utf8'));
  assert.deepEqual(manifest.optional_host_permissions,['http://127.0.0.1/*','https://api.x.com/*','https://abs.twimg.com/*']);
  assert.deepEqual(manifest.optional_permissions,['cookies']);
  assert.equal(manifest.permissions.includes('cookies'),false);
  assert.equal([...(manifest.permissions??[]),...(manifest.optional_permissions??[])].includes('nativeMessaging'),false);
  assert.equal([...(manifest.host_permissions??[]),...(manifest.optional_host_permissions??[])].includes('<all_urls>'),false);
  const {PRODUCTION_FILES}=await packager;for(const file of ['build-acp.js','build-transport.js','build-setup.js','twitter-browser.js','twitter-scraper.bundle.js','twitter-scraper-LICENSE.txt'])assert.ok(PRODUCTION_FILES.includes(file));
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'superx-package-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { PRODUCTION_FILES } = await packager;
  const license = Buffer.from('MIT License\nCopyright (c) 2026 SuperX contributors\n');
  await writeFile(join(root, 'LICENSE'), license);
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.2.3', license: 'MIT' }));
  for (const name of PRODUCTION_FILES) {
    const path = join(root, 'extension', name);
    await mkdir(dirname(path), { recursive: true });
    const bytes = name === 'LICENSE.txt' ? license : await readFile(join(sourceRoot, 'extension', name));
    await writeFile(path, bytes);
  }
  const manifest = JSON.parse(await readFile(join(root, 'extension', 'manifest.json'), 'utf8'));
  manifest.version = '1.2.3';
  await writeFile(join(root, 'extension', 'manifest.json'), JSON.stringify(manifest));
  return root;
}

// Read both ZIP directories independently from the writer. Tests assert that
// common unzip readers can find every entry and use its declared size and offset.
function entriesFromZip(bytes) {
  const endOffset = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(endOffset), 0x06054b50);
  const count = bytes.readUInt16LE(endOffset + 10);
  let offset = bytes.readUInt32LE(endOffset + 16);
  assert.equal(offset + bytes.readUInt32LE(endOffset + 12), endOffset);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const nameSize = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    const localOffset = bytes.readUInt32LE(offset + 42);
    assert.equal(bytes.readUInt32LE(localOffset), 0x04034b50);
    assert.equal(bytes.readUInt16LE(localOffset + 8), 0, 'ZIP STORE method');
    assert.equal(bytes.readUInt16LE(localOffset + 10), 0, 'fixed timestamp');
    assert.equal(bytes.readUInt16LE(localOffset + 12), 0x21, '1980-01-01 date');
    const localNameSize = bytes.readUInt16LE(localOffset + 26);
    assert.equal(bytes.subarray(localOffset + 30, localOffset + 30 + localNameSize).toString('utf8'), name);
    const size = bytes.readUInt32LE(offset + 24);
    assert.equal(bytes.readUInt32LE(localOffset + 22), size);
    assert.equal(bytes.readUInt32LE(localOffset + 14), bytes.readUInt32LE(offset + 16), 'CRC headers agree');
    const start = localOffset + 30 + localNameSize + bytes.readUInt16LE(localOffset + 28);
    entries.push({ name, data: bytes.subarray(start, start + size), crc: bytes.readUInt32LE(offset + 16) });
    offset += 46 + nameSize + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  assert.equal(offset, endOffset);
  return entries;
}

test('production ZIP has manifest at root, exact allowlist, licenses and verified per-file SHA256', async t => {
  const root = await fixture(t);
  const { packageExtension, PRODUCTION_FILES, MANIFEST_LOCALES } = await packager;
  await writeFile(join(root, '.env'), 'PRIVATE_FIXTURE_DO_NOT_SHIP');
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeFile(join(root, 'artifacts', 'old-release.txt'), 'OLD_RELEASE_DO_NOT_SHIP');
  const result = await packageExtension({ root });
  const bytes = await readFile(join(result.outputDir, result.archiveName));
  const entries = entriesFromZip(bytes);
  assert.deepEqual(entries.map(entry => entry.name), PRODUCTION_FILES);
  assert.equal(JSON.parse(entries.find(entry => entry.name === 'manifest.json').data).version, '1.2.3');
  const manifest=JSON.parse(entries.find(entry=>entry.name==='manifest.json').data);
  assert.equal(manifest.default_locale,'en');assert.equal(manifest.description,'__MSG_extensionDescription__');
  assert.deepEqual(entries.filter(entry=>entry.name.startsWith('_locales/')).map(entry=>entry.name),MANIFEST_LOCALES.map(locale=>`_locales/${locale}/messages.json`).sort());
  for(const locale of MANIFEST_LOCALES){
    const messages=JSON.parse(entries.find(entry=>entry.name===`_locales/${locale}/messages.json`).data);
    assert.deepEqual(Object.keys(messages),['extensionDescription']);assert.deepEqual(Object.keys(messages.extensionDescription),['message']);assert.ok(messages.extensionDescription.message.trim());assert.ok(messages.extensionDescription.message.length<=132);
  }
  assert.ok(entries.some(entry => entry.name === 'LICENSE.txt'));
  assert.ok(entries.some(entry => entry.name === 'marked-LICENSE.txt'));
  assert.equal(bytes.includes(Buffer.from('PRIVATE_FIXTURE_DO_NOT_SHIP')), false);
  assert.equal(bytes.includes(Buffer.from('OLD_RELEASE_DO_NOT_SHIP')), false);
  const fileManifestBytes = await readFile(join(result.outputDir, result.filesName));
  const fileManifest = JSON.parse(fileManifestBytes);
  assert.equal(fileManifest.version, '1.2.3');
  assert.deepEqual(fileManifest.files, entries.map(entry => ({ path: entry.name, bytes: entry.data.length, sha256: hash(entry.data) })));
  for (const entry of entries) {
    const original=await readFile(join(root,'extension',entry.name));
    const expected=entry.name.endsWith('.png')?original:Buffer.from(original.toString('utf8').replace(/\r\n/g,'\n'));
    assert.deepEqual(entry.data,expected);
  }
  assert.equal(await readFile(join(result.outputDir, result.sumsName), 'utf8'),
    `${hash(bytes)}  ${result.archiveName}\n${hash(fileManifestBytes)}  ${result.filesName}\n`);
});

test('archive CRC is compatible with standard ZIP and entry order is deterministic', async () => {
  const { createArchive } = await packager;
  const archive = createArchive([{ name: 'b.txt', data: Buffer.from('abc') }, { name: 'a.txt', data: Buffer.alloc(0) }]);
  const entries = entriesFromZip(archive);
  assert.deepEqual(entries.map(entry => entry.name), ['a.txt', 'b.txt']);
  assert.equal(entries[0].crc, 0);
  assert.equal(entries[1].crc, 0x352441c2, 'standard CRC32 of abc');
});

test('repeated packages ignore timestamps and text line endings while retaining identical ZIP/checksum bytes', async t => {
  const root = await fixture(t);
  const { packageExtension, PRODUCTION_FILES } = await packager;
  const first = await packageExtension({ root });
  const zip = await readFile(join(first.outputDir, first.archiveName));
  const sums = await readFile(join(first.outputDir, first.sumsName));
  await utimes(join(root, 'extension', 'content.js'), new Date('2030-01-01'), new Date('2030-01-01'));
  const second = await packageExtension({ root });
  assert.deepEqual(await readFile(join(second.outputDir, second.archiveName)), zip);
  assert.deepEqual(await readFile(join(second.outputDir, second.sumsName)), sums);
  for(const name of PRODUCTION_FILES.filter(name=>!name.endsWith('.png'))) {
    const location=join(root,'extension',name);
    const text=(await readFile(location,'utf8')).replace(/\r\n/g,'\n').replace(/\n/g,'\r\n');
    await writeFile(location,text);
  }
  await writeFile(join(root,'LICENSE'),await readFile(join(root,'extension','LICENSE.txt')));
  const windows=await packageExtension({root});
  assert.deepEqual(await readFile(join(windows.outputDir,windows.archiveName)),zip);
  assert.deepEqual(await readFile(join(windows.outputDir,windows.sumsName)),sums);
});

test('malformed manifest stops packaging before any output is created', async t => {
  const root = await fixture(t);
  const { packageExtension } = await packager;
  await writeFile(join(root, 'extension', 'manifest.json'), '{ invalid JSON');
  await assert.rejects(packageExtension({ root }), /manifest\.json: invalid JSON/);
  await assert.rejects(readFile(join(root, 'artifacts', 'SuperX-1.2.3.zip')), { code: 'ENOENT' });
});

test('store metadata covers all interface languages including both supported Portuguese regions',async()=>{
  const {MANIFEST_LOCALES}=await packager;
  const {SUPPORTED_LANGUAGES}=require('../extension/ui-i18n.js');
  const language=locale=>locale.startsWith('pt_')?'pt':locale.replace('_','-');
  assert.deepEqual([...new Set(MANIFEST_LOCALES.map(language))].sort(),[...SUPPORTED_LANGUAGES].sort());
  assert.ok(MANIFEST_LOCALES.includes('pt_BR'));assert.ok(MANIFEST_LOCALES.includes('pt_PT'));
  assert.equal(new Set(MANIFEST_LOCALES).size,MANIFEST_LOCALES.length);
});

test('manifest descriptions resolve through every reviewed locale with English as the required fallback',async t=>{
  const root=await fixture(t),{inspectPackage,MANIFEST_LOCALES}=await packager,manifestPath=join(root,'extension','manifest.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8')),inspected=await inspectPackage(root);
  assert.equal(inspected.localization.defaultLocale,'en');assert.deepEqual(Object.keys(inspected.localization.descriptions),MANIFEST_LOCALES);
  for(const locale of MANIFEST_LOCALES)assert.equal(inspected.localization.descriptions[locale],JSON.parse(await readFile(join(root,'extension','_locales',locale,'messages.json'),'utf8')).extensionDescription.message);
  for(const default_locale of [undefined,'zh_CN','en-US']){
    await writeFile(manifestPath,JSON.stringify({...manifest,default_locale}));await assert.rejects(inspectPackage(root),/expected default_locale en/);
  }
  for(const description of ['Hardcoded summary','__MSG_missingDescription__','__MSG_extensionDescription__ extra']){
    await writeFile(manifestPath,JSON.stringify({...manifest,description}));await assert.rejects(inspectPackage(root),/description must reference/);
  }
});

test('invalid locale JSON, message shape, unresolved substitutions and oversized summaries fail closed',async t=>{
  const root=await fixture(t),{inspectPackage}=await packager,localePath=join(root,'extension','_locales','zh_CN','messages.json');
  await writeFile(localePath,'{invalid JSON');await assert.rejects(inspectPackage(root),/_locales\/zh_CN\/messages\.json: invalid JSON/);
  for(const messages of [[],null,{}, {wrongKey:{message:'A short description.'}},{extensionDescription:{message:'Short.'},privateKey:{message:'Extra field.'}},{extensionDescription:[]},{extensionDescription:{message:3}},{extensionDescription:{description:'No message'}},{extensionDescription:{message:'Short.',placeholders:{account:{content:'$1'}}}}]){
    await writeFile(localePath,JSON.stringify(messages));await assert.rejects(inspectPackage(root),/expected only extensionDescription with a message string/);
  }
  for(const message of ['','   ','x'.repeat(133),'First line\nSecond line']){
    await writeFile(localePath,JSON.stringify({extensionDescription:{message}}));await assert.rejects(inspectPackage(root),/nonempty single line of at most 132/);
  }
  for(const message of ['Read $account$ on X.','__MSG_unresolved__']){
    await writeFile(localePath,JSON.stringify({extensionDescription:{message}}));await assert.rejects(inspectPackage(root),/unresolved description placeholder/);
  }
  await writeFile(localePath,JSON.stringify({extensionDescription:{message:'x'.repeat(132)}}));assert.equal((await inspectPackage(root)).localization.descriptions.zh_CN.length,132);
});

test('locale additions remain exactly allowlisted and localized text receives the same credential checks',async t=>{
  const root=await fixture(t),{inspectPackage}=await packager,extra=join(root,'extension','_locales','it','messages.json');
  await mkdir(dirname(extra),{recursive:true});await writeFile(extra,JSON.stringify({extensionDescription:{message:'Not reviewed.'}}));
  await assert.rejects(inspectPackage(root),/Unexpected extension files.*_locales\/it\/messages\.json/);await rm(extra);
  const localePath=join(root,'extension','_locales','en','messages.json'),secret=`xai-${'A'.repeat(40)}`;
  await writeFile(localePath,JSON.stringify({extensionDescription:{message:secret}}));await assert.rejects(inspectPackage(root),error=>{assert.match(error.message,/possible embedded credential/);assert.equal(error.message.includes(secret),false);return true;});
  await rm(localePath);await assert.rejects(inspectPackage(root),/Missing production files.*_locales\/en\/messages\.json/);
});

test('package/manifest mismatch and unexpected release version fail closed', async t => {
  const root = await fixture(t);
  const { inspectPackage } = await packager;
  await assert.rejects(inspectPackage(root, '1.2.4'), /Release version mismatch/);
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.2.4', license: 'MIT' }));
  await assert.rejects(inspectPackage(root), /Version mismatch/);
});

test('unknown extension files, including secret/private extras, are refused', async t => {
  const root = await fixture(t);
  const { inspectPackage } = await packager;
  await writeFile(join(root, 'extension', '.env'), 'SHOULD_NOT_SHIP');
  await assert.rejects(inspectPackage(root), /Unexpected extension files.*\.env/);
});

test('missing icon and manifest references outside allowlist are refused', async t => {
  const root = await fixture(t);
  const { inspectPackage } = await packager;
  const manifestPath = join(root, 'extension', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.action.default_popup = '../private.html';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(inspectPackage(root), /asset is not in the production allowlist/);
  manifest.action.default_popup = 'popup.html';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await rm(join(root, 'extension', 'assets', 'icon-16.png'));
  await assert.rejects(inspectPackage(root), /Missing production files.*icon-16\.png/);
});

test('embedded credentials are rejected without returning their value', async t => {
  const root = await fixture(t);
  const { inspectPackage } = await packager;
  const fakeCredential = `xai-${'A'.repeat(40)}`;
  await writeFile(join(root, 'extension', 'popup.js'), `const sample = '${fakeCredential}';`);
  await assert.rejects(inspectPackage(root), error => {
    assert.match(error.message, /possible embedded credential/);
    assert.equal(error.message.includes(fakeCredential), false);
    return true;
  });
});

test('private developer paths and remote UI assets are refused', async t => {
  const root = await fixture(t);
  const { inspectPackage } = await packager;
  const fakePath = ['F:', 'codexpc', 'private', 'settings.json'].join('/');
  await writeFile(join(root, 'extension', 'options.js'), `const p = ${JSON.stringify(fakePath)};`);
  await assert.rejects(inspectPackage(root), /private absolute path/);
  await writeFile(join(root, 'extension', 'options.js'), '// local UI');
  await writeFile(join(root, 'extension', 'options.html'), '<script src="https://example.com/remote.js"></script>');
  await assert.rejects(inspectPackage(root), /invalid local asset path/);
});

test('distribution requires unchanged project license and MIT metadata', async t => {
  const root = await fixture(t);
  const { inspectPackage } = await packager;
  await writeFile(join(root, 'extension', 'LICENSE.txt'), 'different license');
  await assert.rejects(inspectPackage(root), /distribution license must match/);
  await writeFile(join(root, 'extension', 'LICENSE.txt'), await readFile(join(root, 'LICENSE')));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.2.3', license: 'UNLICENSED' }));
  await assert.rejects(inspectPackage(root), /expected MIT code license/);
});

test('output cannot contaminate production extension files', async t => {
  const root = await fixture(t);
  const { packageExtension } = await packager;
  await assert.rejects(packageExtension({ root, outputDir: join(root, 'extension', 'build') }), /outside the extension/);
});
