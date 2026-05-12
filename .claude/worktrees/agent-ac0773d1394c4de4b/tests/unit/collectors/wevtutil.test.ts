import { describe, it, expect } from 'vitest'
import { buildXPathQuery } from '../../../src/collectors/wevtutil'

describe('buildXPathQuery', () => {
  it('produces a correct OR chain for multiple event IDs', () => {
    const query = buildXPathQuery([153, 14, 13], new Date('2024-01-15T14:00:00.000Z'))

    expect(query).toContain('EventID=153')
    expect(query).toContain('EventID=14')
    expect(query).toContain('EventID=13')
    expect(query).toContain(' or ')
    expect(query).toMatch(/EventID=153 or EventID=14 or EventID=13/)
  })

  it('embeds the correct ISO timestamp in the TimeCreated filter', () => {
    const ts = new Date('2024-01-15T14:00:00.000Z')
    const query = buildXPathQuery([153], ts)

    expect(query).toContain("TimeCreated[@SystemTime>='2024-01-15T14:00:00.000Z']")
  })

  it('produces valid XPath for a single event ID — no trailing "or"', () => {
    const query = buildXPathQuery([1002], new Date('2024-01-15T00:00:00.000Z'))

    expect(query).toContain('EventID=1002')
    // There must be no bare "or" hanging at the end of the filter
    expect(query).not.toMatch(/or\s*\)/)
    expect(query).not.toMatch(/or\s*$/)
    // The EventID part must appear exactly once
    expect((query.match(/EventID=/g) ?? []).length).toBe(1)
  })

  it('wraps the event ID list and time filter in a System[] predicate', () => {
    const query = buildXPathQuery([153, 141], new Date('2024-01-01T00:00:00.000Z'))

    // Full structure: *[System[(...) and TimeCreated[...]]]
    expect(query).toMatch(/^\*\[System\[/)
    expect(query).toMatch(/\]\]$/)
  })

  it('includes all eight system event IDs without duplication', () => {
    const ids = [153, 14, 13, 4101, 141, 1001, 2004, 1]
    const query = buildXPathQuery(ids, new Date())

    for (const id of ids) {
      expect(query).toContain(`EventID=${id}`)
    }
    // Each ID appears exactly once — use (?![0-9]) to avoid substring matches
    // e.g. EventID=1 must not match inside EventID=153 or EventID=14
    for (const id of ids) {
      expect((query.match(new RegExp(`EventID=${id}(?![0-9])`, 'g')) ?? []).length).toBe(1)
    }
  })
})
