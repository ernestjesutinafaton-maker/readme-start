import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseToml } from './toml.js';
import { parseYaml } from './yaml.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024;

/**
 * Read-only, never-throwing view of a project directory. Paths are relative
 * to the project root. Missing or unreadable files read as null; parse errors
 * are collected in `warnings` instead of aborting the analysis.
 */
export function createProjectFs(root) {
  const warnings = [];
  const abs = (p) => (isAbsolute(p) ? p : join(root, p));

  function stat(p) {
    if (!p) return null;
    try {
      return statSync(abs(p));
    } catch {
      return null;
    }
  }

  function read(p) {
    const info = stat(p);
    if (!info?.isFile() || info.size > MAX_FILE_SIZE) return null;
    try {
      return readFileSync(abs(p), 'utf8').replace(/^﻿/, '');
    } catch {
      return null;
    }
  }

  function parse(p, parser) {
    const text = read(p);
    if (text == null) return null;
    try {
      return parser(text);
    } catch (err) {
      warnings.push(`Could not parse ${p}: ${err.message}`);
      return null;
    }
  }

  function list(p = '.') {
    try {
      return readdirSync(abs(p), { withFileTypes: true });
    } catch {
      return [];
    }
  }

  /** First file in `dir` whose name matches `pattern` (shortest name wins). */
  function find(pattern, dir = '.') {
    const match = list(dir)
      .filter((e) => e.isFile() && pattern.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
    if (!match) return null;
    return dir === '.' ? match : `${dir}/${match}`;
  }

  return {
    root,
    warnings,
    read,
    list,
    find,
    exists: (p) => stat(p) !== null,
    isFile: (p) => stat(p)?.isFile() ?? false,
    isDir: (p) => stat(p)?.isDirectory() ?? false,
    readJson: (p) => parse(p, JSON.parse),
    readToml: (p) => parse(p, parseToml),
    readYaml: (p) => parse(p, parseYaml),
  };
}
