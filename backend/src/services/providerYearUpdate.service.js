/**
 * Provider Year Update — fall checklist / campaign for school-assigned providers.
 * Parallel to school collaborative year update (school_reinit_*), keyed by provider.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { listSchoolEventsForOrg } from './schoolPortalEvents.service.js';

export const SECTION_KEYS = ['reminders', 'school_events', 'materials', 'provider_schedule'];

export const DEFAULT_REMINDER_ITEMS = [
  {
    key: 'first_day_dates',
    title: 'First day of school',
    body: 'The first day of school for most D11 and D12 schools is August 12th and the first day of school for DPS is August 25th.',
    mode: 'reviewed',
  },
  {
    key: 'schools_email',
    title: 'School client communications',
    body: 'Please use schools@itsco.health for all communication regarding school clients, schedules, changes, openings, etc.',
    mode: 'reviewed',
  },
  {
    key: 'first_day_back_meeting',
    title: 'First day back meeting',
    body: 'Please email your school group email address (ex. Rudy@itsco.health) to identify your first day back meeting with your clients. This depends on the school, but it is typically 1–2 weeks after the first day back.',
    mode: 'complete',
  },
  {
    key: 'review_days_clients',
    title: 'Review your days and clients',
    body: 'On the school portal you will see your days in each school and how many clients on each day. Please review your days and clients and make sure this is the most up to date. Please make sure your client checklists are up to date! You should assume that you will work the same schools/days unless a change has been discussed or the school has communicated a change. Upon approval, please update any changes directly in the portal.',
    mode: 'complete',
  },
  {
    key: 'bts_check_events',
    title: 'Back-to-school events',
    body: 'Back to school events will be starting in August — a great way to connect with your school and parents/families and to start to build a caseload early. Check the portal for your school’s back-to-school date/time under the Events tab (My Dashboard → your school(s) → Events → School Events). If you don’t see a date, we haven’t found it yet. If you learn the details, add the event in the portal (+ Add Event).',
    mode: 'complete',
  },
  {
    key: 'bts_sign_up',
    title: 'Sign up for back-to-school events',
    body: 'If you’d like to work your back-to-school event, please sign up in the portal. We’ll also use the portal for checking in and checking out for these events — your time will be compensated. All time will be tracked on the app via the kiosk (app.itsco.health/itsco/school-events/kiosk). Sign-ups are first come / first serve; if we do not get sign-ups, people may be assigned.',
    mode: 'complete',
  },
  {
    key: 'materials_cart',
    title: 'Materials / school cart',
    body: 'Megan will be putting together carts for back-to-school events. Use the Materials Request section to tell us if you need a school cart (and any other materials notes).',
    mode: 'complete',
  },
];

function yearEq(columnSql = 'school_year') {
  return `${columnSql} COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

export function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function parseJsonField(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function campaignIsPushed(campaign) {
  return String(campaign?.status || '') === 'pushed';
}

export function campaignIsEnabled(campaign) {
  const s = String(campaign?.status || '');
  return s === 'enabled' || s === 'pushed';
}

export async function getCampaign(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_campaigns
     WHERE agency_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, year]
  );
  return rows?.[0] || null;
}

export async function getOrCreateCampaign(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const existing = await getCampaign(agencyId, year);
  if (existing) return existing;
  const [result] = await pool.execute(
    `INSERT INTO provider_year_update_campaigns (agency_id, school_year, status)
     VALUES (?, ?, 'draft')`,
    [agencyId, year]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_campaigns WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

export async function enableCampaign({ agencyId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  const campaign = await getOrCreateCampaign(agencyId, year);
  if (campaign.status === 'pushed') return { campaign, alreadyPushed: true };
  if (campaign.status === 'enabled') return { campaign, alreadyEnabled: true };
  await pool.execute(
    `UPDATE provider_year_update_campaigns
     SET status = 'enabled', enabled_at = NOW(), enabled_by_user_id = ?
     WHERE id = ?`,
    [userId || null, campaign.id]
  );
  return { campaign: await getCampaign(agencyId, year), alreadyEnabled: false };
}

/** Providers with active school assignments tied to affiliated school orgs of this agency. */
export async function listSchoolAssignedProviders(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT
        u.id AS provider_user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.profile_photo_path,
        u.phone_number,
        u.personal_phone,
        u.work_phone
     FROM provider_school_assignments psa
     JOIN users u ON u.id = psa.provider_user_id
     JOIN organization_affiliations oa
       ON oa.organization_id = psa.school_organization_id
      AND oa.agency_id = ?
      AND (oa.is_active = 1 OR oa.is_active IS NULL)
     JOIN agencies sch ON sch.id = psa.school_organization_id
     WHERE psa.is_active = 1
       AND (u.is_archived IS NULL OR u.is_archived = 0)
       AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE_EMPLOYEE', 'PROSPECTIVE')
       AND LOWER(COALESCE(sch.organization_type, 'school')) IN ('school', 'program', 'learning', '')
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [agencyId]
  );
  return rows || [];
}

export async function loadProviderSchoolSchedule(providerUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT psa.id,
            psa.school_organization_id,
            psa.day_of_week,
            psa.slots_total,
            psa.slots_available,
            psa.start_time,
            psa.end_time,
            sch.name AS school_name,
            sch.slug AS school_slug,
            sch.portal_url,
            sch.logo_url,
            sch.logo_path
     FROM provider_school_assignments psa
     JOIN agencies sch ON sch.id = psa.school_organization_id
     JOIN organization_affiliations oa
       ON oa.organization_id = psa.school_organization_id
      AND oa.agency_id = ?
      AND (oa.is_active = 1 OR oa.is_active IS NULL)
     WHERE psa.provider_user_id = ?
       AND psa.is_active = 1
     ORDER BY sch.name ASC, FIELD(psa.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday'), psa.day_of_week`,
    [agencyId, providerUserId]
  );

  const schoolIds = [...new Set((rows || []).map((r) => Number(r.school_organization_id)).filter(Boolean))];
  const clientCounts = new Map();
  if (schoolIds.length) {
    try {
      const placeholders = schoolIds.map(() => '?').join(',');
      const [cRows] = await pool.execute(
        `SELECT cpa.organization_id,
                cpa.service_day,
                COUNT(DISTINCT cpa.client_id) AS client_count
         FROM client_provider_assignments cpa
         WHERE cpa.provider_user_id = ?
           AND cpa.organization_id IN (${placeholders})
           AND (cpa.is_active = 1 OR cpa.is_active IS NULL)
         GROUP BY cpa.organization_id, cpa.service_day`,
        [providerUserId, ...schoolIds]
      );
      for (const r of cRows || []) {
        clientCounts.set(`${r.organization_id}|${r.service_day}`, Number(r.client_count || 0));
      }
    } catch {
      /* table/columns may vary; schedule still useful without counts */
    }
  }

  const bySchool = new Map();
  for (const r of rows || []) {
    const sid = Number(r.school_organization_id);
    if (!bySchool.has(sid)) {
      bySchool.set(sid, {
        schoolOrganizationId: sid,
        schoolName: r.school_name,
        schoolSlug: r.portal_url || r.school_slug || null,
        logoUrl: r.logo_url || publicUploadsUrlFromStoredPath(r.logo_path) || null,
        days: [],
      });
    }
    bySchool.get(sid).days.push({
      assignmentId: r.id,
      dayOfWeek: r.day_of_week,
      slotsTotal: r.slots_total,
      slotsAvailable: r.slots_available,
      startTime: r.start_time,
      endTime: r.end_time,
      clientCount: clientCounts.get(`${sid}|${r.day_of_week}`) ?? null,
    });
  }
  return Array.from(bySchool.values());
}

export async function loadProviderSchoolEvents(providerUserId, agencyId) {
  const schools = await loadProviderSchoolSchedule(providerUserId, agencyId);
  const out = [];
  for (const school of schools) {
    let events = [];
    try {
      events = await listSchoolEventsForOrg(school.schoolOrganizationId, {
        viewerUserId: providerUserId,
      });
    } catch {
      events = [];
    }
    const list = Array.isArray(events) ? events : events?.events || [];
    out.push({
      schoolOrganizationId: school.schoolOrganizationId,
      schoolName: school.schoolName,
      schoolSlug: school.schoolSlug,
      events: list,
    });
  }
  return out;
}

export async function getOrCreateCycle({ agencyId, providerUserId, schoolYear }) {
  const year = schoolYear || currentSchoolYear();
  const [existing] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles
     WHERE agency_id = ? AND provider_user_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, providerUserId, year]
  );
  if (existing?.[0]) return existing[0];

  const [result] = await pool.execute(
    `INSERT INTO provider_year_update_cycles (agency_id, provider_user_id, school_year, status)
     VALUES (?, ?, ?, 'not_started')`,
    [agencyId, providerUserId, year]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

export async function getCycleById(cycleId) {
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles WHERE id = ? LIMIT 1`,
    [Number(cycleId)]
  );
  return rows?.[0] || null;
}

export async function createToken({ cycleId, agencyId, providerUserId, createdByUserId, expiresAt }) {
  const token = makeToken();
  const expires =
    expiresAt ||
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await pool.execute(
    `INSERT INTO provider_year_update_tokens
      (token, cycle_id, agency_id, provider_user_id, created_by_user_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [token, cycleId, agencyId, providerUserId, createdByUserId || null, expires]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_tokens WHERE BINARY token = BINARY ? LIMIT 1`,
    [token]
  );
  return rows[0];
}

export async function ensureShareableToken({ agencyId, providerUserId, schoolYear, createdByUserId }) {
  const cycle = await getOrCreateCycle({ agencyId, providerUserId, schoolYear });
  const [existing] = await pool.execute(
    `SELECT * FROM provider_year_update_tokens
     WHERE cycle_id = ?
       AND expires_at > NOW()
     ORDER BY (locked_at IS NULL) DESC, id DESC
     LIMIT 1`,
    [cycle.id]
  );
  if (existing?.[0]) {
    return { cycle, tokenRow: existing[0], created: false };
  }
  const tokenRow = await createToken({
    cycleId: cycle.id,
    agencyId,
    providerUserId,
    createdByUserId,
  });
  return { cycle, tokenRow, created: true };
}

export async function pushCampaign({ agencyId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  let campaign = await getCampaign(agencyId, year);
  if (!campaign || campaign.status === 'draft') {
    const enabled = await enableCampaign({ agencyId, schoolYear: year, userId });
    campaign = enabled.campaign;
  }

  const providers = await listSchoolAssignedProviders(agencyId);
  let tokensCreated = 0;
  let providersReady = 0;
  for (const p of providers) {
    const providerUserId = Number(p.provider_user_id);
    if (!providerUserId) continue;
    const { created } = await ensureShareableToken({
      agencyId,
      providerUserId,
      schoolYear: year,
      createdByUserId: userId,
    });
    providersReady += 1;
    if (created) tokensCreated += 1;
  }

  await pool.execute(
    `UPDATE provider_year_update_campaigns
     SET status = 'pushed',
         pushed_at = NOW(),
         pushed_by_user_id = ?,
         enabled_at = COALESCE(enabled_at, NOW()),
         enabled_by_user_id = COALESCE(enabled_by_user_id, ?)
     WHERE agency_id = ? AND ${yearEq()}`,
    [userId || null, userId || null, agencyId, year]
  );

  return {
    campaign: await getCampaign(agencyId, year),
    providersReady,
    tokensCreated,
    providerCount: providers.length,
  };
}

export async function validateToken(tokenRaw) {
  const token = String(tokenRaw || '').trim();
  if (!token) return { valid: false, reason: 'missing' };
  const [rows] = await pool.execute(
    `SELECT t.*, c.status AS cycle_status, c.school_year, c.snapshot_json,
            u.first_name, u.last_name, u.email,
            ag.name AS agency_name, ag.logo_url AS agency_logo_url, ag.slug AS agency_slug
     FROM provider_year_update_tokens t
     JOIN provider_year_update_cycles c ON c.id = t.cycle_id
     JOIN users u ON u.id = t.provider_user_id
     JOIN agencies ag ON ag.id = t.agency_id
     WHERE BINARY t.token = BINARY ?
     LIMIT 1`,
    [token]
  );
  const row = rows?.[0];
  if (!row) return { valid: false, reason: 'not_found' };
  const exp = row.expires_at ? new Date(row.expires_at) : null;
  if (exp && exp.getTime() < Date.now() && row.cycle_status !== 'finalized') {
    return { valid: false, reason: 'expired', row };
  }
  return { valid: true, row };
}

export async function recordTokenClick(tokenRow, actorDisplayName = null) {
  await pool.execute(
    `UPDATE provider_year_update_tokens
     SET click_count = click_count + 1, last_viewed_at = NOW()
     WHERE id = ?`,
    [tokenRow.id]
  );
  await pool.execute(
    `INSERT INTO provider_year_update_view_events
      (cycle_id, token_id, actor_display_name, event_type)
     VALUES (?, ?, ?, 'token_click')`,
    [tokenRow.cycle_id, tokenRow.id, actorDisplayName || null]
  );
}

export async function recordViewEvent({
  cycleId,
  tokenId = null,
  userId = null,
  actorDisplayName = null,
  sectionKey = null,
  eventType = 'view',
}) {
  await pool.execute(
    `INSERT INTO provider_year_update_view_events
      (cycle_id, token_id, user_id, actor_display_name, section_key, event_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cycleId, tokenId, userId, actorDisplayName, sectionKey, eventType]
  );
}

export async function markTokenSent(tokenId, userId, sent = true) {
  if (sent) {
    await pool.execute(
      `UPDATE provider_year_update_tokens
       SET marked_sent_at = NOW(), marked_sent_by_user_id = ?
       WHERE id = ?`,
      [userId, tokenId]
    );
  } else {
    await pool.execute(
      `UPDATE provider_year_update_tokens
       SET marked_sent_at = NULL, marked_sent_by_user_id = NULL
       WHERE id = ?`,
      [tokenId]
    );
  }
}

export async function lockTokensForCycle(cycleId) {
  await pool.execute(
    `UPDATE provider_year_update_tokens SET locked_at = NOW()
     WHERE cycle_id = ? AND locked_at IS NULL`,
    [cycleId]
  );
}

function defaultRemindersData() {
  return {
    items: DEFAULT_REMINDER_ITEMS.map((item) => ({
      key: item.key,
      title: item.title,
      body: item.body,
      mode: item.mode,
      reviewed: false,
      completed: false,
      reviewedAt: null,
      completedAt: null,
    })),
  };
}

export async function getSectionProgress(cycleId) {
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_section_progress WHERE cycle_id = ?`,
    [cycleId]
  );
  const byKey = new Map((rows || []).map((r) => [r.section_key, r]));
  return SECTION_KEYS.map((key) => {
    const row = byKey.get(key);
    let data = null;
    if (row?.data_json) {
      data = parseJsonField(row.data_json);
    }
    if (key === 'reminders' && (!data || !Array.isArray(data.items))) {
      data = defaultRemindersData();
    }
    return {
      sectionKey: key,
      reviewed: Boolean(row?.reviewed),
      reviewedAt: row?.reviewed_at || null,
      reviewedByDisplayName: row?.reviewed_by_display_name || null,
      completed: Boolean(row?.completed),
      data,
    };
  });
}

export async function upsertSectionProgress({
  cycleId,
  sectionKey,
  data,
  reviewed,
  completed,
  actor,
}) {
  if (!SECTION_KEYS.includes(sectionKey)) throw new Error('Invalid section_key');
  const [existing] = await pool.execute(
    `SELECT id FROM provider_year_update_section_progress WHERE cycle_id = ? AND section_key = ? LIMIT 1`,
    [cycleId, sectionKey]
  );
  const dataJson = data !== undefined ? JSON.stringify(data) : null;
  const reviewedVal = reviewed ? 1 : 0;
  const completedVal = completed !== undefined ? (completed ? 1 : 0) : reviewedVal;

  if (existing?.[0]) {
    await pool.execute(
      `UPDATE provider_year_update_section_progress
       SET data_json = COALESCE(?, data_json),
           reviewed = ?,
           reviewed_at = CASE WHEN ? = 1 THEN NOW() ELSE reviewed_at END,
           reviewed_by_actor_type = CASE WHEN ? = 1 THEN ? ELSE reviewed_by_actor_type END,
           reviewed_by_user_id = CASE WHEN ? = 1 THEN ? ELSE reviewed_by_user_id END,
           reviewed_by_display_name = CASE WHEN ? = 1 THEN ? ELSE reviewed_by_display_name END,
           completed = ?
       WHERE id = ?`,
      [
        dataJson,
        reviewedVal,
        reviewedVal,
        reviewedVal,
        actor?.actorType || null,
        reviewedVal,
        actor?.userId || null,
        reviewedVal,
        actor?.displayName || null,
        completedVal,
        existing[0].id,
      ]
    );
  } else {
    await pool.execute(
      `INSERT INTO provider_year_update_section_progress
        (cycle_id, section_key, reviewed, reviewed_at, reviewed_by_actor_type, reviewed_by_user_id,
         reviewed_by_display_name, completed, data_json)
       VALUES (?, ?, ?, ${reviewed ? 'NOW()' : 'NULL'}, ?, ?, ?, ?, ?)`,
      [
        cycleId,
        sectionKey,
        reviewedVal,
        actor?.actorType || null,
        actor?.userId || null,
        actor?.displayName || null,
        completedVal,
        dataJson,
      ]
    );
  }

  await pool.execute(
    `UPDATE provider_year_update_cycles SET status = 'in_progress'
     WHERE id = ? AND status = 'not_started'`,
    [cycleId]
  );

  return getSectionProgress(cycleId);
}

export async function buildDashboardPayload(cycle) {
  const sections = await getSectionProgress(cycle.id);
  const schedule = await loadProviderSchoolSchedule(cycle.provider_user_id, cycle.agency_id);
  const eventsBySchool = await loadProviderSchoolEvents(cycle.provider_user_id, cycle.agency_id);
  const [agencyRows] = await pool.execute(
    `SELECT id, name, logo_url, slug, portal_url FROM agencies WHERE id = ? LIMIT 1`,
    [cycle.agency_id]
  );
  const [userRows] = await pool.execute(
    `SELECT id, first_name, last_name, email, profile_photo_path FROM users WHERE id = ? LIMIT 1`,
    [cycle.provider_user_id]
  );
  const agency = agencyRows?.[0] || null;
  const provider = userRows?.[0] || null;
  const byKey = Object.fromEntries(sections.map((s) => [s.sectionKey, s]));

  return {
    cycle: {
      id: cycle.id,
      agencyId: cycle.agency_id,
      providerUserId: cycle.provider_user_id,
      schoolYear: cycle.school_year,
      status: cycle.status,
      finalizedAt: cycle.finalized_at || null,
      snapshot: parseJsonField(cycle.snapshot_json),
    },
    agency: agency
      ? {
          id: agency.id,
          name: agency.name,
          logoUrl: agency.logo_url || null,
          slug: agency.slug || agency.portal_url || null,
        }
      : null,
    provider: provider
      ? {
          id: provider.id,
          firstName: provider.first_name,
          lastName: provider.last_name,
          name: [provider.first_name, provider.last_name].filter(Boolean).join(' ') || provider.email,
          email: provider.email,
          photoUrl: publicUploadsUrlFromStoredPath(provider.profile_photo_path),
        }
      : null,
    sections,
    sectionKeys: SECTION_KEYS,
    reminderDefaults: DEFAULT_REMINDER_ITEMS,
    reminders: byKey.reminders?.data || defaultRemindersData(),
    materials: byKey.materials?.data || {
      need_school_cart: false,
      materials_notes: '',
    },
    schedule,
    eventsBySchool,
    kioskPath: '/itsco/school-events/kiosk',
  };
}

export async function finalizeCycle({ cycleId, actor }) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) throw new Error('Cycle not found');
  if (cycle.status === 'finalized') throw new Error('Already finalized');

  const sections = await getSectionProgress(cycleId);
  const incomplete = sections.filter((s) => !s.reviewed && !s.completed);
  if (incomplete.length) {
    throw new Error(`Sections not reviewed: ${incomplete.map((s) => s.sectionKey).join(', ')}`);
  }

  const reminders = sections.find((s) => s.sectionKey === 'reminders')?.data;
  const items = Array.isArray(reminders?.items) ? reminders.items : [];
  for (const item of items) {
    const mode = item.mode || 'complete';
    if (mode === 'reviewed' && !item.reviewed && !item.completed) {
      throw new Error(`Reminder not reviewed: ${item.title || item.key}`);
    }
    if (mode === 'complete' && !item.completed) {
      throw new Error(`Reminder not completed: ${item.title || item.key}`);
    }
  }

  const payload = await buildDashboardPayload(cycle);
  const snapshot = {
    schoolYear: cycle.school_year,
    finalizedAt: new Date().toISOString(),
    reminders: payload.reminders,
    materials: payload.materials,
    schedule: payload.schedule,
    eventsBySchool: payload.eventsBySchool,
    sections: Object.fromEntries(sections.map((s) => [s.sectionKey, s.data])),
  };

  await pool.execute(
    `UPDATE provider_year_update_cycles
     SET status = 'finalized',
         finalized_at = NOW(),
         finalized_by_actor_type = ?,
         finalized_by_user_id = ?,
         finalized_by_display_name = ?,
         snapshot_json = ?
     WHERE id = ?`,
    [
      actor?.actorType || null,
      actor?.userId || null,
      actor?.displayName || null,
      JSON.stringify(snapshot),
      cycleId,
    ]
  );
  await lockTokensForCycle(cycleId);
  return getCycleById(cycleId);
}

export async function dismissForUser(cycleId, userId, dismissUntil = null) {
  await pool.execute(
    `INSERT INTO provider_year_update_dismissals (cycle_id, user_id, dismissed_at, dismiss_until)
     VALUES (?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE dismissed_at = NOW(), dismiss_until = VALUES(dismiss_until)`,
    [cycleId, userId, dismissUntil]
  );
}

export async function getDismissal(cycleId, userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_dismissals WHERE cycle_id = ? AND user_id = ? LIMIT 1`,
    [cycleId, userId]
  );
  return rows?.[0] || null;
}

export async function listAgencyReport(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const providers = await listSchoolAssignedProviders(agencyId);
  const out = [];

  for (const p of providers) {
    const providerUserId = Number(p.provider_user_id);
    if (!providerUserId) continue;

    const [cycles] = await pool.execute(
      `SELECT * FROM provider_year_update_cycles
       WHERE agency_id = ? AND provider_user_id = ? AND ${yearEq()}
       LIMIT 1`,
      [agencyId, providerUserId, year]
    );
    const cycle = cycles?.[0] || null;

    let sections = [];
    let tokens = [];
    let clickCount = 0;
    let sectionData = {};
    let schools = [];

    if (cycle) {
      sections = await getSectionProgress(cycle.id);
      const [tokRows] = await pool.execute(
        `SELECT id, token, marked_sent_at, locked_at, click_count, last_viewed_at, created_at, expires_at
         FROM provider_year_update_tokens WHERE cycle_id = ? ORDER BY id DESC`,
        [cycle.id]
      );
      tokens = tokRows || [];
      clickCount = tokens.reduce((n, t) => n + Number(t.click_count || 0), 0);
      for (const s of sections) {
        if (s.data) sectionData[s.sectionKey] = s.data;
      }
      schools = await loadProviderSchoolSchedule(providerUserId, agencyId);
    } else {
      schools = await loadProviderSchoolSchedule(providerUserId, agencyId);
    }

    const reviewedCount = sections.filter((s) => s.reviewed || s.completed).length;
    const pct = sections.length
      ? Math.round((reviewedCount / SECTION_KEYS.length) * 100)
      : 0;

    const lastTokenView = tokens.reduce((max, t) => {
      if (!t.last_viewed_at) return max;
      const ts = new Date(t.last_viewed_at).getTime();
      return Number.isNaN(ts) ? max : Math.max(max, ts);
    }, 0);
    const lastSectionReview = sections.reduce((max, s) => {
      if (!s.reviewedAt) return max;
      const ts = new Date(s.reviewedAt).getTime();
      return Number.isNaN(ts) ? max : Math.max(max, ts);
    }, 0);
    const lastActivityAt =
      lastTokenView || lastSectionReview
        ? new Date(Math.max(lastTokenView, lastSectionReview)).toISOString()
        : cycle?.updated_at || cycle?.finalized_at || null;

    const materials = sectionData.materials || {};
    const reminders = sectionData.reminders || {};
    const reminderItems = Array.isArray(reminders.items) ? reminders.items : [];
    const remindersDone = reminderItems.filter((i) => i.completed || i.reviewed).length;

    out.push({
      providerUserId,
      providerName: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.personal_phone || p.work_phone || p.phone_number || null,
      photoUrl: publicUploadsUrlFromStoredPath(p.profile_photo_path),
      schools: schools.map((s) => ({
        schoolOrganizationId: s.schoolOrganizationId,
        schoolName: s.schoolName,
        dayCount: s.days?.length || 0,
      })),
      schoolNames: schools.map((s) => s.schoolName).filter(Boolean).join(', '),
      cycleId: cycle?.id || null,
      status: cycle?.status || 'not_started',
      started: Boolean(cycle && cycle.status !== 'not_started'),
      finalizedAt: cycle?.finalized_at || null,
      sectionPercent: pct,
      reviewedCount,
      sectionTotal: SECTION_KEYS.length,
      sections,
      sectionKeys: SECTION_KEYS,
      tokenClickCount: clickCount,
      tokens,
      lastActivityAt,
      needSchoolCart: Boolean(materials.need_school_cart || materials.needSchoolCart),
      materialsNotes: materials.materials_notes || materials.materialsNotes || null,
      remindersDone,
      remindersTotal: reminderItems.length || DEFAULT_REMINDER_ITEMS.length,
      markedSent: tokens.some((t) => t.marked_sent_at),
    });
  }

  const campaign = await getOrCreateCampaign(agencyId, year);
  return {
    agencyId,
    schoolYear: year,
    providers: out,
    summary: {
      totalProviders: out.length,
      finalized: out.filter((r) => r.status === 'finalized').length,
      inProgress: out.filter((r) => r.status === 'in_progress').length,
      notStarted: out.filter((r) => r.status === 'not_started' || !r.status).length,
      totalTokenViews: out.reduce((n, r) => n + Number(r.tokenClickCount || 0), 0),
      needSchoolCartCount: out.filter((r) => r.needSchoolCart).length,
    },
    campaign: {
      status: campaign.status,
      enabledAt: campaign.enabled_at,
      pushedAt: campaign.pushed_at,
      isEnabled: campaignIsEnabled(campaign),
      isPushed: campaignIsPushed(campaign),
    },
  };
}

/** Status for My Dashboard / provider me endpoint. */
export async function getMyStatus({ agencyId, providerUserId, schoolYear }) {
  const year = schoolYear || currentSchoolYear();
  const campaign = await getCampaign(agencyId, year);
  if (!campaignIsPushed(campaign)) {
    return {
      available: false,
      reason: 'not_pushed',
      campaign: campaign
        ? {
            status: campaign.status,
            isEnabled: campaignIsEnabled(campaign),
            isPushed: false,
          }
        : null,
    };
  }

  const schools = await loadProviderSchoolSchedule(providerUserId, agencyId);
  if (!schools.length) {
    return {
      available: false,
      reason: 'no_school_assignments',
      campaign: {
        status: campaign.status,
        isEnabled: true,
        isPushed: true,
        pushedAt: campaign.pushed_at,
      },
    };
  }

  const { cycle, tokenRow } = await ensureShareableToken({
    agencyId,
    providerUserId,
    schoolYear: year,
  });
  const dismissal = await getDismissal(cycle.id, providerUserId);
  const dismissed =
    dismissal &&
    (!dismissal.dismiss_until || new Date(dismissal.dismiss_until).getTime() > Date.now());

  const sections = await getSectionProgress(cycle.id);
  const reviewedCount = sections.filter((s) => s.reviewed || s.completed).length;

  return {
    available: true,
    showPulse: cycle.status !== 'finalized' && !dismissed,
    dismissed: Boolean(dismissed),
    campaign: {
      status: campaign.status,
      isEnabled: true,
      isPushed: true,
      pushedAt: campaign.pushed_at,
    },
    cycle: {
      id: cycle.id,
      status: cycle.status,
      schoolYear: cycle.school_year,
      finalizedAt: cycle.finalized_at || null,
    },
    sectionPercent: Math.round((reviewedCount / SECTION_KEYS.length) * 100),
    reviewedCount,
    sectionTotal: SECTION_KEYS.length,
    shareToken: tokenRow
      ? {
          token: tokenRow.token,
          tokenId: tokenRow.id,
          path: `/provider-year-update/${tokenRow.token}`,
        }
      : null,
  };
}
