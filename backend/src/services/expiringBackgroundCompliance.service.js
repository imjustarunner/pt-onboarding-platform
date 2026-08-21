/**
 * Compliance “Expiring Background” emails for school-assigned providers.
 * Tiers: 90d, 30d, 7d, and already-expired (one-shot per expires_on).
 */
import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import Agency from '../models/Agency.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { FEDERAL_BG_ITEM_KEY } from './federalBackgroundCheck.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';

const TEMPLATE_TYPE = 'expiring_background';
const SUBJECT = 'Expiring Background';

async function resolveComplianceIdentityId(agencyId) {
  const aid = Number(agencyId || 0) || null;
  const preferred = await resolvePreferredSenderIdentityForAgency({
    agencyId: aid,
    preferredKeys: ['compliance', 'notifications'],
    includePlatformDefaults: true,
    onlyActive: true
  });
  if (Number(preferred?.id || 0)) return Number(preferred.id);
  const byEmail = await EmailSenderIdentity.findByFromEmail('Compliance@ITSCO.health', {
    preferAgencyId: aid
  });
  return Number(byEmail?.id || 0) || null;
}

export async function getAdminTenantEmail(agencyId) {
  const agency = await Agency.findById(agencyId);
  const slug = String(agency?.slug || '').toLowerCase();
  if (slug === 'itsco' || Number(agencyId) === 2) return 'admin@ITSCO.health';
  const domain = String(agency?.notification_sender_email || '').split('@')[1]
    || String(agency?.portal_url || '').replace(/^https?:\/\//, '').split('/')[0]
    || null;
  if (domain && domain.includes('.')) return `admin@${domain.replace(/^app\./, '')}`;
  return null;
}

export async function listDistrictBackgroundProcesses(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT id, agency_id, district_name, process_text, updated_at, updated_by_user_id
     FROM agency_district_background_processes
     WHERE agency_id = ?
     ORDER BY district_name ASC`,
    [aid]
  );
  return rows || [];
}

export async function upsertDistrictBackgroundProcess({
  agencyId,
  districtName,
  processText,
  actorUserId = null
}) {
  const aid = Number(agencyId || 0);
  const name = String(districtName || '').trim();
  if (!aid || !name) throw Object.assign(new Error('agencyId and districtName required'), { status: 400 });
  await pool.execute(
    `INSERT INTO agency_district_background_processes
       (agency_id, district_name, process_text, updated_by_user_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       process_text = VALUES(process_text),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [aid, name, processText == null ? null : String(processText), actorUserId || null]
  );
  const [rows] = await pool.execute(
    `SELECT id, agency_id, district_name, process_text, updated_at, updated_by_user_id
     FROM agency_district_background_processes
     WHERE agency_id = ? AND district_name = ?
     LIMIT 1`,
    [aid, name]
  );
  return rows?.[0] || null;
}

export async function districtsForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT TRIM(COALESCE(sp.district_name, '')) AS district_name,
            a.id AS school_organization_id,
            a.name AS school_name
     FROM user_agencies ua
     JOIN agencies a ON a.id = ua.agency_id
     LEFT JOIN school_profiles sp ON sp.school_organization_id = a.id
     WHERE ua.user_id = ?
       AND (ua.is_active = TRUE OR ua.is_active IS NULL)
       AND LOWER(COALESCE(a.organization_type, '')) = 'school'
       AND TRIM(COALESCE(sp.district_name, '')) <> ''`,
    [userId]
  );
  return (rows || []).filter((r) => r.district_name);
}

async function processesForDistricts(agencyId, districtNames) {
  const names = [...new Set((districtNames || []).map((d) => String(d).trim()).filter(Boolean))];
  if (!names.length) return new Map();
  const [rows] = await pool.execute(
    `SELECT district_name, process_text
     FROM agency_district_background_processes
     WHERE agency_id = ?
       AND district_name IN (${names.map(() => '?').join(',')})`,
    [agencyId, ...names]
  );
  const map = new Map();
  for (const row of rows || []) map.set(String(row.district_name), String(row.process_text || '').trim());
  return map;
}

export function tierForDays(days) {
  if (days < 0) return 'expired';
  if (days <= 7) return '7d';
  if (days <= 30) return '30d';
  if (days <= 90) return '90d';
  return null;
}

function buildBody({
  providerName,
  expiresLabel,
  days,
  tier,
  districts,
  processMap,
  loginUrl
}) {
  const districtList = districts.map((d) => d.district_name).filter(Boolean);
  const districtPhrase = districtList.length
    ? districtList.join(', ')
    : 'your assigned district(s)';

  let lead = '';
  if (tier === 'expired') {
    lead = `Your Federal Background/Fingerprint Check expired on ${expiresLabel}. You cannot proceed in ${districtPhrase} until this is renewed. Please schedule and complete your renewal immediately.`;
  } else if (tier === '90d') {
    lead = `Your Federal Background/Fingerprint Check expires on ${expiresLabel} (about ${days} days). Please begin scheduling your renewal soon.`;
  } else if (tier === '30d') {
    lead = `Your Federal Background/Fingerprint Check expires on ${expiresLabel}. You must schedule now so there is no gap in school coverage.`;
  } else {
    lead = `Your Federal Background/Fingerprint Check expires on ${expiresLabel} (within 7 days). You cannot proceed in ${districtPhrase} until this is renewed.`;
  }

  const processBlocks = [];
  for (const d of districtList) {
    const text = processMap.get(d);
    if (text) processBlocks.push(`Process for ${d}:\n${text}`);
    else processBlocks.push(`Process for ${d}:\n(Contact Compliance — process not yet published for this district.)`);
  }

  const text = [
    `Hello ${providerName},`,
    '',
    lead,
    '',
    ...(processBlocks.length ? ['Background check process:', '', ...processBlocks, ''] : []),
    `View your account: ${loginUrl}`,
    '',
    'Thank you,',
    'Compliance Team',
    'Compliance@ITSCO.health'
  ].join('\n');

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111;max-width:640px;">
      <p>Hello ${esc(providerName)},</p>
      <p>${esc(lead)}</p>
      ${processBlocks.map((b) => `<pre style="white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:6px;">${esc(b)}</pre>`).join('')}
      <p><a href="${esc(loginUrl)}">Open your account</a></p>
      <p>Thank you,<br/><strong>Compliance Team</strong><br/>Compliance@ITSCO.health</p>
    </div>
  `.trim();

  return { text, html };
}

async function alreadyEmailed({ userId, tier, expiresOn }) {
  const [rows] = await pool.execute(
    `SELECT id FROM expiring_background_email_log
     WHERE user_id = ? AND tier = ? AND expires_on = ?
     LIMIT 1`,
    [userId, tier, expiresOn]
  );
  return !!rows?.[0]?.id;
}

async function notifyAdminsPersonWasEmailed({ agencyId, providerUserId, providerName, tier, expiresLabel }) {
  const [admins] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND (ua.is_active = TRUE OR ua.is_active IS NULL)
       AND u.is_active = TRUE
       AND u.role IN ('admin','super_admin','support')`,
    [agencyId]
  );
  const tierLabel =
    tier === '90d' ? '3 months out'
      : tier === '30d' ? '1 month out'
        : tier === '7d' ? '7 days'
          : 'already expired';
  await Promise.all(
    (admins || []).map((a) =>
      createNotificationAndDispatch({
        type: 'expiring_background_provider_notified',
        severity: tier === '7d' || tier === 'expired' ? 'urgent' : 'warning',
        title: 'Expiring Background — provider notified',
        message: `${providerName} was emailed (${tierLabel}) about Federal Background/Fingerprint Check expiring ${expiresLabel}.`,
        userId: a.id,
        agencyId,
        relatedEntityType: 'user',
        relatedEntityId: providerUserId,
        actorSource: 'System'
      }).catch(() => null)
    )
  );
}

/**
 * Daily tick: send Compliance Expiring Background emails for school-assigned providers.
 */
export async function runExpiringBackgroundComplianceEmails() {
  // Resolve tenant agency (organization_type agency/empty), not school orgs —
  // school-only join rows were excluding providers from the ladder entirely.
  const [rows] = await pool.execute(
    `SELECT ulci.id AS item_id,
            ulci.user_id,
            ulci.expires_at,
            u.email,
            u.first_name,
            u.last_name,
            tenant.agency_id
     FROM user_lifecycle_checklist_items ulci
     JOIN lifecycle_checklist_definitions lcd ON lcd.id = ulci.definition_id
     JOIN users u ON u.id = ulci.user_id
     JOIN (
       SELECT ua.user_id, MIN(ua.agency_id) AS agency_id
       FROM user_agencies ua
       JOIN agencies a ON a.id = ua.agency_id
       WHERE (ua.is_active = TRUE OR ua.is_active IS NULL)
         AND (
           LOWER(COALESCE(a.organization_type, '')) IN ('agency', '')
           OR a.organization_type IS NULL
         )
       GROUP BY ua.user_id
     ) tenant ON tenant.user_id = u.id
     WHERE lcd.item_key = ?
       AND lcd.agency_id IS NULL
       AND ulci.is_completed = 1
       AND ulci.expires_at IS NOT NULL
       AND u.is_active = TRUE
       AND EXISTS (
         SELECT 1 FROM user_agencies ua2
         JOIN agencies s ON s.id = ua2.agency_id
         WHERE ua2.user_id = u.id
           AND (ua2.is_active = TRUE OR ua2.is_active IS NULL)
           AND LOWER(COALESCE(s.organization_type, '')) = 'school'
       )`,
    [FEDERAL_BG_ITEM_KEY]
  );

  const seen = new Set();
  let sent = 0;
  let skipped = 0;
  for (const row of rows || []) {
    const key = `${row.agency_id}:${row.user_id}:${row.item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const expiresYmd = String(row.expires_at).slice(0, 10);
    const expiresDate = new Date(`${expiresYmd}T00:00:00`);
    if (Number.isNaN(expiresDate.getTime())) {
      skipped += 1;
      continue;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((expiresDate - today) / (24 * 60 * 60 * 1000));
    const tier = tierForDays(days);
    if (!tier) continue;
    if (await alreadyEmailed({ userId: row.user_id, tier, expiresOn: expiresYmd })) continue;

    const districts = await districtsForUser(row.user_id);

    const identityId = await resolveComplianceIdentityId(row.agency_id);
    if (!identityId) {
      console.warn('[expiringBackground] no Compliance identity for agency', row.agency_id);
      skipped += 1;
      continue;
    }

    const processMap = await processesForDistricts(
      row.agency_id,
      districts.map((d) => d.district_name)
    );
    const providerName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Provider';
    const expiresLabel = expiresDate.toLocaleDateString();
    const loginUrl = 'https://app.itsco.health/account-info';
    const { text, html } = buildBody({
      providerName,
      expiresLabel,
      days,
      tier,
      districts,
      processMap,
      loginUrl
    });

    const to = String(row.email || '').trim();
    if (!to) {
      skipped += 1;
      continue;
    }

    let cc = null;
    if (tier === '7d' || tier === 'expired') {
      cc = await getAdminTenantEmail(row.agency_id);
    }

    try {
      const result = await sendEmailFromIdentity({
        senderIdentityId: identityId,
        to,
        cc: cc || undefined,
        subject: SUBJECT,
        text,
        html,
        source: 'auto',
        agencyId: row.agency_id,
        userId: row.user_id,
        templateType: TEMPLATE_TYPE,
        replyToOverride: 'Compliance@ITSCO.health',
        linkUrl: loginUrl
      });
      if (result?.skipped || result?.blocked) {
        console.warn('[expiringBackground] send skipped/blocked', {
          userId: row.user_id,
          skipped: result?.skipped,
          blocked: result?.blocked,
          reason: result?.reason || result?.blockReason
        });
        skipped += 1;
        continue;
      }

      await pool.execute(
        `INSERT INTO expiring_background_email_log
           (agency_id, user_id, tier, expires_on, communication_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP`,
        [row.agency_id, row.user_id, tier, expiresYmd, result?.communicationId || null]
      );

      await notifyAdminsPersonWasEmailed({
        agencyId: row.agency_id,
        providerUserId: row.user_id,
        providerName,
        tier,
        expiresLabel
      });
      sent += 1;
    } catch (err) {
      console.error('[expiringBackground] send failed', err?.message || err);
      skipped += 1;
    }
  }
  return { sent, skipped, candidates: (rows || []).length };
}

export default {
  listDistrictBackgroundProcesses,
  upsertDistrictBackgroundProcess,
  runExpiringBackgroundComplianceEmails,
  getAdminTenantEmail,
  districtsForUser,
  tierForDays
};
