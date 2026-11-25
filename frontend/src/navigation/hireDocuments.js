// Old collections can still contain copies of forms now provided by the portal.
// Match authorization/acknowledgment titles, not background-check instructions.
export function builtInHireDocument(document = {}) {
  if (!document || typeof document !== 'object') return null;
  const title = String(document.title || document.document_name || document.name || '').trim().replace(/^hiring\s*[:·-]\s*/i, '');
  const lifecycleKey = String(document.lifecycle_item_key || document.lifecycleItemKey || document.metadata?.lifecycleItemKey || '').toLowerCase();
  if (document.kind === 'handbook' || document.document_type === 'handbook' || ['handbook_ack', 'handbook_acknowledgement', 'employee_handbook', 'workplace_handbook'].includes(lifecycleKey)) return 'handbook';
  if (/^(?:hiring\s*[:·-]\s*)?(?:authorization (?:for|to (?:conduct|obtain)) (?:a )?background check|background check authorization)(?:\s*\([^)]*\))?$/i.test(title)) return 'background';
  if (/^(?:review (?:the )?)?(?:(?:employee|workplace|staff)\s+)?handbook(?:\s*(?:[·:-]\s*)?(?:and\s+)?(?:review|acknowledg(?:e)?ment|receipt|reference))*$/i.test(title)) return 'handbook';
  if (/^(?:hiring\s*[:·-]\s*)?job description(?:\s*[·:-]?\s*(?:acknowledg(?:e)?ment|review and sign))?$/i.test(title)) return 'job-description';
  if (/^employment (?:agreement|contract)$/i.test(title)) return 'agreement';
  return null;
}

export const hireResourceHelp = {
  document: 'Opens in the portal. The person fills in fields or places text and a signature on the PDF, then submits it. The signed copy is saved to their record.',
  acknowledgement: 'The person opens the linked material, confirms they reviewed it, and signs an acknowledgment. The app saves a signed receipt; it does not sign the linked file.',
  upload: 'The person downloads your blank form, completes it, and uploads the completed copy. The uploaded file is saved to their record.',
  video: 'The person watches the video, then confirms they watched it. This records their confirmation, not an automatic watch-time requirement.',
  link: 'The person opens the resource, then confirms completion in the portal. Completion in an external system is not verified automatically.',
  meeting: 'The person books through your scheduling link, then enters the confirmed meeting date and time in the portal.'
};
