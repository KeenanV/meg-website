import { defineConfig } from 'sanity';
import {structureTool} from 'sanity/structure';
import {visionTool} from '@sanity/vision';
import { schemaTypes } from './schemas';

export default defineConfig({
  name: 'default',
  title: 'Meg Studio',
  projectId: 'ap0mc9ri',
  dataset: 'production',
  plugins: [
    structureTool(),       // <— this renders the editor UI
    visionTool()      // handy GROQ playground (optional)
  ],
  schema: { types: schemaTypes }
});