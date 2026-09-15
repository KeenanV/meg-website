import type { PortableTextBlock } from '@portabletext/types';

export interface ContentImage {
  _type?: 'image';
  asset: { _ref: string; _type?: 'reference' };
  alt?: string;
  crop?: { top: number; bottom: number; left: number; right: number };
  hotspot?: { x: number; y: number; width: number; height: number };
}
export type RichText = Array<PortableTextBlock | (ContentImage & { _type: 'image' })>;
export interface SiteSettings { title?: string; description?: string }
export interface About {
  name?: string; headshot?: ContentImage;
  about?: RichText; approach?: RichText; feesInsurance?: RichText;
}
export interface Article {
  title: string; slug: string; cover?: ContentImage;
  excerpt?: string; publishedAt?: string; date?: string; body?: RichText;
}
export interface Book {
  title: string; cover?: ContentImage; year?: number; description?: string;
  buyLinks?: Array<{ label?: string; url?: string }>;
}
export function hasValidSlug<T extends { slug?: unknown }>(entry: T): entry is T & { slug: string } {
  return typeof entry.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug);
}
// Route props keep the page and its slug in the same published snapshot.
export function articlePaths(items: Article[]) {
  const seen = new Set<string>();
  return items.filter(hasValidSlug).map((entry) => {
    if (seen.has(entry.slug)) throw new Error('Duplicate article slug: ' + entry.slug);
    seen.add(entry.slug);
    return { params: { slug: entry.slug }, props: { entry } };
  });
}
