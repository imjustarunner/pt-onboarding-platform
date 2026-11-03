import crypto from 'node:crypto';
import pool from '../config/database.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';
import { decodePaymentCard } from '../models/GuardianPaymentCard.model.js';
import { linkAllowsBilling, billingError, auditBilling } from './familyBillingPolicy.service.js';
import { clientPortalAppUrl } from './clientPortalContext.service.js';

export async function clientPaymentSetup(agencyId,clientId,db=pool){
 const [[client]]=await db.execute('SELECT c.id,c.full_name,c.initials,c.agency_id,c.client_type,c.primary_insurer_name,c.date_of_birth,a.name AS agency_name,a.slug,a.portal_url,a.custom_domain,a.feature_flags FROM clients c JOIN agencies a ON a.id=c.agency_id WHERE c.id=? AND c.agency_id=?',[clientId,agencyId]);
 if(!client)throw billingError(404,'Client not found');
 const insurance=await readClientInsurance(clientId,agencyId,db);
 const medicaid=hasMedicaidCoverage(insurance)||hasMedicaidCoverage({primary:{insurerName:client.primary_insurer_name}});
 const [links]=await db.execute(`SELECT cg.*,u.first_name,u.last_name,u.email,c.date_of_birth,i.status AS independence_status,g.scopes_json AS support_scopes,p.payment_card_id,p.status AS payer_status
  FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id JOIN clients c ON c.id=cg.client_id
  LEFT JOIN client_portal_independence i ON i.client_id=c.id
  LEFT JOIN client_support_grants g ON g.client_id=c.id AND g.agency_id=c.agency_id AND g.helper_user_id=cg.guardian_user_id AND g.revoked_at IS NULL
  LEFT JOIN client_billing_payers p ON p.agency_id=c.agency_id AND p.client_id=c.id AND p.guardian_user_id=cg.guardian_user_id AND p.status='active'
  WHERE c.id=? AND c.agency_id=? AND u.is_active=1`,[clientId,agencyId]);
 const eligible=links.filter(linkAllowsBilling),payers=eligible.filter(row=>row.payer_status==='active');
 const [[merchant]]=await db.execute('SELECT stripe_connect_account_id,stripe_connect_status FROM agency_billing_accounts WHERE agency_id=?',[agencyId]);
 let cardOnFile=false;
 for(const payer of payers){
  if(!payer.payment_card_id)continue;
  const [[raw]]=await db.execute('SELECT * FROM guardian_payment_cards WHERE id=? AND agency_id=? AND guardian_user_id=? AND is_active=1',[payer.payment_card_id,agencyId,payer.guardian_user_id]);
  const card=decodePaymentCard(raw);
  if(card?.stripe_payment_method_id&&card.connected_account_id===merchant?.stripe_connect_account_id&&Number(card.card_exp_year)*12+Number(card.card_exp_month)>=new Date().getUTCFullYear()*12+new Date().getUTCMonth()+1)cardOnFile=true;
 }
 const coverageRecorded=!!(insurance?.primary?.insurerName||client.primary_insurer_name);
 const needed=coverageRecorded&&!medicaid&&!cardOnFile;
 const portal={id:Number(agencyId),slug:client.slug,portal_url:client.portal_url,custom_domain:client.custom_domain,feature_flags:client.feature_flags,clinical_portal:['school','clinical','mental_health'].includes(client.client_type)};
 const url=needed?clientPortalAppUrl(portal,`guardian?panel=payment_methods&clientId=${Number(clientId)}`):null;
 return {client,insurance,eligible,payers,summary:{medicaid,cardOnFile,paymentMethodNeeded:needed,secureCollectionAvailable:merchant?.stripe_connect_status==='active'&&!!merchant.stripe_connect_account_id,responsibleParties:payers.map(row=>({name:[row.first_name,row.last_name].filter(Boolean).join(' ')})),paymentUrl:url}};
}

export function paymentSetupEmail({clientName,url,familyNotified=false,provider=false}){
 const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const heading=provider?'Please share this payment setup QR code':'Please complete your payment method';
 const intro=provider?`Please provide this QR code to the responsible payer for ${clientName}. We do not have a payment method assigned to this client.`:'Please sign in to your secure account and add a payment method. Card information is collected securely through Stripe.';
 const prior=provider&&familyNotified?'The responsible payer has been notified by email and in the app, and payment setup remains incomplete. ':'';
 const action='In order to prevent interruption of services, please complete payment setup. You may also sign in to your account and open Payment methods. Contact Billing if you need help or wish to discuss an arrangement.';
 return {subject:provider?'Billing follow-up: payment setup QR code':'Action requested: complete payment setup',text:`${heading}\n\n${intro}\n\n${prior}${action}\n\n${url}`,html:`<div style="font-family:Arial,sans-serif;color:#173249;max-width:600px;margin:auto"><div style="background:#132d46;color:white;padding:24px;border-radius:14px 14px 0 0"><strong style="font-size:24px;letter-spacing:1px">fundthred</strong><div>Secure payment setup</div></div><div style="padding:28px;border:1px solid #dce6ed"><h2>${escape(heading)}</h2><p>${escape(intro)}</p><p>${escape(prior+action)}</p><div style="text-align:center;padding:20px;background:#f0f8f7;border-radius:14px"><img src="cid:payment-setup-qr" width="240" height="240" alt="Scan to open secure payment setup" /><p><strong>SCAN · SIGN IN · ADD YOUR CARD</strong></p></div><p style="text-align:center"><a href="${escape(url)}" style="display:inline-block;background:#147d78;color:white;padding:14px 24px;border-radius:8px;text-decoration:none">Open secure payment setup</a></p><p style="font-size:13px">Your card details stay with Stripe. This request does not charge your card or authorize recurring payments.</p></div></div>`};
}
export const paymentSetupReviewHash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function auditPaymentSetup({agencyId,clientId,userId,action,objectId},db=pool){return auditBilling({agencyId,clientId,userId,action,objectId},db);}
