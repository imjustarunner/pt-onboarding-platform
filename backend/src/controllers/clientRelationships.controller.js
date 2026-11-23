import pool from '../config/database.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { appointmentFamilyRecipients } from '../services/appointmentFamilyRecipients.service.js';
import { getClientPreferences, getTenantSettings, loadClientConsent, resolveEffectiveChannels } from '../services/sessionNotification.service.js';
import { listReleaseRelationships } from '../services/safetyPlans/records.js';

const staffRoles = new Set([
  'admin', 'super_admin', 'support', 'staff', 'scheduler', 'provider', 'provider_plus',
  'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant'
]);
const editableRoles = new Set([...staffRoles].filter(role => role !== 'scheduler'));
const fail = (status, message) => Object.assign(new Error(message), { status });
const clientLabel = row => row.full_name || row.initials || 'Client';
const editableChart = row => !['ARCHIVED', 'MERGED', 'DELETED'].includes(String(row.status || '').toUpperCase());
const sameAgency = (row, agencyId) => Number(row.agency_id) === Number(agencyId);

async function chartAccess(req, id) {
  return resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId: id });
}

async function chartScope(req, write = false) {
  const roles = write ? editableRoles : staffRoles;
  if (!roles.has(req.user.role)) throw fail(403, 'Staff chart access is required.');
  const clientId = Number(req.params.id);
  if (!Number.isSafeInteger(clientId) || clientId < 1) throw fail(400, 'Invalid client id.');
  const access = await chartAccess(req, clientId);
  if (!access.ok) throw fail(access.status, access.message);
  const client = access.client;
  if (req.user.scopedAgencyId && !sameAgency(client, req.user.scopedAgencyId)) {
    throw fail(403, 'This client belongs to a different agency.');
  }
  return client;
}

async function visibleClients(req, rows, agencyId, { includeRestrictedDetails = false } = {}) {
  const records = await Promise.all(rows.map(async row => {
    const access = await chartAccess(req, row.id);
    if (!access.client || !sameAgency(access.client, agencyId)) return null;
    return { ...access, reason: row.reason };
  }));
  const peers = records.filter(Boolean);
  const restricted = peers.filter(row => !row.ok && row.status === 403);
  const summary = client => ({
    name: clientLabel(client), initials: client.initials || null, providerName: client.provider_name || null
  });
  return {
    clients: peers.filter(row => row.ok).map(({ client, reason }) => ({
      id: Number(client.id), ...summary(client), code: client.identifier_code || null, reason: reason || null
    })),
    hasRestrictedCharts: restricted.length > 0,
    restricted: includeRestrictedDetails ? restricted.map(({ client }) => summary(client)) : []
  };
}

async function searchSiblings(req, client, search, { sharedGuardianOnly = false } = {}) {
  const byName = search.length > 0;
  if (byName && (search.length < 2 || search.length > 100)) return { clients: [], hasRestrictedCharts: false };
  const conditions = byName
    ? "LOCATE(LOWER(?), LOWER(CONCAT_WS(' ', c.full_name, c.initials))) > 0"
    : sharedGuardianOnly ? "reason = 'Shared guardian account'" : 'reason IS NOT NULL';
  const [rows] = await pool.execute(`
    SELECT c.id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM client_guardians g
          JOIN client_guardians peer ON peer.guardian_user_id = g.guardian_user_id
          JOIN users u ON u.id = g.guardian_user_id
          WHERE g.client_id = own.id AND peer.client_id = c.id
            AND g.relationship_type <> 'self' AND peer.relationship_type <> 'self'
            AND g.access_enabled = 1 AND peer.access_enabled = 1
            AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0
            AND UPPER(COALESCE(u.status, '')) NOT IN ('INACTIVE','ARCHIVED','TERMINATED','DELETED')
            AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(g.permissions_json, '$.pendingGuardianVerification')), 'false') = 'false'
            AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(peer.permissions_json, '$.pendingGuardianVerification')), 'false') = 'false'
            AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(g.permissions_json, '$.relationshipRevoked')), 'false') = 'false'
            AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(peer.permissions_json, '$.relationshipRevoked')), 'false') = 'false'
        ) THEN 'Shared guardian account'
        WHEN EXISTS (
          SELECT 1 FROM client_contact_affiliations a
          JOIN client_contact_affiliations peer ON peer.agency_contact_id = a.agency_contact_id
          WHERE a.client_id = own.id AND peer.client_id = c.id
            AND a.agency_id = own.agency_id AND peer.agency_id = own.agency_id
            AND a.is_active = 1 AND peer.is_active = 1
        ) THEN 'Shared contact'
        WHEN NULLIF(TRIM(own.email), '') IS NOT NULL AND LOWER(TRIM(own.email)) = LOWER(TRIM(c.email))
          THEN 'Shared email on file'
        WHEN CHAR_LENGTH(REGEXP_REPLACE(COALESCE(own.contact_phone, ''), '[^0-9]', '')) >= 10
          AND RIGHT(REGEXP_REPLACE(own.contact_phone, '[^0-9]', ''), 10) = RIGHT(REGEXP_REPLACE(c.contact_phone, '[^0-9]', ''), 10)
          THEN 'Shared phone on file'
        WHEN NULLIF(TRIM(own.address_street), '') IS NOT NULL AND NULLIF(TRIM(own.address_zip), '') IS NOT NULL
          AND LOWER(TRIM(own.address_street)) = LOWER(TRIM(c.address_street))
          AND TRIM(own.address_zip) = TRIM(c.address_zip)
          AND LOWER(TRIM(COALESCE(own.address_apt, ''))) = LOWER(TRIM(COALESCE(c.address_apt, '')))
          THEN 'Shared address'
      END AS reason
    FROM clients own JOIN clients c ON c.agency_id = own.agency_id AND c.id <> own.id
    WHERE own.id = ? AND UPPER(COALESCE(c.status, '')) NOT IN ('ARCHIVED', 'MERGED', 'DELETED')
      AND NOT EXISTS (
        SELECT 1 FROM client_sibling_links s WHERE s.agency_id = own.agency_id
          AND s.first_client_id = LEAST(own.id, c.id) AND s.second_client_id = GREATEST(own.id, c.id)
      )
      ${byName ? 'AND ' + conditions : ''}
    ${byName ? '' : 'HAVING ' + conditions}
    ORDER BY reason IS NULL, c.id DESC LIMIT 40`, byName ? [client.id, search] : [client.id]);
  return visibleClients(req, rows, client.agency_id);
}

async function reminderRecipients(client) {
  const [links, tenant] = await Promise.all([
    ClientGuardian.listForClient(client.id),
    getTenantSettings(client.agency_id)
  ]);
  const channels = resolveEffectiveChannels(tenant.platform, tenant.channelsEnabled);
  const family = await appointmentFamilyRecipients(client.id, client.agency_id, { guardians: () => links });
  const recipients = family.hasRelationships ? family.recipients : [{ userId: null, role: 'client' }];
  return Promise.all(recipients.map(async recipient => {
    const consent = await loadClientConsent(client.id, client.agency_id, recipient.userId);
    const prefs = await getClientPreferences(client.agency_id, client.id, consent.guardianUserId ?? recipient.userId, consent);
    const link = links.find(row => Number(row.guardian_user_id) === Number(recipient.userId));
    return {
      id: recipient.userId || 'client',
      name: link ? [link.first_name, link.last_name].filter(Boolean).join(' ') : clientLabel(client),
      role: recipient.role,
      email: !!(channels.email && consent.email && consent.emailAddress && prefs.channels.email),
      sms: !!(channels.sms && consent.sms && consent.phoneNumber && prefs.channels.sms),
      smsPending: !!(channels.sms && !consent.sms && consent.phoneNumber && prefs.channels.sms)
    };
  }));
}

async function releaseRecipients(req, client) {
  const releases = await listReleaseRelationships(req.user, client.id).catch(error => {
    if (error.status === 403) return null;
    throw error;
  });
  if (releases === null || !client.organization_id || Number(client.organization_id) === Number(client.agency_id)) return releases;
  const [rows] = await pool.execute(`
    SELECT l.id, l.last_email_sent_to, l.last_email_sent_at, l.signed_at, u.first_name, u.last_name
    FROM client_school_roi_signing_links l
    JOIN clients c ON c.id=l.client_id AND c.organization_id=l.school_organization_id
    LEFT JOIN users u ON u.id=l.recipient_guardian_user_id
    WHERE c.id=? AND c.agency_id=? AND (l.last_email_sent_at IS NOT NULL OR l.signed_at IS NOT NULL)
    ORDER BY l.updated_at DESC LIMIT 100`, [client.id,client.agency_id]);
  return releases.concat(rows.map(row => ({
    id: `school-${row.id}`,
    name: [row.first_name,row.last_name].filter(Boolean).join(' ') || row.last_email_sent_to || 'School release signer',
    kind: 'School release request',
    status: row.signed_at ? 'Signed' : 'Email request recorded',
    at: row.signed_at || row.last_email_sent_at
  })));
}

async function read(req, res) {
  const client = await chartScope(req);
  if (req.query.search !== undefined) {
    return res.set('Cache-Control', 'no-store').json({
      candidates: (await searchSiblings(req, client, String(req.query.search ?? '').trim())).clients
    });
  }
  const [rows] = await pool.execute(`
    SELECT peer.id FROM client_sibling_links s
    JOIN clients peer ON peer.id = CASE WHEN s.first_client_id = ? THEN s.second_client_id ELSE s.first_client_id END
      AND peer.agency_id = s.agency_id
    WHERE s.agency_id = ? AND (s.first_client_id = ? OR s.second_client_id = ?)
    ORDER BY s.created_at, peer.id`, [client.id, client.agency_id, client.id, client.id]);
  const [siblings, sharedGuardians, releases, reminders] = await Promise.allSettled([
    visibleClients(req, rows, client.agency_id, { includeRestrictedDetails: true }),
    searchSiblings(req, client, '', { sharedGuardianOnly: true }),
    releaseRecipients(req, client),
    reminderRecipients(client)
  ]);
  if (siblings.status === 'rejected') throw siblings.reason;
  res.set('Cache-Control', 'no-store').json({
    siblings: siblings.value.clients,
    restrictedSiblings: siblings.value.restricted,
    sharedGuardianClients: sharedGuardians.value?.clients ?? null,
    hasRestrictedSharedGuardianClients: sharedGuardians.value?.hasRestrictedCharts ?? false,
    releases: releases.value ?? null,
    releasesUnavailable: releases.status === 'rejected',
    reminders: reminders.value ?? null,
    canEdit: editableRoles.has(req.user.role) && editableChart(client)
  });
}

async function change(req, res) {
  const client = await chartScope(req, true);
  const peerId = Number(req.params.peerId);
  if (!Number.isSafeInteger(peerId) || peerId < 1 || peerId === Number(client.id)) {
    throw fail(400, 'Select another client.');
  }
  const peer = await chartAccess(req, peerId);
  if (!peer.ok || !sameAgency(peer.client, client.agency_id)) throw fail(404, 'Related client not found.');
  const [firstId, secondId] = [Number(client.id), peerId].sort((a, b) => a - b);
  const remove = req.method === 'DELETE';
  if (!remove && !(editableChart(client) && editableChart(peer.client))) {
    throw fail(409, 'Select two charts that are currently available for linking.');
  }
  const params = [client.agency_id, firstId, secondId];
  const [result] = remove
    ? await pool.execute('DELETE FROM client_sibling_links WHERE agency_id = ? AND first_client_id = ? AND second_client_id = ?', params)
    : await pool.execute(`INSERT INTO client_sibling_links (agency_id, first_client_id, second_client_id, linked_by_user_id)
      SELECT a.agency_id, a.id, b.id, ? FROM clients a JOIN clients b ON b.agency_id = a.agency_id
      WHERE a.agency_id = ? AND a.id = ? AND b.id = ?
      ON DUPLICATE KEY UPDATE linked_by_user_id = client_sibling_links.linked_by_user_id`, [req.user.id, ...params]);
  if (result.affectedRows) await logAuditEvent(req, {
    actionType: remove ? 'client_sibling_unlinked' : 'client_sibling_linked',
    agencyId: client.agency_id,
    targetType: 'client',
    targetId: client.id,
    metadata: { relatedClientId: peerId }
  });
  res.status(204).end();
}

function handle(action) {
  return async (req, res, next) => {
    try { await action(req, res); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ error: { message: error.message } });
      next(error);
    }
  };
}

export const listClientRelationships = handle(read);
export const changeClientSibling = handle(change);
