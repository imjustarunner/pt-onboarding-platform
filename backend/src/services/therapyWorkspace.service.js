import pool from '../config/database.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const TYPES=new Set(['chat','share','drawing','response','viewed','rating','download']);
const MODES=new Set(['video','whiteboard','pdf','book','media','resource','assessment','activity','treatment']);
const scope=c=>[c.kind,c.sessionId,c.generation || 0,c.agencyId];
export function validateArtifact(context,body) {
 const type=body?.type,payload=body?.payload;
 if(!TYPES.has(type)||!payload||typeof payload!=='object'||Array.isArray(payload)) throw fail(400,'Invalid session content.');
 if(Buffer.byteLength(JSON.stringify(payload))>3*1024*1024) throw fail(413,'Session attachment must be under 2 MB.');
 if(type==='share') {
  if(!['provider','client'].includes(context.role)) throw fail(403,'Session admission is required.');
  if(payload.mode==='treatment'&&context.role!=='provider') throw fail(403,'Only the provider may share a treatment plan.');
  if(!MODES.has(payload.mode)) throw fail(400,'Unknown session tool.');
  if(payload.mode==='treatment'&&!context.clientId) throw fail(403,'Treatment plans require an identified client session.');
  if(payload.mode==='treatment'&&!context.verifiedTreatment) throw fail(403,'Select a treatment plan from this client’s record.');
  if(payload.url) { let url;try{url=new URL(payload.url);}catch{throw fail(400,'Enter a valid HTTPS link.');}if(url.protocol!=='https:')throw fail(400,'Use an HTTPS resource link.'); }
  if(payload.document && !/^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/=]+$/.test(payload.document))throw fail(400,'Choose a PDF document.');
  if(payload.questions && (!Array.isArray(payload.questions)||payload.questions.length>30||payload.questions.some(q=>typeof q!=='string'||q.length>500)))throw fail(400,'Use up to 30 short questions.');
 }
 if(type==='chat'&&(typeof payload.text!=='string'||!payload.text.trim()||payload.text.length>4000))throw fail(400,'Write a message up to 4,000 characters.');
 if(type==='rating'&&(!context.clientId||context.role!=='client'))throw fail(403,'Only the identified client may rate their treatment plan.');
 if(type==='drawing'&&(!Array.isArray(payload.points)||payload.points.length>2000||payload.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1000))||!/^#[a-f0-9]{6}$/i.test(payload.color)))throw fail(400,'Invalid drawing.');
 if(['response','viewed','rating','drawing','download'].includes(type)&&!Number.isSafeInteger(payload.shareId))throw fail(400,'Choose a shared session tool.');
 const fields={chat:['text'],drawing:['shareId','color','points'],rating:['shareId','value'],download:['shareId'],viewed:['shareId','page'],response:['shareId','answers'],share:['mode','title','url','document','questions','description','planId','clientId','goals']}[type];
 const clean=Object.fromEntries(fields.filter(key=>payload[key]!==undefined).map(key=>[key,payload[key]]));
 if(type==='share') {clean.title=String(clean.title||'').slice(0,150);clean.description=String(clean.description||'').slice(0,1000);if(clean.mode!=='treatment'){delete clean.planId;delete clean.clientId;delete clean.goals;}}
 return {type,payload:clean};
}
// Serialize authorization and content access against the same row as end/revoke.
async function authorizedWorkspace(context, operation, suppliedDb) {
 const db=suppliedDb||await pool.getConnection();
 try {
  if(!suppliedDb)await db.beginTransaction();
  const [sessions]=await db.execute('SELECT * FROM clinical_video_sessions WHERE session_kind=? AND session_id=? AND generation=? AND agency_id=? FOR UPDATE',scope(context));
  const session=sessions[0];
  if(!session&&!(context.historical===true&&context.role==='provider'))throw fail(404,'Encounter not found.');
  if(context.historical!==true && session?.state!=='active')throw fail(410,'This encounter has ended.');
  if(context.historical && context.role!=='provider')throw fail(403,'Provider access is required.');
  if(context.role==='client') {
   const table=context.kind==='office'?'private_virtual_office_visits':'counseling_session_visits';
   const office=context.kind==='office';
   const [visits]=await db.execute(`SELECT id FROM ${table} WHERE id=? AND status='admitted' AND ${office?'room_id=? AND generation=?':'session_id=? AND actor=?'}`,[context.visitId||0,context.sessionId,office?context.generation:context.actor]);
   if(!visits[0])throw fail(403,'Admission is required.');
  }
  const result=await operation(db);
  if(!suppliedDb)await db.commit();
  return result;
 }catch(error){if(!suppliedDb)await db.rollback();throw error;}finally{if(!suppliedDb)db.release();}
}
export async function readWorkspace(context, suppliedDb) {
 return authorizedWorkspace(context,async db=>{
 const afterId=Number(context.afterId)||0;
 if(!Number.isSafeInteger(afterId)||afterId<0)throw fail(400,'Invalid content cursor.');
 const [rows]=await db.execute(`SELECT id,actor,actor_role,artifact_type,payload_envelope,created_at FROM therapy_session_artifacts WHERE session_kind=? AND session_id=? AND generation=? AND agency_id=? AND id>? ORDER BY id LIMIT 100`,[...scope(context),afterId]);
 if(rows.length)await clinicalAudit(context,'clinical_content_read',{artifactIds:rows.map(r=>r.id)},db);
 return {hasMore:rows.length===100,nextCursor:rows.at(-1)?.id||afterId,artifacts:rows.map(r=>({id:r.id,actor:r.actor,role:r.actor_role,type:r.artifact_type,payload:JSON.parse(decryptChatText(JSON.parse(r.payload_envelope))),createdAt:r.created_at}))};
 },suppliedDb);
}
export async function appendWorkspace(context,body,suppliedDb) {
 return authorizedWorkspace({...context,historical:false},async db=>{
 const {type,payload}=validateArtifact(context,body);
 if(['response','viewed','rating','drawing','download'].includes(type)) {
  const [rows]=await db.execute(`SELECT payload_envelope FROM therapy_session_artifacts WHERE session_kind=? AND session_id=? AND generation=? AND agency_id=? AND id=? AND artifact_type='share'`,[...scope(context),payload.shareId]);
  if(!rows[0])throw fail(404,'Shared item not found in this session.');
  const shared=JSON.parse(decryptChatText(JSON.parse(rows[0].payload_envelope)));
  if(type==='rating'&&(shared.mode!=='treatment'||Number(shared.clientId)!==Number(context.clientId)||!Number.isInteger(payload.value)||payload.value<1||payload.value>10))throw fail(400,'Rate your shared plan from 1 to 10.');
  if(type==='drawing'&&shared.mode!=='whiteboard')throw fail(400,'Open a shared whiteboard first.');
  if(type==='response'&&(!['assessment','activity'].includes(shared.mode)||!Array.isArray(payload.answers)||payload.answers.length!==(shared.questions||[]).length||payload.answers.some(a=>typeof a!=='string'||a.length>4000)))throw fail(400,'Complete the shared questions.');
 }
 const [r]=await db.execute(`INSERT INTO therapy_session_artifacts (session_kind,session_id,generation,agency_id,actor,actor_role,artifact_type,payload_envelope) VALUES (?,?,?,?,?,?,?,?)`,[...scope(context),context.actor,context.role,type,JSON.stringify(encryptChatText(JSON.stringify(payload)))]);
 await clinicalAudit(context,type==='download'?'clinical_download_requested':'clinical_content_saved',{artifactId:r.insertId,artifactType:type},db);
 return {artifact:{id:r.insertId,actor:context.actor,role:context.role,type,payload,createdAt:new Date().toISOString()}};
 },suppliedDb);
}

export async function recordWorkspaceDownload(context,artifactId,suppliedDb) {
 if(!Number.isSafeInteger(artifactId)||artifactId<1)throw fail(400,'Choose a session attachment.');
 return authorizedWorkspace(context,async db=>{
  const [[artifact]]=await db.execute('SELECT id FROM therapy_session_artifacts WHERE session_kind=? AND session_id=? AND generation=? AND agency_id=? AND id=?',[...scope(context),artifactId]);
  if(!artifact)throw fail(404,'Attachment not found in this encounter.');
  await clinicalAudit(context,'clinical_download_requested',{artifactId},db);
  return {ok:true};
 },suppliedDb);
}
