import pool from '../config/database.js';

const FREEMAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'msn.com',
  'live.com',
  'me.com',
  'protonmail.com',
  'proton.me'
]);

const PHI_PATTERNS = [
  /\bssn\b/i,
  /\bsocial security\b/i,
  /\bdate of birth\b/i,
  /\bdob\b/i,
  /\bdiagnos(is|es|ed)\b/i,
  /\bmedication\b/i,
  /\bhipaa\b/i,
  /\bphi\b/i,
  /\bpatient\b/i,
  /\btreatment plan\b/i,
  /\bmedicaid\b/i,
  /\bmedicare\b/i,
  /\bnpi\b/i
];

function extractEmails(payload = {}) {
  const bags = [payload.to, payload.cc, payload.bcc];
  const out = [];
  for (const bag of bags) {
    if (!bag) continue;
    if (typeof bag === 'string') {
      bag.split(/[,;]/).forEach((s) => {
        const e = s.trim().toLowerCase();
        if (e.includes('@')) out.push(e.replace(/.*</, '').replace(/>.*/, '').trim());
      });
    } else if (Array.isArray(bag)) {
      for (const item of bag) {
        const e = String(item?.email || item || '')
          .trim()
          .toLowerCase();
        if (e.includes('@')) out.push(e);
      }
    }
  }
  return [...new Set(out)];
}

function domainOf(email) {
  const parts = String(email || '').split('@');
  return (parts[1] || '').toLowerCase();
}

/**
 * Search agency users + school contacts for compose typeahead.
 */
export async function searchCommunicationDirectory({ agencyId, q, limit = 20 }) {
  const query = String(q || '').trim();
  if (!agencyId || query.length < 2) return [];

  const like = `%${query.replace(/[%_]/g, '')}%`;
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 40);
  const results = [];

  const [users] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.work_email, u.role, u.sso_password_override
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       AND (ua.is_active = 1 OR ua.is_active IS NULL)
     WHERE LOWER(COALESCE(u.role, '')) IN (
         'admin','super_admin','support','staff','provider','provider_plus',
         'clinical_practice_assistant','schedule_manager','supervisor','intern',
         'school_staff'
       )
       AND LOWER(COALESCE(u.status, '')) NOT IN ('archived', 'inactive', 'terminated', 'deleted')
       AND LOWER(COALESCE(u.status, '')) NOT LIKE '%archiv%'
       AND (
         u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?
         OR u.work_email LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
       )
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT ${lim}`,
    [agencyId, like, like, like, like, like]
  );

  for (const u of users || []) {
    const email = String(u.work_email || u.email || '').trim();
    if (!email) continue;
    results.push({
      kind: u.role === 'school_staff' ? 'school_staff' : 'employee',
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' '),
      email,
      meta: u.role,
      role: u.role,
      ssoPasswordOverride: !!(u.sso_password_override === 1 || u.sso_password_override === true)
    });
  }

  try {
    const [contacts] = await pool.execute(
      `SELECT sc.id, sc.full_name, sc.email, sc.role_title, sc.school_organization_id, a.name AS school_name
       FROM school_contacts sc
       LEFT JOIN agencies a ON a.id = sc.school_organization_id
       LEFT JOIN agency_schools ash ON ash.school_organization_id = sc.school_organization_id AND ash.is_active = TRUE
       WHERE sc.email IS NOT NULL AND TRIM(sc.email) <> ''
         AND (ash.agency_id = ? OR sc.school_organization_id = ?)
         AND (sc.full_name LIKE ? OR sc.email LIKE ? OR a.name LIKE ?)
       ORDER BY sc.full_name ASC
       LIMIT ${lim}`,
      [agencyId, agencyId, like, like, like]
    );
    for (const c of contacts || []) {
      results.push({
        kind: 'school_contact',
        id: c.id,
        name: c.full_name || c.email,
        email: c.email,
        meta: [c.school_name, c.role_title].filter(Boolean).join(' · ')
      });
    }
  } catch (e) {
    console.warn('[directory] school_contacts search skipped:', e?.message || e);
  }

  // Dedupe by email
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = String(r.email || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped.slice(0, lim);
}

/**
 * Preflight warnings before sending externally.
 */
export async function evaluateSendPreflight({ agencyId, payload = {}, fromEmail = null } = {}) {
  const warnings = [];
  const emails = extractEmails(payload);
  const fromDomain = domainOf(fromEmail);

  let agencyDomains = new Set();
  if (fromDomain) agencyDomains.add(fromDomain);
  if (agencyId) {
    try {
      const [rows] = await pool.execute(
        `SELECT from_email FROM email_sender_identities WHERE agency_id = ? AND is_active = 1`,
        [agencyId]
      );
      for (const r of rows || []) {
        const d = domainOf(r.from_email);
        if (d) agencyDomains.add(d);
      }
    } catch {
      /* ignore */
    }
  }

  const external = emails.filter((e) => {
    const d = domainOf(e);
    if (!d) return false;
    if (agencyDomains.has(d)) return false;
    return true;
  });

  if (external.length) {
    warnings.push({
      code: 'external_recipient',
      severity: 'warn',
      message: `External recipient — this email is leaving your organization (${external.slice(0, 3).join(', ')}${external.length > 3 ? '…' : ''}).`
    });
  }

  const freemail = external.filter((e) => FREEMAIL.has(domainOf(e)));
  if (freemail.length) {
    warnings.push({
      code: 'freemail_recipient',
      severity: 'warn',
      message: 'Recipient uses a personal freemail address. Confirm this is appropriate for work content.'
    });
  }

  const body = `${payload.subject || ''}\n${payload.text || ''}\n${payload.html || ''}`;
  const phiHits = PHI_PATTERNS.filter((re) => re.test(body));
  if (phiHits.length && (external.length || freemail.length)) {
    warnings.push({
      code: 'phi_risk',
      severity: 'warn',
      message: 'Possible protected health information detected while sending outside the system. Remove identifiers or use a secure channel if this contains PHI.'
    });
  }

  // School staff routing: email-only (no SSO) → offer secure message; SSO → prefer DM
  const schoolStaffHints = [];
  for (const em of emails) {
    try {
      const [rows] = await pool.execute(
        `SELECT u.id, u.role, u.sso_password_override, u.email, u.work_email
         FROM users u
         WHERE LOWER(u.email) = ? OR LOWER(COALESCE(u.work_email,'')) = ? OR LOWER(COALESCE(u.personal_email,'')) = ?
         LIMIT 1`,
        [em, em, em]
      );
      const u = rows?.[0];
      if (!u || String(u.role || '').toLowerCase() !== 'school_staff') {
        // school contact without user account → treat as email-only
        const [contacts] = await pool.execute(
          `SELECT id FROM school_contacts WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
          [em]
        );
        if (contacts?.length) {
          schoolStaffHints.push({
            email: em,
            kind: 'school_staff_email_only',
            code: 'school_staff_secure_prompt',
            message: `${em} looks like school staff without SSO. Send as a secure message (like clients), or continue as regular email.`
          });
        }
        continue;
      }
      const hasSsoOverride = u.sso_password_override === 1 || u.sso_password_override === true;
      const onAgencyDomain = agencyDomains.has(domainOf(u.work_email || u.email));
      if (hasSsoOverride || onAgencyDomain) {
        schoolStaffHints.push({
          email: em,
          kind: 'school_staff_sso',
          code: 'school_staff_prefer_dm',
          message: `${em} can use Direct Message (encrypted). Prefer Messages DM instead of email for school staff with portal/SSO access.`
        });
      } else {
        schoolStaffHints.push({
          email: em,
          kind: 'school_staff_email_only',
          code: 'school_staff_secure_prompt',
          message: `${em} is school staff without SSO. Send as a secure message notification, or continue as regular email.`
        });
      }
    } catch {
      /* ignore */
    }
  }
  for (const hint of schoolStaffHints) {
    warnings.push({
      code: hint.code,
      severity: 'warn',
      message: hint.message,
      email: hint.email,
      kind: hint.kind
    });
  }

  return {
    ok: true,
    external: external.length > 0,
    phiRisk: phiHits.length > 0 && external.length > 0,
    warnings,
    recipients: emails,
    schoolStaffHints
  };
}
