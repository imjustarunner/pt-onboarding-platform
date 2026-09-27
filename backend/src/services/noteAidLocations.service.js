const MODES = {
  '02': 'Telehealth — outside patient home',
  '10': 'Telehealth — patient home',
  '12': "Patient’s residence"
};
const address = (row) => [row.street_address, row.city, row.state, row.postal_code].filter(Boolean).join(', ');

/** Use the tenant's billing records and the user's explicit office assignments. */
export function buildNoteAidLocationChoices({ locations = [], offices = [], officeIds = [] }) {
  const assigned = new Set(officeIds.map(Number));
  const availableOffices = offices.filter(o => assigned.has(Number(o.id)) && Number(o.is_active) !== 0);
  const byOffice = new Map(availableOffices.map(o => [Number(o.id), o]));
  const visible = locations.filter(l => (l.is_active == null || Number(l.is_active) !== 0) && (l.is_provider_visible == null || Number(l.is_provider_visible) !== 0)
    && (!Number(l.billing_office_location_id) || byOffice.has(Number(l.billing_office_location_id))));
  const choices = new Map();
  // Linked office templates take precedence over legacy generic POS duplicates.
  for (const loc of [...visible].sort((a, b) => Number(!!b.billing_office_location_id) - Number(!!a.billing_office_location_id) || Number(a.id) - Number(b.id))) {
    const pos = String(loc.place_of_service || '').padStart(2, '0');
    const office = byOffice.get(Number(loc.billing_office_location_id));
    const mode = MODES[pos];
    if (pos === '11' && !office) continue; // A generic Office is not an assigned physical site.
    if (mode && !office && visible.some(l => String(l.place_of_service).padStart(2, '0') === pos && byOffice.has(Number(l.billing_office_location_id)))) continue;
    const key = pos === '11' || mode ? `${office?.id || 'generic'}:${pos}` : `site:${loc.id}`;
    if (choices.has(key)) continue;
    const name = pos === '11' ? office.name : mode || loc.name;
    const serviceAddress = mode ? '' : address(pos === '11' ? office : loc);
    const billingAddress = office ? address(office) : '';
    choices.set(key, {
      value: `service:${loc.id}`, name,
      label: `${name}${mode && office ? ` — ${office.name}` : ''} (POS ${pos})${serviceAddress ? ` — ${serviceAddress}` : ''}`,
      address: serviceAddress, billingAddress, billingOfficeName: office?.name || null,
      serviceLocationId: Number(loc.id), billingOfficeLocationId: office?.id || null,
      placeOfService: pos, defaultModifiers: loc.default_modifiers || null,
      aliases: [loc.name, ...(pos === '11' ? [office.name] : [])],
      detail: mode ? `${pos === '12' ? 'Service address is the patient’s residence.' : 'Select according to the patient’s location during the session.'}${office ? ` Billing office: ${office.name}${billingAddress ? ` — ${billingAddress}` : ' (address not configured)'}.` : ''}`
        : serviceAddress || 'Address not configured for this location.'
    });
  }
  for (const office of availableOffices) {
    const key = `${office.id}:11`;
    if (choices.has(key)) continue;
    const street = address(office);
    choices.set(key, { value: `office:${office.id}`, name: office.name,
      label: `${office.name} (POS 11)${street ? ` — ${street}` : ''}`,
      address: street, billingAddress: street, billingOfficeName: office.name,
      serviceLocationId: null, billingOfficeLocationId: Number(office.id), placeOfService: '11',
      aliases: [office.name], detail: street || 'Address not configured for this location.' });
  }
  return [...choices.values()].sort((a, b) => (a.placeOfService === '11' ? 0 : 1) - (b.placeOfService === '11' ? 0 : 1) || a.label.localeCompare(b.label));
}
