const SHIELDS = 'https://img.shields.io';

/** Escapes text for a shields.io static badge path segment. */
export const badgeText = (text) =>
  encodeURIComponent(String(text)).replace(/-/g, '--').replace(/_/g, '__');

/**
 * Builds a static shields.io badge URL. With a null label the badge shows only
 * the message (used for "tech stack" logo badges).
 */
export function staticBadge(label, message, color, { logo, logoColor = 'white', style } = {}) {
  const content = label
    ? `${badgeText(label)}-${badgeText(message)}-${color}`
    : `${badgeText(message)}-${color}`;
  const query = new URLSearchParams();
  if (style) query.set('style', style);
  if (logo) {
    query.set('logo', logo);
    query.set('logoColor', logoColor);
  }
  const qs = query.toString();
  return `${SHIELDS}/badge/${content}${qs ? `?${qs}` : ''}`;
}

export const techBadge = (tech) =>
  staticBadge(null, tech.name, tech.color, { logo: tech.logo, logoColor: tech.logoColor, style: 'for-the-badge' });

export const shields = (path) => `${SHIELDS}/${path}`;
