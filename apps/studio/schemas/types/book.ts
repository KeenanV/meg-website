import {defineType, defineField, defineArrayMember} from 'sanity';
import { imageAlt } from '../fields';

export default defineType({
  name: 'book',
  title: 'Book',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', title: 'Title', validation: r => r.required() }),
    defineField({ name: 'slug', type: 'slug', title: 'Slug', options: { source: 'title', maxLength: 96 } }),
    defineField({ name: 'cover', type: 'image', title: 'Cover', options: { hotspot: true }, fields: [imageAlt] }),
    defineField({ name: 'description', type: 'text', title: 'Description' }),
    defineField({ name: 'year', type: 'number', title: 'Year' }),
    defineField({
      name: 'buyLinks',
      title: 'Buy Links',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'buyLink',
          fields: [
            defineField({ name: 'label', type: 'string', title: 'Label', validation: rule => rule.required() }),
            defineField({ name: 'url', type: 'url', title: 'URL', validation: rule => rule.required().uri({scheme: ['http', 'https']}) })
          ]
        })
      ]
    })
  ]
});