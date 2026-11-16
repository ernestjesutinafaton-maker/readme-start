/** Returns a trimmed non-empty string, or null for anything else. */
export const str = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Returns the value if it is a plain object, otherwise an empty object. */
export const obj = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Returns the value if it is an array, otherwise an empty array. */
export const arr = (value) => (Array.isArray(value) ? value : []);

export function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Parses a person from a manifest: either an object ({ name, email, url })
 * or the npm/Cargo/Poetry string form "Name <email> (url)".
 */
export function parsePerson(input) {
  if (!input) return null;
  if (typeof input === 'object') {
    const name = str(input.name);
    return name ? { name, email: str(input.email), url: str(input.url) } : null;
  }
  if (typeof input !== 'string') return null;
  const match = /^\s*([^<(]*?)\s*(?:<([^>]*)>)?\s*(?:\(([^)]*)\))?\s*$/.exec(input);
  const name = str(match?.[1]);
  if (!name) return null;
  return { name, email: str(match[2]), url: str(match[3]) };
}

// Default descriptions written by scaffolding tools are not real descriptions.
const SCAFFOLD_DESCRIPTIONS = [/^add your description here\.?$/i, /^a short description\.?$/i];

export function cleanDescription(value) {
  const text = str(value);
  if (!text || SCAFFOLD_DESCRIPTIONS.some((re) => re.test(text))) return null;
  return text;
}
