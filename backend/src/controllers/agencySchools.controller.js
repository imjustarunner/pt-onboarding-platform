import { validationResult } from 'express-validator';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function isMissingSchemaError(e) {
  const code = e?.code || '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const msg = String(e?.message || '');
  return msg.includes("doesn't exist") || msg.includes('Unknown column');
}

function makeInClausePlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

export const listAgencySchools = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const includeInactive = req.query.includeInactive === 'true';
    const rows = await AgencySchool.listBillingSchoolsByAgency(agencyId, { includeInactive });

    // Best-effort: attach district_name from school_profiles (used for sorting/filtering in admin UIs).
    try {
      const schoolIds = (rows || []).map((r) => safeInt(r?.school_organization_id)).filter(Boolean);
      if (schoolIds.length) {
        // Lazy import to avoid touching pool for callers that don't need it.
        const { default: pool } = await import('../config/database.js');
        const placeholders = makeInClausePlaceholders(schoolIds.length);
        const [spRows] = await pool.execute(
          `SELECT school_organization_id, district_name
           FROM school_profiles
           WHERE school_organization_id IN (${placeholders})`,
          schoolIds
        );
        const byId = new Map((spRows || []).map((r) => [safeInt(r.school_organization_id), r.district_name]));
        for (const r of rows || []) {
          const sid = safeInt(r?.school_organization_id);
          r.district_name = sid ? (byId.get(sid) || null) : null;
        }
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const linkAgencySchool = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { agencyId } = req.params;
    const { schoolOrganizationId, isActive } = req.body;

    const school = await Agency.findById(parseInt(schoolOrganizationId, 10));
    if (!school) {
      return res.status(404).json({ error: { message: 'School organization not found' } });
    }
    const orgType = (school.organization_type || 'agency').toLowerCase();
    const allowedOrgTypes = ['school', 'program', 'learning', 'clinical'];
    if (!allowedOrgTypes.includes(orgType)) {
      return res.status(400).json({ error: { message: `Provided organization must be one of: ${allowedOrgTypes.join(', ')}` } });
    }

    const linked = await AgencySchool.upsert({
      agencyId,
      schoolOrganizationId,
      isActive: isActive !== undefined ? !!isActive : true
    });

    // Keep organization_affiliations in sync (this is what billing counts too).
    try {
      await OrganizationAffiliation.upsert({
        agencyId,
        organizationId: schoolOrganizationId,
        isActive: isActive !== undefined ? !!isActive : true
      });
    } catch {
      // best-effort (older DBs may not have table yet)
    }

    res.status(201).json(linked);
  } catch (error) {
    next(error);
  }
};

export const unlinkAgencySchool = async (req, res, next) => {
  try {
    const { agencyId, schoolOrganizationId } = req.params;
    const ok = await AgencySchool.setActive({ agencyId, schoolOrganizationId, isActive: false });
    // Also deactivate org affiliation (best-effort).
    try {
      await OrganizationAffiliation.upsert({ agencyId, organizationId: schoolOrganizationId, isActive: false });
    } catch {
      // ignore
    }
    if (!ok) {
      return res.status(404).json({ error: { message: 'Link not found' } });
    }
    res.json({ message: 'School unlinked successfully' });
  } catch (error) {
    next(error);
  }
};

// Convenience: list all school organizations for linking (searchable)
export const listSchoolOrganizations = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const includeInactive = req.user?.role === 'super_admin';
    const orgTypes = ['school', 'program', 'learning', 'clinical'];

    const all = [];
    for (const t of orgTypes) {
      const rows = await Agency.findByType(t, includeInactive);
      all.push(...rows);
    }

    const filtered = search
      ? all.filter(s => String(s.name || '').toLowerCase().includes(search) || String(s.slug || '').toLowerCase().includes(search))
      : all;

    // Best-effort: attach district_name for school orgs (used for sorting/filtering in admin UIs).
    try {
      const schoolIds = (filtered || [])
        .filter((o) => String(o?.organization_type || '').toLowerCase() === 'school')
        .map((o) => safeInt(o?.id))
        .filter(Boolean);
      if (schoolIds.length) {
        const { default: pool } = await import('../config/database.js');
        const placeholders = makeInClausePlaceholders(schoolIds.length);
        const [spRows] = await pool.execute(
          `SELECT school_organization_id, district_name
           FROM school_profiles
           WHERE school_organization_id IN (${placeholders})`,
          schoolIds
        );
        const byId = new Map((spRows || []).map((r) => [safeInt(r.school_organization_id), r.district_name]));
        for (const o of filtered || []) {
          if (String(o?.organization_type || '').toLowerCase() !== 'school') continue;
          const sid = safeInt(o?.id);
          o.district_name = sid ? (byId.get(sid) || null) : null;
        }
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    // Best-effort: attach affiliated agency id (so super_admin UIs can resolve owning agency).
    // This is critical for client creation, which requires agency_id to be the parent agency org.
    try {
      const orgIds = (filtered || []).map((o) => safeInt(o?.id)).filter(Boolean);
      if (orgIds.length) {
        const { default: pool } = await import('../config/database.js');
        const placeholders = makeInClausePlaceholders(orgIds.length);
        // Pick the most recently-updated active affiliation per org.
        const [oaRows] = await pool.execute(
          `SELECT oa.organization_id, oa.agency_id
           FROM organization_affiliations oa
           INNER JOIN (
             SELECT organization_id, MAX(updated_at) AS max_updated
             FROM organization_affiliations
             WHERE is_active = TRUE AND organization_id IN (${placeholders})
             GROUP BY organization_id
           ) pick
             ON pick.organization_id = oa.organization_id
            AND pick.max_updated = oa.updated_at
           WHERE oa.is_active = TRUE`,
          orgIds
        );
        const byOrg = new Map((oaRows || []).map((r) => [safeInt(r.organization_id), safeInt(r.agency_id)]));
        for (const o of filtered || []) {
          const id = safeInt(o?.id);
          o.affiliated_agency_id = id ? (byOrg.get(id) || null) : null;
        }
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      // ignore (older DBs may not have org affiliations yet)
    }

    res.json(filtered);
  } catch (error) {
    next(error);
  }
};

