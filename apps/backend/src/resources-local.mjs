import {readFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {createResourcesHandler} from './resources.mjs';

export async function localResources(directory, allowOrigin) {
  let credentials;
  try { credentials = JSON.parse(await readFile(path.join(directory, 'password.json'), 'utf8')); }
  catch { /* Unconfigured instances must fail closed. */ }
  const readCatalog = async () => JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8'));
  const store = {
    async catalog() {
      return (await readCatalog()).map(({id, title, excerpt, recordingType, customRecordingType, image}) => ({
        id, title, excerpt, recordingType, customRecordingType,
        audioUrl: `/api/resources/audio/${id}`, imageUrl: image ? `/api/resources/image/${id}` : null,
      }));
    },
    async asset(id, type) {
      if (!(await readCatalog()).some(item => item.id === id && (type !== 'image' || item.image))) return null;
      const filename = path.join(directory, id + (type === 'audio' ? '.mp3' : '.jpg'));
      const info = await stat(filename);
      return {size: info.size, send: (response, range) => pipeline(createReadStream(filename, range), response)};
    },
  };
  return createResourcesHandler({credentials, store, allowOrigin, secureCookies: false});
}
