# Black Box — Testing Strategy V1

## Philosophy

The rules engine is the most critical component in the product.
If it produces wrong diagnoses, users lose trust and the product fails.
Testing the rules engine is therefore the highest priority in the test suite.

Every rule pack must be tested against fixture data before it is considered
complete. No rule pack ships without passing all three fixture scenarios.

---

## Test Stack

- **Vitest** — unit tests for rules engine, collectors, database layer
- **Playwright** — E2E tests for critical UI flows
- **Fixture files** — static JSON snapshots of real event log data

---

## Rules Engine Test Requirements

Every rule pack must pass tests for these three scenarios minimum:

### Scenario 1: High Confidence Match
A session where all primary trigger signals are present plus multiple
supporting signals. Expected result: rule fires, confidence = HIGH.

### Scenario 2: Medium Confidence Match
A session where primary trigger signals are present but supporting signals
are absent or weak. Expected result: rule fires, confidence = MEDIUM.

### Scenario 3: No Match (True Negative)
A session where primary trigger signals are completely absent.
Expected result: rule does not fire.

### Scenario 4: Disqualification (where applicable)
A session where primary trigger signals are present BUT a disqualifying
signal is also present (e.g. anti-cheat exit present when testing GPU rule).
Expected result: rule does not fire or fires with LOW confidence only.

---

## Fixture File Format

Fixture files live in `tests/fixtures/`.
Each fixture is a JSON file representing a complete parsed session.

File naming convention:
```
tests/fixtures/
├── gpu-driver/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   ├── no-match.json
│   └── disqualified-by-overlay.json
├── overlay-conflict/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   └── no-match.json
├── anti-cheat/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   └── no-match.json
├── memory-exhaustion/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   └── no-match.json
└── app-hang/
    ├── high-confidence.json
    ├── medium-confidence.json
    └── no-match.json
```

---

## Fixture Structure

Each fixture file is a complete Session object as the rules engine
receives it. Use this structure:

```json
{
  "id": "fixture-gpu-high-001",
  "issue_type": "crash",
  "app_name": "TestGame.exe",
  "started_at": "2024-01-15T14:18:00.000Z",
  "stopped_at": "2024-01-15T14:24:00.000Z",
  "issue_marker_at": "2024-01-15T14:23:50.000Z",
  "windows": {
    "baseline_start": "2024-01-15T14:18:00.000Z",
    "baseline_end":   "2024-01-15T14:22:50.000Z",
    "incident_start": "2024-01-15T14:22:50.000Z",
    "incident_end":   "2024-01-15T14:23:50.000Z",
    "aftermath_start":"2024-01-15T14:23:50.000Z",
    "aftermath_end":  "2024-01-15T14:25:50.000Z"
  },
  "events": [
    {
      "type": "event",
      "ts": "2024-01-15T14:23:38.000Z",
      "source": "System",
      "provider": "nvlddmkm",
      "event_id": 153,
      "level": "Error",
      "message": "Reset TDR occurred on GPUID:100"
    }
  ],
  "processes": [
    {
      "name": "TestGame.exe",
      "pid": 9200,
      "cpu_pct": 45.2,
      "memory_mb": 4200,
      "first_seen": "2024-01-15T14:19:00.000Z",
      "last_seen":  "2024-01-15T14:23:51.000Z",
      "exit_detected": true
    },
    {
      "name": "Discord.exe",
      "pid": 4821,
      "cpu_pct": 1.2,
      "memory_mb": 284,
      "first_seen": "2024-01-15T14:18:00.000Z",
      "last_seen":  "2024-01-15T14:24:00.000Z",
      "exit_detected": false
    }
  ],
  "metrics": [
    {
      "ts": "2024-01-15T14:23:30.000Z",
      "cpu_pct": 72.4,
      "ram_used_mb": 12400,
      "ram_total_mb": 16384,
      "ram_pct": 75.7,
      "disk_latency_ms": 8,
      "gpu_pct": 94.1,
      "vram_used_mb": 7800,
      "vram_total_mb": 8192
    }
  ],
  "hardware": {
    "gpu_model": "NVIDIA GeForce RTX 4090",
    "gpu_driver_version": "537.58",
    "os_version": "Windows 11 23H2",
    "ram_total_mb": 16384
  }
}
```

---

## Rule Pack Unit Test Template

Use this template for each rule pack test file:

```typescript
// tests/unit/engine/gpu-driver.test.ts
import { describe, it, expect } from 'vitest'
import { evaluate } from '../../../src/engine/rules/gpu-driver'
import highConfidenceFixture from '../../fixtures/gpu-driver/high-confidence.json'
import mediumConfidenceFixture from '../../fixtures/gpu-driver/medium-confidence.json'
import noMatchFixture from '../../fixtures/gpu-driver/no-match.json'

describe('Rule Pack 1 — GPU Driver Instability', () => {
  it('fires with HIGH confidence when TDR event + high GPU util present', () => {
    const result = evaluate(highConfidenceFixture)
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('HIGH')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
    expect(result.outputText).toBeTruthy()
  })

  it('fires with MEDIUM confidence when TDR event present but no supporting signals', () => {
    const result = evaluate(mediumConfidenceFixture)
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('MEDIUM')
  })

  it('does not fire when no TDR signals are present', () => {
    const result = evaluate(noMatchFixture)
    expect(result.fired).toBe(false)
    expect(result.confidence).toBeNull()
  })
})
```

---

## E2E Test Requirements (Phase 12)

These are the minimum E2E tests required before V1 ships:

### E2E-001: Full happy path
1. Launch app
2. Complete onboarding (opt-in to telemetry)
3. Navigate to Describe screen
4. Enter issue type and app name
5. Start recording
6. Press issue marker
7. Stop recording
8. Wait for analysis to complete
9. Verify Results screen renders with a result (any confidence level)
10. Export report
11. Verify file exists at chosen location

### E2E-002: Inconclusive flow
1. Complete a session where no crash signals are present
2. Verify Results screen shows inconclusive state correctly
3. Verify follow-up is scheduled in the database

### E2E-003: Session history
1. Complete two sessions
2. Navigate to History screen
3. Verify both sessions appear
4. Click first session
5. Verify Results screen shows correct data for that session

### E2E-004: Telemetry opt-out
1. Set telemetry to opted-out in settings
2. Complete a session
3. Verify no row was inserted in Supabase bb_sessions table

---

## Fixture Data Sources

For V1 development, fixture data can be created from:

1. **Real Event Viewer exports** — run `Get-WinEvent` on a Windows machine
   and save the output. Best source of realistic data.

2. **Synthetic fixtures** — manually constructed JSON that matches the
   Session structure above. Use for testing specific signal combinations
   that are hard to reproduce naturally.

3. **Community crash logs** — forum posts where users paste Event Viewer
   output can be transcribed into fixture format for the no-match and
   edge case scenarios.

Label each fixture clearly with its source type in a comment field:
```json
{
  "_fixture_source": "synthetic",
  "_fixture_notes": "Tests TDR without GPU util data — simulates missing metrics",
  "id": "fixture-gpu-medium-002",
  ...
}
```
