import pool from '../config/database.js';
import {
  GUARDIAN_WAIVER_ESIGN_KEY,
  evaluateWaiverCompleteness,
  isSectionSatisfied,
  resolveRequiredSectionKeys
} from '../utils/guardianWaivers.utils.js';
import {
  ageFromDateOfBirth,
  clientHasReleasePickupOptions,
  emptyKioskClientWaiverFields,
  finalizeKioskClientWaiverEntry,
  mergeWaiverSectionsIntoKioskClient,
  parseWaiverSectionsJson,
  readActiveSectionPayload
} from '../utils/kioskWaiverDisplay.util.js';
import {
  getCompanyEventWaiverJson,
  isWaiversEnabledForClient,
  loadIntakeWaiverSectionsFallbackForClientIds,
  loadWaiverHistorySectionsFallbackForClientIds,
  upsertGuardianWaiverSection
} from './guardianWaivers.service.js';

async function loadGuardiansForClientIds(clientIds) {
  const ids = [...new Set((clientIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT cg.client_id, cg.guardian_user_id,
              CONCAT(gu.first_name, ' ', gu.last_name) AS guardian_name,
              gu.email AS guardian_email,
              gu.phone_number AS guardian_phone
       FROM client_guardians cg
       INNER JOIN users gu ON gu.id = cg.guardian_user_id
       WHERE cg.client_id IN (${ph})
         AND (cg.access_enabled = 1 OR cg.access_enabled IS NULL)
       ORDER BY cg.client_id ASC, cg.id ASC`,
      ids
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function loadWaiverProfilesForClientIds(clientIds) {
  const ids = [...new Set((clientIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT client_id, guardian_user_id, sections_json, updated_at
       FROM guardian_client_waiver_profiles
       WHERE client_id IN (${ph})
       ORDER BY client_id ASC, updated_at ASC, id ASC`,
      ids
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function loadKioskPickupsForClientIds(clientIds) {
  const ids = [...new Set((clientIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT client_id, name, relationship, phone
       FROM client_kiosk_pickups
       WHERE client_id IN (${ph})
       ORDER BY client_id ASC, added_at ASC`,
      ids
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

/**
 * Save kiosk-added pickup contacts for a client.
 * Replaces all existing kiosk pickups for this client, then inserts the new list.
 * No guardian or signature required — kiosk-level operational data.
 */
export async function saveKioskPickupsForClient({ clientId, companyEventId = null, pickups = [], addedByName = null }) {
  const cid = Number(clientId);
  if (!cid) throw Object.assign(new Error('clientId is required'), { status: 400 });
  const eid = Number(companyEventId) || null;
  const clean = (pickups || [])
    .map((p) => ({
      name: String(p?.name || '').trim(),
      relationship: String(p?.relationship || '').trim() || null,
      phone: String(p?.phone || '').trim() || null
    }))
    .filter((p) => p.name);

  await pool.execute('DELETE FROM client_kiosk_pickups WHERE client_id = ?', [cid]);
  for (const p of clean) {
    await pool.execute(
      `INSERT INTO client_kiosk_pickups
         (client_id, company_event_id, name, relationship, phone, added_by_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cid, eid, p.name, p.relationship, p.phone, addedByName || null]
    );
  }
  return clean;
}

/** Shared waiver merge for kiosk check-in, check-out, and release validation. */
export async function buildKioskClientWaiverEntry(clientId) {
  const cid = Number(clientId);
  if (!cid) return null;

  let dateOfBirth = null;
  try {
    const [rows] = await pool.execute(
      'SELECT full_name, date_of_birth FROM clients WHERE id = ? LIMIT 1',
      [cid]
    );
    dateOfBirth = rows?.[0]?.date_of_birth ? String(rows[0].date_of_birth).slice(0, 10) : null;
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && !String(err?.message || '').includes('date_of_birth')) {
      throw err;
    }
    await pool.execute('SELECT full_name FROM clients WHERE id = ? LIMIT 1', [cid]).catch(() => [[]]);
  }

  const entry = {
    id: cid,
    dateOfBirth,
    ageYears: ageFromDateOfBirth(dateOfBirth),
    guardians: [],
    ...emptyKioskClientWaiverFields()
  };

  const [guardianRows, waiverRows, intakeFallback, historyFallback, kioskPickupRows] = await Promise.all([
    loadGuardiansForClientIds([cid]),
    loadWaiverProfilesForClientIds([cid]),
    loadIntakeWaiverSectionsFallbackForClientIds([cid]),
    loadWaiverHistorySectionsFallbackForClientIds([cid]),
    loadKioskPickupsForClientIds([cid])
  ]);

  for (const g of guardianRows) {
    if (Number(g.client_id) !== cid || !g.guardian_user_id) continue;
    entry.guardians.push({
      userId: Number(g.guardian_user_id),
      name: g.guardian_name ? String(g.guardian_name).trim() : null,
      email: g.guardian_email || null,
      phone: g.guardian_phone || null
    });
  }

  for (const w of waiverRows) {
    if (Number(w.client_id) !== cid) continue;
    mergeWaiverSectionsIntoKioskClient(entry, parseWaiverSectionsJson(w.sections_json), w.updated_at);
  }

  const intakeRow = intakeFallback.get(cid);
  if (intakeRow) {
    mergeWaiverSectionsIntoKioskClient(entry, intakeRow.sections, intakeRow.updatedAt, { fillMissingOnly: true });
  }

  const historyRow = historyFallback.get(cid);
  if (historyRow) {
    mergeWaiverSectionsIntoKioskClient(entry, historyRow.sections, historyRow.updatedAt, { fillMissingOnly: true });
  }

  // Merge kiosk-added pickups — always show them, fill missing slots only
  for (const kp of kioskPickupRows) {
    if (Number(kp.client_id) !== cid) continue;
    mergeWaiverSectionsIntoKioskClient(entry, {
      pickup_authorization: {
        status: 'active',
        payload: { authorizedPickups: [{ name: kp.name, relationship: kp.relationship || '', phone: kp.phone || '' }] }
      }
    }, new Date().toISOString(), { fillMissingOnly: false });
  }

  finalizeKioskClientWaiverEntry(entry, entry.guardians);
  return entry;
}

async function evaluateProgramEventWaiverGate({ companyEventId, guardianUserId, clientId }) {
  const enabled = await isWaiversEnabledForClient(clientId);
  if (!enabled) {
    return {
      enabled: false,
      complete: true,
      missing: [],
      requiredKeys: [],
      sections: {},
      pickupRequired: false,
      pickupSatisfied: true,
      esignActive: false
    };
  }

  const ev = await getCompanyEventWaiverJson(companyEventId);
  const requiredKeys = resolveRequiredSectionKeys(null, ev?.event_required_json);
  const pickupRequired = requiredKeys.includes('pickup_authorization');

  const gid = Number(guardianUserId);
  const cid = Number(clientId);
  let sections = {};
  if (gid && cid) {
    const [prows] = await pool.execute(
      'SELECT sections_json FROM guardian_client_waiver_profiles WHERE guardian_user_id = ? AND client_id = ? LIMIT 1',
      [gid, cid]
    );
    const raw = prows?.[0]?.sections_json;
    if (raw) {
      try {
        sections = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        sections = {};
      }
    }
  }

  const { complete, missing, sections: parsedSections } = evaluateWaiverCompleteness(sections, requiredKeys);
  const esignActive = isSectionSatisfied(GUARDIAN_WAIVER_ESIGN_KEY, parsedSections);
  const pickupSatisfied = isSectionSatisfied('pickup_authorization', parsedSections);

  return {
    enabled: true,
    complete,
    missing,
    requiredKeys,
    sections: parsedSections,
    pickupRequired,
    pickupSatisfied,
    esignActive
  };
}

function pickupPayloadFromSections(sections) {
  const payload = readActiveSectionPayload(sections, 'pickup_authorization');
  if (!payload || payload.declinePickupAuthorization) return null;
  return payload;
}

function emergencyPayloadFromSections(sections) {
  const payload = readActiveSectionPayload(sections, 'emergency_contacts');
  if (!payload || payload.declineEmergencyContacts) return null;
  return payload;
}

/** Check-in sheet: approved pickups + waiver status for guardian signing at the kiosk. */
export async function getEventKioskClientCheckinSheet({ companyEventId, clientId, guardianUserId = null }) {
  const cid = Number(clientId);
  const entry = await buildKioskClientWaiverEntry(cid);
  if (!entry) return null;

  const guardians = entry.guardians || [];
  const gid = Number(guardianUserId) || guardians[0]?.userId || null;

  const gate = await evaluateProgramEventWaiverGate({
    companyEventId,
    guardianUserId: gid,
    clientId: cid
  });

  const pickupPayload = gid ? pickupPayloadFromSections(gate.sections) : null;
  const emergencyPayload = gid ? emergencyPayloadFromSections(gate.sections) : null;
  const walkHomePayload = gid ? readActiveSectionPayload(gate.sections, 'walk_home_authorization') : null;
  const allergiesPayload = gid ? readActiveSectionPayload(gate.sections, 'allergies_snacks') : null;
  const emergencyContacts = entry.emergencyContacts || [];

  const pickupRequired = gate.enabled && gate.pickupRequired;
  const pickupSatisfied = !pickupRequired || gate.pickupSatisfied;
  const esignActive = !gate.enabled || gate.esignActive;

  return {
    clientId: cid,
    guardianUserId: gid,
    waiversEnabled: gate.enabled,
    guardians,
    authorizedPickups: entry.authorizedPickups || [],
    emergencyContacts,
    hasEmergencyContacts: emergencyContacts.length > 0,
    hasPickupOptions: clientHasReleasePickupOptions(entry),
    walkHome: entry.walkHome,
    allergies: entry.allergies || null,
    canCheckIn: !gate.enabled || pickupSatisfied,
    gate: {
      pickupRequired,
      pickupSatisfied,
      esignActive,
      needsEsignBeforePickup: pickupRequired && !gate.esignActive,
      missing: gate.missing
    },
    pickupSection: pickupPayload
      ? {
          authorizedPickups: Array.isArray(pickupPayload.authorizedPickups) ? pickupPayload.authorizedPickups : [],
          declinePickupAuthorization: !!pickupPayload.declinePickupAuthorization
        }
      : null,
    emergencySection: emergencyPayload
      ? {
          contacts: Array.isArray(emergencyPayload.contacts) ? emergencyPayload.contacts : [],
          declineEmergencyContacts: !!emergencyPayload.declineEmergencyContacts
        }
      : null,
    walkHomeSection: walkHomePayload && typeof walkHomePayload === 'object'
      ? {
          allowedToWalkHome: walkHomePayload.allowedToWalkHome === true,
          allowedWindow: String(walkHomePayload.allowedWindow || '').trim() || null,
          route: String(walkHomePayload.route || '').trim() || null,
          conditions: String(walkHomePayload.conditions || '').trim() || null,
          attestation: !!walkHomePayload.attestation
        }
      : null,
    allergiesSection: allergiesPayload && typeof allergiesPayload === 'object'
      ? {
          allergies: String(allergiesPayload.allergies || '').trim(),
          approvedSnacks: String(allergiesPayload.approvedSnacks || '').trim(),
          approvedSnacksList: Array.isArray(allergiesPayload.approvedSnacksList)
            ? allergiesPayload.approvedSnacksList
            : [],
          noSnacks: !!allergiesPayload.noSnacks,
          notes: String(allergiesPayload.notes || '').trim(),
          applyNone: allergiesPayload.applyNone === true
        }
      : null,
    sectionStatus: gid
      ? {
          esignature_consent: gate.sections?.esignature_consent?.status || null,
          pickup_authorization: gate.sections?.pickup_authorization?.status || null,
          emergency_contacts: gate.sections?.emergency_contacts?.status || null,
          walk_home_authorization: gate.sections?.walk_home_authorization?.status || null,
          allergies_snacks: gate.sections?.allergies_snacks?.status || null
        }
      : null
  };
}

export async function saveEventKioskClientWaiverSection({
  companyEventId,
  clientId,
  guardianUserId,
  sectionKey,
  payload,
  signatureData,
  consentAcknowledged,
  intentToSign,
  action,
  ipAddress,
  userAgent
}) {
  // Allow guardians to sign emergency contacts, walk-home, and allergies sections at the kiosk
  // regardless of whether the formal waiver gate is enabled for this event.
  // Formal pickup authorization and esign consent still respect the enabled flag.
  const nonGatedSections = ['emergency_contacts', 'walk_home_authorization', 'allergies_snacks'];
  const bypassEnabled = nonGatedSections.includes(sectionKey);

  if (!bypassEnabled) {
    const enabled = await isWaiversEnabledForClient(clientId);
    if (!enabled) {
      throw Object.assign(new Error('Guardian waivers are not enabled for this agency'), { status: 403 });
    }
  }

  const profile = await upsertGuardianWaiverSection({
    guardianUserId,
    clientId,
    sectionKey,
    payload,
    action,
    signatureData,
    consentAcknowledged,
    intentToSign,
    ipAddress,
    userAgent,
    linkCheckMode: 'relationship_exists',
    bypassWaiversEnabledCheck: bypassEnabled,
    skipEsignConsentCheck: bypassEnabled
  });

  const sheet = await getEventKioskClientCheckinSheet({
    companyEventId,
    clientId,
    guardianUserId
  });

  return { profile, sheet };
}
