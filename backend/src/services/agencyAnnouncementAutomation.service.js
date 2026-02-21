import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

const DEFAULT_BIRTHDAY_TEMPLATE = 'Happy Birthday, {fullName}';
const DEFAULT_ANNIVERSARY_TEMPLATE = 'Happy {years}-year anniversary, {fullName}';

const formatNameList = (names) => {
  const list = (names || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
};

const renderAnniversaryTemplate = (template, people = []) => {
  const tpl = String(template || DEFAULT_ANNIVERSARY_TEMPLATE);
  const validPeople = (people || []).filter((p) => p?.fullName && Number.isFinite(Number(p?.years)));
  if (!validPeople.length) return '';
  if (validPeople.length === 1) {
    const first = validPeople[0];
    return tpl
      .replaceAll('{fullName}', String(first.fullName))
      .replaceAll('{years}', String(first.years));
  }
  if (tpl.includes('{years}')) {
    return validPeople
      .map((p) => tpl
        .replaceAll('{fullName}', String(p.fullName))
        .replaceAll('{years}', String(p.years)))
      .join(' | ');
  }
  return tpl.replaceAll('{fullName}', formatNameList(validPeople.map((p) => String(p.fullName))));
};

const claimRun = async ({ agencyId, automationType }) => {
  try {
    await pool.execute(
      `INSERT INTO agency_announcement_automation_runs (agency_id, run_date, automation_type, status)
       VALUES (?, CURDATE(), ?, 'pending')`,
      [agencyId, automationType]
    );
    return true;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return false;
    throw error;
  }
};

const markRunSent = async ({ agencyId, automationType, notificationId = null, payload = null }) => {
  await pool.execute(
    `UPDATE agency_announcement_automation_runs
     SET status = 'sent', notification_id = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE agency_id = ? AND run_date = CURDATE() AND automation_type = ?`,
    [notificationId, payload ? JSON.stringify(payload) : null, agencyId, automationType]
  );
};

const clearPendingRun = async ({ agencyId, automationType }) => {
  await pool.execute(
    `DELETE FROM agency_announcement_automation_runs
     WHERE agency_id = ? AND run_date = CURDATE() AND automation_type = ? AND status = 'pending'`,
    [agencyId, automationType]
  );
};

const getEnabledAgencyRows = async () => {
  const [rows] = await pool.execute(
    `SELECT
       agency_id,
       birthday_enabled,
       birthday_template,
       anniversary_enabled,
       anniversary_template
     FROM agency_announcements
     WHERE birthday_enabled = 1 OR anniversary_enabled = 1`
  );
  return rows || [];
};

const buildBirthdayMessage = async (agencyId, template) => {
  const [rows] = await pool.execute(
    `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      CASE
        WHEN uifd.field_key = 'date_of_birth' THEN 2
        WHEN uifd.field_key = 'provider_birthdate' THEN 1
        ELSE 0
      END AS field_priority,
      uifd.is_platform_template,
      uifd.agency_id
    FROM users u
    INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
    INNER JOIN user_info_values uiv ON uiv.user_id = u.id
    INNER JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
    WHERE
      u.is_active = 1
      AND (u.status = 'ACTIVE_EMPLOYEE' OR LOWER(u.status) = 'active')
      AND uifd.field_key IN ('date_of_birth', 'provider_birthdate')
      AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
      AND uiv.value IS NOT NULL AND uiv.value <> ''
      AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND SUBSTRING(uiv.value, 6, 5) = DATE_FORMAT(CURDATE(), '%m-%d')
    ORDER BY field_priority DESC, uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC
    `,
    [agencyId, agencyId]
  );

  const seen = new Set();
  const names = [];
  for (const row of rows || []) {
    const id = Number(row?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fullName = `${String(row?.first_name || '').trim()} ${String(row?.last_name || '').trim()}`.trim();
    if (fullName) names.push(fullName);
  }
  if (!names.length) return null;

  const fullName = formatNameList(names);
  const tpl = String(template || DEFAULT_BIRTHDAY_TEMPLATE);
  const message = tpl.includes('{fullName}') ? tpl.replaceAll('{fullName}', fullName) : `${tpl} ${fullName}`;
  return { message: String(message || '').trim(), names };
};

const buildAnniversaryMessage = async (agencyId, template) => {
  const [rows] = await pool.execute(
    `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      TIMESTAMPDIFF(YEAR, STR_TO_DATE(uiv.value, '%Y-%m-%d'), CURDATE()) AS service_years,
      uifd.is_platform_template,
      uifd.agency_id
    FROM users u
    INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
    INNER JOIN user_info_values uiv ON uiv.user_id = u.id
    INNER JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
    WHERE
      u.is_active = 1
      AND (u.status = 'ACTIVE_EMPLOYEE' OR LOWER(u.status) = 'active')
      AND uifd.field_key = 'start_date'
      AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
      AND uiv.value IS NOT NULL AND uiv.value <> ''
      AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND SUBSTRING(uiv.value, 6, 5) = DATE_FORMAT(CURDATE(), '%m-%d')
    ORDER BY uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC
    `,
    [agencyId, agencyId]
  );

  const seen = new Set();
  const people = [];
  for (const row of rows || []) {
    const id = Number(row?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fullName = `${String(row?.first_name || '').trim()} ${String(row?.last_name || '').trim()}`.trim();
    const years = Number(row?.service_years);
    if (!fullName || !Number.isFinite(years) || years < 1) continue;
    people.push({ fullName, years });
  }
  if (!people.length) return null;

  const message = renderAnniversaryTemplate(template, people);
  if (!message) return null;
  return { message: String(message).trim(), people };
};

const processBirthdayForAgency = async ({ agencyId, template }) => {
  const claimed = await claimRun({ agencyId, automationType: 'birthday' });
  if (!claimed) return { skipped: true, reason: 'already_processed_today' };

  try {
    const payload = await buildBirthdayMessage(agencyId, template);
    if (!payload?.message) {
      await markRunSent({ agencyId, automationType: 'birthday', payload: { skipped: 'no_birthdays_today' } });
      return { skipped: true, reason: 'no_birthdays_today' };
    }

    const created = await createNotificationAndDispatch({
      type: 'birthday_announcement',
      severity: 'info',
      title: payload.names.length > 1 ? "Today's Birthdays" : "Today's Birthday",
      message: payload.message,
      audienceJson: null,
      userId: null,
      agencyId,
      relatedEntityType: 'agency_announcement_automation',
      relatedEntityId: null,
      actorSource: 'Automation'
    });

    await markRunSent({
      agencyId,
      automationType: 'birthday',
      notificationId: created?.id || null,
      payload: { names: payload.names }
    });
    return { sent: true, notificationId: created?.id || null };
  } catch (error) {
    await clearPendingRun({ agencyId, automationType: 'birthday' });
    throw error;
  }
};

const processAnniversaryForAgency = async ({ agencyId, template }) => {
  const claimed = await claimRun({ agencyId, automationType: 'anniversary' });
  if (!claimed) return { skipped: true, reason: 'already_processed_today' };

  try {
    const payload = await buildAnniversaryMessage(agencyId, template);
    if (!payload?.message) {
      await markRunSent({ agencyId, automationType: 'anniversary', payload: { skipped: 'no_anniversaries_today' } });
      return { skipped: true, reason: 'no_anniversaries_today' };
    }

    const created = await createNotificationAndDispatch({
      type: 'anniversary_announcement',
      severity: 'info',
      title: payload.people.length > 1 ? "Today's Work Anniversaries" : "Today's Work Anniversary",
      message: payload.message,
      audienceJson: null,
      userId: null,
      agencyId,
      relatedEntityType: 'agency_announcement_automation',
      relatedEntityId: null,
      actorSource: 'Automation'
    });

    await markRunSent({
      agencyId,
      automationType: 'anniversary',
      notificationId: created?.id || null,
      payload: { people: payload.people }
    });
    return { sent: true, notificationId: created?.id || null };
  } catch (error) {
    await clearPendingRun({ agencyId, automationType: 'anniversary' });
    throw error;
  }
};

class AgencyAnnouncementAutomationService {
  static async runDailyTick() {
    const rows = await getEnabledAgencyRows();
    for (const row of rows) {
      const agencyId = Number(row?.agency_id || 0);
      if (!agencyId) continue;
      try {
        if (Number(row?.birthday_enabled || 0) === 1) {
          await processBirthdayForAgency({
            agencyId,
            template: row?.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE
          });
        }
        if (Number(row?.anniversary_enabled || 0) === 1) {
          await processAnniversaryForAgency({
            agencyId,
            template: row?.anniversary_template || DEFAULT_ANNIVERSARY_TEMPLATE
          });
        }
      } catch (error) {
        console.error(`[agency_announcement_automation] agency ${agencyId} failed:`, error?.message || error);
      }
    }
  }
}

export default AgencyAnnouncementAutomationService;
