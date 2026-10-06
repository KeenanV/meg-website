import {defineCliConfig} from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: 'ap0mc9ri',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  studioHost: process.env.SANITY_STUDIO_DATASET === 'staging' ? 'megvandeusen-staging' : 'megvandeusen',
  deployment: {
    appId: process.env.SANITY_STUDIO_DATASET === 'staging' ? 'j8x5jltsl93mqznk8fhs8pc1' : 'a2dfrbw6ybtagqytmnfeu7ew',
    // Keep hosted Studio on the versions tested and locked in this repository.
    autoUpdates: false,
  },
});
