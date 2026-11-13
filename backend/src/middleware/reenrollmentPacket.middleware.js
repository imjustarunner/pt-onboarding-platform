import {authenticate} from './auth.middleware.js';
import {clientReenrollment} from '../services/clientReenrollment.service.js';
const privateMatchFields=new Set(['registrationReturningAutoMatch','registration_matched_client_id','registration_returning_guardian_auto_match','registration_returning_matched_initials','returningMatchClientInitials']);
export function redactPublicEnrollmentMatches(value){
 if(!value||typeof value!=='object'||value instanceof Date||ArrayBuffer.isView(value))return value;
 if(Array.isArray(value))return value.map(redactPublicEnrollmentMatches);
 return Object.fromEntries(Object.entries(value).filter(([key])=>!privateMatchFields.has(key)).map(([key,item])=>{
  if(['intake_data','intakeData','registration_completion_hints'].includes(key)&&typeof item==='string'){try{return [key,JSON.stringify(redactPublicEnrollmentMatches(JSON.parse(item)))];}catch{}}
  return [key,key==='registration_client_match'?'new':redactPublicEnrollmentMatches(item)];
 }));
}
export function publicEnrollmentResponsePrivacy(req,res,next){
 const json=res.json.bind(res);res.json=value=>json(redactPublicEnrollmentMatches(value));next();
}
export function assertReenrollmentSubject(row,body={}){
 const expected=row.expectedClient||{id:row.client_id};
 const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
 for(const rows of [body.clients,body.intakeData?.clients])for(const child of Array.isArray(rows)?rows:[]){
  const id=Number(child?.clientId||child?.id),name=child?.fullName||[child?.firstName,child?.middleName,child?.lastName].filter(Boolean).join(' '),dob=child?.dateOfBirth||child?.date_of_birth;
  const expectedDob=expected.date_of_birth instanceof Date?expected.date_of_birth.toISOString().slice(0,10):String(expected.date_of_birth||'').slice(0,10);
  if(id>0&&id!==Number(expected.id)||name&&expected.full_name&&norm(name)!==norm(expected.full_name)||dob&&expectedDob&&String(dob).slice(0,10)!==expectedDob)throw Object.assign(new Error('This package is linked to one existing client. Contact the team to correct their identity or enroll someone else.'),{status:400});
 }
}
export function createReenrollmentPacketGate({auth=authenticate,access=clientReenrollment.packetAccess}={}){
 return (req,res,next)=>{
  const key=String(req.params.publicKey||'');if(!key.startsWith('reenroll-'))return next();
  res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
  return auth(req,res,async error=>{if(error)return next(error);try{
   const row=await access(req.user,key);if(!row)return res.status(404).json({error:{message:'This package is unavailable.'}});
   if(row.status==='completed'&&req.method==='POST'&&req.path==='/session')return res.status(409).json({error:{message:'This package was already completed.'}});
   // The packet targets one existing person. Public matching, provider selection,
   // additional guardians and credential issuance cannot turn it into new care.
   if(/\/(account-lookup|match-client|available-providers|registration-catalog|linked-translation|preferences|portal-credentials|approve)(?:\/|$)/.test(req.path))return res.sendStatus(403);
   const bodies=[req.body?.clients,req.body?.intakeData?.clients,req.body?.intakeData?.responses?.clients];
   if(bodies.some(rows=>Array.isArray(rows)&&rows.length>1)||req.body?.coGuardianToken)return res.status(400).json({error:{message:'This package is for the one client and portal account invited by the team.'}});
   assertReenrollmentSubject(row,req.body);
   req.reenrollmentPackage=row;return next();
  }catch(e){next(e);}});
 };
}
export const reenrollmentPacketGate=createReenrollmentPacketGate();
