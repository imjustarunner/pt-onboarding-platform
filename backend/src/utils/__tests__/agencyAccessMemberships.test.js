import {beforeEach,expect,it,vi} from 'vitest';
const access=vi.hoisted(()=>({accessProfileSchemaReady:vi.fn(async()=>true),listPlatformAccessAgencies:vi.fn(),listLegacyAccessAgencies:vi.fn(async()=>[])}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../services/agencyAccessProfiles.service.js',()=>access);
import User,{invalidateUserAgenciesCache} from '../../models/User.model.js';
beforeEach(()=>{invalidateUserAgenciesCache();vi.restoreAllMocks();vi.spyOn(User,'_getAgenciesUncached').mockResolvedValue([{id:2,name:'Existing employer'}]);});
it('keeps virtual company access current while reusing the employment membership cache',async()=>{
 access.listPlatformAccessAgencies.mockResolvedValue([{id:6,name:'Platform company',is_platform_access_only:1}]);
 expect((await User.getAgencies(500)).map(a=>a.id)).toEqual([2,6]);
 expect((await User.getAgencies(500)).map(a=>a.id)).toEqual([2,6]);
 access.listPlatformAccessAgencies.mockResolvedValue([]);
 expect((await User.getAgencies(500)).map(a=>a.id)).toEqual([2]);
 expect(User._getAgenciesUncached).toHaveBeenCalledTimes(1);
});
it('does not include virtual access in the employment affiliation editor',async()=>{
 access.listPlatformAccessAgencies.mockResolvedValue([{id:6,is_platform_access_only:1}]);
 expect((await User.getAgencies(500,{includeInactive:true})).map(a=>a.id)).toEqual([2]);
});
