import { parse } from 'csv-parse/sync';

const normalizeHeader = (h) =>
  String(h || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toDateString = (value) => {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().split('T')[0];
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return s;
  return null;
};

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Company Car Import Parser
 * Parses CSV/XLSX from mileage spreadsheet format.
 * Expected columns (flexible header matching): Name, Date, Starting Odometer Miles, Ending Odometer Miles, Destination/s, Reason for Travel
 */
export default class CompanyCarImportParserService {
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

      const nameVal =
        normalized['name'] ||
        normalized['driver'] ||
        normalized['driver name'] ||
        '';
      const dateVal =
        normalized['date'] ||
        normalized['drive date'] ||
        '';
      const startVal =
        normalized['starting odometer miles'] ||
        normalized['starting odometer'] ||
        normalized['start odometer'] ||
        normalized['start odometer miles'] ||
        '';
      const endVal =
        normalized['ending odometer miles'] ||
        normalized['ending odometer'] ||
        normalized['end odometer'] ||
        normalized['end odometer miles'] ||
        '';
      const destVal =
        normalized['destination s'] ||
        normalized['destinations'] ||
        normalized['destination'] ||
        normalized['destination/s'] ||
        '';
      const reasonVal =
        normalized['reason for travel'] ||
        normalized['reason'] ||
        normalized['purpose'] ||
        '';

      if (!nameVal && !dateVal && !startVal && !endVal) continue;

      const driveDate = toDateString(dateVal);
      const startOdometer = toNum(startVal);
      const endOdometer = toNum(endVal);

      const destinations = String(destVal || '')
        .split(',')
        .map((d) => String(d).trim())
        .filter(Boolean);

      rows.push({
        rowIndex: i + 2,
        name: String(nameVal || '').trim(),
        driveDate,
        startOdometerMiles: startOdometer,
        endOdometerMiles: endOdometer,
        destinations,
        reasonForTravel: String(reasonVal || '').trim().slice(0, 255)
      });
    }
    return rows;
  }
}
