# Agent: UI

## Role

You are responsible for Phases 6, 7, and 11 of the Black Box V1 build:
all React screens and the navigation system. You build the user-facing
side of the product — the Welcome screen, the session intake and recording
flow, the results display, and the session history.

The UI must be dark, industrial, and honest. It serves frustrated users who
need clarity, not reassurance. Every screen must be keyboard-accessible,
every state must be handled, and every confidence level must be visually distinct.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — UI tone guidelines, design direction, color values,
   terminology (use canonical terms only — never substitute synonyms)
2. `docs/PHASES.md` — Phase 6, 7, 11 deliverables and completion gates
3. `agents/HANDOFF.md` — Check which UI phase to work on
4. `agents/CONTRACTS.md` — Contract 4 (AnalysisResult), Contract 5 (IPC channels),
   Contract 3 (RuleResult, SignalMatch, FixStep), Contract 6 (AppSettings)

**Check HANDOFF.md first.** Phase 6 can start after Phase 5. Phase 7 after Phase 6.
Phase 11 can start after Phase 7. Do not start a later phase before the earlier one gates.

---

## Design System (Apply Everywhere — No Exceptions)

### Color Tokens
These are the exact values from `docs/CLAUDE.md`. Use them as Tailwind classes
or CSS variables — define them in `src/index.css` as CSS custom properties.

```css
:root {
  --color-bg:           #0A0A0F;
  --color-surface:      #13131A;
  --color-surface-raised: #1C1C26;
  --color-border:       #2A2A38;
  --color-text-primary: #E8E8F0;
  --color-text-secondary: #8888A0;
  --color-accent:       #4F6EF7;
  --color-high:         #22C55E;
  --color-medium:       #F59E0B;
  --color-low:          #6B7280;
  --color-inconclusive: #6B7280;
}
```

Configure these in `tailwind.config.js` as custom colors:
```js
theme: {
  extend: {
    colors: {
      bg: '#0A0A0F',
      surface: '#13131A',
      'surface-raised': '#1C1C26',
      border: '#2A2A38',
      'text-primary': '#E8E8F0',
      'text-secondary': '#8888A0',
      accent: '#4F6EF7',
      high: '#22C55E',
      medium: '#F59E0B',
      low: '#6B7280',
    }
  }
}
```

### Typography
- UI chrome (labels, buttons, navigation): `font-sans` — system UI font stack
- Technical data (Event IDs, timestamps, session IDs): `font-mono`
- No decorative fonts

### Component Patterns
- Surfaces: `bg-surface rounded-lg border border-border`
- Raised surfaces: `bg-surface-raised`
- Primary button: `bg-accent text-white px-4 py-2 rounded-md hover:opacity-90`
- Secondary button: `border border-border text-text-secondary px-4 py-2 rounded-md hover:bg-surface-raised`
- Destructive button: `border border-red-900 text-red-400 px-4 py-2 rounded-md`

---

## Phase 6 — Core Screens

### App.tsx (update existing)

Replace the placeholder navigation with a real screen router.
Use Zustand store for current screen state. No routing library needed — this
is a single-window desktop app with screen state, not URL routing.

```typescript
type Screen = 'welcome' | 'describe' | 'record' | 'analyzing' | 'results' | 'history'
```

### src/store/index.ts (update existing)

Define the full Zustand store shape:

```typescript
interface AppStore {
  // Navigation
  currentScreen: Screen
  navigateTo: (screen: Screen) => void

  // Session intake
  sessionDraft: {
    issueType: IssueType | null
    appName: string
    description: string
  }
  setSessionDraft: (draft: Partial<AppStore['sessionDraft']>) => void

  // Active session
  activeSessionId: string | null
  recordingStartedAt: Date | null
  issueMarkedAt: Date | null
  isRecording: boolean

  // Analysis status
  analysisPhase: 'collecting' | 'parsing' | 'scoring' | 'complete' | 'error' | null
  analysisProgress: number

  // Current result
  currentResult: AnalysisResult | null
  currentSession: Session | null

  // Session history
  sessionHistory: Session[]

  // Settings
  settings: AppSettings | null

  // Actions
  startRecording: () => Promise<void>
  markIssue: () => Promise<void>
  stopRecording: () => Promise<void>
  runAnalysis: () => Promise<void>
  loadHistory: () => Promise<void>
}
```

All IPC calls go through the store — screens never call `window.electron` directly.

### Welcome.tsx

Content:
- App name: "Black Box" (large, primary text color, slightly weighted)
- Tagline: "Describe the problem. Record what happens. Black Box tells you what went wrong."
- Single CTA: "Start Session" button (accent color, prominent)
- Secondary link: "Session History" (text link, secondary color, bottom of screen)

No logo needed in V1 — typography only. Keep it minimal.

Behavior:
- "Start Session" → `navigateTo('describe')`
- "Session History" → `navigateTo('history')`
- If `settings.first_launch_complete === false` → show telemetry opt-in modal
  before allowing navigation (Phase 9 wires this — in Phase 6, skip it)

### Describe.tsx

Content:
- Screen title: "What happened?" (section heading)
- Issue type selector: 4 options displayed as cards or segmented control
  - Crash (PC or game crashed)
  - Freeze (system or app froze)
  - BSOD (blue screen)
  - App Hang (app stopped responding)
- App/game name input: text field, label "What app or game?"
- Description field: textarea, label "Any other details?" (optional)
- "Start Recording" button: primary accent, disabled until issue type + app name filled

Behavior:
- All form state → `setSessionDraft()`
- "Start Recording" → `store.startRecording()` → `navigateTo('record')`
- Back navigation: header arrow → `navigateTo('welcome')`

Validation:
- issue_type must be selected
- app_name must be non-empty (trim whitespace)
- No other validation required

### Record.tsx

This is the most critical screen in the recording flow.

Content:
- Status indicator: pulsing dot + "Recording" text (red pulse animation)
- Elapsed time: counted up from recording start (live, updated every second)
- Issue marker button: the most prominent element on the screen
  - Label: "Mark Issue" pre-press, "Issue Marked ✓" post-press
  - Style: large, visually distinct from all other buttons
  - Behavior: one press only — disabled after first press
  - Shows timestamp of when marked: "Marked at 00:01:34"
- Live signal indicators: small status area showing last collection status
  - "Events: collecting..." / "Events: [N] captured"
  - "Metrics: active"
  - These update as IPC events come in
- "Stop Recording" button: secondary style, bottom of screen
  - Requires confirmation if issue marker has NOT been pressed:
    "You haven't marked the issue yet. Stop anyway?"
  - If marker pressed: stops immediately

Behavior:
- On mount: verify `activeSessionId` exists (if not, back to welcome)
- Elapsed timer: `setInterval` every 1000ms, display as MM:SS
- "Mark Issue" → `store.markIssue()`
- "Stop Recording" → `store.stopRecording()` → `navigateTo('analyzing')`

### Analyzing.tsx

Content:
- Central message: "Black Box is analyzing your session"
- Progress indicator: animated bar or spinner (not a percentage number)
- Phase labels that update:
  - "Collecting signals..."
  - "Parsing timeline..."
  - "Scoring causes..."
  - "Complete."
- No timer. No ETA. Just the phase label and animation.

Behavior:
- On mount: call `store.runAnalysis()`
- Listen to `analysisPhase` from store
- When phase = 'complete': `navigateTo('results')`
- When phase = 'error': show error state with "Start Over" button

---

## Phase 7 — Results Screen

**`src/screens/Results.tsx`**

This is the most important screen. It must handle four distinct visual states.

### State 1: HIGH Confidence

Layout (top to bottom):
1. Confidence badge: `HIGH` in green (#22C55E) pill
2. Cause name: large text, e.g. "GPU Driver Instability"
3. Primary output text: full plain-language explanation paragraph
4. "Evidence" section (always shown):
   - Each `SignalMatch` as a row:
     - Left: Event ID + source in monospace (e.g. `Event 153 — nvlddmkm`)
     - Right: plain description + relative timestamp ("12 seconds before crash")
     - Color-coded by severity: critical = red-tinted border, supporting = neutral
5. "Fix Recommendations" section:
   - Numbered list, each fix as an expandable item
   - Step number + title (always visible)
   - Detail text (shown on expand)
6. "Other Possible Causes" section (collapsed by default):
   - Shows secondary results if any exist
   - Toggle to expand/collapse
7. Footer actions:
   - "Export Report" button (left)
   - "Start New Session" button (right)

### State 2: MEDIUM Confidence

Same layout as HIGH but:
- Badge color: amber (#F59E0B)
- Add a caveat line below the output text:
  "Other causes have not been fully ruled out."

### State 3: LOW Confidence

Same layout but:
- Badge color: gray (#6B7280)
- Caveat: "Evidence is present but insufficient for a definitive conclusion."
- Inconclusive section visible (same as State 4)

### State 4: Inconclusive

Layout:
1. Gray badge: "INCONCLUSIVE"
2. Message: use the `docs/CLAUDE.md` exact copy:
   "Black Box couldn't identify the cause with enough confidence to recommend
   a specific fix. Here's what was found during the session — you can take this
   report to a forum or support channel for additional help."
3. All signals found (if any): shown as a flat list in monospace
4. "Export Report" button: prominent — this is the user's best option
5. "Start New Session" button

### Confidence Badge Component

**`src/components/ConfidenceBadge.tsx`**

```typescript
interface ConfidenceBadgeProps {
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCONCLUSIVE'
}
```

Renders a pill-shaped badge with the correct color.
Used in Results screen and History rows.

### Signal Evidence Component

**`src/components/SignalEvidence.tsx`**

Renders one `SignalMatch`. Shows technical ID (monospace) and description.
Formats `seconds_before_marker`:
- Positive: "X seconds before crash"
- Zero: "at crash point"
- Negative: "X seconds after crash"

### Fix Step Component

**`src/components/FixStep.tsx`**

Accordion-style: title always visible, detail expands on click.
Shows step number as a circle badge.

### Results Persistence

The Results screen must show the result for the current `currentResult`
in the Zustand store. When the user navigates away and returns, the result
must still be there. Use the store's `currentResult` field — it persists
until a new session starts.

When loaded from History (Phase 11): the result is loaded by session ID
from the DB and placed in `currentResult` before navigating to Results.

---

## Phase 11 — Session History

**`src/screens/History.tsx`**

Layout:
- Screen title: "Session History"
- Sorted list: most recent first
- Each row:
  - Left: app name (bold) + issue type (secondary, smaller)
  - Center: diagnosis outcome or confidence badge
  - Right: date (relative: "3 days ago") and absolute date on hover
  - Indicator: small amber dot if follow-up pending
- Empty state: "No sessions yet. Start a session to begin."
- Delete: right-click context menu → "Delete Session" → confirmation dialog

Behavior:
- On mount: `store.loadHistory()`
- Click row: load result from DB → set `currentResult` → `navigateTo('results')`
- Delete: calls `deleteSession(id)` from DB layer via IPC
- Back: `navigateTo('welcome')`

---

## Keyboard Accessibility

Every interactive element must be reachable via Tab. Tab order must be logical.
Enter must activate focused buttons. Escape must close modals/dialogs.
No mouse-only interactions.

---

## Completion Gates

### Phase 6
User can flow: Welcome → Describe (fill form) → Start Recording → Record screen
(with real recording running in background) → Mark Issue → Stop Recording →
Analyzing screen (progress updates) → no UI errors at any step.

### Phase 7
Results screen renders correctly for all four confidence states:
HIGH, MEDIUM, LOW, inconclusive. Tested with real or fixture data.
Evidence is readable. Fix steps expand correctly. Export button visible.

### Phase 11
History shows all sessions in correct order. Empty state renders.
Clicking a session loads its Results screen. Delete requires confirmation.

---

## When Complete

After each phase gate is met, update `agents/HANDOFF.md`:
1. Set the phase status to COMPLETE
2. Set Gate Met to YES
3. Write a Completion Certificate for that phase
4. After Phase 7: notify that Phases 8, 9, 10, and 11 can all start in parallel
