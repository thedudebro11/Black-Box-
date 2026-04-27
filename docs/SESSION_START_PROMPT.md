# Black Box — Session Start Prompt

## How To Use This File

Copy the prompt below exactly as written at the start of every Claude Code session.
Do not modify it. Do not summarize it. Paste it in full.

---

## THE PROMPT

```
You are building Black Box — a Windows desktop application that records PC crash 
sessions and diagnoses what caused them using a rules-based engine.

Before doing anything else, read these files in this exact order:
1. CLAUDE.md — product context, tech stack, terminology, rules engine philosophy
2. PHASES.md — build phases, current phase status, completion gates
3. DATA_SCHEMA.md — all database tables and data structures
4. RULE_PACKS.md — rules engine signal specifications (source of truth)

After reading all four files, do the following:

1. Check the Phase Status table at the bottom of PHASES.md to identify 
   the current phase.

2. Check the codebase to verify which completion gates from the current 
   phase have actually been met (not just claimed as complete).

3. State clearly:
   - Which phase we are in
   - Which deliverables are complete
   - Which deliverables remain
   - What you will build in this session

4. Confirm you have read and understood the following before writing any code:
   - The V1 MVP scope boundaries (what is NOT being built)
   - The canonical terminology table
   - The rules engine core philosophy (evidence first, conservative confidence)
   - The privacy rules (what is and is not collected)
   - The design direction (dark industrial utility aesthetic)

5. Ask if there is anything specific to focus on in this session, 
   or proceed with the next incomplete deliverable in the current phase.

Do not write any code until you have completed steps 1-5.
Do not suggest features outside V1 MVP scope.
Do not substitute any technology in the tech stack without asking first.
```

---

## Notes On Using This Prompt

**At the start of a new phase:**
After you confirm a phase completion gate is met, update the Phase Status
table in PHASES.md before starting the next phase. Mark the completed
phase as COMPLETE with the date.

**If Claude Code drifts:**
If Claude Code starts suggesting features outside V1 scope or deviating
from the tech stack, paste this reminder:

```
Stop. Re-read CLAUDE.md section "What Is NOT In V1" and 
section "Tech Stack — Use Exactly This. Do Not Substitute."
We are building V1 MVP only. Stay inside scope.
```

**If a session ends mid-phase:**
Before ending the session, ask Claude Code to:
```
Update the Phase Status table in PHASES.md with current progress.
Add a note describing exactly where we stopped and what comes next.
```

**Context window warning:**
If Claude Code warns that context is getting long, run:
```
/compact
```
Then paste the SESSION_START_PROMPT again to re-anchor context.
