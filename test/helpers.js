import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Creates a throwaway project directory for a test and removes it afterwards.
 * `files` maps relative paths to contents; objects are written as JSON.
 */
export function makeProject(t, files, name = 'demo-project') {
  const base = mkdtempSync(join(tmpdir(), 'readme-start-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, name);
  mkdirSync(root);
  for (const [path, content] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}
