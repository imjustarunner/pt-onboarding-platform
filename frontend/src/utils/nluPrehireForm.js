const nluSlugs = new Set(['nlu', 'nlu-qa-demo', 'nlu-qa-learning']);

// This form owns inline loading/saving states, including its nested editors.
// Keep the existing global-loader behavior on other organizations' hiring pages.
export function isNluPrehireWorkspace(pathname, currentAgency = null) {
  const match = String(pathname || '').match(/^\/(?:([^/]+)\/)?admin\/hiring\/start-pre-hire\/\d+\/?$/);
  if (!match) return false;
  if(match[1])return nluSlugs.has(match[1].toLowerCase());
  return nluSlugs.has(String(currentAgency?.slug || currentAgency?.portal_url || '').toLowerCase())
    || [6,453,454].includes(Number(currentAgency?.id));
}

export function prehireIssueDestination(message) {
  const text = String(message || '');
  if (/probation/i.test(text)) return { id: 'prehire-probation', label: 'Choose probation terms' };
  if (/place.of.business|company.address|agency.*address/i.test(text)) return { settings: 'agency', label: 'Open agency address settings' };
  if (/Homework Help|H2014|program compensation schedule|program.*effective/i.test(text)) return { settings: 'contracts', label: 'Open program pay settings' };
  if (/no eligible supervisor|active employee marked as a supervisor/i.test(text)) return { settings: 'staff', label: 'Open supervisor settings' };
  if (/configuration|standard terms|agreement.*not configured|inactive.*clause/i.test(text)) return { settings: 'contracts', label: 'Open agreement settings' };
  if (/supervisor|supervision/i.test(text)) return { id: 'prehire-supervisor', label: 'Choose the assigned supervisor' };
  if (/credential|licen[cs]e|qualification/i.test(text)) return { id: 'prehire-credentials', label: 'Review recorded credentials' };
  if (/category|placement/i.test(text)) return { id: 'prehire-category', label: 'Review pay category' };
  if (/pay level|choose.*level/i.test(text)) return { id: 'prehire-level', label: 'Choose pay level' };
  if (/office|location/i.test(text)) return { id: 'prehire-office', label: 'Choose assigned office' };
  if (/school days/i.test(text)) return { id: 'prehire-school-days', label: 'Enter school days' };
  if (/handbook|resource|document.*step/i.test(text)) return { id: 'prehire-workflow', step: 1, label: 'Review pre-hire steps' };
  if (/childcare/i.test(text)) return { id: 'prehire-service-childcare', label: 'Review childcare rates' };
  if (/tutoring/i.test(text)) return { id: 'prehire-service-tutoring', label: 'Review tutoring rates' };
  if (/testing/i.test(text)) return { id: 'prehire-service-psychological_testing', label: 'Review testing terms' };
  if (/rate|compensation|childcare|tutoring|testing|service.*role/i.test(text)) return { id: 'prehire-services', label: 'Review service compensation' };
  return { id: 'prehire-preview-button', label: 'Return to agreement preview' };
}
