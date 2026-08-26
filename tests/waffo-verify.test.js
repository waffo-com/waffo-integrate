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
// 严格比对生效后，fixture 必须携带「本次实际执行的 skill 版本」；写死版本号会在每次发版后失效。
const SKILL_VERSION = contract.readSkillVersion();
assert.ok(SKILL_VERSION, 'readSkillVersion() must resolve the running skill version from package.json');
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
    skillVersion: SKILL_VERSION,
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
  return { schemaVersion: 1, skillVersion: SKILL_VERSION, features, decisions: decisions(features) };
}

// schemaVersion 2 fixture。键名刻意写死、不从 waffo-verify 导入——这样重命名或新增必填
// 字段会让测试当场失败，而不是跟着实现一起改口径。
function reportBlock() {
  const q = (status, detail) => ({ status, detail });
  return {
    project: 'demo-shop',
    date: '2026-08-24',
    sdkVersion: '@waffo/waffo-node 2.0.0',
    environment: 'Sandbox',
    mid: '1300000481',
    coverageBasis: 'minimum test set',
    features: 'Order Payment, Webhook',
    integrationConfiguration: {
      userTerminal: 'WEB',
      checkoutSelection: 'Waffo hosted checkout',
      currencyMode: 'single-currency: USD',
      subscriptionMode: 'N/A',
      subscriptionRetryPolicy: 'N/A',
      subscriptionEvents: 'N/A',
    },
    projectSurface: {
      orderEndpoints: 'POST /api/orders',
      refundEndpoints: 'N/A',
      subscriptionEndpoints: 'N/A',
      configEndpoints: 'GET /api/config/pay-methods',
      webhookEndpoint: 'POST /api/webhooks/waffo (raw body, SDK signature verification)',
      webhookBusinessLogic: 'fulfil once per paymentRequestId',
      persistence: 'orders.payment_request_id / orders.acquiring_order_id',
      credentials: 'env vars, sanitized',
      appTerminal: 'N/A',
    },
    webhookDelivery: [
      { status: 'PROJECT_SIDE_VERIFIED', detail: 'replayed the same notification twice, business ran once', nextStep: '-' },
    ],
    apisExercised: [
      { capability: 'Payment create', operation: '`order().create()`', evidence: 'payreq-20260803-0001' },
      { capability: 'Config', operation: '`payMethodConfig().inquiry()`', evidence: 'MID 1300000481, 1 active method' },
    ],
    parameterCheck: {
      orderDescription: 'Demo Credit Pack',
      goodsName: 'from products.name',
      goodsUrlOrAppName: 'goodsUrl provided',
      noAppCase: 'goodsUrl provided, appName not invented',
      goodsUrl: 'product detail page, not an image URL',
      appName: 'N/A - not an App merchant',
      userEmail: 'valid format, no test literal',
      userTerminal: 'WEB, matches actual terminal',
      timeFields: 'ISO 8601 UTC+0',
      nonCardFields: 'N/A - card only in this run',
    },
    dataIntegrity: {
      idempotencyKeyPersisted: 'order row written before the Waffo call',
      acquiringOrderIdStored: 'orders.acquiring_order_id',
      refundRequestIdPersisted: 'N/A - refund not integrated',
      subscriptionIdsStored: 'N/A - subscription not integrated',
      redirectUrls: 'success / failed / cancel all configured',
    },
    appTerminalAssessment: {
      hasApp: 'No',
      checkoutLoadingMode: 'N/A',
      userTerminalApp: 'N/A',
      deviceWalletMethods: 'N/A',
    },
    goLive: {
      q1: q('OK', 'connect/read 10s'),
      q2: q('OK', 'JVM default 30s'),
      q3: q('OK', 'deployed in SGP'),
      q4: q('N/A', 'WeChat Pay not contracted'),
      q5: q('OK', 'no iframe, full-page redirect'),
    },
    notes: 'Outbound calls ran through the local project instance; webhooks landed on the deployed staging service.',
    fixes: [{ testId: 'order-create-error', rootCause: 'local order stuck in CREATED', fixSummary: 'mark FAILED on terminal channel failure' }],
    remediation: ['Deploy the build containing the order-create-error fix before go-live.'],
  };
}

function manifestV2(features) {
  const base = manifest(features);
  base.schemaVersion = 2;
  base.report = reportBlock();
  base.tests = base.tests.map((t) => ({ ...t, details: `verified ${t.id} end to end` }));
  base.payMethodCoverage = base.payMethodCoverage.map((r) => ({ ...r, country: 'USA', type: 'CREDITCARD' }));
  base.qualityFindings = base.qualityFindings.map((q) => ({
    ...q,
    reviewAnchor: 'src/integration.js',
    finding: 'signature verified before business logic',
    recommendation: 'keep as is',
    evidence: 'src/integration.js:1',
  }));
  return base;
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

test('manifest skillVersion that does not match the running skill blocks the report', () => {
  // 集成方自报的版本号是不可信的。报告里的 Skill Version 决定了「这份报告是按哪套规则跑出来的」，
  // 声明值与实际执行的 skill 不一致时必须拦下，否则验收结论无法归因到具体版本。
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({ paymentRequestId: crypto.randomUUID().replace(/-/g, "") });\nwaffo.webhook().onPayment(() => {});\n');
  const data = manifest(['order']);
  data.skillVersion = '0.0.1-not-the-running-version';
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2, result.stdout);
  assert.match(result.stderr, /does not match the running skill version/);
  assert.ok(result.stderr.includes(SKILL_VERSION), 'the blocker must name the actual running version so it can be corrected');
});

test('validator output names the running skill version', () => {
  // 拦下不匹配之后还得让集成方知道「该填什么」，否则只能靠猜。
  const root = fixture();
  write(root, 'src/integration.js', 'waffo.order().create({ paymentRequestId: crypto.randomUUID().replace(/-/g, "") });\nwaffo.webhook().onPayment(() => {});\n');
  saveManifest(root, manifest(['order']));
  const gate = runVerify(root, '--gate', 'report');
  assert.strictEqual(gate.status, 0, gate.stderr);
  assert.ok(gate.stdout.includes(SKILL_VERSION), `gate pass message must state the running version, got: ${gate.stdout}`);
  const plain = runVerify(root);
  assert.ok(plain.stdout.includes(SKILL_VERSION), `scan header must state the running version, got: ${plain.stdout}`);
});

const ORDER_SOURCE = 'waffo.order().create({ paymentRequestId: crypto.randomUUID().replace(/-/g, "") });\nwaffo.webhook().onPayment(() => {});\n';

test('schemaVersion 1 manifests keep passing the gate unchanged', () => {
  // 双版共存的前提：存量商户不能因为我们加了 v2 就出不了报告。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifest(['order']);
  assert.strictEqual(data.schemaVersion, 1, 'baseline fixture must still be v1');
  saveManifest(root, data);
  assert.strictEqual(runVerify(root, '--gate', 'report').status, 0);
});

test('a complete schemaVersion 2 manifest passes the gate', () => {
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  saveManifest(root, manifestV2(['order']));
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 0, result.stderr);
});

test('unsupported schemaVersion is rejected', () => {
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifestV2(['order']);
  data.schemaVersion = 3;
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /schemaVersion must be one of 1, 2/);
});

test('schemaVersion 2 without the report block is blocked', () => {
  // v2 的全部意义就是携带渲染所需数据；缺了就不该放行。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifestV2(['order']);
  delete data.report;
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /report block is required/);
});

test('schemaVersion 2 requires per-test details and pay-method country/type', () => {
  // 这三个字段是渲染 Active Test Results 与 Pay Method Coverage 的唯一来源，
  // 缺一个就会渲染出空单元格——必须在闸门拦下，而不是让空格进报告。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifestV2(['order']);
  delete data.tests[0].details;
  delete data.payMethodCoverage[0].country;
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /must include details for report rendering/);
  assert.match(result.stderr, /must include country for report rendering/);
});

test('schemaVersion 2 rejects an invented webhook delivery status', () => {
  // 报告漂移里最典型的一类就是自创状态词（真实案例：PASS*）。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifestV2(['order']);
  data.report.webhookDelivery[0].status = 'MOSTLY_VERIFIED*';
  saveManifest(root, data);
  const result = runVerify(root, '--gate', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /webhookDelivery status must be one of/);
});

test('rendering is byte-deterministic for the same manifest', () => {
  // 字节比对闸门的前提：同一份 manifest 必须永远渲染出同样的字节，否则闸门会误杀。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  saveManifest(root, manifestV2(['order']));
  const first = runVerify(root, '--emit', 'report');
  const second = runVerify(root, '--emit', 'report');
  assert.strictEqual(first.status, 0, first.stderr);
  assert.strictEqual(first.stdout, second.stdout, 'two renders of one manifest must be byte-identical');
  assert.ok(first.stdout.startsWith('# Integration Acceptance Report / 集成验收报告'), 'must render the canonical title');
});

test('every contracted method is rendered as its own row', () => {
  // 真实漂移案例：50 个签约方式被并成 39 行，ATONE_PAY_LATER_NEXT_MONTH 的名字整个消失。
  // 覆盖表由 inquiry 结果推导而非手抄，这类合并在结构上不可能再发生。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifestV2(['order']);
  const ids = ['CARD', 'ATONE_PAY_LATER', 'ATONE_PAY_LATER_NEXT_MONTH'];
  data.payMethodInquiry.activeMethods = ids.map((id) => ({ id }));
  data.payMethodCoverage = [
    data.payMethodCoverage[0],
    { methodId: 'ATONE_PAY_LATER', country: 'JPN', type: 'BNPL', status: 'SKIP_WITH_REASON', reason: 'redundant - BNPL already covered by PAIDY', nextStep: 'none', evidenceIds: ['evidence-current-run'] },
    { methodId: 'ATONE_PAY_LATER_NEXT_MONTH', country: 'JPN', type: 'BNPL', status: 'SKIP_WITH_REASON', reason: 'redundant - BNPL already covered by PAIDY', nextStep: 'none', evidenceIds: ['evidence-current-run'] },
  ];
  // SKIP_WITH_REASON 属于 conditional 项，与 outcome FULL 互斥（闸门既有规则）
  data.outcome = 'CONDITIONAL';
  saveManifest(root, data);
  const result = runVerify(root, '--emit', 'report');
  assert.strictEqual(result.status, 0, result.stderr);
  const coverage = result.stdout.split('## Pay Method Coverage')[1].split('## APP Terminal')[0];
  for (const id of ids) {
    assert.ok(coverage.includes('| ' + id + ' |'), id + ' must have its own coverage row');
  }
  assert.ok(result.stdout.includes('3: ' + ids.join(', ')), 'Overview must list every contracted method');
});

test('subscription features render the event coverage section', () => {
  const root = fixture();
  write(root, 'src/integration.js', [
    'waffo.order().create({});',
    'waffo.subscription().create({});',
    'waffo.webhook()',
    '  .onPayment(() => {})',
    '  .onSubscriptionStatus(() => {})',
    '  .onSubscriptionPeriodChanged(() => {});',
  ].join('\n'));
  saveManifest(root, manifestV2(['order', 'subscription']));
  const result = runVerify(root, '--emit', 'report');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('## Subscription Event Coverage'));
  for (const event of ['SUBSCRIPTION_STATUS_NOTIFICATION', 'SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION', 'PAYMENT_NOTIFICATION']) {
    assert.ok(result.stdout.includes(event), event + ' must appear as its own event row');
  }
  // 事件行归入独立段落，不应在 Active Test Results 里重复出现
  const active = result.stdout.split('## Active Test Results')[1].split('## Subscription Event Coverage')[0];
  assert.ok(!active.includes('subscription-event-status'), 'event rows belong to the event section only');
});

test('schemaVersion 1 cannot render a report', () => {
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  saveManifest(root, manifest(['order']));
  const result = runVerify(root, '--emit', 'report');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /cannot render a report; upgrade the manifest to schemaVersion 2/);
});

test('a blocked gate refuses to render, not just to save', () => {
  // 渲染出来的文本会被复制粘贴。闸门不通过时连 stdout 都不能产出。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifestV2(['order']);
  data.outcome = 'INCOMPLETE';
  saveManifest(root, data);
  const result = runVerify(root, '--emit', 'report');
  assert.strictEqual(result.status, 2);
  assert.strictEqual(result.stdout, '', 'nothing may be rendered when the gate blocks');
  assert.match(result.stderr, /cannot render report/);
});

function runHook(input) {
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
}

function v2ReportProject() {
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifestV2(['order']);
  saveManifest(root, data);
  return { root, data, reportPath: path.join(root, 'integration-report-20260824.md') };
}

test('hook accepts a report written exactly as rendered', () => {
  const { root, data, reportPath } = v2ReportProject();
  const rendered = runVerify(root, '--emit', 'report').stdout;
  const result = runHook({ tool_name: 'Write', cwd: root, transcript_path: transcriptFor(data, root), tool_input: { file_path: reportPath, content: rendered } });
  assert.strictEqual(result.status, 0, result.stderr);
});

test('hook blocks a report whose bytes drift from the rendered output', () => {
  // 本次审计发现的真实漂移：状态被改成 PASS*、溯源列被删。字节比对让这两类都写不进去。
  const { root, data, reportPath } = v2ReportProject();
  const tampered = runVerify(root, '--emit', 'report').stdout.replace('| order-create | PASS |', '| order-create | PASS* |');
  const result = runHook({ tool_name: 'Write', cwd: root, transcript_path: transcriptFor(data, root), tool_input: { file_path: reportPath, content: tampered } });
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /differs from "waffo-verify \. --emit report"/);
  assert.match(result.stderr, /change the manifest, not the Markdown/);
});

test('hook refuses hand edits of a rendered report', () => {
  const { root, data, reportPath } = v2ReportProject();
  const result = runHook({ tool_name: 'Edit', cwd: root, transcript_path: transcriptFor(data, root), tool_input: { file_path: reportPath, old_string: 'PASS', new_string: 'PASS*' } });
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /rendered from \.waffo\/integration-manifest\.json/);
});

test('hook rejects a file name whose date contradicts the manifest', () => {
  const { root, data } = v2ReportProject();
  const rendered = runVerify(root, '--emit', 'report').stdout;
  const wrongName = path.join(root, 'integration-report-20250101.md');
  const result = runHook({ tool_name: 'Write', cwd: root, transcript_path: transcriptFor(data, root), tool_input: { file_path: wrongName, content: rendered } });
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /does not match report\.date/);
});

test('hook leaves schemaVersion 1 projects on gate-only behaviour', () => {
  // 双版共存的兑现点：未迁移的商户不能因为渲染器上线而突然写不了报告。
  const root = fixture();
  write(root, 'src/integration.js', ORDER_SOURCE);
  const data = manifest(['order']);
  saveManifest(root, data);
  const result = runHook({
    tool_name: 'Write', cwd: root, transcript_path: transcriptFor(data, root),
    tool_input: { file_path: path.join(root, 'integration-report-20260803.md'), content: '# hand written report\n' },
  });
  assert.strictEqual(result.status, 0, result.stderr);
});

module.exports = { manifest, manifestV2, reportBlock, decisions, identifiers, saveManifest, write, fixture, roots };

if (require.main !== module) return;

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
