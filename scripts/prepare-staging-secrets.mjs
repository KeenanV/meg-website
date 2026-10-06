import {randomBytes, createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {passwordRecord} from '../apps/backend/src/resources.mjs';
const root = new URL('../.private/', import.meta.url);
await mkdir(root, {recursive: true, mode: 0o700});
const reviewer = randomBytes(32).toString('base64url');
const reader = randomBytes(24).toString('base64url');
const basicHash = createHash('sha256').update('reviewer:' + reviewer).digest('hex');
const resources = await passwordRecord(reader);
// Exclusive creation prevents accidentally rotating deployed credentials.
await writeFile(new URL('staging-access.json', root), JSON.stringify({basicHash, resources}), {flag: 'wx', mode: 0o600});
await writeFile(new URL('staging-reviewer.txt', root),
  `PRIVATE STAGING ONLY — do not commit or use in production.\n\nReviewer username: reviewer\nReviewer password: ${reviewer}\n\nResources test password: ${reader}\n`,
  {flag: 'wx', mode: 0o600});
console.log('Created private staging credential files in .private/. No credentials printed.');
