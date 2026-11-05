import crypto from 'crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { sendSchoolRoiEmail } from './schoolRoiEmail.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { familyIntroductionLetter } from './familyIntroduction.logic.js';
import { fail } from './familyDocumentSession.logic.js';
import { buildProviderIntroductionPdf, introductionPdfAttachment, providerProfileUrl } from './familyWelcomeAssets.service.js';
import { SCHOOL_CONTACT_DEMO_AGENCY_ID } from './schoolContactPlan.service.js';

async function safe(connection, sql, params) {
  try {
    return await connection.execute(sql, params);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') return null;
    throw error;
  }
}

export async function cancelPendingFamilyIntroductions(connection, clientId) {
  await safe(
    connection,
    `UPDATE family_introduction_emails
     SET delivery_status = 'skipped', last_error = 'The provider was unassigned before the introduction was sent.'
     WHERE client_id = ? AND delivery_status = 'pending'`,
    [clientId]
  );
}

export async function queueFamilyIntroduction(connection, { clientId }) {
  const loaded = await safe(
    connection,
    `SELECT c.id, c.agency_id, c.organization_id,
            COALESCE(p.provider_user_id, c.provider_id) AS provider_user_id
     FROM clients c
     LEFT JOIN client_provider_assignments p
       ON p.client_id = c.id AND p.organization_id = c.organization_id AND p.is_active = 1
     WHERE c.id = ? LIMIT 1`,
    [clientId]
  );
  const row = loaded?.[0]?.[0];
  // Support introductions run with the Family Welcome & Follow-Up pilot only.
  if (!row?.provider_user_id || !row.organization_id || Number(row.agency_id) !== SCHOOL_CONTACT_DEMO_AGENCY_ID) return;
  const [schools] = await connection.execute(
    `SELECT id FROM agencies WHERE id = ? AND organization_type = 'school' LIMIT 1`,
    [row.organization_id]
  );
  if (!schools.length) return;
  await safe(
    connection,
    `INSERT INTO family_introduction_emails
      (client_id, agency_id, school_organization_id, provider_user_id, reminder_token, delivery_status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [row.id, row.agency_id, row.organization_id, row.provider_user_id, crypto.randomBytes(32).toString('hex')]
  );
}

async function stillAssigned(job) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM client_provider_assignments
     WHERE client_id = ? AND organization_id = ? AND provider_user_id = ? AND is_active = 1
     UNION
     SELECT 1 FROM clients WHERE id = ? AND provider_id = ? AND organization_id = ?
     LIMIT 1`,
    [job.client_id, job.school_organization_id, job.provider_user_id, job.client_id, job.provider_user_id, job.school_organization_id]
  );
  return rows.length > 0;
}

export async function sendPendingFamilyIntroductions() {
  let jobs = [];
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM family_introduction_emails WHERE delivery_status = 'pending' ORDER BY id LIMIT 20`
    );
    jobs = rows || [];
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
  const results = [];
  for (const job of jobs) {
    try {
      if (!(await stillAssigned(job))) {
        await pool.execute(
          `UPDATE family_introduction_emails SET delivery_status = 'skipped', last_error = ? WHERE id = ? AND delivery_status = 'pending'`,
          ['The provider is no longer assigned.', job.id]
        );
        continue;
      }
      const [planRows] = await pool.execute(
        `SELECT status FROM school_provider_contact_plans WHERE agency_id = ? AND provider_user_id = ? LIMIT 1`,
        [job.agency_id, job.provider_user_id]
      );
      if (planRows[0]?.status === 'enabled') {
        await pool.execute(
          `UPDATE family_introduction_emails SET delivery_status = 'skipped', last_error = ? WHERE id = ? AND delivery_status = 'pending'`,
          ['The provider sends their own Family Welcome & Follow-Up.', job.id]
        );
        continue;
      }
      const [[provider]] = await pool.execute(
        `SELECT id, first_name, last_name, email, work_email FROM users WHERE id = ? LIMIT 1`,
        [job.provider_user_id]
      );
      const [[school]] = await pool.execute(
        `SELECT id, name, slug, logo_path, logo_url FROM agencies WHERE id = ? LIMIT 1`,
        [job.school_organization_id]
      );
      const [[client]] = await pool.execute(
        `SELECT c.id, c.service_day, c.session_sms_opt_in, c.agency_id,
                COALESCE(a.service_day, c.service_day) AS assignment_day
         FROM clients c
         LEFT JOIN client_provider_assignments a
           ON a.client_id = c.id AND a.organization_id = ? AND a.provider_user_id = ? AND a.is_active = 1
         WHERE c.id = ? LIMIT 1`,
        [job.school_organization_id, job.provider_user_id, job.client_id]
      );
      const [[guardian]] = await pool.execute(
        `SELECT u.id, COALESCE(NULLIF(u.personal_email,''), NULLIF(u.email,'')) AS email,
                u.password_hash, u.temporary_password_hash
         FROM client_guardians cg
         JOIN users u ON u.id = cg.guardian_user_id
         WHERE cg.client_id = ? AND cg.access_enabled = 1 AND COALESCE(u.is_archived,0) = 0
         ORDER BY cg.id LIMIT 1`,
        [job.client_id]
      );
      if (!provider || !school || !client || !guardian?.email) {
        await pool.execute(
          `UPDATE family_introduction_emails SET delivery_status = 'skipped', last_error = ? WHERE id = ?`,
          ['A guardian email, school, or provider is missing.', job.id]
        );
        continue;
      }
      const [[slot]] = await pool.execute(
        `SELECT DATE_FORMAT(start_time, '%h:%i %p') AS soft_time
         FROM soft_schedule_slots
         WHERE client_id = ? AND provider_user_id = ? AND school_organization_id = ? AND start_time IS NOT NULL
         ORDER BY (LOWER(CAST(weekday AS CHAR)) = LOWER(?)) DESC, slot_index LIMIT 1`,
        [client.id, provider.id, school.id, client.assignment_day || client.service_day || '']
      );
      const agency = await Agency.findById(client.agency_id);
      const providerName = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || 'Your provider';
      const profileUrl = providerProfileUrl(agency, provider);
      const providerEmail = String(provider.work_email || provider.email || '').trim().toLowerCase();
      const portalUrl = buildPublicAppUrl(agency, 'login');
      const reminderUrl = buildPublicAppUrl(agency, `family-introduction/reminders/${job.reminder_token}`);
      const letter = familyIntroductionLetter({
        providerName,
        schoolName: school.name,
        serviceDay: client.assignment_day || client.service_day,
        softTime: slot?.soft_time || '',
        hasAccount: Boolean(guardian.password_hash || guardian.temporary_password_hash),
        remindersOn: Number(client.session_sms_opt_in) === 1,
        reminderUrl,
        profileUrl,
        portalUrl,
        providerCopied: Boolean(providerEmail)
      });
      const pdf = await buildProviderIntroductionPdf({ agencyId: client.agency_id, providerUserId: provider.id, schoolId: school.id });
      const attachments = [introductionPdfAttachment(pdf)];
      const [claim] = await pool.execute(
        `UPDATE family_introduction_emails SET delivery_status = 'sending' WHERE id = ? AND delivery_status = 'pending'`,
        [job.id]
      );
      if (!claim.affectedRows) continue;
      const result = await sendSchoolRoiEmail({
        agencyId: client.agency_id,
        to: guardian.email,
        cc: providerEmail || null,
        subject: letter.subject,
        text: letter.text,
        html: letter.html,
        attachments,
        clientId: client.id,
        templateType: 'family_introduction',
        linkUrl: portalUrl,
        source: 'auto',
        generatedByUserId: provider.id
      });
      const sent = Boolean(result?.id && !result.skipped && !result.blocked);
      await pool.execute(
        `UPDATE family_introduction_emails
         SET delivery_status = ?, communication_id = ?, sent_at = IF(?, UTC_TIMESTAMP(), NULL), last_error = ?
         WHERE id = ?`,
        [sent ? 'sent' : 'failed', result?.communicationId || null, sent ? 1 : 0, sent ? null : (result?.reason || 'The email was not sent.'), job.id]
      );
      results.push({ id: job.id, status: sent ? 'sent' : 'failed' });
    } catch (error) {
      await pool.execute(
        `UPDATE family_introduction_emails SET delivery_status = 'failed', last_error = ? WHERE id = ?`,
        [String(error.message || error).slice(0, 500), job.id]
      ).catch(() => {});
      results.push({ id: job.id, status: 'failed' });
    }
  }
  return results;
}

export async function getFamilyIntroductionReminder(token) {
  const clean = String(token || '').trim();
  const [rows] = await pool.execute(
    `SELECT e.id, e.reminder_opted_in_at, c.session_sms_opt_in, s.name AS school_name,
            TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS provider_name
     FROM family_introduction_emails e
     JOIN clients c ON c.id = e.client_id
     JOIN agencies s ON s.id = e.school_organization_id
     JOIN users u ON u.id = e.provider_user_id
     WHERE e.reminder_token = ? LIMIT 1`,
    [clean]
  );
  if (!rows[0]) throw fail(404, 'This reminder link is not valid.');
  return {
    providerName: rows[0].provider_name || 'Your provider',
    schoolName: rows[0].school_name || 'your school',
    remindersOn: Boolean(rows[0].reminder_opted_in_at) || Number(rows[0].session_sms_opt_in) === 1
  };
}

export async function optInFamilyIntroductionReminders(token) {
  const clean = String(token || '').trim();
  const [rows] = await pool.execute(
    `SELECT e.id, e.client_id, e.agency_id, g.guardian_user_id
     FROM family_introduction_emails e
     LEFT JOIN (
       SELECT client_id, MIN(guardian_user_id) AS guardian_user_id
       FROM client_guardians WHERE access_enabled = 1 GROUP BY client_id
     ) g ON g.client_id = e.client_id
     WHERE e.reminder_token = ? LIMIT 1`,
    [clean]
  );
  const row = rows[0];
  if (!row) throw fail(404, 'This reminder link is not valid.');
  await pool.execute(`UPDATE clients SET session_sms_opt_in = 1 WHERE id = ?`, [row.client_id]);
  if (row.guardian_user_id) {
    const channels = JSON.stringify({ in_app: true, email: true, sms: true, phone: false });
    await pool.execute(
      `INSERT INTO client_session_notification_preferences
        (agency_id, client_id, guardian_user_id, channels_json, optional_reminders_enabled,
         confirmation_requests_enabled, provider_pushed_updates_enabled, scheduling_changes_enabled)
       VALUES (?, ?, ?, ?, 1, 1, 1, 1)
       ON DUPLICATE KEY UPDATE optional_reminders_enabled = 1, confirmation_requests_enabled = 1,
         provider_pushed_updates_enabled = 1, scheduling_changes_enabled = 1`,
      [row.agency_id, row.client_id, row.guardian_user_id, channels]
    ).catch(() => {});
    await pool.execute(
      `UPDATE family_notification_choices
       SET choices_json = JSON_SET(COALESCE(choices_json, JSON_OBJECT()), '$.appointments', 'both', '$.schedule_changes', 'both')
       WHERE client_id = ? AND guardian_user_id = ?`,
      [row.client_id, row.guardian_user_id]
    ).catch(() => {});
  }
  await pool.execute(
    `UPDATE family_introduction_emails SET reminder_opted_in_at = UTC_TIMESTAMP() WHERE id = ?`,
    [row.id]
  );
  return getFamilyIntroductionReminder(clean);
}