import pool from '../config/database.js';
import { SCHOOL_WEEKDAYS, schoolWeekdayContext, excludedFromSchoolRoster } from '../utils/schoolWeekdayAvailability.js';
import { providerSchoolPlacementSummary } from './providerAvailabilityRoster.service.js';

export async function readSchoolWeekdays(providerId, agencyId, database = pool) {
  const [[person]] = await database.execute(`SELECT u.id,u.service_focus,u.is_demo,p.public_details_json,a.slug AS agency_slug,a.feature_flags AS agency_feature_flags FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 JOIN agencies a ON a.id=ua.agency_id
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id WHERE u.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`, [agencyId, providerId]);
  if (!person) throw Object.assign(new Error('Provider not found'), { status: 404 });
  const [rows] = await database.execute(`SELECT psa.provider_user_id,psa.school_organization_id,psa.day_of_week,school.name AS school_name
    FROM provider_school_assignments psa JOIN agencies school ON school.id=psa.school_organization_id
    WHERE psa.provider_user_id=? AND psa.is_active=1 AND school.is_active=1 AND COALESCE(school.is_archived,0)=0
    AND (EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=school.id AND oa.agency_id=? AND oa.is_active=1)
      OR EXISTS(SELECT 1 FROM agency_schools legacy WHERE legacy.school_organization_id=school.id AND legacy.agency_id=? AND legacy.is_active=1))`, [providerId, agencyId, agencyId]);
  return schoolWeekdayContext(person, providerSchoolPlacementSummary(rows, providerId).schoolAssignments, agencyId);
}
export async function writeSchoolWeekdays({ providerId, agencyId, days, actorId }, database = pool) {
  if (!days || typeof days !== 'object' || Array.isArray(days) || Object.keys(days).length !== 5 ||
    SCHOOL_WEEKDAYS.some(day => typeof days[day] !== 'boolean')) {
    throw Object.assign(new Error('Choose availability for all five weekdays.'), { status: 400 });
  }
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [providerId]);
    const context = await readSchoolWeekdays(providerId, agencyId, db);
    if (!context.eligible) throw Object.assign(new Error('School-Based Counseling must be included in the provider’s service focuses.'), { status: 409 });
    if (context.days.some(day => day.status === 'assigned' && !days[day.day])) {
      throw Object.assign(new Error('Assigned school days stay reserved. Request a schedule change to adjust an assignment.'), { status: 409 });
    }
    await db.execute(`INSERT INTO provider_public_profiles (user_id,public_details_json) VALUES (?,?)
      ON DUPLICATE KEY UPDATE public_details_json=JSON_MERGE_PATCH(COALESCE(public_details_json,JSON_OBJECT()),VALUES(public_details_json)),updated_at=CURRENT_TIMESTAMP`,
    [providerId, JSON.stringify({ schoolWeekdaysByAgency: { [agencyId]: { days, updatedAt: new Date().toISOString(), updatedBy: actorId } } })]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  return readSchoolWeekdays(providerId, agencyId, database);
}

export async function requestSchoolWeekdayUpdates({ agencyId, providerId = null, actorId }, database = pool) {
  // Resolve recipients from active memberships, never from IDs supplied without a tenant check.
  const [people] = await database.execute(`SELECT DISTINCT u.id,u.service_focus,p.public_details_json FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id
    WHERE COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE')
      AND (u.role IN ('provider','provider_plus','supervisor') OR u.has_provider_access=1 OR u.sees_clients=1)
      ${providerId ? 'AND u.id=?' : ''}`, providerId ? [agencyId, providerId] : [agencyId]);
  const results = { requested: [], failed: [], skipped: [] };
  const { default: NotificationDispatcher } = await import('./notificationDispatcher.service.js');
  for (const person of people) {
    try {
      const context = await readSchoolWeekdays(person.id, agencyId, database);
      if (!context.needsResponse) { results.skipped.push(person.id); continue; }
      // Repeated clicks/retries do not create duplicate outstanding requests.
      if (context.pending) { results.skipped.push(person.id); continue; }
      const requestedAt = new Date().toISOString();
      const db = await database.getConnection();
      try {
        await db.beginTransaction();
        await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [person.id]);
        const current = await readSchoolWeekdays(person.id, agencyId, db);
        if (!current.needsResponse || current.pending) { await db.rollback(); results.skipped.push(person.id); continue; }
        await db.execute(`INSERT INTO provider_public_profiles (user_id,public_details_json) VALUES (?,?)
          ON DUPLICATE KEY UPDATE public_details_json=JSON_MERGE_PATCH(COALESCE(public_details_json,JSON_OBJECT()),VALUES(public_details_json)),updated_at=CURRENT_TIMESTAMP`,
        [person.id, JSON.stringify({ schoolWeekdaysByAgency: { [agencyId]: { requestedAt, requestedBy: actorId } } })]);
        // Persist the notification and prompt together; dispatch after commit.
        await db.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
          VALUES ('school_weekday_availability_requested','info',?,?,?,?,?,?,?,?)`,
        ['Update your school availability', 'Please confirm your Monday–Friday school availability. Assigned school days stay reserved; mark other days Available or Not available.', person.id, agencyId, 'school_weekday_availability', person.id, actorId, 'school_weekday_availability']);
        await db.commit();
      } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
      results.requested.push(person.id);
      // In-app prompt is durable even when the provider has no push subscription.
      try { const [[notification]] = await database.execute(`SELECT * FROM notifications WHERE user_id=? AND agency_id=? AND related_entity_type='school_weekday_availability' ORDER BY id DESC LIMIT 1`, [person.id, agencyId]);
      await NotificationDispatcher.dispatchPushForNotification(notification); } catch { /* The in-app request remains saved when push delivery is unavailable. */ }
    } catch { results.failed.push(person.id); }
  }
  if (providerId && !people.some(person => Number(person.id) === providerId)) throw Object.assign(new Error('Active provider not found in this agency.'), { status: 404 });
  return results;
}

export async function updateSchoolProviderFocus({ providerId, agencyId, serviceFocus, expectedServiceFocus }, database = pool) {
  if (typeof serviceFocus !== 'string' || serviceFocus.length > 10000 || typeof expectedServiceFocus !== 'string') {
    throw Object.assign(new Error('Choose valid service focuses.'), { status: 400 });
  }
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    const [[person]] = await db.execute(`SELECT u.service_focus,u.is_demo,a.slug AS agency_slug,a.feature_flags AS agency_feature_flags FROM users u JOIN user_agencies ua ON ua.user_id=u.id JOIN agencies a ON a.id=ua.agency_id
      WHERE u.id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 FOR UPDATE`, [providerId, agencyId]);
    if (!person || excludedFromSchoolRoster(person)) throw Object.assign(new Error('Non-demo provider not found in this agency.'), { status: 404 });
    if (String(person.service_focus || '') !== expectedServiceFocus) throw Object.assign(new Error('Service focuses changed while this editor was open. Refresh and try again.'), { status: 409 });
    const values = [...new Set(serviceFocus.split(/[;,\n]/).map(value => value.trim()).filter(Boolean))];
    await db.execute('UPDATE users SET service_focus=? WHERE id=?', [values.join('; ') || null, providerId]);
    await db.commit();
    return { serviceFocus: values.join('; ') };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
