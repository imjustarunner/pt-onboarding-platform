import crypto from 'crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import VonageService from './vonage.service.js';
import { sendSchoolRoiEmail } from './schoolRoiEmail.service.js';
import { buildPublicIntakeUrl } from './clientRenewal.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { dobValuesMatch } from '../utils/portalClientDob.js';
import { ensureIssuedRoiSigningLinkForClient } from '../controllers/clientSchoolRoiAccess.controller.js';
import { confirmUpdateInformation } from './clientUpdate.service.js';
import { demographicFields } from './guardianDemographics.service.js';
import { fail, familyDocumentNotice, kindLabel, normalizeSessionItems } from './familyDocumentSession.logic.js';

const STAFF_ROLES = new Set(['super_admin', 'admin', 'support']);
const PROVIDER_ROLES = new Set(['provider', 'provider_plus', 'intern', 'intern_plus']);

function confirmedSet(value) {
  const raw = typeof value === 'string' ? JSON.parse(value || '[]') : value;
  return new Set(Array.isArray(raw) ? raw.map(Number) : []);
}

async function loadClients(clientIds) {
  const list = [...new Set(clientIds.map(Number))].filter((id) => id > 0);
  if (!list.length) return [];
  const [rows] = await pool.execute(
    `SELECT id, agency_id, organization_id, full_name, date_of_birth, session_sms_opt_in, service_day, provider_id
     FROM clients WHERE id IN (${list.map(() => '?').join(',')})`,
    list
  );
  return rows || [];
}

async function guardiansFor(clientId) {
  const [rows] = await pool.execute(
    `SELECT u.id, COALESCE(NULLIF(u.personal_email,''), NULLIF(u.email,'')) AS email,
            COALESCE(NULLIF(u.personal_phone,''), NULLIF(u.phone_number,''), NULLIF(u.work_phone,'')) AS phone,
            u.password_hash, u.temporary_password_hash
     FROM client_guardians cg
     JOIN users u ON u.id = cg.guardian_user_id
     WHERE cg.client_id = ? AND cg.access_enabled = 1 AND COALESCE(u.is_archived,0) = 0
     ORDER BY cg.id`,
    [clientId]
  );
  return rows || [];
}

async function actorCanUseAgency(actor, agencyId) {
  if (String(actor?.role || '') === 'super_admin') return true;
  const [rows] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? AND is_active = 1 LIMIT 1`,
    [actor.id, agencyId]
  );
  return rows.length > 0;
}

async function providerAssigned(providerId, client) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM client_provider_assignments
     WHERE client_id = ? AND provider_user_id = ? AND is_active = 1
     UNION
     SELECT 1 FROM clients WHERE id = ? AND provider_id = ?
     LIMIT 1`,
    [client.id, providerId, client.id, providerId]
  );
  return rows.length > 0;
}

async function schoolOrganization(organizationId) {
  const id = Number(organizationId || 0);
  if (!id) return null;
  const [rows] = await pool.execute(
    `SELECT id, name, organization_type FROM agencies WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0]?.organization_type === 'school' ? rows[0] : null;
}

export async function listFamilyDocumentCandidates({ actor, clientId }) {
  const [client] = await loadClients([clientId]);
  if (!client) throw fail(404, 'Client not found.');
  const role = String(actor?.role || '').toLowerCase();
  if (!STAFF_ROLES.has(role) && !PROVIDER_ROLES.has(role)) throw fail(403, 'You cannot send these documents.');
  if (role !== 'super_admin' && !(await actorCanUseAgency(actor, client.agency_id))) {
    throw fail(403, 'This client is outside your agency.');
  }
  if (PROVIDER_ROLES.has(role) && !(await providerAssigned(actor.id, client))) {
    throw fail(403, 'You are not assigned to this client.');
  }
  const guardians = await guardiansFor(client.id);
  const children = [];
  for (const guardian of guardians) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT c.id, c.full_name
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
       WHERE cg.guardian_user_id = ? AND cg.access_enabled = 1 AND c.agency_id = ?
       ORDER BY c.full_name, c.id`,
      [guardian.id, client.agency_id]
    );
    children.push({
      guardianUserId: Number(guardian.id),
      email: guardian.email,
      clients: (rows || []).map((row) => ({ id: Number(row.id), name: row.full_name || `Client ${row.id}` }))
    });
  }
  return {
    clientId: Number(client.id),
    providerOnly: PROVIDER_ROLES.has(role),
    guardians: children
  };
}

async function createDisclosureKey({ client, actorUserId }) {
  const link = await IntakeLink.create({
    publicKey: crypto.randomBytes(24).toString('hex'),
    title: 'Smart Disclosure Statement',
    description: 'Family document session disclosure for one child.',
    languageCode: 'en',
    scopeType: 'school',
    formType: 'smart_disclosure',
    organizationId: client.organization_id,
    isActive: true,
    createClient: false,
    createGuardian: false,
    requiresAssignment: false,
    allowedDocumentTemplateIds: [],
    intakeSteps: [{ type: 'smart_disclosure', title: 'Disclosure Statement' }],
    createdByUserId: actorUserId || null
  });
  return link?.public_key || null;
}

async function markFinishedItems(items) {
  for (const item of items) {
    if (item.status === 'completed') continue;
    let done = false;
    if (item.kind === 'disclosure') {
      const [rows] = await pool.execute(
        `SELECT id FROM client_disclosure_acknowledgements
         WHERE client_id = ? AND signed_at >= ? LIMIT 1`,
        [item.client_id, item.created_at]
      );
      done = rows.length > 0;
    } else if (item.kind === 'roi' && item.public_key) {
      const [rows] = await pool.execute(
        `SELECT status FROM client_school_roi_signing_links WHERE public_key = ? LIMIT 1`,
        [item.public_key]
      );
      done = String(rows[0]?.status || '') === 'completed';
    }
    if (!done) continue;
    await pool.execute(
      `UPDATE family_document_session_items SET status = 'completed', completed_at = UTC_TIMESTAMP() WHERE id = ?`,
      [item.id]
    );
    item.status = 'completed';
  }
}

function formUrl(publicKey, token) {
  const intake = buildPublicIntakeUrl(publicKey);
  if (!intake) return '';
  return `${intake}?returnTo=${encodeURIComponent(`/family-documents/${token}`)}`;
}

async function sessionPayload(token) {
  const [sessions] = await pool.execute(
    `SELECT * FROM family_document_sessions WHERE public_token = ? LIMIT 1`,
    [token]
  );
  const session = sessions[0];
  if (!session) return null;
  const [items] = await pool.execute(
    `SELECT i.*, c.full_name, c.preferred_name, c.date_of_birth, c.preferred_language, c.gender, c.grade,
            c.contact_phone, c.email, c.address_street, c.address_apt, c.address_city, c.address_state,
            c.address_zip, c.ethnicity, a.name AS school_name
     FROM family_document_session_items i
     JOIN clients c ON c.id = i.client_id
     LEFT JOIN agencies a ON a.id = c.organization_id
     WHERE i.session_id = ?
     ORDER BY i.sort_order, i.id`,
    [session.id]
  );
  await markFinishedItems(items);
  const pending = items.some((item) => item.status !== 'completed');
  if (!pending && session.status !== 'completed') {
    await pool.execute(
      `UPDATE family_document_sessions SET status = 'completed', completed_at = UTC_TIMESTAMP() WHERE id = ?`,
      [session.id]
    );
    session.status = 'completed';
  }
  const confirmed = confirmedSet(session.confirmed_client_ids);
  const children = [];
  for (const item of items) {
    let child = children.find((row) => row.id === Number(item.client_id));
    if (!child) {
      child = {
        id: Number(item.client_id),
        name: item.full_name || `Client ${item.client_id}`,
        schoolName: item.school_name || '',
        confirmed: confirmed.has(Number(item.client_id)),
        review: confirmed.has(Number(item.client_id))
          ? Object.entries(demographicFields).map(([key, label]) => {
            const raw = item[key];
            const value = key === 'date_of_birth' && raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw || '');
            return { label, value };
          })
          : [],
        items: []
      };
      children.push(child);
    }
    child.items.push({
      id: Number(item.id),
      kind: item.kind,
      label: kindLabel(item.kind),
      status: item.status,
      formUrl: child.confirmed && item.public_key ? formUrl(item.public_key, token) : ''
    });
  }
  const current = items.find((item) => item.status !== 'completed') || null;
  return {
    token,
    status: session.status,
    guardianEmail: session.guardian_email,
    children,
    current: current
      ? {
        itemId: Number(current.id),
        clientId: Number(current.client_id),
        kind: current.kind,
        label: kindLabel(current.kind),
        needsBirthday: !confirmed.has(Number(current.client_id))
      }
      : null
  };
}

export async function getPublicFamilyDocumentSession(token) {
  const clean = String(token || '').trim();
  if (!/^[a-f0-9]{32,128}$/i.test(clean)) throw fail(404, 'This document link is not valid.');
  const payload = await sessionPayload(clean);
  if (!payload) throw fail(404, 'This document link is not valid.');
  return payload;
}

export async function confirmFamilyDocumentBirthday({ token, clientId, dateOfBirth }) {
  const payload = await getPublicFamilyDocumentSession(token);
  const child = payload.children.find((row) => row.id === Number(clientId));
  if (!child) throw fail(404, 'That child is not on this link.');
  const [rows] = await pool.execute(`SELECT date_of_birth FROM clients WHERE id = ? LIMIT 1`, [child.id]);
  if (!rows[0]?.date_of_birth) {
    throw fail(400, 'This child does not have a date of birth on file. Ask support to add it before using this link.');
  }
  if (!dobValuesMatch(rows[0].date_of_birth, dateOfBirth)) {
    throw fail(400, 'That date of birth does not match this child.');
  }
  const [sessions] = await pool.execute(
    `SELECT id, confirmed_client_ids FROM family_document_sessions WHERE public_token = ? LIMIT 1`,
    [token]
  );
  const confirmed = confirmedSet(sessions[0].confirmed_client_ids);
  confirmed.add(child.id);
  await pool.execute(
    `UPDATE family_document_sessions SET confirmed_client_ids = ? WHERE id = ?`,
    [JSON.stringify([...confirmed]), sessions[0].id]
  );
  return getPublicFamilyDocumentSession(token);
}

export async function confirmFamilyDocumentDemographics({ token, itemId, confirmed, actor = null }) {
  if (confirmed !== true) throw fail(400, 'Review the information and confirm it before continuing.');
  const payload = await getPublicFamilyDocumentSession(token);
  const item = payload.children.flatMap((child) => child.items).find((row) => row.id === Number(itemId));
  if (!item || item.kind !== 'demographics') throw fail(404, 'That confirmation is not on this link.');
  const child = payload.children.find((row) => row.items.some((entry) => entry.id === item.id));
  if (!child?.confirmed) throw fail(400, 'Confirm this child\'s date of birth first.');
  await pool.execute(
    `UPDATE family_document_session_items SET status = 'completed', completed_at = UTC_TIMESTAMP() WHERE id = ?`,
    [item.id]
  );
  if (process.env.CLIENT_UPDATE_WORKFLOWS_ENABLED === 'true' && actor?.id) {
    const [open] = await pool.execute(
      `SELECT i.id, r.agency_id, r.client_id
       FROM client_update_items i
       JOIN client_update_requests r ON r.id = i.request_id
       WHERE r.client_id = ? AND i.item_type = 'information' AND i.status <> 'complete'
         AND r.status IN ('sent','in_progress')
       LIMIT 1`,
      [child.id]
    );
    if (open[0]) {
      try {
        await confirmUpdateInformation({
          user: actor,
          agencyId: open[0].agency_id,
          clientId: open[0].client_id,
          itemId: open[0].id
        });
      } catch {
        // The signing session still records the confirmation when the held workflow cannot.
      }
    }
  }
  return getPublicFamilyDocumentSession(token);
}

async function sendSessionText({ agencyId, phone, body, clientId }) {
  if (!phone) return { texted: false, reason: 'No mobile number is on the guardian.' };
  const numbers = await PhoneNumber.listByAgency(agencyId, { includeInactive: false });
  const from = numbers?.[0]?.phone_number;
  if (!from) return { texted: false, reason: 'Texting is not set up for this agency.' };
  const to = PhoneNumber.normalizePhone(phone) || phone;
  await VonageService.sendSms({
    purpose: 'care',
    agencyId,
    to,
    from: PhoneNumber.normalizePhone(from) || from,
    body: String(body || '').slice(0, 480)
  });
  return { texted: true };
}

export async function createFamilyDocumentSession({ actor, body }) {
  const role = String(actor?.role || '').toLowerCase();
  const providerOnly = PROVIDER_ROLES.has(role);
  if (!STAFF_ROLES.has(role) && !providerOnly) throw fail(403, 'You cannot send these documents.');
  const selected = normalizeSessionItems(body?.items, { providerOnly });
  const guardianUserId = Number(body?.guardianUserId || body?.guardian_user_id || 0);
  const clients = await loadClients(selected.map((item) => item.clientId));
  if (clients.length !== selected.length) throw fail(404, 'One of the selected children could not be found.');
  const agencyId = Number(clients[0].agency_id || 0);
  if (clients.some((client) => Number(client.agency_id) !== agencyId)) {
    throw fail(400, 'Choose children from the same agency.');
  }
  if (role !== 'super_admin' && !(await actorCanUseAgency(actor, agencyId))) {
    throw fail(403, 'These children are outside your agency.');
  }
  for (const client of clients) {
    if (providerOnly && !(await providerAssigned(actor.id, client))) {
      throw fail(403, 'You are not assigned to every selected child.');
    }
    const kinds = selected.find((item) => item.clientId === Number(client.id)).kinds;
    if (kinds.some((kind) => kind === 'disclosure' || kind === 'roi')) {
      const school = await schoolOrganization(client.organization_id);
      if (!school) throw fail(400, 'Disclosure and Smart ROI are for school clients.');
    }
  }
  const guardianSets = [];
  for (const client of clients) {
    const guardians = await guardiansFor(client.id);
    guardianSets.push(guardians);
  }
  const shared = guardianSets[0].filter((guardian) =>
    guardianSets.every((list) => list.some((row) => Number(row.id) === Number(guardian.id)))
  );
  const guardian = shared.find((row) => !guardianUserId || Number(row.id) === guardianUserId) || null;
  if (!guardian?.email) throw fail(400, 'Link these children to the same guardian with an email address before sending.');
  const agency = await Agency.findById(agencyId);
  const token = crypto.randomBytes(32).toString('hex');
  const [inserted] = await pool.execute(
    `INSERT INTO family_document_sessions
      (public_token, agency_id, guardian_user_id, guardian_email, created_by_user_id, status)
     VALUES (?, ?, ?, ?, ?, 'open')`,
    [token, agencyId, guardian.id, guardian.email, actor.id || null]
  );
  const sessionId = inserted.insertId;
  let sort = 0;
  for (const item of selected) {
    const client = clients.find((row) => Number(row.id) === item.clientId);
    for (const kind of item.kinds) {
      let publicKey = null;
      if (kind === 'disclosure') publicKey = await createDisclosureKey({ client, actorUserId: actor.id });
      if (kind === 'roi') {
        const issued = await ensureIssuedRoiSigningLinkForClient({
          client,
          schoolOrganizationId: client.organization_id,
          actorUserId: actor.id
        });
        if (!issued?.ok || !issued.issuedLink?.public_key) {
          throw fail(issued?.status || 400, issued?.message || 'Smart ROI could not be prepared.');
        }
        publicKey = issued.issuedLink.public_key;
      }
      await pool.execute(
        `INSERT INTO family_document_session_items
          (session_id, client_id, kind, sort_order, public_key, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [sessionId, client.id, kind, sort, publicKey]
      );
      sort += 1;
    }
  }
  const url = buildPublicAppUrl(agency, `family-documents/${token}`);
  const hasAccount = Boolean(guardian.password_hash || guardian.temporary_password_hash);
  const signInUrl = hasAccount
    ? buildPublicAppUrl(agency, `login?redirect=${encodeURIComponent(`/family-documents/${token}`)}`)
    : '';
  const notice = familyDocumentNotice({
    childNames: clients.map((client) => client.full_name || 'your child'),
    link: url,
    signInUrl
  });
  let emailSent = false;
  let emailError = '';
  try {
    const result = await sendSchoolRoiEmail({
      agencyId,
      to: guardian.email,
      subject: notice.subject,
      text: notice.text,
      html: notice.html,
      clientId: clients[0].id,
      templateType: 'family_document_session',
      linkUrl: url,
      source: 'manual',
      generatedByUserId: actor.id || null
    });
    emailSent = Boolean(result?.id && !result.skipped && !result.blocked);
    if (!emailSent) emailError = result?.reason || 'The email was not sent.';
  } catch (error) {
    emailError = error.message || 'The email was not sent.';
  }
  const optedIn = clients.some((client) => Number(client.session_sms_opt_in) === 1);
  let texted = false;
  let textSkippedReason = optedIn ? '' : 'Texts stay off until this family has already opted in.';
  if (optedIn) {
    try {
      const sms = await sendSessionText({
        agencyId,
        phone: guardian.phone,
        body: notice.sms,
        clientId: clients[0].id
      });
      texted = sms.texted;
      textSkippedReason = sms.reason || '';
    } catch (error) {
      textSkippedReason = error.message || 'The text was not sent.';
    }
  }
  await pool.execute(
    `UPDATE family_document_sessions SET delivery_status = ?, sms_status = ? WHERE id = ?`,
    [emailSent ? 'sent' : 'failed', texted ? 'sent' : 'skipped', sessionId]
  );
  return { token, url, emailSent, emailError, texted, textSkippedReason };
}

export async function listGuardianFamilyDocuments(user) {
  const email = String(user?.email || user?.personal_email || '').trim().toLowerCase();
  try {
    const [sessions] = await pool.execute(
      `SELECT id, public_token, status FROM family_document_sessions
       WHERE status = 'open' AND (guardian_user_id = ? OR LOWER(guardian_email) = ?)
       ORDER BY id DESC LIMIT 20`,
      [Number(user?.id || 0), email]
    );
    const result = [];
    for (const session of sessions) {
      const payload = await sessionPayload(session.public_token);
      const pending = (payload?.children || []).flatMap((child) => child.items
        .filter((item) => item.status !== 'completed')
        .map((item) => ({
          ...item,
          childName: child.name,
          sessionUrl: `/family-documents/${session.public_token}?item=${item.id}`
        })));
      if (pending.length) result.push({ token: session.public_token, items: pending });
    }
    return result;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}
