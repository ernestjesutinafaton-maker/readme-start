const SHORTHAND_HOSTS = { github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org' };

function fromHostPath(host, path) {
  if (!host) return null;
  const parts = path
    .replace(/\.git\/?$/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 2) return null;
  // GitLab allows nested groups: everything but the last segment is the owner.
  const repo = parts[parts.length - 1];
  const owner = parts.slice(0, -1).join('/');
  return { host: host.toLowerCase(), owner, repo, url: `https://${host.toLowerCase()}/${owner}/${repo}` };
}

/**
 * Normalizes any repository reference found in manifests or .git/config into
 * a public https URL. Credentials embedded in URLs are always dropped, so a
 * token stored in a git remote never ends up in a README.
 *
 * Accepts: "github:user/repo", "user/repo", { url }, "git+https://…",
 * "git@host:user/repo.git", "ssh://git@host/user/repo.git", "https://…".
 */
export function parseRepository(input) {
  const raw = typeof input === 'string' ? input : input?.url;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const value = raw.trim();

  let m = /^(github|gitlab|bitbucket):([\w.-]+)\/([\w.-]+)$/.exec(value);
  if (m) return fromHostPath(SHORTHAND_HOSTS[m[1]], `${m[2]}/${m[3]}`);

  m = /^([\w.-]+)\/([\w.-]+)$/.exec(value);
  if (m) return fromHostPath('github.com', value);

  m = /^[\w.-]+@([\w.-]+):(?!\/\/)(.+)$/.exec(value);
  if (m) return fromHostPath(m[1], m[2]);

  try {
    const url = new URL(value.replace(/^git\+/, ''));
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    return fromHostPath(url.hostname, url.pathname);
  } catch {
    return null;
  }
}
