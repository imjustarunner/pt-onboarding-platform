import DiscoverySession from '../models/DiscoverySession.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import pool from '../config/database.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { createOrGetRoomByUniqueName, createAccessTokenAsync, isVideoConfigured } from './video.service.js';

const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

function toSqlDatetimeSafe(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} /.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildDiscoveryUrl(agencySlug, accessToken) {
  const slug = String(agencySlug || '').trim();
  const token = String(accessToken || '').trim();
  if (!slug || !token) return null;
  return `${FRONTEND_URL}/${encodeURIComponent(slug)}/discovery/${encodeURIComponent(token)}`;
}

async function resolveAgencySlug(agencyId) {
  const agency = await Agency.findById(agencyId);
  return agency?.slug || agency?.portal_url || null;
}

async function getClientContact(clientId) {
  const cid = Number(clientId);
  const [rows] = await pool.execute(
    `SELECT id, full_name, initials, contact_phone
     FROM clients WHERE id = ? LIMIT 1`,
    [cid]
  );
  const client = rows?.[0] || null;
  if (!client) return null;

  // Prefer latest public booking inquiry email for this client
  const [reqRows] = await pool.execute(
    `SELECT client_email, client_phone, client_name
     FROM public_appointment_requests
     WHERE created_client_id = ? OR matched_client_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [cid, cid]
  );
  const fromReq = reqRows?.[0] || null;

  // Guardian user email if linked
  let guardianEmail = null;
  try {
    const [gRows] = await pool.execute(
      `SELECT u.email, u.personal_email, u.work_email
       FROM client_guardians cg
       JOIN users u ON u.id = cg.guardian_user_id
       WHERE cg.client_id = ?
       ORDER BY cg.id DESC
       LIMIT 1`,
      [cid]
    );
    guardianEmail = gRows?.[0]?.email || gRows?.[0]?.personal_email || gRows?.[0]?.work_email || null;
  } catch {
    // column names may vary; ignore
  }

  return {
    ...client,
    contact_email: fromReq?.client_email || guardianEmail || null,
    email: fromReq?.client_email || guardianEmail || null,
    contact_phone: fromReq?.client_phone || client.contact_phone || null,
    full_name: fromReq?.client_name || client.full_name || client.initials || null
  };
}

export async function createAndSendDiscoveryInvite({
  agencyId,
  providerId,
  clientId,
  options,
  countdownMinutes = 15,
  notes = null,
  createdByUserId = null,
  publicAppointmentRequestId = null,
  sendEmail = true,
  clientEmailOverride = null,
  clientNameOverride = null
}) {
  const client = await getClientContact(clientId);
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });

  const clientEmail = String(
    clientEmailOverride || client.contact_email || client.email || ''
  )
    .trim()
    .toLowerCase();
  if (!clientEmail) throw Object.assign(new Error('Client email is required to send discovery options'), { status: 400 });

  const clientName =
    String(clientNameOverride || client.full_name || '').trim() ||
    client.initials ||
    `Client #${clientId}`;

  const session = await DiscoverySession.create({
    agencyId,
    providerId,
    clientId,
    publicAppointmentRequestId,
    options,
    countdownMinutes,
    clientEmail,
    clientName,
    clientPhone: client.contact_phone || client.phone || null,
    notes,
    createdByUserId,
    tokenExpiresAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    status: 'PROPOSED'
  });

  const slug = await resolveAgencySlug(agencyId);
  const joinUrl = buildDiscoveryUrl(slug, session.access_token);

  if (sendEmail && joinUrl) {
    const optionLines = (session.proposed_options || [])
      .map((o, i) => {
        const start = new Date(o.startAt);
        return `${i + 1}. ${start.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })}`;
      })
      .join('\n');

    await sendNotificationEmail({
      agencyId,
      triggerKey: 'discovery_session_invite',
      to: clientEmail,
      subject: `Choose a time for your discovery call with ${clientName.split(' ')[0] === clientName ? 'us' : 'your coach'}`.replace(
        'with us',
        'with your coach'
      ),
      text: `Hi ${clientName},\n\nPlease pick a discovery call time:\n\n${optionLines}\n\nSelect here: ${joinUrl}\n\nThis private link is also how you'll join the session.`,
      html: `<p>Hi ${clientName},</p><p>Please pick a discovery call time:</p><pre style="font-family:inherit">${optionLines}</pre><p><a href="${joinUrl}">Select your time</a></p><p>This private link is also how you'll join the session.</p>`,
      source: 'auto',
      templateType: 'discovery_session_invite'
    }).catch((e) => {
      console.warn('Discovery invite email failed:', e?.message || e);
    });
  }

  return { session, joinUrl };
}

export async function getPublicDiscoveryPayload(token) {
  const session = await DiscoverySession.findByToken(token);
  if (!session) return null;
  if (session.token_expires_at && new Date(session.token_expires_at) < new Date()) {
    return { expired: true, session: null };
  }

  const slug = await resolveAgencySlug(session.agency_id);
  const [providerRows] = await pool.execute(
    `SELECT id, first_name, last_name, title, profile_photo_path
     FROM users WHERE id = ? LIMIT 1`,
    [session.provider_id]
  );
  const provider = providerRows?.[0] || null;
  const agency = await Agency.findById(session.agency_id);

  return {
    expired: false,
    session: {
      id: session.id,
      status: session.status,
      countdownMinutes: session.countdown_minutes,
      proposedOptions: session.status === 'PROPOSED' ? session.proposed_options : [],
      bookedStartAt: session.booked_start_at,
      bookedEndAt: session.booked_end_at,
      clientName: session.client_name,
      modalityLabel: 'Virtual',
      joinUrl: buildDiscoveryUrl(slug, session.access_token)
    },
    provider: provider
      ? {
          id: Number(provider.id),
          displayName: `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || 'Coach',
          title: provider.title || 'Life Coach'
        }
      : null,
    agency: {
      id: Number(session.agency_id),
      name: agency?.name || '',
      slug,
      logoUrl: agency?.logo_url || null,
      colorPalette: agency?.color_palette || null
    }
  };
}

export async function selectDiscoveryOption({ token, optionIndex }) {
  const session = await DiscoverySession.findByToken(token);
  if (!session) throw Object.assign(new Error('Discovery invite not found'), { status: 404 });
  if (session.token_expires_at && new Date(session.token_expires_at) < new Date()) {
    throw Object.assign(new Error('This invite link has expired'), { status: 410 });
  }
  if (session.status === 'BOOKED') {
    return { session, alreadyBooked: true };
  }
  if (session.status !== 'PROPOSED') {
    throw Object.assign(new Error('This discovery invite is no longer open for selection'), { status: 400 });
  }

  const options = Array.isArray(session.proposed_options) ? session.proposed_options : [];
  const idx = Number(optionIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
    throw Object.assign(new Error('Invalid time option'), { status: 400 });
  }
  const chosen = options[idx];
  const startAt = chosen.startAt;
  const endAt = chosen.endAt;

  const slug = await resolveAgencySlug(session.agency_id);
  const joinUrl = buildDiscoveryUrl(slug, session.access_token);

  const event = await ProviderScheduleEvent.create({
    agencyId: session.agency_id,
    providerId: session.provider_id,
    clientId: session.client_id,
    kind: 'DISCOVERY',
    title: `Discovery Call — ${session.client_name}`,
    description: joinUrl
      ? `Discovery session with ${session.client_name}.\nJoin: ${joinUrl}`
      : `Discovery session with ${session.client_name}.`,
    startAt: toSqlDatetimeSafe(startAt),
    endAt: toSqlDatetimeSafe(endAt),
    createdByUserId: session.created_by_user_id || session.provider_id
  });

  const booked = await DiscoverySession.markBooked(session.id, {
    optionIndex: idx,
    bookedStartAt: startAt,
    bookedEndAt: endAt,
    providerScheduleEventId: event?.id || null
  });

  // Promote prospective → screener
  try {
    const screenerId = await getClientStatusIdByKey({
      agencyId: session.agency_id,
      statusKey: 'screener'
    });
    if (screenerId) {
      await Client.update(session.client_id, { client_status_id: screenerId }, session.provider_id);
    }
    await Client.updateStatus(
      session.client_id,
      'SCREENER',
      session.provider_id,
      'Discovery session booked'
    );
  } catch (e) {
    console.warn('Discovery status promotion failed:', e?.message || e);
  }

  const whenLabel = new Date(startAt).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  await sendNotificationEmail({
    agencyId: session.agency_id,
    triggerKey: 'discovery_session_confirmed',
    to: session.client_email,
    subject: 'Your discovery call is booked',
    text: `Hi ${session.client_name},\n\nYour discovery call is confirmed for ${whenLabel}.\n\nJoin (same private link): ${joinUrl}`,
    html: `<p>Hi ${session.client_name},</p><p>Your discovery call is confirmed for <strong>${whenLabel}</strong>.</p><p><a href="${joinUrl}">Open your session link</a></p>`,
    source: 'auto',
    templateType: 'discovery_session_confirmed'
  }).catch((e) => console.warn('Discovery confirm email failed:', e?.message || e));

  // Notify coach
  try {
    const [urows] = await pool.execute(`SELECT email, work_email FROM users WHERE id = ? LIMIT 1`, [
      session.provider_id
    ]);
    const coachEmail = urows?.[0]?.email || urows?.[0]?.work_email;
    if (coachEmail) {
      await sendNotificationEmail({
        agencyId: session.agency_id,
        triggerKey: 'discovery_session_confirmed',
        to: coachEmail,
        subject: `Discovery booked: ${session.client_name}`,
        text: `${session.client_name} booked ${whenLabel}.\nJoin link: ${joinUrl}`,
        html: `<p><strong>${session.client_name}</strong> booked <strong>${whenLabel}</strong>.</p><p><a href="${joinUrl}">Session link</a></p>`,
        source: 'auto',
        userId: session.provider_id,
        templateType: 'discovery_session_confirmed'
      });
    }
  } catch (e) {
    console.warn('Discovery coach confirm email failed:', e?.message || e);
  }

  return { session: booked, joinUrl, alreadyBooked: false };
}

export async function getDiscoveryVideoToken({ token, identityLabel = 'guest' }) {
  const session = await DiscoverySession.findByToken(token);
  if (!session) throw Object.assign(new Error('Discovery invite not found'), { status: 404 });
  if (session.status !== 'BOOKED') {
    throw Object.assign(new Error('Discovery session is not booked yet'), { status: 400 });
  }
  if (!isVideoConfigured()) {
    throw Object.assign(new Error('Video is not configured'), { status: 503 });
  }

  const start = new Date(session.booked_start_at).getTime();
  const end = new Date(session.booked_end_at).getTime();
  const now = Date.now();
  const earlyMs = 15 * 60 * 1000;
  if (now < start - earlyMs) {
    throw Object.assign(new Error('Join opens 15 minutes before the session starts'), { status: 403 });
  }
  if (now > end + 30 * 60 * 1000) {
    throw Object.assign(new Error('This discovery session has ended'), { status: 403 });
  }

  let roomSid = session.vonage_session_id;
  let uniqueName = session.room_unique_name || `discovery-${session.id}`;
  if (!roomSid) {
    const room = await createOrGetRoomByUniqueName(uniqueName);
    roomSid = room?.sid || null;
    uniqueName = room?.uniqueName || uniqueName;
    if (roomSid) {
      await DiscoverySession.setVideoRoom(session.id, {
        vonageSessionId: roomSid,
        roomUniqueName: uniqueName
      });
    }
  }
  if (!roomSid) throw Object.assign(new Error('Could not create video room'), { status: 503 });

  const tokenJwt = await createAccessTokenAsync({
    roomSid,
    identity: `${identityLabel}-${String(token).slice(0, 8)}`,
    metadata: { discoverySessionId: session.id, role: identityLabel }
  });

  return {
    apiKey: process.env.VONAGE_VIDEO_API_KEY || process.env.VONAGE_API_KEY || null,
    sessionId: roomSid,
    token: tokenJwt,
    countdownMinutes: session.countdown_minutes,
    bookedStartAt: session.booked_start_at,
    bookedEndAt: session.booked_end_at
  };
}

export { buildDiscoveryUrl };
