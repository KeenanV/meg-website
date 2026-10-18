import {sanityProject} from '../backend/src/sanity-environments.mjs';
import { defineConfig } from 'sanity';
import {structureTool} from 'sanity/structure';
import {visionTool} from '@sanity/vision';
import { schemaTypes } from './schemas';
import { structure } from './structure';
import {presentationTool} from 'sanity/presentation';
import {locations, mainDocuments} from './presentation';
import {StagingSyncTool} from './components/StagingSyncTool';
import {PreviewDraftAction} from './components/PreviewDraftAction';
const SINGLETON_TYPES = new Set(['siteSettings', 'about', 'linksPage'])
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';
if (!['production', 'staging'].includes(dataset)) throw new Error('Unknown Studio dataset');

export default defineConfig({
  name: 'default',
  title: dataset === 'staging' ? "Meg's Studio — STAGING" : "Meg's Studio",
  projectId: sanityProject(process.env.SANITY_STUDIO_DATASET || 'production'),
  dataset,
  plugins: [
    structureTool({ structure }),       // <— this renders the editor UI
    presentationTool({title: 'Preview', resolve: {locations, mainDocuments},
      // Presentation's supported mode generates its own secret. The landing
      // page clears that URL and redeems it once through POST. Cloud log sinks
      // exclude these secret-bearing request URLs before retention.
      previewUrl: {initial: process.env.SANITY_STUDIO_PREVIEW_URL ||
        `https://editorial-preview-${dataset === 'staging' ? '76495183695' : '348807509213'}.us-west1.run.app`,
      previewMode: {enable: '/api/preview/enable', shareAccess: false}},
      allowOrigins: ['http://localhost:*'],
    }),
    visionTool()      // handy GROQ playground (optional)
  ],
  tools: prev => [...prev, {name: 'staging-sync', title: 'Refresh staging', component: StagingSyncTool}],
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
      const actions = [...prev, PreviewDraftAction];
      if (SINGLETON_TYPES.has(schemaType)) {
        return actions.filter(
            ({ action }) => !['delete', 'duplicate'].includes(action!)
        )
      }
      return actions
    }
  }
});
