/**
 * Bakes the SDF font atlases the Studio and the MGU app ship with.
 *
 *   npx tsx tools/build/bake-fonts.ts
 *
 * Writes <family>.r8 (pixels), <family>.json (metrics) and <family>.png
 * (preview) into apps/studio/public/fonts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bakeFamily, encodePng, FONT_FAMILIES } from '../../packages/theme-compiler/src/node.js';

const OUT_DIRS = ['apps/studio/public/fonts'];
const families = process.argv.slice(2).length ? process.argv.slice(2) : FONT_FAMILIES;

for (const dir of OUT_DIRS) mkdirSync(dir, { recursive: true });
for (const fam of families) {
  const t0 = Date.now();
  const baked = bakeFamily(fam);
  for (const dir of OUT_DIRS) {
    writeFileSync(join(dir, `${fam}.r8`), baked.pixels);
    writeFileSync(join(dir, `${fam}.json`), JSON.stringify(baked.metrics));
  }
  writeFileSync(
    join(OUT_DIRS[0]!, `${fam}.png`),
    encodePng(baked.width, baked.height, baked.pixels, true),
  );
  console.log(`baked ${fam}: ${baked.width}×${baked.height} in ${Date.now() - t0} ms`);
}
