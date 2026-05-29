/**
 * Parse guardian waiver sections for event kiosk rosters (resource tab, checkout).
 */

const LEGACY_SECTION_PAYLOAD_KEYS = {
  pickup_authorization: ['authorizedPickups', 'declinePickupAuthorization'],
  emergency_contacts: ['contacts', 'declineEmergencyContacts'],
  walk_home_authorization: ['allowedToWalkHome', 'allowedWindow', 'route', 'conditions', 'attestation'],
  allergies_snacks: ['allergies', 'approvedSnacks', 'approvedSnacksList', 'notes', 'applyNone', 'noSnacks'],
  meal_preferences: ['allowedMeals', 'restrictedMeals', 'mealChoice', 'mealNotes', 'notes']
};

export function parseWaiverSectionsJson(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
}

function legacySectionHasPayload(row, key) {
  const keys = LEGACY_SECTION_PAYLOAD_KEYS[key] || [];
  return keys.some((k) => {
    const v = row[k];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

/**
 * Read a waiver section payload for kiosk display.
 * Matches guardian billing (uses payload when present) and also accepts
 * legacy rows where payload fields sit directly on the section object.
 */
export function readActiveSectionPayload(sections, key) {
  const row = sections?.[key];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;

  const status = String(row.status || '').toLowerCase();
  if (status === 'revoked') return null;

  const nested = row.payload;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested;
  }

  if (legacySectionHasPayload(row, key)) {
    return row;
  }

  return null;
}

function dedupeContact(list, item, dedupeKey) {
  if (list.some((x) => x._k === dedupeKey)) return;
  list.push({ _k: dedupeKey, ...item });
}

function normalizeAllergiesPayload(allergiesPayload) {
  if (!allergiesPayload) return null;
  return {
    allergies: String(allergiesPayload.allergies || '').trim(),
    approvedSnacks: String(allergiesPayload.approvedSnacks || '').trim(),
    approvedSnacksList: Array.isArray(allergiesPayload.approvedSnacksList)
      ? allergiesPayload.approvedSnacksList.map((s) => String(s || '').trim()).filter(Boolean)
      : [],
    noSnacks: !!allergiesPayload.noSnacks,
    notes: String(allergiesPayload.notes || '').trim(),
    applyNone: allergiesPayload.applyNone === true
  };
}

function mergeAllergiesPayloadIntoEntry(entry, allergiesPayload, fillMissingOnly) {
  const incoming = normalizeAllergiesPayload(allergiesPayload);
  if (!incoming) return;

  if (!fillMissingOnly || !entry.allergies) {
    entry.allergies = incoming;
    return;
  }

  const cur = entry.allergies;
  if (!String(cur.allergies || '').trim() && incoming.allergies) {
    cur.allergies = incoming.allergies;
  }
  if (!String(cur.approvedSnacks || '').trim() && incoming.approvedSnacks) {
    cur.approvedSnacks = incoming.approvedSnacks;
  }
  if (incoming.approvedSnacksList.length) {
    const merged = new Set([
      ...(Array.isArray(cur.approvedSnacksList) ? cur.approvedSnacksList : []),
      ...incoming.approvedSnacksList
    ]);
    cur.approvedSnacksList = [...merged];
  }
  if (!cur.noSnacks && incoming.noSnacks) cur.noSnacks = true;
  if (!String(cur.notes || '').trim() && incoming.notes) cur.notes = incoming.notes;
  if (!cur.applyNone && incoming.applyNone) cur.applyNone = true;
}

function hasMealsContent(meals) {
  if (!meals) return false;
  return !!(meals.allowedMeals || meals.restrictedMeals || meals.notes || meals.mealChoice || meals.mealNotes);
}

function resolveGuardianWaiverIntakeBundle(intakeData) {
  if (!intakeData || typeof intakeData !== 'object') return null;
  return (
    intakeData?.responses?.submission?.guardianWaiverIntake
    || intakeData?.submission?.guardianWaiverIntake
    || intakeData?.guardianWaiverIntake
    || null
  );
}

/**
 * Normalize flat intake_data (submission/guardian/clients at top level) into the
 * nested responses.* shape kiosk + intake readers expect.
 */
export function normalizeIntakeDataShape(intakeData) {
  if (!intakeData || typeof intakeData !== 'object') return intakeData;
  const flatSubmission = (intakeData.submission && typeof intakeData.submission === 'object' && !Array.isArray(intakeData.submission))
    ? intakeData.submission
    : null;
  const flatGuardianResp = (intakeData.guardianResponses && typeof intakeData.guardianResponses === 'object')
    ? intakeData.guardianResponses
    : null;
  const existingResponses = (intakeData.responses && typeof intakeData.responses === 'object')
    ? intakeData.responses
    : null;

  const mergedSubmission = (existingResponses?.submission && typeof existingResponses.submission === 'object')
    ? { ...(flatSubmission || {}), ...existingResponses.submission }
    : (flatSubmission || {});

  const mergedGuardianResponses = (existingResponses?.guardian && typeof existingResponses.guardian === 'object')
    ? { ...(flatGuardianResp || {}), ...existingResponses.guardian }
    : (flatGuardianResp || {});

  let mergedClientResponses = null;
  if (Array.isArray(existingResponses?.clients) && existingResponses.clients.length) {
    mergedClientResponses = existingResponses.clients;
  } else if (Array.isArray(intakeData.clients)) {
    mergedClientResponses = intakeData.clients.map((c) => (c && typeof c === 'object' ? c : {}));
  }

  return {
    ...intakeData,
    responses: {
      ...(existingResponses || {}),
      submission: mergedSubmission,
      guardian: mergedGuardianResponses,
      clients: mergedClientResponses || (existingResponses?.clients || [])
    }
  };
}

function resolveClientIndexInIntake(intakeData, clientId, options = {}) {
  const cid = Number(clientId);
  if (!cid) return -1;

  const bundle = resolveGuardianWaiverIntakeBundle(intakeData);
  const bundleClients = Array.isArray(bundle?.clients) ? bundle.clients : [];

  const preferredIndex = Number(options.preferredIndex);
  if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < bundleClients.length) {
    return preferredIndex;
  }

  for (let i = 0; i < bundleClients.length; i += 1) {
    const row = bundleClients[i];
    const id = Number(row?.id || row?.clientId || row?.client_id || 0);
    if (id === cid) return i;
  }

  const candidates = [
    ...(Array.isArray(intakeData?.clients) ? intakeData.clients : []),
    ...(Array.isArray(intakeData?.responses?.clients) ? intakeData.responses.clients : [])
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    const id = Number(row?.id || row?.clientId || row?.client_id || 0);
    if (id === cid) {
      return Math.min(i, Math.max(bundleClients.length - 1, 0));
    }
  }

  if (Number(intakeData?.clientId || intakeData?.client_id || 0) === cid) return 0;
  if (Array.isArray(intakeData?.clients) && intakeData.clients.length === 1) return 0;
  if (bundleClients.length === 1) return 0;
  return -1;
}

function intakeSectionHasPayload(key, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.declineEmergencyContacts === true || payload.declinePickupAuthorization === true) {
    return false;
  }
  if (key === 'walk_home_authorization' && payload.allowedToWalkHome === true) {
    return true;
  }
  return legacySectionHasPayload(payload, key);
}

/** Privacy-friendly roster label: first name + last initial (e.g. "Azula O."). */
export function formatKioskClientDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Client';
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || '';
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

/** Whole years from a date-of-birth string/date. */
export function ageFromDateOfBirth(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (!Number.isFinite(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const monthDelta = today.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function mergeWalkHomePayload(entry, walkHomePayload, fillMissingOnly) {
  if (!walkHomePayload) return;
  const allowed = walkHomePayload.allowedToWalkHome === true;
  const next = {
    allowedToWalkHome: allowed,
    allowedWindow: String(walkHomePayload.allowedWindow || '').trim() || null,
    route: String(walkHomePayload.route || '').trim() || null,
    conditions: String(walkHomePayload.conditions || '').trim() || null,
    onFile: true
  };
  if (allowed) {
    entry.walkHome = next;
    return;
  }
  if (!entry.walkHome) {
    entry.walkHome = next;
    return;
  }
  if (!fillMissingOnly && !entry.walkHome.allowedToWalkHome) {
    entry.walkHome = { ...entry.walkHome, onFile: true };
  }
}

/** Include linked guardians and emergency contacts flagged for pickup. */
export function mergeGuardiansIntoKioskPickups(entry, guardians = []) {
  for (const g of guardians || []) {
    const name = String(g?.name || '').trim();
    if (!name) continue;
    const dedupeKey = `guardian|${Number(g.userId) || name}|${String(g.phone || '').trim()}`.toLowerCase();
    dedupeContact(entry.authorizedPickups, {
      name,
      relationship: String(g.relationship || '').trim() || 'Guardian',
      phone: String(g.phone || '').trim() || null,
      source: 'guardian',
      userId: g.userId ? Number(g.userId) : null
    }, dedupeKey);
  }

  for (const e of entry.emergencyContacts || []) {
    if (!e.canPickup) continue;
    const name = String(e?.name || '').trim();
    if (!name) continue;
    const dedupeKey = `emergency|${name}|${String(e?.phone || '').trim()}`.toLowerCase();
    dedupeContact(entry.authorizedPickups, {
      name,
      relationship: String(e.relationship || '').trim() || 'Emergency contact',
      phone: String(e.phone || '').trim() || null,
      source: 'emergency_contact'
    }, dedupeKey);
  }
}

/**
 * Build profile-shaped sections from waiver history rows (latest create/update per key).
 * @param {Array<{ section_key: string, payload_json: unknown, created_at?: string }>} rows
 */
export function buildSectionsFromWaiverHistoryRows(rows) {
  const latestByKey = new Map();
  for (const row of rows || []) {
    const key = String(row?.section_key || '').trim();
    if (!key || latestByKey.has(key)) continue;
    let payload = row.payload_json;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    latestByKey.set(key, {
      status: 'active',
      payload,
      updated_at: row.created_at || null
    });
  }
  return Object.fromEntries(latestByKey);
}

export function clientHasWalkHomeAuthorization(entry) {
  return entry?.walkHome?.allowedToWalkHome === true;
}

export function clientHasReleasePickupOptions(entry) {
  return Array.isArray(entry?.authorizedPickups) && entry.authorizedPickups.length > 0;
}

export function clientCheckoutBlocked(entry) {
  return !clientHasReleasePickupOptions(entry) && !clientHasWalkHomeAuthorization(entry);
}

/** Guardians + waiver pickups + strip internal keys. */
export function finalizeKioskClientWaiverEntry(entry, guardians = []) {
  mergeGuardiansIntoKioskPickups(entry, guardians);
  stripKioskClientDedupeKeys(entry);
}

/**
 * Build profile-shaped waiver sections from a finalized intake submission.
 * Used when guardian_client_waiver_profiles was never populated.
 */
export function extractProfileSectionsFromIntakeData(intakeData, clientId, options = {}) {
  const normalized = normalizeIntakeDataShape(intakeData);
  const bundle = resolveGuardianWaiverIntakeBundle(normalized);
  if (!bundle) return null;

  const idx = resolveClientIndexInIntake(normalized, clientId, options);
  if (idx < 0) return null;

  const row = Array.isArray(bundle.clients) ? bundle.clients[idx] : null;
  if (!row?.sections || typeof row.sections !== 'object') return null;

  const out = {};
  for (const [key, sec] of Object.entries(row.sections)) {
    if (!sec || typeof sec !== 'object') continue;
    let payload = sec.payload;
    if ((!payload || typeof payload !== 'object' || Array.isArray(payload)) && legacySectionHasPayload(sec, key)) {
      payload = sec;
    }
    if (!intakeSectionHasPayload(key, payload)) continue;
    out[key] = { status: 'active', payload };
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Merge waiver sections into a kiosk client entry (mutates entry).
 * @param {object} entry - { authorizedPickups, emergencyContacts, walkHome, allergies, meals, waiverUpdatedAt }
 * @param {object} sections - parsed sections_json
 * @param {string|Date|null} [profileUpdatedAt]
 * @param {{ fillMissingOnly?: boolean }} [options]
 */
export function mergeWaiverSectionsIntoKioskClient(entry, sections, profileUpdatedAt, options = {}) {
  const fillMissingOnly = options.fillMissingOnly === true;

  const pickupPayload = readActiveSectionPayload(sections, 'pickup_authorization');
  if (pickupPayload && !pickupPayload.declinePickupAuthorization) {
    const pickups = Array.isArray(pickupPayload.authorizedPickups) ? pickupPayload.authorizedPickups : [];
    for (const p of pickups) {
      const name = String(p?.name || '').trim();
      if (!name) continue;
      const dedupeKey = `pickup|${name}|${String(p?.phone || '').trim()}`.toLowerCase();
      dedupeContact(entry.authorizedPickups, {
        name,
        relationship: String(p?.relationship || '').trim() || null,
        phone: String(p?.phone || '').trim() || null,
        governmentIdRequired: !!p?.governmentIdRequired,
        source: 'waiver'
      }, dedupeKey);
    }
  }

  const emergencyPayload = readActiveSectionPayload(sections, 'emergency_contacts');
  if (emergencyPayload && !emergencyPayload.declineEmergencyContacts) {
    const contacts = Array.isArray(emergencyPayload.contacts) ? emergencyPayload.contacts : [];
    for (const e of contacts) {
      const name = String(e?.name || '').trim();
      if (!name) continue;
      const dedupeKey = `emergency|${name}|${String(e?.phone || '').trim()}`.toLowerCase();
      dedupeContact(entry.emergencyContacts, {
        name,
        relationship: String(e?.relationship || '').trim() || null,
        phone: String(e?.phone || '').trim() || null,
        canPickup: !!e?.canPickup
      }, dedupeKey);
    }
  }

  const walkHomePayload = readActiveSectionPayload(sections, 'walk_home_authorization');
  if (walkHomePayload && (!fillMissingOnly || !entry.walkHome || !entry.walkHome.allowedToWalkHome)) {
    mergeWalkHomePayload(entry, walkHomePayload, fillMissingOnly);
  }

  const allergiesPayload = readActiveSectionPayload(sections, 'allergies_snacks');
  if (allergiesPayload) {
    mergeAllergiesPayloadIntoEntry(entry, allergiesPayload, fillMissingOnly);
  }

  const mealsPayload = readActiveSectionPayload(sections, 'meal_preferences');
  if (mealsPayload && (!fillMissingOnly || !hasMealsContent(entry.meals))) {
    entry.meals = {
      allowedMeals: String(mealsPayload.allowedMeals || '').trim(),
      restrictedMeals: String(mealsPayload.restrictedMeals || '').trim(),
      notes: String(mealsPayload.notes || '').trim(),
      mealChoice: String(mealsPayload.mealChoice || '').trim(),
      mealNotes: String(mealsPayload.mealNotes || '').trim()
    };
  }

  if (profileUpdatedAt) {
    const ts = new Date(profileUpdatedAt);
    if (Number.isFinite(ts.getTime())) {
      if (!entry.waiverUpdatedAt || ts > new Date(entry.waiverUpdatedAt)) {
        entry.waiverUpdatedAt = profileUpdatedAt;
      }
    }
  }
}

/** Strip internal dedupe keys before API response. */
export function stripKioskClientDedupeKeys(entry) {
  entry.authorizedPickups = (entry.authorizedPickups || []).map(({ _k, ...rest }) => rest);
  entry.emergencyContacts = (entry.emergencyContacts || []).map(({ _k, ...rest }) => rest);
}

export function emptyKioskClientWaiverFields() {
  return {
    authorizedPickups: [],
    emergencyContacts: [],
    walkHome: null,
    allergies: null,
    meals: null,
    waiverUpdatedAt: null
  };
}
