// Preview: sanity exec scripts/migrate-book-content.mjs --with-user-token
// Apply:   sanity exec scripts/migrate-book-content.mjs --with-user-token -- --apply
// Additive migration: legacy description remains intact for old builds and rollback.
import { getCliClient } from 'sanity/cli';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migratedBookFields } from './book-content.mjs';

const client = getCliClient({ apiVersion: '2025-10-26' }).withConfig({ useCdn: false });
if (client.config().projectId !== 'ap0mc9ri' || client.config().dataset !== 'production') {
  throw new Error('This migration is only for the Meg website production dataset.');
}
const books = await client.fetch('*[_type == "book"]', {}, { perspective: 'raw' });
const changes = books.map(book => ({ book, fields: migratedBookFields(book) }))
  .filter(({ fields }) => Object.keys(fields).length);
console.log(JSON.stringify(changes.map(({ book, fields }) => ({ id: book._id, title: book.title, fields })), null, 2));
if (!process.argv.includes('--apply')) {
  console.log('Preview only; pass --apply to back up and add these fields.');
} else if (changes.length) {
  const backupDir = new URL('../../../.firebase/content-backups/', import.meta.url);
  mkdirSync(backupDir, { recursive: true });
  const backup = new URL(`books-${Date.now()}.json`, backupDir);
  writeFileSync(backup, JSON.stringify(books, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Backup: ${fileURLToPath(backup)}`);
  let transaction = client.transaction();
  for (const { book, fields } of changes) {
    transaction = transaction.patch(book._id, patch => patch.ifRevisionId(book._rev).setIfMissing(fields));
  }
  await transaction.commit();
  console.log(`Updated ${changes.length} books; original descriptions preserved.`);
} else {
  console.log('All books already migrated; no changes made.');
}
