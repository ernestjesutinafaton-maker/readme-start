import { shields, staticBadge } from '../../lib/badges.js';
import { arr, cleanDescription, obj, parsePerson, str } from '../../lib/util.js';
import { LANGS, NODE_TECH, techFromDeps } from '../tech.js';

const MANAGERS = {
  npm: {
    label: 'npm',
    install: 'npm install',
    run: (s) => (s === 'start' || s === 'test' ? `npm ${s}` : `npm run ${s}`),
    link: 'npm link',
  },
  yarn: { label: 'Yarn', url: 'https://yarnpkg.com/', install: 'yarn install', run: (s) => `yarn ${s}`, link: 'yarn link' },
  pnpm: { label: 'pnpm', url: 'https://pnpm.io/', install: 'pnpm install', run: (s) => `pnpm ${s}`, link: 'pnpm link --global' },
  // "bun test" runs Bun's own test runner, so scripts always go through "bun run".
  bun: { label: 'Bun', url: 'https://bun.sh/', install: 'bun install', run: (s) => `bun run ${s}`, link: 'bun link' },
};

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

// npm lifecycle scripts run automatically; they are not commands for humans.
const LIFECYCLE = new Set([
  'prepare', 'prepublish', 'prepublishOnly', 'prepack', 'postpack', 'preinstall', 'install',
  'postinstall', 'preuninstall', 'uninstall', 'postuninstall', 'preversion', 'version',
  'postversion', 'publish', 'postpublish', 'dependencies',
]);

const NPM_DEFAULT_TEST = /no test specified/;
const MAX_SCRIPTS = 25;

function detectManager(fs, pkg) {
  const declared = /^(npm|yarn|pnpm|bun)@/.exec(str(pkg.packageManager) ?? '');
  if (declared) return { name: declared[1], version: pkg.packageManager.split('@')[1].split('+')[0] };
  const lock = LOCKFILES.find(([file]) => fs.isFile(file));
  return { name: lock?.[1] ?? 'npm', version: null };
}

function isHook(name, scripts) {
  if (LIFECYCLE.has(name)) return true;
  const base = name.replace(/^(pre|post)/, '');
  return base !== name && Object.hasOwn(scripts, base);
}

function binNames(bin, fallback) {
  if (typeof bin === 'string') return fallback ? [fallback] : [];
  return Object.keys(obj(bin));
}

function toIdentifier(name) {
  const id = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase()))
    .join('');
  if (!id) return 'lib';
  return /^\d/.test(id) ? `_${id}` : id;
}

function importSnippet(name, esm) {
  const id = toIdentifier(name.replace(/^@[^/]+\//, ''));
  return esm ? `import ${id} from '${name}';` : `const ${id} = require('${name}');`;
}

function licenseOf(value) {
  if (typeof value === 'string') return str(value);
  return str(value?.type);
}

const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

/** Reads the "packages" list of pnpm-workspace.yaml (block or flow style). */
export function parsePnpmWorkspace(text) {
  if (!text) return [];
  const flow = /^packages:\s*\[(.*)\]\s*$/m.exec(text);
  if (flow) return flow[1].split(',').map(unquote).filter(Boolean);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:\s*(#.*)?$/.test(line));
  if (start < 0) return [];
  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = /^\s+-\s*(.+?)\s*(?:#.*)?$/.exec(line);
    if (!item) break;
    patterns.push(unquote(item[1]));
  }
  return patterns;
}

const WORKSPACE_EXAMPLES = {
  npm: (name) => `npm run build --workspace=${name}`,
  yarn: (name) => `yarn workspace ${name} build`,
  pnpm: (name) => `pnpm --filter ${name} build`,
  bun: (name) => `bun run --filter ${name} build`,
};

function detectWorkspace(fs, pkg, manager) {
  const declared = Array.isArray(pkg.workspaces) ? pkg.workspaces : arr(pkg.workspaces?.packages);
  const pnpm = parsePnpmWorkspace(fs.read('pnpm-workspace.yaml'));
  const lerna = arr(fs.readJson('lerna.json')?.packages);
  const patterns = [pnpm, declared, lerna].find((list) => list.length)?.filter((p) => typeof p === 'string') ?? [];
  if (!patterns.length) return null;
  const tool = pnpm.length ? 'pnpm' : declared.length ? manager : 'npm';
  const label = { npm: 'npm', yarn: 'Yarn', pnpm: 'pnpm', bun: 'Bun' }[tool];
  return { ecosystem: 'node', tool: `${label} workspaces`, patterns, example: WORKSPACE_EXAMPLES[tool] };
}

export function detect(fs) {
  const pkg = fs.readJson('package.json');
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return null;

  const manager = detectManager(fs, pkg);
  const pm = MANAGERS[manager.name];
  const rawScripts = obj(pkg.scripts);
  const scripts = Object.entries(rawScripts).filter(
    ([name, cmd]) =>
      typeof cmd === 'string' && !isHook(name, rawScripts) && !(name === 'test' && NPM_DEFAULT_TEST.test(cmd)),
  );
  const has = (name) => scripts.some(([n]) => n === name);

  const runtimeDeps = Object.keys(obj(pkg.dependencies));
  const deps = new Set([
    ...runtimeDeps,
    ...Object.keys(obj(pkg.devDependencies)),
    ...Object.keys(obj(pkg.peerDependencies)),
    ...Object.keys(obj(pkg.optionalDependencies)),
  ]);

  const name = str(pkg.name);
  const unscoped = name?.replace(/^@[^/]+\//, '') ?? null;
  const bins = binNames(pkg.bin, unscoped);
  const isPrivate = pkg.private === true;
  const publishable = !isPrivate && Boolean(name) && Boolean(pkg.files || pkg.publishConfig);
  const isLibrary =
    !isPrivate && !bins.length && Boolean(name) &&
    Boolean(pkg.exports || pkg.module || pkg.types || pkg.typings || publishable);
  const esm = pkg.type === 'module' || Boolean(pkg.exports || pkg.module);
  const typescript = deps.has('typescript') || fs.isFile('tsconfig.json');

  const usage = [];
  if (bins.length) {
    if (publishable) usage.push({ t: 'usage.cliInstall', code: `npm install -g ${name}` });
    else usage.push({ t: 'usage.cliLink', code: pm.link });
    usage.push({ t: 'usage.cliRun', code: bins.map((b) => `${b} --help`).join('\n') });
    if (publishable) usage.push({ t: 'usage.cliNpx', code: `npx ${name} --help` });
  } else if (isLibrary) {
    usage.push({ t: 'usage.libInstall', code: `npm install ${name}` });
    usage.push({ t: 'usage.libImport', code: importSnippet(name, esm), lang: typescript ? 'ts' : 'js' });
  } else {
    if (has('dev')) usage.push({ t: 'usage.dev', code: pm.run('dev') });
    const serve = ['start', 'preview', 'serve'].find(has);
    if (has('build') && serve) usage.push({ t: 'usage.production', code: `${pm.run('build')}\n${pm.run(serve)}` });
    else if (has('build')) usage.push({ t: 'usage.build', code: pm.run('build') });
    else if (serve) usage.push({ t: 'usage.start', code: pm.run(serve) });
    const main = str(pkg.main) ?? 'index.js';
    if (!usage.length && fs.isFile(main)) usage.push({ t: 'usage.run', code: `node ${main}` });
  }

  const tests = [];
  if (has('test')) tests.push({ t: 'tests.run', code: pm.run('test') });
  const coverage = ['test:coverage', 'test:cov', 'coverage'].find(has);
  if (coverage) tests.push({ t: 'tests.coverage', code: pm.run(coverage) });
  const e2e = ['test:e2e', 'e2e'].find(has);
  if (e2e) tests.push({ t: 'tests.e2e', code: pm.run(e2e) });

  const nodeEngine = str(pkg.engines?.node);
  const requirements = [];
  if (manager.name !== 'bun' || nodeEngine) {
    requirements.push({ name: 'Node.js', version: nodeEngine, url: 'https://nodejs.org/' });
  }
  if (manager.name !== 'npm') requirements.push({ name: pm.label, version: manager.version, url: pm.url });

  const badges = [];
  if (publishable) {
    const link = `https://www.npmjs.com/package/${name}`;
    badges.push({ kind: 'registry', alt: 'npm version', img: shields(`npm/v/${name}`), link });
    badges.push({ kind: 'registry', alt: 'npm downloads', img: shields(`npm/dm/${name}`), link });
  }
  if (nodeEngine) {
    badges.push({ kind: 'runtime', alt: 'node', img: staticBadge('node', nodeEngine, '5FA04E', { logo: 'nodedotjs' }) });
  }

  const monorepoTools = [
    fs.isFile('turbo.json') && LANGS.turborepo,
    fs.isFile('nx.json') && LANGS.nx,
    fs.isFile('lerna.json') && LANGS.lerna,
  ].filter(Boolean);

  return {
    id: 'node',
    label: 'Node.js',
    packageManager: manager.name,
    name,
    description: cleanDescription(pkg.description),
    version: str(pkg.version),
    private: isPrivate,
    license: licenseOf(pkg.license),
    author: parsePerson(pkg.author) ?? parsePerson(Array.isArray(pkg.contributors) ? pkg.contributors[0] : null),
    repository: pkg.repository ?? null,
    homepage: str(pkg.homepage),
    // A package.json that only carries front-end tooling (Tailwind for a Django
    // app, Vite for Laravel or Rails…) should not take over the README when
    // another ecosystem is present. A Node app with a "start" script, a CLI or
    // a library stays first.
    secondary: !bins.length && !isLibrary && (runtimeDeps.length === 0 || !has('start')),
    workspace: detectWorkspace(fs, pkg, manager.name),
    requirements,
    install: [{ t: 'install.deps', code: pm.install }],
    usage,
    tests,
    scripts: scripts.slice(0, MAX_SCRIPTS).map(([n, raw]) => ({ name: n, cmd: pm.run(n), raw })),
    tech: [
      typescript ? LANGS.typescript : LANGS.javascript,
      manager.name === 'bun' ? LANGS.bun : LANGS.node,
      ...techFromDeps(NODE_TECH, deps),
      ...monorepoTools,
    ],
    badges,
  };
}
