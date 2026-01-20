import { parse } from 'csv-parse/sync';

// More forgiving than plain trim/lowercase:
// - strips UTF-8 BOM
// - normalizes punctuation/underscores
// - collapses whitespace
const normalizeHeader = (h) =>
  String(h || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const firstNonEmpty = (obj, keys) => {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};

/**
 * Bulk School Upload Parser
 * Supports CSV and XLSX for school directory enrichment.
 *
 * Expected headers (flexible mapping):
 * - School / Location
 * - Primary School Contact
 * - School Contact Email
 * - School Contacts, Emails, and Role
 * - School Number
 * - ITSCO Email
 * - School Days/Times
 * - School Address
 * - District
 */
export default class BulkSchoolUploadParserService {
  static async parse(buffer, originalname = '', mimetype = '') {
    const name = String(originalname || '').toLowerCase();
    const isXlsx =
      name.endsWith('.xlsx') ||
      mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isCsv =
      name.endsWith('.csv') ||
      mimetype === 'text/csv' ||
      mimetype === 'application/csv' ||
      mimetype === 'text/plain';

    if (isXlsx) return await this.parseXlsx(buffer);
    if (isCsv) return this.parseCsv(buffer);

    throw new Error('Invalid file type. Please upload a .csv or .xlsx file.');
  }

  static parseCsv(buffer) {
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
      // Allow common exports: CSV, TSV, or semicolon-delimited.
      delimiter: [',', '\t', ';']
    });
    return this.normalizeRecords(records);
  }

  static async parseXlsx(buffer) {
    const mod = await import('xlsx');
    const XLSX = mod.default || mod;
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const first = wb.SheetNames[0];
    const ws = wb.Sheets[first];
    const records = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return this.normalizeRecords(records);
  }

  static normalizeRecords(records) {
    const rows = [];
    for (let i = 0; i < (records || []).length; i++) {
      const raw = records[i] || {};
      const normalized = {};
      Object.entries(raw).forEach(([k, v]) => {
        normalized[normalizeHeader(k)] = v;
      });

      const schoolLocation = String(
        firstNonEmpty(normalized, [
          'school location',
          'school',
          'school name',
          'school site',
          'organization',
          'organization name',
          'site',
          'campus',
          'location'
        ]) || ''
      ).trim();

      const out = {
        rowNumber: i + 2, // header row is 1
        schoolLocation,
        primarySchoolContact: String(
          firstNonEmpty(normalized, ['primary school contact', 'primary contact', 'school primary contact']) || ''
        ).trim(),
        schoolContactEmail: String(
          firstNonEmpty(normalized, [
            'school contact email',
            'primary contact email',
            'primary email',
            'contact email'
          ]) || ''
        ).trim(),
        schoolPhone: String(
          firstNonEmpty(normalized, [
            'school phone',
            'school phone number',
            'phone number',
            'main phone',
            'phone'
          ]) || ''
        ).trim(),
        schoolContactsEmailsAndRole: String(
          firstNonEmpty(normalized, [
            'school contacts emails and role',
            'school contacts emails role',
            'school contacts emails roles',
            'school contacts',
            'contacts',
            'additional contacts'
          ]) || ''
        ).trim(),
        schoolNumber: String(firstNonEmpty(normalized, ['school number', 'number', 'school #', 'site number']) || '').trim(),
        itscoEmail: String(firstNonEmpty(normalized, ['itsco email', 'itsco', 'group email', 'itsco group email']) || '').trim(),
        schoolDaysTimes: String(
          firstNonEmpty(normalized, ['school days times', 'school days/times', 'days times', 'days/times', 'schedule']) || ''
        ).trim(),
        schoolAddress: String(firstNonEmpty(normalized, ['school address', 'address', 'site address']) || '').trim(),
        district: String(firstNonEmpty(normalized, ['district', 'district name']) || '').trim(),
        raw
      };

      // Minimum requirement: school identifier.
      if (!out.schoolLocation) {
        const err = new Error(`Row ${out.rowNumber}: Missing required field: School / Location`);
        err.rowNumber = out.rowNumber;
        err.missingFields = ['School / Location'];
        err.foundHeaders = Object.keys(raw || {});
        err.expectedHeaders = [
          'School / Location',
          'Primary School Contact',
          'School Contact Email',
          'School Contacts, Emails, and Role',
          'School Number',
          'ITSCO Email',
          'School Days/Times',
          'School Address',
          'District'
        ];
        throw err;
      }

      rows.push(out);
    }
    return rows;
  }
}

