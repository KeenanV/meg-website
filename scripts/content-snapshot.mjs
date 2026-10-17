import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
const dataset = process.env.PUBLIC_SANITY_DATASET;
const project = process.env.PUBLIC_SANITY_PROJECT_ID;
if (!['staging', 'production'].includes(dataset) || project !== (dataset === 'staging' ? '77uvsyo1' : 'ap0mc9ri')) throw new Error('Content environment mismatch');
const url = new URL(`https://${project}.api.sanity.io/v2025-10-26/data/query/${dataset}`);
url.searchParams.set('perspective', 'published');
url.searchParams.set('query', '*[!(_type match "system.*") && !(_type match "sanity.preview*")] | order(_id asc){_id,_rev}');
const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(15000)});
if (!response.ok) throw new Error('Cannot verify content snapshot');
const {result} = await response.json();
if (!Array.isArray(result)) throw new Error('Invalid content snapshot');
const hash = createHash('sha256').update(JSON.stringify({project, dataset, result})).digest('hex');
const file = '.private/content-snapshot.json';
if (process.argv[2] === 'capture') {
  await mkdir('.private', {recursive: true});
  await writeFile(file, JSON.stringify({hash}));
} else if (process.argv[2] === 'check') {
  if (JSON.parse(await readFile(file, 'utf8')).hash !== hash) throw new Error('Content changed during the build. The queued publication or a workflow rerun will build a consistent copy.');
} else throw new Error('Use capture or check');
