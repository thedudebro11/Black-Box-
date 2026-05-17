# Black Box — Health Check Log

Each entry is one run of `docs/HEALTH_CHECK.md`.
Most recent run is always at the top.
Log every run — clean or not. The history is the value.

---

## Run Format

```
## YYYY-MM-DD — [CLEAN | ISSUES FOUND | FIXES APPLIED]
**Branch:** <branch name>
**Run by:** <who ran it>
**Trigger:** <why it was run — e.g. pre-phase, post-merge, routine, pre-release>

### Automated Gates
| Check        | Result | Notes |
|---|---|---|
| typecheck    | PASS / FAIL | |
| lint         | PASS / FAIL | |
| test         | PASS / FAIL | X/X tests, X skipped |
| build        | PASS / FAIL | |

### Section Results
| Section | Status | Findings |
|---|---|---|
| 2 — TypeScript    | PASS / FAIL / SKIP | |
| 3 — Architecture  | PASS / FAIL / SKIP | |
| 4 — Rules Engine  | PASS / FAIL / SKIP | |
| 5 — Data Layer    | PASS / FAIL / SKIP | |
| 6 — IPC Security  | PASS / FAIL / SKIP | |
| 7 — Privacy       | PASS / FAIL / SKIP | |
| 8 — UI & State    | PASS / FAIL / SKIP | |
| 9 — Tests         | PASS / FAIL / SKIP | |
| 10 — Terminology  | PASS / FAIL / SKIP | |
| 11 — Export       | PASS / FAIL / SKIP | |
| 12 — Hygiene      | PASS / FAIL / SKIP | |

### Fixes Applied
- none / list each fix with file and line

### Notes
<anything else worth recording — environment quirks, deferred issues, context>
```

---

## 2026-05-17 — SECURITY SCAN — FIXES APPLIED

**Branch:** main
**Run by:** Claude (AgentShield security scan)
**Trigger:** First security audit of the project — run after Phases 1–11 complete

### Security Scan Results (AgentShield)

| Metric | Before | After |
|--------|--------|-------|
| Grade | B (82/100) | B (84/100) |
| Critical | 0 | 0 |
| High | 3 | 2 |
| Medium | 11 | 10 |
| Low | 0 | 1 |

**Score breakdown (after):** Secrets 100 · Permissions 69 · Hooks 100 · MCP 100 · Agents 40

### Fixes Applied

1. **`.claude/settings.local.json`** — Added deny list blocking: `rm -rf`, `curl|bash`, `wget|bash`, `sudo`, `chmod 777`, `git push --force`, `git reset --hard`, `git clean -f`, `npx|sh`, `ssh`, `scp`, `dd`, and writes to device files
2. **`.claude/settings.local.json`** — Added `PreToolUse` Bash hook that blocks `eval`, `base64 -d | sh`, and `$(curl/wget)` command-injection patterns before execution
3. **`CLAUDE.md` and `docs/CLAUDE.md`** — Windows ACL locked to owner-only (`icacls /inheritance:r /grant:r`) — WSL2 still reports 777 due to NTFS/drvfs limitation but protection is in place at the Windows level

### Remaining Findings and Why They Are Acceptable

| Finding | Severity | Reason Not Fixed |
|---------|----------|-----------------|
| `CLAUDE.md` permissions appear as 0o777 | HIGH | WSL2 artifact — file is actually protected via Windows ACL; `chmod` has no effect on `/mnt/c/` without metadata mode in wsl.conf |
| "list processes" in `agents/COLLECTORS.md:183` | HIGH | False positive — process enumeration is the core crash-analysis signal, fully documented in CLAUDE.md and RULE_PACKS.md |
| 9 agent definition files exceed 5000 chars | MEDIUM | First-party design documents, not injected prompts. No untrusted content. |
| No Stop hooks | LOW | Not required for V1 |

### Notes

- AgentShield scored Agents at 40/100 purely due to document size heuristics. All `agents/*.md` files are first-party architecture specs — no malicious content.
- The WSL2 permission issue is structural. To fully resolve: add `[automount]` with `options = "metadata"` to `/etc/wsl.conf` (requires WSL restart), or re-run `icacls` from Windows PowerShell when needed (already done this session).
- 84/100 is the realistic ceiling for this project under AgentShield's heuristics given the WSL2 environment and first-party agent docs.

---

## 2026-05-17 — FIXES APPLIED

**Branch:** main
**Run by:** Claude (health check inaugural run)
**Trigger:** First run of `HEALTH_CHECK.md` immediately after the document was created

### Automated Gates

| Check | Result | Notes |
|---|---|---|
| typecheck | FIXED → PASS | `import.meta.env` had no type — `vite/client` was missing from `tsconfig.web.json` |
| lint | FIXED → PASS | 2 errors in `src/db/schema.ts` — wrong eslint-disable rule name |
| test | FIXED → PASS | 190/190, 0 skipped — `better-sqlite3` + `rollup` native binaries were Windows builds, rebuilt for Linux/WSL2 |
| build | PASS | 103 kB main, 316 kB renderer, clean |

### Section Results

| Section | Status | Findings |
|---|---|---|
| 2 — TypeScript | FIXED → PASS | `as any` in `electron/ipc/devtools.ts:184` — eliminated by adding explicit `ParsedSession` return type to `buildParsedSession` |
| 3 — Architecture | PASS | All 5 rule pack signatures correct. Analyzer is pure (no I/O). Renderer/main boundary clean. All IPC channels matched on both sides. Devtools gated behind `!app.isPackaged`. |
| 4 — Rules Engine | PASS | All 5 Event ID sets match spec. Time windows exact (300 000 / 60 000 / 120 000 ms). Every rule pack has disqualification logic. Inconclusive returns a non-empty reason string. |
| 5 — Data Layer | PASS | 4 tables defined (`settings`, `sessions`, `analysis_results`, `follow_ups`). No `DROP TABLE` without `IF EXISTS`. State machine moves forward only. Interrupted session recovery runs on startup. |
| 6 — IPC Security | PASS | `contextIsolation: true`, `nodeIntegration: false`. `spawn` uses argument arrays — no string interpolation in shell calls. Devtools IPC gated inside `if (!app.isPackaged)`. |
| 7 — Privacy | PASS | Sanitizer never reads `.message` field. Opt-in check fires first in `telemetry:upload` IPC handler before `uploadSession` is called. Upload failures are caught and logged only — never surfaced to UI. |
| 8 — UI & State | PASS | All 4 result outcome states handled in `Results.tsx`. No hardcoded hex outside `tailwind.config.js`. ARIA attributes on all interactive elements. Loading states in `History.tsx` and `Results.tsx`. |
| 9 — Tests | PASS | All 11 test file mappings present. 0 skipped tests. Collector tests use no real process invocations. |
| 10 — Terminology | PASS | No banned synonyms in UI copy. Confidence levels always uppercase. No forbidden phrases ("serious problem", "we found the issue", etc.). |
| 11 — Export | PASS | All 6 required header sections present in report. Session ID truncated to last 8 characters. No raw `.message` field data in output. |
| 12 — Hygiene | PASS | 0 `DECISION NEEDED` comments. 0 empty catch blocks. `console.log` in production code contains only numeric summaries — no PII. |

### Fixes Applied

1. **`tsconfig.web.json`** — added `"types": ["vite/client"]` to `compilerOptions`
   - Fixes: `TS2339: Property 'env' does not exist on type 'ImportMeta'` in `src/screens/Welcome.tsx:45`

2. **`src/db/schema.ts` lines 9 and 20** — changed eslint-disable comment from `@typescript-eslint/no-require-imports` → `@typescript-eslint/no-var-requires`
   - Fixes: ESLint `no-var-requires` error on both `require('electron')` calls

3. **`electron/ipc/devtools.ts`** — added `import type { ParsedSession }` and annotated `buildParsedSession()` with `: ParsedSession` return type; removed `as any` cast and eslint-disable comment on line 184
   - Fixes: `any` type violation — the function already returned the correct shape, TypeScript just couldn't prove it without the annotation

4. **`node_modules` (environment)** — installed `@rollup/rollup-linux-x64-gnu` (missing Linux native binary); ran `npm rebuild better-sqlite3` to recompile Windows binary for Linux
   - Root cause: `npm install` was originally run on Windows; switching to WSL2 leaves Windows PE32+ `.node` files that are invalid ELF on Linux
   - Note: if running the Electron app from Windows, run `npm run rebuild` afterward to restore the Electron-ABI build of `better-sqlite3`

### Notes

- Environment: WSL2 on Windows. Cross-platform native binary drift is an ongoing risk in this setup. Any time `npm install` or `npm update` runs under Windows, the Linux `.node` binaries will need rebuilding before tests work in WSL2. Consider adding a `postinstall` script or a note in `README` to remind about this.
- Phase 12 has not started. The readiness gate at the bottom of `HEALTH_CHECK.md` was not evaluated this run.
- Test count baseline established: **190 tests, 17 files, 0 skipped** as of this run.

---

*Add new entries above this line, below the format block.*
