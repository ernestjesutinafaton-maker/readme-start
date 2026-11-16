import { shields, staticBadge } from '../../lib/badges.js';
import { arr, cleanDescription, obj, parsePerson, str } from '../../lib/util.js';
import { LANGS, RUST_TECH, techFromDeps } from '../tech.js';

export function detect(fs) {
  const cargo = fs.readToml('Cargo.toml');
  if (!cargo) return null;

  const pkg = obj(cargo.package);
  const name = str(pkg.name);
  const description = cleanDescription(pkg.description);
  const license = str(pkg.license);
  const deps = new Set([
    ...Object.keys(obj(cargo.dependencies)),
    ...Object.keys(obj(cargo['dev-dependencies'])),
    ...Object.keys(obj(cargo['build-dependencies'])),
    ...Object.keys(obj(cargo.workspace?.dependencies)),
  ]);

  const bins = arr(cargo.bin).map((b) => str(b?.name)).filter(Boolean);
  if (!bins.length && name && fs.isFile('src/main.rs')) bins.push(name);
  const isLib = Boolean(cargo.lib) || fs.isFile('src/lib.rs');
  const publishable = pkg.publish !== false && Boolean(name && description && (license || str(pkg['license-file'])));

  const usage = [];
  if (bins.length) {
    usage.push({ t: 'usage.run', code: `cargo run --release${bins.length > 1 ? ` --bin ${bins[0]}` : ''}` });
    usage.push(
      publishable
        ? { t: 'usage.cliInstall', code: `cargo install ${name}` }
        : { t: 'usage.cliInstallLocal', code: 'cargo install --path .' },
    );
    usage.push({ t: 'usage.cliRun', code: bins.map((b) => `${b} --help`).join('\n') });
  } else if (isLib && publishable) {
    usage.push({ t: 'usage.libInstall', code: `cargo add ${name}` });
    const version = /^(\d+\.\d+)/.exec(str(pkg.version) ?? '')?.[1];
    if (version) usage.push({ t: 'usage.libCargo', code: `[dependencies]\n${name} = "${version}"`, lang: 'toml' });
  }

  const members = arr(cargo.workspace?.members).filter((m) => typeof m === 'string');
  const workspace = members.length
    ? {
        ecosystem: 'rust',
        tool: 'Cargo workspace',
        patterns: [...members, ...arr(cargo.workspace?.exclude).map((p) => `!${p}`)],
        example: (crate) => `cargo build -p ${crate}`,
      }
    : null;

  const rustVersion = str(pkg['rust-version']) ?? str(cargo.workspace?.package?.['rust-version']);
  const badges = [];
  if (publishable) {
    badges.push({ kind: 'registry', alt: 'crates.io', img: shields(`crates/v/${name}`), link: `https://crates.io/crates/${name}` });
    if (isLib) badges.push({ kind: 'docs', alt: 'docs.rs', img: shields(`docsrs/${name}`), link: `https://docs.rs/${name}` });
  }
  if (rustVersion) {
    badges.push({ kind: 'runtime', alt: 'rust', img: staticBadge('rust', `${rustVersion}+`, 'orange', { logo: 'rust' }) });
  }

  return {
    id: 'rust',
    label: 'Rust',
    packageManager: 'cargo',
    name,
    description,
    version: str(pkg.version),
    license,
    author: parsePerson(arr(pkg.authors)[0]),
    repository: str(pkg.repository),
    homepage: str(pkg.homepage),
    workspace,
    requirements: [{ name: 'Rust', version: rustVersion ? `>= ${rustVersion}` : null, url: 'https://rustup.rs/' }],
    install: [{ t: 'install.build', code: workspace ? 'cargo build --workspace --release' : 'cargo build --release' }],
    usage,
    tests: [{ t: 'tests.run', code: workspace ? 'cargo test --workspace' : 'cargo test' }],
    scripts: [],
    tech: [LANGS.rust, ...techFromDeps(RUST_TECH, deps)],
    badges,
  };
}
