import { shields, staticBadge } from '../../lib/badges.js';
import { cleanDescription, str } from '../../lib/util.js';
import { ELIXIR_TECH, LANGS, techFromDeps } from '../tech.js';

/** Reads mix.exs with regular expressions (it is Elixir code, not data). */
export function parseMix(text) {
  const attribute = (name) => new RegExp(`@${name}\\s+"([^"]*)"`).exec(text)?.[1] ?? null;
  const keyword = (name) => {
    const m = new RegExp(`\\b${name}:\\s*(?:"([^"]*)"|@(\\w+))`).exec(text);
    if (!m) return null;
    return m[1] ?? attribute(m[2]);
  };
  // description: "…", def description, do: "…", or a def returning a """ heredoc.
  const description =
    keyword('description') ||
    /defp?\s+description\s+do\s+"""\s*\n([\s\S]*?)"""/.exec(text)?.[1]?.split('\n').map((l) => l.trim()).filter(Boolean).join(' ') ||
    /defp?\s+description\s*(?:,\s*do:|do)\s*"(?!"")([^"]*)"/.exec(text)?.[1] ||
    null;
  const depsBlock = /defp\s+deps\s*(?:\(\s*\))?\s+do([\s\S]*?)\n\s*end/.exec(text)?.[1] ?? '';
  return {
    app: /\bapp:\s*:(\w+)/.exec(text)?.[1] ?? null,
    version: keyword('version') ?? attribute('version'),
    elixir: keyword('elixir'),
    description,
    sourceUrl: keyword('source_url') ?? attribute('source_url'),
    homepage: keyword('homepage_url'),
    license: /licenses:\s*\[\s*"([^"]+)"/.exec(text)?.[1] ?? null,
    appsPath: keyword('apps_path'),
    escript: /\bescript:\s*(\[|escript\(\))/.test(text),
    package: /\bpackage:\s*(\[|package\(\))/.test(text),
    setupAlias: /\bsetup:\s*\[/.test(text),
    deps: [...depsBlock.matchAll(/\{\s*:(\w+)\s*,/g)].map((m) => m[1]),
  };
}

export function detect(fs) {
  const text = fs.read('mix.exs');
  if (text == null) return null;

  const mix = parseMix(text);
  const deps = new Set(mix.deps);
  const description = cleanDescription(mix.description);
  const publishable = mix.package && Boolean(mix.app && description);

  const usage = [];
  if (deps.has('phoenix')) {
    if (mix.setupAlias) usage.push({ t: 'usage.setup', code: 'mix setup' });
    else if (deps.has('ecto_sql')) usage.push({ t: 'usage.dbPrepare', code: 'mix ecto.setup' });
    usage.push({ t: 'usage.start', code: 'mix phx.server' });
  } else if (mix.escript && mix.app) {
    usage.push({ t: 'usage.build', code: 'mix escript.build' });
    usage.push({ t: 'usage.cliRun', code: `./${mix.app} --help` });
  } else if (publishable) {
    const version = /^(\d+\.\d+)/.exec(mix.version ?? '')?.[1] ?? '0.1';
    usage.push({ t: 'usage.libHex', code: `{:${mix.app}, "~> ${version}"}`, lang: 'elixir' });
  } else if (!mix.appsPath) {
    usage.push({ t: 'usage.run', code: 'iex -S mix' });
  }

  const badges = [];
  if (publishable) badges.push({ kind: 'registry', alt: 'Hex.pm', img: shields(`hexpm/v/${mix.app}`), link: `https://hex.pm/packages/${mix.app}` });
  if (mix.elixir) badges.push({ kind: 'runtime', alt: 'elixir', img: staticBadge('elixir', mix.elixir, '4B275F', { logo: 'elixir' }) });

  return {
    id: 'elixir',
    label: 'Elixir',
    packageManager: 'mix',
    name: mix.app,
    description,
    version: mix.version,
    license: mix.license,
    author: null,
    repository: mix.sourceUrl,
    homepage: str(mix.homepage),
    // Umbrella projects keep their applications in apps/.
    workspace: mix.appsPath
      ? { ecosystem: 'elixir', tool: 'Mix umbrella', patterns: [`${mix.appsPath}/*`], example: (app) => `mix cmd --app ${app} mix test` }
      : null,
    requirements: [
      { name: 'Elixir', version: mix.elixir, url: 'https://elixir-lang.org/install.html' },
      { name: 'Erlang/OTP', version: null, url: 'https://www.erlang.org/downloads' },
    ],
    install: [{ t: 'install.deps', code: 'mix deps.get' }],
    usage,
    tests: [{ t: 'tests.run', code: 'mix test' }],
    scripts: [],
    tech: [LANGS.elixir, ...techFromDeps(ELIXIR_TECH, deps)],
    badges,
  };
}
