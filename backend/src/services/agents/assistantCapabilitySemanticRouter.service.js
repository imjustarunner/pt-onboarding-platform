/**
 * Closed-catalog semantic router for Ask Assistant.
 *
 * Local TF–IDF + cosine similarity over capability prompts / hints / examples.
 * No LLM and no network — picks which capability (tool plan) fits the ask.
 * Write / sensitive capabilities should set softRoute: false and stay on hard matchers.
 */

const ROUTER_STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'me', 'i', 'im', 'i\'m', 'to', 'for', 'of', 'and', 'or', 'with',
  'on', 'in', 'at', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did',
  'what', 'whats', 'what\'s', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'show', 'open', 'find', 'go', 'please', 'can', 'could', 'would', 'should', 'just',
  'some', 'any', 'this', 'that', 'these', 'those', 'from', 'into', 'about', 'up',
  'out', 'so', 'if', 'then', 'than', 'too', 'very', 'also', 'here', 'there', 'now',
  'you', 'your', 'we', 'our', 'us', 'they', 'them', 'their'
]);

/** Minimum cosine similarity to accept a semantic route. */
export const SEMANTIC_MIN_SCORE = 0.18;
/** Winner must beat 2nd place by at least this margin. */
export const SEMANTIC_MARGIN = 0.045;

export function tokenizeForCapabilityRouting(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'_-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, '').trim())
    .filter((t) => t.length >= 2 && !ROUTER_STOPWORDS.has(t));
}

/**
 * Flatten a catalog entry into searchable document text.
 */
export function buildCapabilityDocumentText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const parts = [
    String(entry.id || '').replace(/_/g, ' '),
    entry.prompt,
    entry.group,
    entry.subtitleTag,
    ...(Array.isArray(entry.routeHints) ? entry.routeHints : []),
    ...(Array.isArray(entry.semanticExamples) ? entry.semanticExamples : [])
  ];
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('\n');
}

function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

function buildIdf(docsTokens) {
  const n = docsTokens.length || 1;
  const df = new Map();
  for (const toks of docsTokens) {
    for (const t of new Set(toks)) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [t, d] of df) {
    idf.set(t, Math.log((n + 1) / (d + 1)) + 1);
  }
  return idf;
}

function weightedVector(tf, idf) {
  const vec = new Map();
  let sumSq = 0;
  for (const [t, f] of tf) {
    const idfW = idf.get(t);
    if (!idfW) continue;
    const w = (1 + Math.log(f)) * idfW;
    if (w <= 0) continue;
    vec.set(t, w);
    sumSq += w * w;
  }
  return { vec, norm: Math.sqrt(sumSq) };
}

function cosineSimilarity(a, b) {
  if (!a?.norm || !b?.norm) return 0;
  let dot = 0;
  const [smaller, larger] = a.vec.size <= b.vec.size ? [a, b] : [b, a];
  for (const [t, w] of smaller.vec) {
    const o = larger.vec.get(t);
    if (o) dot += w * o;
  }
  return dot / (a.norm * b.norm);
}

/**
 * Rank eligible catalog entries by cosine similarity to the prompt.
 * @returns {Array<{ entry: object, score: number, capabilityId: string }>}
 */
export function rankCapabilitiesBySimilarity({ prompt, entries }) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const qTokens = tokenizeForCapabilityRouting(prompt);
  if (!qTokens.length || !list.length) return [];

  const docsTokens = list.map((e) => tokenizeForCapabilityRouting(buildCapabilityDocumentText(e)));
  const idf = buildIdf([...docsTokens, qTokens]);
  const qVec = weightedVector(termFreq(qTokens), idf);

  const ranked = [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const dVec = weightedVector(termFreq(docsTokens[i]), idf);
    const score = cosineSimilarity(qVec, dVec);
    if (score <= 0) continue;
    ranked.push({
      entry,
      score,
      capabilityId: String(entry.id || '')
    });
  }
  ranked.sort((a, b) => b.score - a.score || String(a.capabilityId).localeCompare(String(b.capabilityId)));
  return ranked;
}

/**
 * Pick a clear winner, or null if confidence / margin is too low.
 */
export function pickBestCapabilityBySimilarity({
  prompt,
  entries,
  minScore = SEMANTIC_MIN_SCORE,
  margin = SEMANTIC_MARGIN
} = {}) {
  const ranked = rankCapabilitiesBySimilarity({ prompt, entries });
  if (!ranked.length) return null;
  const best = ranked[0];
  if (best.score < minScore) return null;
  const second = ranked[1];
  if (second && best.score - second.score < margin) return null;
  return best;
}
