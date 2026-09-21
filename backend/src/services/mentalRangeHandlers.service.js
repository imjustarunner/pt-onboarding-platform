import { RANGE_TENANT_SQL, RANGE_PROVIDER_SQL, RANGE_SERVICES, eligibleRangeTenant, rangeUrl, stringList, partnerDto, providerDto, rangeProviderEligible } from './mentalRange.service.js';


export function createMentalRangeHandlers({ pool, publicUploadsUrlFromStoredPath, listClinicalFacetsForUsers, readPublicProviderSchedule, enrichProvider=async p=>p }) {
async function published(res) {
  const [rows] = await pool.execute("SELECT id FROM public_marketing_pages WHERE slug='range' AND is_active=1 LIMIT 1");
  res.set('Cache-Control', 'no-store');
  if (!rows.length) { res.status(404).json({ error: { message: 'Website unavailable' } }); return false; }
  return true;
}
async function rangePartners(req, res, next) {
  try {
    if (!await published(res)) return;
    const [rows] = await pool.execute(`SELECT a.id,a.name,a.slug,a.logo_url,a.logo_path,a.city,a.state,
      m.description,m.audience,m.focus,COALESCE(NULLIF(s.website_url,''),m.website_url) AS website_url,m.contact_url,m.services
      FROM mental_range_memberships m JOIN agencies a ON a.id=m.agency_id
      LEFT JOIN public_website_support_sites s ON s.slug=IF(a.slug='plottwistco','ptco',a.slug) AND s.coming_soon=0
      WHERE m.included=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND ${RANGE_TENANT_SQL} ORDER BY a.name`);
    res.json({ partners: rows.map(r => partnerDto(r, publicUploadsUrlFromStoredPath(r.logo_path))) });
  } catch (e) { next(e); }
}
async function rangeProviders(req, res, next) {
  try {
    if (!await published(res)) return;
    const [candidates] = await pool.execute(`${RANGE_PROVIDER_SQL} ORDER BY u.last_name,u.first_name,a.id,s.service_type`);
    const rows=candidates.filter(rangeProviderEligible);
    const providers = [];
    // Facets remain scoped to the publishing agency; no cross-tenant clinical index joins.
    for (const aid of [...new Set(rows.map(r => Number(r.agency_id)))]) {
      const group = rows.filter(r => Number(r.agency_id) === aid);
      const facets = await listClinicalFacetsForUsers(group.map(r => r.id), { agencyId: aid });
      for(let start=0;start<group.length;start+=4)providers.push(...await Promise.all(group.slice(start,start+4).map(async r => {
        const dto=providerDto({...r,agency_logo_url:rangeUrl(r.agency_logo_url)||publicUploadsUrlFromStoredPath(r.agency_logo_path)},facets.get(Number(r.id)),publicUploadsUrlFromStoredPath(r.profile_photo_path));
        return enrichProvider(dto,r);
      })));
    }
    res.json({ providers });
  } catch (e) { next(e); }
}
async function rangeAvailability(req, res, next) {
  try {
    if (!await published(res)) return;
    const aid = Number(req.params.agencyId), pid = Number(req.params.providerId), service = String(req.query.service || '');
    if (!Number.isSafeInteger(aid) || aid < 1 || !Number.isSafeInteger(pid) || pid < 1 || !RANGE_SERVICES.includes(service)) return res.status(400).json({ error: { message: 'Invalid provider selection' } });
    const [rows] = await pool.execute(`${RANGE_PROVIDER_SQL} AND a.id=? AND u.id=? AND s.service_type=?`, [aid,pid,service]);
    if (!rows.length || !rangeProviderEligible(rows[0])) return res.status(404).json({ error: { message: 'Provider is no longer published in this network' } });
    {
      const schedule=await readPublicProviderSchedule(pid,aid);
      const format=String(req.query.format||'ALL').toUpperCase();
      const slots=schedule.slots.filter(s=>(format==='ALL'||s.format===format)&&Date.parse(s.startAt)>Date.now());
      return res.json({format,slots:slots.map(s=>({startAt:s.startAt,endAt:s.endAt,format:s.format,buildingId:s.buildingId,buildingName:s.buildingName})),
        inPerson:schedule.inPerson,virtual:schedule.virtual,school:schedule.school,schools:schedule.schools,locations:schedule.locations,
        nextAvailableAt:slots[0]?.startAt||null,hasPublishedOpenings:slots.length>0||(format==='SCHOOL'&&schedule.school?.hasPublishedOpenings)||(format==='ALL'&&schedule.school?.hasPublishedOpenings),checkedAt:schedule.checkedAt});
    }

  } catch (e) { next(e); }
}
async function getRangeMembership(req, res, next) {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: { message: 'Super admin access required' } });
  try {
    const [rows] = await pool.execute(`SELECT a.id,a.name,a.slug,a.organization_type,m.included,m.description,m.audience,m.focus,m.website_url,m.contact_url,m.services
      FROM agencies a LEFT JOIN mental_range_memberships m ON m.agency_id=a.id WHERE a.id=?`, [req.params.agencyId]);
    if (!rows.length) return res.sendStatus(404);
    res.json({ eligible: eligibleRangeTenant(rows[0]), membership: { ...rows[0], included: !!rows[0].included, services: stringList(rows[0].services) } });
  } catch (e) { next(e); }
}
async function saveRangeMembership(req, res, next) {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: { message: 'Super admin access required' } });
  try {
    const [rows] = await pool.execute('SELECT id,name,slug,organization_type FROM agencies WHERE id=?', [req.params.agencyId]);
    if (!eligibleRangeTenant(rows[0])) return res.status(400).json({ error: { message: 'Only eligible tenants can join the collective. Demos, Burning Sage, and affiliated organizations are excluded.' } });
    const b=req.body || {};
    if (typeof b.included !== 'boolean' || !Array.isArray(b.services) || b.services.some(x => !['counseling','tutoring','coaching','youth','skills','operations'].includes(x))) return res.status(400).json({ error: { message: 'Invalid membership settings' } });
    for (const key of ['website_url','contact_url']) if (b[key] && !rangeUrl(b[key])) return res.status(400).json({ error: { message: 'Use an HTTPS or local website address.' } });
    for (const key of ['description','audience','focus','website_url','contact_url']) if (b[key] != null && (typeof b[key] !== 'string' || b[key].length>2000)) return res.status(400).json({ error: { message: 'Invalid partner details' } });
    await pool.execute(`INSERT INTO mental_range_memberships (agency_id,included,description,audience,focus,website_url,contact_url,services,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE included=VALUES(included),description=VALUES(description),audience=VALUES(audience),focus=VALUES(focus),website_url=VALUES(website_url),contact_url=VALUES(contact_url),services=VALUES(services),updated_by=VALUES(updated_by)`,
      [Number(req.params.agencyId),b.included?1:0,b.description||'',b.audience||'',b.focus||'',rangeUrl(b.website_url),rangeUrl(b.contact_url),JSON.stringify([...new Set(b.services)]),req.user.id]);
    return getRangeMembership(req,res,next);
  } catch(e) { next(e); }
}

return { rangePartners, rangeProviders, rangeAvailability, getRangeMembership, saveRangeMembership };
}
