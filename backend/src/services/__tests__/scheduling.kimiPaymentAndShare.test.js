import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { resolveClaimBillingSupervisorId: vi.fn().mockResolvedValue(null) } }));
vi.mock('../selfPayRates.service.js', () => ({ getSelfPayRates: vi.fn() }));
import { getSelfPayRates } from '../selfPayRates.service.js';
import pool from '../../config/database.js';
import { getPublicCounselingHourlyRate } from '../publicCounselingRate.service.js';
import { listProviderAcceptedInsurancesForDisplay, mergeAgencyInsuranceAcceptance, mapAcceptedInsuranceForDisplay } from '../providerAcceptedInsurance.service.js';
import { tenantSmsImage, pathToSharePageKey, resolvePortalSlugFromSharePath } from '../../content/tenantBrandAssets.js';

describe('Kimi service and agency boundaries', () => {
 beforeEach(() => vi.resetAllMocks());
 const service = rate => ({businessType:'mental_health',allowsIndividual:true,allowsGroup:false,effectiveRate:rate});
 it('uses the same effective rate as booking, including practice/category/provider inheritance', async () => {
  getSelfPayRates.mockResolvedValue({services:[service({rateCents:10000,rateUnit:'hour',source:'category'})]});
  expect(await getPublicCounselingHourlyRate({agencyId:6,providerUserId:532})).toBe(10000);
  expect(getSelfPayRates).toHaveBeenCalledWith(6,532);
 });
 it.each(['coaching','tutoring','consulting'])('does not use counseling prices for %s', async serviceType => {
  expect(await getPublicCounselingHourlyRate({agencyId:6,providerUserId:532,serviceType})).toBeNull();
  expect(getSelfPayRates).not.toHaveBeenCalled();
 });
 it('leaves unconfigured, mixed and session rates unquoted and retains a free rate', async () => {
  for(const [rates,expected] of [[[],null],[[{rateCents:10000,rateUnit:'hour'},{rateCents:15000,rateUnit:'hour'}],null],[[{rateCents:0,rateUnit:'hour'}],0],[[{rateCents:10000,rateUnit:'session'}],null],[[null],null]]) {
   getSelfPayRates.mockResolvedValue({services:rates.map(service)});
   expect(await getPublicCounselingHourlyRate({agencyId:432,providerUserId:532})).toBe(expected);
  }
 });
 it('does not publish an insurance based solely on an old visibility override', () => {
  expect(mergeAgencyInsuranceAcceptance([],[{id:19,label:'Medicaid',is_allowed:1}])).toEqual([]);
 });
 it('preserves existing credentialing and honors an explicit denial', () => {
  const direct={name:'Medicaid',insurance_definition_id:30,source:'billing_supervisor'};
  expect(mergeAgencyInsuranceAcceptance([direct],[{id:19,label:'Medicaid',is_allowed:1}])).toEqual([direct]);
  expect(mergeAgencyInsuranceAcceptance([direct],[{id:19,label:'Medicaid',is_allowed:0}])).toEqual([]);
 });
 it('scopes visibility restrictions to NLU and excludes self-pay from insurance', async () => {
  pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:19,label:'Medicaid',is_allowed:1}]]).mockResolvedValueOnce([[{credential:'BA, Unlicensed Masters'}]]);
  expect(await listProviderAcceptedInsurancesForDisplay({agencyId:6,userId:532})).toEqual([]);
  const [sql,params]=pool.execute.mock.calls[1];
  expect(params).toEqual([532,6]);expect(sql).toContain('i.agency_id = ?');expect(sql).toContain("'self_pay'");
 });
 it.each(['/p/kimi','/p/kimi/counseling','/p/kimi/packages'])('uses the supplied SMS image for %s', path => {
  expect(tenantSmsImage(resolvePortalSlugFromSharePath(path),pathToSharePageKey(path))).toBe('/assets/kimi/kimisms.png');
 });
});
