import { toHTML } from '@portabletext/to-html';
import type { ContentImage, RichText } from './content.ts';
import { escapeAttribute, safeHref } from './urls.ts';

export function portableTextToHtml(value?: RichText | null, imageUrl?: (image: ContentImage) => string): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  return toHTML(value, {
    components: {
      marks: {
        link: ({ children, value }) => {
          const href = safeHref(value?.href);
          if (!href) return children;
          const external = /^https?:/i.test(href);
          return '<a href="' + escapeAttribute(href) + '"' +
            (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + children + '</a>';
        },
      },
      types: {
        image: ({ value }) => {
          if (!imageUrl || !value?.asset?._ref) return '';
          try {
            const src = safeHref(imageUrl(value));
            if (!src || !/^https?:/i.test(src)) return '';
            const alt = typeof value.alt === 'string' ? value.alt : '';
            return '<img src="' + escapeAttribute(src) + '" alt="' + escapeAttribute(alt) +
              '" loading="lazy" decoding="async" />';
          } catch { return ''; }
        },
      },
    },
  });
}
