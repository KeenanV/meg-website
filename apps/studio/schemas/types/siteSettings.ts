import {defineType, defineField, defineArrayMember} from 'sanity';

export default defineType({
  name: 'siteSettings',
  title: 'Site Settings (single)',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', title: 'Site Title' }),
    defineField({ name: 'description', type: 'text', title: 'Description' }),
    defineField({
      name: 'socials',
      title: 'Social Links',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'socialLink',
          fields: [
            defineField({ name: 'label', type: 'string', title: 'Label' }),
            defineField({ name: 'url', type: 'url', title: 'URL' })
          ]
        })
      ]
    })
  ]
});