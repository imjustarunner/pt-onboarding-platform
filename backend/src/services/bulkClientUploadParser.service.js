import { parse } from 'csv-parse/sync';

const normalizeHeader = (h) => String(h || '').trim().toLowerCase();

const toBool = (v) => {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'skills', 'skill'].includes(s);
};

const toDateString = (value) => {
  if (!value) return null;
  // If already a Date object (from XLSX)
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().split('T')[0];
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // Try MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  // Try YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return s;
  return null;
};

const normalizeDay = (value) => {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return null;
  const map = {
    mon: 'Monday',
    monday: 'Monday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',
    wed: 'Wednesday',
    weds: 'Wednesday',
    wednesday: 'Wednesday',
    thu: 'Thursday',
    thur: 'Thursday',
    thurs: 'Thursday',
    thursday: 'Thursday',
    fri: 'Friday',
    friday: 'Friday'
  };
  return map[s] || null;
};

/**
 * Bulk Client Upload Parser
 * Supports CSV and XLSX with a fixed set of expected headers (case-insensitive).
 */
export default class BulkClientUploadParserService {
  static async parse(buffer, originalname = '', mimetype = '') {
    const name = String(originalname || '').toLowerCase();
    const isXlsx = name.endsWith('.xlsx') || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isCsv = name.endsWith('.csv') || mimetype === 'text/csv' || mimetype === 'application/csv';

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
      relax_column_count: true
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

      const clientName =
        normalized['client name'] ||
        normalized['client'] ||
        normalized['student name'] ||
        normalized['student'] ||
        '';

      const out = {
        rowNumber: i + 2, // header row is 1
        clientName: String(clientName || '').trim(),
        status: String(normalized['status'] || '').trim(),
        referralDate: toDateString(normalized['referral date']),
        skills: toBool(normalized['skills']),
        insurance: String(normalized['insurance'] || '').trim(),
        school: String(normalized['school'] || normalized['school name'] || '').trim(),
        provider: String(normalized['provider'] || '').trim(),
        backgroundCheckDate: toDateString(normalized['background check date']),
        providerRiskFlags: String(normalized['provider risk flags'] || '').trim(),
        providerAvailability: normalized['provider availability'],
        day: normalizeDay(normalized['day']),
        paperworkDelivery: String(normalized['paperwork delivery'] || '').trim(),
        docDate: toDateString(normalized['doc date']),
        paperworkStatus: String(normalized['paperwork status'] || '').trim(),
        notes: String(normalized['notes'] || '').trim(),
        grade: String(normalized['grade'] || '').trim(),
        gender: String(normalized['gender'] || '').trim(),
        identifierCode: String(normalized['identifier code'] || normalized['identifier'] || '').trim(),
        district: String(normalized['district'] || '').trim(),
        primaryClientLanguage: String(normalized['primary client language'] || '').trim(),
        primaryParentLanguage: String(normalized['primary parent language'] || '').trim(),
        raw: raw
      };

      rows.push(out);
    }
    return rows;
  }
}

