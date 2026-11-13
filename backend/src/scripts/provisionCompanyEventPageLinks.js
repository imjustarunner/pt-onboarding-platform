import pool from '../config/database.js';
import { ensureCompanyEventPage } from '../services/companyEventPages.service.js';
import { COMPANY_EVENT_PAGE_ROOT, companyEventPageUrl, eventPageSlug, isReadableCompanyGathering } from '../utils/companyEventPage.js';

const apply = process.argv.includes('--apply');
const selected = process.argv.find(value=>value.startsWith('--event='))?.slice(8);
if (selected && !/^[1-9]\d*$/.test(selected)) throw Error('Use a positive event ID');
try {
  const [rows] = await pool.execute(`SELECT e.*,a.slug AS host_slug,a.portal_url AS host_portal_url,
    a.organization_type AS host_organization_type,a.club_kind AS host_club_kind
    FROM company_events e JOIN agencies a ON a.id=e.agency_id WHERE e.is_active=1 AND a.is_active=1
    AND COALESCE(e.school_event_status,'') NOT IN ('canceled','cancelled') ${selected ? 'AND e.id=?' : ''} ORDER BY e.id`, selected ? [Number(selected)] : []);
  const results = [];
  for (const event of rows.filter(isReadableCompanyGathering)) {
    const agency={slug:event.host_slug,portal_url:event.host_portal_url,organization_type:event.host_organization_type,club_kind:event.host_club_kind};
    const existing = companyEventPageUrl(event);
    const url = apply ? await ensureCompanyEventPage(event,agency) : existing || `${COMPANY_EVENT_PAGE_ROOT}/${eventPageSlug(agency.slug || agency.portal_url,`agency-${event.agency_id}`)}/${eventPageSlug(event.title)}-${event.id}`;
    results.push({id:event.id,title:event.title,url,alreadyAssigned:!!existing});
  }
  console.log(JSON.stringify({applied:apply,count:results.length,results}));
} finally { await pool.end(); }
