import { createClient, type Client } from "@libsql/client";

function getDb(): Client {
  if (!process.env.TURSO_DATABASE_URL) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

let _db: Client | null = null;
function db(): Client {
  if (!_db) _db = getDb();
  return _db;
}

export async function initDb() {
  await db().executeMultiple(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number TEXT NOT NULL UNIQUE,
      case_name TEXT,
      case_url TEXT,
      internal_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS docket_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
      entry_date TEXT,
      event TEXT,
      filer TEXT,
      has_pdf INTEGER DEFAULT 0,
      pdf_postback_target TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(case_id, entry_date, event, filer)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
      entries_count INTEGER,
      sent_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export async function addCase(
  caseNumber: string,
  caseName: string | null,
  caseUrl: string | null,
  internalId: string | null
) {
  await initDb();
  const result = await db().execute({
    sql: "INSERT INTO cases (case_number, case_name, case_url, internal_id) VALUES (?, ?, ?, ?)",
    args: [caseNumber, caseName, caseUrl, internalId],
  });
  return result.lastInsertRowid;
}

export async function removeCase(id: number) {
  await db().execute({ sql: "DELETE FROM cases WHERE id = ?", args: [id] });
}

export async function getCases() {
  await initDb();
  const result = await db().execute("SELECT * FROM cases ORDER BY created_at DESC");
  return result.rows;
}

export async function getCase(id: number) {
  const result = await db().execute({
    sql: "SELECT * FROM cases WHERE id = ?",
    args: [id],
  });
  return result.rows[0] || null;
}

export async function getExistingEntries(caseId: number) {
  const result = await db().execute({
    sql: "SELECT entry_date, event, filer FROM docket_entries WHERE case_id = ?",
    args: [caseId],
  });
  return result.rows;
}

export async function insertEntry(
  caseId: number,
  entryDate: string,
  event: string,
  filer: string,
  hasPdf: boolean,
  pdfPostbackTarget: string | null
) {
  try {
    await db().execute({
      sql: `INSERT INTO docket_entries (case_id, entry_date, event, filer, has_pdf, pdf_postback_target)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [caseId, entryDate, event, filer, hasPdf ? 1 : 0, pdfPostbackTarget],
    });
    return true;
  } catch {
    // UNIQUE constraint violation = already exists
    return false;
  }
}

export async function recordAlert(caseId: number, entriesCount: number) {
  await db().execute({
    sql: "INSERT INTO alerts (case_id, entries_count) VALUES (?, ?)",
    args: [caseId, entriesCount],
  });
}

export async function getRecentAlerts(limit = 20) {
  await initDb();
  const result = await db().execute({
    sql: `SELECT a.*, c.case_number, c.case_name
          FROM alerts a JOIN cases c ON a.case_id = c.id
          ORDER BY a.sent_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows;
}

export async function getSetting(key: string): Promise<string | null> {
  await initDb();
  const result = await db().execute({
    sql: "SELECT value FROM settings WHERE key = ?",
    args: [key],
  });
  return result.rows[0]?.value as string | null;
}

export async function setSetting(key: string, value: string) {
  await initDb();
  await db().execute({
    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    args: [key, value],
  });
}

export default db;
export { db as getClient };
