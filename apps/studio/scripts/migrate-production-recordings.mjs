// Run with sanity exec --with-user-token. Preview by default; --apply only adds
// verified private copies. Public originals remain until production playback QA.
import {getCliClient} from 'sanity/cli';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const client = getCliClient({apiVersion: '2025-10-26'}).withConfig({projectId: 'ap0mc9ri', dataset: 'production', useCdn: false});
const documents = await client.fetch('*[_type == "meditation" && defined(audio.asset) && !defined(privateAudio.objectKey)]{...,"audioUrl":audio.asset->url}', {}, {perspective: 'raw'});
console.log(`${documents.length} production recordings need private copies.`);
if (process.argv.includes('--apply')) {
  const backup = new URL('../../../.private/production-recording-migration/', import.meta.url);
  await mkdir(backup, {recursive: true, mode: 0o700});
  await writeFile(new URL(`documents-${Date.now()}.json`, backup), JSON.stringify(documents), {mode: 0o600, flag: 'wx'});
  const gcloud = process.env.GCLOUD_BIN || 'gcloud';
  const flags = ['--project=megvandeusen-website', '--account=keenanvandeusen@gmail.com', '--quiet'];
  const run = args => execFileSync(gcloud, [...args, ...flags], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  for (const document of documents) {
    if (!document.audioUrl?.startsWith('https://cdn.sanity.io/files/ap0mc9ri/production/') || !document.audioUrl.endsWith('.mp3')) throw new Error('Unexpected source URL');
    const response = await fetch(document.audioUrl, {redirect: 'error', signal: AbortSignal.timeout(120_000)});
    if (!response.ok) throw new Error('Source unavailable');
    let size = 0; const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 100 * 1024 * 1024) throw new Error('Recording exceeds upload limit');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (!size) throw new Error('Empty recording');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const saved = new URL(digest+'.mp3', backup);
    await writeFile(saved, bytes, {mode: 0o600});
    const objectKey = `recordings/${randomUUID()}.mp3`;
    const destination = 'gs://megvandeusen-website-resources/'+objectKey;
    run(['storage', 'cp', fileURLToPath(saved), destination, '--content-type=audio/mpeg', '--cache-control=private,no-store', '--if-generation-match=0']);
    // Check the stored bytes, not merely whether the upload command succeeded.
    const metadata = JSON.parse(run(['storage', 'objects', 'describe', destination, '--format=json']));
    if (Number(metadata.size) !== size || metadata.md5_hash !== createHash('md5').update(bytes).digest('base64')) throw new Error('Storage integrity check failed');
    const privateAudio = {_type: 'privateAudio', objectKey, generation: String(metadata.generation), size};
    await client.patch(document._id).ifRevisionId(document._rev).set({privateAudio}).commit();
    console.log(`Private copy verified: ${document.title}`);
  }
  console.log('Private production copies attached. Public audio references and originals retained for rollback.');
} else console.log('Preview only. --apply backs up and copies audio without deleting public originals.');
