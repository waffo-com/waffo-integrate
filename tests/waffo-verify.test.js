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
const IDENTIFIER_VALUES = {
  paymentRequestId: 'payreq-20260803-0001',
  acquiringOrderId: 'acq-20260803-0001',
  refundRequestId: 'refund-20260803-0001',
  originSubscriptionRequest: 'subreq-20260803-origin',
  subscriptionRequest: 'subreq-20260803-new',
  subscriptionId: 'sub-20260803-0001',
};

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

function identifiers(fields) {
  return Object.fromEntries(fields.map((field) => [field, IDENTIFIER_VALUES[field]]));
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
    tests: requiredTests.map((id) => ({
      id,
      status: 'PASS',
      identifiers: identifiers(contract.TEST_IDENTIFIER_REQUIREMENTS[id] || []),
      evidenceIds: [evidenceId],
    })),
    payMethodInquiry: { status: 'PASS', evidenceIds: [evidenceId], activeMethods: [{ id: 'CARD' }] },
    payMethodCoverage: [{
      methodId: 'CARD',
      status: 'PASS',
      identifiers: identifiers(contract.PAY_METHOD_REQUIRED_IDENTIFIERS),
      evidenceIds: [evidenceId],
    }],
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

test('valid full-feature report with business identifiers passes', () => {
  const root = fixture();
  write(root, 'src/integration.js', [
    'waffo.order().create({});',
    'waffo.order().refund({});',
    'waffo.refund().inquiry({});',
    'waffo.subscription().create({});',
    'waffo.subscription().change({});',
    'waffo.webhook()',
    '  .onPayment(() => {})',
    '  .onRefund(() => {})',
    '  .onSubscriptionStatus(() => {})',
    '  .onSubscriptionPeriodChanged(() => {})',
    '  .onSubscriptionChange(() => {});',
  ].join('\n'));
  saveManifest(root, manifest(['order', 'refund', 'subscription', 'subscriptionChange']));
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

test('valid PHP arrow registrations are accepted', () => {
  const root = fixture();
  write(root, 'src/Webhook/WaffoWebhook.php', [
    '<?php',
    '$waffo->subscription()->create([]);',
    '$waffo->webhook()',
    '    ->onPayment(static function (array $event): void {})',
    '    ->onSubscriptionStatus(static function (array $event): void {})',
    '    ->onSubscriptionPeriodChanged(static function (array $event): void {})',
    '    ->handleWebhook($body, $signature);',
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

test('JS private-field reference does not hide a handler registration', () => {
  const root = fixture();
  write(root, 'src/webhook.js', [
    'class W {',
    '  #ready = true;',
    '  register(w) {',
    '    if (this.#ready) w.webhook().onSubscriptionPeriodChanged(() => {});',
    '    w.webhook().onPayment(() => {}).onSubscriptionStatus(() => {});',
    '    w.subscription().create({});',
    '  }',
    '}',
  ].join('\n'));
  saveManifest(root, advisoryManifest(['subscription']));
  const result = runVerify(root);
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

test('Python handlers are detected and # comment fakes are rejected', () => {
  const ok = fixture();
  write(ok, 'app.py', [
    'client.subscription().create({})',
    'client.webhook().on_payment(lambda n: None)',
    'client.webhook().on_subscription_status(lambda n: None)',
    'client.webhook().on_subscription_period_changed(lambda n: None)',
  ].join('\n'));
  saveManifest(ok, advisoryManifest(['subscription']));
  assert.strictEqual(runVerify(ok).status, 0, 'real python handlers should pass');

  const bad = fixture();
  write(bad, 'app.py', [
    'client.subscription().create({})',
    'client.webhook().on_payment(lambda n: None).on_subscription_status(lambda n: None)',
    '# client.webhook().on_subscription_period_changed(lambda n: None)',
  ].join('\n'));
  saveManifest(bad, advisoryManifest(['subscription']));
  const badResult = runVerify(bad);
  assert.strictEqual(badResult.status, 1);
  assert.match(badResult.stdout, /onSubscriptionPeriodChanged/);
});

test('Ruby and PHP backtick command strings do not count as handler registrations', () => {
  for (const extension of ['rb', 'php']) {
    const root = fixture();
    write(root, 'src/integration.js', [
      'client.subscription().create({});',
      'client.webhook().onPayment(() => {}).onSubscriptionStatus(() => {});',
    ].join('\n'));
    write(root, `script.${extension}`, 'fake = `printf .on_subscription_period_changed(`;');
    saveManifest(root, advisoryManifest(['subscription']));
    const result = runVerify(root);
    assert.strictEqual(result.status, 1, `${extension} backtick content must not pass\n${result.stdout}`);
    assert.match(result.stdout, /onSubscriptionPeriodChanged/);
  }
});

test('formal report requires concrete business identifiers for passing tests', () => {
  const missingRoot = fixture();
  write(missingRoot, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const missingData = manifest(['order']);
  delete missingData.tests.find((item) => item.id === 'order-create').identifiers;
  saveManifest(missingRoot, missingData);
  const missingResult = runVerify(missingRoot, '--gate', 'report');
  assert.strictEqual(missingResult.status, 2);
  assert.match(missingResult.stderr, /Test "order-create" must include an identifiers object/);

  const placeholderRoot = fixture();
  write(placeholderRoot, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const placeholderData = manifest(['order']);
  placeholderData.tests.find((item) => item.id === 'payment-success').identifiers.acquiringOrderId = '{acquiringOrderId}';
  saveManifest(placeholderRoot, placeholderData);
  const placeholderResult = runVerify(placeholderRoot, '--gate', 'report');
  assert.strictEqual(placeholderResult.status, 2);
  assert.match(placeholderResult.stderr, /identifiers\.acquiringOrderId must be a concrete string/);
});

test('subscription period-change evidence requires subscriptionRequest and subscriptionId', () => {
  const root = fixture();
  write(root, 'src/integration.js', [
    'waffo.subscription().create({});',
    'waffo.webhook().onPayment(() => {}).onSubscriptionStatus(() => {}).onSubscriptionPeriodChanged(() => {});',
  ].join('\n'));
  const data = manifest(['subscription']);
  const periodChanged = data.tests.find((item) => item.id === 'subscription-event-period-changed');
  delete periodChanged.identifiers.subscriptionId;
  periodChanged.identifiers.acquiringOrderId = IDENTIFIER_VALUES.acquiringOrderId;
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Test "subscription-event-period-changed" identifiers\.subscriptionId/);
});

test('passing pay-method coverage requires paymentRequestId and acquiringOrderId', () => {
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({});\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  delete data.payMethodCoverage[0].identifiers.acquiringOrderId;
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Pay method "CARD" identifiers\.acquiringOrderId/);
});

test('required test ids match acceptance-criteria vocabulary', () => {
  const orderIds = contract.deriveRequiredTestIds(['order']);
  assert.ok(orderIds.includes('order-create'), 'order should require order-create');
  assert.ok(orderIds.includes('order-create-error'), 'order should require order-create-error');
  assert.ok(!orderIds.includes('payment-create'), 'must not require the old payment-create id');
  assert.ok(!orderIds.includes('payment-webhook'), 'must not require the old payment-webhook id');
  assert.ok(contract.deriveRequiredTestIds(['subscription']).includes('subscription-renewal'), 'subscription should require subscription-renewal');
  const everyTestId = contract.deriveRequiredTestIds(['order', 'refund', 'subscription', 'subscriptionChange']);
  for (const id of everyTestId) {
    assert.ok(contract.TEST_IDENTIFIER_REQUIREMENTS[id]?.length, `${id} must declare required business identifiers`);
  }
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
