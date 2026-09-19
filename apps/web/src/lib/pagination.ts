export type ArticleKind = 'blog' | 'news';
export const PAGE_SIZE = 12;

export function listingPath(kind: ArticleKind, page = 1) {
  return page === 1 ? `/${kind}` : `/${kind}/page/${page}/`;
}

export function paginate<T extends { slug: string }>(entries: T[], requestedPage = 1, slug?: string) {
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const index = slug === undefined ? -1 : entries.findIndex(entry => entry.slug === slug);
  if (slug !== undefined && index < 0) throw new Error(`Article missing from listing: ${slug}`);
  const page = index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : requestedPage;
  if (!Number.isInteger(page) || page < 1 || page > totalPages) throw new Error(`Invalid listing page: ${page}`);
  return { page, totalPages, entries: entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

// Keep navigation small even when an archive grows to hundreds of pages.
export function pageLinks(page: number, total: number): Array<number | 'gap'> {
  const pages = [...new Set([1, page - 1, page, page + 1, total])]
    .filter(value => value >= 1 && value <= total).sort((a, b) => a - b);
  return pages.flatMap((value, index) => index && value - pages[index - 1] > 1 ? ['gap', value] : [value]);
}
