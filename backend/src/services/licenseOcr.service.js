import { callGeminiText } from './geminiText.service.js';
import StorageService from './storage.service.js';

function stripCodeFences(s) {
  const t = String(s || '').trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m?.[1] ? m[1].trim() : t;
}

function extractJsonFromModelText(text) {
  const raw = stripCodeFences(text);
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw;
}

function tryParseJson(text) {
  try {
    return JSON.parse(extractJsonFromModelText(text));
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    const mm = String(mdy[1]).padStart(2, '0');
    const dd = String(mdy[2]).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${String(ymd[2]).padStart(2, '0')}-${String(ymd[3]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function extractTextFromBuffer(buffer, mimeType) {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('pdf') || !type.startsWith('image/')) {
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
    } catch {
      // fall through
    }
  }
  try {
    const { ImageAnnotatorClient } = await import('@google-cloud/vision');
    const client = new ImageAnnotatorClient();
    const [res] = await client.textDetection({ image: { content: buffer } });
    return res?.fullTextAnnotation?.text || res?.textAnnotations?.[0]?.description || '';
  } catch {
    return '';
  }
}

async function downloadStoredFile(relativePath) {
  const key = String(relativePath || '').trim().replace(/^\/+/, '');
  if (!key) return null;
  const bucket = await StorageService.getGCSBucket();
  const candidates = [key];
  if (key.startsWith('uploads/')) candidates.push(key.slice('uploads/'.length));
  else if (!key.startsWith('credentials/')) candidates.push(`uploads/${key}`);

  for (const candidate of candidates) {
    try {
      const file = bucket.file(candidate);
      const [exists] = await file.exists();
      if (!exists) continue;
      const [buffer] = await file.download();
      const [meta] = await file.getMetadata().catch(() => [null]);
      return {
        buffer,
        mimeType: meta?.contentType || (candidate.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
        key: candidate
      };
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Extract license number / issued / expiration from an uploaded license PDF/image.
 */
export async function extractLicenseFieldsFromStoredPath(relativePath) {
  const downloaded = await downloadStoredFile(relativePath);
  if (!downloaded?.buffer?.length) {
    const err = new Error('License file could not be loaded for OCR');
    err.status = 404;
    throw err;
  }

  const text = await extractTextFromBuffer(downloaded.buffer, downloaded.mimeType);
  if (!String(text || '').trim()) {
    const err = new Error('Could not extract text from license file');
    err.status = 422;
    throw err;
  }

  const prompt = `You are extracting fields from a US professional healthcare license document.
Return ONLY valid JSON with this shape:
{
  "license_type_number": string|null,
  "license_issued": "YYYY-MM-DD"|null,
  "license_expires": "YYYY-MM-DD"|null,
  "confidence": number
}
Rules:
- license_type_number should include credential prefix + number when present (e.g. "LPCC.0012345" or "LPC 12345").
- Dates must be ISO YYYY-MM-DD when known, otherwise null.
- Do not invent values. If unsure, use null.
- confidence is 0-1.

Document text:
"""
${String(text).slice(0, 12000)}
"""`;

  const modelText = await callGeminiText({ prompt, temperature: 0.1, maxOutputTokens: 500 });
  const parsed = tryParseJson(modelText) || {};

  return {
    license_type_number: String(parsed.license_type_number || '').trim() || null,
    license_issued: normalizeDate(parsed.license_issued),
    license_expires: normalizeDate(parsed.license_expires),
    confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : null,
    rawTextPreview: String(text).slice(0, 400)
  };
}

export default {
  extractLicenseFieldsFromStoredPath
};
