import { beforeEach, describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({default:{execute}}));
import {attachGuardianSchoolAffiliations} from '../guardianSchoolAffiliations.service.js';
const client = {client_id:8,organization_id:20,organization_type:'school',organization_name:'Current School',permissions_json:{canViewDocs:true}};
const options = {guardianUserId:4,providerClientIds:[8],documentClientIds:[8]};
beforeEach(() => execute.mockReset());
function seed() {
 execute.mockResolvedValueOnce([[{client_id:8,organization_id:20,name:'Current School',is_active:1,is_primary:1},{client_id:8,organization_id:19,name:'Former School',is_active:0,is_primary:0}]])
 .mockResolvedValueOnce([[{client_id:8,organization_id:20,name:'Current Provider',service_day:'Tuesday',is_active:1},{client_id:8,organization_id:19,name:'Previous Provider',service_day:'Monday',is_active:1}]])
 .mockResolvedValueOnce([[{client_id:8,school_organization_id:19,name:'Old Staff',access_level:'roi',is_active:1}]])
 .mockResolvedValueOnce([[{client_id:8,school_organization_id:19,status:'completed',document_id:33,signed_at:'2025-08-01'}]]);
}
describe('guardian school history', () => {
 it('retains former schools, days, providers and included staff without claiming they are current', async () => {
  seed(); const [result] = await attachGuardianSchoolAffiliations([client],options);
  const former = result.school_affiliations[1];
  expect(former.status).toBe('former');expect(former.providers[0]).toMatchObject({name:'Previous Provider',service_day:'Monday',status:'former'});
  expect(former.staff[0].status).toBe('former');expect(former.roi.document_id).toBe(33);
  expect(execute.mock.calls[3][1]).toEqual([4,8]);
  expect(execute.mock.calls[3][0]).toContain('s.guardian_user_id=?');
 });
 it('never promotes an inactive primary affiliation back to current', async () => {
  execute.mockResolvedValueOnce([[{client_id:8,organization_id:20,name:'Old School',is_active:0}]]).mockResolvedValue([[]]);
  const [result] = await attachGuardianSchoolAffiliations([client],options);
  expect(result.school_affiliations).toHaveLength(1);expect(result.school_affiliations[0].status).toBe('former');
 });
 it('keeps a legacy primary school visible when the assignment has not been backfilled', async () => {
  execute.mockResolvedValue([[]]);const [result] = await attachGuardianSchoolAffiliations([client],options);
  expect(result.school_affiliations[0]).toMatchObject({name:'Current School',status:'current'});
 });
 it('does not look up school history for restricted or adult-locked relationships', async () => {
  const rows=await attachGuardianSchoolAffiliations([{...client,no_view:true},{...client,guardian_portal_locked:true}],options);
  expect(rows.every(c=>c.school_affiliations.length===0)).toBe(true);expect(execute).not.toHaveBeenCalled();
 });
 it('does not disclose clinical schedule or document links without the corresponding scopes', async () => {
  seed();const [result]=await attachGuardianSchoolAffiliations([client],{guardianUserId:4});
  expect(result.school_affiliations.every(s=>s.providers.length===0)).toBe(true);
  expect(result.school_affiliations[1].roi.document_id).toBeNull();
 });
 it('honors disabled document sharing even when clinical scope is present', async () => {
  seed();const [result]=await attachGuardianSchoolAffiliations([{...client,permissions_json:{canViewDocs:false}}],options);
  expect(result.school_affiliations[1].roi.document_id).toBeNull();
 });
});
