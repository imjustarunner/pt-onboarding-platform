import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import { isCommunicationStaffActive } from '../utils/communicationReceptionPolicy.js';
import { availableClinicalSmsLine } from './clinicalSmsLine.service.js';
import { assertClinicalSmsRecipient } from './clinicalSmsAccess.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { resolveRelayFamily } from './providerSmsRelayIdentity.service.js';
import { sendClinicalSms } from './clinicalSmsSend.service.js';

async function currentSmsStaff(userId) {
  const user = await User.findById(userId);
  if (!isCommunicationStaffActive(user)) return null;
  const settings = await UserCallSettings.getByUserId(userId);
  return [false, 0].includes(settings?.sms_outbound_enabled) ? null : user;
}

export async function listClinicalSmsLines(userId) {
  const user = await currentSmsStaff(userId);
  if (!user) return [];
  const memberships = await User.getAgencies(userId);
  const lines = [];
  for (const agency of memberships) {
    if (agency.organization_type && !['agency', 'life_coach', 'consultant', 'clinical', 'healthcare'].includes(agency.organization_type)) continue;
    const line = await availableClinicalSmsLine(user, agency.id);
    if (line) lines.push(line);
  }
  return lines;
}

const labelFor = person => [person.first_name, person.last_name].filter(Boolean).join(' ').trim();

export async function findConfirmedSmsRecipients({ userId, agencyId, numberId, query }) {
  const q = String(query || '').trim().slice(0, 80).replace(/[%_]/g, '');
  if (q.length < 2) return [];
  const user = await currentSmsStaff(userId);
  if (!user || !(await User.getAgencies(userId)).some(agency => Number(agency.id) === agencyId)) return [];
  const line = await availableClinicalSmsLine(user, agencyId);
  if (!line || Number(line.numberId) !== numberId) return [];

  const like = `%${q}%`;
  const [candidates] = await pool.execute(`SELECT c.id,c.full_name,c.initials FROM clients c
    WHERE c.agency_id=? AND COALESCE(c.is_archived,0)=0
    AND (c.full_name LIKE ? OR c.initials LIKE ? OR EXISTS (
      SELECT 1 FROM client_guardians cg JOIN users g ON g.id=cg.guardian_user_id
      WHERE cg.client_id=c.id AND cg.access_enabled=1 AND CONCAT_WS(' ',g.first_name,g.last_name) LIKE ?
    )) ORDER BY c.full_name,c.id LIMIT 25`, [agencyId, like, like, like]);
  const results = [];
  for (const candidate of candidates) {
    const client = await Client.findById(candidate.id, { includeSensitive: true });
    if (!client || Number(client.agency_id) !== agencyId) continue;
    try { await assertClinicalSmsRecipient({ user, client }); }
    catch (error) { if (error.status === 403) continue; throw error; }
    const links = await ClientGuardian.listForClient(client.id);
    const clientName = candidate.full_name || candidate.initials || 'Client';
    const choices = links.map(link => ({ link, phone: link.phone }));
    choices.push({ link: null, phone: client.contact_phone });
    for (const { link, phone } of choices) {
      const confirmed = await resolveRelayFamily(client, phone, links);
      if (!confirmed || Number(confirmed.guardianUserId) !== Number(link?.guardian_user_id || 0)) continue;
      const guardianUserId = confirmed.guardianUserId || null;
      try {
        const preview = await sendClinicalSms({ userId, clientId: client.id, guardianUserId, numberId, body: 'Text eligibility check', preview: true });
        results.push({
          clientId: client.id, guardianUserId, clientName,
          name: link ? labelFor(link) || 'Guardian' : clientName,
          relationship: confirmed.guardian ? link.relationship_title || 'Guardian' : 'Client',
          phoneEnding: normalizeSmsPhone(preview.to)?.slice(-4)
        });
      } catch (error) {
        if (!error.status || error.status >= 500) throw error;
      }
    }
    if (results.length >= 25) break;
  }
  return results.slice(0, 25);
}
