import pool from '../config/database.js';
import { normalizeSmsPhone, parseSmsThreadKey } from '../utils/smsThreadIdentity.js';

const placeholders = values => values.map(() => '?').join(',');
const personName = row => [row.first_name, row.last_name].filter(Boolean).join(' ').trim();

export async function describeSmsConversations(conversations) {
  const parsed = conversations.map(row => row.channel === 'sms' ? parseSmsThreadKey(row.external_thread_id) : null);
  if (!parsed.some(Boolean)) return conversations;
  const ids = key => [...new Set(parsed.map(row => row?.[key]).filter(Boolean))];
  const clientIds = ids('clientId');
  const contactIds = ids('contactId');
  const agencyIds = [...new Set(conversations.filter((row, index) => parsed[index]).map(row => Number(row.agency_id)).filter(Boolean))];
  const [clients, links, contacts, agencies] = await Promise.all([
    clientIds.length ? pool.execute(`SELECT id,full_name,initials,contact_phone FROM clients WHERE id IN (${placeholders(clientIds)})`, clientIds).then(([rows]) => rows) : [],
    clientIds.length ? pool.execute(`SELECT cg.client_id,cg.guardian_user_id,cg.relationship_type,cg.relationship_title,cg.access_enabled,u.is_active,u.first_name,u.last_name,
      COALESCE(NULLIF(u.phone_number,''),NULLIF(u.personal_phone,''),NULLIF(u.work_phone,'')) AS phone
      FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id IN (${placeholders(clientIds)})`, clientIds).then(([rows]) => rows) : [],
    contactIds.length ? pool.execute(`SELECT id,full_name,phone FROM agency_contacts WHERE id IN (${placeholders(contactIds)})`, contactIds).then(([rows]) => rows) : [],
    agencyIds.length ? pool.execute(`SELECT id,name FROM agencies WHERE id IN (${placeholders(agencyIds)})`, agencyIds).then(([rows]) => rows) : []
  ]);
  return conversations.map((row, index) => {
    const thread = parsed[index];
    if (!thread) return row;
    const client = clients.find(item => Number(item.id) === thread.clientId);
    const contact = contacts.find(item => Number(item.id) === thread.contactId);
    const matching = links.filter(link => Number(link.client_id) === thread.clientId && normalizeSmsPhone(link.phone) === thread.toNumber);
    const family = matching.length === 1 && Number(matching[0].access_enabled) && Number(matching[0].is_active) ? matching[0] : null;
    const direct = !matching.length && normalizeSmsPhone(client?.contact_phone) === thread.toNumber;
    const recipientEnding = thread.toNumber.slice(-4);
    const recipientName = family ? personName(family) || 'Family contact'
      : direct ? client.full_name || client.initials || 'Client'
      : contact && normalizeSmsPhone(contact.phone) === thread.toNumber ? contact.full_name
      : `Contact ending in ${recipientEnding}`;
    return {
      ...row,
      primary_participant_name: recipientName,
      sms: {
        recipientName, recipientEnding, fromNumber: thread.fromNumber,
        organizationName: agencies.find(item => Number(item.id) === Number(row.agency_id))?.name || null,
        relationship: family && family.relationship_type !== 'self' ? family.relationship_title || 'Guardian' : null,
        clientName: family && family.relationship_type !== 'self' ? client?.full_name || client?.initials || null : null
      }
    };
  });
}
