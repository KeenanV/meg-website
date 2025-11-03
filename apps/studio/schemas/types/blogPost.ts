import {defineType, defineField, defineArrayMember} from 'sanity';

export default defineType({
  name: 'blogPost',
  title: 'Blog Post',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', title: 'Title', validation: r => r.required() }),
    defineField({ name: 'slug', type: 'slug', title: 'Slug', options: { source: 'title', maxLength: 96 } }),
    defineField({ name: 'cover', type: 'image', title: 'Cover', options: { hotspot: true } }),
    defineField({ name: 'publishedAt', type: 'datetime', title: 'Published at' }),
    defineField({ name: 'excerpt', type: 'text', title: 'Excerpt' }),
    defineField({ name: 'body', title: 'Body', type: 'array', of: [defineArrayMember({ type: 'block' })] }),
    defineField({ name: 'tags', type: 'array', of: [defineArrayMember({ type: 'string' })] })
  ]
});