import pool from '../config/database.js';
import {guardianCareContexts} from './clientServiceEnrollment.service.js';
import ClientGuardian from '../models/ClientGuardian.model.js';

/** Contact and request availability only. No clinical details or access grants. */
export async function guardianHelpContext({userId,clientId,agencyId,db=pool,links=id=>ClientGuardian.listClientsForGuardian({guardianUserId:id}),careContexts=guardianCareContexts}) {
  const cid=Number(clientId),aid=Number(agencyId);
  if(!Number.isSafeInteger(cid)||cid<1||!Number.isSafeInteger(aid)||aid<1)throw Object.assign(new Error('Choose a family profile to contact its practice.'),{status:400});
  const linked=await links(userId);
  const client=linked.find(c=>Number(c.client_id)===cid);
  const allowed=client&&(Number(client.agency_id)===aid||(await careContexts(client,userId)).some(context=>Number(context.agency_id)===aid));
  if(!allowed)throw Object.assign(new Error('This practice is not linked to your family profile.'),{status:403});
  const [[row]]=await db.execute(`SELECT a.id,a.slug,a.name,a.phone_number,a.phone_extension,a.support_team_email,
    COALESCE(settings.enabled,0) AS records_enabled
    FROM agencies a LEFT JOIN auricwell_records_settings settings ON settings.agency_id=a.id
    WHERE a.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,[aid]);
  if(!row)throw Object.assign(new Error('This practice is not available.'),{status:404});
  return {contact:{agencyId:aid,name:row.name,slug:row.slug,phone:row.phone_number||null,extension:row.phone_extension||null,email:row.support_team_email||null},records:{onlineRequestsEnabled:Number(row.records_enabled)===1}};
}
