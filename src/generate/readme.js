import { staticBadge, techBadge } from '../lib/badges.js';
import { SECTION_ORDER, translator } from './i18n.js';
import { codeBlock, escapeCell, escapeHtml, indent, inlineCode, slugify, truncate } from './markdown.js';
import { checksum, extractHeadings, placeInside, planMerge, renderFooter, SLOTS } from './merge.js';

// Emojis without variation selectors, so GitHub anchors stay predictable.
const EMOJI = {
  tech: '🧰',
  prerequisites: '✅',
  installation: '📦',
  usage: '🚀',
  packages: '🧩',
  configuration: '🔧',
  scripts: '📋',
  tests: '🧪',
  docker: '🐳',
  structure: '📁',
  contributing: '🤝',
  license: '📄',
  author: '👤',
};

const MIN_SECTIONS_FOR_TOC = 3;

const renderBadge = (b) => (b.link ? `[![${b.alt}](${b.img})](${b.link})` : `![${b.alt}](${b.img})`);

function collectBadges(info) {
  const badges = info.badges.filter((b) => b.kind === 'registry' || b.kind === 'docs');
  const workflow = info.ci?.github?.[0];
  if (workflow && info.repository?.host === 'github.com') {
    const base = `${info.repository.url}/actions/workflows/${encodeURIComponent(workflow.file)}`;
    badges.push({ alt: workflow.name, img: `${base}/badge.svg`, link: base });
  }
  if (info.license && info.license !== 'UNLICENSED') {
    badges.push({ alt: 'license', img: staticBadge('license', info.license, 'green'), link: info.licenseFile ?? undefined });
  }
  badges.push(...info.badges.filter((b) => b.kind === 'runtime'));
  return badges;
}

// When several ecosystems contribute steps, suffix them with the ecosystem
// name so "Install the dependencies" is not ambiguous.
function labelSteps(steps) {
  const ecosystems = new Set(steps.map((s) => s.eco).filter(Boolean));
  return ecosystems.size > 1 ? steps.map((s) => ({ ...s, suffix: s.eco })) : steps;
}

const stepText = (t, step) => `${t(step.t)}${step.suffix ? ` (${step.suffix})` : ''}`;

function describeScript(script, t) {
  if (script.description) return script.description;
  const known = t('scripts.known');
  if (Object.hasOwn(known, script.name)) return known[script.name];
  if (script.raw) return t('scripts.runs', { raw: inlineCode(truncate(script.raw, 60)) });
  return t('scripts.target', { name: script.name });
}

function dockerImageName(name) {
  const image = name
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  return image || 'app';
}

const SECTIONS = {
  tech({ info }) {
    if (!info.tech.length) return null;
    return info.tech.map((tech) => `![${tech.name}](${techBadge(tech)})`).join('\n');
  },

  prerequisites({ info, t }) {
    const items = info.requirements.map((r) => {
      const name = r.url ? `[${r.name}](${r.url})` : r.name;
      return `- ${name}${r.version ? ` ${inlineCode(r.version)}` : ''}`;
    });
    if (info.docker) items.push(`- [Docker](https://www.docker.com/) _(${t('prerequisites.optional')})_`);
    return items.length ? items.join('\n') : null;
  },

  installation({ info, t }) {
    const repo = info.repository;
    const steps = [
      { t: 'install.clone', code: `git clone ${repo ? `${repo.url}.git` : '<repository-url>'}\ncd ${repo?.repo ?? info.dirName}` },
      ...labelSteps(info.install),
    ];
    if (info.env) steps.push({ t: 'install.env', code: `cp ${info.env.file} .env` });
    return steps
      .map((step, i) => `${i + 1}. ${stepText(t, step)}\n\n${indent(codeBlock(step.code, step.lang), 3)}`)
      .join('\n\n');
  },

  usage({ info, t, colon }) {
    if (!info.usage.length) return info.staticSite ? t('usage.openHtml') : `_${t('placeholder.usage')}_`;
    const render = (blocks) =>
      blocks.map((b) => `${t(b.t)}${colon}\n\n${codeBlock(b.code, b.lang)}`).join('\n\n');
    const ecosystems = [...new Set(info.usage.map((u) => u.eco))];
    if (ecosystems.length < 2) return render(info.usage);
    return ecosystems.map((eco) => `### ${eco}\n\n${render(info.usage.filter((u) => u.eco === eco))}`).join('\n\n');
  },

  packages({ info, t, colon }) {
    const workspace = info.workspace;
    if (!workspace?.packages.length) return null;
    const rows = workspace.packages.map((p) => {
      const description = p.description ? escapeCell(p.description) : '—';
      return `| [${escapeCell(p.name)}](${encodeURI(p.path)}) | ${description} |`;
    });
    const parts = [
      t('packages.intro', { tool: workspace.tool }),
      [`| ${t('packages.package')} | ${t('packages.description')} |`, '| --- | --- |', ...rows].join('\n'),
    ];
    if (workspace.example) parts.push(`${t('packages.runOne')}${colon}\n\n${codeBlock(workspace.example)}`);
    return parts.join('\n\n');
  },

  configuration({ info, t }) {
    if (!info.env) return null;
    const rows = info.env.vars.map((v) => {
      const description = v.description ? escapeCell(v.description) : '—';
      const value = v.value ? escapeCell(inlineCode(v.value)) : '—';
      return `| \`${v.key}\` | ${description} | ${value} |`;
    });
    return [
      t('config.intro', { file: info.env.file }),
      '',
      `| ${t('config.variable')} | ${t('config.description')} | ${t('config.default')} |`,
      '| --- | --- | --- |',
      ...rows,
    ].join('\n');
  },

  scripts({ info, t }) {
    if (!info.scripts.length) return null;
    return [
      `| ${t('scripts.command')} | ${t('scripts.description')} |`,
      '| --- | --- |',
      ...info.scripts.map((s) => `| ${escapeCell(inlineCode(s.cmd))} | ${escapeCell(describeScript(s, t))} |`),
    ].join('\n');
  },

  tests({ info, t, colon }) {
    if (!info.tests.length) return null;
    return labelSteps(info.tests)
      .map((step) => `${stepText(t, step)}${colon}\n\n${codeBlock(step.code, step.lang)}`)
      .join('\n\n');
  },

  docker({ info, t, colon }) {
    const docker = info.docker;
    if (!docker) return null;
    const parts = [];
    if (docker.compose) parts.push(`${t('docker.compose')}${colon}\n\n${codeBlock('docker compose up --build')}`);
    if (docker.dockerfile) {
      const image = dockerImageName(info.name);
      const flags = [docker.port && `-p ${docker.port}:${docker.port}`, info.env && '--env-file .env'].filter(Boolean);
      const run = ['docker run', ...flags, image].join(' ');
      const label = docker.compose ? t('docker.imageAlt') : t('docker.image');
      const build = docker.dockerfile === 'Dockerfile' ? '' : ` -f ${docker.dockerfile}`;
      parts.push(`${label}${colon}\n\n${codeBlock(`docker build${build} -t ${image} .\n${run}`)}`);
    }
    return parts.join('\n\n');
  },

  structure({ info, opts }) {
    if (!opts.tree || !info.tree) return null;
    return codeBlock(info.tree, 'text');
  },

  contributing({ info, t }) {
    const parts = [];
    const { contributing, codeOfConduct } = info.docs ?? {};
    if (contributing) {
      parts.push(t('contributing.guide', { file: `[${contributing}](${contributing})` }));
    } else {
      parts.push(t('contributing.intro'));
      parts.push(t('contributing.steps').map((step, i) => `${i + 1}. ${step}`).join('\n'));
    }
    if (info.repository && ['github.com', 'gitlab.com'].includes(info.repository.host)) {
      parts.push(t('contributing.issues', { url: `${info.repository.url}/issues` }));
    }
    if (codeOfConduct) parts.push(t('contributing.coc', { file: codeOfConduct }));
    return parts.join('\n\n');
  },

  license({ info, t }) {
    if (info.license === 'UNLICENSED') return t('license.proprietary');
    const see = info.licenseFile ? t('license.see', { file: `[\`${info.licenseFile}\`](${info.licenseFile})` }) : null;
    if (!info.license) return see;
    return [t('license.text', { license: `**${info.license}**` }), see].filter(Boolean).join(' ');
  },

  author({ info }) {
    const author = info.author;
    if (!author) return null;
    const name = author.url ? `[${author.name}](${author.url})` : author.name;
    return [`**${name}**`, author.email && `[${author.email}](mailto:${author.email})`].filter(Boolean).join(' · ');
  },
};

function renderHeader({ info, t, opts }) {
  const lines = ['<div align="center">', '', `# ${info.name}`, ''];
  lines.push(info.description ? escapeHtml(info.description) : `_${t('placeholder.description')}_`);
  if (info.homepage) lines.push('', `[${t('website')}](${info.homepage})`);
  if (opts.badges) {
    const badges = collectBadges(info);
    if (badges.length) lines.push('', badges.map(renderBadge).join('\n'));
  }
  lines.push('', '</div>');
  return lines.join('\n');
}

// GitHub suffixes repeated anchors with -1, -2…
function tableOfContents(headings) {
  const seen = new Map();
  return headings
    .map((heading) => {
      const text = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      const slug = slugify(text);
      const count = seen.get(slug) ?? 0;
      seen.set(slug, count + 1);
      return `- [${text}](#${count ? `${slug}-${count}` : slug})`;
    })
    .join('\n');
}

/**
 * Turns the result of analyzeProject() into README markdown.
 *
 * Pass the current README as `existing` to keep what you wrote: your own
 * sections, <!-- readme-start:keep --> blocks and generated sections you edited
 * (see merge.js). `reset: true` regenerates edited sections anyway.
 *
 * Returns { markdown, sections, merge } where `sections` lists the generated
 * section titles and `merge` describes what was kept (null without `existing`).
 */
export function generateReadme(info, options = {}) {
  const opts = { lang: 'en', badges: true, toc: true, tree: true, emoji: true, existing: null, reset: false, ...options };
  const t = translator(opts.lang);
  const ctx = { info, t, opts, colon: t('colon') };

  const generated = new Map([['header', renderHeader(ctx)]]);
  for (const id of SECTION_ORDER) {
    const body = SECTIONS[id](ctx);
    if (body) generated.set(id, `## ${opts.emoji ? `${EMOJI[id]} ` : ''}${t(`sections.${id}`)}\n\n${body}`);
  }

  const plan = opts.existing ? planMerge(opts.existing, { reset: opts.reset }) : null;
  const items = plan?.items ?? [];
  const replaced = new Set(items.flatMap((item) => item.replaces));

  const present = new Set(['start']);
  for (const slot of generated.keys()) if (!replaced.has(slot)) present.add(slot);
  if (opts.toc && !replaced.has('toc')) present.add('toc');

  // Kept content follows the section it followed before; if that section is
  // gone, it follows the closest earlier one.
  const effectiveSlot = (anchor) => {
    let index = Math.max(SLOTS.indexOf(anchor), 0);
    while (index > 0 && !present.has(SLOTS[index])) index--;
    return SLOTS[index];
  };
  const clean = (text) => text.replace(/^\s*\n/, '').trimEnd();
  const keptBySlot = new Map();
  const insideBySlot = new Map();
  const attach = (map, slot, item) => {
    if (!map.has(slot)) map.set(slot, []);
    map.get(slot).push({ ...item, text: clean(item.text) });
  };
  for (const item of items) {
    if (item.inside && present.has(item.inside) && generated.has(item.inside)) attach(insideBySlot, item.inside, item);
    else attach(keptBySlot, effectiveSlot(item.anchor), item);
  }

  const blocks = [];
  for (const slot of SLOTS) {
    const kept = keptBySlot.get(slot) ?? [];
    if (slot !== 'start' && present.has(slot)) {
      const original = generated.get(slot) ?? null;
      // Keep blocks go back between the paragraphs they sat between; the
      // checksum is still computed on the generated text alone.
      const { text, leftovers } = original ? placeInside(original, insideBySlot.get(slot) ?? []) : { text: null, leftovers: [] };
      blocks.push({ slot, text, original });
      kept.unshift(...leftovers);
    }
    for (const item of kept) if (item.text) blocks.push({ slot: null, text: item.text });
  }

  // The table of contents is built last so that it lists your sections too.
  const tocIndex = blocks.findIndex((b) => b.slot === 'toc');
  if (tocIndex >= 0) {
    const headings = blocks.filter((b) => b.text).flatMap((b) => extractHeadings(b.text));
    if (headings.length >= MIN_SECTIONS_FOR_TOC) blocks[tocIndex].text = `## ${t('toc')}\n\n${tableOfContents(headings)}`;
    else blocks.splice(tocIndex, 1);
  }

  const checksums = Object.fromEntries(
    blocks.filter((b) => b.slot && b.slot !== 'toc').map((b) => [b.slot, checksum(b.original)]),
  );
  const markdown = `${[...blocks.map((b) => b.text), renderFooter(checksums)].join('\n\n')}\n`;

  return {
    markdown,
    sections: SECTION_ORDER.filter((id) => present.has(id)).map((id) => t(`sections.${id}`)),
    merge: plan ? { ...plan.report, warnings: plan.warnings } : null,
  };
}
