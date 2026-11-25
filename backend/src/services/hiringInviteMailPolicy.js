export const PREHIRE_PORTAL_ACCESS_TRIGGER = 'pre_hire_admin_review_access';
export const ONBOARDING_INVITE_TEMPLATE = 'onboarding_portal_invite';

const receiptTemplates = {
  [PREHIRE_PORTAL_ACCESS_TRIGGER]: 'prehire_invitation_receipt',
  [ONBOARDING_INVITE_TEMPLATE]: 'onboarding_invitation_receipt'
};

export const hiringInviteReceiptTemplate = template => Object.hasOwn(receiptTemplates, template) ? receiptTemplates[template] : null;
export const hiringInviteTemplateForReceipt = template => Object.keys(receiptTemplates).find(key => receiptTemplates[key] === template);
