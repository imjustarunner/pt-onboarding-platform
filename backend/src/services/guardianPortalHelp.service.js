import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Notification from '../models/Notification.model.js';
import StorageService from './storage.service.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { assignTechnologyTicket } from './technologySupport.service.js';
import {encryptGuardianScreenshot} from './guardianPortalScreenshotEncryption.service.js';

const error = (status, message) => Object.assign(new Error(message), { status });
const defaults = {
  database: pool,
  links: userId => ClientGuardian.listClientsForGuardian({guardianUserId:userId}),
  encrypt: prepareEncryptedTicketText,
  assign: assignTechnologyTicket,
  bucket: () => StorageService.getGCSBucket(),
  image: buffer => sharp(buffer,{limitInputPixels:16_000_000}).rotate().png().toBuffer(),
  notify: data => Notification.create(data)
};

/** Private, authenticated portal feedback. Never sends an email or changes consent. */
export async function submitGuardianPortalHelp({user,agencyId,clientId,question,requestId,files=[],preview=false}, dependencies={}) {
  const d={...defaults,...dependencies};
  if(preview||!['client_guardian','client'].includes(user?.role))throw error(403,'Sign in to your own portal account to report an issue.');
  agencyId=Number(agencyId);clientId=Number(clientId);question=String(question||'').trim();
  if(!Number.isSafeInteger(agencyId)||agencyId<1||!Number.isSafeInteger(clientId)||clientId<1)throw error(400,'Select the profile where this happened.');
  if(question.length<5||question.length>10000||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId||''))throw error(400,'Describe what happened before submitting.');
  if(files.length>3||files.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.mimetype)||!Buffer.isBuffer(file.buffer)||file.buffer.length>8*1024*1024))throw error(400,'Choose up to three PNG, JPG or WebP screenshots, 8 MB each.');
  const link=(await d.links(user.id)).find(row=>Number(row.client_id)===clientId&&Number(row.agency_id)===agencyId&&row.access_enabled!==0&&row.access_enabled!==false&&!ClientGuardian.isNoView(row.permissions_json));
  if(!link)throw error(403,'This profile is not available to your account.');
  const enc=d.encrypt(question);
  if(!enc.encrypted)throw error(503,'Secure ticket storage is unavailable. Please try again later.');
  let db,bucket,committed=false;const paths=[];
  try {
    db=await d.database.getConnection();await db.beginTransaction();
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[user.id]);
    const [[prior]]=await db.execute('SELECT ticket_id,agency_id,client_id FROM guardian_portal_help_requests WHERE guardian_user_id=? AND request_id=?',[user.id,requestId]);
    if(prior){
      if(Number(prior.agency_id)!==agencyId||Number(prior.client_id)!==clientId)throw error(409,'This report was already submitted for another profile. Start a new report.');
      await db.rollback();return {ticketId:prior.ticket_id,alreadySubmitted:true};
    }
    const [created]=await db.execute(`INSERT INTO support_tickets
      (agency_id,school_organization_id,client_id,created_by_user_id,created_by_source_key,subject,question,
       question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,status,topic,priority)
      VALUES (?,?,?,?,'guardian_portal','AuricWell portal issue',?,?,?,?,?,'open','technology','medium')`,
      [agencyId,Number(link.organization_id)||agencyId,clientId,user.id,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
    const ticketId=created.insertId;
    // Fail closed instead of dropping a report into an unowned queue.
    const ownerId=await d.assign({ticketId,agencyId},db);
    await db.execute(`INSERT INTO support_ticket_messages
      (ticket_id,parent_id,author_user_id,author_role,body,is_internal,body_ciphertext,body_iv,body_auth_tag,encryption_key_id)
      VALUES (?,NULL,?,'client_guardian',?,0,?,?,?,?)`,[ticketId,user.id,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
    if(files.length)bucket=await d.bucket();
    for(const file of files){
      let buffer;
      try{buffer=await d.image(file.buffer);}catch{throw error(400,'One screenshot could not be read. Choose a PNG, JPG or WebP image.');}
      if(buffer.length>12*1024*1024)throw error(400,'One screenshot is too large. Please crop or resize it.');
      const path=`support-tickets/${agencyId}/${ticketId}/${randomUUID()}.guardian.enc`;paths.push(path);
      const encryptedImage=encryptGuardianScreenshot(buffer,{ticketId});
      await bucket.file(path).save(encryptedImage,{resumable:false,metadata:{contentType:'application/octet-stream',cacheControl:'private,no-store'}});
      await db.execute(`INSERT INTO support_ticket_attachments(ticket_id,uploaded_by_user_id,file_name,file_path,mime_type,file_size)
        VALUES (?,?,?,?,?,?)`,[ticketId,user.id,`Screenshot ${paths.length}.png`,path,'image/png',buffer.length]);
    }
    await db.execute('INSERT INTO guardian_portal_help_requests(guardian_user_id,request_id,agency_id,client_id,ticket_id) VALUES (?,?,?,?,?)',[user.id,requestId,agencyId,clientId,ticketId]);
    await db.commit();committed=true;
    await d.notify({type:'support_ticket_created',severity:'info',title:'New portal issue',message:'A family reported an AuricWell portal issue.',userId:ownerId,agencyId,relatedEntityType:'support_ticket',relatedEntityId:ticketId,actorUserId:user.id}).catch(()=>{});
    return {ticketId};
  }catch(e){if(db&&!committed)await db.rollback();if(!committed&&bucket)await Promise.allSettled(paths.map(path=>bucket.file(path).delete()));throw e;}
  finally{db?.release();}
}
