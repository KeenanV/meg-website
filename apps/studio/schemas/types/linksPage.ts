import { defineType, defineField, defineArrayMember } from 'sanity';
import { linkIcons } from '../../../../shared/link-icons';
import { imageAlt } from '../fields';

export default defineType({
  name: 'linksPage', title: 'Links Page', type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', title: 'Display name',
      description: 'Leave empty to use the name from About.' }),
    defineField({ name: 'title', type: 'string', title: 'Professional title',
      initialValue: 'Clinical Psychologist · Author', validation: rule => rule.required() }),
    defineField({ name: 'portrait', type: 'image', title: 'Portrait', options: { hotspot: true },
      fields: [imageAlt], description: 'Optional. Uses the About portrait when empty.' }),
    defineField({ name: 'links', type: 'array', title: 'Links',
      description: 'Drag items to reorder them. Add or remove links here, then publish your changes. The website updates on its next build.',
      of: [defineArrayMember({
        name: 'profileLink', title: 'Link', type: 'object',
        fields: [
          defineField({ name: 'label', type: 'string', title: 'Button text', validation: rule => rule.required() }),
          defineField({ name: 'url', type: 'url', title: 'Destination',
            description: 'Use a full https:// address or a website path such as /blog. Leave blank to show an unavailable button until you have the URL.',
            validation: rule => rule.uri({ scheme: ['https', 'http', 'mailto'], allowRelative: true }) }),
          defineField({ name: 'icon', type: 'string', title: 'Icon', initialValue: 'link',
            options: { list: [...linkIcons] }, validation: rule => rule.required() }),
          defineField({ name: 'customIcon', type: 'image', title: 'Custom icon',
            description: 'A transparent PNG or WebP works best. The button text provides its accessible label.',
            options: { accept: 'image/png,image/webp,image/jpeg' },
            hidden: ({ parent }) => parent?.icon !== 'custom',
            validation: rule => rule.custom((value, context) =>
              (context.parent as { icon?: string })?.icon === 'custom' && !value?.asset
                ? 'Upload an image for the custom icon.' : true) }),
        ],
        preview: {
          select: { title: 'label', url: 'url', icon: 'icon', media: 'customIcon' },
          prepare({ title, url, icon, media }) {
            const iconLabel = linkIcons.find(option => option.value === icon)?.title || 'Link';
            return { title: title || 'Untitled link', subtitle: `${iconLabel} · ${url || 'URL not added yet'}`, media };
          },
        },
      })],
    }),
  ],
  preview: { prepare: () => ({ title: 'Links Page', subtitle: '/links' }) },
});
