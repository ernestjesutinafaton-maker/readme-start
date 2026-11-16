/**
 * Same anchors as GitHub: lowercase, punctuation and emoji removed, spaces
 * turned into hyphens. "📦 Installation" -> "-installation".
 */
export const slugify = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');

/** Fenced code block whose fence is longer than any backtick run inside. */
export function codeBlock(code, lang = 'bash') {
  const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${lang}\n${code}\n${fence}`;
}

export const indent = (text, spaces) =>
  text
    .split('\n')
    .map((line) => (line ? ' '.repeat(spaces) + line : line))
    .join('\n');

export const escapeCell = (text) => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export const escapeHtml = (text) => String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline code span that survives backticks in the content. */
export const inlineCode = (text) => {
  const value = String(text);
  return value.includes('`') ? `\`\` ${value} \`\`` : `\`${value}\``;
};

export const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
