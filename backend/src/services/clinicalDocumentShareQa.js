import directory from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import {isAuricwellQaAgency} from '../utils/auricwellQaPolicy.js';
import {isQaEmailAgency,QA_EMAIL_INBOX} from '../utils/qaEmailPolicy.js';

const example = address => /^[^@\s]+@example\.com$/i.test(address||'');
const qaError = (status,message) => Object.assign(new Error(message),{status});

export async function documentEmailPolicy({agencyId,clientId,recipient},db=directory) {
  if(!isQaEmailAgency(agencyId)&&!example(recipient.email))return {allowed:true,testInbox:false};
  if(!example(recipient.email))return {allowed:false,testInbox:false};
  const [[chart]]=await db.execute(`SELECT a.id,a.slug,a.feature_flags,c.is_demo FROM clients c
    JOIN agencies a ON a.id=c.agency_id WHERE c.id=? AND c.agency_id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,
    [clientId,agencyId]);
  if(!isAuricwellQaAgency(chart)||Number(chart.is_demo)!==1)return {allowed:false,testInbox:false};
  if(recipient.userId){
    const [[account]]=await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_demo=1 AND LOWER(u.email)=? LIMIT 1`,
      [recipient.userId,agencyId,String(recipient.email).toLowerCase()]);
    if(!account)return {allowed:false,testInbox:false};
  }
  return {allowed:true,testInbox:true};
}

export async function qaDocumentFormsMailbox(agencyId) {
  const [[agency]]=await directory.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[agencyId]);
  if(!isAuricwellQaAgency(agency))throw qaError(403,'Synthetic document email is restricted to the AuricWell QA agency.');
  const domain='itsco.health';
  const expectedFrom='forms@'+domain;
  const source=await EmailSenderIdentity.findByAgencyAndIdentityKey(2,'forms');
  if(Number(source?.agency_id)!==2||Number(source?.is_active)!==1||source?.from_email?.toLowerCase()!==expectedFrom)
    throw qaError(503,'The managed Forms sender must be available before sending a QA document.');
  const identityKey='qa_clinical_document_forms';
  let forms=await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId,identityKey,{includeInactive:true});
  if(!forms)forms=await EmailSenderIdentity.create({agencyId,identityKey,displayName:'AuricWell Forms',
    fromEmail:expectedFrom,replyTo:QA_EMAIL_INBOX,inboundAddresses:[],isActive:true});
  if(Number(forms?.agency_id)!==Number(agencyId)||Number(forms?.is_active)!==1||forms?.from_email?.toLowerCase()!==expectedFrom)
    throw qaError(503,'Review the AuricWell QA Forms sender configuration.');
  return {forms,domain};
}
