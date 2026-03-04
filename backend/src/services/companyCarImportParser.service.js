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
  if (v === null || v === undefined) return null;
  if (Number.isFinite(Number(v))) return Number(v);
  const s = String(v).trim().replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s.replace(/[^0-9.-]/g, ''));
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
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const { headerRowIndex, records } = this.findHeaderRowAndBuildRecords(rawRows);
    if (headerRowIndex > 0) {
      console.log(`[companyCar parser] XLSX: using row ${headerRowIndex + 1} as headers (skipped ${headerRowIndex} title rows)`);
    }
    return this.normalizeRecords(records, headerRowIndex);
  }

  static findHeaderRowAndBuildRecords(rawRows) {
    const headerKeywords = ['driver', 'date', 'name', 'odometer', 'start', 'end', 'mileage', 'destination'];
    let headerRowIndex = 0;
    for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
      const row = rawRows[r] || [];
      const cells = row.map((c) => String(c || '').toLowerCase());
      const hasHeader = cells.some((c) => headerKeywords.some((kw) => c.includes(kw)));
      if (hasHeader) {
        headerRowIndex = r;
        break;
      }
    }
    const headers = rawRows[headerRowIndex] || [];
    const records = [];
    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r] || [];
      const obj = {};
      headers.forEach((h, i) => {
        const key = String(h ?? '').trim() || `__col${i}`;
        obj[key] = row[i] ?? '';
      });
      records.push(obj);
    }
    return { headerRowIndex, records };
  }

  static normalizeRecords(records, headerRowOffset = 0) {
    const rows = [];
    for (let i = 0; i < (records || []).length; i++) {
      const raw = records[i] || {};
      const normalized = {};
      Object.entries(raw).forEach(([k, v]) => {
        normalized[normalizeHeader(k)] = v;
      });
      if (i === 0 && Object.keys(raw).length > 0) {
        console.log('[companyCar parser] First row raw keys:', Object.keys(raw));
        console.log('[companyCar parser] First row startVal:', normalized['starting odometer mileage'] ?? normalized['starting odometer miles'] ?? '(not found)');
        console.log('[companyCar parser] First row endVal:', normalized['ending odometer mileage'] ?? normalized['ending odometer miles'] ?? '(not found)');
      }

      const nameVal =
        normalized['driver name'] ||
        normalized['name'] ||
        normalized['driver'] ||
        '';
      const dateVal =
        normalized['date'] ||
        normalized['drive date'] ||
        '';
      const startVal =
        normalized['starting odometer mileage'] ||
        normalized['starting odometer miles'] ||
        normalized['starting odometer'] ||
        normalized['start odometer'] ||
        normalized['start odometer miles'] ||
        normalized['start miles'] ||
        normalized['starting'] ||
        normalized['odometer start'] ||
        normalized['start'] ||
        '';
      const endVal =
        normalized['ending odometer mileage'] ||
        normalized['ending odometer miles'] ||
        normalized['ending odometer'] ||
        normalized['end odometer'] ||
        normalized['end odometer miles'] ||
        normalized['end miles'] ||
        normalized['ending'] ||
        normalized['odometer end'] ||
        normalized['end'] ||
        '';
      const milesVal =
        normalized['miles'] ||
        normalized['mileage'] ||
        normalized['trip miles'] ||
        normalized['trip mileage'] ||
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
      const notesVal =
        normalized['full description'] ||
        normalized['notes'] ||
        normalized['description'] ||
        '';

      if (!nameVal && !dateVal) continue;

      const driveDate = toDateString(dateVal);
      let startOdometer = toNum(startVal);
      let endOdometer = toNum(endVal);
      const milesOnly = toNum(milesVal);

      if ((startOdometer == null || endOdometer == null || (Number(startOdometer) === 0 && Number(endOdometer) === 0)) && milesOnly != null && milesOnly > 0) {
        startOdometer = 0;
        endOdometer = milesOnly;
      }
      if ((startOdometer == null || endOdometer == null || (Number(startOdometer) === 0 && Number(endOdometer) === 0)) && !milesOnly) {
        const vals = Object.values(raw);
        if (vals.length >= 4) {
          const s = toNum(vals[2]);
          const e = toNum(vals[3]);
          if (s != null && e != null && e >= s) {
            startOdometer = s;
            endOdometer = e;
            if (i === 0) console.log('[companyCar parser] Used column-index fallback (cols 2,3):', { startOdometer, endOdometer });
          }
        }
        if (startOdometer == null || endOdometer == null) {
          const numerics = Object.entries(normalized)
            .filter(([k]) => !/^(driver|name|date|destination|reason|notes|description|purpose|full)/i.test(k))
            .map(([, v]) => toNum(v))
            .filter((n) => n != null && n >= 0);
          if (numerics.length >= 2) {
            startOdometer = numerics[0];
            endOdometer = numerics[1];
            if (i === 0) console.log('[companyCar parser] Used numeric fallback:', { startOdometer, endOdometer });
          }
        }
      }
      if (startOdometer == null || endOdometer == null || endOdometer < startOdometer) continue;

      const destinations = String(destVal || '')
        .split(',')
        .map((d) => String(d).trim())
        .filter(Boolean);

      rows.push({
        rowIndex: i + headerRowOffset + 2,
        name: String(nameVal || '').trim(),
        driveDate,
        startOdometerMiles: startOdometer,
        endOdometerMiles: endOdometer,
        destinations,
        reasonForTravel: String(reasonVal || '').trim().slice(0, 255),
        notes: String(notesVal || '').trim().slice(0, 65535) || null
      });
    }
    return rows;
  }
}
