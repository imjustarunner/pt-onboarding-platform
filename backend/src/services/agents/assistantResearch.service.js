/**
 * No-LLM agency knowledge research for Ask Assistant.
 * Searches Training KB (handbook/policies) and Clinical KB when configured.
 */

import { searchTrainingKnowledgeBase } from '../trainingKnowledgeBase.service.js';
import { getKnowledgeBaseContext } from '../clinicalKnowledgeBase.service.js';

/**
 * Medicaid / HCPCS-style service codes used in this product (H2014, T1017, S9454, …).
 * Letter + 4 digits + optional modifier letter.
 */
const SERVICE_CODE_RE = /\b[A-Za-z]\d{4}[A-Za-z]?\b/g;
const SERVICE_CODE_TEST_RE = /\b[A-Za-z]\d{4}[A-Za-z]?\b/;

const RESEARCH_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our',
  'out', 'has', 'have', 'been', 'what', 'whats', "what's", 'where', 'when', 'who', 'how', 'why',
  'does', 'did', 'about', 'with', 'from', 'this', 'that', 'they', 'them', 'their', 'your', 'into',
  'please', 'tell', 'me', 'find', 'look', 'looking', 'explain', 'define', 'meaning', 'which',
  'any', 'some', 'my'
]);

export function extractServiceCodes(prompt) {
  const s = String(prompt || '');
  const found = s.match(SERVICE_CODE_RE) || [];
  return Array.from(new Set(found.map((c) => c.toUpperCase())));
}

export function extractResearchTerms(prompt) {
  const lower = String(prompt || '').toLowerCase();
  const codes = extractServiceCodes(lower).map((c) => c.toLowerCase());
  const raw = lower
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 || SERVICE_CODE_TEST_RE.test(t));
  const filtered = raw.filter((t) => !RESEARCH_STOPWORDS.has(t));
  return Array.from(new Set([...codes, ...filtered])).slice(0, 24);
}

export function looksLikeServiceCodeQuery(prompt) {
  const codes = extractServiceCodes(prompt);
  if (!codes.length) return false;
  const lower = String(prompt || '').toLowerCase().trim();
  // Don't hijack meeting/navigation prompts that casually include a code-like token.
  if (
    /\b(start|schedule|cancel|reschedule|meeting|huddle|with|navigate|take me|go to)\b/.test(lower) &&
    !/\b(what|whats|what's|explain|define|billing|documentation|service\s+code)\b/.test(lower)
  ) {
    return false;
  }
  return true;
}

/** “What codes for psychotherapy / CPT / billing” — not class lesson plans. */
export function looksLikeBillingOrServiceCodeTopic(prompt) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return false;
  if (looksLikeServiceCodeQuery(lower) || extractServiceCodes(lower).length) return true;
  if (/\b(cpt|hcpcs|billing\s+codes?|service\s+codes?|procedure\s+codes?)\b/.test(lower)) return true;
  return (
    /\bcodes?\b/.test(lower) &&
    /\b(psychotherapy|psychotherapies|therapy|therapies|counseling|counselling|treatment|medicaid|billing|service|documentation|note)\b/.test(
      lower
    )
  );
}

/**
 * Live DB questions (roster counts, caseload) — never answer from handbook PDFs.
 */
export function looksLikeOperationalDataQuery(prompt) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return false;
  if (
    /\b(how many|count|number of|# of)\b/.test(lower) &&
    /\b(client|clients|student|students|kids|caseload|roster)\b/.test(lower)
  ) {
    return true;
  }
  if (
    /\b(active|current)\b/.test(lower) &&
    /\b(client|clients|student|students)\b/.test(lower) &&
    /\b(at|for|in|with)\b/.test(lower)
  ) {
    return true;
  }
  if (
    /\b(roster|caseload)\b/.test(lower) &&
    /\b(school|elementary|middle|high|academy|program)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

/**
 * Prefer research for unanswered natural questions (incl. service codes).
 * Always safe to try — empty hits fall through to capability help.
 * Skips operational DB asks (school client counts, etc.).
 */
export function shouldAttemptAgencyResearch(prompt) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower || lower.length < 2) return false;
  if (looksLikeOperationalDataQuery(lower)) return false;
  if (looksLikeBillingOrServiceCodeTopic(lower)) return true;
  if (looksLikeServiceCodeQuery(lower) || extractServiceCodes(lower).length) return true;
  if (/\b(what|whats|what's|who|where|when|how|why|explain|define|tell me|look up|lookup|meaning)\b/.test(lower)) {
    return true;
  }
  const words = lower.split(/\s+/).filter(Boolean);
  return words.length <= 8;
}

function hitBlob(hit) {
  return [
    hit?.name,
    hit?.folder,
    hit?.preview,
    ...(Array.isArray(hit?.snippets) ? hit.snippets : [])
  ]
    .map((x) => String(x || '').toLowerCase())
    .join('\n');
}

/**
 * Keep a hit only if contentful query terms actually appear in the doc/snippet.
 * Billing-code asks also require a billing signal (code pattern / cpt / hcpcs / billing).
 */
export function hitMatchesResearchQuery(hit, prompt) {
  const blob = hitBlob(hit);
  if (!blob.trim()) return false;
  const terms = extractResearchTerms(prompt);
  if (!terms.length) return false;

  const matched = terms.filter((t) => blob.includes(t));
  if (!matched.length) return false;

  if (looksLikeBillingOrServiceCodeTopic(prompt)) {
    const hasCodeToken = SERVICE_CODE_TEST_RE.test(blob) || /\b\d{5}\b/.test(blob);
    const hasBillingLex =
      /\b(cpt|hcpcs|billing|medicaid|procedure\s+code|service\s+code|modifier|units?)\b/.test(blob);
    // Specialty term alone in a lesson plan is not enough (e.g. PCP PDFs mentioning "therapy").
    if (!hasCodeToken && !hasBillingLex) return false;
    const specialty = terms.filter((t) => !/^(code|codes|billing|service|cpt|hcpcs)$/.test(t));
    if (specialty.length && !specialty.some((t) => blob.includes(t))) return false;
  }

  if (Number(hit?.score || 0) <= 0 && matched.length < 2 && !SERVICE_CODE_TEST_RE.test(blob)) {
    return false;
  }
  return true;
}

function extractClinicalSnippets(contextText, maxSnippets = 3) {
  const raw = String(contextText || '').trim();
  if (!raw) return [];
  const blocks = raw.split(/\n(?=\[Doc:)/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  for (const block of blocks.slice(0, maxSnippets)) {
    const m = block.match(/^\[Doc:\s*([^\]]+)\]\s*([\s\S]*)$/);
    const name = (m?.[1] || 'clinical-knowledge').trim();
    const body = (m?.[2] || block).replace(/\s+/g, ' ').trim();
    if (!body) continue;
    out.push({
      kind: 'clinical',
      folder: 'clinical',
      name,
      score: 1,
      snippets: [body.slice(0, 750)],
      preview: body.slice(0, 420)
    });
  }
  return out;
}

/**
 * @returns {{
 *   query: string,
 *   hits: Array<object>,
 *   trainingToolResult: object|null,
 *   hasHits: boolean
 * }}
 */
export async function researchAgencyKnowledge({
  agencyId,
  query,
  canSearchTrainingKb = false,
  maxTrainingDocs = 5
} = {}) {
  const q = String(query || '').trim();
  const codes = extractServiceCodes(q);
  const billingTopic = looksLikeBillingOrServiceCodeTopic(q);
  // Prefer the code itself as the search needle so handbook/clinical docs match.
  let searchQuery = codes.length ? `${codes.join(' ')} ${q}`.trim() : q;
  if (billingTopic && !codes.length) {
    searchQuery = `${q} CPT HCPCS billing service code`;
  }

  const hits = [];
  let trainingToolResult = null;

  if (canSearchTrainingKb && agencyId) {
    try {
      const search = await searchTrainingKnowledgeBase({
        agencyId,
        query: searchQuery,
        maxDocs: maxTrainingDocs,
        maxSnippetsPerDoc: 3,
        snippetChars: 750,
        folders: ['handbook', 'policies'],
        requireScore: true
      });
      trainingToolResult = {
        ok: true,
        tool: 'searchTrainingKnowledgeBase',
        result: {
          query: q,
          totalDocuments: search.totalDocuments || 0,
          folders: search.folders || ['handbook', 'policies'],
          hits: (search.hits || []).map((h) => ({
            name: h.name,
            folder: h.folder,
            score: h.score,
            snippets: h.snippets || [],
            preview: h.preview || null
          }))
        }
      };
      for (const h of search.hits || []) {
        if ((h.score || 0) <= 0) continue;
        const row = {
          kind: 'training',
          folder: h.folder,
          name: h.name,
          score: h.score || 0,
          snippets: h.snippets || [],
          preview: h.preview || null
        };
        if (hitMatchesResearchQuery(row, q)) hits.push(row);
      }
    } catch (e) {
      console.warn('[assistantResearch] Training KB search failed', e?.message || e);
    }
  }

  try {
    const clinicalCtx = await getKnowledgeBaseContext({
      query: searchQuery,
      maxChars: 4500,
      maxDocs: 4,
      folders: [],
      requireScore: true
    });
    if (clinicalCtx) {
      const clinicalHits = extractClinicalSnippets(clinicalCtx);
      for (const ch of clinicalHits) {
        if (hitMatchesResearchQuery(ch, q)) hits.push(ch);
      }
    }
  } catch (e) {
    console.warn('[assistantResearch] Clinical KB search failed', e?.message || e);
  }

  // Only backfill for explicit letter+digit service codes, never generic "what …".
  if (!hits.length && trainingToolResult?.result?.hits?.length && codes.length) {
    for (const h of trainingToolResult.result.hits.slice(0, 3)) {
      const row = {
        kind: 'training',
        folder: h.folder,
        name: h.name,
        score: h.score || 0,
        snippets: h.snippets || [],
        preview: h.preview || null
      };
      if (hitMatchesResearchQuery(row, q)) hits.push(row);
    }
  }

  return {
    query: q,
    hits,
    trainingToolResult,
    hasHits: hits.length > 0
  };
}

export function buildResearchAssistantText(research) {
  const q = research?.query || 'that';
  const hits = research?.hits || [];
  if (!hits.length) return '';

  const parts = [`Here’s what I found in your agency documents for “${q}”:`];
  for (const h of hits.slice(0, 5)) {
    const source =
      h.kind === 'clinical'
        ? `clinical/${h.name}`
        : `${h.folder || 'handbook'}/${h.name || 'document'}`;
    const snips = (h.snippets && h.snippets.length ? h.snippets : [h.preview]).filter(Boolean);
    parts.push(`\n• ${source}`);
    for (const snip of snips.slice(0, 2)) {
      parts.push(`  ${String(snip)}`);
    }
  }
  parts.push(
    `\nSourced from uploaded agency knowledge — verify against the full document for decisions.`
  );
  return parts.join('\n');
}
