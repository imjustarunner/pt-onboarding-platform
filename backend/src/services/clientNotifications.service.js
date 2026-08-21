import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { createClientOnboardingTaskForProvider } from './clientOnboardingTask.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import Agency from '../models/Agency.model.js';

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

async function getSchoolDisplayName(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return 'School';
  try {
    const [rows] = await pool.execute(
      `SELECT TRIM(a.name) AS agency_name
       FROM agencies a
       WHERE a.id = ?
       LIMIT 1`,
      [sid]
    );
    const raw = String(rows?.[0]?.agency_name || '').trim();
    if (!raw || isTestOrPlaceholderSenderDisplayName(raw)) return 'School';
    return raw;
  } catch {
    return 'School';
  }
}

const SCHOOLS_REPLY_TO = 'schools@itsco.health';

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

async function logSchoolStatusEmailSkip({
  agencyId = null,
  clientId = null,
  schoolOrganizationId = null,
  to = null,
  subject = null,
  reason = null
} = {}) {
  try {
    await CommunicationLoggingService.logGeneratedCommunication({
      userId: null,
      clientId: clientId || null,
      agencyId: agencyId || null,
      templateType: 'school_enrollment_packet_status',
      templateId: null,
      subject: subject || 'School enrollment packet status (not sent)',
      body: String(reason || 'not sent'),
      generatedByUserId: null,
      channel: 'email',
      recipientAddress: to || null,
      metadata: {
        schoolOrganizationId: schoolOrganizationId || null,
        skipReason: reason || 'unknown'
      }
    }).then(async (comm) => {
      if (!comm?.id) return;
      await pool.execute(
        `UPDATE user_communications
         SET delivery_status = 'failed', error_message = ?
         WHERE id = ?`,
        [String(reason || 'not sent').slice(0, 500), comm.id]
      ).catch(() => {});
    });
  } catch {
    // best-effort diagnostics
  }
}

function isNotificationsMailbox(identity) {
  return String(identity?.from_email || '').trim().toLowerCase() === 'notifications@itsco.health';
}

/**
 * From: notifications@itsco.health (school_intake / notifications key).
 * Signature: prefer schools@ mailbox art when the From identity has none.
 */
async function resolveIntakeStatusSenderIdentity({ agencyId } = {}) {
  const aid = Number(agencyId || 0) || null;
  try {
    let fromIdentity = null;
    if (aid) {
      fromIdentity = await resolvePreferredSenderIdentityForAgency({
        agencyId: aid,
        preferredKeys: ['school_intake', 'notifications', 'intake', 'system'],
        includePlatformDefaults: false,
        onlyActive: true
      });
      if (fromIdentity && !isNotificationsMailbox(fromIdentity)) {
        const list = await EmailSenderIdentity.list({
          agencyId: aid,
          includePlatformDefaults: false,
          onlyActive: true
        });
        fromIdentity = (list || []).find(isNotificationsMailbox) || fromIdentity;
      }
    }
    if (!fromIdentity || !Number(fromIdentity.id || 0)) {
      const identity = await EmailSenderIdentity.findByFromEmail('notifications@itsco.health', {
        preferAgencyId: aid,
        skipTestDisplayNames: true
      });
      fromIdentity = identity || null;
    }
    if (!fromIdentity || !Number(fromIdentity.id || 0)) return null;

    const hasSig = !!(
      String(fromIdentity.signature_image_path || '').trim()
      || String(fromIdentity.signature_image_url || '').trim()
    );
    if (hasSig) return { senderIdentityId: Number(fromIdentity.id), signatureIdentityId: null };

    // User request: use schools@ITSCO.health signature art on these school group emails.
    let schoolsIdentity = null;
    if (aid) {
      const list = await EmailSenderIdentity.list({
        agencyId: aid,
        includePlatformDefaults: false,
        onlyActive: true
      });
      schoolsIdentity = (list || []).find((row) =>
        String(row?.identity_key || '').trim().toLowerCase() === 'schools'
        || String(row?.from_email || '').trim().toLowerCase() === 'schools@itsco.health'
      ) || null;
    }
    if (!schoolsIdentity) {
      schoolsIdentity = await EmailSenderIdentity.findByFromEmail('schools@itsco.health', {
        preferAgencyId: aid,
        skipTestDisplayNames: true
      }).catch(() => null);
    }
    const signatureIdentityId = Number(schoolsIdentity?.id || 0) || null;
    return {
      senderIdentityId: Number(fromIdentity.id),
      signatureIdentityId:
        signatureIdentityId && signatureIdentityId !== Number(fromIdentity.id)
          ? signatureIdentityId
          : null
    };
  } catch {
    return null;
  }
}

async function sendSchoolIntakeStatusEmail({
  schoolOrganizationId,
  agencyId,
  mode,
  clientInitials,
  schoolStaffName,
  clientId = null
}) {
  const sid = Number(schoolOrganizationId || 0);
  const aid = Number(agencyId || 0) || null;
  const isPaper = String(mode || '').toLowerCase() === 'paper_upload';
  const schoolName = sid ? await getSchoolDisplayName(sid) : 'School';

  const initialsRaw = String(clientInitials || '').trim();
  const hasKnownInitials = !!initialsRaw && initialsRaw.toUpperCase() !== 'TBD';
  const initials = hasKnownInitials ? initialsRaw : null;
  const staff = String(schoolStaffName || '').trim();

  const subject = isPaper
    ? `${schoolName} - Paper Enrollment Packet Uploaded`
    : `${schoolName} - Digital Enrollment Packet`;

  if (!sid) {
    await logSchoolStatusEmailSkip({
      agencyId: aid,
      clientId,
      subject,
      reason: 'Missing school organization id'
    });
    return false;
  }

  const to = await getSchoolItscoEmail(sid);
  if (!to) {
    await logSchoolStatusEmailSkip({
      agencyId: aid,
      clientId,
      schoolOrganizationId: sid,
      subject,
      reason: `No school ITSCO group email (school_profiles.itsco_email) for school #${sid}`
    });
    return false;
  }

  const senderResolved = await resolveIntakeStatusSenderIdentity({ agencyId: aid });
  const senderIdentityId = Number(senderResolved?.senderIdentityId || 0) || null;
  const signatureIdentityId = Number(senderResolved?.signatureIdentityId || 0) || null;
  if (!senderIdentityId) {
    await logSchoolStatusEmailSkip({
      agencyId: aid,
      clientId,
      schoolOrganizationId: sid,
      to,
      subject,
      reason: 'No notifications@itsco.health sender identity configured'
    });
    return false;
  }

  let portalUrl = 'https://app.itsco.health';
  try {
    const agency = aid ? await Agency.findById(aid) : null;
    portalUrl = buildPublicAppUrl(agency || { slug: 'itsco' }, '') || portalUrl;
  } catch {
    // keep default
  }
  const loginUrl = portalUrl.replace(/\/$/, '') + '/login';

  const packetLabel = isPaper ? 'Paper Enrollment Packet' : 'Digital Enrollment Packet';
  const supportTeam = 'School support team';

  const lead = isPaper
    ? (
        initials && staff
          ? `A new ${packetLabel} has been uploaded into our system by ${staff} for the client with initials ${initials}.`
          : initials
            ? `A new ${packetLabel} has been uploaded into our system for the client with initials ${initials}.`
            : `A new ${packetLabel} has been uploaded into our system for a new client.`
      )
    : (
        initials
          ? `A new ${packetLabel} has been submitted for the client with initials ${initials}.`
          : `A new ${packetLabel} has been submitted for a new client.`
      );

  const text = [
    'Hello,',
    '',
    lead,
    '',
    'Our team has been notified and we are working on getting this client onboarded and ready for scheduling. Once our team has completed our steps and we assign a clinician, you will receive an email that the client is ready to schedule. If they are waitlisted, you will also be notified on that same status digest with the waitlist reason.',
    '',
    `You can view this client's status in the school portal anytime:`,
    loginUrl,
    '',
    'Thank you,',
    '',
    supportTeam,
    '',
    'Questions? Reply to this email or contact schools@ITSCO.health.'
  ].join('\n');

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 640px;">
      <p>Hello,</p>
      <p>${esc(lead)}</p>
      <p>Our team has been notified and we are working on getting this client onboarded and ready for scheduling. Once our team has completed our steps and we assign a clinician, you will receive an email that the client is ready to schedule. If they are waitlisted, you will also be notified on that same status digest with the waitlist reason.</p>
      <p><a href="${esc(loginUrl)}" style="display:inline-block;padding:10px 16px;background:#1f6b4a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open school portal</a></p>
      <p style="font-size:13px;color:#555;">Or visit <a href="${esc(loginUrl)}">${esc(loginUrl)}</a></p>
      <p>Thank you,</p>
      <p style="margin-top: 12px;"><strong>${esc(supportTeam)}</strong></p>
      <p style="font-size:12px;color:#666;">Questions? Reply to this email or contact <a href="mailto:schools@ITSCO.health">schools@ITSCO.health</a>.</p>
    </div>
  `.trim();

  const fromDisplayNameOverride = isPaper
    ? `${schoolName} - Paper Enrollment Packet Uploaded`
    : `${schoolName} - Digital Enrollment Packet`;

  try {
    const result = await sendEmailFromIdentity({
      senderIdentityId,
      to,
      subject,
      text,
      html,
      source: 'auto',
      agencyId: aid,
      clientId: clientId || null,
      templateType: 'school_enrollment_packet_status',
      fromDisplayNameOverride,
      replyToOverride: SCHOOLS_REPLY_TO,
      signatureIdentityId,
      linkUrl: loginUrl
    });
    if (result?.skipped || result?.blocked) {
      console.warn('[schoolEnrollmentPacketStatus] send skipped/blocked', {
        schoolOrganizationId: sid,
        clientId,
        reason: result.reason || result.qualityFlags
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[schoolEnrollmentPacketStatus] send failed', err?.message || err);
    await logSchoolStatusEmailSkip({
      agencyId: aid,
      clientId,
      schoolOrganizationId: sid,
      to,
      subject,
      reason: String(err?.message || err || 'send failed').slice(0, 500)
    });
    return false;
  }
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

/**
 * Internal alert when a Quick Prospective / adaptive interest form is submitted.
 */
export async function notifyNewProspectiveInquiry({
  agencyId,
  clientId,
  clientName,
  pathway = 'quick_prospective',
  vertical = 'clinical'
}) {
  if (!agencyId || !clientId) return;
  const title = 'New prospective inquiry';
  const message = `${clientName || `Client #${clientId}`} submitted a ${String(pathway).replace(/_/g, ' ')} (${vertical}).`;

  await createNotificationAndDispatch({
    type: 'new_prospective_inquiry',
    severity: 'info',
    title,
    message,
    audienceJson: {
      admin: true,
      clinicalPracticeAssistant: true,
      schoolStaff: false,
      supervisor: true,
      provider: false
    },
    userId: null,
    agencyId,
    relatedEntityType: 'client',
    relatedEntityId: clientId,
    actorSource: 'System'
  }).catch(() => null);
}

export async function notifyClinicalSafetyAlert({
  agencyId,
  clientId,
  clientName
}) {
  if (!agencyId || !clientId) return;
  await createNotificationAndDispatch({
    type: 'clinical_safety_alert',
    severity: 'warning',
    title: 'Intake safety screen needs review',
    message: `${clientName || `Client #${clientId}`} submitted an intake with a positive safety screening. Review before treating this as a routine completed packet.`,
    audienceJson: {
      admin: true,
      clinicalPracticeAssistant: true,
      schoolStaff: false,
      supervisor: true,
      provider: true
    },
    userId: null,
    agencyId,
    relatedEntityType: 'client',
    relatedEntityId: clientId,
    actorSource: 'Public Intake'
  }).catch(() => null);
}

/** Skip school status email if we already sent one for this client recently. */
async function alreadySentSchoolEnrollmentPacketEmail({ agencyId, clientId }) {
  const aid = Number(agencyId || 0);
  const cid = Number(clientId || 0);
  if (!aid || !cid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM user_communications
       WHERE agency_id = ?
         AND client_id = ?
         AND template_type = 'school_enrollment_packet_status'
         AND delivery_status IN ('sent', 'delivered', 'pending')
         AND generated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       LIMIT 1`,
      [aid, cid]
    );
    return !!rows[0]?.id;
  } catch {
    return false;
  }
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

  const alreadyNotified = await alreadyNotifiedNewPacketUploadedAgencyWide({ agencyId, clientId });
  if (!alreadyNotified) {
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

  // School email is independent of in-app notification idempotency so a prior silent
  // failure can still be diagnosed / retried until a successful/pending send exists.
  if (!(await alreadySentSchoolEnrollmentPacketEmail({ agencyId, clientId }))) {
    await sendSchoolIntakeStatusEmail({
      schoolOrganizationId,
      agencyId,
      mode,
      clientInitials,
      schoolStaffName,
      clientId
    }).catch((err) => {
      console.error('[notifyNewPacketUploaded] school status email error', err?.message || err);
    });
  }
}

/** Resolve recipient user IDs for a company-event registration notification.
 * Targets agency admin/staff plus active members of the program that owns the
 * event and providers directly assigned to the event. The broad agency-level
 * coordinator flag is intentionally insufficient: it does not mean the user
 * participates in every program or event in that agency.
 */
async function getCompanyEventRegistrationRecipientUserIds({ agencyId, eventId, programOrganizationId }) {
  const ids = new Set();
  try {
    const agencyStaff = await getAgencyAdminStaffUserIds(agencyId);
    agencyStaff.forEach((id) => ids.add(Number(id)));
  } catch {
    // ignore
  }
  if (programOrganizationId) {
    try {
      const [programRows] = await pool.execute(
        `SELECT DISTINCT u.id
         FROM user_agencies ua
         JOIN users u ON u.id = ua.user_id
         JOIN agencies program ON program.id = ua.agency_id
         WHERE ua.agency_id = ?
           AND ua.is_active = TRUE
           AND u.is_active = TRUE
           AND program.is_active = TRUE`,
        [programOrganizationId]
      );
      (programRows || []).forEach((row) => ids.add(Number(row.id)));
    } catch {
      // ignore
    }
  }
  if (eventId) {
    try {
      const [eventRows] = await pool.execute(
        `SELECT DISTINCT eligible.user_id AS id
         FROM (
           SELECT provider_user_id AS user_id
           FROM company_event_provider_assignments
           WHERE company_event_id = ?
           UNION
           SELECT provider_user_id AS user_id
           FROM company_event_session_providers
           WHERE company_event_id = ? AND assignment_status IN ('tentative', 'finalized')
           UNION
           SELECT created_by_user_id AS user_id
           FROM company_events
           WHERE id = ? AND created_by_user_id IS NOT NULL
         ) eligible
         JOIN users u ON u.id = eligible.user_id AND u.is_active = TRUE`,
        [eventId, eventId, eventId]
      );
      (eventRows || []).forEach((row) => ids.add(Number(row.id)));
    } catch {
      // Older deployments may not yet have all assignment tables.
    }
  }
  return Array.from(ids).filter((n) => Number.isFinite(n) && n > 0);
}

async function alreadyNotifiedCompanyEventRegistration({ agencyId, userId, eventId, clientId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND user_id = ?
       AND type = 'company_event_registration_submitted'
       AND related_entity_type = 'company_event'
       AND related_entity_id = ?
       AND (message LIKE ? OR ? = 0)
       AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
     LIMIT 1`,
    [agencyId, userId, eventId, `%client #${clientId}%`, clientId ? 1 : 0]
  );
  return !!rows[0]?.id;
}

/** Notify staff that a guardian/applicant submitted a registration to a Skill Builders / program company event.
 * Creates per-user notifications so push + personal-only roles can see them.
 */
export async function notifyCompanyEventRegistrationSubmitted({
  agencyId,
  eventId,
  clientIds = [],
  clientLabels = {},
  actorUserId = null,
  source = 'public_intake'
}) {
  const aid = Number(agencyId || 0);
  const eid = Number(eventId || 0);
  const ids = (Array.isArray(clientIds) ? clientIds : [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!aid || !eid || !ids.length) return;

  let event = null;
  try {
    const [evRows] = await pool.execute(
      `SELECT id, agency_id, organization_id, title, starts_at
       FROM company_events
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [eid, aid]
    );
    event = evRows?.[0] || null;
  } catch {
    event = null;
  }
  if (!event) return;

  const programOrganizationId = Number(event.organization_id || 0) || null;

  const recipients = await getCompanyEventRegistrationRecipientUserIds({
    agencyId: aid,
    eventId: eid,
    programOrganizationId
  });
  if (!recipients.length) return;

  const eventTitle = String(event.title || `Event ${eid}`).trim();
  const startLabel = (() => {
    if (!event.starts_at) return '';
    try {
      const d = new Date(event.starts_at);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  })();

  const clientCount = ids.length;
  const firstLabel = clientLabels[ids[0]] || `client #${ids[0]}`;
  const labelSuffix =
    clientCount === 1
      ? `for ${firstLabel}`
      : `for ${firstLabel} and ${clientCount - 1} other${clientCount > 2 ? 's' : ''}`;
  const dateSuffix = startLabel ? ` (starts ${startLabel})` : '';
  const sourceSuffix =
    source === 'guardian_portal'
      ? ' via guardian portal'
      : source === 'public_intake'
        ? ' via public intake'
        : '';

  const title = 'New event registration';
  const message = `New registration ${labelSuffix} for "${eventTitle}"${dateSuffix}${sourceSuffix}.`;

  await Promise.all(
    recipients.map((userId) =>
      (async () => {
        try {
          if (
            await alreadyNotifiedCompanyEventRegistration({
              agencyId: aid,
              userId,
              eventId: eid,
              clientId: ids[0]
            })
          ) {
            return null;
          }
        } catch {
          // proceed even if dedup check fails
        }
        return await createNotificationAndDispatch({
          type: 'company_event_registration_submitted',
          severity: 'info',
          title,
          message,
          userId,
          agencyId: aid,
          relatedEntityType: 'company_event',
          relatedEntityId: eid,
          actorUserId,
          actorSource: actorUserId ? null : 'System'
        });
      })().catch(() => null)
    )
  );
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
