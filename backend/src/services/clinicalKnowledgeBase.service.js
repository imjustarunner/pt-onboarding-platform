import StorageService from './storage.service.js';
import { extractResumeTextFromUpload } from './resumeTextExtraction.service.js';
import {createHash} from 'node:crypto';

const DEFAULT_REFRESH_MINUTES = 30;
const DEFAULT_MAX_DOCS = 100;
/** Allow large Documentation Hub / coding PDFs; text is still truncated after extract. */
const DEFAULT_MAX_DOC_BYTES = 25_000_000;
/** References can exceed the resume-upload limit; the full evidence pack still
 * enforces its own 900k budget and fails closed instead of omitting content. */
const DEFAULT_MAX_DOC_CHARS = 900_000;
const DEFAULT_SNIPPET_CHARS = 1200;

/**
 * Documentation Hub generation: include every document from the tool's KB folders.
 * Examples / guides are packed first at full extracted length.
 */
const NOTE_AID_MAX_CHARS = 150_000;
const NOTE_AID_MAX_DOCS = 100;
const NOTE_AID_SNIPPET_CHARS = 200_000;

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
  if (ct==='text/markdown')return 'text/plain';
  if (ct && ct!=='application/octet-stream') return ct;
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt') || name.endsWith('.md')) return 'text/plain';
  if (name.endsWith('.docx'))return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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

function basenameLower(name) {
  const n = String(name || '');
  const parts = n.split('/');
  return String(parts[parts.length - 1] || n).toLowerCase();
}

function isTrainingDocName(docName = '') {
  return styleDocBoost(docName) >= 600;
}

function isExampleDocName(docName = '') {
  return /approved|verified|example/.test(String(docName || '').toLowerCase());
}

/**
 * Filename / path boost so style anchors win over keyword-matched diagnoses PDFs.
 * Exported for unit tests.
 */
export function styleDocBoost(docName = '') {
  const name = String(docName || '').toLowerCase();
  let boost = 0;
  if (/approved|verified|example/.test(name)) boost += 1200;
  if (/note\s*aid|clinical\s*note\s*aid|note_aid|aid and guide/.test(name)) boost += 900;
  if (/\bsop\b|progress\s*note|template/.test(name)) boost += 600;
  if (/billing|code\s*list|medicaid/.test(name)) boost += 200;
  // Prefer tool-specific folder copies over shared/ duplicates.
  if (name.includes('/') && !name.startsWith('shared/')) boost += 300;
  return boost;
}

/**
 * Prefer starting the snippet at clinical/example content, not a cover page.
 * Exported for unit tests.
 */
export function pickClinicalSnippet(text, maxLen, { preferClinical = false } = {}) {
  const t = String(text || '');
  if (!maxLen) return t;
  if (!preferClinical) return safeTruncate(t, maxLen);

  const markers = [
    /approved\s+and\s+verified/i,
    /example\s*#?\s*1\b/i,
    /example\s+\d+/i,
    /\bSubjective\s*:/i,
    /\bSymptom Description/i,
    /\bObjective Content/i,
    /\bInterventions Used/i,
    /\bProgress Note\b/i
  ];
  let start = 0;
  for (const re of markers) {
    const m = t.search(re);
    if (m >= 0) {
      start = m;
      break;
    }
  }
  return safeTruncate(t.slice(start), maxLen);
}

function hintBoost(doc, codeHints = [], titleHints = []) {
  const hay = `${doc.name || ''}\n${String(doc.text || '').slice(0, 4000)}`.toLowerCase();
  let boost = 0;
  for (const code of codeHints || []) {
    const c = String(code || '').trim().toLowerCase();
    if (c.length >= 3 && hay.includes(c)) boost += 250;
  }
  for (const title of titleHints || []) {
    const words = String(title || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 4)
      .slice(0, 8);
    for (const w of words) {
      if (hay.includes(w)) boost += 40;
    }
  }
  return boost;
}

function dedupeDocs(docs) {
  const byBase = new Map();
  for (const doc of docs || []) {
    const base = basenameLower(doc.name);
    if (!base) continue;
    const existing = byBase.get(base);
    if (!existing || styleDocBoost(doc.name) >= styleDocBoost(existing.name)) {
      byBase.set(base, doc);
    }
  }
  return Array.from(byBase.values());
}

/**
 * Rank + pack KB docs into a prompt context string.
 * Exported for unit tests (no GCS).
 */
export function buildKnowledgeBaseContextFromDocs(
  docs,
  {
    query = '',
    maxChars = 4000,
    maxDocs = 5,
    requireScore = false,
    codeHints = [],
    titleHints = [],
    prioritizeStyleDocs = false,
    /** When true (Documentation Hub): include every folder doc; never drop examples/training. */
    includeAllTrainingDocs = false,
    maxSnippetChars = DEFAULT_SNIPPET_CHARS
  } = {}
) {
  if (!Array.isArray(docs) || !docs.length) return '';

  const uniqueDocs = dedupeDocs(docs);

  const queryText = String(query || '').toLowerCase();
  const STOP = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our',
    'out', 'has', 'have', 'been', 'what', 'whats', "what's", 'where', 'when', 'who', 'how', 'why',
    'does', 'did', 'about', 'with', 'from', 'this', 'that', 'they', 'them', 'their', 'your', 'into',
    'please', 'tell', 'me', 'find', 'look', 'looking', 'explain', 'define', 'meaning', 'which',
    'code', 'codes'
  ]);
  const terms = queryText
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t))
    .slice(0, 20);

  const ranked = uniqueDocs
    .map((doc) => {
      const textScore = scoreDocument(String(doc.text || '').toLowerCase(), terms);
      const style = prioritizeStyleDocs || includeAllTrainingDocs ? styleDocBoost(doc.name) : 0;
      const hints = hintBoost(doc, codeHints, titleHints);
      return {
        ...doc,
        textScore,
        styleBoost: style,
        score: textScore + style + hints
      };
    })
    .sort((a, b) => b.score - a.score || b.styleBoost - a.styleBoost);

  let selected;
  if (includeAllTrainingDocs) {
    // Every document in the tool's folders — no keyword filter, no top-N drop of training.
    selected = [...ranked].sort((a, b) => {
      const aEx = isExampleDocName(a.name) ? 2 : isTrainingDocName(a.name) ? 1 : 0;
      const bEx = isExampleDocName(b.name) ? 2 : isTrainingDocName(b.name) ? 1 : 0;
      if (bEx !== aEx) return bEx - aEx;
      return (b.styleBoost || 0) - (a.styleBoost || 0) || (b.score || 0) - (a.score || 0);
    });
  } else {
    selected = ranked.filter((d) => d.textScore > 0 || (prioritizeStyleDocs && d.styleBoost > 0)).slice(0, maxDocs);

    if (prioritizeStyleDocs) {
      const stylePinned = ranked
        .filter((d) => d.styleBoost >= 600)
        .sort((a, b) => b.styleBoost - a.styleBoost);
      const merged = [];
      const seen = new Set();
      for (const doc of [...stylePinned, ...selected]) {
        const key = basenameLower(doc.name);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(doc);
        if (merged.length >= maxDocs) break;
      }
      selected = merged;
    }
  }

  const fallback = selected.length
    ? selected
    : requireScore
      ? []
      : ranked.slice(0, Math.min(maxDocs, ranked.length));

  const packOrder = includeAllTrainingDocs || prioritizeStyleDocs
    ? fallback
    : fallback;

  const chunks = [];
  const includedNames = [];
  for (const doc of packOrder) {
    if (chunks.join('\n\n').length >= maxChars) break;
    if (includedNames.length >= maxDocs && !includeAllTrainingDocs) break;

    const isStyle = isTrainingDocName(doc.name);
    const isExample = isExampleDocName(doc.name);
    // Training/examples: use full extracted text (up to stored length). Never clip to a scrap.
    let snippetBudget = maxSnippetChars;
    if (includeAllTrainingDocs && (isExample || isStyle)) {
      snippetBudget = Math.max(maxSnippetChars, String(doc.text || '').length || NOTE_AID_SNIPPET_CHARS);
    } else if (prioritizeStyleDocs && isExample) {
      snippetBudget = Math.max(maxSnippetChars, String(doc.text || '').length || NOTE_AID_SNIPPET_CHARS);
    } else if (prioritizeStyleDocs && isStyle) {
      snippetBudget = Math.max(maxSnippetChars, String(doc.text || '').length || NOTE_AID_SNIPPET_CHARS);
    }

    const snippet = pickClinicalSnippet(doc.text, snippetBudget, {
      preferClinical: isExample || isStyle
    });
    if (!snippet) continue;
    chunks.push(`[Doc: ${doc.name}]\n${snippet}`);
    includedNames.push(doc.name);
  }

  return safeTruncate(chunks.join('\n\n'), maxChars);
}

/** Defaults used by Documentation Hub / clinical note generation — all folder training, full examples. */
export function noteAidKnowledgeBaseOptions(overrides = {}) {
  return {
    maxChars: NOTE_AID_MAX_CHARS,
    maxDocs: NOTE_AID_MAX_DOCS,
    maxSnippetChars: NOTE_AID_SNIPPET_CHARS,
    prioritizeStyleDocs: true,
    includeAllTrainingDocs: true,
    ...overrides
  };
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

  const [files,nextQuery] = await bucket.getFiles({
    prefix: prefix || undefined,
    maxResults: Math.max(1, maxDocs)+1,
    autoPaginate:false
  });

  const docs = [];
  const coverage={complete:!nextQuery && (files || []).length<=maxDocs,listingLimited:!!nextQuery || (files || []).length>maxDocs,unreadable:0,truncated:0,issues:[]};
  const issue=(name,reason)=>coverage.issues.push({id:createHash('sha256').update(String(name || '')).digest('hex'),reason});
  for (const file of files || []) {
    if (docs.length >= maxDocs) {coverage.complete=false;coverage.listingLimited=true;break;}
    try {
      const [metadata] = await file.getMetadata();
      const size = Number.parseInt(metadata?.size || '0', 10);
      if (Number.isFinite(size) && size > maxDocBytes) {coverage.complete=false;coverage.unreadable++;issue(file.name,'file_size_limit');continue;}
      // Skip folder placeholder objects.
      if (!file.name || file.name.endsWith('/')) continue;

      const mimeType = pickMimeType(file.name, metadata?.contentType);
      if (/\.(?:doc|rtf|pptx?|odt)$/i.test(file.name)) {
        coverage.complete=false;coverage.unreadable++;issue(file.name,'unsupported_format');continue;
      }
      if (!mimeType) continue;
      if (!['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/docx'].includes(mimeType)) {
        continue;
      }

      const [buffer] = await file.download();
      const result = await extractResumeTextFromUpload({ buffer, mimeType, maxChars: maxDocChars });
      if (result?.status !== 'completed' || !result?.text) {coverage.complete=false;coverage.unreadable++;issue(file.name,'text_extraction_failed');continue;}

      const truncated=result.truncated===true || result.text.length>maxDocChars;
      if(truncated){coverage.complete=false;coverage.truncated++;issue(file.name,'text_extraction_limit');}

      docs.push({
        name: file.name,
        text: safeTruncate(result.text, maxDocChars),truncated,
        binaryHash:createHash('sha256').update(buffer).digest('hex'),
        version:String(metadata?.generation || metadata?.etag || metadata?.updated || '')
      });
    } catch {
      coverage.complete=false;coverage.unreadable++;issue(file.name,'source_read_failed');
    }
  }

  Object.defineProperty(docs,'coverage',{value:coverage,enumerable:false});
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

export async function getKnowledgeBaseContext({
  query,
  maxChars = 4000,
  maxDocs = 5,
  folders = [],
  requireScore = false,
  codeHints = [],
  titleHints = [],
  prioritizeStyleDocs = false,
  includeAllTrainingDocs = false,
  maxSnippetChars = DEFAULT_SNIPPET_CHARS
} = {}) {
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

  return buildKnowledgeBaseContextFromDocs(docs, {
    query,
    maxChars,
    maxDocs,
    requireScore,
    codeHints,
    titleHints,
    prioritizeStyleDocs,
    includeAllTrainingDocs,
    maxSnippetChars
  });
}

/** Full selected training corpus, with explicit coverage rather than silent clipping. */
export function buildKnowledgeBaseEvidenceFromDocs(docs,{maxChars=900000,coverage={}}={}) {
  const digest=value=>createHash('sha256').update(String(value)).digest('hex');
  const unique=new Map();
  for(const doc of docs || []){const hash=digest(doc.text || '');if(!unique.has(hash))unique.set(hash,doc);}
  const chunks=[],documents=[];let characters=0,incomplete=coverage.complete===false;
  for(const [hash,doc] of [...unique].sort((a,b)=>styleDocBoost(b[1].name)-styleDocBoost(a[1].name)||String(a[1].name).localeCompare(String(b[1].name)))){
    const text=String(doc.text || '').trim(),id=digest(doc.name || hash);
    const role=doc.scopedReference?'official_service_reference':isExampleDocName(doc.name)?'authored_example':isTrainingDocName(doc.name)?'authored_training':'supporting_reference';
    const content=`[Supporting reference ${documents.length+1}; ${role}]\n${text}`;
    const included=!!text && !doc.truncated && characters+content.length+2<=maxChars;
    documents.push({id,contentHash:hash,binaryHash:doc.binaryHash || null,version:doc.version || hash,role,characters:text.length,included,complete:!doc.truncated,scopedReference:!!doc.scopedReference});
    if(included){chunks.push(content);characters+=content.length+2;}else incomplete=true;
  }
  return {text:chunks.join('\n\n'),documents,complete:documents.length>0 && !incomplete,coverage:{...coverage,complete:documents.length>0 && !incomplete,totalDocuments:documents.length,includedDocuments:documents.filter(d=>d.included).length,maxChars}};
}

export async function getKnowledgeBaseEvidence({folders=[],maxChars=900000,referenceReplacements=[],...options}={}) {
  if(!resolveKnowledgeBaseBucket())return {text:'',documents:[],complete:false,coverage:{complete:false,reason:'not_configured'}};
  const prefixes=[...new Set((folders.length?folders:['']).map(normalizeFolderPrefix))];
  const batches=await Promise.all(prefixes.map(prefix=>getKnowledgeBaseDocs(prefix || null)));
  const replacements=new Map(referenceReplacements.filter(r=>r.binaryHash && r.text).map(r=>[r.binaryHash,r]));
  const docs=batches.flat().map(doc=>{const replacement=replacements.get(doc.binaryHash);return replacement?{...doc,text:replacement.text,truncated:false,scopedReference:true}:doc;});
  const unreadable=batches.reduce((n,b)=>n+(b.coverage?.unreadable || 0),0),listingLimited=batches.some(b=>b.coverage?.listingLimited===true);
  const emptyFolders=batches.filter(batch=>!batch.length).length;
  const coverage={complete:!unreadable && !listingLimited && !emptyFolders,folders:prefixes.length,emptyFolders,unreadable,listingLimited,truncated:docs.filter(doc=>doc.truncated).length,
    folderCoverage:batches.map((batch,index)=>({id:createHash('sha256').update(prefixes[index]).digest('hex'),documents:batch.length,listingLimited:!!batch.coverage?.listingLimited,unreadable:batch.coverage?.unreadable || 0})),
    issues:batches.flatMap(batch=>batch.coverage?.issues || []).filter(issue=>issue.reason!=='text_extraction_limit' || docs.some(doc=>doc.truncated && createHash('sha256').update(doc.name).digest('hex')===issue.id))};
  return buildKnowledgeBaseEvidenceFromDocs(docs,{...options,maxChars,coverage});
}

export async function getKnowledgeBaseStatus({ refresh = false } = {}) {
  const bucketName = resolveKnowledgeBaseBucket();
  const prefix = String(process.env.CLINICAL_KB_PREFIX || '').trim();
  const ttlMs = getCacheTtlMs();
  const now = Date.now();

  if (refresh) {
    resetClinicalKnowledgeBaseCache();
    await getKnowledgeBaseDocs();
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

export function resetClinicalKnowledgeBaseCache() {
  kbCache.loadedAt=0;kbCache.docs=[];kbCache.byPrefix.clear();
}
