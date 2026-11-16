import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyzeProject } from '../src/analyze/index.js';
import { parsePnpmWorkspace } from '../src/analyze/ecosystems/node.js';
import { generateReadme } from '../src/generate/readme.js';
import { makeProject } from './helpers.js';

describe('monorepos', () => {
  test('a pnpm + Turborepo monorepo lists its packages and their stack', (t) => {
    const root = makeProject(t, {
      'package.json': { name: 'acme', private: true, scripts: { build: 'turbo run build', dev: 'turbo run dev' }, devDependencies: { turbo: '^2.0.0' } },
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - \"packages/*\" # shared code\n  - '!packages/legacy'\n",
      'pnpm-lock.yaml': '',
      'turbo.json': '{}',
      'apps/web/package.json': { name: 'web', description: 'Customer website', dependencies: { next: '15.0.0', react: '19.0.0' } },
      'apps/api/package.json': { name: 'api', description: 'REST API', dependencies: { fastify: '^5.0.0' } },
      'packages/ui/package.json': { name: '@acme/ui', description: 'Design system' },
      'packages/legacy/package.json': { name: 'legacy' },
      'packages/notes/README.md': 'not a package',
    });
    const info = analyzeProject(root);
    assert.equal(info.workspace.tool, 'pnpm workspaces');
    assert.deepEqual(info.workspace.packages.map((p) => [p.name, p.path]), [
      ['api', 'apps/api'],
      ['web', 'apps/web'],
      ['@acme/ui', 'packages/ui'],
    ]);
    assert.equal(info.workspace.example, 'pnpm --filter api build');
    for (const name of ['Turborepo', 'Next.js', 'React', 'Fastify']) assert.ok(info.tech.some((x) => x.name === name), name);

    const { markdown } = generateReadme(info);
    assert.ok(markdown.includes('## 🧩 Packages'));
    assert.ok(markdown.includes('This repository is a monorepo managed with pnpm workspaces.'));
    assert.ok(markdown.includes('| [web](apps/web) | Customer website |'));
    assert.ok(markdown.includes('pnpm --filter api build'));
  });

  test('npm workspaces declared in package.json', (t) => {
    const root = makeProject(t, {
      'package.json': { name: 'root', private: true, workspaces: ['packages/*'] },
      'packages/a/package.json': { name: 'a' },
    });
    const info = analyzeProject(root);
    assert.equal(info.workspace.tool, 'npm workspaces');
    assert.equal(info.workspace.example, 'npm run build --workspace=a');
  });

  test('a Cargo workspace', (t) => {
    const root = makeProject(t, {
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\nexclude = ["crates/scratch"]\n',
      'crates/core/Cargo.toml': '[package]\nname = "acme-core"\ndescription = "Core types"\n',
      'crates/cli/Cargo.toml': '[package]\nname = "acme-cli"\n\n[dependencies]\nclap = "4"\n',
      'crates/scratch/Cargo.toml': '[package]\nname = "scratch"\n',
    });
    const info = analyzeProject(root);
    assert.deepEqual(info.workspace.packages.map((p) => p.name), ['acme-cli', 'acme-core']);
    assert.deepEqual(info.install.map((s) => s.code), ['cargo build --workspace --release']);
    assert.deepEqual(info.tests.map((s) => s.code), ['cargo test --workspace']);
    assert.ok(info.tech.some((x) => x.name === 'clap'));
  });

  test('a Go workspace without a root module', (t) => {
    const root = makeProject(t, {
      'go.work': 'go 1.22\n\nuse (\n\t./api\n\t./worker\n)\n',
      'api/go.mod': 'module github.com/acme/api\n\ngo 1.22\n',
      'worker/go.mod': 'module github.com/acme/worker\n\ngo 1.22\n',
    });
    const info = analyzeProject(root);
    assert.deepEqual(info.workspace.packages.map((p) => [p.name, p.path]), [['api', 'api'], ['worker', 'worker']]);
    assert.deepEqual(info.tests.map((s) => s.code), ['go test ./api/... ./worker/...']);
  });

  test('Maven modules', (t) => {
    const root = makeProject(t, {
      'pom.xml': '<project><groupId>com.acme</groupId><artifactId>platform</artifactId><version>1.0</version><packaging>pom</packaging><modules><module>billing</module><module>users</module></modules></project>',
      'billing/pom.xml': '<project><artifactId>billing</artifactId><description>Invoices</description></project>',
      'users/pom.xml': '<project><artifactId>users</artifactId></project>',
    });
    const info = analyzeProject(root);
    assert.equal(info.workspace.tool, 'Maven modules');
    assert.deepEqual(info.workspace.packages.map((p) => [p.name, p.description]), [['billing', 'Invoices'], ['users', null]]);
    assert.equal(info.workspace.example, 'mvn -pl billing -am package');
  });

  test('parses pnpm-workspace.yaml in block and flow style', () => {
    assert.deepEqual(parsePnpmWorkspace('packages:\n  - apps/*\n  # comment\n  - "libs/**"\ncatalog:\n  react: 19\n'), ['apps/*', 'libs/**']);
    assert.deepEqual(parsePnpmWorkspace("packages: ['a/*', 'b']\n"), ['a/*', 'b']);
  });
});
