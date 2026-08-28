'use strict';

// PHP template gate: `php -l` catches syntax errors, then PHPStan checks SDK classes,
// methods, enum cases, and named constructor arguments against the exact published Waffo
// package. Associative payload arrays stay guarded by static-spec.mjs because PHP arrays,
// like Python dicts, accept arbitrary string keys the analyser cannot pin down.

import fs from 'node:fs';
import path from 'node:path';
import { extractBlocks, FENCE } from './extract.mjs';
import { isFrameworkBlock, writeProject, run, has, tmpDir } from './util.mjs';

const WAFFO_PHP_VERSION = '0.2.0';
const PHPSTAN_CONSTRAINT = '^2.1';
// PHPUnit only supplies TestCase types for PHPStan to analyse the test template — no tests run.
// The range keeps composer resolvable on the SDK's PHP floor (8.0 → 9.6; 8.2+ → 11.5) so the
// gate can lint the templates against the minimum supported PHP, not just the CI default.
const PHPUNIT_CONSTRAINT = '^9.6 || ^10.5 || ^11.5';
const PHPSTAN_LEVEL = '5';
// Optional path repository (a local waffo-php checkout) for offline/pinned runs.
const LOCAL_SDK = process.env.WAFFO_PHP_SDK;

export async function checkPhp(repoRoot) {
  if (!has('php')) return { lang: 'php', skipped: 'php not found' };
  if (!has('composer')) return { lang: 'php', skipped: 'composer not found' };

  // Tier 1: config/services/test. Framework webhook variants need Laravel/Symfony installed.
  const blocks = extractBlocks(path.join(repoRoot, 'references', 'php.md'), FENCE.php)
    .filter((b) => b.path && !isFrameworkBlock(b.path));

  const dir = tmpDir('waffo-php');
  writeProject(dir, blocks);

  // Reproducible syntax gate — no dependencies required.
  const files = collect(dir, '.php');
  for (const file of files) {
    const lint = run('php', ['-l', file], { cwd: dir, allowFail: true });
    if (lint.status !== 0) {
      return { lang: 'php', ok: false, files: files.length, output: lint.stderr || lint.stdout };
    }
  }

  // Throwaway composer project resolving the exact published SDK + analyser.
  const composerJson = {
    name: 'waffo/integration-harness',
    description: 'Throwaway project that type-checks the php.md templates against the real SDK.',
    require: { 'waffo/waffo-php': WAFFO_PHP_VERSION },
    'require-dev': { 'phpstan/phpstan': PHPSTAN_CONSTRAINT, 'phpunit/phpunit': PHPUNIT_CONSTRAINT },
    autoload: { 'psr-4': { 'App\\': 'app/' } },
    'autoload-dev': { 'psr-4': { 'App\\Tests\\': 'tests/' } },
    'minimum-stability': 'stable',
    'prefer-stable': true,
    config: { 'allow-plugins': {} },
  };
  if (LOCAL_SDK) {
    composerJson.repositories = [{ type: 'path', url: LOCAL_SDK, options: { symlink: false } }];
    composerJson.require['waffo/waffo-php'] = '*';
  }
  fs.writeFileSync(path.join(dir, 'composer.json'), JSON.stringify(composerJson, null, 2));

  fs.writeFileSync(path.join(dir, 'phpstan.neon'), [
    'parameters:',
    `    level: ${PHPSTAN_LEVEL}`,
    '    paths:',
    '        - app',
    '        - tests',
    '    bootstrapFiles:',
    '        - vendor/autoload.php',
    '',
  ].join('\n'));

  const install = run('composer', [
    'update', '--no-interaction', '--no-progress', '--prefer-dist', '--quiet',
  ], { cwd: dir, allowFail: true, env: { COMPOSER_NO_AUDIT: '1' } });
  if (install.status !== 0) {
    return {
      lang: 'php',
      skipped: `composer update failed (SDK/analyser not resolvable): ${firstLine(install.stderr || install.stdout)}`,
    };
  }

  // Pin verification: the analyser must run against exactly the published SDK version.
  if (!LOCAL_SDK) {
    const shown = run('composer', ['show', 'waffo/waffo-php', '--format=json'], { cwd: dir, allowFail: true });
    let installed = '';
    try { installed = (JSON.parse(shown.stdout).versions || [])[0] || ''; } catch { installed = ''; }
    if (installed.replace(/^v/, '') !== WAFFO_PHP_VERSION) {
      return {
        lang: 'php', ok: false, files: files.length,
        output: `expected waffo/waffo-php ${WAFFO_PHP_VERSION}; got ${installed || firstLine(shown.stderr)}`,
      };
    }
  }

  const phpstan = run(path.join(dir, 'vendor', 'bin', 'phpstan'), [
    'analyse', '--no-progress', '--error-format=raw', '--configuration=phpstan.neon',
  ], { cwd: dir, allowFail: true });
  return {
    lang: 'php',
    ok: phpstan.status === 0,
    files: files.length,
    output: phpstan.status === 0 ? '' : phpstan.stdout || phpstan.stderr,
  };
}

function firstLine(s) {
  return (s || '').split('\n').find((line) => line.trim()) || '';
}

function collect(root, ext) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(ext)) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}
