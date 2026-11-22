import crypto from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Storage from './storage.service.js';
import {tutoringSessionHubEnabled} from '../utils/tutoringSessionHubPolicy.js';
import {maybeEncryptNotePayload as encrypt,maybeDecryptNotePayload as decrypt} from './clinicalNoteCrypto.service.js';
import {worksheetDefinition} from '../utils/tutoringWorksheet.js';
import {materialSession,uploadMaterial,saveDefinition} from './tutoringMaterials.service.js';
import {clinicalAudit} from './clinicalSessionAudit.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function scope(req,agencyId){
 const agency=await Agency.findById(Number(agencyId));
 if(!tutoringSessionHubEnabled(agency))throw fail(404,'This tutoring library is not enabled.');
 if(!req.user?.id||!(await User.getAgencies(req.user.id)).some(a=>Number(a.id)===Number(agencyId))||!['provider','provider_plus','intern','intern_plus','staff','support','admin','clinical_practice_assistant'].includes(req.user.role))throw fail(403,'Tutoring staff membership in this organization is required.');
 return {agencyId:Number(agencyId),userId:Number(req.user.id),publisher:['staff','support','admin','clinical_practice_assistant'].includes(req.user.role)};
}
const audit=(req,agencyId,action,details)=>clinicalAudit({kind:'tutoring',sessionId:0,agencyId,role:req.user.role,actor:'user-'+req.user.id,req},action,details);
function safe(row){return {id:row.id,title:row.title,subject:row.subject_label,grade:row.grade_label,status:row.status,ownerId:row.owner_user_id,clientSpecific:!!row.source_client_id};}
async function resource(req,agencyId,id){
 const own=await scope(req,agencyId);
 const [[row]]=await pool.execute("SELECT * FROM tutoring_resource_library WHERE id=? AND agency_id=? AND status<>'archived'",[Number(id),own.agencyId]);
 if(!row||!(Number(row.owner_user_id)===own.userId||row.status==='published'||own.publisher&&!row.source_client_id))throw fail(404,'Resource not found.');
 return {own,row,data:JSON.parse(decrypt(row.resource_envelope))};
}
export async function listResources(req,agencyId){
 const own=await scope(req,agencyId);
 const [rows]=await pool.execute("SELECT * FROM tutoring_resource_library WHERE agency_id=? AND status<>'archived' AND (owner_user_id=? OR status='published' OR (?=1 AND source_client_id IS NULL)) ORDER BY id DESC LIMIT 150",[own.agencyId,own.userId,own.publisher?1:0]);
 return {canPublish:own.publisher,resources:rows.map(safe)};
}
export async function uploadResource(req,agencyId,file,body){
 const own=await scope(req,agencyId);
 if(!file?.buffer||file.buffer.length>15*1024*1024||file.mimetype!=='application/pdf'||file.buffer.subarray(0,5).toString()!=='%PDF-')throw fail(400,'Choose a general PDF under 15 MB, with no learner information or completed answers.');
 const title=String(body.title||file.originalname||'General worksheet').trim().slice(0,255);
 const key='tutoring_library/'+own.agencyId+'/'+crypto.randomUUID()+'.pdf';
 await Storage.writeObject(key,file.buffer,'application/pdf',{agencyId:String(own.agencyId),resourceKind:'tutoring_general'});
 const data={storagePath:key,definition:worksheetDefinition({instructions:'',questions:[]}),sourceHash:crypto.createHash('sha256').update(file.buffer).digest('hex')};
 const [r]=await pool.execute("INSERT INTO tutoring_resource_library(agency_id,owner_user_id,title,subject_label,grade_label,resource_envelope) VALUES(?,?,?,?,?,?)",[own.agencyId,own.userId,title,String(body.subject||'').slice(0,128),String(body.grade||'').slice(0,64),encrypt(JSON.stringify(data))]);
 await audit(req,own.agencyId,'tutoring_library_draft_created',{resourceId:r.insertId});return {id:r.insertId};
}
export async function publishResource(req,agencyId,id,body){
 const {own,row}=await resource(req,agencyId,id);
 if(!own.publisher)throw fail(403,'Staff publishing permission is required. Your private draft is retained.');
 if(row.source_client_id||body.reviewedGeneral!==true)throw fail(409,'Review the source and confirm it contains general instructional content, without learner information or private answers.');
 await pool.execute("UPDATE tutoring_resource_library SET status='published',published_by_user_id=?,published_at=COALESCE(published_at,UTC_TIMESTAMP()) WHERE id=? AND agency_id=?",[own.userId,row.id,own.agencyId]);
 await audit(req,own.agencyId,'tutoring_library_published',{resourceId:row.id});return {ok:true};
}
export async function resourceFile(req,agencyId,id){
 const {own,row,data}=await resource(req,agencyId,id);
 await audit(req,own.agencyId,'tutoring_library_file_read',{resourceId:row.id});
 return {buffer:await Storage.readObject(data.storagePath),contentType:'application/pdf'};
}
export async function archiveResource(req,agencyId,id){
 const {own,row}=await resource(req,agencyId,id);
 if(Number(row.owner_user_id)!==own.userId&&!own.publisher)throw fail(403,'Only its owner or publishing staff can archive this resource.');
 await pool.execute("UPDATE tutoring_resource_library SET status='archived' WHERE id=? AND agency_id=?",[row.id,own.agencyId]);
 await audit(req,own.agencyId,'tutoring_library_archived',{resourceId:row.id});return {ok:true};
}
export async function useResource(ctx,id){
 await materialSession(ctx,{write:true,hostOnly:true});
 const {row,data}=await resource(ctx.req,ctx.appointment.agencyId,id);
 const buffer=await Storage.readObject(data.storagePath);
 if(crypto.createHash('sha256').update(buffer).digest('hex')!==data.sourceHash)throw fail(409,'The resource source changed. Ask publishing staff to review it.');
 const {material}=await uploadMaterial(ctx,{buffer,mimetype:'application/pdf',originalname:'worksheet.pdf'},row.title);
 const v=await saveDefinition(ctx,material.id,data.definition);
 return {material,version:v};
}
