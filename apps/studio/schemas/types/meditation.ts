import {defineField, defineType} from 'sanity';
import {imageAlt} from '../fields';

export default defineType({
  name: 'meditation', title: 'Recording', type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: rule => rule.required()}),
    defineField({name: 'recordingType', title: 'Recording type', type: 'string',
      description: 'The green label on the Resources card. Existing recordings without a selection display GUIDED MEDITATION.',
      initialValue: 'meditation',
      options: {layout: 'dropdown', list: [
        {title: 'GUIDED MEDITATION', value: 'meditation'},
        {title: 'GUIDED BREATHING', value: 'breathing'},
        {title: 'Other', value: 'other'},
      ]},
      validation: rule => rule.required()}),
    defineField({name: 'customRecordingType', title: 'Custom recording type', type: 'string',
      description: 'Enter a short label. The website displays it in ALL CAPS.',
      hidden: ({document}) => document?.recordingType !== 'other',
      validation: rule => rule.max(60).custom((value, context) =>
        context.document?.recordingType === 'other' && !value?.trim()
          ? 'Enter a label for this recording.' : true)}),
    defineField({name: 'cover', title: 'Picture', type: 'image', options: {hotspot: true},
      fields: [imageAlt], validation: rule => rule.required().assetRequired()}),
    defineField({name: 'excerpt', title: 'Excerpt', type: 'text', rows: 4,
      description: 'A short description shown when the recording card flips over (up to 500 characters).',
      validation: rule => rule.required().max(500)}),
    defineField({name: 'audio', title: 'MP3 file', type: 'file', options: {accept: 'audio/mpeg,.mp3'},
      description: 'Upload an MP3. The Resources page is unlisted, but its audio files are publicly accessible.',
      validation: rule => rule.required().assetRequired().custom(value =>
        !value?.asset?._ref || /-mp3$/i.test(value.asset._ref) ? true : 'Choose an MP3 audio file.')}),
  ],
  orderings: [{title: 'Title', name: 'titleAsc', by: [{field: 'title', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'excerpt', media: 'cover'}},
});
