import { ImageAnnotatorClient } from '@google-cloud/vision';

let visionClient = null;

function getVisionClient() {
  if (!visionClient) {
    visionClient = new ImageAnnotatorClient();
  }
  return visionClient;
}

/**
 * Extract raw text from receipt image or PDF.
 * Images: Google Vision.
 * PDF: pdf-parse.
 * @param {Buffer} buffer - Image or PDF buffer
 * @param {string} mimeType - e.g. image/jpeg, image/png, application/pdf
 * @returns {Promise<string>} Raw text
 */
async function extractReceiptText(buffer, mimeType) {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('pdf')) {
    try {
      const mod = await import('pdf-parse');
      const PDFParse = mod?.PDFParse;
      if (typeof PDFParse === 'function') {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy();
        return typeof result?.text === 'string' ? result.text : '';
      }
      const fn = mod?.default?.default ?? mod?.default;
      if (typeof fn === 'function') {
        const result = await fn(buffer);
        return result?.text || '';
      }
      return '';
    } catch {
      return '';
    }
  }
  const request = { image: { content: buffer } };
  const [res] = await getVisionClient().textDetection(request);
  return res?.fullTextAnnotation?.text || res?.textAnnotations?.[0]?.description || '';
}

/**
 * Parse receipt text to extract vendor, date, amount, and optional line items.
 * Uses heuristics common to US receipts.
 * @param {string} text - Raw OCR text
 * @returns {{ vendor: string, date: string|null, amount: number|null, items: Array<{ description: string, amount: number }> }}
 */
function parseReceiptText(text) {
  const result = { vendor: '', date: null, amount: null, items: [] };
  if (!text || !String(text).trim()) return result;

  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return result;

  // Vendor: often first non-empty line or first few lines (before date/numbers)
  const vendorCandidates = lines.slice(0, 5).filter((l) => {
    const lower = l.toLowerCase();
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(l)) return false;
    if (/^\$?\d+\.?\d*$/.test(l.replace(/\s/g, ''))) return false;
    if (/\btotal\b|\bsubtotal\b|\btax\b|\bchange\b|\bamount\b/i.test(lower)) return false;
    return l.length > 2 && l.length < 120;
  });
  result.vendor = vendorCandidates[0] || lines[0] || '';

  // Date: MM/DD/YYYY, DD/MM/YYYY, MM-DD-YY, etc.
  const datePatterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/i
  ];
  const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  for (const line of lines) {
    for (const pat of datePatterns) {
      const m = line.match(pat);
      if (m) {
        let y, mo, d;
        if (m[1].length === 4) {
          y = parseInt(m[1], 10);
          mo = parseInt(m[2], 10);
          d = parseInt(m[3], 10);
        } else if (monthMap[String(m[1]).toLowerCase().slice(0, 3)]) {
          mo = monthMap[String(m[1]).toLowerCase().slice(0, 3)];
          d = parseInt(m[2], 10);
          y = parseInt(m[3], 10);
        } else if (monthMap[String(m[2]).toLowerCase().slice(0, 3)]) {
          d = parseInt(m[1], 10);
          mo = monthMap[String(m[2]).toLowerCase().slice(0, 3)];
          y = parseInt(m[3], 10);
        } else {
          mo = parseInt(m[1], 10);
          d = parseInt(m[2], 10);
          y = parseInt(m[3], 10);
          if (y < 100) y += 2000;
        }
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) {
          result.date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          break;
        }
      }
    }
    if (result.date) break;
  }

  // Amount: look for "total", "amount due", "balance", "grand total", etc.
  const amountPattern = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/;
  const totalKeywords = /\b(total|amount due|balance|grand total|amount|sum)\s*:?\s*$/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const clean = line.replace(/\s+/g, ' ');
    if (totalKeywords.test(clean) || (i >= lines.length - 3 && amountPattern.test(clean))) {
      const m = clean.match(amountPattern);
      if (m) {
        const num = parseFloat(m[1].replace(/,/g, ''));
        if (Number.isFinite(num) && num > 0 && num < 1000000) {
          result.amount = num;
          break;
        }
      }
    }
  }
  if (result.amount === null) {
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const m = lines[i].match(amountPattern);
      if (m) {
        const num = parseFloat(m[1].replace(/,/g, ''));
        if (Number.isFinite(num) && num > 0 && num < 1000000) {
          result.amount = num;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Extract structured receipt data from image/PDF buffer.
 * @param {Buffer} buffer - Receipt image or PDF buffer
 * @param {string} mimeType - e.g. image/jpeg, image/png, application/pdf
 * @returns {Promise<{ vendor: string, date: string|null, amount: number|null, items: Array }>}
 */
export async function extractReceiptData(buffer, mimeType = 'image/jpeg') {
  const text = await extractReceiptText(buffer, mimeType);
  return parseReceiptText(text);
}
