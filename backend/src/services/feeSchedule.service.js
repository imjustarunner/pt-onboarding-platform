import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { credentialPayerRows, isActiveCredentialPayerRow } from './credentialPayerEligibility.service.js';
import { classifyPayCategory, isFullyLicensedCredentialText } from '../utils/credentialNormalization.js';
import {
  feeError, normalizeFeeScope, normalizeFeeMutation, normalizeFeeCode, latestFeeEntries,
  feeLedgerKey, resolveFeeFromEntries, calculateFeeCharge, SELF_PAY_CATEGORIES
} from '../utils/feeScheduleRates.js';

const deps = { main: pool, clinical: clinicalPool, access: hasSchedulingBillingAccess, credentials: credentialPayerRows };
const bool = value => value === true || value === 1 || value === '1' || value === 'true';
const categoryFor = user => { const n = classifyPayCategory({ ...user, isHourlyWorker: user.is_hourly_worker }).category; return n ? `category_${n}` : 'unclassified'; };
const key = (ownerKey, mode, scopeKey, serviceCode, recordType = 'rate') => feeLedgerKey({ ownerKey, mode, scopeKey, serviceCode, recordType });

export async function assertFeeScheduleAccess(user, agencyId, d = deps) {
  if (!await d.access(user, agencyId)) throw feeError(403, 'Billing access is required for this practice.', 'FEE_SCHEDULE_ACCESS_DENIED');
}
async function ledgerRows(agencyId, db) {
  const [rows] = await db.execute(`SELECT r.* FROM medical_fee_schedule_rates r JOIN (
    SELECT MAX(id) AS id FROM medical_fee_schedule_rates WHERE owner_key IN (?, 'platform')
    GROUP BY owner_key,mode,record_type,scope_key,service_code
  ) latest ON latest.id=r.id`, [`agency:${agencyId}`]);
  return rows;
}
async function billingPayers(agencyId, db) {
  const [rows] = await db.execute(`SELECT r.id AS request_id,r.payer_name,d.claimmd_payer_id,d.directory_name
    FROM medical_payer_setup_requests r JOIN medical_payer_setup_details d ON d.request_id=r.id
    WHERE r.agency_id=? AND d.directory_status='id_match' AND d.claimmd_payer_id IS NOT NULL ORDER BY r.payer_name`, [agencyId]);
  const payers = new Map();
  for (const row of rows) {
    const id = String(row.claimmd_payer_id).trim(), old = payers.get(id);
    if (old) old.names.push(row.payer_name, row.directory_name);
    else payers.set(id, { id, name: row.payer_name || row.directory_name || id, names: [row.payer_name, row.directory_name].filter(Boolean), verified: true });
  }
  return [...payers.values()];
}
async function providersForPractice(agencyId, db) {
  const [rows] = await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.credential,u.title,u.role,u.is_hourly_worker
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    WHERE COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
      AND UPPER(COALESCE(u.status,'')) NOT IN ('TERMINATED','ARCHIVED','DELETED')
    ORDER BY u.last_name,u.first_name,u.id`, [agencyId]);
  const [credentials] = await db.execute(`SELECT c.user_id,c.effective_date,t.status AS credential_status,t.revalidation_due,
    l.payer_id AS billing_payer_id,MAX(r.payer_name) AS billing_payer_name
    FROM user_insurance_credentialing c
    JOIN insurance_credentialing_definitions p ON p.id=c.insurance_credentialing_definition_id AND p.agency_id=?
    LEFT JOIN credentialing_payer_links l ON l.insurance_definition_id=p.id AND l.agency_id=p.agency_id
    LEFT JOIN credentialing_workflow_tracking t ON t.agency_id=p.agency_id AND t.subject_type='provider' AND t.credential_id=c.id
    LEFT JOIN medical_payer_setup_details d ON d.claimmd_payer_id=l.payer_id AND d.directory_status='id_match'
    LEFT JOIN medical_payer_setup_requests r ON r.id=d.request_id AND r.agency_id=p.agency_id
    GROUP BY c.id,c.user_id,c.effective_date,t.status,t.revalidation_due,l.payer_id`, [agencyId]);
  return rows.filter(row => row.credential || ['provider','provider_plus','supervisor','intern','intern_plus','clinical_practice_assistant','qbha'].includes(row.role)).map(row => {
    const own = credentials.filter(c => Number(c.user_id) === Number(row.id));
    const ids = [...new Set(own.map(c => c.billing_payer_id).filter(Boolean))];
    const licensed = isFullyLicensedCredentialText(row.credential);
    return { id: Number(row.id), name: [row.first_name, row.last_name].filter(Boolean).join(' '), credential: row.credential || null,
      categoryKey: categoryFor(row), fullyLicensed: licensed,
      unlinkedCredentialCount: own.filter(c => (!c.billing_payer_id || !c.billing_payer_name) && isActiveCredentialPayerRow(c, { requireVerifiedPayer: false })).length,
      eligiblePayerIds: licensed ? ids.filter(id => own.filter(c => c.billing_payer_id === id).every(c => isActiveCredentialPayerRow(c))) : [] };
  });
}
async function legacyRows(agencyId, mode, d) {
  if (mode === 'insurance') {
    const [rows] = await d.clinical.execute(`SELECT id,procedure_code AS service_code,payer_label,modifier,unit_price_cents AS rate_cents
      FROM medical_fee_schedule_items WHERE agency_id=? AND is_active=1 ORDER BY id`, [agencyId]);
    return rows;
  }
  const [rows] = await d.main.execute(`SELECT s.id AS tenant_service_id,s.service_code,s.price_cents,s.default_duration_minutes,
    r.provider_user_id,r.rate_cents,r.rate_unit
    FROM tenant_services s LEFT JOIN self_pay_service_rates r ON r.tenant_service_id=s.id AND r.agency_id=s.agency_id
    WHERE s.agency_id=? AND s.is_active=1 AND s.service_code IS NOT NULL`, [agencyId]);
  return rows;
}
const legacyAmount = (row, source, mode) => row ? { rateCents: Number(row.rate_cents), rateUnit: row.rate_unit || (mode === 'insurance' ? 'unit' : 'session'), source, id: row.id } : null;
export function legacyFeeContext(rows, { mode, serviceCode, payer, providerUserId, tenantServiceId }) {
  const code = normalizeFeeCode(serviceCode);
  let matching = rows.filter(r => normalizeFeeCode(r.service_code) === code);
  if (mode === 'insurance') {
    matching = matching.filter(r => !String(r.modifier || '').trim());
    const names = new Set([payer?.id, ...(payer?.names || []), payer?.name].filter(Boolean).map(n => String(n).trim().toLowerCase()));
    return { practice: legacyAmount(matching.filter(r => !String(r.payer_label || '').trim()).at(-1), 'legacy_practice', mode),
      payer: legacyAmount(matching.filter(r => names.has(String(r.payer_label || '').trim().toLowerCase())).at(-1), 'legacy_payer', mode) };
  }
  if (tenantServiceId) matching = matching.filter(r => Number(r.tenant_service_id) === Number(tenantServiceId));
  const uniform = (list, source) => {
    const values = new Set(list.map(r => `${r.rate_cents}|${r.rate_unit || 'session'}`));
    return values.size === 1 ? legacyAmount(list[0], source, mode) : values.size > 1 ? { rateCents: null, source: 'legacy_conflict', conflict: true } : null;
  };
  return { practice: uniform(matching.filter(r => r.rate_cents != null && Number(r.provider_user_id) === 0), 'legacy_practice'),
    provider: providerUserId ? uniform(matching.filter(r => r.rate_cents != null && Number(r.provider_user_id) === Number(providerUserId)), 'legacy_provider') : null,
    catalog: uniform(matching.filter(r => r.price_cents != null).map(r => ({ rate_cents: r.price_cents, rate_unit: 'session' })), 'legacy_catalog') };
}
async function context(agencyId, mode, d) {
  const [[codes], rates, payers, providers, legacy, [state]] = await Promise.all([
    d.main.execute('SELECT * FROM agency_medical_service_codes WHERE agency_id=? ORDER BY service_code', [agencyId]),
    ledgerRows(agencyId, d.main), billingPayers(agencyId, d.main), providersForPractice(agencyId, d.main), legacyRows(agencyId, mode, d),
    d.main.execute('SELECT owner_key,revision FROM medical_fee_schedule_state WHERE owner_key IN (?,\'platform\')', [`agency:${agencyId}`])
  ]);
  return { codes, entries: latestFeeEntries(rates), payers, providers, legacy, state };
}
function assertSelection(scope, ctx, { strictProvider = true } = {}) {
  if (['payer','provider'].includes(scope.scope) && scope.mode === 'insurance' && !ctx.payers.some(p => p.id === scope.payerId)) throw feeError(409, 'Add or verify this payer in the practice payer list before configuring its rates.');
  if (scope.scope === 'provider') {
    const provider = ctx.providers.find(p => p.id === scope.providerUserId);
    if (!provider) throw feeError(403, 'The provider must be active in this practice.');
    if (strictProvider && scope.mode === 'insurance' && !provider.eligiblePayerIds.includes(scope.payerId)) throw feeError(409, 'Choose a fully licensed provider with a current credential linked to this billing payer.');
  }
}
function displayRow(code, scope, ctx) {
  const serviceCode = normalizeFeeCode(code.service_code);
  const provider = ctx.providers.find(p => p.id === scope.providerUserId), categoryKey = scope.scope === 'category' ? scope.categoryKey : provider?.categoryKey;
  const legacy = legacyFeeContext(ctx.legacy, { ...scope, serviceCode, payer: ctx.payers.find(p => p.id === scope.payerId) });
  const input = { ...scope, serviceCode, categoryKey, entries: ctx.entries, legacy };
  const current = resolveFeeFromEntries(input), inherited = resolveFeeFromEntries({ ...input, excludeScopeKey: scope.scopeKey });
  const platform = resolveFeeFromEntries({ ...input, scope: 'platform' });
  const own = ctx.entries.get(key(scope.ownerKey, scope.mode, scope.scopeKey, serviceCode));
  const visibility = ctx.entries.get(key(`agency:${scope.agencyId}`, scope.mode, 'practice', serviceCode, 'visibility'));
  const inheritedLegacyOverride = !own && current.source === ({ practice: 'legacy_practice', payer: 'legacy_payer', provider: 'legacy_provider' }[scope.scope]);
  return { serviceCode, description: code.description || serviceCode, isActive: bool(code.is_active), isAddon: bool(code.is_addon), isHidden: bool(visibility?.is_hidden),
    unitCalcMode: code.unit_calc_mode, unitMinutes: code.unit_minutes == null ? null : Number(code.unit_minutes),
    ...current, customRateCents: own?.rate_cents != null ? Number(own.rate_cents) : inheritedLegacyOverride ? current.rateCents : null,
    customRateUnit: own?.rate_unit || (inheritedLegacyOverride ? current.rateUnit : null),
    inheritedRateCents: inherited.rateCents, inheritedRateUnit: inherited.rateUnit, inheritedSource: inherited.source,
    platformRateCents: platform.rateCents, scopeKey: scope.scopeKey };
}
export async function getCanonicalFeeSchedule(user, input = {}, d = deps) {
  const scope = normalizeFeeScope(input);
  await assertFeeScheduleAccess(user, scope.agencyId, d);
  if (scope.scope === 'platform' && user.role !== 'super_admin') throw feeError(403, 'Only platform administrators can change platform defaults.');
  const ctx = await context(scope.agencyId, scope.mode, d);
  assertSelection(scope, ctx);
  const revision = Number(ctx.state.find(s => s.owner_key === scope.ownerKey)?.revision || 0);
  const rows = ctx.codes.filter(c => bool(input.includeInactive) || bool(c.is_active)).map(c => displayRow(c, scope, ctx)).filter(r => bool(input.includeHidden) || !r.isHidden);
  const unlinkedCredentialCount = ctx.providers.reduce((sum, provider) => sum + provider.unlinkedCredentialCount, 0);
  const warnings = ctx.payers.length ? [] : ['Add and verify payers in the practice payer list to configure insurance-specific rates.'];
  if (scope.mode === 'insurance' && unlinkedCredentialCount) warnings.push(`${unlinkedCredentialCount} recorded payer credentials need a verified billing-payer link in Credentialing before provider insurance overrides can be configured.`);
  return { ...scope, revision, readOnly: false, canManagePlatform: user.role === 'super_admin', rows,
    payers: ctx.payers.map(({ names, ...payer }) => payer), providers: ctx.providers, categories: SELF_PAY_CATEGORIES,
    warnings, unlinkedCredentialCount, credentialingPath: `/admin/credentialing?agencyId=${scope.agencyId}`,
    starterRateNotice: 'Platform starters are editable billed-charge defaults. They are not payer reimbursement rates. Existing service-code and unit rules apply.' };
}
async function lockRevision(db, ownerKey, revision) {
  // Acquire the row's exclusive lock up front. INSERT IGNORE would take a shared
  // duplicate-key lock and two writers could deadlock upgrading it FOR UPDATE.
  await db.execute('INSERT INTO medical_fee_schedule_state (owner_key,revision) VALUES (?,0) ON DUPLICATE KEY UPDATE owner_key=VALUES(owner_key)', [ownerKey]);
  const [[state]] = await db.execute('SELECT revision FROM medical_fee_schedule_state WHERE owner_key=? FOR UPDATE', [ownerKey]);
  if (Number(state.revision) !== revision) throw feeError(409, 'These fee settings changed. Reload before saving.', 'FEE_SCHEDULE_STALE');
}
async function appendRate(db, value, userId, revision) {
  await db.execute(`INSERT INTO medical_fee_schedule_rates
    (owner_key,agency_id,revision,record_type,mode,scope_key,service_code,rate_cents,rate_unit,is_hidden,action,reason,actor_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [value.ownerKey, value.scope === 'platform' ? null : value.agencyId, revision,
    value.action === 'set_visibility' ? 'visibility' : 'rate', value.mode, value.scopeKey, value.serviceCode,
    value.rateCents, value.action === 'reset' || value.action === 'set_visibility' ? null : value.rateUnit,
    value.action === 'set_visibility' ? value.isHidden ? 1 : 0 : null, value.action, value.reason, userId]);
}
export async function saveCanonicalFeeSchedule(user, input, d = deps) {
  const value = normalizeFeeMutation(input);
  await assertFeeScheduleAccess(user, value.agencyId, d);
  if (value.scope === 'platform' && user.role !== 'super_admin') throw feeError(403, 'Only platform administrators can change platform defaults.');
  const db = await d.main.getConnection();
  try {
    await db.beginTransaction();
    await lockRevision(db, value.ownerKey, value.revision);
    const ctx = await context(value.agencyId, value.mode, { ...d, main: db });
    assertSelection(value, ctx);
    const code = ctx.codes.find(c => normalizeFeeCode(c.service_code) === value.serviceCode);
    if (!code || !bool(code.is_active)) throw feeError(409, 'Activate this service in the practice service-code settings before changing its rates.');
    const record = value.action === 'update_practice_default' ? { ...value, scope: 'practice', scopeKey: 'practice' } : value;
    await appendRate(db, record, user.id, value.revision + 1);
    await db.execute('UPDATE medical_fee_schedule_state SET revision=revision+1 WHERE owner_key=?', [value.ownerKey]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  return getCanonicalFeeSchedule(user, { ...value, includeHidden: true, includeInactive: input.includeInactive }, d);
}
export async function adoptPlatformFeeDefaults(user, input, d = deps) {
  const scope = normalizeFeeScope({ ...input, scope: 'practice' });
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw feeError(400, 'Reload the current fee schedule before applying defaults.');
  await assertFeeScheduleAccess(user, scope.agencyId, d);
  const db = await d.main.getConnection(); let adopted = 0;
  try {
    await db.beginTransaction(); await lockRevision(db, scope.ownerKey, input.revision);
    const ctx = await context(scope.agencyId, scope.mode, { ...d, main: db });
    for (const code of ctx.codes.filter(c => bool(c.is_active))) {
      const row = displayRow(code, scope, ctx);
      // A deliberate reset is also a saved choice; bulk defaults must preserve it.
      if (row.isHidden || ctx.entries.has(key(scope.ownerKey, scope.mode, 'practice', row.serviceCode)) || !['platform','platform_starter'].includes(row.source) || row.rateCents == null) continue;
      await appendRate(db, { ...scope, serviceCode: row.serviceCode, rateCents: row.rateCents, rateUnit: row.rateUnit, action: 'adopt_platform_default', reason: 'Applied platform defaults to previously unset practice rates.' }, user.id, input.revision + 1);
      adopted++;
    }
    if (adopted) await db.execute('UPDATE medical_fee_schedule_state SET revision=revision+1 WHERE owner_key=?', [scope.ownerKey]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  return { ...await getCanonicalFeeSchedule(user, { ...scope, includeHidden: true }, d), adopted };
}

/** Resolve once when a new claim/booking is created; persist the amount and source
 * with that document. Reading/reviewing an existing claim must not invoke repricing. */
export async function resolveCanonicalFeeQuote(input, d = deps) {
  const agencyId = Number(input.agencyId), serviceCode = normalizeFeeCode(input.serviceCode), mode = input.mode || 'insurance';
  if (!Number.isSafeInteger(agencyId) || agencyId < 1 || !serviceCode) throw feeError(400, 'Practice and service code are required for a fee quote.');
  const providerUserId = Number(input.providerUserId || input.providerId) || null;
  const [[codes], rateRows, payers, legacy] = await Promise.all([
    d.main.execute('SELECT * FROM agency_medical_service_codes WHERE agency_id=? AND service_code=?', [agencyId, serviceCode]),
    ledgerRows(agencyId, d.main), billingPayers(agencyId, d.main), legacyRows(agencyId, mode, d)
  ]);
  if (!codes[0] || !bool(codes[0].is_active)) return { rateCents: null, rateUnit: mode === 'insurance' ? 'unit' : 'session', amountCents: null, source: 'unset', sourceLabel: 'Rate not set', serviceCode, inactiveService: !!codes[0] };
  let categoryKey = null, providerRateEligible = false;
  if (providerUserId) {
    const [[provider]] = await d.main.execute(`SELECT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
      WHERE u.id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0`, [agencyId, providerUserId]);
    if (provider) {
      categoryKey = categoryFor(provider);
      if (mode === 'self_pay') providerRateEligible = true;
      else if (isFullyLicensedCredentialText(provider.credential)) {
        const matches = (await d.credentials(providerUserId, agencyId, d.main)).filter(c => String(c.billing_payer_id) === String(input.payerId || ''));
        providerRateEligible = matches.length > 0 && matches.every(c => isActiveCredentialPayerRow(c, { asOfDate: input.dateOfService }));
      }
    }
  }
  const rate = resolveFeeFromEntries({ agencyId, mode, serviceCode, payerId: input.payerId, providerUserId: providerRateEligible ? providerUserId : null,
    categoryKey, entries: latestFeeEntries(rateRows), legacy: legacyFeeContext(legacy, { mode, serviceCode, payer: payers.find(p => p.id === input.payerId), providerUserId: providerRateEligible ? providerUserId : null, tenantServiceId: input.tenantServiceId }) });
  return { ...rate, amountCents: calculateFeeCharge(rate, { units: input.units ?? 1, durationMinutes: input.durationMinutes }), serviceCode,
    payerId: input.payerId || null, providerUserId, providerRateEligible, categoryKey };
}

/** Batched self-pay display for existing service editors/public profile consumers.
 * Services without an active canonical code stay with their existing nonclinical
 * rate system (for example tutoring's format/subject tiers). */
export async function canonicalSelfPayRatesForServices({ agencyId, providerUserId, services }, d = deps) {
  const ctx = await context(agencyId, 'self_pay', d), result = new Map();
  const provider = ctx.providers.find(p => p.id === Number(providerUserId));
  for (const service of services) {
    const serviceCode = normalizeFeeCode(service.serviceCode);
    if (!ctx.codes.some(c => normalizeFeeCode(c.service_code) === serviceCode && bool(c.is_active))) continue;
    const base = { agencyId, mode: 'self_pay', serviceCode, providerUserId: provider?.id || null, categoryKey: provider?.categoryKey,
      entries: ctx.entries, legacy: legacyFeeContext(ctx.legacy, { mode: 'self_pay', serviceCode, providerUserId: provider?.id, tenantServiceId: service.id }) };
    result.set(Number(service.id), { ...resolveFeeFromEntries({ ...base, scope: provider ? 'provider' : 'practice' }),
      practiceRate: resolveFeeFromEntries({ ...base, scope: 'practice' }), revision: Number(ctx.state.find(s => s.owner_key === `agency:${agencyId}`)?.revision || 0) });
  }
  return result;
}
