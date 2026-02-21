import pool from '../config/database.js';
import AgencyContact from '../models/AgencyContact.model.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';

/**
 * Run full contact auto-sync for an agency.
 * Syncs from: client guardians, school_contacts, clients with contact_phone.
 */
export async function runContactAutoSync(agencyId) {
  const aid = Number(agencyId);
  if (!aid) throw new Error('agencyId is required');

  const stats = { guardians: 0, schoolContacts: 0, clients: 0, errors: [] };

  try {
    await syncFromClientGuardians(aid, stats);
  } catch (e) {
    stats.errors.push({ source: 'guardians', message: e?.message || String(e) });
  }

  try {
    await syncFromSchoolContacts(aid, stats);
  } catch (e) {
    stats.errors.push({ source: 'school_contacts', message: e?.message || String(e) });
  }

  try {
    await syncFromClients(aid, stats);
  } catch (e) {
    stats.errors.push({ source: 'clients', message: e?.message || String(e) });
  }

  return stats;
}

async function syncFromClientGuardians(agencyId, stats) {
  const [rows] = await pool.execute(
    `SELECT cg.id AS cg_id, cg.client_id, cg.guardian_user_id,
            c.agency_id, c.organization_id, c.provider_id
     FROM client_guardians cg
     JOIN clients c ON c.id = cg.client_id
     WHERE c.agency_id = ?`,
    [agencyId]
  );

  for (const row of rows || []) {
    const user = await User.findById(row.guardian_user_id);
    if (!user) continue;

    const email = user.email || null;
    const phone = User.normalizePhone(user.personal_phone || user.work_phone || user.phone_number) || null;
    if (!email && !phone) continue;

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || email || 'Guardian';

    const existing = await AgencyContact.findByEmail(email, agencyId) ||
      (phone ? await AgencyContact.findByPhone(phone, agencyId) : null);
    if (existing) {
      if (existing.source_ref_id !== row.cg_id) continue;
      continue;
    }

    const contact = await AgencyContact.create({
      agencyId,
      createdByUserId: null,
      shareWithAll: false,
      clientId: row.client_id,
      fullName,
      email,
      phone,
      source: 'auto_guardian',
      sourceRefId: row.cg_id
    });

    await AgencyContact.addSchoolAssignment(contact.id, row.organization_id);
    const [providers] = await pool.execute(
      'SELECT provider_user_id FROM client_provider_assignments WHERE client_id = ? AND is_active = TRUE',
      [row.client_id]
    );
    for (const p of providers || []) {
      if (p.provider_user_id) await AgencyContact.addProviderAssignment(contact.id, p.provider_user_id);
    }
    if (row.provider_id) {
      await AgencyContact.addProviderAssignment(contact.id, row.provider_id);
    }
    stats.guardians++;
  }
}

async function syncFromSchoolContacts(agencyId, stats) {
  const [rows] = await pool.execute(
    `SELECT id, school_organization_id, full_name, email
     FROM school_contacts
     WHERE school_organization_id = ?`,
    [agencyId]
  );

  for (const row of rows || []) {
    if (!row.email) continue;

    const existing = await AgencyContact.findByEmail(row.email, agencyId);
    if (existing && existing.source === 'auto_school' && existing.source_ref_id === row.id) continue;

    if (existing) continue;

    const contact = await AgencyContact.create({
      agencyId,
      createdByUserId: null,
      shareWithAll: true,
      clientId: null,
      fullName: row.full_name || null,
      email: row.email,
      phone: null,
      source: 'auto_school',
      sourceRefId: row.id
    });

    await AgencyContact.addSchoolAssignment(contact.id, row.school_organization_id);
    stats.schoolContacts++;
  }
}

async function syncFromClients(agencyId, stats) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, organization_id, provider_id, contact_phone, initials
     FROM clients
     WHERE agency_id = ? AND contact_phone IS NOT NULL AND contact_phone != ''`,
    [agencyId]
  );

  for (const row of rows || []) {
    const phone = Client.normalizePhone(row.contact_phone);
    if (!phone) continue;

    const existing = await AgencyContact.findByPhone(phone, agencyId);
    if (existing && existing.source === 'auto_client' && existing.source_ref_id === row.id) continue;
    if (existing) continue;

    const contact = await AgencyContact.create({
      agencyId,
      createdByUserId: null,
      shareWithAll: false,
      clientId: row.id,
      fullName: row.initials || `Client ${row.id}`,
      email: null,
      phone,
      source: 'auto_client',
      sourceRefId: row.id
    });

    await AgencyContact.addSchoolAssignment(contact.id, row.organization_id);
    if (row.provider_id) {
      await AgencyContact.addProviderAssignment(contact.id, row.provider_id);
    }
    const [providers] = await pool.execute(
      'SELECT provider_user_id FROM client_provider_assignments WHERE client_id = ? AND is_active = TRUE',
      [row.id]
    );
    for (const p of providers || []) {
      if (p.provider_user_id) await AgencyContact.addProviderAssignment(contact.id, p.provider_user_id);
    }
    stats.clients++;
  }
}
