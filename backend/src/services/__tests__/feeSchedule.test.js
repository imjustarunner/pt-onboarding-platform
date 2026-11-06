import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: vi.fn() }));
import { normalizeFeeMutation, normalizeFeeScope, latestFeeEntries, resolveFeeFromEntries, calculateFeeCharge, PLATFORM_STARTER_FEES } from '../../utils/feeScheduleRates.js';
import { legacyFeeContext, assertFeeScheduleAccess, saveCanonicalFeeSchedule, getCanonicalFeeSchedule, resolveCanonicalFeeQuote } from '../feeSchedule.service.js';

const row = (id, scope_key, rate_cents, extra = {}) => ({ id, owner_key: 'agency:2', mode: 'insurance', record_type: 'rate', scope_key, service_code: '90834', rate_cents, rate_unit: 'unit', ...extra });
const resolve = (rows, extra = {}) => resolveFeeFromEntries({ agencyId: 2, serviceCode: '90834', mode: 'insurance', payerId: 'AET', providerUserId: 8, entries: latestFeeEntries(rows), ...extra });
describe('canonical fee inheritance', () => {
  it('returns zero client charge for a pro bono funding designation without applying saved rates',async()=>{
    const database={execute:vi.fn().mockRejectedValue(new Error('A funding designation must not load a charge'))};
    expect(await resolveCanonicalFeeQuote({agencyId:2,serviceCode:'PRO-BONO SERVICE',mode:'self_pay',durationMinutes:60},{main:database})).toMatchObject({amountCents:0,rateCents:0,source:'pro_bono'});
    expect(database.execute).not.toHaveBeenCalled();
  });
  it('uses platform, practice, payer then credentialed provider override', () => {
    expect(resolve([]).rateCents).toBe(10000);
    expect(resolve([row(1, 'practice', 11000)]).source).toBe('practice');
    expect(resolve([row(1, 'practice', 11000), row(2, 'payer:AET', 12000)]).rateCents).toBe(12000);
    const result = resolve([row(1, 'practice', 11000), row(2, 'payer:AET', 12000), row(3, 'provider:8:payer:AET', 13000)]);
    expect(result).toMatchObject({ rateCents: 13000, source: 'provider', rateRevisionId: 3 });
  });
  it('never uses another practice, payer, provider or payment mode', () => {
    expect(resolve([row(1, 'practice', 99999, { owner_key: 'agency:6' }), row(2, 'payer:OTHER', 99999), row(3, 'provider:9:payer:AET', 99999), row(4, 'practice', 99999, { mode: 'self_pay' })]).source).toBe('platform_starter');
  });
  it('preserves zero as a deliberate override and uses the newest revision', () => {
    expect(resolve([row(1, 'practice', 11000), row(3, 'practice', 0), row(2, 'practice', 17000)])).toMatchObject({ rateCents: 0, source: 'practice', rateRevisionId: 3 });
  });
  it('reset suppresses a legacy rate and returns to inherited pricing', () => {
    expect(resolve([row(1, 'practice', null)], { legacy: { practice: { rateCents: 45000, source: 'legacy_practice' } } })).toMatchObject({ rateCents: 10000, source: 'platform_starter' });
  });
  it('self-pay providers inherit their existing shared category', () => {
    const rows = [row(1, 'practice', 11000, { mode: 'self_pay', rate_unit: 'session' }), row(2, 'category:category_2', 9000, { mode: 'self_pay', rate_unit: 'hour' })];
    expect(resolve(rows, { mode: 'self_pay', categoryKey: 'category_2' })).toMatchObject({ rateCents: 9000, source: 'category', rateUnit: 'hour' });
    expect(resolve([...rows, row(3, 'provider:8', 8000, { mode: 'self_pay', rate_unit: 'session' })], { mode: 'self_pay', categoryKey: 'category_2' })).toMatchObject({ rateCents: 8000, source: 'provider', rateUnit: 'session' });
  });
  it('global platform edits fall back to starters after explicit reset', () => {
    expect(resolve([row(1, 'platform', 14000, { owner_key: 'platform' })]).rateCents).toBe(14000);
    expect(resolve([row(1, 'platform', 14000, { owner_key: 'platform' }), row(2, 'platform', null, { owner_key: 'platform' })]).rateCents).toBe(10000);
  });
  it('has no invented starter for a retired or screenshot-mislabeled code', () => {
    expect(PLATFORM_STARTER_FEES['99241']).toBeUndefined();
    expect(PLATFORM_STARTER_FEES['99415']).toBeUndefined();
    expect(PLATFORM_STARTER_FEES['90834']).toBe(10000);
    expect(resolve([], { serviceCode: 'CUSTOM SERVICE' }).rateCents).toBeNull();
  });
  it('computes an inherited preview without the selected override', () => {
    expect(resolve([row(1, 'practice', 11000), row(2, 'payer:AET', 12000)], { scope: 'payer', excludeScopeKey: 'payer:AET' })).toMatchObject({ rateCents: 11000, source: 'practice' });
  });
});
describe('money and mutations', () => {
  const input = { agencyId: 2, mode: 'insurance', scope: 'practice', serviceCode: '+90785', revision: 0, action: 'set', rateCents: 3000 };
  it('normalizes a code but never changes catalog coding rules', () => expect(normalizeFeeMutation(input)).toMatchObject({ serviceCode: '90785', rateCents: 3000, rateUnit: 'unit' }));
  it.each([undefined, null, '', '100', 1.5, -1, NaN, Infinity, 100000001])('rejects ambiguous/invalid cents %s', rateCents => expect(() => normalizeFeeMutation({ ...input, rateCents })).toThrow());
  it('accepts an explicit free service and validates its scope', () => {
    expect(normalizeFeeMutation({ ...input, rateCents: 0 }).rateCents).toBe(0);
    expect(() => normalizeFeeScope({ agencyId: 2, scope: 'provider', mode: 'insurance', providerUserId: 8 })).toThrow('payer');
    expect(() => normalizeFeeScope({ agencyId: 2, scope: 'payer', mode: 'self_pay', payerId: 'AET' })).toThrow('scope');
  });
  it('multiples unit prices exactly, prorates hourly self-pay and keeps session prices fixed', () => {
    expect(calculateFeeCharge({ rateCents: 3000, rateUnit: 'unit' }, { units: 4 })).toBe(12000);
    expect(calculateFeeCharge({ rateCents: 9000, rateUnit: 'hour' }, { durationMinutes: 45 })).toBe(6750);
    expect(calculateFeeCharge({ rateCents: 8000, rateUnit: 'session' }, { durationMinutes: 90 })).toBe(8000);
    expect(calculateFeeCharge({ rateCents: null, rateUnit: 'unit' })).toBeNull();
  });
  it('rejects fractional units and integer overflow', () => {
    expect(() => calculateFeeCharge({ rateCents: 3000, rateUnit: 'unit' }, { units: 1.25 })).toThrow();
    expect(() => calculateFeeCharge({ rateCents: 100000000, rateUnit: 'unit' }, { units: 22 })).toThrow();
  });
  it('visibility is a fee-list choice, not service deactivation', () => {
    expect(normalizeFeeMutation({ ...input, action: 'set_visibility', isHidden: true })).toMatchObject({ isHidden: true, rateCents: null });
    expect(() => normalizeFeeMutation({ ...input, scope: 'payer', payerId: 'AET', action: 'set_visibility', isHidden: true })).toThrow();
  });
});
describe('legacy rate preservation', () => {
  it('matches payer identities exactly and never takes a different payer’s rate', () => {
    const rows = [{ id: 1, service_code: '90834', rate_cents: 10000 }, { id: 2, service_code: '90834', payer_label: 'Aetna', rate_cents: 12000 }, { id: 3, service_code: '90834', payer_label: 'Other', rate_cents: 80000 }];
    expect(legacyFeeContext(rows, { mode: 'insurance', serviceCode: '90834', payer: { id: 'AET', name: 'Aetna' } })).toMatchObject({ practice: { rateCents: 10000 }, payer: { rateCents: 12000 } });
  });
  it('does not turn a modifier-specific rate into a generic code rate', () => {
    expect(legacyFeeContext([{ service_code: 'H0023', modifier: 'HT', rate_cents: 2200 }], { mode: 'insurance', serviceCode: 'H0023' }).practice).toBeNull();
  });
  it('retains service-specific self-pay legacy amounts without arbitrarily choosing conflicts', () => {
    const rows = [{ tenant_service_id: 1, service_code: '90834', provider_user_id: 0, rate_cents: 10000, rate_unit: 'session' }, { tenant_service_id: 2, service_code: '90834', provider_user_id: 0, rate_cents: 20000, rate_unit: 'session' }];
    expect(legacyFeeContext(rows, { mode: 'self_pay', serviceCode: '90834' }).practice).toMatchObject({ conflict: true });
    expect(legacyFeeContext(rows, { mode: 'self_pay', serviceCode: '90834', tenantServiceId: 2 }).practice.rateCents).toBe(20000);
  });
});
describe('authorization and stale protection', () => {
  it('does not read or mutate another practice without billing access', async () => {
    const main = { getConnection: vi.fn() };
    await expect(saveCanonicalFeeSchedule({ id: 8 }, { agencyId: 2, serviceCode: '90834', revision: 0, rateCents: 10000 }, { access: async () => false, main })).rejects.toMatchObject({ status: 403 });
    expect(main.getConnection).not.toHaveBeenCalled();
    await expect(assertFeeScheduleAccess({ id: 8 }, 6, { access: async () => false })).rejects.toMatchObject({ status: 403 });
  });
  it('rejects platform edits by a practice biller', async () => {
    await expect(saveCanonicalFeeSchedule({ id: 8, role: 'staff' }, { agencyId: 2, scope: 'platform', serviceCode: '90834', revision: 0, rateCents: 10000 }, { access: async () => true })).rejects.toMatchObject({ status: 403 });
  });
  it('rolls back stale saves before reading price or credential data', async () => {
    const db = { beginTransaction: vi.fn(), execute: vi.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{ revision: 2 }]]), rollback: vi.fn(), release: vi.fn(), commit: vi.fn() };
    await expect(saveCanonicalFeeSchedule({ id: 8, role: 'staff' }, { agencyId: 2, serviceCode: '90834', revision: 1, rateCents: 10000 }, { access: async () => true, main: { getConnection: async () => db } })).rejects.toMatchObject({ status: 409, code: 'FEE_SCHEDULE_STALE' });
    expect(db.rollback).toHaveBeenCalledOnce(); expect(db.commit).not.toHaveBeenCalled(); expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

it('uses production migration parsing for both immutable fee triggers', async () => {
  const {readFile}=await import('node:fs/promises');
  const {splitSqlStatements,stripSqlLineComments}=await import('../../utils/migrationSql.js');
  const source=await readFile(new URL('../../../../database/migrations/1740_canonical_fee_schedules.sql',import.meta.url),'utf8');
  const statements=splitSqlStatements(stripSqlLineComments(source));
  expect(statements).toHaveLength(6);
  expect(statements.some(s=>s.includes('DELIMITER'))).toBe(false);
  expect(statements.filter(s=>s.startsWith('CREATE TRIGGER'))).toHaveLength(2);
  expect(statements.filter(s=>s.startsWith('CREATE TRIGGER')).every(s=>s.includes("SIGNAL SQLSTATE '45000'"))).toBe(true);
});

it('reports missing and inactive claim codes through the production fee overview without returning patient data or changing codes', async () => {
  const codes = [{ service_code: '90834', is_active: 1 }, { service_code: 'CUSTOM', is_active: 0 }];
  const main = { execute: vi.fn(async sql => [sql.includes('SELECT * FROM agency_medical_service_codes') ? codes : []]) };
  const clinical = { execute: vi.fn(async (sql, args) => {
    expect(args).toEqual([2]);
    if (sql.includes('FROM clinical_claims c')) {
      expect(sql).toContain('l.clinical_claim_id=c.id');
      expect(sql).toContain('s.agency_id=c.agency_id');
      expect(sql).toContain('WHERE c.agency_id=? AND COALESCE(c.is_deleted,0)=0');
      expect(sql).toContain("COALESCE(NULLIF(TRIM(l.procedure_code),''),s.service_code)");
      return [[{service_code:'H0002'}, {service_code:'CUSTOM'}, {service_code:'90834'}, {service_code:'h0002'}, {service_code:null}]];
    }
    return [[]];
  }) };
  const view = await getCanonicalFeeSchedule({id:501,role:'super_admin'}, {agencyId:2}, {main,clinical,access:async()=>true});
  expect(view.missingServiceCodes).toEqual(['H0002']);
  expect(view.inactiveServiceCodes).toEqual(['CUSTOM']);
  expect(view.warnings).toContainEqual(expect.stringContaining('Claims use service codes missing'));
  expect(view.warnings).toContainEqual(expect.stringContaining('Claims use inactive service codes'));
  expect(view.rows.map(r=>r.serviceCode)).toEqual(['90834']);
  const selfPay = await getCanonicalFeeSchedule({id:501,role:'super_admin'}, {agencyId:2,mode:'self_pay'}, {main,clinical,access:async()=>true});
  expect(selfPay.warnings).not.toContainEqual(expect.stringContaining('Add and verify payers'));
  expect([...main.execute.mock.calls,...clinical.execute.mock.calls].every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
});

it('keeps an unavailable code distinct from a free service without inventing a starter rate', async () => {
  const d={main:{execute:vi.fn(async()=>[[]])},clinical:{execute:vi.fn(async()=>[[]])}};
  expect(await resolveCanonicalFeeQuote({agencyId:2,serviceCode:'H0002'},d)).toMatchObject({serviceCodeAvailable:false,inactiveService:false,amountCents:null,rateCents:null});
});

it('seeds H0002 as one screening encounter without invented time, booking or expanded credential eligibility', async () => {
  const {DEFAULT_MEDICAL_SERVICE_CODES}=await import('../medicalBillingDefaults.service.js');
  const {eligibleServiceCodesForTier}=await import('../../utils/clinicalServiceCodeEligibility.js');
  const def=DEFAULT_MEDICAL_SERVICE_CODES.find(d=>d.serviceCode==='H0002');
  expect(def).toMatchObject({description:'Behavioral Health Screening',unitCalcMode:'SINGLE',maxUnitsPerSession:1,unitMinutes:null,minMinutes:null,maxMinutes:null,defaultDurationMinutes:null,defaultPlaceOfService:null,allowedCredentialTiers:['intern_plus'],isAddon:false});
  expect(eligibleServiceCodesForTier('qbha')).not.toContain('H0002');
  expect(eligibleServiceCodesForTier('bachelors')).not.toContain('H0002');
  const {readFile}=await import('node:fs/promises');
  const {splitSqlStatements,stripSqlLineComments}=await import('../../utils/migrationSql.js');
  const sql=await readFile(new URL('../../../../database/migrations/1741_h0002_medical_catalog.sql',import.meta.url),'utf8');
  const statements=splitSqlStatements(stripSqlLineComments(sql));
  expect(statements).toHaveLength(1);
  expect(statements[0]).toMatch(/^INSERT INTO agency_medical_service_codes/);
  expect(statements[0]).toContain("e.service_code='H0002'");
  expect(statements[0]).not.toMatch(/\bUPDATE\b|\bDELETE\b|tenant_services|payroll/);
});
