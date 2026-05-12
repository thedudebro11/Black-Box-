// metrics.ts — System metrics sampling via systeminformation
//
// Samples CPU%, RAM, GPU%, and disk I/O at a fixed interval during recording.
// Uses systeminformation exclusively — no PowerShell involved (ADR-011).
// Privacy: numeric values only, no identifiable data.

import si from 'systeminformation'
import type { MetricSample } from './types'

// Track whether we have already warned about missing GPU utilization
// so we don't flood the log on every sample.
let gpuUtilizationWarned = false

// ── Single metric sample ───────────────────────────────────────────────────────

/**
 * Collect one set of system metrics from all sources in parallel.
 * If GPU utilization is unavailable (driver limitation), returns 0 with a
 * one-time warning rather than crashing or skipping the sample.
 */
async function takeSample(): Promise<MetricSample> {
  const [load, mem, disk, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.disksIO(),
    si.graphics(),
  ])

  const gpu = graphics.controllers[0]

  if (gpu && gpu.utilizationGpu === undefined && !gpuUtilizationWarned) {
    console.warn(
      '[collector:metrics] GPU utilization not exposed by driver — gpu_pct will be 0'
    )
    gpuUtilizationWarned = true
  }

  return {
    ts: new Date().toISOString(),
    cpu_pct: Math.round(load.currentLoad * 10) / 10,
    ram_used_mb: Math.round(mem.active / (1024 * 1024)),
    ram_total_mb: Math.round(mem.total / (1024 * 1024)),
    ram_pct: Math.round((mem.active / mem.total) * 1000) / 10,
    disk_latency_ms: disk?.rIO_sec ?? 0,
    gpu_pct: gpu?.utilizationGpu ?? 0,
    vram_used_mb: gpu?.memoryUsed ?? 0,
    vram_total_mb: gpu?.memoryTotal ?? 0,
  }
}

// ── Polling sampler ────────────────────────────────────────────────────────────

/**
 * Start sampling system metrics at a regular interval.
 * Default interval is 10 seconds per the Phase 3 spec.
 * Returns a stop function — call it to end sampling.
 *
 * Each sample is delivered via the onSample callback immediately after collection.
 * Errors are caught and logged — a failed sample is silently dropped so the
 * recording session continues.
 */
export function startMetricsSampling(
  onSample: (sample: MetricSample) => void,
  intervalMs = 10_000
): () => void {
  let stopped = false

  const sample = async (): Promise<void> => {
    if (stopped) return

    try {
      const result = await takeSample()
      if (!stopped) {
        onSample(result)
      }
    } catch (err) {
      console.error('[collector:metrics] sample error', err)
      // Drop the failed sample — do not stop the sampler
    }
  }

  // Run once immediately, then on interval
  void sample()
  const handle = setInterval(() => void sample(), intervalMs)

  return () => {
    stopped = true
    clearInterval(handle)
  }
}
