import pool from '../config/database.js';
import User from '../models/User.model.js';
import {reviewRecipient,requireSection} from './providerUpdateReview.controller.js';
import {DRAFT_KIND} from '../services/compensationDraft.service.js';
import {amendmentIssues} from '../content/itscoOctober2026Drafts.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

export async function recipientAmendment(recipient){
 const [rows]=await pool.execute(`SELECT g.id,g.token_values_json,g.rendered_html,g.task_id,t.status AS task_status,s.signed_pdf_path,s.audit_trail
  FROM contract_generations g LEFT JOIN tasks t ON t.id=g.task_id LEFT JOIN signed_documents s ON s.task_id=t.id
  WHERE g.agency_id=? AND g.candidate_user_id=?
  AND JSON_UNQUOTE(JSON_EXTRACT(g.token_values_json,'$.draftKind'))=? ORDER BY g.id DESC`,[recipient.agency_id,recipient.provider_user_id,DRAFT_KIND]);
 const row=rows.find(r=>recipient.previewOnly || (r.task_id && Number(parse(r.token_values_json)?.pushId)===Number(recipient.push_id)));
 if(!row)return null;
 const data=parse(row.token_values_json),audit=parse(row.audit_trail)||{};
 return {id:row.id,pushId:Number(data.pushId)||null,html:row.rendered_html,taskId:row.task_id,name:data.employee?.name,
  draft:!row.task_id,issues:amendmentIssues(data),signed:!!row.signed_pdf_path,countersigned:!!audit.adminCountersign?.signedAt,
  countersignerName:data.countersignerName||'Haley Inyart',countersignerUserId:data.countersignerUserId||3};
}
export async function getAmendment(req,res,next){try{
 const r=await reviewRecipient(req);requireSection(r,'amendments');res.set('Cache-Control','no-store');
 res.json({amendment:await recipientAmendment(r),previewOnly:!!r.previewOnly});
}catch(e){next(e);}}
export async function amendmentSigning(req,res,next){try{
 const r=await reviewRecipient(req);requireSection(r,'amendments');
 if(r.previewOnly)throw fail('This private preview cannot sign or change employee documents.',403);
 const amendment=await recipientAmendment(r);
 if(!amendment?.taskId || amendment.draft)throw fail('An approved amendment has not been released to this update.',409);
 const action=req.params.action;
 if(!['consent','intent','sign','download'].includes(action))throw fail('Unknown signing step.');
 if(action==='sign' && (typeof req.body?.signatureData!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(req.body.signatureData)||req.body.signatureData.length>1000000))throw fail('Draw a valid signature before signing.');
 if(action==='consent' && req.body?.consent!==true)throw fail('Electronic signature consent is required.');
 if(action==='intent' && req.body?.intent!==true)throw fail('Confirm your intent to sign.');
 const signing=await import('./documentSigning.controller.js');
 const scoped=Object.create(req);scoped.params={taskId:String(amendment.taskId)};
 scoped.user={...await User.findById(r.provider_user_id),id:Number(r.provider_user_id),role:'provider'};
 scoped.body=action==='sign'?{signatureData:req.body.signatureData,fieldValues:{}}:{};
 const handlers={consent:signing.giveConsent,intent:signing.recordIntent,sign:signing.signDocument,download:signing.downloadSignedDocument};
 return handlers[action](scoped,res,next);
}catch(e){next(e);}}
