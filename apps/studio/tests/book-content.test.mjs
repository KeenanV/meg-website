import test from 'node:test';
import assert from 'node:assert/strict';
import { migratedBookFields, paragraphsToBlocks } from '../scripts/book-content.mjs';

test('plain-text conversion preserves paragraph text, line breaks, and literal markup', () => {
  const blocks = paragraphsToBlocks('One <literal> paragraph.\nSecond line.\n\nAnother paragraph.');
  assert.deepEqual(blocks.map(block => block.children[0].text), ['One <literal> paragraph.\nSecond line.', 'Another paragraph.']);
  assert.equal(new Set(blocks.map(block => block._key)).size, 2);
});

test('existing Vortex praise moves intact into endorsements and duplicate status is removed', () => {
  const result = migratedBookFields({ title: 'The Social Anxiety Vortex: How We Get Trapped and How to Break Free',
    description: 'Coming Soon\n\nAuthors: Meg and Ana\n\nSummary.\n\nPraise for The Social Anxiety Vortex: Why We Get Trapped and How to Break Free\n\n“First quote”\n\n--Author One\n\n“Second quote”\n\n--Author Two' });
  assert.deepEqual(result.descriptionRichText.map(block => block.children[0].text), ['Authors: Meg and Ana', 'Summary.']);
  assert.deepEqual(result.endorsements.map(block => block.children[0].text), ['“First quote”', '--Author One', '“Second quote”', '--Author Two']);
  assert.equal(result.endorsements[0].style, 'blockquote');
});

test('migration is idempotent and never replaces editor content, including intentionally empty arrays', () => {
  const book = { title: 'Published book', year: 2020, description: 'Existing prose.' };
  const fields = migratedBookFields(book);
  assert.deepEqual(migratedBookFields({ ...book, ...fields }), {});
  assert.deepEqual(migratedBookFields({ ...book, descriptionRichText: [], endorsements: [] }), {});
});
