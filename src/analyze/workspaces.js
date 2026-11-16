import { join } from 'node:path';
import { createProjectFs } from '../lib/fs.js';
import { createIgnore } from '../lib/gitignore.js';

const SKIPPED = new Set(['node_modules', 'target', 'dist', 'build', 'vendor', 'venv', '__pycache__', 'bin', 'obj']);
const MAX_PACKAGES = 50;
const MAX_GLOBSTAR_DEPTH = 4;

const normalize = (pattern) =>
  String(pattern).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').replace(/\/package\.json$/, '');

const segmentRegExp = (segment) =>
  new RegExp(`^${segment.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

function subdirectories(fs, dir) {
  return fs
    .list(dir || '.')
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIPPED.has(e.name))
    .map((e) => e.name);
}

function expand(fs, segments, base, depth = 0) {
  if (!segments.length) return base && fs.isDir(base) ? [base] : [];
  const [segment, ...rest] = segments;
  const joinPath = (name) => (base ? `${base}/${name}` : name);
  if (segment === '**') {
    const found = expand(fs, rest, base, depth);
    if (depth < MAX_GLOBSTAR_DEPTH) {
      for (const name of subdirectories(fs, base)) found.push(...expand(fs, segments, joinPath(name), depth + 1));
    }
    return found;
  }
  if (/[*?]/.test(segment)) {
    const re = segmentRegExp(segment);
    return subdirectories(fs, base)
      .filter((name) => re.test(name))
      .flatMap((name) => expand(fs, rest, joinPath(name), depth));
  }
  return expand(fs, rest, joinPath(segment), depth);
}

/**
 * Expands workspace patterns ("packages/*", "apps/**", "crates/core",
 * "!packages/legacy") into the matching directories, relative to the root.
 */
export function expandPatterns(fs, patterns) {
  const include = [];
  const exclude = [];
  for (const raw of patterns) {
    const pattern = normalize(raw);
    if (!pattern || pattern === '!') continue;
    if (pattern.startsWith('!')) exclude.push(normalize(pattern.slice(1)));
    else include.push(pattern);
  }
  const isExcluded = createIgnore(exclude.map((p) => `/${p}`));
  const found = new Set(include.flatMap((pattern) => expand(fs, pattern.split('/'), '')));
  return [...found].filter((dir) => !isExcluded(dir, true)).sort();
}

/**
 * Lists the packages of a workspace by running the ecosystem's detector in
 * each member directory. Directories without a manifest are skipped.
 */
export function resolvePackages(fs, workspace, detect) {
  if (workspace.packages) return { packages: workspace.packages.slice(0, MAX_PACKAGES), tech: [], warnings: [] };
  const dirs = workspace.dirs ?? expandPatterns(fs, workspace.patterns ?? []);
  const packages = [];
  const tech = [];
  const warnings = [];
  for (const dir of dirs.slice(0, MAX_PACKAGES)) {
    const sub = createProjectFs(join(fs.root, dir));
    const result = detect(sub);
    warnings.push(...sub.warnings.map((w) => `${dir}: ${w}`));
    if (!result) continue;
    packages.push({
      name: result.name ?? dir.split('/').pop(),
      path: dir,
      description: result.description ?? null,
      version: result.version ?? null,
    });
    tech.push(...(result.tech ?? []));
  }
  return { packages, tech, warnings };
}
