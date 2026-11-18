export function syncEndpoint(dataset) {
  if (dataset === 'production') return 'https://website-backend-348807509213.us-west1.run.app/api/studio/sync';
  if (dataset === 'staging') return 'https://megvandeusen-staging.web.app/api/studio/sync';
  throw new Error('Unknown Studio environment');
}
