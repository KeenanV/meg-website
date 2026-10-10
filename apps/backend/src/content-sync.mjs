import {createHash} from 'node:crypto';

export const CONTENT_TYPES = ['siteSettings', 'about', 'linksPage', 'book', 'blogPost', 'newsItem', 'meditation'];
const managed = doc => CONTENT_TYPES.includes(doc._type) && !doc._id.startsWith('versions.');
const published = doc => managed(doc) && !doc._id.startsWith('drafts.');
export function contentDocument(doc) {
  const {_rev, _createdAt, _updatedAt, ...body} = doc;
  return body;
}
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export const contentHash = doc => digest(contentDocument(doc));
export const snapshotHash = docs => digest(docs.filter(managed).map(doc => [doc._id, doc._rev]).sort(([a], [b]) => a.localeCompare(b)));

// Compare source and target content independently of each bucket's generation IDs.
function comparable(doc) {
  const body = structuredClone(contentDocument(doc));
  if (body.privateAudio) {
    delete body.privateAudio.generation;
    delete body.privateAudio.objectKey;
  }
  return body;
}
export function planSync({source, target, baseline = {}, mode}) {
  if (!['update', 'reset'].includes(mode)) throw new Error('Unknown sync mode');
  const src = source.filter(published);
  const dst = target.filter(managed);
  if (src.length > 400 || dst.length > 400) throw new Error('Content exceeds the reviewed single-transaction limit');
  if (target.some(doc => CONTENT_TYPES.includes(doc._type) && doc._id.startsWith('versions.'))) throw new Error('Resolve staging content-release versions before syncing');
  const byId = new Map(dst.map(doc => [doc._id, doc]));
  const sourceIds = new Set(src.map(doc => doc._id));
  const add = [], update = [], remove = [], conflicts = [], retained = [], unchanged = [];
  for (const doc of src) {
    const existing = byId.get(doc._id);
    const previous = baseline[doc._id];
    if (mode === 'update' && byId.has('drafts.' + doc._id)) {
      conflicts.push({id: doc._id, reason: 'Staging has an unpublished draft.'}); continue;
    }
    if (!existing) {add.push(doc._id); continue;}
    const equal = digest(comparable(existing)) === digest(comparable(doc));
    // Matching sizes alone do not prove two audio files are identical. A previous
    // verified copy is required to treat remapped recordings as unchanged.
    const sameAudio = !doc.privateAudio || (previous?.source === contentHash(doc) && previous?.target === contentHash(existing));
    if (equal && sameAudio) {unchanged.push(doc._id); continue;}
    if (mode === 'update' && (!previous || previous.target !== contentHash(existing))) {
      conflicts.push({id: doc._id, reason: 'Staging differs from the last synchronized copy.'}); continue;
    }
    update.push(doc._id);
  }
  for (const doc of dst) {
    if (sourceIds.has(doc._id)) continue;
    (mode === 'reset' ? remove : retained).push(doc._id);
  }
  return {mode, sourceHash: snapshotHash(source.filter(published)), targetHash: snapshotHash(target),
    labels: Object.fromEntries([...dst, ...src].map(doc => [doc._id, doc.title || doc.name || doc._type])),
    add, update, remove, conflicts, retained, unchanged};
}

export function assertSnapshot(plan, source, target) {
  if (plan.sourceHash !== snapshotHash(source.filter(published)) || plan.targetHash !== snapshotHash(target)) {
    throw new Error('Content changed after review. Create a fresh plan before applying.');
  }
}

export function validateContent(docs) {
  // Unfinished drafts kept by Update must not block unrelated published content.
  const items = docs.filter(published);
  const ids = new Set(docs.map(doc => doc._id));
  const slugs = new Set();
  for (const doc of items) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(doc._id)) throw new Error('Invalid document ID');
    if (['blogPost', 'newsItem', 'book', 'meditation'].includes(doc._type) && !doc.title?.trim()) throw new Error('An item is missing its title');
    if (['blogPost', 'newsItem'].includes(doc._type) && !doc._id.startsWith('drafts.')) {
      const slug = doc.slug?.current;
      if (typeof slug !== 'string' || !slug || /[/?#\\]/.test(slug) || ['page', '.', '..'].includes(slug)) throw new Error('Invalid article slug');
      const key = doc._type + ':' + slug;
      if (slugs.has(key)) throw new Error('Duplicate article slug');
      slugs.add(key);
    }
    function refs(value) {
      if (!value || typeof value !== 'object') return;
      if (value._type === 'reference' && !value._weak && !ids.has(value._ref)) throw new Error('Missing referenced document or asset');
      Object.values(value).forEach(refs);
    }
    refs(doc);
  }
}

// All storage/network operations are supplied by a fixed production-read /
// staging-write adapter. This module never accepts a caller-selected dataset.
export async function applySync({plan, snapshot, adapter, progress = async () => {}}) {
  if (plan.conflicts.length) throw new Error('Resolve conflicts or explicitly review a reset');
  const [source, target] = await Promise.all([adapter.readSource(), adapter.readTarget()]);
  assertSnapshot(plan, source, target);
  await progress('Backing up staging content and media');
  await adapter.backup(target);
  await progress('Copying and verifying assets and private recordings');
  const selected = new Set([...plan.add, ...plan.update]);
  const replacements = [];
  for (const doc of snapshot.filter(doc => selected.has(doc._id))) replacements.push(await adapter.copyDocument(contentDocument(doc)));
  const final = target.filter(doc => !selected.has(doc._id) && !plan.remove.includes(doc._id)).concat(replacements);
  const assets = await adapter.targetAssets();
  validateContent(final.concat(assets));
  await adapter.validateSchema(final.filter(doc => !doc._id.startsWith('drafts.')));
  // Re-check after potentially slow media copies. Individual document revision
  // preconditions additionally prevent an edit from being overwritten at commit.
  assertSnapshot(plan, await adapter.readSource(), await adapter.readTarget());
  await progress('Applying reviewed content');
  await adapter.commit({replacements, remove: plan.remove, expected: target});
  const verified = await adapter.readTarget();
  const expectedHashes = new Map(final.filter(managed).map(doc => [doc._id, contentHash(doc)]));
  if (verified.filter(managed).length !== expectedHashes.size || verified.filter(managed).some(doc => expectedHashes.get(doc._id) !== contentHash(doc))) {
    throw new Error('Post-copy verification failed; preserve the backup and keep staging in maintenance');
  }
  const next = {};
  const verifiedMap = new Map(verified.map(doc => [doc._id, doc]));
  for (const doc of snapshot.filter(published)) {
    if (verifiedMap.has(doc._id)) next[doc._id] = {source: contentHash(doc), target: contentHash(verifiedMap.get(doc._id))};
  }
  await adapter.saveBaseline(next);
  return {copied: replacements.length, removed: plan.remove.length};
}
