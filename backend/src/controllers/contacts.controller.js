import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import AgencyContact from '../models/AgencyContact.model.js';
import ContactCommunicationLog from '../models/ContactCommunicationLog.model.js';
import Client from '../models/Client.model.js';
import {
  userCanSeeAllAgencyContacts,
  listVisibleContactIdsForUser,
  userCanSeeContact
} from '../services/contactAccess.service.js';
import { resolveContactsForAudience } from '../services/contactCampaignAudience.service.js';

async function assertAgencyAccess(req, agencyId, { requireAdmin = false } = {}) {
  const aid = parseInt(agencyId, 10);
  if (!aid) throw Object.assign(new Error('Invalid agencyId'), { status: 400 });
  const agency = await Agency.findById(aid);
  if (!agency) throw Object.assign(new Error('Agency not found'), { status: 404 });
  const role = req.user?.role;
  const adminRoles = ['super_admin', 'admin', 'support', 'staff', 'provider_plus'];
  if (adminRoles.includes(role)) {
    return agency;
  }
  if (requireAdmin) {
    throw Object.assign(new Error('Admin access required'), { status: 403 });
  }
  const agencies = await User.getAgencies(req.user.id);
  const hasAccess = (agencies || []).some((a) => Number(a?.id) === aid);
  if (!hasAccess) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  return agency;
}

function mapContactRow(row, { includeClientLink = false, userCanSeeClient = false } = {}) {
  const c = {
    id: row.id,
    agency_id: row.agency_id,
    created_by_user_id: row.created_by_user_id,
    share_with_all: row.share_with_all === 1 || row.share_with_all === true,
    client_id: row.client_id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    source_ref_id: row.source_ref_id,
    is_active: row.is_active === 1 || row.is_active === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    school_ids: row.school_ids || [],
    provider_ids: row.provider_ids || []
  };
  if (includeClientLink && row.client_id && userCanSeeClient) {
    c.client_link = `/admin/clients/${row.client_id}`;
  }
  return c;
}

export const listByAgency = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    await assertAgencyAccess(req, agencyId);
    const { schoolId, providerId, clientId, shareWithAll } = req.query || {};
    const userId = req.user?.id;
    const role = req.user?.role;

    const visibleIds = await listVisibleContactIdsForUser(agencyId, userId, role);
    if (visibleIds.length === 0) {
      return res.json([]);
    }

    const placeholders = visibleIds.map(() => '?').join(',');
    const conditions = [`ac.id IN (${placeholders})`];
    const params = [...visibleIds];

    if (schoolId) {
      conditions.push('EXISTS (SELECT 1 FROM contact_school_assignments csa WHERE csa.contact_id = ac.id AND csa.school_organization_id = ?)');
      params.push(parseInt(schoolId, 10));
    }
    if (providerId) {
      conditions.push('EXISTS (SELECT 1 FROM contact_provider_assignments cpa WHERE cpa.contact_id = ac.id AND cpa.provider_user_id = ?)');
      params.push(parseInt(providerId, 10));
    }
    if (clientId) {
      conditions.push('ac.client_id = ?');
      params.push(parseInt(clientId, 10));
    }
    if (shareWithAll === 'true' || shareWithAll === '1') {
      conditions.push('ac.share_with_all = TRUE');
    }

    const [rows] = await pool.execute(
      `SELECT ac.*,
        (SELECT JSON_ARRAYAGG(school_organization_id) FROM contact_school_assignments WHERE contact_id = ac.id) AS school_ids,
        (SELECT JSON_ARRAYAGG(provider_user_id) FROM contact_provider_assignments WHERE contact_id = ac.id) AS provider_ids
       FROM agency_contacts ac
       WHERE ${conditions.join(' AND ')}
       ORDER BY ac.full_name ASC, ac.created_at DESC`,
      params
    );

    const canSeeClient = userCanSeeAllAgencyContacts(role);
    const contacts = (rows || []).map((r) => {
      const schoolIds = r.school_ids;
      const providerIds = r.provider_ids;
      const parsed = {
        ...r,
        school_ids: Array.isArray(schoolIds) ? schoolIds : (typeof schoolIds === 'string' ? JSON.parse(schoolIds || '[]') : []),
        provider_ids: Array.isArray(providerIds) ? providerIds : (typeof providerIds === 'string' ? JSON.parse(providerIds || '[]') : [])
      };
      return mapContactRow(parsed, { includeClientLink: true, userCanSeeClient: canSeeClient });
    });

    res.json(contacts);
  } catch (e) {
    next(e);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const contact = await AgencyContact.findById(id);
    if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } });

    const canSee = await userCanSeeContact(contact, req.user?.id, req.user?.role);
    if (!canSee) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    try {
      await assertAgencyAccess(req, contact.agency_id);
    } catch {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const schoolIds = await AgencyContact.listSchoolIds(id);
    const providerIds = await AgencyContact.listProviderIds(id);
    const result = mapContactRow(
      { ...contact, school_ids: schoolIds, provider_ids: providerIds },
      { includeClientLink: true, userCanSeeClient: canSee }
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const create = async (req, res, next) => {
  try {
    const { agencyId, fullName, email, phone, shareWithAll, clientId, schoolIds, providerIds } = req.body || {};
    const aid = parseInt(agencyId, 10);
    if (!aid) return res.status(400).json({ error: { message: 'agencyId is required' } });

    await assertAgencyAccess(req, aid, { requireAdmin: true });
    const userId = req.user?.id;

    const contact = await AgencyContact.create({
      agencyId: aid,
      createdByUserId: userId,
      shareWithAll: shareWithAll === true || shareWithAll === 'true',
      clientId: clientId ? parseInt(clientId, 10) : null,
      fullName: fullName || null,
      email: email || null,
      phone: phone || null,
      source: 'manual'
    });

    if (contact.share_with_all === 0 && userId) {
      const agencies = await User.getAgencies(userId);
      const isProvider = req.user?.role === 'provider' || req.user?.role === 'provider_plus';
      if (isProvider) {
        await AgencyContact.addProviderAssignment(contact.id, userId);
      }
    }
    if (schoolIds && Array.isArray(schoolIds)) {
      for (const sid of schoolIds) {
        if (sid) await AgencyContact.addSchoolAssignment(contact.id, parseInt(sid, 10));
      }
    }
    if (providerIds && Array.isArray(providerIds)) {
      for (const pid of providerIds) {
        if (pid) await AgencyContact.addProviderAssignment(contact.id, parseInt(pid, 10));
      }
    }
    if (clientId && contact.client_id) {
      const client = await Client.findById(contact.client_id);
      if (client?.organization_id) {
        await AgencyContact.addSchoolAssignment(contact.id, client.organization_id);
      }
      if (client?.provider_id) {
        await AgencyContact.addProviderAssignment(contact.id, client.provider_id);
      }
    }

    const result = await AgencyContact.findById(contact.id);
    const resultSchoolIds = await AgencyContact.listSchoolIds(contact.id);
    const resultProviderIds = await AgencyContact.listProviderIds(contact.id);
    res.status(201).json(mapContactRow({ ...result, school_ids: resultSchoolIds, provider_ids: resultProviderIds }));
  } catch (e) {
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const contact = await AgencyContact.findById(id);
    if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } });

    const canSee = await userCanSeeContact(contact, req.user?.id, req.user?.role);
    if (!canSee) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const canEdit = userCanSeeAllAgencyContacts(req.user?.role) || Number(contact.created_by_user_id) === Number(req.user?.id);
    if (!canEdit) {
      return res.status(403).json({ error: { message: 'Only creator or agency staff can edit' } });
    }

    const { fullName, email, phone, shareWithAll, clientId, schoolIds, providerIds } = req.body || {};
    const patch = {};
    if (fullName !== undefined) patch.full_name = fullName;
    if (email !== undefined) patch.email = email;
    if (phone !== undefined) patch.phone = phone;
    if (shareWithAll !== undefined) patch.share_with_all = shareWithAll;
    if (clientId !== undefined) patch.client_id = clientId ? parseInt(clientId, 10) : null;

    const updated = await AgencyContact.update(id, patch);

    if (schoolIds !== undefined && Array.isArray(schoolIds)) {
      const existing = await AgencyContact.listSchoolIds(id);
      for (const sid of existing) {
        if (!schoolIds.includes(sid)) await AgencyContact.removeSchoolAssignment(id, sid);
      }
      for (const sid of schoolIds) {
        if (sid) await AgencyContact.addSchoolAssignment(id, parseInt(sid, 10));
      }
    }
    if (providerIds !== undefined && Array.isArray(providerIds)) {
      const existing = await AgencyContact.listProviderIds(id);
      for (const pid of existing) {
        if (!providerIds.includes(pid)) await AgencyContact.removeProviderAssignment(id, pid);
      }
      for (const pid of providerIds) {
        if (pid) await AgencyContact.addProviderAssignment(id, parseInt(pid, 10));
      }
    }

    const resultSchoolIds = await AgencyContact.listSchoolIds(id);
    const resultProviderIds = await AgencyContact.listProviderIds(id);
    res.json(mapContactRow({ ...updated, school_ids: resultSchoolIds, provider_ids: resultProviderIds }));
  } catch (e) {
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const contact = await AgencyContact.findById(id);
    if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } });

    const canSee = await userCanSeeContact(contact, req.user?.id, req.user?.role);
    if (!canSee) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const canEdit = userCanSeeAllAgencyContacts(req.user?.role) || Number(contact.created_by_user_id) === Number(req.user?.id);
    if (!canEdit) {
      return res.status(403).json({ error: { message: 'Only creator or agency staff can delete' } });
    }

    await AgencyContact.update(id, { is_active: false });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listCommunications = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const contact = await AgencyContact.findById(id);
    if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } });

    const canSee = await userCanSeeContact(contact, req.user?.id, req.user?.role);
    if (!canSee) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const limit = Math.min(parseInt(req.query?.limit, 10) || 50, 100);
    const offset = parseInt(req.query?.offset, 10) || 0;

    const rows = await ContactCommunicationLog.listByContactId(id, { limit, offset });
    const total = await ContactCommunicationLog.countByContactId(id);

    const items = rows.map((r) => ({
      id: r.id,
      contact_id: r.contact_id,
      channel: r.channel,
      direction: r.direction,
      body: ContactCommunicationLog.decryptBody(r),
      external_ref_id: r.external_ref_id,
      metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null,
      created_at: r.created_at
    }));

    res.json({ items, total });
  } catch (e) {
    next(e);
  }
};

export const sync = async (req, res, next) => {
  try {
    const { agencyId } = req.body || req.query || {};
    const aid = parseInt(agencyId, 10);
    if (!aid) return res.status(400).json({ error: { message: 'agencyId is required' } });

    await assertAgencyAccess(req, aid, { requireAdmin: true });

    const { runContactAutoSync } = await import('../services/contactAutoSync.service.js');
    const result = await runContactAutoSync(aid);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * Resolve contacts for mass-communications audience targeting.
 * Query params: schoolId, providerId, clientId (at least one required for targeting).
 */
export const listAudience = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    await assertAgencyAccess(req, agencyId);
    const { schoolId, providerId, clientId } = req.query || {};

    const target = {};
    if (schoolId) target.schoolId = parseInt(schoolId, 10);
    if (providerId) target.providerId = parseInt(providerId, 10);
    if (clientId) target.clientId = parseInt(clientId, 10);

    const contacts = await resolveContactsForAudience(agencyId, target);

    const userId = req.user?.id;
    const role = req.user?.role;
    const visibleIds = new Set(await listVisibleContactIdsForUser(agencyId, userId, role));
    const filtered = contacts.filter((c) => visibleIds.has(c.id));

    res.json(filtered);
  } catch (e) {
    next(e);
  }
};
