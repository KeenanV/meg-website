import {sanityProject} from '../backend/src/sanity-environments.mjs';
import {defineCliConfig} from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: sanityProject(process.env.SANITY_STUDIO_DATASET || 'production'),
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  studioHost: process.env.SANITY_STUDIO_DATASET === 'staging' ? 'meg-website-staging' : 'megvandeusen',
  // The schema extractor's Vite runner misclassifies LexoRank's CommonJS barrel
  // as ESM. Let Node load it during extraction; browser builds still bundle it.
  vite: {ssr: {external: ['lexorank']}},
  deployment: {
    appId: process.env.SANITY_STUDIO_DATASET === 'staging' ? 'm3dgxitd6vysrorvs3du1ct2' : 'a2dfrbw6ybtagqytmnfeu7ew',
    // Keep hosted Studio on the versions tested and locked in this repository.
    autoUpdates: false,
  },
});
