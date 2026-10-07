import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { resolveClientCaregivers } from './communicationRouting.service.js';
import { isCommunicationStaffActive } from '../utils/communicationReceptionPolicy.js';
import { userCanSeeContact } from './contactAccess.service.js';

// Look up the current agency membership; request-body roles never authorize a send.
export async function assertClinicalSmsRecipient({ user, client = null, contact = null }) {
  const agencyId = Number(client?.agency_id || contact?.agency_id);
  const deny = () => { throw Object.assign(new Error('Only assigned providers or authorized support can message this recipient'), { status: 403 }); };
  if (!agencyId || !isCommunicationStaffActive(user)) return deny();
  const [memberships] = await pool.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1', [user.id, agencyId]);
  if (!memberships.length) return deny();
  if (['admin', 'super_admin', 'support', 'clinical_practice_assistant'].includes(String(user.role).toLowerCase())) return;
  if (!client && contact?.client_id) client = await Client.findById(contact.client_id, { includeSensitive: false });
  if (contact?.client_id && !client) return deny();
  if (client) {
    if (Number(client.agency_id) !== agencyId) return deny();
    const { caregiverIds } = await resolveClientCaregivers(client.id, agencyId);
    if (!caregiverIds.includes(Number(user.id))) return deny();
    return;
  }
  if (!contact || !(await userCanSeeContact(contact, user.id, user.role))) return deny();
}

export function staffSmsIdentity(user, body) {
  const name = String(user?.first_name || '').replace(/[\r\n\t:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) throw Object.assign(new Error('Add your first name to your staff profile before texting'), { status: 400 });
  const text = String(body || '').trim();
  return { senderFirstName: name, body: text.startsWith(`${name}:`) ? text : `${name}: ${text}` };
}
