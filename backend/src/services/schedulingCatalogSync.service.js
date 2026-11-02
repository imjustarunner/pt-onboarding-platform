import pool from '../config/database.js';
import { DEFAULT_MEDICAL_SERVICE_CODES } from './medicalBillingDefaults.service.js';
import { defaultClinicalNoteType, isClinicalAddon } from '../utils/clinicalServiceCodeCatalog.js';

/** Only canonical defaults may populate shared eligibility. Agency-specific
 * permissions are resolved in that agency; never promote them to global grants.
 * INSERT IGNORE preserves explicit shared denials, inactive rows and overrides. */
export async function ensureSchedulingCatalogEntry(serviceCode, { db = pool } = {}) {
  const code = String(serviceCode || '').trim().toUpperCase();
  const def = DEFAULT_MEDICAL_SERVICE_CODES.find(row => row.serviceCode === code);
  if (!def || isClinicalAddon(code, def)) return { synced: false };
  await db.execute(`INSERT IGNORE INTO scheduling_service_codes
    (code, label, is_billable, default_note_type, min_duration_minutes, is_active)
    VALUES (?, ?, TRUE, ?, ?, TRUE)`,
  [code, String(def.description || code).slice(0, 160), defaultClinicalNoteType(code), def.minMinutes ?? null]);
  for (const tier of def.allowedCredentialTiers || []) {
    await db.execute(`INSERT IGNORE INTO credential_service_code_eligibility
      (credential_tier, service_code, allowed) VALUES (?, ?, TRUE)`, [tier, code]);
  }
  return { synced: true, code };
}
