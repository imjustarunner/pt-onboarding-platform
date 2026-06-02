import StorageService from './storage.service.js';
import { extractResumeTextFromUpload } from './resumeTextExtraction.service.js';
import AgencyTrainingKbDocument from '../models/AgencyTrainingKbDocument.model.js';

const DEFAULT_MAX_DOC_CHARS = 20_000;
const DEFAULT_MAX_DOC_BYTES = 2_000_000;
const ALLOWED_FOLDERS = new Set(['handbook', 'policies']);

const kbCache = {
  byAgency: new Map()
};

const CACHE_TTL_MS = 5 * 60 * 1000;

function safeTruncate(text, maxLen) {
  const t = String(text || '').replace(/\u0000/g, '').trim();
  if (!maxLen) return t;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function pickMimeType(fileName, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct) return ct;
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';
  return '';
}

function scoreDocument(textLower, terms) {
  if (!terms.length || !textLower) return 0;
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    let idx = textLower.indexOf(term);
    while (idx !== -1) {
      score += 1;
      idx = textLower.indexOf(term, idx + term.length);
    }
  }
  return score;
}

export function getTrainingKbGcsPrefix(agencyId, folder) {
  const f = ALLOWED_FOLDERS.has(folder) ? folder : 'handbook';
  return `training-kb/${agencyId}/${f}/`;
}

export function sanitizeTrainingKbFileName(original) {
  return String(original || 'document.pdf').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200);
}

export async function uploadTrainingKbDocument({
  agencyId,
  folder,
  buffer,
  mimeType,
  originalName,
  uploadedByUserId
}) {
  const bucket = await StorageService.getGCSBucket();
  const safeFolder = ALLOWED_FOLDERS.has(folder) ? folder : 'handbook';
  const safeName = sanitizeTrainingKbFileName(originalName);
  const gcsPath = `${getTrainingKbGcsPrefix(agencyId, safeFolder)}${safeName}`;

  const file = bucket.file(gcsPath);
  await file.save(buffer, {
    contentType: mimeType || 'application/pdf'
  });

  const row = await AgencyTrainingKbDocument.create({
    agencyId,
    folder: safeFolder,
    fileName: safeName,
    gcsPath,
    contentType: mimeType || null,
    sizeBytes: buffer?.length || null,
    uploadedByUserId
  });

  kbCache.byAgency.delete(String(agencyId));
  return row;
}

export async function deleteTrainingKbDocument(doc) {
  if (!doc?.gcs_path) return false;
  try {
    const bucket = await StorageService.getGCSBucket();
    await bucket.file(doc.gcs_path).delete({ ignoreNotFound: true });
  } catch {
    // continue to remove DB row
  }
  await AgencyTrainingKbDocument.deleteById(doc.id);
  kbCache.byAgency.delete(String(doc.agency_id));
  return true;
}

async function loadAgencyKbDocs(agencyId, folders) {
  const rows = await AgencyTrainingKbDocument.findByAgencyId(agencyId);
  const folderSet = new Set(
    (folders?.length ? folders : ['handbook', 'policies']).filter((f) => ALLOWED_FOLDERS.has(f))
  );
  const filtered = rows.filter((r) => folderSet.has(r.folder));
  if (!filtered.length) return [];

  const bucket = await StorageService.getGCSBucket();
  const docs = [];

  for (const row of filtered) {
    try {
      const file = bucket.file(row.gcs_path);
      const [metadata] = await file.getMetadata();
      const size = Number.parseInt(metadata?.size || '0', 10);
      if (Number.isFinite(size) && size > DEFAULT_MAX_DOC_BYTES) continue;

      const mimeType = pickMimeType(row.file_name, row.content_type || metadata?.contentType);
      if (mimeType !== 'application/pdf' && mimeType !== 'text/plain') continue;

      const [buffer] = await file.download();
      const result = await extractResumeTextFromUpload({ buffer, mimeType });
      if (result?.status !== 'completed' || !result?.text) continue;

      docs.push({
        name: row.file_name,
        folder: row.folder,
        text: safeTruncate(result.text, DEFAULT_MAX_DOC_CHARS)
      });
    } catch {
      // skip unreadable
    }
  }

  return docs;
}

async function getAgencyKbDocs(agencyId, folders) {
  const key = `${agencyId}:${(folders || []).join(',')}`;
  const cached = kbCache.byAgency.get(key);
  const now = Date.now();
  if (cached?.docs && now - (cached.loadedAt || 0) < CACHE_TTL_MS) {
    return cached.docs;
  }
  const docs = await loadAgencyKbDocs(agencyId, folders);
  kbCache.byAgency.set(key, { loadedAt: now, docs });
  return docs;
}

export async function getTrainingKbContext({
  agencyId,
  query,
  maxChars = 6000,
  maxDocs = 6,
  folders = ['handbook', 'policies']
} = {}) {
  const docs = await getAgencyKbDocs(agencyId, folders);
  if (!docs.length) return '';

  const queryText = String(query || '').toLowerCase();
  const terms = queryText
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 24);

  const ranked = docs
    .map((doc) => ({
      ...doc,
      score: scoreDocument(doc.text.toLowerCase(), terms)
    }))
    .sort((a, b) => b.score - a.score);

  const selected = ranked.filter((d) => d.score > 0).slice(0, maxDocs);
  const fallback = selected.length ? selected : ranked.slice(0, Math.min(maxDocs, ranked.length));

  const chunks = [];
  for (const doc of fallback) {
    if (chunks.join('\n\n').length >= maxChars) break;
    const snippet = safeTruncate(doc.text, 1400);
    chunks.push(`[${doc.folder}/${doc.name}]\n${snippet}`);
  }

  return safeTruncate(chunks.join('\n\n'), maxChars);
}

export function invalidateTrainingKbCache(agencyId) {
  if (agencyId) {
    for (const key of kbCache.byAgency.keys()) {
      if (key.startsWith(`${agencyId}:`)) kbCache.byAgency.delete(key);
    }
  } else {
    kbCache.byAgency.clear();
  }
}
