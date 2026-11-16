import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyzeProject } from '../src/analyze/index.js';
import { gradleIncludes } from '../src/analyze/ecosystems/java.js';
import { rubyString } from '../src/analyze/ecosystems/ruby.js';
import { generateReadme } from '../src/generate/readme.js';
import { parseYaml } from '../src/lib/yaml.js';
import { makeProject } from './helpers.js';

const techNames = (info) => info.tech.map((t) => t.name);
const codes = (steps) => steps.map((s) => s.code);
const GIT_REMOTE = '[remote "origin"]\n\turl = git@github.com:acme/project.git\n';

describe('Swift projects', () => {
  test('a Vapor server built with SwiftPM', (t) => {
    const root = makeProject(t, {
      'Package.swift': [
        '// swift-tools-version:5.9',
        'import PackageDescription',
        'let package = Package(',
        '    name: "TodoAPI",',
        '    platforms: [.macOS(.v13)],',
        '    dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.89.0")],',
        '    targets: [.executableTarget(name: "App", dependencies: [.product(name: "Vapor", package: "vapor")])]',
        ')',
      ].join('\n'),
      'Tests/AppTests/AppTests.swift': '',
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'TodoAPI');
    assert.deepEqual(codes(info.install), ['swift build']);
    assert.deepEqual(codes(info.usage), ['swift run App']);
    assert.deepEqual(codes(info.tests), ['swift test']);
    assert.deepEqual(info.requirements.map((r) => [r.name, r.version]), [['Swift', '>= 5.9']]);
    assert.deepEqual(techNames(info), ['Swift', 'Vapor']);
  });

  test('a SwiftPM library gets a snippet with the git remote and latest tag', (t) => {
    const root = makeProject(t, {
      'Package.swift': '// swift-tools-version:5.10\nlet package = Package(name: "Toast", platforms: [.iOS(.v16)], products: [.library(name: "Toast", targets: ["Toast"])])',
      '.git/config': GIT_REMOTE,
      '.git/packed-refs': '# pack-refs\nabc123 refs/tags/v1.2.0\ndef456 refs/tags/v1.10.0\n',
      '.git/refs/tags/v0.9.0': '',
    });
    const info = analyzeProject(root);
    assert.equal(info.usage[0].code, '.package(url: "https://github.com/acme/project.git", from: "1.10.0"),\n\n// in your target:\n.product(name: "Toast", package: "project")');
    assert.ok(info.requirements.some((r) => r.name === 'Xcode'), 'iOS packages need Xcode');
    assert.ok(techNames(info).includes('iOS'));
  });

  test('an iOS app with CocoaPods', (t) => {
    const root = makeProject(t, { 'Weather.xcodeproj/project.pbxproj': '', Podfile: "platform :ios, '16.0'\npod 'Alamofire'\n" });
    const info = analyzeProject(root);
    assert.equal(info.name, 'Weather');
    assert.deepEqual(codes(info.install), ['pod install']);
    assert.deepEqual(codes(info.usage), ['open Weather.xcworkspace']);
    assert.deepEqual(techNames(info), ['Swift', 'iOS', 'CocoaPods', 'Alamofire']);
  });
});

describe('Dart and Flutter projects', () => {
  test('a Flutter app', (t) => {
    const root = makeProject(t, {
      'pubspec.yaml': [
        'name: weather_app',
        'description: >-',
        '  Forecasts at a glance,',
        '  for every city.',
        'publish_to: none',
        'version: 1.4.0+12',
        'environment:',
        '  sdk: ">=3.3.0 <4.0.0"',
        'dependencies:',
        '  flutter:',
        '    sdk: flutter',
        '  flutter_riverpod: ^2.5.1',
        '  firebase_core: ^3.0.0',
        'dev_dependencies:',
        '  flutter_test:',
        '    sdk: flutter',
      ].join('\n'),
      'lib/main.dart': '',
      'android/build.gradle': '',
      'ios/Runner.xcodeproj/project.pbxproj': '',
      'web/index.html': '',
    });
    const info = analyzeProject(root);
    assert.deepEqual(info.ecosystems.map((e) => e.label), ['Flutter'], 'platform folders are not separate projects');
    assert.equal(info.description, 'Forecasts at a glance, for every city.');
    assert.equal(info.version, '1.4.0+12');
    assert.deepEqual(codes(info.install), ['flutter pub get']);
    assert.deepEqual(codes(info.usage), ['flutter run', 'flutter build apk\nflutter build ios\nflutter build web']);
    assert.deepEqual(codes(info.tests), ['flutter test']);
    assert.deepEqual(techNames(info), ['Dart', 'Flutter', 'Firebase', 'Riverpod']);
    assert.equal(info.badges.filter((b) => b.kind === 'registry').length, 0, 'publish_to: none');
  });

  test('a published Dart package and a Melos monorepo', (t) => {
    const root = makeProject(t, {
      'pubspec.yaml': 'name: acme_workspace\nenvironment:\n  sdk: ^3.4.0\ndev_dependencies:\n  melos: ^6.0.0\n',
      'melos.yaml': 'name: acme\npackages:\n  - packages/**\n',
      'packages/slugify/pubspec.yaml': 'name: slugify\ndescription: Turns titles into slugs.\nversion: 2.0.0\n',
      'packages/slugify/lib/slugify.dart': '',
    });
    const info = analyzeProject(root);
    assert.equal(info.workspace.tool, 'Melos');
    assert.deepEqual(info.workspace.packages.map((p) => [p.name, p.description]), [['slugify', 'Turns titles into slugs.']]);
    assert.equal(info.workspace.example, 'melos exec --scope=slugify -- dart test');
  });
});

describe('Elixir projects', () => {
  test('a Phoenix application', (t) => {
    const root = makeProject(t, {
      'mix.exs': [
        'defmodule Shop.MixProject do',
        '  use Mix.Project',
        '  @version "0.3.0"',
        '  def project do',
        '    [app: :shop, version: @version, elixir: "~> 1.16", deps: deps(), aliases: aliases()]',
        '  end',
        '  defp deps do',
        '    [',
        '      {:phoenix, "~> 1.7.14"},',
        '      {:phoenix_live_view, "~> 1.0"},',
        '      {:ecto_sql, "~> 3.10"},',
        '      {:postgrex, ">= 0.0.0"}',
        '    ]',
        '  end',
        '  defp aliases do',
        '    [setup: ["deps.get", "ecto.setup"]]',
        '  end',
        'end',
      ].join('\n'),
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'shop');
    assert.equal(info.version, '0.3.0');
    assert.deepEqual(codes(info.usage), ['mix setup', 'mix phx.server']);
    assert.deepEqual(codes(info.tests), ['mix test']);
    assert.deepEqual(techNames(info), ['Elixir', 'Phoenix', 'Phoenix LiveView', 'Ecto', 'PostgreSQL']);
    assert.equal(info.requirements[0].version, '~> 1.16');
  });

  test('a Hex library with a heredoc description', (t) => {
    const root = makeProject(t, {
      'mix.exs': 'defmodule Slug.MixProject do\n  def project do\n    [app: :slug, version: "1.2.3", elixir: "~> 1.15", description: description(), package: package(), source_url: "https://github.com/acme/slug"]\n  end\n  defp description do\n    """\n    Slugs for Elixir.\n    """\n  end\n  defp package, do: [licenses: ["Apache-2.0"]]\nend\n',
    });
    const info = analyzeProject(root);
    assert.equal(info.description, 'Slugs for Elixir.');
    assert.equal(info.license, 'Apache-2.0');
    assert.deepEqual(codes(info.usage), ['{:slug, "~> 1.2"}']);
    assert.ok(info.badges.some((b) => b.link === 'https://hex.pm/packages/slug'));
  });
});

describe('C and C++ projects', () => {
  test('a CMake project with vcpkg, sub-folders and tests', (t) => {
    const root = makeProject(t, {
      'CMakeLists.txt': [
        'cmake_minimum_required(VERSION 3.21)',
        'project(raytracer VERSION 0.4.0 DESCRIPTION "A tiny ray tracer" LANGUAGES CXX)',
        'set(CMAKE_CXX_STANDARD 20)',
        '# add_executable(commented_out main.cpp)',
        'find_package(SDL2 CONFIG REQUIRED)',
        'add_subdirectory(src)',
        'enable_testing()',
      ].join('\n'),
      'src/CMakeLists.txt': 'add_executable(raytracer main.cpp)\ntarget_link_libraries(raytracer PRIVATE SDL2::SDL2)\n',
      'vcpkg.json': { name: 'raytracer', dependencies: ['sdl2', { name: 'gtest' }] },
    });
    const info = analyzeProject(root);
    assert.equal(info.ecosystems[0].label, 'C++');
    assert.equal(info.description, 'A tiny ray tracer');
    assert.equal(info.version, '0.4.0');
    assert.deepEqual(codes(info.install), [
      'cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"\ncmake --build build --config Release',
    ]);
    assert.deepEqual(codes(info.usage), ['./build/src/raytracer']);
    assert.deepEqual(codes(info.tests), ['ctest --test-dir build --output-on-failure']);
    assert.deepEqual(info.requirements.map((r) => [r.name, r.version]), [['CMake', '>= 3.21'], ['GCC, Clang or MSVC', 'C++20'], ['vcpkg', null]]);
    assert.deepEqual(techNames(info), ['C++', 'CMake', 'vcpkg', 'SDL', 'GoogleTest']);
  });

  test('a CMake library with presets gets a FetchContent snippet', (t) => {
    const root = makeProject(t, {
      'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)\nproject(tinyjson LANGUAGES C)\nadd_library(tinyjson src/tinyjson.c)\n',
      'CMakePresets.json': { version: 6, configurePresets: [{ name: 'base', hidden: true }, { name: 'release', binaryDir: '${sourceDir}/out/${presetName}' }] },
      '.git/config': GIT_REMOTE,
    });
    const info = analyzeProject(root);
    assert.equal(info.ecosystems[0].label, 'C');
    assert.deepEqual(codes(info.install), ['cmake --preset release\ncmake --build --preset release']);
    assert.match(info.usage[0].code, /GIT_REPOSITORY https:\/\/github\.com\/acme\/project\.git\n {2}GIT_TAG main/);
    assert.match(info.usage[0].code, /target_link_libraries\(your_target PRIVATE tinyjson\)/);
  });

  test('a Meson project and a plain Makefile project', (t) => {
    const mesonRoot = makeProject(t, {
      'meson.build': "project('calc', 'cpp', version: '1.0.0', default_options: ['cpp_std=c++17'])\nexecutable('calc', 'main.cpp')\ntest('basic', exe)\n",
    });
    const meson = analyzeProject(mesonRoot);
    assert.deepEqual(codes(meson.install), ['meson setup build\nmeson compile -C build']);
    assert.deepEqual(codes(meson.usage), ['./build/calc']);
    assert.deepEqual(codes(meson.tests), ['meson test -C build']);

    const makeRoot = makeProject(t, { Makefile: 'all:\n\tcc -o tool main.c\ncheck:\n\t./run-tests.sh\n', 'main.c': '' });
    const make = analyzeProject(makeRoot);
    assert.equal(make.ecosystems[0].label, 'C');
    assert.deepEqual(codes(make.install), ['make']);
    assert.deepEqual(codes(make.tests), ['make check']);
  });
});

describe('details that used to be missed', () => {
  test('gems: heredoc descriptions and VERSION constants', (t) => {
    const root = makeProject(t, {
      'fancy-logger.gemspec': [
        'require_relative "lib/fancy/logger/version"',
        'Gem::Specification.new do |spec|',
        '  spec.name = "fancy-logger"',
        '  spec.version = Fancy::Logger::VERSION',
        '  spec.summary = %q{Colorful logs}',
        '  spec.description = <<~DESC',
        '    Colorful, structured logs',
        '    for Ruby applications.',
        '  DESC',
        '  spec.license = "MIT"',
        'end',
      ].join('\n'),
      'lib/fancy/logger/version.rb': 'module Fancy\n  module Logger\n    VERSION = "2.4.1"\n  end\nend\n',
    });
    const info = analyzeProject(root);
    assert.equal(info.version, '2.4.1');
    assert.equal(info.description, 'Colorful logs');
    assert.equal(rubyString('<<~DESC\n  One\n  two.\nDESC\n'), 'One two.');
    assert.equal(rubyString('Foo::VERSION'), null);
  });

  test('Gradle: multi-line includes and custom project folders', () => {
    const settings = [
      'rootProject.name = "shop"',
      'include(',
      '    ":app",',
      '    ":libs:core", // shared code',
      ')',
      "include ':feature-a',",
      "        ':feature-b'",
      'project(":libs:core").projectDir = file("modules/core")',
      'includeBuild("build-logic")',
    ].join('\n');
    assert.deepEqual(gradleIncludes(settings), ['app', 'modules/core', 'feature-a', 'feature-b']);
  });

  test('YAML: block scalars, flow collections, comments and sequences of mappings', () => {
    assert.deepEqual(
      parseYaml('a: 1.10 # comment\nb: "x # not a comment"\nc: |\n  one\n  two\nd: [x, "y", {k: v}]\ne:\n- name: n\n  on: true\n- plain\n'),
      { a: '1.10', b: 'x # not a comment', c: 'one\ntwo\n', d: ['x', 'y', { k: 'v' }], e: [{ name: 'n', on: true }, 'plain'] },
    );
  });

  test('keep blocks come back between the same paragraphs, even in the header', (t) => {
    const root = makeProject(t, {
      'package.json': { name: 'notes', description: 'Take notes', scripts: { start: 'node app.js' }, dependencies: { express: '^4.0.0' } },
      'app.js': '',
    });
    const generate = (existing) => generateReadme(analyzeProject(root), { existing });
    const first = generate(null).markdown;
    const demo = '<!-- readme-start:keep -->\n![demo](demo.gif)\n<!-- readme-start:end -->';
    const note = '<!-- readme-start:keep -->\n> Use Node 22 on Apple Silicon.\n<!-- readme-start:end -->';
    const edited = first
      .replace('Take notes\n', `Take notes\n\n${demo}\n`)
      .replace('2. Install the dependencies', `${note}\n\n2. Install the dependencies`);

    const second = generate(edited);
    assert.deepEqual(second.merge.edited, []);
    assert.ok(second.markdown.includes(`# notes\n\nTake notes\n\n${demo}\n\n</div>`), 'inside the centered header');
    assert.ok(second.markdown.includes(`cd demo-project\n   \`\`\`\n\n${note}\n\n2. Install the dependencies`), 'between steps 1 and 2');
    assert.equal(generate(second.markdown).markdown, second.markdown, 'stable on the next run');
  });
});
