import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import pool from '../config/database.js';
import {positiveId,auditBilling} from '../services/familyBillingPolicy.service.js';
import {requireReadySender} from '../services/familyLedger/senders.js';
import {requireBillingStaff} from '../services/familyLedger/policy.js';
import {listCardTasks,uploadCard,cardFile,updateCardTask,cardContext,refreshCardFollowup} from '../services/insuranceCards/service.js';
const router=express.Router();
const context=req=>({agencyId:positiveId(req.query.agencyId||req.body?.agencyId),userId:positiveId(req.user.id),...(req.params.id?{profileId:positiveId(req.params.id)}:{})});
const run=fn=>async(req,res,next)=>{try{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});await fn(req,res);}catch(e){next(e);}};
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:4}}).single('file');
router.get('/',run(async(req,res)=>res.json({tasks:await listCardTasks({...context(req),clientId:req.query.clientId?positiveId(req.query.clientId):null})})));
router.post('/:id/upload',rateLimit({windowMs:60000,max:15}),upload,run(async(req,res)=>res.json(await uploadCard({...context(req),slot:req.body.slot,cycle:req.body.cycle},req.file))));
router.post('/:id/action',run(async(req,res)=>res.json(await updateCardTask({...req.body,...context(req),staff:false}))));
router.get('/:id/file/:slot',run(async(req,res)=>{const file=await cardFile(context(req),req.params.slot);res.type(file.type).send(file.body);}));
router.use('/staff',async(req,res,next)=>{try{await requireBillingStaff(req.user,context(req).agencyId);next();}catch(e){next(e);}});
router.get('/staff/workspace',run(async(req,res)=>{
  const c=context(req),after=Number(req.query.after||0),rows=[];
  const [[settings]]=await pool.execute('SELECT enabled FROM insurance_card_reminder_settings WHERE agency_id=?',[c.agencyId]);
  const [profiles]=await pool.execute('SELECT id FROM guardian_insurance_profiles WHERE agency_id=? AND id>? ORDER BY id LIMIT 101',[c.agencyId,Number.isSafeInteger(after)&&after>=0?after:0]);
  for(const profile of profiles.slice(0,100))try{
    const ctx=await cardContext({...c,profileId:profile.id,staff:true}),p=await refreshCardFollowup(ctx);
    const [delivery]=await pool.execute('SELECT id,status,created_at FROM insurance_card_deliveries WHERE profile_id=? AND cycle_hash=? ORDER BY id DESC LIMIT 1',[profile.id,p.cycle_hash]);
    rows.push({profileId:profile.id,ownerName:[ctx.profile.first_name,ctx.profile.last_name].filter(Boolean).join(' '),cycle:p.cycle_hash,clients:ctx.clients.map(x=>({id:x.id,name:x.full_name||x.initials})),state:p.state,missingSlots:p.missingSlots,slots:p.slots,firstRequestedAt:p.first_requested_at,delivery:delivery[0]||null});
  }catch(e){if(e.status!==404)throw e;}
  res.json({rows,enabled:!!settings?.enabled,nextAfter:profiles.length>100?profiles[99].id:null});
}));
router.put('/staff/settings',run(async(req,res)=>{const c=context(req);if(req.body.enabled===true)await requireReadySender(c.agencyId,'billing');await pool.execute('INSERT INTO insurance_card_reminder_settings(agency_id,enabled,updated_by_user_id) VALUES(?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),updated_by_user_id=VALUES(updated_by_user_id)',[c.agencyId,req.body.enabled===true,c.userId]);await auditBilling({...c,action:'insurance_card_reminder_settings',objectId:c.agencyId});res.json({updated:true});}));
router.post('/staff/:id/action',run(async(req,res)=>res.json(await updateCardTask({...req.body,...context(req),staff:true}))));
router.get('/staff/:id/file/:slot',run(async(req,res)=>{const file=await cardFile({...context(req),staff:true},req.params.slot);res.type(file.type).send(file.body);}));
export default router;
