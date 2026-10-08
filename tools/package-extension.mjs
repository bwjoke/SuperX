import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_FILES = Object.freeze([
  'api-provider.js', 'cli-provider.js', 'native/host.py', 'native/install.py',
  '连接 Grok.command', 'README.md', 'NOTICE.md',
  'assets/icon-128.png', 'assets/icon-16.png', 'assets/icon-32.png', 'assets/icon-48.png',
  'assets/superx-logo.svg', 'assets/superx-symbol.svg',
  'background.js', 'content.js', 'feed-core.js', 'history-store.js', 'history.css', 'history.html', 'history.js', 'key-store.js', 'LICENSE.txt', 'manifest.json',
  'markdown-renderer.js', 'marked-LICENSE.txt', 'marked.umd.js',
  'options.css', 'options.html', 'options.js', 'overlay-layout.js',
  'popup.css', 'popup.html', 'popup.js', 'privacy.html', 'ui-i18n.js',
].sort());

const productionSet = new Set(PRODUCTION_FILES);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = data => createHash('sha256').update(data).digest('hex');

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Extension contains a symbolic link: ${name}`);
    if (entry.isDirectory()) files.push(...await inventory(path, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Extension contains a non-regular file: ${name}`);
  }
  return files.sort();
}

function parseJSON(data, owner) {
  try { return JSON.parse(data.toString('utf8')); }
  catch { throw new Error(`${owner}: invalid JSON`); }
}

function validateVersion(version, owner) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    || version.split('.').some(part => Number(part) > 65535) || version === '0.0.0') {
    throw new Error(`${owner}: expected a Chrome-compatible major.minor.patch version`);
  }
}

function iconPaths(icons) {
  return typeof icons === 'string' ? [icons] : icons && typeof icons === 'object' ? Object.values(icons) : [];
}

function verifyAsset(value, owner) {
  if (typeof value !== 'string' || !value || /[\\?#]/.test(value)
    || posix.isAbsolute(value) || /^(?:[a-z]+:|\/\/)/i.test(value)) {
    throw new Error(`${owner}: invalid local asset path`);
  }
  const asset = posix.normalize(posix.join(posix.dirname(owner), value));
  if (!productionSet.has(asset)) throw new Error(`${owner}: asset is not in the production allowlist: ${asset}`);
}

// Refuse recognizable embedded credentials without printing their values. This is
// an additional guard, not a replacement for reviewing the repository before release.
function checkPublicText(data, owner) {
  const text = data.toString('utf8');
  if (/\b(?:xai|sk)-[A-Za-z0-9_-]{24,}\b/.test(text)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    throw new Error(`${owner}: possible embedded credential; remove it before packaging`);
  }
  if (/[A-Za-z]:[\\/]+(?:Users|codexpc)[\\/]+/i.test(text)) {
    throw new Error(`${owner}: private absolute path; use a portable path before packaging`);
  }
}

export async function inspectPackage(root = projectRoot, expectedVersion) {
  const extension = resolve(root, 'extension');
  if ((await lstat(extension)).isSymbolicLink()) throw new Error('Extension directory cannot be a symbolic link');
  const actual = await inventory(extension);
  const unexpected = actual.filter(name => !productionSet.has(name));
  if (unexpected.length) throw new Error(`Unexpected extension files; review before packaging: ${unexpected.join(', ')}`);
  const missing = PRODUCTION_FILES.filter(name => !actual.includes(name));
  if (missing.length) throw new Error(`Missing production files: ${missing.join(', ')}`);
  const files = await Promise.all(actual.map(async name => ({ name, data: await readFile(resolve(extension, name)) })));
  const byName = new Map(files.map(file => [file.name, file.data]));
  const manifest = parseJSON(byName.get('manifest.json'), 'manifest.json');
  const pkg = parseJSON(await readFile(resolve(root, 'package.json')), 'package.json');
  if (pkg.license !== 'MIT') throw new Error('package.json: expected MIT code license');
  if (!(await readFile(resolve(root, 'LICENSE'))).equals(byName.get('LICENSE.txt'))) {
    throw new Error('LICENSE.txt: distribution license must match the repository LICENSE');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.manifest_version !== 3 || manifest.name !== 'SuperX') throw new Error('manifest.json: expected SuperX Manifest V3');
  validateVersion(manifest.version, 'manifest.json');
  validateVersion(pkg.version, 'package.json');
  if (pkg.version !== manifest.version) throw new Error('Version mismatch between package.json and manifest.json');
  if (expectedVersion !== undefined && expectedVersion !== manifest.version) {
    throw new Error(`Release version mismatch: expected ${expectedVersion}, found ${manifest.version}`);
  }
  const assets = [
    manifest.background?.service_worker, manifest.action?.default_popup,
    manifest.options_page, manifest.options_ui?.page,
    ...iconPaths(manifest.icons), ...iconPaths(manifest.action?.default_icon),
    ...(manifest.content_scripts || []).flatMap(script => [...(script.js || []), ...(script.css || [])]),
    ...(manifest.web_accessible_resources || []).flatMap(group => group.resources || []),
    ...(manifest.declarative_net_request?.rule_resources || []).map(rule => rule.path),
  ].filter(value => value !== undefined);
  for (const asset of assets) verifyAsset(asset, 'manifest.json');
  for (const file of files) {
    if (extname(file.name) !== '.png') checkPublicText(file.data, file.name);
    const text = file.data.toString('utf8');
    if (extname(file.name) === '.html') {
      for (const match of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        verifyAsset(match[1], file.name);
      }
    }
    if (extname(file.name) === '.css') {
      for (const match of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) verifyAsset(match[1], file.name);
    }
    if (file.name === manifest.background?.service_worker) {
      for (const call of text.matchAll(/\bimportScripts\(([^)]*)\)/g)) {
        for (const match of call[1].matchAll(/["']([^"']+)["']/g)) verifyAsset(match[1], file.name);
      }
    }
  }
  // Match the Git/source-export LF form across Windows and Linux checkouts.
  // Keep binary icon bytes intact; text validation above uses the original files.
  return { version: manifest.version, files: files.map(file => ({
    name: file.name,
    data: extname(file.name) === '.png' ? file.data : Buffer.from(file.data.toString('utf8').replace(/\r\n/g, '\n')),
  })) };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

// ZIP STORE keeps the build dependency-free and byte-identical across platforms.
// Fixed timestamps (1980-01-01), names, permissions and ordering avoid local metadata.
export function createArchive(files) {
  if (files.length > 65535) throw new Error('Too many files for a standard ZIP');
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const file of [...files].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const name = Buffer.from(file.name, 'utf8');
    const data = file.data;
    if (name.length > 65535 || data.length > 0xffffffff || offset > 0xffffffff) throw new Error('File exceeds standard ZIP limits');
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(file.name.endsWith('.command') ? 0x81ed0000 : 0x81a40000, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  if (offset > 0xffffffff || central.length > 0xffffffff) throw new Error('Archive exceeds standard ZIP limits');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

export async function packageExtension({ root = projectRoot, outputDir = resolve(root, 'artifacts'), expectedVersion } = {}) {
  const inspected = await inspectPackage(root, expectedVersion);
  const output = resolve(outputDir);
  const extension = resolve(root, 'extension');
  const rel = relative(extension, output);
  if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) {
    throw new Error('Output directory must be outside the extension directory');
  }
  const base = `SuperX-${inspected.version}`;
  const archiveName = `${base}.zip`, filesName = `${base}-files.json`, sumsName = `${base}-SHA256SUMS.txt`;
  const archive = createArchive(inspected.files);
  const fileManifest = Buffer.from(`${JSON.stringify({
    name: 'SuperX', version: inspected.version,
    files: inspected.files.map(file => ({ path: file.name, bytes: file.data.length, sha256: sha256(file.data) })),
  }, null, 2)}\n`);
  const checksums = `${sha256(archive)}  ${archiveName}\n${sha256(fileManifest)}  ${filesName}\n`;
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, archiveName), archive);
  await writeFile(resolve(output, filesName), fileManifest);
  await writeFile(resolve(output, sumsName), checksums);
  return { version: inspected.version, count: inspected.files.length, outputDir: output, archiveName, filesName, sumsName, sha256: sha256(archive) };
}

async function main(args) {
  let check = false, expectedVersion, outputDir;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--check') check = true;
    else if (arg === '--expected-version' || arg === '--output-dir') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--expected-version') expectedVersion = value;
      else outputDir = resolve(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (check) {
    const result = await inspectPackage(projectRoot, expectedVersion);
    console.log(`SuperX ${result.version}: ${result.files.length} production files are ready to package.`);
    return;
  }
  const result = await packageExtension({ expectedVersion, outputDir });
  console.log(`Packaged ${result.archiveName} (${result.count} production files) in ${result.outputDir}`);
  console.log(`SHA256 ${result.sha256}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Packaging failed: ${error.message}`); process.exitCode = 1; });
}
