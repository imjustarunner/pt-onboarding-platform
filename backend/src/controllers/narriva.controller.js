import pool from '../config/database.js';
import {narrivaTestOptions,runNarrivaTestReview} from '../services/narrivaTestReview.service.js';
import { requireNarrivaAgency,positiveId,narrivaError } from '../services/narrivaAccess.service.js';
import { createNarrivaReview,readNarrivaReview,resolveNarrivaFinding,latestNarrivaStatus,narrivaFeatures,narrivaWriterCapabilities } from '../services/narrivaReview.service.js';
const handle=fn=>async(req,res,next)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){next(e);}};
export const getNarrivaTestOptions=handle(async(req,res)=>res.json(await narrivaTestOptions(req.user,positiveId(req.query.agencyId))));
export const postNarrivaTestReview=handle(async(req,res)=>{
 try{res.json({review:await runNarrivaTestReview(req.user,req.body)});}
 catch(error){
  const status=[400,401,403,404,409,413,422,429].includes(error.status)?error.status:503;
  const code=['PHI_INPUT_REQUIRES_CORRECTION','NARRIVA_TEST_INPUT_INVALID','SESSION_PRIVACY_UNAVAILABLE','NARRIVA_GUIDANCE_UNAVAILABLE'].includes(error.code)?error.code:'NARRIVA_TEST_UNAVAILABLE';
  const message=status<500?error.message:code==='NARRIVA_GUIDANCE_UNAVAILABLE'?'Required service guidance is unavailable. Your test text remains on this page.':code==='SESSION_PRIVACY_UNAVAILABLE'?'Privacy inspection is unavailable. Your test text remains on this page.':'The test could not complete. Your text remains on this page; retry when the service is available.';
  // Never forward a provider request/configuration object to the global logger.
  throw Object.assign(narrivaError(status,message,code),{quiet:true});
 }
});
export const getNarrivaPreferences=handle(async(req,res)=>{
 const agencyId=positiveId(req.query.agencyId);await requireNarrivaAgency(req.user,agencyId);
 const [[row]]=await pool.execute('SELECT default_mode FROM narriva_writer_preferences WHERE user_id=? AND agency_id=?',[req.user.id,agencyId]);
 const features=await narrivaWriterCapabilities(req.user.id,agencyId);
 res.json({defaultMode:row?.default_mode==='manual' && !features.manualAllowed?'narriva':row?.default_mode || (features.manualAllowed?'manual':'narriva'),features});
});
export const patchNarrivaPreferences=handle(async(req,res)=>{
 const agencyId=positiveId(req.body.agencyId || req.query.agencyId);await requireNarrivaAgency(req.user,agencyId);
 if(!['manual','narriva','smart_notes'].includes(req.body.defaultMode))throw narrivaError(400,'Choose Manual Writer, Narriva, or Smart Notes.');
 const features=await narrivaWriterCapabilities(req.user.id,agencyId);
 if(req.body.defaultMode==='manual' && !features.manualAllowed)throw narrivaError(403,'Manual writing is disabled in your profile.');
 await pool.execute('INSERT INTO narriva_writer_preferences(user_id,agency_id,default_mode) VALUES(?,?,?) ON DUPLICATE KEY UPDATE default_mode=VALUES(default_mode)',[req.user.id,agencyId,req.body.defaultMode]);
 res.json({defaultMode:req.body.defaultMode,features});
});
export const postNarrivaReview=handle(async(req,res)=>res.status(202).json({review:await createNarrivaReview(req)}));
export const getNarrivaReview=handle(async(req,res)=>res.json({review:await readNarrivaReview(req.user,req.params.reviewId,positiveId(req.query.agencyId))}));
export const patchNarrivaFinding=handle(async(req,res)=>res.json({review:await resolveNarrivaFinding(req)}));
export const getNarrivaNoteStatus=handle(async(req,res)=>res.json({review:await latestNarrivaStatus(req.user,positiveId(req.query.agencyId),positiveId(req.params.noteId))}));
