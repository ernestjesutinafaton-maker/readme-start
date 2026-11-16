const escapeRegExp = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?'; // "**/" matches zero or more directories
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end > i + 1) {
        let cls = glob.slice(i + 1, end).replace(/\\/g, '\\\\');
        if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
        re += `[${cls}]`;
        i = end;
      } else {
        re += '\\[';
      }
    } else if (c === '\\' && i + 1 < glob.length) {
      re += escapeRegExp(glob[++i]);
    } else {
      re += escapeRegExp(c);
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * Creates a matcher from .gitignore-style patterns. It supports the common
 * subset: comments, negation, anchored patterns, directory-only patterns,
 * "*", "**", "?" and character classes. Paths use "/" separators and are
 * relative to the directory holding the patterns.
 *
 * The matcher returns true (ignored), false (re-included by a "!" rule) or
 * undefined (no rule applies), so that nested .gitignore files can be layered.
 */
export function createMatcher(patterns) {
  const rules = [];
  for (const rawLine of patterns) {
    let line = rawLine.replace(/\r$/, '');
    if (!line.trim() || line.startsWith('#')) continue;
    line = line.replace(/(?<!\\)\s+$/, '');
    let negate = false;
    if (line.startsWith('!')) {
      negate = true;
      line = line.slice(1);
    } else if (line.startsWith('\\')) {
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const anchored = line.includes('/');
    line = line.replace(/^\//, '');
    if (!line) continue;
    try {
      rules.push({ negate, dirOnly, anchored, re: globToRegExp(line) });
    } catch {
      // Skip patterns we cannot translate instead of failing the whole scan.
    }
  }

  return function match(relPath, isDir) {
    const base = relPath.slice(relPath.lastIndexOf('/') + 1);
    let result;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.re.test(rule.anchored ? relPath : base)) result = !rule.negate;
    }
    return result;
  };
}

/** Boolean version of createMatcher(): true when the path is ignored. */
export function createIgnore(patterns) {
  const match = createMatcher(patterns);
  return (relPath, isDir) => match(relPath, isDir) === true;
}
