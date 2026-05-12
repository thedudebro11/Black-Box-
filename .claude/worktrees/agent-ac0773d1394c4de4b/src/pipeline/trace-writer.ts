// trace-writer.ts — Synchronous NDJSON append-only trace file writer.
//
// Each call to append() writes one JSON line to disk immediately.
// Stops writing at 50MB and sets the truncated flag (ADR-014).

import { appendFileSync, statSync } from 'fs'
import type { TraceRecord } from '../collectors/types'

const TRACE_SIZE_CAP_BYTES = 50 * 1024 * 1024

export class TraceWriter {
  private readonly filePath: string
  private truncated = false

  constructor(filePath: string) {
    this.filePath = filePath
  }

  append(record: TraceRecord): void {
    if (this.truncated) return

    try {
      if (this.currentSizeBytes() >= TRACE_SIZE_CAP_BYTES) {
        this.truncated = true
        console.warn('[trace-writer] 50MB cap reached — trace truncated for session')
        return
      }
      appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf8')
    } catch (err) {
      console.error('[trace-writer] append error', err)
    }
  }

  get isTruncated(): boolean {
    return this.truncated
  }

  private currentSizeBytes(): number {
    try {
      return statSync(this.filePath).size
    } catch {
      return 0
    }
  }
}
