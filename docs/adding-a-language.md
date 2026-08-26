# Adding a new SDK language

This skill supports one language per Waffo SDK (currently Node.js, Java, Go, Python, PHP).
Three parts are irreducibly per-language and must be authored by hand for each new SDK; the
rest is data-driven and needs no structural change. PHP (commit history around
`references/php.md`) is the worked reference — copy its shape.

## What is per-language (must be written) vs generic (already handled)

| Part | Per-language? | Where |
|------|---------------|-------|
| Idiomatic integration templates | **Yes — write it** | `references/<lang>.md` |
| Compile/type-check adapter | **Yes — write it** | `tests/harness/<lang>.mjs` |
| CI toolchain install step | **Yes — add it** | `.github/workflows/{ci,publish}.yml` |
| Handler-registration scan | No — generic over `.` / `->` / `::` and camel/snake/Pascal spellings | `bin/waffo-verify.js` |
| Comment/string tokenizer | Usually no — add a row only for a new comment syntax | `bin/waffo-verify.js` `commentSyntax()` |
| Skill flow tables (detect / framework / install / naming) | Data — add rows | `SKILL.md` |
| Deterministic contract assertions | Data — add a block | `tests/harness/static-spec.mjs` |
| Fenced-block extraction | Data — add the fence + file extension | `tests/harness/extract.mjs` |

## Checklist

1. **Confirm the published SDK.** Get the package name, install command, entry class, resource
   method names, response accessor style, webhook handler registration API, and version. Pin
   the exact published version in the harness (do not use a floating range).

2. **Write `references/<lang>.md`.** Mirror an existing same-style language (`node.md` for a
   camelCase SDK, `python.md` for snake_case). Cover: SDK init (+ env loader), order service
   (`create`/`inquiry`/`cancel`/`capture`), refund service, subscription service
   (`create`/`inquiry`/`cancel`/`manage`/`change`), config service, webhook handler(s), and a
   Sandbox integration test. Every source block starts with a `// path` or `# path` comment
   naming its file. Keep it clean of the negative regressions static-spec guards (no
   `test@example.com`, no placeholder `productName: 'Test'`, no `Step 7`).

3. **Register the fence.** In `tests/harness/extract.mjs`, add the language to `FENCE` and add
   its source-file extension to `PATH_RE`.

4. **Write `tests/harness/<lang>.mjs`.** Model it on `python.mjs`/`php.mjs`: guard on the
   toolchain being present (`has(...)` → `skipped` if missing), extract Tier-1 blocks
   (filter out `isFrameworkBlock`), assemble a throwaway project, install the pinned SDK, run
   a cheap syntax gate, then a type/static check. Return `{ ok, files, output }`, `{ skipped }`
   on missing toolchain/SDK, and verify the installed SDK version equals the pin. Register the
   runner in `tests/compile-templates.mjs` (`RUNNERS`).

5. **Extend `tests/harness/static-spec.mjs`.** Add the language to `LANGS` and add its
   `orderPatterns`/`subPatterns` entries plus the `cancel`-by-`subscriptionId` and
   recovery-before-read assertions, matching the language's syntax.

6. **Update `SKILL.md` data tables.** Step 1 detection signal, Step 2 naming note (if the
   method-name casing or response-accessor style differs), Step 3 framework table, Step 4
   reference list, Step 5 install command and build/check command, and the Reference Loading
   Map. Also append the language to the `Node/Java/Go/Python/...` enumeration in the
   validator-scan paragraph.

7. **Add the CI toolchain.** In both `.github/workflows/ci.yml` and `publish.yml`, add the
   language's setup action before the compile-harness step, and bump the "all N languages"
   count in the step name.

8. **Docs + metadata.** Update `docs/enforcement.md` (handler-scan support table), `README.md`
   (feature list, file tree, language count), `package.json` keywords, `CHANGELOG.md`, and — if
   keeping eval parity — add one scenario to `evals/evals.json`.

## Verify

```
node tests/waffo-verify.test.js          # validator + hook regressions
node tests/compile-templates.mjs --lang <lang>   # the new language only
node tests/compile-templates.mjs --strict         # all languages, missing toolchain = failure
```

The `--strict` run is what CI enforces; a new language is not done until its templates compile
against the pinned published SDK there.

## The validator needs no change for standard conventions

`bin/waffo-verify.js` derives each handler's camelCase, snake_case, and PascalCase spellings
and accepts the `.`, `->`, and `::` member-access operators. A new language whose handler
registration looks like `client.webhook().onPayment(...)`, `->onPayment(...)`, or
`::onPayment(...)` is detected with no edit. Only a genuinely new comment/string syntax
requires a `commentSyntax()` row.
