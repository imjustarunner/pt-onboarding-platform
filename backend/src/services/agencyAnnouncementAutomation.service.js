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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compact calendar date for today (e.g. Jul 16) — banner shows all day via CURDATE() match. */
export function formatTodayBannerDateLabel(d = new Date()) {
  try {
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (label && /\d/.test(label)) return label;
  } catch {
    /* fall through */
  }
  const month = SHORT_MONTHS[d.getMonth()] || '';
  const day = d.getDate();
  return month && day ? `${month} ${day}` : '';
}

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

const ACTIVE_EMPLOYEE_CLAUSE = `(u.status = 'ACTIVE_EMPLOYEE' OR LOWER(u.status) = 'active' OR LOWER(u.status) = 'active_employee')`;

/** Shared month-day match for "all day today" celebrations (server CURDATE()). */
const TODAY_MMDD_CLAUSE = `SUBSTRING(uiv.value, 6, 5) = DATE_FORMAT(CURDATE(), '%m-%d')`;

const personFromRow = (row, extra = {}) => {
  const id = Number(row?.id);
  if (!id) return null;
  const fullName = `${String(row?.first_name || '').trim()} ${String(row?.last_name || '').trim()}`.trim();
  if (!fullName) return null;
  return {
    id,
    fullName,
    profilePhotoPath: row?.profile_photo_path ? String(row.profile_photo_path) : null,
    ...extra
  };
};

const renderBirthdayForPerson = (template, fullName) => {
  const tpl = String(template || DEFAULT_BIRTHDAY_TEMPLATE);
  const name = String(fullName || '').trim();
  if (!name) return '';
  return tpl.includes('{fullName}') ? tpl.replaceAll('{fullName}', name) : `${tpl} ${name}`;
};

export const buildBirthdayMessage = async (agencyId, template) => {
  const [rows] = await pool.execute(
    `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.profile_photo_path,
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
      AND ${ACTIVE_EMPLOYEE_CLAUSE}
      AND uifd.field_key IN ('date_of_birth', 'provider_birthdate')
      AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
      AND uiv.value IS NOT NULL AND uiv.value <> ''
      AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND ${TODAY_MMDD_CLAUSE}
    ORDER BY field_priority DESC, uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC
    `,
    [agencyId, agencyId]
  );

  const seen = new Set();
  const people = [];
  for (const row of rows || []) {
    const id = Number(row?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const person = personFromRow(row);
    if (person) people.push(person);
  }
  if (!people.length) return null;

  const names = people.map((p) => p.fullName);
  const fullName = formatNameList(names);
  const tpl = String(template || DEFAULT_BIRTHDAY_TEMPLATE);
  const message = tpl.includes('{fullName}') ? tpl.replaceAll('{fullName}', fullName) : `${tpl} ${fullName}`;
  return { message: String(message || '').trim(), names, people };
};

async function buildDateFieldAnniversaryMessage(agencyId, template, fieldKey) {
  const [rows] = await pool.execute(
    `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.profile_photo_path,
      TIMESTAMPDIFF(YEAR, STR_TO_DATE(uiv.value, '%Y-%m-%d'), CURDATE()) AS service_years,
      uifd.is_platform_template,
      uifd.agency_id
    FROM users u
    INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
    INNER JOIN user_info_values uiv ON uiv.user_id = u.id
    INNER JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
    WHERE
      u.is_active = 1
      AND ${ACTIVE_EMPLOYEE_CLAUSE}
      AND uifd.field_key = ?
      AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
      AND uiv.value IS NOT NULL AND uiv.value <> ''
      AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND ${TODAY_MMDD_CLAUSE}
    ORDER BY uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC
    `,
    [agencyId, fieldKey, agencyId]
  );

  const seen = new Set();
  const people = [];
  for (const row of rows || []) {
    const id = Number(row?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const years = Number(row?.service_years);
    if (!Number.isFinite(years) || years < 1) continue;
    const person = personFromRow(row, { years });
    if (person) people.push(person);
  }
  if (!people.length) return null;

  const message = renderAnniversaryTemplate(template, people);
  if (!message) return null;
  return { message: String(message).trim(), people };
}

/** Work anniversary = first client date (not start date). */
export const buildAnniversaryMessage = async (agencyId, template) =>
  buildDateFieldAnniversaryMessage(agencyId, template || DEFAULT_ANNIVERSARY_TEMPLATE, 'first_client_date');

/**
 * Live dashboard banner items for today's birthdays / anniversaries (whole calendar day).
 * One item per person so the marquee can show each profile photo.
 */
export async function getTodayCelebrationBannerItems(agencyId, cfg = {}) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const dateLabel = formatTodayBannerDateLabel();
  const items = [];

  if (cfg.birthdayEnabled) {
    const payload = await buildBirthdayMessage(aid, cfg.birthdayTemplate);
    for (const person of payload?.people || []) {
      const text = renderBirthdayForPerson(cfg.birthdayTemplate, person.fullName);
      if (!text) continue;
      items.push({
        kind: 'birthday',
        text,
        dateLabel,
        userId: person.id,
        profilePhotoPath: person.profilePhotoPath,
        fullName: person.fullName
      });
    }
  }

  if (cfg.anniversaryEnabled) {
    const work = await buildAnniversaryMessage(aid, cfg.anniversaryTemplate);
    for (const person of work?.people || []) {
      const text = renderAnniversaryTemplate(cfg.anniversaryTemplate || DEFAULT_ANNIVERSARY_TEMPLATE, [person]);
      if (!text) continue;
      items.push({
        kind: 'work_anniversary',
        text,
        dateLabel,
        userId: person.id,
        profilePhotoPath: person.profilePhotoPath,
        fullName: person.fullName,
        years: person.years
      });
    }
  }

  return items;
}

const processBirthdayForAgency = async ({ agencyId, template }) => {
  const claimed = await claimRun({ agencyId, automationType: 'birthday' });
  if (!claimed) return { skipped: true, reason: 'already_processed_today' };

  try {
    const payload = await buildBirthdayMessage(agencyId, template);
    if (!payload?.message) {
      await markRunSent({ agencyId, automationType: 'birthday', payload: { skipped: 'no_birthdays_today' } });
      return { skipped: true, reason: 'no_birthdays_today' };
    }

    const dateLabel = formatTodayBannerDateLabel();
    const message = dateLabel ? `${payload.message} · ${dateLabel}` : payload.message;

    const created = await createNotificationAndDispatch({
      type: 'birthday_announcement',
      severity: 'info',
      title: payload.names.length > 1 ? "Today's Birthdays" : "Today's Birthday",
      message,
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
      payload: { names: payload.names, dateLabel }
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

    const dateLabel = formatTodayBannerDateLabel();
    const message = dateLabel ? `${payload.message} · ${dateLabel}` : payload.message;

    const created = await createNotificationAndDispatch({
      type: 'anniversary_announcement',
      severity: 'info',
      title: payload.people.length > 1 ? "Today's Work Anniversaries" : "Today's Work Anniversary",
      message,
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
      payload: { people: payload.people, dateLabel }
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
