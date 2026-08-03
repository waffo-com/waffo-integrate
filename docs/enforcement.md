# Enforcement: verify script + manifest + optional hook

This skill is distributed as Markdown instructions. Instructions alone are **advisory** — a
long agent session or an unattended run can drift and skip them. This file documents the
**executable** enforcement layer that gives a subset of the rules real teeth.

There are three tiers. Use them together.

| Tier | What | Can it *block*? |
|------|------|-----------------|
| T1 | Prose gates in `SKILL.md` (Required Handler Manifest, Human-Decision Gate Register, Report Save Gate) + adversarial evals | No — raises voluntary compliance; evals catch regressions offline |
| T2 | `bin/waffo-verify.js` — a real program the agent runs; exits non-zero on violations | Yes, if the agent honors a non-zero exit (and a non-zero exit is an objective signal it cannot rationalize away) |
| T3 | A Claude Code **hook** that runs `waffo-verify --gate report` before the report file is written | Yes — mechanically denies the write (exit 2) regardless of the model |

**Hard limit:** a hook can only inspect *tool calls* (file writes, shell commands), never the
model's internal decision. So completeness (missing handler) gets real teeth; a silent
business-decision default is only caught *indirectly*, through the artifact it leaves — an
unresolved decision in the manifest or a live `WAFFO_DECISION_REQUIRED` stub — which blocks a
`FULL`/`CONDITIONAL` report.

---

## The manifest — `.waffo/integration-manifest.json`

The agent MUST emit this in the merchant project. It is the checkable surface: the verify
script reconciles it against the actual source. Write it during Step 4/5 and keep it current
through Step 6.

```json
{
  "skillVersion": "1.5.0",
  "features": ["order", "refund", "subscription"],
  "decisions": [
    { "id": "subscriptionMode", "status": "CONFIRMED_BY_HUMAN", "value": "payment-first", "evidence": "developer confirmed in chat 2026-08-03" },
    { "id": "cancelBenefit", "status": "UNRESOLVED", "stub": "src/subscription.service.ts:88" }
  ],
  "phases": { "A": "PASS", "C1": "PASS", "C2": "PASS" },
  "outcome": "CONDITIONAL"
}
```

- **`features`** — any of `order`, `refund`, `subscription`, `subscriptionChange`. Declares scope.
  The script cross-checks this against code: using a feature in code but omitting it here is an error.
- **`decisions`** — every money-affecting developer-owned decision (see the Human-Decision Gate
  Register in `SKILL.md`). `status` is one of:
  - `CONFIRMED_BY_HUMAN` — the developer answered; put their words in `evidence`.
  - `READ_FROM_CODE_PENDING_CONFIRMATION` — inferred from existing code; **not** yet confirmed.
  - `UNRESOLVED` — no answer available (e.g. unattended). Requires a live `WAFFO_DECISION_REQUIRED` stub.
- **`phases`** — Step 6 phase → terminal state (`PASS`/`CONDITIONAL`/`FAIL`/`N/A`/`SKIPPED`).
- **`outcome`** — `FULL` / `CONDITIONAL` / `INCOMPLETE`. The report gate blocks a `FULL`/`CONDITIONAL`
  outcome while any blocking violation or unresolved decision remains.

**The script does NOT trust `decisions`/handlers blindly.** It owns the canonical
Feature → Required-Handler map and greps the project for each required handler itself, so an
agent that shrinks its own checklist is still caught.

### BLOCK-and-stub (unattended terminal behavior)

When a money-affecting decision cannot be confirmed by a human, do **not** pick a default — and do
**not** refuse the whole task. Still generate all decision-independent code (create/inquiry calls,
field mapping, 32-char request IDs, handler registration, persistence); stub **only** the gated
branch. Emit a runtime-failing stub carrying the marker, mark the decision `UNRESOLVED`, and cap the
outcome below `FULL`:

```ts
// Node
throw new Error('WAFFO_DECISION_REQUIRED: subscription mode (payment-first vs service-first) unconfirmed');
```
```python
raise RuntimeError("WAFFO_DECISION_REQUIRED: subscription mode unconfirmed")
```
```go
panic("WAFFO_DECISION_REQUIRED: subscription mode unconfirmed")
```

---

## T2 — run the verify script

Installed alongside the skill. From the merchant project root:

```bash
node ~/.claude/skills/waffo-integrate/bin/waffo-verify.js .
```

- Exit `0` clean · exit `1` violations (fix and re-run) · exit `2` blocking violation in gate mode.
- `--json` machine-readable · `--gate report` report save-gate mode.

`SKILL.md` Step 5 (after writing code) and Step 6 (before the report) instruct the agent to run
this and resolve every `ERROR` before continuing.

Path per host: Claude Code `~/.claude/skills/...`, Codex `~/.agents/skills/...` or `~/.codex/skills/...`,
Cursor `./.cursor/skills/...`.

---

## T3 — optional Claude Code hook (mechanical block)

**Opt-in.** This edits the user's own settings, so the installer never writes it silently. Add to
`~/.claude/settings.json` (global) or the merchant project's `.claude/settings.json` (per-project)
to block writing an acceptance report until the gate passes:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "f=$(echo \"$CLAUDE_TOOL_INPUT\" | python3 -c 'import sys,json;print(json.load(sys.stdin).get(\"tool_input\",{}).get(\"file_path\",\"\"))' 2>/dev/null); case \"$f\" in *integration-report-*.md) node \"$HOME/.claude/skills/waffo-integrate/bin/waffo-verify.js\" \"$(dirname \"$f\")\" --gate report ;; *) exit 0 ;; esac"
          }
        ]
      }
    ]
  }
}
```

- A non-zero (exit `2`) result denies the `Write`, and the model sees the block reason on stderr.
- Adjust the field-extraction to your Claude Code version's hook input contract if it differs.
- **Cursor / Codex have no equivalent blocking hook** — on those hosts, T2 (the agent runs the
  script) is the enforcement ceiling. State that honestly in any go-live sign-off.

---

## What each tier actually catches

| Rule | Tier with teeth | Mechanism |
|------|-----------------|-----------|
| Missing required handler (e.g. `onSubscriptionPeriodChanged`) | T2 + T3 | script re-derives from features, greps registrations |
| Feature hidden to dodge handlers | T2 + T3 | code-signature cross-check vs declared features |
| Raw 36-char UUID in a request-ID field | T2 + T3 | source regex |
| order/subscription currency-key contamination | T2 (warn) | source regex |
| Report shipped as FULL while incomplete | T3 | report save-gate denies the Write |
| Silent subscription-mode default (a *decision*) | T2/T3 *indirect* | unresolved decision / live stub blocks report; not the decision itself |
| Business-logic correctness, proration math, etc. | none (T1 only) | not mechanically checkable — stays prose + eval |
