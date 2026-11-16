import { shields, staticBadge } from '../../lib/badges.js';
import { child, children, parseXml, textOf } from '../../lib/xml.js';
import { cleanDescription, parsePerson, str } from '../../lib/util.js';
import { DOTNET_TECH, LANGS, techFromDeps } from '../tech.js';

const PROJECT_FILE = /\.(cs|fs|vb)proj$/i;
const MAX_PROJECTS = 50;
const isTrue = (value) => /^true$/i.test(value ?? '');

/** Project paths listed in a .sln (text) or .slnx (XML) solution file. */
export function parseSolution(text) {
  const paths = [
    ...[...text.matchAll(/^Project\("[^"]*"\)\s*=\s*"[^"]*",\s*"([^"]+\.(?:cs|fs|vb)proj)"/gim)].map((m) => m[1]),
    ...[...text.matchAll(/<Project\s+Path="([^"]+\.(?:cs|fs|vb)proj)"/gi)].map((m) => m[1]),
  ];
  return paths.map((p) => p.replace(/\\/g, '/'));
}

function readProject(fs, file) {
  const text = fs.read(file);
  if (text == null) return null;
  const project = child(parseXml(text), 'Project');
  if (!project) {
    fs.warnings.push(`Could not read ${file}`);
    return null;
  }
  const props = {};
  for (const group of children(project, 'PropertyGroup')) {
    for (const prop of group.children) {
      const value = textOf(prop);
      // MSBuild expressions such as $(Version) are not real values.
      if (value && !value.includes('$(') && !(prop.name in props)) props[prop.name] = value;
    }
  }
  const refs = children(project, 'ItemGroup')
    .flatMap((group) => children(group, 'PackageReference'))
    .map((ref) => (ref.attrs.Include ?? ref.attrs.Update ?? '').toLowerCase())
    .filter(Boolean);
  const sdk = project.attrs.Sdk ?? child(project, 'Sdk')?.attrs.Name ?? '';
  const slash = file.lastIndexOf('/');
  const dir = slash >= 0 ? file.slice(0, slash) : '.';
  const isTest = isTrue(props.IsTestProject) || refs.includes('microsoft.net.test.sdk');
  const isWeb = /^Microsoft\.NET\.Sdk\.(Web|BlazorWebAssembly)$/i.test(sdk);
  const isTool = isTrue(props.PackAsTool);
  const isExe = isWeb || /^(Exe|WinExe)$/i.test(props.OutputType ?? '') || isTrue(props.UseMaui);
  const framework = (props.TargetFramework ?? props.TargetFrameworks ?? '').split(';')[0] || null;
  return {
    file,
    path: dir,
    name: props.PackageId ?? props.AssemblyName ?? file.slice(slash + 1).replace(PROJECT_FILE, ''),
    language: file.split('.').pop().toLowerCase(),
    props,
    refs,
    sdk,
    framework,
    isTest,
    isWeb,
    isTool,
    isExe,
    packable: !isTest && !/^false$/i.test(props.IsPackable ?? '') && (!isExe || isTool),
  };
}

/** "net8.0" -> "8.0", "netcoreapp3.1" -> "3.1"; .NET Standard / Framework -> null. */
const sdkVersion = (framework) => /^net(?:coreapp)?(\d+\.\d+)/.exec(framework ?? '')?.[1] ?? null;

export function detect(fs) {
  const solution = fs.find(/\.slnx?$/i);
  const rootProjects = fs.list('.').filter((e) => e.isFile() && PROJECT_FILE.test(e.name)).map((e) => e.name);
  if (!solution && !rootProjects.length) return null;

  const files = [...new Set([...(solution ? parseSolution(fs.read(solution) ?? '') : []), ...rootProjects])];
  const projects = files.slice(0, MAX_PROJECTS).filter((f) => fs.isFile(f)).map((f) => readProject(fs, f)).filter(Boolean);
  if (!projects.length) return null;

  const main =
    projects.find((p) => p.isWeb) ??
    projects.find((p) => p.isTool) ??
    projects.find((p) => p.isExe && !p.isTest) ??
    projects.find((p) => !p.isTest) ??
    projects[0];
  const props = main.props;
  const projectArg = projects.length > 1 || main.path !== '.' ? ` --project ${main.path}` : '';
  const packageId = props.PackageId ?? main.name;
  const description = cleanDescription(props.Description);
  const publishable = main.packable && Boolean(description);

  const usage = [];
  if (main.isTool) {
    if (publishable) {
      usage.push({ t: 'usage.cliInstall', code: `dotnet tool install --global ${packageId}` });
      usage.push({ t: 'usage.cliRun', code: `${props.ToolCommandName ?? main.name} --help` });
    } else {
      usage.push({ t: 'usage.run', code: `dotnet run${projectArg} -- --help` });
    }
  } else if (main.isExe) {
    usage.push({ t: main.isWeb ? 'usage.start' : 'usage.run', code: `dotnet run${projectArg}` });
    if (main.isWeb) usage.push({ t: 'usage.watch', code: `dotnet watch${projectArg}` });
  } else if (publishable) {
    usage.push({ t: 'usage.libInstall', code: `dotnet add package ${packageId}` });
  }

  const globalJson = fs.readJson('global.json');
  const version = str(globalJson?.sdk?.version) ?? sdkVersion(main.framework);
  const refs = new Set(projects.flatMap((p) => p.refs));
  const tech = [main.language === 'fs' ? LANGS.fsharp : LANGS.csharp, LANGS.dotnet];
  if (projects.some((p) => p.isWeb)) tech.push({ name: 'ASP.NET Core', color: '512BD4', logo: 'dotnet', logoColor: 'white' });
  if (projects.some((p) => /BlazorWebAssembly/i.test(p.sdk))) tech.push({ name: 'Blazor', color: '512BD4', logo: 'blazor', logoColor: 'white' });
  if (projects.some((p) => isTrue(p.props.UseMaui))) tech.push({ name: '.NET MAUI', color: '512BD4', logo: 'dotnet', logoColor: 'white' });
  if (projects.some((p) => isTrue(p.props.UseWPF))) tech.push({ name: 'WPF', color: '512BD4', logo: null, logoColor: 'white' });

  const badges = [];
  if (publishable) {
    badges.push({ kind: 'registry', alt: 'NuGet', img: shields(`nuget/v/${packageId}`), link: `https://www.nuget.org/packages/${packageId}` });
  }
  if (version) badges.push({ kind: 'runtime', alt: '.NET', img: staticBadge('.NET', version, '512BD4', { logo: 'dotnet' }) });

  const authors = str(props.Authors)?.split(/[,;]/)[0];

  return {
    id: 'dotnet',
    label: '.NET',
    packageManager: 'dotnet',
    name: solution ? solution.replace(/\.slnx?$/i, '') : main.name,
    description,
    version: props.Version ?? null,
    license: props.PackageLicenseExpression ?? null,
    author: authors ? parsePerson(authors) : null,
    repository: props.RepositoryUrl ?? null,
    homepage: props.PackageProjectUrl ?? null,
    workspace:
      projects.length > 1
        ? {
            ecosystem: 'dotnet',
            tool: '.NET solution',
            packages: projects.map((p) => ({ name: p.name, path: p.path, description: cleanDescription(p.props.Description) })),
            example: (name, dir) => `dotnet build ${dir}`,
          }
        : null,
    requirements: [{ name: '.NET SDK', version: version ? `>= ${version}` : null, url: 'https://dotnet.microsoft.com/download' }],
    install: [{ t: 'install.build', code: 'dotnet build' }],
    usage,
    tests: projects.some((p) => p.isTest) ? [{ t: 'tests.run', code: 'dotnet test' }] : [],
    scripts: [],
    tech: [...tech, ...techFromDeps(DOTNET_TECH, refs)],
    badges,
  };
}
