import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createMatcher } from '../lib/gitignore.js';

// Always hidden, even without a .gitignore: dependencies, build output, caches.
const DEFAULT_IGNORES = [
  'node_modules/', '.git', 'dist/', 'build/', 'coverage/', 'target/', 'vendor/', '**/bin/Debug/', '**/bin/Release/', 'obj/',
  '__pycache__/', '.venv/', 'venv/', '*.egg-info/', '.tox/', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/',
  '.next/', '.nuxt/', '.svelte-kit/', '.turbo/', '.cache/', '.parcel-cache/', '.gradle/', '.idea/', '.vscode/', '.vs/',
  '_build/', 'Pods/', 'DerivedData/', 'xcuserdata/', 'cmake-build-*/', 'out/build/',
  '.DS_Store', 'Thumbs.db', '*.pyc', '*.log',
];

// Dotfiles are noise in a tree, except folders that carry meaning.
const VISIBLE_DOTFILES = new Set(['.github']);

function readLines(path) {
  try {
    return readFileSync(path, 'utf8').split('\n');
  } catch {
    return null;
  }
}

/**
 * A stack of matchers, one per .gitignore, from the root to the current
 * directory. Like git, a deeper .gitignore overrides the ones above it.
 */
function isIgnored(matchers, path, isDir) {
  let result;
  for (const { base, match } of matchers) {
    const local = base ? path.slice(base.length + 1) : path;
    const verdict = match(local, isDir);
    if (verdict !== undefined) result = verdict;
  }
  return result === true;
}

/**
 * Renders the project layout as an ASCII tree, honoring the root and nested
 * .gitignore files as well as .git/info/exclude. `depth` is the number of
 * levels below the root that are listed.
 */
export function buildTree(root, { depth = 2, maxEntries = 15 } = {}) {
  const rootPatterns = [...(readLines(join(root, '.git', 'info', 'exclude')) ?? []), ...(readLines(join(root, '.gitignore')) ?? [])];
  const lines = [`${basename(root)}/`];

  function walk(rel, level, prefix, inherited) {
    const nested = rel ? readLines(join(root, rel, '.gitignore')) : null;
    const matchers = nested ? [...inherited, { base: rel, match: createMatcher(nested) }] : inherited;

    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    entries = entries
      .filter((e) => !e.name.startsWith('.') || VISIBLE_DOTFILES.has(e.name))
      .filter((e) => !isIgnored(matchers, rel ? `${rel}/${e.name}` : e.name, e.isDirectory()))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    const shown = entries.slice(0, maxEntries);
    const hidden = entries.length - shown.length;
    shown.forEach((entry, index) => {
      const last = index === shown.length - 1 && hidden === 0;
      const isDir = entry.isDirectory();
      lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}${isDir ? '/' : ''}`);
      if (isDir && level + 1 < depth) {
        walk(rel ? `${rel}/${entry.name}` : entry.name, level + 1, `${prefix}${last ? '    ' : '│   '}`, matchers);
      }
    });
    if (hidden > 0) lines.push(`${prefix}└── … (+${hidden})`);
  }

  walk('', 0, '', [
    { base: '', match: createMatcher(DEFAULT_IGNORES) },
    { base: '', match: createMatcher(rootPatterns) },
  ]);
  return lines.join('\n');
}
