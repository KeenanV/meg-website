import { defineType, defineField, defineArrayMember } from 'sanity';
import { articleSlug, imageAlt, richTextMembers } from '../fields';

export default defineType({
  name: 'blogPost', title: 'Blog Post', type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', title: 'Title', validation: rule => rule.required() }),
    articleSlug,
    defineField({ name: 'cover', type: 'image', title: 'Cover', options: { hotspot: true }, fields: [imageAlt] }),
    defineField({ name: 'publishedAt', type: 'datetime', title: 'Published at',
      description: 'Displayed as a UTC date. This is editorial metadata, not scheduled publishing.',
      validation: rule => rule.required() }),
    defineField({ name: 'excerpt', type: 'text', title: 'Excerpt', rows: 3 }),
    defineField({ name: 'body', title: 'Body', type: 'array', of: richTextMembers, validation: rule => rule.required().min(1) }),
    defineField({ name: 'tags', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
  ],
});
