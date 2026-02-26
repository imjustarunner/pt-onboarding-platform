import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { createClientOnboardingTaskForProvider } from './clientOnboardingTask.service.js';

async function alreadyNotified({ agencyId, userId, type, relatedEntityId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND user_id = ?
       AND type = ?
       AND related_entity_type = 'client'
       AND related_entity_id = ?
       AND is_resolved = FALSE
     LIMIT 1`,
    [agencyId, userId, type, relatedEntityId]
  );
  return !!rows[0]?.id;
}

/** Check if agency-wide paperwork_received already exists for this client (avoids duplicates). */
async function alreadyNotifiedPaperworkReceivedAgencyWide({ agencyId, clientId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND user_id IS NULL
       AND type = 'paperwork_received'
       AND related_entity_type = 'client'
       AND related_entity_id = ?
       AND is_resolved = FALSE
     LIMIT 1`,
    [agencyId, clientId]
  );
  return !!rows[0]?.id;
}

async function getAgencyAdminStaffUserIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND u.is_active = TRUE
       AND u.role IN ('admin','super_admin','support','staff')`,
    [agencyId]
  );
  return rows.map(r => r.id);
}

async function getSchoolStaffUserIds(schoolOrganizationId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND u.is_active = TRUE
       AND u.role = 'school_staff'`,
    [schoolOrganizationId]
  );
  return rows.map(r => r.id);
}

function buildChecklistDetails({
  serviceDay,
  intakeAt,
  firstServiceAt,
  parentsContactedAt,
  parentsContactedSuccessful
}) {
  const details = [];
  if (serviceDay) details.push(`Scheduled day: ${serviceDay}`);

  const formatDateOnly = (value) => {
    if (!value) return null;
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const intakeLabel = formatDateOnly(intakeAt);
  if (intakeLabel) details.push(`Intake date: ${intakeLabel}`);

  const firstServiceLabel = formatDateOnly(firstServiceAt);
  if (firstServiceLabel) details.push(`First service: ${firstServiceLabel}`);

  const parentsContactedLabel = formatDateOnly(parentsContactedAt);
  if (parentsContactedLabel) {
    if (parentsContactedSuccessful === true) {
      details.push(`Parents contacted: ${parentsContactedLabel} (Successful)`);
    } else if (parentsContactedSuccessful === false) {
      details.push(`Parents contacted: ${parentsContactedLabel} (Unsuccessful)`);
    } else {
      details.push(`Parents contacted: ${parentsContactedLabel}`);
    }
  } else if (parentsContactedSuccessful === true) {
    details.push('Parents contacted: Successful');
  } else if (parentsContactedSuccessful === false) {
    details.push('Parents contacted: Unsuccessful');
  }

  return details;
}

/** Check if agency-wide new_packet_uploaded already exists for this client (avoids duplicates). */
async function alreadyNotifiedNewPacketUploadedAgencyWide({ agencyId, clientId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND user_id IS NULL
       AND type = 'new_packet_uploaded'
       AND related_entity_type = 'client'
       AND related_entity_id = ?
       AND is_resolved = FALSE
     LIMIT 1`,
    [agencyId, clientId]
  );
  return !!rows[0]?.id;
}

export async function notifyNewPacketUploaded({ agencyId, schoolOrganizationId, clientId, clientNameOrIdentifier }) {
  if (!agencyId || !clientId) return;
  if (await alreadyNotifiedNewPacketUploadedAgencyWide({ agencyId, clientId })) return;

  const title = 'New packet uploaded';
  const message = `A new packet was uploaded for client ${clientNameOrIdentifier || `ID ${clientId}`}.`;

  await createNotificationAndDispatch({
    type: 'new_packet_uploaded',
    severity: 'warning',
    title,
    message,
    audienceJson: {
      admin: true,
      clinicalPracticeAssistant: true,
      schoolStaff: false,
      supervisor: false,
      provider: false
    },
    userId: null,
    agencyId,
    relatedEntityType: 'client',
    relatedEntityId: clientId,
    actorSource: 'System'
  }).catch(() => null);
}

export async function notifyPaperworkReceived({ agencyId, schoolOrganizationId, clientId, clientNameOrIdentifier }) {
  if (!agencyId || !clientId) return;
  if (await alreadyNotifiedPaperworkReceivedAgencyWide({ agencyId, clientId })) return;

  const title = 'Paperwork received';
  const message = `Paperwork was received for client ${clientNameOrIdentifier || `ID ${clientId}`}.`;

  await createNotificationAndDispatch({
    type: 'paperwork_received',
    severity: 'info',
    title,
    message,
    audienceJson: {
      admin: true,
      clinicalPracticeAssistant: true,
      schoolStaff: false,
      supervisor: false,
      provider: false
    },
    userId: null,
    agencyId,
    relatedEntityType: 'client',
    relatedEntityId: clientId,
    actorSource: 'System'
  }).catch(() => null);
}

export async function notifyClientBecameCurrent({
  agencyId,
  schoolOrganizationId,
  clientId,
  providerUserId,
  clientNameOrIdentifier,
  serviceDay,
  intakeAt,
  firstServiceAt,
  parentsContactedAt,
  parentsContactedSuccessful,
  actorUserId
}) {
  if (!agencyId || !clientId) return;

  const agencyStaff = await getAgencyAdminStaffUserIds(agencyId);
  const schoolStaff = schoolOrganizationId ? await getSchoolStaffUserIds(schoolOrganizationId) : [];
  const recipients = new Set([...(agencyStaff || []), ...(schoolStaff || [])]);
  if (providerUserId) recipients.add(providerUserId);

  const title = 'Client became Current';
  const details = buildChecklistDetails({ serviceDay, intakeAt, firstServiceAt, parentsContactedAt, parentsContactedSuccessful });
  const messageBase = `Client ${clientNameOrIdentifier || `ID ${clientId}`} is now Current.`;
  const message = details.length ? `${messageBase} ${details.join('; ')}.` : messageBase;

  await Promise.all(
    Array.from(recipients).map((userId) =>
      (async () => {
        if (await alreadyNotified({ agencyId, userId, type: 'client_became_current', relatedEntityId: clientId })) return null;
        const severity = userId === providerUserId ? 'warning' : 'info';
        return await createNotificationAndDispatch({
          type: 'client_became_current',
          severity,
          title,
          message,
          userId,
          agencyId,
          relatedEntityType: 'client',
          relatedEntityId: clientId,
          actorUserId
        });
      })().catch(() => null)
    )
  );

  // Create onboarding task for provider (with subtasks) so they must engage and complete
  if (providerUserId) {
    createClientOnboardingTaskForProvider({
      providerUserId,
      clientId,
      clientLabel: clientNameOrIdentifier,
      serviceDay,
      assignedByUserId: actorUserId
    }).catch(() => {});
  }
}

export async function notifyClientTerminated({
  agencyId,
  schoolOrganizationId,
  clientId,
  clientNameOrIdentifier,
  terminationReason,
  actorUserId
}) {
  if (!agencyId || !clientId) return;

  const agencyStaff = await getAgencyAdminStaffUserIds(agencyId);
  const schoolStaff = schoolOrganizationId ? await getSchoolStaffUserIds(schoolOrganizationId) : [];
  const recipients = new Set([...(agencyStaff || []), ...(schoolStaff || [])]);

  const title = 'Client terminated';
  const reasonSnippet = terminationReason ? ` Reason: ${String(terminationReason).slice(0, 200)}${terminationReason.length > 200 ? '…' : ''}` : '';
  const message = `Client ${clientNameOrIdentifier || `ID ${clientId}`} has been terminated.${reasonSnippet}`;

  await Promise.all(
    Array.from(recipients).map((userId) =>
      (async () => {
        if (await alreadyNotified({ agencyId, userId, type: 'client_terminated', relatedEntityId: clientId })) return null;
        return await createNotificationAndDispatch({
          type: 'client_terminated',
          severity: 'warning',
          title,
          message,
          userId,
          agencyId,
          relatedEntityType: 'client',
          relatedEntityId: clientId,
          actorUserId
        });
      })().catch(() => null)
    )
  );
}

export async function notifyClientChecklistUpdated({
  agencyId,
  schoolOrganizationId,
  clientId,
  providerUserId,
  clientNameOrIdentifier,
  serviceDay,
  intakeAt,
  firstServiceAt,
  parentsContactedAt,
  parentsContactedSuccessful,
  actorUserId
}) {
  if (!agencyId || !clientId) return;

  const agencyStaff = await getAgencyAdminStaffUserIds(agencyId);
  const schoolStaff = schoolOrganizationId ? await getSchoolStaffUserIds(schoolOrganizationId) : [];
  const recipients = new Set([...(agencyStaff || []), ...(schoolStaff || [])]);
  if (providerUserId) recipients.add(providerUserId);

  const title = 'Client checklist updated';
  const details = buildChecklistDetails({ serviceDay, intakeAt, firstServiceAt, parentsContactedAt, parentsContactedSuccessful });
  const messageBase = `Client ${clientNameOrIdentifier || `ID ${clientId}`} checklist updated.`;
  const message = details.length ? `${messageBase} ${details.join('; ')}.` : messageBase;

  await Promise.all(
    Array.from(recipients).map((userId) =>
      (async () => {
        if (await alreadyNotified({ agencyId, userId, type: 'client_checklist_updated', relatedEntityId: clientId })) return null;
        return await createNotificationAndDispatch({
          type: 'client_checklist_updated',
          severity: 'info',
          title,
          message,
          userId,
          agencyId,
          relatedEntityType: 'client',
          relatedEntityId: clientId,
          actorUserId
        });
      })().catch(() => null)
    )
  );
}

