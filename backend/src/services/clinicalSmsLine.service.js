import Agency from '../models/Agency.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import { getSharedCareNumber, configuredReminderNumberId } from './sharedCareNumber.service.js';
import { resolveRegisteredSmsSender } from './smsCompliance.service.js';

export function canWorkReminderSms(user) {
  return ['admin', 'super_admin', 'support', 'clinical_practice_assistant'].includes(String(user?.role || '').toLowerCase());
}

export async function resolveClinicalSmsLine({ user, agencyId, numberId, threadKey, supportInbox = false }) {
  const requested = numberId ? await PhoneNumber.findById(numberId) : null;
  if (numberId && (!requested || !requested.is_active || requested.status !== 'active')) {
    return { error: 'number_unavailable' };
  }
  if (requested && Number(requested.agency_id) !== Number(agencyId)) return { error: 'number_not_accessible' };

  const reminderId = await configuredReminderNumberId(agencyId);
  if (requested && Number(requested.id) === reminderId) {
    return supportInbox && threadKey && canWorkReminderSms(user)
      ? { number: requested, assignment: null, ownerType: 'agency' }
      : { error: 'reminder_line_support_only' };
  }
  const shared = await getSharedCareNumber(agencyId);
  if (!reminderId || !shared) return { error: 'split_lines_required' };
  if (requested && Number(requested.id) !== Number(shared.id)) return { error: 'number_not_accessible' };
  return { number: shared, assignment: null, ownerType: 'agency' };
}

export async function availableClinicalSmsLine(user, agencyId) {
  const resolved = await resolveClinicalSmsLine({ user, agencyId });
  if (!resolved?.number) return null;
  const { id, phone_number: phoneNumber } = resolved.number;
  const [ready, reminder] = await Promise.all([
    resolveRegisteredSmsSender({ agencyId, numberId: id, purpose: 'care' }),
    resolveRegisteredSmsSender({ agencyId, purpose: 'reminders' })
  ]);
  if (!ready || !reminder || ready === reminder) return null;
  const agency = await Agency.findById(agencyId);
  return { agencyId: Number(agencyId), agencyName: agency?.name || 'Organization', numberId: id, phoneNumber };
}

export async function validateClinicalSmsLinePair(agencyId, providerId, reminderId) {
  const invalid = message => Object.assign(new Error(message), { status: 400 });
  if (!Number.isSafeInteger(providerId) || providerId < 1 || !Number.isSafeInteger(reminderId) || reminderId < 1 || providerId === reminderId) {
    throw invalid('Choose two different numbers for provider texting and for reminders and Support.');
  }
  const { getSmsSender } = await import('./smsCompliance.service.js');
  const { assertNotifyreAgencyCampaign } = await import('../utils/smsCarrierPolicy.js');
  const { validateSmsRegistration } = await import('../utils/smsCompliancePolicy.js');
  for (const [id, purposes] of [[providerId, ['care']], [reminderId, ['reminders', 'care']]]) {
    const number = await PhoneNumber.findById(id);
    if (!number?.is_active || number.status !== 'active' || Number(number.agency_id) !== Number(agencyId) || number.number_purpose !== 'clinical_care') {
      throw invalid('Both numbers must be active clinical SMS numbers owned by this organization.');
    }
    const sender = await getSmsSender(number.phone_number);
    if (validateSmsRegistration(sender.registration).length || purposes.some(purpose => !sender.registration?.purposes?.includes(purpose))) {
      throw invalid('Register the provider number for care texts and the reminders number for reminders and Support replies.');
    }
    assertNotifyreAgencyCampaign(sender.registration, agencyId);
  }
}
