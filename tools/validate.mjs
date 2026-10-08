import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectPackage } from './package-extension.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extension = resolve(root, 'extension');
const errors = [];
const assets = new Set();

function fail(message) { errors.push(message); }

try {
  const release = await inspectPackage(root);
  console.log(`✓ Release package: SuperX ${release.version}, ${release.files.length} allowlisted files`);
} catch (error) {
  fail(`Release package validation failed: ${error.message}`);
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : entry.isFile() ? [path] : [];
  }));
  return nested.flat().sort();
}

async function verifyAsset(asset, owner = 'manifest.json') {
  if (typeof asset !== 'string' || !asset.trim()) {
    fail(`${owner}: invalid asset path`);
    return;
  }
  // Paths may include query/hash suffixes in HTML; manifest assets do not use them.
  const path = resolve(extension, asset.split(/[?#]/)[0]);
  const rel = relative(extension, path);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    fail(`${owner}: asset escapes extension folder (${asset})`);
    return;
  }
  assets.add(path);
  try {
    if (!(await stat(path)).isFile()) fail(`${owner}: asset is not a file (${asset})`);
  } catch {
    fail(`${owner}: missing asset (${asset})`);
  }
}

function iconPaths(icons) {
  return typeof icons === 'string' ? [icons] : icons && typeof icons === 'object' ? Object.values(icons) : [];
}

try {
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3) fail('manifest.json: expected Manifest V3');
  if (manifest.name !== 'SuperX') fail('manifest.json: expected product name SuperX');
  const declared = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    manifest.options_ui?.page,
    ...iconPaths(manifest.icons),
    ...iconPaths(manifest.action?.default_icon),
    ...(manifest.content_scripts || []).flatMap(script => [...(script.js || []), ...(script.css || [])]),
    ...(manifest.web_accessible_resources || []).flatMap(group => group.resources || []),
    ...(manifest.declarative_net_request?.rule_resources || []).map(rule => rule.path),
  ].filter(value => value !== undefined);
  for (const asset of declared) await verifyAsset(asset);

  const extensionFiles = await filesIn(extension);
  for (const path of extensionFiles.filter(path => extname(path) === '.html')) {
    const html = await readFile(path, 'utf8');
    const owner = relative(extension, path);
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const value = match[1];
      if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) {
        fail(`${owner}: extension UI must use local scripts/styles (${value})`);
        continue;
      }
      await verifyAsset(relative(extension, resolve(dirname(path), value)), owner);
    }
  }
  for (const path of extensionFiles.filter(path => extname(path) === '.css')) {
    const css = await readFile(path, 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
      const value = match[1];
      if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) continue;
      await verifyAsset(relative(extension, resolve(dirname(path), value)), relative(extension, path));
    }
  }
  if (!errors.length) console.log(`✓ Manifest and UI assets: ${assets.size} files`);
} catch (error) {
  fail(`Manifest/asset validation failed: ${error.message}`);
}

let scripts = [];
try {
  scripts = (await Promise.all(['extension', 'tests', 'tools'].map(directory => filesIn(resolve(root, directory)))))
    .flat().filter(path => /\.(?:js|cjs|mjs)$/.test(path)).sort();
  let invalid = false;
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ['--check', script], { cwd: root, encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      invalid = true;
      fail(`Syntax failed: ${relative(root, script)}\n${result.error?.message || result.stderr || result.stdout}`);
    }
  }
  if (!invalid) console.log(`✓ JavaScript syntax: ${scripts.length} files`);
} catch (error) {
  fail(`Syntax validation failed: ${error.message}`);
}

const testFiles = scripts.filter(path => relative(root, path).startsWith(`tests${sep}`) && /\.test\.(?:js|cjs)$/.test(path));
if (!testFiles.length) {
  fail('No tests/*.test.js files found');
} else {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testFiles], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail(`Tests failed\n${result.error?.message || `${result.stdout || ''}${result.stderr || ''}`}`);
  } else {
    const count = result.stdout.match(/^# tests (\d+)$/m)?.[1] || '?';
    console.log(`✓ Tests: ${count} passed`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exitCode = 1;
} else {
  console.log('SuperX validation passed.');
}
