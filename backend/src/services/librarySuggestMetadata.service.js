/**
 * Suggest Library description / category / tags from filename + optional text extract.
 */
import { callGeminiText } from './geminiText.service.js';
import Library from '../models/Library.model.js';

function safeJsonFromModel(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] || raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function extractTextFromUploadBuffer({ buffer, mimeType, filename }) {
  const name = String(filename || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  const buf = buffer;
  if (!buf?.length) return '';

  try {
    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      const mod = await import('pdf-parse');
      const PDFParse = mod?.PDFParse;
      if (typeof PDFParse !== 'function') return '';
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      await parser.destroy?.();
      return String(result?.text || '').slice(0, 12000);
    }
    if (
      mime.includes('word')
      || name.endsWith('.docx')
      || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      return String(result?.value || '').slice(0, 12000);
    }
    if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.csv')) {
      return buf.toString('utf8').slice(0, 12000);
    }
  } catch (err) {
    console.warn('[librarySuggest] extract failed:', err?.message || err);
  }
  return '';
}

/**
 * @returns {{ description: string, categoryId: number|null, categoryName: string|null, tags: string[] }}
 */
export async function suggestLibraryMetadata({
  agencyId,
  name = '',
  filename = '',
  mimeType = '',
  textExcerpt = '',
  url = ''
}) {
  const categories = await Library.listCategories(agencyId, { includeArchived: false });
  const categoryLines = (categories || [])
    .map((c) => `- id=${c.id} slug=${c.slug} name=${c.name}`)
    .join('\n');

  const excerpt = String(textExcerpt || '').trim().slice(0, 8000);
  const prompt = [
    'You classify a healthcare / school counseling Library resource for staff.',
    'Return ONLY valid JSON with keys: description (string, 1-3 sentences, when/why to use), categoryId (number or null from the list), tags (array of 2-6 short tags).',
    'Do not invent category ids. If unsure, categoryId null.',
    '',
    `Resource name: ${name || filename || 'Untitled'}`,
    `Filename: ${filename || ''}`,
    `MIME: ${mimeType || ''}`,
    url ? `URL: ${url}` : '',
    '',
    'Available categories:',
    categoryLines || '(none)',
    '',
    'Content excerpt (may be empty):',
    excerpt || '(no extractable text — infer from name/filename only)'
  ].filter(Boolean).join('\n');

  let parsed = null;
  try {
    const out = await callGeminiText({
      prompt,
      temperature: 0.2,
      maxOutputTokens: 500
    });
    parsed = safeJsonFromModel(out?.text);
  } catch (err) {
    console.warn('[librarySuggest] gemini failed:', err?.message || err);
  }

  if (!parsed || typeof parsed !== 'object') {
    const fallbackDesc = name || filename
      ? `Staff resource: ${String(name || filename).replace(/\.[^.]+$/, '')}.`
      : 'Staff library resource.';
    return {
      description: fallbackDesc,
      categoryId: null,
      categoryName: null,
      tags: []
    };
  }

  const allowedIds = new Set((categories || []).map((c) => Number(c.id)));
  let categoryId = parsed.categoryId != null ? Number(parsed.categoryId) : null;
  if (!Number.isFinite(categoryId) || !allowedIds.has(categoryId)) categoryId = null;
  const cat = categoryId ? (categories || []).find((c) => Number(c.id) === categoryId) : null;

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    description: String(parsed.description || '').trim() || null,
    categoryId,
    categoryName: cat?.name || null,
    tags
  };
}

export default {
  suggestLibraryMetadata,
  extractTextFromUploadBuffer
};
