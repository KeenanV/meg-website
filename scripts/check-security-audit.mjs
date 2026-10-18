import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const exceptions=JSON.parse(await readFile(new URL('../security-audit-exceptions.json',import.meta.url),'utf8'));
let failed=false;
for(const cwd of ['.','apps/web','apps/studio','apps/backend']) {
  const result=spawnSync('npm',['audit','--package-lock-only','--json'],{cwd,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  let audit;
  try{audit=JSON.parse(result.stdout);}catch{throw new Error('Audit unavailable: '+cwd);}
  if(audit.error||!audit.metadata?.vulnerabilities)throw new Error('Audit unavailable: '+cwd);
  const advisories=new Map();
  for(const pkg of Object.values(audit.vulnerabilities||{}))for(const via of pkg.via)if(typeof via==='object')advisories.set(via.url,{...via,package:pkg.name});
  for(const [url,item] of advisories) {
    const id=new URL(url).pathname.split('/').at(-1);
    const exception=exceptions.find(e=>e.advisory===id&&e.packages.includes(item.package)&&Date.parse(e.expires+'T23:59:59Z')>Date.now());
    if(!exception){failed=true;console.error(`${cwd}: unresolved ${item.severity} ${id} (${item.package})`);}
    else console.log(`${cwd}: reviewed exception ${id}, expires ${exception.expires}`);
  }
  console.log(`${cwd}: ${advisories.size} direct advisories reviewed`);
}
if(failed)process.exitCode=1;
