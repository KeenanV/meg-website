import groq from 'groq';

export const qSite = groq`*[_id == "siteSettings"][0]{title, description}`;
export const qAbout = groq`*[_id == "about"][0]{name, headshot, about, approach, feesInsurance}`;
export const qBooks = groq`*[_type == "book"] | order(year desc, title asc){title, cover, description, year, buyLinks}`;
export const qPosts = groq`*[_type == "blogPost" && defined(slug.current) && slug.current != ""] | order(publishedAt desc, title asc){
  title, "slug": slug.current, cover, publishedAt, excerpt
}`;
export const qNews = groq`*[_type == "newsItem" && defined(slug.current) && slug.current != ""] | order(date desc, title asc){
  title, "slug": slug.current, cover, date
}`;
export const qPostPages = groq`*[_type == "blogPost" && defined(slug.current) && slug.current != ""] | order(publishedAt desc){
  title, "slug": slug.current, cover, publishedAt, body, excerpt
}`;
export const qNewsPages = groq`*[_type == "newsItem" && defined(slug.current) && slug.current != ""] | order(date desc){
  title, "slug": slug.current, cover, date, body
}`;
export const qHome = groq`{
  "posts": *[_type == "blogPost" && defined(slug.current) && slug.current != ""] | order(publishedAt desc, title asc)[0...3]{title, "slug": slug.current, publishedAt, excerpt},
  "news": *[_type == "newsItem" && defined(slug.current) && slug.current != ""] | order(date desc, title asc)[0...3]{title, "slug": slug.current, date}
}`;
