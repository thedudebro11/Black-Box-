/**
 * uploader.ts — sends sanitized session payloads to Supabase.
 *
 * This module is main-process only (Node 18+ / Electron).
 * Upload failure is always silent — errors are logged to console only and
 * never surfaced to the user. This is intentional.
 *
 * Environment variables required:
 *   SUPABASE_URL      — Supabase project URL  (e.g. https://xyz.supabase.co)
 *   SUPABASE_ANON_KEY — Supabase anon/public API key
 */

import type { SanitizedPayload } from './sanitizer'

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? ''
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? ''

/**
 * Uploads a single sanitized session payload to the bb_sessions table.
 *
 * - If SUPABASE_URL is not configured: logs a dev warning and returns.
 * - On any network or HTTP error: logs to console.error and returns.
 * - Never throws. Never surfaces failures to the renderer.
 */
export async function uploadSession(payload: SanitizedPayload): Promise<void> {
  if (!SUPABASE_URL) {
    console.warn('[telemetry] SUPABASE_URL is not configured — skipping upload (dev/no-config mode)')
    return
  }

  const endpoint = `${SUPABASE_URL}/rest/v1/bb_sessions`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      // Non-2xx from Supabase — log and continue. Never throw.
      const text = await response.text().catch(() => '(unreadable body)')
      console.error(
        `[telemetry] upload failed — HTTP ${response.status}: ${text.slice(0, 200)}`
      )
    }
  } catch (err) {
    // Network error, DNS failure, etc. — log only, never propagate.
    console.error('[telemetry] upload error (network):', err)
  }
}
