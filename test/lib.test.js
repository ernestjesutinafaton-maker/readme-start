import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { badgeText, staticBadge } from '../src/lib/badges.js';
import { createIgnore, createMatcher } from '../src/lib/gitignore.js';
import { at, child, parseXml, textOf } from '../src/lib/xml.js';
import { parseRepository } from '../src/lib/repository.js';
import { parseToml } from '../src/lib/toml.js';
import { parsePerson } from '../src/lib/util.js';
import { codeBlock, slugify } from '../src/generate/markdown.js';

describe('parseToml', () => {
  test('reads a typical pyproject.toml', () => {
    const doc = parseToml(`
# comment
[project]
name = "my-app"            # trailing comment
version = '1.0.0'
description = """
A multi-line
description"""
requires-python = ">=3.11"
authors = [{ name = "Ada", email = "ada@example.com" }]
dependencies = [
  "fastapi>=0.110",   # web
  "uvicorn[standard]",
]

[project.scripts]
my-app = "my_app.cli:main"

[tool.pytest.ini_options]
addopts = "-q"
`);
    assert.equal(doc.project.name, 'my-app');
    assert.equal(doc.project.version, '1.0.0');
    assert.equal(doc.project.description, 'A multi-line\ndescription');
    assert.deepEqual(doc.project.authors, [{ name: 'Ada', email: 'ada@example.com' }]);
    assert.deepEqual(doc.project.dependencies, ['fastapi>=0.110', 'uvicorn[standard]']);
    assert.equal(doc.project.scripts['my-app'], 'my_app.cli:main');
    assert.equal(doc.tool.pytest.ini_options.addopts, '-q');
  });

  test('reads a typical Cargo.toml', () => {
    const doc = parseToml(`
[package]
name = "fastgrep"
edition = "2021"
publish = false

[dependencies]
clap = { version = "4", features = ["derive"] }
serde.workspace = true

[[bin]]
name = "fg"

[[bin]]
name = "fg-server"
`);
    assert.equal(doc.package.publish, false);
    assert.deepEqual(doc.dependencies.clap, { version: '4', features: ['derive'] });
    assert.deepEqual(doc.dependencies.serde, { workspace: true });
    assert.deepEqual(doc.bin.map((b) => b.name), ['fg', 'fg-server']);
  });

  test('handles escapes, literals, numbers and quoted keys', () => {
    const doc = parseToml(String.raw`
a = "tab\there \u00e9"
b = 'C:\no\escape'
c = 1_000
d = -3.5e2
e = 0xff
"quoted.key" = true
f = 1979-05-27
`);
    assert.equal(doc.a, 'tab\there é');
    assert.equal(doc.b, 'C:\\no\\escape');
    assert.equal(doc.c, 1000);
    assert.equal(doc.d, -350);
    assert.equal(doc.e, 255);
    assert.equal(doc['quoted.key'], true);
    assert.equal(doc.f, '1979-05-27');
  });

  test('reports the line of syntax errors', () => {
    assert.throws(() => parseToml('a = "ok"\nb = "unterminated\n'), /line 2/);
  });
});

describe('parseRepository', () => {
  const cases = [
    ['github:acme/tool', 'https://github.com/acme/tool'],
    ['acme/tool', 'https://github.com/acme/tool'],
    ['gitlab:acme/tool', 'https://gitlab.com/acme/tool'],
    ['git+https://github.com/acme/tool.git', 'https://github.com/acme/tool'],
    ['git@github.com:acme/tool.git', 'https://github.com/acme/tool'],
    ['ssh://git@github.com/acme/tool.git', 'https://github.com/acme/tool'],
    ['https://gitlab.com/group/sub/tool', 'https://gitlab.com/group/sub/tool'],
  ];
  for (const [input, expected] of cases) {
    test(input, () => assert.equal(parseRepository(input)?.url, expected));
  }

  test('accepts the npm object form', () => {
    assert.deepEqual(parseRepository({ type: 'git', url: 'https://github.com/acme/tool.git' }), {
      host: 'github.com',
      owner: 'acme',
      repo: 'tool',
      url: 'https://github.com/acme/tool',
    });
  });

  test('drops credentials embedded in URLs', () => {
    const repo = parseRepository('https://user:ghp_s3cret@github.com/acme/tool.git');
    assert.equal(repo.url, 'https://github.com/acme/tool');
    assert.ok(!JSON.stringify(repo).includes('s3cret'));
  });

  test('rejects local paths and garbage', () => {
    assert.equal(parseRepository('file:///tmp/repo'), null);
    assert.equal(parseRepository('not a url'), null);
    assert.equal(parseRepository(null), null);
  });
});

describe('createIgnore', () => {
  const ignored = createIgnore(['# comment', 'dist/', '*.log', '!keep.log', '/secret.txt', 'docs/**/*.tmp', '**/cache']);
  test('matches directory-only patterns', () => {
    assert.ok(ignored('dist', true));
    assert.ok(!ignored('dist', false));
  });
  test('matches globs at any level and negations', () => {
    assert.ok(ignored('src/debug.log', false));
    assert.ok(!ignored('keep.log', false));
  });
  test('anchors patterns containing a slash', () => {
    assert.ok(ignored('secret.txt', false));
    assert.ok(!ignored('src/secret.txt', false));
    assert.ok(ignored('docs/a/b/c.tmp', false));
    assert.ok(ignored('a/b/cache', true));
  });
});

describe('parseXml', () => {
  test('reads elements, attributes, entities and CDATA', () => {
    const doc = parseXml(`<?xml version="1.0"?>
<!-- comment -->
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <Description>Fish &amp; chips &#233;</Description>
    <Notes><![CDATA[<raw> text]]></Notes>
    <Empty />
  </PropertyGroup>
</Project>`);
    const project = child(doc, 'Project');
    assert.equal(project.attrs.Sdk, 'Microsoft.NET.Sdk.Web');
    assert.equal(textOf(at(project, 'PropertyGroup', 'Description')), 'Fish & chips é');
    assert.equal(textOf(at(project, 'PropertyGroup', 'Notes')), '<raw> text');
    assert.equal(textOf(at(project, 'PropertyGroup', 'Empty')), null);
  });

  test('tolerates mismatched tags', () => {
    const doc = parseXml('<a><b>1</c></b><d>2</d></a>');
    assert.equal(textOf(at(doc, 'a', 'd')), '2');
  });
});

describe('createMatcher', () => {
  test('returns undefined when no rule applies, so that .gitignore files can be layered', () => {
    const match = createMatcher(['*.log', '!keep.log']);
    assert.equal(match('a.log', false), true);
    assert.equal(match('keep.log', false), false);
    assert.equal(match('a.txt', false), undefined);
  });
});

describe('helpers', () => {
  test('parsePerson reads the "Name <email> (url)" form', () => {
    assert.deepEqual(parsePerson('Jane Doe <jane@example.com> (https://jane.dev)'), {
      name: 'Jane Doe',
      email: 'jane@example.com',
      url: 'https://jane.dev',
    });
    assert.deepEqual(parsePerson({ name: 'Bob' }), { name: 'Bob', email: null, url: null });
    assert.equal(parsePerson(''), null);
  });

  test('slugify matches GitHub anchors', () => {
    assert.equal(slugify('📦 Installation'), '-installation');
    assert.equal(slugify('✅ Prérequis'), '-prérequis');
    assert.equal(slugify('Running tests'), 'running-tests');
  });

  test('codeBlock picks a fence longer than inner backticks', () => {
    assert.equal(codeBlock('a ``` b', 'md'), '````md\na ``` b\n````');
  });

  test('static badges escape dashes, underscores and symbols', () => {
    assert.equal(badgeText('a-b_c >=1'), 'a--b__c%20%3E%3D1');
    assert.equal(
      staticBadge('node', '>=20', '5FA04E', { logo: 'nodedotjs' }),
      'https://img.shields.io/badge/node-%3E%3D20-5FA04E?logo=nodedotjs&logoColor=white',
    );
  });
});
