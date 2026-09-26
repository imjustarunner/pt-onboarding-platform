/** Field labels and aliases only; never index saved values or identifiers. */
export const SETTINGS_FIELD_TARGETS = [
  { field: 'tax-id', agencyTab: 'contact', label: 'Tax ID / EIN', aliases: ['tax id', 'taxid', 'ein', 'fein', 'tin', 'federal tax id', 'employer identification number', 'ssn', 'social security number'], description: 'Enter or update the selected agency’s nine-digit tax ID.' },
  { field: 'tax-id-type', agencyTab: 'contact', label: 'Tax ID type', aliases: ['business ein', 'sole proprietor', 'tax type'], description: 'Choose business EIN or sole-proprietor SSN.' },
  { field: 'timezone', agencyTab: 'contact', label: 'Timezone', aliases: ['time zone', 'mountain time', 'schedule timezone'], description: 'Set the agency timezone for schedules and service dates.' },
  { field: 'account-owner', agencyTab: 'contact', label: 'Account owner', aliases: ['practice owner', 'business owner'], description: 'Choose the primary owner for this agency.' },
  { field: 'website', agencyTab: 'contact', label: 'Website', aliases: ['website url', 'public website'], description: 'Set the agency’s public website.' },
  { field: 'phone', agencyTab: 'contact', label: 'Phone number', aliases: ['telephone', 'agency phone', 'contact number'], description: 'Update the agency contact phone number.' },
  { field: 'support-email', agencyTab: 'contact', label: 'Support email', aliases: ['support inbox', 'help email'], description: 'Set the client-facing support email address.' },
  { field: 'intake-sender', agencyTab: 'contact', label: 'Intake link sender', aliases: ['intake email', 'intake sender'], description: 'Set the sender address for intake links.' },
  { field: 'business-name', agencyTab: 'general', label: 'Business name', aliases: ['company name', 'agency name', 'organization name'], description: 'Update the selected organization’s name.' },
  { field: 'street-address', agencyTab: 'address', label: 'Street address', aliases: ['business address', 'mailing address', 'street'], description: 'Update the organization address. Billing office addresses are managed under Sites.' },
  { field: 'postal-code', agencyTab: 'address', label: 'ZIP / postal code', aliases: ['zip', 'zip code', 'postal code'], description: 'Update the organization postal code.' }
].map(target => ({ ...target, id: `cp-field-${target.field}`, kind: 'field', itemId: 'company-profile', pathLabel: `Business details → ${target.agencyTab === 'contact' ? 'Contact' : target.agencyTab === 'address' ? 'Address' : 'General'} → ${target.label}` }));

export function focusSettingsField(root, field) {
  root?.querySelectorAll('.setting-search-highlight').forEach(el => el.classList.remove('setting-search-highlight'));
  if (!SETTINGS_FIELD_TARGETS.some(target => target.field === field)) return false;
  const element = [...(root?.querySelectorAll('[data-setting-field]') || [])].find(el => el.dataset.settingField === field);
  if (!element) return false;
  element.classList.add('setting-search-highlight');
  element.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  (element.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || element).focus({ preventScroll: true });
  return true;
}
