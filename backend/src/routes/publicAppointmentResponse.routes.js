import express from 'express';
import crypto from 'node:crypto';
import { appointmentEmailActionContext, submitAppointmentEmailAction, appointmentEmailActions, actionLabels } from '../services/appointmentEmailActions.service.js';
import { renderPortalEmail, escapePortalHtml as e } from '../services/portalEmailBranding.service.js';
import { formatAppointmentTime } from '../services/appointmentServiceSetting.service.js';
import { appointmentResponseUrl } from '../utils/appointmentResponseUrl.js';
import {appointmentJoinEmail} from '../services/appointmentJoinEmail.service.js';
import {appointmentEmailTutorName} from '../services/appointmentEmailDetails.service.js';
import {appointmentActionsHtml} from '../utils/appointmentEmailContent.js';
import {appointmentServiceLabel} from '../utils/appointmentPresentation.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';

const router=express.Router();
// no-referrer makes browser navigation POSTs send Origin: null. strict-origin
// still withholds the secret path, while preserving the same-origin form check.
router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'strict-origin','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});next();});
const document=(html,script='')=>/^<!doctype html>/i.test(html)?html.replace('</body>',`${script}</body>`):`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Appointment response</title></head><body style="margin:0">${html}${script}</body></html>`;
function errorResponse(res,error){return res.status(error.status||500).type('html').send(document(`<main style="font:16px Arial;padding:28px;max-width:600px;margin:auto"><h1>Appointment response</h1><p>${e(error.status?error.message:'We could not save your response. Please contact your care team.')}</p></main>`));}
const setupDocument = content => document(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up AuricWell</title></head><body><main style="max-width:32rem;margin:10vh auto;padding:1.25rem;font:16px/1.5 Arial,sans-serif"><h1>Set up your AuricWell portal</h1>${content}</main></body></html>`);

async function showPortalSetup(req, res, problem = '') {
  try {
    const { readClinicalPortalSetup } = await import('../services/clinicalPortalSetupEmail.service.js');
    const { dependent } = await readClinicalPortalSetup(req.params.token);
    const form = `<form method="post"><label for="birth-date">${dependent ? 'Your dependent’s date of birth' : 'Your date of birth'}</label><p><input id="birth-date" name="birthDate" type="date" required></p><button type="submit">Continue to password setup</button></form>`;
    return res.status(problem ? 400 : 200).type('html').send(setupDocument(`${problem ? `<p role="alert">${e(problem)}</p>` : ''}${form}`));
  } catch {
    return res.status(410).type('html').send(setupDocument('<p>This setup link is unavailable. Contact your care team for a new invitation.</p>'));
  }
}
router.get('/portal-setup/:token', (req, res) => showPortalSetup(req, res));
router.post('/portal-setup/:token', async (req, res) => {
  if (req.get('origin') !== 'https://auricwell.com') return res.sendStatus(403);
  try {
    const { completeClinicalPortalSetup } = await import('../services/clinicalPortalSetupEmail.service.js');
    const location = await completeClinicalPortalSetup(req.params.token, req.body?.birthDate);
    return res.redirect(303, location);
  } catch (error) {
    if (error.status === 400) return showPortalSetup(req, res, error.message);
    return res.status(410).type('html').send(setupDocument('<p>This setup link is unavailable. Contact your care team for a new invitation.</p>'));
  }
});

router.get('/:token',async(req,res)=>{
  try {
    const {row,appt,setting,context}=await appointmentEmailActionContext(req.params.token);
    const allowed=appointmentEmailActions(setting.isSchool),selected=allowed.includes(req.query.action)?req.query.action:allowed[0];
    const nonce=crypto.randomBytes(18).toString('base64');
    res.set('Content-Security-Policy',`default-src 'none'; img-src https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
    const form=(action,primary=false)=>`<form ${primary?'id="appointment-response" ':''}method="post" action="${e(req.baseUrl+'/'+req.params.token)}"><input type="hidden" name="action" value="${e(action)}"><input type="hidden" name="confirm" value="yes"><p><button type="submit" style="font:${primary?'700 18':'400 14'}px Arial;background:${primary?'#16457c':'white'};color:${primary?'white':'#40536b'};padding:${primary?'18px 24px':'10px 16px'};border:1px solid #cbd6e3;border-radius:8px">${e(actionLabels[action])}</button></p></form>`;
    const done=row.status==='completed';
    const review=req.query.action==='review'||!req.query.action;
    const tutorName=await appointmentEmailTutorName(appt);
    const join=context.learning?await appointmentJoinEmail({appointment:appt,clientId:row.client_id,recipientUserId:row.guardian_user_id,context}):null;
    const minutes=(+parseUtcDate(appt.endAt)-+parseUtcDate(appt.startAt))/60000;
    const details=context.learning?`<h2>${e(appointmentServiceLabel(appt))} · Appointment #${e(appt.id)}</h2><p>${e(formatAppointmentTime(appt))}${Number.isFinite(minutes)&&minutes>0?` · ${minutes} minutes`:''}</p>${tutorName?`<p>Your tutor: ${e(tutorName)}</p>`:''}<p>${e(appt.modality==='IN_PERSON'?'In person':'Virtual')}${appt.modality==='IN_PERSON'&&appt.locationLabel?' · '+e(appt.locationLabel):''} · ${e(String(appt.status||'').replaceAll('_',' '))}</p>${join?appointmentActionsHtml([{label:join.label||'Join tutoring session',url:join.url}]):''}`:'';
    const canChangeConfirmation=done&&row.chosen_action==='confirm'&&['scheduled','confirmed','client_confirmed'].includes(appt.status);
    const html=details+(done?`<h2>Response received</h2><p>${e(row.result_message)}</p>${canChangeConfirmation?allowed.filter(a=>a!=='confirm').map(a=>form(a,a===selected)).join(''):''}`:row.status!=='ready'?'<h2>Response under review</h2><p>Please contact your team before submitting another response.</p>':
      `<h2>${e(context.tenant.name)}: ${setting.isSchool?'school session':'appointment'}</h2><p>${e(formatAppointmentTime(appt))}</p><p>${setting.isSchool?'No confirmation is needed. If your dependent cannot attend today, cancel the session below. Please report school absences to the school as usual.':selected==='confirm'&&!review?'Confirming your appointment… If confirmation does not finish, use the button below.':'Submit your response below. Your practice’s cancellation policy still applies; a late cancellation may require staff review.'}</p>${form(selected,true)}${setting.isSchool?'':allowed.filter(a=>a!==selected).map(a=>form(a)).join('')}<p>No sign-in is needed.</p>`);
    // Email scanners and GET/prefetch requests never change the booking. The
    // opened, visible browser submits a POST only for an explicit email action.
    const prefetch=/prefetch|prerender/i.test(`${req.get('purpose')||''} ${req.get('sec-purpose')||''}`);
    const autoSubmit=!setting.isSchool&&(req.query.action==='confirm'||context.learning)&&allowed.includes(req.query.action)&&(row.status==='ready'||canChangeConfirmation&&req.query.action!=='confirm')&&!prefetch;
    const script=autoSubmit?`<script nonce="${nonce}">(()=>{let sent=false;function confirm(){if(sent||document.prerendering||document.visibilityState!=="visible")return;sent=true;document.getElementById("appointment-response").requestSubmit();}document.addEventListener("visibilitychange",confirm);document.addEventListener("prerenderingchange",confirm);confirm();})();</script>`:'';
    res.type('html').send(document(renderPortalEmail({brand:context.brand,html}),script));
  }catch(error){errorResponse(res,error);}
});
router.post('/:token',async(req,res)=>{
  try {
    if(req.body?.confirm!=='yes') throw Object.assign(new Error('Confirm your response using the button.'),{status:400});
    const origin=req.get('origin');
    if(origin) {
      const {context}=await appointmentEmailActionContext(req.params.token);
      const origins=new Set([new URL(appointmentResponseUrl(req.params.token,context)).origin,`https://${req.get('host')}`]);
      if(!origins.has(origin)) throw Object.assign(new Error('Open the link from your email and try again.'),{status:403});
    }
    await submitAppointmentEmailAction(req.params.token,req.body.action);
    res.redirect(303,`${req.baseUrl}/${req.params.token}`);
  }catch(error){errorResponse(res,error);}
});
export default router;
