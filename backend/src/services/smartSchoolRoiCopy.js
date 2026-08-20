/**
 * Localized Smart School ROI question copy (acknowledgements, waivers, purposes).
 * Kept out of smartSchoolRoi.service.js so chart text helpers can hydrate
 * compact stored answers without loading the database pool.
 */

export const AUTHORIZED_REPRESENTATIVE = {
  name: 'Michael Mendez, LPC',
  email: 'michael@itsco.health',
  organizationName: 'ITSCO',
  mailingAddress: '5373 N. Union Blvd. Suite 104. Colorado Springs, CO 80918',
  supportEmail: 'support@itsco.health',
  supportPhone: '719-657-7444 Ext 0'
};

export const PURPOSES = [
  'Release ITSCO and any assigned providers and staff to communicate with the selected school and approved school staff to support school-based care coordination.',
  'Safety concerns and evaluations of harm or ideation performed in sessions.',
  'Coordinating the administration of psychological services on the third party’s property.',
  'Discussing treatment goals and associated treatment plans.'
];

export const GUIDELINES = [
  'Information regarding the content of sessions will not be shared with the staff listed unless deemed clinically necessary by the therapist for safety reasons such as imminent risk to the clinician, the client, or others including physical harm.',
  'Confidentiality will be maintained except for the aforementioned.',
  'All correspondence concerning my dependent will be documented in the clinical record.',
  'ITSCO will comply with all applicable laws and regulations pertaining to the handling of confidential information.'
];

export const REQUIRED_ACKNOWLEDGEMENTS = [
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

export const SPEAK_AUTHORIZATION_ITEMS = [
  {
    id: 'communication_and_care_planning',
    title: 'School communication and care planning',
    body: 'I authorize ITSCO and any assigned providers and staff to communicate with this person for school-based care coordination and support of the client’s identified needs.'
  },
  {
    id: 'treatment_goals',
    title: 'Treatment goals and plans',
    body: 'I authorize brief discussion of treatment goals/objectives with this person only as needed for care coordination; no session-content details are released outside this care purpose.'
  }
];

export const WAIVER_ITEMS = [
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
  }
];

export const PURPOSES_ES = [
  'Autorizar a ITSCO y a los proveedores/personal asignado para comunicarse con la escuela seleccionada y el personal escolar aprobado para apoyar al cliente en el entorno escolar.',
  'Preocupaciones de seguridad y evaluaciones de riesgo o ideacion realizadas durante las sesiones.',
  'Coordinar la administracion de servicios psicologicos en la propiedad de terceros.',
  'Hablar sobre objetivos de tratamiento y planes de tratamiento asociados.'
];

export const GUIDELINES_ES = [
  'La informacion sobre el contenido de las sesiones no se compartira con el personal listado, a menos que el terapeuta lo considere clinicamente necesario por razones de seguridad como riesgo inminente para el clinico, el cliente u otras personas, incluida lesion fisica.',
  'La confidencialidad se mantendra excepto por lo antes mencionado.',
  'Toda correspondencia relacionada con mi dependiente sera documentada en el expediente clinico.',
  'ITSCO cumplira con todas las leyes y regulaciones aplicables relacionadas con el manejo de informacion confidencial.'
];

export const REQUIRED_ACKNOWLEDGEMENTS_ES = [
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

export const SPEAK_AUTHORIZATION_ITEMS_ES = [
  {
    id: 'communication_and_care_planning',
    title: 'Comunicacion escolar y planificacion de atencion',
    body: 'Autorizo a ITSCO y a los proveedores/personal asignado a comunicarse con esta persona para la coordinacion de atencion en la escuela y apoyo de las necesidades identificadas del cliente.'
  },
  {
    id: 'treatment_goals',
    title: 'Objetivos y planes de tratamiento',
    body: 'Autorizo una discusion breve de objetivos/metas de tratamiento con esta persona solo cuando sea necesario para coordinacion de atencion; no se divulgan detalles del contenido de sesiones fuera de este proposito de atencion.'
  }
];

export const WAIVER_ITEMS_ES = [
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
  }
];

function normalizeLanguageCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('es') ? 'es' : 'en';
}

export function getLocalizedSmartRoiBundle(languageCode) {
  const locale = normalizeLanguageCode(languageCode);
  if (locale === 'es') {
    return {
      locale,
      purposes: PURPOSES_ES,
      guidelines: GUIDELINES_ES,
      requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS_ES,
      waiverItems: WAIVER_ITEMS_ES,
      speakAuthorizationItems: SPEAK_AUTHORIZATION_ITEMS_ES
    };
  }
  return {
    locale: 'en',
    purposes: PURPOSES,
    guidelines: GUIDELINES,
    requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS,
    waiverItems: WAIVER_ITEMS,
    speakAuthorizationItems: SPEAK_AUTHORIZATION_ITEMS
  };
}
