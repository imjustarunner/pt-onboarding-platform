import { parse } from 'csv-parse/sync';

/**
 * CSV Parser Service
 * 
 * Parses CSV files for bulk client import
 */
class CSVParserService {
  static normalizeHeaderKey(key) {
    if (!key) return '';
    // Remove UTF-8 BOM and normalize spacing/punctuation.
    return String(key)
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .trim()
      .replace(/[_\-]+/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static firstNonEmpty(normalizedRow, keys) {
    for (const k of keys) {
      const v = normalizedRow[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  static deriveInitialsFromName(name) {
    if (!name) return '';
    const cleaned = String(name)
      .replace(/[_\-]+/g, ' ')
      .replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';
    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0][0];
      const last = parts[parts.length - 1][0];
      return `${first}${last}`.toUpperCase();
    }
    // Single token fallback: take first 2 chars if possible
    return cleaned.substring(0, 2).toUpperCase();
  }

  /**
   * Parse CSV buffer into structured array of client data objects
   * @param {Buffer} csvBuffer - CSV file buffer
   * @returns {Promise<Array>} Array of parsed client data objects
   */
  static async parseCSV(csvBuffer) {
    try {
      // Parse CSV with headers
      const records = parse(csvBuffer, {
        columns: true, // Use first line as column names
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true
      });

      // Map CSV columns to client data structure
      // Expected CSV columns (flexible mapping):
      // - School Name / School / Organization
      // - Initials / Student Initials / Client Initials
      // - Provider Name / Provider / Assigned Provider
      // - Status / Client Status
      // - Submission Date / Date / Created Date
      // - Document Status (optional)

      const clients = records.map((row, index) => {
        // Normalize column names (case-insensitive, handle variations)
        const normalizedRow = {};
        for (const [key, value] of Object.entries(row)) {
          const normalizedKey = this.normalizeHeaderKey(key);
          normalizedRow[normalizedKey] = value;
        }

        // Extract data with flexible column matching
        const schoolName = this.firstNonEmpty(normalizedRow, [
          'school name',
          'school',
          'school site',
          'organization',
          'organization name',
          'org',
          'site',
          'campus'
        ]);

        let initials = this.firstNonEmpty(normalizedRow, [
          'initials',
          'initial',
          'student initials',
          'student initial',
          'client initials',
          'client initial',
          'client name',
          'student name',
          'full name',
          'name',
          'student',
          'client'
        ]);

        const providerName = this.firstNonEmpty(normalizedRow, [
          'provider name',
          'provider',
          'assigned provider',
          'clinician',
          'therapist',
          'assigned clinician'
        ]) || null;

        const status = this.firstNonEmpty(normalizedRow, [
          'status',
          'client status',
          'student status'
        ]) || 'PENDING_REVIEW';

        const submissionDate = this.firstNonEmpty(normalizedRow, [
          'submission date',
          'date',
          'created date',
          'referral date',
          'submitted date'
        ]) || new Date().toISOString().split('T')[0]; // Default to today

        const documentStatus = this.firstNonEmpty(normalizedRow, [
          'document status',
          'doc status',
          'documents status'
        ]) || 'NONE';

        // If the CSV gives us a name (e.g., "Jane Doe"), derive initials.
        if (initials && (String(initials).includes(' ') || String(initials).includes(','))) {
          initials = this.deriveInitialsFromName(initials);
        }

        // Validate required fields
        if (!schoolName || !initials) {
          const missing = [];
          if (!schoolName) missing.push('School Name');
          if (!initials) missing.push('Initials');

          const err = new Error(
            `Row ${index + 2}: Missing required fields: ${missing.join(', ')}. ` +
            `Make sure your CSV has headers like "School Name" and "Initials".`
          );
          err.rowNumber = index + 2;
          err.missingFields = missing;
          err.foundHeaders = Object.keys(row || {});
          err.expectedHeaders = [
            'School Name (or School / Organization / Organization Name)',
            'Initials (or Client Name / Student Initials / Client Initials)',
            'Provider Name (optional)',
            'Status (optional)',
            'Submission Date (optional)',
            'Document Status (optional)'
          ];
          throw err;
        }

        // Normalize status to match ENUM values
        const normalizedStatus = this.normalizeStatus(status);
        const normalizedDocStatus = this.normalizeDocumentStatus(documentStatus);

        return {
          schoolName: schoolName.trim(),
          initials: initials.trim().toUpperCase(), // Store initials in uppercase for consistency
          providerName: providerName ? providerName.trim() : null,
          status: normalizedStatus,
          submissionDate: this.parseDate(submissionDate),
          documentStatus: normalizedDocStatus,
          rawRow: row, // Keep original row for error reporting
          rowNumber: index + 2 // +2 because index is 0-based and we skip header
        };
      });

      return clients;
    } catch (error) {
      if (error.message.includes('Row')) {
        throw error; // Re-throw validation errors
      }
      throw new Error(`Failed to parse CSV: ${error.message}`);
    }
  }

  /**
   * Normalize status value to match ENUM
   * @param {string} status - Status value from CSV
   * @returns {string} Normalized status
   */
  static normalizeStatus(status) {
    const normalized = status.toUpperCase().trim().replace(/[^A-Z_]/g, '_');
    
    const statusMap = {
      'PENDING_REVIEW': 'PENDING_REVIEW',
      'PENDING': 'PENDING_REVIEW',
      'ACTIVE': 'ACTIVE',
      'CURRENT': 'ACTIVE',
      'PACKET': 'PACKET',
      'SCREENER': 'SCREENER',
      'SCREENING': 'SCREENER',
      'RETURNING': 'RETURNING',
      'WAITLIST': 'ON_HOLD',
      'WAIT_LIST': 'ON_HOLD',
      'ON_HOLD': 'ON_HOLD',
      'ONHOLD': 'ON_HOLD',
      'HOLD': 'ON_HOLD',
      'DECLINED': 'DECLINED',
      'REJECTED': 'DECLINED',
      'ARCHIVED': 'ARCHIVED',
      'CLOSED': 'ARCHIVED'
    };

    return statusMap[normalized] || 'PENDING_REVIEW';
  }

  /**
   * Normalize document status value to match ENUM
   * @param {string} docStatus - Document status value from CSV
   * @returns {string} Normalized document status
   */
  static normalizeDocumentStatus(docStatus) {
    const normalized = docStatus.toUpperCase().trim();
    
    const statusMap = {
      'NONE': 'NONE',
      'UPLOADED': 'UPLOADED',
      'APPROVED': 'APPROVED',
      'REJECTED': 'REJECTED'
    };

    return statusMap[normalized] || 'NONE';
  }

  /**
   * Parse date string to YYYY-MM-DD format
   * @param {string} dateString - Date string from CSV
   * @returns {string} Formatted date (YYYY-MM-DD)
   */
  static parseDate(dateString) {
    if (!dateString) {
      return new Date().toISOString().split('T')[0];
    }

    // Try to parse various date formats
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      // If parsing fails, try common formats
      const formats = [
        /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
        /^(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
        /^(\d{2})-(\d{2})-(\d{4})/ // MM-DD-YYYY
      ];

      for (const format of formats) {
        const match = dateString.match(format);
        if (match) {
          if (format === formats[0]) {
            // YYYY-MM-DD
            return dateString;
          } else if (format === formats[1]) {
            // MM/DD/YYYY -> YYYY-MM-DD
            const [, month, day, year] = match;
            return `${year}-${month}-${day}`;
          } else if (format === formats[2]) {
            // MM-DD-YYYY -> YYYY-MM-DD
            const [, month, day, year] = match;
            return `${year}-${month}-${day}`;
          }
        }
      }

      // If all parsing fails, return today's date
      console.warn(`Could not parse date: ${dateString}, using today's date`);
      return new Date().toISOString().split('T')[0];
    }

    return date.toISOString().split('T')[0];
  }
}

export default CSVParserService;
