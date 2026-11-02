import { getSmsSender } from './smsCompliance.service.js';
import { normalizeNotifyreEvent } from './notifyre.service.js';
import { normalizeFaxEvent } from './auricwell/faxPolicy.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { assertNotifyreAgencyCampaign, assertSmsCarrierPurpose } from '../utils/smsCarrierPolicy.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const supported = new Set(['sms_received', 'sms_sent', 'mms_received', 'fax_received', 'fax_sent']);

// The callback URL belongs to the Notifyre account, not to an agency. Resolve
// ownership only from our saved receiving/sending number, never a payload tenant.
// Both public URL aliases call this function, then the same durable consumers.
export async function resolveNotifyreWebhookOwner(parsed, settings) {
  const type = parsed?.Event ?? parsed?.event;
  if (!supported.has(type)) return { kind: 'ignored' };
  const routes = settings?.clientMessaging?.routes || [];
  if (type.startsWith('fax_')) {
    const fax = normalizeFaxEvent(parsed);
    const number = fax.direction === 'received' ? fax.to : fax.from;
    const owners = routes.filter(route => route.mainNumber === number);
    if (owners.length !== 1) throw fail(409, 'This fax number needs one primary agency route.');
    return { kind: 'auricwell' };
  }
  const event = normalizeNotifyreEvent(parsed);
  const inbound = ['sms_received', 'mms_received'].includes(type);
  const number = normalizeSmsPhone(inbound ? event.to : event.from);
  if (!number) throw fail(400, 'The callback must identify the registered account number.');
  const owners = routes.filter(route => [route.mainNumber, route.providerNumber].includes(number));
  const verification = settings?.verificationSms?.from === number;
  if (owners.length + Number(verification) > 1) throw fail(409, 'This number has conflicting agency routes.');
  let sender;
  try { sender = await getSmsSender(number); }
  catch (error) {
    if (error.code !== 'sms_unknown_sender') throw error;
  }
  if ((owners.length || verification) && sender) throw fail(409, 'This number has conflicting messaging owners.');
  if (owners.length || verification) return { kind: 'auricwell' };
  if (!sender) throw fail(409, 'This number has no agency route.');
  try {
    assertNotifyreAgencyCampaign(sender.registration, sender.agency_id);
    assertSmsCarrierPurpose({ registration: sender.registration, controlReply: true });
  } catch {
    throw fail(403, 'This sender is not assigned to its approved Notifyre client campaign.');
  }
  return { kind: 'registered', event, sender };
}
