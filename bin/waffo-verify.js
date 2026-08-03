#!/usr/bin/env node

/**
 * waffo-verify — executable enforcement for waffo-integrate.
 *
 * This is the "program that checks", as opposed to the SKILL.md instruction manual.
 * It runs against a MERCHANT PROJECT (not the skill repo) and mechanically verifies
 * the integration invariants that can be checked from source + a manifest, then exits
 * non-zero on violations.
 *
 * Design principle (teeth): this script owns the canonical Feature -> Required-Handler
 * map itself. It does NOT trust the handler list the agent wrote into the manifest — it
 * re-derives the required set from the selected features and greps the project source.
 * An agent that silently shrinks its own checklist (the failure this exists to prevent)
 * is caught here regardless.
 *
 * Modes:
 *   node waffo-verify.js [projectDir]                 advisory run (agent runs this in Step 5/6)
 *   node waffo-verify.js [projectDir] --gate report   report save-gate (for a PreToolUse hook)
 *   node waffo-verify.js [projectDir] --json          machine-readable output
 *
 * Exit codes:
 *   0  clean
 *   1  violations found (advisory mode) — the agent must fix and re-run
 *   2  blocking violation in --gate mode — a Claude Code PreToolUse hook treats this as "deny"
 *
 * Zero runtime dependencies. Node >= 16.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Canonical contract (this file is the source of truth the checks reconcile against)
// ---------------------------------------------------------------------------

// Feature -> required webhook handlers. MUST mirror SKILL.md "Required Handler Manifest".
const FEATURE_REQUIRED_HANDLERS = {
  order: ['onPayment'],
  refund: ['onRefund'],
  subscription: ['onSubscriptionStatus', 'onSubscriptionPeriodChanged', 'onPayment'],
  subscriptionChange: ['onSubscriptionChange'],
};

// Each handler is "present" if ANY of its identifiers appears in project source.
// These are SDK-defined identifiers (method names per language + the event enum),
// so grepping them is reliable across Node / Java / Go / Python.
const HANDLER_IDENTIFIERS = {
  onPayment: ['onPayment', 'on_payment', 'PAYMENT_NOTIFICATION'],
  onRefund: ['onRefund', 'on_refund', 'REFUND_NOTIFICATION'],
  onSubscriptionStatus: ['onSubscriptionStatus', 'on_subscription_status', 'SUBSCRIPTION_STATUS_NOTIFICATION'],
  onSubscriptionPeriodChanged: ['onSubscriptionPeriodChanged', 'on_subscription_period_changed', 'SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION'],
  onSubscriptionChange: ['onSubscriptionChange', 'on_subscription_change', 'SUBSCRIPTION_CHANGE_NOTIFICATION'],
};

// Code signatures that prove a feature is actually integrated, used to corroborate the
// manifest's declared features so the agent cannot hide a feature to dodge its handlers.
const FEATURE_CODE_SIGNATURES = {
  order: [/\.order\s*\(\s*\)\s*\.\s*create/, /order\(\)\.create/, /\border\(\)/],
  refund: [/\.refund\s*\(/, /order\(\)\.refund/, /refund\(\)\.inquiry/],
  subscription: [/subscription\s*\(\s*\)\s*\.\s*create/, /subscription\(\)\.create/, /\.subscription\(/],
  subscriptionChange: [/subscription\(\)\.change/, /\.change_inquiry/, /changeInquiry/],
};

// The loud-stub marker an agent must emit when a money-affecting decision is unresolved
// (BLOCK-and-stub). A live marker in shipped code blocks a FULL/CONDITIONAL report.
const DECISION_STUB_MARKER = 'WAFFO_DECISION_REQUIRED';

const MANIFEST_REL = path.join('.waffo', 'integration-manifest.json');

const SOURCE_EXT = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.java', '.go', '.py', '.kt', '.rb', '.php', '.cs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'vendor', 'target', '__pycache__', '.venv', 'venv', '.next', 'coverage', '.waffo']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

function collectSourceFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (SOURCE_EXT.has(path.extname(entry.name))) {
        out.push(full);
      }
    }
  }
  return out;
}

function loadCorpus(files) {
  const corpus = [];
  for (const file of files) {
    try {
      if (fs.statSync(file).size > MAX_FILE_BYTES) continue;
      corpus.push({ file, text: fs.readFileSync(file, 'utf8') });
    } catch {
      /* ignore unreadable file */
    }
  }
  return corpus;
}

function firstMatch(corpus, needleOrRegex) {
  const isRegex = needleOrRegex instanceof RegExp;
  for (const { file, text } of corpus) {
    if (isRegex ? needleOrRegex.test(text) : text.includes(needleOrRegex)) {
      return file;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function readManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!fs.existsSync(manifestPath)) return { path: manifestPath, missing: true };
  try {
    return { path: manifestPath, data: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
  } catch (err) {
    return { path: manifestPath, parseError: err.message };
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function deriveRequiredHandlers(features) {
  const required = new Set();
  for (const feature of features) {
    for (const handler of FEATURE_REQUIRED_HANDLERS[feature] || []) required.add(handler);
  }
  return [...required];
}

/**
 * @returns {{errors: string[], warnings: string[], notes: string[]}}
 */
function runChecks(root, corpus, manifest) {
  const errors = [];
  const warnings = [];
  const notes = [];

  // --- Manifest presence -------------------------------------------------
  if (manifest.missing) {
    errors.push(
      `Missing integration manifest at ${MANIFEST_REL}. The agent must emit it (see docs/enforcement.md). ` +
      `Without it, feature scope and human-decision status cannot be reconciled.`
    );
    // Fall through: we can still run code-only grep checks below.
  } else if (manifest.parseError) {
    errors.push(`Manifest at ${MANIFEST_REL} is not valid JSON: ${manifest.parseError}`);
  }

  const data = (manifest && manifest.data) || {};
  const declaredFeatures = Array.isArray(data.features) ? data.features : [];

  // --- Feature corroboration: code must not use a feature the manifest hides
  for (const [feature, sigs] of Object.entries(FEATURE_CODE_SIGNATURES)) {
    const hit = firstMatch(corpus, sigs.find((s) => firstMatch(corpus, s)) || sigs[0]);
    const usedInCode = sigs.some((s) => firstMatch(corpus, s));
    if (usedInCode && declaredFeatures.length && !declaredFeatures.includes(feature)) {
      errors.push(
        `Code uses "${feature}" (found near ${hit || 'source'}) but the manifest does not declare it. ` +
        `Every integrated feature must be declared so its required handlers are enforced.`
      );
    }
  }

  // --- Required handler completeness (the direct fix for the dropped-handler failure)
  // Re-derive from features using THIS script's canonical map — not the manifest's list.
  const featuresForHandlers = declaredFeatures.length ? declaredFeatures : inferFeaturesFromCode(corpus);
  if (!declaredFeatures.length && featuresForHandlers.length) {
    notes.push(`Manifest features missing; inferred ${JSON.stringify(featuresForHandlers)} from code for handler checks.`);
  }
  const requiredHandlers = deriveRequiredHandlers(featuresForHandlers);
  for (const handler of requiredHandlers) {
    const ids = HANDLER_IDENTIFIERS[handler] || [handler];
    const found = ids.some((id) => firstMatch(corpus, id));
    if (!found) {
      errors.push(
        `Required handler "${handler}" is not registered anywhere in the project ` +
        `(searched for ${ids.join(', ')}). Selected features ${JSON.stringify(featuresForHandlers)} require it.`
      );
    }
  }

  // --- Human-decision gate: unresolved money-affecting decisions must carry a loud stub
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  const liveStub = firstMatch(corpus, DECISION_STUB_MARKER);
  const unresolved = decisions.filter((d) => d && d.status && d.status !== 'CONFIRMED_BY_HUMAN');
  for (const d of unresolved) {
    if (!liveStub) {
      errors.push(
        `Decision "${d.id || '(unnamed)'}" is ${d.status} but no ${DECISION_STUB_MARKER} stub was found in code. ` +
        `An unconfirmed money-affecting decision must fail loudly (BLOCK-and-stub), never take a silent default.`
      );
    }
  }
  if (decisions.length) {
    const confirmedWithoutEvidence = decisions.filter(
      (d) => d && d.status === 'CONFIRMED_BY_HUMAN' && !d.evidence
    );
    for (const d of confirmedWithoutEvidence) {
      warnings.push(`Decision "${d.id || '(unnamed)'}" is CONFIRMED_BY_HUMAN but has no evidence field. Confirmation should quote the developer.`);
    }
  }

  // --- Request-ID length (ships-wrong-code class): 36-char dashed UUID in an id position
  const badUuid = firstMatch(
    corpus,
    /(paymentRequestId|refundRequestId|subscriptionRequest)\s*[:=][^\n]*\buuidv4\s*\(\s*\)(?![^\n]*replace)/i
  );
  if (badUuid) {
    errors.push(
      `A request-ID field is assigned a raw uuidv4() (36 chars) without stripping dashes in ${badUuid}. ` +
      `Waffo request IDs are max 32 chars — use randomUUID().replace(/-/g,'') / uuid.uuid4().hex.`
    );
  }

  // --- Field contamination: order vs subscription currency keys.
  // Tempered token `(?:(?!\.create\b)[\s\S])` keeps the match inside a single create()
  // call — it never bleeds across a following order()/subscription() create statement,
  // which would otherwise produce false positives.
  const orderUsesSubKey = firstMatch(corpus, /order\s*\(\s*\)\s*\.\s*create\b(?:(?!\.create\b)[\s\S]){0,300}?\bcurrency\s*:/);
  if (orderUsesSubKey) {
    warnings.push(`order().create appears to use "currency" (subscription key) near ${orderUsesSubKey}; order create uses orderCurrency/orderAmount.`);
  }
  const subUsesOrderKey = firstMatch(corpus, /subscription\s*\(\s*\)\s*\.\s*create\b(?:(?!\.create\b)[\s\S]){0,300}?\borderCurrency\s*:/);
  if (subUsesOrderKey) {
    warnings.push(`subscription().create appears to use "orderCurrency" (order key) near ${subUsesOrderKey}; subscription create uses currency/amount.`);
  }

  // --- Report save-gate readiness: phases + evidence must be terminal
  const phases = data.phases && typeof data.phases === 'object' ? data.phases : {};
  const nonTerminalPhases = Object.entries(phases)
    .filter(([, state]) => !['PASS', 'CONDITIONAL', 'FAIL', 'N/A', 'SKIPPED'].includes(String(state)))
    .map(([name]) => name);
  if (nonTerminalPhases.length) {
    notes.push(`Phases without a terminal state: ${nonTerminalPhases.join(', ')}.`);
  }

  return { errors, warnings, notes, unresolvedDecisions: unresolved, liveStub, phases };
}

function inferFeaturesFromCode(corpus) {
  const features = [];
  for (const [feature, sigs] of Object.entries(FEATURE_CODE_SIGNATURES)) {
    if (sigs.some((s) => firstMatch(corpus, s))) features.push(feature);
  }
  return features;
}

// ---------------------------------------------------------------------------
// Report-gate decision (used with --gate report; the blocking hook path)
// ---------------------------------------------------------------------------

function reportGateBlocked(result, manifest) {
  const data = (manifest && manifest.data) || {};
  const reasons = [];
  if (result.errors.length) reasons.push(...result.errors);
  if (result.liveStub) reasons.push(`A live ${DECISION_STUB_MARKER} stub remains in code — the integration has unresolved money-affecting decisions.`);
  if (result.unresolvedDecisions.length) {
    reasons.push(`Unresolved decisions: ${result.unresolvedDecisions.map((d) => d.id || '(unnamed)').join(', ')}.`);
  }
  const outcome = String(data.outcome || '').toUpperCase();
  if (['FULL', 'CONDITIONAL'].includes(outcome) && reasons.length) {
    reasons.unshift(`Manifest declares outcome ${outcome} while blocking violations remain.`);
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const gateIdx = args.indexOf('--gate');
  const gateMode = gateIdx !== -1 ? args[gateIdx + 1] : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && !(gateIdx !== -1 && i === gateIdx + 1));
  const root = path.resolve(positional[0] || process.cwd());

  const manifest = readManifest(root);
  const corpus = loadCorpus(collectSourceFiles(root));
  const result = runChecks(root, corpus, manifest);

  if (gateMode === 'report') {
    const blockReasons = reportGateBlocked(result, manifest);
    if (blockReasons.length) {
      const msg = 'waffo-verify: BLOCKED report write —\n  - ' + blockReasons.join('\n  - ');
      if (asJson) process.stdout.write(JSON.stringify({ blocked: true, reasons: blockReasons }) + '\n');
      else process.stderr.write(msg + '\n');
      process.exit(2);
    }
    if (asJson) process.stdout.write(JSON.stringify({ blocked: false }) + '\n');
    else process.stdout.write('waffo-verify: report save-gate passed.\n');
    process.exit(0);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.errors.length ? 1 : 0);
  }

  const lines = [`waffo-verify — scanned ${corpus.length} source files under ${root}`];
  if (result.errors.length) {
    lines.push('', `ERRORS (${result.errors.length}) — must fix:`);
    result.errors.forEach((e) => lines.push(`  ✗ ${e}`));
  }
  if (result.warnings.length) {
    lines.push('', `WARNINGS (${result.warnings.length}):`);
    result.warnings.forEach((w) => lines.push(`  ! ${w}`));
  }
  if (result.notes.length) {
    lines.push('', 'NOTES:');
    result.notes.forEach((n) => lines.push(`  · ${n}`));
  }
  if (!result.errors.length && !result.warnings.length) {
    lines.push('', '✓ No violations found.');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(result.errors.length ? 1 : 0);
}

main();
