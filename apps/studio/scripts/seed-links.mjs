// Create the initial Links Page once. Existing editor content is never replaced.
// Run through `sanity exec` with --with-user-token; pass --apply to save.
import { getCliClient } from 'sanity/cli';

const client = getCliClient({ apiVersion: '2025-10-26' }).withConfig({ useCdn: false });
const existing = await client.fetch('*[_id in ["linksPage", "drafts.linksPage"]]{_id}', {}, { perspective: 'raw' });
if (existing.length) {
  console.log('Links Page already exists; no changes made.');
} else {
  const { settings, books } = await client.fetch(`{
    "settings": *[_id == "siteSettings"][0]{socials},
    "books": *[_type == "book"]{title, buyLinks}
  }`);
  const social = name => settings?.socials?.find(link => link.label?.toLowerCase() === name)?.url;
  const book = books.find(item => /stressed in the (?:us|u\.s\.)/i.test(item.title));
  const amazon = book?.buyLinks?.find(link => {
    try { return /(^|\.)amazon\.com$/.test(new URL(link.url).hostname); } catch { return false; }
  })?.url;
  const item = (key, label, icon, url) => ({ _key: key, _type: 'profileLink', label, icon, ...(url ? { url } : {}) });
  const page = {
    _id: 'linksPage', _type: 'linksPage', title: 'Clinical Psychologist · Author',
    links: [
      item('linkedin', 'LinkedIn', 'linkedin', social('linkedin')),
      item('amazon', 'Stressed in the US', 'amazon', amazon),
      item('instagram', 'Instagram', 'instagram', social('instagram')),
      item('bluesky', 'Bluesky', 'bluesky', social('bluesky')),
      item('home', 'Website', 'home', '/'),
      item('contact', 'Contact', 'contact', '/contact'),
      item('blog', 'Blog', 'blog', '/blog'),
      item('news', 'News', 'news', '/news'),
    ],
  };
  if (process.argv.includes('--apply')) {
    const saved = await client.createIfNotExists(page);
    console.log(`Created ${saved._id} with ${saved.links.length} links.`);
  } else {
    console.log(JSON.stringify(page, null, 2));
    console.log('Preview only. Pass --apply to create this document.');
  }
}
