import Database from 'better-sqlite3'
import { readFileSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'

let db: Database.Database | null = null

function resolveDbPath(): string {
  if (process.env['VITEST']) return ':memory:'
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron')
  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  return join(userDataPath, 'blackbox.db')
}

function getMigrationsDir(): string {
  if (process.env['VITEST']) {
    return join(process.cwd(), 'src', 'db', 'migrations')
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron')
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(process.cwd(), 'src', 'db', 'migrations')
}

function runMigrations(database: Database.Database): void {
  database.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT NOT NULL UNIQUE,
    applied_at  TEXT NOT NULL
  )`)

  const migrationsDir = getMigrationsDir()
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const filename of files) {
    const already = database
      .prepare('SELECT id FROM _migrations WHERE filename = ?')
      .get(filename)

    if (!already) {
      const sql = readFileSync(join(migrationsDir, filename), 'utf-8')
      database.exec(sql)
      database
        .prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)')
        .run(filename, new Date().toISOString())
    }
  }
}

export function initDatabase(): Database.Database {
  if (db) return db
  const path = resolveDbPath()
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('[db] Not initialized — call initDatabase() first')
  return db
}

export function _resetForTesting(): void {
  if (db) {
    db.close()
    db = null
  }
}
