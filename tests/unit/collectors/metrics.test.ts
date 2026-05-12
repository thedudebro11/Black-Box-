import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock is hoisted before variable declarations, so mock functions must be
// created with vi.hoisted() so they exist when the factory runs.
const { mockCurrentLoad, mockMem, mockDisksIO, mockGraphics } = vi.hoisted(() => ({
  mockCurrentLoad: vi.fn(),
  mockMem: vi.fn(),
  mockDisksIO: vi.fn(),
  mockGraphics: vi.fn(),
}))

vi.mock('systeminformation', () => ({
  default: {
    currentLoad: mockCurrentLoad,
    mem: mockMem,
    disksIO: mockDisksIO,
    graphics: mockGraphics,
  },
}))

import { startMetricsSampling } from '../../../src/collectors/metrics'
import type { MetricSample } from '../../../src/collectors/types'

// ── Shared mock responses ──────────────────────────────────────────────────────

function setDefaultMocks(): void {
  mockCurrentLoad.mockResolvedValue({ currentLoad: 35.5 })
  mockMem.mockResolvedValue({
    active: 8 * 1024 * 1024 * 1024,   // 8 GB active
    total: 16 * 1024 * 1024 * 1024,   // 16 GB total
  })
  mockDisksIO.mockResolvedValue({ rIO_sec: 12.5 })
  mockGraphics.mockResolvedValue({
    controllers: [
      {
        utilizationGpu: 72,
        memoryUsed: 4096,
        memoryTotal: 8192,
      },
    ],
  })
}

describe('startMetricsSampling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setDefaultMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('calls onSample with a MetricSample that matches the interface shape', async () => {
    const samples: MetricSample[] = []

    const stop = startMetricsSampling((s) => samples.push(s), 10_000)

    // Let the initial sample (called immediately before the interval) resolve
    await vi.advanceTimersByTimeAsync(9_999)

    stop()

    expect(samples.length).toBeGreaterThan(0)
    const s = samples[0]

    // Verify all required fields exist with correct types
    expect(typeof s.ts).toBe('string')
    expect(typeof s.cpu_pct).toBe('number')
    expect(typeof s.ram_used_mb).toBe('number')
    expect(typeof s.ram_total_mb).toBe('number')
    expect(typeof s.ram_pct).toBe('number')
    expect(typeof s.disk_latency_ms).toBe('number')
    expect(typeof s.gpu_pct).toBe('number')
    expect(typeof s.vram_used_mb).toBe('number')
    expect(typeof s.vram_total_mb).toBe('number')
  })

  it('calculates cpu_pct correctly from currentLoad', async () => {
    mockCurrentLoad.mockResolvedValue({ currentLoad: 35.5 })

    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)
    await vi.advanceTimersByTimeAsync(9_999)
    stop()

    expect(samples[0].cpu_pct).toBe(35.5)
  })

  it('calculates ram_used_mb and ram_total_mb in megabytes', async () => {
    mockMem.mockResolvedValue({
      active: 8 * 1024 * 1024 * 1024,   // 8192 MB
      total: 16 * 1024 * 1024 * 1024,   // 16384 MB
    })

    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)
    await vi.advanceTimersByTimeAsync(9_999)
    stop()

    expect(samples[0].ram_used_mb).toBe(8192)
    expect(samples[0].ram_total_mb).toBe(16384)
  })

  it('calculates ram_pct as a percentage (0–100)', async () => {
    mockMem.mockResolvedValue({
      active: 8 * 1024 * 1024 * 1024,
      total: 16 * 1024 * 1024 * 1024,
    })

    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)
    await vi.advanceTimersByTimeAsync(9_999)
    stop()

    // 8/16 = 50%
    expect(samples[0].ram_pct).toBe(50)
  })

  it('passes gpu_pct from utilizationGpu', async () => {
    mockGraphics.mockResolvedValue({
      controllers: [{ utilizationGpu: 92, memoryUsed: 6144, memoryTotal: 8192 }],
    })

    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)
    await vi.advanceTimersByTimeAsync(9_999)
    stop()

    expect(samples[0].gpu_pct).toBe(92)
  })

  it('falls back to gpu_pct=0 when utilizationGpu is undefined', async () => {
    mockGraphics.mockResolvedValue({
      controllers: [{ utilizationGpu: undefined, memoryUsed: 0, memoryTotal: 8192 }],
    })

    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)
    await vi.advanceTimersByTimeAsync(9_999)
    stop()

    expect(samples[0].gpu_pct).toBe(0)
  })

  it('falls back to 0 values when no GPU controller is present', async () => {
    mockGraphics.mockResolvedValue({ controllers: [] })

    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)
    await vi.advanceTimersByTimeAsync(9_999)
    stop()

    expect(samples[0].gpu_pct).toBe(0)
    expect(samples[0].vram_used_mb).toBe(0)
    expect(samples[0].vram_total_mb).toBe(0)
  })

  it('continues sampling after an error — does not stop the sampler', async () => {
    let callCount = 0
    mockCurrentLoad.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('hardware read failed'))
      return Promise.resolve({ currentLoad: 10 })
    })

    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)

    // First tick fails, second tick should succeed
    await vi.advanceTimersByTimeAsync(9_999)   // initial call (fails)
    await vi.advanceTimersByTimeAsync(10_000)  // interval fires (succeeds)

    stop()

    // At least one successful sample should have been collected despite the first failure
    expect(samples.length).toBeGreaterThanOrEqual(1)
  })

  it('returns a stop function that prevents further samples', async () => {
    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)

    await vi.advanceTimersByTimeAsync(9_999)
    const countAfterFirstSample = samples.length

    stop()

    // Advance far past the interval — should see no additional samples
    vi.advanceTimersByTime(60_000)
    await vi.advanceTimersByTimeAsync(9_999)

    expect(samples.length).toBe(countAfterFirstSample)
  })

  it('ts field is a valid ISO 8601 string', async () => {
    const samples: MetricSample[] = []
    const stop = startMetricsSampling((s) => samples.push(s), 10_000)
    await vi.advanceTimersByTimeAsync(9_999)
    stop()

    const ts = samples[0].ts
    expect(new Date(ts).toISOString()).toBe(ts)
  })
})
