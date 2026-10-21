import express from 'express';
import { schoolSessionEmailOptOutContext, disableSchoolSessionEmails } from '../services/schoolSessionEmailPreferences.service.js';
import { clientEmailContext } from '../services/clientPortalEmail.service.js';
import { enrollmentMailBrand, renderPortalEmail, escapePortalHtml as e } from '../services/portalEmailBranding.service.js';

const router = express.Router();
router.use((req,res,next) => { res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}); next(); });
const document = html => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>School session email preference</title></head><body style="margin:0">${html}</body></html>`;
const errorResponse = (res,error) => res.status(error.status || 500).type('html').send(document(`<main style="font:16px Arial;padding:28px"><h1>School session emails</h1><p>${e(error.status ? error.message : 'We could not update this preference. Please contact your care team.')}</p></main>`));
router.get('/:token', async(req,res) => {
  try {
    const row = await schoolSessionEmailOptOutContext(req.params.token);
    const brand = row.agency_id ? (await clientEmailContext({agencyId:row.agency_id,clientId:row.client_id,clinical:row.product==='auricwell' ? true : undefined})).brand
      : enrollmentMailBrand({agency:{name:'Your care team'},domain:'auricwell.com',clinicalOverride:true});
    const html = `<h2>${row.disabled_at ? 'In-school session emails are turned off' : 'Stop in-school session emails?'}</h2><p>This preference applies only to the child and agency associated with this email, at the email address that received it.</p><p>Other children, other recipients, office appointments, text messages, billing and secure-message emails are unchanged.</p>${row.disabled_at
      ? '<p>You can close this page. Contact your care team if you would like these school session emails turned back on.</p>'
      : `<form method="post" action="${e(req.baseUrl+'/'+req.params.token)}"><button name="confirm" value="yes" type="submit" style="font:700 16px Arial;background:#16457c;color:white;padding:14px 24px;border:0;border-radius:8px">Stop these school session emails</button></form><p>No sign-in is needed. Opening this page does not change your preferences.</p>`}`;
    res.type('html').send(document(renderPortalEmail({brand,html})));
  } catch(error) { errorResponse(res,error); }
});
router.post('/:token', async(req,res) => {
  try {
    if(req.body?.confirm !== 'yes') throw Object.assign(new Error('Use the button to confirm your preference.'),{status:400});
    const origin=req.get('origin');
    if(origin && origin!==`https://${req.get('host')}`) throw Object.assign(new Error('Open the link from your email and try again.'),{status:403});
    await disableSchoolSessionEmails(req.params.token);
    res.redirect(303,`${req.baseUrl}/${req.params.token}`);
  } catch(error) { errorResponse(res,error); }
});
export default router;
