import { shields, staticBadge } from '../../lib/badges.js';
import { arr, cleanDescription, obj, parsePerson, str } from '../../lib/util.js';
import { LANGS, PYTHON_TECH, techFromDeps } from '../tech.js';

const MANAGERS = {
  uv: { label: 'uv', url: 'https://docs.astral.sh/uv/', run: 'uv run ' },
  poetry: { label: 'Poetry', url: 'https://python-poetry.org/', run: 'poetry run ' },
  pipenv: { label: 'Pipenv', url: 'https://pipenv.pypa.io/', run: 'pipenv run ' },
  pip: { label: 'pip', url: null, run: '' },
};

const VENV = 'python -m venv .venv\nsource .venv/bin/activate  # Windows: .venv\\Scripts\\activate';

/** "Django>=5.0 ; python_version > '3.9'" -> "django" (PEP 503 normalized). */
function depName(spec) {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(String(spec));
  return m ? m[1].toLowerCase().replace(/[-_.]+/g, '-') : null;
}

function parseRequirements(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('-'))
    .map(depName)
    .filter(Boolean);
}

function parseSetupPy(text) {
  const field = (key) => new RegExp(`\\b${key}\\s*=\\s*['"]([^'"]+)['"]`).exec(text)?.[1] ?? null;
  return { name: field('name'), version: field('version'), description: field('description'), license: field('license') };
}

function licenseOf(value) {
  if (typeof value === 'string') return str(value);
  return str(value?.text) && value.text.length < 40 ? str(value.text) : null;
}

function findUrl(urls, pattern) {
  const key = Object.keys(urls).find((k) => pattern.test(k));
  return key ? str(urls[key]) : null;
}

/** "app/main.py" -> "app.main", "app/__init__.py" -> "app". */
const moduleOf = (file) => file.replace(/\.py$/, '').replace(/\/__init__$/, '').replace(/\//g, '.');

export function detect(fs) {
  const pyproject = fs.readToml('pyproject.toml');
  const requirementsTxt = fs.read('requirements.txt');
  const setupPy = fs.read('setup.py');
  const hasPipfile = fs.isFile('Pipfile');
  const rootPy = fs
    .list('.')
    .filter((e) => e.isFile() && e.name.endsWith('.py'))
    .map((e) => e.name);
  if (!pyproject && requirementsTxt == null && setupPy == null && !hasPipfile && !rootPy.length) return null;

  const project = obj(pyproject?.project);
  const poetry = obj(pyproject?.tool?.poetry);
  const setup = setupPy ? parseSetupPy(setupPy) : {};
  const urls = { ...obj(poetry.urls), ...obj(project.urls) };

  const name = str(project.name) ?? str(poetry.name) ?? setup.name ?? null;
  const description = cleanDescription(project.description) ?? cleanDescription(poetry.description) ?? cleanDescription(setup.description);
  const isPackage = Boolean(pyproject?.['build-system'] || pyproject?.project || pyproject?.tool?.poetry || setupPy);

  const deps = new Set([
    ...arr(project.dependencies).map(depName),
    ...Object.values(obj(project['optional-dependencies'])).flatMap(arr).map(depName),
    ...Object.values(obj(pyproject?.['dependency-groups'])).flatMap(arr).map(depName),
    ...Object.keys(obj(poetry.dependencies)).map(depName),
    ...Object.values(obj(poetry.group)).flatMap((g) => Object.keys(obj(g?.dependencies))).map(depName),
    ...(requirementsTxt ? parseRequirements(requirementsTxt) : []),
    ...(fs.read('requirements-dev.txt') ? parseRequirements(fs.read('requirements-dev.txt')) : []),
  ]);
  deps.delete('python');
  deps.delete(null);

  const managerName = fs.isFile('uv.lock')
    ? 'uv'
    : fs.isFile('poetry.lock') || pyproject?.tool?.poetry
      ? 'poetry'
      : hasPipfile
        ? 'pipenv'
        : 'pip';
  const pm = MANAGERS[managerName];
  const run = pm.run;

  // Installation
  const install = [];
  if (managerName === 'uv') install.push({ t: 'install.deps', code: 'uv sync' });
  else if (managerName === 'poetry') install.push({ t: 'install.deps', code: 'poetry install' });
  else if (managerName === 'pipenv') install.push({ t: 'install.deps', code: 'pipenv install --dev' });
  else {
    const pip = [];
    if (requirementsTxt != null) pip.push('pip install -r requirements.txt');
    else if (isPackage) pip.push('pip install -e .');
    if (fs.isFile('requirements-dev.txt')) pip.push('pip install -r requirements-dev.txt');
    if (pip.length) {
      install.push({ t: 'install.venv', code: VENV });
      install.push({ t: 'install.deps', code: pip.join('\n') });
    }
  }

  // Usage
  const firstFile = (candidates) => candidates.find((f) => fs.isFile(f)) ?? null;
  const pyPublishable =
    Boolean(pyproject?.['build-system'] && name && description) &&
    !arr(project.classifiers).some((c) => /Private :: Do Not Upload/i.test(String(c)));
  const entryPoints = [...new Set([...Object.keys(obj(project.scripts)), ...Object.keys(obj(poetry.scripts))])];
  const usage = [];

  if (fs.isFile('manage.py')) {
    usage.push({ t: 'usage.migrate', code: `${run}python manage.py migrate` });
    usage.push({ t: 'usage.start', code: `${run}python manage.py runserver` });
  } else if (deps.has('fastapi') && firstFile(['main.py', 'app.py', 'app/main.py', 'src/main.py', 'api/main.py'])) {
    const file = firstFile(['main.py', 'app.py', 'app/main.py', 'src/main.py', 'api/main.py']);
    usage.push({ t: 'usage.dev', code: `${run}uvicorn ${moduleOf(file)}:app --reload` });
  } else if (deps.has('flask') && firstFile(['app.py', 'wsgi.py', 'main.py', 'app/__init__.py'])) {
    const file = firstFile(['app.py', 'wsgi.py', 'main.py', 'app/__init__.py']);
    usage.push({ t: 'usage.dev', code: `${run}flask --app ${moduleOf(file)} run --debug` });
  } else if (deps.has('streamlit') && firstFile(['streamlit_app.py', 'app.py', 'main.py'])) {
    usage.push({ t: 'usage.start', code: `${run}streamlit run ${firstFile(['streamlit_app.py', 'app.py', 'main.py'])}` });
  }

  if (!usage.length && entryPoints.length) {
    if (pyPublishable) usage.push({ t: 'usage.cliInstall', code: `pipx install ${name}` });
    usage.push({ t: 'usage.cliRun', code: entryPoints.map((cmd) => `${run}${cmd} --help`).join('\n') });
  }

  const moduleName = name?.toLowerCase().replace(/[-.]+/g, '_') ?? null;
  const packageDir = moduleName ? [moduleName, `src/${moduleName}`].find((d) => fs.isFile(`${d}/__init__.py`)) : null;

  if (!usage.length) {
    const script = firstFile(['main.py', 'app.py', 'run.py', 'cli.py']);
    if (script) usage.push({ t: 'usage.run', code: `${run}python ${script}` });
    else if (packageDir && fs.isFile(`${packageDir}/__main__.py`)) usage.push({ t: 'usage.run', code: `${run}python -m ${moduleName}` });
    else if (packageDir) {
      if (pyPublishable) usage.push({ t: 'usage.libInstall', code: `pip install ${name}` });
      usage.push({ t: 'usage.libImport', code: `import ${moduleName}`, lang: 'python' });
    } else if (rootPy.length === 1) usage.push({ t: 'usage.run', code: `${run}python ${rootPy[0]}` });
  }

  // Tests
  const tests = [];
  const usesPytest =
    deps.has('pytest') || fs.isFile('pytest.ini') || fs.isFile('conftest.py') || Boolean(pyproject?.tool?.pytest);
  if (usesPytest) tests.push({ t: 'tests.run', code: `${run}pytest` });
  else if (fs.isDir('tests') || fs.isDir('test') || rootPy.some((f) => /^test_.*\.py$/.test(f))) {
    tests.push({ t: 'tests.run', code: `${run}python -m unittest discover` });
  }

  // Prerequisites & badges
  const requiresPython = str(project['requires-python']) ?? str(poetry.dependencies?.python);
  const requirements = [{ name: 'Python', version: requiresPython, url: 'https://www.python.org/' }];
  if (pm.url) requirements.push({ name: pm.label, version: null, url: pm.url });

  const badges = [];
  if (pyPublishable) {
    badges.push({ kind: 'registry', alt: 'PyPI version', img: shields(`pypi/v/${name}`), link: `https://pypi.org/project/${name}/` });
  }
  if (requiresPython) {
    badges.push({ kind: 'runtime', alt: 'python', img: staticBadge('python', requiresPython, '3776AB', { logo: 'python' }) });
  }

  const author = parsePerson(arr(project.authors)[0]) ?? parsePerson(arr(poetry.authors)[0]);
  const uvWorkspace = obj(pyproject?.tool?.uv?.workspace);
  const workspace = arr(uvWorkspace.members).length
    ? {
        ecosystem: 'python',
        tool: 'uv workspace',
        patterns: [...arr(uvWorkspace.members), ...arr(uvWorkspace.exclude).map((p) => `!${p}`)],
        example: (pkg) => `uv run --package ${pkg} pytest`,
      }
    : null;
  const repository = findUrl(urls, /^(repository|source|source[ _-]?code|code|github)$/i) ?? str(poetry.repository);

  return {
    id: 'python',
    label: 'Python',
    packageManager: managerName,
    // Loose .py files alone are a weak signal: they should not add a Python
    // section to, say, a Node project with a helper script.
    weak: !pyproject && requirementsTxt == null && setupPy == null && !hasPipfile,
    name,
    description,
    version: str(project.version) ?? str(poetry.version) ?? setup.version ?? null,
    license: licenseOf(project.license) ?? str(poetry.license) ?? setup.license ?? null,
    author,
    repository,
    homepage: findUrl(urls, /^(homepage|home)$/i) ?? str(poetry.homepage),
    workspace,
    requirements,
    install,
    usage,
    tests,
    scripts: [],
    tech: [LANGS.python, ...techFromDeps(PYTHON_TECH, deps)],
    badges,
  };
}
