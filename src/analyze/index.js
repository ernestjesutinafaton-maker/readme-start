import { basename, resolve } from 'node:path';
import { createProjectFs } from '../lib/fs.js';
import { parseRepository } from '../lib/repository.js';
import { uniqueBy } from '../lib/util.js';
import { detectCommon } from './common.js';
import { detect as detectCpp } from './ecosystems/cpp.js';
import { detect as detectDart } from './ecosystems/dart.js';
import { detect as detectDotnet } from './ecosystems/dotnet.js';
import { detect as detectElixir } from './ecosystems/elixir.js';
import { detect as detectGo } from './ecosystems/go.js';
import { detect as detectJava } from './ecosystems/java.js';
import { detect as detectNode } from './ecosystems/node.js';
import { detect as detectPhp } from './ecosystems/php.js';
import { detect as detectPython } from './ecosystems/python.js';
import { detect as detectRuby } from './ecosystems/ruby.js';
import { detect as detectRust } from './ecosystems/rust.js';
import { detect as detectSwift } from './ecosystems/swift.js';
import { buildTree } from './tree.js';
import { resolvePackages } from './workspaces.js';

// Order = priority when a project mixes several ecosystems.
const DETECTORS = {
  node: detectNode,
  python: detectPython,
  rust: detectRust,
  go: detectGo,
  php: detectPhp,
  ruby: detectRuby,
  java: detectJava,
  dotnet: detectDotnet,
  dart: detectDart,
  swift: detectSwift,
  elixir: detectElixir,
  cpp: detectCpp,
};

const normalizeUrl = (url) => url.replace(/#.*$/, '').replace(/\.git$/, '').replace(/\/+$/, '');

function detectWorkspace(fs, found) {
  const owner = found.find((e) => e.workspace);
  if (!owner) return { workspace: null, tech: [], warnings: [] };
  const ws = owner.workspace;
  const { packages, tech, warnings } = resolvePackages(fs, ws, DETECTORS[ws.ecosystem]);
  if (!packages.length) return { workspace: null, tech: [], warnings };
  const example = ws.example ? ws.example(packages[0].name, packages[0].path) : null;
  return { workspace: { tool: ws.tool, ecosystem: owner.label, packages, example }, tech, warnings };
}

/**
 * Reads a project directory and returns everything the README generator
 * needs, as plain data. Nothing is written and nothing leaves the machine.
 */
export function analyzeProject(dir, { depth = 2 } = {}) {
  const root = resolve(dir);
  const fs = createProjectFs(root);
  if (!fs.isDir('.')) throw new Error(`Directory not found: ${root}`);

  const common = detectCommon(fs);
  // Some snippets (SwiftPM, CMake FetchContent) need the git remote and latest tag.
  const context = { remote: common.gitRemote, latestTag: common.latestTag };
  let found = Object.values(DETECTORS)
    .map((detect) => detect(fs, context))
    .filter(Boolean);
  if (found.some((e) => !e.weak)) found = found.filter((e) => !e.weak);
  // A secondary ecosystem (front-end tooling next to a back-end) goes last,
  // unless it is the only one. The sort is stable for the others.
  if (found.some((e) => !e.secondary)) found.sort((a, b) => Number(Boolean(a.secondary)) - Number(Boolean(b.secondary)));

  const monorepo = detectWorkspace(fs, found);
  const pick = (key) => found.map((e) => e[key]).find((v) => v != null && v !== '') ?? null;
  const tagged = (key) => found.flatMap((e) => (e[key] ?? []).map((item) => ({ ...item, eco: e.label })));

  const repository = found.map((e) => parseRepository(e.repository)).find(Boolean) ?? common.gitRemote ?? null;
  let homepage = pick('homepage');
  if (homepage && repository && normalizeUrl(homepage) === repository.url) homepage = null;

  return {
    root,
    dirName: basename(root),
    name: pick('name') ?? basename(root),
    description: pick('description') ?? common.readmeDescription ?? null,
    version: pick('version'),
    license: pick('license') ?? common.license?.id ?? null,
    licenseFile: common.license?.file ?? null,
    author: pick('author'),
    repository,
    homepage,
    ecosystems: found.map((e) => ({ id: e.id, label: e.label, packageManager: e.packageManager ?? null })),
    workspace: monorepo.workspace,
    requirements: uniqueBy(found.flatMap((e) => e.requirements ?? []), (r) => r.name),
    install: tagged('install'),
    usage: tagged('usage'),
    tests: tagged('tests'),
    scripts: [...found.flatMap((e) => e.scripts ?? []), ...common.makeTargets],
    tech: uniqueBy([...found.flatMap((e) => e.tech ?? []), ...monorepo.tech, ...common.tech], (t) => t.name),
    badges: found.flatMap((e) => e.badges ?? []),
    ci: common.ci,
    docker: common.docker,
    env: common.env,
    docs: common.docs,
    staticSite: !found.length && fs.isFile('index.html'),
    tree: depth > 0 ? buildTree(root, { depth }) : null,
    warnings: [...fs.warnings, ...monorepo.warnings],
  };
}
