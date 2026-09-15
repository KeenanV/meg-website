import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Sanity CLI's TypeID dependency still requests uuid 10. Test the uuid 11
// override through the consumer's real CJS and ESM APIs, including buffer output.
const require = createRequire(import.meta.url);
test('Sanity CLI TypeIDs generate unique identifiers and survive UUID round trips', async () => {
  for (const api of [require('typeid-js'), await import('typeid-js')]) {
    const values = new Set();
    for (let index = 0; index < 100; index++) {
      const id = api.typeid('test');
      const value = id.toString();
      assert.match(value, /^test_[0-7][0-9a-hjkmnp-tv-z]{25}$/);
      assert.equal(api.TypeID.fromString(value).toUUID(), id.toUUID());
      assert.equal(api.TypeID.fromUUID('test', id.toUUID()).toString(), value);
      values.add(value);
    }
    assert.equal(values.size, 100);
  }
});
