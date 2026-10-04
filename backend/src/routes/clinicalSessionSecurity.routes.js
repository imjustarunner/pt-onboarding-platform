import express from 'express';
import pool from '../config/database.js';
import { authenticate,requireAgencyAdmin } from '../middleware/auth.middleware.js';
import { requireClinicalStaffSecurity } from '../middleware/clinicalStaffSecurity.middleware.js';
import { validateClinicalRetention } from '../services/clinicalSessionRetention.service.js';
import { clinicalAudit } from '../services/clinicalSessionAudit.service.js';
const router=express.Router();
router.use(authenticate,requireClinicalStaffSecurity);
router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
router.get('/:agencyId/retention',requireAgencyAdmin,async(req,res,next)=>{
 try {const [[policy]]=await pool.execute('SELECT artifact_days AS artifactDays FROM clinical_session_retention WHERE agency_id=?',[req.params.agencyId]);res.json(policy||{artifactDays:null});}catch(e){next(e);}
});
router.put('/:agencyId/retention',requireAgencyAdmin,async(req,res,next)=>{
 const db=await pool.getConnection();
 try {
  const days=validateClinicalRetention(req.body.artifactDays);
  if(days!==null&&req.body.confirmAutomaticDeletion!==true)return res.status(400).json({error:{message:'Confirm the approved automatic deletion policy.'}});
  await db.beginTransaction();
  await db.execute(`INSERT INTO clinical_session_retention (agency_id,artifact_days,updated_by_user_id) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE artifact_days=VALUES(artifact_days),updated_by_user_id=VALUES(updated_by_user_id),updated_at=UTC_TIMESTAMP()`,[req.params.agencyId,days,req.user.id]);
  await clinicalAudit({agencyId:Number(req.params.agencyId),req,role:req.user.role},'clinical_retention_policy_changed',{artifactDays:days},db);
  await db.commit();res.json({artifactDays:days});
 }catch(e){await db.rollback();next(e);}finally{db.release();}
});
router.put('/:agencyId/encounters/:kind/:sessionId/:generation/hold',requireAgencyAdmin,async(req,res,next)=>{
 const db=await pool.getConnection();
 try {
  if(typeof req.body.legalHold!=='boolean')return res.status(400).json({error:{message:'Specify whether to retain the encounter under a hold.'}});
  await db.beginTransaction();
  const [r]=await db.execute('UPDATE clinical_video_sessions SET legal_hold=? WHERE agency_id=? AND session_kind=? AND session_id=? AND generation=?',[req.body.legalHold,req.params.agencyId,req.params.kind,req.params.sessionId,req.params.generation]);
  if(!r.affectedRows){await db.rollback();return res.status(404).json({error:{message:'Encounter not found.'}});}
  await clinicalAudit({agencyId:Number(req.params.agencyId),kind:req.params.kind,sessionId:Number(req.params.sessionId),generation:Number(req.params.generation),req,role:req.user.role},'clinical_retention_hold_changed',{legalHold:req.body.legalHold},db);
  await db.commit();res.json({legalHold:req.body.legalHold});
 }catch(e){await db.rollback();next(e);}finally{db.release();}
});
export default router;
