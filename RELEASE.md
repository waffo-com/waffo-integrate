# Releasing `@waffo/waffo-integrate`

Publishing is **gated**: a tag can only ship a package whose templates compile against the
pinned Waffo SDKs in all four languages. Never `npm publish` by hand — always go through the tag flow.

## Gates (defense-in-depth)

1. **PR CI** — `.github/workflows/ci.yml` runs on every push / PR: unit tests + the 4-language
   template compile harness in `--strict` mode. Must be green.
2. **Branch protection** *(GitHub setting — recommended, not in-repo)* — require `ci.yml` to pass
   before a PR can merge to `main`, so `main` stays releasable.
3. **Publish gate** — `.github/workflows/publish.yml` (tag-triggered) re-runs the full gate in
   `--strict` mode with all four toolchains installed, then `npm publish`. A red build never
   publishes, even if the tag was cut from a bad commit.

## Steps

1. Confirm `main` is green (CI passing on the latest commit).
2. On a release branch off `main` (convention: `ft-release-vX.Y.Z-zzyYYYYMMDD`):
   - Bump `version` in `package.json` — semver: **patch** = fixes, **minor** = new templates / rules /
     languages, **major** = breaking changes to the skill contract.
   - Add a `## [X.Y.Z] - YYYY-MM-DD` section to `CHANGELOG.md`.
   - *(recommended)* run the full gate locally: `npm test` (needs node/java/go/python + network).
3. Open a PR, get it reviewed, and **merge to `main` on GitHub** (PRs are merged manually — never auto-merged).
4. From the merged `main` commit, tag and push:
   ```bash
   git checkout main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
5. `publish.yml` runs automatically: internal-link check → unit tests → 4-language strict compile
   → `npm publish --access public` → GitHub Release (auto-generated notes).
6. Verify:
   ```bash
   npm view @waffo/waffo-integrate version   # should equal X.Y.Z
   ```

## If the publish job fails after tagging

The tag exists but nothing was published. Fix the cause on `main` (via PR), then move the tag to the
fixed commit:
```bash
git push --delete origin vX.Y.Z && git tag -d vX.Y.Z
# ...merge the fix to main, then re-tag from the new commit...
git checkout main && git pull && git tag vX.Y.Z && git push origin vX.Y.Z
```

## Toolchains the gate needs

Java 17, Go 1.21, Node 20+, Python 3.12 — all set up by `ci.yml` / `publish.yml`. SDK versions are
**pinned** in `tests/harness/*.mjs`; bumping an SDK is a deliberate change that re-runs the compile
gate — which is how a removed/renamed SDK field gets caught *before* release rather than in a
merchant's `mvn compile`.
