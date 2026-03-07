import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';

const AUTHORIZED_REPRESENTATIVE = {
  name: 'Michael Mendez, LPC',
  email: 'michael@itsco.health',
  organizationName: 'ITSCO',
  mailingAddress: '5373 N. Union Blvd. Suite 104. Colorado Springs, CO 80918',
  supportEmail: 'support@itsco.health',
  supportPhone: '833-444-8726 extension 0'
};

const PURPOSES = [
  'Release ITSCO and any assigned providers and staff to communicate with the selected school and approved school staff to support school-based care coordination.',
  'Safety concerns and evaluations of harm or ideation performed in sessions.',
  'Coordinating the administration of psychological services on the third party’s property.',
  'Discussing treatment goals and associated treatment plans.'
];

const GUIDELINES = [
  'Information regarding the content of sessions will not be shared with the staff listed unless deemed clinically necessary by the therapist for safety reasons such as imminent risk to the clinician, the client, or others including physical harm.',
  'Confidentiality will be maintained except for the aforementioned.',
  'All correspondence concerning my dependent will be documented in the clinical record.',
  'ITSCO will comply with all applicable laws and regulations pertaining to the handling of confidential information.'
];

const REQUIRED_ACKNOWLEDGEMENTS = [
  {
    id: 'esign_consent',
    title: 'Electronic consent',
    body: 'I agree to review, receive, and sign this release electronically through ITSCO’s secure online platform used for care coordination and scheduling.'
  },
  {
    id: 'hipaa_privacy',
    title: 'App, privacy, and HIPAA notice',
    body: 'I understand ITSCO uses this app for scheduling and care-support communication. Only approved school staff will have access to the client’s brief ROI-related file for communication and scheduling purposes. ITSCO limits disclosure to authorized needs, protects information, and maintains auditable access/release logs. I understand in-progress responses may be saved in this browser for up to one hour to prevent accidental data loss, and I should only continue on a secure/private device or browser session when entering protected health information.'
  },
  {
    id: 'redisclosure_risk',
    title: 'Redisclosure risk',
    body: 'I understand information shared by ITSCO may be subject to redistribution by the receiving party and may no longer be protected in the same manner once disclosed.'
  },
  {
    id: 'revocation_right',
    title: 'Revocation right',
    body: 'I understand I may revoke this authorization at any time, but actions already taken based on this release cannot be reversed.'
  },
  {
    id: 'voluntary_authorization',
    title: 'Voluntary authorization',
    body: 'I understand the potential consequences of this disclosure and I am authorizing it voluntarily.'
  }
];

const WAIVER_ITEMS = [
  {
    id: 'communication_and_care_planning',
    title: 'School communication and care planning',
    body: 'I authorize ITSCO and any assigned providers and staff to communicate with approved school staff for school-based care coordination and support of the client’s identified needs.'
  },
  {
    id: 'safety_concerns',
    title: 'Safety concerns',
    body: 'I authorize disclosure of safety concerns, harm evaluations, or ideation information when the therapist determines it is clinically necessary for safety.'
  },
  {
    id: 'services_on_school_property',
    title: 'Services on school property',
    body: 'I authorize coordination related to psychological services being delivered on school property, and understand the school environment does not provide the same privacy protections as a private clinical office.',
    requiredAccept: true
  },
  {
    id: 'school_scheduling_safety_logistics',
    title: 'School scheduling and safety logistics',
    body: 'I authorize limited scheduling/logistics visibility for school operations and student safety when needed (for example, class pull timing, location transitions, and pickup coordination). I understand this limited visibility may involve school staff not listed on this ROI receiving only operational timing details, not broader clinical content.',
    requiredAccept: true
  },
  {
    id: 'treatment_goals',
    title: 'Treatment goals and plans',
    body: 'I authorize brief discussion of treatment goals/objectives only as needed for care coordination with approved school staff; no session-content details are released outside this care purpose.'
  },
  {
    id: 'session_content_limitation',
    title: 'Session content limitation',
    body: 'I authorize release of session-content details only when clinically necessary for safety because of imminent risk to the clinician, client, or others.'
  },
  {
    id: 'documentation_logging',
    title: 'Documentation and logging',
    body: 'I authorize documentation of all correspondence and release activity related to this authorization in the clinical record and audit logs.'
  }
];

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}

function normalizeDecision(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['accept', 'accepted', 'approve', 'approved', 'yes', 'allow', 'allowed', 'true', '1'].includes(normalized)) {
    return 'accept';
  }
  if (['decline', 'declined', 'deny', 'denied', 'no', 'refuse', 'refused', 'false', '0'].includes(normalized)) {
    return 'decline';
  }
  return 'undecided';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString();
}

function buildSchoolAddress(organization = {}) {
  const direct = String(
    organization?.school_profile?.school_address
    || organization?.school_address
    || organization?.street_address
    || ''
  ).trim();
  if (direct) return direct;
  const parts = [
    organization?.street_address,
    organization?.city,
    organization?.state,
    organization?.postal_code
  ].map((part) => String(part || '').trim()).filter(Boolean);
  return parts.join(', ') || '';
}

function buildSchoolContact(organization = {}) {
  const contactName = String(
    organization?.school_profile?.primary_contact_name
    || organization?.primary_contact_name
    || ''
  ).trim() || null;
  const contactEmail = String(
    organization?.school_profile?.primary_contact_email
    || organization?.contact_email
    || organization?.email
    || ''
  ).trim() || null;
  const contactPhone = String(
    organization?.school_profile?.primary_contact_phone
    || organization?.contact_phone
    || organization?.phone_number
    || ''
  ).trim() || null;
  return {
    name: contactName,
    email: contactEmail,
    phone: contactPhone
  };
}

function preferredTemplate(templates = []) {
  return templates.find((template) => String(template?.document_type || '').trim().toLowerCase() === 'school_roi')
    || templates[0]
    || null;
}

function normalizeStaffDecisions(staffRoster = [], roi = {}) {
  const decisionMap = new Map(
    (Array.isArray(roi?.staffDecisions) ? roi.staffDecisions : [])
      .map((entry) => {
        const staffId = Number(entry?.schoolStaffUserId || entry?.userId || 0);
        if (!staffId) return null;
        return [staffId, normalizeBool(entry?.allowed)];
      })
      .filter(Boolean)
  );

  return (staffRoster || []).map((staff) => ({
    schoolStaffUserId: Number(staff.school_staff_user_id || staff.schoolStaffUserId || 0),
    fullName: staff.full_name || staff.fullName || staff.display_name || [staff.first_name, staff.last_name].filter(Boolean).join(' ').trim() || staff.email || `User ${staff.school_staff_user_id || staff.schoolStaffUserId || ''}`,
    email: staff.email || null,
    phone: staff.phone || staff.phone_number || null,
    role: staff.role || staff.role_key || 'School staff',
    allowed: decisionMap.get(Number(staff.school_staff_user_id || staff.schoolStaffUserId || 0)) === true
  }));
}

function normalizeAcknowledgements(definitions = [], values = {}) {
  return definitions.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    accepted: values?.[item.id] === null || values?.[item.id] === undefined
      ? null
      : normalizeBool(values?.[item.id])
  }));
}

function normalizeWaiverItems(definitions = [], values = {}) {
  return definitions.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    requiredAccept: item.requiredAccept === true,
    decision: normalizeDecision(values?.[item.id])
  }));
}

export function isSmartSchoolRoiForm(link) {
  return String(link?.form_type || '').trim().toLowerCase() === 'smart_school_roi';
}

export async function buildSmartSchoolRoiContext({ link, boundClient, organization, agency, templates = [] }) {
  const schoolOrganizationId = Number(boundClient?.organization_id || link?.organization_id || organization?.id || 0) || null;
  let staffRoster = [];
  if (schoolOrganizationId && boundClient?.id) {
    staffRoster = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForClient({
      clientId: boundClient.id,
      schoolOrganizationId,
      roiExpiresAt: boundClient.roi_expires_at || null
    });
  }
  if (schoolOrganizationId && (!Array.isArray(staffRoster) || staffRoster.length === 0)) {
    staffRoster = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({
      schoolOrganizationId
    });
  }

  const template = preferredTemplate(templates);

  return {
    client: {
      id: Number(boundClient?.id || 0) || null,
      fullName: String(boundClient?.full_name || '').trim() || null,
      initials: String(boundClient?.initials || '').trim() || null,
      dateOfBirth: boundClient?.date_of_birth || boundClient?.dob || null,
      roiExpiresAt: boundClient?.roi_expires_at || null
    },
    school: {
      id: schoolOrganizationId,
      name: String(organization?.name || boundClient?.organization_name || '').trim() || null,
      address: buildSchoolAddress(organization),
      contact: buildSchoolContact(organization),
      relationshipToParty: 'student'
    },
    agency: {
      id: Number(agency?.id || 0) || null,
      name: String(agency?.name || '').trim() || null
    },
    authorizedRepresentative: { ...AUTHORIZED_REPRESENTATIVE },
    purposes: PURPOSES,
    guidelines: GUIDELINES,
    requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS,
    waiverItems: WAIVER_ITEMS,
    documentTemplate: template ? {
      id: Number(template.id),
      name: template.name || 'School ROI',
      documentType: template.document_type || null
    } : null,
    staffRoster: (staffRoster || []).map((staff) => ({
      schoolStaffUserId: Number(staff.school_staff_user_id),
      firstName: staff.first_name || null,
      lastName: staff.last_name || null,
      fullName: [staff.first_name, staff.last_name].filter(Boolean).join(' ').trim() || staff.email || `User ${staff.school_staff_user_id}`,
      email: staff.email || null,
      phone: staff.phone_number || null,
      role: String(staff.role_key || 'school_staff').replace(/_/g, ' ')
    }))
  };
}

export function normalizeSmartSchoolRoiResponse({ roiContext = {}, intakeData = {}, signedAt = new Date() }) {
  const roi = intakeData?.smartSchoolRoi || {};
  const signer = roi?.signer || intakeData?.guardian || {};
  const requiredAcknowledgements = normalizeAcknowledgements(
    roiContext?.requiredAcknowledgements || REQUIRED_ACKNOWLEDGEMENTS,
    roi?.requiredAcknowledgements || {}
  );
  const waiverItems = normalizeWaiverItems(
    roiContext?.waiverItems || WAIVER_ITEMS,
    roi?.waiverItems || {}
  );
  const staffDecisions = normalizeStaffDecisions(roiContext?.staffRoster || [], roi);
  const schoolSchedulingSafetyLogisticsAuthorized =
    waiverItems.find((item) => item.id === 'school_scheduling_safety_logistics')?.decision === 'accept';
  const approvedStaffCount = staffDecisions.filter((staff) => staff.allowed).length;
  const deniedStaffCount = staffDecisions.filter((staff) => staff.allowed === false).length;
  return {
    signedAt: formatDateTime(signedAt),
    clientFullName: String(
      roi?.clientFullName
      || intakeData?.clients?.[0]?.fullName
      || roiContext?.client?.fullName
      || ''
    ).trim() || null,
    clientDateOfBirth: roi?.clientDateOfBirth || roiContext?.client?.dateOfBirth || null,
    signer: {
      firstName: String(signer?.firstName || '').trim() || null,
      lastName: String(signer?.lastName || '').trim() || null,
      fullName: `${String(signer?.firstName || '').trim()} ${String(signer?.lastName || '').trim()}`.trim() || null,
      relationship: String(signer?.relationship || '').trim() || null,
      email: String(signer?.email || '').trim() || null,
      phone: String(signer?.phone || '').trim() || null
    },
    packetReleaseAllowed: normalizeBool(roi?.packetReleaseAllowed),
    requiredAcknowledgements,
    waiverItems,
    staffDecisions,
    schoolSchedulingSafetyLogisticsAuthorized,
    approvedStaffCount,
    deniedStaffCount
  };
}

export function validateSmartSchoolRoiResponse(response) {
  const missing = [];
  if (!response?.signer?.firstName) missing.push('Signer first name');
  if (!response?.signer?.lastName) missing.push('Signer last name');
  if (!response?.signer?.email) missing.push('Signer email');
  if (!response?.signer?.relationship) missing.push('Signer relationship');
  if (!response?.clientFullName) missing.push('Client full name');
  if (!response?.clientDateOfBirth) missing.push('Client date of birth');

  for (const ack of response?.requiredAcknowledgements || []) {
    if (ack.accepted !== true) {
      missing.push(`Required acknowledgement: ${ack.title}`);
    }
  }

  for (const item of response?.waiverItems || []) {
    if (item.decision === 'undecided') {
      missing.push(`Waiver decision: ${item.title}`);
    }
    if (item.requiredAccept && item.decision !== 'accept') {
      missing.push(`Required authorization: ${item.title}`);
    }
  }

  for (const staff of response?.staffDecisions || []) {
    if (typeof staff.allowed !== 'boolean') {
      missing.push(`Staff decision: ${staff.fullName}`);
    }
  }

  if (typeof response?.packetReleaseAllowed !== 'boolean') {
    missing.push('Packet and document release choice');
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

export async function applySmartSchoolRoiAccessDecisions({
  clientId,
  schoolOrganizationId,
  response,
  actorUserId = null
}) {
  const normalizedClientId = Number(clientId || 0);
  const normalizedSchoolId = Number(schoolOrganizationId || 0);
  if (!normalizedClientId || !normalizedSchoolId) {
    throw new Error('clientId and schoolOrganizationId are required');
  }

  const results = [];
  for (const staff of response?.staffDecisions || []) {
    const staffId = Number(staff?.schoolStaffUserId || 0);
    if (!staffId) continue;
    const nextState = staff.allowed
      ? (response.packetReleaseAllowed ? 'roi_docs' : 'roi')
      : 'none';
    await ClientSchoolStaffRoiAccess.setAccessState({
      clientId: normalizedClientId,
      schoolOrganizationId: normalizedSchoolId,
      schoolStaffUserId: staffId,
      nextState,
      actorUserId
    });
    results.push({
      schoolStaffUserId: staffId,
      nextState
    });
  }
  return results;
}

export function buildSmartSchoolRoiHtml({ roiContext = {}, response = {}, signedAt = new Date() }) {
  const approvedStaff = (response.staffDecisions || []).filter((staff) => staff.allowed);
  const deniedStaff = (response.staffDecisions || []).filter((staff) => !staff.allowed);
  const packetReleaseText = response.packetReleaseAllowed
    ? 'Approved for packet/document visibility for all approved staff.'
    : 'Not approved for packet/document visibility. Approved staff receive ROI access only.';
  const schoolSchedulingSafetyText = response.schoolSchedulingSafetyLogisticsAuthorized
    ? 'Authorized. Limited school-level scheduling/logistics visibility is permitted for operations and student safety.'
    : 'Not authorized.';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(roiContext?.documentTemplate?.name || 'School Release of Information')}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; margin: 40px; line-height: 1.5; }
      h1, h2, h3 { color: #0f172a; margin-bottom: 8px; }
      h1 { font-size: 24px; }
      h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
      p { margin: 8px 0; }
      ul { margin: 10px 0 10px 20px; }
      li { margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
      .muted { color: #4b5563; }
      .section-note { background: #f8fafc; border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(roiContext?.documentTemplate?.name || 'School Release of Information')}</h1>
    <p class="muted">Generated ${escapeHtml(formatDate(signedAt))}</p>

    <div class="section-note">
      <p><strong>Client:</strong> ${escapeHtml(response.clientFullName || '—')}</p>
      <p><strong>Date of Birth:</strong> ${escapeHtml(response.clientDateOfBirth || '—')}</p>
      <p><strong>Responsible Party:</strong> ${escapeHtml(response.signer?.fullName || '—')}</p>
      <p><strong>Relationship:</strong> ${escapeHtml(response.signer?.relationship || '—')}</p>
      <p><strong>School:</strong> ${escapeHtml(roiContext?.school?.name || '—')}</p>
      <p><strong>School Address:</strong> ${escapeHtml(roiContext?.school?.address || '—')}</p>
      <p><strong>Relationship to party:</strong> ${escapeHtml(roiContext?.school?.relationshipToParty || 'student')}</p>
      <p><strong>School Contact:</strong>
        ${escapeHtml(roiContext?.school?.contact?.name || '—')}
        ${roiContext?.school?.contact?.email ? ` · ${escapeHtml(roiContext.school.contact.email)}` : ''}
        ${roiContext?.school?.contact?.phone ? ` · ${escapeHtml(roiContext.school.contact.phone)}` : ''}
      </p>
    </div>

    <h2>Authorization</h2>
    <p>I authorize ${escapeHtml(AUTHORIZED_REPRESENTATIVE.organizationName)} to speak with the approved third-party school staff listed in this release.</p>

    <h2>Purpose of Release</h2>
    <ul>
      ${(roiContext?.purposes || PURPOSES).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>

    <h2>Guidelines</h2>
    <ul>
      ${(roiContext?.guidelines || GUIDELINES).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>

    <h2>Required Acknowledgements</h2>
    <table>
      <thead>
        <tr>
          <th>Acknowledgement</th>
          <th>Accepted</th>
        </tr>
      </thead>
      <tbody>
        ${(response.requiredAcknowledgements || []).map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.body)}</td>
            <td>${item.accepted ? 'Accepted' : 'Declined'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Waiver Decisions</h2>
    <table>
      <thead>
        <tr>
          <th>Topic</th>
          <th>Decision</th>
        </tr>
      </thead>
      <tbody>
        ${(response.waiverItems || []).map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.body)}</td>
            <td>${escapeHtml(item.decision)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Packet and Document Release</h2>
    <p>${escapeHtml(packetReleaseText)}</p>

    <h2>School-Level vs Individual Disclosure</h2>
    <p><strong>School-level scheduling/safety logistics:</strong> ${escapeHtml(schoolSchedulingSafetyText)}</p>
    <p><strong>Individual staff disclosure:</strong> Only staff explicitly approved in this ROI may receive individual ROI-based disclosure access. Staff not approved receive no individual ROI or packet access.</p>

    <h2>Term, Revocation, and Required Notices</h2>
    <ul>
      <li>This authorization is valid for 12 months from the signature date unless revoked earlier.</li>
      <li>Revocation may be requested at any time by contacting support@itsco.health or 833-444-8726 extension 0.</li>
      <li>Any actions already taken before revocation cannot be undone.</li>
      <li>Information disclosed may be subject to redistribution by the receiving party and may no longer be protected in the same way.</li>
      <li>Session content is not shared unless clinically necessary for safety concerns involving imminent risk.</li>
    </ul>

    <h2>Approved School Staff</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Decision</th>
        </tr>
      </thead>
      <tbody>
        ${(response.staffDecisions || []).map((staff) => `
          <tr>
            <td>${escapeHtml(staff.fullName || '—')}</td>
            <td>${escapeHtml(staff.role || 'School staff')}</td>
            <td>${escapeHtml(staff.phone || '—')}</td>
            <td>${escapeHtml(staff.email || '—')}</td>
            <td>${staff.allowed ? 'Approved' : 'Denied'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Termination of Consent</h2>
    <p>This authorization is valid for 12 months from the date it is signed unless revoked earlier.</p>

    <h2>Additional Notice</h2>
    <p>Information shared by ${escapeHtml(AUTHORIZED_REPRESENTATIVE.organizationName)} may be subject to redistribution by the person or entity receiving it and may no longer be protected. The receiving parties listed in this document are expected to protect confidentiality under applicable law.</p>
    <p>To revoke this authorization, contact ${escapeHtml(AUTHORIZED_REPRESENTATIVE.supportEmail)} or ${escapeHtml(AUTHORIZED_REPRESENTATIVE.supportPhone)}.</p>

    <h2>Authorized Representative</h2>
    <p>This document was generated by ${escapeHtml(AUTHORIZED_REPRESENTATIVE.name)} on behalf of ${escapeHtml(AUTHORIZED_REPRESENTATIVE.organizationName)}.</p>
    <p>Email: ${escapeHtml(AUTHORIZED_REPRESENTATIVE.email)}</p>
    <p>Address: ${escapeHtml(AUTHORIZED_REPRESENTATIVE.mailingAddress)}</p>

    <h2>Summary</h2>
    <p><strong>Approved staff count:</strong> ${approvedStaff.length}</p>
    <p><strong>Denied staff count:</strong> ${deniedStaff.length}</p>
    <p><strong>School-level scheduling/safety logistics authorization:</strong> ${response.schoolSchedulingSafetyLogisticsAuthorized ? 'Authorized' : 'Not authorized'}</p>
  </body>
</html>`;
}

export default {
  AUTHORIZED_REPRESENTATIVE,
  PURPOSES,
  GUIDELINES,
  REQUIRED_ACKNOWLEDGEMENTS,
  WAIVER_ITEMS,
  isSmartSchoolRoiForm,
  buildSmartSchoolRoiContext,
  normalizeSmartSchoolRoiResponse,
  validateSmartSchoolRoiResponse,
  applySmartSchoolRoiAccessDecisions,
  buildSmartSchoolRoiHtml
};
