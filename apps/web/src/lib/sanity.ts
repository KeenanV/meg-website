import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { sanityConfig } from './sanityConfig';
import type { ContentImage } from './content';

const config = sanityConfig(import.meta.env);
// Only the separately built server renderer can read drafts. No credential is
// exposed through PUBLIC_* variables or included in the browser bundle.
export const sanity = createClient(import.meta.env.EDITORIAL_PREVIEW ? {
  ...config, apiVersion: '2025-10-26', perspective: 'drafts', token: process.env.SANITY_PREVIEW_TOKEN,
} : config);
const builder = createImageUrlBuilder(config);
export const urlFor = (source: ContentImage) => builder.image(source).auto('format');
export const richTextImageUrl = (source: ContentImage) => urlFor(source).width(1400).quality(80).url();
