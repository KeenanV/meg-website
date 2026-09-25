// Run through sanity exec --with-user-token. Only this script's new, non-rendered fixture is edited/deleted.
import { randomUUID } from 'node:crypto';
import { getCliClient } from 'sanity/cli';

const client = getCliClient({ apiVersion: '2025-10-26' }).withConfig({ useCdn: false });
const id = `publishing-test-${randomUUID()}`;
const draftId = `drafts.${id}`;
let created = false;
let draftCreated = false;
try {
  const hooks = await client.request({ url: '/hooks/projects/ap0mc9ri' });
  const hook = hooks.find(item => item.name === 'Website published-content rebuild');
  if (!hook || hook.isDisabled || hook.isDisabledByUser) throw new Error('Webhook is not enabled.');
  // The website only reads siteSettings at the canonical ID "siteSettings", so this never renders.
  await client.create({ _id: draftId, _type: 'siteSettings', title: 'Temporary publication test draft' });
  draftCreated = true;
  await client.create({ _id: id, _type: 'siteSettings', title: 'Temporary publication test' });
  created = true;
  await client.patch(id).set({ title: 'Temporary publication test updated' }).commit();
  await client.delete(id);
  created = false;
  await client.delete(draftId);
  draftCreated = false;
  console.log(JSON.stringify({ fixtureId: id, expectedEvents: ['create', 'update', 'delete'], fixturesRemoved: true }));
  // Sanity queues deliveries. Poll briefly for this fixture only, without logging headers or credentials.
  for (let i = 0; i < 12; i++) {
    const messages = await client.request({ url: `/hooks/${hook.id}/messages`, query: { limit: 25 } });
    const relevant = messages.map(item => ({ ...item, event: JSON.parse(item.payload) })).filter(item => item.event.id === id || item.event.id === draftId);
    if (relevant.length >= 3 && relevant.every(item => item.resultCode === 202)) {
      if (relevant.some(item => item.event.id === draftId)) throw new Error('Draft triggered a rebuild.');
      console.log(JSON.stringify(relevant.map(item => ({ operation: item.event.operation, status: item.resultCode, messageId: item.id }))));
      process.exitCode = 0;
      break;
    }
    if (i === 11) throw new Error('Delivery verification timed out; inspect webhook attempts in Sanity.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
} catch (error) {
  console.error(error instanceof Error && /^(Webhook|Draft|Delivery)/.test(error.message) ? error.message : 'Publication integration test failed; no provider response or credentials were printed.');
  process.exitCode = 1;
} finally {
  if (created) await client.delete(id);
  if (draftCreated) await client.delete(draftId);
}
