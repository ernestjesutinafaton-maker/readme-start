import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { analyzeProject } from './analyze/index.js';
import { LANGUAGES, translator } from './generate/i18n.js';
import { generateReadme } from './generate/readme.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `readme-start ${VERSION}
Generate a README.md from your project's files.

Usage
  readme-start [directory] [options]

Options
  -o, --output <file>   Write to <file> instead of <directory>/README.md
      --stdout          Print the README instead of writing a file
  -f, --force           Replace a README not made by readme-start without asking
      --reset           Also regenerate the sections you edited by hand
  -l, --lang <code>     README language: ${LANGUAGES.join(', ')} (default: en)
  -y, --yes             Never ask questions (CI-friendly)
      --depth <n>       Levels shown in the project tree (default: 2, 0 hides it)
      --no-badges       Leave out badges
      --no-toc          Leave out the table of contents
      --no-tree         Leave out the project structure
      --no-emoji        Leave out emojis in section titles
  -h, --help            Show this help
  -v, --version         Show the version

Keeping your content
  Running readme-start again refreshes the sections it generated and keeps:
  - the sections you added (any "## Title" it does not generate),
  - the generated sections you edited by hand (unless --reset),
  - everything between <!-- readme-start:keep --> and <!-- readme-start:end -->.

Examples
  readme-start                         README.md for the current directory
  readme-start ../my-app --lang fr     French README for another project
  readme-start --stdout > preview.md   Preview without touching README.md
`;

const OPTIONS = {
  output: { type: 'string', short: 'o' },
  stdout: { type: 'boolean' },
  force: { type: 'boolean', short: 'f' },
  reset: { type: 'boolean' },
  lang: { type: 'string', short: 'l', default: 'en' },
  yes: { type: 'boolean', short: 'y' },
  depth: { type: 'string', default: '2' },
  'no-badges': { type: 'boolean' },
  'no-toc': { type: 'boolean' },
  'no-tree': { type: 'boolean' },
  'no-emoji': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

function colors(stream, env) {
  const enabled = Boolean(stream.isTTY) && !('NO_COLOR' in env);
  const wrap = (open, close) => (text) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : String(text));
  return { bold: wrap(1, 22), dim: wrap(2, 22), red: wrap(31, 39), green: wrap(32, 39), yellow: wrap(33, 39), cyan: wrap(36, 39) };
}

async function ask(io, question) {
  const rl = createInterface({ input: io.stdin, output: io.stderr });
  rl.on('SIGINT', () => {
    io.stderr.write('\n');
    process.exit(130);
  });
  try {
    return (await rl.question(question)).trim();
  } catch {
    return '';
  } finally {
    rl.close();
  }
}

const defaultIo = () => ({
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  env: process.env,
});

/**
 * Runs the CLI and resolves with the exit code.
 * Logs go to stderr so that `--stdout` output can be piped safely.
 */
export async function run(argv, io = defaultIo()) {
  const c = colors(io.stderr, io.env ?? {});
  const log = (text = '') => io.stderr.write(`${text}\n`);
  const usageError = (message) => {
    log(c.red(`Error: ${message}`));
    log(`Run ${c.cyan('readme-start --help')} to see the available options.`);
    return 2;
  };

  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    return usageError(err.message);
  }
  const { values: opts, positionals } = parsed;

  if (opts.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (positionals.length > 1) return usageError(`Expected a single directory, got: ${positionals.join(' ')}`);

  const lang = opts.lang.toLowerCase();
  if (!LANGUAGES.includes(lang)) return usageError(`Unsupported language "${opts.lang}". Use one of: ${LANGUAGES.join(', ')}.`);
  const depth = Number(opts.depth);
  if (!Number.isInteger(depth) || depth < 0 || depth > 10) return usageError('--depth must be an integer between 0 and 10.');

  const projectDir = resolve(io.cwd, positionals[0] ?? '.');
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    log(c.red(`Error: ${projectDir} is not a directory.`));
    return 1;
  }

  const info = analyzeProject(projectDir, { depth });
  for (const warning of info.warnings) log(c.yellow(`! ${warning}`));

  const interactive = Boolean(io.stdin.isTTY) && !opts.yes;
  if (!info.description && interactive) {
    const answer = await ask(io, `${c.cyan('?')} No description found. Describe the project in one sentence ${c.dim('(Enter to skip)')}: `);
    if (answer) info.description = answer;
  }

  const target = opts.output ? resolve(io.cwd, opts.output) : resolve(projectDir, 'README.md');
  const rel = relative(io.cwd, target);
  const shown = rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : target;

  let existing = null;
  if (existsSync(target)) {
    if (statSync(target).isDirectory()) {
      log(c.red(`Error: ${shown} is a directory.`));
      return 1;
    }
    try {
      existing = readFileSync(target, 'utf8');
    } catch (err) {
      log(c.red(`Error: cannot read ${shown}: ${err.message}`));
      return 1;
    }
    if (!existing.trim()) existing = null;
  }

  const { markdown, sections, merge } = generateReadme(info, {
    lang,
    badges: !opts['no-badges'],
    toc: !opts['no-toc'],
    tree: !opts['no-tree'] && depth > 0,
    emoji: !opts['no-emoji'],
    existing,
    reset: opts.reset,
  });
  for (const warning of merge?.warnings ?? []) log(c.yellow(`! ${warning}`));

  if (opts.stdout) {
    io.stdout.write(markdown);
    return 0;
  }

  const t = translator(lang);
  const sectionName = (id) => (id === 'header' ? 'title & description' : t(`sections.${id}`));

  // A README written by hand: readme-start replaces its standard sections, so ask first.
  if (merge && merge.source !== 'readme-start' && !opts.force) {
    const replaced = [merge.introReplaced && 'introduction', ...merge.replaced].filter(Boolean);
    const kept = [...merge.custom, merge.blocks && `${merge.blocks} keep block${merge.blocks > 1 ? 's' : ''}`].filter(Boolean);
    log(`${shown} was not created by readme-start.`);
    if (replaced.length) log(`  ${c.dim('Replaced')}  ${replaced.join(', ')}`);
    if (kept.length) log(`  ${c.dim('Kept')}      ${kept.join(', ')}`);
    if (!interactive) {
      log(c.yellow('Nothing was written.'));
      log(`Use ${c.cyan('--force')} to go ahead, ${c.cyan('--output')} to write elsewhere or ${c.cyan('--stdout')} to preview.`);
      log(`Tip: wrap the parts you want to keep between ${c.cyan('<!-- readme-start:keep -->')} and ${c.cyan('<!-- readme-start:end -->')}.`);
      return 1;
    }
    const answer = await ask(io, `${c.cyan('?')} Continue? ${c.dim('[y/N]')} `);
    if (!/^(y|yes|o|oui)$/i.test(answer)) {
      log('Nothing was written.');
      return 0;
    }
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, markdown, 'utf8');

  const detected = info.ecosystems.map((e) => (e.packageManager && e.packageManager !== e.id ? `${e.label} (${e.packageManager})` : e.label));
  log(`${c.green('✔')} ${c.bold(shown)} ${existing ? 'updated' : 'generated'}`);
  log(`  ${c.dim('Detected')}  ${detected.join(', ') || 'no known ecosystem'}`);
  if (info.workspace) log(`  ${c.dim('Monorepo')}  ${info.workspace.tool}, ${info.workspace.packages.length} packages`);
  if (info.tech.length) log(`  ${c.dim('Stack')}     ${info.tech.map((tech) => tech.name).join(', ')}`);
  log(`  ${c.dim('Sections')}  ${sections.join(' · ')}`);
  if (merge) {
    const kept = [
      merge.custom.length && `${merge.custom.join(', ')} (your sections)`,
      merge.edited.length && `${merge.edited.map(sectionName).join(', ')} (edited by hand)`,
      merge.blocks && `${merge.blocks} keep block${merge.blocks > 1 ? 's' : ''}`,
    ].filter(Boolean);
    if (kept.length) log(`  ${c.dim('Kept')}      ${kept.join(' · ')}`);
    if (merge.edited.length) log(c.dim(`  Run with --reset to regenerate the sections you edited.`));
  }
  if (!info.description) log(c.yellow('  Tip: no description was found, fill in the placeholder at the top of the file.'));
  return 0;
}
