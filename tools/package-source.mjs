// Export only public project files. Local output, Git metadata, credentials,
// installed browser data and asset-production history never enter this archive.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArchive, inspectPackage } from './package-extension.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_ROOT_FILES = Object.freeze([
  '.gitattributes', '.gitignore', 'LICENSE', 'README.md', 'README.zh-CN.md',
  'NOTICE.md', 'PRIVACY.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'package.json',
]);
export const PUBLIC_SOURCE_DIRECTORIES = Object.freeze([
  '.github', 'demo', 'tests', 'tools', 'docs',
]);
const privateTools = new Set(['tools/check-privacy-site.mjs', 'tools/render-store-assets.mjs']);
const publicDocuments = new Set(['docs/RELEASE_CHANNELS.md', 'docs/RELEASE_CHECKLIST.md']);
// Only these two language-specific README screenshots are public and required;
// obsolete previews and unrelated local screenshots stay out of exports.
const documentationImages = new Set([
  'docs/assets/superx-preview-en.png',
  'docs/assets/superx-preview-zh-CN.png',
]);
const binaryExtensions = new Set(['.png', '.jpg', '.jpeg']);
const hash = data => createHash('sha256').update(data).digest('hex');

function isPublicFile(directory, name) {
  if (directory === '.github') return /\.(?:ya?ml|md)$/.test(name);
  if (directory === 'demo') return /\.(?:html|js)$/.test(name);
  if (directory === 'tests') return /\.test\.(?:js|cjs)$/.test(name) || /(?:^|\/)test_[^/]+\.py$/.test(name);
  if (directory === 'tools') return name.endsWith('.mjs') && !privateTools.has(name);
  if (directory === 'docs') return publicDocuments.has(name) || documentationImages.has(name);
  return false;
}

async function publicFiles(root, directory, category = directory) {
  const location = resolve(root, directory);
  if ((await lstat(location)).isSymbolicLink()) throw new Error(`Refuse symbolic link in public source: ${directory}`);
  const files = [];
  for (const entry of await readdir(location, { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Refuse symbolic link in public source: ${name}`);
    if (entry.isDirectory()) files.push(...await publicFiles(root, name, category));
    else if (entry.isFile() && isPublicFile(category, name)) files.push(name);
  }
  return files;
}

export async function inspectSource(root = projectRoot, expectedVersion) {
  const release = await inspectPackage(root, expectedVersion);
  const files = [...PUBLIC_ROOT_FILES, ...release.files.map(file => `extension/${file.name}`)];
  for (const directory of PUBLIC_SOURCE_DIRECTORIES) files.push(...await publicFiles(root, directory));
  const entries = [];
  for (const name of [...new Set(files)].sort()) {
    const location = resolve(root, name);
    if ((await lstat(location)).isSymbolicLink()) throw new Error(`Refuse symbolic link: ${name}`);
    let data = await readFile(location);
    if (!binaryExtensions.has(extname(name))) {
      const text = data.toString('utf8');
      if (/\b(?:xai|sk)-[A-Za-z0-9_-]{24,}\b/.test(text)
        || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
        || /[A-Za-z]:[\\/]+(?:Users|codexpc)[\\/]+/i.test(text)) {
        throw new Error(`Potential credential or private workstation path: ${name}`);
      }
      data = Buffer.from(text.replace(/\r\n/g, '\n'));
    }
    entries.push({ name: `SuperX-${release.version}/${name}`, data });
  }
  for (const name of documentationImages) {
    if (!files.includes(name)) throw new Error(`Missing public README image: ${name}`);
  }
  return { version: release.version, entries };
}

export async function packageSource({ root = projectRoot, outputDir = resolve(root, 'artifacts'), expectedVersion } = {}) {
  const output = resolve(outputDir);
  for (const directory of ['extension', ...PUBLIC_SOURCE_DIRECTORIES]) {
    const rel = relative(resolve(root, directory), output);
    if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) {
      throw new Error('Output directory must be outside public source directories');
    }
  }
  const inspected = await inspectSource(root, expectedVersion);
  const archiveName = `SuperX-${inspected.version}-source.zip`;
  const filesName = `SuperX-${inspected.version}-source-files.json`;
  const sumsName = `SuperX-${inspected.version}-source-SHA256SUMS.txt`;
  const archive = createArchive(inspected.entries);
  const inventory = Buffer.from(`${JSON.stringify({
    version: inspected.version,
    files: inspected.entries.map(entry => ({ path: entry.name, bytes: entry.data.length, sha256: hash(entry.data) })),
  }, null, 2)}\n`);
  const checksums = `${hash(archive)}  ${archiveName}\n${hash(inventory)}  ${filesName}\n`;
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, archiveName), archive);
  await writeFile(resolve(output, filesName), inventory);
  await writeFile(resolve(output, sumsName), checksums);
  return { version: inspected.version, count: inspected.entries.length, outputDir: output, archiveName, filesName, sumsName, sha256: hash(archive) };
}

async function main(args) {
  let expectedVersion, outputDir;
  while (args.length) {
    const arg = args.shift();
    if (arg !== '--expected-version' && arg !== '--output-dir') throw new Error(`Unknown argument: ${arg}`);
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    if (arg === '--expected-version') expectedVersion = value;
    else outputDir = resolve(value);
  }
  const result = await packageSource({ expectedVersion, outputDir });
  console.log(`Public source export: ${result.archiveName} (${result.count} files). This does not publish a repository or release.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Source packaging failed: ${error.message}`); process.exitCode = 1; });
}
