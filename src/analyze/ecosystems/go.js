import { staticBadge } from '../../lib/badges.js';
import { GO_TECH, LANGS, techFromDeps } from '../tech.js';

export function parseGoMod(text) {
  const module = /^\s*module\s+"?([^\s"]+)"?\s*$/m.exec(text)?.[1] ?? null;
  const go = /^\s*go\s+(\S+)/m.exec(text)?.[1] ?? null;
  const requires = [];
  const add = (line) => {
    const m = /^\s*([^\s/][^\s]*)\s+(\S+)(.*)$/.exec(line);
    if (m && !m[1].startsWith('//')) requires.push({ path: m[1], indirect: /\/\/\s*indirect/.test(m[3]) });
  };
  for (const block of text.matchAll(/^\s*require\s*\(([\s\S]*?)^\s*\)/gm)) {
    block[1].split('\n').forEach(add);
  }
  for (const single of text.matchAll(/^\s*require\s+([^\s(].*)$/gm)) add(single[1]);
  return { module, go, requires };
}

/** Directories listed by the "use" directives of a go.work file. */
export function parseGoWork(text) {
  const dirs = [];
  const add = (value) => {
    const dir = value.replace(/\/\/.*$/, '').trim().replace(/^"(.*)"$/, '$1').replace(/^\.\//, '').replace(/\/$/, '');
    if (dir && dir !== '.') dirs.push(dir);
  };
  for (const block of text.matchAll(/^\s*use\s*\(([\s\S]*?)^\s*\)/gm)) block[1].split('\n').forEach(add);
  for (const single of text.matchAll(/^\s*use\s+([^\s(].*)$/gm)) add(single[1]);
  return { go: /^\s*go\s+(\S+)/m.exec(text)?.[1] ?? null, dirs };
}

const requirement = (go) => ({ name: 'Go', version: go ? `>= ${go}` : null, url: 'https://go.dev/dl/' });
const versionBadge = (go) => ({ kind: 'runtime', alt: 'go', img: staticBadge('go', go, '00ADD8', { logo: 'go' }) });

// A go.work file without a root go.mod: a workspace of several modules.
function detectWorkspaceRoot(text) {
  const { go, dirs } = parseGoWork(text);
  const targets = dirs.map((d) => `./${d}/...`).join(' ');
  return {
    id: 'go',
    label: 'Go',
    packageManager: 'go',
    name: null,
    workspace: { ecosystem: 'go', tool: 'Go workspace', dirs, example: (name, dir) => `go build ./${dir}/...` },
    requirements: [requirement(go)],
    install: dirs.length ? [{ t: 'install.build', code: `go build ${targets}` }] : [],
    usage: [],
    tests: dirs.length ? [{ t: 'tests.run', code: `go test ${targets}` }] : [],
    scripts: [],
    tech: [LANGS.go],
    badges: go ? [versionBadge(go)] : [],
  };
}

export function detect(fs) {
  const text = fs.read('go.mod');
  if (text == null) {
    const work = fs.read('go.work');
    return work == null ? null : detectWorkspaceRoot(work);
  }

  const { module, go, requires } = parseGoMod(text);
  // "github.com/acme/tool/v2" -> "tool"
  const segments = module?.split('/') ?? [];
  const name = segments.filter((s) => !/^v\d+$/.test(s)).pop() ?? null;
  const remote = Boolean(module && segments[0].includes('.'));

  const rootMain = /^\s*package\s+main\b/m.test(fs.read('main.go') ?? '');
  const commands = fs
    .list('cmd')
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const usage = [];
  if (rootMain) {
    usage.push({ t: 'usage.run', code: 'go run .' });
    if (remote) usage.push({ t: 'usage.cliInstall', code: `go install ${module}@latest` });
  } else if (commands.length) {
    usage.push({ t: 'usage.run', code: commands.map((c) => `go run ./cmd/${c}`).join('\n') });
    if (remote) usage.push({ t: 'usage.cliInstall', code: commands.map((c) => `go install ${module}/cmd/${c}@latest`).join('\n') });
  } else if (module) {
    if (remote) usage.push({ t: 'usage.libInstall', code: `go get ${module}` });
    usage.push({ t: 'usage.libImport', code: `import "${module}"`, lang: 'go' });
  }

  const install = [];
  if (requires.length) install.push({ t: 'install.deps', code: 'go mod download' });
  install.push({ t: 'install.build', code: 'go build ./...' });

  const badges = [];
  if (remote) {
    badges.push({ kind: 'docs', alt: 'Go Reference', img: `https://pkg.go.dev/badge/${module}.svg`, link: `https://pkg.go.dev/${module}` });
  }
  if (go) badges.push(versionBadge(go));

  const githubPath = /^(github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/]+/.exec(module ?? '')?.[0];
  const work = fs.read('go.work');
  const workDirs = work ? parseGoWork(work).dirs : [];

  return {
    id: 'go',
    label: 'Go',
    packageManager: 'go',
    name,
    description: null,
    version: null,
    license: null,
    author: null,
    repository: githubPath ? `https://${githubPath}` : null,
    homepage: null,
    workspace: workDirs.length
      ? { ecosystem: 'go', tool: 'Go workspace', dirs: workDirs, example: (pkg, dir) => `go build ./${dir}/...` }
      : null,
    requirements: [requirement(go)],
    install,
    usage,
    tests: [{ t: 'tests.run', code: 'go test ./...' }],
    scripts: [],
    tech: [LANGS.go, ...techFromDeps(GO_TECH, requires.filter((r) => !r.indirect).map((r) => r.path))],
    badges,
  };
}
