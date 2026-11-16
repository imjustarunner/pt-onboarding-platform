// Only bounded page records are hydrated. Totals scan IDs/statuses, never full charts.
const sorts = {
  initials: "LOWER(COALESCE(NULLIF(c.initials,''),c.full_name,''))",
  full_name: "LOWER(COALESCE(NULLIF(c.full_name,''),c.initials,''))",
  agency_name: "LOWER(COALESCE(directory_agency.name,''))",
  organization_name: "LOWER(COALESCE(orgf.name,org.name,''))",
  client_status_label: "LOWER(COALESCE(cs.label,cs.status_key,''))",
  provider_name: "LOWER(CASE WHEN provider.first_name IS NOT NULL AND provider.last_name IS NOT NULL THEN CONCAT(provider.first_name,' ',provider.last_name) ELSE '' END)",
  insurance_type_label: "LOWER(COALESCE(it.label,''))",
  submission_date: 'COALESCE(c.submission_date,0)',
  last_activity_at: 'COALESCE(c.last_activity_at,0)'
};
export const supportsDirectorySort = sort => !sort || Object.hasOwn(sorts,sort);
export function directoryPageQueries({ query, values, hasChecklist, page=1, perPage=50, sort='', order='desc', summaryTone='' }) {
  let from=query.slice(query.indexOf('FROM clients c'));
  if (!from.startsWith('FROM clients c')) throw new Error('A scoped client directory query is required');
  if (!from.includes('JOIN agencies orgf')) from=from.replace('WHERE 1=1','LEFT JOIN agencies orgf ON 1=0\nWHERE 1=1');
  from=from.replace('WHERE 1=1','LEFT JOIN agencies directory_agency ON directory_agency.id=c.agency_id\nWHERE 1=1');
  const needed=hasChecklist?'(SELECT COUNT(*) FROM client_paperwork_items directory_item WHERE directory_item.client_id=c.id AND directory_item.is_needed=1)':'NULL';
  const tone=`CASE WHEN LOWER(COALESCE(cs.status_key,'')) IN ('pending','packet','prospective','waitlist','screener') OR UPPER(COALESCE(c.status,'')) IN ('PENDING','PACKET','SCREENER','PENDING_REVIEW','RETURNING','PROSPECTIVE','WAITLIST') THEN 'pending' WHEN UPPER(COALESCE(c.status,''))='ON_HOLD' OR LOWER(COALESCE(cs.status_key,''))='on_hold' OR LOWER(COALESCE(ps.status_key,''))='all_needed' OR ${needed}>1 THEN 'attention' WHEN LOWER(COALESCE(cs.status_key,''))='current' OR UPPER(COALESCE(c.status,''))='ACTIVE' OR LOWER(COALESCE(ps.status_key,''))='completed' OR ${needed}=0 THEN 'completed' ELSE 'neutral' END`;
  const statusQuery=`SELECT DISTINCT c.id,${tone} AS tone ${from}`;
  const summary={sql:`SELECT COUNT(*) AS total,COALESCE(SUM(tone='completed'),0) AS completed,COALESCE(SUM(tone='pending'),0) AS pending,COALESCE(SUM(tone='attention'),0) AS attention FROM (${statusQuery}) directory_summary`,values};
  const filtered=['completed','pending','attention'].includes(summaryTone);
  const pageValues=[...values,...(filtered?[summaryTone]:[])];
  const direction=String(order).toLowerCase()==='asc'?'ASC':'DESC';
  const size=Math.min(200,Math.max(1,Math.trunc(perPage)||50)),number=Math.max(1,Math.trunc(page)||1);
  const sortSql=sorts[sort] || 'COALESCE(c.submission_date,c.created_at)';
  const ids={sql:`SELECT DISTINCT c.id,${sortSql} AS directory_sort ${from}${filtered?` AND (${tone})=?`:''} ORDER BY directory_sort ${direction},c.id DESC LIMIT ${size} OFFSET ${(number-1)*size}`,values:pageValues};
  return {summary,ids,page:number,perPage:size,filtered};
}
export async function readDirectoryPage({executor,query,values,...options}) {
  const plan=directoryPageQueries({query,values,...options});
  const [[[counts]], [ids]]=await Promise.all([executor.execute(plan.summary.sql,plan.summary.values),executor.execute(plan.ids.sql,plan.ids.values)]);
  const summary=Object.fromEntries(['total','completed','pending','attention'].map(key=>[key,Number(counts?.[key]||0)]));
  // Detailed need counts are available when that filter is requested. Do not run
  // every client's permission/ROI reconciliation just to display a list page.
  summary.packetReview=null;
  const idValues=ids.map(row=>row.id);
  let rows=[];
  if(idValues.length){const hydrate=query.replace(/SELECT\s+c\.\*/, 'SELECT directory_agency.name AS agency_name,c.*').replace('FROM clients c','FROM clients c LEFT JOIN agencies directory_agency ON directory_agency.id=c.agency_id');const [hydrated]=await executor.execute(`${hydrate} AND c.id IN (${idValues.map(()=>'?').join(',')})`,[...values,...idValues]);const byId=new Map(hydrated.map(row=>[Number(row.id),row]));rows=idValues.map(id=>byId.get(Number(id))).filter(Boolean);}
  return {items:rows,total:plan.filtered?summary[options.summaryTone]:summary.total,page:plan.page,per_page:plan.perPage,summary};
}
