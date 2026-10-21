import express from 'express';
import { appointmentEmailActionContext, submitAppointmentEmailAction, appointmentEmailActions, actionLabels } from '../services/appointmentEmailActions.service.js';
import { renderPortalEmail, escapePortalHtml as e } from '../services/portalEmailBranding.service.js';
import { formatAppointmentTime } from '../services/appointmentServiceSetting.service.js';

const router=express.Router();
router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});next();});
const document=html=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Appointment response</title></head><body style="margin:0">${html}</body></html>`;
function errorResponse(res,error){return res.status(error.status||500).type('html').send(document(`<main style="font:16px Arial;padding:28px;max-width:600px;margin:auto"><h1>Appointment response</h1><p>${e(error.status?error.message:'We could not save your response. Please contact your care team.')}</p></main>`));}
router.get('/:token',async(req,res)=>{
  try {
    const {row,appt,setting,context}=await appointmentEmailActionContext(req.params.token);
    const allowed=appointmentEmailActions(setting.isSchool),selected=allowed.includes(req.query.action)?req.query.action:allowed[0];
    const done=row.status==='completed';
    const html=done?`<h2>Response received</h2><p>${e(row.result_message)}</p>`:row.status!=='ready'?'<h2>Response under review</h2><p>Please contact your care team before submitting another response.</p>':
      `<h2>${e(context.tenant.name)}: ${setting.isSchool?'school session':'appointment'}</h2><p>${e(formatAppointmentTime(appt))}</p><p>${setting.isSchool?'Notify your care team that your child will be absent. Please also notify the school.':'Review your choice and submit below. Your practice’s cancellation policy still applies; a late cancellation may require staff review.'}</p><form method="post" action="${e(req.baseUrl+'/'+req.params.token)}"><label>Your response<br><select name="action" style="font:inherit;padding:12px;max-width:100%">${allowed.map(a=>`<option value="${a}" ${a===selected?'selected':''}>${e(actionLabels[a])}</option>`).join('')}</select></label><p><button type="submit" name="confirm" value="yes" style="font:700 16px Arial;background:#16457c;color:white;padding:14px 24px;border:0;border-radius:8px">Submit response</button></p></form><p>No sign-in is needed. Opening this page does not change your appointment.</p>`;
    res.type('html').send(document(renderPortalEmail({brand:context.brand,html})));
  }catch(error){errorResponse(res,error);}
});
router.post('/:token',async(req,res)=>{
  try {
    if(req.body?.confirm!=='yes') throw Object.assign(new Error('Confirm your response using the button.'),{status:400});
    const origin=req.get('origin');if(origin && origin!==`https://${req.get('host')}`) throw Object.assign(new Error('Open the link from your email and try again.'),{status:403});
    await submitAppointmentEmailAction(req.params.token,req.body.action);
    res.redirect(303,`${req.baseUrl}/${req.params.token}`);
  }catch(error){errorResponse(res,error);}
});
export default router;
