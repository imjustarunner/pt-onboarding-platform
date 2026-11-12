import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ReferralPacketDraft from '../models/ReferralPacketDraft.model.js';
import Notification from '../models/Notification.model.js';
import {ensurePaperPacketTask} from './paperPacketTask.service.js';
import {replacePaperProcessingSource} from './paperProcessingSource.service.js';

/** School-origin files are operational source records, not a general clinical-documents grant. */
export async function schoolChartAttachments({clientId,agencyId,schoolId},db=pool){
 if(!Number(schoolId))return [];
 const [rows]=await db.execute(`SELECT DISTINCT d.id,d.client_id,d.agency_id,d.school_organization_id,d.original_name,d.document_title,d.document_type,d.mime_type,d.scan_status,d.uploaded_at,d.created_at
 FROM client_phi_documents d JOIN users u ON u.id=d.uploaded_by_user_id AND u.role='school_staff'
 JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=d.school_organization_id AND ua.is_active=1
 WHERE d.client_id=? AND d.agency_id=? AND d.school_organization_id=? AND d.removed_at IS NULL
 AND COALESCE(d.document_type,'') NOT IN ('session_supporting_material','clinical_note','clinical_summary','treatment_plan')
 AND LOWER(COALESCE(d.document_type,'')) NOT LIKE '%clinical%' ORDER BY d.id DESC`,[Number(clientId),Number(agencyId),Number(schoolId)]);
 return rows;
}
/** Called after an authorized school uploader's file exists; no processing inference from filename. */
export async function handleSchoolChartAttachment({client,document,user},{db=pool,clients=Client,documents=ClientPhiDocument,drafts=ReferralPacketDraft,notifications=Notification,ensureTask=ensurePaperPacketTask}={}){
 if(user?.role!=='school_staff')return null;
 if(!document?.id||document.removed_at||Number(document.client_id)!==Number(client.id)||Number(document.agency_id)!==Number(client.agency_id)||Number(document.school_organization_id)!==Number(client.organization_id)||Number(document.uploaded_by_user_id)!==Number(user.id))throw Object.assign(Error('The school file does not match this client and uploader.'),{status:409});
 const connection=await db.getConnection(),lock=`school-chart-attachment:${Number(document.id)}`;let acquired=false;
 try{
 const [[result]]=await connection.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);acquired=Number(result?.acquired)===1;if(!acquired)throw Error('The school attachment is still being prepared. Refresh before retrying.');
 let taskId=null;
 if(document.document_type==='full_paper_enrollment'){
  const [existing]=await connection.execute('SELECT * FROM referral_packet_upload_drafts WHERE phi_document_id=? AND created_client_id=? AND agency_id=? LIMIT 1',[document.id,client.id,client.agency_id]);
  const draft=existing[0]||await drafts.create({organizationId:client.organization_id,agencyId:client.agency_id,uploadedByUserId:user.id,phiDocumentId:document.id,status:'submitted',createdClientId:client.id,submittedAt:new Date(),firstName:null,lastName:null,initials:client.initials||null});
  if(!document.referral_draft_id)await documents.updateById(document.id,{referral_draft_id:draft.id});
  await replacePaperProcessingSource({clientId:client.id,agencyId:client.agency_id,schoolId:client.organization_id,documentId:document.id,draftId:draft.id,actorId:user.id},{clients,database:db,connection});
  taskId=await ensureTask({draft:{...draft,status:'submitted',created_client_id:client.id},clientId:client.id});
 }else{
  const source=`school_document_${Number(document.id)}`;
  const [recipients]=await db.execute("SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND ua.is_active=1 AND u.role='support' AND u.is_active=1",[client.agency_id]);
  for(const recipient of recipients){const [[exists]]=await connection.execute("SELECT id FROM notifications WHERE agency_id=? AND user_id=? AND type='new_packet_uploaded' AND related_entity_type='school_client_attachment' AND related_entity_id=? AND actor_source=? LIMIT 1",[client.agency_id,recipient.id,client.id,source]);if(!exists)await notifications.create({type:'new_packet_uploaded',severity:'info',title:'School document received',message:`${document.original_name||'School attachment'} · Document #${document.id} · ${client.initials||`Record #${client.id}`}. Review this school-uploaded file in the client’s Documents. This upload does not establish consent.`,agencyId:client.agency_id,userId:recipient.id,relatedEntityType:'school_client_attachment',relatedEntityId:client.id,actorUserId:user.id,actorSource:source});}
 }
 return{taskId,schoolAttachment:true,paperPacket:document.document_type==='full_paper_enrollment'};
 }finally{try{if(acquired)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{connection.release();}}
}
