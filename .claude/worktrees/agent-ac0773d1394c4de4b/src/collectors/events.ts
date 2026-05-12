// events.ts — Windows Event Log collection
//
// Queries the System and Application logs using wevtutil.exe (ADR-012).
// Parses XML output with fast-xml-parser and returns typed EventRecord[].
// Privacy: message text is truncated to 500 chars maximum.

import { XMLParser } from 'fast-xml-parser'
import type { EventRecord } from './types'
import { queryEventLog } from './wevtutil'

// ── Event ID lists — matching docs/PHASES.md Phase 3 requirements ──────────────

const SYSTEM_EVENT_IDS = [153, 14, 13, 4101, 141, 1001, 2004, 1]
const APP_EVENT_IDS = [1000, 1002]

// ── XML parser — configured for wevtutil XML attribute format ─────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Prevent fast-xml-parser from coercing EventID to a number internally
  // (we handle the conversion explicitly in mapEventNode)
  parseAttributeValue: true,
  parseTagValue: true,
})

// ── Level integer to string mapping ───────────────────────────────────────────
// Windows event level: 1=Critical, 2=Error, 3=Warning, 4=Information

function mapLevel(level: unknown): string {
  const n = typeof level === 'number' ? level : parseInt(String(level), 10)
  switch (n) {
    case 1:
      return 'Error'   // Critical — treated as Error for rule pack purposes
    case 2:
      return 'Error'
    case 3:
      return 'Warning'
    case 4:
      return 'Information'
    default:
      return 'Information'
  }
}

// ── Single event node mapper ───────────────────────────────────────────────────

function mapEventNode(node: unknown): EventRecord | null {
  if (typeof node !== 'object' || node === null) return null

  const ev = node as Record<string, unknown>
  const sys = ev['System'] as Record<string, unknown> | undefined

  if (!sys) return null

  // Provider name lives in an attribute: <Provider Name='nvlddmkm'/>
  const providerNode = sys['Provider'] as Record<string, unknown> | undefined
  const provider = providerNode?.['@_Name']
  if (typeof provider !== 'string' || !provider) return null

  // EventID — may be a plain number or an object when Qualifiers attribute present
  const eventIdRaw = sys['EventID']
  let event_id: number
  if (typeof eventIdRaw === 'number') {
    event_id = eventIdRaw
  } else if (typeof eventIdRaw === 'object' && eventIdRaw !== null) {
    // fast-xml-parser wraps elements with attributes as { '#text': N, '@_Qualifiers': '...' }
    const textVal = (eventIdRaw as Record<string, unknown>)['#text']
    event_id = typeof textVal === 'number' ? textVal : parseInt(String(textVal), 10)
  } else {
    event_id = parseInt(String(eventIdRaw), 10)
  }
  if (isNaN(event_id)) return null

  const level = mapLevel(sys['Level'])

  // TimeCreated carries the timestamp as an XML attribute
  const timeCreatedNode = sys['TimeCreated'] as Record<string, unknown> | undefined
  const ts = timeCreatedNode?.['@_SystemTime']
  if (typeof ts !== 'string' || !ts) return null

  // Channel / source
  const source = typeof sys['Channel'] === 'string' ? sys['Channel'] : 'System'

  // EventData/Data — may be a string, an array, or absent
  let message = ''
  const eventData = ev['EventData'] as Record<string, unknown> | undefined
  if (eventData) {
    const data = eventData['Data']
    if (typeof data === 'string') {
      message = data
    } else if (Array.isArray(data) && data.length > 0) {
      message = String(data[0])
    } else if (typeof data === 'object' && data !== null) {
      // Data element may have #text inside
      const text = (data as Record<string, unknown>)['#text']
      if (typeof text === 'string') {
        message = text
      }
    }
  }

  // Privacy rule: truncate message to 500 chars maximum
  if (message.length > 500) {
    message = message.slice(0, 500)
  }

  return {
    type: 'event',
    ts,
    source,
    provider,
    event_id,
    level,
    message,
    collected_at: new Date().toISOString(),
  }
}

// ── XML parser function — exported for unit testing ────────────────────────────

/**
 * Parse raw wevtutil XML output (multiple <Event> elements) into EventRecord[].
 * Wraps the fragments in a root <Events> element before parsing.
 * Returns [] on empty input or parse errors — never throws.
 */
export function parseWevtutilXml(xml: string): EventRecord[] {
  if (!xml.trim()) return []

  try {
    // wevtutil outputs individual <Event> elements without a root — wrap them
    const parsed = parser.parse(`<Events>${xml}</Events>`) as Record<string, unknown>
    const eventsNode = parsed['Events'] as Record<string, unknown> | undefined
    if (!eventsNode) return []

    const raw = eventsNode['Event']
    const events: unknown[] = Array.isArray(raw)
      ? raw
      : raw !== undefined && raw !== null
        ? [raw]
        : []

    const results: EventRecord[] = []
    for (const node of events) {
      const record = mapEventNode(node)
      if (record !== null) results.push(record)
    }
    return results
  } catch (err) {
    console.error('[collector:events] XML parse error', err)
    return []
  }
}

// ── Main collection function ───────────────────────────────────────────────────

/**
 * Collect Windows Event Log entries from System and Application channels
 * for the specified time range.
 *
 * startTime: earliest event to include
 * endTime: optional upper bound (wevtutil XPath only supports lower bound,
 *          so we filter in JavaScript after parsing)
 */
export async function collectEvents(
  startTime: Date,
  endTime?: Date
): Promise<EventRecord[]> {
  const [systemResult, appResult] = await Promise.all([
    queryEventLog('System', SYSTEM_EVENT_IDS, startTime),
    queryEventLog('Application', APP_EVENT_IDS, startTime),
  ])

  if (systemResult.exitCode !== 0 && systemResult.stderr) {
    console.error('[collector:events] wevtutil System query error', systemResult.stderr)
  }
  if (appResult.exitCode !== 0 && appResult.stderr) {
    console.error('[collector:events] wevtutil Application query error', appResult.stderr)
  }

  const systemEvents = parseWevtutilXml(systemResult.stdout)
  const appEvents = parseWevtutilXml(appResult.stdout)

  let combined = [...systemEvents, ...appEvents]

  // Filter by endTime if provided — wevtutil XPath only supports lower bound
  if (endTime) {
    const endMs = endTime.getTime()
    combined = combined.filter((e) => new Date(e.ts).getTime() <= endMs)
  }

  // Sort ascending by timestamp so rule packs can walk the timeline forward
  combined.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  return combined
}

// ── Health check ───────────────────────────────────────────────────────────────

/**
 * Test whether wevtutil.exe is reachable.
 * Returns { available: false, error: '...' } if the executable is missing.
 * Should never fail on any standard Windows machine — log a warning if it does.
 */
export async function getEventCollectionStatus(): Promise<{
  available: boolean
  error: string | null
}> {
  try {
    // Run a trivial enum-logs query — exits quickly with no output if no logs match
    const result = await queryEventLog(
      'System',
      [999999], // non-existent event ID — we just want wevtutil to respond
      new Date(Date.now() - 1000)
    )
    if (result.stderr.includes('not found') || result.stderr.includes('not recognized')) {
      console.warn('[collector:events] wevtutil.exe is not available on this machine')
      return { available: false, error: result.stderr }
    }
    return { available: true, error: null }
  } catch (err) {
    console.error('[collector:events] wevtutil availability check failed', err)
    return { available: false, error: String(err) }
  }
}
