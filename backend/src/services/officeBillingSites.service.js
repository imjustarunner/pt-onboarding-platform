/**
 * Office billing sites: district → credentialed office, POS templates, archive transitions.
 */
import pool from '../config/database.js';
import {
  isDistrict11Name,
  isDistrict12Name,
  isDpsName
} from '../utils/districtCompliance.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import ActivityLogService from './activityLog.service.js';

export const OFFICE_POS_TEMPLATES = [
  { name: 'Office', placeOfService: '11', modifiers: null },
  { name: 'Telehealth', placeOfService: '02', modifiers: 'GT' },
  { name: "Telehealth - In Patient's Home", placeOfService: '10', modifiers: null },
  { name: 'Home', placeOfService: '12', modifiers: null }
];

export async function resolveBillingOfficeForSchool({ agencyId, schoolOrganizationId } = {}) {
  const aid = Number(agencyId || 0);
  const sid = Number(schoolOrganizationId || 0);
  if (!aid || !sid) return null;

  let district = null;
  try {
    const [rows] = await pool.execute(
      `SELECT district_name FROM school_profiles WHERE school_organization_id = ? LIMIT 1`,
      [sid]
    );
    district = rows?.[0]?.district_name || null;
  } catch {
    district = null;
  }

  const offices = await OfficeLocation.findByAgencyMembership(aid, { includeInactive: false }).catch(() =>
    OfficeLocation.findByAgency(aid, { includeInactive: false })
  );
  const list = offices || [];
  const wind = list.find((o) => /windchime/i.test(`${o.name || ''} ${o.street_address || ''}`));
  const denver = list.find((o) => /denver/i.test(`${o.name || ''}`) || String(o.city || '').toLowerCase() === 'denver');

  if (isDpsName(district)) return denver || wind || list[0] || null;
  if (isDistrict11Name(district) || isDistrict12Name(district)) return wind || list[0] || null;
  return wind || denver || list[0] || null;
}

export async function ensureOfficePosTemplates(agencyId, officeLocationId, { actorUserId = null } = {}) {
  const aid = Number(agencyId || 0);
  const oid = Number(officeLocationId || 0);
  if (!aid || !oid) return [];
  const office = await OfficeLocation.findById(oid);
  if (!office || Number(office.is_active) === 0) return [];

  const created = [];
  for (const tpl of OFFICE_POS_TEMPLATES) {
    const existing = await findOfficePosTemplate(aid, oid, tpl.placeOfService);
    if (existing) continue;
    const item = await AgencyServiceLocation.create({
      agencyId: aid,
      name: tpl.name,
      placeOfService: tpl.placeOfService,
      streetAddress: office.street_address || null,
      city: office.city || null,
      state: office.state || null,
      postalCode: office.postal_code || null,
      notes: `Office POS template for ${office.name}`,
      requiresCredentialing: false,
      billingOfficeLocationId: oid,
      schoolOrganizationId: null,
      createdByUserId: actorUserId,
      locationKind: 'office_pos',
      defaultModifiers: tpl.modifiers,
      isProviderVisible: true
    });
    if (item) created.push(item);
  }
  return created;
}

async function findOfficePosTemplate(agencyId, officeId, placeOfService) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_service_locations
       WHERE agency_id = ?
         AND billing_office_location_id = ?
         AND place_of_service = ?
         AND location_kind = 'office_pos'
         AND is_active = 1
       LIMIT 1`,
      [agencyId, officeId, placeOfService]
    );
    return rows?.[0] || null;
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      const [rows] = await pool.execute(
        `SELECT * FROM agency_service_locations
         WHERE agency_id = ?
           AND billing_office_location_id = ?
           AND place_of_service = ?
           AND school_organization_id IS NULL
           AND is_active = 1
         LIMIT 1`,
        [agencyId, officeId, placeOfService]
      );
      return rows?.[0] || null;
    }
    throw e;
  }
}

/**
 * Filter booking POS options for a provider: office templates for their assigned offices
 * (or all offices if none assigned), plus school sites for those offices.
 */
export function filterServiceLocationsForProvider(locations = [], officeIds = []) {
  const list = Array.isArray(locations) ? locations : [];
  const allowed = new Set((officeIds || []).map((n) => Number(n)).filter((n) => n > 0));
  if (!allowed.size) {
    // No assignment → show all provider-visible locations (legacy behavior).
    return list.filter((l) => l.is_provider_visible == null || Number(l.is_provider_visible) !== 0);
  }
  return list.filter((l) => {
    if (l.is_provider_visible != null && Number(l.is_provider_visible) === 0) return false;
    const billOffice = Number(l.billing_office_location_id || l.billingOfficeLocationId || 0);
    if (!billOffice) return true;
    return allowed.has(billOffice);
  });
}

export async function listUserOfficeIds(userId) {
  const uid = Number(userId || 0);
  if (!uid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT office_location_id FROM user_office_locations
       WHERE user_id = ? AND is_active = 1`,
      [uid]
    );
    return (rows || []).map((r) => Number(r.office_location_id)).filter((n) => n > 0);
  } catch {
    return [];
  }
}

/**
 * When archiving/replacing an office, move school + POS templates to the replacement
 * and notify via activity log (callers may also create Tasks).
 */
export async function transitionOfficeBillingSites({
  fromOfficeId,
  toOfficeId,
  agencyId = null,
  actorUserId = null,
  req = null
} = {}) {
  const fromId = Number(fromOfficeId || 0);
  const toId = Number(toOfficeId || 0);
  if (!fromId || !toId || fromId === toId) {
    const err = new Error('fromOfficeId and toOfficeId are required and must differ');
    err.status = 400;
    throw err;
  }
  const from = await OfficeLocation.findById(fromId);
  const to = await OfficeLocation.findById(toId);
  if (!from || !to) {
    const err = new Error('Office not found');
    err.status = 404;
    throw err;
  }

  const [result] = await pool.execute(
    `UPDATE agency_service_locations
     SET billing_office_location_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE billing_office_location_id = ?`,
    [toId, fromId]
  );

  const moved = Number(result?.affectedRows || 0);
  const aid = Number(agencyId || to.agency_id || from.agency_id || 0) || null;

  ActivityLogService.logActivity({
    userId: actorUserId || null,
    agencyId: aid,
    actionType: 'office_billing_sites_transitioned',
    metadata: {
      fromOfficeId: fromId,
      fromOfficeName: from.name,
      toOfficeId: toId,
      toOfficeName: to.name,
      serviceLocationsMoved: moved
    }
  }, req);

  return {
    fromOffice: from,
    toOffice: to,
    serviceLocationsMoved: moved
  };
}

export default {
  OFFICE_POS_TEMPLATES,
  resolveBillingOfficeForSchool,
  ensureOfficePosTemplates,
  filterServiceLocationsForProvider,
  listUserOfficeIds,
  transitionOfficeBillingSites
};
