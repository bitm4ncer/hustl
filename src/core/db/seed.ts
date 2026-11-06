import type { CompanySettings } from '@shared/types'

export const DEFAULT_SETTINGS: CompanySettings = {
  name: 'MAX MUSTERMANN',
  subtitle: 'Visuelle Kommunikation',
  addressLines: ['Max Mustermann', 'Musterstraße 1', '12345 Musterstadt', 'Germany'],
  phone: '+49 30 1234567',
  email: 'mail@example.com',
  taxNumber: '12/345/67890',
  vatId: 'DE123456789',
  iban: 'DE89 3704 0044 0532 0130 00',
  bic: 'COBADEFFXXX',
  bank: 'Musterbank',
  paymentTermsDays: 14,
  recipientName: 'Max Mustermann',
  sellerStreet: 'Musterstraße 1',
  sellerZip: '12345',
  sellerCity: 'Musterstadt',
  sellerCountryCode: 'DE',
  defaultTaxRate: 0.19,
  documentLanguage: 'de',
  gocardlessSecretId: '',
  gocardlessSecretKey: '',
  smtp: { host: '', port: 587, secure: false, user: '', fromName: '', fromEmail: '' },
  emailSubjectTemplate: 'Rechnung {rechnungsnummer}',
  emailBodyTemplate:
    'Hallo {kunde},\n\nanbei erhalten Sie die Rechnung {rechnungsnummer} vom {datum} ' +
    'über {betrag}.\nBitte begleichen Sie den Betrag bis zum {faelligkeit}.\n\n' +
    'Vielen Dank und beste Grüße\n{firma}',
  emailSendMode: 'client',
  kleinunternehmer: false,
  offerValidityDays: 14,
  offerNumberPrefix: 'ANG',
  offerIntroText: 'Gerne unterbreite ich Ihnen folgendes Angebot:',
  offerClosingText: 'Ich freue mich auf die Zusammenarbeit. Bei Rückfragen stehe ich Ihnen jederzeit zur Verfügung.',
}
