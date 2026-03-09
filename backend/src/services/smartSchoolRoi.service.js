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
    id: 'hipaa_serious_imminent_threat_disclosure',
    title: 'Required HIPAA safety-threat disclosure standard',
    body: 'I understand and acknowledge this is not optional: when ITSCO has a good-faith belief that disclosure is necessary to prevent or lessen a serious and imminent threat to the health or safety of the client or others, ITSCO may disclose relevant PHI (including psychotherapy notes when permitted) to persons reasonably able to prevent or lessen the threat, such as school administrators, school safety personnel, law enforcement, a parent/legal guardian, family members, or another potential target. This is made consistent with applicable law and ethical standards, including 45 CFR 164.512(j)(1)(i) and 45 CFR 164.512(j)(4).',
    requiredAccept: true
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
  }
];

const PURPOSES_ES = [
  'Autorizar a ITSCO y a los proveedores/personal asignado para comunicarse con la escuela seleccionada y el personal escolar aprobado para apoyar al cliente en el entorno escolar.',
  'Preocupaciones de seguridad y evaluaciones de riesgo o ideacion realizadas durante las sesiones.',
  'Coordinar la administracion de servicios psicologicos en la propiedad de terceros.',
  'Hablar sobre objetivos de tratamiento y planes de tratamiento asociados.'
];

const GUIDELINES_ES = [
  'La informacion sobre el contenido de las sesiones no se compartira con el personal listado, a menos que el terapeuta lo considere clinicamente necesario por razones de seguridad como riesgo inminente para el clinico, el cliente u otras personas, incluida lesion fisica.',
  'La confidencialidad se mantendra excepto por lo antes mencionado.',
  'Toda correspondencia relacionada con mi dependiente sera documentada en el expediente clinico.',
  'ITSCO cumplira con todas las leyes y regulaciones aplicables relacionadas con el manejo de informacion confidencial.'
];

const REQUIRED_ACKNOWLEDGEMENTS_ES = [
  {
    id: 'esign_consent',
    title: 'Consentimiento electronico',
    body: 'Acepto revisar, recibir y firmar esta autorizacion electronicamente a traves de la plataforma en linea segura de ITSCO utilizada para coordinacion de atencion y programacion.'
  },
  {
    id: 'hipaa_privacy',
    title: 'Aviso de aplicacion, privacidad e HIPAA',
    body: 'Entiendo que ITSCO usa esta aplicacion para programacion y comunicacion de apoyo a la atencion. Solo el personal escolar aprobado tendra acceso al expediente breve del cliente relacionado con ROI para fines de comunicacion y programacion. ITSCO limita las divulgaciones a necesidades autorizadas, protege la informacion y mantiene registros auditables de acceso/divulgacion. Entiendo que las respuestas en progreso pueden guardarse en este navegador hasta por una hora para evitar perdida accidental de datos, y debo continuar solo en un dispositivo o sesion de navegador segura/privada al ingresar informacion de salud protegida.'
  },
  {
    id: 'redisclosure_risk',
    title: 'Riesgo de redistribucion',
    body: 'Entiendo que la informacion compartida por ITSCO puede estar sujeta a redistribucion por la parte receptora y puede dejar de estar protegida de la misma manera una vez divulgada.'
  },
  {
    id: 'revocation_right',
    title: 'Derecho de revocacion',
    body: 'Entiendo que puedo revocar esta autorizacion en cualquier momento, pero las acciones ya realizadas con base en esta autorizacion no pueden revertirse.'
  },
  {
    id: 'voluntary_authorization',
    title: 'Autorizacion voluntaria',
    body: 'Entiendo las posibles consecuencias de esta divulgacion y la estoy autorizando voluntariamente.'
  }
];

const WAIVER_ITEMS_ES = [
  {
    id: 'communication_and_care_planning',
    title: 'Comunicacion escolar y planificacion de atencion',
    body: 'Autorizo a ITSCO y a los proveedores/personal asignado a comunicarse con el personal escolar aprobado para la coordinacion de atencion en la escuela y apoyo de las necesidades identificadas del cliente.'
  },
  {
    id: 'hipaa_serious_imminent_threat_disclosure',
    title: 'Estandar requerido de divulgacion por amenaza grave e inminente (HIPAA)',
    body: 'Entiendo y reconozco que esto no es opcional: cuando ITSCO tenga una creencia de buena fe de que la divulgacion es necesaria para prevenir o reducir una amenaza grave e inminente a la salud o seguridad del cliente u otros, ITSCO puede divulgar PHI relevante (incluidas notas de psicoterapia cuando sea permitido) a personas razonablemente capaces de prevenir o reducir la amenaza, como administradores escolares, personal de seguridad escolar, autoridades, padre/madre/tutor legal, familiares u otro posible objetivo. Esto se realiza conforme a la ley aplicable y estandares eticos, incluyendo 45 CFR 164.512(j)(1)(i) y 45 CFR 164.512(j)(4).',
    requiredAccept: true
  },
  {
    id: 'services_on_school_property',
    title: 'Servicios en propiedad escolar',
    body: 'Autorizo la coordinacion relacionada con servicios psicologicos brindados en propiedad escolar, y entiendo que el entorno escolar no ofrece las mismas protecciones de privacidad que un consultorio clinico privado.',
    requiredAccept: true
  },
  {
    id: 'school_scheduling_safety_logistics',
    title: 'Programacion escolar y logistica de seguridad',
    body: 'Autorizo visibilidad limitada de programacion/logistica para operaciones escolares y seguridad estudiantil cuando sea necesario (por ejemplo, horario de salida de clase, transiciones de ubicacion y coordinacion de recogida). Entiendo que esta visibilidad limitada puede implicar que personal escolar no listado en este ROI reciba solo detalles operativos de tiempo, no contenido clinico amplio.',
    requiredAccept: true
  },
  {
    id: 'treatment_goals',
    title: 'Objetivos y planes de tratamiento',
    body: 'Autorizo una discusion breve de objetivos/metas de tratamiento solo cuando sea necesario para coordinacion de atencion con personal escolar aprobado; no se divulgan detalles del contenido de sesiones fuera de este proposito de atencion.'
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

function resolveAbsoluteAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(
    process.env.BACKEND_PUBLIC_URL
    || process.env.FRONTEND_URL
    || process.env.CORS_ORIGIN
    || ''
  ).replace(/\/$/, '');
  if (!base) return '';
  if (raw.startsWith('/')) return `${base}${raw}`;
  if (raw.startsWith('uploads/')) return `${base}/${raw}`;
  return `${base}/uploads/${raw}`;
}

function resolveClientFullName(client = {}) {
  const direct = String(client?.full_name || client?.fullName || '').trim();
  if (direct) return direct;
  const combined = [
    String(client?.first_name || client?.firstName || '').trim(),
    String(client?.last_name || client?.lastName || '').trim()
  ].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  const initials = String(client?.initials || '').trim();
  return initials || null;
}

function resolveClientDob(client = {}) {
  return client?.date_of_birth
    || client?.dob
    || client?.birthdate
    || client?.birth_date
    || null;
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

function normalizeExternalRecipient(entry = {}) {
  return {
    name: String(entry?.name || '').trim() || null,
    relationship: String(entry?.relationship || '').trim() || null,
    email: String(entry?.email || '').trim() || null,
    phone: String(entry?.phone || '').trim() || null,
    allowed: entry?.allowed === null || entry?.allowed === undefined
      ? null
      : normalizeBool(entry?.allowed)
  };
}

function normalizeExternalReleaseMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'sender_programmed') return 'sender_programmed';
  if (mode === 'parent_defined') return 'parent_defined';
  return 'school_staff_only';
}

function normalizeLanguageCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('es') ? 'es' : 'en';
}

function getLocalizedSmartRoiBundle(languageCode) {
  const locale = normalizeLanguageCode(languageCode);
  if (locale === 'es') {
    return {
      locale,
      purposes: PURPOSES_ES,
      guidelines: GUIDELINES_ES,
      requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS_ES,
      waiverItems: WAIVER_ITEMS_ES
    };
  }
  return {
    locale: 'en',
    purposes: PURPOSES,
    guidelines: GUIDELINES,
    requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS,
    waiverItems: WAIVER_ITEMS
  };
}

export function isSmartSchoolRoiForm(link) {
  return String(link?.form_type || '').trim().toLowerCase() === 'smart_school_roi';
}

export async function buildSmartSchoolRoiContext({
  link,
  boundClient,
  organization,
  agency,
  templates = [],
  issuedConfig = null
}) {
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
  const cfg = issuedConfig && typeof issuedConfig === 'object' ? issuedConfig : {};
  const preferredLanguageCode = normalizeLanguageCode(
    cfg?.preferredLanguageCode || template?.language_code || link?.language_code || 'en'
  );
  const localizedBundle = getLocalizedSmartRoiBundle(preferredLanguageCode);
  const externalReleaseMode = normalizeExternalReleaseMode(cfg?.externalReleaseMode);
  const programmedExternalRecipient = externalReleaseMode === 'sender_programmed'
    ? normalizeExternalRecipient(cfg?.programmedExternalRecipient || {})
    : null;

  return {
    locale: localizedBundle.locale,
    client: {
      id: Number(boundClient?.id || 0) || null,
      fullName: resolveClientFullName(boundClient),
      initials: String(boundClient?.initials || '').trim() || null,
      dateOfBirth: resolveClientDob(boundClient),
      roiExpiresAt: boundClient?.roi_expires_at || null
    },
    school: {
      id: schoolOrganizationId,
      name: String(organization?.name || boundClient?.organization_name || '').trim() || null,
      logoUrl: resolveAbsoluteAssetUrl(
        organization?.school_profile?.logo_path
        || organization?.logo_path
        || organization?.logo_url
        || ''
      ) || null,
      address: buildSchoolAddress(organization),
      contact: buildSchoolContact(organization),
      relationshipToParty: 'student'
    },
    agency: {
      id: Number(agency?.id || 0) || null,
      name: String(agency?.name || '').trim() || null,
      logoUrl: resolveAbsoluteAssetUrl(agency?.logo_path || agency?.logo_url || '') || null
    },
    authorizedRepresentative: { ...AUTHORIZED_REPRESENTATIVE },
    guidelines: localizedBundle.guidelines,
    requiredAcknowledgements: localizedBundle.requiredAcknowledgements,
    waiverItems: localizedBundle.waiverItems,
    purposes: localizedBundle.purposes,
    documentTemplate: template ? {
      id: Number(template.id),
      name: template.name || 'School ROI',
      documentType: template.document_type || null,
      languageCode: preferredLanguageCode
    } : null,
    staffRoster: (staffRoster || []).map((staff) => ({
      schoolStaffUserId: Number(staff.school_staff_user_id),
      firstName: staff.first_name || null,
      lastName: staff.last_name || null,
      fullName: [staff.first_name, staff.last_name].filter(Boolean).join(' ').trim() || staff.email || `User ${staff.school_staff_user_id}`,
      email: staff.email || null,
      phone: staff.phone_number || null,
      role: String(staff.role_key || 'school_staff').replace(/_/g, ' ')
    })),
    externalRelease: {
      mode: externalReleaseMode,
      programmedRecipient: programmedExternalRecipient
    }
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
  const hipaaSafetyThreatDisclosureAcknowledged =
    waiverItems.find((item) => item.id === 'hipaa_serious_imminent_threat_disclosure')?.decision === 'accept'
    || waiverItems.find((item) => item.id === 'safety_concerns')?.decision === 'accept'
    || waiverItems.find((item) => item.id === 'session_content_limitation')?.decision === 'accept';
  const approvedStaffCount = staffDecisions.filter((staff) => staff.allowed).length;
  const deniedStaffCount = staffDecisions.filter((staff) => staff.allowed === false).length;
  const externalReleaseMode = normalizeExternalReleaseMode(
    roi?.externalReleaseMode
    || roiContext?.externalRelease?.mode
    || 'school_staff_only'
  );
  const externalRecipients = (() => {
    if (externalReleaseMode === 'sender_programmed') {
      const programmed = normalizeExternalRecipient(
        roiContext?.externalRelease?.programmedRecipient
        || roi?.programmedExternalRecipient
        || {}
      );
      return [{
        ...programmed,
        allowed: roi?.programmedExternalRecipient?.allowed === null || roi?.programmedExternalRecipient?.allowed === undefined
          ? programmed.allowed
          : normalizeBool(roi?.programmedExternalRecipient?.allowed)
      }];
    }
    if (externalReleaseMode === 'parent_defined') {
      const rows = Array.isArray(roi?.externalRecipients) ? roi.externalRecipients : [];
      return rows.map((entry) => normalizeExternalRecipient(entry));
    }
    return [];
  })();
  return {
    locale: normalizeLanguageCode(roiContext?.locale || roiContext?.documentTemplate?.languageCode || 'en'),
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
    hipaaSafetyThreatDisclosureAcknowledged,
    approvedStaffCount,
    deniedStaffCount,
    externalReleaseMode,
    externalRecipients
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

  const externalMode = normalizeExternalReleaseMode(response?.externalReleaseMode);
  if (externalMode === 'sender_programmed') {
    const row = Array.isArray(response?.externalRecipients) ? response.externalRecipients[0] : null;
    if (!row?.name) missing.push('Programmed external recipient name');
    if (!row?.relationship) missing.push('Programmed external recipient relationship');
    if (typeof row?.allowed !== 'boolean') missing.push('Programmed external recipient decision');
  }
  if (externalMode === 'parent_defined') {
    const rows = Array.isArray(response?.externalRecipients) ? response.externalRecipients : [];
    if (!rows.length) {
      missing.push('At least one external release recipient');
    }
    for (const [idx, row] of rows.entries()) {
      const label = row?.name || `Recipient ${idx + 1}`;
      if (!row?.name) missing.push(`External recipient name (${label})`);
      if (!row?.relationship) missing.push(`External recipient relationship (${label})`);
      if (typeof row?.allowed !== 'boolean') missing.push(`External recipient decision (${label})`);
    }
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
  const locale = normalizeLanguageCode(
    roiContext?.locale
    || roiContext?.documentTemplate?.languageCode
    || response?.locale
    || 'en'
  );
  const isSpanish = locale === 'es';
  const labels = isSpanish
    ? {
        approved: 'Aprobado',
        denied: 'Denegado',
        notAcknowledged: 'No reconocido',
        acknowledgedRequired: 'Reconocido (requerido)',
        roiOnly: 'Solo ROI',
        packetApproved: 'Aprobado',
        noStaffApproved: 'Ningun miembro del personal individual aprobado',
        none: 'Ninguno',
        titleFallback: 'Autorizacion Escolar de Divulgacion de Informacion',
        signedWindow: 'Firmado',
        signedWindowSuffix: '- periodo de autorizacion de 36 meses',
        sectionClientInfo: 'Informacion del Cliente',
        sectionReleaseScope: 'Alcance de la Divulgacion',
        sectionQuestionResponses: 'Respuestas por Pregunta',
        sectionRequiredNotices: 'Avisos Requeridos',
        sectionExternalRecipients: 'Destinatarios Externos',
        sectionStaffDecisions: 'Decisiones de Personal Escolar',
        qAcknowledgement: 'Reconocimiento requerido',
        qWaiver: 'Autorizacion',
        client: 'Cliente',
        dateOfBirth: 'Fecha de nacimiento',
        responsibleParty: 'Parte responsable',
        relationship: 'Relacion',
        school: 'Escuela',
        schoolContact: 'Contacto escolar',
        approvedStaff: 'Personal escolar aprobado',
        deniedStaff: 'Personal escolar denegado',
        packetVisibility: 'Visibilidad de paquete/documentos',
        hipaaThreat: 'Divulgacion HIPAA por amenaza grave/inminente',
        externalRecipientsApproved: 'Destinatarios externos aprobados',
        authorizationMayBeRevoked: 'La autorizacion puede revocarse en cualquier momento a traves de',
        actionsAlreadyTaken: 'Las acciones ya tomadas antes de la revocacion no se pueden revertir.',
        redisclosureMayOccur: 'La informacion divulgada puede estar sujeta a redistribucion por el destinatario.',
        sessionContentShared: 'El contenido de sesiones se comparte solo cuando es clinicamente necesario por seguridad/riesgo inminente.',
        signature: 'Firma',
        date: 'Fecha',
        recipient: 'Destinatario',
        decision: 'Decision'
      }
    : {
        approved: 'Approved',
        denied: 'Denied',
        notAcknowledged: 'Not acknowledged',
        acknowledgedRequired: 'Acknowledged (required)',
        roiOnly: 'ROI only',
        packetApproved: 'Approved',
        noStaffApproved: 'No individual staff approved',
        none: 'None',
        titleFallback: 'School Release of Information',
        signedWindow: 'Signed',
        signedWindowSuffix: '- 36-month authorization window',
        sectionClientInfo: 'Client Information',
        sectionReleaseScope: 'Release Scope',
        sectionQuestionResponses: 'Question-by-Question Responses',
        sectionRequiredNotices: 'Required Notices',
        sectionExternalRecipients: 'External Recipients',
        sectionStaffDecisions: 'School Staff Decisions',
        qAcknowledgement: 'Required acknowledgement',
        qWaiver: 'Authorization',
        client: 'Client',
        dateOfBirth: 'Date of Birth',
        responsibleParty: 'Responsible Party',
        relationship: 'Relationship',
        school: 'School',
        schoolContact: 'School Contact',
        approvedStaff: 'Approved school staff',
        deniedStaff: 'Denied school staff',
        packetVisibility: 'Packet/document visibility',
        hipaaThreat: 'HIPAA serious/imminent threat disclosure',
        externalRecipientsApproved: 'External recipients approved',
        authorizationMayBeRevoked: 'Authorization may be revoked at any time through',
        actionsAlreadyTaken: 'Actions already taken before revocation cannot be reversed.',
        redisclosureMayOccur: 'Information disclosed may be subject to redisclosure by the recipient.',
        sessionContentShared: 'Session content is shared only when clinically necessary for safety/imminent risk.',
        signature: 'Signature',
        date: 'Date',
        recipient: 'Recipient',
        decision: 'Decision'
      };
  const safetyThreatDisclosureText = response.hipaaSafetyThreatDisclosureAcknowledged
    ? labels.acknowledgedRequired
    : labels.notAcknowledged;
  const approvedStaff = (response.staffDecisions || []).filter((staff) => staff.allowed);
  const deniedStaff = (response.staffDecisions || []).filter((staff) => !staff.allowed);
  const approvedStaffNames = approvedStaff.map((s) => s.fullName).filter(Boolean);
  const deniedStaffNames = deniedStaff.map((s) => s.fullName).filter(Boolean);
  const approvedPreview = approvedStaffNames.slice(0, 12);
  const approvedOverflow = Math.max(0, approvedStaffNames.length - approvedPreview.length);
  const approvedStaffText = approvedPreview.length
    ? `${approvedPreview.join(', ')}${approvedOverflow > 0 ? ` (+${approvedOverflow} more)` : ''}`
    : labels.noStaffApproved;
  const deniedStaffText = deniedStaffNames.length
    ? deniedStaffNames.slice(0, 12).join(', ')
    : labels.none;
  const externalApproved = (response.externalRecipients || []).filter((r) => r?.allowed === true);
  const externalApprovedText = externalApproved.length
    ? externalApproved.map((r) => `${r.name || 'Recipient'} (${r.relationship || 'relationship not set'})`).slice(0, 6).join(', ')
    : labels.none;
  const docTitle = roiContext?.school?.name
    ? `${roiContext.school.name} - ${labels.titleFallback}`
    : (roiContext?.documentTemplate?.name || labels.titleFallback);
  const acknowledgementsHtml = (response.requiredAcknowledgements || [])
    .map((item) => `<li><span class="k">${escapeHtml(labels.qAcknowledgement)}:</span> ${escapeHtml(item.title || item.id || '')} - ${item.accepted ? labels.approved : labels.denied}</li>`)
    .join('');
  const waiversHtml = (response.waiverItems || [])
    .map((item) => `<li><span class="k">${escapeHtml(labels.qWaiver)}:</span> ${escapeHtml(item.title || item.id || '')} - ${item.decision === 'accept' ? labels.approved : labels.denied}</li>`)
    .join('');
  const staffDecisionsHtml = (response.staffDecisions || [])
    .map((item) => `<li>${escapeHtml(item.fullName || `User ${item.schoolStaffUserId || ''}`)} - ${item.allowed ? labels.approved : labels.denied}</li>`)
    .join('');
  const externalRowsHtml = (response.externalRecipients || [])
    .map((item) => {
      const rowLabel = item?.name || labels.recipient;
      return `<li>${escapeHtml(rowLabel)}${item?.relationship ? ` (${escapeHtml(item.relationship)})` : ''} - ${item?.allowed ? labels.approved : labels.denied}</li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(docTitle)}</title>
    <style>
      @page { size: Letter; margin: 0.45in; }
      body { font-family: Arial, sans-serif; color: #111827; margin: 0; line-height: 1.25; font-size: 10.5px; }
      .wrap { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px; page-break-inside: avoid; }
      .header { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
      .logo { max-height: 44px; max-width: 140px; object-fit: contain; }
      h1 { margin: 0; font-size: 15px; color: #0f172a; }
      .muted { color: #4b5563; font-size: 9.5px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-top: 8px; }
      .k { font-weight: 700; color: #1f2937; }
      .section { margin-top: 8px; padding-top: 6px; border-top: 1px solid #e5e7eb; }
      .section h2 { margin: 0 0 4px; font-size: 11px; color: #0f172a; }
      p { margin: 2px 0; }
      ul { margin: 3px 0 0 14px; padding: 0; }
      li { margin: 1px 0; }
      .sig { margin-top: 10px; display: grid; grid-template-columns: 1fr 150px; gap: 12px; align-items: end; }
      .line { border-top: 1px solid #111827; height: 1px; margin-top: 15px; }
      .nowrap { white-space: nowrap; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div>
          <h1>${escapeHtml(docTitle)}</h1>
          <div class="muted">${escapeHtml(labels.signedWindow)} ${escapeHtml(formatDate(signedAt))} ${escapeHtml(labels.signedWindowSuffix)}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${roiContext?.school?.logoUrl ? `<img class="logo" src="${escapeHtml(roiContext.school.logoUrl)}" alt="School logo" />` : ''}
          ${roiContext?.agency?.logoUrl ? `<img class="logo" src="${escapeHtml(roiContext.agency.logoUrl)}" alt="Agency logo" />` : ''}
        </div>
      </div>

      <div class="section">
        <h2>${escapeHtml(labels.sectionClientInfo)}</h2>
        <p><span class="k">${escapeHtml(labels.client)}:</span> ${escapeHtml(response.clientFullName || '---')}</p>
        <p><span class="k">${escapeHtml(labels.dateOfBirth)}:</span> ${escapeHtml(response.clientDateOfBirth || '---')}</p>
        <p><span class="k">${escapeHtml(labels.responsibleParty)}:</span> ${escapeHtml(response.signer?.fullName || '---')}</p>
        <p><span class="k">${escapeHtml(labels.relationship)}:</span> ${escapeHtml(response.signer?.relationship || '---')}</p>
        <p><span class="k">${escapeHtml(labels.school)}:</span> ${escapeHtml(roiContext?.school?.name || '---')}</p>
        <p><span class="k">${escapeHtml(labels.schoolContact)}:</span> ${escapeHtml([roiContext?.school?.contact?.name, roiContext?.school?.contact?.email, roiContext?.school?.contact?.phone].filter(Boolean).join(' - ') || '---')}</p>
      </div>

      <div class="section">
        <h2>${escapeHtml(labels.sectionReleaseScope)}</h2>
        <p><span class="k">${escapeHtml(labels.approvedStaff)}:</span> ${escapeHtml(approvedStaffText)}</p>
        <p><span class="k">${escapeHtml(labels.deniedStaff)}:</span> ${escapeHtml(deniedStaffText)} (${escapeHtml(String(deniedStaff.length))})</p>
        <p><span class="k">${escapeHtml(labels.packetVisibility)}:</span> ${response.packetReleaseAllowed ? labels.packetApproved : labels.roiOnly}</p>
        <p><span class="k">${escapeHtml(labels.hipaaThreat)}:</span> ${escapeHtml(safetyThreatDisclosureText)}</p>
        <p><span class="k">${escapeHtml(labels.externalRecipientsApproved)}:</span> ${escapeHtml(externalApprovedText)}</p>
      </div>

      <div class="section">
        <h2>${escapeHtml(labels.sectionQuestionResponses)}</h2>
        <ul>
          ${acknowledgementsHtml || `<li>${escapeHtml(labels.none)}</li>`}
          ${waiversHtml || ''}
        </ul>
      </div>

      <div class="section">
        <h2>${escapeHtml(labels.sectionStaffDecisions)}</h2>
        <ul>
          ${staffDecisionsHtml || `<li>${escapeHtml(labels.none)}</li>`}
        </ul>
      </div>

      <div class="section">
        <h2>${escapeHtml(labels.sectionExternalRecipients)}</h2>
        <ul>
          ${externalRowsHtml || `<li>${escapeHtml(labels.none)}</li>`}
        </ul>
      </div>

      <div class="section">
        <h2>${escapeHtml(labels.sectionRequiredNotices)}</h2>
        <ul>
          <li>${escapeHtml(labels.authorizationMayBeRevoked)} ${escapeHtml(AUTHORIZED_REPRESENTATIVE.supportEmail)} ${isSpanish ? 'o' : 'or'} ${escapeHtml(AUTHORIZED_REPRESENTATIVE.supportPhone)}.</li>
          <li>${escapeHtml(labels.actionsAlreadyTaken)}</li>
          <li>${escapeHtml(labels.redisclosureMayOccur)}</li>
          <li>${escapeHtml(labels.sessionContentShared)}</li>
        </ul>
      </div>

      <div class="section sig">
        <div>
          <div class="line"></div>
          <div class="muted">${escapeHtml(labels.signature)}</div>
        </div>
        <div>
          <div class="line"></div>
          <div class="muted nowrap">${escapeHtml(labels.date)}</div>
        </div>
      </div>
    </div>
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
