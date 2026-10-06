import { defineConfig } from 'sanity';
import {structureTool} from 'sanity/structure';
import {visionTool} from '@sanity/vision';
import { schemaTypes } from './schemas';
import { structure } from './structure';
const SINGLETON_TYPES = new Set(['siteSettings', 'about', 'linksPage'])
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';
if (!['production', 'staging'].includes(dataset)) throw new Error('Unknown Studio dataset');

export default defineConfig({
  name: 'default',
  title: dataset === 'staging' ? "Meg's Studio — STAGING" : "Meg's Studio",
  projectId: 'ap0mc9ri',
  dataset,
  plugins: [
    structureTool({ structure }),       // <— this renders the editor UI
    visionTool()      // handy GROQ playground (optional)
  ],
  schema: { types: schemaTypes },
  document: {
    // 1) Remove "Create new" for singleton types
    newDocumentOptions: (prev, { creationContext }) => {
      if (creationContext.type === 'global') {
        return prev.filter((templateItem) => !SINGLETON_TYPES.has(templateItem.templateId))
      }
      return prev
    },

    // 2) Remove dangerous actions for singleton docs
    actions: (prev, { schemaType }) => {
      if (SINGLETON_TYPES.has(schemaType)) {
        return prev.filter(
            ({ action }) => !['delete', 'duplicate'].includes(action!)
        )
      }
      return prev
    }
  }
});
