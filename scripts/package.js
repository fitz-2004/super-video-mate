// Builds the extension and zips dist/ for the Chrome Web Store.
//   npm run package            -> zip the current version
//   npm run package -- patch   -> bump 2.0.0 -> 2.0.1 first (also: minor, major)
// The version is kept in sync between manifest.json and package.json.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const MANIFEST = here('../manifest.json');
const PKG = here('../package.json');

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, data) => writeFileSync(f, JSON.stringify(data, null, 2) + '\n');

function bump(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump "${kind}". Use patch, minor or major.`);
}

const kind = process.argv[2];
const manifest = readJson(MANIFEST);
let version = manifest.version;

if (kind) {
  version = bump(version, kind);
  manifest.version = version;
  writeJson(MANIFEST, manifest);
  const pkg = readJson(PKG);
  pkg.version = version;
  writeJson(PKG, pkg);
  console.log(`Version bumped to ${version}`);
}

execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: here('..') });

// The store wants manifest.json at the zip's root, so zip from inside dist/.
const out = here(`../store-assets/super-video-mate-v${version}.zip`);
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-q', '-X', out, '.', '-x', '*.DS_Store'], { stdio: 'inherit', cwd: here('../dist') });

console.log(`\nReady to upload: store-assets/super-video-mate-v${version}.zip`);
