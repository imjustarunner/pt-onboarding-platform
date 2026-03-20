import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { createClientOnboardingTaskForProvider } from './clientOnboardingTask.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';

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

async function getSchoolItscoEmail(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT sp.itsco_email
       FROM school_profiles sp
       WHERE sp.school_organization_id = ?
       LIMIT 1`,
      [sid]
    );
    const email = String(rows?.[0]?.itsco_email || '').trim();
    return email || null;
  } catch {
    return null;
  }
}

const DEFAULT_SCHOOL_INTAKE_FROM_NAME = 'ITSCO - School Intake';

function isTestOrPlaceholderSenderDisplayName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  return (
    n.includes('fakey') ||
    n.includes('fake school') ||
    n.includes('test school') ||
    n.includes('placeholder') ||
    n.includes('example school')
  );
}

async function getSchoolIntakeEmailFromDisplayName(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return DEFAULT_SCHOOL_INTAKE_FROM_NAME;
  try {
    const [rows] = await pool.execute(
      `SELECT TRIM(a.name) AS agency_name, TRIM(sp.district_name) AS district_name
       FROM agencies a
       LEFT JOIN school_profiles sp ON sp.school_organization_id = a.id
       WHERE a.id = ?
       LIMIT 1`,
      [sid]
    );
    const row = rows?.[0] || {};
    const raw = String(row.agency_name || row.district_name || '').trim();
    if (!raw || isTestOrPlaceholderSenderDisplayName(raw)) return DEFAULT_SCHOOL_INTAKE_FROM_NAME;
    return `${raw} - School Intake`;
  } catch {
    return DEFAULT_SCHOOL_INTAKE_FROM_NAME;
  }
}

async function resolveNotificationsSenderIdentityId({ preferAgencyId = null } = {}) {
  try {
    const notificationsEmail = 'notifications@itsco.health';
    const aid = Number(preferAgencyId || 0) || null;

    // 1) Parent therapy agency only (school orgs are affiliates; their intake mail should use
    //    the main agency's sender identities — not platform — unless the agency has nothing).
    if (aid) {
      try {
        const agencyOnly = await resolvePreferredSenderIdentityForAgency({
          agencyId: aid,
          preferredKeys: ['school_intake', 'notifications', 'intake', 'system'],
          includePlatformDefaults: false,
          onlyActive: true
        });
        if (Number(agencyOnly?.id || 0)) {
          const fe = String(agencyOnly.from_email || '').trim().toLowerCase();
          if (fe === notificationsEmail) return Number(agencyOnly.id);
        }
      } catch {
        // ignore
      }
    }

    // 2) Platform defaults (agency_id IS NULL). Never prefer test/pilot display names when
    //    multiple platform rows share the same from_email.
    const platformIdentities = await EmailSenderIdentity.list({
      agencyId: null,
      includePlatformDefaults: true,
      onlyActive: true
    });
    const platformNotificationMatches = (platformIdentities || []).filter((row) =>
      String(row?.from_email || '').trim().toLowerCase() === notificationsEmail
    );
    const withoutTestNames = platformNotificationMatches.filter(
      (row) => !isTestOrPlaceholderSenderDisplayName(row?.display_name)
    );
    const candidates = withoutTestNames.length ? withoutTestNames : platformNotificationMatches;
    const preferredItsco = candidates.find((row) =>
      String(row?.display_name || '').trim().toLowerCase().includes('itsco')
    );
    const chosen = preferredItsco || candidates[0] || null;
    if (Number(chosen?.id || 0)) return Number(chosen.id);

    const identity = await EmailSenderIdentity.findByFromEmail(notificationsEmail, {
      preferAgencyId: aid,
      skipTestDisplayNames: true
    });
    return Number(identity?.id || 0) || null;
  } catch {
    return null;
  }
}

async function resolveIntakeStatusSenderIdentityId({ agencyId }) {
  return await resolveNotificationsSenderIdentityId({ preferAgencyId: agencyId });
}

async function sendSchoolIntakeStatusEmail({
  schoolOrganizationId,
  agencyId,
  mode,
  clientInitials,
  schoolStaffName
}) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return false;
  const to = await getSchoolItscoEmail(sid);
  if (!to) return false;
  const senderIdentityId = await resolveIntakeStatusSenderIdentityId({ agencyId });
  if (!senderIdentityId) return false;

  const initialsRaw = String(clientInitials || '').trim();
  const hasKnownInitials = !!initialsRaw && initialsRaw.toUpperCase() !== 'TBD';
  const initials = hasKnownInitials ? initialsRaw : null;
  const staff = String(schoolStaffName || '').trim();
  const includePaperStaffSentence = mode === 'paper_upload' && !!initials && !!staff;

  let subject = '';
  let text = '';
  if (mode === 'paper_upload') {
    subject = 'Portal Document';
    text = [
      'Hello,',
      '',
      includePaperStaffSentence
        ? `A new paper packet has been uploaded into our system by ${staff} for the client ${initials}. Please login at app.ITSCO.health to view the client's status. Our team has been notified and they will be working on getting them ready to go!`
        : (
            initials
              ? `A new paper packet has been uploaded into our system for the client ${initials}. Please login at app.ITSCO.health to view the client's status. Our team has been notified and they will be working on getting them ready to go!`
              : `A new paper packet has been uploaded into our system for a new client intake. Please login at app.ITSCO.health to view the client's status. Our team has been notified and they will be working on getting them ready to go!`
          ),
      '',
      'Thank you,',
      '',
      'ITSCO Support'
    ].join('\n');
  } else {
    subject = 'Portal Document';
    text = [
      'Hello,',
      '',
      (
        initials
          ? `A new digital intake packet/form has been submitted for the client with the initials of ${initials}. Please login at app.ITSCO.health to view the client's status. Our team has been notified and they will be working on getting them ready to go!`
          : `A new digital intake packet/form has been submitted for a new client intake. Please login at app.ITSCO.health to view the client's status. Our team has been notified and they will be working on getting them ready to go!`
      ),
      '',
      'Thank you,',
      '',
      'ITSCO Support'
    ].join('\n');
  }
  const html = text
    .split('\n')
    .map((line) => (line ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '<p>&nbsp;</p>'))
    .join('');

  const fromDisplayNameOverride = await getSchoolIntakeEmailFromDisplayName(sid);

  await sendEmailFromIdentity({
    senderIdentityId,
    to,
    subject,
    text,
    html,
    source: 'auto',
    fromDisplayNameOverride
  });
  return true;
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

export async function notifyNewPacketUploaded({
  agencyId,
  schoolOrganizationId,
  clientId,
  clientNameOrIdentifier,
  clientInitials,
  mode = 'digital_submission',
  schoolStaffName = null
}) {
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

  // School-facing status email (uses editable sender identity: notifications@itsco.health).
  await sendSchoolIntakeStatusEmail({
    schoolOrganizationId,
    agencyId,
    mode,
    clientInitials,
    schoolStaffName
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

/** Guard: skip if we already created client_terminated notifications for this client recently.
 * Prevents duplicate notifications when terminate is triggered multiple times (race, double-click, etc). */
async function clientTerminationAlreadyNotifiedRecently({ agencyId, clientId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND type = 'client_terminated'
       AND related_entity_type = 'client'
       AND related_entity_id = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
     LIMIT 1`,
    [agencyId, clientId]
  );
  return !!rows[0]?.id;
}

export async function notifyClientTerminated({
  agencyId,
  schoolOrganizationId,
  clientId,
  clientNameOrIdentifier,
  terminationReason,
  actorUserId,
  providerUserId
}) {
  if (!agencyId || !clientId) return;

  if (await clientTerminationAlreadyNotifiedRecently({ agencyId, clientId })) return;

  const agencyStaff = await getAgencyAdminStaffUserIds(agencyId);
  const schoolStaff = schoolOrganizationId ? await getSchoolStaffUserIds(schoolOrganizationId) : [];
  const recipients = new Set([...(agencyStaff || []), ...(schoolStaff || [])]);
  if (providerUserId) recipients.add(providerUserId);

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

