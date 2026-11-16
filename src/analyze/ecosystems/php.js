import { shields, staticBadge } from '../../lib/badges.js';
import { arr, cleanDescription, obj, parsePerson, str } from '../../lib/util.js';
import { LANGS, PHP_TECH, techFromDeps } from '../tech.js';

// Script names that collide with Composer commands must go through run-script.
const COMPOSER_COMMANDS = new Set([
  'archive', 'audit', 'browse', 'bump', 'check-platform-reqs', 'clear-cache', 'config', 'create-project', 'depends',
  'diagnose', 'dump-autoload', 'exec', 'fund', 'global', 'init', 'install', 'licenses', 'list', 'outdated', 'prohibits',
  'reinstall', 'remove', 'require', 'run-script', 'search', 'self-update', 'show', 'status', 'suggests', 'update', 'validate',
]);
const composerRun = (name) => (COMPOSER_COMMANDS.has(name) ? `composer run-script ${name}` : `composer ${name}`);
const MAX_SCRIPTS = 25;

function licenseOf(value) {
  if (typeof value === 'string') return str(value);
  const list = arr(value).map(str).filter(Boolean);
  return list.length ? list.join(' OR ') : null;
}

function authorOf(value) {
  const first = arr(value)[0];
  return first && typeof first === 'object' ? parsePerson({ ...first, url: first.homepage ?? first.url }) : parsePerson(first);
}

export function detect(fs) {
  const composer = fs.readJson('composer.json');
  if (!composer || typeof composer !== 'object' || Array.isArray(composer)) return null;

  const require = obj(composer.require);
  const deps = new Set([...Object.keys(require), ...Object.keys(obj(composer['require-dev']))].map((d) => d.toLowerCase()));
  const name = str(composer.name);
  const description = cleanDescription(composer.description);
  const isLaravel = fs.isFile('artisan');
  const isSymfony = !isLaravel && fs.isFile('bin/console');
  const isProject = str(composer.type) === 'project' || isLaravel || isSymfony;
  const publishable = !isProject && Boolean(name && description);
  const bins = arr(composer.bin).map(str).filter(Boolean);

  const scripts = Object.entries(obj(composer.scripts))
    .filter(([script]) => !/^(pre|post)-/.test(script))
    .slice(0, MAX_SCRIPTS)
    .map(([script, raw]) => ({ name: script, cmd: composerRun(script), raw: Array.isArray(raw) ? raw.join(' && ') : String(raw) }));
  const hasScript = (script) => scripts.some((s) => s.name === script);

  const usage = [];
  if (isLaravel) {
    usage.push({ t: 'usage.laravelKey', code: 'php artisan key:generate' });
    usage.push({ t: 'usage.migrate', code: 'php artisan migrate' });
    usage.push({ t: 'usage.start', code: 'php artisan serve' });
  } else if (isSymfony) {
    if (deps.has('doctrine/doctrine-migrations-bundle')) {
      usage.push({ t: 'usage.migrate', code: 'php bin/console doctrine:migrations:migrate' });
    }
    usage.push({ t: 'usage.start', code: 'php -S localhost:8000 -t public' });
  } else if (bins.length) {
    if (publishable) usage.push({ t: 'usage.cliInstall', code: `composer global require ${name}` });
    const commands = bins.map((bin) => (publishable ? `${bin.split('/').pop()} --help` : `php ${bin} --help`));
    usage.push({ t: 'usage.cliRun', code: commands.join('\n') });
  } else if (fs.isFile('public/index.php')) {
    usage.push({ t: 'usage.start', code: 'php -S localhost:8000 -t public' });
  } else if (fs.isFile('index.php')) {
    usage.push({ t: 'usage.start', code: 'php -S localhost:8000' });
  } else if (publishable) {
    usage.push({ t: 'usage.libInstall', code: `composer require ${name}` });
  }

  const tests = [];
  if (isLaravel) tests.push({ t: 'tests.run', code: 'php artisan test' });
  else if (hasScript('test')) tests.push({ t: 'tests.run', code: composerRun('test') });
  else if (deps.has('pestphp/pest')) tests.push({ t: 'tests.run', code: 'vendor/bin/pest' });
  else if (deps.has('phpunit/phpunit') || fs.isFile('phpunit.xml') || fs.isFile('phpunit.xml.dist')) {
    tests.push({ t: 'tests.run', code: 'vendor/bin/phpunit' });
  }

  const phpVersion = str(require.php);
  const badges = [];
  if (publishable) {
    badges.push({ kind: 'registry', alt: 'Packagist', img: shields(`packagist/v/${name}`), link: `https://packagist.org/packages/${name}` });
  }
  if (phpVersion) badges.push({ kind: 'runtime', alt: 'php', img: staticBadge('php', phpVersion, '777BB4', { logo: 'php' }) });

  return {
    id: 'php',
    label: 'PHP',
    packageManager: 'composer',
    name,
    description,
    version: str(composer.version),
    license: licenseOf(composer.license),
    author: authorOf(composer.authors),
    repository: str(obj(composer.support).source) ?? null,
    homepage: str(composer.homepage),
    requirements: [
      { name: 'PHP', version: phpVersion, url: 'https://www.php.net/downloads' },
      { name: 'Composer', version: null, url: 'https://getcomposer.org/' },
    ],
    install: [{ t: 'install.deps', code: 'composer install' }],
    usage,
    tests,
    scripts,
    tech: [LANGS.php, ...techFromDeps(PHP_TECH, deps)],
    badges,
  };
}
