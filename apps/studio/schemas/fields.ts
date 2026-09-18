import { defineArrayMember, defineField } from 'sanity';

export const articleSlug = defineField({
  name: 'slug', title: 'Slug', type: 'slug',
  description: 'Used in the page address. Generate it from the title; changing a published slug changes its URL.',
  options: { source: 'title', maxLength: 96 },
  validation: rule => rule.required().custom(value =>
    !value?.current || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.current)
      ? true : 'Use lowercase letters, numbers, and single hyphens only.'),
});
export const imageAlt = defineField({
  name: 'alt', title: 'Alternative text', type: 'string',
  description: 'Describe meaningful visual information. Leave empty for a purely decorative image.',
});
export const richTextMembers = [
  defineArrayMember({
    type: 'block',
    marks: {
      annotations: [{
        name: 'link', type: 'object', title: 'Link',
        fields: [defineField({
          name: 'href', type: 'url', title: 'URL',
          validation: rule => rule.required().uri({ scheme: ['http', 'https', 'mailto'], allowRelative: true }),
        })],
      }],
    },
  }),
  defineArrayMember({
    type: 'image', options: { hotspot: true }, fields: [imageAlt],
    validation: rule => rule.required().assetRequired(),
  }),
];
