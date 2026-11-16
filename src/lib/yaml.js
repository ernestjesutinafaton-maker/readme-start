/**
 * Small YAML reader for manifests such as pubspec.yaml or melos.yaml: block
 * mappings and sequences, plain / quoted / block scalars (| and >), flow
 * collections ([a, b], {a: b}) and comments. Plain scalars stay strings
 * (versions like 1.10 must not become numbers), except true, false and null.
 * Anchors, tags and multi-document streams are not supported.
 */
export function parseYaml(input) {
  const lines = String(input).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  const indentOf = (line) => /^ */.exec(line)[0].length;
  const isBlank = (line) => !line.trim() || /^\s*#/.test(line) || /^(---|\.\.\.)\s*$/.test(line);
  const isItem = (text) => /^-(\s|$)/.test(text);
  const skipBlank = () => {
    while (i < lines.length && isBlank(lines[i])) i++;
  };

  function node(minIndent) {
    skipBlank();
    if (i >= lines.length) return null;
    const indent = indentOf(lines[i]);
    if (indent < minIndent) return null;
    const text = lines[i].slice(indent);
    if (isItem(text)) return sequence(indent);
    if (keyOf(text)) return mapping(indent);
    i++;
    return inlineValue(stripComment(text).trim(), indent);
  }

  function mapping(indent) {
    const result = {};
    for (;;) {
      skipBlank();
      if (i >= lines.length || indentOf(lines[i]) !== indent) break;
      const entry = keyOf(lines[i].slice(indent));
      if (!entry) break;
      i++;
      if (entry.key === '__proto__') continue;
      result[entry.key] = valueAfterKey(entry.rest, indent);
    }
    return result;
  }

  function sequence(indent) {
    const result = [];
    for (;;) {
      skipBlank();
      if (i >= lines.length || indentOf(lines[i]) !== indent || !isItem(lines[i].slice(indent))) break;
      const after = lines[i].slice(indent + 1);
      const rest = after.trimStart();
      const itemIndent = indent + 1 + (after.length - rest.length);
      if (!rest || rest.startsWith('#')) {
        i++;
        result.push(node(indent + 1));
      } else if (keyOf(rest)) {
        // "- key: value" starts a mapping whose keys are aligned on "key".
        lines[i] = ' '.repeat(itemIndent) + rest;
        result.push(mapping(itemIndent));
      } else {
        i++;
        result.push(inlineValue(stripComment(rest).trim(), indent));
      }
    }
    return result;
  }

  function valueAfterKey(rest, indent) {
    const value = stripComment(rest).trim();
    if (value) return inlineValue(value, indent);
    skipBlank();
    if (i < lines.length) {
      const next = indentOf(lines[i]);
      if (next > indent) return node(next);
      // A sequence may sit at the same indentation as its key.
      if (next === indent && isItem(lines[i].slice(next))) return sequence(indent);
    }
    return null;
  }

  function inlineValue(value, indent) {
    if (/^[|>][+-]?\d*$/.test(value)) return blockScalar(value, indent);
    if (value.startsWith('[') || value.startsWith('{')) {
      let text = value;
      while (!balanced(text) && i < lines.length) text += ` ${stripComment(lines[i++]).trim()}`;
      return flow(text);
    }
    if (value.startsWith('"') || value.startsWith("'")) return scalar(value);
    // Plain scalars may continue on more indented lines.
    let text = value;
    while (i < lines.length && !isBlank(lines[i]) && indentOf(lines[i]) > indent) {
      const next = lines[i].trim();
      if (keyOf(next) || isItem(next)) break;
      text += ` ${stripComment(next).trim()}`;
      i++;
    }
    return scalar(text);
  }

  function blockScalar(header, indent) {
    const folded = header[0] === '>';
    const keepTrailing = header.includes('+');
    const strip = header.includes('-');
    const body = [];
    let blockIndent = null;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        body.push('');
        i++;
        continue;
      }
      const current = indentOf(line);
      if (current <= indent || (blockIndent !== null && current < blockIndent)) break;
      blockIndent ??= current;
      body.push(line.slice(blockIndent));
      i++;
    }
    let trailing = 0;
    while (body.length && body[body.length - 1] === '') {
      body.pop();
      trailing++;
    }
    let text = folded
      ? body.reduce((out, line, n) => {
          if (n === 0) return line;
          if (!line) return `${out}\n`;
          return out.endsWith('\n') || /^\s/.test(line) ? `${out}${line}` : `${out} ${line}`;
        }, '')
      : body.join('\n');
    if (!strip) text += keepTrailing ? '\n'.repeat(trailing + 1) : '\n';
    return text;
  }

  return node(0);
}

/** Splits "key: rest" (plain or quoted key). Returns null when the text is not a mapping entry. */
function keyOf(text) {
  const quoted = /^(["'])(.*?)\1\s*:(?:\s+(.*)|$)/.exec(text);
  if (quoted) return { key: quoted[2], rest: quoted[3] ?? '' };
  const plain = /^([^\s#'"[\]{},&*!|>%@`-][^#]*?|-[^\s#][^#]*?)\s*:(?:\s+(.*)|$)/.exec(text);
  return plain ? { key: plain[1], rest: plain[2] ?? '' } : null;
}

function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text;
}

function balanced(text) {
  let depth = 0;
  let quote = null;
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
  }
  return depth <= 0;
}

function scalar(raw) {
  const text = raw.trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length > 1) return text.slice(1, -1).replace(/''/g, "'");
  if (/^(true|True|TRUE)$/.test(text)) return true;
  if (/^(false|False|FALSE)$/.test(text)) return false;
  if (/^(null|Null|NULL|~)?$/.test(text)) return null;
  return text;
}

/** Flow collections: [a, "b", {c: d}]. */
function flow(text) {
  let i = 0;
  const skip = () => {
    while (/\s/.test(text[i] ?? '')) i++;
  };
  function value() {
    skip();
    if (text[i] === '[') {
      i++;
      const list = [];
      for (;;) {
        skip();
        if (text[i] === ']' || i >= text.length) {
          i++;
          return list;
        }
        list.push(value());
        skip();
        if (text[i] === ',') i++;
      }
    }
    if (text[i] === '{') {
      i++;
      const map = {};
      for (;;) {
        skip();
        if (text[i] === '}' || i >= text.length) {
          i++;
          return map;
        }
        const key = String(atom(true));
        skip();
        if (text[i] === ':') i++;
        const item = value();
        if (key !== '__proto__') map[key] = item;
        skip();
        if (text[i] === ',') i++;
      }
    }
    return atom(false);
  }
  function atom(isKey) {
    skip();
    const quote = text[i];
    if (quote === '"' || quote === "'") {
      const end = text.indexOf(quote, i + 1);
      const raw = text.slice(i, end < 0 ? text.length : end + 1);
      i = end < 0 ? text.length : end + 1;
      return scalar(raw);
    }
    const stop = isKey ? /[:,\]}]/ : /[,\]}]/;
    const start = i;
    while (i < text.length && !stop.test(text[i])) i++;
    return scalar(text.slice(start, i));
  }
  return value();
}
