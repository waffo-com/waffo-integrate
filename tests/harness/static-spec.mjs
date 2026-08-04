'use strict';

// Deterministic (non-LLM) contract assertions over references/*.md. These are fast,
// need no toolchain, and guard the exact regressions that were fixed — including the
// dict-key contract for Python, which a dynamic-language compile cannot catch.

import fs from 'node:fs';
import path from 'node:path';
import { extractBlocks, FENCE } from './extract.mjs';

const LANGS = ['node', 'java', 'go', 'python'];

/** Load and index every language's blocks by path. */
function loadBlocks(repoRoot) {
  const byLang = {};
  for (const lang of LANGS) {
    byLang[lang] = extractBlocks(path.join(repoRoot, 'references', `${lang}.md`), FENCE[lang]);
  }
  return byLang;
}

/** Code of the first block whose path matches `re` (or '' if none). */
function block(byLang, lang, re) {
  const b = (byLang[lang] || []).find((x) => x.path && re.test(x.path));
  return b ? b.code : '';
}

/** All references/*.md joined (for file-wide negative assertions). */
function allRefs(byLang) {
  return LANGS.flatMap((l) => (byLang[l] || []).map((b) => b.code)).join('\n');
}

/** Number of non-overlapping matches; callers pass a global RegExp. */
function countMatches(code, re) {
  return [...code.matchAll(re)].length;
}

export function runStaticSpec(repoRoot) {
  const byLang = loadBlocks(repoRoot);
  const refs = allRefs(byLang);
  // Full text of the flow-doc surfaces, for the Step-numbering check.
  const stepFiles = ['SKILL.md', 'README.md', 'references/integration-verification.md',
    'references/business-validation.md', 'references/sandbox-knowledge.md',
    'references/acceptance-criteria.md', 'references/code-generation-rules.md'];
  const stepText = stepFiles.map((f) => {
    try { return fs.readFileSync(path.join(repoRoot, f), 'utf8'); } catch { return ''; }
  }).join('\n');
  const results = [];
  const assert = (name, ok, detail = '') => results.push({ name, ok, detail });

  // --- file-wide negative assertions (regression guards) ---
  assert('no stale WAP|SYSTEM terminal comment', !/WAP\s*\|\s*SYSTEM/.test(refs));
  assert('no test@ / test-user@ emails in templates', !/\btest(?:-user)?@example\.com/.test(refs));
  assert("no placeholder productName 'Test'", !/productName["'\s:(]+["']Test["']/i.test(refs));
  assert('no phantom Java .productId( builder call', !/\.productId\(/.test(byLang.java.map((b) => b.code).join('\n')));
  assert('no Step 7 references (flow is Step 1-6)', !/Step 7/.test(stepText));

  // --- order-create payload contract (goodsInfo + all three redirect URLs) ---
  const orderPatterns = {
    node: {
      paths: /(?:payment-service|payment\.test)\.ts/,
      create: /\.order\(\)\.create\(/g,
      fields: { goodsInfo: /goodsInfo/g, successRedirectUrl: /successRedirectUrl/g,
        failedRedirectUrl: /failedRedirectUrl/g, cancelRedirectUrl: /cancelRedirectUrl/g },
    },
    java: {
      paths: /(?:PaymentService|WaffoIntegrationTest)\.java/,
      create: /\.order\(\)\.create\(/g,
      fields: { goodsInfo: /\.goodsInfo\(/g, successRedirectUrl: /\.successRedirectUrl\(/g,
        failedRedirectUrl: /\.failedRedirectUrl\(/g, cancelRedirectUrl: /\.cancelRedirectUrl\(/g },
    },
    go: {
      paths: /(?:payment|waffo_test)\.go/,
      create: /\.Order\(\)\.Create\(/g,
      fields: { goodsInfo: /GoodsInfo:/g, successRedirectUrl: /SuccessRedirectURL:/g,
        failedRedirectUrl: /FailedRedirectURL:/g, cancelRedirectUrl: /CancelRedirectURL:/g },
    },
    python: {
      paths: /(?:payment_service|test_payment)\.py/,
      create: /\.order\(\)\.create\(/g,
      fields: { goodsInfo: /["']goodsInfo["']\s*:/g, successRedirectUrl: /["']successRedirectUrl["']\s*:/g,
        failedRedirectUrl: /["']failedRedirectUrl["']\s*:/g, cancelRedirectUrl: /["']cancelRedirectUrl["']\s*:/g },
    },
  };
  for (const lang of LANGS) {
    const p = orderPatterns[lang];
    const candidates = byLang[lang].filter((b) => b.path && p.paths.test(b.path));
    assert(`${lang}: service and Sandbox test order-create blocks are covered`, candidates.length === 2,
      `expected 2 blocks, found ${candidates.length}`);
    for (const candidate of candidates) {
      const createCalls = countMatches(candidate.code, p.create);
      assert(`${lang}: ${candidate.path} contains order-create calls`, createCalls > 0);
      for (const [field, fieldPattern] of Object.entries(p.fields)) {
        const fieldCount = countMatches(candidate.code, fieldPattern);
        assert(`${lang}: ${candidate.path} includes ${field} in every order-create`,
          createCalls > 0 && fieldCount >= createCalls,
          `create calls=${createCalls}, ${field} occurrences=${fieldCount}`);
      }
    }
  }

  // --- subscription-create contract (managementUrl present; no non-contract orderDescription) ---
  const subPatterns = {
    node: { re: /subscription-service/, mgmt: /subscriptionManagementUrl/ },
    java: { re: /SubscriptionService\.java/, mgmt: /subscriptionManagementUrl/ },
    go: { re: /subscription\.go/, mgmt: /SubscriptionManagementURL/ },
    python: { re: /subscription_service\.py/, mgmt: /subscriptionManagementUrl/ },
  };
  for (const lang of LANGS) {
    const p = subPatterns[lang];
    const code = block(byLang, lang, p.re);
    assert(`${lang}: subscription-create includes subscriptionManagementUrl`, p.mgmt.test(code));
    // orderDescription is NOT a subscription-create field for any language.
    assert(`${lang}: subscription-create has no non-contract orderDescription`, !/orderDescription/i.test(code));
  }

  // --- cancelSubscription must be keyed by subscriptionId (all SDKs require it) ---
  // Go/Java key types are compiler-checked; assert dynamic keys and recovery semantics here.
  const nodeSub = block(byLang, 'node', /subscription-service/);
  const javaSub = block(byLang, 'java', /SubscriptionService\.java/);
  const pySub = block(byLang, 'python', /subscription_service\.py/);
  assert('node: cancelSubscription keyed by subscriptionId (not subscriptionRequest)',
    /cancel\(\{\s*subscriptionId/.test(nodeSub) && !/cancel\(\{\s*subscriptionRequest/.test(nodeSub));
  assert('python: cancel_subscription keyed by subscriptionId (not subscriptionRequest)',
    /cancel\(\{["']subscriptionId/.test(pySub) && !/cancel\(\{["']subscriptionRequest/.test(pySub));
  assert('python: cancel_subscription checks recovery inquiry before reading data',
    /inquiry_response\s*=[\s\S]*?if not inquiry_response\.is_success\(\):[\s\S]*?inquiry_response\.get_data\(\)/.test(pySub));
  assert('java: cancelSubscription checks recovery inquiry before reading data',
    /ApiResponse<InquirySubscriptionData> inquiryResponse\s*=[\s\S]*?if \(!inquiryResponse\.isSuccess\(\)\)[\s\S]*?inquiryResponse\.getData\(\)/.test(javaSub));
  assert('python: cancel_subscription returns one stable subscriptionStatus key',
    countMatches(pySub, /return \{["']subscriptionStatus["']/g) >= 2 &&
      !/return \{["']orderStatus["']/.test(pySub));

  return results;
}
