/**
 * Minimal TOML parser covering what project manifests use (Cargo.toml,
 * pyproject.toml): tables, arrays of tables, dotted and quoted keys, the four
 * string kinds, numbers, booleans, arrays and inline tables. Dates are kept
 * as strings. It is lenient on purpose: it reads metadata, it does not
 * validate files.
 */
export function parseToml(input) {
  const src = String(input).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const root = {};
  let table = root;
  let i = 0;

  const fail = (message) => {
    const line = src.slice(0, i).split('\n').length;
    throw new SyntaxError(`${message} at line ${line}`);
  };

  const skipSpaces = () => {
    while (src[i] === ' ' || src[i] === '\t') i++;
  };
  const skipComment = () => {
    if (src[i] === '#') while (i < src.length && src[i] !== '\n') i++;
  };
  // Skips spaces, comments and newlines (used inside arrays and between statements).
  const skipBlank = () => {
    for (;;) {
      skipSpaces();
      skipComment();
      if (src[i] !== '\n') return;
      i++;
    }
  };

  function parseEscape() {
    const c = src[i + 1];
    const simple = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', e: '\x1b', '"': '"', '\\': '\\' };
    if (c !== undefined && Object.hasOwn(simple, c)) {
      i += 2;
      return simple[c];
    }
    if (c === 'u' || c === 'U') {
      const len = c === 'u' ? 4 : 8;
      const hex = src.slice(i + 2, i + 2 + len);
      if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) fail('Invalid unicode escape');
      i += 2 + len;
      return String.fromCodePoint(parseInt(hex, 16));
    }
    return fail('Invalid escape sequence');
  }

  const LINE_CONTINUATION = /\\[ \t]*\n\s*/y;

  function parseBasicString() {
    if (src.startsWith('"""', i)) {
      i += 3;
      if (src[i] === '\n') i++;
      let out = '';
      for (;;) {
        if (i >= src.length) fail('Unterminated string');
        if (src.startsWith('"""', i)) {
          let quotes = 3;
          while (src[i + quotes] === '"' && quotes < 5) quotes++;
          out += '"'.repeat(quotes - 3);
          i += quotes;
          return out;
        }
        if (src[i] === '\\') {
          LINE_CONTINUATION.lastIndex = i;
          const m = LINE_CONTINUATION.exec(src);
          if (m) {
            i += m[0].length;
            continue;
          }
          out += parseEscape();
          continue;
        }
        out += src[i++];
      }
    }
    i++;
    let out = '';
    for (;;) {
      const c = src[i];
      if (c === undefined || c === '\n') fail('Unterminated string');
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\\') {
        out += parseEscape();
        continue;
      }
      out += c;
      i++;
    }
  }

  function parseLiteralString() {
    if (src.startsWith("'''", i)) {
      i += 3;
      if (src[i] === '\n') i++;
      const end = src.indexOf("'''", i);
      if (end < 0) fail('Unterminated string');
      let close = end;
      while (src[close + 3] === "'" && close - end < 2) close++;
      const out = src.slice(i, close);
      i = close + 3;
      return out;
    }
    i++;
    const end = src.indexOf("'", i);
    const newline = src.indexOf('\n', i);
    if (end < 0 || (newline >= 0 && newline < end)) fail('Unterminated string');
    const out = src.slice(i, end);
    i = end + 1;
    return out;
  }

  function parseKeyPart() {
    skipSpaces();
    if (src[i] === '"') return parseBasicString();
    if (src[i] === "'") return parseLiteralString();
    const start = i;
    while (i < src.length && /[A-Za-z0-9_-]/.test(src[i])) i++;
    if (start === i) fail('Expected a key');
    return src.slice(start, i);
  }

  function parseKey() {
    const parts = [parseKeyPart()];
    skipSpaces();
    while (src[i] === '.') {
      i++;
      parts.push(parseKeyPart());
      skipSpaces();
    }
    if (parts.includes('__proto__')) fail('Forbidden key "__proto__"');
    return parts;
  }

  const BARE_VALUE = /[^\s,\]}#]+/y;

  function parseValue() {
    skipSpaces();
    const c = src[i];
    if (c === '"') return parseBasicString();
    if (c === "'") return parseLiteralString();
    if (c === '[') return parseArray();
    if (c === '{') return parseInlineTable();
    BARE_VALUE.lastIndex = i;
    const m = BARE_VALUE.exec(src);
    if (!m) return fail('Expected a value');
    i += m[0].length;
    const token = m[0];
    if (token === 'true') return true;
    if (token === 'false') return false;
    const num = token.replace(/_/g, '');
    if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(num)) return Number(num);
    if (/^0x[0-9a-fA-F]+$/.test(num)) return parseInt(num.slice(2), 16);
    if (/^0o[0-7]+$/.test(num)) return parseInt(num.slice(2), 8);
    if (/^0b[01]+$/.test(num)) return parseInt(num.slice(2), 2);
    if (/^[+-]?inf$/.test(num)) return num.startsWith('-') ? -Infinity : Infinity;
    if (/^[+-]?nan$/.test(num)) return NaN;
    return token; // dates and times
  }

  function parseArray() {
    i++;
    const out = [];
    for (;;) {
      skipBlank();
      if (src[i] === ']') {
        i++;
        return out;
      }
      out.push(parseValue());
      skipBlank();
      if (src[i] === ',') {
        i++;
        continue;
      }
      if (src[i] === ']') {
        i++;
        return out;
      }
      fail('Expected "," or "]" in array');
    }
  }

  function parseInlineTable() {
    i++;
    const out = {};
    for (;;) {
      skipBlank();
      if (src[i] === '}') {
        i++;
        return out;
      }
      const key = parseKey();
      if (src[i] !== '=') fail('Expected "="');
      i++;
      assign(out, key, parseValue());
      skipBlank();
      if (src[i] === ',') {
        i++;
        continue;
      }
      if (src[i] === '}') {
        i++;
        return out;
      }
      fail('Expected "," or "}" in inline table');
    }
  }

  // Walks down `keys` from `base`, creating tables as needed. Arrays of
  // tables resolve to their last element, as in the TOML spec.
  function descend(base, keys) {
    let current = base;
    for (const key of keys) {
      if (!Object.hasOwn(current, key)) current[key] = {};
      current = current[key];
      if (Array.isArray(current)) current = current[current.length - 1];
      if (!current || typeof current !== 'object') fail(`Key "${key}" is not a table`);
    }
    return current;
  }

  function assign(base, keys, value) {
    descend(base, keys.slice(0, -1))[keys[keys.length - 1]] = value;
  }

  for (;;) {
    skipBlank();
    if (i >= src.length) break;
    if (src[i] === '[') {
      const isArrayTable = src[i + 1] === '[';
      i += isArrayTable ? 2 : 1;
      const key = parseKey();
      const close = isArrayTable ? ']]' : ']';
      if (!src.startsWith(close, i)) fail(`Expected "${close}"`);
      i += close.length;
      if (isArrayTable) {
        const parent = descend(root, key.slice(0, -1));
        const last = key[key.length - 1];
        if (!Object.hasOwn(parent, last)) parent[last] = [];
        if (!Array.isArray(parent[last])) fail(`Key "${last}" is not an array of tables`);
        table = {};
        parent[last].push(table);
      } else {
        table = descend(root, key);
      }
    } else {
      const key = parseKey();
      if (src[i] !== '=') fail('Expected "="');
      i++;
      assign(table, key, parseValue());
    }
    skipSpaces();
    skipComment();
    if (i < src.length && src[i] !== '\n') fail('Expected end of line');
  }

  return root;
}
