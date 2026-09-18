import { defineType, defineField } from 'sanity';
import { articleSlug, imageAlt, richTextMembers } from '../fields';

export default defineType({
  name: 'newsItem', title: 'News Item', type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', title: 'Title', validation: rule => rule.required() }),
    articleSlug,
    defineField({ name: 'cover', type: 'image', title: 'Cover', options: { hotspot: true }, fields: [imageAlt] }),
    defineField({ name: 'date', type: 'date', title: 'Date', validation: rule => rule.required() }),
    defineField({ name: 'body', title: 'Body', type: 'array', of: richTextMembers, validation: rule => rule.required().min(1) }),
  ],
});
