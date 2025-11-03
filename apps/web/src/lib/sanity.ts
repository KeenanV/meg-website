import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID!;
const dataset   = import.meta.env.PUBLIC_SANITY_DATASET || 'production';
const apiVersion = import.meta.env.PUBLIC_SANITY_API_VERSION || '2025-10-26';

export const sanity = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true
});

export const urlFor = (source: any) => imageUrlBuilder({ projectId, dataset }).image(source);