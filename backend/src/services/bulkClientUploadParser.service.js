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

const normalizeWorkflow = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (s === 'pending' || s === 'pending review' || s === 'pending_review') return 'PENDING_REVIEW';
  if (s === 'active' || s === 'current') return 'ACTIVE';
  if (s === 'on hold' || s === 'on_hold' || s === 'hold') return 'ON_HOLD';
  if (s === 'declined' || s === 'denied') return 'DECLINED';
  if (s === 'archived' || s === 'archive') return 'ARCHIVED';
  // If the sheet already uses canonical enum values, accept them.
  const upper = raw.toUpperCase().trim();
  const allowed = new Set(['PENDING_REVIEW', 'ACTIVE', 'ON_HOLD', 'DECLINED', 'ARCHIVED']);
  return allowed.has(upper) ? upper : '';
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

      // Skip fully-empty rows (common when a CSV has delimiter-only blank lines).
      // csv-parse's skip_empty_lines only removes truly empty lines, not ",,,,,," rows.
      const keyFieldsToCheck = [
        'initials',
        'client name',
        'client',
        'student name',
        'student',
        'status',
        'referral date',
        'skills',
        'insurance',
        'school',
        'school name',
        'organization',
        'organization name',
        'provider',
        'provider name',
        'assigned provider',
        'day',
        'paperwork delivery',
        'delivery',
        'doc date',
        'paperwork status',
        'document status',
        'doc status',
        'notes',
        'grade',
        'gender',
        'identifier code',
        'identifier',
        'district',
        'school year',
        'schoolyear',
        'year'
      ];
      const hasAnyMeaningfulValue = keyFieldsToCheck.some((k) => {
        const v = normalized[k];
        if (v === null || v === undefined) return false;
        if (typeof v === 'number') return !Number.isNaN(v);
        const s = String(v).trim();
        return s !== '';
      });
      if (!hasAnyMeaningfulValue) {
        continue;
      }

      const clientName =
        normalized['client name'] ||
        normalized['client'] ||
        normalized['student name'] ||
        normalized['student'] ||
        normalized['initials'] ||
        '';

      const workflowRaw =
        normalized['workflow'] ||
        normalized['workflow status'] ||
        normalized['client workflow'] ||
        normalized['client workflow status'] ||
        normalized['client status workflow'] ||
        '';

      const has = (k) => Object.prototype.hasOwnProperty.call(normalized, k);

      const out = {
        rowNumber: i + 2, // header row is 1
        clientName: String(clientName || '').trim(),
        // For partial re-uploads (e.g., identifier_code + notes only), keep absent columns as undefined
        // so the processor can avoid overwriting existing fields.
        status: has('status') ? String(normalized['status'] || '').trim() : undefined,
        workflow: workflowRaw ? normalizeWorkflow(workflowRaw) : undefined,
        referralDate: has('referral date') ? toDateString(normalized['referral date']) : undefined,
        // Accept common header variants: "Skills", "Skills Client", etc.
        skills:
          has('skills') ||
          has('skills client') ||
          has('skills eligible') ||
          has('skill client') ||
          has('skill eligible') ||
          has('skill builder') ||
          has('skill builders')
            ? toBool(
                normalized['skills'] ??
                normalized['skills client'] ??
                normalized['skills eligible'] ??
                normalized['skill client'] ??
                normalized['skill eligible'] ??
                normalized['skill builder'] ??
                normalized['skill builders']
              )
            : undefined,
        insurance: has('insurance') ? String(normalized['insurance'] || '').trim() : undefined,
        school:
          has('school') || has('school name') || has('organization') || has('organization name')
            ? String(
                normalized['school'] ||
                  normalized['school name'] ||
                  normalized['organization'] ||
                  normalized['organization name'] ||
                  ''
              ).trim()
            : undefined,
        provider:
          has('provider') || has('provider name') || has('assigned provider') || has('clinician') || has('therapist')
            ? String(
                normalized['provider'] ||
                  normalized['provider name'] ||
                  normalized['assigned provider'] ||
                  normalized['clinician'] ||
                  normalized['therapist'] ||
                  ''
              ).trim()
            : undefined,
        backgroundCheckDate: has('background check date') ? toDateString(normalized['background check date']) : undefined,
        providerRiskFlags: has('provider risk flags') ? String(normalized['provider risk flags'] || '').trim() : undefined,
        providerAvailability: has('provider availability') ? normalized['provider availability'] : undefined,
        day: has('day') ? normalizeDay(normalized['day']) : undefined,
        paperworkDelivery: has('paperwork delivery') || has('delivery')
          ? String(normalized['paperwork delivery'] || normalized['delivery'] || '').trim()
          : undefined,
        docDate: has('doc date') ? toDateString(normalized['doc date']) : undefined,
        paperworkStatus: has('paperwork status') || has('document status') || has('doc status')
          ? String(
              normalized['paperwork status'] ||
                normalized['document status'] ||
                normalized['doc status'] ||
                ''
            ).trim()
          : undefined,
        notes: has('notes') ? String(normalized['notes'] || '').trim() : undefined,
        grade: has('grade') ? String(normalized['grade'] || '').trim() : undefined,
        schoolYear:
          has('school year') || has('school_year') || has('schoolyear') || has('year')
            ? String(
                normalized['school year'] ||
                  normalized['school_year'] ||
                  normalized['schoolyear'] ||
                  normalized['year'] ||
                  ''
              ).trim()
            : undefined,
        gender: has('gender') ? String(normalized['gender'] || '').trim() : undefined,
        identifierCode: has('identifier code') || has('identifier') ? String(normalized['identifier code'] || normalized['identifier'] || '').trim() : undefined,
        district: has('district') ? String(normalized['district'] || '').trim() : undefined,
        primaryClientLanguage: has('primary client language') ? String(normalized['primary client language'] || '').trim() : undefined,
        primaryParentLanguage: has('primary parent language') ? String(normalized['primary parent language'] || '').trim() : undefined,
        raw: raw
      };

      rows.push(out);
    }
    return rows;
  }
}

