/**
 * Demo / fake people keep character or playground emails on their accounts
 * (e.g. sirius.black@hogwarts.edu, provider.itsco-training@example.demo)
 * but outbound mail is delivered to the ITSCO testing inbox.
 *
 * Real Hogwarts-assigned people (Williams, Chuckie, Piper Finch, Loriana)
 * are never redirected.
 *
 * Also redirects:
 * - @example.com / sibling RFC reserved domains
 * - mail attached to a demo agency (demo, hogwarts, durmstrang, …)
 * - mail for users/clients flagged is_demo
 */
export const HOGWARTS_TEST_INBOX = 'testing@itsco.health';

const KEEP_REAL_EMAILS = new Set([
  'williams@itsco.health',
  'piperf@itsco.health',
  'chuckie@d11.org',
  'lorianacpincente@gmail.com',
  'lorianacpincente@aol.com',
  'loriana@plottwist.com'
]);

/** Agency slugs whose outbound mail always goes to the testing inbox. */
export const DEMO_AGENCY_SLUGS = new Set([
  'demo',
  'demo-school',
  'hogwarts',
  'durmstrang'
]);

let hogwartsEmailCache = { at: 0, emails: new Set() };
let demoAgencyCache = { at: 0, ids: new Set() };

export function extractEmailAddresses(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const found = [];
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m;
  while ((m = re.exec(text))) {
    found.push(String(m[0]).trim().toLowerCase());
  }
  return [...new Set(found)];
}

export function isKeepRealHogwartsEmail(email) {
  return KEEP_REAL_EMAILS.has(String(email || '').trim().toLowerCase());
}

/**
 * Playground / seed / RFC-reserved fake domains that must never receive real outbound mail.
 * Includes plain @example.com used by public intake / job-application Dev Fill.
 */
export function looksLikeDemoFakeAddress(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || isKeepRealHogwartsEmail(e)) return false;
  const host = e.split('@')[1] || '';
  // Any @example… host (example.com, example.org, mail.example.com, etc.)
  if (host === 'example' || /(^|\.)example(\.|$)/i.test(host)) return true;
  if (/^(test\.com|localhost)$/i.test(host)) return true;
  if (e.endsWith('@demtest.com')) return true;
  if (e.includes('@example.') && e.includes('itsco-training')) return true;
  return false;
}

export function looksLikeHogwartsDemoAddress(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || isKeepRealHogwartsEmail(e)) return false;
  if (e.endsWith('@hogwarts.edu') || e.includes('@hogwarts.') || e.includes('@durmstrang.')) return true;
  if (e.startsWith('order.') && e.endsWith('@itsco.health')) return true;
  return false;
}

/** Sync pattern check — Hogwarts characters or demo playground fakes. */
export function looksLikeTestInboxRedirectAddress(email) {
  return looksLikeHogwartsDemoAddress(email) || looksLikeDemoFakeAddress(email);
}

async function loadHogwartsAffiliatedEmails() {
  const now = Date.now();
  if (now - hogwartsEmailCache.at < 60_000) return hogwartsEmailCache.emails;
  try {
    const { default: pool } = await import('../config/database.js');
    const [rows] = await pool.execute(
      `SELECT DISTINCT LOWER(TRIM(addr.email)) AS email
       FROM (
         SELECT u.email AS email
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.is_active = 1
         INNER JOIN agencies a ON a.id = ua.agency_id
         WHERE LOWER(COALESCE(a.slug, a.portal_url, '')) = 'hogwarts'
           AND u.email IS NOT NULL AND TRIM(u.email) <> ''
         UNION
         SELECT u.email
         FROM users u
         INNER JOIN provider_school_assignments psa
           ON psa.provider_user_id = u.id AND psa.is_active = 1
         INNER JOIN agencies a ON a.id = psa.school_organization_id
         WHERE LOWER(COALESCE(a.slug, a.portal_url, '')) = 'hogwarts'
           AND u.email IS NOT NULL AND TRIM(u.email) <> ''
         UNION
         SELECT u.email
         FROM client_guardians cg
         INNER JOIN users u ON u.id = cg.guardian_user_id
         INNER JOIN clients c ON c.id = cg.client_id
         INNER JOIN agencies a ON a.id = c.organization_id
         WHERE LOWER(COALESCE(a.slug, a.portal_url, '')) = 'hogwarts'
           AND u.email IS NOT NULL AND TRIM(u.email) <> ''
         UNION
         SELECT sc.email
         FROM school_contacts sc
         INNER JOIN agencies a ON a.id = sc.school_organization_id
         WHERE LOWER(COALESCE(a.slug, a.portal_url, '')) = 'hogwarts'
           AND sc.email IS NOT NULL AND TRIM(sc.email) <> ''
       ) addr
       WHERE addr.email IS NOT NULL AND TRIM(addr.email) <> ''`
    );
    const emails = new Set(
      (rows || [])
        .map((r) => String(r.email || '').trim().toLowerCase())
        .filter((e) => e && !isKeepRealHogwartsEmail(e))
    );
    hogwartsEmailCache = { at: now, emails };
    return emails;
  } catch {
    return hogwartsEmailCache.emails;
  }
}

async function loadDemoAgencyIds() {
  const now = Date.now();
  if (now - demoAgencyCache.at < 60_000) return demoAgencyCache.ids;
  try {
    const { default: pool } = await import('../config/database.js');
    const envIds = String(process.env.DEMO_MODE_FAKE_AGENCY_IDS || '')
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    const [rows] = await pool.execute(
      `SELECT id
       FROM agencies
       WHERE is_active = 1
         AND LOWER(COALESCE(slug, portal_url, '')) IN ('demo', 'demo-school', 'hogwarts', 'durmstrang')`
    );
    const ids = new Set(envIds);
    for (const row of rows || []) {
      const id = Number(row.id);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
    demoAgencyCache = { at: now, ids };
    return ids;
  } catch {
    return demoAgencyCache.ids;
  }
}

/**
 * True when this send is attached to a demo tenant / demo user / demo client.
 * Those messages are delivered to testing@itsco.health so demos never hit real inboxes.
 */
export async function shouldRedirectForDemoAttachment({ agencyId = null, userId = null, clientId = null } = {}) {
  const aid = Number(agencyId || 0);
  if (aid > 0) {
    const demoIds = await loadDemoAgencyIds();
    if (demoIds.has(aid)) return true;
  }
  try {
    const { default: pool } = await import('../config/database.js');
    const uid = Number(userId || 0);
    if (uid > 0) {
      const [rows] = await pool.execute(
        'SELECT COALESCE(is_demo, 0) AS is_demo FROM users WHERE id = ? LIMIT 1',
        [uid]
      );
      if (Number(rows?.[0]?.is_demo)) return true;
    }
    const cid = Number(clientId || 0);
    if (cid > 0) {
      const [rows] = await pool.execute(
        'SELECT COALESCE(is_demo, 0) AS is_demo FROM clients WHERE id = ? LIMIT 1',
        [cid]
      );
      if (Number(rows?.[0]?.is_demo)) return true;
    }
  } catch {
    /* best effort */
  }
  return false;
}

export async function shouldRedirectHogwartsOutboundEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || isKeepRealHogwartsEmail(e)) return false;
  if (looksLikeTestInboxRedirectAddress(e)) return true;
  const affiliated = await loadHogwartsAffiliatedEmails();
  return affiliated.has(e);
}

export function formatHogwartsTestSubject(originalTo, subject) {
  const orig = String(originalTo || '').trim();
  const sub = String(subject || '').trim();
  if (!orig) return sub;
  if (/\[(hogwarts|demo)?\s*test\s*(inbox)?\s*→/i.test(sub) || sub.toLowerCase().includes('[hogwarts test')) {
    return sub;
  }
  const first = orig.split(',')[0]?.trim() || orig;
  const label = looksLikeHogwartsDemoAddress(first) && !looksLikeDemoFakeAddress(first)
    ? 'Hogwarts test'
    : 'Demo test';
  return `[${label} → ${orig}] ${sub}`.trim();
}

export function buildTestInboxRedirectMetadata({ originalTo, deliveredTo = HOGWARTS_TEST_INBOX } = {}) {
  const orig = String(originalTo || '').trim();
  // Intentionally no qualityFlags — redirected demos should appear as normal "sent"
  // in automation (metadata still records the redirect for debugging).
  return {
    testInboxRedirect: true,
    originalTo: orig || null,
    deliveredTo: deliveredTo || HOGWARTS_TEST_INBOX
  };
}

/**
 * Rewrite outbound To/subject so demo/Hogwarts/@example.com mail lands in testing@itsco.health.
 * Real Williams / Chuckie / Piper / Loriana addresses are left unchanged.
 *
 * Optional agencyId / userId / clientId: when the send is attached to a demo
 * tenant or demo person, every non-keep-real recipient is redirected.
 */
export async function rewriteHogwartsOutboundRecipient({
  to,
  subject,
  agencyId = null,
  userId = null,
  clientId = null
} = {}) {
  const emails = extractEmailAddresses(to);
  if (!emails.length) {
    return { to, subject, redirected: false, originalTo: null };
  }

  const demoAttached = await shouldRedirectForDemoAttachment({ agencyId, userId, clientId });
  const redirect = [];
  const next = [];
  for (const email of emails) {
    if (isKeepRealHogwartsEmail(email)) {
      next.push(email);
      continue;
    }
    if (demoAttached || (await shouldRedirectHogwartsOutboundEmail(email))) {
      redirect.push(email);
      next.push(HOGWARTS_TEST_INBOX);
    } else {
      next.push(email);
    }
  }

  if (!redirect.length) {
    return { to, subject, redirected: false, originalTo: null };
  }

  const uniqueTo = [...new Set(next)].join(', ');
  const originalTo = [...new Set(redirect)].join(', ');
  return {
    to: uniqueTo,
    subject: formatHogwartsTestSubject(originalTo, subject),
    redirected: true,
    originalTo
  };
}
