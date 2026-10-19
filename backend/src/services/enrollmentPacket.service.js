import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { PDFDocument } from 'pdf-lib';
import Agency from '../models/Agency.model.js';
import AgencyOfficeIntakeMaster from '../models/AgencyOfficeIntakeMaster.model.js';
import AgencySchoolIntakeMaster from '../models/AgencySchoolIntakeMaster.model.js';
import AgencyChannelIntakeMaster from '../models/AgencyChannelIntakeMaster.model.js';
import SchoolPacketTemplate from '../models/SchoolPacketTemplate.model.js';
import OfficePacketTemplate from '../models/OfficePacketTemplate.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { defaultOfficePacketHtml, applyNluOfficeLegalIfNeeded, tokenizeOfficeDisclosureEntity } from '../content/officePacketTemplateDefault.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../content/schoolPacketTemplateDefault.en.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES } from '../content/schoolPacketTemplateDefault.es.js';
import { injectIntakeLegalIntoPacketHtml, resolveIntakeLegalFromTheme } from '../content/intakeLegalCopy.js';
import { isNluPacketChromeAgency, resolvePacketBrandChrome } from './packetBrandChrome.service.js';
import { listDisclosureProviders } from './smartDisclosure.service.js';
import { buildDisclosureCareTeamHtml, buildSchoolStaffTableHtml, expandYourCareTeamProviders, buildPacketStyleBlock, buildPdfChromeTemplates } from './schoolPrintablePacket.service.js';
import { buildCounselingSelfEnSteps } from '../data/counselingIntakeSelfEn.js';
import { buildCounselingDependentEnSteps } from '../data/counselingIntakeDependentEn.js';
import { buildPhq9Fields, buildGad7Fields, buildPsc17Fields } from '../data/validatedClinicalScreens.en.js';
import { buildPhq9FieldsEs, buildGad7FieldsEs, buildPsc17FieldsEs, SPANISH_SCREEN_SOURCES } from '../data/validatedClinicalScreens.es.js';
import { SMS_PROGRAMS, buildCampaignPacket, campaignPublicContent } from '../utils/smsCampaignPacket.js';
import { publishedSmsProgramSeed } from '../utils/smsPublishedProgramSeeds.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import DocumentSigningService from './documentSigning.service.js';
import StorageService from './storage.service.js';
import { enrollmentPacketText, translateEnrollmentPacketHtml, localizeEnrollmentPacketSections, enrollmentPacketLocaleNotice } from './enrollmentPacketLocale.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse = (value, fallback) => { try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; } catch { return fallback; } };
const fail = (status, message) => Object.assign(new Error(message), { status, statusCode: status });
export const cleanEnrollmentHtml = value => sanitizeHtml(String(value || ''), { allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1','h2','section','article','header','footer','span','div','table','thead','tbody','tr','th','td'], allowedAttributes: { '*': ['class','colspan','rowspan','data-field-key'], a: ['href','title'] }, allowedSchemes: ['https','http','mailto'] });

export function enrollmentPacketOptions(input = {}) {
  const agencyId = Number(input.agencyId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw fail(400, 'An agency is required');
  const channel = input.channel || 'office';
  const audience = input.audience === 'parent' ? 'guardian' : input.audience || 'self';
  const service = input.service || 'counseling';
  if (!['school','office'].includes(channel) || !['self','guardian'].includes(audience) || !['counseling','tutoring'].includes(service)) throw fail(400, 'Choose a valid enrollment packet');
  const organizationId = (input.organizationId || input.schoolId) ? Number(input.organizationId || input.schoolId) : null;
  if (organizationId && (!Number.isSafeInteger(organizationId) || organizationId < 1 || channel !== 'school')) throw fail(400, 'Choose a valid school');
  return { agencyId, channel, audience, service, locale: String(input.locale || 'en').startsWith('es') ? 'es' : 'en', organizationId };
}

export function platformAcknowledgmentSource({ channel = 'office', locale = 'en' } = {}) {
  const es = locale === 'es';
  return `<h2>AuricWell acknowledgment</h2><p>${es ? 'Recibí información sobre AuricWell, la plataforma que la agencia utiliza para administrar documentos, registros y el portal seguro. La agencia es responsable de mis servicios. Puedo solicitar copias impresas y hacer preguntas sobre el acceso a mis registros. Este reconocimiento no autoriza divulgaciones adicionales ni inscribe en mensajes de texto.' : 'I received information about AuricWell, the platform the agency uses to manage documents, records and the secure client portal. My agency remains responsible for my services. I may request paper copies and ask how to access my records. This acknowledgment does not authorize additional disclosures or enroll me in text messages.'}</p>${channel === 'school' ? `<h2>SchoolCareBridge acknowledgment</h2><p>${es ? 'Recibí información sobre SchoolCareBridge, que apoya la coordinación de servicios escolares. El acceso del personal escolar está limitado por sus permisos y la autorización de divulgación escolar que complete por separado. Este reconocimiento no sustituye esa autorización ni permite acceso general a mi expediente clínico.' : 'I received information about SchoolCareBridge, which supports coordination of school services. School staff access is limited by their permissions and the separate school release of information I complete. This acknowledgment does not replace that release or grant general access to my clinical record.'}</p>` : ''}`;
}

export function normalizeEnrollmentCommunicationParagraph(html, locale = 'en') {
  const replacement=locale==='es'
    ? '<p>Los mensajes de texto y el correo electrónico pueden tener riesgos de confidencialidad. Use el portal seguro para información sensible. Elija por separado cada programa opcional de mensajes en la sección de preferencias de comunicación. Firmar el consentimiento de servicios o este paquete no autoriza todos los mensajes. Puede rechazar mensajes sin perder acceso a los servicios.</p>'
    : '<p>Text messages and email can carry confidentiality risks. Use the secure portal for sensitive information. Choose each optional messaging program separately in the communication preferences section. Signing a service consent or this packet does not authorize every message type. Declining optional messages does not affect access to services.</p>';
  return String(html||'').replace(/<p>Telephone \(including text\), email, and videoconference[\s\S]*?By signing this document[\s\S]*?<\/p>/gi,replacement).replace(/<p>El teléfono \(incluyendo mensajes de texto\), el correo electrónico[\s\S]*?Al firmar este documento[\s\S]*?<\/p>/gi,replacement);
}

export function tutoringFoundationSource(locale = 'en') {
  return `<h2>Learning services consent</h2><p>{{AGENCY_NAME}} provides tutoring and learning support. Goals, scheduling, fees and available services will be reviewed with you before services begin. Tutoring is not psychotherapy or a medical diagnosis. Ask the agency which services are appropriate for your needs.</p><h2>Policy and services agreement</h2><p>The agency will explain its current scheduling, attendance, cancellation and payment policies before services begin. You may ask questions, request an accessible format and retain a copy of the enrollment documents.</p><h2>Learning records and privacy</h2><p>The agency maintains enrollment and learning records. Ask the agency about access, corrections and requests to share those records. A separate authorization is used when required to share information with a school or another party.</p><h2>Release of information</h2><p>I authorize {{AGENCY_NAME}} to exchange the school coordination information I select below with {{SCHOOL_NAME}} at {{SCHOOL_ADDRESS}}. Purpose: coordinate tutoring and learning support. I may limit recipients or information and may revoke this authorization through the agency; prior authorized disclosures cannot be reversed. Ask the agency how disclosed records are protected.</p>{{SCHOOL_STAFF_TABLE}}<p>Expiration date or event: ____________________________</p><p>Separate release signature: ____________________________ Date: ______________</p>${platformAcknowledgmentSource({channel:'school',locale})}`;
}

export async function getEnrollmentFoundationSource({ agencyId, channel = 'office', locale = 'en', audience = 'guardian' }) {
  const agency = await Agency.findById(Number(agencyId));
  if (!agency) throw fail(404, 'Agency not found');
  const loc = String(locale).startsWith('es') ? 'es' : 'en';
  let template = null;
  let html = '';
  if (channel === 'tutoring') html = tutoringFoundationSource(loc);
  else if (channel === 'school') {
    template = await SchoolPacketTemplate.getOrCreateForAgency(Number(agencyId), { locale: loc });
    html = template?.html_content || (loc === 'es' ? DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES : DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML);
    html = injectIntakeLegalIntoPacketHtml(html, resolveIntakeLegalFromTheme(agency.theme_settings, loc));
  } else {
    const variant = audience === 'self' ? 'self' : 'parent';
    template = await OfficePacketTemplate.getOrCreateForAgency(Number(agencyId), { locale: loc, variant });
    html = template?.html_content || defaultOfficePacketHtml(variant, loc);
    html = isNluPacketChromeAgency(agency) ? applyNluOfficeLegalIfNeeded(html) : tokenizeOfficeDisclosureEntity(html);
  }
  if (!/AuricWell acknowledgment/i.test(html)) html += platformAcknowledgmentSource({ channel, locale: loc });
  if (channel === 'school' && !/SchoolCareBridge acknowledgment/i.test(html)) {
    const bridge = platformAcknowledgmentSource({channel,locale:loc});
    html += bridge.slice(bridge.indexOf('<h2>SchoolCareBridge'));
  }
  if (!/itsco/i.test(String(agency.name || '') + String(agency.slug || ''))) {
    const support=escape(agency.support_team_email||agency.phone_number||'the agency support team');
    html=html.replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:itsco|\{\{AGENCY_NAME\}\})\.health/gi,support)
      .replace(/719-657-7444(?: ext\.? 0)?/g,escape(agency.phone_number||'the agency'))
      .replace(/437 Windchime (?:Pl|Place),? Colorado Springs,? CO,? 80919/g,'{{AGENCY_ADDRESS}}')
      .replace(/833-444-8726/g,escape(agency.phone_number||'the agency'))
      .replace(/PO@ITSCO\.health/gi,support)
      .replace(/The Mental Range Collective \((?:including|incluyendo) (?:ITSCO|\{\{AGENCY_NAME\}\}), Next Level Up, The Inner Strength Institute, PlotTwistCo(?:, and| y) MH4kidz\)/gi,'{{AGENCY_NAME}}')
      .replace(/The Mental Range Collective,?\s+Michael Mendez/gi,loc==='es'?'el oficial de privacidad de la agencia':'the agency privacy officer')
      .replace(/Michael Mendez, MA, LPC \| (?:Founder|Fundador)/g,'the agency representative')
      .replace(/(?:https?:\/\/)?(?:www\.)?(?:itsco|\{\{AGENCY_NAME\}\})\.health[^\s<"']*/gi,escape(agency.website_url||''))
      .replace(/ITSCO(?:,? LLC)?/gi,'{{AGENCY_NAME}}');
  }
  return { html: cleanEnrollmentHtml(normalizeEnrollmentCommunicationParagraph(html,loc)), agency, version: Number(template?.version || 1), channel, locale: loc };
}

const basicField = (key,label,type='text',options=[]) => ({key,label,type,options,required:false});
function identityFields(audience, channel) {
  return [basicField('client_name', 'Client / learner full name'), basicField('date_of_birth','Date of birth','date'), ...(audience === 'guardian' ? [basicField('guardian_name','Parent / guardian full name'),basicField('guardian_relationship','Relationship and decision-making authority'),basicField('other_guardian','Other guardian name and contact, if applicable')] : []), basicField('email','Email','email'),basicField('phone','Phone','tel'),basicField('mailing_address','Mailing address'),basicField('preferred_language','Preferred language / accessibility needs'),...(channel==='school'?[basicField('school_name','School'),basicField('school_grade','Grade')]:[])];
}
function tutoringSteps() { return [{ label:'Learning goals and support', fields: [basicField('learning_goals','What would you like help learning?','textarea'),basicField('subjects','Subjects / skills'),basicField('current_level','Current grade or learning level'),basicField('learning_supports','Current IEP, 504 plan, accommodations or learning supports','textarea'),basicField('learning_strengths','Strengths and interests','textarea'),basicField('scheduling_preferences','Availability and preferred meeting format','textarea')] }]; }
function eligibleStep(step, audience) {
  const tag = String(step.audience || '').toLowerCase();
  const id = String(step.id || '');
  if (['couple','family'].includes(tag) || /counseling_(couple|family)_/.test(id)) return false;
  if (audience === 'self' && (['guardian','dependent','child'].includes(tag) || id.startsWith('counseling_dep_'))) return false;
  if (audience === 'guardian' && (tag === 'self' || id.startsWith('counseling_self_'))) return false;
  return true;
}
function fieldTuple(f) {
  const type = (f.type==='checkbox' && !f.options?.length) || ['radio','select'].includes(f.type) ? 'radio' : ['checkbox','checkboxes','multiselect','multi_select','multi'].includes(f.type) ? 'multi' : ['date','email','tel','textarea'].includes(f.type) ? f.type : 'text';
  return [String(f.key || f.id), String(f.label || f.key), { type, required: f.required === true, options: (f.type==='checkbox' && !f.options?.length ? [{value:'yes',label:'Yes'},{value:'no',label:'No'}] : f.options || []).map(o => typeof o === 'string' ? { value:o,label:o } : {value:String(o.value),label:String(o.label || o.value)}), ...(f.showIf?.fieldKey || f.showIf?.all || f.showIf?.any ? { showIf: f.showIf } : {}), helperText: String(f.helperText || ''), ...(f.instrument ? {instrument:String(f.instrument)} : {}) }];
}
export function enrollmentSections(steps, { audience = 'self', channel = 'office', service = 'counseling' } = {}) {
  const identity=identityFields(audience,channel).map(field=>({...field,required:['client_name','date_of_birth'].includes(field.key)}));
  const seen = new Set(identity.map(field=>field.key));
  const result = [{title:'Client and contact information',fields:identity.map(fieldTuple)}];
  for (const step of steps || []) {
    if (!eligibleStep(step,audience) || !['questions','clinical_questions','demographics'].includes(step.type || 'questions')) continue;
    const fields = (step.fields || []).filter(f => {
      const key = String(f.key || f.id || '');
      if (!key || seen.has(key) || f.type === 'info' || (audience==='guardian' ? f.instrument==='psc17' : ['phq9','gad7'].includes(f.instrument)) || /deny_all/.test(key) || Array.isArray(f.denyAllKeys) || /^_/.test(key) || /preferred_provider_ids|selected_provider|has_provider_preference/.test(key)) return false;
      if (channel === 'school' && /provider_prefs|scheduling_prefs/.test(String(step.id))) return false;
      seen.add(key); return true;
    }).map(fieldTuple);
    if (fields.length) result.push({title:step.label || 'Enrollment information',fields});
  }
  if (channel === 'office') result.push({title:'Provider / tutor preferences',fields:[fieldTuple(basicField('provider_fit_preferences','What would help make a provider or tutor a good fit? (approach, language, experience, accessibility, availability)','textarea'))]});
  return result;
}
export function enrollmentFoundationSections(key, { audience = 'self', staffRows = [] } = {}) {
  if (key === 'school-roi') return [{ title:'School release choices',fields:[
    basicField('roi_client_name','Client / student full name'),basicField('roi_client_dob','Client date of birth','date'),
    basicField('roi_signer_authority',audience==='guardian'?'Guardian name, relationship and authority':'Signer name and authority (self if applicable)'),
    basicField('roi_school_communication','School communication and care planning','radio',[{value:'allow',label:'Allow'},{value:'deny',label:'Deny'}]),
    basicField('roi_treatment_goals','Discussion of treatment goals and plans for coordination','radio',[{value:'allow',label:'Allow'},{value:'deny',label:'Deny'}]),
    ...staffRows.map((staff,index)=>basicField(`roi_staff_${Number(staff.school_staff_user_id||staff.id)||index+1}`,`Share with ${[staff.first_name,staff.last_name].filter(Boolean).join(' ')}${staff.role_title?' · '+staff.role_title:''}`,'radio',[{value:'allow',label:'Allow'},{value:'deny',label:'Deny'}])),
    basicField('roi_other_staff','Additional school staff names and role / contact, if authorized','textarea'),
    basicField('roi_expiration','Expiration date or event (if not already stated in the release)'),basicField('roi_limits','Additional limits or earlier expiration date/event, if requested','textarea')
  ].map(fieldTuple)}];
  if (key === 'minor-consent') return [{title:'Guardian authority',fields:[basicField('consent_child_name','Child / dependent full name'),basicField('consent_guardian_name','Guardian full name'),basicField('consent_guardian_authority','Relationship and legal authority to consent'),basicField('consent_other_guardian','Other legal guardian and contact, if applicable'),basicField('consent_custody_documentation','Relevant custody or court documentation supplied / to be supplied','textarea')].map(fieldTuple)}];
  return [];
}
export function sectionsToPaperHtml(sections = []) {
  return sections.map(section => {
    const fields = section.fields || [];
    const first = fields[0]?.[2];
    const matrix = fields.length > 2 && first?.instrument && first.options?.length && fields.every(([, , config]) => config.instrument && !config.showIf && JSON.stringify(config.options) === JSON.stringify(first.options) && config.helperText === first.helperText);
    if (matrix) return `<section class="enrollment-section"><h3>${escape(section.title)}</h3>${first.helperText ? `<p>${escape(first.helperText)}</p>` : ''}<table class="screen-table"><thead><tr><th>Item</th>${first.options.map(o=>`<th>${escape(o.label)}</th>`).join('')}</tr></thead><tbody>${fields.map(([key,label])=>`<tr data-field-key="${escape(key)}"><td>${escape(label)}</td>${first.options.map(()=>'<td class="screen-choice">☐</td>').join('')}</tr>`).join('')}</tbody></table></section>`;
    return `<section class="enrollment-section"><h3>${escape(section.title)}</h3><div class="paper-fields">${fields.map(([key,label,config])=>`<div class="paper-field${config.type==='textarea'||config.options?.length||label.length>75?' paper-wide':''}" data-field-key="${escape(key)}"><p><strong>${escape(label)}</strong>${config.helperText ? `<br><span class="paper-help">${escape(config.helperText)}</span>`:''}${config.showIf ? '<br><span class="paper-help">If applicable; skip when the related answer does not apply.</span>':''}</p>${config.options?.length ? `<div class="paper-choices">${config.options.map(o=>`<span>☐ ${escape(o.label)}</span>`).join(' ')}</div>` : `<div class="paper-line${config.type==='textarea'?' paper-long':''}"></div>`}</div>`).join('')}</div></section>`;
  }).join('');
}
const doc = (key,title,html,sections=[],version=1) => ({ key,title,html:cleanEnrollmentHtml(html),sections,editable:false,version,hash:crypto.createHash('sha256').update(JSON.stringify({html,sections,version})).digest('hex') });

export function enrollmentCampaignDocument(agency, options) {
  const flags = parse(agency.feature_flags, {});
  const sections = [];
  const notices = [];
  for (const program of Object.keys(SMS_PROGRAMS).filter(key=>!['workforce','polling'].includes(key))) {
    const published = flags.smsCampaignPackets?.[program]?.published || publishedSmsProgramSeed(agency, program);
    if (!published?.profile) continue;
    const packet = buildCampaignPacket(published.profile,{agencyId:agency.id,program,origin:buildPublicPortalBaseUrl(agency),published:true,publishedAt:published.at});
    const display = campaignPublicContent(packet, options.audience === 'guardian' ? 'guardian' : 'client');
    sections.push({title:display.programName,fields:display.consent.disclosure.purposes.map(p=>fieldTuple(basicField(`sms_${program}_${p.purpose}`,p.label,'radio',[{value:'yes',label:'Yes'},{value:'no',label:'No'}])))});
    notices.push(`<h3>${escape(display.programName)}</h3><p>${escape(display.consent.disclosure.text)}</p><p>Terms: ${escape(packet.links.termsUrl)}<br>Privacy: ${escape(packet.links.privacyUrl)}</p>`);
  }
  const fields = [{title:'Contact preferences',fields:[fieldTuple(basicField('sms_mobile','Mobile number for selected text messages','tel')),fieldTuple(basicField('sms_authority','Name and relationship / authority of the person choosing these preferences'))]},...sections];
  return doc('communications-preferences','Optional communication preferences',`<h2>Optional communication preferences</h2><p>Choose each message type independently. Nothing is preselected. Leave blank or choose No to decline. Staff must review recorded choices before activating subscriptions. A packet signature does not opt you into every program.</p>${notices.join('')}${sections.length ? sectionsToPaperHtml(fields) : '<p>No client messaging programs are currently published by this agency. Ask staff about available communication options.</p>'}`,sections.length?fields:[]);
}

export async function getEnrollmentPacketDocuments(input = {}) {
  const options = enrollmentPacketOptions(input);
  const {agencyId,channel,audience,service,locale,organizationId} = options;
  const source = await getEnrollmentFoundationSource({agencyId,channel:service==='tutoring'?'tutoring':channel,locale,audience});
  const { agency } = source;
  let organization = null;
  let staffRows = [];
  if (organizationId) {
    const affiliated = await OrganizationAffiliation.hasActiveAffiliation(agencyId, organizationId);
    if (!affiliated && Number(await AgencySchool.getActiveAgencyIdForSchool(organizationId)) !== agencyId) throw fail(403,'School does not belong to this agency');
    organization = await Agency.findById(organizationId);
    if (!organization) throw fail(404,'School not found');
    staffRows = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({schoolOrganizationId:organizationId});
  }
  const providers = service === 'counseling' ? await expandYourCareTeamProviders(await listDisclosureProviders({agencyId,...(organizationId?{schoolOrganizationId:organizationId}:{})}),{agencyId}) : [];
  const master = service==='tutoring' ? await AgencyChannelIntakeMaster.findByAgencyChannelLanguage(agencyId,'tutoring',locale) : channel==='school' ? await AgencySchoolIntakeMaster.findByAgencyLanguage(agencyId,locale) : await AgencyOfficeIntakeMaster.findByAgencyLanguage(agencyId,locale);
  let steps = parse(master?.intake_steps,[]);
  if (!steps.some(s=>eligibleStep(s,audience)&&(s.fields||[]).length)) {
    const fallback=service==='tutoring'?tutoringSteps():audience==='guardian'?buildCounselingDependentEnSteps():buildCounselingSelfEnSteps();
    steps=[...fallback,...steps.filter(step=>step.type==='document')];
  }
  const hasLocalizedIntake = locale !== 'es' || service === 'tutoring' || Boolean(master && parse(master.intake_steps,[]).some(s=>eligibleStep(s,audience)&&(s.fields||[]).length));
  const sections = localizeEnrollmentPacketSections(enrollmentSections(steps,options),locale);
  const {listFoundationDocuments,assertProtectedFoundationSource} = await import('./enrollmentFoundations.service.js');
  const foundations = await listFoundationDocuments({agencyId,channel:service==='tutoring'?'tutoring':channel,locale,audience,html:source.html});
  const generatedKeys = new Set(['intake-questionnaire','consent-summary','signatures','insurance-information']);
  const tokens = {AGENCY_NAME:agency.official_name||agency.name||'Agency',AGENCY_ADDRESS:[agency.street_address,agency.city,agency.state,agency.postal_code].filter(Boolean).join(', '),AGENCY_PHONE:agency.phone_number||'',SCHOOL_NAME:organization?.name||'____________________________',SCHOOL_ADDRESS:organization?[organization.street_address,organization.city,organization.state,organization.postal_code].filter(Boolean).join(', '):'____________________________'};
  const substitute = html => {
    let out = String(html||'');
    for (const [key,value] of Object.entries(tokens)) out=out.split(`{{${key}}}`).join(escape(value));
    return cleanEnrollmentHtml(normalizeEnrollmentCommunicationParagraph(out,locale).split('{{DISCLOSURE_CARE_TEAM}}').join(buildDisclosureCareTeamHtml(providers,locale)).split('{{SCHOOL_STAFF_TABLE}}').join(buildSchoolStaffTableHtml(staffRows,locale)));
  };
  const documents = [doc('enrollment-form',`${service==='tutoring'?'Tutoring':'Counseling'} enrollment · ${audience==='guardian'?'Parent / guardian':'Self enrollment'}`,`<h2>${service==='tutoring'?'Tutoring':'Counseling'} enrollment</h2>${enrollmentPacketLocaleNotice({locale,hasLocalizedIntake})}${sectionsToPaperHtml(sections)}`,sections,Number(master?.version||1))];
  for (const foundation of foundations) {
    if (/^<h1\b/i.test(foundation.headingHtml || '') || generatedKeys.has(foundation.key) || (audience==='self' && foundation.key==='minor-consent') || (channel==='office' && ['school-roi','schoolcarebridge-acknowledgment'].includes(foundation.key))) continue;
    assertProtectedFoundationSource(foundation);
    const fields=enrollmentFoundationSections(foundation.key,{audience,staffRows});
    documents.push({...doc(foundation.key,foundation.title,substitute(foundation.html),fields,foundation.version),foundationKey:foundation.key});
  }
  if (channel==='school' && !documents.some(d=>d.key==='school-roi')) {
    const schoolSource=await getEnrollmentFoundationSource({agencyId,channel:'school',locale,audience});
    const schoolDocs=await listFoundationDocuments({agencyId,channel:'school',locale,html:schoolSource.html});
    const roi=schoolDocs.find(d=>d.key==='school-roi');
    if(roi) {assertProtectedFoundationSource(roi);const fields=enrollmentFoundationSections('school-roi',{audience,staffRows});documents.push({...doc('school-roi',roi.title,substitute(roi.html),fields,roi.version),foundationKey:'school-roi'});}
  }
  if(channel==='school' && !documents.some(d=>d.key==='schoolcarebridge-acknowledgment')) documents.push(doc('schoolcarebridge-acknowledgment','SchoolCareBridge acknowledgment',platformAcknowledgmentSource({channel,locale}).slice(platformAcknowledgmentSource({channel,locale}).indexOf('<h2>SchoolCareBridge'))));
  const insuranceSections=[{title:'Coverage information',fields:[basicField('coverage_type','Coverage','radio',[{value:'medicaid',label:'Medicaid'},{value:'commercial',label:'Commercial insurance'},{value:'self_pay',label:'Self pay / no insurance'}]),basicField('insurance_payer','Insurance company / payer name'),basicField('member_id','Member / Medicaid ID'),basicField('group_number','Group number (if applicable)'),basicField('subscriber_name','Subscriber name'),basicField('subscriber_dob','Subscriber date of birth','date'),basicField('subscriber_relationship','Relationship to client'),basicField('secondary_insurance','Secondary insurance company and member ID (if any)')].map(fieldTuple)}];
  const insuranceSource=foundations.find(d=>d.key==='insurance-information');
  documents.push(doc('insurance-information','Insurance and payment information',`<h2>Insurance and payment information</h2><p><strong>If you have Medicaid, do not write payment-card or bank details on this form. Please still provide your insurance information.</strong> Do not include card numbers, security codes or bank account information in this packet. Other payment arrangements can be made directly with the agency.</p><p>Provide copies or photos of the front and back of every current insurance card through the secure client portal, or bring them to the office. Contact ${escape(agency.support_team_email||agency.phone_number||'the agency')} for a secure submission method. Tutoring coverage, if any, must be confirmed with the agency and payer.</p>${insuranceSource?substitute(insuranceSource.html).replace(/<h2[^>]*>[\s\S]*?<\/h2>/i,''):''}${sectionsToPaperHtml(insuranceSections)}`,insuranceSections,Number(insuranceSource?.version||1)));
  documents.push(enrollmentCampaignDocument(agency,options));
  if(service==='counseling') {
    const masterFields=parse(master?.intake_steps,[]).filter(step=>eligibleStep(step,audience)).flatMap(step=>step.fields||[]);
    const selectScreen=(instrument,builder,count)=>{
      const current=masterFields.filter(field=>field.instrument===instrument&&field.type!=='info');
      if (locale === 'es') {
        const spanishBuilder = {phq9:buildPhq9FieldsEs,gad7:buildGad7FieldsEs,psc17:buildPsc17FieldsEs}[instrument];
        // A Spanish master may be an old English clone. Locale alone is not
        // evidence of translated instrument text. Use the published edition;
        // retain required/conditional settings by the stable question key.
        return {fields:spanishBuilder().map(field=>fieldTuple({...field,
          ...current.find(item=>(item.key||item.id)===field.key),
          key:field.key,label:field.label,helperText:field.helperText,options:field.options,
          instrument:field.instrument
        })),localized:true};
      }
      return current.length>=count?{fields:current.map(fieldTuple),localized:true}:{fields:builder().map(fieldTuple),localized:locale!=='es'};
    };
    const selected=audience==='guardian'?[selectScreen('psc17',buildPsc17Fields,17)]:[selectScreen('phq9',buildPhq9Fields,9),selectScreen('gad7',buildGad7Fields,7)];
    const hasLocalizedScreens=selected.every(screen=>screen.localized);
    const screenSections=localizeEnrollmentPacketSections(audience==='guardian' ? [{title:'PSC-17 · Parent / guardian report for children',fields:selected[0].fields}] : [{title:'PHQ-9',fields:selected[0].fields},{title:'GAD-7',fields:selected[1].fields}],locale);
    const screenHtml=screenSections.map(section=>{
      const source=locale==='es'?SPANISH_SCREEN_SOURCES[section.fields[0]?.[2]?.instrument]:null;
      return sectionsToPaperHtml([section])+(source?`<p class="screen-source">${escape(source.attribution)} <a href="${escape(source.url)}">${escape(source.title)}</a></p>`:'');
    }).join('');
    documents.push(doc('screening-questionnaires',audience==='guardian'?'PSC-17':'PHQ-9 and GAD-7',`<h2>${audience==='guardian'?'PSC-17':'PHQ-9 and GAD-7'}</h2>${enrollmentPacketLocaleNotice({locale,hasLocalizedScreens})}<p>${audience==='guardian'?'Complete for a child only; an adult dependent requires age-appropriate screening selected by the clinician.':'Complete these questionnaires about yourself.'} These screens support clinician review and do not establish a diagnosis. You may discuss answers with your provider. These forms are not monitored for emergencies; call 911 for an emergency or call/text 988 for immediate crisis support in the U.S.</p>${screenHtml}`,screenSections));
  }
  for(const step of steps.filter(s=>s.type==='document'&&eligibleStep(s,audience))) {
    const template=await DocumentTemplate.findById(Number(step.templateId||step.template_id));
    if(!template||template.is_active===false||template.is_active===0||(template.agency_id&&Number(template.agency_id)!==agencyId)) throw fail(409,'An enrollment source document is unavailable. Ask an administrator to update the enrollment master.');
    const key=`agency-document-${template.id}`;
    if(documents.some(d=>d.key===key))continue;
    if(template.html_content)documents.push(doc(key,template.name||'Agency document',substitute(template.html_content),[],Number(template.version||1)));
    else if(template.file_path)documents.push({...doc(key,template.name||'Agency document','<p>This document is supplied as an attachment in the complete enrollment packet.</p>',[],Number(template.version||1)),attachmentPath:template.file_path});
  }
  for(let index=0;index<documents.length;index++){
    const item=documents[index];
    const notice=item.key==='communications-preferences'&&item.sections.length?enrollmentPacketLocaleNotice({locale,hasLocalizedCommunications:false}):'';
    const paperHtml=item.key==='school-roi'?item.html.replace(/(<li[^>]*>\s*)(Deny|Denegar)(?=\s)/gi,'$1☐ $2'):item.html;
    const html=translateEnrollmentPacketHtml(notice+paperHtml,locale).replace(/<div\b[^>]*class=["'][^"']*\bpage-break\b[^"']*["'][^>]*>\s*<\/div>/gi,'');
    documents[index]={...item,...doc(item.key,enrollmentPacketText(item.title,locale),html,localizeEnrollmentPacketSections(item.sections,locale),item.version)};
  }
  const manifest=documents.map(d=>`<li>${escape(d.title)} · v${d.version}</li>`).join('');
  documents.push(doc('packet-acknowledgment','Packet acknowledgment and receipt',`<h2>Packet acknowledgment and receipt</h2><p>I received the complete documents listed below, had an opportunity to ask questions, and acknowledge the applicable enrollment consents and notices. I may retain the full packet. My signature records the choices I made; it does not select optional message programs. The school release of information is a separate authorization and retains its own signature.</p><ul>${manifest}</ul><p>Client / learner name: _____________________________________</p><p>${audience==='guardian'?'Parent / guardian name and authority':'Client name'}: _____________________________________</p><p>Signature: _____________________________________ Date: __________________</p>${audience==='guardian'?'<p>Additional guardian signature, if applicable: _____________________ Date: ______________</p>':''}<p>Copy provided by: ☐ Paper ☐ Secure portal ☐ Requested email attachment</p>`));
  const receipt=documents[documents.length-1];
  documents[documents.length-1]=doc(receipt.key,enrollmentPacketText(receipt.title,locale),translateEnrollmentPacketHtml(receipt.html,locale),[],receipt.version);
  return {documents,sections,agency,organization,staffRows,providers,options,version:Number(source.version||1),generatedAt:new Date()};
}

export async function buildEnrollmentPacketContext(input={}) {
  const data=await getEnrollmentPacketDocuments(input);
  const {options,agency,organization}=data;
  const title=`${options.service==='tutoring'?'Tutoring':'Counseling'} · ${options.channel==='school'?'School':'Office / virtual'} · ${options.audience==='guardian'?'Guardian':'Self enrollment'}`;
  const brand=await resolvePacketBrandChrome(agency,{packetKind:options.channel});
  const templateHtml=data.documents.map(d=>`<section class="enrollment-document" data-document-key="${escape(d.key)}">${d.html}</section>`).join('');
  return {...data,title,templateHtml,brand,locale:options.locale,variant:options.audience==='guardian'?'parent':'self',agencyId:agency.id,agency:{...agency,name:agency.official_name||agency.name,address:[agency.street_address,agency.city,agency.state,agency.postal_code].filter(Boolean).join(', '),phone:agency.phone_number||''},organization:organization?{...organization,address:[organization.street_address,organization.city,organization.state,organization.postal_code].filter(Boolean).join(', ')}:{name:'School: ____________________________',address:'',id:null},packetVersionLabel:brand.versionLabel||'1.0'};
}

export function buildEnrollmentPacketHtml(context) {
  return translateEnrollmentPacketHtml(`<!doctype html><html lang="${context.locale}"><head><meta charset="utf-8"><title>${escape(context.title)}</title><style>${buildPacketStyleBlock(context.brand)} .enrollment-document{break-before:page}.enrollment-document:first-of-type{break-before:auto}.enrollment-document[data-document-key="auricwell-acknowledgment"],.enrollment-document[data-document-key="schoolcarebridge-acknowledgment"]{break-before:auto}.enrollment-document>h2{break-after:avoid}.paper-help{display:inline-block}body{background:#fff}.paper-field{break-inside:avoid;margin:0 2% 12px 0;display:inline-block;vertical-align:top;width:48%}.paper-field.paper-wide{width:100%;margin-right:0}.screen-table th:first-child{width:48%}.screen-table th{font-size:9pt}.screen-table td{font-size:10pt}.screen-table .screen-choice{text-align:center}.screen-table tr{break-inside:avoid}.packet-body .screen-table{margin-bottom:4px}.packet-body .screen-source{font-size:8pt;line-height:1.35;margin:4px 0 8px;break-inside:avoid}.enrollment-language-notice{border-left:3px solid #b47a42;padding:6px 12px;margin:12px 0}.enrollment-language-notice p{font-size:10pt}.paper-field p{margin:4px 0}.paper-line{border-bottom:1px solid #7f8f89;min-height:22px}.paper-long{min-height:44px}.paper-choices{display:flex;gap:8px 18px;flex-wrap:wrap}.paper-help{font-size:9pt;color:#50615b}.packet-brand{border-bottom:2px solid #174f45;padding-bottom:12px}.packet-brand strong{font-size:20pt}.packet-brand small{display:block}.enrollment-document>h2{font-size:18pt}</style></head><body><main class="packet-body"><header class="packet-brand"><strong>AuricWell</strong>${context.options.channel==='school'?' · SchoolCareBridge':''}<small>${escape(context.agency.name)}</small><h1>${escape(context.title)}</h1><p>Generated ${context.generatedAt.toISOString().slice(0,10)} · Complete packet: keep a copy of every document.</p>${context.options.channel==='school'?`<p>${escape(context.organization.name)}</p>`:''}</header>${context.templateHtml}</main></body></html>`,context.locale);
}
export async function generateEnrollmentPacketPdf(input={}) {
  return generateEnrollmentPacketPdfFromContext(await buildEnrollmentPacketContext(input));
}
export async function generateEnrollmentPacketPdfFromContext(context) {
  const {headerTemplate,footerTemplate}=buildPdfChromeTemplates(context);
  const bytes=await DocumentSigningService.convertHTMLToPDF(buildEnrollmentPacketHtml(context),{printBackground:true,margin:{top:'0.75in',right:'0.5in',bottom:'0.6in',left:'0.5in'},displayHeaderFooter:true,headerTemplate,footerTemplate,disableFallback:true});
  const pdf=await PDFDocument.load(bytes);
  for(const attachment of context.documents.filter(d=>d.attachmentPath)) {
    const path=String(attachment.attachmentPath);
    const raw=path.includes('/templates/') || !path.includes('/') ? await StorageService.readTemplate(path.split('/').pop()) : await StorageService.readObject(path.replace(/^\/uploads\//,''));
    let extra;try{extra=await PDFDocument.load(raw);}catch{throw fail(409,`Enrollment attachment "${attachment.title}" must be a PDF to include in the printable packet`);}
    for(const page of await pdf.copyPages(extra,extra.getPageIndices()))pdf.addPage(page);
  }
  return Buffer.from(await pdf.save());
}
