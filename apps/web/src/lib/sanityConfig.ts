export function sanityConfig(env: Record<string, string | undefined>) {
  const projectId = env.PUBLIC_SANITY_PROJECT_ID?.trim();
  if (!projectId || projectId === 'yourProjectId' || !/^[a-z0-9-]+$/.test(projectId)) {
    throw new Error('Set PUBLIC_SANITY_PROJECT_ID in apps/web/.env. Copy .env.example to get started.');
  }
  const dataset = env.PUBLIC_SANITY_DATASET?.trim() || 'production';
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(dataset)) throw new Error('PUBLIC_SANITY_DATASET is invalid.');
  const apiVersion = env.PUBLIC_SANITY_API_VERSION?.trim() || '2025-10-26';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(apiVersion) || Number.isNaN(Date.parse(apiVersion)) ||
      new Date(apiVersion).toISOString().slice(0, 10) !== apiVersion) {
    throw new Error('PUBLIC_SANITY_API_VERSION must be a valid YYYY-MM-DD date.');
  }
  return { projectId, dataset, apiVersion, useCdn: false, perspective: 'published' as const };
}
