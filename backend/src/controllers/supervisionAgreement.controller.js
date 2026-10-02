import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import { agreementsForUser, agreementPublic, signSupervisionAgreement } from '../services/supervisionAgreement.service.js';
import { hasActiveMeetingMembership } from '../services/meetingJoinPolicy.service.js';
const fail = (message,status=403) => {throw Object.assign(new Error(message),{status});};
async function context(req) {
  const actor=req.portalUser || req.user;
  if(req.portalUser && req.portalUser.status!=='ONBOARDING') fail('Supervision agreements are signed during onboarding, not prehire.');
  return actor;
}
export async function listSupervisionAgreements(req,res,next) {
  try {
    const actor=await context(req), uid=req.query.userId==='me'?Number(actor.id):Number(req.query.userId || actor.id), agencyId=Number(req.query.agencyId)||null;
    if(req.portalUser && uid!==Number(actor.id)) fail('Access denied.');
    if(uid!==Number(actor.id)) {
      if(!agencyId || !await hasActiveMeetingMembership(agencyId,actor.id)) fail('Access denied.');
      const [assigned]=await pool.execute('SELECT id FROM supervisor_assignments WHERE supervisor_id=? AND supervisee_id=? AND agency_id=?',[actor.id,uid,agencyId]);
      if(!assigned.length && !['admin','super_admin','support','clinical_practice_assistant'].includes(actor.role)) fail('Access denied.');
    }
    const rows=await agreementsForUser(uid,agencyId);
    const allowed=[];
    for(const row of rows) if(await hasActiveMeetingMembership(row.agency_id,actor.id)) allowed.push(agreementPublic(row,actor.id));
    res.set('Cache-Control','no-store').json({agreements:allowed});
  } catch(e){next(e);}
}
export async function signAgreement(req,res,next) {
  try {const actor=await context(req);res.json(await signSupervisionAgreement({agreementId:Number(req.params.agreementId),userId:actor.id,input:req.body,ip:req.ip,userAgent:req.get('user-agent'),portal:!!req.portalUser}));}catch(e){next(e);}
}
export async function downloadAgreement(req,res,next) {
  try {
    const actor=await context(req);
    const [rows]=await pool.execute('SELECT * FROM supervision_agreements WHERE id=?',[req.params.agreementId]);
    const a=rows[0];if(!a || ![Number(a.supervisor_user_id),Number(a.supervisee_user_id)].includes(Number(actor.id)))fail('Agreement not found.',404);
    if(!await hasActiveMeetingMembership(a.agency_id,actor.id))fail('Access denied.');
    if(!a.signed_pdf_path)fail('No signature has been saved yet.',409);
    res.set({'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'attachment; filename="supervision-agreement.pdf"'}).send(await StorageService.readObject(a.signed_pdf_path));
  }catch(e){next(e);}
}
