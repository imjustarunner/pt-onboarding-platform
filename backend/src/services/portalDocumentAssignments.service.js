import {createHash} from 'node:crypto';
import pool from '../config/clinicalDatabase.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import {clientAccess,recipientAccess} from './safetyPlans/access.js';
import {savePlan,addSigner} from './safetyPlans/records.js';
import {positiveId,fail} from './safetyPlans/template.js';
import { isStandaloneEnrollmentForm } from './familySharingCatalog.js';
import {queueClinicalFormNotification} from './safetyPlans/notificationQueue.js';

const editable=new Set(['safety-plan','release-of-information','client-information-update','enrollment-document']);
const defaults={channel:'office',audience:'guardian',service:'counseling',locale:'en'};

export async function assignPortalDocuments(user,clientId,input={}) {
  const releaseOnly = input.documents?.length > 0 && Array.isArray(input.documents) && input.documents.every(item => item?.release === true);
  const client=await clientAccess(user,positiveId(clientId),{write:true,...(releaseOnly?{documentKey:'release-of-information'}:{})});
  if(Number(input.agencyId)!==Number(client.agency_id))fail(403,'Choose a client in this organization.');
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.requestKey||''))fail(400,'Reload the assignment dialog before sharing.');
  if(!['client','guardian'].includes(input.recipient?.kind))fail(400,'Choose a client or guardian portal.');
  const recipient={id:positiveId(input.recipient?.id),kind:input.recipient.kind};
  if(recipient.kind==='guardian'&&input.authorityConfirmed!==true)fail(400,'Confirm this guardian is authorized to complete these documents.');
  if(!['complete','sign'].includes(input.action))fail(400,'Choose whether to complete forms or review and sign.');
  if(!Array.isArray(input.documents)||!input.documents.length||input.documents.length>30)fail(400,'Select between 1 and 30 documents.');
  const documents=input.documents.map(item=>{
    if(!item || [!!item.recordId, !!item.foundationKey, item.release === true].filter(Boolean).length !== 1)fail(400,'Choose a saved document, release, or current enrollment form.');
    if(item.release===true)return {release:true,contactId:item.contactId ? positiveId(item.contactId) : null};
    if(item.recordId)return {recordId:positiveId(item.recordId),version:positiveId(item.version)};
    if(typeof item.foundationKey!=='string'||!item.foundationKey.trim()||item.foundationKey.length>100)fail(400,'Choose an enrollment form from the catalog.');
    if(!isStandaloneEnrollmentForm(item.foundationKey))fail(400,'This form is available in its dedicated workflow. Choose a current standalone form.');
    return {foundationKey:item.foundationKey};
  });
  const keys=documents.map(d=>d.recordId?'record:'+d.recordId:d.release?'release':'source:'+d.foundationKey);
  if(new Set(keys).size!==keys.length)fail(400,'Select each document once.');
  const context=Object.fromEntries(Object.keys(defaults).map(k=>[k,input.context?.[k]||defaults[k]]));
  const requestHash=createHash('sha256').update(JSON.stringify({documents,recipient,action:input.action,context,planDate:input.planDate||null})).digest('hex');
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    const parameters=[client.agency_id,Number(clientId),Number(user.id),input.requestKey.toLowerCase()];
    await db.execute('INSERT INTO clinical_form_assignment_batches(agency_id,client_id,actor_user_id,request_key,request_hash) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE request_key=VALUES(request_key)',[...parameters,requestHash]);
    const [[batch]]=await db.execute('SELECT request_hash,result_json FROM clinical_form_assignment_batches WHERE agency_id=? AND client_id=? AND actor_user_id=? AND request_key=? FOR UPDATE',parameters);
    if(batch.request_hash!==requestHash)fail(409,'This assignment changed. Close the dialog and start a new selection.');
    if(batch.result_json){await db.commit();return typeof batch.result_json==='string'?JSON.parse(batch.result_json):batch.result_json;}
    const assigned=[];let alreadyAssignedCount=0;
    for(const item of documents) {
      let reference,documentKey;
      if(item.recordId) {
        const [[row]]=await db.execute('SELECT * FROM clinical_form_records WHERE id=? FOR UPDATE',[item.recordId]);
        if(!row)fail(404,'A selected document is no longer available.');
        if(Number(row.client_id)!==Number(clientId)||Number(row.agency_id)!==Number(client.agency_id))fail(403,'A selected document belongs to a different client or organization.');
        if(Number(row.current_version)!==item.version)fail(409,'A selected document changed. Refresh the document list before sharing.');
        if(row.document_key==='cssrs-screener')fail(400,'This screener is available for staff use only.');
        documentKey=row.document_key;reference={id:row.id,version:row.current_version};
      } else {
        documentKey=item.release?'release-of-information':'enrollment-document';
        const data={personLabel:client.full_name||client.initials||'',planDate:input.planDate||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date())};
        if(item.contactId){
          const contact=await ClientContactAffiliation.findById(item.contactId);
          if(!contact || Number(contact.client_id)!==Number(clientId) || Number(contact.agency_id)!==Number(client.agency_id)
            || !Number(contact.is_active) || !Number(contact.contact_is_active))fail(404,'Choose an active contact on this client’s record.');
          Object.assign(data,{recipientName:contact.contact_full_name,recipientPhone:contact.contact_phone || '',recipientEmail:contact.contact_email || ''});
        }
        reference=await savePlan(user,{agencyId:client.agency_id,clientId:Number(clientId),documentKey,foundationKey:item.foundationKey,enrollmentContext:context,data},null,{database:db,returnReference:true});
      }
      await recipientAccess({client_id:Number(clientId),agency_id:client.agency_id,document_key:documentKey},recipient.id,recipient.kind);
      const [signers]=await db.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',[reference.id,reference.version]);
      const existing=signers.find(s=>s.signer_kind===recipient.kind&&Number(s.recipient_user_id)===recipient.id&&s.portal_shared_at&&!s.revoked_at);
      if(existing){alreadyAssignedCount++;continue;}
      await addSigner(user,reference.id,{version:reference.version,kind:recipient.kind,userId:recipient.id,authorityConfirmed:input.authorityConfirmed===true,
        copyOnly:documentKey==='attendance-verification',allowCompletion:(item.release||input.action==='complete')&&editable.has(documentKey)},{database:db,returnReference:true,notify:false});
      assigned.push(reference);
    }
    if(assigned.length)await queueClinicalFormNotification(db,client.agency_id,recipient.id);
    const result={assignedCount:assigned.length,alreadyAssignedCount,documents:assigned,recipientId:recipient.id,notifications:assigned.length?'grouped':'none'};
    await db.execute('UPDATE clinical_form_assignment_batches SET result_json=? WHERE agency_id=? AND client_id=? AND actor_user_id=? AND request_key=?',[JSON.stringify(result),...parameters]);
    await db.commit();return result;
  } catch(error){await db.rollback();throw error;}finally{db.release();}
}
