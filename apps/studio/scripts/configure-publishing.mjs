// Run with `sanity exec scripts/configure-publishing.mjs --with-user-token -- --url=<backend URL> [--enable]`.
// The signing secret is read directly into memory from Secret Manager; never printed or written locally.
import { getCliClient } from 'sanity/cli';
import { spawnSync } from 'node:child_process';

const client = getCliClient({ apiVersion: '2025-10-26' });
const project = 'ap0mc9ri';
const name = 'Website published-content rebuild';
const url = process.argv.find(value => value.startsWith('--url='))?.slice(6);
if (!url || new URL(url).origin !== 'https://website-backend-348807509213.us-west1.run.app') throw new Error('Use the Meg website backend URL.');
const stored = spawnSync('gcloud', [
  'secrets', 'versions', 'access', 'latest', '--secret=sanity-webhook-secret',
  '--project=megvandeusen-website', '--account=keenanvandeusen@gmail.com',
], { encoding: 'utf8' });
if (stored.status !== 0) throw new Error('Cannot load the signing secret.');
const definition = {
  type: 'document', name, url: `${new URL(url).origin}/sanity-hook`, dataset: 'production',
  description: 'Signed publication events trigger the master deployment workflow. Draft edits do not trigger builds.',
  apiVersion: 'v2025-10-26', httpMethod: 'POST', includeDrafts: false, includeAllVersions: false,
  isDisabledByUser: !process.argv.includes('--enable'), secret: stored.stdout.trim(),
  rule: {
    on: ['create', 'update', 'delete'],
    filter: 'coalesce(after()._type, before()._type) in ["siteSettings", "about", "linksPage", "book", "blogPost", "newsItem"] && !(coalesce(after()._id, before()._id) in path("drafts.**")) && !(coalesce(after()._id, before()._id) in path("versions.**"))',
    projection: '{"projectId": sanity::projectId(), "dataset": sanity::dataset(), "id": coalesce(after()._id, before()._id), "type": coalesce(after()._type, before()._type), "operation": delta::operation(), "revision": coalesce(after()._rev, before()._rev)}',
  },
};
try {
  const hooks = await client.request({ url: `/hooks/projects/${project}` });
  const existing = hooks.find(hook => hook.name === name);
  const saved = await client.request({
    url: `/hooks/projects/${project}${existing ? `/${existing.id}` : ''}`,
    method: existing ? 'PATCH' : 'POST',
    body: existing ? { isDisabledByUser: definition.isDisabledByUser } : definition,
  });
  console.log(JSON.stringify({ id: saved.id, name, enabled: !definition.isDisabledByUser, url: definition.url }));
} catch {
  // Client errors can include request options, including the secret and authenticated headers.
  console.error('Webhook configuration failed. No credentials or provider response were printed.');
  process.exitCode = 1;
}
