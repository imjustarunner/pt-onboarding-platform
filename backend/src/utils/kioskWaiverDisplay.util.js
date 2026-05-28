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

function hasAllergiesContent(allergies) {
  if (!allergies) return false;
  return !!(
    allergies.allergies
    || allergies.approvedSnacks
    || (allergies.approvedSnacksList && allergies.approvedSnacksList.length)
    || allergies.notes
    || allergies.noSnacks
    || allergies.applyNone
  );
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
    || null
  );
}

function resolveClientIndexInIntake(intakeData, clientId) {
  const cid = Number(clientId);
  if (!cid) return -1;

  const candidates = [
    ...(Array.isArray(intakeData?.clients) ? intakeData.clients : []),
    ...(Array.isArray(intakeData?.responses?.clients) ? intakeData.responses.clients : [])
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    const id = Number(row?.id || row?.clientId || row?.client_id || 0);
    if (id === cid) return i;
  }

  if (Number(intakeData?.clientId || intakeData?.client_id || 0) === cid) return 0;
  if (Array.isArray(intakeData?.clients) && intakeData.clients.length === 1) return 0;
  return -1;
}

function intakeSectionHasPayload(key, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.declineEmergencyContacts === true || payload.declinePickupAuthorization === true) {
    return false;
  }
  return legacySectionHasPayload(payload, key);
}

/**
 * Build profile-shaped waiver sections from a finalized intake submission.
 * Used when guardian_client_waiver_profiles was never populated.
 */
export function extractProfileSectionsFromIntakeData(intakeData, clientId) {
  const bundle = resolveGuardianWaiverIntakeBundle(intakeData);
  if (!bundle) return null;

  const idx = resolveClientIndexInIntake(intakeData, clientId);
  if (idx < 0) return null;

  const row = Array.isArray(bundle.clients) ? bundle.clients[idx] : null;
  if (!row?.sections || typeof row.sections !== 'object') return null;

  const out = {};
  for (const [key, sec] of Object.entries(row.sections)) {
    if (!sec || typeof sec !== 'object') continue;
    const payload = sec.payload;
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
  if (pickupPayload && !pickupPayload.declinePickupAuthorization && (!fillMissingOnly || !entry.authorizedPickups.length)) {
    const pickups = Array.isArray(pickupPayload.authorizedPickups) ? pickupPayload.authorizedPickups : [];
    for (const p of pickups) {
      const name = String(p?.name || '').trim();
      if (!name) continue;
      const dedupeKey = `${name}|${String(p?.phone || '').trim()}`.toLowerCase();
      dedupeContact(entry.authorizedPickups, {
        name,
        relationship: String(p?.relationship || '').trim() || null,
        phone: String(p?.phone || '').trim() || null,
        governmentIdRequired: !!p?.governmentIdRequired
      }, dedupeKey);
    }
  }

  const emergencyPayload = readActiveSectionPayload(sections, 'emergency_contacts');
  if (emergencyPayload && !emergencyPayload.declineEmergencyContacts && (!fillMissingOnly || !entry.emergencyContacts.length)) {
    const contacts = Array.isArray(emergencyPayload.contacts) ? emergencyPayload.contacts : [];
    for (const e of contacts) {
      const name = String(e?.name || '').trim();
      if (!name) continue;
      const dedupeKey = `${name}|${String(e?.phone || '').trim()}`.toLowerCase();
      dedupeContact(entry.emergencyContacts, {
        name,
        relationship: String(e?.relationship || '').trim() || null,
        phone: String(e?.phone || '').trim() || null,
        canPickup: !!e?.canPickup
      }, dedupeKey);
    }
  }

  const walkHomePayload = readActiveSectionPayload(sections, 'walk_home_authorization');
  if (walkHomePayload && (!fillMissingOnly || !entry.walkHome)) {
    entry.walkHome = {
      allowedToWalkHome: walkHomePayload.allowedToWalkHome === true,
      allowedWindow: String(walkHomePayload.allowedWindow || '').trim() || null,
      route: String(walkHomePayload.route || '').trim() || null,
      conditions: String(walkHomePayload.conditions || '').trim() || null
    };
  }

  const allergiesPayload = readActiveSectionPayload(sections, 'allergies_snacks');
  if (allergiesPayload && (!fillMissingOnly || !hasAllergiesContent(entry.allergies))) {
    entry.allergies = {
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
