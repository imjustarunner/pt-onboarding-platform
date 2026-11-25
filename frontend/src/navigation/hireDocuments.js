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
  if (/^pre[ -]?employment information(?: form)?$/i.test(title)) return 'profile';
  if (/^(?:upload (?:a |your )?)?professional headshot(?: upload)?$/i.test(title)) return 'headshot';
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

export function availableHiringTemplate(template) {
  return template.is_active !== false && template.is_active !== 0 &&
    ![true, 1, '1'].includes(template.is_archived) && !builtInHireDocument(template);
}

export const standardPrehireSteps = [
  { key: 'background', title: 'Background check authorization', action: 'Complete and sign the secure form', instructions: 'The candidate enters their authorization details and signs in the portal. This is provided by the app; a second authorization document from a saved collection is not assigned.' },
  { key: 'profile', title: 'Pre-employment information', action: 'Complete the information form', instructions: 'The candidate enters contact details, education, credentials and their preferred typed signature. They can save progress and return later.' },
  { key: 'job-description', title: 'Job description', action: 'Review and sign', instructions: 'The candidate reads the job description from this posting and signs to confirm.' },
  { key: 'agreement', title: 'Employment agreement', action: 'Review and sign', instructions: 'The candidate reviews the personalized agreement prepared in Contract & cosigners and signs it. Selected cosigners then receive their signing tasks.' },
  { key: 'work-email', title: 'Choose a work username', action: 'Select an available username', instructions: 'The candidate reserves a username. People Operations prepares account access separately.' },
  { key: 'headshot', title: 'Professional headshot', action: 'Upload a photo', instructions: 'The candidate uploads a JPEG, PNG or WebP photo up to 10 MB. The photo is saved to their hire record and profile.' }
].map(item => ({ source: 'Provided by the app', required: true, ...item }));
