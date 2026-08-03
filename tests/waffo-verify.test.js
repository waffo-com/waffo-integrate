#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const contract = require('../bin/waffo-verify.js');

const VERIFY = path.resolve(__dirname, '..', 'bin', 'waffo-verify.js');
const HOOK = path.resolve(__dirname, '..', 'bin', 'waffo-claude-hook.js');
const roots = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waffo-verify-test-'));
  roots.push(root);
  return root;
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function runVerify(root, ...args) {
  return spawnSync(process.execPath, [VERIFY, root, ...args], { encoding: 'utf8' });
}

function decisions(features) {
  return contract.deriveRequiredDecisionIds(features).map((id) => ({
    id,
    status: 'CONFIRMED_BY_HUMAN',
    value: `confirmed-${id}`,
    evidence: { source: 'user_message', quote: `developer-confirmed-${id}` },
  }));
}

function manifest(features) {
  const runId = 'run-20260803';
  const evidenceId = 'evidence-current-run';
  const requiredTests = contract.deriveRequiredTestIds(features);
  return {
    schemaVersion: 1,
    skillVersion: '1.5.0',
    features,
    decisions: decisions(features),
    currentRunId: runId,
    evidence: [{ id: evidenceId, runId, kind: 'test_log', summary: 'current fixture execution', capturedAt: '2026-08-03T10:00:00Z' }],
    phases: {
      A: { status: 'PASS', evidenceIds: [evidenceId] },
      B1: { status: 'PASS', evidenceIds: [evidenceId] },
      B2: { status: 'PASS', evidenceIds: [evidenceId] },
      C1: features.includes('refund') ? { status: 'PASS', evidenceIds: [evidenceId] } : { status: 'N/A', reason: 'refund not integrated' },
      C2: features.some((feature) => ['subscription', 'subscriptionChange'].includes(feature))
        ? { status: 'PASS', evidenceIds: [evidenceId] }
        : { status: 'N/A', reason: 'subscription not integrated' },
      D: { status: 'PASS', evidenceIds: [evidenceId] },
    },
    tests: requiredTests.map((id) => ({ id, status: 'PASS', evidenceIds: [evidenceId] })),
    payMethodInquiry: { status: 'PASS', evidenceIds: [evidenceId], activeMethods: [{ id: 'CARD' }] },
    payMethodCoverage: [{ methodId: 'CARD', status: 'PASS', evidenceIds: [evidenceId] }],
    qualityFindings: contract.REQUIRED_QUALITY_CHECKS.map((id) => ({ id, riskLevel: 'PASS', evidenceIds: [evidenceId] })),
    blockers: [],
    mustFix: [],
    outcome: 'FULL',
  };
}

function advisoryManifest(features) {
  return { schemaVersion: 1, skillVersion: '1.5.0', features, decisions: decisions(features) };
}

function saveManifest(root, data) {
  write(root, '.waffo/integration-manifest.json', JSON.stringify(data, null, 2));
}

function transcriptFor(data, root) {
  const text = data.decisions.map((decision) => decision.evidence.quote).join('\n');
  const transcript = path.join(root, 'claude-transcript.jsonl');
  fs.writeFileSync(transcript, JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n');
  return transcript;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('valid Node report manifest passes', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({ paymentRequestId: crypto.randomUUID().replace(/-/g, "") });\nwaffo.webhook().onPayment(() => {});\n');
  saveManifest(root, manifest(['order']));
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('empty incomplete manifest is blocked', () => {
  const root = fixture();
  saveManifest(root, { features: [], decisions: [], phases: {}, outcome: 'INCOMPLETE' });
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /non-empty array|Formal reports require outcome/);
});

test('non-terminal phase is blocked', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  data.phases.A = { status: 'RUNNING' };
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Phase "A" has non-terminal/);
});

test('stale evidence cannot support a current report', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  data.evidence[0].runId = 'older-run';
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /stale evidence/);
});

test('every active pay method requires a coverage row', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  data.payMethodCoverage = [];
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Active pay method "CARD" is missing/);
});

test('MUST_FIX findings block a formal report', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  data.qualityFindings[0].riskLevel = 'MUST_FIX';
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /is MUST_FIX/);
});

test('handler names in comments and strings do not count as registration', () => {
  const root = fixture();
  write(root, 'src/integration.js', [
    'waffo.subscription().create({});',
    '// .onPayment(() => {}).onSubscriptionStatus(() => {}).onSubscriptionPeriodChanged(() => {})',
    'const fake = ".onPayment(.onSubscriptionStatus(.onSubscriptionPeriodChanged(";',
  ].join('\n'));
  saveManifest(root, advisoryManifest(['subscription']));
  const result = runVerify(root);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /onSubscriptionPeriodChanged/);
});

test('valid Go registrations are accepted', () => {
  const root = fixture();
  write(root, 'waffo.go', [
    'package demo',
    'func integrate() {',
    '  client.Subscription().Create(nil)',
    '  client.Webhook().OnPayment(func() {}).OnSubscriptionStatus(func() {}).OnSubscriptionPeriodChanged(func() {})',
    '}',
  ].join('\n'));
  saveManifest(root, advisoryManifest(['subscription']));
  const result = runVerify(root);
  assert.strictEqual(result.status, 0, result.stdout);
});

test('empty decision register cannot bypass required questions', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = advisoryManifest(['order']);
  data.decisions = [];
  saveManifest(root, data);
  const result = runVerify(root);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /Required human decision/);
});

test('raw randomUUID request id is rejected', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({ paymentRequestId: crypto.randomUUID() });\nwaffo.webhook().onPayment(() => {});\n');
  saveManifest(root, advisoryManifest(['order']));
  const result = runVerify(root);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /raw dashed UUID/);
});

test('raw Java UUID builder value is rejected', () => {
  const root = fixture();
  write(root, 'src/Integration.java', 'waffo.order().create(Order.builder().paymentRequestId(UUID.randomUUID().toString()).build());\nwaffo.webhook().onPayment(notification -> {});\n');
  saveManifest(root, advisoryManifest(['order']));
  const result = runVerify(root);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /raw dashed UUID/);
});

test('dash-stripped Go UUID is accepted', () => {
  const root = fixture();
  write(root, 'integration.go', 'package demo\nfunc integrate() { client.Order().Create(Order{PaymentRequestID: strings.ReplaceAll(uuid.New().String(), "-", "")}); client.Webhook().OnPayment(func() {}) }\n');
  saveManifest(root, advisoryManifest(['order']));
  const result = runVerify(root);
  assert.strictEqual(result.status, 0, result.stdout);
});

test('Claude hook reads stdin and blocks an invalid report write', () => {
  const root = fixture();
  saveManifest(root, { features: [], decisions: [], phases: {}, outcome: 'INCOMPLETE' });
  const input = { tool_name: 'Write', cwd: root, transcript_path: path.join(root, 'missing.jsonl'), tool_input: { file_path: path.join(root, 'integration-report-20260803.md') } };
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /BLOCKED report write/);
});

test('Claude hook authenticates decision quotes from user messages', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  saveManifest(root, data);
  const input = { tool_name: 'Edit', cwd: root, transcript_path: transcriptFor(data, root), tool_input: { file_path: path.join(root, 'integration-report-20260803.md') } };
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
});

test('Claude hook fails closed when transcript_path is absent', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  saveManifest(root, data);
  const input = { tool_name: 'Write', cwd: root, tool_input: { file_path: path.join(root, 'integration-report-20260803.md') } };
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /did not provide transcript_path/);
});

test('Claude hook rejects fabricated human quotes', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  saveManifest(root, data);
  const transcript = path.join(root, 'claude-transcript.jsonl');
  fs.writeFileSync(transcript, JSON.stringify({ type: 'user', message: { role: 'user', content: 'Please integrate Waffo.' } }) + '\n');
  const input = { tool_name: 'Write', cwd: root, transcript_path: transcript, tool_input: { file_path: path.join(root, 'integration-report-20260803.md') } };
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /quote was not found/);
});

let failures = 0;
for (const item of tests) {
  try {
    item.fn();
    process.stdout.write(`✓ ${item.name}\n`);
  } catch (err) {
    failures++;
    process.stderr.write(`✗ ${item.name}\n${err.stack}\n`);
  }
}
for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
if (failures) process.exit(1);
process.stdout.write(`\n${tests.length} validator tests passed.\n`);
