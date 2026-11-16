import { staticBadge } from '../../lib/badges.js';
import { parseRepository } from '../../lib/repository.js';
import { LANGS, SWIFT_TECH, techFromDeps } from '../tech.js';

const APPLE_PLATFORMS = /\.(iOS|macOS|tvOS|watchOS|visionOS)\s*\(\s*(?:\.v([\d_]+)|"([\d.]+)")/g;

/** Reads Package.swift with regular expressions (it is Swift code, not data). */
export function parsePackageSwift(text) {
  const names = (re) => [...text.matchAll(re)].map((m) => m[1]);
  return {
    toolsVersion: /swift-tools-version:\s*([\d.]+)/.exec(text)?.[1] ?? null,
    name: /Package\s*\(\s*name:\s*"([^"]+)"/.exec(text)?.[1] ?? null,
    executables: [...new Set([...names(/\.executable\s*\(\s*name:\s*"([^"]+)"/g), ...names(/\.executableTarget\s*\(\s*name:\s*"([^"]+)"/g)])],
    libraries: names(/\.library\s*\(\s*name:\s*"([^"]+)"/g),
    dependencies: names(/\.package\s*\(\s*(?:name:\s*"[^"]*"\s*,\s*)?url:\s*"([^"]+)"/g),
    platforms: [...text.matchAll(APPLE_PLATFORMS)].map((m) => `${m[1]} ${(m[2] ?? m[3]).replace(/_/g, '.')}`),
  };
}

const ownerRepo = (url) => {
  const repo = parseRepository(url);
  return repo?.owner ? `${repo.owner}/${repo.repo}`.toLowerCase() : null;
};

export function detect(fs, context = {}) {
  const manifest = fs.read('Package.swift');
  const dirs = fs.list('.').filter((e) => e.isDirectory()).map((e) => e.name);
  const workspace = dirs.find((d) => d.endsWith('.xcworkspace'));
  const project = dirs.find((d) => d.endsWith('.xcodeproj'));
  if (manifest == null && !project && !workspace) return null;

  const pkg = manifest != null ? parsePackageSwift(manifest) : null;
  const pods = fs.isFile('Podfile');
  const appleApp = Boolean(project || workspace);
  const name = pkg?.name ?? (project ?? workspace)?.replace(/\.(xcodeproj|xcworkspace)$/, '') ?? null;
  const deps = (pkg?.dependencies ?? []).map(ownerRepo).filter(Boolean);
  if (pods) deps.push(...[...(fs.read('Podfile') ?? '').matchAll(/^\s*pod\s+["']([^"']+)["']/gm)].map((m) => m[1].toLowerCase()));

  const install = [];
  const usage = [];
  const tests = [];
  if (pods) install.push({ t: 'install.deps', code: 'pod install' });

  if (appleApp) {
    // CocoaPods projects must be opened through the generated workspace.
    const toOpen = pods ? `${name}.xcworkspace` : (workspace ?? project);
    usage.push({ t: 'usage.openXcode', code: `open ${toOpen}` });
  } else if (pkg) {
    install.push({ t: 'install.build', code: 'swift build' });
    if (pkg.executables.length) {
      usage.push({ t: 'usage.run', code: pkg.executables.map((e) => `swift run ${e}`).join('\n') });
    } else if (pkg.libraries.length) {
      const repoUrl = context.remote?.url ?? '<repository-url>';
      const requirement = context.latestTag ? `from: "${context.latestTag.replace(/^v/, '')}"` : 'branch: "main"';
      const product = pkg.libraries[0];
      usage.push({
        t: 'usage.libSwiftPM',
        code: `.package(url: "${repoUrl}.git", ${requirement}),\n\n// in your target:\n.product(name: "${product}", package: "${context.remote?.repo ?? name}")`,
        lang: 'swift',
      });
    }
  }
  if (pkg && fs.isDir('Tests')) tests.push({ t: 'tests.run', code: 'swift test' });

  const requirements = [];
  if (pkg) requirements.push({ name: 'Swift', version: pkg.toolsVersion ? `>= ${pkg.toolsVersion}` : null, url: 'https://www.swift.org/install/' });
  if (appleApp || pkg?.platforms.some((p) => !p.startsWith('macOS'))) requirements.push({ name: 'Xcode', version: null, url: 'https://developer.apple.com/xcode/' });
  if (pods) requirements.push({ name: 'CocoaPods', version: null, url: 'https://cocoapods.org/' });

  const tech = [LANGS.swift];
  if (appleApp || pkg?.platforms.some((p) => p.startsWith('iOS'))) tech.push(LANGS.ios);
  if (pods) tech.push(LANGS.cocoapods);

  const badges = [];
  if (pkg?.toolsVersion) badges.push({ kind: 'runtime', alt: 'swift', img: staticBadge('swift', `${pkg.toolsVersion}+`, 'F05138', { logo: 'swift' }) });
  if (pkg?.platforms.length) badges.push({ kind: 'runtime', alt: 'platforms', img: staticBadge('platforms', pkg.platforms.join(' | '), 'lightgrey') });

  return {
    id: 'swift',
    label: 'Swift',
    packageManager: pkg ? 'swiftpm' : pods ? 'cocoapods' : 'xcode',
    name,
    description: null,
    version: null,
    license: null,
    author: null,
    repository: null,
    homepage: null,
    requirements,
    install,
    usage,
    tests,
    scripts: [],
    tech: [...tech, ...techFromDeps(SWIFT_TECH, deps)],
    badges,
  };
}
