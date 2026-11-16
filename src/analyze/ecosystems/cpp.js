import { staticBadge } from '../../lib/badges.js';
import { arr, cleanDescription, str } from '../../lib/util.js';
import { CPP_TECH, LANGS, techFromDeps } from '../tech.js';

const CPP_FILE = /\.(cpp|cc|cxx|c\+\+|hpp|hh|hxx|ixx|cppm)$/i;
const C_FILE = /\.[ch]$/i;
const SOURCE_DIRS = ['.', 'src', 'source', 'lib', 'include', 'app'];
const MAX_SUBDIRS = 20;

const stripComments = (text) => text.replace(/(^|\s)#[^\n]*/g, '$1');
const compilerRequirement = (language, standard) => ({
  name: 'GCC, Clang or MSVC',
  version: standard ? `${language === 'c' ? 'C' : 'C++'}${standard}` : null,
  url: null,
});

function sourceLanguage(fs, declared) {
  if (declared) {
    if (/\b(CXX|cpp)\b/i.test(declared)) return 'cpp';
    if (/(^|[\s'"])c([\s'"]|$)/i.test(declared)) return 'c';
  }
  const files = SOURCE_DIRS.flatMap((dir) => fs.list(dir).filter((e) => e.isFile()).map((e) => e.name));
  if (files.some((f) => CPP_FILE.test(f))) return 'cpp';
  if (files.some((f) => C_FILE.test(f))) return 'c';
  return null;
}

/** Package names from vcpkg.json and conanfile.txt / conanfile.py. */
function packageManagers(fs) {
  const vcpkg = fs.readJson('vcpkg.json');
  const conanFile = fs.find(/^conanfile\.(txt|py)$/i);
  const conanText = conanFile ? fs.read(conanFile) ?? '' : '';
  return {
    vcpkg: Boolean(vcpkg),
    conan: Boolean(conanFile),
    packages: [
      ...arr(vcpkg?.dependencies).map((d) => (typeof d === 'string' ? d : str(d?.name))).filter(Boolean),
      ...[...conanText.matchAll(/["']?([\w.+-]+)\/[\w.+-]+(?:@[\w./-]+)?["']?/g)].map((m) => m[1]),
    ],
  };
}

function cmake(fs, context) {
  const root = stripComments(fs.read('CMakeLists.txt') ?? '');
  // Targets are often declared in sub-folders: read their CMakeLists.txt too.
  const files = [{ dir: '', text: root }];
  for (const m of [...root.matchAll(/add_subdirectory\s*\(\s*"?([\w./-]+)"?/gi)].slice(0, MAX_SUBDIRS)) {
    const text = fs.read(`${m[1]}/CMakeLists.txt`);
    if (text != null) files.push({ dir: m[1].replace(/\/$/, ''), text: stripComments(text) });
  }
  const all = files.map((f) => f.text).join('\n');

  const project = /\bproject\s*\(\s*([\w.+-]+)([^)]*)\)/i.exec(root);
  const args = project?.[2] ?? '';
  const name = project?.[1] ?? null;
  const language = sourceLanguage(fs, /\bLANGUAGES\s+([^)]*)/i.exec(args)?.[1]) ?? 'cpp';
  const standard =
    (language === 'c' ? /CMAKE_C_STANDARD\s+(\d+)/.exec(all) ?? /c_std_(\d+)/.exec(all) : /CMAKE_CXX_STANDARD\s+(\d+)/.exec(all) ?? /cxx_std_(\d+)/.exec(all))?.[1] ?? null;
  const minimum = /cmake_minimum_required\s*\(\s*VERSION\s+([\d.]+)/i.exec(root)?.[1] ?? null;
  const executables = files.flatMap(({ dir, text }) =>
    [...text.matchAll(/add_executable\s*\(\s*([\w.+-]+)(?!\s+IMPORTED)/gi)].map((m) => ({ name: m[1], dir })),
  );
  const libraries = [...all.matchAll(/add_library\s*\(\s*([\w.+-]+)(?!\s+(?:ALIAS|IMPORTED|INTERFACE\s+IMPORTED))/gi)].map((m) => m[1]);
  const hasTests = /\benable_testing\s*\(|\badd_test\s*\(|gtest_discover_tests|catch_discover_tests|include\s*\(\s*CTest\s*\)/i.test(all);
  const managers = packageManagers(fs);
  const packages = [
    ...[...all.matchAll(/find_package\s*\(\s*([\w]+)/gi)].map((m) => m[1]),
    ...[...all.matchAll(/FetchContent_Declare\s*\(\s*([\w]+)/gi)].map((m) => m[1]),
    ...managers.packages,
  ].map((p) => p.toLowerCase());

  // CMakePresets.json: use the first visible presets when the project defines them.
  const presets = fs.readJson('CMakePresets.json');
  const visible = (list) => arr(list).filter((p) => p && !p.hidden && typeof p.name === 'string');
  const configurePreset = visible(presets?.configurePresets)[0] ?? null;
  const buildPreset = visible(presets?.buildPresets)[0]?.name ?? null;
  const testPreset = visible(presets?.testPresets)[0]?.name ?? null;
  const buildDir = configurePreset?.binaryDir
    ? configurePreset.binaryDir.replace(/^\$\{sourceDir\}\/?/, '').replace(/\$\{presetName\}/g, configurePreset.name)
    : 'build';

  const install = [];
  let toolchain = '';
  if (managers.conan) {
    install.push({ t: 'install.deps', code: 'conan install . --output-folder=build --build=missing' });
    toolchain = ' -DCMAKE_TOOLCHAIN_FILE=build/conan_toolchain.cmake';
  } else if (managers.vcpkg) {
    toolchain = ' -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"';
  }
  install.push(
    configurePreset
      ? { t: 'install.build', code: `cmake --preset ${configurePreset.name}\ncmake --build --preset ${buildPreset ?? configurePreset.name}` }
      : { t: 'install.build', code: `cmake -B build -DCMAKE_BUILD_TYPE=Release${toolchain}\ncmake --build build --config Release` },
  );

  const usage = [];
  if (executables.length) {
    usage.push({ t: 'usage.run', code: executables.map((e) => `./${[buildDir, e.dir, e.name].filter(Boolean).join('/')}`).join('\n') });
  } else if (libraries.length && name) {
    const tag = context.latestTag ?? 'main';
    usage.push({
      t: 'usage.libCMake',
      code: [
        'include(FetchContent)',
        'FetchContent_Declare(',
        `  ${name}`,
        `  GIT_REPOSITORY ${context.remote?.url ?? '<repository-url>'}.git`,
        `  GIT_TAG ${tag}`,
        ')',
        `FetchContent_MakeAvailable(${name})`,
        '',
        `target_link_libraries(your_target PRIVATE ${libraries[0]})`,
      ].join('\n'),
      lang: 'cmake',
    });
  }

  const requirements = [{ name: 'CMake', version: minimum ? `>= ${minimum}` : null, url: 'https://cmake.org/download/' }, compilerRequirement(language, standard)];
  if (managers.vcpkg) requirements.push({ name: 'vcpkg', version: null, url: 'https://vcpkg.io/' });
  if (managers.conan) requirements.push({ name: 'Conan', version: null, url: 'https://conan.io/' });

  const badges = standard
    ? [{ kind: 'runtime', alt: 'standard', img: staticBadge(language === 'c' ? 'C' : 'C++', standard, '00599C', { logo: language === 'c' ? 'c' : 'cplusplus' }) }]
    : [];

  return {
    id: 'cpp',
    label: language === 'c' ? 'C' : 'C++',
    packageManager: 'cmake',
    name,
    description: cleanDescription(/\bDESCRIPTION\s+"([^"]*)"/i.exec(args)?.[1]),
    version: /\bVERSION\s+([\d.]+)/i.exec(args)?.[1] ?? null,
    license: null,
    author: null,
    repository: null,
    homepage: str(/\bHOMEPAGE_URL\s+"([^"]*)"/i.exec(args)?.[1]),
    requirements,
    install,
    usage,
    tests: hasTests ? [{ t: 'tests.run', code: testPreset ? `ctest --preset ${testPreset}` : `ctest --test-dir ${buildDir} --output-on-failure` }] : [],
    scripts: [],
    tech: [
      language === 'c' ? LANGS.c : LANGS.cpp,
      LANGS.cmake,
      ...(managers.vcpkg ? [LANGS.vcpkg] : []),
      ...(managers.conan ? [LANGS.conan] : []),
      ...techFromDeps(CPP_TECH, packages),
    ],
    badges,
  };
}

function meson(fs) {
  const text = stripComments(fs.read('meson.build') ?? '');
  const project = /\bproject\s*\(\s*'([^']+)'([^)]*)\)/.exec(text);
  const args = project?.[2] ?? '';
  const language = sourceLanguage(fs, args) ?? 'cpp';
  const executables = [...text.matchAll(/\bexecutable\s*\(\s*'([^']+)'/g)].map((m) => m[1]);
  const standard = (language === 'c' ? /c_std=c(\d+)/ : /cpp_std=c\+\+(\d+)/).exec(args)?.[1] ?? null;
  const packages = [...text.matchAll(/\bdependency\s*\(\s*'([^']+)'/g)].map((m) => m[1].toLowerCase());
  const mesonVersion = /meson_version\s*:\s*'([^']+)'/.exec(args)?.[1] ?? null;

  return {
    id: 'cpp',
    label: language === 'c' ? 'C' : 'C++',
    packageManager: 'meson',
    name: project?.[1] ?? null,
    description: null,
    version: /\bversion\s*:\s*'([^']+)'/.exec(args)?.[1] ?? null,
    license: /\blicense\s*:\s*'([^']+)'/.exec(args)?.[1] ?? null,
    author: null,
    repository: null,
    homepage: null,
    requirements: [
      { name: 'Meson', version: mesonVersion, url: 'https://mesonbuild.com/Getting-meson.html' },
      { name: 'Ninja', version: null, url: 'https://ninja-build.org/' },
      compilerRequirement(language, standard),
    ],
    install: [{ t: 'install.build', code: 'meson setup build\nmeson compile -C build' }],
    usage: executables.length ? [{ t: 'usage.run', code: executables.map((e) => `./build/${e}`).join('\n') }] : [],
    tests: /\btest\s*\(/.test(text) ? [{ t: 'tests.run', code: 'meson test -C build' }] : [],
    scripts: [],
    tech: [language === 'c' ? LANGS.c : LANGS.cpp, LANGS.meson, ...techFromDeps(CPP_TECH, packages)],
    badges: [],
  };
}

// A plain Makefile project: its targets are already listed in the scripts section.
function makefile(fs) {
  const language = sourceLanguage(fs, null);
  if (!language || !fs.find(/^(GNUmakefile|makefile)$/i)) return null;
  const targets = new Set([...(fs.read(fs.find(/^(GNUmakefile|makefile)$/i)) ?? '').matchAll(/^([A-Za-z0-9][\w-]*)\s*:(?![=:])/gm)].map((m) => m[1]));
  const testTarget = ['test', 'check'].find((t) => targets.has(t));
  return {
    id: 'cpp',
    label: language === 'c' ? 'C' : 'C++',
    packageManager: 'make',
    weak: true,
    name: null,
    requirements: [{ name: 'Make', version: null, url: 'https://www.gnu.org/software/make/' }, compilerRequirement(language, null)],
    install: [{ t: 'install.build', code: 'make' }],
    usage: [],
    tests: testTarget ? [{ t: 'tests.run', code: `make ${testTarget}` }] : [],
    scripts: [],
    tech: [language === 'c' ? LANGS.c : LANGS.cpp],
    badges: [],
  };
}

export function detect(fs, context = {}) {
  if (fs.isFile('CMakeLists.txt')) return cmake(fs, context);
  if (fs.isFile('meson.build')) return meson(fs);
  return makefile(fs);
}
