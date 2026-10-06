// Run with `sanity exec scripts/seed-private-recordings.mjs --with-user-token`.
// Preview by default. --apply writes STAGING only; never removes source files.
import {getCliClient} from 'sanity/cli';
import {mkdir, writeFile} from 'node:fs/promises';
const client = getCliClient({apiVersion: '2025-10-26'}).withConfig({projectId: 'ap0mc9ri', useCdn: false});
const source = client.withConfig({dataset: 'production'});
const target = client.withConfig({dataset: 'staging'});
const endpoint = 'https://megvandeusen-staging.web.app/api/studio/uploads';
const documents = await source.fetch('*[_type == "meditation" && defined(audio.asset)]{...,"audioUrl":audio.asset->url,"coverUrl":cover.asset->url}', {}, {perspective: 'published'});
const pending = [];
for (const document of documents) if (!await target.getDocument(document._id)) pending.push(document);
console.log(`Found ${pending.length} recordings not yet present in staging.`);
if (!process.argv.includes('--apply')) {
  console.log('Preview only. --apply uploads private copies and creates staging documents; production stays unchanged.');
} else {
  const backup = new URL('../../../.private/recording-migration/', import.meta.url);
  await mkdir(backup, {recursive: true, mode: 0o700});
  await writeFile(new URL(`source-${Date.now()}.json`, backup), JSON.stringify(documents), {mode: 0o600, flag: 'wx'});
  async function api(route, body) {
    const response = await fetch(endpoint + route, {method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: 'http://localhost:3334', 'X-Sanity-Token': client.config().token,
    }, body: JSON.stringify({dataset: 'staging', ...body}), signal: AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`Private upload API failed (${response.status}); no source deleted.`);
    return response.json();
  }
  async function download(url, max) {
    if (typeof url !== 'string' || !url.startsWith('https://cdn.sanity.io/')) throw new Error('Unexpected asset URL');
    const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(120_000)});
    if (!response.ok) throw new Error('Source unavailable');
    let size = 0; const parts = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > max) throw new Error('Source exceeds upload limit');
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  }
  for (const document of pending) {
    const bytes = await download(document.audioUrl, 100 * 1024 * 1024);
    await writeFile(new URL(encodeURIComponent(document._id) + '.mp3', backup), bytes, {mode: 0o600});
    const started = await api('/start', {size: bytes.length, contentType: 'audio/mpeg'});
    const url = new URL(started.url);
    if (url.protocol !== 'https:' || !['storage.googleapis.com', 'megvandeusen-staging-resources.storage.googleapis.com'].includes(url.hostname)) throw new Error('Unexpected storage destination');
    const form = new FormData();
    for (const [key, value] of Object.entries(started.fields)) form.append(key, value);
    form.append('file', new Blob([bytes], {type: 'audio/mpeg'}), 'recording.mp3');
    const uploaded = await fetch(url, {method: 'POST', body: form, signal: AbortSignal.timeout(180_000)});
    if (!uploaded.ok) throw new Error(`Private storage upload failed (${uploaded.status})`);
    const privateAudio = {...await api('/finish', {id: started.id}), _type: 'privateAudio'};
    let cover;
    if (document.coverUrl) {
      const asset = await target.assets.upload('image', await download(document.coverUrl, 25 * 1024 * 1024));
      cover = {...document.cover, asset: {_type: 'reference', _ref: asset._id}};
    }
    const {_rev, _createdAt, _updatedAt, audio, audioUrl, coverUrl, ...content} = document;
    await target.createIfNotExists({...content, privateAudio, ...(cover ? {cover} : {})});
    console.log(`Created private staging recording: ${document.title}`);
  }
  console.log('Staging migration complete. Production documents and public originals retained.');
}
