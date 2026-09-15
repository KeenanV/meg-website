/** Allow explicit web/email links and local paths, never executable URL schemes. */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const href = value.trim();
  if (!href || /[\u0000-\u0020\u007f\\]/.test(href)) return undefined;
  if (href.startsWith('#')) return href;
  try {
    if (href.startsWith('/') || href.startsWith('?')) {
      const url = new URL(href, 'https://local.invalid');
      return url.origin === 'https://local.invalid' ? href : undefined;
    }
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
      ? href : undefined;
  } catch { return undefined; }
}
export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}
