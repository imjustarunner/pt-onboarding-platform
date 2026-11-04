import crypto from 'crypto';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { ASSESSMENT_FAMILIES, getFamilyMeta } from './assessmentFamilyRegistry.js';
import { normalizeUpdateSelection, PORTAL_STEPS } from './clientUpdateSelection.js';
import { absolutePortalPath, listOpenShareEvents } from './portalShareNotice.service.js';
import {escapePortalHtml,portalMessageHtml} from './portalEmailBranding.service.js';
import {schoolCareBridgeDeployment} from './schoolCareBridgeRouting.service.js';

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
    `SELECT id, name, version FROM document_templates
     WHERE is_active = 1
       AND (agency_id = ? OR agency_id IS NULL)
       AND document_type IN (
         'acknowledgment','authorization','agreement','compliance','disclosure','consent',
         'audio_recording_consent','hipaa_security','school'
       )
     ORDER BY name ASC, version DESC, id DESC`,
    [aid]
  );
  const seen = new Set();
  const documents = [];
  for (const row of templates || []) {
    const name = String(row.name || `Document ${row.id}`).trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    documents.push({ id: Number(row.id), name });
  }
  return {
    enabled:true,
    documents,
    assessments: ASSESSMENT_FAMILIES.map((family) => ({ family: family.family, title: family.title })),
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
    `SELECT id, name, agency_id FROM document_templates
     WHERE id = ? AND is_active = 1 AND (agency_id = ? OR agency_id IS NULL)
       AND document_type IN (
         'acknowledgment','authorization','agreement','compliance','disclosure','consent',
         'audio_recording_consent','hipaa_security','school'
       )
     LIMIT 1`,
    [Number(id), Number(agencyId)]
  );
  return rows?.[0] || null;
}

export async function createClientUpdate({ agencyId, clientId, body = {}, actorUserId = null }) {
  assertEnabled();
  const selection = normalizeUpdateSelection(body);
  const client = await Client.findById(Number(clientId), { includeSensitive: true });
  if (!client) throw fail(404, 'Client not found');
  if (Number(client.agency_id) !== Number(agencyId)) throw fail(403, 'Client does not belong to this agency');
  if(['ARCHIVED','DECLINED'].includes(String(client.status||'').toUpperCase()))throw fail(409,'Review the current client record before requesting updates.');

  const documentRows = [];
  for (const id of selection.documents) {
    const template = await templateName(id, agencyId);
    if (!template) throw fail(400, 'Choose an active document template for this agency.');
    documentRows.push(template);
  }
  const assessmentRows = [];
  const seenFamilies = new Set();
  for (const family of selection.assessments) {
    const meta = getFamilyMeta(family);
    if (!meta) throw fail(400, 'Choose an assessment from the list.');
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
      `INSERT INTO client_update_requests (agency_id, client_id, status, created_by_user_id)
       VALUES (?, ?, 'draft', ?)`,
      [Number(client.agency_id), Number(client.id), actorUserId ? Number(actorUserId) : null]
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
  const ids = documents.map((item) => Number(item.reference_key)).filter((id) => id > 0);
  const publicKey = crypto.randomBytes(24).toString('hex');
  const client=await Client.findById(request.client_id,{includeSensitive:true});
  if(!client||Number(client.agency_id)!==Number(request.agency_id)||['ARCHIVED','DECLINED'].includes(String(client.status||'').toUpperCase()))throw fail(409,'Review the current client record before requesting documents.');
  let schoolId=null;
  if(String(client.client_type||'').toLowerCase()==='school'&&Number(client.organization_id)) {
    const [[school]]=await pool.execute(`SELECT s.id FROM agencies s WHERE s.id=? AND s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
      AND (EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.organization_id=s.id AND f.agency_id=? AND f.is_active=1)
      OR EXISTS(SELECT 1 FROM agency_schools legacy WHERE legacy.school_organization_id=s.id AND legacy.agency_id=? AND legacy.is_active=1))`,[client.organization_id,request.agency_id,request.agency_id]);
    if(!school)throw fail(409,'Review the client’s current school affiliation first.');
    schoolId=Number(school.id);
  }
  await IntakeLink.create({
    publicKey,
    title: 'Documents to complete',
    description: 'Selected documents for an existing client. This does not start a new enrollment.',
    scopeType: schoolId?'school':'agency',
    formType: 'intake',
    organizationId: schoolId||Number(request.agency_id),
    isActive: true,
    createClient: true,
    createGuardian: false,
    requiresAssignment: false,
    customMessages:{clientUpdateRequestId:Number(request.id)},
    allowedDocumentTemplateIds: ids,
    intakeSteps: documents.map((item) => ({
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
  const pending = items.filter((item) => item.item_type === 'assessment' && !item.assessment_id);
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

/** Existing portal authority only. Operational email eligibility never grants
 * access to a clinical document, account or relationship. Reused at transport. */
export async function currentClientUpdateRecipient({agencyId,clientId,to,guardianUserId=null}) {
  assertEnabled();
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
  await assertClientCanViewOwnShared({user:{id:recipient.guardian_user_id,role:recipient.role},clientId});
  return {client,recipient};
}

export async function sendClientUpdate(requestId, { actorUserId, guardianEmail } = {}) {
  assertEnabled();
  const request = await loadRequest(requestId);
  if (!request) throw fail(404, 'Client update not found');
  if(request.status!=='draft')throw fail(409,'Delivery has already been attempted. Check email history before creating another update.');
  const {client,recipient}=await currentClientUpdateRecipient({agencyId:request.agency_id,clientId:request.client_id,to:guardianEmail});
  const {familyNotificationDeliveryGate}=await import('./familyNotificationChoices.service.js');
  const gate=await familyNotificationDeliveryGate({agencyId:request.agency_id,clientId:request.client_id,to:recipient.email,templateType:'client_update'});
  if(!gate.allowed)throw fail(409,'This contact’s email preferences do not allow an update notice.');
  const [claim]=await pool.execute("UPDATE client_update_requests SET status='in_progress',guardian_user_id=?,sent_at=UTC_TIMESTAMP() WHERE id=? AND status='draft'",[recipient.guardian_user_id,request.id]);
  if(!claim.affectedRows)throw fail(409,'Delivery has already been attempted. Check email history.');
  let items = await loadItems(request.id);
  const prepared = await ensureDocumentPacket(request, items, actorUserId);
  await ensureAssessments(prepared, items, actorUserId);
  items = await loadItems(request.id);
  const {clientEmailContext,sendClientPortalEmail}=await import('./clientPortalEmail.service.js');
  const {clientPortalInviteUrl}=await import('./clientPortalContext.service.js');
  const context=await clientEmailContext({agencyId:request.agency_id,clientId:request.client_id,client});
  const url=clientPortalInviteUrl({portal:context.portal,existingAccount:true});
  const login=new URL(url),destination=new URL(login.searchParams.get('redirect')||context.url('guardian'),login.origin);
  destination.searchParams.set('panel','updates');destination.searchParams.set('clientId',String(request.client_id));login.searchParams.set('redirect',destination.pathname+destination.search);
  const text='Your care team has selected a few updates for your existing profile. Sign in to review only the requested items. You do not need to complete a new enrollment.';
  const delivery=await sendClientPortalEmail({agencyId:request.agency_id,clientId:request.client_id,context,to:recipient.email,userId:recipient.guardian_user_id,
    subject:'Updates are ready in your secure portal',text:`${text}\n\nReview updates: ${login}`,html:`<p>${escapePortalHtml(text)}</p>${portalMessageHtml({text:login.toString(),linkUrl:login.toString(),linkLabel:'Review portal updates'})}`,
    linkUrl:login.toString(),templateType:'client_update',source:'manual',generatedByUserId:actorUserId||null});
  if(delivery?.id&&!delivery.redirected)await pool.execute("UPDATE client_update_requests SET status='sent' WHERE id=? AND status='in_progress'",[request.id]);
  return {request:await loadRequest(request.id),items:await loadItems(request.id),delivery,
    deliveryStatus:delivery?.pendingApproval||delivery?.queued?'queued':delivery?.id&&!delivery.redirected?'sent':delivery?.skipped?'skipped':delivery?.redirected?'redirected':'unconfirmed'};
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
  assertEnabled();
  let messages=link.custom_messages||link.customMessages||{};if(typeof messages==='string'){try{messages=JSON.parse(messages);}catch{messages={};}}
  if(!marked||!request||!['sent','in_progress'].includes(request.status)||Number(request.id)!==Number(messages.clientUpdateRequestId)||!request.guardian_user_id)throw fail(409,'This update is no longer available. Contact the care team.');
  const contacts=await ClientGuardian.listForClient(request.client_id);
  const contact=contacts.find(row=>Number(row.guardian_user_id)===Number(request.guardian_user_id));
  const {client,recipient}=await currentClientUpdateRecipient({agencyId:request.agency_id,clientId:request.client_id,to:contact?.email,guardianUserId:request.guardian_user_id});
  if(['ARCHIVED','DECLINED'].includes(String(client.status||'').toUpperCase()))throw fail(409,'This client’s update is no longer active.');
  const expected=link.scope_type==='school'?client.organization_id:client.agency_id;
  if(Number(link.organization_id)!==Number(expected))throw fail(403,'The update packet scope has changed.');
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
      complete = complete || signed.packetSubmitted || signed.ids.has(Number(item.reference_key));
      detail = 'Open the secure form and sign this document.';
    } else if (item.item_type === 'assessment') {
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
