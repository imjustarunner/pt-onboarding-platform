import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

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

export async function notifyPaperworkReceived({ agencyId, schoolOrganizationId, clientId, clientNameOrIdentifier }) {
  if (!agencyId || !clientId) return;
  const recipients = await getAgencyAdminStaffUserIds(agencyId);
  const title = 'Paperwork received';
  const message = `Paperwork was received for client ${clientNameOrIdentifier || `ID ${clientId}`}.`;

  await Promise.all(
    recipients.map((userId) =>
      (async () => {
        if (await alreadyNotified({ agencyId, userId, type: 'paperwork_received', relatedEntityId: clientId })) return null;
        return await createNotificationAndDispatch({
          type: 'paperwork_received',
          severity: 'info',
          title,
          message,
          userId,
          agencyId,
          relatedEntityType: 'client',
          relatedEntityId: clientId
        });
      })().catch(() => null)
    )
  );
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
        return await createNotificationAndDispatch({
          type: 'client_became_current',
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

