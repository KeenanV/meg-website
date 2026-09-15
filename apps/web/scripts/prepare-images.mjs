import fs from 'node:fs/promises';
import sharp from 'sharp';

// Keep camera originals outside Astro's import graph: imported originals are
// emitted too, even when every rendered <img> uses an optimized getImage URL.
const originals = new URL('../../../design-assets/backgrounds/', import.meta.url);
const output = new URL('../src/assets/backgrounds/', import.meta.url);
await fs.mkdir(output, { recursive: true });
for (const name of ['bg', 'bg-blog', 'bg-news']) {
  const result = await sharp(await fs.readFile(new URL(name + '.jpg', originals)))
    .rotate().resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 90 }).toBuffer();
  const destination = new URL(name + '.webp', output);
  const existing = await fs.readFile(destination).catch(() => undefined);
  if (!existing?.equals(result)) await fs.writeFile(destination, result);
  console.log(name + ': ' + Math.round(result.length / 1024) + ' KiB source image');
}
