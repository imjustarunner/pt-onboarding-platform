export const feeError = (status, message, code = 'FEE_SCHEDULE_INVALID') => Object.assign(new Error(message), { status, code });

// Owner-provided starting charges, not reimbursement promises or coding rules.
// Repeated/retired/mislabeled screenshot entries do not redefine service codes.
export const PLATFORM_STARTER_MODIFIERS = Object.freeze({ H0002: Object.freeze(['U9']) });
export const CREDENTIAL_MODIFIER_SCOPES = Object.freeze([
  { key: 'hcbs_1', label: 'HCBS category 1 · unlicensed' },
  { key: 'hcbs_2', label: 'HCBS category 2 · prelicensed' },
  { key: 'hcbs_3', label: 'HCBS category 3 · fully licensed' }
]);
export const PLATFORM_STARTER_FEES = Object.freeze({
  '90791': 10000, H0002: 3000, H0031: 10000, '90785': 3000, '99051': 3000,
  '90837': 10000, '90832': 7500, '90834': 10000, '90839': 13000,
  '90846': 10000, '90847': 10000, '99404': 10000, H0004: 3000, T1017: 3000,
  '90840': 6000, '90853': 7500, H0023: 3000, H0025: 3000, H0038: 1700,
  H2032: 3000, S9454: 5000, '96146': 1000, '96136': 10000, '96137': 10000,
  H0032: 6500, H2000: 5000, 'PRO-BONO SERVICE': 0
});
export const SELF_PAY_CATEGORIES = Object.freeze([
  { key: 'category_1', label: 'Category 1 · Bachelor’s / unlicensed master’s / intern' },
  { key: 'category_2', label: 'Category 2 · Prelicensed' },
  { key: 'category_3', label: 'Category 3 · Fully licensed' },
  { key: 'unclassified', label: 'Category not recorded' }
]);
export const RATE_SOURCE_LABELS = Object.freeze({
  provider: 'Provider override', payer: 'Payer default', category: 'Provider category default', credential: 'HCBS credential category',
  practice: 'Practice default', platform: 'Platform default', platform_starter: 'Platform starter default',
  legacy_provider: 'Saved provider rate', legacy_practice: 'Saved practice rate', legacy_payer: 'Saved payer rate',
  legacy_catalog: 'Saved service rate', legacy_conflict: 'Multiple saved service rates · review required', unset: 'Rate not set'
});
export const normalizeFeeCode = value => String(value || '').trim().toUpperCase().replace(/^\+/, '');
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function normalizeFeeScope(input = {}) {
  const agencyId = positiveId(input.agencyId);
  if (!agencyId) throw feeError(400, 'Select a practice.');
  const mode = input.mode || 'insurance', scope = input.scope || 'practice';
  if (!['insurance', 'self_pay'].includes(mode) || !['platform', 'practice', 'payer', 'provider', 'category', 'credential'].includes(scope)) throw feeError(400, 'Select a supported fee schedule.');
  if (scope === 'category' && mode !== 'self_pay' || scope === 'payer' && mode !== 'insurance' || scope === 'credential' && mode !== 'insurance') throw feeError(400, 'This rate scope does not apply to the selected payment method.');
  const payerId = input.payerId == null ? '' : String(input.payerId).trim();
  if ((scope === 'payer' || scope === 'provider' && mode === 'insurance') && !/^[A-Za-z0-9_-]{1,32}$/.test(payerId)) throw feeError(400, 'Select the verified billing payer.');
  const providerUserId = scope === 'provider' ? positiveId(input.providerUserId ?? input.providerId) : null;
  if (scope === 'provider' && !providerUserId) throw feeError(400, 'Select a provider.');
  const categoryKey = String(input.categoryKey || '');
  if (scope === 'category' && !SELF_PAY_CATEGORIES.some(c => c.key === categoryKey)) throw feeError(400, 'Select a provider category.');
  const credentialKey = String(input.credentialKey || '');
  if (scope === 'credential' && !CREDENTIAL_MODIFIER_SCOPES.some(c => c.key === credentialKey)) throw feeError(400, 'Select an HCBS credential category.');
  const scopeKey = scope === 'provider' ? `provider:${providerUserId}${mode === 'insurance' ? `:payer:${payerId}` : ''}`
    : scope === 'payer' ? `payer:${payerId}` : scope === 'category' ? `category:${categoryKey}` : scope === 'credential' ? `credential:${credentialKey}` : scope;
  return { agencyId, mode, scope, scopeKey, payerId, providerUserId, categoryKey, credentialKey, ownerKey: scope === 'platform' ? 'platform' : `agency:${agencyId}` };
}
export function normalizeFeeMutation(input = {}) {
  const scope = normalizeFeeScope(input), serviceCode = normalizeFeeCode(input.serviceCode ?? input.procedureCode);
  if (!serviceCode || serviceCode.length > 32 || !/^[A-Z0-9][A-Z0-9 -]*$/.test(serviceCode)) throw feeError(400, 'Choose a service from the practice service-code settings.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw feeError(400, 'Reload the current fee schedule before saving.');
  const action = input.action || 'set';
  if (!['set', 'reset', 'update_practice_default', 'set_visibility', 'set_modifiers', 'reset_modifiers'].includes(action)) throw feeError(400, 'Choose a supported rate action.');
  if (action === 'update_practice_default' && scope.scope === 'platform') throw feeError(400, 'Change the practice default from a practice schedule.');
  if (action === 'set_visibility' && (scope.scope !== 'practice' || typeof input.isHidden !== 'boolean')) throw feeError(400, 'Choose whether this service is hidden in the practice fee schedule.');
  if (scope.mode !== 'insurance' && ['set_modifiers', 'reset_modifiers'].includes(action)) throw feeError(400, 'Modifier defaults apply to insurance claims.');
  const modifiers = action === 'set_modifiers' ? normalizeModifierList(input.modifiers) : null;
  const rateCents = ['reset', 'set_visibility', 'set_modifiers', 'reset_modifiers'].includes(action) ? null : input.rateCents;
  if (!['reset', 'set_visibility', 'set_modifiers', 'reset_modifiers'].includes(action) && (!Number.isSafeInteger(rateCents) || rateCents < 0 || rateCents > 100000000)) throw feeError(400, 'Enter a rate in whole cents between $0 and $1,000,000.');
  const rateUnit = scope.mode === 'insurance' ? 'unit' : (input.rateUnit || 'session');
  if (!['set_modifiers', 'reset_modifiers'].includes(action) && (scope.mode === 'insurance' && input.rateUnit && input.rateUnit !== 'unit' || scope.mode === 'self_pay' && !['session', 'hour'].includes(rateUnit))) throw feeError(400, 'Choose per unit for insurance, or per session/per hour for self-pay.');
  const reason = String(input.reason || '').trim();
  if (reason.length > 1000) throw feeError(400, 'Keep the rate-change note under 1,000 characters.');
  return { ...scope, serviceCode, revision: input.revision, action, rateCents, rateUnit: ['set_modifiers', 'reset_modifiers'].includes(action) ? null : rateUnit, isHidden: input.isHidden, modifiers, reason: reason || null };
}
export function feeLedgerKey({ owner_key, ownerKey, mode, record_type = 'rate', recordType, scope_key, scopeKey, service_code, serviceCode }) {
  return [owner_key || ownerKey, mode, recordType || record_type, scope_key || scopeKey, normalizeFeeCode(service_code || serviceCode)].join('|');
}
export function latestFeeEntries(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = feeLedgerKey(row), current = map.get(key);
    if (!current || Number(row.id) > Number(current.id)) map.set(key, row);
  }
  return map;
}
const amount = (rateCents, source, rateUnit, entry = null) => ({ rateCents, source, sourceLabel: RATE_SOURCE_LABELS[source], rateUnit, rateRevisionId: entry?.id ? Number(entry.id) : null });
export function resolveFeeFromEntries({ agencyId, mode = 'insurance', serviceCode, payerId, providerUserId, categoryKey, scope = 'provider', entries = new Map(), legacy = {}, excludeScopeKey = null }) {
  const code = normalizeFeeCode(serviceCode), unit = mode === 'insurance' ? 'unit' : 'session';
  const read = (ownerKey, scopeKey) => scopeKey === excludeScopeKey ? null : entries.get(feeLedgerKey({ ownerKey, mode, scopeKey, serviceCode: code }));
  const own = `agency:${agencyId}`;
  const choose = (scopeKey, source, fallback, inherited) => {
    if (scopeKey === excludeScopeKey) return inherited;
    const row = read(own, scopeKey);
    if (row) return row.rate_cents == null ? inherited : amount(Number(row.rate_cents), source, row.rate_unit || unit, row);
    if (fallback?.conflict) return amount(null, 'legacy_conflict', unit);
    return fallback?.rateCents != null ? amount(fallback.rateCents, fallback.source, fallback.rateUnit || unit, fallback) : inherited;
  };
  const platform = read('platform', 'platform');
  let result = platform?.rate_cents != null ? amount(Number(platform.rate_cents), 'platform', platform.rate_unit || unit, platform)
    : Object.hasOwn(PLATFORM_STARTER_FEES, code) ? amount(PLATFORM_STARTER_FEES[code], 'platform_starter', unit) : amount(null, 'unset', unit);
  if (scope === 'platform') return result;
  result = choose('practice', 'practice', legacy.practice || legacy.catalog, result);
  if (scope === 'practice') return result;
  if (mode === 'insurance' && payerId) result = choose(`payer:${payerId}`, 'payer', legacy.payer, result);
  if (mode === 'self_pay' && categoryKey) result = choose(`category:${categoryKey}`, 'category', null, result);
  if (['payer', 'category'].includes(scope)) return result;
  if (providerUserId) result = choose(`provider:${providerUserId}${mode === 'insurance' ? `:payer:${payerId}` : ''}`, 'provider', legacy.provider, result);
  return result;
}
export function normalizeModifierList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/);
  const modifiers = [...new Set(list.map(item => String(item || '').trim().toUpperCase()).filter(Boolean))];
  if (!modifiers.length || modifiers.length > 4 || modifiers.some(item => item !== 'NONE' && !/^[A-Z0-9]{2}$/.test(item)) || modifiers.includes('NONE') && modifiers.length !== 1) {
    throw feeError(400, 'Enter up to four two-character modifiers, or NONE to clear an inherited modifier.');
  }
  return modifiers;
}
const modifierValue = row => {
  const raw = row?.modifiers_json;
  let list = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { return null; } }
  return Array.isArray(list) ? list.map(item => String(item).toUpperCase()) : null;
};
export function resolveModifiersFromEntries({ agencyId, serviceCode, payerId = null, providerUserId = null, credentialKey = null, entries = new Map(), excludeScopeKey = null }) {
  const code = normalizeFeeCode(serviceCode);
  const read = (ownerKey, scopeKey) => scopeKey === excludeScopeKey ? null : entries.get(feeLedgerKey({ ownerKey, mode: 'insurance', recordType: 'modifier', scopeKey, serviceCode: code }));
  const own = `agency:${agencyId}`;
  const apply = (row, source, inherited) => {
    const modifiers = modifierValue(row);
    if (!modifiers) return inherited;
    if (modifiers.length === 1 && modifiers[0] === 'NONE') return { modifiers: [], source, sourceLabel: RATE_SOURCE_LABELS[source] || source, explicitNone: true };
    return { modifiers, source, sourceLabel: RATE_SOURCE_LABELS[source] || source, explicitNone: false };
  };
  const starter = PLATFORM_STARTER_MODIFIERS[code];
  let result = starter ? { modifiers: [...starter], source: 'platform_starter', sourceLabel: RATE_SOURCE_LABELS.platform_starter, explicitNone: false } : { modifiers: [], source: 'unset', sourceLabel: RATE_SOURCE_LABELS.unset, explicitNone: false };
  const platform = read('platform', 'platform');
  if (platform) result = apply(platform, 'platform', result);
  result = apply(read(own, 'practice'), 'practice', result);
  if (credentialKey) result = apply(read(own, `credential:${credentialKey}`), 'credential', result);
  if (payerId) result = apply(read(own, `payer:${payerId}`), 'payer', result);
  if (providerUserId && payerId) result = apply(read(own, `provider:${providerUserId}:payer:${payerId}`), 'provider', result);
  return result;
}
export function mergeClaimModifiers({ feeModifiers = [], locationModifiers = [], overrideModifiers = null } = {}) {
  if (Array.isArray(overrideModifiers)) return overrideModifiers.filter(item => item && item !== 'NONE').slice(0, 4);
  const merged = [];
  for (const item of [...feeModifiers, ...locationModifiers]) {
    const code = String(item || '').trim().toUpperCase();
    if (/^[A-Z0-9]{2}$/.test(code) && !merged.includes(code)) merged.push(code);
  }
  return merged.slice(0, 4);
}
export function calculateFeeCharge(rate, { units = 1, durationMinutes } = {}) {
  if (rate.rateCents == null) return null;
  let value;
  if (rate.rateUnit === 'hour') {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw feeError(400, 'A positive duration is required for an hourly rate.');
    value = Math.round(rate.rateCents * durationMinutes / 60);
  } else if (rate.rateUnit === 'unit') {
    if (!Number.isSafeInteger(units) || units < 1) throw feeError(400, 'Billable units must be a positive whole number.');
    value = rate.rateCents * units;
  } else value = rate.rateCents;
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw feeError(400, 'The resulting charge exceeds the supported amount.');
  return value;
}
