import { shields, staticBadge } from '../../lib/badges.js';
import { arr, cleanDescription, obj, str } from '../../lib/util.js';
import { DART_TECH, LANGS, techFromDeps } from '../tech.js';

const PLATFORM_BUILDS = [
  ['android', 'flutter build apk'],
  ['ios', 'flutter build ios'],
  ['web', 'flutter build web'],
  ['macos', 'flutter build macos'],
  ['windows', 'flutter build windows'],
  ['linux', 'flutter build linux'],
];

export function detect(fs) {
  const pubspec = fs.readYaml('pubspec.yaml');
  if (!pubspec || typeof pubspec !== 'object' || Array.isArray(pubspec)) return null;

  const name = str(pubspec.name);
  const description = cleanDescription(pubspec.description);
  const dependencies = obj(pubspec.dependencies);
  const deps = new Set([...Object.keys(dependencies), ...Object.keys(obj(pubspec.dev_dependencies))]);
  const flutter = deps.has('flutter') || Object.hasOwn(pubspec, 'flutter');
  const tool = flutter ? 'flutter' : 'dart';
  const publishable = pubspec.publish_to !== 'none' && Boolean(name && description);
  const executables = Object.keys(obj(pubspec.executables));
  const sdk = str(obj(pubspec.environment).sdk);
  const flutterVersion = str(obj(pubspec.environment).flutter);

  const usage = [];
  if (flutter && fs.isFile('lib/main.dart')) {
    usage.push({ t: 'usage.run', code: 'flutter run' });
    const builds = PLATFORM_BUILDS.filter(([dir]) => fs.isDir(dir)).map(([, cmd]) => cmd);
    if (builds.length) usage.push({ t: 'usage.build', code: builds.join('\n') });
  } else if (deps.has('dart_frog')) {
    usage.push({ t: 'usage.dev', code: 'dart_frog dev' });
  } else if (executables.length) {
    if (publishable) usage.push({ t: 'usage.cliInstall', code: `dart pub global activate ${name}` });
    usage.push({ t: 'usage.cliRun', code: executables.map((e) => (publishable ? `${e} --help` : `dart run ${name}:${e} --help`)).join('\n') });
  } else if (!flutter && fs.isDir('bin')) {
    usage.push({ t: 'usage.run', code: 'dart run' });
  } else if (name && fs.isDir('lib')) {
    if (publishable) usage.push({ t: 'usage.libInstall', code: `${tool} pub add ${name}` });
    usage.push({ t: 'usage.libImport', code: `import 'package:${name}/${name}.dart';`, lang: 'dart' });
  }

  const tests = [];
  if (fs.isDir('test') || deps.has('test') || deps.has('flutter_test')) tests.push({ t: 'tests.run', code: `${tool} test` });

  const requirements = flutter
    ? [{ name: 'Flutter', version: flutterVersion ? `>= ${flutterVersion}` : null, url: 'https://docs.flutter.dev/get-started/install' }]
    : [{ name: 'Dart SDK', version: sdk, url: 'https://dart.dev/get-dart' }];

  const badges = [];
  if (publishable) badges.push({ kind: 'registry', alt: 'pub', img: shields(`pub/v/${name}`), link: `https://pub.dev/packages/${name}` });
  if (sdk) badges.push({ kind: 'runtime', alt: 'dart', img: staticBadge('dart', sdk, '0175C2', { logo: 'dart' }) });

  // Monorepos: Dart pub workspaces (Dart 3.6+) or Melos.
  const melos = fs.readYaml('melos.yaml');
  const workspaceDirs = arr(pubspec.workspace).filter((d) => typeof d === 'string');
  const melosPatterns = arr(melos?.packages).filter((p) => typeof p === 'string');
  const workspace = workspaceDirs.length
    ? { ecosystem: 'dart', tool: 'pub workspace', dirs: workspaceDirs, example: (pkg, dir) => `cd ${dir} && ${tool} test` }
    : melosPatterns.length
      ? { ecosystem: 'dart', tool: 'Melos', patterns: melosPatterns, example: (pkg) => `melos exec --scope=${pkg} -- ${tool} test` }
      : null;

  const repository = str(pubspec.repository) ?? (/github\.com|gitlab\.com/.test(str(pubspec.homepage) ?? '') ? str(pubspec.homepage) : null);

  return {
    id: 'dart',
    label: flutter ? 'Flutter' : 'Dart',
    packageManager: 'pub',
    name,
    description,
    version: str(pubspec.version),
    license: null,
    author: null,
    repository,
    homepage: str(pubspec.homepage),
    workspace,
    requirements,
    install: [{ t: 'install.deps', code: `${tool} pub get` }],
    usage,
    tests,
    scripts: [],
    tech: [LANGS.dart, ...(flutter ? [LANGS.flutter] : []), ...techFromDeps(DART_TECH, deps)],
    badges,
  };
}
