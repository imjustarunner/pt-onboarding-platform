import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({locations:vi.fn(),offices:vi.fn(),officeIds:vi.fn(),schoolIds:vi.fn(),affiliations:vi.fn()}));
vi.mock('../../models/AgencyServiceLocation.model.js',()=>({default:{listByAgency:m.locations}}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{findBillingByAgency:m.offices}}));
vi.mock('../officeBillingSites.service.js',()=>({listUserOfficeIds:m.officeIds,listUserSchoolIds:m.schoolIds}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{listActiveOrganizationsForAgency:m.affiliations}}));
import {assignedNoteLocations} from '../assignedNoteLocations.service.js';
beforeEach(()=>{vi.clearAllMocks();m.locations.mockResolvedValue([]);m.offices.mockResolvedValue([{id:1,name:'Assigned office',is_active:1},{id:2,name:'Other office',is_active:1}]);m.officeIds.mockResolvedValue([1]);m.schoolIds.mockResolvedValue([40,42]);m.affiliations.mockResolvedValue([{id:40,name:'Assigned school',organization_type:'school'},{id:41,name:'Other school',organization_type:'school'},{id:43,name:'Different agency school',organization_type:'school'}]);});
it('offers only assigned offices and schools in the authorized agency without creating billing sites',async()=>{
 const result=await assignedNoteLocations(7,2);
 expect(result.map(item=>item.name)).toEqual(['Assigned office','Assigned school']);
 expect(result[1]).toMatchObject({schoolOrganizationId:40,serviceLocationId:null,placeOfService:'03'});
 expect(m.locations).toHaveBeenCalledWith(2);expect(m.officeIds).toHaveBeenCalledWith(7);expect(m.affiliations).toHaveBeenCalledWith(2);
});
it('keeps a configured school location and excludes generic/unassigned school templates',async()=>{
 m.locations.mockResolvedValue([{id:8,name:'Assigned school',place_of_service:'03',school_organization_id:40,location_kind:'school',is_active:1},{id:9,name:'Other school',place_of_service:'03',school_organization_id:41,is_active:1},{id:10,name:'Generic School',place_of_service:'03',is_active:1}]);
 const result=await assignedNoteLocations(7,2);
 expect(result.filter(item=>item.placeOfService==='03')).toEqual([expect.objectContaining({value:'service:8',schoolOrganizationId:40})]);
});
