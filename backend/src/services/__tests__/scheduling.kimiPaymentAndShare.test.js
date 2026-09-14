import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { resolveClaimBillingSupervisorId: vi.fn().mockResolvedValue(null) } }));
import pool from '../../config/database.js';
import { getPublicCounselingHourlyRate } from '../publicCounselingRate.service.js';
import { listProviderAcceptedInsurancesForDisplay, mergeAgencyInsuranceAcceptance, mapAcceptedInsuranceForDisplay } from '../providerAcceptedInsurance.service.js';
import { tenantSmsImage, pathToSharePageKey, resolvePortalSlugFromSharePath } from '../../content/tenantBrandAssets.js';

describe('Kimi service and agency boundaries', () => {
 beforeEach(() => vi.resetAllMocks());
 it('reads the NLU counseling fee from the provider service rate sheet', async () => {
  pool.execute.mockResolvedValue([[{rate_cents:10000}]]);
  expect(await getPublicCounselingHourlyRate({agencyId:6,providerUserId:532})).toBe(10000);
  const [sql,params]=pool.execute.mock.calls[0];
  expect(params).toEqual([6,532]);
  expect(sql).toContain("s.business_type = 'mental_health'");
  expect(sql).toContain('s.agency_id = r.agency_id');
 });
 it.each(['coaching','tutoring','consulting'])('does not use counseling prices for %s', async serviceType => {
  expect(await getPublicCounselingHourlyRate({agencyId:6,providerUserId:532,serviceType})).toBeNull();
  expect(pool.execute).not.toHaveBeenCalled();
 });
 it('leaves unconfigured or ambiguous rates unquoted and retains a free rate', async () => {
  for(const [rows,expected] of [[[],null],[[{rate_cents:10000},{rate_cents:15000}],null],[[{rate_cents:0}],0]]){
   pool.execute.mockResolvedValue([rows]);
   expect(await getPublicCounselingHourlyRate({agencyId:432,providerUserId:532})).toBe(expected);
  }
 });
 it('labels agency acceptance without inventing credentialing', () => {
  const rows=mergeAgencyInsuranceAcceptance([],[{id:19,label:'Medicaid',is_allowed:1}]);
  expect(mapAcceptedInsuranceForDisplay(rows[0])).toMatchObject({insurance_key:'type:19',name:'Medicaid',source:'agency_acceptance',insurance_definition_id:null,effective_date:null});
 });
 it('preserves existing credentialing and honors an explicit denial', () => {
  const direct={name:'Medicaid',insurance_definition_id:30,source:'billing_supervisor'};
  expect(mergeAgencyInsuranceAcceptance([direct],[{id:19,label:'Medicaid',is_allowed:1}])).toEqual([direct]);
  expect(mergeAgencyInsuranceAcceptance([direct],[{id:19,label:'Medicaid',is_allowed:0}])).toEqual([]);
 });
 it('scopes acceptance to NLU and excludes self-pay from the insurance list', async () => {
  pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:19,label:'Medicaid',is_allowed:1}]]).mockResolvedValueOnce([[{credential:'BA, Unlicensed Masters'}]]);
  expect(await listProviderAcceptedInsurancesForDisplay({agencyId:6,userId:532})).toEqual([expect.objectContaining({name:'Medicaid'})]);
  const [sql,params]=pool.execute.mock.calls[1];
  expect(params).toEqual([532,6]);expect(sql).toContain('i.agency_id = ?');expect(sql).toContain("'self_pay'");
 });
 it.each(['/p/kimi','/p/kimi/counseling','/p/kimi/packages'])('uses the supplied SMS image for %s', path => {
  expect(tenantSmsImage(resolvePortalSlugFromSharePath(path),pathToSharePageKey(path))).toBe('/assets/kimi/kimisms.png');
 });
});
