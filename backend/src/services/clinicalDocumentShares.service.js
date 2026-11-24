import {createHash,randomBytes} from 'node:crypto';
import dbPool from '../config/clinicalDatabase.js';
import directory from '../config/database.js';
import Client from '../models/Client.model.js';
import {requestFilePdf} from './clinicalDocumentFileReceipt.js';
import { clientAccess, agencyBrand } from './safetyPlans/access.js';
import { fail,positiveId } from './safetyPlans/template.js';
import { currentDocumentRecipient,documentDeliveryOptions,eligibleDocumentRecipients } from './clinicalDocumentShareRecipients.js';
import { sendDocumentDelivery } from './clinicalDocumentShareDelivery.js';
import { describeDocument,prepareFormItem,publishDocumentSource,readDocumentSource,submitDocumentSource,revokeDocumentSource,sharedFile } from './clinicalDocumentShareSources.js';
import { clientEmailContext } from './clientPortalEmail.service.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const credential = () => randomBytes(32).toString('hex');
const validCredential = value => /^[a-f0-9]{64}$/.test(value||'');
const channels = ['email','sms','portal'];
const modes = {email:['email'],sms:['sms'],both:['email','sms'],portal:['portal'],all:channels};
const maxItems = 30;
const event = (db,requestId,action,{itemId=null,deliveryId=null,actorId=null}={}) =>
  db.execute('INSERT INTO clinical_document_request_events(request_id,item_id,delivery_id,actor_user_id,action) VALUES(?,?,?,?,?)',
    [requestId,itemId,deliveryId,actorId,action]);

async function transaction(work) {
  const db=await dbPool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await db.beginTransaction();
    const result=await work(db);
    await db.commit();
    return result;
  } catch(error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

function formContext(context) {
  const {channel,audience,service,locale} = context||{};
  return {channel:channel||'office',audience:audience||'guardian',service:service||'counseling',locale:locale||'en'};
}

async function selectionFor(actor,anchorClientId,input) {
  if (!Array.isArray(input?.documents)||!input.documents.length||input.documents.length>maxItems) fail(400,'Choose between 1 and 30 items.');
  const anchorId=positiveId(anchorClientId), agencyId=positiveId(input.agencyId);
  const clients=new Map();
  const keys=new Set();
  const entries=[];
  for (const entry of input.documents) {
    if(!entry||typeof entry!=='object'||Array.isArray(entry))fail(400,'Choose a valid document.');
    const clientId=positiveId(entry.clientId||anchorId);
    if (Object.hasOwn(entry||{},'release') && entry.release!==true) fail(400,'Select a release from the catalog.');
    if ([entry.recordId,entry.foundationKey,entry.release,entry.treatmentPlanId,entry.fileId,entry.templateId,entry.assessmentKey].filter(Boolean).length!==1)
      fail(400,'Choose a single document source per item.');
    const key = clientId+':'+(entry.recordId?'form:'+entry.recordId:entry.foundationKey?'foundation:'+entry.foundationKey:
      entry.release?'release':entry.treatmentPlanId?'plan:'+entry.treatmentPlanId:entry.templateId?'template:'+entry.templateId:
      entry.assessmentKey?'assessment:'+entry.assessmentKey:'file:'+entry.fileId);
    if (keys.has(key)) fail(400,'Each item can only appear once in this selection.');
    keys.add(key);
    const documentKey=entry.release || entry.documentKey==='release-of-information' ? 'release-of-information' : undefined;
    const client=await clientAccess(actor,clientId,{write:true,documentKey});
    if (Number(client.agency_id)!==agencyId) fail(403,'Choose a chart in this agency.');
    clients.set(clientId,client);
    const selection={recordId:entry.recordId,version:entry.version,foundationKey:entry.foundationKey,release:entry.release,
      treatmentPlanId:entry.treatmentPlanId,fileId:entry.fileId,templateId:entry.templateId,assessmentKey:entry.assessmentKey,contactId:entry.contactId,action:entry.action,context:formContext(entry.context||input.context)};
    const item=await describeDocument(actor,client,selection);
    entries.push({key,item});
  }
  if (!clients.has(anchorId)) {
    const anchor=await clientAccess(actor,anchorId,{write:true});
    if (Number(anchor.agency_id)!==agencyId) fail(403,'Choose a chart in this agency.');
  }
  return {anchorId,agencyId,entries};
}

async function availableForItem({key,item}) {
  const contacts=await eligibleDocumentRecipients(item);
  return Promise.all(contacts.map(async contact=>({key,contact,options:await documentDeliveryOptions(item,contact)})));
}

export async function previewDocumentShare(actor,clientId,input) {
  const selection=await selectionFor(actor,clientId,input);
  const all=await Promise.all(selection.entries.map(availableForItem));
  const recipients=new Map();
  for (const {key,contact,options} of all.flat()) {
    const {userId,name,kind,portal}=contact;
    const emailHint=contact.email?contact.email[0]+'…@'+contact.email.split('@')[1]:null;
    const phoneHint=contact.phone?'ending in '+contact.phone.slice(-4):null;
    const previous=recipients.get(contact.key)||{key:contact.key,userId,name,kind,portal,emailHint,phoneHint,items:[]};
    previous.items.push({key,channels:options});
    recipients.set(contact.key,previous);
  }
  return {items:selection.entries.map(({key,item})=>({key,clientId:item.client_id,clientName:item.clientName,
    title:item.title,action:item.action,outcome:Boolean(item.outcome)})),recipients:[...recipients.values()]};
}

export async function documentShareRelatedClients(actor,clientId,agencyId,recipientKey) {
  const anchor=await clientAccess(actor,clientId,{write:true});
  if(Number(anchor.agency_id)!==Number(agencyId)||!/^user:[1-9][0-9]*$/.test(recipientKey||''))return {clients:[]};
  const contact=await currentDocumentRecipient({client_id:anchor.id,agency_id:anchor.agency_id,document_key:'enrollment-document'},recipientKey);
  if(contact.kind!=='guardian')return {clients:[]};
  const [rows]=await directory.execute(`SELECT c.id FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
    WHERE cg.guardian_user_id=? AND cg.access_enabled=1 AND c.agency_id=? AND c.id<>? ORDER BY c.id LIMIT 25`,
    [contact.userId,anchor.agency_id,anchor.id]);
  const clients=[];
  for (const row of rows) {
    try {
      const client=await clientAccess(actor,row.id,{write:true});
      await currentDocumentRecipient({client_id:client.id,agency_id:client.agency_id,document_key:'enrollment-document'},recipientKey);
      clients.push({id:client.id,name:client.full_name||client.initials||''});
    } catch(error) {
      if (![403,404].includes(error.status)) throw error;
    }
  }
  return {clients};
}

function sendTargets(raw,entries) {
  if (!Array.isArray(raw)||!raw.length||raw.length>12) fail(400,'Select at least one recipient.');
  const keys=new Set();
  return raw.map(target=>{
    if (!/^(user|client):[1-9][0-9]*$/.test(target?.key||'')||keys.has(target.key)) fail(400,'Choose each recipient once.');
    keys.add(target.key);
    if (!Array.isArray(target.items)) fail(400,'Choose the items for this recipient.');
    const requested=new Set(target.items);
    const selected=entries.filter(entry=>requested.has(entry.key));
    if (!selected.length||requested.size!==selected.length||!Object.hasOwn(modes,target.mode)) fail(400,'Choose the documents and delivery method for each recipient.');
    return {...target,selected};
  });
}

async function eligibleTarget(target,settings) {
  const selected=[];
  for (const {key,item} of target.selected) {
    const recipient=await currentDocumentRecipient(item,target.key);
    const available=await documentDeliveryOptions(item,recipient);
    selected.push({key,item,recipient,available});
  }
  const options=Object.fromEntries(channels.map(channel=>[channel,selected.every(item=>item.available[channel])]));
  const requested=modes[target.mode].filter(channel=>options[channel]);
  if (!requested.length||(target.mode!=='all'&&requested.length!==modes[target.mode].length))
    fail(409,'A delivery option has changed. Review the available methods for this recipient.');
  const recipient=selected[0].recipient;
  if (recipient.kind==='guardian'&&settings.authorityConfirmed!==true) fail(400,'Verify the guardian’s authority for each selected chart.');
  if (selected.some(({item})=>item.outcome)&&settings.clinicalFitConfirmed!==true) fail(400,'Confirm the assessment is appropriate for the selected client and respondent.');
  if (requested.some(channel=>channel!=='portal')&&settings.contactConfirmed!==true) fail(400,'Confirm the recipient’s contact details before sending a direct link.');
  if (target.mode==='portal'&&recipient.portal==='setup'&&settings.setupConfirmed!==true)
    fail(409,'Confirm the portal invitation for this recipient or choose a direct link.');
  return {recipient,selected,requested};
}

async function createRequest(actor,selection,target,requestKey,copyKeys) {
  return transaction(async db=>{
    const {recipient,selected,requested}=target;
    const selectionHash=digest(JSON.stringify({requested,items:selected.map(({key,item})=>[key,item.action,item.source_version,item.selection])}));
    const parameters=[actor.id,selection.anchorId,requestKey,recipient.key];
    await db.execute(`INSERT INTO clinical_document_requests
      (agency_id,issued_by_user_id,anchor_client_id,request_key,recipient_key,selection_hash) VALUES(?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE id=id`,[selection.agencyId,...parameters,selectionHash]);
    const [[request]]=await db.execute(`SELECT * FROM clinical_document_requests WHERE issued_by_user_id=? AND anchor_client_id=?
      AND request_key=? AND recipient_key=? FOR UPDATE`,parameters);
    if(request.selection_hash!==selectionHash) fail(409,'The sharing selection changed. Open a new request.');
    const [[existing]]=await db.execute('SELECT id FROM clinical_document_request_items WHERE request_id=? LIMIT 1',[request.id]);
    if (existing) return {request,items:[],deliveries:[]};
    const items=[];
    for (const {key,item,recipient:current} of selected) {
      let source={recordId:item.source_id,version:item.source_version,signerId:null};
      if (item.source_kind==='form') source=await prepareFormItem(db,actor,item,current,copyKeys.has(key));
      const [result]=await db.execute(`INSERT INTO clinical_document_request_items
        (request_id,client_id,source_kind,source_id,source_version,signer_id,action,snapshot_encrypted) VALUES(?,?,?,?,?,?,?,?)`,
        [request.id,item.client_id,item.source_kind,source.recordId,String(source.version),source.signerId,item.action,item.snapshot||null]);
      items.push({...item,id:result.insertId,source_id:source.recordId,source_version:String(source.version)});
    }
    const direct=requested.some(channel=>channel!=='portal');
    const deliveries=await createDeliveries(db,request,recipient,requested.filter(channel=>!direct||channel!=='portal'));
    await event(db,request.id,'issued',{actorId:actor.id});
    return {request,items,deliveries};
  });
}

async function createDeliveries(db,request,recipient,requested) {
  const results=[];
  for (const channel of requested) {
    const token=channel==='portal'?null:credential();
    const destination=channel==='sms'?recipient.phone:recipient.email;
    const [result]=await db.execute(`INSERT INTO clinical_document_request_deliveries
      (request_id,channel,destination_hash,token_hash,expires_at,state)
      VALUES(?,?,?,?,IF(? IS NULL,NULL,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 14 DAY)),'sending')`,
      [request.id,channel,destination?digest(destination):null,token?digest(token):null,token]);
    results.push({id:result.insertId,channel,token});
  }
  return results;
}

async function dispatch(request,recipient,deliveries,actorId,clientId) {
  for (const delivery of deliveries) {
    let outcome;
    try {
      outcome=await sendDocumentDelivery({agencyId:request.agency_id,clientId,recipient,
        channel:delivery.channel,token:delivery.token,actorId,deliveryId:delivery.id});
    } catch(error) {
      outcome={state:error.status&&error.status<500&&!error.code?.includes('uncertain')?'failed':'unconfirmed'};
    }
    await dbPool.execute(`UPDATE clinical_document_request_deliveries SET state=?,provider_reference=?,
      revoked_at=IF(?='failed',UTC_TIMESTAMP(),revoked_at) WHERE id=?`,
      [outcome.state,outcome.reference||null,outcome.state,delivery.id]);
    await event(dbPool,request.id,outcome.state,{deliveryId:delivery.id,actorId});
  }
}

export async function assertDocumentEmailRetry(deliveryId,agencyId,email) {
  const [[delivery]]=await dbPool.execute(`SELECT * FROM clinical_document_request_deliveries WHERE id=? AND channel IN ('email','portal')
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) AND (channel='portal' OR token_hash IS NOT NULL)`,[positiveId(deliveryId)]);
  if(!delivery)fail(410,'This delivery expired or was used. Open Sharing activity to issue a new link.');
  const request=await requestFor(dbPool,delivery.request_id);
  if(Number(request.agency_id)!==Number(agencyId)||request.revoked_at)fail(410,'This delivery is no longer available.');
  for(const row of await itemsFor(dbPool,request)){
    const {recipient}=await checkedItem(dbPool,request,delivery,row.id);
    if(recipient.email!==String(email||'').trim().toLowerCase()||!(await documentDeliveryOptions(row,recipient)).email)
      fail(409,'The recipient’s contact details or document preferences changed.');
  }
}

export async function recordDocumentEmailRetry(deliveryId,reference) {
  await dbPool.execute("UPDATE clinical_document_request_deliveries SET state='sent',provider_reference=? WHERE id=? AND revoked_at IS NULL",[reference||null,deliveryId]);
}

async function receipts(requestId) {
  const [rows]=await dbPool.execute(`SELECT id,channel,
    IF(state='sending' AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE),'unconfirmed',state) AS state,
    created_at,opened_at,revoked_at FROM clinical_document_request_deliveries WHERE request_id=? ORDER BY id DESC`,[requestId]);
  return rows;
}

export async function sendDocumentShare(actor,clientId,input) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.requestKey||'')) fail(400,'Open a new sharing request.');
  const selection=await selectionFor(actor,clientId,input);
  const targets=await Promise.all(sendTargets(input.recipients,selection.entries).map(target=>eligibleTarget(target,input)));
  const counts=new Map();
  for(const target of targets)for(const {key,item} of target.selected) {
    if(item.source_kind==='form'&&item.action==='complete')counts.set(key,(counts.get(key)||0)+1);
  }
  const copyKeys=new Set([...counts].filter(([,count])=>count>1).map(([key])=>key));
  const results=[];
  for (const target of targets) {
    const {request,items,deliveries}=await createRequest(actor,selection,target,input.requestKey.toLowerCase(),copyKeys);
    let published=true,publicationError=null;
    try {for (const item of items) await publishDocumentSource(item,target.recipient,request);}
    catch(error){
      published=false;
      publicationError=error.status?error.message:'The request could not be published. Open Sharing activity to review it.';
      await dbPool.execute("UPDATE clinical_document_request_deliveries SET state='failed',revoked_at=UTC_TIMESTAMP() WHERE request_id=? AND state='sending'",[request.id]);
      await event(dbPool,request.id,'publication_failed',{actorId:actor.id});
    }
    if(published)await dispatch(request,target.recipient,deliveries,actor.id,target.selected[0].item.client_id);
    results.push({id:request.id,recipient:target.recipient.name,portal:published&&target.selected.some(({recipient})=>Boolean(recipient.portal)),error:publicationError,deliveries:await receipts(request.id)});
  }
  return {requests:results};
}

async function requestFor(db,id,lock=false) {
  const [[request]]=await db.execute('SELECT * FROM clinical_document_requests WHERE id=?'+(lock?' FOR UPDATE':''),[positiveId(id)]);
  if(!request)fail(404,'This request is unavailable.');
  return request;
}

async function itemsFor(db,request) {
  const [items]=await db.execute(`SELECT i.*,r.document_key FROM clinical_document_request_items i
     LEFT JOIN clinical_form_records r ON i.source_kind='form' AND r.id=i.source_id WHERE i.request_id=? ORDER BY i.id`,[request.id]);
  return items.map(item=>({...item,agency_id:request.agency_id,document_key:item.document_key||
    (item.source_kind==='treatment_plan'?'treatment-plan':'client-document')}));
}

async function checkedItem(db,request,delivery,itemId) {
  if (request.revoked_at||delivery?.revoked_at) fail(410,'This request is no longer available.');
  const item=(await itemsFor(db,request)).find(row=>Number(row.id)===positiveId(itemId));
  if(!item)fail(404,'This item is unavailable.');
  const recipient=await currentDocumentRecipient(item,request.recipient_key);
  if (delivery) {
    const destination=delivery.channel==='sms'?recipient.phone:recipient.email;
    if (!destination||digest(destination)!==delivery.destination_hash) fail(410,'The contact details for this request changed. Ask your care team for a new link.');
  }
  return {item,recipient};
}

async function activeDelivery(db,session) {
  if (!validCredential(session)) fail(401,'Open the secure link from your message.');
  const [[delivery]]=await db.execute(`SELECT * FROM clinical_document_request_deliveries WHERE session_hash=?
    AND session_expires_at>UTC_TIMESTAMP() AND expires_at>UTC_TIMESTAMP() AND revoked_at IS NULL`,[digest(session)]);
  if(!delivery)fail(410,'This session expired. Ask your care team for a new link.');
  return delivery;
}

export async function redeemDocumentLink(token) {
  if (!validCredential(token)) fail(404,'This link is unavailable.');
  return transaction(async db=>{
    const [[initial]]=await db.execute('SELECT request_id FROM clinical_document_request_deliveries WHERE token_hash=?',[digest(token)]);
    if (!initial) fail(404,'This link is unavailable.');
    const request=await requestFor(db,initial.request_id,true);
    if (request.revoked_at) fail(410,'This request is no longer available.');
    const [[delivery]]=await db.execute(`SELECT * FROM clinical_document_request_deliveries WHERE token_hash=?
      AND expires_at>UTC_TIMESTAMP() AND revoked_at IS NULL AND opened_at IS NULL AND state<>'failed' FOR UPDATE`,[digest(token)]);
    if (!delivery) fail(410,'This link was already used or expired. Ask your care team for a new link.');
    const items=await itemsFor(db,request);
    let eligible=false;
    for (const item of items) {
      try { await checkedItem(db,request,delivery,item.id); eligible=true; break; }
      catch(error) { if (![403,404,410].includes(error.status)) throw error; }
    }
    if (!eligible) fail(410,'This request is no longer available.');
    const session=credential();
    await db.execute(`UPDATE clinical_document_request_deliveries SET token_hash=NULL,session_hash=?,opened_at=UTC_TIMESTAMP(),
      session_expires_at=LEAST(expires_at,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 MINUTE)) WHERE id=?`,[digest(session),delivery.id]);
    await event(db,request.id,'link_opened',{deliveryId:delivery.id});
    return session;
  });
}

export async function documentSession(session) {
  const delivery=await activeDelivery(dbPool,session);
  const request=await requestFor(dbPool,delivery.request_id);
  const items=[];
  let contact;
  for (const row of await itemsFor(dbPool,request)) {
    try {
      const {item,recipient}=await checkedItem(dbPool,request,delivery,row.id);
      const source=await readDocumentSource(dbPool,item,recipient,request);
      contact ||= recipient;
      const clientName=source.plan?.data.personLabel||(await Client.findById(item.client_id))?.full_name;
      items.push({id:item.id,clientName,title:source.plan?.data.documentName||source.plan?.template.title||source.document.title,
        action:item.action,completed:source.completed});
    } catch(error) {
      if (![403,404,409,410].includes(error.status)) throw error;
    }
  }
  if(!items.length)fail(410,'This request has no available items. Contact your care team.');
  const context=await clientEmailContext({agencyId:request.agency_id,clientId:request.anchor_client_id});
  return {branding:await agencyBrand(request.agency_id),items,portalUrl:context.url('login'),canSetUp:Boolean(contact?.userId)};
}

export async function readSessionItem(session,itemId) {
  const delivery=await activeDelivery(dbPool,session);
  const request=await requestFor(dbPool,delivery.request_id);
  const {item,recipient}=await checkedItem(dbPool,request,delivery,itemId);
  const source=await readDocumentSource(dbPool,item,recipient,request);
  await event(dbPool,request.id,'item_opened',{itemId:item.id,deliveryId:delivery.id});
  return {...source,action:item.action};
}

export async function sessionItemFile(session,itemId) {
  const delivery=await activeDelivery(dbPool,session);
  const request=await requestFor(dbPool,delivery.request_id);
  const {item,recipient}=await checkedItem(dbPool,request,delivery,itemId);
  if(item.source_kind!=='file')fail(404,'No file is available for this item.');
  await readDocumentSource(dbPool,item,recipient,request);
  await event(dbPool,request.id,'file_opened',{itemId:item.id,deliveryId:delivery.id});
  return requestFilePdf(item);
}

export async function submitSessionItem(session,itemId,input) {
  return transaction(async db=>{
    const first=await activeDelivery(db,session);
    const request=await requestFor(db,first.request_id,true);
    const delivery=await activeDelivery(db,session);
    const {item,recipient}=await checkedItem(db,request,delivery,itemId);
    const result=await submitDocumentSource(db,item,recipient,request,input);
    await event(db,request.id,'item_submitted',{itemId:item.id,deliveryId:delivery.id});
    return result;
  });
}

async function checkStaffRequest(actor,request) {
  const rows=await itemsFor(dbPool,request);
  for(const item of rows) {
    const client=await clientAccess(actor,item.client_id,{write:true,documentKey:item.document_key});
    if(Number(client.agency_id)!==Number(request.agency_id))fail(403,'This request no longer belongs to the agency.');
  }
  return rows;
}

export async function listDocumentRequests(actor,clientId) {
  const client=await clientAccess(actor,clientId);
  const [requests]=await dbPool.execute(`SELECT DISTINCT r.* FROM clinical_document_requests r
    JOIN clinical_document_request_items i ON i.request_id=r.id WHERE i.client_id=? AND r.agency_id=?
    ORDER BY r.id DESC LIMIT 30`,[client.id,client.agency_id]);
  const results=[];
  for (const request of requests) {
    try {
      const items=await checkStaffRequest(actor,request);
      const rows=[];
      let recipient;
      for(const item of items) {
        let completed=false;
        try {
          const contact=await currentDocumentRecipient(item,request.recipient_key);
          recipient ||= contact.name;
          const source=await readDocumentSource(dbPool,item,contact,request);
          completed=source.completed;
        } catch(error) { if (![403,404,409,410].includes(error.status)) throw error; }
        rows.push({id:item.id,clientId:item.client_id,action:item.action,completed});
      }
      results.push({id:request.id,recipient,revokedAt:request.revoked_at,createdAt:request.created_at,items:rows,deliveries:await receipts(request.id)});
    } catch(error) { if (![403,404].includes(error.status)) throw error; }
  }
  return {requests:results};
}

export async function resendDocumentRequest(actor,id,channel) {
  if(!['email','sms'].includes(channel))fail(400,'Choose email or text.');
  const request=await requestFor(dbPool,id);
  if(request.revoked_at)fail(410,'This request was revoked.');
  const rows=await checkStaffRequest(actor,request);
  let recipient;
  for(const item of rows) {
    recipient=await currentDocumentRecipient(item,request.recipient_key);
    if (!(await documentDeliveryOptions(item,recipient))[channel]) fail(409,'This recipient cannot receive that delivery method.');
  }
  for(const item of rows) await publishDocumentSource(item,recipient,request);
  const deliveries=await transaction(async db=>{
    const current=await requestFor(db,id,true);
    if(current.revoked_at)fail(410,'This request was revoked.');
    const [[pending]]=await db.execute(`SELECT id FROM clinical_document_request_deliveries
      WHERE request_id=? AND channel=? AND revoked_at IS NULL AND state='sending' AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) LIMIT 1`,[id,channel]);
    if(pending)fail(409,'Delivery is still unconfirmed. Check message activity before trying again.');
    await db.execute('UPDATE clinical_document_request_deliveries SET revoked_at=UTC_TIMESTAMP() WHERE request_id=? AND channel=? AND revoked_at IS NULL',[id,channel]);
    return createDeliveries(db,current,recipient,[channel]);
  });
  await dispatch(request,recipient,deliveries,actor.id,rows[0].client_id);
  return {id,deliveries:await receipts(id)};
}

export async function revokeDocumentRequest(actor,id) {
  const request=await requestFor(dbPool,id);
  const rows=await checkStaffRequest(actor,request);
  await transaction(async db=>{
    await requestFor(db,id,true);
    await db.execute('UPDATE clinical_document_requests SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE id=?',[id]);
    await db.execute(`UPDATE clinical_form_signers s JOIN clinical_document_request_items i ON i.signer_id=s.id AND i.source_kind='form'
      SET s.revoked_at=COALESCE(s.revoked_at,UTC_TIMESTAMP()) WHERE i.request_id=? AND s.signed_at IS NULL AND i.completed_version IS NULL`,[id]);
    await event(db,id,'revoked',{actorId:actor.id});
  });
  for(const item of rows) await revokeDocumentSource(item);
  return {revoked:true};
}

function portalUser(user) {
  if(!['client','client_guardian'].includes(user?.role)||user.demoMode||user.switchedFromUserId)fail(403,'Use your own portal account.');
}

async function portalFileContext(db,user,id,{lock=false}={}) {
  portalUser(user);
  const [[row]]=await db.execute("SELECT request_id FROM clinical_document_request_items WHERE id=? AND source_kind='file'",[positiveId(id)]);
  if(!row)fail(404,'This document is unavailable.');
  const request=await requestFor(db,row.request_id,lock);
  if(request.recipient_key!=='user:'+user.id)fail(404,'This document is unavailable.');
  const scoped=await checkedItem(db,request,null,id);
  if(!scoped.recipient.portal)fail(404,'This document is unavailable in the portal.');
  return {...scoped,request};
}

export async function portalRequestFiles(user,clientId) {
  portalUser(user);
  const [rows]=await dbPool.execute(`SELECT i.id FROM clinical_document_request_items i JOIN clinical_document_requests r ON r.id=i.request_id
    WHERE r.recipient_key=? AND r.revoked_at IS NULL AND i.client_id=? AND i.source_kind='file' ORDER BY i.id DESC LIMIT 100`,['user:'+user.id,positiveId(clientId)]);
  const files=[];
  for (const row of rows) {
    try {
      const {item,recipient,request}=await portalFileContext(dbPool,user,row.id);
      const file=await readDocumentSource(dbPool,item,recipient,request);
      files.push({id:item.id,action:item.action,...file});
    } catch(error) { if (![403,404,409,410].includes(error.status)) throw error; }
  }
  return {files};
}

export async function portalRequestFile(user,id) {
  const {item,recipient,request}=await portalFileContext(dbPool,user,id);
  await readDocumentSource(dbPool,item,recipient,request);
  await event(dbPool,request.id,'file_opened',{itemId:item.id,actorId:user.id});
  return requestFilePdf(item);
}

export async function submitPortalFile(user,id,input) {
  return transaction(async db=>{
    const {request,item,recipient}=await portalFileContext(db,user,id,{lock:true});
    const result=await submitDocumentSource(db,item,recipient,request,input);
    if(!item.completed_version) await event(db,request.id,'item_submitted',{itemId:item.id,actorId:user.id});
    return result;
  });
}

export async function listFiledRequestFiles(actor,clientId) {
  const client=await clientAccess(actor,clientId);
  const [rows]=await dbPool.execute(`SELECT i.*,r.agency_id,r.recipient_key FROM clinical_document_request_items i
    JOIN clinical_document_requests r ON r.id=i.request_id WHERE i.client_id=? AND r.agency_id=?
    AND i.source_kind='file' AND i.completed_version IS NOT NULL ORDER BY i.completed_at DESC LIMIT 100`,[client.id,client.agency_id]);
  const files=[];
  for(const row of rows) {
    try {
      const file=await sharedFile(row);
      files.push({id:row.id,title:file.title||'Signed document',category:'Signed document',signedAt:row.completed_at,source:'request-file'});
    } catch(error) { if(error.status!==404)throw error; }
  }
  return files;
}

export async function readFiledRequestFile(actor,clientId,itemId) {
  const client=await clientAccess(actor,clientId);
  const [[item]]=await dbPool.execute(`SELECT i.*,r.agency_id FROM clinical_document_request_items i
    JOIN clinical_document_requests r ON r.id=i.request_id WHERE i.id=? AND i.client_id=? AND r.agency_id=?
    AND i.source_kind='file' AND i.completed_version IS NOT NULL`,[positiveId(itemId),client.id,client.agency_id]);
  if(!item)fail(404,'This signed document is unavailable.');
  await readDocumentSource(dbPool,item,null,null);
  await event(dbPool,item.request_id,'signed_file_viewed',{itemId:item.id,actorId:actor.id});
  return requestFilePdf(item);
}
