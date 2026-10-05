import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { persistGmailAttachmentsForTicket } from './unifiedEmail/ticketInboundAttachments.service.js';

export function isTechnologyIdentity(identity) {
  return String(identity?.identity_key || '').toLowerCase() === 'technology'
    || /^technology@/i.test(String(identity?.from_email || ''));
}

export function prioritizeTechnologyAddresses(addresses) {
  return [...new Set(addresses)].sort((a, b) => Number(/^technology@/i.test(b)) - Number(/^technology@/i.test(a)));
}

export function ignoreOutboundTechnologyCopy(fromEmail, ourFromEmails, technologyRoute) {
  return ourFromEmails.includes(String(fromEmail || '').toLowerCase())
    && (!technologyRoute || /^technology@/i.test(String(fromEmail || '')));
}

export async function technologyOwner(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT DISTINCT u.id FROM users u
    LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    WHERE LOWER(TRIM(u.first_name))='michael' AND LOWER(TRIM(u.last_name))='mendez'
      AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
      AND (u.role='super_admin' OR (ua.user_id IS NOT NULL AND u.role IN ('admin','support','staff')))` , [agencyId]);
  if (rows.length !== 1) throw new Error('Technology ticket owner Michael Mendez could not be uniquely resolved');
  return Number(rows[0].id);
}

export async function assignTechnologyTicket({ ticketId, agencyId }, db = pool) {
  const ownerId = await technologyOwner(agencyId, db);
  await db.execute("UPDATE support_tickets SET claimed_by_user_id=?,claimed_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=? AND topic='technology'", [ownerId, ticketId, agencyId]);
  return ownerId;
}

/** No model-generated replies: Technology is a human-owned ticket queue. */
export async function ingestTechnologyEmail({ identity, fromEmail, subject, bodyText, messageId,
  threadId, gmailMessageId, gmail, payload, receivedAt, recipients = [] }, database = pool) {
  if (!isTechnologyIdentity(identity) || !identity.agency_id) return { ingested: false };
  const agencyId = Number(identity.agency_id);
  const sender = String(fromEmail || '').trim().toLowerCase();
  const receiptKey = String(messageId || gmailMessageId || '').slice(0, 255);
  if (!receiptKey || !sender.includes('@')) throw new Error('Technology email requires sender and message id');
  const db = await database.getConnection();
  const lock = 'tech:' + createHash('sha256').update(`${agencyId}:${threadId || receiptKey}`).digest('hex').slice(0, 50);
  let locked = false;
  let ticketId, ownerId, duplicate = false;
  try {
    const [[row]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [lock]);
    if (Number(row?.acquired) !== 1) throw new Error('Technology email is already being processed');
    locked = true;
    await db.beginTransaction();
    const [receipts] = await db.execute('SELECT ticket_id FROM technology_ticket_email_receipts WHERE agency_id=? AND message_id=?', [agencyId, receiptKey]);
    if (receipts.length) {
      ticketId = receipts[0].ticket_id;
      duplicate = true;
    } else {
      ownerId = await technologyOwner(agencyId, db);
      const [existing] = threadId ? await db.execute(`SELECT id FROM support_tickets
        WHERE agency_id=? AND topic='technology' AND source_email_thread_id=? AND LOWER(source_email_from)=?
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [agencyId, threadId, sender]) : [[]];
      ticketId = existing[0]?.id;
      const enc = prepareEncryptedTicketText(String(bodyText || '').slice(0, 20000));
      if (!ticketId) {
        const [schools] = await db.execute(`SELECT DISTINCT sc.school_organization_id FROM school_contacts sc
          JOIN organization_affiliations oa ON oa.organization_id=sc.school_organization_id AND oa.agency_id=? AND oa.is_active=1
          WHERE LOWER(TRIM(sc.email))=?`, [agencyId, sender]);
        const schoolId = schools.length === 1 ? schools[0].school_organization_id : agencyId;
        const [senders] = await db.execute(`SELECT DISTINCT u.id FROM users u
          JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id IN (?,?) AND COALESCE(ua.is_active,1)=1
          WHERE LOWER(TRIM(u.email))=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0`, [agencyId,schoolId,sender]);
        const senderId = senders.length === 1 ? senders[0].id : null;
        const [created] = await db.execute(`INSERT INTO support_tickets
          (agency_id,school_organization_id,created_by_user_id,created_by_source_key,source_channel,source_email_from,source_email_subject,
           source_email_message_id,source_email_thread_id,source_email_received_at,email_ingested_at,source_email_recipients,
           subject,question,question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,
           topic,status,claimed_by_user_id,claimed_at)
          VALUES (?,?,?,'inbound_email','email',?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,'technology','open',?,CURRENT_TIMESTAMP)`,
          [agencyId, schoolId, senderId, sender, String(subject || '').slice(0,255), String(messageId || receiptKey).slice(0,255), threadId || null,
            receivedAt || new Date(), JSON.stringify(recipients), String(subject || 'Technology support').slice(0,255),
            enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId, ownerId]);
        ticketId = created.insertId;
      } else {
        await db.execute("UPDATE support_tickets SET status='open',claimed_by_user_id=?,claimed_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?", [ownerId,ticketId,agencyId]);
      }
      await db.execute(`INSERT INTO support_ticket_messages
        (ticket_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id)
        VALUES (?,'system_email',?,?,?,?,?)`, [ticketId,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
      await db.execute('INSERT INTO technology_ticket_email_receipts (agency_id,message_id,ticket_id) VALUES (?,?,?)', [agencyId,receiptKey,ticketId]);
    }
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error; // Inbound worker leaves the email unread for retry.
  } finally {
    if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
    db.release();
  }
  if (payload && gmailMessageId) await persistGmailAttachmentsForTicket({ ticketId, gmail, gmailMessageId, payload });
  if (!duplicate) {
    await Notification.create({ type: 'support_ticket_created', severity: 'info',
      title: 'Technology support request', message: `A Technology request is assigned to you (ticket #${ticketId}).`,
      userId: ownerId, agencyId, relatedEntityType: 'support_ticket', relatedEntityId: ticketId,
      actorSource: 'Technology email' }).catch(error => console.warn('[technologySupport] assignment notification:', error?.message));
  }
  return { ingested: true, ticketId, duplicate };
}
