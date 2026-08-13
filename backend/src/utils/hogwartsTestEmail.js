/**
 * Hogwarts demo people keep character emails on their accounts
 * (e.g. sirius.black@hogwarts.edu / order.sirius.black@itsco.health)
 * but outbound mail is delivered to the ITSCO testing inbox.
 *
 * Real Hogwarts-assigned people (Williams, Chuckie, Piper Finch, Loriana)
 * are never redirected.
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

let hogwartsEmailCache = { at: 0, emails: new Set() };

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

export function looksLikeHogwartsDemoAddress(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || isKeepRealHogwartsEmail(e)) return false;
  if (e.endsWith('@hogwarts.edu') || e.includes('@hogwarts.') || e.includes('@durmstrang.')) return true;
  if (e.startsWith('order.') && e.endsWith('@itsco.health')) return true;
  return false;
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

export async function shouldRedirectHogwartsOutboundEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || isKeepRealHogwartsEmail(e)) return false;
  if (looksLikeHogwartsDemoAddress(e)) return true;
  const affiliated = await loadHogwartsAffiliatedEmails();
  return affiliated.has(e);
}

export function formatHogwartsTestSubject(originalTo, subject) {
  const orig = String(originalTo || '').trim();
  const sub = String(subject || '').trim();
  if (!orig) return sub;
  if (sub.toLowerCase().includes('[hogwarts test')) return sub;
  return `[Hogwarts test → ${orig}] ${sub}`.trim();
}

/**
 * Rewrite outbound To/subject so Hogwarts demo mail lands in testing@itsco.health.
 * Real Williams / Chuckie / Piper / Loriana addresses are left unchanged.
 */
export async function rewriteHogwartsOutboundRecipient({ to, subject } = {}) {
  const emails = extractEmailAddresses(to);
  if (!emails.length) {
    return { to, subject, redirected: false, originalTo: null };
  }

  const redirect = [];
  const next = [];
  for (const email of emails) {
    if (await shouldRedirectHogwartsOutboundEmail(email)) {
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
