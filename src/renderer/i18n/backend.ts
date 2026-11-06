import { getLanguage } from './index'

/**
 * The core and the server produce German business errors. The UI translates
 * the messages it knows here, so an English session never shows a stray
 * German sentence. Unknown messages are passed through unchanged.
 */
const EN_TO_DE: Record<string, string> = {
  'Registration not verified': 'Registrierung nicht bestätigt.',
  'Authentication not verified': 'Anmeldung nicht bestätigt.',
  'Login required': 'Anmeldung erforderlich.',
  'Too many attempts': 'Zu viele Versuche.',
  'Too many requests': 'Zu viele Anfragen.',
  'Too many uploads': 'Zu viele Dateiübertragungen.',
  'Too many exports': 'Zu viele Exporte.',
  'Missing assertion': 'Bestätigung fehlt.',
  'Challenge expired': 'Anfrage abgelaufen.',
  'Unknown credential': 'Unbekannter Zugangsschlüssel.',
  'Verification failed': 'Bestätigung fehlgeschlagen.',
  'Setup token required': 'Einrichtungscode erforderlich.',
  'Missing attestation': 'Bescheinigung fehlt.',
  'Registration failed': 'Registrierung fehlgeschlagen.',
  'Invalid code': 'Ungültiger Code.',
  'No session': 'Keine Sitzung.',
  'Not found': 'Nicht gefunden.',
  'Unsupported file type': 'Dateityp wird nicht unterstützt.',
  'No file': 'Keine Datei.',
  'Archive already running': 'Archivierung läuft bereits.',
  'Invalid month': 'Ungültiger Monat.',
  'Unknown export part': 'Unbekannter Export-Teil.',
  'Internal error': 'Interner Fehler.',
  'Request failed': 'Anfrage fehlgeschlagen.',
  'Upload failed': 'Hochladen fehlgeschlagen.',
  'Unknown method': 'Unbekannte Methode.',
  'Invalid arguments': 'Ungültige Argumente.',
}

const EXACT: Record<string, string> = {
  'Bitte zuerst einen Kunden wählen.': 'Please select a client first.',
  'Ungültiges Datum.': 'Invalid date.',
  'Ein Planer-Eintrag braucht einen Text.': 'A planner entry needs a title.',
  'Eine Kategorie braucht einen Namen.': 'A category needs a name.',
  'Nur Entwürfe können finalisiert werden.': 'Only drafts can be finalized.',
  'Nur finalisierte Rechnungen können neu erzeugt werden.':
    'Only finalized invoices can be regenerated.',
  'Ein Entwurf wird direkt bearbeitet, nicht storniert.':
    'A draft is edited directly, not cancelled.',
  'Diese Rechnung ist bereits storniert.': 'This invoice is already cancelled.',
  'Rechnung ist nicht im Entwurfsstatus - keine Nummer vergeben.':
    'The invoice is not in draft status — no number has been assigned.',
  'Angebot hat keinen Empfängernamen. Bitte zuerst im Angebot ergänzen.':
    'The quote has no recipient name. Please add one first.',
  'Angebot enthält keine verbindliche Position.':
    'The quote does not contain a binding line item.',
  'Kein Kontoauszug für diesen Monat': 'No bank statement for this month.',
  'Mindestens eine Position mit Preis ist erforderlich.':
    'At least one line item with a price is required.',
  'Verkäufer-Adresse unvollständig (Straße, PLZ, Ort in den Einstellungen).':
    'Seller address incomplete (street, postcode and city in Settings).',
  'Verkäufer-Land unbekannt (ISO-Ländercode in den Einstellungen, z. B. DE).':
    'Seller country unknown (ISO country code in Settings, e.g. DE).',
  'Verkäufer-USt-IdNr. fehlt (in den Einstellungen hinterlegen).':
    'Seller VAT ID missing (add it in Settings).',
  'Kunde: Adresse unvollständig (Straße und Ort nötig).':
    'Client: address incomplete (street and city required).',
  'Reverse-Charge: USt-IdNr. des Kunden ist Pflicht.':
    'Reverse charge: the client’s VAT ID is required.',
}

const PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /^Angebot (\d+) nicht gefunden$/,
    (m) => `Quote ${m[1]} not found`,
  ],
  [
    /^Statuswechsel (.+) → (.+) ist nicht erlaubt\.$/,
    (m) => `Status change ${m[1]} → ${m[2]} is not allowed.`,
  ],
  [
    /^Kunde: Land "(.+)" unbekannt - bitte korrigieren \(z\. B\. Deutschland\)\.$/,
    (m) => `Client: country "${m[1]}" unknown — please correct it (e.g. Germany).`,
  ],
  [
    /^Keine Schriftdateien für "(.+)" gefunden\.$/,
    (m) => `No font files found for "${m[1]}".`,
  ],
  [
    /^Keine Transaktionen in "(.+)" gefunden — ist das ein N26-Kontoauszug\?$/,
    (m) => `No transactions found in "${m[1]}" — is this an N26 bank statement?`,
  ],
  [
    /^Dieser Beleg ist bereits vorhanden \((.+)\) - kein zweiter Upload\.$/,
    (m) => `This receipt already exists (${m[1]}) — no second upload.`,
  ],
  [
    /^Der Nummernkreis steht bereits bei (\d+) — kleiner geht nicht, sonst wird eine vergebene Nummer erneut vergeben\.$/,
    (m) =>
      `The number sequence is already at ${m[1]} — it cannot be lowered, otherwise an issued number would be reused.`,
  ],
]

export function translateBackendMessage(message: string): string {
  const cleaned = message.trim()
  if (getLanguage() === 'de') return EN_TO_DE[cleaned] ?? message

  if (EXACT[cleaned]) return EXACT[cleaned]

  for (const [pattern, format] of PATTERNS) {
    const match = cleaned.match(pattern)
    if (match) return format(match)
  }

  // E-invoice validation returns one German problem per line.
  const prefix = 'E-Rechnung nicht möglich:\n'
  if (cleaned.startsWith(prefix)) {
    const lines = cleaned.slice(prefix.length).split('\n')
    return ['E-invoice not possible:', ...lines.map((line) => EXACT[line.trim()] ?? line)].join('\n')
  }

  return message
}
