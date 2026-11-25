import pool from '../config/database.js';
import { providerBillingNpi } from './providerBillingNpi.service.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { resolveNoteDocumentationPolicy, loadPayerPolicy, evaluateSupervisedBilling } from './supervisedBillingPolicy.service.js';
import { determineLicenseStatus } from '../utils/credentialNormalization.js';
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
export async function configuredProviderTaxonomy({agencyId,userId},db=pool){
 const keys=['provider_identity_taxonomy_code','taxonomy_code','taxonomy'];
 const [rows]=await db.execute(`SELECT d.field_key,d.agency_id,v.value FROM user_info_values v
  JOIN user_info_field_definitions d ON d.id=v.field_definition_id
  JOIN user_agencies ua ON ua.user_id=v.user_id AND ua.agency_id=? AND ua.is_active=1
  WHERE v.user_id=? AND (d.agency_id=? OR d.agency_id IS NULL)
  AND d.field_key IN ('provider_identity_taxonomy_code','taxonomy_code','taxonomy')`,[agencyId,userId,agencyId]);
 const values=rows.filter(r=>keys.includes(r.field_key)&&String(r.value||'').trim()).sort((a,b)=>Number(Number(b.agency_id)===Number(agencyId))-Number(Number(a.agency_id)===Number(agencyId))||keys.indexOf(a.field_key)-keys.indexOf(b.field_key));
 const selected=values[0];if(!selected)return null;
 const value=String(selected.value).trim().toUpperCase();
 if(!/^[A-Z0-9]{10}$/.test(value)||values.some(r=>String(r.agency_id)===String(selected.agency_id)&&r.field_key===selected.field_key&&String(r.value).trim().toUpperCase()!==value))throw Object.assign(new Error('Review the rendering provider’s saved taxonomy; it is invalid or conflicting.'),{status:409});
 return value;
}
export async function claimBillingIdentity({claim,note,session},overrides={}){
 const d={database:pool,npi:providerBillingNpi,taxonomy:configuredProviderTaxonomy,insurance:readClientInsurance,policy:resolveNoteDocumentationPolicy,payer:loadPayerPolicy,evaluate:evaluateSupervisedBilling,...overrides};
 const agencyId=Number(claim.agency_id),providerId=Number(session?.provider_user_id||session?.rendering_provider_user_id);
 if(!providerId||!note)return {providerUserId:providerId||null,warnings:['The encounter provider is unavailable; review provider setup before submission.']};
 const insurance=await d.insurance(claim.client_id,agencyId),coverage=Number(claim.payer_sequence||1)===2?insurance?.secondary:insurance?.primary;
 const policy=await d.policy(note);
 const [users]=await d.database.execute(`SELECT u.id,u.first_name,u.last_name,u.credential,u.role,u.title FROM users u
  JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
  WHERE u.id IN (?,?) AND u.is_active=1 AND COALESCE(u.is_archived,0)=0`,[agencyId,providerId,policy.supervisorUserId||0]);
 const person=async id=>{const user=users.find(u=>Number(u.id)===Number(id));return user?{id:Number(user.id),firstName:user.first_name,lastName:user.last_name,npi:await d.npi({agencyId,userId:Number(id)}),profileLicenseStatus:determineLicenseStatus(user).status}:null;};
 const evaluated=d.evaluate({policy,payerPolicy:await d.payer(agencyId,coverage?.payerId,coverage?.planType),dateOfService:claim.date_of_service,serviceProvider:await person(providerId),supervisor:await person(policy.supervisorUserId),note});
 const rendering=evaluated.renderingProvider;
 // An unverified supervised mapping must remain unresolved, rather than guessing
 // that the treating or supervising provider belongs in the rendering field.
 const verified=policy.billingMode!=='billing_supervisor'||evaluated.rule?.mappingVerified;
 return {providerUserId:providerId,billingProviderUserId:parse(claim.metadata_json).billingUserId||providerId,payerId:coverage?.payerId||null,
  renderingNpi:verified&&/^\d{10}$/.test(rendering?.npi||'')?rendering.npi:null,taxonomyCode:verified&&rendering?.id?await d.taxonomy({agencyId,userId:rendering.id}):null,
  warnings:verified?[]:['Verify the payer’s supervised-provider mapping before a rendering NPI can be filled automatically.']};
}
