import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, _resetForTesting } from '../../../src/db/schema'
import {
  initSettings,
  getSettings,
  setTelemetryOptIn,
  markFirstLaunchComplete,
} from '../../../src/db/settings'

beforeEach(() => {
  initDatabase()
})

afterEach(() => {
  _resetForTesting()
})

describe('initSettings', () => {
  it('creates the settings row when missing', () => {
    initSettings('1.0.0')
    const settings = getSettings()
    expect(settings.app_version).toBe('1.0.0')
    expect(settings.telemetry_opt_in).toBe(false)
    expect(settings.first_launch_complete).toBe(false)
    expect(settings.anonymous_session_id).toBeTruthy()
  })

  it('does not create a duplicate row when called twice', () => {
    initSettings('1.0.0')
    const first = getSettings()
    initSettings('2.0.0')
    const second = getSettings()

    expect(second.anonymous_session_id).toBe(first.anonymous_session_id)
    expect(second.app_version).toBe('1.0.0')
  })

  it('generates a unique anonymous_session_id each installation', () => {
    initSettings('1.0.0')
    const id1 = getSettings().anonymous_session_id

    _resetForTesting()
    initDatabase()
    initSettings('1.0.0')
    const id2 = getSettings().anonymous_session_id

    expect(id1).not.toBe(id2)
  })
})

describe('getSettings', () => {
  it('returns the correct row after init', () => {
    initSettings('1.2.3')
    const settings = getSettings()
    expect(settings.app_version).toBe('1.2.3')
  })

  it('throws if called before initSettings', () => {
    expect(() => getSettings()).toThrow('[db:settings]')
  })
})

describe('setTelemetryOptIn', () => {
  it('persists true correctly', () => {
    initSettings('1.0.0')
    setTelemetryOptIn(true)
    expect(getSettings().telemetry_opt_in).toBe(true)
  })

  it('persists false correctly', () => {
    initSettings('1.0.0')
    setTelemetryOptIn(true)
    setTelemetryOptIn(false)
    expect(getSettings().telemetry_opt_in).toBe(false)
  })
})

describe('markFirstLaunchComplete', () => {
  it('sets first_launch_complete to true', () => {
    initSettings('1.0.0')
    expect(getSettings().first_launch_complete).toBe(false)
    markFirstLaunchComplete()
    expect(getSettings().first_launch_complete).toBe(true)
  })
})
