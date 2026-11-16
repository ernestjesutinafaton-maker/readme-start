/**
 * Merging a freshly generated README with the one already on disk.
 *
 * Rules, in short:
 * - readme-start owns the sections it generates and refreshes them.
 * - Your own sections (any "## Title" readme-start does not generate) are kept,
 *   at the same place.
 * - Anything between <!-- readme-start:keep --> and <!-- readme-start:end --> is
 *   kept verbatim. If the block contains a "## Title" readme-start generates,
 *   your block replaces that section. If it contains a "# Title", it replaces
 *   the title and description.
 * - A generated section you edited by hand is detected with the checksums
 *   stored in the footer and kept as is (unless `reset` is set).
 *
 * Kept content is anchored to the generated section it followed, so it comes
 * back at the same place even when other sections appear or disappear. A keep
 * block inside a generated section remembers the paragraphs around it and
 * comes back between them.
 */
import { SECTION_ORDER, SECTION_SYNONYMS, STRINGS } from './i18n.js';

/** Every place kept content can be attached to, in document order. */
export const SLOTS = ['start', 'header', 'toc', ...SECTION_ORDER];

// "readme-gen" was the working name of the tool: its markers are still read.
const KEEP_START = /<!--\s*readme-(?:start|gen):keep\s*-->/i;
const KEEP_END = /<!--\s*readme-(?:start|gen):end\s*-->/i;
const FOOTER = /^\s*<!--\s*Generated with readme-(?:start|gen)/i;
const GENERATED = /<!--\s*Generated with readme-(?:start|gen)/i;
const CHECKSUMS = /readme-(?:start|gen):checksums([^>]*?)-->/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const H2 = /^##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const H1 = /^#[ \t]+\S/;

export const FOOTER_TEXT = 'Generated with readme-start. Sections you add or edit are kept when it runs again.';

const closesFence = (line, fence) => new RegExp(`^\\s{0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(line);

/** Lower-case, no accents, no emoji or punctuation: "✅ Prérequis" -> "prerequis". */
export function normalizeTitle(title) {
  return title
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildIndex(withSynonyms) {
  const index = new Map();
  for (const dict of Object.values(STRINGS)) {
    index.set(normalizeTitle(dict.toc), 'toc');
    for (const [id, title] of Object.entries(dict.sections)) index.set(normalizeTitle(title), id);
  }
  if (withSynonyms) {
    for (const [id, titles] of Object.entries(SECTION_SYNONYMS)) {
      for (const title of titles) if (!index.has(normalizeTitle(title))) index.set(normalizeTitle(title), id);
    }
  }
  return index;
}
const EXACT_TITLES = buildIndex(false);
const ALL_TITLES = buildIndex(true);

/** Section id for a heading readme-start generates, or null for your own sections. */
export function identifySection(title, { synonyms = false } = {}) {
  return (synonyms ? ALL_TITLES : EXACT_TITLES).get(normalizeTitle(title)) ?? null;
}

/**
 * Text compared by checksums: line endings, trailing spaces, blank edges and
 * repeated blank lines do not count (removing a keep block leaves an extra
 * blank line behind).
 */
export function normalizeBlock(text) {
  const lines = String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line || (i > 0 && all[i - 1]));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}

/**
 * Splits lines into markdown blocks separated by blank lines (code blocks
 * stay whole). Each block is { start, end, raw, text } with `end` exclusive.
 */
export function splitBlocks(lines) {
  const blocks = [];
  let start = null;
  let fence = null;
  const close = (end) => {
    if (start === null) return;
    const raw = lines.slice(start, end).join('\n');
    blocks.push({ start, end, raw, text: normalizeBlock(raw) });
    start = null;
  };
  lines.forEach((line, i) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      return;
    }
    if (!line.trim()) {
      close(i);
      return;
    }
    if (start === null) start = i;
    const open = FENCE.exec(line);
    if (open) fence = open[1];
  });
  close(lines.length);
  return blocks;
}

/**
 * Puts keep blocks back inside a freshly generated section, after the block
 * that preceded them (or before the one that followed them). Returns the new
 * text and the blocks that could not be placed.
 */
export function placeInside(text, items) {
  const blocks = splitBlocks(text.split('\n'));
  const after = new Map();
  const leftovers = [];
  for (const item of items) {
    let position = item.before == null ? -1 : blocks.findIndex((b) => b.text === item.before);
    if (position < 0 && item.after != null) {
      const next = blocks.findIndex((b) => b.text === item.after);
      if (next >= 0) position = Math.max(next - 1, 0);
    }
    if (position < 0) {
      leftovers.push(item);
      continue;
    }
    if (!after.has(position)) after.set(position, []);
    after.get(position).push(item.text);
  }
  if (!after.size) return { text, leftovers };
  const parts = blocks.flatMap((block, i) => [block.raw, ...(after.get(i) ?? [])]);
  return { text: parts.join('\n\n'), leftovers };
}

/** For each keep token of a region: the generated blocks right before and after it. */
function surroundings(prefixLines, tokens) {
  const lines = [...prefixLines];
  const marks = [];
  for (const token of tokens) {
    if (token.type === 'keep') marks.push({ token, at: lines.length });
    else lines.push(token.text);
  }
  const blocks = splitBlocks(lines);
  return marks.map(({ token, at }) => ({
    token,
    before: blocks.filter((b) => b.end <= at).pop()?.text ?? null,
    after: blocks.find((b) => b.start >= at)?.text ?? null,
  }));
}

/** FNV-1a, 8 hex characters. Only used to notice hand edits, not for security. */
export function checksum(text) {
  const source = normalizeBlock(text);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function renderFooter(checksums) {
  const entries = Object.entries(checksums).map(([id, sum]) => `${id}=${sum}`);
  return `<!-- ${FOOTER_TEXT}\nreadme-start:checksums ${entries.join(' ')} -->`;
}

function parseChecksums(source) {
  const match = CHECKSUMS.exec(source);
  if (!match) return null;
  return new Map([...match[1].matchAll(/([\w-]+)=([0-9a-f]{8})/g)].map((m) => [m[1], m[2]]));
}

/** "## " headings outside code blocks, in order. */
export function extractHeadings(text) {
  const headings = [];
  let fence = null;
  for (const line of text.split('\n')) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const open = FENCE.exec(line);
    if (open) {
      fence = open[1];
      continue;
    }
    const heading = H2.exec(line);
    if (heading) headings.push(heading[1]);
  }
  return headings;
}

function keepToken(lines) {
  const text = lines.join('\n');
  let h1 = false;
  let fence = null;
  for (const line of lines) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const open = FENCE.exec(line);
    if (open) fence = open[1];
    else if (H1.test(line)) h1 = true;
  }
  return { type: 'keep', text, headings: extractHeadings(text), h1 };
}

/** Splits a README into lines, "## " headings and keep blocks, ignoring code blocks and the footer. */
function tokenize(source) {
  const lines = source.split('\n');
  const tokens = [];
  const warnings = [];
  let fence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      tokens.push({ type: 'line', text: line });
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const open = FENCE.exec(line);
    if (open) {
      fence = open[1];
      tokens.push({ type: 'line', text: line });
      continue;
    }
    if (FOOTER.test(line)) {
      while (i < lines.length && !lines[i].includes('-->')) i++;
      continue;
    }
    const start = KEEP_START.exec(line);
    if (start) {
      const block = [line];
      let closed = KEEP_END.test(line.slice(start.index + start[0].length));
      let inner = null;
      let j = i;
      while (!closed && j + 1 < lines.length) {
        const next = lines[j + 1];
        if (!inner && FOOTER.test(next)) break; // never swallow the footer
        j++;
        block.push(next);
        if (inner) {
          if (closesFence(next, inner)) inner = null;
          continue;
        }
        const innerOpen = FENCE.exec(next);
        if (innerOpen) inner = innerOpen[1];
        else if (KEEP_END.test(next)) closed = true;
      }
      if (!closed) warnings.push('A <!-- readme-start:keep --> block has no <!-- readme-start:end -->: it was kept up to the end of the file.');
      tokens.push(keepToken(block));
      i = j;
      continue;
    }
    const heading = H2.exec(line);
    if (heading) tokens.push({ type: 'heading', text: line, title: heading[1] });
    else tokens.push({ type: 'line', text: line });
  }
  return { tokens, warnings };
}

const joinTokens = (tokens) => tokens.map((t) => t.text).join('\n');
const displayTitle = (title) => title.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();

/**
 * Works out what to keep from an existing README.
 * Returns { items, report, warnings } where each item is
 * { anchor, replaces: [slot ids], text } plus, for keep blocks found inside a
 * generated section, { inside, before, after } to put them back in place.
 */
export function planMerge(markdown, { reset = false } = {}) {
  const source = String(markdown).replace(/\r\n?/g, '\n');
  const fromReadmeGen = GENERATED.test(source);
  const checksums = fromReadmeGen ? parseChecksums(source) : null;
  // Checksums tell untouched generated sections apart from edited ones.
  const trusted = !reset && checksums !== null;
  // On a hand-written README, "## Install" should replace our Installation.
  const synonyms = !fromReadmeGen;
  const { tokens, warnings } = tokenize(source);

  const regions = [{ kind: 'header', tokens: [] }];
  for (const token of tokens) {
    if (token.type === 'heading') regions.push({ kind: 'section', heading: token, tokens: [] });
    else if (token.type === 'keep' && token.headings.length) regions.push({ kind: 'block', block: token, tokens: [] });
    else regions[regions.length - 1].tokens.push(token);
  }

  const items = [];
  const report = { source: fromReadmeGen ? 'readme-start' : 'other', custom: [], edited: [], blocks: 0, replaced: [], introReplaced: false };
  const keep = (anchor, token) => {
    items.push({ anchor: token.h1 ? 'start' : anchor, replaces: token.h1 ? ['header'] : [], text: token.text });
    report.blocks++;
  };
  // Keep blocks inside a generated slot remember their neighbours.
  const keepInside = (slot, prefixLines, tokens) => {
    for (const { token, before, after } of surroundings(prefixLines, tokens)) {
      if (token.h1) keep(slot, token);
      else {
        items.push({ anchor: slot, inside: slot, before, after, replaces: [], text: token.text });
        report.blocks++;
      }
    }
  };

  // Title, description and badges: everything before the first "## ".
  const [header, ...sections] = regions;
  const headerText = joinTokens(header.tokens.filter((t) => t.type === 'line'));
  if (trusted && normalizeBlock(headerText) && checksums.get('header') !== checksum(headerText)) {
    items.push({ anchor: 'start', replaces: ['header'], text: joinTokens(header.tokens) });
    report.edited.push('header');
  } else {
    keepInside('header', [], header.tokens);
    if (!fromReadmeGen && normalizeBlock(headerText)) report.introReplaced = true;
  }

  let anchor = 'header';
  for (const region of sections) {
    if (region.kind === 'block') {
      const ids = region.block.headings.map((h) => identifySection(h, { synonyms })).filter(Boolean);
      items.push({
        anchor: region.block.h1 ? 'start' : anchor,
        replaces: [...ids, ...(region.block.h1 ? ['header'] : [])],
        text: joinTokens([region.block, ...region.tokens]),
      });
      report.blocks++;
      if (ids.length) anchor = ids[ids.length - 1];
      continue;
    }

    const title = region.heading.title;
    const id = identifySection(title, { synonyms });
    if (!id) {
      items.push({ anchor, replaces: [], text: joinTokens([region.heading, ...region.tokens]) });
      report.custom.push(displayTitle(title));
      continue;
    }
    if (id === 'toc') {
      for (const token of region.tokens) if (token.type === 'keep') keep('toc', token);
      anchor = 'toc';
      continue;
    }
    const generatedPart = joinTokens([region.heading, ...region.tokens.filter((t) => t.type === 'line')]);
    if (trusted && checksums.get(id) !== checksum(generatedPart)) {
      items.push({ anchor, replaces: [id], text: joinTokens([region.heading, ...region.tokens]) });
      report.edited.push(id);
    } else {
      keepInside(id, [region.heading.text], region.tokens);
      if (!fromReadmeGen) report.replaced.push(displayTitle(title));
    }
    anchor = id;
  }

  return { items, report, warnings };
}
