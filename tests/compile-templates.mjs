#!/usr/bin/env node
'use strict';

// Regression harness: compile/type-check the language templates in references/*.md
// against the pinned Waffo SDKs, plus deterministic contract assertions. This is what
// mechanically catches template drift (phantom fields, wrong methods, unhandled checked
// exceptions, missing required fields) that LLM-judged evals and prose reviews miss.
//
// Usage: node tests/compile-templates.mjs [--lang all|java,node,go,python] [--strict]
//   --strict  treat "skipped (toolchain/SDK missing)" as failure (set in CI).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStaticSpec } from './harness/static-spec.mjs';
import { checkJava } from './harness/java.mjs';
import { checkNode } from './harness/node.mjs';
import { checkGo } from './harness/go.mjs';
import { checkPython } from './harness/python.mjs';
import { checkPhp } from './harness/php.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNERS = { java: checkJava, node: checkNode, go: checkGo, python: checkPython, php: checkPhp };

function parseArgs(argv) {
  const out = { langs: Object.keys(RUNNERS), strict: !!process.env.WAFFO_HARNESS_STRICT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang') out.langs = argv[++i] === 'all' ? Object.keys(RUNNERS) : argv[i].split(',');
    else if (argv[i] === '--strict') out.strict = true;
  }
  return out;
}

async function main() {
  const { langs, strict } = parseArgs(process.argv.slice(2));
  let failed = 0;

  // 1) Deterministic contract assertions (always, no toolchain needed).
  console.log('── Static contract spec ─────────────────────────────');
  const spec = runStaticSpec(REPO);
  for (const r of spec) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    if (!r.ok) failed++;
  }

  // 2) Per-language compile against the real SDK.
  console.log('\n── Template compile ─────────────────────────────────');
  for (const lang of langs) {
    const runner = RUNNERS[lang];
    if (!runner) { console.log(`  ? unknown lang: ${lang}`); continue; }
    let res;
    try {
      res = await runner(REPO);
    } catch (e) {
      res = { lang, ok: false, output: String(e.message || e) };
    }
    if (res.skipped) {
      const mark = strict ? '✗ (strict)' : '⚠ skipped';
      console.log(`  ${mark} ${lang}: ${res.skipped}`);
      if (strict) failed++;
      continue;
    }
    console.log(`  ${res.ok ? '✓' : '✗'} ${lang} — compiled ${res.files ?? '?'} file(s)`);
    if (!res.ok) {
      failed++;
      console.log(indent(res.output || '(no output)'));
    }
  }

  console.log(`\n${failed === 0 ? '✅ template harness passed' : `❌ template harness: ${failed} failure(s)`}`);
  process.exit(failed === 0 ? 0 : 1);
}

function indent(s) {
  return s.split('\n').slice(0, 40).map((l) => '      ' + l).join('\n');
}

main();
