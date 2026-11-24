import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import config from '../config/config.js';
import HiringReferenceRequest from '../models/HiringReferenceRequest.model.js';
import { verifyRecaptchaV3 } from './captcha.service.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import { scanPublicSupportContent } from './publicAgencySupport.service.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { recordTicketAssignment } from './ticketAssignment.service.js';
import { PLOTLINE_SUPPORT_SOURCE } from '../utils/plotlineSupport.js';

const fail = (message,status=400) => Object.assign(new Error(message),{status});
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value)>0;
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || '');
const defaults = {
  db:pool, production:config.nodeEnv==='production', recaptcha:config.recaptcha || {},
  reference:token=>HiringReferenceRequest.findByPublicLinkToken(token),
  captcha:verifyRecaptchaV3, encrypt:prepareEncryptedTicketText, assignment:recordTicketAssignment
};
export function createPlotlineSupportService(overrides={}) {
  const d={...defaults,...overrides};
  async function product(db=d.db,lock=false) {
    const [[p]]=await db.execute(`SELECT p.* FROM platform_support_products p JOIN agencies a ON a.id=p.operator_agency_id
      WHERE p.product_key='plotline' AND p.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0${lock?' FOR UPDATE':''}`);
    if(!p||!positiveId(p.operator_agency_id))throw fail('Plotline support is temporarily unavailable. Please try again later.',503);
    const configured=p.default_owner_user_id!=null;
    const [people]=await db.execute(`SELECT id FROM users WHERE is_active=1 AND COALESCE(is_archived,0)=0
      AND UPPER(COALESCE(status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
      AND (LOWER(role)='super_admin' OR has_platform_support=1)
      AND ${configured?'id=?':"LOWER(TRIM(first_name))='michael' AND LOWER(TRIM(last_name))='mendez'"}`,configured?[p.default_owner_user_id]:[]);
    if(people.length!==1)throw fail('The Plotline support owner needs setup. Please try again later.',503);
    return {...p,ownerId:Number(people[0].id)};
  }
  async function context(token) {
    if(!token)return null;
    if(!/^[a-f0-9]{64}$/i.test(token))throw fail('This support link is unavailable.',404);
    const row=await d.reference(token);
    if(!row||!['sent','completed','cancelled'].includes(row.status)||(row.status==='cancelled'&&!row.declined))throw fail('This support link is unavailable.',404);
    if(!(new Date(row.token_expires_at).getTime()>Date.now()))throw fail('This support link has expired. Visit plotlinepo.com/support to contact us.',410);
    return row;
  }
  async function publicMeta(token) {
    const reference=await context(token),p=await product();
    const contact=reference?.responses_json || reference?.referenceContact || {};
    return {productName:p.product_name,operatorName:p.operator_name,
      contact:{name:contact?.referenceName||reference?.reference_name||'',email:contact?.referenceEmail||reference?.reference_email||''},
      recaptchaRequired:!reference&&d.production,recaptchaSiteKey:!reference?d.recaptcha.siteKey||null:null,
      recaptchaUseEnterprise:!!d.recaptcha.enterpriseApiKey,
      subject:reference?'Help with a Plotline reference request':'Help with Plotline'};
  }
  async function createTicket(token,body={},req) {
    if(String(body.website||'').trim())return {ok:true,suppressed:true};
    const reference=await context(token);
    const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),subject=String(body.subject||'').trim(),message=String(body.message||'').trim();
    if(name.length<2||name.length>120||email.length>254||!/^[^\s@<>;,\r\n]+@[^\s@<>;,\r\n]+\.[^\s@<>;,\r\n]+$/.test(email))throw fail('Please check your name and email address.');
    if(subject.length<3||subject.length>140||message.length<10||message.length>4000||!uuid(body.submissionKey))throw fail('Add a subject and a message between 10 and 4,000 characters.');
    if(scanPublicSupportContent(message).block)throw fail('Remove Social Security or payment card numbers before sending.');
    if(!reference&&d.production){
      if(!d.recaptcha.siteKey||!body.captchaToken)throw fail('Human verification is temporarily unavailable. Please try again.');
      const verified=await d.captcha({token:body.captchaToken,expectedAction:'plotline_support',remoteip:getClientIpAddress(req),userAgent:req?.get?.('user-agent')});
      if(!verified.ok||(verified.score!=null&&verified.score<Number(d.recaptcha.minScore??0.3)))throw fail('Please complete the human verification and try again.');
    }
    const digest=createHash('sha256').update(JSON.stringify([reference?.id||null,name,email,subject,message])).digest('hex');
    const enc=d.encrypt(`${message}\n\nFrom: ${name}\nEmail: ${email}\nProduct: Plotline${reference?`\nReference request: #${reference.id}\nOriginating company: #${reference.agency_id}`:''}`);
    if(d.production&&!enc.encrypted)throw fail('Your message could not be saved securely. Please try again later.',503);
    const db=await d.db.getConnection();
    try{
      await db.beginTransaction();
      const p=await product(db,true);
      await db.execute("INSERT INTO platform_support_submissions(product_key,reference_request_id,source_agency_id,submission_key,payload_fingerprint) VALUES('plotline',?,?,?,?)",[reference?.id||null,reference?.agency_id||null,body.submissionKey,digest]);
      if(reference){
        const [[bound]]=await db.execute(`SELECT id FROM hiring_reference_requests WHERE id=? AND agency_id=? AND token_expires_at>NOW()
          AND (status IN ('sent','completed') OR (status='cancelled' AND JSON_EXTRACT(responses_json,'$.declined')=CAST('true' AS JSON))) FOR UPDATE`,[reference.id,reference.agency_id]);
        if(!bound)throw fail('This support link is no longer available.',410);
        const [[count]]=await db.execute('SELECT COUNT(*) AS total FROM platform_support_submissions WHERE reference_request_id=? AND created_at>CURRENT_TIMESTAMP-INTERVAL 1 DAY',[reference.id]);
        if(Number(count.total)>5)throw fail('Please wait before sending another question about this request.',429);
      }
      const [created]=await db.execute(`INSERT INTO support_tickets(school_organization_id,client_id,created_by_user_id,created_by_source_key,agency_id,
        subject,question,status,source_channel,source_email_from,topic,target_scope,source_website_slug,claimed_by_user_id,claimed_at,
        question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id)
        VALUES(?,NULL,NULL,?,?,?,?,'open','public_web',?,'general','platform','plotline',?,CURRENT_TIMESTAMP,?,?,?,?)`,
        [p.operator_agency_id,PLOTLINE_SUPPORT_SOURCE,p.operator_agency_id,`Plotline · ${subject}`,enc.plain,email,p.ownerId,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
      const id=created.insertId;
      await db.execute("UPDATE platform_support_submissions SET support_ticket_id=? WHERE product_key='plotline' AND submission_key=?",[id,body.submissionKey]);
      await d.assignment({ticketId:id,agencyId:p.operator_agency_id,actorUserId:null,assigneeUserId:p.ownerId,kind:'routed',reason:`${p.product_name} platform support · ${p.operator_name}`},db);
      await db.execute(`INSERT INTO notifications(type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source,audience_json)
        VALUES('support_ticket_created','info','Plotline support ticket assigned to you','Open the platform ticket to review and reply.',?,?,'support_ticket',?,NULL,'Plotline support form',?)`,[p.ownerId,p.operator_agency_id,id,JSON.stringify({productKey:'plotline',targetScope:'platform'})]);
      await db.commit();return {ok:true,ticketId:id};
    }catch(error){
      await db.rollback();
      if(error.code==='ER_DUP_ENTRY'){
        const [[prior]]=await d.db.execute("SELECT support_ticket_id,payload_fingerprint FROM platform_support_submissions WHERE product_key='plotline' AND submission_key=?",[body.submissionKey]);
        if(prior?.support_ticket_id&&prior.payload_fingerprint===digest)return {ok:true,ticketId:prior.support_ticket_id};
        throw fail('This submission changed. Refresh the form before sending again.',409);
      }
      throw error;
    }finally{db.release();}
  }
  return {publicMeta,createTicket};
}
export default createPlotlineSupportService();
