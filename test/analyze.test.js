import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyzeProject } from '../src/analyze/index.js';
import { makeProject } from './helpers.js';

const techNames = (info) => info.tech.map((t) => t.name);
const codes = (steps) => steps.map((s) => s.code);

describe('Node.js projects', () => {
  test('a pnpm + TypeScript + React app', (t) => {
    const root = makeProject(t, {
      'package.json': {
        name: 'shop-front',
        version: '1.2.0',
        description: 'An online shop front-end',
        private: true,
        license: 'MIT',
        author: 'Jane Doe <jane@example.com> (https://jane.dev)',
        repository: 'github:jane/shop-front',
        homepage: 'https://github.com/jane/shop-front#readme',
        engines: { node: '>=20' },
        scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview', test: 'vitest run', lint: 'eslint .', postinstall: 'husky', prebuild: 'rimraf dist' },
        dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' },
        devDependencies: { vite: '^5.0.0', typescript: '^5.4.0', vitest: '^1.6.0' },
      },
      'pnpm-lock.yaml': '',
      'tsconfig.json': '{}',
      'src/main.tsx': '',
      'node_modules/react/index.js': '',
      'debug.log': '',
      '.gitignore': 'secret-notes.md\n',
      'secret-notes.md': '',
    });
    const info = analyzeProject(root);

    assert.equal(info.name, 'shop-front');
    assert.equal(info.description, 'An online shop front-end');
    assert.equal(info.license, 'MIT');
    assert.deepEqual(info.author, { name: 'Jane Doe', email: 'jane@example.com', url: 'https://jane.dev' });
    assert.equal(info.repository.url, 'https://github.com/jane/shop-front');
    assert.equal(info.homepage, null, 'a homepage pointing at the repository is redundant');
    assert.deepEqual(info.ecosystems, [{ id: 'node', label: 'Node.js', packageManager: 'pnpm' }]);
    assert.deepEqual(codes(info.install), ['pnpm install']);
    assert.deepEqual(codes(info.usage), ['pnpm dev', 'pnpm build\npnpm preview']);
    assert.deepEqual(info.scripts.map((s) => s.name), ['dev', 'build', 'preview', 'test', 'lint']);
    assert.deepEqual(codes(info.tests), ['pnpm test']);
    assert.deepEqual(techNames(info), ['TypeScript', 'Node.js', 'React', 'Vite', 'Vitest']);
    assert.deepEqual(info.requirements.map((r) => [r.name, r.version]), [['Node.js', '>=20'], ['pnpm', null]]);
    assert.equal(info.badges.filter((b) => b.kind === 'registry').length, 0, 'private packages get no npm badge');

    assert.match(info.tree, /src\//);
    assert.doesNotMatch(info.tree, /node_modules|debug\.log|secret-notes/);
  });

  test('a published CLI', (t) => {
    const root = makeProject(t, {
      'package.json': { name: '@acme/greet', version: '2.0.0', bin: { greet: 'bin.js' }, files: ['bin.js'], type: 'module' },
    });
    const info = analyzeProject(root);
    assert.deepEqual(codes(info.usage), ['npm install -g @acme/greet', 'greet --help', 'npx @acme/greet --help']);
    assert.ok(info.badges.some((b) => b.img === 'https://img.shields.io/npm/v/@acme/greet'));
  });

  test('a library gets an import snippet', (t) => {
    const root = makeProject(t, {
      'package.json': { name: 'tiny-date-utils', version: '0.3.0', exports: './index.js', type: 'module' },
    });
    const info = analyzeProject(root);
    assert.deepEqual(codes(info.usage), ['npm install tiny-date-utils', "import tinyDateUtils from 'tiny-date-utils';"]);
  });

  test('ignores the default npm test script', (t) => {
    const root = makeProject(t, {
      'package.json': { name: 'x', scripts: { test: 'echo "Error: no test specified" && exit 1' } },
    });
    const info = analyzeProject(root);
    assert.equal(info.tests.length, 0);
    assert.equal(info.scripts.length, 0);
  });

  test('reports an invalid package.json instead of crashing', (t) => {
    const root = makeProject(t, { 'package.json': '{ "name": ' });
    const info = analyzeProject(root);
    assert.match(info.warnings[0], /package\.json/);
  });
});

describe('Python projects', () => {
  test('a uv + FastAPI project', (t) => {
    const root = makeProject(t, {
      'pyproject.toml': `
[project]
name = "orders-api"
version = "0.4.0"
description = "Order management API"
requires-python = ">=3.11"
dependencies = ["fastapi>=0.110", "uvicorn[standard]", "SQLAlchemy>=2"]

[dependency-groups]
dev = ["pytest>=8"]

[project.urls]
Repository = "https://github.com/acme/orders-api"
`,
      'uv.lock': '',
      'main.py': 'app = None',
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'orders-api');
    assert.equal(info.ecosystems[0].packageManager, 'uv');
    assert.deepEqual(codes(info.install), ['uv sync']);
    assert.deepEqual(codes(info.usage), ['uv run uvicorn main:app --reload']);
    assert.deepEqual(codes(info.tests), ['uv run pytest']);
    assert.deepEqual(techNames(info), ['Python', 'FastAPI', 'SQLAlchemy', 'pytest']);
    assert.equal(info.requirements[0].version, '>=3.11');
    assert.equal(info.repository.url, 'https://github.com/acme/orders-api');
  });

  test('a pip + Django project', (t) => {
    const root = makeProject(t, {
      'requirements.txt': 'Django==5.0.6\npsycopg2-binary  # postgres\n-r extra.txt\n',
      'manage.py': '',
    });
    const info = analyzeProject(root);
    assert.deepEqual(codes(info.install), [
      'python -m venv .venv\nsource .venv/bin/activate  # Windows: .venv\\Scripts\\activate',
      'pip install -r requirements.txt',
    ]);
    assert.deepEqual(codes(info.usage), ['python manage.py migrate', 'python manage.py runserver']);
    assert.ok(techNames(info).includes('Django'));
  });

  test('a tooling-only package.json does not take over a Python project', (t) => {
    const root = makeProject(t, {
      'requirements.txt': 'flask\n',
      'app.py': '',
      'package.json': { name: 'styles', devDependencies: { tailwindcss: '^3.0.0' } },
    });
    const info = analyzeProject(root);
    assert.deepEqual(info.ecosystems.map((e) => e.id), ['python', 'node']);
  });

  test('loose .py files do not add Python to another ecosystem', (t) => {
    const root = makeProject(t, { 'package.json': { name: 'web' }, 'script.py': '' });
    assert.deepEqual(analyzeProject(root).ecosystems.map((e) => e.id), ['node']);
  });
});

describe('Rust and Go projects', () => {
  test('a publishable Rust binary', (t) => {
    const root = makeProject(t, {
      'Cargo.toml': `
[package]
name = "fastgrep"
version = "0.2.1"
description = "A fast grep"
license = "MIT OR Apache-2.0"
rust-version = "1.74"

[dependencies]
clap = { version = "4", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
`,
      'src/main.rs': 'fn main() {}',
    });
    const info = analyzeProject(root);
    assert.deepEqual(codes(info.usage), ['cargo run --release', 'cargo install fastgrep', 'fastgrep --help']);
    assert.deepEqual(codes(info.tests), ['cargo test']);
    assert.ok(info.badges.some((b) => b.link === 'https://crates.io/crates/fastgrep'));
    assert.deepEqual(techNames(info), ['Rust', 'Tokio', 'clap']);
    assert.equal(info.requirements[0].version, '>= 1.74');
  });

  test('a Go application', (t) => {
    const root = makeProject(t, {
      'go.mod': `module github.com/acme/tasks

go 1.22

require (
\tgithub.com/gin-gonic/gin v1.10.0
\tgolang.org/x/net v0.25.0 // indirect
)
`,
      'main.go': 'package main\n\nfunc main() {}\n',
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'tasks');
    assert.equal(info.repository.url, 'https://github.com/acme/tasks');
    assert.deepEqual(codes(info.usage), ['go run .', 'go install github.com/acme/tasks@latest']);
    assert.deepEqual(techNames(info), ['Go', 'Gin']);
  });
});

describe('project-wide detection', () => {
  test('license, CI, Docker, env vars, Makefile and contributing guide', (t) => {
    const root = makeProject(t, {
      LICENSE: 'Apache License\n                           Version 2.0, January 2004\n',
      '.github/workflows/ci.yml': 'name: CI\non: push\n',
      Dockerfile: 'FROM node:22\nEXPOSE 8080\n',
      'docker-compose.yml': 'services: {}\n',
      '.env.example': [
        '# HTTP port',
        'PORT=8080',
        'DATABASE_URL="postgres://localhost/app" # main database',
        '',
        'STRIPE_SECRET_KEY=sk_test_123',
      ].join('\n'),
      Makefile: '.PHONY: build\n## Compile everything\nbuild:\n\tgo build\ndeploy: build ## Ship it\n\t./deploy.sh\nVERSION := 1\n',
      'CONTRIBUTING.md': '# Contributing',
    });
    const info = analyzeProject(root);
    assert.equal(info.license, 'Apache-2.0');
    assert.equal(info.licenseFile, 'LICENSE');
    assert.deepEqual(info.ci.github, [{ file: 'ci.yml', name: 'CI' }]);
    assert.deepEqual(info.docker, { dockerfile: 'Dockerfile', compose: 'docker-compose.yml', port: '8080' });
    assert.deepEqual(info.env.vars, [
      { key: 'PORT', value: '8080', secret: false, description: 'HTTP port' },
      { key: 'DATABASE_URL', value: 'postgres://localhost/app', secret: false, description: 'main database' },
      { key: 'STRIPE_SECRET_KEY', value: '', secret: true, description: null },
    ]);
    assert.deepEqual(info.scripts, [
      { name: 'build', cmd: 'make build', description: 'Compile everything' },
      { name: 'deploy', cmd: 'make deploy', description: 'Ship it' },
    ]);
    assert.equal(info.docs.contributing, 'CONTRIBUTING.md');
    assert.deepEqual(techNames(info), ['Docker', 'GitHub Actions']);
  });

  test('the project tree honors nested .gitignore files and .git/info/exclude', (t) => {
    const root = makeProject(t, {
      '.gitignore': 'secrets/\n',
      '.git/info/exclude': 'local-notes.md\n',
      'local-notes.md': '',
      'secrets/key.pem': '',
      'web/.gitignore': 'generated/\n*.tmp\n!important.tmp\n',
      'web/generated/out.js': '',
      'web/cache.tmp': '',
      'web/important.tmp': '',
      'web/index.js': '',
      'docs/.gitignore': '/drafts\n',
      'docs/drafts/a.md': '',
      'docs/guide.md': '',
    });
    const { tree } = analyzeProject(root, { depth: 3 });
    for (const visible of ['index.js', 'important.tmp', 'guide.md']) assert.ok(tree.includes(visible), visible);
    for (const hidden of ['secrets', 'local-notes', 'generated', 'cache.tmp', 'drafts']) assert.ok(!tree.includes(hidden), hidden);
  });

  test('reads the git remote without leaking credentials', (t) => {
    const root = makeProject(t, {
      '.git/config': '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://bot:ghp_secret@github.com/acme/thing.git\n',
    });
    const info = analyzeProject(root);
    assert.equal(info.repository.url, 'https://github.com/acme/thing');
    assert.ok(!JSON.stringify(info).includes('ghp_secret'));
  });

  test('reuses the description of an existing README', (t) => {
    const root = makeProject(t, {
      'README.md': '# Old title\n\n[![CI](x.svg)](y)\n\n> A **tiny** tool that does [things](https://x.dev).\n\n## Install\n',
    });
    assert.equal(analyzeProject(root).description, 'A tiny tool that does things.');
  });

  test('an empty directory still produces usable data', (t) => {
    const root = makeProject(t, {}, 'empty-project');
    const info = analyzeProject(root);
    assert.equal(info.name, 'empty-project');
    assert.equal(info.description, null);
    assert.deepEqual(info.ecosystems, []);
  });
});
