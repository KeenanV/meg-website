import {createHash} from 'node:crypto';
import {readFile, mkdir, appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const filename = '.private/deploy-artifact.tar.gz';
const mode = process.argv[2];
function tar(args) {const r=spawnSync('tar',args,{stdio:'inherit'});if(r.status!==0)throw new Error('Artifact archive failed');}
await mkdir('.private',{recursive:true});
if(mode==='pack') {
  const paths=['apps/web/dist','.private/content-snapshot.json'];
  if(process.env.DEPLOYMENT_TYPE==='full') paths.push('apps/studio/dist','apps/web/dist-preview');
  tar(['-czf',filename,...paths]);
  const digest=createHash('sha256').update(await readFile(filename)).digest('hex');
  if(!process.env.GITHUB_OUTPUT)throw new Error('GitHub output required');
  await appendFile(process.env.GITHUB_OUTPUT,`sha256=${digest}\n`);
} else if(mode==='unpack') {
  const expected=process.env.EXPECTED_ARTIFACT_SHA;
  const digest=createHash('sha256').update(await readFile(filename)).digest('hex');
  if(!/^[a-f0-9]{64}$/.test(expected||'')||expected!==digest)throw new Error('Deployment artifact digest mismatch');
  // Never extract source/configuration or dependencies into the privileged job.
  const listing=spawnSync('tar',['-tzf',filename],{encoding:'utf8'});
  if(listing.status!==0||listing.stdout.trim().split('\n').some(p=>p.includes('..')||(p!=='.private/content-snapshot.json'&&!/^apps\/(web\/(dist|dist-preview)|studio\/dist)\//.test(p))))throw new Error('Unexpected artifact path');
  const types=spawnSync('tar',['-tvzf',filename],{encoding:'utf8'});
  if(types.status!==0||types.stdout.trim().split('\n').some(line=>!['-','d'].includes(line[0])))throw new Error('Artifact links are not permitted');
  tar(['-xzf',filename]);
} else throw new Error('Use pack or unpack');
