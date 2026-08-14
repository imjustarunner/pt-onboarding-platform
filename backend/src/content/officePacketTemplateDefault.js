import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from './schoolPacketTemplateDefault.en.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES } from './schoolPacketTemplateDefault.es.js';
import {
  extractPacketSectionHtml,
  PACKET_SECTION_KEYS
} from '../services/schoolPacketSections.service.js';
import {
  OFFICE_PACKET_VARIANTS,
  normalizeOfficePacketVariant,
  officePacketTitle
} from '../constants/officePrintablePacket.js';

function normalizeLocale(locale) {
  const raw = String(locale || 'en').trim().toLowerCase();
  if (raw === 'es' || raw.startsWith('es-') || raw.startsWith('es_')) return 'es';
  return 'en';
}

function sourceHtml(locale) {
  return normalizeLocale(locale) === 'es'
    ? DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES
    : DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceByH2(html, startHeading, endHeading = null) {
  const src = String(html || '');
  const startRe = new RegExp(`<h2[^>]*>\\s*${escapeRegExp(startHeading)}\\s*<\\/h2>`, 'i');
  const start = startRe.exec(src);
  if (!start) return '';
  const from = start.index;
  if (!endHeading) return src.slice(from).trim();
  const endRe = new RegExp(`<h2[^>]*>\\s*${escapeRegExp(endHeading)}\\s*<\\/h2>`, 'i');
  const rest = src.slice(from + 1);
  const end = endRe.exec(rest);
  return (end ? src.slice(from, from + 1 + end.index) : src.slice(from)).trim();
}

function removeH3Block(html, heading) {
  const re = new RegExp(
    `<h3[^>]*>\\s*${escapeRegExp(heading)}\\s*<\\/h3>[\\s\\S]*?(?=<h[23][^>]*>|$)`,
    'i'
  );
  return String(html || '').replace(re, '');
}

function removeStrongParagraph(html, needle) {
  const re = new RegExp(
    `<p>\\s*<strong>[^<]*${escapeRegExp(needle)}[\\s\\S]*?<\\/p>`,
    'i'
  );
  return String(html || '').replace(re, '');
}

function renameH3(html, from, to) {
  return String(html || '').replace(
    new RegExp(`(<h3[^>]*>\\s*)${escapeRegExp(from)}(\\s*<\\/h3>)`, 'i'),
    `$1${to}$2`
  );
}

function signatureBlock(variant, locale) {
  const isParent = normalizeOfficePacketVariant(variant) === OFFICE_PACKET_VARIANTS.PARENT;
  const isEs = normalizeLocale(locale) === 'es';
  if (isEs) {
    return `
  <div class="page-break"></div>
  <h2>Firmas</h2>
  <p>Al firmar, usted confirma que ha leído y comprende la divulgación, el consentimiento informado, el acuerdo de políticas y servicios, y el aviso de HIPAA incluidos en este paquete.</p>
  <div class="sig-row">
    <span class="sig-label">${isParent ? 'Firma del padre/tutor' : 'Firma del cliente'}</span>
    <span class="sig-line"></span>
    <span class="sig-date-label">Fecha</span>
    <span class="sig-date-line"></span>
  </div>
  ${isParent ? `
  <div class="sig-row">
    <span class="sig-label">Firma del padre/tutor #2 (si aplica)</span>
    <span class="sig-line"></span>
    <span class="sig-date-label">Fecha</span>
    <span class="sig-date-line"></span>
  </div>` : ''}
`;
  }
  return `
  <div class="page-break"></div>
  <h2>Signatures</h2>
  <p>By signing, you confirm that you have read and understand the disclosure, informed consent, policy and services agreement, and HIPAA notice included in this packet.</p>
  <div class="sig-row">
    <span class="sig-label">${isParent ? 'Parent/guardian signature' : 'Client signature'}</span>
    <span class="sig-line"></span>
    <span class="sig-date-label">Date</span>
    <span class="sig-date-line"></span>
  </div>
  ${isParent ? `
  <div class="sig-row">
    <span class="sig-label">Parent/guardian #2 signature (if applicable)</span>
    <span class="sig-line"></span>
    <span class="sig-date-label">Date</span>
    <span class="sig-date-line"></span>
  </div>` : ''}
`;
}

function officePolicyIntro(locale, variant) {
  const isParent = normalizeOfficePacketVariant(variant) === OFFICE_PACKET_VARIANTS.PARENT;
  if (normalizeLocale(locale) === 'es') {
    return isParent
      ? '<p>Este acuerdo describe los servicios de consejería en oficina que {{AGENCY_NAME}} brinda a su hijo/a o dependiente, y las políticas comerciales que rigen esa relación.</p>'
      : '<p>Este acuerdo describe los servicios de consejería en oficina que {{AGENCY_NAME}} le brinda a usted como cliente, y las políticas comerciales que rigen esa relación.</p>';
  }
  return isParent
    ? '<p>This agreement describes the in-office counseling services {{AGENCY_NAME}} provides for your child or dependent, and the business policies that govern that relationship.</p>'
    : '<p>This agreement describes the in-office counseling services {{AGENCY_NAME}} provides to you as the client, and the business policies that govern that relationship.</p>';
}

function buildOfficePolicy(source, locale, variant) {
  let policy = extractPacketSectionHtml(source, PACKET_SECTION_KEYS.POLICY_SERVICES);
  const schoolHeadings = normalizeLocale(locale) === 'es'
    ? [
      'Acerca de Nuestros Servicios en las Escuelas',
      'Reconocimiento de Servicios Independientes',
      'Política de Asistencia de Tres Faltas',
      'Transporte/Selección de Consejeros'
    ]
    : [
      'About our Services In The Schools',
      'Acknowledgement of Stand-Alone Services',
      'Three Strike Attendance Policy',
      'Transportation/Selection of Counselors'
    ];
  for (const heading of schoolHeadings) {
    policy = removeH3Block(policy, heading);
  }
  policy = renameH3(
    policy,
    normalizeLocale(locale) === 'es'
      ? 'Acerca de Nuestros Servicios Fuera de las Escuelas'
      : 'About our Services Outside of Schools',
    normalizeLocale(locale) === 'es' ? 'Acerca de Nuestros Servicios' : 'About our Services'
  );
  policy = policy.replace(
    /<p>This document contains important information about our professional services and business policies\.<\/p>/i,
    officePolicyIntro(locale, variant)
  );
  policy = policy.replace(
    /<p>Este documento contiene información importante sobre nuestros servicios profesionales y políticas comerciales\.<\/p>/i,
    officePolicyIntro(locale, variant)
  );
  return policy;
}

function buildOfficeInformed(source, locale) {
  let informed = extractPacketSectionHtml(source, PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT);
  informed = removeH3Block(
    informed,
    normalizeLocale(locale) === 'es' ? 'Confidencialidad en las Escuelas' : 'Confidentiality in Schools'
  );
  informed = informed.replace(
    /If a participant becomes aggressive, threatens others, or attempts to leave, campus or district police will be contacted\. Should a participant leave campus or school grounds, 911 will be called\./i,
    'If a participant becomes aggressive, threatens others, or attempts to leave unsafely, staff will follow emergency protocols and contact emergency services as needed.'
  );
  informed = informed.replace(
    /Si un participante se vuelve agresivo, amenaza a otros o intenta irse, se contactará a la policía del campus o del distrito\. Si un participante abandona el campus o los terrenos escolares, se llamará al 911\./i,
    'Si un participante se vuelve agresivo, amenaza a otros o intenta irse de forma insegura, el personal seguirá los protocolos de emergencia y contactará a los servicios de emergencia según sea necesario.'
  );
  return informed;
}

function buildOfficeDisclosure(source, locale) {
  if (normalizeLocale(locale) === 'es') {
    return [
      sliceByH2(source, 'DERECHOS DEL CLIENTE', 'INFORMACIÓN DEL PROFESIONAL DE SALUD MENTAL'),
      sliceByH2(source, 'INFORMACIÓN DEL PROFESIONAL DE SALUD MENTAL', 'Política de Privacidad de HIPAA y Aviso de Prácticas de Privacidad')
    ].filter(Boolean).join('\n  <div class="page-break"></div>\n  ');
  }
  return [
    sliceByH2(source, 'CLIENT RIGHTS', 'MENTAL HEALTH PROFESSIONAL INFORMATION'),
    sliceByH2(source, 'MENTAL HEALTH PROFESSIONAL INFORMATION', 'HIPAA Privacy Policy &amp; Notice of Privacy Practices')
      || sliceByH2(source, 'MENTAL HEALTH PROFESSIONAL INFORMATION', 'HIPAA Privacy Policy & Notice of Privacy Practices')
  ].filter(Boolean).join('\n  <div class="page-break"></div>\n  ');
}

function buildOfficeHipaa(source) {
  let hipaa = extractPacketSectionHtml(source, PACKET_SECTION_KEYS.HIPAA_NOTICE);
  hipaa = removeStrongParagraph(hipaa, 'School Portal Data Transfer');
  hipaa = removeStrongParagraph(hipaa, 'Transferencia de Datos del Portal Escolar');
  return hipaa;
}

function packetLead(variant, locale) {
  const isParent = normalizeOfficePacketVariant(variant) === OFFICE_PACKET_VARIANTS.PARENT;
  if (normalizeLocale(locale) === 'es') {
    return isParent
      ? '<p>Este paquete impreso es para un padre o tutor que inscribe a un hijo/a o dependiente en consejería de oficina. Incluye la divulgación, el consentimiento informado, el acuerdo de políticas y servicios, y el aviso de HIPAA. Las ediciones de este paquete no cambian el paquete del cliente adulto.</p>'
      : '<p>Este paquete impreso es para un cliente adulto que se inscribe a sí mismo en consejería de oficina. Incluye la divulgación, el consentimiento informado, el acuerdo de políticas y servicios, y el aviso de HIPAA. Las ediciones de este paquete no cambian el paquete de padre/tutor.</p>';
  }
  return isParent
    ? '<p>This printed packet is for a parent or guardian enrolling a child or dependent in office counseling. It includes the disclosure statement, informed consent, policy and services agreement, and HIPAA notice. Edits to this packet do not change the adult client packet.</p>'
    : '<p>This printed packet is for an adult client enrolling themselves in office counseling. It includes the disclosure statement, informed consent, policy and services agreement, and HIPAA notice. Edits to this packet do not change the parent/guardian packet.</p>';
}

export function looksLikeSchoolSeedHtml(html) {
  const text = String(html || '');
  return /INTAKE QUESTIONNAIRE/i.test(text)
    || /Confidentiality in Schools/i.test(text)
    || /Confidencialidad en las Escuelas/i.test(text)
    || /About our Services In The Schools/i.test(text)
    || /Acerca de Nuestros Servicios en las Escuelas/i.test(text);
}

export function defaultOfficePacketHtml(variant = 'self', locale = 'en') {
  const loc = normalizeLocale(locale);
  const v = normalizeOfficePacketVariant(variant);
  const source = sourceHtml(loc);
  const title = officePacketTitle(v, loc);
  const minor = v === OFFICE_PACKET_VARIANTS.PARENT
    ? (loc === 'es'
      ? sliceByH2(source, 'CONSENTIMIENTO DE MENOR', 'CONSENTIMIENTO INFORMADO')
      : sliceByH2(source, 'MINOR CONSENT', 'INFORMED CONSENT'))
    : '';

  return `
<section class="office-packet-template">
  <h1>${title}</h1>
  ${packetLead(v, loc)}
  <p><strong>{{AGENCY_NAME}}</strong><br />{{AGENCY_ADDRESS}}</p>

  <div class="page-break"></div>
  ${buildOfficeDisclosure(source, loc)}

  <div class="page-break"></div>
  ${minor}
  ${buildOfficeInformed(source, loc)}

  <div class="page-break"></div>
  ${buildOfficePolicy(source, loc, v)}

  <div class="page-break"></div>
  ${buildOfficeHipaa(source)}

  ${signatureBlock(v, loc)}
</section>
`.trim();
}

export { normalizeLocale };
