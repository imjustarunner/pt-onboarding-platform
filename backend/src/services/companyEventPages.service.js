import pool from '../config/database.js';
import { companyEventPageUrl, eventPageSlug, isReadableCompanyGathering, storedCompanyEventPage, validEventPageSlug } from '../utils/companyEventPage.js';

/** Slugs are assigned once. The stable ID prevents duplicate names and reuse
 * after deletion; an event lock protects concurrent first-link creation. */
export async function ensureCompanyEventPage(event, agency = {}, db = pool) {
  if (!isReadableCompanyGathering({...event,host_organization_type:agency.organization_type || event.host_organization_type,host_club_kind:agency.club_kind || event.host_club_kind})) return null;
  if (storedCompanyEventPage(event)) return companyEventPageUrl(event);
  const id = Number(event.id), agencyId = Number(event.agency_id || event.agencyId);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(agencyId) || agencyId < 1) return null;
  const organizationSlug = eventPageSlug(agency.slug || agency.portal_url, `agency-${agencyId}`);
  const lock = `company-event-page-${id}`;
  const conn = db.getConnection ? await db.getConnection() : db;
  let acquired = false;
  try {
    const [[held]] = await conn.execute('SELECT GET_LOCK(?, 5) AS acquired', [lock]);
    acquired = Number(held?.acquired) === 1;
    if (!acquired) throw Object.assign(new Error('Event link is being prepared. Please try again.'), {status:503,code:'event_page_busy'});
    const [[current]] = await conn.execute('SELECT operations_json FROM company_events WHERE id=? AND agency_id=?', [id,agencyId]);
    if (!current) throw Object.assign(new Error('Event not found'), {status:404});
    const existing = storedCompanyEventPage({id,...current});
    if (existing) { event.operations_json = current.operations_json; return companyEventPageUrl(event); }
    const base = eventPageSlug(event.title);
    const eventSlug = `${base}-${id}`;
    const pageLink = {eventId:id,organizationSlug,eventSlug};
    await conn.execute(`UPDATE company_events SET operations_json=JSON_SET(COALESCE(operations_json,JSON_OBJECT()),'$.pageLink',CAST(? AS JSON)),
      updated_at=updated_at WHERE id=? AND agency_id=?`, [JSON.stringify(pageLink),id,agencyId]);
    let operations = current.operations_json || {};
    if (typeof operations === 'string') operations = JSON.parse(operations);
    event.operations_json = {...operations,pageLink};
    return companyEventPageUrl(event);
  } finally {
    try { if (acquired) await conn.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { if (db.getConnection) conn.release(); }
  }
}

export async function findCompanyEventPage({organizationSlug,eventSlug}, db = pool) {
  if (!validEventPageSlug(organizationSlug) || !validEventPageSlug(eventSlug)) return null;
  const [[event]] = await db.execute(`SELECT * FROM company_events WHERE is_active=1
    AND COALESCE(school_event_status,'') NOT IN ('canceled','cancelled')
    AND JSON_UNQUOTE(JSON_EXTRACT(operations_json,'$.pageLink.organizationSlug'))=?
    AND JSON_UNQUOTE(JSON_EXTRACT(operations_json,'$.pageLink.eventSlug'))=?
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(operations_json,'$.pageLink.eventId')) AS UNSIGNED)=id LIMIT 1`, [organizationSlug,eventSlug]);
  return event && isReadableCompanyGathering(event) && storedCompanyEventPage(event) ? event : null;
}
