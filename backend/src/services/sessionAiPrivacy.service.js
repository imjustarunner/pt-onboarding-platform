import crypto from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { callGeminiText } from './geminiText.service.js';
import { isChatEncryptionConfigured } from './chatEncryption.service.js';

const fail = () => Object.assign(new Error('Secure session processing is unavailable. Check encryption, approved cloud services and privacy inspection configuration.'), { status:503, code:'SESSION_PRIVACY_UNAVAILABLE' });
export function requireSessionPrivacyConfiguration() {
  const project = String(process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID || process.env.PROJECT_ID || '').trim();
  // This is an operator attestation, not a substitute for a signed BAA or a cloud configuration review.
  if (process.env.CLINICAL_AI_PRIVACY_APPROVED !== 'true' || !project || !isChatEncryptionConfigured()) throw fail();
  return project;
}
const INFO_TYPES = ['PERSON_NAME','EMAIL_ADDRESS','PHONE_NUMBER','STREET_ADDRESS','DATE_OF_BIRTH',
  'US_SOCIAL_SECURITY_NUMBER','MEDICAL_RECORD_NUMBER','LOCATION','DATE','IP_ADDRESS','URL',
  'US_HEALTHCARE_NPI','US_DRIVERS_LICENSE_NUMBER','US_PASSPORT','CREDIT_CARD_NUMBER','IBAN_CODE'];
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// The replacement map exists only in memory, never in model requests or logs.
// It supports consistent speaker attribution throughout multi-stage summarization.
export function createSessionPrivacyContext({ contentType = 'session', identifiers = [], clientNames = [], providerNames = [], fetchImpl = fetch, tokenProvider } = {}) {
  if (!['session','meeting'].includes(contentType)) throw fail();
  const clinical = contentType === 'session';
  const nameParts = values => [...new Set(values.filter(Boolean).flatMap(v => [String(v).trim(),...String(v).trim().split(/\s+/).filter(t=>t.length>=2)]))].filter(Boolean);
  const normalizeName = value => String(value).normalize('NFKC').toLowerCase();
  const clients = new Set(nameParts(clientNames).map(normalizeName));
  const providers = new Set(nameParts(providerNames).map(normalizeName));
  const replacements = new Map();
  const namespace = [...crypto.randomBytes(8)].map(b => String.fromCharCode(97+(b%26))).join('');
  const placeholder = new RegExp(`\\[PRIVATE_${namespace}_\\d+\\]`,'g');
  const tokenFor = value => {
    const key = normalizeName(value);
    if (clinical) {
      if (key === 'client' || (clients.has(key) && !providers.has(key))) return 'Client';
      if (key === 'provider' || (providers.has(key) && !clients.has(key))) return 'Provider';
      return '[REDACTED]';
    }
    if (!replacements.has(key)) replacements.set(key, { value:String(value), token:`[PRIVATE_${namespace}_${replacements.size + 1}]` });
    return replacements.get(key).token;
  };
  const known = nameParts([...identifiers,...(clinical ? [...clientNames,...providerNames] : [])]).sort((a,b)=>b.length-a.length);
  function localRedact(text) {
    let result = String(text || '');
    // Remove common direct identifiers before the approved privacy service sees them.
    for (const pattern of [/(?<![\w.+%-])[\w.+%-]{1,64}@[\w.-]{1,253}\.[A-Za-z]{2,63}/g, /\b\d{3}-\d{2}-\d{4}\b/g,
      /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g,
      /\b(?:MRN|member\s*(?:ID|number)|patient\s*(?:ID|number))\s*[:#]?\s*[A-Z0-9-]+/gi]) {
      result = result.replace(pattern, value => tokenFor(value));
    }
    for (const value of known) result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(value)}(?![\\p{L}\\p{N}])`,'giu'), () => tokenFor(value));
    return result;
  }
  return {
    contentType,
    async redact(text) {
      const project = requireSessionPrivacyConfiguration();
      const localText = localRedact(text);
      const minimized = clinical ? localText.replace(/\[Speaker\s+\d+\]/gi,'[Unattributed]') : localText;
      if (!minimized.trim()) return minimized;
      try {
        const token = tokenProvider ? await tokenProvider() : await new GoogleAuth({ scopes:['https://www.googleapis.com/auth/cloud-platform'] }).getAccessToken();
        if (!token) throw fail();
        const bytes = Buffer.from(minimized,'utf8');
        // Tokens already issued by this context are not identity evidence. Mask
        // them for inspection only, preserving byte offsets into the source.
        const inspectBytes = Buffer.from(minimized.replace(placeholder,token => ' '.repeat(token.length)),'utf8');
        const ranges = [];
        // Overlapping UTF-8 windows cover identifiers across chunk boundaries.
        for (let start = 0; start < bytes.length;) {
          let end = Math.min(start + 24000, bytes.length);
          while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
          const response = await fetchImpl(`https://dlp.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/us/content:inspect`, {
            method:'POST',signal:AbortSignal.timeout(30000),headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json' },
            body:JSON.stringify({item:{value:inspectBytes.subarray(start,end).toString('utf8')},inspectConfig:{
              infoTypes:INFO_TYPES.filter(name => clinical || name !== 'PERSON_NAME').map(name => ({name})),minLikelihood:'POSSIBLE',includeQuote:false,limits:{maxFindingsPerRequest:1000}}})
          });
          if (!response.ok) throw fail();
          const data = await response.json();
          if (!data.result || data.result.findingsTruncated || (data.result.findings !== undefined && !Array.isArray(data.result.findings))) throw fail();
          for (const finding of data.result.findings || []) {
            const range = finding.location?.byteRange;
            const first = Number(range?.start ?? 0), last = Number(range?.end);
            if (!range || !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last <= first || last > end-start) throw fail();
            ranges.push({start:start+first,end:start+last});
          }
          if (end === bytes.length) break;
          start = end - 1024;
          while ((bytes[start] & 0xc0) === 0x80) start--;
        }
        ranges.sort((a,b) => a.start-b.start || b.end-a.end);
        const merged = [];
        for (const range of ranges) {
          const previous = merged.at(-1);
          if (previous && range.start < previous.end) previous.end = Math.max(previous.end,range.end);
          else merged.push({...range});
        }
        let offset = 0, redacted = '';
        for (const range of merged) {
          redacted += bytes.subarray(offset,range.start).toString('utf8') + tokenFor(bytes.subarray(range.start,range.end).toString('utf8'));
          offset = range.end;
        }
        return redacted + bytes.subarray(offset).toString('utf8');
      } catch { throw fail(); } // Never propagate a provider error containing request content.
    },
    restore(text) {
      // Exact tokens only, single pass; generated prose is never used as an identity lookup.
      const byToken = new Map([...replacements.values()].map(item => [item.token,item.value]));
      return String(text || '').replace(placeholder, token => byToken.get(token) || token);
    }
  };
}

export async function callPrivateSessionText({ privacyContext = createSessionPrivacyContext(), prompt, ...options }) {
  const redacted = await privacyContext.redact(prompt);
  try {
    return await callGeminiText({ ...options, prompt:privacyContext.contentType === 'session' ? `${redacted}\n\nPrivacy rule: Refer to the session participants only as Client and Provider. Do not include names, initials, or identifying details. If a speaker role is not established by the source, describe the facts without assigning a role; never guess.` : redacted, vertexOnly:true, sensitive:true });
  } catch { throw Object.assign(new Error('Secure session generation failed. Retry without changing the saved transcript.'), {status:502}); }
}
