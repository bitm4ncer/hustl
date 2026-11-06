import type { DatabaseSync } from 'node:sqlite'
import { splitDescriptionToItems } from './project-item-split'

/** Der Dank-Satz, mit dem der Angebots-Einleitungstext früher begann. */
const THANKS_PREFIX = /^\s*vielen dank für ihre anfrage[.!]?\s*/i

export function applyMigrations(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notion_id TEXT UNIQUE,
      name TEXT NOT NULL, address TEXT DEFAULT '', email TEXT DEFAULT '',
      hourly_rate REAL DEFAULT 0, no_tax INTEGER DEFAULT 0, vat_id TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS number_sequence (
      year INTEGER PRIMARY KEY,
      last_number INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      date TEXT NOT NULL,
      service_period_start TEXT, service_period_end TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL DEFAULT 0, tax_rate REAL DEFAULT 0, tax_amount REAL DEFAULT 0, total REAL DEFAULT 0,
      no_tax INTEGER DEFAULT 0, reverse_charge INTEGER DEFAULT 0,
      po_number TEXT, notes TEXT,
      pdf_path TEXT, hash TEXT, prev_hash TEXT, finalized_at TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      notion_task_id TEXT,
      position INTEGER NOT NULL,
      title TEXT NOT NULL, description TEXT DEFAULT '',
      quantity REAL, unit_price REAL, fix_price REAL,
      amount REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      invoice_id INTEGER, action TEXT NOT NULL, payload TEXT,
      prev_hash TEXT, hash TEXT
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notion_id TEXT UNIQUE,
      client_id INTEGER REFERENCES clients(id),
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      hours REAL, fix_price REAL,
      timeframe_start TEXT, timeframe_end TEXT,
      note TEXT DEFAULT '',
      sort_order INTEGER,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT DEFAULT '',
      category TEXT DEFAULT '',
      date TEXT NOT NULL,
      paid_at TEXT,
      gross REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 19,
      note TEXT DEFAULT '',
      pdf_path TEXT,
      source_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fixed_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      gross REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 0,
      interval TEXT NOT NULL DEFAULT 'monthly',
      start_date TEXT NOT NULL,
      end_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bank_connection (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      institution_id TEXT,
      requisition_id TEXT,
      access_token TEXT,
      refresh_token TEXT,
      access_expires TEXT,
      refresh_expires TEXT,
      account_ids TEXT,
      last_sync TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      counterparty TEXT DEFAULT '',
      remittance TEXT DEFAULT '',
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unmatched',
      matched_invoice_id INTEGER,
      matched_expense_id INTEGER,
      matched_fixed_cost_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bank_statements (
      year_month  TEXT PRIMARY KEY,
      pdf_path    TEXT NOT NULL,
      imported_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invoice_template (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE,
      kind TEXT NOT NULL DEFAULT 'angebot',
      client_id INTEGER REFERENCES clients(id),
      prospect_name TEXT DEFAULT '', prospect_email TEXT DEFAULT '',
      prospect_street TEXT DEFAULT '', prospect_zip TEXT DEFAULT '',
      prospect_city TEXT DEFAULT '', prospect_country TEXT DEFAULT '',
      prospect_vat_id TEXT DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      service_period_start TEXT, service_period_end TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      tax_mode TEXT NOT NULL DEFAULT 'regular',
      freibleibend INTEGER NOT NULL DEFAULT 0,
      discount_kind TEXT NOT NULL DEFAULT 'none',
      discount_value REAL NOT NULL DEFAULT 0,
      hourly_rate REAL NOT NULL DEFAULT 0,
      show_hours INTEGER NOT NULL DEFAULT 0,
      intro_text TEXT DEFAULT '', closing_text TEXT DEFAULT '',
      payment_schedule TEXT NOT NULL DEFAULT '{"depositPercent":0,"milestones":[]}',
      subtotal REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0, tax_amount REAL DEFAULT 0, total REAL DEFAULT 0,
      recurring_total REAL DEFAULT 0,
      accepted_at TEXT, accepted_by TEXT, acceptance_note TEXT,
      version INTEGER NOT NULL DEFAULT 1, parent_offer_id INTEGER,
      converted_project_id INTEGER, converted_invoice_id INTEGER,
      email_sent_at TEXT, email_recipient TEXT, pdf_path TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS offer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      section TEXT DEFAULT '',
      title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '',
      quantity REAL, unit TEXT DEFAULT '', unit_price REAL, fix_price REAL,
      amount REAL NOT NULL DEFAULT 0,
      optional INTEGER NOT NULL DEFAULT 0, recurring INTEGER NOT NULL DEFAULT 0,
      catalog_item_id INTEGER, internal_hours REAL
    );
    CREATE TABLE IF NOT EXISTS offer_number_sequence (
      year INTEGER PRIMARY KEY,
      last_number INTEGER NOT NULL
    );
  `)

  // Structured address columns + notes. The legacy `address` blob stays as a
  // backup; we only add columns idempotently so re-running is safe.
  const cols = (db.prepare('PRAGMA table_info(clients)').all() as Array<{ name: string }>).map((c) => c.name)
  const add: Array<[string, string]> = [
    ['street', "ALTER TABLE clients ADD COLUMN street TEXT DEFAULT ''"],
    ['zip', "ALTER TABLE clients ADD COLUMN zip TEXT DEFAULT ''"],
    ['city', "ALTER TABLE clients ADD COLUMN city TEXT DEFAULT ''"],
    ['country', "ALTER TABLE clients ADD COLUMN country TEXT DEFAULT ''"],
    ['notes', "ALTER TABLE clients ADD COLUMN notes TEXT DEFAULT ''"],
    ['contact_person', "ALTER TABLE clients ADD COLUMN contact_person TEXT DEFAULT ''"],
    ['address_extra', "ALTER TABLE clients ADD COLUMN address_extra TEXT DEFAULT ''"],
    ['country_code', "ALTER TABLE clients ADD COLUMN country_code TEXT DEFAULT ''"],
    ['currency', "ALTER TABLE clients ADD COLUMN currency TEXT DEFAULT ''"],
    ['language', "ALTER TABLE clients ADD COLUMN language TEXT DEFAULT ''"],
    ['tax_mode', "ALTER TABLE clients ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'standard'"]
  ]
  for (const [name, ddl] of add) if (!cols.includes(name)) db.exec(ddl)

  // Internationale Rechnungsfelder: Belegwährung, Kurs zu EUR, Steuerart,
  // Dokumentensprache. Idempotent wie oben.
  const intlOfferCols = (
    db.prepare('PRAGMA table_info(offers)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  for (const [name, ddl] of [
    ['currency', "ALTER TABLE offers ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'"],
    ['exchange_rate', 'ALTER TABLE offers ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1'],
    ['language', "ALTER TABLE offers ADD COLUMN language TEXT NOT NULL DEFAULT 'de'"]
  ] as Array<[string, string]>) {
    if (!intlOfferCols.includes(name)) db.exec(ddl)
  }

  // Link invoice items back to the project they were generated from. Added
  // idempotently via the same PRAGMA-checked ALTER pattern as the client columns.
  const itemCols = (
    db.prepare('PRAGMA table_info(invoice_items)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!itemCols.includes('project_id')) {
    db.exec('ALTER TABLE invoice_items ADD COLUMN project_id INTEGER')
  }

  // Zahlungsdatum für die Cash-Basis / "Bezahlt"-Toggle. Idempotenter ALTER.
  const invCols = (
    db.prepare('PRAGMA table_info(invoices)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!invCols.includes('paid_at')) {
    db.exec('ALTER TABLE invoices ADD COLUMN paid_at TEXT')
  }

  // E-Mail-Versand-Metadaten. Idempotenter ALTER wie oben.
  for (const c of ['email_sent_at', 'email_recipient']) {
    if (!invCols.includes(c)) db.exec(`ALTER TABLE invoices ADD COLUMN ${c} TEXT`)
  }

  // Internationale Rechnungsfelder: Belegwährung, Kurs zu EUR, Steuerart,
  // Dokumentensprache. Idempotent wie oben.
  for (const [name, ddl] of [
    ['currency', "ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'"],
    ['exchange_rate', 'ALTER TABLE invoices ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1'],
    ['tax_mode', "ALTER TABLE invoices ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'standard'"],
    ['language', "ALTER TABLE invoices ADD COLUMN language TEXT NOT NULL DEFAULT 'de'"]
  ] as Array<[string, string]>) {
    if (!invCols.includes(name)) db.exec(ddl)
  }

  // Bestandsdaten: bisheriges "no_tax" war faktisch eine §19-Rechnung.
  // Reverse-Charge-Rechnungen gab es damals noch nicht, der DB-Wert bleibt
  // aber für den Fall alter/manuell gesetzter Daten erhalten.
  db.exec(`
    UPDATE clients SET tax_mode = 'small_business'
      WHERE no_tax = 1 AND tax_mode = 'standard';
    UPDATE invoices SET tax_mode = 'small_business'
      WHERE no_tax = 1 AND reverse_charge = 0 AND tax_mode = 'standard';
    UPDATE invoices SET tax_mode = 'reverse_charge'
      WHERE reverse_charge = 1 AND tax_mode = 'standard';
  `)

  // Fremdwährungs-Belege: Originalbetrag + -währung für den Bank-Abgleich.
  // EUR bleibt Leitwährung — `gross` ist immer EUR. Idempotenter ALTER wie oben.
  const expCols = (
    db.prepare('PRAGMA table_info(expenses)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!expCols.includes('original_amount')) {
    db.exec('ALTER TABLE expenses ADD COLUMN original_amount REAL')
  }
  if (!expCols.includes('original_currency')) {
    db.exec("ALTER TABLE expenses ADD COLUMN original_currency TEXT NOT NULL DEFAULT 'EUR'")
  }
  // SHA-256 der hochgeladenen PDF — verhindert doppelte Belege in den Büchern.
  if (!expCols.includes('file_hash')) {
    db.exec('ALTER TABLE expenses ADD COLUMN file_hash TEXT')
  }

  // Storno-Dokument: Nummer der stornierten Rechnung (Bezug im PDF + E-Rechnung).
  if (!invCols.includes('corrects_number')) {
    db.exec('ALTER TABLE invoices ADD COLUMN corrects_number TEXT')
  }

  // Einfache Checkliste (Shopping, Groceries, Tasks, Weeklys).
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_categories (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      weekly   INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS todos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'tasks',
      category_id INTEGER,
      done        INTEGER NOT NULL DEFAULT 0,
      done_at     TEXT,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO todo_categories (name, weekly, position)
      SELECT 'Shopping', 0, 1 WHERE NOT EXISTS (SELECT 1 FROM todo_categories);
    INSERT INTO todo_categories (name, weekly, position)
      SELECT 'Groceries', 0, 2 WHERE (SELECT COUNT(*) FROM todo_categories) = 1;
    INSERT INTO todo_categories (name, weekly, position)
      SELECT 'Tasks', 0, 3 WHERE (SELECT COUNT(*) FROM todo_categories) = 2;
    INSERT INTO todo_categories (name, weekly, position)
      SELECT 'Weeklys', 1, 4 WHERE (SELECT COUNT(*) FROM todo_categories) = 3;
  `)
  // Zurücksetz-Regel (nie / wöchentlich / monatlich) + Tag. Idempotente ALTERs.
  const catCols = (
    db.prepare('PRAGMA table_info(todo_categories)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!catCols.includes('reset_rule')) {
    db.exec("ALTER TABLE todo_categories ADD COLUMN reset_rule TEXT NOT NULL DEFAULT 'none'")
  }
  if (!catCols.includes('reset_day')) {
    db.exec('ALTER TABLE todo_categories ADD COLUMN reset_day INTEGER')
  }
  // Gruppe: Planer (Tage), Regelmäßig (mit Reset), Liste (frei).
  const groupIsNew = !catCols.includes('group_name')
  if (groupIsNew) {
    db.exec("ALTER TABLE todo_categories ADD COLUMN group_name TEXT NOT NULL DEFAULT 'list'")
  }
  // Alte "weekly"-Kategorien auf die neue Regel heben (Montag).
  db.exec(`
    UPDATE todo_categories SET reset_rule = 'weekly', reset_day = 1
      WHERE weekly = 1 AND reset_rule = 'none';
  `)
  // Neue Standard-Kategorie "Daily" direkt über "Weeklys" (nur einmal).
  db.exec(`
    UPDATE todo_categories SET position = position + 1
      WHERE name = 'Weeklys'
        AND NOT EXISTS (SELECT 1 FROM todo_categories WHERE name = 'Daily');
    INSERT INTO todo_categories (name, weekly, reset_rule, reset_day, position)
      SELECT 'Daily', 0, 'daily', NULL,
             (SELECT position FROM todo_categories WHERE name = 'Weeklys') - 1
      WHERE NOT EXISTS (SELECT 1 FROM todo_categories WHERE name = 'Daily');
  `)
  if (groupIsNew) {
    db.exec(`
      UPDATE todo_categories SET group_name = 'planner' WHERE name = 'Tasks';
      UPDATE todo_categories SET group_name = 'regular' WHERE name IN ('Daily', 'Weeklys');
    `)
  }
  // Planer-Einträge bekommen ein Datum; bestehende auf heute legen.
  const planCols = (
    db.prepare('PRAGMA table_info(todos)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!planCols.includes('date')) {
    db.exec('ALTER TABLE todos ADD COLUMN date TEXT')
  }
  if (!planCols.includes('notes')) {
    db.exec('ALTER TABLE todos ADD COLUMN notes TEXT')
  }
  // Genaue Zeitstempel: created_at existiert bereits, done_ts kommt dazu.
  if (!planCols.includes('done_ts')) {
    db.exec('ALTER TABLE todos ADD COLUMN done_ts TEXT')
  }
  db.exec(`
    UPDATE todos SET date = date('now','localtime')
      WHERE date IS NULL
        AND category_id IN (SELECT id FROM todo_categories WHERE group_name = 'planner');
    CREATE TABLE IF NOT EXISTS todo_periods (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id  INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      total        INTEGER NOT NULL,
      done         INTEGER NOT NULL,
      completed    INTEGER NOT NULL DEFAULT 0,
      UNIQUE (category_id, period_start)
    );
  `)
  // Bestehende To-Dos (aus der ersten Version mit fester Kategorie) zuordnen.
  const todoCols = (
    db.prepare('PRAGMA table_info(todos)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!todoCols.includes('category_id')) {
    db.exec('ALTER TABLE todos ADD COLUMN category_id INTEGER')
  }
  db.exec(`
    UPDATE todos SET category_id = (SELECT id FROM todo_categories WHERE name = 'Shopping')
      WHERE category_id IS NULL AND category = 'shopping';
    UPDATE todos SET category_id = (SELECT id FROM todo_categories WHERE name = 'Groceries')
      WHERE category_id IS NULL AND category = 'groceries';
    UPDATE todos SET category_id = (SELECT id FROM todo_categories WHERE name = 'Tasks')
      WHERE category_id IS NULL AND category = 'tasks';
    UPDATE todos SET category_id = (SELECT id FROM todo_categories WHERE name = 'Weeklys')
      WHERE category_id IS NULL AND category = 'weekly';
    UPDATE todos SET category_id = (SELECT MIN(id) FROM todo_categories) WHERE category_id IS NULL;
  `)

  // Interner Stundensatz auf Angeboten (für Stunden-Positionen). Idempotenter
  // ALTER für DBs, die vor dieser Spalte angelegt wurden.
  const offerCols = (
    db.prepare('PRAGMA table_info(offers)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (offerCols.length > 0 && !offerCols.includes('hourly_rate')) {
    db.exec('ALTER TABLE offers ADD COLUMN hourly_rate REAL NOT NULL DEFAULT 0')
  }
  if (offerCols.length > 0 && !offerCols.includes('show_hours')) {
    db.exec('ALTER TABLE offers ADD COLUMN show_hours INTEGER NOT NULL DEFAULT 0')
  }

  // Ansprechpartner + freie Zusatzzeile der Empfänger-Kopie (Interessenten ohne
  // Kundendatensatz). Gleiche Felder wie auf dem Kunden. Idempotenter ALTER.
  for (const c of ['prospect_contact_person', 'prospect_address_extra']) {
    if (offerCols.length > 0 && !offerCols.includes(c)) {
      db.exec(`ALTER TABLE offers ADD COLUMN ${c} TEXT DEFAULT ''`)
    }
  }

  // Status-Vereinfachung: die früheren Stadien `Ongoing` (Laufend) und `Wrap-up`
  // (Abschluss) wurden in `On Hold` ("Pausiert") zusammengefasst. Idempotent —
  // nach dem ersten Lauf matcht keine Zeile mehr.
  db.exec("UPDATE projects SET status = 'On Hold' WHERE status IN ('Ongoing', 'Wrap-up')")

  // Manuelle Sortier-Reihenfolge der Projektliste (Drag-and-drop). Beim ersten
  // Hinzufügen der Spalte einmalig mit der aktuellen Anzeige-Reihenfolge
  // (neueste zuerst) befüllen, damit nichts sichtbar umspringt; danach vom
  // Nutzer per Ziehen steuerbar.
  const projCols = (
    db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!projCols.includes('sort_order')) {
    db.exec('ALTER TABLE projects ADD COLUMN sort_order INTEGER')
    db.exec(`UPDATE projects SET sort_order = (
      SELECT rn FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(timeframe_start, '') DESC, id DESC) AS rn FROM projects
      ) t WHERE t.id = projects.id
    )`)
  }

  // Bank transactions can also be reconciled against a fixed cost (e.g. KSK).
  // Idempotent ALTER for DBs created before this column existed.
  const txCols = (
    db.prepare('PRAGMA table_info(bank_transactions)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!txCols.includes('matched_fixed_cost_id')) {
    db.exec('ALTER TABLE bank_transactions ADD COLUMN matched_fixed_cost_id INTEGER')
  }

  // Projekt-Positionen: strukturierte Leistungsliste pro Projekt (reine
  // Aufschlüsselung — Beträge kommen weiterhin aus Stunden × Satz / Festpreis).
  // Beim ersten Anlegen der Tabelle werden bestehende Freitext-Beschreibungen
  // einmalig an Stichpunkt-Zeilen zerlegt; die description-Spalte bleibt als
  // Backup unangetastet, die UI zeigt fortan nur noch die Positionen.
  const hasProjectItems = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_items'")
    .get() as { name: string } | undefined
  if (!hasProjectItems) {
    db.exec(`
      CREATE TABLE project_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        hours REAL
      );
    `)
    const rows = db
      .prepare("SELECT id, description FROM projects WHERE TRIM(COALESCE(description, '')) != ''")
      .all() as Array<{ id: number; description: string }>
    const ins = db.prepare(
      'INSERT INTO project_items (project_id, position, title, description, hours) VALUES (?, ?, ?, ?, NULL)'
    )
    for (const r of rows) {
      splitDescriptionToItems(r.description).forEach((text, idx) => ins.run(r.id, idx, '', text))
    }
  }

  // Unterzeilen eines Rechnungspostens (JSON-Array aus {title, description,
  // hours}) — rein darstellend fürs PDF, die E-Rechnung bleibt unberührt.
  if (!itemCols.includes('sub_items')) {
    db.exec('ALTER TABLE invoice_items ADD COLUMN sub_items TEXT')
  }

  stripOfferIntroThanks(db)

  // --- Authentifizierung (Passkey + Sessions) --------------------------------
  // Idempotent: bestehende Installationen bekommen die Tabellen beim nächsten
  // Start, ohne dass Daten angefasst werden.
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_credentials (
      id            TEXT PRIMARY KEY,
      public_key    BLOB NOT NULL,
      counter       INTEGER NOT NULL DEFAULT 0,
      transports    TEXT,
      label         TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id          TEXT PRIMARY KEY,
      kind        TEXT NOT NULL,
      challenge   TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id           TEXT PRIMARY KEY,
      token_hash   TEXT NOT NULL UNIQUE,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      user_agent   TEXT,
      ip           TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_recovery (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL,
      used_at   TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_bootstrap (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      token_hash  TEXT,
      consumed_at TEXT
    );
  `)
}

/**
 * Der Angebots-Einleitungstext beginnt nicht mehr mit „Vielen Dank für Ihre
 * Anfrage." Bereits gespeicherte Einstellungen ziehen mit: der Satz fliegt
 * vorne raus, der Rest bleibt so, wie der Nutzer ihn formuliert hat.
 * Idempotent: nach dem ersten Lauf findet das Muster nichts mehr.
 */
function stripOfferIntroThanks(db: DatabaseSync): void {
  const row = db.prepare('SELECT data FROM settings WHERE id = 1').get() as
    | { data: string }
    | undefined
  if (!row) return
  const data = JSON.parse(row.data) as Record<string, unknown>
  const intro = data.offerIntroText
  if (typeof intro !== 'string') return
  const stripped = intro.replace(THANKS_PREFIX, '').trimStart()
  if (stripped === intro) return
  data.offerIntroText = stripped
  db.prepare('UPDATE settings SET data = ? WHERE id = 1').run(JSON.stringify(data))
}
