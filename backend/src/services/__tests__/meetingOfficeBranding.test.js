import {it,expect,vi} from 'vitest';
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/AgencySchool.model.js',()=>({default:{getActiveAgencyIdForSchool:vi.fn()}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{getActiveAgencyIdForOrganization:vi.fn()}}));
import {buildPublicFormBranding} from '../publicFormBranding.service.js';
const agency={id:2,name:'Practice',slug:'practice',organization_type:'agency',custom_domain:'app.practice.example',logo_url:'/agency.svg'};
it('uses the actual chart entitlement, including JSON flags, to select AuricWell',async()=>{
 for(const feature_flags of [{medicalBillingEnabled:true},JSON.stringify({medicalBillingEnabled:true})]){
  const branding=await buildPublicFormBranding({agency:{...agency,feature_flags}});
  expect(branding.officeProduct).toBe('auricwell');expect(branding.officeOrigin).toBe('https://auricwell.com');
  expect(branding.agencyLogoUrl).toBe('/agency.svg');
 }
});
it('keeps non-EHR tenants on their own branding and domain, regardless of practice category',async()=>{
 for(const feature_flags of [{},{medicalBillingEnabled:false,clinicalChartEnabled:true}]){
  const branding=await buildPublicFormBranding({agency:{...agency,business_type:'mental_health',feature_flags}});
  expect(branding.officeProduct).toBe('tenant');expect(branding.officeOrigin).toBe('https://app.practice.example');
 }
});
it('does not inherit EHR branding from an affiliated agency with a shared theme',async()=>{
 const branding=await buildPublicFormBranding({agency:{...agency,feature_flags:{medicalBillingEnabled:true}},organization:{id:3,name:'Learning',slug:'learning',organization_type:'learning',custom_domain:'learn.example',feature_flags:{}}});
 expect(branding.officeProduct).toBe('tenant');expect(branding.officeOrigin).toBe('https://learn.example');
});
