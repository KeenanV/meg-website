import {defineLocations, defineDocuments} from 'sanity/presentation';

export const mainDocuments = defineDocuments([
  {route: '/', filter: '_id == "siteSettings"'},
  {route: '/about', filter: '_id == "about"'},
  {route: '/links', filter: '_id == "linksPage"'},
  {route: '/books', filter: '_type == "book"'},
  {route: '/resources', filter: '_type == "meditation"'},
  {route: '/blog/:slug', filter: '_type == "blogPost" && slug.current == $slug'},
  {route: '/news/:slug', filter: '_type == "newsItem" && slug.current == $slug'},
]);

const page = (title: string, href: string) => defineLocations({locations: [{title, href}]});
export const locations = {
  siteSettings: page('Home', '/'), about: page('About', '/about'), linksPage: page('Links', '/links'),
  book: page('Books', '/books'), meditation: page('Resources', '/resources'),
  blogPost: defineLocations({select: {title: 'title', slug: 'slug.current'},
    resolve: doc => ({locations: [{title: doc?.title || 'Blog', href: doc?.slug ? `/blog/${encodeURIComponent(doc.slug)}` : '/blog'}, {title: 'Home', href: '/'}]})}),
  newsItem: defineLocations({select: {title: 'title', slug: 'slug.current'},
    resolve: doc => ({locations: [{title: doc?.title || 'News', href: doc?.slug ? `/news/${encodeURIComponent(doc.slug)}` : '/news'}, {title: 'Home', href: '/'}]})}),
};
