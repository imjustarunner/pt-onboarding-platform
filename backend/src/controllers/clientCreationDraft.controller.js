import pool from '../config/database.js';
import { encryptDemographicsPayload,decryptDemographicsPayload } from '../services/demographicsImport.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
const fail=(status,message)=>Object.assign(Error(message),{status});
async function scopeOf(req){
 const agencyId=Number(req.get?.('X-Agency-Id')),userId=Number(req.user?.id),role=String(req.user?.role||'');
 if(!['super_admin','admin','support','provider','provider_plus'].includes(role)||!Number.isSafeInteger(agencyId)||agencyId<1||!Number.isSafeInteger(userId)||userId<1)throw fail(403,'Authorized agency access is required for this draft.');
 const[rows]=await pool.execute(`SELECT a.id FROM agencies a WHERE a.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND (?='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=? AND ua.agency_id=a.id AND ua.is_active=1))`,[agencyId,role,userId]);
 if(!rows.length)throw fail(403,'Authorized agency access is required for this draft.');
 return{agencyId,userId,context:`client_creation:${agencyId}:${userId}`};
}
function unpack(row,scope){if(!row)return{value:null,revision:0};const envelope=decryptDemographicsPayload(row.payload_enc);if(envelope.context!==scope.context)throw Error('Client draft context mismatch');return{value:envelope.value,revision:Number(row.revision)};}
export async function getClientCreationDraft(req,res,next){try{const scope=await scopeOf(req);const[rows]=await pool.execute('SELECT payload_enc,revision FROM client_creation_drafts WHERE agency_id=? AND owner_user_id=?',[scope.agencyId,scope.userId]);await logAuditEvent(req,{actionType:'client_creation_draft_viewed',agencyId:scope.agencyId,targetType:'agency',targetId:scope.agencyId});const saved=unpack(rows[0],scope);
 if(saved.value?.created?.id){
  const [[chart]]=await pool.execute("SELECT JSON_UNQUOTE(JSON_EXTRACT(onboarding_docs_json,'$.recordsImport.status')) AS records_import_status FROM clients WHERE id=? AND agency_id=?",[saved.value.created.id,scope.agencyId]);
  if(chart?.records_import_status==='complete')saved.value={...saved.value,completed:true};
 }
 res.set('Cache-Control','no-store').json(saved);}catch(error){next(error);}}
export async function saveClientCreationDraft(req,res,next){let db;try{
 const scope=await scopeOf(req),revision=req.body?.revision,value=req.body?.value;
 if(!Number.isSafeInteger(revision)||revision<0||!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>1800000)throw fail(400,'A valid client draft and revision are required.');
 db=await pool.getConnection();await db.beginTransaction();
 // The user row serializes first saves as well as updates for this user's drafts.
 await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[scope.userId]);
 const[rows]=await db.execute('SELECT payload_enc,revision FROM client_creation_drafts WHERE agency_id=? AND owner_user_id=?',[scope.agencyId,scope.userId]);
 const previous=unpack(rows[0],scope);if(previous.revision!==revision)throw fail(409,'This client draft changed in another window. Keep this window open and reload the saved draft before continuing.');
 const encrypted=JSON.stringify(encryptDemographicsPayload({context:scope.context,value}));
 await db.execute('INSERT INTO client_creation_drafts (agency_id,owner_user_id,payload_enc,revision) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE payload_enc=VALUES(payload_enc),revision=VALUES(revision)',[scope.agencyId,scope.userId,encrypted,revision+1]);
 await db.commit();res.set('Cache-Control','no-store').json({revision:revision+1});
 }catch(error){if(db)await db.rollback();next(error);}finally{db?.release();}}
