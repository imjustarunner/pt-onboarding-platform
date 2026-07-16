import StorageService from './storage.service.js';
import { extractResumeTextFromUpload } from './resumeTextExtraction.service.js';
import AgencyTrainingKbDocument from '../models/AgencyTrainingKbDocument.model.js';
import GoogleDocsService from './googleDocs.service.js';

const DEFAULT_MAX_DOC_CHARS = 20_000;
const DEFAULT_MAX_DOC_BYTES = 2_000_000;
const ALLOWED_FOLDERS = new Set(['handbook', 'policies']);
/** How often linked Google Docs are re-exported into the KB snapshot. */
const GOOGLE_DOC_REFRESH_TTL_MS = 15 * 60 * 1000;

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

const QUERY_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our',
  'out', 'has', 'have', 'been', 'what', 'whats', "what's", 'where', 'when', 'who', 'how', 'why',
  'does', 'did', 'about', 'with', 'from', 'this', 'that', 'they', 'them', 'their', 'your', 'into',
  'company', 'workplace', 'employee', 'please', 'tell', 'me', 'find', 'look', 'looking', 'explain',
  'policy', 'policies', 'handbook', 'according', 'say', 'says', 'said', 'any', 'some'
]);

function tokenizeQuery(query) {
  const queryText = String(query || '').toLowerCase();
  const raw = queryText
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 32);

  // Prefer meaningful terms; keep short tokens like "pto" / "fmla".
  const preferred = raw.filter((t) => t.length >= 3 || /^(pto|fmla|hr|loa)$/.test(t));
  const filtered = preferred.filter((t) => !QUERY_STOPWORDS.has(t));
  const terms = filtered.length ? filtered : preferred;
  return Array.from(new Set(terms)).slice(0, 24);
}

/** Pull local windows around matching terms so PTO/policy answers aren't just doc prefixes. */
function extractBestSnippets(text, terms, { maxSnippets = 3, windowChars = 700 } = {}) {
  const raw = String(text || '');
  if (!raw) return [];
  const lower = raw.toLowerCase();
  if (!terms.length) return [safeTruncate(raw, windowChars)];

  const windows = [];
  for (const term of terms) {
    if (!term) continue;
    let idx = lower.indexOf(term);
    let hits = 0;
    while (idx !== -1 && hits < 8) {
      const pad = Math.floor(windowChars / 3);
      const start = Math.max(0, idx - pad);
      const end = Math.min(raw.length, idx + term.length + (windowChars - pad));
      windows.push({ start, end, weight: term.length >= 3 ? 2 : 1 });
      idx = lower.indexOf(term, idx + term.length);
      hits += 1;
    }
  }
  if (!windows.length) return [safeTruncate(raw, windowChars)];

  windows.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end + 40) {
      last.end = Math.max(last.end, w.end);
      last.weight += w.weight;
    } else {
      merged.push({ ...w });
    }
  }
  merged.sort((a, b) => b.weight - a.weight || a.start - b.start);

  const snippets = [];
  for (const w of merged.slice(0, maxSnippets)) {
    let slice = raw.slice(w.start, w.end).replace(/\s+/g, ' ').trim();
    if (w.start > 0) slice = `…${slice}`;
    if (w.end < raw.length) slice = `${slice}…`;
    if (slice) snippets.push(safeTruncate(slice, windowChars + 40));
  }
  return snippets;
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

  invalidateTrainingKbCache(agencyId);
  return row;
}

function normalizeGoogleDocSourceUrl(docUrl) {
  if (!GoogleDocsService.isValidGoogleDocUrl(docUrl)) {
    const err = new Error('Enter a valid Google Docs link (docs.google.com/document/d/…)');
    err.status = 400;
    throw err;
  }
  const idMatch = String(docUrl).match(/\/d\/([a-zA-Z0-9-_]+)/);
  const documentId = idMatch?.[1];
  if (!documentId) {
    const err = new Error('Could not read the Google Doc id from that link');
    err.status = 400;
    throw err;
  }
  // Canonical share URL so the same doc upserts cleanly.
  return {
    documentId,
    sourceUrl: `https://docs.google.com/document/d/${documentId}/edit`
  };
}

/**
 * Paste a public ("Anyone with the link") Google Doc URL and store a PDF snapshot in the KB.
 * Re-saving the same link refreshes the existing row.
 */
export async function linkGoogleDocToTrainingKb({
  agencyId,
  folder,
  docUrl,
  uploadedByUserId,
  displayName = null
}) {
  const { documentId, sourceUrl } = normalizeGoogleDocSourceUrl(docUrl);
  const safeFolder = ALLOWED_FOLDERS.has(folder) ? folder : 'handbook';

  let buffer;
  try {
    buffer = await GoogleDocsService.downloadGoogleDocAsPDF(sourceUrl);
  } catch (e) {
    const err = new Error(e?.message || 'Failed to download Google Doc');
    err.status = /not publicly|403|accessible/i.test(String(e?.message || '')) ? 400 : 502;
    throw err;
  }
  if (!buffer?.length) {
    const err = new Error('Google Doc download returned an empty file');
    err.status = 502;
    throw err;
  }

  const label = String(displayName || '').trim() || (safeFolder === 'policies' ? 'Workplace_Policies' : 'Workplace_Handbook');
  const safeName = sanitizeTrainingKbFileName(`${label}_${documentId}.pdf`);
  const gcsPath = `${getTrainingKbGcsPrefix(agencyId, safeFolder)}${safeName}`;
  const syncedAt = new Date();

  const bucket = await StorageService.getGCSBucket();
  await bucket.file(gcsPath).save(buffer, { contentType: 'application/pdf' });

  const existing = await AgencyTrainingKbDocument.findByAgencyAndSourceUrl(agencyId, sourceUrl);
  let row;
  if (existing?.id) {
    // Drop old GCS object if the path changed (folder/name rename).
    if (existing.gcs_path && existing.gcs_path !== gcsPath) {
      try {
        await bucket.file(existing.gcs_path).delete({ ignoreNotFound: true });
      } catch {
        /* noop */
      }
    }
    row = await AgencyTrainingKbDocument.updateSnapshot(existing.id, {
      folder: safeFolder,
      fileName: safeName,
      gcsPath,
      contentType: 'application/pdf',
      sizeBytes: buffer.length,
      uploadedByUserId,
      sourceUrl,
      sourceKind: 'google_doc',
      lastSyncedAt: syncedAt
    });
  } else {
    row = await AgencyTrainingKbDocument.create({
      agencyId,
      folder: safeFolder,
      fileName: safeName,
      gcsPath,
      contentType: 'application/pdf',
      sizeBytes: buffer.length,
      uploadedByUserId,
      sourceUrl,
      sourceKind: 'google_doc',
      lastSyncedAt: syncedAt
    });
  }

  invalidateTrainingKbCache(agencyId);
  return row;
}

export async function refreshTrainingKbGoogleDoc(doc, { uploadedByUserId = null } = {}) {
  if (!doc?.id || !doc.source_url || String(doc.source_kind || '') !== 'google_doc') {
    const err = new Error('That document is not a linked Google Doc');
    err.status = 400;
    throw err;
  }
  return linkGoogleDocToTrainingKb({
    agencyId: doc.agency_id,
    folder: doc.folder,
    docUrl: doc.source_url,
    uploadedByUserId: uploadedByUserId || doc.uploaded_by_user_id,
    displayName: String(doc.file_name || '').replace(/_[A-Za-z0-9-]+\.pdf$/i, '') || null
  });
}

function isGoogleDocStale(row, nowMs = Date.now()) {
  if (!row?.source_url || String(row.source_kind || '') !== 'google_doc') return false;
  if (!row.last_synced_at) return true;
  const synced = new Date(row.last_synced_at).getTime();
  if (!Number.isFinite(synced)) return true;
  return nowMs - synced >= GOOGLE_DOC_REFRESH_TTL_MS;
}

/** Best-effort refresh of stale linked Google Docs before answering from the KB. */
async function refreshStaleGoogleDocs(rows) {
  const now = Date.now();
  for (const row of rows || []) {
    if (!isGoogleDocStale(row, now)) continue;
    try {
      await refreshTrainingKbGoogleDoc(row);
    } catch (e) {
      console.warn(
        '[trainingKnowledgeBase] Google Doc refresh failed',
        row?.id,
        e?.message || e
      );
    }
  }
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
  invalidateTrainingKbCache(doc.agency_id);
  return true;
}

async function loadAgencyKbDocs(agencyId, folders) {
  const rows = await AgencyTrainingKbDocument.findByAgencyId(agencyId);
  const folderSet = new Set(
    (folders?.length ? folders : ['handbook', 'policies']).filter((f) => ALLOWED_FOLDERS.has(f))
  );
  let filtered = rows.filter((r) => folderSet.has(r.folder));
  if (!filtered.length) return [];

  // Pull fresh PDF snapshots for linked Google Docs when the TTL expires.
  await refreshStaleGoogleDocs(filtered);
  // Re-read rows after refresh so we use updated gcs paths / sizes.
  const refreshedRows = await AgencyTrainingKbDocument.findByAgencyId(agencyId);
  filtered = refreshedRows.filter((r) => folderSet.has(r.folder));
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
        text: safeTruncate(result.text, DEFAULT_MAX_DOC_CHARS),
        sourceUrl: row.source_url || null,
        sourceKind: row.source_kind || null
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
  const result = await searchTrainingKnowledgeBase({
    agencyId,
    query,
    maxDocs,
    maxSnippetsPerDoc: 3,
    snippetChars: 900,
    folders
  });
  if (!result.hits.length) return '';

  const chunks = [];
  for (const hit of result.hits) {
    if (chunks.join('\n\n').length >= maxChars) break;
    const body = (hit.snippets || []).join('\n…\n') || hit.preview || '';
    if (!body) continue;
    chunks.push(`[${hit.folder}/${hit.name}]\n${body}`);
  }

  return safeTruncate(chunks.join('\n\n'), maxChars);
}

/**
 * Structured KB search for Ask Assistant / tools.
 * Returns ranked docs with local snippets around query terms (not just doc prefixes).
 */
export async function searchTrainingKnowledgeBase({
  agencyId,
  query,
  maxDocs = 6,
  maxSnippetsPerDoc = 3,
  snippetChars = 700,
  folders = ['handbook', 'policies'],
  requireScore = false
} = {}) {
  const q = String(query || '').trim();
  const docs = await getAgencyKbDocs(agencyId, folders);
  if (!docs.length) {
    return { query: q, totalDocuments: 0, hits: [], folders };
  }

  const terms = tokenizeQuery(q);
  const ranked = docs
    .map((doc) => {
      const textLower = doc.text.toLowerCase();
      const score = scoreDocument(textLower, terms);
      const snippets = extractBestSnippets(doc.text, terms, {
        maxSnippets: maxSnippetsPerDoc,
        windowChars: snippetChars
      });
      return {
        name: doc.name,
        folder: doc.folder,
        score,
        snippets,
        preview: snippets[0] || safeTruncate(doc.text, Math.min(snippetChars, 500))
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const withHits = ranked.filter((d) => d.score > 0);
  const selected = (
    withHits.length
      ? withHits
      : requireScore
        ? []
        : ranked
  ).slice(0, maxDocs);

  return {
    query: q,
    totalDocuments: docs.length,
    hits: selected.map(({ name, folder, score, snippets, preview }) => ({
      name,
      folder,
      score,
      snippets,
      preview
    })),
    folders
  };
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
