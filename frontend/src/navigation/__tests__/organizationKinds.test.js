import {it,expect} from 'vitest';
import {isRootTenant,organizationKindLabel} from '../organizationKinds';
it('includes supported company types and never treats schools or unknown types as tenants',()=>{
 for(const organization_type of ['agency','clubwebapp','life_coach','consultant'])expect(isRootTenant({organization_type})).toBe(true);
 for(const organization_type of ['school','program','office','learning','clinical','affiliation','',null,'unexpected'])expect(isRootTenant({organization_type})).toBe(false);
 expect(isRootTenant(null)).toBe(false);expect(organizationKindLabel({organization_type:'school'})).toBe('Affiliated school');
});
