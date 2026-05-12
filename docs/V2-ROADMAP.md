# Black Box — V2 Roadmap

## Purpose of This File

This file captures the V2 vision so it is never lost between sessions.
Nothing in here gets built until V1 ships and proves the core loop works.
Read PHASES.md for current build status. Read CLAUDE.md for V1 scope rules.

---

## The Core V2 Bet

V1 proves that a rules-based engine can diagnose PC crashes with evidence.
V2 proves that anonymous data from many users can make that engine smarter
over time — automatically, without compromising privacy.

The feedback loop:
```
User has a crash
    → Black Box records and diagnoses it
    → Anonymous telemetry uploaded to Supabase (opt-in)
    → Analysis pipeline finds patterns across all sessions
    → Rule packs improve
    → Next user gets a better diagnosis
```

---

## Feature 1 — AI-Powered Telemetry Analysis Pipeline

### The Problem It Solves

V1's rule packs are written by hand. They encode what we know right now.
But crashes evolve — new driver bugs, new anti-cheat updates, new hardware
combinations. A human can't monitor thousands of sessions manually.

### How It Works

A scheduled job (weekly or on-demand) runs against the Supabase telemetry data:

1. **Pull sessions** — query the last N sessions from Supabase, grouped by
   outcome (diagnosed / inconclusive / confirmed-by-user)

2. **Run analysis agents** — send batches to the Claude API with focused prompts:

   | Agent | Focus | Input |
   |-------|-------|-------|
   | Pattern Discovery | Find event ID combinations that cluster together in inconclusive sessions | Inconclusive sessions, grouped by event IDs present |
   | Rule Validation | Check if existing rule packs are actually right | Sessions where rule fired + user follow-up response |
   | Hardware Correlation | Find GPU/driver/OS combos that fail more than average | Hardware profiles + outcome |
   | Confidence Calibration | Are HIGH confidence calls actually correct? | HIGH-confidence sessions + follow-up confirmation rate |
   | Anomaly Detection | Find sessions that don't fit any current pattern | Inconclusive sessions with unusual signal combinations |

3. **Agents produce a report** — plain language summary:
   - New event ID patterns worth adding to rule packs
   - Rule packs that are over- or under-confident
   - Hardware-specific failure patterns (e.g. RTX 4060 + driver 572.x crashing)
   - Suggested new rule packs with supporting evidence

4. **Human reviews** — a developer reads the report, decides what to act on,
   and updates the rule pack code in a new version release

### What Makes This Possible

- Privacy is already handled — the sanitizer strips everything identifiable
  before upload. Agents only ever see event IDs, metrics, hardware specs,
  and outcomes. No usernames, no file paths, no machine names.
- The data collection is already built in V1 (telemetry opt-in, Supabase upload)
- The Claude API is the analysis layer — no custom ML infrastructure needed

### What Needs To Be Built

- [ ] Richer telemetry schema — current schema captures outcome and event IDs
      but not the full signal timeline. Agents need more granular data to find
      patterns (e.g. which events fired in which time window, metric values at
      crash time, not just averages)
- [ ] Analysis pipeline script — a Node.js or Python script that queries
      Supabase, batches sessions, calls Claude API, and produces a report
- [ ] Rule update delivery — a mechanism to push improved rules to installed
      apps. Options:
      - Manual: developer updates code, publishes new version, users update
      - Semi-automatic: app fetches a signed config file on launch with
        updated thresholds and event ID lists (no code deployment required)
      - Automatic: full remote rule pack updates (higher complexity, higher risk)

### Example Agent Prompts (V2 Starting Point)

**Pattern Discovery:**
```
Here are 300 inconclusive Black Box sessions in JSON format.
Each session includes: event_ids_fired, hardware_profile, metrics_summary.
Identify event ID combinations that appear together in at least 5% of these
sessions. For each cluster, describe what Windows condition it might represent
and suggest a rule pack that could detect it.
```

**Rule Validation:**
```
Here are 150 sessions where Black Box diagnosed GPU Driver Instability with
HIGH confidence. Each session includes the follow-up response from the user
(yes = GPU fix worked, no = fix did not work, no_response = unknown).
Calculate the confirmed accuracy rate. Identify any signal patterns that
distinguish the correct HIGH confidence calls from the incorrect ones.
```

---

## Feature 2 — Background Investigation Mode

### What It Is

V1 requires the user to actively record a session. Background Investigation
Mode runs passively — it watches system signals continuously and flags
anomalies without the user having to start anything.

### How It Works

- Black Box runs a lightweight background service (Windows Service or
  scheduled task)
- Monitors event logs and metrics on a rolling window
- When a crash or anomaly is detected, automatically creates a session
  and captures the surrounding window
- Notifies the user: "Black Box detected an event — want to see what happened?"

### Why It's V2 Not V1

Background monitoring requires a persistent process, a system service
installer, careful power/performance management, and more complex
privacy handling. V1 proves the analysis works before adding the
collection complexity.

---

## Feature 3 — AI Fallback Diagnosis (Claude API)

### What It Is

When the rules engine returns inconclusive, send the session data to
Claude API as a fallback. Claude reads the raw signals and produces a
best-effort diagnosis in plain language — clearly labeled as AI-assisted,
not rules-based.

### Why It's V2 Not V1

V1 must prove the rules-based approach works first. An AI fallback before
V1 is validated would mask failures in the core engine. Also: API costs
and latency are not acceptable for every session until the product
proves enough value to justify them.

### Implementation Notes

- Only fires when outcome === 'inconclusive' and user opts in
- Session data is sanitized through the same sanitizer.ts before sending
- Response is clearly labeled "AI-assisted analysis — not verified by evidence"
- Stored separately from rules-engine results so they can be compared

---

## Feature 4 — Resolution Readback

### What It Is

After a user says "yes, I fixed it" in the follow-up, Black Box asks:
"What did you do?" The response is stored and, with permission, shared
as a community-verified fix for that signal pattern.

### Why It Matters

The fix recommendations in V1 are generic (written by a developer).
Resolution readback produces real fixes from real users — "I updated
the driver and the crashes stopped" is more credible than "consider
updating your driver."

---

## Feature 5 — Community Ticket System

### What It Is

Users who can't fix their issue can anonymously submit a "ticket" —
a stripped session report — to a community pool. Other users or
contributors can review and suggest fixes.

### Notes

- Requires moderation layer
- Requires user accounts or at least persistent anonymous IDs
- V3 territory — do not design V2 architecture around this

---

## V2 Priorities (When V1 Ships)

If forced to pick one V2 feature to build first:

**Build the AI telemetry analysis pipeline first.**

Reasons:
- It makes the existing V1 data collection valuable
- It improves V1's rule packs without requiring users to update
- It requires no UI changes — it's entirely a backend/script concern
- It compounds: the longer it runs, the better the data gets
- It's the feature that makes Black Box fundamentally different from
  a static diagnostic tool

Background Investigation Mode is the second priority — it removes the
friction of requiring the user to start a recording before the crash.

---

## What Must NOT Change Going Into V2

- Privacy model — no PII ever leaves the machine, sanitizer is mandatory
- Evidence-first philosophy — AI fallback must be clearly labeled, never
  presented as rules-based evidence
- Local-first — the app must work fully offline. Cloud features are additive,
  never required for core functionality
- Anonymous session IDs only — no user accounts until the product
  earns that level of trust
