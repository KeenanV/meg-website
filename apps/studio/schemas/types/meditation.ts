import {defineField, defineType} from 'sanity';
import {imageAlt} from '../fields';

export default defineType({
  name: 'meditation', title: 'Meditation', type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: rule => rule.required()}),
    defineField({name: 'cover', title: 'Picture', type: 'image', options: {hotspot: true},
      fields: [imageAlt], validation: rule => rule.required().assetRequired()}),
    defineField({name: 'excerpt', title: 'Excerpt', type: 'text', rows: 4,
      description: 'A short description shown when the meditation card flips over (up to 500 characters).',
      validation: rule => rule.required().max(500)}),
    defineField({name: 'audio', title: 'MP3 file', type: 'file', options: {accept: 'audio/mpeg,.mp3'},
      description: 'Upload an MP3. The Resources page is unlisted, but its audio files are publicly accessible.',
      validation: rule => rule.required().assetRequired().custom(value =>
        !value?.asset?._ref || /-mp3$/i.test(value.asset._ref) ? true : 'Choose an MP3 audio file.')}),
  ],
  orderings: [{title: 'Title', name: 'titleAsc', by: [{field: 'title', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'excerpt', media: 'cover'}},
});
