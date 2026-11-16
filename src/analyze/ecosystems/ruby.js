import { shields, staticBadge } from '../../lib/badges.js';
import { cleanDescription, parsePerson, str } from '../../lib/util.js';
import { LANGS, RUBY_TECH, techFromDeps } from '../tech.js';

const CLOSERS = { '{': '}', '(': ')', '[': ']', '<': '>' };
const squeeze = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean).join(' ');

/**
 * Reads the Ruby string literal at the start of `source`: "…", '…',
 * %q{…} / %Q(…) / %{…}, or a heredoc (<<~ID, <<-ID, <<ID).
 * Returns null for anything computed (constants, method calls…).
 */
export function rubyString(source) {
  const quoted = /^(["'])((?:\\.|(?!\1)[^\\])*)\1/.exec(source);
  if (quoted) return quoted[2].replace(/\\(["'\\])/g, '$1');
  const percent = /^%[qQ]?([{(\[<|!/])/.exec(source);
  if (percent) {
    const close = CLOSERS[percent[1]] ?? percent[1];
    const end = source.indexOf(close, percent[0].length);
    return end < 0 ? null : squeeze(source.slice(percent[0].length, end));
  }
  const heredoc = /^<<([~-]?)(["']?)(\w+)\2[^\n]*\n/.exec(source);
  if (heredoc) {
    const body = source.slice(heredoc[0].length);
    const end = new RegExp(`^\\s*${heredoc[3]}\\s*$`, 'm').exec(body);
    return squeeze(end ? body.slice(0, end.index) : body);
  }
  return null;
}

/** Reads the string fields of a .gemspec. Computed values come back as null. */
export function parseGemspec(text) {
  const field = (key) => {
    const m = new RegExp(`\\.${key}\\s*=\\s*`).exec(text);
    return m ? rubyString(text.slice(m.index + m[0].length)) : null;
  };
  const firstOfList = (key) => new RegExp(`\\.${key}\\s*=\\s*\\[?\\s*(["'])(.*?)\\1`).exec(text)?.[2] ?? null;
  const executables = /\.executables\s*=\s*\[([^\]]*)\]/.exec(text)?.[1];
  return {
    name: field('name'),
    version: field('version'),
    versionFile: /\.version\s*=\s*File\.read\(\s*["']([^"']+)["']/.exec(text)?.[1] ?? null,
    summary: field('summary'),
    description: field('description'),
    homepage: field('homepage'),
    license: field('license') ?? firstOfList('licenses'),
    author: firstOfList('authors'),
    email: firstOfList('email'),
    requiredRuby: field('required_ruby_version'),
    source: /metadata\[["']source_code_uri["']\]\s*=\s*["']([^"']+)["']/.exec(text)?.[1] ?? null,
    executables: executables ? [...executables.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]) : [],
    dependencies: [...text.matchAll(/add_(?:runtime_|development_)?dependency\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]),
  };
}

/**
 * `spec.version = Foo::VERSION` is the norm: the version lives in
 * lib/<gem path>/version.rb. A VERSION file read by the gemspec also works.
 */
function resolveVersion(fs, spec) {
  if (spec.version) return spec.version;
  if (spec.versionFile) return str(fs.read(spec.versionFile));
  if (!spec.name) return null;
  const candidates = [spec.name.replace(/-/g, '/'), spec.name, spec.name.replace(/-/g, '_')].map((p) => `lib/${p}/version.rb`);
  for (const dir of fs.list('lib').filter((e) => e.isDirectory())) candidates.push(`lib/${dir.name}/version.rb`);
  for (const file of candidates) {
    const version = /VERSION\s*=\s*["']([^"']+)["']/.exec(fs.read(file) ?? '')?.[1];
    if (version) return version;
  }
  return null;
}

export function detect(fs) {
  const gemfile = fs.read('Gemfile');
  const gemspecFile = fs.find(/\.gemspec$/i);
  const gemspecText = gemspecFile ? fs.read(gemspecFile) : null;
  if (gemfile == null && gemspecText == null) return null;

  const spec = gemspecText ? parseGemspec(gemspecText) : { executables: [], dependencies: [] };
  spec.version = resolveVersion(fs, spec);
  const gems = new Set(
    [...(gemfile ?? '').matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map((m) => m[1]).concat(spec.dependencies).map((g) => g.toLowerCase()),
  );
  const rubyVersion =
    /^\s*ruby\s+["']([^"']+)["']/m.exec(gemfile ?? '')?.[1] ?? str(fs.read('.ruby-version')) ?? spec.requiredRuby ?? null;

  const isRails = gems.has('rails') || (fs.isFile('bin/rails') && fs.isFile('config/application.rb'));
  const executables = spec.executables.length
    ? spec.executables
    : fs.list('exe').filter((e) => e.isFile()).map((e) => e.name);
  const publishable = Boolean(spec.name && (spec.summary || spec.description) && spec.license);

  const usage = [];
  if (isRails) {
    usage.push({ t: 'usage.dbPrepare', code: 'bin/rails db:prepare' });
    usage.push(fs.isFile('bin/dev') ? { t: 'usage.dev', code: 'bin/dev' } : { t: 'usage.start', code: 'bin/rails server' });
  } else if (gems.has('jekyll')) {
    usage.push({ t: 'usage.serveSite', code: 'bundle exec jekyll serve' });
  } else if (fs.isFile('config.ru')) {
    usage.push({ t: 'usage.start', code: 'bundle exec rackup' });
  } else if (gems.has('sinatra') && fs.isFile('app.rb')) {
    usage.push({ t: 'usage.start', code: 'bundle exec ruby app.rb' });
  } else if (executables.length) {
    if (publishable) usage.push({ t: 'usage.cliInstall', code: `gem install ${spec.name}` });
    const run = (exe) => (publishable ? `${exe} --help` : `bundle exec exe/${exe} --help`);
    usage.push({ t: 'usage.cliRun', code: executables.map(run).join('\n') });
  } else if (spec.name) {
    if (publishable) usage.push({ t: 'usage.libInstall', code: `bundle add ${spec.name}` });
    usage.push({ t: 'usage.libImport', code: `require "${spec.name.replace(/-/g, '/')}"`, lang: 'ruby' });
  } else {
    const script = ['main.rb', 'app.rb'].find((f) => fs.isFile(f));
    if (script) usage.push({ t: 'usage.run', code: `bundle exec ruby ${script}` });
  }

  const tests = [];
  if (gems.has('rspec') || gems.has('rspec-rails') || fs.isFile('.rspec') || fs.isDir('spec')) {
    tests.push({ t: 'tests.run', code: 'bundle exec rspec' });
  } else if (isRails) {
    tests.push({ t: 'tests.run', code: 'bin/rails test' });
  } else if (fs.isDir('test') && fs.find(/^rakefile$/i)) {
    tests.push({ t: 'tests.run', code: 'bundle exec rake test' });
  }

  const badges = [];
  if (publishable) {
    badges.push({ kind: 'registry', alt: 'Gem version', img: shields(`gem/v/${spec.name}`), link: `https://rubygems.org/gems/${spec.name}` });
  }
  if (rubyVersion) badges.push({ kind: 'runtime', alt: 'ruby', img: staticBadge('ruby', rubyVersion, 'CC342D', { logo: 'ruby' }) });

  return {
    id: 'ruby',
    label: 'Ruby',
    packageManager: 'bundler',
    name: spec.name,
    description: cleanDescription(spec.summary) ?? cleanDescription(spec.description),
    version: spec.version,
    license: spec.license,
    author: spec.author ? parsePerson({ name: spec.author, email: spec.email }) : null,
    repository: spec.source ?? (/github\.com|gitlab\.com/.test(spec.homepage ?? '') ? spec.homepage : null),
    homepage: spec.homepage,
    requirements: [
      { name: 'Ruby', version: rubyVersion, url: 'https://www.ruby-lang.org/en/downloads/' },
      { name: 'Bundler', version: null, url: 'https://bundler.io/' },
    ],
    install: [{ t: 'install.deps', code: 'bundle install' }],
    usage,
    tests,
    scripts: [],
    tech: [LANGS.ruby, ...techFromDeps(RUBY_TECH, gems)],
    badges,
  };
}
