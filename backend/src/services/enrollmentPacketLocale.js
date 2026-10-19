/**
 * Spanish copy for the generated enrollment shell. Agency-authored text and
 * validated instrument wording are intentionally outside this dictionary.
 * Known instruments use their published Spanish edition, never word replacement.
 */
import { spanishClinicalField } from '../data/validatedClinicalScreens.es.js';
const ES = new Map(Object.entries({
  'Counseling': 'Consejería',
  'Tutoring': 'Tutoría',
  'School': 'Escuela',
  'Item': 'Pregunta',
  'Office / virtual': 'Oficina / virtual',
  'Guardian': 'Padre, madre o tutor',
  'Parent / guardian': 'Padre, madre o tutor',
  'Self enrollment': 'Inscripción personal',
  'Counseling enrollment': 'Inscripción para consejería',
  'Tutoring enrollment': 'Inscripción para tutoría',
  'Enrollment information': 'Información de inscripción',
  'Client and contact information': 'Información del cliente y de contacto',
  'Client / learner full name': 'Nombre completo del cliente o estudiante',
  'Client / learner name': 'Nombre del cliente o estudiante',
  'Client name': 'Nombre del cliente',
  'Date of birth': 'Fecha de nacimiento',
  'Parent / guardian full name': 'Nombre completo del padre, madre o tutor',
  'Parent / guardian name and authority': 'Nombre y autoridad del padre, madre o tutor',
  'Relationship and decision-making authority': 'Relación con el cliente y autoridad para tomar decisiones',
  'Other guardian name and contact, if applicable': 'Nombre y contacto de otro tutor, si corresponde',
  'Email': 'Correo electrónico',
  'Phone': 'Teléfono',
  'Mailing address': 'Dirección postal',
  'Preferred language / accessibility needs': 'Idioma preferido y necesidades de accesibilidad',
  'Grade': 'Grado escolar',
  'Provider / tutor preferences': 'Preferencias de proveedor o tutor académico',
  'What would help make a provider or tutor a good fit? (approach, language, experience, accessibility, availability)': '¿Qué características busca en un proveedor o tutor académico? (enfoque, idioma, experiencia, accesibilidad, disponibilidad)',
  'Learning goals and support': 'Objetivos de aprendizaje y apoyos',
  'What would you like help learning?': '¿En qué le gustaría recibir apoyo para aprender?',
  'Subjects / skills': 'Materias o habilidades',
  'Current grade or learning level': 'Grado escolar o nivel de aprendizaje actual',
  'Current IEP, 504 plan, accommodations or learning supports': 'IEP, plan 504, adaptaciones o apoyos de aprendizaje actuales',
  'Strengths and interests': 'Fortalezas e intereses',
  'Availability and preferred meeting format': 'Disponibilidad y formato preferido para las sesiones',
  'School release choices': 'Opciones de autorización para la escuela',
  'Client / student full name': 'Nombre completo del cliente o estudiante',
  'Client date of birth': 'Fecha de nacimiento del cliente',
  'Guardian name, relationship and authority': 'Nombre, relación y autoridad del tutor',
  'Signer name and authority (self if applicable)': 'Nombre y autoridad de quien firma (por sí mismo, si corresponde)',
  'School communication and care planning': 'Comunicación con la escuela y planificación de la atención',
  'Discussion of treatment goals and plans for coordination': 'Conversación sobre objetivos y planes de tratamiento para coordinar la atención',
  'Additional school staff names and role / contact, if authorized': 'Nombres, funciones y contacto de personal escolar adicional, si se autoriza',
  'Expiration date or event (if not already stated in the release)': 'Fecha o evento de vencimiento (si no aparece en la autorización)',
  'Additional limits or earlier expiration date/event, if requested': 'Límites adicionales o fecha o evento de vencimiento anticipado, si se solicita',
  'Guardian authority': 'Autoridad del tutor',
  'Child / dependent full name': 'Nombre completo del menor o dependiente',
  'Guardian full name': 'Nombre completo del tutor',
  'Relationship and legal authority to consent': 'Relación con el cliente y autoridad legal para dar consentimiento',
  'Other legal guardian and contact, if applicable': 'Otro tutor legal y su contacto, si corresponde',
  'Relevant custody or court documentation supplied / to be supplied': 'Documentación pertinente de custodia o del tribunal entregada o pendiente de entregar',
  'Coverage information': 'Información de cobertura',
  'Coverage': 'Cobertura',
  'Commercial insurance': 'Seguro comercial',
  'Self pay / no insurance': 'Pago particular / sin seguro',
  'Insurance company / payer name': 'Nombre de la aseguradora o entidad pagadora',
  'Member / Medicaid ID': 'Número de afiliado o de Medicaid',
  'Group number (if applicable)': 'Número de grupo (si corresponde)',
  'Subscriber name': 'Nombre del titular del seguro',
  'Subscriber date of birth': 'Fecha de nacimiento del titular',
  'Relationship to client': 'Relación con el cliente',
  'Secondary insurance company and member ID (if any)': 'Aseguradora secundaria y número de afiliado (si tiene)',
  'Insurance and payment information': 'Información de seguro y pago',
  'If you have Medicaid, do not write payment-card or bank details on this form. Please still provide your insurance information.': 'Si tiene Medicaid, no escriba datos de tarjetas de pago ni datos bancarios en este formulario. Proporcione su información de seguro.',
  'Do not include card numbers, security codes or bank account information in this packet. Other payment arrangements can be made directly with the agency.': 'No incluya números de tarjetas, códigos de seguridad ni información de cuentas bancarias en este paquete. Puede acordar otras formas de pago directamente con la agencia.',
  'Optional communication preferences': 'Preferencias de comunicación opcionales',
  'Contact preferences': 'Preferencias de contacto',
  'Mobile number for selected text messages': 'Número de celular para los mensajes de texto seleccionados',
  'Name and relationship / authority of the person choosing these preferences': 'Nombre y relación o autoridad de la persona que elige estas preferencias',
  'Choose each message type independently. Nothing is preselected. Leave blank or choose No to decline. Staff must review recorded choices before activating subscriptions. A packet signature does not opt you into every program.': 'Elija cada tipo de mensaje por separado. Ninguna opción está marcada de antemano. Deje en blanco o elija No para rechazar. El personal debe revisar las opciones registradas antes de activar las suscripciones. Firmar este paquete no lo inscribe en todos los programas.',
  'No client messaging programs are currently published by this agency. Ask staff about available communication options.': 'Esta agencia no tiene programas de mensajes para clientes publicados actualmente. Pregunte al personal sobre las opciones de comunicación disponibles.',
  'AuricWell acknowledgment': 'Reconocimiento de AuricWell',
  'SchoolCareBridge acknowledgment': 'Reconocimiento de SchoolCareBridge',
  'Learning services consent': 'Consentimiento para servicios de aprendizaje',
  'Policy and services agreement': 'Acuerdo de políticas y servicios',
  'Learning records and privacy': 'Registros de aprendizaje y privacidad',
  'Release of information': 'Autorización para divulgar información',
  'The agency will explain its current scheduling, attendance, cancellation and payment policies before services begin. You may ask questions, request an accessible format and retain a copy of the enrollment documents.': 'La agencia explicará sus políticas actuales de programación, asistencia, cancelación y pago antes de comenzar los servicios. Puede hacer preguntas, solicitar un formato accesible y conservar una copia de los documentos de inscripción.',
  'The agency maintains enrollment and learning records. Ask the agency about access, corrections and requests to share those records. A separate authorization is used when required to share information with a school or another party.': 'La agencia mantiene registros de inscripción y aprendizaje. Consulte a la agencia sobre el acceso, las correcciones y las solicitudes para compartir esos registros. Cuando corresponda, se utiliza una autorización independiente para compartir información con una escuela u otra parte.',
  'Packet acknowledgment and receipt': 'Reconocimiento y recibo del paquete',
  'I received the complete documents listed below, had an opportunity to ask questions, and acknowledge the applicable enrollment consents and notices. I may retain the full packet. My signature records the choices I made; it does not select optional message programs. The school release of information is a separate authorization and retains its own signature.': 'Recibí los documentos completos que se enumeran a continuación, tuve la oportunidad de hacer preguntas y reconozco los consentimientos y avisos de inscripción aplicables. Puedo conservar el paquete completo. Mi firma registra las opciones que elegí; no selecciona programas de mensajes opcionales. La autorización para divulgar información a la escuela es independiente y conserva su propia firma.',
  'Signature': 'Firma',
  'Date': 'Fecha',
  'Additional guardian signature, if applicable': 'Firma de otro tutor, si corresponde',
  'Separate release signature': 'Firma independiente de la autorización',
  'Expiration date or event': 'Fecha o evento de vencimiento',
  'Copy provided by: ☐ Paper ☐ Secure portal ☐ Requested email attachment': 'Copia entregada por: ☐ Papel ☐ Portal seguro ☐ Archivo adjunto por correo solicitado',
  'This document is supplied as an attachment in the complete enrollment packet.': 'Este documento se incluye como archivo adjunto en el paquete completo de inscripción.',
  'PSC-17 · Parent / guardian report for children': 'PSC-17 · Informe del padre, madre o tutor para menores',
  'PHQ-9 and GAD-7': 'PHQ-9 y GAD-7',
  'Complete for a child only; an adult dependent requires age-appropriate screening selected by the clinician.': 'Complete este cuestionario solamente para un menor; un dependiente adulto necesita una evaluación apropiada para su edad seleccionada por el profesional clínico.',
  'Complete these questionnaires about yourself.': 'Complete estos cuestionarios sobre usted.',
  'These screens support clinician review and do not establish a diagnosis. You may discuss answers with your provider. These forms are not monitored for emergencies; call 911 for an emergency or call/text 988 for immediate crisis support in the U.S.': 'Estos cuestionarios apoyan la revisión clínica y no establecen un diagnóstico. Puede conversar sobre sus respuestas con su proveedor. Estos formularios no se monitorean para emergencias; llame al 911 en una emergencia o llame o envíe un mensaje al 988 para apoyo inmediato en una crisis en Estados Unidos.',
  'If applicable; skip when the related answer does not apply.': 'Si corresponde; omita esta pregunta cuando la respuesta relacionada no sea aplicable.',
  'Yes': 'Sí',
  'No': 'No',
  'Allow': 'Autorizar',
  'Deny': 'No autorizar',
  'Optional': 'Opcional'
}));

const isEs = locale => /^es(?:$|[-_])/i.test(String(locale || ''));
const instrumentKey = key => /^(?:phq9_|gad7_|psc_\d|cssrs_|asq_|crafft|vanderbilt_|scared|audit_|dast|pcptsd|asrs|mdq)/i.test(String(key || ''));
const decode = value => String(value).replace(/&amp;/g,'&').replace(/&#39;|&#x27;/gi,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
const encode = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** Exact shell copy only. Unknown source questions and legal text stay intact. */
export function enrollmentPacketText(text, locale = 'en') {
  const original = String(text ?? '');
  if (!isEs(locale)) return original;
  const trimmed = original.trim();
  let translated = ES.get(trimmed);
  if (translated == null && trimmed.includes(' · ')) {
    const segments = trimmed.split(' · ').map(part => ES.get(part) ?? part).join(' · ');
    if (segments !== trimmed) translated = segments;
  }
  if (translated == null && /^☐\s/.test(trimmed)) {
    const label = trimmed.replace(/^☐\s+/, '');
    if (ES.has(label)) translated = `☐ ${ES.get(label)}`;
  }
  if (translated == null) {
    // Only generated blank signature lines, never arbitrary prose with colons.
    const line = trimmed.match(/^(.+?):\s*(_{3,})(?:\s+Date:\s*(_{3,}))?$/);
    if (line && ES.has(line[1])) translated = `${ES.get(line[1])}: ${line[2]}${line[3] ? ` Fecha: ${line[3]}` : ''}`;
  }
  if (translated == null && /^Share with /.test(trimmed)) translated = `Compartir con ${trimmed.slice(11)}`;
  if (translated == null && /^Generated \d{4}-\d{2}-\d{2} · Complete packet: keep a copy of every document\.$/.test(trimmed)) {
    translated = `Generado el ${trimmed.slice(10,20)} · Paquete completo: conserve una copia de cada documento.`;
  }
  if (translated == null && trimmed.startsWith('Provide copies or photos of the front and back of every current insurance card through the secure client portal, or bring them to the office. Contact ') && trimmed.endsWith(' for a secure submission method. Tutoring coverage, if any, must be confirmed with the agency and payer.')) {
    const contact = trimmed.slice('Provide copies or photos of the front and back of every current insurance card through the secure client portal, or bring them to the office. Contact '.length, -' for a secure submission method. Tutoring coverage, if any, must be confirmed with the agency and payer.'.length);
    translated = `Entregue copias o fotos del frente y reverso de cada tarjeta de seguro vigente mediante el portal seguro del cliente, o llévelas a la oficina. Comuníquese con ${contact} para conocer un método seguro de entrega. La cobertura de tutoría, si existe, debe confirmarse con la agencia y la entidad pagadora.`;
  }
  if (translated == null && trimmed.endsWith(' provides tutoring and learning support. Goals, scheduling, fees and available services will be reviewed with you before services begin. Tutoring is not psychotherapy or a medical diagnosis. Ask the agency which services are appropriate for your needs.')) {
    const agency = trimmed.slice(0, -' provides tutoring and learning support. Goals, scheduling, fees and available services will be reviewed with you before services begin. Tutoring is not psychotherapy or a medical diagnosis. Ask the agency which services are appropriate for your needs.'.length);
    translated = `${agency} ofrece tutoría y apoyo de aprendizaje. Se revisarán con usted los objetivos, horarios, tarifas y servicios disponibles antes de comenzar. La tutoría no es psicoterapia ni un diagnóstico médico. Pregunte a la agencia qué servicios son apropiados para sus necesidades.`;
  }
  if (translated == null) {
    const release = trimmed.match(/^I authorize (.+?) to exchange the school coordination information I select below with (.+?) at (.*?)\. Purpose: coordinate tutoring and learning support\. I may limit recipients or information and may revoke this authorization through the agency; prior authorized disclosures cannot be reversed\. Ask the agency how disclosed records are protected\.$/);
    if (release) translated = `Autorizo a ${release[1]} a intercambiar la información de coordinación escolar que seleccione a continuación con ${release[2]}, en ${release[3]}. Finalidad: coordinar la tutoría y el apoyo de aprendizaje. Puedo limitar los destinatarios o la información y revocar esta autorización mediante la agencia; las divulgaciones previamente autorizadas no pueden revertirse. Pregunte a la agencia cómo se protegen los registros divulgados.`;
  }
  if (translated == null) {
    // The generated screener introduction is one text node with two sentences.
    for (const lead of ['Complete for a child only; an adult dependent requires age-appropriate screening selected by the clinician.', 'Complete these questionnaires about yourself.']) {
      const tail = 'These screens support clinician review and do not establish a diagnosis. You may discuss answers with your provider. These forms are not monitored for emergencies; call 911 for an emergency or call/text 988 for immediate crisis support in the U.S.';
      if (trimmed === `${lead} ${tail}`) translated = `${ES.get(lead)} ${ES.get(tail)}`;
    }
  }
  return translated == null ? original : original.replace(trimmed, translated);
}

/** Localize display copy while keeping response values and condition keys. */
export function localizeEnrollmentPacketSections(sections = [], locale = 'en') {
  if (!isEs(locale)) return sections;
  return sections.map(section => ({
    ...section,
    title: enrollmentPacketText(section.title, locale),
    fields: (section.fields || []).map(([key, label, config = {}]) => {
      const published = spanishClinicalField(key, label, config);
      if (published) return published;
      if (config.instrument || instrumentKey(key)) return [key, label, config];
      return [key, enrollmentPacketText(label, locale), {
        ...config,
        helperText: enrollmentPacketText(config.helperText || '', locale),
        options: (config.options || []).map(option => ({...option, label: enrollmentPacketText(option.label, locale)}))
      }];
    })
  }));
}

/**
 * Translate only text nodes of already sanitized generated HTML. Attributes,
 * URLs, source hashes, scripts/styles, and complete instrument field subtrees
 * are never rewritten. This function is not an HTML sanitizer.
 */
export function translateEnrollmentPacketHtml(html, locale = 'en') {
  if (!isEs(locale)) return String(html || '');
  const stack = [];
  return String(html || '').split(/(<[^>]+>)/g).map(part => {
    if (part.startsWith('<')) {
      const closing = part.match(/^<\/([a-z][\w:-]*)\s*>/i);
      if (closing) {
        const index = stack.map(entry => entry.tag).lastIndexOf(closing[1].toLowerCase());
        if (index >= 0) stack.splice(index);
      } else {
        const opening = part.match(/^<([a-z][\w:-]*)\b/i);
        if (opening && !/\/>$/.test(part) && !/^(?:br|hr|img|input|meta|link)$/i.test(opening[1])) {
          const key = part.match(/\bdata-field-key=["']([^"']+)["']/i)?.[1];
          stack.push({tag: opening[1].toLowerCase(), protected: instrumentKey(key) || /^(?:script|style|code|pre)$/i.test(opening[1])});
        }
      }
      return part;
    }
    if (stack.some(entry => entry.protected)) return part;
    const translated = enrollmentPacketText(decode(part), locale);
    return translated === decode(part) ? part : encode(translated);
  }).join('');
}

/** Be explicit when a Spanish packet includes unchanged English source text. */
export function enrollmentPacketLocaleNotice({locale = 'en', hasLocalizedIntake = true, hasLocalizedScreens = true, hasLocalizedCommunications = true} = {}) {
  if (!isEs(locale)) return '';
  const messages = [];
  if (!hasLocalizedIntake) messages.push('El cuestionario de admisión está disponible en inglés en esta edición. Solicite a la agencia apoyo en español para completarlo.');
  if (!hasLocalizedScreens) messages.push('Los cuestionarios clínicos de esta edición conservan el texto original en inglés. Solicite a su proveedor una versión validada en español o apoyo para completarlos.');
  if (!hasLocalizedCommunications) messages.push('Algunos avisos de programas de mensajes conservan el texto publicado en inglés. Solicite una explicación en español antes de elegir sus preferencias.');
  return messages.length ? `<aside class="enrollment-language-notice" lang="es"><h3>Idioma de los documentos</h3>${messages.map(text => `<p>${text}</p>`).join('')}</aside>` : '';
}
