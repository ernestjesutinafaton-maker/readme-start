import { shields, staticBadge } from '../../lib/badges.js';
import { at, child, children, parseXml, textOf } from '../../lib/xml.js';
import { cleanDescription, obj, parsePerson, str } from '../../lib/util.js';
import { JAVA_TECH, LANGS, techFromDeps } from '../tech.js';

const JDK = (version) => ({ name: 'JDK', version: version ? `>= ${version}` : null, url: 'https://adoptium.net/' });
const javaBadge = (version) => ({ kind: 'runtime', alt: 'java', img: staticBadge('java', `${version}+`, 'ED8B00', { logo: 'openjdk' }) });
// Maven properties such as ${project.version} are not real values.
const literal = (value) => (value && !value.includes('${') ? value : null);

function maven(fs, text) {
  let project;
  try {
    project = child(parseXml(text), 'project');
  } catch (err) {
    fs.warnings.push(`Could not parse pom.xml: ${err.message}`);
  }
  if (!project) return null;

  const get = (...path) => literal(textOf(at(project, ...path)));
  const artifactId = get('artifactId');
  const groupId = get('groupId') ?? get('parent', 'groupId');
  const version = get('version') ?? get('parent', 'version');
  const props = Object.fromEntries((child(project, 'properties')?.children ?? []).map((p) => [p.name, textOf(p)]));
  const javaVersion = literal(props['java.version'] ?? props['maven.compiler.release'] ?? props['maven.compiler.source'] ?? null);
  const coordinates = (element) => `${textOf(child(element, 'groupId'))}:${textOf(child(element, 'artifactId'))}`;
  const deps = children(child(project, 'dependencies'), 'dependency').map(coordinates);
  const plugins = children(at(project, 'build', 'plugins'), 'plugin').map(coordinates);
  const modules = children(child(project, 'modules'), 'module').map(textOf).filter(Boolean);
  const developer = at(project, 'developers', 'developer');

  const mvn = fs.isFile('mvnw') ? './mvnw' : 'mvn';
  const springBoot = get('parent', 'artifactId') === 'spring-boot-starter-parent' || deps.some((d) => d.startsWith('org.springframework.boot:'));
  const quarkus = deps.some((d) => d.startsWith('io.quarkus:')) || plugins.some((p) => p.endsWith(':quarkus-maven-plugin'));
  const runnable = plugins.some((p) => p.endsWith(':exec-maven-plugin'));
  const mainClass = /<mainClass>\s*([^<\s]+)\s*<\/mainClass>/.test(text);
  const kotlin = plugins.some((p) => p.endsWith(':kotlin-maven-plugin')) || fs.isDir('src/main/kotlin');

  const usage = [];
  if (springBoot) usage.push({ t: 'usage.start', code: `${mvn} spring-boot:run` });
  else if (quarkus) usage.push({ t: 'usage.dev', code: `${mvn} quarkus:dev` });
  else if (runnable) usage.push({ t: 'usage.run', code: `${mvn} exec:java` });
  else if (mainClass && artifactId && version) {
    usage.push({ t: 'usage.runJar', code: `${mvn} package\njava -jar target/${artifactId}-${version}.jar` });
  } else if (!modules.length && groupId && artifactId && version) {
    const dependency = `<dependency>\n  <groupId>${groupId}</groupId>\n  <artifactId>${artifactId}</artifactId>\n  <version>${version}</version>\n</dependency>`;
    usage.push({ t: 'usage.libMaven', code: dependency, lang: 'xml' });
  }

  const description = cleanDescription(get('description'));
  const license = get('licenses', 'license', 'name');
  const scm = get('scm', 'url');
  const publishable = Boolean(groupId && artifactId && description && license && scm && developer);

  const badges = [];
  if (publishable) {
    badges.push({
      kind: 'registry',
      alt: 'Maven Central',
      img: shields(`maven-central/v/${groupId}/${artifactId}`),
      link: `https://central.sonatype.com/artifact/${groupId}/${artifactId}`,
    });
  }
  if (javaVersion) badges.push(javaBadge(javaVersion));

  return {
    id: 'java',
    label: 'Java',
    packageManager: 'maven',
    name: get('name') ?? artifactId,
    description,
    version,
    license,
    author: developer ? parsePerson({ name: textOf(child(developer, 'name')), email: textOf(child(developer, 'email')), url: textOf(child(developer, 'url')) }) : null,
    repository: scm,
    homepage: get('url'),
    workspace: modules.length
      ? { ecosystem: 'java', tool: 'Maven modules', dirs: modules, example: (name, dir) => `${mvn} -pl ${dir} -am package` }
      : null,
    requirements: [JDK(javaVersion), ...(mvn === 'mvn' ? [{ name: 'Maven', version: null, url: 'https://maven.apache.org/' }] : [])],
    install: [{ t: 'install.build', code: modules.length ? `${mvn} install -DskipTests` : `${mvn} package -DskipTests` }],
    usage,
    tests: [{ t: 'tests.run', code: `${mvn} test` }],
    scripts: [],
    tech: [kotlin ? LANGS.kotlin : LANGS.java, LANGS.maven, ...techFromDeps(JAVA_TECH, deps)],
    badges,
  };
}

/**
 * Module folders declared in settings.gradle(.kts): include(":libs:core")
 * maps to "libs/core", unless project(":libs:core").projectDir points
 * elsewhere. Handles include(...) spanning several lines and the Groovy
 * form `include ':a', ':b'` continued with trailing commas.
 */
export function gradleIncludes(settings) {
  const text = settings.replace(/\/\/[^\n]*/g, '');
  const custom = new Map();
  const projectDir =
    /project\(\s*["']:?([^"']+)["']\s*\)\.projectDir\s*=\s*(?:file\(\s*|new\s+File\(\s*(?:rootDir|settingsDir|rootProject\.projectDir)\s*,\s*)["']([^"']+)["']/g;
  for (const m of text.matchAll(projectDir)) custom.set(m[1], m[2].replace(/^\.\//, '').replace(/\/$/, ''));

  const dirs = [];
  const collect = (args) => {
    for (const q of args.matchAll(/["']([^"']+)["']/g)) {
      const id = q[1].replace(/^:/, '');
      dirs.push(custom.get(id) ?? id.replace(/:/g, '/'));
    }
  };
  for (const m of text.matchAll(/^\s*include\s*\(([\s\S]*?)\)/gm)) collect(m[1]);
  for (const m of text.matchAll(/^\s*include(?!\s*\()[ \t]+((?:[^\n]*,[ \t]*\n)*[^\n]*)$/gm)) collect(m[1]);
  return [...new Set(dirs)];
}

function gradle(fs, buildFile, settingsFile) {
  const build = buildFile ? fs.read(buildFile) ?? '' : '';
  const settings = settingsFile ? fs.read(settingsFile) ?? '' : '';
  const catalog = fs.readToml('gradle/libs.versions.toml');
  const all = `${build}\n${settings}\n${JSON.stringify(catalog ?? {})}`;

  const assignment = (key) => new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'm').exec(build)?.[1] ?? null;
  const deps = [
    ...[...build.matchAll(/\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation|kapt|ksp)\s*\(?\s*["']([^:"'\s]+:[^:"'\s]+)/g)].map((m) => m[1]),
    ...Object.values(obj(catalog?.libraries)).map((lib) =>
      typeof lib === 'string' ? lib.split(':').slice(0, 2).join(':') : str(lib?.module) ?? `${lib?.group}:${lib?.name}`,
    ),
  ];
  const javaVersion =
    /JavaLanguageVersion\.of\(\s*(\d+)\s*\)/.exec(build)?.[1] ??
    /jvmToolchain\(\s*(\d+)\s*\)/.exec(build)?.[1] ??
    /sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?["']?([\d_.]+)/.exec(build)?.[1]?.replace(/_/g, '.') ??
    null;

  const g = fs.isFile('gradlew') ? './gradlew' : 'gradle';
  const android = /com\.android\.application|android[.-]application/.test(all);
  const springBoot = /org\.springframework\.boot|spring[.-]boot/.test(all);
  const quarkus = /io\.quarkus/.test(all);
  const application = /^\s*(?:application|id\s*\(?\s*["']application["']\s*\)?)\s*$/m.test(build);
  const kotlin =
    /org\.jetbrains\.kotlin|kotlin\s*\(\s*["'](jvm|android|multiplatform)["']\s*\)|plugins\.kotlin/.test(all) || fs.isDir('src/main/kotlin');
  // Only claim Java with evidence: an empty module build file says nothing.
  const java =
    !kotlin && (fs.isDir('src/main/java') || /["'`]java(-library)?["'`]|^\s*java\s*$/m.test(build) || Boolean(javaVersion));
  const modules = gradleIncludes(settings).filter((dir) => fs.isDir(dir));

  const usage = [];
  if (android) {
    usage.push({ t: 'usage.build', code: `${g} assembleDebug` });
    usage.push({ t: 'usage.androidInstall', code: `${g} installDebug` });
  } else if (springBoot) usage.push({ t: 'usage.start', code: `${g} bootRun` });
  else if (quarkus) usage.push({ t: 'usage.dev', code: `${g} quarkusDev` });
  else if (application) usage.push({ t: 'usage.run', code: `${g} run` });

  const requirements = [JDK(javaVersion)];
  if (android) requirements.push({ name: 'Android Studio', version: null, url: 'https://developer.android.com/studio' });
  if (g === 'gradle') requirements.push({ name: 'Gradle', version: null, url: 'https://gradle.org/install/' });

  const tech = [kotlin ? LANGS.kotlin : java ? LANGS.java : null, LANGS.gradle].filter(Boolean);
  if (android) tech.push({ name: 'Android', color: '34A853', logo: 'android', logoColor: 'white' });

  return {
    id: 'java',
    label: kotlin ? 'Kotlin' : 'Java',
    packageManager: 'gradle',
    name: /rootProject\.name\s*=\s*["']([^"']+)["']/.exec(settings)?.[1] ?? null,
    description: cleanDescription(assignment('description')),
    version: assignment('version'),
    license: null,
    author: null,
    repository: null,
    homepage: null,
    workspace: modules.length
      ? { ecosystem: 'java', tool: 'Gradle multi-project build', dirs: modules, example: (name, dir) => `${g} :${dir.replace(/\//g, ':')}:build` }
      : null,
    requirements,
    install: [{ t: 'install.build', code: `${g} build -x test` }],
    usage,
    tests: [{ t: 'tests.run', code: `${g} test` }],
    scripts: [],
    tech: [...tech, ...techFromDeps(JAVA_TECH, deps)],
    badges: javaVersion ? [javaBadge(javaVersion)] : [],
  };
}

export function detect(fs) {
  const pom = fs.read('pom.xml');
  if (pom != null) return maven(fs, pom);
  const buildFile = ['build.gradle.kts', 'build.gradle'].find((f) => fs.isFile(f));
  const settingsFile = ['settings.gradle.kts', 'settings.gradle'].find((f) => fs.isFile(f));
  if (!buildFile && !settingsFile) return null;
  return gradle(fs, buildFile, settingsFile);
}
