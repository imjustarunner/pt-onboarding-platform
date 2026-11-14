import {resolveClientRecordAccess} from './clientRecordAccess.service.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function updateLinkedGuardianContact({ clientId, guardianUserId, user, contact }, overrides = {}) {
  const deps={clients:Client,guardians:ClientGuardian,users:User,resolveAccess:resolveClientRecordAccess,...overrides};
  const client = await deps.clients.findById(clientId, { includeSensitive: true });
  if (!client) throw fail('Client not found.', 404);
  const access=await deps.resolveAccess({userId:user?.id,role:user?.role,clientId,client});
  if(!access.ok)throw fail(access.message || 'This client is outside your authorized agencies.',access.status || 403);
  const link = await deps.guardians.getLink({ clientId, guardianUserId });
  if (!link) throw fail('This guardian is not linked to the client.', 404);
  const guardian = await deps.users.findById(guardianUserId);
  if (!['client_guardian', 'guardian', 'client'].includes(guardian?.role)) throw fail('Staff account details must be updated in staff management.', 409);
  const firstName = String(contact.firstName || '').trim(), lastName = String(contact.lastName || '').trim();
  const email = String(contact.email || '').trim().toLowerCase(), phoneNumber = String(contact.phone || '').trim();
  if (!firstName || !lastName || firstName.length > 255 || lastName.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || phoneNumber.length > 30) throw fail('Enter the parent’s name, a valid email, and a phone number of 30 characters or fewer.');
  const other = await deps.users.findByEmail(email);
  if (other && Number(other.id) !== Number(guardianUserId)) throw fail('That email belongs to another account. Choose the correct linked contact before continuing.', 409);
  await deps.users.update(guardianUserId, { firstName, lastName, email, phoneNumber: phoneNumber || null });
  return { guardianUserId, firstName, lastName, email, phone: phoneNumber };
}
