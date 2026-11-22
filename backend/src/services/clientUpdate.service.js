import { prepareGuardianConsentUpdates } from './guardianConsentUpdateRequests.service.js';
import crypto from 'crypto';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { ASSESSMENT_FAMILIES, getFamilyMeta } from './assessmentFamilyRegistry.js';
import { canAssignFamilyAssessment, familyAssessmentChoices, familyOutcomeMeasure, familySharingSchool, isCurrentFamilyDocument } from './familySharingCatalog.js';
import { hasRecordedGuardianSigningAuthority } from './schoolRoiGuardianConsent.service.js';
import { normalizeUpdateSelection, PORTAL_STEPS } from './clientUpdateSelection.js';
import { absolutePortalPath, listOpenShareEvents } from './portalShareNotice.service.js';
import {escapePortalHtml,portalMessageHtml} from './portalEmailBranding.service.js';
import {schoolCareBridgeDeployment} from './schoolCareBridgeRouting.service.js';
import Agency from '../models/Agency.model.js';
import {buildSmartDisclosureContext} from './smartDisclosure.service.js';

export const clientUpdatesEnabled=(env=process.env)=>env.CLIENT_UPDATE_WORKFLOWS_ENABLED==='true';
function assertEnabled(){if(!clientUpdatesEnabled())throw fail(503,'Client updates are on hold while delivery and portal access are reviewed.');}

const FAMILY_TABLES = new Set(ASSESSMENT_FAMILIES.map((family) => family.table));

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function singleClientUpdateMailbox(value) {
  if(typeof value!=='string'||/[\r\n]/.test(value))return false;
  const email=value.trim();
  return email.length<=254&&email.split('@')[0].length<=64
    &&/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(email);
}

function publicOrigin() {
  return String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || process.env.APP_PUBLIC_URL || 'https://plottwisthq.com').replace(/\/+$/, '');
}

function intakeUrl(publicKey) {
  const key = String(publicKey || '').trim();
  return key ? `${publicOrigin()}/intake/${encodeURIComponent(key)}` : null;
}

async function loadRequest(id) {
  const [rows] = await pool.execute(`SELECT * FROM client_update_requests WHERE id = ? LIMIT 1`, [Number(id)]);
  return rows?.[0] || null;
}

async function loadItems(requestId) {
  const [rows] = await pool.execute(
    `SELECT * FROM client_update_items WHERE request_id = ? ORDER BY id ASC`,
    [Number(requestId)]
  );
  return rows || [];
}

export async function findUpdateByPacketPublicKey(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM client_update_requests
     WHERE packet_public_key = ?
     ORDER BY id DESC LIMIT 1`,
    [key]
  );
  return rows?.[0] || null;
}

export async function listUpdateCatalog(agencyId) {
  if(!clientUpdatesEnabled())return {enabled:false,documents:[],assessments:[],portalSteps:[]};
  const aid = Number(agencyId);
  const [templates] = await pool.execute(
    `SELECT id, name, version, document_type FROM document_templates
     WHERE is_active = 1 AND COALESCE(is_archived,0)=0
       AND (agency_id = ? OR agency_id IS NULL)
       AND (organization_id IS NULL OR organization_id = ?)
       AND document_type IN (
         'acknowledgment','authorization','agreement','compliance','disclosure','consent',
         'audio_recording_consent','hipaa_security','school'
       )
     ORDER BY name ASC, version DESC, id DESC`,
    [aid, aid]
  );
  const seen = new Set();
  const documents = [];
  for (const row of templates || []) {
    if (!isCurrentFamilyDocument(row)) continue;
    const name = String(row.name || `Document ${row.id}`).trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    documents.push({ id: Number(row.id), name });
  }
  return {
    enabled:true,
    documents,
    assessments: familyAssessmentChoices(),
    portalSteps: PORTAL_STEPS
  };
}

export async function listClientUpdates(clientId, agencyId) {
  const params = [Number(clientId)];
  let sql = `SELECT * FROM client_update_requests WHERE client_id = ?`;
  if (Number(agencyId)) {
    sql += ` AND agency_id = ?`;
    params.push(Number(agencyId));
  }
  sql += ` ORDER BY id DESC LIMIT 20`;
  const [rows] = await pool.execute(sql, params);
  const updates = [];
  for (const row of rows || []) {
    updates.push({ ...row, items: await loadItems(row.id) });
  }
  return updates;
}

async function templateName(id, agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, name, agency_id, document_type FROM document_templates
     WHERE id = ? AND is_active = 1 AND COALESCE(is_archived,0)=0 AND (agency_id = ? OR agency_id IS NULL)
       AND (organization_id IS NULL OR organization_id = ?)
       AND document_type IN (
         'acknowledgment','authorization','agreement','compliance','disclosure','consent',
         'audio_recording_consent','hipaa_security','school'
       )
     LIMIT 1`,
    [Number(id), Number(agencyId), Number(agencyId)]
  );
  return rows?.[0] && isCurrentFamilyDocument(rows[0]) ? rows[0] : null;
}

function assertOutcomeRecipient(measure, recipient, boundRecipientId) {
  if (!recipient || Number(recipient.guardian_user_id) !== Number(boundRecipientId)) {
    throw fail(400, 'Select the linked portal account that will complete this assessment.');
  }
  const self = recipient.role === 'client' && recipient.relationship_type === 'self';
  if (measure.respondent === 'self' ? !self : !['guardian', 'client_guardian'].includes(recipient.role) || recipient.relationship_type === 'self') {
    throw fail(400, measure.respondent === 'self'
      ? `Assign ${measure.title} to the client’s own portal account.`
      : `Assign ${measure.title} to an authorized parent or guardian.`);
  }
}

function assertOutcomeRecipients(items, recipient, boundRecipientId) {
  for (const item of items) {
    const measure = item.item_type === 'assessment' && familyOutcomeMeasure(item.reference_key);
    if (measure) assertOutcomeRecipient(measure, recipient, boundRecipientId);
  }
}

export async function createClientUpdate({ agencyId, clientId, body = {}, actorUserId = null }) {
  assertEnabled();
  const selection = normalizeUpdateSelection(body);
  const client = await Client.findById(Number(clientId), { includeSensitive: true });
  if (!client) throw fail(404, 'Client not found');
  if (Number(client.agency_id) !== Number(agencyId)) throw fail(403, 'Client does not belong to this agency');
  if(['ARCHIVED','DECLINED'].includes(String(client.status||'').toUpperCase()))throw fail(409,'Review the current client record before requesting updates.');

  let recipientId=null;
  let recipient;
  if(body.guardianUserId!=null){
    recipientId=Number(body.guardianUserId);
    if(!Number.isSafeInteger(recipientId)||recipientId<1)throw fail(400,'Select a linked portal account.');
    ({ recipient } = await currentClientUpdateRecipient({agencyId,clientId,to:body.guardianEmail,guardianUserId:recipientId}));
  }

  const documentRows = [];
  for (const id of selection.documents) {
    const template = await templateName(id, agencyId);
    if (!template) throw fail(400, 'Choose an active document template for this agency.');
    documentRows.push(template);
  }
  const assessmentRows = [];
  const seenFamilies = new Set();
  for (const family of selection.assessments) {
    const outcomeMeasure = familyOutcomeMeasure(family);
    if (outcomeMeasure) {
      assertOutcomeRecipient(outcomeMeasure, recipient, recipientId);
      assessmentRows.push({ family, title: outcomeMeasure.title });
      continue;
    }
    const meta = getFamilyMeta(family);
    if (!meta || !canAssignFamilyAssessment(family)) throw fail(400, 'This assessment is not ready for family assignment.');
    if (seenFamilies.has(meta.family)) continue;
    seenFamilies.add(meta.family);
    assessmentRows.push(meta);
  }

  const inserts = [
    ...documentRows.map((template) => ['document', String(template.id), template.name]),
    ...assessmentRows.map((meta) => ['assessment', meta.family, meta.title]),
    ...selection.portalSteps.map((key) => {
      const step = PORTAL_STEPS.find((item) => item.key === key);
      return [key, key, step.title];
    })
  ];
  const connection = await pool.getConnection();
  let requestId;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO client_update_requests (agency_id, client_id, status, created_by_user_id, guardian_user_id)
       VALUES (?, ?, 'draft', ?, ?)`,
      [Number(client.agency_id), Number(client.id), actorUserId ? Number(actorUserId) : null,recipientId]
    );
    requestId = result.insertId;
    for (const [itemType, referenceKey, title] of inserts) {
      await connection.execute(
        `INSERT INTO client_update_items (request_id, item_type, reference_key, title)
         VALUES (?, ?, ?, ?)`,
        [requestId, itemType, referenceKey, title]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return loadRequest(requestId);
}

async function ensureDocumentPacket(request, items, actorUserId) {
  const documents = items.filter((item) => item.item_type === 'document');
  if (!documents.length) return request;
  if (request.packet_public_key) return request;
  const reenrollment=request.purpose==='reenrollment';
  const packet=reenrollment?(typeof request.packet_config_json==='string'?JSON.parse(request.packet_config_json):request.packet_config_json):null;
  const ids = documents.map((item) => Number(item.reference_key)).filter((id) => id > 0);
  const [[templateLocale]]=await pool.execute('SELECT language_code FROM document_templates WHERE id=?',[ids[0]]);
  const publicKey = (reenrollment?'reenroll-':'')+crypto.randomBytes(24).toString('hex');
  const client=await Client.findById(request.client_id,{includeSensitive:true});
  if(!client||Number(client.agency_id)!==Number(request.agency_id)||(!reenrollment&&['ARCHIVED','DECLINED'].includes(String(client.status||'').toUpperCase())))throw fail(409,'Review the current client record before requesting documents.');
  let schoolId=null;
  if(!reenrollment&&String(client.client_type||'').toLowerCase()==='school'&&Number(client.organization_id)) {
    const [[school]]=await pool.execute(`SELECT s.id FROM agencies s WHERE s.id=? AND s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
      AND (EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.organization_id=s.id AND f.agency_id=? AND f.is_active=1)
      OR EXISTS(SELECT 1 FROM agency_schools legacy WHERE legacy.school_organization_id=s.id AND legacy.agency_id=? AND legacy.is_active=1))`,[client.organization_id,request.agency_id,request.agency_id]);
    if(!school)throw fail(409,'Review the client’s current school affiliation first.');
    schoolId=Number(school.id);
  }
  await IntakeLink.create({
    publicKey,
    title: reenrollment?'Re-enrollment package':'Documents to complete',
    description: 'Selected documents for an existing client. This does not start a new enrollment.',
    scopeType: schoolId?'school':'agency',
    formType: 'intake',
    languageCode: templateLocale?.language_code==='es'?'es':'en',
    organizationId: schoolId||Number(request.agency_id),
    isActive: true,
    createClient: true,
    createGuardian: false,
    requiresAssignment: false,
    customMessages:{clientUpdateRequestId:Number(request.id),...(reenrollment?{reenrollment:true}:{})},
    intakeFields:packet?.fields||null,
    allowedDocumentTemplateIds: ids,
    intakeSteps: packet?.steps||documents.map((item) => ({
      type: 'document',
      templateId: Number(item.reference_key),
      title: item.title
    })),
    createdByUserId: actorUserId || null
  });
  const deployment=schoolId?schoolCareBridgeDeployment():null;
  const href = deployment?`${deployment.origin}${deployment.basePath}/intake/${encodeURIComponent(publicKey)}`:intakeUrl(publicKey);
  await pool.execute(
    `UPDATE client_update_requests SET packet_public_key = ? WHERE id = ?`,
    [publicKey, request.id]
  );
  await pool.execute(
    `UPDATE client_update_items SET public_key = ?, href = ? WHERE request_id = ? AND item_type = 'document'`,
    [publicKey, href, request.id]
  );
  return loadRequest(request.id);
}

async function ensureAssessments(request, items, actorUserId) {
  const pending = items.filter((item) => item.item_type === 'assessment' && !item.assessment_id && !familyOutcomeMeasure(item.reference_key));
  if (!pending.length) return;
  const { assignAssessmentToClient } = await import('./assessmentAssign.service.js');
  const [agencies] = await pool.execute(`SELECT slug FROM agencies WHERE id = ? LIMIT 1`, [request.agency_id]);
  for (const item of pending) {
    const assigned = await assignAssessmentToClient({
      family: item.reference_key,
      agencyId: Number(request.agency_id),
      clientId: Number(request.client_id),
      coachUserId: actorUserId || null,
      organizationSlug: agencies?.[0]?.slug || '',
      notify: false
    });
    const href = absolutePortalPath(assigned.brandedPath || assigned.shortPath);
    await pool.execute(
      `UPDATE client_update_items
       SET assessment_id = ?, access_token = ?, href = ?
       WHERE id = ?`,
      [Number(assigned.assessment?.id) || null, assigned.accessToken || null, href, item.id]
    );
  }
}

export async function assignmentRecipients(clientId, agencyId) {
  const {requirePaymentAuthorizationLink} = await import('./familyBillingPolicy.service.js');
  const contacts = [];
  let medicaidCoverage;
  for (const row of await ClientGuardian.listForClient(clientId)) {
    if (!singleClientUpdateMailbox(row.email) || Number(row.access_enabled) !== 1 || Number(row.is_active) !== 1 || Number(row.is_archived) || row.terminated_at) continue;
    if(!['client_guardian','guardian','client'].includes(row.role) || row.permissions_json?.noContact || row.permissions_json?.contactRestricted || row.permissions_json?.revoked || row.permissions_json?.relationshipRevoked)continue;
    const id = Number(row.guardian_user_id);
    const contact = {id, name: [row.first_name,row.last_name].filter(Boolean).join(' '), email: row.email, kind: row.relationship_type === 'self' ? 'client' : 'guardian', forms:false, billing:false};
    if (hasRecordedGuardianSigningAuthority(row)) contact.recordedSigningAuthority = true;
    try { await currentClientUpdateRecipient({agencyId,clientId,to:row.email,guardianUserId:id}); contact.forms=true; }
    catch (e) { if (![403,404,409].includes(e.status)) throw e; }
    try {
      const link=await requirePaymentAuthorizationLink(id,clientId,agencyId);
      if (medicaidCoverage === undefined && !link.tutoringAuthorizationOnly) {
        const { readClientInsurance } = await import('./clientInsurance.service.js');
        const { hasMedicaidCoverage } = await import('../utils/insurancePaymentPolicy.js');
        medicaidCoverage = hasMedicaidCoverage(await readClientInsurance(clientId,agencyId));
      }
      contact.billing=true;
      contact.cardAllowed=!link.tutoringAuthorizationOnly && !medicaidCoverage;
    }
    catch (e) { if (![403,404].includes(e.status)) throw e; }
    if (contact.forms || contact.billing) contacts.push(contact);
  }
  return contacts;
}

/** Existing portal authority only. Operational email eligibility never grants
 * access to a clinical document, account or relationship. Reused at transport. */
export async function currentClientUpdateRecipient({agencyId,clientId,to,guardianUserId=null,reenrollment=false}) {
  if(!reenrollment)assertEnabled();
  const client=await Client.findById(Number(clientId),{includeSensitive:true});
  if(!client||Number(client.agency_id)!==Number(agencyId))throw fail(403,'The update is outside this client’s agency.');
  if(!singleClientUpdateMailbox(to))throw fail(409,'Choose one valid saved portal contact email address.');
  const address=to.trim().toLowerCase();
  const matches=(await ClientGuardian.listForClient(clientId)).filter(row=>singleClientUpdateMailbox(row.email)&&row.email.trim().toLowerCase()===address
    && (!guardianUserId||Number(row.guardian_user_id)===Number(guardianUserId))
    && Number(row.access_enabled)===1 && Number(row.is_active)===1
    && ['client','client_guardian','guardian'].includes(row.role)
    && ![row.permissions_json?.canReceiveNotifications===false,row.permissions_json?.noContact,row.permissions_json?.no_contact,row.permissions_json?.contactRestricted,row.permissions_json?.revoked,row.permissions_json?.relationshipRevoked,!!row.revoked_at].some(Boolean)
    && !['ARCHIVED','TERMINATED','TERMINATED_PENDING','INACTIVE','INACTIVE_EMPLOYEE'].includes(String(row.status||'').toUpperCase())
    && !ClientGuardian.isNoView(row.permissions_json));
  if(matches.length!==1)throw fail(409,'Choose a currently authorized portal contact. Review portal access in the client profile first.');
  const recipient=matches[0];
  const {assertClientCanViewOwnShared}=await import('./assessmentDeliverable.service.js');
  await assertClientCanViewOwnShared({user:{id:recipient.guardian_user_id,role:recipient.role},clientId,...(reenrollment?{allowEndedServices:true}:{})});
  return {client,recipient};
}

export async function sendClientUpdate(requestId, { actorUserId, guardianEmail } = {}) {
  assertEnabled();
  const request = await loadRequest(requestId);
  if (!request) throw fail(404, 'Update request not found');
  const items = await loadItems(request.id);
  if (request.purpose==='reenrollment')return sendSingleClientUpdate(requestId,{actorUserId,guardianEmail});
  if (!items.some(item => item.item_type === 'document')) return sendSingleClientUpdate(requestId, { actorUserId, guardianEmail });
  const { recipient } = await currentClientUpdateRecipient({ agencyId: request.agency_id, clientId: request.client_id, to: guardianEmail, guardianUserId: request.guardian_user_id });
  assertOutcomeRecipients(items, recipient, request.guardian_user_id);
  const recipients = await prepareGuardianConsentUpdates({ request, items, primaryGuardianUserId: recipient.guardian_user_id });
  if (!recipients) return sendSingleClientUpdate(requestId, { actorUserId, guardianEmail });
  const deliveries = [];
  for (const row of recipients) {
    if (row.status !== 'draft') {
      deliveries.push({ ...row, deliveryStatus: ['sent', 'completed'].includes(row.status) ? 'already_sent' : 'pending' });
      continue;
    }
    try {
      const result = await sendSingleClientUpdate(row.requestId, { actorUserId, guardianEmail: row.email });
      deliveries.push({ ...row, deliveryStatus: result.deliveryStatus });
    } catch (error) { deliveries.push({ ...row, deliveryStatus: 'needs_followup', error: error.message }); }
  }
  return { request: await loadRequest(requestId), items: await loadItems(requestId), deliveries,
    deliveryStatus: deliveries.every(row => ['sent', 'already_sent'].includes(row.deliveryStatus)) ? 'sent' : 'needs_followup' };
}

export async function sendReenrollmentUpdate(requestId,options){
 const request=await loadRequest(requestId);
 if(request?.purpose!=='reenrollment')throw fail(403,'A staff-issued re-enrollment package is required.');
 return sendSingleClientUpdate(requestId,options);
}

async function sendSingleClientUpdate(requestId, { actorUserId, guardianEmail } = {}) {
  const request = await loadRequest(requestId);
  const reenrollment=request?.purpose==='reenrollment';
  if(!reenrollment)assertEnabled();
  if (!request) throw fail(404, 'Client update not found');
  if(request.status!=='draft')throw fail(409,'Delivery has already been attempted. Check email history before creating another update.');
  const {client,recipient}=await currentClientUpdateRecipient({agencyId:request.agency_id,clientId:request.client_id,to:guardianEmail,guardianUserId:request.guardian_user_id,reenrollment});
  const items = await loadItems(request.id);
  assertOutcomeRecipients(items, recipient, request.guardian_user_id);
  const {familyNotificationDeliveryGate}=await import('./familyNotificationChoices.service.js');
  const gate=await familyNotificationDeliveryGate({agencyId:request.agency_id,clientId:request.client_id,to:recipient.email,templateType:reenrollment?'care_reenrollment':'client_update'});
  if(!gate.allowed)throw fail(409,'This contact’s email preferences do not allow an update notice.');
  const [claim]=await pool.execute("UPDATE client_update_requests SET status='in_progress',guardian_user_id=?,sent_at=UTC_TIMESTAMP() WHERE id=? AND status='draft'",[recipient.guardian_user_id,request.id]);
  if(!claim.affectedRows)throw fail(409,'Delivery has already been attempted. Check email history.');
  const prepared = await ensureDocumentPacket(request, items, actorUserId);
  await ensureAssessments(prepared, items, actorUserId);
  const delivery=await notifyUpdateRecipient({request,client,recipient,actorUserId,reenrollment});
  const sent=!!delivery?.id&&!delivery.redirected&&!delivery.queued&&!delivery.pendingApproval&&!delivery.blocked&&!delivery.skipped;
  if(sent)await pool.execute("UPDATE client_update_requests SET status='sent' WHERE id=? AND status='in_progress'",[request.id]);
  return {request:await loadRequest(request.id),items:await loadItems(request.id),delivery,
    deliveryStatus:delivery?.blocked||delivery?.skipped?'skipped':delivery?.redirected?'redirected':delivery?.pendingApproval||delivery?.queued?'queued':sent?'sent':'unconfirmed'};
}

/** Attach selected updates to an authorized portal without sending a second email. */
export async function assignClientUpdateToPortal(requestId, { actorUserId, guardianUserId } = {}) {
  assertEnabled();
  const request=await loadRequest(requestId);
  if(!request||request.status!=='draft')throw fail(409,'Review this document assignment before attaching it.');
  const links=await ClientGuardian.listForClient(request.client_id);
  const recipient=links.find(link=>Number(link.guardian_user_id)===Number(guardianUserId));
  if(!recipient)throw fail(403,'Select a currently authorized portal account.');
  await currentClientUpdateRecipient({agencyId:request.agency_id,clientId:request.client_id,to:recipient.email,guardianUserId});
  const items=await loadItems(requestId);
  assertOutcomeRecipients(items, recipient, request.guardian_user_id);
  const [claim]=await pool.execute("UPDATE client_update_requests SET status='in_progress',guardian_user_id=?,sent_at=UTC_TIMESTAMP() WHERE id=? AND status='draft'",[guardianUserId,requestId]);
  if(!claim.affectedRows)throw fail(409,'This document assignment changed. Refresh before continuing.');
  await ensureDocumentPacket(request,items,actorUserId);
  await ensureAssessments(request,items,actorUserId);
  return {request:await loadRequest(requestId),items:await loadItems(requestId),invitationSent:false};
}

/** Bind the current living disclosure, never a legacy PDF with a similar name. */
export async function assignSmartDisclosureToPortal({agencyId,clientId,guardianUserId,locale,contentHash,actorUserId,assignedTeamOnly=false,schoolCityId,useRecordedAuthority=false}) {
  assertEnabled();
  if(!['en','es'].includes(locale)||!/^[a-f0-9]{40}$/.test(String(contentHash||'')))throw fail(400,'Review the current disclosure and language before assigning it.');
  const client=await Client.findById(clientId,{includeSensitive:true});
  if(!client||Number(client.agency_id)!==Number(agencyId))throw fail(403,'The disclosure is outside this client’s agency.');
  const [contact]= (await ClientGuardian.listForClient(clientId)).filter(row=>Number(row.guardian_user_id)===Number(guardianUserId));
  await currentClientUpdateRecipient({agencyId,clientId,to:contact?.email,guardianUserId});
  const school = schoolCityId ? await familySharingSchool(client) : null;
  if (schoolCityId && Number(school?.id) !== Number(schoolCityId)) throw fail(409, 'The client’s school changed. Open the disclosure again.');
  const organizationId = school?.id || client.organization_id;
  const agency = await Agency.findById(agencyId);
  const organization = organizationId ? await Agency.findById(organizationId) : null;
  const customMessages = school ? { disclosureSchoolCityId: Number(school.id) } : assignedTeamOnly ? { disclosureAssignedTeamOnly: true } : {};
  const current=await buildSmartDisclosureContext({boundClient:client,agency,organization,locale,link:{form_type:'smart_disclosure',language_code:locale,...(Object.keys(customMessages).length?{custom_messages:customMessages}:{})}});
  if(!current||current.locale!==locale||current.contentHash!==contentHash||((assignedTeamOnly||school)&&!current.providers?.length))throw fail(409,'The disclosure or care team changed. Refresh the invitation preview before attaching it.');
  const reference=`smart_disclosure:${locale}:${contentHash}`;
  const city = String(school?.city || school?.name || '').trim();
  const title = school ? (locale === 'es' ? `Declaración de divulgación escolar · ${city}` : `School disclosure · ${city}`)
    : locale==='es'?'Declaración de divulgación actualizada':'Updated disclosure statement';
  const connection=await pool.getConnection();let requestId,publicKey,reused=false,superseded=[];
  try{
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[clientId,agencyId]);
    const [[link]]=await connection.execute('SELECT access_enabled,permissions_json FROM client_guardians WHERE client_id=? AND guardian_user_id=? FOR UPDATE',[clientId,guardianUserId]);
    if(Number(link?.access_enabled)!==1||ClientGuardian.isNoView(link.permissions_json))throw fail(403,'This account is no longer authorized for clinical documents.');
    if (useRecordedAuthority && !hasRecordedGuardianSigningAuthority(link)) throw fail(409, 'Review and confirm the recipient’s signing authority.');
    const [items]=await connection.execute(`SELECT r.id AS request_id,r.packet_public_key,i.reference_key,i.title,i.item_type,i.status,
      JSON_EXTRACT(packet.custom_messages,'$.disclosureSchoolCityId') AS disclosure_school_city_id,
      EXISTS(SELECT 1 FROM intake_submissions s JOIN intake_links l ON l.id=s.intake_link_id WHERE l.public_key=r.packet_public_key AND s.submitted_at IS NOT NULL) AS submitted
      FROM client_update_requests r JOIN client_update_items i ON i.request_id=r.id
      LEFT JOIN intake_links packet ON packet.public_key=r.packet_public_key
      WHERE r.agency_id=? AND r.client_id=? AND r.guardian_user_id=? AND r.status IN ('sent','in_progress')`,[agencyId,clientId,guardianUserId]);
    const disclosureItem=item=>item.item_type==='document'&&Boolean(Number(item.disclosure_school_city_id))===Boolean(school)
      &&(/^(smart_disclosure:)/.test(item.reference_key)||/disclosure|divulgaci[oó]n/i.test(item.title));
    const matchesCurrent=item=>Number(item.disclosure_school_city_id||0)===Number(school?.id||0)&&item.reference_key===reference;
    const staleRequests=new Set(items.filter(item=>disclosureItem(item)&&!matchesCurrent(item)&&item.status==='pending').map(item=>Number(item.request_id)));
    for(const id of staleRequests){const requestItems=items.filter(item=>Number(item.request_id)===id);if(requestItems.some(item=>!disclosureItem(item)||Number(item.submitted)))throw fail(409,'An earlier disclosure is part of another update or already submitted. Review that update before replacing its pending disclosure.');}
    const existing=items.find(item=>disclosureItem(item)&&matchesCurrent(item)&&item.status==='pending');
    if(existing){requestId=Number(existing.request_id);publicKey=existing.packet_public_key;reused=true;}
    else{
      const [created]=await connection.execute("INSERT INTO client_update_requests (agency_id,client_id,guardian_user_id,status,created_by_user_id) VALUES (?,?,?,'draft',?)",[agencyId,clientId,guardianUserId,actorUserId]);
      requestId=created.insertId;publicKey=crypto.randomBytes(24).toString('hex');
      const packetSchoolId=school?.id||(String(client.client_type||'').toLowerCase()==='school'&&Number(client.organization_id));
      await IntakeLink.create({publicKey,title,description:'Current living disclosure for this existing client.',languageCode:locale,scopeType:packetSchoolId?'school':'agency',formType:'smart_disclosure',organizationId:packetSchoolId||Number(agencyId),isActive:true,createClient:true,createGuardian:false,requiresAssignment:false,allowedDocumentTemplateIds:[],intakeSteps:[{type:'smart_disclosure',title}],customMessages:{clientUpdateRequestId:Number(requestId),disclosureContentHash:contentHash,disclosureLocale:locale,...customMessages},createdByUserId:actorUserId},connection);
      const href=intakeUrl(publicKey);
      await connection.execute("INSERT INTO client_update_items (request_id,item_type,reference_key,title,public_key,href) VALUES (?,'document',?,?,?,?)",[requestId,reference,title,publicKey,href]);
      await connection.execute("UPDATE client_update_requests SET status='in_progress',packet_public_key=?,sent_at=UTC_TIMESTAMP() WHERE id=?",[publicKey,requestId]);
    }
    superseded=[...staleRequests];
    for(const id of superseded)await connection.execute("UPDATE client_update_requests SET status='cancelled' WHERE id=? AND status IN ('sent','in_progress')",[id]);
    await connection.execute(`INSERT INTO user_activity_log (action_type,user_id,agency_id,metadata) VALUES ('client_disclosure_assigned',?,?,?)`,[actorUserId,agencyId,JSON.stringify({clientId,guardianUserId,requestId,reference,locale,reused,supersededRequestIds:superseded})]);
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  return {requestId,publicKey,reused,locale,contentHash,invitationSent:false};
}

export function isClientUpdatePacket(link) {
  let messages=link?.custom_messages||link?.customMessages||{};
  if(typeof messages==='string'){try{messages=JSON.parse(messages);}catch{return false;}}
  return Number.isSafeInteger(Number(messages?.clientUpdateRequestId))&&Number(messages.clientUpdateRequestId)>0;
}

/** A document-only update may attach only its server-bound existing client.
 * Failure never falls through to ordinary enrollment or creates siblings. */
export async function resolveClientUpdatePacketBinding(link) {
  const marked=isClientUpdatePacket(link);
  const request=await findUpdateByPacketPublicKey(link?.public_key);
  if(!marked&&!request)return null;
  const reenrollment=request?.purpose==='reenrollment';
  if(!reenrollment)assertEnabled();
  let messages=link.custom_messages||link.customMessages||{};if(typeof messages==='string'){try{messages=JSON.parse(messages);}catch{messages={};}}
  if(!marked||!request||!(reenrollment?['sent','in_progress','completed']:['sent','in_progress']).includes(request.status)||Number(request.id)!==Number(messages.clientUpdateRequestId)||!request.guardian_user_id)throw fail(409,'This update is no longer available. Contact the care team.');
  const contacts=await ClientGuardian.listForClient(request.client_id);
  const contact=contacts.find(row=>Number(row.guardian_user_id)===Number(request.guardian_user_id));
  const {client,recipient}=await currentClientUpdateRecipient({agencyId:request.agency_id,clientId:request.client_id,to:contact?.email,guardianUserId:request.guardian_user_id,reenrollment});
  if(!reenrollment&&['ARCHIVED','DECLINED'].includes(String(client.status||'').toUpperCase()))throw fail(409,'This client’s update is no longer active.');
  const school = messages.disclosureSchoolCityId ? await familySharingSchool(client) : null;
  if (messages.disclosureSchoolCityId && Number(school?.id) !== Number(messages.disclosureSchoolCityId)) throw fail(409, 'The client’s school changed. Ask your care team for the current disclosure.');
  const expected=link.scope_type==='school'?(school?.id||client.organization_id):client.agency_id;
  if(Number(link.organization_id)!==Number(expected))throw fail(403,'The update packet scope has changed.');
  if(messages.disclosureContentHash){
    const locale=messages.disclosureLocale;
    if(!['en','es'].includes(locale)||String(link.language_code||'en')!==locale)throw fail(409,'The disclosure language changed. Ask your care team for the current document.');
    const organizationId = school?.id || client.organization_id;
    const agency=await Agency.findById(request.agency_id),organization=organizationId?await Agency.findById(organizationId):null;
    const current=await buildSmartDisclosureContext({boundClient:client,agency,organization,locale,link});
    if(!current||current.locale!==locale||current.contentHash!==messages.disclosureContentHash)throw fail(409,'The disclosure or care team changed. Ask your care team to attach the current version.');
  }
  return {attachClientId:Number(client.id),guardianUserId:Number(recipient.guardian_user_id),attachSource:'client_update',agencyIdResolved:Number(request.agency_id),returningMatchInitials:String(client.initials||''),mergePatch:{}};
}

export async function assertClientUpdateSubmissionContext(link, {coGuardianToken,coGuardianInviteId}={}) {
  const binding=await resolveClientUpdatePacketBinding(link);
  if(binding&&(coGuardianToken||coGuardianInviteId))throw fail(409,'A selected client update cannot accept an additional guardian invitation. Open that invitation separately.');
  return binding;
}

async function signedTemplateIds(publicKey, clientId) {
  if (!publicKey) return { ids: new Set(), packetSubmitted: false };
  const [signed] = await pool.execute(
    `SELECT d.document_template_id
     FROM intake_submission_documents d
     JOIN intake_submissions s ON s.id = d.intake_submission_id
     JOIN intake_links l ON l.id = s.intake_link_id
     WHERE l.public_key = ? AND d.signed_at IS NOT NULL
       AND (s.client_id = ? OR s.client_id IS NULL)`,
    [publicKey, Number(clientId)]
  );
  const [submitted] = await pool.execute(
    `SELECT s.id FROM intake_submissions s
     JOIN intake_links l ON l.id = s.intake_link_id
     WHERE l.public_key = ? AND s.client_id = ? AND s.submitted_at IS NOT NULL
     LIMIT 1`,
    [publicKey, Number(clientId)]
  );
  const ids = new Set((signed || []).map((row) => Number(row.document_template_id)));
  return { ids, packetSubmitted: !!submitted.length };
}

async function signedSmartDisclosure(item,request){
  const match=/^smart_disclosure:(en|es):([a-f0-9]{40})$/.exec(String(item.reference_key||''));
  if(!match)return false;
  const [signed]=await pool.execute(`SELECT a.id FROM client_disclosure_acknowledgements a
    JOIN intake_submissions s ON s.id=a.intake_submission_id
    JOIN intake_links l ON l.id=s.intake_link_id
    JOIN intake_submission_documents d ON d.intake_submission_id=s.id AND d.client_id=a.client_id
    WHERE l.public_key=? AND a.client_id=? AND a.agency_id=? AND a.language_code=? AND a.content_hash=?
      AND s.client_id=a.client_id AND s.guardian_user_id=? AND a.signed_at IS NOT NULL
      AND d.signed_at IS NOT NULL AND d.signed_pdf_path IS NOT NULL LIMIT 1`,[request.packet_public_key,request.client_id,request.agency_id,match[1],match[2],request.guardian_user_id]);
  return !!signed.length;
}

async function assessmentCompleted(item,request) {
  const meta = getFamilyMeta(item.reference_key);
  const id = Number(item.assessment_id);
  if (!meta?.table || !FAMILY_TABLES.has(meta.table) || !id) return false;
  try {
    const [rows] = await pool.execute(`SELECT status FROM ${meta.table} WHERE id = ? AND agency_id=? AND client_id=? LIMIT 1`, [id,Number(request.agency_id),Number(request.client_id)]);
    const status = String(rows?.[0]?.status || '').toLowerCase();
    return status === 'completed' || status === 'archived';
  } catch {
    return false;
  }
}

async function portalSignals({ user, agencyId, clientId, sentAt }) {
  const signals = { notifications: false, planComplete: false, planWaiting: false, insurance: null, authorization: false, payment: false, billing: false, medicaid: false, insuranceApplies: false };
  const [[choices]] = await pool.execute(
    `SELECT updated_at FROM family_notification_choices
     WHERE agency_id = ? AND client_id = ? AND guardian_user_id = ? LIMIT 1`,
    [agencyId, clientId, user.id]
  );
  signals.notifications = !!choices && new Date(choices.updated_at) >= new Date(sentAt);
  try {
    const { guardianPlanProgress } = await import('./guardianPlanProgress.service.js');
    const plan = await guardianPlanProgress({ userId: user.id, clientId, agencyId });
    signals.planWaiting = !plan?.hasActivePlan;
    signals.planComplete = !!plan?.acknowledgments?.some((row) => row.status === 'signed');
  } catch (error) {
    if (error?.status !== 403) signals.planWaiting = true;
    else signals.planWaiting = true;
  }
  try {
    const { requireBillingLink } = await import('./familyBillingPolicy.service.js');
    await requireBillingLink(user.id, clientId, agencyId);
    signals.billing = true;
    const { readClientInsurance } = await import('./clientInsurance.service.js');
    const { hasMedicaidCoverage } = await import('../utils/insurancePaymentPolicy.js');
    const insurance = await readClientInsurance(clientId, agencyId);
    signals.medicaid = hasMedicaidCoverage(insurance);
    signals.insuranceApplies = !signals.medicaid;
    if (signals.medicaid) {
      signals.insurance = true;
      signals.authorization = true;
      signals.payment = true;
    } else if (insurance?.profileId) {
      const { decodeInsuranceProfile } = await import('../models/GuardianInsuranceProfile.model.js');
      const { cardProgress } = await import('./insuranceCards/policy.js');
      const [[row]] = await pool.execute(
        `SELECT * FROM guardian_insurance_profiles WHERE id = ? AND agency_id = ?`,
        [insurance.profileId, agencyId]
      );
      if (row) {
        const [[followup]] = await pool.execute(
          `SELECT * FROM insurance_card_followups WHERE profile_id = ? AND agency_id = ?`,
          [insurance.profileId, agencyId]
        );
        const progress = cardProgress(decodeInsuranceProfile(row), followup || {});
        signals.insurance = progress.missingSlots.length === 0 || ['waived', 'not_required'].includes(progress.state);
      }
    }
    const [[consent]] = await pool.execute(
      `SELECT id FROM guardian_billing_consents
       WHERE agency_id = ? AND client_id = ? AND guardian_user_id = ? AND purpose = 'responsible_payer' AND revoked_at IS NULL
       LIMIT 1`,
      [agencyId, clientId, user.id]
    );
    signals.authorization = signals.authorization || !!consent;
    const { migrationPaymentReady } = await import('./portalMigration.service.js');
    signals.payment = signals.payment || await migrationPaymentReady({ agencyId, userId: user.id });
  } catch (error) {
    if (error?.status !== 403) throw error;
  }
  return signals;
}

function stepView(item, { complete, waiting, detail, href }) {
  return {
    id: Number(item.id),
    type: item.item_type,
    title: item.title,
    complete: !!complete,
    waiting: !!waiting && !complete,
    detail: detail || null,
    href: href || item.href || null
  };
}

async function refreshItems(request, items, user) {
  const signed = await signedTemplateIds(request.packet_public_key, request.client_id);
  const sentAt = request.sent_at || request.created_at;
  const needsPortal = items.some((item) => !['document', 'assessment'].includes(item.item_type));
  const signals = needsPortal ? await portalSignals({ user, agencyId: Number(request.agency_id), clientId: Number(request.client_id), sentAt }) : null;
  const views = [];
  for (const item of items) {
    let complete = item.status === 'complete';
    let waiting = false;
    let detail = null;
    if (item.item_type === 'document') {
      complete = String(item.reference_key||'').startsWith('smart_disclosure:')
        ? await signedSmartDisclosure(item,request)
        : complete || signed.packetSubmitted || signed.ids.has(Number(item.reference_key));
      detail = 'Open the secure form and sign this document.';
    } else if (item.item_type === 'assessment') {
      if (familyOutcomeMeasure(item.reference_key)) {
        if (Number(request.guardian_user_id) === Number(user.id)) {
          views.push({ ...stepView(item, { complete, detail: 'Complete this questionnaire for your care team.' }), outcomeAssessment: true });
        }
        continue;
      }
      complete = complete || await assessmentCompleted(item,request);
      detail = 'Open the assessment and submit it.';
    } else if (signals) {
      if (item.item_type === 'information') {
        detail = PORTAL_STEPS[0].detail;
      } else if (item.item_type === 'notifications') {
        complete = complete || signals.notifications;
        detail = PORTAL_STEPS[1].detail;
      } else if (item.item_type === 'plan') {
        waiting = signals.planWaiting && !signals.planComplete;
        complete = complete || signals.planComplete;
        detail = waiting ? 'Your care team will let you know when a plan is ready.' : PORTAL_STEPS[2].detail;
      } else if (item.item_type === 'insurance') {
        waiting = !signals.billing && signals.insurance == null;
        complete = complete || signals.insurance === true;
        detail = signals.medicaid ? 'A Medicaid card is not required.' : PORTAL_STEPS[3].detail;
      } else if (item.item_type === 'authorization') {
        waiting = !signals.billing && !signals.authorization;
        complete = complete || signals.authorization;
        detail = signals.medicaid ? 'Payment authorization is not requested for this coverage.' : PORTAL_STEPS[4].detail;
      } else if (item.item_type === 'payment') {
        waiting = !signals.billing && !signals.payment;
        complete = complete || signals.payment;
        detail = signals.medicaid ? 'A payment card is not requested for this coverage.' : PORTAL_STEPS[5].detail;
      }
    }
    if (complete && item.status !== 'complete') {
      await pool.execute(
        `UPDATE client_update_items SET status = 'complete', completed_at = UTC_TIMESTAMP() WHERE id = ?`,
        [item.id]
      );
    }
    views.push(stepView(item, { complete, waiting, detail }));
  }
  const unfinished = views.filter((item) => !item.complete);
  const actionable = unfinished.filter((item) => !item.waiting);
  let status = request.status;
  if (!unfinished.length) status = 'completed';
  else if (views.some((item) => item.complete) && request.status !== 'draft') status = 'in_progress';
  if (status !== request.status && request.status !== 'draft') {
    await pool.execute(
      `UPDATE client_update_requests
       SET status = ?, completed_at = IF(? = 'completed', UTC_TIMESTAMP(), completed_at)
       WHERE id = ?`,
      [status, status, request.id]
    );
  }
  return { views, actionable: actionable.length > 0 };
}

async function guardianLink(user, clientId) {
  if (!['client', 'client_guardian', 'guardian'].includes(String(user?.role || ''))) {
    throw fail(403, 'Your own portal account is required');
  }
  const {assertClientCanViewOwnShared}=await import('./assessmentDeliverable.service.js');
  return assertClientCanViewOwnShared({user,clientId});
}

export async function guardianClientUpdate({ user, agencyId, clientId }) {
  if(!clientUpdatesEnabled())return {enabled:false,assigned:false,complete:true,items:[],shares:[]};
  const link = await guardianLink(user, clientId);
  const aid = Number(agencyId) || Number(link.agency_id);
  if(aid!==Number(link.agency_id))throw fail(403,'This profile belongs to a different agency.');
  const [requests] = await pool.execute(
    `SELECT * FROM client_update_requests
     WHERE client_id = ? AND agency_id = ? AND (guardian_user_id=? OR guardian_user_id IS NULL) AND status IN ('sent','in_progress','completed')
     ORDER BY id DESC LIMIT 5`,
    [Number(clientId), aid,Number(user.id)]
  );
  const items = [];
  let actionable = false;
  for (const request of requests || []) {
    if (request.status === 'completed') continue;
    const refreshed = await refreshItems(request, await loadItems(request.id), user);
    items.push(...refreshed.views.filter((item) => !item.complete || request.status !== 'completed'));
    actionable = actionable || refreshed.actionable;
  }
  const shares = await listOpenShareEvents({ agencyId: aid, clientId, recipientUserId: user.id }).catch(() => []);
  const openItems = items.filter((item) => !item.complete);
  return {
    assigned: openItems.length > 0,
    complete: openItems.length === 0,
    items: openItems,
    shares
  };
}

export async function assignedOutcomeAssessment({ user, agencyId, clientId, itemId, submission }) {
  assertEnabled();
  const link = await guardianLink(user, clientId);
  if (Number(agencyId) !== Number(link.agency_id)) throw fail(403, 'This profile belongs to a different agency.');
  const [rows] = await pool.execute(`SELECT i.id, i.status, i.reference_key
    FROM client_update_items i JOIN client_update_requests r ON r.id = i.request_id
    WHERE i.id = ? AND r.client_id = ? AND r.agency_id = ? AND r.guardian_user_id = ?
      AND i.item_type = 'assessment'
      AND (r.status IN ('sent','in_progress') OR (r.status = 'completed' AND i.status = 'complete'))
    LIMIT 1`, [itemId, clientId, agencyId, user.id]);
  const item = rows?.[0];
  const measure = familyOutcomeMeasure(item?.reference_key);
  if (!measure) throw fail(404, 'That assessment is not assigned to your account.');
  assertOutcomeRecipient(measure, { guardian_user_id: user.id, role: user.role, relationship_type: link.relationship_type }, user.id);
  if (item.status === 'complete') return { complete: true };
  if (submission === undefined) return { measure };
  const { saveAssignedOutcomeResponse } = await import('./outcomeMeasures.service.js');
  await saveAssignedOutcomeResponse({ clientId, agencyId, userId: user.id, itemId: item.id, measure, version: submission.version, answers: submission.answers });
  await pool.execute(`UPDATE client_update_items
    SET status = 'complete', completed_at = COALESCE(completed_at, UTC_TIMESTAMP()) WHERE id = ?`, [item.id]);
  return { complete: true };
}

export async function confirmUpdateInformation({ user, agencyId, clientId, itemId }) {
  assertEnabled();
  const link=await guardianLink(user, clientId);
  if(Number(agencyId)!==Number(link.agency_id))throw fail(403,'This profile belongs to a different agency.');
  const [rows] = await pool.execute(
    `SELECT i.*, r.agency_id, r.client_id, r.status AS request_status
     FROM client_update_items i
     JOIN client_update_requests r ON r.id = i.request_id
     WHERE i.id = ? AND r.client_id = ? AND r.agency_id = ? AND i.item_type = 'information'
       AND (r.guardian_user_id=? OR r.guardian_user_id IS NULL)
       AND r.status IN ('sent','in_progress')
     LIMIT 1`,
    [Number(itemId), Number(clientId), Number(agencyId),Number(user.id)]
  );
  const item = rows?.[0];
  if (!item) throw fail(404, 'That update step is not assigned.');
  await pool.execute(
    `UPDATE client_update_items SET status = 'complete', completed_at = UTC_TIMESTAMP() WHERE id = ?`,
    [item.id]
  );
  return guardianClientUpdate({ user, agencyId, clientId });
}

async function buildUpdateNotice({request,client,recipient,reenrollment=false}) {
  const {clientEmailContext}=await import('./clientPortalEmail.service.js');
  const {clientPortalInviteUrl}=await import('./clientPortalContext.service.js');
  const context=await clientEmailContext({agencyId:request.agency_id,clientId:request.client_id,client});
  const url=clientPortalInviteUrl({portal:context.portal,existingAccount:true});
  const login=new URL(url),destination=new URL(login.searchParams.get('redirect')||context.url('guardian'),login.origin);
  destination.searchParams.set('panel',reenrollment?'past_providers':'updates');if(reenrollment)destination.searchParams.set('serviceId',String(request.service_enrollment_id));destination.searchParams.set('clientId',String(request.client_id));login.searchParams.set('redirect',destination.pathname+destination.search);
  const {familyEnrollmentContext,portalUrlWithLocale}=await import('./familyPortalLocale.service.js');
  const {locale}=await familyEnrollmentContext(recipient.guardian_user_id,request.agency_id);
  const localizedLogin=portalUrlWithLocale(login.toString(),locale),spanish=locale==='es';
  const text=reenrollment
    ? (spanish?'Su paquete de nueva inscripción está listo en su portal seguro. Inicie sesión para revisar los acuerdos actuales y confirmar sus datos de contacto, seguro, pago y comunicación. Los documentos se agregarán a su expediente existente. Completar el paquete no reinicia los servicios ni reserva citas; el equipo revisará los próximos pasos.':'A fresh enrollment package is ready in your secure portal. Sign in to review the current agreements and confirm contact, insurance/payment and communication details. Your documents will be added to your existing client file. Completing the package does not restart services or book appointments; the team will review next steps.')
    : (spanish?'Su equipo de atención seleccionó algunas actualizaciones para su perfil existente. Inicie sesión para revisar solo los elementos solicitados. No necesita completar una nueva inscripción.':'Your care team has selected a few updates for your existing profile. Sign in to review only the requested items. You do not need to complete a new enrollment.');
  const action=spanish?'Revisar actualizaciones del portal':'Review portal updates';
  return {agencyId:request.agency_id,clientId:request.client_id,context,to:recipient.email,userId:recipient.guardian_user_id,
    subject:reenrollment?(spanish?'Su paquete de inscripción seguro está listo':'Your secure enrollment package is ready'):(spanish?'Hay actualizaciones en su portal seguro':'Updates are ready in your secure portal'),text:`${text}\n\n${action}: ${localizedLogin}`,html:`<div lang="${spanish?'es':'en'}"><p>${escapePortalHtml(text)}</p>${portalMessageHtml({text:localizedLogin,linkUrl:localizedLogin,linkLabel:action})}</div>`,
    linkUrl:localizedLogin,templateType:reenrollment?'care_reenrollment':'client_update',source:'manual'};
}

async function notifyUpdateRecipient({actorUserId,...input}) {
  const {sendClientPortalEmail}=await import('./clientPortalEmail.service.js');
  return sendClientPortalEmail({...await buildUpdateNotice(input),generatedByUserId:actorUserId||null});
}

export async function previewClientUpdateNotice({client, recipientId}) {
  const link=(await ClientGuardian.listForClient(client.id)).find(row=>Number(row.guardian_user_id)===Number(recipientId));
  const {recipient}=await currentClientUpdateRecipient({agencyId:client.agency_id,clientId:client.id,to:link?.email,guardianUserId:recipientId});
  const notice=await buildUpdateNotice({request:{agency_id:client.agency_id,client_id:client.id},client,recipient});
  return {subject:notice.subject,html:notice.html};
}

export async function remindUpdateItem({clientId,agencyId,itemId,actorUserId}) {
  assertEnabled();
  const [[request]]=await pool.execute(`SELECT r.* FROM client_update_requests r JOIN client_update_items i ON i.request_id=r.id WHERE i.id=? AND r.client_id=? AND r.agency_id=? AND r.status IN ('sent','in_progress') AND i.status='pending' AND COALESCE(r.purpose,'') <> 'reenrollment'`,[itemId,clientId,agencyId]);
  if(!request)throw fail(409,'This item is no longer awaiting a reminder.');
  const links=await ClientGuardian.listForClient(clientId);
  const link=links.find(row=>Number(row.guardian_user_id)===Number(request.guardian_user_id));
  const {client,recipient}=await currentClientUpdateRecipient({agencyId,clientId,to:link?.email,guardianUserId:request.guardian_user_id});
  const {familyNotificationDeliveryGate}=await import('./familyNotificationChoices.service.js');
  const gate=await familyNotificationDeliveryGate({agencyId,clientId,to:recipient.email,templateType:'client_update'});
  if(!gate.allowed)throw fail(409,'This contact’s notification preferences do not allow a reminder.');
  const result=await notifyUpdateRecipient({request,client,recipient,actorUserId});
  return {status:result?.blocked||result?.skipped?'held':result?.redirected?'redirected':result?.queued||result?.pendingApproval?'queued':result?.id?'sent':'unconfirmed'};
}
