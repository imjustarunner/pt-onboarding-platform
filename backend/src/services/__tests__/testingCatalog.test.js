import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),upsert:vi.fn(),payroll:vi.fn(),tenant:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/AgencyMedicalServiceCode.model.js',()=>({default:{findByAgencyAndCode:m.find,upsert:m.upsert}}));
vi.mock('../../models/PayrollServiceCodeRule.model.js',()=>({default:{listForAgency:vi.fn(async()=>[]),upsert:m.payroll}}));
vi.mock('../../models/TenantService.model.js',()=>({default:{listForAgency:m.tenant}}));
import {syncClinicalCodePresent} from '../agencyServiceCodeCatalog.service.js';
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(null);m.upsert.mockImplementation(async data=>data);});
describe('Testing code reference is separate from payer activation',()=>{
 it('does not make a missing Testing code billable or bookable with an unverified generic unit setup',async()=>{
  expect(await syncClinicalCodePresent(2,'96136')).toMatchObject({inactive:true});
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({serviceCode:'96136',isActive:false}));
  expect(m.tenant).not.toHaveBeenCalled();
 });
 it('preserves a deliberately disabled code and its saved billing settings',async()=>{
  m.find.mockResolvedValue({serviceCode:'96136',isActive:false,unitCalcMode:'CUSTOM_BANDS'});
  expect(await syncClinicalCodePresent(6,'96136')).toMatchObject({inactive:true});
  expect(m.upsert).not.toHaveBeenCalled();expect(m.tenant).not.toHaveBeenCalled();
 });
});
