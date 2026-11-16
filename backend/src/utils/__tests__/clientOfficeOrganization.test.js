import {expect,it} from 'vitest';
import {isOfficeRootOrganization,supportsAgencyOfficeClients} from '../clientOfficeOrganization.js';
it('accepts only an explicit clinical chart at its own root agency',()=>{
 const input={agencyId:2,organizationId:2,organizationType:'agency',clientType:'clinical'};
 expect(isOfficeRootOrganization(input)).toBe(true);
 for(const change of [{organizationId:3},{agencyId:0},{organizationType:'school'},{clientType:'school'},{clientType:'learning'},{clientType:''}])expect(isOfficeRootOrganization({...input,...change})).toBe(false);
});

it('permits healthcare agency office clients without a child organization while preserving employee and non-agency boundaries',()=>{
 expect(supportsAgencyOfficeClients({organization_type:'agency'})).toBe(true);expect(supportsAgencyOfficeClients({organization_type:'agency',feature_flags:'{"portalVariant":"healthcare_provider"}'})).toBe(true);
 expect(supportsAgencyOfficeClients({organization_type:'agency',feature_flags:{portalVariant:'employee'}})).toBe(false);expect(supportsAgencyOfficeClients({organization_type:'school'})).toBe(false);
});
