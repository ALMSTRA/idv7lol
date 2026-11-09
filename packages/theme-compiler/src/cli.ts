#!/usr/bin/env node
/**
 * idv7lol theme compiler CLI.
 *
 *   idv7lol-theme validate <theme.json…>
 *   idv7lol-theme build <theme.json…> --out <dir>
 *   idv7lol-theme bake-font <family> --out <dir>     (writes <family>.r8, .json and a preview .png)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateTheme } from './validate.js';
import type { Finding } from './types.js';
import { compileThemeFile, writeBundle, bakeFamily, encodePng, FONT_FAMILIES } from './node.js';

function expand(patterns: string[]): string[] {
  // Minimal glob: supports a single "*" segment, as in themes/*/theme.json.
  const out: string[] = [];
  for (const p of patterns) {
    if (!p.includes('*')) {
      out.push(p);
      continue;
    }
    const [before, after] = p.split('*', 2) as [string, string];
    const dir = before.replace(/[\\/]+$/, '') || '.';
    for (const entry of readdirSync(dir)) {
      const candidate = join(dir, entry + after);
      if (existsSync(candidate)) out.push(candidate);
    }
  }
  return out;
}

function printFindings(list: Finding[], label: string): void {
  for (const f of list) {
    const where = f.componentId ? ` [${f.componentId}]` : f.path ? ` (${f.path})` : '';
    console.log(`  ${label}${where} ${f.code}: ${f.message}${f.hint ? `\n      → ${f.hint}` : ''}`);
  }
}

function argValue(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const files = rest.filter((a) => !a.startsWith('--') && rest[rest.indexOf(a) - 1] !== '--out');
  if (cmd === 'validate') {
    let failed = 0;
    for (const file of expand(files)) {
      const report = validateTheme(JSON.parse(readFileSync(file, 'utf8')));
      console.log(
        `${report.ok ? 'OK  ' : 'FAIL'} ${file}  (${report.layers ?? '?'} layers, ${report.errors.length} errors, ${report.warnings.length} warnings)`,
      );
      printFindings(report.errors, 'error  ');
      printFindings(report.warnings, 'warning');
      if (rest.includes('--verbose')) printFindings(report.infos, 'info   ');
      if (!report.ok) failed += 1;
    }
    return failed ? 1 : 0;
  }
  if (cmd === 'build') {
    const out = argValue(rest, '--out', 'dist/themes');
    let failed = 0;
    for (const file of expand(files)) {
      const result = compileThemeFile(file);
      const r = result.report;
      if (!result.compiled) {
        console.log(`FAIL ${file}`);
        printFindings(r.errors, 'error  ');
        failed += 1;
        continue;
      }
      const written = writeBundle(result, out);
      console.log(
        `OK   ${file} → ${join(out, result.compiled.id)}  (${result.compiled.layers} layers, ${written.length} files, ${r.warnings.length} warnings)`,
      );
      printFindings(r.warnings, 'warning');
    }
    return failed ? 1 : 0;
  }
  if (cmd === 'bake-font') {
    const out = argValue(rest, '--out', 'dist/fonts');
    const families = files.length ? files : FONT_FAMILIES;
    mkdirSync(out, { recursive: true });
    for (const fam of families) {
      const t0 = Date.now();
      const baked = bakeFamily(fam);
      writeFileSync(join(out, `${fam}.r8`), baked.pixels);
      writeFileSync(join(out, `${fam}.json`), JSON.stringify(baked.metrics));
      writeFileSync(
        join(out, `${fam}.png`),
        encodePng(baked.width, baked.height, baked.pixels, true),
      );
      console.log(
        `baked ${fam}: ${baked.width}×${baked.height} (${baked.pixels.length} bytes) in ${Date.now() - t0} ms`,
      );
    }
    return 0;
  }
  console.log(
    'usage: idv7lol-theme validate <theme.json…> | build <theme.json…> --out <dir> | bake-font [family…] --out <dir>',
  );
  return 2;
}

process.exitCode = main(process.argv.slice(2));
