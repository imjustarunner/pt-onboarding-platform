import pool from '../config/database.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { requireBillingStaff } from './familyLedger/policy.js';
import { listBalances } from './familyLedger/views.js';

const fail=(message,status)=>Object.assign(new Error(message),{status});
export async function guardianWorkspace({actor,guardianId},{db=pool,resolveAccess=resolveClientRecordAccess,authorizeBilling=requireBillingStaff,balances=listBalances}={}) {
  if(!['super_admin','admin','support','staff'].includes(actor?.role))throw fail('Guardian account management requires staff access.',403);
  if(!Number.isSafeInteger(Number(guardianId))||Number(guardianId)<1)throw fail('Guardian not found.',404);
  const [[guardian]]=await db.execute(`SELECT id,first_name,last_name,email,COALESCE(NULLIF(phone_number,''),NULLIF(personal_phone,''),NULLIF(work_phone,'')) AS phone,
    status,is_active,(password_hash IS NOT NULL AND temporary_password_hash IS NULL) AS password_set
    FROM users WHERE id=? AND role IN ('client_guardian','guardian')`,[guardianId]);
  if(!guardian)throw fail('Guardian not found.',404);
  const [links]=await db.execute(`SELECT c.id AS client_id,c.agency_id,c.organization_id,c.full_name,c.initials,c.client_type,c.guardian_portal_enabled,
    a.name AS agency_name,o.name AS organization_name,cg.relationship_type,cg.relationship_title,cg.access_enabled,cg.permissions_json
    FROM client_guardians cg JOIN clients c ON c.id=cg.client_id LEFT JOIN agencies a ON a.id=c.agency_id
    LEFT JOIN agencies o ON o.id=c.organization_id WHERE cg.guardian_user_id=? ORDER BY c.full_name,c.id`,[guardianId]);
  const clients=[];
  for(const link of links){
    const access=await resolveAccess({userId:actor.id,role:actor.role,clientId:link.client_id});
    if(!access.ok)continue;
    const client={...link,billing:{available:false}};
    try {
      await authorizeBilling(actor,link.agency_id);
      const rows=await balances({agencyId:link.agency_id,userId:actor.id,clientId:link.client_id,staff:true});
      const own=rows.filter(row=>Number(row.payerUserId)===Number(guardianId));
      client.billing={available:true,assignedBalanceCount:own.length,amountDueCents:own.reduce((sum,row)=>sum+(row.paymentStatus?0:Math.max(0,Number(row.dueCents)||0)),0),
        reviewCount:own.filter(row=>row.billingState==='review'||row.paymentStatus).length,currency:'USD'};
    }catch(error){if(error.status!==403)client.billing={available:false,error:'Balances could not be loaded. Open billing to review.'};}
    clients.push(client);
  }
  if(!clients.length&&actor.role!=='super_admin'){
    const [[membership]]=await db.execute(`SELECT 1 AS allowed FROM user_agencies target JOIN user_agencies viewer ON viewer.agency_id=target.agency_id
      WHERE target.user_id=? AND viewer.user_id=? AND target.is_active=1 AND viewer.is_active=1 LIMIT 1`,[guardianId,actor.id]);
    if(!membership)throw fail('This guardian account is outside your staff access.',403);
  }
  return {guardian,clients,viewMode:'staff',actorUserId:actor.id};
}
