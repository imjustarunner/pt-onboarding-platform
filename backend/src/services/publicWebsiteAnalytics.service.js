import { createHmac } from 'node:crypto';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KINDS = new Set(['page_view','section_view','click','profile_open','filter_use','search','scroll_depth']);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function normalizeAnalyticsEvents(slug, body) {
  if (!/^[a-z0-9][a-z0-9-]{0,188}$/.test(slug) || !UUID.test(body?.visitorId || '')) throw fail('Invalid analytics request');
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 40) throw fail('Send between 1 and 40 events');
  return body.events.map(e => {
    if (!e || typeof e !== 'object') throw fail('Invalid analytics event');
    const pagePath = String(e.pagePath || '');
    if (!UUID.test(e.eventId || '') || !KINDS.has(e.kind)
      || !new RegExp(`^/p/${slug}(?:/[a-z0-9][a-z0-9-]{0,100})?/?$`).test(pagePath)
      || pagePath.length > 255 || !/^[a-z0-9][a-z0-9/_.:-]{0,239}$/.test(e.targetKey || '')) throw fail('Invalid analytics event');
    // An explicit schema prevents accidental storage of extra payload fields such as input values.
    return { eventId:e.eventId, pagePath, targetKey:e.targetKey,
      label:String(e.label || 'Public page').replace(/[\x00-\x1f<>]/g,'').trim().slice(0,120), kind:e.kind,
      device:['mobile','tablet','desktop'].includes(e.device)?e.device:'desktop',
      language:['en','es'].includes(e.language)?e.language:'other',
      source:['direct','internal','search','social','referral'].includes(e.source)?e.source:'direct' };
  });
}
export function analyticsRange(query = {}, now = new Date()) {
  const today = now.toISOString().slice(0,10);
  const end = String(query.end || today), start = String(query.start || new Date(+now-29*86400000).toISOString().slice(0,10));
  const valid = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
  if (!valid(start)||!valid(end)||end<start||end>today||(Date.parse(end)-Date.parse(start))/86400000>89) throw fail('Choose a valid date range of up to 90 days, ending today or earlier.');
  return { start, end, until:new Date(Date.parse(end)+86400000).toISOString().slice(0,10) };
}
export function createPublicWebsiteAnalyticsService(db, secret) {
  async function page(slug) {
    const [[row]] = await db.execute('SELECT id, slug, title, is_active FROM public_marketing_pages WHERE slug = ? LIMIT 1',[slug]);
    if (!row) throw fail('Website not found',404);
    return row;
  }
  async function authorize(actor, slug) {
    if (!actor?.id || actor.demoMode) throw fail('Analytics access required',403);
    const site = await page(slug);
    if (actor.role === 'super_admin') return site;
    // A mixed-agency hub belongs to the platform. School/affiliated memberships never grant tenant access.
    const [sources] = await db.execute(`SELECT s.source_type, s.source_id, a.organization_type FROM public_marketing_page_sources s
      LEFT JOIN agencies a ON a.id = s.source_id WHERE s.page_id = ? AND s.is_active = 1`,[site.id]);
    if (sources.length !== 1 || sources[0].source_type !== 'agency'
      || !['agency','life_coach','consultant','clubwebapp'].includes(sources[0].organization_type)) throw fail('Analytics access required',403);
    const [[membership]] = await db.execute(`SELECT COALESCE(NULLIF(ua.agency_role,''),u.role) AS role
      FROM user_agencies ua JOIN users u ON u.id = ua.user_id
      WHERE ua.user_id = ? AND ua.agency_id = ? AND COALESCE(ua.is_active,1) = 1
        AND COALESCE(u.is_active,1) = 1 AND COALESCE(u.is_archived,0) = 0`,[actor.id,sources[0].source_id]);
    if (!['admin','support'].includes(membership?.role)) throw fail('Analytics access required',403);
    return site;
  }
  async function ingest(slug, body) {
    const events = normalizeAnalyticsEvents(slug,body), site = await page(slug);
    if (!site.is_active) throw fail('Website not published',404);
    const visitor = createHmac('sha256',secret).update(`${site.id}:${body.visitorId}`).digest('hex');
    const values = events.flatMap(e=>[site.id,e.eventId,visitor,e.pagePath,e.targetKey,e.label,e.kind,e.device,e.language,e.source]);
    // Duplicate batch retries are harmless; timestamps are always supplied by the server.
    await db.execute(`INSERT IGNORE INTO public_website_analytics_events
      (page_id,event_id,visitor_hash,page_path,target_key,target_label,event_kind,device_type,language_code,source_channel,occurred_at)
      VALUES ${events.map(()=>'(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())').join(',')}`,values);
    // Bounded, indexed cleanup also runs on low-traffic installations without a separate scheduler.
    await db.execute('DELETE FROM public_website_analytics_events WHERE occurred_at < UTC_TIMESTAMP() - INTERVAL 120 DAY LIMIT 1000');
  }
  async function report(actor,slug,query={}) {
    const site = await authorize(actor,slug), range = analyticsRange(query);
    const params=[site.id,range.start,range.until];
    let where='page_id = ? AND occurred_at >= ? AND occurred_at < ?';
    const selectedPage=String(query.page || '');
    if(selectedPage){if(!new RegExp(`^/p/${slug}(?:/[a-z0-9][a-z0-9-]{0,100})?/?$`).test(selectedPage))throw fail('Invalid page');where+=' AND page_path = ?';params.push(selectedPage);}
    const target=String(query.target||'');
    if(target){if(!/^[a-z0-9][a-z0-9/_.:-]{0,239}$/.test(target))throw fail('Invalid area');where+=' AND (target_key = ? OR target_key LIKE ? ESCAPE \'!\')';params.push(target,target.replace(/[!_%]/g,m=>'!'+m)+'/%');}
    const [[totals], [rows], [daily], [pages], [breakdown]] = await Promise.all([
      db.execute(`SELECT COUNT(DISTINCT visitor_hash) visitors, SUM(event_kind='page_view') views,
        SUM(event_kind IN ('click','profile_open')) clicks, SUM(event_kind='section_view') impressions,
        SUM(event_kind='profile_open') profileOpens, SUM(event_kind='filter_use') filters, SUM(event_kind='search') searches,
        MIN(occurred_at) firstEvent, MAX(occurred_at) lastEvent
        FROM public_website_analytics_events WHERE ${where}`,params),
      db.execute(`SELECT page_path pagePath,target_key targetKey,MAX(target_label) label,event_kind kind,
        COUNT(*) count,COUNT(DISTINCT visitor_hash) visitors,MAX(occurred_at) lastSeen
        FROM public_website_analytics_events WHERE ${where} GROUP BY page_path,target_key,event_kind ORDER BY count DESC`,params),
      db.execute(`SELECT DATE_FORMAT(occurred_at,'%Y-%m-%d') day, SUM(event_kind='page_view') views,
        COUNT(DISTINCT visitor_hash) visitors,SUM(event_kind IN ('click','profile_open')) clicks
        FROM public_website_analytics_events WHERE ${where} GROUP BY day ORDER BY day`,params),
      db.execute(`SELECT DISTINCT page_path pagePath FROM public_website_analytics_events
        WHERE page_id=? AND occurred_at>=? AND occurred_at<? ORDER BY page_path`,[site.id,range.start,range.until]),
      db.execute(`SELECT device_type device,language_code language,source_channel source,COUNT(*) views
        FROM public_website_analytics_events WHERE ${where} AND event_kind='page_view'
        GROUP BY device_type,language_code,source_channel ORDER BY views DESC`,params)
    ]);
    const total = Object.fromEntries(['visitors','views','clicks','impressions','profileOpens','filters','searches'].map(k=>[k,Number(totals[0]?.[k]||0)]));
    return {site:{slug:site.slug,title:site.title},range,selectedPage,target,totals:total,
      rows:rows.map(r=>({...r,count:Number(r.count),visitors:Number(r.visitors)})),daily,pages:pages.map(p=>p.pagePath),breakdown,
      firstEvent:totals[0]?.firstEvent||null,lastEvent:totals[0]?.lastEvent||null};
  }
  return { authorize,ingest,report };
}
