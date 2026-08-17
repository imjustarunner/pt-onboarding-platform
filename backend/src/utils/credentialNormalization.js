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
 * True when role is intern/intern_plus OR credential contains a whole-word INTERN.
 * Interns are pay Cat 1 (not payroll-prelicensed) but still on a clinical pre-licensure track.
 */
export function isInternRoleOrCredential({ role, credential } = {}) {
  const roleLower = String(role || '').trim().toLowerCase();
  if (roleLower === 'intern' || roleLower === 'intern_plus') return true;
  const upper = String(credential || '').trim().toUpperCase();
  return /\bINTERN\b/.test(upper);
}

/** True prelicensed / candidate clinical tokens (LPCC, MFTC, LSW, etc.) — excludes Intern and bare master's. */
function _hasTruePrelicensedCredentialToken(upperCred) {
  if (!upperCred) return false;
  // LSW yes, LCSW no
  if (/\bLSW\b/.test(upperCred) && !/\bLCSW\b/.test(upperCred)) return true;
  const tokens = [
    'LPCC', 'MFTC', 'SWC', 'CANDIDATE', 'ASSOCIATE',
    'UNLICENSED', 'PRE-LICENSED', 'PRELICENSED', 'LPC-A',
    'LPC-ASSOCIATE', 'LMFTC',
  ];
  return tokens.some((t) => new RegExp(`\\b${t}\\b`).test(upperCred));
}

/** Bare master's (MA/MS/MEd/MSW/MCouns) without a full independent license — pay Cat 1 "unlicensed masters". */
function _hasUnlicensedMastersCredentialToken(upperCred) {
  if (!upperCred) return false;
  return (
    /\bMA\b/.test(upperCred) ||
    /\bMS\b/.test(upperCred) ||
    /\bMED\b/.test(upperCred) ||
    /\bMSW\b/.test(upperCred) ||
    /\bMCOUNS\b/.test(upperCred)
  );
}

/**
 * Auto-classify whether a supervisee should be treated as payroll "prelicensed"
 * (meaning 99414/99416 are displayed but don't pay or accrue PTO until 50/100 hours).
 *
 * Priority order:
 *   1. is_hourly_worker → always PAID (overrides everything)
 *   2. Title / Job Title = "Facilitator" → PAID
 *   3. Intern (role intern/intern_plus OR credential \bINTERN\b) → INTERN (not payroll-prelicensed)
 *   4. Credential has LPCC, LSW (not LCSW), MFTC, SWC, candidate,
 *      associate, unlicensed, pre-licensed, OR bare master's → PRELICENSED
 *   5. Credential has BA, BS, MBA (no Intern) → PAID
 *      (flags if is_hourly_worker is not on — should be hourly)
 *   6. Fully licensed (LCSW, LPC, LMFT, LAC, PsyD, PhD) → PAID
 *   7. No usable signal → UNKNOWN + conflict flag
 *
 * Returns:
 *   classifiedAs : 'paid' | 'prelicensed' | 'intern' | 'unknown'
 *   conflictReason : string | null   — surfaced as an admin warning
 *   autoDetected : boolean           — false when manual flag was the only signal
 *
 * Note: Interns are NOT payroll-prelicensed. The 50/100-hour pay gate applies only when
 * classifiedAs === 'prelicensed' (or the manual Prelicensed toggle is On). Clinical
 * license-status via determineLicenseStatus still shows interns on a pre-licensure track.
 */
export function classifyPrelicensedStatus({
  credential,
  title,
  jobTitle,
  role,
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

  // ── Rule 3: Intern is pay Cat 1 — NOT payroll-prelicensed ─────────────────
  // Leaving the Prelicensed toggle Off is correct; do not prompt admins to turn it On.
  if (isInternRoleOrCredential({ role, credential: cred })) {
    const conflict =
      manualIsPrelicensed === true
        ? (cred
            ? `Credential/role indicates Intern (pay Cat 1 — not payroll-prelicensed) but manually marked as Prelicensed — uncheck Prelicensed unless intentionally applying the 50/100-hour gate`
            : 'Role is Intern (pay Cat 1 — not payroll-prelicensed) but manually marked as Prelicensed — uncheck Prelicensed unless intentionally applying the 50/100-hour gate')
        : null;
    return { classifiedAs: 'intern', conflictReason: conflict, autoDetected: true };
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

/**
 * Payroll-gate prelicensed tokens: true Cat-2 prelicensed OR bare master's
 * (still treated as supervision-prelicensed for the 50/100-hour gate).
 * Intern is handled separately and is NOT payroll-prelicensed.
 */
function _hasPrelicensedCredentialToken(upperCred) {
  if (!upperCred) return false;
  if (_hasTruePrelicensedCredentialToken(upperCred)) return true;
  // Bare MA / MS / MEd / MSW without a full license = supervision-prelicensed clinician
  if (_hasUnlicensedMastersCredentialToken(upperCred)) return true;
  return false;
}

const PAY_CATEGORY_LABELS = {
  1: 'Cat 1 — Bachelors / unlicensed masters / interns',
  2: 'Cat 2 — Prelicensed (LPCC, MFTC, LSW, SWC, etc.)',
  3: 'Cat 3 — Fully licensed',
};

const HCBS_CATEGORY_LABELS = {
  1: 'Cat 1 — Bachelors / unlicensed masters',
  2: 'Cat 2 — Prelicensed (includes interns)',
  3: 'Cat 3 — Fully licensed',
};

/**
 * Shared Pay Category classifier (compensation / pay axis).
 *   1 = Bachelors, unlicensed masters, interns
 *   2 = True prelicensed (LPCC, MFTC, LSW, SWC, etc.) — NOT interns
 *   3 = Fully licensed
 *
 * Distinct from H0032 Cat1 Hour / Cat2 Flat (billing-minutes mode).
 */
export function classifyPayCategory({
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

  if (isInternRoleOrCredential({ role, credential: cred })) {
    return {
      category: 1,
      label: PAY_CATEGORY_LABELS[1],
      reason: 'Intern (role or credential) — pay Cat 1, not pay-Cat-2 prelicensed',
    };
  }

  if (isFullyLicensedCredentialText(cred)) {
    return {
      category: 3,
      label: PAY_CATEGORY_LABELS[3],
      reason: `Credential "${cred}" is fully licensed — pay Cat 3`,
    };
  }

  // True Cat-2 prelicensed before bare master's / bachelors
  if (_hasTruePrelicensedCredentialToken(upper)) {
    return {
      category: 2,
      label: PAY_CATEGORY_LABELS[2],
      reason: `Credential "${cred}" indicates prelicensed (LPCC/MFTC/LSW/SWC/etc.) — pay Cat 2`,
    };
  }

  if (_hasUnlicensedMastersCredentialToken(upper)) {
    return {
      category: 1,
      label: PAY_CATEGORY_LABELS[1],
      reason: `Credential "${cred}" is an unlicensed master's — pay Cat 1`,
    };
  }

  const hasBachelors =
    isBachelorsCredentialText(cred) ||
    /\bMBA\b/.test(upper) ||
    /\bBBA\b/.test(upper);
  if (hasBachelors) {
    return {
      category: 1,
      label: PAY_CATEGORY_LABELS[1],
      reason: `Credential "${cred}" indicates bachelor's-level — pay Cat 1`,
    };
  }

  if (roleLower === 'qbha' || roleLower === 'clinical_practice_assistant') {
    return {
      category: 1,
      label: PAY_CATEGORY_LABELS[1],
      reason: `Role "${roleLower}" — pay Cat 1`,
    };
  }
  if (titleLower === 'facilitator' || jobTitleLower === 'facilitator') {
    return {
      category: 1,
      label: PAY_CATEGORY_LABELS[1],
      reason: 'Title is Facilitator — pay Cat 1',
    };
  }
  if (hourly && !cred) {
    return {
      category: 1,
      label: PAY_CATEGORY_LABELS[1],
      reason: 'Hourly worker with no clinical credential — pay Cat 1',
    };
  }

  return {
    category: null,
    label: null,
    reason: cred
      ? `Credential "${cred}" could not be mapped to a pay category`
      : 'Cannot determine pay category (no credential / role signal)',
  };
}

/**
 * HCBS Category — same bands as pay, except interns count as Cat 2
 * (for future State Supervision Oversight Requirements).
 */
export function classifyHcbsCategory(args = {}) {
  const cred = String(args.credential || '').trim();
  if (isInternRoleOrCredential({ role: args.role, credential: cred })) {
    return {
      category: 2,
      label: HCBS_CATEGORY_LABELS[2],
      reason: 'Interns count as HCBS Cat 2 (prelicensed band) for future State Supervision Oversight Requirements',
    };
  }
  const pay = classifyPayCategory(args);
  if (pay.category == null) {
    return {
      category: null,
      label: null,
      reason: pay.reason?.replace(/\bpay category\b/gi, 'HCBS category') || pay.reason,
    };
  }
  return {
    category: pay.category,
    label: HCBS_CATEGORY_LABELS[pay.category] || pay.label,
    reason: String(pay.reason || '').replace(/\bpay Cat\b/g, 'HCBS Cat').replace(/\bpay category\b/gi, 'HCBS category'),
  };
}

/**
 * Both axes in one call for API / UI display.
 */
export function classifyPayAndHcbsCategories(args = {}) {
  const pay = classifyPayCategory(args);
  const hcbs = classifyHcbsCategory(args);
  return {
    payCategory: pay.category,
    payCategoryLabel: pay.label,
    payCategoryReason: pay.reason,
    hcbsCategory: hcbs.category,
    hcbsCategoryLabel: hcbs.label,
    hcbsCategoryReason: hcbs.reason,
  };
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

  // ── PRELICENSED / intern clinical track ───────────────────────────────────
  // Interns remain on the clinical pre-licensure track for display/filters.
  // Payroll pay-gate uses classifyPrelicensedStatus (intern ≠ payroll-prelicensed).
  if (roleLower === 'intern' || roleLower === 'intern_plus') {
    return { status: 'prelicensed', reason: `User role is "${roleLower}" (Intern) — clinical pre-licensure track under supervision` };
  }
  if (/\bINTERN\b/.test(upper)) return { status: 'prelicensed', reason: `Credential "${cred}" contains "Intern" — clinical pre-licensure track under supervision` };
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

