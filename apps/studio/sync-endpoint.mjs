export function syncEndpoint(dataset) {
  if (dataset === 'production') return 'https://website-backend-348807509213.us-west1.run.app/api/studio/sync';
  if (dataset === 'staging') return 'https://website-backend-348807509213.us-west1.run.app/api/studio/staging/sync';
  throw new Error('Unknown Studio environment');
}

export function uploadEndpoint(dataset) {
  if (dataset === 'production') return 'https://megvandeusen.com/api/studio/uploads';
  if (dataset === 'staging') return 'https://website-backend-348807509213.us-west1.run.app/api/studio/staging/uploads';
  throw new Error('Unknown Studio environment');
}
