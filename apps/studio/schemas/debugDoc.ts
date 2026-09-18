import {defineType, defineField} from 'sanity';

export default defineType({
  name: 'debugDoc',
  title: 'Debug Doc',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: r => r.required()}),
  ],
});