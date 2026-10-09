import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { assignTechnologyTicket } from '../services/technologySupport.service.js';
import { reviewRecipient,requireSection } from './providerUpdateReview.controller.js';
import { listFallActionClientsForProvider } from '../services/providerUpdate.service.js';
export const helpUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 3, fields: 7 },
  fileFilter: (_req, file, cb) => ['image/png','image/jpeg','image/webp'].includes(file.mimetype) ? cb(null,true) : cb(Object.assign(new Error('Choose a PNG, JPG or WebP screenshot.'),{status:400})) });
export async function submitUpdateHelp(req, res, next) {
  let db, bucket; const paths = []; let committed = false;
  try {
    const r = await reviewRecipient(req);
    if (r.previewOnly || String(r.token).startsWith('preview_')) throw Object.assign(new Error('Preview only — no ticket was submitted.'), {status:403});
    const question = String(req.body.question || '').trim();
    const subject = String(req.body.subject || 'Provider Update help').trim().slice(0,200);
    const requestId = String(req.body.requestId || '');
    const clientId=req.body.clientId==null?null:Number(req.body.clientId);
    if(clientId!==null&&(!Number.isSafeInteger(clientId)||clientId<1))throw Object.assign(new Error('Choose a client from your update.'),{status:400});
    const topic=clientId?'general':'technology';
    if (question.length < 5 || question.length > 10000 || !/^[a-f0-9-]{36}$/i.test(requestId)) throw Object.assign(new Error('Describe the problem before submitting.'), {status:400});
    const enc = prepareEncryptedTicketText(question);
    if (!enc.encrypted) throw Object.assign(new Error('Secure ticket storage is unavailable. Please try again later.'), {status:503});
    db = await pool.getConnection(); await db.beginTransaction();
    // Lock this recipient to serialize duplicate form submissions.
    await db.execute('SELECT id FROM provider_update_recipients WHERE id=? FOR UPDATE',[r.id]);
    const [[prior]] = await db.execute('SELECT h.ticket_id,t.client_id,t.topic FROM provider_update_help_requests h JOIN support_tickets t ON t.id=h.ticket_id WHERE h.recipient_id=? AND h.request_id=?',[r.id,requestId]);
    if (prior) { if(Number(prior.client_id||0)!==Number(clientId||0))throw Object.assign(new Error('This request was already used for another ticket. Reopen the ticket form.'),{status:409});await db.rollback(); return res.json({ticketId:prior.ticket_id,topic:prior.topic||topic}); }
    let client;
    if(clientId){
      requireSection(r,'client_fall_update');
      client=(await listFallActionClientsForProvider(r.provider_user_id,r.agency_id)).find(c=>Number(c.id)===clientId);
      if(!client?.schoolOrganizationId)throw Object.assign(new Error('This client is not assigned to you in this update.'),{status:403});
    }
    const [created] = client ? await db.execute(`INSERT INTO support_tickets
      (agency_id,school_organization_id,client_id,created_by_user_id,created_by_source_key,subject,question,
       question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,status,topic,priority)
      VALUES (?,?,?,?,'provider_update',?,?,?,?,?,?,'open','general','medium')`,
      [r.agency_id,client.schoolOrganizationId,client.id,r.provider_user_id,subject,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]) : await db.execute(`INSERT INTO support_tickets
      (agency_id,school_organization_id,created_by_user_id,created_by_source_key,subject,question,
       question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,status,topic,priority)
      VALUES (?,?,?,'provider_update',?,?,?,?,?,?,'open','technology','medium')`,
      [r.agency_id,r.agency_id,r.provider_user_id,subject,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
    if(!client)await assignTechnologyTicket({ticketId:created.insertId,agencyId:r.agency_id},db);
    if(req.files?.length) bucket = await StorageService.getGCSBucket();
    for (const file of req.files || []) {
      // Re-encode rather than trusting the filename/MIME; strip metadata from screenshots.
      const buffer = await sharp(file.buffer,{limitInputPixels:16_000_000}).rotate().png().toBuffer();
      const path = `support-tickets/${r.agency_id}/${created.insertId}/${randomUUID()}.png`;
      paths.push(path);
      await bucket.file(path).save(buffer,{resumable:false,metadata:{contentType:'image/png',cacheControl:'private,no-store'}});
      await db.execute(`INSERT INTO support_ticket_attachments(ticket_id,uploaded_by_user_id,file_name,file_path,mime_type,file_size)
        VALUES (?,?,?,?,?,?)`,[created.insertId,r.provider_user_id,`Screenshot ${paths.length}.png`,path,'image/png',buffer.length]);
    }
    await db.execute('INSERT INTO provider_update_help_requests(recipient_id,request_id,ticket_id) VALUES (?,?,?)',[r.id,requestId,created.insertId]);
    await db.commit(); committed = true;
    res.status(201).json({ticketId:created.insertId,topic,...(client?{clientId:client.id}:{})});
  } catch(e) { if(db)await db.rollback(); if(!committed&&bucket)await Promise.allSettled(paths.map(path=>bucket.file(path).delete())); next(e); }
  finally {db?.release();}
}
