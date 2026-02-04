import StorageService from './storage.service.js';
import { extractResumeTextFromUpload } from './resumeTextExtraction.service.js';

const DEFAULT_REFRESH_MINUTES = 30;
const DEFAULT_MAX_DOCS = 50;
const DEFAULT_MAX_DOC_BYTES = 2_000_000;
const DEFAULT_MAX_DOC_CHARS = 20_000;

const kbCache = {
  loadedAt: 0,
  docs: [],
  byPrefix: new Map()
};

function safeTruncate(text, maxLen) {
  const t = String(text || '').replace(/\u0000/g, '').trim();
  if (!maxLen) return t;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function getEnvNumber(name, fallback) {
  const raw = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(raw) ? raw : fallback;
}

function getCacheTtlMs() {
  const minutes = getEnvNumber('CLINICAL_KB_REFRESH_MINUTES', DEFAULT_REFRESH_MINUTES);
  return Math.max(1, minutes) * 60 * 1000;
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

function resolveKnowledgeBaseBucket() {
  const direct = String(process.env.CLINICAL_KB_BUCKET || '').trim();
  if (direct) return direct;
  const fallback = String(process.env.DATA_STORE_ID || '').trim();
  return fallback || '';
}

async function loadKnowledgeBaseDocs(prefixOverride = null) {
  const bucketName = resolveKnowledgeBaseBucket();
  if (!bucketName) return [];

  const prefix = prefixOverride !== null ? String(prefixOverride || '').trim() : String(process.env.CLINICAL_KB_PREFIX || '').trim();
  const maxDocs = getEnvNumber('CLINICAL_KB_MAX_DOCS', DEFAULT_MAX_DOCS);
  const maxDocBytes = getEnvNumber('CLINICAL_KB_MAX_DOC_BYTES', DEFAULT_MAX_DOC_BYTES);
  const maxDocChars = getEnvNumber('CLINICAL_KB_MAX_DOC_CHARS', DEFAULT_MAX_DOC_CHARS);

  const storage = await StorageService.getGCSStorage();
  const bucket = storage.bucket(bucketName);

  const [files] = await bucket.getFiles({
    prefix: prefix || undefined,
    maxResults: Math.max(1, maxDocs)
  });

  const docs = [];
  for (const file of files || []) {
    if (docs.length >= maxDocs) break;
    try {
      const [metadata] = await file.getMetadata();
      const size = Number.parseInt(metadata?.size || '0', 10);
      if (Number.isFinite(size) && size > maxDocBytes) continue;

      const mimeType = pickMimeType(file.name, metadata?.contentType);
      if (!mimeType) continue;
      if (mimeType !== 'application/pdf' && mimeType !== 'text/plain') continue;

      const [buffer] = await file.download();
      const result = await extractResumeTextFromUpload({ buffer, mimeType });
      if (result?.status !== 'completed' || !result?.text) continue;

      docs.push({
        name: file.name,
        text: safeTruncate(result.text, maxDocChars)
      });
    } catch {
      // Skip unreadable files to keep the KB resilient.
    }
  }

  return docs;
}

async function getKnowledgeBaseDocs(prefixOverride = null) {
  const now = Date.now();
  const key = prefixOverride ? String(prefixOverride || '').trim() : '';
  if (key) {
    const cached = kbCache.byPrefix.get(key);
    if (cached?.docs?.length && now - (cached.loadedAt || 0) < getCacheTtlMs()) {
      return cached.docs;
    }
    const docs = await loadKnowledgeBaseDocs(key);
    kbCache.byPrefix.set(key, { loadedAt: now, docs });
    return docs;
  }
  if (kbCache.docs.length && now - kbCache.loadedAt < getCacheTtlMs()) {
    return kbCache.docs;
  }

  const docs = await loadKnowledgeBaseDocs();
  kbCache.docs = docs;
  kbCache.loadedAt = now;
  return docs;
}

function normalizeFolderPrefix(folder) {
  const raw = String(folder || '').trim().replace(/^\//, '');
  if (!raw) return '';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export async function getKnowledgeBaseContext({ query, maxChars = 4000, maxDocs = 5, folders = [] } = {}) {
  const bucketName = resolveKnowledgeBaseBucket();
  if (!bucketName) return '';

  let docs = [];
  if (Array.isArray(folders) && folders.length) {
    const prefixes = Array.from(
      new Set(
        folders
          .map(normalizeFolderPrefix)
          .filter(Boolean)
      )
    );
    const merged = [];
    for (const prefix of prefixes) {
      const prefDocs = await getKnowledgeBaseDocs(prefix);
      merged.push(...prefDocs);
    }
    docs = merged;
  } else {
    docs = await getKnowledgeBaseDocs();
  }
  if (!docs.length) return '';

  const queryText = String(query || '').toLowerCase();
  const terms = queryText
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 20);

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
    const snippet = safeTruncate(doc.text, 1200);
    chunks.push(`[Doc: ${doc.name}]\n${snippet}`);
  }

  return safeTruncate(chunks.join('\n\n'), maxChars);
}

export async function getKnowledgeBaseStatus({ refresh = false } = {}) {
  const bucketName = resolveKnowledgeBaseBucket();
  const prefix = String(process.env.CLINICAL_KB_PREFIX || '').trim();
  const ttlMs = getCacheTtlMs();
  const now = Date.now();

  if (refresh) {
    await getKnowledgeBaseDocs();
    kbCache.byPrefix.clear();
  }

  const loaded = kbCache.loadedAt > 0;
  const stale = loaded ? now - kbCache.loadedAt > ttlMs : true;

  return {
    bucket: bucketName || null,
    prefix: prefix || null,
    loaded,
    stale,
    docCount: kbCache.docs.length,
    loadedAt: loaded ? new Date(kbCache.loadedAt).toISOString() : null,
    nextRefreshAt: loaded ? new Date(kbCache.loadedAt + ttlMs).toISOString() : null,
    ttlMinutes: Math.round(ttlMs / 60000)
  };
}
