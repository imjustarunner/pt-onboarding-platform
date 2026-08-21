import {
  listDistrictBackgroundProcesses,
  upsertDistrictBackgroundProcess,
  districtsForUser,
  getAdminTenantEmail
} from '../services/expiringBackgroundCompliance.service.js';
import pool from '../config/database.js';
import {
  FEDERAL_BG_ITEM_KEY,
  resolveAgencyIdForUser,
  syncFederalBackgroundExpiration
} from '../services/federalBackgroundCheck.service.js';
import UserLifecycleChecklistItem from '../models/UserLifecycleChecklistItem.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from '../services/emailSenderIdentityResolver.service.js';

function canManage(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'support'].includes(role);
}

function toYmd(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export async function getDistrictBackgroundProcesses(req, res, next) {
  try {
    const agencyId = Number(req.params.agencyId || req.query.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const rows = await listDistrictBackgroundProcesses(agencyId);
    res.json({ processes: rows });
  } catch (e) {
    next(e);
  }
}

export async function putDistrictBackgroundProcess(req, res, next) {
  try {
    if (!canManage(req)) {
      return res.status(403).json({ error: { message: 'Admin/support only' } });
    }
    const agencyId = Number(req.params.agencyId || 0);
    const districtName = String(req.body?.districtName || req.body?.district_name || '').trim();
    const processText = req.body?.processText ?? req.body?.process_text ?? '';
    const row = await upsertDistrictBackgroundProcess({
      agencyId,
      districtName,
      processText,
      actorUserId: req.user?.id || null
    });
    res.json({ process: row });
  } catch (e) {
    next(e);
  }
}

/** Processes for districts the target user is assigned to (admin button on profile). */
export async function getUserDistrictBackgroundProcesses(req, res, next) {
  try {
    if (!canManage(req)) {
      return res.status(403).json({ error: { message: 'Admin/support only' } });
    }
    const userId = Number(req.params.id || 0);
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || 0);
    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'userId and agencyId required' } });
    }
    const districts = await districtsForUser(userId);
    const names = districts.map((d) => d.district_name);
    const all = await listDistrictBackgroundProcesses(agencyId);
    const byName = new Map(all.map((p) => [p.district_name, p]));
    res.json({
      districts: names.map((district_name) => ({
        district_name,
        process_text: byName.get(district_name)?.process_text || '',
        id: byName.get(district_name)?.id || null
      }))
    });
  } catch (e) {
    next(e);
  }
}

async function loadFingerprintDate(userId) {
  const [rows] = await pool.execute(
    `SELECT uiv.value
     FROM user_info_values uiv
     JOIN user_info_field_definitions d ON d.id = uiv.field_definition_id
     WHERE uiv.user_id = ?
       AND d.field_key = 'provider_fingerprint_date'
     LIMIT 1`,
    [userId]
  );
  return toYmd(rows?.[0]?.value) || null;
}

async function loadFederalBgRow(userId) {
  const [bg] = await pool.execute(
    `SELECT ulci.id, ulci.definition_id, ulci.completed_at, ulci.expires_at, ulci.scheduled_at, ulci.is_completed
     FROM user_lifecycle_checklist_items ulci
     JOIN lifecycle_checklist_definitions lcd ON lcd.id = ulci.definition_id
     WHERE ulci.user_id = ?
       AND lcd.item_key = ?
       AND lcd.agency_id IS NULL
     LIMIT 1`,
    [userId, FEDERAL_BG_ITEM_KEY]
  );
  return bg?.[0] || null;
}

/** Provider self: federal BG expiration + schedule date (Account Info). */
export async function getMyBackgroundExpiration(req, res, next) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const row = await loadFederalBgRow(userId);
    const fingerprintDate = await loadFingerprintDate(userId);
    const districts = await districtsForUser(userId);
    res.json({
      completedAt: row?.completed_at || null,
      expiresAt: row?.expires_at || null,
      scheduledAt: row?.scheduled_at || null,
      fingerprintDate,
      definitionId: row?.definition_id || null,
      districts: districts || []
    });
  } catch (e) {
    next(e);
  }
}

async function resolveComplianceOrNotificationsIdentity(agencyId) {
  const preferred = await resolvePreferredSenderIdentityForAgency({
    agencyId,
    preferredKeys: ['compliance', 'notifications', 'system'],
    includePlatformDefaults: true,
    onlyActive: true
  });
  if (Number(preferred?.id || 0)) return Number(preferred.id);
  const byEmail = await EmailSenderIdentity.findByFromEmail('Compliance@ITSCO.health', {
    preferAgencyId: agencyId
  });
  return Number(byEmail?.id || 0) || null;
}

/**
 * Provider self: set scheduled date for federal BG/fingerprint renewal.
 * Emails tenant admin that the background check was scheduled.
 */
export async function putMyBackgroundScheduledDate(req, res, next) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const scheduledYmd = toYmd(req.body?.scheduledAt ?? req.body?.scheduled_at ?? null);
    if (!scheduledYmd) {
      return res.status(400).json({ error: { message: 'scheduledAt (YYYY-MM-DD) is required' } });
    }

    let row = await loadFederalBgRow(userId);
    let definitionId = row?.definition_id ? Number(row.definition_id) : null;
    if (!definitionId) {
      const [defs] = await pool.execute(
        `SELECT id FROM lifecycle_checklist_definitions
         WHERE item_key = ? AND agency_id IS NULL LIMIT 1`,
        [FEDERAL_BG_ITEM_KEY]
      );
      definitionId = defs?.[0]?.id ? Number(defs[0].id) : null;
    }
    if (!definitionId) {
      return res.status(500).json({ error: { message: 'Federal background checklist definition missing' } });
    }

    await UserLifecycleChecklistItem.setScheduledAt(userId, definitionId, scheduledYmd);
    await syncFederalBackgroundExpiration(userId).catch(() => null);

    const agencyId = await resolveAgencyIdForUser(userId, req.user?.agencyId || null);
    const adminEmail = agencyId ? await getAdminTenantEmail(agencyId) : 'admin@ITSCO.health';
    const providerName = `${req.user?.firstName || req.user?.first_name || ''} ${req.user?.lastName || req.user?.last_name || ''}`.trim()
      || req.user?.email
      || 'A provider';
    const scheduledLabel = new Date(`${scheduledYmd}T00:00:00`).toLocaleDateString();

    if (adminEmail && agencyId) {
      const identityId = await resolveComplianceOrNotificationsIdentity(agencyId);
      if (identityId) {
        const subject = 'Background check scheduled';
        const text = [
          `${providerName} scheduled their Federal Background/Fingerprint Check for ${scheduledLabel}.`,
          '',
          `Provider user id: ${userId}`,
          `Scheduled date: ${scheduledYmd}`,
          '',
          'Once that date passes it will be recorded as their background check date and expiration will update automatically.'
        ].join('\n');
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;">
          <p><strong>${providerName}</strong> scheduled their Federal Background/Fingerprint Check for <strong>${scheduledLabel}</strong>.</p>
          <p>Provider user id: ${userId}<br/>Scheduled date: ${scheduledYmd}</p>
          <p>Once that date passes it will be recorded as their background check date and expiration will update automatically.</p>
        </div>`;
        await sendEmailFromIdentity({
          senderIdentityId: identityId,
          to: adminEmail,
          subject,
          text,
          html,
          source: 'auto',
          agencyId,
          userId,
          templateType: 'background_check_scheduled_admin',
          replyToOverride: 'Compliance@ITSCO.health'
        }).catch((err) => {
          console.error('[backgroundScheduled] admin email failed', err?.message || err);
        });
      }
    }

    row = await loadFederalBgRow(userId);
    const fingerprintDate = await loadFingerprintDate(userId);
    const districts = await districtsForUser(userId);
    res.json({
      completedAt: row?.completed_at || null,
      expiresAt: row?.expires_at || null,
      scheduledAt: row?.scheduled_at || null,
      fingerprintDate,
      definitionId: row?.definition_id || null,
      districts: districts || [],
      adminNotified: !!adminEmail
    });
  } catch (e) {
    next(e);
  }
}
