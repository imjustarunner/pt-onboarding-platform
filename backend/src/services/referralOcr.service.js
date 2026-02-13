import { ImageAnnotatorClient } from '@google-cloud/vision';
import dommatrixPkg from 'dommatrix';
import StorageService from './storage.service.js';
import { createRequire } from 'module';
import { PDFDocument } from 'pdf-lib';

let visionClient = null;

function getVisionClient() {
  if (!visionClient) {
    visionClient = new ImageAnnotatorClient();
  }
  return visionClient;
}

class ReferralOcrService {
  static async extractText({ buffer, mimeType, languageHint }) {
    if (typeof globalThis.DOMMatrix === 'undefined') {
      const candidates = [
        dommatrixPkg?.DOMMatrix,
        dommatrixPkg?.default?.DOMMatrix,
        dommatrixPkg?.default,
        dommatrixPkg
      ];
      const resolved = candidates.find((candidate) => typeof candidate === 'function');
      if (resolved) {
        globalThis.DOMMatrix = resolved;
      } else {
        throw new Error('DOMMatrix polyfill missing. Unable to initialize PDF OCR.');
      }
    }
    const type = String(mimeType || '').toLowerCase();
    if (type.includes('pdf')) {
      const { pagesToScan, printedLines } = await this.getPdfPageSelection(buffer);
      const visionText = await this.extractPdfWithVision({ buffer, pagesToScan, languageHint });
      if (!visionText || !visionText.trim()) {
        throw new Error('No handwritten text detected from Vision OCR.');
      }
      const filtered = this.filterHandwrittenText(visionText, printedLines);
      if (!filtered || !filtered.trim()) {
        throw new Error('No handwritten text detected after filtering printed content.');
      }
      return filtered;
    }
    const request = {
      image: { content: buffer },
      ...(languageHint ? { imageContext: { languageHints: [languageHint] } } : {})
    };
    const [res] = await getVisionClient().textDetection(request);
    const text = res?.fullTextAnnotation?.text || res?.textAnnotations?.[0]?.description || '';
    return text || '';
  }

  static async extractPdfText(buffer, pagesToScan) {
    const { pages } = await this.parsePdfPages(buffer);
    if (!pages?.length) return '';
    if (!Array.isArray(pagesToScan) || pagesToScan.length === 0) {
      return pages.join('\n');
    }
    const selected = pagesToScan
      .map((n) => pages[n - 1])
      .filter((p) => typeof p === 'string' && p.trim().length > 0);
    return selected.join('\n');
  }

  static async parsePdfPages(buffer) {
    const pdfParseFn = await this.resolvePdfParse();
    if (typeof pdfParseFn !== 'function') {
      throw new Error('pdf-parse unavailable');
    }
    const result = await pdfParseFn(buffer);
    const rawPages = String(result?.text || '').split(/\f/);
    const numPages = Number(result?.numpages || rawPages.length || 0);
    const pages = rawPages.length >= numPages ? rawPages : rawPages.concat(Array(numPages - rawPages.length).fill(''));
    return { pages, numPages };
  }

  static async getPdfPageCount(buffer) {
    try {
      const doc = await PDFDocument.load(buffer);
      return doc.getPageCount();
    } catch {
      return 0;
    }
  }

  static async resolvePdfParse() {
    try {
      const pdfParseModule = await import('pdf-parse');
      const fn = pdfParseModule?.default?.default || pdfParseModule?.default || pdfParseModule;
      if (typeof fn === 'function') return fn;
    } catch {
      // fall through to require
    }
    try {
      const require = createRequire(import.meta.url);
      const pdfParseModule = require('pdf-parse');
      const fn = pdfParseModule?.default || pdfParseModule;
      if (typeof fn === 'function') return fn;
    } catch {
      // fall through
    }
    return null;
  }

  static normalizeLine(line) {
    return String(line || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  static getPageNumberFromLine(line) {
    const raw = String(line || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const pageMatch = lower.match(/^page\s*(\d{1,2})(?:\s*of\s*\d{1,2})?$/i);
    if (pageMatch) return parseInt(pageMatch[1], 10);
    const numMatch = lower.match(/^(\d{1,2})$/);
    if (numMatch) return parseInt(numMatch[1], 10);
    return null;
  }

  static async getPdfPageSelection(buffer) {
    let pages = [];
    let numPages = 0;
    try {
      const parsed = await this.parsePdfPages(buffer);
      pages = parsed.pages || [];
      numPages = parsed.numPages || 0;
    } catch {
      numPages = await this.getPdfPageCount(buffer);
    }
    const printedLines = new Set();
    const pageNumberIndex = new Map();

    if (pages.length) {
      pages.forEach((pageText, idx) => {
        const lines = String(pageText || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        const lastLine = lines[lines.length - 1] || '';
        const pageNum = this.getPageNumberFromLine(lastLine);
        if (pageNum === 1 || pageNum === 2) {
          pageNumberIndex.set(pageNum, idx + 1); // Vision pages are 1-based
        }
      });
    }

    let pagesToScan = [];
    if (pageNumberIndex.has(1) && pageNumberIndex.has(2)) {
      pagesToScan = [pageNumberIndex.get(1), pageNumberIndex.get(2)];
    } else if (numPages >= 3) {
      pagesToScan = [2, 3].filter((n) => n <= numPages);
    } else {
      pagesToScan = [1, 2].filter((n) => n <= numPages);
    }

    if (pages.length) {
      for (const p of pagesToScan) {
        const text = pages[p - 1] || '';
        const lines = text
          .split(/\r?\n/)
          .map((l) => this.normalizeLine(l))
          .filter((l) => l.length > 0);
        lines.forEach((l) => printedLines.add(l));
      }
    }

    return { pagesToScan, printedLines };
  }

  static filterHandwrittenText(text, printedLines) {
    if (!text) return '';
    if (!printedLines || printedLines.size === 0) return text;
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const filtered = lines.filter((line) => !printedLines.has(this.normalizeLine(line)));
    const filteredText = filtered.join('\n').trim();
    return filteredText || text;
  }

  static async extractPdfWithVision({ buffer, pagesToScan, languageHint }) {
    const bucket = await StorageService.getGCSBucket();
    const prefix = `referrals_ocr_tmp/${Date.now()}-${Math.random().toString(36).slice(2)}/`;
    const gcsUri = `gs://${bucket.name}/${prefix}`;
    const inputPath = `${prefix}input.pdf`;
    const inputFile = bucket.file(inputPath);
    let files = [];
    try {
      await inputFile.save(buffer, {
        contentType: 'application/pdf',
        resumable: false,
        metadata: {
          uploadType: 'referral_ocr_input',
          createdAt: new Date().toISOString()
        }
      });
      const imageContext = languageHint ? { languageHints: [languageHint] } : undefined;
      const [operation] = await getVisionClient().asyncBatchAnnotateFiles({
        requests: [
          {
            inputConfig: {
              gcsSource: { uri: `gs://${bucket.name}/${inputPath}` },
              mimeType: 'application/pdf',
              pages: Array.isArray(pagesToScan) && pagesToScan.length ? pagesToScan : undefined
            },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext,
            outputConfig: { gcsDestination: { uri: gcsUri } }
          }
        ]
      });
      await operation.promise();

      const [listed] = await bucket.getFiles({ prefix });
      files = listed || [];
      const chunks = [];
      for (const file of files) {
        try {
          const [content] = await file.download();
          const json = JSON.parse(content.toString('utf8'));
          const responses = Array.isArray(json?.responses) ? json.responses : [];
          responses.forEach((r) => {
            const txt = r?.fullTextAnnotation?.text || r?.textAnnotations?.[0]?.description || '';
            if (txt) chunks.push(txt);
          });
        } catch {
          // ignore malformed chunk
        }
      }
      return chunks.join('\n').trim();
    } catch (error) {
      console.error('Vision PDF OCR failed.', {
        message: error?.message || 'Unknown error',
        code: error?.code,
        details: error?.details || error?.errors
      });
      throw error;
    } finally {
      try {
        await inputFile.delete();
      } catch {
        // ignore cleanup failures
      }
      if (files.length) {
        await Promise.allSettled(files.map((f) => f.delete()));
      }
    }
  }
}

export default ReferralOcrService;
