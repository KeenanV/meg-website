import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Storage} from '@google-cloud/storage';
import {Firestore, Timestamp} from '@google-cloud/firestore';
import {createResourcesHandler} from './resources.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export function firestoreResourcesState(db, namespace, now = Date.now) {
  const sessions = db.collection('resourceSessions');
  const attempts = db.collection('resourceAttempts');
  const ref = key => sessions.doc(hash(namespace + ':' + key));
  return {
    async attempt(key) {
      const doc = attempts.doc(hash(namespace + ':' + key));
      return db.runTransaction(async transaction => {
        const previous = (await transaction.get(doc)).data();
        const item = previous?.expires.toMillis() > now() ? previous : {count: 0, expires: Timestamp.fromMillis(now() + 900_000)};
        if (item.count >= 10) return false;
        transaction.set(doc, {...item, count: item.count + 1}); return true;
      });
    },
    async clearAttempts(key) { await attempts.doc(hash(namespace + ':' + key)).delete(); },
    async rotate(oldKey, key, expires) {
      const batch = db.batch();
      if (oldKey) batch.delete(ref(oldKey));
      batch.set(ref(key), {expires: Timestamp.fromMillis(expires)});
      await batch.commit();
    },
    async revoke(key) { if (key) await ref(key).delete(); },
    async get(key) {
      const item = (await ref(key).get()).data();
      return item ? {expires: item.expires.toMillis()} : undefined;
    },
  };
}

export function cloudResources({project, bucketName, credentials, origins}) {
  const bucket = new Storage({projectId: project}).bucket(bucketName);
  const db = new Firestore({projectId: project});
  // A private snapshot for the first staging test. Studio private uploads will
  // replace this manifest before the production migration.
  const catalog = async () => JSON.parse((await bucket.file('catalog.json').download())[0].toString('utf8'));
  const store = {
    async catalog() {
      return (await catalog()).map(({id, title, excerpt, recordingType, customRecordingType, image}) => ({
        id, title, excerpt, recordingType, customRecordingType,
        audioUrl: `/api/resources/audio/${id}`, imageUrl: image ? `/api/resources/image/${id}` : null,
      }));
    },
    async asset(id, type) {
      if (!(await catalog()).some(item => item.id === id && (type !== 'image' || item.image))) return null;
      const file = bucket.file(id + (type === 'audio' ? '.mp3' : '.jpg'));
      const [metadata] = await file.getMetadata();
      // Pin the stream to the metadata generation so replacement cannot change
      // the length between authorization, range calculation, and streaming.
      const version = bucket.file(file.name, {generation: metadata.generation});
      return {size: Number(metadata.size),
        // Firebase Hosting strips Range on dynamic rewrites. An authorized,
        // short-lived GCS URL lets the media element seek directly instead.
        redirect: type === 'audio' ? async () => (await version.getSignedUrl({version: 'v4', action: 'read',
          expires: Date.now() + 15 * 60_000, queryParams: {generation: metadata.generation},
          responseDisposition: 'inline', responseType: 'audio/mpeg'}))[0] : undefined,
        send: (response, range) => pipeline(version.createReadStream(range), response)};
    },
  };
  return createResourcesHandler({credentials, store, allowOrigin: origin => origins.includes(origin),
    state: firestoreResourcesState(db, credentials.hash),
    // Staging is already behind an independent high-entropy access credential.
    // Share its small reader-password attempt allowance; never trust arbitrary XFF.
    attemptKey: () => 'staging-reviewers',
  });
}
