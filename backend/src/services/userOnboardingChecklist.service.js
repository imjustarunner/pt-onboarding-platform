import User from '../models/User.model.js';
import OnboardingChecklist from '../models/OnboardingChecklist.model.js';
import { isStaffCommunicationRole } from '../utils/staffCommunicationChoices.js';
import { getStaffCommunicationAgencies, getStaffCommunicationChoices } from './staffCommunicationChoices.service.js';

export async function getUserOnboardingChecklist(userId) {
  const items = await OnboardingChecklist.getUserChecklist(userId);
  const owner = await User.findById(userId);
  // Existing staff manage these preferences in their account; a missing or
  // outdated review must not put them back into onboarding.
  if (owner && ['ONBOARDING', 'PENDING_SETUP'].includes(String(owner.status || '').toUpperCase()) && isStaffCommunicationRole(owner.role)) {
    for (const agency of await getStaffCommunicationAgencies(userId)) {
      const choices = await getStaffCommunicationChoices({ userId: Number(userId), agencyId: Number(agency.id) });
      items.push({
        id: `communications-${agency.id}`,
        item_type: 'communications',
        title: `${agency.name}: review phone and text choices`,
        description: 'Choose Yes or No for optional staff reminders, message alerts and voting. Every choice may be No.',
        is_completed: !!choices.reviewedAt && !choices.needsReview,
        completed_at: choices.reviewedAt
      });
    }
  }
  return {
    items,
    completionPercentage: items.length ? Math.round(100 * items.filter(item => item.is_completed).length / items.length) : 100
  };
}
