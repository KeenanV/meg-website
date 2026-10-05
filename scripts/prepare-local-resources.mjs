import {mkdir, readFile, writeFile, chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {passwordRecord} from '../apps/backend/src/resources.mjs';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const {createClient} = require('@sanity/client');
const {createImageUrlBuilder} = require('@sanity/image-url');
const root = new URL('../', import.meta.url);
const directory = new URL('.private/resources/', root);
const env = Object.fromEntries((await readFile(new URL('apps/web/.env', root), 'utf8')).split('\n')
  .filter(line => /^PUBLIC_SANITY_\w+=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const config = {projectId: env.PUBLIC_SANITY_PROJECT_ID, dataset: env.PUBLIC_SANITY_DATASET || 'production', apiVersion: '2025-10-26', useCdn: false, perspective: 'published'};
const client = createClient(config);
const builder = createImageUrlBuilder(config);
const documents = await client.fetch('*[_type == "meditation" && defined(audio.asset) && lower(audio.asset->extension) == "mp3"] | order(title asc, _id asc){_id,title,excerpt,recordingType,customRecordingType,cover,"audioUrl":audio.asset->url}');
await mkdir(directory, {recursive: true, mode: 0o700});
await chmod(directory, 0o700);
async function download(url, filename) {
  if (new URL(url).hostname !== 'cdn.sanity.io') throw new Error('Unexpected asset host');
  const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(120_000)});
  if (!response.ok) throw new Error('Could not copy asset');
  await writeFile(new URL(filename, directory), Buffer.from(await response.arrayBuffer()), {mode: 0o600});
}
const items = [];
for (const doc of documents) {
  const id = createHash('sha256').update(doc._id).digest('hex');
  await download(doc.audioUrl, id + '.mp3');
  if (doc.cover?.asset) await download(builder.image(doc.cover).width(840).height(525).fit('crop').format('jpg').url(), id + '.jpg');
  items.push({id, title: doc.title, excerpt: doc.excerpt, recordingType: doc.recordingType, customRecordingType: doc.customRecordingType, image: !!doc.cover?.asset});
}
await writeFile(new URL('catalog.json', directory), JSON.stringify(items), {mode: 0o600});
if (process.argv.includes('--demo')) {
  // Deliberately public fixture password; never use this credential in a cloud environment.
  await writeFile(new URL('password.json', directory), JSON.stringify(await passwordRecord('local-resources-only')), {mode: 0o600});
}
console.log(`Copied ${items.length} recordings into ${fileURLToPath(directory)}. No Sanity documents or public assets changed.`);
console.log('Restart the local Astro server after password changes. --demo sets the local-only fixture password documented in RESOURCES_AUTH.md.');
