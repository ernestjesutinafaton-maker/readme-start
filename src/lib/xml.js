const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

function parseAttributes(source) {
  const attrs = {};
  for (const m of source.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = decode(m[2] ?? m[3]);
  return attrs;
}

// comment | CDATA | processing instruction | doctype | closing tag | opening tag | text | stray "<"
const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/\s*([^\s>]+)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|</g;

/**
 * Tiny non-validating XML parser for build files (pom.xml, *.csproj).
 * Every element is { name, attrs, children, text }. Mismatched closing tags
 * are tolerated so that a slightly broken file still yields its metadata.
 */
export function parseXml(input) {
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  for (const m of String(input).replace(/^﻿/, '').matchAll(TOKEN)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      top.text += m[1];
    } else if (m[2]) {
      let index = stack.length - 1;
      while (index > 0 && stack[index].name !== m[2]) index--;
      if (index > 0) stack.length = index;
    } else if (m[3]) {
      const element = { name: m[3], attrs: parseAttributes(m[4] ?? ''), children: [], text: '' };
      top.children.push(element);
      if (!m[5]) stack.push(element);
    } else if (m[6]) {
      top.text += decode(m[6]);
    }
  }
  return root;
}

export const child = (element, name) => element?.children.find((c) => c.name === name) ?? null;
export const children = (element, name) => element?.children.filter((c) => c.name === name) ?? [];
export const textOf = (element) => element?.text.trim() || null;
/** Follows a chain of child element names: at(project, 'scm', 'url'). */
export const at = (element, ...names) => names.reduce((current, name) => child(current, name), element);
