#!/usr/bin/env node

/**
 * waffo-verify — executable enforcement for waffo-integrate.
 *
 * Runs against a merchant project and reconciles executable source with
 * .waffo/integration-manifest.json. Zero runtime dependencies; Node >= 16.
 *
 * Exit codes: 0 clean, 1 advisory violations, 2 blocked report write.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FEATURE_REQUIRED_HANDLERS = {
  order: ['onPayment'],
  refund: ['onRefund'],
  subscription: ['onSubscriptionStatus', 'onSubscriptionPeriodChanged', 'onPayment'],
  subscriptionChange: ['onSubscriptionChange'],
};

// Member access spans languages: `.` (JS/TS/Go/Java/Python), `->` (PHP), `::` (static
// calls). Keeping the operator generic means a new SDK language whose handler names follow
// one of the three spellings below needs no validator change — see docs/adding-a-language.md.
const MEMBER_ACCESS = '(?:\\.|->|::)';

// A handler may be spelled camelCase (JS/TS/Java/PHP), snake_case (Python/Ruby), or
// PascalCase (Go exported methods). Derive all three from the canonical camelCase name so
// the spellings can never drift out of sync across handlers.
function registrationPatterns(camelName) {
  const snake = camelName.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  const pascal = camelName[0].toUpperCase() + camelName.slice(1);
  return [...new Set([camelName, snake, pascal])].map(
    (spelling) => new RegExp(MEMBER_ACCESS + '\\s*' + spelling + '\\s*\\('),
  );
}

const HANDLER_REGISTRATION_PATTERNS = {
  onPayment: registrationPatterns('onPayment'),
  onRefund: registrationPatterns('onRefund'),
  onSubscriptionStatus: registrationPatterns('onSubscriptionStatus'),
  onSubscriptionPeriodChanged: registrationPatterns('onSubscriptionPeriodChanged'),
  onSubscriptionChange: registrationPatterns('onSubscriptionChange'),
};

const FEATURE_CODE_SIGNATURES = {
  order: [/\.\s*(?:order|Order)\s*\(\s*\)\s*\.\s*(?:create|Create)\s*\(/],
  refund: [
    /\.\s*(?:order|Order)\s*\(\s*\)\s*\.\s*(?:refund|Refund)\s*\(/,
    /\.\s*(?:refund|Refund)\s*\(\s*\)\s*\.\s*(?:inquiry|Inquiry)\s*\(/,
  ],
  subscription: [/\.\s*(?:subscription|Subscription)\s*\(\s*\)\s*\.\s*(?:create|Create)\s*\(/],
  subscriptionChange: [
    /\.\s*(?:subscription|Subscription)\s*\(\s*\)\s*\.\s*(?:change|Change)\s*\(/,
    /\.\s*(?:subscription|Subscription)\s*\(\s*\)\s*\.\s*(?:changeInquiry|change_inquiry|ChangeInquiry)\s*\(/,
  ],
};

const BASE_REQUIRED_DECISIONS = [
  'paymentSourceOfTruth',
  'unknownStatusHandling',
  'userTerminal',
  'checkoutOwnership',
  'currencyMode',
  'iframeDeviceWalletHandling',
  'redirectBehavior',
  'goLiveQ1',
  'goLiveQ2',
  'goLiveQ3',
  'goLiveQ4',
  'goLiveQ5',
  'goLiveQ6',
  'goLiveQ7',
  'goLiveQ8',
  'complianceExemption',
];

const FEATURE_REQUIRED_DECISIONS = {
  order: ['onPaymentBusinessLogic'],
  refund: ['refundBenefitHandling', 'onRefundBusinessLogic'],
  subscription: [
    'subscriptionMode',
    'cancelBenefitTiming',
    'subscriptionRetryConfig',
    'onPaymentBusinessLogic',
    'onSubscriptionStatusBusinessLogic',
    'onSubscriptionPeriodChangedBusinessLogic',
  ],
  subscriptionChange: ['upgradeDowngradeProration', 'onSubscriptionChangeBusinessLogic'],
};

const REQUIRED_PHASES = ['A', 'B1', 'B2', 'C1', 'C2', 'D'];
// Test IDs match references/acceptance-criteria.md §3 (the vocabulary the rest of the skill
// uses). Pay-method coverage is enforced separately via payMethodInquiry/payMethodCoverage,
// so it is not double-booked here.
const FEATURE_REQUIRED_TESTS = {
  order: ['order-create', 'order-create-error', 'payment-success', 'payment-failure', 'webhook-idempotency'],
  refund: ['refund-success', 'refund-inquiry', 'refund-webhook'],
  subscription: [
    'subscription-create',
    'subscription-inquiry',
    'subscription-renewal',
    'subscription-cancel',
    'subscription-event-status',
    'subscription-event-period-changed',
    'subscription-event-payment',
  ],
  subscriptionChange: ['subscription-change', 'subscription-change-inquiry', 'subscription-event-change'],
};

// A PASS/USED test is only traceable when it names the Waffo objects exercised by that
// scenario. Field names follow references/api-contract.md; optional IDs are documented in
// docs/enforcement.md but are not required when Waffo does not return them for that event.
const TEST_IDENTIFIER_REQUIREMENTS = {
  'order-create': ['paymentRequestId', 'acquiringOrderId'],
  'order-create-error': ['paymentRequestId'],
  'payment-success': ['paymentRequestId', 'acquiringOrderId'],
  'payment-failure': ['paymentRequestId', 'acquiringOrderId'],
  'webhook-idempotency': ['paymentRequestId', 'acquiringOrderId'],
  'refund-success': ['paymentRequestId', 'acquiringOrderId', 'refundRequestId'],
  'refund-inquiry': ['acquiringOrderId', 'refundRequestId'],
  'refund-webhook': ['acquiringOrderId', 'refundRequestId'],
  'subscription-create': ['subscriptionRequest', 'subscriptionId'],
  'subscription-inquiry': ['subscriptionRequest', 'subscriptionId'],
  'subscription-renewal': ['subscriptionRequest', 'subscriptionId'],
  'subscription-cancel': ['subscriptionRequest', 'subscriptionId'],
  'subscription-event-status': ['subscriptionRequest', 'subscriptionId'],
  'subscription-event-period-changed': ['subscriptionRequest', 'subscriptionId'],
  'subscription-event-payment': ['subscriptionRequest', 'subscriptionId'],
  'subscription-change': ['originSubscriptionRequest', 'subscriptionRequest', 'subscriptionId'],
  'subscription-change-inquiry': ['originSubscriptionRequest', 'subscriptionRequest', 'subscriptionId'],
  'subscription-event-change': ['originSubscriptionRequest', 'subscriptionRequest', 'subscriptionId'],
};
const PAY_METHOD_REQUIRED_IDENTIFIERS = ['paymentRequestId', 'acquiringOrderId'];

const REQUIRED_QUALITY_CHECKS = [
  'webhookSignatureVerification',
  'idempotencyAndLocking',
  'unknownStatusRecovery',
  'requestIdPersistence',
  'refundEntitlementRollback',
  'subscriptionEventRouting',
  'appIframeCheckoutRisk',
];

// ---- Report rendering contract (schemaVersion 2) ----
// Every fixed label lives here, never in the manifest: the integrator supplies evidence
// text, never the table shape. That split is what makes a rendered report drift-proof.
const SUPPORTED_SCHEMA_VERSIONS = [1, 2];
const RENDERABLE_SCHEMA_VERSION = 2;
const REPORT_META_FIELDS = ['project', 'date', 'sdkVersion', 'environment', 'mid', 'coverageBasis', 'features'];
const REPORT_CONFIG_ROWS = [
  ['userTerminal', 'userTerminal'],
  ['checkoutSelection', 'Checkout selection'],
  ['currencyMode', 'Currency mode'],
  ['subscriptionMode', 'Subscription mode'],
  ['subscriptionRetryPolicy', 'Subscription retry policy'],
  ['subscriptionEvents', 'Subscription events'],
];
const REPORT_SURFACE_ROWS = [
  ['orderEndpoints', 'Order endpoints'],
  ['refundEndpoints', 'Refund endpoints'],
  ['subscriptionEndpoints', 'Subscription endpoints'],
  ['configEndpoints', 'Config endpoints'],
  ['webhookEndpoint', 'Webhook endpoint'],
  ['webhookBusinessLogic', 'Webhook business logic'],
  ['persistence', '持久化'],
  ['credentials', 'Credentials'],
  ['appTerminal', 'APP terminal'],
];
const PARAMETER_CHECK_ITEMS = [
  ['orderDescription', '`orderDescription`: specific description'],
  ['goodsName', '`goodsName`: provided (required)'],
  ['goodsUrlOrAppName', '`goodsUrl` or `appName`: provided for compliance/risk-control review; default merchant classification is non-premium, so no exemption unless explicitly confirmed by user or Waffo'],
  ['noAppCase', 'No App case: `goodsUrl` is provided; `appName` is not invented'],
  ['goodsUrl', '`goodsUrl`: product detail page or official website URL, not an image URL (if provided)'],
  ['appName', '`appName`: only for App merchants; App Store / Google Play listed app name, not package ID or placeholder (if provided)'],
  ['userEmail', '`userEmail`: valid format, no `test`'],
  ['userTerminal', '`userTerminal`: matches actual terminal'],
  ['timeFields', 'Time fields: ISO 8601 UTC+0'],
  ['nonCardFields', 'Non-card required fields / `payMethodProperties`: verified where applicable'],
];
const DATA_INTEGRITY_ITEMS = [
  ['idempotencyKeyPersisted', 'Idempotency key persisted before API call'],
  ['acquiringOrderIdStored', '已存储 `acquiringOrderId`'],
  ['refundRequestIdPersisted', '`refundRequestId` returned and persisted'],
  ['subscriptionIdsStored', '`subscriptionRequest` / `subscriptionId` stored when applicable'],
  ['redirectUrls', 'Redirect URLs: success, failed, cancel'],
];
const QUALITY_CHECK_LABELS = {
  webhookSignatureVerification: 'Webhook signature verification',
  idempotencyAndLocking: 'Idempotency and locking',
  unknownStatusRecovery: 'Unknown status recovery',
  requestIdPersistence: 'Request ID persistence',
  refundEntitlementRollback: 'Refund entitlement rollback',
  subscriptionEventRouting: 'Subscription event routing',
  appIframeCheckoutRisk: 'APP / iframe checkout risk',
};
const APP_TERMINAL_ROWS = [
  ['hasApp', 'Has mobile APP? (Q6)'],
  ['checkoutLoadingMode', 'Checkout loading mode (Q7)'],
  ['userTerminalApp', '`userTerminal=APP` passed? (Q8)'],
  ['deviceWalletMethods', 'Device-wallet/APP methods'],
];
const GO_LIVE_ROWS = [
  ['q1', 'HTTP timeout (Q1)'],
  ['q2', 'DNS cache TTL (Q2)'],
  ['q3', 'Server region (Q3)'],
  ['q4', 'WeChat Pay domain (Q4)'],
  ['q5', 'Apple Pay + iframe (Q5)'],
];
const WEBHOOK_DELIVERY_STATUSES = new Set(['PROJECT_SIDE_VERIFIED', 'WAFFO_SIDE_VERIFIED', 'WAFFO_SIDE_UNVERIFIED']);

const DECISION_STUB_MARKER = 'WAFFO_DECISION_REQUIRED';
const MANIFEST_REL = path.join('.waffo', 'integration-manifest.json');
const SKILL_PACKAGE_PATH = path.join(__dirname, '..', 'package.json');
const SOURCE_EXT = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.java', '.go', '.py', '.kt', '.rb', '.php', '.cs']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor', 'target', '__pycache__',
  '.venv', 'venv', '.next', 'coverage', '.waffo', 'test', 'tests', '__tests__', 'fixtures',
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function isTestFile(name) {
  return /(?:\.(?:test|spec)\.[^.]+|_test\.go|^test_.*\.py|_test\.py)$/i.test(name);
}

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
      } else if (SOURCE_EXT.has(path.extname(entry.name)) && !isTestFile(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

// Comment/string syntax is language-specific. Getting this wrong produces false
// positives: e.g. treating `#` as a comment in JS/TS blanks the rest of a line that
// uses a private field (`this.#ready`), which would hide a real handler registration.
function commentSyntax(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.py') return { slash: false, block: false, hash: true, backtick: false, triple: true };
  if (ext === '.rb') return { slash: false, block: false, hash: true, backtick: true, triple: false };
  if (ext === '.php') return { slash: true, block: true, hash: true, backtick: true, triple: false };
  // C-like family: JS/TS/JSX/TSX/MJS/CJS/Java/Go/Kotlin/C#. `#` is NOT a comment here
  // (JS private fields, C# preprocessor), and backtick is a string (Go raw strings).
  return { slash: true, block: true, hash: false, backtick: true, triple: false };
}

// Produce one view without comments and another without comments or strings.
// Structural checks use the latter so comments/string constants cannot fake registrations.
function sanitizeSource(source, syntax) {
  const { slash = true, block = true, hash = false, backtick = true, triple = false } = syntax || {};
  let uncommented = '';
  let structural = '';
  let state = 'code';
  let quote = '';
  let inTriple = false;

  const blank = (ch) => (ch === '\n' ? '\n' : ' ');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'lineComment') {
      uncommented += blank(ch);
      structural += blank(ch);
      if (ch === '\n') state = 'code';
      continue;
    }
    if (state === 'blockComment') {
      uncommented += blank(ch);
      structural += blank(ch);
      if (ch === '*' && next === '/') {
        uncommented += ' ';
        structural += ' ';
        i++;
        state = 'code';
      }
      continue;
    }
    if (state === 'string') {
      uncommented += ch;
      structural += blank(ch);
      if (ch === '\\' && !inTriple && i + 1 < source.length) {
        uncommented += source[i + 1];
        structural += blank(source[i + 1]);
        i++;
        continue;
      }
      if (inTriple && source.startsWith(quote.repeat(3), i)) {
        for (let j = 1; j < 3; j++) {
          uncommented += quote;
          structural += ' ';
        }
        i += 2;
        state = 'code';
        inTriple = false;
      } else if (!inTriple && ch === quote) {
        state = 'code';
      }
      continue;
    }

    if (slash && ch === '/' && next === '/') {
      uncommented += '  ';
      structural += '  ';
      i++;
      state = 'lineComment';
    } else if (block && ch === '/' && next === '*') {
      uncommented += '  ';
      structural += '  ';
      i++;
      state = 'blockComment';
    } else if (hash && ch === '#') {
      uncommented += ' ';
      structural += ' ';
      state = 'lineComment';
    } else if (ch === '"' || ch === "'" || (backtick && ch === '`')) {
      quote = ch;
      inTriple = triple && ch !== '`' && source.startsWith(ch.repeat(3), i);
      const width = inTriple ? 3 : 1;
      uncommented += ch.repeat(width);
      structural += ' '.repeat(width);
      i += width - 1;
      state = 'string';
    } else {
      uncommented += ch;
      structural += ch;
    }
  }
  return { uncommented, structural };
}

function loadCorpus(files) {
  const corpus = [];
  for (const file of files) {
    try {
      if (fs.statSync(file).size > MAX_FILE_BYTES) continue;
      const text = fs.readFileSync(file, 'utf8');
      corpus.push({ file, text, ...sanitizeSource(text, commentSyntax(file)) });
    } catch {
      // An unreadable file cannot be used as positive evidence.
    }
  }
  return corpus;
}

function firstMatch(corpus, patterns, field = 'structural') {
  const candidates = Array.isArray(patterns) ? patterns : [patterns];
  for (const { file, ...views } of corpus) {
    const text = views[field] || '';
    for (const pattern of candidates) {
      if (pattern instanceof RegExp) pattern.lastIndex = 0;
      if (pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)) return file;
    }
  }
  return null;
}

function readManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!fs.existsSync(manifestPath)) return { path: manifestPath, missing: true };
  try {
    return { path: manifestPath, data: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
  } catch (err) {
    return { path: manifestPath, parseError: err.message };
  }
}

function readSkillVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(SKILL_PACKAGE_PATH, 'utf8'));
    return normalizeText(pkg.version) || null;
  } catch (err) {
    return null;
  }
}

function uniqueDerived(features, mapping) {
  const values = new Set();
  for (const feature of features) {
    for (const value of mapping[feature] || []) values.add(value);
  }
  return [...values];
}

function deriveRequiredHandlers(features) {
  return uniqueDerived(features, FEATURE_REQUIRED_HANDLERS);
}

function deriveRequiredDecisionIds(features) {
  return [...new Set([...BASE_REQUIRED_DECISIONS, ...uniqueDerived(features, FEATURE_REQUIRED_DECISIONS)])];
}

function deriveRequiredTestIds(features) {
  return uniqueDerived(features, FEATURE_REQUIRED_TESTS);
}

function inferFeaturesFromCode(corpus) {
  return Object.entries(FEATURE_CODE_SIGNATURES)
    .filter(([, patterns]) => firstMatch(corpus, patterns))
    .map(([feature]) => feature);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isConcreteIdentifier(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return !/^(?:-|n\/?a|none|null|unknown|todo|tbd|x+|\{[^}]*\}|<[^>]*>)$/i.test(normalized);
}

function transcriptUserMessages(transcriptPath) {
  const messages = [];
  const textFromContent = (content) => {
    if (typeof content === 'string') return [content];
    if (!Array.isArray(content)) return [];
    return content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text);
  };
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const role = entry && entry.message && entry.message.role;
      if (entry && (entry.type === 'user' || role === 'user')) {
        const content = entry.message ? entry.message.content : entry.content;
        messages.push(...textFromContent(content));
      }
    }
    return { messages: messages.map(normalizeText).filter(Boolean) };
  } catch (err) {
    return { error: err.message, messages: [] };
  }
}

function validateDecisionEvidence(decision, errors) {
  if (!Object.prototype.hasOwnProperty.call(decision, 'value') || normalizeText(decision.value) === '') {
    errors.push(`Decision "${decision.id}" is CONFIRMED_BY_HUMAN but has no explicit value.`);
  }
  const evidence = decision.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    errors.push(`Decision "${decision.id}" must carry evidence { source: "user_message", quote: "..." }.`);
    return;
  }
  if (evidence.source !== 'user_message') {
    errors.push(`Decision "${decision.id}" evidence.source must be "user_message", not ${JSON.stringify(evidence.source)}.`);
  }
  if (normalizeText(evidence.quote).length < 2) {
    errors.push(`Decision "${decision.id}" evidence.quote must contain the developer's exact answer.`);
  }
}

function runChecks(root, corpus, manifest, options = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];

  if (manifest.missing) {
    errors.push(`Missing integration manifest at ${MANIFEST_REL}.`);
  } else if (manifest.parseError) {
    errors.push(`Manifest at ${MANIFEST_REL} is not valid JSON: ${manifest.parseError}`);
  }

  const data = manifest && manifest.data && typeof manifest.data === 'object' ? manifest.data : {};
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(data.schemaVersion)) {
    errors.push(`Manifest schemaVersion must be one of ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}, not ${JSON.stringify(data.schemaVersion)}.`);
  }
  const declaredSkillVersion = normalizeText(data.skillVersion);
  if (!declaredSkillVersion) {
    errors.push('Manifest skillVersion is required.');
  } else {
    const runningSkillVersion = readSkillVersion();
    if (!runningSkillVersion) {
      warnings.push(`Could not read the running skill version from ${SKILL_PACKAGE_PATH}; manifest skillVersion ${JSON.stringify(declaredSkillVersion)} is self-declared and unverified.`);
    } else if (declaredSkillVersion !== runningSkillVersion) {
      errors.push(`Manifest skillVersion ${JSON.stringify(declaredSkillVersion)} does not match the running skill version ${JSON.stringify(runningSkillVersion)}. Set both the manifest and the report Skill Version row to ${runningSkillVersion}, or re-run the verification with the skill release the manifest claims.`);
    }
  }
  const allowedFeatures = new Set(Object.keys(FEATURE_REQUIRED_HANDLERS));
  const declaredFeatures = Array.isArray(data.features) ? data.features : [];
  if (!Array.isArray(data.features) || declaredFeatures.length === 0) {
    errors.push('Manifest features must be a non-empty array; an integration cannot self-declare an empty scope.');
  }
  const validFeatures = [];
  const seenFeatures = new Set();
  for (const feature of declaredFeatures) {
    if (!allowedFeatures.has(feature)) {
      errors.push(`Unknown manifest feature ${JSON.stringify(feature)}.`);
    } else if (seenFeatures.has(feature)) {
      errors.push(`Manifest feature ${JSON.stringify(feature)} is duplicated.`);
    } else {
      validFeatures.push(feature);
      seenFeatures.add(feature);
    }
  }
  if (seenFeatures.has('subscriptionChange') && !seenFeatures.has('subscription')) {
    errors.push('Feature "subscriptionChange" requires "subscription" in the manifest.');
  }

  const inferredFeatures = inferFeaturesFromCode(corpus);
  for (const feature of inferredFeatures) {
    if (!seenFeatures.has(feature)) {
      const hit = firstMatch(corpus, FEATURE_CODE_SIGNATURES[feature]);
      errors.push(`Code uses "${feature}" near ${hit || 'source'}, but the manifest does not declare it.`);
    }
  }
  const enforcedFeatures = [...new Set([...validFeatures, ...inferredFeatures])];

  for (const handler of deriveRequiredHandlers(enforcedFeatures)) {
    const hit = firstMatch(corpus, HANDLER_REGISTRATION_PATTERNS[handler]);
    if (!hit) {
      errors.push(`Required handler "${handler}" has no executable SDK registration call for features ${JSON.stringify(enforcedFeatures)}.`);
    } else {
      notes.push(`Handler "${handler}" registration: ${hit}.`);
    }
  }

  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  if (!Array.isArray(data.decisions)) errors.push('Manifest decisions must be an array.');
  const decisionById = new Map();
  for (const decision of decisions) {
    if (!decision || typeof decision !== 'object' || !normalizeText(decision.id)) {
      errors.push('Every manifest decision must be an object with a non-empty id.');
      continue;
    }
    if (decisionById.has(decision.id)) errors.push(`Decision "${decision.id}" is duplicated.`);
    else decisionById.set(decision.id, decision);
  }

  const requiredDecisionIds = deriveRequiredDecisionIds(validFeatures);
  for (const id of requiredDecisionIds) {
    if (!decisionById.has(id)) errors.push(`Required human decision "${id}" is missing from the manifest.`);
  }

  const unresolved = [];
  for (const decision of decisions) {
    if (!decision || !normalizeText(decision.id)) continue;
    if (decision.status === 'CONFIRMED_BY_HUMAN') validateDecisionEvidence(decision, errors);
    else if (['READ_FROM_CODE_PENDING_CONFIRMATION', 'UNRESOLVED'].includes(decision.status)) unresolved.push(decision);
    else errors.push(`Decision "${decision.id}" has invalid status ${JSON.stringify(decision.status)}.`);
  }

  let transcript = null;
  if (options.transcriptPath) {
    transcript = transcriptUserMessages(options.transcriptPath);
    if (transcript.error) errors.push(`Cannot read Claude transcript ${options.transcriptPath}: ${transcript.error}`);
  } else if (options.requireHumanTranscript) {
    errors.push('Claude hook did not provide transcript_path; human confirmation cannot be authenticated.');
  }
  if (transcript && !transcript.error) {
    for (const decision of decisions.filter((item) => item && item.status === 'CONFIRMED_BY_HUMAN')) {
      const quote = normalizeText(decision.evidence && decision.evidence.quote);
      if (quote && !transcript.messages.some((message) => message.includes(quote))) {
        errors.push(`Decision "${decision.id}" quote was not found in a human user message in the Claude transcript.`);
      }
    }
  }

  const liveStub = firstMatch(
    corpus,
    /(?:throw\s+new\s+[A-Za-z]*Error|raise\s+RuntimeError|panic)\s*\([^\n)]*WAFFO_DECISION_REQUIRED/,
    'uncommented'
  );
  for (const decision of unresolved) {
    if (!liveStub) {
      errors.push(`Decision "${decision.id}" is ${decision.status}, but no executable ${DECISION_STUB_MARKER} stub was found.`);
    }
  }

  const requestIdField = '(?:paymentRequestId|paymentRequestID|refundRequestId|refundRequestID|subscriptionRequest)';
  const requestIdAssignment = `${requestIdField}\\s*(?:[:=]|\\()`;
  const badRequestIdPatterns = [
    new RegExp(`${requestIdAssignment}[^\\n]{0,180}\\b(?:uuidv4|(?:crypto\\.)?randomUUID)\\s*\\(\\s*\\)(?![^\\n]{0,120}(?:replace\\s*\\(|\\.hex\\b))`, 'i'),
    new RegExp(`${requestIdAssignment}[^\\n]{0,180}\\bUUID\\.randomUUID\\s*\\(\\s*\\)(?![^\\n]{0,120}replace\\s*\\()`, 'i'),
    new RegExp(`${requestIdAssignment}[^\\n]{0,180}\\buuid\\.uuid4\\s*\\(\\s*\\)(?![^\\n]{0,120}\\.hex\\b)`, 'i'),
    new RegExp(`${requestIdAssignment}(?![^\\n]{0,240}\\b(?:strings\\.)?Replace)[^\\n]{0,180}\\buuid\\.New\\s*\\(\\s*\\)\\.String\\s*\\(\\s*\\)`, 'i'),
  ];
  const badUuid = firstMatch(corpus, badRequestIdPatterns, 'uncommented');
  if (badUuid) {
    errors.push(`A Waffo request-ID field uses a raw dashed UUID near ${badUuid}; normalize it to at most 32 characters.`);
  }

  const orderUsesSubKey = firstMatch(corpus, /\.\s*(?:order|Order)\s*\(\s*\)\s*\.\s*(?:create|Create)\b(?:(?!\.\s*(?:create|Create)\b)[\s\S]){0,300}?\bcurrency\s*:/, 'uncommented');
  if (orderUsesSubKey) warnings.push(`order create appears to use subscription key "currency" near ${orderUsesSubKey}.`);
  const subUsesOrderKey = firstMatch(corpus, /\.\s*(?:subscription|Subscription)\s*\(\s*\)\s*\.\s*(?:create|Create)\b(?:(?!\.\s*(?:create|Create)\b)[\s\S]){0,300}?\borderCurrency\s*:/, 'uncommented');
  if (subUsesOrderKey) warnings.push(`subscription create appears to use order key "orderCurrency" near ${subUsesOrderKey}.`);

  return {
    errors,
    warnings,
    notes,
    unresolvedDecisions: unresolved,
    liveStub,
    features: validFeatures,
  };
}

function itemId(item) {
  if (typeof item === 'string') return item;
  return item && (item.id || item.methodId || item.payMethodId || item.name);
}

function requireFields(container, keys, label, reasons) {
  for (const key of keys) {
    if (!normalizeText(container && container[key])) {
      reasons.push(`${label}.${key} is required for schemaVersion ${RENDERABLE_SCHEMA_VERSION} report rendering.`);
    }
  }
}

// schemaVersion 2 carries everything the renderer needs. Validated here rather than in
// runChecks so a mid-integration `waffo-verify .` stays usable before the report exists.
function validateRenderableManifest(data, reasons) {
  const report = data.report && typeof data.report === 'object' ? data.report : null;
  if (!report) {
    reasons.push(`Manifest report block is required for schemaVersion ${RENDERABLE_SCHEMA_VERSION}.`);
    return;
  }
  const keysOf = (rows) => rows.map(([key]) => key);
  requireFields(report, REPORT_META_FIELDS, 'report', reasons);
  requireFields(report.integrationConfiguration, keysOf(REPORT_CONFIG_ROWS), 'report.integrationConfiguration', reasons);
  requireFields(report.projectSurface, keysOf(REPORT_SURFACE_ROWS), 'report.projectSurface', reasons);
  requireFields(report.parameterCheck, keysOf(PARAMETER_CHECK_ITEMS), 'report.parameterCheck', reasons);
  requireFields(report.dataIntegrity, keysOf(DATA_INTEGRITY_ITEMS), 'report.dataIntegrity', reasons);
  requireFields(report.appTerminalAssessment, keysOf(APP_TERMINAL_ROWS), 'report.appTerminalAssessment', reasons);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(report.date))) {
    reasons.push(`report.date must be YYYY-MM-DD, not ${JSON.stringify(report.date)}.`);
  }

  for (const [key] of GO_LIVE_ROWS) {
    const row = report.goLive && report.goLive[key];
    if (!row || !normalizeText(row.status) || !normalizeText(row.detail)) {
      reasons.push(`report.goLive.${key} must provide status and detail.`);
    }
  }

  const delivery = Array.isArray(report.webhookDelivery) ? report.webhookDelivery : [];
  if (!delivery.length) reasons.push('report.webhookDelivery must be a non-empty array.');
  for (const row of delivery) {
    if (!row || !WEBHOOK_DELIVERY_STATUSES.has(row.status)) {
      reasons.push(`report.webhookDelivery status must be one of ${[...WEBHOOK_DELIVERY_STATUSES].join(', ')}.`);
    } else if (!normalizeText(row.detail)) {
      reasons.push(`report.webhookDelivery "${row.status}" must include detail.`);
    }
  }

  const apis = Array.isArray(report.apisExercised) ? report.apisExercised : [];
  if (!apis.length) reasons.push('report.apisExercised must be a non-empty array.');
  for (const row of apis) {
    if (!row || !normalizeText(row.capability) || !normalizeText(row.operation) || !normalizeText(row.evidence)) {
      reasons.push('Every report.apisExercised row must have capability, operation, and evidence.');
    }
  }

  if (!Array.isArray(report.remediation)) reasons.push('report.remediation must be an array, even when empty.');
  if (report.fixes !== undefined && !Array.isArray(report.fixes)) reasons.push('report.fixes must be an array when present.');
  for (const fix of Array.isArray(report.fixes) ? report.fixes : []) {
    if (!fix || !normalizeText(fix.testId) || !normalizeText(fix.rootCause) || !normalizeText(fix.fixSummary)) {
      reasons.push('Every report.fixes row must have testId, rootCause, and fixSummary.');
    }
  }

  for (const test of Array.isArray(data.tests) ? data.tests : []) {
    if (test && normalizeText(test.id) && !normalizeText(test.details)) {
      reasons.push(`Test "${test.id}" must include details for report rendering.`);
    }
  }
  for (const row of Array.isArray(data.payMethodCoverage) ? data.payMethodCoverage : []) {
    const id = row && normalizeText(row.methodId || row.id || row.name);
    if (!id) continue;
    if (!normalizeText(row.country)) reasons.push(`Pay method "${id}" must include country for report rendering.`);
    if (!normalizeText(row.type)) reasons.push(`Pay method "${id}" must include type for report rendering.`);
  }
  for (const finding of Array.isArray(data.qualityFindings) ? data.qualityFindings : []) {
    const id = finding && normalizeText(finding.id);
    if (!id) continue;
    for (const key of ['reviewAnchor', 'finding', 'recommendation', 'evidence']) {
      if (!normalizeText(finding[key])) reasons.push(`Quality finding "${id}" must include ${key} for report rendering.`);
    }
  }
}

function reportGateBlocked(result, manifest) {
  const data = (manifest && manifest.data) || {};
  const reasons = [...result.errors];
  const conditionalItems = [];
  if (result.liveStub) reasons.push(`A live ${DECISION_STUB_MARKER} stub remains in executable code.`);
  if (result.unresolvedDecisions.length) {
    reasons.push(`Unresolved decisions: ${result.unresolvedDecisions.map((d) => d.id || '(unnamed)').join(', ')}.`);
  }

  const currentRunId = normalizeText(data.currentRunId);
  if (!currentRunId) reasons.push('Manifest currentRunId is required for current-run evidence checks.');
  const evidence = Array.isArray(data.evidence) ? data.evidence : [];
  if (!Array.isArray(data.evidence) || evidence.length === 0) reasons.push('Manifest evidence must be a non-empty array.');
  const evidenceById = new Map();
  for (const item of evidence) {
    if (!item || !normalizeText(item.id)) {
      reasons.push('Every evidence item must have a non-empty id.');
      continue;
    }
    if (evidenceById.has(item.id)) reasons.push(`Evidence id "${item.id}" is duplicated.`);
    else evidenceById.set(item.id, item);
    for (const field of ['runId', 'kind', 'summary', 'capturedAt']) {
      if (!normalizeText(item[field])) reasons.push(`Evidence "${item.id}" is missing ${field}.`);
    }
  }

  const requireCurrentEvidence = (item, label) => {
    const ids = item && Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
    if (!ids.length) {
      reasons.push(`${label} must reference at least one current-run evidence id.`);
      return;
    }
    for (const id of ids) {
      const evidenceItem = evidenceById.get(id);
      if (!evidenceItem) reasons.push(`${label} references unknown evidence id "${id}".`);
      else if (evidenceItem.runId !== currentRunId) reasons.push(`${label} references stale evidence "${id}" from run ${JSON.stringify(evidenceItem.runId)}.`);
    }
  };

  const requireIdentifiers = (item, label, requiredFields) => {
    const identifiers = item && item.identifiers;
    if (!identifiers || typeof identifiers !== 'object' || Array.isArray(identifiers)) {
      reasons.push(`${label} must include an identifiers object with concrete ${requiredFields.join(', ')}.`);
      return;
    }
    for (const field of requiredFields) {
      if (!isConcreteIdentifier(identifiers[field])) {
        reasons.push(`${label} identifiers.${field} must be a concrete string, not a placeholder.`);
      }
    }
  };

  const phases = data.phases && typeof data.phases === 'object' && !Array.isArray(data.phases) ? data.phases : {};
  if (!data.phases || Array.isArray(data.phases) || typeof data.phases !== 'object') reasons.push('Manifest phases must be an object.');
  for (const phase of REQUIRED_PHASES) {
    if (!Object.prototype.hasOwnProperty.call(phases, phase)) reasons.push(`Required phase "${phase}" is missing.`);
  }
  for (const [phase, entry] of Object.entries(phases)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      reasons.push(`Phase "${phase}" must be an object with status and evidenceIds/reason.`);
      continue;
    }
    const status = entry.status;
    if (['PASS', 'CONDITIONAL'].includes(status)) {
      requireCurrentEvidence(entry, `Phase "${phase}"`);
      if (status === 'CONDITIONAL') {
        if (!normalizeText(entry.reason)) reasons.push(`Phase "${phase}" with status CONDITIONAL must include a reason.`);
        if (!normalizeText(entry.nextStep)) reasons.push(`Phase "${phase}" with status CONDITIONAL must include a nextStep.`);
        conditionalItems.push(`phase ${phase}`);
      }
    } else if (['N/A', 'SKIPPED'].includes(status)) {
      if (!normalizeText(entry.reason)) reasons.push(`Phase "${phase}" with status ${status} must include a reason.`);
    } else if (status === 'FAIL') {
      reasons.push(`Phase "${phase}" is FAIL.`);
    } else {
      reasons.push(`Phase "${phase}" has non-terminal or invalid status ${JSON.stringify(status)}.`);
    }
  }

  const tests = Array.isArray(data.tests) ? data.tests : [];
  if (!Array.isArray(data.tests)) reasons.push('Manifest tests must be an array.');
  const testsById = new Map();
  for (const test of tests) {
    if (!test || !normalizeText(test.id)) {
      reasons.push('Every test item must have a non-empty id.');
      continue;
    }
    if (testsById.has(test.id)) reasons.push(`Test "${test.id}" is duplicated.`);
    else testsById.set(test.id, test);
  }
  for (const id of deriveRequiredTestIds(result.features)) {
    if (!testsById.has(id)) reasons.push(`Required test "${id}" is missing.`);
  }
  const conditionalStatuses = new Set(['MANUAL', 'WAFFO_SUPPORT_REQUIRED', 'SKIP_WITH_REASON', 'N/A']);
  for (const test of tests) {
    if (!test || !normalizeText(test.id)) continue;
    if (['PASS', 'USED'].includes(test.status)) {
      requireCurrentEvidence(test, `Test "${test.id}"`);
      const requiredIdentifiers = TEST_IDENTIFIER_REQUIREMENTS[test.id] || [];
      if (requiredIdentifiers.length) requireIdentifiers(test, `Test "${test.id}"`, requiredIdentifiers);
    } else if (conditionalStatuses.has(test.status)) {
      requireCurrentEvidence(test, `Test "${test.id}"`);
      if (!normalizeText(test.reason)) reasons.push(`Test "${test.id}" with status ${test.status} must include a reason.`);
      if (!normalizeText(test.nextStep)) reasons.push(`Test "${test.id}" with status ${test.status} must include a nextStep.`);
      conditionalItems.push(`test ${test.id}`);
    } else if (['FAIL', 'PARTIAL'].includes(test.status)) {
      reasons.push(`Test "${test.id}" is ${test.status}.`);
    } else {
      reasons.push(`Test "${test.id}" has invalid status ${JSON.stringify(test.status)}.`);
    }
  }

  const inquiry = data.payMethodInquiry;
  if (!inquiry || typeof inquiry !== 'object' || Array.isArray(inquiry)) {
    reasons.push('Manifest payMethodInquiry is required.');
  } else {
    if (inquiry.status !== 'PASS') reasons.push(`payMethodConfig().inquiry() status must be PASS, not ${JSON.stringify(inquiry.status)}.`);
    requireCurrentEvidence(inquiry, 'payMethodConfig().inquiry()');
    if (!Array.isArray(inquiry.activeMethods)) reasons.push('payMethodInquiry.activeMethods must be an array.');
  }

  const coverage = Array.isArray(data.payMethodCoverage) ? data.payMethodCoverage : [];
  if (!Array.isArray(data.payMethodCoverage)) reasons.push('Manifest payMethodCoverage must be an array.');
  const coverageById = new Map();
  for (const row of coverage) {
    const id = itemId(row);
    if (!normalizeText(id)) {
      reasons.push('Every payMethodCoverage row must have methodId/id/name.');
      continue;
    }
    if (coverageById.has(id)) reasons.push(`Pay method coverage "${id}" is duplicated.`);
    else coverageById.set(id, row);
    if (['PASS', 'USED'].includes(row.status)) {
      requireCurrentEvidence(row, `Pay method "${id}"`);
      requireIdentifiers(row, `Pay method "${id}"`, PAY_METHOD_REQUIRED_IDENTIFIERS);
    } else if (conditionalStatuses.has(row.status)) {
      requireCurrentEvidence(row, `Pay method "${id}"`);
      if (!normalizeText(row.reason)) reasons.push(`Pay method "${id}" with status ${row.status} must include a reason.`);
      if (!normalizeText(row.nextStep)) reasons.push(`Pay method "${id}" with status ${row.status} must include a nextStep.`);
      conditionalItems.push(`pay method ${id}`);
    } else reasons.push(`Pay method "${id}" has invalid status ${JSON.stringify(row.status)}.`);
  }
  for (const method of inquiry && Array.isArray(inquiry.activeMethods) ? inquiry.activeMethods : []) {
    const id = itemId(method);
    if (!normalizeText(id)) reasons.push('Every active pay method must have id/payMethodId/name.');
    else if (!coverageById.has(id)) reasons.push(`Active pay method "${id}" is missing from payMethodCoverage.`);
  }

  const findings = Array.isArray(data.qualityFindings) ? data.qualityFindings : [];
  if (!Array.isArray(data.qualityFindings)) reasons.push('Manifest qualityFindings must be an array.');
  const findingById = new Map();
  for (const finding of findings) {
    if (!finding || !normalizeText(finding.id)) {
      reasons.push('Every quality finding must have a non-empty id.');
      continue;
    }
    if (findingById.has(finding.id)) reasons.push(`Quality finding "${finding.id}" is duplicated.`);
    else findingById.set(finding.id, finding);
  }
  for (const id of REQUIRED_QUALITY_CHECKS) {
    if (!findingById.has(id)) reasons.push(`Required quality finding "${id}" is missing.`);
  }
  for (const finding of findings) {
    if (!finding || !normalizeText(finding.id)) continue;
    if (finding.riskLevel === 'PASS') requireCurrentEvidence(finding, `Quality finding "${finding.id}"`);
    else if (finding.riskLevel === 'N/A') {
      requireCurrentEvidence(finding, `Quality finding "${finding.id}"`);
      if (!normalizeText(finding.reason)) reasons.push(`Quality finding "${finding.id}" marked N/A must include a reason.`);
    } else if (['SHOULD_FIX', 'MONITOR'].includes(finding.riskLevel)) {
      requireCurrentEvidence(finding, `Quality finding "${finding.id}"`);
      if (!normalizeText(finding.nextStep)) reasons.push(`Quality finding "${finding.id}" must include a nextStep.`);
      conditionalItems.push(`quality finding ${finding.id}`);
    } else if (finding.riskLevel === 'MUST_FIX') {
      reasons.push(`Quality finding "${finding.id}" is MUST_FIX.`);
    } else {
      reasons.push(`Quality finding "${finding.id}" has invalid riskLevel ${JSON.stringify(finding.riskLevel)}.`);
    }
  }

  if (!Array.isArray(data.blockers)) reasons.push('Manifest blockers must be an array, even when empty.');
  else {
    for (const blocker of data.blockers) {
      if (!blocker || blocker.status !== 'CLOSED') reasons.push(`Open blocker remains: ${JSON.stringify(blocker && (blocker.id || blocker.summary) || blocker)}.`);
    }
  }
  if (!Array.isArray(data.mustFix)) reasons.push('Manifest mustFix must be an array, even when empty.');
  else if (data.mustFix.length) reasons.push(`Manifest contains ${data.mustFix.length} unresolved MUST_FIX item(s).`);

  const outcome = normalizeText(data.outcome).toUpperCase();
  if (!['FULL', 'CONDITIONAL'].includes(outcome)) {
    reasons.push(`Formal reports require outcome FULL or CONDITIONAL; received ${JSON.stringify(data.outcome)}.`);
  } else if (outcome === 'FULL' && conditionalItems.length) {
    reasons.push(`Outcome FULL conflicts with conditional items: ${conditionalItems.join(', ')}.`);
  }

  if (data.schemaVersion === RENDERABLE_SCHEMA_VERSION) validateRenderableManifest(data, reasons);
  return reasons;
}

// ---- Report renderer (schemaVersion 2) ----
// The report is a deterministic projection of an already-validated manifest. Nothing here
// reads free-form prose about table shape: columns, status words and the contracted-method
// list are derived, which is precisely the drift class hand-written reports kept producing.

const SUBSCRIPTION_EVENT_ROWS = [
  ['subscription-event-status', 'SUBSCRIPTION_STATUS_NOTIFICATION', 'Subscription integrated'],
  ['subscription-event-period-changed', 'SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION', 'Subscription integrated'],
  ['subscription-event-payment', 'PAYMENT_NOTIFICATION', 'Subscription integrated'],
  ['subscription-event-change', 'SUBSCRIPTION_CHANGE_NOTIFICATION', 'Upgrade/downgrade integrated'],
];
const SUBSCRIPTION_EVENT_IDS = new Set(SUBSCRIPTION_EVENT_ROWS.map(([id]) => id));
const PASSING_STATUSES = new Set(['PASS', 'USED']);

function cell(value) {
  const text = normalizeText(value);
  return text ? text.replace(/\|/g, '\\|') : '-';
}

function table(headers, rows) {
  const lines = ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|'];
  for (const row of rows) lines.push('| ' + row.map(cell).join(' | ') + ' |');
  return lines.join('\n');
}

function identifier(row, key) {
  return (row && row.identifiers && row.identifiers[key]) || '';
}

function methodId(row) {
  return normalizeText(row && (row.methodId || row.id || row.name));
}

function renderReport(data) {
  const report = data.report || {};
  const tests = Array.isArray(data.tests) ? data.tests : [];
  const coverage = Array.isArray(data.payMethodCoverage) ? data.payMethodCoverage : [];
  const activeMethods = (data.payMethodInquiry && Array.isArray(data.payMethodInquiry.activeMethods))
    ? data.payMethodInquiry.activeMethods : [];
  const findings = Array.isArray(data.qualityFindings) ? data.qualityFindings : [];
  const outcome = normalizeText(data.outcome).toUpperCase();
  const evidenceOf = (row) => (Array.isArray(row && row.evidenceIds) ? row.evidenceIds.join(', ') : '');

  // Every contracted method is listed because the list is derived from the inquiry result,
  // not retyped by hand. This is the guard for the "merged rows" drift.
  const contracted = activeMethods.map((m) => normalizeText(m && (m.id || m.methodId || m.name))).filter(Boolean);
  const countBy = (status) => coverage.filter((row) => normalizeText(row.status) === status).length;
  const testedCount = coverage.filter((row) => PASSING_STATUSES.has(normalizeText(row.status))).length;

  const out = ['# Integration Acceptance Report / 集成验收报告', ''];
  const push = (...lines) => out.push(...lines, '');

  push('## Overview', table(['Field', 'Value'], [
    ['Project', report.project],
    ['Date', report.date],
    ['SDK Version', report.sdkVersion],
    ['Skill Version', readSkillVersion() || 'unknown'],
    ['Environment', report.environment],
    ['MID', report.mid],
    ['Coverage Basis', report.coverageBasis],
    ['Report Eligibility', 'PASSED_HARD_GATE'],
    ['Features', report.features],
    ['Pay Methods Contracted', contracted.length ? contracted.length + ': ' + contracted.join(', ') : '-'],
    ['Pay Methods Tested', testedCount + ' TESTED / ' + countBy('MANUAL') + ' MANUAL / ' + countBy('WAFFO_SUPPORT_REQUIRED') + ' WAFFO_SUPPORT_REQUIRED / ' + countBy('SKIP_WITH_REASON') + ' SKIPPED'],
  ]));

  if (normalizeText(report.notes)) push('> **Verification notes**: ' + normalizeText(report.notes));

  push('## Integration Configuration', table(['Parameter', 'Value'],
    REPORT_CONFIG_ROWS.map(([key, label]) => [label, report.integrationConfiguration && report.integrationConfiguration[key]])));

  push('## Project Integration Surface', table(['Item', 'Result'],
    REPORT_SURFACE_ROWS.map(([key, label]) => [label, report.projectSurface && report.projectSurface[key]])));

  push('## Webhook Delivery Evidence', table(['Status', 'Detail', 'Next Step'],
    (report.webhookDelivery || []).map((row) => [row.status, row.detail, row.nextStep])));

  push('## Waffo APIs Exercised', table(['Capability', 'Waffo SDK/API Operation', 'Evidence'],
    (report.apisExercised || []).map((row) => [row.capability, row.operation, row.evidence])));

  const activeRows = tests.filter((t) => !SUBSCRIPTION_EVENT_IDS.has(normalizeText(t.id)));
  push('## Active Test Results', table(
    ['Test Item', 'Result', 'Request ID', 'Acquiring ID (A单)', 'Subscription Request', 'Subscription ID', 'Refund Request ID', 'Change Request / Key', 'Details'],
    activeRows.map((t) => [
      t.id, t.status,
      identifier(t, 'paymentRequestId'), identifier(t, 'acquiringOrderId'),
      identifier(t, 'subscriptionRequest'), identifier(t, 'subscriptionId'),
      identifier(t, 'refundRequestId'), identifier(t, 'originSubscriptionRequest'),
      t.details,
    ])));

  const eventRows = SUBSCRIPTION_EVENT_ROWS
    .map(([id, eventType, requiredWhen]) => ({ row: tests.find((t) => normalizeText(t.id) === id), id, eventType, requiredWhen }))
    .filter((entry) => entry.row);
  if (eventRows.length) {
    push('## Subscription Event Coverage', table(
      ['Event Test Item', 'Event Type', 'Required When', 'Result', 'Request ID', 'Acquiring ID (A单)', 'Subscription Request', 'Subscription ID', 'Change Request / Key', 'Evidence / Details'],
      eventRows.map(({ row, id, eventType, requiredWhen }) => [
        id, eventType, requiredWhen, row.status,
        identifier(row, 'paymentRequestId'), identifier(row, 'acquiringOrderId'),
        identifier(row, 'subscriptionRequest'), identifier(row, 'subscriptionId'),
        identifier(row, 'originSubscriptionRequest'), row.details,
      ])));
  }

  push('## Parameter Check', PARAMETER_CHECK_ITEMS
    .map(([key, label]) => '- [x] ' + label + ' — ' + normalizeText(report.parameterCheck && report.parameterCheck[key])).join('\n'));

  push('## Data Integrity Check', DATA_INTEGRITY_ITEMS
    .map(([key, label]) => '- [x] ' + label + ' — ' + normalizeText(report.dataIntegrity && report.dataIntegrity[key])).join('\n'));

  const radar = REQUIRED_QUALITY_CHECKS.map((id) => findings.find((entry) => normalizeText(entry.id) === id)).filter(Boolean);
  const radarCount = (level) => radar.filter((entry) => normalizeText(entry.riskLevel) === level).length;
  push('## Integration Quality Radar',
    table(['Check Item', 'Review Anchor', 'Finding', 'Risk Level', 'Recommendation', 'Evidence'],
      radar.map((entry) => [
        QUALITY_CHECK_LABELS[normalizeText(entry.id)] || entry.id,
        entry.reviewAnchor, entry.finding, entry.riskLevel, entry.recommendation, entry.evidence,
      ])),
    '',
    '**Summary**: ' + radarCount('PASS') + ' PASS / ' + radarCount('MUST_FIX') + ' MUST_FIX / ' + radarCount('SHOULD_FIX') + ' SHOULD_FIX / ' + radarCount('MONITOR') + ' MONITOR / ' + radarCount('N/A') + ' N/A');

  push('## Pay Method Coverage', table(['Method', 'Country / Currency', 'Type', 'Status', 'Order ID', 'Reason / Next Step'],
    coverage.map((row) => [
      methodId(row), row.country, row.type, row.status,
      identifier(row, 'acquiringOrderId'),
      [normalizeText(row.reason), normalizeText(row.nextStep)].filter(Boolean).join(' / '),
    ])));

  push('## APP Terminal Assessment', table(['Question', 'Answer'],
    APP_TERMINAL_ROWS.map(([key, label]) => [label, report.appTerminalAssessment && report.appTerminalAssessment[key]])));

  push('## Go-Live Readiness', table(['Item', 'Status', 'Detail'],
    GO_LIVE_ROWS.map(([key, label]) => {
      const row = (report.goLive && report.goLive[key]) || {};
      return [label, row.status, row.detail];
    })));

  const nonPass = [
    ...tests.filter((t) => !PASSING_STATUSES.has(normalizeText(t.status))).map((t) => ({ item: t.id, row: t })),
    ...coverage.filter((row) => !PASSING_STATUSES.has(normalizeText(row.status))).map((row) => ({ item: 'pay-method: ' + methodId(row), row })),
  ];
  push('## Non-PASS Items', nonPass.length
    ? table(['Item', 'Status', 'Request ID', 'Acquiring ID (A单)', 'Subscription Request', 'Subscription ID', 'Evidence', 'Reason', 'Next Step'],
      nonPass.map(({ item, row }) => [
        item, row.status,
        identifier(row, 'paymentRequestId'), identifier(row, 'acquiringOrderId'),
        identifier(row, 'subscriptionRequest'), identifier(row, 'subscriptionId'),
        evidenceOf(row), row.reason, row.nextStep,
      ]))
    : 'None — every executable item passed.');

  // Computed, not self-declared. A hand-written compliance table is an assertion about
  // itself; these rows restate what the gate already proved before rendering was allowed.
  const missingCoverage = contracted.filter((id) => !coverage.some((row) => methodId(row) === id));
  push('## Skill Compliance Review', table(['Check', 'Result', 'Evidence'], [
    ['`payMethodConfig().inquiry()` executed successfully', 'PASS', 'payMethodInquiry status ' + normalizeText(data.payMethodInquiry && data.payMethodInquiry.status) + ', ' + contracted.length + ' active method(s)'],
    ['Every active contracted method listed', missingCoverage.length ? 'FAIL' : 'PASS', missingCoverage.length ? 'missing: ' + missingCoverage.join(', ') : coverage.length + '/' + contracted.length + ' coverage rows rendered from the inquiry result'],
    ['Non-PASS items have reason, evidence, and next step', 'PASS', nonPass.length ? nonPass.length + ' item(s), each gate-validated for reason and nextStep' : 'no non-PASS items'],
    ['All applicable active/passive/exception tests complete', 'PASS', REQUIRED_PHASES.map((phase) => phase + '=' + normalizeText(data.phases && data.phases[phase] && data.phases[phase].status)).join(', ')],
    ['No active item marked PASS/USED without execution evidence', 'PASS', 'gate enforced current-run evidence for every PASS/USED row (runId ' + normalizeText(data.currentRunId) + ')'],
    ['Report generated only after applicable phases complete', 'PASS', 'rendered by waffo-verify --emit report after the report save gate passed'],
    ['Subscription notification tests explicit', eventRows.length ? 'PASS' : 'N/A', eventRows.length ? eventRows.map((entry) => entry.eventType).join(', ') : 'subscription not integrated'],
    ['Report is Waffo-team-facing and excludes command history', 'PASS', 'renderer emits no Commands Executed section'],
    ['Report language follows interaction language', 'PASS', 'fixed labels are template-owned; evidence text comes from the manifest'],
    ['API claims sourced from OpenAPI/developer docs', 'PASS', 'skill version ' + (readSkillVersion() || 'unknown') + ' contract references'],
  ]));

  const fixes = Array.isArray(report.fixes) ? report.fixes : [];
  if (fixes.length) {
    push('## Fixes Applied During Testing', table(['#', 'Test Item', 'Root Cause', 'Fix Summary'],
      fixes.map((fix, index) => [String(index + 1), fix.testId, fix.rootCause, fix.fixSummary])));
  }

  push('## Verdict: **' + outcome + '**');
  push('## Remediation', (Array.isArray(report.remediation) && report.remediation.length)
    ? report.remediation.map((entry) => '- ' + normalizeText(entry)).join('\n')
    : '- None.');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function parseArgs(args) {
  const parsed = { positional: [], asJson: false, gateMode: null, emitMode: null, transcriptPath: null, requireHumanTranscript: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') parsed.asJson = true;
    else if (arg === '--gate') parsed.gateMode = args[++i];
    else if (arg === '--emit') parsed.emitMode = args[++i];
    else if (arg === '--transcript') parsed.transcriptPath = args[++i];
    else if (arg === '--require-human-transcript') parsed.requireHumanTranscript = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else parsed.positional.push(arg);
  }
  return parsed;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`waffo-verify: ${err.message}\n`);
    process.exit(2);
  }
  const root = path.resolve(args.positional[0] || process.cwd());
  const manifest = readManifest(root);
  const corpus = loadCorpus(collectSourceFiles(root));
  const result = runChecks(root, corpus, manifest, args);

  if (args.gateMode === 'report') {
    const reasons = reportGateBlocked(result, manifest);
    if (reasons.length) {
      if (args.asJson) process.stdout.write(JSON.stringify({ blocked: true, reasons }) + '\n');
      else process.stderr.write('waffo-verify: BLOCKED report write —\n  - ' + reasons.join('\n  - ') + '\n');
      process.exit(2);
    }
    if (args.asJson) process.stdout.write(JSON.stringify({ blocked: false }) + '\n');
    else process.stdout.write(`waffo-verify: report save gate passed (skill ${readSkillVersion() || 'unknown'}).\n`);
    process.exit(0);
  }

  if (args.gateMode) {
    process.stderr.write(`waffo-verify: unsupported gate ${JSON.stringify(args.gateMode)}\n`);
    process.exit(2);
  }

  if (args.emitMode) {
    if (args.emitMode !== 'report') {
      process.stderr.write(`waffo-verify: unsupported emit target ${JSON.stringify(args.emitMode)}\n`);
      process.exit(2);
    }
    const data = (manifest && manifest.data) || {};
    // Rendering is gated the same way saving is: a report that could not pass the gate
    // must not exist even as stdout, or it becomes a copy-paste source.
    const reasons = reportGateBlocked(result, manifest);
    if (reasons.length) {
      process.stderr.write('waffo-verify: cannot render report —\n  - ' + reasons.join('\n  - ') + '\n');
      process.exit(2);
    }
    if (data.schemaVersion !== RENDERABLE_SCHEMA_VERSION) {
      process.stderr.write(`waffo-verify: schemaVersion ${JSON.stringify(data.schemaVersion)} cannot render a report; upgrade the manifest to schemaVersion ${RENDERABLE_SCHEMA_VERSION}.\n`);
      process.exit(2);
    }
    process.stdout.write(renderReport(data));
    process.exit(0);
  }
  if (args.asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.errors.length ? 1 : 0);
  }
  const lines = [`waffo-verify ${readSkillVersion() || '(version unknown)'} — scanned ${corpus.length} source files under ${root}`];
  if (result.errors.length) {
    lines.push('', `ERRORS (${result.errors.length}) — must fix:`);
    result.errors.forEach((error) => lines.push(`  ✗ ${error}`));
  }
  if (result.warnings.length) {
    lines.push('', `WARNINGS (${result.warnings.length}):`);
    result.warnings.forEach((warning) => lines.push(`  ! ${warning}`));
  }
  if (result.notes.length) {
    lines.push('', 'NOTES:');
    result.notes.forEach((note) => lines.push(`  · ${note}`));
  }
  if (!result.errors.length && !result.warnings.length) lines.push('', '✓ No violations found.');
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(result.errors.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = {
  BASE_REQUIRED_DECISIONS,
  FEATURE_REQUIRED_DECISIONS,
  FEATURE_REQUIRED_HANDLERS,
  FEATURE_REQUIRED_TESTS,
  TEST_IDENTIFIER_REQUIREMENTS,
  PAY_METHOD_REQUIRED_IDENTIFIERS,
  REQUIRED_PHASES,
  REQUIRED_QUALITY_CHECKS,
  deriveRequiredDecisionIds,
  deriveRequiredHandlers,
  deriveRequiredTestIds,
  readSkillVersion,
  renderReport,
};
