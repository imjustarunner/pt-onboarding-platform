import { parseSmsThreadKey } from '../utils/smsThreadIdentity.js';
import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';

function previewFrom(text) {
  return (
    String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240) || null
  );
}

/**
 * Project SMS threads + call/voicemail logs into communication_conversations
 * so they appear in the unified list with channel icons.
 * Idempotent via external_thread_id (sms:client:N, sms:contact:N, call:N, vm:N).
 */
export async function syncSmsAndCallsToInbox({ agencyId, limit = 60 } = {}) {
  if (!agencyId) return { sms: 0, calls: 0, voicemails: 0 };
  const lim = Math.min(Math.max(Number(limit) || 60, 1), 150);
  const sms = await syncSmsThreads({ agencyId, limit: lim });
  const calls = await syncCallLogs({ agencyId, limit: lim });
  const voicemails = await syncVoicemails({ agencyId, limit: Math.min(lim, 40) });
  return { sms, calls, voicemails };
}

async function upsertShell({
  agencyId,
  externalThreadId,
  channel,
  subject,
  preview,
  lastAt,
  status = 'new',
  ownerUserId = null,
  participant
}) {
  let conv = await CommunicationConversation.findByExternalThreadId(agencyId, externalThreadId);
  if (!conv) {
    conv = await CommunicationConversation.create({
      agencyId,
      inboxId: null,
      channel,
      subject,
      status,
      lastMessageAt: lastAt || new Date(),
      lastMessagePreview: preview,
      externalThreadId, ownerUserId
    });
    if (participant) {
      await CommunicationConversation.upsertParticipant(conv.id, {
        kind: participant.kind || 'other',
        email: participant.email || null,
        displayName: participant.displayName || subject,
        linkedEntityType: participant.linkedEntityType || null,
        linkedEntityId: participant.linkedEntityId || null,
        isPrimary: true
      });
    }
    return { created: true, conv };
  }
  await CommunicationConversation.update(conv.id, {
    subject,
    lastMessageAt: lastAt || conv.last_message_at,
    lastMessagePreview: preview || conv.last_message_preview
  });
  return { created: false, conv: await CommunicationConversation.findById(conv.id) };
}

export async function syncSmsThreads({ agencyId, limit = 100 }) {
  const [rows] = await pool.execute(
    `SELECT ml.client_id, ml.agency_contact_id, ml.sms_thread_key, ml.assigned_user_id, ml.user_id,
       ml.created_at AS last_message_at, ml.body AS last_body,
       COALESCE(c.full_name, c.initials, ac.full_name, 'SMS') AS party_name
     FROM message_logs ml
     JOIN (SELECT MAX(id) AS id FROM message_logs WHERE agency_id = ? AND sms_thread_key IS NOT NULL GROUP BY sms_thread_key) latest ON latest.id = ml.id
     LEFT JOIN clients c ON c.id = ml.client_id
     LEFT JOIN agency_contacts ac ON ac.id = ml.agency_contact_id
     ORDER BY ml.created_at DESC, ml.id DESC LIMIT ${limit}`, [agencyId]
  );

  let synced = 0;
  for (const row of rows || []) {
    const externalThreadId = row.sms_thread_key;
    const name = row.party_name || 'SMS';
    const { created, conv } = await upsertShell({
      agencyId,
      externalThreadId,
      channel: 'sms',
      subject: `SMS · ${name} · ${parseSmsThreadKey(externalThreadId)?.toNumber || ''}`,
      preview: previewFrom(row.last_body),
      lastAt: row.last_message_at,
      status: 'needs_reply',
      ownerUserId: row.assigned_user_id || row.user_id || null,
      participant: {
        kind: row.client_id ? 'client' : 'other',
        displayName: name,
        linkedEntityType: row.client_id ? 'client' : 'agency_contact',
        linkedEntityId: row.client_id || row.agency_contact_id
      }
    });
    if (row.client_id) {
      await CommunicationConversation.upsertLink(conv.id, 'client', row.client_id, name);
    }
    if (created) synced += 1;
  }
  return synced;
}

async function syncCallLogs({ agencyId, limit }) {
  const [rows] = await pool.execute(
    `SELECT cl.id, cl.direction, cl.from_number, cl.to_number, cl.status,
            cl.duration_seconds, cl.started_at, cl.created_at, cl.client_id,
            COALESCE(c.full_name, c.initials) AS client_name
     FROM call_logs cl
     LEFT JOIN clients c ON c.id = cl.client_id
     WHERE cl.agency_id = ?
     ORDER BY COALESCE(cl.started_at, cl.created_at) DESC
     LIMIT ${limit}`,
    [agencyId]
  ).catch(() => [[]]);

  let synced = 0;
  for (const row of rows || []) {
    const externalThreadId = `call:${row.id}`;
    const party =
      row.client_name ||
      (String(row.direction || '').toUpperCase() === 'INBOUND' ? row.from_number : row.to_number) ||
      'Call';
    const when = row.started_at || row.created_at;
    const dur = row.duration_seconds != null ? `${row.duration_seconds}s` : '';
    const preview = previewFrom(
      `${String(row.direction || 'call').toLowerCase()} · ${row.status || ''}${dur ? ` · ${dur}` : ''}`
    );
    const { created, conv } = await upsertShell({
      agencyId,
      externalThreadId,
      channel: 'call',
      subject: `Call · ${party}`,
      preview,
      lastAt: when,
      status: 'resolved',
      participant: {
        kind: row.client_id ? 'client' : 'other',
        displayName: party,
        linkedEntityType: row.client_id ? 'client' : null,
        linkedEntityId: row.client_id || null
      }
    });
    if (row.client_id) {
      await CommunicationConversation.upsertLink(conv.id, 'client', row.client_id, party);
    }
    if (created) synced += 1;
  }
  return synced;
}

async function syncVoicemails({ agencyId, limit }) {
  const [rows] = await pool.execute(
    `SELECT cv.id, cv.call_log_id, cv.created_at, cv.duration_seconds, cv.transcription_text,
            cv.from_number, cv.client_id, cv.agency_id,
            COALESCE(c.full_name, c.initials) AS client_name
     FROM call_voicemails cv
     LEFT JOIN clients c ON c.id = cv.client_id
     WHERE cv.agency_id = ?
     ORDER BY cv.created_at DESC
     LIMIT ${limit}`,
    [agencyId]
  ).catch(() => [[]]);

  let synced = 0;
  for (const row of rows || []) {
    const externalThreadId = `vm:${row.id}`;
    const party = row.client_name || row.from_number || 'Voicemail';
    const preview = previewFrom(row.transcription_text || 'Voicemail received');
    const { created, conv } = await upsertShell({
      agencyId,
      externalThreadId,
      channel: 'voicemail',
      subject: `Voicemail · ${party}`,
      preview,
      lastAt: row.created_at,
      status: 'needs_reply',
      ownerUserId: row.assigned_user_id || row.user_id || null,
      participant: {
        kind: row.client_id ? 'client' : 'other',
        displayName: party,
        linkedEntityType: row.client_id ? 'client' : null,
        linkedEntityId: row.client_id || null
      }
    });
    if (row.client_id) {
      await CommunicationConversation.upsertLink(conv.id, 'client', row.client_id, party);
    }
    if (created) synced += 1;
  }
  return synced;
}

/**
 * Hydrate thread messages for SMS / call / voicemail conversations from source tables.
 */
export async function hydrateChannelMessages(conversation) {
  const ext = String(conversation?.external_thread_id || '');
  const channel = String(conversation?.channel || '');
  if (channel === 'sms' || ext.startsWith('sms:')) {
    return hydrateSmsMessages(conversation);
  }
  if (channel === 'call' || ext.startsWith('call:')) {
    return hydrateCallMessages(conversation);
  }
  if (channel === 'voicemail' || ext.startsWith('vm:')) {
    return hydrateVoicemailMessages(conversation);
  }
  return null;
}

async function hydrateSmsMessages(conversation) {
  const ext = String(conversation.external_thread_id || '');
  const clientMatch = ext.match(/^sms:client:(\d+)$/);
  const contactMatch = ext.match(/^sms:contact:(\d+)$/);
  let rows = [];
  const phoneThread = parseSmsThreadKey(ext);
  if (phoneThread) {
    const [r] = await pool.execute(`SELECT id, direction, body, created_at, user_id FROM message_logs WHERE agency_id = ? AND sms_thread_key = ? ORDER BY id DESC LIMIT 200`, [conversation.agency_id, ext]);
    rows = r || [];
  } else   if (clientMatch) {
    const [r] = await pool.execute(
      `SELECT id, direction, body, created_at, user_id
       FROM message_logs
       WHERE client_id = ? AND agency_id = ?
       ORDER BY created_at DESC
       LIMIT 200`,
      [Number(clientMatch[1]), conversation.agency_id]
    );
    rows = r || [];
  } else if (contactMatch) {
    const [r] = await pool.execute(
      `SELECT id, direction, body, created_at, user_id
       FROM message_logs
       WHERE agency_contact_id = ? AND agency_id = ?
       ORDER BY created_at DESC
       LIMIT 200`,
      [Number(contactMatch[1]), conversation.agency_id]
    );
    rows = r || [];
  }
  const stored = await CommunicationConversation.listMessages(conversation.id);
  const internal = (stored || []).filter((m) => m.is_internal_note);
  const projected = (rows || []).map((m) => ({
    id: `sms-log-${m.id}`,
    conversation_id: conversation.id,
    channel: 'sms',
    direction: String(m.direction || '').toUpperCase() === 'OUTBOUND' ? 'outbound' : 'inbound',
    body_text: m.body,
    body_html: null,
    is_internal_note: false,
    sent_at: m.created_at,
    created_at: m.created_at,
    from: { name: String(m.direction || '').toUpperCase() === 'OUTBOUND' ? 'You' : 'Contact' },
    attachments: []
  }));
  return [...projected, ...internal].sort(
    (a, b) => new Date(a.sent_at || a.created_at) - new Date(b.sent_at || b.created_at)
  );
}

async function hydrateCallMessages(conversation) {
  const ext = String(conversation.external_thread_id || '');
  const m = ext.match(/^call:(\d+)$/);
  if (!m) return CommunicationConversation.listMessages(conversation.id);
  const [rows] = await pool.execute(
    `SELECT cl.*, COALESCE(c.full_name, c.initials) AS client_name
     FROM call_logs cl
     LEFT JOIN clients c ON c.id = cl.client_id
     WHERE cl.id = ?
     LIMIT 1`,
    [Number(m[1])]
  );
  const call = rows?.[0];
  const stored = await CommunicationConversation.listMessages(conversation.id);
  const internal = (stored || []).filter((x) => x.is_internal_note);
  if (!call) return internal;
  const projected = {
    id: `call-log-${call.id}`,
    conversation_id: conversation.id,
    channel: 'call',
    direction: String(call.direction || '').toUpperCase() === 'OUTBOUND' ? 'outbound' : 'inbound',
    body_text: [
      `Direction: ${call.direction || '—'}`,
      `Status: ${call.status || '—'}`,
      call.from_number ? `From: ${call.from_number}` : null,
      call.to_number ? `To: ${call.to_number}` : null,
      call.duration_seconds != null ? `Duration: ${call.duration_seconds}s` : null,
      call.client_name ? `Client: ${call.client_name}` : null
    ]
      .filter(Boolean)
      .join('\n'),
    body_html: null,
    is_internal_note: false,
    sent_at: call.started_at || call.created_at,
    created_at: call.created_at,
    from: { name: call.client_name || call.from_number || 'Call' },
    attachments: [],
    meta: { callLogId: call.id, hasRecording: !!call.recording_url || !!call.recording_sid }
  };
  return [projected, ...internal];
}

async function hydrateVoicemailMessages(conversation) {
  const ext = String(conversation.external_thread_id || '');
  const m = ext.match(/^vm:(\d+)$/);
  if (!m) return CommunicationConversation.listMessages(conversation.id);
  const [rows] = await pool.execute(
    `SELECT cv.*, COALESCE(c.full_name, c.initials) AS client_name
     FROM call_voicemails cv
     LEFT JOIN clients c ON c.id = cv.client_id
     WHERE cv.id = ?
     LIMIT 1`,
    [Number(m[1])]
  );
  const vm = rows?.[0];
  const stored = await CommunicationConversation.listMessages(conversation.id);
  const internal = (stored || []).filter((x) => x.is_internal_note);
  if (!vm) return internal;
  const projected = {
    id: `vm-${vm.id}`,
    conversation_id: conversation.id,
    channel: 'voicemail',
    direction: 'inbound',
    body_text: vm.transcription_text || 'Voicemail (no transcription)',
    body_html: null,
    is_internal_note: false,
    sent_at: vm.created_at,
    created_at: vm.created_at,
    from: { name: vm.client_name || vm.from_number || 'Voicemail' },
    attachments: [],
    meta: { voicemailId: vm.id, callLogId: vm.call_log_id, durationSeconds: vm.duration_seconds }
  };
  return [projected, ...internal];
}
