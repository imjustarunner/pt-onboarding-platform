import express from 'express';
import {publicIntakeLimiter} from '../middleware/rateLimiter.middleware.js';
import {exchangePreferenceContext,saveExchangePreferenceAnswers} from '../services/clientExchangePreferences.service.js';
import {resolveTenantEmailChrome} from '../services/tenantEmailChrome.service.js';
import {EXCHANGE_DAYS,EXCHANGE_PERIODS} from '../../../frontend/src/navigation/clientExchangeEssentials.js';
import {exchangeLocationLabel} from '../../../frontend/src/navigation/clientExchangeLocation.js';
const router=express.Router();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const SERVICE_CHOICES=[
  ['in_person_cos','in_person','Colorado Springs','In person — Colorado Springs'],
  ['in_person_denver','in_person','Denver','In person — Denver'],
  ['in_person_either','in_person','Either location','In person — either city works'],
  ['virtual','virtual','','Virtual only'],
  ['either_cos','either','Colorado Springs','In person or virtual — Colorado Springs'],
  ['either_denver','either','Denver','In person or virtual — Denver'],
  ['either_city','either','Either location','In person or virtual — either city works']
];
export function serviceChoiceAnswers(value){const row=SERVICE_CHOICES.find(row=>row[0]===value);if(!row)throw Object.assign(new Error('Choose your visit format and in-person city, if applicable.'),{status:400});return {modality:row[1],serviceLocation:row[2]};}
const document=(body,title='Your service preferences')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{margin:0;background:#f2f7f4;color:#203a2d;font:16px/1.6 Arial,sans-serif}main{box-sizing:border-box;max-width:740px;margin:24px auto;padding:28px;background:#fff;border-radius:16px}h1{font-size:28px;line-height:1.3}.brand{display:block;width:320px;max-width:100%;height:auto;margin:0 auto 20px}label,legend{font-weight:700}fieldset{border:1px solid #d7e4dc;border-radius:8px;margin:22px 0;padding:16px}select,textarea,input[type=text]{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #829b8b;border-radius:7px;margin:8px 0}select{white-space:normal}textarea{min-height:110px}.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.choices label{font-weight:400;display:flex;gap:9px;align-items:center}.choices input{width:19px;height:19px}button{background:#28684d;color:#fff;border:0;border-radius:8px;padding:14px 22px;font:700 17px Arial;cursor:pointer}.notice{background:#eef6f1;padding:16px;border-radius:8px}a{color:#28684d;overflow-wrap:anywhere}small{display:block;color:#4d6457}@media(max-width:600px){main{margin:0;padding:22px 16px;border-radius:0}h1{font-size:25px}}</style></head><body>${body}</body></html>`;
export function exchangePreferencePage({context,chrome,path}) {
 const {summary,scope,recipient,revision,missing}=context;
 const keys=new Set(missing.map(item=>item.key));
 const needsService=keys.has('modality')||keys.has('location');
 const header=chrome.headerUrl?`<img class="brand" src="${escape(chrome.headerUrl)}" alt="${escape(chrome.agencyName||'Your care team')}">`:'';
 if(scope.completed_at)return document(`<main>${header}<h1>Your preferences are saved</h1><p>Thank you. Support can now use your updated information to review appropriate providers.</p><p>This does not book an appointment or confirm insurance coverage. Support will help with next steps.</p><p>To make another change, reply to your Support email.</p></main>`);
 const selected=SERVICE_CHOICES.find(row=>row[1]===summary.preferences.modality&&row[2]===(summary.preferences.serviceLocation||''))?.[0];
 const checkboxes=(name,options,values)=>`<div class="choices">${options.map(value=>`<label><input type="checkbox" name="${name}" value="${escape(value)}" ${values?.includes(value)?'checked':''}>${escape(value[0].toUpperCase()+value.slice(1))}</label>`).join('')}</div>`;
 return document(`<main>${header}<h1>Help us find the right provider</h1><p>${escape(chrome.agencyName||'Your care team')} · Client ${escape(recipient.initials)}</p><p>Confirm your visit preferences and complete the essential details below. Information already on your record does not need to be entered again.</p><form method="post" action="${escape(path)}"><input type="hidden" name="revision" value="${revision}">${needsService?`<label for="service">Where and how would you like care?</label><select id="service" name="serviceChoice" required><option value="">Choose an option…</option>${SERVICE_CHOICES.map(row=>`<option value="${row[0]}" ${selected===row[0]?'selected':''}>${escape(row[3])}</option>`).join('')}</select><small>In-person care requires a city. Virtual-only care does not.</small>`:`<p class="notice">${escape(exchangeLocationLabel(summary.preferences))}. To change this, reply to Support.</p>`}
 ${keys.has('insurance')?'<fieldset><legend>Insurance or self-pay</legend><label for="insurance">Insurance company and plan name, Medicaid, or self-pay</label><input id="insurance" name="insurance" type="text" maxlength="200" required autocomplete="off"><small>For commercial insurance, enter the plan name shown on your card. Do not enter member numbers or Social Security numbers here. Support will confirm coverage separately.</small></fieldset>':''}
 ${keys.has('days')?`<fieldset><legend>Which days could work?</legend><p>Select every day that works for you.</p>${checkboxes('days',EXCHANGE_DAYS,summary.preferences.schedule?.days)}</fieldset>`:''}
 ${keys.has('times')?`<fieldset><legend>Which times could work?</legend><p>Select every time of day that works for you (Mountain Time).</p>${checkboxes('periods',EXCHANGE_PERIODS,summary.preferences.schedule?.periods)}</fieldset>`:''}
 ${keys.has('concerns')?'<fieldset><legend>Main clinical concerns</legend><label for="concerns">What would you like help with?</label><textarea id="concerns" name="concerns" maxlength="2000" required></textarea><small>A brief description is enough. A diagnosis is not required.</small></fieldset>':''}
 <p class="notice">Your answers update only this client’s service preferences. They do not change notification choices, create an appointment or confirm coverage.</p><button type="submit" name="confirm" value="yes">Save my preferences</button><p><small>Keep this private link for the intended recipient. If you need help, reply to your Support email.</small></p></form></main>`);
}
router.use(publicIntakeLimiter);
router.use((req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});next();});
const errorResponse=(res,error)=>res.status(error.status||500).type('html').send(document(`<main><h1>Service preferences</h1><p>${escape(error.status?error.message:'We could not save this update. Please try again or reply to Support.')}</p><p>Return to your email link to review the form.</p></main>`));
router.get('/:token',async(req,res)=>{try{const context=await exchangePreferenceContext(req.params.token);const chrome=await resolveTenantEmailChrome(context.scope.agency_id);res.type('html').send(exchangePreferencePage({context,chrome,path:`${req.baseUrl}/${req.params.token}`}));}catch(error){errorResponse(res,error);}});
router.post('/:token',async(req,res)=>{try{
 const origin=req.get('origin');if(origin&&origin!==`https://${req.get('host')}`)throw Object.assign(new Error('Open the link from your email again before saving.'),{status:403});
 await saveExchangePreferenceAnswers({token:req.params.token,input:{...req.body,...(req.body.serviceChoice?serviceChoiceAnswers(req.body.serviceChoice):{})}});
 res.redirect(303,`${req.baseUrl}/${req.params.token}`);
}catch(error){errorResponse(res,error);}});
export default router;
