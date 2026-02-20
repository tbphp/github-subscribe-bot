import { getCategoryMeta, type CategorizedRelease } from './types.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatOneRelease(release: CategorizedRelease, targetLang: string): string {
  const lines: string[] = [];
  const tag = escapeHtml(release.tag);

  lines.push(
    `${release.date}  <a href="${release.url}">${tag}</a>`,
  );

  for (const cat of release.categories) {
    const meta = getCategoryMeta(cat.type, targetLang);
    lines.push('');
    lines.push(`${meta.emoji} <b>${meta.label}</b>`);
    for (const item of cat.items) {
      lines.push(`• ${escapeHtml(item)}`);
    }
  }

  return lines.join('\n');
}

export function formatMessage(
  repo: string,
  releases: CategorizedRelease[],
  targetLang: string,
): string {
  const parts: string[] = [];

  parts.push(`<b>${escapeHtml(repo)}</b>`);

  for (let i = 0; i < releases.length; i++) {
    if (i > 0) parts.push('\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄');
    parts.push('');
    parts.push(formatOneRelease(releases[i], targetLang));
  }

  return parts.join('\n');
}

const TG_MAX_LENGTH = 4096;

export function splitMessages(
  repo: string,
  releases: CategorizedRelease[],
  targetLang: string,
): string[] {
  const full = formatMessage(repo, releases, targetLang);
  if (full.length <= TG_MAX_LENGTH) return [full];

  const messages: string[] = [];
  const header = `<b>${escapeHtml(repo)}</b>`;

  for (const release of releases) {
    const body = formatOneRelease(release, targetLang);
    const msg = `${header}\n\n${body}`;

    if (msg.length <= TG_MAX_LENGTH) {
      messages.push(msg);
    } else {
      messages.push(msg.slice(0, TG_MAX_LENGTH));
    }
  }

  return messages;
}
