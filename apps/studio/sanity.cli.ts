import {defineCliConfig} from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: 'ap0mc9ri',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  studioHost: process.env.SANITY_STUDIO_DATASET === 'staging' ? 'megvandeusen-staging' : 'megvandeusen',
  deployment: {
    ...(process.env.SANITY_STUDIO_DATASET === 'staging' ? {} : {appId: 'a2dfrbw6ybtagqytmnfeu7ew'}),
    // Keep hosted Studio on the versions tested and locked in this repository.
    autoUpdates: false,
  },
});
