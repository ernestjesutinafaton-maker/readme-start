import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseRepository } from '../lib/repository.js';
import { PLACEHOLDER_DESCRIPTIONS } from '../generate/i18n.js';
import { LANGS } from './tech.js';

// Order matters: more specific licenses must be tested first.
const LICENSE_SIGNATURES = [
  ['AGPL-3.0', /GNU AFFERO GENERAL PUBLIC LICENSE/i],
  ['LGPL-3.0', /GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/i],
  ['GPL-3.0', /GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/i],
  ['GPL-2.0', /GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 2/i],
  ['Apache-2.0', /Apache License[\s\S]{0,80}Version 2\.0/i],
  ['MPL-2.0', /Mozilla Public License,?\s+(Version|v\.?)\s*2\.0/i],
  ['ISC', /\bISC License\b|Permission to use, copy, modify, and\/or distribute this software for any purpose/i],
  ['MIT', /\bMIT License\b|Permission is hereby granted, free of charge/i],
  ['BSD-3-Clause', /Redistribution and use in source and binary forms[\s\S]*Neither the name/i],
  ['BSD-2-Clause', /Redistribution and use in source and binary forms/i],
  ['Unlicense', /This is free and unencumbered software released into the public domain/i],
];

const SECRET_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API_?KEY|ACCESS_?KEY|CREDENTIAL|AUTH|DSN)/i;
const MAX_ENV_VARS = 50;
const MAX_MAKE_TARGETS = 20;

function detectLicense(fs) {
  const file = fs.find(/^(licen[cs]e|copying)(\.(md|txt|rst))?$/i);
  if (!file) return null;
  const text = fs.read(file) ?? '';
  const id = LICENSE_SIGNATURES.find(([, re]) => re.test(text))?.[0] ?? null;
  return { file, id };
}

function readAbsolute(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function originUrl(config) {
  let section = null;
  let first = null;
  for (const line of config.split(/\r?\n/)) {
    const header = /^\s*\[\s*remote\s+"([^"]+)"\s*\]/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    if (/^\s*\[/.test(line)) {
      section = null;
      continue;
    }
    const kv = /^\s*url\s*=\s*(.+?)\s*$/.exec(line);
    if (kv && section) {
      if (section === 'origin') return kv[1];
      first ??= kv[1];
    }
  }
  return first;
}

function detectGitRemote(fs) {
  let config = null;
  if (fs.isDir('.git')) {
    config = fs.read('.git/config');
  } else if (fs.isFile('.git')) {
    // Worktrees and submodules: ".git" is a file pointing to the real git dir.
    const gitdir = /^gitdir:\s*(.+)$/m.exec(fs.read('.git') ?? '')?.[1]?.trim();
    if (gitdir) {
      const dir = resolve(fs.root, gitdir);
      const common = readAbsolute(join(dir, 'commondir'))?.trim();
      config = readAbsolute(join(common ? resolve(dir, common) : dir, 'config'));
    }
  }
  const url = config ? originUrl(config) : null;
  return url ? parseRepository(url) : null;
}

/** Highest semver tag ("v1.2.0", "1.3") from .git/refs/tags and packed-refs. */
function detectLatestTag(fs) {
  const tags = new Set(fs.list('.git/refs/tags').filter((e) => e.isFile()).map((e) => e.name));
  for (const line of (fs.read('.git/packed-refs') ?? '').split('\n')) {
    const m = /^[0-9a-f]+\s+refs\/tags\/(\S+)$/.exec(line.trim());
    if (m) tags.add(m[1]);
  }
  const versions = [...tags]
    .map((tag) => ({ tag, parts: /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(tag)?.slice(1).map((n) => Number(n ?? 0)) }))
    .filter((v) => v.parts)
    .sort((a, b) => a.parts[0] - b.parts[0] || a.parts[1] - b.parts[1] || a.parts[2] - b.parts[2]);
  return versions.at(-1)?.tag ?? null;
}

function detectCi(fs) {
  const rank = (file) => (/^(ci|test|tests|build|main)\.ya?ml$/i.test(file) ? 0 : 1);
  const github = fs
    .list('.github/workflows')
    .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((file) => {
      const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(fs.read(`.github/workflows/${file}`) ?? '')?.[1];
      return { file, name: name ?? file.replace(/\.ya?ml$/i, '') };
    });
  return { github, gitlab: fs.isFile('.gitlab-ci.yml') };
}

function detectDocker(fs) {
  const dockerfile = fs.find(/^dockerfile$/i);
  const compose = fs.find(/^(docker-)?compose\.ya?ml$/i);
  if (!dockerfile && !compose) return null;
  const port = /^\s*EXPOSE\s+(\d+)/im.exec(fs.read(dockerfile) ?? '')?.[1] ?? null;
  return { dockerfile, compose, port };
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();
  let comment = null;
  if (/^["']/.test(value)) {
    const end = value.indexOf(value[0], 1);
    if (end > 0) {
      comment = /#\s*(.*)$/.exec(value.slice(end + 1))?.[1] ?? null;
      value = value.slice(1, end);
    }
  } else {
    const hash = value.search(/\s#/);
    if (hash >= 0) {
      comment = value.slice(hash).replace(/^\s*#\s*/, '');
      value = value.slice(0, hash).trim();
    }
  }
  return { value, comment: comment || null };
}

function detectEnv(fs) {
  const file = fs.find(/^\.env\.(example|sample|template|dist|defaults)$/i) ?? fs.find(/^example\.env$/i);
  if (!file) return null;
  const vars = [];
  let comments = [];
  for (const raw of (fs.read(file) ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      comments = [];
      continue;
    }
    if (line.startsWith('#')) {
      const text = line.replace(/^#+\s*/, '');
      if (text) comments.push(text);
      continue;
    }
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/.exec(line);
    if (m && vars.length < MAX_ENV_VARS) {
      const { value, comment } = parseEnvValue(m[2]);
      const secret = SECRET_KEY.test(m[1]);
      vars.push({ key: m[1], value: secret ? '' : value, secret, description: comment ?? (comments.join(' ') || null) });
    }
    comments = [];
  }
  return vars.length ? { file, vars } : null;
}

function detectMakeTargets(fs) {
  const file = fs.find(/^(GNUmakefile|makefile)$/i);
  if (!file) return [];
  const targets = [];
  const seen = new Set();
  let comment = null;
  for (const line of (fs.read(file) ?? '').split(/\r?\n/)) {
    const c = /^#+\s?(.*)$/.exec(line);
    if (c) {
      comment = c[1].trim() || null;
      continue;
    }
    const m = /^([A-Za-z0-9][\w-]*)\s*:(?![=:])(.*)$/.exec(line);
    if (m && !seen.has(m[1]) && targets.length < MAX_MAKE_TARGETS) {
      seen.add(m[1]);
      const inline = /##\s*(.+)$/.exec(m[2])?.[1]?.trim();
      targets.push({ name: m[1], cmd: `make ${m[1]}`, description: inline ?? comment ?? null });
    }
    comment = null;
  }
  return targets;
}

/**
 * Reuses the first prose paragraph of an existing README as a description,
 * skipping titles, badges, HTML, lists, code and our own placeholders.
 */
function detectReadmeDescription(fs) {
  const file = fs.find(/^readme(\.(md|markdown|txt))?$/i);
  if (!file) return null;
  const paragraph = [];
  let inFence = false;
  for (const raw of (fs.read(file) ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      if (paragraph.length) break;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(=+|-+)$/.test(line)) {
      paragraph.length = 0; // setext heading underline: the previous line was a title
      continue;
    }
    if (/^(#|<|!\[|\[!\[|>\s*\[!|[-*+]\s|\d+\.\s|\||\*\*\*|___)/.test(line)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line.replace(/^>\s?/, ''));
  }
  let text = paragraph
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/^_(.*)_$/, '$1')
    .trim();
  if (!text || PLACEHOLDER_DESCRIPTIONS.includes(text)) return null;
  if (text.length > 300) text = `${text.slice(0, 297).replace(/\s+\S*$/, '')}…`;
  return text;
}

export function detectCommon(fs) {
  const findDoc = (pattern) => fs.find(pattern) ?? fs.find(pattern, '.github') ?? fs.find(pattern, 'docs');
  const ci = detectCi(fs);
  const docker = detectDocker(fs);
  return {
    license: detectLicense(fs),
    gitRemote: detectGitRemote(fs),
    latestTag: detectLatestTag(fs),
    ci,
    docker,
    env: detectEnv(fs),
    docs: {
      contributing: findDoc(/^contributing(\.md)?$/i),
      codeOfConduct: findDoc(/^code[_-]of[_-]conduct(\.md)?$/i),
    },
    makeTargets: detectMakeTargets(fs),
    readmeDescription: detectReadmeDescription(fs),
    tech: [docker && LANGS.docker, ci.github.length && LANGS.githubActions].filter(Boolean),
  };
}
