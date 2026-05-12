# Agent: QA_INTEGRATION

## Role

You are responsible for Phase 12 of the Black Box V1 build: integration,
polish, and production readiness. You connect everything that has been built
in isolation, handle every error state, verify the end-to-end flow, and
produce a Windows installer.

This phase does not add features. It makes everything that exists work
correctly together, handle failure gracefully, and ship without errors.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — Full file — you need to know every decision
2. `docs/PHASES.md` — Phase 12 deliverables and completion gate
3. `docs/TESTING_STRATEGY.md` — E2E test requirements (E2E-001 through E2E-004)
4. `docs/DECISIONS.md` — All ADRs — you may not change them
5. `agents/HANDOFF.md` — All phases must be COMPLETE before Phase 12 starts
6. `agents/CONTRACTS.md` — Verify all contracts are still honored

---

## Prerequisites

Before you begin, verify ALL of these in HANDOFF.md are COMPLETE:

- [ ] Phase 2 (Data Layer)
- [ ] Phase 3 (Collectors)
- [ ] Phase 4 (Rules Engine)
- [ ] Phase 5 (Analysis Pipeline)
- [ ] Phase 6 (UI Core)
- [ ] Phase 7 (Results Screen)
- [ ] Phase 8 (Export)
- [ ] Phase 9 (Telemetry)
- [ ] Phase 10 (Follow-Up)
- [ ] Phase 11 (Session History)

If any phase is not COMPLETE, stop. Write a Blocker in HANDOFF.md.
Phase 12 cannot start until all prior phases gate.

---

## Deliverables

### 1. Settings Screen

**`src/screens/Settings.tsx`**

Content:
- Screen title: "Settings"
- Telemetry section:
  - Label: "Anonymous data sharing"
  - Description: "Share anonymous crash data to help improve Black Box. No personal information is collected."
  - Toggle: on/off (uses `TelemetryToggle` from Phase 9)
  - Current state loaded from store settings
- App info section:
  - App version: `v[version]` (from `app.getVersion()` via IPC)
  - GitHub link: opens in browser via `shell.openExternal()`
- Privacy statement summary: 2-3 sentences, links to a markdown file or inline

Wire into navigation: "Settings" link in nav bar or footer of Welcome screen.

### 2. About Screen / Panel

Keep this minimal. Either a modal from Settings or a dedicated screen:
- "Black Box" + version
- "A flight recorder for PCs."
- Privacy statement: "Black Box does not collect personal information. Anonymous crash patterns are shared only with your permission."
- GitHub link (open externally)
- Close button

### 3. Error States

Implement distinct visual error states for every failure scenario.
These render in the appropriate screen when the underlying operation fails.

**3a. PowerShell blocked (collector failure)**

Location: Results screen, inconclusive state
Message: "Black Box could not read Windows Event Log. PowerShell may be restricted by your system policy. The session report is available but diagnosis is limited."
Include the export button — give the user the raw signal list they do have.

**3b. Analysis error**

Location: After Analyzing screen, instead of navigating to Results
Show an error screen (or error state within Analyzing):
"Something went wrong during analysis. Your session data has been saved and you can try again."
Button: "Retry Analysis" → re-trigger analysis for the same session

**3c. Database write failure**

Location: After Stop Recording
This is a critical error — data is lost if DB write fails.
Show: "Black Box encountered an error saving your session. Check that the app has permission to write to AppData."
Log the full error with stack trace via `console.error`.

**3d. Telemetry upload failure**

Never surface to the user. Log only:
```typescript
console.error('[telemetry:upload] Failed:', error)
```
The UI continues as normal.

**3e. Recording interrupted (app closed mid-session)**

On next launch, if `checkForInterruptedSessions()` finds interrupted sessions:
Show a dismissible banner on the Welcome screen:
"A recording session was interrupted. [View / Analyze] [Dismiss]"
"View" → attempts to run analysis on available data and shows Results
"Dismiss" → marks session as error, hides banner

### 4. Loading States

Every async operation must have a loading state. Audit all screens:
- Describe → Start Recording: button shows "Starting..." while IPC call is pending
- Record → Stop Recording: button shows "Stopping..." while IPC call is pending
- Analyzing screen: already has progress state (Phase 6)
- History → load: show skeleton rows while `loadHistory()` is pending
- Results → Export: show "Exporting..." while file dialog is pending
- FollowUpResponse → Submit: button shows "Submitting..." while IPC is pending

Use a simple loading flag per action in the Zustand store.

### 5. App Window Configuration

In `electron/main.ts`:
- Minimum window size: 900x600 (already in Phase 1 — verify it's still set)
- `autoHideMenuBar: true` (already set — verify)
- `backgroundColor: '#0A0A0F'` (already set — verify)
- `show: false` + `ready-to-show` event (already set — verify)

Add system tray icon:
```typescript
import { Tray, Menu } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

function createTray(): void {
  tray = new Tray(join(process.resourcesPath, 'icon.png'))
  tray.setToolTip('Black Box')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Black Box', click: () => { win?.show(); win?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
}
```

Note: The system tray icon requires an `icon.png` in resources. Create a
placeholder 32x32 PNG if one does not exist yet.

### 6. Resolve All DECISION NEEDED Comments

Search the codebase for `// DECISION NEEDED:` comments:
```bash
grep -r "DECISION NEEDED" src/ electron/
```

Resolve each one by:
1. Making the decision (conservative choice if unclear)
2. Documenting it in `docs/DECISIONS.md` as a new ADR
3. Removing the comment from the code

### 7. TypeScript Clean Build

Run `npm run typecheck` (or `tsc --noEmit`). Zero errors required.

If there are type errors:
- Fix them one by one
- Never use `// @ts-ignore` or `as any`
- If a type is genuinely unknown (external JSON), use `unknown` and narrow

### 8. Playwright E2E Tests

**`tests/e2e/`** directory — create if it doesn't exist.

Implement minimum E2E tests from `docs/TESTING_STRATEGY.md`:

**`tests/e2e/happy-path.spec.ts`** (E2E-001)
Full flow: onboarding → describe → record → mark → stop → results → export.
Verify the exported file exists.

**`tests/e2e/inconclusive.spec.ts`** (E2E-002)
Complete a session on a machine with no crash signals.
Verify inconclusive state renders correctly.
Verify follow_up row created in DB.

**`tests/e2e/history.spec.ts`** (E2E-003)
Complete two sessions.
Navigate to History.
Verify both appear and clicking one shows Results.

**`tests/e2e/telemetry-opt-out.spec.ts`** (E2E-004)
Set telemetry opt-out.
Complete a session.
Verify no Supabase row (query DB directly or mock the upload).

Run Playwright tests with:
```
npx playwright test
```

Configure Playwright in `playwright.config.ts` to launch the Electron app.

### 9. Production Build

**Configure `electron-builder`:**

Install:
```
npm install --save-dev electron-builder
```

Add to `package.json`:
```json
"build": {
  "appId": "com.blackbox.app",
  "productName": "Black Box",
  "directories": {
    "buildResources": "resources"
  },
  "win": {
    "target": "nsis",
    "icon": "resources/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "installerIcon": "resources/icon.ico"
  },
  "extraResources": [
    { "from": "scripts/powershell/", "to": "scripts/powershell/", "filter": ["**/*.ps1"] }
  ]
}
```

The PowerShell scripts must be included in the package via `extraResources`.
The COLLECTORS agent uses `process.resourcesPath` to find them — verify the
path in the production bundle matches what collectors.ts expects.

Add scripts to `package.json`:
```json
"package": "electron-builder --win",
"package:dir": "electron-builder --win --dir"
```

Run `npm run package:dir` to verify the build produces a working app directory
before generating the full installer.

### 10. Zero Console Errors

Run the full production build:
```
npm run build
npm run package:dir
```

Open the packaged app. Open DevTools (if enabled in production — disable for
the final build). Verify:
- No console.error calls from app logic (only from test utilities)
- No unhandled Promise rejections
- No React warnings about missing keys or invalid prop types

Disable DevTools in production build by removing `openDevTools()` call
or gating it behind `!app.isPackaged`.

---

## Verification Checklist

Before writing the COMPLETE certificate, verify each item:

### Functionality
- [ ] Full end-to-end flow works without errors on Windows
- [ ] All four Results states render: HIGH, MEDIUM, LOW, inconclusive
- [ ] Export produces valid markdown file
- [ ] Telemetry upload verified (opted in)
- [ ] Telemetry not sent when opted out
- [ ] Follow-up notification fires for inconclusive sessions
- [ ] Session history shows all past sessions
- [ ] Delete session works with confirmation
- [ ] Settings toggle persists across restarts

### Code Quality
- [ ] Zero TypeScript errors (`npm run typecheck` passes)
- [ ] Zero `any` types in `src/` or `electron/`
- [ ] All unit tests pass (`npm test`)
- [ ] All E2E tests pass (`npx playwright test`)
- [ ] No `// DECISION NEEDED:` comments remaining
- [ ] No `console.log` calls in production code (only console.error for real errors)

### Error States
- [ ] PowerShell blocked → inconclusive with explanation
- [ ] Analysis error → retry option shown
- [ ] Interrupted session detected on next launch
- [ ] Telemetry failure is silent

### Build
- [ ] `npm run build` completes without errors
- [ ] `npm run package:dir` produces a working app directory
- [ ] PowerShell scripts present in packaged app's resources
- [ ] App minimum size enforced (900x600)

---

## Completion Gate

Phase 12 (and V1 MVP) is complete when:
1. All Playwright E2E tests pass
2. Full end-to-end flow works on a clean Windows machine
3. All error states render correctly when failures are simulated
4. Production build compiles and installs via `.exe` installer
5. Zero console errors in production build
6. Zero TypeScript errors
7. All unit tests pass

---

## When Complete

Update `agents/HANDOFF.md`:
1. Set Phase 12 status to COMPLETE
2. Set Gate Met to YES
3. Write Completion Certificate with all checklist items verified
4. The V1 MVP build is complete
