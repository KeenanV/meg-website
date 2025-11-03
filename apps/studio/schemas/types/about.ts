import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'about',
  title: 'About (single)',
  type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', title: 'Name', validation: r => r.required() }),
    defineField({ name: 'headshot', type: 'image', title: 'Headshot', options: { hotspot: true } }),
    defineField({
      name: 'bio',
      title: 'Bio',
      type: 'array',
      of: [{ type: 'block' }]
    })
  ]
});