import {defineCliConfig} from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: 'ap0mc9ri',
    dataset: 'production',
  },
  studioHost: 'megvandeusen',
  deployment: {
    appId: 'a2dfrbw6ybtagqytmnfeu7ew',
    // Keep hosted Studio on the versions tested and locked in this repository.
    autoUpdates: false,
  },
});
