import {resolveSectionTraining} from '../services/providerUpdateTraining.service.js';
import {reviewRecipient,requireSection} from './providerUpdateReview.controller.js';

export async function sectionTraining(req,res,next) {
  try {
    const recipient=await reviewRecipient(req);
    requireSection(recipient,req.params.sectionKey);
    res.set('Cache-Control','no-store');
    res.json({guides:await resolveSectionTraining(recipient.section_config_json,req.params.sectionKey,recipient.agency_id)});
  } catch(error) {next(error);}
}

// Supplemental instructions remain readable after finalization; this does not unlock answers.
export async function savedInstructions(req,res,next) {
 try {
  const {default:pool}=await import('../config/database.js');
  const {getSectionMeta}=await import('../constants/providerUpdateSections.js');
  const {recipientSeesSection}=await import('../services/providerUpdate.service.js');
  const [[row]]=await pool.execute(`SELECT r.provider_user_id,p.agency_id,p.title,p.section_config_json,p.section_audience_json FROM provider_update_recipients r
   JOIN provider_update_pushes p ON p.id=r.push_id JOIN users u ON u.id=r.provider_user_id
   WHERE p.id=? AND r.provider_user_id=? AND p.status<>'draft' AND LEFT(r.token,8)<>'preview_'
   AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
   AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=p.agency_id AND COALESCE(ua.is_active,1)=1)
   AND EXISTS(SELECT 1 FROM provider_update_section_progress sp WHERE sp.recipient_id=r.id AND sp.section_key=?) LIMIT 1`,[Number(req.params.pushId),req.user.id,req.params.sectionKey]);
  if(!row)throw Object.assign(Error('These instructions are not assigned to your account.'),{status:403});
  const parse=v=>typeof v==='string'?JSON.parse(v):v||{};
  const config=parse(row.section_config_json);
  if(!config[req.params.sectionKey]||!recipientSeesSection(req.params.sectionKey,parse(row.section_audience_json),row.provider_user_id))throw Object.assign(Error('This section is not assigned to your account.'),{status:403});
  res.set('Cache-Control','no-store');
  res.json({title:row.title,agencyId:row.agency_id,section:getSectionMeta(req.params.sectionKey),guides:await resolveSectionTraining(config,req.params.sectionKey,row.agency_id)});
 }catch(e){next(e);}
}

export async function saveGuides(req,res,next) {
 try {
  const {assertAgencyAdmin}=await import('../services/providerUpdate.service.js');
  const {saveTrainingAndNotify}=await import('../services/providerUpdateTrainingNotice.service.js');
  const agencyId=await assertAgencyAdmin(req.user,req.body.agencyId);
  res.json(await saveTrainingAndNotify({pushId:Number(req.params.pushId),agencyId,sectionKey:req.params.sectionKey,guides:req.body.guides,notify:false,actorId:req.user.id}));
 }catch(e){next(e);}
}

export async function pushGuides(req,res,next){try{const {assertAgencyAdmin}=await import('../services/providerUpdate.service.js');const {queueTrainingBatch}=await import('../services/providerUpdateTrainingBatch.service.js');const agencyId=await assertAgencyAdmin(req.user,req.body.agencyId);res.json(await queueTrainingBatch({pushId:Number(req.params.pushId),agencyId}));}catch(e){next(e);}}
