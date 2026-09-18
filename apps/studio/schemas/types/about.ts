import { defineType, defineField } from 'sanity';
import { imageAlt, richTextMembers } from '../fields';

export default defineType({
  name: 'about',
  title: 'About (single)',
  type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', title: 'Name', validation: r => r.required() }),
    defineField({ name: 'headshot', type: 'image', title: 'Headshot', options: { hotspot: true }, fields: [imageAlt] }),

    defineField({
      name: 'about',
      title: 'About',
      type: 'array',
      of: richTextMembers,
    }),

    defineField({
      name: 'approach',
      title: 'Approach',
      type: 'array',
      of: richTextMembers,
    }),

    defineField({
      name: 'feesInsurance',
      title: 'Fees & Insurance',
      type: 'array',
      of: richTextMembers,
    }),
  ],
});