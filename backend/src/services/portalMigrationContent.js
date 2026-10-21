import {escapePortalHtml as e} from './portalEmailBranding.service.js';
import {portalActionHtml,clientEmailLabel} from './clientPortalEmailContent.js';
import {hasMedicaidCoverage,policyIsMedicaid} from '../utils/insurancePaymentPolicy.js';

export function migrationChecklist({insurance,coverageKnown=false,paymentReady=false,authorizationReady=false,insuranceCardMissing=false,demographicsConfirmed=false,planAvailable=false,planAcknowledged=false,notificationsConfirmed=false,self=false}={}) {
  const medicaid=hasMedicaidCoverage(insurance);
  const items=[{key:'information',title:self?'Verify your information':"Verify your dependent’s information",panel:'child',complete:demographicsConfirmed,detail:'Review your contact and client information. Submit any corrections for your care team to review.'},
    {key:'notifications',title:'Verify your notification settings',panel:'notifications',complete:notificationsConfirmed,detail:'Review email updates and choose any optional texts for this profile. Your choices stay scoped to your account, this client and their agency.'},
    {key:'plan',title:'Review your treatment plan',panel:'plan',complete:planAcknowledged,waiting:!planAvailable,detail:planAvailable?'Review the plan shared by your provider and acknowledge it when a signature is available.':'Your provider will share the current plan as your record moves into AuricWell.'}];
  if(insuranceCardMissing && [insurance?.primary,insurance?.secondary].some(p=>p?.insurerName&&!policyIsMedicaid(p)))items.push({key:'insurance',title:'Upload your insurance card',panel:'payment_methods',complete:false,detail:'Upload the front and back of your commercial insurance card securely. Medicaid cards are not needed.'});
  if(coverageKnown&&!medicaid){items.push({key:'authorization',title:'Review your payment authorization',panel:'billing',complete:authorizationReady,detail:'Review and sign any payment setup task assigned by billing. Saving a card does not by itself authorize automatic payments.'});items.push({key:'payment',title:'Set up your payment method',panel:'payment_methods',complete:paymentReady,detail:'Payment cards from the previous system are not transferred. Use a card already saved to your account with this agency, or add one securely. Select which clients you are responsible for and authorize their eligible payments; you do not need a new card for each dependent.'});}
  return items;
}
export function buildPortalMigrationEmail({firstName,agencyName,clients=[],url,portalUrl,existingAccount=false,school=false}) {
  const subject=`${agencyName}: welcome to your new AuricWell portal`;
  const intro=`${agencyName} is moving to AuricWell, your new secure home for care information, appointments, documents and billing.`;
  const detail='We are moving accounts in small groups with our care teams. More information will appear as we update your account. Your care continues with your agency and provider.';
  const steps='Once you sign in, review your information and the treatment plan your provider has shared. If applicable, we will also ask for your commercial insurance card, payment authorization and a new payment method. Medicaid cards and routine payment cards are not requested for Medicaid-covered care.';
  const history='Saved payment cards and past billing history do not move automatically from TherapyNotes. Download available receipts in Billing, or request earlier receipts and balances there.';
  const action=existingAccount?'Sign in to your portal':'Create your portal password';
  const labels=clients.map(clientEmailLabel).join(', ');
  const badge=school?'<div style="padding:16px;background:#eff7f3;border:1px solid #d9e9e2;border-radius:10px;margin-top:24px"><img src="https://mh4kidz.org/assets/schoolcarebridge/logo.png" alt="SchoolCareBridge" width="140" style="max-width:100%;height:auto"><p style="font-size:13px">School coordination through SchoolCareBridge. Your clinical care and documents remain in AuricWell.</p></div>':'';
  return {subject,linkUrl:url,text:`Hi ${firstName||'there'},\n\n${intro}\n\n${labels?`Your linked profiles: ${labels}.\n\n`:''}${detail}\n\n${action}: ${url}\n\n${steps}\n\n${history}\n\nAlready have a password? Sign in: ${portalUrl}\n\nChoose email updates and optional texts in Notifications.`,html:`<p>Hi ${e(firstName||'there')},</p><h2>Your care, in one place</h2><p>${e(intro)}</p>${labels?`<p>Your linked profiles: <strong>${e(labels)}</strong></p>`:''}<p>${e(detail)}</p>${portalActionHtml(action,url)}<h3>Your next steps</h3><p>${e(steps)}</p><p>${e(history)}</p><p>Already have a password? <a href="${e(portalUrl)}">Sign in to AuricWell</a>.</p><p>Choose email updates and optional texts in Notifications.</p>${badge}`};
}
