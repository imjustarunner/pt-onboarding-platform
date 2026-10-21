import express from 'express';
import {familyNotificationInvitationContext,saveFamilyNotificationChoices} from '../services/familyNotificationChoices.service.js';
import {FAMILY_ACCOUNT_UPDATE_CATEGORIES,accountUpdateChoices,FAMILY_CHANNEL_CHOICES,FAMILY_CHOICE_VERSION,FAMILY_CHOICE_DISCLOSURE} from '../utils/familyNotificationChoices.js';
import {clientEmailContext} from '../services/clientPortalEmail.service.js';
import {clientEmailLabel} from '../services/clientPortalEmailContent.js';
import {escapePortalHtml as e,renderPortalEmail} from '../services/portalEmailBranding.service.js';
import {schoolCareBridgeEmailBlock} from '../services/schoolCareBridgeEmail.service.js';
import {publicIntakeLimiter} from '../middleware/rateLimiter.middleware.js';
const router=express.Router();
router.use(publicIntakeLimiter);
router.use((req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});next();});
const document=html=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your notification choices</title><style>body{margin:0;font:16px Arial;color:#26364a}button{cursor:pointer;font:700 15px Arial;border-radius:8px;padding:14px 18px;border:0;background:#16457c;color:#fff}.choices{width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px}.choices th:first-child{width:40%;text-align:left}.choices td,.choices th{padding:12px 2px;border-bottom:1px solid #dce4ed;text-align:center;vertical-align:middle}.choices td label{display:flex;min-height:36px;justify-content:center;align-items:center}.choices input{width:19px;height:19px;margin:0;accent-color:#16457c}.choices small{display:block;font-size:11px;font-weight:400;line-height:1.4;margin-top:4px;color:#627187}details{font-size:13px;margin:18px 0}summary{cursor:pointer;color:#16457c}a{overflow-wrap:anywhere}.notice{padding:12px;background:#eef4fa;border-radius:8px;font-size:13px}.tools{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin:16px 0}@media(max-width:400px){.choices{font-size:12px}.choices th:first-child{width:36%}}</style></head><body>${html}</body></html>`;
const errorResponse=(res,error)=>res.status(error.status||500).type('html').send(document(`<main style="padding:24px"><h1>Notification choices</h1><p>${e(error.status?error.message:'We could not save your choices. Please try again or contact your care team.')}</p><p>You can return to the link in your email.</p></main>`));
export function familyChoicePage({context,brand,path,preset,saved,portalUrl='https://auricwell.com/login'}) {
  const {recipient,revision}=context;
  const isSchool=recipient.client_type==='school';
  const choices=accountUpdateChoices(context.choices,{isSchool});
  // Selecting all proposes account email only. Optional texts always require an
  // explicit per-category choice; GET requests never change stored preferences.
  if(['all','email','off'].includes(preset))for(const category of FAMILY_ACCOUNT_UPDATE_CATEGORIES)choices[category.key]=preset==='off'?'off':'email';
  const labels={email:'Email',sms:'Text',both:'Both',off:'Off'};
  const rows=FAMILY_ACCOUNT_UPDATE_CATEGORIES.map(category=>`<tr><th scope="row">${e(category.label)}<small>${e(category.detail)}</small></th>${FAMILY_CHANNEL_CHOICES.map(choice=>`<td><label><input type="radio" name="choices[${category.key}]" value="${choice}" aria-label="${e(category.label)}: ${labels[choice]}" ${choices[category.key]===choice?'checked':''} ${category.emailOnly&&['sms','both'].includes(choice)?'disabled':''} required></label></td>`).join('')}</tr>`).join('');
  const html=`<h2 style="margin-top:0">Manage your account updates</h2><p>${e(recipient.agency_name)} · ${e(clientEmailLabel({full_name:recipient.full_name}))}</p><p>Choose updates for this client from this agency. Appointment reminders cover the services they are enrolled in. These settings apply only to the email address that received your link. Other clients and guardians keep their own settings.</p>${saved?'<p class="notice" role="status"><strong>Your choices are saved.</strong> Any selected texts still need your verified phone, recorded permission and the agency’s texting program to be ready. Enrollment sends one combined text confirmation when activated. No account password was created.</p>':''}<p class="notice">No sign-in is needed. Email is the default for account updates; existing choices are respected. Review and confirm any changes. Texts are optional and start only after verified enrollment. Opening this page does not activate texting or save changes.</p><div class="tools"><a href="${e(path)}?preset=all">Choose all account updates (email)</a><a href="${e(path)}?preset=off">Turn all off</a></div><form method="post" action="${e(path)}"><input type="hidden" name="revision" value="${revision}"><input type="hidden" name="version" value="${FAMILY_CHOICE_VERSION}"><table class="choices"><caption style="text-align:left;font-weight:700;margin-bottom:8px">Account updates</caption><thead><tr><th scope="col">Notification</th>${FAMILY_CHANNEL_CHOICES.map(c=>`<th scope="col">${labels[c]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><p style="font-size:13px">Choosing no updates will not affect care or portal access. No marketing is included. Requested sign-in, password recovery and essential security messages are separate.</p><p style="font-size:13px">Texting: frequency varies; message and data rates may apply. Reply STOP to stop or HELP for help. START requests a restart through the registered texting program. Private details stay in the portal.</p><details><summary>How your choices work</summary><p>${e(FAMILY_CHOICE_DISCLOSURE)}</p><p>A text preference does not clear an existing STOP. Choosing a category does not create extra messages or turn on a feature that is not yet available. Existing agency-wide notification pauses still apply.</p></details><button type="submit" name="confirm" value="yes">Confirm my choices</button><p style="font-size:12px;color:#627187">By confirming, you request the account emails selected above and save your text preferences. Keep this link private; it expires 30 days after issue.</p></form><div class="notice"><strong>Your portal is ready when you are.</strong><p><a href="${e(portalUrl)}">Set up or sign in to your portal</a></p><p>To set a password, choose Forgot Password and enter the email that received this invitation.</p></div>${isSchool?schoolCareBridgeEmailBlock({accountUpdatesOnly:true}):''}`;
  return document(renderPortalEmail({brand,html}));
}
router.get('/:token',async(req,res)=>{
  try{const context=await familyNotificationInvitationContext(req.params.token);
    const portalContext=await clientEmailContext({agencyId:context.scope.agency_id,clientId:context.scope.client_id});
    res.type('html').send(familyChoicePage({context,brand:portalContext.brand,portalUrl:portalContext.url('login'),path:`${req.baseUrl}/${req.params.token}`,preset:req.query.preset,saved:req.query.saved==='1'}));
  }catch(error){errorResponse(res,error);}
});
router.post('/:token',async(req,res)=>{
  try{
    const origin=req.get('origin');
    if(origin&&origin!==`https://${req.get('host')}`)throw Object.assign(new Error('Open your email link again before saving.'),{status:403});
    await saveFamilyNotificationChoices({token:req.params.token,input:req.body});
    res.redirect(303,`${req.baseUrl}/${req.params.token}?saved=1`);
  }catch(error){errorResponse(res,error);}
});
export default router;
