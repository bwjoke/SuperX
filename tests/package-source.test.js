'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { mkdtemp, mkdir, readFile, writeFile, rm, rename, symlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join, resolve, sep } = require('node:path');

const sourceRoot = resolve(__dirname, '..');
const sourcePackager = import('../tools/package-source.mjs');
const releasePackager = import('../tools/package-release.mjs');
const installationPackager = import('../tools/package-extension.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const previewImages = {
  'deepseek-browser-settings.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0, 0x64, 0x73]),
  'superx-preview-en.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0, 0x65, 0x6e]),
  'superx-preview-zh-CN.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0, 0x7a, 0x68]),
};

async function put(root, name, content) {
  const location = join(root, name);
  await mkdir(dirname(location), { recursive: true });
  await writeFile(location, content);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'superx-source-test-'));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}superx-source-test-`));
    await rm(root, { recursive: true, force: true });
  });
  const { PUBLIC_ROOT_FILES, PUBLIC_SOURCE_DIRECTORIES } = await sourcePackager;
  const { PRODUCTION_FILES } = await installationPackager;
  const license = Buffer.from('MIT License\nCopyright (c) 2026 SuperX contributors\n');
  for (const name of PUBLIC_ROOT_FILES) await put(root, name, '# Public project\r\n');
  for (const directory of PUBLIC_SOURCE_DIRECTORIES) await mkdir(join(root, directory), { recursive: true });
  await put(root, 'LICENSE', license);
  await put(root, 'package.json', JSON.stringify({ version: '1.2.3', license: 'MIT' }));
  for(const name of ['host.cjs','install-macos.command','config.json','auth.json','runtime/private.cjs','private-review.md'])await put(root,`connector/${name}`,'PRIVATE_CONNECTOR_DO_NOT_EXPORT');
  for (const name of PRODUCTION_FILES) {
    await put(root, `extension/${name}`, name === 'LICENSE.txt' ? license : await readFile(join(sourceRoot, 'extension', name)));
  }
  const manifest = JSON.parse(await readFile(join(root, 'extension', 'manifest.json'), 'utf8'));
  manifest.version = '1.2.3';
  await put(root, 'extension/manifest.json', JSON.stringify(manifest));
  await put(root, 'README.md', '![Preview](docs/assets/superx-preview-en.png)\r\n');
  await put(root, 'README.zh-CN.md', '![预览](docs/assets/superx-preview-zh-CN.png)\r\n');
  for (const [name, data] of Object.entries(previewImages)) await put(root, `docs/assets/${name}`, data);
  await put(root, 'docs/assets/superx-preview.jpg', 'OLD_JPEG_DO_NOT_EXPORT');
  await put(root, 'docs/assets/superx-preview.png', 'OLD_PREVIEW_DO_NOT_EXPORT');
  await put(root, 'docs/assets/private.jpg', 'PRIVATE_IMAGE_DO_NOT_EXPORT');
  await put(root, 'docs/RELEASE_CHANNELS.md', '# Public release channels\r\n');
  await put(root, 'docs/SuperX-private-review.md', 'PRIVATE_REVIEW_DO_NOT_EXPORT');
  await put(root, '.github/workflows/ci.yml', 'name: Public CI\r\n');
  await put(root, 'demo/index.html', '<html>Public preview</html>\r\n');
  await put(root, 'tools/package-release.mjs', '// Public release helper\r\n');
  await put(root, 'tests/example.test.js', '// Public fixture\r\n');
  await put(root, 'tests/build-ws-fixture.js', '// Shared synthetic WebSocket fixture\r\n');
  await put(root, 'tests/private-helper.js', '// PRIVATE_TEST_HELPER_DO_NOT_EXPORT');
  await put(root, 'chrome-web-store/site/index.html', '<html>PRIVATE_STORE_DO_NOT_EXPORT</html>\r\n');
  await put(root, 'chrome-web-store/site/.nojekyll', '');
  await put(root, 'chrome-web-store/assets/screenshot.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x0d, 0x0a]));
  await put(root, 'website/public/index.html', 'PRIVATE_WEBSITE_DO_NOT_EXPORT');
  await put(root, 'tools/check-privacy-site.mjs', '// PRIVATE_WEBSITE_TOOL_DO_NOT_EXPORT');
  await put(root, 'tools/render-store-assets.mjs', '// PRIVATE_STORE_TOOL_DO_NOT_EXPORT');
  for (const name of ['.env', '.git/private.md', '.codex/private.md', 'artifacts/private.md', 'output/private.md', 'tmp/private.md', 'tools/private.py']) {
    await put(root, name, 'PRIVATE_WORKSPACE_DATA_DO_NOT_EXPORT');
  }
  return root;
}

// Read each stored entry via the ZIP central directory, independently of the
// packaging implementation; no model of the allowlist determines archive data.
function entriesFromZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  assert.equal(offset + bytes.readUInt32LE(end + 12), end);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const nameSize = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    const local = bytes.readUInt32LE(offset + 42);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 8), 0, 'ZIP STORE');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    entries.push({ name, data: bytes.subarray(start, start + bytes.readUInt32LE(offset + 24)) });
    offset += 46 + nameSize + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  assert.equal(offset, end);
  return entries;
}

test('public source keeps both README PNGs unchanged and excludes private output and obsolete previews', async t => {
  const root = await fixture(t);
  const { packageSource } = await sourcePackager;
  const result = await packageSource({ root, expectedVersion: '1.2.3' });
  const archive = await readFile(join(result.outputDir, result.archiveName));
  const entries = entriesFromZip(archive);
  const names = entries.map(entry => entry.name);
  for (const [name, data] of Object.entries(previewImages)) {
    assert.deepEqual(entries.find(entry => entry.name === `SuperX-1.2.3/docs/assets/${name}`).data, data);
  }
  assert.ok(names.includes('SuperX-1.2.3/docs/RELEASE_CHANNELS.md'));
  assert.ok(names.includes('SuperX-1.2.3/tools/package-release.mjs'));
  assert.ok(names.includes('SuperX-1.2.3/tests/build-ws-fixture.js'));
  const {MANIFEST_LOCALES}=await installationPackager;
  assert.deepEqual(names.filter(name=>name.includes('/extension/_locales/')),MANIFEST_LOCALES.map(locale=>`SuperX-1.2.3/extension/_locales/${locale}/messages.json`).sort());
  for(const locale of MANIFEST_LOCALES)assert.equal(entries.find(entry=>entry.name===`SuperX-1.2.3/extension/_locales/${locale}/messages.json`).data.toString('utf8'),(await readFile(join(root,'extension','_locales',locale,'messages.json'),'utf8')).replace(/\r\n/g,'\n'));
  assert.equal(names.includes('SuperX-1.2.3/tests/private-helper.js'),false);
  assert.equal(names.some(name=>name.startsWith('SuperX-1.2.3/connector/')),false);
  assert.equal(archive.includes(Buffer.from('PRIVATE_CONNECTOR_DO_NOT_EXPORT')),false);
  assert.equal(names.some(name => /\/(?:website|chrome-web-store)\//.test(name)),false);
  assert.equal(names.some(name => /docs\/SuperX-private-review|tools\/(?:check-privacy-site|render-store-assets)\.mjs/.test(name)),false);
  assert.equal(names.some(name => /(?:\.git\/|\.codex\/|artifacts\/|output\/|tmp\/|private\.py|superx-preview\.(?:png|jpg)|private\.jpg)/.test(name)), false);
  assert.equal(archive.includes(Buffer.from('PRIVATE_WORKSPACE_DATA_DO_NOT_EXPORT')), false);
  assert.equal(archive.includes(Buffer.from('OLD_PREVIEW_DO_NOT_EXPORT')), false);
  assert.equal(archive.includes(Buffer.from('OLD_JPEG_DO_NOT_EXPORT')), false);
  assert.equal(archive.includes(Buffer.from('PRIVATE_IMAGE_DO_NOT_EXPORT')), false);
  for (const marker of ['PRIVATE_WEBSITE_DO_NOT_EXPORT','PRIVATE_STORE_DO_NOT_EXPORT','PRIVATE_REVIEW_DO_NOT_EXPORT','PRIVATE_WEBSITE_TOOL_DO_NOT_EXPORT','PRIVATE_STORE_TOOL_DO_NOT_EXPORT']) {
    assert.equal(archive.includes(Buffer.from(marker)),false);
  }
  assert.equal(entries.find(entry => entry.name.endsWith('/README.md')).data.toString(), '![Preview](docs/assets/superx-preview-en.png)\n');
  assert.equal(entries.find(entry => entry.name.endsWith('/README.zh-CN.md')).data.toString(), '![预览](docs/assets/superx-preview-zh-CN.png)\n');
  const inventoryBytes = await readFile(join(result.outputDir, result.filesName));
  assert.deepEqual(JSON.parse(inventoryBytes).files,
    entries.map(entry => ({ path: entry.name, bytes: entry.data.length, sha256: hash(entry.data) })));
  assert.equal(await readFile(join(result.outputDir, result.sumsName), 'utf8'),
    `${hash(archive)}  ${result.archiveName}\n${hash(inventoryBytes)}  ${result.filesName}\n`);
});

test('public source bytes stay identical when only text line endings change', async t => {
  const root = await fixture(t);
  const { packageSource } = await sourcePackager;
  const first = await packageSource({ root });
  const bytes = await readFile(join(first.outputDir, first.archiveName));
  await put(root, 'README.md', '![Preview](docs/assets/superx-preview-en.png)\n');
  await put(root, 'README.zh-CN.md', '![预览](docs/assets/superx-preview-zh-CN.png)\n');
  const second = await packageSource({ root });
  assert.deepEqual(await readFile(join(second.outputDir, second.archiveName)), bytes);
});

test('public source refuses missing README images, embedded credentials and mismatched versions before writing output', async t => {
  const root = await fixture(t);
  const { packageSource } = await sourcePackager;
  await assert.rejects(packageSource({ root, expectedVersion: '1.2.4' }), /Release version mismatch/);
  for (const [name, data] of Object.entries(previewImages)) {
    await rm(join(root, 'docs/assets', name));
    await assert.rejects(packageSource({ root }), error => {
      assert.equal(error.message, `Missing public README image: docs/assets/${name}`);
      return true;
    });
    await put(root, `docs/assets/${name}`, data);
  }
  const fakeCredential = `xai-${'A'.repeat(40)}`;
  await put(root, 'README.md', fakeCredential);
  await assert.rejects(packageSource({ root }), error => {
    assert.match(error.message, /Potential credential/);
    assert.equal(error.message.includes(fakeCredential), false);
    return true;
  });
  await assert.rejects(readFile(join(root, 'artifacts', 'SuperX-1.2.3-source.zip')), { code: 'ENOENT' });
});

test('public source does not traverse a symlinked public root', async t => {
  const root = await fixture(t);
  const { packageSource } = await sourcePackager;
  await rename(join(root, 'docs'), join(root, 'docs-original'));
  try {
    await symlink(join(root, 'docs-original'), join(root, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'ENOTSUP') return t.skip('Symlink creation is unavailable on this host');
    throw error;
  }
  await assert.rejects(packageSource({ root }), /Refuse symbolic link.*docs/);
});

test('release candidate includes a fixed ZIP alias with identical bytes and a verifiable checksum', async t => {
  const root = await fixture(t);
  const { packageRelease } = await releasePackager;
  const outputDir = join(root, 'artifacts', 'candidate');
  const release = await packageRelease({ root, outputDir, expectedVersion: '1.2.3' });
  const installation = await readFile(join(outputDir, release.installation.archiveName));
  const alias = await readFile(join(outputDir, release.aliasName));
  assert.deepEqual(alias, installation);
  assert.equal(hash(alias), release.installation.sha256);
  const sums = await readFile(join(outputDir, release.installation.sumsName), 'utf8');
  assert.ok(sums.includes(`${hash(alias)}  SuperX.zip\n`));
  assert.ok(sums.includes(`${hash(installation)}  SuperX-1.2.3.zip\n`));
  const source = await readFile(join(outputDir, release.source.archiveName));
  assert.equal(hash(source), release.source.sha256);
  const before = sums;
  await packageRelease({ root, outputDir });
  assert.equal(await readFile(join(outputDir, release.installation.sumsName), 'utf8'), before, 'reruns do not duplicate alias checksum lines');
});

test('release packaging refuses output within public source directories', async t => {
  const root = await fixture(t);
  const { packageRelease } = await releasePackager;
  await assert.rejects(packageRelease({ root, outputDir: join(root, 'docs', 'build') }), /outside public source directories/);
  await assert.rejects(readFile(join(root, 'docs', 'build', 'SuperX-1.2.3.zip')), { code: 'ENOENT' });
});

test('release packaging fails its source preflight without leaving installation candidates', async t => {
  const root = await fixture(t);
  const { packageRelease } = await releasePackager;
  const outputDir = join(root, 'artifacts', 'candidate');
  await put(root, 'README.md', `xai-${'A'.repeat(40)}`);
  await assert.rejects(packageRelease({ root, outputDir }), /Potential credential/);
  await put(root, 'README.md', '![Preview](docs/assets/superx-preview-en.png)\n');
  await rm(join(root, 'docs/assets/superx-preview-zh-CN.png'));
  await assert.rejects(packageRelease({ root, outputDir }), /Missing public README image/);
  for (const name of ['SuperX-1.2.3.zip', 'SuperX.zip', 'SuperX-1.2.3-source.zip']) {
    await assert.rejects(readFile(join(outputDir, name)), { code: 'ENOENT' });
  }
});

test('release workflow notes use the actual repository and explain installation, updates and support', async t => {
  const root = await fixture(t);
  const workflow = await readFile(join(sourceRoot, '.github/workflows/release.yml'), 'utf8');
  const nodeBlock = workflow.match(/node --input-type=module <<'NODE'\r?\n([\s\S]*?)^ {10}NODE\r?$/m);
  assert.ok(nodeBlock, 'release workflow contains an executable notes generator');
  const directory = join(root, 'tmp', 'release-notes');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'superx-generated-notes.md'), '* Fix a reported rendering issue.\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', nodeBlock[1].replace(/^ {10}/gm, '')], {
    encoding: 'utf8',
    env: { ...process.env, GH_REPO: 'example-owner/example-superx', RELEASE_TAG: 'v1.2.3', RUNNER_TEMP: directory },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const notes = await readFile(join(directory, 'superx-release-notes.md'), 'utf8');
  assert.ok(notes.includes('https://github.com/example-owner/example-superx/releases/download/v1.2.3/SuperX.zip'));
  assert.ok(notes.includes('https://github.com/example-owner/example-superx/issues/new/choose'));
  assert.ok(notes.includes('/blob/v1.2.3/README.zh-CN.md'));
  assert.ok(notes.includes('Preview installations update manually'));
  assert.ok(notes.includes('does not automatically migrate'));
  assert.ok(notes.includes('same installation ZIP and SHA256'));
  assert.ok(notes.includes('Fix a reported rendering issue.'));
});
