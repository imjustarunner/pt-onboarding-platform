import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { clinicalAccess } from './guardianClinicalAccess.service.js';
import { guardianContactRows, sharedGuardianContact } from './guardianContactSharing.service.js';
import { requireSharedFamilyAck, readSharedFamilyNotice } from './sharedFamilyNotice.service.js';
import { clientAgencyMembership } from './clientServiceEnrollment.service.js';
import { isValidTimeZone, utcDateToZonedYmd, utcMysqlToIso } from '../utils/zonedWallTime.util.js';

const PROVIDERS = new Set(['provider', 'provider_plus', 'intern', 'intern_plus', 'clinician', 'therapist', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin']);
const FAMILIES = new Set(['client', 'client_guardian']);
const ACTIVE = new Set(['active','active_employee','ehr_only']);
const WRITABLE = new Set(['scheduled', 'confirmed', 'client_confirmed', 'completed', 'attended', 'no_show']);
const UPCOMING = new Set(['scheduled', 'confirmed', 'client_confirmed']);
export const sessionCommentError = (status, message, code = 'SESSION_COMMENT_ACCESS') => Object.assign(new Error(message), { status, code });
const id = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw sessionCommentError(400, 'Choose a valid appointment and client.', 'SESSION_COMMENT_INPUT');
  return n;
};
const ids = (values) => [...new Set((values || []).map(id))];
const name = u => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Portal user';
const json = value => { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return { noView: true }; } };
const instant = value => value instanceof Date ? value : new Date(utcMysqlToIso(value) || value);
const iso = value => value ? instant(value).toISOString() : null;
const active = user => user && Number(user.is_active) === 1 && !Number(user.is_archived || 0)
  && !user.terminated_at && (!user.status_expires_at || instant(user.status_expires_at) > new Date()) && ACTIVE.has(String(user.status || '').toLowerCase());
const tz = value => isValidTimeZone(value) ? value : 'America/Denver';
const day = (date, zone) => utcDateToZonedYmd(date, zone);
const denied = () => sessionCommentError(403, 'Secure session comments are not available for this appointment and relationship.');

/** Pure attention rule: a newer unread comment interrupts a prior dismissal or
 * snooze. A list is not a read receipt. Day keys use calendar days, including DST. */
export function sessionCommentAttention({ comments, appointments, state, now, timeZone }) {
  const dayKey = day(now, timeZone);
  const todays = appointments.filter(a => day(instant(a.startAt), timeZone) === dayKey);
  const activeDay = todays.some(a => UPCOMING.has(a.status) && instant(a.endAt) > now);
  const lastSessionEndAt = todays.filter(a => UPCOMING.has(a.status)).map(a => instant(a.endAt)).sort((a,b) => b-a)[0] || null;
  const unread = comments.filter(c => !c.readAt && !c.isOwn && todays.some(a => a.id === c.appointment.id && a.clientId === c.appointment.clientId));
  const watermark = Math.max(0, ...unread.map(c => c.attentionToken || c.id));
  const applies = state && String(state.day_key).slice(0, 10) === dayKey && state.time_zone === timeZone && Number(state.watermark) >= watermark;
  const dismissed = !!(applies && state.action === 'dismiss_today');
  const snoozedUntil = applies && state.action === 'snooze' ? iso(state.snoozed_until) : null;
  return { dayKey, timeZone, unread, watermark, activeDay, lastSessionEndAt:iso(lastSessionEndAt), dayFinished:!activeDay, dismissed, snoozedUntil,
    showSplash: !!(activeDay && unread.length && !dismissed && (!snoozedUntil || instant(snoozedUntil) <= now)) };
}

export function createSecureSessionComments(overrides = {}) {
  const d = { db: pool, encrypt: encryptChatText, decrypt: decryptChatText, clinical: clinicalAccess,
    membership: clientAgencyMembership, contacts:guardianContactRows, requireAck:requireSharedFamilyAck, notice:readSharedFamilyNotice,
    clock: () => new Date(), ...overrides };

  async function actor(user, db = d.db) {
    const uid = id(user?.id);
    const [[current]] = await db.execute('SELECT id,role,first_name,last_name,email,personal_email,work_email,is_active,is_archived,status,status_expires_at,terminated_at,timezone FROM users WHERE id=?', [uid]);
    if (!active(current) || (!PROVIDERS.has(current.role) && !FAMILIES.has(current.role))) throw denied();
    return { ...current, sessionCommentAgencyId: user?.sessionCommentAgencyId ? id(user.sessionCommentAgencyId) : null,
      sessionCommentClientId: user?.sessionCommentClientId ? id(user.sessionCommentClientId) : null };
  }
  async function appointment(appointmentId, clientId, db = d.db, lock = false) {
    const [[a]] = await db.execute(`SELECT a.*,c.full_name AS client_name,c.initials AS client_initials,
      c.provider_id AS legacy_provider_id,CONCAT_WS(' ',p.first_name,p.last_name) AS provider_name
      FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id=?
      JOIN clients c ON c.id=ap.client_id JOIN agencies agency ON agency.id=a.agency_id AND agency.is_active=1 AND COALESCE(agency.is_archived,0)=0
      LEFT JOIN users p ON p.id=a.provider_user_id
      WHERE a.id=? AND a.status<>'draft' ${lock ? 'FOR UPDATE' : ''}`, [id(clientId), id(appointmentId)]);
    if (!a || !await d.membership(id(clientId), Number(a.agency_id), db)) throw sessionCommentError(404, 'Appointment not found.');
    return { ...a, client_id: id(clientId) };
  }
  async function hasCurrentRights(current, a, db = d.db) {
    if (!active(current)) return false;
    if (current.sessionCommentAgencyId && Number(current.sessionCommentAgencyId) !== Number(a.agency_id)) return false;
    if (current.sessionCommentClientId && Number(current.sessionCommentClientId) !== Number(a.client_id)) return false;
    if (FAMILIES.has(current.role)) {
      const [[link]] = await db.execute('SELECT cg.access_enabled,cg.relationship_type,cg.permissions_json,c.date_of_birth,c.guardian_portal_enabled FROM client_guardians cg JOIN clients c ON c.id=cg.client_id WHERE cg.client_id=? AND cg.guardian_user_id=?', [a.client_id, current.id]);
      const p = json(link?.permissions_json);
      if (!link || Number(link.access_enabled) !== 1 || p.noView || p.noViewOtherGuardian || p.coGuardianInviteRestricted || p.canViewAppointments === false || p.canMessage === false) return false;
      if(link.relationship_type!=='self' && Number(link.guardian_portal_enabled)!==1)return false;
      // Own-enrollment completion clears noViewOtherGuardian and preserves the
      // other parent's private answers via hideOtherGuardianAnswers instead.
      // The central clinical grant remains authoritative; never waive a flag.
      const access = await d.clinical({ userId: current.id, clientId: a.client_id, agencyId: a.agency_id }, db);
      return access.scopes.includes('clinical_messages');
    }
    // No admin, support, supervisor, school or authorship override: this provider
    // must still own this occurrence AND currently treat this exact child.
    if (!PROVIDERS.has(current.role) || Number(a.provider_user_id) !== Number(current.id)) return false;
    const [[membership]] = await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1', [current.id, a.agency_id]);
    if (!membership) return false;
    const [[assignment]] = await db.execute('SELECT id,is_active FROM client_provider_assignments WHERE client_id=? AND provider_user_id=? ORDER BY is_active DESC,id DESC LIMIT 1', [a.client_id, current.id]);
    // An explicitly ended assignment wins over a stale legacy primary field.
    return assignment ? Number(assignment.is_active)===1 : Number(a.legacy_provider_id) === Number(current.id);
  }
  async function access(user, appointmentId, clientId, db = d.db, lock = false) {
    const current = await actor(user, db);
    const a = await appointment(appointmentId, clientId, db, lock);
    if (!await hasCurrentRights(current, a, db)) throw denied();
    return { current, a };
  }
  const presentAppointment = a => ({ id: Number(a.id), appointmentId: Number(a.id), clientId: Number(a.client_id), agencyId: Number(a.agency_id),
    startAt: iso(a.start_at), endAt: iso(a.end_at), timeZone: tz(a.source_timezone), status: a.status,
    clientName: a.client_name || a.client_initials || 'Client', providerName: a.provider_name || 'Your provider' });
  async function audit(action, { a = null, commentId = null, revision = null, userId, req, db = d.db }) {
    // Deliberately closed metadata schema: no body, name, address, request or URL.
    await db.execute(`INSERT INTO secure_session_comment_audit (agency_id,appointment_id,client_id,comment_id,actor_user_id,action,ip_hash,revision)
      VALUES (?,?,?,?,?,?,?,?)`, [a?.agency_id || null, a?.id || null, a?.client_id || null, commentId, userId, action,
      req?.ip ? crypto.createHash('sha256').update(String(req.ip)).digest('hex') : null,revision]);
  }
  async function eligible(current, a, db = d.db) {
    const out = [];
    const family = FAMILIES.has(current.role);
    const contacts = family ? await d.contacts(a.client_id,db) : [];
    const ownPermissions = contacts.find(c => Number(c.id) === Number(current.id))?.permissions_json || {};
    if (FAMILIES.has(current.role)) {
      const [[provider]] = await db.execute('SELECT id,role,first_name,last_name,is_active,is_archived,status,status_expires_at,terminated_at FROM users WHERE id=?', [a.provider_user_id]);
      if (!await hasCurrentRights(provider, a, db)) return [];
      out.push({ id:Number(provider.id), name:name(provider), relationshipType:'provider', required:true });
    }
    const [linked] = await db.execute(`SELECT u.id,u.role,u.first_name,u.last_name,u.is_active,u.is_archived,u.status,u.status_expires_at,u.terminated_at,cg.relationship_type
      FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.access_enabled=1`, [a.client_id]);
    for (const u of linked) if (Number(u.id) !== Number(current.id) && FAMILIES.has(u.role) && await hasCurrentRights(u, a, db)) {
      const contact = contacts.find(c => Number(c.id) === Number(u.id));
      const shared = family && contact ? sharedGuardianContact(contact,current.id,ownPermissions) : null;
      out.push({ id:Number(u.id), name:family ? shared?.hiddenFields.includes('name') ? 'Guardian (name private)' : shared?.name || 'Guardian' : name(u),
        namePrivate:!!shared?.hiddenFields.includes('name'),relationshipType:u.relationship_type === 'self' ? 'client' : 'guardian',required:true });
    }
    return out;
  }
  async function presentComment(c, a, current, db = d.db, includeBody = true) {
    const envelope = includeBody ? JSON.parse(d.decrypt({ ciphertextB64: c.body_ciphertext, ivB64: c.body_iv, authTagB64: c.body_auth_tag, keyId: c.encryption_key_id })) : null;
    if (includeBody && (envelope.v !== 1 || envelope.revision !== Number(c.revision) || envelope.appointmentId !== Number(a.id) || envelope.clientId !== Number(a.client_id)
      || envelope.agencyId !== Number(a.agency_id) || envelope.authorUserId !== Number(c.author_user_id) || typeof envelope.body !== 'string')) {
      throw sessionCommentError(503, 'The secure comment could not be opened. Contact support with the appointment reference.', 'SESSION_COMMENT_ENCRYPTION');
    }
    const [recipients] = await db.execute(`SELECT r.user_id,r.read_at,u.first_name,u.last_name,u.role
      FROM secure_session_comment_recipients r JOIN users u ON u.id=r.user_id WHERE r.comment_id=? AND r.revision=?`, [c.id,c.revision]);
    const contacts = FAMILIES.has(current.role) ? await d.contacts(a.client_id,db) : [];
    const ownPermissions = contacts.find(r=>Number(r.id)===Number(current.id))?.permissions_json || {};
    const contactName = (uid,fallback) => {
      if (!FAMILIES.has(current.role)) return fallback;
      const contact = contacts.find(r=>Number(r.id)===Number(uid));
      if (!contact) return recipients.some(r=>Number(r.user_id)===Number(uid) && PROVIDERS.has(r.role)) ? fallback : 'Guardian (name private)';
      const shared = sharedGuardianContact(contact,current.id,ownPermissions);
      return shared.hiddenFields.includes('name') ? 'Guardian (name private)' : shared.name;
    };
    return { id: Number(c.id), body: envelope?.body || null, author: { id: Number(c.author_user_id), name: contactName(c.author_user_id,c.author_name || 'Portal user') },
      createdAt: iso(c.created_at), isOwn: Number(c.author_user_id) === Number(current.id), readAt: iso(c.read_at),
      version:Number(c.revision),editedAt:iso(c.edited_at),attentionToken:Number(c.revision_event_id),
      recipientUserIds: recipients.map(r => Number(r.user_id)), audienceRedacted:false,
      recipients: recipients.map(r => ({ id:Number(r.user_id),name:contactName(r.user_id,name(r)),relationshipType:PROVIDERS.has(r.role) ? 'provider' : 'family' })),
      appointment: presentAppointment(a), type: 'secure_comment' };
  }
  async function commentRows(current, a, db = d.db, limit = 101, before = Number.MAX_SAFE_INTEGER, ownOnly = false) {
    const [rows] = await db.execute(`SELECT c.*,r.read_at,CONCAT_WS(' ',u.first_name,u.last_name) AS author_name
      FROM secure_session_comments c JOIN secure_session_comment_recipients r ON r.comment_id=c.id AND r.revision=c.revision AND r.user_id=?
      JOIN users u ON u.id=c.author_user_id WHERE c.appointment_id=? AND c.client_id=? AND c.agency_id=? AND c.id<? ${ownOnly?`AND c.author_user_id=${Number(current.id)}`:''} ORDER BY c.id DESC LIMIT ${Number(limit)}`,
    [current.id, a.id, a.client_id, a.agency_id, before]);
    return rows;
  }
  function decodeRevision(row) {
    return JSON.parse(d.decrypt({ciphertextB64:row.body_ciphertext,ivB64:row.body_iv,authTagB64:row.body_auth_tag,keyId:row.encryption_key_id}));
  }
  async function storeRevision({db,a,current,commentId,revision,encrypted,requestId,requestHash,recipients}) {
    const [event]=await db.execute(`INSERT INTO secure_session_comment_revisions
      (comment_id,revision,author_user_id,request_id,request_hash,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,audience_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,[commentId,revision,current.id,requestId,requestHash,encrypted.ciphertextB64,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId,JSON.stringify(recipients)]);
    for(const recipientId of recipients){
      await db.execute('INSERT INTO secure_session_comment_recipients (comment_id,revision,user_id,read_at) VALUES (?,?,?,?)',[commentId,revision,recipientId,recipientId===current.id?d.clock():null]);
      if(recipientId!==current.id)await db.execute(`INSERT INTO secure_session_comment_deliveries
        (agency_id,recipient_user_id,comment_id,revision,kind,dedupe_key)VALUES(?,?,?,?,?,?)`,
      [a.agency_id,recipientId,commentId,revision,revision===1?'immediate':'edit',`comment:${commentId}:revision:${revision}:user:${recipientId}`]);
    }
    return Number(event.insertId);
  }
  async function thread({ user, appointmentId, clientId, before = null, req }) {
    if (!clientId) {
      const current = await actor(user);
      const [clients] = await d.db.execute('SELECT DISTINCT client_id FROM appointment_participants WHERE appointment_id=? AND client_id IS NOT NULL', [id(appointmentId)]);
      const choices = [];
      for (const row of clients) { try { const a = await appointment(appointmentId, row.client_id); if (await hasCurrentRights(current, a)) choices.push(presentAppointment(a)); } catch (e) { if (![403, 404].includes(e.status)) throw e; } }
      if (choices.length !== 1) {
        if (!choices.length) throw denied();
        return { clients: choices.map(a => ({ id: a.clientId, clientId: a.clientId, name: a.clientName })), requiresClientSelection: true, comments: [], recipients: [], canWrite: false };
      }
      clientId = choices[0].clientId;
    }
    const { current, a } = await access(user, appointmentId, clientId);
    const rows = await commentRows(current, a, d.db, 101, before ? id(before) : Number.MAX_SAFE_INTEGER);
    const comments = [];
    for (const row of rows.slice(0, 100).reverse()) comments.push(await presentComment(row, a, current));
    await audit('thread_viewed', { a, userId: current.id, req });
    const [own]=await commentRows(current,a,d.db,1,Number.MAX_SAFE_INTEGER,true);
    return { appointment: presentAppointment(a), comments, recipients: await eligible(current, a),
      ownComment:own?await presentComment(own,a,current):null,
      sharingNotice:await d.notice({userId:current.id,agencyId:a.agency_id},d.db),
      canWrite: WRITABLE.has(a.status), hasMore: rows.length > 100, nextBefore: rows.length > 100 ? Number(rows[99].id) : null,
      sharingPolicy:'all_eligible_family' };
  }
  async function create({ user, appointmentId, clientId, body, recipientUserIds, requestId, req }) {
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text || Array.from(text).length > 250 || /[\u0000]/.test(text)) throw sessionCommentError(400, 'Write a comment of 1–250 characters.', 'SESSION_COMMENT_INPUT');
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(requestId || ''))) throw sessionCommentError(400, 'A unique request reference is required.', 'SESSION_COMMENT_INPUT');
    if (!Array.isArray(recipientUserIds) || recipientUserIds.length > 20) throw sessionCommentError(400, 'Choose who may read this comment.', 'SESSION_COMMENT_INPUT');
    const selected = ids(recipientUserIds).sort((a, b) => a - b);
    const db = await d.db.getConnection();
    let result;
    try {
      await db.beginTransaction();
      const { current, a } = await access(user, appointmentId, clientId, db, true);
      await d.requireAck({userId:current.id,agencyId:a.agency_id},db);
      if (!WRITABLE.has(a.status)) throw sessionCommentError(409, 'This appointment no longer accepts new comments. Existing comments remain available.');
      const candidates = await eligible(current, a, db);
      const required = candidates.filter(c => c.required).map(c => c.id);
      if (FAMILIES.has(current.role) && !required.length) throw sessionCommentError(409, 'An assigned provider is required before adding a comment.');
      if (selected.some(uid => !candidates.some(c => c.id === uid))) throw sessionCommentError(409, 'A recipient is no longer eligible. Review recipients before sending.', 'SESSION_COMMENT_AUDIENCE_CHANGED');
      if (JSON.stringify(selected) !== JSON.stringify([...required].sort((a,b)=>a-b))) throw sessionCommentError(409,
        'The authorized recipient list changed. Review the current recipients before sending this comment.', 'SESSION_COMMENT_AUDIENCE_CHANGED');
      const recipients = [...new Set([current.id, ...required, ...selected])].sort((a, b) => a - b);
      if (PROVIDERS.has(current.role) && !candidates.length) throw sessionCommentError(409, 'No eligible client or guardian account is available for this secure session comment.');
      // Only scope/recipient metadata is hashed. Do not persist a dictionary-
      // attackable digest of a potentially short clinical comment.
      const requestHash = crypto.createHash('sha256').update(JSON.stringify([Number(a.id), Number(a.client_id), recipients])).digest('hex');
      const [[existing]] = await db.execute('SELECT * FROM secure_session_comments WHERE author_user_id=? AND request_id=? FOR UPDATE', [current.id, requestId]);
      if (existing) {
        const [[original]]=await db.execute('SELECT * FROM secure_session_comment_revisions WHERE comment_id=? AND revision=1',[existing.id]);
        const previous = decodeRevision(original || existing);
        if (existing.request_hash !== requestHash || previous.body !== text || previous.appointmentId !== Number(a.id) || previous.clientId !== Number(a.client_id)) throw sessionCommentError(409, 'This request was already used for a different comment. Review the appointment before sending again.');
        result = { id: Number(existing.id), appointmentId: Number(a.id), clientId: Number(a.client_id), reused: true };
      } else {
        const [[own]]=await db.execute('SELECT id FROM secure_session_comments WHERE appointment_id=? AND client_id=? AND author_user_id=? FOR UPDATE',[a.id,a.client_id,current.id]);
        if(own)throw Object.assign(sessionCommentError(409,'You already have a comment for this session. Open it and choose Edit.','SESSION_COMMENT_EXISTS'),{commentId:Number(own.id)});
        const encrypted = d.encrypt(JSON.stringify({ v: 1,revision:1, agencyId: Number(a.agency_id), appointmentId: Number(a.id), clientId: Number(a.client_id), authorUserId: Number(current.id), body: text }));
        const [insert] = await db.execute(`INSERT INTO secure_session_comments
          (agency_id,appointment_id,client_id,author_user_id,request_id,request_hash,body_ciphertext,body_iv,body_auth_tag,encryption_key_id)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [a.agency_id, a.id, a.client_id, current.id, requestId, requestHash, encrypted.ciphertextB64, encrypted.ivB64, encrypted.authTagB64, encrypted.keyId]);
        const commentId = Number(insert.insertId);
        const revisionEventId=await storeRevision({db,a,current,commentId,revision:1,encrypted,requestId,requestHash,recipients});
        await db.execute('UPDATE secure_session_comments SET revision_event_id=? WHERE id=?',[revisionEventId,commentId]);
        await audit('comment_created', { a, commentId,revision:1, userId: current.id, req, db });
        result = { id: commentId, appointmentId: Number(a.id), clientId: Number(a.client_id), reused: false };
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      if (error.code === 'ER_DUP_ENTRY') throw sessionCommentError(409, 'This send is already being processed. Reload the conversation before retrying.');
      throw error;
    } finally { db.release(); }
    // Durable outbox is processed by the ordinary scheduler. Never perform a
    // second independent send on response retry; the immutable request ID wins.
    const { current, a } = await access(user, appointmentId, clientId);
    const [created] = await commentRows(current, a, d.db, 1, result.id + 1);
    if (!created || Number(created.id) !== result.id) throw denied();
    return { comment: { ...await presentComment(created, a, current), reused: result.reused } };
  }
  async function edit({user,appointmentId,clientId,commentId,body,recipientUserIds,expectedVersion,requestId,req}) {
    const text=typeof body==='string'?body.trim():'';
    if(!text||Array.from(text).length>250||text.includes('\u0000'))throw sessionCommentError(400,'Write a comment of 1–250 characters.','SESSION_COMMENT_INPUT');
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(String(requestId||''))||!Number.isSafeInteger(Number(expectedVersion))||Number(expectedVersion)<1)throw sessionCommentError(400,'Reload this comment before editing.','SESSION_COMMENT_INPUT');
    if(!Array.isArray(recipientUserIds)||recipientUserIds.length>20)throw sessionCommentError(400,'Review the authorized recipient list.','SESSION_COMMENT_INPUT');
    const selected=ids(recipientUserIds).sort((a,b)=>a-b),db=await d.db.getConnection();
    let reused=false;
    try {
      await db.beginTransaction();
      const {current,a}=await access(user,appointmentId,clientId,db,true);
      await d.requireAck({userId:current.id,agencyId:a.agency_id},db);
      const [[comment]]=await db.execute('SELECT * FROM secure_session_comments WHERE id=? AND appointment_id=? AND client_id=? AND agency_id=? FOR UPDATE',[id(commentId),a.id,a.client_id,a.agency_id]);
      if(!comment)throw sessionCommentError(404,'Comment not found.');
      if(Number(comment.author_user_id)!==Number(current.id))throw sessionCommentError(403,'Only the author may edit this comment.');
      if(!WRITABLE.has(a.status))throw sessionCommentError(409,'This appointment no longer accepts comment changes.');
      const [[retry]]=await db.execute('SELECT * FROM secure_session_comment_revisions WHERE author_user_id=? AND request_id=?',[current.id,requestId]);
      if(retry){
        const previous=decodeRevision(retry);
        const reviewed=[...new Set([current.id,...selected])].sort((a,b)=>a-b);
        const retryHash=crypto.createHash('sha256').update(JSON.stringify([Number(a.id),Number(a.client_id),Number(expectedVersion),reviewed])).digest('hex');
        if(Number(retry.comment_id)!==Number(comment.id)||retry.request_hash!==retryHash||previous.body!==text||previous.appointmentId!==Number(a.id)||previous.clientId!==Number(a.client_id)||previous.agencyId!==Number(a.agency_id)||previous.authorUserId!==Number(current.id)||previous.revision!==Number(retry.revision))throw sessionCommentError(409,'This request reference already belongs to another change.');
        reused=true;
      }else{
        if(Number(comment.revision)!==Number(expectedVersion))throw Object.assign(sessionCommentError(409,'This comment changed in another window. Reload it and review your edit.','SESSION_COMMENT_VERSION_CONFLICT'),{currentVersion:Number(comment.revision)});
        const candidates=await eligible(current,a,db),required=candidates.map(c=>c.id).sort((a,b)=>a-b);
        if(!required.length||JSON.stringify(selected)!==JSON.stringify(required))throw sessionCommentError(409,'The authorized recipients changed. Review the full current list before saving.','SESSION_COMMENT_AUDIENCE_CHANGED');
        const recipients=[...new Set([current.id,...required])].sort((a,b)=>a-b),revision=Number(comment.revision)+1;
        const requestHash=crypto.createHash('sha256').update(JSON.stringify([Number(a.id),Number(a.client_id),Number(expectedVersion),recipients])).digest('hex');
        const encrypted=d.encrypt(JSON.stringify({v:1,revision,agencyId:Number(a.agency_id),appointmentId:Number(a.id),clientId:Number(a.client_id),authorUserId:Number(current.id),body:text}));
        const eventId=await storeRevision({db,a,current,commentId:Number(comment.id),revision,encrypted,requestId,requestHash,recipients});
        await db.execute(`UPDATE secure_session_comments SET body_ciphertext=?,body_iv=?,body_auth_tag=?,encryption_key_id=?,revision=?,revision_event_id=?,edited_at=UTC_TIMESTAMP(3) WHERE id=? AND revision=?`,
        [encrypted.ciphertextB64,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId,revision,eventId,comment.id,Number(expectedVersion)]);
        await audit('comment_edited',{a,commentId:Number(comment.id),revision,userId:current.id,req,db});
      }
      await db.commit();
    }catch(error){await db.rollback();if(error.code==='ER_DUP_ENTRY')throw sessionCommentError(409,'This change is already being processed. Reload the comment before retrying.');throw error;}finally{db.release();}
    const {current,a}=await access(user,appointmentId,clientId);
    const [saved]=await commentRows(current,a,d.db,1,Number(commentId)+1);
    if(!saved||Number(saved.id)!==Number(commentId))throw denied();
    return {comment:{...await presentComment(saved,a,current),reused}};
  }
  async function read({ user, appointmentId, clientId, commentIds, commentVersions, req }) {
    if (!Array.isArray(commentIds) || commentIds.length > 100) throw sessionCommentError(400, 'Choose the displayed comments.');
    const selected = ids(commentIds);
    const db = await d.db.getConnection();
    try {
      await db.beginTransaction();
      const { current, a } = await access(user, appointmentId, clientId, db, true);
      for (const commentId of selected) {
        const revision=id(commentVersions?.[commentId]);
        const [[comment]] = await db.execute(`SELECT c.id,c.revision,r.read_at FROM secure_session_comments c JOIN secure_session_comment_recipients r
          ON r.comment_id=c.id AND r.user_id=? AND r.revision=? WHERE c.id=? AND c.appointment_id=? AND c.client_id=? AND c.agency_id=? FOR UPDATE`, [current.id,revision,commentId,a.id,a.client_id,a.agency_id]);
        if (!comment) throw denied();
        if(Number(comment.revision)!==revision)throw sessionCommentError(409,'This comment changed while you were viewing it. Open the current version to mark it read.','SESSION_COMMENT_VERSION_CONFLICT');
        if (!comment.read_at) {
          await db.execute('UPDATE secure_session_comment_recipients SET read_at=UTC_TIMESTAMP(3) WHERE comment_id=? AND revision=? AND user_id=? AND read_at IS NULL', [commentId,revision,current.id]);
          await audit('comment_opened', { a, commentId,revision, userId: current.id, req, db });
        }
      }
      await db.commit();
      return { readCommentIds: selected };
    } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
  }
  async function history({ user, clientId = null, before = null, req, includeBody = false }) {
    const current = await actor(user);
    const params = [current.id, before ? id(before) : Number.MAX_SAFE_INTEGER];
    let filter = '';
    if (clientId) { filter = 'AND c.client_id=?'; params.push(id(clientId)); }
    // Bound raw candidates and return a continuation even when all were revoked:
    // no unbounded decryption sweep or inferred private chart access.
    const [rows] = await d.db.execute(`SELECT c.*,r.read_at,CONCAT_WS(' ',u.first_name,u.last_name) AS author_name
      FROM secure_session_comments c JOIN secure_session_comment_recipients r ON r.comment_id=c.id AND r.revision=c.revision AND r.user_id=?
      JOIN users u ON u.id=c.author_user_id WHERE c.id<? ${filter} ORDER BY c.id DESC LIMIT 101`, params);
    const comments = [];
    for (const c of rows.slice(0, 100)) {
      try {
        const a = await appointment(c.appointment_id, c.client_id);
        if (!await hasCurrentRights(current, a)) continue;
        comments.push(await presentComment(c, a, current,d.db,includeBody === true));
      } catch (e) { if (![403, 404].includes(e.status)) throw e; }
    }
    await audit('history_viewed', { userId: current.id, req });
    return { comments, hasMore: rows.length > 100, nextBefore: rows.length > 100 ? Number(rows[99].id) : null };
  }
  async function relevantAppointments(current) {
    const [rows] = await d.db.execute(`SELECT DISTINCT a.id,ap.client_id FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id
      WHERE a.status<>'draft' AND a.start_at BETWEEN DATE_SUB(UTC_TIMESTAMP(),INTERVAL 36 HOUR) AND DATE_ADD(UTC_TIMESTAMP(),INTERVAL 36 HOUR)
      AND (a.provider_user_id=? OR EXISTS (SELECT 1 FROM client_guardians cg WHERE cg.client_id=ap.client_id AND cg.guardian_user_id=? AND cg.access_enabled=1)) LIMIT 150`, [current.id, current.id]);
    const appointments = [];
    for (const row of rows) {
      try { const a = await appointment(row.id, row.client_id); if (await hasCurrentRights(current, a)) appointments.push(a); }
      catch (e) { if (![403, 404].includes(e.status)) throw e; }
    }
    return appointments;
  }
  async function today({ user, timeZone = null, req, auditView = true, includeBodies = true }) {
    const current = await actor(user);
    const [[preference]] = await d.db.execute('SELECT timezone FROM user_preferences WHERE user_id=?', [current.id]);
    const now = d.clock();
    const calendar = await relevantAppointments(current);
    const scheduleZones=[...new Set(calendar.map(a=>a.source_timezone).filter(isValidTimeZone))];
    const zone = tz(timeZone || preference?.timezone || current.timezone || (scheduleZones.length===1?scheduleZones[0]:null));
    const todays = calendar.filter(a => day(instant(a.start_at), zone) === day(now, zone) && !String(a.status).startsWith('canceled') && a.status !== 'rescheduled');
    const comments = [];
    for (const a of todays) {
      const rows = await commentRows(current, a, d.db, 201);
      for (const c of rows) if (!c.read_at && Number(c.author_user_id) !== Number(current.id)) comments.push(await presentComment(c, a, current,d.db,includeBodies));
    }
    const [[state]] = await d.db.execute('SELECT DATE_FORMAT(day_key,\'%Y-%m-%d\') AS day_key,time_zone,action,watermark,snoozed_until FROM secure_session_comment_attention WHERE user_id=? AND day_key=? AND time_zone=?', [current.id, day(now, zone), zone]);
    const attention = sessionCommentAttention({ comments, appointments: todays.map(presentAppointment), state, now, timeZone: zone });
    const appointments = todays.map(a => ({ ...presentAppointment(a), comments: comments.filter(c => c.appointment.id === Number(a.id) && c.appointment.clientId === Number(a.client_id)),
      unreadCount: comments.filter(c => c.appointment.id === Number(a.id) && c.appointment.clientId === Number(a.client_id)).length })).filter(a => a.unreadCount);
    if (auditView && appointments.length) await audit('today_viewed', { userId: current.id, req });
    return { appointments, unreadCount: comments.length, showSplash: attention.showSplash, dayKey: attention.dayKey, timeZone: zone,
      dismissed: attention.dismissed, snoozedUntil: attention.snoozedUntil, watermark: attention.watermark, activeDay: attention.activeDay,
      lastSessionEndAt:attention.lastSessionEndAt, dayFinished:attention.dayFinished };
  }
  async function attention({ user, timeZone, action, minutes = 30, req }) {
    if (!['dismiss_today', 'snooze'].includes(action)) throw sessionCommentError(400, 'Choose Dismiss for today or Remind me later.');
    if (action === 'snooze' && ![5, 15, 30, 60].includes(Number(minutes))) throw sessionCommentError(400, 'Choose a reminder in 5, 15, 30 or 60 minutes.');
    const current = await actor(user);
    const state = await today({ user: current, timeZone, auditView: false });
    const until = action === 'snooze' ? new Date(d.clock().getTime() + Number(minutes) * 60000) : null;
    await d.db.execute(`INSERT INTO secure_session_comment_attention (user_id,day_key,time_zone,action,watermark,snoozed_until)
      VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE action=VALUES(action),watermark=VALUES(watermark),snoozed_until=VALUES(snoozed_until),updated_at=UTC_TIMESTAMP(3)`,
    [current.id, state.dayKey, state.timeZone, action, state.watermark, until]);
    await audit(action, { userId: current.id, req });
    return { action, dayKey: state.dayKey, timeZone: state.timeZone, snoozedUntil: iso(until) };
  }
  async function badges({ user, appointmentIds, clientId = null }) {
    const current = await actor(user);
    const selected = ids(appointmentIds);
    if (selected.length > 150) throw sessionCommentError(400, 'Choose at most 150 appointments.');
    const appointments = [];
    for (const appointmentId of selected) {
      const [participants] = clientId ? [[{ client_id: id(clientId) }]] : await d.db.execute('SELECT client_id FROM appointment_participants WHERE appointment_id=? AND client_id IS NOT NULL', [appointmentId]);
      for (const p of participants) {
        try {
          const a = await appointment(appointmentId, p.client_id);
          if (!await hasCurrentRights(current, a)) continue;
          const [[counts]] = await d.db.execute(`SELECT COUNT(*) AS count,SUM(r.read_at IS NULL AND c.author_user_id<>?) AS unreadCount FROM secure_session_comments c
            JOIN secure_session_comment_recipients r ON r.comment_id=c.id AND r.revision=c.revision AND r.user_id=? WHERE c.appointment_id=? AND c.client_id=? AND c.agency_id=?`, [current.id, current.id, a.id, a.client_id, a.agency_id]);
          appointments.push({ appointmentId, clientId: Number(a.client_id), count: Number(counts.count || 0), unreadCount: Number(counts.unreadCount || 0) });
        } catch (e) { if (![403, 404].includes(e.status)) throw e; }
      }
    }
    return { appointments };
  }
  // Exact envelope validation is shared by the worker and the queued mail
  // sender. This intentionally decrypts no comment bodies.
  async function deliveryAccess(delivery, db = d.db) {
    const current = await actor({ id: delivery.recipient_user_id }, db);
    if (delivery.kind === 'morning') {
      const summary = await today({ user: current, timeZone: delivery.time_zone, auditView: false,includeBodies:false });
      if (!summary.activeDay || !summary.unreadCount || summary.dayKey !== String(delivery.day_key).slice(0, 10)) throw denied();
      if (!summary.appointments.every(a => Number(a.agencyId) === Number(delivery.agency_id))) {
        if (!summary.appointments.some(a => Number(a.agencyId) === Number(delivery.agency_id))) throw denied();
      }
      return { current, a: null };
    }
    const [[c]] = await db.execute(`SELECT c.* FROM secure_session_comments c JOIN secure_session_comment_recipients r ON r.comment_id=c.id AND r.revision=c.revision AND r.user_id=?
      WHERE c.id=? AND c.revision=? AND c.agency_id=? AND c.author_user_id<>? AND r.read_at IS NULL`, [current.id, delivery.comment_id, delivery.revision, delivery.agency_id, current.id]);
    if (!c) throw denied();
    const a = await appointment(c.appointment_id, c.client_id, db);
    if (!await hasCurrentRights(current, a, db)) throw denied();
    return { current, a };
  }
  return { thread, create, edit, read, today, attention, history, badges, deliveryAccess, audit, actor, hasCurrentRights };
}

export const secureSessionComments = createSecureSessionComments();
