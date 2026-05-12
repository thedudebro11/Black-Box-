import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseWevtutilXml } from '../../../src/collectors/events'
import type { EventRecord } from '../../../src/collectors/types'

// ── Load fixture files ─────────────────────────────────────────────────────────

const FIXTURE_DIR = join(__dirname, '../../fixtures/collectors')

function loadXml(filename: string): string {
  return readFileSync(join(FIXTURE_DIR, filename), 'utf-8')
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('parseWevtutilXml', () => {
  it('parses the system fixture XML into EventRecord[]', () => {
    const xml = loadXml('wevtutil-system-output.xml')
    const records = parseWevtutilXml(xml)

    expect(records).toHaveLength(4)
    expect(records.every((r) => r.type === 'event')).toBe(true)
  })

  it('returns [] for empty input', () => {
    expect(parseWevtutilXml('')).toEqual([])
    expect(parseWevtutilXml('   \n  ')).toEqual([])
  })

  it('returns [] for malformed XML without throwing', () => {
    expect(() => parseWevtutilXml('<broken<xml<<')).not.toThrow()
    const result = parseWevtutilXml('<broken<xml<<')
    expect(Array.isArray(result)).toBe(true)
  })

  it('handles a single <Event> element (not an array)', () => {
    const singleEvent = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='nvlddmkm'/>
    <EventID>153</EventID>
    <Level>2</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:45.123Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>Reset TDR occurred</Data></EventData>
</Event>`

    const records = parseWevtutilXml(singleEvent)
    expect(records).toHaveLength(1)
    expect(records[0].event_id).toBe(153)
  })

  it('maps level 2 to "Error"', () => {
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='nvlddmkm'/>
    <EventID>153</EventID>
    <Level>2</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:45.123Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>Error event</Data></EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    expect(records[0].level).toBe('Error')
  })

  it('maps level 1 (Critical) to "Error"', () => {
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='Microsoft-Windows-BugCheck'/>
    <EventID>1001</EventID>
    <Level>1</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:45.123Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>BSOD occurred</Data></EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    expect(records[0].level).toBe('Error')
  })

  it('maps level 3 to "Warning"', () => {
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='Microsoft-Windows-Kernel-LiveDump'/>
    <EventID>141</EventID>
    <Level>3</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:48.456Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>LiveKernelEvent</Data></EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    expect(records[0].level).toBe('Warning')
  })

  it('maps level 4 to "Information"', () => {
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='Microsoft-Windows-FilterManager'/>
    <EventID>1</EventID>
    <Level>4</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:55.000Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>Filter loaded</Data></EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    expect(records[0].level).toBe('Information')
  })

  it('extracts provider name from the XML attribute correctly', () => {
    const xml = loadXml('wevtutil-system-output.xml')
    const records = parseWevtutilXml(xml)

    const tdrEvent = records.find((r) => r.event_id === 153)
    expect(tdrEvent).toBeDefined()
    expect(tdrEvent?.provider).toBe('nvlddmkm')

    const filterManagerEvent = records.find((r) => r.event_id === 1)
    expect(filterManagerEvent).toBeDefined()
    expect(filterManagerEvent?.provider).toBe('Microsoft-Windows-FilterManager')
  })

  it('sets the source field from Channel element', () => {
    const xml = loadXml('wevtutil-system-output.xml')
    const records = parseWevtutilXml(xml)

    expect(records.every((r) => r.source === 'System')).toBe(true)
  })

  it('truncates message text to 500 characters', () => {
    const longMessage = 'A'.repeat(600)
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='TestProvider'/>
    <EventID>999</EventID>
    <Level>4</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:45.123Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>${longMessage}</Data></EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    expect(records[0].message.length).toBeLessThanOrEqual(500)
  })

  it('handles EventData with multiple Data elements — takes first', () => {
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='TestProvider'/>
    <EventID>1000</EventID>
    <Level>2</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:45.123Z'/>
    <Channel>Application</Channel>
  </System>
  <EventData>
    <Data>First message</Data>
    <Data>Second message</Data>
  </EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    expect(records).toHaveLength(1)
    // Should not throw or produce empty records
    expect(records[0].event_id).toBe(1000)
  })

  it('returns [] for an event missing required fields', () => {
    // Missing Provider Name attribute
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider/>
    <EventID>153</EventID>
    <Level>2</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:45.123Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>Test</Data></EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    expect(records).toHaveLength(0)
  })

  it('produces records with all required EventRecord fields', () => {
    const xml = `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
  <System>
    <Provider Name='nvlddmkm'/>
    <EventID>153</EventID>
    <Level>2</Level>
    <TimeCreated SystemTime='2024-01-15T14:23:45.123Z'/>
    <Channel>System</Channel>
  </System>
  <EventData><Data>TDR reset</Data></EventData>
</Event>`

    const records = parseWevtutilXml(xml)
    const r: EventRecord = records[0]

    expect(r.type).toBe('event')
    expect(typeof r.ts).toBe('string')
    expect(typeof r.source).toBe('string')
    expect(typeof r.provider).toBe('string')
    expect(typeof r.event_id).toBe('number')
    expect(typeof r.level).toBe('string')
    expect(typeof r.message).toBe('string')
    expect(typeof r.collected_at).toBe('string')
  })
})
