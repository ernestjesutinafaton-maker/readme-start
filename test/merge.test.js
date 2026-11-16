import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { analyzeProject } from '../src/analyze/index.js';
import { identifySection, planMerge } from '../src/generate/merge.js';
import { generateReadme } from '../src/generate/readme.js';
import { makeProject } from './helpers.js';

const PACKAGE = {
  name: 'notes-app',
  description: 'Take notes',
  license: 'MIT',
  repository: 'github:acme/notes-app',
  scripts: { start: 'node server.js', test: 'node --test' },
  dependencies: { express: '^4.0.0' },
};

function setup(t, extra = {}) {
  const root = makeProject(t, { 'package.json': PACKAGE, 'server.js': '', ...extra });
  const generate = (existing, options = {}) => generateReadme(analyzeProject(root), { existing, ...options });
  return { root, generate };
}

const sectionText = (markdown, title) => {
  const start = markdown.indexOf(`## ${title}`);
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next < 0 ? undefined : next);
};

describe('regenerating a README', () => {
  test('is idempotent', (t) => {
    const { generate } = setup(t, { Dockerfile: 'FROM node\n', '.env.example': 'PORT=3000\n' });
    const first = generate(null).markdown;
    const second = generate(first);
    assert.equal(second.markdown, first);
    assert.deepEqual(second.merge, { source: 'readme-start', custom: [], edited: [], blocks: 0, replaced: [], introReplaced: false, warnings: [] });
  });

  test('keeps your own sections at the same place and lists them in the table of contents', (t) => {
    const { root, generate } = setup(t);
    const first = generate(null).markdown;
    const custom = '## ✨ Features\n\n- Markdown notes\n- Offline mode';
    const edited = first.replace('## 🚀 Usage', `${custom}\n\n## 🚀 Usage`);

    // The project changes: a new script appears.
    writeFileSync(join(root, 'package.json'), JSON.stringify({ ...PACKAGE, scripts: { ...PACKAGE.scripts, lint: 'eslint .' } }));
    const { markdown, merge } = generate(edited);

    assert.deepEqual(merge.custom, ['✨ Features']);
    assert.ok(markdown.includes(`${custom}\n\n## 🚀 Usage`), 'kept before Usage, as in the old file');
    assert.ok(markdown.includes('- [✨ Features](#-features)'), 'listed in the table of contents');
    assert.ok(markdown.includes('`npm run lint`'), 'generated sections are refreshed');
  });

  test('keeps generated sections you edited, unless --reset', (t) => {
    const { generate } = setup(t);
    const first = generate(null).markdown;
    const usage = sectionText(first, '🚀 Usage');
    const edited = first.replace(usage, '## 🚀 Usage\n\nRun `npm start` and open http://localhost:3000.\n\n');

    const kept = generate(edited);
    assert.deepEqual(kept.merge.edited, ['usage']);
    assert.ok(kept.markdown.includes('open http://localhost:3000.'));
    assert.equal(kept.markdown.match(/## 🚀 Usage/g).length, 1);

    // Still recognized as edited on the next run.
    assert.deepEqual(generate(kept.markdown).merge.edited, ['usage']);

    const reset = generate(edited, { reset: true });
    assert.ok(!reset.markdown.includes('localhost:3000'));
    assert.equal(reset.markdown, first);
  });

  test('keeps an edited title and description', (t) => {
    const { generate } = setup(t);
    const first = generate(null).markdown;
    const edited = first.replace('Take notes', 'Take notes, fast. ![demo](demo.gif)');
    const { markdown, merge } = generate(edited);
    assert.deepEqual(merge.edited, ['header']);
    assert.ok(markdown.startsWith('<div align="center">\n\n# notes-app\n\nTake notes, fast. ![demo](demo.gif)'));
  });

  test('keep blocks inside a generated section survive while the section is refreshed', (t) => {
    const { root, generate } = setup(t);
    const first = generate(null).markdown;
    const block = '<!-- readme-start:keep -->\n> On Windows, run the terminal as administrator.\n<!-- readme-start:end -->';
    const edited = first.replace('## 🧪 Running tests', `${block}\n\n## 🧪 Running tests`);

    writeFileSync(join(root, 'package.json'), JSON.stringify({ ...PACKAGE, scripts: { ...PACKAGE.scripts, dev: 'node --watch server.js' } }));
    const { markdown, merge } = generate(edited);
    assert.equal(merge.blocks, 1);
    assert.deepEqual(merge.edited, [], 'adding a keep block is not an edit');
    assert.ok(markdown.includes(`${block}\n\n## 🧪 Running tests`));
    assert.ok(markdown.includes('`npm run dev`'));
  });

  test('a keep block containing a generated heading replaces that section', (t) => {
    const { generate } = setup(t);
    const first = generate(null).markdown;
    const license = sectionText(first, '📄 License');
    const block = '<!-- readme-start:keep -->\n## 📄 License\n\nMIT for code, CC-BY for docs.\n<!-- readme-start:end -->\n\n';
    const { markdown } = generate(first.replace(license, block));
    assert.ok(markdown.includes('MIT for code, CC-BY for docs.'));
    assert.ok(!markdown.includes('Distributed under'));
    assert.equal(markdown.match(/## 📄 License/g).length, 1);
  });

  test('kept content follows the closest section when its anchor disappears', (t) => {
    const { root, generate } = setup(t, { Dockerfile: 'FROM node\n' });
    const first = generate(null).markdown;
    const edited = first.replace('## 📁 Project structure', '## Deployment\n\nShip it.\n\n## 📁 Project structure');
    rmSync(join(root, 'Dockerfile')); // no longer a Docker project: "Deployment" loses its anchor
    const { markdown } = generate(edited);
    assert.ok(!markdown.includes('## 🐳 Docker'));
    assert.match(markdown, /## 🧪 Running tests[\s\S]*## Deployment\n\nShip it\.\n\n## 📁 Project structure/);
  });

  test('ignores markers inside code blocks and warns about unclosed blocks', (t) => {
    const { generate } = setup(t);
    const first = generate(null).markdown;
    const doc = '## Markers\n\n```md\n<!-- readme-start:keep -->\n## Not a heading\n```\n';
    const withDoc = first.replace('## 🚀 Usage', `${doc}\n## 🚀 Usage`);
    const { markdown, merge } = generate(withDoc);
    assert.deepEqual(merge.custom, ['Markers']);
    assert.equal(merge.blocks, 0);
    assert.ok(!markdown.includes('[Not a heading]'));

    const unclosed = generate(first.replace('## 🚀 Usage', '<!-- readme-start:keep -->\nkept\n\n## 🚀 Usage'));
    assert.equal(unclosed.merge.warnings.length, 1);
    assert.equal(unclosed.markdown.match(/Generated with readme-start/g).length, 1, 'the footer is not duplicated');
  });
});

describe('merging a hand-written README', () => {
  const HANDWRITTEN = [
    '# Notes',
    '',
    'My notes app.',
    '',
    '## Features',
    '',
    '- Fast',
    '',
    '## Getting started',
    '',
    'npm i',
    '',
    '<!-- readme-start:keep -->',
    '![screenshot](shot.png)',
    '<!-- readme-start:end -->',
    '',
    '## Licence',
    '',
    'MIT',
    '',
    '## Credits',
    '',
    'Thanks!',
  ].join('\n');

  test('replaces the standard sections and keeps the rest', (t) => {
    const { generate } = setup(t);
    const { markdown, merge } = generate(HANDWRITTEN);
    assert.equal(merge.source, 'other');
    assert.equal(merge.introReplaced, true);
    assert.deepEqual(merge.replaced, ['Getting started', 'Licence']);
    assert.deepEqual(merge.custom, ['Features', 'Credits']);
    assert.equal(merge.blocks, 1);

    assert.ok(!markdown.includes('## Getting started'));
    assert.ok(markdown.includes('## Features\n\n- Fast'));
    assert.ok(markdown.includes('## Credits\n\nThanks!'));
    assert.ok(markdown.includes('![screenshot](shot.png)'));
    assert.match(markdown, /## Features[\s\S]*## 🧰 Tech stack/, 'Features stays right after the introduction');
  });

  test('recognizes titles in any language, with or without emoji', () => {
    assert.equal(identifySection('🚀 Usage'), 'usage');
    assert.equal(identifySection('Utilisation'), 'usage');
    assert.equal(identifySection('Prerequis'), 'prerequisites');
    assert.equal(identifySection('Getting started'), null);
    assert.equal(identifySection('Getting started', { synonyms: true }), 'installation');
    assert.equal(identifySection('Features', { synonyms: true }), null);
  });

  test('a keep block with a title replaces the generated header', () => {
    const { items } = planMerge('<!-- readme-start:keep -->\n# My title\n\n<img src="logo.svg">\n<!-- readme-start:end -->\n');
    assert.deepEqual(items.map((i) => [i.anchor, i.replaces]), [['start', ['header']]]);
  });
});
