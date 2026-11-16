import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeProject } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/readme-start.js', import.meta.url));
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const cli = (args, cwd) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

const project = (t) => makeProject(t, { 'package.json': { name: 'cli-demo', description: 'Demo project' } });

describe('readme-start CLI', () => {
  test('--stdout prints the README and writes nothing', (t) => {
    const root = project(t);
    const result = cli(['--stdout'], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# cli-demo/);
    assert.throws(() => readFileSync(join(root, 'README.md')));
  });

  test('writes README.md in the target directory', (t) => {
    const root = project(t);
    const result = cli([root, '--lang', 'fr'], process.cwd());
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(root, 'README.md'), 'utf8'), /## Sommaire/);
    assert.match(result.stderr, /generated/);
  });

  test('never overwrites a README without --force', (t) => {
    const root = project(t);
    writeFileSync(join(root, 'README.md'), 'hand-written');
    const refused = cli([], root);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /--force/);
    assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), 'hand-written');

    const forced = cli(['--force'], root);
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(readFileSync(join(root, 'README.md'), 'utf8'), /# cli-demo/);
  });

  test('updates its own README without --force and keeps your sections', (t) => {
    const root = project(t);
    assert.equal(cli([], root).status, 0);
    const readme = join(root, 'README.md');
    writeFileSync(readme, readFileSync(readme, 'utf8').replace('## 🤝 Contributing', '## ❓ FAQ\n\nAsk away.\n\n## 🤝 Contributing'));

    const result = cli([], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /updated/);
    assert.match(result.stderr, /FAQ \(your sections\)/);
    assert.match(readFileSync(readme, 'utf8'), /## ❓ FAQ\n\nAsk away\./);
  });

  test('explains what would change in a hand-written README', (t) => {
    const root = project(t);
    writeFileSync(join(root, 'README.md'), '# Demo\n\nIntro.\n\n## Install\n\nnpm i\n\n## Screenshots\n\n![x](x.png)\n');
    const result = cli([], root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Replaced\s+introduction, Install/);
    assert.match(result.stderr, /Kept\s+Screenshots/);
    assert.match(result.stderr, /readme-start:keep/);
  });

  test('--output writes elsewhere and creates folders', (t) => {
    const root = project(t);
    const result = cli(['-o', 'docs/README.generated.md'], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(root, 'docs', 'README.generated.md'), 'utf8'), /# cli-demo/);
  });

  test('rejects invalid options with exit code 2', (t) => {
    const root = project(t);
    assert.equal(cli(['--lang', 'klingon'], root).status, 2);
    assert.equal(cli(['--depth', 'deep'], root).status, 2);
    assert.equal(cli(['--unknown'], root).status, 2);
    assert.equal(cli(['a', 'b'], root).status, 2);
  });

  test('fails cleanly on a missing directory', (t) => {
    const root = project(t);
    const result = cli(['does-not-exist'], root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a directory/);
  });

  test('--help and --version', () => {
    assert.match(cli(['--help']).stdout, /Usage/);
    assert.equal(cli(['--version']).stdout.trim(), VERSION);
  });
});
