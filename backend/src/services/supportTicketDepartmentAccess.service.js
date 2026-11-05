import pool from '../config/database.js';
import { DEPARTMENTAL_GROUPS, groupKeyForIdentity, listUserDepartmentalGroupKeys } from './departmentalGroupAccess.service.js';

const specialized = new Set(['billing', 'payroll', 'credentialing', 'technology']);
const addresses = value => new Set((String(typeof value === 'object' ? JSON.stringify(value) : value || '').toLowerCase()
  .match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []));

export async function ticketDepartmentKeys(ticket, db = pool) {
  if (ticket?.source_channel !== 'email' || !ticket.agency_id) return [];
  const recipients = addresses(ticket.source_email_recipients);
  if (recipients.size) {
    const [identities] = await db.execute(`SELECT e.*,i.kind,i.owner_user_id FROM email_sender_identities e
      LEFT JOIN communication_inboxes i ON i.sender_identity_id=e.id WHERE e.agency_id=? AND e.is_active=1`, [ticket.agency_id]);
    const keys = [...new Set(identities.filter(i => recipients.has(String(i.from_email || '').toLowerCase()))
      .map(groupKeyForIdentity).filter(Boolean))];
    if (keys.length) return keys;
  }
  const topic = String(ticket.topic || '').toLowerCase();
  return specialized.has(topic) ? [topic] : [];
}

export async function canWorkDepartmentTicket({ ticket, userId, db = pool }) {
  const keys = await ticketDepartmentKeys(ticket, db);
  if (!keys.length) return false;
  const allowed = await listUserDepartmentalGroupKeys({ agencyId: ticket.agency_id, userId, db });
  return keys.some(key => allowed.includes(key));
}

/** Filter before pagination and counting; opening a thread uses the same grants. */
export async function appendDepartmentTicketVisibility({ userId, where, params, requireDepartment = false, db = pool }) {
  const [identities] = await db.execute(`SELECT e.*,i.kind,i.owner_user_id FROM email_sender_identities e
    LEFT JOIN communication_inboxes i ON i.sender_identity_id=e.id WHERE e.is_active=1`);
  const allowedByAgency = new Map();
  const allowedMatches = [];
  const allowedParams = [];
  const departmentalMatches = [];
  const departmentalParams = [];
  for (const identity of identities) {
    const key = groupKeyForIdentity(identity);
    if (!key) continue;
    const aid = Number(identity.agency_id);
    if (!allowedByAgency.has(aid)) allowedByAgency.set(aid, await listUserDepartmentalGroupKeys({ agencyId: aid, userId, db }));
    const topic = DEPARTMENTAL_GROUPS[key].topic;
    const match = [`LOWER(COALESCE(t.source_email_recipients,'')) LIKE ?`];
    const values = [`%"${String(identity.from_email).toLowerCase()}"%`];
    if (specialized.has(topic)) { match.push("LOWER(COALESCE(t.topic,''))=?"); values.push(topic); }
    const condition = `(t.source_channel='email' AND t.agency_id=? AND (${match.join(' OR ')}))`;
    departmentalMatches.push(condition);
    departmentalParams.push(aid, ...values);
    if (allowedByAgency.get(aid).includes(key)) {
      allowedMatches.push(condition);
      allowedParams.push(aid, ...values);
    }
  }
  if (departmentalMatches.length) {
    where.push(`(NOT (${departmentalMatches.join(' OR ')})${allowedMatches.length ? ` OR ${allowedMatches.join(' OR ')}` : ''})`);
    params.push(...departmentalParams, ...allowedParams);
  }
  if (requireDepartment) {
    where.push(`(${[...allowedMatches, 't.created_by_user_id=?', 't.claimed_by_user_id=?'].join(' OR ')})`);
    params.push(...allowedParams, userId, userId);
  }
}
