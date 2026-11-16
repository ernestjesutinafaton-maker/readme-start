import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyzeProject } from '../src/analyze/index.js';
import { makeProject } from './helpers.js';

const techNames = (info) => info.tech.map((t) => t.name);
const codes = (steps) => steps.map((s) => s.code);

describe('PHP projects', () => {
  test('a Laravel application, with its Vite front-end second', (t) => {
    const root = makeProject(t, {
      'composer.json': {
        name: 'acme/shop',
        type: 'project',
        description: 'Online shop',
        license: 'MIT',
        require: { php: '^8.2', 'laravel/framework': '^11.0', 'livewire/livewire': '^3.0' },
        'require-dev': { 'pestphp/pest': '^2.0' },
        scripts: { 'post-autoload-dump': ['@php artisan package:discover'], lint: 'pint' },
      },
      artisan: '',
      'package.json': { private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build' }, devDependencies: { vite: '^5.0.0' } },
    });
    const info = analyzeProject(root);
    assert.deepEqual(info.ecosystems.map((e) => e.id), ['php', 'node']);
    assert.equal(info.name, 'acme/shop');
    assert.deepEqual(codes(info.usage.filter((u) => u.eco === 'PHP')), ['php artisan key:generate', 'php artisan migrate', 'php artisan serve']);
    assert.deepEqual(codes(info.tests.filter((s) => s.eco === 'PHP')), ['php artisan test']);
    assert.deepEqual(info.scripts.filter((s) => s.cmd.startsWith('composer')).map((s) => s.cmd), ['composer lint']);
    assert.ok(techNames(info).includes('Laravel'));
    assert.ok(info.requirements.some((r) => r.name === 'PHP' && r.version === '^8.2'));
    assert.equal(info.badges.filter((b) => b.kind === 'registry').length, 0, 'projects are not published on Packagist');
  });

  test('a published library', (t) => {
    const root = makeProject(t, {
      'composer.json': { name: 'acme/slugger', description: 'Slugs for humans', require: { php: '>=8.1' }, 'require-dev': { 'phpunit/phpunit': '^10' } },
    });
    const info = analyzeProject(root);
    assert.deepEqual(codes(info.usage), ['composer require acme/slugger']);
    assert.deepEqual(codes(info.tests), ['vendor/bin/phpunit']);
    assert.ok(info.badges.some((b) => b.link === 'https://packagist.org/packages/acme/slugger'));
  });
});

describe('Ruby projects', () => {
  test('a Rails application', (t) => {
    const root = makeProject(t, {
      Gemfile: 'source "https://rubygems.org"\nruby "3.3.0"\ngem "rails", "~> 7.1"\ngem "pg"\ngem "turbo-rails"\ngroup :test do\n  gem "rspec-rails"\nend\n',
      'bin/rails': '',
      'bin/dev': '',
      'config/application.rb': 'module Blog; end',
    });
    const info = analyzeProject(root);
    assert.deepEqual(codes(info.install), ['bundle install']);
    assert.deepEqual(codes(info.usage), ['bin/rails db:prepare', 'bin/dev']);
    assert.deepEqual(codes(info.tests), ['bundle exec rspec']);
    assert.deepEqual(techNames(info), ['Ruby', 'Ruby on Rails', 'Hotwire', 'PostgreSQL', 'RSpec']);
    assert.equal(info.requirements[0].version, '3.3.0');
  });

  test('a gem with an executable', (t) => {
    const root = makeProject(t, {
      'fancy-logger.gemspec': [
        'Gem::Specification.new do |spec|',
        '  spec.name = "fancy-logger"',
        '  spec.version = FancyLogger::VERSION',
        '  spec.summary = "Colorful logs"',
        '  spec.authors = ["Ada Lovelace"]',
        '  spec.license = "MIT"',
        '  spec.required_ruby_version = ">= 3.1"',
        '  spec.metadata["source_code_uri"] = "https://github.com/acme/fancy-logger"',
        '  spec.executables = ["flog"]',
        'end',
      ].join('\n'),
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'fancy-logger');
    assert.equal(info.description, 'Colorful logs');
    assert.equal(info.version, null, 'computed versions are not guessed');
    assert.equal(info.repository.url, 'https://github.com/acme/fancy-logger');
    assert.deepEqual(codes(info.usage), ['gem install fancy-logger', 'flog --help']);
    assert.ok(info.badges.some((b) => b.link === 'https://rubygems.org/gems/fancy-logger'));
  });
});

describe('Java projects', () => {
  test('a Spring Boot application built with Maven', (t) => {
    const root = makeProject(t, {
      'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
  </parent>
  <groupId>com.acme</groupId>
  <artifactId>orders</artifactId>
  <version>1.0.0</version>
  <name>\${project.artifactId}</name>
  <description>Orders &amp; invoices service</description>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId></dependency>
  </dependencies>
</project>`,
      mvnw: '',
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'orders');
    assert.equal(info.version, '1.0.0', 'the parent version is not used');
    assert.equal(info.description, 'Orders & invoices service');
    assert.deepEqual(codes(info.usage), ['./mvnw spring-boot:run']);
    assert.deepEqual(codes(info.tests), ['./mvnw test']);
    assert.deepEqual(info.requirements.map((r) => [r.name, r.version]), [['JDK', '>= 21']]);
    assert.deepEqual(techNames(info), ['Java', 'Apache Maven', 'Spring Boot', 'PostgreSQL']);
  });

  test('a Kotlin Android app built with Gradle', (t) => {
    const root = makeProject(t, {
      'settings.gradle.kts': 'rootProject.name = "Weather"\ninclude(":app")\n',
      'build.gradle.kts': 'plugins {\n  alias(libs.plugins.android.application) apply false\n}\n',
      'gradle/libs.versions.toml': '[plugins]\nandroid-application = { id = "com.android.application", version = "8.5.0" }\nkotlin-android = { id = "org.jetbrains.kotlin.android", version = "2.0.0" }\n\n[libraries]\ncompose-ui = { module = "androidx.compose.ui:ui" }\n',
      'app/build.gradle.kts': '',
      gradlew: '',
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'Weather');
    assert.equal(info.ecosystems[0].label, 'Kotlin');
    assert.deepEqual(codes(info.usage), ['./gradlew assembleDebug', './gradlew installDebug']);
    assert.ok(info.requirements.some((r) => r.name === 'Android Studio'));
    assert.deepEqual(techNames(info), ['Kotlin', 'Gradle', 'Android', 'Jetpack Compose']);
  });
});

describe('.NET projects', () => {
  test('a solution with a web API, a library and tests', (t) => {
    const csproj = (sdk, props = '', refs = '') =>
      `<Project Sdk="${sdk}">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n${props}  </PropertyGroup>\n  <ItemGroup>${refs}</ItemGroup>\n</Project>`;
    const root = makeProject(t, {
      'Shop.sln': [
        'Microsoft Visual Studio Solution File, Format Version 12.00',
        'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Shop.Api", "src\\Shop.Api\\Shop.Api.csproj", "{1}"',
        'EndProject',
        'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Shop.Core", "src\\Shop.Core\\Shop.Core.csproj", "{2}"',
        'EndProject',
        'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Shop.Tests", "tests\\Shop.Tests\\Shop.Tests.csproj", "{3}"',
        'EndProject',
      ].join('\r\n'),
      'src/Shop.Api/Shop.Api.csproj': csproj('Microsoft.NET.Sdk.Web', '    <Description>Shop HTTP API</Description>\n', '<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.0" />'),
      'src/Shop.Core/Shop.Core.csproj': csproj('Microsoft.NET.Sdk', '    <Description>Domain model</Description>\n'),
      'tests/Shop.Tests/Shop.Tests.csproj': csproj('Microsoft.NET.Sdk', '', '<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" /><PackageReference Include="xunit" Version="2.9.0" />'),
    });
    const info = analyzeProject(root);
    assert.equal(info.name, 'Shop');
    assert.deepEqual(codes(info.usage), ['dotnet run --project src/Shop.Api', 'dotnet watch --project src/Shop.Api']);
    assert.deepEqual(codes(info.tests), ['dotnet test']);
    assert.deepEqual(info.requirements.map((r) => [r.name, r.version]), [['.NET SDK', '>= 8.0']]);
    assert.deepEqual(techNames(info), ['C#', '.NET', 'ASP.NET Core', 'Entity Framework Core', 'xUnit']);
    assert.equal(info.workspace.tool, '.NET solution');
    assert.deepEqual(info.workspace.packages.map((p) => [p.name, p.path, p.description]), [
      ['Shop.Api', 'src/Shop.Api', 'Shop HTTP API'],
      ['Shop.Core', 'src/Shop.Core', 'Domain model'],
      ['Shop.Tests', 'tests/Shop.Tests', null],
    ]);
  });

  test('a published .NET tool', (t) => {
    const root = makeProject(t, {
      'Formatter.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net9.0</TargetFramework><PackAsTool>true</PackAsTool><ToolCommandName>fmt</ToolCommandName><PackageId>Acme.Formatter</PackageId><Description>Formats things</Description></PropertyGroup></Project>',
    });
    const info = analyzeProject(root);
    assert.deepEqual(codes(info.usage), ['dotnet tool install --global Acme.Formatter', 'fmt --help']);
    assert.ok(info.badges.some((b) => b.link === 'https://www.nuget.org/packages/Acme.Formatter'));
    assert.equal(info.workspace, null);
  });
});
