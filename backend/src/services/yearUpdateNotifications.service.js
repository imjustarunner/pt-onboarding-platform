import pool from '../config/database.js';

async function loadProviderDisplayName(providerUserId) {
  const uid = Number(providerUserId || 0);
  if (!uid) return 'Provider';
  const [rows] = await pool.execute(
    `SELECT first_name, last_name, email FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  const user = rows?.[0];
  if (!user) return 'Provider';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Provider';
}

async function loadSchoolDisplayName(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return 'School';
  const [rows] = await pool.execute(
    `SELECT name FROM agencies WHERE id = ? LIMIT 1`,
    [sid]
  );
  return String(rows?.[0]?.name || 'School').trim() || 'School';
}

function formatSchoolYearLabel(schoolYear) {
  const raw = String(schoolYear || '').trim();
  return raw || 'this school year';
}

/**
 * Notify agency staff when a provider completes (or is marked complete on) Year Update.
 */
export async function notifyProviderYearUpdateCompleted({
  cycle,
  completedBy = 'provider',
  actorUserId = null
} = {}) {
  if (!cycle?.agency_id || !cycle?.id) return;
  try {
    const Notification = (await import('../models/Notification.model.js')).default;
    const providerName = await loadProviderDisplayName(cycle.provider_user_id);
    const schoolYear = formatSchoolYearLabel(cycle.school_year);
    const message = completedBy === 'admin'
      ? `${providerName}'s Provider Fall Update was marked complete for ${schoolYear}.`
      : `${providerName} completed Provider Fall Update for ${schoolYear}.`;
    await Notification.create({
      type: 'provider_year_update_completed',
      severity: 'info',
      title: 'Provider year update complete',
      message,
      audienceJson: {
        admin: true,
        support: true,
        staff: true,
        provider: false
      },
      userId: null,
      agencyId: cycle.agency_id,
      relatedEntityType: 'provider_year_update_cycle',
      relatedEntityId: cycle.id,
      actorUserId: actorUserId || cycle.provider_user_id || null,
      actorSource: completedBy === 'admin' ? 'Admin' : 'Provider Fall Update'
    });
  } catch {
    // best effort
  }
}

/**
 * Notify agency staff when a school completes collaborative Year Update.
 */
export async function notifySchoolCollaborativeYearUpdateCompleted({
  cycle,
  actorUserId = null
} = {}) {
  if (!cycle?.agency_id || !cycle?.id) return;
  try {
    const Notification = (await import('../models/Notification.model.js')).default;
    const schoolName = await loadSchoolDisplayName(cycle.school_organization_id);
    const schoolYear = formatSchoolYearLabel(cycle.school_year);
    await Notification.create({
      type: 'school_collaborative_year_update_completed',
      severity: 'info',
      title: 'School collaborative year update complete',
      message: `${schoolName} completed collaborative year update for ${schoolYear}.`,
      audienceJson: {
        admin: true,
        support: true,
        staff: true,
        provider: false
      },
      userId: null,
      agencyId: cycle.agency_id,
      relatedEntityType: 'school',
      relatedEntityId: cycle.school_organization_id,
      actorUserId: actorUserId || null,
      actorSource: 'School Year Update'
    });
  } catch {
    // best effort
  }
}
