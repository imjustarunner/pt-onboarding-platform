function safeText(raw) {
  return String(raw ?? '')
    .replace(/\u0000/g, '')
    .trim();
}

export function normalizeCredentialText(raw) {
  return safeText(raw);
}

export function normalizeCredentialToken(raw) {
  return safeText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isBachelorsCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower.includes('bachelor')) return true;
  if (/\bba\b/i.test(s)) return true;
  if (/\bbs\b/i.test(s)) return true;
  if (/\bb\.a\.\b/i.test(lower)) return true;
  if (/\bb\.s\.\b/i.test(lower)) return true;
  return false;
}

function containsAnyToken(raw, tokens) {
  const upper = safeText(raw).toUpperCase();
  return (tokens || []).some((t) => upper.includes(String(t || '').toUpperCase()));
}

export function deriveCredentialTierFromText({ userRole, providerCredentialText }) {
  const role = String(userRole || '').trim().toLowerCase();
  const cred = safeText(providerCredentialText);

  if (role === 'intern') return 'intern_plus';
  if (role === 'qbha' || role === 'clinical_practice_assistant') return 'qbha';

  if (containsAnyToken(cred, ['QBHA', 'QUALIFIED BEHAVIORAL HEALTH ASSISTANT'])) return 'qbha';

  const internPlusTokens = [
    'INTERN',
    'UNLICENSED',
    'PRE-LICENSED',
    'PRELICENSED',
    'LPCC',
    'LSW',
    'SWC',
    'MFTC',
    'LAC',
    'EDD',
    'PHD',
    'PSYD',
    'LMFT',
    'LPC',
    'LCSW',
    'MFT',
    'LICENSED'
  ];
  if (containsAnyToken(cred, internPlusTokens)) return 'intern_plus';
  if (isBachelorsCredentialText(cred)) return 'bachelors';
  return 'unknown';
}

/**
 * True when credential text indicates a fully licensed clinician eligible for
 * insurance credentialing (LPC, LCSW, LMFT/MFT, LAC, Licensed Psychologist).
 * Pre-licensed / candidate credentials (LPCC, MFTC, SWC, etc.) are excluded.
 */
function isPrelicensedOrUnderSupervisionCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  const upper = s.toUpperCase();

  // Pre-licensed / associate-level — not eligible to supervise clinically
  if (/\bINTERN\b/.test(upper)) return true;
  if (/\bUNLICENSED\b/.test(upper)) return true;
  if (/\bPRE[- ]?LICENSED\b/.test(upper) || /\bPRELICENSED\b/.test(upper)) return true;
  if (/\bLPCC\b/.test(upper)) return true;
  if (/\bSWC\b/.test(upper)) return true;
  if (/\bMFTC\b/.test(upper)) return true;
  if (/\bCANDIDATE\b/.test(upper)) return true;
  if (/\bASSOCIATE\b/.test(upper)) return true;
  if (/\bLPC-A\b/.test(upper) || /\bLPC-ASSOCIATE\b/.test(upper)) return true;
  // LSW alone is not fully licensed; LCSW is
  if (/\bLSW\b/.test(upper) && !/\bLCSW\b/.test(upper)) return true;
  if (isBachelorsCredentialText(s)) return true;
  return false;
}

export function isFullyLicensedCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  if (isPrelicensedOrUnderSupervisionCredentialText(s)) return false;
  const upper = s.toUpperCase();

  if (/\bLCSW\b/.test(upper)) return true;
  if (/\bLPC\b/.test(upper)) return true;
  if (/\bLMFT\b/.test(upper) || /\bLMFC\b/.test(upper)) return true;
  // Bare MFT only after MFTC excluded above
  if (/\bMFT\b/.test(upper)) return true;
  // Licensed Addiction Counselor (fully licensed in CO)
  if (/\bLAC\b/.test(upper)) return true;
  if (/\bLICENSED\s+PSYCHOLOGIST\b/i.test(s)) return true;
  if (/\bLPSY\b/.test(upper)) return true;
  if (/\bPSYD\b/.test(upper) || /\bPSY\.?\s*D\.?\b/i.test(s)) return true;
  if (/\bPH\.?\s*D\.?\b/i.test(s) && /PSYCH/.test(upper)) return true;
  // Standalone LP (Licensed Psychologist) — exclude LPC/LPCC already handled above
  if (/\bLP\b/.test(upper) && !/\bLPC/.test(upper)) return true;

  return false;
}

/**
 * Clinical / billing supervisors must hold a fully licensed credential:
 * LPC, LCSW, LMFT/MFT, LAC, PsyD, or PhD (or licensed psychologist).
 * Pre-licensed, candidate, associate, and bachelor's credentials are excluded.
 */
export function isClinicalOrBillingSupervisorCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  if (isPrelicensedOrUnderSupervisionCredentialText(s)) return false;
  if (isFullyLicensedCredentialText(s)) return true;
  // Allow bare PhD (without "psychologist" text) for clinical/billing supervisor eligibility
  if (/\bPH\.?\s*D\.?\b/i.test(s) || /\bPHD\b/i.test(s)) return true;
  return false;
}

export const CLINICAL_BILLING_SUPERVISOR_LICENSE_HINT =
  'LPC, LCSW, LMFT, LAC, PsyD, or PhD';

/**
 * Auto-classify whether a supervisee should be treated as "prelicensed"
 * (meaning 99414/99416 are displayed but don't pay or accrue PTO).
 *
 * Priority order:
 *   1. is_hourly_worker → always PAID (overrides everything)
 *   2. Title / Job Title = "Facilitator" → PAID
 *   3. Credential has "Intern" (even with BA/BS) → PRELICENSED
 *   4. Credential has MA, LPCC, LSW (not LCSW), MFTC, SWC, candidate,
 *      associate, unlicensed, pre-licensed → PRELICENSED
 *   5. Credential has BA, BS, MBA (no Intern) → PAID
 *      (flags if is_hourly_worker is not on — should be hourly)
 *   6. Fully licensed (LCSW, LPC, LMFT, LAC, PsyD, PhD) → PAID
 *   7. No usable signal → UNKNOWN + conflict flag
 *
 * Returns:
 *   classifiedAs : 'paid' | 'prelicensed' | 'unknown'
 *   conflictReason : string | null   — surfaced as an admin warning
 *   autoDetected : boolean           — false when manual flag was the only signal
 */
export function classifyPrelicensedStatus({
  credential,
  title,
  jobTitle,
  isHourlyWorker,
  manualIsPrelicensed = null,   // current DB value (true/false/null)
} = {}) {
  const cred = String(credential || '').trim();
  const upper = cred.toUpperCase();
  const titleLower = String(title || '').trim().toLowerCase();
  const jobTitleLower = String(jobTitle || '').trim().toLowerCase();
  const hourly = !!(isHourlyWorker === true || isHourlyWorker === 1 || isHourlyWorker === '1');

  // ── Rule 1: hourly worker ─────────────────────────────────────────────────
  if (hourly) {
    const conflict =
      manualIsPrelicensed === true
        ? 'Hourly Workers is enabled (paid) but this user is manually marked as Prelicensed — uncheck Prelicensed'
        : null;
    return { classifiedAs: 'paid', conflictReason: conflict, autoDetected: true };
  }

  // ── Rule 2: Facilitator title / job title ─────────────────────────────────
  const isFacilitator = titleLower === 'facilitator' || jobTitleLower === 'facilitator';
  if (isFacilitator) {
    const hasPrelicensedToken = _hasPrelicensedCredentialToken(upper);
    const conflict = hasPrelicensedToken
      ? `Title is "Facilitator" (paid) but credential "${cred}" contains a prelicensed indicator — verify classification`
      : manualIsPrelicensed === true
        ? 'Title is "Facilitator" (paid) but manually marked as Prelicensed — uncheck Prelicensed'
        : null;
    return { classifiedAs: 'paid', conflictReason: conflict, autoDetected: true };
  }

  // ── Rule 3: Intern token wins over bachelor's ─────────────────────────────
  if (/\bINTERN\b/.test(upper)) {
    const conflict =
      manualIsPrelicensed === false
        ? `Credential "${cred}" contains "Intern" (prelicensed) but manually marked as NOT prelicensed — verify`
        : null;
    return { classifiedAs: 'prelicensed', conflictReason: conflict, autoDetected: true };
  }

  // ── Rule 4: Prelicensed credential tokens ─────────────────────────────────
  if (_hasPrelicensedCredentialToken(upper)) {
    const conflict =
      manualIsPrelicensed === false
        ? `Credential "${cred}" indicates prelicensed but manually marked as NOT prelicensed — verify`
        : null;
    return { classifiedAs: 'prelicensed', conflictReason: conflict, autoDetected: true };
  }

  // ── Rule 5: Bachelor's without intern ────────────────────────────────────
  const hasBachelors =
    isBachelorsCredentialText(cred) ||
    /\bMBA\b/.test(upper) ||
    /\bBBA\b/.test(upper);
  if (hasBachelors) {
    const reasons = [];
    if (!hourly) reasons.push(`Credential "${cred}" (BA/BS/MBA) typically indicates an hourly worker, but "Hourly Workers" is not enabled on this profile`);
    if (manualIsPrelicensed === true) reasons.push('manually marked as Prelicensed but credential suggests paid — verify');
    return {
      classifiedAs: 'paid',
      conflictReason: reasons.length ? reasons.join('; ') : null,
      autoDetected: true,
    };
  }

  // ── Rule 6: Fully licensed ────────────────────────────────────────────────
  if (isFullyLicensedCredentialText(cred)) {
    const conflict =
      manualIsPrelicensed === true
        ? `Credential "${cred}" is fully licensed (paid) but manually marked as Prelicensed — uncheck Prelicensed`
        : null;
    return { classifiedAs: 'paid', conflictReason: conflict, autoDetected: true };
  }

  // ── Rule 7: Unclassifiable ────────────────────────────────────────────────
  const missingSignals = [];
  if (!cred) missingSignals.push('no credential on file');
  if (!titleLower && !jobTitleLower) missingSignals.push('no title or job title');
  const unknownReason = missingSignals.length
    ? `Cannot auto-classify prelicensed status (${missingSignals.join(', ')}) — set the Prelicensed toggle manually`
    : `Credential "${cred}" could not be automatically classified — manually verify prelicensed status`;

  return { classifiedAs: 'unknown', conflictReason: unknownReason, autoDetected: false };
}

/** MA, LPCC, LSW (not LCSW), MFTC, SWC, and similar pre-license tokens. */
function _hasPrelicensedCredentialToken(upperCred) {
  if (!upperCred) return false;
  // LSW yes, LCSW no
  if (/\bLSW\b/.test(upperCred) && !/\bLCSW\b/.test(upperCred)) return true;
  const tokens = [
    'LPCC', 'MFTC', 'SWC', 'CANDIDATE', 'ASSOCIATE',
    'UNLICENSED', 'PRE-LICENSED', 'PRELICENSED', 'LPC-A',
    'LPC-ASSOCIATE', 'LMFTC',
    // Master's degree alone (MA, MS, MEd) without a full license = prelicensed clinician
    // Matched with word boundary so "LMFT" doesn't trigger "MFT" rule
  ];
  if (tokens.some((t) => new RegExp(`\\b${t}\\b`).test(upperCred))) return true;
  // Bare MA / MS / MEd with word boundary (degree without full license)
  if (/\bMA\b/.test(upperCred) || /\bMS\b/.test(upperCred) || /\bMED\b/.test(upperCred)) return true;
  return false;
}

/**
 * Determine a provider's clinical license status: 'licensed', 'prelicensed', 'unlicensed', or 'unknown'.
 *
 * This is distinct from payroll prelicensed classification — it describes the person's
 * clinical credential tier and will be used across billing, supervision, and credentialing.
 *
 * Rules (evaluated in order — first match wins):
 *
 * LICENSED  — holds a full, independent clinical practice license:
 *   • Credential contains LCSW, LPC (not LPCC), LMFT (not LMFTC), MFT (not MFTC),
 *     LAC, PsyD, PhD (clinical), LPSY, or bare LP (not LPC)
 *
 * PRELICENSED — working toward licensure under supervision:
 *   • Role = 'intern'
 *   • Credential contains INTERN, UNLICENSED, PRE-LICENSED, PRELICENSED
 *   • Credential contains LPCC, LSW (not LCSW), MFTC, LMFTC, SWC, LPC-A, LPC-ASSOCIATE
 *   • Credential contains CANDIDATE or ASSOCIATE (clinical context)
 *   • Bare master's degree (MA, MS, MEd) without a full license alongside it —
 *     indicates a degreed clinician who hasn't yet achieved licensure
 *
 * UNLICENSED — not on a clinical licensure track:
 *   • Role = 'qbha' or 'clinical_practice_assistant'
 *   • Title/Job Title = 'Facilitator'
 *   • Credential contains BA, BS, BBA, or MBA without any clinical/intern token
 *   • is_hourly_worker = 1 AND no clinical credential token at all
 *     (hourly alone doesn't mean unlicensed, but hourly + no clin cred = support/parapro)
 *
 * UNKNOWN — cannot be auto-determined:
 *   • No credential, no title, no signal
 *   • Credential present but doesn't match any known pattern
 *
 * Returns { status, reason } where reason is a human-readable explanation
 * so admins can review the rule and correct it if wrong.
 */
export function determineLicenseStatus({
  credential,
  title,
  jobTitle,
  role,
  isHourlyWorker,
} = {}) {
  const cred = String(credential || '').trim();
  const upper = cred.toUpperCase();
  const titleLower = String(title || '').trim().toLowerCase();
  const jobTitleLower = String(jobTitle || '').trim().toLowerCase();
  const roleLower = String(role || '').trim().toLowerCase();
  const hourly = !!(isHourlyWorker === true || isHourlyWorker === 1 || isHourlyWorker === '1');

  // ── LICENSED ─────────────────────────────────────────────────────────────
  // Test for full licenses before prelicensed tokens so LCSW isn't caught by LSW check.
  if (/\bLCSW\b/.test(upper)) return { status: 'licensed', reason: 'Credential contains LCSW (Licensed Clinical Social Worker — fully licensed)' };
  if (/\bLMFT\b/.test(upper) && !/\bLMFTC\b/.test(upper)) return { status: 'licensed', reason: 'Credential contains LMFT (Licensed Marriage and Family Therapist — fully licensed)' };
  if (/\bMFT\b/.test(upper) && !/\bMFTC\b/.test(upper) && !/\bLMFTC\b/.test(upper)) return { status: 'licensed', reason: 'Credential contains MFT (Marriage and Family Therapist — fully licensed)' };
  if (/\bLAC\b/.test(upper)) return { status: 'licensed', reason: 'Credential contains LAC (Licensed Addiction Counselor — fully licensed)' };
  if (/\bLPC\b/.test(upper) && !/\bLPCC\b/.test(upper) && !/\bLPC-A\b/.test(upper) && !/\bLPC-ASSOCIATE\b/.test(upper)) return { status: 'licensed', reason: 'Credential contains LPC (Licensed Professional Counselor — fully licensed)' };
  if (/\bPSYD\b/.test(upper) || /\bPSY\.?\s*D\.?\b/i.test(cred)) return { status: 'licensed', reason: 'Credential contains PsyD (Doctor of Psychology — fully licensed)' };
  if (/\bPH\.?\s*D\.?\b/i.test(cred) && /PSYCH/i.test(cred)) return { status: 'licensed', reason: 'Credential contains PhD (Psychology — fully licensed)' };
  if (/\bLPSY\b/.test(upper)) return { status: 'licensed', reason: 'Credential contains LPSY (Licensed Psychologist — fully licensed)' };
  if (/\bLP\b/.test(upper) && !/\bLPC/.test(upper)) return { status: 'licensed', reason: 'Credential contains LP (Licensed Psychologist — fully licensed)' };
  if (/\bLICENSED\s+PSYCHOLOGIST\b/i.test(cred)) return { status: 'licensed', reason: 'Credential contains "Licensed Psychologist" — fully licensed' };

  // ── PRELICENSED ───────────────────────────────────────────────────────────
  if (roleLower === 'intern') return { status: 'prelicensed', reason: 'User role is "Intern" — working toward licensure under supervision' };
  if (/\bINTERN\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains "Intern" — working toward licensure under supervision` };
  if (/\bUNLICENSED\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains "Unlicensed" — working toward licensure under supervision` };
  if (/\bPRE[- ]?LICENSED\b/.test(upper) || /\bPRELICENSED\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" explicitly states pre-licensed status` };
  if (/\bLPCC\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains LPCC (Licensed Professional Counselor Candidate — prelicensed, working toward LPC)` };
  if (/\bSWC\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains SWC (Social Work Candidate — prelicensed, working toward LCSW)` };
  if (/\bMFTC\b/.test(upper) || /\bLMFTC\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains MFTC/LMFTC (Marriage and Family Therapist Candidate — prelicensed, working toward LMFT)` };
  if (/\bLPC-A\b/.test(upper) || /\bLPC-ASSOCIATE\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains LPC-A/LPC-Associate (Associate — prelicensed, working toward LPC)` };
  if (/\bLSW\b/.test(upper) && !/\bLCSW\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains LSW (Licensed Social Worker — prelicensed, working toward LCSW)` };
  if (/\bCANDIDATE\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains "Candidate" — in a prelicensed candidacy track` };
  if (/\bASSOCIATE\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains "Associate" — typically a prelicensed associate-level clinician` };
  // Bare master's degree without a full license alongside it = degreed but not yet licensed
  const hasMasters = /\bMA\b/.test(upper) || /\bMS\b/.test(upper) || /\bMED\b/.test(upper) || /\bMSW\b/.test(upper) || /\bMCOUNS\b/.test(upper);
  if (hasMasters) return { status: 'prelicensed', reason: `Credential "${cred}" contains a master's degree (${/\bMSW\b/.test(upper) ? 'MSW' : /\bMS\b/.test(upper) ? 'MS' : /\bMED\b/.test(upper) ? 'MEd' : 'MA'}) without a full independent license — indicating a degreed clinician working toward licensure` };

  // ── UNLICENSED ────────────────────────────────────────────────────────────
  if (roleLower === 'qbha' || roleLower === 'clinical_practice_assistant') return { status: 'unlicensed', reason: `Role is "${roleLower}" — a paraprofessional support role, not on a clinical licensure track` };
  const isFacilitator = titleLower === 'facilitator' || jobTitleLower === 'facilitator';
  if (isFacilitator) return { status: 'unlicensed', reason: `Title is "Facilitator" — a paraprofessional role, not on a clinical licensure track` };
  const hasBachelors = /\bBA\b/.test(upper) || /\bBS\b/.test(upper) || /\bBBA\b/.test(upper) || /\bMBA\b/.test(upper) || /\bB\.A\./i.test(cred) || /\bB\.S\./i.test(cred) || /\bbachelor/i.test(cred);
  if (hasBachelors) return { status: 'unlicensed', reason: `Credential "${cred}" indicates a bachelor's/associate degree — not on a clinical licensure track (if this is incorrect, update the credential)` };
  if (hourly && !cred) return { status: 'unlicensed', reason: 'Hourly worker with no clinical credential — classified as a support/paraprofessional role' };

  // ── UNKNOWN ───────────────────────────────────────────────────────────────
  if (!cred) return { status: 'unknown', reason: 'No credential on file — license status cannot be determined automatically. Please add the credential to the user profile.' };
  return { status: 'unknown', reason: `Credential "${cred}" does not match any known clinical license pattern. Review and correct if needed.` };
}

/** Licensed / pre-licensed credentials that require PYU license + background check review. */
export const PROVIDER_YEAR_UPDATE_LICENSE_TOKENS = [
  'LMFTC',
  'LPCC',
  'MFTC',
  'LCSW',
  'LMFT',
  'LSW',
  'SWC',
  'LPC',
  'MFT',
  'LAC',
];

function containsWordToken(raw, token) {
  const upper = safeText(raw).toUpperCase();
  const t = String(token || '').toUpperCase();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(upper);
}

/**
 * True when a provider should see the Licenses & Background Check PYU section.
 */
export function requiresProviderYearUpdateLicensesSection({
  role,
  credential,
  licenseTypeNumber,
} = {}) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'qbha' || r === 'clinical_practice_assistant') return false;
  const text = [credential, licenseTypeNumber].filter(Boolean).join(' ');
  if (!safeText(text)) return false;
  return PROVIDER_YEAR_UPDATE_LICENSE_TOKENS.some((token) => containsWordToken(text, token));
}

