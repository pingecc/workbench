import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(join(app.getPath('userData'), 'workbench.db'))
    db.pragma('journal_mode = WAL')
    migrate(db)
  }
  return db
}

function migrate(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS scripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        kind TEXT NOT NULL DEFAULT 'file',
        path TEXT NOT NULL,
        cwd TEXT NOT NULL DEFAULT '',
        shell TEXT NOT NULL DEFAULT 'zsh',
        icon TEXT NOT NULL DEFAULT '📜',
        color TEXT NOT NULL DEFAULT 'blue',
        confirm INTEGER NOT NULL DEFAULT 0,
        run_count INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        tech_stack TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        icon TEXT NOT NULL DEFAULT '📁',
        remote_url TEXT NOT NULL DEFAULT '',
        branch TEXT NOT NULL DEFAULT '',
        last_commit TEXT NOT NULL DEFAULT '',
        dirty INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS run_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        script_id INTEGER NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        exit_code INTEGER,
        duration_ms INTEGER,
        output TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL,
        finished_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_scripts_group ON scripts(group_id);
      CREATE INDEX IF NOT EXISTS idx_run_history_script ON run_history(script_id);
    `)
    db.pragma('user_version = 1')
  }

  if (version < 2) {
    const cols = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === 'icon')) {
      db.exec("ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT '📁'")
    }
    db.pragma('user_version = 2')
  }

  if (version < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'idea',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL DEFAULT 0,
        due_date TEXT,
        priority TEXT NOT NULL DEFAULT 'mid',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
      CREATE INDEX IF NOT EXISTS idx_notes_done ON notes(done);
    `)
    db.pragma('user_version = 3')
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function jsonGet<T>(db: Database.Database, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function jsonSet(db: Database.Database, key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value))
}
