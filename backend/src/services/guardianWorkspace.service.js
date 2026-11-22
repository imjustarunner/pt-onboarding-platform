import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { requireBillingStaff } from './familyLedger/policy.js';
import { listBalances } from './familyLedger/views.js';

const fail=(message,status)=>Object.assign(new Error(message),{status});
export async function guardianWorkspace({actor,guardianId},{db=pool,resolveAccess=resolveClientRecordAccess,authorizeBilling=requireBillingStaff,balances=listBalances,includeBalances=true}={}) {
  if(!['super_admin','admin','support','staff'].includes(actor?.role))throw fail('Guardian account management requires staff access.',403);
  if(!Number.isSafeInteger(Number(guardianId))||Number(guardianId)<1)throw fail('Guardian not found.',404);
  const [[guardian]]=await db.execute(`SELECT id,first_name,last_name,email,COALESCE(NULLIF(phone_number,''),NULLIF(personal_phone,''),NULLIF(work_phone,'')) AS phone,
    status,is_active,(NULLIF(password_hash,'') IS NOT NULL AND NULLIF(temporary_password_hash,'') IS NULL) AS password_set
    FROM users WHERE id=? AND role IN ('client_guardian','guardian')`,[guardianId]);
  if(!guardian)throw fail('Guardian not found.',404);
  const [links]=await db.execute(`SELECT c.id AS client_id,c.agency_id,c.organization_id,c.full_name,c.initials,c.client_type,c.guardian_portal_enabled,
    a.name AS agency_name,o.name AS organization_name,cg.relationship_type,cg.relationship_title,cg.access_enabled,cg.permissions_json
    FROM client_guardians cg JOIN clients c ON c.id=cg.client_id LEFT JOIN agencies a ON a.id=c.agency_id
    LEFT JOIN agencies o ON o.id=c.organization_id WHERE cg.guardian_user_id=? ORDER BY c.full_name,c.id`,[guardianId]);
  const clients=[], historicalRelationships=[];
  for(const link of links){
    const access=await resolveAccess({userId:actor.id,role:actor.role,clientId:link.client_id});
    if(!access.ok)continue;
    const permissions = ClientGuardian.parsePermissions(link.permissions_json);
    if ([true, 'true'].includes(permissions?.relationshipRevoked)) {
      historicalRelationships.push({client_id:link.client_id,agency_id:link.agency_id,full_name:link.full_name,initials:link.initials,
        agency_name:link.agency_name,relationship_title:link.relationship_title,status:'incorrect'});
      continue;
    }
    const client={...link,billing:{available:false}};
    try {
      if (!includeBalances) { clients.push(client); continue; }
      await authorizeBilling(actor,link.agency_id);
      const rows=await balances({agencyId:link.agency_id,userId:actor.id,clientId:link.client_id,staff:true});
      const own=rows.filter(row=>Number(row.payerUserId)===Number(guardianId));
      client.billing={available:true,assignedBalanceCount:own.length,amountDueCents:own.reduce((sum,row)=>sum+(row.paymentStatus?0:Math.max(0,Number(row.dueCents)||0)),0),
        reviewCount:own.filter(row=>row.billingState==='review'||row.paymentStatus).length,currency:'USD'};
    }catch(error){if(error.status!==403)client.billing={available:false,error:'Balances could not be loaded. Open billing to review.'};}
    clients.push(client);
  }
  if(!clients.length&&!historicalRelationships.length&&actor.role!=='super_admin'){
    const [[membership]]=await db.execute(`SELECT 1 AS allowed FROM user_agencies target JOIN user_agencies viewer ON viewer.agency_id=target.agency_id
      WHERE target.user_id=? AND viewer.user_id=? AND target.is_active=1 AND viewer.is_active=1 LIMIT 1`,[guardianId,actor.id]);
    if(!membership)throw fail('This guardian account is outside your staff access.',403);
  }
  const visibleAgencyIds = [...new Set([...clients,...historicalRelationships].map(client => Number(client.agency_id)).filter(id => id > 0))];
  let lastLogin = null;
  if (visibleAgencyIds.length) {
    const [[activity]] = await db.execute(
      `SELECT MAX(created_at) AS lastLogin FROM user_activity_log
        WHERE user_id=? AND action_type='login' AND agency_id IN (${visibleAgencyIds.map(() => '?').join(',')})`,
      [guardianId, ...visibleAgencyIds]
    );
    lastLogin = utcMysqlToIso(activity?.lastLogin);
  }
  return {guardian:{ ...guardian, lastLogin },clients,historicalRelationships,viewMode:'staff',actorUserId:actor.id};
}
