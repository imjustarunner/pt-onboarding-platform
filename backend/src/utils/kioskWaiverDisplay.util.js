/**
 * Parse guardian waiver sections for event kiosk rosters (resource tab, checkout).
 */

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

/** Active signed section payload, or null when revoked / missing. */
export function readActiveSectionPayload(sections, key) {
  const row = sections?.[key];
  if (!row || typeof row !== 'object') return null;
  if (row.status && String(row.status).toLowerCase() !== 'active') return null;
  const payload = row.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
}

function dedupeContact(list, item, dedupeKey) {
  if (list.some((x) => x._k === dedupeKey)) return;
  list.push({ _k: dedupeKey, ...item });
}

/**
 * Merge waiver sections into a kiosk client entry (mutates entry).
 * @param {object} entry - { authorizedPickups, emergencyContacts, walkHome, allergies, meals, waiverUpdatedAt }
 * @param {object} sections - parsed sections_json
 * @param {string|Date|null} [profileUpdatedAt]
 */
export function mergeWaiverSectionsIntoKioskClient(entry, sections, profileUpdatedAt) {
  const pickupPayload = readActiveSectionPayload(sections, 'pickup_authorization');
  if (pickupPayload && !pickupPayload.declinePickupAuthorization) {
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
  if (emergencyPayload && !emergencyPayload.declineEmergencyContacts) {
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
  if (walkHomePayload) {
    entry.walkHome = {
      allowedToWalkHome: walkHomePayload.allowedToWalkHome === true,
      allowedWindow: String(walkHomePayload.allowedWindow || '').trim() || null,
      route: String(walkHomePayload.route || '').trim() || null,
      conditions: String(walkHomePayload.conditions || '').trim() || null
    };
  }

  const allergiesPayload = readActiveSectionPayload(sections, 'allergies_snacks');
  if (allergiesPayload) {
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
  if (mealsPayload) {
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
