/**
 * Writes every theme in themes/ as a USB package (.idv7pkg) into the folder given as argument,
 * the way the Studio saves them, so car-node8-check.cjs can read them on Node 8.
 *
 *   npx tsx tools/development/make-test-packages.ts <out-folder>
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildThemePackage, compileTheme, encodeThemePackage } from '@idv7lol/theme-compiler';
import { bakeFamily } from '@idv7lol/theme-compiler/node';

const out = process.argv[2];
if (!out) {
  console.error('usage: make-test-packages.ts <out-folder>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const root = 'themes';
const files = [
  ...readdirSync(root).map((d) => join(root, d, 'theme.json')),
  ...['community', 'examples'].flatMap((g) =>
    readdirSync(join(root, g)).map((d) => join(root, g, d, 'theme.json')),
  ),
].filter((f) => existsSync(f));

const baked = bakeFamily('sans');
const fonts = { sans: { pixels: baked.pixels, metrics: baked.metrics } };
let bad = 0;
for (const file of files) {
  const result = compileTheme(JSON.parse(readFileSync(file, 'utf8')) as unknown, { fonts });
  if (!result.compiled) {
    bad++;
    console.error(`${file}: ${result.report.errors.map((e) => e.message).join('; ')}`);
    continue;
  }
  const pkg = buildThemePackage(result);
  const name = `${result.compiled.id}.idv7pkg`;
  writeFileSync(join(out, name), gzipSync(Buffer.from(encodeThemePackage(pkg))));
  console.log(`wrote ${name}`);
}
process.exitCode = bad ? 1 : 0;
