import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyzeProject } from '../src/analyze/index.js';
import { generateReadme } from '../src/generate/readme.js';
import { makeProject } from './helpers.js';

function fullProject(t) {
  return makeProject(t, {
    'package.json': {
      name: 'shop-api',
      version: '1.0.0',
      description: 'REST API for <the> shop',
      license: 'MIT',
      author: { name: 'Jane Doe', url: 'https://jane.dev' },
      repository: { type: 'git', url: 'git+https://github.com/jane/shop-api.git' },
      engines: { node: '>=20' },
      scripts: { start: 'node server.js', dev: 'node --watch server.js', test: 'node --test', 'db:seed': 'node scripts/seed.js | tee seed.log' },
      dependencies: { express: '^4.19.0' },
    },
    'package-lock.json': '{}',
    'server.js': '',
    LICENSE: 'MIT License\n',
    '.github/workflows/test.yml': 'name: Tests\n',
    Dockerfile: 'FROM node:22\nEXPOSE 3000\n',
    '.env.example': '# Server port\nPORT=3000\nJWT_SECRET=change-me\n',
  });
}

describe('generateReadme', () => {
  test('renders every section with working anchors', (t) => {
    const { markdown, sections } = generateReadme(analyzeProject(fullProject(t)));

    assert.match(markdown, /^<div align="center">\n\n# shop-api\n\nREST API for &lt;the&gt; shop/);
    assert.deepEqual(sections, [
      'Tech stack', 'Prerequisites', 'Installation', 'Usage', 'Configuration',
      'Available scripts', 'Running tests', 'Docker', 'Project structure', 'Contributing', 'License', 'Author',
    ]);
    // Every table-of-contents link points at an existing heading.
    const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    for (const [, title, anchor] of markdown.matchAll(/^- \[(.+)\]\(#(.+)\)$/gm)) {
      assert.ok(headings.includes(title), `missing heading for ${title}`);
      assert.equal(anchor, title.toLowerCase().replace(/[^\p{L}\p{N}\- ]/gu, '').replace(/ /g, '-'));
    }

    assert.ok(markdown.includes('[![Tests](https://github.com/jane/shop-api/actions/workflows/test.yml/badge.svg)](https://github.com/jane/shop-api/actions/workflows/test.yml)'));
    assert.ok(markdown.includes('[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)'));
    assert.ok(markdown.includes('git clone https://github.com/jane/shop-api.git\n   cd shop-api'));
    assert.ok(markdown.includes('cp .env.example .env'));
    assert.ok(markdown.includes('| `PORT` | Server port | `3000` |'));
    assert.ok(markdown.includes('| `JWT_SECRET` | — | — |'));
    assert.ok(!markdown.includes('change-me'), 'secret values are never copied');
    assert.ok(markdown.includes('| `npm run db:seed` | Runs `node scripts/seed.js \\| tee seed.log` |'));
    assert.ok(markdown.includes('docker run -p 3000:3000 --env-file .env shop-api'));
    assert.ok(markdown.includes('[Open an issue](https://github.com/jane/shop-api/issues)'));
    assert.ok(markdown.includes('Distributed under the **MIT** license. See [`LICENSE`](LICENSE) for more information.'));
    assert.ok(markdown.includes('**[Jane Doe](https://jane.dev)**'));
  });

  test('speaks French', (t) => {
    const { markdown } = generateReadme(analyzeProject(fullProject(t)), { lang: 'fr' });
    assert.ok(markdown.includes('## Sommaire'));
    assert.ok(markdown.includes('- [✅ Prérequis](#-prérequis)'));
    assert.ok(markdown.includes('1. Cloner le dépôt'));
    assert.ok(markdown.includes('Distribué sous licence **MIT**.'));
    assert.ok(markdown.includes('Lancer les tests :'));
  });

  test('options remove badges, table of contents, tree and emojis', (t) => {
    const info = analyzeProject(fullProject(t));
    const { markdown } = generateReadme(info, { badges: false, toc: false, tree: false, emoji: false });
    assert.ok(!markdown.includes('[!['));
    assert.ok(!markdown.includes('Table of contents'));
    assert.ok(!markdown.includes('Project structure'));
    assert.ok(markdown.includes('## Installation'));
  });

  test('uses placeholders when information is missing', (t) => {
    const { markdown, sections } = generateReadme(analyzeProject(makeProject(t, {}, 'bare')));
    assert.ok(markdown.includes('_Add a short description of your project here._'));
    assert.ok(markdown.includes('_Explain how to use the project here._'));
    assert.ok(markdown.includes('git clone <repository-url>\n   cd bare'));
    assert.ok(!sections.includes('License'));
  });

  test('labels steps when several ecosystems are present', (t) => {
    const root = makeProject(t, {
      'package.json': { name: 'front', scripts: { dev: 'vite' }, dependencies: { vue: '^3.4.0' } },
      'requirements.txt': 'flask\n',
      'app.py': '',
    });
    const { markdown } = generateReadme(analyzeProject(root));
    assert.ok(markdown.includes('Install the dependencies (Node.js)'));
    assert.ok(markdown.includes('Install the dependencies (Python)'));
    assert.ok(markdown.includes('### Node.js'));
    assert.ok(markdown.includes('### Python'));
  });
});
