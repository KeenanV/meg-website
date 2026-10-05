import {createHash} from 'node:crypto';
import {privateAudioKey} from './studio-upload.mjs';

// Published editor metadata is public; neither credentials nor audio bytes are
// stored in Sanity. Object names alone confer no GCS access.
export function sanityPrivateCatalog({project, dataset, request = fetch, now = Date.now}) {
  if (project !== 'ap0mc9ri' || !['staging', 'production'].includes(dataset)) throw new Error('Invalid catalog environment');
  let cache, expires = 0, pending;
  return async () => {
    if (cache && expires > now()) return cache;
    if (!pending) pending = (async () => {
      const query = '*[_type == "meditation" && defined(privateAudio.objectKey)] | order(title asc, _id asc)[0...1000]{_id,title,excerpt,recordingType,customRecordingType,privateAudio,"imageUrl":cover.asset->url}';
      const url = new URL(`https://${project}.api.sanity.io/v2025-10-26/data/query/${dataset}`);
      url.searchParams.set('query', query); url.searchParams.set('perspective', 'published');
      const response = await request(url, {signal: AbortSignal.timeout(8000), redirect: 'error'});
      if (!response.ok) throw new Error('Catalog unavailable');
      const {result} = await response.json();
      if (!Array.isArray(result)) throw new Error('Invalid catalog');
      cache = result.filter(item => !item._id?.startsWith('drafts.') && !item._id?.startsWith('versions.')
        && typeof item._id === 'string' && typeof item.title === 'string' && typeof item.excerpt === 'string'
        && privateAudioKey.test(item.privateAudio?.objectKey) && /^\d+$/.test(item.privateAudio?.generation)
      ).map(item => ({
        id: createHash('sha256').update(item._id).digest('hex'), title: item.title.slice(0, 200), excerpt: item.excerpt.slice(0, 500),
        recordingType: item.recordingType, customRecordingType: item.customRecordingType,
        objectKey: item.privateAudio.objectKey, generation: item.privateAudio.generation,
        imageUrl: typeof item.imageUrl === 'string' && item.imageUrl.startsWith(`https://cdn.sanity.io/images/${project}/${dataset}/`)
          ? item.imageUrl + '?w=840&h=525&fit=crop&auto=format' : null,
      }));
      expires = now() + 30_000;
      return cache;
    })().finally(() => {pending = null;});
    return pending;
  };
}
