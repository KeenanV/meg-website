// One-time operator provisioning. Private signing material never leaves production.
import {generateKeyPairSync, createPrivateKey, createPublicKey} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {accountFlags, gcloud} from './cloud-cli.mjs';

if (!process.argv.includes('--apply')) throw new Error('Use --apply to configure sync signing and verification keys.');
function cloud(args, input) {
  const result = spawnSync(gcloud, [...args, ...accountFlags, '--quiet', '--format=json'], {encoding: 'utf8', input});
  if (result.status !== 0) throw new Error('Broker provisioning failed: ' + args.slice(0, 3).join(' '));
  return result.stdout ? JSON.parse(result.stdout) : null;
}
function latest(project, name) {
  const secrets = cloud(['secrets', 'list', '--project=' + project]);
  if (!secrets.some(secret => secret.name.endsWith('/secrets/' + name))) {
    cloud(['secrets', 'create', name, '--project=' + project, '--replication-policy=automatic']);
    return null;
  }
  return cloud(['secrets', 'versions', 'list', name, '--project=' + project, '--filter=state:ENABLED', '--sort-by=~createTime', '--limit=1'])[0] || null;
}
function read(project, name, version) {
  const r = spawnSync(gcloud, ['secrets', 'versions', 'access', version, '--secret=' + name, '--project=' + project, ...accountFlags], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error('Unable to access broker key');
  return r.stdout.trim();
}
const prod = 'megvandeusen-website', staging = 'megvandeusen-staging';
const privateName = 'sync-broker-private-key', publicName = 'sync-broker-public-key';
let version = latest(prod, privateName);
let privateValue;
if (!version) {
  privateValue = generateKeyPairSync('ed25519').privateKey.export({type: 'pkcs8', format: 'der'}).toString('base64');
  version = cloud(['secrets', 'versions', 'add', privateName, '--project=' + prod, '--data-file=-'], privateValue);
} else privateValue = read(prod, privateName, version.name.split('/').at(-1));
const publicValue = createPublicKey(createPrivateKey({key: Buffer.from(privateValue, 'base64'), format: 'der', type: 'pkcs8'}))
  .export({type: 'spki', format: 'der'}).toString('base64');
let publicVersion = latest(staging, publicName);
if (!publicVersion || read(staging, publicName, publicVersion.name.split('/').at(-1)) !== publicValue) {
  publicVersion = cloud(['secrets', 'versions', 'add', publicName, '--project=' + staging, '--data-file=-'], publicValue);
}
for (const [project, name, service, variable, selected] of [
  [prod, privateName, 'website-backend', 'SYNC_BROKER_PRIVATE_KEY', version],
  [staging, publicName, 'staging-website', 'SYNC_BROKER_PUBLIC_KEY', publicVersion],
]) {
  cloud(['secrets', 'add-iam-policy-binding', name, '--project=' + project,
    '--member=serviceAccount:' + service + '@' + project + '.iam.gserviceaccount.com', '--role=roles/secretmanager.secretAccessor']);
  cloud(['run', 'services', 'update', service, '--project=' + project, '--region=us-west1',
    '--update-secrets=' + variable + '=' + name + ':' + selected.name.split('/').at(-1)]);
  console.log(project + ': broker key reference configured; no key material printed');
}
cloud(['firestore', 'fields', 'ttls', 'update', 'cleanupAt', '--collection-group=studioSyncCapabilities',
  '--project=' + staging, '--enable-ttl']);
console.log('One-time capability cleanup enabled. Deploy the staging receiver, then production broker and Studio.');
