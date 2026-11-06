import pool from '../config/database.js';
import {maskMobileClientName,requireNarrivaAgency,positiveId} from './narrivaAccess.service.js';
import {ageAtServiceDate} from './noteAidAge.service.js';

export function mobileClinicalAge(client,timeZone='America/Denver',now=new Date()) {
 const date=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 return ageAtServiceDate(client.date_of_birth || client.clientDob,date);
}
export function mobileClientCard(client,{timeZone='America/Denver',now}={}) {
 return {id:positiveId(client.id),maskedName:maskMobileClientName(client),age:mobileClinicalAge(client,timeZone,now)};
}
export async function authorizedMobileClientCards(user,agencyId,clientIds) {
 await requireNarrivaAgency(user,agencyId);
 const ids=[...new Set(clientIds.map(positiveId).filter(Boolean))];
 if(!ids.length)return new Map();
 const broad=['admin','agency_admin','super_admin','superadmin','clinical_practice_assistant','provider_plus'].includes(String(user.role));
 const [rows]=await pool.execute(`SELECT c.id,c.first_name,c.last_name,c.full_name,c.date_of_birth FROM clients c
  WHERE c.id IN (${ids.map(()=>'?').join(',')}) AND c.client_type IN ('clinical','school')
  AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))
  ${broad?'':`AND (c.provider_id=? OR EXISTS(SELECT 1 FROM client_provider_assignments p WHERE p.client_id=c.id AND p.provider_user_id=? AND p.is_active=1))`}`,[...ids,agencyId,agencyId,...(broad?[]:[user.id,user.id])]);
 return new Map(rows.map(row=>[Number(row.id),mobileClientCard(row)]));
}
export function sanitizeMobileWorkItem(item,client) {
 const masked=client?.maskedName || maskMobileClientName({full_name:item.clientName || item.client_name || 'Client'});
 return {id:item.id,serverId:item.serverId,clientId:client?.id || null,clientName:masked,maskedName:masked,age:client?.age ?? null,
  agencyId:item.agencyId,clinicalSessionId:item.clinicalSessionId || null,officeEventId:item.officeEventId || null,
  clinicalNoteId:item.clinicalNoteId || null,draftId:item.draftId || null,date:item.date || null,serviceCode:item.serviceCode || null,
  noteKind:item.noteKind || null,status:item.status,docStatus:item.docStatus,action:'Open session documentation',title:masked};
}
