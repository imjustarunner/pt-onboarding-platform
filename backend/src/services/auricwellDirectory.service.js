import pool from '../config/database.js';
import {previewError} from './auricwellPreviewPolicy.js';
import {letterMatchSql} from '../utils/letterMatch.js';
const tenantIcon = (icon, agency) => `COALESCE(${icon}.file_path, NULLIF(${agency}.logo_path, ''), NULLIF(${agency}.logo_url, ''))`;

// Personal caseload authority comes from the assignment itself. A clinician can
// be assigned through a school whose parent tenant differs from user_agencies.
export function assignedClientPredicate(userId) {
  return {sql:`(c.provider_id=? OR EXISTS (SELECT 1 FROM client_provider_assignments own_assignment
    WHERE own_assignment.client_id=c.id AND own_assignment.provider_user_id=? AND own_assignment.is_active=1))`,params:[userId,userId]};
}
export function createAuricwellDirectory({database=pool}={}) {
  async function mine({actor,input={},qaAgencyId=null}) {
    if(!Number.isSafeInteger(Number(actor?.id))||Number(actor.id)<1)throw previewError(401,'Sign in to view your assigned clients.');
    const assigned=assignedClientPredicate(Number(actor.id));
    const filters=[assigned.sql],params=[...assigned.params];
    if(qaAgencyId){filters.push('c.agency_id=?');params.push(Number(qaAgencyId));}
    const requested=input.filterAgencyId;
    if(requested && requested!=='all'){
      if(!Number.isSafeInteger(Number(requested))||Number(requested)<1)throw previewError(400,'Choose an agency.');
      filters.push('c.agency_id=?');params.push(Number(requested));
    }
    const search=String(input.search||'').trim();
    if(search){
      const name=letterMatchSql(['c.full_name','c.initials','a.name','org.name'],search);
      const affiliation=letterMatchSql(['search_org.name'],search);
      filters.push(`(${name.sql} OR EXISTS (SELECT 1 FROM client_organization_assignments search_assignment JOIN agencies search_org ON search_org.id=search_assignment.organization_id
        WHERE search_assignment.client_id=c.id AND search_assignment.is_active=1 AND ${affiliation.sql}))`);
      params.push(...name.params,...affiliation.params);
    }
    const page=Math.max(1,Math.min(10000,parseInt(input.page,10)||1)),pageSize=50;
    const from=`FROM clients c JOIN agencies a ON a.id=c.agency_id
      LEFT JOIN agencies org ON org.id=c.organization_id
      LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
      LEFT JOIN paperwork_statuses ps ON ps.id=c.paperwork_status_id
      LEFT JOIN icons ai ON ai.id=a.icon_id LEFT JOIN icons oi ON oi.id=org.icon_id
      WHERE ${filters.join(' AND ')}`;
    const [[count]]=await database.execute(`SELECT COUNT(*) AS total ${from}`,params);
    const sort=input.sort==='agency'?'a.name':input.sort==='status'?'COALESCE(cs.label,c.status)':"COALESCE(NULLIF(c.full_name,''),c.initials)";
    const order=input.order==='desc'?'DESC':'ASC';
    const [clients]=await database.execute(`SELECT c.id,c.full_name,c.initials,c.status,c.client_type,c.identifier_code,
      c.cleared_to_start,c.guardian_portal_enabled,c.referral_date,c.source,
      c.agency_id,a.name AS agency_name,a.slug AS agency_slug,${tenantIcon('ai','a')} AS agency_icon,
      c.organization_id,org.name AS organization_name,${tenantIcon('oi','org')} AS organization_icon,
      cs.label AS status_label,ps.label AS paperwork_status_label,
      (SELECT GROUP_CONCAT(DISTINCT TRIM(CONCAT_WS(' ',p.first_name,p.last_name)) ORDER BY p.last_name SEPARATOR ', ')
       FROM users p WHERE p.id=c.provider_id OR EXISTS (SELECT 1 FROM client_provider_assignments team WHERE team.client_id=c.id AND team.provider_user_id=p.id AND team.is_active=1)) AS provider_name,
      (SELECT MIN(appt.start_at) FROM appointments appt JOIN appointment_participants attendee ON attendee.appointment_id=appt.id
       WHERE attendee.client_id=c.id AND appt.agency_id=c.agency_id AND appt.start_at>=UTC_TIMESTAMP()
       AND LOWER(COALESCE(appt.status,'')) NOT REGEXP 'cancel|void|rescheduled') AS next_visit_at
      ${from} ORDER BY ${sort} ${order},COALESCE(NULLIF(c.full_name,''),c.initials) ASC,c.id ASC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`,params);
    const agencyWhere=[assigned.sql],agencyParams=[...assigned.params];
    if(qaAgencyId){agencyWhere.push('c.agency_id=?');agencyParams.push(Number(qaAgencyId));}
    const [agencies]=await database.execute(`SELECT a.id,a.name,a.slug,${tenantIcon('i','a')} AS icon_file_path,COUNT(*) AS client_count
      FROM clients c JOIN agencies a ON a.id=c.agency_id LEFT JOIN icons i ON i.id=a.icon_id
      WHERE ${agencyWhere.join(' AND ')} GROUP BY a.id,a.name,a.slug,i.file_path ORDER BY a.name,a.id`,agencyParams);
    if(clients.length){
      const ids=clients.map(c=>c.id);
      const [affiliations]=await database.execute(`SELECT coa.client_id,a.id,a.name,${tenantIcon('i','a')} AS icon_file_path
        FROM client_organization_assignments coa JOIN agencies a ON a.id=coa.organization_id LEFT JOIN icons i ON i.id=a.icon_id
        WHERE coa.client_id IN (${ids.map(()=>'?').join(',')}) AND coa.is_active=1 ORDER BY a.name,a.id`,ids);
      for(const client of clients){
        const all=affiliations.filter(a=>Number(a.client_id)===Number(client.id));
        if(client.organization_id&&!all.some(a=>Number(a.id)===Number(client.organization_id)))all.unshift({id:client.organization_id,name:client.organization_name,icon_file_path:client.organization_icon});
        client.affiliations=all;
      }
    }
    return {clients,total:Number(count.total),page,pageSize,agencies};
  }
  async function assignedClient({actor,clientId,qaAgencyId=null}) {
    if(![actor?.id,clientId].every(id=>Number.isSafeInteger(Number(id))&&Number(id)>0))throw previewError(400,'Choose an assigned client.');
    const assigned=assignedClientPredicate(Number(actor.id));
    const [rows]=await database.execute(`SELECT c.id,c.agency_id FROM clients c WHERE c.id=? AND ${assigned.sql}${qaAgencyId?' AND c.agency_id=?':''}`,[Number(clientId),...assigned.params,...(qaAgencyId?[Number(qaAgencyId)]:[])]);
    if(!rows[0])throw previewError(404,'Assigned client unavailable.');
    return rows[0];
  }
  return {mine,assignedClient};
}
export const auricwellDirectory=createAuricwellDirectory();
