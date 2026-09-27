import {defineType, defineField, defineArrayMember} from 'sanity';
import { imageAlt, richTextMembers } from '../fields';

export default defineType({
  name: 'book',
  title: 'Book',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', title: 'Title', validation: r => r.required() }),
    defineField({ name: 'slug', type: 'slug', title: 'Slug', options: { source: 'title', maxLength: 96 } }),
    defineField({ name: 'cover', type: 'image', title: 'Cover', options: { hotspot: true }, fields: [imageAlt] }),
    // Retain the original content for older builds and rollback during migration.
    defineField({ name: 'description', type: 'text', title: 'Legacy description', hidden: true, readOnly: true }),
    defineField({ name: 'descriptionRichText', type: 'array', title: 'Description', of: richTextMembers,
      description: 'The main book description. Put author quotes in Endorsements below to keep the card concise.' }),
    defineField({ name: 'endorsements', type: 'array', title: 'Endorsements', of: richTextMembers,
      description: 'Shown in an expandable “Read endorsements” section. Use the Quote style for quotes, followed by the author’s name.' }),
    defineField({ name: 'year', type: 'number', title: 'Year',
      description: 'Publication year. Leave empty to display “Coming Soon”.',
      validation: rule => rule.integer().min(1).max(9999) }),
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
