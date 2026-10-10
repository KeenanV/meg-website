import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Storage} from '@google-cloud/storage';
import {CONTENT_TYPES, contentDocument} from './content-sync.mjs';
import {privateAudioKey} from './studio-upload.mjs';

const project = 'ap0mc9ri';
const version = 'v2025-10-26';
export function syncStorage({id, sourceToken, targetToken, db, storage = new Storage({projectId: 'megvandeusen-staging'})}) {
  if (!sourceToken || !targetToken || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Sync credentials required');
  const production = storage.bucket('megvandeusen-website-resources');
  const staging = storage.bucket('megvandeusen-staging-resources');
  const backup = storage.bucket('megvandeusen-staging-editorial');
  async function sanity(dataset, route, options = {}) {
    // This is the only Sanity transport used by the worker. Production is GET-only.
    if (!['production', 'staging'].includes(dataset) || (dataset === 'production' && options.method && options.method !== 'GET')) throw new Error('Production is read-only');
    const response = await fetch(`https://${project}.api.sanity.io/${version}/${route}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: {...options.headers, Authorization: `Bearer ${dataset === 'production' ? sourceToken : targetToken}`},
    });
    if (!response.ok) throw new Error('Sanity operation failed');
    return response.json();
  }
  async function read(dataset) {
    const query = `*[_type in ${JSON.stringify([...CONTENT_TYPES, 'sanity.imageAsset', 'sanity.fileAsset'])}]`;
    return (await sanity(dataset, `data/query/${dataset}?perspective=raw&query=${encodeURIComponent(query)}`)).result;
  }
  async function json(name, value) {
    await backup.file(`sync/${id}/${name}.json`).save(JSON.stringify(value), {resumable: false,
      contentType: 'application/json', metadata: {cacheControl: 'private,no-store'}, preconditionOpts: {ifGenerationMatch: 0}});
  }
  async function downloadAsset(asset, dataset) {
    const url = new URL(asset.url);
    if (url.origin !== 'https://cdn.sanity.io' || !url.pathname.startsWith(`/${asset._type === 'sanity.imageAsset' ? 'images' : 'files'}/${project}/${dataset}/`)) throw new Error('Invalid asset origin');
    // The image CDN may re-encode a normal URL. Original bytes are required
    // to preserve content-addressed asset IDs and make backups restorable.
    url.search = '';
    url.searchParams.set('dlRaw', '1');
    const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: {Authorization: `Bearer ${dataset === 'production' ? sourceToken : targetToken}`}});
    if (!response.ok || !response.body) throw new Error('Asset download failed');
    return response;
  }
  let source, copied = new Set();
  return {
    readSource: async () => {source = await read('production'); return source;},
    readTarget: () => read('staging'),
    targetAssets: async () => (await read('staging')).filter(doc => doc._type.startsWith('sanity.')),
    saveSnapshot: snapshot => json('production-snapshot', snapshot),
    async backup(target) {
      await json('staging-before', target);
      for (const doc of target) {
        if (doc._type === 'sanity.imageAsset' || doc._type === 'sanity.fileAsset') {
          const response = await downloadAsset(doc, 'staging');
          await pipeline(Readable.fromWeb(response.body), backup.file(`sync/${id}/assets/${doc._id}`).createWriteStream({
            resumable: false, preconditionOpts: {ifGenerationMatch: 0}, metadata: {contentType: doc.mimeType, cacheControl: 'private,no-store'}}));
        }
        if (doc.privateAudio && privateAudioKey.test(doc.privateAudio.objectKey) && /^\d+$/.test(doc.privateAudio.generation)) {
          const key = `${doc.privateAudio.objectKey}-${doc.privateAudio.generation}`;
          if (copied.has(key)) continue;
          await staging.file(doc.privateAudio.objectKey, {generation: doc.privateAudio.generation}).copy(backup.file(`sync/${id}/audio/${key}`), {preconditionOpts: {ifGenerationMatch: 0}});
          copied.add(key);
        }
      }
      copied = new Set();
    },
    async copyDocument(doc) {
      async function assets(value) {
        if (!value || typeof value !== 'object') return;
        if (value._type === 'reference' && /^(image|file)-/.test(value._ref) && !copied.has(value._ref)) {
          const asset = source.find(item => item._id === value._ref);
          if (!asset) throw new Error('Production asset missing');
          const response = await downloadAsset(asset, 'production');
          const kind = asset._type === 'sanity.imageAsset' ? 'images' : 'files';
          const result = await sanity('staging', `assets/${kind}/staging`, {method: 'POST', duplex: 'half', body: response.body,
            headers: {'Content-Type': asset.mimeType || 'application/octet-stream'}});
          if (result.document?._id !== value._ref) throw new Error('Asset content hash changed');
          copied.add(value._ref);
        }
        for (const child of Object.values(value)) await assets(child);
      }
      await assets(doc);
      if (doc._type === 'meditation') {
        // Public audio originals must never be reintroduced by a refresh.
        delete doc.audio;
        if (doc.privateAudio) {
          const {objectKey, generation} = doc.privateAudio;
          if (!privateAudioKey.test(objectKey) || !/^\d+$/.test(generation)) throw new Error('Invalid recording reference');
          const original = production.file(objectKey, {generation});
          const hex = createHash('sha256').update(objectKey + ':' + generation).digest('hex').slice(0, 32);
          const key = `recordings/${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}.mp3`;
          const target = staging.file(key);
          try {await original.copy(target, {preconditionOpts: {ifGenerationMatch: 0}});}
          catch (error) {if (Number(error.code) !== 412) throw error;}
          const [[from], [to]] = await Promise.all([original.getMetadata(), target.getMetadata()]);
          if (from.size !== to.size || !from.crc32c || from.crc32c !== to.crc32c) throw new Error('Recording checksum mismatch');
          doc.privateAudio = {...doc.privateAudio, objectKey: key, generation: String(to.generation), size: Number(to.size)};
        }
      }
      return doc;
    },
    async validateSchema(documents) {
      const directory = await mkdtemp(path.join(tmpdir(), 'meg-sync-'));
      try {
        const filename = path.join(directory, 'documents.ndjson');
        await writeFile(filename, documents.map(doc => JSON.stringify(doc)).join('\n'), {mode: 0o600});
        const studio = new URL('../../studio/', import.meta.url);
        // Use the schema shipped with this staging worker. Capture, never log,
        // validator output because it can include draft text and asset URLs.
        let stdout;
        try {({stdout} = await promisify(execFile)(process.execPath, [new URL('node_modules/.bin/sanity', studio).pathname,
          'documents', 'validate', '--file', filename, '--dataset', 'staging', '--workspace', 'default', '--level', 'error', '--format', 'ndjson', '--yes'],
        {cwd: studio, env: {...process.env, SANITY_STUDIO_DATASET: 'staging', SANITY_AUTH_TOKEN: targetToken}, timeout: 180_000, maxBuffer: 4 * 1024 * 1024}));}
        catch (error) {
          await json('schema-validation', {report: error.stdout || '', diagnostics: error.stderr || '',
            exitCode: error.code, signal: error.signal, failed: true});
          throw new Error('Staging schema validation failed');
        }
        // Some CLI versions report markers with a zero exit code. Inspect the
        // report too, and retain it privately for diagnosing schema failures.
        await json('schema-validation', {report: stdout});
        for (const line of stdout.split('\n').filter(value => value.trim().startsWith('{'))) {
          const item = JSON.parse(line);
          if (item.level === 'error' || item.markers?.some(marker => marker.level === 'error')) throw new Error('Staging schema validation failed');
        }
      } finally {await rm(directory, {recursive: true, force: true});}
    },
    async commit({replacements, remove, expected}) {
      const existing = new Map(expected.map(doc => [doc._id, doc]));
      const mutations = [];
      for (const doc of replacements) {
        const before = existing.get(doc._id);
        if (!before) mutations.push({create: doc});
        else {
          const {_id, _type, ...fields} = doc;
          if (_type !== before._type) throw new Error('Document type mismatch');
          const unset = Object.keys(contentDocument(before)).filter(key => !key.startsWith('_') && !(key in fields));
          mutations.push({patch: {id: _id, ifRevisionID: before._rev, set: fields, ...(unset.length ? {unset} : {})}});
        }
      }
      for (const id of remove) {
        const before = existing.get(id);
        if (!before || !CONTENT_TYPES.includes(before._type)) throw new Error('Refusing to delete an unmanaged document');
        mutations.push({patch: {id, ifRevisionID: before._rev, unset: ['__studioSyncRevisionGuard']}}, {delete: {id}});
      }
      if (!mutations.length) return;
      const body = JSON.stringify({mutations});
      if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('Sync exceeds transaction size limit');
      const result = await sanity('staging', 'data/mutate/staging?visibility=sync&returnIds=true', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body});
      // Used by the webhook to recognize imported changes even after the job ends.
      await db.collection('studioSyncTransactions').doc(result.transactionId).set({created: Date.now(), run: id});
    },
    async saveBaseline(value) {await backup.file('state/baseline.json').save(JSON.stringify(value), {resumable: false, contentType: 'application/json'});},
    async readBaseline() {
      try {return JSON.parse((await backup.file('state/baseline.json').download())[0].toString());}
      catch (error) {if (Number(error.code) === 404) return {}; throw error;}
    },
    async loadSnapshot() {return JSON.parse((await backup.file(`sync/${id}/production-snapshot.json`).download())[0].toString());},
    async loadBackup() {return JSON.parse((await backup.file(`sync/${id}/staging-before.json`).download())[0].toString());},
    async restoreMedia(doc) {
      if (doc._type.startsWith('sanity.')) {
        const kind = doc._type === 'sanity.imageAsset' ? 'images' : 'files';
        const result = await sanity('staging', `assets/${kind}/staging`, {method: 'POST', duplex: 'half',
          body: backup.file(`sync/${id}/assets/${doc._id}`).createReadStream(), headers: {'Content-Type': doc.mimeType || 'application/octet-stream'}});
        if (result.document?._id !== doc._id) throw new Error('Restored asset hash mismatch');
      } else if (doc.privateAudio) {
        const {objectKey, generation} = doc.privateAudio;
        if (!privateAudioKey.test(objectKey) || !/^\d+$/.test(generation)) throw new Error('Invalid backup recording');
        const original = staging.file(objectKey, {generation});
        const [exists] = await original.exists();
        if (!exists) {
          const hex = createHash('sha256').update(id + ':' + objectKey + ':' + generation).digest('hex').slice(0, 32);
          const key = `recordings/${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}.mp3`;
          const stored = backup.file(`sync/${id}/audio/${objectKey}-${generation}`);
          const destination = staging.file(key);
          try {await stored.copy(destination, {preconditionOpts: {ifGenerationMatch: 0}});} catch (error) {if (Number(error.code) !== 412) throw error;}
          const [[from], [to]] = await Promise.all([stored.getMetadata(), destination.getMetadata()]);
          if (from.size !== to.size || !from.crc32c || from.crc32c !== to.crc32c) throw new Error('Restored recording checksum mismatch');
          doc.privateAudio = {...doc.privateAudio, objectKey: key, generation: String(to.generation)};
        }
      }
      return doc;
    },
  };
}
