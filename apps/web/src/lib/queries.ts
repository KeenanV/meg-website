import groq from 'groq';

export const qSite = groq`*[_type == "siteSettings"][0]{title, description, socials}`;

export const qAbout = groq`*[_type == "about"][0]{name, bio, headshot}`;

export const qBooks = groq`*[_type == "book"]|order(year desc){
  title, "slug": slug.current, cover, description, year, buyLinks
}`;

export const qPosts = groq`*[_type == "blogPost"]|order(publishedAt desc){
  title, "slug": slug.current, cover, publishedAt, excerpt
}`;

export const qPostBySlug = groq`*[_type == "blogPost" && slug.current == $slug][0]{
  title, cover, publishedAt, body
}`;

export const qNews = groq`*[_type == "newsItem"]|order(date desc){
  title, "slug": slug.current, date, body
}`;

export const qNewsBySlug = groq`*[_type == "newsItem" && slug.current == $slug][0]{
  title, date, body
}`;