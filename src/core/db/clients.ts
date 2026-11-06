import type { DatabaseSync } from 'node:sqlite'
import type { Client, TaxMode } from '@shared/types'

type ClientDefaults = Pick<Client, 'countryCode' | 'currency' | 'language' | 'taxMode'>
export type ClientInput = Omit<Client, 'id' | keyof ClientDefaults> & Partial<ClientDefaults>

export function clientNoTax(taxMode: TaxMode | string | null | undefined): number {
  return taxMode === 'small_business' || taxMode === 'exempt' ? 1 : 0
}

function normalizeTaxMode(value: unknown, noTax: unknown): TaxMode {
  if (
    value === 'standard' ||
    value === 'reduced' ||
    value === 'zero' ||
    value === 'reverse_charge' ||
    value === 'small_business' ||
    value === 'exempt'
  ) {
    return value
  }
  return noTax ? 'small_business' : 'standard'
}

function rowToClient(r: any): Client {
  return {
    id: r.id,
    notionId: r.notion_id,
    name: r.name,
    contactPerson: r.contact_person ?? '',
    addressExtra: r.address_extra ?? '',
    address: r.address,
    street: r.street ?? '',
    zip: r.zip ?? '',
    city: r.city ?? '',
    country: r.country ?? '',
    countryCode: r.country_code ?? '',
    currency: r.currency ?? '',
    language: (r.language ?? '') as Client['language'],
    taxMode: normalizeTaxMode(r.tax_mode, r.no_tax),
    email: r.email,
    hourlyRate: r.hourly_rate,
    noTax: !!r.no_tax,
    vatId: r.vat_id,
    notes: r.notes ?? ''
  }
}

const CLIENT_COLUMNS =
  'notion_id, name, contact_person, address_extra, address, street, zip, city, country, country_code, currency, language, tax_mode, email, hourly_rate, no_tax, vat_id, notes'

function values(c: ClientInput): Record<string, string | number | null> {
  const taxMode = c.taxMode ?? ''
  return {
    notionId: c.notionId,
    name: c.name,
    contactPerson: c.contactPerson,
    addressExtra: c.addressExtra,
    address: c.address,
    street: c.street,
    zip: c.zip,
    city: c.city,
    country: c.country,
    countryCode: c.countryCode ?? '',
    currency: c.currency ?? '',
    language: c.language ?? '',
    taxMode,
    email: c.email,
    hourlyRate: c.hourlyRate,
    noTax: c.taxMode ? clientNoTax(taxMode) : c.noTax ? 1 : 0,
    vatId: c.vatId,
    notes: c.notes
  }
}

const INSERT_SQL = `
  INSERT INTO clients (${CLIENT_COLUMNS})
  VALUES (@notionId, @name, @contactPerson, @addressExtra, @address, @street, @zip, @city, @country, @countryCode, @currency, @language, COALESCE(NULLIF(@taxMode,''), 'standard'), @email, @hourlyRate, @noTax, @vatId, @notes)
`

export function upsertClientByNotionId(db: DatabaseSync, c: ClientInput): void {
  // On conflict we overwrite the simple fields, but for the structured address
  // and notes we only overwrite when the incoming value is non-empty — so a
  // Notion re-import never wipes a user's hand-edited structured fields.
  db.prepare(
    `${INSERT_SQL}
     ON CONFLICT(notion_id) DO UPDATE SET
      name=@name, address=@address, email=@email, hourly_rate=@hourlyRate, no_tax=@noTax, vat_id=@vatId,
      country_code=COALESCE(NULLIF(@countryCode,''), country_code),
      currency=COALESCE(NULLIF(@currency,''), currency),
      language=COALESCE(NULLIF(@language,''), language),
      tax_mode=COALESCE(NULLIF(@taxMode,''), tax_mode),
      contact_person=COALESCE(NULLIF(@contactPerson,''), contact_person),
      address_extra=COALESCE(NULLIF(@addressExtra,''), address_extra),
      street=COALESCE(NULLIF(@street,''), street),
      zip=COALESCE(NULLIF(@zip,''), zip),
      city=COALESCE(NULLIF(@city,''), city),
      country=COALESCE(NULLIF(@country,''), country),
      notes=COALESCE(NULLIF(@notes,''), notes)
    `,
  ).run(values(c))
}

export function listClients(db: DatabaseSync): Client[] {
  return (db.prepare('SELECT * FROM clients ORDER BY name').all() as any[]).map(rowToClient)
}

export function getClientById(db: DatabaseSync, id: number): Client | null {
  const r = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any
  return r ? rowToClient(r) : null
}

export function createClient(db: DatabaseSync, c: ClientInput): number {
  const info = db.prepare(INSERT_SQL).run(values(c))
  return Number(info.lastInsertRowid)
}

export function updateClient(db: DatabaseSync, id: number, c: ClientInput): void {
  // node:sqlite rejects bind keys not referenced in the SQL, so we pass an
  // explicit object (notably WITHOUT notionId, which this UPDATE never touches)
  // rather than spreading the whole ClientInput.
  const v = values(c)
  delete v.notionId
  db.prepare(
    `
    UPDATE clients SET name=@name, contact_person=@contactPerson, address_extra=@addressExtra,
      address=@address, street=@street, zip=@zip, city=@city,
      country=@country, country_code=@countryCode, currency=@currency, language=@language,
      tax_mode=COALESCE(NULLIF(@taxMode,''), tax_mode), email=@email, hourly_rate=@hourlyRate, no_tax=@noTax, vat_id=@vatId,
      notes=@notes WHERE id=@id
  `,
  ).run({ ...v, id })
}
