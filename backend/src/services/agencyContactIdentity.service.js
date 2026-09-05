/**
 * Admin/support: link personal agency-contact duplicates into one identity group.
 * Linking does NOT grant provider access — assignment / share_with_all / created_by still control visibility.
 */
import { randomUUID } from 'crypto';
import pool from '../config/database.js';
import AgencyContact from '../models/AgencyContact.model.js';

function normEmail(v) {
  return String(v || '').trim().toLowerCase() || null;
}

function normPhone(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits || null;
}

/**
 * Merge contact IDs into one identity_group_id.
 * @returns {{ identityGroupId: string, contactIds: number[] }}
 */
export async function linkAgencyContactIdentities({
  agencyId,
  contactIds = [],
  linkedByUserId = null
} = {}) {
  const aid = Number(agencyId);
  const ids = [...new Set((contactIds || []).map((id) => Number(id)).filter((n) => n > 0))];
  if (!aid || ids.length < 2) {
    const err = new Error('agencyId and at least two contactIds are required');
    err.status = 400;
    throw err;
  }

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, agency_id, identity_group_id, is_active
     FROM agency_contacts
     WHERE id IN (${placeholders})`,
    ids
  );
  if (!rows?.length || rows.length !== ids.length) {
    const err = new Error('One or more contacts were not found');
    err.status = 404;
    throw err;
  }
  for (const r of rows) {
    if (Number(r.agency_id) !== aid) {
      const err = new Error('All contacts must belong to the same agency');
      err.status = 400;
      throw err;
    }
  }

  const existingGroups = [
    ...new Set(rows.map((r) => r.identity_group_id).filter(Boolean).map(String))
  ];
  let groupId = existingGroups[0] || randomUUID();

  // If contacts already sit in different groups, collapse into groupId
  if (existingGroups.length > 1) {
    const gPh = existingGroups.map(() => '?').join(',');
    await pool.execute(
      `UPDATE agency_contacts
       SET identity_group_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ? AND identity_group_id IN (${gPh})`,
      [groupId, aid, ...existingGroups]
    );
  }

  await pool.execute(
    `UPDATE agency_contacts
     SET identity_group_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE agency_id = ? AND id IN (${placeholders})`,
    [groupId, aid, ...ids]
  );

  return { identityGroupId: groupId, contactIds: ids };
}

/**
 * Remove a contact from its identity group (does not delete the contact).
 */
export async function unlinkAgencyContactIdentity({ agencyId, contactId } = {}) {
  const aid = Number(agencyId);
  const cid = Number(contactId);
  if (!aid || !cid) {
    const err = new Error('agencyId and contactId are required');
    err.status = 400;
    throw err;
  }
  const contact = await AgencyContact.findById(cid);
  if (!contact || Number(contact.agency_id) !== aid) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  await pool.execute(
    `UPDATE agency_contacts
     SET identity_group_id = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND agency_id = ?`,
    [cid, aid]
  );
  return { contactId: cid, identityGroupId: null };
}

/**
 * Suggest duplicate clusters by matching email / phone / name within an agency.
 */
export async function listAgencyContactDuplicateSuggestions({ agencyId, limit = 40 } = {}) {
  const aid = Number(agencyId);
  if (!aid) return [];

  const [rows] = await pool.execute(
    `SELECT id, full_name, email, email_alt, phone, client_id, created_by_user_id,
            share_with_all, identity_group_id, source, created_at
     FROM agency_contacts
     WHERE agency_id = ? AND is_active = TRUE
     ORDER BY full_name ASC, id ASC
     LIMIT 2000`,
    [aid]
  ).catch(async (e) => {
    if (String(e?.message || '').includes('email_alt') || String(e?.message || '').includes('identity_group')) {
      const [fallback] = await pool.execute(
        `SELECT id, full_name, email, phone, client_id, created_by_user_id,
                share_with_all, source, created_at
         FROM agency_contacts
         WHERE agency_id = ? AND is_active = TRUE
         ORDER BY full_name ASC, id ASC
         LIMIT 2000`,
        [aid]
      );
      return [fallback];
    }
    throw e;
  });

  const byKey = new Map();
  for (const r of rows || []) {
    const keys = new Set();
    const e1 = normEmail(r.email);
    const e2 = normEmail(r.email_alt);
    const ph = normPhone(r.phone);
    const name = String(r.full_name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (e1) keys.add(`e:${e1}`);
    if (e2) keys.add(`e:${e2}`);
    if (ph && ph.length >= 10) keys.add(`p:${ph}`);
    // Name-only clusters are noisy; only pair with email/phone already in group via union-find below
    if (!keys.size && name.length >= 4) keys.add(`n:${name}`);

    for (const k of keys) {
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k).add(r.id);
    }
  }

  // Union-find style merge of overlapping key sets
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const idSet of byKey.values()) {
    const arr = [...idSet];
    for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
  }

  const clusters = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root).add(id);
  }

  const byId = new Map((rows || []).map((r) => [r.id, r]));
  const out = [];
  for (const idSet of clusters.values()) {
    if (idSet.size < 2) continue;
    const contacts = [...idSet].map((id) => byId.get(id)).filter(Boolean);
    if (contacts.length < 2) continue;
    const groups = new Set(contacts.map((c) => c.identity_group_id).filter(Boolean));
    const alreadyLinked =
      groups.size === 1 && contacts.every((c) => c.identity_group_id && c.identity_group_id === [...groups][0]);
    out.push({
      alreadyLinked,
      identityGroupId: alreadyLinked ? [...groups][0] : null,
      contacts: contacts.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        email_alt: c.email_alt || null,
        phone: c.phone,
        client_id: c.client_id,
        created_by_user_id: c.created_by_user_id,
        share_with_all: !!(c.share_with_all === 1 || c.share_with_all === true),
        identity_group_id: c.identity_group_id || null,
        source: c.source
      }))
    });
  }

  out.sort((a, b) => b.contacts.length - a.contacts.length);
  return out.slice(0, Math.min(Number(limit) || 40, 100));
}

export default {
  linkAgencyContactIdentities,
  unlinkAgencyContactIdentity,
  listAgencyContactDuplicateSuggestions
};
