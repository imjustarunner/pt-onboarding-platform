import crypto from 'node:crypto';
import { pool, seal, open, transaction, list, get, create, update, findSource, sourceRecords, lockPractice, audit } from './repository.js';
import { fail, hash, json, has, requirePhi, requirePermission, ledgerBalance } from './policy.js';
import { patientAccess } from './clinical.js';
import { platformIntegrations, recordNotifyreWebhookVerified } from './platformIntegrations.js';
import { normalizeSessionPhone } from './integrationPolicy.js';
import { notifyreRequest, notifyreReceipt } from './sessionTransports.js';
import { SMS_CATEGORIES, emptyCategories, CATEGORY_COMMANDS, phoneKey, routeFor, assertMessagingReady,
  smsCommand, smsFooter, verifyNotifyreSignature, normalizeNotifyreEvent, parseRelayReply, onRelayShift } from './clientMessagingPolicy.js';

const now = () => new Date().toISOString();
const contactContext = id => `auricwell:sms:contact:${id}`;
const outboxContext = id => `auricwell:sms:outbox:${id}`;
const eventContext = id => `auricwell:sms:event:${id}`;
const decodeContact = row => row && ({ ...row, data: open(row.payload, contactContext(row.id)), payload: undefined });
export async function practiceMessagingContext(practiceId, db = pool) {
  const [[p]] = await db.execute("SELECT * FROM auricwell_practices WHERE id=? AND product='auricwell_ehr' AND status='active'", [practiceId]);
  if (!p) throw fail(404, 'Practice unavailable.');
  return { practiceId: p.id, practiceName: p.name, slug: p.slug, agencyId: p.agency_id, accountId: '00000000-0000-4000-8000-000000000000',
    actorType: 'staff', permissions: ['admin', 'clinical', 'schedule', 'billing'], settings: open(p.settings, `auricwell:practice:${p.id}`) };
}
async function contactByPhone(ctx, phone, db = pool, lock = false) {
  const [[r]] = await db.execute(`SELECT * FROM auricwell_sms_contacts WHERE practice_id=? AND phone_key=?${lock ? ' FOR UPDATE' : ''}`, [ctx.practiceId, phoneKey(phone)]);
  return decodeContact(r);
}
async function contactById(ctx, id, db = pool, lock = false) {
  const [[r]] = await db.execute(`SELECT * FROM auricwell_sms_contacts WHERE practice_id=? AND id=?${lock ? ' FOR UPDATE' : ''}`, [ctx.practiceId, id]);
  if (!r) throw fail(404, 'SMS recipient not found.');
  return decodeContact(r);
}
async function writeContact(ctx, contact, data, db) {
  await db.execute('UPDATE auricwell_sms_contacts SET payload=?,revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND practice_id=?', [seal(data, contactContext(contact.id)), contact.id, ctx.practiceId]);
  await audit(ctx, 'sms.preferences_changed', contact.id, { categories: data.categories }, db);
}
async function phoneState(phone, db = pool, lock = false) {
  if (lock) await db.execute('INSERT IGNORE INTO auricwell_sms_phone_state (phone_key) VALUES (?)', [phoneKey(phone)]);
  const [[row]] = await db.execute(`SELECT * FROM auricwell_sms_phone_state WHERE phone_key=?${lock ? ' FOR UPDATE' : ''}`, [phoneKey(phone)]);
  return row || { blocked: false, command_at: 0 };
}
export async function clientSmsPreferences(ctx, patientId) {
  const patient = await patientAccess(ctx, patientId);
  const phone = normalizeSessionPhone(patient.data.phone);
  const contact = phone ? await contactByPhone(ctx, phone) : null;
  const valid = contact?.patient_id === patientId;
  const { settings } = await platformIntegrations();
  const route = routeFor(settings, ctx.practiceId);
  let ready = false;
  try { assertMessagingReady(settings, ctx.practiceId); ready = true; } catch { /* Display setup state without preventing consent collection. */ }
  const state = phone ? await phoneState(phone) : { blocked: false };
  const preferences = await findSource(ctx, 'session_preferences', patientId);
  return { phone: patient.data.phone || '', email: patient.data.email || '', revision: valid ? contact.revision : 0,
    emailEnabled: preferences?.data.emailEnabled !== false, categories: valid ? contact.data.categories : emptyCategories(),
    smsEnabled: valid && Object.values(contact.data.categories).some(Boolean), smsAvailable: ready,
    smsFrom: route?.mainNumber || '', brand: route?.brand || ctx.practiceName, stopped: !!state.blocked,
    recipientAccountId: valid ? contact.data.accountId || '' : '', consentMethod: valid ? contact.data.consentMethod || '' : '',
    consentAt: valid ? contact.data.consentAt || null : null };
}
export async function saveClientSmsPreferences(ctx, patientId, input) {
  requirePhi(ctx);
  const patient = await patientAccess(ctx, patientId);
  if (ctx.actorType === 'staff' && !['admin', 'clinical', 'schedule'].some(p => has(ctx, p))) throw fail(403, 'Scheduling or clinical access is required.');
  const phone = normalizeSessionPhone(patient.data.phone);
  const categories = Object.fromEntries(SMS_CATEGORIES.map(k => [k, input.categories?.[k] === true]));
  if (!phone) throw fail(400, 'Save a valid recipient phone number in the patient record first.');
  const accountId = ctx.actorType === 'staff' ? String(input.recipientAccountId || '') : ctx.accountId;
  let email = '', recipientName = '';
  if (accountId) {
    const [[account]] = await pool.execute(`SELECT a.profile,m.patient_ids,m.actor_type FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id
      WHERE a.id=? AND a.status='active' AND m.practice_id=? AND m.status='active'`, [accountId, ctx.practiceId]);
    if (!account || !['patient','guardian'].includes(account.actor_type) || !json(account.patient_ids, []).includes(patientId)) throw fail(403, 'Choose an authorized patient or guardian recipient.');
    const profile = open(account.profile, `auricwell:account:${accountId}`);
    email = profile.email || ''; recipientName = profile.name || '';
  }
  await transaction(async db => {
    await phoneState(phone, db, true);
    const prior = await contactByPhone(ctx, phone, db, true);
    if (prior?.patient_id && prior.patient_id !== patientId) throw fail(409, 'This phone is linked to another chart. Staff must review the shared recipient before changing consent.');
    if ((prior?.revision || 0) !== input.revision) throw fail(409, 'Preferences changed. Reload before saving.');
    const newlyEnabled = SMS_CATEGORIES.some(k => categories[k] && (!prior?.data.categories?.[k] || (accountId && accountId !== prior?.data.accountId)));
    if (newlyEnabled && (!accountId || input.consentConfirmed !== true || !String(input.evidence || '').trim() || !['verbal_phone','verbal_in_person','written','portal'].includes(input.consentMethod)))
      throw fail(400, 'Record the recipient’s affirmative permission, method, and consent evidence.');
    const data = { ...prior?.data, phone, categories, accountId: accountId || prior?.data.accountId || null,
      email: email || prior?.data.email || '', recipientName: recipientName || prior?.data.recipientName || '',
      consentMethod: newlyEnabled ? input.consentMethod : prior?.data.consentMethod,
      consentAt: newlyEnabled ? now() : prior?.data.consentAt || null,
      evidence: newlyEnabled ? String(input.evidence).trim().slice(0, 1000) : prior?.data.evidence || '',
      consentActor: newlyEnabled ? ctx.accountId : prior?.data.consentActor || null, updatedAt: now() };
    let id = prior?.id || crypto.randomUUID();
    if (prior) {
      await writeContact(ctx, prior, data, db);
      await db.execute('UPDATE auricwell_sms_contacts SET patient_id=? WHERE id=?', [patientId, id]);
    } else {
      await db.execute('INSERT INTO auricwell_sms_contacts (id,practice_id,phone_key,patient_id,payload) VALUES (?,?,?,?,?)', [id, ctx.practiceId, phoneKey(phone), patientId, seal(data, contactContext(id))]);
      await audit(ctx, 'sms.consent_recorded', id, { categories, method: input.consentMethod }, db);
    }
    const prefs = await findSource(ctx, 'session_preferences', patientId, db);
    const value = { ...prefs?.data, emailEnabled: input.emailEnabled !== false, updatedAt: now(), updatedBy: ctx.accountId };
    if (prefs) await update(ctx, prefs, value, db); else await create(ctx, 'session_preferences', value, { patientId, sourceKey: patientId }, db);
    if (newlyEnabled) {
      const { settings } = await platformIntegrations(db);
      const route = routeFor(settings, ctx.practiceId);
      if (route) {
        await queueSms(ctx, { contactId: id, category: 'welcome', key: `welcome:${id}:${data.consentAt}`, body: `${route.brand}: You are subscribed to client-service texts. Message frequency varies. Msg & data rates may apply.`, expiresAt: Date.now() + 30 * 86400000 }, db);
        if (categories.conversations && route.providerNumber && patient.data.careTeam?.length === 1) {
          const provider = await findSource(ctx, 'sms_staff_relay', patient.data.careTeam[0], db);
          if (provider?.data.providerTexting) await queueSms(ctx, { contactId: id, category: 'conversations', line: 'provider', key: `provider-welcome:${id}:${data.consentAt}`,
            body: `${route.brand}: You can text your provider at this number while their texting feature is enabled. Msg & data rates may apply.`, expiresAt: Date.now() + 30 * 86400000 }, db);
        }
      }
    }
  });
  return clientSmsPreferences(ctx, patientId);
}
export async function queueSms(ctx, input, db = pool) {
  if (![...SMS_CATEGORIES, 'welcome', 'help', 'preference', 'relay', 'relay_control'].includes(input.category)) throw fail(400, 'Choose an SMS category.');
  if (!input.key || !String(input.body || '').trim() || input.body.length > 5000) throw fail(400, 'A message and unique request key are required.');
  const contact = await contactById(ctx, input.contactId, db);
  const id = crypto.randomUUID(), key = hash(input.key);
  const data = { body: input.body, line: input.line || 'main', actor: ctx.accountId || null, origin: input.origin || 'automation',
    patientId: input.patientId || contact.patient_id || null, source: input.source || null, relayAccountId: input.relayAccountId || null,
    senderName: ctx.profile?.name || null, relayThreadId: input.relayThreadId || null, replyToEvent: input.replyToEvent || null };
  await db.execute(`INSERT IGNORE INTO auricwell_sms_outbox (id,practice_id,contact_id,thread_id,dedupe_key,category,payload,due_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, [id, ctx.practiceId, contact.id, input.threadId || null, key, input.category, seal(data, outboxContext(id)),
    new Date(input.dueAt || Date.now()), new Date(input.expiresAt || Date.now() + 86400000)]);
  const [[result]] = await db.execute('SELECT id,status,category,contact_id,thread_id,payload FROM auricwell_sms_outbox WHERE practice_id=? AND dedupe_key=?', [ctx.practiceId, key]);
  const existing=open(result.payload,outboxContext(result.id));
  if (existing.body!==data.body || existing.line!==data.line || result.category!==input.category || existing.actor!==data.actor || result.contact_id!==contact.id || result.thread_id!==(input.threadId||null))
    throw fail(409,'This message request was already used for different content. Reload before sending.');
  return {id:result.id,status:result.status};
}
export async function queuePatientSms(ctx, patientId, input, db = pool) {
  const patient = await get(ctx, 'patient', patientId, db);
  const phone = normalizeSessionPhone(patient.data.phone);
  if (!phone) return null;
  const contact = await contactByPhone(ctx, phone, db);
  if (!contact || contact.patient_id !== patientId || !contact.data.categories?.[input.category]) return null;
  if (input.recipientAccountId && contact.data.accountId !== input.recipientAccountId) return null;
  return queueSms(ctx, { ...input, key: `${input.key}:${contact.id}`, patientId, contactId: contact.id }, db);
}
export async function patientSmsCategoryEnabled(ctx,patientId,category) {
  const patient=await get(ctx,'patient',patientId);
  const contact=await contactByPhone(ctx,patient.data.phone);
  return contact?.patient_id===patientId && contact.data.categories?.[category]===true;
}
export async function sendBillingNotice(ctx, patientId, input) {
  requirePermission(ctx, 'billing');
  const patient = await patientAccess(ctx, patientId);
  if (!/^[a-z0-9-]{16,100}$/i.test(input.requestId || '')) throw fail(400, 'A unique notice request ID is required.');
  const contact = await contactByPhone(ctx, patient.data.phone);
  if (!contact?.data.accountId || contact.patient_id !== patientId || !contact.data.categories?.account) throw fail(409, 'Record the billing recipient’s permission for account notices first.');
  const source = { kind: 'patient', id: patientId, purpose: 'billing' };
  if (!await sourceStillCurrent(ctx, source, contact, pool)) throw fail(409, 'A positive balance and an authorized billing recipient are required.');
  const portal = `${String(process.env.AURICWELL_PUBLIC_ORIGIN || 'https://auricwell.com').replace(/\/$/, '')}/app/${encodeURIComponent(ctx.slug)}/billing`;
  return queueSms(ctx, { contactId: contact.id, category: 'account', key: `billing:${ctx.accountId}:${input.requestId}`, source,
    body: `${ctx.practiceName}: A billing notice is available in your account. Review it securely: ${portal}` });
}
async function sourceStillCurrent(ctx, source, contact, db) {
  if (!source) return true;
  const record = await get(ctx, source.kind, source.id, db);
  if (source.kind === 'appointment') return ['scheduled','confirmed'].includes(record.data.status)
    && record.data.start === source.start && record.data.end === source.end && record.data.providerAccountId === source.providerAccountId && record.patientId === contact.patient_id;
  if (source.kind === 'intake') return ['assigned','draft','needs_changes'].includes(record.data.status)
    && record.data.respondentAccountId === contact.data.accountId;
  if (source.kind === 'agreement') return ['issued','partially_signed'].includes(record.data.status)
    && record.data.signers?.some(s => s.accountId === contact.data.accountId)
    && !record.data.signatures?.some(s => s.accountId === contact.data.accountId);
  if (source.kind === 'patient' && source.purpose === 'billing') {
    const [[m]] = await db.execute("SELECT billing_patient_ids FROM auricwell_memberships WHERE practice_id=? AND account_id=? AND status='active'", [ctx.practiceId, contact.data.accountId]);
    return !!m && json(m.billing_patient_ids, []).includes(record.id) && ledgerBalance(await list(ctx, 'ledger', { patientId: record.id, limit: 10000 }, db)) > 0;
  }
  return false;
}
export async function sendClientSmsTransport(settings, route, { to, body, line, category, id, agencyId }, deps = {}) {
  const from = route[`${line}Number`];
  if (settings.smsProvider === 'notifyre') {
    const result = await (deps.notifyreRequest || notifyreRequest)(settings.notifyre.apiToken, '/sms/send', {
      From: from, Body: body + smsFooter(category), Recipients: [{ type: 'mobile_number', value: to }], AddUnsubscribeLink: false,
      Metadata: { dispatchId: id },
    });
    return notifyreReceipt(result);
  }
  const { getSmsSender, recordSmsPermission } = await import('../smsCompliance.service.js');
  const sender = await getSmsSender(from);
  if (String(sender.campaign_id) !== route.campaignId || Number(sender.agency_id) !== Number(agencyId) || sender.registration?.purposes?.includes('workforce')) throw fail(409, 'The sender is not this agency’s clinical campaign.');
  const purpose = category === 'account' ? 'billing' : ['conversations','relay','relay_control','help','preference'].includes(category) ? 'care' : 'reminders';
  const [[prior]] = await pool.execute('SELECT status,expires_at FROM sms_recipient_permissions WHERE scope_key=? AND phone=? AND purpose=?', [sender.scope, to, purpose]);
  if (!prior || (prior.status === 'opted_in' && prior.expires_at && Date.parse(prior.expires_at) < Date.now())) await recordSmsPermission({ scope: sender.scope, phone: to, purpose, status: 'opted_in', evidence: { source: 'auricwell_guarded_outbox', dispatchId: id }, expiresAt: new Date(Date.now() + 60000) });
  const { default: Vonage } = await import('../vonage.service.js');
  const result = await Vonage.sendSms({ to, from, body: body + smsFooter(category), agencyId, purpose });
  const providerId = result?.sid;
  if (!providerId) throw fail(503, 'The SMS receipt is uncertain.');
  return String(providerId);
}
export async function dispatchSms(id, deps = {}) {
  // Claim is committed BEFORE the carrier call. A crash/timeout cannot put a send
  // back in queued state. Independent processes contend on the same claim.
  const [[candidate]] = await pool.execute('SELECT * FROM auricwell_sms_outbox WHERE id=?', [id]);
  if (!candidate || candidate.status !== 'queued') return;
  const ctx = await practiceMessagingContext(candidate.practice_id);
  if (!ctx.settings.phiActivatedAt) return;
  const { settings } = await platformIntegrations();
  const body = open(candidate.payload, outboxContext(id));
  let route;
  try { route = assertMessagingReady(settings, ctx.practiceId); } catch { return; }
  try { assertMessagingReady(settings, ctx.practiceId, body.line); }
  catch {
    // An agency with its provider number removed must not block main-number sends.
    await pool.execute("UPDATE auricwell_sms_outbox SET status='suppressed',updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='queued'",[id]);return;
  }
  const [claim] = await pool.execute("UPDATE auricwell_sms_outbox SET status='sending',updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='queued' AND due_at<=UTC_TIMESTAMP(3)", [id]);
  if (!claim.affectedRows) return;
  let attempted = false;
  try {
    await transaction(async db => {
      const contact = await contactById(ctx, candidate.contact_id, db);
      const state = await phoneState(contact.data.phone, db, true);
      const fresh = await contactById(ctx, contact.id, db, true);
      const latest = (await platformIntegrations(db)).settings;
      route = assertMessagingReady(latest, ctx.practiceId, body.line);
      let permitted = fresh.data.categories?.[candidate.category] === true;
      if (candidate.category === 'welcome') permitted = Object.values(fresh.data.categories || {}).some(Boolean);
      if (['help','preference'].includes(candidate.category)) permitted = true; // Only queued in response to the recipient's command.
      if (candidate.category === 'conversations' && !permitted) permitted = Date.parse(fresh.data.inquiryAt || '') > Date.now() - 72 * 3600000;
      if (['relay','relay_control'].includes(candidate.category)) {
        permitted = await relayRecipientAllowed(ctx, body.relayAccountId, fresh.data.phone, db);
        if (permitted && candidate.category==='relay') await authorizedThread(await activeStaffContext(ctx, body.relayAccountId, db), body.relayThreadId, db);
      }
      if (state.blocked || !permitted || Date.parse(candidate.expires_at) <= Date.now() || !await sourceStillCurrent(ctx, body.source, fresh, db)) {
        await db.execute("UPDATE auricwell_sms_outbox SET status='suppressed',updated_at=UTC_TIMESTAMP(3) WHERE id=?", [id]); return;
      }
      if (fresh.patient_id && candidate.category !== 'relay') {
        const patient = await get(ctx, 'patient', fresh.patient_id, db);
        if (normalizeSessionPhone(patient.data.phone) !== fresh.data.phone || ['inactive','archived'].includes(patient.data.status)) {
          await db.execute("UPDATE auricwell_sms_outbox SET status='suppressed' WHERE id=?", [id]); return;
        }
        if (fresh.data.accountId) {
          const [[recipient]]=await db.execute(`SELECT m.patient_ids FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id
            WHERE m.practice_id=? AND m.account_id=? AND m.status='active' AND a.status='active' AND m.actor_type IN ('patient','guardian')`,[ctx.practiceId,fresh.data.accountId]);
          if (!recipient || !json(recipient.patient_ids,[]).includes(fresh.patient_id)) {
            await db.execute("UPDATE auricwell_sms_outbox SET status='suppressed' WHERE id=?",[id]);return;
          }
        }
      }
      if (body.actor && body.origin !== 'automation' && candidate.thread_id) {
        const actor = await activeStaffContext(ctx, body.actor, db);
        await authorizedThread(actor, candidate.thread_id, db);
      }
      attempted = true;
      const receipt = await (deps.send || sendClientSmsTransport)(latest, route, { to: fresh.data.phone, body: body.body, line: body.line, category: candidate.category, id, agencyId: ctx.agencyId });
      await db.execute("UPDATE auricwell_sms_outbox SET status='submitted',provider_id=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?", [receipt, id]);
      // A reply only clears the unanswered indicator after the carrier accepts it.
      // Do not clear it if a newer inbound message arrived while it was queued.
      if (candidate.thread_id && body.origin !== 'automation') {
        const thread=await get(ctx,'sms_thread',candidate.thread_id,db,true);
        if ((thread.data.lastInboundKey || null) === body.replyToEvent)
          await update(ctx,thread,{...thread.data,needsReply:false,lastSubmittedReplyId:id},db);
      }
    });
  } catch {
    await pool.execute("UPDATE auricwell_sms_outbox SET status=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='sending'", [attempted ? 'needs_review' : 'suppressed', id]);
  }
}
async function activeStaffContext(ctx, accountId, db = pool) {
  const [[row]] = await db.execute(`SELECT m.permissions,a.profile FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id
    WHERE m.practice_id=? AND m.account_id=? AND m.actor_type='staff' AND m.status='active' AND a.status='active'`, [ctx.practiceId, accountId]);
  if (!row) throw fail(403, 'Staff access is no longer active.');
  return { ...ctx, accountId, actorType: 'staff', permissions: json(row.permissions, []), profile: open(row.profile, `auricwell:account:${accountId}`) };
}
export async function linkedStaffMessagingContext(practiceId, accountId) {
  return activeStaffContext(await practiceMessagingContext(practiceId), accountId);
}
async function authorizedThread(ctx, id, db = pool) {
  requirePhi(ctx);
  if (ctx.actorType !== 'staff') throw fail(403, 'Staff messaging access required.');
  const thread = await get(ctx, 'sms_thread', id, db);
  const support = has(ctx, 'admin') || has(ctx, 'schedule');
  if (thread.data.line === 'provider' && thread.data.assignedTo !== ctx.accountId && !support) throw fail(403, 'This conversation belongs to the assigned provider.');
  if (thread.data.line === 'main' && !support) throw fail(403, 'Support inbox access required.');
  if (thread.patientId) {
    const patient = await patientAccess(ctx, thread.patientId, false, db);
    if (thread.data.line === 'provider' && !support) {
      const config = await findSource(ctx, 'sms_staff_relay', ctx.accountId, db);
      if (!patient.data.careTeam?.includes(ctx.accountId) || !config?.data.providerTexting)
        throw fail(403, 'Provider texting is no longer enabled for this assignment.');
    }
  }
  return thread;
}
export async function smsInbox(ctx, patientId = null) {
  requirePhi(ctx);
  if (ctx.actorType !== 'staff') throw fail(403, 'Staff messaging access required.');
  if (patientId) await patientAccess(ctx, patientId);
  const threads = [];
  for (const thread of await list(ctx, 'sms_thread', { ...(patientId ? { patientId } : {}), limit: 1000 })) {
    try {
      await authorizedThread(ctx, thread.id);
      const contact = await contactById(ctx, thread.data.contactId);
      const state = await phoneState(contact.data.phone);
      threads.push({ ...thread, phone: contact.data.phone, stopped: !!state.blocked });
    } catch (e) { if (e.status !== 403) throw e; }
  }
  return threads.sort((a,b) => String(b.data.lastAt).localeCompare(String(a.data.lastAt)));
}
export async function smsConversation(ctx, id) {
  const thread = await authorizedThread(ctx, id);
  const messages = await sourceRecords(ctx, 'sms_message', id);
  const [rows] = await pool.execute('SELECT * FROM auricwell_sms_outbox WHERE practice_id=? AND thread_id=? ORDER BY created_at', [ctx.practiceId, id]);
  const contact = await contactById(ctx, thread.data.contactId);
  const state = await phoneState(contact.data.phone);
  await audit(ctx, 'sms.conversation_viewed', id);
  const providerChoices = [];
  if (has(ctx,'admin') && thread.data.line==='provider' && thread.patientId) {
    const patient=await get(ctx,'patient',thread.patientId);
    for (const accountId of patient.data.careTeam || []) {
      const config=await findSource(ctx,'sms_staff_relay',accountId);
      if (!config?.data.providerTexting) continue;
      try { const actor=await activeStaffContext(ctx,accountId); providerChoices.push({id:accountId,name:actor.profile.name || 'Provider'}); } catch { /* Inactive assignment. */ }
    }
  }
  return { thread, providerChoices, phone: contact.data.phone, stopped: !!state.blocked, messages: [
    ...messages.map(m => ({ id: m.id, ...m.data, direction: 'inbound', at: m.data.at })),
    ...rows.map(r => ({ id: r.id, ...open(r.payload, outboxContext(r.id)), direction: 'outbound', status: r.status, at: r.created_at })),
  ].sort((a,b) => Date.parse(a.at) - Date.parse(b.at)) };
}
export async function replySms(ctx, id, input, { origin = 'app' } = {}) {
  const thread = await authorizedThread(ctx, id);
  const contact = await contactById(ctx, thread.data.contactId);
  if ((await phoneState(contact.data.phone)).blocked) throw fail(409, 'All SMS is stopped. Use app, email or phone. The recipient must text START to restore replies.');
  const { settings } = await platformIntegrations();
  assertMessagingReady(settings, ctx.practiceId, thread.data.line);
  if (!/^[a-z0-9-]{16,100}$/i.test(input.requestId || '')) throw fail(400, 'A unique reply request ID is required.');
  return transaction(async db => {
    await lockPractice(ctx, db);
    const current = await get(ctx, 'sms_thread', id, db, true);
    const queued = await queueSms(ctx, { contactId: contact.id, threadId: id, category: 'conversations', body: String(input.body || '').trim(),
      key: `reply:${ctx.accountId}:${input.requestId}`, line: thread.data.line, origin, replyToEvent: current.data.lastInboundKey }, db);
    await update(ctx, current, { ...current.data, status: 'open', needsReply: true, lastAt: now(), lastReplyBy: ctx.accountId }, db);
    return queued;
  });
}
export async function closeSmsThread(ctx, id) {
  await authorizedThread(ctx, id);
  return transaction(async db => {
    await lockPractice(ctx, db);
    const thread = await get(ctx, 'sms_thread', id, db, true);
    return update(ctx, thread, { ...thread.data, status: 'resolved', needsReply: false, resolvedAt: now(), resolvedBy: ctx.accountId }, db);
  });
}
export async function startSmsThread(ctx, patientId, line = 'main') {
  const patient = await patientAccess(ctx, patientId);
  if (ctx.actorType !== 'staff' || !['main','provider'].includes(line)) throw fail(403, 'Staff texting access is required.');
  const contact = await contactByPhone(ctx, patient.data.phone);
  if (!contact || contact.patient_id !== patientId || !contact.data.categories?.conversations) throw fail(409, 'Record permission for staff/provider texts first.');
  return transaction(async db => {
    await lockPractice(ctx, db);
    const prior = await findSource(ctx, 'sms_thread', `${contact.id}:${line}`, db);
    const thread = prior || await incomingThread(ctx, contact, line, { at:Date.now() }, db);
    await authorizedThread(ctx,thread.id,db);
    return thread;
  });
}
export async function assignSmsThread(ctx,id,accountId) {
  requirePermission(ctx,'admin');
  const thread=await authorizedThread(ctx,id);
  if (thread.data.line!=='provider'||!thread.patientId) throw fail(409,'Link this provider conversation to a single client first.');
  const patient=await get(ctx,'patient',thread.patientId);
  const config=await findSource(ctx,'sms_staff_relay',accountId);
  await activeStaffContext(ctx,accountId);
  if (!patient.data.careTeam?.includes(accountId)||!config?.data.providerTexting) throw fail(403,'Choose an enabled provider assigned to this client.');
  return update(ctx,thread,{...thread.data,assignedTo:accountId});
}
async function incomingContact(ctx, event, db) {
  const prior = await contactByPhone(ctx, event.from, db, true);
  if (prior) {
    // An incoming inquiry authorizes a direct response, never unrelated alerts.
    await writeContact(ctx, prior, { ...prior.data, inquiryAt: new Date(event.at).toISOString() }, db);
    return contactById(ctx, prior.id, db);
  }
  const matches = (await list(ctx, 'patient', { limit: 10000 }, db)).filter(p => normalizeSessionPhone(p.data.phone) === event.from);
  const patientId = matches.length === 1 ? matches[0].id : null;
  const id = crypto.randomUUID();
  const data = { phone: event.from, categories: emptyCategories(), inquiryAt: new Date(event.at).toISOString(), ambiguous: matches.length > 1 };
  await db.execute('INSERT INTO auricwell_sms_contacts (id,practice_id,phone_key,patient_id,payload) VALUES (?,?,?,?,?)', [id, ctx.practiceId, phoneKey(event.from), patientId, seal(data, contactContext(id))]);
  return contactById(ctx, id, db);
}
async function incomingThread(ctx, contact, line, event, db) {
  const sourceKey = `${contact.id}:${line}`;
  let thread = await findSource(ctx, 'sms_thread', sourceKey, db);
  const patient = contact.patient_id ? await get(ctx, 'patient', contact.patient_id, db) : null;
  const providers = (patient?.data.careTeam || []);
  let assignedTo = null;
  if (line === 'provider' && providers.length === 1) {
    const config = await findSource(ctx, 'sms_staff_relay', providers[0], db);
    if (config?.data.providerTexting === true) assignedTo = providers[0];
  }
  if (thread) {
    if (line==='provider' && providers.includes(thread.data.assignedTo)) {
      const priorConfig=await findSource(ctx,'sms_staff_relay',thread.data.assignedTo,db);
      if (priorConfig?.data.providerTexting) assignedTo=thread.data.assignedTo;
    }
    return update(ctx, thread, { ...thread.data, assignedTo, status: 'open', needsReply: true, lastInboundKey: event.key || null, lastAt: new Date(event.at).toISOString() }, db);
  }
  const name = String(patient?.data.name || '').split(/\s+/).map(n => n.replace(/[^a-z]/gi, '').slice(0,3)).join('').slice(0,12);
  const [[count]] = await db.execute('SELECT COUNT(*) AS total FROM auricwell_sms_thread_tags WHERE practice_id=?',[ctx.practiceId]);
  const base = name || String(100 + Number(count.total)), id = crypto.randomUUID();
  let tag=base, suffix=1;
  for (;;) {
    const [reserved]=await db.execute('INSERT IGNORE INTO auricwell_sms_thread_tags (practice_id,tag_key,thread_id) VALUES (?,?,?)',[ctx.practiceId,hash(tag.toLowerCase()),id]);
    if (reserved.affectedRows) break;
    tag=`${base}${++suffix}`;
  }
  return create(ctx, 'sms_thread', { contactId: contact.id, line, tag, assignedTo, status: 'open', needsReply: true,
    title: patient?.data.name || 'New inquiry', lastInboundKey: event.key || null, lastAt: new Date(event.at).toISOString() }, { id, patientId: contact.patient_id, sourceKey }, db);
}
async function applyCommand(ctx, event, command, db) {
  const state = await phoneState(event.from, db, true);
  const contact = await contactByPhone(ctx, event.from, db, true);
  if (['stop','start'].includes(command.type)) {
    if (event.at < Number(state.command_at) || (event.at === Number(state.command_at) && command.type === 'start')) return;
    await db.execute('UPDATE auricwell_sms_phone_state SET blocked=?,command_at=?,updated_at=UTC_TIMESTAMP(3) WHERE phone_key=?', [command.type === 'stop', event.at, phoneKey(event.from)]);
    if (command.type === 'stop') {
      await db.execute(`UPDATE auricwell_sms_outbox o JOIN auricwell_sms_contacts c ON c.id=o.contact_id SET o.status='suppressed',o.updated_at=UTC_TIMESTAMP(3)
        WHERE c.phone_key=? AND o.status='queued'`, [phoneKey(event.from)]);
    }
    // Carrier handles the standard STOP/START confirmation. No duplicate SMS.
    return;
  }
  if (command.type === 'category' && contact) {
    const changed = contact.data.commandAt?.[command.category] || 0;
    if (event.at >= changed) await writeContact(ctx, contact, { ...contact.data,
      categories: { ...contact.data.categories, [command.category]: false },
      commandAt: { ...contact.data.commandAt, [command.category]: event.at } }, db);
  }
}
export async function acceptNotifyreWebhook(raw, header) {
  const { settings } = await platformIntegrations();
  const parsed = verifyNotifyreSignature(raw, header, settings.notifyre.webhookSecret);
  const event = normalizeNotifyreEvent(parsed);
  const route = event.type === 'inbound' ? settings.clientMessaging.routes.find(r => [r.mainNumber, r.providerNumber].includes(event.to)) : null;
  if (event.type === 'inbound' && !route) throw fail(409, 'This receiving number has no agency route.');
  await transaction(async db => {
    const [insert] = await db.execute('INSERT IGNORE INTO auricwell_sms_events (event_key,payload) VALUES (?,?)', [event.key, seal({ ...event, practiceId: route?.practiceId || null, line: route?.providerNumber === event.to ? 'provider' : 'main' }, eventContext(event.key))]);
    if (!insert.affectedRows) return;
    const command = event.type === 'inbound' ? smsCommand(event.body) : null;
    if (command && ['stop','start','category'].includes(command.type)) {
      const ctx = await practiceMessagingContext(route.practiceId, db);
      await applyCommand(ctx, event, command, db);
    }
  });
  await recordNotifyreWebhookVerified();
  return { accepted: true };
}
// Invoked only after the existing Vonage signature middleware validates callbacks.
// Workforce Campaign 2 numbers do not match these platform-owned clinical routes.
export async function acceptVonageClientInbound({ from, to, body, messageId, timestamp }) {
  if (process.env.AURICWELL_ENABLED !== 'true') return false;
  const { settings } = await platformIntegrations();
  const route = settings.clientMessaging.routes.find(r => r.verifiedProvider === 'vonage' && [r.mainNumber,r.providerNumber].includes(normalizeSessionPhone(to)));
  if (!route) return false;
  if (!messageId || !normalizeSessionPhone(from)) throw fail(400, 'Missing clinical SMS identity.');
  const parsed = Number(timestamp) * 1000;
  const event = { type:'inbound', carrier:'vonage', id:String(messageId), from:normalizeSessionPhone(from), to:normalizeSessionPhone(to), body:String(body || ''),
    at:Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now(), key:hash(`vonage:inbound:${messageId}`), practiceId:route.practiceId, line:route.providerNumber === normalizeSessionPhone(to) ? 'provider' : 'main' };
  await transaction(async db => {
    const [insert] = await db.execute('INSERT IGNORE INTO auricwell_sms_events (event_key,payload) VALUES (?,?)', [event.key,seal(event,eventContext(event.key))]);
    if (!insert.affectedRows) return;
    const command = smsCommand(event.body);
    if (command && ['stop','start','category'].includes(command.type)) await applyCommand(await practiceMessagingContext(route.practiceId,db),event,command,db);
  });
  return true;
}
export async function acceptVonageClientDelivery(id, status) {
  if (process.env.AURICWELL_ENABLED !== 'true') return;
  const [[row]] = await pool.execute('SELECT id FROM auricwell_sms_outbox WHERE provider_id=?', [String(id)]);
  if (!row) return;
  const event = { type:'delivery', id:String(id), status:String(status).toLowerCase(), key:hash(`vonage:delivery:${id}:${status}`) };
  await pool.execute('INSERT IGNORE INTO auricwell_sms_events (event_key,payload) VALUES (?,?)', [event.key,seal(event,eventContext(event.key))]);
}
async function stopNotices(event, db) {
  const [rows] = await db.execute('SELECT * FROM auricwell_sms_contacts WHERE phone_key=?', [phoneKey(event.from)]);
  for (const row of rows) {
    const contact = decodeContact(row);
    if (!contact.data.accountId) continue;
    const ctx = await practiceMessagingContext(row.practice_id, db);
    const { settings } = await platformIntegrations(db);
    const route = routeFor(settings, ctx.practiceId);
    const body = `Text messages are turned off, including appointment, form, billing and staff/provider texts. We cannot reply by SMS while you are opted out. You can still contact us through the app, email or phone. To receive SMS again, text START to ${route?.mainNumber || event.to}. Your individual notification choices will stay as you set them.`;
    if (!await findSource(ctx, 'sms_notice', event.key, db)) await create(ctx, 'sms_notice', {
      accountId: contact.data.accountId, email: contact.data.email || '', body, emailStatus: 'pending', at: now(), read: false,
    }, { patientId: contact.patient_id, sourceKey: event.key }, db);
  }
}
export async function processSmsEvent(key) {
  await transaction(async db => {
    const [[row]] = await db.execute("SELECT * FROM auricwell_sms_events WHERE event_key=? AND status='pending' FOR UPDATE", [key]);
    if (!row) return;
    const event = open(row.payload, eventContext(key));
    if (event.type === 'delivery') {
      // Job 'completed' is not proof of delivery; only recipient delivered/sent statuses advance it.
      const status = ['delivered','successful'].includes(event.status) ? 'delivered' : ['failed','rejected','undeliverable'].includes(event.status) ? 'failed' : 'submitted';
      await db.execute("UPDATE auricwell_sms_outbox SET status=?,updated_at=UTC_TIMESTAMP(3) WHERE provider_id=? AND status IN ('submitted','sending','needs_review')", [status, event.id]);
      // A callback can beat the send receipt. Leave it pending to reconcile next tick.
      const [[sent]] = await db.execute('SELECT id,practice_id,thread_id FROM auricwell_sms_outbox WHERE provider_id=?', [event.id]);
      if (status==='failed' && sent?.thread_id) {
        const ctx=await practiceMessagingContext(sent.practice_id,db);
        const thread=await get(ctx,'sms_thread',sent.thread_id,db,true);
        if (thread.data.lastSubmittedReplyId===sent.id)
          await update(ctx,thread,{...thread.data,status:'open',needsReply:true},db);
      }
      if (!sent && Date.now() - Date.parse(row.created_at) < 86400000) {
        await db.execute('UPDATE auricwell_sms_events SET updated_at=UTC_TIMESTAMP(3) WHERE event_key=?',[key]);return;
      }
    } else {
      const ctx = await practiceMessagingContext(event.practiceId, db);
      requirePhi(ctx);
      const command = smsCommand(event.body);
      if (command?.type === 'stop') await stopNotices(event, db);
      else if (!command || command.type === 'attendance') {
        // Staff relay commands are processed outside this transaction, through the
        // same authenticated reply path used by the inbox.
        const relays = await list(ctx, 'sms_staff_relay', {}, db);
        const relay = relays.find(r => normalizeSessionPhone(r.data.phone) === event.from);
        if (relay) {
          await db.execute("UPDATE auricwell_sms_events SET status='relay_pending',updated_at=UTC_TIMESTAMP(3) WHERE event_key=?", [key]); return;
        }
        await lockPractice(ctx, db);
        const contact = await incomingContact(ctx, event, db);
        const thread = await incomingThread(ctx, contact, event.line, event, db);
        await create(ctx, 'sms_message', { threadId: thread.id, body: event.body, at: new Date(event.at).toISOString(), origin: 'client_sms', attachment: event.attachment, providerId: event.id }, { patientId: thread.patientId, sourceKey: `${thread.id}:${event.key}` }, db);
        if (command?.type === 'attendance' && contact.patient_id) {
          const appointments = (await list(ctx, 'appointment', { patientId: contact.patient_id }, db)).filter(a => ['scheduled','confirmed'].includes(a.data.status)
            && Date.parse(a.data.start) >= event.at && Date.parse(a.data.start) < event.at + 2 * 86400000);
          if (appointments.length === 1) await update(ctx, appointments[0], { ...appointments[0].data, status: 'confirmed', smsConfirmedAt: new Date(event.at).toISOString() }, db);
        }
        await queueRelays(ctx, thread, event, db);
        await queueFaq(ctx, thread, contact, event, db);
      } else if (['help','category'].includes(command.type) && !(event.carrier === 'vonage' && command.type === 'help')) {
        const contact = await contactByPhone(ctx, event.from, db) || (command.type === 'help' ? await incomingContact(ctx, event, db) : null);
        if (contact) {
          const route = routeFor((await platformIntegrations(db)).settings, ctx.practiceId);
          const body = command.type === 'help' ? `${route.brand}: For help, contact ${route.support}.`
            : `${route.brand}: ${command.category === 'forms' ? 'Form texts' : command.category === 'links' ? 'Session-link texts' : 'Appointment reminder texts'} are turned off. Other permitted messages remain available. You can change preferences in your portal.`;
          await queueSms(ctx, { contactId: contact.id, category: command.type === 'help' ? 'help' : 'preference', body, key: `command:${event.key}`, expiresAt: Date.now() + 3600000 }, db);
        }
      }
    }
    await db.execute("UPDATE auricwell_sms_events SET status='processed',updated_at=UTC_TIMESTAMP(3) WHERE event_key=?", [key]);
  });
}
export async function smsNotices(ctx) {
  const notices=[];
  for (const n of await list(ctx, 'sms_notice')) {
    if (n.data.accountId!==ctx.accountId) continue;
    const patient=n.patientId?await get(ctx,'patient',n.patientId):null;
    if (patient && !(await phoneState(patient.data.phone)).blocked) continue;
    notices.push({id:n.id,body:n.data.body,at:n.data.at});
  }
  return notices.slice(0,1);
}
async function sendStopNoticeEmails(ctx, deps = {}) {
  for (const notice of await list(ctx, 'sms_notice')) {
    if (notice.data.emailStatus !== 'pending' || !notice.data.email) continue;
    let current;
    try { current = await update(ctx, notice, { ...notice.data, emailStatus: 'sending' }); } catch (e) { if (e.status === 409) continue; throw e; }
    try {
      const [[account]] = await pool.execute(`SELECT a.profile FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id WHERE a.id=? AND a.status='active' AND m.practice_id=? AND m.status='active'`, [notice.data.accountId, ctx.practiceId]);
      if (!account || open(account.profile, `auricwell:account:${notice.data.accountId}`).email !== notice.data.email) throw fail(409, 'Recipient changed.');
      const { default: Email } = await import('../email.service.js');
      const result = await (deps.sendEmail || Email.sendEmail.bind(Email))({ to: notice.data.email, subject: 'Your text-message preferences', text: notice.data.body,
        agencyId: ctx.agencyId, fromName: ctx.practiceName, source: 'auto', templateType: 'auricwell_sms_opt_out' });
      if (!result?.id || result.skipped || result.blocked || result.redirected || result.queued) throw new Error('Not sent');
      await update(ctx, current, { ...current.data, emailStatus: 'sent' });
    } catch { await update(ctx, current, { ...current.data, emailStatus: 'needs_review' }); }
  }
}
export async function messagingOperations(ctx) {
  requirePermission(ctx, 'admin');
  const config = await findSource(ctx, 'sms_operations', 'settings');
  const relays = await list(ctx, 'sms_staff_relay');
  const [staff] = await pool.execute(`SELECT a.id,a.profile,m.permissions FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id
    WHERE m.practice_id=? AND m.actor_type='staff' AND m.status='active' AND a.status='active'`, [ctx.practiceId]);
  return { revision: config?.revision || 0, faqs: config?.data.faqs || [], resolvedCloseDays: config?.data.resolvedCloseDays || 7,
    relays: relays.map(r => ({ id: r.id, revision: r.revision, ...r.data })),
    staff: staff.map(s => ({ id: s.id, name: open(s.profile, `auricwell:account:${s.id}`).name })) };
}
export async function saveMessagingOperations(ctx, input) {
  requirePermission(ctx, 'admin');
  const faqs = Array.isArray(input.faqs) ? input.faqs : [];
  if (faqs.length > 30 || faqs.some(f => !String(f.question || '').trim() || !String(f.answer || '').trim() || f.answer.length > 1000)) throw fail(400, 'Enter an exact question and approved answer for each FAQ.');
  const days = Number(input.resolvedCloseDays);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw fail(400, 'Choose 1–90 days for resolved conversations.');
  await transaction(async db => {
    await lockPractice(ctx, db);
    const prior = await findSource(ctx, 'sms_operations', 'settings', db);
    if ((prior?.revision || 0) !== input.revision) throw fail(409, 'Messaging settings changed. Reload first.');
    const data = { faqs: faqs.map(f => ({ question: f.question.trim().slice(0,300), answer: f.answer.trim(), enabled: f.enabled === true })), resolvedCloseDays: days, approvedBy: ctx.accountId, approvedAt: now() };
    if (prior) await update(ctx, prior, data, db); else await create(ctx, 'sms_operations', data, { sourceKey: 'settings' }, db);
  });
  return messagingOperations(ctx);
}
export async function saveStaffRelay(ctx, accountId, input) {
  requirePermission(ctx, 'admin');
  await activeStaffContext(ctx, accountId);
  const phone = normalizeSessionPhone(input.phone);
  if ((input.enabled && !phone) || (input.phone && !phone) || typeof input.timezone !== 'string') throw fail(400, 'Enter a valid staff phone for forwarding and timezone.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format(); } catch { throw fail(400, 'Choose a valid timezone.'); }
  const shifts = Array.isArray(input.shifts) ? input.shifts : [];
  if (shifts.length > 21 || shifts.some(s => !Number.isInteger(s.day) || s.day < 0 || s.day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end) || s.start >= s.end)) throw fail(400, 'Enter valid same-day work hours. Split overnight shifts across days.');
  if (input.enabled && (!input.consentConfirmed || !input.deviceApproved)) throw fail(400, 'Confirm staff permission and approved device handling before forwarding messages.');
  await transaction(async db => {
    await lockPractice(ctx, db);
    const all = await list(ctx, 'sms_staff_relay', {}, db);
    if (phone && all.some(r => r.data.accountId !== accountId && r.data.phone === phone)) throw fail(409, 'This staff phone is already assigned.');
    const prior = await findSource(ctx, 'sms_staff_relay', accountId, db);
    if ((prior?.revision || 0) !== input.revision) throw fail(409, 'Staff settings changed. Reload first.');
    const data = { accountId, phone, enabled: input.enabled === true, providerTexting: input.providerTexting === true,
      support: input.support === true, timezone: input.timezone, shifts, consentConfirmed: input.consentConfirmed === true,
      deviceApproved: input.deviceApproved === true, approvedBy: ctx.accountId, approvedAt: now() };
    if (prior) await update(ctx, prior, data, db); else await create(ctx, 'sms_staff_relay', data, { sourceKey: accountId }, db);
  });
  return messagingOperations(ctx);
}
async function relayRecipientAllowed(ctx, accountId, phone, db) {
  if (!accountId) return false;
  const config = await findSource(ctx, 'sms_staff_relay', accountId, db);
  if (!config || config.data.phone !== phone || !onRelayShift(config.data)) return false;
  try { await activeStaffContext(ctx, accountId, db); return true; } catch { return false; }
}
async function queueRelays(ctx, thread, event, db) {
  const relays = await list(ctx, 'sms_staff_relay', {}, db);
  for (const relay of relays) {
    if (!onRelayShift(relay.data)) continue;
    if (thread.data.line === 'main' ? !relay.data.support : thread.data.assignedTo !== relay.data.accountId) continue;
    let actor;
    try { actor = await activeStaffContext(ctx, relay.data.accountId, db); await authorizedThread(actor, thread.id, db); } catch { continue; }
    let contact = await contactByPhone(ctx, relay.data.phone, db);
    if (contact?.patient_id) continue; // Never turn a patient contact into a staff relay.
    if (!contact) {
      const id = crypto.randomUUID();
      await db.execute('INSERT INTO auricwell_sms_contacts (id,practice_id,phone_key,payload) VALUES (?,?,?,?)', [id, ctx.practiceId, phoneKey(relay.data.phone), seal({ phone: relay.data.phone, categories: emptyCategories(), staffAccountId: relay.data.accountId }, contactContext(id))]);
      contact = await contactById(ctx, id, db);
    }
    await queueSms(ctx, { contactId: contact.id, category: 'relay', key: `relay:${event.key}:${relay.id}`, relayAccountId: relay.data.accountId, relayThreadId: thread.id,
      body: `(${thread.data.tag}) ${event.body.slice(0,3000)}${event.body.length>3000?'… Read the full message in the app.':''}\nReply ${thread.data.tag} followed by your message, or ${thread.data.tag} CLOSED to resolve.`,
      expiresAt: Date.now() + 30 * 60000, source: null }, db);
  }
}
async function processRelayEvent(row) {
  const event = open(row.payload, eventContext(row.event_key));
  const ctx = await practiceMessagingContext(event.practiceId);
  const relay = (await list(ctx, 'sms_staff_relay')).find(r => r.data.phone === event.from);
  try {
    if (!relay || !onRelayShift(relay.data)) throw fail(403, 'Relay not available.');
    const actor = await activeStaffContext(ctx, relay.data.accountId);
    const parsed = parseRelayReply(event.body);
    if (!parsed) throw fail(400, 'A conversation code is required.');
    const [[match]]=await pool.execute('SELECT thread_id FROM auricwell_sms_thread_tags WHERE practice_id=? AND tag_key=?',[ctx.practiceId,hash(parsed.tag)]);
    if (!match) throw fail(400, 'Conversation code not found.');
    const thread = await authorizedThread(actor, match.thread_id);
    if (parsed.close) await closeSmsThread(actor, thread.id);
    else await replySms(actor, thread.id, { body: parsed.body, requestId: event.key }, { origin: 'staff_sms' });
    await pool.execute("UPDATE auricwell_sms_events SET status='processed',updated_at=UTC_TIMESTAMP(3) WHERE event_key=?", [row.event_key]);
  } catch {
    // Never guess the last client or forward malformed instructions.
    await pool.execute("UPDATE auricwell_sms_events SET status='needs_review',updated_at=UTC_TIMESTAMP(3) WHERE event_key=?", [row.event_key]);
    if (relay) {
      await audit({ ...ctx, accountId: relay.data.accountId }, 'sms.relay_rejected', null, { eventKey: row.event_key });
      const contact=await contactByPhone(ctx,event.from);
      if (contact) await queueSms(ctx,{contactId:contact.id,category:'relay_control',relayAccountId:relay.data.accountId,key:`relay-error:${row.event_key}`,
        body:'Your reply was not sent. Include the conversation code followed by your message, and check that you are on duty. For stopped texts or other issues, open the conversation in the app.',expiresAt:Date.now()+3600000});
    }
  }
}
async function queueFaq(ctx, thread, contact, event, db) {
  if (event.line !== 'main') return;
  const settings = await findSource(ctx, 'sms_operations', 'settings', db);
  const normalize = s => s.toLowerCase().replace(/[?.!]+$/g, '').trim();
  const faq = settings?.data.faqs?.find(f => f.enabled && normalize(f.question) === normalize(event.body));
  if (!faq) return;
  await queueSms(ctx, { contactId: contact.id, threadId: thread.id, category: 'conversations', body: `Automated reply: ${faq.answer}`,
    key: `faq:${contact.id}:${hash(normalize(faq.question))}:${Math.floor(event.at / 900000)}`, expiresAt: Date.now() + 3600000 }, db);
  // The incoming question still requires staff follow-up, even after an FAQ.
}
export async function messagingDeliveryQueue(ctx) {
  requirePermission(ctx, 'admin');
  const [rows] = await pool.execute("SELECT id,category,status,created_at,updated_at FROM auricwell_sms_outbox WHERE practice_id=? ORDER BY created_at DESC LIMIT 200", [ctx.practiceId]);
  const [events] = await pool.execute("SELECT event_key,payload,status,created_at FROM auricwell_sms_events WHERE status='needs_review' ORDER BY created_at DESC LIMIT 200");
  return { deliveries: rows, inboundReview: events.filter(r => open(r.payload, eventContext(r.event_key)).practiceId === ctx.practiceId).map(r => ({ id: r.event_key, status: r.status, at: r.created_at })) };
}
export async function retryClientSms(ctx, id, confirmedNotSent) {
  requirePermission(ctx, 'admin');
  if (confirmedNotSent !== true) throw fail(400, 'Confirm in the carrier account that the message was not sent.');
  const [result] = await pool.execute("UPDATE auricwell_sms_outbox SET status='queued',updated_at=UTC_TIMESTAMP(3) WHERE id=? AND practice_id=? AND status='needs_review' AND expires_at>UTC_TIMESTAMP(3)", [id, ctx.practiceId]);
  if (!result.affectedRows) throw fail(409, 'Only unexpired messages awaiting review can be retried.');
  await audit(ctx, 'sms.retry_authorized', id);
  return { queued: true };
}
export async function retryInboundSms(ctx,id) {
  requirePermission(ctx,'admin');
  const [[row]]=await pool.execute("SELECT payload FROM auricwell_sms_events WHERE event_key=? AND status='needs_review'",[id]);
  if (!row || open(row.payload,eventContext(id)).practiceId!==ctx.practiceId) throw fail(404,'Event not available for review in this practice.');
  await pool.execute("UPDATE auricwell_sms_events SET status='pending',attempts=0,updated_at=UTC_TIMESTAMP(3) WHERE event_key=? AND status='needs_review'",[id]);
  await audit(ctx,'sms.inbound_retry_authorized',null,{eventKey:id});return{queued:true};
}
export async function runClientMessaging(deps = {}) {
  if (process.env.AURICWELL_ENABLED !== 'true') return;
  const [events] = await pool.execute("SELECT * FROM auricwell_sms_events WHERE status IN ('pending','relay_pending') ORDER BY updated_at LIMIT 100");
  for (const event of events) {
    try { if (event.status === 'relay_pending') await processRelayEvent(event); else await processSmsEvent(event.event_key); }
    catch { await pool.execute("UPDATE auricwell_sms_events SET attempts=attempts+1,status=IF(attempts>=9,'needs_review','pending'),updated_at=UTC_TIMESTAMP(3) WHERE event_key=? AND status='pending'", [event.event_key]); }
  }
  await pool.execute("UPDATE auricwell_sms_outbox SET status='needs_review',updated_at=UTC_TIMESTAMP(3) WHERE status='sending' AND updated_at<UTC_TIMESTAMP(3)-INTERVAL 5 MINUTE");
  await pool.execute("UPDATE auricwell_sms_outbox SET status='expired',updated_at=UTC_TIMESTAMP(3) WHERE status='queued' AND expires_at<=UTC_TIMESTAMP(3)");
  const { settings } = await platformIntegrations();
  for (const route of settings.clientMessaging.routes) {
    try {
      const ctx = await practiceMessagingContext(route.practiceId);
      // A pending/paused campaign cannot starve another agency's ready outbox.
      let ready = false;
      try { assertMessagingReady(settings,route.practiceId); ready = !!ctx.settings.phiActivatedAt; } catch { /* Still accept replies and preferences while paused. */ }
      if (ready) {
        const [outbox] = await pool.execute("SELECT id FROM auricwell_sms_outbox WHERE practice_id=? AND status='queued' AND due_at<=UTC_TIMESTAMP(3) ORDER BY due_at LIMIT 100",[route.practiceId]);
        for (const item of outbox) { try { await dispatchSms(item.id, deps); } catch { /* Isolate malformed records. */ } }
      }
      await sendStopNoticeEmails(ctx, deps);
      await queuePendingDocuments(ctx);
      const ops = await findSource(ctx, 'sms_operations', 'settings');
      const cutoff = Date.now() - (ops?.data.resolvedCloseDays || 7) * 86400000;
      for (const thread of await list(ctx, 'sms_thread', { limit: 10000 })) {
        if (thread.data.status === 'resolved' && !thread.data.needsReply && Date.parse(thread.data.resolvedAt) < cutoff)
          await update(ctx, thread, { ...thread.data, status: 'closed' });
      }
    } catch { /* Other practices must continue. */ }
  }
}
export async function queuePendingDocuments(ctx) {
  if (!ctx.settings.phiActivatedAt) return;
  const portal = `${String(process.env.AURICWELL_PUBLIC_ORIGIN || 'https://auricwell.com').replace(/\/$/, '')}/app/${encodeURIComponent(ctx.slug)}`;
  for (const intake of await list(ctx, 'intake', { limit: 10000 })) {
    if (!intake.patientId || !['assigned','draft','needs_changes'].includes(intake.data.status)) continue;
    // One notice per assignment/review cycle, rather than every scheduler tick.
    await queuePatientSms(ctx, intake.patientId, { category: 'forms', key: `intake:${intake.id}:${intake.data.submissionNumber || 0}`,
      recipientAccountId: intake.data.respondentAccountId, body: `${ctx.practiceName}: A form is ready for you to complete. Sign in: ${portal}/intake`,
      source: { kind: 'intake', id: intake.id }, expiresAt: Date.now() + 7 * 86400000 });
  }
  for (const agreement of await list(ctx, 'agreement', { limit: 10000 })) {
    if (!agreement.patientId || !['issued','partially_signed'].includes(agreement.data.status)) continue;
    for (const signer of agreement.data.signers || []) {
      if (agreement.data.signatures?.some(s => s.accountId === signer.accountId)) continue;
      await queuePatientSms(ctx, agreement.patientId, { category: 'forms', key: `agreement:${agreement.id}:${signer.accountId}`,
        recipientAccountId: signer.accountId, body: `${ctx.practiceName}: A document is ready for your review and signature. Sign in: ${portal}/agreements`, source: { kind: 'agreement', id: agreement.id }, expiresAt: Date.now() + 7 * 86400000 });
    }
  }
}
