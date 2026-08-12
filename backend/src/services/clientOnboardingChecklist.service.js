/**
 * Computed Client Readiness checklist (staff → onboarded, provider → current).
 *
 * Documents for paper packets use onboarding_docs_json with the digital-intake
 * paper-packet catalog (one-signature packet bundle + separate ROI).
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { isPaperPacketClient } from '../utils/paperPacketClient.js';
import { createClientOnboardingTaskForProvider } from './clientOnboardingTask.service.js';
import { notifyClientBecameCurrent } from './clientNotifications.service.js';
import {
  PAPER_PACKET_SIGNATURE_KEYS,
  normalizeOnboardingDocItems,
  buildPacketSignatureSummary
} from '../utils/paperPacketDocumentCatalog.js';
import {
  computeFallReadinessSummary,
  hasCompletedFallContinuation,
  isReturningSchoolClient,
  continuationPlanIsContinue
} from '../utils/fallReadiness.js';

function continuationIsNonContinue(raw) {
  return hasCompletedFallContinuation(raw) && !continuationPlanIsContinue(raw);
}

async function isAssignedProvider(providerUserId, clientId) {
  const pid = Number(providerUserId || 0);
  const cid = Number(clientId || 0);
  if (!pid || !cid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments
       WHERE client_id = ?
         AND provider_user_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [cid, pid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
  const client = await Client.findById(cid);
  return Number(client?.provider_id || 0) === pid;
}

/** @deprecated Legacy onboarding doc keys — use paperPacketDocumentCatalog. */
export const REQUIRED_PACKET_DOC_KEYS = Object.freeze([
  { key: 'roi', label: 'Release of Information (ROI)' },
  { key: 'consent_disclosure', label: 'Consent / disclosure' },
  { key: 'insurance_card', label: 'Insurance card (if applicable)' }
]);

function loadOnboardingPacketDocuments(client) {
  return normalizeOnboardingDocItems(client?.onboarding_docs_json);
}

function persistOnboardingDocItems(client, items, actorUserId) {
  const next = normalizeOnboardingDocItems({ items });
  const payload = { items: next.map((d) => ({ key: d.key, status: d.status })) };
  return Client.update(client.id, { onboarding_docs_json: JSON.stringify(payload) }, actorUserId);
}

function isSchoolClient(client) {
  const t = String(client?.client_type || '').toLowerCase();
  return t === 'school';
}

function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function hasActiveProvider(clientId) {
  try {
    const [rows] = await pool.execute(
      `SELECT provider_user_id
       FROM client_provider_assignments
       WHERE client_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [clientId]
    );
    if (rows?.[0]?.provider_user_id) return Number(rows[0].provider_user_id);
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
  const client = await Client.findById(clientId);
  return Number(client?.provider_id || 0) || null;
}

async function hasServiceDay(clientId, client = null) {
  const row = client || (await Client.findById(clientId));
  if (String(row?.service_day || '').trim()) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT service_day
       FROM client_provider_assignments
       WHERE client_id = ?
         AND is_active = TRUE
         AND service_day IS NOT NULL
         AND TRIM(service_day) <> ''
       LIMIT 1`,
      [clientId]
    );
    return !!(rows?.[0]?.service_day);
  } catch {
    return false;
  }
}

async function hasConfiguredRoiStaff(clientId, schoolOrganizationId) {
  const cid = Number(clientId || 0);
  const sid = Number(schoolOrganizationId || 0);
  if (!cid || !sid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT a.access_level, a.is_active, u.email
       FROM client_school_staff_roi_access a
       JOIN users u ON u.id = a.school_staff_user_id
       WHERE a.client_id = ?
         AND a.school_organization_id = ?
         AND a.is_active = TRUE
         AND LOWER(COALESCE(a.access_level, '')) IN ('roi', 'roi_docs')`,
      [cid, sid]
    );
    if (!(rows || []).length) return false;

    // Exclude schedulers (school_contacts.is_scheduler) from counting as ROI-configured staff.
    const emails = (rows || [])
      .map((r) => String(r.email || '').trim().toLowerCase())
      .filter((e) => e.includes('@'));
    if (!emails.length) return true;
    const placeholders = emails.map(() => '?').join(',');
    try {
      const [sched] = await pool.execute(
        `SELECT LOWER(TRIM(email)) AS email
         FROM school_contacts
         WHERE school_organization_id = ?
           AND LOWER(TRIM(email)) IN (${placeholders})
           AND COALESCE(is_scheduler, 0) = 1`,
        [sid, ...emails]
      );
      const schedulerEmails = new Set((sched || []).map((r) => String(r.email || '').toLowerCase()));
      return (rows || []).some((r) => !schedulerEmails.has(String(r.email || '').trim().toLowerCase()));
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

function item(key, label, done, meta = {}) {
  return { key, label, done: !!done, owner: meta.owner || 'staff', hrefHint: meta.hrefHint || null, detail: meta.detail || null };
}

/**
 * Build full onboarding checklist for a client.
 */
export async function getClientOnboardingChecklist(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return null;
  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) return null;

  const school = isSchoolClient(client);
  const paperPacket = isPaperPacketClient(client);
  const documentItems = paperPacket ? loadOnboardingPacketDocuments(client) : [];
  const packetSignature = paperPacket ? buildPacketSignatureSummary(documentItems) : null;
  const roiDoc = documentItems.find((d) => d.key === 'roi') || null;
  const roiDocDone = !paperPacket || !roiDoc || roiDoc.done;
  const docsVerified = !paperPacket
    || (packetSignature?.done && roiDocDone);
  const providerUserId = await hasActiveProvider(cid);
  const providerAssigned = !!providerUserId;
  const dayAssigned = await hasServiceDay(cid, client);
  const insuranceIndicated = !!Number(client.insurance_type_id || 0);
  const roiPending = paperPacket && (client.paper_packet_staff_roi_pending === 1 || client.paper_packet_staff_roi_pending === true);
  const showRoiStaff = school && paperPacket;
  // Complete once staff has reviewed/saved permissions (pending cleared). Not every client
  // requires a school-staff ROI grant — all Limited may match the signed form.
  const roiConfigured = showRoiStaff ? !roiPending : true;

  // Staff setup = assignment work only. ROI staff + documents are their own areas.
  const staffItems = [];
  if (school) {
    staffItems.push(
      item('provider_assigned', 'Assign a provider', providerAssigned, { owner: 'staff', hrefHint: 'provider' }),
      item('service_day_assigned', 'Assign a service day', dayAssigned, { owner: 'staff', hrefHint: 'service_day' })
    );
  } else {
    staffItems.push(
      item('provider_assigned', 'Assign a provider', providerAssigned, { owner: 'staff', hrefHint: 'provider' })
    );
  }
  staffItems.push(
    item('insurance_indicated', 'Indicate insurance / payment', insuranceIndicated, {
      owner: 'staff',
      hrefHint: 'insurance'
    })
  );

  const roiStaffItem = showRoiStaff
    ? item('roi_staff_access', 'School staff ROI permissions', roiConfigured, {
      owner: 'staff',
      hrefHint: 'school_roi',
      detail: roiPending
        ? 'Paper packet uploaded — set each staff member’s access to match the signed ROI.'
        : null
    })
    : null;

  const documentsItem = paperPacket
    ? item('documents_verified', 'Packet documents', docsVerified, {
      owner: 'staff',
      hrefHint: 'documents',
      detail: docsVerified
        ? null
        : [
          !packetSignature?.done ? 'Packet signature docs' : null,
          !roiDocDone ? 'ROI' : null
        ].filter(Boolean).join(', ') || 'Documents still needed'
    })
    : null;

  const contacted =
    !!client.parents_contacted_at
    && (client.parents_contacted_successful === 1 || client.parents_contacted_successful === true);
  const intakeDone = !!client.intake_at;
  const firstServiceRaw = client.first_service_at ? String(client.first_service_at).slice(0, 10) : null;
  const firstServiceDone = !!(firstServiceRaw && firstServiceRaw <= todayYmd());

  const providerItems = [
    item('guardian_contacted', 'Contact guardian / parent', contacted, { owner: 'provider', hrefHint: 'checklist' }),
    item('intake_completed', 'First intake completed date', intakeDone, { owner: 'provider', hrefHint: 'checklist' }),
    item('first_service', 'First service / success date', firstServiceDone, { owner: 'provider', hrefHint: 'checklist' })
  ];

  const areaGates = [
    ...staffItems,
    ...(roiStaffItem ? [roiStaffItem] : []),
    ...(documentsItem ? [documentsItem] : [])
  ];
  const staffComplete = areaGates.every((i) => i.done);
  const providerComplete = providerItems.every((i) => i.done);
  const statusKey = String(client.client_status_key || '').toLowerCase();
  const staffMarked = !!client.staff_onboarding_completed_at || statusKey === 'onboarded' || statusKey === 'current';
  const returning = school && isReturningSchoolClient(client);
  const continuationJson = client.continuation_services_json;
  const fallSummary = school
    ? computeFallReadinessSummary({
      returning,
      hasWeekday: dayAssigned,
      statusKey,
      continuationJson,
      priorProviderComplete: providerComplete || !!client.staff_onboarding_completed_at
    })
    : null;

  let phase = 'staff';
  if (fallSummary?.phase === 'fall') {
    phase = 'fall';
  } else if (staffComplete && staffMarked && !providerComplete) {
    phase = 'provider';
  } else if (staffComplete && staffMarked && providerComplete) {
    phase = 'done';
  }
  if (!fallSummary?.fall_pending && statusKey === 'current' && providerComplete && dayAssigned) phase = 'done';
  if (fallSummary?.fall_complete) phase = 'done';

  const fallItem = school && returning
    ? item(
      'fall_continuation',
      'Continuation of Services (fall)',
      hasCompletedFallContinuation(continuationJson) && (dayAssigned || continuationIsNonContinue(continuationJson)),
      {
        owner: 'provider',
        hrefHint: 'checklist',
        detail: fallSummary?.fall_flag ? 'Fall Readiness flagged' : null
      }
    )
    : null;

  const incomplete = [
    ...(fallSummary?.fall_pending ? [] : areaGates.filter((i) => !i.done)),
    ...(fallSummary?.fall_pending ? [] : providerItems.filter((i) => !i.done)),
    ...(fallItem && !fallItem.done ? [fallItem] : [])
  ];
  const complete = [
    ...(fallSummary?.fall_pending
      ? [...areaGates.map((i) => ({ ...i, done: true, prior_year: true })), ...providerItems.map((i) => ({ ...i, done: true, prior_year: true }))]
      : [...areaGates, ...providerItems].filter((i) => i.done)),
    ...(fallItem && fallItem.done ? [fallItem] : [])
  ];
  const openStaff = fallSummary?.fall_pending ? [] : areaGates.filter((i) => !i.done);
  const summaryParts = [];
  if (fallSummary?.summary_label) {
    summaryParts.push(fallSummary.summary_label);
  } else if (phase === 'done') {
    summaryParts.push('Readiness complete');
  } else if (phase === 'provider') {
    summaryParts.push(`${providerItems.filter((i) => !i.done).length} provider open`);
  } else {
    summaryParts.push(`${openStaff.length} open`);
  }
  if (!fallSummary?.summary_label) {
    openStaff.slice(0, 3).forEach((i) => {
      if (i.key === 'roi_staff_access') summaryParts.push('ROI staff');
      else if (i.key === 'documents_verified') summaryParts.push('Docs');
      else if (i.key === 'service_day_assigned') summaryParts.push('Day');
      else if (i.key === 'provider_assigned') summaryParts.push('Provider');
      else if (i.key === 'insurance_indicated') summaryParts.push('Insurance');
    });
  }

  let providerName = null;
  if (providerUserId) {
    try {
      const [prows] = await pool.execute(
        `SELECT TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name
         FROM users WHERE id = ? LIMIT 1`,
        [providerUserId]
      );
      providerName = String(prows?.[0]?.name || '').trim() || null;
    } catch {
      providerName = null;
    }
  }

  const fallItems = fallItem ? [fallItem] : [];
  const totalSteps = fallSummary?.fall_pending
    ? fallItems.length
    : areaGates.length + providerItems.length + fallItems.length;
  const completeSteps = fallSummary?.fall_pending
    ? fallItems.filter((i) => i.done).length
    : areaGates.filter((i) => i.done).length + providerItems.filter((i) => i.done).length + fallItems.filter((i) => i.done).length;

  // Returning fall clients: treat last-year staff/docs as complete for display.
  const staffItemsOut = fallSummary?.fall_pending
    ? staffItems.map((i) => ({ ...i, done: true, prior_year: true }))
    : staffItems;
  const roiStaffItemOut = fallSummary?.fall_pending && roiStaffItem
    ? { ...roiStaffItem, done: true, prior_year: true }
    : roiStaffItem;
  const documentsItemOut = fallSummary?.fall_pending && documentsItem
    ? { ...documentsItem, done: true, prior_year: true }
    : documentsItem;
  const providerItemsOut = fallSummary?.fall_pending
    ? providerItems.map((i) => ({ ...i, done: true, prior_year: true }))
    : providerItems;

  return {
    client_id: cid,
    client_type: school ? 'school' : 'office',
    is_paper_packet: paperPacket,
    intake_source: client.source || null,
    phase,
    status_key: statusKey || null,
    staff_onboarding_completed_at: client.staff_onboarding_completed_at || null,
    paper_packet_staff_roi_pending: fallSummary?.fall_pending ? false : !!roiPending,
    summary_label: summaryParts.join(' · '),
    open_count: incomplete.length,
    total_steps: totalSteps,
    complete_steps: completeSteps,
    progress_pct: totalSteps ? Math.round((completeSteps / totalSteps) * 100) : 0,
    staff_items: staffItemsOut,
    roi_staff_item: roiStaffItemOut,
    documents_item: documentsItemOut,
    provider_items: providerItemsOut,
    fall_items: fallItems,
    fall_pending: !!fallSummary?.fall_pending,
    fall_flag: !!fallSummary?.fall_flag,
    fall_complete: !!fallSummary?.fall_complete,
    is_returning_school_client: !!returning,
    incomplete,
    complete,
    document_items: fallSummary?.fall_pending
      ? documentItems.map((d) => ({ ...d, done: true, prior_year: true }))
      : documentItems,
    packet_signature: fallSummary?.fall_pending && packetSignature
      ? { ...packetSignature, done: true, prior_year: true }
      : packetSignature,
    can_complete_staff_onboarding: fallSummary?.fall_pending ? false : (staffComplete && !staffMarked),
    provider_user_id: providerUserId,
    client: {
      initials: client.initials || null,
      full_name: client.full_name || null,
      identifier_code: client.identifier_code || null,
      agency_id: client.agency_id ? Number(client.agency_id) : null,
      organization_name: client.organization_name || null,
      organization_id: client.organization_id ? Number(client.organization_id) : null,
      service_day: client.service_day || null,
      insurance_type_id: client.insurance_type_id ? Number(client.insurance_type_id) : null,
      insurance_type_label: client.insurance_type_label || null,
      submission_date: client.submission_date || null,
      client_status_label: client.client_status_label || null,
      client_status_key: statusKey || null,
      provider_id: providerUserId || (client.provider_id ? Number(client.provider_id) : null),
      roi_expires_at: client.roi_expires_at ? String(client.roi_expires_at).slice(0, 10) : null
    },
    provider_name: providerName
  };
}

function parseRoiExpiresAtYmd(raw) {
  const value = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error('roi_expires_at must be YYYY-MM-DD'), { status: 400 });
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error('Invalid ROI expiration date'), { status: 400 });
  }
  return value;
}

/**
 * Set client ROI expiration during readiness onboarding (feeds school portal access).
 */
export async function updateOnboardingRoiExpiration({ clientId, roiExpiresAt, actorUserId = null }) {
  const cid = Number(clientId || 0);
  if (!cid) throw new Error('clientId required');
  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (!isSchoolClient(client)) {
    throw Object.assign(new Error('ROI expiration applies only to school clients'), { status: 400 });
  }
  const ymd = parseRoiExpiresAtYmd(roiExpiresAt);
  if (!ymd) {
    throw Object.assign(new Error('ROI expiration date is required'), { status: 400 });
  }
  await Client.update(cid, { roi_expires_at: ymd }, actorUserId);
  return getClientOnboardingChecklist(cid);
}

/**
 * Mark the multi-doc paper-packet signature as received (all checklist keys except ROI).
 */
export async function markPaperPacketSignatureReceived({ clientId, actorUserId = null }) {
  const cid = Number(clientId || 0);
  if (!cid) throw new Error('clientId required');
  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (!isPaperPacketClient(client)) {
    throw Object.assign(new Error('Packet signature applies only to paper-upload clients'), { status: 400 });
  }
  const current = loadOnboardingPacketDocuments(client);
  const next = current.map((d) => {
    if (d.group !== 'packet_signature') return { key: d.key, status: d.status };
    return { key: d.key, status: 'present' };
  });
  await persistOnboardingDocItems(client, next, actorUserId);
  return getClientOnboardingChecklist(cid);
}

/**
 * Staff confirms school ROI permissions match the signed paper packet.
 * Clears the pending flag so the ROI staff step can complete even when every
 * staff member stays at Limited access.
 */
export async function acknowledgeRoiStaffOnboarding({ clientId, roiExpiresAt = undefined, actorUserId = null }) {
  const cid = Number(clientId || 0);
  if (!cid) throw new Error('clientId required');
  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (!isSchoolClient(client) || !isPaperPacketClient(client)) {
    throw Object.assign(new Error('School ROI acknowledgment applies only to paper-packet school clients'), { status: 400 });
  }
  const updates = { paper_packet_staff_roi_pending: 0 };
  if (roiExpiresAt !== undefined) {
    const ymd = parseRoiExpiresAtYmd(roiExpiresAt);
    if (!ymd) {
      throw Object.assign(new Error('Set an ROI expiration date before completing school staff ROI'), { status: 400 });
    }
    updates.roi_expires_at = ymd;
  } else if (!client.roi_expires_at && await hasConfiguredRoiStaff(cid, client.organization_id)) {
    throw Object.assign(new Error('Set an ROI expiration date before completing school staff ROI'), { status: 400 });
  }
  await Client.update(cid, updates, actorUserId);
  return getClientOnboardingChecklist(cid);
}

export async function updateClientOnboardingDocs({ clientId, items, roiExpiresAt = undefined, actorUserId = null }) {
  const cid = Number(clientId || 0);
  if (!cid) throw new Error('clientId required');
  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (!isPaperPacketClient(client)) {
    throw Object.assign(new Error('Packet document verification applies only to paper-upload clients'), { status: 400 });
  }
  const normalized = normalizeOnboardingDocItems(client.onboarding_docs_json);
  const incoming = Array.isArray(items) ? items : [];
  const byKey = new Map(incoming.map((i) => [String(i?.key || ''), i]));
  const next = normalized.map((def) => {
    const raw = byKey.get(def.key);
    if (!raw) return { key: def.key, status: def.status };
    return { key: def.key, status: raw.status };
  });
  await persistOnboardingDocItems(client, next, actorUserId);
  const roiMarkedPresent = next.some((d) => d.key === 'roi' && d.status === 'present');
  if (roiExpiresAt !== undefined) {
    const ymd = parseRoiExpiresAtYmd(roiExpiresAt);
    if (roiMarkedPresent && !ymd) {
      throw Object.assign(new Error('ROI expiration date is required when ROI is marked received'), { status: 400 });
    }
    if (ymd) {
      await Client.update(cid, { roi_expires_at: ymd }, actorUserId);
    }
  } else if (roiMarkedPresent && !client.roi_expires_at) {
    throw Object.assign(new Error('Set an ROI expiration date when marking ROI received'), { status: 400 });
  }
  return getClientOnboardingChecklist(cid);
}

/**
 * Mark staff onboarding complete → status onboarded + provider task.
 */
export async function completeStaffOnboarding({ clientId, actorUserId = null }) {
  const checklist = await getClientOnboardingChecklist(clientId);
  if (!checklist) throw Object.assign(new Error('Client not found'), { status: 404 });
  const areaDone = (checklist.staff_items || []).every((i) => i.done)
    && (!checklist.roi_staff_item || checklist.roi_staff_item.done)
    && (!checklist.documents_item || checklist.documents_item.done);
  if (!areaDone) {
    throw Object.assign(new Error('Complete staff setup, documents, and school ROI (if required) before marking onboarded'), { status: 400 });
  }
  if (checklist.staff_onboarding_completed_at
    || ['onboarded', 'current'].includes(String(checklist.status_key || '').toLowerCase())) {
    return checklist;
  }

  const client = await Client.findById(clientId, { includeSensitive: true });
  const onboardedId = await getClientStatusIdByKey({ agencyId: client.agency_id, statusKey: 'onboarded' });
  const updates = {
    staff_onboarding_completed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    staff_onboarding_completed_by_user_id: actorUserId || null,
    paper_packet_staff_roi_pending: 0
  };
  if (onboardedId) updates.client_status_id = onboardedId;
  await Client.update(clientId, updates, actorUserId);

  const providerUserId = checklist.provider_user_id || (await hasActiveProvider(clientId));
  if (providerUserId) {
    await createClientOnboardingTaskForProvider({
      providerUserId,
      clientId,
      clientLabel: client.identifier_code || client.full_name || client.initials,
      serviceDay: client.service_day || null,
      assignedByUserId: actorUserId
    });
  }

  return getClientOnboardingChecklist(clientId);
}

/**
 * After provider checklist fields save: promote onboarded → current when provider items complete.
 * Returning school clients need a weekday (or completed continue_school) — last year's
 * first_service_at alone must not keep them Current.
 */
export async function maybePromoteOnboardedToCurrent({ clientId, actorUserId = null }) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) return { promoted: false };

  const checklist = await getClientOnboardingChecklist(clientId);
  if (!checklist) return { promoted: false };

  const statusKey = String(checklist.status_key || '').toLowerCase();
  if (statusKey === 'current') return { promoted: false };
  if (statusKey === 'terminated') return { promoted: false };

  const school = isSchoolClient(client);
  const returning = school && isReturningSchoolClient(client);
  const dayAssigned = await hasServiceDay(clientId, client);
  const fallContinue = continuationPlanIsContinue(client.continuation_services_json);

  if (returning) {
    // Fall returning: only become Current when they have a weekday this season
    // (or completed Continuing Services which assigns days).
    if (!dayAssigned && !fallContinue) return { promoted: false };
  } else {
    const staffReady = !!client.staff_onboarding_completed_at || statusKey === 'onboarded';
    if (!staffReady) return { promoted: false };
    if (!(checklist.provider_items || []).every((i) => i.done)) return { promoted: false };
    if (school && !dayAssigned) return { promoted: false };
  }

  const currentId = await getClientStatusIdByKey({ agencyId: client.agency_id, statusKey: 'current' });
  if (!currentId) return { promoted: false };

  await Client.update(clientId, { client_status_id: currentId }, actorUserId);
  const workflow = String(client.status || '').toUpperCase();
  if (workflow === 'PENDING_REVIEW' || workflow === 'PACKET' || !workflow || workflow === 'SCREENER') {
    try {
      await Client.updateStatus(clientId, 'ACTIVE', actorUserId, 'Auto-marked current after provider onboarding checklist');
    } catch {
      // best-effort
    }
  }

  notifyClientBecameCurrent({
    agencyId: client.agency_id,
    schoolOrganizationId: client.organization_id,
    clientId: client.id,
    providerUserId: client.provider_id,
    clientNameOrIdentifier: client.identifier_code || client.full_name || client.initials,
    serviceDay: client.service_day || null,
    intakeAt: client.intake_at ? String(client.intake_at).slice(0, 10) : null,
    firstServiceAt: client.first_service_at ? String(client.first_service_at).slice(0, 10) : null,
    parentsContactedAt: client.parents_contacted_at ? String(client.parents_contacted_at).slice(0, 10) : null,
    parentsContactedSuccessful: client.parents_contacted_successful === 1 || client.parents_contacted_successful === true,
    actorUserId
  }).catch(() => {});

  return { promoted: true };
}

/**
 * Queue of intakes needing staff onboarding (school and/or office).
 */
export async function listOnboardingQueue({ agencyId, scope = 'all', limit = 100 }) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const lim = Math.max(1, Math.min(Number(limit) || 100, 300));
  const scopeNorm = String(scope || 'all').toLowerCase();

  let typeClause = '';
  if (scopeNorm === 'school') typeClause = ` AND LOWER(COALESCE(c.client_type, '')) = 'school'`;
  else if (scopeNorm === 'office') {
    typeClause = ` AND LOWER(COALESCE(c.client_type, '')) IN ('clinical', 'learning', 'basic_nonclinical')`;
  }

  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.initials,
       c.full_name,
       c.identifier_code,
       c.client_type,
       c.agency_id,
       c.organization_id,
       o.name AS organization_name,
       o.organization_type,
       cs.status_key AS client_status_key,
       cs.label AS client_status_label,
       c.submission_date,
       c.paper_packet_staff_roi_pending,
       c.staff_onboarding_completed_at,
       c.insurance_type_id,
       c.provider_id,
       c.service_day,
       c.onboarding_docs_json,
       c.source,
       c.status,
       c.document_status,
       TRIM(CONCAT(COALESCE(pu.first_name, ''), ' ', COALESCE(pu.last_name, ''))) AS provider_name
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     LEFT JOIN agencies o ON o.id = c.organization_id
     LEFT JOIN users pu ON pu.id = c.provider_id
     WHERE c.agency_id = ?
       AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
       AND LOWER(COALESCE(cs.status_key, '')) IN ('packet', 'pending', 'screener', 'prospective', 'onboarded')
       AND (
         c.staff_onboarding_completed_at IS NULL
         OR LOWER(COALESCE(cs.status_key, '')) <> 'current'
       )
       ${typeClause}
     ORDER BY
       CASE WHEN LOWER(COALESCE(o.organization_type, '')) = 'school' THEN 0 ELSE 1 END,
       o.name ASC,
       c.submission_date DESC,
       c.id DESC
     LIMIT ${lim}`,
    [aid]
  );

  const out = [];
  for (const row of rows || []) {
    const checklist = await getClientOnboardingChecklist(row.id);
    if (!checklist) continue;
    if (checklist.phase === 'done') continue;
    const paperPacket = isPaperPacketClient(row);
    out.push({
      id: Number(row.id),
      initials: row.initials,
      full_name: row.full_name,
      identifier_code: row.identifier_code,
      client_type: row.client_type,
      source: row.source || null,
      is_paper_packet: paperPacket,
      organization_id: row.organization_id ? Number(row.organization_id) : null,
      organization_name: row.organization_name || null,
      client_status_key: row.client_status_key,
      client_status_label: row.client_status_label,
      submission_date: row.submission_date,
      provider_id: row.provider_id ? Number(row.provider_id) : null,
      provider_name: String(row.provider_name || '').trim() || null,
      service_day: row.service_day || null,
      insurance_type_id: row.insurance_type_id ? Number(row.insurance_type_id) : null,
      paper_packet_staff_roi_pending: row.paper_packet_staff_roi_pending === 1
        || row.paper_packet_staff_roi_pending === true,
      onboarding: {
        phase: checklist.phase,
        summary_label: checklist.summary_label,
        open_count: checklist.open_count,
        total_count: checklist.total_steps,
        complete_count: checklist.complete_steps,
        can_complete_staff_onboarding: checklist.can_complete_staff_onboarding
      }
    });
  }
  return out;
}

/**
 * Assigned clients awaiting provider onboarding steps (or still in staff phase for status view).
 */
export async function listProviderOnboardingQueue({ agencyId, providerUserId, limit = 100 }) {
  const aid = Number(agencyId || 0);
  const pid = Number(providerUserId || 0);
  if (!aid || !pid) return [];
  const lim = Math.max(1, Math.min(Number(limit) || 100, 300));

  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.initials,
       c.full_name,
       c.identifier_code,
       c.client_type,
       c.agency_id,
       c.organization_id,
       o.name AS organization_name,
       cs.status_key AS client_status_key,
       cs.label AS client_status_label,
       c.submission_date,
       c.paper_packet_staff_roi_pending,
       c.staff_onboarding_completed_at,
       c.insurance_type_id,
       c.provider_id,
       c.service_day,
       c.source,
       c.status,
       c.document_status,
       c.parents_contacted_at,
       c.parents_contacted_successful,
       c.intake_at,
       c.first_service_at,
       TRIM(CONCAT(COALESCE(pu.first_name, ''), ' ', COALESCE(pu.last_name, ''))) AS provider_name
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     LEFT JOIN agencies o ON o.id = c.organization_id
     LEFT JOIN users pu ON pu.id = c.provider_id
     WHERE c.agency_id = ?
       AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
       AND LOWER(COALESCE(cs.status_key, '')) IN ('onboarded', 'packet', 'pending', 'screener', 'prospective')
       AND (
         c.provider_id = ?
         OR EXISTS (
           SELECT 1
           FROM client_provider_assignments cpa
           WHERE cpa.client_id = c.id
             AND cpa.provider_user_id = ?
             AND cpa.is_active = TRUE
         )
       )
     ORDER BY
       CASE WHEN c.staff_onboarding_completed_at IS NULL THEN 0 ELSE 1 END,
       o.name ASC,
       c.submission_date DESC,
       c.id DESC
     LIMIT ${lim}`,
    [aid, pid, pid]
  );

  const out = [];
  for (const row of rows || []) {
    const checklist = await getClientOnboardingChecklist(row.id);
    if (!checklist) continue;
    if (checklist.phase === 'done') continue;
    const paperPacket = isPaperPacketClient(row);
    const providerItems = checklist.provider_items || [];
    out.push({
      id: Number(row.id),
      initials: row.initials,
      full_name: row.full_name,
      identifier_code: row.identifier_code,
      client_type: row.client_type,
      source: row.source || null,
      is_paper_packet: paperPacket,
      organization_id: row.organization_id ? Number(row.organization_id) : null,
      organization_name: row.organization_name || null,
      client_status_key: row.client_status_key,
      client_status_label: row.client_status_label,
      submission_date: row.submission_date,
      provider_id: row.provider_id ? Number(row.provider_id) : null,
      provider_name: String(row.provider_name || '').trim() || null,
      service_day: row.service_day || null,
      insurance_type_id: row.insurance_type_id ? Number(row.insurance_type_id) : null,
      parents_contacted_at: row.parents_contacted_at || null,
      parents_contacted_successful: row.parents_contacted_successful,
      intake_at: row.intake_at || null,
      first_service_at: row.first_service_at || null,
      paper_packet_staff_roi_pending: row.paper_packet_staff_roi_pending === 1
        || row.paper_packet_staff_roi_pending === true,
      onboarding: {
        phase: checklist.phase,
        summary_label: checklist.summary_label,
        open_count: checklist.open_count,
        total_count: checklist.total_steps,
        complete_count: checklist.complete_steps,
        provider_open_count: providerItems.filter((i) => !i.done).length,
        provider_total_count: providerItems.length,
        can_complete_staff_onboarding: checklist.can_complete_staff_onboarding
      }
    });
  }
  return out;
}

export { isAssignedProvider };

export default {
  getClientOnboardingChecklist,
  updateClientOnboardingDocs,
  markPaperPacketSignatureReceived,
  acknowledgeRoiStaffOnboarding,
  updateOnboardingRoiExpiration,
  completeStaffOnboarding,
  maybePromoteOnboardedToCurrent,
  listOnboardingQueue,
  listProviderOnboardingQueue,
  isAssignedProvider,
  REQUIRED_PACKET_DOC_KEYS,
  PAPER_PACKET_SIGNATURE_KEYS
};
