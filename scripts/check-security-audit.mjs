import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {auditFindings} from './security-audit-policy.mjs';
const exceptions=JSON.parse(await readFile(new URL('../security-audit-exceptions.json',import.meta.url),'utf8'));
let failed=false;
for(const cwd of ['.','apps/web','apps/studio','apps/backend']) {
  const result=spawnSync('npm',['audit','--package-lock-only','--ignore-scripts','--json'],{cwd,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  let audit;
  try{audit=JSON.parse(result.stdout);}catch{throw new Error('Audit unavailable: '+cwd);}
  if(audit.error||!audit.metadata?.vulnerabilities)throw new Error('Audit unavailable: '+cwd);
  const advisories=auditFindings(audit,exceptions);
  for(const item of advisories) {
    const {id,exception}=item;
    if(!exception){failed=true;console.error(`${cwd}: unresolved ${item.severity} ${id} (${item.package})`);}
    else console.log(`${cwd}: reviewed exception ${id}, expires ${exception.expires}`);
  }
  console.log(`${cwd}: ${advisories.length} direct advisories reviewed`);
}
if(failed)process.exitCode=1;
