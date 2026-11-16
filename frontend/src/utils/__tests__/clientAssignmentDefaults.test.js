import { expect, it } from 'vitest';
import { primaryAssignmentProvider, providerOfficeDefaults } from '../clientAssignmentDefaults.js';
it('chooses an active counseling provider rather than a former or unrelated service',()=>{
 expect(primaryAssignmentProvider({provider_id:1},[{service_kind:'counseling',provider_user_id:2,is_active:0},{service_kind:'tutoring',provider_user_id:3,is_active:1},{service_kind:'counseling',provider_user_id:4,is_active:1}])).toBe(4);
});
it('does not use an inactive or another agency’s provider office or billing location',()=>{
 const result=providerOfficeDefaults({agencyId:2,assigned:[{office_location_id:9,is_primary:1,is_active:0},{office_location_id:10,is_primary:1},{office_location_id:11}],offices:[{id:21,physical_office_location_id:9,agency_id:2},{id:22,physical_office_location_id:10,agency_id:3},{id:23,physical_office_location_id:11,agency_id:2}],locations:[{id:31,agency_id:3,billing_office_location_id:23,place_of_service:'11'},{id:32,agency_id:2,billing_office_location_id:23,place_of_service:'11'}]});
 expect(result).toEqual({officeId:'23',pos:'11',serviceLocationId:'32'});
});

it('prefers the client agency billing identity when a provider uses a shared physical building',()=>{
 expect(providerOfficeDefaults({agencyId:2,assigned:[{id:9,isPrimary:true,isActive:true}],offices:[{id:9,agency_id:5,agencyIds:[2,5]},{id:21,physical_office_location_id:9,agency_id:2}],locations:[]})).toEqual({officeId:'21',pos:'11',serviceLocationId:''});
});
