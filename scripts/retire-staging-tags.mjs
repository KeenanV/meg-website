// Removes historical Hosting tags only after verifying all active channel pins.
// Default is a dry run. It does not delete revisions, images, or Hosting releases.
import {accountFlags,gcloud,run} from './cloud-cli.mjs';
const project='megvandeusen-staging';
const token=run(gcloud,['auth','print-access-token',...accountFlags],{stdio:['ignore','pipe','inherit'],encoding:'utf8'}).trim();
async function get(route) {
  const r=await fetch('https://firebasehosting.googleapis.com/v1beta1/'+route,{headers:{Authorization:'Bearer '+token,'x-goog-user-project':project},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error('Cannot inventory Hosting references: '+r.status);return r.json();
}
const channels=[];let pageToken='';
do {
  const page=await get(`sites/${project}/channels?pageSize=100${pageToken?'&pageToken='+encodeURIComponent(pageToken):''}`);
  channels.push(...(page.channels||[]));pageToken=page.nextPageToken||'';
}while(pageToken);
const releases=(await get(`sites/${project}/releases?pageSize=1`)).releases;
if(!releases?.length)throw new Error('No live Hosting release; refuse tag cleanup');
const active=[releases[0],...channels.filter(c=>!c.expireTime||Date.parse(c.expireTime)>Date.now()).map(c=>c.release).filter(Boolean)];
const keep=new Set();
for(const release of active) {
  const version=release.version?.config?release.version:await get(release.version?.name||'invalid');
  const rewrite=version.config?.rewrites?.find(r=>r.run?.serviceId==='staging-website');
  if(!rewrite?.run?.tag)throw new Error('Active Hosting channel lacks an explicit staging pin; inspect before cleanup');
  keep.add(rewrite.run.tag);
}
const service=JSON.parse(run(gcloud,['run','services','describe','staging-website','--project='+project,'--region=us-west1',...accountFlags,'--format=json'],{stdio:['ignore','pipe','inherit'],encoding:'utf8'}));
const tags=new Set(service.status.traffic.filter(t=>t.tag).map(t=>t.tag));
if([...keep].some(tag=>!tags.has(tag)))throw new Error('Hosting references a missing tag; cleanup aborted');
const remove=[...tags].filter(tag=>/^hosting-\d+-[a-z0-9]+$/.test(tag)&&!keep.has(tag));
console.log(JSON.stringify({keep:[...keep],remove,apply:process.argv.includes('--apply')},null,2));
if(remove.length&&process.argv.includes('--apply'))run(gcloud,['run','services','update-traffic','staging-website','--project='+project,'--region=us-west1',...accountFlags,'--remove-tags='+remove.join(','),'--quiet']);
