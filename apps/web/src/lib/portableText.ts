import {toHTML} from "@portabletext/to-html";
import {urlFor} from "./sanity";

export function portableTextToHtml(value: any) {
  return toHTML(value, {
    components: {
      marks: {
        strong: ({children}) => `<strong>${children}</strong>`,
        em: ({children}) => `<em>${children}</em>`,
        link: ({children, value}) => {
          const href = value?.href || "#";
          const isExternal = /^https?:\/\//.test(href);
          const rel = isExternal ? "noopener noreferrer" : "";
          const target = isExternal ? "_blank" : "";
          return `<a href="${href}" ${target ? `target="${target}"` : ""} ${rel ? `rel="${rel}"` : ""}>${children}</a>`;
        },
      },
      types: {
        image: ({value}) => {
          // If you allow images inside rich text blocks
          const src = urlFor(value).width(1400).quality(85).url();
          const alt = value?.alt ?? "";
          return `<img src="${src}" alt="${alt}" />`;
        },
      },
    },
  });
}