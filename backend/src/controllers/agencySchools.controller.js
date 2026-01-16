import { validationResult } from 'express-validator';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

export const listAgencySchools = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const includeInactive = req.query.includeInactive === 'true';
    const rows = await AgencySchool.listByAgency(agencyId, { includeInactive });
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
    const allowedOrgTypes = ['school', 'program', 'learning'];
    if (!allowedOrgTypes.includes(orgType)) {
      return res.status(400).json({ error: { message: `Provided organization must be one of: ${allowedOrgTypes.join(', ')}` } });
    }

    const linked = await AgencySchool.upsert({
      agencyId,
      schoolOrganizationId,
      isActive: isActive !== undefined ? !!isActive : true
    });

    res.status(201).json(linked);
  } catch (error) {
    next(error);
  }
};

export const unlinkAgencySchool = async (req, res, next) => {
  try {
    const { agencyId, schoolOrganizationId } = req.params;
    const ok = await AgencySchool.setActive({ agencyId, schoolOrganizationId, isActive: false });
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
    const orgTypes = ['school', 'program', 'learning'];

    const all = [];
    for (const t of orgTypes) {
      const rows = await Agency.findByType(t, includeInactive);
      all.push(...rows);
    }

    const filtered = search
      ? all.filter(s => String(s.name || '').toLowerCase().includes(search) || String(s.slug || '').toLowerCase().includes(search))
      : all;

    res.json(filtered);
  } catch (error) {
    next(error);
  }
};

