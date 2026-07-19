/**
 * Per-business-type default suites for tenant_services + booking_packages.
 * Idempotent: skips names that already exist for the agency + business type.
 * Single-flight per agency so parallel list endpoints cannot triple-seed.
 */

import pool from '../config/database.js';
import TenantService from '../models/TenantService.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import AgencyBusinessType from '../models/AgencyBusinessType.model.js';
import { BUSINESS_TYPE_SERVICE_SUITES } from '../config/tenantServiceSuiteCatalog.js';

export { BUSINESS_TYPE_SERVICE_SUITES };

/** @type {Map<number, Promise<{createdServices:number,createdPackages:number,types:string[],dedupedServices:number,dedupedPackages:number}>>} */
const inFlightByAgency = new Map();

function existingNameSet(rows) {
  return new Set((rows || []).map((r) => String(r.name || '').trim().toLowerCase()).filter(Boolean));
}

function nameKey(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Soft-deactivate duplicate active services/packages (same agency + business type + name).
 * Keeps the lowest id (oldest) as the survivor.
 */
export async function dedupeTenantServiceSuitesForAgency(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return { dedupedServices: 0, dedupedPackages: 0 };

  const [svcDupes] = await pool.execute(
    `SELECT business_type, LOWER(TRIM(name)) AS name_key, MIN(id) AS keep_id, COUNT(*) AS cnt
     FROM tenant_services
     WHERE agency_id = ? AND is_active = 1
     GROUP BY business_type, LOWER(TRIM(name))
     HAVING cnt > 1`,
    [aid]
  );

  let dedupedServices = 0;
  for (const row of svcDupes || []) {
    const [result] = await pool.execute(
      `UPDATE tenant_services
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ?
         AND business_type = ?
         AND LOWER(TRIM(name)) = ?
         AND is_active = 1
         AND id <> ?`,
      [aid, row.business_type, row.name_key, Number(row.keep_id)]
    );
    dedupedServices += Number(result?.affectedRows || 0);
  }

  const [pkgDupes] = await pool.execute(
    `SELECT business_type, LOWER(TRIM(name)) AS name_key, MIN(id) AS keep_id, COUNT(*) AS cnt
     FROM booking_packages
     WHERE agency_id = ? AND is_active = 1
     GROUP BY business_type, LOWER(TRIM(name))
     HAVING cnt > 1`,
    [aid]
  );

  let dedupedPackages = 0;
  for (const row of pkgDupes || []) {
    const [result] = await pool.execute(
      `UPDATE booking_packages
       SET is_active = 0
       WHERE agency_id = ?
         AND business_type = ?
         AND LOWER(TRIM(name)) = ?
         AND is_active = 1
         AND id <> ?`,
      [aid, row.business_type, row.name_key, Number(row.keep_id)]
    );
    dedupedPackages += Number(result?.affectedRows || 0);
  }

  return { dedupedServices, dedupedPackages };
}

async function ensureTenantServiceSuitesForAgencyInner(agencyId, { businessTypes = null } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    return {
      createdServices: 0,
      createdPackages: 0,
      types: [],
      dedupedServices: 0,
      dedupedPackages: 0
    };
  }

  // Repair any prior race duplicates first.
  const dedupe = await dedupeTenantServiceSuitesForAgency(aid);

  let enabled = businessTypes;
  if (!Array.isArray(enabled) || !enabled.length) {
    const rows = await AgencyBusinessType.listForAgency(aid);
    enabled = rows.filter((t) => t.isEnabled).map((t) => t.businessType);
  } else {
    enabled = enabled
      .map((t) => (typeof t === 'string' ? t : t?.businessType || t?.business_type))
      .map((c) => AgencyBusinessType.normalizeType(c))
      .filter(Boolean);
  }

  const existingServices = await TenantService.listForAgency(aid, { includeInactive: true });
  const existingPackages = await BookingPackage.listForAgency(aid, { includeInactive: true });

  let createdServices = 0;
  let createdPackages = 0;
  const seededTypes = [];

  for (const bt of enabled) {
    const suite = BUSINESS_TYPE_SERVICE_SUITES[bt];
    if (!suite) continue;

    const typedServices = existingServices.filter((s) => s.businessType === bt);
    const svcNames = existingNameSet(typedServices);
    const svcCodes = new Set(
      typedServices.map((s) => String(s.serviceCode || '').trim().toUpperCase()).filter(Boolean)
    );
    const pkgNames = existingNameSet(existingPackages.filter((p) => p.businessType === bt));
    let typeCreated = false;

    for (const svc of suite.services || []) {
      const key = nameKey(svc.name);
      const code = String(svc.serviceCode || '').trim().toUpperCase();
      if (!key && !code) continue;

      const byCode = code
        ? typedServices.find((s) => String(s.serviceCode || '').toUpperCase() === code)
        : null;
      const byName = key
        ? typedServices.find((s) => nameKey(s.name) === key)
        : null;
      const match = byCode || byName;

      if (match) {
        // Backfill CPT/HCPCS onto older rows seeded before service_code existed.
        if (code && !match.serviceCode) {
          await TenantService.update(match.id, aid, { serviceCode: code });
          match.serviceCode = code;
          svcCodes.add(code);
        }
        continue;
      }
      if ((key && svcNames.has(key)) || (code && svcCodes.has(code))) continue;

      const created = await TenantService.create(aid, { ...svc, businessType: bt });
      if (created) {
        existingServices.push(created);
        typedServices.push(created);
        if (key) svcNames.add(key);
        if (code) svcCodes.add(code);
        createdServices += 1;
        typeCreated = true;
      }
    }

    for (const pkg of suite.packages || []) {
      const key = nameKey(pkg.name);
      if (!key || pkgNames.has(key)) continue;
      const created = await BookingPackage.create(aid, { ...pkg, businessType: bt });
      if (created) {
        existingPackages.push(created);
        pkgNames.add(key);
        createdPackages += 1;
        typeCreated = true;
      }
    }

    if (typeCreated) seededTypes.push(bt);
  }

  // Mirror clinical codes into payroll + medical (and pull any missing ITSCO pay codes into booking).
  try {
    const { reconcileAgencyServiceCodeCatalog } = await import('./agencyServiceCodeCatalog.service.js');
    await reconcileAgencyServiceCodeCatalog(aid);
  } catch {
    /* optional catalog sync */
  }

  return {
    createdServices,
    createdPackages,
    types: seededTypes,
    dedupedServices: dedupe.dedupedServices,
    dedupedPackages: dedupe.dedupedPackages
  };
}

/**
 * Ensure default services + packages exist for each enabled business type.
 * Does not overwrite admin edits — only inserts missing names.
 */
export async function ensureTenantServiceSuitesForAgency(agencyId, opts = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    return {
      createdServices: 0,
      createdPackages: 0,
      types: [],
      dedupedServices: 0,
      dedupedPackages: 0
    };
  }

  const existing = inFlightByAgency.get(aid);
  if (existing) return existing;

  const promise = ensureTenantServiceSuitesForAgencyInner(aid, opts).finally(() => {
    if (inFlightByAgency.get(aid) === promise) inFlightByAgency.delete(aid);
  });
  inFlightByAgency.set(aid, promise);
  return promise;
}
