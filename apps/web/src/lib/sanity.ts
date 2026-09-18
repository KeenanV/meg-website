import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { sanityConfig } from './sanityConfig';
import type { ContentImage } from './content';

const config = sanityConfig(import.meta.env);
export const sanity = createClient(config);
const builder = createImageUrlBuilder(config);
export const urlFor = (source: ContentImage) => builder.image(source).auto('format');
export const richTextImageUrl = (source: ContentImage) => urlFor(source).width(1400).quality(80).url();
