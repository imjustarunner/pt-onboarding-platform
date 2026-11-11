const normalized = value => String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const kinds = { address_street: 'street', address_city: 'city', address_state: 'state', address_zip: 'postalCode' };
/** Uses explicit field metadata or known saved schema keys, never neighboring DOM controls. */
export function addressFieldBinding(field, fields, model, options = {}) {
  const key = String(field?.key || '');
  const name = normalized(key);
  if (/(^|_)(email|ip|ipv4|ipv6|mac|url|web|website)(_|$)/.test(name)) return null;
  const detail = kinds[field?.detailKind];
  const match = name.match(/^(.*?)(address_street|street_address|address_line_?1|home_street|client_street|guardian_address|home_address|street|address)$/);
  if (detail !== 'street' && !match) return null;
  if (!model || typeof model !== 'object') return null;
  const available = (fields || []).filter(item => item?.key && (!field.addressGroup || item.addressGroup === field.addressGroup));
  const streetDetails = available.filter(item => item.detailKind === 'address_street');
  const mapped = { street: key };
  if (detail === 'street' && streetDetails.length === 1) {
    for (const [kind, part] of Object.entries(kinds)) {
      if (part === 'street') continue;
      const candidates = available.filter(item => item.detailKind === kind);
      if (candidates.length === 1) mapped[part] = candidates[0].key;
    }
  } else if (match) {
    const suffix = match[2];
    let prefix = match[1];
    if (suffix === 'address_street') prefix += 'address_';
    if (suffix === 'home_street' || suffix === 'home_address') prefix += 'home_';
    if (suffix === 'client_street') prefix += 'client_';
    if (suffix === 'guardian_address') prefix += 'guardian_';
    for (const [part, endings] of Object.entries({ city: ['city', 'town'], state: ['state', 'province'], postalCode: ['zip', 'postal_code', 'postal', 'zip_code'] })) {
      const candidates = available.filter(item => endings.some(ending => normalized(item.key) === prefix + ending));
      if (candidates.length === 1) mapped[part] = candidates[0].key;
    }
  }
  return { model, fields: mapped, ...options, scopeKey: `${options.scopeKey ?? ''}:${key}` };
}
